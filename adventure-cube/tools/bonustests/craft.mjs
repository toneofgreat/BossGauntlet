// craft.mjs - CRAFT's headless tests: inventory edge cases, recipe data + reachability from the world, station
// rules, crafting counts/overflow, cooking, hunger curve, regen/starvation, eating rules, tool wear + auto-swap,
// faint rules, chests, tutorial flow, save round trip. (CRAFT owns this file.)
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => pathToFileURL(path.join(here, "..", "..", "src", "bonus", p)).href;

const I = await import(src("craft/inventory.js"));
const CR = await import(src("craft/index.js"));
const TU = await import(src("craft/tutorial.js"));
const { ITEMS, ITEM_LIST, HAND } = await import(src("data/items.js"));
const { RECIPES, RECIPE, STATIONS, STATION_INFO, RECIPES_BY_STATION } = await import(src("data/recipes.js"));
const { TILE_DEFS, TREE_DEFS, OBJECT_DEFS } = await import(src("data/tiles.js"));
const { ANIMAL_DEFS } = await import(src("data/animals.js"));
const { HOUSE_LEVELS } = await import(src("data/house.js"));
const H = await import(src("house/index.js"));
const W = await import(src("world/index.js"));
const { makeSave, createGame, stepGame } = await import(src("core/game.js"));
const { hurtPlayer } = await import(src("core/player.js"));
const C = await import(src("core/const.js"));

const { createInv, invAdd, invCount, invRemove, invHasAll, invMissing, invTakeAll, invSelect, invSelected, invTool,
  invBestTier, invWear, invMove, invRoom, invSave, invLoad, invSplit, invQuickMove, invSort, invTakeSlot, invToolSlots, HOTBAR, INV_SLOTS } = I;

