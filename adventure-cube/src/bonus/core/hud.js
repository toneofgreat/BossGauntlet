// hud.js - CORE's bonus HUD: clock + day (top-right), pause button, toasts, pause menu panel (CORE owns). DOM.
// Classes are prefixed bc-. Regions other modules must keep free: top-right 220x48 css px, toasts top-center.
import { clockText, phase } from "./time.js";
import { ITEMS } from "../data/items.js";

const CSS = `
.bz-root{position:fixed;inset:0;pointer-events:none;z-index:5;user-select:none;-webkit-user-select:none}
.bc-top{position:absolute;right:16px;top:12px;display:flex;gap:8px;align-items:center;pointer-events:auto;font:600 13px system-ui,sans-serif;color:#fff}
.bc-clock{background:rgba(0,0,0,.42);padding:6px 10px;border-radius:10px;text-shadow:0 1px 2px #000;white-space:nowrap}
.bc-clock i{font-style:normal;opacity:.8;margin-left:4px}
.bc-btn{min-width:36px;height:32px;min-height:0;margin:0;padding:0 8px;border-radius:9px;border:1px solid rgba(255,255,255,.3);background:rgba(0,0,0,.42);color:#fff;font:700 13px system-ui;cursor:pointer}
.bc-toasts{position:absolute;left:50%;top:64px;transform:translateX(-50%);display:flex;flex-direction:column;gap:4px;align-items:center;max-width:calc(100vw - 32px)}
.bz-touch .bc-toasts{top:118px}
.bc-toast{background:rgba(20,16,10,.78);color:#fff;padding:5px 12px;border-radius:10px;font:600 13px system-ui;transition:opacity .4s;text-align:center}
@media (max-width:520px){.bc-clock{font-size:11px;padding:5px 8px}.bc-top{gap:6px}}
.bc-pause{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:rgba(24,20,14,.95);color:#f3ead8;border-radius:14px;padding:18px;min-width:min(300px,calc(100vw - 32px));max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow:auto;box-sizing:border-box;pointer-events:auto;display:flex;flex-direction:column;gap:8px;font:14px system-ui}
.bc-pause h2{margin:0 0 6px;text-align:center}
.bc-pause button{padding:10px;border-radius:10px;border:0;background:#4a3a24;color:#fff;font:600 14px system-ui;cursor:pointer}
.bc-pause button.primary{background:#c8792a}
.bc-pause small{opacity:.7;text-align:center}
@media (max-height:480px){.bc-pause{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:12px;min-width:min(420px,calc(100vw - 32px))}.bc-pause h2,.bc-pause small{grid-column:1/-1;margin:0}.bc-pause button{padding:8px;min-height:40px;margin:0}}
`;

export function createHud(ctx, actions) {
  const els = [];
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st); els.push(st);
  const top = document.createElement("div"); top.className = "bc-top";
  top.innerHTML = `<span class="bc-clock"></span><button class="bc-btn" data-a="pause" aria-label="Pause">II</button>`;
  ctx.root.appendChild(top); els.push(top);
  const clock = top.querySelector(".bc-clock");
  top.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b && b.dataset.a === "pause") ctx.openPanel(ctx.panel === "pause" ? null : "pause"); });
  const toasts = document.createElement("div"); toasts.className = "bc-toasts"; ctx.root.appendChild(toasts); els.push(toasts);

  function toast(text, ms = 2200) {
    const t = document.createElement("div"); t.className = "bc-toast"; t.textContent = text;
    toasts.appendChild(t);
    while (toasts.children.length > 4) toasts.firstChild.remove();
    setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 450); }, ms);
  }
  // pause panel
  let pp = null;
  ctx.registerPanel("pause", {
    open() {
      pp = document.createElement("div"); pp.className = "bc-pause";
      pp.innerHTML = `<h2>Paused</h2><button class="primary" data-a="resume">Resume</button><button data-a="settings">Settings</button>
        <button data-a="home">Return home</button><button data-a="save">Save</button><button data-a="quit">Save &amp; quit</button><button data-a="new">New world</button>
        <small>${ctx.isTouch ? "" : "A/D move &middot; W/Space jump &middot; J or click hit &middot; F use/eat/place &middot; E bag &middot; H house &middot; 1-9 hotbar &middot; S/W aim down/up &middot; Esc pause"}</small>`;
      pp.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        ctx.app.audio.sfx("click");
        const a = b.dataset.a;
        if (a === "resume") ctx.closePanel();
        if (a === "settings") actions.settings();
        if (a === "home" && actions.home) actions.home();
        if (a === "save") toast(ctx.save() ? "Saved" : "Not saved: your old world is kept safe");
        if (a === "quit") actions.quit();
        if (a === "new" && (typeof confirm !== "function" || confirm("Start a new world? Your current world is lost."))) actions.newWorld();
      });
      ctx.root.appendChild(pp);
    },
    close() { if (pp) pp.remove(); pp = null; },
  });
  let lastClock = "";
  return {
    toast,
    bind(G) {
      return [
        G.bus.on("toast", (d) => toast(d.text)),
        G.bus.on("pickup", (d) => toast("+" + d.n + " " + (ITEMS[d.id] ? ITEMS[d.id].name : d.id), 1400)),
        G.bus.on("tile:tooHard", (d) => toast(d.need >= 2 ? "Needs a better pickaxe" : "Needs a pickaxe", 1400)),
        G.bus.on("tree:tooHard", () => toast("Needs a stone axe or better", 1400)),
        G.bus.on("tool:break", (d) => toast((ITEMS[d.id] ? ITEMS[d.id].name : "Tool") + " broke!")),
        G.bus.on("house:upgrade", (d) => { if (!d.debug) toast("House upgraded: " + d.name + "!", 3500); }),
        G.bus.on("player:die", () => toast("You fainted... waking up at home", 3000)),
        G.bus.on("time:phase", (d) => { if (d.phase === "night") toast("Night falls. Stay near light!"); if (d.phase === "dawn") toast("A new day dawns"); }),
      ];
    },
    frame(G) {
      const c = clockText(G) + " " + ({ dawn: "☀", day: "☀", dusk: "☾", night: "☾" }[phase(G)]);
      if (c !== lastClock) { lastClock = c; clock.textContent = c; }
    },
    destroy() { if (pp) pp.remove(); pp = null; for (const e of els) e.remove(); },
  };
}
