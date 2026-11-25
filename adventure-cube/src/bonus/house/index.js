// house/index.js - the house on the plot: levels 0..20, upgrade rules, perks, sleeping, respawn, house chest,
// garden, tool repair, wall/lamp protection (HOUSE owns; API frozen: BONUS.md 7). DOM-free.
//
// G.house = { level (0 = empty plot), buildT (steps since the last upgrade, for the build animation),
//             chest: inv | null, garden: { ready: ripe beds, harvested: total picked }, slept: nights slept,
//             upgrades: [{ lv, day }] (history), _perks (cached fold), _rv (last inv.ver checked; not saved) }
//
// Contract additions (compatible, documented in BONUS.md-style comments here):
//   spots(G)            -> { door, bed, chest, garden: {x0, x1} | null }   interactive columns (tiles) of this level
//   canSleep(G)         -> { ok, reason }                                   bed rules incl. "a wolf is nearby"
//   repairCost(G, i)    -> cost | null      repair(G, i) -> bool             restore a tool (perk "repair")
//   have(G, id)         -> carried + house chest (upgrades pay from both, inventory first)
//   events: "house:ready" { level, name } (you can afford the next level), "house:complete" { level: 20 },
//           "house:repair" { id, cost }
import { T, PLOT_W, HP_MAX, HUNGER_MAX } from "../core/const.js";
import { HOUSE_LEVELS, HOUSE_MAX, houseLevel, houseTitle } from "../data/house.js";
import { ITEMS } from "../data/items.js";
import { RECIPE } from "../data/recipes.js";
import { ANIMAL_DEFS, HOSTILE, SPAWN } from "../data/animals.js";
import {
  createInv, invHasAll, invCount, invRemove, invBestTier, invSave, invLoad, invAdd, invWear,
} from "../craft/inventory.js";
import { setDayF, advanceTime, phase } from "../core/time.js";
import { moveBody } from "../core/physics.js";
import { surfaceAt, solidAt } from "../world/index.js";

export const NAP_STEPS = 4500;            // a nap with sleep:"any" skips 3 game hours
export const SLEEP_HUNGER = 10;           // sleeping through the night costs a little hunger (never below 25)
export const GARDEN_YIELD = { carrot: 2, berries: 2 };   // per ripe bed
const READY_CHECK = 30;                   // steps between "can I afford the next level?" checks

export function init(G) {
  G.house = G.house || { level: 0, buildT: 9999, chest: null, garden: { ready: 0, harvested: 0 }, slept: 0, upgrades: [] };
  G.house._rv = -1;
  applyPerks(G, false);
  G.bus.on("time:day", () => {
    const g = perkValue(G, "garden", 0);
    if (g && G.house.garden.ready < g) { G.house.garden.ready = g; G.bus.emit("garden:ripe", { beds: g }); }
  });
}

export function step(G) {
  const h = G.house;
  if (h.buildT < 9999) h.buildT++;
  if (h.level < HOUSE_MAX && G.frame % READY_CHECK === 0 && G.inv.ver !== h._rv) {
    h._rv = G.inv.ver;
    const c = canUpgrade(G);
    if (c.ok && (G.flags.houseReady | 0) < c.next.lv) {
      G.flags.houseReady = c.next.lv;
      G.bus.emit("house:ready", { level: c.next.lv, name: c.next.name });
      G.bus.emit("toast", { text: "You can build Level " + c.next.lv + ": " + c.next.name + "! Head home." });
    }
  }
  if (G.animals.length && (hasPerk(G, "walls") || hasPerk(G, "lamps"))) guard(G);
}

export function save(G) {
  const h = G.house;
  return { level: h.level, chest: h.chest ? invSave(h.chest) : null, garden: { ready: h.garden.ready | 0, harvested: h.garden.harvested | 0 }, slept: h.slept | 0, upgrades: h.upgrades.slice(-HOUSE_MAX) };
}
export function load(G, d) {
  if (!d) return;
  const h = G.house;
  h.level = Math.max(0, Math.min(HOUSE_MAX, d.level | 0));
  const gd = d.garden || {};
  h.garden = { ready: Math.max(0, gd.ready | 0), harvested: Math.max(0, gd.harvested | 0) };
  h.slept = Math.max(0, d.slept | 0);
  h.upgrades = Array.isArray(d.upgrades) ? d.upgrades.filter((u) => u && u.lv > 0).map((u) => ({ lv: u.lv | 0, day: u.day | 0 })) : [];
  h._perks = null; h.chest = null;
  applyPerks(G, false);
  if (h.garden.ready > perkValue(G, "garden", 0)) h.garden.ready = perkValue(G, "garden", 0);
  if (d.chest && h.chest) {
    invLoad(h.chest, d.chest);
    // a chest never shrinks below its perk size (older saves)
    while (h.chest.slots.length < perkValue(G, "chest", 0)) h.chest.slots.push(null);
  }
}

