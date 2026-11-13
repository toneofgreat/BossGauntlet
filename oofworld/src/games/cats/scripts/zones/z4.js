/*
  Zone 4: Mount Hairball (Volcano Lab)   cats 43-50 Insane, 51-57 Extreme
  Ported from the original Find The Cats (server Zones/Z4 + shared Cats/Z4) onto the zonekit (spec 28 §6).

  MAP (zone-local, x east, z south, ground top y = 0; spawn at (-185, 0, 0) on the west edge)
    spawn arch -> main road east.  NW: lava lake.  Centre/N: the volcano (centre (70, -60), 10 stepped tiers,
    crater at y 140).  W of volcano: lava tube cave + power station.  SW: lab courtyard (4 puzzle stations +
    periodic table wall), Secure Wing building behind it, Security Corridor east of it.  S: conveyor factory.
    Lava river A runs south from the volcano (one bridge at z 30); river B runs west into the lava lake
    (bridge on the north road); river C runs east.  E of river A: Prism Lab, then the rocket pad + gantry +
    Mission Control.  NE (north road): the time machine.  High above: the orbital station (y 285).
    Underground (y -100): the time pocket.

  PORT NOTES. The engine has no climbing, so every truss of the original is now a short flight of floating
  steps (rise <= 4.5 studs, gap <= 2.6: jump apex is 6.37 with gravity 196.2 / jump 50 / walk 16).
  Platforms that carry you are engine movingPlatforms; the belts are engine conveyors. Keypads, levers and
  exit buttons work by tapping them OR standing next to them and pressing E / the prompt button.
  A cat tap reaches 32 studs with no wall occlusion, so the enclosed cats 44, 48, 50 and 53 are placed
  hidden and revealed only once you stand where tapping them is fair (belt 3, the gantry's last steps, the
  corridor's end room, Door C). The fuse box's code box lists the stamps of the fuses you carry (the
  original showed them on billboards). Time dials, left to right as you face the console: HOUR, MINUTE, AM/PM.

  SOLUTIONS (every clue is in the zone)
    43 Magma Mittens (Insane): lava lake stepping stones from the south shore to the middle island (one stone
       slides, one lava geyser blinks: cross when it is dim). Lava = back to the shore.
    44 Belt-Fed Bartholomew (Insane): factory. Belt 1 (runs back at you) -> platform -> belt 2 east under two
       crushers (pass when they are up) -> platform -> belt 3 south -> platform -> three gear platforms -> cat.
       Slag floor = back to the factory entrance.
    45 Atomic Kittentron (Insane): 4x4 Lights Out. Clicking a light flips it and its 4 neighbours. The start
       pattern is made by pressing (row,col) (1,1) (1,4) (2,2) (3,3) (3,4) (4,1) (row 1 = top, col 1 = left as
       you face the board); pressing exactly those 6 again turns everything off (any order). RESET restores.
    46 MEOW-TRON 9000 (Insane): Simon Says. Press START, repeat the flashed colours; 6 rounds, the pattern grows
       by one each round. A mistake = 4 s lockout and start over.
    47 Clone Cat #47 (Insane): 8-puzzle. Start (rows top->bottom): 1 2 7 / 5 6 4 / _ 8 3. Click the tiles in
       this order (22 moves): 8 6 4 3 6 4 5 1 2 7 3 5 7 2 1 7 4 8 7 4 5 6  -> 1 2 3 / 4 5 6 / 7 8 _.
    48 Sir Blastsalot (Insane): launch gantry climb: steps, 5 hops, steps, 2 moving platforms, 5 posts, steps.
    49 The Catalyst (Insane): FLASK+FLASK+FLASK=21 -> FLASK=7. ATOM+ATOM*ATOM=20 (multiply first!) -> ATOM=4.
       MAGNET*ATOM-FLASK=29 -> MAGNET=9. SKULL/ATOM+MAGNET=11 -> SKULL=8. Code SKULL FLASK MAGNET ATOM = 8794.
    50 Pew Pew Patricia (Insane): Security Corridor: 3 low beams (jump), 2 blinking curtains (pass when dim),
       a sweeping low beam (jump it), a floor whose odd/even rows heat up in turn (move on the warning flash;
       checkpoint just before it), a laser slalom. Lasers = back to the start / checkpoint.
    51 Sparky McShortcircuit (Extreme): 5 fuses: RED 3 (lava lake south shore, behind the big boulder),
       ORANGE 8 (behind the crates in the rocket pad's SE corner), YELLOW 1 (volcano ledge 2, far side - after
       summit stage 2), WHITE 6 (behind the time machine), BLUE 5 (top of the Prism Lab watchtower, steps).
       Star chart at Mission Control: hottest -> coolest = BLUE WHITE YELLOW ORANGE RED -> code 56183.
    52 Lord Jacuzzi Whiskerton (Extreme): volcano summit climb, 10 stages (one per tier, green pads are
       checkpoints, lava sends you to the last one), then 2 stones across the crater lava to the centre rock.
    53 Subject Zero (Extreme): Secure Wing. Door A = founding year on the foundation stone (south wall) = 1984.
       Room 1: jars RED 3 eyes, GREEN 1, BLUE 4, YELLOW 2; floor stripes from the entrance: BLUE YELLOW RED GREEN
       -> Door B = 4231. Room 2: A=13 B=8 C=7, D=19 (on top of the tall cabinet): (A+B)*C-D = 128 = Door C.
       Room 3: the cat.
    54 CHONK (Element 0) (Extreme): element notes #1 6 (lava tube cave wall), #2 1 (factory north wall,
       outside), #3 8 (Security Corridor lobby), #4 7 (Mission Control east wall), #5 19 (north road near the
       time machine). Periodic table: 6 C, 1 H, 8 O, 7 N, 19 K -> password CHONK.
    55 Prismo the Refracted (Extreme): take the POWER KEY in the lava tube cave, click the laser to power it.
       Grid cols 1-6 west->east, rows 1-6 north->south; laser enters row 2 heading east; receiver is east of
       row 1 and needs PURPLE (beam passed RED glass (3,5) and BLUE glass (5,3)). Mirrors cycle / then \ then down.
       Solution: (2,2)=\  (2,5)=\  (5,5)=/  (5,2)=\  (2,1)=/   (decoys (3,3),(4,4) any).  Path: east, south down
       col 2, east along row 5 through RED, north up col 5 through BLUE, west along row 2, back off (2,2) north,
       (2,1) east out to the receiver. (Mirror-image variant also works: (2,2) down, rest the same.)
    56 Chrono-Whiskers (Extreme): diary pages: 1 breakfast 7:15 AM (lava lake shore), 2 lunch +4:30 (Mission
       Control south wall), 3 nap +2:45 (inside the factory entrance), 4 vanished +0:20 (Prism Lab watchtower).
       7:15 + 4:30 + 2:45 + 0:20 = 2:50 PM. Set HOUR 2, MIN 50, PM, pull the lever -> time pocket with the cat.
    57 Dr. Meowenstein (Extreme): fuel canisters: A (volcano ledge 4, after summit stage 4), B (factory high
       shelf: steps from the platform after belt 2), C (lava lake side island, branch east from stone 2). Load
       fuel at the rocket's fuel port. Launch code: fin numbers clockwise seen from above, starting at the RED
       fin: E 7, S 3, W 9, N 1 -> 7391 (console on Mission Control's west wall). Then step on the green CREW LIFT
       within 20 s -> launch -> orbital station with the cat.
*/

// ============================================================================================ looks
const LV = (x, y, z) => [x, y, z];

