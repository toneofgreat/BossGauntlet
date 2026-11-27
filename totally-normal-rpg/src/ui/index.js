// index.js - UI module entry (CONTRACT 12). init(ctx) builds every DOM layer under #ui, shows the title screen at once
// (2D canvas, instant), wires the bus, registers the per-frame UI system (priority 80) and returns ctx.ui.
import { CSS } from "./style.js";
import { el, wait, isTyping } from "./dom.js";
import { createTitle } from "./title.js";
import { createHud } from "./hud.js";
import { createDialogue } from "./dialogue.js";
import { createMenus } from "./menus.js";
import { createScreens } from "./screens.js";
import { createJumpscare } from "./jumpscare.js";
import { createLeaderboard } from "./leaderboard.js";
import { validateName, onlineNameFor } from "./names.js";
import { commas, fmtPopup } from "./format.js";

function warn(e) { console.warn("[ui]", e); }

// No browser zoom (same rules as adventure-cube/index.html); idempotent so ENGINE's copy and ours can coexist.
function blockZoom() {
  if (window.__tnZoomBlocked) return;
  window.__tnZoomBlocked = true;
  const opt = { passive: false };
  let last = 0;
  document.addEventListener("dblclick", (e) => { if (!isTyping(e.target)) e.preventDefault(); }, opt);
  document.addEventListener("touchend", (e) => {
    const now = e.timeStamp || Date.now();
    if (now - last < 350 && e.changedTouches.length === 1 && !isTyping(e.target)) e.preventDefault();
    last = now;
  }, opt);
  document.addEventListener("touchstart", (e) => { if (e.touches.length > 1) e.preventDefault(); }, opt);
  document.addEventListener("touchmove", (e) => { if (e.touches.length > 1 || (e.scale !== undefined && e.scale !== 1)) e.preventDefault(); }, opt);
  for (const n of ["gesturestart", "gesturechange", "gestureend"]) document.addEventListener(n, (e) => e.preventDefault(), opt);
  window.addEventListener("wheel", (e) => { if (e.ctrlKey) e.preventDefault(); }, opt);
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "+" || e.key === "=" || e.key === "-" || e.key === "_" || e.key === "0")) e.preventDefault();
  });
}

