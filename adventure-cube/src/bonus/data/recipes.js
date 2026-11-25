// recipes.js - crafting / cooking / smelting recipes (CRAFT owns; HOUSE + tests read). DOM-free data.
// recipe = { id, out: [itemId, n], cost: { itemId: n }, station }
// station: "hand" (anywhere) | "workbench" | "campfire" | "furnace" | "anvil" | "smoker" | "kitchen"
//   (smoker + kitchen exist only as house perks; the others as placed objects OR house perks; see BONUS.md 5.4)
// Recipe ids are FROZEN (the UI may remember them); CRAFT may add and tune.
import { ITEMS, TIERS } from "./items.js";

const R = [];
const r = (id, out, n, cost, station) => R.push({ id, out: [out, n], cost, station });

// ---- by hand ----
r("stick", "stick", 4, { wood: 1 }, "hand");
r("rope", "rope", 1, { fiber: 3 }, "hand");
r("workbench", "workbench", 1, { wood: 6 }, "hand");
r("campfire", "campfire", 1, { wood: 4, stone: 3 }, "hand");
r("torch", "torch", 4, { stick: 1, coal: 1 }, "hand");
// CRAFT additions
r("bandage", "bandage", 1, { fiber: 4 }, "hand");
r("flint_gravel", "flint", 1, { gravel: 3 }, "hand");
r("rope_hide", "rope", 3, { hide: 1 }, "hand");

// ---- workbench ----
r("plank", "plank", 2, { wood: 1 }, "workbench");
r("chest", "chest", 1, { plank: 8 }, "workbench");
r("furnace", "furnace", 1, { stone: 12, clay: 4 }, "workbench");
r("anvil", "anvil", 1, { iron_ingot: 5, stone: 4 }, "workbench");
r("bow", "bow", 1, { stick: 3, rope: 2 }, "workbench");
r("arrow", "arrow", 4, { stick: 1, flint: 1, feather: 1 }, "workbench");
r("arrow_plain", "arrow", 2, { stick: 1, flint: 1 }, "workbench");   // no feathers yet: fewer arrows
const TOOL_COST = { axe: [3, 2], pickaxe: [3, 2], sword: [2, 1], spear: [1, 3], hammer: [4, 2] }; // [material, sticks]
const MAT = { 1: "wood", 2: "stone", 3: "iron_ingot", 4: "steel_ingot" };
for (const type of Object.keys(TOOL_COST)) {
  for (let t = 1; t <= 4; t++) {
    const [m, s] = TOOL_COST[type];
    // the stone spear has a flint tip instead of a stone head
    const cost = t === 2 && type === "spear" ? { flint: 1, stick: s } : { [MAT[t]]: m, stick: s };
    r(TIERS[t] + "_" + type, TIERS[t] + "_" + type, 1, cost, t <= 2 ? "workbench" : "anvil");
  }
}

// ---- campfire: cook every raw food ----
for (const it of Object.values(ITEMS)) if (it.food && it.food.cooks) r("cook_" + it.id, it.food.cooks, 1, { [it.id]: 1 }, "campfire");

// ---- furnace ----
r("iron_ingot", "iron_ingot", 1, { iron_ore: 1, coal: 1 }, "furnace");
r("gold_ingot", "gold_ingot", 1, { gold_ore: 1, coal: 1 }, "furnace");
r("steel_ingot", "steel_ingot", 1, { iron_ingot: 2, coal: 2 }, "furnace");
r("brick", "brick", 2, { clay: 2, coal: 1 }, "furnace");
r("glass", "glass", 2, { sand: 2, coal: 1 }, "furnace");

// ---- anvil ----
r("lantern", "lantern", 2, { iron_ingot: 1, glass: 1, coal: 1 }, "anvil");

// ---- house perk stations ----
r("jerky_venison", "jerky", 2, { raw_venison: 1 }, "smoker");
r("jerky_mutton", "jerky", 2, { raw_mutton: 1 }, "smoker");
r("jerky_pork", "jerky", 2, { raw_pork: 1 }, "smoker");
r("stew", "stew", 2, { venison_steak: 1, mushroom: 1, carrot: 1 }, "kitchen");
r("stew_fish", "stew", 2, { grilled_fish: 1, mushroom: 1, carrot: 1 }, "kitchen");
r("berry_pie", "berry_pie", 2, { berries: 4, apple: 2 }, "kitchen");

export const RECIPES = Object.freeze(R);
export const RECIPE = Object.freeze(Object.fromEntries(R.map((x) => [x.id, x])));
export const STATIONS = ["hand", "workbench", "campfire", "furnace", "anvil", "smoker", "kitchen"];
// display names + how to get each station (UI hints for locked stations)
export const STATION_INFO = {
  hand: { name: "By hand", how: "Always available." },
  workbench: { name: "Workbench", how: "Craft a Workbench (6 wood) and place it within 4 tiles." },
  campfire: { name: "Campfire", how: "Craft a Campfire (4 wood, 3 stone) and place it, or upgrade your house to the Camp." },
  furnace: { name: "Furnace", how: "Craft a Furnace at a workbench (12 stone, 4 clay) and place it." },
  anvil: { name: "Anvil", how: "Craft an Anvil at a workbench (5 iron ingots, 4 stone) and place it." },
  smoker: { name: "Smoker", how: "A house upgrade adds a smokehouse: use it at home." },
  kitchen: { name: "Kitchen", how: "A house upgrade adds a kitchen: use it at home." },
};
// recipes grouped by station, in STATIONS order
export const RECIPES_BY_STATION = Object.freeze(Object.fromEntries(STATIONS.map((st) => [st, R.filter((x) => x.station === st)])));
