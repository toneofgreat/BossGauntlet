/*
	Zone 7: THE END OF CATS (cats 85-100)   OWNER: zone 7 agent
	A white void realm that gets darker and more broken as you walk east: the fake Credits Hall, the
	Button Gallery, the Bridge of Manners, the Quitters' Lounge, the Give Up Gap, the Monday Tower, the
	Rage Quit lights, the 99% Loading Bar, a glitching Server Room, the Temple of Aleph with Hilbert's
	Hotel, the # Wall, the # Maze, a giant # monolith and the AI Core.
	Coordinates are zone-local (z.cf): x east, z south, ground top y = 0. Spawn is at (-185, 0, 0).
	"North" = -z. The MAP board right next to the spawn lists every landmark.

	==================================== SOLUTIONS (QA) ====================================
	EAT MY SHORTS
	85 The Final Cat (hidden, on the Credits Hall stage). The credits say "Best seat in the house: Row 1,
	   Seat (letters in MEOW + 3)" = R1 S7 and "Post-credits scene: sit still 15 seconds". Stand on the
	   cushion of the seat labelled R1 S7 (front row, nearest the screen, south end) without moving for
	   15 s -> the cat appears on the stage. Other seats: "lol no". Stage buttons CLAIM YOUR ENDING /
	   SKIP CREDITS are decoys (CLAIM sends you back to spawn).
	86 Cat But It's The Number 7 (caged, Button Gallery, north-west). Only the real button tells the truth,
	   all others lie. Statements: 1 "The real button is button 7." 2 "The real button has an even number."
	   3 "I am the real button." 4 "The real button's number is lower than 4." 5 "Button 1 AND button 3
	   are both liars." 6 "Button 5 is lying." 7 "The real button is 6 or 7."  Answer: BUTTON 5 (the only
	   consistent choice). Wrong press = 15 s lockout. The giant FREE CAT button is a decoy.
	87 Cat In Enormous Shorts (caged next to the INSULT-O-TRON 3000, north of the Credits Hall). Six decoy
	   cats around the zone each say "lol no" and drop one numbered letter when clicked/touched:
	   #1 S (Credits Hall, row 3 seat 4)  #2 H (on top of server rack 7)  #3 O (Temple of Aleph steps)
	   #4 R (foot of the Give Up Gap stairs)  #5 T (base of the giant # monolith)  #6 S (outside the AI Core).
	   Type SHORTS into the INSULT-O-TRON. Wrong = 10 s lockout.
	88 The Lol No Cat (island in the Bridge of Manners pit, south-west). Rude tiles are fake (no
	   collision), polite tiles are real. Polite path, west to east (rows numbered north->south 1..5):
	   col1 row3 PLEASE, col2 row2 THANK YOU, col3 row2 SORRY, col4 row3 EXCUSE ME, col5 row4 PARDON,
	   col6 row4 AFTER YOU, col7 row3 BLESS YOU, then the island.
	GIVE UP
	89 White Flag Cat (on the Winner's Podium floating above the Give Up Gap). The gap cannot be jumped.
	   Press the GIVE UP button at the top of the stairs 3 times (it sends you to spawn each time), then
	   step on the QUITTER ELEVATOR pad in the Quitters' Lounge (just north of spawn): it lifts Platinum
	   Quitters (3+ give-ups) onto the podium.
	90 A Cat That Is Just The Concept Of Tuesday (top of the Monday Tower, south). Long spiral obby with 6
	   checkpoints (Monday 9AM, Meeting, Lunch, 3PM Slump, Overtime, 11:59PM). Red strips send you back to
	   your checkpoint; the MONDAY EXPRESS pads (tower base + near spawn) return you to your checkpoint.
	   (Layout data + port notes in z7-tower.js: the lunch trays are real moving platforms, the 18-stud
	   truss climb is six 3-stud steps, every gap was checked against jump 50 / gravity 196.2 / walk 16.)
	91 Loading Screen Cat (caged at the 99% Loading Bar, centre-north). 6-step chain, each step only works
	   after the previous one: 1 Loading Bar's empty end -> B; 2 Server Room RACK 3 -> U; 3 Hilbert's Hotel
	   guest book (lobby desk, east end) -> F; 4 top of the giant # monolith (climb the spiral stair on its
	   east side) -> F; 5 AI Core NODE 16 -> E; 6 the beanbag in the Quitters' Lounge -> R. Then at the
	   Loading Bar terminal type BUFFER.
	92 Cat Who Rage Quit (caged by the Rage Quit lights board, centre-south). Lights Out 5x5 (a click flips
	   the light and its up/down/left/right neighbours). Start = big X, target = cat face. A solution
	   (row 1 = top, column 1 = viewer's LEFT, 1 = press): 11100 / 01010 / 10110 / 01110 / 10110
	   (14 presses, order does not matter; any of the board's 4 solutions works). Then pull SUBMIT. RESET restores the X.
	ALEPH NIL
	93 Infinite Cat (caged at the far end of Hilbert's Hotel corridor, north-east). The corridor loops you
	   back to the lobby until you have checked in. Bells: A = guest n moves to n+1, B = n to 2n,
	   C = n to n*n. Required: rooms 1,2,3,4,6,7,8 EMPTY and rooms 5 and 10 OCCUPIED. Unique answer (up
	   to 8 bells): ring A, C, A (n -> (n+1)^2 + 1 fills 5, 10, 17, ...), then CHECK IN at the desk
	   (west end).
	94 Uncountable Cat (caged at Cantor's altar, Temple of Aleph). Rows 89 54 99 29 116 43 78 in 7-bit
	   binary; flip the diagonal: digits 0 0 1 0 0 0 1 = 17. Type 17. Wrong = 30 s lockout.
	95 Mastermeownd (caged at the Mastermind stone, Temple of Aleph). Random 5-peg code from
	   R O Y G B P W (repeats allowed); black = right colour right place, white = right colour wrong place;
	   12 guesses then a new code + 20 s lockout. Solve by deduction.
	!@#$%^&**&^%$#@!
	96 Cat-Shaped Error Message (caged in the Server Room, east side). Type 2 7 1 8 2 on the glitched keypad.
	   Key k types (3*k + digits already typed) mod 10, so press keys 4, 2, 3, 5, 6. Wrong = 10 s lockout.
	97 Glitched Shift-Key Cat (caged in the Server Room, west side). Screen: "@# / !% / !@ / ^ / !* / % /
	   @@ / !%". Shift stuck (! = 1 ... ) = 23 15 12 6 18 5 22 15 = W O L F R E V O, printed backwards
	   -> OVERFLOW. Type OVERFLOW at the terminal. Wrong = 15 s lockout.
	#
	98 # Cat (caged in the hole in the middle of the # Maze, east). Pull the 4 levers at the tips of the
	   # (east tip of the lower bar, south tip of the left bar, north tip of the right bar, west tip of the
	   lower bar), then use the TRAPDOOR in the lower bar right below the hole (middle column). It drops you
	   into the hole and opens the cage. Maze is a perfect maze: hold the right-hand wall.
	99 #NoFilter Cat (caged at the # Wall, east). 9x9 nonogram, clues written as # tallies. Solution
	   (row 1 = top, column 1 = viewer's left, X = filled):
	   .X.....X. / .XX...XX. / .XXXXXXX. / XX.XXX.XX / XXXXXXXXX / XXXX.XXXX / XX.X.X.XX / .XXXXXXX. / X.XXXXX.X
	   (unique). Pull #SUBMIT. #RESET clears it.
	YOU HAVE TO BE AI TO DO THIS
	100 AI Cat (caged on the AI Core dais, far east). Nodes 01-14: x = 7; *2A(16)=294; +1100100(2)=394;
	   x*x=155236; -1750(8)=154236; /4=38559; +XLII=38601; mod 9973=8682; *101(2)=43410; +ZZ(36)=44705;
	   +1000*digitsum(20)=64705; *3=194115; -2222(3)=194035; +4DFF(16)=214002. Node 15: 214002 in base 26
	   = 12,4,14,22 = MEOW (the KEY). Node 16: screen text EUXEPYZQTYRP shifted back by 16 (cats in this
	   zone) = OEHOZIJADIBZ, Vigenere-decrypt with MEOW = CATSNEVEREND. Type CATSNEVEREND at the terminal.
	   Wrong = 30 s lockout. Exactly one answer.

	PORT NOTES. The zone is drawn through z7-kit.js: every static visual is merged into a few
	vertex-coloured meshes, everything that blinks/bobs/spins/changes colour is an instance, all text is
	one atlas. Collision and click/touch/prompt targets are invisible kit parts (no draw calls). The only
	engine-dynamic parts are the five lunch trays (they must carry you). The original's 3-stud temple
	"columns" and pencil-shaped stage buttons (cylinder sizes on the wrong axis) are drawn as intended.
*/

import { createDeco, createInst, createAtlas } from "./z7-kit.js";
import { towerLayout, TOWER, CP_NAMES } from "./z7-tower.js";

export { looks } from "./z7-looks.js";

const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const C = (r, g, b) => "#" + hex2(r) + hex2(g) + hex2(b);
const rgbOf = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lerp = (a, b, t) => a + (b - a) * t;
const lerpC = (a, b, t) => { const A = rgbOf(a), B = rgbOf(b); return C(lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)); };

