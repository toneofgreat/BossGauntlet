// menus.js - the panel menus (DESIGN 14): pause, inventory/equipment, the Village Exchange (claims: morph, armors),
// secrets list and settings. One scrim + panel with tabs; opened by index.js through open(tab, { atExchange, overTitle }).
import { el, clear, makeButtonFactory, sfx } from "./dom.js";
import { commas, fmtLevel, fmtMult, fmtTime } from "./format.js";
import { itemIcon, prettyId } from "./icons.js";

const TABS = [
  { id: "pause", label: "Menu" }, { id: "inventory", label: "Inventory" }, { id: "shop", label: "Exchange" },
  { id: "secrets", label: "Secrets" }, { id: "settings", label: "Settings" }
];
const SLOT_NAMES = { sword: "Weapon", armor: "Armor", morph: "Morph", crown: "Crown", charm: "Charm", key: "Key item" };
const SHOP_ICON = { villager_morph: "villager_morph", iron_armor: "iron_armor", golden_armor: "golden_armor", area3: "_crown", area2: "_crown", kingPortal: "kings_staff" };

export function createMenus(ctx, root, hooks) {
  // hooks: { setSetting(k, v), onClose(), quitToTitle(), resume() }
  const button = makeButtonFactory(ctx);
  const scrim = el("div.tn-scrim.tn-hide", { attrs: { role: "dialog", "aria-modal": "true" } });
  const panel = el("div.tn-panel");
  const head = el("div.tn-phead"), title = el("h3"), x = button("×", "tn-x", () => close());
  x.setAttribute("aria-label", "Close");
  head.appendChild(title); head.appendChild(x);
  const tabs = el("div.tn-tabs", { attrs: { role: "tablist" } });
  const body = el("div.tn-pbody");
  panel.appendChild(head); panel.appendChild(tabs); panel.appendChild(body);
  scrim.appendChild(panel);
  root.appendChild(scrim);
  scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim) close(); });
  panel.addEventListener("pointerdown", (e) => e.stopPropagation());

  let isOpen = false, tab = "pause", atExchange = false, overTitle = false, selItem = null;
  const tabBtns = {};
  for (const t of TABS) {
    const b = button(t.label, "", () => show(t.id));
    b.setAttribute("role", "tab");
    tabBtns[t.id] = b; tabs.appendChild(b);
  }

  const combat = () => ctx.combat || null;
  function safe(fn, dflt) { try { const v = fn(); return v === undefined ? dflt : v; } catch (e) { console.warn("[ui] menu", e); return dflt; } }

  function open(which, opts) {
    opts = opts || {};
    atExchange = which === "shop" ? opts.atExchange !== false : !!opts.atExchange;
    overTitle = !!opts.overTitle;
    scrim.style.zIndex = overTitle ? "74" : "";
    tabs.classList.toggle("tn-hide", overTitle);
    if (!isOpen) sfx(ctx, "ui_open", 0.8);
    isOpen = true;
    scrim.classList.remove("tn-hide");
    requestAnimationFrame(() => scrim.classList.add("on"));
    show(TABS.some((t) => t.id === which) ? which : "pause");
    setTimeout(() => { try { x.focus({ preventScroll: true }); } catch (e) { /* */ } }, 30);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    scrim.classList.remove("on");
    sfx(ctx, "ui_close", 0.8);
    setTimeout(() => { if (!isOpen) scrim.classList.add("tn-hide"); }, 260);
    try { hooks.onClose && hooks.onClose(); } catch (e) { console.warn("[ui]", e); }
  }

  function show(t) {
    tab = t;
    for (const k in tabBtns) { tabBtns[k].classList.toggle("on", k === t); tabBtns[k].setAttribute("aria-selected", k === t ? "true" : "false"); }
    title.textContent = t === "shop" ? "Village Exchange" : t === "pause" ? "Paused" : (TABS.find((q) => q.id === t) || {}).label || "";
    clear(body);
    body.scrollTop = 0;
    if (t === "pause") renderPause();
    else if (t === "inventory") renderInventory();
    else if (t === "shop") renderShop();
    else if (t === "secrets") renderSecrets();
    else renderSettings();
  }

  // ------------------------------------------------------------------ pause
  function renderPause() {
    const st = ctx.state;
    const col = el("div.tn-col");
    col.appendChild(button("Resume", "tn-btn.tn-primary", () => close()));
    col.appendChild(button("Inventory", "tn-btn", () => show("inventory")));
    col.appendChild(button("Exchange", "tn-btn", () => show("shop")));
    col.appendChild(button("Secrets", "tn-btn", () => show("secrets")));
    col.appendChild(button("Settings", "tn-btn", () => show("settings")));
    col.appendChild(button("Quit to title", "tn-btn", () => hooks.quitToTitle && hooks.quitToTitle()));
    body.appendChild(col);
    const lv = safe(() => combat().level(), st.run.level || 0);
    const sc = safe(() => ctx.story.secretCount(), { count: Object.keys(st.profile.secrets || {}).length, total: 26 });
    const grid = el("div.tn-statgrid", { style: { marginTop: "10px" } });
    grid.appendChild(stat("LEVEL", fmtLevel(lv)));
    grid.appendChild(stat("SECRETS", sc.count + "/" + sc.total));
    grid.appendChild(stat("PLAYED", fmtTime(st.profile.playMs || 0)));
    grid.appendChild(stat("DEATHS", commas(st.run.deaths || 0)));
    body.appendChild(grid);
    body.appendChild(el("p.tn-muted", { text: "Your progress saves automatically.", style: { textAlign: "center", margin: "10px 0 0" } }));
  }

  function stat(k, v) { return el("div.tn-stat", null, [el("span", { text: k }), el("b", { text: v, attrs: { title: v } })]); }

  // ------------------------------------------------------------------ inventory
  function renderInventory() {
    const c = combat();
    if (!c || !c.inventory) { body.appendChild(el("p.tn-muted", { text: "Your pockets are empty." })); return; }
    const inv = safe(() => c.inventory(), []) || [];
    const owned = inv.filter((i) => i.owned);
    const w = safe(() => c.weapon(), null);
    const dr = safe(() => { const a = ctx.state.run.equip.armor; const d = a && c.items && c.items[a]; return d && d.dr ? d.dr : 0; }, 0);
    const grid = el("div.tn-statgrid");
    grid.appendChild(stat("MULT", fmtMult(safe(() => c.mult(), 1))));
    grid.appendChild(stat("HP", commas(ctx.state.player.maxHp || 100)));
    grid.appendChild(stat("BLOCK", Math.round(dr * 100) + "%"));
    grid.appendChild(stat("DAMAGE", w && w.dmg ? commas(w.dmg) : "-"));
    body.appendChild(grid);
    body.appendChild(el("h5", { text: "Items (" + owned.length + ")" }));
    if (!owned.length) { body.appendChild(el("p.tn-muted", { text: "Nothing yet. Rats drop things. Probably." })); return; }
    const order = { sword: 0, armor: 1, morph: 2, crown: 3, charm: 4, key: 5 };
    owned.sort((a, b) => (order[a.slot] - order[b.slot]) || ((a.mult || 0) - (b.mult || 0)));
    if (!selItem || !owned.some((i) => i.id === selItem)) selItem = (owned.find((i) => i.equipped) || owned[0]).id;
    const g = el("div.tn-grid");
    const detail = el("div.tn-detail");
    for (const it of owned) {
      const b = el("button.tn-item" + (it.equipped ? ".eq" : "") + (it.id === selItem ? ".sel" : "") + (it.id.indexOf("bad_") === 0 ? ".bad" : ""), { attrs: { type: "button", title: it.name || prettyId(it.id), "aria-label": it.name || prettyId(it.id) } });
      b.appendChild(el("img", { attrs: { src: itemIcon(it.id), alt: "" } }));
      b.addEventListener("click", () => { selItem = it.id; show("inventory"); });
      g.appendChild(b);
    }
    body.appendChild(g);
    const it = owned.find((i) => i.id === selItem);
    if (it) {
      detail.appendChild(el("img", { attrs: { src: itemIcon(it.id), alt: "" } }));
      const t = el("div.t");
      t.appendChild(el("b", { text: it.name || prettyId(it.id) }));
      t.appendChild(el("i", { text: (SLOT_NAMES[it.slot] || it.slot || "") + (it.equipped ? " · equipped" : "") }));
      if (it.desc) t.appendChild(el("p", { text: it.desc }));
      const def = safe(() => c.items[it.id], null) || {};
      const kv = [];
      if (it.mult && it.slot !== "key") kv.push("Level " + fmtMult(it.mult));
      if (def.dmg) kv.push(commas(def.dmg) + " dmg");
      if (def.hp) kv.push("+" + commas(def.hp) + " HP");
      if (def.dr) kv.push(Math.round(def.dr * 100) + "% block");
      if (kv.length) t.appendChild(el("div.kv", { text: kv.join(" · ") }));
      if (it.slot !== "key") {
        const btn = it.equipped
          ? (it.slot !== "sword" || it.id !== "fists" ? button("Unequip", "tn-btn.sm", () => { safe(() => c.unequip(it.slot)); show("inventory"); }) : null)
          : button("Equip", "tn-btn.sm.tn-primary", () => { safe(() => c.equip(it.id)); show("inventory"); });
        if (btn) { btn.style.marginTop = "6px"; t.appendChild(btn); }
      }
      detail.appendChild(t);
      body.appendChild(detail);
    }
  }

  // ------------------------------------------------------------------ exchange (claims)
  function renderShop() {
    const c = combat();
    body.appendChild(el("p.tn-muted", { text: atExchange ? "“Nothing is for sale. Everything is for EARNING.” - Odo" : "Claims are made in person at the Village Exchange.", style: { margin: "0 0 8px" } }));
    if (!c || !c.shop) { body.appendChild(el("p.tn-muted", { text: "The stall is closed." })); return; }
    const rows = safe(() => c.shop(), []) || [];
    const lv = safe(() => c.level(), ctx.state.run.level || 0);
    for (const r of rows) {
      const row = el("div.tn-row");
      row.appendChild(el("img", { attrs: { src: itemIcon(shopIcon(r.id)), alt: "" } }));
      const t = el("div.t");
      t.appendChild(el("b", { text: r.name || prettyId(r.id) }));
      const need = r.need || 0;
      t.appendChild(el("span", { text: "Requires " + fmtLevel(need) + " levels" }));
      if (r.state !== "claimed") {
        const pr = el("div.tn-prog"); const f = Math.max(0, Math.min(1, need > 0 ? lv / need : 1));
        pr.appendChild(el("i", { style: { width: (f * 100).toFixed(1) + "%" } }));
        t.appendChild(pr);
      }
      row.appendChild(t);
      if (r.state === "claimed") row.appendChild(el("span.claimed", { text: "✓ CLAIMED" }));
      else if (r.id === "area3") row.appendChild(el("span.need", { text: lv >= need ? "Auto" : "Need " + fmtLevel(need) + " (you have " + fmtLevel(lv) + ")" }));
      else if (r.state === "claimable" && atExchange) {
        row.appendChild(button("Claim", "tn-btn.sm.tn-primary", () => {
          const res = safe(() => c.claim(r.id), { ok: false });
          if (res && res.ok) { try { ctx.audio && ctx.audio.stinger && ctx.audio.stinger("itemGet"); } catch (e) { /* */ } hooks.toast && hooks.toast("Claimed " + (r.name || prettyId(r.id)), "good"); }
          else hooks.toast && hooks.toast(res && res.reason ? String(res.reason) : "Can't claim that yet.", "warn");
          show("shop");
        }));
      } else if (r.state === "claimable") row.appendChild(el("span.need", { text: "Ready - claim at the Exchange" }));
      else row.appendChild(el("span.need", { text: "Need " + fmtLevel(need) + " (you have " + fmtLevel(lv) + ")" }));
      body.appendChild(row);
    }
    if (!rows.length) body.appendChild(el("p.tn-muted", { text: "Nothing to claim." }));
  }

  function shopIcon(id) {
    const base = SHOP_ICON[id] || id;
    if (base.charAt(0) === "_" || id.indexOf("area") === 0 || id === "kingPortal") return base;
    return (ctx.state.run.cycle | 0) >= 1 ? "bad_" + base : base;
  }

  // ------------------------------------------------------------------ secrets
  function renderSecrets() {
    const list = safe(() => ctx.story.secrets, null);
    const sc = safe(() => ctx.story.secretCount(), null);
    const ends = ctx.state.profile.endings || {};
    const endCount = Object.keys(ends).filter((k) => ends[k] > 0).length;
    body.appendChild(el("p.tn-muted", { text: (sc ? sc.count + " of " + sc.total + " secrets found" : "Secrets") + " · " + endCount + " of 6 endings", style: { margin: "0 0 6px" } }));
    if (!Array.isArray(list)) { body.appendChild(el("p.tn-muted", { text: "Nothing to see here. Totally normal." })); return; }
    for (const s of list) {
      const isEnd = s.id.indexOf("end_") === 0;
      const row = el("div.tn-sec" + (s.found ? ".f" : ""));
      row.appendChild(el("span.ic", { text: s.found ? "★" : "☆" }));
      const t = el("div.t");
      t.appendChild(el("b", { text: s.found ? s.name : isEnd ? "??? Ending" : "???" }));
      if (s.hint) t.appendChild(el("span", { text: s.hint }));
      row.appendChild(t);
      body.appendChild(row);
    }
  }

  // ------------------------------------------------------------------ settings
  function toggleRow(key, label, note) {
    const row = el("div.tn-set");
    const lab = el("label", null, [label]);
    if (note) lab.appendChild(el("small", { text: note }));
    const on = !!ctx.state.settings[key];
    const b = button(on ? "ON" : "OFF", "tn-tog" + (on ? ".on" : ""), () => {
      const v = !ctx.state.settings[key];
      hooks.setSetting(key, v);
      b.textContent = v ? "ON" : "OFF"; b.classList.toggle("on", v); b.setAttribute("aria-pressed", v ? "true" : "false");
    });
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.setAttribute("aria-label", label);
    row.appendChild(lab); row.appendChild(b);
    return row;
  }
  function sliderRow(key, label, min, max, step, fmt) {
    const row = el("div.tn-set");
    const id = "tn-set-" + key;
    const lab = el("label", { text: label, attrs: { for: id } });
    const val = el("span.val");
    const v0 = Number(ctx.state.settings[key]);
    const inp = el("input", { attrs: { id, type: "range", min: String(min), max: String(max), step: String(step), value: String(isFinite(v0) ? v0 : min) } });
    const sync = () => { val.textContent = fmt(Number(inp.value)); };
    inp.addEventListener("input", () => { hooks.setSetting(key, Number(inp.value)); sync(); });
    inp.addEventListener("keydown", (e) => e.stopPropagation());
    sync();
    row.appendChild(lab); row.appendChild(inp); row.appendChild(val);
    return row;
  }
  function renderSettings() {
    body.appendChild(el("h5", { text: "Comfort" }));
    body.appendChild(toggleRow("reduceFlashing", "Reduce flashing", "Softens flashes and jump-scare strobes."));
    body.appendChild(toggleRow("hints", "Show hints", "Waypoint marker and tips."));
    body.appendChild(el("h5", { text: "Sound" }));
    const pct = (v) => Math.round(v * 100) + "%";
    body.appendChild(sliderRow("master", "Master", 0, 1, 0.05, pct));
    body.appendChild(sliderRow("music", "Music", 0, 1, 0.05, pct));
    body.appendChild(sliderRow("sfx", "Effects", 0, 1, 0.05, pct));
    body.appendChild(el("h5", { text: "Controls" }));
    body.appendChild(sliderRow("sensitivity", "Look sensitivity", 0.2, 3, 0.05, (v) => v.toFixed(2)));
    body.appendChild(toggleRow("invertY", "Invert Y"));
    body.appendChild(toggleRow("pointerLock", "Pointer lock", "Click the game to capture the mouse."));
    body.appendChild(el("h5", { text: "Graphics" }));
    const row = el("div.tn-set");
    row.appendChild(el("label", { text: "Quality" }));
    const seg = el("div.tn-seg", { attrs: { role: "radiogroup", "aria-label": "Quality" } });
    const opts = [["auto", "Auto"], ["low", "Low"], ["medium", "Med"], ["high", "High"], ["ultra", "Ultra"]];
    const cur = ctx.state.settings.quality == null ? "auto" : String(ctx.state.settings.quality);
    for (const [v, l] of opts) {
      const b = button(l, cur === v ? "on" : "", () => {
        hooks.setSetting("quality", v);
        for (const k of seg.children) k.classList.toggle("on", k === b);
      });
      b.setAttribute("role", "radio");
      seg.appendChild(b);
    }
    row.appendChild(seg);
    body.appendChild(row);
    body.appendChild(toggleRow("showFps", "Show FPS"));
    body.appendChild(el("p.tn-muted", { text: "Keys: WASD move · Shift sprint · Space jump · Click/F attack (hold = heavy) · Q/right-click dodge · E interact · I/Tab inventory · Esc menu", style: { marginTop: "12px" } }));
  }

  // Escape / I / Tab while a menu is open (the game input does not run while paused)
  window.addEventListener("keydown", (e) => {
    if (!isOpen) return;
    const t = e.target;
    if (t && t.tagName === "INPUT" && t.type !== "range") return;
    const k = e.key;
    if (k === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if ((k === "i" || k === "I" || k === "Tab") && !overTitle) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (tab === "inventory") close(); else show("inventory");
    }
  }, true);

  return {
    open, close, show,
    get isOpen() { return isOpen; }, get tab() { return tab; }, get overTitle() { return overTitle; },
    refresh() { if (isOpen) show(tab); }
  };
}
