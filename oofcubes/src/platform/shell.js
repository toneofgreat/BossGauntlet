// src/platform/shell.js — boot, hash routing, the Place lifecycle and ctx assembly:
// everything that turns a folder of games into one platform. Owner: spec 06 §5.2
// (boot sequence, routing, error screen) implementing spec 04 §5.6 (the normative
// goTo state machine) and §5.7 (the canonical ctx surface every Place consumes).
//
// SLICE: spec 06 §4 splits the boot/travel/error overlays into `ui/loading.js` and the
// panel/dialog/settings/onboarding surfaces into `ui/panel.js`, `ui/dialog.js`,
// `ui/settings.js`, `ui/onboarding.js`, `ui/service.js`. This task owns shell.js plus
// tokens/kit/hud/toast only, so the minimal versions of those surfaces live in the
// marked sections below and move out — behaviour unchanged — when 06 §5.6.5-§5.6.9's
// own files land.

import { injectTokens, formatOofbux, TOKENS } from "./ui/tokens.js";
import { el, button, trapFocus, shopGrid } from "./ui/kit.js";
import { createToaster } from "./ui/toast.js";
import { createHud } from "./ui/hud.js";
import * as saves from "./services/saves.js";
import * as economy from "./services/economy.js";
import * as badges from "./services/badges.js";
import { getAllItems } from "./services/avatar/catalog-data.js";
import { mountSettingsRows } from "./ui/settings.js";
import { openAvatarEditor, closeAvatarEditor } from "./ui/avatar-editor.js";

// ---------------------------------------------------------------------------
// tuning constants — spec 06 §6 (the single source for these numbers)
// ---------------------------------------------------------------------------

const BOOT_WEIGHTS = [0.30, 0.20, 0.10, 0.10, 0.15, 0.15]; // steps 2-7
const BOOT_STEP_COUNT = 7;
const BOOT_FADE_MS = 300;
const TRANSITION_FADE_MS = 300;
const TIP_INTERVAL_MS = 2500;
const SETTINGS_DEBOUNCE_MS = 250;
const SHELL_VERSION = "0.1.0";

// Constants owned by sibling specs, cited by name and never re-derived.
const ERROR_SCREEN_MAX_ERRORS = 10;    // spec 04 §6
const AVATAR_HEIGHT = 5;               // ARCHITECTURE §5
const FEET_OFFSET = AVATAR_HEIGHT / 2; // physics positions are capsule CENTRES
const DEG = Math.PI / 180;
const EVENT_LOG_MAX = 500;             // debug ring buffer (spec 12 §3.7)
const SCRIPT_STEPS_MAX = 4000;

// Loading tips — spec 06 §5.2.3, exact strings and order.
const TIPS = [
  "Tip: Oofbux earned in any Place spend everywhere.",
  "Tip: Touch a glowing portal in the Hub to travel.",
  "Tip: Saves live in this browser — export a save code from Settings before switching devices.",
  "Tip: Drag the right half of the screen to look around.",
  "Tip: Some Badges are hidden. The clouds above the Hub look suspicious…",
  "Tip: The Catalog storefront in the Hub sells faces, gear, and auras.",
  "Tip: Falling into the void just respawns you. Oof.",
  "Tip: Choppy? Lower the quality tier in Settings.",
  "Tip: Rebirths in Weight Lifting Simulator reset gains but multiply everything.",
  "Tip: Every obby stage has a checkpoint — progress never rolls back past one.",
];

// The single merged Place registry — spec 06 §5.2.1 / spec 04 §5.6 (validate 04:V5
// parses THIS literal). Portals are built for every row with portalColor !== null and
// hidden !== true, in array order: adding a Place is adding one row. The Hub's own
// buildPortals (hub/scripts/layout.js) reads this array generically — it lays out
// however many rows pass the filter, so the `lifting` row below produces its portal
// arch with no Hub-side change (verified by reading buildPortals: nothing there names
// a slug or a row count).
const PLACES = [
  { slug: "hub",     hidden: true,  name: "The Hub",                  icon: "🏙️", portalColor: null,
    module: "./hub/game.js",           data: "./hub/place.json" },
  { slug: "obby",    hidden: false, name: "Difficulty Chart Obby",    icon: "🗼", portalColor: "#e74c3c",
    module: "../games/obby/game.js",   data: "../games/obby/place.json" },
  { slug: "lifting", hidden: false, name: "Weight Lifting Simulator", icon: "🏋️", portalColor: "#f5c542",
    module: "../games/lifting/game.js", data: "../games/lifting/place.json" },
  { slug: "tycoon",  hidden: false, name: "Boss Tycoon",              icon: "🏭", portalColor: "#3ddc84",
    module: "../games/tycoon/game.js", data: "../games/tycoon/place.json" },
  { slug: "demo",    hidden: true,  name: "Demo Yard",                icon: "🧪", portalColor: null,
    module: "../games/demo/game.js",   data: "../games/demo/place.json" }, // smoke fixture
];

const smokeMode = new URLSearchParams(location.search).has("smoke");

// ---------------------------------------------------------------------------
// module state
// ---------------------------------------------------------------------------

// Engine singletons (spec 02 §5.5: each createX is called exactly once). Boot step 3
// populates them; everything below reaches them lazily.
let THREE = null;
let engineLoop = null;
let renderer = null;
let cameraCtl = null;
let input = null;
let audio = null;
let physics = null;
let parts = null;
let placeApi = null;      // the src/engine/place.js namespace
let physicsForParts = null;
let physicsForPlace = null;
let partsApi = null;

let avatarService = null; // services/avatar.js once it lands (spec 05 §4)
let playerRig = null;     // Rig (spec 05 §5.1) or the SLICE placeholder group
let rigRoot = null;       // its THREE.Group — what physics drives and ctx.player.avatar exposes

let platformBus = null;   // cross-Place emitter (per-Place emitters die on travel)
let events = null;        // the current Place emitter (ctx.events)
let hud = null;
let toaster = null;
let bootScreen = null;
let transitionOverlay = null;

let state = "loading";    // hub | loading | playing | disposing (spec 04 §5.6) | studio (spec 11 §5.9)
let currentSlug = null;
let pendingSlug = null;
let loadInFlight = false; // a transition is running (see goTo)
let suppressNextHash = false;
let placeHandle = null;
let serviceView = null; // per-transition service subscription view (see createServiceView)
let gameMod = null;
let ctx = null;
let simTime = 0;          // session sim seconds — monotonic, never wall clock
let updateHalted = false; // set when a game update throws (the error screen owns the run)
let booted = false;
let fadeBootOnNextFrame = false;

// ---------------------------------------------------------------------------
// debug handle — spec 12 §3.7 (ONE object under all three sibling names)
// ---------------------------------------------------------------------------

const debugHandle = {
  version: SHELL_VERSION,
  route: location.hash,
  currentSlug: null,
  placeReady: false,
  bootSteps: 0,
  lastError: null,
  hub: null,
  state,
  slug: null,
  time: 0,
  lastLeaks: null,
  lastHardLeaks: null,
  loop: null,
  renderer: null,
  camera: null,
  input: null,
  audio: null,
  ctx: null,
  counts: () => ({
    listeners: events ? events.count() : 0,
    sceneChildren: renderer ? renderer.scene.children.length : 0,
    geometries: renderer ? renderer.three.info.memory.geometries : 0,
    colliders: physics ? physics.getDebugState().colliderCount : 0,
  }),
  debug: { physics: () => (physics ? physics.getDebugState() : null), eventLog: [] },
};
// The single sanctioned window assignment in the codebase (spec 12 §5.7.3 rule 6),
// installed under all three sibling names (spec 12 §3.7 binding reconciliation).
window.__oof = window.__oofDebug = window.__oofcubes = debugHandle;