export async function init(ctx) {
  const { bus, state } = ctx;

  // ------------------------------------------------------------------ root + styles
  let root = document.getElementById("ui");
  if (!root) { root = el("div"); root.id = "ui"; document.body.appendChild(root); }
  if (!document.getElementById("tn-ui-style")) {
    const st = document.createElement("style");
    st.id = "tn-ui-style"; st.textContent = CSS;
    document.head.appendChild(st);
  }
  blockZoom();
  try { if (matchMedia("(pointer: coarse)").matches) document.body.classList.add("tn-touch"); } catch (e) { /* */ }
  // ENGINE draws its own contextual INTERACT button on touch: hide our prompt pill there
  try { if (ctx.engine && ctx.engine.touch && ctx.engine.touch.setInteract) document.body.classList.add("tn-touchui"); } catch (e) { /* */ }

  const eng = () => ctx.engine || null;
  const audio = () => ctx.audio || null;
  function A(fn) { try { const a = audio(); if (a) fn(a); } catch (e) { warn(e); } }
  function touch(v) { try { const t = eng() && eng().touch; if (t && t.setVisible) t.setVisible(!!v); } catch (e) { warn(e); } }
  function saveWrite() { try { ctx.save && ctx.save.write && ctx.save.write(); } catch (e) { warn(e); } }
  function exitLock() { try { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* */ } }
  function counts() {
    try { if (ctx.story && ctx.story.secretCount) return ctx.story.secretCount(); } catch (e) { /* */ }
    return { count: Object.keys(state.profile.secrets || {}).length, total: 26 };
  }

  // ------------------------------------------------------------------ state of the chrome
  let hudWanted = true, promptLabel = null, busy = false, titlePaused = false, startedFlag = 0;
  let confirming = false, lastCine = false;

  function setScreen(s) { state.ui.screen = s; chrome(); }

  function chrome() {
    const s = state.ui.screen, cine = !!state.rt.cinematic;
    const dlgOn = dlg.active, menuOn = menus.isOpen;
    const modal = dlgOn || menuOn || confirming || s === "ending" || s === "death";
    state.ui.modal = !!modal;
    const inGame = s === "game" || s === "dialogue" || s === "menu";
    hud.setVisible(hudWanted && inGame && !cine);
    touch(s === "game" && !cine && !dlgOn && !menuOn && !confirming);
    lb.setHidden(busy || (s === "title" && title.red) || !(s === "title" || (s === "game" && !cine && !dlgOn)) || (menuOn && !menus.overTitle));
    const showPrompt = promptLabel && s === "game" && !modal && !cine;
    hud.setPrompt(showPrompt ? promptLabel : null);
  }

  // ------------------------------------------------------------------ settings
  function setSetting(key, value) {
    try {
      state.settings[key] = value;
      bus.emit("settings:change", { key, value });
      if (key === "master" || key === "music" || key === "sfx") A((a) => a.setVolumes && a.setVolumes({ master: state.settings.master, music: state.settings.music, sfx: state.settings.sfx }));
      if (key === "quality") { const q = eng() && eng().quality; if (q && q.applySetting) q.applySetting(value); }
      if (key === "pointerLock" && !value) exitLock();
      saveWrite();
      title.syncPhoto();
    } catch (e) { warn(e); }
  }

  // ------------------------------------------------------------------ components
  const hud = createHud(ctx, root, { onPause: () => openMenu("pause") });
  const dlg = createDialogue(ctx, root, {
    onOpen(speaker) { if (state.ui.screen === "game") state.ui.screen = "dialogue"; bus.emit("dialogue:open", { npc: speaker }); chrome(); },
    onClose(speaker) { if (state.ui.screen === "dialogue") state.ui.screen = "game"; bus.emit("dialogue:close", { npc: speaker }); chrome(); },
    onConfirm(on) { confirming = on; chrome(); }
  });
  const menus = createMenus(ctx, root, {
    setSetting,
    toast: (t, k) => hud.toast(t, { kind: k || "info" }),
    onClose() {
      if (state.ui.screen === "menu") {
        state.ui.screen = "game";
        if (state.rt.paused && !titlePaused) { state.rt.paused = false; bus.emit("game:pause", { paused: false }); }
      }
      chrome();
      if (state.ui.screen === "title") title.show({ keepFocus: false });
    },
    async quitToTitle() {
      const c = await dlg.confirm("Return to the title? Your progress is saved.", ["Title", "Stay"]);
      if (c !== 0) return;
      menus.close();
      saveWrite();
      showTitle();
    }
  });
  const screens = createScreens(ctx, root, {
    onScreen(s) { if (s === "game" && state.ui.screen !== "death") return; setScreen(s); },
    counts
  });
  const jump = createJumpscare(ctx, root);
  const lb = createLeaderboard(ctx, root);
  const title = createTitle(ctx, root, {
    onPlay: (newGame) => play(newGame),
    onSettings: () => openMenu("settings"),
    confirm: (t, l) => dlg.confirm(t, l),
    setSetting,
    onName(name) {
      state.profile.name = name;
      state.profile.onlineName = onlineNameFor(name);
      saveWrite();
      try { const p = eng() && eng().player; if (p && p.setNameTag) p.setNameTag(name); } catch (e) { warn(e); }
      hud.setName(name);
      lb.claim().then(() => lb.submit()).catch(warn);
    }
  });

  // ------------------------------------------------------------------ audio unlock (first gesture)
  let unlocked = false;
  function titleTrack() {
    const ng = (state.run.cycle | 0) >= 1;
    try { const t = audio() && audio().tracks; if (ng && Array.isArray(t) && t.indexOf("title_ng") >= 0) return "title_ng"; } catch (e) { /* */ }
    return "title";
  }
  function onGesture() {
    if (unlocked) return;
    unlocked = true;
    window.removeEventListener("pointerdown", onGesture, true);
    window.removeEventListener("keydown", onGesture, true);
    A((a) => { a.unlock && a.unlock(); });
    A((a) => a.setVolumes && a.setVolumes({ master: state.settings.master, music: state.settings.music, sfx: state.settings.sfx }));
    if (state.ui.screen === "title" || state.ui.screen === "name") {
      if (title.red) A((a) => a.music && a.music("redTitle"));
      else A((a) => a.music && a.music(titleTrack()));
    }
    title.soundUnlocked();
  }
  window.addEventListener("pointerdown", onGesture, true);
  window.addEventListener("keydown", onGesture, true);

  // ------------------------------------------------------------------ title / play flow
  function showTitle(opts) {
    dlg.closeAll();
    if (menus.isOpen) menus.close();
    screens.hideEnding();
    screens.letterbox(false, 0);
    hud.bossBar.hide();
    hud.subtitle("");
    exitLock();
    if (state.rt.playing && !state.rt.paused) { state.rt.paused = true; titlePaused = true; bus.emit("game:pause", { paused: true }); }
    else if (state.rt.playing) titlePaused = true;
    setScreen("title");
    title.show(opts || {});
    if (unlocked) A((a) => a.music && a.music(titleTrack()));
    screens.setFadeInstant(0);
    lb.render();
  }

  async function waitStarted(since, ms) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      if (startedFlag > since) return true;
      await wait(50);
    }
    return startedFlag > since;
  }

  /** fade from black into the world: black -> soft white-green bloom -> clear (no bloom when Reduce flashing is on) */
  async function bloomIn(instant) {
    screens.letterbox(true, 0);
    setTimeout(() => screens.letterbox(false, instant ? 0.3 : 2.5), instant ? 0 : 200);
    if (instant) { await screens.fade(0, 0.25); return; }
    screens.setFadeInstant(1, "#000");
    if (!state.settings.reduceFlashing) {
      const f = root.querySelector(".tn-fade");
      if (f) { f.style.transition = "background-color 1s ease"; void f.offsetWidth; f.style.background = "#dfe8d4"; }
      await wait(1000);
    }
    await screens.fade(0, 3);
  }

  async function play(newGame, opts) {
    opts = opts || {};
    if (busy) return false;
    onGesture();
    if (!state.profile.name) {
      setScreen("name");
      const n = await title.openEntry(false);
      if (!n) { setScreen("title"); return false; }
    }
    busy = true;
    try {
      A((a) => a.music && a.music(null, { fade: 2.5 }));
      screens.setFadeInstant(1, "#000");
      if (title.visible) { if (opts.instant) title.hide(); else await title.leave(1.6); }
      try { const p = eng() && eng().player; if (p && p.setNameTag) p.setNameTag(state.profile.name); } catch (e) { warn(e); }
      hud.setName(state.profile.name);
      if (titlePaused) { titlePaused = false; state.rt.paused = false; bus.emit("game:pause", { paused: false }); }
      const since = startedFlag;
      state.ui.screen = "cinematic";
      bus.emit("ui:play", { newGame: !!newGame });
      await waitStarted(since, 6000);
      hud.snapLevel(); hud.refreshEquip();
      setScreen("game");
      await bloomIn(!!opts.instant);
      lb.claim().then(() => lb.submit()).catch(warn);
    } catch (e) { warn(e); setScreen("game"); screens.setFadeInstant(0); }
    finally { busy = false; chrome(); }
    return true;
  }

  // the red NG+ title: shown for `sec`, then STORY restarts; game:start fades it away
  let redWaiting = false;
  async function showRedTitle(sec) {
    sec = Math.max(0.5, Number(sec) || 4);
    dlg.closeAll();
    hud.bossBar.hide();
    hud.subtitle("");
    screens.letterbox(false, 0);
    setScreen("title");
    title.show({ red: true });
    A((a) => a.music && a.music("redTitle", { fade: 0.5 }));
    screens.setFadeInstant(0);
    await wait(sec * 1000);
    redWaiting = true;
    // safety: if no game:start arrives, leave the red title anyway
    setTimeout(() => { if (redWaiting && title.visible && title.red) leaveRed(); }, 8000);
  }
  async function leaveRed() {
    redWaiting = false;
    busy = true;
    try {
      screens.setFadeInstant(1, "#000");
      A((a) => a.music && a.music(null, { fade: 1.5 }));
      await title.leave(1.2);
      hud.snapLevel(); hud.refreshEquip();
      setScreen("game");
      await bloomIn(false);
    } catch (e) { warn(e); } finally { busy = false; chrome(); }
  }

  // ------------------------------------------------------------------ menus / pause
  function openMenu(which, opts) {
    try {
      const s = state.ui.screen;
      if (s === "title" || s === "name") { menus.open("settings", { overTitle: true }); return; }
      if (s === "ending" || s === "death" || jump.active) return;
      if (dlg.active && which !== "shop") return;
      exitLock();
      if (!state.rt.paused) { state.rt.paused = true; bus.emit("game:pause", { paused: true }); }
      state.ui.screen = "menu";
      menus.open(which || "pause", Object.assign({ atExchange: which === "shop" }, opts || {}));
      chrome();
    } catch (e) { warn(e); }
  }
  function closeMenu() { if (menus.isOpen) menus.close(); }

  // ------------------------------------------------------------------ bus
  let pendingGain = 0, pendingAt = 0, lastItem = null, lastItemAt = 0;
  const PLAYER_POS = { x: 0, y: 0, z: 0 };
  function playerPos() {
    const p = eng() && eng().player && eng().player.position;
    if (p) { PLAYER_POS.x = p.x; PLAYER_POS.y = p.y; PLAYER_POS.z = p.z; } else if (ctx.camera) { PLAYER_POS.x = ctx.camera.position.x; PLAYER_POS.y = ctx.camera.position.y - 1.6; PLAYER_POS.z = ctx.camera.position.z; }
    return PLAYER_POS;
  }
  function on(name, fn) { bus.on(name, (p) => { try { fn(p || {}); } catch (e) { warn(e); } }); }

  on("game:start", () => {
    startedFlag++;
    hud.setName(state.profile.name);
    hud.snapLevel(); hud.refreshEquip();
    try { const p = eng() && eng().player; if (p && p.setNameTag && state.profile.name) p.setNameTag(state.profile.name); } catch (e) { warn(e); }
    if (title.visible && title.red) { leaveRed(); return; }
    if (!busy) {
      if (title.visible) { title.hide(); screens.setFadeInstant(0); }
      setScreen("game");
    }
  });
  on("run:reset", () => {
    hud.setObjective(null, null); hud.bossBar.hide(); hud.lives(0); hud.subtitle(""); promptLabel = null;
    hud.snapLevel(); hud.refreshEquip(); chrome();
  });
  on("secret:found", (p) => {
    const c = counts();
    const count = p.count !== undefined ? p.count : c.count, total = p.total || c.total;
    hud.toast("SECRET FOUND: " + (p.name || p.id) + " (" + count + "/" + total + ")", { kind: "secret", dur: 4.5 });
    lb.render();
    lb.submit().catch(warn);
  });
  on("level:gain", (p) => {
    const amt = Math.round(p.amount || 0);
    hud.levelGain(amt);
    pendingGain += amt; pendingAt = performance.now();
    const total = p.total !== undefined ? p.total : null;
    if (total !== null && amt > 0) {
      const prev = total - amt;
      let best = 0;
      for (let k = 2; k <= 15; k++) { const t = Math.pow(10, k); if (prev < t && total >= t) best = t; }
      if (best) hud.toast("LEVEL " + commas(best) + "!", { kind: "good", dur: 3 });
    }
  });
  on("level:set", () => hud.snapLevel());
  on("enemy:killed", (p) => {
    const lv = Math.round(p.levels || 0);
    if (lv > 0 && p.pos) { hud.damageNumber(p.pos, "+" + fmtPopup(lv) + " LV", "levels"); pendingGain = Math.max(0, pendingGain - lv); }
  });
  on("enemy:hit", (p) => {
    if (!(p.dmg > 0)) return;
    let pos = null;
    try {
      const list = ctx.combat && ctx.combat.enemies;
      if (list) for (let i = 0; i < list.length; i++) if (list[i].id === p.id) { pos = list[i].pos; break; }
    } catch (e) { /* */ }
    if (!pos) {
      const pp = playerPos();
      const pl = eng() && eng().player;
      const yaw = pl && typeof pl.yaw === "number" ? pl.yaw : 0;
      PLAYER_POS.x = pp.x + Math.sin(yaw) * 2.2; PLAYER_POS.z = pp.z + Math.cos(yaw) * 2.2; PLAYER_POS.y = pp.y + 0.6;
      pos = PLAYER_POS;
    }
    hud.damageNumber(pos, commas(Math.round(p.dmg)) + (p.crit ? "!" : ""), p.crit ? "crit" : "hit");
  });
  on("player:hurt", (p) => {
    const amt = Math.round(p.amount || 0);
    hud.hurt(amt, p.maxHp || state.player.maxHp || 100);
    if (amt > 0) hud.damageNumber(playerPos(), "-" + commas(amt), "hurt");
  });
  on("item:get", (p) => {
    if (!p.id) return;
    const nm = hud.itemName(p.id);
    lastItem = { id: p.id, h: hud.toast((p.first === false ? "Got " : "New: ") + nm, { kind: "good", dur: 3.5 }), name: nm };
    lastItemAt = performance.now();
    A((a) => a.stinger && p.first !== false && a.stinger("itemGet"));
    hud.refreshEquip();
    menus.refresh();
  });
  on("item:equip", (p) => {
    hud.refreshEquip();
    if (!p.id) return;
    const nm = hud.itemName(p.id);
    if (lastItem && lastItem.id === p.id && performance.now() - lastItemAt < 800 && lastItem.h) lastItem.h.set("New: " + nm + " (equipped)");
    else if (!menus.isOpen) hud.toast("Equipped " + nm, { kind: "info", dur: 2.5 });
    menus.refresh();
  });
  on("unlock", (p) => {
    const id = p.id;
    if (id === "area2") hud.banner("AREA 2 UNLOCKED", "The village gate is open", 3.5);
    else if (id === "area3") hud.banner("AREA 3 UNLOCKED", "The castle road is open", 3.5);
    else if (id === "kingPortal") hud.banner("THE KING AWAITS", "His portal will let you through", 3.5);
    else {
      const nm = hud.itemName(id);
      hud.toast(nm + " can be claimed at the Village Exchange", { kind: "good", dur: 4.5 });
    }
    A((a) => a.stinger && a.stinger("unlock"));
    menus.refresh();
  });
  on("interact:focus", (p) => {
    promptLabel = p.id ? (p.label || "Interact") : null;
    chrome();
    try { const t = eng() && eng().touch; if (t && t.setInteract) t.setInteract(promptLabel); } catch (e) { warn(e); }
  });
  on("boss:start", (p) => hud.bossBar.start(p));
  on("boss:hp", (p) => hud.bossBar.hp(p));
  on("boss:end", (p) => hud.bossBar.end(p));
  on("audio:lyric", (p) => { const t = p.text || ""; hud.subtitle(t, t ? 8 : 0); });
  on("objective:set", (p) => hud.setObjective(p.text === undefined ? null : p.text, p.target || null));
  on("seq:start", () => chrome());
  on("seq:end", () => chrome());
  on("input:menu", () => {
    if (menus.isOpen) { menus.close(); return; }
    if (state.ui.screen === "game" || state.ui.screen === "dialogue") openMenu("pause");
  });
  on("input:inventory", () => {
    if (menus.isOpen) { if (menus.tab === "inventory") menus.close(); else menus.show("inventory"); return; }
    if (state.ui.screen === "game") openMenu("inventory");
  });
  on("game:ready", () => { if (title.visible && !title.red) title.syncButtons(); lb.render(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden" && state.ui.screen === "game" && state.rt.playing && !state.rt.cinematic && !menus.isOpen) openMenu("pause");
  });

  // ------------------------------------------------------------------ per-frame system
  let lastNow = performance.now();
  function system(dt) {
    const now = performance.now();
    const realDt = Math.min(0.25, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    const cine = !!state.rt.cinematic;
    if (cine !== lastCine) { lastCine = cine; chrome(); }
    const inp = eng() && eng().input;
    if (inp && inp.mode) {
      const t = inp.mode === "touch";
      if (t !== document.body.classList.contains("tn-touch")) document.body.classList.toggle("tn-touch", t);
    }
    if (pendingGain > 0 && now - pendingAt > 80) {
      hud.damageNumber(playerPos(), "+" + fmtPopup(pendingGain) + " LV", "levels");
      pendingGain = 0;
    }
    hud.update(dt, realDt);
  }
  function hookSystem() {
    const e = eng();
    if (e && e.addSystem) { e.addSystem("ui", (dt) => { try { system(dt); } catch (err) { warn(err); } }, 80); return true; }
    return false;
  }
  if (!hookSystem()) {
    // no engine (dev harness / broken engine): drive the HUD with our own rAF
    const tick = () => { try { system(0.016); } catch (err) { warn(err); } requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // ------------------------------------------------------------------ public api
  const api = {
    showTitle: () => showTitle(),
    showRedTitle,
    fade: (to, dur, color) => screens.fade(to, dur, color),
    letterbox: (on, dur) => screens.letterbox(on, dur),
    hud(v) { hudWanted = v !== false; chrome(); },
    toast: (text, opts) => { hud.toast(text, opts); },
    banner: (t, s, d) => hud.banner(t, s, d),
    setObjective: (text, target) => hud.setObjective(text, target),
    prompt(label) {
      promptLabel = label || null; chrome();
      try { const t = eng() && eng().touch; if (t && t.setInteract) t.setInteract(promptLabel); } catch (e) { warn(e); }
    },
    dialogue: (opts) => dlg.open(opts),
    subtitle: (text, dur) => hud.subtitle(text, dur === undefined ? 3 : dur),
    confirm: (text, labels) => dlg.confirm(text, labels),
    openMenu, closeMenu,
    bossBar: hud.bossBar,
    lives: (n) => hud.lives(n | 0),
    damageNumber: (pos, text, kind) => hud.damageNumber(pos, text, kind || "hit"),
    jumpscare(kind, opts) {
      touch(false);
      return jump.play(kind, opts).then(() => chrome());
    },
    deathScreen(opts) {
      dlg.closeAll();
      if (menus.isOpen) menus.close();
      touch(false);
      return screens.deathScreen(opts).then(() => chrome());
    },
    async ending(id, opts) {
      dlg.closeAll();
      if (menus.isOpen) menus.close();
      hud.bossBar.hide();
      hud.subtitle("");
      screens.letterbox(false, 0.6);
      exitLock();
      setScreen("ending");
      const b = await screens.ending(id, opts);
      if (b !== "title") setScreen("game");
      return b;
    },
    fakeScreen: (kind, dur) => screens.fakeScreen(kind, dur),
    glitch: (dur, strength) => screens.glitch(dur, strength),
    leaderboard: { refresh: () => lb.refresh(), submit: () => lb.submit(), open: (v) => lb.setOpen(v !== false) },
    get screen() { return state.ui.screen; },
    get dialogueOpen() { return dlg.active; },
    get menuOpen() { return menus.isOpen; }
  };

  // debug hook (CONTRACT 13): skip title + name entry
  try {
    const dbg = window.__tnrpg || (window.__tnrpg = {});
    dbg.play = async (name) => {
      try {
        const r = validateName(name === undefined ? "Tester" : name);
        const nm = r.ok ? r.name : "Tester";
        state.profile.name = nm;
        state.profile.onlineName = onlineNameFor(nm);
        let has = false; try { has = !!(ctx.save && ctx.save.has && ctx.save.has()); } catch (e) { /* */ }
        await play(!has, { instant: true });
        const t0 = performance.now();
        while (!state.rt.playing && performance.now() - t0 < 6000) await wait(50);
        return !!state.rt.playing;
      } catch (e) { warn(e); return false; }
    };
    dbg.ui = api;
  } catch (e) { warn(e); }

  // the title screen shows now
  setScreen("title");
  title.show({});
  touch(false);
  if (state.profile.name) { hud.setName(state.profile.name); lb.claim().then(() => lb.submit()).catch(warn); }
  return api;
}
