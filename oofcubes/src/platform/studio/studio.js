// src/platform/studio/studio.js — Oof Studio's entry point: the closed → edit ⇄
// playtest state machine, the top and tool bars, the share dialog, and the playtest
// round trip. Spec 11 §5.1, §5.6.1, §5.7's dialogs, §5.8.
//
// The shell lazily import()s this module the first time the #/studio/... route fires,
// so none of Studio is on the boot path (§4).
//
// Style note: see palette.js's header for why every colour is var(name, fallback).

import * as placeApi from "../../engine/place.js";
import * as store from "./store.js";
import { createFlyCam } from "./flycam.js";
import { createEditor } from "./editor.js";
import { createPalette } from "./palette.js";
import { createPropPanel } from "./proppanel.js";
import { createWorldPanel, mergePlaceLighting } from "./worldpanel.js";

// ---- tuning constants, spec 11 §6 -------------------------------------------------
const AUTOSAVE_MS = 30000;
const NARROW_BREAKPOINT = 720;
const TOP_BAR_H = 48;
const NAME_MAX = 24;
const MAX_DIALOG_MESSAGES = 10; // §5.7: at most ten messages in an error dialog

const PANEL = "var(--oof-panel, rgba(20,24,34,.92))";
const PANEL2 = "var(--oof-panel-2, rgba(34,40,54,.92))";
const TEXT = "var(--oof-text, #fff)";
const MUTED = "var(--oof-muted, rgba(255,255,255,.55))";
const ACCENT = "var(--oof-accent, #4aa8ff)";
const LINE = "var(--oof-ui-line, rgba(255,255,255,.18))";
const ON_ACCENT = "#0c0e14";
const DANGER = "#e5484d";

const REQUIRED_DEPS = ["scene", "rendererApi", "physics", "partsApi", "audio", "input", "services", "events"];

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

const CHIP = "height:36px;padding:0 14px;border-radius:10px;border:1px solid " + LINE
  + ";background:" + PANEL2 + ";color:" + TEXT + ";font-family:inherit;font-size:13px;cursor:pointer;";
const SQUARE = "width:40px;height:40px;border-radius:10px;border:1px solid " + LINE
  + ";background:" + PANEL2 + ";color:" + TEXT + ";font-family:inherit;font-size:16px;cursor:pointer;padding:0;";
const TOOL = "width:48px;height:48px;border-radius:12px;border:1px solid " + LINE
  + ";background:" + PANEL2 + ";color:" + TEXT + ";font-family:inherit;font-size:18px;cursor:pointer;padding:0;";

// ---- module state ------------------------------------------------------------------
let state = "closed"; // closed | edit | playtest
let deps = null;
let doc = null;
let flycam = null;
let editor = null;
let palette = null;
let props = null;
let worldPanel = null;
let root = null; // #oof-studio
let bars = null; // { top, tools, name, undo, redo, grid, counter, saved, playtest }
let playtest = null; // { handle, emitter, sandbox, frozen }
let lastSaveTime = 0;
let narrow = false;
let hudDisplayBefore = null;
let unsubscribes = [];
let saveFailed = false; // a save threw; suppresses the toast until one succeeds again

// The shelf can open the share dialog with Studio closed (§5.10), so the services it
// needs arrive as an argument in that case rather than from the open-Studio deps.
let fallbackServices = null;

function ui() {
  if (deps && deps.services && deps.services.ui) return deps.services.ui;
  return (fallbackServices && fallbackServices.ui) || null;
}

function toast(text) {
  const u = ui();
  if (u && u.toast) u.toast(text);
}

function sfx(name, opts) {
  if (deps && deps.audio) deps.audio.playSfx(name, opts);
}

// The platform HUD (spec 06) is a fixed 44 px strip at z 100, and §5.6's Studio root is
// z 90 — so the Oofbux pill would sit ON TOP of the Share and Test buttons. Studio is a
// full-screen tool with its own chrome, so the HUD is hidden for its lifetime and put
// back exactly as it was. JUDGEMENT CALL: reported so the shell owner can take it over.
function hideHud(hide) {
  const hud = document.getElementById("oof-hud");
  if (!hud) return;
  if (hide) {
    if (hudDisplayBefore === null) hudDisplayBefore = hud.style.display;
    hud.style.display = "none";
  } else if (hudDisplayBefore !== null) {
    hud.style.display = hudDisplayBefore;
    hudDisplayBefore = null;
  }
}

