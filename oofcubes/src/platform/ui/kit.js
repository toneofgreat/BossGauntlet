// src/platform/ui/kit.js — the shared UI component kit. Every platform surface and
// every in-game shop is built from these, which is what makes Places look like one
// product. Owner: spec 06 §5.6.2 (a11y), §5.6.5 (buttons), §5.6.7 (shop grid).

import { formatOofbux } from "./tokens.js";

const BUTTON_VARIANTS = new Set(["primary", "secondary", "danger", "ghost"]);
// Anything focusable inside a trapped container (§5.6.2 rule 4).
const FOCUSABLE = 'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])';

// el(tag, cls, text) — the whole kit builds DOM this way; text is always assigned as
// textContent, never innerHTML (§3.5: toast/dialog copy is plain text).
export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

// button({ label, variant, onClick, disabled, icon, title }) -> HTMLButtonElement
export function button(opts = {}) {
  const variant = BUTTON_VARIANTS.has(opts.variant) ? opts.variant : "secondary";
  const node = el("button", `oof-btn oof-btn-${variant}${opts.className ? " " + opts.className : ""}`);
  node.type = "button";
  if (opts.icon) node.appendChild(el("span", null, opts.icon));
  if (opts.label) node.appendChild(el("span", null, opts.label));
  if (opts.title) node.title = opts.title;
  node.setAttribute("aria-label", opts.ariaLabel || opts.label || opts.title || opts.icon || "button");
  if (opts.disabled) node.disabled = true;
  if (typeof opts.onClick === "function") node.addEventListener("click", opts.onClick);
  return node;
}

// The 22px Oofbux disc of §5.6.3 (a 14px variant inside shop cards, §5.6.7).
export function oofbuxDisc() {
  return el("span", "oof-pill-disc", "O");
}

// pill({ disc, icon, label, text, onClick }) -> the §5.6.3 pill, also used for HUD chips.
export function pill(opts = {}) {
  const interactive = typeof opts.onClick === "function";
  const node = el(interactive ? "button" : "div", `oof-pill${opts.className ? " " + opts.className : ""}`);
  if (interactive) {
    node.type = "button";
    node.addEventListener("click", opts.onClick);
  }
  if (opts.disc) node.appendChild(oofbuxDisc());
  if (opts.icon) node.appendChild(el("span", null, opts.icon));
  if (opts.label) node.appendChild(el("span", "oof-chip-label", opts.label));
  const value = el("span", "oof-pill-value", opts.text === undefined ? "" : opts.text);
  node.appendChild(value);
  if (opts.ariaLabel) node.setAttribute("aria-label", opts.ariaLabel);
  return node;
}

// segmented({ options:[{id,label}], value, onChange }) -> { el, setValue(id), getValue() }
export function segmented(opts = {}) {
  const options = Array.isArray(opts.options) ? opts.options : [];
  const root = el("div", "oof-seg");
  root.setAttribute("role", "radiogroup");
  let current = opts.value;
  const buttons = new Map();
  const paint = () => {
    for (const [id, node] of buttons) {
      const on = id === current;
      node.classList.toggle("is-on", on);
      node.setAttribute("aria-checked", on ? "true" : "false");
    }
  };
  for (const option of options) {
    const node = el("button", "oof-seg-opt", option.label);
    node.type = "button";
    node.setAttribute("role", "radio");
    node.addEventListener("click", () => {
      current = option.id;
      paint();
      if (typeof opts.onChange === "function") opts.onChange(option.id);
    });
    buttons.set(option.id, node);
    root.appendChild(node);
  }
  paint();
  return { el: root, setValue(id) { current = id; paint(); }, getValue: () => current };
}

