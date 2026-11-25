// house.mjs - HOUSE's headless tests (BONUS.md 12): the 20 levels' data, every level reachable with the world's
// real resources and tools (static budget for several seeds + a tech-tree closure + a full simulated playthrough
// through the real recipes and upgrade()), every perk actually working, sleep, garden, repair, walls/lamps, the
// interact spots, events and save/load.
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => pathToFileURL(path.join(here, "..", "..", "src", "bonus", p)).href;

const C = await import(src("core/const.js"));
const H = await import(src("house/index.js"));
const W = await import(src("world/index.js"));
const CR = await import(src("craft/index.js"));
const { HOUSE_LEVELS, HOUSE_MAX, houseTitle, PERK_LABEL } = await import(src("data/house.js"));
const { ITEMS, TIERS } = await import(src("data/items.js"));
const { RECIPES, RECIPE } = await import(src("data/recipes.js"));
const { TILE_DEFS, OBJECT_DEFS, TREE_DEFS } = await import(src("data/tiles.js"));
const { ANIMAL_DEFS, SPAWN } = await import(src("data/animals.js"));
const { generateWorld } = await import(src("world/gen.js"));
const { invAdd, invCount, invSelect, createInv } = await import(src("craft/inventory.js"));
const { setDayF, phase } = await import(src("core/time.js"));
const { makeSave, createGame } = await import(src("core/game.js"));
const { spawnAnimal } = await import(src("creatures/index.js"));
const T = C.T;

const SEEDS = [1234, 1, 7, 99, 2024, 555555];
const RAW = new Set(["wood", "fiber", "stone", "clay", "sand", "coal", "iron_ore", "gold_ore", "crystal", "dirt", "gravel", "flint",
  "hide", "fang", "bear_hide", "feather", "berries", "apple", "mushroom", "carrot", "raw_venison", "raw_mutton", "raw_pork", "raw_fish", "raw_small_meat", "big_meat", "sapling"]);
const FINITE = ["stone", "clay", "sand", "coal", "iron_ore", "gold_ore", "crystal"];
const MAX_SHARE = 0.6; // finite demand must stay under this share of the poorest world's supply
const recipeFor = (id) => RECIPE[id] && RECIPE[id].out[0] === id ? RECIPE[id] : RECIPES.find((r) => r.out[0] === id);
// expand { item: n } into raw materials through the recipes
function expand(cost, out = {}) {
  for (const id in cost) {
    const n = cost[id];
    if (RAW.has(id)) { out[id] = (out[id] || 0) + n; continue; }
    const r = recipeFor(id);
    if (!r) throw new Error("no recipe for " + id);
    const times = Math.ceil(n / r.out[1]);
    const sub = {}; for (const c in r.cost) sub[c] = r.cost[c] * times;
    expand(sub, out);
  }
  return out;
}
const addTo = (a, b, k = 1) => { for (const id in b) a[id] = (a[id] || 0) + b[id] * k; return a; };
function supplyOf(world) {
  const c = {}, p = world.protect;
  for (let y = 0; y < world.H; y++) for (let x = 0; x < world.W; x++) {
    if (p && x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) continue;
    const id = TILE_DEFS[world.tiles[y * world.W + x]].id; c[id] = (c[id] || 0) + 1;
  }
  const boulders = world.objects.filter((o) => o.kind === "boulder").length;
  return {
    stone: (c.stone || 0) + (c.mossy || 0) + (c.cobble || 0) + boulders * 3, coal: (c.coal_ore || 0) * 2, iron_ore: c.iron_ore || 0,
    gold_ore: c.gold_ore || 0, crystal: c.crystal || 0, clay: (c.clay || 0) * 2, sand: c.sand || 0, dirt: (c.dirt || 0) + (c.grass || 0),
    _tiles: c,
  };
}
// the whole house's raw demand incl. hammers, stations and the pickaxes worn out digging the finite resources
function houseDemand() {
  const goods = {};
  for (const L of HOUSE_LEVELS) addTo(goods, L.cost);
  for (let t = 1; t <= 4; t++) goods[TIERS[t] + "_hammer"] = 1;
  goods.workbench = 1; goods.furnace = 1; goods.anvil = 1; goods.campfire = 1;
  let raw = expand(goods);
  // pickaxes: swings per tile = ceil(hp / power) with the cheapest pick tier that can mine it; repeat twice so the
  // picks' own materials (stone, iron, steel) are dug too
  const PICK = { stone: 2, coal: 2, iron_ore: 2, gold_ore: 3, crystal: 4 };
  const TILEOF = { stone: "stone", coal: "coal_ore", iron_ore: "iron_ore", gold_ore: "gold_ore", crystal: "crystal" };
  for (let k = 0; k < 2; k++) {
    const picks = {};
    for (const id in PICK) {
      const tiles = (raw[id] || 0) / (id === "coal" ? 2 : 1), tier = PICK[id], tool = ITEMS[TIERS[tier] + "_pickaxe"].tool;
      const hp = TILE_DEFS.find((d) => d.id === TILEOF[id]).hp, swings = tiles * Math.ceil(hp / tool.power);
      picks[TIERS[tier] + "_pickaxe"] = (picks[TIERS[tier] + "_pickaxe"] || 0) + Math.ceil(swings / tool.dur);
    }
    raw = expand(addTo(Object.assign({}, goods), picks));
    raw._picks = picks;
  }
  return raw;
}

