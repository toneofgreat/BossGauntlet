// src/platform/studio/shelf.js — the "My Places" shelf: the Hub-side list of your Oof
// Studio creations, plus the new / import / share / delete actions. Spec 11 §5.10.
//
// This is the only Studio module the Hub touches, and it deliberately imports nothing
// heavy: studio.js (and with it THREE, the editor and the gizmos) is pulled in with a
// dynamic import only when the share button is actually tapped.
//
// Style note: see palette.js's header for why every colour is var(name, fallback).

import * as store from "./store.js";

const PANEL = "var(--oof-panel, rgba(20,24,34,.92))";
const PANEL2 = "var(--oof-panel-2, rgba(34,40,54,.92))";
const TEXT = "var(--oof-text, #fff)";
const MUTED = "var(--oof-muted, rgba(255,255,255,.55))";
const ACCENT = "var(--oof-accent, #4aa8ff)";
const LINE = "var(--oof-ui-line, rgba(255,255,255,.18))";
const ON_ACCENT = "#0c0e14";
const DANGER = "#e5484d";

const NARROW_BREAKPOINT = 720;
const MAX_IMPORT_MESSAGES = 10; // §5.7: at most ten messages, same cap as the export dialog

// §5.7's error table, in the words a child can act on. Each line is a HEADLINE: any
// detail the store hands back is listed under it (see showImportError).
const IMPORT_ERRORS = {
  badcode: "That code looks damaged",
  badpack: "That code looks damaged",
  wrongdomain: "That's not a Place code",
  toobig: "Too many parts (max " + store.STUDIO_LIMITS.maxParts + ")",
  codetoobig: "That code is too long (max " + store.STUDIO_LIMITS.maxCodeChars + " characters)",
  limit: "Place limit reached (" + store.STUDIO_LIMITS.maxCreations + ")",
  invalid: "That Place has a problem and can't be opened",
};

// The export path renders the validator's own messages in a dialog (§5.7, studio.js's
// messageList). An import that failed the SAME validation used to show the headline and
// drop result.messages on the floor, so the one person who could fix the Place — the
// friend who still has it open in Studio — was told only that it was broken. Same
// detail, same ten-message cap, on the way in.
function showImportError(host, result) {
  host.textContent = "";
  host.appendChild(el("div", "font-weight:700;",
    IMPORT_ERRORS[result.error] || "That code looks damaged"));
  const detail = Array.isArray(result.messages)
    ? result.messages
    : (result.message ? [result.message] : []);
  for (const line of detail.slice(0, MAX_IMPORT_MESSAGES)) {
    host.appendChild(el("div", "color:" + MUTED + ";margin-top:2px;", "· " + line));
  }
  if (detail.length > MAX_IMPORT_MESSAGES) {
    host.appendChild(el("div", "color:" + MUTED + ";margin-top:2px;",
      "…and " + (detail.length - MAX_IMPORT_MESSAGES) + " more"));
  }
}

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

const BTN = "height:36px;border-radius:10px;border:1px solid " + LINE + ";background:" + PANEL2
  + ";color:" + TEXT + ";font-family:inherit;font-size:13px;cursor:pointer;padding:0 12px;";
const ICON_BTN = "width:36px;height:36px;border-radius:10px;border:1px solid " + LINE
  + ";background:" + PANEL2 + ";color:" + TEXT + ";font-size:15px;cursor:pointer;padding:0;";

