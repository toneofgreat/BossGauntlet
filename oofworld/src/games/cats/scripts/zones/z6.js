/*
	Zone 6: THE MEME DIMENSION (cats 72..84)   OWNER: zone 6 agent
	Rainbow ground, a giant rainbow arch, floating meme props, the Laugh Theater, the Infinite Staircase,
	Breadloaf Mountain, the Giant Keyboard + Keycap Tower, the "..." Room, the Morse Tower, the Quiet
	Corner, the Meow Mall (vaporwave) and the Rainbow Void.

	==================================== SOLUTIONS (all info is in-game) ====================================
	72 Cackling Rainbow Cat (HAHAHAHA) - Laugh Theater, NW. Five identical rainbow cats on 12-stud pillars.
	   The four fakes face SOUTH (at you). The real one is the 4th pillar from the west (x -95) and faces
	   WEST, i.e. it is laughing at the fake next to it. Click it from the foot of its pillar.
	   Clicking a fake = HAHAHAHA + back to spawn.
	73 Skibidi Cat (HAHAHAHA) - Infinite Staircase, N. Climbing to the top just drops you back at the bottom.
	   The stair walls are numbered 1..20 on the outside. The EAST wall panel number 13 is fake
	   (non-collidable): walk through it at ground level into the disco room under the stairs. Cat inside.
	74 Sigma Grindset Cat (HAHAHAHA) - Meow Mall. Touch the red GRIND BUTTON (always visible through walls)
	   7 times; every touch makes it jump to its next spot (entrance, SW corner, top of the kiosk, SE corner,
	   fountain, top of the crate stack, NW corner). After 7 catches the CEO office cat (back of mall) unlocks.
	75 Keyboard Cat (...) - Giant Keyboard, E. Click the speaker: it plays 5 notes. Only the home row keys
	   (A S D F G H J K L) play notes, rising from A (low) to L (high). The song is S A L A D.
	   Click S, A, L, A, D on the keyboard -> the cage on the spacebar opens.
	76 Crying Cat (...) - Quiet Corner, SW (outside the mall's west wall). Stand on the rug and do not move
	   for 30 seconds (toasts show ". " at 10 s and ". ." at 20 s). The cat appears on the bench.
	77 Spinning Cat (...) - Dot Gallery on the mall's west wall: 3 boards with 12 + 19 + 16 = 47 dots.
	   Click the DOT COUNTER and type 47.
	78 Long Cat (...) - Morse Tower. The lamp blinks .-.. --- -. --. (pause) = L O N G. The chart next to it
	   lists Morse for A-Z. Click the terminal and type LONG.
	79 Liquid Cat (...) - The "..." Room (black box in the middle). 7x7 invisible floor tiles in the dark.
	   Correct tiles chime higher each step; wrong tiles groan (no penalty, step back). Columns 1..7 go
	   west->east, rows 1..7 north->south; you enter on (1,4). Path:
	   (1,4) (2,4) (2,3) (2,2) (3,2) (4,2) (4,3) (4,4) (4,5) (4,6) (5,6) (6,6) (6,5) (6,4) (7,4).
	   The 15th chime reveals the cat on the last tile.
	80 UwU Rawr XD Cat (Impossible) - eight signs with gold badges #1..#8 around the zone:
	   #1 Bread.. (plaza)  #2 Rainbows.. (Laugh Theater)  #3 All cats.. (staircase)  #4 If you can read..
	   (inside the bread)  #5 Nobody.. (keyboard)  #6 Remember.. (Rainbow Void stairs)  #7 Only real ones..
	   (mall)  #8 This sign.. (Quiet Corner). First letters = BRAINROT. Type it at the UwU Vault (plaza, NW).
	81 A E S T H E T I C Cat (Impossible) - 5x5 light board on the mall's east wall. Clicking a light flips
	   it AND its 4 DIAGONAL neighbours. Start pattern = all off + presses at (col,row), col 1 = left (north):
	   (1,1) (2,3) (4,2) (3,5) (5,4) (1,5). Pressing those same six lights again turns everything off.
	   (Order does not matter.)
	82 Stonks Cat (Impossible) - cipher chain.
	   Note A (Meme Market, by spawn): shift -1: MPPL JOTJEF UIF MPBG = LOOK INSIDE THE LOAF
	   Note B (inside Breadloaf Mountain): shift -3 ("CAT" has 3 letters): JR WR WKH PDOO IRXQWDLQ
	       = GO TO THE MALL FOUNTAIN
	   Note C (mall fountain): mirror alphabet A<->Z: WRZNLMWKZDH = DIAMONDPAWS
	   Type DIAMONDPAWS at the Meme Market terminal.
	83 Waffle Rainbow Cat (Impossible) - the Rainbow Void, SE. Invisible 8x8 tiles at y 24 over a kill floor.
	   The map is inside Breadloaf Mountain behind the inner wall (squeeze past its east end). Columns A..G
	   (west->east), rows 1..7 (north->south); start platform is west of A4, end platform east of G2.
	   Solid cells: A2 A3 A4 A5 A6 B6 C6 C5 C4 C3 C2 D2 E2 E3 E4 E5 E6 E7 D7 F6 G6 G5 G4 G3 G2 G7.
	   Route: A4 A5 A6 B6 C6 C5 C4 C3 C2 D2 E2 E3 E4 E5 E6 F6 G6 G5 G4 G3 G2 -> end platform.
	84 Galaxy Brain Cat (Impossible) - climb the floating keycaps from the spacebar's east end around the
	   Keycap Tower (13 spiral jumps) to the top. Solve the 4x4 sliding puzzle (1..15 in reading order,
	   blank bottom-right). The cage opens, then the board reshuffles after 8 s.
	   SHUFFLE button re-scrambles if you made a mess.
	===========================================================================================================

	OofWorld PORT NOTES (ARCHITECTURE §5: gravity 196.2, jump 50, walk 16, auto step-up 1.1)
	  A jump rises 50^2 / (2 * 196.2) = 6.37 studs and covers 16 * 0.51 = 8.15 studs flat. While falling it is
	  back at +h after t = (50 + sqrt(2500 - 392.4 h)) / 196.2 s, so a hop that climbs h reaches 16 t studs:
	  h 2 -> 7.4, h 2.6 -> 7.2, h 3 -> 7.1, h 4.2 -> 6.46.
	  - Infinite Staircase: the original 1.6-stud rise needs a jump per step here, so the rise is 1.05
	    (still 20 numbered steps; the unlucky-13 gap under the stairs keeps 12.6 studs of headroom).
	  - Rainbow Void stairs: 12 steps of rise 2 became 24 steps of rise 1 (walkable) to the same y 24.
	  - Meow Mall kiosk: its top is 6.0 above the mall floor, inside the 6.37 apex by a hair, so a 3-stud
	    crate step stands on its west side (rise 3 + 3).
	  - Keycap spiral: chord 2 * 17 * sin 19 = 11.07, keys 6 wide -> worst edge gap 5.07 with rise 4.2,
	    reach 6.46. Spacebar -> key 0 -> key 1 -> spiral: gaps <= 4.6 with rise 2. The last key -> the tower
	    top: gap 5.9 with rise 2.6, reach 7.2. Crate stack: rises of 3.
	  - Every puzzle is single-player here (spec 28 §2): the shared boards of the original (lights, sliding
	    puzzle) are simply yours.
	  - The original engine's Ball parts are always round (min of Size); the original's palm leaves, smiley eyes and candy
	    clouds asked for ellipsoids, and the merged decoration draws them as ellipsoids. The rainbow arch's
	    segments are turned to follow the arch (the original's angle term pointed half of them sideways).
	  PERF: colliding/clickable/animated things are zone parts; decoration that never moves or collides is
	  merged into catkit groups (one draw call per material bucket per <= 56 prims); EVERY piece of text in
	  the zone (about 200: stair numbers, keycaps, the 26 keyboard letters, tile numbers, boards, the void
	  map) is ONE canvas atlas drawn as ONE mesh, instead of a texture + draw call per label.
*/

// ---------------------------------------------------------------------------------------------- palette
const hex2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const C = (r, g, b) => "#" + hex2(r) + hex2(g) + hex2(b);

const WHITE = C(255, 255, 255);
const RAINBOW = [C(255, 60, 60), C(255, 150, 40), C(255, 230, 60), C(70, 220, 100), C(60, 150, 255), C(140, 80, 255), C(255, 90, 210)];
const LOOK_RAINBOW = [C(255, 50, 50), C(255, 150, 30), C(255, 235, 50), C(60, 220, 90), C(50, 150, 255), C(140, 70, 255), C(255, 90, 210)];
const BOARD_DARK = C(40, 10, 70);
const BOARD_PAPER = C(255, 245, 230);
const BOARD_PINK = C(255, 0, 170);
const BOARD_BLACK = C(20, 20, 28);
const POST = C(60, 60, 70);
const STEP_PINK = C(255, 120, 200);
const STEP_BLUE = C(140, 200, 255);
const KEY_PINK = C(255, 170, 225);
const KEY_WHITE = C(235, 235, 245);
const GOLD = C(255, 215, 60);
const RED_NEON = C(255, 60, 60);
const DARK = C(8, 8, 10);
const WOOD_LIGHT = C(180, 130, 80);
const WOOD_DARK = C(110, 75, 50);
const MALL_PINK = C(255, 160, 220);
const MALL_TEAL = C(120, 230, 230);
const CRUST = C(190, 120, 55);
const CRUST2 = C(160, 95, 40);

function hsvHex(h, s, v) {
  const f = (n) => {
    const k = (n + h * 6) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  return C(f(5) * 255, f(3) * 255, f(1) * 255);
}

// ---------------------------------------------------------------------------------------------- looks
// Pure: they only use the catkit K they are handed (the Index paints them with no zone loaded).
export const looks = {};

looks[72] = {
  spin: false,
  look: (K) => {
    const V = K.v;
    const c = K.cat({
      bodyShape: "round", color: K.rgb(255, 60, 190), pattern: "stripes", color2: K.rgb(255, 240, 80),
      eyes: "closed", mouth: "o", tail: "puffy", whiskers: false,
    });
    const m = c.model;
    const hd = c.headD;
    K.ball(m, V(hd * 0.42, hd * 0.36, 0.3), c.attach("mouth", V(0, -0.1, 0.06)), K.rgb(120, 0, 40), { name: "Scream" });
    K.ball(m, V(hd * 0.22, hd * 0.1, 0.2), c.attach("mouth", V(0, -0.25, 0.02)), K.rgb(255, 110, 130), { name: "Tongue" });
    for (const side of [-1, 1]) {
      const e = K.p(c.attach("eyes", V(side * 0.5, 0, 0)));
      K.limb(m, e, K.add(e, V(side * 1.2, 0.55, 0.2)), 0.22, K.rgb(80, 220, 255), { name: "Tear", neon: true });
      K.ball(m, 0.42, K.add(e, V(side * 1.35, 0.65, 0.2)), K.rgb(80, 220, 255), { name: "Tear", neon: true });
    }
    const top = K.p(c.attach("headTop"));
    for (let i = 1; i <= 7; i++) {
      const a = K.rad(-90 + (i - 1) * 30);
      const p = K.add(top, V(Math.sin(a) * 2.1, 0.5 + Math.cos(a) * 1.5, 0.3));
      K.block(m, V(0.85, 0.5, 0.45), K.mul(K.cf(p), K.angles(0, 0, -a)), LOOK_RAINBOW[i - 1], { name: "Rainbow", neon: true });
    }
    return K.finish(m);
  },
};

looks[73] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "tall", color: K.rgb(140, 230, 60), eyes: "derp", mouth: "teeth", tail: "curly", innerEars: false });
  const m = c.model;
  const hd = c.headD;
  const h = c.attach("head");
  K.block(m, V(hd * 1.18, 0.22, 0.38), c.attach("headTop", V(0, 0.05, 0.1)), K.C.black, { name: "Headphones" });
  for (const side of [-1, 1]) {
    K.cyl(m, 0.4, 0.95, K.mul(h, K.cf(side * hd * 0.55, 0, 0.1), K.rot(0, 0, 90)), K.C.red, { name: "Earcup" });
  }
  const top = c.attach("headTop");
  K.cyl(m, 0.45, hd * 0.9, K.mul(top, K.cf(0, -0.05, 0.05)), K.rgb(40, 40, 200), { name: "Cap" });
  K.block(m, V(hd * 0.7, 0.12, 0.9), K.mul(top, K.cf(0, -0.2, hd * 0.55)), K.rgb(40, 40, 200), { name: "Visor" });
  K.cyl(m, 0.16, hd * 0.95, K.mul(c.attach("neck", V(0, -0.15, 0)), K.rot(15, 0, 0)), K.C.gold, { name: "Chain", material: "Foil" });
  K.ball(m, 0.45, c.attach("chest", V(0, 0.9, -0.1)), K.C.gold, { name: "Medallion", material: "Foil" });
  const cols = [K.rgb(255, 60, 200), K.rgb(60, 220, 255), K.rgb(255, 230, 60), K.rgb(120, 255, 90)];
  const feet = K.p(c.attach("feet"));
  let i = 0;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      K.block(m, V(1.5, 0.2, 1.5), K.add(feet, V(sx * 0.78, -0.1, sz * 0.78)), cols[i++], { name: "DiscoTile", neon: true });
    }
  }
  return K.finish(m);
};

