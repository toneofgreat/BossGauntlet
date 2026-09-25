// src/games/battles/scripts/timewarp.js — Battles. Spec 26 §13: the Time Warp questline.
//
// The clock arch in the lobby leads to the TIME WARP TOWER (layout.js §13a): tiny
// pads, lava, lava spinners, no checkpoints — a fall drops you back on the base disc,
// lava sends you home to the lobby. The summit's green ring is the only way into the
// LETTUCE REALM (§13b), where ten lettuces hide: one in plain sight, a happy one under
// farm glass, a sad one ON the glass, a big one at the map's edge, three at the ends of
// an ever-crueller sky obby, one behind a binary-coded vault door, one in a giant's
// rafters, one festering in the sewer. All ten collected → save.tw, and the Time Warp
// waits on its pedestal by the arch.
//
// This module owns its DOM overlays and the collected-lettuce bookkeeping; game.js
// forwards touch events into onTouch(), ticks update(dt), and calls refreshWorld()
// after loads so a returning save finds its lettuces already picked.

import { LOBBY_SPAWN, LOBBY_YAW, TW_START, LETTUCE_SPAWN, TW_CODE, LETTUCE_KEYS } from "./layout.js";

const LETTUCE_NAMES = {
  sight: "the Lettuce in Plain Sight",
  happy: "the Happy Lettuce",
  sad: "the Sad Lettuce",
  big: "the BIG Lettuce",
  stud: "the Stud Lettuce",
  ystud: "the Yellow Stud Lettuce",
  evil: "the EVIL Lettuce",
  secret: "the Secret Lettuce",
  brick: "the Brick Lettuce",
  sewer: "the Sewer Lettuce",
};