function setState(next) {
  state = next;
  debugHandle.state = next;
}

function reducedMotion() {
  return document.body.classList.contains("oof-reduced-motion");
}

function placeEntry(slug) {
  return PLACES.find((p) => p.slug === slug) || null;
}

// ---------------------------------------------------------------------------
// SECTION: boot screen, travel overlay, error screen
// SLICE: spec 06 §4 gives these three to `ui/loading.js`
// (bootScreen/miniLoading/showError) — same behaviour, different file.
// ---------------------------------------------------------------------------

// The boot markup is inline in index.html (§5.2.2: it must paint with no JS at all);
// this only drives it.
function createBootScreen() {
  const root = document.getElementById("oof-boot");
  const fill = document.getElementById("oof-boot-fill");
  const tip = document.getElementById("oof-boot-tip");
  let index = Math.floor(Math.random() * TIPS.length);
  if (tip) tip.textContent = TIPS[index];
  const timer = setInterval(() => {
    index = (index + 1) % TIPS.length;
    if (tip) tip.textContent = TIPS[index];
  }, TIP_INTERVAL_MS);
  let gone = false;

  return {
    setProgress(value) {
      const clamped = Math.max(0, Math.min(1, value));
      if (fill) fill.style.width = (clamped * 100).toFixed(1) + "%";
    },
    setLabel(text) {
      if (tip) tip.textContent = text;
    },
    hide() {
      if (gone) return;
      gone = true;
      clearInterval(timer);
      if (!root) return;
      root.classList.add("is-out");
      setTimeout(() => root.remove(), reducedMotion() ? 0 : BOOT_FADE_MS);
    },
  };
}

// miniLoading(text) — the travel overlay of §5.2.5 step 2.
function miniLoading(text) {
  const root = el("div", "oof-transition");
  root.id = "oof-transition";
  const cube = el("div", "oof-transition-cube");
  cube.appendChild(el("div"));
  root.append(cube, el("div", "oof-transition-label", text));
  document.body.appendChild(root);
  requestAnimationFrame(() => root.classList.add("is-in"));
  let hidden = false;
  return {
    el: root,
    hide() {
      if (hidden) return;
      hidden = true;
      root.classList.remove("is-in");
      setTimeout(() => root.remove(), reducedMotion() ? 0 : TRANSITION_FADE_MS);
    },
  };
}

function hideError() {
  const old = document.getElementById("oof-error");
  if (old) old.remove();
}

// showError(err, { onHub, details }) — spec 06 §5.2.6. Never stacks: a second error
// while the screen is up only refreshes its contents.
function showError(err, opts = {}) {
  const message = String((err && err.message) || err || "Unknown error");
  const stack = String(opts.details || (err && err.stack) || message);
  debugHandle.lastError = { message, stack };
  hideError();

  const root = el("div", "oof-error");
  root.id = "oof-error";
  root.setAttribute("data-oof", "error-screen");
  const card = el("div", "oof-error-card");
  card.append(
    el("div", "oof-error-title", "Oof! Something broke."),
    el("div", "oof-error-message", message)
  );
  const details = el("details");
  details.append(el("summary", null, "Details"), el("pre", "oof-error-stack", stack));
  card.appendChild(details);

  const row = el("div", "oof-error-buttons");
  row.append(
    button({ label: "Copy error", variant: "secondary", onClick: () => copyError(message, stack) }),
    button({
      label: "Back to Hub",
      variant: "primary",
      onClick: () => {
        // A full reload guarantees a clean engine (§5.2.6).
        location.replace(location.pathname + location.search + "#/hub");
        location.reload();
      },
    })
  );
  card.appendChild(row);
  root.appendChild(card);
  document.body.appendChild(root);
  trapFocus(card);
}

function copyError(message, stack) {
  const text = message + "\n" + stack;
  const clip = navigator.clipboard;
  if (clip && typeof clip.writeText === "function") {
    clip.writeText(text).catch(() => showCopyFallback(text));
    return;
  }
  showCopyFallback(text);
}

// §5.2.6's fallback when the clipboard API is unavailable: a selected textarea.
function showCopyFallback(text) {
  const host = document.getElementById("oof-error");
  if (!host) return;
  const area = el("textarea", "oof-error-copy");
  area.value = text;
  area.readOnly = true;
  host.querySelector(".oof-error-card").appendChild(area);
  area.focus();
  area.select();
}

// Load/init failures list up to ERROR_SCREEN_MAX_ERRORS loader messages (spec 04 §5.6
// step 5) under the same screen.
function showLoadError(entry, code, errorList) {
  const lines = errorList.slice(0, ERROR_SCREEN_MAX_ERRORS).map((e) =>
    typeof e === "string" ? e : `${e.code || code} ${e.path || ""} ${e.message || ""}`.trim()
  );
  showError(new Error(`Couldn't load ${entry.name}`), { details: lines.join("\n") });
  debugHandle.lastError.code = code; // showError owns message/stack; the code rides along
}

// ---------------------------------------------------------------------------
// SECTION: dialogs, panels, Catalog and Settings
// SLICE: minimal versions of 06 §5.6.5 (dialogs), §5.6.7 (panels), §5.6.9 (settings)
// and of the Catalog panel behind §5.6.8's registerCatalogOpener seam (spec 05 §5.10
// owns the real editor). Drag-to-close, orientation re-layout, the 18-row settings
// list, onboarding and the save-code UI are filled in from those sections.
// ---------------------------------------------------------------------------

const dialogQueue = [];
let dialogOpen = false;
let panelHandle = null;

function sfx(name) {
  if (audio) audio.playSfx(name);
}

// dialog(opts) -> Promise<buttonId>. Only one at a time; further calls queue FIFO
// (§5.6.5). Spec 04 §5.7 instead says a second call rejects with Error("dialog busy")
// — the two specs conflict; queueing is implemented because 06 §7 criterion 18 tests
// it, and a queued dialog can never lose a game's prompt. Reported as a spec gap.
function dialog(opts = {}) {
  return new Promise((resolve) => {
    dialogQueue.push({ opts, resolve });
    pumpDialogs();
  });
}

function pumpDialogs() {
  if (dialogOpen || dialogQueue.length === 0) return;
  dialogOpen = true;
  const { opts, resolve } = dialogQueue.shift();
  const cancelable = opts.cancelable !== false;
  const buttons = Array.isArray(opts.buttons) && opts.buttons.length
    ? opts.buttons
    : [{ id: "ok", label: "OK", variant: "primary" }];

  const overlay = el("div", "oof-dialog-overlay");
  const card = el("div", "oof-dialog");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.appendChild(el("div", "oof-dialog-title", opts.title || ""));
  if (opts.body) card.appendChild(el("div", "oof-dialog-body", opts.body));
  if (opts.bodyEl) card.appendChild(opts.bodyEl);

  const row = el("div", "oof-dialog-buttons");
  let release = null;
  const finish = (id) => {
    document.removeEventListener("keydown", onKey, true);
    if (release) release();
    overlay.remove();
    dialogOpen = false;
    sfx("ui_close");
    resolve(id);
    pumpDialogs();
  };
  for (const spec of buttons) {
    row.appendChild(button({ label: spec.label, variant: spec.variant, onClick: () => finish(spec.id) }));
  }
  card.appendChild(row);
  overlay.appendChild(card);

  const onKey = (ev) => {
    if (ev.key === "Escape" && cancelable) {
      ev.preventDefault();
      finish("cancel");
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      finish(buttons[buttons.length - 1].id);
    }
  };
  document.addEventListener("keydown", onKey, true);
  if (cancelable) {
    overlay.addEventListener("click", (ev) => {
      if (ev.target === overlay) finish("cancel");
    });
  }
  document.body.appendChild(overlay);
  release = trapFocus(card); // focus starts on the last (default) button
  sfx("ui_open");
}