function saveNow() {
  if (!doc || !editor) return;
  // The fly cam pose is editor-only state (§3.1 doc.editor) and lives in flycam until
  // a save asks for it, so the next open drops you back where you were standing.
  if (flycam) {
    const pose = flycam.getPose();
    doc.editor.camPos = pose.pos;
    doc.editor.camYaw = Math.round(pose.yaw * 100) / 100;
    doc.editor.camPitch = Math.round(pose.pitch * 100) / 100;
  }
  try {
    store.saveCreation(doc);
    editor.clearDirty();
    lastSaveTime = performance.now();
    saveFailed = false;
    showSavedChip();
  } catch (err) {
    // lastSaveTime advances even on FAILURE, and it has to. Autosave is frame-driven
    // (`isDirty() && now - lastSaveTime > AUTOSAVE_MS`), the doc stays dirty when a save
    // throws, and the throw is not transient — saves.js refuses any Place envelope over
    // its own SAVE_MAX_BYTES, which a big creation is over permanently. Leaving
    // lastSaveTime behind therefore re-ran this whole path (two full JSON.stringify of
    // the doc, a console.error and a toast) on EVERY render frame, forever. Backing off
    // to the normal interval keeps the editor usable and still retries.
    lastSaveTime = performance.now();
    console.error("[oof] Oof Studio could not save", err);
    if (!saveFailed) {
      saveFailed = true;
      toast(describeSaveError(err));
    }
    showSaveFailedChip();
  }
}

// The saves layer's refusal reason matters to the builder: "too big" is something they
// can act on (delete parts), anything else is not.
function describeSaveError(err) {
  const message = err && err.message ? String(err.message) : "";
  if (/too large|too big/i.test(message)) return "This Place is too big to save — delete some parts";
  return "Could not save this Place";
}

function saveIfDirty() {
  if (editor && editor.isDirty()) saveNow();
}

function showSavedChip() {
  if (!bars || !bars.saved) return;
  bars.saved.textContent = "Saved";
  // A one-second fade with no timer: §7 criterion 21 bans scheduled callbacks in Studio,
  // and the Web Animations API is the timer-free way to run a fixed-duration effect.
  bars.saved.style.color = MUTED;
  bars.saved.style.opacity = "0";
  if (typeof bars.saved.animate === "function") {
    bars.saved.animate([{ opacity: 1 }, { opacity: 1 }, { opacity: 0 }], { duration: 1000, fill: "forwards" });
  }
}

// The failure counterpart: it does NOT fade, because "this Place is not being saved any
// more" is a state, not an event, and the builder has to be able to see it at any moment.
function showSaveFailedChip() {
  if (!bars || !bars.saved) return;
  if (typeof bars.saved.getAnimations === "function") {
    for (const animation of bars.saved.getAnimations()) animation.cancel();
  }
  bars.saved.textContent = "Not saved";
  bars.saved.style.color = DANGER;
  bars.saved.style.opacity = "1";
}

// ---- layout ------------------------------------------------------------------------

function isNarrow() {
  return window.innerWidth < NARROW_BREAKPOINT;
}

function onResize() {
  const next = isNarrow();
  if (next === narrow) return;
  narrow = next;
  if (palette) palette.setNarrow(narrow);
  if (props) props.setNarrow(narrow);
  if (worldPanel) worldPanel.setNarrow(narrow);
  layoutToolBar();
  if (flycam) flycam.resize();
}

// ---- top bar (§5.6.1) ---------------------------------------------------------------

