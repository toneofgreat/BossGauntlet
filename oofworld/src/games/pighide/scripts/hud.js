// src/games/pighide/scripts/hud.js - PIG HIDE's one game-owned DOM layer (spec 27 §10.1,
// task M16-T06). Frozen interface (§2.6):
//
//   createHud(ctx, S, actions) -> { update(dt, view), banner(text, sub?, seconds?), dispose() }
//   actions = { start(), attack(), use(abilityId), toggleSpectate(), togglePractice(), openKiosk(kioskId) }
//   view    = { buttons: AbilityButton[], nearKiosk: Kiosk|null }
//
// Two small additions ride along without changing any frozen member: `shake(intensity?,
// seconds?)` (a guarded camera.shake for game.js's onThump hook, defaulting to
// TUNE.THUMP_SHAKE / TUNE.THUMP_S) and `hitFlash()` (the red edge flash of §4.7; hud also
// raises it on its own whenever it sees S.hp fall during a round, so nobody has to call it).
//
// WHAT THIS FILE READS AND WRITES OF S. It reads everything it draws. It WRITES exactly two
// things, both named for it in §2.0: `S.practice` (the lobby PRACTICE toggle; it flips the
// value and then calls actions.togglePractice(newSide) so game.js can save it and pigs.js
// can clear its practice latches), and `S.toastQ` (it drains the queue into ui.toast).
// `S.blind` is round.js's; this file only turns it into the white overlay's opacity.
//
// WHY DOM. input.setActionButtons is not on ctx, so every control past the joystick, jump,
// E and Q is a button this Place builds; and a place.json part cannot carry changing text,
// so the clock, the pigs-left count and the HP live here or nowhere.
//
// TOUCH FIRST, AND NEVER EAT THE CAMERA. The root is position:fixed;inset:0;
// pointer-events:none at the platform's `game` z layer (50: above the canvas and the chat
// at 40, under the platform HUD at 100, panels at 200 and toasts at 400). Only real
// controls take pointer-events:auto, each at least TUNE.TOUCH_MIN_PX across, and each one
// answers `pointerdown` + preventDefault, which covers mouse, pen and touch with one
// listener. The ability column sits on the side the joystick is not and above the bottom
// TUNE.BOTTOM_CLEAR_PX band the jump button owns; the whole layout mirrors when the body
// carries `oof-left-handed`, the same signal input.js mirrors its stick on.
//
// NO CLOCK BUT dt. Banner fades, the damage flash and the throttle are dt accumulators
// (rule 04:V6: no browser timers in src/games).
//
// DOM WRITES ARE THROTTLED to TUNE.HUD_REFRESH_S and every write is compared against the
// last value written. A change to WHICH controls are on screen (phase, role, caught, the
// button set, the kiosk prompt) flushes on the tick it happens, because a late number
// reads late while a late control lies. The blind overlay and the damage flash are
// per-tick (they are fades), still written only on change.
//
// HONEST LISTS (ARCHITECTURE §9, spec 27 §13). The lobby list shows self plus FRESH peers
// only, read from their own published `pw`/`hw`. The clone is never in it, and no row is
// ever invented to fill the card.

import { TUNE, ABILITIES, PIG_CLASSES, HUNTER_CLASSES, PIG_ITEM, pigClass, hunterClass } from "./config.js";

// =====================================================================================
// Layout and presentation constants (layout only; every gameplay number is TUNE's).
// =====================================================================================

const num = (v, d) => (Number.isFinite(v) ? v : d);
const T = (key, d) => num(TUNE && TUNE[key], d);

const UI_Z = 50;               // tokens.js z.game
const BLIND_Z = 49;            // under our own controls, over the canvas and the chat
const TOP_PX = 100;            // under the platform bar AND its stat-chip row (chips reach mid-screen on phones)
const LOBBY_TOP_PX = 104;      // under the platform's stat-chip row
const SIDE_PX = 12;
const ABILITY_D = 66;          // ability buttons: thumb-sized, over TOUCH_MIN_PX
const ATTACK_D = 84;           // the primary is pressed hundreds of times a round
const COMPACT_D = 58;          // short screens (landscape phones): still over TOUCH_MIN_PX
const COMPACT_ATTACK_D = 70;
const COMPACT_H = 520;         // below this viewport height the HUD packs tighter (landscape phones)
const COMPACT_BTN_H = 700;     // below this the ability buttons use the compact sizes
const NARROW_W = 480;          // below this viewport width the role badge uses its short form
const STATS_GAP_PX = 8;        // space kept under the platform's stat-chip row
const BANNER_S = 2.6;
const BANNER_FADE_S = 0.5;
const FLASH_S = 0.45;
const MAX_LIST = 8;
const LEFT_HAND_CLASS = "oof-left-handed";

const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const INK = "#f6f2f4";
const INK_DIM = "#c2b4bb";
const PINK = "#ff8fb1";
const RED = "#ff4a3a";
const GOLD = "#f5c542";
const PANEL = "background:rgba(22,14,20,0.76);border:1px solid rgba(255,255,255,0.16);"
  + "border-radius:14px;box-shadow:0 2px 12px rgba(0,0,0,0.45);color:" + INK + ";"
  + "text-shadow:0 1px 2px rgba(0,0,0,0.6);box-sizing:border-box;font-family:" + FONT + ";";
const TAP = "pointer-events:auto;touch-action:none;user-select:none;-webkit-user-select:none;"
  + "-webkit-tap-highlight-color:transparent;cursor:pointer;";

const PHASE_LABEL = Object.freeze({ lobby: "LOBBY", hide: "HIDE!", seek: "SEEK", result: "RESULTS" });

// The aria-labels §10.1 fixes for the controls whose AbilityButton might not carry one.
const ARIA_FALLBACK = Object.freeze({
  attack: "Attack", dash: "Speed Boost", creep: "Creep", plane: "Call Plane", ball: "Ball Roll",
  thump: "Thump", clone: "Make Clone", swap: "Swap With Clone", radar: "Pig Radar",
  detect: "Pig Detector", flashlight: "Flashlight",
});

// =====================================================================================
// Pure helpers.
// =====================================================================================

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

