// world.mjs - WORLD's headless tests: generation (determinism + invariants for several seeds), mining every tile
// type with the right tool tiers, hit progress + healing, flooding, trees (chop / fall / stump / regrow / plant /
// reseed), natural objects, deposit renewal, grass regrowth, placing rules, drops, compact save round trips.
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => pathToFileURL(path.join(here, "..", "..", "src", "bonus", p)).href;

const { generateWorld, worldHash, SURF, SPAWN_X } = await import(src("world/gen.js"));
const W = await import(src("world/index.js"));
const { createGame, stepGame, makeSave } = await import(src("core/game.js"));
const { TILE, TILE_DEFS, TREE_DEFS, TREE_GROW, OBJECT_DEFS, BIOME, isSolid } = await import(src("data/tiles.js"));
const { ITEMS, HAND } = await import(src("data/items.js"));
const { invAdd, invCount, invSelect } = await import(src("craft/inventory.js"));
const { setDayF } = await import(src("core/time.js"));
const C = await import(src("core/const.js"));

const tool = (id) => (id === "hand" ? HAND : ITEMS[id].tool);
const count = (w, code) => { let n = 0; for (const v of w.tiles) if (v === code) n++; return n; };
const dropsOf = (G, id) => G.world.drops.filter((d) => d.item === id).reduce((a, d) => a + d.n, 0);
// a sky cell well away from home, spawn and trees, for placing test tiles
const skyCell = (G, dx = 0) => ({ tx: G.world.spawn.x - 40 + dx, ty: 8 });