export function createTimewarp(deps) {
  const { ctx, getSave, saveNow, toast, sfx, isPanelOpen, setPanelOpen, onUnlockTimewarp, leaveArena, getWorld } = deps;

  const T = {
    overlay: null,
    doorGone: false,   // the vault door reseals every session — the code is the key
    inRealm: false,
    timers: [],
    fxSeq: 0,
  };
  const save = () => getSave();
  const later = (t, fn) => T.timers.push({ t, fn });
  const count = () => LETTUCE_KEYS.reduce((n, k) => n + (save().twl[k] ? 1 : 0), 0);

  // ---- overlay scaffolding (quest.js's pattern) --------------------------------------
  function closeOverlay() {
    if (T.overlay) { try { T.overlay.remove(); } catch { /* gone */ } T.overlay = null; setPanelOpen(false); }
  }
  function openOverlay() {
    if (isPanelOpen()) return null;
    setPanelOpen(true);
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;inset:0;z-index:80;background:rgba(10,7,16,0.92);display:flex;align-items:center;justify-content:center;touch-action:manipulation;";
    document.body.append(el);
    T.overlay = el;
    return el;
  }
  function bigBtn(label, style) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label;
    b.style.cssText = "font:700 17px system-ui,sans-serif;color:#fff;border:none;border-radius:14px;padding:14px 18px;cursor:pointer;box-shadow:0 3px 10px rgba(0,0,0,.4);touch-action:manipulation;user-select:none;background:#3a2740;" + (style || "");
    return b;
  }
  function card(el, maxW) {
    const c = document.createElement("div");
    c.style.cssText = `background:#221833;border:2px solid #7ec8ff;border-radius:18px;padding:22px;max-width:${maxW || 420}px;width:92vw;max-height:86vh;overflow:auto;color:#e8e0f0;font:400 15px/1.5 system-ui,sans-serif;`;
    el.append(c);
    return c;
  }

  // ---- travel -------------------------------------------------------------------------
  function enterTower() {
    leaveArena(); // no fighting mid-climb; also re-pins the lobby checkpoint
    T.inRealm = false;
    try { ctx.player.teleport([TW_START[0], TW_START[1], TW_START[2]], 180); } catch { /* fine */ }
    try { ctx.engine.audio.playMusic("ascent"); } catch { /* fine */ }
    sfx("warp");
    toast(save().twTower
      ? "The tower again — for the joy of it. Fall: base. Lava: lobby."
      : "THE TIME WARP TOWER. Tiny pads. Lava. Spinners. Fall and you start the climb over; burn and you're home.", "⌛", 5200);
  }
  function enterRealm() {
    leaveArena();
    T.inRealm = true;
    try { ctx.player.teleport([LETTUCE_SPAWN[0], LETTUCE_SPAWN[1], LETTUCE_SPAWN[2]], 180); } catch { /* fine */ }
    try { ctx.player.setCheckpoint([LETTUCE_SPAWN[0], LETTUCE_SPAWN[1], LETTUCE_SPAWN[2]]); } catch { /* fine */ }
    try { ctx.engine.audio.playMusic("plaza"); } catch { /* fine */ }
    sfx("sparkle");
    toast(`The LETTUCE REALM. ${count()}/10 found. No checkpoints in its obbies — falls come back to the plaza.`, "🥬", 5200);
  }
  function backToLobby(msg) {
    T.inRealm = false;
    try { ctx.player.teleport([LOBBY_SPAWN[0], LOBBY_SPAWN[1], LOBBY_SPAWN[2]], LOBBY_YAW); } catch { /* fine */ }
    try { ctx.player.setCheckpoint([LOBBY_SPAWN[0], LOBBY_SPAWN[1], LOBBY_SPAWN[2]]); } catch { /* fine */ }
    try { ctx.engine.audio.playMusic("chill"); } catch { /* fine */ }
    if (msg) toast(msg, "⌛", 3200);
  }

  // ---- the gate panel: two doors, one arch --------------------------------------------
  function openGate() {
    const el = openOverlay(); if (!el) return;
    sfx("ui_open");
    const c = card(el);
    const s = save();
    const h = document.createElement("h3"); h.style.cssText = "margin:0 0 10px;font:800 20px system-ui;color:#7ec8ff;";
    h.textContent = "⌛ The Clock Arch";
    const p = document.createElement("p"); p.style.cssText = "margin:0 0 16px;";
    p.textContent = s.tw
      ? "The tower knows you now. Climb it again for glory, or wander the realm where its lettuces grew back home in your memory (the ten stay found)."
      : s.twTower
        ? `You have beaten the tower — the realm remembers you (${count()}/10 lettuces found). Warp straight in, or take the climb again.`
        : "Beyond this arch stands a tower of tiny pads, lava and spinning fire. Nobody has to climb it. The Time Warp sword is why everybody does. Fall and you restart the climb; touch lava and you're back here.";
    const row = document.createElement("div"); row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;";
    const climb = bigBtn("🗼 Climb the Tower", "background:linear-gradient(180deg,#7c3aed,#4c1d95);flex:1.2;");
    climb.addEventListener("click", () => { closeOverlay(); enterTower(); });
    row.append(climb);
    if (s.twTower) {
      const warp = bigBtn("🥬 Warp to the Realm", "background:linear-gradient(180deg,#2f8f4a,#1f6b34);flex:1.2;");
      warp.addEventListener("click", () => { closeOverlay(); enterRealm(); });
      row.append(warp);
    }
    const nope = bigBtn("Not today", "background:#565d70;flex:0.8;");
    nope.addEventListener("click", () => { sfx("ui_close"); closeOverlay(); });
    row.append(nope);
    c.append(h, p, row);
  }

  // ---- tower summit -------------------------------------------------------------------
  function winTower() {
    const s = save();
    if (!s.twTower) {
      s.twTower = true; saveNow();
      sfx("win");
      toast("THE TOWER BOWS. Beyond the ring: the Lettuce Realm — find all TEN.", "🗼", 5200);
      try { ctx.services.badges.award("tw_tower"); } catch { /* fine */ }
    } else {
      sfx("fanfare");
    }
    later(0.8, () => enterRealm());
  }

  // ---- lettuce collection -------------------------------------------------------------
  function removeLettuce(key) {
    const world = getWorld();
    const entry = world.lettuces && world.lettuces[key];
    if (!entry) return;
    for (const id of entry.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
  }
  function sparkleAt(pos, s) {
    const ids = [];
    for (let k = 0; k < 10; k++) {
      const a = k * 0.628;
      try {
        const id = `bt_twfx_${T.fxSeq++}`;
        ctx.engine.parts.create({ id, shape: "sphere", size: [0.5, 0.5, 0.5], position: [pos[0] + Math.cos(a) * 1.6 * (s || 1), pos[1] + 1.2 + (k % 3) * 0.8, pos[2] + Math.sin(a) * 1.6 * (s || 1)], color: k % 2 ? "#8be04a" : "#fff59e", material: "neon", canCollide: false });
        ids.push(id);
      } catch { /* fine */ }
    }
    later(0.8, () => { for (const id of ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } } });
  }
  function collect(key) {
    const s = save();
    if (!s.twl[key]) {
      s.twl[key] = true; saveNow();
      const world = getWorld();
      const entry = world.lettuces && world.lettuces[key];
      if (entry) sparkleAt(entry.pos, entry.scale);
      removeLettuce(key);
      const n = count();
      sfx(n >= 10 ? "win" : "badge");
      toast(`🥬 ${LETTUCE_NAMES[key]}! (${n}/10)`, "🥬", 3400);
      if (n >= 10) later(1.2, () => finishHunt());
    }
  }
  function finishHunt() {
    const s = save();
    if (s.tw) return;
    s.tw = true; saveNow();
    onUnlockTimewarp();
    sfx("fanfare");
    const el = openOverlay();
    if (el) {
      const c = card(el, 460);
      c.innerHTML = "";
      const h = document.createElement("h3"); h.style.cssText = "margin:0 0 10px;font:800 22px system-ui;color:#8be04a;";
      h.textContent = "🥬 ALL TEN LETTUCES";
      const p = document.createElement("p"); p.style.cssText = "margin:0 0 16px;";
      p.textContent = "The realm goes quiet. Somewhere behind you a clock finally finishes striking, and on the pedestal by the arch — the TIME WARP: 5 damage, a fifty-stud fling on every hit, a TIME STOP that freezes everyone but you, and a portal gun on the side. Go and take what you found.";
      const b = bigBtn("⌛ Claim the Time Warp", "background:linear-gradient(180deg,#2f6fd0,#1a3a6e);width:100%;");
      b.addEventListener("click", () => {
        closeOverlay();
        backToLobby("The Time Warp stands on its pedestal by the clock arch. Touch it. Enter the arena.");
      });
      c.append(h, p, b);
    } else {
      backToLobby("ALL TEN. The Time Warp is yours — its pedestal waits by the clock arch.");
    }
  }

  // ---- the vault keypad ---------------------------------------------------------------
  function openKeypad() {
    if (T.doorGone) { toast("The vault stands open.", "🔓", 1800); return; }
    const el = openOverlay(); if (!el) return;
    sfx("ui_open");
    const c = card(el, 340);
    const h = document.createElement("h3"); h.style.cssText = "margin:0 0 6px;font:800 20px system-ui;color:#3ddc84;text-align:center;";
    h.textContent = "🔐 THE VAULT";
    const hint = document.createElement("p"); hint.style.cssText = "margin:0 0 12px;font:400 13px/1.4 system-ui;color:#c9b8e0;text-align:center;";
    hint.textContent = "Four digits. The realm whispers them in binary — count the golden dots for the order.";
    const disp = document.createElement("div");
    disp.style.cssText = "font:800 30px ui-monospace,monospace;color:#3ddc84;background:#0d1410;border:2px solid #1f6b34;border-radius:12px;text-align:center;padding:10px;margin-bottom:14px;letter-spacing:10px;";
    let code = "";
    const paint = () => { disp.textContent = (code + "____").slice(0, 4).split("").join(" "); };
    paint();
    const grid = document.createElement("div"); grid.style.cssText = "display:grid;grid-template-columns:repeat(3,1fr);gap:8px;";
    for (const d of [1, 2, 3, 4, 5, 6, 7, 8, 9, "C", 0, "⏎"]) {
      const b = bigBtn(String(d), "padding:12px 0;font-size:19px;" + (d === "⏎" ? "background:linear-gradient(180deg,#2f8f4a,#1f6b34);" : d === "C" ? "background:#7d1f16;" : ""));
      b.addEventListener("click", () => {
        if (d === "C") { code = ""; paint(); sfx("click"); return; }
        if (d === "⏎") {
          if (code === TW_CODE) {
            T.doorGone = true;
            try { ctx.engine.parts.remove("bt_tw_vault"); } catch { /* gone */ }
            sfx("win");
            toast("The vault door grinds aside. Something glows inside.", "🔓", 3600);
            closeOverlay();
          } else {
            sfx("denied");
            code = ""; paint();
            disp.style.borderColor = "#c0392b";
            later(0.45, () => { disp.style.borderColor = "#1f6b34"; }); // sim clock, not setTimeout
          }
          return;
        }
        if (code.length < 4) { code += String(d); paint(); sfx("click"); }
      });
      grid.append(b);
    }
    const foot = document.createElement("div"); foot.style.cssText = "margin-top:12px;";
    const walk = bigBtn("walk away", "background:#565d70;width:100%;");
    walk.addEventListener("click", () => { sfx("ui_close"); closeOverlay(); });
    foot.append(walk);
    c.append(h, hint, disp, grid, foot);
  }

  // ---- the public surface -------------------------------------------------------------
  return {
    onTouch(ev) {
      if (ev === "bt_tw_enter") { openGate(); return; }
      if (ev === "bt_tw_top") { winTower(); return; }
      if (ev === "bt_tw_leave") { backToLobby("Back among the swords."); return; }
      if (ev === "bt_tw_keypad") { openKeypad(); return; }
      if (ev.startsWith("bt_lett_")) collect(ev.slice(8));
    },
    // A returning save finds its lettuces already picked. The vault reseals on load.
    refreshWorld() {
      const s = save();
      for (const k of LETTUCE_KEYS) if (s.twl[k]) removeLettuce(k);
    },
    update(dt) {
      for (let i = T.timers.length - 1; i >= 0; i--) {
        const t = T.timers[i]; t.t -= dt;
        if (t.t <= 0) { T.timers.splice(i, 1); try { t.fn(); } catch { /* fine */ } }
      }
    },
    count,
    inRealm: () => T.inRealm,
    leaveRealmState() { T.inRealm = false; },
    dispose() { closeOverlay(); },
  };
}
