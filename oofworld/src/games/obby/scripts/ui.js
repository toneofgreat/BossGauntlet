// src/games/obby/scripts/ui.js — spec 08 §5.14's stage-select: the top bar with its
// stage pill, the 90-row teleport panel and the progress bar along the bottom.
//
// The game owns exactly one DOM subtree (`#obby-ui`) and removes it in destroyUI, so
// leaving the Place leaves nothing behind (spec 04 §5.5's zero-leak rule). No timers of
// any kind: the only animation here is a CSS width transition on the progress fill,
// which is also what validate V6 requires of game code.

const Z_INDEX = 50; // spec 06's `game` layer: under the platform HUD (100)
const HUD_STRIP_PX = 56; // spec 06 §5.6.1 reserves the top strip for the HUD
const TAP_TARGET = 44;

// Near-black difficulty colors are unreadable as text; §5.14 lightens them, the same
// rule §5.7.1 applies to the world labels.
function readable(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 0.18 ? "#e0e0e0" : hex;
}

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

const BTN = `width:${TAP_TARGET}px;height:${TAP_TARGET}px;border-radius:10px;border:none;`
  + "background:rgba(0,0,0,0.55);color:#fff;font-size:20px;font-family:system-ui,sans-serif;"
  + "font-weight:700;cursor:pointer;padding:0;";

// createUI(rows, hooks) -> ui. `rows` is one entry per stage: { n, name, color }.
export function createUI(rows, hooks) {
  const total = rows.length;
  const root = el("div", `position:fixed;inset:0;pointer-events:none;z-index:${Z_INDEX};`
    + "font-family:system-ui,sans-serif;");
  root.id = "obby-ui";

  const bar = el("div", `position:fixed;top:${HUD_STRIP_PX}px;left:50%;transform:translateX(-50%);`
    + "display:flex;gap:8px;pointer-events:auto;align-items:center;");
  const prev = el("button", BTN, "◀");
  prev.id = "obby-prev";
  const pill = el("button", `height:${TAP_TARGET}px;padding:0 14px;border-radius:10px;border:none;`
    + "background:rgba(0,0,0,0.55);font-weight:700;font-size:14px;cursor:pointer;"
    + "font-family:system-ui,sans-serif;white-space:nowrap;");
  pill.id = "obby-pill";
  const next = el("button", BTN, "▶");
  next.id = "obby-next";
  bar.append(prev, pill, next);

  const panel = el("div", "position:fixed;top:108px;left:50%;transform:translateX(-50%);"
    + "width:min(320px,92vw);max-height:60vh;overflow-y:auto;-webkit-overflow-scrolling:touch;"
    + "background:rgba(10,10,12,0.92);border-radius:12px;padding:6px;display:none;pointer-events:auto;");
  panel.id = "obby-panel";
  panel.append(el("div", "height:32px;line-height:32px;text-align:center;color:#ffd700;"
    + "font-weight:700;font-size:13px;", "TELEPORT TO STAGE"));

  // Newest first: the stage you just reached is the one you want to tap.
  const rowNodes = new Map();
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    const node = el("div", `height:${TAP_TARGET}px;margin:3px 0;border-radius:8px;display:flex;`
      + "align-items:center;padding:0 10px;background:#1c1c22;font-weight:700;font-size:14px;");
    node.className = "obby-row";
    node.dataset.n = String(row.n);
    const tag = el("span", "width:36px;color:#9a9a9a;flex:none;", "S" + row.n);
    const name = el("span", "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;");
    node.append(tag, name);
    node.addEventListener("click", () => {
      if (node.dataset.locked === "1") return;
      hooks.teleport(row.n);
      panel.style.display = "none";
      pill.dataset.open = "0";
    });
    panel.append(node);
    rowNodes.set(row.n, { node, name, row });
  }

  const progress = el("div", "position:fixed;bottom:12px;left:50%;transform:translateX(-50%);"
    + "width:min(420px,60vw);height:14px;border-radius:7px;background:#222;pointer-events:none;"
    + "overflow:hidden;");
  progress.id = "obby-progress";
  const fill = el("div", "height:100%;width:0%;border-radius:7px;transition:width 0.4s;background:#fff;");
  const progressText = el("div", "position:absolute;inset:0;display:flex;align-items:center;"
    + "justify-content:center;font-size:10px;font-weight:700;color:#fff;");
  progress.append(fill, progressText);

  prev.addEventListener("click", () => { if (prev.dataset.off !== "1") hooks.teleport(current() - 1); });
  next.addEventListener("click", () => { if (next.dataset.off !== "1") hooks.teleport(current() + 1); });
  pill.addEventListener("click", () => {
    const open = pill.dataset.open === "1";
    pill.dataset.open = open ? "0" : "1";
    panel.style.display = open ? "none" : "block";
    refresh(ui, ui.state);
  });

  let stateRef = { current: 1, best: 1 };
  function current() { return stateRef.current; }

  root.append(bar, panel, progress);
  document.body.appendChild(root);

  const ui = {
    root, prev, next, pill, panel, fill, progressText, rowNodes, total,
    get state() { return stateRef; },
    set state(v) { stateRef = v; },
  };
  refresh(ui, stateRef);
  return ui;
}

// A full re-render of ~91 nodes, which is fine: this runs on progression and teleport,
// never per frame.
export function refresh(ui, state) {
  ui.state = state;
  const cur = ui.rowNodes.get(state.current);
  const bestRow = ui.rowNodes.get(state.best);
  const name = cur ? cur.row.name : "";
  const color = cur ? readable(cur.row.color) : "#e0e0e0";
  const arrow = ui.pill.dataset.open === "1" ? "▲" : "▼";
  ui.pill.textContent = `Stage ${state.current} / ${ui.total} — ${name} ${arrow}`;
  ui.pill.style.color = color;

  const offStyle = (off) => {
    return off ? "opacity:0.35;pointer-events:none;" : "opacity:1;";
  };
  ui.prev.dataset.off = state.current <= 1 ? "1" : "0";
  ui.next.dataset.off = state.current >= state.best ? "1" : "0";
  ui.prev.setAttribute("style", BTN + offStyle(ui.prev.dataset.off === "1"));
  ui.next.setAttribute("style", BTN + offStyle(ui.next.dataset.off === "1"));

  for (const [n, entry] of ui.rowNodes) {
    const locked = n > state.best;
    entry.node.dataset.locked = locked ? "1" : "0";
    entry.name.textContent = entry.row.name + (locked ? " \u{1F512}" : "");
    entry.name.style.color = locked ? "#666" : readable(entry.row.color);
    const bg = locked ? "#141417" : n === state.current ? "#103a1c" : "#1c1c22";
    entry.node.style.background = bg;
    entry.node.style.cursor = locked ? "default" : "pointer";
  }

  const pct = Math.max(0, Math.min(100, (state.best / ui.total) * 100));
  ui.fill.style.width = pct + "%";
  ui.fill.style.background = bestRow ? readable(bestRow.row.color) : "#fff";
  ui.progressText.textContent = `${state.best} / ${ui.total}`;
}

export function destroyUI(ui) {
  if (ui && ui.root && ui.root.parentNode) ui.root.parentNode.removeChild(ui.root);
}
