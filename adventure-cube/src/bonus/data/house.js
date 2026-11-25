// house.js - the 20 house levels (HOUSE owns; RENDER/AUDIO/tests read). DOM-free data.
// level = { lv, name, title (what the cube is called once this level is built), cost: {itemId: n},
//           hammer (minimum hammer tier carried in the inventory; 0 = none needed),
//           w, h (footprint tiles, centered in the 24-tile plot, standing on the plot ground),
//           perks: {...added at this level}, perkText (one line for the UI), art (what RENDER draws) }
// Perk keys (house/index.js folds them cumulatively: stations = union, maxHp/maxHunger = sum, others = latest):
//   home: respawn at the door        sleep: "night" | "any" (B_USE on the bed: skip to dawn / nap 3 h)
//   sleepHeal: 0..1 of max hp        stations: crafting stations usable within the house area
//   chest: house chest slots          maxHp / maxHunger: bonus to the caps
//   hungerMul: hunger drain factor near home      garden: plots that ripen each dawn (carrots + berries)
//   lamps: night hunters keep SPAWN.homeSafe tiles away      repair: repair tools at the house (house panel)
//   wearMul: tool durability loss factor           walls: hostile animals cannot enter the plot
//   banquet: food eaten near home restores x this   regenMul: hp regen factor near home   crown: the cube wears a crown
//
// PACING (HOUSE retune vs. the first BONUS.md table): sand (~80-110 tiles per world) and clay (~80-250 tiles) are
// scarce, so glass/brick/clay costs are small; the big late costs are stone, planks (renewable), iron, steel, gold
// and crystal. tools/bonustests/house.mjs checks every level against the generated world's real supply for
// several seeds (finite resources must stay under ~60% of the poorest world's supply, tools included).
export const HOUSE_LEVELS = [
  { lv: 1, name: "Lean-to", title: "Forager", cost: { wood: 12, fiber: 6 }, hammer: 0, w: 4, h: 3,
    perks: { home: true }, perkText: "A home: you wake up here after fainting.",
    art: "Two forked poles and a ridge branch leaning against a fallen mossy log; a roof of leafy branches and fern thatch; a bed of leaves underneath." },
  { lv: 2, name: "Hide tent", title: "Camper", cost: { wood: 10, hide: 3, rope: 2 }, hammer: 0, w: 5, h: 4,
    perks: { sleep: "night", sleepHeal: 0.3 }, perkText: "Bedroll: sleep through the night (heals a little).",
    art: "A-frame tent of stitched tan hides over pole frame, rope guy-lines pegged to the ground, flap door tied open, bedroll visible inside." },
  { lv: 3, name: "Camp", title: "Woodsfolk", cost: { wood: 20, stone: 15 }, hammer: 1, w: 7, h: 4,
    perks: { stations: ["campfire"] }, perkText: "Stone fire ring: cook at home.",
    art: "The tent plus a ring of fieldstones with a crackling fire (animated flame + glow at night), log benches and a drying rack." },
  { lv: 4, name: "Log hut", title: "Settler", cost: { wood: 50, stone: 10, rope: 4 }, hammer: 1, w: 7, h: 5,
    perks: { stations: ["workbench"], chest: 9 }, perkText: "Workbench and a 9-slot chest at home.",
    art: "A small square hut of stacked round logs with notched corners, sod-and-grass roof, plank door, workbench by the wall." },
  { lv: 5, name: "Log cabin", title: "Homesteader", cost: { wood: 80, plank: 30, stone: 30 }, hammer: 2, w: 9, h: 6,
    perks: { sleep: "night", sleepHeal: 1, maxHp: 10 }, perkText: "Real bed: sleeping heals fully. +10 max health.",
    art: "A proper cabin: peeled log walls, steep gable roof of wooden shingles, two small shuttered windows, stone doorstep." },
  { lv: 6, name: "Cabin with chimney", title: "Smokehouse keeper", cost: { plank: 60, stone: 50, clay: 8 }, hammer: 2, w: 11, h: 7,
    perks: { stations: ["smoker"], chest: 18 }, perkText: "Smokehouse: make jerky. Chest grows to 18.",
    art: "Fieldstone chimney with drifting smoke, covered front porch on posts, a small smokehouse shed with hanging meat strips." },
  { lv: 7, name: "Cabin and garden", title: "Gardener", cost: { plank: 40, fiber: 20, dirt: 20, berries: 5, apple: 3 }, hammer: 2, w: 13, h: 7,
    perks: { garden: 4 }, perkText: "Garden: 4 beds ripen carrots and berries every dawn.",
    art: "Fenced vegetable beds beside the cabin with carrot tops and berry shrubs (ripe = colorful), a water barrel, a little scarecrow." },
  { lv: 8, name: "Stone foundation", title: "Stonemason", cost: { stone: 120, plank: 40, clay: 8 }, hammer: 2, w: 13, h: 7,
    perks: { stations: ["furnace"] }, perkText: "Furnace at home: smelt ore and fire bricks.",
    art: "The cabin raised on a mortared fieldstone base with steps; a lean-to workshop holding a stone furnace with orange glow." },
  { lv: 9, name: "Stone cottage", title: "Cottager", cost: { stone: 160, brick: 12, plank: 60 }, hammer: 3, w: 14, h: 8,
    perks: { hungerMul: 0.75, chest: 27 }, perkText: "Warm hearth: hunger drains 25% slower near home. Chest 27.",
    art: "Whitewashed stone walls with dark timber framing, deep thatch roof, flower box under the window, warm hearth glow inside." },
  { lv: 10, name: "Glass-window cottage", title: "Lamplighter", cost: { stone: 100, brick: 12, glass: 8, iron_ingot: 12 }, hammer: 3, w: 14, h: 8,
    perks: { stations: ["anvil"], lamps: true }, perkText: "Anvil at home. Lamps keep wolves away at night.",
    art: "Leaded glass windows that glow golden at night, iron wall lanterns on both sides of a painted door, an anvil under an awning." },
  { lv: 11, name: "Upper floor frame", title: "Builder", cost: { plank: 150, stone: 80, iron_ingot: 20, rope: 10 }, hammer: 3, w: 15, h: 10,
    perks: { maxHp: 10, chest: 36 }, perkText: "+10 max health. Chest 36.",
    art: "Timber framing and scaffolding of a second storey rising over the cottage, ladders, a pulley with a bucket (construction look)." },
  { lv: 12, name: "Two-storey house", title: "Householder", cost: { plank: 120, stone: 120, brick: 12, glass: 6 }, hammer: 3, w: 15, h: 11,
    perks: { stations: ["kitchen"] }, perkText: "Kitchen: cook stews and pies.",
    art: "Finished two-storey brick-and-timber house, upstairs balcony door with railing, window boxes, tiled roof, kitchen chimney." },
  { lv: 13, name: "Workshop wing", title: "Craftmaster", cost: { plank: 100, iron_ingot: 30, rope: 20 }, hammer: 3, w: 18, h: 11,
    perks: { repair: true }, perkText: "Tool rack: repair tools at home.",
    art: "A side wing with big wooden doors, a tool rack of hanging axes and saws, a grindstone wheel, sawhorses with planks." },
  { lv: 14, name: "Watchtower", title: "Watchkeeper", cost: { stone: 300, plank: 60, iron_ingot: 25, fang: 4 }, hammer: 3, w: 20, h: 14,
    perks: { wearMul: 0.5 }, perkText: "Tools wear out half as fast.",
    art: "A round fieldstone watchtower attached to the house with a conical roof, arrow-slit windows, wolf-fang trophies at the door." },
  { lv: 15, name: "Manor", title: "Lord of the manor", cost: { plank: 200, glass: 8, gold_ingot: 15, steel_ingot: 10 }, hammer: 4, w: 20, h: 14,
    perks: { maxHp: 20, garden: 8 }, perkText: "+20 max health. Garden grows to 8 beds.",
    art: "A grand manor: symmetrical brick facade, tall glass windows with white trim, gold weather vane, a wider garden with hedges." },
  { lv: 16, name: "Courtyard walls", title: "Warden of the walls", cost: { stone: 400, steel_ingot: 20, bear_hide: 2 }, hammer: 4, w: 24, h: 14,
    perks: { walls: true, chest: 45 }, perkText: "Walls: no dangerous animals inside the plot. Chest 45.",
    art: "Crenellated stone walls around the whole plot with an arched gate, iron-studded doors, a bear-hide banner over the gate." },
  { lv: 17, name: "Great hall", title: "Host of the great hall", cost: { plank: 300, gold_ingot: 25, steel_ingot: 25 }, hammer: 4, w: 24, h: 16,
    perks: { banquet: 1.5 }, perkText: "Banquet: food eaten at home restores 50% more.",
    art: "A long hall with a high timber roof and huge arched windows; long table with candles visible through the windows; gold trim." },
  { lv: 18, name: "Castle keep", title: "Castellan", cost: { stone: 600, plank: 100, steel_ingot: 30 }, hammer: 4, w: 24, h: 18,
    perks: { chest: 54, sleep: "any" }, perkText: "Chest 54. Nap any time.",
    art: "A square stone keep rises from the center: battlements, banners on poles, a portcullis gate, torches on the walls at night." },
  { lv: 19, name: "Castle towers", title: "High castellan", cost: { gold_ingot: 35, steel_ingot: 35, crystal: 25, glass: 6 }, hammer: 4, w: 24, h: 20,
    perks: { regenMul: 2, stations: ["campfire", "workbench", "furnace", "anvil", "smoker", "kitchen"] }, perkText: "All stations at home. Health regenerates twice as fast here.",
    art: "Two slender corner towers with blue slate cones and gold finials, crystal lamps glowing cyan in the windows, long pennants." },
  { lv: 20, name: "Crystal citadel", title: "Cube Monarch", cost: { crystal: 50, gold_ingot: 50, steel_ingot: 45, glass: 8 }, hammer: 4, w: 24, h: 22,
    perks: { crown: true, maxHp: 25, maxHunger: 25 }, perkText: "Cube Monarch: a crown, +25 max health and +25 max hunger.",
    art: "The keep crowned by a tall crystal spire that refracts light (soft rainbow glints), gold-and-white banners, fireworks on completion." },
];
export const HOUSE_MAX = HOUSE_LEVELS.length;
export const houseLevel = (lv) => HOUSE_LEVELS[lv - 1] || null;
// the cube's title for a house level (0 = no house yet)
export const HOUSE_TITLE0 = "Wanderer";
export const houseTitle = (lv) => (lv >= 1 && HOUSE_LEVELS[lv - 1] ? HOUSE_LEVELS[lv - 1].title : HOUSE_TITLE0);
// milestone levels (bigger celebration: AUDIO plays a bigger fanfare for 5/10/15/20 per BONUS.md 10.3)
export const HOUSE_MILESTONES = [5, 10, 15, 20];
// short labels for every perk key (house panel chips)
export const PERK_LABEL = {
  home: "Respawn at home", sleep: "Bed", sleepHeal: "Sleep heals", stations: "Stations", chest: "Chest",
  maxHp: "Max health", maxHunger: "Max hunger", hungerMul: "Warm hearth", garden: "Garden", lamps: "Lamps",
  repair: "Tool repair", wearMul: "Sturdy tools", walls: "Walls", banquet: "Banquet", regenMul: "Fast healing", crown: "Crown",
};
