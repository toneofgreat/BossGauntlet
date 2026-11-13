// src/platform/ui/hud.js — the persistent HUD bar: Oofbux pill, centre title slot,
// avatar button and settings gear, plus the game stat chips of spec 04 §5.7.
// Owner: spec 06 §5.6.3 (anatomy, tweens) and §5.6.2 (touch targets, reduced motion).

import { el, pill } from "./kit.js";
import { formatOofbux } from "./tokens.js";

// Tuning constants, spec 06 §6 (the single source for these numbers).
const PILL_COUNTUP_MS = 400;
const PILL_PULSE_MS = 200;
// §5.6.3: "count-up tween old→new over 400 ms (16 steps)".
const COUNTUP_STEPS = 16;

// SLICE: spec 05 §5.3's faces.js paints the real face onto a canvas texture; the HUD
// button is a 28px square, so until the avatar service exposes a thumbnail painter it
// shows a two-character glyph per face id. Filled in from spec 05 §5.3 / §5.10.1.
const FACE_GLYPHS = Object.freeze({
  face_smile: ":)", face_oof: ":O", face_cool: "B)", face_wink: ";)", face_angry: ">:(",
});

function faceGlyph(faceId) {
  return FACE_GLYPHS[faceId] || ":)";
}

// Phones (spec 06 §5.7.8, 2026-11-12): a balance pill, the 🏠 button and six 44px icons
// cannot share one 374px row (390 wide minus the 8px gutters) — they overlapped, and the
// pill or the 🏠 button sat UNDER the icon row where no tap could reach it. Under 520px
// the icons drop to 40px, the centre title is hidden (the Place's own UI names it), and
// the 🏠 button moves to the start of the second row, pushing the stat chips over. The
// Oof Studio corner button shrinks to its icon there, so it stays clear of a Place's own
// centred top-of-screen controls (the Obby's stage picker).
const NARROW_STYLE_ID = "oof-hud-narrow-style";
function injectNarrowStyle() {
  if (document.getElementById(NARROW_STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = NARROW_STYLE_ID;
  style.textContent = `
@media (max-width:520px){
  #oof-hud{gap:4px}
  #oof-hud .oof-hud-right{gap:4px;flex:none}
  #oof-hud .oof-btn-icon{width:40px;height:40px;min-width:40px;min-height:40px;font-size:20px}
  #oof-hud .oof-hud-title{display:none!important}
  #oof-hud .oof-hud-left{flex:1 1 auto;min-width:0}
  #oof-hud .oof-hud-left .oof-pill{padding:0 10px;gap:6px;min-width:0;overflow:hidden}
  #oof-hud-home{position:fixed;top:calc(60px + env(safe-area-inset-top));left:8px}
  #oof-hud-stats.oof-with-home{left:56px;max-width:calc(100vw - 180px)}
  #oof-corner-studio{width:40px;min-width:40px;height:40px!important;padding:0!important;justify-content:center}
  #oof-corner-studio .oof-corner-label{display:none}
}`;
  document.head.appendChild(style);
}

function reducedMotion() {
  return document.body.classList.contains("oof-reduced-motion");
}

// createHud(services, events) -> { el, setTitle, setStat, removeStat, clearStats,
//                                   setBuilder, setHome, setStudioCorner,
//                                   refreshAvatar, destroy }
// §4's table names el/setTitle/destroy; setStat/removeStat/clearStats back spec 04
// §5.7's HUD chips (the shell clears them on dispose) and refreshAvatar repaints the
// avatar button after a Catalog purchase when no avatar service onChange is wired.
// `services` = { economy, avatar, audio, ui } — the HUD reaches the platform through
// this bag only (§5.6.3 needs the `click` sfx, hence engine audio rides along).
// `events` = the shell's cross-Place platform bus (`platform:placeLoaded` sets the
// title; per-Place emitters die on travel and cannot own a persistent HUD).
export function createHud(services = {}, events = null) {
  const economy = services.economy || null;
  const avatar = services.avatar || null;
  const audio = services.audio || null;
  const ui = () => services.ui || null;

  injectNarrowStyle();
  const root = el("div", "oof-hud");
  root.id = "oof-hud";

  let shown = economy ? economy.getBalance() : 0;
  const balancePill = pill({
    disc: true,
    text: formatOofbux(shown),
    ariaLabel: "Oofbux balance",
    onClick: () => {
      click();
      const exact = economy ? economy.getBalance() : 0;
      const api = ui();
      if (api) api.toast({ icon: "🪙", title: `${exact.toLocaleString("en-US")} Oofbux` });
    },
  });
  const balanceValue = balancePill.querySelector(".oof-pill-value");

  const titlePill = pill({ text: "", className: "oof-hud-title" });
  titlePill.style.display = "none";

  const right = el("div", "oof-hud-right");
  const avatarBtn = el("button", "oof-btn oof-btn-icon");
  avatarBtn.type = "button";
  avatarBtn.setAttribute("aria-label", "Avatar and Catalog");
  const avatarFace = el("div", "oof-hud-avatar-face");
  avatarBtn.appendChild(avatarFace);
  avatarBtn.addEventListener("click", () => {
    click();
    const api = ui();
    if (api) api.openCatalog("avatar");
  });

  const gearBtn = el("button", "oof-btn oof-btn-icon", "⚙");
  gearBtn.type = "button";
  gearBtn.setAttribute("aria-label", "Settings");
  gearBtn.addEventListener("click", () => {
    click();
    const api = ui();
    if (api) api.openSettings();
  });

  // Spec 14 §5.6 — the Games browser. It sits left of the gear because it is a place
  // you GO rather than a setting you change.
  const gamesBtn = el("button", "oof-btn oof-btn-icon", "🎮");
  gamesBtn.type = "button";
  gamesBtn.setAttribute("aria-label", "Games");
  gamesBtn.addEventListener("click", () => {
    click();
    const api = ui();
    if (api && typeof api.openGames === "function") api.openGames();
  });

  // Spec 15: who is here, and who your friends are. Both are places you look at
  // other people, so they sit together left of the gear.
  const playersBtn = el("button", "oof-btn oof-btn-icon", "👥");
  playersBtn.type = "button";
  playersBtn.setAttribute("aria-label", "Players here");
  playersBtn.addEventListener("click", () => {
    click();
    const api = ui();
    if (api && typeof api.openPlayers === "function") api.openPlayers();
  });

  const friendsBtn = el("button", "oof-btn oof-btn-icon", "🤝");
  friendsBtn.type = "button";
  friendsBtn.setAttribute("aria-label", "Friends");
  friendsBtn.addEventListener("click", () => {
    click();
    const api = ui();
    if (api && typeof api.openFriends === "function") api.openFriends();
  });

  // Spec 16 — the boombox code box.
  const boomBtn = el("button", "oof-btn oof-btn-icon", "🎵");
  boomBtn.type = "button";
  boomBtn.setAttribute("aria-label", "Boombox");
  boomBtn.addEventListener("click", () => {
    click();
    const api = ui();
    if (api && typeof api.openBoombox === "function") api.openBoombox();
  });

  // Spec 18 — OofTools. Hidden until a Place hands you the tools, because a button
  // that is always there and usually refuses is worse than one that appears when it
  // means something.
  const toolsBtn = el("button", "oof-btn oof-btn-icon", "🛠");
  toolsBtn.type = "button";
  toolsBtn.setAttribute("aria-label", "OofTools");
  toolsBtn.style.display = "none";
  toolsBtn.addEventListener("click", () => {
    click();
    const api = ui();
    if (api && typeof api.openOofTools === "function") api.openOofTools();
  });

  right.append(avatarBtn, gamesBtn, playersBtn, friendsBtn, boomBtn, toolsBtn, gearBtn);

  // Spec 06 §5.7 (2026-11-12): the way back to the front page from inside a game. Shown
  // only while a Place is loaded — on the front page itself there is nowhere to go back to.
  const homeBtn = el("button", "oof-btn oof-btn-icon", "🏠");
  homeBtn.type = "button";
  homeBtn.id = "oof-hud-home";
  homeBtn.setAttribute("aria-label", "Back to the front page");
  homeBtn.title = "Back to the front page";
  homeBtn.style.display = "none";
  homeBtn.addEventListener("click", () => {
    click();
    const api = ui();
    if (api && typeof api.goHome === "function") api.goHome();
  });
  const left = el("div", "oof-hud-left");
  left.setAttribute("style", "display:flex;align-items:center;gap:var(--oof-space-2);min-width:0");
  left.append(homeBtn, balancePill);
  root.append(left, titlePill, right);
  document.body.appendChild(root);

  // Spec 06 §5.7: Oof Studio is one tap away from anywhere — the front page and every
  // Place. Top-right, directly under the HUD bar: the joystick and chat own the bottom
  // left, jump and the gear button the bottom right, and the HUD bar the top strip, so
  // this corner is the one a thumb never needs for playing. Shown/hidden by the shell
  // (hidden while Studio itself, a load, or the error screen is up).
  const studioBtn = el("button", "oof-btn oof-btn-secondary");
  studioBtn.append(el("span", null, "🏗️"), el("span", "oof-corner-label", " Studio"));
  studioBtn.type = "button";
  studioBtn.id = "oof-corner-studio"; // not "oof-studio-*": spec 11 criterion 19 counts those as Studio leftovers
  studioBtn.setAttribute("data-oof", "studio-corner");
  studioBtn.setAttribute("aria-label", "Open Oof Studio");
  studioBtn.title = "Oof Studio — build your own game";
  studioBtn.setAttribute("style",
    "position:fixed;top:calc(60px + env(safe-area-inset-top));right:8px;z-index:var(--oof-z-hud);"
    + "height:36px;min-height:36px;padding:0 12px;font-size:var(--oof-size-sm);border-radius:999px;"
    + "background:rgba(36,39,43,0.88);box-shadow:0 3px 10px rgba(0,0,0,.35);display:none");
  studioBtn.addEventListener("click", () => {
    click();
    const api = ui();
    if (api && typeof api.openStudio === "function") api.openStudio();
  });
  document.body.appendChild(studioBtn);

  // Stat chips live in their own row under the bar so a game's chips never collide
  // with the HUD-reserved centre/right strip (§5.6.1 layout rule).
  const stats = el("div");
  stats.id = "oof-hud-stats";
  document.body.appendChild(stats);
  const chips = new Map();

  function click() {
    if (audio) audio.playSfx("click");
  }

  function paintAvatar() {
    const cfg = avatar && typeof avatar.getConfig === "function" ? avatar.getConfig() : null;
    avatarFace.style.background = (cfg && cfg.headColor) || "#f5cd30";
    avatarFace.textContent = faceGlyph(cfg && cfg.face);
  }

  let countTimer = null;
  function paintBalance(value) {
    shown = value;
    balanceValue.textContent = formatOofbux(value);
  }

  // Count-up tween + scale pulse (§5.6.3); both are instant under reduced motion.
  function animateTo(target) {
    clearTimeout(countTimer);
    if (reducedMotion()) {
      paintBalance(target);
      return;
    }
    balancePill.classList.remove("oof-hud-pulse");
    void balancePill.offsetWidth; // restart the 200 ms pulse keyframes
    balancePill.classList.add("oof-hud-pulse");
    setTimeout(() => balancePill.classList.remove("oof-hud-pulse"), PILL_PULSE_MS);
    const from = shown;
    let step = 0;
    const tick = () => {
      step++;
      const t = step / COUNTUP_STEPS;
      paintBalance(step >= COUNTUP_STEPS ? target : Math.round(from + (target - from) * t));
      if (step < COUNTUP_STEPS) countTimer = setTimeout(tick, PILL_COUNTUP_MS / COUNTUP_STEPS);
    };
    countTimer = setTimeout(tick, PILL_COUNTUP_MS / COUNTUP_STEPS);
  }

  const unsubs = [];
  if (economy && typeof economy.onChange === "function") {
    unsubs.push(economy.onChange((change) => {
      // §5.2.2 step 5: a positive delta also plays the "oofbux" sfx.
      if (change && change.delta > 0 && audio) audio.playSfx("oofbux");
      animateTo(change.balance);
    }));
  }
  if (avatar && typeof avatar.onChange === "function") {
    unsubs.push(avatar.onChange(paintAvatar));
  }
  if (events && typeof events.on === "function") {
    unsubs.push(events.on("platform:placeLoaded", (e) => setTitle(e && e.name ? e.name : null)));
  }

  function setTitle(text) {
    const value = text === null || text === undefined ? "" : String(text);
    titlePill.querySelector(".oof-pill-value").textContent = value;
    titlePill.style.display = value ? "" : "none";
  }

  function setStat(key, chip) {
    const spec = chip || {};
    let node = chips.get(key);
    if (!node) {
      node = pill({ icon: spec.icon, label: spec.label, text: "" });
      chips.set(key, node);
      stats.appendChild(node);
    }
    node.querySelector(".oof-pill-value").textContent = spec.value === undefined ? "" : String(spec.value);
    const label = node.querySelector(".oof-chip-label");
    if (label && spec.label !== undefined) label.textContent = String(spec.label);
  }

  function removeStat(key) {
    const node = chips.get(key);
    if (!node) return;
    node.remove();
    chips.delete(key);
  }

  function clearStats() {
    for (const key of [...chips.keys()]) removeStat(key);
  }

  function destroy() {
    clearTimeout(countTimer);
    for (const off of unsubs) off();
    unsubs.length = 0;
    clearStats();
    stats.remove();
    studioBtn.remove();
    root.remove();
  }

  paintAvatar();
  function setBuilder(on) {
    toolsBtn.style.display = on ? "" : "none";
  }
  function setHome(on) {
    homeBtn.style.display = on ? "" : "none";
    stats.classList.toggle("oof-with-home", !!on);
  }
  function setStudioCorner(on) {
    studioBtn.style.display = on ? "" : "none";
  }

  return {
    el: root, setTitle, setStat, removeStat, clearStats, setBuilder, setHome, setStudioCorner,
    refreshAvatar: paintAvatar, destroy,
  };
}
