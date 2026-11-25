// action.js - what the cube does with B_ACTION / B_USE: targeting, swings, eating, placing, interacting
// (CORE owns; API frozen: BONUS.md 2.5). DOM-free. Dispatches into the systems' public functions.
import { T, B_ACTION, B_USE, B_UP, B_DOWN, REACH_POINTER, REACH_AUTO } from "./const.js";
import { invSelected, invTool, invWear, invRemove } from "../craft/inventory.js";
import { ITEMS } from "../data/items.js";
import { TREE_DEFS, isSolid } from "../data/tiles.js";
import { tileAt } from "./physics.js";
import * as world from "../world/index.js";
import * as creatures from "../creatures/index.js";
import * as craft from "../craft/index.js";
import * as house from "../house/index.js";

// rows a tree occupies for aiming (trunk + crown), by stage
export function treeRows(tree) {
  const h = tree.stage >= 3 ? TREE_DEFS[tree.kind].h : tree.stage === 2 ? Math.ceil(TREE_DEFS[tree.kind].h / 2) : 1;
  return [tree.y - h, tree.y - 1];
}
function treeAtCell(G, tx, ty) {
  for (const tr of world.treesNear(G, tx, 2)) {
    if (tr.x !== tx && !(tr.kind === "ancient" && Math.abs(tr.x - tx) <= 1)) continue;
    const [a, b] = treeRows(tr);
    if (ty >= a && ty <= b) return tr;
  }
  return null;
}

// G.target = what the next swing / use will affect (renderer outlines it). Recomputed every step.
// { kind: "tree"|"object"|"tile"|"air", tx, ty, tree?, obj?, pointer: bool, place: {tx, ty} | null }
export function computeTarget(G, bits, aim) {
  const p = G.player, cx = p.x + p.w / 2, cy = p.y + p.h / 2;
  let tx, ty, pointer = false;
  if (aim && Math.hypot((aim.tx + 0.5) * T - cx, (aim.ty + 0.5) * T - cy) <= REACH_POINTER * T) { tx = aim.tx; ty = aim.ty; pointer = true; }
  else if (bits & B_DOWN) { tx = Math.floor(cx / T); ty = Math.floor((p.y + p.h + 4) / T); }
  else if (bits & B_UP) { tx = Math.floor(cx / T); ty = Math.floor((p.y - 4) / T); }
  else { tx = Math.floor((cx + p.facing * (p.w / 2 + 6)) / T); ty = Math.floor(cy / T); }
  const t = { kind: "air", tx, ty, tree: null, obj: null, pointer, place: null };
  const obj = world.objectAt(G, tx, ty);
  const tree = obj ? null : treeAtCell(G, tx, ty);
  if (obj) { t.kind = "object"; t.obj = obj; }
  else if (tree) { t.kind = "tree"; t.tree = tree; }
  else if (isSolid(tileAt(G, tx, ty))) t.kind = "tile";
  else if (!pointer && !(bits & (B_UP | B_DOWN))) {
    // auto-aim: a tree or object in our own / the front column near our feet beats empty air
    const pc = Math.floor(cx / T), fr = Math.floor((p.y + p.h - 1) / T);
    for (const c of [pc, pc + p.facing]) {
      const o = world.objectAt(G, c, fr);
      if (o) { t.kind = "object"; t.obj = o; t.tx = c; t.ty = fr; break; }
      const tr = treeAtCell(G, c, fr);
      if (tr && tr.stage >= 1) { t.kind = "tree"; t.tree = tr; t.tx = tr.x; t.ty = fr; break; }
    }
  }
  // placement cell for the selected item (renderer draws a ghost)
  const sel = invSelected(G.inv), it = sel && ITEMS[sel.id];
  if (it && (it.place || it.block)) {
    let c = t.kind === "air" ? { tx: t.tx, ty: t.ty } : null;
    if (!c && !pointer) { const ax = Math.floor((cx + p.facing * (p.w / 2 + 6)) / T), ay = Math.floor((p.y + p.h - 1) / T); if (!isSolid(tileAt(G, ax, ay))) c = { tx: ax, ty: ay }; }
    if (c && world.canPlace(G, sel.id, c.tx, c.ty)) t.place = c;
  }
  G.target = t;
  return t;
}

// the melee rect in front of the player for the given reach (tiles)
export function swingRect(G, reach) {
  const p = G.player, cx = p.x + p.w / 2;
  const r = reach * T;
  return p.facing > 0 ? { x0: cx, y0: p.y - 10, x1: cx + r, y1: p.y + p.h + 6 } : { x0: cx - r, y0: p.y - 10, x1: cx, y1: p.y + p.h + 6 };
}

// wear the selected tool (house perk wearMul makes tools last longer). Emits "tool:break".
function wear(G, n = 1) {
  const p = G.player, inv = G.inv, s = invSelected(inv);
  if (!s || s.d == null) return;
  p.wearAcc = (p.wearAcc || 0) + n * house.perkValue(G, "wearMul", 1);
  if (p.wearAcc < 1) return;
  const k = Math.floor(p.wearAcc); p.wearAcc -= k;
  const id = s.id;
  if (invWear(inv, inv.sel, k)) G.bus.emit("tool:break", { id });
}

// called every step after stepPlayer
export function stepAction(G, bits, prevBits, aim) {
  const p = G.player;
  const t = computeTarget(G, bits, aim);
  if (p.dead) return;
  // ---- swing (held) ----
  if ((bits & B_ACTION) && p.swingCd <= 0) {
    const tool = invTool(G.inv);
    if (t.pointer) { const dx = (t.tx + 0.5) * T - (p.x + p.w / 2); if (Math.abs(dx) > 4) p.facing = dx > 0 ? 1 : -1; }
    p.swingCd = tool.cd; p.swingLen = p.swingT = Math.min(tool.cd, 16); p.swingKind = tool.type;
    G.bus.emit("swing", { type: tool.type, tier: tool.tier, dir: p.facing, x: p.x + p.w / 2, y: p.y + p.h / 2 });
    if (tool.type === "bow") {
      const ax = t.pointer ? (t.tx + 0.5) * T : p.x + p.w / 2 + p.facing * 200, ay = t.pointer ? (t.ty + 0.5) * T : p.y + p.h / 2 - 20;
      if (creatures.shoot(G, ax, ay, tool)) wear(G, 1);
    } else {
      const hits = creatures.meleeHit(G, swingRect(G, tool.reach), tool, p.facing);
      let used = hits > 0;
      if (!used) {
        let res = null;
        if (t.kind === "tree") res = world.hitTree(G, t.tree, tool);
        else if (t.kind === "object") res = world.hitObject(G, t.obj, tool);
        else if (t.kind === "tile") res = world.hitTile(G, t.tx, t.ty, tool);
        used = !!(res && res.ok);
      }
      if (used) wear(G, 1);
    }
  }
  // ---- use (edge) ----
  if ((bits & B_USE) && !(prevBits & B_USE)) {
    if (house.interact(G)) return;
    if (t.kind === "object" && world.useObject(G, t.obj)) return;
    const s = invSelected(G.inv), it = s && ITEMS[s.id];
    if (!it) return;
    if (it.food) { craft.eat(G, G.inv.sel); return; }
    if ((it.place || it.block) && t.place) {
      if (world.place(G, s.id, t.place.tx, t.place.ty)) { invRemove(G.inv, s.id, 1); G.bus.emit("place", { id: s.id, tx: t.place.tx, ty: t.place.ty }); }
    }
  }
}
