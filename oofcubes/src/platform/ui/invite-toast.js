// src/platform/ui/invite-toast.js — "X is inviting you", with Yes and No. Spec 15 §5.4.
//
// Small, at the top of the screen, and gone after three seconds — which is the shape that
// was asked for and is also the right shape: an invite interrupts somebody who is playing,
// so it must be readable at a glance and must not sit there stealing the screen.
//
// Three seconds is short. Two consequences are handled rather than ignored:
//   - the countdown is drawn, so the bar is visibly running out instead of vanishing
//     without warning;
//   - hovering (or touching) PAUSES it, because a prompt that expires while you are
//     reaching for Yes is a prompt that cannot be answered.
//
// Expiring is not the same as saying no. Nothing is sent when it times out: the inviter
// is not told, because "they ignored you" is not information anyone benefits from.

import { el } from "./kit.js";

const LIFE_MS = 3000;
const TICK_MS = 50;

export function createInviteToast() {
  let host = null;
  const live = new Map(); // id -> { node, timer }

  function ensureHost() {
    if (host) return host;
    host = el("div", "oof-invites");
    host.setAttribute("style",
      "position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:60;"
      + "display:flex;flex-direction:column;gap:6px;align-items:center;pointer-events:none");
    document.body.appendChild(host);
    return host;
  }

  function dismiss(key) {
    const entry = live.get(key);
    if (!entry) return;
    clearInterval(entry.timer);
    entry.node.remove();
    live.delete(key);
  }

  // invite: { from, name, place }
  function show(invite, onAnswer) {
    ensureHost();
    const key = invite.from + ":" + invite.place;
    dismiss(key); // a second invite from the same person replaces the first

    const card = el("div", null);
    card.setAttribute("role", "alertdialog");
    card.setAttribute("style",
      "pointer-events:auto;display:flex;align-items:center;gap:8px;"
      + "padding:6px 10px;border-radius:999px;background:rgba(14,16,24,0.92);"
      + "border:1px solid var(--oof-line);box-shadow:0 4px 14px rgba(0,0,0,0.35);"
      + "font-size:var(--oof-size-sm);max-width:92vw");

    const text = el("span", null, "");
    // Their name is text, never markup — it came off a socket.
    text.appendChild(document.createTextNode(`${invite.name} wants you to join`));
    text.setAttribute("style", "white-space:nowrap;overflow:hidden;text-overflow:ellipsis");

    const yes = mini("Yes", "var(--oof-good,#3ddc84)", () => { dismiss(key); onAnswer(true, invite); });
    const no = mini("No", "var(--oof-text-dim)", () => { dismiss(key); onAnswer(false, invite); });

    const bar = el("div", null);
    bar.setAttribute("style",
      "position:absolute;left:10px;right:10px;bottom:2px;height:2px;border-radius:2px;"
      + "background:var(--oof-accent,#f7c948);transform-origin:left center");
    card.style.position = "relative";

    card.append(text, yes, no, bar);
    host.appendChild(card);

    // Wall clock, not a tick count. setInterval drifts and can be throttled, and a
    // decrementing counter turns that drift into a prompt that outstays its three
    // seconds -- which is exactly what the first version did.
    const startedAt = Date.now();
    let pausedFor = 0;
    let pausedAt = 0;
    const pause = () => { if (!pausedAt) pausedAt = Date.now(); };
    const resume = () => { if (pausedAt) { pausedFor += Date.now() - pausedAt; pausedAt = 0; } };
    card.addEventListener("pointerenter", pause);
    card.addEventListener("pointerleave", resume);
    card.addEventListener("pointerdown", pause);

    const timer = setInterval(() => {
      const now = Date.now();
      const held = pausedFor + (pausedAt ? now - pausedAt : 0);
      const left = LIFE_MS - (now - startedAt - held);
      bar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / LIFE_MS))})`;
      // The hard ceiling is deliberate: hovering pauses the countdown, and without a cap
      // a pointer left resting on the prompt (or a pointerleave that never arrives) would
      // pin it to the screen indefinitely.
      if (left <= 0 || now - startedAt > LIFE_MS * 3) dismiss(key);
    }, TICK_MS);

    live.set(key, { node: card, timer });
    return { dismiss: () => dismiss(key) };
  }

  function mini(label, color, onClick) {
    const b = el("button", null, label);
    b.type = "button";
    b.setAttribute("style",
      `border:0;border-radius:999px;padding:3px 10px;font:inherit;font-weight:700;`
      + `cursor:pointer;background:${color};color:#0e1018`);
    b.addEventListener("click", onClick);
    return b;
  }

  return {
    show,
    dispose() {
      for (const key of [...live.keys()]) dismiss(key);
      if (host) { host.remove(); host = null; }
    },
    count: () => live.size,
  };
}