looks[74] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.rgb(70, 70, 82), pattern: "tuxedo", color2: K.C.white, eyes: "angry", mouth: "frown", tail: "normal", innerEars: false });
  const m = c.model;
  const hd = c.headD;
  K.acc.sunglasses(c);
  K.acc.bowtie(c, { color: K.C.black });
  K.block(m, V(hd * 0.72, hd * 0.24, hd * 0.42), c.attach("mouth", V(0, -0.28, 0.3)), K.rgb(70, 70, 82), { name: "Jawline" });
  const s = c.attach("side");
  K.block(m, V(0.5, 1.2, 1.7), K.mul(s, K.cf(-0.15, -0.75, 0)), K.C.brown, { name: "Briefcase" });
  K.block(m, V(0.52, 0.12, 1.75), K.mul(s, K.cf(-0.15, -0.6, 0)), K.C.gold, { name: "BriefcaseClasp" });
  K.block(m, V(0.15, 0.3, 0.7), K.mul(s, K.cf(-0.15, 0, 0)), K.C.black, { name: "Handle" });
  const p = K.add(K.p(c.attach("frontLeftPaw")), V(0.9, 0.35, -0.4));
  K.limb(m, K.sub(p, V(0.8, 0, 0)), K.add(p, V(0.8, 0, 0)), 0.16, K.C.silver, { name: "Dumbbell" });
  for (const side of [-1, 1]) {
    K.cyl(m, 0.3, 0.9, K.mul(K.cf(K.add(p, V(side * 0.75, 0, 0))), K.rot(0, 0, 90)), K.C.black, { name: "Weight" });
  }
  const rp = K.p(c.attach("frontRightPaw"));
  K.cyl(m, 0.8, 0.55, K.cf(K.add(rp, V(-0.6, 0.4, -0.6))), K.C.white, { name: "Coffee" });
  K.cyl(m, 0.12, 0.5, K.cf(K.add(rp, V(-0.6, 0.82, -0.6))), K.rgb(90, 50, 20), { name: "CoffeeTop" });
  return K.finish(m);
};

looks[75] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.C.ginger, pattern: "stripes", color2: K.C.cream, eyes: "big", mouth: "smile", tail: "normal" });
  const m = c.model;
  const bs = c.bodySize;
  K.ball(m, V(bs.x * 1.07, bs.y * 1.07, bs.z * 0.62), c.attach("body", V(0, 0, -bs.z * 0.2)), K.rgb(70, 130, 235), { name: "Shirt" });
  const front = K.add(K.p(c.attach("chest")), V(0, 0.55, -1.0));
  K.block(m, V(4.4, 0.35, 1.3), front, K.C.white, { name: "Keys" });
  K.block(m, V(4.6, 0.3, 1.4), K.add(front, V(0, -0.3, 0.02)), K.rgb(40, 40, 45), { name: "KeyboardCase" });
  for (let i = 1; i <= 5; i++) {
    const x = -1.7 + (i - 1) * 0.85;
    K.block(m, V(0.3, 0.2, 0.7), K.add(front, V(x, 0.25, 0.25)), K.C.black, { name: "BlackKey" });
  }
  for (const side of [-1, 1]) {
    K.limb(m, K.add(front, V(side * 1.9, -0.4, 0)), V(front.x + side * 2.3, 0, front.z), 0.18, K.C.silver, { name: "Stand" });
  }
  return K.finish(m);
};

looks[76] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.rgb(150, 165, 190), eyes: "big", mouth: "frown", tail: "long", eyeColor: K.rgb(40, 60, 130) });
  const m = c.model;
  const hd = c.headD;
  const tear = K.rgb(90, 200, 255);
  for (const side of [-1, 1]) {
    const e = K.p(c.attach("eyes", V(side * hd * 0.23, -0.15, -0.05)));
    K.limb(m, e, V(e.x + side * 0.35, 0.15, e.z - 0.5), 0.2, tear, { name: "TearStream", neon: true, transparency: 0.15 });
    K.ball(m, 0.32, K.add(e, V(side * 0.12, -0.35, -0.05)), tear, { name: "TearDrop", neon: true });
  }
  K.block(m, V(hd * 0.3, 0.12, 0.1), c.attach("mouth", V(0, -0.12, -0.02)), K.rgb(255, 130, 150), { name: "WobblyLip" });
  K.cyl(m, 0.1, 4.8, K.cf(K.add(K.p(c.attach("feet")), V(0, 0.05, -1.6))), tear, { name: "Puddle", transparency: 0.35, material: "Glass" });
  const tb = K.add(K.p(c.attach("frontRightPaw")), V(-1.2, 0.4, -0.3));
  K.block(m, V(1.1, 0.8, 0.8), tb, K.rgb(255, 210, 230), { name: "TissueBox" });
  K.ball(m, V(0.5, 0.6, 0.4), K.add(tb, V(0, 0.6, 0)), K.C.white, { name: "Tissue" });
  return K.finish(m);
};

looks[77] = (K) => {
  const V = K.v;
  const c = K.cat({
    bodyShape: "loaf", color: K.C.white, pattern: "calico", color2: K.C.orange, color3: K.C.dark,
    eyes: "sleepy", mouth: "w", tail: "normal", innerEars: false,
  });
  const m = c.model;
  const feet = K.p(c.attach("feet"));
  K.cyl(m, 0.2, 6.2, K.cf(K.add(feet, V(0, -0.15, -0.2))), K.rgb(20, 20, 24), { name: "Vinyl" });
  K.cyl(m, 0.22, 5.0, K.cf(K.add(feet, V(0, -0.14, -0.2))), K.rgb(45, 45, 52), { name: "Groove" });
  K.cyl(m, 0.24, 2.0, K.cf(K.add(feet, V(0, -0.13, -0.2))), K.rgb(230, 40, 90), { name: "Label" });
  const note = K.add(K.p(c.attach("headTop")), V(1.6, 0.9, 0));
  K.limb(m, note, K.add(note, V(0, 1.2, 0)), 0.14, K.C.black, { name: "Note" });
  K.ball(m, V(0.55, 0.42, 0.3), K.add(note, V(-0.2, -0.05, 0)), K.C.black, { name: "Note" });
  K.block(m, V(0.5, 0.15, 0.14), K.add(note, V(0.25, 1.1, 0)), K.C.black, { name: "Note" });
  return K.finish(m);
};

looks[78] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "long", color: K.C.white, eyes: "normal", mouth: "o", tail: "long", eyeColor: K.rgb(50, 40, 30) });
  const m = c.model;
  const bs = c.bodySize;
  const side = c.attach("body", V(-bs.x / 2 - 0.08, 0.15, 0));
  K.block(m, V(0.1, 0.45, bs.z * 0.85), side, K.C.yellow, { name: "Ruler" });
  for (let i = 0; i <= 5; i++) {
    const zz = -bs.z * 0.4 + i * bs.z * 0.16;
    K.block(m, V(0.12, 0.22, 0.08), K.mul(side, K.cf(0, 0.1, zz)), K.C.black, { name: "Tick" });
  }
  K.block(m, V(0.1, 0.4, 0.9), c.attach("body", V(bs.x / 2 + 0.06, 0.25, -1.5)), K.rgb(255, 120, 160), { name: "Sticker" });
  return K.finish(m, { fit: 13 });
};

looks[79] = (K) => {
  const V = K.v;
  const c = K.cat({
    bodyShape: "round", color: K.rgb(255, 150, 50), eyes: "derp", mouth: "w", tail: "none", legs: false,
    material: "Glass", whiskers: false,
  });
  const m = c.model;
  const bp = K.p(c.attach("body"));
  K.cyl(m, 3.2, 3.7, K.cf(bp.x, 1.6, bp.z), K.rgb(190, 235, 255), { name: "Jar", material: "Glass", transparency: 0.6 });
  K.cyl(m, 0.25, 3.9, K.cf(bp.x, 3.25, bp.z), K.rgb(120, 230, 255), { name: "Rim", neon: true });
  const spill = V(bp.x + 2.0, 0.06, bp.z - 1.8);
  const orange = K.rgb(255, 150, 50);
  K.cyl(m, 0.12, 2.6, K.cf(spill), orange, { name: "Puddle", material: "Glass" });
  K.limb(m, V(bp.x + 1.7, 3.2, bp.z - 0.6), V(bp.x + 2.0, 1.4, bp.z - 1.2), 0.35, orange, { name: "Drip", material: "Glass" });
  K.limb(m, V(bp.x + 2.0, 1.4, bp.z - 1.2), spill, 0.35, orange, { name: "Drip", material: "Glass" });
  return K.finish(m);
};

looks[80] = (K) => {
  const V = K.v;
  const c = K.cat({
    color: K.rgb(255, 170, 215), pattern: "spots", color2: K.rgb(150, 220, 255), eyes: "heart", mouth: "w",
    tail: "puffy", innerEarColor: K.rgb(150, 220, 255), whiskers: false,
  });
  const m = c.model;
  const hd = c.headD;
  for (const side of [-1, 1]) {
    K.ball(m, V(0.45, 0.24, 0.14), c.attach("face", V(side * hd * 0.3, -hd * 0.12, 0.1)), K.rgb(255, 90, 150), { name: "Blush", neon: true });
  }
  const back = c.attach("back");
  for (let i = 1; i <= 5; i++) {
    const zz = -1.2 + (i - 1) * 0.55;
    K.wedge(m, V(0.14, 0.55, 0.55), K.mul(back, K.cf(0, 0.2, zz)), K.rgb(110, 220, 120), { name: "DinoSpike" });
  }
  K.acc.bowtie(c, { at: K.mul(c.attach("leftEar"), K.cf(0, -0.35, 0)), color: K.rgb(255, 80, 170), scale: 0.9 });
  return K.finish(m);
};

looks[81] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.rgb(255, 150, 220), pattern: "stripes", color2: K.rgb(80, 240, 255), eyes: "normal", mouth: "smile", tail: "long", whiskers: false });
  const m = c.model;
  K.acc.sunglasses(c, { color: K.rgb(255, 60, 190) });
  const feet = K.p(c.attach("feet"));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const col = sx * sz > 0 ? K.rgb(250, 250, 250) : K.rgb(40, 20, 60);
      K.block(m, V(2.4, 0.2, 2.6), K.add(feet, V(sx * 1.2, -0.1, sz * 1.3)), col, { name: "Checker" });
    }
  }
  const sun = c.attach("body", V(0, 1.4, 2.6));
  K.cyl(m, 0.2, 5.2, K.mul(sun, K.rot(90, 0, 0)), K.rgb(255, 120, 80), { name: "Sunset", neon: true });
  for (let j = 1; j <= 3; j++) {
    K.block(m, V(5.4, 0.28, 0.12), K.mul(sun, K.cf(0, -0.5 - (j - 1) * 0.75, 0.2)), K.rgb(120, 40, 160), { name: "SunStripe" });
  }
  const base = K.add(feet, V(-2.3, 0, 1.6));
  const crown = K.add(base, V(0.3, 4.0, 0));
  K.limb(m, base, crown, 0.35, K.rgb(150, 100, 60), { name: "PalmTrunk" });
  for (let k = 0; k <= 3; k++) {
    const a = K.rad(k * 90 + 45);
    K.ball(m, V(2.2, 0.15, 0.7), K.mul(K.cf(crown), K.angles(0, a, 0), K.cf(1.0, -0.2, 0), K.rot(0, 0, -20)), K.rgb(60, 230, 160), { name: "PalmLeaf" });
  }
  return K.finish(m, { fit: 7 });
};

looks[82] = (K) => {
  const V = K.v;
  const c = K.cat({ color: K.rgb(235, 200, 150), eyes: "normal", mouth: "smile", tail: "normal", innerEars: false });
  const m = c.model;
  const bs = c.bodySize;
  K.ball(m, V(bs.x * 1.07, bs.y * 1.07, bs.z * 0.65), c.attach("body", V(0, 0, -bs.z * 0.18)), K.rgb(30, 40, 90), { name: "Suit" });
  K.block(m, V(0.3, 0.9, 0.12), c.attach("chest", V(0, 0.15, -0.05)), K.rgb(40, 200, 90), { name: "Tie" });
  K.cyl(m, 0.08, 0.6, K.mul(c.attach("eyes", V(c.headD * 0.23, 0, -0.1)), K.rot(90, 0, 0)), K.C.gold, { name: "Monocle" });
  for (const paw of ["frontLeftPaw", "frontRightPaw"]) {
    K.ball(m, 0.6, c.attach(paw, V(0, 0.05, -0.1)), K.rgb(120, 240, 255), { name: "DiamondPaw", neon: true });
  }
  const g = K.rgb(40, 230, 90);
  const base = K.p(c.attach("body", V(-1.6, 0.2, 1.4)));
  const pts = [base, K.add(base, V(0.6, 1.2, 0)), K.add(base, V(1.1, 0.7, 0)), K.add(base, V(1.9, 2.4, 0)), K.add(base, V(2.4, 1.9, 0)), K.add(base, V(3.2, 3.8, 0))];
  for (let i = 0; i < pts.length - 1; i++) K.limb(m, pts[i], pts[i + 1], 0.32, g, { name: "Arrow", neon: true });
  K.wedge(m, V(0.35, 0.9, 0.9), K.mul(K.cf(K.add(pts[pts.length - 1], V(0.15, 0.35, 0))), K.rot(0, 90, -25)), g, { name: "ArrowHead", neon: true });
  const feet = K.p(c.attach("feet"));
  for (let i = 0; i <= 2; i++) {
    K.cyl(m, 0.15, 0.8, K.cf(K.add(feet, V(1.6, 0.08 + i * 0.16, -1.4))), K.C.gold, { name: "GoldStack", material: "Foil" });
  }
  return K.finish(m);
};

