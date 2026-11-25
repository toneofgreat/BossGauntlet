// core.mjs - CORE's headless tests: world gen invariants, physics feel, chop/mine/craft/eat/house loops,
// save round trip, day/night, faint + respawn, performance. (CORE owns this file.)
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => pathToFileURL(path.join(here, "..", "..", "src", "bonus", p)).href;

const { generateWorld, worldHash, SURF } = await import(src("world/gen.js"));
const { createGame, stepGame, makeSave } = await import(src("core/game.js"));
const { readSave, writeSave } = await import(src("core/save.js"));
const { TILE, isSolid } = await import(src("data/tiles.js"));
const { invCount, invAdd, invSelect } = await import(src("craft/inventory.js"));
const { craft, eat } = await import(src("craft/index.js"));
const H = await import(src("house/index.js"));
const W = await import(src("world/index.js"));
const { hurtPlayer } = await import(src("core/player.js"));
const { phase, setDayF } = await import(src("core/time.js"));
const C = await import(src("core/const.js"));
const { ITEMS } = await import(src("data/items.js"));
const { RECIPES } = await import(src("data/recipes.js"));
const { HOUSE_LEVELS } = await import(src("data/house.js"));
const { ANIMAL_DEFS } = await import(src("data/animals.js"));

export default async function (t) {
  const { B, T } = t;

  t.test("data tables are consistent", () => {
    for (const r of RECIPES) { t.ok(ITEMS[r.out[0]], "recipe out exists " + r.id); for (const id in r.cost) t.ok(ITEMS[id], `recipe ${r.id} cost item ${id}`); }
    for (const L of HOUSE_LEVELS) for (const id in L.cost) t.ok(ITEMS[id], `house ${L.lv} cost item ${id}`);
    t.eq(HOUSE_LEVELS.length, 20, "20 house levels");
    for (const k in ANIMAL_DEFS) for (const d of ANIMAL_DEFS[k].drops) t.ok(ITEMS[d[0]], `${k} drop ${d[0]}`);
    // every non-raw-only item is obtainable: produced by a recipe, a tile, an object, a tree or an animal
    const made = new Set(RECIPES.map((r) => r.out[0]).concat(["wood", "stick", "sapling", "apple", "berries", "mushroom", "fiber", "stone", "flint", "dirt", "sand", "gravel", "clay", "coal", "iron_ore", "gold_ore", "crystal", "carrot"]));
    for (const k in ANIMAL_DEFS) for (const d of ANIMAL_DEFS[k].drops) made.add(d[0]);
    for (const id in ITEMS) t.ok(made.has(id), "obtainable: " + id);
  });

  t.test("world gen: deterministic, fast, sane", () => {
    const t0 = Date.now();
    const a = generateWorld(1234), ms = Date.now() - t0;
    const b = generateWorld(1234), c = generateWorld(99);
    t.eq(worldHash(a), worldHash(b), "same seed -> same tiles");
    t.ok(worldHash(a) !== worldHash(c), "different seed -> different tiles");
    t.ok(ms < 400, "gen < 400 ms (" + ms + ")");
    t.eq(a.W, C.WORLD_W, "width"); t.eq(a.H, C.WORLD_H, "height");
    for (const w of [a, c]) {
      const cnt = {}; for (const v of w.tiles) cnt[v] = (cnt[v] || 0) + 1;
      t.ok(cnt[TILE.COAL_ORE] > 300 && cnt[TILE.IRON_ORE] > 200 && cnt[TILE.GOLD_ORE] > 60 && cnt[TILE.CRYSTAL] > 40, "ores present " + JSON.stringify([cnt[4], cnt[5], cnt[6], cnt[7]]));
      t.ok(cnt[TILE.WATER] > 40, "a river");
      t.ok(w.trees.length > 70, "trees " + w.trees.length);
      for (let x = w.houseX; x < w.houseX + C.PLOT_W; x++) if (w.surface[x] !== w.houseY) { t.ok(false, "plot flat at " + x); break; }
      t.eq(w.surface[w.spawn.x], SURF, "spawn on the meadow line");
      t.ok(w.trees.some((tr) => Math.abs(tr.x - w.spawn.x) <= 12), "a tree near spawn");
      t.ok(isSolid(w.tiles[(w.H - 1) * w.W + 5]), "bedrock floor");
    }
  });

  t.test("physics: settles, runs, jumps like the main game", () => {
    const G = t.game();
    t.run(G, 30);
    const p = G.player;
    t.ok(p.grounded, "grounded at spawn");
    t.eq(p.y + p.h, G.world.spawn.y * T, "feet on the ground row");
    const x0 = p.x; t.run(G, 10, B.RIGHT); t.near(p.vx, 3.5, 0.01, "full run speed after 10 steps");
    t.run(G, 20, 0);
    let top = p.y; const y0 = p.y;
    for (let i = 0; i < 50; i++) { stepGame(G, B.JUMP); top = Math.min(top, p.y); }
    t.near(y0 - top, 87, 4, "full jump ~87 px");
    t.run(G, 30, 0);
    t.ok(p.grounded && p.x > x0, "landed after the jump");
  });

  t.test("physics: auto step-up 1 tile, blocked by 2", () => {
    const G = t.game(), w = G.world, sx = w.spawn.x;
    const gy = w.surface[sx];
    t.standAt(G, sx - 1);
    for (let k = 1; k <= 6; k++) W.setTile(G, sx + k, gy - 1, TILE.DIRT);
    t.run(G, 40, B.RIGHT);
    t.ok(G.player.x / T > sx + 1 && G.player.y + G.player.h <= (gy - 1) * T + 0.5, "walked up a 1-tile step " + [G.player.x / T, G.player.y + G.player.h, (gy - 1) * T]);
    const G2 = t.game();
    t.standAt(G2, sx - 1);
    W.setTile(G2, sx + 1, gy - 1, TILE.DIRT); W.setTile(G2, sx + 1, gy - 2, TILE.DIRT);
    t.run(G2, 40, B.RIGHT);
    t.ok(G2.player.x + G2.player.w <= (sx + 1) * T + 0.01, "a 2-tile wall blocks walking");
  });

  t.test("swimming: float up while holding jump", () => {
    const G = t.game(), rv = G.world.river, mx = (rv.x0 + rv.x1) >> 1;
    G.player.x = mx * T; G.player.y = (rv.waterTop + 2) * T; G.player.vy = 0;
    t.run(G, 5);
    t.ok(G.player.inWater, "in water");
    const y0 = G.player.y; t.run(G, 30, B.JUMP);
    t.ok(G.player.y < y0 - 20, "swam up");
  });

  t.test("chop a tree by hand -> wood in the inventory", () => {
    const G = t.game(), tr = G.world.trees.find((x) => x.x === G.world.spawn.x - 5);
    t.ok(tr && tr.stage === 3, "starter oak");
    t.standAt(G, tr.x + 1); G.player.facing = -1;
    let f = 0; while (tr.stage !== 0 && f < 1200) { stepGame(G, B.ACTION); f++; }
    t.eq(tr.stage, 0, "tree felled (" + f + " steps)");
    t.run(G, 120);
    t.ok(invCount(G.inv, "wood") >= 3, "wood picked up: " + invCount(G.inv, "wood"));
    t.ok(G.stats.treesFelled === 1, "stat");
    t.run(G, 7300);
    t.eq(tr.stage, 1, "stump regrew into a sapling");
  });

  t.test("mining: hand digs dirt, stone needs a pickaxe", () => {
    const G = t.game(), sx = G.world.spawn.x - 1;
    t.standAt(G, sx);
    const log = []; G.bus.on("tile:tooHard", (d) => log.push(d));
    t.run(G, 400, B.ACTION | B.DOWN);
    t.ok(invCount(G.inv, "dirt") >= 2, "dug dirt: " + invCount(G.inv, "dirt"));
    t.ok(log.length > 0, "hit stone too hard by hand");
    invAdd(G.inv, "wood_pickaxe", 1); invSelect(G.inv, G.inv.slots.findIndex((s) => s && s.id === "wood_pickaxe"));
    t.run(G, 300, B.ACTION | B.DOWN); t.run(G, 60);
    t.ok(invCount(G.inv, "stone") >= 1, "mined stone with a wooden pickaxe: " + invCount(G.inv, "stone"));
    const s = G.inv.slots[G.inv.sel]; t.ok(s && s.d < ITEMS.wood_pickaxe.tool.dur, "pickaxe wore");
  });

  t.test("crafting: hand, workbench station, place it", () => {
    const G = t.game(); t.run(G, 20);
    invAdd(G.inv, "wood", 20);
    t.eq(craft(G, "wood_pickaxe"), 0, "no workbench yet");
    t.eq(craft(G, "workbench"), 1, "workbench by hand");
    t.eq(craft(G, "stick"), 1, "sticks");
    invSelect(G.inv, G.inv.slots.findIndex((s) => s && s.id === "workbench"));
    G.player.facing = -1; t.run(G, 2);
    t.ok(G.target && G.target.place, "a placement cell in front");
    t.run(G, 1, B.USE); t.run(G, 1);
    t.ok(G.world.objects.some((o) => o.kind === "workbench"), "workbench placed");
    t.eq(invCount(G.inv, "workbench"), 0, "removed from inventory");
    t.eq(craft(G, "wood_pickaxe"), 1, "pickaxe at the workbench");
  });

  t.test("hunger + eating", () => {
    const G = t.game(); t.run(G, 20);
    G.player.hunger = 30;
    invAdd(G.inv, "venison_steak", 1); invSelect(G.inv, G.inv.slots.findIndex((s) => s && s.id === "venison_steak"));
    t.run(G, 1, B.USE);
    t.near(G.player.hunger, 60, 0.2, "steak +30 hunger");
    G.player.hunger = 0; G.player.hp = 50;
    t.run(G, 600);
    t.ok(G.player.hp < 50, "starving hurts");
  });

  t.test("house: costs, hammer gate, perks, respawn", () => {
    const G = t.game(); t.run(G, 20);
    t.ok(!H.canUpgrade(G).ok, "cannot build with nothing");
    invAdd(G.inv, "wood", 200); invAdd(G.inv, "fiber", 20); invAdd(G.inv, "hide", 10); invAdd(G.inv, "rope", 10); invAdd(G.inv, "stone", 50);
    t.ok(H.upgrade(G) && G.house.level === 1, "lean-to");
    t.ok(H.upgrade(G) && G.house.level === 2, "tent");
    const c = H.canUpgrade(G); t.ok(!c.ok && !c.hasHammer, "level 3 needs a wooden hammer");
    invAdd(G.inv, "wood_hammer", 1);
    t.ok(H.upgrade(G) && G.house.level === 3, "camp with a hammer");
    t.ok(H.perkValue(G, "stations", []).includes("campfire"), "campfire perk");
    H.setLevel(G, 20);
    t.eq(G.player.maxHp, 100 + 10 + 10 + 20 + 25, "max hp perks summed");
    t.ok(H.hasPerk(G, "crown") && H.perkValue(G, "chest", 0) === 54, "late perks");
    const sp = H.respawnPoint(G), f = H.footprint(G);
    t.near(sp.x + G.player.w / 2, (f.doorX + 0.5) * T, 1, "respawn at the door");
  });

  t.test("faint -> wake at home, keep items", () => {
    const G = t.game(); t.run(G, 20);
    H.setLevel(G, 1); invAdd(G.inv, "apple", 3);
    t.standAt(G, G.world.spawn.x - 30);
    G.player.hurtT = 0; hurtPlayer(G, 999, 0, 0, "test");
    t.ok(G.player.dead, "fainted");
    t.run(G, C.DEATH_STEPS + 2);
    t.ok(!G.player.dead && G.player.hp > 0, "woke up");
    t.ok(Math.abs(G.player.x / T - H.footprint(G).doorX) < 2, "at the door");
    t.eq(invCount(G.inv, "apple"), 3, "kept items");
  });

  t.test("day/night cycle + sleep", () => {
    const G = t.game(); const ph = [];
    G.bus.on("time:phase", (d) => ph.push(d.phase));
    t.eq(phase(G), "day", "starts in the day");
    t.run(G, C.DAY_FRAMES);
    t.eq(ph.join(","), "dusk,night,dawn,day", "phases in order");
    t.eq(G.time.day, 2, "day 2");
    H.setLevel(G, 2); setDayF(G, 0.8); t.eq(phase(G), "night", "night");
    t.ok(H.sleep(G) && phase(G) === "dawn", "slept to dawn");
  });

  t.test("save round trip (localStorage format)", () => {
    const G = t.game(); t.run(G, 20);
    const sx = G.world.spawn.x;
    W.setTile(G, sx - 2, G.world.surface[sx - 2], TILE.AIR);
    W.setTile(G, sx - 3, 20, TILE.PLANKS);
    const tr = G.world.trees[3]; tr.stage = 0; tr.growT = 1234;
    invAdd(G.inv, "iron_pickaxe", 1); invAdd(G.inv, "coal", 17);
    G.inv.slots.find((s) => s && s.id === "iron_pickaxe").d = 77;
    H.setLevel(G, 6); G.house.chest.slots[0] = { id: "gold_ingot", n: 4 };
    let bx = sx - 20; while (!W.canPlace(G, "workbench", bx, G.world.surface[bx] - 1) && bx > sx - 60) bx--;
    t.ok(W.place(G, "workbench", bx, G.world.surface[bx] - 1), "placed a workbench at " + bx);
    t.run(G, 100);
    const mem = new Map(), storage = { get: (k, d) => (mem.has(k) ? JSON.parse(mem.get(k)) : d), set: (k, v) => mem.set(k, JSON.stringify(v)) };
    t.ok(writeSave(storage, G), "written");
    const raw = mem.get(C.SAVE_KEY); t.ok(raw.length < 200000, "save is small: " + raw.length + " bytes");
    const G2 = createGame({ save: readSave(storage), headless: true });
    t.eq(G2.world.tiles[G.world.surface[sx - 2] * G.world.W + sx - 2], TILE.AIR, "dug tile");
    t.eq(G2.world.tiles[20 * G.world.W + sx - 3], TILE.PLANKS, "placed tile");
    t.eq(worldHash(G2.world), worldHash(G.world), "identical tiles");
    const tr2 = G2.world.trees.find((x) => x.id === tr.id); t.ok(tr2 && tr2.stage === 0 && tr2.growT === tr.growT, "tree state");
    t.eq(invCount(G2.inv, "coal"), 17, "inventory");
    t.eq(G2.inv.slots.find((s) => s && s.id === "iron_pickaxe").d, 77, "durability");
    t.eq(G2.house.level, 6, "house level"); t.eq(G2.house.chest.slots[0].id, "gold_ingot", "house chest");
    t.ok(G2.world.objects.some((o) => o.kind === "workbench"), "placed object");
    t.eq(G2.time.t, G.time.t, "time"); t.near(G2.player.x, G.player.x, 1, "player x");
    t.eq(JSON.stringify(makeSave(G2).world.mods), JSON.stringify(makeSave(G).world.mods), "mods identical");
  });

  t.test("performance: 20k steps with animals", () => {
    const G = t.game(); const t0 = Date.now();
    for (let i = 0; i < 20000; i++) stepGame(G, (i >> 7) % 2 ? B.RIGHT : B.LEFT | ((i & 31) === 0 ? B.JUMP : 0));
    const ms = Date.now() - t0;
    t.ok(ms < 3000, `20k steps in ${ms} ms (${(ms / 20000 * 1000).toFixed(1)} us/step), ${G.animals.length} animals`);
  });
}
