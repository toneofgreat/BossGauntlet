// craft/index.js - survival + crafting logic: hunger, regen, starvation, eating, cooking, recipes, stations,
// tool-wear warnings + auto-swap, the tutorial tick (CRAFT owns; API frozen: BONUS.md 5.4). DOM-free.
//
// Frozen: init step save load HUNGER eat stationsNear recipesFor craft (+ re-exports invRoom invRemove, reachTiles)
// CRAFT additions (compatible): craftMax(G, id) cookAll(G) dropSlot(G, i, n) stationLevel(st) foodGain(G, id)
//   status(G) -> [{ id, text }]   recipe(id)   events: "hint" (tutorial.js), "craft:fail" { recipe, reason }
//
// Death rules (BONUS.md 2.4, family friendly): fainting keeps the whole inventory and the house; CORE wakes the
// cube at home with >= 60% health and >= 40 hunger. CRAFT clears the tummy ache + starvation timers on waking.
import { T } from "../core/const.js";
import { healPlayer, hurtPlayer } from "../core/player.js";
import { ITEMS, itemName } from "../data/items.js";
import { RECIPES, RECIPE } from "../data/recipes.js";
import { HOUSE_LEVELS } from "../data/house.js";
import { OBJECT_DEFS, STATION_RANGE } from "../data/tiles.js";
import { invAdd, invCount, invHasAll, invTakeAll, invRemove, invRoom, invSelected, invToolSlots, invMove, invTakeSlot, HOTBAR } from "./inventory.js";
import { objectsNear, spawnDrop } from "../world/index.js";
import * as house from "../house/index.js";
import { stepTutorial } from "./tutorial.js";

// tuning (per 60 Hz step)
export const HUNGER = {
  drain: 100 / 60000,      // idle: full -> empty in ~16.7 min (1.7 in-game days)
  runMul: 1.35, swimMul: 1.6,
  swing: 0.025,            // extra per swing (a long mining session costs a few points)
  regenAt: 50,             // regen only while hunger >= this
  regenEvery: 90, regenHp: 1, regenCost: 0.25,
  wellFedAt: 85, wellFedEvery: 60,   // well fed: faster regen
  hungryAt: 25,            // UI warning pulse + one toast
  starveEvery: 150, starveHp: 2,
  rawSick: 600,            // steps without regen after eating raw meat ("tummy ache", never damage)
  wearWarn: 0.12,          // toast when the held tool drops below this fraction of durability
};

export function init(G) {
  G.craft = Object.assign({ regenT: 0, starveT: 0, sickT: 0, lastStation: null, hungryWarned: false }, G.craft || {});
  const c = G.craft;
  c._warned = new WeakSet();
  G.bus.on("swing", () => { G.player.hunger = Math.max(0, G.player.hunger - HUNGER.swing); });
  G.bus.on("player:respawn", () => { c.sickT = 0; c.starveT = 0; c.regenT = 0; c.hungryWarned = false; });
  // a broken tool is replaced by the best spare of the same type (moved into the selected hotbar slot)
  G.bus.on("tool:break", (d) => {
    const it = ITEMS[d.id]; if (!it || !it.tool) return;
    const inv = G.inv;
    if (inv.slots[inv.sel]) return;
    const spare = invToolSlots(inv, it.tool.type)[0];
    if (spare == null) return;
    invMove(inv, spare, inv, inv.sel);
    G.bus.emit("toast", { text: "Switched to your " + itemName(inv.slots[inv.sel].id).toLowerCase() });
  });
  G.bus.on("craft", (d) => {
    if (d.station === "campfire") G.flags.tutCooked = 1;
    if (d.station === "furnace") G.flags.tutSmelt = 1;
    if (d.id === "wood_pickaxe") G.flags.tutPick = 1;
  });
}
export function save(G) { const c = G.craft; return { sickT: c.sickT | 0, starveT: c.starveT | 0, hungryWarned: !!c.hungryWarned }; }
export function load(G, d) {
  if (!d || typeof d !== "object") return;
  const c = G.craft;
  c.sickT = Math.max(0, Math.min(HUNGER.rawSick, d.sickT | 0));
  c.starveT = Math.max(0, d.starveT | 0);
  c.hungryWarned = !!d.hungryWarned;
}

