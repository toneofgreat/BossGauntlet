// bonusbalance.mjs - INTEGRATE's balance pass for the bonus level: a scripted "fresh player" plays real games
// headless (the same stepGame the browser runs and window.__cube.bonus.step() drives) using only real inputs
// (walk / jump / hold ACTION with a pointer aim / USE) plus the crafting panel's craft() call, and reports how long
// each milestone takes in game time. Also measures gathering rates and estimates a full house-level-20 run.
//   node tools/bonusbalance.mjs [seed ...]      default seeds 1234 77 4321
//   node tools/bonusbalance.mjs --check         exits 1 if the early-game targets are missed (used by bonustests)
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => pathToFileURL(path.join(here, "..", "src", "bonus", p)).href;
const C = await import(src("core/const.js"));
const { createGame, stepGame } = await import(src("core/game.js"));
const { placePlayer } = await import(src("core/player.js"));
const { setDayF, phase } = await import(src("core/time.js"));
const W = await import(src("world/index.js"));
const CR = await import(src("craft/index.js"));
const INV = await import(src("craft/inventory.js"));
const H = await import(src("house/index.js"));
const { HOUSE_LEVELS } = await import(src("data/house.js"));
const { RECIPE } = await import(src("data/recipes.js"));
const { TILE_DEFS, isSolid } = await import(src("data/tiles.js"));
const { ANIMALS } = await import(src("data/animals.js"));

const { T, B_LEFT, B_RIGHT, B_JUMP, B_ACTION, B_USE, B_DOWN } = C;
const args = process.argv.slice(2);
const CHECK = args.includes("--check");
const seeds = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (!seeds.length) seeds.push(1234, 77, 4321);