// ---------------------------------------------------------------------------------------------------------------
// perks: cumulative fold (stations = union, maxHp/maxHunger = sum, everything else = latest value)
export function perksAt(level) {
  const P = { stations: [], maxHp: 0, maxHunger: 0 };
  for (let i = 0; i < level && i < HOUSE_LEVELS.length; i++) {
    const k = HOUSE_LEVELS[i].perks;
    for (const key in k) {
      if (key === "stations") { for (const s of k.stations) if (!P.stations.includes(s)) P.stations.push(s); }
      else if (key === "maxHp" || key === "maxHunger") P[key] += k[key];
      else P[key] = k[key];
    }
  }
  return P;
}
export const perks = (G) => G.house._perks || (G.house._perks = perksAt(G.house.level));
export function perkValue(G, key, dflt) { const v = perks(G)[key]; return v === undefined ? dflt : v; }
export const hasPerk = (G, key) => !!perks(G)[key];
// heal = give the cube the hp/hunger a cap raise added (upgrades); false on load / debug jumps
function applyPerks(G, heal) {
  const h = G.house, P = (h._perks = perksAt(h.level)), p = G.player;
  const oldHp = p.maxHp, oldHu = p.maxHunger;
  p.maxHp = HP_MAX + P.maxHp; p.maxHunger = HUNGER_MAX + P.maxHunger;
  if (heal) {
    if (p.maxHp > oldHp) p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - oldHp));
    if (p.maxHunger > oldHu) p.hunger = Math.min(p.maxHunger, p.hunger + (p.maxHunger - oldHu));
  }
  p.hp = Math.min(p.hp, p.maxHp); p.hunger = Math.min(p.hunger, p.maxHunger);
  const slots = P.chest || 0;
  if (slots && (!h.chest || h.chest.slots.length < slots)) {
    const c = createInv(slots);
    if (h.chest) h.chest.slots.forEach((s, i) => { c.slots[i] = s; });
    c.ver = h.chest ? h.chest.ver + 1 : 0;
    h.chest = c;
  }
}

// ---------------------------------------------------------------------------------------------------------------
// geometry: the house footprint (tiles) centered on the plot; door = center column
export function footprint(G) {
  const w = G.world, L = houseLevel(G.house.level), fw = L ? L.w : 0, fh = L ? L.h : 0;
  const x0 = w.houseX + Math.floor((PLOT_W - fw) / 2);
  return { x0, x1: x0 + fw - 1, w: fw, h: fh, ground: w.houseY, doorX: w.houseX + PLOT_W / 2, bedX: x0 + 1 };
}
// interactive columns for this level (tiles; RENDER may align the bed / chest / garden art with them)
//   door: always the plot center; bed: left end inside the house; chest: next to the bed;
//   garden: the right end of the footprint (4 beds -> 4 columns, 8 beds -> 6 columns), null without the perk
export function spots(G) {
  const f = footprint(G), beds = perkValue(G, "garden", 0);
  const gw = beds >= 8 ? 6 : beds ? 4 : 0;
  return {
    door: f.doorX,
    bed: perkValue(G, "sleep", null) ? f.bedX : null,
    chest: G.house.chest ? f.bedX + 1 : null,
    garden: gw ? { x0: f.x1 - gw + 1, x1: f.x1 } : null,
  };
}
// is the player within the plot (+extra tiles each side)?
export function nearHome(G, extra = 3) {
  const p = G.player, w = G.world, tx = (p.x + p.w / 2) / T, ty = (p.y + p.h) / T;
  return tx >= w.houseX - extra && tx <= w.houseX + PLOT_W + extra && ty > w.houseY - 26 && ty < w.houseY + 3;
}
export function inPlot(G, tx) { const w = G.world; return tx >= w.houseX && tx < w.houseX + PLOT_W; }
// where the cube wakes up: in front of the door once there is a house, else the world spawn. -> px top-left
export function respawnPoint(G) {
  const w = G.world, tx = G.house && G.house.level >= 1 ? footprint(G).doorX : w.spawn.x;
  let ty = (G.house && G.house.level >= 1 ? w.houseY : w.spawn.y) - 1;
  // live tiles: blocks the player placed on the spawn cell must not trap the cube - stand on top of them instead
  if (solidAt(G, tx, ty)) { while (ty > 1 && solidAt(G, tx, ty)) ty--; }
  return { x: (tx + 0.5) * T - G.player.w / 2, y: (ty + 1) * T - G.player.h };
}

