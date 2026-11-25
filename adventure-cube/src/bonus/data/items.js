// items.js - every bonus item (CRAFT owns; everyone reads). DOM-free data. Item ids are FROZEN (saves use them).
// CRAFT may add items and tune numbers; never rename or remove an id.
//
// item = { id, name, kind, stack, icon: {shape, color, color2?}, desc?,
//          tool?:  { type, tier, power, dmg, reach, cd, dur }   (stack 1; slot.d = durability left)
//          food?:  { hunger, hp, raw?: true, cooks?: "<cooked id>" }
//          place?: "<OBJECT_DEFS kind>"        (B_USE places a world object)
//          block?: true                         (B_USE places the tile PLACE_TILE[id], data/tiles.js)
//          light?: tiles                        (held light radius when selected, e.g. torch)
//          ammo?:  "bow" }
// kinds: "resource" | "food" | "tool" | "place" | "block" | "ammo"
// icon.shape (for RENDER's icon painter, placeholder colors in icon.color):
//   log stick plank fiber rope rock flint lump ore ingot gem brick glass hide feather fang sapling dirt sand
//   berries apple mushroom carrot meat steak fish drumstick roast jerky stew pie
//   axe pickaxe sword spear hammer bow arrow torch lantern workbench campfire furnace anvil chest

export const TIERS = ["hand", "wood", "stone", "iron", "steel"];           // tier index 0..4
export const TIER_COLOR = ["#e8c39e", "#9a6b3f", "#8d8c88", "#c9ccd2", "#7fa6c9"];
// hand = what an empty slot (or a non-tool item) swings with
export const HAND = Object.freeze({ type: "hand", tier: 0, power: 1, dmg: 2, reach: 1.4, cd: 20, dur: 0 });

// tool stats per type per tier (1..4). power = work per swing on its preferred target; dmg = damage to animals;
// reach = melee reach in tiles; cd = steps between swings; dur = swings before it breaks
const TOOL_BASE = {
  axe: { power: [2, 3, 5, 8], dmg: [4, 6, 9, 12], reach: 1.5, cd: 22 },
  pickaxe: { power: [2, 3, 5, 8], dmg: [3, 4, 6, 8], reach: 1.5, cd: 22 },
  sword: { power: [1, 1, 1, 1], dmg: [6, 9, 14, 20], reach: 1.7, cd: 16 },
  spear: { power: [1, 1, 1, 1], dmg: [5, 8, 12, 17], reach: 2.6, cd: 24 },
  hammer: { power: [2, 3, 4, 6], dmg: [3, 5, 8, 11], reach: 1.5, cd: 26 },
};
const DUR = [60, 130, 300, 700];
const TOOL_NAMES = { axe: "Axe", pickaxe: "Pickaxe", sword: "Sword", spear: "Spear", hammer: "Hammer" };
const TIER_NAMES = ["Wooden", "Stone", "Iron", "Steel"];

const L = [];
const add = (id, name, kind, stack, icon, extra = {}) => L.push(Object.assign({ id, name, kind, stack, icon }, extra));

// ---- resources ----
add("wood", "Wood", "resource", 99, { shape: "log", color: "#8a5a32" }, { desc: "Chopped from trees." });
add("stick", "Stick", "resource", 99, { shape: "stick", color: "#a77b4f" });
add("plank", "Planks", "block", 99, { shape: "plank", color: "#c79a5e" }, { block: true });
add("fiber", "Plant fiber", "resource", 99, { shape: "fiber", color: "#8fb04a" }, { desc: "From tall grass and bushes." });
add("rope", "Rope", "resource", 99, { shape: "rope", color: "#c8a86a" });
add("stone", "Stone", "block", 99, { shape: "rock", color: "#8d8c88" }, { block: true });
add("flint", "Flint", "resource", 99, { shape: "flint", color: "#4f5560" });
add("dirt", "Dirt", "block", 99, { shape: "dirt", color: "#6b4a2f" }, { block: true });
add("sand", "Sand", "block", 99, { shape: "sand", color: "#e0cf96" }, { block: true });
add("gravel", "Gravel", "resource", 99, { shape: "lump", color: "#8a847b" });
add("clay", "Clay", "resource", 99, { shape: "lump", color: "#b9876a" });
add("coal", "Coal", "resource", 99, { shape: "lump", color: "#2a2a2e" });
add("iron_ore", "Iron ore", "resource", 99, { shape: "ore", color: "#8d8c88", color2: "#c7835a" });
add("gold_ore", "Gold ore", "resource", 99, { shape: "ore", color: "#8d8c88", color2: "#f1c84b" });
add("crystal", "Crystal", "resource", 99, { shape: "gem", color: "#9ad8ff" }, { desc: "Found deep underground." });
add("iron_ingot", "Iron ingot", "resource", 99, { shape: "ingot", color: "#c9ccd2" });
add("gold_ingot", "Gold ingot", "resource", 99, { shape: "ingot", color: "#f1c84b" });
add("steel_ingot", "Steel ingot", "resource", 99, { shape: "ingot", color: "#7fa6c9" });
add("brick", "Brick", "block", 99, { shape: "brick", color: "#b5553a" }, { block: true });
add("glass", "Glass", "block", 99, { shape: "glass", color: "#bfe8f2" }, { block: true });
add("hide", "Hide", "resource", 99, { shape: "hide", color: "#a0764e" });
add("bear_hide", "Bear hide", "resource", 99, { shape: "hide", color: "#5a3c26" });
add("feather", "Feather", "resource", 99, { shape: "feather", color: "#e8e2d0" });
add("fang", "Wolf fang", "resource", 99, { shape: "fang", color: "#efe8d8" });
add("sapling", "Sapling", "place", 99, { shape: "sapling", color: "#5c9a3a" }, { place: "sapling", desc: "Plant it on grass to grow a tree." });