looks[83] = (K) => {
  const V = K.v;
  const c = K.cat({ bodyShape: "cube", color: K.rgb(215, 160, 80), eyes: "big", mouth: "w", tail: "none", earColor: K.C.grey, whiskers: false });
  const m = c.model;
  if (c.head) c.head.color = K.C.grey;
  const bs = c.bodySize;
  const body = c.attach("body");
  const dark = K.rgb(160, 105, 40);
  for (const i of [-1, 1]) {
    K.block(m, V(bs.x * 1.02, 0.1, 0.16), K.mul(body, K.cf(0, bs.y / 2, i * bs.z * 0.22)), dark, { name: "WaffleLine" });
    K.block(m, V(0.16, 0.1, bs.z * 1.02), K.mul(body, K.cf(i * bs.x * 0.22, bs.y / 2, 0)), dark, { name: "WaffleLine" });
    K.block(m, V(0.1, bs.y * 1.02, 0.16), K.mul(body, K.cf(bs.x / 2, 0, i * bs.z * 0.22)), dark, { name: "WaffleLine" });
    K.block(m, V(0.1, bs.y * 1.02, 0.16), K.mul(body, K.cf(-bs.x / 2, 0, i * bs.z * 0.22)), dark, { name: "WaffleLine" });
  }
  K.block(m, V(0.8, 0.3, 0.8), K.mul(body, K.cf(0.2, bs.y / 2 + 0.15, 0.3)), K.rgb(255, 235, 120), { name: "Butter" });
  K.limb(m, K.p(K.mul(body, K.cf(bs.x / 2, bs.y / 2, -0.4))), K.p(K.mul(body, K.cf(bs.x / 2 + 0.05, 0, -0.5))), 0.2, K.rgb(150, 70, 10), { name: "Syrup", material: "Glass" });
  const h = bs.y / 6;
  for (let i = 1; i <= 6; i++) {
    K.block(m, V(bs.x * 0.8, h, 4), K.mul(body, K.cf(0, bs.y / 2 - h * (i - 0.5), bs.z / 2 + 2)), LOOK_RAINBOW[i - 1], { name: "Trail", neon: true });
  }
  return K.finish(m);
};

looks[84] = (K) => {
  const V = K.v;
  const c = K.cat({
    color: K.rgb(55, 30, 120), pattern: "spots", color2: K.rgb(240, 240, 255), eyes: "big", eyeColor: K.rgb(0, 230, 255),
    mouth: "o", tail: "long", innerEarColor: K.rgb(255, 120, 220),
  });
  const m = c.model;
  const hd = c.headD;
  const top = c.attach("headTop");
  const brainC = K.mul(top, K.cf(0, hd * 0.25, 0.05));
  K.ball(m, V(hd * 1.25, hd * 0.75, hd * 1.1), brainC, K.rgb(255, 130, 200), { name: "Brain", neon: true });
  for (let i = -1; i <= 1; i++) {
    K.ball(m, V(0.12, hd * 0.55, hd * 0.95), K.mul(brainC, K.cf(i * hd * 0.25, 0.12, 0)), K.rgb(200, 60, 150), { name: "BrainFold" });
  }
  K.acc.halo(c, { color: K.rgb(0, 230, 255), at: K.mul(top, K.cf(0, -0.1, 0), K.rot(12, 0, 0)), scale: 1.6 });
  for (const p of [V(2.4, 4.5, -0.5), V(-2.3, 3.9, 0.4), V(1.9, 1.2, 1.6), V(-1.8, 1.0, -1.4)]) {
    K.ball(m, 0.4, p, K.rgb(255, 240, 120), { name: "Star", neon: true });
  }
  return K.finish(m);
};

