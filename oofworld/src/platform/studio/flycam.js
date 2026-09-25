// src/platform/studio/flycam.js — Oof Studio's free-fly camera and the full-viewport
// interaction layer every edit-mode pointer goes through. Spec 11 §5.3.
//
// The stage element is the reason this module owns input at all: it sits ABOVE the
// engine's touch overlay (z 40) at z 60, so input.js never sees an edit-mode touch and
// the avatar can never be driven while you are building. editor.js and gizmo.js attach
// their own listeners to this same element in the CAPTURE phase and stopPropagation
// when they consume a pointer, which is how "gizmo hit test runs first on pointerdown"
// (§5.3 touch rule 2) is enforced without a cross-module claim protocol.

import * as THREE from "../../../assets/vendor/three.module.js";

// ---- tuning constants, spec 11 §6 (the single source for these numbers) -----------
const FLY_SPEED = 30; // units/s
const FLY_FAST_MULT = 3; // Shift
const FLY_LOOK = 0.0052; // rad/px, same as spec 02's ORBIT_SENS
const TOUCH_LOOK_MULT = 1.7;
const WHEEL_FLY = 4; // units per 100 deltaY
const PINCH_FLY = 0.06; // units per px of spread change
const PITCH_CLAMP = 89; // degrees
const FOCUS_MIN_DIST = 6;
const FOCUS_RADIUS_MULT = 2.2;

// Touch geometry — the same numbers spec 02 §6 uses for the gameplay joystick, so the
// control under your thumb in Studio feels identical to the one in a Place.
const JOY_BASE_D = 128;
const JOY_KNOB_D = 56;
const JOY_THROW = 56;
const JOY_DEADZONE = 0.15;
const JOY_EDGE_CLAMP = 72;
const FLY_BTN_D = 56;
const LEFT_ZONE = 0.40; // a touch starting in the left 40% is the move finger
const TOP_BAR_H = 48; // §5.6.1's top bar; touches above it belong to the UI

const DEG = Math.PI / 180;

// Token + fallback pairs, spec 11 §5.6. The fallback is what actually paints today —
// the UI kit (spec 06 §5.6.1) names these colours --oof-surface/--oof-stroke, not
// --oof-panel/--oof-ui-line, so the var() lookups miss and the literals below win.
// Reported as a spec conflict; written this way so the day the kit adds the names,
// Studio adopts them with no edit here.
const PANEL_BG = "var(--oof-panel, rgba(20,24,34,.6))";
const UI_LINE = "var(--oof-ui-line, rgba(255,255,255,.25))";
const UI_TEXT = "var(--oof-text, #fff)";