export default async function (t) {
  const { B, T } = t;
  const sel = (G, id) => { const i = G.inv.slots.findIndex((s) => s && s.id === id); if (i >= HOTBAR) I.invMove(G.inv, i, G.inv, 0); invSelect(G.inv, i >= HOTBAR ? 0 : i); return G.inv.sel; };
  // put a station object within reach of the player (searches outward for a legal cell)
  const placeNear = (G, kind) => {
    const p = G.player, px = Math.floor((p.x + p.w / 2) / T);
    for (let d = 1; d < 30; d++) for (const s of [1, -1]) {
      const x = px + s * d, y = W.surfaceAt(G, x) - 1;
      if (W.canPlace(G, kind, x, y) && W.place(G, kind, x, y)) return G.world.objects[G.world.objects.length - 1];
    }
    return null;
  };
  const away = (G) => t.standAt(G, G.world.spawn.x - 40);   // far from home, the plot and any station

  // ------------------------------------------------------------------ inventory
  t.test("inventory: add / stack / overflow / tools", () => {
    const inv = createInv();
    t.eq(inv.slots.length, INV_SLOTS, "36 slots");
    t.eq(invAdd(inv, "wood", 150), 0, "150 wood fits");
    t.eq(inv.slots[0].n, 99, "first stack full"); t.eq(inv.slots[1].n, 51, "second stack 51");
    t.eq(invAdd(inv, "nope", 3), 3, "unknown id is not added");
    const v = inv.ver; t.eq(invAdd(inv, "wood", 0), 0, "adding 0"); t.eq(invAdd(inv, "wood", -4), 0, "negative n ignored"); t.eq(invAdd(inv, "wood", NaN), 0, "NaN ignored");
    t.eq(inv.ver, v, "no-op adds do not bump ver");
    t.eq(invAdd(inv, "stone_axe", 2), 0, "two axes");
    const axes = inv.slots.filter((s) => s && s.id === "stone_axe");
    t.ok(axes.length === 2 && axes.every((s) => s.n === 1 && s.d === ITEMS.stone_axe.tool.dur), "tools never stack, full durability");
    invAdd(inv, "iron_pickaxe", 1, 9999); t.eq(inv.slots.find((s) => s && s.id === "iron_pickaxe").d, ITEMS.iron_pickaxe.tool.dur, "durability clamped to max");
    invAdd(inv, "wood_sword", 1, 7); t.eq(inv.slots.find((s) => s && s.id === "wood_sword").d, 7, "durability kept");
    const full = createInv(4); for (let i = 0; i < 4; i++) invAdd(full, "stone_axe", 1);
    t.eq(invAdd(full, "wood", 5), 5, "full inventory returns everything");
    t.eq(invRoom(full, "wood"), 0, "no room"); t.eq(invRoom(createInv(2), "wood"), 198, "room for 2 stacks"); t.eq(invRoom(inv, "nope"), 0, "no room for unknown ids");
    const part = createInv(2); invAdd(part, "stone", 98); invAdd(part, "dirt", 1);
    t.eq(invAdd(part, "stone", 5), 4, "partial fit returns the rest"); t.eq(part.slots[0].n, 99, "topped up");
  });

  t.test("inventory: remove / take / missing", () => {
    const inv = createInv();
    invAdd(inv, "wood", 10); inv.slots[20] = { id: "wood", n: 5 }; inv.ver++;
    t.eq(invCount(inv, "wood"), 15, "count across slots");
    t.eq(invRemove(inv, "wood", 7), 7, "removed 7");
    t.eq(inv.slots[20], null, "backpack stack emptied first"); t.eq(inv.slots[0].n, 8, "hotbar keeps the rest");
    t.eq(invRemove(inv, "wood", 50), 8, "removes only what exists"); t.eq(invRemove(inv, "wood", 1), 0, "nothing left");
    invAdd(inv, "stone", 3); invAdd(inv, "stick", 1);
    const cost = { stone: 3, stick: 2 };
    t.ok(!invHasAll(inv, cost), "missing sticks"); t.eq(JSON.stringify(invMissing(inv, cost)), '{"stick":1}', "missing map");
    t.ok(!invTakeAll(inv, cost), "atomic: refused"); t.eq(invCount(inv, "stone"), 3, "nothing taken");
    invAdd(inv, "stick", 1); t.ok(invTakeAll(inv, cost), "taken"); t.eq(invCount(inv, "stone") + invCount(inv, "stick"), 0, "all gone");
    t.ok(invHasAll(inv, {}), "empty cost");
  });

  t.test("inventory: select / tool / wear", () => {
    const inv = createInv();
    invSelect(inv, 12); t.eq(inv.sel, 3, "select wraps mod 9"); invSelect(inv, -1); t.eq(inv.sel, 8, "negative wraps");
    invSelect(inv, 0); t.eq(invTool(inv), HAND, "empty slot = hand");
    invAdd(inv, "berries", 3); t.eq(invTool(inv).type, "hand", "food swings as a hand");
    invAdd(inv, "stone_pickaxe", 1); invSelect(inv, 1);
    t.eq(invTool(inv).type, "pickaxe", "tool"); t.eq(invBestTier(inv, "pickaxe"), 2, "best tier"); t.eq(invBestTier(inv, "hammer"), 0, "none");
    invAdd(inv, "iron_pickaxe", 1); t.eq(invBestTier(inv, "pickaxe"), 3, "best tier anywhere");
    const s = inv.slots[1]; s.d = 2;
    t.ok(!invWear(inv, 1, 1) && s.d === 1, "wear 1"); t.ok(invWear(inv, 1, 1), "breaks at 0"); t.eq(inv.slots[1], null, "slot cleared");
    t.ok(!invWear(inv, 0, 1), "food does not wear"); t.ok(!invWear(inv, 30, 1), "empty slot");
    invAdd(inv, "wood_axe", 1); invAdd(inv, "steel_axe", 1, 50); invAdd(inv, "steel_axe", 1, 400);
    const order = invToolSlots(inv, "axe").map((i) => inv.slots[i].id + ":" + inv.slots[i].d);
    t.eq(order.join(","), "steel_axe:400,steel_axe:50,wood_axe:60", "spare tools: best tier, most durability first");
  });

  t.test("inventory: move / merge / swap / split / quick move / sort", () => {
    const a = createInv(), b = createInv(18);
    invAdd(a, "wood", 60); a.slots[5] = { id: "wood", n: 70 }; a.ver++;
    invMove(a, 5, a, 0); t.eq(a.slots[0].n, 99, "merge fills the target"); t.eq(a.slots[5].n, 31, "rest stays");
    invMove(a, 5, a, 0); t.eq(a.slots[0].n, 31, "full target: the stacks swap"); t.eq(a.slots[5].n, 99, "nothing lost"); invMove(a, 5, a, 0);
    const v = a.ver; invMove(a, 3, a, 3); invMove(a, 10, a, 11); t.eq(a.ver, v, "same slot / two empties = no-op");
    invMove(a, 5, b, 2); t.ok(!a.slots[5] && b.slots[2].n === 31, "move into another inventory (chest)");
    invAdd(a, "stone_axe", 1); const ax = a.slots.findIndex((s) => s && s.id === "stone_axe");
    invAdd(b, "stone_axe", 1, 9); invMove(b, b.slots.findIndex((s) => s && s.id === "stone_axe"), a, ax);
    t.ok(a.slots[ax].d === 9, "tools swap instead of merging");
    invMove(a, -1, a, 99); t.ok(true, "out of range is ignored");
    const c = createInv(); invAdd(c, "stone", 9);
    const j = invSplit(c, 0); t.ok(j >= HOTBAR && c.slots[0].n === 5 && c.slots[j].n === 4, "split half into the backpack");
    t.eq(invSplit(c, 30), -1, "split empty"); c.slots[0].n = 1; t.eq(invSplit(c, 0), -1, "split a single");
    // quick move hotbar -> backpack and back
    const q = createInv(); q.slots[0] = { id: "coal", n: 40 }; q.slots[12] = { id: "coal", n: 90 }; q.ver++;
    t.eq(invQuickMove(q, 0, q, HOTBAR, q.slots.length), 0, "all moved");
    t.ok(!q.slots[0] && q.slots[12].n === 99 && q.slots[9].n === 31, "merged then the first empty backpack slot");
    const tiny = createInv(2); tiny.slots[0] = { id: "dirt", n: 1 }; tiny.slots[1] = { id: "sand", n: 1 };
    const q2 = createInv(); q2.slots[3] = { id: "stone", n: 5 };
    t.eq(invQuickMove(q2, 3, tiny), 5, "no room: nothing moved"); t.eq(q2.slots[3].n, 5, "source kept");
    // sort keeps the hotbar, merges partial stacks, tools first
    const s = createInv(); s.slots[0] = { id: "apple", n: 2 };
    s.slots[20] = { id: "wood", n: 50 }; s.slots[30] = { id: "wood", n: 70 }; s.slots[11] = { id: "iron_axe", n: 1, d: 3 }; s.slots[14] = { id: "berries", n: 4 };
    invSort(s);
    t.eq(s.slots[0].id, "apple", "hotbar untouched");
    t.eq(s.slots[HOTBAR].id, "iron_axe", "tools first"); t.eq(s.slots[HOTBAR].d, 3, "durability kept");
    t.eq(invCount(s, "wood"), 120, "nothing lost"); t.eq(s.slots.filter((x) => x && x.id === "wood").length, 2, "merged into 2 stacks");
    const ts = invTakeSlot(s, HOTBAR); t.ok(ts && ts.id === "iron_axe" && ts.d === 3 && !s.slots[HOTBAR], "take a slot");
  });

  t.test("inventory: save/load round trip + corrupt data", () => {
    const a = createInv(); invAdd(a, "wood", 12); invAdd(a, "iron_sword", 1, 33); invSelect(a, 1);
    const b = invLoad(createInv(), JSON.parse(JSON.stringify(invSave(a))));
    t.eq(invCount(b, "wood"), 12, "wood"); t.eq(b.slots[1].d, 33, "durability"); t.eq(b.sel, 1, "selection");
    const c = invLoad(createInv(), { sel: 77, slots: [["ghost_item", 3], ["wood", 500], ["stone_axe", 1, -5], ["stone_axe", 1, "x"], 0, null, "junk", ["coal", 0]] });
    t.eq(c.slots[0], null, "unknown item dropped"); t.eq(c.slots[1].n, 99, "count clamped to the stack size");
    t.eq(c.slots[2].d, 1, "negative durability clamped"); t.eq(c.slots[3].d, ITEMS.stone_axe.tool.dur, "bad durability = full");
    t.eq(c.slots[6], null, "junk entries ignored"); t.eq(c.slots[7].n, 1, "zero count -> 1"); t.eq(c.sel, 8, "selection clamped");
    t.ok(invLoad(createInv(), null).slots.length === INV_SLOTS, "null save keeps an empty inventory");
  });

  // ------------------------------------------------------------------ data
  t.test("items + recipes data", () => {
    const ids = new Set(); for (const r of RECIPES) { t.ok(!ids.has(r.id), "unique recipe id " + r.id); ids.add(r.id); }
    for (const r of RECIPES) {
      t.ok(STATIONS.includes(r.station), "known station " + r.id);
      t.ok(r.out[1] >= 1 && Object.keys(r.cost).length > 0 && Object.values(r.cost).every((n) => n >= 1), "sane amounts " + r.id);
      t.ok(!(r.out[0] in r.cost), "no recipe eats its own output " + r.id);
    }
    for (const st of STATIONS) { t.ok(STATION_INFO[st] && STATION_INFO[st].name, "station info " + st); t.ok(RECIPES_BY_STATION[st].length > 0, "recipes at " + st); }
    for (const st of STATIONS) if (st !== "hand") t.ok(Object.values(OBJECT_DEFS).some((d) => d.station === st) || HOUSE_LEVELS.some((L) => L.perks.stations && L.perks.stations.includes(st)), "station obtainable: " + st);
    for (const it of ITEM_LIST) {
      t.ok(it.stack >= 1 && it.icon && it.icon.shape && it.name, "item fields " + it.id);
      if (it.tool) t.eq(it.stack, 1, "tools stack 1 " + it.id);
      if (it.food && it.food.cooks) { t.ok(ITEMS[it.food.cooks], "cooked item exists " + it.id); t.ok(RECIPE["cook_" + it.id] && RECIPE["cook_" + it.id].station === "campfire", "cook recipe " + it.id); }
      if (it.food && it.food.raw) t.ok(it.food.cooks, "raw food cooks " + it.id);
      if (it.place) t.ok(OBJECT_DEFS[it.place] || it.place === "sapling", "placeable object " + it.id);
      if (it.food && it.food.cooks) t.ok(ITEMS[it.food.cooks].food.hunger > it.food.hunger, "cooking improves " + it.id);
    }
    for (const type of ["axe", "pickaxe", "sword", "spear", "hammer"]) for (const tier of ["wood", "stone", "iron", "steel"]) t.ok(RECIPE[tier + "_" + type], "recipe " + tier + "_" + type);
    t.ok(ITEMS.steel_pickaxe.tool.power > ITEMS.iron_pickaxe.tool.power && ITEMS.iron_sword.tool.dmg > ITEMS.stone_sword.tool.dmg, "tiers get stronger");
  });

  t.test("every recipe + item is reachable from the world", () => {
    // raw sources: tile drops, trees, natural objects, animal drops, the house garden
    const have = new Set();
    for (const d of TILE_DEFS) { if (d.drop) have.add(d.drop[0]); if (d.alt) have.add(d.alt[0]); }
    for (const k in TREE_DEFS) { have.add("wood"); have.add("stick"); have.add("sapling"); if (TREE_DEFS[k].fruit) have.add(TREE_DEFS[k].fruit); }
    for (const k in OBJECT_DEFS) { const d = OBJECT_DEFS[k]; if (!d.natural) continue; if (d.drop) have.add(d.drop[0]); if (d.alt) have.add(d.alt[0]); if (d.harvest) have.add(d.harvest[0]); }
    for (const k in ANIMAL_DEFS) for (const d of ANIMAL_DEFS[k].drops) have.add(d[0]);
    have.add("carrot"); // garden (house perk)
    const stations = new Set(["hand"]);
    for (const L of HOUSE_LEVELS) if (L.perks.stations) for (const s of L.perks.stations) if (s === "smoker" || s === "kitchen") stations.add(s); // house perks (house tests prove every level is buildable)
    let grew = true, rounds = 0;
    while (grew && rounds++ < 50) {
      grew = false;
      for (const it of ITEM_LIST) if (it.place && OBJECT_DEFS[it.place] && OBJECT_DEFS[it.place].station && have.has(it.id) && !stations.has(OBJECT_DEFS[it.place].station)) { stations.add(OBJECT_DEFS[it.place].station); grew = true; }
      for (const r of RECIPES) if (stations.has(r.station) && Object.keys(r.cost).every((id) => have.has(id)) && !have.has(r.out[0])) { have.add(r.out[0]); grew = true; }
    }
    for (const r of RECIPES) t.ok(stations.has(r.station) && Object.keys(r.cost).every((id) => have.has(id)), "recipe reachable: " + r.id);
    for (const it of ITEM_LIST) t.ok(have.has(it.id), "item obtainable: " + it.id);
  });

  // ------------------------------------------------------------------ stations + crafting
  t.test("stations: range, house perks, locked recipes", () => {
    const G = t.game(); away(G);
    invAdd(G.inv, "wood", 40);
    t.ok(CR.stationsNear(G).has("hand") && CR.stationsNear(G).size === 1, "only hand far from everything");
    const fails = []; G.bus.on("craft:fail", (d) => fails.push(d.reason));
    t.eq(CR.craft(G, "plank"), 0, "planks need a workbench"); t.eq(fails[0], "station", "craft:fail station");
    const wb = placeNear(G, "workbench"); t.ok(wb, "workbench placed");
    t.ok(CR.stationsNear(G).has("workbench"), "workbench in range");
    t.eq(CR.craft(G, "plank", 3), 3, "3 plank crafts"); t.eq(invCount(G.inv, "plank"), 6, "6 planks");
    const list = CR.recipesFor(G), pk = list.find((x) => x.recipe.id === "plank");
    t.ok(pk.station && pk.have && pk.max === 37, "recipesFor flags + max " + pk.max);
    t.ok(!list.find((x) => x.recipe.id === "iron_ingot").station, "furnace not present");
    t.standAt(G, wb.x + 12); t.ok(!CR.stationsNear(G).has("workbench"), "out of range (> 4 tiles)");
    // house perk stations only at home
    const G2 = t.game(); H.setLevel(G2, 4);
    t.standAt(G2, G2.world.houseX + 12);
    const s = CR.stationsNear(G2); t.ok(s.has("campfire") && s.has("workbench"), "house stations at home");
    away(G2); t.ok(!CR.stationsNear(G2).has("campfire"), "not away from home");
    t.ok(CR.stationLevel("smoker") > 0 && CR.stationLevel("kitchen") > CR.stationLevel("smoker"), "smoker/kitchen come from house levels");
  });

  t.test("craft: counts, max, events, overflow drops", () => {
    const G = t.game(); away(G);
    const ev = []; G.bus.on("craft", (d) => ev.push(d));
    invAdd(G.inv, "wood", 10);
    t.eq(CR.craftMax(G, "stick"), 10, "max = 10"); t.eq(CR.craftMax(G, "nope"), 0, "unknown recipe");
    t.eq(CR.craft(G, "stick", 3), 3, "3 times"); t.eq(invCount(G.inv, "stick"), 12, "4 sticks each");
    t.eq(ev.length, 1, "one craft event per call"); t.eq(ev[0].n, 12, "event n = items made"); t.eq(ev[0].station, "hand", "station in event");
    t.eq(CR.craft(G, "stick", Infinity), 7, "Infinity = as many as possible"); t.eq(invCount(G.inv, "wood"), 0, "wood used up");
    t.eq(CR.craft(G, "stick"), 0, "nothing left"); t.eq(CR.craft(G, "nope"), 0, "unknown id");
    t.eq(G.stats.crafted, 10, "stats.crafted");
    // overflow: a full bag drops the result on the ground
    const G2 = t.game(); away(G2);
    for (let i = 0; i < INV_SLOTS; i++) G2.inv.slots[i] = { id: "dirt", n: 99 };
    G2.inv.slots[35] = { id: "fiber", n: 3 }; G2.inv.ver++;
    const d0 = G2.world.drops.length;
    t.eq(CR.craft(G2, "rope"), 1, "crafted with a full bag");
    t.ok(invCount(G2.inv, "rope") === 1 || G2.world.drops.length > d0, "rope in the freed slot or on the ground");
    for (let i = 0; i < INV_SLOTS; i++) G2.inv.slots[i] = { id: "dirt", n: 99 };
    G2.inv.slots[35] = { id: "wood", n: 2 }; G2.inv.ver++;
    t.eq(CR.craft(G2, "stick", 2), 2, "sticks with a full bag");
    t.ok(G2.world.drops.some((d) => d.item === "stick"), "overflow dropped");
  });

  t.test("cooking: campfire recipes, cook all, USE cooks raw food", () => {
    const G = t.game(); away(G);
    invAdd(G.inv, "raw_venison", 2); invAdd(G.inv, "raw_fish", 1); invAdd(G.inv, "mushroom", 2);
    t.eq(CR.cookAll(G), 0, "no campfire: nothing");
    const fire = placeNear(G, "campfire"); t.ok(fire, "campfire placed");
    G.player.facing = fire.x * T > G.player.x ? -1 : 1;   // face away: USE on the fire itself opens the panel
    t.eq(CR.cookAll(G), 5, "cooked everything");
    t.eq(invCount(G.inv, "venison_steak") + invCount(G.inv, "grilled_fish") + invCount(G.inv, "cooked_mushroom"), 5, "cooked items");
    t.eq(invCount(G.inv, "raw_venison"), 0, "raw used");
    invAdd(G.inv, "raw_pork", 1); sel(G, "raw_pork");
    G.player.hunger = 50;
    t.run(G, 1, B.USE); t.run(G, 1);
    t.eq(invCount(G.inv, "pork_roast"), 1, "USE with raw food at a campfire cooks it"); t.near(G.player.hunger, 50, 0.1, "not eaten");
    t.ok(G.flags.tutCooked, "tutorial flag");
  });

  // ------------------------------------------------------------------ hunger / health
  t.test("hunger curve: idle, running, swinging", () => {
    const G = t.game(); away(G); G.player.hunger = 100;
    t.run(G, 6000);
    t.near(G.player.hunger, 90, 0.6, "idle: ~10 per 100 s");
    const G2 = t.game(); away(G2); G2.player.hunger = 100;
    for (let i = 0; i < 3000; i++) stepGame(G2, (i >> 8) & 1 ? B.LEFT : B.RIGHT);
    t.ok(100 - G2.player.hunger > 5 * 1.2, "running drains faster: " + (100 - G2.player.hunger).toFixed(2));
    const G3 = t.game(); away(G3); G3.player.hunger = 100;
    t.run(G3, 600, B.ACTION);
    t.ok(100 - G3.player.hunger > 1 + 0.6, "swinging costs a little: " + (100 - G3.player.hunger).toFixed(2));
    t.ok(100 - G3.player.hunger < 4, "but not a lot");
    t.ok(CR.HUNGER.drain * 60 * 60 * 16 < 100 && CR.HUNGER.drain * 60 * 60 * 17.5 > 100, "full -> empty in ~16.7 min idle");
  });

  t.test("regen: fed heals, well fed heals faster, tummy ache blocks it", () => {
    const G = t.game(); away(G); const p = G.player;
    p.hp = 50; p.hunger = 70; t.run(G, 900);
    const fed = p.hp - 50;
    t.ok(fed >= 9 && fed <= 11, "fed: +1 hp / 1.5 s -> " + fed);
    const G2 = t.game(); away(G2); G2.player.hp = 50; G2.player.hunger = 100; t.run(G2, 900);
    t.ok(G2.player.hp - 50 > fed, "well fed regenerates faster: " + (G2.player.hp - 50));
    const G3 = t.game(); away(G3); G3.player.hp = 50; G3.player.hunger = 40; t.run(G3, 900);
    t.eq(G3.player.hp, 50, "no regen below 50 hunger");
    const G4 = t.game(); away(G4); G4.player.hp = 50; G4.player.hunger = 80;
    invAdd(G4.inv, "raw_small_meat", 1); sel(G4, "raw_small_meat");
    const toasts = []; G4.bus.on("toast", (d) => toasts.push(d.text));
    t.ok(CR.eat(G4, G4.inv.sel), "ate raw meat");
    t.ok(G4.craft.sickT > 0 && toasts.some((x) => /tummy/i.test(x)), "tummy ache + toast");
    t.eq(G4.player.hp, 50, "raw meat never damages");
    t.run(G4, 500); t.eq(G4.player.hp, 50, "no regen while sick");
    t.run(G4, 300); t.ok(G4.player.hp > 50, "regen again after it passes");
  });

  t.test("starvation: hurts slowly, faint keeps items + house, wakes fed", () => {
    const G = t.game(); away(G); H.setLevel(G, 2);
    invAdd(G.inv, "iron_pickaxe", 1); invAdd(G.inv, "gold_ingot", 7);
    const p = G.player; p.hunger = 0; p.hp = 10;
    const hurts = []; G.bus.on("player:hurt", (d) => hurts.push(d.cause));
    t.run(G, 151); t.eq(p.hp, 8, "-2 hp after 2.5 s"); t.eq(hurts[0], "hunger", "cause hunger");
    G.craft.sickT = 300;
    t.run(G, 150 * 4 + 5);
    t.ok(p.dead || p.faints > 0, "fainted from hunger");
    t.run(G, C.DEATH_STEPS + 5);
    t.ok(!p.dead && p.hunger >= 39.5 && p.hp >= p.maxHp * 0.6, "woke up fed and healed " + [p.hunger, p.hp]);
    t.eq(invCount(G.inv, "gold_ingot"), 7, "items kept"); t.eq(invCount(G.inv, "iron_pickaxe"), 1, "tools kept");
    t.eq(G.house.level, 2, "house kept"); t.eq(G.craft.sickT, 0, "tummy ache cleared");
    t.ok(Math.abs((p.x + p.w / 2) / T - H.footprint(G).doorX) < 2, "woke at home");
  });

  t.test("eating: full, medicine, banquet, events", () => {
    const G = t.game(); away(G); const p = G.player;
    invAdd(G.inv, "apple", 2); invAdd(G.inv, "bandage", 1);
    const ev = []; G.bus.on("player:eat", (d) => ev.push(d));
    p.hunger = p.maxHunger; p.hp = p.maxHp;
    t.ok(!CR.eat(G, 0), "full: refuses"); t.eq(invCount(G.inv, "apple"), 2, "not eaten");
    t.ok(!CR.eat(G, 1), "bandage when not hurt: refuses");
    p.hp = 40; t.ok(CR.eat(G, 1), "bandage while full of food"); t.eq(p.hp, 65, "+25 hp"); t.eq(invCount(G.inv, "bandage"), 0, "used");
    p.hunger = 50; t.ok(CR.eat(G, 0), "apple"); t.near(p.hunger, 58, 0.01, "+8 food"); t.eq(ev[ev.length - 1].id, "apple", "event id");
    t.ok(!CR.eat(G, 20), "empty slot"); invAdd(G.inv, "wood", 1); t.ok(!CR.eat(G, G.inv.slots.findIndex((s) => s && s.id === "wood")), "wood is not food");
    p.hunger = p.maxHunger - 2; p.hp = p.maxHp; t.ok(CR.eat(G, 0), "can top up the last points"); t.eq(p.hunger, p.maxHunger, "capped at max");
    // banquet perk at home
    const G2 = t.game(); H.setLevel(G2, 20); t.standAt(G2, G2.world.houseX + 2);
    const k = H.perkValue(G2, "banquet", 1); t.ok(k > 1, "banquet perk " + k);
    invAdd(G2.inv, "venison_steak", 1); G2.player.hunger = 20;
    t.ok(CR.eat(G2, G2.inv.slots.findIndex((s) => s && s.id === "venison_steak")), "ate at home");
    t.near(G2.player.hunger, 20 + 30 * k, 0.01, "food x banquet at home");
  });

  // ------------------------------------------------------------------ tools
  t.test("tool wear: breaks, auto-swaps to a spare, warns once", () => {
    const G = t.game(); away(G);
    invAdd(G.inv, "wood_pickaxe", 1); invAdd(G.inv, "stone_pickaxe", 1); sel(G, "wood_pickaxe");
    G.inv.slots.find((s) => s && s.id === "stone_pickaxe") && I.invQuickMove(G.inv, G.inv.slots.findIndex((s) => s && s.id === "stone_pickaxe"), G.inv, HOTBAR);
    const s = G.inv.slots[G.inv.sel]; s.d = 5;
    const toasts = [], broke = []; G.bus.on("toast", (d) => toasts.push(d.text)); G.bus.on("tool:break", (d) => broke.push(d.id));
    t.run(G, 2);
    t.ok(toasts.filter((x) => /worn out/.test(x)).length === 1, "warned once: " + toasts.join("|"));
    t.run(G, 30); t.ok(toasts.filter((x) => /worn out/.test(x)).length === 1, "not repeated");
    let n = 0; while (!broke.length && n++ < 2000) stepGame(G, B.ACTION | B.DOWN);
    t.eq(broke[0], "wood_pickaxe", "wooden pickaxe broke");
    const now = invSelected(G.inv);
    t.ok(now && now.id === "stone_pickaxe", "spare moved into the hand: " + (now && now.id));
    t.ok(toasts.some((x) => /Switched/.test(x)), "told the player");
  });

  // ------------------------------------------------------------------ chests
  t.test("chests: house chest + world chest moves", () => {
    const G = t.game(); H.setLevel(G, 4);
    const ch = G.house.chest; t.ok(ch && ch.slots.length >= 9, "house chest");
    invAdd(G.inv, "stone", 150); invAdd(G.inv, "iron_axe", 1, 12);
    const i = G.inv.slots.findIndex((s) => s && s.id === "stone");
    invMove(G.inv, i, ch, 0); t.eq(ch.slots[0].n, 99, "stack into the chest");
    t.eq(invQuickMove(G.inv, G.inv.slots.findIndex((s) => s && s.id === "stone"), ch), 0, "quick move the rest");
    t.eq(invCount(ch, "stone"), 150, "chest has 150"); t.eq(invCount(G.inv, "stone"), 0, "bag has none");
    invQuickMove(G.inv, G.inv.slots.findIndex((s) => s && s.id === "iron_axe"), ch);
    t.eq(ch.slots.find((s) => s && s.id === "iron_axe").d, 12, "tool durability survives the chest");
    const sv = makeSave(G), G2 = createGame({ save: JSON.parse(JSON.stringify(sv)), headless: true });
    t.eq(invCount(G2.house.chest, "stone"), 150, "house chest saved");
    // a placed world chest opens the chest panel and stores items
    const G3 = t.game(); away(G3);
    const box = placeNear(G3, "chest"); t.ok(box && box.inv, "world chest has an inventory");
    const opened = []; G3.bus.on("ui:open", (d) => opened.push(d.panel));
    t.ok(W.useObject(G3, box) && opened[0] === "chest", "USE opens the chest panel");
    invAdd(G3.inv, "coal", 20); invQuickMove(G3.inv, 0, box.inv);
    const G4 = createGame({ save: JSON.parse(JSON.stringify(makeSave(G3))), headless: true });
    const box4 = G4.world.objects.find((o) => o.id === box.id);
    t.ok(box4 && invCount(box4.inv, "coal") === 20, "world chest contents saved");
  });

  t.test("drop from the bag: not picked straight back up", () => {
    const G = t.game(); away(G);
    invAdd(G.inv, "flint", 3);
    t.eq(CR.dropSlot(G, 0, 1), 1, "dropped one"); t.eq(invCount(G.inv, "flint"), 2, "two left");
    t.ok(G.world.drops.some((d) => d.item === "flint"), "on the ground");
    t.run(G, 10); t.eq(invCount(G.inv, "flint"), 2, "not instantly re-picked");
    t.eq(CR.dropSlot(G, 30, 1), 0, "empty slot");
  });

  // ------------------------------------------------------------------ tutorial
  t.test("tutorial: goals advance in order, skip met goals, can be hidden", () => {
    const G = t.game(); away(G);
    const hints = []; G.bus.on("hint", (d) => hints.push(d.id));
    t.eq(TU.currentHint(G).id, "wood", "first goal: wood");
    t.run(G, 31); t.eq(hints.length, 0, "no change without progress");
    invAdd(G.inv, "wood", 2); t.run(G, 30);
    t.eq(TU.currentHint(G).id, "wood6", "then 6 wood");
    invAdd(G.inv, "wood", 10); t.run(G, 30);
    t.eq(TU.currentHint(G).id, "bench", "then craft a bench");
    CR.craft(G, "workbench"); t.run(G, 30);
    t.eq(TU.currentHint(G).id, "place", "then place it");
    placeNear(G, "workbench"); W.give(G, "workbench", 0); G.inv.ver++;
    invRemove(G.inv, "workbench", 9); t.run(G, 30);
    t.eq(TU.currentHint(G).id, "pick", "then a wooden pickaxe");
    CR.craft(G, "stick"); CR.craft(G, "wood_pickaxe"); t.run(G, 30);
    t.eq(TU.currentHint(G).id, "stone", "then stone");
    invAdd(G.inv, "stone_pickaxe", 1); t.run(G, 30);
    t.eq(TU.currentHint(G).id, "house", "stone + stone tools skipped at once (stone pickaxe in hand)");
    t.ok(hints.includes("stone") && hints[hints.length - 1] === "house", "hint events " + hints.join(","));
    H.setLevel(G, 1); invAdd(G.inv, "iron_ingot", 1); t.run(G, 30);
    t.eq(TU.currentHint(G).id, "weapon", "house done -> weapon");
    const flags = JSON.parse(JSON.stringify(makeSave(G).flags));
    t.eq(flags.tut, TU.TUTORIAL.findIndex((x) => x.id === "weapon"), "progress saved in flags");
    TU.setHintsOff(G, true); t.eq(TU.currentHint(G), null, "hidden");
    TU.setHintsOff(G, false); t.eq(TU.currentHint(G).id, "weapon", "back on");
    G.stats.hunted = 1; invAdd(G.inv, "pork_roast", 1); G.flags.tutCooked = 1; H.setLevel(G, 5); t.run(G, 30);
    t.eq(TU.currentHint(G), null, "all done"); t.eq(hints[hints.length - 1], "done", "done event");
  });

  t.test("craft state save/load (old + partial data)", () => {
    const G = t.game(); away(G); G.craft.sickT = 321; G.craft.starveT = 17;
    const G2 = createGame({ save: JSON.parse(JSON.stringify(makeSave(G))), headless: true });
    t.eq(G2.craft.sickT, 321, "tummy ache saved"); t.eq(G2.craft.starveT, 17, "starve timer saved");
    const s = JSON.parse(JSON.stringify(makeSave(G))); delete s.craft;
    const G3 = createGame({ save: s, headless: true }); t.eq(G3.craft.sickT, 0, "missing craft data -> defaults");
    s.craft = { sickT: "999999" }; const G4 = createGame({ save: s, headless: true }); t.eq(G4.craft.sickT, CR.HUNGER.rawSick, "clamped");
    s.craft = 42; const G5 = createGame({ save: s, headless: true }); t.eq(G5.craft.regenT, 0, "garbage ignored");
  });
}
