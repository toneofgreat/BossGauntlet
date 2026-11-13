// src/games/cats/scripts/zones/z1.js - Zone 1: COZY MEADOW (cats 1-14), ported from the original
// Find The Cats (server Zones/Z1.lua + shared Cats/Z1.lua) against the zonekit contract (spec 28 §6).
//
// Sunny rolling hills, a rainbow welcome arch, a tulip-stripe flower field, a pond with a dock, a
// picnic, a red barn with a hay-bale staircase, a cow pen, a vegetable garden, a windmill, cherry
// trees and Lookout Hill with a wooden tower and a telescope.
//
// Coordinates are zone-local: x east, z south, ground top y = 0. Spawn is at the WEST edge
// (-185, 0, 0); the main dirt path runs east along z = 0.
//
// ================================ SOLUTIONS (every cat) ================================
// The "MEADOW CAT CENSUS" board next to the spawn lists where all 14 cats are, in plain words.
//
// EASY (in plain sight, near paths)
//  1 Sir Loafs-a-Lot ........ just past the rainbow arch, beside the main path (-136, 0, -9).
//  2 Kevin (One Brain Cell) . in the striped flower field north of the path, west of the walkway (-86, -120).
//  3 Sunny McNapface ........ lying in the glowing sunbeam column west of the pond (-112, 52).
//  4 Boxford ................ in a box in the MIDDLE of the main path (70, 1).
//  5 The Sandwich Bandit .... on top of the picnic table (follow the picnic branch path north) (-112, 3.2, -55).
//  6 Haybert ................ among the loose hay bales in front of the barn door (2, -52).
//  7 Princess Petalpaws ..... on the white spotlit pedestal in the flower field (-50, 1, -135).
//  8 Quackers the Confused .. floating on the pond's south-east side (-32, -3.6, 88); tap it from the
//                             shore or wade in down a ramp.
//  9 Moo-ffin ............... inside the fenced cow pen west of the barn (gate on the south side) (-17, -84).
// 10 Propeller Pete ......... at the foot of the windmill (south-west side) (116, 90).
// 11 Scare-Meow ............. on the post in the middle of the vegetable garden (62, 2, 42).
// 12 Binocular Barry ........ on the summit of Lookout Hill (north-east), next to the tower. Follow the
//                             stepping stones up the hill.
//
// MEDIUM
// 13 Weathervane Wendy ...... on the barn ROOF ridge (20, 24.6, -86). Climb the hay-bale staircase stacked
//                             against the barn's EAST wall (6 steps, each 3 studs higher, by the "DO NOT CLIMB
//                             THE HAY" sign), hop onto the roof and walk up the slope to the ridge catwalk
//                             (a small hop onto the catwalk itself).
//                             Clues: census board ("ON the barn"), the hay sign, the telescope on Lookout tower.
// 14 Snorkel Steve .......... UNDER the dock in the pond (-49, -7, 68). Walk down either sloped ramp into the pond
//                             (east ramp near the dock, west ramp at the far side) and wade under the dock planks.
//                             Clues: census board ("UNDER the dock"), the "PLEASE STOP CLOMPING" sign on the dock,
//                             bubbles rising beside the dock, the telescope.
// Fun extras (no cats): telescope on Lookout tower (prompt) gives the Medium hints; picnic basket (prompt),
// cow-pen bell (tap) and windmill door (prompt) are just jokes/sounds.
//
// PORT NOTES (OofWorld physics, ARCHITECTURE §5: gravity 196.2, jump 50 -> apex 6.37 studs, walk 16,
// step-up 1.1, walkable slope <= 55 deg):
//  - Hay staircase: each column is 3 studs higher and 4 studs deeper than the last - a 3-stud hop with
//    3.3 studs of headroom. The top column (y 18, x 35..41) overlaps the roof eave, whose surface rises
//    west from y 16 at x 36 (26.6 deg, walkable) to the ridge (y 24); the catwalk top is y 24.6.
//  - The lookout tower's truss ladder becomes a real staircase (1-stud risers <= the 1.1 step-up,
//    1.3 deep), running south from the gap in the deck railing down to the hill and ending <= 1 stud
//    above the grass, because the engine has no climbing.
//  - Hills are sunk spheres; their steepest walkable edge is ~50 deg (< 55).
//  - The pond is 7 deep (> the 6.37 jump apex), so the two 26.6-deg sand ramps are the way in and out.
//  - Small non-colliding ornaments (flowers, leaves, veggies, rainbow, clouds...) are merged into two
//    vertex-coloured meshes owned by this file (see makeDeco) so the zone stays within its draw calls;
//    everything you can stand on, touch or that moves is a zonekit part.

// ============================================================================================
// LOOKS (pure: catkit K only)
// ============================================================================================

