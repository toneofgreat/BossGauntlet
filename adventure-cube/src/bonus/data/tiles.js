// tiles.js - bonus tile + world-object tables (WORLD owns; others read). DOM-free, pure data + tiny helpers.
// Tile codes are stored in G.world.tiles (Uint8Array, index y*W+x). Codes are FROZEN (saves depend on them);
// add new tiles only at the end.
//
// hp    = work units to break (each swing adds the tool's work, see BONUS.md 5.3)
// tier  = minimum PICKAXE tier needed (0 = anything incl. bare hands). 99 = unbreakable
// pref  = which tool works at full power: "pick" | "axe" | "any" (any = pickaxe or hand-level for everyone)
// drop  = [itemId, n] when broken (null = nothing), alt = [itemId, n, chance] extra roll
// solid = blocks movement; liquid = swimmable water; place = item id that places this tile (for the UI/renderer)
export const TILE_DEFS = [
  /* 0 */ { id: "air", name: "Air", solid: false, hp: 0, tier: 0, pref: "any", drop: null },
  /* 1 */ { id: "dirt", name: "Dirt", solid: true, hp: 3, tier: 0, pref: "any", drop: ["dirt", 1], place: "dirt" },
  /* 2 */ { id: "grass", name: "Grassy dirt", solid: true, hp: 3, tier: 0, pref: "any", drop: ["dirt", 1], alt: ["fiber", 1, 0.3] },
  /* 3 */ { id: "stone", name: "Stone", solid: true, hp: 6, tier: 1, pref: "pick", drop: ["stone", 1], alt: ["flint", 1, 0.06] },
  /* 4 */ { id: "coal_ore", name: "Coal seam", solid: true, hp: 8, tier: 1, pref: "pick", drop: ["coal", 2] },
  /* 5 */ { id: "iron_ore", name: "Iron ore", solid: true, hp: 12, tier: 2, pref: "pick", drop: ["iron_ore", 1] },
  /* 6 */ { id: "gold_ore", name: "Gold ore", solid: true, hp: 16, tier: 3, pref: "pick", drop: ["gold_ore", 1] },
  /* 7 */ { id: "crystal", name: "Crystal", solid: true, hp: 24, tier: 4, pref: "pick", drop: ["crystal", 1], alt: ["crystal", 1, 0.25] },
  /* 8 */ { id: "clay", name: "Clay", solid: true, hp: 4, tier: 0, pref: "any", drop: ["clay", 2] },
  /* 9 */ { id: "sand", name: "Sand", solid: true, hp: 2, tier: 0, pref: "any", drop: ["sand", 1], place: "sand" },
  /* 10 */ { id: "gravel", name: "Gravel", solid: true, hp: 3, tier: 0, pref: "any", drop: ["gravel", 1], alt: ["flint", 1, 0.3] },
  /* 11 */ { id: "water", name: "Water", solid: false, liquid: true, hp: 0, tier: 99, pref: "any", drop: null },
  /* 12 */ { id: "bedrock", name: "Bedrock", solid: true, hp: 0, tier: 99, pref: "pick", drop: null },
  /* 13 */ { id: "planks", name: "Planks", solid: true, hp: 4, tier: 0, pref: "axe", drop: ["plank", 1], place: "plank" },
  /* 14 */ { id: "cobble", name: "Cobblestone", solid: true, hp: 8, tier: 1, pref: "pick", drop: ["stone", 1], place: "stone" },
  /* 15 */ { id: "brick", name: "Brick wall", solid: true, hp: 10, tier: 1, pref: "pick", drop: ["brick", 1], place: "brick" },
  /* 16 */ { id: "glass", name: "Glass", solid: true, hp: 2, tier: 0, pref: "any", drop: ["glass", 1], place: "glass" },
  /* 17 */ { id: "mossy", name: "Mossy stone", solid: true, hp: 6, tier: 1, pref: "pick", drop: ["stone", 1] },
  /* 18 */ { id: "snow", name: "Snowy dirt", solid: true, hp: 3, tier: 0, pref: "any", drop: ["dirt", 1] },
];
export const TILE = Object.freeze(Object.fromEntries(TILE_DEFS.map((d, i) => [d.id.toUpperCase(), i])));
// fast lookup arrays (index = code)
export const SOLID = Uint8Array.from(TILE_DEFS.map((d) => (d.solid ? 1 : 0)));
export const LIQUID = Uint8Array.from(TILE_DEFS.map((d) => (d.liquid ? 1 : 0)));
export const isSolid = (c) => SOLID[c] === 1;
export const isLiquid = (c) => LIQUID[c] === 1;
// item id -> tile code it places (blocks)
export const PLACE_TILE = Object.freeze({ dirt: TILE.DIRT, sand: TILE.SAND, plank: TILE.PLANKS, stone: TILE.COBBLE, brick: TILE.BRICK, glass: TILE.GLASS });