// ---- food (hunger / hp restored; raw meat gives a quarter and cooks at a campfire) ----
const food = (id, name, shape, color, hunger, hp, extra = {}) => add(id, name, "food", 30, { shape, color }, { food: Object.assign({ hunger, hp }, extra) });
food("berries", "Berries", "berries", "#c2334a", 6, 1);
food("apple", "Apple", "apple", "#d6402e", 8, 2);
food("mushroom", "Mushroom", "mushroom", "#c9a27a", 4, 0, { cooks: "cooked_mushroom" });
food("cooked_mushroom", "Roasted mushroom", "mushroom", "#8a5a32", 9, 2);
food("carrot", "Carrot", "carrot", "#ee8a2a", 7, 1);
food("raw_small_meat", "Raw meat", "drumstick", "#e58b8b", 4, 0, { raw: true, cooks: "cooked_small_meat" });
food("cooked_small_meat", "Cooked meat", "drumstick", "#9a5a2e", 18, 4);
food("raw_venison", "Raw venison", "meat", "#d9776f", 6, 0, { raw: true, cooks: "venison_steak" });
food("venison_steak", "Venison steak", "steak", "#8d4f2a", 30, 8);
food("raw_mutton", "Raw mutton", "meat", "#e08f86", 5, 0, { raw: true, cooks: "cooked_mutton" });
food("cooked_mutton", "Cooked mutton", "steak", "#94582f", 26, 6);
food("raw_pork", "Raw pork", "meat", "#eda0a0", 7, 0, { raw: true, cooks: "pork_roast" });
food("pork_roast", "Pork roast", "roast", "#9b5326", 34, 8);
food("raw_fish", "Raw fish", "fish", "#8fb3c8", 5, 0, { raw: true, cooks: "grilled_fish" });
food("grilled_fish", "Grilled fish", "fish", "#b27a3e", 20, 6);
food("big_meat", "Big raw roast", "roast", "#d66f6f", 10, 0, { raw: true, cooks: "bear_roast" });
food("bear_roast", "Hearty roast", "roast", "#874420", 50, 15);
food("jerky", "Smoked jerky", "jerky", "#7a3d20", 36, 8);
food("stew", "Forest stew", "stew", "#a8642c", 60, 25);
food("berry_pie", "Berry pie", "pie", "#b0405a", 40, 12);
// medicine: no hunger, heals (used like food with USE). icon reuses the "rope" shape (a rolled cloth)
add("bandage", "Bandage", "food", 10, { shape: "rope", color: "#efe6d2", color2: "#c8423a" }, { food: { hunger: 0, hp: 25, medicine: true } });

// ---- tools: 5 types x 4 tiers + bow ----
for (const type of Object.keys(TOOL_BASE)) {
  for (let t = 1; t <= 4; t++) {
    const b = TOOL_BASE[type];
    add(TIERS[t] + "_" + type, TIER_NAMES[t - 1] + " " + TOOL_NAMES[type].toLowerCase(), "tool", 1,
      { shape: type, color: TIER_COLOR[t], color2: "#7a5532" },
      { tool: { type, tier: t, power: b.power[t - 1], dmg: b.dmg[t - 1], reach: b.reach, cd: b.cd, dur: DUR[t - 1] } });
  }
}
add("bow", "Hunting bow", "tool", 1, { shape: "bow", color: "#9a6b3f" }, { tool: { type: "bow", tier: 1, power: 0, dmg: 7, reach: 12, cd: 34, dur: 150 }, desc: "Shoots arrows. Hold to aim." });
add("arrow", "Arrow", "ammo", 99, { shape: "arrow", color: "#c8b48a" }, { ammo: "bow" });

