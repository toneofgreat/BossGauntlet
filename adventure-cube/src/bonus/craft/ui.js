// craft/ui.js - bonus DOM UI: health + hunger HUD, hotbar, tutorial hints, inventory + crafting panel, chest panel,
// touch buttons (CRAFT owns; API frozen: BONUS.md 5.5 + 8.3). DOM. Styles: craft/ui-css.js (class prefix bk-).
//   const ui = createCraftUI(ctx)   ctx = BONUS.md 8.1 (app, G, renderer, input, root, isTouch, openPanel, ...)
//   ui.frame(dt)   every animation frame (cheap: only touches the DOM when inv.ver / hp / hunger / labels change)
//   ui.destroy()   remove every element + listener
// Panels registered here: "craft" (data: { station? } focuses that station) and "chest" (data: { obj } world chest |
// { house: true } = G.house.chest).
// Slot handling (mouse, touch, keyboard): click/tap an item to pick it up, click/tap another slot to move or swap it;
// drag and drop works too; shift-click moves a stack between hotbar and backpack (or bag and chest); double-click
// food to eat. In the craft panel: Up/Down choose a recipe, Enter crafts (Shift+Enter x5), Left/Right switch stations.
import { B_ACTION, B_USE, T } from "../core/const.js";
import { ITEMS, TIERS, itemName } from "../data/items.js";
import { STATIONS, STATION_INFO, RECIPES_BY_STATION, RECIPE } from "../data/recipes.js";
import { OBJECT_DEFS } from "../data/tiles.js";
import { houseLevel } from "../data/house.js";
import { createInv, invSelect, invMove, invQuickMove, invSplit, invSort, invSelected, HOTBAR } from "./inventory.js";
import { craft, eat, stationsNear, craftMax, cookAll, dropSlot, stationLevel, status, foodGain } from "./index.js";
import { invCount } from "./inventory.js";
import { currentHint, setHintsOff } from "./tutorial.js";
import * as house from "../house/index.js";
import { CRAFT_CSS } from "./ui-css.js";

const SVG_HEART = `<svg viewBox="0 0 24 24"><path fill="#ff5d4f" stroke="#7a1712" stroke-width="1.3" d="M12 21s-7.6-4.7-9.7-9.3C.8 8.4 2.8 4.3 6.8 4.3c2.2 0 3.9 1.3 5.2 3.1 1.3-1.8 3-3.1 5.2-3.1 4 0 6 4.1 4.5 7.4C19.6 16.3 12 21 12 21z"/><path fill="#fff" opacity=".55" d="M6.4 7.2c-1.4.3-2.2 1.6-2 3 .5-1.1 1.3-1.9 2.6-2.2z"/></svg>`;
const SVG_FOOD = `<svg viewBox="0 0 24 24"><path fill="#f3e4c6" stroke="#6b5a40" stroke-width="1" d="M8.9 15.1 5.6 18.4a1.9 1.9 0 1 0-1.4 2.6 1.9 1.9 0 1 0 2.6-1.4l3.3-3.3z"/><path fill="#d9822b" stroke="#6e3a10" stroke-width="1.3" d="M14.6 2.8c3.6 0 6.6 3 6.6 6.6 0 4.6-5 7.2-8.8 6.9l-2.2-2.2C9.9 10.3 10.6 2.8 14.6 2.8z"/><path fill="#fff" opacity=".45" d="M14.3 4.6c-1.7.3-2.8 1.8-3 3.6.8-1.4 1.9-2.4 3.4-2.9z"/></svg>`;
const SVG_BAG = `<svg viewBox="0 0 24 24"><path fill="#c98a4b" stroke="#fff" stroke-width="1.4" d="M5 9.5C5 7 7 5.5 9 5.5h6c2 0 4 1.5 4 4V19a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19z"/><path fill="none" stroke="#fff" stroke-width="1.4" d="M9 5.5V4a3 3 0 0 1 6 0v1.5M8 13h8"/></svg>`;
const TAB_NAME = { all: "All", hand: "Hand", workbench: "Bench", campfire: "Fire", furnace: "Furnace", anvil: "Anvil", smoker: "Smoker", kitchen: "Kitchen" };
const KIND_NAME = { resource: "Material", food: "Food", tool: "Tool", place: "Placeable", block: "Building block", ammo: "Ammo" };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const durColor = (f) => `hsl(${Math.round(f * 110)},75%,${f < 0.25 ? 55 : 48}%)`;