function confirmDialog(title, body) {
  return dialog({
    title,
    body,
    buttons: [
      { id: "cancel", label: "Cancel", variant: "secondary" },
      { id: "ok", label: "OK", variant: "primary" },
    ],
  }).then((id) => id === "ok");
}

// openPanel({ title, onClose }) -> { el, bodyEl, close() } — §5.6.7. Portrait bottom
// sheet vs landscape drawer is pure CSS (tokens.js); only one panel at a time.
function openPanel(opts = {}) {
  closeAvatarEditor(); // one full-screen surface at a time
  if (panelHandle) panelHandle.close();
  const scrim = el("div", "oof-panel-scrim");
  const panel = el("div", "oof-panel");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", opts.title || "Panel");
  panel.appendChild(el("div", "oof-panel-handle"));

  const header = el("div", "oof-panel-header");
  const closeBtn = button({ icon: "✕", ariaLabel: "Close", className: "oof-btn-icon" });
  header.append(el("div", "oof-panel-title", opts.title || ""), closeBtn);
  const body = el("div", "oof-panel-body");
  panel.append(header, body);

  let closed = false;
  let release = null;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    if (release) release();
    panel.remove();
    scrim.remove();
    if (panelHandle && panelHandle.el === panel) panelHandle = null;
    sfx("ui_close");
    if (typeof opts.onClose === "function") opts.onClose();
  };
  const onKey = (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      close();
    }
  };
  closeBtn.addEventListener("click", close);
  scrim.addEventListener("click", close);
  document.addEventListener("keydown", onKey, true);
  document.body.append(scrim, panel);
  release = trapFocus(panel);
  // trapFocus lands on the last control (dialogs want their default button); a panel
  // instead takes focus on the container, so Tab starts at the top and no control
  // wears a focus ring the player did not ask for.
  panel.tabIndex = -1;
  panel.focus({ preventScroll: true });
  sfx("ui_open");
  panelHandle = { el: panel, bodyEl: body, close };
  return panelHandle;
}

// The Catalog IS the Avatar Editor (spec 05 §5.10): six tabs, a thumbnail grid and a
// live 3D preview. A 46-item catalogue is not browsable as the one flat list the
// slice shipped. The old shopGrid panel is kept below as the fallback for the case
// where the editor cannot open at all (no second WebGL context, mostly).
function openCatalog(tab) {
  if (!avatarService) {
    uiToast({ variant: "error", title: "Catalog not installed yet" });
    return Promise.resolve();
  }
  try {
    return openAvatarEditor({
      avatar: avatarService,
      economy,
      ui,
      confirmDialog,
      initialTab: tab,
    });
  } catch (err) {
    console.warn("[oof] avatar editor unavailable, falling back to the list", err);
    return openCatalogList();
  }
}

function openCatalogList() {
  return new Promise((resolve) => {
    const panel = openPanel({ title: "Catalog", onClose: resolve });
    const render = () => {
      panel.bodyEl.textContent = "";
      const avatarState = avatarService.getState();
      const equipped = avatarState && avatarState.equipped ? avatarState.equipped : {};
      const items = getAllItems().map((item) => ({
        id: item.id,
        name: item.name,
        icon: CATALOG_GLYPHS[item.type] || "❓",
        iconCanvas: colorSwatch(item),
        price: item.price || 0,
        owned: avatarService.owns(item.id),
        equipped: Object.values(equipped).includes(item.id),
      }));
      panel.bodyEl.appendChild(shopGrid({ items, onSelect: (item) => onCatalogSelect(item, render) }));
    };
    render();
  });
}

const CATALOG_GLYPHS = { face: "🙂", bodycolor: "🎨", hat: "🎩", gear: "🗡️", aura: "✨", trail: "💫" };

// A body colourway reads as its colour, not as a paint-palette emoji. Everything else
// keeps its type glyph. SLICE: spec 05 §5.10.1's rendered item thumbnails replace both.
function colorSwatch(item) {
  if (item.type !== "bodycolor") return null;
  const look = item.appearance || {};
  const swatch = el("div", "oof-swatch");
  swatch.style.background = (look.preset && look.preset.torso) || look.swatch || "#f5cd30";
  return swatch;
}

function onCatalogSelect(item, render) {
  if (!avatarService) return;
  const result = item.owned ? avatarService.equip(item.id) : avatarService.buy(item.id);
  if (result && result.ok) {
    if (item.owned) {
      uiToast({ icon: "✅", title: "Equipped", body: item.name });
    } else {
      sfx("purchase");
      uiToast({ variant: "purchase", icon: "🛍️", title: "Bought " + item.name, body: formatOofbux(item.price) + " Oofbux" });
    }
    if (hud) hud.refreshAvatar();
  } else {
    const reason = result && result.reason === "broke" ? "Not enough Oofbux" : "Can't equip that yet";
    uiToast({ variant: "error", title: reason, body: item.name });
  }
  render();
}

// Settings — spec 06 §5.6.9's full 18-row body lives in ui/settings.js now (all of
// AUDIO/GRAPHICS/CONTROLS/ACCESSIBILITY/SAVE DATA/footer); this function is reduced to
// what only the shell can supply — the deps bag (its own module-scope services plus the
// two callbacks below) — and the one stopgap row that isn't a §5.6.9 row at all.
function openSettings() {
  const panel = openPanel({ title: "Settings" });
  const settings = profileSettings();
  mountSettingsRows(panel.bodyEl, {
    settings, writeSetting, applyAccessibility,
    audio, renderer, input, sfx,
    saves, confirmDialog, toast: uiToast,
    version: SHELL_VERSION,
  });

  // Not a §5.6.9 row: the slice's only way out of a Place on a phone (a game's own
  // exit button is per-game-spec, §5.2.4). Removed when the Hub's own exits land.
  panel.bodyEl.appendChild(el("div", "oof-section-label", "PLACE"));
  panel.bodyEl.appendChild(button({
    label: "Back to the Hub", variant: "secondary",
    onClick: () => {
      panel.close();
      navigate("hub");
    },
  }));
}

let settingsTimer = null;
function writeSetting(key, value) {
  const profile = saves.getDomain("profile");
  profile.settings[key] = value;
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => {
    saves.markDirty("profile");
    emitPlatform("platform:settingsChanged", { settings: profile.settings });
  }, SETTINGS_DEBOUNCE_MS);
}

// Platform events go out on the live Place emitter, which republishes onto the
// cross-Place bus (instrumentEmitter) — emitting on both would deliver twice.
function emitPlatform(name, payload) {
  if (events) events.emit(name, payload);
  else if (platformBus) platformBus.emit(name, payload);
}

function profileSettings() {
  const profile = saves.getDomain("profile");
  return profile.settings;
}

// ---------------------------------------------------------------------------
// SECTION: the ctx.services.ui facade — spec 06 §5.6.8 / spec 04 §5.7
// Every method is wrapped: a UI failure must never crash the calling game.
// ---------------------------------------------------------------------------

function safely(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    console.error("[oof] ui call failed", err);
    return fallback;
  }
}

// toast accepts both the §3.5 options object and spec 04 §5.7's (text, opts) form.
function uiToast(optsOrText, extra) {
  return safely(() => {
    if (!toaster) return 0;
    const opts = typeof optsOrText === "string"
      ? { title: optsOrText, duration: extra && extra.duration, icon: extra && extra.icon, variant: extra && extra.variant }
      : optsOrText || {};
    return toaster.toast(opts);
  }, 0);
}

