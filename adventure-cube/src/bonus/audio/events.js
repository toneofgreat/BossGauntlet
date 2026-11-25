// events.js - BONUS_AUDIO: maps bonus bus events (BONUS.md 4) to sound names in sfx.js. Pure and DOM-free so the
// headless tests can check that every event in the BONUS.md 10.3 list is covered.
//   route(type, data, G, mem) -> [ { s: soundName, o: opts, x?, y? (px source position) }, ... ] | null
// mem is a small per-game scratch object (pickup streaks); route never mutates game state or payloads.
import { TILE_DEFS } from "../data/tiles.js";
import { T } from "../core/const.js";

const ORE = { coal_ore: 1, iron_ore: 2, gold_ore: 3, crystal: 4 };
const SOFT = { dirt: "dirt", grass: "dirt", snow: "dirt", sand: "sand", clay: "clay", gravel: "gravel", glass: "sand" };
const RARE = { gold_ore: 1, crystal: 1, gold_ingot: 1, steel_ingot: 1, iron_ingot: 1, fang: 1, bear_hide: 1, feather: 0 };
const SWING = { hand: "hand", sword: "blade", spear: "blade", axe: "tool", pickaxe: "tool", hammer: "heavy", bow: "bow" };
const CRAFT = { hand: "craft_hand", workbench: "craft_bench", campfire: "craft_fire", smoker: "craft_fire", furnace: "craft_furnace", anvil: "craft_anvil", kitchen: "craft_kitchen" };
const WOODY = { plank: 1, workbench: 1, chest: 1, sapling: 1 };
const STONY = { stone: 1, brick: 1, furnace: 1, anvil: 1, glass: 1 };
const FIRE = { torch: 1, lantern: 1, campfire: 1 };
// animal:sound names (data/animals.js `sound`) -> sfx, with per-kind variants
function call(a, sound) {
  const k = a && a.kind;
  if (sound === "bleat") return k === "goat" ? "bleat_goat" : "bleat_deer";
  if (sound === "growl") return k === "wolf" ? "snarl" : "growl";
  return { squeak: "squeak", cluck: "cluck", grunt: "grunt", howl: "howl", splash: "fish_splash" }[sound] || null;
}
// a tiny pained cry layered on hits (no gore, just a yelp)
const YELP = { rabbit: "squeak", pheasant: "cluck", deer: "bleat_deer", goat: "bleat_goat", boar: "grunt", wolf: "snarl", bear: "growl", fish: "fish_splash" };
const tileId = (c) => (TILE_DEFS[c] ? TILE_DEFS[c].id : "stone");
const ax = (a) => (a ? a.x + (a.w || 0) / 2 : undefined), ay = (a) => (a ? a.y + (a.h || 0) / 2 : undefined);

