// dom.js - tiny DOM helpers shared by the UI files (only called from init-time code, never at import).

/** el("div.tn-x.on", { text, html, attrs, on:{click} }, [children]) */
export function el(spec, opts, kids) {
  const parts = String(spec).split(".");
  const node = document.createElement(parts[0] || "div");
  if (parts.length > 1) node.className = parts.slice(1).join(" ");
  if (opts) {
    if (opts.text !== undefined) node.textContent = opts.text;
    if (opts.html !== undefined) node.innerHTML = opts.html;
    if (opts.attrs) for (const k in opts.attrs) node.setAttribute(k, opts.attrs[k]);
    if (opts.on) for (const k in opts.on) node.addEventListener(k, opts.on[k]);
    if (opts.style) Object.assign(node.style, opts.style);
  }
  if (kids) for (const k of kids) if (k) node.appendChild(typeof k === "string" ? document.createTextNode(k) : k);
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** next animation frame (resolves even if rAF is throttled, after 100 ms) */
export function frame() {
  return new Promise((r) => {
    let done = false;
    const go = () => { if (!done) { done = true; r(); } };
    try { requestAnimationFrame(go); } catch (e) { /* */ }
    setTimeout(go, 100);
  });
}

/** a button that plays the UI click sound through ctx.audio */
export function makeButtonFactory(ctx) {
  return function button(label, cls, onClick) {
    const b = el("button" + (cls ? "." + cls : ""), { text: label, attrs: { type: "button" } });
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      sfx(ctx, "ui_click");
      try { onClick && onClick(e); } catch (err) { console.warn("[ui]", err); }
    });
    b.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") sfx(ctx, "ui_hover", 0.5); });
    return b;
  };
}

export function sfx(ctx, id, vol) {
  try { const a = ctx.audio; if (a && a.sfx) a.sfx(id, vol !== undefined ? { vol } : undefined); } catch (e) { /* */ }
}

export function isTyping(t) { return !!(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)); }

export function reduceFlashing(ctx) { return !!(ctx.state && ctx.state.settings && ctx.state.settings.reduceFlashing); }