// ---- biomes: G.world.biome[x] per column ----
export const BIOMES = ["meadow", "forest", "pinewood", "hills", "river"];
export const BIOME = Object.freeze({ MEADOW: 0, FOREST: 1, PINEWOOD: 2, HILLS: 3, RIVER: 4 });

// ---- trees (objects in G.world.trees; see BONUS.md 3.4) ----
// hp = chop work; tier = minimum AXE tier (0 = hands ok); wood = [min,max] wood dropped when felled;
// fruit = item that can hang on mature trees; h = trunk+crown height in tiles (renderer + hit box)
export const TREE_DEFS = {
  oak: { name: "Oak", hp: 8, tier: 0, wood: [4, 6], sticks: [1, 2], sapling: 0.6, fruit: "apple", h: 7, crown: 5 },
  birch: { name: "Birch", hp: 6, tier: 0, wood: [3, 4], sticks: [1, 2], sapling: 0.5, fruit: null, h: 7, crown: 3 },
  pine: { name: "Pine", hp: 10, tier: 0, wood: [5, 7], sticks: [1, 3], sapling: 0.5, fruit: null, h: 9, crown: 4 },
  ancient: { name: "Ancient oak", hp: 30, tier: 2, wood: [14, 18], sticks: [3, 5], sapling: 1, fruit: "apple", h: 12, crown: 9 },
};
// growth: stage 0 stump -> 1 sapling -> 2 young -> 3 mature (choppable from 2; young trees drop half wood)
export const TREE_GROW = { stumpToSapling: 7200, saplingToYoung: 10800, youngToMature: 14400 }; // steps (2, 3, 4 min)

// ---- world objects (G.world.objects; BONUS.md 3.5). Placed stations + natural pickables. ----
// w,h = tiles occupied (bottom-left at obj.x, obj.y = the air row it stands in; ground is row y+1)
// hp/tool = hits to remove (pref tool type) and what it drops; light = radius in tiles (renderer + wolf fear);
// station = crafting station id it provides within STATION_RANGE tiles; use = what B_USE does
export const OBJECT_DEFS = {
  workbench: { name: "Workbench", w: 2, h: 1, hp: 6, pref: "axe", drop: ["workbench", 1], station: "workbench" },
  campfire: { name: "Campfire", w: 1, h: 1, hp: 3, pref: "any", drop: ["campfire", 1], station: "campfire", light: 7 },
  furnace: { name: "Furnace", w: 2, h: 2, hp: 10, pref: "pick", drop: ["furnace", 1], station: "furnace", light: 4 },
  anvil: { name: "Anvil", w: 1, h: 1, hp: 12, pref: "pick", drop: ["anvil", 1], station: "anvil" },
  chest: { name: "Chest", w: 1, h: 1, hp: 6, pref: "axe", drop: ["chest", 1], use: "chest", slots: 18 },
  torch: { name: "Torch", w: 1, h: 1, hp: 1, pref: "any", drop: ["torch", 1], light: 6, wall: true },
  lantern: { name: "Lantern", w: 1, h: 1, hp: 2, pref: "any", drop: ["lantern", 1], light: 9, wall: true },
  // natural
  bush: { name: "Berry bush", w: 1, h: 1, hp: 3, pref: "any", drop: ["fiber", 2], use: "harvest", harvest: ["berries", 2, 4], regrow: 9000, natural: true },
  tallgrass: { name: "Tall grass", w: 1, h: 1, hp: 1, pref: "any", drop: ["fiber", 2], alt: ["sapling", 1, 0.05], natural: true },
  mushroom: { name: "Mushrooms", w: 1, h: 1, hp: 1, pref: "any", drop: ["mushroom", 1], use: "pick", natural: true },
  boulder: { name: "Loose rocks", w: 1, h: 1, hp: 4, pref: "pick", drop: ["stone", 3], alt: ["flint", 1, 0.5], natural: true },
  flowers: { name: "Wildflowers", w: 1, h: 1, hp: 1, pref: "any", drop: ["fiber", 1], natural: true },
};
export const STATION_RANGE = 4; // tiles from the player's center to a station object's center