const WHITE = C(248, 248, 255);
const VOID = C(14, 14, 20);
const CYAN = C(0, 230, 255);
const MAGENTA = C(255, 0, 200);
const GLITCH = C(40, 255, 90);
const GOLD = C(255, 200, 60);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function build(z) {
  const THREE = z.THREE;
  const K = z.K;
  const parts = z.ctx.engine.parts;
  const deco = createDeco(z);
  const inst = createInst(z);
  const atlas = createAtlas(z);
  const customs = [];
  z.onLeave(() => {
    deco.dispose();
    inst.dispose();
    atlas.dispose();
    for (const c of customs) {
      try { parts.remove(c.id); } catch { /* already gone */ }
      K.disposeGroup(c.group);
    }
    customs.length = 0;
  });

  // ------------------------------------------------------------------------------- helpers
  const RAD = Math.PI / 180;
  const M4 = () => new THREE.Matrix4();
  const ROTZ90 = M4().makeRotationZ(Math.PI / 2);
  const ang = (rx, ry, rz) => M4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz, "XYZ"));
  const mul = (a, ...bs) => { const m = a.clone(); for (const b of bs) m.multiply(b); return m; };

  // the original part's look, as deco/instance arguments (cylinder axis = X, ball diameter = min)
  function shapeArgs(shape, size, cf) {
    if (shape === "Ball") { const d = Math.min(size[0], size[1], size[2]); return ["ball", [d, d, d], cf]; }
    if (shape === "Cylinder") { const d = Math.min(size[1], size[2]); return ["cyl", [d, size[0], d], mul(cf, ROTZ90)]; }
    return ["box", size, cf];
  }

  // P = the original ctx.part. o: { shape, decor, collide, neon, transparency, glass, hit, invisible,
  // anim (-> an animated instance), inst (-> a recolourable instance), cf }
  // Returns { h (kit part for collision / interaction, or null), cf, size, ih (instance handle) }.
  function P(size, x, y, zz, color, o = {}, ry = 0) {
    const cf = o.cf || z.cf(x, y, zz, ry);
    const shape = o.shape || "Block";
    const [kind, vs, vm] = shapeArgs(shape, size, cf);
    let ih = null;
    if (o.anim || o.inst) ih = inst.add(kind, vs, vm, color, { neon: o.neon, anim: o.anim, phase: o.phase });
    else if (!o.invisible) deco.add(kind, vs, vm, color, { neon: o.neon, transparency: o.transparency, glass: o.glass });
    const collide = o.decor ? false : o.collide !== false;
    let h = null;
    if (collide || o.hit) h = z.rpart({ Size: size, CFrame: cf, Shape: shape, Transparency: 1, CanCollide: collide });
    return { h, cf, size, ih };
  }
  const D = (size, x, y, zz, color, o = {}, ry = 0) => P(size, x, y, zz, color, { ...o, decor: true }, ry);
  const N = (size, x, y, zz, color, o = {}, ry = 0) => P(size, x, y, zz, color, { ...o, decor: o.collide !== true, neon: true }, ry);

  // text on a face of an original part (Front = -Z)
  function label(r, text, o = {}) {
    return atlas.face(r.cf, r.size, String(o.face || "front").toLowerCase(), text, {
      color: o.color || C(20, 20, 30), both: o.both, font: o.font === "Code" ? "code" : null,
      pps: o.pps || 24, maxPx: o.maxPx || 512,
    });
  }
  // a sign board whose front faces direction ry (0 north, 90 west, -90 east, 180 south)
  function sign(text, x, y, zz, ry, w, h, o = {}) {
    const r = P([w, h, o.thick || 0.6], x, y, zz, o.bg || C(250, 250, 255), { collide: o.collide === true, hit: o.hit }, ry);
    const lines = String(text).split("\n").length;
    r.text = label(r, text, { color: o.color || C(20, 20, 30), font: o.font, both: o.both, pps: o.pps || (lines > 3 ? 40 : 28), maxPx: o.maxPx || (lines > 3 ? 1100 : 600) });
    return r;
  }
  function tp(x, y, zz) {
    z.player.teleport([x, y, zz], 90);
  }
  function locked(key) {
    const left = z.isLocked(key);
    if (left > 0) z.fail(`Locked out. Try again in ${left} s.`);
    return left > 0;
  }
  const done = (n) => z.has(n) || z.isUnlocked(n);
  // Prompts that open a text box wait a moment before firing: the E key fires prompts during its own
  // keydown, so a box opened right there takes focus in time to receive that 'e' as a typed letter
  // ("SHORTS" would arrive as "ESHORTS"). A short hold opens the box on a later tick instead.
  const TYPE_HOLD = 0.15;
  const answer = (raw) => String(raw || "").replace(/\s/g, "");
  const flagN = (k) => Number(z.flag(k) || 0);

  z.heartbeat((dt, t) => inst.tick(dt, t));

  // ------------------------------------------------------------------------------- ground
  // 13 strips west->east, white fading into the void; the Bridge of Manners pit is cut out of 4 strips
  const HOLE = { x0: -135, x1: -15, z0: 85, z1: 185 };
  for (let i = 0; i <= 12; i++) {
    const x0 = -195 + i * 30;
    const t = i / 12;
    const col = lerpC(C(250, 250, 255), C(22, 22, 30), Math.pow(t, 1.3));
    if (x0 >= HOLE.x0 && x0 + 30 <= HOLE.x1) {
      const a = HOLE.z0 + 195, b = 195 - HOLE.z1;
      P([30, 2, a], x0 + 15, -1, -195 + a / 2, col);
      P([30, 2, b], x0 + 15, -1, 195 - b / 2, col);
    } else {
      P([30, 2, 390], x0 + 15, -1, 0, col);
    }
    if (i > 0) {
      const sc = lerpC(C(200, 220, 255), CYAN, t);
      if (x0 >= HOLE.x0 && x0 <= HOLE.x1) {
        N([0.3, 0.06, HOLE.z0 + 195], x0, 0.03, (-195 + HOLE.z0) / 2, sc);
        N([0.3, 0.06, 195 - HOLE.z1], x0, 0.03, (HOLE.z1 + 195) / 2, sc);
      } else {
        N([0.3, 0.06, 390], x0, 0.03, 0, sc);
      }
    }
  }
  // the pit walls, so the cut-out reads as a hole and not as missing floor
  for (const [w, d, x, zz] of [[120, 1, -75, HOLE.z0 + 0.5], [120, 1, -75, HOLE.z1 - 0.5], [1, 100, HOLE.x0 + 0.5, 135], [1, 100, HOLE.x1 - 0.5, 135]]) {
    D([w, 38, d], x, -21, zz, C(205, 210, 230));
  }
  // invisible edge walls (gap behind the spawn so the spawn clearance stays empty)
  const edge = (size, x, zz) => P(size, x, 30, zz, WHITE, { invisible: true });
  edge([390, 60, 0.5], 0, -195.25);
  edge([390, 60, 0.5], 0, 195.25);
  edge([0.5, 60, 390], 195.25, 0);
  edge([0.5, 60, 183], -195.25, -103.5);
  edge([0.5, 60, 165], -195.25, 112.5);

  // main avenue (west part and east part; the Credits Hall sits between)
  for (const [s0, s1] of [[-171, -141], [-66, 140]]) {
    const len = s1 - s0, cx = (s0 + s1) / 2;
    D([len, 0.1, 10], cx, 0.05, 0, C(235, 238, 250));
    N([len, 0.12, 0.4], cx, 0.06, -5.2, CYAN);
    N([len, 0.12, 0.4], cx, 0.06, 5.2, CYAN);
  }

  // ------------------------------------------------------------------------------- spawn area
  for (const zz of [-16, 16]) {
    P([2, 18, 2], -160, 9, zz, WHITE);
    N([2.2, 0.4, 2.2], -160, 17.8, zz, CYAN);
  }
  const archTop = P([2.4, 4, 34], -160, 20, 0, WHITE);
  label(archTop, "THE END OF CATS", { face: "Left", color: C(30, 30, 50), pps: 30 });
  label(archTop, "THE END OF CATS?", { face: "Right", color: C(30, 30, 50), pps: 30 });
  sign(
    "THE END OF CATS - MAP\n(north = left of the arch)\n\nNW: Button Gallery + INSULT-O-TRON\nW: Credits Hall (straight ahead)\nSW: Bridge of Manners\nCENTRE: Loading Bar 99%, Rage Quit Lights, Give Up Gap\nN: Server Room   S: Monday Tower\nNE: Temple of Aleph + Hilbert's Hotel\nE: The # Wall, # Maze, # Monolith, AI Core\nRight here: Quitters' Lounge (north) + Monday Express (south)",
    -168, 6, -24, 90, 12, 11, { bg: C(240, 244, 255), pps: 64, maxPx: 900 },
  );
  P([0.6, 1, 0.6], -168, 0.5, -24, C(180, 180, 200));

  // ------------------------------------------------------------------------------- glitch decor
  const drng = mulberry32(77);
  const rn = (a, b) => a + (b - a) * drng();
  const PICK = [WHITE, CYAN, MAGENTA, GLITCH, VOID];
  for (let i = 1; i <= 46; i++) {
    const x = rn(-120, 185), zz = rn(-185, 185);
    const t = (x + 120) / 310;
    const sz = rn(1, 2 + t * 5);
    const y = rn(14, 50 + t * 40);
    let col = PICK[(i % PICK.length)];
    if (t < 0.3) col = i % 2 === 0 ? WHITE : C(220, 230, 255);
    const anim = i % 3 === 0 ? { kind: "spin", axis: "y", speed: 20 + i }
      : i % 3 === 1 ? { kind: "bob", amp: 1 + t * 2, period: 3 + (i % 4) }
        : { kind: "blink", period: 0.6 + (i % 5) * 0.3 };
    P([sz, sz, sz], x, y, zz, col, { decor: true, neon: col !== VOID, anim, phase: i * 0.37 }, rn(0, 90));
  }
  for (let i = 1; i <= 14; i++) {
    const x = rn(20, 185), zz = rn(-60, 60);
    N([rn(6, 20), 0.08, 0.5], x, 0.04, zz, i % 2 === 0 ? MAGENTA : VOID, {}, rn(0, 180));
  }
  // lamp posts along the avenue (white orbs in the west, glitchy colours in the east)
  [-150, -60, -35, -10, 15, 40, 65, 90, 115].forEach((x, k) => {
    const i = k + 1;
    const t = (x + 150) / 265;
    for (const zz of [-8, 8]) {
      P([0.6, 9, 0.6], x, 4.5, zz, lerpC(C(235, 235, 245), C(40, 40, 50), t));
      const col = i < 4 ? WHITE : ((i + (zz > 0 ? 1 : 0)) % 2 === 0 ? CYAN : MAGENTA);
      N([1.6, 1.6, 1.6], x, 9.6, zz, col, { shape: "Ball", anim: i >= 6 ? { kind: "blink", period: 0.4 + i * 0.13 } : null });
    }
  });
  // broken chunks of floor drifting up into the void (east)
  for (let i = 1; i <= 16; i++) {
    const x = rn(60, 180);
    const zz = i % 2 === 0 ? rn(-90, -45) : rn(160, 185);
    const w = rn(4, 10);
    const cf = mul(z.cf(x, rn(20, 70), zz, rn(0, 360)), ang(rn(-25, 25) * RAD, 0, rn(-25, 25) * RAD));
    D([w, 1.2, w * rn(0.6, 1.2)], 0, 0, 0, lerpC(C(70, 70, 85), VOID, i / 16), { cf, anim: { kind: "bob", amp: 1.5, period: 4 + (i % 5) }, phase: i * 0.21 });
  }
  // floating error pop-ups in the far east (the board, its title bar and its text bob together)
  const popups = [];
  ["ERROR: CAT OVERFLOW", "404: ENDING NOT FOUND", "SEGFAULT (MEOW)", "UNEXPECTED CAT AT LINE 100", "NULL CAT EXCEPTION", "TOO MANY CATS (100/100)"].forEach((txt, k) => {
    const i = k + 1;
    const x = 40 + i * 22, zz = i % 2 === 0 ? -60 : i === 3 ? -35 : 30, y = 34 + (i % 3) * 8;
    const board = P([12, 3, 0.6], x, y, zz, C(10, 20, 120), { decor: true, inst: true }, 90);
    const text = label(board, txt, { color: WHITE, font: "Code", both: true, pps: 30 });
    const bar = N([0.7, 0.6, 12], x, y + 1.8, zz, C(40, 90, 220), { inst: true });
    popups.push({ board, text, bar, base: board.cf.clone(), barBase: bar.cf.clone(), period: 5 + i });
  });
  z.heartbeat((dt, t) => {
    for (const p of popups) {
      const dy = Math.sin((t / p.period) * Math.PI * 2) * 2;
      const m = p.base.clone(); m.elements[13] += dy;
      const mb = p.barBase.clone(); mb.elements[13] += dy;
      p.board.ih.setMatrix(m);
      p.bar.ih.setMatrix(mb);
      for (const it of p.text) atlas.follow(it, m);
    }
  });

  // ------------------------------------------------------------------------------- decoy cats (#87)
  const DECOY_LETTERS = ["S", "H", "O", "R", "T", "S"];
  const decoySpots = [
    [-110, 1.2, -2.2, -90], // credits hall row 3 seat 4
    [-40, 10, -115, 180], // on top of rack 7
    [130, 1, -98, 180], // temple steps
    [-6, 0, 82, -90], // foot of the give up stairs
    [165, 0, 64, 180], // base of the monolith
    [140, 0, 12, -90], // outside the AI core
  ];
  const decoyLooks = [
    { color: C(245, 150, 60), pattern: "stripes", color2: C(200, 100, 30), eyes: "derp", mouth: "w" },
    { color: C(60, 60, 70), eyes: "big", mouth: "smile", bodyShape: "loaf" },
    { color: C(250, 250, 250), pattern: "spots", color2: C(40, 40, 40), eyes: "sleepy", mouth: "o" },
    { color: C(130, 85, 50), pattern: "tuxedo", eyes: "normal", mouth: "teeth", bodyShape: "round" },
    { color: C(150, 150, 160), pattern: "stripes", color2: C(90, 90, 100), eyes: "angry", mouth: "frown" },
    { color: C(250, 220, 170), pattern: "calico", color2: C(230, 120, 40), color3: C(40, 40, 40), eyes: "closed", mouth: "smile" },
  ];
  decoySpots.forEach((s, k) => {
    const i = k + 1;
    let group = null;
    try {
      const c = K.cat({ name: "DecoyCat" + i, innerEars: false, whiskers: false, ...decoyLooks[k] });
      group = K.finish(c.model);
    } catch (err) {
      console.warn("[cats] zone 7 decoy look", i, err && err.message ? err.message : err);
    }
    const size = group ? [group.userData.size.x, group.userData.size.y, group.userData.size.z] : [3, 3, 4];
    const cy = s[1] + size[1] / 2 + 0.6;
    if (group) {
      const m = z.cf(s[0], cy, s[2], s[3]);
      group.position.setFromMatrixPosition(m);
      group.quaternion.setFromRotationMatrix(m);
      customs.push({ group, id: parts.addCustom(group) });
    }
    const d = Math.max(size[0], size[2]) + 1.2;
    N([0.15, d, d], 0, 0, 0, C(255, 225, 80), { shape: "Cylinder", transparency: 0.35, cf: mul(z.cf(s[0], s[1] + 0.15, s[2]), ROTZ90) });
    const hb = P([size[0] + 1, size[1] + 1, size[2] + 1], s[0], cy, s[2], WHITE, { invisible: true, collide: false, hit: true });
    const troll = () => z.fail(`lol no. That's DECOY #${i} of 6. It drops a crumpled note with the letter '${DECOY_LETTERS[k]}' on it.`);
    z.click(hb.h, troll, { distance: 30 });
    z.touch(hb.h, troll, { cooldown: 3 });
  });

  // ------------------------------------------------------------------------------- 85 CREDITS HALL
  {
    const cream = C(250, 246, 235), red = C(170, 20, 40);
    P([70, 22, 1], -105, 11, -30.5, cream);
    P([70, 22, 1], -105, 11, 30.5, cream);
    P([1, 22, 62], -69.5, 11, 0, cream);
    P([1, 22, 24], -140.5, 11, -19, cream);
    P([1, 22, 24], -140.5, 11, 19, cream);
    P([1, 8, 14], -140.5, 18, 0, cream);
    for (const zz of [-30, 30]) N([70, 0.5, 1.4], -105, 22.2, zz, GOLD);
    N([1.4, 0.5, 62], -69.5, 22.2, 0, GOLD);
    const marquee = P([1, 4, 16], -141.2, 16, 0, C(30, 20, 30), { decor: true });
    label(marquee, "NOW SHOWING: THE END (THE CREDITS)", { face: "Left", color: GOLD, pps: 30 });
    D([68, 0.1, 6], -105, 0.05, 0, red);
    const screen = P([44, 17, 1], -72, 12.5, 0, C(18, 18, 26), {}, 90);
    label(screen,
      "THE END OF CATS\nThank you for playing!\n\nDirected by .......... A Cat\nWritten by .......... A Different Cat\nLighting .......... A Lamp (secretly a cat)\nCatering .......... Tuna\nKey Grip .......... Mittens (has claws)\nBest Seat In The House .......... Row 1, Seat (letters in MEOW + 3)\nPost-credits scene: sit still in the best seat for 15 seconds. No fidgeting.\nNO REFUNDS.",
      { color: C(255, 245, 210), pps: 40, maxPx: 1800 });
    for (const zz of [-23, 23]) P([2, 22, 2], -72, 11, zz, red);
    P([10, 3, 46], -78, 1.5, 0, C(90, 60, 40));
    N([10.2, 0.3, 46.2], -78, 3.05, 0, GOLD, { transparency: 0.5 });
    // decoy stage buttons
    const claim = N([1, 2.5, 2.5], 0, 0, 0, GOLD, { shape: "Cylinder", collide: true, cf: mul(z.cf(-80, 3.5, 14), ROTZ90) });
    sign("CLAIM YOUR ENDING", -80, 6.5, 14, 90, 6, 2, { bg: GOLD });
    z.click(claim.h, () => {
      z.fail("lol no. There is no ending. Back to the start with you.");
      z.respawn();
    });
    const skip = N([1, 2.5, 2.5], 0, 0, 0, C(120, 120, 140), { shape: "Cylinder", collide: true, cf: mul(z.cf(-80, 3.5, -14), ROTZ90) });
    sign("SKIP CREDITS", -80, 6.5, -14, 90, 6, 2, { bg: C(200, 200, 215) });
    z.click(skip.h, () => z.fail("You can't skip the credits. lol no. Read them. ALL of them."));
    // seats: rows 1..3 (row 1 nearest the screen), seats 1..7 north -> south
    const seats = [];
    for (let r = 1; r <= 3; r++) {
      const x = -92 - (r - 1) * 9;
      for (let s = 1; s <= 7; s++) {
        const zz = -16 + (s - 1) * 4.6;
        P([3.6, 1.2, 3.6], x, 0.6, zz, red);
        const back = P([3.6, 3.4, 0.6], x - 2.1, 1.7, zz, red, {}, 90);
        label(back, `R${r} S${s}`, { face: "Front", color: GOLD, pps: 30 });
        seats.push({ r, s, pos: [x, 1.2, zz] });
      }
    }
    z.cat(85, [-78, 3, 0], { hidden: true });
    let sitting = null;
    let acc = 0;
    z.heartbeat((dt) => {
      acc += dt;
      if (acc < 0.25) return;
      const step = acc;
      acc = 0;
      const p = z.player.pos();
      let seat = null;
      for (const st of seats) {
        const dx = p[0] - st.pos[0], dy = p[1] - st.pos[1], dz = p[2] - st.pos[2];
        if (Math.abs(dx) <= 1.9 && Math.abs(dz) <= 1.9 && dy >= -0.5 && dy <= 5) { seat = st; break; }
      }
      const cur = sitting;
      if (!seat) { sitting = null; return; }
      if (!cur || cur.seat !== seat || Math.hypot(p[0] - cur.pos[0], p[1] - cur.pos[1], p[2] - cur.pos[2]) > 0.8) {
        sitting = { seat, t: 0, pos: p };
        return;
      }
      cur.t += step;
      if (!cur.hinted && cur.t >= 5) {
        cur.hinted = true;
        z.notify("Shh... the credits are still rolling...");
      }
      if (!cur.done && cur.t >= 15) {
        cur.done = true;
        if (seat.r === 1 && seat.s === 7) {
          if (!z.has(85)) {
            z.reveal(85);
            z.notify("POST-CREDITS SCENE! Someone just walked onto the stage...");
            z.tone(1.6);
          }
        } else {
          z.fail(`lol no. R${seat.r} S${seat.s} is NOT the best seat in the house. Eat my shorts.`);
        }
      }
    });
    z.onLeave(() => { sitting = null; });
  }

  // ------------------------------------------------------------------------------- 87 INSULT-O-TRON
  {
    const INSULTS = ["you damp sock", "you overcooked noodle", "you sentient potato", "you soggy cereal", "you lost left shoe", "you wet biscuit", "you expired coupon"];
    let ii = 0;
    const insult = () => { ii = (ii % INSULTS.length) + 1; return INSULTS[ii - 1]; };
    P([10, 1, 8], -105, 0.5, -50, C(40, 40, 50));
    const tron = P([5, 7, 3], -107, 4.5, -50, C(60, 60, 75));
    const face = D([4, 3.5, 0.2], -107, 5.5, -48.4, C(10, 30, 10), {}, 180);
    label(face, "INSULT-O-TRON 3000\n\nSix DECOY cats are hiding around this zone, each one holding a numbered letter. Bring me the word, you sentient sock.\n\n(click me)", { color: GLITCH, font: "Code", pps: 60, maxPx: 600 });
    N([0.4, 2, 0.4], -105.5, 9, -50, C(255, 50, 50), { anim: { kind: "blink", period: 0.8 } });
    z.cat(87, [-97, 0, -50], { locked: true });
    z.click(tron.h, () => {
      if (done(87)) return z.notify("INSULT-O-TRON: You already have the shorts cat. Go away, " + insult() + ".");
      if (locked("tron")) return;
      z.input({ title: "INSULT-O-TRON 3000", hint: "Type the decoy word, " + insult(), kind: "text", max: 10 }, (text) => {
        if (answer(text) === "SHORTS") {
          z.unlock(87);
          z.notify("INSULT-O-TRON: ...Fine. FINE. The cage is open. I hope it sheds on you.");
          z.sound("action_get_up.mp3");
        } else {
          z.lockout(10, "tron");
          z.fail("INSULT-O-TRON: Wrong, " + insult() + ". Locked out for 10 s.");
          z.sound("ouch.ogg");
        }
      });
    }, { distance: 20 });
  }

  // ------------------------------------------------------------------------------- 86 BUTTON GALLERY
  {
    const wall = C(255, 245, 200);
    P([66, 16, 1], -120, 8, -161, wall);
    P([1, 16, 50], -153, 8, -136, wall);
    P([1, 16, 50], -87, 8, -136, wall);
    N([66, 0.6, 1.2], -120, 16.2, -161, GOLD);
    sign("THE BUTTON GALLERY\nExactly ONE button is real. The real button tells the TRUTH.\nEvery other button LIES.\nPress the real one. Wrong presses lock you out for 15 s.",
      -120, 11, -160.2, 180, 40, 7, { bg: C(255, 230, 120), pps: 30, maxPx: 1400 });
    const STATEMENTS = [
      "The real button is button 7.",
      "The real button has an even number.",
      "I am the real button.",
      "The real button's number is lower than 4.",
      "Button 1 AND button 3 are both liars.",
      "Button 5 is lying.",
      "The real button is 6 or 7.",
    ];
    const REAL = 5;
    for (let i = 1; i <= 7; i++) {
      const x = -147 + (i - 1) * 9;
      P([3.4, 3.5, 3.4], x, 1.75, -128, C(240, 240, 245));
      const b = N([1, 2.4, 2.4], 0, 0, 0, C(230, 40, 50), { shape: "Cylinder", collide: true, cf: mul(z.cf(x, 4, -128), ROTZ90) });
      sign(`BUTTON ${i}\n"${STATEMENTS[i - 1]}"`, x, 8.5, -129.5, 180, 8, 4, { bg: C(255, 255, 255), pps: 40, maxPx: 400 });
      z.click(b.h, () => {
        if (done(86)) return z.notify("You already found the truth. It was button 5. Rude, right?");
        if (locked("gallery")) return;
        if (i === REAL) {
          z.unlock(86);
          z.notify("BUTTON 5 WAS TELLING THE TRUTH! The cage opens. The cat is still a 7 though.");
          z.tone(1.8);
        } else {
          z.lockout(15, "gallery");
          z.fail(`lol no. Button ${i} was lying. Locked out for 15 s.`);
          z.sound("oof.ogg");
        }
      });
    }
    z.cat(86, [-120, 0, -146], { locked: true });
    const free = N([2, 7, 7], 0, 0, 0, C(255, 60, 160), { shape: "Cylinder", collide: true, cf: mul(z.cf(-98, 1, -106), ROTZ90) });
    sign("PRESS FOR FREE CAT!!!", -98, 6, -106, 180, 9, 3, { bg: C(255, 200, 230) });
    z.click(free.h, () => {
      z.fail("EAT MY SHORTS. There is no free cat. There never was.");
      z.sound("ouch.ogg");
    });
  }

  // ------------------------------------------------------------------------------- 88 BRIDGE OF MANNERS
  {
    const PATH = [3, 2, 2, 3, 4, 4, 3];
    const POLITE = ["PLEASE", "THANK YOU", "SORRY", "EXCUSE ME", "PARDON", "AFTER YOU", "BLESS YOU"];
    const RUDE = ["LOL NO", "NOOB", "L", "BOZO", "COPE", "RATIO", "GET GOOD", "SKILL ISSUE", "CRY", "EZ", "YAWN", "TRASH", "GG EZ", "SIT DOWN"];
    let ri = 0;
    for (let c = 1; c <= 7; c++) {
      const x = -128 + (c - 1) * 9;
      for (let r = 1; r <= 5; r++) {
        const zz = 117 + (r - 1) * 9;
        const polite = PATH[c - 1] === r;
        const t = P([6, 1, 6], x, -0.5, zz, C(245, 245, 255), { collide: polite }, -90); // -90: the words read upright walking east
        let word;
        if (polite) word = POLITE[c - 1];
        else { ri = (ri % RUDE.length) + 1; word = RUDE[ri - 1]; }
        label(t, word, { face: "Top", color: C(40, 40, 60), pps: 30 });
      }
    }
    P([12, 1, 12], -64, -0.5, 135, C(255, 250, 220));
    N([12.4, 0.2, 12.4], -64, -1.1, 135, C(150, 230, 70));
    z.cat(88, z.cf(-64, 0, 135, 90));
    const pit = N([120, 1, 100], -75, -40, 135, C(255, 40, 40), { transparency: 0.3, collide: false, hit: true });
    z.kill(pit.h);
    label(pit, "lol", { face: "Top", color: C(255, 255, 255), pps: 4 });
    sign("THE BRIDGE OF MANNERS\nRude tiles are not real. Polite tiles are.\nMind your manners.\n(The Lol No Cat is on the island. lol no.)",
      -139, 5, 125, 90, 12, 6, { bg: C(235, 255, 220) });
    P([0.6, 2, 0.6], -139, 1, 125, C(150, 150, 170));
  }

  // ------------------------------------------------------------------------------- 91 chain fragments
  const FRAG = ["B", "U", "F", "F", "E", "R"];
  const NEXT = [
    "Next fragment: where errors are born. Find RACK 3.",
    "Next fragment: where infinitely many guests sign in. Read the GUEST BOOK.",
    "Next fragment: on TOP of the biggest # in the world. (A spiral stair winds up its back.)",
    "Next fragment: the AI's sixteenth thought. Find NODE 16.",
    "Next fragment: where quitters relax. Check under the BEANBAG.",
    "That was the last one! Go back to the Loading Bar and type the missing 1%.",
  ];
  function chainPrompt(h, step, text, distance = 12) {
    z.prompt(h, text || "Inspect", () => {
      const have = flagN("chain");
      if (have >= step) return z.notify(`Fragment ${step}/6 is '${FRAG[step - 1]}'. ${NEXT[step - 1]}`);
      if (have < step - 1) return z.fail(`This fragment hasn't loaded yet... (you need fragment ${have + 1} first)`);
      z.flag("chain", step);
      z.notify(`LOADED FRAGMENT ${step}/6: '${FRAG[step - 1]}'. ${NEXT[step - 1]}`);
      z.tone(1 + step * 0.15);
    }, { hold: 0.5, distance });
  }

  // ------------------------------------------------------------------------------- 89 QUITTERS' LOUNGE + GIVE UP GAP
  {
    const purple = C(140, 90, 200);
    P([16, 0.4, 14], -165, 0.2, -55, C(90, 60, 120));
    P([16, 10, 1], -165, 5, -62.5, purple);
    P([1, 10, 14], -173.5, 5, -55, purple);
    P([1, 10, 14], -156.5, 5, -55, purple);
    P([18, 1, 16], -165, 10.5, -55, C(110, 70, 160));
    sign("QUITTERS' LOUNGE", -165, 12.5, -47.6, 180, 14, 3, { bg: C(200, 160, 255) });
    sign("QUITTERS' LOUNGE - MEMBERS ONLY\nThe QUITTER ELEVATOR only lifts PLATINUM QUITTERS:\npeople who pressed a GIVE UP button at least 3 times.\nWinners never quit. Quitters get beanbags.",
      -165, 6, -61.9, 180, 13, 5, { bg: C(240, 225, 255) });
    const beanbag = P([4, 2.6, 4], 0, 0, 0, C(255, 120, 60), { shape: "Ball", hit: true, cf: z.cf(-170, 1.5, -57) });
    P([3.6, 2.4, 3.6], -169, 1.4, -51, C(80, 200, 255), { shape: "Ball" });
    chainPrompt(beanbag.h, 6, "Look under the beanbag", 8);
    const pad = N([5, 0.4, 5], -160, 0.5, -57, purple, { collide: true });
    sign("QUITTER ELEVATOR", -160, 4, -60.5, 180, 5, 1.5, { bg: purple, color: WHITE });
    z.touch(pad.h, () => {
      const n = flagN("quit");
      if (n >= 3) {
        tp(55, 41, 68);
        z.notify("Welcome, Platinum Quitter. Going UP. Way up.");
        z.sound("action_jump.mp3");
      } else {
        z.fail(`Members only! Platinum Quitters must have given up at least 3 times. You: ${n}.`);
      }
    }, { cooldown: 2 });

    // the gap: stairs up to platform A, impossible jump to platform B
    const stone = C(200, 205, 220);
    for (let i = 1; i <= 8; i++) P([3, 3 * i, 10], -1.5 + 3 * i, 1.5 * i, 68, stone);
    P([12, 24, 16], 30, 12, 68, stone);
    N([12.2, 0.3, 16.2], 30, 24.05, 68, C(85, 95, 110));
    P([10, 24, 16], 85, 12, 68, stone);
    sign("lol you can't get here", 85, 27, 68, 90, 8, 2.5, { bg: C(255, 255, 255) });
    P([8, 1, 8], 58, 40, 68, C(255, 255, 255));
    N([8.4, 0.3, 8.4], 58, 39.4, 68, GOLD);
    z.cat(89, z.cf(58, 40.5, 68, 90));
    sign("THE UNBEATABLE GAP\nWinners never quit.\nQuitters never win.\n...or do they?", 26, 29, 61, 90, 7, 5, { bg: C(225, 230, 240) });
    const gb = N([1.2, 3, 3], 0, 0, 0, C(255, 255, 255), { shape: "Cylinder", collide: true, cf: mul(z.cf(33, 24.6, 74), ROTZ90) });
    sign("GIVE UP", 33, 27.5, 74, 90, 4, 1.5, { bg: C(85, 95, 110), color: WHITE });
    z.click(gb.h, () => {
      const n = flagN("quit") + 1;
      z.flag("quit", n);
      z.notify(`You gave up. (x${n}) Shameful. The Quitters' Lounge by the spawn has been informed.`);
      z.respawn();
    });
  }

  // ------------------------------------------------------------------------------- 90 MONDAY TOWER
  {
    const { CX, CZ } = TOWER;
    const cpPos = [];
    const toCheckpoint = () => {
      const p = cpPos[flagN("cp")];
      if (p) tp(p[0], p[1] + 0.5, p[2]);
      else z.respawn();
    };
    const tuesday = C(80, 160, 255);
    const { items, topY } = towerLayout();
    for (const it of items) {
      const cy = it.y - it.size[1] / 2;
      if (it.kind === "checkpoint") {
        const i = it.cp;
        const p = P(it.size, it.x, cy, it.z, C(255, 255, 255), {}, it.ry);
        N([8.2, 0.2, 8.2], it.x, it.y - 1.05, it.z, CYAN, {}, it.ry);
        sign(CP_NAMES[i - 1], it.x, it.y + 4, it.z, -90 - it.theta, 7, 2, { bg: C(255, 255, 255), both: true });
        cpPos[i] = [it.x, it.y, it.z];
        z.touch(p.h, () => {
          if (flagN("cp") < i) {
            z.flag("cp", i);
            z.notify(`CHECKPOINT ${i}/6: ${CP_NAMES[i - 1]}`);
            z.tone(1 + i * 0.12);
          }
        });
      } else if (it.kind === "tray") {
        const a = z.pos(it.x, cy, it.z);
        const b = z.pos(it.x + it.offset[0], cy, it.z + it.offset[2]);
        z.part({
          shape: "box", size: it.size, cf: z.cf(it.x, cy, it.z, it.ry), color: C(255, 220, 120),
          behaviors: [{ type: "movingPlatform", waypoints: [a, b], speed: 2.4, pauseS: 0.5 }],
        });
      } else if (it.kind === "strip" || it.kind === "laser") {
        const hz = N(it.size, it.x, cy, it.z, C(255, 40, 60), { collide: it.kind === "strip", hit: true }, it.ry);
        z.touch(hz.h, toCheckpoint, { cooldown: 1 });
      } else {
        const col = it.kind === "tuesday" || it.kind === "ledge" ? tuesday : it.size[0] < 2 ? C(200, 200, 220) : C(230, 230, 240);
        P(it.size, it.x, cy, it.z, col, {}, it.ry);
      }
    }
    // the central pillar = Monday; its top = TUESDAY
    P([topY, 28, 28], 0, 0, 0, C(60, 70, 110), { shape: "Cylinder", cf: mul(z.cf(CX, topY / 2, CZ), ROTZ90) });
    for (let i = 1; i <= 6; i++) N([0.6, 28.4, 28.4], 0, 0, 0, C(120, 140, 220), { shape: "Cylinder", cf: mul(z.cf(CX, topY * i / 7, CZ), ROTZ90) });
    N([0.6, 29, 29], 0, 0, 0, tuesday, { shape: "Cylinder", cf: mul(z.cf(CX, topY + 0.1, CZ), ROTZ90) });
    const ts = P([16, 4, 0.6], CX, topY + 9, CZ - 6, tuesday, { decor: true, anim: { kind: "rainbow", period: 6 } });
    label(ts, "TUESDAY", { color: WHITE, both: true, pps: 30 });
    z.cat(90, [CX, topY + 0.4, CZ], { scale: 1.2 });
    sign("THE MONDAY TOWER\nThe whole tower is Monday. Tuesday is at the top.\nRed = back to your checkpoint.\nFell off? Use a MONDAY EXPRESS pad.", 28, 5, 150, 90, 11, 5, { bg: C(220, 230, 255) });
    for (const [sx, sz] of [[26, 136], [-165, 45]]) {
      const pad = N([6, 0.4, 6], sx, 0.2, sz, CYAN, { collide: true });
      sign("MONDAY EXPRESS\n(back to your checkpoint)", sx, 4.5, sz - 3.5, 0, 7, 2.5, { bg: WHITE });
      z.touch(pad.h, () => {
        if (flagN("cp") === 0) return z.fail("No checkpoint yet. Start at the bottom of the Monday Tower (south).");
        toCheckpoint();
      }, { cooldown: 2 });
    }
  }

  // ------------------------------------------------------------------------------- 92 RAGE QUIT LIGHTS
  {
    const START = ["X...X", ".X.X.", "..X..", ".X.X.", "X...X"];
    const TARGET = ["X...X", "XX.XX", "X...X", "XXXXX", ".XXX."];
    const ON = C(255, 140, 40), OFF = C(45, 45, 55);
    const state = [], tiles = [];
    const idx = (c, r) => (r - 1) * 5 + c;
    const paint = (i) => tiles[i].ih.setColor(state[i] ? ON : OFF);
    const reset = () => {
      for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) {
        state[idx(c, r)] = START[r - 1][c - 1] === "X";
        if (tiles[idx(c, r)]) paint(idx(c, r));
      }
    };
    P([18, 18, 1], -30, 9, 45.8, VOID);
    sign("RAGE QUIT RECOVERY CENTER\nClicking a light flips it AND its up/down/left/right neighbours.\nMake the board look like the TARGET, then pull SUBMIT.", -30, 21, 45.8, 0, 22, 5, { bg: C(255, 230, 210) });
    reset();
    // column 1 = viewer's left (viewer looks south, so left = +x)
    for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) {
      const i = idx(c, r);
      const t = P([2.8, 2.8, 0.5], -30 + (3 - c) * 3, 3 + (5 - r) * 3 + 0.5, 45.1, state[i] ? ON : OFF, { neon: true, inst: true, collide: false, hit: true });
      tiles[i] = t;
      z.click(t.h, () => {
        for (const [dc, dr] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const cc = c + dc, rr = r + dr;
          if (cc >= 1 && cc <= 5 && rr >= 1 && rr <= 5) { const j = idx(cc, rr); state[j] = !state[j]; paint(j); }
        }
        z.tone(0.8 + (c + r) * 0.08, { volume: 0.4 });
      }, { distance: 30 });
    }
    P([9, 11, 0.6], -12, 7, 45.8, C(250, 250, 255));
    sign("TARGET", -12, 13.5, 45.4, 0, 8, 1.6, { bg: C(250, 250, 255) });
    for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) {
      const on = TARGET[r - 1][c - 1] === "X";
      D([1.4, 1.4, 0.3], -12 + (3 - c) * 1.6, 3.6 + (5 - r) * 1.6, 45.4, on ? ON : OFF, { neon: on });
    }
    z.cat(92, [-48, 0, 38], { locked: true });
    const resetB = N([2, 2, 2], -38, 1, 38, C(80, 160, 255), { collide: true });
    sign("RESET", -38, 3.5, 38, 0, 3, 1.2, { bg: C(200, 225, 255) });
    z.click(resetB.h, () => { reset(); z.notify("Board reset to the big X. Breathe in. Breathe out."); });
    const submit = N([1, 4, 1], -22, 2, 38, C(60, 220, 90), { collide: true });
    sign("SUBMIT", -22, 5, 38, 0, 3, 1.2, { bg: C(210, 255, 220) });
    z.click(submit.h, () => {
      for (let r = 1; r <= 5; r++) for (let c = 1; c <= 5; c++) {
        if (state[idx(c, r)] !== (TARGET[r - 1][c - 1] === "X")) return z.fail(`Nope. Row ${r} doesn't match yet. (Rows count from the top.)`);
      }
      z.unlock(92);
      reset();
      z.notify("The board looks like a cat! The Cat Who Rage Quit calms down. Its cage opens.");
      z.sound("action_get_up.mp3");
    });
  }

  // ------------------------------------------------------------------------------- 91 LOADING BAR
  {
    const bx = -30, bz = -40;
    P([42, 6, 3], bx, 8, bz, WHITE);
    N([39.2 * 0.99, 4, 3.2], bx - 39.2 * 0.005, 8, bz, C(60, 230, 90), { anim: { kind: "blink", period: 2.5 } });
    const empty = P([0.6, 4, 3.3], bx + 19.4, 8, bz, VOID, { hit: true });
    for (const x of [bx - 19, bx + 19]) P([2, 5, 2], x, 2.5, bz, C(200, 200, 215));
    const lbl = D([30, 4, 0.5], bx, 14, bz, WHITE);
    label(lbl, "LOADING... 99%", { face: "Back", color: C(30, 30, 40), pps: 30 });
    label(lbl, "LOADING... 99%", { face: "Front", color: C(30, 30, 40), pps: 30 });
    sign("LOADING SCREEN CAT is stuck at 99%.\nThe last 1% shattered into 6 FRAGMENTS around the zone. Each fragment tells you where the next one is.\nStart: inspect the empty end of the bar. Then type the 6 letters here.",
      bx - 6, 3, bz + 4, 180, 16, 5, { bg: C(225, 255, 230) });
    z.cat(91, [bx + 8, 0, bz + 6], { locked: true });
    chainPrompt(empty.h, 1, "Inspect the missing 1%", 9);
    const term = P([3, 4, 2], bx + 14, 2, bz + 6, C(50, 50, 60));
    const tl = D([2.6, 2, 0.2], bx + 14, 3, bz + 7.05, C(10, 30, 10), {}, 180);
    label(tl, "TYPE THE MISSING 1%", { color: C(120, 255, 140), font: "Code", pps: 40 });
    z.prompt(term.h, "Type the missing 1%", () => {
      if (done(91)) return z.notify("100%! Already loaded.");
      const have = flagN("chain");
      if (have < 6) return z.fail(`Still loading... fragments found: ${have}/6`);
      if (locked("load")) return;
      z.input({ title: "LOADING... 99%", hint: "The 6 fragments, in order", kind: "text", max: 8 }, (text) => {
        if (answer(text) === "BUFFER") {
          z.unlock(91);
          z.notify("LOADING... 100%!!! The cage opens. (It took 17 years.)");
          z.sound("action_get_up.mp3");
        } else {
          z.lockout(5, "load");
          z.fail("That's not it. Loading failed. Retrying in 5 s...");
        }
      });
    }, { distance: 8, hold: TYPE_HOLD });
  }

  // ------------------------------------------------------------------------------- 96/97 SERVER ROOM
  {
    const navy = C(18, 22, 40);
    const X0 = -50, X1 = 50, Z0 = -190, Z1 = -90, H = 18;
    D([100, 0.2, 100], 0, 0.1, -140, C(30, 34, 52));
    P([100, H, 1], 0, H / 2, Z0, navy);
    P([47, H, 1], -26.5, H / 2, Z1, navy);
    P([47, H, 1], 26.5, H / 2, Z1, navy);
    P([6, H - 10, 1], 0, 10 + (H - 10) / 2, Z1, navy);
    P([1, H, 100], X0, H / 2, -140, navy);
    P([1, H, 100], X1, H / 2, -140, navy);
    P([102, 1, 102], 0, H + 0.5, -140, C(12, 14, 26));
    sign("SERVER ROOM\n(do not feed the servers)", 0, 13.5, Z1 + 0.8, 180, 16, 3, { bg: C(30, 40, 80), color: GLITCH });
    sign("SERVER ROOM\n(do not feed the servers)", 0, 13.5, Z1 - 0.8, 0, 16, 3, { bg: C(30, 40, 80), color: GLITCH });
    for (const x of [-30, 0, 30]) N([2, 0.3, 80], x, H - 0.2, -140, C(140, 170, 255));
    const racks = [];
    for (let i = 1; i <= 12; i++) {
      const row = i <= 6 ? 0 : 1;
      const x = -40 + ((i - 1) % 6) * 16;
      const zz = row === 0 ? -165 : -115;
      racks[i] = P([5, 10, 3], x, 5, zz, C(25, 25, 32));
      const face = row === 0 ? 180 : 0;
      const fz = row === 0 ? zz + 1.6 : zz - 1.6;
      sign("RACK " + i, x, 9, fz, face, 4, 1.2, { bg: C(40, 40, 60), color: WHITE });
      for (let k = 1; k <= 2; k++) {
        N([3.6, 0.25, 0.1], x, 2.5 + k * 2.2, fz, (k + i) % 3 === 0 ? C(255, 60, 60) : GLITCH, { anim: { kind: "blink", period: 0.3 + ((i * 7 + k * 3) % 10) / 10 } }, face);
      }
    }
    chainPrompt(racks[3].h, 2, "Read the error log");
    P([3, 3, 3], -40, 1.5, -119.5, C(120, 90, 60));
    P([3, 6, 3], -44, 3, -119.5, C(120, 90, 60));

    // 96: glitched keypad on the east wall (faces west)
    const CODE = "27182";
    sign("FATAL_ERROR 0xCAT\nCAT NOT FOUND.\nTo restore the cat, type the code:\n2 7 1 8 2", 49.3, 12, -140, 90, 14, 6, { bg: C(10, 20, 120), color: WHITE, font: "Code" });
    sign("GLITCH LOG\nBUG #1: every key is multiplied by 3.\nBUG #2: the bug grows by 1 for every digit already typed.\nBUG #3: only the LAST digit survives (we ran out of digits).\n- the intern", 49.3, 12, -126, 90, 10, 6, { bg: C(255, 255, 200), font: "Code" });
    const LAYOUT = [["1", "2", "3"], ["4", "5", "6"], ["7", "8", "9"], ["CLR", "0", "?"]];
    for (let r = 1; r <= 4; r++) for (let ci = 1; ci <= 3; ci++) {
      const lab = LAYOUT[r - 1][ci - 1];
      const zz = -142 + (ci - 2) * 2.4; // viewer faces east: left = -z
      const y = 7.4 - (r - 1) * 1.6;
      const key = P([0.6, 1.4, 2.1], 49.2, y, zz, C(200, 205, 220));
      label(key, lab, { face: "Left", color: C(20, 20, 30), pps: 40 });
      z.click(key.h, () => {
        if (done(96)) return z.notify("ERROR: cat already restored.");
        if (lab === "?") return z.notify("?: The keypad is glitched. Press keys and watch what actually gets typed.");
        if (lab === "CLR") { z.flag("kp", ""); return z.notify("Buffer cleared."); }
        if (locked("kp")) return;
        let buf = z.flag("kp") || "";
        const typed = String((3 * Number(lab) + buf.length) % 10);
        buf += typed;
        z.tone(0.7 + Number(typed) * 0.12, { volume: 0.5 });
        if (buf.length < 5) {
          z.flag("kp", buf);
          return z.notify(`Key [${lab}] typed: ${typed}     buffer: ${buf}${"_".repeat(5 - buf.length)}`);
        }
        z.flag("kp", "");
        if (buf === CODE) {
          z.unlock(96);
          z.notify(`buffer: ${buf} ... ERROR RESOLVED! The cat-shaped error message is free.`);
          z.sound("action_get_up.mp3");
        } else {
          z.lockout(10, "kp");
          z.fail(`buffer: ${buf} ... ERR_WRONG_CODE. Buffer wiped. Keypad rebooting (10 s).`);
        }
      }, { distance: 16 });
    }
    z.cat(96, z.cf(42, 0, -152, -90), { locked: true });

    // 97: corrupted text on the west wall (faces east)
    sign("CORRUPTED OUTPUT\n\n@# / !% / !@ / ^ / !* / % / @@ / !%", -49.3, 12, -140, -90, 16, 6, { bg: C(5, 5, 5), color: GLITCH, font: "Code" });
    sign("ERROR 0x01:\nSHIFT KEY STUCK DOWN SINCE 2009", -49.3, 13, -124, -90, 9, 3, { bg: C(120, 0, 0), color: WHITE, font: "Code" });
    sign("ERROR 0x02:\nLETTERS OVERFLOWED INTO NUMBERS\n(A=1, B=2 ... Z=26)", -49.3, 13, -156, -90, 9, 3.5, { bg: C(120, 0, 0), color: WHITE, font: "Code" });
    sign("ERROR 0x03:\nOUTPUT BUFFER PRINTED BACKWARDS", -49.3, 7.5, -124, -90, 9, 3, { bg: C(120, 0, 0), color: WHITE, font: "Code" });
    const SH = ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"];
    P([4, 1, 26], -44, 0.5, -140, C(40, 40, 46));
    for (let i = 1; i <= 10; i++) {
      const k = P([2, 0.6, 2], -44, 1.3, -151.5 + (i - 1) * 2.4, C(220, 220, 228));
      label(k, SH[i - 1] + "\n" + (i % 10), { face: "Top", color: C(20, 20, 30), pps: 40 });
    }
    const shift = N([3, 0.6, 3], -44, 0.3, -155.5, GLITCH, { collide: true, anim: { kind: "blink", period: 1.6 } });
    label(shift, "SHIFT", { face: "Top", color: C(0, 0, 0), pps: 40 });
    const term = P([3, 4, 2], -40, 2, -130, C(50, 50, 60));
    const ts = D([2.6, 2, 0.2], -40, 3, -128.95, C(5, 5, 5), {}, 180);
    label(ts, "PASSWORD:\n_", { color: GLITCH, font: "Code", pps: 40 });
    z.prompt(term.h, "Type the password", () => {
      if (done(97)) return z.notify("Password already accepted.");
      if (locked("pw")) return;
      z.input({ title: "!@#$%^&* PASSWORD", hint: "decode the corrupted output", kind: "text", max: 12 }, (text) => {
        if (answer(text) === "OVERFLOW") {
          z.unlock(97);
          z.notify("P@SSW0RD ACC3PT3D. The glitched cat's cage opens.");
          z.sound("action_get_up.mp3");
        } else {
          z.lockout(15, "pw");
          z.fail("&*^%$ WRONG. Terminal locked for 15 s.");
        }
      });
    }, { distance: 10, hold: TYPE_HOLD });
    z.cat(97, z.cf(-40, 0, -100, 90), { locked: true });
  }

  // ------------------------------------------------------------------------------- 93 HILBERT'S HOTEL
  {
    const glass = C(200, 245, 255);
    const CZ = -175, X0 = 70, X1 = 186;
    P([16, 0.3, 22], 62, 0.15, CZ, C(230, 250, 255));
    sign("HILBERT'S HOTEL FOR CATS\nInfinitely many rooms. All of them full.", 62, 12.5, -186.6, 180, 15, 4, { bg: C(220, 250, 255) });
    sign("Tonight an INFINITE bus of new cats arrives.\nTo check in, rooms 1, 2, 3, 4, 6, 7 and 8 must be EMPTY,\nbut the two VIP cats in rooms 5 and 10 must still have a guest.\nRing the bells (any order, up to 8 rings), then CHECK IN at the desk.\nThe corridor will not let you through until you do.",
      54.6, 6, -174, -90, 13, 6, { bg: C(240, 252, 255) });
    P([15, 3.5, 3], 62.5, 1.75, -184, C(255, 255, 255));
    N([15.2, 0.3, 3.2], 62.5, 3.6, -184, CYAN);
    const book = P([2, 0.4, 1.6], 68.5, 3.75, -184, C(120, 40, 40), { collide: false, hit: true });
    chainPrompt(book.h, 3, "Read the guest book", 5);
    const BELLS = {
      A: "every guest moves from room n to room n+1",
      B: "every guest moves from room n to room 2n",
      C: "every guest moves from room n to room n x n",
    };
    const occupied = (seq, room) => {
      for (let i = seq.length - 1; i >= 0; i--) {
        const op = seq[i];
        if (op === "A") { if (room <= 1) return false; room -= 1; }
        else if (op === "B") { if (room % 2 !== 0) return false; room /= 2; }
        else { const s = Math.floor(Math.sqrt(room) + 0.5); if (s * s !== room) return false; room = s; }
      }
      return true;
    };
    const checkedIn = () => !!z.flag("hotel") || z.isUnlocked(93) || z.has(93);
    const bellX = { A: 56.5, B: 59.5, C: 62.5 };
    for (const b of ["A", "B", "C"]) {
      const bell = P([1, 1, 1], bellX[b], 4.1, -184, GOLD, { shape: "Ball", collide: false, hit: true });
      sign("BELL " + b + ":\n" + BELLS[b], bellX[b], 7.3, -184.8, 180, 2.8, 2.6, { bg: C(255, 245, 200), thick: 0.2, pps: 60, maxPx: 300 });
      z.click(bell.h, () => {
        if (checkedIn()) return z.notify("You're already checked in, honoured guest.");
        let seq = z.flag("bells") || "";
        if (seq.length >= 8) return z.fail("The bells are exhausted (8 rings). Use the RESET bell.");
        seq += b;
        z.flag("bells", seq);
        z.tone(b === "A" ? 1.2 : b === "B" ? 1.5 : 1.8);
        z.notify(`DING! Bell ${b}: ${BELLS[b]}. (Rings so far: ${seq.split("").join(" ")})`);
      });
    }
    const rst = P([1, 1, 1], 65.5, 4.1, -184, C(150, 150, 160), { shape: "Ball", collide: false, hit: true });
    sign("RESET BELL:\neveryone back to their own room", 65.5, 7.3, -184.8, 180, 2.8, 2.6, { bg: C(230, 230, 235), thick: 0.2, pps: 60, maxPx: 300 });
    z.click(rst.h, () => {
      z.flag("bells", "");
      z.notify("Every guest is back in their own room. All rooms full again.");
    });
    // CHECK IN sits at the desk's west end so the guest book (east end) keeps its own prompt
    const checkin = P([3, 3.5, 3.2], 56, 1.75, -184, WHITE, { invisible: true, collide: false, hit: true });
    sign("CHECK IN", 56, 2.2, -182.45, 180, 3, 1, { bg: C(220, 250, 255), thick: 0.1 });
    sign("GUEST BOOK", 68.5, 2.2, -182.45, 180, 3, 1, { bg: C(255, 235, 235), thick: 0.1 });
    z.prompt(checkin.h, "CHECK IN", () => {
      if (checkedIn()) return z.notify("You're already checked in. Your room is at the end of the corridor.");
      const seq = z.flag("bells") || "";
      for (const r of [1, 2, 3, 4, 6, 7, 8]) {
        if (occupied(seq, r)) return z.fail(`The clerk sighs: room ${r} is still occupied. (Rings: ${seq === "" ? "none" : seq})`);
      }
      for (const r of [5, 10]) {
        if (!occupied(seq, r)) return z.fail(`The clerk gasps: the VIP in room ${r} has been evicted! (Rings: ${seq})`);
      }
      z.flag("hotel", true);
      z.unlock(93);
      z.notify("CHECKED IN! The infinite corridor will let you through now.");
      z.sound("action_get_up.mp3");
    }, { distance: 5 });

    // corridor: mirrored walls, arches that shrink towards the end (looks endless)
    P([X1 - X0, 16, 1], (X0 + X1) / 2, 8, CZ - 7, glass, { glass: true, transparency: 0.3 });
    P([X1 - X0, 16, 1], (X0 + X1) / 2, 8, CZ + 7, glass, { glass: true, transparency: 0.3 });
    P([1, 16, 15], X1, 8, CZ, glass, { glass: true, transparency: 0.3 });
    D([X1 - X0, 0.2, 13], (X0 + X1) / 2, 0.1, CZ, C(240, 252, 255));
    for (let i = 0; i <= 9; i++) {
      const x = X0 + 4 + i * 10;
      const h = 15 - i * 0.6;
      const w = 12.4 - i * 0.35;
      N([0.6, h, 0.6], x, h / 2, CZ - w / 2, CYAN);
      N([0.6, h, 0.6], x, h / 2, CZ + w / 2, CYAN);
      N([0.6, 0.6, w], x, h, CZ, CYAN);
      const d = P([4, 7, 0.4], x + 5, 3.5, CZ - 6.3, C(120, 200, 230));
      label(d, "ROOM " + (i + 1), { face: "Back", color: C(20, 40, 60), pps: 30 });
    }
    sign("ROOM 11, 12, 13 ... and so on forever", 168, 12, CZ + 6.3, 0, 12, 2, { bg: C(220, 250, 255), thick: 0.2 });
    const loop = N([1, 16, 13], 170, 8, CZ, CYAN, { transparency: 0.85, collide: false, hit: true });
    z.touch(loop.h, () => {
      if (checkedIn()) {
        if (!z.flag("welcomed")) {
          z.flag("welcomed", true);
          z.notify("Welcome, honoured guest. Your room is just ahead.");
        }
        return;
      }
      const lap = flagN("lap") + 1;
      z.flag("lap", lap);
      tp(74, 0.5, CZ);
      z.fail(`Room 11... room 12... room 9,000,000... You're back in the lobby. (Lap ${lap} of infinity.) Check in first.`);
    }, { cooldown: 1 });
    z.cat(93, z.cf(179, 0, CZ, 90), { locked: true });
  }

  // ------------------------------------------------------------------------------- 94/95 TEMPLE OF ALEPH
  {
    const marble = C(245, 250, 255), glow = CYAN;
    P([74, 2, 50], 130, 1, -125, marble);
    P([74, 1, 4], 130, 0.5, -98, marble);
    N([74.2, 0.2, 50.2], 130, 2.05, -125, C(180, 250, 255), { transparency: 0.7 });
    for (let i = 0; i <= 7; i++) {
      const x = 98 + i * 9;
      for (const zz of [-147, -103]) {
        P([20, 3, 3], 0, 0, 0, marble, { shape: "Cylinder", cf: mul(z.cf(x, 12, zz), ROTZ90) });
        N([0.5, 3.4, 3.4], 0, 0, 0, glow, { shape: "Cylinder", cf: mul(z.cf(x, 18, zz), ROTZ90) });
      }
    }
    P([74, 2, 48], 130, 23, -125, marble);
    // giant aleph on the back wall
    P([40, 18, 1], 130, 11, -150, C(230, 245, 255));
    N([2, 16, 1], 0, 0, 0, glow, { cf: mul(z.cf(130, 11, -149.2), ang(0, 0, 35 * RAD)) });
    N([1.6, 6, 1], 0, 0, 0, glow, { cf: mul(z.cf(125, 14.5, -149.2), ang(0, 0, -15 * RAD)) });
    N([1.6, 6, 1], 0, 0, 0, glow, { cf: mul(z.cf(135, 7.5, -149.2), ang(0, 0, -15 * RAD)) });
    sign("TEMPLE OF ALEPH  (the smallest infinity)", 130, 4, -148.6, 180, 20, 2.4, { bg: C(230, 250, 255) });

    // 94 Cantor's altar
    sign("CANTOR'S LIST OF EVERY CAT\n(some guy says it's complete)\n\nRow 1: 89\nRow 2: 54\nRow 3: 99\nRow 4: 29\nRow 5: 116\nRow 6: 43\nRow 7: 78",
      106, 10, -140, 180, 10, 12, { bg: C(255, 252, 235), pps: 50, maxPx: 600 });
    sign("HOW TO COUNT PAST ALEPH-0\nEvery cat is 7 digits: write each row in BINARY\n(place values 64 32 16 8 4 2 1).\nBuild the cat that is NOT on the list:\nits digit 1 differs from row 1's digit 1,\ndigit 2 from row 2's digit 2 ... digit 7 from row 7's digit 7.\nType your cat as a normal number at the altar.",
      118, 10, -140, 180, 12, 12, { bg: C(235, 250, 255), pps: 60, maxPx: 720 });
    const altar = P([6, 4, 4], 112, 4, -130, marble);
    N([6.2, 0.3, 4.2], 112, 6.1, -130, glow);
    z.cat(94, [104, 2, -126], { locked: true });
    z.prompt(altar.h, "Name the missing cat", () => {
      if (done(94)) return z.notify("You already counted past infinity. Show-off.");
      if (locked("cantor")) return;
      z.input({ title: "CANTOR'S ALTAR", hint: "the cat that is not on the list (a number)", kind: "digits", max: 3 }, (text) => {
        if (text !== "" && Number(text) === 17) {
          z.unlock(94);
          z.notify("0010001 = 17. Not on the list! The list was never complete. The cage opens.");
          z.sound("action_get_up.mp3");
        } else {
          z.lockout(30, "cantor");
          z.fail("That cat is already on the list (or isn't a cat). Locked for 30 s.");
        }
      });
    }, { distance: 10, hold: TYPE_HOLD });

    // 95 Mastermind stone
    const COLS = { R: C(230, 40, 40), O: C(255, 150, 30), Y: C(255, 230, 40), G: C(60, 200, 80), B: C(50, 110, 255), P: C(160, 70, 220), W: C(250, 250, 250) };
    const LETTERS = "ROYGBPW";
    sign("MASTERMEOWND'S CODE\n5 pegs, 7 colours: R O Y G B P W (colours may repeat).\nEach guess earns BLACK dots (right colour, right spot)\nand WHITE dots (right colour, wrong spot).\n12 guesses, then the code changes. Your guesses: the GUESS LOG (west).",
      148, 10, -140, 180, 14, 8, { bg: C(240, 230, 255) });
    for (let i = 1; i <= 7; i++) {
      const L = LETTERS[i - 1];
      N([1.2, 1.2, 1.2], 141 + i * 1.8, 5.2, -139.5, COLS[L], { shape: "Ball" });
      const plate = D([1.5, 1.2, 0.1], 141 + i * 1.8, 6.6, -139.5, C(250, 250, 255));
      label(plate, L, { face: "Back", color: C(20, 20, 20), pps: 40 });
    }
    const stone = P([8, 5, 4], 152, 4.5, -128, C(200, 180, 240));
    z.cat(95, [160, 2, -126], { locked: true });
    // the guess log: every guess of the current code stays readable here (the original only flashed
    // the last five in a 3-second toast, which made the deduction a memory test)
    const slate = P([7, 12, 0.4], 137, 9, -136, C(30, 20, 50), { collide: false, hit: true });
    const LOG_HEAD = "GUESS LOG\nB=black W=white";
    const log = z.label(slate.h, LOG_HEAD + "\n\nno guesses yet", { face: "back", color: C(235, 225, 255), bg: C(30, 20, 50), pps: 40 });
    const short = (h) => h.replace(/ -> (\d) black, (\d) white$/, " $1B $2W");
    const showLog = (hist, tail) => log.setText([LOG_HEAD, ...hist.map((h, i) => `${i + 1}) ${short(h)}`), ...(tail ? [tail] : [])].join("\n"));
    const score = (code, guess) => {
      let black = 0, white = 0;
      const cc = {}, gc = {};
      for (let i = 0; i < 5; i++) {
        const a = code[i], b = guess[i];
        if (a === b) black++;
        else { cc[a] = (cc[a] || 0) + 1; gc[b] = (gc[b] || 0) + 1; }
      }
      for (const [k2, v] of Object.entries(gc)) white += Math.min(v, cc[k2] || 0);
      return [black, white];
    };
    const newCode = () => { let s = ""; for (let i = 0; i < 5; i++) s += LETTERS[z.randint(0, 6)]; return s; };
    z.prompt(stone.h, "Guess the code", () => {
      if (done(95)) return z.notify("Mastermeownd refuses to play you again. Sore loser.");
      if (locked("mm")) return;
      z.input({ title: "MASTERMEOWND", hint: "5 letters from R O Y G B P W", kind: "text", max: 9 }, (raw) => {
        const text = answer(raw);
        if (text.length !== 5 || /[^ROYGBPW]/.test(text)) return z.fail("Use exactly 5 letters from R O Y G B P W.");
        let code = z.flag("mmCode");
        if (!code) { code = newCode(); z.flag("mmCode", code); }
        const hist = z.flag("mmHist") || [];
        const [black, white] = score(code, text);
        hist.push(`${text} -> ${black} black, ${white} white`);
        z.flag("mmHist", hist);
        if (black === 5) {
          z.unlock(95);
          showLog(hist, "SOLVED!");
          z.notify(`${text}! 5 BLACK! Mastermeownd's monocle falls off. The cage opens.`);
          z.sound("action_get_up.mp3");
          return;
        }
        const lines = [];
        for (let i = Math.max(0, hist.length - 5); i < hist.length; i++) lines.push(`${i + 1}) ${hist[i]}`);
        if (hist.length >= 12) {
          z.flag("mmCode", null);
          z.flag("mmHist", null);
          z.lockout(20, "mm");
          showLog(hist, `OUT OF GUESSES. It was ${code}.\nA NEW code is ready in 20 s.`);
          z.fail(lines.join("\n") + "\nOut of guesses! The code was " + code + ". New code in 20 s.");
        } else {
          showLog(hist, `(${12 - hist.length} guesses left)`);
          z.notify(lines.join("\n") + `\n(${12 - hist.length} guesses left)`);
        }
        z.tone(0.8 + black * 0.25, { volume: 0.5 });
      });
    }, { distance: 10, hold: TYPE_HOLD });
  }

  // ------------------------------------------------------------------------------- 98 THE # MAZE
  {
    const S = 6, X0 = 101, Z0 = 71, NC = 13;
    const inMask = (i, j) => {
      if (i < 0 || j < 0 || i >= NC || j >= NC) return false;
      return i === 3 || i === 4 || i === 8 || i === 9 || j === 3 || j === 4 || j === 8 || j === 9;
    };
    // perfect maze over the # cells (the original's Park-Miller RNG, so the layout is identical)
    let seed = 4242;
    const rnd = (n) => { seed = (seed * 16807) % 2147483647; return seed % n; };
    const open = new Set();
    const ekey = (i, j, i2, j2) => ((i2 < i || (i2 === i && j2 < j)) ? `${i2},${j2}>${i},${j}` : `${i},${j}>${i2},${j2}`);
    const seen = new Set(["0,3"]);
    const stack = [[0, 3]];
    while (stack.length) {
      const cur = stack[stack.length - 1];
      const nb = [];
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = cur[0] + di, nj = cur[1] + dj;
        if (inMask(ni, nj) && !seen.has(ni + "," + nj)) nb.push([ni, nj]);
      }
      if (!nb.length) stack.pop();
      else {
        const nx = nb[rnd(nb.length)];
        seen.add(nx[0] + "," + nx[1]);
        open.add(ekey(cur[0], cur[1], nx[0], nx[1]));
        stack.push(nx);
      }
    }
    const wallBetween = (i, j, i2, j2) => {
      const a = inMask(i, j), b = inMask(i2, j2);
      if (!a && !b) return false;
      if (a && b) return !open.has(ekey(i, j, i2, j2));
      return true;
    };
    const WALL_H = 16;
    const wallC = C(16, 16, 20);
    const runs = (list, fn) => {
      let k = 0;
      while (k < NC) {
        if (list[k]) { const s = k; while (k + 1 < NC && list[k + 1]) k++; fn(s, k); }
        k++;
      }
    };
    for (let i = 0; i <= NC; i++) {
      const segs = [];
      for (let j = 0; j < NC; j++) if (wallBetween(i - 1, j, i, j) && !(i === 0 && j === 3)) segs[j] = true;
      runs(segs, (a, b) => {
        const len = (b - a + 1) * S;
        P([1, WALL_H, len + 1], X0 + i * S, WALL_H / 2, Z0 + a * S + len / 2, wallC);
        N([1.05, 0.2, len + 1.05], X0 + i * S, WALL_H, Z0 + a * S + len / 2, C(90, 90, 140));
      });
    }
    for (let j = 0; j <= NC; j++) {
      const segs = [];
      for (let i = 0; i < NC; i++) if (wallBetween(i, j - 1, i, j)) segs[i] = true;
      runs(segs, (a, b) => {
        const len = (b - a + 1) * S;
        P([len + 1, WALL_H, 1], X0 + a * S + len / 2, WALL_H / 2, Z0 + j * S, wallC);
        N([len + 1.05, 0.2, 1.05], X0 + a * S + len / 2, WALL_H, Z0 + j * S, C(90, 90, 140));
      });
    }
    const cellPos = (i, j) => [X0 + i * S + S / 2, Z0 + j * S + S / 2];
    // invisible lid: no walking along the wall tops
    P([NC * S + 1, 1, NC * S + 1], X0 + NC * S / 2, WALL_H + 0.5, Z0 + NC * S / 2, WHITE, { invisible: true });
    for (const b of [[3, 0, 2, NC], [8, 0, 2, NC], [0, 3, NC, 2], [0, 8, NC, 2]]) {
      N([b[2] * S - 4, 0.06, b[3] * S - 4], X0 + (b[0] + b[2] / 2) * S, 0.05, Z0 + (b[1] + b[3] / 2) * S, C(60, 60, 90), { transparency: 0.5 });
    }
    const [ex, ez] = cellPos(0, 3);
    sign("THE # MAZE\nPull the 4 LEVERS at the tips of the #.\nThen find the TRAPDOOR next to the hole in the middle.", ex - 8, 6, ez - 6, 90, 10, 5, { bg: C(30, 30, 36), color: WHITE });
    N([0.4, 16, 6], X0 - 0.2, 8, ez, WHITE, { transparency: 0.8 });
    const LEVERS = [[12, 8], [3, 12], [9, 0], [0, 9]];
    LEVERS.forEach((c, k) => {
      const li = k + 1;
      const [x, zz] = cellPos(c[0], c[1]);
      P([2, 1, 2], x, 0.5, zz, C(60, 60, 70));
      const h = N([0.5, 3, 0.5], x, 2.5, zz, C(255, 60, 60), { inst: true, collide: true });
      z.prompt(h.h, "Pull lever", () => {
        const key = "lever" + li;
        if (z.flag(key)) return z.notify("This lever is already pulled.");
        z.flag(key, true);
        h.ih.setColor(C(60, 255, 120));
        let n = 0;
        for (let q = 1; q <= 4; q++) if (z.flag("lever" + q)) n++;
        z.notify(`CLUNK. Lever pulled (${n}/4).`);
        z.sound("action_jump_land.mp3");
      }, { hold: 0.4, distance: 8 });
    });
    // levers are zone flags: they spring back (red) when you leave the zone
    const [tx, tz] = cellPos(6, 8);
    const trap = N([4, 0.3, 4], tx, 0.15, tz, C(120, 120, 140), { collide: true });
    z.prompt(trap.h, "Open the trapdoor", () => {
      // levers are zone flags, the unlock lasts the whole visit: once the cage is open the trapdoor
      // stays unjammed, so leaving before grabbing the cat never means pulling all four again
      for (let q = 1; q <= 4 && !z.isUnlocked(98); q++) {
        if (!z.flag("lever" + q)) return z.fail("The trapdoor is jammed. Lever " + q + " still needs pulling.");
      }
      z.unlock(98);
      const [hx, hz] = cellPos(6, 6);
      tp(hx, 0.5, hz + 4);
      z.notify("You drop into the middle of the #. Something with four sticks stares at you.");
    }, { distance: 8 });
    const [hx, hz] = cellPos(6, 6);
    N([16, 0.1, 16], hx, 0.05, hz, C(255, 255, 255), { transparency: 0.6 });
    z.cat(98, [hx, 0, hz - 3], { locked: true });
    const exitPad = N([4, 0.4, 4], hx - 5, 0.2, hz + 5, CYAN, { collide: true });
    const exitSign = D([4, 1.2, 0.2], hx - 5, 2.4, hz + 7.1, C(20, 40, 60));
    label(exitSign, "EXIT", { face: "Front", color: CYAN, pps: 30 });
    z.touch(exitPad.h, () => {
      tp(X0 - 8, 0.5, ez);
      z.notify("You climb out of the #.");
    }, { cooldown: 2 });
  }

  // ------------------------------------------------------------------------------- 99 THE # WALL + monolith
  {
    const SOL = [".X.....X.", ".XX...XX.", ".XXXXXXX.", "XX.XXX.XX", "XXXXXXXXX", "XXXX.XXXX", "XX.X.X.XX", ".XXXXXXX.", "X.XXXXX.X"];
    const cell = (r, c) => SOL[r - 1][c - 1] === "X";
    const runsOf = (get) => {
      const out = [];
      let run = 0;
      for (let k = 1; k <= 9; k++) {
        if (get(k)) run++;
        else if (run > 0) { out.push(run); run = 0; }
      }
      if (run > 0) out.push(run);
      return out;
    };
    const tally = (list) => list.map((n) => "#".repeat(n));
    const WX = 120;
    P([1, 46, 46], WX + 0.6, 23, 36, C(10, 10, 14));
    sign("#NoFilter  -  THE # WALL\nColour in the grid. The # marks count the filled squares in each row/column, in order.\nThen pull #SUBMIT.", WX - 0.1, 48.5, 36, 90, 40, 5, { bg: C(25, 25, 30), color: WHITE, pps: 30, maxPx: 1400 });
    const state = [], tiles = [];
    const ON = C(250, 250, 255), OFF = C(55, 55, 65);
    const paint = (k) => tiles[k].ih.setColor(state[k] ? ON : OFF);
    for (let r = 1; r <= 9; r++) {
      const y = 33 - (r - 1) * 3;
      const rl = D([0.3, 2.6, 11], WX, y, 30 - 1.5 - 6, C(30, 30, 40));
      label(rl, tally(runsOf((c) => cell(r, c))).join(" / "), { face: "Left", color: C(255, 255, 255), font: "Code", pps: 40 });
      for (let c = 1; c <= 9; c++) {
        const k = (r - 1) * 9 + c;
        state[k] = false;
        tiles[k] = P([0.4, 2.8, 2.8], WX, y, 30 + (c - 1) * 3, OFF, { neon: true, inst: true, collide: false, hit: true });
        // 60 (the original had 45): the grid spans y 9..34, so seeing all of it means standing back
        z.click(tiles[k].h, () => { state[k] = !state[k]; paint(k); z.tone(state[k] ? 1.3 : 0.9, { volume: 0.3 }); }, { distance: 60 });
      }
    }
    for (let c = 1; c <= 9; c++) {
      const cl = D([0.3, 8, 2.8], WX, 33 + 1.5 + 4.2, 30 + (c - 1) * 3, C(30, 30, 40));
      // column tallies run DOWN the panel, one # per line (a run of 8 written across a 2.8-stud
      // panel shrank to unreadable dots), runs split by a "/" line like the row clues
      const vt = runsOf((r) => cell(r, c)).map((n) => Array(n).fill("#").join("\n")).join("\n/\n");
      label(cl, vt, { face: "Left", color: C(255, 255, 255), font: "Code", pps: 60, maxPx: 600 });
    }
    z.cat(99, [WX - 10, 0, 64], { locked: true });
    const wipe = () => { for (let k = 1; k <= 81; k++) { state[k] = false; paint(k); } };
    const resetB = N([2, 2, 2], WX - 6, 1, 10, C(80, 80, 100), { collide: true });
    sign("#RESET", WX - 6, 3.5, 10, 90, 3, 1.2, { bg: C(200, 200, 220) });
    z.click(resetB.h, () => { wipe(); z.notify("The # Wall has been wiped. #FreshStart"); });
    const sub = N([1, 4, 1], WX - 6, 2, 62, C(255, 0, 170), { collide: true });
    sign("#SUBMIT", WX - 6, 5, 62, 90, 3, 1.2, { bg: C(255, 200, 240) });
    z.click(sub.h, () => {
      for (let r = 1; r <= 9; r++) for (let c = 1; c <= 9; c++) {
        if (state[(r - 1) * 9 + c] !== cell(r, c)) return z.fail(`0 likes. Row ${r} isn't right yet. #Fail`);
      }
      z.unlock(99);
      wipe();
      z.notify("1,000,000 LIKES! #NoFilter Cat's selfie is complete. The cage opens. #Blessed");
      z.sound("action_get_up.mp3");
    });

    // the giant # monolith (faces west). The original's truss climb on its east side is a spiral
    // stair here (no climbing in this engine): 16 steps of 3 studs round a post, 36 degrees apart,
    // the last one level with the top of the north bar.
    const MX = 172, MZ = 40;
    const blk = C(8, 8, 10);
    P([10, 4, 44], MX, 2, MZ, C(30, 30, 36));
    for (const zz of [MZ - 7, MZ + 7]) {
      P([5, 44, 5], MX, 26, zz, blk);
      N([5.2, 44, 0.3], MX - 0.1, 26, zz - 2.5, WHITE, { transparency: 0.3 });
    }
    for (const y of [18, 34]) {
      P([5, 5, 40], MX, y, MZ, blk);
      N([0.3, 0.3, 40], MX - 2.6, y + 2.5, MZ, WHITE);
    }
    const SCX = 184, SCZ = MZ - 7, SR = 5.5;
    P([48, 2, 2], 0, 0, 0, C(90, 90, 110), { shape: "Cylinder", cf: mul(z.cf(SCX, 24, SCZ), ROTZ90) });
    for (let k = 0; k <= 15; k++) {
      const a = k * 36;
      const x = SCX + SR * Math.cos(a * RAD), zz = SCZ + SR * Math.sin(a * RAD);
      const top = 3 + 3 * k;
      P([3.4, 1, 3.4], x, top - 0.5, zz, C(90, 90, 110), {}, -a);
      N([3.5, 0.15, 3.5], x, top - 1.05, zz, k % 2 ? CYAN : MAGENTA, {}, -a);
    }
    const note = P([1.4, 0.3, 1.4], MX, 48.15, MZ - 7, C(255, 240, 120), { collide: false, hit: true });
    chainPrompt(note.h, 4, "Read the sticky note", 8);
  }

  // ------------------------------------------------------------------------------- 100 AI CORE
  {
    const CX = 165, CZ = -15;
    P([2, 22, 22], 0, 0, 0, C(40, 40, 60), { shape: "Cylinder", cf: mul(z.cf(CX, 1, CZ), ROTZ90) });
    N([9, 9, 9], CX, 14, CZ, C(255, 255, 255), { shape: "Ball", anim: { kind: "rainbow", period: 5 } });
    [13, 16].forEach((r, k) => {
      const i = k + 1;
      inst.add("torus", [r, r, r], mul(z.cf(CX, 14, CZ), ang(30 * i * RAD, 0, 0), ang(Math.PI / 2, 0, 0)), i === 1 ? CYAN : MAGENTA, {
        neon: true, anim: { kind: "spin", axis: i === 1 ? "x" : "y", speed: 40 + i * 20 },
      });
    });
    N([200, 3, 3], 0, 0, 0, WHITE, { shape: "Cylinder", cf: mul(z.cf(CX, 118, CZ), ROTZ90), anim: { kind: "rainbow", period: 4 } });
    for (const a of [0, 120, 240]) {
      N([0.5, 8, 0.5], CX + Math.cos(a * RAD) * 7, 6, CZ + Math.sin(a * RAD) * 7, CYAN);
    }
    z.cat(100, z.cf(CX, 2, CZ - 5, 0), { locked: true });
    const NODES = [
      "x = 7",
      "x = x * 2A\n(2A is base 16)",
      "x = x + 1100100\n(base 2)",
      "x = x * x",
      "x = x - 1750\n(base 8)",
      "x = x / 4",
      "x = x + XLII\n(Roman numerals)",
      "x = the remainder of\nx / 9973",
      "x = x * 101\n(base 2)",
      "x = x + ZZ\n(base 36: 0-9 then A-Z)",
      "x = x + 1000 * (the sum\nof x's digits)",
      "x = x * 3",
      "x = x - 2222\n(base 3)",
      "x = x + 4DFF\n(base 16)",
      "KEY = x written in base 26\nwith letters: A=0, B=1 ... Z=25",
      "Shift every letter of the screen text BACK\nby the number of cats in The End Of Cats\n(real ones - your Index can count them).\nThen Vigenere: subtract the KEY letters\n(A=0), repeating the KEY. Type the result.",
    ];
    for (let i = 1; i <= 16; i++) {
      const a = ((i - 1) * 22.5 - 90) * RAD;
      const x = CX + Math.cos(a) * 22, zz = CZ + Math.sin(a) * 22;
      P([2, 3, 2], x, 1.5, zz, C(50, 50, 70));
      const eye = new THREE.Vector3(...z.pos(x, 5.5, zz));
      const target = eye.clone().sub(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      const cf = M4().lookAt(eye, target, new THREE.Vector3(0, 1, 0)).setPosition(eye);
      const s = P([7, 4.5, 0.4], 0, 0, 0, C(10, 14, 30), { collide: false, hit: i === 16, cf });
      label(s, `NODE ${String(i).padStart(2, "0")}\n${NODES[i - 1]}`, { face: "Back", color: CYAN, font: "Code", pps: i >= 15 ? 120 : 50, maxPx: i >= 15 ? 900 : 400 });
      N([2.2, 0.3, 2.2], x, 3.1, zz, i === 16 ? MAGENTA : CYAN);
      if (i === 16) chainPrompt(s.h, 5, "Read node 16", 10);
    }
    const mon = P([1, 9, 16], 136, 7.5, CZ, C(5, 5, 10));
    label(mon, "REVERSE CAPTCHA\nPROVE YOU ARE NOT A HUMAN.\n\nENCRYPTED: EUXEPYZQTYRP\n\nStart at NODE 01 and do every node in order.", { face: "Left", color: C(255, 255, 255), font: "Code", pps: 50, maxPx: 900 });
    N([1.2, 9.4, 0.4], 136, 7.5, CZ - 8, MAGENTA);
    N([1.2, 9.4, 0.4], 136, 7.5, CZ + 8, MAGENTA);
    const term = P([2, 3.5, 3], 132, 1.75, CZ, C(60, 60, 80));
    z.prompt(term.h, "Submit the captcha", () => {
      if (done(100)) return z.notify("ACCESS ALREADY GRANTED, FELLOW ROBOT.");
      if (locked("ai")) return;
      z.input({ title: "REVERSE CAPTCHA", hint: "the decrypted message", kind: "text", max: 20 }, (raw) => {
        const text = raw.replace(/\s/g, "");
        if (text === "CATSNEVEREND") {
          z.unlock(100);
          z.notify("BEEP BOOP. NON-HUMAN CONFIRMED. CATS NEVER END. The AI Cat's cage opens.");
          z.sound("impact_explosion_03.mp3", { volume: 0.4 });
        } else {
          z.lockout(30, "ai");
          z.fail("HUMAN DETECTED. Locked out for 30 s.");
        }
      });
    }, { distance: 10, hold: TYPE_HOLD });
  }

  deco.commit();
  inst.commit();
  atlas.commit();
}