export const HANDLERS = {
  "tree:hit": (d) => d.tree && [{ s: "chop", o: { kind: d.tree.kind, k: d.max ? 1 - d.hp / d.max : 0 }, x: (d.tree.x + 0.5) * T, y: d.tree.y * T }],
  "tree:fall": (d) => [{ s: "tree_fall", o: { kind: d.kind }, x: d.tree ? (d.tree.x + 0.5) * T : undefined, y: d.tree ? d.tree.y * T : undefined }],
  "tree:tooHard": (d) => [{ s: "too_hard", o: {}, x: d.tree ? (d.tree.x + 0.5) * T : undefined }],
  "tree:plant": (d) => [{ s: "tree_plant", o: {}, x: d.tree ? (d.tree.x + 0.5) * T : undefined }],
  "tile:hit": (d) => {
    const id = tileId(d.tile), x = (d.tx + 0.5) * T, y = (d.ty + 0.5) * T;
    if (SOFT[id]) return [{ s: "dig", o: { mat: SOFT[id] }, x, y }];
    if (id === "planks") return [{ s: "place_wood", o: {}, x, y }];
    return [{ s: "pick", o: { ore: ORE[id] || 0 }, x, y }];
  },
  "tile:break": (d) => {
    const id = tileId(d.tile), x = (d.tx + 0.5) * T, y = (d.ty + 0.5) * T;
    if (SOFT[id]) return [{ s: "crumble_soft", o: { mat: SOFT[id] }, x, y }];
    if (id === "planks") return [{ s: "place_wood", o: { pitch: 0.8 }, x, y }, { s: "crumble_soft", o: {}, x, y }];
    return [{ s: "crumble_stone", o: { ore: ORE[id] || 0 }, x, y }];
  },
  "tile:tooHard": (d) => [{ s: "too_hard", o: {}, x: (d.tx + 0.5) * T, y: (d.ty + 0.5) * T }],
  "tile:protected": () => [{ s: "protected", o: {} }],
  "swing": (d) => [{ s: "swing", o: { kind: SWING[d.type] || "tool", tier: d.tier || 0 }, x: d.x, y: d.y }],
  "obj:hit": (d) => d.obj && [{ s: d.obj.kind === "boulder" ? "boulder" : d.obj.kind === "chest" || d.obj.kind === "workbench" ? "place_wood" : d.obj.kind === "furnace" || d.obj.kind === "anvil" ? "place_stone" : "rustle", o: {}, x: (d.obj.x + 0.5) * T, y: (d.obj.y + 0.5) * T }],
  "obj:break": (d) => d.obj && [{ s: d.obj.kind === "boulder" || d.obj.kind === "furnace" || d.obj.kind === "anvil" ? "crumble_stone" : "rustle", o: {}, x: (d.obj.x + 0.5) * T, y: (d.obj.y + 0.5) * T }],
  "harvest": (d) => [d.garden ? { s: "harvest", o: {} } : { s: "harvest", o: {}, x: d.obj ? (d.obj.x + 0.5) * T : undefined, y: d.obj ? (d.obj.y + 0.5) * T : undefined }],
  "animal:hit": (d) => {
    const a = d.a, out = [{ s: "thud", o: { pitch: a && (a.kind === "bear" || a.kind === "boar") ? 0.8 : a && a.kind === "rabbit" ? 1.25 : 1 }, x: ax(a), y: ay(a) }];
    if (a && YELP[a.kind] && d.hp > 0) out.push({ s: YELP[a.kind], o: { pitch: 1.12 }, x: ax(a), y: ay(a), at: 0.03 });
    return out;
  },
  "animal:die": (d) => [{ s: "puff", o: {}, x: d.x != null ? d.x : ax(d.a), y: d.y != null ? d.y : ay(d.a) }],
  "animal:attack": (d) => {
    const k = d.a && d.a.kind;
    return [{ s: k === "wolf" ? "bite" : "ram", o: { big: k === "bear" }, x: ax(d.a), y: ay(d.a) }];
  },
  "animal:windup": (d) => {
    const k = d.a && d.a.kind;
    return [{ s: k === "bear" ? "roar" : k === "wolf" ? "snarl" : k === "boar" ? "paw" : "bleat_goat", o: {}, x: ax(d.a), y: ay(d.a) }];
  },
  "animal:sound": (d, G) => {
    const s = call(d.a, d.sound);
    if (!s) return null;
    // a second wolf answers when the pack is near
    const pack = s === "howl" && G && G.animals && G.animals.filter((b) => b.kind === "wolf").length > 1;
    return [{ s, o: { pack }, x: ax(d.a), y: ay(d.a) }];
  },
  "shoot": (d) => [{ s: "shoot", o: {}, x: d.x, y: d.y }],
  "player:hurt": (d) => [{ s: "hurt", o: { dmg: d.dmg } }],
  "player:die": () => [{ s: "faint", o: {}, duck: 0.6 }],
  "player:respawn": () => [{ s: "respawn", o: {} }],
  "player:jump": (d) => [d && d.water ? { s: "swim", o: {} } : { s: "jump", o: {} }],
  "player:land": (d) => (d && d.impact > 3 ? [{ s: "land", o: { impact: d.impact } }] : null),
  "player:bonk": () => [{ s: "bonk", o: {} }],
  "player:splash": (d) => [{ s: "splash", o: { vy: d && d.vy } }],
  "player:unsplash": () => [{ s: "unsplash", o: {} }],
  "player:eat": (d) => [{ s: "eat", o: { raw: !!d.raw } }],
  "pickup": (d, G, mem) => {
    // pitch climbs a little through a streak of pickups (within 0.5 s of game time), and with the count
    const f = G ? G.frame : 0;
    mem.streak = f - (mem.lastPick ?? -999) < 30 ? Math.min(8, (mem.streak || 0) + 1) : 0;
    mem.lastPick = f;
    const p = Math.pow(2, (mem.streak * 2 + Math.min(4, (d.n || 1) - 1)) / 12);
    return [{ s: "pickup", o: { pitch: p, rare: !!RARE[d.id] } }];
  },
  "craft": (d) => [{ s: CRAFT[d.station] || "craft_hand", o: {} }],
  "place": (d) => [{ s: FIRE[d.id] ? "ignite" : WOODY[d.id] ? "place_wood" : STONY[d.id] ? "place_stone" : "place_soft", o: {}, x: (d.tx + 0.5) * T, y: (d.ty + 0.5) * T }],
  "tool:break": () => [{ s: "tool_break", o: {} }],
  "house:upgrade": (d) => {
    if (d.debug) return null; // tests / debug jumps between levels stay quiet
    const lv = d.level | 0;
    return [{ s: lv >= 20 ? "house_complete" : lv % 5 === 0 ? "upgrade_big" : "upgrade", o: { level: lv }, duck: lv >= 20 ? 0.8 : 0.6, duckFor: lv >= 20 ? 4.5 : lv % 5 === 0 ? 3 : 1.8 }];
  },
  "sleep": (d) => [d.start ? { s: "lullaby", o: {}, duck: 0.7, duckFor: 3 } : { s: "rooster", o: {}, at: 2.4 }],
  "garden:ripe": () => [{ s: "garden", o: {} }],
};
// the events BONUS.md 10.3 asks to be audible (the tests check each one routes to a real sound)
export const REQUIRED_EVENTS = [
  "tree:hit", "tree:fall", "tile:hit", "tile:break", "tile:tooHard", "swing", "animal:hit", "animal:sound", "animal:windup",
  "animal:die", "animal:attack", "player:hurt", "player:die", "player:respawn", "pickup", "craft", "place", "player:eat",
  "tool:break", "player:jump", "player:land", "player:splash", "player:unsplash", "house:upgrade", "sleep", "garden:ripe", "shoot",
];
export const EVENT_TYPES = Object.keys(HANDLERS);

export function route(type, d, G, mem) {
  const h = HANDLERS[type];
  if (!h) return null;
  try { const r = h(d || {}, G, mem || {}); return r && r.length ? r : null; } catch (e) { return null; }
}
