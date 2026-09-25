// src/games/lifting/scripts/ui.js — spec 09 §5.13's overlay: the LIFT button, the menu
// rail and the one reusable panel that shows the shop, the rebirth ladder, the titles and
// the travel list.
//
// One DOM subtree (`#lifting-ui`) plus one <style> tag (`#lifting-ui-css`), both removed
// wholesale in dispose (§5.15 step 2, spec 04 §5.5's zero-leak rule). No timers of any
// kind: panels slide with a CSS transition, and every number on screen is pushed here
// from the sim step through refresh().

import { ITEMS, REBIRTHS, TITLES, ZONES, REQ_GATE_TEXT, fmt } from "./config.js";
// §5.5's req gate is state.js to answer: the shop must never disagree with the module
// that will actually refuse the purchase.
import { reqMet } from "./state.js";

const Z_INDEX = 50;   // spec 06's `game` layer: under the platform HUD
const TAP = 44;       // §5.13's minimum hit target

const PANELS = Object.freeze({
  shop: "SHOP",
  rebirth: "REBIRTH",
  titles: "TITLES",
  travel: "TRAVEL",
});

const WORLD_HEADERS = Object.freeze({
  gym: "GYM", space: "SPACE", dumbbell: "DUMBBELL WORLD", lava: "LAVA ZONE",
});

// ---- module closure; dispose() puts all of it back ----
let ctxRef = null;
let stateRef = null;
let hooks = null;
let root = null;
let styleTag = null;
let panelEl = null;
let panelTitleEl = null;
let panelBodyEl = null;
let openName = null;
let updaters = [];    // per-row refreshers for whichever panel is built
let railButtons = new Map();
let keyHandler = null;
let hintEl = null;
let sawTouch = false;
let confirmEl = null;   // the one game-owned modal (§5.13 note below), null when closed
let confirmChoice = null;

const CSS = `
#lifting-ui, #lifting-ui * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
#lifting-ui button { border: none; outline: none; cursor: pointer; touch-action: manipulation; border-radius: 12px; }
/* The LIFT button's centring transform lives here, not in its inline style: an inline
   transform would outrank this rule and swallow the :active press feedback. */
#lifting-ui .lf-lift { transform: translateX(-50%); transition: transform 90ms ease; }
#lifting-ui .lf-lift:active { transform: translateX(-50%) scale(0.92); }
#lifting-ui .lf-rail button:active { transform: scale(0.94); }
#lifting-ui .lf-panel { transition: transform 160ms ease; }
#lifting-ui .lf-row { display: flex; align-items: center; gap: 10px; padding: 0 10px; height: 64px; border-radius: 12px; }
#lifting-ui .lf-head { position: sticky; top: 0; z-index: 2; letter-spacing: 12px; color: #f7c948;
  font-size: 12px; font-weight: 800; padding: 10px 10px 6px; background: var(--oof-bg, #0e1018); }
#lifting-ui .lf-scroll { overflow-y: auto; -webkit-overflow-scrolling: touch; flex: 1; padding-bottom: 24px; }
@media (min-aspect-ratio: 1/1) {
  #lifting-ui .lf-panel { right: 0; top: 0; height: 100%; width: 340px; max-width: 92vw;
    border-radius: 16px 0 0 0; transform: translateX(105%); }
  #lifting-ui .lf-panel[data-open="1"] { transform: translateX(0); }
}
@media not all and (min-aspect-ratio: 1/1) {
  #lifting-ui .lf-panel { left: 0; right: 0; bottom: 0; height: 64%; width: auto;
    border-radius: 16px 16px 0 0; transform: translateY(105%); }
  #lifting-ui .lf-panel[data-open="1"] { transform: translateY(0); }
}
`;

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(style, text) {
  const node = el("button", style, text);
  node.type = "button";
  return node;
}

function toast(text, icon) {
  ctxRef.services.ui.toast(text, { icon });
}