const ui = {
  toast: uiToast,
  dismissToast: (id) => safely(() => (toaster ? toaster.dismiss(id) : undefined), undefined),
  dialog: (opts) => safely(() => dialog(opts), Promise.resolve(null)),
  confirm: (title, body) => safely(() => confirmDialog(title, body), Promise.resolve(false)),
  openPanel: (opts) => safely(() => openPanel(opts), { el: null, bodyEl: null, close() {} }),
  shopGrid: (spec) => safely(() => shopGrid(spec), el("div")),
  openSettings: () => safely(() => openSettings(), undefined),
  openCatalog: (tab) => safely(() => openCatalog(tab), Promise.resolve()),
  setHudTitle: (text) => safely(() => (hud ? hud.setTitle(text) : undefined), undefined),
  setHudStat: (key, chip) => safely(() => (hud ? hud.setStat(key, chip) : undefined), undefined),
  removeHudStat: (key) => safely(() => (hud ? hud.removeStat(key) : undefined), undefined),
  formatOofbux,
  tokens: TOKENS,
};

// ---------------------------------------------------------------------------
// SECTION: services
// ---------------------------------------------------------------------------

// Badges are spec 07 §5.7's own module now. The shell's job is to hand a Place its
// slug-scoped view and to re-bind the counters on every Place transition.
function createBadgesCtxApi(slug) {
  return badges.createCtxApi(slug);
}

// SLICE: services/avatar.js (spec 05 §4) lands with the avatar+Catalog task. Until it
// does, ctx.services.avatar answers with the defaults spec 05 §3.1 defines and
// grantItem reports why it could not run — no game flow crashes on its absence.
function createAvatarCtxApi() {
  if (avatarService) {
    return Object.freeze({
      getState: () => avatarService.getState(),
      getConfig: () => avatarService.getConfig(),
      owns: (itemId) => avatarService.owns(itemId),
      grantItem: (itemId, sourceSlug) => avatarService.grantItem(itemId, sourceSlug),
      createRig: (state) => avatarService.createRig(state),
    });
  }
  return Object.freeze({
    getState: () => Object.freeze({ schemaVersion: 1, owned: [], equipped: {} }),
    getConfig: () => Object.freeze({ headColor: "#f5cd30", face: "face_smile" }),
    owns: () => false,
    grantItem: () => ({ ok: false, reason: "avatar service not installed" }),
    createRig: () => buildPlaceholderRig(),
  });
}

// The HUD button reads the avatar through the adapter spec 05 §4 defines for it
// (getConfig) and repaints on the service's onChange when there is one.
function hudAvatarAdapter() {
  const api = createAvatarCtxApi();
  return {
    getConfig: api.getConfig,
    onChange: avatarService && typeof avatarService.onChange === "function" ? avatarService.onChange : null,
  };
}

