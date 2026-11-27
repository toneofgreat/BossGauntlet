// combattest.mjs - COMBAT progression math, pacing table (DESIGN 4.4), drops, catalog and save checks.
//   node totally-normal-rpg/tools/combattest.mjs
import * as Stats from "../src/combat/stats.js";
import * as Items from "../src/combat/items.js";
import { rollDrops } from "../src/combat/drops.js";
import { modifiers, hasAbility, dropId } from "../src/combat/ngplus.js";
import * as Save from "../src/combat/save.js";

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; }
  else { fail++; console.log("FAIL " + name + (extra !== undefined ? "  -> " + JSON.stringify(extra) : "")); }
}
const near = (a, b, eps = 0.01) => Math.abs(a - b) <= eps;

// ---------------------------------------------------------------- base levels per kill (DESIGN 4.1)
ok(Stats.KINDS.rat.levels === 1, "rat base 1");
ok(Stats.KINDS.ratKing.levels === 3, "rat king base 3");
ok(Stats.KINDS.villager.levels === 10, "villager base 10");
ok(Stats.KINDS.fydor.levels === 50 && Stats.KINDS.myles.levels === 50, "guards base 50");
ok(Stats.KINDS.royalGuard.levels === 500, "royal guard base 500");
ok(Stats.KINDS.king.levels === 100000 && Stats.KINDS.king.flat, "king flat 100,000");
ok(Stats.levelsFor(100000, 960, true) === 100000, "flat ignores MULT");
ok(Stats.levelsFor(3, 4.5) === 14, "round(3 x 4.5) = 14");

// ---------------------------------------------------------------- multipliers (DESIGN 4.2 / 4.7)
const M = (id) => Items.item(id).mult;
const expectMult = { fists: 1, smelly_sword: 2, cheese_sword: 3, wooden_sword: 4, iron_sword: 8, gold_sword: 20, kings_staff: 40, cat_claws: 8,
  smelly_armor: 1.5, cheese_armor: 3, iron_armor: 6, golden_armor: 12, villager_morph: 2, kings_crown: 2, rookie_badge: 1.1, toms_bell: 1.25 };
for (const id in expectMult) ok(M(id) === expectMult[id], "mult " + id, M(id));
const expectCombat = { fists: [10, 0.4, 1.9], smelly_sword: [14, 0.5, 2.6], cheese_sword: [18, 0.5, 2.7], wooden_sword: [22, 0.5, 2.8],
  iron_sword: [30, 0.55, 3.0], gold_sword: [42, 0.55, 3.1], kings_staff: [55, null, null], cat_claws: [12, 0.25, 2.0] };
for (const id in expectCombat) {
  const d = Items.item(id), [dmg, cd, reach] = expectCombat[id];
  ok(d.dmg === dmg && (cd == null || d.cd === cd) && (reach == null || d.reach === reach), "combat numbers " + id, [d.dmg, d.cd, d.reach]);
}
ok(Items.item("kings_staff").bolt.dmg === 40 && Items.item("kings_staff").bolt.range === 25, "staff bolt 40 dmg 25 m");
const armorExp = { smelly_armor: [20, 0.1], cheese_armor: [50, 0.2], iron_armor: [100, 0.35], golden_armor: [200, 0.5] };
for (const id in armorExp) ok(Items.item(id).hp === armorExp[id][0] && Items.item(id).dr === armorExp[id][1], "armor " + id);
ok(Items.item("kings_crown").hp === 50, "crown +50 HP");
ok(Items.maxHpFor({ sword: "fists", armor: "golden_armor", crown: "kings_crown" }) === 350, "player HP 100+200+50 = 350");
ok(Items.computeMult({ sword: "kings_staff", armor: "golden_armor", morph: "villager_morph", crown: "kings_crown", charm: "toms_bell" }) === 40 * 12 * 2 * 2 * 1.25, "MULT product");

// cycle-1 horrible variants
const BADS = { smelly_sword: "Rotten Sock Sword", cheese_sword: "Moldy Cheese Sword", wooden_sword: "Termite Plank", iron_sword: "Rust Stick",
  gold_sword: "Fool's Gold Sword", kings_staff: "Bent Twig Staff", smelly_armor: "Wet Cardboard Armor", cheese_armor: "Sour Milk Armor",
  iron_armor: "Rusty Bucket Armor", golden_armor: "Gold-Painted Bin Lid", villager_morph: "Scarecrow Morph", kings_crown: "Paper Crown" };