// ---------------------------------------------------------------------------
// §5.13 element 1 — the LIFT button
// ---------------------------------------------------------------------------

const LIFT_STYLE = "position:fixed;left:50%;bottom:24px;"
  + "width:112px;height:112px;border-radius:56px;pointer-events:auto;"
  + "background:radial-gradient(circle at 50% 35%, #f7c948, #e8a33d);"
  + "border:3px solid #0e1018;color:#0e1018;display:flex;flex-direction:column;"
  + "align-items:center;justify-content:center;gap:0;padding:0;";

function buildLiftButton() {
  const btn = button(LIFT_STYLE);
  btn.className = "lf-lift";
  btn.id = "lifting-lift";
  btn.setAttribute("aria-label", "Lift");
  btn.append(el("span", "font-size:28px;line-height:28px;", "💪"));
  btn.append(el("span", "font-size:22px;font-weight:800;line-height:24px;", "LIFT"));
  hintEl = el("span", "font-size:10px;font-weight:700;opacity:0.7;line-height:12px;", "(E)");
  btn.append(hintEl);

  const down = (ev) => {
    ev.preventDefault();
    // §5.13: the "(E)" hint is for keyboards only, and one touch proves this is not one.
    if (ev.pointerType === "touch" && !sawTouch) {
      sawTouch = true;
      if (hintEl) hintEl.style.display = "none";
    }
    hooks.lift();
    hooks.holdStart();
  };
  const up = () => hooks.holdEnd();
  btn.addEventListener("pointerdown", down);
  btn.addEventListener("pointerup", up);
  btn.addEventListener("pointercancel", up);
  btn.addEventListener("pointerleave", up);
  return btn;
}

// ---------------------------------------------------------------------------
// §5.13 element 2 — the menu rail
// ---------------------------------------------------------------------------

const RAIL_BTN = `width:56px;height:56px;background:var(--oof-panel, #171a24);opacity:0.9;`
  + `color:var(--oof-text, #f2f4fa);display:flex;flex-direction:column;align-items:center;`
  + `justify-content:center;gap:1px;padding:0;`;

function buildRail() {
  const rail = el("div", "position:fixed;left:12px;top:50%;transform:translateY(-50%);"
    + "display:flex;flex-direction:column;gap:10px;pointer-events:auto;");
  rail.className = "lf-rail";
  const rows = [["shop", "🛒", "Shop"], ["rebirth", "🌀", "Rebirth"], ["titles", "🏷️", "Titles"], ["travel", "🗺️", "Travel"]];
  for (const [name, icon, label] of rows) {
    const btn = button(RAIL_BTN);
    btn.dataset.panel = name;
    btn.append(el("span", "font-size:26px;line-height:26px;", icon));
    btn.append(el("span", "font-size:9px;font-weight:700;", label));
    btn.addEventListener("click", () => (openName === name ? closePanel() : openPanel(name)));
    rail.append(btn);
    railButtons.set(name, btn);
  }
  return rail;
}

function paintRail() {
  for (const [name, btn] of railButtons) {
    btn.setAttribute("style", RAIL_BTN + (openName === name ? "outline:2px solid #f7c948;" : ""));
  }
}

// ---------------------------------------------------------------------------
// §5.13 element 3 — the one reusable panel
// ---------------------------------------------------------------------------

function buildPanel() {
  const panel = el("div", "position:fixed;background:var(--oof-bg, #0e1018);opacity:0.98;"
    + "pointer-events:auto;display:flex;flex-direction:column;color:var(--oof-text, #f2f4fa);"
    + "box-shadow:0 0 24px rgba(0,0,0,0.5);");
  panel.className = "lf-panel";
  panel.id = "lifting-panel";
  panel.dataset.open = "0";

  const head = el("div", "display:flex;align-items:center;justify-content:space-between;"
    + "padding:10px 8px 10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);flex:none;");
  panelTitleEl = el("div", "font-size:18px;font-weight:800;", "");
  const close = button(`width:${TAP}px;height:${TAP}px;background:transparent;`
    + "color:var(--oof-text, #f2f4fa);font-size:20px;font-weight:700;", "✕");
  close.setAttribute("aria-label", "Close");
  close.addEventListener("click", () => closePanel());
  head.append(panelTitleEl, close);

  panelBodyEl = el("div", "");
  panelBodyEl.className = "lf-scroll";
  panel.append(head, panelBodyEl);
  return panel;
}