export function step(G) {
  const p = G.player, c = G.craft;
  if (G.frame % 30 === 0) stepTutorial(G);
  if (p.dead) return;
  const home = house.nearHome(G);
  let mul = Math.abs(p.vx) > 2 ? HUNGER.runMul : 1;
  if (p.inWater) mul = HUNGER.swimMul;
  if (home) mul *= house.perkValue(G, "hungerMul", 1);
  p.hunger = Math.max(0, Math.min(p.maxHunger, p.hunger - HUNGER.drain * mul));
  if (c.sickT > 0) c.sickT--;
  // regen (faster when well fed, and at home with the regen perk)
  if (p.hunger >= HUNGER.regenAt && p.hp < p.maxHp && c.sickT <= 0) {
    let every = p.hunger >= HUNGER.wellFedAt ? HUNGER.wellFedEvery : HUNGER.regenEvery;
    if (home) every /= house.perkValue(G, "regenMul", 1);
    if (++c.regenT >= every) { c.regenT = 0; healPlayer(G, HUNGER.regenHp); p.hunger = Math.max(0, p.hunger - HUNGER.regenCost); }
  } else c.regenT = 0;
  // hunger warnings + starvation (can faint: you wake up at home, items kept)
  if (p.hunger < HUNGER.hungryAt && !c.hungryWarned) { c.hungryWarned = true; G.bus.emit("toast", { text: "You're getting hungry. Eat something!" }); }
  else if (p.hunger > HUNGER.hungryAt + 10) c.hungryWarned = false;
  if (p.hunger <= 0) {
    if (++c.starveT >= HUNGER.starveEvery) { c.starveT = 0; p.hurtT = 0; hurtPlayer(G, HUNGER.starveHp, p.x + p.w / 2, 0, "hunger"); }
  } else c.starveT = 0;
  // the held tool is about to break: warn once per tool
  const s = invSelected(G.inv), it = s && ITEMS[s.id];
  if (it && it.tool && s.d != null && s.d <= Math.max(3, it.tool.dur * HUNGER.wearWarn) && !c._warned.has(s)) {
    c._warned.add(s);
    G.bus.emit("toast", { text: it.name + " is almost worn out" });
  }
}

// effective food values right now (banquet perk at home)
export function foodGain(G, id) {
  const it = ITEMS[id]; if (!it || !it.food) return { hunger: 0, hp: 0 };
  const k = house.nearHome(G) ? house.perkValue(G, "banquet", 1) : 1;
  return { hunger: it.food.hunger * k, hp: it.food.hp * k, raw: !!it.food.raw };
}

// eat the food in inventory slot i -> true when eaten (or cooked: raw food next to a campfire is cooked instead)
export function eat(G, i) {
  const p = G.player, s = G.inv.slots[i], it = s && ITEMS[s.id];
  if (!it || !it.food || p.dead) return false;
  // raw food at a campfire: cook one instead of eating it raw
  if (it.food.raw && it.food.cooks && RECIPE["cook_" + it.id] && stationsNear(G).has("campfire")) {
    if (craft(G, "cook_" + it.id, 1)) { G.bus.emit("toast", { text: "Cooked " + itemName(it.food.cooks) + "! Use it again to eat." }); return true; }
    return false;
  }
  if (it.food.medicine) { if (p.hp >= p.maxHp) { G.bus.emit("toast", { text: "You're not hurt" }); return false; } }
  else if (p.hunger >= p.maxHunger - 0.5 && p.hp >= p.maxHp) { G.bus.emit("toast", { text: "You're full" }); return false; }
  const g = foodGain(G, it.id);
  s.n--; if (s.n <= 0) G.inv.slots[i] = null; G.inv.ver++;
  const before = p.hunger;
  p.hunger = Math.min(p.maxHunger, p.hunger + g.hunger);
  healPlayer(G, g.hp);
  if (it.food.raw) { G.craft.sickT = HUNGER.rawSick; G.bus.emit("toast", { text: "Raw food... tummy ache! Cook it next time." }); }
  G.bus.emit("player:eat", { id: it.id, raw: !!it.food.raw, hunger: Math.round((p.hunger - before) * 10) / 10 });
  return true;
}