// INTEGRATE addition: "Return home" (pause menu) - the way out of a deep cave with a broken pickaxe. Costs a
// little hunger (never below 10) so it is not free travel; refused while fainted or when a hostile is right on you.
export const HOME_HUNGER = 8;
export function goHome(G) {
  const p = G.player;
  if (p.dead) return false;
  const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  if (G.animals.some((a) => HOSTILE[a.kind] && (a.aggroT > 0 || /chase|charge|lunge|swipe|butt|circle/.test(a.state || "")) && Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) < 6 * T)) {
    G.bus.emit("toast", { text: "Not while something is hunting you!" }); return false;
  }
  const sp = respawnPoint(G);
  p.x = sp.x; p.y = sp.y; p.ox = p.x; p.oy = p.y; p.vx = 0; p.vy = 0; p.smoothY = 0; p.peakY = p.y; p.grounded = false;
  p.hunger = Math.max(Math.min(p.hunger, 10), p.hunger - HOME_HUNGER);
  G.bus.emit("player:home", { x: p.x + p.w / 2, y: p.y + p.h / 2 });
  G.bus.emit("toast", { text: G.house.level >= 1 ? "You find your way home." : "You find your way back to camp." });
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// paying: upgrades take from the inventory first, then from the house chest (it stands at home)
export function have(G, id) { return invCount(G.inv, id) + (G.house.chest ? invCount(G.house.chest, id) : 0); }
function missingOf(G, cost) {
  const m = {};
  for (const id in cost) { const k = cost[id] - have(G, id); if (k > 0) m[id] = k; }
  return m;
}
function take(G, cost) {
  for (const id in cost) {
    const got = invRemove(G.inv, id, cost[id]);
    if (got < cost[id] && G.house.chest) invRemove(G.house.chest, id, cost[id] - got);
  }
}
// can the next level be built? -> { ok, next (level data | null), missing {item: n}, hammer: tier needed, hasHammer }
export function canUpgrade(G) {
  const next = houseLevel(G.house.level + 1);
  if (!next) return { ok: false, next: null, missing: {}, hammer: 0, hasHammer: true, max: true };
  const missing = missingOf(G, next.cost), best = invBestTier(G.inv, "hammer");
  const hasHammer = best >= next.hammer;
  return { ok: hasHammer && Object.keys(missing).length === 0, next, missing, hammer: next.hammer, hasHammer };
}
// the hammer that does the building: the lowest-tier carried hammer that is good enough -> slot index | -1
function buildHammer(G, tier) {
  let bi = -1, bt = 99;
  G.inv.slots.forEach((s, i) => {
    const t = s && ITEMS[s.id] && ITEMS[s.id].tool;
    if (t && t.type === "hammer" && t.tier >= tier && t.tier < bt) { bt = t.tier; bi = i; }
  });
  return bi;
}
export function upgrade(G) {
  const c = canUpgrade(G);
  if (!c.ok) return false;
  take(G, c.next.cost);
  // building wears the hammer a little (never breaks it)
  if (c.next.hammer > 0) {
    const i = buildHammer(G, c.next.hammer), s = i >= 0 && G.inv.slots[i];
    if (s && s.d > 1) invWear(G.inv, i, Math.min(s.d - 1, 2 + c.next.lv));
  }
  const h = G.house;
  h.level++; h.buildT = 0;
  h.upgrades.push({ lv: h.level, day: G.time.day });
  applyPerks(G, true);
  if (c.next.perks.garden) h.garden.ready = Math.max(h.garden.ready, perkValue(G, "garden", 0)); // new beds start ripe
  G.bus.emit("house:upgrade", { level: h.level, name: c.next.name, title: c.next.title });
  if (h.level === HOUSE_MAX) { G.flags.houseDone = G.flags.houseDone || G.time.day; G.bus.emit("house:complete", { level: h.level }); }
  return true;
}
// debug / tests: jump straight to a level (no cost)
export function setLevel(G, lv) {
  G.house.level = Math.max(0, Math.min(HOUSE_MAX, lv | 0)); G.house.buildT = 0;
  applyPerks(G, false);
  G.bus.emit("house:upgrade", { level: G.house.level, name: houseLevel(G.house.level) ? houseLevel(G.house.level).name : "Empty plot", title: houseTitle(G.house.level), debug: true });
}