// SLICE: the real OofRig (spec 05 §5.1) is built by services/avatar.js. This is the
// body the character controller drives until that module lands.
function buildPlaceholderRig() {
  const group = new THREE.Group();
  group.name = "OofRig";
  const add = (w, h, d, color, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  add(1.2, 1, 1.2, 0xf5cd30, 0, 4.5, 0);   // head
  add(2, 2, 1, 0x2a67c9, 0, 3, 0);         // torso
  add(1, 2, 1, 0xf5cd30, -1.5, 3, 0);      // arms
  add(1, 2, 1, 0xf5cd30, 1.5, 3, 0);
  add(1, 2, 1, 0x37a04c, -0.5, 1, 0);      // legs
  add(1, 2, 1, 0x37a04c, 0.5, 1, 0);
  return { group };
}

// ---------------------------------------------------------------------------
// SECTION: engine bootstrap and the two engine-defect shims inherited from the M1
// dev harness (both reported with M1-T17/T18; deleted when the engine lands the fix).
// ---------------------------------------------------------------------------

// ENGINE DEFECT SHIM 1. physics.setContactHandler is a SINGLE slot and two engine
// modules both claim it: parts.js arms its behaviour touch dispatch on the first
// behaviour tick, and place.js's loadPlace installs its region/killY handler too,
// silently replacing whichever registered first. Both reach physics only through the
// dependency bag the shell hands them, so the shell hands each its own facade and
// fans the one real slot out to both — parts first (spec 02 §5.1 per-tick order).
const contactHandlers = { parts: null, place: null };

function fanOutContacts(entered, stayed, exited) {
  if (contactHandlers.parts) contactHandlers.parts(entered, stayed, exited);
  if (contactHandlers.place) contactHandlers.place(entered, stayed, exited);
}

function makePhysicsFacade(owner) {
  return {
    ...physics,
    setContactHandler(fn) {
      contactHandlers[owner] = typeof fn === "function" ? fn : null;
      physics.setContactHandler(contactHandlers.parts || contactHandlers.place ? fanOutContacts : null);
    },
  };
}

// ENGINE DEFECT SHIM 2. parts.js keeps the exact def object it is handed as its
// mutable record and writes through it at runtime, but spec 04 §7 criterion 4 requires
// place.js's applyPartDefaults to return a DEEP-FROZEN def — so the first moving
// platform tick or checkpoint flash would throw in strict mode. The loader gets a
// partsApi whose load() passes mutable copies until parts.js clones defs itself.
function makePartsApi() {
  return { ...parts, load: (defs) => parts.load(defs.map((d) => JSON.parse(JSON.stringify(d)))) };
}

// ENGINE DEFECT SHIM 3 (this task). place.js's loadPlace builds its fetch URL as
// "src/games/<slug>/place.json" (place.js §5.3 step 2, and its own comment reports the
// gap), which cannot reach the Hub's data — ARCHITECTURE §3 and spec 06 §3.3 put it at
// src/platform/hub/place.json. deps carries no data-path override, so the Hub's single
// fetch is redirected here for the duration of that one load. Delete when loadPlace
// accepts the registry row's `data` URL.
async function withPlaceDataUrl(entry, run) {
  if (entry.slug !== "hub") return run();
  const realFetch = window.fetch.bind(window);
  const target = new URL(entry.data, import.meta.url).href;
  window.fetch = (resource, init) => {
    const url = typeof resource === "string" ? resource : (resource && resource.url) || "";
    return realFetch(url.endsWith("src/games/hub/place.json") ? target : resource, init);
  };
  try {
    return await run();
  } finally {
    window.fetch = realFetch;
  }
}

async function importEngine() {
  // Promise.all, not eight sequential awaits: the engine modules do not depend on each
  // other's evaluation order, and serialising them costs one network round trip each on
  // a real static host (ARCHITECTURE §2 — GitHub Pages, no bundler), where every module
  // is a separate request.
  const [rendererMod, loopMod, inputMod, physicsMod, partsMod, placeMod, audioMod, cameraMod] =
    await Promise.all([
      import("../engine/renderer.js"),
      import("../engine/loop.js"),
      import("../engine/input.js"),
      import("../engine/physics.js"),
      import("../engine/parts.js"),
      import("../engine/place.js"),
      import("../engine/audio.js"),
      import("../engine/camera.js"),
    ]);
  physics = physicsMod;
  parts = partsMod;
  placeApi = placeMod;

  const stage = document.getElementById("oof-stage");
  const canvas = document.getElementById("oof-canvas");
  renderer = rendererMod.createRenderer({ canvas });
  // spec 02 §5.4: input's `dom` is the gameplay CONTAINER (it appends the touch
  // overlay to it); spec 02 §5.3: the camera's `dom` is the canvas (pointer lock).
  input = inputMod.createInput({ dom: stage });
  cameraCtl = cameraMod.createCamera({ dom: canvas, input, physics });
  audio = audioMod.createAudio();
  physicsForParts = makePhysicsFacade("parts");
  physicsForPlace = makePhysicsFacade("place");
  partsApi = makePartsApi();
  platformBus = createBus();

  engineLoop = loopMod.createLoop({ step: stepOnce, render: renderFrame });
  Object.assign(debugHandle, { loop: engineLoop, renderer, camera: cameraCtl, input, audio });

  // renderer.js resizes its own drawing buffer; the follow camera's aspect is the
  // shell's to keep in sync (spec 02 §5.3 exposes setAspect and never listens itself),
  // and a phone rotating portrait<->landscape is the case that needs it.
  const applyAspect = () => cameraCtl.setAspect((canvas.clientWidth || 1) / (canvas.clientHeight || 1));
  window.addEventListener("resize", applyAspect);
  window.addEventListener("orientationchange", applyAspect);
  applyAspect();
}

// ---------------------------------------------------------------------------
// SECTION: ctx assembly — spec 04 §5.7 (exactly five keys, no additions)
// ---------------------------------------------------------------------------

function feet() {
  const c = physics.getPosition();
  return [c[0], c[1] - FEET_OFFSET, c[2]];
}

function buildCtx(emitter, slug) {
  return {
    engine: {
      THREE,
      scene: renderer.scene,
      camera: {
        setDistance: (d) => cameraCtl.setDistance(d),
        setPitch: (deg) => cameraCtl.setPitch(deg * DEG), // ctx takes DEGREES, camera.js radians
        setOffset: (v) => cameraCtl.setOffset(v),
        shake: (intensity, durationS) => cameraCtl.shake(intensity, durationS),
        reset: () => cameraCtl.reset(),
      },
      physics: {
        raycast: (origin, dir, maxDist) => physics.raycast(origin, dir, maxDist),
        getContacts: () => physics.getContacts(),
        getStandingOn: () => physics.getStandingOn(),
        isGrounded: () => physics.isGrounded(),
        setGravity: (v) => physics.setGravity(v),
        getGravity: () => physics.getGravity(),
        setPartVelocity: (partId, v) => physics.setPartVelocity(partId, v),
      },
      parts: {
        create: (def) => parts.create(def),
        createMany: (defs) => parts.createMany(defs),
        get: (id) => parts.getPart(id),
        setPosition: (id, p) => parts.setPosition(id, p),
        setRotation: (id, r) => parts.setRotation(id, r),
        setColor: (id, hex) => parts.setColor(id, hex),
        setTransparency: (id, t) => parts.setTransparency(id, t),
        setCanCollide: (id, b) => parts.setCanCollide(id, b),
        remove: (id) => parts.remove(id),
        addCustom: (object3D) => parts.addCustom(object3D),
        count: () => parts.getStats().partCount,
      },
      audio: {
        playSfx: (name, opts) => audio.playSfx(name, opts),
        playMusic: (trackId, opts) => audio.playMusic(trackId, opts),
        stopMusic: (opts) => audio.stopMusic(opts),
        currentTrack: () => audio.currentTrack(),
        setSfxVolume: (v) => audio.setSfxVolume(v),
        setMusicVolume: (v) => audio.setMusicVolume(v),
      },
      input: {
        getMoveVector: () => input.getMoveVector(),
        isJumpHeld: () => input.isJumpHeld(),
        isDown: (action) => input.isDown(action),
        onAction: (action, fn) => input.onAction(action, fn),
      },
    },
    player: {
      avatar: rigRoot,
      position: () => feet(),
      velocity: () => physics.getVelocity(),
      respawn: () => physics.respawn(),
      teleport: (pos, yaw) => physics.teleport(pos, yaw),
      kill: (cause) => physics.kill(cause),
      setWalkSpeed: (n) => physics.setWalkSpeed(n),
      getWalkSpeed: () => physics.getWalkSpeed(),
      setJumpPower: (n) => physics.setJumpPower(n),
      getJumpPower: () => physics.getJumpPower(),
      setCheckpoint: (pos) => physics.setCheckpoint(pos),
    },
    services: {
      economy: economy.createCtxApi(),
      saves: saves.placeSaves(slug),
      badges: createBadgesCtxApi(slug),
      avatar: createAvatarCtxApi(),
      ui,
    },
    time: 0,
    events: emitter,
  };
}

// ---------------------------------------------------------------------------
// SECTION: Place lifecycle — spec 04 §5.6 (normative control flow) with spec 06
// §5.2.5's UI detail.
// ---------------------------------------------------------------------------

// The cross-Place bus. Deliberately NOT createEmitter(): every event republished here
// is already a platform event, and spec 04 §5.1's reserved-prefix guard would log its
// "game emitted reserved event" warning a second time for each one. Same on/once/off/
// emit/count/clear surface, minus that policing.
function createBus() {
  const map = new Map();
  const listeners = (name) => map.get(name) || [];
  const remove = (name, fn) => {
    const list = listeners(name).filter((f) => f !== fn);
    if (list.length) map.set(name, list);
    else map.delete(name);
  };
  const bus = {
    on(name, fn) {
      map.set(name, listeners(name).concat(fn));
      return () => remove(name, fn);
    },
    once(name, fn) {
      const wrapped = (payload) => {
        remove(name, wrapped);
        fn(payload);
      };
      return bus.on(name, wrapped);
    },
    off: remove,
    emit(name, payload) {
      for (const fn of listeners(name)) {
        try {
          fn(payload);
        } catch (err) {
          console.error("[oof] listener error", name, err);
        }
      }
    },
    count: () => [...map.values()].reduce((n, list) => n + list.length, 0),
    clear: () => map.clear(),
  };
  return bus;
}

// Services subscribe for the lifetime of the PLATFORM, not of one Place. Spec 07 §5.9
// step 4 hands them the fresh Place emitter on every transition, but spec 04 §5.5 step
// 4 then counts whatever is still registered on that emitter after game.dispose as a
// leak — and the shell console.errors leaks, which fails every smoke scenario. Both
// specs hold if services get a per-transition VIEW instead: `on` registers on the
// cross-Place bus (which republishes every Place event, see instrumentEmitter), `emit`
// reaches the live Place emitter, and teardown drops the whole view so subscriptions
// never stack across travels. Reported as a spec conflict.
function createServiceView() {
  const offs = [];
  const track = (off) => {
    offs.push(off);
    return off;
  };
  return {
    on: (name, fn) => track(platformBus.on(name, fn)),
    once: (name, fn) => track(platformBus.once(name, fn)),
    off: (name, fn) => platformBus.off(name, fn),
    emit: (name, payload) => (events ? events.emit(name, payload) : platformBus.emit(name, payload)),
    count: () => offs.length,
    clear() {
      for (const off of offs) off();
      offs.length = 0;
    },
  };
}

function instrumentEmitter(emitter) {
  const raw = emitter.emit;
  emitter.emit = (name, payload) => {
    const log = debugHandle.debug.eventLog;
    log.push({ name, payload, time: simTime });
    if (log.length > EVENT_LOG_MAX) log.shift();
    raw(name, payload);
    // Platform-level listeners (HUD, shell) outlive Places, so every Place event is
    // republished on the cross-Place bus (§5.2.5 step 6's "re-bridged" requirement).
    if (platformBus) platformBus.emit(name, payload);
  };
  return emitter;
}

function teardown() {
  if (!placeHandle) return;
  setState("disposing");
  events.emit("place:disposing", { slug: currentSlug });
  try {
    if (gameMod && typeof gameMod.dispose === "function") gameMod.dispose(ctx || debugHandle.ctx);
  } catch (err) {
    console.warn("[oof] game.dispose threw", currentSlug, err); // never blocks travel
  }
  const result = placeApi.disposePlace(placeHandle);
  // After the Place's own listeners are gone: the platform-level service view goes too
  // (its subscriptions live on the cross-Place bus, so disposePlace never sees them).
  if (serviceView) {
    serviceView.clear();
    serviceView = null;
  }
  debugHandle.lastLeaks = result.leaks;
  // A `geometries:` entry is not a leak: spec 03 §5.2's geometry cache deliberately
  // shares one BufferGeometry per shape ACROSS Places, and three.info.memory.geometries
  // only counts one once rendered — so the first dispose can never return to a baseline
  // taken before the first frame. Every other class is a real error (spec 04 §5.5).
  const hardLeaks = result.leaks.filter((s) => !String(s).startsWith("geometries:"));
  debugHandle.lastHardLeaks = hardLeaks;
  if (hardLeaks.length) console.error("[oof] dispose leaks", currentSlug, hardLeaks);
  placeHandle = null;
  gameMod = null;
  ctx = null;
  events = null;
  debugHandle.ctx = null;
  debugHandle.currentSlug = null;
  debugHandle.slug = null;
  currentSlug = null;
  if (hud) {
    hud.clearStats(); // HUD chips auto-clear on dispose (spec 04 §5.7)
    hud.setTitle(null);
  }
  physics.setEnabled(false);
  if (rigRoot) rigRoot.visible = false;
}

// goTo(slug) — spec 04 §5.6's transition algorithm.
async function goTo(slug) {
  // §5.6 step 1 keys "a load is in flight" off state === "loading"; a dedicated latch
  // is used instead because `state` is ALSO "loading" before the very first Place and
  // after a failed load (step 5 keeps it there until the error screen routes) — both
  // states where a transition must start, not queue.
  if (loadInFlight) {
    pendingSlug = slug;
    return;
  }
  if (slug === currentSlug && (state === "playing" || state === "hub")) return;
  const entry = placeEntry(slug);
  if (!entry) throw new Error("Unknown Place: " + slug);
  loadInFlight = true;
  try {
    await loadPlaceInto(entry, slug);
  } finally {
    loadInFlight = false;
  }
  const next = pendingSlug;
  pendingSlug = null;
  if (next !== null && next !== slug) await goTo(next);
}

// The body of one transition (§5.6 steps 2-7 / §5.2.5 steps 1-10). Returns after the
// Place is live, or after the error screen is up.
async function loadPlaceInto(entry, slug) {
  hideError();
  updateHalted = false;
  debugHandle.placeReady = false;
  transitionOverlay = miniLoading("Teleporting to " + entry.name + "…");
  sfx("teleport");
  teardown();
  setState("loading");

  events = instrumentEmitter(placeApi.createEmitter());
  // spec 07 §5.9 step 4: services are handed a fresh emitter on every transition.
  serviceView = createServiceView();
  saves.bindEvents(serviceView, slug);
  economy.bindEvents(serviceView, slug);
  badges.bindEvents(serviceView, slug);
  if (avatarService && typeof avatarService.bindEvents === "function") {
    avatarService.bindEvents(serviceView, slug);
  }
  physics.init({ audio, events, input, camera: cameraCtl });
  parts.init({ scene: renderer.scene, physics: physicsForParts, audio, events });
  physics.setEnabled(true);
  if (rigRoot) rigRoot.visible = true;

  const result = await withPlaceDataUrl(entry, () =>
    placeApi.loadPlace(slug, {
      scene: renderer.scene,
      rendererApi: renderer,
      partsApi,
      physics: physicsForPlace,
      audio,
      events,
    })
  );
  if (!result.ok) {
    finishTransition();
    showLoadError(entry, "E_LOAD", result.errors);
    return;
  }
  placeHandle = result.handle;
  currentSlug = slug;
  debugHandle.currentSlug = slug;
  debugHandle.slug = slug;

  // The follow camera adopts the Place's spawnYaw so it starts BEHIND the avatar.
  cameraCtl.setYaw((placeHandle.data.spawnYaw || 0) * DEG);

  const nextCtx = buildCtx(events, slug);
  debugHandle.ctx = nextCtx;
  let mod = null;
  try {
    mod = await import(entry.module);
    mod.init(nextCtx);
  } catch (err) {
    // spec 04 §5.6 step 7: an init throw runs the dispose steps before the screen.
    const code = mod ? "E_INIT" : "E_IMPORT";
    try {
      placeApi.disposePlace(placeHandle);
    } catch (disposeErr) {
      console.warn("[oof] dispose after failed init", slug, disposeErr);
    }
    placeHandle = null;
    ctx = null;
    debugHandle.ctx = null;
    finishTransition();
    showLoadError(entry, code, [String((err && err.stack) || err)]);
    return;
  }
  gameMod = mod;
  ctx = nextCtx;
  setState(slug === "hub" ? "hub" : "playing");

  writeHash(slug);
  markVisited(slug);
  // The registry never reaches a Place by import (validate forbids it), so the shell
  // publishes it on the Place emitter right after init — this is how the Hub builds
  // one portal per row. Payload documented in the task report as a spec gap: 06 §9
  // names the `platform:places` bridge but not its shape or direction.
  // `settings` rides along for the same reason: a Place's ctx.services.saves is
  // place-scoped (no door to the "profile" domain), and the Hub's §5.3.4 step 5 needs
  // profile.settings.ambience at boot — this one-shot bridge is the only way it can
  // reach it (hub/scripts/ambience.js's own task report flagged the gap; live changes
  // after boot already reach the Hub through platform:settingsChanged below).
  events.emit("platform:places", { places: getPlaces(), visited: visitedPlaces().slice(), settings: profileSettings() });
  // §5.2.5 step 10's payload is `{ slug }`; `name` rides along because §5.6.3 hangs
  // the HUD title on this same event and the HUD has no registry access.
  events.emit("platform:placeLoaded", { slug, name: slug === "hub" ? null : entry.name });
  finishTransition();
  debugHandle.placeReady = true;
}

function finishTransition() {
  if (transitionOverlay) transitionOverlay.hide();
  transitionOverlay = null;
}

function visitedPlaces() {
  const profile = saves.getDomain("profile");
  if (!Array.isArray(profile.visitedPlaces)) profile.visitedPlaces = [];
  return profile.visitedPlaces;
}

function markVisited(slug) {
  const visited = visitedPlaces();
  if (visited.includes(slug)) return;
  visited.push(slug);
  saves.markDirty("profile");
}

// ===== studio hooks (spec 11, M5) =====
// The whole of spec 11 §5.9's shell integration lives in this fence: the route
// pattern, the deps bag §5.1 step 1 requires, and goToStudio() itself. The other three
// §5.9 points are one line each and have to live where the machinery they hook already
// is (applyRoute/onHashChange below, and stepOnce/renderFrame in the loop section) —
// each of those call sites is commented back to this fence. Studio is still never
// imported at module scope; `studioMod` is only ever assigned inside goToStudio's own
// lazy `import()`, so Studio costs nothing on the boot path (§5.9 point 1 / §4).

let studioMod = null;     // src/platform/studio/studio.js, set on the first #/studio/... route
let studioEmitter = null; // stands in for "the Place's live emitter" in the deps bag below —
                           // Studio opens with no Place loaded, so there is no such emitter to
                           // hand it; a fresh placeApi.createEmitter() per open is what a real
                           // Place load would get too (loadPlaceInto's own `events`), it is just
                           // never bridged onto platformBus the way a Place's is, because nothing
                           // needs a Studio edit-mode event visible platform-wide.

const STUDIO_HASH_RE = /^#\/studio\/([a-z0-9]{8}|new)$/;

function studioRouteId(hash) {
  const m = STUDIO_HASH_RE.exec(hash || "");
  return m ? m[1] : null;
}

// The eight §5.1 step 1 keys — the SAME live objects loadPlaceInto hands a Place
// (`physics`/`partsApi` are the physicsForPlace/partsApi facades, not the raw engine
// modules) — plus two extras beyond that list (reported by src/platform/studio/**'s own
// task): `avatar` (rigRoot, so edit mode can hide it) and `camera` (cameraCtl, so
// physics can read a camera yaw during playtest and playtest's own contact events stay
// on its private sandbox emitter instead of a platform one).
function studioDeps() {
  return {
    scene: renderer.scene,
    rendererApi: renderer,
    physics: physicsForPlace,
    partsApi,
    audio,
    input,
    services: {
      economy: economy.createCtxApi(),
      // Unused today — store.js persists creations through saves.js directly, per its
      // own task's report — carried only for shape parity with a Place's ctx.services.
      saves: saves.placeSaves("studio"),
      badges: createBadgesCtxApi("studio"),
      avatar: createAvatarCtxApi(),
      ui,
    },
    events: studioEmitter,
    avatar: rigRoot,
    camera: cameraCtl,
  };
}

// goToStudio(id) — §5.9 point 1: dispose any active Place (the normal spec-04 §5.6
// path), enter state "studio", lazily import studio.js, open it. Mirrors goTo's own
// loadInFlight guard and pendingSlug drain so a Place nav and a Studio nav can never
// run their engine mutations (teardown, physics.init, scene builds) concurrently.
async function goToStudio(id) {
  if (loadInFlight) {
    // A Studio nav has nowhere to queue itself the way goTo's pendingSlug does (that
    // queue holds a Place slug, not a Studio id) — dropped rather than stranded. The
    // route stays in the address bar, so a manual retry (or browser back/forward)
    // still reaches it once the in-flight transition finishes.
    return;
  }
  loadInFlight = true;
  try {
    teardown(); // dispose any active Place — the same path goTo takes (spec 04 §5.6)
    setState("studio");
    debugHandle.currentSlug = null;
    debugHandle.slug = "studio";
    studioEmitter = placeApi.createEmitter();
    studioMod = await import("./studio/studio.js");
    await studioMod.openStudio({ id, deps: studioDeps() });
  } finally {
    loadInFlight = false;
  }
  // Drain anything a concurrent goTo() queued into pendingSlug while this ran (mirrors
  // goTo's own tail — see there for why the recursion happens outside the try/finally).
  const next = pendingSlug;
  pendingSlug = null;
  if (next !== null) await goTo(next);
}
// ===== end studio hooks =====

// ---------------------------------------------------------------------------
// SECTION: hash routing — spec 06 §5.2.4
// ---------------------------------------------------------------------------

const PLACE_HASH_RE = /^#\/place\/([a-z][a-z0-9-]{1,23})$/;

// Returns a known slug, or null for an unknown route/slug.
function routeSlug(hash) {
  const h = hash || "";
  if (h === "" || h === "#" || h === "#/" || h === "#/hub") return "hub";
  const m = PLACE_HASH_RE.exec(h);
  if (m && placeEntry(m[1])) return m[1];
  return null;
}

function writeHash(slug) {
  const want = slug === "hub" ? "#/hub" : "#/place/" + slug;
  if (location.hash !== want) {
    suppressNextHash = true;
    location.hash = want;
  }
  debugHandle.route = want;
}

function applyRoute() {
  const hash = location.hash;
  // studio hooks (spec 11 §5.9 point 1): a #/studio/<id> route never reaches
  // routeSlug/goTo — Studio is not a PLACES row, it is its own lifecycle.
  const studioId = studioRouteId(hash);
  if (studioId) {
    debugHandle.route = hash;
    return goToStudio(studioId);
  }
  const slug = routeSlug(hash);
  if (slug === null) {
    uiToast({ variant: "error", title: "Unknown place", body: hash });
    suppressNextHash = true;
    location.replace(location.pathname + location.search + "#/hub");
    debugHandle.route = "#/hub";
    return goTo("hub");
  }
  debugHandle.route = hash;
  return goTo(slug);
}

async function onHashChange() {
  if (suppressNextHash) {
    suppressNextHash = false;
    debugHandle.route = location.hash;
    return;
  }
  // studio hooks (spec 11 §5.9 point 3): leaving a Studio route for anything else
  // closes Studio first. By now `location.hash` already holds the NEW route (the
  // browser updates it before this event fires), so closeStudio()'s own routeToHub()
  // sees a non-Studio hash and no-ops — applyRoute() below is what actually routes.
  // closeStudio() itself no-ops if Studio is already closed, so this is safe to call
  // on every non-Studio hashchange rather than tracking "was Studio open" separately.
  if (studioMod && studioMod.isOpen() && !studioRouteId(location.hash)) {
    try {
      await studioMod.closeStudio();
    } catch (err) {
      console.warn("[oof] closeStudio failed", err);
    }
    studioEmitter = null;
  }
  applyRoute().catch(reportFatal);
}

// ---------------------------------------------------------------------------
// SECTION: the loop — spec 02 §5.1's canonical per-tick sequence
// ---------------------------------------------------------------------------

function stepOnce(dt) {
  physics.step(dt); // movers -> dynamics -> character -> contacts -> place routing
  simTime += dt;
  // studio hooks (spec 11 §5.9 point 2): no-op in edit mode; runs the Place's
  // behaviour tick in playtest. Character stepping is physics.step(dt) above, same as
  // any other Place — studio.js's own comment on simStep says as much.
  if (state === "studio" && studioMod) studioMod.simStep(dt);
  if (avatarService && typeof avatarService.update === "function") avatarService.update(dt);
  if (ctx && gameMod && !updateHalted) {
    ctx.time += dt;
    try {
      gameMod.update(dt, ctx);
    } catch (err) {
      // §7 criterion 24: a throwing update lands on the error screen, and the Place
      // stops updating so the screen is not rewritten 60 times a second.
      updateHalted = true;
      reportFatal(err);
    }
  }
  badges.tick(dt); // §5.7.4 playtime, accrued in sim seconds and flushed in chunks
  input.endStep();
  debugHandle.time = simTime;
}

function renderFrame(alpha, frameDt) {
  const t = physics.getRenderTransform(alpha);
  if (rigRoot) {
    rigRoot.position.set(t.position[0], t.position[1] - FEET_OFFSET, t.position[2]);
    rigRoot.rotation.y = t.yaw;
  }
  parts.applyInterpolation(alpha);
  cameraCtl.update(frameDt, t.position);
  if (rigRoot) renderer.setShadowTarget(rigRoot.position);
  // studio hooks (spec 11 §5.9 point 2): fly-cam integration/gizmo scaling/autosave
  // are frame-driven, never a timer (§5.1 step 6) — studio.frame() is what ticks them.
  // getActiveCamera() answers the fly cam in edit mode and null in playtest (and
  // always null when Studio is closed), where the shell's own follow camera renders —
  // exactly the "studio.getActiveCamera() ?? engineCamera" §5.9 point 2 asks for.
  if (state === "studio" && studioMod) studioMod.frame(frameDt);
  const activeCamera = (state === "studio" && studioMod && studioMod.getActiveCamera()) || cameraCtl.three;
  renderer.render(activeCamera);
  renderer.notifyFps(engineLoop.getStats().fps);
  if (fadeBootOnNextFrame) {
    fadeBootOnNextFrame = false;
    if (bootScreen) bootScreen.hide();
  }
}

function reportFatal(err) {
  showError(err);
}

// ---------------------------------------------------------------------------
// SECTION: boot — spec 06 §5.2.2 (7 steps, weights .30/.20/.10/.10/.15/.15)
// ---------------------------------------------------------------------------

function installErrorHandlers() {
  window.addEventListener("error", (ev) => {
    if (!ev || !ev.error) return; // resource-load failures are not app errors
    showError(ev.error);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    showError(ev && ev.reason ? ev.reason : new Error("Unhandled promise rejection"));
  });
}

// WebAudio needs a user gesture before it will start; unlock on the first one.
function installAudioUnlock() {
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    try {
      audio.init();
    } catch (err) {
      console.warn("[oof] audio unavailable", err);
    }
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);
}