// ---------------------------------------------------------------------------------------------- text atlas
// Every label of the zone is a quad in ONE merged mesh over ONE canvas atlas (a page holds up to
// 2048 x 2048 px; a second page only if the first fills). A quad faces the +Z of its matrix. Quads
// that ride an animated part (`src`) are re-placed from the part's live matrix each heartbeat.
function createTextAtlas(z) {
  const THREE = z.THREE;
  const K = z.K;
  const parts = z.ctx.engine.parts;
  const PAGE = 2048;
  const PAD = 4;
  const items = [];
  const followers = [];
  const pages = [];
  const v = new THREE.Vector3();
  const CORNERS = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
  const FACE = {
    front: { n: [0, 0, -1], wi: 0, hi: 1, r: () => new THREE.Matrix4().makeRotationY(Math.PI) },
    back: { n: [0, 0, 1], wi: 0, hi: 1, r: () => new THREE.Matrix4() },
    right: { n: [1, 0, 0], wi: 2, hi: 1, r: () => new THREE.Matrix4().makeRotationY(Math.PI / 2) },
    left: { n: [-1, 0, 0], wi: 2, hi: 1, r: () => new THREE.Matrix4().makeRotationY(-Math.PI / 2) },
    top: { n: [0, 1, 0], wi: 0, hi: 2, r: () => new THREE.Matrix4().makeRotationX(-Math.PI / 2) },
  };
  const OPP = { front: "back", back: "front", left: "right", right: "left", top: "top" };

  function add(text, w, h, m, o = {}) {
    const it = {
      text: String(text), w, h, m: m.clone(), color: o.color || WHITE, stroke: !!o.stroke, align: o.align,
      draw: o.draw || null, pps: o.pps || 20, maxPx: o.maxPx || 384, src: o.src || null, local: o.local || null,
      last: null, page: null, base: 0, x: 0, y: 0, pw: 0, ph: 0,
    };
    items.push(it);
    if (it.src) followers.push(it);
    return it;
  }
  function faceLocal(size, name, lift = 0.04) {
    const f = FACE[name] || FACE.front;
    const t = new THREE.Matrix4().makeTranslation(f.n[0] * (size[0] / 2 + lift), f.n[1] * (size[1] / 2 + lift), f.n[2] * (size[2] / 2 + lift));
    return { local: t.multiply(f.r()), w: size[f.wi], h: size[f.hi] };
  }
  // text on a face of a box whose world matrix is `cf` (o.both: the opposite face too)
  function face(cf, size, name, text, o = {}) {
    const names = o.both ? [name, OPP[name]] : [name];
    return names.map((nm) => {
      const f = faceLocal(size, nm, o.lift);
      const w = (o.w || f.w) * (o.fill || 1), h = (o.h || f.h) * (o.fill || 1);
      return add(text, w, h, K.mul(cf, f.local), o);
    });
  }
  // text on a part handle's face; o.follow keeps it glued to an animated / moving part
  function onPart(hd, name, text, o = {}) {
    const names = o.both ? [name, OPP[name]] : [name];
    return names.map((nm) => {
      const f = faceLocal(hd.size, nm, o.lift);
      const w = (o.w || f.w) * (o.fill || 1), h = (o.h || f.h) * (o.fill || 1);
      return add(text, w, h, K.mul(hd.cf, f.local), { ...o, src: o.follow ? hd : null, local: f.local });
    });
  }

  function write(it) {
    if (!it.page) return;
    const pos = it.page.pos;
    for (let k = 0; k < 4; k++) {
      v.set(CORNERS[k][0] * it.w, CORNERS[k][1] * it.h, 0).applyMatrix4(it.m);
      pos.setXYZ(it.base + k, v.x, v.y, v.z);
    }
    pos.needsUpdate = true;
  }
  function follow() {
    for (const it of followers) {
      const cf = it.src.cf;
      if (it.last && it.last.equals(cf)) continue;
      it.last = (it.last || new THREE.Matrix4()).copy(cf);
      it.m.multiplyMatrices(cf, it.local);
      write(it);
    }
  }

  function commit() {
    // shelf-pack, tallest first
    for (const it of items) {
      const s = Math.min(it.pps, it.maxPx / Math.max(it.w, it.h, 0.1));
      it.pw = Math.max(8, Math.min(PAGE, Math.round(it.w * s)));
      it.ph = Math.max(8, Math.min(PAGE, Math.round(it.h * s)));
    }
    const order = items.slice().sort((a, b) => b.ph - a.ph);
    let page = null, x = 0, y = 0, shelf = 0;
    const newPage = () => { page = { items: [], used: 0 }; pages.push(page); x = 0; y = 0; shelf = 0; };
    newPage();
    for (const it of order) {
      if (x + it.pw > PAGE) { y += shelf + PAD; x = 0; shelf = 0; }
      if (y + it.ph > PAGE) newPage();
      it.x = x; it.y = y;
      x += it.pw + PAD;
      shelf = Math.max(shelf, it.ph);
      page.used = Math.max(page.used, y + it.ph);
      page.items.push(it);
    }
    const tmp = document.createElement("canvas");
    for (const pg of pages) {
      if (!pg.items.length) continue;
      const W = PAGE, H = Math.min(PAGE, Math.ceil((pg.used + PAD) / 4) * 4);
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const g = canvas.getContext("2d", { willReadFrequently: true });
      const n = pg.items.length;
      const pos = new THREE.BufferAttribute(new Float32Array(n * 12), 3);
      const uv = new Float32Array(n * 8);
      const idx = [];
      pg.pos = pos;
      pg.items.forEach((it, i) => {
        tmp.width = it.pw;
        tmp.height = it.ph;
        if (it.draw) {
          const tg = tmp.getContext("2d", { willReadFrequently: true });
          tg.clearRect(0, 0, it.pw, it.ph);
          it.draw(tg, it.pw, it.ph);
        } else {
          K.drawFitText(tmp, it.text, it.color, null, { stroke: it.stroke ? "#000000" : null, align: it.align });
        }
        g.drawImage(tmp, it.x, it.y);
        const u0 = (it.x + 0.5) / W, u1 = (it.x + it.pw - 0.5) / W;
        const vT = 1 - (it.y + 0.5) / H, vB = 1 - (it.y + it.ph - 0.5) / H;
        uv.set([u0, vB, u1, vB, u1, vT, u0, vT], i * 8);
        idx.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
        it.page = pg;
        it.base = i * 4;
        write(it);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", pos);
      geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const tex = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      pg.geo = geo; pg.mat = mat; pg.tex = tex;
      pg.id = parts.addCustom(mesh);
    }
  }
  function dispose() {
    for (const pg of pages) {
      if (pg.id != null) { try { parts.remove(pg.id); } catch { /* already gone */ } }
      for (const r of [pg.geo, pg.mat, pg.tex]) { if (r) { try { r.dispose(); } catch { /* fine */ } } }
    }
    pages.length = 0;
    items.length = 0;
    followers.length = 0;
  }
  return {
    add, face, onPart, commit, follow, dispose, write,
    setMatrix: (it, m) => { it.m.copy(m); write(it); },
    stats: () => ({ items: items.length, pages: pages.length }),
  };
}

// ---------------------------------------------------------------------------------------------- build
export function build(z) {
  const K = z.K;
  const THREE = z.THREE;
  const parts = z.ctx.engine.parts;
  const V = K.v;

  // our own scene objects: merged decoration groups, decoy cats and the text atlas. Registered first,
  // so a throw anywhere below still lets the kit's teardown free them.
  const groups = [];
  const TX = createTextAtlas(z);
  const timers = [];
  z.onLeave(() => {
    for (const g of groups) {
      try { parts.remove(g.id); } catch { /* already gone */ }
      K.disposeGroup(g.g);
    }
    groups.length = 0;
    timers.length = 0;
    TX.dispose();
  });
  function addGroup(g, worldPos) {
    g.position.copy(worldPos);
    groups.push({ g, id: parts.addCustom(g) });
    return g;
  }

  // ---- decoration batches (world coordinates, merged <= 56 prims per group) ---------------------
  let dmodel = null;
  function flush() {
    const m = dmodel;
    dmodel = null;
    if (!m || !m.prims.length) return;
    const b = K.bounds(m);
    addGroup(K.finish(m), b.center);
  }
  function dm() {
    if (dmodel && dmodel.prims.length >= 56) flush();
    if (!dmodel) dmodel = K.model("z6deco");
    return dmodel;
  }
  const dopts = (o = {}) => ({ neon: !!o.neon, transparency: o.transparency || 0, material: o.material });
  const D = {
    box: (size, cf, color, o) => K.block(dm(), size, cf, color, dopts(o)),
    ball: (size, cf, color, o) => K.ball(dm(), size, cf, color, dopts(o)),
    vcyl: (len, d, cf, color, o) => K.cyl(dm(), len, d, cf, color, dopts(o)),              // axis = cf's Y
    xcyl: (len, d, cf, color, o) => K.cyl(dm(), len, d, K.mul(cf, K.rot(0, 0, 90)), color, dopts(o)), // the original's X-axis cylinder
    wedge: (size, cf, color, o) => K.wedge(dm(), size, cf, color, dopts(o)),
    limb: (p0, p1, d, color, o) => K.limb(dm(), p0, p1, d, color, dopts(o)),
  };
  const at = (x, y, zz, ry) => z.cf(x, y, zz, ry || 0);

  // ---- zone parts ----------------------------------------------------------------------------------
  function P(size, x, y, zz, color, o = {}) {
    return z.part({
      shape: o.shape, size, cf: o.cf || at(x, y, zz, o.ry), color, material: o.material, neon: o.neon,
      transparency: o.transparency, collide: o.collide, decor: o.decor, dynamic: o.dynamic, light: o.light,
    });
  }
  // an invisible collider (draws nothing; pairs with merged decoration)
  const INV = (size, x, y, zz, o = {}) => P(size, x, y, zz, WHITE, { ...o, transparency: 1 });
  const VC = (h, d, x, y, zz, color, o = {}) => P([d, h, d], x, y, zz, color, { ...o, shape: "cylinder" });

  // ---- timers and sounds --------------------------------------------------------------------------
  const after = (s, fn) => { timers.push({ t: z.time() + s, fn }); };
  z.heartbeat((dt, t) => {
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].t <= t) {
        const fn = timers[i].fn;
        timers.splice(i, 1);
        fn();
      }
    }
    TX.follow();
  });
  const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const me = () => z.player.pos();
  const centre = () => { const p = me(); return [p[0], p[1] + 2.5, p[2]]; };
  function laugh() {
    for (let i = 0; i <= 5; i++) after(i * 0.11, () => z.tone(1.5 + (i % 2) * 0.45 + i * 0.05, { volume: 0.7 }));
  }
  function jingle() {
    [1.0, 1.26, 1.5, 2.0].forEach((n, i) => after(i * 0.13, () => z.tone(n)));
  }
  const clean = (text) => String(text == null ? "" : text).toUpperCase().replace(/\s/g, "");

  // a board with text on both faces (ry: 0 faces north, 90 west, -90 east, 180 south)
  function board(x, y, zz, ry, w, h, text, bg, fg, post, o = {}) {
    const cf = at(x, y, zz, ry);
    const p = P([w, h, 0.6], x, y, zz, bg, { ry });
    TX.face(cf, [w, h, 0.6], "front", text, { color: fg || WHITE, both: true, pps: o.pps || 24, maxPx: 512, stroke: o.stroke });
    if (post) P([0.8, y - h / 2, 0.8], x, (y - h / 2) / 2, zz, POST, { ry });
    return p;
  }

  // click (or [E]) -> text box -> answer check, with a lockout on wrong answers
  function terminal(part, n, key, opts, answer, onRight) {
    const use = () => {
      if (z.has(n) || z.isUnlocked(n)) return z.notify("Already open! Go grab the cat.");
      const left = z.isLocked(key);
      if (left) return z.fail("The terminal is sulking. Try again in " + left + " s.");
      z.input(opts, (text) => {
        if (clean(text) === answer) {
          jingle();
          onRight();
        } else {
          z.lockout(20, key);
          z.fail("HAHAHAHA nope. Locked for 20 s.");
        }
      });
      return undefined;
    };
    z.click(part, use, { distance: 20 });
    // [E] fires inside the keydown; opening the text box right there would let that same key's
    // character land in the freshly focused field ("eBRAINROT"). Open it on the next tick instead.
    z.prompt(part, opts.title || "Type", () => { pendingUse = use; }, { distance: 9 });
  }
  let pendingUse = null;
  z.heartbeat(() => {
    if (!pendingUse) return;
    const f = pendingUse;
    pendingUse = null;
    f();
  });

  // ================================================================================== ground + sky
  const GROUND = [C(255, 170, 220), C(170, 140, 255), C(140, 220, 255), C(150, 255, 190), C(255, 245, 150), C(255, 190, 140)];
  for (let i = 0; i <= 5; i++) {
    for (let j = 0; j <= 5; j++) P([65, 2, 65], -162.5 + i * 65, -1, -162.5 + j * 65, GROUND[(i + j) % 6]);
  }
  for (let i = 1; i <= 5; i++) {
    const c = -195 + i * 65;
    D.box(V(0.6, 0.2, 390), at(c, 0.1, 0), C(255, 60, 220), { neon: true });
    D.box(V(360, 0.2, 0.6), at(15, 0.1, c), C(60, 230, 255), { neon: true });
  }
  flush();

  // giant rainbow arch over the middle avenue (x -70..70 at z 60); segments follow the arch
  for (let band = 1; band <= 7; band++) {
    const r = 70 - (band - 1) * 3;
    for (let s = 0; s <= 11; s++) {
      const a = K.rad(s * 15 + 7.5);
      const x = -Math.cos(a) * r, y = Math.sin(a) * r;
      D.box(V(r * 0.27, 3, 3), K.mul(at(x, y, 60), K.angles(0, 0, Math.PI / 2 - a)), RAINBOW[band - 1], { neon: true });
    }
  }
  flush();

  // floating meme props
  const spinWords = [["LOL", -110, 50, -60], ["BRUH", 40, 55, -60], ["POG", 110, 60, 70], [":3", -40, 45, -130], ["XD", -120, 55, 110], ["OOF", 0, 70, 130]];
  spinWords.forEach((w, i) => {
    const p = P([12, 12, 12], w[1], w[2], w[3], RAINBOW[i], { decor: true, dynamic: true });
    TX.onPart(p, "front", w[0], { color: WHITE, both: true, stroke: true, follow: true, pps: 10 });
    TX.onPart(p, "right", w[0], { color: WHITE, both: true, stroke: true, follow: true, pps: 10 });
    z.tag(p, "Spin", { axis: "y", speed: 35 + (i + 1) * 5 });
  });
  const qs = [[-150, 35, -100], [60, 40, -110], [-20, 38, 40], [120, 45, 30], [-100, 40, 160], [175, 35, -60]];
  qs.forEach((q, i) => {
    const p = P([7, 7, 7], q[0], q[1], q[2], C(255, 210, 40), { decor: true, dynamic: true });
    TX.onPart(p, "front", "?", { color: C(140, 70, 0), both: true, follow: true, pps: 10 });
    TX.onPart(p, "right", "?", { color: C(140, 70, 0), both: true, follow: true, pps: 10 });
    z.tag(p, "Bob", { amp: 2, period: 3 + (i + 1) * 0.4 });
  });
  for (const s of [[-60, 65, -40], [150, 75, -30], [-150, 70, 60]]) {
    const [x, y, zz] = s;
    const fz = x < 0 ? 1 : -1;
    D.ball(16, at(x, y, zz), C(255, 225, 50));
    for (const sx of [-1, 1]) D.ball(V(2.5, 4, 2.5), at(x + sx * 3, y + 2, zz + fz * 7.2), C(30, 30, 30));
    D.box(V(7, 1.2, 1.2), at(x, y - 3, zz + fz * 7.4), C(30, 30, 30));
  }
  D.box(V(12, 6, 1), at(-130, 42, -8), C(20, 20, 25));
  D.box(V(12, 6, 1), at(-130, 42, 8), C(20, 20, 25));
  D.box(V(1, 1.2, 6), at(-130, 44, 0), C(20, 20, 25));
  D.wedge(V(2, 14, 18), K.mul(at(80, 50, 60), K.angles(Math.PI / 2, 0, K.rad(20))), C(255, 200, 80));
  for (let k = 1; k <= 3; k++) {
    D.xcyl(2.3, 3, K.mul(at(80 + k * 1.2 - 2, 50 + k * 2 - 4, 60 + k * 1.5 - 3), K.rot(0, 0, 20)), C(200, 40, 30));
  }
  flush();

  // ================================================================================== plaza (spawn side)
  for (const sz of [-16, 16]) P([3, 22, 3], -160, 11, sz, C(255, 80, 200), { neon: true });
  {
    const cf = at(-160, 24.5, 0, 90);
    P([36, 5, 3], 0, 0, 0, BOARD_DARK, { cf });
    TX.face(cf, [36, 5, 3], "front", "WELCOME TO THE MEME DIMENSION", { color: C(255, 240, 80), both: true, stroke: true });
  }
  board(-150, 9, -30, 90, 22, 13,
    "THE MEME DIMENSION\n13 cats. All of them are weird.\n\nLaugh Theater: north-west\nInfinite Staircase: north\nBreadloaf Mountain: north-east\nGiant Keyboard + Keycap Tower: east\nThe ... Room + Morse Tower: middle\nMeow Mall: south\nQuiet Corner: south-west\nRainbow Void: south-east",
    BOARD_DARK, WHITE, true);

  // numbered signs (#1..#8, first letters spell BRAINROT for cat 80)
  function numbered(n, x, zz, ry, text) {
    const b = board(x, 7, zz, ry, 14, 6, text, BOARD_PAPER, C(60, 20, 90), true);
    const bcf = at(x, 7, zz, ry);
    D.vcyl(0.8, 4, K.mul(bcf, K.cf(-7, 3, 0), K.rot(90, 0, 0)), C(255, 200, 40), { material: "metal" });
    TX.add("#" + n, 3, 2.6, K.mul(bcf, K.cf(-7, 3, -0.45), K.rot(0, 180, 0)), { color: C(120, 50, 0) });
    TX.add("#" + n, 3, 2.6, K.mul(bcf, K.cf(-7, 3, 0.45)), { color: C(120, 50, 0) });
    return b;
  }
  numbered(1, -150, 28, 90, "BREAD IS JUST A SPONGE THAT BELIEVES IN ITSELF");
  numbered(2, -62, -125, 90, "RAINBOWS ARE JUST THE SKY BUFFERING");
  numbered(3, 16, -96, 180, "ALL CATS ARE LIQUID. SOME ARE JUST SLOW LIQUID");
  numbered(4, 150, -157, 180, "IF YOU CAN READ THIS, YOU ARE INSIDE A LOAF OF BREAD");
  numbered(5, 64, 14, 90, "NOBODY: ... ABSOLUTELY NOBODY: ... THIS KEYBOARD: CLACK");
  numbered(6, 38, 122, 90, "REMEMBER: THE VOID IS RAINBOW BUT IT IS STILL A VOID");
  numbered(7, -85, 182, 0, "ONLY REAL ONES SHOP AT THE MEOW MALL");
  numbered(8, -160, 182, 0, "THIS SIGN HAS NOTHING TO SAY... OR DOES IT");
  flush();

  // ================================================================================== 80 UwU Vault (plaza NW)
  {
    P([2, 18, 24], -126, 9, -55, C(255, 170, 215));
    const heartC = C(255, 60, 160);
    D.ball(6, at(-127.5, 13, -57), heartC, { neon: true });
    D.ball(6, at(-127.5, 13, -53), heartC, { neon: true });
    D.box(V(1, 6, 6), K.mul(at(-127.5, 10.6, -55), K.rot(45, 0, 0)), heartC, { neon: true });
    P([7, 2, 7], -134, 1, -55, C(150, 220, 255));
    z.cat(80, at(-134, 2, -55, 90), { locked: true });
    board(-146, 7, -64, 90, 12, 8,
      "THE UwU VAULT owo\nEight NUMBERED signs (gold badges #1 to #8) are hidden around this dimension.\nRead them in order. Their FIRST letters spell the password.",
      BOARD_PAPER, C(120, 20, 90), true);
    const term = P([2, 4, 3], -145, 2, -48, STEP_PINK);
    TX.onPart(term, "left", "PASSWORD\n(click)", { color: WHITE, stroke: true });
    terminal(term, 80, "vault", { title: "UwU VAULT PASSWORD", hint: "8 letters", kind: "text", max: 12 }, "BRAINROT", () => {
      z.unlock(80);
      z.notify("OwO what's this?! The vault is open! Rawr XD");
    });
  }

  // ================================================================================== 82 Meme Market + cipher chain
  {
    D.box(V(4, 4, 16), at(-146, 2, 55), C(30, 160, 80));
    INV([4, 4, 16], -146, 2, 55);
    for (let i = 0; i <= 3; i++) D.box(V(6, 0.6, 4), at(-146, 12, 49 + i * 4), i % 2 === 0 ? C(40, 210, 100) : WHITE);
    D.box(V(0.8, 12, 0.8), at(-148.6, 6, 47.5), C(220, 220, 220));
    D.box(V(0.8, 12, 0.8), at(-148.6, 6, 62.5), C(220, 220, 220));
    P([1, 12, 16], -133, 8, 55, BOARD_BLACK);
    const pts = [[62, 4], [59, 8], [57, 6], [54, 11], [52, 9], [49, 13]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      D.limb(z.pos(-133.7, a[1], a[0]), z.pos(-133.7, b[1], b[0]), 0.5, C(40, 255, 110), { neon: true });
    }
    P([6, 2, 6], -140, 1, 55, GOLD);
    z.cat(82, at(-140, 2, 55, 90), { locked: true });
    board(-152, 6, 43, 90, 13, 7,
      "THE MEME MARKET\nSECRET NOTE A: every letter in this note went UP by one (A became B). Bring it back DOWN:\n\nMPPL JOTJEF UIF MPBG",
      BOARD_BLACK, C(120, 255, 150), true);
    const term = P([1, 2, 3], -147.5, 5, 55, BOARD_BLACK);
    TX.onPart(term, "left", "PASSWORD\n(click)", { color: C(120, 255, 150) });
    terminal(term, 82, "market", { title: "MEME MARKET PASSWORD", hint: "The last secret note knows it", kind: "text", max: 14 }, "DIAMONDPAWS", () => {
      z.unlock(82);
      z.notify("STONKS! The cage goes UP.");
    });
  }
  flush();

  // ================================================================================== 72 Laugh Theater (NW)
  {
    P([84, 1, 30], -110, 0.5, -152, C(120, 30, 90));
    D.box(V(90, 30, 2), at(-110, 15, -168), C(60, 10, 70));
    INV([90, 30, 2], -110, 15, -168);
    for (let i = 1; i <= 7; i++) D.box(V(90, 1.2, 0.4), at(-110, 6 + i * 3, -166.8), RAINBOW[i - 1], { neon: true });
    for (const sx of [-1, 1]) {
      D.box(V(8, 28, 3), at(-110 + sx * 46, 14, -160), C(200, 20, 40));
      INV([8, 28, 3], -110 + sx * 46, 14, -160);
    }
    const tcf = at(-110, 33, -167);
    D.box(V(50, 6, 1), tcf, BOARD_PINK, { neon: true });
    TX.face(tcf, [50, 6, 1], "back", "THE LAUGH THEATER", { color: WHITE, stroke: true });
    for (let r = 1; r <= 3; r++) P([60, 1.5, 3], -110, 0.75, -122 + r * 6, C(140, 60, 160));
    board(-110, 6, -130, 180, 24, 9,
      "HAHAHAHA\nFive of us. FOUR are fakes.\nThe fakes laugh at YOU (they stare right at you).\nThe real one is too busy laughing at a FAKE.\nClick the real one. Click a fake and... HAHAHAHA.",
      BOARD_PINK, WHITE, true);

    const X = [-140, -125, -110, -95, -80];
    const REAL = 3; // the 4th pillar from the west
    X.forEach((x, i) => {
      P([4, 12, 4], x, 6, -150, C(250, 250, 255), { material: "marble" });
      D.box(V(5, 0.6, 5), at(x, 12.1, -150), RAINBOW[i], { neon: true });
    });
    z.cat(72, at(X[REAL], 12.4, -150, 90), { spin: false });

    // the four fakes: the same look, the same glow and the same bob as the real one, facing SOUTH
    const tier = z.R.TIERS[z.R.tierOf(72)];
    const phase = (72 * 1.7) % (Math.PI * 2);
    const fakes = [];
    X.forEach((x, i) => {
      if (i === REAL) return;
      let g;
      try { g = looks[72].look(K); } catch { g = K.fallback(72); }
      const size = g.userData.size;
      const ctr = new THREE.Vector3(...z.pos(x, 12.4 + size.y / 2 + 0.6, -150));
      g.quaternion.setFromRotationMatrix(at(0, 0, 0, 180));
      addGroup(g, ctr);
      const d = Math.max(size.x, size.z) + 1.2;
      const glow = z.part({
        shape: "cylinder", size: [d, 0.15, d], at: [x, 12.4 + 0.15, -150], color: tier.color, material: "neon",
        transparency: 0.35, collide: false, dynamic: true,
        light: { color: tier.color, intensity: 1.4, range: 10 + Math.min(z.R.tierOf(72), 12) },
      });
      const hb = P([size.x + 0.5, size.y + 0.5, size.z + 0.5], x, ctr.y - z.origin[1], -150, WHITE, { transparency: 1, collide: false });
      z.click(hb, () => {
        laugh();
        z.fail("HAHAHAHA! FAKE! That one was laughing at YOU.");
        z.respawn();
      }, { distance: 32 });
      fakes.push({ g, ctr, glow });
    });
    let fx = 0;
    z.heartbeat((dt, t) => {
      for (const f of fakes) f.g.position.set(f.ctr.x, f.ctr.y + Math.sin(t * 2 + phase) * 0.35, f.ctr.z);
      fx += dt;
      if (fx < 0.1) return;
      fx = 0;
      const col = hsvHex(Math.floor(((t / 2) % 1) * 24) / 24, 1, 1);
      for (const f of fakes) f.glow.setColor(col);
    });
  }
  flush();

  // ================================================================================== 73 Infinite Staircase (N)
  {
    const STEPS = 20, RISE = 1.05, RUN = 4;
    const stepC = [STEP_PINK, STEP_BLUE];
    for (let i = 1; i <= STEPS; i++) {
      const top = i * RISE;
      const zz = -100 - (i - 0.5) * RUN;
      P([14, RISE, RUN], 0, top - RISE / 2, zz, stepC[i % 2]);
      for (const sx of [-1, 1]) {
        const unlucky = i === 13 && sx > 0;
        const size = [1, top, RUN];
        P(size, sx * 7.5, top / 2, zz, C(80, 40, 130), { collide: !unlucky });
        TX.face(at(sx * 7.5, top / 2, zz), size, sx > 0 ? "right" : "left", String(i), {
          color: C(255, 240, 120), stroke: true, w: 3.4, h: Math.min(3, top * 0.95), pps: 16,
        });
      }
    }
    const topY = STEPS * RISE;
    P([18, topY, 14], 0, topY / 2, -187, C(80, 40, 130));
    const pad = P([12, 0.3, 10], 0, topY + 0.15, -187, C(255, 230, 60), { neon: true });
    board(0, topY + 6, -193, 0, 14, 5, "CONGRATULATIONS! YOU REACHED THE TOP!\n...of the FIRST staircase. HAHAHAHA", BOARD_PINK, WHITE, false);
    z.touch(pad, () => {
      laugh();
      z.notify("HAHAHAHA! The staircase is INFINITE! Back to the bottom!");
      z.player.teleport([0, 4, -93], 180);
    }, { cooldown: 1.5 });
    board(-16, 7, -96, 180, 14, 8,
      "THE INFINITE STAIRCASE\n20 steps. Infinite disappointment.\nThe walls are numbered. Unlucky 13 never holds anything up.\nWalk into your bad luck.",
      C(80, 40, 130), C(255, 240, 120), true);
    // secret disco room under the stairs
    P([3, 3, 3], 0, 11, -160, C(220, 220, 255), { shape: "sphere", material: "metal", decor: true, light: { color: C(255, 120, 230), intensity: 2, range: 24 } });
    for (let k = 0; k <= 3; k++) {
      const p = P([5, 0.2, 5], -2.75 + (k % 2) * 5.5, 0.1, -162 + Math.floor(k / 2) * 5.5, RAINBOW[k * 2], { neon: true, decor: true });
      z.tag(p, "Rainbow", { period: 2 + k * 0.3 });
    }
    z.cat(73, at(0, 0.2, -164, 180));
    const scf = at(-6.8, 9, -164);
    D.box(V(0.4, 3, 12), scf, C(255, 60, 200), { neon: true });
    TX.face(scf, [0.4, 3, 12], "right", "SKIBIDI BOP BOP", { color: WHITE, stroke: true });
  }
  flush();

  // ================================================================================== Breadloaf Mountain (NE)
  {
    const cx = 130, cz = -140, R = 40;
    P([100, 30, 2], cx, 15, -179, CRUST);
    P([44, 30, 2], 102, 15, -101, CRUST);
    P([44, 30, 2], 158, 15, -101, CRUST);
    P([12, 16, 2], cx, 22, -101, CRUST);
    P([2, 30, 80], 81, 15, cz, CRUST);
    P([2, 30, 80], 179, 15, cz, CRUST);
    for (const x of [81, 179]) D.xcyl(2, R * 2, at(x, 30, cz), CRUST);
    for (let k = 1; k <= 7; k++) {
      const phi = K.rad((k - 0.5) * 180 / 7);
      const zz = cz + R * Math.cos(phi);
      const y = 30 + R * Math.sin(phi);
      P([100, 2, 18.6], 0, 0, 0, k === 4 ? CRUST2 : CRUST, { cf: K.mul(at(cx, y, zz), K.angles(Math.PI / 2 - phi, 0, 0)), decor: true });
    }
    D.box(V(22, 3, 14), at(cx, 71.4, cz), C(255, 235, 120));
    for (let k = 0; k <= 2; k++) D.box(V(2, 1, 30), K.mul(at(100 + k * 30, 70.2, cz), K.rot(0, 25, 0)), C(240, 210, 150));
    const tcf = at(cx, 34, -99.5);
    D.box(V(40, 5, 1), tcf, C(250, 225, 170));
    TX.face(tcf, [40, 5, 1], "back", "BREADLOAF MOUNTAIN", { color: C(120, 60, 20) });
    for (let k = 0; k <= 3; k++) {
      P([3, 3, 3], 92 + k * 26, 24, -125 - (k % 2) * 45, C(255, 210, 140), {
        shape: "sphere", neon: true, decor: true, light: { color: C(255, 200, 130), intensity: 1.5, range: 30 },
      });
    }
    // inner wall (squeeze past its east end) hiding the map
    P([88, 30, 2], 126, 15, -160, C(245, 220, 170));
    board(108, 8, -158.5, 180, 16, 8,
      "SECRET NOTE B\nThis one went UP by as many letters as there are in the word CAT. Bring it back down:\n\nJR WR WKH PDOO IRXQWDLQ",
      BOARD_PAPER, C(110, 50, 10), false);
  }
  flush();

  // ================================================================================== 83 the map (inside the loaf)
  const MAZE = [ // [row] = 7 columns, # = solid
    ".......",
    "#.###.#",
    "#.#.#.#",
    "#.#.#.#",
    "#.#.#.#",
    "###.###",
    "...##.#",
  ];
  {
    // by 12 (the original's 17 put the grid's middle 12 studs over a camera that the inner wall
    // pins close to the map; lower, the whole grid sits in view from the alcove)
    const bx = 125, by = 12, bz = -177.6;
    const bcf = at(bx, by + 1, bz, 180);
    D.box(V(40, 38, 0.6), bcf, C(30, 20, 50));
    // the whole map is one atlas picture, seen from the south (west = left, north = up)
    const W = 40, H = 38, cell = 3.4;
    TX.face(bcf, [W, H, 0.6], "front", "", {
      pps: 12, maxPx: 512,
      draw: (g, pw, ph) => {
        const sx = pw / W, sy = ph / H;
        const px = (x) => (x + W / 2) * sx;       // board-local x (east +) -> canvas x
        const py = (y) => (H / 2 - y) * sy;       // board-local y (up +) -> canvas y
        const text = (s, x, y, size, col) => {
          g.font = `bold ${Math.round(size * sy)}px "Fredoka One", "Arial Rounded MT Bold", sans-serif`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillStyle = col;
          g.fillText(s, px(x), py(y));
        };
        // board-local y: by + (4 - r) * cell - (by + 1) = (4 - r) * cell - 1
        for (let r = 1; r <= 7; r++) {
          for (let c = 1; c <= 7; c++) {
            const solid = MAZE[r - 1][c - 1] === "#";
            const cxl = (c - 4) * cell, cyl = (4 - r) * cell - 1, s = cell - 0.3;
            g.fillStyle = solid ? "#ff50c8" : "#3c3250";
            g.fillRect(px(cxl - s / 2), py(cyl + s / 2), s * sx, s * sy);
          }
        }
        for (let c = 1; c <= 7; c++) text("ABCDEFG"[c - 1], (c - 4) * cell, 4 * cell - 1.2, 2.2, WHITE);
        for (let r = 1; r <= 7; r++) text(String(r), -4 * cell + 0.2, (4 - r) * cell - 1, 2.2, WHITE);
        text("START >", -4 * cell - 3.2, -1, 1.6, "#78ff96");
        text("> END", 4 * cell + 2.4, 2 * cell - 1, 1.6, "#ffdc50");
        text("RAINBOW VOID WALKWAY", 0, 17.4, 2.2, "#ffc8f0");
        text("(seen from above, NORTH is UP, pink = solid)", 0, 15.3, 1.3, "#ffc8f0");
      },
    });
  }
  flush();

  // ================================================================================== 83 Rainbow Void (SE)
  {
    for (let i = 1; i <= 7; i++) D.box(V(12, 0.6, 86), at(96 + (i - 0.5) * 12, 0.3, 143), RAINBOW[i - 1], { neon: true });
    const killer = INV([86, 0.6, 86], 138, 0.3, 143);
    z.kill(killer);
    const glass = { material: "glass", transparency: 0.45 };
    const fence = C(255, 150, 230);
    P([86, 8, 1], 138, 4, 99.5, fence, glass);
    P([86, 8, 1], 138, 4, 186.5, fence, glass);
    P([1, 8, 86], 95.5, 4, 143, fence, glass);
    P([1, 8, 86], 180.5, 4, 143, fence, glass);
    const Y = 24;
    for (let r = 1; r <= 7; r++) {
      for (let c = 1; c <= 7; c++) {
        if (MAZE[r - 1][c - 1] === "#") INV([8, 1, 8], 100 + (c - 0.5) * 8, Y - 0.5, 110 + (r - 0.5) * 8);
      }
    }
    P([18, 1, 12], 91, Y - 0.5, 138, WHITE);
    P([2, Y - 1, 2], 86, (Y - 1) / 2, 138, C(200, 200, 220));
    P([14, 1, 12], 163, Y - 0.5, 122, GOLD);
    P([2, Y - 1, 2], 168, (Y - 1) / 2, 122, C(200, 200, 220));
    // walkable stairs up to the start platform (rise 1 <= the 1.1 step-up)
    for (let k = 1; k <= 24; k++) P([1.5, k, 6], 45.5 + 1.5 * k, k / 2, 138, k % 2 === 0 ? STEP_PINK : STEP_BLUE);
    board(90, Y + 5, 131.5, 180, 14, 7,
      "THE RAINBOW VOID\nThere IS a path to the end. You just can't see it.\nSomeone who loved bread drew a map of it.\nTouch the rainbow = back to spawn.",
      BOARD_DARK, WHITE, false);
    for (let c = 1; c <= 7; c++) {
      z.billboard([100 + (c - 0.5) * 8, Y + 3, 106], "ABCDEFG"[c - 1], { width: 3, height: 3, color: C(255, 240, 120), distance: 200 });
    }
    for (let r = 1; r <= 7; r++) {
      z.billboard([98, Y + 3, 110 + (r - 0.5) * 8], String(r), { width: 3, height: 3, color: C(255, 240, 120), distance: 200 });
    }
    for (const p of [[100, 110], [156, 110], [100, 166], [156, 166]]) {
      D.vcyl(Y + 4, 1.2, at(p[0], (Y + 4) / 2, p[1]), WHITE, { neon: true });
    }
    z.cat(83, at(165, Y, 122, 90));
  }
  flush();

  // ================================================================================== 75 Giant Keyboard (E)
  const NOTE = { A: 0.8, S: 0.898, D: 1.008, F: 1.068, G: 1.199, H: 1.346, J: 1.511, K: 1.6, L: 1.796 };
  {
    P([116, 2, 50], 128, 1, -20, C(45, 45, 55));
    const flash = P([9.2, 0.15, 9.2], 0, -50, 0, C(255, 120, 220), { neon: true, collide: false, decor: true, dynamic: true, transparency: 0.3 });
    let flashOff = -1;
    const ROWS = [["QWERTYUIOP", 80, -36], ["ASDFGHJKL", 84, -25.5], ["ZXCVBNM", 89, -15]];
    for (const row of ROWS) {
      for (let i = 0; i < row[0].length; i++) {
        const ch = row[0][i];
        const home = NOTE[ch] !== undefined;
        const kx = row[1] + i * 10.5, kz = row[2];
        const key = P([9, 3, 9], kx, 3.5, kz, home ? KEY_PINK : KEY_WHITE);
        TX.face(at(kx, 3.5, kz), [9, 3, 9], "top", ch, { color: C(40, 30, 60), fill: 0.8, pps: 8, lift: 0.22 });
        z.click(key, () => {
          flash.moveTo([kx, 5.08, kz]);
          flashOff = z.time() + 0.25;
          if (!home) {
            z.sound("click", { volume: 0.6 });
            return;
          }
          z.tone(NOTE[ch]);
          if (z.has(75) || z.isUnlocked(75)) return;
          const s = ((z.flag("kb") || "") + ch).slice(-5);
          z.flag("kb", s);
          if (s === "SALAD") {
            z.unlock(75);
            jingle();
            z.notify("Keyboard Cat nods slowly. The cage opens.");
          }
        }, { distance: 40 });
      }
    }
    z.heartbeat(() => {
      if (flashOff > 0 && z.time() >= flashOff) { flashOff = -1; flash.moveTo([0, -50, 0]); }
    });
    P([50, 3, 8], 128, 3.5, -4.5, KEY_WHITE);
    z.cat(75, at(118, 5, -4.5, 90), { locked: true });
    // speaker
    const spk = P([8, 14, 10], 56, 7, -20, BOARD_BLACK);
    D.xcyl(1, 7, at(51.6, 9, -20), C(70, 70, 80));
    D.xcyl(1.2, 2.5, at(51.2, 9, -20), C(255, 80, 200), { neon: true });
    TX.face(at(56, 3, -20), [8, 3, 10], "left", "CLICK TO LISTEN", { color: KEY_PINK });
    const SONG = ["S", "A", "L", "A", "D"];
    let playing = false;
    const play = () => {
      if (playing) return;
      playing = true;
      SONG.forEach((n, i) => after(i * 0.7, () => z.tone(NOTE[n], { volume: 1 })));
      after(SONG.length * 0.7 + 0.5, () => { playing = false; });
    };
    z.click(spk, play, { distance: 40 });
    z.prompt(spk, "Listen", play, { distance: 9 });
    board(56, 9, -36, 90, 14, 9,
      "KEYBOARD CAT'S SONG\n1. Click the speaker and LISTEN. 5 notes.\n2. Play them back by clicking the keys.\nOnly the HOME ROW (A S D F G H J K L) can sing.\n...",
      BOARD_DARK, C(255, 200, 235), true);
  }
  flush();

  // ================================================================================== 84 Keycap Tower + 15-puzzle
  {
    const TXc = 165, TZ = 40, TOP = 64;
    P([8, TOP - 1, 8], TXc, (TOP - 1) / 2, TZ, C(60, 40, 110));
    P([16, 1, 16], TXc, TOP - 0.5, TZ, KEY_PINK);
    const letters = "GALAXYBRAINCAT!!";
    const keycap = (i, x, y, zz) => {
      const cf = at(x, y - 1, zz);
      D.box(V(6, 2, 6), cf, RAINBOW[i % 7]);
      INV([6, 2, 6], x, y - 1, zz);
      TX.face(cf, [6, 2, 6], "top", letters[i % letters.length], { color: WHITE, stroke: true, fill: 0.8, pps: 8, lift: 0.08 });
    };
    keycap(0, 157, 7, 7);
    keycap(1, 161, 9, 15);
    for (let i = 0; i <= 12; i++) {
      const th = K.rad(i * 38);
      keycap(i + 2, TXc + 17 * Math.sin(th), 11 + i * 4.2, TZ - 17 * Math.cos(th));
    }
    board(150, 8, 14, 90, 10, 6, "THE KEYCAP TOWER\nJump up the floating keys. Galaxy brains only.", C(60, 40, 110), WHITE, true);

    const BZ = TZ - 7.5, BY = TOP + 9;
    P([18, 18, 1], TXc, BY, BZ, BOARD_BLACK);
    const hcf = at(TXc, BY + 10.5, BZ);
    D.box(V(18, 3, 1), hcf, C(255, 80, 200), { neon: true });
    TX.face(hcf, [18, 3, 1], "back", "PUT 1-15 IN ORDER (click a tile next to the gap)", { color: WHITE });
    const slotCF = (s) => {
      const r = Math.floor((s - 1) / 4) + 1;
      const c = (s - 1) % 4 + 1;
      return at(TXc + (c - 2.5) * 4.1, BY + (2.5 - r) * 4.1, BZ + 0.85);
    };
    const tiles = [], slotOf = [], tileAt = [];
    let blank = 16;
    let busy = false;
    const rc = (s) => [Math.floor((s - 1) / 4), (s - 1) % 4];
    const adjacent = (a, b) => { const [ra, ca] = rc(a), [rb, cb] = rc(b); return Math.abs(ra - rb) + Math.abs(ca - cb) === 1; };
    const solved = () => { for (let t = 1; t <= 15; t++) if (slotOf[t] !== t) return false; return true; };
    const place = () => { for (let t = 1; t <= 15; t++) tiles[t].moveTo(slotCF(slotOf[t])); };
    function scramble() {
      for (let t = 1; t <= 15; t++) { slotOf[t] = t; tileAt[t] = t; }
      tileAt[16] = undefined;
      blank = 16;
      let prev = null, moves = 0;
      while (moves < 90 || solved()) {
        const opts = [];
        for (let s = 1; s <= 16; s++) if (adjacent(s, blank) && tileAt[s] !== prev) opts.push(tileAt[s]);
        const t = opts[z.randint(0, opts.length - 1)];
        const s = slotOf[t];
        tileAt[blank] = t;
        slotOf[t] = blank;
        tileAt[s] = undefined;
        blank = s;
        prev = t;
        moves++;
      }
    }
    for (let t = 1; t <= 15; t++) {
      const p = z.part({ size: [3.8, 3.8, 0.7], cf: slotCF(t), color: RAINBOW[(t - 1) % 7], collide: false, dynamic: true });
      TX.onPart(p, "back", String(t), { color: WHITE, stroke: true, follow: true, pps: 14 });
      tiles[t] = p;
      z.click(p, () => {
        if (busy) return undefined;
        if (dist3(centre(), [TXc, BY, BZ]) > 40) return z.fail("Climb the tower first, galaxy brain.");
        if (!adjacent(slotOf[t], blank)) return z.tone(0.5, { volume: 0.4 });
        const s = slotOf[t];
        tileAt[blank] = t;
        slotOf[t] = blank;
        tileAt[s] = undefined;
        blank = s;
        p.moveTo(slotCF(slotOf[t]));
        z.tone(0.9 + t * 0.05, { volume: 0.5 });
        if (solved()) {
          busy = true;
          jingle();
          z.unlock(84);
          z.notify("GALAXY BRAIN ACHIEVED. The cage opens.");
          after(8, () => { scramble(); place(); busy = false; });
        }
        return undefined;
      }, { distance: 30 });
    }
    scramble();
    // the parts were created at their solved slots; move them before the zone is finalized
    for (let t = 1; t <= 15; t++) tiles[t].moveTo(slotCF(slotOf[t]));
    const shuffle = P([3, 1, 3], TXc + 6, TOP + 0.5, TZ - 5, RED_NEON, { neon: true });
    z.billboard(shuffle, "SHUFFLE", { width: 5, height: 1.5, color: WHITE, distance: 40 });
    z.click(shuffle, () => {
      if (busy) return;
      scramble();
      place();
      z.notify("Shuffled. Big brain time.");
    }, { distance: 20 });
    z.cat(84, at(TXc - 3, TOP, TZ + 4, 180), { locked: true });
    // test seam for the solver: the live slot of every tile (read-only copy)
    z.flag("z6:puzzle", () => ({ slotOf: slotOf.slice(), blank }));
  }
  flush();

  // ================================================================================== 79 The "..." Room (middle)
  {
    P([56, 22, 2], -10, 11, -38, DARK);
    P([56, 22, 2], -10, 11, 18, DARK);
    P([2, 22, 56], 18, 11, -10, DARK);
    P([2, 22, 25], -38, 11, -25.5, DARK);
    P([2, 22, 25], -38, 11, 5.5, DARK);
    P([2, 14, 6], -38, 15, -10, DARK);
    P([58, 1, 58], -10, 22.5, -10, DARK);
    D.box(V(0.4, 8, 6), at(-36.9, 4, -10), C(5, 5, 6));
    const scf = at(-39.5, 17, -10, 90);
    D.box(V(16, 5, 0.6), scf, C(20, 20, 24));
    TX.face(scf, [16, 5, 0.6], "front", "...", { color: WHITE, both: true });
    board(-44, 6, -22, 90, 12, 8,
      "THE ... ROOM\nIt is very dark in there. That is the point.\nEvery RIGHT step sings a little higher.\nEvery WRONG step groans.\nWhen the song reaches its end, so do you.",
      BOARD_BLACK, C(220, 220, 230), true);
    const PATH = [[1, 4], [2, 4], [2, 3], [2, 2], [3, 2], [4, 2], [4, 3], [4, 4], [4, 5], [4, 6], [5, 6], [6, 6], [6, 5], [6, 4], [7, 4]];
    const idxOf = new Map(PATH.map((p, i) => [p[0] + "," + p[1], i + 1]));
    const tx = (c) => -36.25 + (c - 0.5) * 7.5;
    for (let c = 1; c <= 7; c++) {
      for (let r = 1; r <= 7; r++) {
        const tile = P([7.5, 0.3, 7.5], tx(c), 0.15, tx(r), DARK);
        const idx = idxOf.get(c + "," + r);
        z.touch(tile, () => {
          if (z.has(79)) return;
          const prog = z.flag("dark") || 0;
          if (idx && idx <= prog + 1) {
            // never move progress backwards: brushing an earlier path tile while walking
            // must not make the tile you are standing on "wrong"
            if (idx > prog) z.flag("dark", idx);
            z.tone(0.55 + idx * 0.1, { volume: 0.8 });
            if (idx === PATH.length && !z.isRevealed(79)) {
              z.reveal(79);
              z.notify("... blorp.");
            }
          } else {
            z.sound("oof", { pitch: 0.55, volume: 0.5 });
          }
        }, { cooldown: 0.3 });
      }
    }
    z.cat(79, at(tx(7), 0.3, tx(4), 90), { hidden: true });
  }
  flush();

  // ================================================================================== 78 Morse Tower
  {
    P([6, 34, 6], -60, 17, 45, C(40, 40, 50));
    for (let k = 1; k <= 5; k++) D.box(V(6.4, 1, 6.4), at(-60, k * 6, 45), k % 2 === 0 ? C(255, 80, 200) : C(60, 230, 255), { neon: true });
    const OFF = C(60, 60, 50), ON = C(255, 250, 200);
    const lamp = P([6, 6, 6], -60, 37, 45, OFF, { shape: "sphere", neon: true, dynamic: true });
    board(-75, 7, 33, 90, 11, 8,
      "...  ---  ...\nThe lamp spells ONE word, again and again.\nShort blink = .   Long blink = -\nLong darkness = the word starts over.\nTell the terminal what it says.",
      BOARD_BLACK, WHITE, true);
    board(-75, 9, 46, 90, 14, 13,
      "A .-   B -...   C -.-.   D -..   E .   F ..-.\nG --.   H ....   I ..   J .---   K -.-   L .-..\nM --   N -.   O ---   P .--.   Q --.-   R .-.\nS ...   T -   U ..-   V ...-   W .--   X -..-\nY -.--   Z --..",
      BOARD_PAPER, C(20, 20, 30), true, { pps: 28 });
    const term = P([2, 4, 3], -75, 2, 57, C(60, 230, 255));
    TX.onPart(term, "left", "ANSWER\n(click)", { color: C(20, 20, 30) });
    terminal(term, 78, "morse", { title: "WHAT DOES THE LAMP SAY?", hint: "one word", kind: "text", max: 10 }, "LONG", () => {
      z.unlock(78);
      z.notify("Loooooooooong. The cage opens.");
    });
    P([7, 2, 18], -42, 1, 45, BOARD_PAPER);
    z.cat(78, at(-42, 2, 45), { locked: true });

    const MORSE = [".-..", "---", "-.", "--."];
    const U = 0.35;
    const seq = [];
    MORSE.forEach((code, li) => {
      for (let si = 0; si < code.length; si++) {
        const dash = code[si] === "-";
        seq.push({ on: true, d: dash ? 3 * U : U, dash });
        let gap = U;
        if (si === code.length - 1) gap = li === MORSE.length - 1 ? 10 * U : 3 * U;
        seq.push({ on: false, d: gap });
      }
    });
    let idx = seq.length - 1, left = 0, lit = null;
    const setLamp = (on) => {
      if (lit === on) return;
      lit = on;
      lamp.setColor(on ? ON : OFF);
      if (lamp.id) {
        try { parts.setLight(lamp.id, on ? { color: ON, intensity: 4, range: 40 } : null); } catch { /* lamp gone */ }
      }
    };
    z.heartbeat((dt) => {
      left -= dt;
      if (left > 0) return;
      idx = (idx + 1) % seq.length;
      const s = seq[idx];
      left += s.d;
      if (left < 0) left = s.d;
      setLamp(s.on);
      if (s.on) {
        // the original's beep came from the lamp; ours fades with distance instead
        const d = dist3(centre(), [-60, 37, 45]);
        if (d < 80) z.tone(s.dash ? 0.9 : 1.4, { volume: 0.35 * (1 - d / 80) });
      }
    });
  }
  flush();

  // ================================================================================== 76 Quiet Corner (SW)
  {
    const RX = -172, RZ = 150;
    D.box(V(12, 0.2, 12), at(RX, 0.1, RZ), C(170, 160, 175));
    P([10, 2, 3], RX, 1, RZ + 10, WOOD_LIGHT, { material: "wood" });
    P([2, 10, 14], -190, 5, RZ, WOOD_DARK, { material: "wood" });
    for (let k = 0; k <= 3; k++) D.box(V(1.6, 2.2, 1), at(-189, 2 + (k % 2) * 4.5, RZ - 5 + k * 3), RAINBOW[k + 2]);
    for (const pz of [RZ - 8, RZ + 14]) {
      D.vcyl(2, 2.5, at(-160, 1, pz), C(200, 110, 70));
      D.ball(4, at(-160, 3.6, pz), C(90, 170, 100));
    }
    P([2, 2, 2], -160, 8, RZ + 4, C(255, 230, 180), {
      shape: "sphere", neon: true, decor: true, light: { color: C(255, 220, 170), intensity: 0.8, range: 14 },
    });
    D.box(V(0.4, 7, 0.4), at(-160, 3.5, RZ + 4), C(60, 60, 60));
    board(RX, 6, RZ - 12, 180, 10, 6, "...\n\n(shhh. stand on the rug. say nothing. move nothing. someone shy is watching.)", POST, C(220, 220, 230), true);
    z.cat(76, at(RX, 2, RZ + 10), { hidden: true });

    let still = null, acc = 0;
    z.heartbeat((dt) => {
      acc += dt;
      if (acc < 0.5) return;
      const step = acc;
      acc = 0;
      const done = z.has(76) || z.isRevealed(76);
      const p = me();
      if (!done && Math.abs(p[0] - RX) <= 6.5 && Math.abs(p[2] - RZ) <= 6.5 && p[1] < 10) {
        if (still && dist3(still.pos, p) < 0.6) {
          still.t += step;
          if (still.t >= 30) {
            still = null;
            z.reveal(76);
            z.notify(". . . (sniff) someone sat down on the bench.");
          } else if (still.t >= 20 && still.shown < 2) {
            still.shown = 2;
            z.notify(". .");
          } else if (still.t >= 10 && still.shown < 1) {
            still.shown = 1;
            z.notify(".");
          }
        } else {
          still = { pos: p, t: 0, shown: 0 };
        }
      } else {
        still = null;
      }
    });
  }
  flush();

  // ================================================================================== Meow Mall (S)
  {
    P([170, 0.4, 120], -65, 0.2, 130, C(70, 40, 110));
    for (let i = 1; i <= 8; i++) D.box(V(0.4, 0.1, 120), at(-150 + i * 18.9, 0.45, 130), C(255, 80, 220), { neon: true });
    for (let i = 1; i <= 5; i++) D.box(V(170, 0.1, 0.4), at(-65, 0.45, 70 + i * 20), C(80, 230, 255), { neon: true });
    P([75, 24, 2], -112.5, 12, 70, MALL_TEAL);
    P([65, 24, 2], -12.5, 12, 70, MALL_TEAL);
    P([30, 8, 2], -60, 20, 70, MALL_PINK);
    TX.face(at(-60, 20, 70), [30, 8, 2], "front", "MEOW MALL 1995", { color: WHITE, stroke: true });
    P([170, 24, 2], -65, 12, 190, MALL_TEAL);
    P([2, 24, 120], -150, 12, 130, MALL_TEAL);
    P([2, 24, 120], 20, 12, 130, MALL_TEAL);
    D.box(V(172, 1, 2.4), at(-65, 24.5, 190), C(255, 80, 220), { neon: true });
    D.box(V(2.4, 1, 122), at(-150, 24.5, 130), C(80, 230, 255), { neon: true });
    D.box(V(2.4, 1, 122), at(20, 24.5, 130), C(80, 230, 255), { neon: true });
    D.box(V(172, 1, 2.4), at(-65, 24.5, 70), C(255, 80, 220), { neon: true });
    flush();
    for (const c of [[-125, 95], [-125, 165], [-65, 95], [-65, 165], [-10, 95], [-10, 165]]) {
      VC(24, 3, c[0], 12.4, c[1], C(245, 245, 250), { material: "marble" });
      D.vcyl(1, 4.5, at(c[0], 23.9, c[1]), MALL_PINK, { neon: true });
    }
    for (const pt of [[-105, 80], [-40, 105], [-105, 180], [-40, 155], [-20, 180], [-115, 125]]) {
      D.vcyl(14, 1.4, at(pt[0], 7.4, pt[1]), C(150, 100, 60));
      INV([1.4, 14, 1.4], pt[0], 7.4, pt[1]);
      for (let k = 0; k <= 3; k++) {
        const a = K.rad(k * 90 + 20);
        D.ball(V(9, 0.6, 2.6), K.mul(at(pt[0], 14.4, pt[1]), K.angles(0, a, 0), K.cf(4, -0.6, 0), K.rot(0, 0, -18)), C(60, 230, 160));
      }
    }
    flush();
    const shops = [["VHS 4 CATS", C(255, 120, 200)], ["SOFT DRINKZ", C(120, 230, 230)], ["WAVE.EXE", C(170, 120, 255)], ["PLAZA 2000", C(255, 200, 120)], ["SMOOTH JAZZ 24/7", C(120, 255, 180)]];
    shops.forEach((s, i) => {
      const x = -130 + i * 30;
      D.box(V(18, 10, 1), at(x, 5.4, 188.5), s[1]);
      D.box(V(14, 7, 0.3), at(x, 5.4, 187.9), C(40, 20, 70), { transparency: 0.3 });
      const sg = at(x, 12.4, 188.4);
      D.box(V(18, 3, 1), sg, C(30, 15, 50));
      TX.face(sg, [18, 3, 1], "front", s[0], { color: s[1], stroke: true });
    });
    // vaporwave sun behind the south wall
    D.vcyl(1, 60, K.mul(at(-65, 45, 193.5), K.rot(90, 0, 0)), C(255, 120, 120), { neon: true });
    for (let k = 0; k <= 3; k++) D.box(V(62, 1.4 + k * 0.5, 0.4), at(-65, 28 + k * 5, 192.6), C(70, 30, 110));
    // fountain
    VC(2, 16, -65, 1.4, 130, C(245, 245, 250), { material: "marble" });
    D.vcyl(0.2, 14, at(-65, 2.45, 130), C(80, 230, 255), { neon: true });
    VC(6, 2, -65, 5.4, 130, MALL_PINK);
    D.ball(3, at(-65, 9.4, 130), C(80, 230, 255), { neon: true });
    D.ball(2.2, at(-61, 3.3, 133), C(255, 220, 40));
    D.ball(1.4, at(-61, 4.6, 132.2), C(255, 220, 40));
    D.wedge(V(0.6, 0.4, 0.6), K.mul(at(-61, 4.5, 131.3), K.rot(0, 180, 0)), C(255, 140, 30));
    board(-65, 6, 118, 0, 14, 8,
      "SECRET NOTE C\nMirror alphabet: A=Z B=Y C=X D=W E=V F=U G=T H=S I=R J=Q K=P L=O M=N\nThe Meme Market password is:\n\nWRZNLMWKZDH",
      BOARD_DARK, C(120, 230, 255), true);
  }
  flush();

  // ================================================================================== 77 Dot Gallery
  {
    const COUNTS = [12, 19, 16]; // = 47
    const BZ = [95, 125, 155];
    const dotCols = [C(255, 80, 200), C(80, 230, 255), C(255, 230, 60), C(120, 255, 150), C(255, 140, 60)];
    let seed = 7701;
    const rnd = (a, b) => { // deterministic, independent of the zone rng
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return a + Math.floor((seed / 2147483648) * (b - a + 1));
    };
    for (let b = 1; b <= 3; b++) {
      const bz = BZ[b - 1];
      D.box(V(0.5, 12, 18), at(-148.5, 9, bz), C(250, 245, 235));
      D.box(V(0.4, 13, 19), at(-148.8, 9, bz), C(255, 200, 40), { material: "metal" });
      const tcf = at(-148.2, 16.2, bz);
      D.box(V(0.3, 1.6, 12), tcf, C(30, 15, 50));
      TX.face(tcf, [0.3, 1.6, 12], "right", `ART PIECE #${b}: '...' (1987)`, { color: WHITE });
      const slots = [];
      for (let i = 1; i <= 4; i++) for (let j = 1; j <= 6; j++) slots.push([i, j]);
      const chosen = [];
      if (b === 1) {
        // four "..." triplets
        const trip = [];
        for (let i = 1; i <= 4; i++) { trip.push([i, 1]); trip.push([i, 4]); }
        for (let k = trip.length - 1; k >= 1; k--) { const m = rnd(0, k); [trip[k], trip[m]] = [trip[m], trip[k]]; }
        for (let k = 0; k < 4; k++) for (let d = 0; d <= 2; d++) chosen.push([trip[k][0], trip[k][1] + d, 1.3]);
      } else {
        for (let k = slots.length - 1; k >= 1; k--) { const m = rnd(0, k); [slots[k], slots[m]] = [slots[m], slots[k]]; }
        for (let k = 1; k <= COUNTS[b - 1]; k++) {
          const d = (b === 3 && k % 4 === 0) ? 0.55 : (0.9 + (k % 5) * 0.3);
          chosen.push([slots[k - 1][0], slots[k - 1][1], d]);
        }
      }
      chosen.forEach((s, i) => {
        const k = i + 1;
        const y = 9 + (s[0] - 2.5) * 2.6 + (b > 1 ? ((k % 3) - 1) * 0.15 : 0);
        const zz = bz + (s[1] - 3.5) * 2.8 + (b > 1 ? ((k % 2) - 0.5) * 0.4 : 0);
        D.xcyl(0.3, s[2], at(-148.1, y, zz), dotCols[(k + b) % 5], { neon: true });
      });
      flush();
    }
    const term = P([3, 4, 3], -130, 2.4, 110, GOLD);
    TX.onPart(term, "left", "DOT COUNTER\n(click)", { color: C(60, 20, 90) });
    TX.onPart(term, "right", "DOT COUNTER\n(click)", { color: C(60, 20, 90) });
    board(-136, 7, 104, 90, 10, 6, "THE DOT GALLERY\n...\nCount EVERY round dot on the 3 art boards.\nTell the DOT COUNTER the total.", BOARD_DARK, WHITE, true);
    terminal(term, 77, "dots", { title: "HOW MANY DOTS?", hint: "all 3 boards together", kind: "digits", max: 3 }, "47", () => {
      z.unlock(77);
      z.notify("Correct! Spinning Cat spins towards you (an honour).");
    });
    P([8, 2, 8], -130, 1.4, 145, C(40, 40, 50));
    D.vcyl(0.3, 7.4, at(-130, 2.55, 145), C(200, 200, 210), { material: "metal" });
    z.cat(77, at(-130, 2.7, 145, -90), { locked: true });
  }
  flush();

  // ================================================================================== 81 Sideways Lights Out
  {
    const ONC = C(255, 60, 200), OFFC = C(45, 25, 70);
    const CZ = 130, CY = 15;
    P([0.6, 28, 28], 18.6, CY, CZ, BOARD_BLACK);
    const hcf = at(18.6, CY + 15.5, CZ);
    D.box(V(0.6, 3, 28), hcf, MALL_TEAL);
    TX.face(hcf, [0.6, 3, 28], "left", "A E S T H E T I C   L I G H T S", { color: C(40, 10, 70) });
    board(10, 7, 150, -90, 12, 7, "Click a light: it flips ITSELF and its 4 DIAGONAL neighbours.\nTurn EVERY light OFF.", BOARD_DARK, C(255, 180, 230), true);
    const panels = [], state = [], shown = [];
    const PRESSES = [[1, 1], [2, 3], [4, 2], [3, 5], [5, 4], [1, 5]];
    let busy = false;
    const paint = () => {
      for (let c = 1; c <= 5; c++) {
        for (let r = 1; r <= 5; r++) {
          if (shown[c][r] === state[c][r]) continue;
          shown[c][r] = state[c][r];
          panels[c][r].setColor(state[c][r] ? ONC : OFFC);
        }
      }
    };
    const flip = (c, r) => {
      for (const d of [[0, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const cc = c + d[0], rr = r + d[1];
        if (state[cc] && state[cc][rr] !== undefined) state[cc][rr] = !state[cc][rr];
      }
    };
    const reset = () => {
      for (let c = 1; c <= 5; c++) {
        state[c] = [];
        for (let r = 1; r <= 5; r++) state[c][r] = false;
      }
      for (const pr of PRESSES) flip(pr[0], pr[1]);
      paint();
    };
    const allOff = () => {
      for (let c = 1; c <= 5; c++) for (let r = 1; r <= 5; r++) if (state[c][r]) return false;
      return true;
    };
    for (let c = 1; c <= 5; c++) {
      panels[c] = [];
      shown[c] = [];
      for (let r = 1; r <= 5; r++) {
        const p = P([0.6, 4.6, 4.6], 18.0, CY + (3 - r) * 5, CZ + (c - 3) * 5, OFFC, { neon: true, dynamic: true });
        panels[c][r] = p;
        shown[c][r] = false;
        z.click(p, () => {
          if (busy) return;
          flip(c, r);
          paint();
          z.tone(0.8 + (c + r) * 0.08, { volume: 0.5 });
          if (allOff()) {
            busy = true;
            jingle();
            z.unlock(81);
            z.notify("A E S T H E T I C. The stage cage opens.");
            after(6, () => { reset(); busy = false; });
          }
        }, { distance: 60 });
      }
    }
    reset();
    const rb = P([2, 3, 2], 14, 1.9, 150 - 6, RED_NEON, { neon: true });
    z.billboard(rb, "RESET BOARD", { width: 6, height: 1.5, color: WHITE, distance: 40 });
    z.click(rb, () => { if (!busy) reset(); }, { distance: 20 });
    P([12, 2, 12], 5, 1.4, 108, MALL_PINK, { neon: true });
    z.cat(81, at(5, 2.4, 108, 90), { locked: true });
    z.flag("z6:lights", () => state.map((col) => (col ? col.slice() : col)));
  }
  flush();

  // ================================================================================== 74 Grind Button + CEO office
  {
    P([10, 6, 10], -90, 3.4, 150, C(255, 200, 120));
    P([4, 3, 4], -97, 1.9, 150, WOOD_LIGHT, { material: "wood" }); // the step onto the kiosk (port)
    P([4, 3, 4], -30, 1.9, 86, WOOD_LIGHT, { material: "wood" });
    P([4, 6, 4], -25, 3.4, 86, WOOD_LIGHT, { material: "wood" });
    P([4, 9, 4], -20, 4.9, 86, WOOD_LIGHT, { material: "wood" });
    D.box(V(16, 0.1, 12), at(-30, 0.45, 174), C(20, 20, 30));
    P([9, 3, 4], -30, 1.9, 174, WOOD_DARK, { material: "wood" });
    D.box(V(3, 5, 3), at(-30, 2.9, 179), C(20, 20, 20));
    INV([3, 5, 3], -30, 2.9, 179);
    const ceo = at(-30, 9, 182);
    D.box(V(14, 3, 0.6), ceo, C(20, 20, 30));
    TX.face(ceo, [14, 3, 0.6], "front", "CEO OFFICE (SIGMAS ONLY)", { color: C(255, 215, 80), both: true });
    z.cat(74, at(-30, 3.4, 174), { locked: true });
    board(-55, 6, 76, 0, 13, 7,
      "SIGMA RULE #1: THE GRIND NEVER STOPS.\nCatch the GRIND BUTTON 7 times. It runs away every time.\nReward: the CEO office opens (back of the mall).",
      BOARD_BLACK, C(255, 215, 80), true);

    const SPOTS = [[-60, 0.4, 82], [-140, 0.4, 180], [-90, 6.4, 150], [10, 0.4, 182], [-65, 2.5, 124], [-20, 9.4, 86], [-142, 0.4, 80]];
    let spot = 0;
    const spotXYZ = (i) => [SPOTS[i][0], SPOTS[i][1] + 0.5, SPOTS[i][2]];
    const btn = z.part({ shape: "cylinder", size: [4, 1, 4], at: spotXYZ(0), color: C(255, 40, 40), material: "neon", collide: false, dynamic: true });
    z.billboard(btn, "GRIND BUTTON", { width: 8, height: 2, color: C(255, 80, 80), top: true, distance: 400, offset: [0, 3, 0] });
    const TAUNTS = [
      "Rep 1/7. The button respects nothing.", "Rep 2/7. It ran. Sigmas chase.", "Rep 3/7. HAHAHAHA it ran AGAIN.",
      "Rep 4/7. Hydrate. Then grind.", "Rep 5/7. Your legs are now 5% more sigma.",
      "Rep 6/7. One more. The last rep counts double. (It doesn't.)",
    ];
    let lastCatch = -1e9;
    const grab = () => {
      const t = z.time();
      if (t - lastCatch < 1) return;
      lastCatch = t;
      if (z.has(74) || z.isUnlocked(74)) {
        z.notify("You already out-grinded the button. CEO office, now.");
        return;
      }
      const n = (z.flag("grind") || 0) + 1;
      z.flag("grind", n);
      z.sound("jump", { volume: 0.6 });
      if (n >= 7) {
        z.unlock(74);
        jingle();
        z.notify("Rep 7/7. SIGMA. The CEO office is open.");
      } else {
        laugh();
        z.notify(TAUNTS[n - 1]);
      }
      spot = (spot + 1) % SPOTS.length;
      btn.moveTo(spotXYZ(spot));
    };
    z.touch(btn, grab, { cooldown: 0.6 });
    let acc = 0;
    z.heartbeat((dt) => {
      acc += dt;
      if (acc < 0.15) return;
      acc = 0;
      if (z.has(74) || z.isUnlocked(74)) return;
      const c = centre(), b = spotXYZ(spot);
      if (Math.abs(c[1] - b[1]) <= 5 && Math.hypot(c[0] - b[0], c[2] - b[2]) <= 3.5) grab();
    });
    z.flag("z6:grind", () => spotXYZ(spot));
  }
  flush();

  // ================================================================================== extra scenery
  {
    // rainbow roads from the plaza to the middle, the mall and the theater (flush with the ground)
    const road = (x0, z0, x1, z1) => {
      const len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0);
      for (let i = 1; i <= 7; i++) {
        const off = (i - 4) * 1.2;
        const size = alongX ? V(len, 0.1, 1.2) : V(1.2, 0.1, len);
        const cx = (x0 + x1) / 2 + (alongX ? 0 : off);
        const cz = (z0 + z1) / 2 + (alongX ? off : 0);
        D.box(size, at(cx, 0.25, cz), RAINBOW[i - 1], { neon: true });
      }
    };
    road(-168, 0, -48, 0);
    road(-50, 5, -50, 68);
    road(-110, -5, -110, -110);
    flush();
    // candy clouds
    const clouds = [[-120, 95, -150], [20, 105, -60], [140, 100, -40], [-40, 90, 120], [120, 110, 140], [-170, 100, 80], [60, 95, 30], [-80, 115, -20]];
    const cloudC = [C(255, 210, 240), C(210, 230, 255), C(235, 215, 255)];
    clouds.forEach((c, i) => {
      for (let k = 0; k <= 3; k++) {
        const d = 16 - k * 2;
        D.ball(V(d, d * 0.7, d), at(c[0] + (k - 1.5) * 9, c[1] + (k % 2) * 3, c[2] + ((k * 7) % 5 - 2) * 2), cloudC[(i + 1 + k) % 3]);
      }
    });
    flush();
    // lollipop trees
    const pops = [[-100, -40], [-85, 15], [-95, 40], [40, -60], [32, 40], [45, -90], [-50, -95], [-170, -80], [-178, -140], [-182, 95], [30, -150], [188, -60], [190, 80], [75, 75]];
    pops.forEach((p, i) => {
      const h = 10 + ((i + 1) % 3) * 3;
      D.vcyl(h, 0.8, at(p[0], h / 2, p[1]), WHITE);
      D.ball(6, at(p[0], h + 2, p[1]), RAINBOW[(i + 1) % 7], { neon: true });
      D.xcyl(6.3, 2.2, K.mul(at(p[0], h + 2, p[1]), K.angles(0, K.rad((i + 1) * 40), 0)), WHITE);
    });
    flush();
    // neon obelisks around the edge (none on the spawn edge)
    const obs = [[-190, -190], [30, -192], [190, -190], [192, 0], [190, 190], [0, 192], [-190, 190]];
    obs.forEach((o, i) => {
      const p = P([5, 46, 5], o[0], 23, o[1], RAINBOW[i], { neon: true, dynamic: true });
      z.tag(p, "Rainbow", { period: 4 + (i + 1) * 0.5 });
      D.wedge(V(5, 6, 2.5), K.mul(at(o[0], 49, o[1] - 1.25), K.rot(0, 180, 0)), WHITE, { neon: true });
      D.wedge(V(5, 6, 2.5), at(o[0], 49, o[1] + 1.25), WHITE, { neon: true });
    });
    flush();
    // floating CTRL / ALT / DEL above the keyboard
    ["CTRL", "ALT", "DEL"].forEach((w, i) => {
      const p = P([14, 4, 10], 95 + (i + 1) * 22, 38 + (i + 1) * 3, -30, KEY_WHITE, { decor: true, dynamic: true });
      TX.onPart(p, "top", w, { color: C(60, 30, 90), follow: true, fill: 0.8, pps: 10 });
      TX.onPart(p, "front", w, { color: C(60, 30, 90), both: true, follow: true, pps: 10 });
      z.tag(p, "Bob", { amp: 1.5, period: 3 + (i + 1) * 0.6 });
    });
  }
  flush();

  TX.commit();
  z.flag("z6:text", () => TX.stats());
}