// ---------------------------------------------------------------------------
// §5.13 element 4 — the shop
// ---------------------------------------------------------------------------

const ACT_BASE = "width:96px;height:40px;flex:none;font-size:13px;font-weight:800;";

function buildShop(body) {
  let lastWorld = null;
  for (const item of ITEMS) {
    if (item.world !== lastWorld) {
      lastWorld = item.world;
      const head = el("div", null, WORLD_HEADERS[item.world]);
      head.className = "lf-head";
      body.append(head);
    }
    const row = el("div", "background:var(--oof-panel, #171a24);margin:4px 8px;");
    row.className = "lf-row";
    row.dataset.item = item.id;
    const swatch = el("div", `width:${TAP}px;height:${TAP}px;border-radius:10px;flex:none;`
      + `background:${item.prims[0].color};border:1px solid rgba(255,255,255,0.15);`);
    const mid = el("div", "flex:1;min-width:0;");
    const name = el("div", "font-size:15px;font-weight:700;overflow:hidden;"
      + "text-overflow:ellipsis;white-space:nowrap;", item.name);
    const sub = el("div", "font-size:12px;color:#9aa3b8;", "+" + fmt(item.power) + "/lift");
    mid.append(name, sub);
    const act = button(ACT_BASE);
    act.dataset.item = item.id; // stable selector for §8's smoke steps
    row.append(swatch, mid, act);

    // §5.13: a tap on the row itself (not the button) explains the item.
    row.addEventListener("click", (ev) => {
      if (ev.target === act || act.contains(ev.target)) return;
      toast(item.desc, "ℹ️");
    });
    act.addEventListener("click", () => {
      if (stateRef.equippedItem === item.id) return;
      if (stateRef.items.includes(item.id)) {
        hooks.equip(item.id);
        return;
      }
      // buyItem owns the gate and the "not enough" refusals so a race can never buy
      // something the row merely looked affordable for (§5.2).
      hooks.buy(item.id);
    });

    updaters.push(() => {
      const owned = stateRef.items.includes(item.id);
      const equipped = stateRef.equippedItem === item.id;
      const unlocked = reqMet(stateRef, item.req);
      if (equipped) {
        act.textContent = "EQUIPPED";
        act.setAttribute("style", ACT_BASE + "background:#37a04c;color:#0e1018;opacity:1;");
      } else if (owned) {
        act.textContent = "EQUIP";
        act.setAttribute("style", ACT_BASE + "background:transparent;color:#f7c948;"
          + "border:2px solid #f7c948;opacity:1;");
      } else if (!unlocked) {
        act.textContent = "🔒 " + (REQ_GATE_TEXT[item.req] || "Locked");
        act.setAttribute("style", ACT_BASE + "background:var(--oof-panel, #171a24);"
          + "color:var(--oof-text, #f2f4fa);opacity:0.4;font-size:10px;");
      } else {
        const afford = stateRef.strength >= item.cost;
        act.textContent = fmt(item.cost);
        act.setAttribute("style", ACT_BASE + "background:#f7c948;color:#0e1018;"
          + (afford ? "opacity:1;" : "opacity:0.4;"));
      }
    });
    body.append(row);
  }
}

// ---------------------------------------------------------------------------
// §5.13 element 5 — the rebirth ladder
// ---------------------------------------------------------------------------

