/*
	Zone 2: CATFORD TOWN   OWNER: zone 2 agent        (cats 15-28: 15-23 Medium, 24-28 Hard)

	A cartoon town. Main Street runs west->east along z = 0 from the spawn, Cat Avenue runs north->south along
	x = 0. North-west: The Purrcolator cafe, Pawsome Pets, the Lost & Found kiosk, No. 12 Butterpaw Lane, and
	Rooftop Row. North-east: the town square + clock tower, the Cat Signal crossroads, the bus stop, the Fish
	Market, the hotel and the fire station. South-west: Whisker Park (pond + bridge, playground). South-east:
	road works, Meowy's Diner + Bin Alley, the open manhole and THE SEWERS (a 7x7 maze at y = -22).

	SOLUTIONS (every clue is in the world):
	15 Toaster Cat (Medium)     Walk into the yellow house "No. 12 Butterpaw Lane" (north of Main St, west of
	                            the avenue). He is on the kitchen counter at the back.
	16 Traffic Cone Cat (Med)   Road works lot south-east of the crossroads: hop crate (3) -> tall crate (6.5) ->
	                            scaffold deck (10). The cat is on the deck.
	17 Barista Cat (Medium)     Inside The Purrcolator cafe, walk round the east end of the counter; she stands
	                            between the counter and the back counter.
	18 Bus Cat (Medium)         Bus stop on the north side of Main St: bench (2) -> bin (5) -> shelter roof (8).
	19 Garbage Can Cat (Med)    Bin Alley between Meowy's Diner and the apartments. Click the bins; the one with
	                            green stink lines and a fish bone (4th from the street, east side) reveals him
	                            standing on its lid.
	20 Fish Stick Cat (Medium)  Fish Market, middle stall: he lies on the ice display behind the counter.
	21 Sandcastle Cat (Medium)  Whisker Park playground: climb the yellow steps (2 -> 4 -> 6) on the west side of
	                            the play tower (or walk up the slide); he is on the deck (8).
	22 Fishbowl Cat (Medium)    Pawsome Pets: the shelves along the back wall form a staircase (4 -> 8 -> 12);
	                            she is on the top shelf.
	23 Pool Floatie Cat (Med)   Whisker Park pond: walk onto the water and under the middle of the bridge.
	24 Sat. Dish Cat (Hard)     Rooftop Row (far north-west): climb the steps along the north wall of the pink
	                            house (2.5 -> 5 -> 7.5 -> north eave 10), walk up its roof, jump east: mint flat roof (18) ->
	                            roof crate (21) -> lavender ridge (22) -> chimney (25) -> peach flat roof (26) ->
	                            AC unit (29) -> blue roof (32) -> crate (35) -> tall crate (38) -> turret (40).
	                            Cat on the turret.
	25 Clock Cat (Hard)         Clock tower in the square: 13 stone ledges spiral up the outside (start on the
	                            south face, go anticlockwise seen from above, +4.5 studs each). From the last
	                            ledge hop onto the tower top; the cat is in the belfry under the bell.
	26 Traffic Light Cat (Hard) The Cat Signal (glowing cat head on the crossroads pole) flashes
	                            GREEN, RED, BLUE, YELLOW, then pauses. On the Cat Signal Control Box pull the
	                            levers in that order: GREEN, RED, BLUE, YELLOW (levers are R Y G B left->right).
	                            A wrong lever resets the sequence + 3 s lockout. Correct -> cage unlocks.
	27 Lost & Found Cat (Hard)  The kiosk note says the key is "with the biggest fish in town" = the giant fish
	                            sign on the Fish Market roof. Climb crate (4) -> tall crate (7.5) -> barrel (10)
	                            -> roof (13) on the market's east side, take the key from the fish's mouth
	                            (prompt). Then use the bell on the Lost & Found counter -> cage unlocks.
	28 Sewer Alligator (Hard)   Open manhole south of Bin Alley (cones + DANGER sign). Drop down the hole (or use
	                            the ladder prompt), jump the 3-stud green sludge strip (it sends you back to the
	                            ladder), enter the maze. Keep your LEFT hand on the wall (sign tip; it is a perfect
	                            maze) or follow this cell path (row,col; row 0 = north, col 0 = west; the entrance
	                            is row 3 on the west side):
	                            3,0 2,0 1,0 0,0 0,1 0,2 0,3 0,4 0,5 1,5 1,6 2,6 2,5 3,5 3,6 4,6 5,6 6,6 6,5 5,5
	                            5,4 4,4 4,3 5,3 5,2 6,2 6,1 6,0 5,0 4,0 4,1 3,1 3,2 2,2 2,1 1,1 1,2 1,3 2,3 2,4
	                            3,4 3,3 (centre). Gatorbert is in the centre cell. Dead ends hold cardboard
	                            "lol no" rats. The ladder at the bottom of the shaft takes you back up.

	PORT NOTES (OofWorld physics: gravity 196.2, jump 50 -> apex 6.37 studs, walk 16 -> ~8 studs of flat
	jump). Every climb above was checked against that: the largest rise is a clock-tower ledge (+4.5 over a
	2.2-stud gap) and the widest gap the chimney -> peach roof (6.75 studs, -1 rise, a 7.8-stud reach).
	The engine has no climbing, so the original's two truss ladders became steps (play tower, pink house)
	and the sewer ladder became a pair of "climb" prompts. Colours were folded into a small palette so
	the town stays inside the 60 static draw-call budget.
*/

// ============================================================================================ looks

// simple flat cat face on a surface. cf = centre of the face plane, the face looks towards cf's -Z.
function faceOn(K, m, cf, w, o = {}) {
  const e = w * 0.16;
  for (const s of [-1, 1]) {
    if (o.closed) {
      K.block(m, K.v(e * 1.3, e * 0.22, 0.08), K.mul(cf, K.cf(s * w * 0.22, w * 0.1, -0.02), K.rot(0, 0, s * -12)), o.pupil || K.C.black, { name: "Eye" });
    } else {
      K.ball(m, K.v(e * 1.4, e * 1.6, e * 0.6), K.mul(cf, K.cf(s * w * 0.22, w * 0.1, 0)), o.white || K.C.white, { name: "EyeWhite" });
      K.ball(m, K.v(e * 0.8, e * 1.0, e * 0.5), K.mul(cf, K.cf(s * w * 0.22 + (o.derp ? s * e * 0.25 : 0), w * 0.08, -e * 0.25)), o.pupil || K.C.black, { name: "Pupil" });
    }
  }
  K.ball(m, K.v(w * 0.11, w * 0.08, w * 0.08), K.mul(cf, K.cf(0, -w * 0.05, -0.02)), o.nose || K.C.pink, { name: "Nose" });
  if (o.mouthO) {
    K.ball(m, K.v(w * 0.12, w * 0.14, 0.08), K.mul(cf, K.cf(0, -w * 0.2, -0.01)), K.C.black, { name: "Mouth" });
  } else {
    const dir = o.frown ? -1 : 1;
    for (const s of [-1, 1]) {
      K.block(m, K.v(w * 0.14, w * 0.03, 0.06), K.mul(cf, K.cf(s * w * 0.06, -w * 0.15, -0.01), K.rot(0, 0, s * dir * 25)), K.C.black, { name: "Mouth" });
    }
  }
  if (o.whiskers !== false) {
    for (const s of [-1, 1]) {
      K.block(m, K.v(w * 0.34, 0.05, 0.05), K.mul(cf, K.cf(s * w * 0.4, -w * 0.09, -0.03), K.rot(0, 0, s * 8)), o.whisker || K.C.black, { name: "Whisker" });
    }
  }
}

// triangular cat ear standing on base cf (the ear faces cf's -Z). 2 prims (+2 with inner).
function ear(K, m, base, w, h, t, color, inner) {
  const tri = (cf, ww, hh, tt, c, nm) => {
    K.wedge(m, K.v(tt, hh, ww / 2), K.mul(cf, K.cf(ww / 4, hh / 2, 0), K.angles(0, -Math.PI / 2, 0)), c, { name: nm });
    K.wedge(m, K.v(tt, hh, ww / 2), K.mul(cf, K.cf(-ww / 4, hh / 2, 0), K.angles(0, Math.PI / 2, 0)), c, { name: nm });
  };
  tri(base, w, h, t, color, "Ear");
  if (inner) tri(K.mul(base, K.cf(0, 0.05, -t / 2 - 0.02)), w * 0.55, h * 0.65, 0.05, inner, "InnerEar");
}

function ears(K, m, x, y, zc, w, h, color, inner, tilt = 15) {
  for (const s of [-1, 1]) ear(K, m, K.mul(K.cf(x + s * w * 0.75, y, zc), K.rot(0, 0, -s * tilt)), w, h, w * 0.22, color, inner);
}