for (const id in BADS) {
  const b = Items.item("bad_" + id);
  ok(b && b.name === BADS[id], "bad name " + id, b && b.name);
  ok(b && near(b.mult, Items.item(id).mult * 1.5, 1e-9), "bad x1.5 " + id);
  ok(b && b.dmg === Items.item(id).dmg, "bad same damage " + id);
  ok(dropId(id, 1) === "bad_" + id && dropId(id, 0) === id, "dropId " + id);
}
ok(Items.item("bad_villager_morph").morph === "scarecrow", "scarecrow morph");
for (const id of ["girls_ribbon", "fydors_locket", "mylesletter", "shovel"]) ok(Items.item(id) && Items.item(id).slot === "key", "key item " + id);

// best-of-slot / upgrade rules
ok(Items.isUpgrade("iron_sword", { sword: "wooden_sword" }), "iron > wooden");
ok(!Items.isUpgrade("cat_claws", { sword: "gold_sword" }), "claws do not replace gold");
ok(Items.bestOwned({ cheese_sword: true, iron_sword: true }, "sword").id === "iron_sword", "bestOwned sword");
ok(Items.bestOwned({}, "sword").id === "fists", "bestOwned fallback fists");

// ---------------------------------------------------------------- thresholds (CONTRACT 8.3, DESIGN 4.7)
const th0 = { smelly_armor: 5, area2: 50, cheese_armor: 125, villager_morph: 200, iron_armor: 1000, area3: 50000, kingPortal: 100000, golden_armor: 250000, kings_crown: 1000000 };
const th1 = Object.assign({}, th0, { area2: 100, area3: 100000, kingPortal: 200000 });
for (const id in th0) { ok(Stats.need(id, 0) === th0[id], "need c0 " + id); ok(Stats.need(id, 1) === th1[id], "need c1 " + id); }

// ---------------------------------------------------------------- power formula (DESIGN 4.5)
ok(near(Stats.outMul(500, 500), 1) && near(Stats.inMul(500, 500), 1), "x1 at rec");
ok(near(Stats.outMul(5000, 500), 3.98) && near(Stats.inMul(5000, 500), 0.25), "10x over: 3.98 / 0.25", [Stats.outMul(5000, 500), Stats.inMul(5000, 500)]);
ok(near(Stats.outMul(50, 500), 0.25) && near(Stats.inMul(50, 500), 3.98), "10x under: 0.25 / 3.98");
ok(Stats.outMul(1e9, 1) === 4 && Stats.inMul(1e9, 1) === 0.25, "clamped");
ok(Stats.outMul(0, 1) === 1, "level 0 treated as 1");
ok(near(Stats.outMul(125, 100), Math.pow(1.25, 0.6), 1e-6), "Hollow II x1.25 -> OUT 0.87", Stats.outMul(125, 100));
ok(near(Stats.playerDamage(30, true, true, 1), 30 * 2.5 * 1.5), "heavy x2.5, crit x1.5");
ok(near(Stats.damageTaken(20, 1, 0.35), 13), "DR applied");
ok(Stats.recClass(100, 50) === "green" && Stats.recClass(50, 50) === "white" && Stats.recClass(24, 50) === "red", "plate colours");
ok(Stats.fmtLevels(1400000) === "1.40M" && Stats.fmtLevels(1234) === "1,234", "level popup format");
ok(Stats.CRIT_CHANCE === 0.1 && Stats.PLAYER_IFRAMES === 0.35 && Stats.REGEN_RATE === 6 && Stats.REGEN_DELAY === 5, "combat constants");

// enemy table (DESIGN 4.6) + cycle modifiers
const tbl = { rat: [1, 30], goldenRat: [1, 60], ratKing: [5, 520], villager: [50, 450], fydor: [500, 1400], myles: [500, 1400], royalGuard: [55000, 1500],
  king: [100000, 6000], cat: [5000, 2500], shadowGuard: [100000, 300] };