function buildRebirth(body) {
  for (const r of REBIRTHS) {
    const card = el("div", "background:var(--oof-panel, #171a24);margin:8px;padding:12px;"
      + "border-radius:14px;display:flex;flex-direction:column;gap:4px;");
    card.append(el("div", "font-size:16px;font-weight:800;", r.name));
    card.append(el("div", "font-size:13px;color:#f7c948;", "Cost: " + fmt(r.cost) + " Strength"));
    card.append(el("div", "font-size:12px;color:#9aa3b8;line-height:15px;", r.blurb));
    const act = button(`width:100%;height:${TAP}px;font-size:14px;font-weight:800;`);
    act.dataset.rebirth = r.id; // stable selector for §8's smoke steps
    card.append(act);
    act.addEventListener("click", () => hooks.rebirth(r.id));
    updaters.push(() => {
      const gate = hooks.canRebirth(r.id);
      const base = `width:100%;height:${TAP}px;font-size:14px;font-weight:800;`;
      if (gate.ok) {
        act.textContent = "REBIRTH";
        act.setAttribute("style", base + "background:#6b3fa0;color:#ffffff;");
      } else if (gate.message === "Already done!") {
        act.textContent = "✅ DONE";
        act.setAttribute("style", base + "background:#232733;color:#9aa3b8;");
      } else {
        act.textContent = gate.message;
        act.setAttribute("style", base + "background:#232733;color:#9aa3b8;");
      }
    });
    body.append(card);
  }
}

// ---------------------------------------------------------------------------
// §5.13 element 6 — titles
// ---------------------------------------------------------------------------

function buildTitles(body) {
  const autoRow = el("div", "background:var(--oof-panel, #171a24);margin:4px 8px;");
  autoRow.className = "lf-row";
  autoRow.append(el("div", "flex:1;font-size:15px;font-weight:700;", "AUTO-EQUIP NEW TITLES"));
  const toggle = button(`width:${TAP}px;height:${TAP}px;font-size:20px;flex:none;`);
  autoRow.append(toggle);
  toggle.addEventListener("click", () => hooks.setTitleAuto(!stateRef.titleAuto));
  updaters.push(() => {
    toggle.textContent = stateRef.titleAuto ? "✅" : "⬜";
    toggle.setAttribute("style", `width:${TAP}px;height:${TAP}px;font-size:20px;flex:none;`
      + "background:transparent;");
  });
  body.append(autoRow);

  const rows = TITLES.map((t) => ({ name: t.name, color: t.color, threshold: t.threshold }));
  rows.push({ name: "", color: "#9aa3b8", threshold: 0 }); // §5.13 row 12: "(none)"
  for (const t of rows) {
    const row = el("div", "background:var(--oof-panel, #171a24);margin:4px 8px;");
    row.className = "lf-row";
    const label = el("div", "flex:1;font-size:15px;font-weight:700;", t.name || "(none)");
    const right = el("div", "font-size:12px;color:#9aa3b8;text-align:right;flex:none;");
    row.append(label, right);
    row.addEventListener("click", () => {
      if (t.name && stateRef.lifetime < t.threshold) {
        toast("Locked — reach " + fmt(t.threshold) + " lifetime Strength!", "🔒");
        return;
      }
      hooks.equipTitle(t.name);
    });
    updaters.push(() => {
      const locked = t.name !== "" && stateRef.lifetime < t.threshold;
      const equipped = stateRef.equippedTitle === t.name;
      label.style.color = locked ? "#9aa3b8" : t.color;
      label.textContent = (t.name || "(none)") + (locked ? " 🔒" : "");
      right.textContent = equipped ? "EQUIPPED ✓" : (t.name ? fmt(t.threshold) : "");
      right.style.color = equipped ? "#37a04c" : "#9aa3b8";
      row.style.opacity = locked ? "0.35" : "1";
      row.style.cursor = locked ? "default" : "pointer";
    });
    body.append(row);
  }
}

// ---------------------------------------------------------------------------
// §5.13 element 7 — travel
// ---------------------------------------------------------------------------

