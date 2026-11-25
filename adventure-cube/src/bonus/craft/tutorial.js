// craft/tutorial.js - the in-world hint flow (CRAFT owns). DOM-free.
// A short chain of goals: first wood -> workbench -> wooden pickaxe -> stone -> stone tools -> lean-to -> weapon ->
// hunt -> campfire -> cook -> iron -> furnace -> keep upgrading. The current goal index lives in G.flags.tut
// (saved by CORE with the flags); G.flags.tutOff = 1 hides hints. Goals already met are skipped, so a player who
// does things out of order is never nagged. Emits "hint" { i, n, id, text, touch } whenever the goal changes
// (text = keyboard/mouse wording, touch = phone wording; i === n means finished).
import { invCount, invBestTier } from "./inventory.js";
import { perkValue } from "../house/index.js";

const placed = (G, kind) => G.world.objects.some((o) => o.kind === kind);
const has = (G, id, n = 1) => invCount(G.inv, id) >= n;
const anyCooked = (G) => ["cooked_small_meat", "venison_steak", "cooked_mutton", "pork_roast", "grilled_fish", "bear_roast", "cooked_mushroom"].some((id) => has(G, id));

export const TUTORIAL = [
  { id: "wood", done: (G) => has(G, "wood") || G.stats.treesFelled > 0,
    text: "Chop a tree: walk up to a trunk and hold J (or hold the mouse on it).",
    touch: "Chop a tree: tap and hold a trunk, or hold HIT next to it." },
  { id: "wood6", done: (G) => has(G, "wood", 6) || has(G, "workbench") || placed(G, "workbench"),
    text: "Keep chopping until you have 6 wood.", touch: "Keep chopping until you have 6 wood." },
  { id: "bench", done: (G) => has(G, "workbench") || placed(G, "workbench"),
    text: "Press E to open your bag and craft a Workbench.", touch: "Tap BAG and craft a Workbench." },
  { id: "place", done: (G) => placed(G, "workbench"),
    text: "Select the Workbench in your hotbar (1-9) and press F to place it.",
    touch: "Tap the Workbench in your hotbar, then tap USE to place it." },
  { id: "pick", done: (G) => invBestTier(G.inv, "pickaxe") >= 1 || G.flags.tutPick,
    text: "Stand near the workbench, press E and craft Sticks, then a Wooden pickaxe.",
    touch: "Stand near the workbench, tap BAG and craft Sticks, then a Wooden pickaxe." },
  { id: "stone", done: (G) => has(G, "stone", 3) || invBestTier(G.inv, "pickaxe") >= 2,
    text: "Mine 3 stone: hold the pickaxe, then hold S + J to dig down (or click rock).",
    touch: "Mine 3 stone: select the pickaxe and tap-hold rock or the ground below you." },
  { id: "stonetools", done: (G) => invBestTier(G.inv, "pickaxe") >= 2 || invBestTier(G.inv, "axe") >= 2,
    text: "At the workbench, craft a Stone pickaxe or a Stone axe.", touch: "At the workbench, craft a Stone pickaxe or a Stone axe." },
  { id: "house", done: (G) => G.house.level >= 1,
    text: "Walk east to your house plot and press F there to build a Lean-to (12 wood, 6 fiber from tall grass).",
    touch: "Walk east to your house plot and tap USE there to build a Lean-to (12 wood, 6 fiber)." },
  { id: "weapon", done: (G) => invBestTier(G.inv, "sword") >= 1 || invBestTier(G.inv, "spear") >= 1 || invBestTier(G.inv, "bow") >= 1 || G.stats.hunted > 0,
    text: "Craft a sword or a spear at the workbench to hunt for food.", touch: "Craft a sword or a spear at the workbench to hunt for food." },
  { id: "hunt", done: (G) => G.stats.hunted > 0,
    text: "Hunt an animal: rabbits, pheasants and deer roam the meadow and the forest.",
    touch: "Hunt an animal: rabbits, pheasants and deer roam the meadow and the forest." },
  { id: "campfire", done: (G) => placed(G, "campfire") || perkValue(G, "stations", []).includes("campfire") || G.flags.tutCooked,
    text: "Craft a Campfire (4 wood, 3 stone) and place it with F.", touch: "Craft a Campfire (4 wood, 3 stone) and place it with USE." },
  { id: "cook", done: (G) => G.flags.tutCooked || anyCooked(G),
    text: "Near the campfire, select raw meat and press F to cook it. Then press F again to eat!",
    touch: "Near the campfire, select raw meat and tap USE to cook it. Tap USE again to eat!" },
  { id: "iron", done: (G) => has(G, "iron_ore") || has(G, "iron_ingot") || invBestTier(G.inv, "pickaxe") >= 3,
    text: "Dig deeper with a stone pickaxe and find iron ore (rusty orange rock).",
    touch: "Dig deeper with a stone pickaxe and find iron ore (rusty orange rock)." },
  { id: "furnace", done: (G) => has(G, "iron_ingot") || invBestTier(G.inv, "pickaxe") >= 3 || G.flags.tutSmelt,
    text: "Build a Furnace (12 stone, 4 clay), place it and smelt iron ore with coal.",
    touch: "Build a Furnace (12 stone, 4 clay), place it and smelt iron ore with coal." },
  { id: "grow", done: (G) => G.house.level >= 4,
    text: "Press H for your house: upgrade it to unlock stations, a chest, a bed and more.",
    touch: "Tap USE at your door to open the house and upgrade it for new perks." },
];

export const tutIndex = (G) => Math.max(0, Math.min(TUTORIAL.length, G.flags.tut | 0));
// the current goal or null (finished / hints off)
export function currentHint(G) {
  if (G.flags.tutOff) return null;
  const i = tutIndex(G);
  return i < TUTORIAL.length ? Object.assign({ i, n: TUTORIAL.length }, TUTORIAL[i]) : null;
}
// advance past every goal already met (call every ~30 steps). -> true when the goal changed
export function stepTutorial(G) {
  let i = tutIndex(G);
  const start = i;
  while (i < TUTORIAL.length && TUTORIAL[i].done(G)) i++;
  if (i === start) return false;
  G.flags.tut = i;
  const h = TUTORIAL[i];
  G.bus.emit("hint", h ? { i, n: TUTORIAL.length, id: h.id, text: h.text, touch: h.touch } : { i, n: TUTORIAL.length, id: "done", text: "", touch: "" });
  return true;
}
export function setHintsOff(G, off) { G.flags.tutOff = off ? 1 : 0; G.bus.emit("hint", { i: tutIndex(G), n: TUTORIAL.length, id: off ? "off" : "on", text: "", touch: "" }); }