// ------------------------------------------------------------------------------------------------ the bot
function bot(G) {
  const p = G.player;
  const ptx = () => Math.floor((p.x + p.w / 2) / T), pty = () => Math.floor((p.y + p.h / 2) / T);
  const step = (bits = 0, aim = null) => stepGame(G, bits, aim);
  const run = (n, bits = 0, aim = null) => { for (let i = 0; i < n; i++) step(bits, aim); };
  const has = (id) => INV.invCount(G.inv, id);
  const min = () => G.frame / 3600;
  // walk to column tx (jumping over steps, swimming out of water); false if stuck
  function walkTo(tx, maxSteps = 3000) {
    let stuck = 0, lastX = p.x;
    for (let i = 0; i < maxSteps; i++) {
      const dx = (tx + 0.5) * T - (p.x + p.w / 2);
      if (Math.abs(dx) < 6) { run(4); if (process.env.DBG && i > 600) console.log("  slow walk", tx, (i / 60).toFixed(1) + "s"); return true; }
      const dir = dx > 0 ? B_RIGHT : B_LEFT;
      let bits = dir;
      if (p.inWater || stuck > 6) bits |= B_JUMP;
      // a wall in front: dig through it (tunnels are how you cross a 3+ tile cliff)
      if (stuck > 40) {
        const f = dx > 0 ? 1 : -1, cx = ptx() + f, cy = pty();
        for (const ty of [cy, cy - 1]) if (isSolid(W.tileAt(G, cx, ty)) && W.tileWork(W.tileAt(G, cx, ty), INV.invTool(G.inv)) > 0) { mine(cx, ty, 300); }
        stuck = 0;
      }
      step(bits);
      if (Math.abs(p.x - lastX) < 0.5) stuck++; else stuck = 0;
      lastX = p.x;
      if (p.dead) run(C.DEATH_STEPS + 5);
    }
    if (process.env.DBG) console.log("  walkTo failed", tx, "at", ptx(), pty(), "water", p.inWater, "tiles", [-2,-1,0,1].map((dy) => [-1,0,1].map((dx) => W.tileAt(G, ptx() + dx, pty() + dy)).join(",")).join(" | "));
    return false;
  }
  function collect(r = 6) {
    for (let k = 0; k < 8; k++) {
      const cx = p.x + p.w / 2;
      const d = G.world.drops.filter((d) => Math.abs(d.x - cx) < r * T && Math.abs(d.y - p.y) < 4 * T && d.age >= 0);
      if (!d.length) return;
      d.sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx));
      walkTo(Math.floor((d[0].x + 6) / T), 400); run(20);
    }
  }
  function chop(tree, limit = 2400) {
    const side = p.x / T < tree.x ? -1 : 1;
    walkTo(tree.x + side * (tree.kind === "ancient" ? 2 : 1));
    const aim = { tx: tree.x, ty: tree.y - 1 };
    for (let i = 0; i < limit && tree.stage === 3 && G.world.trees.includes(tree); i++) step(B_ACTION, aim);
    run(40); collect(5);
  }
  function mine(tx, ty, limit = 900) {
    for (let i = 0; i < limit; i++) {
      const c = W.tileAt(G, tx, ty);
      if (!isSolid(c) || TILE_DEFS[c].pick >= 99) return true;
      if (W.tileWork(c, INV.invTool(G.inv)) <= 0) return false;
      const r = W.hitTile ? null : null; void r;
      if (Math.hypot((tx + 0.5) * T - (p.x + p.w / 2), (ty + 0.5) * T - (p.y + p.h / 2)) > C.REACH_POINTER * T) return false;
      const before = G.stats.mined;
      step(B_ACTION, { tx, ty });
      if (G.target && G.target.kind !== "tile") return true;
      void before;
    }
    return false;
  }
  function select(id) { const i = G.inv.slots.findIndex((s) => s && s.id === id); if (i < 0) return false; if (i >= INV.HOTBAR) { INV.invMove(G.inv, i, G.inv, 8); INV.invSelect(G.inv, 8); } else INV.invSelect(G.inv, i); return true; }
  function bestTool(type) { let b = null, bt = 0; G.inv.slots.forEach((s) => { const it = s && INV.invTool && s.id; if (!it) return; const m = /^(wood|stone|iron|steel)_(\w+)$/.exec(s.id); if (m && m[2] === type) { const t = ["wood", "stone", "iron", "steel"].indexOf(m[1]) + 1; if (t > bt) { bt = t; b = s.id; } } }); return b; }
  function useTool(type) { const id = bestTool(type); if (id) select(id); else INV.invSelect(G.inv, 8 - 0) ; return id; }
  function place(id) {
    // put it in front of the cube (USE with it selected)
    if (!select(id)) return false;
    for (let k = 0; k < 6; k++) {
      step(0);
      if (G.target && G.target.place) { step(B_USE); step(0); return G.world.objects.some((o) => o.kind === id); }
      walkTo(ptx() + (k % 2 ? 3 : -3), 200);
    }
    return false;
  }
  const craft = (id, n = 1) => CR.craft(G, id, n);
  function nearestTree(kinds = ["oak", "birch", "pine"]) {
    let b = null; const x = p.x / T;
    for (const t of G.world.trees) if (t.stage === 3 && kinds.includes(t.kind) && Math.abs(t.x - G.world.houseX) > 0 && (!b || Math.abs(t.x - x) < Math.abs(b.x - x))) b = t;
    return b;
  }
  // dig a staircase down/forward from the current column collecting what comes out, then walk back up
  function staircase(dir, depth, stay = false) {
    const x0 = ptx(), f0 = G.frame;
    for (let d = 0; d < depth; d++) {
      const x = ptx(), fy = Math.floor((p.y + p.h - 1) / T);
      mine(x + dir, fy); mine(x + dir, fy + 1);
      for (let n = 0; n < 200 && ((x + dir + 0.5) * T - (p.x + p.w / 2)) * dir > 1.5; n++) step(dir > 0 ? B_RIGHT : B_LEFT);
      run(12);
      // ore in reach: take it
      for (let ty = pty() - 3; ty <= pty() + 3; ty++) for (let tx = ptx() - 3; tx <= ptx() + 3; tx++) {
        const c = TILE_DEFS[W.tileAt(G, tx, ty)];
        if (c && /ore|crystal|clay/.test(c.id) && W.tileWork(W.tileAt(G, tx, ty), INV.invTool(G.inv)) > 0) { mine(tx, ty); run(20); }
      }
      if (p.dead) break;
    }
    run(30);
    const f1 = G.frame; if (!stay) walkTo(x0, 4000);
    if (process.env.DBG) console.log("  staircase", depth, "dig", ((f1 - f0) / 60).toFixed(1) + "s", "back", ((G.frame - f1) / 60).toFixed(1) + "s", "stone", has("stone"));
  }
  function eatSomething() {
    if (p.hunger > 70 && p.hp > p.maxHp * 0.6) return;
    const i = G.inv.slots.findIndex((s) => s && /cooked|steak|roast|grilled|apple|berries|jerky|stew/.test(s.id));
    if (i >= 0) CR.eat(G, i);
  }
  // fight / hunt: chase the nearest animal matching filter, swing when in reach
  function fight(filter, maxSteps = 3600, weapon = "sword") {
    let kills = 0;
    for (let i = 0; i < maxSteps; i++) {
      const cx = p.x + p.w / 2;
      const list = G.animals.filter((a) => filter(a) && a.hp > 0 && Math.abs(a.x - cx) < 30 * T);
      if (!list.length) { step(0); continue; }
      list.sort((a, b) => Math.abs(a.x - cx) - Math.abs(b.x - cx));
      const a = list[0], ax = a.x + a.w / 2, dx = ax - cx, dist = Math.abs(dx) / T;
      if (!bestTool(weapon) || !useTool(weapon)) useTool("sword") || useTool("spear") || useTool("axe");
      let bits = dist > 1.2 ? (dx > 0 ? B_RIGHT : B_LEFT) : 0;
      if (p.vx === 0 && dist > 1.2 && p.grounded && (i & 15) === 0) bits |= B_JUMP;
      const aim = dist < 3 ? { tx: Math.floor(ax / T), ty: Math.floor((a.y + a.h / 2) / T) } : null;
      if (dist < 2.2) bits |= B_ACTION;
      const hp0 = G.stats.hunted;
      step(bits, aim);
      if (G.stats.hunted > hp0) { kills++; run(30); collect(4); }
      if (p.dead) return { kills, fainted: true };
    }
    return { kills, fainted: false };
  }
  return { ptx, pty, step, run, has, min, walkTo, collect, chop, mine, select, bestTool, useTool, place, craft, nearestTree, staircase, eatSomething, fight };
}

