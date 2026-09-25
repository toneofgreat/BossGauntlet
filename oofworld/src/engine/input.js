// input.js — action-based input: keyboard + mouse (M1-T02); the touch overlay
// (virtual joystick, jump/action buttons, orbit/pinch fingers) is added by M1-T03
// into the marked section below. Owned by spec 02-engine-core.md §5.4 (module
// layout) and §3.7 (the InputAction enum).

// ===== SECTION: constants — owned by M1-T02 =====

// Fixed keyboard map (spec 02 §5.4; not rebindable in v1).
const KEY_TO_ACTION = Object.freeze({
  Space: "jump",
  KeyE: "action1",
  KeyQ: "action2",
  ShiftLeft: "shiftlock",
  Escape: "pause",
});
const MOVE_KEYS = new Set([
  "KeyW", "ArrowUp",
  "KeyS", "ArrowDown",
  "KeyA", "ArrowLeft",
  "KeyD", "ArrowRight",
]);
// preventDefault() on Space and arrows only (spec 02 §5.4).
const PREVENT_DEFAULT_KEYS = new Set(["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

const InputAction = Object.freeze(["jump", "action1", "action2", "shiftlock", "pause"]);
const KNOWN_ACTIONS = new Set(InputAction);
// "interact" is accepted as a legacy alias of "action1" (spec 02 §3.7).
const ACTION_ALIASES = Object.freeze({ interact: "action1" });

const RMB_BUTTON = 2;
const WHEEL_ZOOM = 1.5;       // spec 02 §6: 1.5 units per 100 deltaY
const SENSITIVITY_MIN = 0.5;  // spec 02 §5.4 setCameraSensitivity range
const SENSITIVITY_MAX = 2.0;

function normalizeAction(action) {
  return ACTION_ALIASES[action] || action;
}

export function createInput({ dom }) {
  // Digital (keyboard) movement state.
  const heldKeys = new Set();
  // Action held/edge state, keyed by canonical InputAction names.
  const heldActions = new Set();
  const pressedThisStep = new Set();
  const actionListeners = {
    jump: new Set(), action1: new Set(), action2: new Set(),
    shiftlock: new Set(), pause: new Set(),
  };
  const warnedActions = new Set();

  // Look/zoom accumulators — fed by mouse now, and by touch fingers once M1-T03
  // wires the overlay in (same accumulators, no double-rotation guard needed here:
  // physics.js is the sole place that turns getMoveVector() camera-relative).
  const lookAccum = { dx: 0, dy: 0 };
  let zoomAccum = 0;
  let sensitivity = 1.0;
  let invertY = false;
  let rmbActive = false;

  const cleanupFns = [];
  function addListener(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanupFns.push(() => target.removeEventListener(type, fn, opts));
  }

  function warnUnknownAction(action) {
    if (warnedActions.has(action)) return;
    warnedActions.add(action);
    console.warn(`input: unknown action "${action}"`);
  }

  // ===== SECTION: keyboard — owned by M1-T02 =====

  function isTypingTarget() {
    const el = document.activeElement;
    return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
  }

  function fireEdge(action) {
    pressedThisStep.add(action);
    for (const fn of actionListeners[action]) fn();
  }

  function onKeyDown(e) {
    // Keys are ignored entirely while a UI dialog input/textarea has focus.
    if (isTypingTarget()) return;
    if (PREVENT_DEFAULT_KEYS.has(e.code)) e.preventDefault();
    if (MOVE_KEYS.has(e.code)) {
      heldKeys.add(e.code);
      return;
    }
    const action = KEY_TO_ACTION[e.code];
    if (!action) return;
    // Guard against OS key-repeat re-firing the press edge.
    if (!heldActions.has(action)) {
      heldActions.add(action);
      fireEdge(action);
    }
  }

  function onKeyUp(e) {
    // Release is always processed (even if focus moved to a text field mid-hold)
    // so a key never gets stuck down.
    if (MOVE_KEYS.has(e.code)) {
      heldKeys.delete(e.code);
      return;
    }
    const action = KEY_TO_ACTION[e.code];
    if (!action) return;
    heldActions.delete(action);
  }

  addListener(window, "keydown", onKeyDown);
  addListener(window, "keyup", onKeyUp);

  function getMoveVector() {
    const forward = heldKeys.has("KeyW") || heldKeys.has("ArrowUp");
    const back = heldKeys.has("KeyS") || heldKeys.has("ArrowDown");
    const left = heldKeys.has("KeyA") || heldKeys.has("ArrowLeft");
    const right = heldKeys.has("KeyD") || heldKeys.has("ArrowRight");
    let x = (right ? 1 : 0) - (left ? 1 : 0);
    let z = (forward ? 1 : 0) - (back ? 1 : 0);
    // Diagonals normalized: combined magnitude clamped to 1 (spec 02 §5.4).
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    // Touch joystick (M1-T03) is an independent analog source sharing the same
    // control-space contract; sum then re-clamp so magnitude stays <= 1 regardless
    // of which source (or both) is active.
    x += touchMoveVector.x;
    z += touchMoveVector.z;
    const total = Math.hypot(x, z);
    if (total > 1) {
      x /= total;
      z /= total;
    }
    return { x, z };
  }

  // ===== SECTION: mouse (RMB orbit, wheel zoom, pointer lock) — owned by M1-T02 =====

  function accumulateLook(dx, dy) {
    lookAccum.dx += dx * sensitivity;
    lookAccum.dy += (invertY ? -dy : dy) * sensitivity;
  }

  function onContextMenu(e) {
    e.preventDefault();
  }

  function onPointerDown(e) {
    if (e.button !== RMB_BUTTON) return;
    rmbActive = true;
    try {
      dom.setPointerCapture(e.pointerId);
    } catch {
      // Capture can legitimately fail if the pointer was already released.
    }
  }

  function onPointerMove(e) {
    // Shift-lock pointer lock: movementX/Y accumulate unconditionally, no button
    // needed (camera.js/setShiftLock owns the requestPointerLock() call on the
    // canvas; this only needs to know a lock is currently held by the page).
    if (document.pointerLockElement) {
      accumulateLook(e.movementX, e.movementY);
      return;
    }
    if (rmbActive) accumulateLook(e.movementX, e.movementY);
  }

  function onPointerUp(e) {
    if (e.button !== RMB_BUTTON) return;
    rmbActive = false;
    try {
      dom.releasePointerCapture(e.pointerId);
    } catch {
      // Already released (e.g. by a pointercancel) — nothing to do.
    }
  }

  function onWheel(e) {
    e.preventDefault();
    // deltaY/100 * -WHEEL_ZOOM: wheel-up (negative deltaY) zooms in (spec 02 §5.4).
    zoomAccum += (e.deltaY / 100) * -WHEEL_ZOOM;
  }

  addListener(dom, "contextmenu", onContextMenu);
  addListener(dom, "pointerdown", onPointerDown);
  addListener(dom, "pointermove", onPointerMove);
  addListener(dom, "pointerup", onPointerUp);
  addListener(dom, "wheel", onWheel, { passive: false });
  // LMB is intentionally not consumed here — it belongs to UI/click-to-interact
  // layers above the engine (spec 02 §5.4).

  // ===== SECTION: action query & subscription API — owned by M1-T02 =====

  function isDown(action) {
    const a = normalizeAction(action);
    if (!KNOWN_ACTIONS.has(a)) {
      warnUnknownAction(a);
      return false;
    }
    return heldActions.has(a);
  }

  function isJumpHeld() {
    return isDown("jump");
  }

  function wasPressed(action) {
    const a = normalizeAction(action);
    if (!KNOWN_ACTIONS.has(a)) return false;
    return pressedThisStep.has(a);
  }

  function onAction(action, fn) {
    const a = normalizeAction(action);
    if (!actionListeners[a]) {
      warnUnknownAction(a);
      return () => {};
    }
    actionListeners[a].add(fn);
    return () => actionListeners[a].delete(fn);
  }

  function endStep() {
    pressedThisStep.clear();
  }

  // ===== SECTION: look/zoom delta consumption + sensitivity settings — owned by M1-T02 =====

  function setCameraSensitivity(v) {
    sensitivity = Math.min(SENSITIVITY_MAX, Math.max(SENSITIVITY_MIN, v));
  }

  function setInvertY(b) {
    invertY = !!b;
  }

  function consumeLookDelta() {
    const out = { dx: lookAccum.dx, dy: lookAccum.dy };
    lookAccum.dx = 0;
    lookAccum.dy = 0;
    return out;
  }

  function consumeZoomDelta() {
    const out = zoomAccum;
    zoomAccum = 0;
    return out;
  }

  // ===== SECTION: touch overlay — owned by M1-T03 =====
  // Builds the <div id="oof-touch"> overlay (joystick, jump + up to two action
  // buttons, orbit/pinch camera fingers). Its joystick vector merges into
  // getMoveVector() above (touchMoveVector); its camera/pinch fingers feed the
  // same lookAccum/zoomAccum consumed by consumeLookDelta()/consumeZoomDelta()
  // above via accumulateLook() and zoomAccum directly (mouse section, M1-T02 —
  // reused here unmodified). All DOM listeners go through addListener() so
  // dispose() below already covers them. Spec: docs/specs/02-engine-core.md
  // §5.4 "Touch overlay"; geometry/tuning values are its §6 table.

  let touchStarted = false;
  const coarsePointerAtCreation =
    typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  function isTouch() {
    return touchStarted || coarsePointerAtCreation;
  }

  // ---- geometry constants (spec 02 §6) ----
  const JOY_BASE_D = 128;
  const JOY_KNOB_D = 56;
  const JOY_THROW = 56;          // px, max knob throw == deadzone normalization base
  const JOY_DEADZONE = 0.15;
  const JOY_EDGE_CLAMP = 72;     // px, base spawn kept this far from every dom edge
  const JUMP_D = 88;
  const ACTION_D = 68;
  const HINT_DELAY_MS = 2000;
  const TOUCH_ORBIT_MULT = 1.7;  // touch look delta scaled relative to mouse
  const PINCH_ZOOM = 0.03;       // units per px of spread change

  // Static-layout offsets: {off} = px from the safe-area edge to the element's
  // *near* edge (i.e. spec's center-distance minus half the element's diameter);
  // {bottom} = px from the safe-area bottom edge, same conversion. Landscape vs.
  // portrait rows are spec 02 §5.4's table verbatim, pre-converted from center
  // coordinates to edge coordinates so plain CSS left/right+bottom positions them.
  const LAYOUT = Object.freeze({
    landscape: {
      hint: { off: 88 - JOY_BASE_D / 2, bottom: 88 - JOY_BASE_D / 2 },
      jump: { off: 76 - JUMP_D / 2, bottom: 84 - JUMP_D / 2 },
      action1: { off: 168 - ACTION_D / 2, bottom: 156 - ACTION_D / 2 },
    },
    portrait: {
      hint: { off: 80 - JOY_BASE_D / 2, bottom: 120 - JOY_BASE_D / 2 },
      jump: { off: 68 - JUMP_D / 2, bottom: 116 - JUMP_D / 2 },
      action1: { off: 68 - ACTION_D / 2, bottom: 224 - ACTION_D / 2 },
    },
  });
  // Vertical gap between the stacked action buttons: not a numbered constant in
  // spec 02's tuning table (only "stacked above it, same 68 px spec" is given) —
  // chosen large enough that the two 68px circles never touch.
  const ACTION_STACK_GAP = 12;

  const TOUCH_BG = "var(--oof-ui-bg, rgba(20,24,34,.35))";
  const TOUCH_BORDER = "2px solid var(--oof-ui-line, rgba(255,255,255,.4))";
  const TOUCH_PRESSED_BG = "var(--oof-accent-dim, rgba(255,255,255,.28))";
  const TOUCH_TEXT = "var(--oof-text, #fff)";
  const TOUCH_ACCENT = "var(--oof-accent, rgba(255,255,255,.75))";
  const TOUCH_HINT_BORDER = "2px dashed var(--oof-ui-line, rgba(255,255,255,.25))";

  // ---- DOM ----
  const overlayRoot = document.createElement("div");
  overlayRoot.id = "oof-touch";
  Object.assign(overlayRoot.style, {
    position: "absolute", inset: "0", pointerEvents: "none", zIndex: "40",
  });

  const zoneEl = document.createElement("div");
  zoneEl.id = "oof-touch-zone";
  Object.assign(zoneEl.style, {
    position: "absolute", bottom: "0", background: "transparent",
    pointerEvents: "auto", touchAction: "none",
  });

  // pointerEvents "none" is the default here and it is load-bearing, not cosmetic.
  // The joystick's hit target is zoneEl; hintEl (the dashed ring that TELLS the player
  // where to put their thumb) and baseEl/knobEl are drawn on top of it. With
  // pointerEvents "auto" they win the hit test, onTouchStart's `target === zoneEl`
  // check fails, and the finger falls through to the camera-orbit branch — so on a
  // phone the stick was dead in exactly the 128 px circle the UI points at, and dead
  // again wherever the stick had last spawned. makeButton (below) restores "auto" for
  // the three circles that really are buttons.
  function makeCircle(id, diameter) {
    const el = document.createElement("div");
    if (id) el.id = id;
    Object.assign(el.style, {
      position: "absolute", width: diameter + "px", height: diameter + "px",
      borderRadius: "50%", boxSizing: "border-box", pointerEvents: "none",
      touchAction: "none", display: "none",
    });
    return el;
  }

  const hintEl = makeCircle("oof-touch-hint", JOY_BASE_D);
  Object.assign(hintEl.style, { border: TOUCH_HINT_BORDER, opacity: "0.5" });

  const baseEl = makeCircle("oof-touch-base", JOY_BASE_D);
  Object.assign(baseEl.style, { background: TOUCH_BG, border: TOUCH_BORDER });

  const knobEl = makeCircle("oof-touch-knob", JOY_KNOB_D);
  Object.assign(knobEl.style, {
    background: TOUCH_ACCENT, left: "50%", top: "50%",
    marginLeft: -JOY_KNOB_D / 2 + "px", marginTop: -JOY_KNOB_D / 2 + "px",
    display: "block",
  });
  baseEl.appendChild(knobEl);

  function makeButton(id, diameter, fontPx) {
    const el = makeCircle(id, diameter);
    Object.assign(el.style, {
      pointerEvents: "auto", // a button IS its own hit target (see makeCircle)
      background: TOUCH_BG, border: TOUCH_BORDER, color: TOUCH_TEXT,
      alignItems: "center", justifyContent: "center", userSelect: "none",
      fontSize: fontPx + "px", fontWeight: "700",
    });
    return el;
  }

  const jumpEl = makeButton("oof-touch-jump", JUMP_D, 28);
  jumpEl.textContent = "⭡";
  const action1El = makeButton("oof-touch-action1", ACTION_D, 16);
  const action2El = makeButton("oof-touch-action2", ACTION_D, 16);

  overlayRoot.append(zoneEl, hintEl, baseEl, jumpEl, action1El, action2El);
  dom.appendChild(overlayRoot);

  // ---- layout (static elements: zone, hint, jump, action buttons) ----

  function isLeftHanded() {
    return !!(document.body && document.body.classList.contains("oof-left-handed"));
  }

  function setEdge(el, edge, offPx, bottomPx) {
    el.style.left = "";
    el.style.right = "";
    el.style[edge] = `calc(env(safe-area-inset-${edge}, 0px) + ${offPx}px)`;
    el.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${bottomPx}px)`;
  }

  function layoutStatic() {
    const portrait = window.innerHeight > window.innerWidth;
    const mirrored = isLeftHanded();
    const geo = portrait ? LAYOUT.portrait : LAYOUT.landscape;

    // Left-handed swaps sides wholesale: stick zone/hint move to the thumb that
    // used to hold buttons, and vice versa (spec 06 §5.6.1 "input.js mirrors its
    // zone logic"); the numeric offsets themselves are unchanged, only the edge
    // they're measured from flips.
    zoneEl.style.left = mirrored ? "" : "0";
    zoneEl.style.right = mirrored ? "0" : "";
    zoneEl.style.width = (portrait ? 50 : 45) + "%";
    zoneEl.style.height = (portrait ? 55 : 65) + "%";

    setEdge(hintEl, mirrored ? "right" : "left", geo.hint.off, geo.hint.bottom);
    setEdge(jumpEl, mirrored ? "left" : "right", geo.jump.off, geo.jump.bottom);
    setEdge(action1El, mirrored ? "left" : "right", geo.action1.off, geo.action1.bottom);
    setEdge(
      action2El, mirrored ? "left" : "right",
      geo.action1.off, geo.action1.bottom + ACTION_D + ACTION_STACK_GAP
    );
  }

  let bodyObserver = null;
  if (typeof MutationObserver === "function" && document.body) {
    // `settings.leftHanded` "applies immediately" (spec 06 §5.6.9); the shell only
    // toggles a body class, so watch for it rather than exposing a setter here.
    bodyObserver = new MutationObserver(layoutStatic);
    bodyObserver.observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  addListener(window, "resize", layoutStatic);
  addListener(window, "orientationchange", layoutStatic);
  layoutStatic();

  // ---- visibility ----

  let label1 = null;
  let label2 = null;
  let hintVisible = true;
  let hintTimer = null;

  function clearHintTimer() {
    if (hintTimer !== null) {
      clearTimeout(hintTimer);
      hintTimer = null;
    }
  }

  function renderVisibility() {
    const shown = isTouch();
    hintEl.style.display = shown && hintVisible ? "" : "none";
    jumpEl.style.display = shown ? "flex" : "none";
    action1El.style.display = shown && label1 ? "flex" : "none";
    action2El.style.display = shown && label2 ? "flex" : "none";
  }

  renderVisibility();

  // ---- joystick ----

  let stickId = null;
  let stickCenterX = 0;
  let stickCenterY = 0;
  const touchMoveVector = { x: 0, z: 0 };

  function clampSpawn(x, y) {
    const rect = dom.getBoundingClientRect();
    const minX = rect.left + JOY_EDGE_CLAMP;
    const maxX = Math.max(minX, rect.right - JOY_EDGE_CLAMP);
    const minY = rect.top + JOY_EDGE_CLAMP;
    const maxY = Math.max(minY, rect.bottom - JOY_EDGE_CLAMP);
    return { x: Math.min(Math.max(x, minX), maxX), y: Math.min(Math.max(y, minY), maxY) };
  }

  function showBase(cx, cy) {
    const rect = overlayRoot.getBoundingClientRect();
    baseEl.style.left = cx - rect.left - JOY_BASE_D / 2 + "px";
    baseEl.style.top = cy - rect.top - JOY_BASE_D / 2 + "px";
    baseEl.style.display = "block";
    knobEl.style.transform = "translate(0px, 0px)";
    hintVisible = false;
    clearHintTimer();
    renderVisibility();
  }

  function updateStick(touch) {
    const dx = touch.clientX - stickCenterX;
    const dy = touch.clientY - stickCenterY;
    const len = Math.hypot(dx, dy);
    const knobLen = Math.min(len, JOY_THROW);
    knobEl.style.transform = len > 0
      ? `translate(${(dx / len) * knobLen}px, ${(dy / len) * knobLen}px)`
      : "translate(0px, 0px)";
    const raw = Math.min(len, JOY_THROW) / JOY_THROW;
    if (len === 0 || raw < JOY_DEADZONE) {
      touchMoveVector.x = 0;
      touchMoveVector.z = 0;
      return;
    }
    // Re-normalized so full deflection (raw = 1) still yields magnitude 1.
    const m = (raw - JOY_DEADZONE) / (1 - JOY_DEADZONE);
    touchMoveVector.x = (dx / len) * m;
    touchMoveVector.z = -(dy / len) * m;   // screen-up = forward
  }

  function endStick() {
    stickId = null;
    touchMoveVector.x = 0;
    touchMoveVector.z = 0;
    baseEl.style.display = "none";
    hintVisible = false;
    clearHintTimer();
    hintTimer = setTimeout(() => {
      hintTimer = null;
      hintVisible = true;
      renderVisibility();
    }, HINT_DELAY_MS);
    renderVisibility();
  }

  // ---- jump / action buttons ----

  let jumpId = null;
  let action1Id = null;
  let action2Id = null;

  function pressAction(action, el) {
    if (!heldActions.has(action)) {
      heldActions.add(action);
      fireEdge(action);
    }
    el.style.background = TOUCH_PRESSED_BG;
  }

  function releaseAction(action, el) {
    heldActions.delete(action);
    el.style.background = TOUCH_BG;
  }

  function setActionButtons(labels) {
    const arr = Array.isArray(labels) ? labels : [labels, null];
    label1 = arr[0] ? String(arr[0]).slice(0, 4) : null;
    label2 = arr[1] ? String(arr[1]).slice(0, 4) : null;
    action1El.textContent = label1 || "";
    action2El.textContent = label2 || "";
    renderVisibility();
  }

  function setActionButton(label) {
    setActionButtons([label, null]);
  }

  // ---- camera orbit / pinch fingers ----

  const cameraIds = [];
  const cameraLast = new Map();
  let pinchSpread = null;

  function spreadBetween(idA, idB) {
    const a = cameraLast.get(idA);
    const b = cameraLast.get(idB);
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : null;
  }

  function touchById(touchList, id) {
    for (let i = 0; i < touchList.length; i++) {
      if (touchList[i].identifier === id) return touchList[i];
    }
    return null;
  }

  // ---- touch event wiring ----

  function onTouchStart(e) {
    touchStarted = true;
    renderVisibility();
    // Indexed loop: TouchList iterability is not assumed (§5.7.3 house style
    // favors the most portable form).
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const target = touch.target;
      if (target === zoneEl && stickId === null) {
        stickId = touch.identifier;
        const spawn = clampSpawn(touch.clientX, touch.clientY);
        stickCenterX = spawn.x;
        stickCenterY = spawn.y;
        showBase(spawn.x, spawn.y);
        e.preventDefault();
        continue;
      }
      if (target === jumpEl && jumpId === null) {
        jumpId = touch.identifier;
        pressAction("jump", jumpEl);
        e.preventDefault();
        continue;
      }
      if (target === action1El && action1Id === null) {
        action1Id = touch.identifier;
        pressAction("action1", action1El);
        e.preventDefault();
        continue;
      }
      if (target === action2El && action2Id === null) {
        action2Id = touch.identifier;
        pressAction("action2", action2El);
        e.preventDefault();
        continue;
      }
      if (cameraIds.length < 2) {
        cameraIds.push(touch.identifier);
        cameraLast.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
        pinchSpread = cameraIds.length === 2 ? spreadBetween(cameraIds[0], cameraIds[1]) : null;
        e.preventDefault();
      }
    }
  }

  function onTouchMove(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === stickId) {
        updateStick(touch);
        e.preventDefault();
        continue;
      }
      if (cameraIds.includes(touch.identifier)) {
        const prev = cameraLast.get(touch.identifier);
        cameraLast.set(touch.identifier, { x: touch.clientX, y: touch.clientY });
        if (cameraIds.length === 1) {
          if (prev) {
            accumulateLook(
              (touch.clientX - prev.x) * TOUCH_ORBIT_MULT,
              (touch.clientY - prev.y) * TOUCH_ORBIT_MULT
            );
          }
        } else if (cameraIds.length === 2) {
          const spread = spreadBetween(cameraIds[0], cameraIds[1]);
          if (spread !== null && pinchSpread !== null) {
            zoomAccum += (spread - pinchSpread) * PINCH_ZOOM;
          }
          pinchSpread = spread;
        }
        e.preventDefault();
      }
    }
  }

  function onTouchEndOrCancel(e) {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === stickId) {
        endStick();
        continue;
      }
      if (touch.identifier === jumpId) {
        jumpId = null;
        releaseAction("jump", jumpEl);
        continue;
      }
      if (touch.identifier === action1Id) {
        action1Id = null;
        releaseAction("action1", action1El);
        continue;
      }
      if (touch.identifier === action2Id) {
        action2Id = null;
        releaseAction("action2", action2El);
        continue;
      }
      const idx = cameraIds.indexOf(touch.identifier);
      if (idx !== -1) {
        cameraIds.splice(idx, 1);
        cameraLast.delete(touch.identifier);
        pinchSpread = null;
        // Exiting pinch: reseed the surviving finger's last position from the
        // live touch list so its next move doesn't register a jump delta.
        if (cameraIds.length === 1) {
          const remaining = touchById(e.touches, cameraIds[0]);
          if (remaining) cameraLast.set(cameraIds[0], { x: remaining.clientX, y: remaining.clientY });
        }
      }
    }
  }

  addListener(dom, "touchstart", onTouchStart, { passive: false });
  addListener(dom, "touchmove", onTouchMove, { passive: false });
  addListener(dom, "touchend", onTouchEndOrCancel, { passive: false });
  addListener(dom, "touchcancel", onTouchEndOrCancel, { passive: false });

  cleanupFns.push(() => {
    clearHintTimer();
    if (bodyObserver) bodyObserver.disconnect();
    overlayRoot.remove();
  });

  // ===== end sections =====

  function dispose() {
    for (const remove of cleanupFns.splice(0)) remove();
  }

  return {
    getMoveVector,
    isDown,
    isJumpHeld,
    wasPressed,
    onAction,
    setCameraSensitivity,
    setInvertY,
    endStep,
    consumeLookDelta,
    consumeZoomDelta,
    isTouch,
    setActionButtons,
    setActionButton,
    dispose,
  };
}
