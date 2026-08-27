// src/platform/ui/settings.js — spec 06 §5.6.9: the Settings panel body, all 18 rows,
// top to bottom (AUDIO, GRAPHICS, CONTROLS, ACCESSIBILITY, SAVE DATA, footer).
//
// This module does not open the panel itself — shell.js already owns `openPanel({title:
// "Settings"})` and the HUD-gear wiring (§5.6.3), and spec 04 §5.7's ctx.services.ui
// facade is shell.js's to assemble, not this module's. What shell.js's inline block
// (rows 1-5 today) does NOT own is the debounced write-through itself: every row here
// writes via a `writeSetting(key, value)` callback the caller hands in, so there is
// exactly one place (shell.js) that debounces, calls `saves.markDirty("profile")`, and
// emits `platform:settingsChanged` — see the wiring note this task reports.
//
// SAVE DATA (rows 14-17) is spec 07 §5.8's own file (`savecode.js`) and is mounted
// here, not reimplemented — its button label ("Export save code") predates this task
// and is a spec 06/07 wording mismatch this task did not introduce; see the report.

import { el, button, slider, segmented, toggle } from "./kit.js";
import { mountSaveCodeRows } from "./savecode.js";

const FALLBACK_VERSION = "0.1.0"; // spec 06 §6 SHELL_VERSION — pass deps.version to avoid drift

// null|true|false <-> the tri-state segmented control's string ids (row 12, §5.6.9.12).
function reducedMotionId(v) {
  if (v === true) return "on";
  if (v === false) return "off";
  return "system"; // null/undefined => follow prefers-reduced-motion (§3.1, §5.6.2 rule 3)
}
function reducedMotionValue(id) {
  if (id === "on") return true;
  if (id === "off") return false;
  return null;
}

// A labelled row wrapping a segmented control — kit.segmented() returns just the
// control (no label slot, unlike slider()/toggle()); shell.js's existing Quality row
// (§5.6.9.5) already hand-builds this wrapper inline, so rows 6 and 12 match it rather
// than inventing a second convention for the same shape.
function segmentedRow(label, opts) {
  const row = el("div", "oof-row");
  row.appendChild(el("span", null, label));
  row.appendChild(segmented(opts).el);
  return row;
}

// A labelled row wrapping a plain text field. The kit has no text input — every other
// setting is a slider, a segment or a toggle — and the two multiplayer rows below need
// free text (a URL and a name), so this is the same hand-built wrapper shape.
//
// Writes on `change`, not on every keystroke: writeSetting is debounced-write-through
// to localStorage, and saving a half-typed relay URL would have net.js try to open it.
function textRow(label, opts) {
  const row = el("div", "oof-row");
  row.appendChild(el("span", null, label));
  const input = el("input", "oof-input");
  input.type = "text";
  input.value = opts.value === undefined || opts.value === null ? "" : String(opts.value);
  if (opts.placeholder) input.placeholder = opts.placeholder;
  input.setAttribute("aria-label", label);
  input.setAttribute(
    "style",
    "flex:1;min-width:0;margin-left:12px;padding:6px 8px;border-radius:var(--oof-radius-md);" +
    "border:1px solid var(--oof-line);background:var(--oof-bg-2);color:var(--oof-text);" +
    "font:inherit;font-size:var(--oof-size-sm)"
  );
  input.addEventListener("change", () => opts.onChange(input.value.trim()));
  row.appendChild(input);
  return row;
}