function buildTopBar() {
  const top = el("div", "position:absolute;left:0;right:0;top:0;height:" + TOP_BAR_H + "px;"
    + "background:" + PANEL + ";border-bottom:1px solid " + LINE + ";display:flex;gap:8px;"
    + "align-items:center;padding:0 8px;pointer-events:auto;box-sizing:border-box;");
  top.id = "oof-studio-topbar";

  const back = el("button", SQUARE, "←");
  back.title = "Back to the Hub";
  back.addEventListener("click", () => {
    closeStudio();
  });

  const name = el("input", "width:150px;min-width:80px;flex-shrink:1;height:32px;border-radius:8px;"
    + "border:1px solid " + LINE + ";background:" + PANEL2 + ";color:" + TEXT + ";font-size:14px;"
    + "padding:0 8px;font-family:inherit;");
  name.value = doc.name;
  name.setAttribute("aria-label", "Place name");
  const commitName = () => {
    const text = name.value.trim().slice(0, NAME_MAX);
    if (text.length === 0) {
      name.value = doc.name; // empty reverts (§5.6.1)
      return;
    }
    if (text !== doc.name) editor.applyWorld("name", text);
    name.value = text;
  };
  name.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") name.blur();
  });
  name.addEventListener("blur", commitName);

  const undo = el("button", SQUARE, "↶");
  undo.title = "Undo";
  undo.addEventListener("click", () => editor.undo());
  const redo = el("button", SQUARE, "↷");
  redo.title = "Redo";
  redo.addEventListener("click", () => editor.redo());

  const grid = el("button", SQUARE, "1");
  grid.title = "Grid size";
  grid.addEventListener("click", () => editor.cycleGrid());

  const counter = el("div", "font-size:12px;color:" + MUTED + ";white-space:nowrap;");
  const saved = el("div", "font-size:12px;color:" + MUTED + ";opacity:0;");

  const spacer = el("div", "flex:1;");

  const share = el("button", CHIP, "Share");
  share.addEventListener("click", () => openShareDialog());

  const test = el("button", CHIP + "background:" + ACCENT + ";color:" + ON_ACCENT + ";font-weight:700;",
    "▶ Test");
  test.addEventListener("click", () => enterPlaytest());

  top.append(back, name, undo, redo, grid, counter, saved, spacer, share, test);
  root.appendChild(top);
  return { top, name, undo, redo, grid, counter, saved, share, test };
}

const GRID_LABELS = { 1: "1", 0.5: "½", 0.25: "¼" };

function refreshTopBar() {
  if (!bars || state !== "edit") return;
  const canUndo = editor.stack.canUndo();
  const canRedo = editor.stack.canRedo();
  bars.undo.style.opacity = canUndo ? "1" : "0.35";
  bars.redo.style.opacity = canRedo ? "1" : "0.35";
  bars.undo.disabled = !canUndo;
  bars.redo.disabled = !canRedo;
  bars.grid.textContent = GRID_LABELS[editor.getGrid()] || "1";
  const count = editor.partCount();
  bars.counter.textContent = count + " / " + editor.maxParts;
  bars.counter.style.color = count >= 480 ? DANGER : MUTED;
  if (document.activeElement !== bars.name && bars.name.value !== doc.name) bars.name.value = doc.name;
}

// ---- tool bar (§5.6.1) ---------------------------------------------------------------

const TOOLS = [
  { id: "select", icon: "⬚", title: "Select (1)" },
  { id: "move", icon: "✥", title: "Move (2)" },
  { id: "rotate", icon: "⟳", title: "Rotate (3)" },
  { id: "scale", icon: "⤢", title: "Stretch (4)" },
];

function buildToolBar() {
  const tools = el("div", "");
  tools.id = "oof-studio-tools";
  root.appendChild(tools);

  const buttons = new Map();
  for (const entry of TOOLS) {
    const btn = el("button", TOOL, entry.icon);
    btn.title = entry.title;
    btn.addEventListener("click", () => {
      editor.setTool(entry.id);
      if (palette) palette.setArmed(null);
    });
    tools.appendChild(btn);
    buttons.set(entry.id, btn);
  }
  const del = el("button", TOOL, "🗑");
  del.title = "Delete selection";
  del.addEventListener("click", () => editor.removeSelected());
  const dup = el("button", TOOL, "⧉");
  dup.title = "Duplicate selection";
  dup.addEventListener("click", () => editor.duplicateSelected());
  tools.append(del, dup);

  let multi = null;
  if (flycam.isTouchLayout()) {
    multi = el("button", TOOL, "＋");
    multi.title = "Select more than one";
    multi.addEventListener("click", () => {
      editor.setMultiSelectMode(!editor.getMultiSelectMode());
      refreshToolBar();
    });
    tools.appendChild(multi);
  }
  bars = Object.assign(bars || {}, { tools, toolButtons: buttons, multi });
  layoutToolBar();
}

function layoutToolBar() {
  if (!bars || !bars.tools) return;
  bars.tools.setAttribute("style", narrow
    ? "position:absolute;left:50%;transform:translateX(-50%);bottom:8px;display:flex;"
      + "flex-direction:row;gap:6px;pointer-events:auto;"
    : "position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:6px;"
      + "pointer-events:auto;");
}

