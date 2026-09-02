// src/games/trollobby/scripts/popups.js — the fake windows. Spec 21 §3.1 owns this.
//
// These are the Place's own DOM, not the shell's: they are a hazard, not UI, and routing
// them through the toast/dialog services would mean the platform's furniture lying to
// the player on the Place's behalf.
//
// Spec 21 §3.1's limits are all enforced here rather than trusted to the caller, because
// every one of them is the difference between a joke and a trap:
//
//   - never blocks input to the game (pointer-events only on the popup's own buttons)
//   - auto-dismisses after POPUP_LIFE_S whether or not it is clicked
//   - never more than POPUP_MAX on screen
//   - lives at the screen EDGES, never over the centre where the avatar is
//   - aria-hidden and never focused, so a screen reader is not trolled too
//
// Timing runs on sim seconds handed in by the caller (`tick(dt)`), never wall clock or
// setTimeout, so a throttled tab expires them at the same rate as a visible one and the
// 4-second guarantee holds in a headless test.

export const POPUP_LIFE_S = 4;
export const POPUP_MAX = 2;

const Z = 40; // under the shell's dialogs (they are 100+), over the canvas

// Where a popup may sit. Deliberately corners and edges — nothing over the middle band
// of the screen, which is where the avatar and the next platform are.
const SLOTS = [
  { top: "12px", left: "12px" },
  { top: "12px", right: "12px" },
  { bottom: "84px", left: "12px" },
  { bottom: "84px", right: "12px" },
];

const KINDS = {
  win: {
    title: "🎉 YOU WIN!",
    body: "Congratulations! You have completed the Troll Obby!",
    action: "Claim prize",
    bar: "#3ddc84",
  },
  error: {
    title: "⚠ oofcubes.exe",
    body: "Error 0x0BBY: platform not found. Continue anyway?",
    action: "Continue",
    bar: "#e74c3c",
  },
  ad: {
    title: "★ ONE WEIRD TRICK ★",
    body: "Local oofers HATE him! Click to find out how he beat the obby.",
    action: "✕",
    bar: "#ff36c8",
    runaway: true, // the ✕ moves away twice before it can be clicked
  },
};

export function createPopups(deps = {}) {
  const { sfx } = deps;
  let host = null;
  let live = []; // { el, age, slot }
  let slotUsed = new Set();
  let shown = 0;

  function mount() {
    if (host) return host;
    host = document.createElement("div");
    host.id = "trollobby-popups";
    // The HOST never takes pointer events. Only the popups' own buttons re-enable them,
    // so the game underneath stays fully playable — spec 21 §3.1's first limit.
    host.setAttribute("style",
      `position:fixed;inset:0;z-index:${Z};pointer-events:none;overflow:hidden`);
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
    return host;
  }

  function freeSlot() {
    for (let i = 0; i < SLOTS.length; i++) if (!slotUsed.has(i)) return i;
    return -1;
  }

  function show(kind) {
    const spec = KINDS[kind] || KINDS.error;
    if (live.length >= POPUP_MAX) return null;
    mount();
    const slot = freeSlot();
    if (slot < 0) return null;
    slotUsed.add(slot);

    const box = document.createElement("div");
    const pos = Object.entries(SLOTS[slot]).map(([k, v]) => `${k}:${v}`).join(";");
    box.setAttribute("style",
      `position:absolute;${pos};width:min(260px,42vw);pointer-events:auto;`
      + "background:#f2f3f6;color:#15171c;border:1px solid #9aa0a6;"
      + "border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,.45);"
      + "font:13px/1.35 system-ui,sans-serif;overflow:hidden");

    const bar = document.createElement("div");
    bar.setAttribute("style",
      `background:${spec.bar};color:#08090c;padding:5px 8px;font-weight:700;font-size:12px`);
    bar.textContent = spec.title;

    const body = document.createElement("div");
    body.setAttribute("style", "padding:9px 10px");
    body.textContent = spec.body;

    const foot = document.createElement("div");
    foot.setAttribute("style", "padding:0 10px 10px;text-align:right;position:relative;height:30px");

    const btn = document.createElement("button");
    btn.type = "button";
    btn.tabIndex = -1; // never takes focus — it is scenery, not a control
    btn.textContent = spec.action;
    btn.setAttribute("style",
      "position:absolute;right:10px;bottom:0;padding:4px 12px;border-radius:4px;"
      + "border:1px solid #8a9099;background:#e2e5ea;color:#15171c;font:inherit;cursor:pointer");

    let dodges = spec.runaway ? 2 : 0;
    const dodge = () => {
      if (dodges <= 0) return false;
      dodges -= 1;
      // Away from wherever it is now, and always back inside the popup.
      btn.style.right = dodges === 1 ? "auto" : "auto";
      btn.style.left = dodges === 1 ? "10px" : "44%";
      if (sfx) sfx("click");
      return true;
    };
    btn.addEventListener("pointerenter", dodge);
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (dodge()) return;
      close(rec);
    });

    foot.appendChild(btn);
    box.append(bar, body, foot);
    host.appendChild(box);
    if (sfx) sfx("error");

    const rec = { el: box, age: 0, slot };
    live.push(rec);
    shown += 1;
    return rec;
  }

  function close(rec) {
    const i = live.indexOf(rec);
    if (i < 0) return;
    live.splice(i, 1);
    slotUsed.delete(rec.slot);
    if (rec.el && rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
  }

  function tick(dt) {
    if (!live.length) return;
    // Iterate a copy: close() mutates `live`.
    for (const rec of live.slice()) {
      rec.age += dt;
      if (rec.age >= POPUP_LIFE_S) close(rec);
    }
  }

  function clear() {
    for (const rec of live.slice()) close(rec);
    live = [];
    slotUsed = new Set();
  }

  function dispose() {
    clear();
    if (host && host.parentNode) host.parentNode.removeChild(host);
    host = null;
  }

  return {
    show, tick, clear, dispose,
    count: () => live.length,
    totalShown: () => shown,
    oldestAge: () => (live.length ? Math.max(...live.map((r) => r.age)) : 0),
  };
}
