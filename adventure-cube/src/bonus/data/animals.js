// animals.js - the animal table (CREATURES owns; RENDER/AUDIO/tests read). DOM-free data. Kind ids are FROZEN.
// hp; w,h = hit box px (feet on the ground); speed = run px/step (walk = speed * 0.4; the cube runs 3.5);
// ai: "flee"     grazes / wanders; runs away when the player is within `sight` tiles or after being hit
//     "flutter"  like flee but bolts in short flapping arcs over obstacles (pheasant)
//     "provoked" grazes; when hit it charges and head-butts the player for a few seconds, then calms down (goat)
//     "charge"   notices the player within `sight`, paws the ground `windup` steps (telegraph), then rams in a line
//     "pack"     night hunters in groups: prowl toward the player, circle at ~4 tiles, one lunges at a time;
//                fear light (campfires, torches, house lamps), flee at low hp and at dawn
//     "territorial" slow wander near its den; rears up and charges if the player comes within `sight` or hits it;
//                gives up beyond SPAWN.giveUp tiles from its den
//     "swim"     lives in water tiles only, darts away from the player, sometimes surfaces with a splash
// dmg = damage to the player per hit (contact during an attack), kb = knockback px/step, cd = steps between hits
// drops = [[itemId, min, max, chance]]; biomes = BIOMES names (data/tiles.js); time = "day" | "night" | "any";
// cap = max alive in the active area; group = [min, max] spawned together; weight = spawn chance weight;
// sound = names BONUS_AUDIO synthesizes ("squeak", "cluck", "bleat", "grunt", "howl", "growl", "splash")
// CREATURES extras (all optional): armor = flat damage reduction per hit (min 1 gets through);
// kbResist 0..1 = knockback taken is (1 - kbResist); jump = wall height in tiles it hops over; drop = tiles it will
// step down while calm; sleeps = "night" (curls up at night; sneak attacks deal x2); fleeHp = flees below this hp
// fraction; biomeMul = { biome: weight multiplier }; rare = extra chance gate per spawn attempt; call = [min, max]
// steps between idle calls; nightOnly / dayOnly derive from `time`.
export const ANIMAL_DEFS = {
  rabbit: { name: "Rabbit", hp: 6, w: 18, h: 14, speed: 3.6, ai: "flee", sight: 5, dmg: 0, kb: 0, cd: 0,
    drops: [["raw_small_meat", 1, 1, 1], ["hide", 1, 1, 0.25]], biomes: ["meadow", "forest"], time: "day", cap: 6, group: [1, 2], weight: 6, sound: "squeak",
    armor: 0, kbResist: 0, jump: 1, drop: 3, sleeps: "night", call: [900, 1800] },
  pheasant: { name: "Pheasant", hp: 5, w: 20, h: 18, speed: 2.8, ai: "flutter", sight: 6, dmg: 0, kb: 0, cd: 0,
    drops: [["raw_small_meat", 1, 1, 1], ["feather", 1, 3, 1]], biomes: ["meadow", "forest"], time: "day", cap: 4, group: [1, 3], weight: 4, sound: "cluck",
    armor: 0, kbResist: 0, jump: 1, drop: 4, sleeps: "night", call: [420, 1100] },
  deer: { name: "Deer", hp: 20, w: 40, h: 40, speed: 4.2, ai: "flee", sight: 8, dmg: 0, kb: 0, cd: 0,
    drops: [["raw_venison", 2, 3, 1], ["hide", 1, 1, 1]], biomes: ["meadow", "forest"], time: "any", cap: 4, group: [1, 3], weight: 4, sound: "bleat",
    armor: 0, kbResist: 0.15, jump: 2, drop: 3, sleeps: "night", call: [1200, 2400] },
  goat: { name: "Mountain goat", hp: 18, w: 34, h: 30, speed: 3.2, ai: "provoked", sight: 6, windup: 16, dmg: 6, kb: 5, cd: 50,
    drops: [["raw_mutton", 2, 2, 1], ["hide", 1, 1, 0.6]], biomes: ["hills"], time: "day", cap: 4, group: [1, 3], weight: 5, sound: "bleat",
    armor: 0, kbResist: 0.3, jump: 2, drop: 4, sleeps: "night", fleeHp: 0.3, call: [700, 1600] },
  boar: { name: "Wild boar", hp: 30, w: 38, h: 28, speed: 4.4, ai: "charge", sight: 6, windup: 40, dmg: 10, kb: 7, cd: 60,
    drops: [["raw_pork", 2, 3, 1], ["hide", 1, 1, 1]], biomes: ["forest", "pinewood"], time: "any", cap: 3, group: [1, 2], weight: 3, sound: "grunt",
    armor: 1, kbResist: 0.5, jump: 1, drop: 3, call: [600, 1400] },
  wolf: { name: "Wolf", hp: 26, w: 40, h: 26, speed: 4.6, ai: "pack", sight: 12, windup: 22, dmg: 8, kb: 6, cd: 55,
    drops: [["hide", 1, 1, 1], ["fang", 1, 1, 0.6]], biomes: ["forest", "pinewood", "hills", "meadow"], time: "night", cap: 4, group: [2, 4], weight: 4, sound: "howl",
    armor: 0, kbResist: 0.25, jump: 1, drop: 5, fleeHp: 0.35, biomeMul: { meadow: 0.5 }, call: [900, 1500] },
  bear: { name: "Brown bear", hp: 90, w: 58, h: 44, speed: 3.7, ai: "territorial", sight: 5, windup: 45, dmg: 22, kb: 9, cd: 66,
    drops: [["big_meat", 3, 4, 1], ["bear_hide", 1, 1, 1]], biomes: ["pinewood"], time: "any", cap: 1, group: [1, 1], weight: 1, sound: "growl",
    armor: 5, kbResist: 0.8, jump: 1, drop: 3, sleeps: "night", rare: 0.35, call: [1500, 3000] },
  fish: { name: "Trout", hp: 4, w: 20, h: 10, speed: 2.4, ai: "swim", sight: 4, dmg: 0, kb: 0, cd: 0,
    drops: [["raw_fish", 1, 1, 1]], biomes: ["river"], time: "any", cap: 5, group: [1, 3], weight: 5, sound: "splash",
    armor: 0, kbResist: 0, call: [700, 1500] },
};
export const ANIMAL_KINDS = Object.freeze(Object.keys(ANIMAL_DEFS));
export const HOSTILE = Object.freeze({ boar: 1, wolf: 1, bear: 1, goat: 1 }); // can hurt the player
// spawning + combat rules shared with WORLD/HOUSE (CREATURES applies them):
export const SPAWN = {
  minDist: 22, maxDist: 40,  // tiles from the player (spawn off-screen)
  despawnDist: 70,           // tiles: animals this far away are removed
  every: 240,                // steps between spawn attempts
  lightRadiusFear: 1,        // wolves never spawn within (light radius * this) tiles of a light; flee lights
  homeSafe: 14,              // tiles around the house kept free of night hunters once the house has "lamps"
  // ---- CREATURES additions ----
  everyLow: 60,              // spawn attempts this often while fewer than `lowPop` animals are around
  lowPop: 4,
  maxTotal: 14,              // all kinds together
  fishMinDist: 10,           // fish may appear closer (they spawn deep in the water)
  dawnLeave: 24,             // night hunters leaving at dawn vanish once this far away (off-screen)
  packRing: 4,               // tiles: wolves circle at this distance
  packRingTorch: 6.5,        //        ... further while the cube holds a torch / lantern
  lungeGap: 75,              // steps between two lunges of the same pack (x3 while the cube holds a light)
  giveUp: 14,                // tiles: bears/boars/goats stop chasing this far from home / the player
  iframes: 8,                // steps an animal ignores further hits after one landed (arrows, cleaves)
  sneakMul: 2,               // damage multiplier against a sleeping animal
  quietSight: 0.55,          // prey sight multiplier while the cube stands still / walks slowly
  faintCalm: 3600,           // steps without hostile spawns after the cube faints (wolves already around leave)
};