function refreshToolBar() {
  if (!bars || !bars.toolButtons) return;
  for (const [id, btn] of bars.toolButtons) {
    const on = editor.getTool() === id && !editor.getArmedShape();
    btn.style.background = on ? ACCENT : PANEL2;
    btn.style.color = on ? ON_ACCENT : TEXT;
  }
  if (bars.multi) {
    const on = editor.getMultiSelectMode();
    bars.multi.style.background = on ? ACCENT : PANEL2;
    bars.multi.style.color = on ? ON_ACCENT : TEXT;
    bars.multi.setAttribute("aria-pressed", on ? "true" : "false");
  }
}

// ---- share / error dialogs (§5.7) ----------------------------------------------------

function messageList(messages) {
  const body = el("div", "display:flex;flex-direction:column;gap:4px;max-height:200px;overflow-y:auto;");
  for (const message of messages.slice(0, MAX_DIALOG_MESSAGES)) {
    body.appendChild(el("div", "font-size:12px;color:" + DANGER + ";", message));
  }
  if (messages.length > MAX_DIALOG_MESSAGES) {
    body.appendChild(el("div", "font-size:11px;color:" + MUTED + ";",
      "…and " + (messages.length - MAX_DIALOG_MESSAGES) + " more"));
  }
  return body;
}

function copyToClipboard(text, area) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast("Copied!"), () => fallbackCopy(area));
    return;
  }
  fallbackCopy(area);
}

function fallbackCopy(area) {
  try {
    area.select();
    document.execCommand("copy");
    toast("Copied!");
  } catch (err) {
    console.warn("[oof] clipboard unavailable", err);
    toast("Select the code and copy it");
  }
}

// openShareDialog() — the Share button and the shelf both land here (§5.7).
export function openShareDialog(creationId, services) {
  if (services) fallbackServices = services;
  const u = ui();
  const id = creationId || (doc && doc.id);
  if (!id) return;
  if (editor && editor.isDirty()) saveNow();

  const result = store.exportCode(id);
  if (result.error) {
    const messages = result.messages || [describeExportError(result)];
    if (u && u.dialog) u.dialog({ title: "Can't share yet", bodyEl: messageList(messages) });
    sfx("error");
    return;
  }

  const body = el("div", "display:flex;flex-direction:column;gap:8px;");
  const area = el("textarea", "width:100%;height:96px;font-family:monospace;font-size:11px;"
    + "background:" + PANEL2 + ";color:" + TEXT + ";border:1px solid " + LINE + ";border-radius:8px;"
    + "padding:6px;box-sizing:border-box;");
  area.value = result.code;
  area.readOnly = true;
  const copy = el("button", CHIP, "Copy");
  copy.addEventListener("click", () => copyToClipboard(result.code, area));
  body.append(
    el("div", "font-size:12px;color:" + MUTED + ";",
      "Send this code to a friend. They paste it into My Places and play your Place."),
    area,
    copy,
  );
  if (u && u.dialog) u.dialog({ title: "Share code", bodyEl: body });
  if (result.granted) {
    toast("＋200 Oofbux — published!");
    sfx("purchase");
  }
}

function describeExportError(result) {
  if (result.error === "toobig") return "This Place is too big to share (" + result.length + " characters).";
  if (result.error === "missing") return "That Place could not be found.";
  return result.message || "Something went wrong building the code.";
}

// ---- playtest (§5.8) -----------------------------------------------------------------

// Sandbox services. Playtest must not touch real progression (§5.8 step 4, binding):
// collecting a hundred Oofbux in your own test world would be a money printer.
function buildSandbox(emitter) {
  let balance = 0;
  const memory = {};
  const economy = {
    balance: () => balance,
    getBalance: () => balance,
    canAfford: (n) => balance >= n,
    award(amount) {
      balance += Math.max(0, Math.trunc(amount) || 0);
      emitter.emit("economy:changed", { balance, delta: amount });
      return balance;
    },
    spend(amount) {
      if (balance < amount) return false;
      balance -= amount;
      emitter.emit("economy:changed", { balance, delta: -amount });
      return true;
    },
    onChange: () => () => {},
  };
  const badges = { award: () => false, has: () => false, list: () => [] };
  const saves = {
    load: () => (memory.data === undefined ? null : JSON.parse(JSON.stringify(memory.data))),
    save(obj) { memory.data = JSON.parse(JSON.stringify(obj)); },
    clear() { delete memory.data; },
  };
  return { economy, badges, saves, getBalance: () => balance };
}

