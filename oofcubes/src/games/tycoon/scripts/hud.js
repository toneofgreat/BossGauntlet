// src/games/tycoon/scripts/hud.js — spec 10 §5.13: the tycoon's own HUD layer. The
// platform HUD carries Oofbux and badges; this carries CASH, which is a different
// currency that never leaves this Place, plus the boost chip, the gear hotbar and the
// CODES panel.
//
// One DOM subtree, removed on dispose. No timers: the numbers are pushed from the sim
// step, and the only animation is a CSS transition.

const Z_INDEX = 50; // spec 06's `game` layer, under the platform HUD
const HUD_STRIP_PX = 56;

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

const CHIP = "height:34px;padding:0 12px;border-radius:9px;background:rgba(0,0,0,0.55);"
  + "color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;gap:6px;"
  + "font-family:system-ui,sans-serif;white-space:nowrap;";
const BTN = "min-width:44px;height:44px;padding:0 12px;border-radius:10px;border:none;"
  + "background:rgba(0,0,0,0.6);color:#fff;font-weight:700;font-size:13px;cursor:pointer;"
  + "font-family:system-ui,sans-serif;";

// createHud(hooks) -> ui. hooks = { redeem(code) -> {ok,message}, equip(id|null) }.
export function createHud(hooks) {
  const root = el("div", `position:fixed;inset:0;pointer-events:none;z-index:${Z_INDEX};`
    + "font-family:system-ui,sans-serif;");
  root.id = "tycoon-ui";

  const bar = el("div", `position:fixed;top:${HUD_STRIP_PX + 44}px;left:12px;display:flex;gap:8px;`
    + "align-items:center;pointer-events:auto;flex-wrap:wrap;max-width:70vw;");
  const cash = el("div", CHIP + "color:#7dff8a;");
  const income = el("div", CHIP);
  const mult = el("div", CHIP + "color:#ffd23f;");
  const boost = el("div", CHIP + "color:#ff8c1a;display:none;");
  const codesBtn = el("button", BTN, "CODES");
  codesBtn.id = "tycoon-codes-btn";
  bar.append(cash, income, mult, boost, codesBtn);

  // ---- codes panel ----
  const panel = el("div", "position:fixed;top:152px;left:12px;width:min(300px,88vw);"
    + "background:rgba(10,10,12,0.94);border-radius:12px;padding:12px;display:none;"
    + "pointer-events:auto;");
  panel.id = "tycoon-codes";
  panel.append(el("div", "color:#ffd23f;font-weight:700;font-size:13px;margin-bottom:8px;", "ENTER A CODE"));
  const input = document.createElement("input");
  input.setAttribute("style", "width:100%;box-sizing:border-box;height:40px;border-radius:8px;"
    + "border:1px solid #2f3338;background:#101014;color:#fff;padding:0 10px;font-size:14px;"
    + "font-family:ui-monospace,monospace;text-transform:uppercase;");
  input.placeholder = "e.g. OOF";
  const msg = el("div", "font-size:12px;color:#9aa3b8;margin-top:8px;min-height:16px;");
  const go = el("button", BTN + "width:100%;margin-top:8px;background:#2a67c9;", "Redeem");
  panel.append(input, go, msg);

  function submit() {
    const res = hooks.redeem(input.value);
    msg.textContent = res.message;
    msg.style.color = res.ok ? "#7dff8a" : "#ff7d7d";
    if (res.ok) input.value = "";
  }
  go.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  codesBtn.addEventListener("click", () => {
    const open = panel.style.display === "block";
    panel.style.display = open ? "none" : "block";
    if (!open) input.focus();
  });

  // ---- gear hotbar ----
  const hotbar = el("div", "position:fixed;bottom:12px;left:50%;transform:translateX(-50%);"
    + "display:flex;gap:8px;pointer-events:auto;");
  const slots = new Map();

  root.append(bar, panel, hotbar);
  document.body.appendChild(root);

  return {
    root,
    setCash(text) { cash.textContent = "💵 " + text; },
    setIncome(text) { income.textContent = "📈 " + text; },
    setMultiplier(text) { mult.textContent = "×" + text; },
    setBoost(secondsLeft) {
      if (!secondsLeft || secondsLeft <= 0) {
        boost.style.display = "none";
        return;
      }
      boost.style.display = "flex";
      boost.textContent = "⚡ 2× " + Math.ceil(secondsLeft) + "s";
    },
    // The hotbar only ever shows gear you own; tapping the equipped one puts it away.
    setGear(owned, equippedId) {
      for (const [id, node] of slots) {
        if (owned.some((g) => g.id === id)) continue;
        node.remove();
        slots.delete(id);
      }
      for (const g of owned) {
        let node = slots.get(g.id);
        if (!node) {
          node = el("button", BTN, g.name.replace(/^Boss /, ""));
          node.dataset.gear = g.id;
          node.addEventListener("click", () => hooks.equip(g.id === equippedId ? null : g.id));
          hotbar.appendChild(node);
          slots.set(g.id, node);
        }
        const on = g.id === equippedId;
        node.setAttribute("style", BTN + (on ? "background:#2a67c9;outline:2px solid #7fd4f2;" : ""));
      }
    },
    dispose() {
      if (root.parentNode) root.parentNode.removeChild(root);
      slots.clear();
    },
  };
}
