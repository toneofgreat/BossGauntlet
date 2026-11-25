// game.js - the bonus game object G and its fixed step (CORE owns; API frozen: BONUS.md 2.1-2.2). DOM-free:
// tools/bonustest.mjs runs whole games in Node with this file alone.
//
//   const G = createGame({ seed, save })   // new world from seed, or restore a save object (core/save.js)
//   stepGame(G, bits, aim)                 // one 60 Hz step. bits = B_* input bits, aim = {tx, ty} | null (pointer)
//
// Step order (fixed): input edges -> stepPlayer -> stepAction -> world.step -> creatures.step -> craft.step ->
// house.step -> advanceTime -> autosave signal ("autosave" event every AUTOSAVE_STEPS).
import { SAVE_VERSION, NEW_GAME_F, DAY_FRAMES, AUTOSAVE_STEPS } from "./const.js";
import { createBus } from "./bus.js";
import { createRng, seedFrom } from "./rng.js";
import { advanceTime } from "./time.js";
import { createPlayer, stepPlayer } from "./player.js";
import { stepAction } from "./action.js";
import { generateWorld } from "../world/gen.js";
import { createInv, invSave, invLoad } from "../craft/inventory.js";
import * as world from "../world/index.js";
import * as creatures from "../creatures/index.js";
import * as craft from "../craft/index.js";
import * as house from "../house/index.js";

export const SYSTEMS = { world, creatures, craft, house };   // init/step/save/load each, in this order

export function createGame(opts = {}) {
  const save = opts.save || null;
  const seed = seedFrom(save ? save.seed : opts.seed == null ? 1 : opts.seed);
  const W = generateWorld(seed);
  const G = {
    v: SAVE_VERSION, seed, frame: 0,
    bus: createBus(),
    rng: createRng(seed ^ 0x51ed27),
    time: { t: Math.floor(NEW_GAME_F * DAY_FRAMES), day: 1 },
    world: W,
    nextId: W.nextId,
    player: createPlayer(W.spawn.x, W.spawn.y),
    inv: createInv(),
    animals: [], projectiles: [],
    platforms: [],              // one-way px rects { x, y, w } (HOUSE may add upper floors)
    house: null, craft: null,
    target: null,               // action.computeTarget result (renderer outline)
    input: { bits: 0, prev: 0, aim: null },
    stats: { treesFelled: 0, mined: 0, hunted: 0, crafted: 0, eaten: 0, steps: 0 },
    flags: {},                  // free-form one-shot flags (tutorial hints...). Saved.
    headless: !!opts.headless,  // true in Node tests (systems may skip cosmetic work)
  };
  for (const k in SYSTEMS) SYSTEMS[k].init(G);
  if (save) applySave(G, save);
  G.bus.on("tile:break", () => { G.stats.mined++; });
  G.bus.on("player:eat", () => { G.stats.eaten++; });
  return G;
}

export function stepGame(G, bits = 0, aim = null) {
  const prev = G.input.bits;
  G.input.prev = prev; G.input.bits = bits; G.input.aim = aim;
  G.frame++; G.bus.frame = G.frame; G.stats.steps++;
  stepPlayer(G, bits);
  stepAction(G, bits, prev, aim);
  world.step(G);
  creatures.step(G);
  craft.step(G);
  house.step(G);
  advanceTime(G, 1);
  if (G.frame % AUTOSAVE_STEPS === 0) G.bus.emit("autosave", { frame: G.frame });
}

// ---- save object (JSON-able). core/save.js stores it; createGame({save}) restores it ----
export function makeSave(G) {
  const p = G.player;
  const out = {
    v: SAVE_VERSION, seed: G.seed, frame: G.frame, time: { t: G.time.t, day: G.time.day }, nextId: G.nextId, rng: G.rng.state,
    player: { x: Math.round(p.x), y: Math.round(p.y), hp: p.hp, hunger: Math.round(p.hunger * 100) / 100, facing: p.facing, faints: p.faints },
    inv: invSave(G.inv), stats: G.stats, flags: G.flags, at: Date.now(),
  };
  for (const k in SYSTEMS) out[k] = SYSTEMS[k].save(G);
  return out;
}
function applySave(G, s) {
  G.frame = s.frame | 0; G.bus.frame = G.frame;
  if (s.time) { G.time.t = Math.max(0, Math.min(DAY_FRAMES - 1, s.time.t | 0)); G.time.day = Math.max(1, s.time.day | 0); }
  if (s.nextId > G.nextId) G.nextId = s.nextId;
  if (s.rng) G.rng.state = s.rng;
  invLoad(G.inv, s.inv);
  Object.assign(G.stats, s.stats || {});
  G.flags = Object.assign({}, s.flags || {});
  for (const k in SYSTEMS) if (s[k] !== undefined) SYSTEMS[k].load(G, s[k]);
  const p = G.player, sp = s.player || {};
  const num = (v) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  const sx = num(sp.x), sy = num(sp.y), shp = num(sp.hp), shu = num(sp.hunger);
  if (Number.isFinite(sx) && Number.isFinite(sy)) { p.x = sx; p.y = sy; p.ox = p.x; p.oy = p.y; p.peakY = p.y; }
  if (Number.isFinite(shp)) p.hp = Math.max(1, Math.min(p.maxHp, shp));
  if (Number.isFinite(shu)) p.hunger = Math.max(0, Math.min(p.maxHunger, shu));
  if (sp.facing) p.facing = sp.facing > 0 ? 1 : -1;
  p.faints = sp.faints | 0;
}