function buildPlaytestBar(name, sandbox) {
  const bar = el("div", "position:absolute;left:50%;transform:translateX(-50%);top:8px;"
    + "background:" + PANEL + ";border:1px solid " + LINE + ";border-radius:12px;height:40px;"
    + "display:flex;align-items:center;gap:10px;padding:0 10px;pointer-events:auto;");
  bar.id = "oof-studio-playbar";
  bar.appendChild(el("div", "font-size:12px;color:" + MUTED + ";", "Testing — " + name));
  const readout = el("div", "font-size:13px;color:" + TEXT + ";", "⬡ 0");
  bar.appendChild(readout);
  const stop = el("button", CHIP + "background:" + ACCENT + ";color:" + ON_ACCENT + ";font-weight:700;",
    "◼ Stop");
  stop.addEventListener("click", () => exitPlaytest());
  bar.appendChild(stop);
  root.appendChild(bar);
  return { bar, readout, sandbox };
}

// enterPlaytest() -> bool — §5.8's six steps.
export function enterPlaytest() {
  if (state !== "edit") return false;
  saveIfDirty();

  const check = store.validateForPlay(doc);
  if (!check.ok) {
    const u = ui();
    if (u && u.dialog) u.dialog({ title: "Can't test yet", bodyEl: messageList(check.messages) });
    sfx("error");
    return false;
  }
  if (typeof placeApi.loadPlaceData !== "function") {
    // §2/§5.8 require an additive `loadPlaceData(data, deps)` export on
    // src/engine/place.js, landed by the spec-04 amendment. Until it does, editing and
    // sharing work and only Test is unavailable — with an honest message rather than a
    // thrown error. Reported with this task.
    toast("Testing needs the engine update (loadPlaceData)");
    sfx("error");
    return false;
  }

  // Freeze the editor rather than tearing it down: selection, tool, camera pose and the
  // whole undo stack survive the round trip (§5.8 step 2).
  const frozen = {
    selection: editor.selection(),
    tool: editor.getTool(),
    pose: flycam.getPose(),
  };
  editor.teardownVisuals();
  deps.partsApi.clear();
  setEditUiVisible(false);
  flycam.setEnabled(false);
  if (worldPanel) worldPanel.stopPreview();

  const emitter = placeApi.createEmitter();
  const sandbox = buildSandbox(emitter);
  // parts.js dispatches behaviour events into whatever emitter it was inited with, so
  // it is re-pointed at the playtest emitter here and restored on exit — that is what
  // keeps a test collectible out of the real ledger.
  deps.partsApi.init({ scene: deps.scene, physics: deps.physics, audio: deps.audio, events: emitter });
  if (deps.camera) {
    deps.physics.init({ audio: deps.audio, events: emitter, input: deps.input, camera: deps.camera });
  }

  const result = placeApi.loadPlaceData(check.placeData, {
    scene: deps.scene,
    rendererApi: deps.rendererApi,
    partsApi: deps.partsApi,
    physics: deps.physics,
    audio: deps.audio,
    events: emitter,
    services: sandbox,
  });
  if (!result || !result.ok) {
    toast("Could not start the test");
    restoreEditAfterPlaytest(frozen, emitter);
    return false;
  }

  deps.physics.setEnabled(true);
  if (deps.avatar) deps.avatar.visible = true;
  // §5.8 step 6 says to start the music, but loadPlaceData already did it one line
  // above (spec 04 §5.3 step 10, with a 500ms fade). Repeating it restarts the track
  // without the fade — audible, and the kind of thing that reads as a glitch. Only
  // start it here when the Place load would not have.
  if (!check.placeData.music) deps.audio.playMusic(null);

  playtest = { handle: result.handle, emitter, frozen, sandbox };
  const bar = buildPlaytestBar(doc.name, sandbox);
  playtest.bar = bar;
  // Both of these unsubs are captured, because disposePlace counts live listeners
  // BEFORE the emitter is cleared and reports any survivor as a leak (§5.8 exit 1
  // asserts []). A listener registered here and torn down later is still a leak at
  // the moment it is measured.
  playtest.unsubs = [
    emitter.on("economy:changed", () => {
      bar.readout.textContent = "⬡ " + sandbox.getBalance();
    }),
    // The collectible payout bridge. The engine deliberately never pays out itself
    // (spec 04 §3.2: "the engine never imports platform code"), and the real path is
    // spec 07's economy.bindEvents, which the shell calls for real Places and nobody
    // was calling for the sandbox — so a collectible picked up in playtest emitted and
    // the bar stayed on 0. This is the sandbox's stand-in for that bridge.
    emitter.on("collectible:collected", (p) => {
      if (p && p.kind === "oofbux") sandbox.economy.award(p.value);
    }),
  ];
  state = "playtest";
  return true;
}