// ------------------------------------------------------------------------------------------------ the playthrough
function earlyGame(seed) {
  const G = createGame({ seed, headless: true });
  const b = bot(G), p = G.player, out = { seed };
  const mark = (k) => { out[k] = +(b.min()).toFixed(2); };
  let hurt = 0, faints = 0;
  G.bus.on("player:hurt", (d) => { hurt += d.dmg; });
  G.bus.on("player:die", () => { faints++; });
  G.bus.on("craft", (d) => { if (d.id === "stone_pickaxe" && out.stonePickAt == null) out.stonePickAt = +(b.min()).toFixed(2); });
  // 1) wood by hand
  while (b.has("wood") < 26) { const t = b.nearestTree(); if (!t) break; b.chop(t); }
  mark("wood26");
  b.craft("workbench"); b.place("workbench"); mark("workbench");
  b.craft("stick", 2);
  b.craft("wood_pickaxe"); b.craft("wood_axe"); mark("woodTools"); b.craft("wood_pickaxe");
  // 2) stone: dig a staircase down from next to the workbench
  b.useTool("pickaxe");
  const wbx = G.world.objects.find((o) => o.kind === "workbench").x;
  let tries = 0;
  b.walkTo(wbx - 2);
  // dig west in chunks; whenever the pickaxe is gone (or 3+ stone for an upgrade) go back up and craft a better one
  let sx = wbx - 2;
  while (b.has("stone") < 26 && tries++ < 12) {
    if (!b.bestTool("pickaxe") || (b.bestTool("pickaxe") === "wood_pickaxe" && b.has("stone") >= 3)) {
      if (!b.walkTo(wbx, 1500)) { H.goHome(G); out.wentHome = (out.wentHome || 0) + 1; b.walkTo(wbx, 3000); }
      if (b.has("stick") < 2) b.craft("stick", 1);
      if (!b.craft("stone_pickaxe")) b.craft("wood_pickaxe");
      b.walkTo(sx, 2000);
    }
    b.useTool("pickaxe"); b.staircase(-1, 6, true); sx = b.ptx();
    if (process.env.DBG) console.log("  iter", tries, (G.frame / 3600).toFixed(2), "min", "pick", b.bestTool("pickaxe"), "stone", b.has("stone"), "at", b.ptx(), b.pty());
  }
  if (!b.walkTo(wbx, 1500)) { H.goHome(G); out.wentHome = (out.wentHome || 0) + 1; b.walkTo(wbx, 3000); } mark("stone20");
  while (b.has("wood") < 3) { const t = b.nearestTree(); if (!t) break; b.useTool("axe"); b.chop(t); }
  b.walkTo(wbx, 1500);
  b.craft("stick", 2);
  if (!b.has("stone_pickaxe")) b.craft("stone_pickaxe");
  if (b.pty() > W.surfaceAt(G, b.ptx()) + 2) { H.goHome(G); b.walkTo(wbx, 1500); }
  b.craft("stone_axe"); b.craft("stone_sword");
  out.stoneTools = out.stonePickAt != null ? out.stonePickAt : null; out.stoneSword = !!b.has("stone_sword");
  b.craft("campfire");
  // 3) lean-to: fiber from tall grass, wood
  const up = () => { if (b.pty() > W.surfaceAt(G, b.ptx()) + 2) { H.goHome(G); out.wentHome = (out.wentHome || 0) + 1; } };
  up();
  const fib0 = G.frame;
  for (let k = 0; k < 30 && b.has("fiber") < 6; k++) {
    const g = G.world.objects.filter((o) => (o.kind === "tallgrass" || o.kind === "flowers")).sort((a, c) => Math.abs(a.x - p.x / T) - Math.abs(c.x - p.x / T))[0];
    if (!g) break; b.walkTo(g.x + 1); b.useTool("axe"); for (let i = 0; i < 200 && G.world.objects.includes(g); i++) b.step(B_ACTION, { tx: g.x, ty: g.y }); b.run(30); b.collect(3);
  }
  out.fiberMin = +((G.frame - fib0) / 3600).toFixed(2);
  while (b.has("wood") < 14) { const t = b.nearestTree(); if (!t) break; b.useTool("axe"); b.chop(t); }
  b.walkTo(G.world.houseX + 12);
  if (H.canUpgrade(G).ok) H.upgrade(G);
  out.house1 = G.house.level >= 1 ? +(b.min()).toFixed(2) : null;
  up();
  // campfire next to home
  b.walkTo(G.world.houseX - 3); b.place("campfire");
  // 4) hunt until dusk
  const preyK = (a) => ["rabbit", "deer", "pheasant", "boar", "goat"].includes(a.kind);
  let kills = 0;
  while (phase(G) !== "dusk" && phase(G) !== "night" && G.time.day === 1) {
    const r = b.fight(preyK, 600); kills += r.kills;
    if (!G.animals.some(preyK)) { const t = b.nearestTree(); if (t) { b.useTool("axe"); b.chop(t); } }
  }
  out.huntKills = kills;
  out.meat = G.inv.slots.filter((s) => s && /^raw_|big_meat/.test(s.id)).reduce((a, s) => a + s.n, 0);
  out.firstMeat = kills ? true : false;
  // cook at the campfire
  b.walkTo(G.world.houseX - 1);
  const cooked = CR.cookAll(G); out.cooked = cooked;
  b.eatSomething();
  out.dusk = +(b.min()).toFixed(2);
  out.hungerAtDusk = Math.round(p.hunger);
  // 5) the first night: "reasonable play" = stay at the campfire and fight what comes close
  const f0 = faints; let minHp = p.hp;
  const night0 = G.frame;
  G.bus.on("player:hurt", () => { minHp = Math.min(minHp, p.hp); });
  while ((phase(G) === "dusk" || phase(G) === "night") && G.frame - night0 < 36000) {
    const near = G.animals.find((a) => a.kind === "wolf" && Math.abs(a.x - p.x) < 3 * T);
    if (near) b.fight((a) => a === near, 120); else { b.walkTo(G.world.houseX - 1, 60); b.step(0); }
    b.eatSomething();
  }
  out.nightFaints = faints - f0; out.nightMinHp = Math.round(minHp); out.dawnHp = Math.round(p.hp);
  out.wolvesSeen = G.stats.hunted;
  out.totalHurt = Math.round(hurt);
  out.day2 = +(b.min()).toFixed(2);
  return { out, G };
}

