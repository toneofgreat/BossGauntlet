/*
	Zone 3: HAUNTED LITTERBOX MANOR (cats 29..42)   OWNER: zone 3 agent
	Zone-local coords: x east, z south, ground top y = 0. Spawn (-185, 0, 0) on the west edge.

	MAP
	  Path runs east from spawn through the gate (x -148) up two terraces to the manor front door (x 0, z 0).
	  Hedge maze north-west (x -165..-55, z -165..-45), graveyard south-west (x -150..-40, z 35..150),
	  giant litterbox landmark (-35, -30), pumpkin patch behind the manor (x 20..80, z 85..135),
	  witch tower far north-east (150, -130).
	  Manor x 0..100, z -45..45. Floor 1 top y 6, floor 2 top y 25, attic floor top y 41, basement floor y -14.
	    Floor 1: foyer (0..35, -15..15) with the carpet ramp up to floor 2, music room (0..35, -45..-15),
	             dining room (0..35, 15..45), library (35..75, -45..10, double height), kitchen (35..75, 10..45),
	             back hall (75..100, -20..45, ramp down to the basement), SECRET room (75..100, -45..-20, sealed).
	    Floor 2: landing, portrait gallery (0..35, -45..-15), bedroom (0..35, 15..45), upstairs hall (rest,
	             ladder to the attic at (88, 30)).
	    OofWorld port: the engine has no climbing, so the attic ladder is a wooden STAIR RAMP at x 88 rising
	    north to south from (88, 25, 4.5) to (88, 41, 24.5) through a hatch in the attic floor
	    (x 85.5..90.5, z 14.5..24.5).

	SOLUTIONS
	29 Boo-ford (Hard): climb the 9 floating ghost gravestones spiralling around the big dead tree in the
	   graveyard (-62, 125) to the treehouse platform at y 29.5. No kill parts.
	30 Mr. Calcium (Hard): the Bone Key is on the roof of the groundskeeper's shed (-142, 100): climb
	   crate -> barrel -> roof, take the key (prompt), walk into the crypt (-110, 128) and use the key on the
	   coffin lock (prompt) -> cage opens.
	31 Count Catula (Hard): yeet (click) all 5 garlic breads: dining table, fireplace mantel, top of the china
	   cabinet (climb side table -> cabinet), on the dining chandelier ring, and inside the kitchen oven.
	32 Sir Squashington (Hard): click the 5 pumpkins in the patch from smallest to biggest
	   (sizes 2.5, 3.5, 4.5, 5.5, 6.5 = positions (42,108) (66,110) (30,95) (76,96) (56,92)).
	33 cursed_cat.jpg (Hard): in the library, jump up the 7 giant floating books along the north shelves to
	   the balcony in the north-east corner (y 26). No kill parts.
	34 Meowmy (Intense): basement (ramp in the back hall). Jump 9 sarcophagus-lid platforms over the green
	   kill slime (avoid the slime geysers beside the path) to the dais at the west end.
	35 Brewster (Intense): witch tower. Climb onto the basin rim, cross 2 stepping stones over the kill slime
	   moat to the island, then 13 spiral platforms around the tower (falling = slime) to the top balcony.
	36 Zom-Bean (Intense): the rules plaque is inside the crypt: only graves with a FISH carved on top, last
	   digit of the DEATH year, read west to east. Fish graves: TOFU 1849-1867 (x -125), BEANS 1880-1912
	   (x -85), SPROUT 1780-1795 (x -65), WAFFLES 1870-1888 (x -45)  ->  code 7258 at the grave keypad
	   (-85, 104). Wrong code = 10 s lockout.
	37 Great-Grandma Whiskerella (Intense): gallery portraits (name + birth year): Earl Grey Fuzzleton 1820,
	   Sardine the Second 1755, Marmalade the Magnificent 1611, Uncle Whiskerbottom 1703, Ophelia
	   Fluffington 1648 (west wall). Eldest first: M O U S E -> say "MOUSE" at the lectern -> she appears in
	   the empty frame. Wrong word = 10 s lockout.
	38 Barkley (Intense): the note in the bedroom: digit 1..4 = LIT candles in the foyer, library, dining
	   room, bedroom. Lit: foyer 3 (2 on the console by the door, 1 on the ramp post), library 7 (3 on the
	   reading table, 2 wall sconces, 1 on top of the secret shelf, 1 on the balcony), dining 4 (2 on the
	   chandelier, 1 on the table, 1 on the mantel), bedroom 6 (2 nightstands, 3 on the dresser, 1 on the
	   windowsill). Unlit decoys don't count. Code 3746 (computed from the real candles at build time) at the
	   moon lock. Wrong = 10 s lockout.
	39 Phantom (Intense): music room organ. The sheet music shows 5 bars (bar height = note pitch rank 1..6):
	   3, 5, 6, 5, 1. The 6 keys (west -> east, K1..K6) are scrambled: their pitch ranks are 4, 1, 6, 2, 5, 3
	   (play a key and watch the Tone-O-Meter height, or listen). So play K6, K5, K3, K5, K2.
	   The attic music box also plays the song.
	40 Batticus (Intense): attic (stairs at x 88 upstairs). Floor between x 12 and 78 is purple kill goo;
	   jump 8 rafters/posts west to the safe floor at x < 12 where he hangs. Avoid the hanging kill orbs.
	41 Sir Purrcival (Intense): get his head from the pedestal at the centre of the hedge maze (prompt),
	   jumping over the low thorn hedges (kill) on the way, and bring it to his pedestal (-100, -33) WITHOUT
	   dying or respawning in between (a respawn drops the head) -> prompt "Give back his head".
	42 Litterbox Lich (Intense): 3 lost pages: kitchen fridge = FIRST book is the colour of the slime under
	   the house (basement slime = GREEN "Slime Recipes"); basement = SECOND is the TALLEST book (purple
	   "The Big Book of Naps"); attic = LAST is about what a skeleton is made of ("Bones & You", white).
	   Click those books on the Shelf of Secrets (library east wall) in that order -> the shelf spins you
	   into the secret room. Then a short pillar obby over kill slime to the throne. Wrong book = 6 s lockout.

	JUMP CHECKS (OofWorld §5: gravity 196.2, jump 50 -> apex 6.37, flat reach at walk 16 = 8.15 studs;
	reach at rise h = 16 * (50 + sqrt(2500 - 392.4 h)) / 196.2):
	  29 ghost stones: rise 3, edge gap <= 3.5 (reach at +3 = 7.0). Treehouse: rise 2.5, gap < 4.
	  30 crate 3 -> barrel 5.5 -> roof 8.6: rises 2.5 and 3.1, gaps <= 0.5.
	  33 books: rise 2.5 each, worst edge gap 3.3 (reach at +2.5 = 7.3); last book -> balcony gap 0.25.
	  34 lids: rise <= 1, worst corner gap 5.35 (reach at +1 = 7.8); last lid -> dais gap 5.5 at +1.
	  35 rim -> stones -> island gaps <= 2.5; spiral steps rise 3, edge gap <= 4.3 (reach 7.0); balcony +3.
	  40 rafters: worst is post 4 -> beam 5, 7.1 diagonal at -0.5 (reach 8.3); beam 5 widened to 1.6 (was
	     1.2) for the capsule. Last post -> safe floor 7.2 at -3 (reach 9.0). Head room under the roof >= 2.
	  41 thorns 1.6 tall, 1.2 thick: feet above 1.7 for 7.0 studs of a running jump (needs 3.4).
	  42 pillars: every gap <= 3.8 at rise <= 1; last pillar -> dais 5.2 at +0.5. Ceiling 24 vs head 22.9.
	  The library (y 39 ceiling), basement (y 5) and secret room (y 24) never cut a needed apex.
*/

// ============================================================================================ looks

function triEar(K, m, base, w, h, t, col) {
  K.wedge(m, K.v(t, h, w / 2), K.mul(base, K.cf(w / 4, h / 2, 0), K.angles(0, -Math.PI / 2, 0)), col, { name: "Ear" });
  K.wedge(m, K.v(t, h, w / 2), K.mul(base, K.cf(-w / 4, h / 2, 0), K.angles(0, Math.PI / 2, 0)), col, { name: "Ear" });
}
const eachPrim = (m, fn) => { for (const p of m.prims.slice()) fn(p); };
const dropPrims = (m, pred) => { m.prims = m.prims.filter((p) => !pred(p)); };
const yOf = (p) => p.cf.elements[13];