// Set of station ids usable right now: "hand" always + placed station objects within STATION_RANGE tiles +
// house perk stations while at home
export function stationsNear(G) {
  const p = G.player, set = new Set(["hand"]);
  for (const o of objectsNear(G, p.x + p.w / 2, p.y + p.h / 2, STATION_RANGE, (o, d) => !!d.station)) set.add(OBJECT_DEFS[o.kind].station);
  if (house.nearHome(G)) for (const s of house.perkValue(G, "stations", [])) set.add(s);
  return set;
}
// how many times recipe id could be crafted with the materials carried (ignores stations)
export function craftMax(G, id) {
  const r = RECIPE[id]; if (!r) return 0;
  let m = Infinity;
  for (const k in r.cost) m = Math.min(m, Math.floor(invCount(G.inv, k) / r.cost[k]));
  return m === Infinity ? 0 : m;
}
// every recipe with flags for the UI: [{ recipe, station: bool (station present), have: bool (materials), max }]
export function recipesFor(G) {
  const st = stationsNear(G);
  return RECIPES.map((r) => { const max = craftMax(G, r.id); return { recipe: r, station: st.has(r.station), have: max > 0, max }; });
}
export const recipe = (id) => RECIPE[id] || null;
// craft recipe id `times` times (Infinity = as many as possible) -> number crafted. Overflow drops at the player.
export function craft(G, id, times = 1) {
  const r = RECIPE[id];
  if (!r || G.player.dead) return 0;
  if (!stationsNear(G).has(r.station)) {
    G.bus.emit("craft:fail", { recipe: id, reason: "station" });
    G.bus.emit("toast", { text: "Needs a " + (OBJECT_DEFS[r.station] ? OBJECT_DEFS[r.station].name : r.station).toLowerCase() + " nearby" });
    return 0;
  }
  const want = Math.min(Number.isFinite(times) ? Math.max(0, times | 0) : 999, 999);
  let n = 0, dropped = 0;
  for (let k = 0; k < want; k++) {
    if (!invTakeAll(G.inv, r.cost)) break;
    const left = invAdd(G.inv, r.out[0], r.out[1]);
    if (left > 0) { spawnDrop(G, r.out[0], left, G.player.x + G.player.w / 2, G.player.y); dropped += left; }
    n++;
  }
  if (!n) { G.bus.emit("craft:fail", { recipe: id, reason: "materials" }); return 0; }
  G.stats.crafted = (G.stats.crafted || 0) + n;
  G.craft.lastStation = r.station;
  G.bus.emit("craft", { recipe: id, id: r.out[0], n: r.out[1] * n, station: r.station });
  if (dropped) G.bus.emit("toast", { text: "Bag full: " + itemName(r.out[0]) + " dropped on the ground" });
  return n;
}
// cook every raw food carried (needs a campfire) -> number of items cooked
export function cookAll(G) {
  if (!stationsNear(G).has("campfire")) return 0;
  let n = 0;
  for (const r of RECIPES) if (r.station === "campfire") { const m = craftMax(G, r.id); if (m > 0) n += craft(G, r.id, m); }
  return n;
}
// throw n items of slot i on the ground in front of the cube (UI "drop") -> number dropped
export function dropSlot(G, i, n) {
  const p = G.player, got = invTakeSlot(G.inv, i, n);
  if (!got) return 0;
  const dr = spawnDrop(G, got.id, got.n, p.x + p.w / 2 + p.facing * 20, p.y + 4, got.d);
  if (dr) { dr.vx = p.facing * 2.5; dr.vy = -2.5; dr.age = -60; }  // age < 0: not picked straight back up
  return got.n;
}
// the first house level whose perks add station st (0 = none)
export function stationLevel(st) {
  for (const L of HOUSE_LEVELS) if (L.perks && L.perks.stations && L.perks.stations.includes(st)) return L.lv;
  return 0;
}
// short status chips for the HUD
export function status(G) {
  const p = G.player, c = G.craft, out = [];
  if (p.hunger <= 0) out.push({ id: "starving", text: "Starving" });
  else if (p.hunger < HUNGER.hungryAt) out.push({ id: "hungry", text: "Hungry" });
  else if (p.hunger >= HUNGER.wellFedAt) out.push({ id: "fed", text: "Well fed" });
  if (c.sickT > 0) out.push({ id: "sick", text: "Tummy ache" });
  if (house.nearHome(G) && G.house.level > 0) out.push({ id: "home", text: "Home" });
  return out;
}
export { invRoom, invRemove, HOTBAR };
export const reachTiles = STATION_RANGE * T;
