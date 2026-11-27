// input.js - desktop keyboard/mouse input + the shared action state that touch.js feeds (CONTRACT 5.4).
//   input.move {x,y} (live), input.look {dx,dy} (this frame), down(action), pressed(action), idleSeconds(),
//   invert(sec), mode ("keys"|"touch"), setEnabled(bool).
// Mouse: pointer lock (setting, default on) - click the canvas to lock, Esc unlocks -> input:menu. Without lock:
// a left press that moves < 6 px and lasts < 250 ms = attack, holding still = charging (heavy at >= 0.6 s),
// drag with any button = look. Right tap or Q = dodge. Wheel = camera distance. Typing in inputs never acts.

const ACTIONS = ["attack", "jump", "dodge", "interact", "sprint", "inventory", "menu"];

export function createInput(ctx, engine) {
  const bus = ctx.bus, state = ctx.state;
  const canvas = engine.renderer.domElement;
  const keys = new Set();
  const down = {}, pending = {}, pressedNow = {};
  for (const a of ACTIONS) { down[a] = false; pending[a] = false; pressedNow[a] = false; }
  const move = { x: 0, y: 0 };
  const look = { dx: 0, dy: 0 };
  const joy = { x: 0, y: 0, active: false };
  let rawDx = 0, rawDy = 0;
  let wheel = 0;
  let enabled = true;
  let lastInputGame = 0, lastActivityEmit = -1;
  let invertUntil = -1;
  let attackStart = -1;       // real time when attack went down (for held)
  let attackSource = null;    // "key" | "mouse" | "touch"
  let locked = false, selfExit = false, lastMenuEmit = -10;
  const ptr = { id: -1, x: 0, y: 0, t: 0, button: 0, drag: false, charging: false };

  const api = {
    move, look,
    mode: "keys",
    get enabled() { return enabled; },
    down(a) { return gameplay() && !!down[a]; },
    pressed(a) { return gameplay() && engine.loop.substep === 0 && !!pressedNow[a]; },
    idleSeconds() { return Math.max(0, engine.time - lastInputGame); },
    invert(sec) { invertUntil = engine.time + Math.max(0, sec || 0); },
    get inverted() { return engine.time < invertUntil; },
    setEnabled(v) { enabled = !!v; if (!enabled) releaseAll(); },
    get locked() { return locked; },
    get wheel() { return wheel; },
    // fed by touch.js
    // a release/reset (touch.js hides its controls with _joy(0,0,false)) is not touch activity: it used to flip a
    // desktop into touch mode and show the on-screen buttons
    _joy(x, y, active) { joy.x = x; joy.y = y; joy.active = !!active; if (active) activity("touch"); },
    _look(dx, dy) { rawDx += dx; rawDy += dy; activity("touch"); },
    _btn(a, isDown) { if (!isDown && !down[a]) return; setAction(a, isDown, "touch"); },
    _activity(src) { activity(src); },
    frameLatch,
    dispose
  };

  function typingTarget(t) { return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); }
  function gameplay() {
    return enabled && state.rt.playing && !state.rt.paused && !state.ui.modal;
  }
  function activity(src) {
    lastInputGame = engine.time;
    if (src === "touch" && api.mode !== "touch") { api.mode = "touch"; if (engine.touch) engine.touch._sawTouch(); }
    else if (src === "keys" && api.mode !== "keys") api.mode = "keys";
    const now = engine.realTime;
    if (now - lastActivityEmit >= 0.25) { lastActivityEmit = now; bus.emit("input:activity", { t: engine.time }); }
  }

  function setAction(a, isDown, src) {
    activity(src);
    if (isDown) {
      if (down[a]) return;
      down[a] = true; pending[a] = true;
      // menu / inventory work whenever the game is running (UI decides); the rest only during gameplay
      if (a === "menu") { emitMenu(); return; }
      if (a === "inventory") { if (state.rt.playing) bus.emit("input:inventory", {}); return; }
      if (!gameplay()) return;
      if (a === "attack") { attackStart = engine.realTime; attackSource = src; bus.emit("input:attack", { phase: "down", held: 0 }); }
      else if (a === "jump") bus.emit("input:jump", {});
      else if (a === "dodge") bus.emit("input:dodge", {});
      else if (a === "interact") bus.emit("input:interact", {});
    } else {
      if (!down[a]) return;
      down[a] = false;
      if (a === "attack" && attackStart >= 0) {
        const held = engine.realTime - attackStart;
        attackStart = -1;
        bus.emit("input:attack", { phase: "up", held });
      }
    }
  }
  function emitMenu() {
    const now = engine.realTime;
    if (now - lastMenuEmit < 0.3) return;
    lastMenuEmit = now;
    bus.emit("input:menu", {});
  }
  function releaseAll() {
    for (const a of ACTIONS) if (down[a]) setAction(a, false, api.mode);
    keys.clear();
    joy.x = joy.y = 0;
  }

  // ---- keyboard -------------------------------------------------------------------------------------------
  const KEYMAP = {
    Space: "jump", KeyF: "attack", KeyQ: "dodge", KeyE: "interact", ShiftLeft: "sprint", ShiftRight: "sprint",
    KeyI: "inventory", Tab: "inventory", Escape: "menu"
  };
  function onKeyDown(e) {
    if (typingTarget(e.target)) return;
    if (e.ctrlKey || e.metaKey) return;
    const code = e.code;
    if (code === "Tab" || code === "Space" || code.startsWith("Arrow")) e.preventDefault();
    keys.add(code);
    activity("keys");
    if (e.repeat) return;
    const a = KEYMAP[code];
    if (a === "menu" && locked) return; // the browser's unlock fires the menu instead
    if (a) setAction(a, true, "keys");
  }
  function onKeyUp(e) {
    keys.delete(e.code);
    const a = KEYMAP[e.code];
    if (a) setAction(a, false, "keys");
  }
  function onBlur() { releaseAll(); }

  // ---- mouse ----------------------------------------------------------------------------------------------
  function lockWanted() { return !!state.settings.pointerLock && state.rt.playing && !state.rt.paused && !state.ui.modal && state.ui.screen === "game"; }
  function onPointerDown(e) {
    if (e.pointerType === "touch") return; // touch.js handles touches
    activity("keys");
    if (locked) {
      if (e.button === 0) setAction("attack", true, "mouse");
      else if (e.button === 2) setAction("dodge", true, "mouse");
      return;
    }
    if (lockWanted() && e.button === 0 && canvas.requestPointerLock) {
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => { /* denied: fall back to drag mode */ });
      } catch (err) { /* ignore */ }
      return;
    }
    if (ptr.id !== -1) return;
    ptr.id = e.pointerId; ptr.x = e.clientX; ptr.y = e.clientY; ptr.t = engine.realTime; ptr.button = e.button; ptr.drag = false; ptr.charging = false;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onPointerMove(e) {
    if (e.pointerType === "touch") return;
    if (locked) {
      rawDx += e.movementX || 0; rawDy += e.movementY || 0;
      activity("keys");
      return;
    }
    if (e.pointerId !== ptr.id) return;
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (!ptr.drag && !ptr.charging && Math.hypot(dx, dy) >= 6) ptr.drag = true;
    if (ptr.drag) { rawDx += e.movementX || 0; rawDy += e.movementY || 0; }
    activity("keys");
  }
  function onPointerUp(e) {
    if (e.pointerType === "touch") return;
    if (locked) {
      if (e.button === 0) setAction("attack", false, "mouse");
      else if (e.button === 2) setAction("dodge", false, "mouse");
      return;
    }
    if (e.pointerId !== ptr.id) return;
    const dur = engine.realTime - ptr.t;
    if (!ptr.drag) {
      if (ptr.button === 0) {
        if (ptr.charging) setAction("attack", false, "mouse");
        else if (dur < 0.25) { setAction("attack", true, "mouse"); setAction("attack", false, "mouse"); }
      } else if (ptr.button === 2 && dur < 0.3) { setAction("dodge", true, "mouse"); setAction("dodge", false, "mouse"); }
    } else if (ptr.charging) setAction("attack", false, "mouse");
    ptr.id = -1; ptr.drag = false; ptr.charging = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onWheel(e) {
    if (e.ctrlKey) return;
    wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 100 + 0.4);
    activity("keys");
  }
  function onLockChange() {
    const was = locked;
    locked = document.pointerLockElement === canvas;
    if (was && !locked) {
      releaseAll();
      if (!selfExit && state.rt.playing && !state.ui.modal && state.ui.screen === "game") emitMenu();
      selfExit = false;
    }
  }
  function onContext(e) { e.preventDefault(); }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: true });
  canvas.addEventListener("contextmenu", onContext);
  document.addEventListener("pointerlockchange", onLockChange);
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });

  function dispose() {
    window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp);
    window.removeEventListener("blur", onBlur); canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove); window.removeEventListener("pointerup", onPointerUp);
    window.removeEventListener("pointercancel", onPointerUp); canvas.removeEventListener("wheel", onWheel);
    canvas.removeEventListener("contextmenu", onContext); document.removeEventListener("pointerlockchange", onLockChange);
  }

  // called once per frame before the systems: latch look, presses, move vector
  function frameLatch() {
    // release the lock whenever a menu/dialogue/cinematic takes over
    if (locked && !lockWanted()) { selfExit = true; try { document.exitPointerLock(); } catch (e) { /* ignore */ } }
    // mouse hold without moving -> charging attack
    if (ptr.id !== -1 && !ptr.drag && !ptr.charging && ptr.button === 0 && engine.realTime - ptr.t >= 0.25) {
      ptr.charging = true;
      setAction("attack", true, "mouse");
    }
    for (const a of ACTIONS) { pressedNow[a] = pending[a]; pending[a] = false; }
    const g = gameplay();
    const sens = state.settings.sensitivity || 1;
    look.dx = g || state.rt.playing ? rawDx * sens : 0;
    look.dy = (g || state.rt.playing ? rawDy * sens : 0) * (state.settings.invertY ? -1 : 1);
    rawDx = 0; rawDy = 0;
    let x = 0, y = 0;
    if (g) {
      if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
      if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
      if (keys.has("KeyW") || keys.has("ArrowUp")) y += 1;
      if (keys.has("KeyS") || keys.has("ArrowDown")) y -= 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      if (joy.active) { x += joy.x; y += joy.y; }
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      if (engine.time < invertUntil) { x = -x; y = -y; }
    }
    move.x = x; move.y = y;
    // joystick pushed to the rim counts as sprint on touch
    const sprintTouch = joy.active && Math.hypot(joy.x, joy.y) > 0.93;
    down.sprint = keys.has("ShiftLeft") || keys.has("ShiftRight") || sprintTouch;
  }
  api.consumeWheel = () => { const w = wheel; wheel = 0; return w; };
  return api;
}