function fmtClock(seconds) {
  const n = Math.max(0, Math.ceil(num(seconds, 0)));
  return Math.floor(n / 60) + ":" + String(n % 60).padStart(2, "0");
}

function fmtInt(n) {
  const v = Math.max(0, Math.floor(num(n, 0)));
  return v.toLocaleString("en-US");
}

function safeName(v, fallback) {
  const s = typeof v === "string" ? v.trim() : "";
  return (s || fallback).slice(0, 24);
}

function setFlex(node, v) { node.style.flex = v; }

function isCompact() {
  const h = typeof window !== "undefined" ? Number(window.innerHeight) : 0;
  return h > 0 && h < COMPACT_H;
}

function isCompactButtons() {
  const h = typeof window !== "undefined" ? Number(window.innerHeight) : 0;
  return h > 0 && h < COMPACT_BTN_H;
}

function isNarrow() {
  const w = typeof window !== "undefined" ? Number(window.innerWidth) : 0;
  return w > 0 && w < NARROW_W;
}

// The top edge our own top-of-screen UI may use: under the platform's stat-chip row, which
// wraps onto several lines on a phone, and never above `floor`.
function topEdge(floor) {
  try {
    const row = document.getElementById("oof-hud-stats");
    if (!row) return floor;
    const r = row.getBoundingClientRect();
    if (!r || !(r.height > 0)) return floor;
    return Math.max(floor, Math.ceil(r.bottom + STATS_GAP_PX));
  } catch {
    return floor;
  }
}

function isAttackButton(b) {
  return !!b && (b.id === "attack" || b.key === "Click" || b.key === "F");
}

function keyBadge(b) {
  if (!b || !b.key) return "";
  return b.key === "Click" ? "F" : String(b.key);
}

function isTypingTarget(t) {
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!t.isContentEditable;
}

function ladderLine(classes, tier, wins, kind) {
  const list = Array.isArray(classes) ? classes : [];
  const next = list[Math.max(0, Math.floor(num(tier, 0))) + 1] || null;
  if (!next) return { text: "Top " + kind + " unlocked!", ready: false, frac: 1 };
  const need = Math.max(1, num(next.need, 1));
  const have = Math.max(0, Math.floor(num(wins, 0)));
  if (have >= need) {
    return { text: "⬆ " + next.name + " ready! Visit the " + (kind === "pig" ? "Pig Upgrade Lab" : "Hunter Range"), ready: true, frac: 1 };
  }
  return { text: "Next: " + next.name + " at " + fmtInt(need) + " " + kind + " wins (" + fmtInt(have) + "/" + fmtInt(need) + ")", ready: false, frac: Math.min(1, have / need) };
}

// =====================================================================================
// createHud
// =====================================================================================