export function createCraftUI(ctx) {
  const root = ctx.root, touch = !!ctx.isTouch;
  const els = [], L = [], offs = [];
  const on = (t, e, f, o) => { t.addEventListener(e, f, o); L.push([t, e, f, o]); };
  const st = document.createElement("style"); st.textContent = CRAFT_CSS; document.head.appendChild(st); els.push(st);
  const mk = (cls, html = "", parent = root) => { const d = document.createElement("div"); d.className = cls; d.innerHTML = html; parent.appendChild(d); if (parent === root) els.push(d); return d; };

  // ---------------------------------------------------------------- icons
  function drawIc(cv, id) {
    const g = cv.getContext("2d");
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height);
    if (id && ITEMS[id] && ctx.renderer) { try { g.save(); ctx.renderer.drawIcon(g, id, 0, 0, cv.width); g.restore(); } catch (e) { /* icon painter error: leave blank */ } }
  }
  const tipText = (s) => { const it = ITEMS[s.id]; let t = it.name; if (s.n > 1) t += " x" + s.n; if (it.tool && s.d != null) t += ` (${s.d}/${it.tool.dur})`; return t; };
  function slotHtml(g, i, key) { return `<button type="button" class="bk-slot" data-g="${g}" data-i="${i}"><canvas width="96" height="96"></canvas><b></b><u><i></i></u>${key ? `<em>${key}</em>` : ""}</button>`; }
  function paintSlot(el, s) {
    const sig = s ? s.id + "|" + s.n + "|" + (s.d == null ? "" : s.d) : "";
    if (el._sig === sig) return;
    const id = s ? s.id : null;
    if (el._id !== id) { el._id = id; drawIc(el.firstChild, id); }
    el._sig = sig;
    el.children[1].textContent = s && s.n > 1 ? s.n : "";
    const u = el.children[2], it = s && ITEMS[s.id];
    if (it && it.tool && s.d != null && s.d < it.tool.dur) {
      const f = clamp01(s.d / it.tool.dur);
      u.style.display = "block"; u.firstChild.style.transform = `scaleX(${f.toFixed(3)})`; u.firstChild.style.background = durColor(f);
    } else u.style.display = "none";
    el.title = s ? tipText(s) : "";
    el.setAttribute("aria-label", s ? tipText(s) : "Empty slot");
  }

  // ---------------------------------------------------------------- HUD (top-left)
  const hud = mk("bk-hud", `
    <div class="bk-row hp">${SVG_HEART}<div class="bk-bar"><s></s><i></i><em></em></div><span class="bk-num"></span></div>
    <div class="bk-row hu">${SVG_FOOD}<div class="bk-bar"><s></s><i></i><em></em></div><span class="bk-num"></span></div>
    <div class="bk-chips"></div>`);
  const rowHp = hud.children[0], rowHu = hud.children[1], chips = hud.children[2];
  const hpI = rowHp.querySelector("i"), hpS = rowHp.querySelector("s"), hpN = rowHp.querySelector(".bk-num");
  const huI = rowHu.querySelector("i"), huS = rowHu.querySelector("s"), huN = rowHu.querySelector(".bk-num");
  const flash = (el, cls, ms) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); clearTimeout(el["_t" + cls]); el["_t" + cls] = setTimeout(() => el.classList.remove(cls), ms); };

  // ---------------------------------------------------------------- tutorial hint card
  const hint = mk("bk-hint off", `<span class="bk-hn"></span><p></p><button type="button" class="bk-hx" aria-label="Hide hints" title="Hide hints">&times;</button>`);
  const hintN = hint.children[0], hintP = hint.children[1];
  let hintTimer = 0;
  function showHint(fresh) {
    const G = ctx.G, h = currentHint(G);
    clearTimeout(hintTimer);
    if (!h) {
      if (fresh && !G.flags.tutOff && (G.flags.tut | 0) > 0) {
        hintN.textContent = "Done"; hintP.textContent = "Tutorial complete! Keep exploring, hunting and upgrading your house.";
        hint.classList.remove("off"); flash(hint, "new", 600);
        hintTimer = setTimeout(() => hint.classList.add("off"), 8000);
      } else hint.classList.add("off");
      return;
    }
    hintN.textContent = `${h.i + 1}/${h.n}`;
    hintP.textContent = touch ? h.touch : h.text;
    hint.classList.remove("off");
    if (fresh) flash(hint, "new", 600);
  }
  on(hint, "click", (e) => { if (e.target.closest(".bk-hx")) { setHintsOff(ctx.G, true); hint.classList.add("off"); ctx.toast("Hints hidden (turn them back on in the bag)", 2200); } });

  // ---------------------------------------------------------------- hotbar
  const hot = mk("bk-hot");
  const hotSlots = [];
  for (let i = 0; i < HOTBAR; i++) {
    const w = document.createElement("div"); w.innerHTML = slotHtml("hot", i, touch ? "" : String(i + 1));
    const b = w.firstChild; hot.appendChild(b); hotSlots.push(b);
  }
  on(hot, "click", (e) => { const b = e.target.closest(".bk-slot"); if (b) invSelect(ctx.G.inv, +b.dataset.i); });
  const selName = mk("bk-selname");
  let selKey = "", selTimer = 0;

  // ---------------------------------------------------------------- touch buttons
  let tHit = null, tUse = null, tBag = null, hitCv = null, hitLbl = null, useLbl = null, hitIcon = null;
  if (touch) {
    const tb = mk("bk-touch", `<button type="button" class="bk-tb hit" data-k="act" aria-label="Hit"><canvas width="68" height="68"></canvas><span>HIT</span></button>`);
    const tb2 = mk("bk-touch2", `<button type="button" class="bk-tb" data-k="bag" aria-label="Bag">${SVG_BAG}<span>BAG</span></button><button type="button" class="bk-tb use" data-k="use" aria-label="Use"><span>USE</span></button>`);
    tHit = tb.firstChild; hitCv = tHit.querySelector("canvas"); hitLbl = tHit.querySelector("span");
    tBag = tb2.children[0]; tUse = tb2.children[1]; useLbl = tUse.querySelector("span");
    const release = () => { if (ctx.input) ctx.input.release(B_ACTION); tHit.classList.remove("on"); };
    on(tHit, "pointerdown", (e) => { e.preventDefault(); try { tHit.setPointerCapture(e.pointerId); } catch (er) { /* ok */ } if (ctx.input) ctx.input.press(B_ACTION); tHit.classList.add("on"); });
    on(tHit, "pointerup", release); on(tHit, "pointercancel", release); on(tHit, "lostpointercapture", release); on(tHit, "pointerleave", (e) => { if (!tHit.hasPointerCapture || !tHit.hasPointerCapture(e.pointerId)) release(); });
    on(tUse, "pointerdown", (e) => { e.preventDefault(); if (ctx.input) ctx.input.pulse(B_USE); flash(tUse, "on", 160); });
    on(tBag, "pointerdown", (e) => { e.preventDefault(); ctx.openPanel(ctx.panel === "craft" ? null : "craft"); });
    on(tb, "contextmenu", (e) => e.preventDefault()); on(tb2, "contextmenu", (e) => e.preventDefault());
    on(window, "blur", release);
  }
  function hitLabel(G) {
    const t = G.target, tool = invSelected(G.inv), tt = tool && ITEMS[tool.id] && ITEMS[tool.id].tool;
    if (tt && tt.type === "bow") return "SHOOT";
    if (!t) return "HIT";
    if (t.kind === "tree") return "CHOP";
    if (t.kind === "tile") return "MINE";
    return "HIT";
  }
  function useLabel(G) {
    const p = G.player, t = G.target;
    if (house.nearHome(G, 0)) {
      const tx = Math.floor((p.x + p.w / 2) / T), f = house.footprint(G);
      if (Math.abs(tx - f.doorX) <= 2 || G.house.level === 0) return ["HOME", true];
    }
    if (t && t.kind === "object" && t.obj) {
      const d = OBJECT_DEFS[t.obj.kind] || {};
      if (d.station || d.use === "chest") return ["OPEN", true];
      if ((t.obj.kind === "bush" && t.obj.n > 0) || t.obj.kind === "mushroom") return ["PICK", true];
    }
    const s = invSelected(G.inv), it = s && ITEMS[s.id];
    if (it && it.food) return [it.food.raw && it.food.cooks && stationsNear(G).has("campfire") ? "COOK" : it.food.medicine ? "HEAL" : "EAT", true];
    if (it && (it.place || it.block) && t && t.place) return ["PLACE", true];
    return ["USE", false];
  }

  // ---------------------------------------------------------------- panels (shared slot handling)
  let P = null; // { kind, el, data, pick: {g, i} | null, tab, only, view, focus, key, drag, slots: [els] }
  const chestInv = () => {
    if (!P) return null;
    if (P.data.house) return ctx.G.house.chest;
    const o = P.data.obj;
    if (o && !o.inv) o.inv = createInv((OBJECT_DEFS[o.kind] && OBJECT_DEFS[o.kind].slots) || 18);
    return o ? o.inv : null;
  };
  const invOf = (g) => (g === "chest" ? chestInv() : ctx.G.inv);
  const slotOf = (el) => { const inv = invOf(el.dataset.g); return inv ? inv.slots[+el.dataset.i] : null; };

  function closeP() {
    if (!P) return;
    endDrag(true);
    P.el.remove();
    const i = els.indexOf(P.el); if (i >= 0) els.splice(i, 1);
    P = null;
  }
  function panelKey() { const G = ctx.G, c = P && P.kind === "chest" ? chestInv() : null; return G.inv.ver * 7919 + G.inv.sel * 13 + (c ? c.ver : 0); }

  // slot click: pick -> place / swap; shift = quick move; plain click on a hotbar slot also selects it
  function slotClick(el, e) {
    const G = ctx.G, g = el.dataset.g, i = +el.dataset.i, inv = invOf(g);
    if (!inv) return;
    if (e.shiftKey) { quickMove(g, i); P.pick = null; refresh(); return; }
    if (P.pick) {
      const a = P.pick; P.pick = null;
      if (!(a.g === g && a.i === i)) invMove(invOf(a.g), a.i, inv, i);
      if (g === "inv" && i < HOTBAR) invSelect(G.inv, i);
      refresh(); showInfoSlot(g, i);
      return;
    }
    if (g === "inv" && i < HOTBAR) invSelect(G.inv, i);
    if (inv.slots[i]) P.pick = { g, i };
    refresh(); showInfoSlot(g, i);
  }
  function quickMove(g, i) {
    const G = ctx.G;
    if (P.kind === "chest") { const c = chestInv(); if (g === "chest") invQuickMove(c, i, G.inv); else invQuickMove(G.inv, i, c); }
    else if (i < HOTBAR) invQuickMove(G.inv, i, G.inv, HOTBAR, G.inv.slots.length);
    else invQuickMove(G.inv, i, G.inv, 0, HOTBAR);
  }
  function slotDbl(el) {
    const G = ctx.G, g = el.dataset.g, i = +el.dataset.i, s = slotOf(el);
    if (!s) return;
    P.pick = null;
    if (g === "inv" && ITEMS[s.id].food && P.kind === "craft") eat(G, i);
    else if (P.kind === "chest") quickMove(g, i);
    refresh(); showInfoSlot(g, i);
  }
  // drag and drop (mouse + touch) on top of click-to-pick
  function startDrag(e, el) {
    if (e.button > 0 || !slotOf(el)) return;
    P.drag = { x: e.clientX, y: e.clientY, g: el.dataset.g, i: +el.dataset.i, moved: false, ghost: null, id: e.pointerId };
  }
  function moveDrag(e) {
    const d = P && P.drag; if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 9) {
      d.moved = true;
      const s = invOf(d.g).slots[d.i]; if (!s) { P.drag = null; return; }
      const cv = document.createElement("canvas"); cv.width = cv.height = 96; cv.className = "bk-ghost"; drawIc(cv, s.id);
      document.body.appendChild(cv); d.ghost = cv;
    }
    if (d.ghost) { d.ghost.style.left = e.clientX + "px"; d.ghost.style.top = e.clientY + "px"; e.preventDefault(); }
  }
  function endDrag(cancel, e) {
    const d = P && P.drag; if (!d) return;
    if (d.ghost) d.ghost.remove();
    P.drag = null;
    if (cancel || !d.moved || !e) return;
    P.suppress = Date.now() + 250;
    const tgt = document.elementFromPoint(e.clientX, e.clientY), b = tgt && tgt.closest && tgt.closest(".bk-slot");
    if (b && P.el.contains(b) && !(b.dataset.g === d.g && +b.dataset.i === d.i)) {
      invMove(invOf(d.g), d.i, invOf(b.dataset.g), +b.dataset.i);
      if (b.dataset.g === "inv" && +b.dataset.i < HOTBAR) invSelect(ctx.G.inv, +b.dataset.i);
      P.pick = null; refresh(); showInfoSlot(b.dataset.g, +b.dataset.i);
    }
  }
  on(window, "pointermove", moveDrag, { passive: false });
  on(window, "pointerup", (e) => endDrag(false, e));
  on(window, "pointercancel", () => endDrag(true));

  // ---------------------------------------------------------------- item info box
  function itemStats(id, s) {
    const it = ITEMS[id], G = ctx.G, out = [];
    if (it.food) {
      const g = foodGain(G, id);
      if (g.hunger) out.push(`+${Math.round(g.hunger)} food`);
      if (g.hp) out.push(`+${Math.round(g.hp)} health`);
      if (it.food.raw) out.push("raw");
    }
    if (it.tool) {
      const t = it.tool;
      if (t.type === "bow") out.push(`damage ${t.dmg}`, `range ${t.reach}`);
      else {
        if (t.type === "axe" || t.type === "pickaxe" || t.type === "hammer") out.push(`power ${t.power}`);
        out.push(`damage ${t.dmg}`);
        if (t.type === "spear") out.push(`reach ${t.reach}`);
      }
      out.push(`durability ${s && s.d != null ? s.d : t.dur}/${t.dur}`);
    }
    return out.map((x) => `<span>${esc(x)}</span>`).join("");
  }
  function showInfo(id, s, g, i) {
    if (!P || !P.info) return;
    const box = P.info;
    if (!id || !ITEMS[id]) {
      box.innerHTML = `<p class="tip">${P.kind === "chest" ? (touch ? "Tap an item to pick it up, then tap a slot to put it there. Double-tap moves it between chest and bag." : "Click an item to pick it up, then click a slot to put it there. Shift-click or double-click moves it between chest and bag.") : touch ? "Tap an item to pick it up, then tap another slot to move it. Double-tap food to eat it." : "Click an item to pick it up, then click a slot to move it. Shift-click moves between hotbar and bag. Double-click food to eat."}</p>`;
      return;
    }
    const it = ITEMS[id], tier = it.tool ? (it.tool.type === "bow" ? "" : " · " + TIERS[it.tool.tier]) : "";
    let acts = "";
    if (s && g === "inv") {
      if (it.food) acts += `<button type="button" class="pri" data-a="eat">${it.food.raw && it.food.cooks && stationsNear(ctx.G).has("campfire") ? "Cook" : it.food.medicine ? "Use" : "Eat"}</button>`;
      if (i >= HOTBAR) acts += `<button type="button" data-a="tohot">To hotbar</button>`; else acts += `<button type="button" data-a="tobag">To bag</button>`;
      if (s.n > 1) acts += `<button type="button" data-a="split">Split</button>`;
      acts += `<button type="button" data-a="drop">Drop${s.n > 1 ? " 1" : ""}</button>`;
    }
    box.innerHTML = `<canvas width="96" height="96"></canvas><div class="t"><b>${esc(it.name)}${s && s.n > 1 ? " <small>x" + s.n + "</small>" : ""}</b>
      <div class="k">${KIND_NAME[it.kind] || it.kind}${tier}${!s ? " · carrying " + invCount(ctx.G.inv, id) : ""}</div>
      ${it.desc ? `<p>${esc(it.desc)}</p>` : ""}<div class="st">${itemStats(id, s)}</div>${acts ? `<div class="acts" data-g="${g}" data-i="${i}">${acts}</div>` : ""}</div>`;
    drawIc(box.firstChild, id);
  }
  function showInfoSlot(g, i) { const inv = invOf(g), s = inv && inv.slots[i]; if (s) showInfo(s.id, s, g, i); else showInfo(null); }
  function infoAction(a, g, i) {
    const G = ctx.G, s = G.inv.slots[i];
    if (!s) return;
    P.pick = null;
    if (a === "eat") eat(G, i);
    if (a === "tohot") { const r = invQuickMove(G.inv, i, G.inv, 0, HOTBAR); if (r === s.n) { invMove(G.inv, i, G.inv, G.inv.sel); } }
    if (a === "tobag") invQuickMove(G.inv, i, G.inv, HOTBAR, G.inv.slots.length);
    if (a === "split") invSplit(G.inv, i);
    if (a === "drop") { const id = s.id, n = dropSlot(G, i, 1); if (n) say("Dropped " + itemName(id)); }
    refresh(); showInfoSlot(g, i);
  }

  // ---------------------------------------------------------------- craft panel
  function stationHow(stn) {
    const info = STATION_INFO[stn] || { name: stn, how: "" };
    const lv = stationLevel(stn), L = lv && houseLevel(lv);
    if ((stn === "smoker" || stn === "kitchen") && L) return `House level ${lv} (${L.name}): use it at home.`;
    return info.how;
  }
  const CHIP_RANK = { starving: 0, sick: 1, hungry: 2, home: 3, fed: 4 };
  function recipeRow(r) {
    const out = ITEMS[r.out[0]];
    const chipsH = Object.entries(r.cost).map(([id]) => `<span class="bk-chip" data-id="${id}" title="${esc(itemName(id))}"><canvas width="40" height="40"></canvas><span></span><em>${esc(itemName(id))}</em></span>`).join("");
    return `<div class="bk-rec" data-r="${r.id}"><span class="bk-ic"><canvas width="96" height="96"></canvas>${r.out[1] > 1 ? `<b>x${r.out[1]}</b>` : ""}</span>
      <div><div class="bk-rn" title="${esc(out.name)}">${esc(out.name)}</div><div class="bk-cost">${chipsH}</div></div>
      <div class="bk-btns"><button type="button" class="pri" data-c="1">Craft</button><div class="r2"><button type="button" data-c="5">x5</button><button type="button" data-c="max">All</button></div></div></div>`;
  }
  function buildCraft(data) {
    const tabs = ["all"].concat(STATIONS);
    const el = mk("bk-panel bk-craft");
    el.dataset.view = "craft";
    el.innerHTML = `
      <div class="bk-head"><h2>Bag &amp; crafting<small>Stations work within 4 tiles. Some come with your house.</small></h2>
        <span class="bk-msg"></span><div class="bk-seg"><button type="button" data-v="craft" class="on">Craft</button><button type="button" data-v="bag">Bag</button></div><button type="button" class="bk-house" data-a="house" title="House upgrades (H)" aria-label="House upgrades">&#x1F3E0;</button></div>
      <button type="button" class="bk-close" data-a="close" aria-label="Close" title="Close (Esc)">&#x2715;</button>
      <div class="bk-body">
        <section class="bk-bag">
          <div class="bk-sub"><span>Hotbar</span></div>
          <div class="bk-grid hot">${Array.from({ length: HOTBAR }, (_, i) => slotHtml("inv", i, touch ? "" : String(i + 1))).join("")}</div>
          <div class="bk-sub"><span>Backpack</span><button type="button" class="bk-mini" data-a="sort">Sort</button></div>
          <div class="bk-grid">${Array.from({ length: ctx.G.inv.slots.length - HOTBAR }, (_, k) => slotHtml("inv", k + HOTBAR)).join("")}</div>
          <div class="bk-info"></div>
        </section>
        <section class="bk-cr">
          <div class="bk-tabs">${tabs.map((t) => `<button type="button" class="bk-tab${t === "all" ? " all" : ""}" data-tab="${t}" title="${esc(t === "all" ? "All recipes" : STATION_INFO[t].name)}">${TAB_NAME[t] || t}<i></i></button>`).join("")}</div>
          <div class="bk-tools"><label class="bk-only"><input type="checkbox"> Only what I can make</label><button type="button" class="bk-mini" data-a="cookall">Cook all</button></div>
          <div class="bk-list">${STATIONS.map((stn) => `<div class="bk-grp" data-st="${stn}"><div class="bk-gh"><b>${esc(STATION_INFO[stn].name)}</b><small></small></div>${RECIPES_BY_STATION[stn].map(recipeRow).join("")}</div>`).join("")}<div class="bk-empty" hidden>Nothing to craft here yet. Gather more materials!</div></div>
        </section>
      </div>
      <div class="bk-foot"><span>${touch ? "" : "Up/Down + Enter: craft &middot; Shift+Enter: x5 &middot; Left/Right: stations &middot; E / Esc: close"}</span><label><input type="checkbox" data-a="hints"> Show hints</label></div>`;
    P = { kind: "craft", el, data: data || {}, pick: null, tab: data && data.station && STATIONS.includes(data.station) ? data.station : "all", only: false, focus: null, key: -1, drag: null, suppress: 0 };
    P.info = el.querySelector(".bk-info");
    P.slots = Array.from(el.querySelectorAll(".bk-slot"));
    P.rows = Array.from(el.querySelectorAll(".bk-rec"));
    P.groups = Array.from(el.querySelectorAll(".bk-grp"));
    P.tabs = Array.from(el.querySelectorAll(".bk-tab"));
    P.empty = el.querySelector(".bk-empty");
    for (const row of P.rows) {
      const r = RECIPE[row.dataset.r];
      drawIc(row.querySelector(".bk-ic canvas"), r.out[0]);
      row._chips = Array.from(row.querySelectorAll(".bk-chip")).map((c) => { drawIc(c.firstChild, c.dataset.id); return [c, c.dataset.id, r.cost[c.dataset.id]]; });
      row._btns = Array.from(row.querySelectorAll("button"));
    }
    el.querySelector('input[data-a="hints"]').checked = !ctx.G.flags.tutOff;
    wirePanel(el);
    showInfo(null);
    refresh(true);
    if (P.tab !== "all") { P.view = "craft"; }
  }
  function refreshCraft() {
    const G = ctx.G, stns = stationsNear(G);
    let anyVisible = false;
    const counts = {};
    for (const grp of P.groups) {
      const stn = grp.dataset.st, ready = stns.has(stn);
      grp.classList.toggle("locked", !ready);
      grp.querySelector("small").textContent = ready ? (stn === "hand" ? "always" : "ready") : stationHow(stn);
      let can = 0;
      for (const row of grp.querySelectorAll(".bk-rec")) {
        const id = row.dataset.r, max = craftMax(G, id), ok = ready && max > 0;
        row.classList.toggle("can", ok); row.classList.toggle("no", !ok);
        for (const [c, cid, need] of row._chips) {
          const have = invCount(G.inv, cid);
          c.classList.toggle("no", have < need);
          c.children[1].textContent = `${Math.min(have, 999)}/${need}`;
        }
        row._btns[0].disabled = !ok; row._btns[1].disabled = !ok || max < 2; row._btns[2].disabled = !ok || max < 2;
        row._btns[2].title = ok && max > 1 ? "Craft " + max + " times" : "Craft as many as possible";
        row.hidden = P.only && !ok;
        if (ok) can++;
      }
      counts[stn] = { ready, can };
      const show = (P.tab === "all" || P.tab === stn) && !(P.only && !can);
      grp.hidden = !show;
      grp.classList.toggle("fold", P.tab === "all" && !ready);
      if (show && (ready || P.tab === stn)) anyVisible = anyVisible || !P.only || can > 0;
    }
    P.empty.hidden = anyVisible;
    for (const tb of P.tabs) {
      const t = tb.dataset.tab, c = counts[t];
      tb.classList.toggle("on", t === P.tab);
      if (c) { tb.classList.toggle("ready", c.ready); tb.lastChild.textContent = c.ready && c.can ? c.can : ""; }
    }
    if (P.focus && (P.focus.hidden || P.focus.parentNode.hidden)) setFocus(null);
  }
  function setFocus(row) {
    if (P.focus) P.focus.classList.remove("focus");
    P.focus = row;
    if (row) { row.classList.add("focus"); row.scrollIntoView({ block: "nearest" }); showInfo(RECIPE[row.dataset.r].out[0], null); }
  }
  function visibleRows() { return P.rows.filter((r) => !r.hidden && !r.parentNode.hidden && !r.parentNode.classList.contains("fold")); }
  function say(text) {
    const m = P && P.el && P.el.querySelector(".bk-msg");
    if (!m) { ctx.toast(text, 1300); return; }
    m.textContent = text; flash(m, "on", 1600);
  }
  function doCraft(id, how, row) {
    const G = ctx.G, max = craftMax(G, id), times = how === "max" ? max : how === "5" ? 5 : 1;
    const n = craft(G, id, times);
    if (n) {
      const r = RECIPE[id];
      say(`+${r.out[1] * n} ${itemName(r.out[0])}`);
      if (row) flash(row, "done", 520);
    }
    refresh();
    if (row) showInfo(RECIPE[id].out[0], null);
  }

  // ---------------------------------------------------------------- chest panel
  function buildChest(data) {
    const G = ctx.G;
    P = { kind: "chest", el: null, data: data || {}, pick: null, key: -1, drag: null, suppress: 0 };
    const ch = chestInv();
    if (!ch) { P = null; ctx.toast("This chest is empty and closed", 1500); setTimeout(() => ctx.closePanel(), 0); return; }
    const el = mk("bk-panel bk-chest");
    P.el = el;
    el.innerHTML = `
      <div class="bk-head"><h2>${P.data.house ? "House chest" : "Chest"}<small>${ch.slots.length} slots${P.data.house ? " · grows with your house" : ""}</small></h2><span class="bk-msg"></span></div>
      <button type="button" class="bk-close" data-a="close" aria-label="Close" title="Close (Esc)">&#x2715;</button>
      <div class="bk-scroll">
        <div class="bk-sub"><span>${P.data.house ? "House chest" : "Chest"}</span><button type="button" class="bk-mini" data-a="take">Take all</button></div>
        <div class="bk-grid">${ch.slots.map((_, i) => slotHtml("chest", i)).join("")}</div>
        <div class="bk-sub"><span>Your bag</span><span><button type="button" class="bk-mini" data-a="store">Store all from backpack</button> <button type="button" class="bk-mini" data-a="sortc">Sort chest</button></span></div>
        <div class="bk-grid hot">${Array.from({ length: HOTBAR }, (_, i) => slotHtml("inv", i, touch ? "" : String(i + 1))).join("")}</div>
        <div class="bk-grid">${Array.from({ length: G.inv.slots.length - HOTBAR }, (_, k) => slotHtml("inv", k + HOTBAR)).join("")}</div>
        <div class="bk-info"></div>
      </div>
      <div class="bk-foot"><span>${touch ? "Tap to pick up, tap a slot to place. Double-tap moves an item across." : "Click to pick up, click to place &middot; Shift-click or double-click moves an item across"}</span></div>`;
    P.info = el.querySelector(".bk-info");
    P.slots = Array.from(el.querySelectorAll(".bk-slot"));
    wirePanel(el);
    showInfo(null);
    refresh(true);
  }

  // ---------------------------------------------------------------- shared panel wiring + refresh
  function wirePanel(el) {
    el.addEventListener("click", (e) => {
      const G = ctx.G;
      const chip = e.target.closest(".bk-chip");
      if (chip && P) { const row = chip.closest(".bk-rec"), need = row && RECIPE[row.dataset.r].cost[chip.dataset.id]; say(`Needs ${need} ${itemName(chip.dataset.id)} (you have ${invCount(G.inv, chip.dataset.id)})`); return; }
      const b = e.target.closest("button");
      if (!b || !P) return;
      if (b.dataset.a === "close") { ctx.closePanel(); return; }
      if (b.dataset.a === "house") { ctx.openPanel("house"); return; }
      if (b.classList.contains("bk-slot")) { if (Date.now() < P.suppress) return; slotClick(b, e); return; }
      if (b.dataset.v) { P.el.dataset.view = b.dataset.v; for (const x of P.el.querySelectorAll(".bk-seg button")) x.classList.toggle("on", x === b); return; }
      if (b.dataset.tab) { P.tab = b.dataset.tab; setFocus(null); refresh(true); return; }
      if (b.dataset.c) { const row = b.closest(".bk-rec"); setFocus(row); doCraft(row.dataset.r, b.dataset.c, row); return; }
      const a = b.dataset.a;
      if (a === "sort") { P.pick = null; invSort(G.inv); refresh(); return; }
      if (a === "cookall") { const n = cookAll(G); say(n ? `Cooked ${n} food` : stationsNear(G).has("campfire") ? "Nothing raw to cook" : "Needs a campfire nearby"); refresh(); return; }
      if (a === "take") { const c = chestInv(); for (let i = 0; i < c.slots.length; i++) invQuickMove(c, i, G.inv); P.pick = null; refresh(); return; }
      if (a === "store") { const c = chestInv(); for (let i = HOTBAR; i < G.inv.slots.length; i++) invQuickMove(G.inv, i, c); P.pick = null; refresh(); return; }
      if (a === "sortc") { invSort(chestInv(), 0); P.pick = null; refresh(); return; }
      const acts = b.closest(".acts");
      if (acts && a) { infoAction(a, acts.dataset.g, +acts.dataset.i); return; }
    });
    el.addEventListener("dblclick", (e) => { const b = e.target.closest(".bk-slot"); if (b && P) slotDbl(b); });
    el.addEventListener("pointerdown", (e) => { const b = e.target.closest(".bk-slot"); if (b && P) startDrag(e, b); });
    el.addEventListener("change", (e) => {
      if (!P) return;
      if (e.target.closest(".bk-only")) { P.only = e.target.checked; setFocus(null); refresh(true); }
      if (e.target.dataset.a === "hints") { setHintsOff(ctx.G, !e.target.checked); showHint(false); }
    });
    if (!touch) el.addEventListener("mouseover", (e) => {
      if (!P || P.pick || P.drag) return;
      const b = e.target.closest(".bk-slot");
      if (b) { const s = slotOf(b); if (s) showInfo(s.id, s, b.dataset.g, +b.dataset.i); return; }
      const row = e.target.closest(".bk-rec"); if (row && !P.focus) showInfo(RECIPE[row.dataset.r].out[0], null);
    });
  }
  function refresh(force = true) {
    if (!P) return;
    const G = ctx.G, k = panelKey();
    if (!force && k === P.key) return;
    P.key = k;
    for (const el of P.slots) {
      const s = slotOf(el);
      paintSlot(el, s);
      el.classList.toggle("sel", el.dataset.g === "inv" && +el.dataset.i === G.inv.sel);
      el.classList.toggle("picked", !!(P.pick && P.pick.g === el.dataset.g && P.pick.i === +el.dataset.i));
    }
    if (P.pick && !invOf(P.pick.g).slots[P.pick.i]) P.pick = null;
    if (P.kind === "craft") refreshCraft();
  }
  // keyboard inside the craft panel
  on(window, "keydown", (e) => {
    if (!P || P.kind !== "craft" || ctx.panel !== "craft") return;
    const t = e.target; if (t && (t.tagName === "INPUT" && t.type === "text")) return;
    if (e.code === "ArrowDown" || e.code === "ArrowUp") {
      const rows = visibleRows(); if (!rows.length) return;
      let i = rows.indexOf(P.focus);
      i = i < 0 ? (e.code === "ArrowDown" ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, i + (e.code === "ArrowDown" ? 1 : -1)));
      setFocus(rows[i]); e.preventDefault();
    } else if ((e.code === "Enter" || e.code === "NumpadEnter") && P.focus) {
      doCraft(P.focus.dataset.r, e.shiftKey ? "5" : "1", P.focus); e.preventDefault();
    } else if (e.code === "ArrowLeft" || e.code === "ArrowRight") {
      const tabs = ["all"].concat(STATIONS);
      const i = (tabs.indexOf(P.tab) + (e.code === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
      P.tab = tabs[i]; setFocus(null); refresh(true); e.preventDefault();
    }
  });

  ctx.registerPanel("craft", { open: (d) => { closeP(); buildCraft(d); }, close: closeP });
  ctx.registerPanel("chest", { open: (d) => { closeP(); buildChest(d); }, close: closeP });

  // ---------------------------------------------------------------- bus reactions
  const G0 = ctx.G;
  offs.push(
    G0.bus.on("hint", () => showHint(true)),
    G0.bus.on("player:hurt", () => flash(rowHp, "hit", 380)),
    G0.bus.on("player:eat", () => { flash(rowHu, "gain", 500); flash(rowHp, "gain", 500); }),
  );
  showHint(false);

  // ---------------------------------------------------------------- per-frame update
  let lastVer = -1, lastSel = -1, lastHp = "", lastHu = "", lastChips = "", n = 0, lastHit = "", lastUse = "", lastPanel = null;
  return {
    frame() {
      const G = ctx.G; if (!G) return;
      const p = G.player, inv = G.inv;
      if (inv.ver !== lastVer || inv.sel !== lastSel) {
        lastVer = inv.ver;
        for (let i = 0; i < HOTBAR; i++) { paintSlot(hotSlots[i], inv.slots[i]); hotSlots[i].classList.toggle("sel", i === inv.sel); }
        const s = inv.slots[inv.sel], key = inv.sel + ":" + (s ? s.id : "");
        if (key !== selKey) {
          const first = selKey === ""; selKey = key;
          if (s && !first && !touch) { selName.textContent = ITEMS[s.id].name; selName.classList.add("on"); clearTimeout(selTimer); selTimer = setTimeout(() => selName.classList.remove("on"), 1500); }
          else if (!s) selName.classList.remove("on");
        }
        lastSel = inv.sel;
      }
      if (P) refresh(false);
      // bars
      const hpK = Math.round(p.hp) + "/" + p.maxHp, huK = Math.round(p.hunger) + "/" + p.maxHunger;
      if (hpK !== lastHp) {
        lastHp = hpK; const f = clamp01(p.hp / p.maxHp).toFixed(3);
        hpI.style.transform = hpS.style.transform = `scaleX(${f})`; hpN.textContent = Math.round(p.hp);
        rowHp.classList.toggle("low", p.hp > 0 && p.hp / p.maxHp < 0.25);
      }
      if (huK !== lastHu) {
        lastHu = huK; const f = clamp01(p.hunger / p.maxHunger).toFixed(3);
        huI.style.transform = huS.style.transform = `scaleX(${f})`; huN.textContent = Math.round(p.hunger);
        rowHu.classList.toggle("low", p.hunger < 25);
      }
      const sick = G.craft && G.craft.sickT > 0;
      if (sick !== rowHu._sick) { rowHu._sick = sick; rowHu.classList.toggle("sick", sick); }
      // status chips + touch labels (every 10 frames)
      if (++n % 10 === 0) {
        // touch: room for one compact pill beside the bars - the most important one
        let ch = status(G);
        if (touch && ch.length > 1) ch = [ch.slice().sort((a, b) => (CHIP_RANK[a.id] || 9) - (CHIP_RANK[b.id] || 9))[0]];
        const ck = ch.map((c) => c.id).join(",");
        if (ck !== lastChips) { lastChips = ck; chips.innerHTML = ch.map((c) => `<span class="${c.id}">${esc(c.text)}</span>`).join(""); }
        if (touch && tHit) {
          const hl = hitLabel(G); if (hl !== lastHit) { lastHit = hl; hitLbl.textContent = hl; }
          const s = invSelected(inv), tid = s && ITEMS[s.id] && ITEMS[s.id].tool ? s.id : "";
          if (tid !== hitIcon) { hitIcon = tid; drawIc(hitCv, tid || null); hitCv.style.display = tid ? "" : "none"; }
          const [ul, live] = useLabel(G), uk = ul + live;
          if (uk !== lastUse) { lastUse = uk; useLbl.textContent = ul; tUse.classList.toggle("live", live); }
        }
      }
      if (ctx.panel !== lastPanel) {
        lastPanel = ctx.panel;
        const open = !!ctx.panel;
        if (tHit) { tHit.parentNode.classList.toggle("bk-hidden", open); tUse.classList.toggle("bk-invis", open); if (open) { ctx.input && ctx.input.release(B_ACTION); tHit.classList.remove("on"); } }
        hint.style.visibility = open ? "hidden" : "";
        selName.classList.remove("on");
      }
    },
    destroy() {
      closeP();
      clearTimeout(hintTimer); clearTimeout(selTimer);
      for (const f of offs) f(); offs.length = 0;
      for (const [t, e, f, o] of L) t.removeEventListener(e, f, o); L.length = 0;
      for (const e of els) e.remove(); els.length = 0;
    },
  };
}
