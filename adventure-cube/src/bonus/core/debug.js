// debug.js - window.__cube.bonus test/debug seam (CORE owns; API frozen: BONUS.md 11). DOM-light.
// Installed when the bonus screen enters. Everything works while the screen is active.
import { T, PW, PH } from "./const.js";
import { stepGame, makeSave } from "./game.js";
import { phase, setDayF, clockText } from "./time.js";
import { placePlayer } from "./player.js";
import { invAdd, invCount, createInv } from "../craft/inventory.js";
import { ITEMS } from "../data/items.js";
import { spawnAnimal } from "../creatures/index.js";
import { setLevel } from "../house/index.js";
import { surfaceAt } from "../world/index.js";

const PHASE_F = { dawn: 0.01, morning: 0.1, day: 0.3, noon: 0.3, dusk: 0.64, night: 0.8, midnight: 0.85 };

export function installDebug(screen, ctx) {
  if (typeof window === "undefined") return;
  window.__cube = window.__cube || {};
  const G = () => screen.G;
  const api = {
    get G() { return screen.G; },
    get screen() { return screen; },
    get ctx() { return ctx; },
    state() {
      const g = G(); if (!g) return { active: false };
      const p = g.player, inv = {};
      for (const s of g.inv.slots) if (s) inv[s.id] = (inv[s.id] || 0) + s.n;
      return {
        active: screen.active, panel: ctx.panel, frame: g.frame, day: g.time.day, t: g.time.t, phase: phase(g), clock: clockText(g),
        x: p.x, y: p.y, tx: Math.floor((p.x + PW / 2) / T), ty: Math.floor((p.y + PH / 2) / T), vx: p.vx, vy: p.vy,
        grounded: p.grounded, inWater: p.inWater, hp: p.hp, maxHp: p.maxHp, hunger: Math.round(p.hunger * 10) / 10, dead: p.dead,
        house: g.house.level, inv, sel: g.inv.sel, animals: g.animals.length, drops: g.world.drops.length,
        target: g.target ? g.target.kind : null, seed: g.seed, stats: Object.assign({}, g.stats),
      };
    },
    give(id, n = 1) { if (!ITEMS[id]) return false; return invAdd(G().inv, id, n) === 0; },
    count: (id) => invCount(G().inv, id),
    clearInv() { const g = G(); g.inv.slots = createInv().slots; g.inv.ver++; },
    select(i) { const g = G(); g.inv.sel = i | 0; g.inv.ver++; },
    // stand in cell (tx, ty) (feet on top of row ty+1); ty omitted = on the surface of column tx
    teleport(tx, ty) { const g = G(); if (ty == null) ty = surfaceAt(g, tx) - 1; placePlayer(g, tx, ty); return { tx, ty }; },
    surface: (tx) => surfaceAt(G(), tx),
    // setTime(0..1 fraction of the day | "dawn" | "day" | "dusk" | "night" | "midnight")
    setTime(v) { const g = G(); setDayF(g, typeof v === "string" ? PHASE_F[v] ?? 0.3 : +v); return phase(g); },
    spawn(kind, tx, ty) {
      const g = G(), p = g.player;
      if (tx == null) tx = Math.floor((p.x + PW / 2) / T) + 4 * p.facing;
      if (ty == null) ty = surfaceAt(g, tx) - 1;
      const a = spawnAnimal(g, kind, tx, ty); return a ? a.id : null;
    },
    setHouse(lv) { setLevel(G(), lv); return G().house.level; },
    setInput(bits, aim) { screen.setOverride(bits, aim); },
    speed(n) { screen.setSpeed(n); },
    // run n steps synchronously (bits held, aim fixed) - fast-forwards the game outside rAF
    step(n = 1, bits = 0, aim = null) { const g = G(); for (let i = 0; i < n; i++) stepGame(g, bits, aim); return api.state(); },
    nearestTree(kind) {
      const g = G(), px = (g.player.x + PW / 2) / T;
      let best = null;
      for (const t of g.world.trees) if (t.stage === 3 && (!kind || t.kind === kind) && (!best || Math.abs(t.x - px) < Math.abs(best.x - px))) best = t;
      return best && { id: best.id, kind: best.kind, x: best.x, y: best.y, stage: best.stage, hp: best.hp };
    },
    nearestObject(kind) {
      const g = G(), px = (g.player.x + PW / 2) / T;
      let best = null;
      for (const o of g.world.objects) if ((!kind || o.kind === kind) && (!best || Math.abs(o.x - px) < Math.abs(best.x - px))) best = o;
      return best && { id: best.id, kind: best.kind, x: best.x, y: best.y };
    },
    openPanel: (n, d) => ctx.openPanel(n, d), closePanel: () => ctx.closePanel(),
    save: () => ctx.save(), dump: () => makeSave(G()),
    load: (s) => screen.load(s), reset: (seed) => screen.newWorld(seed),
  };
  window.__cube.bonus = api;
}