// exitPlaytest() -> bool — §5.8's exit steps.
export function exitPlaytest() {
  if (state !== "playtest" || !playtest) return false;
  const { handle, emitter, frozen } = playtest;
  // Before disposePlace, not after: it reads events.count() as its leak measurement,
  // so anything still subscribed at that instant is reported as a leak even though
  // restoreEditAfterPlaytest clears the emitter moments later.
  for (const off of playtest.unsubs || []) {
    if (typeof off === "function") off();
  }
  const result = placeApi.disposePlace(handle);
  if (result && result.leaks && result.leaks.length) {
    console.warn("[oof] studio playtest dispose leaks", result.leaks);
  }
  if (playtest.bar) playtest.bar.bar.remove();
  playtest = null;
  restoreEditAfterPlaytest(frozen, emitter);
  return true;
}

function restoreEditAfterPlaytest(frozen, emitter) {
  if (emitter) emitter.clear();
  // Hand parts.js and physics.js their real emitter back before anything else can fire.
  deps.partsApi.init({
    scene: deps.scene, physics: deps.physics, audio: deps.audio, events: deps.events,
  });
  if (deps.camera) {
    deps.physics.init({ audio: deps.audio, events: deps.events, input: deps.input, camera: deps.camera });
  }
  deps.physics.setEnabled(false);
  if (deps.avatar) deps.avatar.visible = false;
  deps.audio.playMusic(null);

  editor.rebuildScene();
  if (frozen) {
    editor.setTool(frozen.tool);
    editor.setSelection(frozen.selection);
    flycam.setPose(frozen.pose);
  }
  // disposePlace restores the engine's default lighting, so the doc's own lighting is
  // re-applied to keep edit mode looking like the Place it is building (§5.8 exit 5).
  deps.rendererApi.applyLighting(mergePlaceLighting(doc.world.lighting));
  flycam.setEnabled(true);
  setEditUiVisible(true);
  state = "edit";
  refreshAll();
}

function setEditUiVisible(visible) {
  for (const node of [bars && bars.top, bars && bars.tools, palette && palette.el,
    document.getElementById("oof-studio-world-btn")]) {
    if (node) node.style.display = visible ? "" : "none";
  }
  // The property and world panels own their own visibility (a panel with nothing
  // selected, or a world panel nobody opened, must stay hidden). Hide them directly on
  // the way out, and let them re-decide on the way back in.
  if (!visible) {
    if (props) props.el.style.display = "none";
    if (worldPanel) worldPanel.el.style.display = "none";
  } else {
    if (props) props.refresh(true);
    if (worldPanel) worldPanel.refresh();
  }
}

// ---- the per-frame and per-step hooks the shell calls (§5.9) -------------------------

// frame(frameDt) — render-frame work: fly cam integration, gizmo scaling, autosave.
export function frame(frameDt) {
  if (state === "closed") return;
  if (state === "edit") {
    flycam.frame(frameDt || 0);
    editor.frame();
    // Autosave is frame-driven, never a timer (§5.1 step 6, §7 criterion 21).
    if (editor.isDirty() && performance.now() - lastSaveTime > AUTOSAVE_MS) saveNow();
  }
}

// simStep(dt) — no-op in edit mode; runs the Place's behaviour tick in playtest. The
// character controller is stepped by the shell's own physics.step(dt), as always.
export function simStep(dt) {
  if (state === "playtest" && playtest && playtest.handle
      && typeof playtest.handle.step === "function") {
    playtest.handle.step(dt);
  }
}

// getActiveCamera() — the shell renders through this while its state is "studio".
export function getActiveCamera() {
  return state === "edit" && flycam ? flycam.three : null;
}

export function isOpen() {
  return state !== "closed";
}

export function getState() {
  return state;
}

// ---- open / close (§5.1) --------------------------------------------------------------

function refreshAll() {
  refreshTopBar();
  refreshToolBar();
  if (props) props.refresh();
  if (palette) palette.setArmed(editor.getArmedShape());
}

// Only steer back to the Hub when the browser is still sitting on a Studio route. The
// shell calls closeStudio() on its way to WHATEVER route the player asked for (§5.9
// point 3), and an unconditional hash write here would drag them to the Hub instead.
function routeToHub() {
  if (!location.hash.startsWith("#/studio/")) return;
  location.hash = "#/hub";
}