export const looks = {
  // 1 Sir Loafs-a-Lot - Bread Loaf Cat
  1: (K) => {
    const crust = K.rgb(176, 108, 48);
    const c = K.cat({ bodyShape: "loaf", color: K.rgb(232, 186, 112), eyes: "sleepy", mouth: "smile", noseColor: K.rgb(150, 80, 50) });
    c.parts.LoafTop.color = crust;
    c.parts.LoafTop.material = "sand";
    const back = c.attach("back");
    for (let i = -1; i <= 1; i++) {
      K.block(c.model, [c.bodySize.x * 0.75, 0.12, 0.18], K.mul(back, K.cf(0, 0.02, i * 0.8), K.rot(0, 18, 0)), K.rgb(250, 225, 170), { name: "Score" });
    }
    const top = c.attach("headTop");
    K.block(c.model, [0.7, 0.22, 0.7], K.mul(top, K.cf(0, 0.08, 0), K.rot(0, 20, 0)), K.rgb(255, 236, 120), { name: "Butter" });
    K.ball(c.model, [0.35, 0.18, 0.35], K.mul(top, K.cf(0.32, -0.08, -0.25)), K.rgb(255, 236, 120), { name: "Melt" });
    K.ball(c.model, 0.22, [1.4, 0.11, -1.2], crust, { name: "Crumb" });
    K.ball(c.model, 0.18, [-1.3, 0.09, -0.9], crust, { name: "Crumb" });
    return K.finish(c.model);
  },

  // 2 Kevin (Has One Brain Cell) - Orange Cat
  2: (K) => {
    const c = K.cat({ color: K.C.ginger, pattern: "stripes", color2: K.rgb(255, 180, 90), eyes: "derp", mouth: "o", tail: "long" });
    const top = c.attach("headTop");
    K.ball(c.model, 0.55, K.mul(top, K.cf(0.2, 1.3, 0)), K.rgb(255, 120, 200), { name: "BrainCell", neon: true });
    K.ball(c.model, 0.22, K.mul(top, K.cf(0.32, 1.42, -0.18)), K.rgb(255, 230, 250), { name: "Nucleus", neon: true });
    K.block(c.model, [0.06, 0.6, 0.06], K.mul(top, K.cf(0.1, 0.6, 0), K.rot(0, 0, 10)), K.rgb(255, 160, 220), { name: "Thread", transparency: 0.4 });
    const nose = c.attach("nose");
    const wingC = K.rgb(80, 170, 255);
    K.ball(c.model, [0.5, 0.45, 0.06], K.mul(nose, K.cf(0.26, 0.28, -0.12), K.rot(0, -30, 20)), wingC, { name: "ButterflyWing" });
    K.ball(c.model, [0.5, 0.45, 0.06], K.mul(nose, K.cf(-0.26, 0.28, -0.12), K.rot(0, 30, -20)), wingC, { name: "ButterflyWing" });
    K.block(c.model, [0.08, 0.32, 0.08], K.mul(nose, K.cf(0, 0.25, -0.12)), K.C.black, { name: "ButterflyBody" });
    return K.finish(c.model);
  },

  // 3 Sunny McNapface - Sunbeam Cat
  3: (K) => {
    const c = K.cat({ bodyShape: "flat", color: K.C.cream, pattern: "spots", color2: K.rgb(240, 160, 80), eyes: "closed", mouth: "w", tail: "curly" });
    const feet = c.attach("feet");
    K.cyl(c.model, 7, 4.6, K.mul(feet, K.cf(0, 3.5, -0.2)), K.rgb(255, 235, 120), { name: "Sunbeam", neon: true, transparency: 0.8 });
    K.cyl(c.model, 0.08, 5.2, K.mul(feet, K.cf(0, 0.04, -0.2)), K.rgb(255, 230, 110), { name: "SunSpot", neon: true, transparency: 0.5 });
    const top = c.attach("headTop");
    K.ball(c.model, 0.3, K.mul(top, K.cf(0.5, 0.4, 0)), K.rgb(190, 225, 255), { name: "Dream", transparency: 0.3 });
    K.ball(c.model, 0.45, K.mul(top, K.cf(0.85, 0.95, 0.1)), K.rgb(190, 225, 255), { name: "Dream", transparency: 0.3 });
    K.ball(c.model, 0.65, K.mul(top, K.cf(1.3, 1.7, 0.2)), K.rgb(190, 225, 255), { name: "Dream", transparency: 0.3 });
    return K.finish(c.model);
  },

  // 4 Boxford - Cat In A Box
  4: (K) => {
    const c = K.cat({ color: K.C.grey, pattern: "stripes", color2: K.C.dark, eyes: "big", mouth: "w", tail: "none" });
    const box = K.acc.box(c, { color: K.rgb(196, 146, 88) });
    const b = box[1];
    K.block(c.model, [b.size.x * 0.35, b.size.y * 1.02, 0.04], K.mul(b.cf, K.cf(0, 0, -0.08)), K.rgb(225, 200, 150), { name: "Tape" });
    K.wedge(c.model, [0.06, 0.5, 0.5], K.mul(b.cf, K.cf(b.size.x * 0.32, 0, -0.1), K.rot(90, 0, 0), K.rot(0, 90, 0)), K.C.red, { name: "ThisSideUp" });
    K.acc.sign(c, "FREE CAT", { color: K.rgb(255, 250, 230), at: c.attach("side", [-0.6, 0.6, 0]) });
    return K.finish(c.model);
  },

  // 5 The Sandwich Bandit - Picnic Thief Cat
  5: (K) => {
    const c = K.cat({ color: K.C.white, eyes: "normal", eyeWhite: K.rgb(255, 255, 210), mouth: "teeth", tail: "normal", innerEars: false });
    const eyes = c.attach("eyes");
    K.block(c.model, [c.headD * 0.95, c.headD * 0.22, 0.25], K.mul(eyes, K.cf(0, 0.02, -0.02)), K.rgb(20, 20, 26), { name: "Mask", transparency: 0.15 });
    K.block(c.model, [0.12, 0.12, 1.1], K.mul(eyes, K.cf(c.headD * 0.5, 0.02, 0.6), K.rot(0, -20, 0)), K.rgb(20, 20, 26), { name: "MaskTie" });
    const s = c.attach("side", [0, 0.4, -0.3]);
    const layers = [
      [0.22, K.rgb(225, 175, 105)], [0.12, K.rgb(90, 200, 70)], [0.12, K.rgb(230, 60, 60)],
      [0.12, K.rgb(255, 210, 60)], [0.16, K.rgb(245, 160, 170)], [0.22, K.rgb(225, 175, 105)],
    ];
    let y = 0;
    layers.forEach((l, i) => {
      const w = i === 1 ? 1.45 : 1.3;
      K.block(c.model, [w, l[0], w], K.mul(s, K.cf(0, y + l[0] / 2, 0), K.rot(0, 45, 0)), l[1], { name: "Sandwich" });
      y += l[0];
    });
    K.cyl(c.model, 0.5, 0.06, K.mul(s, K.cf(0, y + 0.15, 0)), K.rgb(230, 210, 160), { name: "Toothpick" });
    return K.finish(c.model);
  },

  // 6 Haybert - Hay Bale Cat
  6: (K) => {
    const straw = K.rgb(232, 200, 95);
    const c = K.cat({
      bodyShape: "cube", color: straw, material: "grass", eyes: "normal", mouth: "smile", tail: "puffy",
      noseColor: K.rgb(200, 120, 60), innerEarColor: K.rgb(200, 160, 70),
    });
    const body = c.attach("body");
    const bs = c.bodySize;
    for (const zz of [-0.6, 0.6]) {
      K.block(c.model, [bs.x + 0.06, bs.y + 0.06, 0.12], K.mul(body, K.cf(0, 0, zz)), K.rgb(140, 90, 40), { name: "Twine" });
    }
    const top = c.attach("headTop");
    [-35, -12, 10, 32].forEach((a, i0) => {
      K.block(c.model, [0.1, 0.9, 0.1], K.mul(top, K.cf((i0 + 1 - 2.5) * 0.25, 0.35, 0), K.rot(0, 0, a)), K.rgb(250, 225, 120), { name: "Straw" });
    });
    K.block(c.model, [0.08, 1.1, 0.08], K.mul(c.attach("mouth"), K.cf(0.35, -0.05, -0.1), K.rot(0, 0, 70)), K.rgb(250, 225, 120), { name: "ChewStraw" });
    return K.finish(c.model);
  },

  // 7 Princess Petalpaws - Flower Crown Cat
  7: (K) => {
    const c = K.cat({
      color: K.rgb(252, 248, 252), eyes: "heart", mouth: "w", tail: "puffy",
      innerEarColor: K.rgb(255, 170, 210), noseColor: K.rgb(255, 120, 170),
    });
    const top = c.attach("headTop");
    K.cyl(c.model, 0.18, 1.35, K.mul(top, K.cf(0, -0.05, 0)), K.rgb(70, 170, 70), { name: "Vine" });
    const cols = [K.rgb(255, 110, 170), K.rgb(255, 230, 80), K.rgb(180, 120, 255), K.rgb(255, 160, 90), K.rgb(120, 200, 255), K.rgb(255, 255, 255)];
    for (let i = 0; i <= 5; i++) {
      const a = (i / 6) * Math.PI * 2;
      K.ball(c.model, 0.42, K.mul(top, K.cf(Math.sin(a) * 0.68, 0.08, Math.cos(a) * 0.68)), cols[i], { name: "Flower" });
    }
    const paw = K.p(c.attach("frontLeftPaw"));
    K.limb(c.model, paw, K.add(paw, [0.3, 1.4, -0.3]), 0.08, K.rgb(60, 150, 60), { name: "Stem" });
    K.ball(c.model, 0.45, K.add(paw, [0.3, 1.5, -0.3]), K.rgb(230, 30, 70), { name: "Rose" });
    const face = c.attach("face");
    for (const sx of [-1, 1]) {
      K.ball(c.model, [0.35, 0.2, 0.1], K.mul(face, K.cf(sx * 0.55, -0.25, 0.12)), K.rgb(255, 160, 190), { name: "Blush" });
    }
    return K.finish(c.model);
  },

  // 8 Quackers the Confused - Cat Who Thinks It Is A Duck
  8: (K) => {
    const c = K.cat({ bodyShape: "round", color: K.rgb(255, 222, 70), eyes: "big", mouth: "none", tail: "none", legs: false, whiskers: false });
    const nose = c.attach("nose");
    const beak = K.rgb(255, 140, 30);
    K.ball(c.model, [0.9, 0.22, 0.75], K.mul(nose, K.cf(0, -0.05, -0.3)), beak, { name: "Beak" });
    K.ball(c.model, [0.75, 0.16, 0.6], K.mul(nose, K.cf(0, -0.22, -0.25)), K.rgb(230, 110, 20), { name: "Beak" });
    const body = c.attach("body");
    const r = c.bodySize.x / 2;
    for (const sx of [-1, 1]) {
      K.ball(c.model, [0.3, 1.0, 1.6], K.mul(body, K.cf(sx * (r + 0.05), 0.2, 0.3), K.rot(-20, 0, sx * -15)), K.rgb(250, 205, 50), { name: "Wing" });
    }
    const chestZ = K.p(c.attach("chest")).z;
    for (const sx of [-1, 1]) {
      K.wedge(c.model, [0.7, 0.12, 0.8], K.mul(K.cf(sx * 0.65, 0.06, chestZ - 0.1), K.rot(0, 180, 0)), beak, { name: "Foot" });
    }
    const side = c.attach("side");
    K.ball(c.model, 0.7, K.mul(side, K.cf(-0.3, -0.6, 0)), K.rgb(255, 235, 60), { name: "DuckBody" });
    K.ball(c.model, 0.45, K.mul(side, K.cf(-0.3, -0.05, -0.2)), K.rgb(255, 235, 60), { name: "DuckHead" });
    K.ball(c.model, [0.25, 0.1, 0.25], K.mul(side, K.cf(-0.3, -0.07, -0.47)), beak, { name: "DuckBeak" });
    const top = c.attach("headTop");
    K.cyl(c.model, 0.45, 1.1, K.mul(top, K.cf(0, 0.1, 0)), K.C.white, { name: "SailorHat" });
    K.cyl(c.model, 0.12, 1.15, K.mul(top, K.cf(0, 0.3, 0)), K.rgb(40, 80, 200), { name: "HatBand" });
    return K.finish(c.model);
  },

  // 9 Moo-ffin - Cow Cat
  9: (K) => {
    const c = K.cat({ color: K.C.white, pattern: "spots", color2: K.rgb(30, 30, 35), eyes: "normal", mouth: "o", tail: "long", noseColor: K.rgb(255, 160, 170) });
    K.acc.horns(c, { color: K.rgb(245, 235, 200), scale: 0.65 });
    const face = c.attach("face");
    K.ball(c.model, [c.headD * 0.62, c.headD * 0.38, 0.5], K.mul(face, K.cf(0, -c.headD * 0.18, 0.08)), K.rgb(255, 175, 185), { name: "Muzzle" });
    for (const sx of [-1, 1]) {
      K.ball(c.model, [0.14, 0.18, 0.1], K.mul(face, K.cf(sx * 0.18, -c.headD * 0.16, -0.17)), K.rgb(120, 50, 60), { name: "Nostril" });
    }
    const neck = c.attach("neck");
    K.cyl(c.model, 0.18, 1.2, K.mul(neck, K.cf(0, 0.15, 0.25)), K.rgb(140, 70, 40), { name: "Collar" });
    K.cyl(c.model, 0.55, 0.5, K.mul(neck, K.cf(0, -0.25, -0.2)), K.C.gold, { name: "Bell", material: "foil" });
    K.ball(c.model, 0.18, K.mul(neck, K.cf(0, -0.55, -0.2)), K.rgb(120, 90, 30), { name: "Clapper" });
    return K.finish(c.model);
  },

  // 10 Propeller Pete - Wannabe Pilot Cat
  10: (K) => {
    const c = K.cat({ color: K.rgb(125, 145, 200), pattern: "tuxedo", color2: K.rgb(235, 240, 255), eyes: "big", mouth: "w", tail: "curly" });
    const top = c.attach("headTop");
    const cols = [K.C.red, K.C.yellow, K.C.blue, K.C.green];
    for (let i = 0; i <= 3; i++) {
      K.ball(c.model, [0.75, 0.55, 0.75], K.mul(top, K.cf(Math.sin((i * Math.PI) / 2) * 0.28, 0.02, Math.cos((i * Math.PI) / 2) * 0.28)), cols[i], { name: "Beanie" });
    }
    K.cyl(c.model, 0.5, 0.12, K.mul(top, K.cf(0, 0.5, 0)), K.C.silver, { name: "PropStick" });
    K.block(c.model, [2.2, 0.06, 0.3], K.mul(top, K.cf(0, 0.76, 0), K.rot(0, 30, 6)), K.rgb(255, 80, 80), { name: "Propeller" });
    K.block(c.model, [0.3, 0.06, 2.2], K.mul(top, K.cf(0, 0.76, 0), K.rot(-6, 30, 0)), K.rgb(80, 160, 255), { name: "Propeller" });
    K.ball(c.model, 0.22, K.mul(top, K.cf(0, 0.82, 0)), K.C.yellow, { name: "PropNub", neon: true });
    const eyes = c.attach("eyes");
    for (const sx of [-1, 1]) {
      K.cyl(c.model, 0.2, 0.55, K.mul(eyes, K.cf(sx * 0.42, 0.55, -0.35), K.rot(-70, 0, 0)), K.rgb(130, 90, 50), { name: "Goggle" });
      K.cyl(c.model, 0.05, 0.42, K.mul(eyes, K.cf(sx * 0.42, 0.53, -0.46), K.rot(-70, 0, 0)), K.rgb(140, 220, 255), { name: "GoggleLens", material: "glass", transparency: 0.2 });
    }
    K.acc.cape(c, { color: K.rgb(240, 240, 255), collar: K.rgb(130, 90, 50) });
    return K.finish(c.model);
  },

  // 11 Scare-Meow - Scarecrow Cat
  11: (K) => {
    const c = K.cat({ bodyShape: "tall", color: K.rgb(205, 175, 120), eyes: "x", eyeColor: K.rgb(60, 40, 30), mouth: "smile", tail: "normal", innerEars: false });
    const body = c.attach("body");
    const bs = c.bodySize;
    K.ball(c.model, [bs.x * 1.06, bs.y * 0.55, bs.z * 1.06], K.mul(body, K.cf(0, 0.2, 0)), K.rgb(200, 50, 50), { name: "Shirt", material: "fabric" });
    K.block(c.model, [0.12, bs.y * 0.5, 0.06], K.mul(body, K.cf(0.25, 0.2, -bs.z * 0.52)), K.rgb(90, 25, 25), { name: "Plaid" });
    K.block(c.model, [bs.x * 0.9, 0.12, 0.06], K.mul(body, K.cf(0, 0.35, -bs.z * 0.52)), K.rgb(90, 25, 25), { name: "Plaid" });
    K.block(c.model, [0.45, 0.45, 0.06], K.mul(body, K.cf(-0.35, -0.55, -bs.z * 0.5)), K.rgb(70, 120, 210), { name: "Patch", material: "fabric" });
    const back = K.p(c.attach("back"));
    K.limb(c.model, K.add(back, [-2.2, 0.9, 0.15]), K.add(back, [2.2, 0.9, 0.15]), 0.25, K.rgb(120, 80, 45), { name: "Pole", material: "wood" });
    for (const sx of [-1, 1]) {
      K.block(c.model, [0.1, 0.55, 0.1], K.mul(K.cf(K.add(back, [sx * 2.25, 0.75, 0.15])), K.rot(0, 0, sx * 25)), K.rgb(250, 225, 120), { name: "Stuffing" });
    }
    const top = c.attach("headTop");
    K.cyl(c.model, 0.12, 2.6, top, K.rgb(225, 190, 90), { name: "HatBrim" });
    K.cyl(c.model, 0.7, 1.2, K.mul(top, K.cf(0, 0.38, 0)), K.rgb(225, 190, 90), { name: "Hat" });
    K.ball(c.model, [0.55, 0.5, 0.75], K.mul(top, K.cf(0.15, 0.95, 0)), K.rgb(25, 25, 35), { name: "Crow" });
    K.ball(c.model, 0.38, K.mul(top, K.cf(0.15, 1.3, -0.25)), K.rgb(25, 25, 35), { name: "CrowHead" });
    K.wedge(c.model, [0.12, 0.12, 0.3], K.mul(top, K.cf(0.15, 1.28, -0.55), K.rot(0, 180, 0)), K.C.yellow, { name: "CrowBeak" });
    return K.finish(c.model);
  },

  // 12 Binocular Barry - Lookout Cat
  12: (K) => {
    const c = K.cat({ color: K.C.white, pattern: "calico", color2: K.C.orange, color3: K.rgb(40, 35, 35), eyes: "normal", mouth: "o", tail: "normal", whiskers: false });
    const eyes = c.attach("eyes");
    for (const sx of [-1, 1]) {
      K.cyl(c.model, 0.9, 0.42, K.mul(eyes, K.cf(sx * 0.3, 0, -0.55), K.rot(90, 0, 0)), K.rgb(35, 35, 40), { name: "Binocular" });
      K.cyl(c.model, 0.06, 0.36, K.mul(eyes, K.cf(sx * 0.3, 0, -1.0), K.rot(90, 0, 0)), K.rgb(150, 210, 255), { name: "Lens", material: "glass" });
    }
    K.block(c.model, [0.4, 0.15, 0.3], K.mul(eyes, K.cf(0, 0.05, -0.55)), K.rgb(35, 35, 40), { name: "BinoBridge" });
    K.limb(c.model, K.p(K.mul(eyes, K.cf(-0.5, -0.1, -0.5))), K.add(K.p(c.attach("neck")), [0, -0.2, 0.3]), 0.06, K.rgb(120, 70, 40), { name: "Strap" });
    const top = c.attach("headTop");
    K.ball(c.model, [1.4, 0.8, 1.5], K.mul(top, K.cf(0, 0.12, 0.05)), K.rgb(225, 205, 150), { name: "PithHelmet" });
    K.cyl(c.model, 0.08, 2.1, K.mul(top, K.cf(0, -0.05, 0.05)), K.rgb(205, 185, 130), { name: "HelmetBrim" });
    K.cyl(c.model, 0.1, 1.45, K.mul(top, K.cf(0, 0.05, 0.05)), K.rgb(120, 80, 45), { name: "HelmetBand" });
    const side = c.attach("side");
    K.block(c.model, [0.08, 1.0, 0.75], K.mul(side, K.cf(-0.1, 0.2, 0), K.rot(0, 0, -10)), K.rgb(140, 95, 55), { name: "Clipboard" });
    K.block(c.model, [0.09, 0.8, 0.6], K.mul(side, K.cf(-0.12, 0.15, 0), K.rot(0, 0, -10)), K.C.white, { name: "Report" });
    return K.finish(c.model);
  },

  // 13 Weathervane Wendy - Cat That Is A Weathervane
  13: (K) => {
    const patina = K.rgb(95, 175, 150);
    const c = K.cat({
      color: patina, material: "metal", eyes: "angry", eyeWhite: K.rgb(200, 240, 225), mouth: "none", tail: "long",
      whiskers: false, innerEars: false, noseColor: K.rgb(60, 120, 100),
    });
    const feet = c.attach("feet");
    const copper = K.rgb(200, 120, 60);
    K.cyl(c.model, 3.0, 0.22, K.mul(feet, K.cf(0, -1.5, 0)), K.rgb(60, 60, 65), { name: "Pole", material: "metal" });
    K.block(c.model, [3.4, 0.14, 0.14], K.mul(feet, K.cf(0, -1.4, 0)), copper, { name: "Compass", material: "metal" });
    K.block(c.model, [0.14, 0.14, 3.4], K.mul(feet, K.cf(0, -1.4, 0)), copper, { name: "Compass", material: "metal" });
    for (const p of [[1.7, 0, 0], [-1.7, 0, 0], [0, 0, 1.7], [0, 0, -1.7]]) {
      K.ball(c.model, 0.36, K.mul(feet, K.cf(p[0], p[1] - 1.4, p[2])), K.C.gold, { name: "CompassTip", material: "foil" });
    }
    K.ball(c.model, 0.5, K.mul(feet, K.cf(0, -0.2, 0)), K.C.gold, { name: "PoleBall", material: "foil" });
    K.wedge(c.model, [0.12, 0.6, 0.7], K.mul(c.attach("tail"), K.cf(0, 0.25, 0), K.rot(-90, 0, 0)), copper, { name: "ArrowTip", material: "metal" });
    return K.finish(c.model);
  },

  // 14 Snorkel Steve - Soggy Dock Cat
  14: (K) => {
    const c = K.cat({ color: K.rgb(105, 125, 150), pattern: "stripes", color2: K.rgb(75, 90, 115), eyes: "normal", mouth: "frown", tail: "normal" });
    const eyes = c.attach("eyes");
    for (const sx of [-1, 1]) {
      K.ball(c.model, [0.62, 0.55, 0.3], K.mul(eyes, K.cf(sx * 0.43, 0, -0.08)), K.rgb(120, 230, 255), { name: "Goggle", material: "glass", transparency: 0.35 });
    }
    K.block(c.model, [c.headD * 1.08, 0.14, c.headD * 0.9], K.mul(eyes, K.cf(0, 0.02, 0.45)), K.rgb(255, 120, 40), { name: "GoggleStrap" });
    const s0 = K.p(K.mul(c.attach("mouth"), K.cf(0.3, 0, -0.1)));
    const s1 = K.add(s0, [0.55, 0, 0]);
    const s2 = K.add(s1, [0.05, 2.0, 0.3]);
    K.limb(c.model, s0, s1, 0.2, K.rgb(255, 120, 40), { name: "Snorkel" });
    K.limb(c.model, s1, s2, 0.22, K.rgb(255, 120, 40), { name: "Snorkel" });
    K.cyl(c.model, 0.25, 0.3, K.cf(s2), K.rgb(40, 40, 40), { name: "SnorkelTop" });
    const top = c.attach("headTop");
    K.limb(c.model, K.p(K.mul(top, K.cf(-0.3, 0, 0))), K.p(K.mul(top, K.cf(-0.7, -0.3, -0.35))), 0.15, K.rgb(40, 140, 70), { name: "Greg" });
    K.limb(c.model, K.p(K.mul(top, K.cf(-0.2, 0, 0.1))), K.p(K.mul(top, K.cf(-0.95, -0.7, 0.2))), 0.15, K.rgb(50, 160, 80), { name: "Greg" });
    K.ball(c.model, 0.2, c.attach("chest", [0.3, -0.7, -0.1]), K.rgb(150, 210, 255), { name: "Drip", transparency: 0.3 });
    K.ball(c.model, 0.35, K.cf(K.add(s2, [0.3, 0.6, 0])), K.rgb(200, 240, 255), { name: "Bubble", transparency: 0.4 });
    K.ball(c.model, 0.22, K.cf(K.add(s2, [0.1, 1.1, -0.1])), K.rgb(200, 240, 255), { name: "Bubble", transparency: 0.4 });
    return K.finish(c.model);
  },
};