// slider({ label, min, max, step, value, onInput, onRelease }) -> { el, setValue, getValue }
export function slider(opts = {}) {
  const row = el("div", "oof-row");
  if (opts.label) row.appendChild(el("span", null, opts.label));
  const input = el("input", "oof-slider");
  input.type = "range";
  input.min = String(opts.min ?? 0);
  input.max = String(opts.max ?? 100);
  input.step = String(opts.step ?? 1);
  input.value = String(opts.value ?? 0);
  if (opts.label) input.setAttribute("aria-label", opts.label);
  const readout = el("span", "oof-chip-label", input.value);
  input.addEventListener("input", () => {
    readout.textContent = input.value;
    if (typeof opts.onInput === "function") opts.onInput(Number(input.value));
  });
  input.addEventListener("change", () => {
    if (typeof opts.onRelease === "function") opts.onRelease(Number(input.value));
  });
  row.append(input, readout);
  return {
    el: row,
    setValue(v) { input.value = String(v); readout.textContent = input.value; },
    getValue: () => Number(input.value),
  };
}

// toggle({ label, value, onChange }) -> { el, setValue, getValue }
export function toggle(opts = {}) {
  const row = el("div", "oof-row");
  if (opts.label) row.appendChild(el("span", null, opts.label));
  const node = el("button", "oof-toggle");
  node.type = "button";
  node.setAttribute("role", "switch");
  node.setAttribute("aria-label", opts.label || "toggle");
  node.append(el("span", "oof-toggle-track"), el("span", "oof-toggle-knob"));
  let value = !!opts.value;
  const paint = () => {
    node.classList.toggle("is-on", value);
    node.setAttribute("aria-checked", value ? "true" : "false");
  };
  node.addEventListener("click", () => {
    value = !value;
    paint();
    if (typeof opts.onChange === "function") opts.onChange(value);
  });
  paint();
  row.appendChild(node);
  return { el: row, setValue(v) { value = !!v; paint(); }, getValue: () => value };
}

function shopCard(item, onSelect) {
  const card = el("button", "oof-grid-card");
  card.type = "button";
  if (item.equipped) card.classList.add("is-equipped");
  const icon = el("div", "oof-grid-icon");
  if (item.iconCanvas) icon.appendChild(item.iconCanvas);
  else icon.textContent = item.icon || "❓";
  card.append(icon, el("div", "oof-grid-name", item.name || item.id));
  if (item.owned) {
    card.appendChild(el("div", "oof-grid-owned", item.equipped ? "Equipped" : "Owned"));
  } else {
    const price = el("div", "oof-grid-price");
    price.append(oofbuxDisc(), el("span", null, formatOofbux(item.price || 0)));
    card.appendChild(price);
  }
  card.setAttribute("aria-label", `${item.name || item.id}${item.owned ? ", owned" : ""}`);
  if (typeof onSelect === "function") card.addEventListener("click", () => onSelect(item));
  return card;
}

// shopGrid({ items, onSelect }) -> HTMLElement. The Catalog and every in-game shop
// render through this so shops are identical across Places (§5.6.7).
export function shopGrid(spec = {}) {
  const grid = el("div", "oof-grid");
  for (const item of Array.isArray(spec.items) ? spec.items : []) {
    grid.appendChild(shopCard(item, spec.onSelect));
  }
  return grid;
}

// trapFocus(container) -> release(). Tab cycles inside, focus starts on the last
// focusable (dialogs default to their last button, §5.6.5), and release() restores
// the element that was focused when the trap was installed.
export function trapFocus(container) {
  const opener = document.activeElement;
  const nodes = () => Array.from(container.querySelectorAll(FOCUSABLE)).filter((n) => !n.disabled);
  const onKey = (ev) => {
    if (ev.key !== "Tab") return;
    const list = nodes();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    if (ev.shiftKey && (active === first || !container.contains(active))) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && active === last) {
      ev.preventDefault();
      first.focus();
    }
  };
  container.addEventListener("keydown", onKey);
  const list = nodes();
  if (list.length) list[list.length - 1].focus();
  return () => {
    container.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  };
}