// gathering rates with each tier (game seconds per unit), measured by doing it for real
function rates(seed) {
  const R = {};
  for (const [tier, axe, pick] of [["hand", null, null], ["wood", "wood_axe", "wood_pickaxe"], ["stone", "stone_axe", "stone_pickaxe"], ["iron", "iron_axe", "iron_pickaxe"], ["steel", "steel_axe", "steel_pickaxe"]]) {
    const G = createGame({ seed, headless: true }), b = bot(G);
    if (axe) { INV.invAdd(G.inv, axe, 1); INV.invAdd(G.inv, pick, 1); }
    // wood: chop 6 trees incl. walking
    let f0 = G.frame, w0 = b.has("wood");
    for (let k = 0; k < 6; k++) { const t = b.nearestTree(); if (!t) break; if (axe) b.select(axe); b.chop(t); }
    const wood = b.has("wood") - w0, woodS = (G.frame - f0) / 60;
    // stone: staircase
    if (pick) {
      b.select(pick); f0 = G.frame; const s0 = b.has("stone") + b.has("coal") + b.has("iron_ore");
      b.staircase(-1, 14);
      const st = b.has("stone") + b.has("coal") + b.has("iron_ore") - s0;
      R[tier] = { woodPerMin: +(wood / woodS * 60).toFixed(1), stonePerMin: +(st / ((G.frame - f0) / 60) * 60).toFixed(1) };
    } else R[tier] = { woodPerMin: +(wood / woodS * 60).toFixed(1) };
  }
  return R;
}