// mountSettingsRows(body, deps) — appends all 18 §5.6.9 rows to an already-open panel's
// bodyEl. deps mirrors savecode.js's shape (a plain bag the caller assembles from its
// own module-scope services) plus the engine setters and the two shell-owned callbacks
// every row writes through:
//
//   settings            live profile.settings object (saves.getDomain("profile").settings) —
//                       mutated in place by writeSetting, so re-reading it after a write
//                       reflects the new value without a re-fetch.
//   writeSetting(k, v)  shell.js's existing debounced write-through (mutates settings[k],
//                       debounces saves.markDirty("profile") + emits
//                       platform:settingsChanged { settings }, SETTINGS_DEBOUNCE_MS = 250).
//   applyAccessibility(settings)
//                       shell.js's existing recompute-and-toggle for the three body
//                       classes (oof-reduced-motion / oof-large-text / oof-left-handed) —
//                       reused so the prefers-reduced-motion fallback logic (§5.6.2 rule 3)
//                       lives in exactly one place.
//   audio               { setMusicVolume(v0to1), setSfxVolume(v0to1) } (engine/audio.js)
//   renderer            { setQuality(tier) } (engine/renderer.js)
//   input               { setCameraSensitivity(v), setInvertY(b) } (engine/input.js)
//   sfx(name)           shell.js's existing audio.playSfx guard (row 3's on-release click)
//   saves, confirmDialog, toast   forwarded verbatim to savecode.js's mountSaveCodeRows
//   version             optional footer string; defaults to the spec's literal (row 18)
export function mountSettingsRows(body, deps = {}) {
  const {
    settings, writeSetting, applyAccessibility,
    audio, renderer, input, sfx,
    saves, confirmDialog, toast,
    version = FALLBACK_VERSION,
  } = deps;

  // ---- AUDIO (rows 1-3) --------------------------------------------------
  body.appendChild(el("div", "oof-section-label", "AUDIO"));
  body.appendChild(slider({
    label: "Music", min: 0, max: 100, step: 5, value: settings.musicVol,
    onInput: (v) => {
      audio.setMusicVolume(v / 100);
      writeSetting("musicVol", v);
    },
  }).el);
  body.appendChild(slider({
    label: "Sound effects", min: 0, max: 100, step: 5, value: settings.sfxVol,
    onInput: (v) => {
      audio.setSfxVolume(v / 100);
      writeSetting("sfxVol", v);
    },
    // "on release plays click so the level is audible" (§5.6.9.3) — deliberately not on
    // every `input` tick, or dragging the slider would machine-gun the sfx voice pool.
    onRelease: () => sfx("click"),
  }).el);

  // ---- GRAPHICS (rows 4-6) ------------------------------------------------
  body.appendChild(el("div", "oof-section-label", "GRAPHICS"));
  body.appendChild(segmentedRow("Quality", {
    options: [
      { id: "auto", label: "Auto" }, { id: "low", label: "Low" },
      { id: "medium", label: "Medium" }, { id: "high", label: "High" },
    ],
    value: settings.quality,
    onChange: (tier) => {
      renderer.setQuality(tier);
      writeSetting("quality", tier);
    },
  }));
  // Row 6 is aesthetic-only (§5.5): the Hub itself listens for platform:settingsChanged
  // and re-applies the lighting preset (spec 06 §5.5, §5.6.9.6) — no engine call here,
  // and no-op harmlessly while a non-Hub Place is loaded (the listener lives in hub
  // game.js, so it simply doesn't fire until the player is back in the Hub).
  body.appendChild(segmentedRow("Hub ambience", {
    options: [
      { id: "day", label: "Day" }, { id: "dusk", label: "Dusk" }, { id: "night", label: "Night" },
    ],
    value: settings.ambience,
    onChange: (preset) => writeSetting("ambience", preset),
  }));

  // ---- CONTROLS (rows 7-10) ------------------------------------------------
  body.appendChild(el("div", "oof-section-label", "CONTROLS"));
  body.appendChild(slider({
    label: "Camera sensitivity", min: 0.5, max: 2.0, step: 0.1, value: settings.camSensitivity,
    onInput: (v) => {
      input.setCameraSensitivity(v);
      writeSetting("camSensitivity", v);
    },
  }).el);
  body.appendChild(toggle({
    label: "Invert camera Y", value: settings.invertY,
    onChange: (b) => {
      input.setInvertY(b);
      writeSetting("invertY", b);
    },
  }).el);
  body.appendChild(toggle({
    label: "Left-handed touch layout", value: settings.leftHanded,
    // §5.6.1: the shell toggles body class oof-left-handed and input.js mirrors its own
    // zone logic off that class — applyAccessibility is the one place that derives all
    // three body classes from `settings`, so it's reused here rather than a second
    // classList.toggle call drifting out of sync with it.
    onChange: (b) => {
      writeSetting("leftHanded", b);
      applyAccessibility(settings);
    },
  }).el);

  // ---- ACCESSIBILITY (rows 11-13) ------------------------------------------
  body.appendChild(el("div", "oof-section-label", "ACCESSIBILITY"));
  body.appendChild(segmentedRow("Reduced motion", {
    options: [
      { id: "system", label: "System" }, { id: "on", label: "On" }, { id: "off", label: "Off" },
    ],
    value: reducedMotionId(settings.reducedMotion),
    onChange: (id) => {
      writeSetting("reducedMotion", reducedMotionValue(id));
      applyAccessibility(settings);
    },
  }));
  body.appendChild(toggle({
    label: "Large text", value: settings.largeText,
    onChange: (b) => {
      writeSetting("largeText", b);
      applyAccessibility(settings);
    },
  }).el);

  // ---- MULTIPLAYER (spec 13 §5.1) ------------------------------------------
  // Both fields are empty by default, and empty means single-player. Nothing here is
  // filled in for the player: ARCHITECTURE.md §9 makes multiplayer opt-in, and a build
  // that shipped pointing at somebody's relay would be connecting people to a server
  // they never chose.
  body.appendChild(el("div", "oof-section-label", "MULTIPLAYER"));
  body.appendChild(textRow("Display name", {
    value: settings.displayName || "",
    placeholder: "how others see you",
    onChange: (v) => {
      writeSetting("displayName", v);
      if (deps.net && typeof deps.net.setName === "function" && v) deps.net.setName(v);
    },
  }));
  body.appendChild(textRow("Relay server", {
    value: settings.relayUrl || "",
    placeholder: "ws://host:8787 — blank to play alone",
    onChange: (v) => {
      writeSetting("relayUrl", v);
      if (toast) {
        toast(v ? "Relay saved — it connects when you next enter a Place."
                : "Relay cleared — you are playing alone.");
      }
    },
  }));
  {
    const net = deps.net;
    const status = el(
      "div",
      null,
      !net || !net.configured()
        ? "No relay set — single-player."
        : net.online()
          // §9: a player count shown anywhere must be the true one, including 1.
          ? `Connected — ${net.count()} player${net.count() === 1 ? "" : "s"} here.`
          : "Not connected."
    );
    status.setAttribute(
      "style",
      "margin:2px 0 6px;font-size:var(--oof-size-sm);color:var(--oof-text-dim)"
    );
    body.appendChild(status);
  }

  // ---- SAVE DATA (rows 14-17) — spec 07 §5.8's file, mounted not duplicated ----
  mountSaveCodeRows(body, { saves, confirmDialog, toast });

  // ---- Footer (row 18) ------------------------------------------------------
  const footer = el("div", null, `OofCubes v${version}`);
  footer.setAttribute(
    "style",
    "text-align:center;margin-top:16px;font-size:var(--oof-size-sm);color:var(--oof-text-dim)"
  );
  body.appendChild(footer);
}
