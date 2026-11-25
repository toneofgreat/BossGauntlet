// input.js - keyboard + touch + gamepad -> one input byte per sim step. (INTEGRATE owns after the foundation.)
// Only play-mode movement lives here; screens add their own listeners for UI keys and remove them on exit.
import { IN_LEFT, IN_RIGHT, IN_JUMP } from "./sim/constants.js";

const KEYMAP = {
  ArrowLeft: IN_LEFT, KeyA: IN_LEFT,
  ArrowRight: IN_RIGHT, KeyD: IN_RIGHT,
  Space: IN_JUMP, ArrowUp: IN_JUMP, KeyW: IN_JUMP, KeyZ: IN_JUMP, KeyK: IN_JUMP,
};

// createInput(touchRoot) : touchRoot is an element that will hold the on-screen buttons.
export function createInput(touchRoot) {
  let keyBits = 0, touchBits = 0, override = null;
  const down = new Set();
  const recalc = () => { keyBits = 0; for (const c of down) keyBits |= KEYMAP[c] || 0; };
  const isTyping = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };
  const onDown = (e) => {
    if (isTyping(e)) return;
    if (KEYMAP[e.code]) { down.add(e.code); recalc(); if (active) e.preventDefault(); }
  };
  const onUp = (e) => { if (down.delete(e.code)) recalc(); };
  const onBlur = () => { down.clear(); recalc(); touchBits = 0; pointers.clear(); };
  window.addEventListener("keydown", onDown);
  window.addEventListener("keyup", onUp);
  window.addEventListener("blur", onBlur);

  // touch buttons: [<] [>] on the left, [JUMP] on the right. Multi-touch via pointer events.
  const pointers = new Map(); // pointerId -> bit
  let active = false;
  const wrap = document.createElement("div");
  wrap.className = "touch-controls";
  wrap.innerHTML = `<div class="tc-left"><button data-bit="${IN_LEFT}" aria-label="Left">&#9664;</button><button data-bit="${IN_RIGHT}" aria-label="Right">&#9654;</button></div>
    <div class="tc-right"><button data-bit="${IN_JUMP}" aria-label="Jump">&#9650;</button></div>`;
  touchRoot.appendChild(wrap);
  const bitAt = (x, y) => { const el = document.elementFromPoint(x, y); const b = el && el.closest && el.closest("[data-bit]"); return b ? +b.dataset.bit : 0; };
  const retouch = () => { touchBits = 0; for (const b of pointers.values()) touchBits |= b; };
  wrap.addEventListener("pointerdown", (e) => { e.preventDefault(); pointers.set(e.pointerId, bitAt(e.clientX, e.clientY)); retouch(); });
  wrap.addEventListener("pointermove", (e) => { if (pointers.has(e.pointerId)) { pointers.set(e.pointerId, bitAt(e.clientX, e.clientY)); retouch(); } });
  const end = (e) => { pointers.delete(e.pointerId); retouch(); };
  wrap.addEventListener("pointerup", end); wrap.addEventListener("pointercancel", end); wrap.addEventListener("pointerleave", end);
  wrap.addEventListener("contextmenu", (e) => e.preventDefault());

  // touch UI: phones/tablets (coarse pointer) or as soon as any real touch happens
  let isTouch = !!(window.matchMedia && window.matchMedia("(pointer: coarse)").matches);
  window.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch" && !isTouch) { isTouch = true; if (active) wrap.classList.add("on"); } }, { capture: true });

  function padBits() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let b = 0;
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (ax < -0.4 || (p.buttons[14] && p.buttons[14].pressed)) b |= IN_LEFT;
      if (ax > 0.4 || (p.buttons[15] && p.buttons[15].pressed)) b |= IN_RIGHT;
      if ((p.buttons[0] && p.buttons[0].pressed) || (p.buttons[1] && p.buttons[1].pressed) || (p.buttons[12] && p.buttons[12].pressed)) b |= IN_JUMP;
    }
    return b;
  }

  return {
    // current input byte (IN_LEFT|IN_RIGHT|IN_JUMP)
    bits() { if (override !== null) return override; return keyBits | touchBits | padBits(); },
    // debug/test seam: force the input byte (null = back to real devices)
    setOverride(b) { override = b === null || b === undefined ? null : b | 0; },
    // show the on-screen buttons (only on touch devices unless force=true) while playing
    setActive(on, force = false) { active = !!on; wrap.classList.toggle("on", !!on && (isTouch || force)); if (!on) { pointers.clear(); touchBits = 0; } },
    get isTouch() { return isTouch; },
    clear: onBlur,
  };
}
