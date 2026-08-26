// src/platform/ui/toast.js — the one place Badge, purchase and info toasts appear.
// Games never build their own. Owner: spec 06 §3.5 (options) and §5.6.4 (queue).

import { el } from "./kit.js";

const TOAST_MAX_VISIBLE = 3;        // spec 06 §6
const TOAST_DURATION_MS = 3500;     // spec 06 §6
const TOAST_BADGE_DURATION_MS = 5000; // spec 06 §6
const TOAST_ANIM_MS = 200;          // spec 06 §6

const VARIANTS = new Set(["info", "badge", "purchase", "error"]);

function defaultDuration(variant) {
  return variant === "badge" ? TOAST_BADGE_DURATION_MS : TOAST_DURATION_MS;
}

function buildCard(opts, variant) {
  const card = el("div", `oof-toast oof-toast-${variant}`);
  card.setAttribute("role", variant === "error" ? "alert" : "status");
  if (opts.icon) card.appendChild(el("div", "oof-toast-icon", opts.icon));
  const column = el("div", "oof-toast-text");
  column.appendChild(el("div", "oof-toast-title", opts.title === undefined ? "" : opts.title));
  if (opts.body) column.appendChild(el("div", "oof-toast-body", opts.body));
  card.appendChild(column);
  return card;
}

// createToaster() -> { toast(opts) -> id, dismiss(id), destroy() }
export function createToaster() {
  const root = el("div");
  root.id = "oof-toasts";
  document.body.appendChild(root);

  const live = new Map(); // id -> { card, timer, exit }
  let nextId = 1;

  function remove(id) {
    const entry = live.get(id);
    if (!entry) return;
    live.delete(id);
    clearTimeout(entry.timer);
    clearTimeout(entry.exit);
    entry.card.classList.remove("is-in");
    // The card is detached after the exit transition so the stack does not jump;
    // under .oof-reduced-motion the transition is 0 ms and this simply lands sooner.
    entry.exit = setTimeout(() => entry.card.remove(), TOAST_ANIM_MS);
  }

  function evictOldest() {
    while (live.size >= TOAST_MAX_VISIBLE) {
      const oldest = live.keys().next();
      if (oldest.done) return;
      remove(oldest.value);
    }
  }

  function toast(opts = {}) {
    const variant = VARIANTS.has(opts.variant) ? opts.variant : "info";
    evictOldest();
    const id = nextId++;
    const card = buildCard(opts, variant);
    root.appendChild(card);
    // Two frames: the card must paint at its start offset before the class flips, or
    // the browser coalesces both states and no enter animation runs.
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add("is-in")));
    const ms = Number.isFinite(opts.duration) ? opts.duration : defaultDuration(variant);
    const entry = { card, timer: setTimeout(() => remove(id), ms), exit: null };
    live.set(id, entry);
    return id;
  }

  function destroy() {
    for (const [id, entry] of live) {
      clearTimeout(entry.timer);
      clearTimeout(entry.exit);
      entry.card.remove();
      live.delete(id);
    }
    root.remove();
  }

  return { el: root, toast, dismiss: remove, destroy };
}
