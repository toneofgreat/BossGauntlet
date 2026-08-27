// src/platform/ui/chat.js — talk to the people in your Place. Spec 14 §5.4 owns this.
//
// The one thing that will actually break the game if it is wrong: WHILE THE INPUT HAS
// FOCUS, KEYSTROKES MUST NOT REACH THE ENGINE. Typing "was" into an unguarded chat box
// walks you forward and strafes you off a stage. Every key event here is stopped at the
// input, and the shell is told to suspend gameplay input for as long as the box is open.
//
// Messages are appended as TEXT NODES, never as HTML. They come from other people over a
// socket, and the only safe assumption about that is none.
//
// There is no history: chat is forwarded and forgotten (§2), so a log that starts empty
// when you arrive is the honest state, not a loading failure.

import { el } from "./kit.js";

const MAX_LINES = 60; // what stays in the DOM; older lines are dropped, not stored
const MAX_CHARS = 140; // mirrors relay.js CHAT_MAX_CHARS so the UI stops you first

export function createChat(deps = {}) {
  const { net, onFocusChange } = deps;
  let root = null;
  let log = null;
  let input = null;
  let open = false;
  let unsubscribe = null;
  let unread = 0;

  function build() {
    root = el("div", "oof-chat");
    root.setAttribute("style",
      "position:fixed;left:12px;bottom:12px;width:min(360px,calc(100vw - 24px));"
      + "display:flex;flex-direction:column;gap:6px;z-index:40;pointer-events:none");

    log = el("div", "oof-chat-log");
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "polite");
    log.setAttribute("aria-label", "Chat");
    log.setAttribute("style",
      "max-height:190px;overflow-y:auto;display:flex;flex-direction:column;gap:2px;"
      + "padding:8px;border-radius:var(--oof-radius-md);background:rgba(14,16,24,0.62);"
      + "font-size:var(--oof-size-sm);pointer-events:auto");

    const row = el("div", null);
    row.setAttribute("style", "display:flex;gap:6px;pointer-events:auto");

    input = el("input", "oof-chat-input");
    input.type = "text";
    input.maxLength = MAX_CHARS;
    input.placeholder = "Press Enter to chat";
    input.setAttribute("aria-label", "Chat message");
    input.setAttribute("style",
      "flex:1;min-width:0;padding:8px 10px;border-radius:var(--oof-radius-md);"
      + "border:1px solid var(--oof-line);background:var(--oof-bg-2);color:var(--oof-text);font:inherit");

    // Focus is the whole safety story. Both handlers are on the input, and both stop
    // propagation so nothing reaches the engine's document-level listeners.
    input.addEventListener("focus", () => setTyping(true));
    input.addEventListener("blur", () => setTyping(false));
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); send(); }
      else if (e.key === "Escape") { e.preventDefault(); input.blur(); }
    });
    input.addEventListener("keyup", (e) => e.stopPropagation());
    input.addEventListener("keypress", (e) => e.stopPropagation());

    row.appendChild(input);
    root.append(log, row);
    document.body.appendChild(root);
  }

  function setTyping(on) {
    if (typeof onFocusChange === "function") onFocusChange(on);
  }

  function line(name, text, kind) {
    const div = el("div", "oof-chat-line");
    div.setAttribute("style", "word-break:break-word");
    if (kind === "system") {
      div.setAttribute("style", "word-break:break-word;color:var(--oof-text-dim);font-style:italic");
      div.appendChild(document.createTextNode(text));
    } else {
      const who = el("span", null, name + ": ");
      who.setAttribute("style", "font-weight:700;color:var(--oof-accent,#f7c948)");
      div.appendChild(who);
      // A text node, deliberately: this string came from another player.
      div.appendChild(document.createTextNode(text));
    }
    log.appendChild(div);
    while (log.childElementCount > MAX_LINES) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
    if (!open) unread++;
  }

  function send() {
    const text = input.value.trim();
    input.value = "";
    if (!text) return;
    if (!net || !net.online()) {
      line(null, "You are not connected to a server, so nobody can hear you.", "system");
      return;
    }
    net.send({ t: "chat", text });
  }

  return {
    mount() {
      if (root) return;
      build();
      if (net && typeof net.on === "function") {
        unsubscribe = net.on("chat", (m) => line(m.name || "someone", m.text));
      }
    },
    // Called by the shell when the Place changes: the log is per-room, and carrying
    // yesterday's conversation into a new Place would be inventing context.
    clear() { if (log) log.replaceChildren(); unread = 0; },
    system(text) { if (log) line(null, text, "system"); },
    focus() { if (input) { open = true; unread = 0; input.focus(); } },
    isTyping: () => !!(input && document.activeElement === input),
    unread: () => unread,
    dispose() {
      if (unsubscribe) { unsubscribe(); unsubscribe = null; }
      setTyping(false);
      if (root) { root.remove(); root = null; log = null; input = null; }
    },
  };
}