function applyAccessibility(settings) {
  const prefers = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reduce = settings.reducedMotion === null || settings.reducedMotion === undefined
    ? prefers
    : !!settings.reducedMotion;
  document.body.classList.toggle("oof-reduced-motion", reduce);
  document.body.classList.toggle("oof-large-text", !!settings.largeText);
  document.body.classList.toggle("oof-left-handed", !!settings.leftHanded);
}

async function initServices() {
  const { warnings } = saves.initSaves();
  economy.initEconomy({ ui });
  badges.initBadges({ ui, economy });
  try {
    avatarService = await import("./services/avatar.js");
  } catch (err) {
    // SLICE: spec 05 §4's avatar service lands with the Catalog task; the placeholder
    // rig and the default-config ctx API above keep the platform playable until then.
    console.warn("[oof] avatar service not installed yet", err && err.message);
    avatarService = null;
  }

  const settings = profileSettings();
  renderer.setQuality(settings.quality);
  audio.setMusicVolume(settings.musicVol / 100);
  audio.setSfxVolume(settings.sfxVol / 100);

  if (avatarService && typeof avatarService.init === "function") {
    avatarService.init({ saves, economy, ui, events: platformBus, scene: renderer.scene, physics });
    playerRig = avatarService.getPlayerRig();
  } else {
    playerRig = buildPlaceholderRig();
    renderer.scene.add(playerRig.group);
  }
  rigRoot = playerRig.group || playerRig;
  physics.attachAvatar(rigRoot);
  physics.setEnabled(false); // nothing to stand on until a Place loads
  return warnings;
}