function buildTravel(body) {
  for (const zone of ZONES) {
    const row = el("div", "background:var(--oof-panel, #171a24);margin:4px 8px;");
    row.className = "lf-row";
    row.append(el("div", "font-size:26px;flex:none;width:34px;", zone.icon));
    const mid = el("div", "flex:1;min-width:0;");
    const name = el("div", "font-size:15px;font-weight:700;", zone.name);
    const stateLine = el("div", "font-size:12px;", "");
    mid.append(name, stateLine);
    row.append(mid);
    row.addEventListener("click", () => {
      const res = hooks.travel(zone.id);
      if (res && res.ok) closePanel(); // §5.13: only a successful trip closes the panel
    });
    updaters.push(() => {
      const open = !zone.req || !!stateRef[zone.req];
      stateLine.textContent = open ? "OPEN" : zone.lockedMessage;
      stateLine.style.color = open ? "#37a04c" : "#d94436";
    });
    body.append(row);
  }
}

// ---------------------------------------------------------------------------
// the destructive-action confirm (game.js's rebirth prompt)
// ---------------------------------------------------------------------------

// Not a §5.13 element: §5.13's rebirth card fires the rebirth on one tap and game.js
// interposes a confirm because a rebirth is permanent. That confirm used to be
// `ctx.services.ui.dialog(...)`, which hands its caller a bare Promise and NO way to take
// the modal back down (spec 06 §5.6.5 / spec 04 §5.7) — so leaving the Place mid-confirm
// stranded a platform modal over the Hub, and the shell's `dialogOpen` latch with it. The
// confirm therefore lives in THIS overlay: it dies with `#lifting-ui` on dispose (§5.15
// step 2) and `openConfirm` returns the close() handle its caller holds. The missing
// platform dismiss API is reported; this is the fix that does not need one.
//
// `onChoice(id)` fires only on a real choice ("confirm" | "cancel"). A close() from
// dispose is silent, so a torn-down Place can never run the action.
export function openConfirm(opts) {
  if (!root) return { close() {} };
  closeConfirm();
  const options = opts || {};
  const overlay = el("div", "position:fixed;inset:0;pointer-events:auto;display:flex;"
    + "align-items:center;justify-content:center;padding:16px;background:rgba(6,8,14,0.72);");
  // The overlay carries a stable class for §8's smoke steps, the same reason the rail,
  // the shop rows and the rebirth cards carry their data attributes.
  overlay.className = "lf-confirm";
  const card = el("div", "width:min(420px,100%);max-height:80vh;overflow-y:auto;"
    + "background:var(--oof-panel, #171a24);color:var(--oof-text, #f2f4fa);border-radius:16px;"
    + "padding:18px;box-shadow:0 12px 40px rgba(0,0,0,0.55);");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.append(el("div", "font-size:18px;font-weight:800;line-height:22px;", options.title || ""));
  // white-space:pre-line so the caller's "\n"-separated YOU LOSE / KEEP / GAIN lines break
  // where it wrote them (textContent, never innerHTML — spec 06 §3.5).
  card.append(el("div", "font-size:13px;line-height:19px;color:#9aa3b8;margin-top:10px;"
    + "white-space:pre-line;", options.body || ""));

  const row = el("div", "display:flex;justify-content:flex-end;gap:10px;margin-top:16px;");
  const ACT = `min-width:120px;height:${TAP}px;padding:0 14px;font-size:14px;font-weight:800;`;
  const go = button(ACT + "background:#d94436;color:#ffffff;", options.confirmLabel || "CONFIRM");
  // …and its two choices carry theirs: the caller picks the LABELS (game.js's confirm
  // reads "REBIRTH"), so the label cannot also be the hook a test grabs the button by.
  go.dataset.confirm = "confirm";
  go.addEventListener("click", () => finishConfirm("confirm"));
  const cancel = button(ACT + "background:#232733;color:var(--oof-text, #f2f4fa);",
    options.cancelLabel || "Cancel");
  cancel.dataset.confirm = "cancel";
  cancel.addEventListener("click", () => finishConfirm("cancel"));
  // Cancel is last and takes focus: on a permanent wipe the keyboard/backdrop default is
  // "don't", and nothing but a deliberate press of the red button goes through.
  row.append(go, cancel);
  card.append(row);
  overlay.append(card);
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) finishConfirm("cancel");
  });

  confirmEl = overlay;
  confirmChoice = typeof options.onChoice === "function" ? options.onChoice : null;
  root.append(overlay);
  cancel.focus();
  ctxRef.engine.audio.playSfx("ui_open");
  return { close: closeConfirm };
}