export const looks = {
  // 29 Boo-ford the Bashful: a see-through bedsheet ghost cat with a tiny lantern
  29: (K) => {
    const V = K.v;
    const ghost = K.rgb(220, 238, 255);
    const c = K.cat({
      color: ghost, material: "Glass", bodyShape: "round", legs: false, tail: "curly", eyes: "big", mouth: "o",
      eyeColor: K.rgb(30, 50, 110), innerEarColor: K.rgb(170, 210, 255), noseColor: K.rgb(160, 190, 255), whiskers: false,
    });
    const m = c.model;
    const b = c.attach("body");
    for (let i = 0; i <= 5; i++) {
      const a = (i / 6) * Math.PI * 2;
      K.ball(m, V(0.95, 1.4, 0.95), K.mul(b, K.cf(Math.sin(a) * 1.05, -1.35, Math.cos(a) * 1.05)), ghost, { name: "Wisp", material: "Glass" });
    }
    const hold = c.attach("chest", V(0.9, -0.1, -0.5));
    const hp = K.p(hold);
    K.limb(m, hp, K.add(hp, V(0, -0.8, -0.3)), 0.08, K.C.dark, { name: "Handle" });
    const lan = K.mul(hold, K.cf(0, -1.3, -0.3));
    K.block(m, V(0.6, 0.15, 0.6), K.mul(lan, K.cf(0, 0.32, 0)), K.C.dark, { name: "LanternCap" });
    K.block(m, V(0.6, 0.15, 0.6), K.mul(lan, K.cf(0, -0.32, 0)), K.C.dark, { name: "LanternCap" });
    K.ball(m, 0.5, lan, K.rgb(140, 230, 255), { name: "LanternGlow", neon: true });
    const ghosty = new Set(["Body", "Head", "Ear", "Tail", "Wisp"]);
    eachPrim(m, (p) => { if (ghosty.has(p.name)) p.transparency = 0.3; });
    return K.finish(m);
  },

  // 30 Mr. Calcium: no cat, just the bones
  30: (K) => {
    const V = K.v;
    const bone = K.rgb(240, 234, 214);
    const m = K.model("Skeleton");
    const skull = V(0, 3.1, -1.7);
    K.ball(m, V(1.7, 1.55, 1.8), skull, bone, { name: "Skull" });
    for (const s of [-1, 1]) {
      K.ball(m, V(0.5, 0.55, 0.3), K.add(skull, V(s * 0.36, 0.1, -0.76)), K.C.black, { name: "Socket" });
      triEar(K, m, K.mul(K.cf(K.add(skull, V(s * 0.48, 0.5, 0))), K.rot(0, 0, -s * 18)), 0.8, 0.8, 0.18, bone);
    }
    K.ball(m, V(0.22, 0.18, 0.15), K.add(skull, V(0, -0.18, -0.86)), K.C.black, { name: "NoseHole" });
    K.block(m, V(0.95, 0.22, 0.8), K.mul(K.cf(K.add(skull, V(0, -0.72, -0.35))), K.rot(-12, 0, 0)), bone, { name: "Jaw" });
    for (let i = -1; i <= 1; i++) K.block(m, V(0.12, 0.16, 0.08), K.add(skull, V(i * 0.18, -0.55, -0.74)), K.C.white, { name: "Tooth" });
    const a = V(0, 2.3, -0.8), b = V(0, 2.25, 1.7);
    K.limb(m, K.add(skull, V(0, -0.6, 0.5)), a, 0.28, bone, { name: "Neck" });
    K.limb(m, a, b, 0.26, bone, { name: "Spine" });
    for (let i = 0; i <= 2; i++) K.ball(m, 0.42, a.clone().lerp(b, i / 2), bone, { name: "Vertebra" });
    for (let i = 1; i <= 4; i++) {
      const z = -0.6 + i * 0.45;
      for (const s of [-1, 1]) {
        const top = V(0, 2.25, z), mid = V(s * 0.85, 1.75, z), low = V(s * 0.45, 1.2, z - 0.05);
        K.limb(m, top, mid, 0.14, bone, { name: "Rib" });
        K.limb(m, mid, low, 0.12, bone, { name: "Rib" });
      }
    }
    K.block(m, V(1.1, 0.35, 0.55), V(0, 2.1, 1.75), bone, { name: "Body" });
    for (const lz of [-0.55, 1.75]) {
      for (const s of [-1, 1]) {
        const hip = V(s * 0.5, 2.05, lz);
        const knee = V(s * 0.55, 1.05, lz + (lz < 0 ? -0.15 : 0.2));
        const foot = V(s * 0.55, 0.12, lz - 0.1);
        K.limb(m, hip, knee, 0.2, bone, { name: "Leg" });
        K.limb(m, knee, foot, 0.17, bone, { name: "Leg" });
        K.ball(m, 0.3, knee, bone, { name: "Joint" });
        K.ball(m, V(0.38, 0.2, 0.5), K.add(foot, V(0, 0, -0.15)), bone, { name: "Paw" });
      }
    }
    const tail = [V(0, 2.3, 2.05), V(0, 2.7, 2.35), V(0, 3.1, 2.45), V(0, 3.5, 2.35), V(0, 3.82, 2.12)];
    tail.forEach((p, i) => K.ball(m, 0.38 - (i + 1) * 0.04, p, bone, { name: "TailBone" }));
    return K.finish(m);
  },

  // 31 Count Catula: vampire tuxedo cat, cape, fangs, sweat drop, and his nemesis on the floor
  31: (K) => {
    const V = K.v;
    const cape = K.rgb(20, 14, 26);
    const c = K.cat({
      color: K.rgb(80, 72, 100), pattern: "tuxedo", color2: K.rgb(235, 235, 245), eyes: "big",
      eyeColor: K.rgb(210, 0, 30), mouth: "teeth", innerEarColor: K.rgb(170, 40, 70),
    });
    const m = c.model;
    K.acc.cape(c, { color: cape, collar: K.rgb(170, 10, 35) });
    const neck = c.attach("neck");
    for (const s of [-1, 1]) {
      K.block(m, V(0.12, 1.2, 0.9), K.mul(neck, K.cf(s * 0.75, 0.45, 0.25), K.rot(0, s * 25, -s * 12)), cape, { name: "Collar" });
    }
    K.ball(m, V(1.5, 0.5, 1.6), c.attach("headTop", V(0, -0.18, 0.08)), K.C.black, { name: "Hair" });
    K.ball(m, 0.36, c.attach("neck", V(0, -0.35, -0.45)), K.C.gold, { name: "Medallion", material: "Foil" });
    K.ball(m, 0.16, c.attach("neck", V(0, -0.35, -0.62)), K.C.red, { name: "Jewel", neon: true });
    K.ball(m, V(0.25, 0.42, 0.2), c.attach("head", V(-0.95, 0.45, -0.3)), K.rgb(120, 200, 255), { name: "Sweat", neon: true });
    const bread = c.attach("feet", V(0, 0.18, -2.7));
    K.block(m, V(1.2, 0.35, 0.7), bread, K.rgb(225, 170, 90), { name: "GarlicBread" });
    K.block(m, V(1.05, 0.08, 0.55), K.mul(bread, K.cf(0, 0.2, 0)), K.rgb(190, 220, 120), { name: "Butter" });
    return K.finish(m);
  },

  // 32 Sir Squashington: a round pumpkin cat with a glowing jack-o'-lantern face and a vine tail
  32: (K) => {
    const V = K.v;
    const orange = K.rgb(240, 130, 20);
    const vine = K.rgb(80, 140, 50);
    const c = K.cat({
      color: orange, bodyShape: "round", eyes: "angry", eyeWhite: K.rgb(255, 225, 70), eyeColor: K.rgb(255, 130, 0),
      mouth: "teeth", tail: "none", whiskers: false, innerEars: false, earColor: K.rgb(70, 140, 45), noseColor: K.rgb(255, 210, 60),
    });
    const m = c.model;
    eachPrim(m, (p) => {
      if (p.name === "EyeWhite") p.material = "neon";
      else if (p.name === "Mouth") { p.material = "neon"; p.color = K.rgb(255, 200, 40); }
    });
    const dark = K.rgb(205, 100, 10);
    for (const s of [-1, 1]) K.ball(m, V(1.3, 3.04, 3.04), c.attach("body", V(s * 0.85, 0, 0)), dark, { name: "Ridge" });
    K.cyl(m, 0.7, 0.35, K.mul(c.attach("headTop", V(0, 0.3, 0)), K.rot(0, 0, 12)), vine, { name: "Stem" });
    K.ball(m, V(0.9, 0.08, 0.5), K.mul(c.attach("headTop", V(0.45, 0.28, 0)), K.rot(0, 0, -20)), K.rgb(100, 180, 60), { name: "Leaf" });
    const tb = K.p(c.attach("tailBase"));
    const p1 = K.add(tb, V(0.3, 0.6, 0.6));
    const p2 = K.add(p1, V(-0.6, 0.7, 0.3));
    const p3 = K.add(p2, V(0.2, 0.5, -0.4));
    K.limb(m, tb, p1, 0.22, vine, { name: "Vine" });
    K.limb(m, p1, p2, 0.2, vine, { name: "Vine" });
    K.limb(m, p2, p3, 0.18, vine, { name: "Vine" });
    K.ball(m, V(0.8, 0.1, 0.5), K.mul(K.cf(p3), K.rot(0, 30, 15)), K.rgb(100, 180, 60), { name: "Leaf" });
    return K.finish(m);
  },

  // 33 cursed_cat.jpg: a crusty, RGB-shifted photo with one huge eye, one red dot and human teeth
  33: (K) => {
    const V = K.v;
    const m = K.model("CursedImage");
    K.block(m, V(7, 6, 0.25), V(0, 3, 0.1), K.rgb(245, 245, 245), { name: "Body" });
    K.block(m, V(6.4, 5.0, 0.1), V(0, 3.3, -0.05), K.rgb(120, 125, 140), { name: "Backdrop" });
    K.block(m, V(4.2, 2.8, 0.05), V(-0.18, 2.95, -0.09), K.rgb(255, 40, 80), { name: "ShiftRed", transparency: 0.3 });
    K.block(m, V(4.2, 2.8, 0.05), V(0.18, 2.85, -0.09), K.rgb(40, 230, 255), { name: "ShiftCyan", transparency: 0.3 });
    const fur = K.rgb(150, 120, 95);
    K.block(m, V(4.2, 2.8, 0.1), V(0, 2.9, -0.13), fur, { name: "Face" });
    for (const s of [-1, 1]) {
      K.block(m, V(0.7, 0.7, 0.1), V(s * 1.75, 4.65, -0.13), fur, { name: "EarPixel" });
      K.block(m, V(0.7, 0.7, 0.1), V(s * 1.05, 4.65, -0.13), fur, { name: "EarPixel" });
      K.block(m, V(0.7, 0.7, 0.1), V(s * 1.75, 5.3, -0.13), fur, { name: "EarPixel" });
    }
    K.block(m, V(1.5, 1.5, 0.08), V(-1.0, 3.2, -0.2), K.C.white, { name: "BigEye" });
    K.block(m, V(0.3, 0.3, 0.06), V(-0.7, 2.85, -0.25), K.C.black, { name: "BigPupil" });
    K.block(m, V(0.6, 0.6, 0.08), V(1.1, 3.3, -0.2), K.C.white, { name: "SmallEye" });
    K.block(m, V(0.26, 0.26, 0.06), V(1.1, 3.3, -0.25), K.rgb(255, 0, 30), { name: "RedPupil", neon: true });
    K.block(m, V(0.35, 0.3, 0.06), V(0.1, 2.5, -0.2), K.rgb(255, 150, 180), { name: "Nose" });
    K.block(m, V(1.6, 0.5, 0.06), V(0.05, 1.95, -0.2), K.rgb(60, 20, 25), { name: "Mouth" });
    [-0.55, -0.18, 0.18, 0.55].forEach((x, i0) => {
      const i = i0 + 1;
      K.block(m, V(0.32, 0.36 - (i % 2) * 0.06, 0.05), V(x, 2.0, -0.25), K.rgb(250, 245, 225), { name: "Tooth" });
    });
    const crust = [
      [-2.6, 4.9, K.rgb(200, 60, 200)], [2.5, 4.6, K.rgb(90, 200, 90)], [-2.8, 1.5, K.rgb(160, 160, 60)],
      [2.7, 1.3, K.rgb(80, 80, 200)], [-1.9, 1.1, K.rgb(200, 120, 60)], [1.6, 4.0, K.rgb(70, 170, 170)],
      [2.9, 3.2, K.rgb(190, 70, 70)], [-2.9, 3.4, K.rgb(110, 110, 110)],
    ];
    for (const cr of crust) K.block(m, V(0.6, 0.6, 0.05), V(cr[0], cr[1], -0.12), cr[2], { name: "Crust" });
    const strip = K.block(m, V(6.4, 0.6, 0.05), V(0, 0.4, -0.04), K.rgb(250, 250, 250), { name: "FileName" });
    K.text(strip, "cursed_cat.jpg", { color: K.C.black });
    return K.finish(m);
  },

  // 34 Meowmy: a toilet-paper mummy with glowing green eyes and a spare roll
  34: (K) => {
    const V = K.v;
    const wrap = K.rgb(232, 222, 192);
    const wrap2 = K.rgb(205, 193, 160);
    const c = K.cat({
      color: wrap, pattern: "stripes", color2: wrap2, eyes: "big", eyeColor: K.rgb(40, 255, 90), mouth: "frown",
      tail: "long", noseColor: K.rgb(150, 140, 120), innerEarColor: wrap2,
    });
    const m = c.model;
    eachPrim(m, (p) => { if (p.name === "Pupil") p.material = "neon"; });
    const h = c.attach("head");
    K.ball(m, V(c.headD * 1.06, 0.3, c.headD * 1.06), K.mul(h, K.cf(0, 0.45, 0), K.rot(14, 0, 8)), wrap2, { name: "Wrap" });
    K.ball(m, V(c.headD * 1.05, 0.28, c.headD * 1.05), K.mul(h, K.cf(0, -0.4, 0), K.rot(-10, 0, -14)), wrap2, { name: "Wrap" });
    K.block(m, V(0.35, 0.05, 1.6), K.mul(c.attach("tailBase", V(0.4, -0.7, 0.4)), K.rot(-35, 0, 0)), wrap, { name: "LooseWrap" });
    K.block(m, V(0.3, 1.4, 0.05), K.mul(c.attach("frontRightPaw", V(-0.1, 0.9, -0.3)), K.rot(0, 0, 12)), wrap, { name: "LooseWrap" });
    const roll = K.mul(c.attach("frontLeftPaw", V(0.45, 0.4, -0.4)), K.rot(0, 0, 90));
    K.cyl(m, 0.8, 0.8, roll, K.C.white, { name: "ToiletRoll" });
    K.cyl(m, 0.82, 0.3, roll, K.C.tan, { name: "RollCore" });
    return K.finish(m);
  },

  // 35 Brewster: a sleepy black cat in a bubbling cauldron of slime, wearing the witch's hat
  35: (K) => {
    const V = K.v;
    const iron = K.rgb(45, 45, 52);
    const slime = K.rgb(110, 255, 60);
    const black = K.rgb(25, 22, 30);
    const c = K.cat({
      color: K.rgb(40, 36, 48), bodyShape: "round", eyes: "sleepy", eyeColor: K.rgb(255, 200, 40), mouth: "smile",
      tail: "normal", legs: false, innerEarColor: K.rgb(150, 90, 200),
    });
    const m = c.model;
    K.ball(m, V(5.2, 4.2, 5.2), V(0, 0.9, 0.2), iron, { name: "Cauldron", material: "Metal" });
    K.cyl(m, 0.35, 4.4, V(0, 2.75, 0.2), iron, { name: "Rim", material: "Metal" });
    K.cyl(m, 0.12, 4.0, V(0, 2.95, 0.2), slime, { name: "Slime", neon: true });
    for (let i = 0; i <= 2; i++) {
      const a = (i / 3) * Math.PI * 2;
      K.limb(m, V(Math.sin(a) * 1.4, -0.6, 0.2 + Math.cos(a) * 1.4), V(Math.sin(a) * 1.9, -1.6, 0.2 + Math.cos(a) * 1.9), 0.4, iron, { name: "CauldronLeg" });
    }
    for (const s of [-1, 1]) K.ball(m, V(0.5, 0.35, 0.6), V(s * 0.75, 3.0, -1.75), c.spec.color, { name: "Paw" });
    const bub = [V(1.3, 3.05, 0.9), V(-1.2, 3.05, 1.2), V(0.9, 3.05, -1.2), V(-0.5, 3.05, 1.7)];
    bub.forEach((p, i) => K.ball(m, 0.25 + (i + 1) * 0.07, p, slime, { name: "Bubble", neon: true }));
    const top = c.attach("headTop");
    K.cyl(m, 0.1, 2.2, K.mul(top, K.cf(0, 0.05, 0)), black, { name: "HatBrim" });
    K.cyl(m, 0.7, 1.15, K.mul(top, K.cf(0, 0.4, 0)), black, { name: "Hat" });
    K.cyl(m, 0.22, 1.2, K.mul(top, K.cf(0, 0.2, 0)), K.rgb(150, 70, 220), { name: "HatBand" });
    K.cyl(m, 0.7, 0.75, K.mul(top, K.cf(0.1, 1.0, 0.05), K.rot(0, 0, -8)), black, { name: "Hat" });
    K.cyl(m, 0.6, 0.4, K.mul(top, K.cf(0.32, 1.55, 0.1), K.rot(0, 0, -25)), black, { name: "Hat" });
    return K.finish(m);
  },

  // 36 Zom-Bean: green zombie cat, arms straight out, stitches, blue shorts, a bag of treats
  36: (K) => {
    const V = K.v;
    const skin = K.rgb(140, 176, 112);
    const c = K.cat({
      bodyShape: "tall", color: skin, pattern: "spots", color2: K.rgb(96, 128, 80), eyes: "derp",
      eyeWhite: K.rgb(255, 250, 200), eyeColor: K.rgb(150, 20, 20), mouth: "teeth", innerEarColor: K.rgb(170, 90, 90),
    });
    const m = c.model;
    dropPrims(m, (p) => p.name === "Arm");
    const chest = K.p(c.attach("body"));
    const hands = {};
    for (const s of [-1, 1]) {
      const sh = K.add(chest, V(s * 0.75, 0.9, -0.2));
      const hand = K.add(sh, V(s * 0.1, 0.1, -1.9));
      K.limb(m, sh, hand, 0.45, skin, { name: "ZombieArm" });
      K.ball(m, 0.55, hand, skin, { name: "Hand" });
      hands[s] = hand;
    }
    const st = c.attach("face", V(0.35, 0.5, 0.05));
    K.block(m, V(0.55, 0.05, 0.05), st, K.C.black, { name: "Stitch" });
    for (const x of [-0.15, 0.15]) K.block(m, V(0.05, 0.25, 0.05), K.mul(st, K.cf(x, 0, 0)), K.C.black, { name: "Stitch" });
    K.block(m, V(1.95, 0.9, 1.75), c.attach("body", V(0, -1.15, 0)), K.rgb(60, 80, 160), { name: "Shorts" });
    const h = hands[1];
    K.limb(m, h, K.add(h, V(0, -0.6, 0)), 0.06, K.C.white, { name: "String" });
    K.ball(m, V(0.7, 0.8, 0.7), K.add(h, V(0, -1.0, 0)), K.rgb(170, 110, 60), { name: "TreatBag" });
    return K.finish(m);
  },

  // 37 Great-Grandma Whiskerella: a cat living inside her gilded portrait, ruff, pearls, feathered hat
  37: (K) => {
    const V = K.v;
    const gold = K.rgb(220, 175, 60);
    const hat = K.rgb(90, 40, 120);
    const c = K.cat({
      bodyShape: "tall", color: K.rgb(170, 168, 182), pattern: "tuxedo", color2: K.C.white, eyes: "big",
      eyeColor: K.rgb(70, 30, 100), mouth: "smile", tail: "none", legs: false,
    });
    const m = c.model;
    K.block(m, V(5.2, 7.4, 0.2), V(0, 3.6, 1.0), K.rgb(110, 20, 40), { name: "Canvas" });
    K.block(m, V(6.0, 0.5, 0.45), V(0, 7.55, 0.95), gold, { name: "Frame", material: "Foil" });
    K.block(m, V(6.0, 0.5, 0.45), V(0, -0.35, 0.95), gold, { name: "Frame", material: "Foil" });
    for (const s of [-1, 1]) K.block(m, V(0.5, 8.4, 0.45), V(s * 2.85, 3.6, 0.95), gold, { name: "Frame", material: "Foil" });
    K.block(m, V(2.0, 0.4, 0.15), V(0, -0.35, 0.66), K.rgb(250, 230, 150), { name: "NamePlate", material: "Foil" });
    K.ball(m, V(2.4, 0.45, 2.0), c.attach("neck", V(0, 0.05, 0.2)), K.C.white, { name: "Ruff" });
    for (let i = -1; i <= 1; i++) {
      K.ball(m, 0.24, c.attach("neck", V(i * 0.32, -0.32 - (1 - Math.abs(i)) * 0.1, -0.62)), K.rgb(250, 245, 255), { name: "Pearl" });
    }
    const top = c.attach("headTop");
    K.cyl(m, 0.15, 1.9, K.mul(top, K.cf(0, 0.05, 0), K.rot(-8, 0, 10)), hat, { name: "HatBrim" });
    K.cyl(m, 0.5, 1.0, K.mul(top, K.cf(0, 0.3, 0), K.rot(-8, 0, 10)), hat, { name: "Hat" });
    K.limb(m, K.p(K.mul(top, K.cf(0.4, 0.4, 0))), K.p(K.mul(top, K.cf(1.25, 1.45, 0.3))), 0.2, K.rgb(255, 120, 180), { name: "Feather" });
    return K.finish(m, { fit: 7 });
  },

  // 38 Barkley the Werecat: a golden cat mid-transformation into a retriever, under his full moon
  38: (K) => {
    const V = K.v;
    const gold = K.rgb(228, 172, 82);
    const c = K.cat({
      color: gold, eyes: "big", eyeColor: K.rgb(70, 40, 20), mouth: "smile", tail: "puffy", innerEars: false, noseColor: K.C.black,
    });
    const m = c.model;
    const h = c.attach("head");
    for (const s of [-1, 1]) {
      K.ball(m, V(0.45, 1.3, 0.8), K.mul(h, K.cf(s * 0.98, -0.25, 0.05), K.rot(0, 0, s * 15)), K.rgb(170, 110, 50), { name: "DogEar" });
    }
    K.ball(m, V(0.95, 0.6, 0.8), c.attach("nose", V(0, -0.12, 0.15)), K.rgb(245, 220, 170), { name: "Snout" });
    K.ball(m, V(0.38, 0.26, 0.25), c.attach("nose", V(0, 0.02, -0.28)), K.C.black, { name: "DogNose" });
    K.block(m, V(0.35, 0.08, 0.6), K.mul(c.attach("mouth", V(0, -0.2, -0.4)), K.rot(-35, 0, 0)), K.rgb(255, 110, 140), { name: "Tongue" });
    K.cyl(m, 0.25, 1.3, K.mul(c.attach("neck", V(0, 0, 0.15)), K.rot(-20, 0, 0)), K.C.red, { name: "Collar" });
    K.ball(m, 0.3, c.attach("neck", V(0, -0.3, -0.5)), K.C.gold, { name: "Tag", material: "Foil" });
    K.ball(m, 1.2, c.attach("headTop", V(-1.1, 1.6, 0.6)), K.rgb(255, 250, 210), { name: "Moon", neon: true });
    const f = c.attach("feet", V(0, 0.2, -2.7));
    K.limb(m, K.p(K.mul(f, K.cf(-0.6, 0, 0))), K.p(K.mul(f, K.cf(0.6, 0, 0))), 0.25, K.C.white, { name: "Bone" });
    for (const s of [-1, 1]) {
      K.ball(m, 0.35, K.mul(f, K.cf(s * 0.65, 0, 0.12)), K.C.white, { name: "BoneEnd" });
      K.ball(m, 0.35, K.mul(f, K.cf(s * 0.65, 0, -0.12)), K.C.white, { name: "BoneEnd" });
    }
    return K.finish(m);
  },

  // 39 The Phantom of the Litterbox: black cat, white half mask, red-lined cape, rose, organ pipes
  39: (K) => {
    const V = K.v;
    const black = K.rgb(30, 30, 40);
    const c = K.cat({
      bodyShape: "tall", color: black, eyes: "normal", eyeColor: K.rgb(40, 200, 120), mouth: "smile", tail: "long",
      innerEarColor: K.rgb(120, 40, 60),
    });
    const m = c.model;
    const hd = c.headD;
    const h = c.attach("head");
    K.ball(m, V(hd * 0.62, hd * 0.85, hd * 0.5), K.mul(h, K.cf(hd * 0.23, 0.08, -hd * 0.33)), K.C.white, { name: "Mask" });
    K.ball(m, V(0.34, 0.24, 0.1), K.mul(h, K.cf(hd * 0.23, hd * 0.08, -hd * 0.57)), K.C.black, { name: "MaskHole" });
    K.block(m, V(2.5, 4.2, 0.15), c.attach("body", V(0, 0.1, 1.0)), K.rgb(15, 12, 20), { name: "Cape" });
    K.block(m, V(2.3, 4.0, 0.1), c.attach("body", V(0, 0.1, 0.9)), K.rgb(170, 15, 35), { name: "CapeLining" });
    for (const s of [-1, 1]) {
      K.block(m, V(0.15, 1.3, 0.9), K.mul(c.attach("neck", V(s * 0.85, 0.5, 0.3)), K.rot(0, s * 20, -s * 15)), K.rgb(170, 15, 35), { name: "Collar" });
    }
    const paw = K.p(c.attach("frontLeftPaw"));
    K.limb(m, paw, K.add(paw, V(0, 0.9, -0.25)), 0.08, K.rgb(40, 140, 50), { name: "RoseStem" });
    K.ball(m, 0.4, K.add(paw, V(0, 1.05, -0.3)), K.rgb(220, 0, 40), { name: "Rose" });
    [-0.8, 0, 0.8].forEach((x, i) => {
      const len = i === 1 ? 6.4 : 5.4;
      K.cyl(m, len, 0.45, V(x, len / 2, 1.6), K.rgb(170, 110, 255), { name: "Pipe", neon: true });
    });
    return K.finish(m);
  },

  // 40 Batticus: an upside-down bat cat hanging from a branch, wings and all
  40: (K) => {
    const V = K.v;
    const fur = K.rgb(60, 42, 78);
    const wing = K.rgb(35, 25, 45);
    const c = K.cat({
      color: fur, eyes: "big", eyeColor: K.rgb(230, 40, 60), mouth: "teeth", tail: "none", legs: false,
      innerEarColor: K.rgb(255, 120, 170),
    });
    const m = c.model;
    K.acc.wings(c, { color: wing, scale: 1.3 });
    const back = c.attach("back");
    for (const s of [-1, 1]) {
      K.limb(m, K.p(K.mul(back, K.cf(s * 0.3, 0.3, 0))), K.p(K.mul(back, K.cf(s * 2.4, 1.6, 0))), 0.12, K.C.black, { name: "WingBone" });
      K.limb(m, K.p(K.mul(back, K.cf(s * 0.3, 0.3, 0.1))), K.p(K.mul(back, K.cf(s * 2.2, 0.5, 0.9))), 0.1, K.C.black, { name: "WingBone" });
    }
    for (const lz of [-0.9, 1.2]) {
      for (const s of [-1, 1]) K.limb(m, V(s * 0.55, 1.2, lz), V(s * 0.15, -0.05, lz * 0.6), 0.45, fur, { name: "Leg" });
    }
    K.limb(m, V(0, -0.3, -2.0), V(0, -0.3, 2.2), 0.5, K.rgb(100, 70, 45), { name: "Branch" });
    K.ball(m, V(0.7, 0.08, 0.4), K.mul(K.cf(0.45, -0.25, -1.5), K.rot(0, 30, 10)), K.rgb(120, 80, 40), { name: "DeadLeaf" });
    K.ball(m, V(0.6, 0.08, 0.35), K.mul(K.cf(-0.4, -0.25, 1.7), K.rot(0, -20, -10)), K.rgb(140, 90, 40), { name: "DeadLeaf" });
    const flip = K.angles(0, 0, Math.PI);
    eachPrim(m, (p) => { p.cf = K.mul(flip, p.cf); });
    return K.finish(m);
  },

  // 41 Sir Purrcival the Headless: armoured knight cat, green neck-fire, head carried under his arm
  41: (K) => {
    const V = K.v;
    const fur = K.rgb(125, 135, 155);
    const steel = K.rgb(200, 205, 215);
    const flame = K.rgb(80, 255, 120);
    const c = K.cat({
      bodyShape: "tall", color: fur, pattern: "stripes", color2: K.rgb(90, 96, 112), eyes: "normal", mouth: "frown", tail: "normal",
    });
    const m = c.model;
    dropPrims(m, (p) => yOf(p) > 4.45);
    const top = V(0, 4.35, 0);
    K.cyl(m, 0.3, 1.0, K.cf(top), K.rgb(60, 220, 90), { name: "Stump", neon: true });
    K.ball(m, V(0.9, 1.1, 0.9), K.add(top, V(0, 0.6, 0)), flame, { name: "Flame", neon: true, transparency: 0.2 });
    K.ball(m, V(0.55, 0.8, 0.55), K.add(top, V(0.1, 1.3, 0.05)), K.rgb(150, 255, 170), { name: "Flame", neon: true, transparency: 0.3 });
    K.ball(m, V(0.3, 0.5, 0.3), K.add(top, V(-0.05, 1.85, 0)), K.rgb(200, 255, 210), { name: "Flame", neon: true, transparency: 0.4 });
    K.ball(m, V(1.95, 2.0, 0.9), c.attach("body", V(0, 0.4, -0.55)), steel, { name: "Armor", material: "Metal" });
    for (const s of [-1, 1]) K.ball(m, 0.9, V(s * 0.95, 3.9, -0.1), steel, { name: "Pauldron", material: "Metal" });
    K.block(m, V(2.0, 3.4, 0.12), c.attach("body", V(0, 0.1, 0.9)), K.rgb(120, 20, 30), { name: "Cape" });
    const hp = K.add(K.p(c.attach("frontLeftPaw")), V(0.55, 0.4, -0.25));
    K.ball(m, 1.45, hp, fur, { name: "HeldHead" });
    for (const s of [-1, 1]) {
      triEar(K, m, K.mul(K.cf(K.add(hp, V(s * 0.38, 0.48, 0))), K.rot(0, 0, -s * 18)), 0.6, 0.55, 0.15, fur);
      K.ball(m, V(0.3, 0.34, 0.15), K.add(hp, V(s * 0.27, 0.12, -0.64)), K.C.white, { name: "HeadEye" });
      K.ball(m, V(0.16, 0.2, 0.1), K.add(hp, V(s * 0.27, 0.12, -0.71)), K.C.black, { name: "HeadPupil" });
    }
    K.ball(m, V(0.2, 0.14, 0.14), K.add(hp, V(0, -0.05, -0.72)), K.C.pink, { name: "HeadNose" });
    return K.finish(m);
  },

  // 42 The Litterbox Lich: crowned laser-eyed lich in a robe, scoop scepter, floating litterbox throne
  42: (K) => {
    const V = K.v;
    const robe = K.rgb(35, 18, 50);
    const trim = K.rgb(120, 255, 140);
    const c = K.cat({
      bodyShape: "tall", color: K.rgb(72, 38, 104), pattern: "stripes", color2: K.rgb(40, 22, 62), eyes: "laser",
      eyeColor: K.rgb(190, 90, 255), mouth: "teeth", tail: "long", whiskers: false, innerEarColor: trim,
    });
    const m = c.model;
    K.acc.crown(c, { color: K.rgb(200, 170, 60), gem: K.rgb(80, 255, 120) });
    const feet = c.attach("feet");
    K.cyl(m, 2.2, 2.6, K.mul(feet, K.cf(0, 1.1, 0)), robe, { name: "Robe", material: "Fabric" });
    K.cyl(m, 0.25, 2.75, K.mul(feet, K.cf(0, 0.15, 0)), trim, { name: "RobeTrim", neon: true });
    const hand = K.p(c.attach("frontRightPaw"));
    K.limb(m, K.add(hand, V(0, -1.4, 0)), K.add(hand, V(0, 2.2, 0)), 0.16, K.rgb(200, 170, 60), { name: "Scepter" });
    K.block(m, V(0.9, 0.7, 0.12), K.add(hand, V(0, 2.6, 0)), trim, { name: "Scoop", neon: true });
    K.ball(m, 0.5, K.add(hand, V(0, 3.2, 0)), K.rgb(190, 90, 255), { name: "Orb", neon: true });
    const box = K.rgb(80, 60, 110);
    K.block(m, V(4.2, 0.3, 3.4), V(0, -1.05, 0), box, { name: "Litterbox" });
    for (const s of [-1, 1]) {
      K.block(m, V(4.2, 1.0, 0.25), V(0, -0.5, s * 1.7), box, { name: "LitterboxWall" });
      K.block(m, V(0.25, 1.0, 3.4), V(s * 2.1, -0.5, 0), box, { name: "LitterboxWall" });
    }
    K.block(m, V(3.9, 0.15, 3.1), V(0, -0.25, 0), K.rgb(225, 205, 160), { name: "Litter", material: "Sand" });
    for (let i = 0; i <= 2; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      K.ball(m, 0.45, V(Math.sin(a) * 2.4, 4.2 + i * 0.3, Math.cos(a) * 2.0), trim, { name: "SoulOrb", neon: true });
    }
    return K.finish(m);
  },
};