export default async function (t) {
  const { B, T } = t;
  const SEEDS = [1, 1234, 99, 777777, 31337];

  t.test("gen: deterministic per seed, different across seeds, fast", () => {
    const hashes = new Set();
    for (const s of SEEDS) {
      const t0 = Date.now(); const a = generateWorld(s); const ms = Date.now() - t0;
      const b = generateWorld(s);
      t.eq(worldHash(a), worldHash(b), "same tiles for seed " + s);
      t.eq(JSON.stringify(a.trees), JSON.stringify(b.trees), "same trees for seed " + s);
      t.eq(JSON.stringify(a.objects), JSON.stringify(b.objects), "same objects for seed " + s);
      t.eq(JSON.stringify([a.ponds, a.river, a.segments]), JSON.stringify([b.ponds, b.river, b.segments]), "same layout " + s);
      t.ok(ms < 300, `gen < 300 ms (seed ${s}: ${ms} ms)`);
      hashes.add(worldHash(a));
    }
    t.eq(hashes.size, SEEDS.length, "every seed gives a different world");
    const G1 = createGame({ seed: "wildwood", headless: true }), G2 = createGame({ seed: "wildwood", headless: true });
    t.eq(worldHash(G1.world), worldHash(G2.world), "string seeds are stable");
  });

  t.test("gen: invariants for several seeds", () => {
    for (const s of SEEDS) {
      const w = generateWorld(s), at = (x, y) => w.tiles[y * w.W + x];
      const tag = " (seed " + s + ")";
      t.eq(w.spawn.x, SPAWN_X, "spawn column" + tag);
      t.eq(w.surface[w.spawn.x], SURF, "spawn on the meadow line" + tag);
      let flat = true, solidHome = true;
      for (let x = w.houseX; x < w.houseX + C.PLOT_W; x++) {
        if (w.surface[x] !== w.houseY) flat = false;
        for (let y = w.houseY; y < w.houseY + 14; y++) if (!isSolid(at(x, y))) solidHome = false;
      }
      t.ok(flat, "plot flat" + tag); t.ok(solidHome, "no caves under the plot" + tag);
      let bed = true; for (let x = 0; x < w.W; x++) if (at(x, w.H - 1) !== TILE.BEDROCK || at(x, w.H - 2) !== TILE.BEDROCK) bed = false;
      t.ok(bed, "bedrock floor" + tag);
      // still water never floats: every water cell rests on solid ground or more water
      let floating = 0;
      for (let y = 0; y < w.H - 1; y++) for (let x = 0; x < w.W; x++) if (at(x, y) === TILE.WATER && !(isSolid(at(x, y + 1)) || at(x, y + 1) === TILE.WATER)) floating++;
      t.eq(floating, 0, "no floating water" + tag);
      t.ok(w.ponds.length >= 2, "forest ponds " + w.ponds.length + tag);
      let rv = 0; for (let x = w.river.x0; x < w.river.x1; x++) if (at(x, w.river.waterTop) === TILE.WATER) rv++;
      t.eq(rv, w.river.x1 - w.river.x0, "river surface is all water" + tag);
      const c = (k) => count(w, k);
      t.ok(c(TILE.COAL_ORE) > 600 && c(TILE.IRON_ORE) > 400 && c(TILE.GOLD_ORE) > 120 && c(TILE.CRYSTAL) > 80, "ores " + [c(4), c(5), c(6), c(7)] + tag);
      t.ok(c(TILE.CLAY) > 400 && c(TILE.SAND) > 150 && c(TILE.GRAVEL) > 300, "clay/sand/gravel " + [c(8), c(9), c(10)] + tag);
      // deep ores stay deep (relative to the live surface; entrances and guaranteed blobs allow some slack)
      let shallow = 0;
      for (let x = 0; x < w.W; x++) for (let y = 0; y < w.H; y++) { const v = at(x, y), d = y - w.surface[x]; if ((v === TILE.CRYSTAL && d < 30) || (v === TILE.GOLD_ORE && d < 20)) shallow++; }
      t.eq(shallow, 0, "gold/crystal only deep" + tag);
      // guaranteed starters near spawn
      const sx = w.spawn.x;
      t.ok(w.trees.some((tr) => tr.x === sx - 5 && tr.kind === "oak"), "starter oak" + tag);
      t.ok(w.trees.some((tr) => tr.x === sx - 10 && tr.kind === "birch"), "starter birch" + tag);
      for (const [dx, k] of [[-7, "boulder"], [-16, "boulder"], [-3, "tallgrass"], [-13, "bush"]]) t.ok(w.objects.some((o) => o.x === sx + dx && o.kind === k), `starter ${k} at ${dx}` + tag);
      let nearCoal = 0, nearIron = 0, nearClay = 0;
      for (let x = sx - 40; x < sx + 60; x++) for (let y = 0; y < w.H; y++) { const v = at(x, y); if (v === TILE.COAL_ORE) nearCoal++; if (v === TILE.IRON_ORE) nearIron++; if (v === TILE.CLAY) nearClay++; }
      t.ok(nearCoal >= 8 && nearIron >= 6 && nearClay >= 10, "home has coal/iron/clay " + [nearCoal, nearIron, nearClay] + tag);
      // trees + objects stand on real ground in free air, never on the plot, no two trunks side by side
      let bad = 0;
      for (const tr of w.trees) {
        const g = at(tr.x, tr.y);
        if (!(g === TILE.GRASS || g === TILE.SNOW) || at(tr.x, tr.y - 1) !== TILE.AIR) bad++;
        if (tr.x >= w.houseX - 3 && tr.x <= w.houseX + C.PLOT_W + 2) bad++;
        if (!TREE_DEFS[tr.kind] || tr.stage !== 3) bad++;
      }
      t.eq(bad, 0, "trees grounded" + tag);
      const xs = w.trees.map((tr) => tr.x).sort((a, b) => a - b);
      let tight = 0; for (let k = 1; k < xs.length; k++) if (xs[k] - xs[k - 1] < 2) tight++;
      t.eq(tight, 0, "trees spaced" + tag);
      t.ok(w.trees.length > 75 && w.trees.some((tr) => tr.kind === "pine") && w.trees.some((tr) => tr.kind === "birch"), "trees " + w.trees.length + tag);
      let badO = 0;
      for (const o of w.objects) if (!OBJECT_DEFS[o.kind] || at(o.x, o.y) !== TILE.AIR || !isSolid(at(o.x, o.y + 1))) badO++;
      t.eq(badO, 0, "objects grounded" + tag);
      t.ok(w.objects.filter((o) => o.y > w.surface[o.x] + 3).length >= 20, "cave mushrooms / rocks" + tag);
      const ids = new Set([...w.trees, ...w.objects].map((o) => o.id));
      t.eq(ids.size, w.trees.length + w.objects.length, "unique ids" + tag);
      t.ok(w.nextId > Math.max(...ids), "nextId after every id" + tag);
      // every biome is present in the expected order and the hills are higher than the meadow
      t.eq(w.segments.map((g) => g[0]).join(","), "hills,pinewood,forest,river,forest,meadow,forest,pinewood,hills", "biome order" + tag);
      let hillTop = 999; for (let x = 0; x < 100; x++) hillTop = Math.min(hillTop, w.surface[x]);
      t.ok(hillTop < SURF - 15, "hills rise high " + hillTop + tag);
    }
  });

  t.test("gen: caves are reachable from the surface somewhere (entrances)", () => {
    for (const s of SEEDS) {
      const w = generateWorld(s);
      // flood fill from the sky through air; count air cells reached that lie 15+ rows under the generated ground
      const seen = new Uint8Array(w.W * w.H), q = [];
      for (let x = 0; x < w.W; x++) { seen[x] = 1; q.push(x); }
      let deep = 0;
      while (q.length) {
        const i = q.pop(), x = i % w.W, y = (i / w.W) | 0;
        if (y > w.surface[x] + 15) deep++;
        for (const n of [i - 1, i + 1, i - w.W, i + w.W]) {
          if (n < 0 || n >= w.tiles.length || seen[n] || Math.abs((n % w.W) - x) > 1) continue;
          if (w.tiles[n] !== TILE.AIR) continue;
          seen[n] = 1; q.push(n);
        }
      }
      t.ok(deep > 150, `open caves reachable from the sky: ${deep} deep cells (seed ${s})`);
    }
  });

  t.test("mining: every tile type x every tool tier", () => {
    const G = t.game();
    const tools = ["hand", "wood_pickaxe", "stone_pickaxe", "iron_pickaxe", "steel_pickaxe", "wood_axe", "iron_axe", "stone_sword"];
    for (let code = 0; code < TILE_DEFS.length; code++) {
      const d = TILE_DEFS[code];
      for (const id of tools) {
        const tl = tool(id);
        const want = !d.solid || d.tier >= 99 ? 0 : d.tier > 0 && !(tl.type === "pickaxe" && tl.tier >= d.tier) ? 0
          : tl.type === "pickaxe" && d.pref !== "axe" ? tl.power : tl.type === "axe" && d.pref === "axe" ? tl.power : 1;
        t.eq(W.tileWork(code, tl), want, `tileWork ${d.id} with ${id}`);
        if (!d.solid) continue;
        // really break it in the sky
        const { tx, ty } = skyCell(G, code);
        W.setTile(G, tx, ty, code);
        G.world.drops.length = 0;
        const log = []; const off = G.bus.on("tile:tooHard", (e) => log.push(e));
        let swings = 0, res;
        do { res = W.hitTile(G, tx, ty, tl); swings++; } while (res.ok && !res.broke && swings < 100);
        off();
        if (want === 0) { t.ok(!res.ok && res.tooHard && log.length === 1 && G.world.tiles[ty * G.world.W + tx] === code, `${d.id} resists ${id}`); W.setTile(G, tx, ty, TILE.AIR); continue; }
        t.ok(res.broke, `${d.id} breaks with ${id}`);
        t.eq(swings, Math.ceil(d.hp / want), `${d.id} with ${id}: swings`);
        t.eq(G.world.tiles[ty * G.world.W + tx], TILE.AIR, `${d.id} gone`);
        if (d.drop) t.ok(dropsOf(G, d.drop[0]) >= d.drop[1], `${d.id} drops ${d.drop[0]}`);
      }
    }
    // tiers named in BONUS.md 3.3
    t.eq(W.tileWork(TILE.IRON_ORE, tool("wood_pickaxe")), 0, "iron needs a stone pickaxe");
    t.eq(W.tileWork(TILE.GOLD_ORE, tool("stone_pickaxe")), 0, "gold needs an iron pickaxe");
    t.eq(W.tileWork(TILE.CRYSTAL, tool("iron_pickaxe")), 0, "crystal needs a steel pickaxe");
    t.eq(W.tileWork(TILE.CRYSTAL, tool("steel_pickaxe")), 8, "steel pickaxe on crystal");
    t.eq(W.tileWork(TILE.PLANKS, tool("stone_axe")), 3, "axe on planks");
  });

  t.test("mining: cracks build up and heal, plot is protected, water floods in", () => {
    const G = t.game(), w = G.world, { tx, ty } = skyCell(G);
    W.setTile(G, tx, ty, TILE.STONE);
    const healed = []; G.bus.on("tile:heal", (e) => healed.push(e));
    W.hitTile(G, tx, ty, tool("wood_pickaxe"));
    t.eq(w.dmg.get(ty * w.W + tx).w, 2, "work recorded");
    t.run(G, 300);
    t.ok(!w.dmg.has(ty * w.W + tx) && healed.length === 1, "crack healed after a pause");
    const prot = []; G.bus.on("tile:protected", (e) => prot.push(e));
    const r = W.hitTile(G, w.houseX + 3, w.houseY, tool("steel_pickaxe"));
    t.ok(!r.ok && prot.length === 1 && isSolid(w.tiles[w.houseY * w.W + w.houseX + 3]), "plot ground cannot be mined");
    t.ok(!W.canPlace(G, "dirt", w.houseX + 3, w.houseY - 1), "nor built on with blocks");
    // a bank tile next to the river floods when broken
    const bx = w.river.x0 - 1, by = w.river.waterTop + 1;
    W.setTile(G, bx, by, TILE.DIRT);
    let k = 0; while (W.tileAt(G, bx, by) === TILE.DIRT && k++ < 10) W.hitTile(G, bx, by, tool("steel_pickaxe"));
    t.eq(W.tileAt(G, bx, by), TILE.WATER, "water flowed into the dug cell");
    t.eq(W.tileAt(G, 0, w.H - 1), TILE.BEDROCK, "bedrock");
    t.ok(!W.hitTile(G, 5, w.H - 1, tool("steel_pickaxe")).ok, "bedrock is unbreakable");
  });

  t.test("trees: chop by hand, fall direction, loot toward the chopper, stump, regrowth stages", () => {
    const G = t.game(), w = G.world, tr = w.trees.find((x) => x.x === w.spawn.x - 5);
    t.standAt(G, tr.x + 2);
    const falls = []; G.bus.on("tree:fall", (e) => falls.push(e));
    let n = 0; while (tr.stage === 3 && n < 50) { W.hitTree(G, tr, HAND); n++; }
    t.eq(n, TREE_DEFS.oak.hp, "hand chops an oak in hp swings");
    t.eq(falls.length, 1, "one fall"); t.eq(falls[0].dir, -1, "falls away from a chopper on the right");
    const wood = w.drops.find((d) => d.item === "wood");
    t.ok(wood && wood.x + 6 > (tr.x + 0.5) * T, "wood tumbles toward the chopper");
    t.ok(!W.hitTree(G, tr, HAND).ok, "a stump ignores hands");
    t.eq(tr.stage, 0, "stump");
    t.run(G, TREE_GROW.stumpToSapling + 60); t.eq(tr.stage, 1, "sapling after 2 min");
    t.run(G, TREE_GROW.saplingToYoung + 60); t.eq(tr.stage, 2, "young after 3 more min");
    t.run(G, TREE_GROW.youngToMature + 60); t.eq(tr.stage, 3, "mature again");
    t.eq(tr.hp, TREE_DEFS.oak.hp, "full hp");
    // stumps dig out with an axe
    let m = 0; while (tr.stage === 3 && m++ < 50) W.hitTree(G, tr, tool("steel_axe"));
    t.eq(m, 1, "steel axe fells an oak in one swing");
    let s = 0; while (w.trees.includes(tr) && s++ < 10) W.hitTree(G, tr, tool("wood_axe"));
    t.ok(!w.trees.includes(tr) && s === 2, "wooden axe digs out the stump in 2 swings");
  });

  t.test("trees: ancient oak needs a stone axe; young drop half; apples regrow; uproot when undermined", () => {
    const G = t.game(), w = G.world;
    const an = w.trees.find((x) => x.kind === "ancient") || (() => { const x = { id: G.nextId++, kind: "ancient", x: w.spawn.x - 45, y: W.surfaceAt(G, w.spawn.x - 45), stage: 3, hp: 30, growT: 0, fruit: 0, seed: 1 }; w.trees.push(x); return x; })();
    const hard = []; G.bus.on("tree:tooHard", (e) => hard.push(e));
    t.ok(W.hitTree(G, an, tool("wood_axe")).tooHard && hard.length === 1, "wooden axe bounces off");
    t.ok(W.hitTree(G, an, HAND).tooHard, "so do hands");
    t.ok(W.hitTree(G, an, tool("stone_axe")).ok, "stone axe bites");
    const oak = w.trees.find((x) => x.kind === "oak" && x.stage === 3 && x.x < w.spawn.x - 20);
    oak.fruit = 0; setDayF(G, 0.99); t.run(G, 400);
    for (let d = 0; d < 6; d++) { setDayF(G, 0.99); t.run(G, 400); }
    t.ok(oak.fruit > 0, "apples regrew at dawn: " + oak.fruit);
    const y = w.trees.find((x) => x.kind === "pine" && x.stage === 3); y.stage = 2;
    w.drops.length = 0; G.rng.state = 5;
    let k = 0; while (y.stage === 2 && k++ < 30) W.hitTree(G, y, tool("steel_axe"));
    t.ok(dropsOf(G, "wood") <= Math.ceil(TREE_DEFS.pine.wood[1] / 2), "young pine drops half wood: " + dropsOf(G, "wood"));
    const victim = w.trees.find((x) => x.stage === 3 && x !== oak && x.kind !== "ancient");
    const before = w.trees.length;
    W.setTile(G, victim.x, victim.y, TILE.AIR);
    t.eq(w.trees.length, before - 1, "a tree whose ground is removed is uprooted");
    t.ok(w.drops.some((d) => d.item === "wood"), "and drops its wood");
  });

  t.test("trees: planting rules", () => {
    const G = t.game(), w = G.world;
    let x = w.spawn.x + 34; while (W.treesNear(G, x, 2).length || W.objectAt(G, x, W.surfaceAt(G, x) - 1) || W.tileAt(G, x, W.surfaceAt(G, x)) !== TILE.GRASS) x++;
    const y = W.surfaceAt(G, x) - 1;
    t.ok(W.canPlace(G, "sapling", x, y), "sapling on grass");
    t.ok(W.place(G, "sapling", x, y), "planted");
    const tr = w.trees[w.trees.length - 1];
    t.ok(tr.stage === 1 && tr.x === x && tr.y === y + 1, "a sapling tree");
    t.ok(!W.canPlace(G, "sapling", x + 1, y), "not next to another tree");
    t.ok(!W.canPlace(G, "dirt", x, y), "no blocks inside a trunk");
    const { tx, ty } = skyCell(G); W.setTile(G, tx, ty, TILE.STONE);
    t.ok(!W.canPlace(G, "sapling", tx, ty - 1), "not on stone");
    t.ok(!W.canPlace(G, "sapling", w.houseX + 5, w.houseY - 1), "not on the plot");
    t.ok(W.hitTree(G, tr, HAND).felled && !w.trees.includes(tr), "a sapling is pulled up by hand");
    t.ok(w.drops.some((d) => d.item === "sapling"), "and gives the sapling back");
  });

  t.test("placing: blocks, stations, wall lights, support", () => {
    const G = t.game(), w = G.world; t.run(G, 10);
    const { tx, ty } = skyCell(G);
    t.ok(!W.canPlace(G, "dirt", tx, ty), "blocks need a neighbour");
    W.setTile(G, tx, ty + 1, TILE.STONE);
    t.ok(W.canPlace(G, "plank", tx, ty), "plank next to stone");
    t.ok(W.place(G, "plank", tx, ty) && W.tileAt(G, tx, ty) === TILE.PLANKS, "placed planks");
    t.ok(W.place(G, "stone", tx + 1, ty) && W.tileAt(G, tx + 1, ty) === TILE.COBBLE, "stone places cobble");
    for (const id of ["brick", "glass", "sand", "dirt"]) t.ok(W.place(G, id, tx + 2 + ["brick", "glass", "sand", "dirt"].indexOf(id), ty), "placed " + id);
    const p = G.player, pc = Math.floor((p.x + p.w / 2) / T), pr = Math.floor((p.y + p.h / 2) / T);
    t.ok(!W.canPlace(G, "dirt", pc, pr), "never inside the player");
    // bridge over water
    const rx = (w.river.x0 + w.river.x1) >> 1, wy = w.river.waterTop;
    W.setTile(G, rx - 1, wy, TILE.DIRT);
    t.ok(W.canPlace(G, "plank", rx, wy), "blocks can be placed into water");
    t.ok(!W.canPlace(G, "workbench", rx, wy), "stations cannot");
    // stations need solid ground under the full width and free space
    let gx = w.spawn.x - 60; while (!W.canPlace(G, "furnace", gx, W.surfaceAt(G, gx) - 1) && gx > 20) gx--;
    const gy = W.surfaceAt(G, gx) - 1;
    t.ok(W.place(G, "furnace", gx, gy), "furnace on flat ground");
    t.ok(W.objectAt(G, gx + 1, gy - 1) && !W.canPlace(G, "chest", gx + 1, gy), "2x2 furnace occupies its cells");
    t.ok(w.lights.some((l) => l.kind === "furnace"), "furnace light");
    t.ok(!W.canPlace(G, "torch", tx + 10, ty - 3), "no torch floating in the sky");
    t.ok(W.canPlace(G, "torch", tx - 1, ty), "torch on a wall");
    W.place(G, "torch", tx - 1, ty);
    t.ok(w.lights.some((l) => l.kind === "torch"), "torch light");
    // remove the planks the torch hangs on: it falls
    for (let k = 0; k < 10 && W.tileAt(G, tx, ty) !== TILE.AIR; k++) W.hitTile(G, tx, ty, tool("steel_axe"));
    t.ok(!w.objects.some((o) => o.kind === "torch" && o.x === tx - 1), "unsupported torch drops");
    t.ok(w.drops.some((d) => d.item === "torch"), "as an item");
    t.ok(!w.lights.some((l) => l.kind === "torch"), "light removed");
    // a station falls when its ground is dug out
    for (let k = 0; k < 20 && W.tileAt(G, gx, gy + 1) !== TILE.AIR; k++) W.hitTile(G, gx, gy + 1, tool("steel_pickaxe"));
    t.ok(!w.objects.some((o) => o.kind === "furnace"), "undermined furnace pops");
    t.ok(w.drops.some((d) => d.item === "furnace"), "into a furnace item");
    // underground torches hang on the cave back wall
    let cx = 0, cy = 0;
    outer: for (let x = 20; x < w.W - 20; x++) for (let y = w.surface[x] + 10; y < w.H - 6; y++) if (W.tileAt(G, x, y) === TILE.AIR && !W.solidAt(G, x - 1, y) && !W.solidAt(G, x + 1, y) && !W.solidAt(G, x, y + 1) && !W.solidAt(G, x, y - 1)) { cx = x; cy = y; break outer; }
    t.ok(cx > 0 && W.canPlace(G, "lantern", cx, cy), "lantern on a cave back wall");
  });

  t.test("objects: bush harvest + regrow, boulder, mushrooms, chest spills", () => {
    const G = t.game(), w = G.world; t.run(G, 5);
    const bush = w.objects.find((o) => o.kind === "bush" && o.x === w.spawn.x - 13);
    t.ok(W.useObject(G, bush) && invCount(G.inv, "berries") >= 2, "berries picked");
    t.ok(!W.useObject(G, bush), "empty bush");
    t.run(G, OBJECT_DEFS.bush.regrow + 120); t.eq(bush.n, 3, "berries regrew");
    const rock = w.objects.find((o) => o.kind === "boulder" && o.x === w.spawn.x - 7);
    let k = 0; while (w.objects.includes(rock) && k++ < 10) W.hitObject(G, rock, HAND);
    t.eq(k, OBJECT_DEFS.boulder.hp, "hands move loose rocks"); t.ok(dropsOf(G, "stone") >= 3, "3 stone");
    const shroom = w.objects.find((o) => o.kind === "mushroom");
    t.ok(W.useObject(G, shroom) && !w.objects.includes(shroom) && w.drops.some((d) => d.item === "mushroom"), "mushroom picked");
    let x = w.spawn.x - 60; while (!W.canPlace(G, "chest", x, W.surfaceAt(G, x) - 1)) x--;
    W.place(G, "chest", x, W.surfaceAt(G, x) - 1);
    const ch = w.objects[w.objects.length - 1];
    invAdd(ch.inv, "gold_ingot", 7); invAdd(ch.inv, "iron_pickaxe", 1, 50);
    W.breakObject(G, ch);
    t.ok(dropsOf(G, "gold_ingot") === 7 && w.drops.some((d) => d.item === "iron_pickaxe" && d.d === 50), "chest contents spill with durability");
  });

  t.test("renewal: forests reseed, natural objects return, all away from the cube", () => {
    const G = t.game(), w = G.world; t.run(G, 5);
    const target = w.treeTarget;
    const px = Math.floor(G.player.x / T);
    const gone = w.trees.filter((tr) => Math.abs(tr.x - px) > 60).slice(0, 12);
    for (const tr of gone) w.trees.splice(w.trees.indexOf(tr), 1);
    const grassTarget = w.natTarget.tallgrass;
    for (const o of w.objects.filter((o) => o.kind === "tallgrass")) w.objects.splice(w.objects.indexOf(o), 1);
    const planted = [], regrown = [];
    G.bus.on("tree:plant", (e) => planted.push(e)); G.bus.on("obj:regrow", (e) => regrown.push(e));
    t.run(G, 24000);
    t.ok(w.trees.length >= target - 2, `trees reseeded ${w.trees.length}/${target}`);
    t.ok(w.trees.length <= target, "never more than the world started with");
    t.ok(planted.length >= 10 && planted.every((e) => e.natural && Math.abs(e.tree.x - px) >= W.RENEW_DIST), "natural saplings, off-screen");
    const tg = w.objects.filter((o) => o.kind === "tallgrass").length;
    t.ok(tg >= Math.min(grassTarget, 20), `tall grass came back: ${tg}/${grassTarget}`);
    t.ok(regrown.filter((e) => e.natural).every((e) => Math.abs(e.obj.x - px) >= W.RENEW_DIST && W.isProtected(G, e.obj.x, e.obj.y) === false), "respawns off-screen, never on the plot");
    for (const o of w.objects) if (OBJECT_DEFS[o.kind].natural) t.ok(isSolid(W.tileAt(G, o.x, o.y + 1)) && W.tileAt(G, o.x, o.y) === TILE.AIR, "respawned " + o.kind + " grounded");
  });

  t.test("renewal: mined ore, clay and sand are owed back and re-form in untouched rock", () => {
    const G = t.game(), w = G.world; t.run(G, 5);
    const codes = [TILE.COAL_ORE, TILE.IRON_ORE, TILE.GOLD_ORE, TILE.CRYSTAL, TILE.CLAY, TILE.SAND];
    const before = codes.map((c) => count(w, c));
    for (const c of codes) {
      let mined = 0;
      for (let i = 0; i < w.tiles.length && mined < 8; i++) {
        if (w.tiles[i] !== c) continue;
        const x = i % w.W, y = (i / w.W) | 0;
        if (W.isProtected(G, x, y)) continue;
        let k = 0; while (w.tiles[i] === c && k++ < 10) W.hitTile(G, x, y, tool("steel_pickaxe"));
        mined++;
      }
      t.eq(w.debt[c], 8, "debt for " + TILE_DEFS[c].id);
    }
    t.ok(codes.every((c, k) => count(w, c) === before[k] - 8), "8 of each mined");
    const save1 = W.save(G);
    t.eq(save1.debt[TILE.IRON_ORE], 8, "debt is saved");
    t.run(G, 900 * 12);
    for (let k = 0; k < codes.length; k++) t.eq(count(w, codes[k]), before[k], TILE_DEFS[codes[k]].id + " fully renewed");
    t.eq(Object.keys(w.debt).length, 0, "nothing owed");
    // renewed tiles obey the depth rules and replaced untouched rock
    for (const [i, c] of w.mods) if (codes.includes(c) && w.base[i] !== c) {
      const x = i % w.W, y = (i / w.W) | 0, r = W.RESPAWN[c];
      if (w.tiles[i] !== c) continue;
      t.ok(r.from.includes(w.base[i]) && y - w.surface[x] >= r.d[0] && y - w.surface[x] <= r.d[1], `renewed ${TILE_DEFS[c].id} at depth ${y - w.surface[x]}`);
    }
    // placed blocks are not owed back
    const { tx, ty } = skyCell(G); W.setTile(G, tx, ty, TILE.SAND);
    W.hitTile(G, tx, ty, tool("steel_pickaxe"));
    t.ok(!w.debt[TILE.SAND], "player-placed sand is not renewed");
  });

  t.test("renewal: bare dirt grows grass again", () => {
    const G = t.game(), w = G.world;
    const x = w.spawn.x - 30, s = W.surfaceAt(G, x);
    t.eq(W.tileAt(G, x, s), TILE.GRASS, "grass column");
    while (W.tileAt(G, x, s) !== TILE.AIR) W.hitTile(G, x, s, HAND);
    t.eq(W.tileAt(G, x, s + 1), TILE.DIRT, "dirt exposed");
    t.run(G, 6000);
    t.eq(W.tileAt(G, x, s + 1), TILE.GRASS, "grass regrew on the exposed dirt");
    // restoring the generated tile removes the diff entry (compact saves)
    W.setTile(G, x, s, TILE.GRASS); W.setTile(G, x, s + 1, TILE.DIRT);
    t.ok(!w.mods.has(s * w.W + x) && !w.mods.has((s + 1) * w.W + x), "restored tiles leave no diff");
  });

  t.test("drops: bounce, magnet, pickup, merge, cap, unstick, despawn", () => {
    const G = t.game(), w = G.world; t.run(G, 20);
    const p = G.player, cx = p.x + p.w / 2;
    w.drops.length = 0;
    W.spawnDrop(G, "flint", 2, cx + 5 * T, p.y);
    t.run(G, 120);
    const d = w.drops[0]; t.ok(d && d.grounded, "a far drop lands");
    t.eq(invCount(G.inv, "flint"), 0, "not picked up from 5 tiles");
    W.spawnDrop(G, "coal", 3, cx + 1.5 * T, p.y);
    t.run(G, 80);
    t.eq(invCount(G.inv, "coal"), 3, "magnet + pickup within reach");
    // merge: several stacks of the same item settle into one
    w.drops.length = 0;
    const fx = cx + 8 * T;
    for (let k = 0; k < 5; k++) { const dr = W.spawnDrop(G, "stone", 2, fx, p.y - 10); dr.vx = 0; }
    t.run(G, 200);
    const st = w.drops.filter((x) => x.item === "stone");
    t.ok(st.length === 1 && st[0].n === 10, "merged into one stack of 10: " + st.map((x) => x.n));
    // tools never merge
    W.spawnDrop(G, "iron_axe", 1, fx, p.y - 10, 30); W.spawnDrop(G, "iron_axe", 1, fx, p.y - 10, 40);
    t.run(G, 200);
    t.eq(w.drops.filter((x) => x.item === "iron_axe").length, 2, "tools keep their own durability");
    // cap
    for (let k = 0; k < 400; k++) W.spawnDrop(G, "dirt", 1, fx + (k % 40) * 40, 5 * T);
    t.ok(w.drops.length <= 180, "drop cap " + w.drops.length);
    // stuck in a tile -> pops up
    w.drops.length = 0;
    const { tx, ty } = skyCell(G); W.setTile(G, tx, ty, TILE.STONE); W.setTile(G, tx, ty + 1, TILE.STONE);
    const sd = W.spawnDrop(G, "gravel", 1, (tx + 0.5) * T, (ty + 1.5) * T);
    t.ok(sd.y + sd.h <= ty * T, "spawned inside stone -> moved on top");
    t.run(G, C.AUTOSAVE_STEPS);
    t.ok(w.drops.length === 1, "still there");
    sd.age = 18000; t.run(G, 2);
    t.eq(w.drops.length, 0, "despawns after 5 minutes");
  });

  t.test("save: compact mods round trip, legacy format, objects, debt", () => {
    const G = t.game(), w = G.world; t.run(G, 5);
    // random edits incl. runs, restores and every code
    const rng = (() => { let a = 7; return () => ((a = (a * 1103515245 + 12345) >>> 0) / 4294967296); })();
    for (let k = 0; k < 3000; k++) {
      const x = 1 + Math.floor(rng() * (w.W - 2)), y = 2 + Math.floor(rng() * (w.H - 6));
      if (W.isProtected(G, x, y)) continue;
      const run = 1 + Math.floor(rng() * 6), c = Math.floor(rng() * TILE_DEFS.length);
      for (let r = 0; r < run && x + r < w.W - 1; r++) W.setTile(G, x + r, y, c);
    }
    const enc = W.encodeMods(w.mods), dec = W.decodeMods(enc);
    t.eq(dec.length, w.mods.size, "decode count");
    t.ok(dec.every(([i, c]) => w.mods.get(i) === c), "decode values");
    const s = makeSave(G), json = JSON.stringify(s);
    t.ok(json.length < 60000, "3000 edits save small: " + json.length);
    const G2 = createGame({ save: JSON.parse(json), headless: true });
    t.eq(worldHash(G2.world), worldHash(w), "tiles identical after load");
    t.eq(G2.world.mods.size, w.mods.size, "same diff size");
    // a long tunnel compresses well
    const G3 = t.game();
    for (let x = 30; x < 330; x++) for (let y = 70; y < 73; y++) W.setTile(G3, x, y, TILE.AIR);
    t.ok(JSON.stringify(W.save(G3).mods).length < 5000, "900-tile tunnel mods: " + JSON.stringify(W.save(G3).mods).length + " chars");
    // legacy v1 save (flat mods array, object records)
    const G4 = t.game(), i0 = 20 * G4.world.W + 100;
    const legacy = { mods: [i0, TILE.BRICK, i0 + 1, TILE.GLASS], trees: [], objects: [{ id: 999, kind: "chest", x: 100, y: 20, hp: 6, t: 0, n: 0, seed: 1, inv: { slots: [["coal", 5]] } }], drops: [["apple", 2, 3200, 600, -1, 10]] };
    W.load(G4, legacy);
    t.ok(G4.world.tiles[i0] === TILE.BRICK && G4.world.tiles[i0 + 1] === TILE.GLASS, "legacy mods load");
    const ch = G4.world.objects.find((o) => o.id === 999);
    t.ok(ch && invCount(ch.inv, "coal") === 5, "legacy chest inventory loads");
    t.ok(G4.world.drops.length === 1 && G4.world.drops[0].item === "apple", "drops load");
    W.load(G4, {}); t.ok(G4.world.tiles[i0] === TILE.BRICK, "partial data keeps the world");
    W.load(G4, { mods: "garbage,,zz", objects: [[1, "nope", 0, 0]], trees: [[1, "palm"]] });
    t.ok(true, "junk ignored");
    // objects + debt + chest inventories survive a full round trip
    const G5 = t.game(); t.run(G5, 5);
    let x = G5.world.spawn.x - 60; while (!W.canPlace(G5, "chest", x, W.surfaceAt(G5, x) - 1)) x--;
    W.place(G5, "chest", x, W.surfaceAt(G5, x) - 1);
    invAdd(G5.world.objects[G5.world.objects.length - 1].inv, "steel_axe", 1, 123);
    G5.world.debt[TILE.GOLD_ORE] = 4;
    const G6 = createGame({ save: JSON.parse(JSON.stringify(makeSave(G5))), headless: true });
    const ch6 = G6.world.objects.find((o) => o.kind === "chest");
    t.ok(ch6 && ch6.inv.slots.some((sl) => sl && sl.id === "steel_axe" && sl.d === 123), "chest tool durability");
    t.eq(G6.world.debt[TILE.GOLD_ORE], 4, "debt");
    t.eq(JSON.stringify(G6.world.objects.map((o) => [o.id, o.kind, o.x, o.y, o.n])), JSON.stringify(G5.world.objects.map((o) => [o.id, o.kind, o.x, o.y, o.n])), "objects identical");
  });

  t.test("whole-sim determinism: same seed + same inputs -> same save", () => {
    const run = () => {
      const G = t.game(4242);
      invAdd(G.inv, "stone_pickaxe", 1); invSelect(G.inv, 0);
      for (let i = 0; i < 9000; i++) {
        const ph = (i >> 8) % 4;
        stepGame(G, (ph === 0 ? B.LEFT : ph === 2 ? B.RIGHT : 0) | ((i & 63) === 0 ? B.JUMP : 0) | (ph === 1 ? B.ACTION | B.DOWN : 0) | (ph === 3 ? B.ACTION : 0));
      }
      const s = makeSave(G); delete s.at; return JSON.stringify(s);
    };
    const a = run(), b = run();
    t.ok(a === b, "identical saves (" + a.length + " bytes)");
    t.ok(JSON.parse(a).stats.mined > 0, "it actually mined something");
  });
}