function buildUi(warnings) {
  injectTokens();
  applyAccessibility(profileSettings());
  toaster = createToaster();
  // §5.2.2 step 5's economy:changed -> pill wiring lives in the HUD itself, through
  // economy.onChange (the platform-side subscription that survives travel). The other
  // half of that step is badge:awarded -> the `badge` sfx, and ONLY the sfx: badges.js
  // owns the toast, so playing one here as well would double it.
  hud = createHud({ economy, avatar: hudAvatarAdapter(), audio, ui }, platformBus);
  platformBus.on("platform:navigate", (payload) => {
    if (payload && payload.slug) navigate(payload.slug);
  });
  // The loop spec's per-frame catch reports through this event; the shell routes it
  // to the same error screen uncaught errors use (spec 06 §5.2.6).
  platformBus.on("platform:fatalError", (payload) => showError(payload && payload.error));
  for (const warning of warnings || []) uiToast({ variant: "error", title: "Save problem", body: warning });
  // spec 07 §5.9 step 5: the daily claim re-runs when the tab comes back.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") claimDailyReward();
  });
}

// spec 07 §5.9 step 5. The shell is what joins economy to badges here, deliberately:
// §5.7.3 keeps the dependency one-way, so economy never learns that badges exist.
function claimDailyReward() {
  const daily = economy.claimDaily();
  if (daily && daily.claimed) {
    uiToast({ icon: "🎁", title: `Daily reward +${daily.amount} Oofbux`, body: `Day ${daily.streak}` });
    badges.checkStreak(daily.streak);
  }
}