// openStudio({ id, deps }) -> Promise<void>
export async function openStudio(options) {
  const nextDeps = options && options.deps;
  if (!nextDeps || REQUIRED_DEPS.some((key) => !nextDeps[key])) {
    throw new TypeError("studio: incomplete deps");
  }
  if (state !== "closed") await closeStudio();
  deps = nextDeps;

  const id = options.id;
  const loaded = id === "new" ? store.createCreation() : store.getCreation(id);
  if (!loaded || loaded.error) {
    toast(loaded && loaded.error === "limit"
      ? "Place limit reached (" + store.STUDIO_LIMITS.maxCreations + ")"
      : "Place not found");
    deps = null;
    routeToHub();
    return;
  }
  doc = loaded;

  // Everything below mutates the page — a full-viewport stage layer, a hidden HUD,
  // disabled physics — before `state` ever becomes "edit". A throw partway through used
  // to strand all of it with no way back, because closeStudio() refuses to run while
  // state is still "closed" and the z-60 stage swallows every pointer on the page.
  // teardownAll() puts things back from whatever stage the build reached.
  try {
    buildStudio(id);
  } catch (err) {
    console.error("[oof] Oof Studio failed to open", err);
    teardownAll();
    toast("Could not open this Place");
    routeToHub();
  }
}

// buildStudio(id) — the edit scene, the fly cam, the panels and the listeners. Split out
// of openStudio only so all of it sits inside that one try/catch.
function buildStudio(id) {
  // Edit mode is not simulation and it is silent: no character stepping, no avatar,
  // no music (§5.1 step 3, binding).
  deps.physics.setEnabled(false);
  if (deps.avatar) deps.avatar.visible = false;
  deps.audio.playMusic(null);
  // SPEC AMENDMENT (§5.1 step 4, amended in this change): step 4 said
  // `applyLighting(doc.world.lighting ?? {})`, which resolves every missing field
  // against renderer.js's engine defaults (skyTop #4aa8ff) while a real Place load
  // merges spec 04 §3.3's table (#87ceeb) first. Edit mode and playtest lit the same
  // world differently, and the world panel's Day card matched only the playtest one.
  deps.rendererApi.applyLighting(mergePlaceLighting(doc.world.lighting));
  hideHud(true);

  narrow = isNarrow();
  root = el("div", "position:absolute;inset:0;z-index:90;pointer-events:none;"
    + "font-family:var(--oof-font-stack, system-ui, sans-serif);color:" + TEXT + ";");
  root.id = "oof-studio";
  document.body.appendChild(root);

  flycam = createFlyCam({
    dom: document.body,
    renderer: deps.rendererApi,
    isTouch: deps.input && deps.input.isTouch ? () => deps.input.isTouch() : undefined,
  });
  flycam.setPose({ pos: doc.editor.camPos, yaw: doc.editor.camYaw, pitch: doc.editor.camPitch });
  // A brand-new creation opens looking at its own baseplate — see flycam.lookAt for
  // why the stored §3.1 yaw cannot do that itself. Every later open uses the pose the
  // last save recorded, which is a real one.
  if (id === "new") flycam.lookAt([0, 0, 0]);

  editor = createEditor(doc, {
    scene: deps.scene,
    rendererApi: deps.rendererApi,
    partsApi: deps.partsApi,
    audio: deps.audio,
    ui: ui(),
    flycam,
    onDirty: () => {
      // A frame-driven check still needs a nudge on the very first edit after a save,
      // so the "Saved" chip and the 30 s window both start from a real event.
      if (performance.now() - lastSaveTime > AUTOSAVE_MS) saveNow();
    },
    getPlaceDefaults: () => palette.getDefaults(),
    getPlaceSize: (shape) => palette.defaultSizeFor(shape),
  });

  bars = buildTopBar();
  palette = createPalette(root, {
    partsApi: deps.partsApi,
    narrow,
    onArm: (shape) => {
      editor.armPlace(shape);
      refreshToolBar();
    },
    onApplyColor: (hex) => editor.applyProps(editor.selection(), "color", hex),
    onApplyMaterial: (name) => editor.applyProps(editor.selection(), "material", name),
    getSelectionCount: () => editor.selection().filter((sid) => sid !== editor.spawnId).length,
  });
  props = createPropPanel(root, { editor, partsApi: deps.partsApi, narrow });
  worldPanel = createWorldPanel(root, { editor, audio: deps.audio, narrow });
  buildToolBar();

  unsubscribes.push(editor.onChange(refreshAll));
  unsubscribes.push(editor.stack.onChange(refreshAll));
  const onResizeBound = () => onResize();
  window.addEventListener("resize", onResizeBound);
  unsubscribes.push(() => window.removeEventListener("resize", onResizeBound));
  const onHide = () => {
    if (document.visibilityState === "hidden") saveIfDirty();
  };
  document.addEventListener("visibilitychange", onHide);
  unsubscribes.push(() => document.removeEventListener("visibilitychange", onHide));

  lastSaveTime = performance.now();
  state = "edit";
  refreshAll();

  // The `new` route resolves to a real id here; replaceState so Back does not walk
  // through "#/studio/new" again (§5.1 step 7).
  const want = "#/studio/" + doc.id;
  if (location.hash !== want && window.history && window.history.replaceState) {
    window.history.replaceState(null, "", location.pathname + location.search + want);
  }
  installDebugHandle();
}

