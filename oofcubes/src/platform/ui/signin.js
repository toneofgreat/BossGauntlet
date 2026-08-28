// src/platform/ui/signin.js — pick a name and a password. Spec 14 §5.1–§5.3 owns this.
//
// Two things this screen must get right, and they are both about honesty rather than
// pixels:
//
//   1. **It says there is no password reset BEFORE you commit**, not in an apology after
//      you have forgotten one. There is no email here and nothing to recover an account
//      with (ARCHITECTURE.md §9.3), so the only fair moment to say so is while you are
//      choosing.
//   2. **You do not get past it without a name** (amended 2026-08-27 at the owner's
//      request; spec 14 §5.3). It used to offer "Play as guest". It no longer does:
//      chat, the player list, friends and visit counts all need somebody to point at,
//      and half the platform behaving differently for the unnamed was worse than
//      simply asking. There is no Escape hatch and no dismiss button.
//
//      This is only reachable when a server is configured at all. With none, there is
//      no account system, this screen never opens, and everything still plays — that
//      part has not changed and `ARCHITECTURE.md` §9.2 still requires it.

import { el, button, trapFocus } from "./kit.js";

const MODE_NEW = "new";
const MODE_BACK = "back";

export function openSignIn(deps = {}) {
  const { account, onDone } = deps;
  let mode = MODE_NEW;
  let busy = false;

  const scrim = el("div", "oof-panel-scrim");
  const card = el("div", "oof-panel oof-signin");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-label", "Sign in to OofCubes");
  card.setAttribute("style",
    "max-width:420px;margin:auto;padding:20px;display:flex;flex-direction:column;gap:10px");

  const title = el("div", "oof-panel-title", "Who are you?");
  title.setAttribute("style", "font-size:var(--oof-size-lg);font-weight:800");

  const blurb = el("div", null,
    "Pick a name and a password. You will only need to type the password again about "
    + "once a month.");
  blurb.setAttribute("style", "color:var(--oof-text-dim);font-size:var(--oof-size-sm)");

  const nameInput = field("Name", "text", "3-20 letters, numbers or _");
  const passInput = field("Password", "password", "something you will remember");

  // §9.3: stated before the button, not after the mistake.
  const warn = el("div", null,
    "⚠ There is no password reset. If you forget it you will need a new name.");
  warn.setAttribute("style",
    "font-size:var(--oof-size-sm);color:var(--oof-warn,#f5c542);"
    + "background:rgba(245,201,66,0.10);border-radius:var(--oof-radius-md);padding:8px 10px");

  const message = el("div", null, "");
  message.setAttribute("role", "status");
  message.setAttribute("style", "min-height:18px;font-size:var(--oof-size-sm);color:var(--oof-danger,#e74c3c)");

  const primary = button({ label: "Create my name", variant: "primary", onClick: submit });
  const swap = button({ label: "I already have a name", variant: "secondary", onClick: toggleMode });

  const why = el("div", null,
    "Your name is what other people see when you chat, and it is how friends find you.");
  why.setAttribute("style", "color:var(--oof-text-dim);font-size:var(--oof-size-sm)");

  card.append(title, blurb, nameInput.row, passInput.row, warn, message,
    primary, swap, why);
  scrim.appendChild(card);
  document.body.appendChild(scrim);
  const releaseFocus = trapFocus ? trapFocus(card) : null;
  nameInput.input.focus();

  // Enter submits from either field — this is a two-field form and reaching for the
  // mouse to finish it would be silly.
  for (const f of [nameInput, passInput]) {
    f.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); submit(); }
      e.stopPropagation(); // never let typing reach the engine's input
    });
  }

  function field(label, type, placeholder) {
    const row = el("div", null);
    row.setAttribute("style", "display:flex;flex-direction:column;gap:4px");
    const lab = el("label", null, label);
    lab.setAttribute("style", "font-size:var(--oof-size-sm);color:var(--oof-text-dim)");
    const input = el("input", "oof-input");
    input.type = type;
    input.placeholder = placeholder;
    input.autocomplete = type === "password" ? "current-password" : "username";
    input.setAttribute("style",
      "padding:9px 10px;border-radius:var(--oof-radius-md);border:1px solid var(--oof-line);"
      + "background:var(--oof-bg-2);color:var(--oof-text);font:inherit");
    lab.setAttribute("for", (input.id = `oof-signin-${label.toLowerCase()}`));
    row.append(lab, input);
    return { row, input };
  }

  function toggleMode() {
    mode = mode === MODE_NEW ? MODE_BACK : MODE_NEW;
    const isNew = mode === MODE_NEW;
    title.textContent = isNew ? "Who are you?" : "Welcome back";
    primary.textContent = isNew ? "Create my name" : "Sign in";
    swap.textContent = isNew ? "I already have a name" : "I need a new name";
    warn.style.display = isNew ? "" : "none";
    passInput.input.autocomplete = isNew ? "new-password" : "current-password";
    message.textContent = "";
  }

  function setBusy(on) {
    busy = on;
    primary.disabled = on;
    swap.disabled = on;
    primary.textContent = on
      ? "Just a moment…"
      : (mode === MODE_NEW ? "Create my name" : "Sign in");
  }

  async function submit() {
    if (busy) return;
    const name = nameInput.input.value.trim();
    const pass = passInput.input.value;
    if (!name || !pass) { message.textContent = "Both a name and a password, please."; return; }
    setBusy(true);
    message.textContent = "";
    try {
      if (mode === MODE_NEW) await account.register(name, pass);
      else await account.login(name, pass);
      finish(account.username());
    } catch (err) {
      // The server's message is written for a person to read (spec 14 §4), so show it
      // rather than inventing our own.
      message.textContent = err && err.message ? err.message : "That did not work.";
      setBusy(false);
      passInput.input.select();
    }
  }

  function finish(username) {
    if (releaseFocus) releaseFocus();
    scrim.remove();
    if (typeof onDone === "function") onDone(username);
  }

  // Escape is swallowed rather than closing. There is nowhere to go: the platform needs
  // a name to put in chat, on the player list and on a friend request, and letting the
  // dialog be dismissed would leave the player in a half-state where those things fail
  // for reasons they cannot see.
  scrim.addEventListener("keydown", (e) => {
    if (e.key === "Escape") e.preventDefault();
  });

  // Exposed for the shell, not for a close button: nothing in the UI dismisses this.
  return { close: () => finish(null) };
}