export const looks = {
  // 15 Sir Toastington Crumbsworth - Toaster Cat
  15: (K) => {
    const m = K.model("ToasterCat");
    const chrome = K.rgb(205, 210, 220);
    K.block(m, K.v(4, 3, 2.6), K.v(0, 2.1, 0), chrome, { name: "Body", material: "Metal" });
    K.cyl(m, 4, 0.7, K.mul(K.cf(0, 3.55, -0.95), K.rot(0, 0, 90)), chrome, { material: "Metal" });
    K.cyl(m, 4, 0.7, K.mul(K.cf(0, 3.55, 0.95), K.rot(0, 0, 90)), chrome, { material: "Metal" });
    K.block(m, K.v(3.4, 0.4, 2.2), K.v(0, 3.7, 0), chrome, { material: "Metal" });
    const toast = K.rgb(232, 180, 100), crust = K.rgb(150, 90, 40);
    [-0.45, 0.45].forEach((zz, i) => {
      const up = i === 1 ? 0.45 : 0;
      K.block(m, K.v(2.6, 1.6, 0.32), K.v(0, 4.3 + up, zz), toast, { name: "Toast" });
      K.block(m, K.v(2.8, 0.28, 0.36), K.v(0, 5.15 + up, zz), crust, { name: "Crust" });
    });
    for (const s of [-1, 1]) ear(K, m, K.mul(K.cf(s * 1.6, 3.75, -0.2), K.rot(0, 0, -s * 10)), 0.9, 1.0, 0.2, chrome, K.C.pink);
    faceOn(K, m, K.cf(0, 2.0, -1.32), 3.0, { nose: K.rgb(255, 120, 150) });
    K.ball(m, K.v(0.5, 0.3, 0.1), K.cf(1.1, 1.65, -1.32), K.C.pink, { name: "Blush" });
    K.ball(m, K.v(0.5, 0.3, 0.1), K.cf(-1.1, 1.65, -1.32), K.C.pink, { name: "Blush" });
    K.block(m, K.v(0.12, 1.6, 0.25), K.v(2.02, 2.4, 0.4), K.C.black, { name: "LeverSlot" });
    K.ball(m, K.v(0.5, 0.35, 0.6), K.cf(2.2, 2.9, 0.4), K.C.red, { name: "LeverKnob" });
    K.cyl(m, 0.2, 0.7, K.mul(K.cf(2.06, 1.4, 0.4), K.rot(0, 0, 90)), K.C.black, { name: "Dial" });
    for (const x of [-1.6, 1.6]) for (const zz of [-1, 1]) K.ball(m, K.v(0.6, 0.45, 0.6), K.v(x, 0.38, zz), K.C.dark, { name: "Foot" });
    const a = K.v(0, 1.2, 1.3), b = K.v(0.5, 0.7, 2.4), c = K.v(1.3, 0.35, 2.9);
    K.limb(m, a, b, 0.22, K.C.black, { name: "Cord" });
    K.limb(m, b, c, 0.22, K.C.black, { name: "Cord" });
    K.block(m, K.v(0.5, 0.45, 0.7), K.mul(K.cf(K.add(c, [0.25, 0, 0.2])), K.rot(0, 30, 0)), K.C.white, { name: "Plug" });
    for (const s of [-1, 1]) K.block(m, K.v(0.06, 0.18, 0.4), K.mul(K.cf(K.add(c, [0.4 + s * 0.12, 0, 0.6])), K.rot(0, 30, 0)), K.C.silver, { name: "Prong" });
    return K.finish(m, { fit: 4.5 });
  },

  // 16 Pylon Purrkins - Traffic Cone Cat
  16: (K) => {
    const m = K.model("ConeCat");
    const orange = K.rgb(255, 110, 20), white = K.rgb(250, 250, 250);
    K.block(m, K.v(4, 0.4, 4), K.v(0, 0.2, 0), K.C.black, { name: "Base" });
    const tiers = [3.2, 2.8, 2.45, 2.1, 1.75, 1.4, 1.05];
    let y = 0.4;
    tiers.forEach((d, i) => {
      const col = i === 2 || i === 4 ? white : orange;
      K.cyl(m, 0.85, d, K.v(0, y + 0.425, 0), col, { name: i === 0 ? "Body" : "Cone", neon: col === white });
      y += 0.85;
    });
    K.ball(m, 0.95, K.v(0, y + 0.1, 0), orange, { name: "Tip" });
    ears(K, m, 0, y - 0.2, 0, 0.7, 0.9, orange, K.C.pink, 18);
    faceOn(K, m, K.cf(0, 1.45, -1.42), 2.3, { nose: K.C.black, whisker: K.C.dark });
    K.ball(m, K.v(0.8, 0.5, 0.9), K.v(-0.9, 0.55, -1.9), orange, { name: "Paw" });
    K.ball(m, K.v(0.8, 0.5, 0.9), K.v(0.9, 0.55, -1.9), orange, { name: "Paw" });
    K.limb(m, K.v(0, 1.0, 1.4), K.v(0.3, 1.4, 2.5), 0.4, orange, { name: "Tail" });
    K.limb(m, K.v(0.3, 1.4, 2.5), K.v(0.2, 2.6, 2.8), 0.4, white, { name: "Tail" });
    return K.finish(m, { fit: 5 });
  },

  // 17 Latte Meowchiato - Barista Cat
  17: (K) => {
    const mocha = K.rgb(150, 100, 65);
    const c = K.cat({ bodyShape: "tall", color: mocha, pattern: "tuxedo", color2: K.C.cream, eyes: "sleepy", mouth: "smile", tail: "curly" });
    const m = c.model;
    const green = K.rgb(30, 120, 70);
    K.block(m, K.v(1.55, 2.0, 0.14), c.attach("chest", K.v(0, -0.45, -0.12)), green, { name: "Apron" });
    K.block(m, K.v(1.6, 0.12, 0.12), c.attach("chest", K.v(0, 0.62, -0.12)), green, { name: "ApronStrap" });
    K.block(m, K.v(0.5, 0.3, 0.05), c.attach("chest", K.v(0.35, 0.1, -0.2)), K.C.white, { name: "NameTag" });
    // backwards cap
    K.ball(m, K.v(1.7, 0.9, 1.7), c.attach("headTop", K.v(0, -0.05, 0.05)), green, { name: "Cap" });
    K.block(m, K.v(1.1, 0.12, 0.8), c.attach("headTop", K.v(0, -0.15, 0.95)), green, { name: "CapBrim" });
    // mustache
    for (const s of [-1, 1]) K.ball(m, K.v(0.55, 0.16, 0.18), K.mul(c.attach("nose", K.v(s * 0.25, -0.15, -0.02)), K.rot(0, 0, s * -15)), K.C.black, { name: "Mustache" });
    // latte in paw
    const cup = c.attach("frontLeftPaw", K.v(0, 0.45, -0.15));
    K.cyl(m, 0.8, 0.65, cup, K.C.white, { name: "Cup" });
    K.cyl(m, 0.06, 0.58, K.mul(cup, K.cf(0, 0.41, 0)), K.rgb(225, 190, 150), { name: "Foam" });
    K.ball(m, K.v(0.25, 0.05, 0.25), K.mul(cup, K.cf(0, 0.45, 0)), K.rgb(130, 80, 45), { name: "FoamFish" });
    K.ball(m, 0.3, K.mul(cup, K.cf(0.05, 0.85, 0)), K.C.white, { name: "Steam", transparency: 0.45 });
    K.ball(m, 0.22, K.mul(cup, K.cf(-0.1, 1.2, 0)), K.C.white, { name: "Steam", transparency: 0.55 });
    return K.finish(m, { fit: 5.5 });
  },

  // 18 The Number 9 Purrbus - Cat That Is A Bus
  18: (K) => {
    const m = K.model("BusCat");
    const yellow = K.rgb(255, 200, 30);
    K.block(m, K.v(3.6, 3.2, 10), K.v(0, 2.8, 0), yellow, { name: "Body" });
    K.block(m, K.v(3.3, 0.4, 9.6), K.v(0, 4.55, 0), yellow, { name: "Roof" });
    for (const s of [-1, 1]) {
      K.block(m, K.v(0.1, 1.2, 7.4), K.v(s * 1.82, 3.5, 0.8), K.rgb(120, 190, 240), { name: "Windows", material: "Glass", transparency: 0.1 });
      K.block(m, K.v(0.1, 0.35, 9.8), K.v(s * 1.82, 2.25, 0), K.C.red, { name: "Stripe" });
    }
    K.block(m, K.v(0.1, 2.2, 1.3), K.v(-1.83, 2.4, -3.3), K.rgb(120, 190, 240), { name: "Door", material: "Glass" });
    faceOn(K, m, K.cf(0, 3.0, -5.02), 3.2, { mouthO: true });
    for (const s of [-1, 1]) K.ball(m, K.v(0.7, 0.6, 0.2), K.v(s * 1.3, 1.65, -5.02), K.rgb(255, 250, 200), { name: "Headlight", neon: true });
    K.block(m, K.v(3.8, 0.5, 0.4), K.v(0, 1.2, -5.1), K.C.dark, { name: "Bumper" });
    K.block(m, K.v(2.2, 0.55, 0.12), K.v(0, 4.35, -5.05), K.rgb(255, 120, 0), { name: "RouteSign", neon: true });
    ears(K, m, 0, 4.7, -4.0, 1.2, 1.3, yellow, K.C.pink, 12);
    for (const x of [-1.65, 1.65]) {
      for (const zz of [-3.2, 3.2]) {
        K.cyl(m, 0.55, 1.7, K.mul(K.cf(x, 0.85, zz), K.rot(0, 0, 90)), K.C.black, { name: "Wheel" });
        K.cyl(m, 0.6, 0.7, K.mul(K.cf(x, 0.85, zz), K.rot(0, 0, 90)), K.C.silver, { name: "Hubcap" });
      }
    }
    K.limb(m, K.v(0, 4.2, 5), K.v(0, 5.2, 5.9), 0.6, yellow, { name: "Tail" });
    K.limb(m, K.v(0, 5.2, 5.9), K.v(0, 6.6, 5.6), 0.6, K.C.dark, { name: "Tail" });
    return K.finish(m, { fit: 12 });
  },

  // 19 Binjamin Trashpaw - Garbage Can Cat
  19: (K) => {
    const c = K.cat({ bodyShape: "round", color: K.C.grey, pattern: "stripes", color2: K.C.dark, eyes: "derp", mouth: "teeth", tail: "none", legs: false });
    const m = c.model;
    const bin = K.rgb(60, 110, 70);
    K.cyl(m, 2.4, 3.7, K.v(0, 1.2, 0.2), bin, { name: "Bin", material: "Metal" });
    K.cyl(m, 0.25, 3.95, K.v(0, 2.45, 0.2), K.rgb(45, 85, 55), { name: "BinRim", material: "Metal" });
    for (const s of [-1, 1]) K.block(m, K.v(0.25, 0.6, 0.9), K.v(s * 1.95, 2.0, 0.2), K.C.dark, { name: "Handle" });
    const lid = K.mul(c.attach("headTop", K.v(0.2, 0.1, 0.1)), K.rot(0, 0, 18));
    K.cyl(m, 0.2, 2.6, lid, K.rgb(45, 85, 55), { name: "Lid", material: "Metal" });
    K.block(m, K.v(0.9, 0.25, 0.25), K.mul(lid, K.cf(0, 0.2, 0)), K.C.dark, { name: "LidHandle" });
    // banana peel scarf
    const neck = c.attach("neck");
    K.ball(m, K.v(1.6, 0.3, 0.6), K.mul(neck, K.cf(0, 0, -0.1)), K.C.yellow, { name: "Banana" });
    K.ball(m, K.v(0.3, 1.0, 0.4), K.mul(neck, K.cf(0.65, -0.4, -0.15), K.rot(0, 0, 15)), K.C.yellow, { name: "Banana" });
    // fish bone in paw
    const fb = c.attach("side", K.v(-0.2, 0.5, -0.4));
    K.block(m, K.v(0.08, 0.08, 1.4), fb, K.C.white, { name: "FishBone" });
    for (let i = -1; i <= 1; i++) K.block(m, K.v(0.06, 0.5, 0.06), K.mul(fb, K.cf(0, 0, i * 0.3)), K.C.white, { name: "Rib" });
    K.wedge(m, K.v(0.08, 0.5, 0.4), K.mul(fb, K.cf(0, 0, 0.85)), K.C.white, { name: "BoneTail" });
    // stink lines
    [-0.9, 0, 0.9].forEach((x, i) => {
      const k = (i + 1) % 2;
      K.limb(m, K.v(x, 4.6 + k * 0.3, 0.8), K.v(x + 0.25, 5.4 + k * 0.3, 0.9), 0.12, K.rgb(140, 255, 90), { name: "Stink", neon: true, transparency: 0.3 });
    });
    return K.finish(m, { fit: 5 });
  },

  // 20 Captain Fishfingers - Fish Stick Cat
  20: (K) => {
    const m = K.model("FishStickCat");
    const bread = K.rgb(220, 150, 60), dark = K.rgb(180, 110, 40);
    [-1.05, 0, 1.05].forEach((x, i) => {
      K.block(m, K.v(1, 0.95, 4), K.v(x, 1.4, 0.2), i === 1 ? bread : dark, { name: i === 1 ? "Body" : "Stick", material: "Sand" });
    });
    for (const x of [-1.05, 1.05]) for (const zz of [-1.3, 1.6]) K.block(m, K.v(0.65, 1.0, 0.65), K.v(x, 0.5, zz), bread, { name: "Leg", material: "Sand" });
    K.block(m, K.v(2.1, 2.0, 1.9), K.v(0, 2.6, -1.9), bread, { name: "Head", material: "Sand" });
    faceOn(K, m, K.cf(0, 2.5, -2.87), 1.9, { whisker: K.C.white });
    ears(K, m, 0, 3.6, -1.9, 0.75, 0.8, bread, K.C.pink, 10);
    // fish tail
    for (const s of [-1, 1]) K.wedge(m, K.v(0.2, 1.4, 1.0), K.mul(K.cf(0, 2.0 + s * 0.45, 2.7), K.rot(s * 35, 0, 0)), K.rgb(120, 170, 220), { name: "FishTail" });
    // captain hat
    K.cyl(m, 0.55, 1.5, K.v(0, 3.95, -1.9), K.C.white, { name: "Hat" });
    K.cyl(m, 0.12, 1.9, K.v(0, 3.7, -1.9), K.C.black, { name: "HatBand" });
    K.block(m, K.v(1.3, 0.1, 0.6), K.v(0, 3.65, -2.75), K.C.black, { name: "HatBrim" });
    K.ball(m, 0.3, K.v(0, 3.95, -2.66), K.C.gold, { name: "Badge", neon: true });
    // lemon wedge
    K.cyl(m, 0.2, 1.2, K.mul(K.cf(1.75, 1.7, -0.3), K.rot(0, 0, 90)), K.C.yellow, { name: "Lemon" });
    K.cyl(m, 0.22, 0.9, K.mul(K.cf(1.76, 1.7, -0.3), K.rot(0, 0, 90)), K.rgb(255, 250, 180), { name: "LemonInside" });
    return K.finish(m, { fit: 5 });
  },

  // 21 Sir Sandy Clawsworth - Sandcastle Cat
  21: (K) => {
    const m = K.model("SandcastleCat");
    const sand = K.rgb(235, 205, 145), wet = K.rgb(205, 170, 110);
    K.block(m, K.v(4, 2.4, 4), K.v(0, 1.2, 0), sand, { name: "Body", material: "Sand" });
    for (const x of [-1.9, 1.9]) {
      for (const zz of [-1.9, 1.9]) {
        K.cyl(m, 3.2, 1.2, K.v(x, 1.6, zz), wet, { name: "Tower", material: "Sand" });
        K.block(m, K.v(0.5, 0.5, 0.5), K.v(x, 3.45, zz), wet, { name: "Crenel", material: "Sand" });
      }
    }
    K.block(m, K.v(1.0, 1.1, 0.12), K.v(0, 0.55, -2.02), K.rgb(110, 80, 50), { name: "Door" });
    K.ball(m, K.v(1.0, 1.0, 0.12), K.v(0, 1.1, -2.02), K.rgb(110, 80, 50), { name: "DoorTop" });
    K.ball(m, K.v(0.7, 0.5, 0.15), K.v(1.0, 1.6, -2.03), K.rgb(255, 160, 180), { name: "Seashell" });
    K.ball(m, 2.4, K.v(0, 3.5, -0.2), sand, { name: "Head", material: "Sand" });
    faceOn(K, m, K.cf(0, 3.5, -1.33), 2.1, { closed: true, whisker: K.C.brown });
    ears(K, m, 0, 4.35, -0.2, 0.8, 0.85, sand, null, 15);
    // flag
    K.cyl(m, 2.0, 0.1, K.v(0, 5.6, -0.2), K.C.brown, { name: "FlagPole" });
    K.block(m, K.v(0.06, 0.6, 0.9), K.v(0, 6.3, 0.25), K.C.red, { name: "Flag" });
    // bucket on a tower + spade tail
    K.cyl(m, 0.9, 1.0, K.v(1.9, 3.95, 1.9), K.rgb(40, 120, 255), { name: "Bucket" });
    K.limb(m, K.v(0, 1.6, 2.0), K.v(0.2, 3.0, 3.0), 0.16, K.C.green, { name: "SpadeHandle" });
    K.block(m, K.v(0.7, 0.9, 0.08), K.mul(K.cf(0.25, 3.35, 3.3), K.rot(-35, 0, 0)), K.C.green, { name: "Spade" });
    return K.finish(m, { fit: 5 });
  },

  // 22 Bubbles the Astro-Tabby - Fishbowl Astronaut Cat
  22: (K) => {
    const c = K.cat({ color: K.rgb(170, 170, 180), pattern: "stripes", color2: K.rgb(90, 90, 100), eyes: "big", mouth: "o" });
    const m = c.model;
    const h = c.attach("head");
    K.ball(m, c.headD * 1.5, h, K.rgb(180, 230, 255), { name: "Fishbowl", material: "Glass", transparency: 0.65 });
    K.cyl(m, 0.3, c.headD * 1.1, c.attach("neck", K.v(0, -0.05, 0.1)), K.C.silver, { name: "Collar", material: "Metal" });
    const fish = K.mul(h, K.cf(0.55, 0.85, -0.35));
    K.ball(m, K.v(0.5, 0.35, 0.3), fish, K.rgb(255, 140, 20), { name: "Goldfish" });
    K.wedge(m, K.v(0.05, 0.3, 0.25), K.mul(fish, K.cf(0.35, 0, 0), K.rot(0, 90, 0)), K.rgb(255, 140, 20), { name: "GoldfishTail" });
    const back = c.attach("back");
    for (const s of [-1, 1]) {
      K.cyl(m, 1.4, 0.55, K.mul(back, K.cf(s * 0.35, 0.55, 0.3)), K.C.white, { name: "Tank" });
      K.cyl(m, 0.2, 0.3, K.mul(back, K.cf(s * 0.35, 1.32, 0.3)), K.C.red, { name: "TankCap" });
    }
    K.block(m, K.v(0.5, 0.3, 0.05), c.attach("chest", K.v(0.4, 0.4, -0.05)), K.rgb(40, 80, 200), { name: "Patch" });
    return K.finish(m, { fit: 5 });
  },

  // 23 Inflatabelle - Inflatable Pool Floatie Cat
  23: (K) => {
    const m = K.model("FloatieCat");
    const pink = K.rgb(255, 110, 180), white = K.rgb(255, 245, 250);
    // the ring (12 overlapping balls, striped)
    const N = 12, R = 1.8;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      K.ball(m, 1.5, K.v(Math.sin(a) * R, 0.75, Math.cos(a) * R), i % 2 === 0 ? pink : white, { name: i === 0 ? "Body" : "Ring" });
    }
    // head at the front
    K.ball(m, 2.4, K.v(0, 1.9, -2.2), pink, { name: "Head" });
    faceOn(K, m, K.cf(0, 1.9, -3.38), 2.0, { mouthO: true, whisker: K.C.dark });
    ears(K, m, 0, 2.85, -2.2, 0.7, 0.85, pink, white, 15);
    K.ball(m, K.v(0.45, 0.25, 0.1), K.mul(K.cf(-0.55, 2.55, -3.2), K.rot(0, 0, 30)), K.C.white, { name: "Shine", transparency: 0.3 });
    K.ball(m, K.v(0.5, 0.3, 0.1), K.cf(0.65, 1.6, -3.25), K.rgb(255, 170, 210), { name: "Blush" });
    K.ball(m, K.v(0.5, 0.3, 0.1), K.cf(-0.65, 1.6, -3.25), K.rgb(255, 170, 210), { name: "Blush" });
    // little paws gripping the ring
    K.ball(m, K.v(0.7, 0.45, 0.8), K.v(-1.0, 1.45, -1.5), white, { name: "Paw" });
    K.ball(m, K.v(0.7, 0.45, 0.8), K.v(1.0, 1.45, -1.5), white, { name: "Paw" });
    // air valve
    K.cyl(m, 0.5, 0.45, K.v(1.95, 1.35, 0.9), K.C.white, { name: "Valve" });
    K.cyl(m, 0.15, 0.6, K.v(1.95, 1.65, 0.9), K.rgb(60, 200, 255), { name: "ValveCap" });
    // tail
    K.limb(m, K.v(0, 0.9, 2.3), K.v(0.3, 2.0, 3.0), 0.45, pink, { name: "Tail" });
    K.limb(m, K.v(0.3, 2.0, 3.0), K.v(0.05, 2.9, 2.7), 0.45, white, { name: "Tail" });
    return K.finish(m, { fit: 5.5 });
  },

  // 24 Dishy McSignalface - Satellite Dish Cat
  24: (K) => {
    const m = K.model("DishCat");
    const dishC = K.rgb(235, 238, 242), grey = K.rgb(170, 175, 185), dark = K.rgb(55, 58, 64);
    K.block(m, K.v(2.2, 0.4, 2.2), K.v(0, 0.2, 0.4), dark, { name: "Mount", material: "Metal" });
    K.cyl(m, 3.2, 0.4, K.v(0, 1.9, 0.4), grey, { name: "Pole", material: "Metal" });
    // the dish (= the face), tilted up towards the sky
    const dish = K.mul(K.cf(0, 4.6, 0), K.rot(20, 0, 0));
    K.ball(m, K.v(5, 5, 1.2), dish, dishC, { name: "Body" });
    K.cyl(m, 0.35, 5.2, K.mul(dish, K.cf(0, 0, 0.1), K.rot(90, 0, 0)), grey, { name: "Rim", material: "Metal" });
    faceOn(K, m, K.mul(dish, K.cf(0, 0, -0.62)), 3.4, { whisker: K.C.dark, nose: K.rgb(255, 120, 150) });
    for (const s of [-1, 1]) ear(K, m, K.mul(dish, K.cf(s * 1.35, 2.0, 0), K.rot(0, 0, -s * 22)), 1.1, 1.2, 0.25, grey, K.C.pink);
    // the receiver arm sticks out like a long boopable snoot
    K.limb(m, K.p(K.mul(dish, K.cf(0, -1.9, -0.4))), K.p(K.mul(dish, K.cf(0, 0.2, -2.6))), 0.18, grey, { name: "Arm", material: "Metal" });
    K.ball(m, 0.65, K.p(K.mul(dish, K.cf(0, 0.2, -2.7))), dark, { name: "Receiver" });
    // signal bars
    for (let i = 1; i <= 3; i++) K.block(m, K.v(0.3, 0.3 + i * 0.35, 0.3), K.v(2.3 + i * 0.45, 6.6 + i * 0.17, -0.3), K.rgb(80, 255, 120), { name: "SignalBar", neon: true });
    // paws on the mount + cable tail with a plug
    K.ball(m, K.v(0.7, 0.4, 0.8), K.v(-0.7, 0.55, -0.6), dishC, { name: "Paw" });
    K.ball(m, K.v(0.7, 0.4, 0.8), K.v(0.7, 0.55, -0.6), dishC, { name: "Paw" });
    K.limb(m, K.v(0, 1.0, 0.6), K.v(0.9, 0.5, 1.7), 0.22, K.C.black, { name: "Tail" });
    K.limb(m, K.v(0.9, 0.5, 1.7), K.v(1.6, 0.35, 2.5), 0.22, K.C.black, { name: "Tail" });
    K.block(m, K.v(0.4, 0.4, 0.6), K.mul(K.cf(1.75, 0.35, 2.75), K.rot(0, 40, 0)), K.C.silver, { name: "Plug" });
    return K.finish(m, { fit: 7 });
  },

  // 25 Grandfather Clockwhiskers - Cat That Is A Clock
  25: (K) => {
    const m = K.model("ClockCat");
    const wood = K.rgb(120, 70, 35), darkWood = K.rgb(80, 45, 20);
    K.block(m, K.v(2.6, 6, 1.6), K.v(0, 3.6, 0), wood, { name: "Body", material: "Wood" });
    K.block(m, K.v(3.0, 0.6, 2.0), K.v(0, 0.3, 0), darkWood, { name: "Plinth", material: "Wood" });
    K.block(m, K.v(3.0, 0.4, 2.0), K.v(0, 6.8, 0), darkWood, { name: "Crown", material: "Wood" });
    K.cyl(m, 0.15, 2.0, K.mul(K.cf(0, 5.4, -0.82), K.rot(90, 0, 0)), K.rgb(250, 245, 225), { name: "ClockFace" });
    K.cyl(m, 0.1, 2.25, K.mul(K.cf(0, 5.4, -0.8), K.rot(90, 0, 0)), K.C.gold, { name: "ClockRim", material: "Foil" });
    K.block(m, K.v(0.1, 0.75, 0.05), K.mul(K.cf(0.15, 5.65, -0.93), K.rot(0, 0, -25)), K.C.black, { name: "Hand" });
    K.block(m, K.v(0.08, 0.55, 0.05), K.mul(K.cf(-0.22, 5.3, -0.93), K.rot(0, 0, -110)), K.C.black, { name: "Hand" });
    for (let i = 0; i <= 3; i++) {
      const a = (i * Math.PI) / 2;
      K.block(m, K.v(0.12, 0.25, 0.04), K.mul(K.cf(Math.sin(a) * 0.78, 5.4 + Math.cos(a) * 0.78, -0.92), K.angles(0, 0, -a)), K.C.black, { name: "Numeral" });
    }
    K.block(m, K.v(1.5, 2.6, 0.08), K.v(0, 2.6, -0.82), K.rgb(190, 230, 255), { name: "Window", material: "Glass", transparency: 0.4 });
    K.limb(m, K.v(0, 3.8, -0.75), K.v(0.35, 2.1, -0.75), 0.1, K.C.gold, { name: "Pendulum" });
    K.cyl(m, 0.1, 0.6, K.mul(K.cf(0.38, 1.85, -0.78), K.rot(90, 0, 0)), K.C.gold, { name: "Bob", material: "Foil" });
    K.ball(m, 2.1, K.v(0, 8.0, 0), wood, { name: "Head", material: "Wood" });
    faceOn(K, m, K.cf(0, 8.0, -0.97), 1.9, { whisker: K.C.white });
    ears(K, m, 0, 8.75, 0, 0.75, 0.8, wood, K.C.pink, 15);
    K.ball(m, K.v(0.8, 0.45, 0.9), K.v(-0.8, 0.75, -1.2), wood, { name: "Paw" });
    K.ball(m, K.v(0.8, 0.45, 0.9), K.v(0.8, 0.75, -1.2), wood, { name: "Paw" });
    K.limb(m, K.v(0, 1.5, 0.8), K.v(0.6, 2.6, 1.6), 0.35, wood, { name: "Tail" });
    K.limb(m, K.v(0.6, 2.6, 1.6), K.v(0.4, 4.0, 1.8), 0.35, darkWood, { name: "Tail" });
    return K.finish(m, { fit: 6.5 });
  },

  // 26 Stoplight Stanley - Traffic Light Cat
  26: (K) => {
    const m = K.model("TrafficLightCat");
    const housing = K.rgb(35, 38, 42);
    K.cyl(m, 0.3, 2.0, K.v(0, 0.15, 0), K.C.grey, { name: "Base", material: "Metal" });
    K.cyl(m, 2.8, 0.5, K.v(0, 1.6, 0), K.C.grey, { name: "Pole", material: "Metal" });
    K.block(m, K.v(2.0, 5.0, 1.5), K.v(0, 5.5, 0), housing, { name: "Body" });
    const lights = [[7.1, K.rgb(255, 40, 40)], [5.5, K.rgb(255, 190, 0)], [3.9, K.rgb(40, 255, 90)]];
    for (const [ly, col] of lights) {
      K.cyl(m, 0.25, 1.3, K.mul(K.cf(0, ly, -0.78), K.rot(90, 0, 0)), col, { name: "Light", neon: true });
      K.block(m, K.v(1.5, 0.12, 0.7), K.mul(K.cf(0, ly + 0.72, -1.05), K.rot(-15, 0, 0)), housing, { name: "Visor" });
    }
    ears(K, m, 0, 8.0, 0, 0.8, 0.9, housing, K.rgb(255, 40, 40), 12);
    for (const s of [-1, 1]) for (const t of [10, -10]) K.block(m, K.v(1.1, 0.06, 0.06), K.mul(K.cf(s * 1.45, 5.3, -0.6), K.rot(0, 0, s * t)), K.C.white, { name: "Whisker" });
    K.block(m, K.v(0.6, 0.5, 0.15), K.v(0, 4.5, -0.82), K.C.black, { name: "Mouth" });
    K.block(m, K.v(0.8, 1.0, 0.6), K.v(0.55, 2.0, -0.4), K.rgb(230, 200, 40), { name: "ButtonBox" });
    K.ball(m, 0.35, K.v(0.55, 2.1, -0.75), K.C.white, { name: "Button", neon: true });
    K.limb(m, K.v(0, 4.0, 0.75), K.v(0.4, 3.4, 1.8), 0.35, housing, { name: "Tail" });
    K.limb(m, K.v(0.4, 3.4, 1.8), K.v(0.2, 4.6, 2.3), 0.35, housing, { name: "Tail" });
    return K.finish(m, { fit: 6.5 });
  },

  // 27 Bartholomew Lostandfound - Lost & Found Cat
  27: (K) => {
    const c = K.cat({ bodyShape: "loaf", color: K.C.cream, pattern: "calico", color2: K.C.ginger, color3: K.C.dark, eyes: "big", mouth: "o", whiskers: false });
    const m = c.model;
    // odd sock hat
    const top = c.attach("headTop");
    const tp = K.p(top);
    K.limb(m, K.add(tp, [0, -0.1, 0]), K.add(tp, [0.2, 1.2, 0.3]), 0.85, K.C.red, { name: "Sock" });
    K.cyl(m, 0.3, 0.95, K.mul(top, K.cf(0, 0.05, 0)), K.C.white, { name: "SockBand" });
    K.ball(m, 0.85, K.add(tp, [0.35, 1.3, 0.75]), K.C.red, { name: "SockToe" });
    // glasses
    for (const p of K.acc.sunglasses(c, { color: K.rgb(90, 60, 30) })) {
      if (p.name === "Lens") {
        p.transparency = 0.6;
        p.color = K.rgb(200, 230, 255);
      }
    }
    // broken umbrella stuck on the back
    const bp = K.p(c.attach("back"));
    K.limb(m, bp, K.add(bp, [-0.8, 2.2, 0.5]), 0.12, K.C.black, { name: "UmbrellaPole" });
    K.ball(m, K.v(3.0, 0.9, 2.6), K.mul(K.cf(K.add(bp, [-0.9, 2.4, 0.5])), K.rot(10, 0, 25)), K.C.purple, { name: "Umbrella" });
    // mitten + phone
    K.ball(m, K.v(0.8, 1.0, 0.5), c.attach("side", K.v(-0.1, 0.1, 0)), K.C.blue, { name: "Mitten" });
    K.ball(m, K.v(0.3, 0.45, 0.3), c.attach("side", K.v(-0.1, 0.25, -0.4)), K.C.blue, { name: "Thumb" });
    const paw = K.p(c.attach("frontLeftPaw"));
    K.block(m, K.v(0.6, 0.06, 1.0), K.mul(K.cf(K.add(paw, [-0.4, 0.3, -0.5])), K.rot(0, 20, 0)), K.C.black, { name: "Phone" });
    K.block(m, K.v(0.5, 0.02, 0.85), K.mul(K.cf(K.add(paw, [-0.4, 0.34, -0.5])), K.rot(0, 20, 0)), K.rgb(120, 200, 255), { name: "Screen", neon: true });
    return K.finish(m, { fit: 5.5 });
  },

  // 28 Gatorbert of the Sewers - Sewer Alligator Cat
  28: (K) => {
    const green = K.rgb(80, 145, 65), dark = K.rgb(45, 95, 40);
    const c = K.cat({ bodyShape: "long", color: green, pattern: "spots", color2: dark, eyes: "angry", eyeWhite: K.rgb(255, 240, 80), mouth: "teeth", tail: "long", whiskers: false });
    const m = c.model;
    const mouth = c.attach("mouth");
    K.block(m, K.v(1.2, 0.55, 1.7), K.mul(mouth, K.cf(0, 0.15, -0.75)), green, { name: "Snout" });
    K.ball(m, K.v(0.5, 0.25, 0.3), K.mul(mouth, K.cf(0, 0.45, -1.45)), dark, { name: "Nostrils" });
    for (let i = 0; i <= 3; i++) {
      const x = i % 2 === 0 ? -0.5 : 0.5;
      K.wedge(m, K.v(0.15, 0.25, 0.2), K.mul(mouth, K.cf(x, -0.2, -0.3 - Math.floor(i / 2) * 0.7), K.rot(180, 0, 0)), K.C.white, { name: "Tooth" });
    }
    const back = c.attach("back");
    for (let i = -2; i <= 2; i++) K.wedge(m, K.v(0.5, 0.45, 0.8), K.mul(back, K.cf(0, 0.1, i * 1.25), K.rot(0, 180, 0)), dark, { name: "Scute" });
    // miner hard hat with a lamp
    const top = c.attach("headTop");
    K.ball(m, K.v(1.8, 1.0, 1.9), K.mul(top, K.cf(0, -0.15, 0)), K.C.yellow, { name: "HardHat" });
    K.cyl(m, 0.12, 2.2, K.mul(top, K.cf(0, -0.45, 0)), K.C.yellow, { name: "HatBrim" });
    K.cyl(m, 0.25, 0.5, K.mul(top, K.cf(0, 0.05, -0.95), K.rot(90, 0, 0)), K.rgb(255, 255, 200), { name: "Lamp", neon: true });
    return K.finish(m, { fit: 9 });
  },
};