function el(tag, style, text) {
  const node = document.createElement(tag);
  if (style) node.setAttribute("style", style);
  if (text !== undefined) node.textContent = text;
  return node;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// createFlyCam({ dom, renderer, isTouch }) -> flycam — §5.3.
// `isTouch` is optional and defaults to a (pointer: coarse) media query; the shell
// passes engine input.js's isTouch() so Studio and the engine agree on one answer.
export function createFlyCam({ dom, renderer, isTouch } = {}) {
  const host = dom || document.body;
  const coarse = typeof isTouch === "function"
    ? isTouch
    : () => typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;

  const three = new THREE.PerspectiveCamera(70, 1, 0.5, 1200);
  const pose = { pos: [20, 18, 20], yaw: -135, pitch: -30 };

  const stage = el("div", "position:absolute;inset:0;z-index:60;touch-action:none;"
    + "-webkit-user-select:none;user-select:none;");
  stage.id = "oof-studio-stage";
  host.appendChild(stage);

  // ---- joystick (built once, shown only while a move finger is down) --------------
  const joyBase = el("div", "position:absolute;width:" + JOY_BASE_D + "px;height:" + JOY_BASE_D + "px;"
    + "margin-left:" + (-JOY_BASE_D / 2) + "px;margin-top:" + (-JOY_BASE_D / 2) + "px;"
    + "border-radius:50%;border:2px solid " + UI_LINE + ";background:rgba(255,255,255,.06);"
    + "display:none;pointer-events:none;");
  const joyKnob = el("div", "position:absolute;width:" + JOY_KNOB_D + "px;height:" + JOY_KNOB_D + "px;"
    + "margin-left:" + (-JOY_KNOB_D / 2) + "px;margin-top:" + (-JOY_KNOB_D / 2) + "px;"
    + "border-radius:50%;background:rgba(255,255,255,.22);border:1px solid " + UI_LINE + ";"
    + "display:none;pointer-events:none;");
  stage.append(joyBase, joyKnob);

  // ---- ▲ / ▼ altitude buttons (touch only, §5.3 rule 4) --------------------------
  const btnStyle = "position:absolute;width:" + FLY_BTN_D + "px;height:" + FLY_BTN_D + "px;"
    + "border-radius:50%;background:" + PANEL_BG + ";border:1px solid " + UI_LINE + ";"
    + "color:" + UI_TEXT + ";font-size:20px;line-height:" + FLY_BTN_D + "px;text-align:center;"
    + "pointer-events:auto;touch-action:none;";
  const upBtn = el("div", btnStyle + "right:12px;bottom:184px;", "▲");
  const downBtn = el("div", btnStyle + "right:12px;bottom:120px;", "▼");
  const showButtons = coarse();
  if (!showButtons) {
    upBtn.style.display = "none";
    downBtn.style.display = "none";
  }
  stage.append(upBtn, downBtn);

  // ---- input state ---------------------------------------------------------------
  const keys = new Set();
  const move = { x: 0, z: 0 }; // -1..1, from keys or joystick
  let vertical = 0; // -1 down, +1 up, from E/Q or the ▲/▼ buttons
  let enabled = true;
  const lookPointers = new Map(); // pointerId -> { x, y }
  let joyPointer = null;
  let joyOrigin = { x: 0, y: 0 };
  let lookPointer = null;
  let pinchDist = 0;
  const cleanup = [];

  function on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    cleanup.push(() => target.removeEventListener(type, fn, opts));
  }

  function applyPose() {
    three.position.set(pose.pos[0], pose.pos[1], pose.pos[2]);
    // YXZ so yaw is applied before pitch — the same order a first-person camera needs
    // to stay upright at every pitch.
    three.rotation.set(pose.pitch * DEG, pose.yaw * DEG, 0, "YXZ");
    three.updateMatrixWorld();
  }

  function resize() {
    const w = stage.clientWidth || window.innerWidth || 1;
    const h = stage.clientHeight || window.innerHeight || 1;
    three.aspect = w / h;
    three.updateProjectionMatrix();
  }

  function look(dxPx, dyPx, sens) {
    pose.yaw -= dxPx * sens / DEG;
    pose.pitch = clamp(pose.pitch - dyPx * sens / DEG, -PITCH_CLAMP, PITCH_CLAMP);
  }

  function dolly(units) {
    const dir = new THREE.Vector3();
    three.getWorldDirection(dir);
    pose.pos[0] += dir.x * units;
    pose.pos[1] += dir.y * units;
    pose.pos[2] += dir.z * units;
  }

  // ---- keyboard (desktop) --------------------------------------------------------
  // Ignored while a text field has focus, the same rule spec 02's input.js applies.
  function typingInAField() {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || active.isContentEditable === true;
  }

  function readKeys() {
    let x = 0;
    let z = 0;
    if (keys.has("w")) z -= 1;
    if (keys.has("s")) z += 1;
    if (keys.has("a")) x -= 1;
    if (keys.has("d")) x += 1;
    if (joyPointer === null) {
      move.x = x;
      move.z = z;
    }
    vertical = (keys.has("e") ? 1 : 0) - (keys.has("q") ? 1 : 0);
  }

  on(window, "keydown", (ev) => {
    if (!enabled || typingInAField() || ev.metaKey || ev.ctrlKey) return;
    const k = ev.key.toLowerCase();
    // "shift" rides in the same set purely so blur/keyup clear it the same way; only
    // the six movement letters are read as directions.
    if (k === "shift" || (k.length === 1 && "wasdeq".includes(k))) {
      keys.add(k);
      readKeys();
    }
  });
  on(window, "keyup", (ev) => {
    const k = ev.key.toLowerCase();
    if (keys.delete(k)) readKeys();
  });
  // A tab switch or an alert eats the keyup; without this the camera flies off forever.
  on(window, "blur", () => {
    keys.clear();
    readKeys();
  });
  on(window, "resize", resize);

  // ---- ▲ / ▼ buttons: held, not toggled -----------------------------------------
  function holdButton(node, dir) {
    on(node, "pointerdown", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      capture(node, ev.pointerId);
      vertical = dir;
    });
    const release = (ev) => {
      if (node.hasPointerCapture && node.hasPointerCapture(ev.pointerId)) {
        node.releasePointerCapture(ev.pointerId);
      }
      vertical = 0;
    };
    on(node, "pointerup", release);
    on(node, "pointercancel", release);
  }
  holdButton(upBtn, 1);
  holdButton(downBtn, -1);

  // ---- stage pointers ------------------------------------------------------------
  // See editor.js: a synthetic PointerEvent has no live pointer to capture, and the
  // NotFoundError that raises must not surface as a console error in the smoke run.
  function capture(target, id) {
    try {
      target.setPointerCapture(id);
    } catch {
      /* synthetic pointer: no capture to take */
    }
  }

  function stagePoint(ev) {
    const rect = stage.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top, w: rect.width, h: rect.height };
  }

  function startJoystick(ev, p) {
    joyPointer = ev.pointerId;
    joyOrigin = {
      x: clamp(p.x, JOY_EDGE_CLAMP, Math.max(JOY_EDGE_CLAMP, p.w - JOY_EDGE_CLAMP)),
      y: clamp(p.y, JOY_EDGE_CLAMP, Math.max(JOY_EDGE_CLAMP, p.h - JOY_EDGE_CLAMP)),
    };
    joyBase.style.left = joyOrigin.x + "px";
    joyBase.style.top = joyOrigin.y + "px";
    joyBase.style.display = "block";
    joyKnob.style.display = "block";
    updateJoystick(p);
  }

  function updateJoystick(p) {
    const dx = p.x - joyOrigin.x;
    const dy = p.y - joyOrigin.y;
    const dist = Math.hypot(dx, dy);
    const capped = Math.min(dist, JOY_THROW);
    const nx = dist > 0 ? (dx / dist) * capped : 0;
    const ny = dist > 0 ? (dy / dist) * capped : 0;
    joyKnob.style.left = (joyOrigin.x + nx) + "px";
    joyKnob.style.top = (joyOrigin.y + ny) + "px";
    // Deadzone normalisation, spec 02 §6: below 15% of full throw the stick reads 0,
    // and the remaining 85% is stretched back over the full 0..1 range.
    const mag = capped / JOY_THROW;
    const scaled = mag < JOY_DEADZONE ? 0 : (mag - JOY_DEADZONE) / (1 - JOY_DEADZONE);
    const ux = dist > 0 ? dx / dist : 0;
    const uy = dist > 0 ? dy / dist : 0;
    move.x = ux * scaled;
    move.z = uy * scaled;
  }

  function endJoystick() {
    joyPointer = null;
    joyBase.style.display = "none";
    joyKnob.style.display = "none";
    readKeys(); // fall back to whatever WASD is holding
    if (!keys.size) {
      move.x = 0;
      move.z = 0;
    }
  }

  on(stage, "contextmenu", (ev) => ev.preventDefault());

  on(stage, "pointerdown", (ev) => {
    if (!enabled) return;
    if (ev.target === upBtn || ev.target === downBtn) return;
    const p = stagePoint(ev);
    if (ev.pointerType === "mouse") {
      if (ev.button !== 2) return; // LMB belongs to selection/placement (editor.js)
      lookPointer = ev.pointerId;
      lookPointers.set(ev.pointerId, { x: p.x, y: p.y });
      capture(stage, ev.pointerId);
      ev.preventDefault();
      return;
    }
    // Touch/pen: left 40% below the top bar drives, everything else looks (§5.3).
    if (p.x < p.w * LEFT_ZONE && p.y > TOP_BAR_H && joyPointer === null) {
      startJoystick(ev, p);
      capture(stage, ev.pointerId);
      return;
    }
    lookPointers.set(ev.pointerId, { x: p.x, y: p.y });
    if (lookPointers.size === 2) {
      const [a, b] = [...lookPointers.values()];
      pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
    }
    capture(stage, ev.pointerId);
  });

  on(stage, "pointermove", (ev) => {
    if (!enabled) return;
    const p = stagePoint(ev);
    if (ev.pointerId === joyPointer) {
      updateJoystick(p);
      return;
    }
    const prev = lookPointers.get(ev.pointerId);
    if (!prev) return;
    const dx = p.x - prev.x;
    const dy = p.y - prev.y;
    prev.x = p.x;
    prev.y = p.y;

    if (lookPointers.size >= 2) {
      // Two look fingers = pinch dolly; neither one turns the camera while pinching,
      // or the world would swing wildly under a two-thumb zoom.
      const [a, b] = [...lookPointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      dolly((dist - pinchDist) * PINCH_FLY);
      pinchDist = dist;
      return;
    }
    const sens = ev.pointerType === "mouse" ? FLY_LOOK : FLY_LOOK * TOUCH_LOOK_MULT;
    look(dx, dy, sens);
  });

  function releasePointer(ev) {
    if (ev.pointerId === joyPointer) {
      endJoystick();
    } else if (lookPointers.delete(ev.pointerId)) {
      if (lookPointers.size < 2) pinchDist = 0;
      if (ev.pointerId === lookPointer) lookPointer = null;
    }
    if (stage.hasPointerCapture && stage.hasPointerCapture(ev.pointerId)) {
      stage.releasePointerCapture(ev.pointerId);
    }
  }
  on(stage, "pointerup", releasePointer);
  on(stage, "pointercancel", releasePointer);

  on(stage, "wheel", (ev) => {
    if (!enabled) return;
    ev.preventDefault();
    dolly((-ev.deltaY / 100) * WHEEL_FLY);
  }, { passive: false });

  // ---- per-render-frame update ---------------------------------------------------
  // dt is the RENDER frame delta, not a sim step: edit mode is not simulation, and a
  // camera that moved in 1/60 chunks would stutter on a 120 Hz phone (§5.3).
  function frame(dt) {
    if (!enabled) return;
    const step = dt > 0.1 ? 0.1 : dt; // the loop clamps too; belt and braces
    const speed = FLY_SPEED * (keys.has("shift") ? FLY_FAST_MULT : 1) * step;
    const yawRad = pose.yaw * DEG;
    const sin = Math.sin(yawRad);
    const cos = Math.cos(yawRad);
    // Horizontal plane of the camera yaw: forward is -Z rotated by yaw, right is +X.
    const forwardX = -sin;
    const forwardZ = -cos;
    const rightX = cos;
    const rightZ = -sin;
    pose.pos[0] += (forwardX * -move.z + rightX * move.x) * speed;
    pose.pos[2] += (forwardZ * -move.z + rightZ * move.x) * speed;
    pose.pos[1] += vertical * speed;
    applyPose();
  }

  // lookAt(target) — aim the camera at a world point without moving it. Studio uses it
  // once, when a brand-new creation is opened: §3.1 pins camYaw -135 for a camera at
  // [20,18,20], but three.js yaw 0 faces -Z, so -135 points AWAY from the baseplate and
  // a new Place would open staring at empty ground. The stored value is left alone
  // (§7 criterion 3 checks the written doc); the first view is corrected here instead.
  // Reported as a spec defect.
  function lookAt(target) {
    const fx = target[0] - pose.pos[0];
    const fy = target[1] - pose.pos[1];
    const fz = target[2] - pose.pos[2];
    const flat = Math.hypot(fx, fz);
    pose.yaw = Math.atan2(-fx, -fz) / DEG;
    pose.pitch = clamp(Math.atan2(fy, flat) / DEG, -PITCH_CLAMP, PITCH_CLAMP);
    applyPose();
  }

  // focus(aabb) — fly to frame an AABB ({ min:[x,y,z], max:[x,y,z] }), §5.3.
  function focus(aabb) {
    if (!aabb) return;
    const center = [
      (aabb.min[0] + aabb.max[0]) / 2,
      (aabb.min[1] + aabb.max[1]) / 2,
      (aabb.min[2] + aabb.max[2]) / 2,
    ];
    const radius = Math.max(
      aabb.max[0] - aabb.min[0],
      aabb.max[1] - aabb.min[1],
      aabb.max[2] - aabb.min[2],
    ) / 2;
    const dist = Math.max(FOCUS_MIN_DIST, radius * FOCUS_RADIUS_MULT);
    const dir = new THREE.Vector3();
    three.getWorldDirection(dir);
    pose.pos[0] = center[0] - dir.x * dist;
    pose.pos[1] = center[1] - dir.y * dist;
    pose.pos[2] = center[2] - dir.z * dist;
    applyPose();
  }

  applyPose();
  resize();

  return {
    three,
    stage, // editor.js and gizmo.js hang their capture-phase listeners here
    frame,
    focus,
    lookAt,
    resize,
    getPose: () => ({ pos: pose.pos.slice(), yaw: pose.yaw, pitch: pose.pitch }),
    setPose(next) {
      if (!next) return;
      if (Array.isArray(next.pos)) pose.pos = next.pos.slice();
      if (typeof next.yaw === "number") pose.yaw = next.yaw;
      if (typeof next.pitch === "number") pose.pitch = clamp(next.pitch, -PITCH_CLAMP, PITCH_CLAMP);
      applyPose();
    },
    // Playtest hides the whole layer: the follow camera takes over and the engine's
    // own touch overlay must be reachable again (§5.8 step 3).
    setEnabled(v) {
      enabled = !!v;
      stage.style.display = v ? "" : "none";
      if (!v) {
        keys.clear();
        move.x = 0;
        move.z = 0;
        vertical = 0;
        lookPointers.clear();
        endJoystick();
      }
    },
    isTouchLayout: () => showButtons,
    dispose() {
      for (const off of cleanup.splice(0)) off();
      stage.remove();
    },
  };
}