export const looks = {
  // 43 Magma Mittens - Lava Cat
  43: (K) => {
    const rock = K.rgb(48, 34, 32), lava = K.rgb(255, 95, 10), hot = K.rgb(255, 210, 60);
    const c = K.cat({
      color: rock, pattern: "spots", color2: K.rgb(120, 40, 20), material: "Slate",
      eyes: "angry", eyeWhite: hot, eyeColor: K.rgb(200, 20, 0), mouth: "teeth", tail: "none",
      noseColor: lava, whiskerColor: hot, innerEarColor: lava,
    });
    const m = c.model;
    const N = { name: "Crack", neon: true };
    K.block(m, LV(0.18, 1.2, 0.12), K.mul(c.attach("body", LV(1.02, 0.1, -0.4)), K.rot(0, 0, 25)), lava, N);
    K.block(m, LV(0.18, 1.0, 0.12), K.mul(c.attach("body", LV(-1.02, 0.2, 0.5)), K.rot(0, 0, -30)), lava, N);
    K.block(m, LV(1.2, 0.15, 0.2), K.mul(c.attach("back", LV(0, 0.02, 0.4)), K.rot(0, 30, 0)), lava, N);
    K.block(m, LV(0.12, 0.6, 0.12), K.mul(c.attach("face", LV(0.45, 0.45, 0)), K.rot(0, 0, 20)), lava, N);
    const tb = K.p(c.attach("tailBase"));
    const F = { name: "Flame", neon: true };
    K.ball(m, LV(0.9, 1.4, 0.9), K.add(tb, LV(0, 0.6, 0.5)), lava, F);
    K.ball(m, LV(0.6, 1.1, 0.6), K.add(tb, LV(0, 1.5, 0.7)), K.rgb(255, 150, 20), F);
    K.ball(m, LV(0.35, 0.8, 0.35), K.add(tb, LV(0, 2.2, 0.75)), hot, F);
    K.ball(m, LV(0.5, 0.9, 0.5), c.attach("headTop", LV(0, 0.35, 0)), K.rgb(255, 150, 20), F);
    K.cyl(m, 0.15, 5, K.cf(0, 0.07, 0.2), lava, { name: "Puddle", neon: true });
    return K.finish(m);
  },

  // 44 Belt-Fed Bartholomew - Conveyor Belt Cat
  44: (K) => {
    const c = K.cat({
      bodyShape: "long", color: K.rgb(170, 150, 130), pattern: "stripes", color2: K.rgb(110, 90, 70),
      eyes: "sleepy", mouth: "o", tail: "normal", innerEars: false,
    });
    const m = c.model;
    const belt = K.rgb(35, 35, 40);
    K.block(m, LV(3.2, 0.35, 10.4), K.cf(0, -0.2, 0.4), belt, { name: "Belt" });
    for (let i = 0; i <= 4; i++) {
      K.cyl(m, 3.4, 0.55, K.mul(K.cf(0, -0.45, -4.4 + i * 2.2), K.rot(0, 0, 90)), K.C.silver, { name: "Roller", material: "Metal" });
    }
    for (const side of [-1, 1]) {
      K.block(m, LV(0.3, 0.5, 10.6), K.cf(side * 1.75, -0.15, 0.4), K.rgb(255, 200, 0), { name: "Rail" });
      K.block(m, LV(0.3, 1.1, 0.3), K.cf(side * 1.75, -0.95, -4.2), K.C.dark, { name: "Leg" });
      K.block(m, LV(0.3, 1.1, 0.3), K.cf(side * 1.75, -0.95, 5.0), K.C.dark, { name: "Leg" });
    }
    const tag = K.block(m, LV(0.9, 0.6, 0.06), K.mul(c.attach("side", LV(-0.1, 0.4, 1.2)), K.rot(0, 90, 0)), K.C.white, { name: "PriceTag" });
    for (let i = -1; i <= 1; i++) {
      K.block(m, LV(0.05, 0.4, 0.08), K.mul(tag.cf, K.cf(i * 0.22, 0, 0)), K.C.black, { name: "Barcode" });
    }
    return K.finish(m);
  },

  // 45 Atomic Kittentron - Atom Cat
  45: (K) => {
    const c = K.cat({
      bodyShape: "round", color: K.rgb(70, 140, 255), eyes: "big", mouth: "w", tail: "puffy",
      eyeColor: K.rgb(20, 30, 90), noseColor: K.rgb(255, 120, 200), innerEarColor: K.rgb(150, 220, 255),
    });
    const m = c.model;
    const body = K.p(c.attach("body"));
    const nuc = [[0.9, 0.7, 0.6, true], [-0.8, 0.9, 0.4, false], [0.2, 1.3, 0.9, true], [-1.1, 0.1, 0.9, true], [1.2, -0.2, 0.2, false], [0, 0.5, 1.5, false]];
    for (const b of nuc) {
      K.ball(m, 0.75, K.add(body, LV(b[0], b[1], b[2])), b[3] ? K.rgb(255, 70, 70) : K.rgb(200, 200, 210), { name: "Nucleon" });
    }
    const tilts = [K.rot(0, 0, 90), K.rot(60, 0, 90), K.rot(-60, 0, 90)];
    tilts.forEach((t, k) => {
      const ring = K.mul(K.cf(body), K.rot(0, (k + 1) * 60, 0), t);
      K.cyl(m, 0.06, 5.6, ring, K.rgb(120, 255, 255), { name: "Orbit", neon: true, transparency: 0.55 });
      K.ball(m, 0.5, K.mul(ring, K.cf(0, 0, 2.8)), K.rgb(255, 255, 120), { name: "Electron", neon: true });
    });
    return K.finish(m);
  },

  // 46 MEOW-TRON 9000 - Robot Cat
  46: (K) => {
    const c = K.cat({
      bodyShape: "cube", color: K.rgb(185, 190, 200), material: "DiamondPlate", eyes: "big",
      eyeWhite: K.rgb(30, 30, 40), eyeColor: K.rgb(0, 255, 230), mouth: "none", tail: "curly",
      whiskers: false, legs: false, innerEarColor: K.rgb(0, 200, 255), noseColor: K.rgb(255, 60, 60),
    });
    const m = c.model;
    const top = K.p(c.attach("headTop"));
    K.limb(m, top, K.add(top, LV(0.3, 1.2, 0)), 0.12, K.C.dark, { name: "Antenna" });
    K.ball(m, 0.4, K.add(top, LV(0.3, 1.3, 0)), K.rgb(255, 40, 40), { name: "AntennaBulb", neon: true });
    for (let i = -1; i <= 1; i++) {
      K.block(m, LV(0.7, 0.06, 0.06), c.attach("mouth", LV(0, i * 0.12 - 0.05, -0.05)), K.C.black, { name: "Grille" });
    }
    const head = K.p(c.attach("head"));
    for (const side of [-1, 1]) {
      K.cyl(m, 0.4, 0.3, K.mul(K.cf(K.add(head, LV(side * 1.0, -0.6, 0))), K.rot(0, 0, 90)), K.C.dark, { name: "Bolt", material: "Metal" });
    }
    K.block(m, LV(1.2, 0.8, 0.08), c.attach("chest", LV(0, 0.1, -0.02)), K.rgb(40, 255, 120), { name: "Screen", neon: true });
    const b = K.p(c.attach("body"));
    for (const x of [-1.3, 1.3]) {
      for (const zz of [-0.8, 1.2]) {
        K.cyl(m, 0.35, 1.1, K.mul(K.cf(b.x + x, 0.55, b.z + zz), K.rot(0, 0, 90)), K.C.black, { name: "Wheel" });
      }
    }
    return K.finish(m);
  },

  // 47 Clone Cat #47 - Clone Cat
  47: (K) => {
    const c = K.cat({
      scale: 0.8, color: K.rgb(170, 215, 170), eyes: "derp", mouth: "o", tail: "normal",
      eyeColor: K.rgb(20, 60, 20), noseColor: K.rgb(120, 200, 120), innerEarColor: K.rgb(220, 255, 220),
    });
    const m = c.model;
    K.block(m, LV(0.5, 0.35, 0.08), c.attach("neck", LV(0, -0.1, -0.15)), K.rgb(255, 220, 0), { name: "Tag", neon: true });
    K.cyl(m, 0.8, 5.6, K.cf(0, -0.4, 0.1), K.rgb(60, 62, 72), { name: "VatBase", material: "Metal" });
    K.cyl(m, 5.2, 5.0, K.cf(0, 2.6, 0.1), K.rgb(120, 255, 150), { name: "Vat", material: "Glass", transparency: 0.7 });
    K.cyl(m, 0.7, 5.6, K.cf(0, 5.5, 0.1), K.rgb(60, 62, 72), { name: "VatCap", material: "Metal" });
    K.cyl(m, 0.25, 5.15, K.cf(0, 0.1, 0.1), K.rgb(60, 255, 120), { name: "Goo", neon: true, transparency: 0.2 });
    K.limb(m, LV(1.4, 5.8, 0.1), LV(2.6, 7.0, 0.1), 0.4, K.C.silver, { name: "Pipe", material: "Metal" });
    K.limb(m, LV(-1.4, 5.8, 0.1), LV(-2.4, 6.6, 1.2), 0.4, K.C.silver, { name: "Pipe", material: "Metal" });
    [LV(1.5, 1.2, -1.2), LV(-1.3, 2.4, -1.4), LV(1.0, 3.8, 1.5)].forEach((p, i) => {
      K.ball(m, 0.25 + (i + 1) * 0.08, p, K.rgb(200, 255, 210), { name: "Bubble", neon: true, transparency: 0.3 });
    });
    return K.finish(m);
  },

  // 48 Sir Blastsalot - Rocket Cat
  48: (K) => {
    const c = K.cat({
      scale: 0.75, color: K.C.orange, pattern: "stripes", color2: K.rgb(255, 200, 140),
      eyes: "normal", mouth: "smile", tail: "long",
    });
    const m = c.model;
    K.acc.sunglasses(c, { color: K.rgb(80, 60, 30) });
    K.block(m, LV(1.0, 0.25, 0.4), c.attach("neck", LV(0, 0, 0)), K.C.red, { name: "Scarf" });
    const axis = K.mul(K.cf(0, -1.25, 0.6), K.rot(-90, 0, 0));
    K.cyl(m, 7.5, 2.3, axis, K.C.white, { name: "Body" });
    K.cyl(m, 0.5, 2.4, K.mul(axis, K.cf(0, 1.8, 0)), K.C.red, { name: "Band" });
    K.ball(m, LV(2.3, 2.3, 3.2), K.cf(0, -1.25, -3.2), K.C.red, { name: "Nose" });
    K.ball(m, 0.6, K.cf(0, -0.6, -1.8), K.rgb(120, 220, 255), { name: "Window", neon: true });
    for (let i = 0; i <= 2; i++) {
      K.wedge(m, LV(0.2, 1.4, 1.8), K.mul(K.cf(0, -1.25, 3.6), K.rot(0, 0, i * 120), K.cf(0, 1.6, 0)), K.C.red, { name: "Fin" });
    }
    K.ball(m, LV(1.6, 1.6, 2.6), K.cf(0, -1.25, 5.4), K.rgb(255, 120, 20), { name: "Flame", neon: true });
    K.ball(m, LV(0.9, 0.9, 1.8), K.cf(0, -1.25, 6.4), K.rgb(255, 230, 80), { name: "Flame", neon: true });
    return K.finish(m);
  },

  // 49 The Catalyst - Cat Made Of Science
  49: (K) => {
    const c = K.cat({
      bodyShape: "round", color: K.rgb(200, 240, 255), material: "Glass", eyes: "big", mouth: "smile",
      tail: "none", eyeColor: K.rgb(20, 80, 40), whiskerColor: K.rgb(150, 255, 150),
    });
    const m = c.model;
    c.body.transparency = 0.5;
    c.head.transparency = 0.35;
    K.acc.sunglasses(c, { color: K.rgb(255, 230, 60) });
    const body = K.p(c.attach("body"));
    K.ball(m, 2.3, K.add(body, LV(0, -0.3, 0)), K.rgb(80, 255, 90), { name: "Goo", neon: true, transparency: 0.15 });
    K.ball(m, 0.4, K.add(body, LV(0.5, 0.9, -0.3)), K.rgb(220, 255, 220), { name: "Bubble", neon: true });
    K.ball(m, 0.3, K.add(body, LV(-0.4, 1.1, 0.4)), K.rgb(220, 255, 220), { name: "Bubble", neon: true });
    K.cyl(m, 0.5, 0.7, c.attach("headTop", LV(0, 0.1, 0)), K.rgb(160, 110, 60), { name: "Cork" });
    const tb = K.p(c.attach("tailBase"));
    const tube = K.mul(K.cf(K.add(tb, LV(0, 0.9, 0.6))), K.rot(-25, 0, 0));
    K.cyl(m, 2.2, 0.55, tube, K.rgb(220, 240, 255), { name: "TestTube", material: "Glass", transparency: 0.4 });
    K.cyl(m, 1.0, 0.45, K.mul(tube, K.cf(0, -0.5, 0)), K.rgb(255, 60, 200), { name: "Potion", neon: true });
    K.ball(m, 0.5, K.add(body, LV(-1.9, 1.6, -0.6)), K.rgb(255, 80, 80), { name: "Atom", neon: true });
    K.ball(m, 0.35, K.add(body, LV(-2.3, 1.9, -0.6)), K.C.white, { name: "Atom", neon: true });
    return K.finish(m);
  },

  // 50 Pew Pew Patricia - Laser Cat
  50: (K) => {
    const red = K.rgb(255, 30, 40);
    const c = K.cat({
      color: K.rgb(28, 28, 34), eyes: "laser", eyeColor: red, mouth: "teeth", tail: "long",
      noseColor: red, whiskerColor: K.rgb(255, 120, 120), innerEarColor: red,
    });
    const m = c.model;
    const L = { name: "LaserLine", neon: true };
    for (let i = -1; i <= 1; i++) K.block(m, LV(2.25, 0.08, 0.08), c.attach("body", LV(0, 0.75, i * 0.9)), red, L);
    K.block(m, LV(0.08, 0.08, 3.1), c.attach("body", LV(1.08, 0.1, 0)), red, L);
    K.block(m, LV(0.08, 0.08, 3.1), c.attach("body", LV(-1.08, 0.1, 0)), red, L);
    const back = c.attach("back", LV(0, 0.3, 0.3));
    K.block(m, LV(1.0, 0.6, 1.2), back, K.rgb(80, 85, 95), { name: "Turret", material: "Metal" });
    K.cyl(m, 1.6, 0.3, K.mul(back, K.cf(0, 0.2, -0.8), K.rot(-90, 0, 0)), K.rgb(60, 60, 70), { name: "Barrel", material: "Metal" });
    K.ball(m, 0.35, K.mul(back, K.cf(0, 0.2, -1.65)), red, { name: "Muzzle", neon: true });
    K.ball(m, 0.5, c.attach("tail"), red, { name: "TailTip", neon: true });
    return K.finish(m);
  },

  // 51 Sparky McShortcircuit - Electric Fuse Cat
  51: (K) => {
    const yel = K.rgb(255, 225, 40);
    const c = K.cat({
      color: yel, eyes: "x", mouth: "o", tail: "none", eyeColor: K.C.black,
      innerEarColor: K.rgb(255, 140, 0), whiskerColor: K.C.black,
    });
    const m = c.model;
    const hp = K.p(c.attach("head"));
    for (let i = 0; i <= 5; i++) {
      const a = -75 + i * 30;
      K.wedge(m, LV(0.2, 0.9, 0.5), K.mul(K.cf(hp), K.rot(0, 0, a), K.cf(0, 1.1, 0.2)), K.rgb(230, 190, 20), { name: "Spike" });
    }
    K.ball(m, LV(1.2, 0.7, 1.2), c.attach("headTop", LV(0.2, 0.9, 0.3)), K.rgb(110, 110, 110), { name: "Smoke", transparency: 0.35 });
    const tb = K.p(c.attach("tailBase"));
    const p1 = K.add(tb, LV(0, 0.6, 0.9)), p2 = K.add(tb, LV(0.5, 0.2, 2.0));
    K.limb(m, tb, p1, 0.3, K.C.black, { name: "Cord" });
    K.limb(m, p1, p2, 0.3, K.C.black, { name: "Cord" });
    K.block(m, LV(0.6, 0.5, 0.7), K.cf(K.add(p2, LV(0, 0, 0.3))), K.C.white, { name: "Plug" });
    for (const side of [-1, 1]) {
      K.block(m, LV(0.08, 0.2, 0.5), K.cf(K.add(p2, LV(side * 0.15, 0, 0.85))), K.C.silver, { name: "Prong", material: "Metal" });
    }
    for (const side of [-1, 1]) {
      const b = c.attach("body", LV(side * 1.9, 1.2, 0));
      K.block(m, LV(0.18, 0.9, 0.18), K.mul(b, K.rot(0, 0, 30)), K.rgb(120, 220, 255), { name: "Bolt", neon: true });
      K.block(m, LV(0.18, 0.9, 0.18), K.mul(b, K.cf(side * 0.1, -0.75, 0), K.rot(0, 0, -30)), K.rgb(120, 220, 255), { name: "Bolt", neon: true });
    }
    return K.finish(m);
  },

  // 52 Lord Jacuzzi Whiskerton - Volcano Hot Tub Cat
  52: (K) => {
    const c = K.cat({
      bodyShape: "loaf", color: K.rgb(240, 225, 200), eyes: "closed", mouth: "smile", tail: "none",
      legs: false, innerEarColor: K.rgb(255, 170, 170),
    });
    const m = c.model;
    K.acc.sunglasses(c, { color: K.rgb(20, 20, 30) });
    K.ball(m, LV(1.6, 0.7, 1.6), c.attach("headTop", LV(0, 0.05, 0.15)), K.C.white, { name: "Towel" });
    K.ball(m, LV(0.8, 0.6, 0.8), c.attach("headTop", LV(0.1, 0.45, 0.15)), K.C.white, { name: "Towel" });
    K.cyl(m, 1.6, 6.2, K.cf(0, 0.5, 0.2), K.rgb(60, 45, 42), { name: "Tub", material: "Slate" });
    K.cyl(m, 0.12, 5.6, K.cf(0, 1.3, 0.2), K.rgb(255, 120, 20), { name: "Lava", neon: true });
    K.ball(m, 0.7, K.cf(1.9, 1.6, -0.9), K.rgb(255, 220, 0), { name: "Duck" });
    K.ball(m, 0.45, K.cf(1.9, 2.1, -1.1), K.rgb(255, 220, 0), { name: "Duck" });
    K.wedge(m, LV(0.2, 0.15, 0.3), K.cf(1.9, 2.05, -1.4), K.rgb(255, 120, 0), { name: "Beak" });
    K.cyl(m, 0.9, 0.5, K.cf(-2.3, 1.75, -0.6), K.rgb(255, 250, 150), { name: "Lemonade", material: "Glass", transparency: 0.2 });
    K.limb(m, LV(-2.3, 2.0, -0.6), LV(-2.15, 2.7, -0.6), 0.08, K.rgb(255, 80, 120), { name: "Straw" });
    K.ball(m, 0.8, K.cf(-1.4, 2.3, 1.4), K.C.white, { name: "Steam", transparency: 0.6 });
    K.ball(m, 0.6, K.cf(1.2, 2.6, 1.6), K.C.white, { name: "Steam", transparency: 0.6 });
    return K.finish(m);
  },

  // 53 Subject Zero - Lab Test Subject Cat
  53: (K) => {
    const c = K.cat({
      color: K.C.white, eyes: "derp", mouth: "w", tail: "normal", pattern: "spots", color2: K.rgb(200, 200, 210),
      eyeColor: K.rgb(40, 40, 60), innerEarColor: K.rgb(255, 180, 190),
    });
    const m = c.model;
    const top = c.attach("headTop", LV(0, 0.55, 0));
    K.ball(m, LV(1.25, 0.9, 1.15), top, K.rgb(255, 150, 180), { name: "Brain" });
    K.ball(m, LV(1.6, 1.4, 1.5), K.mul(top, K.cf(0, 0.1, 0)), K.rgb(200, 240, 255), { name: "Dome", material: "Glass", transparency: 0.6 });
    K.cyl(m, 0.25, 1.7, K.mul(top, K.cf(0, -0.5, 0)), K.C.silver, { name: "DomeRing", material: "Metal" });
    const bat = c.attach("side", LV(-0.6, -0.9, 0.3));
    K.block(m, LV(0.9, 1.0, 1.4), bat, K.rgb(40, 160, 60), { name: "Battery" });
    K.cyl(m, 0.2, 0.3, K.mul(bat, K.cf(0, 0.6, -0.35)), K.C.red, { name: "Terminal" });
    K.cyl(m, 0.2, 0.3, K.mul(bat, K.cf(0, 0.6, 0.35)), K.C.black, { name: "Terminal" });
    const ear = K.p(c.attach("leftEar"));
    K.limb(m, ear, K.p(K.mul(bat, K.cf(0, 0.7, -0.35))), 0.1, K.C.red, { name: "Wire" });
    K.limb(m, K.p(c.attach("headTop", LV(0.5, 0, 0.3))), K.p(K.mul(bat, K.cf(0, 0.7, 0.35))), 0.1, K.C.black, { name: "Wire" });
    K.block(m, LV(1.3, 0.3, 0.5), c.attach("neck"), K.rgb(255, 120, 0), { name: "IDCollar" });
    return K.finish(m);
  },

  // 54 CHONK (Element 0) - Periodic Table Cat
  54: (K) => {
    const c = K.cat({
      bodyShape: "cube", scale: 1.25, color: K.rgb(235, 235, 240), eyes: "normal", mouth: "smile",
      tail: "puffy", innerEars: false, eyeColor: K.rgb(30, 30, 40),
    });
    const m = c.model;
    const cols = [K.rgb(255, 120, 150), K.rgb(255, 210, 80), K.rgb(100, 220, 255), K.rgb(120, 230, 120), K.rgb(200, 150, 255), K.rgb(255, 160, 80)];
    const bs = c.bodySize;
    const b = c.attach("body");
    let i = 0;
    for (const side of [-1, 1]) {
      for (const zy of [[-0.6, 0.35], [0.6, 0.35], [0, -0.4]]) {
        K.block(m, LV(0.12, 0.85, 0.85), K.mul(b, K.cf(side * (bs.x / 2 + 0.03), zy[1], zy[0])), cols[i], { name: "ElementTile" });
        i++;
      }
    }
    K.ball(m, LV(bs.x * 0.95, bs.y * 0.7, bs.z * 0.5), K.mul(b, K.cf(0, -0.35, -bs.z / 2)), K.rgb(250, 250, 255), { name: "Belly" });
    const tile = K.block(m, LV(0.6, 0.6, 0.08), c.attach("face", LV(0, 0.55, -0.02)), K.rgb(255, 120, 150), { name: "ElementTile" });
    K.text(tile, "C", { color: "#1e1e28" });
    return K.finish(m);
  },

  // 55 Prismo the Refracted - Prism Cat
  55: (K) => {
    const c = K.cat({
      color: K.rgb(225, 240, 255), material: "Glass", eyes: "big", mouth: "w", tail: "none",
      eyeColor: K.rgb(140, 60, 255), whiskerColor: K.rgb(200, 255, 255), innerEarColor: K.rgb(200, 160, 255),
    });
    const m = c.model;
    c.body.transparency = 0.35;
    c.head.transparency = 0.25;
    for (let i = -1; i <= 1; i++) {
      K.wedge(m, LV(0.6, 1.1 - Math.abs(i) * 0.3, 0.8), c.attach("back", LV(0, 0.4, i * 0.9)), K.rgb(150, 230, 255), { name: "Crystal", material: "Glass", transparency: 0.2 });
    }
    K.block(m, LV(0.12, 0.12, 3.0), c.attach("nose", LV(0, 0, -1.6)), K.C.white, { name: "BeamIn", neon: true });
    const tb = c.attach("tailBase");
    const rainbow = [K.rgb(255, 40, 40), K.rgb(255, 140, 0), K.rgb(255, 230, 0), K.rgb(40, 220, 60), K.rgb(40, 120, 255), K.rgb(160, 60, 255)];
    rainbow.forEach((col, k) => {
      const a = -25 + k * 10;
      K.block(m, LV(0.14, 0.14, 3.2), K.mul(tb, K.rot(a * 0.4, a, 0), K.cf(0, 0.2, 1.6)), col, { name: "Rainbow", neon: true });
    });
    return K.finish(m);
  },

  // 56 Chrono-Whiskers - Time Travel Cat
  56: (K) => {
    const c = K.cat({
      color: K.rgb(120, 115, 140), pattern: "stripes", color2: K.rgb(80, 75, 100), eyes: "big", mouth: "o",
      tail: "long", eyeColor: K.rgb(40, 20, 80), innerEarColor: K.rgb(220, 180, 255),
    });
    const m = c.model;
    K.acc.tophat(c, { color: K.rgb(90, 55, 30), band: K.rgb(200, 160, 60) });
    K.acc.sunglasses(c, { color: K.rgb(180, 130, 40) });
    const side = K.mul(c.attach("body", LV(-1.08, 0.1, 0)), K.rot(0, 0, 90));
    K.cyl(m, 0.1, 1.7, side, K.rgb(250, 245, 225), { name: "ClockFace" });
    K.cyl(m, 0.08, 1.95, K.mul(side, K.cf(0, -0.03, 0)), K.rgb(200, 160, 50), { name: "ClockRim", material: "Foil" });
    const f = c.attach("body", LV(-1.15, 0.1, 0));
    K.block(m, LV(0.06, 0.6, 0.08), K.mul(f, K.cf(0, 0.25, 0)), K.C.black, { name: "Hand" });
    K.block(m, LV(0.06, 0.08, 0.45), K.mul(f, K.cf(0, 0, 0.2)), K.C.black, { name: "Hand" });
    const paw = K.p(c.attach("frontRightPaw"));
    K.limb(m, K.p(c.attach("neck")), K.add(paw, LV(-0.3, 0.4, -0.3)), 0.06, K.rgb(220, 180, 60), { name: "Chain" });
    K.cyl(m, 0.15, 0.7, K.mul(K.cf(K.add(paw, LV(-0.3, 0.3, -0.4))), K.rot(90, 0, 0)), K.rgb(220, 180, 60), { name: "Watch", material: "Foil" });
    K.ball(m, LV(0.6, 0.6, 0.12), c.attach("tail", LV(0, 0.4, 0)), K.rgb(140, 255, 255), { name: "Vortex", neon: true });
    return K.finish(m);
  },

  // 57 Dr. Meowenstein - Mad Scientist Cat
  57: (K) => {
    const c = K.cat({
      bodyShape: "tall", color: K.rgb(130, 130, 140), eyes: "angry", mouth: "teeth", tail: "normal",
      eyeColor: K.rgb(180, 0, 0), noseColor: K.rgb(60, 40, 40),
    });
    const m = c.model;
    K.acc.sunglasses(c, { color: K.rgb(60, 255, 120) });
    K.acc.bowtie(c, { color: K.C.red });
    const b = c.attach("body");
    const bs = c.bodySize;
    K.block(m, LV(bs.x * 1.12, bs.y * 0.95, 0.25), K.mul(b, K.cf(0, -0.1, bs.z / 2)), K.C.white, { name: "Coat" });
    for (const side of [-1, 1]) {
      K.block(m, LV(0.25, bs.y * 0.95, bs.z * 0.9), K.mul(b, K.cf(side * bs.x * 0.55, -0.1, 0.05)), K.C.white, { name: "Coat" });
      K.block(m, LV(0.45, bs.y * 0.8, 0.2), K.mul(b, K.cf(side * bs.x * 0.33, -0.15, -bs.z / 2 - 0.02)), K.C.white, { name: "Coat" });
    }
    const h = K.p(c.attach("head"));
    for (const o of [LV(-1.0, 0.4, 0.3), LV(1.0, 0.4, 0.3), LV(-0.7, 0.9, 0.5), LV(0.7, 0.9, 0.5), LV(0, 1.1, 0.6)]) {
      K.ball(m, 0.85, K.add(h, o), K.rgb(250, 250, 250), { name: "Hair" });
    }
    const paw = K.add(K.p(c.attach("frontLeftPaw")), LV(0.2, 0.2, -0.3));
    K.ball(m, 1.0, paw, K.rgb(200, 120, 255), { name: "Flask", material: "Glass", transparency: 0.4 });
    K.ball(m, 0.75, K.add(paw, LV(0, -0.08, 0)), K.rgb(190, 60, 255), { name: "Potion", neon: true });
    K.cyl(m, 0.6, 0.35, K.cf(K.add(paw, LV(0, 0.7, 0))), K.rgb(200, 220, 255), { name: "FlaskNeck", material: "Glass", transparency: 0.4 });
    K.ball(m, 0.35, K.add(paw, LV(0.1, 1.25, 0)), K.rgb(220, 160, 255), { name: "Bubble", neon: true });
    return K.finish(m);
  },
};