for (const k in tbl) {
  ok(Stats.recFor(k, 0) === tbl[k][0] && Stats.hpFor(k, 0) === tbl[k][1], "enemy c0 " + k);
  ok(Stats.recFor(k, 1) === tbl[k][0] * 2 && Stats.hpFor(k, 1) === Math.round(tbl[k][1] * 1.5), "enemy c1 " + k);
}
ok(Stats.recFor("rookie", 0, 777) === 777 && Stats.recFor("rookie", 1, 0) === 1 && Stats.hpFor("rookie", 0) === 900, "rookie rec = your level");
const m1 = modifiers(1);
ok(m1.recMul === 2 && m1.hpMul === 1.5 && m1.dmgMul === 1.4 && m1.eyes === "red", "NG+ modifiers");
ok(hasAbility("rat", "pounce", 1) && !hasAbility("rat", "pounce", 0) && hasAbility("myles", "riposte", 1) && hasAbility("king", "clones", 1), "NG+ abilities");

// ---------------------------------------------------------------- drops (DESIGN 4.2)
{
  const run = { owned: {}, flags: {}, villagerNoWood: 0 };
  ok(rollDrops("rat", run)[0] === "smelly_sword", "first rat -> smelly");
  run.owned.smelly_sword = true;
  ok(rollDrops("rat", run).length === 0, "second rat -> nothing");
  ok(rollDrops("ratKing", run)[0] === "cheese_sword" && rollDrops("ratKing", run).length === 0, "rat king cheese once");
  let n = 0, got = false;
  while (!got && n < 50) { n++; got = rollDrops("villager", run, () => 0.99).length > 0; }
  ok(!got && n === 50, "wooden: no pity timer (WOOD_PITY = 0), high rolls never drop", n);
  ok(rollDrops("villager", run, () => 0.1)[0] === "wooden_sword", "wooden: a 1 in 5 roll drops it");
  run.owned.wooden_sword = true;
  const run2 = { owned: {}, flags: {}, villagerNoWood: 0 };
  ok(rollDrops("villager", run2, () => 0.1)[0] === "wooden_sword", "wooden 20% roll");
  run2.owned.wooden_sword = true;
  ok(rollDrops("villager", run2, () => 0.0).length === 0, "wooden only until owned");
  const run3 = { owned: {}, flags: {} };
  ok(rollDrops("myles", run3)[0] === "iron_sword" && rollDrops("fydor", run3).length === 0, "iron sword: first guard only, once");
  ok(rollDrops("royalGuard", run3)[0] === "gold_sword" && rollDrops("royalGuard", run3).length === 0, "gold once");
  ok(rollDrops("king", run3)[0] === "kings_staff" && rollDrops("king", run3).length === 0, "staff first King win");
  const cat = rollDrops("cat", run3);
  ok(cat.includes("cat_claws") && cat.includes("toms_bell"), "cat claws + bell");
  ok(rollDrops("rookie", run3)[0] === "rookie_badge", "rookie badge");
  // drop rate check: ~20% over many independent runs
  let hits = 0;
  for (let i = 0; i < 20000; i++) { const r = { owned: {}, flags: {}, villagerNoWood: 0 }; if (rollDrops("villager", r).length) hits++; }
  ok(hits / 20000 > 0.18 && hits / 20000 < 0.22, "wooden sword ~1 in 5", hits / 20000);
}