// ---------------------------------------------------------------------------------------------------------------
// sleeping
const ALERT = { chase: 1, charge: 1, windup: 1, attack: 1, lunge: 1, circle: 1 };
// a dangerous animal that is after the cube nearby -> animal | null
function threat(G, r = 10) {
  const p = G.player, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  for (const a of G.animals) {
    if (!HOSTILE[a.kind] || a.hp <= 0) continue;
    if (!(ALERT[a.state] || a.aggroT > 0)) continue;
    if (Math.hypot(a.x + a.w / 2 - cx, a.y + a.h / 2 - cy) <= r * T) return a;
  }
  return null;
}
// can the cube sleep right now? (UI + bed use; sleep() itself only checks the bed rules)
export function canSleep(G) {
  const mode = perkValue(G, "sleep", null);
  if (!mode) return { ok: false, reason: "Build a hide tent (level 2) to have a bed." };
  if (G.player.dead) return { ok: false, reason: "" };
  const ph = phase(G);
  if (mode === "night" && ph !== "night" && ph !== "dusk") return { ok: false, reason: "You can only sleep at night." };
  const a = threat(G);
  if (a) return { ok: false, reason: "You can't sleep with a " + ((ANIMAL_DEFS[a.kind] && ANIMAL_DEFS[a.kind].name) || a.kind).toLowerCase() + " nearby!" };
  return { ok: true, reason: "" };
}
// sleep in the bed: night (or any time at level 18+) -> skip to dawn / nap. -> true when slept
export function sleep(G) {
  const mode = perkValue(G, "sleep", null);
  if (!mode) return false;
  const ph = phase(G);
  if (mode === "night" && ph !== "night" && ph !== "dusk") { G.bus.emit("toast", { text: "You can only sleep at night" }); return false; }
  const p = G.player, night = ph === "night" || ph === "dusk";
  G.bus.emit("sleep", { start: true });
  if (night) setDayF(G, 0.0); else advanceTime(G, NAP_STEPS);
  p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * perkValue(G, "sleepHeal", 0.3)));
  if (night) p.hunger = Math.max(Math.min(p.hunger, 25), p.hunger - SLEEP_HUNGER);
  p.hurtT = 0;
  G.house.slept = (G.house.slept | 0) + 1;
  G.bus.emit("sleep", { start: false });
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// B_USE while standing at home -> true when handled. The nearest interactive spot wins:
//   door (+-2) -> house panel | bed -> sleep | chest -> chest panel | ripe garden -> harvest.
// A targeted world object (a placed workbench, a bush...) is left to world.useObject; on the empty plot USE opens
// the panel unless the cube holds food (so you can still eat at home).
export function interact(G) {
  if (!nearHome(G, 0) || G.player.dead) return false;
  if (G.target && G.target.kind === "object" && G.target.obj) return false;
  const p = G.player, tx = Math.floor((p.x + p.w / 2) / T);
  const sel = G.inv.slots[G.inv.sel], food = !!(sel && ITEMS[sel.id] && ITEMS[sel.id].food);
  if (G.house.level === 0) {
    if (food) return false;
    G.bus.emit("ui:open", { panel: "house" }); return true;
  }
  const S = spots(G), cand = [];
  cand.push(["door", Math.abs(tx - S.door), 2]);
  if (S.bed != null) cand.push(["bed", Math.abs(tx - S.bed), 0]);
  if (S.chest != null) cand.push(["chest", Math.abs(tx - S.chest), 0]);
  if (S.garden && G.house.garden.ready > 0) cand.push(["garden", tx < S.garden.x0 ? S.garden.x0 - tx : tx > S.garden.x1 ? tx - S.garden.x1 : 0, 0]);
  let best = null;
  for (const c of cand) if (c[1] <= c[2] && (!best || c[1] < best[1])) best = c;
  if (!best) return false;
  // holding food at the door eats (or cooks) it, as on the empty plot; H / the House button still open the panel
  if (best[0] === "door") { if (food) return false; G.bus.emit("ui:open", { panel: "house" }); return true; }
  if (best[0] === "bed") {
    const c = canSleep(G);
    if (!c.ok) { if (c.reason) G.bus.emit("toast", { text: c.reason }); return true; }
    sleep(G); return true;
  }
  if (best[0] === "chest") { G.bus.emit("ui:open", { panel: "chest", house: true }); return true; }
  if (best[0] === "garden") { harvestGarden(G); return true; }
  return false;
}
// harvest ripe garden beds into the inventory -> items given
export function harvestGarden(G) {
  const n = G.house.garden.ready | 0;
  if (!n) return 0;
  G.house.garden.ready = 0;
  let total = 0;
  for (const id in GARDEN_YIELD) {
    const k = GARDEN_YIELD[id] * n, left = invAdd(G.inv, id, k);
    if (left > 0 && G.house.chest) invAdd(G.house.chest, id, left);
    total += k;
  }
  G.house.garden.harvested = (G.house.garden.harvested | 0) + total;
  G.bus.emit("harvest", { garden: true, id: "carrot", n: GARDEN_YIELD.carrot * n });
  G.bus.emit("toast", { text: "Garden harvest: +" + GARDEN_YIELD.carrot * n + " carrots, +" + GARDEN_YIELD.berries * n + " berries" });
  return total;
}