export function createHud(ctx, S, actions) {
  const ui = ctx.services.ui;
  const act = actions || {};
  const call = (name, ...args) => {
    const fn = act[name];
    if (typeof fn !== "function") return undefined;
    try { return fn(...args); } catch (err) { return undefined; }
  };
  const sfx = (name) => {
    const audio = ctx.engine && ctx.engine.audio;
    if (audio && typeof audio.playSfx === "function") {
      try { audio.playSfx(name, { volume: 0.6 }); } catch (err) { /* audio is best effort */ }
    }
  };

  // ---------------- write-on-change helpers ----------------
  const lastText = new WeakMap();
  const lastProps = new WeakMap();
  function setText(node, value) {
    const v = String(value);
    if (lastText.get(node) === v) return;
    lastText.set(node, v);
    node.textContent = v;
  }
  function setProp(node, prop, value) {
    let m = lastProps.get(node);
    if (!m) { m = new Map(); lastProps.set(node, m); }
    const v = String(value);
    if (m.get(prop) === v) return;
    m.set(prop, v);
    node.style.setProperty(prop, v);
  }
  function show(node, on) { setProp(node, "display", on ? (node.dataset.disp || "block") : "none"); }
  function setAttr(node, name, value) {
    if (value === null || value === false) {
      if (node.hasAttribute(name)) node.removeAttribute(name);
      return;
    }
    const v = value === true ? "" : String(value);
    if (node.getAttribute(name) !== v) node.setAttribute(name, v);
  }

  function makeButton(style, text, aria, onPress) {
    const b = el("button", style, text);
    b.type = "button";
    if (aria) b.setAttribute("aria-label", aria);
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (b.disabled) return;
      onPress(e);
    });
    // No click listener and no tab stop: Space is jump, and a focused button that also
    // answered click would fire again on every jump.
    b.tabIndex = -1;
    return b;
  }

  // ---------------- the DOM ----------------
  const root = el("div", "position:fixed;inset:0;pointer-events:none;z-index:" + UI_Z + ";font-family:" + FONT + ";");
  root.id = "pighide-ui";

  // Hunter's cage overlay (hide phase). Bottom of the stack inside the root.
  const cage = el("div", "position:absolute;inset:0;background:rgba(10,10,20,0.92);display:none;"
    + "flex-direction:column;align-items:center;justify-content:center;gap:14px;color:" + INK + ";"
    + "text-align:center;pointer-events:none;");
  cage.dataset.disp = "flex";
  const cageEyes = el("div", "display:flex;gap:28px;");
  for (let i = 0; i < 2; i++) {
    cageEyes.appendChild(el("div", "width:64px;height:32px;border-bottom:7px solid " + INK + ";"
      + "border-radius:0 0 64px 64px;box-sizing:border-box;"));
  }
  const cageTitle = el("div", "font:900 34px " + FONT + ";letter-spacing:1px;", "Pigs are hiding…");
  const cageClock = el("div", "font:900 72px " + FONT + ";color:" + RED + ";", "30");
  const cageSub = el("div", "font:600 16px " + FONT + ";color:" + INK_DIM + ";", "No peeking! The cage opens when the clock hits zero.");
  cage.append(cageEyes, cageTitle, cageClock, cageSub);

  // Red damage edge.
  const flash = el("div", "position:absolute;inset:0;pointer-events:none;opacity:0;"
    + "box-shadow:inset 0 0 90px 30px rgba(255,30,30,0.85);");

  // Top centre: phase, clock, pigs left, role badge.
  const top = el("div", "position:absolute;left:50%;transform:translateX(-50%);top:calc(" + TOP_PX
    + "px + env(safe-area-inset-top,0px));display:none;flex-direction:column;align-items:center;gap:6px;pointer-events:none;");
  top.dataset.disp = "flex";
  const clockRow = el("div", PANEL + "display:flex;align-items:center;gap:10px;padding:6px 14px;white-space:nowrap;");
  const phaseEl = el("div", "font:900 15px " + FONT + ";letter-spacing:1px;color:" + PINK + ";", "");
  const clockEl = el("div", "font:900 26px " + FONT + ";font-variant-numeric:tabular-nums;min-width:62px;text-align:center;", "0:00");
  const pigsEl = el("div", "font:800 15px " + FONT + ";white-space:nowrap;", "");
  clockRow.append(phaseEl, clockEl, pigsEl);
  const roleEl = el("div", "font:900 14px " + FONT + ";letter-spacing:1px;padding:5px 14px;border-radius:999px;"
    + "box-shadow:0 2px 8px rgba(0,0,0,0.4);text-shadow:0 1px 2px rgba(0,0,0,0.5);color:#fff;"
    + "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:92vw;box-sizing:border-box;", "");

  // Lobby card (top left).
  const lobby = el("div", PANEL + "position:absolute;top:calc(" + LOBBY_TOP_PX + "px + env(safe-area-inset-top,0px));"
    + "width:min(320px,46vw);max-height:62vh;overflow:hidden;padding:10px 12px;display:none;"
    + "flex-direction:column;gap:8px;pointer-events:none;");
  lobby.dataset.disp = "flex";
  const lobbyTitle = el("div", "font:900 16px " + FONT + ";color:" + PINK + ";", "🐷 PIG HIDE LOBBY");
  const hintEl = el("div", "font:600 13px " + FONT + ";color:" + INK_DIM + ";", "");
  // How to play, for a first-time visitor (full card only).
  const howTo = el("div", "font:600 12px " + FONT + ";line-height:1.35;color:" + INK + ";", "");
  howTo.dataset.disp = "block";
  howTo.append(
    el("div", "font-weight:900;color:" + GOLD + ";", "HOW TO PLAY"),
    el("div", "", "1 hunter vs every other player as pigs. Rounds last 5:00."),
    el("div", "", "🐷 Pigs: hide, and survive to the end for a Pig Win."),
    el("div", "", "🎯 Hunter: catch every pig for a Hunter Win."),
    el("div", "", "Wins unlock new pigs and hunters. Try their abilities here first."));
  const shopHint = el("div", "font:800 12px " + FONT + ";color:#b98aff;", "🛒 Shops & Upgrade Labs: turn around, along the side walls ↓");
  shopHint.dataset.disp = "block";
  const btnBase = PANEL + TAP + "min-height:" + T("TOUCH_MIN_PX", 56) + "px;padding:0 14px;"
    + "font:900 16px " + FONT + ";display:flex;align-items:center;justify-content:center;gap:8px;";
  const startBtn = makeButton(btnBase + "background:linear-gradient(#ff8fb1,#e05a86);border-color:#ffd1e0;",
    "▶ START", "Start round", () => {
      if (!S || !S.canStart) return;
      sfx("click");
      call("start");
    });
  const practiceBtn = makeButton(btnBase + "font-size:13px;padding:0 8px;line-height:1.15;text-align:center;", "", "Practice side", () => togglePractice());
  const ladderBox = el("div", "display:flex;flex-direction:column;gap:5px;font:600 12px " + FONT + ";");
  const pigLadder = el("div", "", "");
  const pigBar = el("div", "height:5px;border-radius:3px;background:rgba(255,255,255,0.14);overflow:hidden;");
  const pigFill = el("div", "height:100%;width:0%;background:" + PINK + ";");
  pigBar.appendChild(pigFill);
  const hunterLadder = el("div", "", "");
  const hunterBar = el("div", "height:5px;border-radius:3px;background:rgba(255,255,255,0.14);overflow:hidden;");
  const hunterFill = el("div", "height:100%;width:0%;background:" + RED + ";");
  hunterBar.appendChild(hunterFill);
  const radarLine = el("div", "color:" + GOLD + ";", "");
  ladderBox.append(pigLadder, pigBar, hunterLadder, hunterBar, radarLine);
  const listHead = el("div", "font:800 12px " + FONT + ";color:" + INK_DIM + ";letter-spacing:1px;", "PLAYERS HERE");
  listHead.dataset.disp = "block";
  const listEl = el("div", "display:flex;flex-direction:column;gap:3px;font:600 13px " + FONT + ";");
  const lobbyBtns = el("div", "display:flex;gap:8px;");
  setFlex(startBtn, "1.5 1 0");
  setFlex(practiceBtn, "1 1 0");
  lobbyBtns.append(startBtn, practiceBtn);
  listEl.dataset.disp = "flex";
  ladderBox.dataset.disp = "flex";
  lobbyTitle.dataset.disp = "block";
  lobby.append(lobbyTitle, hintEl, lobbyBtns, shopHint, howTo, ladderBox, listHead, listEl);

  // Info line for sat-out / caught players, and the WATCH toggle: part of the top cluster's
  // flex column, so they can never land on top of the clock or the role badge.
  const info = el("div", PANEL + "padding:8px 14px;font:700 14px " + FONT + ";display:none;text-align:center;pointer-events:none;max-width:80vw;");
  const watchBtn = makeButton(btnBase + "display:none;", "👁 WATCH (V)", "Watch", () => {
    sfx("click");
    call("toggleSpectate");
  });
  watchBtn.dataset.disp = "flex";
  top.append(clockRow, roleEl, info, watchBtn);

  // Kiosk prompt (bottom centre, above the jump band).
  const kioskBtn = makeButton(btnBase + "position:absolute;left:50%;transform:translateX(-50%);"
    + "bottom:calc(" + (T("BOTTOM_CLEAR_PX", 176) + 14) + "px + env(safe-area-inset-bottom,0px));display:none;"
    + "background:linear-gradient(#5a3ab0,#3a2280);border-color:#b98aff;", "", "Open shop", () => {
      if (!lastKiosk) return;
      sfx("click");
      call("openKiosk", lastKiosk.id);
    });
  kioskBtn.dataset.disp = "flex";

  // Ability column.
  const column = el("div", "position:absolute;bottom:calc(" + (T("BOTTOM_CLEAR_PX", 176) + 10)
    + "px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column-reverse;flex-wrap:wrap-reverse;align-items:center;align-content:flex-end;gap:10px;pointer-events:none;"
    + "max-height:calc(100vh - " + (T("BOTTOM_CLEAR_PX", 176) + 10 + TOP_PX + 84) + "px);");
  column.dataset.disp = "flex";

  // Banner.
  const bannerEl = el("div", "position:absolute;left:50%;top:30%;transform:translate(-50%,-50%);text-align:center;"
    + "pointer-events:none;opacity:0;transition:none;max-width:92vw;");
  const bannerMain = el("div", "font:900 clamp(30px,7vw,60px) " + FONT + ";color:#fff;letter-spacing:2px;"
    + "text-shadow:0 3px 0 #b03060,0 6px 18px rgba(0,0,0,0.6);", "");
  const bannerSub = el("div", "font:800 clamp(14px,3.2vw,22px) " + FONT + ";color:" + INK + ";margin-top:6px;"
    + "text-shadow:0 2px 6px rgba(0,0,0,0.7);", "");
  bannerEl.append(bannerMain, bannerSub);

  // Results card.
  const results = el("div", PANEL + "position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);"
    + "min-width:min(360px,86vw);max-width:92vw;padding:18px 22px;display:none;flex-direction:column;"
    + "align-items:center;gap:8px;text-align:center;pointer-events:none;border-width:2px;");
  results.dataset.disp = "flex";
  const resTitle = el("div", "font:900 clamp(26px,6vw,40px) " + FONT + ";letter-spacing:1px;", "");
  const resYou = el("div", "font:800 18px " + FONT + ";", "");
  const resTotals = el("div", "font:700 15px " + FONT + ";color:" + INK_DIM + ";", "");
  const resNext = el("div", "font:800 14px " + FONT + ";color:" + GOLD + ";", "");
  const resClock = el("div", "font:600 13px " + FONT + ";color:" + INK_DIM + ";", "");
  results.append(resTitle, resYou, resTotals, resNext, resClock);

  root.append(cage, flash, top, lobby, kioskBtn, column, results, bannerEl);
  document.body.appendChild(root);

  // The white flashlight blind is its own element (§15.4 names #pighide-blind).
  const blindEl = el("div", "position:fixed;inset:0;background:#ffffff;opacity:0;pointer-events:none;"
    + "display:none;z-index:" + BLIND_Z + ";");
  blindEl.id = "pighide-blind";
  document.body.appendChild(blindEl);

  // ---------------- state ----------------
  let disposed = false;
  let refreshLeft = 0;
  let lastShape = "";
  let lastKiosk = null;
  let compact = isCompact();
  let compactBtns = isCompactButtons();
  let buttons = [];
  const btnNodes = new Map();      // id -> { wrap, btn, icon, ring, cdText, key, name }
  let bannerLeft = 0;
  let bannerTotal = 0;
  let flashLeft = 0;
  let prevPhase = S ? S.phase : "lobby";
  let prevHp = S ? num(S.hp, 100) : 100;
  let prevRn = S ? S.rn : 0;
  const chipVals = new Map();

  // ---------------- actions ----------------
  function togglePractice() {
    if (!S || S.phase !== "lobby") return;
    S.practice = S.practice === "hunter" ? "pig" : "hunter";
    sfx("click");
    call("togglePractice", S.practice);
    lastShape = "";
  }

  function pressAbility(b) {
    if (!b) return;
    if (isAttackButton(b)) call("attack");
    else call("use", b.id);
  }

  // ---------------- input listeners (document level, removed in dispose) ----------------
  function onKeyDown(e) {
    if (disposed || !S || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTypingTarget(e.target) || isTypingTarget(document.activeElement)) return;
    const code = e.code || "";
    if (code === "KeyF" || code === "KeyT" || code === "KeyR") {
      const letter = code.slice(3);
      const b = buttons.find((x) => (letter === "F" ? isAttackButton(x) : x.key === letter));
      if (b) { e.preventDefault(); pressAbility(b); }
      return;
    }
    if (code === "KeyV") {
      if (S.caught && (S.phase === "hide" || S.phase === "seek")) { e.preventDefault(); call("toggleSpectate"); }
      return;
    }
    if (code === "KeyP") {
      if (S.phase === "lobby") { e.preventDefault(); togglePractice(); }
      return;
    }
    if (code === "Enter" || code === "NumpadEnter") {
      // The platform binds Enter to "focus chat" whenever the chat box exists (online).
      // The chat owns Enter then; the START button and its pointerdown still work.
      if (document.querySelector(".oof-chat-input")) return;
      if (S.phase === "lobby" && S.canStart) { e.preventDefault(); call("start"); }
    }
  }

  // Left mouse click on the game canvas is the hunter's primary (§8.1). Touch and pen are
  // NOT: a touch on the canvas is a camera drag.
  function onCanvasDown(e) {
    if (disposed || !S) return;
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const t = e.target;
    if (!t || t.tagName !== "CANVAS") return;
    const b = buttons.find(isAttackButton);
    if (b) call("attack");
  }

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("pointerdown", onCanvasDown);

  // ---------------- ability buttons ----------------
  function buildButton(b) {
    const attack = isAttackButton(b);
    const d = compactBtns ? (attack ? COMPACT_ATTACK_D : COMPACT_D) : (attack ? ATTACK_D : ABILITY_D);
    const wrap = el("div", "position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;");
    const aria = (b && b.label) || ARIA_FALLBACK[b.id] || (ABILITIES && ABILITIES[b.id] && ABILITIES[b.id].label) || b.id;
    const btn = makeButton(PANEL + TAP + "position:relative;width:" + d + "px;height:" + d + "px;border-radius:50%;"
      + "padding:0;overflow:hidden;display:flex;align-items:center;justify-content:center;"
      + "font:400 " + Math.round(d * 0.46) + "px " + FONT + ";border-width:3px;"
      + (attack ? "background:radial-gradient(circle at 40% 35%,#ff6a5a,#b0201a);" : ""), "", aria, () => {
        const cur = buttons.find((x) => x.id === b.id);
        pressAbility(cur || b);
      });
    const icon = el("span", "position:relative;z-index:1;pointer-events:none;", b.icon || "⭐");
    const ring = el("div", "position:absolute;inset:0;border-radius:50%;pointer-events:none;z-index:2;");
    const cdText = el("div", "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;"
      + "font:900 " + Math.round(d * 0.34) + "px " + FONT + ";color:#fff;z-index:3;pointer-events:none;"
      + "text-shadow:0 1px 3px #000;", "");
    btn.append(icon, ring, cdText);
    const key = el("div", "position:absolute;top:-4px;right:-4px;min-width:22px;height:22px;border-radius:11px;"
      + "background:#111;border:2px solid " + PINK + ";color:#fff;font:900 12px " + FONT + ";display:flex;"
      + "align-items:center;justify-content:center;padding:0 4px;box-sizing:border-box;z-index:4;pointer-events:none;", keyBadge(b));
    const name = el("div", "font:800 11px " + FONT + ";color:#fff;text-shadow:0 1px 2px #000,0 0 4px #000;"
      + "white-space:nowrap;pointer-events:none;", "");
    wrap.append(btn, key, name);
    return { wrap, btn, icon, ring, cdText, key, name, d };
  }

  function syncButtonSet(list) {
    const ids = list.map((b) => b.id);
    for (const [id, n] of btnNodes) {
      if (!ids.includes(id)) { n.wrap.remove(); btnNodes.delete(id); }
    }
    // Attack is placed first (lowest, nearest the thumb) because the column is reversed.
    const ordered = list.slice().sort((a, b) => (isAttackButton(b) ? 1 : 0) - (isAttackButton(a) ? 1 : 0));
    for (const b of ordered) {
      let n = btnNodes.get(b.id);
      if (!n) { n = buildButton(b); btnNodes.set(b.id, n); }
      column.appendChild(n.wrap);   // appendChild moves: this also fixes the order
    }
  }

  function activeSecondsFor(id) {
    if (!S) return 0;
    const pa = S.pig && S.pig.act ? num(S.pig.act[id], 0) : 0;
    const ha = id === "detect" && S.hunter ? num(S.hunter.detectOn, 0) : 0;
    const ra = id === "radar" && S.pig ? num(S.pig.radarOn, 0) : 0;
    return Math.max(pa, ha, ra);
  }

  function reasonFor(b) {
    if (num(b.cdLeft, 0) > 0) return "Recharging";
    const ab = ABILITIES && ABILITIES[b.id];
    if (ab && ab.perRound && S && S.pig && S.pig.used && S.pig.used[b.id]) return "Once per round: used";
    if (b.id === "swap" && S && S.pig && S.pig.cn && S.pig.cn.a === 0) return "Clone caught";
    if (b.id === "swap" && S && S.pig && !S.pig.cn) return "Make a clone first";
    if (S && S.phase === "hide" && S.role === "hunter") return "The cage is closed";
    return "Not available right now";
  }

  function paintButtons() {
    for (const b of buttons) {
      const n = btnNodes.get(b.id);
      if (!n) continue;
      const aria = b.label || ARIA_FALLBACK[b.id] || b.id;
      setAttr(n.btn, "aria-label", aria);
      setText(n.name, typeof b.text === "string" && b.text ? b.text : aria);
      setText(n.icon, b.icon || "⭐");
      setText(n.key, keyBadge(b));
      const enabled = b.enabled !== false;
      n.btn.disabled = !enabled;
      setAttr(n.btn, "title", enabled ? aria + (b.key ? " (" + keyBadge(b) + ")" : "") : aria + ": " + reasonFor(b));
      const cdLeft = Math.max(0, num(b.cdLeft, 0));
      const cdTotal = Math.max(0.001, num(b.cdTotal, 0) || 0.001);
      const activeS = b.active ? activeSecondsFor(b.id) : 0;
      if (b.active) {
        setProp(n.ring, "background", "none");
        setText(n.cdText, activeS > 0 ? String(Math.ceil(activeS)) : "");
        setProp(n.btn, "border-color", "#7ff7ff");
        setProp(n.btn, "box-shadow", "0 0 18px 4px rgba(127,247,255,0.85)");
        setProp(n.btn, "filter", "none");
      } else if (cdLeft > 0) {
        const pct = Math.round(Math.min(1, cdLeft / cdTotal) * 1000) / 10;
        setProp(n.ring, "background", "conic-gradient(rgba(0,0,0,0.66) 0 " + pct + "%, rgba(0,0,0,0) " + pct + "% 100%)");
        setText(n.cdText, String(Math.ceil(cdLeft)));
        setProp(n.btn, "border-color", "rgba(255,255,255,0.16)");
        setProp(n.btn, "box-shadow", "0 2px 12px rgba(0,0,0,0.45)");
        setProp(n.btn, "filter", "none");
      } else {
        setProp(n.ring, "background", "none");
        setText(n.cdText, "");
        setProp(n.btn, "border-color", enabled ? PINK : "rgba(255,255,255,0.16)");
        setProp(n.btn, "box-shadow", enabled ? "0 0 10px rgba(255,143,177,0.55)" : "0 2px 12px rgba(0,0,0,0.45)");
        setProp(n.btn, "filter", enabled ? "none" : "grayscale(1) brightness(0.6)");
      }
      setProp(n.btn, "opacity", enabled || cdLeft > 0 || b.active ? "1" : "0.7");
    }
  }

  // ---------------- chips ----------------
  function chip(key, icon, label, value) {
    const v = String(value);
    if (chipVals.get(key) === v) return;
    chipVals.set(key, v);
    try { ui.setHudStat(key, { icon, label, value: v }); } catch (err) { /* hud is best effort */ }
  }
  function unchip(key) {
    if (!chipVals.has(key)) return;
    chipVals.delete(key);
    try { ui.removeHudStat(key); } catch (err) { /* hud is best effort */ }
  }

  // ---------------- banner ----------------
  function banner(text, sub, seconds) {
    if (disposed) return;
    setText(bannerMain, text === undefined || text === null ? "" : String(text));
    setText(bannerSub, sub === undefined || sub === null ? "" : String(sub));
    bannerTotal = Math.max(0.5, num(seconds, BANNER_S));
    bannerLeft = bannerTotal;
    setProp(bannerEl, "opacity", "1");
  }

  function hitFlash() {
    if (disposed) return;
    flashLeft = FLASH_S;
  }

  function shake(intensity, seconds) {
    const cam = ctx.engine && ctx.engine.camera;
    if (!cam || typeof cam.shake !== "function") return;
    try { cam.shake(num(intensity, T("THUMP_SHAKE", 0.7)), num(seconds, T("THUMP_S", 2))); } catch (err) { /* best effort */ }
  }

  // Phase-edge banners, so the round reads even if game.js never calls banner().
  function edgeBanners() {
    const ph = S.phase;
    if (ph === prevPhase && S.rn === prevRn) return;
    const was = prevPhase;
    prevPhase = ph;
    prevRn = S.rn;
    if (ph === "hide") {
      if (S.role === "pig") banner("YOU ARE A PIG 🐷", "Hide! The hunter is caged for " + Math.ceil(num(S.clock, 30)) + " s", 3.2);
      else if (S.role === "hunter") banner("YOU ARE THE HUNTER 🎯", "Catch every pig before 5:00 runs out", 3.2);
      else banner("ROUND STARTED", "You'll join the next one", 2.6);
    } else if (ph === "seek" && was === "hide") {
      if (S.role === "hunter") banner("GO!", "Find every pig!", 2.2);
      else if (S.role === "pig") banner("GO!", "The hunter is loose. Stay hidden!", 2.2);
    } else if (ph === "result") {
      bannerLeft = 0;
      setProp(bannerEl, "opacity", "0");
    } else if (ph === "lobby" && was === "result") {
      banner("BACK IN THE LOBBY", "Press START when everyone is ready", 2.2);
    }
  }

  // ---------------- layout side (left-handed mirror) ----------------
  function placeSides() {
    const flip = !!(document.body && document.body.classList.contains(LEFT_HAND_CLASS));
    // Ability column on the side the joystick is NOT.
    setProp(column, flip ? "right" : "left", "auto");
    setProp(column, flip ? "left" : "right", "calc(" + (SIDE_PX + 6) + "px + env(safe-area-inset-" + (flip ? "left" : "right") + ",0px))");
    setProp(column, "flex-wrap", flip ? "wrap" : "wrap-reverse");
    // Lobby card at the top on the joystick side (the stick lives at the bottom).
    setProp(lobby, flip ? "left" : "right", "auto");
    setProp(lobby, flip ? "right" : "left", SIDE_PX + "px");
    // The column may use everything above the jump band (it sits beside, not under, the
    // centred top cluster, whose role badge is kept clear of it below).
    setProp(column, "max-height", compact
      ? "calc(100vh - " + (T("BOTTOM_CLEAR_PX", 176) + 30) + "px - env(safe-area-inset-bottom,0px))"
      : "calc(100vh - " + (T("BOTTOM_CLEAR_PX", 176) + 10 + TOP_PX) + "px - env(safe-area-inset-bottom,0px))");
    // Landscape phones: the kiosk prompt goes beside the ability column, clear of the card.
    if (compact) {
      setProp(kioskBtn, "transform", "none");
      setProp(kioskBtn, flip ? "right" : "left", "auto");
      setProp(kioskBtn, flip ? "left" : "right", "calc(" + (SIDE_PX + ABILITY_D + 24) + "px + env(safe-area-inset-" + (flip ? "left" : "right") + ",0px))");
    } else {
      setProp(kioskBtn, "transform", "translateX(-50%)");
      setProp(kioskBtn, "right", "auto");
      setProp(kioskBtn, "left", "50%");
    }
  }

  // Our top-of-screen UI sits under the platform's chip row, however many lines it wraps to,
  // and the lobby card never reaches down into the joystick band.
  function placeTops() {
    const t = topEdge(TOP_PX);
    setProp(top, "top", "calc(" + t + "px + env(safe-area-inset-top,0px))");
    const lt = compact ? t : topEdge(LOBBY_TOP_PX);
    setProp(lobby, "top", "calc(" + lt + "px + env(safe-area-inset-top,0px))");
    setProp(lobby, "max-height", "calc(100vh - " + (lt + T("BOTTOM_CLEAR_PX", 176) + 16) + "px)");
  }

  // ---------------- the main paint ----------------
  function shapeOf(view) {
    return [S.phase, S.role, S.caught ? 1 : 0, S.spectating ? 1 : 0, S.practice, S.canStart ? 1 : 0,
      buttons.map((b) => b.id + ":" + (b.enabled !== false ? 1 : 0)).join(","),
      view && view.nearKiosk ? view.nearKiosk.id : "",
      document.body && document.body.classList.contains(LEFT_HAND_CLASS) ? 1 : 0, isCompact() ? 1 : 0,
      isCompactButtons() ? 1 : 0, view && view.shopOpen ? 1 : 0, view && view.inLobby === false ? 1 : 0].join("|");
  }

  function paintTop() {
    const ph = S.phase;
    // In result the results card carries the countdown, so the cluster steps aside for it.
    const inRound = ph === "hide" || ph === "seek";
    show(top, inRound);
    if (!inRound) return;
    const short = isNarrow() || compact;
    setText(phaseEl, PHASE_LABEL[ph] || "");
    setProp(phaseEl, "color", ph === "seek" ? RED : ph === "result" ? GOLD : PINK);
    setText(clockEl, fmtClock(S.clock));
    const showPigs = (ph === "hide" || ph === "seek") && num(S.pigsTotal, 0) > 0;
    setText(pigsEl, showPigs ? "🐷 " + Math.max(0, num(S.pigsLeft, 0)) + "/" + num(S.pigsTotal, 0) + " left" : "");
    show(pigsEl, showPigs);
    let roleText = "";
    let roleBg = "rgba(60,60,70,0.9)";
    if (S.role === "pig") {
      const cls = pigClass(S.pig && S.pig.classId);
      roleText = S.caught ? (short ? "CAUGHT · " : "CAUGHT! 🐷 ") + cls.name
        : (short ? "PIG · " : "YOU ARE A PIG · ") + cls.icon + " " + cls.name;
      roleBg = S.caught ? "rgba(120,120,130,0.92)" : "rgba(232,90,140,0.94)";
    } else if (S.role === "hunter") {
      const cls = hunterClass(S.hunter && S.hunter.classId);
      roleText = (short ? "HUNTER · " : "YOU ARE THE HUNTER · ") + cls.icon + " " + cls.name;
      roleBg = "rgba(200,40,40,0.94)";
    } else if (ph !== "result") {
      roleText = "WATCHING · next round soon";
    }
    setText(roleEl, roleText);
    setProp(roleEl, "background", roleBg);
    show(roleEl, !!roleText);
  }

  function paintLobby(view) {
    const on = S.phase === "lobby";
    show(lobby, on);
    if (!on) return;
    // Full card in the lobby itself; out in the city, or next to a kiosk, a small pill with
    // just the line and the two buttons (the ladders live in the Upgrade Lab too).
    const full = !compact && !(view && (view.inLobby === false || view.nearKiosk || view.shopOpen));
    show(lobbyTitle, !compact);
    show(howTo, full);
    show(shopHint, full);
    show(ladderBox, full);
    show(listHead, full);
    show(listEl, full);
    show(radarLine, full);
    setProp(lobby, "width", full ? "min(320px,46vw)" : "min(300px,62vw)");
    setText(hintEl, S.startHint || (S.canStart ? "Press START" : "Waiting for players — need 1 more"));
    startBtn.disabled = !S.canStart;
    setAttr(startBtn, "aria-disabled", S.canStart ? "false" : "true");
    setAttr(startBtn, "title", S.canStart ? "Start a 5:00 round" : (S.startHint || "Need 2 players"));
    setProp(startBtn, "opacity", S.canStart ? "1" : "0.45");
    setProp(startBtn, "filter", S.canStart ? "none" : "grayscale(0.8)");
    setText(startBtn, S.startPending ? "⏳ STARTING…" : "▶ START");
    const side = S.practice === "hunter" ? "🎯 Hunter" : "🐷 Pig";
    setText(practiceBtn, "TRY " + side + " ⇄ (P)");

    const save = S.save || {};
    const pl = ladderLine(PIG_CLASSES, save.pigTier, save.pigWins, "pig");
    const hl = ladderLine(HUNTER_CLASSES, save.hunterTier, save.hunterWins, "hunter");
    const pc = pigClass(S.pig && S.pig.classId);
    const hc = hunterClass(S.hunter && S.hunter.classId);
    setText(pigLadder, "🐷 " + pc.name + " · " + fmtInt(save.pigWins) + " wins — " + pl.text);
    setProp(pigLadder, "color", pl.ready ? GOLD : INK);
    setProp(pigFill, "width", Math.round(pl.frac * 100) + "%");
    setText(hunterLadder, "🎯 " + hc.name + " · " + fmtInt(save.hunterWins) + " wins — " + hl.text);
    setProp(hunterLadder, "color", hl.ready ? GOLD : INK);
    setProp(hunterFill, "width", Math.round(hl.frac * 100) + "%");
    const need = num(PIG_ITEM && PIG_ITEM.need, 1000);
    const radarName = (PIG_ITEM && PIG_ITEM.name) || "Pig Radar";
    let rText = "";
    if (save.radarClaimed) rText = "📡 " + radarName + (save.radarEquipped ? " equipped (T)" : " owned: equip it at the Radar Vault");
    else if (num(save.pigWins, 0) >= need) rText = "📡 " + radarName + " is ready to claim at the Radar Vault!";
    else rText = "📡 " + radarName + " at " + fmtInt(need) + " pig wins";
    setText(radarLine, rText);

    // Honest player list: self plus FRESH peers that publish v:STATE_V. Never a fake row.
    const rows = [{ name: safeName(S.selfName, "You") + " (you)", pw: save.pigWins, hw: save.hunterWins }];
    if (S.peers && typeof S.peers.forEach === "function") {
      const fresh = new Set(Array.isArray(S.fresh) ? S.fresh : []);
      S.peers.forEach((p) => {
        if (!p || !p.fresh || !fresh.has(p.id) || !p.st) return;
        rows.push({ name: safeName(p.name, "Player"), pw: p.st.pw, hw: p.st.hw });
      });
    }
    const key = rows.slice(0, MAX_LIST).map((r) => r.name + ":" + num(r.pw, 0) + ":" + num(r.hw, 0)).join("|") + "#" + rows.length;
    if (lastText.get(listEl) !== key) {
      lastText.set(listEl, key);
      while (listEl.firstChild) listEl.removeChild(listEl.firstChild);
      for (const r of rows.slice(0, MAX_LIST)) {
        const row = el("div", "display:flex;justify-content:space-between;gap:8px;");
        row.append(el("span", "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;", r.name),
          el("span", "white-space:nowrap;color:" + INK_DIM + ";", "🐷 " + fmtInt(r.pw) + "  🎯 " + fmtInt(r.hw)));
        listEl.appendChild(row);
      }
      if (rows.length > MAX_LIST) listEl.appendChild(el("div", "color:" + INK_DIM + ";", "+" + (rows.length - MAX_LIST) + " more"));
    }
  }

  function paintStatus(view) {
    const ph = S.phase;
    const inPlay = ph === "hide" || ph === "seek";
    // Hunter cage overlay.
    const caged = ph === "hide" && S.role === "hunter";
    show(cage, caged);
    if (caged) setText(cageClock, String(Math.max(0, Math.ceil(num(S.clock, 0)))));
    // Info line.
    let infoText = "";
    if (inPlay && S.role === "pig" && S.caught) {
      infoText = S.spectating ? "👁 Watching the hunter. Press WATCH to go back to the Pig Pen." : "🔒 Caught! Wait in the Pig Pen, or WATCH the hunt.";
    } else if (inPlay && !S.role) {
      infoText = "A round is on. You'll join the next one.";
    } else if (ph === "hide" && S.role === "pig") {
      infoText = "Find a hiding spot! Bushes, dumpsters, wardrobes, ball pits…";
    }
    setText(info, infoText);
    show(info, !!infoText);
    setProp(bannerEl, "top", infoText ? "42%" : "30%");
    // Watch toggle.
    const canWatch = inPlay && S.role === "pig" && !!S.caught;
    show(watchBtn, canWatch);
    if (canWatch) setText(watchBtn, S.spectating ? "↩ BACK TO PEN (V)" : "👁 WATCH (V)");
    // Kiosk prompt.
    const k = ph === "lobby" && view && view.nearKiosk && !view.shopOpen ? view.nearKiosk : null;
    lastKiosk = k;
    show(kioskBtn, !!k);
    if (k) setText(kioskBtn, "🛒 Open " + (k.label || "shop") + "  (E)");
    // Column visible only when there is something in it.
    const colOn = buttons.length > 0 && !(S.caught && inPlay);
    show(column, colOn);
    // The role badge keeps clear of the ability column beside it (full width without one).
    setProp(roleEl, "max-width", !colOn ? "92vw"
      : compact ? "max(160px, calc(100vw - 420px))" : "max(160px, calc(100vw - 216px))");
  }

  function paintResults() {
    const on = S.phase === "result";
    show(results, on);
    if (!on) return;
    const r = S.result || {};
    const reason = r.reason || "none";
    let title = "Round over";
    let color = INK;
    if (reason === "time") { title = "🐷 PIGS WIN!"; color = PINK; }
    else if (reason === "hunter") { title = "🎯 HUNTER WINS!"; color = RED; }
    setText(resTitle, title);
    setProp(resTitle, "color", color);
    setProp(results, "border-color", color === INK ? "rgba(255,255,255,0.16)" : color);
    let you = "";
    if (S.role === "pig") {
      if (r.iWon) you = "You survived! +1 Pig Win 🐷";
      else if (S.caught) you = "You were caught. Good hiding!";
      else you = reason === "none" ? "Nobody scores this round." : "Good hiding!";
    } else if (S.role === "hunter") {
      if (r.iWon) you = "Every pig caught! +1 Hunter Win 🎯";
      else you = reason === "time" ? "The pigs got away this time." : "Nobody scores this round.";
    } else {
      you = "You sat this one out.";
    }
    setText(resYou, you);
    const save = S.save || {};
    setText(resTotals, "🐷 " + fmtInt(save.pigWins) + " pig wins  ·  🎯 " + fmtInt(save.hunterWins) + " hunter wins");
    const pl = ladderLine(PIG_CLASSES, save.pigTier, save.pigWins, "pig");
    const hl = ladderLine(HUNTER_CLASSES, save.hunterTier, save.hunterWins, "hunter");
    setText(resNext, pl.ready ? pl.text : hl.ready ? hl.text : "");
    setText(resClock, "Back to the lobby in " + Math.max(0, Math.ceil(num(S.clock, 0))) + "…");
  }

  function paintChips() {
    const save = S.save || {};
    chip("ph-wins", "🐷", "Wins", fmtInt(save.pigWins) + " · 🎯 " + fmtInt(save.hunterWins));
    const showHp = S.role === "pig" && (S.phase === "hide" || S.phase === "seek");
    if (showHp) chip("ph-hp", "❤️", "HP", S.caught ? "caught" : Math.max(0, Math.ceil(num(S.hp, 0))) + "/" + Math.ceil(num(S.hpMax, 100)));
    else unchip("ph-hp");
  }

  function drainToasts() {
    const q = S.toastQ;
    if (!Array.isArray(q) || q.length === 0) return;
    const items = q.splice(0, q.length);
    for (const t of items.slice(-4)) {
      if (!t) continue;
      const text = typeof t === "string" ? t : String(t.text || "");
      if (!text) continue;
      try { ui.toast(text, { icon: t.icon, variant: t.variant }); } catch (err) { /* best effort */ }
    }
  }

  function paintFades(step) {
    // Blind (S.blind is round.js's; hud only draws it).
    const blind = Math.max(0, num(S.blind, 0));
    const fade = Math.max(0.05, T("BLIND_FADE_S", 0.6));
    const op = blind <= 0 ? 0 : blind >= fade ? 1 : blind / fade;
    const opS = (Math.round(op * 50) / 50).toFixed(2);
    setProp(blindEl, "opacity", opS);
    setProp(blindEl, "display", op > 0 ? "block" : "none");
    // Damage flash: raised whenever our HP falls during a round.
    const hp = num(S.hp, 100);
    if (S.role === "pig" && (S.phase === "seek" || S.phase === "hide") && hp < prevHp) flashLeft = FLASH_S;
    prevHp = hp;
    if (flashLeft > 0) flashLeft = Math.max(0, flashLeft - step);
    setProp(flash, "opacity", (Math.round((flashLeft / FLASH_S) * 20) / 20).toFixed(2));
    // Banner fade.
    if (bannerLeft > 0) {
      bannerLeft = Math.max(0, bannerLeft - step);
      const o = bannerLeft >= BANNER_FADE_S ? 1 : bannerLeft / BANNER_FADE_S;
      setProp(bannerEl, "opacity", (Math.round(o * 20) / 20).toFixed(2));
    }
  }

  function update(dt, view) {
    if (disposed || !S) return;
    const step = Math.max(0, Math.min(0.5, num(dt, 0)));
    buttons = view && Array.isArray(view.buttons) ? view.buttons.filter((b) => b && typeof b.id === "string") : [];
    drainToasts();
    edgeBanners();
    paintFades(step);
    refreshLeft -= step;
    const shape = shapeOf(view);
    if (shape === lastShape && refreshLeft > 0) return;
    if (shape !== lastShape) {
      lastShape = shape;
      compact = isCompact();
      const cb = isCompactButtons();
      if (cb !== compactBtns) {
        compactBtns = cb;
        for (const n of btnNodes.values()) n.wrap.remove();
        btnNodes.clear();
      }
      syncButtonSet(buttons);
      placeSides();
    }
    refreshLeft = T("HUD_REFRESH_S", 0.25);
    placeTops();
    paintTop();
    paintLobby(view);
    paintStatus(view);
    paintResults();
    paintButtons();
    paintChips();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("pointerdown", onCanvasDown);
    for (const key of Array.from(chipVals.keys())) unchip(key);
    btnNodes.clear();
    buttons = [];
    lastKiosk = null;
    if (root.parentNode) root.parentNode.removeChild(root);
    if (blindEl.parentNode) blindEl.parentNode.removeChild(blindEl);
  }

  return { update, banner, dispose, shake, hitFlash };
}