// §5.10's relative-time rule, exact thresholds.
function relativeTime(then) {
  const seconds = Math.max(0, (Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h ago";
  return Math.floor(hours / 24) + "d ago";
}

let openShelf = null; // only one shelf at a time

// closeMyPlacesShelf() -> void — not in §4's table, and the reason it has to exist is
// the Hub's dispose path. The shelf takes itself down on Escape, on a backdrop click,
// on ✕ and on its own route() (every button that leaves the Hub goes through route()),
// but a player who opens it and then walks into a portal arch leaves the Hub by a path
// the shelf never hears about — and this overlay is position:fixed, z-index 250 and
// pointer-events on, so it would sit over the next Place swallowing every tap, with its
// document keydown listener still attached. hub/game.js's dispose calls this; it is a
// no-op when no shelf is open, and it never imports anything (the Hub only reaches it
// on a module it has already loaded).
export function closeMyPlacesShelf() {
  if (openShelf) openShelf.close();
}

// openMyPlacesShelf(deps) -> void — §5.10. deps: { services }
export function openMyPlacesShelf(deps = {}) {
  if (openShelf) openShelf.close();
  const services = deps.services || {};
  const ui = services.ui || null;
  const narrow = window.innerWidth < NARROW_BREAKPOINT;

  const overlay = el("div", "position:fixed;inset:0;z-index:250;background:rgba(0,0,0,.55);"
    + "display:flex;align-items:center;justify-content:center;"
    + "font-family:var(--oof-font-stack, system-ui, sans-serif);");
  overlay.id = "oof-studio-shelf";

  const card = el("div", narrow
    ? "position:absolute;inset:0;background:" + PANEL + ";padding:16px;overflow-y:auto;"
    : "width:min(560px,92vw);max-height:80vh;background:" + PANEL + ";border-radius:16px;"
      + "padding:16px;overflow-y:auto;box-shadow:0 16px 48px rgba(0,0,0,.5);");
  overlay.appendChild(card);

  function close() {
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    openShelf = null;
  }
  function onKey(ev) {
    if (ev.key === "Escape") close();
  }
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
  });

  function route(hash) {
    close();
    location.hash = hash;
  }

  // ---- header ---------------------------------------------------------------------
  const header = el("div", "display:flex;align-items:center;gap:8px;margin-bottom:12px;");
  header.appendChild(el("div", "flex:1;font-size:18px;font-weight:700;color:" + TEXT + ";", "My Places"));
  const closeBtn = el("button", "width:44px;height:44px;border-radius:12px;border:1px solid " + LINE
    + ";background:" + PANEL2 + ";color:" + TEXT + ";font-size:18px;cursor:pointer;", "✕");
  closeBtn.addEventListener("click", close);
  header.appendChild(closeBtn);
  card.appendChild(header);

  // ---- actions --------------------------------------------------------------------
  const actions = el("div", "display:flex;gap:8px;flex-wrap:wrap;");
  const newBtn = el("button", BTN + "background:" + ACCENT + ";color:" + ON_ACCENT + ";font-weight:700;",
    "＋ New Place");
  const importBtn = el("button", BTN, "📥 Import code");
  importBtn.addEventListener("click", () => openImportPanel());
  actions.append(newBtn, importBtn);
  card.appendChild(actions);
  const capNote = el("div", "font-size:11px;color:" + MUTED + ";margin-top:4px;display:none;",
    "Limit " + store.STUDIO_LIMITS.maxCreations + " — delete one first");
  card.appendChild(capNote);

  const list = el("div", "margin-top:8px;");
  card.appendChild(list);

  const importHost = el("div", "");
  card.appendChild(importHost);

  // ---- list -----------------------------------------------------------------------
  function renderList() {
    list.textContent = "";
    const creations = store.listCreations();
    const atCap = creations.length >= store.STUDIO_LIMITS.maxCreations;
    newBtn.disabled = atCap;
    newBtn.style.opacity = atCap ? "0.35" : "1";
    capNote.style.display = atCap ? "block" : "none";

    if (creations.length === 0) {
      const empty = el("div", "text-align:center;padding:24px 0;");
      empty.appendChild(el("div", "font-size:40px;", "🏗"));
      empty.appendChild(el("div", "font-size:14px;color:" + TEXT + ";", "Build your first Place!"));
      list.appendChild(empty);
      return;
    }

    for (const entry of creations) {
      const row = el("div", "height:64px;background:" + PANEL2 + ";border-radius:12px;margin:6px 0;"
        + "display:flex;align-items:center;gap:10px;padding:0 10px;box-sizing:border-box;");
      row.appendChild(el("div", "font-size:24px;", "🧱"));
      const text = el("div", "flex:1;min-width:0;");
      text.appendChild(el("div", "font-size:14px;color:" + TEXT + ";overflow:hidden;"
        + "text-overflow:ellipsis;white-space:nowrap;", entry.name));
      text.appendChild(el("div", "font-size:11px;color:" + MUTED + ";",
        entry.partCount + " parts · " + relativeTime(entry.updatedAt)));
      row.appendChild(text);

      const edit = el("button", ICON_BTN, "✎");
      edit.title = "Edit";
      edit.addEventListener("click", () => route("#/studio/" + entry.id));
      const share = el("button", ICON_BTN, "⧉");
      share.title = "Share";
      share.addEventListener("click", () => {
        // Lazy: the share dialog lives in studio.js, and the Hub must not pay for the
        // whole editor just to show this shelf (§4).
        import("./studio.js").then((mod) => mod.openShareDialog(entry.id, services))
          .catch((err) => {
            console.error("[oof] could not open the share dialog", err);
            if (ui && ui.toast) ui.toast("Could not build a share code");
          });
      });
      const remove = el("button", ICON_BTN, "🗑");
      remove.title = "Delete";
      remove.addEventListener("click", () => confirmDelete(entry));
      row.append(edit, share, remove);
      list.appendChild(row);
    }
  }

  function confirmDelete(entry) {
    if (!ui || !ui.dialog) {
      store.deleteCreation(entry.id);
      renderList();
      return;
    }
    ui.dialog({
      title: "Delete " + entry.name + "?",
      body: "This can't be undone.",
      buttons: [
        { id: "cancel", label: "Cancel", variant: "secondary" },
        { id: "delete", label: "Delete", variant: "primary" },
      ],
    }).then((choice) => {
      if (choice !== "delete") return;
      store.deleteCreation(entry.id);
      renderList();
    });
  }

  // ---- import (§5.7's import dialog) -----------------------------------------------
  // Built inside the shelf rather than through ui.dialog: the spec wants the failure
  // message to stay on screen UNDER the textarea so the code can be re-pasted, and the
  // shared dialog closes on every button press.
  function openImportPanel() {
    importHost.textContent = "";
    const box = el("div", "margin-top:12px;border:1px solid " + LINE + ";border-radius:12px;padding:10px;");
    box.appendChild(el("div", "font-size:14px;font-weight:700;color:" + TEXT + ";margin-bottom:6px;",
      "Import a Place"));
    const area = el("textarea", "width:100%;height:96px;box-sizing:border-box;font-family:monospace;"
      + "font-size:11px;background:" + PANEL2 + ";color:" + TEXT + ";border:1px solid " + LINE + ";"
      + "border-radius:8px;padding:6px;");
    area.placeholder = "Paste a share code";
    box.appendChild(area);
    const message = el("div", "font-size:12px;color:" + DANGER + ";min-height:16px;margin-top:4px;"
      + "max-height:160px;overflow-y:auto;");
    box.appendChild(message);
    const row = el("div", "display:flex;gap:8px;");
    const go = el("button", BTN + "background:" + ACCENT + ";color:" + ON_ACCENT + ";font-weight:700;",
      "Import");
    const cancel = el("button", BTN, "Cancel");
    cancel.addEventListener("click", () => {
      importHost.textContent = "";
    });
    go.addEventListener("click", () => {
      const result = store.importCode(area.value);
      if (result.error) {
        showImportError(message, result);
        return;
      }
      importHost.textContent = "";
      renderList();
      if (ui && ui.toast) ui.toast("Imported " + result.name);
    });
    row.append(go, cancel);
    box.appendChild(row);
    importHost.appendChild(box);
    area.focus();
  }

  newBtn.addEventListener("click", () => {
    if (newBtn.disabled) return;
    route("#/studio/new");
  });

  renderList();
  document.body.appendChild(overlay);
  openShelf = { close, refresh: renderList };
}
