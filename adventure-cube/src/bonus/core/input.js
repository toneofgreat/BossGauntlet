// input.js - bonus-level input on top of app.input (CORE owns; API frozen: BONUS.md 8.2). DOM.
// Movement + jump come from app.input.bits() (keyboard, the main game's touch L/R/JUMP buttons, gamepad).
// This adds: ACTION / USE / UP / DOWN bits, pointer aiming (mouse and touch on the canvas), hotbar keys + wheel,
// gamepad X/Y/LB/RB/Start, and press()/release()/pulse() for on-screen buttons (CRAFT's touch buttons).
//   const bi = createBonusInput(app, { onHotbar(i | "+1" | "-1"), onKey(e) -> bool })
//   bi.bits()            -> B_* bits for THIS step (consumes pulses; call exactly once per sim step)
//   bi.aim(camera)       -> { tx, ty } tile under the pointer while the pointer is "live", else null
//   bi.press(bit) / bi.release(bit) / bi.pulse(bit)   (on-screen buttons; pulse = one step)
//   bi.padEdges()        -> { start, lb, rb } fresh gamepad presses since the last call
//   bi.destroy()
import { B_ACTION, B_USE, B_UP, B_DOWN } from "./const.js";

const KEY_BITS = { KeyJ: B_ACTION, KeyX: B_ACTION, KeyF: B_USE, KeyC: B_USE, KeyS: B_DOWN, ArrowDown: B_DOWN, KeyW: B_UP, ArrowUp: B_UP };

export function createBonusInput(app, hooks = {}) {
  const canvas = app.canvas;
  const down = new Set();
  let held = 0, pulses = 0, mouseBits = 0;
  let px = 0, py = 0, live = 0, pointerOn = false; // live = performance.now() until which the pointer aims
  const L = [];
  const on = (t, e, f, o) => { t.addEventListener(e, f, o); L.push([t, e, f, o]); };
  const typing = (e) => { const t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); };

  on(window, "keydown", (e) => {
    if (typing(e)) return;
    if (hooks.onKey && hooks.onKey(e)) { e.preventDefault(); return; }
    if (KEY_BITS[e.code]) { down.add(e.code); if (KEY_BITS[e.code] === B_USE && !e.repeat) pulses |= B_USE; }
    if (/^Digit[1-9]$/.test(e.code) && hooks.onHotbar) hooks.onHotbar(+e.code.slice(5) - 1);
  });
  on(window, "keyup", (e) => { down.delete(e.code); });
  on(window, "blur", () => { down.clear(); mouseBits = 0; held = 0; });
  // pointer on the canvas: mouse = aim + left hold ACTION + right click USE; touch = aim at the finger + hold ACTION
  const setPt = (e) => { px = e.clientX; py = e.clientY; };
  on(canvas, "pointermove", (e) => { setPt(e); if (e.pointerType === "mouse") live = performance.now() + 4000; });
  on(canvas, "pointerdown", (e) => {
    setPt(e); pointerOn = true;
    live = performance.now() + (e.pointerType === "mouse" ? 4000 : 2500);
    if (e.button === 2) pulses |= B_USE; else { mouseBits |= B_ACTION; pulses |= B_ACTION; }
    try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* ok */ }
  });
  const up = (e) => { pointerOn = false; if (e.button !== 2) mouseBits &= ~B_ACTION; };
  on(canvas, "pointerup", up); on(canvas, "pointercancel", up);
  on(canvas, "contextmenu", (e) => e.preventDefault());
  on(canvas, "wheel", (e) => { if (hooks.onHotbar) hooks.onHotbar(e.deltaY > 0 ? "+1" : "-1"); e.preventDefault(); }, { passive: false });

  let padPrev = {};
  function padBits() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let b = 0;
    for (const p of pads) {
      if (!p) continue;
      if (p.buttons[2] && p.buttons[2].pressed) b |= B_ACTION;
      if (p.buttons[3] && p.buttons[3].pressed) b |= B_USE;
      if ((p.buttons[13] && p.buttons[13].pressed) || (p.axes[1] || 0) > 0.6) b |= B_DOWN;
      if ((p.axes[1] || 0) < -0.6) b |= B_UP;
    }
    return b;
  }
  return {
    bits() {
      let b = app.input.bits() | held | mouseBits | pulses | padBits();
      for (const c of down) b |= KEY_BITS[c] || 0;
      pulses = 0;
      return b;
    },
    aim(cam) {
      if (performance.now() > live && !pointerOn) return null;
      const w = cam.screenToWorld(px, py);
      return { tx: Math.floor(w.x / 32), ty: Math.floor(w.y / 32) };
    },
    press(bit) { held |= bit; pulses |= bit; },
    release(bit) { held &= ~bit; },
    pulse(bit) { pulses |= bit; },
    clearAim() { live = 0; pointerOn = false; mouseBits = 0; },
    padEdges() {
      const out = { start: false, lb: false, rb: false };
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const now = {};
      for (const p of pads) { if (!p) continue; now.start = now.start || !!(p.buttons[9] && p.buttons[9].pressed); now.lb = now.lb || !!(p.buttons[4] && p.buttons[4].pressed); now.rb = now.rb || !!(p.buttons[5] && p.buttons[5].pressed); }
      for (const k in out) out[k] = !!now[k] && !padPrev[k];
      padPrev = now;
      return out;
    },
    get pointerLive() { return performance.now() <= live || pointerOn; },
    destroy() { for (const [t, e, f, o] of L) t.removeEventListener(e, f, o); L.length = 0; down.clear(); held = mouseBits = pulses = 0; },
  };
}