// ============================================================================================ the town

// The palette. Every static part takes its colour from here, so the whole town stays a few dozen
// instanced batches (one per shape|material|colour); a new colour is a new draw call.
const P = Object.freeze({
  grass: "#6ebe5a", asphalt: "#3a3a42", concrete: "#cdcdc8", white: "#f8f8f8",
  pink: "#fab4c8", sky: "#a6cdfa", mint: "#a0e1c4", yellow: "#ffd65a", lavender: "#c8aaf0",
  peach: "#fac896", tan: "#c8a482", brick: "#b45a46", roof: "#5a4650", roofRed: "#b44650",
  wood: "#966440", plank: "#be8c55", steel: "#bec3cd", dark: "#3c414b", glass: "#aad7f5",
  warm: "#ffe18c", neonPink: "#ff64c8", red: "#dc3c3c", blue: "#3c78dc",
  orange: "#ff6e14", leaf: "#5aaa50", water: "#4696e6", gold: "#ffc83c",
  sewerWall: "#465549", sewerFloor: "#2d3732", sludge: "#78ff3c",
});

export function build(z) {
  const K = z.K;
  const cf = (x, y, pz, ry) => z.cf(x, y, pz, ry || 0);

  // ---- part helpers (original semantics: B = centre-anchored box, U = bottom-anchored box) ----
  const opts = (ex = {}) => ({
    material: ex.mat, neon: !!ex.neon, transparency: ex.tr, decor: !!ex.decor,
    collide: ex.collide, dynamic: !!ex.dyn, light: ex.light,
  });
  const at = (x, y, pz, ex = {}) => {
    let m = cf(x, y, pz, ex.ry);
    if (ex.rot) m = K.mul(m, ex.rot);
    return m;
  };
  const B = (sx, sy, sz, x, y, pz, color, ex = {}) => z.part({ shape: "box", size: [sx, sy, sz], cf: at(x, y, pz, ex), color, ...opts(ex) });
  const U = (sx, sy, sz, x, y0, pz, color, ex) => B(sx, sy, sz, x, y0 + sy / 2, pz, color, ex);
  const CYL = (len, d, x, y, pz, color, ex = {}) => z.part({ shape: "cylinder", size: [d, len, d], cf: at(x, y, pz, ex), color, ...opts(ex) });
  const BALL = (d, x, y, pz, color, ex = {}) => z.part({ shape: "sphere", size: [d, d, d], cf: at(x, y, pz, ex), color, ...opts(ex) });
  const ELL = (sx, sy, sz, x, y, pz, color, ex = {}) => z.part({ shape: "sphere", size: [sx, sy, sz], cf: at(x, y, pz, ex), color, ...opts(ex) });
  const WEDGE = (sx, sy, sz, x, y, pz, color, ex = {}) => z.rwedge([sx, sy, sz], at(x, y, pz, ex), {
    Color: color, Material: ex.mat, Neon: !!ex.neon, Transparency: ex.tr, Decor: !!ex.decor,
  });
  const D = (ex = {}) => ({ ...ex, decor: true });
  const lamp = (range = 26, intensity = 1.5, color = "#ffdcaa") => ({ color, intensity, range });
  // sign: one of two part colours (light / dark); the original's background is painted by the label
  const sign = (w, h, x, y, pz, ry, text, bg, fg, o = {}) => {
    const dark = lum(bg || P.white) < 0.45;
    const p = B(w, h, 0.4, x, y, pz, dark ? P.dark : P.white, { ry, mat: dark ? "metal" : undefined });
    z.label(p, text, { color: fg || "#281e1e", bg: bg || "#fff8e6", both: !!o.both });
    return p;
  };
  // pitched roof, ridge along X, eaves at y0
  const pitched = (x, pz, w, d, y0, rise, color) => {
    const half = d / 2 + 0.6;
    WEDGE(w + 1.2, rise, half, x, y0 + rise / 2, pz - half / 2, color, { mat: "concrete" });
    WEDGE(w + 1.2, rise, half, x, y0 + rise / 2, pz + half / 2, color, { mat: "concrete", ry: 180 });
  };
  // glass strips per floor on the face at zFace (dir = +1 south face, -1 north face)
  const windows = (x, zFace, dir, w, h, y0 = 0) => {
    let i = 0;
    for (let y = y0 + 3.5; y + 1.5 < y0 + h; y += 6) {
      i++;
      const lit = i % 2 === 0;
      B(w - 3, 2.4, 0.3, x, y, zFace + dir * 0.12, lit ? P.warm : P.glass, D(lit ? { neon: true } : { mat: "glass" }));
    }
  };
  // hollow building, door in the SOUTH (+z) wall
  const hollow = (x, pz, w, d, h, color, doorW, doorH, mat) => {
    const t = 1;
    const ex = () => (mat ? { mat } : {});
    U(w, h, t, x, 0, pz - d / 2 + t / 2, color, ex());
    U(t, h, d - 2 * t, x - w / 2 + t / 2, 0, pz, color, ex());
    U(t, h, d - 2 * t, x + w / 2 - t / 2, 0, pz, color, ex());
    const side = (w - doorW) / 2;
    U(side, h, t, x - w / 2 + side / 2, 0, pz + d / 2 - t / 2, color, ex());
    U(side, h, t, x + w / 2 - side / 2, 0, pz + d / 2 - t / 2, color, ex());
    U(doorW, h - doorH, t, x, doorH, pz + d / 2 - t / 2, color, ex());
    U(w - 2, 0.2, d - 2, x, 0, pz, P.plank, { mat: "wood" });
  };
  const tree = (x, pz, s = 1) => {
    CYL(7 * s, 1.6 * s, x, 3.5 * s, pz, P.wood, { mat: "wood" });
    BALL(8 * s, x, 8.5 * s, pz, P.leaf, D({ mat: "grass" }));
    BALL(5.5 * s, x + 1.5 * s, 11.2 * s, pz - 1 * s, P.grass, D({ mat: "grass" }));
  };
  const car = (x, pz, color) => {
    U(9, 2, 4.4, x, 0.8, pz, color);
    U(5, 1.8, 4, x + 0.5, 2.8, pz, P.glass, { mat: "glass" });
    for (const dx of [-3, 3]) for (const dz of [-2.2, 2.2]) CYL(0.8, 2, x + dx, 1, pz + dz, P.dark, { mat: "metal", rot: K.rot(90, 0, 0) });
    B(0.2, 0.6, 1, x - 4.55, 2, pz - 1.4, P.warm, D({ neon: true }));
    B(0.2, 0.6, 1, x - 4.55, 2, pz + 1.4, P.warm, D({ neon: true }));
  };
  const cone = (x, pz) => {
    U(1.6, 0.25, 1.6, x, 0, pz, P.dark, { mat: "metal" });
    CYL(2.2, 0.9, x, 1.35, pz, P.orange);
    CYL(0.4, 1.0, x, 1.5, pz, P.white, D());
  };
  const bench = (x, pz, ry = 0) => {
    const base = K.mul(cf(x, 0, pz), K.rot(0, ry, 0));
    z.part({ shape: "box", size: [5, 0.4, 1.6], cf: K.mul(base, K.cf(0, 1.6, 0)), color: P.wood, material: "wood" });
    z.part({ shape: "box", size: [5, 1.4, 0.3], cf: K.mul(base, K.cf(0, 2.6, 0.75)), color: P.wood, material: "wood" });
    z.part({ shape: "box", size: [4.4, 1.4, 1.2], cf: K.mul(base, K.cf(0, 0.7, 0)), color: P.dark, material: "metal" });
  };

  // ------------------------------------------------------------------------------ ground (with the manhole hole)
  const MX = 110, MZ = 110, FLOOR = -22, CEIL = -2;
  const cellC = (i, o) => o + i * 10 + 5.5;
  const HX = 100, HZ = cellC(3, MZ); // manhole centre (145.5)
  const hx0 = HX - 3, hx1 = HX + 3, hz0 = HZ - 3, hz1 = HZ + 3;
  const slab = (x0, x1, z0, z1) => B(x1 - x0, 2, z1 - z0, (x0 + x1) / 2, -1, (z0 + z1) / 2, P.grass, { mat: "grass" });
  slab(-195, 195, -195, hz0);
  slab(-195, hx0, hz0, hz1);
  slab(hx1, 195, hz0, hz1);
  slab(-195, 195, hz1, 195);

  // ------------------------------------------------------------------------------ streets
  B(373, 0.2, 18, 8.5, 0.1, 0, P.asphalt, { mat: "concrete" });
  B(373, 0.05, 0.4, 8.5, 0.22, 0, P.yellow, D());
  B(16, 0.2, 186, 0, 0.1, -102, P.asphalt, { mat: "concrete" });
  B(16, 0.2, 186, 0, 0.1, 102, P.asphalt, { mat: "concrete" });
  B(0.4, 0.05, 186, 0, 0.22, -102, P.yellow, D());
  B(0.4, 0.05, 186, 0, 0.22, 102, P.yellow, D());
  for (const cx of [-14, 14]) for (let i = -3; i <= 3; i++) B(4, 0.06, 1.3, cx, 0.23, i * 2.4, P.white, D());
  for (const sz of [-11, 11]) {
    B(162, 0.5, 4, -89, 0.25, sz, P.concrete, { mat: "concrete" });
    B(187, 0.5, 4, 101.5, 0.25, sz, P.concrete, { mat: "concrete" });
  }
  for (const sx of [-10, 10]) {
    B(4, 0.5, 182, sx, 0.25, -104, P.concrete, { mat: "concrete" });
    B(4, 0.5, 182, sx, 0.25, 104, P.concrete, { mat: "concrete" });
  }
  // street lamps (glowing bulbs; the town's real lamps are indoors, inside the 12-lamp budget)
  for (let x = -150; x <= 180; x += 30) {
    if (x === 0) continue;
    for (const sz of [-11.5, 11.5]) {
      if (x === 30 && sz < 0) continue; // keep the Cat Signal control box sign readable from the street
      CYL(10, 0.5, x, 5.5, sz, P.dark, { mat: "metal" });
      BALL(1.4, x, 10.9, sz, P.warm, D({ neon: true }));
    }
  }
  // bunting across Main Street
  const flagC = [P.red, P.yellow, P.blue];
  for (const bx of [-100, 45, 125]) {
    B(0.15, 0.15, 23, bx, 12.6, 0, P.white, D());
    for (let i = 0; i <= 8; i++) WEDGE(0.1, 1.4, 1.1, bx, 11.8, -10 + i * 2.5, flagC[i % flagC.length], D({ rot: K.rot(180, 0, 0) }));
  }
  // parked cars
  car(-120, -6, P.red);
  car(-40, 6, P.blue);
  car(50, -6, P.yellow);
  car(140, 6, P.white);
  car(178, -6, P.red);

  // ------------------------------------------------------------------------------ welcome arch + town map
  for (const az of [-12, 12]) {
    U(2, 16, 2, -166, 0, az, P.brick, { mat: "brick" });
    BALL(1.8, -166, 16.9, az, P.warm, D({ neon: true }));
  }
  const arch = B(28, 3.5, 1.2, -166, 17.5, 0, P.white, { ry: 90 });
  z.label(arch, "WELCOME TO CATFORD", { color: "#5a2814", bg: "#e6b478", both: true });
  sign(12, 9, -160, 4.5, 22, 90, "CATFORD TOWN\n14 cats live here (allegedly)\n\nNORTH of Main St: Purrcolator Cafe, Pawsome Pets, Lost & Found, No. 12 Butterpaw Lane, Rooftop Row, Clock Tower, Cat Signal, Bus Stop, Fish Market\n\nSOUTH: Whisker Park + pond, playground, road works, Meowy's Diner + Bin Alley, the sewers (please don't)", "#fff8e1", "#3c281e");

  // ------------------------------------------------------------------------------ NW: The Purrcolator cafe (17)
  {
    const x = -145, pz = -31, w = 34, d = 30, h = 14;
    hollow(x, pz, w, d, h, P.pink, 8, 9, "brick");
    U(w + 1, 1, d + 1, x, h, pz, P.roof, { mat: "concrete" });
    B(w + 1, 0.4, 0.4, x, h - 0.4, pz + d / 2 + 0.3, P.neonPink, D({ neon: true }));
    sign(22, 4, x, h + 3, pz + d / 2 - 0.2, 180, "THE PURRCOLATOR", "#5a3228", "#ffe6c8");
    [P.red, P.white, P.red].forEach((col, i) => WEDGE(10, 1.6, 3, x - 20 + (i + 1) * 10, 11.2, pz + d / 2 + 1.5, col, { ry: 180 }));
    for (const wx of [-11, 11]) B(8, 5, 0.2, x + wx, 5.5, pz + d / 2 + 0.12, P.glass, D({ mat: "glass" }));
    // inside
    U(22, 3.5, 2, -147, 0, -36, P.wood, { mat: "wood" });
    U(22.4, 0.3, 2.4, -147, 3.5, -36, P.white);
    U(30, 3.5, 2.5, x, 0, -44.25, P.wood, { mat: "wood" });
    U(3, 3, 2, -152, 3.5, -44.4, P.steel, { mat: "metal" });
    BALL(0.5, -152, 5.6, -43.35, P.orange, D());
    U(1, 1.4, 1, -140, 3.8, -36, P.glass, { mat: "glass" });
    sign(12, 5, -137, 8.5, -45.3, 180, "MENU\nCatpuccino .. 3 fish\nMeowcha Latte .. 4 fish\nPurrfect Espresso .. 2 fish\nHot chocolate (it has a fish on it)", "#282828", "#ffffff");
    for (const tx of [-156, -134]) {
      CYL(0.3, 4, tx, 3, -23, P.white);
      CYL(3, 0.5, tx, 1.5, -23, P.dark, { mat: "metal" });
      CYL(2, 1.4, tx - 3, 1, -23, P.orange);
      CYL(2, 1.4, tx + 3, 1, -23, P.orange);
    }
    B(3, 0.5, 3, x, h - 0.6, pz, P.warm, D({ neon: true, light: lamp(30) }));
    z.cat(17, cf(-147, 0, -40, 180));
  }

  // ------------------------------------------------------------------------------ NW: Pawsome Pets (22)
  {
    const x = -105, pz = -30, w = 26, d = 28, h = 20;
    hollow(x, pz, w, d, h, P.sky, 6, 9, "concrete");
    U(w + 1, 1, d + 1, x, h, pz, P.roof, { mat: "concrete" });
    sign(20, 4, x, 14, pz + d / 2 + 0.25, 180, "PAWSOME PETS", "#ffe650", "#2846a0");
    B(w + 1, 0.4, 0.4, x, 11.5, pz + d / 2 + 0.3, P.neonPink, D({ neon: true }));
    for (const wx of [-8.5, 8.5]) B(7, 6, 0.2, x + wx, 5, pz + d / 2 + 0.12, P.glass, D({ mat: "glass" }));
    // staircase shelves along the back wall (tops 4, 8, 12)
    for (const [sx, top] of [[-114, 4], [-107, 8], [-100, 12]]) {
      U(6, 0.6, 3, sx, top - 0.6, -41.5, P.plank, { mat: "wood" });
      U(0.5, top - 0.6, 0.5, sx - 2.5, 0, -40.4, P.wood, D({ mat: "wood" }));
      U(0.5, top - 0.6, 0.5, sx + 2.5, 0, -40.4, P.wood, D({ mat: "wood" }));
    }
    U(1.4, 2, 1, -115.5, 4, -42, P.orange, D());
    U(1.4, 2, 1, -113.5, 4, -42, P.blue, D());
    U(1, 1, 1, -108.5, 8, -42, P.neonPink, D({ neon: true }));
    BALL(1.2, -105.5, 8.6, -42, P.orange, D());
    sign(5, 2, -110, 2, -42.8, 180, "Please do NOT climb the shelves. (they make great stairs tho)", "#ffffdc", "#3c3c3c");
    // fish tanks + cat tree
    U(9, 3, 3, -106, 0, -23, P.wood, { mat: "wood" });
    U(8, 3, 2.6, -106, 3, -23, P.glass, { mat: "glass" });
    [-108.5, -106, -103.5].forEach((fx, i) => BALL(0.6, fx, 4 + ((i + 1) % 2) * 0.8, -23, P.orange, D()));
    CYL(9, 1, -115, 4.5, -24, P.wood, { mat: "wood" });
    U(4, 0.6, 4, -115, 4, -24, P.lavender, { mat: "brick" });
    U(3.5, 0.6, 3.5, -115, 8.4, -24, P.lavender, { mat: "brick" });
    B(3, 0.5, 3, x, h - 0.6, pz, P.warm, D({ neon: true, light: lamp(30) }));
    z.cat(22, cf(-100, 12, -41.5, -90));
  }

  // ------------------------------------------------------------------------------ NW: Lost & Found kiosk (27)
  let lfBell;
  {
    const x = -52, pz = -26;
    U(14, 10, 1, x, 0, pz - 6.5, P.mint, { mat: "brick" });
    U(1, 10, 12, x - 7.5, 0, pz, P.mint, { mat: "brick" });
    U(1, 10, 12, x + 7.5, 0, pz, P.mint, { mat: "brick" });
    U(16, 1, 14, x, 10, pz, P.roof, { mat: "concrete" });
    U(14, 3, 1.2, x, 0, pz + 6.6, P.wood, { mat: "wood" });
    sign(14, 2.5, x, 12.25, pz + 7.3, 180, "LOST & FOUND", "#fff0c8", "#285028");
    sign(9, 2.4, x - 1.5, 1.5, pz + 7.35, 180, "CLOSED. The Mayor lost the key. Last seen: 'with the BIGGEST FISH in town'. If found, ring the bell.", "#ffffe6", "#3c1e1e");
    lfBell = BALL(1, x + 5, 3.5, pz + 6.6, P.gold, { mat: "metal" });
    U(12, 0.4, 2, x, 8.2, pz - 5, P.wood, D({ mat: "wood" }));
    U(0.3, 1.2, 0.3, x - 4, 8.6, pz - 5, P.lavender, D({ mat: "brick" }));
    BALL(1, x + 3, 9.1, pz - 5, P.orange, D());
    z.cat(27, cf(x, 0.2, pz - 1.5, 180), { locked: true });
  }

  // ------------------------------------------------------------------------------ NW: No. 12 Butterpaw Lane (15)
  {
    const x = -26, pz = -51, w = 20, d = 22, h = 10;
    hollow(x, pz, w, d, h, P.yellow, 5, 8);
    pitched(x, pz, w, d, h, 5, P.roofRed);
    B(4, 3, 0.2, x - 6, 5, pz + d / 2 + 0.12, P.glass, D({ mat: "glass" }));
    B(4, 3, 0.2, x + 6, 5, pz + d / 2 + 0.12, P.glass, D({ mat: "glass" }));
    sign(5, 1.5, x, 9, pz + d / 2 + 0.25, 180, "No. 12", "#ffffff", "#3c281e");
    U(12, 3.5, 3, x, 0, -59.5, P.white);
    U(3, 7, 3, x - 7.5, 0, -59, P.steel, { mat: "metal" });
    U(4, 3, 4, x + 3, 0, -48, P.wood, { mat: "wood" });
    U(1.2, 1, 1, x + 7, 3, pz + d / 2 + 3, P.blue);
    U(0.3, 3, 0.3, x + 7, 0, pz + d / 2 + 3, P.wood, { mat: "wood" });
    B(2, 0.4, 2, x, h - 0.4, pz, P.warm, D({ neon: true, light: lamp(22) }));
    z.cat(15, cf(x, 3.5, -59.5, 180));
  }

  // ------------------------------------------------------------------------------ NW: Rooftop Row (24)
  {
    const pz = -140, d = 20;
    // A: pink, pitched (ridge 16)
    U(20, 10, d, -160, 0, pz, P.pink, { mat: "brick" });
    pitched(-160, pz, 20, d, 10, 6, P.roofRed);
    // the original's wall ladder: the engine cannot climb, so a stack of metal steps up the west wall
    // (along the north wall: the west end is a gable, the slope starts at the north eave)
    U(3, 2.5, 3.5, -168.5, 0, -152.75, P.steel, { mat: "metal" });
    U(3, 5, 3.5, -165.5, 0, -152.75, P.steel, { mat: "metal" });
    U(3, 7.5, 3.5, -162.5, 0, -152.75, P.steel, { mat: "metal" });
    sign(12, 3, -160, 8.5, pz + d / 2 + 0.25, 180, "ROOFTOP ROW: residents ask you to PLEASE stop jumping across our roofs. The steps are on the north wall.", "#ffffeb", "#502828");
    // B: mint, flat 18
    U(20, 18, d, -134, 0, pz, P.mint, { mat: "brick" });
    U(4, 3, 4, -126, 18, pz, P.plank, { mat: "wood" });
    // C: lavender, pitched (ridge 22) + chimney
    U(20, 14, d, -108, 0, pz, P.lavender, { mat: "brick" });
    pitched(-108, pz, 20, d, 14, 8, P.roof);
    U(2.5, 6, 2.5, -100, 19, pz, P.brick, { mat: "brick" });
    // D: peach, flat 26, water tank + AC unit
    U(20, 26, d, -82, 0, pz, P.peach, { mat: "brick" });
    CYL(6, 5, -86, 29, pz - 5, P.wood, { mat: "wood" });
    U(4, 3, 4, -75, 26, pz, P.steel, { mat: "metal" });
    CYL(0.2, 2, -73, 27.5, pz, P.dark, D({ mat: "metal", rot: K.rot(0, 0, 90) }));
    // E: blue, flat 32 + crates + turret 40
    U(20, 32, d, -58, 0, pz, P.sky, { mat: "concrete" });
    U(4, 3, 4, -64, 32, -136, P.plank, { mat: "wood" });
    U(4, 6, 4, -60, 32, -132, P.wood, { mat: "wood" });
    U(7, 8, 7, -56, 32, -142, P.lavender, { mat: "brick" });
    B(7.4, 0.4, 7.4, -56, 39.8, -142, P.warm, D({ neon: true }));
    [-160, -134, -108, -82, -58].forEach((hx, i) => {
      windows(hx, pz + d / 2, 1, 20, [10, 18, 14, 26, 32][i], 0);
      U(4, 7, 0.3, hx, 0, pz + d / 2 + 0.1, P.wood, D({ mat: "wood" }));
    });
    z.cat(24, cf(-56, 40, -142));
  }

  // ------------------------------------------------------------------------------ NE: town square + clock tower (25)
  {
    B(80, 0.2, 86, 60, 0.1, -70, P.concrete, { mat: "concrete" });
    const tx = 60, tz = -75;
    U(16, 60, 16, tx, 0, tz, P.brick, { mat: "brick" });
    for (const y of [20, 40]) B(16.6, 1, 16.6, tx, y, tz, P.concrete, D({ mat: "concrete" }));
    // belfry
    for (const sx of [-7, 7]) for (const sz of [-7, 7]) U(2, 12, 2, tx + sx, 60, tz + sz, P.concrete, { mat: "concrete" });
    U(18, 1, 18, tx, 72, tz, P.roof, { mat: "concrete" });
    U(12, 2, 12, tx, 73, tz, P.roof, { mat: "concrete" });
    U(7, 2, 7, tx, 75, tz, P.roof, { mat: "concrete" });
    CYL(8, 1, tx, 81, tz, P.warm, { neon: true });
    BALL(2, tx, 85.5, tz, P.warm, D({ neon: true }));
    CYL(1.5, 0.4, tx, 71.2, tz, P.dark, D({ mat: "metal" }));
    BALL(3.5, tx, 69.4, tz, P.gold, D({ mat: "metal", light: lamp(18, 1.3, "#ffdc8c") }));
    // clock faces (static, 10:10)
    for (const [fdx, fdz, ry] of [[0, -1, 0], [0, 1, 180], [-1, 0, 90], [1, 0, -90]]) {
      const base = cf(tx + fdx * 8.3, 48, tz + fdz * 8.3, ry);
      z.rcyl(0.4, 11.5, K.mul(base, K.rot(0, 90, 0)), { Color: P.dark, Material: "metal", Decor: true });
      z.rcyl(0.5, 10, K.mul(base, K.rot(0, 90, 0)), { Color: P.warm, Neon: true, Decor: true });
      z.part({ shape: "box", size: [0.5, 4.2, 0.2], cf: K.mul(base, K.cf(0, 0, -0.35), K.rot(0, 0, -60), K.cf(0, 1.9, 0)), color: P.dark, material: "metal", decor: true });
      z.part({ shape: "box", size: [0.5, 3.2, 0.2], cf: K.mul(base, K.cf(0, 0, -0.35), K.rot(0, 0, 60), K.cf(0, 1.4, 0)), color: P.dark, material: "metal", decor: true });
    }
    // 13 spiral ledges (+4.5 each), path around a square of half-size 10
    const onSquare = (s) => {
      s %= 80;
      if (s < 20) return [-10 + s, 10];
      if (s < 40) return [10, 10 - (s - 20)];
      if (s < 60) return [10 - (s - 40), -10];
      return [-10, -10 + (s - 60)];
    };
    for (let i = 1; i <= 13; i++) {
      const [lx, lz] = onSquare(4 + i * 6.2);
      U(4, 1, 4, tx + lx, 4.5 * i - 1, tz + lz, i % 2 === 0 ? P.concrete : P.tan, { mat: i % 2 === 0 ? "concrete" : "sand" });
    }
    sign(10, 2.8, tx + 3, 1.9, tz + 8.3, 180, "CATFORD CLOCK TOWER. Maintenance ledges: DO NOT CLIMB. (Something up there keeps going BONG.)", "#fffae6", "#3c1e1e");
    z.cat(25, cf(tx, 60, tz));
    // square decor: fountain + benches + trees
    CYL(1.5, 12, 35, 0.75, -95, P.concrete, { mat: "concrete" });
    CYL(0.2, 10.6, 35, 1.45, -95, P.water, D());
    CYL(4, 1.5, 35, 3, -95, P.concrete, { mat: "concrete" });
    const spray = BALL(2.4, 35, 5.6, -95, P.glass, D({ mat: "glass" }));
    z.tag(spray, "Bob", { Amp: 0.6, Period: 1.6 });
    bench(35, -86, 180);
    bench(85, -95, 90);
    tree(28, -40);
    tree(92, -40);
    tree(92, -108);
    tree(28, -110);
  }

  // ------------------------------------------------------------------------------ NE: Cat Signal crossroads (26)
  {
    CYL(14, 0.8, 16, 7, -16, P.dark, { mat: "metal" });
    B(8, 0.6, 0.6, 12, 12, -16, P.dark, { mat: "metal" });
    U(1.6, 4.5, 1.6, 9, 7.5, -16, P.dark, { mat: "metal" });
    [[P.red], [P.orange], [P.mint, "brick"]].forEach(([col, mat], i) => B(1, 1, 0.3, 9, 11.2 - (i + 1) * 1.3, -15.1, col, D({ mat })));
    const OFF = "#2a2a2e";
    const signal = BALL(3.6, 16, 15.8, -16, OFF, { neon: true, dyn: true });
    for (const s of [-1, 1]) B(1.2, 1.2, 0.5, 16 + s * 1.1, 17.6, -16, P.dark, { mat: "metal", rot: K.rot(0, 0, 45) });
    sign(6, 1.6, 16, 12.4, -15.3, 180, "THE CAT SIGNAL", "#1e1e28", "#ffffff");
    // the flashing sequence: GREEN, RED, BLUE, YELLOW ... pause
    const SEQ = ["#28ff5a", "#ff2828", "#2878ff", "#ffd200"];
    const ON = 1.0, GAP = 0.35, PAUSE = 2.6;
    const period = SEQ.length * (ON + GAP) + PAUSE;
    let last = -1;
    z.heartbeat((dt, t) => {
      const ts = t % period;
      const idx = Math.floor(ts / (ON + GAP)) + 1;
      let state = 0;
      if (idx <= SEQ.length && ts - (idx - 1) * (ON + GAP) < ON) state = idx;
      if (state !== last) {
        last = state;
        signal.setColor(state === 0 ? OFF : SEQ[state - 1]);
      }
    });
    // control box with 4 levers (R Y G B left -> right as seen from the street)
    U(6, 5, 3, 28, 0, -20, P.mint, { mat: "brick" });
    sign(9, 3.6, 28, 7.3, -20, 180, "CAT SIGNAL CONTROL BOX\nPull the 4 levers in the SAME ORDER the Cat Signal (glowing cat head on the pole) flashes its colours, starting after its long pause.\nWrong lever = reboot.", "#fffae1", "#28283c");
    U(0.4, 5.5, 0.4, 28, 0, -20.6, P.dark, D({ mat: "metal" }));
    const levers = [["RED", "#ff2828"], ["YELLOW", "#ffd200"], ["GREEN", "#28ff5a"], ["BLUE", "#2878ff"]];
    const ORDER = ["GREEN", "RED", "BLUE", "YELLOW"];
    levers.forEach(([name, col], i) => {
      const lx = 28 + (i + 1 - 2.5) * 1.35;
      const handle = U(0.6, 2, 0.6, lx, 2.2, -18.1, P.dark, { mat: "metal" });
      const knob = BALL(0.9, lx, 4.5, -18.1, col, { neon: true, dyn: true });
      const pull = () => {
        if (z.has(26) || z.isUnlocked(26)) return z.notify("The Cat Signal box is already happy. Go get Stanley!");
        const left = z.isLocked("signal");
        if (left) return z.fail(`The box is rebooting... ${left} s`);
        let step = z.flag("signal") || 0;
        z.sound("volume_slider.ogg");
        if (ORDER[step] === name) {
          step++;
          z.tone(0.8 + step * 0.3);
          if (step >= ORDER.length) {
            z.flag("signal", 0);
            z.unlock(26);
            z.notify("DING DING! The Cat Signal box opens Stanley's cage!");
          } else {
            z.flag("signal", step);
            z.notify(`*clunk* ${name} lever (${step}/4)`);
          }
        } else {
          z.flag("signal", 0);
          z.lockout(3, "signal");
          z.fail("BZZT! Wrong order. Watch the Cat Signal again.");
        }
      };
      z.click(handle, pull);
      z.click(knob, pull);
    });
    U(5, 1, 5, 38, 0, -21, P.concrete, { mat: "concrete" });
    z.cat(26, cf(38, 1, -21, 180), { locked: true });
  }

  // ------------------------------------------------------------------------------ NE: bus stop (18)
  {
    U(16, 7.5, 0.4, 80, 0, -19.8, P.glass, { mat: "glass" });
    U(0.4, 7.5, 5.5, 72.2, 0, -17, P.glass, { mat: "glass" });
    U(0.4, 7.5, 5.5, 87.8, 0, -17, P.glass, { mat: "glass" });
    U(17, 0.6, 7.5, 80, 7.5, -16.75, P.blue);
    U(8, 1.6, 1.6, 80, 0, -18.5, P.wood, { mat: "wood" });
    sign(5, 3.6, 76, 4.2, -19.5, 180, "ROUTE 9 TIMETABLE\n7:00 never\n8:00 never\n9:00 lol\nThe bus is napping on our roof.", "#ffffff", "#1e1e50");
    U(5, 2, 2, 95.5, 0, -17, P.wood, { mat: "wood" });
    CYL(5, 3, 90.5, 2.5, -17, P.leaf, { mat: "metal" });
    CYL(9, 0.4, 70, 4.7, -11.5, P.dark, { mat: "metal" });
    sign(4, 3.5, 70, 9.6, -11.5, 180, "BUS STOP\nROUTE 9\nNext bus: NEVER", "#285ac8", "#ffffff", { both: true });
    z.cat(18, cf(80, 8.1, -16.75, 90));
  }

  // ------------------------------------------------------------------------------ NE: fish market (20) + the key (27)
  {
    const x = 145, pz = -42;
    U(50, 12, 1, x, 0, -59.5, P.sky, { mat: "concrete" });
    U(1, 12, 34, 120.5, 0, -42, P.sky, { mat: "concrete" });
    U(1, 12, 34, 169.5, 0, -42, P.sky, { mat: "concrete" });
    for (const px of [121.5, 137, 153, 168.5]) U(1.5, 12, 1.5, px, 0, -24.75, P.white);
    U(52, 1, 38, x, 12, pz, P.blue);
    const fascia = U(50, 2.5, 0.6, x, 9.5, -23.7, P.white);
    z.label(fascia, "CATFORD FISH MARKET", { face: "back", color: "#1e50a0" });
    B(50, 0.3, 0.3, x, 9.2, -23.3, P.neonPink, D({ neon: true }));
    const stripes = [P.red, P.white, P.blue];
    [130, 145, 160].forEach((sx, i) => {
      U(10, 3.2, 1.5, sx, 0, -33, P.wood, { mat: "wood" });
      U(10, 3, 5, sx, 0, -38.5, P.glass, { mat: "glass" });
      WEDGE(11, 1.5, 4, sx, 8, -32, stripes[i], { ry: 180 });
      if (i !== 1) {
        for (let j = -1; j <= 1; j++) {
          const fishC = [P.steel, P.orange, P.white][j + 1];
          ELL(2.4, 0.6, 0.9, sx + j * 3, 3.3, -38.5 + j * 0.8, fishC, D());
        }
      }
    });
    ELL(2.4, 0.6, 0.9, 141, 3.3, -37.5, P.steel, D());
    ELL(2.4, 0.6, 0.9, 149, 3.3, -39.8, P.orange, D());
    B(6, 0.5, 2, x, 11.2, -40, P.warm, D({ neon: true, light: lamp(30, 1.5, "#dcf0ff") }));
    z.cat(20, cf(145, 3, -38.5, 180));
    // climb on the east side: crate (4) -> tall crate (7.5) -> barrel (10) -> roof (13)
    U(4, 4, 4, 173, 0, -28, P.plank, { mat: "wood" });
    U(4, 7.5, 4, 173, 0, -34, P.wood, { mat: "wood" });
    CYL(10, 3.5, 173, 5, -40, P.wood, { mat: "wood" });
    // the BIGGEST FISH in town, with the Lost & Found key in its mouth
    CYL(4, 0.6, 144, 15, -45, P.dark, D({ mat: "metal" }));
    CYL(4, 0.6, 152, 15, -45, P.dark, D({ mat: "metal" }));
    ELL(18, 7, 3, 148, 20, -45, "#ff826e", D({ neon: true, light: lamp(25, 1.4, "#ff9682") }));
    WEDGE(1, 4, 4, 158.5, 21.6, -45, P.red, D({ ry: 90, rot: K.rot(30, 0, 0) }));
    WEDGE(1, 4, 4, 158.5, 18.4, -45, P.red, D({ ry: 90, rot: K.rot(-30, 0, 0) }));
    BALL(1.6, 142, 21.2, -46.4, P.white, D());
    BALL(0.8, 141.9, 21.2, -46.9, P.wood, D({ mat: "wood" }));
    const key = B(2.4, 0.35, 0.35, 138.6, 19.2, -45, P.warm, { neon: true, collide: false });
    CYL(0.25, 1.2, 140.2, 19.2, -45, P.warm, D({ neon: true, rot: K.rot(90, 0, 0) }));
    B(0.3, 0.6, 0.3, 137.7, 18.85, -45, P.warm, D({ neon: true }));
    z.prompt(key, "Take the key", () => {
      if (z.flag("lfkey")) return z.notify("You already have the Lost & Found key.");
      z.flag("lfkey", true);
      z.tone(1.6);
      z.notify("You got the LOST & FOUND KEY! (it smells like salmon)");
    }, { distance: 9 });
    z.prompt(lfBell, "Ring the bell", () => {
      if (z.has(27) || z.isUnlocked(27)) return z.notify("The kiosk is already open for you.");
      if (z.flag("lfkey")) {
        z.unlock(27);
        z.sound("action_get_up.mp3");
        z.notify("*click* The Lost & Found cage pops open!");
      } else {
        z.tone(2.2);
        z.fail("Ding! Nobody comes. The door is locked and you have no key.");
      }
    }, { distance: 10 });
  }

  // ------------------------------------------------------------------------------ NE: hotel + fire station
  {
    U(50, 46, 40, 145, 0, -165, P.peach, { mat: "brick" });
    windows(145, -145, 1, 50, 46, 0);
    windows(145, -185, -1, 50, 46, 0);
    sign(34, 5, 145, 40, -144.7, 180, "HOTEL CATIFORNIA", "#28143c", "#ff78dc");
    B(51, 0.5, 41, 145, 46.3, -165, P.neonPink, D({ neon: true }));
    U(8, 8, 0.4, 145, 0, -144.8, P.warm, D({ neon: true }));
    U(40, 16, 35, 50, 0, -167.5, P.brick, { mat: "brick" });
    for (const gx of [38, 50, 62]) U(9, 10, 0.4, gx, 0, -149.9, P.steel, D({ mat: "metal" }));
    sign(30, 3, 50, 13, -149.7, 180, "CATFORD FIRE DEPT. (we mostly get cats down from trees)", "#ffffff", "#b41e1e");
    BALL(1.2, 50, 16.8, -152, P.red, D({ neon: true, dyn: true }));
    tree(100, -130);
    tree(15, -135, 0.9);
    tree(105, -175);
  }

  // ------------------------------------------------------------------------------ SW: Whisker Park (21, 23)
  {
    B(154, 0.12, 6, -91, 0.06, 60, P.tan, { mat: "sand" });
    B(6, 0.12, 177, -40, 0.06, 101.5, P.tan, { mat: "sand" });
    sign(12, 3, -30, 4, 20, 0, "WHISKER PARK\nducks welcome. pool floaties EXTRA welcome.", "#3c783c", "#ffffe6", { both: true });
    U(0.5, 2.5, 0.5, -30, 0, 20, P.wood, { mat: "wood" });
    // playground
    const px = -138, ppz = 85;
    B(50, 0.2, 30, -135, 0.1, 85, P.tan, { mat: "sand" });
    U(8, 1, 8, px, 7, ppz, P.orange);
    for (const sx of [-3.6, 3.6]) for (const sz of [-3.6, 3.6]) U(0.8, 15, 0.8, px + sx, 0, ppz + sz, P.blue);
    pitched(px, ppz, 8, 8, 15, 3, P.roofRed);
    // the original's ladder: three yellow steps up the west side (tops 2, 4, 6 -> deck 8)
    U(2.5, 2, 3, -148.75, 0, ppz, P.yellow);
    U(2.5, 4, 3, -146.25, 0, ppz, P.yellow);
    U(2.5, 6, 3, -143.75, 0, ppz, P.yellow);
    WEDGE(3, 8, 14, px + 11, 4, ppz, P.yellow, { ry: -90 });
    B(14.5, 0.4, 0.3, px + 11, 4.5, ppz - 1.6, P.orange, D({ rot: K.angles(0, 0, Math.atan(-8 / 14)) }));
    B(14.5, 0.4, 0.3, px + 11, 4.5, ppz + 1.6, P.orange, D({ rot: K.angles(0, 0, Math.atan(-8 / 14)) }));
    sign(6, 2, px - 8, 3, ppz + 6, 90, "PLAY TOWER. Ages 3-9. (and cats)", "#ffffe6", "#3c3ca0");
    // swings
    for (const sz of [73, 97]) U(0.6, 10, 0.6, -155, 0, sz, P.red);
    B(0.6, 0.6, 24.6, -155, 10, 85, P.red);
    for (const sz of [80, 90]) {
      U(1.2, 0.3, 2.2, -155, 2.2, sz, P.dark, { mat: "metal" });
      B(0.1, 7.5, 0.1, -155, 6.2, sz - 0.9, P.steel, D({ mat: "metal" }));
      B(0.1, 7.5, 0.1, -155, 6.2, sz + 0.9, P.steel, D({ mat: "metal" }));
    }
    // seesaw
    CYL(1.5, 1.2, -118, 0.75, 72, P.concrete, { mat: "concrete" });
    B(12, 0.4, 1.4, -118, 1.7, 72, P.yellow, { rot: K.rot(0, 0, 10) });
    z.cat(21, cf(px, 8, ppz, 180));
    // pond + bridge
    const ox = -80, oz = 130;
    CYL(0.3, 56, ox, 0.0, oz, P.concrete, { mat: "concrete" });
    CYL(0.3, 52, ox, 0.06, oz, P.water);
    B(30, 0.8, 7, ox, 7.1, oz, P.plank, { mat: "wood" });
    WEDGE(7, 7.5, 16, ox - 23, 3.75, oz, P.plank, { ry: 90, mat: "wood" });
    WEDGE(7, 7.5, 16, ox + 23, 3.75, oz, P.plank, { ry: -90, mat: "wood" });
    for (const sz of [-3.3, 3.3]) {
      B(30, 0.4, 0.4, ox, 9.8, oz + sz, P.wood, { mat: "wood" });
      for (const rx of [-14, 0, 14]) U(0.4, 2.4, 0.4, ox + rx, 7.5, oz + sz, P.wood, D({ mat: "wood" }));
    }
    [[-95, 118], [-66, 145], [-98, 142], [-62, 116]].forEach(([lx, lz], i) => CYL(0.1, 2.5 + ((i + 1) % 2), lx, 0.25, lz, P.leaf, D({ mat: "metal" })));
    BALL(1.2, -70, 0.8, 142, P.white, D());
    BALL(1.2, -92, 0.8, 117, P.wood, D({ mat: "wood" }));
    sign(7, 2.5, -80, 2.5, 101, 0, "Whisker Pond. Shallow enough to walk on (it's a cartoon).", "#ffffeb", "#1e5096", { both: true });
    z.cat(23, cf(ox, 0.21, oz, 180));
    // trees + benches
    for (const [tx, tz] of [[-160, 30], [-120, 30], [-70, 30], [-25, 45], [-160, 125], [-150, 160], [-120, 180],
      [-30, 130], [-25, 175], [-60, 180], [-110, 160], [-115, 40], [-60, 75]]) {
      tree(tx, tz, 0.9 + (((tx % 3) + 3) % 3) * 0.1);
    }
    bench(-80, 66, 0);
    bench(-50, 105, 90);
    bench(-130, 54, 0);
    // statue fountain
    CYL(1.2, 8, -60, 0.6, 45, P.concrete, { mat: "concrete" });
    CYL(0.2, 6.8, -60, 1.2, 45, P.water, D());
    BALL(2.6, -60, 2.8, 45, P.white);
    BALL(1.8, -60, 4.6, 44.4, P.white);
  }

  // ------------------------------------------------------------------------------ SE: road works (16)
  {
    const barrierC = [P.orange, P.white];
    for (let i = 0; i <= 3; i++) {
      B(10, 1.2, 0.5, 25 + i * 10, 1.8, 52.5, barrierC[(i + 1) % 2]);
      B(0.5, 1.2, 7.5, 60.5, 1.8, 26 + i * 7.5, barrierC[(i + 1) % 2]);
    }
    for (let i = 0; i <= 1; i++) B(10, 1.2, 0.5, 45 + i * 10, 1.8, 22, barrierC[(i + 1) % 2]);
    for (const [cx, cz] of [[22, 24], [26, 24], [30, 24], [34, 24], [38, 24], [22, 30], [22, 36]]) cone(cx, cz);
    U(3, 3, 3, 37, 0, 42, P.plank, { mat: "wood" });
    U(3, 6.5, 3, 41, 0, 39, P.wood, { mat: "wood" });
    U(6, 0.6, 6, 47, 9.4, 37, P.steel, { mat: "metal" });
    for (const sx of [-2.8, 2.8]) for (const sz of [-2.8, 2.8]) U(0.4, 9.4, 0.4, 47 + sx, 0, 37 + sz, P.dark, { mat: "metal" });
    B(6, 0.3, 0.3, 47, 11.2, 34.2, P.yellow, D());
    sign(9, 4, 30, 4, 21.6, 0, "ROAD WORKS\nCONE-STRUCTION ZONE\nOur best cone supervises from the top.", "#ffd228", "#281e00");
    // digger
    U(7, 4, 5, 32, 1.5, 44, P.yellow);
    U(3.5, 3.5, 4, 30.5, 5.5, 44, P.glass, { mat: "glass" });
    U(8, 1.5, 1.4, 32, 0, 41.8, P.dark, { mat: "metal" });
    U(8, 1.5, 1.4, 32, 0, 46.2, P.dark, { mat: "metal" });
    B(8, 0.8, 0.8, 38, 7, 44, P.yellow, { rot: K.rot(0, 0, 25) });
    B(2, 2, 2.4, 42, 8.5, 44, P.dark, D({ mat: "metal" }));
    z.cat(16, cf(47, 10, 37, 180));
  }

  // ------------------------------------------------------------------------------ SE: Meowy's Diner + Bin Alley (19)
  {
    U(28, 12, 28, 84, 0, 36, P.white);
    B(28.4, 1.2, 28.4, 84, 4, 36, P.red, D());
    B(24, 3.5, 0.2, 84, 7.5, 21.88, P.warm, D({ neon: true }));
    sign(20, 4, 84, 14, 21.6, 0, "MEOWY'S DINER", "#ff5aa0", "#ffffff");
    B(20.6, 0.4, 0.4, 84, 11.8, 21.6, P.neonPink, D({ neon: true }));
    U(40, 30, 42, 134, 0, 43, P.peach, { mat: "brick" });
    windows(134, 22, -1, 40, 30, 0);
    const graffiti = B(0.2, 4, 10, 113.85, 4, 50, P.peach, D({ mat: "brick" }));
    z.label(graffiti, "binjamin was here", { face: "left", color: "#5adc5a" });
    B(16, 0.12, 42, 106, 0.06, 43, P.asphalt, { mat: "concrete" });
    sign(16, 2.5, 106, 9, 21.5, 0, "BIN ALLEY. Bin day: Thursday. Today: Thursday. Something in here smells EXTRA fishy...", "#ffffe6", "#3c281e", { both: true });
    const bins = [[101.5, 28], [110.5, 36], [101.5, 44], [110.5, 52], [101.5, 60]];
    const msgs = [
      "Just a banana peel and some regret.",
      "An empty pizza box. Smells like pizza, not cat.",
      "A single odd sock. Someone at the Lost & Found would love this.",
      null,
      "Seventeen fish bones and zero cats. Wrong bin!",
    ];
    bins.forEach(([bx, bz], i) => {
      const body = CYL(4, 3, bx, 2, bz, P.leaf, { mat: "metal" });
      const lid = CYL(0.4, 3.4, bx, 4.2, bz, P.leaf, { mat: "metal" });
      const open = () => {
        if (i === 3) {
          z.reveal(19);
          z.sound("action_get_up.mp3");
          z.notify("The lid rattles... something in here says MEOW!");
        } else {
          z.sound("action_footsteps_plastic.mp3");
          z.notify(msgs[i]);
        }
      };
      z.click(body, open, { distance: 14 });
      z.click(lid, open, { distance: 14 });
    });
    for (let j = -1; j <= 1; j++) {
      const s = B(0.25, 2, 0.25, 110.5 + j * 0.9, 6.2, 52, P.sludge, D({ neon: true }));
      z.tag(s, "Bob", { Amp: 0.5, Period: 1.2 + j * 0.2 });
    }
    B(1.6, 0.12, 0.12, 110.5, 4.5, 50.3, P.white, D());
    z.cat(19, cf(110.5, 4.4, 52, 180), { hidden: true });
  }

  // ------------------------------------------------------------------------------ SE: other buildings
  {
    U(30, 12, 25, 45, 0, 102.5, P.peach, { mat: "brick" });
    pitched(45, 102.5, 30, 25, 12, 5, P.roofRed);
    windows(45, 90, -1, 30, 12, 0);
    U(30, 14, 30, 45, 0, 155, P.sky, { mat: "concrete" });
    sign(18, 3, 45, 11, 139.75, 0, "CATFORD POST OFFICE", "#3c5ac8", "#ffffff");
    windows(45, 140, -1, 30, 14, 0);
    U(45, 16, 20, 157.5, 0, 88, P.peach, { mat: "brick" });
    sign(24, 3, 157.5, 13, 77.75, 0, "PUBLIC LIBRARY (shh... the cats are napping)", "#5a3c28", "#fff0c8");
    windows(157.5, 78, -1, 45, 16, 0);
    for (const [tx, tz] of [[20, 75], [75, 80], [20, 130], [80, 120], [75, 175], [125, 185], [185, 120], [185, 160], [180, 40]]) tree(tx, tz);
    // hydrants
    for (const [hx, hz] of [[-70, -14], [40, 14], [120, -14], [-120, 14]]) {
      CYL(2, 1, hx, 1, hz, P.orange);
      BALL(1, hx, 2.1, hz, P.orange);
    }
  }

  // ------------------------------------------------------------------------------ SE: the manhole + THE SEWERS (28)
  {
    for (const [cx, cz] of [[HX - 5, HZ - 5], [HX + 5, HZ - 5], [HX - 5, HZ + 5], [HX + 5, HZ + 5]]) cone(cx, cz);
    CYL(0.3, 5, HX + 8, 0.15, HZ - 2, P.dark, { mat: "metal" });
    sign(9, 4.5, HX, 5, HZ - 9, 0, "SEWER. DO NOT ENTER.\nSmells like fish AND alligator.\nWorkers' tip: keep your LEFT paw on the wall and you will never get lost.", "#ffdc28", "#281e00", { both: true });
    U(0.5, 2.8, 0.5, HX, 0, HZ - 9, P.dark, { mat: "metal" });
    B(4, 0.12, 76, HX, 0.06, 102, P.tan, D({ mat: "sand" }));

    B(94, 1, 80, 137, FLOOR - 0.5, 145, P.sewerFloor, { mat: "concrete" });
    // entry corridor (x 90..110, z HZ-4.5..HZ+4.5) under the manhole
    U(20, CEIL - FLOOR, 1, 100, FLOOR, HZ - 5, P.sewerWall, { mat: "concrete" });
    U(20, CEIL - FLOOR, 1, 100, FLOOR, HZ + 5, P.sewerWall, { mat: "concrete" });
    U(1, CEIL - FLOOR, 9, 90.5, FLOOR, HZ, P.sewerWall, { mat: "concrete" });
    // the ladder: the engine cannot climb, so its two ends are prompts (bottom = up, top = down).
    // It hangs on the north lip of the hole so it does not stand between the corridor and its sign.
    const LZ = HZ - 2.6;
    U(2, CEIL - FLOOR - 6, 0.4, HX, FLOOR + 6, LZ, P.steel, D({ mat: "metal" }));
    const ladderLow = U(2, 6, 0.6, HX, FLOOR, LZ, P.steel, { mat: "metal", collide: false });
    const ladderTop = U(2, 4.5, 0.6, HX, CEIL, LZ, P.steel, { mat: "metal", collide: false });
    for (let y = FLOOR + 1; y < 2; y += 1.5) B(2.4, 0.2, 0.8, HX, y, LZ, P.dark, D({ mat: "metal" }));
    z.prompt(ladderLow, "Climb up the ladder", () => z.player.teleport([HX - 7, 0.3, HZ], -90), { distance: 5 });
    z.prompt(ladderTop, "Climb down the ladder", () => z.player.teleport([95, FLOOR + 0.3, HZ], 90), { distance: 5 });
    const sludge = B(3, 0.4, 9, 106, FLOOR + 0.2, HZ, P.sludge, { neon: true, light: lamp(14, 1.6, "#78ff3c") });
    // QA: sludge sends you back to the bottom of the ladder (not 285 studs away to the zone spawn)
    z.touch(sludge, () => {
      z.player.teleport([95, FLOOR + 0.3, HZ], 90);
      z.sound("oof.ogg", { volume: 0.5 });
      z.fail("EW, SLUDGE! Back to the ladder. Jump over the green strip!");
    }, { cooldown: 1 });
    sign(6, 4, 91.2, FLOOR + 5, HZ, -90, "THE SEWERS\nGatorbert lives in the very MIDDLE.\nLeft paw on the wall, always.\nDO NOT touch the green sludge.", "#28322d", "#c8ffb4");

    // 7x7 maze. '#' = wall, '.' = open. Odd rows/cols are cells, even ones are walls/posts.
    const MAZE = [
      "###############",
      "#...........#.#",
      "#.#########.#.#",
      "#.#.....#.#...#",
      "#.#.###.#.###.#",
      "#.#...#...#...#",
      "#.###.###.#.###",
      "..#...#...#...#",
      "###.#.#######.#",
      "#...#.#.....#.#",
      "#.#.###.#.###.#",
      "#.#.#...#...#.#",
      "#.###.#####.#.#",
      "#.........#...#",
      "###############",
    ];
    const span = (i, o) => [o + Math.floor(i / 2) * 10 + (i % 2 === 1 ? 1 : 0), i % 2 === 0 ? 1 : 9];
    const cell = (r, c) => MAZE[r].charAt(c);
    for (let r = 0; r <= 14; r++) {
      const [zs, zw] = span(r, MZ);
      let c = 0;
      while (c <= 14) {
        if (cell(r, c) === "#") {
          let c2 = c;
          while (c2 + 1 <= 14 && cell(r, c2 + 1) === "#") c2++;
          const [xs] = span(c, MX);
          const [xe0, xw] = span(c2, MX);
          const xe = xe0 + xw;
          U(xe - xs, CEIL - FLOOR, zw, (xs + xe) / 2, FLOOR, zs + zw / 2, P.sewerWall, { mat: "concrete" });
          c = c2 + 1;
        } else {
          c++;
        }
      }
    }
    // sewer lamps (three of them really light up) + sludge streaks
    [[0, 0], [0, 6], [6, 6], [6, 0], [2, 3], [4, 5]].forEach(([r, c], i) => {
      B(1.2, 0.4, 1.2, cellC(c, MX), CEIL - 0.3, cellC(r, MZ), P.warm, D({ neon: true, light: i < 3 ? lamp(22, 1.4, "#ffbe6e") : undefined }));
    });
    for (const [r, c] of [[1, 1], [5, 2], [3, 5], [0, 4]]) B(3, 0.06, 7, cellC(c, MX), FLOOR + 0.04, cellC(r, MZ), P.sludge, D({ neon: true, tr: 0.35 }));
    // cardboard "lol no" rats in dead ends
    let fakes = 0;
    for (let r = 0; r <= 6; r++) {
      for (let c = 0; c <= 6; c++) {
        let open = 0;
        for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) if (cell(2 * r + 1 + dr, 2 * c + 1 + dc) === ".") open++;
        if (open === 1 && !(r === 3 && (c === 0 || c === 3)) && fakes < 4) {
          fakes++;
          const fx = cellC(c, MX), fz = cellC(r, MZ);
          const cut = U(3, 3, 0.3, fx, FLOOR, fz, P.plank, { mat: "wood" });
          z.label(cut, "lol no.\nit's a rat.", { both: true, color: "#3c1e0a" });
          WEDGE(0.3, 1, 0.7, fx - 0.9, FLOOR + 3.5, fz, P.plank, D({ ry: 90, mat: "wood" }));
          WEDGE(0.3, 1, 0.7, fx + 0.9, FLOOR + 3.5, fz, P.plank, D({ ry: -90, mat: "wood" }));
          z.click(cut, () => {
            z.sound("ouch.ogg");
            z.notify("It's a cardboard rat wearing cat ears. Rude.");
          });
        }
      }
    }
    z.cat(28, cf(cellC(3, MX), FLOOR, cellC(3, MZ), 90), { scale: 0.9 });
  }
}

function lum(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}