function closeConfirm() {
  if (!confirmEl) return;
  if (confirmEl.parentNode) confirmEl.parentNode.removeChild(confirmEl);
  confirmEl = null;
  confirmChoice = null;
}

function finishConfirm(id) {
  const cb = confirmChoice;
  closeConfirm();
  ctxRef.engine.audio.playSfx("ui_close");
  if (cb) cb(id);
}

// ---------------------------------------------------------------------------
// panel plumbing
// ---------------------------------------------------------------------------

const BUILDERS = { shop: buildShop, rebirth: buildRebirth, titles: buildTitles, travel: buildTravel };

export function openPanel(name) {
  if (!panelEl || !BUILDERS[name]) return;
  if (openName === name) return;
  panelBodyEl.textContent = "";
  updaters = [];
  openName = name;
  panelTitleEl.textContent = PANELS[name];
  BUILDERS[name](panelBodyEl);
  panelEl.dataset.open = "1";
  panelBodyEl.scrollTop = 0;
  paintRail();
  refresh();
  ctxRef.engine.audio.playSfx("ui_open");
}

export function closePanel() {
  if (!panelEl || !openName) return;
  openName = null;
  panelEl.dataset.open = "0";
  // The rows stay in the DOM until the next open so the slide-out is not a blank box;
  // they are inert (nothing refreshes them) while closed.
  updaters = [];
  paintRail();
  ctxRef.engine.audio.playSfx("ui_close");
}

// Re-renders the open panel's rows from state. Cheap by construction: every row keeps its
// nodes and only rewrites text/style, so this can run several times a second while
// Strength climbs without touching the DOM tree.
export function refresh() {
  for (const fn of updaters) fn();
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

export function init(ctx, state, handlers) {
  ctxRef = ctx;
  stateRef = state;
  hooks = handlers;
  updaters = [];
  openName = null;
  sawTouch = false;
  railButtons = new Map();
  confirmEl = null;
  confirmChoice = null;

  styleTag = document.createElement("style");
  styleTag.id = "lifting-ui-css";
  styleTag.textContent = CSS;
  document.head.appendChild(styleTag);

  root = el("div", `position:fixed;inset:0;pointer-events:none;z-index:${Z_INDEX};`);
  root.id = "lifting-ui";
  panelEl = buildPanel();
  root.append(buildLiftButton(), buildRail(), panelEl);
  document.body.appendChild(root);
  paintRail();

  keyHandler = (ev) => {
    if (ev.key !== "Escape") return;
    // The modal is on top, so Escape dismisses it before it reaches the panel underneath.
    if (confirmEl) {
      finishConfirm("cancel");
      return;
    }
    if (openName) closePanel();
  };
  document.addEventListener("keydown", keyHandler);
}

export function dispose() {
  // Silent: a teardown mid-confirm must not run the action the player never confirmed.
  closeConfirm();
  if (keyHandler) document.removeEventListener("keydown", keyHandler);
  if (root && root.parentNode) root.parentNode.removeChild(root);
  if (styleTag && styleTag.parentNode) styleTag.parentNode.removeChild(styleTag);
  ctxRef = null;
  stateRef = null;
  hooks = null;
  root = null;
  styleTag = null;
  panelEl = null;
  panelTitleEl = null;
  panelBodyEl = null;
  openName = null;
  updaters = [];
  railButtons = new Map();
  keyHandler = null;
  hintEl = null;
  confirmEl = null;
  confirmChoice = null;
}