// ============================================================================================ build

export function build(z) {
  const K = z.K;
  const T = z.THREE;
  const C = (r, g, b) => K.rgb(r, g, b);
  const rad = (d) => (d * Math.PI) / 180;

  // A deliberately small palette: every static part is drawn instanced, one draw call per
  // shape|material|colour, so the zone reuses these instead of a fresh colour per prop.
  const COL = {
    grass: C(52, 60, 46), hill: C(60, 64, 50), terrace: C(78, 74, 86), path: C(98, 92, 106),
    wall: C(66, 50, 82), trim: C(38, 28, 48), roof: C(44, 40, 58), floor: C(92, 62, 44), inner: C(104, 80, 112),
    stone: C(112, 110, 122), darkStone: C(70, 68, 78), wood: C(92, 64, 42), darkWood: C(55, 38, 28),
    slime: C(110, 255, 60), goo: C(190, 60, 255), hedge: C(34, 72, 42), gold: C(220, 175, 60), iron: C(30, 28, 34),
    warm: C(255, 170, 60), spirit: C(170, 110, 255), red: C(150, 20, 40), white: C(240, 240, 240),
    paper: C(240, 228, 196), ink: C(40, 25, 20), thorn: C(110, 20, 35), orange: C(240, 130, 20),
    purple: C(110, 50, 150), blue: C(50, 90, 170), steel: C(180, 185, 195), yellow: C(255, 225, 70),
    mint: C(150, 255, 150), moon: C(255, 250, 215), sandstone: C(200, 170, 90), dirt: C(46, 44, 40),
    mound: C(70, 55, 40), glass: C(180, 210, 235), ghost: C(190, 230, 255), bark: C(45, 35, 35), brown: C(120, 80, 40),
  };
  // Merged on purpose to stay inside 60 draw-call keys: the original's near-identical tones.
  COL.wood = COL.floor; COL.hill = COL.grass; COL.roof = COL.trim; COL.terrace = COL.darkStone;
  const DECOR = { decor: true };

  // Rare shape|material|colour combinations folded onto keys the zone already draws (each
  // distinct key is a draw call). Glass is one look everywhere.
  const REMAP = {
    "box|wood|#261c30": ["wood", COL.darkWood], "box|wood|#963c5a": ["plastic", COL.purple],
    "box|wood|#c8aa5a": ["sand", COL.sandstone], "box|wood|#961428": ["plastic", COL.red],
    "box|wood|#6e508c": ["wood", COL.inner], "box|plastic|#7850a0": ["plastic", COL.purple],
    "box|plastic|#22482a": ["plastic", "#50dc46"], "box|plastic|#ffe146": ["plastic", COL.gold],
    "box|plastic|#785028": ["wood", COL.floor], "box|plastic|#cde678": ["plastic", COL.gold],
    "box|plastic|#706e7a": ["concrete", COL.stone], "box|neon|#f0f0f0": ["neon", COL.yellow],
    "box|sand|#c8f0c8": ["sand", COL.sandstone], "box|sand|#2e2c28": ["sand", COL.mound],
    "box|sand|#281914": ["plastic", COL.ink], "box|grass|#3c7828": ["grass", COL.hedge],
    "box|cobble|#706e7a": ["cobble", COL.path], "box|marble|#f0f0f0": ["plastic", COL.white],
    "box|brick|#5a3232": ["brick", COL.darkStone], "box|metal|#b4b9c3": ["concrete", COL.stone],
    "cylinder|metal|#785028": ["metal", COL.iron], "cylinder|plastic|#3c7828": ["neon", COL.slime],
    "cylinder|plastic|#ffe146": ["plastic", COL.paper], "cylinder|neon|#be3cff": ["neon", COL.spirit],
    "cylinder|plastic|#281914": ["wood", COL.bark], "cylinder|brick|#46444e": ["concrete", COL.trim],
    "cylinder|wood|#5c3e2c": ["wood", COL.darkWood], "cylinder|marble|#f0f0f0": ["plastic", COL.paper],
    "sphere|neon|#ff283c": ["neon", COL.warm], "sphere|plastic|#ff78be": ["plastic", COL.orange],
    "sphere|metal|#b4b9c3": ["plastic", COL.stone], "sphere|plastic|#325aaa": ["plastic", COL.stone],
    "sphere|plastic|#281914": ["metal", COL.iron], "sphere|neon|#f0f0f0": ["neon", COL.moon],
    "sphere|neon|#6eff3c": ["neon", COL.mint], "sphere|plastic|#e1aa5a": ["plastic", COL.orange],
  };
  function canon(shape, def) {
    const mat = String(def.material || "plastic").toLowerCase();
    if (mat === "glass") return { ...def, color: COL.ghost, transparency: 0.45 };
    if (shape === "box" && mat === "plastic" && (def.transparency || 0) > 0.6) return { ...def, material: "glass", color: COL.ghost, transparency: 0.45 };
    const r = REMAP[`${shape}|${mat}|${String(def.color).toLowerCase()}`];
    return r ? { ...def, material: r[0], color: r[1] } : def;
  }

  // ---------------------------------------------------------------------------------- helpers
  const mk = (def, extra) => {
    const d = extra ? { ...def, ...extra } : def;
    return z.part(canon(d.shape || "box", d));
  };
  // axis-aligned box from two corners (zone-local)
  function box(x0, y0, z0, x1, y1, z1, color, mat, extra) {
    return mk({
      shape: "box", size: [Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)],
      at: [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], color, material: mat || "plastic",
    }, extra);
  }
  // block by centre + size (+ yaw in degrees, the original's ry)
  function blk(x, y, zz, sx, sy, sz, color, mat, extra, ry) {
    return mk({ shape: "box", size: [sx, sy, sz], at: [x, y, zz], rot: [0, ry || 0, 0], color, material: mat || "plastic" }, extra);
  }
  // vertical cylinder, y = centre
  function cylV(x, y, zz, h, d, color, mat, extra) {
    return mk({ shape: "cylinder", size: [d, h, d], at: [x, y, zz], color, material: mat || "plastic" }, extra);
  }
  function ball(x, y, zz, d, color, mat, extra) {
    return mk({ shape: "sphere", size: [d, d, d], at: [x, y, zz], color, material: mat || "plastic" }, extra);
  }
  // a part with the original's CFrame + part semantics (cylinder axis X, wedge rising to +Z)
  function rp(size, cf, color, mat, extra = {}) {
    const shape = extra.cls === "WedgePart" ? "wedge" : extra.shape === "Cylinder" ? "cylinder" : extra.shape === "Ball" ? "sphere" : "box";
    const d = canon(shape, { color, material: mat || "plastic", transparency: extra.transparency || 0 });
    return z.rpart({
      Size: size, CFrame: cf, Color: d.color, Material: d.material,
      Decor: !!extra.decor, Transparency: d.transparency, Shape: extra.shape, Class: extra.cls,
      light: extra.light || null,
    });
  }
  function wedge(size, cf, color, mat, extra = {}) {
    return rp(size, cf, color, mat, { ...extra, cls: "WedgePart" });
  }
  // cylinder between two zone-local points (branches)
  function beam(a, b, d, color, mat, extra) {
    const A = new T.Vector3(...z.pos(a[0], a[1], a[2]));
    const B = new T.Vector3(...z.pos(b[0], b[1], b[2]));
    const dir = B.clone().sub(A);
    const len = dir.length();
    const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
    const m = new T.Matrix4().compose(A.clone().add(B).multiplyScalar(0.5), q, new T.Vector3(1, 1, 1));
    return mk({ shape: "cylinder", size: [d, len, d], cf: m, color, material: mat || "plastic" }, extra);
  }
  const lamp = (color, range, intensity) => ({ light: { color, range: range || 14, intensity: intensity || 1.2 } });
  // a sign board; ry: 0 faces north (-z), 180 south, 90 west (-x), -90 east (+x)
  function sign(x, y, zz, w, h, text, ry, o = {}) {
    const p = blk(x, y, zz, w, h, o.thick || 0.4, o.color || COL.darkWood, o.mat || "wood", DECOR, ry);
    z.label(p, text, { face: "front", color: o.text || COL.paper, both: !!o.both, pps: o.pps || 48, stroke: !!o.stroke });
    return p;
  }
  function note(x, y, zz, w, h, text, ry) {
    return sign(x, y, zz, w, h, text, ry, { color: COL.paper, mat: "plastic", text: COL.ink, thick: 0.2 });
  }
  // wall along X at z with door gaps [x0, x1, topY]
  function wallX(zz, x0, x1, y0, y1, gaps, color, mat) {
    let cur = x0;
    for (const g of gaps || []) {
      if (g[0] > cur) box(cur, y0, zz - 0.5, g[0], y1, zz + 0.5, color, mat);
      if (g[2] < y1) box(g[0], g[2], zz - 0.5, g[1], y1, zz + 0.5, color, mat);
      cur = g[1];
    }
    if (x1 > cur) box(cur, y0, zz - 0.5, x1, y1, zz + 0.5, color, mat);
  }
  // wall along Z at x with door gaps [z0, z1, topY]
  function wallZ(x, z0, z1, y0, y1, gaps, color, mat) {
    let cur = z0;
    for (const g of gaps || []) {
      if (g[0] > cur) box(x - 0.5, y0, cur, x + 0.5, y1, g[0], color, mat);
      if (g[2] < y1) box(x - 0.5, g[2], g[0], x + 0.5, y1, g[1], color, mat);
      cur = g[1];
    }
    if (z1 > cur) box(x - 0.5, y0, cur, x + 0.5, y1, z1, color, mat);
  }
  // rectangle (ox0,oz0)-(ox1,oz1) with a rectangular hole
  function ring(ox0, oz0, ox1, oz1, hx0, hz0, hx1, hz1, y0, y1, color, mat) {
    box(ox0, y0, oz0, ox1, y1, hz0, color, mat);
    box(ox0, y0, hz1, ox1, y1, oz1, color, mat);
    box(ox0, y0, hz0, hx0, y1, hz1, color, mat);
    box(hx1, y0, hz0, ox1, y1, hz1, color, mat);
  }
  // a hanging spirit lamp; only a few of them get a real light (the zone keeps <= 12 lamps)
  function spiritLamp(x, y, zz, color, range, lit) {
    blk(x, y + 2.4, zz, 0.15, 3.2, 0.15, COL.iron, "metal", DECOR);
    return ball(x, y, zz, 1.6, color || COL.spirit, "neon", lit ? { decor: true, ...lamp(color || COL.spirit, range || 24, 1.4) } : DECOR);
  }
  // teleport (the spinning bookshelf); the head-carry check ignores this one jump
  let skipJump = 0;
  function warp(x, y, zz, ry) {
    skipJump = 3;
    z.player.teleport([x, y, zz], -(ry || 0));
  }
  const done = (n) => z.has(n) || z.isUnlocked(n);
  // Answer check for the text boxes. Pressing E to open one can also type that "e" into the
  // field (the key's character lands after the box takes focus), so one stray leading E is
  // forgiven; digit boxes allow one extra character for it and drop letters anyway.
  const heard = (text, want) => text === want || (text.length === want.length + 1 && text[0] === "E" && text.slice(1) === want);

  // candles: only LIT ones (with a flame) count for the moon-cage cipher (cat 38)
  const candleCount = { foyer: 0, library: 0, dining: 0, bedroom: 0 };
  function candle(room, x, y, zz, lit) {
    cylV(x, y + 0.6, zz, 1.2, 0.35, COL.paper, "plastic", DECOR);
    if (lit) {
      mk({ shape: "sphere", size: [0.32, 0.55, 0.32], at: [x, y + 1.5, zz], color: COL.warm, material: "neon", decor: true });
      candleCount[room] += 1;
    } else {
      blk(x, y + 1.3, zz, 0.06, 0.2, 0.06, COL.ink, "plastic", DECOR);
    }
  }

  // ---------------------------------------------------------------------------------- terrain
  // ground with a hole for the basement (x 40..100, z -10..45)
  ring(-195, -195, 195, 195, 40, -10, 100, 45, -2, 0, COL.grass, "grass");
  ring(-25, -70, 125, 70, 40, -10, 100, 45, 0, 3, COL.hill, "grass");
  ring(-8, -53, 108, 53, 40, -10, 100, 45, 3, 6, COL.terrace, "concrete");
  // ramps: west (main path), south (pumpkin patch), north (tower), east
  wedge([10, 3, 10], z.cf(-30, 1.5, 0, 90), COL.path, "cobble");
  wedge([10, 3, 10], z.cf(-13, 4.5, 0, 90), COL.path, "cobble");
  wedge([10, 3, 5], z.cf(50, 4.5, 55.5, 180), COL.path, "cobble");
  wedge([10, 3, 5], z.cf(50, 1.5, 72.5, 180), COL.path, "cobble");
  wedge([10, 3, 5], z.cf(50, 4.5, -55.5), COL.path, "cobble");
  wedge([10, 3, 5], z.cf(50, 1.5, -72.5), COL.path, "cobble");
  wedge([10, 3, 5], z.cf(110.5, 4.5, 0, -90), COL.path, "cobble");
  wedge([10, 3, 5], z.cf(127.5, 1.5, 0, -90), COL.path, "cobble");
  // cobbled path (decor)
  box(-172, -0.9, -5, -35, 0.08, 5, COL.path, "cobble", DECOR);
  box(-25, 2.1, -5, -18, 3.08, 5, COL.path, "cobble", DECOR);
  box(-8, 5.1, -5, 0, 6.08, 5, COL.path, "cobble", DECOR);
  box(-96, -0.9, 5, -94, 0.08, 35, COL.path, "cobble", DECOR);
  box(-101, -0.9, -45, -99, 0.08, -5, COL.path, "cobble", DECOR);

  // spawn welcome + map board (one board, both faces)
  sign(-168, 5.5, -17, 11, 9,
    "WELCOME TO HAUNTED LITTERBOX MANOR\n14 spooky cats live here. Follow the path to the manor... if you dare. (meow)\n\n" +
    "MAP: Graveyard south of the path. Hedge Maze north of the path. Manor straight ahead, up the hill. " +
    "Pumpkin Patch behind the manor. Witch Tower far north-east.", 90, { both: true });

  // entrance gate
  box(-150, 0, -10, -146, 13, -6, COL.darkStone, "concrete");
  box(-150, 0, 6, -146, 13, 10, COL.darkStone, "concrete");
  const beamTop = box(-150, 13, -10, -146, 16, 10, COL.trim, "concrete");
  z.label(beamTop, "HAUNTED LITTERBOX MANOR", { face: "left", color: COL.goo, pps: 32 });
  for (const zz of [-8, 8]) {
    ball(-148, 14.2, zz, 2.4, COL.orange, "plastic");
    ball(-149.1, 14.4, zz, 0.9, COL.yellow, "neon", DECOR);
  }
  // lamp posts along the path
  for (const x of [-160, -135, -110, -85, -60, -40]) {
    for (const zz of [-8, 8]) {
      cylV(x, 4.5, zz, 9, 0.6, COL.iron, "metal");
      blk(x, 9.4, zz, 1.4, 0.3, 1.4, COL.iron, "metal", DECOR);
      ball(x, 8.6, zz, 1.1, COL.mint, "neon", DECOR);
    }
  }

  // the original haunted litterbox (landmark)
  const LB = C(120, 80, 160);
  box(-47, 0, -40, -23, 1, -20, LB, "plastic");
  box(-47, 1, -40, -23, 4, -39, LB, "plastic");
  box(-47, 1, -21, -23, 4, -20, LB, "plastic");
  box(-47, 1, -39, -46, 4, -21, LB, "plastic");
  box(-24, 1, -39, -23, 4, -21, LB, "plastic");
  box(-46, 1, -39, -24, 3.2, -21, C(200, 240, 200), "sand");
  rp([0.8, 14, 0.8], K.mul(z.cf(-26, 7, -30), K.rot(0, 0, -25)), COL.goo, "neon", DECOR);
  rp([5, 0.4, 4], K.mul(z.cf(-23.3, 13.4, -30), K.rot(0, 0, -25)), LB, "plastic", DECOR);
  for (let i = 1; i <= 3; i++) {
    const s = blk(-40 + i * 4, 6 + i * 0.5, -30, 0.3, 3, 0.3, COL.mint, "neon", { decor: true, transparency: 0.4 });
    z.tag(s, "Bob", { Amp: 0.8, Period: 1.5 + i * 0.3 });
  }
  sign(-35, 2.5, -18.5, 10, 3, "THE ORIGINAL HAUNTED LITTERBOX\nDo not scoop. It scoops back.", 180);

  // ---------------------------------------------------------------------------------- manor shell
  const F1 = 6, F1T = 24, F2 = 25, F2B = 24, ATT = 40;
  wallZ(0, -45.5, 45.5, F1, ATT, [[-4, 4, 18]], COL.wall, "wood");
  wallZ(100, -45.5, 45.5, F1, ATT, null, COL.wall, "wood");
  wallX(-45, 0, 100, F1, ATT, null, COL.wall, "wood");
  wallX(45, 0, 100, F1, ATT, null, COL.wall, "wood");
  for (const yy of [[F2B, F2], [ATT - 0.6, ATT + 0.2]]) {
    box(-0.9, yy[0], -45.9, 100.9, yy[1], -45.5, COL.trim, "concrete", DECOR);
    box(-0.9, yy[0], 45.5, 100.9, yy[1], 45.9, COL.trim, "concrete", DECOR);
    box(-0.9, yy[0], -45.5, -0.5, yy[1], 45.5, COL.trim, "concrete", DECOR);
    box(100.5, yy[0], -45.5, 100.9, yy[1], 45.5, COL.trim, "concrete", DECOR);
  }

  // basement pit walls + floor 1 slab over it (ramp opening x 76..98, z 37..45)
  box(38, -17, -12, 40.1, 6, 47, COL.darkStone, "brick");
  box(99.9, -17, -12, 102, 6, 47, COL.darkStone, "brick");
  box(38, -17, -12, 102, 6, -9.9, COL.darkStone, "brick");
  box(38, -17, 44.9, 102, 6, 47, COL.darkStone, "brick");
  box(40, 5, -10, 100, 6, 37, COL.floor, "wood");
  box(40, 5, 37, 76, 6, 45, COL.floor, "wood");
  box(98, 5, 37, 100, 6, 45, COL.floor, "wood");
  box(0.5, 6, -44.5, 40, 6.06, 44.5, COL.floor, "wood", DECOR);
  box(40, 6, -44.5, 99.5, 6.06, -10, COL.floor, "wood", DECOR);

  // floor 2 slab (holes: library 35..75 x -45..10, foyer ramp 28..35 x -12..10)
  box(0, F2B, -45, 35, F2, -15, COL.floor, "wood");
  box(0, F2B, -15, 28, F2, 45, COL.floor, "wood");
  box(28, F2B, -15, 35, F2, -12, COL.floor, "wood");
  box(28, F2B, 10, 35, F2, 45, COL.floor, "wood");
  box(35, F2B, 10, 75, F2, 45, COL.floor, "wood");
  box(75, F2B, -45, 100, F2, 45, COL.floor, "wood");
  box(27.6, F2, -12, 28, F2 + 3, 10, COL.darkWood, "wood");
  box(28, F2, 9.6, 35, F2 + 3, 10, COL.darkWood, "wood");

  // attic: ceiling slab (y 39..40) with the stair hatch (85.5..90.5, 14.5..24.5)
  box(0, 39, -45, 100, ATT, 14.5, COL.darkWood, "wood");
  box(0, 39, 24.5, 100, ATT, 45, COL.darkWood, "wood");
  box(0, 39, 14.5, 85.5, ATT, 24.5, COL.darkWood, "wood");
  box(90.5, 39, 14.5, 100, ATT, 24.5, COL.darkWood, "wood");

  // floor 1 interior walls (y 6..24); library walls go to the ceiling (39)
  wallZ(35, -45, 10, F1, 39, [[-8, -2, 16]], COL.inner, "wood");
  wallZ(35, 10, 45, F1, F1T, [[25, 31, 16]], COL.inner, "wood");
  wallX(-15, 0, 35, F1, F1T, [[20, 27, 16]], COL.inner, "wood");
  wallX(15, 0, 35, F1, F1T, [[12, 19, 16]], COL.inner, "wood");
  wallX(10, 35, 75, F1, 39, null, COL.inner, "wood");
  wallZ(75, -45, 10, F1, 39, [[0, 6, 16]], COL.inner, "wood");
  wallZ(75, 10, 45, F1, F1T, [[22, 28, 16]], COL.inner, "wood");
  wallX(-20, 75, 100, F1, F1T, null, COL.inner, "wood");
  // floor 2 interior walls (y 25..39)
  wallX(-15, 0, 35, F2, 39, [[28, 34, 35]], COL.inner, "wood");
  wallX(15, 0, 35, F2, 39, [[10, 16, 35]], COL.inner, "wood");
  wallZ(35, 15, 45, F2, 39, null, COL.inner, "wood");

  // roof (gable along x, ridge y 61)
  const alpha = Math.atan(21 / 46);
  const rlen = Math.sqrt(21 * 21 + 46 * 46);
  rp([104, 1, rlen + 1], K.mul(z.cf(50, 50.5, -23), K.angles(-alpha, 0, 0), K.cf(0, -0.5, 0)), COL.roof, "concrete");
  rp([104, 1, rlen + 1], K.mul(z.cf(50, 50.5, 23), K.angles(alpha, 0, 0), K.cf(0, -0.5, 0)), COL.roof, "concrete");
  box(-2, 60.6, -0.7, 102, 61.6, 0.7, COL.trim, "concrete");
  for (const x of [0, 100]) {
    wedge([1, 21, 45], z.cf(x, 50.5, -22.5), COL.wall, "wood");
    wedge([1, 21, 45], z.cf(x, 50.5, 22.5, 180), COL.wall, "wood");
  }
  // the cat-face round window on the front gable
  rp([0.4, 9, 9], z.cf(-0.75, 49, 0), COL.spirit, "neon", { decor: true, shape: "Cylinder" });
  for (const s of [-1, 1]) {
    blk(-0.75, 53.2, s * 2.8, 0.4, 3.2, 3.2, COL.spirit, "neon", DECOR);
    ball(-1.0, 50, s * 1.8, 1.6, COL.yellow, "neon", DECOR);
  }
  // chimney with green smoke puffs (the original's particle smoke)
  box(66, 50, 14, 72, 66, 20, C(90, 50, 50), "brick");
  for (let i = 0; i < 3; i++) {
    const puff = ball(69 + (i - 1) * 0.8, 68 + i * 2.6, 17, 2.4 + i * 0.8, COL.mint, "plastic", { decor: true, transparency: 0.55 });
    z.tag(puff, "Bob", { Amp: 1.2, Period: 2.6 + i * 0.7 });
  }
  // corner turrets
  for (const [x, zz] of [[0, -45], [0, 45], [100, -45], [100, 45]]) {
    cylV(x, 28, zz, 44, 9, COL.wall, "wood");
    cylV(x, 50.5, zz, 1, 10.5, COL.trim, "concrete");
    cylV(x, 54, zz, 6, 8, COL.roof, "concrete");
    cylV(x, 59, zz, 4, 5, COL.roof, "concrete");
    cylV(x, 62.5, zz, 3, 2.4, COL.roof, "concrete");
    ball(x, 64.8, zz, 1.4, COL.spirit, "neon", DECOR);
    blk(x + (x === 0 ? -4.6 : 4.6), 36, zz, 0.3, 5, 1.6, COL.goo, "neon", DECOR);
  }
  // glowing windows (outside only)
  function windowAt(face, a, yc, color) {
    let px, pz, sx, sz;
    if (face === "W") { px = -0.65; pz = a; sx = 0.2; sz = 4; }
    else if (face === "E") { px = 100.65; pz = a; sx = 0.2; sz = 4; }
    else if (face === "N") { px = a; pz = -45.65; sx = 4; sz = 0.2; }
    else { px = a; pz = 45.65; sx = 4; sz = 0.2; }
    blk(px, yc, pz, sx, 6, sz, color, "neon", DECOR);
    const ox = face === "W" ? -0.15 : face === "E" ? 0.15 : 0;
    const oz = face === "N" ? -0.15 : face === "S" ? 0.15 : 0;
    blk(px + ox, yc + 0.6, pz + oz, sx === 4 ? 4.2 : 0.3, 0.3, sz === 4 ? 4.2 : 0.3, COL.trim, "concrete", DECOR);
  }
  for (const zz of [-35, -25, 25, 35]) windowAt("W", zz, 13, COL.warm);
  for (const zz of [-35, -25, -8, 8, 25, 35]) windowAt("W", zz, 32, COL.spirit);
  for (const zz of [-35, -10, 15, 30]) { windowAt("E", zz, 13, COL.warm); windowAt("E", zz, 32, COL.spirit); }
  for (const x of [10, 25, 50, 65, 85]) {
    windowAt("N", x, 13, COL.warm); windowAt("N", x, 32, COL.spirit);
    windowAt("S", x, 13, COL.warm); windowAt("S", x, 32, COL.spirit);
  }
  // porch + front door
  box(-7, 18, -7, 0, 18.6, 7, COL.trim, "concrete");
  for (const zz of [-6, 6]) cylV(-6, 12, zz, 12, 1, COL.white, "marble");
  blk(2, 12, -4.2, 0.3, 12, 4, COL.red, "wood", DECOR, 90);
  blk(2, 12, 4.2, 0.3, 12, 4, COL.red, "wood", DECOR, 90);

  // ---------------------------------------------------------------------------------- FOYER (floor 1)
  box(3, 6.06, -6, 26, 6.12, 6, COL.red, "plastic", DECOR);
  box(2.5, 6.05, -6.5, 26.5, 6.1, 6.5, COL.gold, "metal", DECOR);
  {
    // grand carpet ramp to floor 2 (x 28..34, z 10 -> -12)
    const phi = Math.atan(19 / 22);
    const len = Math.sqrt(19 * 19 + 22 * 22);
    const top = K.mul(z.cf(31, 15.5, -1), K.angles(phi, 0, 0));
    rp([6, 1, len], K.mul(top, K.cf(0, -0.5, 0)), COL.red, "plastic");
    rp([0.3, 3, len], K.mul(top, K.cf(3.15, 1.5, 0)), COL.darkWood, "wood");
  }
  box(26.5, 6, 11, 27.5, 10, 12, COL.darkWood, "wood");
  candle("foyer", 27, 10, 11.5, true);
  box(1, 6, 8, 4, 9, 13, COL.darkWood, "wood");
  candle("foyer", 2.5, 9, 9.5, true);
  candle("foyer", 2.5, 9, 11.5, true);
  box(1, 6, -13, 4, 9, -8, COL.darkWood, "wood");
  candle("foyer", 2.5, 9, -12, false);
  candle("foyer", 2.5, 9, -9.5, false);
  box(8, 6, -14.4, 11, 15, -12.6, COL.darkWood, "wood");
  mk({ shape: "cylinder", size: [2.2, 0.2, 2.2], at: [9.5, 13, -12.45], rot: [90, 0, 0], color: COL.paper, material: "plastic", decor: true });
  blk(9.5, 13, -12.4, 0.12, 0.9, 0.08, COL.ink, "plastic", DECOR);
  spiritLamp(15, 20, 0, COL.spirit, 26, true);

  // ---------------------------------------------------------------------------------- DINING ROOM (cat 31)
  box(4, 6.06, 24, 30, 6.12, 36, COL.red, "plastic", DECOR);
  box(6, 9, 28, 28, 9.5, 32, COL.darkWood, "wood");
  box(8, 6, 29.5, 9, 9, 30.5, COL.darkWood, "wood");
  box(25, 6, 29.5, 26, 9, 30.5, COL.darkWood, "wood");
  for (const x of [10, 17, 24]) {
    for (const s of [-1, 1]) {
      const zz = 30 + s * 3.4;
      box(x - 1, 6, zz - 1, x + 1, 8, zz + 1, COL.red, "plastic");
      box(x - 1, 8, zz + s * 0.8 - 0.2, x + 1, 11, zz + s * 0.8 + 0.2, COL.darkWood, "wood");
    }
  }
  candle("dining", 12, 9.5, 30, true);
  candle("dining", 17, 9.5, 30.6, false);
  candle("dining", 22, 9.5, 30, false);
  // fireplace + mantel (south wall)
  box(10, 6, 42, 20, 13, 44.5, COL.darkStone, "brick");
  box(12, 6, 41.9, 18, 10, 42.1, COL.ink, "plastic", DECOR);
  box(13, 6.1, 42.1, 17, 8, 42.6, COL.warm, "neon", { decor: true, ...lamp(C(255, 140, 50), 16, 1.5) });
  box(9, 13, 41.5, 21, 13.4, 44.5, COL.darkWood, "wood");
  candle("dining", 10.5, 13.4, 43, true);
  candle("dining", 12, 13.4, 43, false);
  // china cabinet + side table to climb it
  box(31, 6, 36, 34.5, 16, 44.5, COL.darkWood, "wood");
  box(30.9, 8, 37, 31, 15, 43.5, COL.glass, "glass", { decor: true, transparency: 0.5 });
  box(27, 6, 41, 30, 10.5, 44.5, COL.darkWood, "wood");
  // chandelier
  box(16.85, 20.2, 29.85, 17.15, 24, 30.15, COL.iron, "metal", DECOR);
  cylV(17, 20, 30, 0.3, 6, COL.iron, "metal");
  candle("dining", 14.5, 20.15, 30, true);
  candle("dining", 19.5, 20.15, 30, true);
  // Count Catula's coffin
  box(0.5, 6, 26, 2.6, 15, 34, COL.trim, "wood");
  box(2.6, 6.5, 27, 2.8, 14.5, 33, COL.red, "plastic", DECOR);
  note(8, 10, 22.5, 7, 4.5, "COUNT CATULA refuses to leave his coffin while there is GARLIC BREAD in the house.\n5 slices are hidden in the DINING ROOM and the KITCHEN.\nClick them to yeet them.", 0);

  const BREAD = C(225, 170, 90);
  function garlicBread(i, x, y, zz) {
    const b = blk(x, y + 0.2, zz, 1.4, 0.4, 0.8, BREAD, "plastic");
    const butter = blk(x, y + 0.43, zz, 1.2, 0.06, 0.65, C(205, 230, 120), "plastic", DECOR);
    z.click(b, () => {
      if (done(31)) return z.notify("Count Catula is already out. More bread for you!");
      const got = z.flag("bread") || {};
      if (got[i]) return z.notify("You already yeeted this slice. (It came back?! Spooky.)");
      got[i] = true;
      z.flag("bread", got);
      const n = Object.keys(got).length;
      z.sound("action_jump.mp3", { pitch: 1.3 });
      b.show(false).setCollide(false);
      butter.show(false);
      if (n >= 5) {
        z.unlock(31);
        z.notify("All 5 garlic breads yeeted! Count Catula's coffin creaks open...");
      } else {
        z.notify("Garlic bread YEETED! (" + n + "/5)");
      }
    }, { distance: 26 });
    return b;
  }
  garlicBread(1, 25.5, 9.5, 31);
  garlicBread(2, 17, 13.4, 43);
  garlicBread(3, 32.75, 16, 40);
  garlicBread(4, 55, 6.5, 42.5); // inside the kitchen oven
  garlicBread(5, 17, 20.15, 32.9); // on the chandelier ring (overhangs the rim so it can be seen from below)
  // south of the table: the cage is axis-aligned to the unrotated look, so no yaw here
  z.cat(31, z.cf(5, 6, 38), { locked: true });

  // ---------------------------------------------------------------------------------- KITCHEN (page 1)
  box(35.5, 6.06, 10.5, 74.5, 6.12, 44.5, COL.white, "marble", DECOR);
  box(41, 6, 41, 51, 9.5, 44.5, COL.stone, "marble");
  box(59, 6, 41, 72, 9.5, 44.5, COL.stone, "marble");
  // oven (open front) with garlic bread #4 inside
  box(52, 6, 44, 58, 10.5, 44.5, COL.iron, "metal");
  box(52, 6, 40.5, 52.5, 10.5, 44, COL.iron, "metal");
  box(57.5, 6, 40.5, 58, 10.5, 44, COL.iron, "metal");
  box(52, 10, 40.5, 58, 10.5, 44, COL.iron, "metal");
  box(52.5, 6, 40.5, 57.5, 6.5, 44, COL.iron, "metal");
  box(53, 9.6, 43.6, 57, 9.9, 43.9, COL.warm, "neon", DECOR);
  rp([5, 0.3, 3], K.mul(z.cf(55, 6.4, 39), K.rot(-10, 0, 0)), COL.iron, "metal", DECOR);
  box(36, 6, 39, 40, 15, 44.5, COL.white, "plastic");
  note(38, 12, 38.85, 3.6, 3.6, "LOST PAGE 1/3\nThe FIRST book to pull is the same colour as the slime that sleeps UNDER the house.", 0);
  box(50, 6, 22, 62, 9.5, 28, COL.wood, "wood");
  mk({ shape: "sphere", size: [6, 1.8, 1.5], at: [56, 10.4, 25], color: COL.blue, material: "plastic", decor: true });
  [42, 46, 66, 70].forEach((x, i0) => {
    const i = i0 + 1;
    cylV(x, 19 - (i % 2), 30, 1.6, 2.2, COL.brown, "metal", DECOR);
    blk(x, 21.5 - (i % 2) * 0.5, 30, 0.1, 4, 0.1, COL.iron, "metal", DECOR);
  });
  spiritLamp(55, 20, 18, COL.warm, 26, true);

  // ---------------------------------------------------------------------------------- MUSIC ROOM (cat 39)
  box(4, 6.06, -42, 31, 6.12, -18, COL.purple, "plastic", DECOR);
  box(8, 6, -44.5, 27, 12, -41, COL.darkWood, "wood");
  box(10, 8.5, -41, 25, 9.3, -38.5, COL.darkWood, "wood");
  for (let i = 1; i <= 7; i++) {
    const x = 8.5 + i * 2.5;
    const h = 7 + ((i * 37) % 6);
    cylV(x, 12 + h / 2, -43.2, h, 1.4, COL.spirit, "neon", DECOR);
  }
  // 6 cursed keys (K1..K6 from west to east); their pitch ranks are scrambled
  const KEY_RANK = [4, 1, 6, 2, 5, 3];
  const PITCH = [0.75, 0.84, 0.94, 1.125, 1.25, 1.5];
  const MELODY = [3, 5, 6, 5, 1]; // pitch ranks shown on the sheet music
  const SOL = MELODY.map((r) => KEY_RANK.indexOf(r) + 1);
  // Tone-O-Meter: a glass tube whose bar (6 stacked segments) shows the pitch of the last key
  box(29, 6, -41.5, 32, 7, -38.5, COL.iron, "metal");
  box(29.6, 7, -40.9, 31.4, 19, -39.1, COL.glass, "glass", { transparency: 0.6 });
  const meter = [];
  for (let r = 1; r <= 6; r++) {
    blk(30.5, 7 + r * 1.9, -38.95, 2.2, 0.12, 0.1, COL.white, "neon", DECOR);
    const seg = blk(30.5, 7 + (r - 0.5) * 1.9, -40, 1, 1.86, 1, C(120, 255, 200), "neon", { decor: true, dynamic: true });
    seg.show(false);
    meter.push(seg);
  }
  const setMeter = (rank) => meter.forEach((s, i) => s.show(i < rank));
  for (let k = 1; k <= 6; k++) {
    const x = 11 + (k - 1) * 2.6;
    const key = blk(x, 9.55, -39.6, 2.2, 0.5, 2, COL.paper, "plastic");
    z.click(key, () => {
      const r = KEY_RANK[k - 1];
      z.tone(PITCH[r - 1]);
      setMeter(r);
      if (done(39)) return;
      let idx = z.flag("organ") || 0;
      if (SOL[idx] === k) idx += 1;
      else if (SOL[0] === k) idx = 1;
      else idx = 0;
      if (idx >= SOL.length) {
        z.flag("organ", 0);
        z.unlock(39);
        z.notify("The Phantom weeps dramatically. 'FINALLY, someone who UNDERSTANDS me!' His cage opens.");
      } else {
        z.flag("organ", idx);
      }
    }, { distance: 16 });
  }
  // sheet music: 5 bars, height = pitch rank, over 6 faint staff lines
  box(16.8, 6, -35.2, 17.2, 10, -34.8, COL.iron, "metal");
  const sheetCF = K.mul(z.cf(17, 12, -35), K.rot(-15, 0, 0));
  rp([7, 4, 0.2], sheetCF, COL.paper, "plastic");
  rp([7, 0.9, 0.2], K.mul(sheetCF, K.cf(0, 2.45, 0)), COL.red, "plastic");
  for (let r = 1; r <= 6; r++) rp([6.6, 0.05, 0.05], K.mul(sheetCF, K.cf(0, -1.7 + r * 0.5, 0.12)), COL.inner, "wood", DECOR);
  MELODY.forEach((r, i) => {
    const h = r * 0.5;
    rp([0.7, h, 0.1], K.mul(sheetCF, K.cf(-2.6 + i * 1.3, -1.7 + h / 2, 0.15)), COL.ink, "plastic", DECOR);
  });
  sign(0.75, 14, -30, 10, 6, "THE CURSED ORGAN\nIts 6 keys are SCRAMBLED: they don't go low-to-high.\nPlay the Phantom's song from the sheet music (taller bar = higher note).\nNot sure which key is which? Listen... or watch the TONE-O-METER.", -90, { color: COL.trim });
  box(1, 6, -24, 11, 6.8, -16, COL.darkWood, "wood");
  z.cat(39, z.cf(6, 6.8, -20), { locked: true });
  spiritLamp(17, 19, -28, COL.spirit, 26, false);

  // ---------------------------------------------------------------------------------- LIBRARY (cat 33 + shelf of secrets)
  box(40, 6.06, -35, 70, 6.12, 5, COL.hedge, "plastic", DECOR);
  const bookCols = [COL.red, COL.blue, COL.gold, COL.hedge, COL.purple];
  function shelf(x0, z0, x1, z1, y1, faceAxis) {
    box(x0, 6, z0, x1, y1, z1, COL.darkWood, "wood");
    for (let r = 1; r <= 3; r++) {
      const y = 6 + ((y1 - 6) * r) / 4;
      const c = bookCols[(((r + Math.floor(x0 + z0)) % 5) + 5) % 5];
      if (faceAxis === "S") box(x0 + 0.4, y - 1.4, z1, x1 - 0.4, y + 1.2, z1 + 0.15, c, "plastic", DECOR);
      else if (faceAxis === "N") box(x0 + 0.4, y - 1.4, z0 - 0.15, x1 - 0.4, y + 1.2, z0, c, "plastic", DECOR);
      else if (faceAxis === "E") box(x1, y - 1.4, z0 + 0.4, x1 + 0.15, y + 1.2, z1 - 0.4, c, "plastic", DECOR);
      else box(x0 - 0.15, y - 1.4, z0 + 0.4, x0, y + 1.2, z1 - 0.4, c, "plastic", DECOR);
    }
  }
  shelf(36, -44.5, 45, -41.5, 30, "S");
  shelf(46, -44.5, 55, -41.5, 30, "S");
  shelf(56, -44.5, 65, -41.5, 30, "S");
  shelf(66, -44.5, 74.5, -41.5, 25, "S");
  shelf(35.5, -40, 38.5, -29, 28, "E");
  shelf(35.5, -27, 38.5, -16, 28, "E");
  shelf(35.5, 0, 38.5, 9.5, 28, "E");
  shelf(40, 6.5, 50, 9.5, 26, "N");
  shelf(52, 6.5, 62, 9.5, 26, "N");
  shelf(72.5, -22, 74.5, -10, 26, "W");
  // reading table with candles
  box(51, 8.5, -17, 59, 9, -13, COL.darkWood, "wood");
  box(54.5, 6, -15.5, 55.5, 8.5, -14.5, COL.darkWood, "wood");
  candle("library", 52.5, 9, -15, true);
  candle("library", 54.5, 9, -15, true);
  candle("library", 56.5, 9, -15, true);
  candle("library", 58, 9, -14, false);
  for (const [sx, lit] of [[51, true], [64, true], [69, false]]) {
    box(sx - 0.5, 13.5, 8.9, sx + 0.5, 14, 9.5, COL.gold, "metal");
    candle("library", sx, 14, 9.2, lit);
  }
  // parkour up the giant floating books to the balcony (cat 33)
  const ledges = [[41, -30, 8.5], [44, -36, 11], [49, -39, 13.5], [54, -35, 16], [58, -39, 18.5], [62, -35, 21], [66, -39, 23.5]];
  ledges.forEach((l, i0) => {
    const c = bookCols[(i0 + 1) % 5];
    box(l[0] - 1.75, l[2] - 1, l[1] - 1.75, l[0] + 1.75, l[2], l[1] + 1.75, c, "plastic");
    box(l[0] - 1.6, l[2] - 0.85, l[1] + 1.75, l[0] + 1.6, l[2] - 0.15, l[1] + 1.85, COL.paper, "plastic", DECOR);
  });
  box(68, 25, -44.5, 74.5, 26, -36, COL.darkWood, "wood");
  box(68, 26, -36.3, 74.5, 27.2, -36, COL.gold, "metal");
  candle("library", 69, 26, -43.5, true);
  z.cat(33, z.cf(71, 26, -40.5, 180), {});
  spiritLamp(55, 32, -15, COL.spirit, 30, true);

  // THE SHELF OF SECRETS (east wall, z -38..-26) - cat 42
  box(72.5, 6, -38, 74.5, 20, -26, COL.darkWood, "wood");
  candle("library", 73.5, 20, -27, true);
  const BOOKS = [
    ["Meowcbeth", COL.orange, 3.0], ["Bones & You", COL.white, 3.3], ["How To Hiss", COL.red, 2.8],
    ["Slime Recipes", C(80, 220, 70), 3.1], ["Litterbox Law", COL.brown, 3.4], ["The Big Book of Naps", COL.purple, 4.4],
    ["Ghost Taxes", COL.blue, 2.9], ["Cat Haiku", COL.yellow, 3.2],
  ];
  const SHELF_ORDER = [4, 6, 2]; // Slime Recipes, The Big Book of Naps, Bones & You
  box(71.8, 9.6, -37.8, 72.5, 10, -26.2, COL.darkWood, "wood");
  BOOKS.forEach((b, i0) => {
    const i = i0 + 1;
    const zz = -37.2 + i0 * 1.45;
    const bk = blk(72.2, 10 + b[2] / 2, zz, 0.6, b[2], 1.2, b[1], "plastic");
    z.click(bk, () => {
      const left = z.isLocked("shelf");
      if (left) return z.fail("The shelf is sulking. Try again in " + left + " s.");
      let prog = z.flag("shelf") || 0;
      if (SHELF_ORDER[prog] === i) {
        prog += 1;
        z.tone(0.8 + prog * 0.25);
        if (prog >= SHELF_ORDER.length) {
          z.flag("shelf", 0);
          z.notify("*CLICK* The bookshelf spins you around into a SECRET ROOM!");
          z.sound("action_get_up.mp3");
          warp(78.5, 11, -23.5, -90);
        } else {
          z.flag("shelf", prog);
          z.notify("*click* You pull '" + b[0] + "'... the shelf rumbles. (" + prog + "/3)");
        }
      } else {
        z.flag("shelf", 0);
        z.lockout(6, "shelf");
        z.fail("You pulled '" + b[0] + "'. Nothing happens. The shelf resets (wait 6 s).");
      }
    }, { distance: 14 });
  });
  sign(72.2, 26.5, -31, 10, 6, "THE SHELF OF SECRETS\nPull 3 books in the right order and the shelf will spin.\nThe order is written on 3 LOST PAGES: one where food is cooked, one where the slime sleeps under the house, and one where the bats live.\nBooks, left to right: Meowcbeth (orange), Bones & You (white), How To Hiss (red), Slime Recipes (green), Litterbox Law (brown), The Big Book of Naps (purple), Ghost Taxes (blue), Cat Haiku (yellow).", 90, { color: COL.trim });

  // ---------------------------------------------------------------------------------- SECRET ROOM (cat 42)
  // sealed: x 75..100, z -45..-20, y 6..24. The only way in is the shelf.
  z.kill(box(76, 6, -44.5, 99.5, 6.6, -21, COL.slime, "neon"));
  box(76, 6, -26, 81, 8, -20.5, COL.darkStone, "concrete");
  const pillars = [[84.5, -24, 9], [89, -27.5, 9.5], [94, -24, 10], [97, -30, 10.5], [92.5, -34, 10], [86.5, -37, 10.5], [81.5, -41, 11]];
  pillars.forEach((p, i0) => {
    const s = i0 === 4 ? 2 : 2.6;
    box(p[0] - s / 2, 6, p[1] - s / 2, p[0] + s / 2, p[2], p[1] + s / 2, COL.stone, "concrete");
  });
  box(88, 6, -44.5, 99.5, 11.5, -40, COL.trim, "concrete");
  box(97.5, 11.5, -44.5, 99.5, 19, -40, COL.purple, "plastic");
  z.kill(ball(89, 16, -31, 2, COL.goo, "neon"));
  box(88.9, 17, -31.1, 89.1, 24, -30.9, COL.iron, "metal", DECOR);
  spiritLamp(88, 20, -26, COL.mint, 30, true);
  const exitPrompt = (p) => z.prompt(p, "Spin the bookshelf back", () => warp(69, 9.5, -32, 90), { distance: 10 });
  exitPrompt(box(76.2, 8, -24, 76.8, 10, -23, COL.gold, "metal"));
  exitPrompt(box(95.8, 11.5, -40.6, 96.2, 13.5, -40.2, COL.gold, "metal"));
  z.cat(42, z.cf(93.5, 11.5, -42.3, 90), {});

  // ---------------------------------------------------------------------------------- BACK HALL + BASEMENT (cat 34)
  // guard rail only past x 81 so the top of the ramp (x 76..81) can be walked onto from the hall
  box(81, 6, 36.6, 98, 9, 37, COL.darkWood, "wood");
  {
    const th = Math.atan(20 / 22);
    const len = Math.sqrt(20 * 20 + 22 * 22);
    const top = K.mul(z.cf(87, -4, 41), K.angles(0, 0, -th));
    rp([len, 1, 7], K.mul(top, K.cf(0, -0.5, 0)), COL.stone, "cobble");
    // rail on the SOUTH (wall) side; the north side must stay open as the entrance
    rp([len, 3, 0.3], K.mul(top, K.cf(0, 1.5, 3.35)), COL.darkWood, "wood", DECOR);
  }
  sign(75.6, 12, 31, 6, 3, "BASEMENT\n(it smells like slime and old cheese)", -90);
  box(95, 6, -15, 97, 13, -13, COL.steel, "metal");
  ball(96, 14, -14, 2.2, COL.steel, "metal");
  spiritLamp(88, 20, 10, COL.spirit, 26, false);
  // basement: landing x 78..100, kill slime x 40..78
  box(78, -16, -9.9, 99.9, -14, 44.9, COL.path, "cobble");
  z.kill(box(40.1, -17, -9.9, 78, -15, 44.9, COL.slime, "neon"));
  const lids = [[73, 38, -13.5, 4], [66, 33, -12.5, 3.5], [60, 26, -12, 3], [66, 19, -11.5, 3], [71, 12, -11, 2.5], [65, 5, -11.5, 3], [58, 0, -11, 2.5], [51, -5, -10.5, 2.5], [46, 2, -11, 3]];
  for (const l of lids) {
    box(l[0] - l[3] / 2, l[2] - 1, l[1] - l[3] / 2, l[0] + l[3] / 2, l[2], l[1] + l[3] / 2, COL.sandstone, "sand");
    box(l[0] - l[3] / 2 + 0.3, -15.5, l[1] - l[3] / 2 + 0.3, l[0] + l[3] / 2 - 0.3, l[2] - 1, l[1] + l[3] / 2 - 0.3, COL.mound, "sand");
  }
  for (const g of [[71.4, 32.9], [65.4, 24.6], [63.4, -0.1], [51.1, 0.4]]) {
    z.kill(cylV(g[0], -11.5, g[1], 7, 1.2, COL.slime, "neon"));
  }
  box(40.5, -16, 9, 49, -10, 20, COL.sandstone, "sand");
  z.cat(34, z.cf(44.5, -10, 14.5, -90), {});
  spiritLamp(60, 0, 20, COL.slime, 40, true);
  spiritLamp(90, 0, 5, COL.slime, 30, false);
  note(99.75, -10, 20, 6, 4, "LOST PAGE 2/3\nThe SECOND book to pull is the TALLEST one.", 90);

  // ---------------------------------------------------------------------------------- FLOOR 2: GALLERY (cat 37)
  box(3, F2 + 0.01, -40, 32, F2 + 0.07, -20, COL.red, "plastic", DECOR);
  const ANCESTORS = [
    ["EARL GREY FUZZLETON", 1820, COL.stone], ["SARDINE THE SECOND", 1755, COL.blue],
    ["MARMALADE THE MAGNIFICENT", 1611, COL.orange], ["UNCLE WHISKERBOTTOM", 1703, COL.white],
    ["OPHELIA FLUFFINGTON", 1648, COL.ink],
  ];
  // word = first letters sorted by birth year (eldest first)
  const WORD = ANCESTORS.slice().sort((a, b) => a[1] - b[1]).map((a) => a[0][0]).join("");
  function portrait(cf, a) {
    rp([4.6, 5.6, 0.3], cf, COL.gold, "metal");
    rp([3.8, 4.8, 0.35], K.mul(cf, K.cf(0, 0, -0.05)), COL.red, "plastic");
    rp([2, 2, 2], K.mul(cf, K.cf(0, 0.6, -0.3)), a[2], "plastic", { shape: "Ball" });
    for (const s of [-1, 1]) {
      rp([0.7, 0.7, 0.3], K.mul(cf, K.cf(s * 0.65, 1.55, -0.3), K.rot(0, 0, 45)), a[2], "plastic");
      rp([0.35, 0.35, 0.35], K.mul(cf, K.cf(s * 0.38, 0.75, -1.2)), COL.yellow, "neon", { shape: "Ball" });
    }
    const plate = rp([4, 1.1, 0.2], K.mul(cf, K.cf(0, -2.1, -0.25)), COL.paper, "plastic");
    z.label(plate, a[0] + "\nborn " + a[1], { face: "front", color: COL.ink, pps: 48 });
  }
  // start at x 8: the NW corner turret (radius 4.5 around (0, -45)) would swallow the first frame
  for (let i = 0; i < 4; i++) portrait(z.cf(8 + i * 5, 32, -44.3, 180), ANCESTORS[i]);
  portrait(z.cf(0.7, 32, -30, -90), ANCESTORS[4]);
  // the empty frame (cat 37 appears here)
  blk(30.5, 31.8, -44.3, 6, 7.4, 0.3, COL.gold, "metal");
  blk(30.5, 31.8, -44.1, 5.2, 6.6, 0.35, COL.ink, "plastic");
  const lectern = box(16, F2, -25, 19, F2 + 3.5, -23, COL.darkWood, "wood");
  sign(34.3, 32, -30, 9, 5.5, "GREAT-GRANDMA WHISKERELLA'S portrait is EMPTY.\nTo wake her, speak the FAMILY WORD at the lectern:\nthe first letters of her ancestors' names, from the ELDEST to the YOUNGEST.", 90, { color: COL.paper, text: COL.ink, mat: "plastic", thick: 0.2 });
  z.prompt(lectern, "Speak the family word", () => {
    if (z.has(37) || z.isRevealed(37)) return z.notify("Great-Grandma Whiskerella is already awake. She is judging your shoes.");
    const left = z.isLocked("portrait");
    if (left) return z.fail("The portraits are ignoring you. Try again in " + left + " s.");
    z.input({ title: "Speak the family word", hint: "first letters, eldest ancestor first", kind: "text", max: 13 }, (text) => {
      if (heard(text, WORD)) {
        z.reveal(37);
        z.notify("The empty frame shimmers... Great-Grandma Whiskerella wakes up!");
      } else {
        z.lockout(10, "portrait");
        z.fail("The portraits gasp in disgust. Wrong word! (wait 10 s)");
      }
    });
  }, { distance: 10 });
  z.cat(37, z.cf(30.5, 31.8, -42.6, 180), { hidden: true, center: true, spin: false });
  spiritLamp(10, 34, -30, COL.spirit, 24, true);
  spiritLamp(25, 34, -30, COL.spirit, 24, false);

  // ---------------------------------------------------------------------------------- FLOOR 2: BEDROOM (cat 38)
  box(3, F2 + 0.01, 18, 32, F2 + 0.07, 43, COL.purple, "plastic", DECOR);
  box(1, F2, 31, 11, F2 + 2, 41, COL.darkWood, "wood");
  box(1.5, F2 + 2, 31.5, 10.5, F2 + 2.5, 41, COL.purple, "plastic");
  box(1.5, F2 + 2.5, 38.5, 10.5, F2 + 3, 40.5, COL.white, "plastic");
  for (const [px, pz] of [[1.3, 31.3], [10.7, 31.3], [1.3, 40.7], [10.7, 40.7]]) cylV(px, F2 + 4, pz, 8, 0.5, COL.darkWood, "wood");
  box(1, F2 + 8, 31, 11, F2 + 8.3, 41, COL.purple, "plastic", DECOR);
  box(1, F2, 27, 4, F2 + 3, 30, COL.darkWood, "wood");
  // (the SW corner x<5, z>40 is inside the solid corner turret, so keep candles out of it)
  box(11.5, F2, 37.5, 14.5, F2 + 3, 40.5, COL.darkWood, "wood");
  candle("bedroom", 2.5, F2 + 3, 28.5, true);
  candle("bedroom", 13, F2 + 3, 39, true);
  box(16, F2, 42, 26, F2 + 4, 44.5, COL.darkWood, "wood");
  candle("bedroom", 18, F2 + 4, 43, true);
  candle("bedroom", 20, F2 + 4, 43, true);
  candle("bedroom", 22, F2 + 4, 43, true);
  candle("bedroom", 24.5, F2 + 4, 43, false);
  box(20, F2, 15.5, 28, 39, 18.5, COL.darkWood, "wood");
  // moon window + sill
  box(27, 29.5, 44.4, 34, 36.5, 44.5, COL.glass, "glass", { decor: true, transparency: 0.5 });
  mk({ shape: "sphere", size: [4.5, 4.5, 0.2], at: [30.5, 33, 44.3], color: COL.moon, material: "neon", decor: true });
  box(26.5, 28, 43.5, 34.5, 28.5, 44.5, COL.darkWood, "wood");
  candle("bedroom", 33.5, 28.5, 44, true);
  const moonLock = box(23.5, F2, 35.5, 25.5, F2 + 4, 37.5, COL.stone, "concrete");
  ball(24.5, F2 + 4.6, 36.5, 1.2, COL.moon, "neon", DECOR);
  sign(34.3, 31, 28, 9, 6, "THE MOON CAGE\nBarkley turns into a golden retriever at full moon, so we locked him up.\nThe 4-digit code:\n1st digit = LIT candles in the FOYER\n2nd = LIT candles in the LIBRARY\n3rd = LIT candles in the DINING ROOM\n4th = LIT candles in this BEDROOM\n(unlit candles are liars)", 90, { color: COL.paper, text: COL.ink, mat: "plastic", thick: 0.2 });
  const MOON_CODE = "" + candleCount.foyer + candleCount.library + candleCount.dining + candleCount.bedroom;
  z.prompt(moonLock, "Enter the moon code", () => {
    if (done(38)) return z.notify("The moon cage is already open. Barkley wants belly rubs.");
    const left = z.isLocked("moon");
    if (left) return z.fail("The moon lock is recharging. Try again in " + left + " s.");
    z.input({ title: "Moon cage code", hint: "4 digits", kind: "digits", max: 5 }, (text) => {
      if (heard(text, MOON_CODE)) {
        z.unlock(38);
        z.notify("AWOOO-meow! The moon cage swings open.");
      } else {
        z.lockout(10, "moon");
        z.fail("Wrong code. Barkley barks at you. (wait 10 s)");
      }
    });
  }, { distance: 10 });
  z.cat(38, z.cf(29, F2, 38), { locked: true });

  // ---------------------------------------------------------------------------------- FLOOR 2: HALL + ATTIC STAIRS
  box(40, F2 + 0.01, 25, 84, F2 + 0.07, 35, COL.red, "plastic", DECOR);
  for (const x of [45, 60]) {
    box(x - 1, F2, 40, x + 1, F2 + 7, 42, COL.steel, "metal");
    ball(x, F2 + 8, 41, 2.2, COL.steel, "metal");
  }
  {
    // The original's attic ladder (a truss) cannot be climbed here, so it is a stair ramp:
    // (88, 25, 4.5) up to (88, 41, 24.5), 38.7 degrees (the engine walks up to 55). The
    // hatch above it starts at z 14.5, where the ramp is at y 33 and the head at 38 < 39.
    const th = Math.atan(16 / 20);
    const len = Math.sqrt(16 * 16 + 20 * 20);
    const top = K.mul(z.cf(88, 33, 14.5), K.angles(-th, 0, 0));
    rp([4, 1, len], K.mul(top, K.cf(0, -0.5, 0)), COL.wood, "wood");
    for (const s of [-1, 1]) rp([0.3, 2.5, len], K.mul(top, K.cf(s * 2.15, 1.25, 0)), COL.darkWood, "wood");
    for (let i = 1; i <= 12; i++) rp([4, 0.12, 0.3], K.mul(top, K.cf(0, 0.06, -len / 2 + i * (len / 13))), COL.darkWood, "wood", DECOR);
  }
  sign(99.3, 30, 10, 6, 3, "ATTIC (up the stairs)\nDo NOT touch the purple goo.", 90);
  spiritLamp(70, 34, 28, COL.spirit, 30, false);
  spiritLamp(88, 34, -15, COL.spirit, 30, false);

  // ---------------------------------------------------------------------------------- ATTIC (cat 40)
  box(0.5, ATT, -44.5, 12, ATT + 1, 44.5, COL.wood, "wood");
  box(78, ATT, -44.5, 99.5, ATT + 1, 14.5, COL.wood, "wood");
  box(78, ATT, 24.5, 99.5, ATT + 1, 44.5, COL.wood, "wood");
  box(78, ATT, 14.5, 85.5, ATT + 1, 24.5, COL.wood, "wood");
  box(90.5, ATT, 14.5, 99.5, ATT + 1, 24.5, COL.wood, "wood");
  z.kill(box(12, ATT, -44.5, 78, ATT + 0.3, 44.5, COL.goo, "neon"));
  // rafters stay near the ridge (|z| <= 7) with low tops: the sloped roof's underside is at
  // y ~ 59.9 - 0.4565*|z|, and a head bump there would cut the jump short (head apex = top + ~11.4)
  const rafters = [[72, 0, 42.5, 1.6, 10], [65, 4, 43.5, 1.6, 6], [58, -2, 43.5, 1.6, 4], [52, -6, 44.5, 2, 2], [40, -3, 44, 8, 1.6], [31, 0, 45, 2, 2], [26, 5, 45.5, 2, 2], [20, 1, 44, 1.6, 6]];
  for (const r of rafters) {
    box(r[0] - r[3] / 2, r[2] - 1, r[1] - r[4] / 2, r[0] + r[3] / 2, r[2], r[1] + r[4] / 2, COL.darkWood, "wood");
    // a post down into the goo so the rafters do not float
    if (r[3] <= 2) box(r[0] - 0.3, ATT + 0.3, r[1] - 0.3, r[0] + 0.3, r[2] - 1, r[1] + 0.3, COL.darkWood, "wood", DECOR);
  }
  for (const o of [[61, 48, 11.5], [68, 46, -8], [48, 49, -15], [28, 50.5, -6]]) {
    z.kill(ball(o[0], o[1], o[2], 2, COL.goo, "neon"));
    box(o[0] - 0.08, o[1] + 1, o[2] - 0.08, o[0] + 0.08, 53, o[2] + 0.08, COL.iron, "metal", DECOR);
  }
  for (let i = 1; i <= 4; i++) box(2 + i * 18, 50, -10, 2.2 + i * 18, 53, 10, COL.white, "plastic", { decor: true, transparency: 0.7 });
  box(5.9, 48.5, -0.1, 6.1, 61, 0.1, COL.brown, "plastic", DECOR);
  z.cat(40, z.cf(6, 46, 0, -90), { center: true });
  spiritLamp(92, 49, 0, COL.goo, 34, false);
  spiritLamp(6, 47, 15, COL.goo, 28, true);
  // music box (plays the Phantom's song) + page 3
  const musicBox = box(94, ATT + 1, -9, 97, ATT + 3, -7, C(150, 60, 90), "wood");
  blk(95.5, ATT + 3.15, -8, 2.6, 0.3, 1.6, COL.gold, "metal", DECOR);
  let song = null;
  const playSong = () => {
    if (song) return;
    song = { t0: z.time(), next: 0 };
  };
  z.heartbeat(() => {
    if (!song) return;
    const el = z.time() - song.t0;
    while (song && song.next < MELODY.length && el >= song.next * 0.6) {
      z.tone(PITCH[MELODY[song.next] - 1]);
      song.next += 1;
    }
    if (song && song.next >= MELODY.length && el >= MELODY.length * 0.6) song = null;
  });
  z.click(musicBox, playSong, { distance: 16 });
  z.prompt(musicBox, "Play the music box (the Phantom's song)", playSong, { distance: 8 });
  note(99.3, ATT + 4, 10, 5, 3.5, "LOST PAGE 3/3\nThe LAST book to pull is about what a Skeleton Cat is made of.", 90);

  // ---------------------------------------------------------------------------------- GRAVEYARD
  box(-150, -0.9, 35, -40, 0.04, 150, COL.dirt, "sand", DECOR);
  function fence(x0, z0, x1, z1) {
    const horiz = z0 === z1;
    const len = horiz ? x1 - x0 : z1 - z0;
    for (const y of [1.4, 3.2]) {
      if (horiz) box(x0, y, z0 - 0.15, x1, y + 0.3, z0 + 0.15, COL.iron, "metal");
      else box(x0 - 0.15, y, z0, x0 + 0.15, y + 0.3, z1, COL.iron, "metal");
    }
    const n = Math.floor(len / 14);
    for (let i = 0; i <= n; i++) {
      const t = n === 0 ? 0 : i / n;
      const x = horiz ? x0 + (x1 - x0) * t : x0;
      const zz = horiz ? z0 : z0 + (z1 - z0) * t;
      box(x - 0.25, 0, zz - 0.25, x + 0.25, 4.2, zz + 0.25, COL.iron, "metal");
    }
  }
  fence(-150, 35, -101, 35);
  fence(-89, 35, -40, 35);
  fence(-150, 150, -40, 150);
  fence(-150, 35, -150, 150);
  fence(-40, 35, -40, 150);
  box(-101, 0, 34.7, -100.4, 6, 35.3, COL.iron, "metal");
  box(-89.6, 0, 34.7, -89, 6, 35.3, COL.iron, "metal");
  blk(-95, 7.5, 34.6, 11, 0.4, 0.3, COL.iron, "metal", DECOR);

  // tombstones (cat 36 clue). sym: fish / skull / moon / yarn
  const GRAVES = [
    [-125, 50, "WHISKERS", 1790, 1802, "skull"], [-105, 50, "SIR FLUFF", 1850, 1866, "moon"],
    [-85, 50, "BEANS", 1880, 1912, "fish"], [-65, 50, "NUGGET", 1901, 1919, "yarn"],
    [-45, 50, "MOCHI", 1777, 1781, "skull"],
    [-125, 66, "TOFU", 1849, 1867, "fish"], [-105, 66, "PICKLES", 1800, 1811, "yarn"],
    [-85, 66, "GRAVY", 1823, 1839, "moon"], [-65, 66, "OREO", 1860, 1873, "skull"],
    [-45, 66, "WAFFLES", 1870, 1888, "fish"],
    [-125, 82, "BISCUIT", 1811, 1826, "moon"], [-105, 82, "NOODLE", 1840, 1853, "skull"],
    [-85, 82, "PUDDING", 1830, 1844, "yarn"], [-65, 82, "SPROUT", 1780, 1795, "fish"],
    [-45, 82, "MUFFIN", 1899, 1910, "moon"],
  ];
  for (const g of GRAVES) {
    const [x, zz] = g;
    const slab = box(x - 2, 0, zz - 0.4, x + 2, 3.5, zz + 0.4, COL.stone, "concrete");
    mk({ shape: "cylinder", size: [4, 0.8, 4], at: [x, 3.5, zz], rot: [90, 0, 0], color: COL.stone, material: "concrete" });
    z.label(slab, "R.I.P.\n" + g[2] + "\n" + g[3] + " - " + g[4], { face: "front", color: COL.ink, pps: 48 });
    box(x - 1.6, -0.6, zz + 0.5, x + 1.6, 0.35, zz + 6, COL.mound, "sand", DECOR);
    const sy = 4.6, sz = zz - 0.5;
    if (g[5] === "fish") {
      blk(x - 0.15, sy, sz, 1.2, 0.6, 0.2, COL.orange, "plastic", DECOR);
      blk(x + 0.75, sy, sz, 0.35, 0.7, 0.2, COL.orange, "plastic", DECOR);
    } else if (g[5] === "skull") {
      ball(x, sy, sz, 0.9, COL.white, "plastic", DECOR);
    } else if (g[5] === "moon") {
      mk({ shape: "cylinder", size: [1, 0.2, 1], at: [x, sy, sz], rot: [90, 0, 0], color: COL.yellow, material: "plastic", decor: true });
    } else {
      ball(x, sy, sz, 0.9, C(255, 120, 190), "plastic", DECOR);
    }
  }
  const GRAVE_CODE = GRAVES.filter((g) => g[5] === "fish").sort((a, b) => a[0] - b[0]).map((g) => String(g[4] % 10)).join("");

  // the crypt (x -122..-98, z 118..140), door facing north
  box(-122, 0, 118, -98, 0.2, 140, COL.darkStone, "concrete");
  wallX(118.5, -122, -98, 0, 14, [[-114, -106, 10]], COL.stone, "concrete");
  wallX(139.5, -122, -98, 0, 14, null, COL.stone, "concrete");
  wallZ(-121.5, 118, 140, 0, 14, null, COL.stone, "concrete");
  wallZ(-98.5, 118, 140, 0, 14, null, COL.stone, "concrete");
  box(-123, 14, 117, -97, 15, 141, COL.darkStone, "concrete");
  box(-119, 15, 121, -101, 16.5, 137, COL.darkStone, "concrete");
  ball(-110, 17.5, 129, 2, COL.mint, "neon", DECOR);
  for (const x of [-120, -116, -104, -100]) cylV(x, 7, 116, 14, 1.6, COL.white, "marble");
  box(-122, 14, 114.5, -98, 15, 118, COL.darkStone, "concrete");
  box(-114, 10.5, 117.8, -106, 13.5, 118, COL.trim, "concrete", DECOR);
  ball(-110, 11, 130, 1.4, COL.mint, "neon", { decor: true, ...lamp(C(120, 255, 140), 22, 1.4) });
  note(-110, 7, 139.0, 14, 6, "THE ZOMBIE'S RULES\n(for the grave keypad outside)\nZombies only remember graves with a FISH carved on top.\nTake the LAST digit of each fish grave's DEATH year.\nRead them from WEST to EAST (the spawn side is west).\nThat is the 4-digit code.\n\nP.S. The coffin here needs the BONE KEY. The groundskeeper keeps leaving it on rooftops.", 0);
  // Mr. Calcium's coffin (cat 30)
  box(-113, 0.2, 127, -107, 2, 135, COL.darkWood, "wood");
  const coffinLock = box(-110.6, 0.6, 126.6, -109.4, 1.8, 127, COL.gold, "metal");
  z.prompt(coffinLock, "Use Bone Key", () => {
    if (done(30)) return z.notify("The coffin is already open. Mr. Calcium rattles happily.");
    if (z.flag("boneKey")) {
      z.unlock(30);
      z.sound("action_get_up.mp3");
      z.notify("*clunk* The Bone Key fits! The coffin creaks open.");
    } else {
      z.fail("Locked. You need the Bone Key.");
    }
  }, { distance: 10 });
  z.cat(30, z.cf(-110, 2, 131), { locked: true });

  // groundskeeper's shed + bone key on the roof
  box(-148, 0, 94, -136, 8, 106, COL.wood, "wood");
  box(-148.5, 8, 93.5, -135.5, 8.6, 106.5, COL.darkWood, "wood");
  box(-144, 0, 93.8, -140, 6, 94, COL.darkWood, "wood", DECOR);
  box(-134, 0, 88, -131, 3, 91, COL.sandstone, "wood");
  cylV(-133.5, 2.75, 97, 5.5, 3, COL.wood, "wood");
  const keyBone = rp([2, 0.4, 0.4], z.cf(-142, 9.1, 100), COL.white, "neon", { decor: true, shape: "Cylinder", ...lamp(C(220, 240, 255), 10, 1) });
  const keyEnds = [];
  for (const s of [-1, 1]) {
    keyEnds.push(ball(-142 + s * 1.05, 9.1, 100.15, 0.55, COL.white, "neon", DECOR));
    keyEnds.push(ball(-142 + s * 1.05, 9.1, 99.85, 0.55, COL.white, "neon", DECOR));
  }
  z.prompt(keyBone, "Take the Bone Key", () => {
    if (z.flag("boneKey")) return z.notify("You already have the Bone Key. It is in your pocket. Rattling.");
    z.flag("boneKey", true);
    z.sound("action_jump_land.mp3");
    z.notify("You got the BONE KEY! It opens something in the crypt.");
    keyBone.show(false);
    for (const e of keyEnds) e.show(false);
  }, { distance: 8 });

  // the zombie's open grave + keypad (cat 36)
  box(-88, -0.5, 107, -82, 0.1, 113, COL.ink, "sand", DECOR);
  box(-81, 0, 107, -78, 1.4, 113, COL.mound, "sand");
  const keypad = box(-88, 0, 103.6, -82, 4.5, 104.4, COL.stone, "concrete");
  z.label(keypad, "GRAVE KEYPAD\nSpeak to the dead (4 digits).\nThe rules are carved inside the crypt.", { face: "front", color: COL.mint, pps: 48, stroke: true });
  z.prompt(keypad, "Speak to the dead", () => {
    if (done(36)) return z.notify("Zom-Bean is already up. He wants treaaats.");
    const left = z.isLocked("grave");
    if (left) return z.fail("The dead are napping. Try again in " + left + " s.");
    z.input({ title: "Speak to the dead", hint: "4 digits", kind: "digits", max: 5 }, (text) => {
      if (heard(text, GRAVE_CODE)) {
        z.unlock(36);
        z.sound("action_get_up.mp3");
        z.notify("The ground rumbles... 'TREAAATS!' Zom-Bean rises!");
      } else {
        z.lockout(10, "grave");
        z.fail("The dead say: 'wrong, bestie.' (wait 10 s)");
      }
    });
  }, { distance: 10 });
  z.cat(36, z.cf(-85, 0.1, 110), { locked: true });

  // the great dead tree + floating ghost gravestones (cat 29)
  const TX = -62, TZ = 125;
  cylV(TX, 17, TZ, 34, 4, COL.bark, "wood");
  [[6, 24, 3], [-7, 20, -4], [-2, 31, 6]].forEach((br, i0) => {
    const d = 1.2 - (i0 + 1) * 0.1;
    beam([TX, br[1] - 4, TZ], [TX + br[0], br[1] + 2, TZ + br[2]], d, COL.bark, "wood", DECOR);
  });
  for (let i = 1; i <= 9; i++) {
    const a = rad(45 * i);
    blk(TX + 8.5 * Math.sin(a), 3 * i - 0.4, TZ + 8.5 * Math.cos(a), 3.5, 0.8, 2.6, COL.ghost, "glass", { transparency: 0.35 }, 45 * i);
  }
  {
    const a = rad(450);
    const x = TX + 8.5 * Math.sin(a), zz = TZ + 8.5 * Math.cos(a);
    box(x - 2.5, 28.5, zz - 2.5, x + 2.5, 29.5, zz + 2.5, COL.wood, "wood");
    z.cat(29, z.cf(x + 0.5, 29.5, zz, -90), {});
  }
  // floating ghost wisps
  [[-120, 40], [-70, 95], [-100, 95], [-135, 140], [-50, 140], [-80, 60]].forEach((w, i0) => {
    const i = i0 + 1;
    const g = ball(w[0], 7 + (i % 3), w[1], 1.6, COL.ghost, "neon", { decor: true, transparency: 0.35 });
    z.tag(g, "Bob", { Amp: 1.5, Period: 3 + i * 0.4 });
  });

  // ---------------------------------------------------------------------------------- HEDGE MAZE (cat 41)
  let spawnSeq = 0; // bumped on every respawn; carrying the head records the value it was picked up at
  const MX = 11, MZ = 12, CELL = 10, X0 = -165, Z0 = -165;
  const EI = 6; // entrance column (south side)
  const GI = 5, GJ = 5; // goal cell
  let seed = 13371337;
  const rnd = (n) => { seed = (seed * 16807) % 2147483647; return (seed % n) + 1; };
  const grid = () => Array.from({ length: MX }, () => new Array(MZ).fill(false));
  const visited = grid(), east = grid(), south = grid();
  {
    const stack = [[0, 0]];
    visited[0][0] = true;
    while (stack.length) {
      const [i, j] = stack[stack.length - 1];
      const opts = [];
      if (i > 0 && !visited[i - 1][j]) opts.push([-1, 0]);
      if (i < MX - 1 && !visited[i + 1][j]) opts.push([1, 0]);
      if (j > 0 && !visited[i][j - 1]) opts.push([0, -1]);
      if (j < MZ - 1 && !visited[i][j + 1]) opts.push([0, 1]);
      if (!opts.length) { stack.pop(); continue; }
      const d = opts[rnd(opts.length) - 1];
      const ni = i + d[0], nj = j + d[1];
      if (d[0] === 1) east[i][j] = true;
      else if (d[0] === -1) east[ni][j] = true;
      else if (d[1] === 1) south[i][j] = true;
      else south[i][nj] = true;
      visited[ni][nj] = true;
      stack.push([ni, nj]);
    }
  }
  const HH = 9;
  // vertical hedge walls (along z) at x line i
  for (let i = 0; i <= MX; i++) {
    let run0 = null;
    for (let j = 0; j <= MZ; j++) {
      const present = j < MZ && (i === 0 || i === MX || !east[i - 1][j]);
      if (present && run0 === null) run0 = j;
      else if (!present && run0 !== null) {
        const x = X0 + i * CELL;
        box(x - 1, 0, Z0 + run0 * CELL - 1, x + 1, HH, Z0 + j * CELL + 1, COL.hedge, "grass");
        run0 = null;
      }
    }
  }
  // horizontal hedge walls (along x) at z line j
  for (let j = 0; j <= MZ; j++) {
    let run0 = null;
    for (let i = 0; i <= MX; i++) {
      let present = false;
      if (i < MX) {
        if (j === 0) present = true;
        else if (j === MZ) present = i !== EI;
        else present = !south[i][j - 1];
      }
      if (present && run0 === null) run0 = i;
      else if (!present && run0 !== null) {
        const zz = Z0 + j * CELL;
        box(X0 + run0 * CELL - 1, 0, zz - 1, X0 + i * CELL + 1, HH, zz + 1, COL.hedge, "grass");
        run0 = null;
      }
    }
  }
  // path from the entrance to the goal (BFS)
  const nbrs = (i, j) => {
    const out = [];
    if (i > 0 && east[i - 1][j]) out.push([i - 1, j]);
    if (i < MX - 1 && east[i][j]) out.push([i + 1, j]);
    if (j > 0 && south[i][j - 1]) out.push([i, j - 1]);
    if (j < MZ - 1 && south[i][j]) out.push([i, j + 1]);
    return out;
  };
  const mazePath = [];
  {
    const prev = new Map();
    const startKey = EI * 100 + (MZ - 1);
    prev.set(startKey, -1);
    const queue = [[EI, MZ - 1]];
    for (let qi = 0; qi < queue.length; qi++) {
      const c = queue[qi];
      if (c[0] === GI && c[1] === GJ) break;
      for (const nb of nbrs(c[0], c[1])) {
        const key = nb[0] * 100 + nb[1];
        if (!prev.has(key)) { prev.set(key, c[0] * 100 + c[1]); queue.push(nb); }
      }
    }
    let key = GI * 100 + GJ;
    while (key !== undefined && key !== -1) {
      mazePath.unshift([Math.floor(key / 100), key % 100]);
      key = prev.get(key);
    }
  }
  const cellCenter = (i, j) => [X0 + i * CELL + CELL / 2, Z0 + j * CELL + CELL / 2];
  // low thorn hedges across the corridor on every 3rd path cell (jump over them)
  function thorn(i, j, alongX) {
    const [x, zz] = cellCenter(i, j);
    const t = alongX
      ? box(x - 0.6, 0, zz - 3.9, x + 0.6, 1.6, zz + 3.9, COL.thorn, "concrete")
      : box(x - 3.9, 0, zz - 0.6, x + 3.9, 1.6, zz + 0.6, COL.thorn, "concrete");
    z.kill(t);
    for (const s of [-1, 1]) {
      const bx = alongX ? x : x + s * 2;
      const bz = alongX ? zz + s * 2 : zz;
      ball(bx, 1.8, bz, 0.6, C(255, 40, 60), "neon", DECOR);
    }
  }
  // mazePath is 1-based in the original: k = 3, 6, ... up to #path - 2
  for (let k = 3; k <= mazePath.length - 2; k += 3) {
    const a = mazePath[k - 2], b = mazePath[k - 1];
    thorn(b[0], b[1], a[0] !== b[0]);
  }
  // the head pedestal at the goal
  {
    const [x, zz] = cellCenter(GI, GJ);
    // low pedestal (1.5): from a 3-stud one a jump (~6.4) would nearly reach the 9-stud hedge tops
    const ped = box(x - 1.5, 0, zz - 1.5, x + 1.5, 1.5, zz + 1.5, COL.stone, "marble");
    const HEAD = COL.stone;
    ball(x, 2.5, zz, 2, HEAD, "plastic", DECOR);
    for (const s of [-1, 1]) {
      rp([0.7, 0.7, 0.25], K.mul(z.cf(x + s * 0.6, 3.5, zz), K.rot(0, 0, 45)), HEAD, "plastic", DECOR);
      ball(x + s * 0.4, 2.7, zz - 0.9, 0.35, COL.mint, "neon", DECOR);
    }
    ball(x, 7, zz, 1.2, COL.mint, "neon", { decor: true, ...lamp(C(80, 255, 120), 20, 1.5) });
    z.prompt(ped, "Pick up Sir Purrcival's head", () => {
      z.flag("head", spawnSeq);
      z.sound("action_jump_land.mp3");
      z.notify("You picked up the HEAD. 'Hello! Take me to my body, please. And don't die, I'll fall out.'");
    }, { distance: 10 });
  }
  // Sir Purrcival's pedestal by the maze entrance
  const headless = box(-102, 0, -35, -98, 2, -31, COL.stone, "marble");
  sign(-108, 3, -31, 6.5, 4, "SIR PURRCIVAL HAS LOST HIS HEAD (again).\nIt rolled into the HEDGE MAZE (thorny!).\nBring it back... but if you get spooked to death on the way, you'll drop it!", 180, { color: COL.paper, text: COL.ink, mat: "plastic", thick: 0.2 });
  // A respawn (death, the STUCK button, falling) drops the head. Every one of those moves the
  // avatar further in one tick than walking or falling ever can, so a jump in position is the
  // spawn counter; the bookshelf warp above is the one deliberate exception.
  let lastFeet = null;
  const dropHead = () => {
    spawnSeq += 1;
    if (z.flag("head") !== undefined && z.flag("head") !== null) {
      z.flag("head", null);
      z.fail("You got spooked and DROPPED Sir Purrcival's head! It rolled back into the hedge maze.");
    }
  };
  z.heartbeat(() => {
    const p = z.player.pos();
    if (lastFeet && skipJump <= 0 && Math.hypot(p[0] - lastFeet[0], p[1] - lastFeet[1], p[2] - lastFeet[2]) > 12) dropHead();
    if (skipJump > 0) skipJump -= 1;
    lastFeet = p;
  });
  const offDied = z.ctx.events.on("player:died", () => dropHead());
  z.onLeave(() => { if (typeof offDied === "function") offDied(); });
  z.prompt(headless, "Give back his head", () => {
    if (done(41)) return z.notify("He already has his head back. He keeps nodding at you.");
    const held = z.flag("head");
    if (held === undefined || held === null) return z.fail("You don't have his head. It's somewhere in the hedge maze.");
    z.flag("head", null);
    if (held === spawnSeq) {
      z.unlock(41);
      z.notify("*pop* The head is back on! Sir Purrcival can see again!");
    } else {
      z.fail("You got spooked on the way and DROPPED the head. It rolled back into the maze!");
    }
  }, { distance: 10 });
  z.cat(41, z.cf(-100, 2, -33, 180), { locked: true });

  // ---------------------------------------------------------------------------------- PUMPKIN PATCH (cat 32)
  box(20, -0.9, 85, 82, 0.04, 138, COL.mound, "sand", DECOR);
  for (let i = 1; i <= 6; i++) box(22, 0.04, 86 + i * 8, 80, 0.12, 86.4 + i * 8, C(60, 120, 40), "grass", DECOR);
  const PUMPKINS = [[30, 95, 4.5], [42, 108, 2.5], [56, 92, 6.5], [66, 110, 3.5], [76, 96, 5.5]];
  const PUMP_ORDER = PUMPKINS.map((_, i) => i + 1).sort((a, b) => PUMPKINS[a - 1][2] - PUMPKINS[b - 1][2]);
  PUMPKINS.forEach((p, i0) => {
    const idx = i0 + 1;
    const [x, zz, d] = p;
    const h = d * 0.8;
    const body = mk({ shape: "sphere", size: [d, h, d], at: [x, h / 2, zz], color: COL.orange, material: "plastic" });
    cylV(x, h + 0.3, zz, 0.8, d * 0.12 + 0.2, C(60, 120, 40), "plastic", DECOR);
    for (const s of [-1, 1]) {
      rp([d * 0.16, d * 0.16, 0.2], K.mul(z.cf(x + s * d * 0.18, h * 0.62, zz - d * 0.47), K.rot(0, 0, 45)), COL.yellow, "neon", DECOR);
    }
    blk(x, h * 0.35, zz - d * 0.46, d * 0.4, d * 0.1, 0.2, COL.yellow, "neon", DECOR);
    z.click(body, () => {
      if (done(32)) return z.notify("The pumpkins are already happy.");
      let prog = z.flag("pumpkin") || 0;
      if (PUMP_ORDER[prog] === idx) {
        prog += 1;
        z.tone(0.7 + prog * 0.2);
        if (prog >= PUMP_ORDER.length) {
          z.flag("pumpkin", 0);
          z.unlock(32);
          z.notify("All the pumpkins glow! Sir Squashington is free!");
        } else {
          z.flag("pumpkin", prog);
          z.notify("Boop! (" + prog + "/5)");
        }
      } else {
        z.flag("pumpkin", 0);
        z.fail("Wrong pumpkin! Start again from the tiniest.");
      }
    }, { distance: 22 });
  });
  sign(50, 3, 84, 10, 4, "THE PUMPKIN PROTOCOL\nBoop the pumpkins from TINIEST to CHONKIEST.\nMess up and you start over.", 0, { both: true });
  // scarecrow
  cylV(50, 5, 136, 10, 0.8, COL.darkWood, "wood");
  box(45, 7, 135.7, 55, 7.6, 136.3, COL.darkWood, "wood");
  ball(50, 10.5, 136, 2.2, BREAD, "plastic");
  cylV(50, 11.9, 136, 0.9, 1.8, COL.ink, "plastic");
  z.cat(32, z.cf(50, 0, 130), { locked: true });

  // ---------------------------------------------------------------------------------- WITCH TOWER (cat 35)
  const WX = 150, WZ = -130;
  const wpos = (r, deg) => { const a = rad(deg); return [WX + r * Math.sin(a), WZ + r * Math.cos(a)]; };
  // basin rim (12 segments, top y 3) and slime moat (kill, top 2.2)
  for (let k = 0; k <= 11; k++) {
    const deg = k * 30;
    const [x, zz] = wpos(24, deg);
    blk(x, 1.5, zz, 13.4, 3, 2, COL.darkStone, "concrete", null, deg);
    const [sx, sz] = wpos(16.5, deg);
    z.kill(blk(sx, 1.1, sz, 12.06, 2.2, 12.6, COL.slime, "neon", null, deg));
  }
  cylV(WX, 1.75, WZ, 3.5, 22, COL.stone, "concrete");
  for (const r of [19, 14.5]) {
    const [x, zz] = wpos(r, 270);
    box(x - 1.5, 0, zz - 1.5, x + 1.5, 3.5, zz + 1.5, COL.stone, "concrete");
  }
  wedge([4, 3, 6], z.cf(WX - 28, 1.5, WZ, 90), COL.path, "cobble");
  cylV(WX, 27.75, WZ, 48.5, 16, COL.darkStone, "brick");
  cylV(WX, 52.5, WZ, 1, 22, COL.trim, "concrete");
  cylV(WX, 56, WZ, 6, 14, COL.trim, "concrete");
  cylV(WX, 54, WZ, 1, 14.4, COL.goo, "neon", DECOR);
  cylV(WX, 62, WZ, 6, 9, COL.trim, "concrete");
  cylV(WX, 67.5, WZ, 5, 5, COL.trim, "concrete");
  rp([4, 2.2, 2.2], K.mul(z.cf(WX + 1.5, 70.5, WZ), K.rot(0, 0, 60)), COL.trim, "concrete", { shape: "Cylinder" });
  for (let k = 0; k <= 5; k++) {
    const [x, zz] = wpos(8.05, k * 60 + 15);
    blk(x, 12 + k * 6, zz, 1.2, 3, 0.3, COL.goo, "neon", DECOR, k * 60 + 15);
  }
  const STEP = C(110, 80, 140);
  for (let i = 1; i <= 13; i++) {
    const deg = 270 + i * 32;
    const r = i % 2 === 0 ? 13 : 12.2;
    const [x, zz] = wpos(r, deg);
    const s = i % 4 === 0 ? 2.2 : 3.2;
    blk(x, 3.5 + i * 3 - 0.4, zz, s, 0.8, s, STEP, "wood", null, deg);
  }
  {
    const [x, zz] = wpos(14.5, 270 + 14 * 32);
    blk(x, 45, zz, 7, 1, 7, STEP, "wood", null, 270 + 14 * 32);
    z.cat(35, z.cf(x, 45.5, zz, 90), {});
  }
  ball(WX, 20, WZ - 8.6, 1.4, COL.slime, "neon", { decor: true, ...lamp(COL.slime, 30, 1.2) });

  // ---------------------------------------------------------------------------------- AMBIENCE
  for (const [x, zz] of [[-170, 60], [-160, 175], [-20, 110], [-30, 175], [10, -110], [90, -100], [125, 60], [175, 175], [185, -40], [110, -175], [-5, -170], [-182, -100]]) {
    cylV(x, 9, zz, 18, 2.5, COL.bark, "wood");
    for (let b = 1; b <= 3; b++) {
      const a = rad(b * 120 + x);
      beam([x, 10 + b * 2, zz], [x + Math.sin(a) * 6, 15 + b * 2, zz + Math.cos(a) * 6], 0.8, COL.bark, "wood", DECOR);
    }
  }
  [[-140, 130], [-55, 45], [-130, 75], [120, -100], [175, -150], [130, -165], [160, 90], [175, 120], [140, 150], [90, 160], [-15, 60], [-170, -170]].forEach((m, i0) => {
    const i = i0 + 1;
    const hgt = 1.5 + (i % 3) * 0.8;
    cylV(m[0], hgt / 2, m[1], hgt, 0.6, COL.paper, "plastic", DECOR);
    mk({ shape: "sphere", size: [2.2, 0.9, 2.2], at: [m[0], hgt, m[1]], color: i % 2 === 0 ? COL.mint : COL.spirit, material: "neon", decor: true });
  });
  // cauldron circle (south-east)
  for (let i = 0; i <= 4; i++) {
    const a = rad(i * 72);
    const x = 150 + Math.sin(a) * 14, zz = 130 + Math.cos(a) * 14;
    mk({ shape: "sphere", size: [5, 4, 5], at: [x, 1.6, zz], color: COL.iron, material: "metal" });
    const s = cylV(x, 3.4, zz, 0.2, 3.6, COL.slime, "neon", DECOR);
    z.tag(s, "Bob", { Amp: 0.15, Period: 1 + i * 0.2 });
  }
  ball(60, 235, -165, 46, COL.moon, "neon", DECOR);
  // Night horizon: the engine's sky gradient keeps a fixed pale horizon band that no lighting
  // config reaches, so fog-coloured walls on the zone's outer edge hide it (one draw call).
  // They sit on the square build bound (|x|, |z| = 194..195), outside everything: a circle of
  // panels at radius 190 used to cut straight through the witch tower basin (r ~198).
  const NIGHT = C(42, 26, 60);
  for (const s of [-1, 1]) {
    box(-195, -20, s * 194.5 - 0.5, 195, 140, s * 194.5 + 0.5, NIGHT, "neon", DECOR);
    box(s * 194.5 - 0.5, -20, -195, s * 194.5 + 0.5, 140, 195, NIGHT, "neon", DECOR);
  }
}