// ---- placeables ----
add("workbench", "Workbench", "place", 9, { shape: "workbench", color: "#a7743f" }, { place: "workbench" });
add("campfire", "Campfire", "place", 9, { shape: "campfire", color: "#f08a2a" }, { place: "campfire", light: 0 });
add("furnace", "Furnace", "place", 9, { shape: "furnace", color: "#7d7a74" }, { place: "furnace" });
add("anvil", "Anvil", "place", 9, { shape: "anvil", color: "#4b4f57" }, { place: "anvil" });
add("chest", "Chest", "place", 9, { shape: "chest", color: "#9a6b3f" }, { place: "chest" });
add("torch", "Torch", "place", 99, { shape: "torch", color: "#ffb347" }, { place: "torch", light: 5 });
add("lantern", "Lantern", "place", 20, { shape: "lantern", color: "#ffd27a" }, { place: "lantern", light: 7 });

// ---- tooltip descriptions (only where none was given above) ----
const DESC = {
  stick: "Handles for tools, torches and arrows.", plank: "Sawn boards. Build with them or place as a block.",
  rope: "Twisted plant fiber. Tents, bows, houses.", stone: "Mined with a pickaxe. Place it as cobblestone.",
  flint: "Sharp stone chips from gravel and rock. Arrow tips.", dirt: "Diggable by hand. Place it to build.",
  sand: "Found on river banks. Smelt it into glass.", gravel: "Loose stones. Often hides flint.",
  clay: "Soft clay near water. Bricks and furnaces.", coal: "Fuel for torches and the furnace.",
  iron_ore: "Needs a stone pickaxe. Smelt it in a furnace.", gold_ore: "Needs an iron pickaxe. Smelt it in a furnace.",
  iron_ingot: "Forge iron tools at an anvil.", gold_ingot: "Precious metal for grand houses.",
  steel_ingot: "The strongest metal: 2 iron + 2 coal.", brick: "Fired clay. Strong walls.", glass: "Clear windows.",
  hide: "From hunted animals. Tents and rope.", bear_hide: "A thick, warm bear hide.", feather: "From pheasants. Fletch arrows.",
  fang: "A wolf fang. A hunter trophy.", berries: "Sweet. A tiny snack.", apple: "Crunchy and fresh.",
  mushroom: "Better roasted at a campfire.", carrot: "Grown in your garden.", jerky: "Smoked meat that keeps you going.",
  stew: "A hearty bowl: lots of food and health.", berry_pie: "Baked in the kitchen. Delicious.",
  bandage: "Heals 25 health. No food value.", arrow: "Ammo for the hunting bow.",
  workbench: "Station: planks, chests, wood and stone tools.", campfire: "Station: cook raw food. Gives light.",
  furnace: "Station: smelt ore, fire bricks and glass.", anvil: "Station: forge iron and steel tools.",
  chest: "Place it to store 18 stacks.", torch: "Light. Keeps wolves away at night.", lantern: "Bright light. Hang it on walls.",
};
const TOOL_DESC = { axe: "Chops trees fast.", pickaxe: "Mines stone and ore.", sword: "Fast melee weapon for hunting.", spear: "Long reach: hit animals and fish from further away.", hammer: "Builds and upgrades your house (keep it in your bag)." };
for (const it of L) {
  if (!it.desc && DESC[it.id]) it.desc = DESC[it.id];
  if (!it.desc && it.food && it.food.raw) it.desc = "Raw: cook it at a campfire. Eaten raw it gives a tummy ache.";
  if (!it.desc && it.food) it.desc = "Cooked food.";
  if (!it.desc && it.tool) it.desc = TOOL_DESC[it.tool.type] || "";
}

export const ITEM_LIST = Object.freeze(L);
export const ITEMS = Object.freeze(Object.fromEntries(L.map((it) => [it.id, it])));
export const item = (id) => ITEMS[id] || null;
export const isTool = (id) => !!(ITEMS[id] && ITEMS[id].tool);
export const toolOf = (id) => (ITEMS[id] && ITEMS[id].tool) || HAND;
export const stackOf = (id) => (ITEMS[id] ? ITEMS[id].stack : 99);
export const itemName = (id) => (ITEMS[id] ? ITEMS[id].name : id);