// ============================================================================================ build
const hx2 = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
const C = (r, g, b) => "#" + hx2(r) + hx2(g) + hx2(b);

// A deliberately small palette: every static shape|material|colour is one draw call (budget 60).
const ROCK = C(92, 66, 58);
const ROCK2 = C(120, 86, 72);
const DARK = C(34, 30, 34);
const LAVA = C(255, 95, 20);
const LAVA2 = C(255, 170, 40);
const METAL = C(150, 155, 168);
const STEEL = C(80, 84, 96);
const LABW = C(226, 232, 238);
const CYAN = C(0, 255, 220);
const HAZ = C(255, 205, 0);
const RED = C(255, 40, 40);
const GREEN = C(60, 255, 120);
const PANEL = C(26, 26, 34);
const PAPER = C(240, 230, 200);
const INK = C(60, 40, 20);
const NOTE = C(240, 230, 200);
const NOTE_INK = C(30, 30, 30);
const WHITE = C(255, 255, 255);
const ROAD = C(66, 60, 68);
const FLOOR = C(170, 175, 182);
const WOOD = C(110, 90, 70);
const SLATE = "Slate";

// [colour, the solid material every non-neon, non-glass static part of that colour uses]
const PALETTE = [
  [LAVA, "plastic"], [LAVA2, "plastic"], [HAZ, "plastic"], [CYAN, "plastic"], [GREEN, "plastic"], [RED, "plastic"],
  [C(60, 120, 255), "plastic"], [C(255, 220, 40), "plastic"], [C(250, 250, 255), "plastic"], [C(255, 120, 220), "plastic"],
  [C(200, 80, 40), "metal"], [ROCK, "concrete"], [ROCK2, "concrete"], [DARK, "concrete"], [ROAD, "concrete"],
  [STEEL, "metal"], [C(40, 40, 46), "metal"], [C(120, 125, 135), "metal"], [C(220, 220, 225), "metal"], [C(205, 210, 220), "concrete"],
  [PANEL, "plastic"], [PAPER, "plastic"], [NOTE, "plastic"], [C(150, 155, 168), "metal"], [C(20, 20, 20), "plastic"],
  [WOOD, "wood"], [C(170, 120, 70), "wood"], [C(96, 88, 84), "concrete"], [C(200, 170, 60), "metal"],
].map(([h, mat]) => ({ h, mat, r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }));
const GLASS_C = C(200, 240, 255);
function nearest(hex) {
  if (typeof hex !== "string" || hex.length !== 7) return PALETTE[0];
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  let best = PALETTE[0], bd = Infinity;
  for (const p of PALETTE) {
    const d = 2 * (p.r - r) ** 2 + 4 * (p.g - g) ** 2 + 3 * (p.b - b) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
const NEON_PALETTE = PALETTE.filter((p) => p.mat === "plastic" && p.h !== PANEL && p.h !== PAPER && p.h !== NOTE && p.h !== C(20, 20, 20));
function nearestNeon(hex) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  let best = NEON_PALETTE[0], bd = Infinity;
  for (const p of NEON_PALETTE) {
    const d = 2 * (p.r - r) ** 2 + 4 * (p.g - g) ** 2 + 3 * (p.b - b) ** 2;
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
// -> [colour, material, transparency] for a static part
function snapLook(color, material, neon, transparency) {
  const m = String(material || "").toLowerCase();
  const t = transparency == null ? 0 : transparency;
  if (neon || m === "neon") return [nearestNeon(color).h, "neon", t >= 1 ? 1 : t > 0.3 ? 0.4 : t > 0.05 ? 0.2 : 0];
  if (m === "glass" || m === "forcefield") return [GLASS_C, "glass", 0.4];
  const p = nearest(color);
  return [p.h, p.mat, t >= 1 ? 1 : t > 0.3 ? 0.6 : 0];
}

const YAW = { N: 0, S: 180, E: -90, W: 90 };
const DEG = Math.PI / 180;

export function build(z) {
  const K = z.K;
  const THREE = z.THREE;
  const cf = (x, y, zz, yaw) => z.cf(x, y, zz, yaw || 0);
  const mul = (...m) => K.mul(...m);
  const rot = (x, y, zz) => K.rot(x, y, zz);

  // ------------------------------------------------------------------------------------- helpers
  // P = the original's part helper (original part semantics through z.rpart).
  // Every static part's colour snaps to PALETTE and its material to a few kinds, because the zonekit draws
  // one instanced batch per shape|material|colour|transparency (budget: 60). Parts that move, glow or
  // change (dynamic / behaviours / lamps) keep their exact colour.
  const part = (def) => {
    if (def.dynamic || def.light || def.behaviors || def.keep) return z.part(def);
    const [color, material, transparency] = snapLook(def.color, def.material, def.neon, def.transparency);
    return z.part({ ...def, color, material, transparency, neon: false });
  };
  const rpart = (p) => {
    if (p.dynamic || p.light || p.keep) return z.rpart(p);
    const [color, material, transparency] = snapLook(p.Color, p.Material, p.Neon, p.Transparency);
    return z.rpart({ ...p, Color: color, Material: material, Transparency: transparency, Neon: false });
  };
  const P = (name, size, cframe, color, extra = {}) => rpart({ ...extra, Name: name, Size: size, CFrame: cframe, Color: color });
  const D = (name, size, cframe, color, extra = {}) => P(name, size, cframe, color, { ...extra, Decor: true });
  const NE = (name, size, cframe, color, extra = {}) => P(name, size, cframe, color, { ...extra, Decor: true, Neon: true });
  // vertical cylinder of height h, diameter d, centred on cframe
  const cyl = (name, h, d, cframe, color, extra = {}) => P(name, [h, d, d], mul(cframe, K.angles(0, 0, Math.PI / 2)), color, { ...extra, Shape: "Cylinder" });
  // a sign: a panel facing a compass direction (N = readers stand north of it) with one text label
  const sign = (text, x, y, zz, face, w, h, opts = {}) => {
    const yaw = typeof face === "number" ? face : (YAW[face] || 0);
    const p = part({
      shape: "box", size: [w, h, opts.depth || 0.4], cf: cf(x, y, zz, yaw),
      color: opts.bg || PANEL, material: opts.material || "plastic", collide: opts.collide === true,
    });
    // the label paints the sign colour itself (unlit), so dark ink on paper stays readable in the dim zone
    const l = z.label(p, text, { color: opts.color || WHITE, bg: opts.bg || PANEL, both: opts.both, pps: opts.pps || 30 });
    return [p, l];
  };
  const label = (part, text, opts) => z.label(part, text, opts);
  const lightOf = (color, range, intensity) => ({ color, range: range || 12, intensity: intensity || 1.5 });
  const good = (text) => z.notify(text);
  const cheer = () => {
    z.tone(1.0);
    later(0.15, () => z.tone(1.26));
    later(0.3, () => z.tone(1.5));
  };
  const copy = (t) => (Array.isArray(t) ? t.slice() : { ...t });
  // teleport to a zone-local FEET position; yaw is the ORIGINAL's (0 = facing north)
  const warp = (x, y, zz, yaw = 0) => z.player.teleport([x, y + 0.2, zz], yaw + 180);

  // timers on sim time (the engine forbids setTimeout in a Place)
  const timers = [];
  function later(s, fn) { timers.push({ t: z.time() + s, fn }); }

  // a keypad: tap it (or stand next to it and press E) -> text box -> check, with a lockout
  function keypad(part, key, opts, answer, onOk, lockSecs = 10, guard = null) {
    const fire = () => {
      if (guard && !guard()) return;
      const left = z.isLocked(key);
      if (left) { z.fail(`Keypad locked for ${left} s. Think harder!`); return; }
      z.input(opts, (text) => {
        if (text == null) return;
        if (text === answer) onOk();
        else {
          z.lockout(lockSecs, key);
          z.fail(`WRONG CODE. Locked for ${lockSecs} s.`);
        }
      });
    };
    z.click(part, fire);
    z.prompt(part, "Use " + (opts.title || "keypad"), fire);
  }
  const button = (part, text, fn) => { z.click(part, fn); z.prompt(part, text, fn); };

  // ------------------------------------------------------------------------------------- hazards
  // Zone hazards (lava/lasers/slag) send you back to a CHECKPOINT instead of the zone spawn. Checked every
  // tick against the part's real (oriented) box; `hot` false switches one off.
  const hazards = [];
  let burnAt = -1e9;
  const tmpV = new THREE.Vector3();
  const tmpM = new THREE.Matrix4();
  function hazard(part, back, disc = null, margin = 1) {
    const hz = { p: part, back, disc, m: margin, hot: true };
    hazards.push(hz);
    return hz;
  }
  const fixedBack = (x, y, zz, yaw) => () => [x, y, zz, yaw];
  function burn(hz) {
    const t = z.time();
    if (t - burnAt < 1) return;
    burnAt = t;
    z.sound("oof", { volume: 0.7 });
    const [x, y, zz, yaw] = hz.back();
    warp(x, y, zz, yaw);
    z.notify("OUCH! Hot hot hot! Back to the checkpoint.");
  }
  function hazardHit(hz, root) {
    const p = hz.p;
    const s = p.size;
    const m = p.cf;
    if (hz.disc) {
      const dx = root.x - m.elements[12], dy = root.y - m.elements[13], dz = root.z - m.elements[14];
      return dx * dx + dz * dz <= hz.disc * hz.disc && dy <= s[1] / 2 + 3.1 && dy >= -s[1] / 2 - 2.5;
    }
    tmpM.copy(m).invert();
    tmpV.copy(root).applyMatrix4(tmpM);
    return Math.abs(tmpV.x) <= s[0] / 2 + hz.m && Math.abs(tmpV.z) <= s[2] / 2 + hz.m && tmpV.y <= s[1] / 2 + 3.1 && tmpV.y >= -s[1] / 2 - 2.5;
  }
  const blinkers = []; // { hz, h, period, onTime, phase, onT, offT, state }
  function blinker(hz, period, onTime, phase = 0, onT = 0.1, offT = 0.85) {
    blinkers.push({ hz, h: hz.p, period, onTime, phase, onT, offT, state: null });
    return hz;
  }
  const movers = []; // fn(t)
  const reveals = []; // [cat, (feet) => bool]: reveal the cat once you stand where it is fair to tap it

  // ------------------------------------------------------------------------------------- A. ground, roads, spawn
  P("Ground", [390, 4, 390], cf(0, -2, 0), ROCK, { Material: SLATE });
  const patches = [[-120, -20, 30], [-60, 60, 20], [10, 90, 24], [150, 110, 18], [-150, 150, 22], [120, -150, 26], [-20, -150, 22], [180, -100, 16], [-100, -40, 16]];
  for (const pt of patches) part({ shape: "cylinder", size: [pt[2], 0.1, pt[2]], at: [pt[0], 0.05, pt[1]], color: C(96, 88, 84), decor: true });
  const road = (x, zz, sx, sz) => D("Road", [sx, 0.12, sz], cf(x, 0.06, zz), ROAD, { Material: "Asphalt" });
  road(-96, 0, 152, 10);
  road(-20, 15, 10, 40);
  road(33, 30, 106, 10);
  road(132, 30, 36, 10);
  road(120, 108, 8, 146);
  road(-40, -90, 8, 180);
  road(65, -180, 210, 8);
  road(-77.5, -60, 75, 8);
  road(-115, -72, 8, 24);
  road(-100, 22.5, 10, 45);
  road(30, 45, 8, 30);
  NE("RoadGlow", [150, 0.14, 0.4], cf(-96, 0.08, -5.2), LAVA);
  NE("RoadGlow", [150, 0.14, 0.4], cf(-96, 0.08, 5.2), LAVA);

  // spawn arch (outside the spawn/portal clearance)
  P("ArchPillar", [3, 18, 3], cf(-165, 9, -16), ROCK2, { Material: SLATE });
  P("ArchPillar", [3, 18, 3], cf(-165, 9, 16), ROCK2, { Material: SLATE });
  P("ArchBeam", [3, 4, 36], cf(-165, 20, 0), DARK, { Material: SLATE });
  NE("ArchGlow", [3.2, 0.4, 36.2], cf(-165, 17.8, 0), LAVA);
  for (const zz of [-16, 16]) {
    part({ shape: "cone", size: [1.6, 2.4, 1.6], at: [-165, 19.2, zz], color: LAVA2, material: "neon", decor: true,
      light: zz < 0 ? lightOf(LAVA, 24, 2) : undefined });
  }
  sign("WELCOME TO MOUNT HAIRBALL!\nDr. Meowenstein's volcano laboratory. 15 cats live here. Everything is HOT.\n" +
    "Lava rivers = back to spawn. Other lava = back to the last checkpoint.\nThe puzzles get harder as you go. Read EVERY sign.\n" +
    "Hidden in this zone: 4 diary pages, 5 fuses, 5 element notes, 3 fuel canisters and 1 power key.\n" +
    "The VOLCANO SUMMIT CLIMB starts at the steps on its south-west side (green pads = checkpoints).",
    -160, 5, -27, "W", 16, 8, { collide: true });

  // ------------------------------------------------------------------------------------- B. lava rivers
  const river = (name, size, x, zz) => {
    const p = P(name, size, cf(x, 0, zz), LAVA, { Material: "Neon" });
    z.kill(p);
    return p;
  };
  const bank = (x, zz, sx, sz) => P("Bank", [sx, 1, sz], cf(x, 0.5, zz), ROCK2, { Material: SLATE });
  river("LavaRiverA", [8, 0.6, 185], 100, 102.5);
  bank(95, 17.5, 2, 15);
  bank(95, 115, 2, 160);
  bank(105, 17.5, 2, 15);
  bank(105, 115, 2, 160);
  river("LavaRiverB", [82, 0.6, 8], -39, -100);
  bank(-63.5, -105, 33, 2);
  bank(-15, -105, 34, 2);
  bank(-63.5, -95, 33, 2);
  bank(-15, -95, 34, 2);
  river("LavaRiverC", [48, 0.6, 8], 171, -60);
  bank(171, -65, 48, 2);
  bank(171, -55, 48, 2);
  [[100, 60], [100, 120], [100, 175], [-60, -100], [-15, -100], [175, -60]].forEach((pt, i) => {
    part({ shape: "cone", size: [2.2, 3.2, 2.2], at: [pt[0], 1.9, pt[1]], color: LAVA2, material: "neon", decor: true,
      light: i === 0 ? lightOf(LAVA, 26, 2) : undefined });
  });
  function bridge(x, zz, alongX) {
    const deckC = C(70, 60, 58);
    P("BridgeDeck", alongX ? [16, 0.8, 10] : [10, 0.8, 16], cf(x, 2, zz), deckC, { Material: "Concrete" });
    if (alongX) {
      P("BridgeRamp", [10, 2.4, 6], cf(x - 11, 1.2, zz, 90), deckC, { Class: "WedgePart", Material: "Concrete" });
      P("BridgeRamp", [10, 2.4, 6], cf(x + 11, 1.2, zz, -90), deckC, { Class: "WedgePart", Material: "Concrete" });
      for (const dz of [-4.8, 4.8]) {
        P("BridgeRail", [16, 1.6, 0.4], cf(x, 3.2, zz + dz), STEEL, { Material: "Metal" });
        NE("RailGlow", [16, 0.2, 0.5], cf(x, 4.1, zz + dz), HAZ);
      }
    } else {
      P("BridgeRamp", [10, 2.4, 6], cf(x, 1.2, zz - 11, 0), deckC, { Class: "WedgePart", Material: "Concrete" });
      P("BridgeRamp", [10, 2.4, 6], cf(x, 1.2, zz + 11, 180), deckC, { Class: "WedgePart", Material: "Concrete" });
      for (const dx of [-4.8, 4.8]) {
        P("BridgeRail", [0.4, 1.6, 16], cf(x + dx, 3.2, zz), STEEL, { Material: "Metal" });
        NE("RailGlow", [0.5, 0.2, 16], cf(x + dx, 4.1, zz), HAZ);
      }
    }
  }
  bridge(100, 30, true);
  bridge(-40, -100, false);

  // ------------------------------------------------------------------------------------- C. the volcano + summit climb (52)
  const VX = 70, VZ = -60;
  const rr = (i) => 80 - 6 * i;
  const polar = (r, a, y) => [VX + r * Math.cos(a * DEG), y, VZ + r * Math.sin(a * DEG)];
  // local X = outward, local Z = tangent
  const vcf = (r, a, y) => { const p = polar(r, a, y); return mul(cf(p[0], p[1], p[2]), rot(0, -a, 0)); };
  const TIER_COLS = [ROCK2, ROCK2, ROCK, ROCK];
  for (let i = 0; i <= 9; i++) {
    part({ shape: "cylinder", size: [2 * rr(i), 14, 2 * rr(i)], at: [VX, 14 * i + 7, VZ], color: TIER_COLS[Math.min(3, Math.floor(i / 2.5))], material: "concrete" });
  }
  const craterLava = part({ shape: "cylinder", size: [40, 0.8, 40], at: [VX, 140.2, VZ], color: LAVA, material: "neon", light: lightOf(LAVA, 40, 3) });
  for (let k = 0; k <= 9; k++) {
    const a = k * 36 + 28;
    P("RimRock", [4, 3 + (k % 3), 3], vcf(24.5, a, 141.5), ROCK2, { Material: SLATE });
  }
  // Mount Hairball's giant cat ears on the rim
  for (const a of [90, 270]) {
    const x = VX + 24 * Math.cos(a * DEG), y = 140, zz = VZ + 24 * Math.sin(a * DEG);
    const base = mul(cf(x, y, zz), rot(0, -a, 0), rot(0, 90, 0));
    const tri = (bcf, w, h, t, col, neon) => {
      const ex = { Class: "WedgePart", Material: neon ? "Neon" : SLATE };
      P("Ear", [t, h, w / 2], mul(bcf, K.cf(w / 4, h / 2, 0), rot(0, -90, 0)), col, { ...ex });
      P("Ear", [t, h, w / 2], mul(bcf, K.cf(-w / 4, h / 2, 0), rot(0, 90, 0)), col, { ...ex });
    };
    tri(base, 16, 24, 3, ROCK2, false);
    tri(mul(base, K.cf(0, 1.5, 1.7)), 9, 15, 0.4, LAVA, true);
  }
  // smoke puffs over the crater (decor)
  [[9, 150, -9, 9], [-6, 158, -4, 12], [3, 168, 5, 15]].forEach((s) => {
    part({ shape: "sphere", size: [s[3], s[3] * 0.7, s[3]], at: [VX + s[0], s[1], VZ + s[2]], color: C(90, 80, 80), transparency: 0.55, decor: true });
  });
  // glowing lava streaks down the tiers
  for (let i = 0; i <= 9; i++) {
    for (const a of [30 + i * 7, 200 + i * 5, 300 - i * 4]) NE("LavaStreak", [0.4, 14, 2.2], vcf(rr(i) + 0.1, a, 14 * i + 7), LAVA);
  }

  const A0 = 150;
  const stageAngle = (i) => A0 + 33 * i;
  const at = (i, r, dt) => stageAngle(i) + (dt / r) / DEG;
  const cpPos = [];
  cpPos[0] = polar(88, A0 - 4, 0);
  const vblock = (name, r, a, top, sx, sz, color, extra) => P(name, [sx, 1, sz], vcf(r, a, top - 0.5), color || ROCK2, extra || { Material: SLATE });
  const tangent = (a) => [-Math.sin(a * DEG), 0, Math.cos(a * DEG)];
  // a block that carries you: an engine movingPlatform between its start and start + offset
  const MOVE = C(120, 70, 50);
  function moving(name, size, cframe, color, offset, period, material = "concrete") {
    const p0 = [cframe.elements[12], cframe.elements[13], cframe.elements[14]];
    const p1 = [p0[0] + offset[0], p0[1] + offset[1], p0[2] + offset[2]];
    const len = Math.hypot(offset[0], offset[1], offset[2]);
    return part({
      shape: "box", size, cf: cframe, color, material,
      behaviors: [{ type: "movingPlatform", waypoints: [p0, p1], speed: Math.max(0.5, (2 * len) / period), pauseS: 0.25 }],
    });
  }
  const vmoving = (name, r, a, top, sx, sz, offset, period) => moving(name, [sx, 1, sz], vcf(r, a, top - 0.5), MOVE, offset, period);
  const backTop = () => { const p = cpPos[z.flag("vcp") || 0]; return [p[0], p[1], p[2], 0]; };
  const GEYSER = C(255, 170, 40);
  function vgeyser(i, r, dt, y0, y1, phase) {
    const a = at(i, r, dt);
    const g = part({ shape: "box", size: [2.2, y1 - y0, 2.2], cf: vcf(r, a, (y0 + y1) / 2), color: GEYSER, material: "neon", transparency: 0.1, collide: false, dynamic: true });
    return blinker(hazard(g, backTop), 2.6, 1.2, phase, 0.1, 0.88);
  }

  // stage 0: ground -> 14 (the original truss: now three floating steps)
  {
    const r = rr(0);
    vblock("Step", r + 4, at(0, r + 4, -8), 4, 2.5, 2.5);
    vblock("Step", r + 4, at(0, r + 4, -3.5), 8, 2.5, 2.5);
    vblock("Step", r + 2.5, at(0, r + 2.5, 1), 12, 2.5, 2.5);
  }
  // stage 1: 14 -> 28 (three steps)
  {
    const r = rr(1);
    vblock("Step", r + 3, at(1, r + 3, 5), 18.5, 2.5, 2.5);
    vblock("Step", r + 3, at(1, r + 3, 10), 23, 2.5, 2.5);
    vblock("Step", r + 2, at(1, r + 2, 15), 27.5, 2.5, 2.5);
  }
  // stage 2: 28 -> 42 (posts out over the drop)
  {
    const r = rr(2);
    vblock("Post", r + 4, at(2, r + 4, 4), 31, 2, 2);
    vblock("Post", r + 9, at(2, r + 9, 9), 34, 2, 2);
    vblock("Post", r + 11, at(2, r + 11, 15), 37, 2, 2);
    vblock("Post", r + 6, at(2, r + 6, 20), 40, 2, 2);
    vblock("Post", r + 2, at(2, r + 2, 24), 41.5, 2, 2);
  }
  // stage 3: 42 -> 56 (sliding platform)
  {
    const r = rr(3);
    vblock("Step", r + 4, at(3, r + 4, 4), 45.5, 3, 3);
    const a = at(3, r + 8, 10);
    vmoving("SlidingRock", r + 8, a, 49, 4, 4, tangent(a).map((v) => v * 6), 4);
    vblock("Step", r + 4, at(3, r + 4, 18), 52.5, 2.5, 2.5);
    vblock("Step", r + 1.5, at(3, r + 1.5, 22), 55.5, 2.5, 2.5);
  }
  // stage 4: 56 -> 70 (lava geysers between the stones)
  {
    const r = rr(4);
    vblock("Step", r + 4, at(4, r + 4, 4), 59, 3, 3);
    vblock("Step", r + 8, at(4, r + 8, 10), 62.5, 3, 3);
    vblock("Step", r + 8, at(4, r + 8, 17), 66, 3, 3);
    vblock("Step", r + 2.5, at(4, r + 2.5, 22), 69.5, 2.5, 2.5);
    vgeyser(4, r + 6, 7, 56, 76, 0);
    vgeyser(4, r + 8, 13.5, 56, 80, 1.3);
    vgeyser(4, r + 5.5, 19.5, 56, 82, 0.6);
  }
  // stage 5: 70 -> 84 (narrow rising beams)
  {
    const r = rr(5);
    const beam = (r0, dt0, y0, r1, dt1, y1) => {
      const a0 = polar(r0, at(5, r0, dt0), 0), a1 = polar(r1, at(5, r1, dt1), 0);
      const p0 = z.pos(a0[0], y0, a0[2]), p1 = z.pos(a1[0], y1, a1[2]);
      const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
      const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      P("NarrowBeam", [1.0, 0.6, len], mul(K.lookAt(mid, p1), K.cf(0, -0.3, 0)), C(150, 80, 50), { Material: SLATE });
    };
    beam(r + 4, 0, 70, r + 4, 14, 77);
    vblock("Ledge", r + 4, at(5, r + 4, 16.5), 77, 3, 3);
    beam(r + 4, 18, 77, r + 0.5, 31, 84);
  }
  // stage 6: 84 -> 98 (tiny posts)
  {
    const r = rr(6);
    vblock("TinyPost", r + 4, at(6, r + 4, 4), 87.5, 1.6, 1.6);
    vblock("TinyPost", r + 8, at(6, r + 8, 8), 90.5, 1.6, 1.6);
    vblock("TinyPost", r + 11, at(6, r + 11, 13), 93, 1.6, 1.6);
    vblock("TinyPost", r + 7, at(6, r + 7, 18), 95.5, 1.6, 1.6);
    vblock("TinyPost", r + 2.5, at(6, r + 2.5, 22), 97.5, 1.6, 1.6);
  }
  // stage 7: 98 -> 112 (post + the original floating truss, now two small floating steps)
  {
    const r = rr(7);
    vblock("Post", r + 4, at(7, r + 4, 5), 102, 2, 2);
    vblock("Post", r + 3.5, at(7, r + 3.5, 9.5), 106, 2, 2);
    vblock("Post", r + 2.5, at(7, r + 2.5, 14), 110, 2, 2);
  }
  // stage 8: 112 -> 126 (moving platforms)
  {
    const r = rr(8);
    vblock("Post", r + 4, at(8, r + 4, 4), 115, 2.5, 2.5);
    const a1 = at(8, r + 8, 10);
    vmoving("SlidingRock", r + 8, a1, 118.5, 3.5, 3.5, tangent(a1).map((v) => v * 5), 3.5);
    vmoving("RisingRock", r + 8, at(8, r + 8, 17), 122, 3.5, 3.5, [0, 3, 0], 3);
    vblock("Post", r + 2.5, at(8, r + 2.5, 22), 125.5, 2.5, 2.5);
  }
  // stage 9: 126 -> 140 (posts + geysers)
  {
    const r = rr(9);
    vblock("Post", r + 4, at(9, r + 4, 4), 129, 2, 2);
    vblock("Post", r + 8, at(9, r + 8, 9), 132.5, 2, 2);
    vblock("Post", r + 5, at(9, r + 5, 14), 136, 2, 2);
    vblock("Post", r + 1.5, at(9, r + 1.5, 18), 139.5, 2, 2);
    vgeyser(9, r + 6, 6.5, 126, 146, 0.4);
    vgeyser(9, r + 6.5, 11.5, 126, 148, 1.7);
    vgeyser(9, r + 3.5, 16, 126, 150, 1.0);
  }
  // checkpoints: on ledge k (y = 14k) just past the end of stage k-1
  for (let k = 1; k <= 10; k++) {
    const r = k === 10 ? 23 : rr(k) + 3;
    const a = at(k - 1, r, 28);
    const p = polar(r, a, 14 * k);
    cpPos[k] = p;
    const pad = NE("Checkpoint", [4, 0.3, 4], cf(p[0], p[1] + 0.15, p[2]), GREEN, { Transparency: 0.2 });
    D("CheckpointFlag", [0.3, 5, 0.3], cf(p[0] + 1.8, p[1] + 2.5, p[2]), METAL);
    z.touch(pad, () => {
      if ((z.flag("vcp") || 0) < k) {
        z.flag("vcp", k);
        good(`Checkpoint ${k}/10`);
        z.tone(1 + k * 0.08);
      }
    });
  }
  // crater: stones across the lava to the centre rock (52)
  {
    const ac = stageAngle(9) + 75;
    hazard(craterLava, backTop, 20.5);
    const STONE = C(90, 60, 50);
    vblock("CraterStone", 14, ac, 141.6, 2.5, 2.5, STONE);
    vblock("CraterStone", 7, ac + 10, 143.1, 2.5, 2.5, STONE);
    P("CentreRock", [5, 6, 5], cf(VX, 141.6, VZ), STONE, { Material: SLATE });
    z.cat(52, cf(VX, 144.6, VZ, 30), {});
  }
  const fuseSpots = {};
  fuseSpots.YELLOW = polar(rr(2) + 3, stageAngle(1) + 140, 28);
  fuseSpots.CAN_A = polar(rr(4) + 3, stageAngle(3) + 70, 56);

  // ------------------------------------------------------------------------------------- D. lava lake (43)
  const lakeBack = fixedBack(-115, 0, -85, 0);
  const lake = P("LavaLake", [70, 1, 70], cf(-115, 0, -125), LAVA, { Material: "Neon", light: lightOf(LAVA, 40, 2) });
  hazard(lake, lakeBack, null, 0.3);
  [[-135, -140], [-95, -150], [-140, -105]].forEach((pt) => {
    part({ shape: "cone", size: [2.4, 3.4, 2.4], at: [pt[0], 2.1, pt[1]], color: LAVA2, material: "neon", decor: true });
  });
  P("Cliff", [74, 26, 6], cf(-115, 13, -163), ROCK2, { Material: SLATE });
  P("Cliff", [6, 20, 74], cf(-153, 10, -125), ROCK2, { Material: SLATE });
  P("Cliff", [4, 12, 54], cf(-78, 6, -133), ROCK2, { Material: SLATE });
  const STONE_C = C(60, 50, 50);
  const stones = [[-112, -94, 1.5, 3], [-106, -100.5, 2.5, 2.5], [-111, -107, 3.5, 2.2], [-118, -111, 4.5, 2], [-118, -123, 6.5, 1.8]];
  for (const s of stones) P("Stone", [s[3], 1.2, s[3]], cf(s[0], s[2] - 0.6, s[1]), STONE_C, { Material: SLATE });
  moving("SlidingStone", [3, 1.2, 3], cf(-123, 4.9, -117), MOVE, [-5, 0, 0], 4);
  const lg = part({ shape: "box", size: [2.4, 14, 2.4], at: [-120.5, 7, -120], color: GEYSER, material: "neon", transparency: 0.1, collide: false, dynamic: true });
  blinker(hazard(lg, lakeBack), 2.4, 1.1, 0, 0.1, 0.88);
  const ISLAND = C(70, 55, 50);
  P("Island", [8, 8, 8], cf(-114, 3.5, -131), ISLAND, { Material: SLATE });
  z.cat(43, cf(-114, 7.5, -131, 180), {});
  // side branch to the small island (fuel canister C)
  P("Stone", [2, 1.2, 2], cf(-98, 2.0, -103), STONE_C, { Material: SLATE });
  P("Stone", [2, 1.2, 2], cf(-91, 2.6, -107), STONE_C, { Material: SLATE });
  P("SmallIsland", [5, 4, 5], cf(-85, 1.5, -113), ISLAND, { Material: SLATE });
  fuseSpots.CAN_C = [-85, 3.5, -113];
  P("Boulder", [6, 5, 5], mul(cf(-140, 2.5, -86), K.angles(0, 0.4, 0.1)), ROCK2, { Material: SLATE });
  fuseSpots.RED = [-147, 0, -86];
  sign("LAVA LAKE\nMagma Mittens lives on the island.\nHop the stones. The sliding one slides.\nThe lava fountain blinks: go when it is dim.", -125, 4, -84, "S", 12, 5, { collide: true });
  sign("DIARY PAGE 1/4\n\"Breakfast at 7:15 AM sharp.\nChrono-Whiskers watched me eat. Judgingly.\"", -100, 3.5, -84, "S", 9, 4, { collide: true, bg: PAPER, color: INK });

  // ------------------------------------------------------------------------------------- E. lava tube cave (power key, note #1)
  {
    const cx = -26, cz = -48;
    part({ shape: "box", size: [16, 0.2, 16], at: [cx, 0.1, cz], color: C(40, 30, 30), material: "lava", decor: true });
    P("TubeWall", [16, 9, 2], cf(cx, 4.5, cz - 8), ROCK2, { Material: SLATE });
    P("TubeWall", [16, 9, 2], cf(cx, 4.5, cz + 8), ROCK2, { Material: SLATE });
    P("TubeWall", [2, 9, 16], cf(cx + 8, 4.5, cz), ROCK2, { Material: SLATE });
    P("TubeWall", [2, 9, 5], cf(cx - 8, 4.5, cz - 5.5), ROCK2, { Material: SLATE });
    P("TubeWall", [2, 9, 5], cf(cx - 8, 4.5, cz + 5.5), ROCK2, { Material: SLATE });
    P("TubeWall", [2, 3, 6], cf(cx - 8, 7.5, cz), ROCK2, { Material: SLATE });
    P("TubeRoof", [18, 2, 18], cf(cx, 10, cz), ROCK, { Material: SLATE });
    NE("TubeCrack", [0.3, 6, 0.3], mul(cf(cx + 6.8, 4, cz - 3), K.angles(0, 0, 0.3)), LAVA);
    NE("TubeCrack", [0.3, 5, 0.3], mul(cf(cx + 2, 4, cz + 6.8), K.angles(0.3, 0, 0)), LAVA);
    const ped = P("KeyPedestal", [2, 3, 2], cf(cx + 4, 1.5, cz), STEEL, { Material: "Metal" });
    const key = part({ shape: "box", size: [0.4, 1.2, 0.8], at: [cx + 4, 3.6, cz], color: C(120, 200, 255), material: "neon", decor: true, light: lightOf(C(120, 200, 255), 12, 1.5) });
    z.tag(key, "Spin", { axis: "y", speed: 90 });
    z.prompt(ped, "Take POWER KEY", () => {
      if (z.flag("pkey")) { z.notify("You already have the Prism Lab POWER KEY."); return; }
      z.flag("pkey", true);
      key.show(false);
      good("Got the PRISM LAB POWER KEY! (The laser in the Prism Lab needs it.)");
      cheer();
    });
    sign("ELEMENT NOTE #1\n\n6", cx - 9.3, 3.5, cz - 5.5, "W", 3.5, 3.5, { bg: NOTE, color: NOTE_INK });
  }

  // ------------------------------------------------------------------------------------- F. power station + fuse box (51)
  const FUSES = [
    { key: "RED", color: C(255, 50, 50), n: 3 },
    { key: "ORANGE", color: C(255, 140, 20), n: 8 },
    { key: "YELLOW", color: C(255, 230, 40), n: 1 },
    { key: "WHITE", color: C(250, 250, 255), n: 6 },
    { key: "BLUE", color: C(60, 120, 255), n: 5 },
  ];
  const fuseCount = () => FUSES.filter((f) => z.flag("fuse" + f.key)).length;
  {
    const x0 = -70, z0 = -32;
    P("PowerHouse", [14, 9, 10], cf(x0, 4.5, z0), C(90, 95, 105), { Material: "CorrodedMetal" });
    P("PowerRoof", [15, 1, 11], cf(x0, 9.5, z0), DARK, { Material: "Metal" });
    for (let i = -1; i <= 1; i++) {
      cyl("Transformer", 6, 3, cf(x0 + i * 4.5, 3, z0 - 8), METAL, { Material: "Metal" });
      NE("Coil", [0.5, 1, 0.5], cf(x0 + i * 4.5, 6.6, z0 - 8), CYAN);
    }
    NE("Hazard", [14.2, 0.6, 0.2], cf(x0, 7.5, z0 - 5.05), HAZ);
    const box = P("FuseBox", [0.6, 5, 6], cf(x0 + 7.3, 3.5, z0), C(50, 52, 60), { Material: "Metal" });
    [0, 2, 4, 1, 3].forEach((fi, i) => {
      NE("Socket", [0.3, 0.8, 0.8], cf(x0 + 7.65, 3.5, z0 - 3.2 + (i + 1) * 1.1), FUSES[fi].color);
    });
    sign("POWER STATION - FUSE BOX\nSparky's 5 FUSES were stolen and hidden around Mount Hairball!\nEach fuse is stamped with a number.\n" +
      "Plug them in from HOTTEST to COOLEST colour, the way astronomers sort STARS\n(there is a star chart at Mission Control).\nTap the fuse box and type the 5 numbers in that order.",
    x0 + 7.35, 7.5, z0, "E", 9, 3.2, {});
    // the original showed each fuse's stamp on a billboard; here the box lists the stamps you carry
    const fuseOpts = { title: "FUSE BOX", hint: "5 fuse numbers, hottest to coolest", kind: "digits", max: 5 };
    keypad(box, "fusebox", fuseOpts, "56183", () => {
      z.unlock(51);
      good("ZAP! Power restored. Sparky's cage is open!");
      cheer();
    }, 15, () => {
      const have = fuseCount();
      if (have < 5) { z.fail(`The fuse box needs 5 fuses. You have ${have}/5.`); return false; }
      fuseOpts.hint = "Your fuses: " + FUSES.slice().sort((a, b) => (a.key < b.key ? -1 : 1)).map((f) => `${f.key} ${f.n}`).join(", ") + ". Type them hottest to coolest.";
      return true;
    });
    P("CatPedestal", [6, 1, 6], cf(x0 + 14, 0.5, z0 - 6), STEEL, { Material: "DiamondPlate" });
    z.cat(51, cf(x0 + 14, 1, z0 - 6, -90), { locked: true });
  }
  fuseSpots.ORANGE = [189, 0, 189];
  fuseSpots.WHITE = [178, 0.6, -147];
  fuseSpots.BLUE = [184, 12, 90];
  for (const f of FUSES) {
    const s = fuseSpots[f.key];
    const fp = part({ shape: "box", size: [0.9, 1.6, 0.9], at: [s[0], s[1] + 0.8, s[2]], color: f.color, material: "neon", collide: false, dynamic: true });
    const ring = part({ shape: "cylinder", size: [2.2, 0.1, 2.2], at: [s[0], s[1] + 0.06, s[2]], color: f.color, material: "neon", transparency: 0.4, decor: true, dynamic: true });
    z.prompt(fp, `Take the ${f.key} fuse`, () => {
      if (z.flag("fuse" + f.key)) { z.notify(`You already have the ${f.key} fuse (stamped ${f.n}).`); return; }
      z.flag("fuse" + f.key, true);
      fp.show(false);
      ring.show(false);
      good(`${f.key} FUSE stamped with a ${f.n}! (${fuseCount()}/5 fuses)`);
      z.tone(1.2);
    });
  }

  // ------------------------------------------------------------------------------------- G. lab courtyard
  part({ shape: "box", size: [114, 0.2, 66], at: [-105, 0.1, 79], color: FLOOR, material: "concrete", decor: true });
  for (const x of [-107, -93]) {
    P("GatePillar", [3, 15, 3], cf(x, 7.5, 44), LABW, { Material: "Metal" });
    NE("GateGlow", [3.2, 0.4, 3.2], cf(x, 14.2, 44), CYAN);
  }
  P("GateBeam", [19, 3, 2], cf(-100, 16, 44), PANEL, { Material: "Metal" });
  NE("GateStripe", [19.2, 0.4, 2.2], cf(-100, 17.6, 44), CYAN);
  const BOARD = C(40, 44, 56);
  function station(sx, sz, title, sub, color) {
    P("StationBoard", [13, 15, 1], cf(sx - 2, 7.5, sz + 1), BOARD, { Material: "Metal" });
    NE("StationTrim", [13.4, 0.4, 1.2], cf(sx - 2, 15.1, sz + 1), color);
    if (title) sign(sub ? `${title}\n${sub}` : title, sx - 2, 17.5, sz + 0.9, "N", 13, 4, { color });
    P("CatPedestal", [6, 1, 6], cf(sx + 9.5, 0.5, sz), STEEL, { Material: "DiamondPlate" });
  }

  // 45 Lights Out ------------------------------------------------------------------
  {
    const sx = -140, sz = 72;
    station(sx, sz, "REACTOR CONTROL: turn ALL lights OFF", "A light flips itself AND its neighbours (up, down, left, right). Red button = RESET.", C(255, 230, 60));
    const ON = C(255, 230, 60), OFF = C(55, 58, 70);
    const SOL = [[1, 1], [1, 4], [2, 2], [3, 3], [3, 4], [4, 1]];
    const start = new Array(16).fill(false);
    const press = (st, r, c) => {
      for (const d of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const r2 = r + d[0], c2 = c + d[1];
        if (r2 >= 1 && r2 <= 4 && c2 >= 1 && c2 <= 4) { const i = (r2 - 1) * 4 + c2 - 1; st[i] = !st[i]; }
      }
    };
    for (const s of SOL) press(start, s[0], s[1]);
    const btn = [];
    const render = (st) => { for (let i = 0; i < 16; i++) btn[i].setColor(st[i] ? ON : OFF); };
    for (let r = 1; r <= 4; r++) {
      for (let c = 1; c <= 4; c++) {
        // facing the board from the north, col 1 is on the viewer's left (= east side, larger x)
        const b = part({ shape: "box", size: [2.4, 2.4, 0.5], cf: cf(sx - 2 - (c - 2.5) * 2.9, 2.6 + (4 - r) * 2.9, sz + 0.3), color: OFF, material: "neon", dynamic: true });
        btn[(r - 1) * 4 + c - 1] = b;
        z.click(b, () => {
          let st = z.flag("lo");
          if (!st) { st = copy(start); z.flag("lo", st); }
          press(st, r, c);
          render(st);
          z.tone(st[(r - 1) * 4 + c - 1] ? 1.3 : 0.9, { volume: 0.5 });
          if (!st.some(Boolean) && !z.isUnlocked(45)) {
            z.unlock(45);
            good("REACTOR STABLE! Atomic Kittentron's cage is open!");
            cheer();
          }
        });
      }
    }
    render(start);
    const reset = P("ResetButton", [3, 0.9, 0.6], cf(sx - 2, 0.6, sz + 0.2), RED, { Material: "Neon" });
    button(reset, "RESET the reactor board", () => { z.flag("lo", copy(start)); render(start); });
    z.cat(45, cf(sx + 9.5, 1, sz, 180), { locked: true });
  }

  // 46 Simon Says ------------------------------------------------------------------
  {
    const sx = -114, sz = 72;
    station(sx, sz, "MEOW-TRON SAYS...", "Press the green START button. Watch the lights. Repeat them. 6 rounds.", C(0, 255, 230));
    const COLS = [C(255, 50, 50), C(50, 220, 80), C(60, 120, 255), C(255, 220, 40)];
    const DIM = [C(110, 30, 30), C(30, 90, 40), C(30, 50, 110), C(110, 95, 25)];
    const PITCH = [0.8, 1.0, 1.2, 1.5];
    const pos = [[-3, 9], [3, 9], [-3, 4], [3, 4]];
    const btn = [];
    const flash = (i) => {
      btn[i].setColor(COLS[i]);
      z.tone(PITCH[i], { volume: 0.7 });
      later(0.4, () => btn[i].setColor(DIM[i]));
    };
    const ROUNDS = 6;
    const playRound = (st) => {
      st.busy = true;
      st.idx = 0;
      for (let i = 0; i < st.round; i++) later(0.8 + i * 0.7, () => { if (z.flag("simon") === st) flash(st.seq[i]); });
      later(0.8 + st.round * 0.7, () => {
        if (z.flag("simon") === st) { st.busy = false; z.notify(`Your turn! Round ${st.round}/${ROUNDS}`); }
      });
    };
    for (let i = 0; i < 4; i++) {
      const b = part({ shape: "cylinder", size: [4, 0.6, 4], cf: mul(cf(sx - 2 + pos[i][0], pos[i][1], sz + 0.2), K.angles(Math.PI / 2, 0, 0)), color: DIM[i], material: "neon", dynamic: true });
      btn[i] = b;
      z.click(b, () => {
        const st = z.flag("simon");
        if (!st) { flash(i); z.notify("Press the green START button first!"); return; }
        if (st.busy) return;
        flash(i);
        if (st.seq[st.idx] === i) {
          st.idx++;
          if (st.idx >= st.round) {
            if (st.round >= ROUNDS) {
              z.flag("simon", null);
              z.unlock(46);
              good("MEOW-TRON: 'IMPOSSIBLE. YOU WIN.' The cage is open!");
              cheer();
            } else {
              st.round++;
              playRound(st);
            }
          }
        } else {
          z.flag("simon", null);
          z.lockout(4, "simon");
          z.fail("WRONG! MEOW-TRON laughs in binary. Try again in 4 s.");
        }
      });
    }
    const startB = P("StartButton", [4, 1.4, 0.6], cf(sx - 2, 12.6, sz + 0.2), C(40, 200, 90), { Material: "Neon" });
    button(startB, "START MEOW-TRON SAYS", () => {
      const left = z.isLocked("simon");
      if (left) { z.fail(`MEOW-TRON is rebooting... ${left} s`); return; }
      const seq = [];
      for (let i = 0; i < ROUNDS; i++) seq.push(z.randint(0, 3));
      const st = { seq, round: 1, idx: 0, busy: true };
      z.flag("simon", st);
      playRound(st);
    });
    NE("RobotEye", [1.4, 1.4, 0.3], cf(sx - 7.3, 12.6, sz + 0.4), CYAN);
    NE("RobotEye", [1.4, 1.4, 0.3], cf(sx + 3.3, 12.6, sz + 0.4), CYAN);
    D("Antenna", [0.3, 4, 0.3], cf(sx - 2, 21.5, sz + 1), METAL);
    NE("AntennaBulb", [1, 1, 1], cf(sx - 2, 23.8, sz + 1), LAVA, { Shape: "Ball" });
    z.cat(46, cf(sx + 9.5, 1, sz, 180), { locked: true });
  }

  // 47 Sliding DNA tiles -----------------------------------------------------------
  {
    const sx = -88, sz = 72;
    station(sx, sz, "DNA SORTER", "Slide the samples into order: 1 2 3 / 4 5 6 / 7 8 _ (blank bottom-right). Red button = RESET.", C(120, 255, 150));
    const START = [1, 2, 7, 5, 6, 4, 0, 8, 3];
    const GOAL = [1, 2, 3, 4, 5, 6, 7, 8, 0];
    const tiles = [];
    const slotCF = (i) => {
      const r = Math.floor(i / 3), c = i % 3;
      return cf(sx - 2 - (c - 1) * 3.4, 4 + (2 - r) * 3.4, sz + 0.2);
    };
    const render = (st) => { for (let i = 0; i < 9; i++) if (st[i] !== 0) tiles[st[i]].moveTo(slotCF(i)); };
    for (let t = 1; t <= 8; t++) {
      const tp = part({ shape: "box", size: [3.2, 3.2, 0.6], cf: slotCF(START.indexOf(t)), color: C(60, 200, 110), dynamic: true });
      label(tp, String(t), { color: WHITE, stroke: true });
      tiles[t] = tp;
      z.click(tp, () => {
        let st = z.flag("slide");
        if (!st) { st = copy(START); z.flag("slide", st); }
        const ti = st.indexOf(t), bi = st.indexOf(0);
        const r1 = Math.floor(ti / 3), c1 = ti % 3, r2 = Math.floor(bi / 3), c2 = bi % 3;
        if (Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1) {
          st[ti] = 0;
          st[bi] = t;
          z.tone(1.1, { volume: 0.4 });
        }
        render(st);
        if (st.every((v, i) => v === GOAL[i]) && !z.isUnlocked(47)) {
          z.unlock(47);
          good("DNA SORTED! Clone #47 is free (it is still not the original).");
          cheer();
        }
      });
    }
    const reset = P("ResetButton", [3, 0.9, 0.6], cf(sx - 2, 0.6, sz + 0.2), RED, { Material: "Neon" });
    button(reset, "RESET the DNA sorter", () => { z.flag("slide", copy(START)); render(START); });
    for (const x of [sx - 12, sx + 14.5]) {
      part({ shape: "cylinder", size: [3.5, 6, 3.5], at: [x, 3, sz + 8], color: C(150, 255, 170), material: "glass", transparency: 0.5 });
    }
    z.cat(47, cf(sx + 9.5, 1, sz, 180), { locked: true });
  }

  // 49 Symbol algebra keypad -------------------------------------------------------
  {
    const sx = -62, sz = 72;
    station(sx, sz, null, null, C(255, 120, 220));
    const eq = part({ shape: "box", size: [12, 12, 0.2], cf: cf(sx - 2, 9, sz + 0.4), color: C(30, 20, 40), decor: true });
    label(eq, "SCIENCE KEYPAD\n\nFLASK + FLASK + FLASK = 21\nATOM + ATOM x ATOM = 20\nMAGNET x ATOM - FLASK = 29\nSKULL / ATOM + MAGNET = 11\n\n" +
      "(x = times, / = divide. Do it like a scientist: x and / before + and -)\nCODE = SKULL FLASK MAGNET ATOM", { color: C(255, 230, 250) });
    const pad = P("Keypad", [5, 1.6, 0.6], cf(sx - 2, 1.4, sz + 0.2), C(255, 120, 220), { Material: "Neon" });
    keypad(pad, "algebra", { title: "SCIENCE KEYPAD", hint: "SKULL FLASK MAGNET ATOM (4 digits)", kind: "digits", max: 4 }, "8794", () => {
      z.unlock(49);
      good("EUREKA! The Catalyst's cage is open!");
      cheer();
    }, 10);
    z.cat(49, cf(sx + 9.5, 1, sz, 180), { locked: true });
  }

  // 54 Periodic table wall + element lock ------------------------------------------
  {
    const EL = [["H", "Hydrogen"], ["He", "Helium"], ["Li", "Lithium"], ["Be", "Beryllium"], ["B", "Boron"],
      ["C", "Carbon"], ["N", "Nitrogen"], ["O", "Oxygen"], ["F", "Fluorine"], ["Ne", "Neon"],
      ["Na", "Sodium"], ["Mg", "Magnesium"], ["Al", "Aluminium"], ["Si", "Silicon"], ["P", "Phosphorus"],
      ["S", "Sulfur"], ["Cl", "Chlorine"], ["Ar", "Argon"], ["K", "Potassium"], ["Ca", "Calcium"]];
    P("PeriodicWall", [1, 24, 40], cf(-160, 12, 76), BOARD, { Material: "Metal" });
    NE("PeriodicTrim", [1.2, 0.5, 40.2], cf(-160, 23.9, 76), CYAN);
    // one board: the table as five rows of five, then the lock's instructions (the wall faces east)
    const rows = [];
    for (let row = 0; row < 4; row++) {
      const cells = [];
      for (let col = 0; col < 5; col++) { const i = row * 5 + col; cells.push(`${i + 1} ${EL[i][0]}`); }
      rows.push(cells.join("     "));
    }
    const table = part({ shape: "box", size: [34, 17, 0.3], cf: cf(-159.3, 13.6, 76, -90), color: PANEL, decor: true });
    label(table, "PERIODIC TABLE OF THE ELEMENTS (1 - 20)\n\n" + rows.join("\n") +
      "\n\nELEMENT LOCK (below, south end): 5 ELEMENT NOTES are hidden around Mount Hairball, each with a number.\n" +
      "Turn each number into its element SYMBOL, read them in note order #1 to #5, and type the word.", { color: C(200, 245, 255) });
    for (let col = 0; col < 5; col++) {
      NE("PeriodicStripe", [0.4, 0.6, 5.4], cf(-159.4, 4.6, 89 - col * 6.6), [RED, C(255, 220, 40), CYAN, GREEN, C(255, 120, 220)][col]);
    }
    const lock = P("ElementLock", [0.6, 3, 4], cf(-158.6, 2.5, 102), C(255, 150, 170), { Material: "Neon" });
    keypad(lock, "chonk", { title: "ELEMENT LOCK", hint: "The 5 symbols as one word", kind: "text", max: 12 }, "CHONK", () => {
      z.unlock(54);
      good("C-H-O-N-K! The heaviest cage in the world swings open!");
      cheer();
    }, 15);
    P("CatPedestal", [7, 1, 7], cf(-150, 0.5, 102), STEEL, { Material: "DiamondPlate" });
    z.cat(54, cf(-150, 1, 102, -90), { locked: true });
  }
  // courtyard decor: tesla coils, barrels, pipes
  [[-152, 52], [-76, 52], [-52, 100], [-128, 100]].forEach((pt, i) => {
    cyl("TeslaBase", 6, 2, cf(pt[0], 3, pt[1]), STEEL, { Material: "Metal" });
    const top = part({ shape: "sphere", size: [2.2, 2.2, 2.2], at: [pt[0], 7, pt[1]], color: CYAN, material: "neon", decor: true, dynamic: true,
      light: i === 1 ? lightOf(CYAN, 16, 2) : undefined });
    if (i !== 1) z.tag(top, "Blink", { period: 0.6 });
  });
  for (const pt of [[-100, 108], [-96, 109], [-70, 106], [-138, 108]]) {
    cyl("Barrel", 3, 2.2, cf(pt[0], 1.5, pt[1]), HAZ, { Material: "Metal" });
    NE("BarrelGoo", [2, 0.2, 2], cf(pt[0], 3.05, pt[1]), GREEN);
  }
  D("Pipe", [1.2, 1.2, 60], mul(cf(-45, 12, 0), K.angles(0, 0.5, 0)), METAL, { Material: "Metal" });

  // ------------------------------------------------------------------------------------- H. Secure Wing (53)
  {
    const WALL = C(205, 210, 220);
    P("WingWallN", [100, 16, 2], cf(-110, 8, 121), WALL, { Material: "Concrete" });
    P("WingWallS", [100, 16, 2], cf(-110, 8, 155), WALL, { Material: "Concrete" });
    P("WingWallW", [2, 16, 32], cf(-159, 8, 138), WALL, { Material: "Concrete" });
    P("WingWallE", [2, 16, 32], cf(-61, 8, 138), WALL, { Material: "Concrete" });
    P("WingWall", [2, 16, 32], cf(-127, 8, 138), WALL, { Material: "Concrete" });
    P("WingWall", [2, 16, 32], cf(-95, 8, 138), WALL, { Material: "Concrete" });
    P("WingRoof", [100, 2, 36], cf(-110, 17, 138), C(120, 125, 135), { Material: "Metal" });
    NE("WingStripe", [100.4, 0.6, 0.2], cf(-110, 14, 119.9), HAZ);
    [-142, -110, -78].forEach((x, i) => {
      part({ shape: "box", size: [4, 0.4, 4], at: [x, 15.7, 138], color: C(255, 250, 230), material: "neon", decor: true,
        light: i === 1 ? lightOf(C(255, 250, 230), 40, 1.6) : undefined });
    });
    const inRoom = (x0, x1) => {
      const p = z.player.pos();
      return p[0] >= x0 && p[0] <= x1 && p[2] >= 122 && p[2] <= 154 && p[1] < 16;
    };
    const exitButton = (x, zz, x0, x1) => {
      const b = P("ExitButton", [2, 2, 0.4], cf(x, 3, zz, -90), C(60, 200, 90), { Material: "Neon" });
      button(b, "EXIT the Secure Wing", () => { if (inRoom(x0, x1)) warp(-143, 0, 113, 0); });
    };
    // outside: door A
    D("FakeDoor", [6, 10, 0.3], cf(-143, 5, 119.8), C(90, 95, 110), { Material: "DiamondPlate" });
    sign("SECURE WING\nAUTHORISED CATS ONLY\nDoor code: the YEAR this lab was founded.", -143, 12.5, 119.7, "N", 12, 3, { color: HAZ });
    const padA = P("KeypadA", [2, 2.5, 0.4], cf(-138.5, 4, 119.7), C(255, 200, 40), { Material: "Neon" });
    keypad(padA, "doorA", { title: "SECURE WING - DOOR A", hint: "The founding year", kind: "digits", max: 4 }, "1984", () => {
      good("Door A open. Room 1: the specimen room.");
      warp(-154, 0, 138, -90);
    }, 10);
    sign("FOUNDATION STONE\nMOUNT HAIRBALL LABORATORIES\nEST. 1984\n\"Science, but make it cats\"", -110, 2.5, 156.4, "S", 9, 4, { bg: C(150, 145, 140), color: C(40, 35, 30) });
    // room 1: specimen jars
    const TABLE = C(120, 125, 135);
    P("Counter", [26, 2, 4], cf(-143, 1, 124.5), TABLE, { Material: "Metal" });
    const JARS = [[-152, C(255, 50, 50), 3], [-146, C(50, 220, 80), 1], [-140, C(60, 120, 255), 4], [-134, C(255, 220, 40), 2]];
    for (const j of JARS) {
      part({ shape: "cylinder", size: [3, 5, 3], at: [j[0], 4.5, 124.5], color: C(200, 240, 255), material: "glass", transparency: 0.6 });
      part({ shape: "cylinder", size: [3.2, 0.6, 3.2], at: [j[0], 7.3, 124.5], color: j[1], material: "neon", decor: true, dynamic: true });
      for (let e = 1; e <= j[2]; e++) {
        const y = 2.6 + e * 1.0;
        const ex = j[0] + (e % 2 === 0 ? 0.5 : -0.5);
        part({ shape: "sphere", size: [0.9, 0.9, 0.9], at: [ex, y, 124.5], color: C(250, 250, 250), decor: true });
        part({ shape: "sphere", size: [0.4, 0.4, 0.4], at: [ex, y, 124.95], color: C(20, 20, 20), decor: true });
      }
    }
    for (const s of [[-150, C(60, 120, 255)], [-144, C(255, 220, 40)], [-138, C(255, 50, 50)], [-132, C(50, 220, 80)]]) {
      NE("FloorStripe", [2, 0.1, 24], cf(s[0], 0.06, 141), s[1]);
    }
    sign("DOOR B: count the eyeballs in each jar.\nWrite the counts in the order of the coloured FLOOR STRIPES,\nwalking from the entrance towards Door B.", -143, 7, 153.7, "N", 18, 4, { bg: C(245, 245, 245), color: C(20, 20, 60) });
    const padB = P("KeypadB", [0.4, 2.5, 2], cf(-128.2, 4, 140), C(255, 200, 40), { Material: "Neon" });
    D("DoorB", [0.3, 10, 6], cf(-128.15, 5, 145), C(90, 95, 110), { Material: "DiamondPlate" });
    keypad(padB, "doorB", { title: "DOOR B", hint: "4 eyeball counts", kind: "digits", max: 4 }, "4231", () => {
      good("Door B open. Room 2: chemistry.");
      warp(-122, 0, 138, -90);
    }, 10, () => inRoom(-158, -128));
    exitButton(-157.8, 130, -158, -128);
    // room 2: chemistry
    P("ChemTable", [20, 3, 4], cf(-114, 1.5, 125), TABLE, { Material: "Metal" });
    for (const b of [[-120, C(255, 90, 90)], [-114, C(90, 255, 140)], [-108, C(140, 160, 255)]]) {
      part({ shape: "cylinder", size: [1.6, 3, 1.6], at: [b[0], 4.5, 125], color: b[1], material: "glass", transparency: 0.3 });
    }
    const abc = part({ shape: "box", size: [18, 3.4, 0.2], at: [-114, 8, 125.3], color: C(250, 250, 250), decor: true });
    label(abc, "A = 13          B = 8          C = 7\nDOOR C CODE = (A + B) x C - D", { face: "back", color: C(80, 20, 20), bg: C(250, 250, 250) });
    P("TallCabinet", [5, 12, 3], cf(-100, 6, 151), WOOD, { Material: "Wood" });
    part({ shape: "cylinder", size: [1.6, 3, 1.6], at: [-100, 13.5, 151], color: C(255, 200, 60), material: "glass", transparency: 0.3 });
    sign("D = 19", -100, 13.5, 149.3, "N", 2.6, 1.2, { bg: C(250, 250, 250), color: C(20, 20, 20) });
    const padC = P("KeypadC", [0.4, 2.5, 2], cf(-96.2, 4, 140), C(255, 200, 40), { Material: "Neon" });
    D("DoorC", [0.3, 10, 6], cf(-96.15, 5, 145), C(90, 95, 110), { Material: "DiamondPlate" });
    keypad(padC, "doorC", { title: "DOOR C", hint: "(A + B) x C - D", kind: "digits", max: 4 }, "128", () => {
      good("Door C open. Something is in here...");
      z.reveal(53);
      warp(-90, 0, 138, -90);
    }, 10, () => inRoom(-126, -96));
    exitButton(-125.8, 128, -126, -96);
    // room 3: the cat
    // hidden until Door C opens: a cat tap has no wall occlusion (32 studs), and room 3 is only 12 studs
    // from the open ground east of the wing
    z.cat(53, cf(-72, 0, 138, 90), { hidden: true });
    for (let k = 1; k <= 8; k++) {
      NE("Confetti", [0.6, 0.1, 0.6], mul(cf(-88 + k * 2.6, 0.06, 130 + (k % 3) * 6), K.angles(0, k, 0)), [C(255, 90, 160), C(90, 220, 255), C(255, 230, 60)][k % 3]);
    }
    exitButton(-93.8, 128, -94, -62);
  }

  // ------------------------------------------------------------------------------------- I. Security Corridor (50)
  {
    const X0 = -38; // corridor interior x -38..-26
    const XC = -32;
    const WALL = C(60, 64, 76);
    P("CorridorWall", [2, 14, 128], cf(-39, 7, 110), WALL, { Material: "Metal" });
    P("CorridorWall", [2, 14, 128], cf(-25, 7, 110), WALL, { Material: "Metal" });
    P("CorridorWall", [16, 14, 2], cf(-32, 7, 173), WALL, { Material: "Metal" });
    P("CorridorWall", [5, 14, 2], cf(-37.5, 7, 47), WALL, { Material: "Metal" });
    P("CorridorWall", [5, 14, 2], cf(-26.5, 7, 47), WALL, { Material: "Metal" });
    P("CorridorWall", [6, 5, 2], cf(-32, 11.5, 47), WALL, { Material: "Metal" });
    P("CorridorRoof", [16, 1, 128], cf(-32, 14.5, 110), C(40, 44, 52), { Material: "Metal" });
    NE("CorridorTrim", [16.2, 0.6, 0.3], cf(-32, 13.5, 45.9), RED);
    for (let zz = 55; zz <= 165; zz += 22) {
      part({ shape: "box", size: [3, 0.3, 3], at: [XC, 13.8, zz], color: C(255, 220, 220), material: "neon", decor: true,
        light: zz === 99 ? lightOf(C(255, 120, 120), 40, 1.6) : undefined });
    }
    sign("SECURITY CORRIDOR\nLasers = back to the start (or the checkpoint).\nJump the low beams. Wait for the dim ones.\nThe floor heats up row by row: move when it flashes yellow.", -32, 4, 38.5, "N", 12, 5, { collide: true, color: C(255, 120, 120) });
    sign("ELEMENT NOTE #3\n\n8", -44, 3, 44, "N", 3.5, 3.5, { collide: true, bg: NOTE, color: NOTE_INK });
    const back = () => (z.flag("lcp") ? [XC, 0, 111, 180] : [XC, 0, 51, 180]);
    const laser = (size, x, y, zz, dyn) => hazard(part({ shape: "box", size, at: [x, y, zz], color: RED, material: "neon", transparency: 0.1, decor: true, dynamic: !!dyn }), back);
    // S1: three low beams
    for (const zz of [57, 61, 65]) laser([12, 0.3, 0.3], XC, 1.0, zz);
    // S2: blinking laser curtains
    blinker(laser([12, 12, 0.3], XC, 6, 74, true), 3, 1.5, 0, 0.25, 0.9);
    blinker(laser([12, 12, 0.3], XC, 6, 82, true), 3, 1.5, 1.5, 0.25, 0.9);
    // S3: sweeping low beam
    const sweep = laser([12, 0.4, 0.4], XC, 1.2, 100, true).p;
    movers.push((t) => sweep.moveTo([XC, 1.2, 100 + 7 * Math.sin((t * 2 * Math.PI) / 3.5)]));
    // checkpoint before the hot floor
    const cp = NE("Checkpoint", [10, 0.3, 3], cf(XC, 0.15, 111), GREEN, { Transparency: 0.2 });
    z.touch(cp, () => {
      if (!z.flag("lcp")) { z.flag("lcp", true); good("Corridor checkpoint!"); }
    });
    // S4: hot floor rows
    const COLD = C(50, 50, 58);
    const rows = [];
    for (let row = 1; row <= 6; row++) {
      rows[row] = [];
      for (let col = 1; col <= 3; col++) {
        const t = part({ shape: "box", size: [3.9, 0.3, 3.9], at: [X0 + 2 + (col - 1) * 4, 0.15, 112 + row * 4], color: COLD, material: "neon", dynamic: true });
        const hz = hazard(t, back, null, 0.2);
        hz.hot = false;
        rows[row][col] = { t, hz };
      }
    }
    let lastPhase = 0;
    movers.push((t) => {
      const m = t % 5.2;
      const phase = m < 2 ? 1 : m < 2.6 ? 2 : m < 4.6 ? 3 : 4; // 1 odd hot, 2 warning, 3 even hot, 4 warning
      if (phase === lastPhase) return;
      lastPhase = phase;
      for (let row = 1; row <= 6; row++) {
        const hot = (phase === 1 && row % 2 === 1) || (phase === 3 && row % 2 === 0);
        const warn = (phase === 2 && row % 2 === 0) || (phase === 4 && row % 2 === 1);
        for (let col = 1; col <= 3; col++) {
          const c = rows[row][col];
          c.hz.hot = hot;
          c.t.setColor(hot ? RED : warn ? HAZ : COLD);
        }
      }
    });
    // S5: laser slalom
    laser([7, 12, 0.3], -34.5, 6, 146);
    laser([7, 12, 0.3], -29.5, 6, 152);
    laser([7, 12, 0.3], -34.5, 6, 158);
    // end room
    // hidden until you reach the end room (taps ignore walls: it would be tappable from outside the corridor)
    z.cat(50, cf(XC, 0, 167, 0), { hidden: true });
    reveals.push([50, (p) => p[0] > -38 && p[0] < -26 && p[2] > 160 && p[1] < 14]);
    const cexit = P("ExitButton", [2, 2, 0.4], cf(XC + 4, 3, 171.8), C(60, 200, 90), { Material: "Neon" });
    button(cexit, "EXIT the corridor", () => {
      const p = z.player.pos();
      if (p[2] > 160 && p[0] > -39 && p[0] < -25) warp(XC, 0, 42, 180);
    });
  }

  // ------------------------------------------------------------------------------------- J. Conveyor factory (44)
  {
    const WALL = C(120, 110, 100);
    P("FactoryWall", [6, 30, 2], cf(23, 15, 61), WALL, { Material: "CorrodedMetal" });
    P("FactoryWall", [56, 30, 2], cf(62, 15, 61), WALL, { Material: "CorrodedMetal" });
    P("FactoryWall", [8, 18, 2], cf(30, 21, 61), WALL, { Material: "CorrodedMetal" });
    P("FactoryWall", [70, 30, 2], cf(55, 15, 189), WALL, { Material: "CorrodedMetal" });
    P("FactoryWall", [2, 30, 126], cf(21, 15, 125), WALL, { Material: "CorrodedMetal" });
    P("FactoryWall", [2, 30, 126], cf(89, 15, 125), WALL, { Material: "CorrodedMetal" });
    NE("FactoryStripe", [70.4, 1, 0.3], cf(55, 28, 59.9), HAZ);
    sign("CONVEYOR FACTORY\nThe belts run BACKWARDS. Run against them! The floor is molten slag.\nCrushers crush. Bartholomew is at the very end.", 62, 22, 59.8, "N", 30, 7, { color: HAZ, material: "metal" });
    for (let k = 0; k <= 3; k++) cyl("Chimney", 12, 4, cf(30 + k * 16, 36, 186), C(90, 85, 80), { Material: "Brick" });
    sign("ELEMENT NOTE #2\n\n1", 45, 4, 59.6, "N", 3.5, 3.5, { bg: NOTE, color: NOTE_INK });
    P("Landing", [66, 0.3, 12], cf(55, 0.15, 68), STEEL, { Material: "DiamondPlate" });
    const back = fixedBack(30, 0.3, 67, 180);
    const slag = P("Slag", [66, 0.6, 114], cf(55, 0, 131), C(255, 110, 30), { Material: "Neon", light: lightOf(LAVA, 40, 1.5) });
    hazard(slag, back, null, 0);
    sign("DIARY PAGE 3/4\n\"Right after lunch it napped for\n2 hours and 45 minutes. Must be nice.\"", 75, 5, 62.4, "S", 10, 4, { bg: PAPER, color: INK });
    const BELT = C(30, 30, 34);
    const belt = (size, x, y, zz, dir, speed) => part({ shape: "box", size, at: [x, y, zz], color: BELT, behaviors: [{ type: "conveyor", direction: dir, speed }] });
    P("BeltStep", [6, 2, 2], cf(30, 1, 75), STEEL, { Material: "Metal" });
    belt([6, 1, 36], 30, 3.5, 94, [0, 0, -1], 10);
    P("BeltPlatform", [6, 1, 6], cf(30, 6, 117), STEEL, { Material: "DiamondPlate" });
    belt([30, 1, 4], 49, 7.5, 117, [-1, 0, 0], 9);
    P("BeltPlatform", [5, 1, 5], cf(67.5, 10, 117), STEEL, { Material: "DiamondPlate" });
    belt([4, 1, 30], 68, 12.5, 137, [0, 0, -1], 10);
    P("BeltPlatform", [4, 1, 4], cf(68, 15, 156), STEEL, { Material: "DiamondPlate" });
    NE("BeltEdge", [0.3, 0.2, 36], cf(26.9, 4.1, 94), HAZ);
    NE("BeltEdge", [0.3, 0.2, 36], cf(33.1, 4.1, 94), HAZ);
    NE("BeltEdge", [30, 0.2, 0.3], cf(49, 8.1, 114.9), HAZ);
    NE("BeltEdge", [30, 0.2, 0.3], cf(49, 8.1, 119.1), HAZ);
    NE("BeltEdge", [0.3, 0.2, 30], cf(65.9, 13.1, 137), HAZ);
    NE("BeltEdge", [0.3, 0.2, 30], cf(70.1, 13.1, 137), HAZ);
    for (const pt of [[30, 84, 3], [30, 104, 3], [40, 117, 7], [58, 117, 7], [68, 128, 12], [68, 146, 12]]) {
      D("Pillar", [1.5, pt[2], 1.5], cf(pt[0], pt[2] / 2, pt[1]), STEEL, { Material: "Metal" });
    }
    // crushers over belt 2 (up = safe a bit over half of each 4 s cycle; the two alternate)
    [42, 55].forEach((x, k) => {
      const head = part({ shape: "box", size: [4, 3, 4.6], at: [x, 16, 117], color: C(200, 60, 40), material: "metal", dynamic: true });
      const rodP = part({ shape: "box", size: [1, 12, 1], at: [x, 23.5, 117], color: METAL, material: "metal", decor: true, dynamic: true });
      hazard(head, back);
      const ph = k * 2;
      movers.push((t) => {
        const y = 15.5 + 5.5 * Math.sin(((t + ph) * 2 * Math.PI) / 4);
        head.moveTo([x, y, 117]);
        rodP.moveTo([x, y + 7.5, 117]);
      });
      P("CrusherFrame", [1, 1, 8], cf(x, 29.5, 117), STEEL, { Material: "Metal" });
    });
    // gear platforms to the end
    const GEAR = C(200, 170, 60);
    for (const g of [[60, 17, 162, 4], [52, 19, 168, 3.5], [44, 21, 174, 3]]) {
      part({ shape: "cylinder", size: [g[3], 1, g[3]], at: [g[0], g[1], g[2]], color: GEAR, material: "metal" });
      part({ shape: "sphere", size: [1.2, 1.2, 1.2], at: [g[0], g[1] + 0.5, g[2]], color: C(255, 120, 40), material: "neon", decor: true });
    }
    P("EndPlatform", [10, 1, 10], cf(32, 22, 178), STEEL, { Material: "DiamondPlate" });
    NE("EndGlow", [10.2, 0.2, 10.2], cf(32, 21.4, 178), HAZ);
    // hidden until you are up on belt 3 or beyond (taps ignore walls: tappable from behind the south wall)
    z.cat(44, cf(32, 22.5, 179, 0), { hidden: true });
    reveals.push([44, (p) => p[0] > 22 && p[0] < 88 && p[2] > 120 && p[2] < 188 && p[1] > 12.4]);
    // fuel canister B shelf: the original truss is now three floating steps from the platform after belt 2
    P("ShelfStep", [2.5, 1, 2.5], cf(72.5, 14, 112), STEEL, { Material: "DiamondPlate" });
    P("ShelfStep", [2.5, 1, 2.5], cf(71, 18, 107.5), STEEL, { Material: "DiamondPlate" });
    P("ShelfStep", [2.5, 1, 2.5], cf(75, 21.5, 106.5), STEEL, { Material: "DiamondPlate" });
    P("HighShelf", [15, 1, 10], cf(80.5, 24, 117), WOOD, { Material: "WoodPlanks" });
    fuseSpots.CAN_B = [84, 24.5, 117];
  }

  // ------------------------------------------------------------------------------------- K. Prism Lab (55)
  {
    const GX = 140, GZ = 40, CS = 6;
    const cellPos = (c, r) => [GX + (c - 0.5) * CS, GZ + (r - 0.5) * CS];
    P("LabFloor", [58, 0.3, 50], cf(160, 0.15, 58), C(36, 38, 48), { Material: "SmoothPlastic" });
    for (let i = 0; i <= 6; i++) {
      NE("GridLine", [0.15, 0.32, 36], cf(GX + i * CS, 0.17, GZ + 18), C(60, 160, 255), { Transparency: 0.4 });
      NE("GridLine", [36, 0.32, 0.15], cf(GX + 18, 0.17, GZ + i * CS), C(60, 160, 255), { Transparency: 0.4 });
    }
    const cells = {};
    for (const w of [[4, 3], [6, 2], [3, 4], [6, 5]]) {
      const [x, zz] = cellPos(w[0], w[1]);
      P("Blocker", [4.5, 5, 4.5], cf(x, 2.5, zz), C(70, 72, 84), { Material: "DiamondPlate" });
      cells[w[0] + "," + w[1]] = "W";
    }
    for (const f of [[3, 5, "R", C(255, 40, 40)], [5, 3, "B", C(40, 100, 255)]]) {
      const [x, zz] = cellPos(f[0], f[1]);
      part({ shape: "box", size: [4, 5, 4], at: [x, 2.5, zz], color: f[3], material: "glass", transparency: 0.45 });
      cells[f[0] + "," + f[1]] = f[2];
    }
    const MIR = [[2, 2], [2, 5], [5, 5], [5, 2], [2, 1], [4, 4], [3, 3]];
    const mirrorAt = {};
    const plates = [];
    const plateCF = (i, s) => {
      const [x, zz] = cellPos(MIR[i][0], MIR[i][1]);
      if (s === 0) return cf(x, 3, zz, 45);
      if (s === 1) return cf(x, 3, zz, -45);
      return cf(x, -0.4, zz, 0);
    };
    let segs = [];
    const emX = GX - 3, emZ = cellPos(1, 2)[1];
    const emitterPart = P("Laser", [3, 3, 3], cf(emX, 2, emZ), STEEL, { Material: "Metal" });
    NE("Lens", [0.4, 1.2, 1.2], cf(emX + 1.6, 3, emZ), RED);
    const recX = GX + 6 * CS + 3, recZ = cellPos(6, 1)[1];
    P("Receiver", [2.5, 5, 3], cf(recX, 2.5, recZ), C(60, 60, 70), { Material: "Metal" });
    const recEye = part({ shape: "box", size: [0.3, 2, 2], at: [recX - 1.3, 3, recZ], color: C(160, 60, 255), material: "neon", transparency: 0.3, decor: true, dynamic: true });
    const trace = (st) => {
      let c = 0, r = 2, dx = 1, dz = 0;
      let red = false, blue = false;
      const pts = [[emX + 1.5, emZ, "W"]];
      const colour = () => (red && blue ? "P" : red ? "R" : blue ? "B" : "W");
      for (let n = 0; n < 60; n++) {
        c += dx; r += dz;
        const [x, zz] = cellPos(c, r);
        if (c < 1 || c > 6 || r < 1 || r > 6) {
          const hit = c === 7 && r === 1 && red && blue;
          let ex = x - (dx * CS) / 2;
          const ez = zz - (dz * CS) / 2;
          if (c === 7 && r === 1) ex = recX - 1.3;
          pts.push([ex, ez, colour()]);
          return [pts, hit];
        }
        const k = c + "," + r;
        const cell = cells[k];
        if (cell === "W") { pts.push([x - dx * 2.3, zz - dz * 2.3, colour()]); return [pts, false]; }
        if (cell === "R") { pts.push([x - dx * 2, zz - dz * 2, colour()]); red = true; }
        else if (cell === "B") { pts.push([x - dx * 2, zz - dz * 2, colour()]); blue = true; }
        const mi = mirrorAt[k];
        if (mi !== undefined) {
          const s = st[mi];
          let turned = false;
          if (s === 0) { [dx, dz] = [-dz, -dx]; turned = true; }
          else if (s === 1) { [dx, dz] = [dz, dx]; turned = true; }
          if (turned) pts.push([x, zz, colour()]);
        }
      }
      return [pts, false];
    };
    const BC = { W: C(255, 255, 255), R: C(255, 40, 40), B: C(50, 110, 255), P: C(190, 60, 255) };
    const render = (st) => {
      plates.forEach((plate, i) => { plate.moveTo(plateCF(i, st[i])); plate.setTransparency(st[i] === 2 ? 0.5 : 0); });
      let pts = [], hit = false;
      if (z.flag("pow")) [pts, hit] = trace(st);
      for (const s of segs) s.remove();
      segs = [];
      for (let i = 0; i + 1 < pts.length && i < 20; i++) {
        const a = pts[i], b = pts[i + 1];
        const p0 = z.pos(a[0], 3, a[1]), p1 = z.pos(b[0], 3, b[1]);
        const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
        if (len <= 0.05) continue;
        const mid = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2];
        segs.push(part({ shape: "box", size: [0.35, 0.35, len], cf: K.lookAt(mid, p1), color: BC[b[2]], material: "neon", transparency: 0.1, decor: true, keep: true }));
      }
      recEye.setColor(hit ? GREEN : C(160, 60, 255));
      return hit;
    };
    const stateOf = () => {
      let st = z.flag("mir");
      if (!st) { st = MIR.map(() => 2); z.flag("mir", st); }
      return st;
    };
    const check = (st) => {
      const hit = render(st);
      if (hit && !z.isUnlocked(55)) {
        z.unlock(55);
        good("PURPLE LIGHT RECEIVED! Prismo's cage is open!");
        cheer();
      }
    };
    MIR.forEach((m, i) => {
      const [x, zz] = cellPos(m[0], m[1]);
      mirrorAt[m[0] + "," + m[1]] = i;
      part({ shape: "cylinder", size: [3, 1, 3], at: [x, 0.5, zz], color: STEEL, material: "metal" });
      const plate = part({ shape: "box", size: [4.4, 4, 0.4], cf: plateCF(i, 2), color: C(220, 240, 255), material: "glass", transparency: 0.5, dynamic: true });
      plates[i] = plate;
      z.click(plate, () => {
        const st = stateOf();
        st[i] = (st[i] + 1) % 3;
        z.tone(1 + st[i] * 0.2, { volume: 0.4 });
        check(st);
      });
    });
    button(emitterPart, "Switch the laser", () => {
      if (!z.flag("pkey")) { z.fail("NO POWER. The laser's POWER KEY is missing (try the lava tube by the volcano)."); return; }
      z.flag("pow", !z.flag("pow"));
      good(z.flag("pow") ? "Laser ON!" : "Laser off.");
      check(stateOf());
    });
    sign("PRISM LAB\n1) Find the laser's POWER KEY (lava tube by the volcano), then tap the laser.\n2) Tap mirrors to turn them:  /  then  \\  then down.\n" +
      "3) The RECEIVER (east of row 1) only accepts PURPLE light:\nthe beam must pass through the RED glass AND the BLUE glass.\n(Columns 1-6 west to east, rows 1-6 north to south.)",
    140, 5, 35, "N", 16, 6, { collide: true });
    P("CatPedestal", [6, 1, 6], cf(184, 0.8, 64), STEEL, { Material: "DiamondPlate" });
    z.cat(55, cf(184, 1.3, 64, 90), { locked: true });
    // watchtower (BLUE fuse on top) + diary page 4; the original truss is now floating steps on the west side
    P("Watchtower", [6, 12, 6], cf(184, 6, 90), C(70, 72, 84), { Material: "Metal" });
    P("TowerStep", [2.5, 1, 2.5], cf(177, 3.5, 95), STEEL, { Material: "DiamondPlate" });
    P("TowerStep", [2.5, 1, 2.5], cf(177.5, 7.5, 90.5), STEEL, { Material: "DiamondPlate" });
    NE("TowerLight", [6.2, 0.4, 6.2], cf(184, 11.9, 90), CYAN);
    sign("DIARY PAGE 4/4\n\"It vanished exactly 20 minutes after\nwaking up. SEND ME BACK TO THAT MOMENT!\"", 184, 5, 86.8, "N", 5.8, 4, { bg: PAPER, color: INK });
  }

  // ------------------------------------------------------------------------------------- L. rocket pad, gantry (48), mission control, launch (57)
  const RX = 160, RZ = 155;
  part({ shape: "cylinder", size: [36, 1, 36], at: [RX, 0, RZ], color: C(90, 92, 100), material: "concrete" });
  part({ shape: "cylinder", size: [37, 0.2, 37], at: [RX, 0.05, RZ], color: HAZ, material: "neon", decor: true });
  const rocket = [];
  const rp = (h) => { rocket.push({ h, base: h.cf.clone() }); return h; };
  const RD = { dynamic: true };
  const RW = C(245, 245, 250);
  rp(rpart({ Size: [50, 10, 10], CFrame: mul(cf(RX, 31, RZ), K.angles(0, 0, Math.PI / 2)), Color: RW, Shape: "Cylinder", ...RD }));
  rp(rpart({ Size: [2, 10.4, 10.4], CFrame: mul(cf(RX, 48, RZ), K.angles(0, 0, Math.PI / 2)), Color: RED, Shape: "Cylinder", ...RD }));
  rp(part({ shape: "sphere", size: [10, 10, 10], at: [RX, 56, RZ], color: RED, ...RD }));
  rp(part({ shape: "cone", size: [6.5, 6, 6.5], at: [RX, 62, RZ], color: RED, ...RD }));
  rp(part({ shape: "sphere", size: [3, 3, 3], at: [RX, 44, RZ - 4.6], color: C(120, 220, 255), material: "neon", decor: true, ...RD }));
  rp(part({ shape: "cylinder", size: [7, 5.5, 7], at: [RX, 3.25, RZ], color: C(60, 60, 66), material: "metal", ...RD }));
  const FINS = [["E", 8, 0, 0, "7", RED], ["S", 0, 8, 90, "3", RW], ["W", -8, 0, 0, "9", RW], ["N", 0, -8, 90, "1", RW]];
  for (const f of FINS) {
    const fin = rp(part({ shape: "box", size: [6, 12, 0.8], cf: cf(RX + f[1], 6.5, RZ + f[2], f[3]), color: f[5], ...RD }));
    label(fin, f[4], { both: true, color: f[5] === RED ? WHITE : C(200, 20, 20), stroke: f[5] === RED });
  }
  const flame = rp(part({ shape: "sphere", size: [6, 6, 6], at: [RX, -1, RZ], color: LAVA2, material: "neon", transparency: 1, decor: true, ...RD }));
  let launchT = null;
  const launch = () => {
    if (launchT != null) return;
    launchT = z.time();
    flame.setTransparency(0.1);
    z.sound("impact_explosion_03.mp3", { volume: 1 });
  };
  movers.push((t) => {
    if (launchT == null) return;
    const e = t - launchT;
    if (e > 20) {
      launchT = null;
      for (const r of rocket) r.h.moveTo(r.base);
      flame.setTransparency(1);
      return;
    }
    const h = e > 1.5 ? Math.min(215, 2.4 * (e - 1.5) * (e - 1.5)) : 0;
    const shake = e < 1.5 ? Math.sin(e * 60) * 0.15 : 0;
    for (const r of rocket) {
      const m = r.base.clone();
      m.elements[12] += shake;
      m.elements[13] += h;
      r.h.moveTo(m);
    }
  });
  // gantry (48): the original's three truss climbs are now floating steps
  {
    const GX0 = 132, GZ0 = 155;
    const ORANGE = C(200, 80, 40);
    P("GantryCore", [3, 84.5, 3], cf(GX0, 42.25, GZ0), ORANGE, { Material: "Metal" });
    for (let y = 10; y <= 80; y += 14) NE("GantryLight", [3.2, 0.5, 3.2], cf(GX0, y, GZ0), HAZ);
    const HOP = C(220, 220, 225);
    const hop = (x, top, zz, s) => P("GantryHop", [s, 1, s], cf(x, top - 0.5, zz), HOP, { Material: "DiamondPlate" });
    const step = (x, top, zz) => P("GantryStep", [2, 1, 2], cf(x, top - 0.5, zz), ORANGE, { Material: "DiamondPlate" });
    step(124, 4, 160);
    step(122.5, 8, 156);
    step(124.5, 12, 152);
    hop(129, 16.5, 155, 3);
    hop(132, 20, 150.5, 2);
    hop(137, 23.5, 151, 2);
    hop(139, 27, 156, 2);
    hop(136, 30.5, 160.5, 2);
    hop(131, 34, 161, 3);
    step(127, 38.2, 162.5);
    step(124, 42.3, 159.5);
    step(124.5, 46.4, 155);
    hop(128, 50.5, 157.5, 3);
    moving("GantryHop", [3, 1, 3], cf(128.5, 53.5, 151.5), HOP, [6, 0, 0], 4, "metal");
    moving("GantryHop", [3, 1, 3], cf(134.5, 57, 147.5), HOP, [0, 0, -4], 3.5, "metal");
    hop(139.5, 61, 152, 1.6);
    hop(139, 64.5, 158, 1.6);
    hop(135, 68, 161, 1.6);
    hop(130.5, 71.5, 160, 1.6);
    hop(127, 75, 156, 1.6);
    step(124, 79, 153);
    step(125, 82.5, 149);
    P("GantryTop", [10, 1, 10], cf(GX0, 85, GZ0), ORANGE, { Material: "DiamondPlate" });
    NE("GantryTopGlow", [10.2, 0.3, 10.2], cf(GX0, 84.4, GZ0), HAZ);
    D("GantryArm", [14, 1, 1.5], cf(GX0 + 12, 82, GZ0), ORANGE, { Material: "Metal" });
    // hidden until the last steps (taps ignore the deck: it would be tappable from the hops below it)
    z.cat(48, cf(GX0 + 1, 85.5, GZ0 + 1, -90), { hidden: true });
    reveals.push([48, (p) => p[1] > 77 && Math.hypot(p[0] - GX0, p[2] - GZ0) < 14]);
  }
  // mission control
  {
    const mx = 178, mz = 118;
    P("MissionControl", [14, 8, 10], cf(mx, 4, mz), C(220, 225, 235), { Material: "Metal" });
    P("MCRoof", [15, 1, 11], cf(mx, 8.5, mz), STEEL, { Material: "Metal" });
    const dish = part({ shape: "cylinder", size: [6, 0.6, 6], cf: mul(cf(mx + 3, 11, mz), K.angles(0, 0, 0.6)), color: C(240, 240, 245), material: "metal", decor: true, dynamic: true });
    z.tag(dish, "Spin", { axis: "y", speed: 20 });
    sign("DIARY PAGE 2/4\n\"The cat ate lunch exactly 4 hours and\n30 minutes after my breakfast.\"", mx, 4.5, mz + 5.3, "S", 10, 4, { bg: PAPER, color: INK });
    sign("ELEMENT NOTE #4\n\n7", mx + 7.3, 3, mz, "E", 3.5, 3.5, { bg: NOTE, color: NOTE_INK });
    sign("LAUNCH CHECKLIST\n1) Load 3 FUEL CANISTERS at the fuel port (they were lost on the volcano, in the factory and at the lava lake).\n" +
      "2) LAUNCH CODE: the numbers on the rocket fins, read CLOCKWISE as seen from ABOVE, starting with the RED fin.\n" +
      "3) Board the green CREW LIFT by the rocket within 20 seconds.\n\n" +
      "STAR CHART - star colours from HOTTEST to COOLEST:\nBLUE > WHITE > YELLOW > ORANGE > RED",
    mx - 7.3, 5.6, mz, "W", 9.6, 4.6, { bg: C(10, 10, 40), color: C(200, 220, 255) });
    const consoleP = P("LaunchConsole", [1, 2, 4], cf(mx - 7.6, 2.6, mz), C(255, 60, 60), { Material: "Neon" });
    keypad(consoleP, "launch", { title: "LAUNCH CODE", hint: "4 fin numbers", kind: "digits", max: 4 }, "7391", () => {
      z.flag("armed", z.time());
      good("LAUNCH ARMED! Get on the green CREW LIFT within 20 seconds!");
      cheer();
    }, 15, () => {
      if (!z.flag("fueled")) { z.fail("The rocket has no fuel! Load 3 canisters at the fuel port first."); return false; }
      return true;
    });
  }
  // fuel canisters
  const CANS = ["CAN_A", "CAN_B", "CAN_C"];
  const canCount = () => CANS.filter((k) => z.flag(k)).length;
  CANS.forEach((key) => {
    const s = fuseSpots[key];
    const can = part({ shape: "cylinder", size: [1.4, 2, 1.4], at: [s[0], s[1] + 1, s[2]], color: C(60, 220, 90), material: "metal", collide: false, dynamic: true });
    const stripe = part({ shape: "cylinder", size: [1.5, 0.3, 1.5], at: [s[0], s[1] + 1, s[2]], color: HAZ, material: "neon", decor: true, dynamic: true });
    z.prompt(can, "Take fuel canister", () => {
      if (z.flag(key)) { z.notify("You already took this canister."); return; }
      z.flag(key, true);
      can.show(false);
      stripe.show(false);
      good(`Rocket fuel canister! (${canCount()}/3)`);
      z.tone(1.3);
    });
  });
  const port = P("FuelPort", [3, 3, 2], cf(RX, 2, RZ + 17), GREEN, { Material: "Neon" });
  NE("FuelPortLight", [1, 1, 0.3], cf(RX, 3, RZ + 15.9), HAZ);
  button(port, "Load fuel", () => {
    if (z.flag("fueled")) { z.notify("The rocket is fuelled. Go enter the LAUNCH CODE at Mission Control."); return; }
    const n = canCount();
    if (n < 3) { z.fail(`Not enough fuel: ${n}/3 canisters.`); return; }
    z.flag("fueled", true);
    good("Rocket FUELLED! Now the launch code at Mission Control.");
    z.sound("impact_water.mp3");
  });
  const lift = part({ shape: "box", size: [5, 0.4, 5], at: [RX - 12, 0.7, RZ + 14], color: GREEN, material: "neon", transparency: 0.1 });
  z.touch(lift, () => {
    const armed = z.flag("armed");
    if (armed == null || z.time() - armed > 20) {
      z.notify("CREW LIFT: launch not armed. (Fuel + launch code first, then you have 20 s.)");
      return;
    }
    z.flag("armed", null);
    launch();
    good("3... 2... 1... LIFTOFF!");
    later(2.5, () => {
      warp(40, 286, 112, 180);
      good("Welcome to orbit. Someone has been expecting you... (the green pad takes you back to Earth)");
    });
  });
  // orbital station (57)
  {
    const ox = 40, oy = 286, oz = 120;
    P("StationDeck", [30, 2, 30], cf(ox, oy - 1, oz), C(200, 205, 215), { Material: "DiamondPlate" });
    for (const w of [[0, -15, 30, 0.6], [0, 15, 30, 0.6], [-15, 0, 0.6, 30], [15, 0, 0.6, 30]]) {
      P("StationRail", [w[2], 3, w[3]], cf(ox + w[0], oy + 1.5, oz + w[1]), C(120, 125, 135), { Material: "Metal" });
      NE("StationGlow", [w[2] + 0.1, 0.3, w[3] + 0.1], cf(ox + w[0], oy + 3.1, oz + w[1]), CYAN);
    }
    part({ shape: "cylinder", size: [14, 6, 14], at: [ox, oy + 3, oz + 9], color: C(200, 205, 215), material: "metal", light: lightOf(CYAN, 30, 2) });
    part({ shape: "cylinder", size: [14.3, 3, 14.3], at: [ox, oy + 3, oz + 9], color: C(60, 120, 255), decor: true, dynamic: true });
    z.cat(57, cf(ox, oy, oz - 1, 0), {});
    const home = NE("ReturnPad", [5, 0.3, 5], cf(ox - 9, oy + 0.15, oz - 10), GREEN, { Transparency: 0.1 });
    z.touch(home, () => warp(RX + 5, 0.5, RZ - 30, 0));
  }
  // crates + orange fuse corner
  for (const c of [[183, 183, 0], [187, 182, 0.3], [183, 187.5, -0.2], [184.5, 184.5, 4]]) {
    const y = c[2] > 1 ? 6 : 2;
    P("Crate", [4, 4, 4], mul(cf(c[0], y, c[1]), K.angles(0, c[2] > 1 ? 0.4 : c[2], 0)), C(170, 120, 70), { Material: "WoodPlanks" });
  }

  // ------------------------------------------------------------------------------------- M. time machine (56) + time pocket
  {
    const tx = 160, tz = -160;
    part({ shape: "cylinder", size: [22, 0.6, 22], at: [tx, 0.3, tz], color: C(60, 60, 80), material: "metal" });
    for (let k = 0; k <= 13; k++) {
      const a = (k / 14) * Math.PI * 2;
      NE("TimeRing", [3.4, 1.2, 1.2], mul(cf(tx + Math.cos(a) * 7, 8 + Math.sin(a) * 7, tz), K.angles(0, 0, a + Math.PI / 2)), C(120, 255, 255));
    }
    const vortex = part({ shape: "cylinder", size: [12, 0.4, 12], cf: mul(cf(tx, 8, tz), K.angles(Math.PI / 2, 0, 0)), color: C(100, 60, 200), material: "neon", transparency: 0.5, decor: true,
      light: lightOf(C(150, 100, 255), 30, 2) });
    z.tag(vortex, "Spin", { axis: "y", speed: 40 });
    P("Console", [18, 6, 2], cf(tx, 3, tz - 13), C(70, 60, 50), { Material: "Metal" });
    sign("CHRONO-PORTAL 3000\nSet the dials to the EXACT moment Chrono-Whiskers vanished, then pull the lever.\n" +
      "Dial buttons, left to right: HOUR, MINUTE (+5), AM / PM.\nThe scientist's 4 DIARY PAGES are scattered around Mount Hairball.",
    tx, 9, tz - 13.6, "N", 18, 4, { color: C(150, 255, 255) });
    const DEF = { h: 12, m: 0, pm: false };
    const timeText = (st) => `${st.h}:${st.m < 10 ? "0" : ""}${st.m} ${st.pm ? "PM" : "AM"}`;
    const disp = part({ shape: "box", size: [9, 2.2, 0.5], at: [tx, 5.2, tz - 14.2], color: C(20, 30, 30) });
    const dispL = label(disp, timeText(DEF), { color: C(255, 120, 40) });
    const stateOf = () => {
      let st = z.flag("tm");
      if (!st) { st = copy(DEF); z.flag("tm", st); }
      return st;
    };
    const spec = [
      // facing the console from the north your LEFT is east (+x): HOUR leftmost, AM / PM rightmost
      [3.2, C(255, 90, 60), (st) => { st.h = (st.h % 12) + 1; }],
      [0, C(255, 200, 60), (st) => { st.m = (st.m + 5) % 60; }],
      [-3.2, C(90, 200, 255), (st) => { st.pm = !st.pm; }],
    ];
    spec.forEach((s, i) => {
      const d = part({ shape: "box", size: [2.6, 1.6, 0.5], at: [tx + s[0], 2.9, tz - 14.2], color: s[1], material: "neon" });
      z.click(d, () => {
        const st = stateOf();
        s[2](st);
        dispL.setText(timeText(st));
        z.tone(1 + (i + 1) * 0.1, { volume: 0.4 });
      });
    });
    const lever = P("Lever", [1, 4, 1], mul(cf(tx + 9.5, 4, tz - 14.4), K.angles(0.3, 0, 0)), RED, { Material: "Neon" });
    button(lever, "Pull the CHRONO lever", () => {
      const left = z.isLocked("time");
      if (left) { z.fail(`The Chrono-Portal is recharging: ${left} s.`); return; }
      const st = stateOf();
      if (st.h === 2 && st.m === 50 && st.pm) {
        good("WHOOOSH! 2:50 PM, a random Tuesday in the past...");
        z.sound("action_falling.ogg");
        warp(150, -100, -152, 0);
      } else {
        z.lockout(20, "time");
        z.fail(`ZAP! ${timeText(st)} is the wrong time. Recharging 20 s.`);
      }
    });
    // time pocket (underground, sealed)
    const px = 150, py = -100, pz = -160;
    P("PocketFloor", [30, 2, 30], cf(px, py - 1, pz), WOOD, { Material: "WoodPlanks" });
    const BRICK = C(180, 160, 120);
    P("PocketWall", [30, 14, 1], cf(px, py + 7, pz - 15.5), BRICK, { Material: "Brick" });
    P("PocketWall", [30, 14, 1], cf(px, py + 7, pz + 15.5), BRICK, { Material: "Brick" });
    P("PocketWall", [1, 14, 32], cf(px - 15.5, py + 7, pz), BRICK, { Material: "Brick" });
    P("PocketWall", [1, 14, 32], cf(px + 15.5, py + 7, pz), BRICK, { Material: "Brick" });
    P("PocketRoof", [32, 1, 32], cf(px, py + 14.5, pz), C(90, 70, 50), { Material: "WoodPlanks" });
    part({ shape: "sphere", size: [2, 1, 2], at: [px, py + 13.6, pz], color: C(255, 230, 160), material: "neon", decor: true, light: lightOf(C(255, 220, 160), 30, 2) });
    z.cat(56, cf(px, py, pz - 9, 0), {});
    const ret = P("ReturnButton", [3, 3, 0.5], cf(px, py + 3, pz + 14.8), C(120, 255, 255), { Material: "Neon" });
    button(ret, "BACK TO THE PRESENT", () => warp(tx, 0.6, tz - 20, 0));
    sign("ELEMENT NOTE #5\n\n19", 120, 3, -186.5, "S", 3.5, 3.5, { collide: true, bg: NOTE, color: NOTE_INK });
    D("NotePost", [0.5, 1.5, 0.5], cf(120, 0.75, -186.5), METAL);
  }

  // ------------------------------------------------------------------------------------- N. ambient decor
  const BOULDERS = [
    [-150, -30, 5], [-130, 30, 4], [-60, 20, 6], [-5, 55, 4], [10, -10, 5], [-95, -48, 4],
    [160, 0, 6], [185, 25, 4], [150, -100, 5], [150, -120, 4], [100, -165, 6], [-10, -165, 5],
    [-170, -120, 6], [-175, 70, 5], [-178, 140, 6], [-10, 140, 5], [0, 185, 4], [110, 190, 4],
    [60, 45, 3], [-180, -180, 7], [190, -190, 6], [40, -170, 4],
  ];
  BOULDERS.forEach((b, k) => {
    const i = k + 1;
    P("Boulder", [b[2] * 1.3, b[2], b[2]], mul(cf(b[0], b[2] * 0.4, b[1]), K.angles(0.2 * (i % 3), i * 0.7, 0.15 * (i % 2))), i % 2 === 0 ? ROCK2 : ROCK, { Material: SLATE });
  });
  const CRYSTALS = [[-120, 10], [-70, -70], [-5, -120], [160, -30], [190, -140], [-175, 100], [10, 130], [112, 70], [-150, -175]];
  const CRY = [LAVA, LAVA, LAVA];
  CRYSTALS.forEach((c, k) => {
    const i = k + 1;
    const col = CRY[i % 3];
    for (let j = 0; j <= 2; j++) {
      part({ shape: "diamond", size: [1.4, 3 + j, 1.4], cf: mul(cf(c[0] + j * 0.9 - 0.9, 1.4 + j * 0.4, c[1] + (j % 2) * 0.8), K.angles(0.25 * (j - 1), j, 0.3 * (j - 1))),
        color: col, material: "neon", transparency: 0.15, decor: true });
    }
  });
  const LAMPS = [[-150, 7], [-120, -7], [-90, 7], [-60, -7], [-30, 7], [-15, 28], [20, 36], [60, 36], [125, 36], [125, 80], [115, 120], [-46, -40], [-46, -130], [-34, -170], [30, -186], [90, -186], [145, -186], [-105, 38]];
  for (const l of LAMPS) {
    D("LampPost", [0.6, 9, 0.6], cf(l[0], 4.5, l[1]), C(40, 40, 46), { Material: "Metal" });
    part({ shape: "sphere", size: [1.4, 1.4, 1.4], at: [l[0], 9.4, l[1]], color: LAVA2, material: "neon", decor: true });
  }
  part({ shape: "cylinder", size: [2.5, 90, 2.5], cf: mul(cf(-45, 6, -10), K.angles(0, 0.85, 0), K.angles(Math.PI / 2, 0, 0)), color: METAL, material: "metal", decor: true });

  // ------------------------------------------------------------------------------------- O. the loop
  z.heartbeat(() => {
    const t = z.time();
    for (let i = timers.length - 1; i >= 0; i--) {
      if (timers[i].t <= t) { const f = timers[i].fn; timers.splice(i, 1); f(); }
    }
    for (const fn of movers) fn(t);
    for (const b of blinkers) {
      const on = (t + b.phase) % b.period < b.onTime;
      if (on !== b.state) {
        b.state = on;
        b.hz.hot = on;
        b.h.setTransparency(on ? b.onT : b.offT);
      }
    }
    const feet = z.player.pos();
    for (let i = reveals.length - 1; i >= 0; i--) {
      if (reveals[i][1](feet)) { z.reveal(reveals[i][0]); reveals.splice(i, 1); }
    }
    const wp = z.pos(feet[0], feet[1], feet[2]);
    const root = new THREE.Vector3(wp[0], wp[1] + 3, wp[2]);
    for (const hz of hazards) {
      if (hz.hot && hazardHit(hz, root)) { burn(hz); break; }
    }
  });
}