export default async function (t) {
  t.test("house data: 20 levels, sane footprints, perks, costs, titles", () => {
    t.eq(HOUSE_LEVELS.length, 20, "20 levels"); t.eq(HOUSE_MAX, 20, "HOUSE_MAX");
    let lastW = 0, lastH = 0, lastHammer = 0;
    const known = new Set(Object.keys(PERK_LABEL));
    for (const L of HOUSE_LEVELS) {
      t.ok(L.lv === HOUSE_LEVELS.indexOf(L) + 1, "lv index " + L.lv);
      t.ok(L.w >= lastW && L.h >= lastH && L.w <= C.PLOT_W && L.h <= 24, `footprint grows and fits: lv ${L.lv} ${L.w}x${L.h}`);
      t.ok(L.hammer >= lastHammer && L.hammer <= 4, "hammer tier never drops: lv " + L.lv);
      for (const id in L.cost) t.ok(ITEMS[id] && L.cost[id] > 0, `lv ${L.lv} cost ${id}`);
      for (const k in L.perks) t.ok(known.has(k), `lv ${L.lv} perk key ${k}`);
      t.ok(L.name && L.title && L.perkText && L.art && L.art.length > 40, "texts lv " + L.lv);
      lastW = L.w; lastH = L.h; lastHammer = L.hammer;
    }
    t.eq(houseTitle(0), "Wanderer", "title 0"); t.eq(houseTitle(20), "Cube Monarch", "title 20");
    for (let lv = 0; lv <= 20; lv++) { const P = H.perksAt(lv); t.ok(P.stations.every((s) => RECIPES.some((r) => r.station === s)), "station perks are real stations " + lv); }
    t.eq(H.perksAt(19).stations.length, 6, "all 6 stations at 19");
  });

  t.test("budget: the whole house fits in every world's supply (tools included)", () => {
    const need = houseDemand();
    const worst = {};
    for (const seed of SEEDS) {
      const w = generateWorld(seed), sup = supplyOf(w);
      for (const id of FINITE) {
        const share = (need[id] || 0) / Math.max(1, sup[id]);
        worst[id] = Math.max(worst[id] || 0, share);
        t.ok(share <= MAX_SHARE, `seed ${seed}: ${id} need ${need[id] || 0} of ${sup[id]} (${(share * 100).toFixed(0)}%)`);
      }
      t.ok(w.trees.length >= 60, `seed ${seed}: ${w.trees.length} trees (wood regrows)`);
      t.ok(w.objects.some((o) => o.kind === "tallgrass") || (sup._tiles.grass || 0) > 200, `seed ${seed}: fiber source`);
      t.ok(w.objects.some((o) => o.kind === "bush"), `seed ${seed}: berry bushes`);
      t.ok(w.trees.some((tr) => tr.kind === "oak" || tr.kind === "ancient"), `seed ${seed}: apple trees`);
      const biomes = new Set(w.segments.map((s) => s[0]));
      for (const id of ["hide", "fang", "bear_hide", "feather"]) {
        t.ok(Object.values(ANIMAL_DEFS).some((a) => a.drops.some((d) => d[0] === id) && a.biomes.some((b) => biomes.has(b))), `seed ${seed}: animals that drop ${id} live here`);
      }
    }
    console.log("     house demand:", FINITE.map((id) => `${id} ${need[id] || 0} (worst ${(worst[id] * 100).toFixed(0)}%)`).join(", "), "| picks", JSON.stringify(need._picks));
  });

  t.test("tech tree: every level's materials + hammer are obtainable with the tools before it", () => {
    // fixpoint over what can be gathered/crafted, given the stations the house provides so far
    function closure(houseLv) {
      const got = new Set(["wood", "stick", "fiber", "dirt", "sand", "clay", "gravel", "flint", "berries", "apple", "mushroom", "hide", "feather", "raw_small_meat", "raw_venison", "sapling", "raw_fish"]);
      const st = new Set(["hand", ...H.perksAt(houseLv).stations]);
      let changed = true;
      while (changed) {
        changed = false;
        const add = (id) => { if (!got.has(id)) { got.add(id); changed = true; } };
        let pick = 0, weapon = 0;
        for (let k = 1; k <= 4; k++) { if (got.has(TIERS[k] + "_pickaxe")) pick = k; if (got.has(TIERS[k] + "_sword") || got.has(TIERS[k] + "_spear")) weapon = Math.max(weapon, k); }
        for (const d of TILE_DEFS) if (d.drop && d.tier <= pick) { add(d.drop[0]); if (d.alt) add(d.alt[0]); }
        for (const k of ["workbench", "campfire", "furnace", "anvil"]) if (got.has(k)) st.add(k);
        if (weapon >= 1) for (const a of Object.values(ANIMAL_DEFS)) for (const d of a.drops) add(d[0]);
        for (const r of RECIPES) if (st.has(r.station) && Object.keys(r.cost).every((id) => got.has(id))) add(r.out[0]);
      }
      return got;
    }
    for (const L of HOUSE_LEVELS) {
      const got = closure(L.lv - 1);
      for (const id in L.cost) t.ok(got.has(id), `lv ${L.lv} ${L.name}: ${id} obtainable`);
      if (L.hammer) t.ok(got.has(TIERS[L.hammer] + "_hammer"), `lv ${L.lv}: ${TIERS[L.hammer]} hammer craftable`);
    }
  });

  t.test("playthrough: build all 20 levels through the real recipes, within the world's supply", () => {
    const G = t.game(1234), w = G.world, sup = supplyOf(w);
    const P = w.houseX - 2;
    t.standAt(G, P, w.houseY - 1);
    // stations next to the plot (the house perks take over later)
    for (const kind of ["workbench", "furnace", "anvil", "campfire"]) {
      let ok = false;
      for (const dx of [-1, 1, -2, 2, -3, 3, -4, 4, -5, -6]) { const x = P + dx, y = W.surfaceAt(G, x) - 1; if (W.canPlace(G, kind, x, y) && W.place(G, kind, x, y)) { ok = true; break; } }
      t.ok(ok, "placed a " + kind);
    }
    const sn = CR.stationsNear(G);
    t.ok(["workbench", "furnace", "anvil", "campfire"].every((s) => sn.has(s)), "stations in reach: " + [...sn].join(","));
    const ledger = {};
    const stash = (id, n) => { let left = invAdd(G.inv, id, n); if (left && G.house.chest) left = invAdd(G.house.chest, id, left); return left; };
    function gather(id, n) {
      if (n <= 0) return;
      if (RAW.has(id)) { ledger[id] = (ledger[id] || 0) + n; t.ok(stash(id, n) === 0, "room for " + n + " " + id); return; }
      const r = recipeFor(id), times = Math.ceil(n / r.out[1]);
      for (const c in r.cost) gather(c, r.cost[c] * times);
      const made = CR.craft(G, r.id, times);
      if (made !== times) t.ok(false, `crafted ${made}/${times} ${r.id}`);
    }
    const order = [];
    G.bus.on("house:upgrade", (d) => order.push(d.level));
    let complete = 0; G.bus.on("house:complete", () => complete++);
    for (let lv = 1; lv <= HOUSE_MAX; lv++) {
      for (let k = 0; k < 4 && !H.canUpgrade(G).ok; k++) {
        const c = H.canUpgrade(G);
        if (!c.hasHammer) gather(TIERS[c.hammer] + "_hammer", 1);
        const miss = c.missing;
        // crafted goods first (they might consume raw stock otherwise), then raw
        const ids = Object.keys(miss).sort((a, b) => RAW.has(a) - RAW.has(b));
        for (const id of ids) gather(id, H.canUpgrade(G).missing[id] || 0);
      }
      const hpBefore = G.player.maxHp;
      t.ok(H.upgrade(G), `built level ${lv} ${HOUSE_LEVELS[lv - 1].name}`);
      if (HOUSE_LEVELS[lv - 1].perks.maxHp) t.eq(G.player.maxHp, hpBefore + HOUSE_LEVELS[lv - 1].perks.maxHp, "max hp grows at " + lv);
      // stash leftovers in the chest so the bag never overflows
      if (G.house.chest) for (let i = C.HOTBAR || 9; i < G.inv.slots.length; i++) { const s = G.inv.slots[i]; if (s && !ITEMS[s.id].tool && invAdd(G.house.chest, s.id, s.n) === 0) { G.inv.slots[i] = null; G.inv.ver++; } }
    }
    t.eq(G.house.level, 20, "level 20 reached");
    t.eq(order.join(","), Array.from({ length: 20 }, (_, i) => i + 1).join(","), "upgrade events in order");
    t.eq(complete, 1, "house:complete once");
    t.ok(G.flags.houseDone > 0, "completion day recorded");
    for (const id of FINITE) t.ok((ledger[id] || 0) <= sup[id], `ledger ${id} ${ledger[id] || 0} <= supply ${sup[id]}`);
    t.ok(H.hasPerk(G, "crown") && G.player.maxHp === 165 && G.player.maxHunger === 125, "monarch perks");
    console.log("     playthrough raw ledger:", JSON.stringify(ledger));
  });

  t.test("upgrade rules: chest pays too, hammer wears but never breaks, house:ready hint", () => {
    const G = t.game(); t.run(G, 20);
    const ready = []; G.bus.on("house:ready", (d) => ready.push(d.level));
    invAdd(G.inv, "wood", 12); invAdd(G.inv, "fiber", 6);
    t.run(G, 61);
    t.eq(ready.join(","), "1", "house:ready once for level 1");
    t.run(G, 61); t.eq(ready.length, 1, "not repeated");
    t.ok(H.upgrade(G), "lean-to"); t.eq(houseTitle(G.house.level), "Forager", "title");
    H.setLevel(G, 4);
    t.ok(G.house.chest && G.house.chest.slots.length === 9, "chest 9");
    invAdd(G.house.chest, "wood", 50); invAdd(G.house.chest, "plank", 30); invAdd(G.inv, "wood", 30); invAdd(G.inv, "stone", 30);
    invAdd(G.inv, "stone_hammer", 1);
    const hs = G.inv.slots.find((s) => s && s.id === "stone_hammer"); hs.d = 3;
    t.ok(H.canUpgrade(G).ok, "can pay with inventory + chest");
    t.ok(H.upgrade(G), "log cabin from the chest");
    t.eq(invCount(G.inv, "wood") + invCount(G.house.chest, "wood"), 0, "all 80 wood used (inventory first)");
    t.eq(invCount(G.house.chest, "plank"), 0, "planks from the chest");
    t.ok(G.inv.slots.some((s) => s && s.id === "stone_hammer" && s.d === 1), "hammer worn to 1, not broken");
    H.setLevel(G, 5);
    invAdd(G.inv, "wood_hammer", 1);
    const before = G.inv.slots.find((s) => s && s.id === "wood_hammer").d;
    H.setLevel(G, 3); invAdd(G.inv, "wood", 50); invAdd(G.inv, "stone", 10); invAdd(G.inv, "rope", 4);
    t.ok(H.upgrade(G), "log hut");
    t.ok(G.inv.slots.find((s) => s && s.id === "wood_hammer").d < before, "the lowest good-enough hammer does the work");
  });

  t.test("perks: chest grows and keeps items, stations only at home", () => {
    const G = t.game(); t.run(G, 20);
    H.setLevel(G, 4); G.house.chest.slots[8] = { id: "gold_ingot", n: 7 };
    H.setLevel(G, 6); t.eq(G.house.chest.slots.length, 18, "chest 18"); t.eq(G.house.chest.slots[8].n, 7, "items kept");
    H.setLevel(G, 18); t.eq(G.house.chest.slots.length, 54, "chest 54");
    H.setLevel(G, 12);
    t.standAt(G, H.footprint(G).doorX, G.world.houseY - 1);
    const st = CR.stationsNear(G);
    for (const s of ["campfire", "workbench", "smoker", "furnace", "anvil", "kitchen"]) t.ok(st.has(s), "home station " + s);
    t.ok(CR.recipesFor(G).find((r) => r.recipe.id === "berry_pie").station, "kitchen recipe available at home");
    t.standAt(G, G.world.spawn.x - 60);
    t.ok(!CR.stationsNear(G).has("kitchen"), "no kitchen away from home");
  });

  t.test("perks: hearth (hunger), banquet, regen x2, sturdy tools", () => {
    const drain = (lv) => {
      const G = t.game(); H.setLevel(G, lv); t.standAt(G, H.footprint(G).doorX, G.world.houseY - 1);
      G.player.hunger = 80; t.run(G, 3000); return 80 - G.player.hunger;
    };
    const d8 = drain(8), d9 = drain(9);
    t.ok(d9 < d8 * 0.85 && d9 > d8 * 0.6, `hunger drains slower at home with the hearth (${d8.toFixed(2)} -> ${d9.toFixed(2)})`);
    const eatAt = (lv) => {
      const G = t.game(); H.setLevel(G, lv); t.standAt(G, H.footprint(G).doorX, G.world.houseY - 1);
      G.player.hunger = 20; invAdd(G.inv, "apple", 1); invSelect(G.inv, G.inv.slots.findIndex((s) => s && s.id === "apple"));
      CR.eat(G, G.inv.sel); return G.player.hunger - 20;
    };
    t.near(eatAt(16), 8, 0.01, "apple +8"); t.near(eatAt(17), 12, 0.01, "banquet apple +12");
    const regen = (lv) => {
      const G = t.game(); H.setLevel(G, lv); t.standAt(G, H.footprint(G).doorX, G.world.houseY - 1);
      G.player.hp = 50; G.player.hunger = 100; t.run(G, 1800); return G.player.hp - 50;
    };
    const r18 = regen(18), r19 = regen(19);
    t.ok(r19 >= r18 * 1.8, `regen doubles at home (${r18} -> ${r19})`);
    const wearOf = (lv) => {
      const G = t.game(); H.setLevel(G, lv);
      const x = G.world.spawn.x - 40; t.standAt(G, x);
      invAdd(G.inv, "stone_pickaxe", 1); invSelect(G.inv, G.inv.slots.findIndex((s) => s && s.id === "stone_pickaxe"));
      const s = G.inv.slots[G.inv.sel], d0 = s.d;
      t.run(G, 22 * 12, t.B.ACTION | t.B.DOWN);
      return d0 - (G.inv.slots[G.inv.sel] ? G.inv.slots[G.inv.sel].d : 0);
    };
    const w0 = wearOf(0), w14 = wearOf(14);
    t.ok(w0 >= 8 && Math.abs(w14 - w0 / 2) <= 1, `tools wear half as fast (${w0} -> ${w14})`);
  });

  t.test("sleep: night only, heals by level, costs a little hunger, naps at 18, refuses with a wolf near", () => {
    const G = t.game(); t.run(G, 20);
    t.ok(!H.canSleep(G).ok && /tent/.test(H.canSleep(G).reason), "no bed at level 1");
    H.setLevel(G, 2);
    t.ok(!H.canSleep(G).ok && !H.sleep(G), "not during the day");
    setDayF(G, 0.8); G.player.hp = 40; G.player.hunger = 60;
    const ev = []; G.bus.on("sleep", (d) => ev.push(d.start));
    t.ok(H.canSleep(G).ok && H.sleep(G), "slept at night");
    t.eq(phase(G), "dawn", "woke at dawn"); t.eq(G.player.hp, 70, "30% heal"); t.eq(G.player.hunger, 50, "hunger -10");
    t.eq(ev.join(","), "true,false", "sleep events");
    H.setLevel(G, 5); setDayF(G, 0.75); G.player.hp = 10; G.player.hunger = 20;
    t.ok(H.sleep(G) && G.player.hp === G.player.maxHp, "full heal in a real bed");
    t.eq(G.player.hunger, 20, "hunger never drops below 25 by sleeping (already lower: kept)");
    H.setLevel(G, 18); setDayF(G, 0.3); const t0 = G.time.t;
    t.ok(H.canSleep(G).ok && H.sleep(G), "nap at noon");
    t.eq(G.time.t - t0, H.NAP_STEPS, "nap = 3 game hours");
    setDayF(G, 0.8);
    const p = G.player, a = spawnAnimal(G, "wolf", Math.floor((p.x + p.w / 2) / T) + 3, Math.floor((p.y + p.h - 1) / T));
    a.state = "chase"; a.aggroT = 100;
    const cs = H.canSleep(G); t.ok(!cs.ok && /wolf/i.test(cs.reason), "refuses with a hunting wolf: " + cs.reason);
    G.animals.length = 0; t.ok(H.canSleep(G).ok, "fine once it's gone");
    t.ok(G.house.slept >= 3, "nights counted");
  });

  t.test("garden: ripe on build, every dawn, harvest by USE in the beds, 8 beds at 15", () => {
    const G = t.game(); t.run(G, 20);
    H.setLevel(G, 6);
    invAdd(G.inv, "plank", 40); invAdd(G.inv, "fiber", 20); invAdd(G.inv, "dirt", 20); invAdd(G.inv, "berries", 5); invAdd(G.inv, "apple", 3); invAdd(G.inv, "stone_hammer", 1);
    t.ok(H.upgrade(G) && G.house.level === 7, "cabin and garden");
    t.eq(G.house.garden.ready, 4, "first crop ready");
    const S = H.spots(G); t.ok(S.garden && S.garden.x1 - S.garden.x0 === 3, "4 garden columns");
    t.standAt(G, S.garden.x0 + 1, G.world.houseY - 1);
    const c0 = invCount(G.inv, "carrot");
    t.run(G, 1, t.B.USE); t.run(G, 1);
    t.eq(invCount(G.inv, "carrot") - c0, 8, "USE in the garden harvests 8 carrots");
    t.eq(G.house.garden.ready, 0, "beds empty");
    const ripe = []; G.bus.on("garden:ripe", (d) => ripe.push(d.beds));
    setDayF(G, 0.8); setDayF(G, 0.02);
    t.eq(ripe.join(","), "4", "ripens at dawn"); t.eq(G.house.garden.ready, 4, "4 ripe");
    t.ok(H.harvestGarden(G) === 16, "harvest gives 16 crops");
    H.setLevel(G, 15); setDayF(G, 0.5); setDayF(G, 0.02);
    t.eq(G.house.garden.ready, 8, "8 beds at the manor");
    t.eq(H.spots(G).garden.x1 - H.spots(G).garden.x0, 5, "6 garden columns");
  });

  t.test("interact: door opens the panel, bed sleeps, chest spot opens the chest, food still eats on an empty plot", () => {
    const G = t.game(); t.run(G, 20);
    const opened = []; G.bus.on("ui:open", (d) => opened.push(d.panel + (d.house ? ":house" : "")));
    const w = G.world;
    t.standAt(G, w.houseX + 5, w.houseY - 1);
    t.run(G, 1, t.B.USE); t.run(G, 1);
    t.eq(opened.pop(), "house", "empty plot: USE opens the house panel");
    invAdd(G.inv, "apple", 2); invSelect(G.inv, G.inv.slots.findIndex((s) => s && s.id === "apple"));
    G.player.hunger = 50;
    t.run(G, 1, t.B.USE); t.run(G, 1);
    t.eq(opened.length, 0, "holding food on the empty plot: no panel"); t.ok(G.player.hunger > 55, "ate the apple");
    invSelect(G.inv, 8);
    H.setLevel(G, 6);
    const S = H.spots(G);
    t.standAt(G, S.door, w.houseY - 1); t.run(G, 1, t.B.USE); t.run(G, 1);
    t.eq(opened.pop(), "house", "door: panel");
    t.standAt(G, S.chest, w.houseY - 1); t.run(G, 1, t.B.USE); t.run(G, 1);
    t.eq(opened.pop(), "chest:house", "chest spot: house chest");
    setDayF(G, 0.8); G.player.hp = 30;
    t.standAt(G, S.bed, w.houseY - 1); t.run(G, 1, t.B.USE); t.run(G, 1);
    t.ok(phase(G) === "dawn" && G.player.hp === G.player.maxHp, "bed at night: slept and healed");
    setDayF(G, 0.3); const toasts = []; G.bus.on("toast", (d) => toasts.push(d.text));
    t.run(G, 1, t.B.USE); t.run(G, 1);
    t.ok(toasts.some((x) => /night/.test(x)), "bed by day: a hint, no sleep");
    t.standAt(G, w.spawn.x - 40); t.ok(!H.interact(G), "far away: nothing");
  });

  t.test("repair: needs the workshop, costs a share of the recipe, restores durability", () => {
    const G = t.game(); t.run(G, 20);
    invAdd(G.inv, "iron_pickaxe", 1);
    const i = G.inv.slots.findIndex((s) => s && s.id === "iron_pickaxe"); G.inv.slots[i].d = 100;
    const cost = H.repairCost(G, i);
    t.ok(cost && cost.iron_ingot === 2 && !cost.stick, "2/3 worn iron pick costs 2 of its 3 iron ingots: " + JSON.stringify(cost));
    invAdd(G.inv, "iron_ingot", 5);
    t.ok(!H.repair(G, i), "no repair before the workshop");
    H.setLevel(G, 13);
    const ev = []; G.bus.on("house:repair", (d) => ev.push(d.id));
    t.ok(H.repair(G, i), "repaired");
    t.eq(G.inv.slots[i].d, ITEMS.iron_pickaxe.tool.dur, "full durability"); t.eq(invCount(G.inv, "iron_ingot"), 3, "paid 2");
    t.eq(H.repairCost(G, i), null, "nothing to repair now"); t.eq(ev.join(), "iron_pickaxe", "event");
    invAdd(G.inv, "stone_spear", 1); const j = G.inv.slots.findIndex((s) => s && s.id === "stone_spear"); G.inv.slots[j].d = 1;
    t.ok(H.repairCost(G, j).flint === 1, "flint-tipped spear repairs with flint");
  });

  t.test("walls keep hostiles out of the plot; lamps keep wolves off the homestead", () => {
    const G = t.game(); t.run(G, 20);
    const w = G.world, mid = w.houseX + 12;
    H.setLevel(G, 15);
    let b = spawnAnimal(G, "boar", mid, w.houseY - 1);
    H.step(G); t.ok(H.inPlot(G, Math.floor((b.x + b.w / 2) / T)), "no walls yet: the boar may stand in the plot");
    H.setLevel(G, 16);
    H.step(G);
    t.ok(!H.inPlot(G, Math.floor((b.x + b.w / 2) / T)), "walls: put outside");
    const rb = spawnAnimal(G, "rabbit", mid, w.houseY - 1); H.step(G);
    t.ok(H.inPlot(G, Math.floor((rb.x + rb.w / 2) / T)), "harmless rabbits may hop in");
    // a boar stepping in from the edge is stopped at the wall
    b.y = w.houseY * T - b.h;
    b.ox = (w.houseX - 2) * T; b.x = w.houseX * T + 4 - b.w / 2;
    H.step(G); t.ok(b.x + b.w / 2 < w.houseX * T, "walking in: stepped back");
    G.animals.length = 0;
    H.setLevel(G, 10);
    const wolf = spawnAnimal(G, "wolf", w.houseX - 4, W.surfaceAt(G, w.houseX - 4) - 1);
    H.step(G);
    t.ok(wolf.x + wolf.w / 2 < (w.houseX - SPAWN.homeSafe) * T, "lamps: a wolf near the house is moved off the homestead");
    H.setLevel(G, 9);
    const wolf2 = spawnAnimal(G, "wolf", w.houseX - 4, W.surfaceAt(G, w.houseX - 4) - 1); H.step(G);
    t.ok(Math.abs(wolf2.x / T - (w.houseX - 4)) < 2, "no lamps: it stays");
  });

  t.test("save/load: level, chest, garden, nights, history, flags; partial old saves", () => {
    const G = t.game(); t.run(G, 20);
    H.setLevel(G, 9); G.house.chest.slots[26] = { id: "crystal", n: 3 }; G.house.garden.ready = 2; G.house.slept = 5;
    G.house.upgrades.push({ lv: 9, day: 4 }); G.flags.houseReady = 10;
    const s = JSON.parse(JSON.stringify(makeSave(G)));
    const G2 = createGame({ save: s, headless: true });
    t.eq(G2.house.level, 9, "level"); t.eq(G2.house.chest.slots.length, 27, "chest size"); t.eq(G2.house.chest.slots[26].n, 3, "chest item");
    t.eq(G2.house.garden.ready, 2, "garden"); t.eq(G2.house.slept, 5, "nights"); t.eq(G2.house.upgrades.length, 1, "history"); t.eq(G2.flags.houseReady, 10, "ready flag");
    t.eq(G2.player.maxHp, 110, "max hp from perks");
    s.house = { level: 12 };
    const G3 = createGame({ save: s, headless: true });
    t.ok(G3.house.level === 12 && G3.house.chest.slots.length === 36 && G3.house.garden.ready === 0 && G3.house.slept === 0, "partial save -> defaults");
    s.house = { level: 99, garden: { ready: 50 } };
    const G4 = createGame({ save: s, headless: true });
    t.ok(G4.house.level === 20 && G4.house.garden.ready === 8, "clamped");
  });
}