// ============================================================================================
// DECOR BATCH - small static ornaments merged into two vertex-coloured meshes (lit + glowing).
// They never collide, never move and are never mutated, so they need no engine part each; this
// keeps the meadow's hundreds of flowers, leaves and veggies at two draw calls. Owned and freed here.
// ============================================================================================

function makeDeco(z) {
  const THREE = z.THREE;
  const parts = z.ctx.engine.parts;
  const items = { lit: [], glow: [] };
  const geos = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 10, 7),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  };
  const ids = [];
  const owned = Object.values(geos);
  z.onLeave(() => {
    for (const id of ids) { try { parts.remove(id); } catch { /* already gone */ } }
    ids.length = 0;
    for (const o of owned) { try { o.dispose(); } catch { /* fine */ } }
    owned.length = 0;
  });
  const S = new THREE.Matrix4();
  return {
    add(shape, size, cf, color, glow) {
      S.makeScale(Math.max(0.02, size[0]), Math.max(0.02, size[1]), Math.max(0.02, size[2]));
      items[glow ? "glow" : "lit"].push({ g: geos[shape] || geos.box, m: cf.clone().multiply(S), color });
    },
    finish() {
      const nm = new THREE.Matrix3();
      const v = new THREE.Vector3();
      const col = new THREE.Color();
      for (const kind of ["lit", "glow"]) {
        const list = items[kind];
        if (!list.length) continue;
        let nv = 0, ni = 0;
        for (const it of list) { nv += it.g.attributes.position.count; ni += it.g.index.count; }
        const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), cols = new Float32Array(nv * 3);
        const idx = new Uint32Array(ni);
        let vo = 0, io = 0;
        for (const it of list) {
          const gp = it.g.attributes.position.array, gn = it.g.attributes.normal.array, gi = it.g.index.array;
          nm.getNormalMatrix(it.m);
          col.set(it.color);
          const base = vo / 3;
          for (let i = 0; i < gp.length; i += 3) {
            v.set(gp[i], gp[i + 1], gp[i + 2]).applyMatrix4(it.m);
            pos[vo] = v.x; pos[vo + 1] = v.y; pos[vo + 2] = v.z;
            v.set(gn[i], gn[i + 1], gn[i + 2]).applyMatrix3(nm).normalize();
            nrm[vo] = v.x; nrm[vo + 1] = v.y; nrm[vo + 2] = v.z;
            cols[vo] = col.r; cols[vo + 1] = col.g; cols[vo + 2] = col.b;
            vo += 3;
          }
          for (let i = 0; i < gi.length; i++) idx[io++] = base + gi[i];
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(cols, 3));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeBoundingSphere();
        const mat = kind === "glow"
          ? new THREE.MeshBasicMaterial({ vertexColors: true })
          : new THREE.MeshLambertMaterial({ vertexColors: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = "cats-z1-decor-" + kind;
        owned.push(geo, mat);
        ids.push(parts.addCustom(mesh));
      }
      items.lit.length = 0;
      items.glow.length = 0;
    },
    count: () => items.lit.length + items.glow.length,
  };
}