// ---------------------------------------------------------------- pacing table (DESIGN 4.4)
{
  const sim = Stats.simulatePacing(0);
  const want = [
    ["smelly_armor", 3, [1, 2, 2]], ["area2", 4, [9, 14, 14, 14]], ["cheese_armor", 2, [45, 45]], ["villager_morph", 1, [90]],
    ["guardsRec", 2, [180, 180]], ["iron_armor", 1, [1200]], ["area3", 11, null], ["royalRec", 1, [48000]], ["kingPortal", 0, []],
    ["kingFight", 1, [100000]], ["golden_armor", 1, [240000]], ["kings_crown", 2, [480000, 480000]],
  ];
  for (let i = 0; i < want.length; i++) {
    const row = sim.rows[i], [id, kills, per] = want[i];
    ok(row && row.id === id && row.kills === kills, "pacing kills " + id, row && [row.id, row.kills]);
    if (per) ok(JSON.stringify(row.perKill) === JSON.stringify(per), "pacing LV/kill " + id, row.perKill);
    ok(row.kills <= 40, "pacing <= 40 kills " + id);
  }
  ok(sim.rows[6].perKill.every((v) => v === 4800), "4,800 per guard after iron + iron armor");
  ok(sim.rows[2].startLevel >= 50, "area 2 reached before villagers");
  ok(sim.totalKills >= 26 && sim.totalKills <= 34, "~32 fights total", sim.totalKills);
  ok(sim.finalLevel >= 1000000 && sim.equip.crown === "kings_crown", "crown reached");
  ok(sim.rows.find((r) => r.id === "kingPortal").level >= 100000, "King portal reached by the first Gold Sword kill");
  const sim1 = Stats.simulatePacing(1);
  for (const r of sim1.rows) ok(r.kills <= 40, "cycle1 pacing <= 40 kills " + r.id, r.kills);
  ok(sim1.equip.sword === "bad_kings_staff" && sim1.equip.armor === "bad_golden_armor", "cycle1 gear is horrible");
  console.log("pacing cycle0: " + sim.rows.map((r) => r.id + "=" + r.kills).join(" ") + "  total " + sim.totalKills);
  console.log("pacing cycle1: " + sim1.rows.map((r) => r.id + "=" + r.kills).join(" ") + "  total " + sim1.totalKills);
}

// ---------------------------------------------------------------- save (CONTRACT 8.5)
{
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  const mkCtx = () => {
    const handlers = new Map();
    const bus = { on: (n, f) => { (handlers.get(n) || handlers.set(n, []).get(n)).push(f); return () => {}; }, emit: (n, p) => (handlers.get(n) || []).forEach((f) => f(p)) };
    return { bus, state: { profile: Save.defaultProfile(), settings: Save.defaultSettings(), run: Save.defaultRun(0), choiceSnapshot: null,
      player: {}, world: {}, ui: {}, rt: { playing: false, paused: false } }, engine: null };
  };
  let c = mkCtx();
  let s = await Save.init(c);
  ok(!s.loaded && !s.has(), "empty storage -> no save");
  c.state.profile.secrets.kittens = 123;
  c.state.run.level = 5000; c.state.run.owned.iron_sword = true; c.state.run.equip.sword = "iron_sword";
  s.writeNow();
  const raw = JSON.parse(store.get(Save.KEY));
  ok(raw.v === 1 && raw.run.level === 5000 && typeof raw.t === "number", "written shape v/t/run");
  c = mkCtx(); s = await Save.init(c);
  ok(s.loaded && c.state.run.level === 5000 && c.state.run.equip.sword === "iron_sword" && c.state.profile.secrets.kittens === 123, "loaded back");
  ok(s.has(), "has() with a run");
  const runRef = c.state.run;
  s.newGame(1);
  ok(c.state.run === runRef && c.state.run.level === 0 && c.state.run.cycle === 1 && c.state.run.phase === "ng" && c.state.profile.secrets.kittens === 123, "newGame keeps profile, in place");
  c.state.run.level = 42; c.state.run.phase = "choice";
  s.snapshotChoice();
  c.state.run.level = 99; c.state.run.phase = "ended";
  ok(s.restoreChoice() && c.state.run.level === 42 && c.state.run.phase === "choice", "choice snapshot restore");
  store.set(Save.KEY, "{not json");
  c = mkCtx(); s = await Save.init(c);
  ok(!s.loaded && store.get(Save.BAK) === "{not json", "corrupt -> backup + defaults");
  store.set(Save.KEY, JSON.stringify({ v: 99, run: {} }));
  c = mkCtx(); s = await Save.init(c);
  ok(!s.loaded && JSON.parse(store.get(Save.BAK)).v === 99, "unknown version -> backup");
  store.set(Save.KEY, JSON.stringify({ v: 1, t: 1, profile: { name: "Ann" }, settings: {}, run: { level: 7 }, choiceSnapshot: null }));
  c = mkCtx(); s = await Save.init(c);
  ok(s.loaded && c.state.run.level === 7 && c.state.run.equip.sword === "fists" && c.state.settings.master === 0.8 && c.state.profile.name === "Ann", "partial save merged with defaults");
}

console.log(`combattest: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