// the whole house: total raw needs (tools + stations included roughly) -> estimated hours at measured rates
function houseTotals() {
  const raw = {};
  const add = (id, n) => { raw[id] = (raw[id] || 0) + n; };
  const expand = (id, n, depth = 0) => {
    const rec = Object.values(RECIPE).find((r) => r.out[0] === id && !/^cook_/.test(r.id) && r.station !== "campfire");
    const base = ["wood", "stone", "fiber", "dirt", "sand", "clay", "coal", "iron_ore", "gold_ore", "crystal", "hide", "bear_hide", "fang", "berries", "apple", "feather", "flint", "gravel"];
    if (!rec || base.includes(id) || depth > 5) { add(id, n); return; }
    const times = Math.ceil(n / rec.out[1]);
    for (const k in rec.cost) expand(k, rec.cost[k] * times, depth + 1);
  };
  for (const L of HOUSE_LEVELS) for (const k in L.cost) expand(k, L.cost[k]);
  for (const t of ["wood_hammer", "stone_hammer", "iron_hammer", "steel_hammer", "iron_pickaxe", "steel_pickaxe", "steel_axe", "iron_sword"]) expand(t, 1);
  return raw;
}

// ------------------------------------------------------------------------------------------------ main
const results = [];
for (const s of seeds) {
  const t0 = Date.now();
  const { out } = earlyGame(s);
  out.ms = Date.now() - t0;
  results.push(out);
  console.log(JSON.stringify(out));
}
const R = rates(seeds[0]);
console.log("rates (seed " + seeds[0] + "):", JSON.stringify(R));
const need = houseTotals();
console.log("house 1-20 raw needs (incl. hammers + main tools):", JSON.stringify(need));
// estimate: wood at iron-axe rate, stone at iron-pick rate; ore needs digging ~ (tiles mined per ore found) -> use
// stone rate x the ore's rarity among stone at its depth (measured on the generated world)
const G0 = createGame({ seed: seeds[0], headless: true });
const cnt = {}; let deep = 0;
for (let y = 0; y < G0.world.H; y++) for (let x = 0; x < G0.world.W; x++) { const c = TILE_DEFS[G0.world.tiles[y * G0.world.W + x]]; if (!c) continue; cnt[c.id] = (cnt[c.id] || 0) + 1; if (y > G0.world.surface[x] + 3 && isSolid(G0.world.tiles[y * G0.world.W + x])) deep++; }
const minutes = {
  wood: (need.wood || 0) / R.iron.woodPerMin,
  stone: (need.stone || 0) / R.iron.stonePerMin,
  // ores: one ore tile per (solid tiles / ore tiles) mined, but caves + visible seams make it ~4x better than blind
  coal: (need.coal || 0) / 2 * (deep / cnt.coal_ore) / 4 / R.iron.stonePerMin,
  iron: (need.iron_ore || 0) * (deep / cnt.iron_ore) / 4 / R.iron.stonePerMin,
  gold: (need.gold_ore || 0) * (deep / cnt.gold_ore) / 6 / R.steel.stonePerMin,
  crystal: (need.crystal || 0) * (deep / cnt.crystal) / 8 / R.steel.stonePerMin,
};
const gatherMin = Object.values(minutes).reduce((a, b) => a + b, 0);
console.log("world tiles:", JSON.stringify({ coal: cnt.coal_ore, iron: cnt.iron_ore, gold: cnt.gold_ore, crystal: cnt.crystal, sand: cnt.sand, clay: cnt.clay }));
console.log("estimated gathering minutes by resource:", JSON.stringify(Object.fromEntries(Object.entries(minutes).map(([k, v]) => [k, Math.round(v)]))));
// add travel, hunting/eating, nights (sleep skips them), smelting/crafting clicks: x1.6
console.log(`estimated house level 20: ~${(gatherMin * 1.6 / 60).toFixed(1)} h of play (gathering ${Math.round(gatherMin)} min x1.6 overhead)`);

if (CHECK) {
  let bad = 0;
  for (const r of results) {
    if (!(r.woodTools && r.woodTools < 4)) { console.log("CHECK FAIL seed " + r.seed + ": first wooden tools took " + r.woodTools + " min"); bad++; }
    if (!(r.stoneTools && r.stoneTools < 8)) { console.log("CHECK FAIL seed " + r.seed + ": stone tools took " + r.stoneTools + " min"); bad++; }
    if (r.nightFaints > 0) { console.log("CHECK FAIL seed " + r.seed + ": fainted in the first night"); bad++; }
  }
  console.log(bad ? `BALANCE CHECK FAILED (${bad})` : "BALANCE CHECK OK");
  process.exit(bad ? 1 : 0);
}