function bootStep(index) {
  debugHandle.bootSteps = index;
  if (!bootScreen) return;
  const weight = BOOT_WEIGHTS.slice(0, Math.max(0, index - 1)).reduce((a, b) => a + b, 0);
  bootScreen.setProgress(weight);
}

export async function boot() {
  if (booted) return;
  booted = true;
  let stepName = "startup";
  try {
    installErrorHandlers();
    bootScreen = createBootScreen();
    bootStep(1);

    stepName = "three.js";
    THREE = await import("../../assets/vendor/three.module.js");
    bootStep(2);

    stepName = "engine";
    await importEngine();
    installAudioUnlock();
    bootStep(3);

    stepName = "services";
    const warnings = await initServices();
    bootStep(4);

    stepName = "interface";
    buildUi(warnings);
    bootStep(5);

    // SLICE: first-run onboarding (username card + reroll, 06 §5.6.6) is deferred; a
    // fresh profile already carries the generated "Oofer####" name (spec 07 §3.1), so
    // the boot simply continues into the route.
    stepName = "onboarding";
    bootStep(6);

    stepName = "first place";
    window.addEventListener("hashchange", onHashChange);
    try {
      await applyRoute();
    } finally {
      // The render loop deliberately does not run while the opaque boot screen covers
      // the canvas: rendering a near-empty scene at rAF rate while the first Place is
      // still being built steals the main thread from the build itself — measured
      // ~1.7 s of a cold boot where rasterization is software (a phone with no GPU
      // rasterizer, or SwiftShader under tools/smoke.js). Started from the finally so a
      // failed first route still leaves a live loop behind the error screen.
      engineLoop.start();
    }
    claimDailyReward(); // spec 07 §5.9 step 5, after the first Place finishes loading
    bootStep(BOOT_STEP_COUNT);
    if (bootScreen) bootScreen.setProgress(1);
    fadeBootOnNextFrame = true; // faded on the loop's next rendered frame (§5.2.2)
  } catch (err) {
    if (bootScreen) bootScreen.hide();
    showError(new Error(`Boot failed at step "${stepName}": ${(err && err.message) || err}`), {
      details: String((err && err.stack) || err),
    });
  }
}

// ---------------------------------------------------------------------------
// SECTION: public API — spec 06 §4
// ---------------------------------------------------------------------------

export function getPlaces() {
  return PLACES.map((p) => Object.freeze({ ...p }));
}

export function getCurrentSlug() {
  return currentSlug;
}

export function navigate(slug) {
  return goTo(slug).catch(reportFatal);
}

// ---------------------------------------------------------------------------
// SECTION: smoke-only hooks — spec 12 §3.7 (state-mutating hooks gated on ?smoke=1)
// ---------------------------------------------------------------------------

if (smokeMode) {
  debugHandle.teleport = (pos, yaw) => {
    physics.teleport(pos, yaw);
    return feet();
  };
  debugHandle.grant = (n) => economy.award(n, "smoke:grant");
  debugHandle.balance = () => economy.getBalance();
  debugHandle.hasBadge = (id) => (ctx ? ctx.services.badges.has(id) : false);
  debugHandle.clearEvents = () => {
    debugHandle.debug.eventLog.length = 0;
  };
  debugHandle.exportCode = () => saves.exportSaveCode();
  debugHandle.importCode = (code) => saves.importSaveCode(code);
  // Exact-tick stepping. Spec 03 §8's probes are specified in SIM TICKS, which a
  // rAF-driven loop cannot deliver: waiting on the sim clock always overshoots by a
  // frame's worth of steps. This pauses the loop, runs exactly `steps` iterations of
  // the same per-tick sequence the loop calls (real input included), then resumes.
  debugHandle.script = (steps) => {
    const n = Math.max(1, Math.min(SCRIPT_STEPS_MAX, Math.floor(steps) || 0));
    const wasPaused = engineLoop.isPaused();
    engineLoop.pause();
    const start = feet();
    let maxY = start[1];
    let minY = start[1];
    let leftGround = -1;
    let regroundStep = -1;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      stepOnce(1 / 60);
      const p = feet();
      if (p[1] > maxY) maxY = p[1];
      if (p[1] < minY) minY = p[1];
      const grounded = physics.isGrounded();
      if (!grounded && leftGround < 0) leftGround = i;
      if (grounded && leftGround >= 0 && regroundStep < 0) regroundStep = i;
    }
    const elapsedMs = performance.now() - t0;
    if (!wasPaused) engineLoop.resume();
    const end = feet();
    return {
      steps: n,
      start,
      end,
      maxY,
      minY,
      rise: maxY - start[1],
      planar: Math.hypot(end[0] - start[0], end[2] - start[2]),
      leftGround,
      regroundStep,
      grounded: physics.isGrounded(),
      velocity: physics.getVelocity(),
      time: simTime,
      avgStepMs: elapsedMs / n,
    };
  };
}

boot();