// ============================================================================================
// BUILD
// ============================================================================================

export function build(z) {
  const K = z.K;
  const THREE = z.THREE;
  const C = K.rgb;
  const DEG = Math.PI / 180;
  const deco = makeDeco(z);

  // ---- helpers -------------------------------------------------------------------------------
  // o: { mat, neon, t (transparency), decor, light, dyn }. Opaque, static decor with no material
  // texture goes to the decor batch; everything else is a zonekit part.
  const MAT = { WoodPlanks: "wood", Wood: "wood", Grass: "grass", Ground: "sand", Sand: "sand", Slate: "concrete", Metal: "metal", Foil: "metal", Marble: "marble", Brick: "brick", Glass: "glass", Fabric: "plastic" };
  function mk(shape, size, cf, color, o = {}) {
    const decoOk = o.decor && !o.t && !o.light && !o.dyn && !o.part && o.mat !== "Glass";
    if (decoOk) { deco.add(shape, size, cf, color, !!o.neon); return null; }
    return z.part({
      shape, size, cf, color, material: o.mat ? MAT[o.mat] || "plastic" : undefined, neon: !!o.neon,
      transparency: o.t || 0, decor: !!o.decor, light: o.light, dynamic: !!o.dyn,
    });
  }
  const box = (size, cf, color, o) => mk("box", size, cf, color, o);
  const ball = (d, cf, color, o) => mk("sphere", [d, d, d], cf, color, o);
  const cylY = (len, d, cf, color, o) => mk("cylinder", [d, len, d], cf, color, o); // axis = cf's Y
  const wedge = (size, cf, color, o = {}) => z.rwedge(size, cf, { Color: color, Material: o.mat ? MAT[o.mat] : undefined, Decor: !!o.decor });
  const dec = (o) => ({ decor: true, ...(o || {}) });
  const L = (x, y, zz, ry) => z.cf(x, y, zz, ry);
  const M = (...ms) => K.mul(...ms);
  const T = (x, y, zz) => K.cf(x, y, zz);
  const R = (x, y, zz) => K.rot(x, y, zz);
  const V = (x, y, zz) => new THREE.Vector3(x, y, zz);
  // cylinder between two zone-local points
  function rod(p0, p1, d, color, o) {
    const a = V(...z.pos(p0[0], p0[1], p0[2])), b = V(...z.pos(p1[0], p1[1], p1[2]));
    const dir = b.clone().sub(a);
    const len = dir.length();
    const q = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), dir.clone().normalize());
    const cf = new THREE.Matrix4().compose(a.clone().addScaledVector(dir, 0.5), q, V(1, 1, 1));
    return cylY(len, d, cf, color, o);
  }

  // hills: big sunk balls (true sphere collision, gentle walkable slopes)
  const HILLS = [
    { x: 115, z: -110, cy: -45, r: 70, lookout: true },
    { x: -150, z: 145, cy: -32, r: 40 },
    { x: 150, z: 150, cy: -32, r: 40 },
    { x: -5, z: 158, cy: -28, r: 35 },
  ];
  function groundY(x, zz) {
    let best = 0;
    for (const h of HILLS) {
      const d2 = (x - h.x) ** 2 + (zz - h.z) ** 2;
      if (d2 < h.r * h.r) best = Math.max(best, h.cy + Math.sqrt(h.r * h.r - d2));
    }
    return best;
  }
  // yaw (degrees) that turns local +Z towards (dx, dz)
  function heading(dx, dz) {
    if (dz === 0) return dx >= 0 ? 90 : -90;
    let a = Math.atan(dx / dz) / DEG;
    if (dz < 0) a += 180;
    return a;
  }

  const GRASS = C(112, 196, 84);
  const PATH = C(205, 170, 118);
  const WOOD = C(150, 100, 60);
  const DARKWOOD = C(105, 68, 40);
  const HAY = C(232, 200, 95);
  const CREAM = C(255, 246, 220);
  const INK = C(70, 45, 25);
  const WHITE = C(250, 248, 240);

  let pathN = 0;
  function path(x0, z0, x1, z1, w = 8) {
    pathN++;
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    box([w, 0.2, len + w * 0.5], L((x0 + x1) / 2, 0.05 + pathN * 0.004, (z0 + z1) / 2, heading(dx, dz)), PATH, dec());
  }

  function sign(x, zz, ry, w, h, text, o = {}) {
    const lift = o.lift || 2.5;
    const cf = L(x, groundY(x, zz), zz, ry);
    for (const sx of [-1, 1]) {
      box([0.5, lift + h, 0.5], M(cf, T(sx * (w / 2 - 0.4), (lift + h) / 2, 0.3)), DARKWOOD, { mat: "Wood" });
    }
    const board = box([w, h, 0.4], M(cf, T(0, lift + h / 2, 0)), CREAM, { mat: "WoodPlanks" });
    box([w + 0.6, 0.4, 0.6], M(cf, T(0, lift + h + 0.2, 0)), o.trim || C(200, 80, 80), dec());
    z.label(board, text, { both: true, color: o.color || INK, pps: o.pps || 32 });
    return board;
  }

  let lampN = 0;
  function lamp(x, zz) {
    const y0 = groundY(x, zz);
    cylY(8, 0.5, L(x, y0 + 4, zz), C(50, 55, 60), { mat: "Metal" });
    const lit = lampN++ % 2 === 0;
    ball(1.4, L(x, y0 + 8.6, zz), C(255, 210, 120), dec({ neon: true, light: lit ? { color: C(255, 200, 120), intensity: 1.2, range: 16 } : undefined }));
    cylY(0.3, 1.8, L(x, y0 + 9.4, zz), C(50, 55, 60), dec());
  }

  const LEAVES = [C(70, 160, 60), C(85, 175, 70), C(60, 145, 55)];
  function oak(x, zz, s = 1) {
    const y0 = groundY(x, zz);
    cylY(8 * s, 1.6 * s, L(x, y0 + 4 * s, zz), C(120, 80, 45), { mat: "Wood" });
    ball(8 * s, L(x, y0 + 10 * s, zz), LEAVES[0], dec());
    ball(6 * s, L(x + 2.6 * s, y0 + 9 * s, zz + 1.2 * s), LEAVES[1], dec());
    ball(6 * s, L(x - 2.2 * s, y0 + 9.5 * s, zz - 1.6 * s), LEAVES[2], dec());
  }

  const PINKS = [C(255, 183, 213), C(255, 160, 200), C(255, 205, 225), C(250, 140, 190)];
  function cherry(x, zz, s = 1) {
    const y0 = groundY(x, zz);
    const bark = C(95, 60, 55);
    cylY(6 * s, 1.3 * s, L(x, y0 + 3 * s, zz), bark, { mat: "Wood" });
    rod([x, y0 + 5.5 * s, zz], [x + 3 * s, y0 + 8.5 * s, zz + 1 * s], 0.6 * s, bark, dec());
    rod([x, y0 + 5.5 * s, zz], [x - 2.5 * s, y0 + 8 * s, zz - 1.5 * s], 0.6 * s, bark, dec());
    ball(7 * s, L(x, y0 + 9.5 * s, zz), PINKS[0], dec());
    ball(5.5 * s, L(x + 3.2 * s, y0 + 8.8 * s, zz + 1 * s), PINKS[1], dec());
    ball(5 * s, L(x - 3 * s, y0 + 8.6 * s, zz - 1.5 * s), PINKS[2], dec());
    ball(4.5 * s, L(x + 0.5 * s, y0 + 11.8 * s, zz - 1 * s), PINKS[3], dec());
    // fallen petals (the original's drifting petal particles, settled on the grass)
    for (let i = 0; i < 4; i++) {
      const a = z.random(0, Math.PI * 2), r = z.random(2, 6) * s;
      box([0.5, 0.06, 0.4], L(x + Math.sin(a) * r, y0 + 0.05, zz + Math.cos(a) * r, z.random(0, 180)), PINKS[i % 4], dec());
    }
  }

  function bush(x, zz, s) {
    const y0 = groundY(x, zz);
    ball(4 * s, L(x, y0 + 0.8 * s, zz), C(75, 165, 65), dec());
    ball(3 * s, L(x + 1.6 * s, y0 + 0.6 * s, zz + 0.5 * s), C(90, 180, 75), dec());
    if (z.rng() < 0.5) ball(0.6, L(x - 0.8 * s, y0 + 2.4 * s, zz - 0.6 * s), C(255, 90, 120), dec());
  }

  function bale(cf, size = [6, 3, 4], col = HAY) {
    const b = box(size, cf, col, { mat: "Grass" });
    box([size[0] + 0.06, size[1] + 0.06, 0.25], M(cf, T(0, 0, size[2] * 0.22)), C(150, 100, 45), dec());
    return b;
  }

  function fence(x0, z0, x1, z1, col = C(245, 240, 230)) {
    const dx = x1 - x0, dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const ry = heading(dx, dz);
    const n = Math.max(1, Math.ceil(len / 6));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      box([0.6, 3.6, 0.6], L(x0 + dx * t, 1.8, z0 + dz * t, ry), col, { mat: "Wood" });
    }
    for (const y of [1.3, 2.8]) box([0.3, 0.45, len], L((x0 + x1) / 2, y, (z0 + z1) / 2, ry), col, { mat: "Wood" });
  }

  // ---- ground + hills ---------------------------------------------------------------------------
  function ground(x0, x1, z0, z1) {
    box([x1 - x0, 8, z1 - z0], L((x0 + x1) / 2, -4, (z0 + z1) / 2), GRASS, { mat: "Grass" });
  }
  // pond hole: x -80..-20, z 40..100
  ground(-195, -80, -195, 195);
  ground(-20, 195, -195, 195);
  ground(-80, -20, -195, 40);
  ground(-80, -20, 100, 195);
  for (const p of [[-120, 120, 40], [40, -150, 46], [150, 40, 36], [-60, 160, 30], [60, 120, 30]]) {
    cylY(0.1, p[2], L(p[0], 0.03, p[1]), C(130, 210, 95), dec());
  }
  for (const h of HILLS) {
    ball(h.r * 2, L(h.x, h.cy, h.z), h.lookout ? C(100, 185, 78) : C(122, 202, 90), { mat: "Grass" });
  }

  // ---- paths ------------------------------------------------------------------------------------
  path(-172, 0, 162, 0, 10); // main path
  path(-120, -5, -120, -42, 7); // to picnic
  path(-70, -5, -70, -150, 6); // flower walkway
  path(-49, 5, -49, 31, 6); // to dock
  path(20, -5, 20, -60, 8); // to barn
  path(60, -5, 80, -55, 6); // to lookout hill
  path(100, 5, 100, 75, 7); // south to windmill
  path(100, 75, 125, 75, 7);
  path(-20, 5, -10, 60, 5); // cherry grove trail
  path(-10, 60, 30, 120, 5);
  // stepping stones up Lookout Hill (from the hill foot to the summit)
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    const x = 80 + (109 - 80) * t, zz = -55 + (-100 + 55) * t;
    // tall enough to show through the faceted hill mesh, which sits below the true sphere between vertices
    cylY(1.4, 3.2, L(x, groundY(x, zz) - 0.45, zz), C(190, 185, 175), dec());
  }

  // ---- welcome area -----------------------------------------------------------------------------
  // rainbow arch over the main path at x = -150
  const bands = [C(255, 70, 70), C(255, 160, 50), C(255, 230, 70), C(90, 220, 90), C(70, 150, 255), C(170, 100, 255)];
  bands.forEach((col, i0) => {
    const r = 17 - (i0 + 1);
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      const a = ((i + 0.5) / segs) * Math.PI;
      const arc = (Math.PI * r) / segs;
      const cf = M(L(-150, r * Math.sin(a), r * Math.cos(a)), K.angles(-(a + Math.PI / 2), 0, 0));
      box([1.5, 1, arc * 1.08], cf, col, dec({ neon: true }));
    }
  });
  for (const zz of [-14, 14]) {
    const sg = zz > 0 ? 1 : -1;
    ball(5, L(-150, 1.5, zz), C(255, 255, 255), dec());
    ball(3.6, L(-151.5, 2.8, zz + 1.8 * sg), C(250, 250, 255), dec());
    ball(3.4, L(-148.5, 1.2, zz - 1.5 * sg), C(250, 250, 255), dec());
  }

  sign(-165, -22, 90, 14, 6, "WELCOME TO COZY MEADOW!\n14 cats live here. Most are just lying around in the sun.\nTwo of them are being sneaky.", { trim: C(120, 210, 90) });
  sign(-163, 26, 90, 15, 11, "MEADOW CAT CENSUS\n1 loafing just past the rainbow\n2 in the flower field (one is posing)\n1 asleep in the sunbeam - 1 at the picnic\n1 sitting IN the road - 1 pretending to be hay\n1 in the cow pen - 1 floating in the pond\n1 in the garden - 1 at the windmill\n1 on top of Lookout Hill\n1 ON the barn (?!) - 1 UNDER the dock (?!)", { trim: C(255, 200, 60), lift: 1.5, pps: 40 });

  for (const x of [-130, -100, -70, -25, 10, 40, 70, 130, 155]) lamp(x, 7.5);

  // ---- picnic (north-west) ----------------------------------------------------------------------
  const checks = [C(230, 60, 60), C(255, 250, 245)];
  for (let i = 0; i <= 3; i++) {
    for (let j = 0; j <= 3; j++) {
      box([2.5, 0.12, 2.5], L(-131.75 + i * 2.5, 0.08, -58.75 + j * 2.5), checks[(i + j) % 2], dec());
    }
  }
  const basket = box([2.2, 1.4, 1.6], L(-129, 0.85, -54), C(175, 120, 60), { mat: "WoodPlanks" });
  box([0.25, 1.2, 0.25], L(-130, 2.1, -54), C(140, 90, 45), dec());
  box([0.25, 1.2, 0.25], L(-128, 2.1, -54), C(140, 90, 45), dec());
  box([2.25, 0.25, 0.25], L(-129, 2.7, -54), C(140, 90, 45), dec());
  cylY(0.5, 2, L(-132, 0.4, -59), C(220, 170, 100), dec());
  cylY(0.1, 1.7, L(-132, 0.7, -59), C(170, 40, 70), dec());
  for (const p of [[-127, -59, C(255, 170, 60)], [-126, -58, C(160, 70, 200)]]) {
    cylY(0.8, 0.6, L(p[0], 0.55, p[1]), p[2], dec({ t: 0.2 }));
  }
  // picnic table + benches
  box([4, 0.4, 9], L(-112, 3.0, -55), WOOD, { mat: "WoodPlanks" });
  for (const zz of [-58.5, -51.5]) {
    for (const x of [-113.5, -110.5]) box([0.4, 2.8, 0.4], L(x, 1.4, zz), DARKWOOD, { mat: "Wood" });
  }
  for (const x of [-115.5, -108.5]) {
    box([1.4, 0.35, 9], L(x, 1.7, -55), WOOD, { mat: "WoodPlanks" });
    for (const zz of [-58.5, -51.5]) box([0.35, 1.6, 0.35], L(x, 0.8, zz), DARKWOOD, { mat: "Wood" });
  }
  // umbrella
  rod([-105, 0, -49], [-106.5, 9, -50], 0.3, C(240, 240, 240));
  cylY(0.5, 10, M(L(-106.6, 9, -50), R(0, 0, -8)), C(255, 90, 90), dec());
  cylY(0.55, 6, M(L(-106.6, 9.1, -50), R(0, 0, -8)), C(255, 250, 240), dec());
  ball(0.8, L(-106.6, 9.6, -50), C(255, 90, 90), dec());

  const snacks = [
    "You peek in the basket. It's empty except for a note: 'thx for the sandwiches - B.'",
    "The basket contains 1 (one) sad grape. The Bandit left it as a tip.",
    "Crumbs. Just crumbs. The trail leads to the picnic table...",
    "A tiny receipt: '3,000 sandwiches - PAID IN MEOWS'.",
  ];
  z.prompt(basket, "Peek", () => {
    z.notify(snacks[z.randint(0, snacks.length - 1)]);
    z.tone(1.2);
  });

  // ---- flower field (north) ---------------------------------------------------------------------
  const rowCols = [C(255, 70, 90), C(255, 215, 50), C(255, 140, 200), C(160, 100, 255), C(255, 255, 255), C(255, 140, 50)];
  let row = 0;
  for (let zz = -150; zz <= -95; zz += 5) {
    row++;
    const col = rowCols[(row - 1) % rowCols.length];
    for (let x = -100; x <= -40; x += 4.5) {
      const skip = (x > -74.5 && x < -65.5) || (Math.abs(x + 50) < 6 && Math.abs(zz + 135) < 6) || (Math.abs(x + 86) < 4 && Math.abs(zz + 120) < 4);
      if (skip) continue;
      const jx = z.random(-0.8, 0.8), jz = z.random(-0.8, 0.8);
      const h = z.random(1.1, 1.7);
      box([0.18, h, 0.18], L(x + jx, h / 2, zz + jz), C(70, 150, 60), dec());
      ball(z.random(0.8, 1.1), L(x + jx, h + 0.25, zz + jz), col, dec());
      box([0.6, 0.08, 0.3], L(x + jx + 0.3, h * 0.5, zz + jz, z.random(0, 180)), C(80, 165, 65), dec());
    }
  }
  // Petalpaws' photoshoot pedestal with two spotlights
  cylY(1, 7, L(-50, 0.5, -135), C(250, 245, 255), { mat: "Marble" });
  cylY(0.15, 7.3, L(-50, 1.0, -135), C(255, 150, 200), dec({ neon: true }));
  for (const sx of [-1, 1]) {
    const base = [-50 + sx * 7, 0, -130];
    rod(base, [base[0], 4, base[2]], 0.4, C(40, 40, 45));
    rod([base[0], 4, base[2]], [base[0] - sx * 1.2, 4.6, base[2] - 1], 1, C(255, 250, 200),
      dec({ neon: true, light: sx > 0 ? { color: C(255, 230, 240), intensity: 2, range: 14 } : undefined }));
  }
  // butterflies (flapping-bob wings)
  const bfCols = [C(80, 170, 255), C(255, 150, 40), C(255, 255, 120), C(200, 120, 255)];
  for (let i = 1; i <= 6; i++) {
    const x = z.random(-98, -42), zz = z.random(-148, -97), y = z.random(3, 5);
    const col = bfCols[(i - 1) % bfCols.length];
    const ry = z.random(0, 360);
    const period = z.random(1.6, 2.6);
    for (const sx of [-1, 1]) {
      const w = box([0.9, 0.08, 0.7], M(L(x, y, zz, ry), T(sx * 0.45, 0, 0), R(0, 0, sx * 25)), col, dec({ neon: true, dyn: true }));
      z.tag(w, "Bob", { Amp: 0.8, Period: period });
    }
  }
  sign(-76, -12, 180, 9, 3.2, "TULIP STRIPES\nplease do not eat the flowers, Kevin", { trim: C(255, 140, 200) });

  // ---- sunbeam clearing (west of pond) ----------------------------------------------------------
  cylY(130, 10, L(-112, 65, 52), C(255, 240, 150), dec({ neon: true, t: 0.86 }));
  cylY(0.12, 11, L(-112, 0.08, 52), C(255, 235, 130), dec({ neon: true, t: 0.45 }));
  // fairy ring of glowing mushrooms
  for (let i = 0; i <= 9; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = -150 + Math.sin(a) * 6, zz = 70 + Math.cos(a) * 6;
    cylY(0.9, 0.35, L(x, 0.45, zz), C(245, 240, 230), dec());
    const capCol = i % 2 === 0 ? C(255, 90, 160) : C(120, 220, 255);
    ball(1.1, L(x, 1.0, zz), capCol, dec({ neon: true, light: i % 5 === 0 ? { color: capCol, intensity: 1, range: 10 } : undefined }));
  }

  // ---- pond + dock ------------------------------------------------------------------------------
  box([60, 1, 60], L(-50, -7.5, 70), C(210, 190, 140), { mat: "Sand" });
  box([60, 0.3, 60], L(-50, -3, 70), C(80, 170, 230), dec({ mat: "Glass", t: 0.35 }));
  box([66, 0.12, 3], L(-50, 0.06, 38.5), C(225, 205, 155), dec());
  box([66, 0.12, 3], L(-50, 0.06, 101.5), C(225, 205, 155), dec());
  box([3, 0.12, 60], L(-81.5, 0.06, 70), C(225, 205, 155), dec());
  box([3, 0.12, 60], L(-18.5, 0.06, 70), C(225, 205, 155), dec());
  // ramps down into the pond (original wedges: slope rises towards local +Z)
  wedge([10, 7, 14], L(-27, -3.5, 55, 90), C(200, 180, 130), { mat: "Sand" });
  wedge([10, 7, 14], L(-73, -3.5, 85, -90), C(200, 180, 130), { mat: "Sand" });
  // dock: deck x -52..-46, z 30..82, top y 0.6
  box([6, 0.6, 52], L(-49, 0.3, 56), C(165, 115, 70), { mat: "WoodPlanks" });
  for (let i = 0; i <= 12; i++) box([6.05, 0.05, 0.15], L(-49, 0.62, 31 + i * 4), DARKWOOD, dec());
  for (const zz of [44, 56, 68, 80]) {
    for (const x of [-52.3, -45.7]) cylY(9, 0.7, L(x, -2.5, zz), DARKWOOD, { mat: "Wood" });
  }
  sign(-49, 79, 0, 6, 2.6, "PLEASE STOP CLOMPING\n- management (below)", { lift: 1.2, trim: C(70, 150, 220) });
  // bubbles rising beside the dock (a clue)
  for (let i = 1; i <= 3; i++) {
    const b = ball(0.5 + i * 0.15, L(-44.5, -2.8 + i * 0.2, 66 + i * 0.6), C(220, 245, 255), dec({ t: 0.3, dyn: true }));
    z.tag(b, "Bob", { Amp: 0.25, Period: 1.2 + i * 0.3 });
  }
  // lily pads, cattails, rowboat, fireflies
  for (const p of [[-70, 50], [-64, 58], [-30, 46], [-60, 92], [-40, 95], [-24, 78], [-68, 72]]) {
    cylY(0.1, z.random(2.2, 3.2), L(p[0], -2.82, p[1]), C(60, 160, 70), dec());
  }
  ball(0.7, L(-64, -2.5, 58), C(255, 180, 220), dec());
  ball(0.7, L(-40, -2.5, 95), C(255, 255, 255), dec());
  for (let i = 1; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const x = -50 + Math.sin(a) * 33, zz = 70 + Math.cos(a) * 33;
    const h = z.random(3, 4.5);
    cylY(h, 0.2, L(x, h / 2, zz), C(80, 140, 60), dec());
    cylY(0.9, 0.45, L(x, h, zz), C(120, 75, 40), dec());
  }
  box([3.4, 1, 8], L(-64, -2.7, 64, 25), C(200, 90, 60), dec());
  box([2.6, 0.3, 1], L(-64, -2.1, 64, 25), C(150, 100, 60), dec());
  for (let i = 0; i < 6; i++) {
    const f = ball(0.35, L(z.random(-85, -15), z.random(1.5, 5), z.random(35, 105)), C(255, 250, 140), dec({ neon: true, dyn: true }));
    z.tag(f, "Bob", { Amp: 0.8, Period: z.random(2, 4) });
  }
  for (const p of [[-84, 44], [-16, 96], [-84, 98], [-18, 42]]) {
    ball(z.random(2.5, 3.5), L(p[0], 0.4, p[1]), C(150, 150, 155), dec());
  }

  // ---- barn (north, centre) ---------------------------------------------------------------------
  const RED = C(185, 45, 40);
  // footprint x 6..34, z -98..-62, walls 16 high, door 10 wide x 12 high on the south face
  box([28, 16, 1], L(20, 8, -97.5), RED, { mat: "WoodPlanks" });
  box([1, 16, 36], L(6.5, 8, -80), RED, { mat: "WoodPlanks" });
  box([1, 16, 36], L(33.5, 8, -80), RED, { mat: "WoodPlanks" });
  box([9, 16, 1], L(10.5, 8, -62.5), RED, { mat: "WoodPlanks" });
  box([9, 16, 1], L(29.5, 8, -62.5), RED, { mat: "WoodPlanks" });
  const lintel = box([10, 4, 1], L(20, 14, -62.5), RED, { mat: "WoodPlanks" });
  for (const p of [[6.5, -62.5], [33.5, -62.5], [6.5, -97.5], [33.5, -97.5]]) box([1.3, 16, 1.3], L(p[0], 8, p[1]), WHITE, dec());
  box([0.8, 12, 1.2], L(14.6, 6, -62.5), WHITE, dec());
  box([0.8, 12, 1.2], L(25.4, 6, -62.5), WHITE, dec());
  box([11.6, 0.8, 1.2], L(20, 12.2, -62.5), WHITE, dec());
  for (const sx of [-1, 1]) {
    // swung-open doors lying against the front wall
    const dcf = L(20 + sx * 10, 6, -61.6);
    box([5, 12, 0.5], dcf, RED, { mat: "WoodPlanks" });
    box([0.5, 13, 0.55], M(dcf, R(0, 0, 22)), WHITE, dec());
    box([0.5, 13, 0.55], M(dcf, R(0, 0, -22)), WHITE, dec());
  }
  z.label(lintel, "MEADOW BARN", { face: "back", color: WHITE, stroke: true }); // back = +Z = south
  // gable roof: two wedges, ridge along z at x = 20, y 24
  const ROOF = C(110, 45, 40);
  wedge([38, 8, 16], L(12, 20, -80, 90), ROOF, { mat: "WoodPlanks" });
  wedge([38, 8, 16], L(28, 20, -80, -90), ROOF, { mat: "WoodPlanks" });
  box([2.4, 0.8, 38], L(20, 24.2, -80), C(80, 35, 30), { mat: "WoodPlanks" });
  // cupola at the north end of the ridge
  box([3, 3, 3], L(20, 26.1, -94), WHITE);
  wedge([3.4, 1.6, 1.7], L(20, 28.4, -94.85), ROOF);
  wedge([3.4, 1.6, 1.7], L(20, 28.4, -93.15, 180), ROOF);
  // glowing hay-loft window on the front gable + lantern by the door
  box([3.4, 3.4, 0.2], L(20, 19.2, -60.95), C(255, 210, 110), dec({ neon: true }));
  box([4, 0.35, 0.3], L(20, 19.2, -60.8), WHITE, dec());
  box([0.35, 4, 0.3], L(20, 19.2, -60.8), WHITE, dec());
  box([1, 1.4, 1], L(15.5, 13.5, -61.6), C(255, 200, 100), dec({ neon: true, light: { color: C(255, 190, 110), intensity: 1.4, range: 18 } }));
  // inside: hay piles + trough
  bale(L(10, 1.5, -92, 90));
  bale(L(10, 4.5, -92, 90));
  bale(L(15, 1.5, -94));
  ball(7, L(28, 0, -90), HAY, dec());
  box([8, 1.5, 2], L(20, 0.75, -96), DARKWOOD, { mat: "Wood" });

  // THE HAY STAIRCASE (cat 13): columns of bales right by the east wall (x 35..41, under the 34..36
  // eave), tops at 3, 6, ... 18; the top step (y 18) overlaps the eave (x 36), so you step straight
  // down onto the roof slope, no gap.
  for (let i = 1; i <= 6; i++) {
    const zz = -64 - (i - 1) * 4;
    for (let j = 1; j <= i; j++) {
      const tint = (i + j) % 2 === 0 ? HAY : C(222, 188, 85);
      bale(L(38, j * 3 - 1.5, zz), [6, 3, 4], tint);
    }
  }
  sign(48, -60, 180, 8, 3.4, "DO NOT CLIMB THE HAY\n- the farmer\n(the cat on the roof says hi)", { trim: HAY });
  // loose bales in front of the barn (Haybert hides among them) + round bales
  bale(L(-4, 1.5, -54, 15));
  bale(L(8, 1.5, -50, -10));
  bale(L(-3, 4.5, -54, 5));
  for (const p of [[40, -48], [50, -52], [-8, -46]]) {
    z.rcyl(4, 5, L(p[0], 2.5, p[1], z.random(0, 180)), { Color: HAY, Material: "grass" });
  }

  // ---- cow pen (west of barn) -------------------------------------------------------------------
  fence(-32, -100, -2, -100);
  fence(-32, -100, -32, -66);
  fence(-2, -100, -2, -66);
  fence(-32, -66, -20, -66);
  fence(-14, -66, -2, -66);
  box([6, 1.4, 2], L(-27, 0.7, -95), C(130, 130, 140), { mat: "Metal" });
  box([5.6, 0.2, 1.6], L(-27, 1.35, -95), C(90, 170, 230), dec());
  const bell = box([1, 1.2, 1], L(-20, 4.2, -66), C(255, 200, 40), { mat: "Foil" });
  z.click(bell, () => {
    z.tone(0.9);
    z.tone(1.35);
    z.notify("DING DING. Somewhere in the pen, a cat yells 'MOOOO'.");
  });
  // cow-pen extras: a feed bucket and a little hay
  ball(3, L(-26, 0, -74), HAY, dec());

  // ---- vegetable garden (south of path) ---------------------------------------------------------
  [29, 35, 49, 55].forEach((zz, i0) => {
    box([33, 0.3, 3], L(62.5, 0.1, zz), C(110, 70, 40), dec());
    for (let x = 49; x <= 77; x += 5.5) {
      if (i0 % 2 === 0) {
        ball(1.8, L(x, 0.9, zz), C(110, 190, 80), dec());
      } else {
        ball(2.2, L(x, 1.0, zz), C(255, 140, 30), dec());
        box([0.25, 0.6, 0.25], L(x, 2.2, zz), C(70, 120, 40), dec());
      }
    }
  });
  box([33, 0.3, 3], L(62.5, 0.1, 42), C(110, 70, 40), dec());
  for (const x of [49, 53, 71, 75]) {
    ball(0.9, L(x, 0.5, 42), C(255, 120, 30), dec());
    box([0.15, 0.9, 0.15], L(x, 1.2, 42), C(60, 170, 60), dec());
  }
  cylY(2, 1, L(62, 1, 42), DARKWOOD, { mat: "Wood" });
  // low hedge border + sunflowers along the north edge
  box([36, 1.6, 1.2], L(62.5, 0.8, 60), C(70, 150, 60), { mat: "Grass" });
  box([1.2, 1.6, 34], L(80.5, 0.8, 43), C(70, 150, 60), { mat: "Grass" });
  for (let x = 47; x <= 79; x += 4) {
    const h = z.random(6, 8);
    cylY(h, 0.3, L(x, h / 2, 23), C(70, 150, 60), dec());
    cylY(0.3, 2.4, M(L(x, h, 22.8), R(90, 0, 0)), C(255, 210, 40), dec());
    cylY(0.35, 1.1, M(L(x, h, 22.6), R(90, 0, 0)), C(110, 70, 30), dec());
  }
  sign(44, 14, 180, 7, 2.6, "VEGGIE GARDEN\nguarded by a professional", { trim: C(255, 140, 30) });

  // ---- windmill (south-east) --------------------------------------------------------------------
  const WM = { x: 135, z: 75 };
  const stone = [C(235, 228, 215), C(225, 218, 205)];
  [18, 16, 14, 12].forEach((d, i) => {
    cylY(10, d, L(WM.x, i * 10 + 5, WM.z), stone[i % 2], { mat: "Brick" });
  });
  ball(13, L(WM.x, 40, WM.z), C(120, 60, 50), { mat: "WoodPlanks" });
  const wdoor = box([1, 7, 4], L(WM.x - 9, 3.5, WM.z), DARKWOOD, { mat: "WoodPlanks" });
  [14, 24, 32].forEach((y, i) => {
    const r = [8, 7, 6][i];
    box([0.3, 2.2, 1.6], L(WM.x - r - 0.05, y, WM.z), C(255, 215, 120), dec({ neon: true }));
  });
  // spinning sails: every spinning part is centred on the hub; its local Y = world X = the axis
  const hubP = z.pos(WM.x - 8.5, 36, WM.z);
  cylY(5, 2.4, M(new THREE.Matrix4().makeTranslation(hubP[0] + 1.5, hubP[1], hubP[2]), R(0, 0, 90)), C(80, 60, 45));
  const hubCF = new THREE.Matrix4().makeBasis(V(0, 1, 0), V(1, 0, 0), V(0, 0, -1)).setPosition(hubP[0], hubP[1], hubP[2]);
  const spin = { Axis: "Y", Speed: 35 };
  for (let k = 0; k <= 1; k++) {
    const cf = M(hubCF, K.angles(0, (k * Math.PI) / 2, 0));
    z.tag(box([34, 0.5, 1.2], cf, DARKWOOD, dec({ dyn: true })), "Spin", spin);
    z.tag(box([28, 0.3, 4.5], M(cf, T(0, -0.3, 0)), C(250, 245, 235), dec({ dyn: true })), "Spin", spin);
  }
  ball(2.4, new THREE.Matrix4().makeTranslation(hubP[0] - 0.6, hubP[1], hubP[2]), C(255, 200, 80),
    dec({ neon: true, light: { color: C(255, 200, 120), intensity: 1, range: 16 } }));
  z.prompt(wdoor, "Knock", () => {
    z.sound("action_footsteps_plastic.mp3", { volume: 0.8 });
    z.notify("Nobody's home. A small voice near your feet shouts: 'I AM THE SKY!'");
  });

  // ---- Lookout Hill (north-east) ----------------------------------------------------------------
  const LT = { x: 115, z: -110 };
  const deckY = 38;
  for (const p of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
    const x = LT.x + p[0], zz = LT.z + p[1];
    const g = groundY(x, zz) - 1;
    cylY(deckY - g, 0.9, L(x, (deckY + g) / 2, zz), DARKWOOD, { mat: "Wood" });
  }
  box([11, 1, 11], L(LT.x, deckY, LT.z), WOOD, { mat: "WoodPlanks" });
  // railings (gap on the south side where the stairs arrive)
  box([11, 2.5, 0.4], L(LT.x, deckY + 1.75, LT.z - 5.3), WOOD, { mat: "Wood" });
  box([0.4, 2.5, 11], L(LT.x - 5.3, deckY + 1.75, LT.z), WOOD, { mat: "Wood" });
  box([0.4, 2.5, 11], L(LT.x + 5.3, deckY + 1.75, LT.z), WOOD, { mat: "Wood" });
  box([3.5, 2.5, 0.4], L(LT.x - 3.6, deckY + 1.75, LT.z + 5.3), WOOD, { mat: "Wood" });
  box([3.5, 2.5, 0.4], L(LT.x + 3.6, deckY + 1.75, LT.z + 5.3), WOOD, { mat: "Wood" });
  // The original truss ladder becomes a staircase (the engine has no climbing): 1-stud risers, each
  // 1.3 deep (37.6 deg, steeper than the hill where it lands), from the deck top (38.5) south down
  // the hill; it runs on until the grass a capsule-radius south of the last step is <= 0.9 below
  // its top, so walking up from the hill is a plain step-up (<= the 1.1 limit). The last few steps
  // sink into the hill. 1.4-deep treads never met the hill: the last one hung 2 studs above it.
  const deckTop = deckY + 0.5;
  const TREAD = 1.3;
  for (let i = 1; i <= 40; i++) {
    const top = deckTop - i;
    const zz = LT.z + 5.5 + TREAD * (i - 0.5);
    const gSouth = groundY(LT.x, zz + TREAD / 2);
    const bottom = Math.min(gSouth, top - 1) - 1.5;
    box([3.2, top - bottom, TREAD], L(LT.x, (top + bottom) / 2, zz), i % 2 ? WOOD : DARKWOOD, { mat: "WoodPlanks" });
    if (i % 3 === 1) {
      for (const sx of [-1, 1]) box([0.25, 2.6, 0.25], L(LT.x + sx * 1.75, top + 1.3, zz), DARKWOOD, dec());
    }
    // the capsule (radius 1) meets a riser with its centre ~1 stud downhill of it, so measure there
    if (top - groundY(LT.x, zz + TREAD / 2 + 1.2) <= 0.9) break;
  }
  // roof
  cylY(deckY + 8 - (deckY + 0.5), 0.6, L(LT.x, deckY + 0.5 + 3.75, LT.z), DARKWOOD, { mat: "Wood" });
  cylY(0.6, 12, L(LT.x, deckY + 8, LT.z), C(200, 60, 50), { mat: "WoodPlanks" });
  ball(1.4, L(LT.x, deckY + 8.8, LT.z), C(255, 210, 60), dec({ neon: true }));
  const flag = box([0.1, 1.6, 2.6], L(LT.x, deckY + 11, LT.z + 1.4), C(255, 120, 200), dec({ neon: true, dyn: true }));
  cylY(3, 0.15, L(LT.x, deckY + 10.2, LT.z), C(60, 60, 60), dec());
  z.tag(flag, "Rainbow", { Period: 6 });
  // telescope on the deck (points south-west at the barn and pond)
  const tb = [LT.x - 2, deckY + 0.5, LT.z - 2];
  for (const o of [[-0.7, 0, -0.4], [0.7, 0, -0.4], [0, 0, 0.8]]) {
    rod([tb[0] + o[0], tb[1] + o[1], tb[2] + o[2]], [tb[0], tb[1] + 2.6, tb[2]], 0.2, C(60, 60, 65), dec());
  }
  const scope = rod([tb[0] + 0.9, tb[1] + 2.4, tb[2] + 0.7], [tb[0] - 1.3, tb[1] + 3.4, tb[2] - 0.6], 0.7, C(200, 160, 60), { mat: "Metal" });
  z.prompt(scope, "Look", () => {
    z.tone(1.6);
    z.notify("Through the telescope: something copper-green is SPINNING on the barn roof (those hay bales look like stairs)... and a snorkel is poking up UNDER the dock!");
  }, { distance: 8 });
  // summit bench
  const bx = 103, bz = -114;
  const by = groundY(bx, bz);
  box([5, 0.4, 1.5], L(bx, by + 1.6, bz, 20), WOOD, { mat: "WoodPlanks" });
  box([5, 1.4, 0.3], M(L(bx, by + 2.4, bz, 20), T(0, 0, 0.7)), WOOD, { mat: "WoodPlanks" });
  for (const sx of [-2, 2]) box([0.3, 1.8, 1.3], M(L(bx, by + 0.7, bz, 20), T(sx, 0, 0)), DARKWOOD, { mat: "Wood" });
  sign(84, -50, 200, 7, 2.6, "LOOKOUT HILL ^\nview: excellent. cats: 1", { trim: C(120, 210, 90) });

  // ---- trees, bushes, clouds ---------------------------------------------------------------------
  for (const p of [[-5, 100], [18, 128], [42, 102], [-4, 84], [60, 140], [80, 118], [-100, 128], [-120, 100], [-175, 100], [-30, 130], [-135, 25]]) {
    cherry(p[0], p[1], z.random(0.9, 1.2));
  }
  for (const p of [[-175, -60], [-178, -125], [-150, -165], [-115, -178], [-25, -170], [5, -150], [-140, -95],
    [175, -20], [180, 40], [178, 105], [120, 180], [60, -185], [175, -185], [-180, 60], [-60, -175]]) {
    oak(p[0], p[1], z.random(0.9, 1.3));
  }
  for (const p of [[-160, -40], [-95, -30], [-40, -40], [50, -30], [85, 20], [150, 20], [160, -60], [30, 70],
    [-90, 20], [-126, -16], [110, 120], [-5, -30], [170, 70], [-175, 42], [-100, 175], [40, 175]]) {
    bush(p[0], p[1], z.random(0.8, 1.3));
  }
  for (let i = 1; i <= 8; i++) {
    const x = z.random(-170, 170), zz = z.random(-170, 170), y = z.random(100, 135);
    const s = z.random(1, 1.6);
    ball(14 * s, L(x, y, zz), C(255, 255, 255), dec());
    ball(10 * s, L(x + 9 * s, y - 1.5 * s, zz + 2), C(250, 250, 255), dec());
    ball(10 * s, L(x - 9 * s, y - 2 * s, zz - 1), C(250, 250, 255), dec());
  }

  deco.finish();

  // ---- CATS -------------------------------------------------------------------------------------
  z.cat(1, L(-136, 0.16, -9, 90));
  z.cat(2, L(-86, 0, -120, 160));
  z.cat(3, L(-112, 0.2, 52, 120));
  z.cat(4, L(70, 0.16, 1, 90));
  z.cat(5, L(-112, 3.2, -55, 180));
  z.cat(6, L(2, 0, -52, 180));
  z.cat(7, L(-50, 1, -135, 180));
  z.cat(8, L(-32, -3.6, 88, 200));
  z.cat(9, L(-17, 0, -84, 180));
  z.cat(10, L(116, 0, 90, 90));
  z.cat(11, L(62, 2, 42, 90));
  z.cat(12, L(103, groundY(103, -104), -104, 200));
  z.cat(13, L(20, 24.6, -86, 180));
  z.cat(14, L(-49, -7, 68, 90), { scale: 0.85 });
}