// closeStudio() -> Promise<void> — §5.1. Must leave the scene, the collider count and
// the DOM exactly as they were before openStudio (§7 criterion 19).
export async function closeStudio() {
  if (state === "closed") return;
  if (state === "playtest") exitPlaytest();
  saveIfDirty();
  teardownAll();
  routeToHub();
}

// teardownAll() — the whole of closeStudio's cleanup, reachable from a HALF-BUILT
// Studio as well as a fully open one. openStudio builds a full-viewport interaction
// layer (flycam's z-60 stage), hides the HUD and disables physics before the editor and
// the panels exist; if any of that construction threw, the old code left every one of
// those in place with `state` still "closed", so closeStudio's own guard made the mess
// permanently unremovable — a dead page. Every step is individually guarded for the same
// reason: one failing dispose must not strand the ones after it.
function teardownAll() {
  const safe = (label, fn) => {
    try {
      fn();
    } catch (err) {
      console.warn("[oof] studio teardown:", label, "failed", err);
    }
  };

  for (const off of unsubscribes.splice(0)) safe("listener", off);
  if (props) safe("props", () => props.dispose());
  if (worldPanel) safe("world panel", () => worldPanel.dispose());
  if (palette) safe("palette", () => palette.dispose());
  if (editor) safe("editor", () => editor.dispose());
  if (flycam) safe("fly cam", () => flycam.dispose());
  if (root) safe("root", () => root.remove());

  if (deps) {
    safe("parts", () => deps.partsApi.clear());
    if (deps.avatar) safe("avatar", () => { deps.avatar.visible = true; });
    safe("physics", () => deps.physics.setEnabled(true));
    safe("lighting", () => deps.rendererApi.applyLighting({}));
  }
  safe("hud", () => hideHud(false));
  if (window.__oofStudio) delete window.__oofStudio;

  props = null;
  worldPanel = null;
  palette = null;
  editor = null;
  flycam = null;
  root = null;
  bars = null;
  doc = null;
  playtest = null;
  saveFailed = false;
  state = "closed";
  deps = null;
}

// ---- debug handle (§8) -----------------------------------------------------------------
// Installed only under debug=1 (or alongside the shell's own debug handle, which is what
// the smoke harness actually has once the route has replaced the boot hash).

function debugEnabled() {
  return location.hash.includes("debug=1")
    || location.search.includes("debug=1")
    || typeof window.__oofDebug !== "undefined";
}

function installDebugHandle() {
  if (!debugEnabled()) return;
  window.__oofStudio = {
    state: () => state,
    doc: () => JSON.parse(JSON.stringify(doc)),
    pose: () => flycam.getPose(),
    setPose: (next) => flycam.setPose(next),
    counts: () => ({
      sceneChildren: deps.scene.children.length,
      colliders: deps.physics.getDebugState ? deps.physics.getDebugState().colliderCount : 0,
      domNodes: document.querySelectorAll("[id^=oof-studio]").length,
    }),
    select: (ids) => editor.setSelection(ids),
    selection: () => editor.selection(),
    setTool: (mode) => editor.setTool(mode),
    setGrid: (g) => editor.setGrid(g),
    placeAt: (shape, x, y) => editor.debugPlaceAt(shape, x, y),
    tapAt: (x, y) => editor.debugTapAt(x, y),
    gizmoDrag: (handle, dx, dy) => editor.debugGizmoDrag(handle, dx, dy),
    undo: () => editor.stack.undo(),
    redo: () => editor.stack.redo(),
    save: () => saveNow(),
    exportCode: () => {
      const result = store.exportCode(doc.id);
      return result.code || null;
    },
    importCode: (code) => store.importCode(code),
    enterPlaytest,
    exitPlaytest,
  };
}