// ---------------------------------------------------------------------------------------------------------------
// tool repair (perk "repair"): costs a share of the tool's recipe (without sticks), at least 1 of each part
export function repairCost(G, i) {
  const s = G.inv.slots[i], it = s && ITEMS[s.id];
  if (!it || !it.tool || s.d == null || s.d >= it.tool.dur) return null;
  const r = RECIPE[s.id];
  if (!r) return null;
  const frac = 1 - s.d / it.tool.dur, cost = {};
  for (const id in r.cost) if (id !== "stick") cost[id] = Math.max(1, Math.ceil(r.cost[id] * frac));
  if (!Object.keys(cost).length) cost.stick = Math.max(1, Math.ceil((r.cost.stick || 1) * frac));
  return cost;
}
export function repair(G, i) {
  if (!hasPerk(G, "repair")) return false;
  const cost = repairCost(G, i);
  if (!cost || Object.keys(missingOf(G, cost)).length) return false;
  take(G, cost);
  const s = G.inv.slots[i];
  s.d = ITEMS[s.id].tool.dur; G.inv.ver++;
  G.bus.emit("house:repair", { id: s.id, cost });
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// protection backstops (CREATURES also steers its AI by these perks; this guarantees them):
//   walls: hostile animals never stand inside the plot; lamps: wolves stay SPAWN.homeSafe tiles off the plot
function guard(G) {
  const w = G.world, walls = hasPerk(G, "walls"), lamps = hasPerk(G, "lamps");
  const px0 = w.houseX * T, px1 = (w.houseX + PLOT_W) * T, top = (w.houseY - 30) * T, bot = (w.houseY + 2) * T;
  const lz0 = (w.houseX - SPAWN.homeSafe) * T, lz1 = (w.houseX + PLOT_W + SPAWN.homeSafe) * T;
  for (const a of G.animals) {
    if (!HOSTILE[a.kind] || a.hp <= 0) continue;
    const feet = a.y + a.h;
    if (feet < top || feet > bot) continue;
    const cx = a.x + a.w / 2, ocx = (a.ox == null ? a.x : a.ox) + a.w / 2;
    const pack = ANIMAL_DEFS[a.kind] && ANIMAL_DEFS[a.kind].ai === "pack";
    if (lamps && pack) keepOut(G, a, cx, ocx, lz0, lz1);
    else if (walls) keepOut(G, a, cx, ocx, px0, px1);
  }
}
function keepOut(G, a, cx, ocx, x0, x1) {
  if (cx < x0 || cx >= x1) return;
  if (ocx < x0 || ocx >= x1) { a.x = a.ox; a.vx = 0; return; }   // just stepped in: step back out
  // already inside (spawned there / the perk was just built): walk it out toward the nearest edge, fast
  const dir = cx - x0 < x1 - cx ? -1 : 1, far = Math.min(cx - x0, x1 - cx);
  if (far > 6 * T) {
    // deep inside: put it just outside on the ground
    const ex = dir < 0 ? x0 - a.w - 2 : x1 + 2, tx = Math.floor((ex + a.w / 2) / T);
    a.x = ex; a.y = surfaceAt(G, tx) * T - a.h; a.ox = a.x; a.oy = a.y; a.vx = 0; a.vy = 0;
    return;
  }
  const b = { x: a.x, y: a.y, w: a.w, h: a.h, vx: dir * 4, vy: 0, grounded: a.grounded };
  moveBody(G, b, { platforms: false });
  a.x = b.x; a.facing = dir;
}

export { HOUSE_LEVELS, HOUSE_MAX, invHasAll };
