// creatures.mjs - CREATURES headless tests (BONUS.md 12): animal table, spawn rules (biome / time / caps / light /
// lamps / walls), every behaviour, combat math, knockback + i-frames, drops, arrows, balance, save, 20k-step bounds.
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (p) => pathToFileURL(path.join(here, "..", "..", "src", "bonus", p)).href;

const { ANIMAL_DEFS, ANIMAL_KINDS, HOSTILE, SPAWN } = await import(src("data/animals.js"));
const { ITEMS, toolOf, HAND } = await import(src("data/items.js"));
const { BIOMES, TILE } = await import(src("data/tiles.js"));
const cr = await import(src("creatures/index.js"));
const sp = await import(src("creatures/spawn.js"));
const { surfaceAt } = await import(src("world/index.js"));
const { setDayF, phase } = await import(src("core/time.js"));
const { placePlayer } = await import(src("core/player.js"));
const { invAdd, invCount } = await import(src("craft/inventory.js"));
const { setLevel } = await import(src("house/index.js"));
const { createGame, stepGame, makeSave } = await import(src("core/game.js"));

export default async function (t) {
  const { B, T } = t;
  // no random spawns, no animals: a clean stage for one behaviour
  const quiet = (G) => { G.creatureState.spawnT = -1e9; G.animals.length = 0; return G; };
  // a flat dry test arena: columns [tx-6, tx+len+6) rebuilt as grass over dirt at the surface row of tx (behaviour
  // tests must not depend on how WORLD shapes the terrain there). Stands the cube at tx. -> tx
  const stage = (G, tx, len = 12) => {
    const w = G.world; let S = surfaceAt(G, tx);
    S = Math.max(20, Math.min(w.H - 20, S));
    for (let x = tx - 6; x < tx + len + 6; x++) for (let y = 0; y < S + 6; y++) w.tiles[y * w.W + x] = y < S ? TILE.AIR : y === S ? TILE.GRASS : TILE.DIRT;
    w.objects = w.objects.filter((o) => o.x < tx - 8 || o.x > tx + len + 8);
    t.standAt(G, tx);
    return tx;
  };
  const put = (G, kind, tx) => cr.spawnAnimal(G, kind, tx, surfaceAt(G, tx) - 1);
  const tile = (a) => (a.x + a.w / 2) / T;
  const pdx = (G, a) => (a.x + a.w / 2 - (G.player.x + G.player.w / 2)) / T;
  const events = (G) => { const ev = {}; G.bus.on("*", (ty) => { ev[ty] = (ev[ty] || 0) + 1; }); return ev; };
  const hold = (G, id) => { G.inv.slots[0] = null; if (id) invAdd(G.inv, id, 1); G.inv.sel = 0; };
  // player AI for fights: walk to the animal, face it, hold ACTION when close
  const fight = (G, a, n = 3000, range = 70) => {
    for (let i = 0; i < n && G.animals.includes(a) && !G.player.dead; i++) {
      const p = G.player, ax = a.x + a.w / 2, px = p.x + p.w / 2;
      let bits = 0;
      if (Math.abs(ax - px) > 40) bits |= ax > px ? B.RIGHT : B.LEFT; else p.facing = ax > px ? 1 : -1;
      if (Math.abs(ax - px) < range) bits |= B.ACTION;
      stepGame(G, bits);
    }
    return { won: !G.animals.includes(a), hp: G.player.hp, dead: G.player.dead };
  };

  t.test("animal table: fields, drops, biomes, hostiles", () => {
    t.eq(ANIMAL_KINDS.length, 8, "8 kinds");
    for (const k of ["rabbit", "pheasant", "deer", "goat", "boar", "wolf", "bear", "fish"]) t.ok(ANIMAL_DEFS[k], "kind " + k);
    for (const k of ANIMAL_KINDS) {
      const d = ANIMAL_DEFS[k];
      for (const f of ["name", "hp", "w", "h", "speed", "ai", "sight", "dmg", "kb", "cd", "drops", "biomes", "time", "cap", "group", "weight", "sound"]) t.ok(d[f] !== undefined, `${k}.${f}`);
      for (const [id, lo, hi, ch] of d.drops) t.ok(ITEMS[id] && lo >= 1 && hi >= lo && ch > 0 && ch <= 1, `${k} drop ${id}`);
      for (const b of d.biomes) t.ok(BIOMES.includes(b), `${k} biome ${b}`);
      t.ok(d.w < 64 && d.h < 64 && d.speed < 8, `${k} size/speed sane`);
      t.ok(!HOSTILE[k] || d.dmg > 0 && d.cd > 0, `${k} hostile deals damage`);
      t.ok(HOSTILE[k] || d.dmg === 0, `${k} harmless deals none`);
      t.ok(d.group[0] >= 1 && d.group[1] >= d.group[0] && d.cap >= d.group[0], `${k} group fits cap`);
    }
    t.ok(ANIMAL_DEFS.wolf.time === "night" && ANIMAL_DEFS.rabbit.time === "day", "wolves hunt at night, rabbits by day");
    t.ok(ANIMAL_DEFS.boar.windup >= 30, "boar charge is clearly telegraphed");
  });

  t.test("combat math: damage, armor, sneak, spear fishing, knockback", () => {
    const sw = (tier) => toolOf(["", "wood", "stone", "iron", "steel"][tier] + "_sword");
    t.eq(cr.damageFor(sw(2), "boar"), 8, "stone sword vs boar (armor 1)");
    t.eq(cr.damageFor(sw(2), "wolf"), 9, "stone sword vs wolf");
    t.eq(cr.damageFor(HAND, "bear"), 1, "hands barely scratch a bear (min 1)");
    t.eq(cr.damageFor(sw(3), "bear"), 14 - ANIMAL_DEFS.bear.armor, "iron sword vs bear");
    t.eq(cr.damageFor(sw(2), "deer", { sleeping: true }), 18, "sneak attack x2");
    t.eq(cr.damageFor(toolOf("wood_spear"), "fish"), 8, "spear fishing x1.5");
    t.ok(cr.damageFor({ dmg: 7, type: "bow" }, "bear", { arrow: true }) > cr.damageFor({ dmg: 7, type: "bow" }, "bear"), "arrows half-pierce armor");
    t.eq(cr.hitsToKill(sw(2), "boar"), 4, "stone sword: boar in 4");
    t.ok(cr.hitsToKill(sw(2), "bear") >= 2 * cr.hitsToKill(sw(3), "bear"), "iron sword at least twice as good on a bear");
    t.ok(cr.knockbackFor(toolOf("steel_hammer")) > cr.knockbackFor(toolOf("wood_sword")), "hammers knock back hardest");
    t.eq(cr.maxTargets(sw(1)), 3, "sword cleaves 3"); t.eq(cr.maxTargets(toolOf("stone_axe")), 1, "axe 1");
  });

  t.test("hitAnimal: hp, knockback away, resist, i-frames, events", () => {
    const G = quiet(t.game()); const x = stage(G, 420);
    const r = put(G, "rabbit", x + 3), b = put(G, "bear", x - 4);
    t.run(G, 20);
    const ev = events(G), px = G.player.x + G.player.w / 2;
    t.ok(!cr.hitAnimal(G, r, 2, px, 6), "survives 2 dmg");
    t.eq(r.hp, 4, "hp 6 -> 4"); t.ok(r.vx > 3, "knocked away from the source"); t.ok(r.invT > 0 && r.hurtT > 0, "i-frames + flash");
    cr.hitAnimal(G, b, 2, px, 6);
    t.ok(b.vx > -2 && b.vx < 0, "bear barely budges (kbResist), pushed left: " + b.vx);
    t.eq(ev["animal:hit"], 2, "animal:hit events");
    // a swing while the animal is still invulnerable does not land
    const rect = { x0: r.x - 5, y0: r.y - 5, x1: r.x + r.w + 5, y1: r.y + r.h + 5 };
    t.eq(cr.meleeHit(G, rect, toolOf("wood_sword"), 1), 0, "i-frames block a double hit");
    r.invT = 0;
    t.eq(cr.meleeHit(G, rect, toolOf("wood_sword"), 1), 1, "lands after i-frames");
    t.ok(!G.animals.includes(r), "rabbit defeated (6 dmg)");
    t.eq(ev["animal:die"], 1, "animal:die");
  });

  t.test("death: puff + drops in the world, stats, no animal left", () => {
    const G = quiet(t.game()); const x = stage(G, 420);
    const deer = put(G, "deer", x + 1);
    let die = null; G.bus.on("animal:die", (e) => { die = e; });
    const drops0 = G.world.drops.length, h0 = G.stats.hunted;
    t.ok(cr.hitAnimal(G, deer, 999, G.player.x, 3), "died");
    t.ok(die && die.kind === "deer" && isFinite(die.x) && isFinite(die.y), "animal:die {a, x, y, kind}");
    const got = G.world.drops.slice(drops0).map((d) => d.item);
    t.ok(got.filter((i) => i === "raw_venison").length >= 1, "venison dropped");
    t.ok(got.includes("hide"), "hide dropped");
    t.eq(G.stats.hunted, h0 + 1, "stats.hunted");
    t.run(G, 200);
    t.ok(invCount(G.inv, "raw_venison") >= 2, "drops picked up (" + invCount(G.inv, "raw_venison") + ")");
  });

  t.test("drop tables: chances and counts over many rolls", () => {
    const G = t.game(), N = 4000;
    for (const k of ANIMAL_KINDS) {
      const tot = {};
      for (let i = 0; i < N; i++) for (const [id, n] of cr.rollDrops(G, k)) tot[id] = (tot[id] || 0) + n;
      for (const [id, lo, hi, ch] of ANIMAL_DEFS[k].drops) t.near(tot[id] / N, ch * (lo + hi) / 2, 0.05 + 0.03 * hi, `${k} ${id} avg`);
    }
    for (const k of ANIMAL_KINDS) t.ok(ANIMAL_DEFS[k].drops.some((d) => ITEMS[d[0]].food || d[0] === "hide" || d[0] === "feather"), k + " gives food or hide");
    t.ok(ANIMAL_DEFS.rabbit.drops[0][0] === "raw_small_meat" && ITEMS.raw_small_meat.food, "hunting gives food");
  });

  t.test("spawning: caps, total cap, biome, time of day", () => {
    for (const [tx, f] of [[415, 0.3], [415, 0.85], [540, 0.3], [540, 0.85], [650, 0.3], [60, 0.3], [330, 0.3]]) {
      const G = t.game(); setDayF(G, f); placePlayer(G, tx, surfaceAt(G, tx) - 1);
      const bad = [];
      G.bus.on("animal:spawn", (e) => {
        const a = e.a, d = ANIMAL_DEFS[a.kind], c = Math.floor((a.x + a.w / 2) / T), night = phase(G) === "night";
        if (d.ai !== "swim" && !d.biomes.includes(BIOMES[G.world.biome[c]])) bad.push(a.kind + " in " + BIOMES[G.world.biome[c]]);
        if (!sp.timeOk(d, night)) bad.push(a.kind + " at the wrong time");
        const dist = Math.abs(c - (G.player.x + 13) / T);
        if (dist < (d.ai === "swim" ? SPAWN.fishMinDist : SPAWN.minDist) - 1 || dist > SPAWN.maxDist + 9) bad.push(a.kind + " at dist " + dist.toFixed(1));
        if (d.ai === "swim" && !a.inWater && !G.world.tiles[Math.floor((a.y + a.h / 2) / T) * G.world.W + c] === TILE.WATER) bad.push("dry fish");
      });
      let over = 0;
      for (let i = 0; i < 5000; i++) {
        stepGame(G, 0);
        if (G.player.dead) continue;
        if (G.animals.length > SPAWN.maxTotal) over++;
        for (const k of ANIMAL_KINDS) if (sp.countKind(G, k) > ANIMAL_DEFS[k].cap) over++;
      }
      t.eq(over, 0, `caps hold at ${tx} f=${f}`);
      t.eq(bad.length, 0, `spawn rules at ${tx} f=${f}: ${bad.slice(0, 3).join(", ")}`);
      t.ok(G.animals.length > 0, `something lives near ${tx} f=${f}`);
    }
  });

  t.test("spawning: day is safe-ish, night brings wolves (pairs on night 1)", () => {
    const G = t.game(); setDayF(G, 0.2); placePlayer(G, 415, surfaceAt(G, 415) - 1);
    const seen = {}; G.bus.on("animal:spawn", (e) => { seen[e.a.kind] = 1; });
    t.run(G, 5000);
    t.ok(!seen.wolf && !seen.bear, "no wolves / bears around the meadow by day");
    t.ok(seen.rabbit || seen.deer || seen.pheasant, "meadow game animals by day");
    t.eq(G.player.hp, G.player.maxHp, "a day standing in the meadow is safe");
    const N = t.game(); setDayF(N, 0.75); placePlayer(N, 540, surfaceAt(N, 540) - 1);
    let maxW = 0; N.bus.on("animal:spawn", (e) => { if (e.a.kind === "wolf") t.ok(e.a.pack > 0, "wolf has a pack"); });
    for (let i = 0; i < 4000; i++) { stepGame(N, 0); maxW = Math.max(maxW, sp.countKind(N, "wolf")); }
    t.ok(maxW >= 2, "wolves at night: " + maxW); t.ok(maxW <= 2, "night 1 wolves are a pair at most: " + maxW);
    t.eq(sp.capOf({ time: { day: 5 } }, "wolf"), ANIMAL_DEFS.wolf.cap, "full packs later");
    // at dawn they leave
    setDayF(N, 0.01); t.run(N, 1800);
    t.eq(sp.countKind(N, "wolf"), 0, "wolves gone after dawn");
  });

  t.test("spawning: wolves never in light, near a lamp-lit house or in a walled plot", () => {
    const G = t.game(); setDayF(G, 0.8); G.time.day = 9;
    const home = G.world.houseX + 12;
    setLevel(G, 10);   // lamps
    let near = 0;
    for (let i = 0; i < 400; i++) {
      quiet(G); G.creatureState.spawnT = 0; placePlayer(G, home + G.rng.int(-30, 30), surfaceAt(G, home) - 1);
      sp.trySpawn(G, (g, k, x, y) => cr.spawnAnimal(g, k, Math.floor((x + ANIMAL_DEFS[k].w / 2) / T), Math.floor((y + ANIMAL_DEFS[k].h) / T) - 1), { night: true });
      for (const a of G.animals) if (a.kind === "wolf" && Math.abs(tile(a) - home) < SPAWN.homeSafe + 11) near++;
    }
    t.eq(near, 0, "no wolves spawn within homeSafe of a lamp-lit house");
    // a light (campfire) far from home: no wolf spawns in its glow
    const H = t.game(); setDayF(H, 0.8); H.time.day = 9;
    const lx = 520; H.world.lights = [{ x: (lx + 0.5) * T, y: surfaceAt(H, lx) * T, r: 7, kind: "campfire", id: 1 }];
    let lit = 0, any = 0;
    for (let i = 0; i < 600; i++) {
      quiet(H); placePlayer(H, lx + (i % 2 ? 28 : -28), surfaceAt(H, lx) - 1);
      sp.trySpawn(H, (g, k, x, y) => { const a = cr.spawnAnimal(g, k, Math.floor((x + ANIMAL_DEFS[k].w / 2) / T), Math.floor((y + ANIMAL_DEFS[k].h) / T) - 1); return a; }, { night: true });
      for (const a of H.animals) if (a.kind === "wolf") { any++; if (Math.abs(tile(a) - lx) < 7) lit++; }
    }
    t.ok(any > 0, "wolves do spawn elsewhere: " + any); t.eq(lit, 0, "never in the campfire glow");
  });

  t.test("flee: rabbits bolt and zig-zag, deer outrun, sleepers can be sneaked up on", () => {
    const G = quiet(t.game()); const x = stage(G, 420, 30);
    const r = put(G, "rabbit", x + 3);
    t.run(G, 5);
    let fled = false, hops = 0;
    for (let i = 0; i < 120; i++) { stepGame(G, 0); if (r.state === "flee") fled = true; if (r.vy < -2.5) hops++; }
    t.ok(fled, "rabbit flees a close cube"); t.ok(Math.abs(pdx(G, r)) > 5, "rabbit got away: " + pdx(G, r).toFixed(1)); t.ok(hops > 3, "hops while running");
    // deer: faster than the cube
    const D = quiet(t.game()); const dx = stage(D, 420, 40);
    const deer = put(D, "deer", dx + 6); t.run(D, 5);
    t.run(D, 240, B.RIGHT);
    t.ok(pdx(D, deer) > 4, "running cube cannot catch a deer: " + pdx(D, deer).toFixed(1));
    // night: deer sleeps; a still cube does not wake it, a sneak attack hits x2
    const N = quiet(t.game()); const nx = stage(N, 420, 12); setDayF(N, 0.8);
    const sd = put(N, "deer", nx + 7); t.run(N, 150);
    t.eq(sd.state, "sleep", "deer sleeps at night");
    hold(N, "stone_sword");
    for (let i = 0; i < 200 && pdx(N, sd) > 2.55; i++) stepGame(N, B.RIGHT);
    t.run(N, 12);
    t.eq(sd.state, "sleep", "creeping up does not wake it");
    t.run(N, 1, B.ACTION);
    t.eq(sd.hp, 20 - 18, "sneak attack x2 on a sleeper");
    t.ok(sd.state === "flee", "and it wakes up running");
  });

  t.test("flutter: pheasants take off in arcs", () => {
    const G = quiet(t.game()); const x = stage(G, 420, 24);
    const ph = put(G, "pheasant", x + 3); t.run(G, 3);
    let air = 0, flut = 0;
    for (let i = 0; i < 200; i++) { stepGame(G, 0); if (!ph.grounded) air++; if (ph.state === "flutter") flut++; }
    t.ok(flut > 20 && air > 20, `pheasant flutters (${flut} steps)`);
    t.ok(Math.abs(pdx(G, ph)) > 5, "and gets away");
  });

  t.test("provoked: goats are calm until hit, then butt back", () => {
    const G = quiet(t.game()); const x = stage(G, 40, 12);
    const g = put(G, "goat", x + 2); t.run(G, 10);
    const ev = events(G); let hurt = 0; G.bus.on("player:hurt", (e) => { if (e.cause === "goat") hurt += e.dmg; });
    t.run(G, 300);
    t.eq(hurt, 0, "calm goat never attacks");
    cr.hitAnimal(G, g, 1, G.player.x + 13, 0);
    t.ok(g.state === "chase" && g.aggroT > 0, "provoked");
    t.run(G, 400);
    t.ok(ev["animal:windup"] >= 1 && hurt > 0, `butts back (windup ${ev["animal:windup"]}, ${hurt} dmg)`);
  });

  t.test("charge: boar telegraphs, rams in a line, skids, can be jumped", () => {
    const G = quiet(t.game()); const x = stage(G, 520, 16);
    const b = put(G, "boar", x + 6); t.run(G, 3);
    const ev = events(G); const states = new Set(); let hurt = 0, firstWind = -1, firstHurt = -1;
    G.bus.on("player:hurt", (e) => { if (e.cause === "boar") { hurt++; if (firstHurt < 0) firstHurt = G.frame; } });
    G.bus.on("animal:windup", () => { if (firstWind < 0) firstWind = G.frame; });
    for (let i = 0; i < 900; i++) { stepGame(G, 0); states.add(b.state); }
    for (const s of ["windup", "charge", "skid", "recover"]) t.ok(states.has(s), "state " + s);
    t.ok(hurt >= 1, "the ram hits a cube standing still");
    t.ok(firstHurt - firstWind >= ANIMAL_DEFS.boar.windup, `telegraph comes ${firstHurt - firstWind} steps before the hit`);
    // dodge: a cube that hops whenever the boar charges at it takes fewer hits
    const J = quiet(t.game()); const jx = stage(J, 520, 16);
    const jb = put(J, "boar", jx + 6); t.run(J, 3); let jh = 0;
    J.bus.on("player:hurt", (e) => { if (e.cause === "boar") jh++; });
    for (let i = 0; i < 900; i++) { const close = jb.state === "charge" && Math.abs(pdx(J, jb)) < 3.2; stepGame(J, close ? B.JUMP : 0); }
    t.ok(jh < hurt, `jumping dodges charges (${jh} vs ${hurt} hits)`);
  });

  t.test("territorial: bear rears, chases, gives up far from its den", () => {
    const G = quiet(t.game()); const x = stage(G, 640, 10);
    const b = put(G, "bear", x + 5); t.run(G, 3);
    t.ok(b.homeX > 0, "bear has a den");
    const ev = events(G);
    t.run(G, 80, B.RIGHT);
    t.ok(ev["animal:windup"] >= 1, "rears up when the cube comes close");
    t.run(G, 60);
    t.ok(b.state === "chase" || b.state === "swipe", "then chases: " + b.state);
    G.player.hp = 100; G.player.hurtT = 999;            // invulnerable runner for the leash check
    const pl = G.player;
    for (let i = 0; i < 900; i++) { stepGame(G, B.LEFT | (i % 20 === 0 ? B.JUMP : 0)); pl.hurtT = 999; }
    t.ok(Math.abs(tile(b) - b.homeX / T) < SPAWN.giveUp * 1.6, "stays near its den");
    t.ok(b.state !== "chase" && b.state !== "swipe", "gave up the chase: " + b.state);
  });

  t.test("pack: wolves circle, one lunge at a time, fear light, flee hurt + at dawn", () => {
    const G = quiet(t.game()); const x = stage(G, 452, 24); setDayF(G, 0.75);
    const w = [put(G, "wolf", x + 8), put(G, "wolf", x + 10), put(G, "wolf", x + 12)];
    t.ok(w[1].pack === w[0].pack && w[2].pack === w[0].pack, "one pack");
    let busyMax = 0, hurt = 0, circle = 0, close = 0;
    G.bus.on("player:hurt", (e) => { if (e.cause === "wolf") hurt++; });
    for (let i = 0; i < 1200 && !G.player.dead; i++) {
      stepGame(G, 0);
      busyMax = Math.max(busyMax, w.filter((a) => a.state === "windup" || a.state === "lunge").length);
      for (const a of w) if (a.state === "circle") { circle++; if (Math.abs(pdx(G, a)) < 2) close++; }
    }
    t.eq(busyMax, 1, "one wolf lunges at a time");
    t.ok(hurt >= 2, "lunges bite: " + hurt);
    t.ok(circle > 600 && close / circle < 0.15, `circling keeps its distance (${close}/${circle} close)`);
    // standing in campfire light: no bites
    const L = quiet(t.game()); const lx = stage(L, 452, 24); setDayF(L, 0.75);
    L.world.lights = [{ x: L.player.x + 13, y: L.player.y + 13, r: 7, kind: "campfire", id: 1 }];
    put(L, "wolf", lx + 9); put(L, "wolf", lx + 11);
    let lh = 0; L.bus.on("player:hurt", (e) => { if (e.cause === "wolf") lh++; });
    let inGlow = 0;
    for (let i = 0; i < 1200; i++) { stepGame(L, 0); for (const a of L.animals) if (Math.abs(pdx(L, a)) < 5) inGlow++; }
    t.eq(lh, 0, "no bites inside the campfire glow"); t.ok(inGlow < 120, "wolves keep out of the light: " + inGlow);
    // hurt wolves flee; dawn sends them away
    const a = L.animals[0]; a.hp = 5; t.run(L, 30);
    t.eq(a.state, "flee", "a hurt wolf flees");
    setDayF(L, 0.01); t.run(L, 2000);
    t.eq(sp.countKind(L, "wolf"), 0, "dawn: the pack is gone");
  });

  t.test("pack: walled plot keeps wolves out; lamps keep them back", () => {
    const G = quiet(t.game()); setDayF(G, 0.75); G.time.day = 9;
    setLevel(G, 16);
    const hx = G.world.houseX;
    t.standAt(G, hx + 6);
    const W = [put(G, "wolf", hx - 8), put(G, "wolf", hx - 10), put(G, "wolf", hx + 33)];
    let inside = 0, hurt = 0; G.bus.on("player:hurt", (e) => { if (e.cause === "wolf") hurt++; });
    for (let i = 0; i < 2000; i++) { stepGame(G, 0); for (const a of W) if (G.animals.includes(a) && a.x + a.w > hx * T && a.x < (hx + 24) * T) inside++; }
    t.eq(inside, 0, "no wolf inside the walls"); t.eq(hurt, 0, "safe behind the walls");
  });

  t.test("swim: fish stay in the water, dart away, can be speared from the bank", () => {
    const G = quiet(t.game()); const rv = G.world.river, mid = (rv.x0 + rv.x1) >> 1;
    const fish = [];
    for (let k = -3; k <= 3; k++) { const s = sp.waterSpot(G, mid + k * 2); t.ok(s, "water spot"); if (s) fish.push(cr.spawnAnimal(G, "fish", mid + k * 2, Math.floor((s.y + 5) / T))); }
    placePlayer(G, rv.x0 - 3, surfaceAt(G, rv.x0 - 3) - 1);
    let dry = 0, jumps = 0; const dryRun = new Map();
    G.bus.on("animal:sound", (e) => { if (e.sound === "splash") jumps++; });
    for (let i = 0; i < 4000; i++) {
      stepGame(G, 0);
      for (const f of fish) { const n = G.animals.includes(f) && !f.inWater ? (dryRun.get(f) || 0) + 1 : 0; dryRun.set(f, n); dry = Math.max(dry, n); }
    }
    t.ok(fish.every((f) => G.animals.includes(f)), "no fish lost");
    t.ok(dry < 60, "fish are never out of the water for long: " + dry + " steps");
    t.ok(jumps >= 1, "fish leap at the surface sometimes: " + jumps);
    for (const f of fish) { const c = Math.floor(tile(f)); t.ok(c >= rv.x0 - 1 && c <= rv.x1 + 1, "inside the river"); }
    // a spear from the bank reaches a fish just under the surface
    const f = fish[0]; const p = G.player;
    f.x = p.x + p.w + 20; f.y = p.y + p.h + 14; f.invT = 0; f.vx = f.vy = 0;
    const rect = { x0: p.x + p.w / 2, y0: p.y - 10, x1: p.x + p.w / 2 + 2.6 * T, y1: p.y + p.h + 6 };
    t.eq(cr.meleeHit(G, rect, toolOf("wood_spear"), 1), 1, "spear reaches under the surface");
    f.invT = 0; f.hp = 4;
    t.eq(cr.meleeHit(G, rect, toolOf("wood_axe"), 1), 0, "an axe does not");
  });

  t.test("arrows: fly, hit, consume ammo, come back sometimes", () => {
    const G = quiet(t.game()); const x = stage(G, 420, 14);
    hold(G, "bow"); invAdd(G.inv, "arrow", 10);
    const d = put(G, "deer", x + 6); t.run(G, 3); d.state = "idle"; d.t = 9999;
    const ev = events(G);
    t.ok(cr.shoot(G, d.x + d.w / 2, d.y + d.h / 2, toolOf("bow")), "fired");
    t.eq(invCount(G.inv, "arrow"), 9, "ammo used");
    t.eq(G.projectiles.length, 1, "arrow in flight");
    t.run(G, 40);
    t.ok(ev["animal:hit"] >= 1, "arrow hit the deer"); t.eq(G.projectiles.length, 0, "arrow done");
    G.inv.slots.forEach((s, i) => { if (s && s.id === "arrow") G.inv.slots[i] = null; });
    t.ok(!cr.shoot(G, 0, 0, toolOf("bow")), "no arrows, no shot");
  });

  t.test("balance: stone sword beats a boar; a bear needs iron", () => {
    const run = (kind, tool, tx) => { const G = quiet(t.game()); const x = stage(G, tx, 10); hold(G, tool); const a = put(G, kind, x + 6); t.run(G, 2); return fight(G, a); };
    const boar = run("boar", "stone_sword", 520);
    t.ok(boar.won && boar.hp >= 60, "stone sword vs boar: won with " + boar.hp + " hp");
    const wolf = run("wolf", "wood_sword", 520);
    t.ok(wolf.won || !wolf.dead, "wooden sword survives a lone wolf");
    const bs = run("bear", "stone_sword", 640), bi = run("bear", "iron_sword", 640);
    t.ok(!bs.won || bs.hp < 25, `stone sword vs bear loses (won ${bs.won}, ${bs.hp} hp)`);
    t.ok(bi.won && bi.hp >= 30, `iron sword vs bear wins (${bi.hp} hp)`);
  });

  t.test("faint: packs leave, hostile spawns pause", () => {
    const G = quiet(t.game()); const x = stage(G, 452, 16); setDayF(G, 0.75);
    put(G, "wolf", x + 8); put(G, "wolf", x + 9);
    G.creatureState.spawnT = 0;
    G.player.hp = 1; G.player.hurtT = 0;
    for (let i = 0; i < 2000 && !G.player.dead; i++) stepGame(G, 0);
    t.ok(G.player.faints >= 1 || G.player.dead, "fainted");
    t.ok(G.creatureState.calmT > 0, "calm period");
    t.run(G, 1500);
    t.eq(sp.countKind(G, "wolf"), 0, "the pack wandered off");
  });

  t.test("save / load keeps nearby animals", () => {
    const G = quiet(t.game()); const x = stage(G, 420, 14);
    put(G, "deer", x + 5); put(G, "rabbit", x + 7);
    const s = JSON.parse(JSON.stringify(makeSave(G)));
    t.ok(JSON.stringify(s.creatures).length < 4000, "small");
    const G2 = createGame({ save: s, headless: true });
    t.eq(G2.animals.length, 2, "restored"); t.eq(G2.animals.map((a) => a.kind).sort().join(), "deer,rabbit", "kinds");
    t.ok(new Set(G2.animals.map((a) => a.id)).size === 2 && G2.animals.every((a) => a.id < G2.nextId), "fresh ids");
    cr.load(G2, null); t.eq(G2.animals.length, 0, "null data -> empty");
    cr.load(G2, { a: [["dragon", 1, 2], ["deer", "x"], 5] }); t.eq(G2.animals.length, 0, "bad rows ignored");
  });

  t.test("20k steps across biomes, day and night: nobody leaves the world, nothing breaks", () => {
    const G = t.game(); let bad = 0, maxN = 0, nan = 0;
    const spots = [60, 160, 280, 330, 360, 415, 520, 640, 740];
    const t0 = Date.now();
    for (let i = 0; i < 20000; i++) {
      if (i % 2200 === 0) { const tx = spots[(i / 2200) % spots.length]; placePlayer(G, tx, surfaceAt(G, tx) - 1); G.player.hp = G.player.maxHp; }
      if (i === 10000) setDayF(G, 0.72);
      stepGame(G, (i >> 6) % 3 === 0 ? B.RIGHT : (i >> 6) % 3 === 1 ? B.LEFT | ((i & 31) === 0 ? B.JUMP : 0) : B.ACTION);
      maxN = Math.max(maxN, G.animals.length);
      for (const a of G.animals) {
        if (!isFinite(a.x) || !isFinite(a.y) || !isFinite(a.vx) || !isFinite(a.vy)) nan++;
        if (a.x < 0 || a.x + a.w > G.world.W * T || a.y > G.world.H * T || a.y < -10 * T) bad++;
      }
    }
    t.eq(nan, 0, "no NaN"); t.eq(bad, 0, "no animal out of the world");
    t.ok(maxN <= SPAWN.maxTotal, "total cap " + maxN);
    t.ok(Date.now() - t0 < 4000, `fast enough (${Date.now() - t0} ms)`);
  });
}
