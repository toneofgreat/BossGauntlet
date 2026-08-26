// src/engine/camera.js — third-person follow camera: mouse/touch orbit, smoothed zoom,
// wall collision against part colliders, shift-lock and shake. Spec 02 §5.3 owns the
// algorithm and the member table; every number below is a spec 02 §6 camera row.

import * as THREE from "../../assets/vendor/three.module.js";

// The §6 camera rows, by name — the single source of these numbers.
export const CAMERA = Object.freeze({
  FOV: 70, // degrees
  NEAR: 0.5,
  FAR: 1200,
  DIST_DEFAULT: 14, // studs
  DIST_MIN: 4,
  DIST_MAX: 60,
  WHEEL_ZOOM: 1.5, // units per 100 deltaY — applied in input.js, listed here as the §6 row
  ZOOM_SMOOTH: 12, // 1/s exponential zoom smoothing rate
  ORBIT_SENS: 0.0052, // radians per pixel of look delta
  PITCH_MIN: -1.396, // rad (-80 degrees)
  PITCH_MAX: 1.396, // rad (+80 degrees)
  PITCH_DEFAULT: -0.35, // spawn framing: above the avatar, looking down
  YAW_DEFAULT: 0,
  LOOK_Y: 1.5, // units above the capsule center — the head
  SHIFTLOCK_OFFSET: 1.75, // units right of the look target in shift-lock
  COLLIDE_MARGIN: 0.4, // camera-wall gap
  COLLIDE_RECOVER: 8, // units/s the camera may zoom back out after a wall pop-in
});

// shake(intensity) peak offset = intensity * 0.6 units (spec 02 §5.3 member table).
const SHAKE_AMPLITUDE = 0.6;
// Below this the exponential zoom snaps to its target: the tail of an exponential never
// lands exactly, and a distance that keeps creeping by 1e-9 defeats the exactness that
// spec 02 §7 criterion 10 asserts on three.position.
const ZOOM_SNAP = 1e-4;

// Spec 02 §5.3 step 6 passes `{ ignore: "avatar" }` as the raycast's 4th argument, while
// spec 03 §4.1 (the owner of physics.js) defines that argument as `filterFn(collider) ->
// bool` with default `c => !c.isSensor`. This value satisfies both readings at once: a
// filter function that also carries the `ignore` field. They select the same set here —
// the avatar never registers a collider (spec 03 §5.6 sweeps a capsule), so "ignore the
// avatar" and "hit solid, non-sensor world geometry" mean the same thing.
const CAMERA_RAY_FILTER = (collider) => !collider.isSensor;
CAMERA_RAY_FILTER.ignore = "avatar";

// The camera is constructible without input (spec 02 §7 criteria 10-11 drive it from bare
// stubs); a missing input simply means no orbit/zoom/shift-lock deltas ever arrive.
const NULL_INPUT = Object.freeze({
  consumeLookDelta: () => ({ dx: 0, dy: 0 }),
  consumeZoomDelta: () => 0,
  wasPressed: () => false,
  isTouch: () => false,
});

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function initialAspect(dom) {
  const w = dom && dom.clientWidth ? dom.clientWidth : 16;
  const h = dom && dom.clientHeight ? dom.clientHeight : 9;
  return w / h;
}

// `dom` = the canvas (pointer-lock target), `input` = createInput's object, `physics` =
// spec 03's module (only `raycast` is used; a `{ raycast: () => null }` stub is legal, and
// so is omitting it entirely — the camera must never crash for want of physics).
//
// DEGREES vs RADIANS: this controller is radians-only. The ctx surface the shell exposes
// as `ctx.engine.camera` (spec 04 §5.7) takes DEGREES and converts before calling in:
// `setPitch(deg)` -> `setPitch(deg * Math.PI / 180)`, whose -80..80 clamp is exactly
// PITCH_MIN/PITCH_MAX (+/-1.396 rad) and whose -20 default is PITCH_DEFAULT (-0.35 rad).
// `setDistance`, `setOffset`, `shake` and `reset` are unitless and pass straight through.
export function createCamera({ dom, input, physics } = {}) {
  const inputCtl = input || NULL_INPUT;
  const three = new THREE.PerspectiveCamera(CAMERA.FOV, initialAspect(dom), CAMERA.NEAR, CAMERA.FAR);

  // Yaw convention (binding; cross-checked against spec 03 §5.6 step 2): `yaw` is the
  // ORBIT angle — the camera sits at horizontal direction (sin yaw, cos yaw) from the look
  // target (spec 02 §5.3 step 5). `getYaw()` returns the yaw of the camera's LOOK
  // direction (its member-table wording), the opposite heading, yaw + PI. That is what
  // consumers need: physics builds its wish vector as (sin camYaw, cos camYaw) for
  // moveZ = +1 meaning "away from camera", and shift-lock faces the avatar along getYaw().
  let yaw = CAMERA.YAW_DEFAULT;
  let pitch = CAMERA.PITCH_DEFAULT;
  let distTarget = CAMERA.DIST_DEFAULT; // where zoom is heading
  let dist = CAMERA.DIST_DEFAULT; // smoothed zoom distance
  let shownDist = CAMERA.DIST_DEFAULT; // dist after wall collision
  const offset = [0, 0, 0];
  let shiftLocked = false;
  let shiftEdgeSeen = false;
  let shakeAmp = 0;
  let shakeDur = 0;
  let shakeLeft = 0;
  let crosshair = null;

  const look = new THREE.Vector3(); // L, the look target
  const dir = new THREE.Vector3(); // unit vector, look target -> camera
  const rayOrigin = [0, 0, 0]; // reused: spec 03 vectors are plain [x,y,z] arrays
  const rayDir = [0, 0, 0];

  function setAspect(a) {
    if (!Number.isFinite(a) || a <= 0) return;
    three.aspect = a;
    three.updateProjectionMatrix();
  }

  function applyLook() {
    const { dx, dy } = inputCtl.consumeLookDelta();
    yaw -= dx * CAMERA.ORBIT_SENS;
    pitch = clamp(pitch - dy * CAMERA.ORBIT_SENS, CAMERA.PITCH_MIN, CAMERA.PITCH_MAX);
    // yaw is deliberately NOT wrapped into (-PI, PI]: sin/cos do not care, and an
    // unwrapped angle keeps orbit deltas continuous for spec 02 §8's smoke probe 8.
  }

  function applyZoom(dt) {
    distTarget = clamp(distTarget - inputCtl.consumeZoomDelta(), CAMERA.DIST_MIN, CAMERA.DIST_MAX);
    // Exponential, not a fixed lerp: 1 - exp(-dt*k) is frame-rate independent and stable
    // at any frameDt (a 0.5 s hitch cannot overshoot the target).
    dist += (distTarget - dist) * (1 - Math.exp(-dt * CAMERA.ZOOM_SMOOTH));
    if (Math.abs(distTarget - dist) < ZOOM_SNAP) dist = distTarget;
  }

  function pollShiftLockToggle() {
    // Desktop only (spec 02 §5.3 step 3). `wasPressed` stays true until the next sim
    // `endStep()`, so on a display faster than 60 Hz one press spans several update()
    // calls — latch the edge, or a single Shift would toggle two or three times.
    const pressed = !inputCtl.isTouch() && inputCtl.wasPressed("shiftlock");
    if (pressed && !shiftEdgeSeen) setShiftLock(!shiftLocked);
    shiftEdgeSeen = pressed;
  }

  function setLookTarget(targetPos) {
    let tx = 0;
    let ty = 0;
    let tz = 0;
    if (Array.isArray(targetPos)) {
      tx = targetPos[0];
      ty = targetPos[1];
      tz = targetPos[2];
    } else if (targetPos) {
      tx = targetPos.x;
      ty = targetPos.y;
      tz = targetPos.z;
    }
    look.set(tx + offset[0], ty + CAMERA.LOOK_Y + offset[1], tz + offset[2]);
    if (shiftLocked) {
      // Horizontal camera-space right of the look direction = (cos yaw, 0, -sin yaw).
      look.x += Math.cos(yaw) * CAMERA.SHIFTLOCK_OFFSET;
      look.z -= Math.sin(yaw) * CAMERA.SHIFTLOCK_OFFSET;
    }
  }

  function resolveCollision(dt) {
    let allowed = dist;
    if (physics && typeof physics.raycast === "function") {
      rayOrigin[0] = look.x;
      rayOrigin[1] = look.y;
      rayOrigin[2] = look.z;
      rayDir[0] = dir.x;
      rayDir[1] = dir.y;
      rayDir[2] = dir.z;
      const hit = physics.raycast(rayOrigin, rayDir, dist + CAMERA.COLLIDE_MARGIN, CAMERA_RAY_FILTER);
      // spec 03 §3.4 hits carry no `hit` flag (non-null IS the hit) while spec 02 §2
      // documents one — accept either shape, and treat `{ hit: false }` as a miss.
      if (hit && hit.hit !== false && Number.isFinite(hit.distance)) {
        // Spec 02 contradicts itself here: §5.3 step 6 floors this at DIST_MIN (4) while
        // §7 criterion 11 requires a hit at 4 to give 3.6 (= 4 - COLLIDE_MARGIN). The
        // criterion is implemented — a DIST_MIN floor would park the camera *inside* any
        // wall closer than 4.4 units. Floor is 0 so a wall closer than the margin pushes
        // to first person instead of flipping the camera behind the look target.
        allowed = Math.max(0, hit.distance - CAMERA.COLLIDE_MARGIN);
      }
    }
    // Pop-in is instant, recovery is rate-limited (spec 02 §5.3 step 6): the camera may
    // snap in the moment a wall appears, but crawls back out at COLLIDE_RECOVER units/s,
    // so hugging a corner never flings the view.
    const popped = Math.min(shownDist, allowed);
    return Math.min(allowed, popped + CAMERA.COLLIDE_RECOVER * dt);
  }

  function applyShake(dt) {
    if (shakeLeft <= 0 || shakeDur <= 0) return;
    shakeLeft = Math.max(0, shakeLeft - dt);
    const amp = shakeAmp * (shakeLeft / shakeDur); // linear decay over durationS
    // Render-side only — shake never feeds the sim, so Math.random() cannot desync it.
    three.position.x += (Math.random() * 2 - 1) * amp;
    three.position.y += (Math.random() * 2 - 1) * amp;
    three.position.z += (Math.random() * 2 - 1) * amp;
  }

  function update(frameDt, targetPos) {
    // One non-finite frameDt would otherwise poison every smoothing term for the rest of
    // the session, leaving the camera at NaN forever.
    const dt = Number.isFinite(frameDt) && frameDt > 0 ? frameDt : 0;

    applyLook();
    applyZoom(dt);
    pollShiftLockToggle();
    setLookTarget(targetPos);

    const cp = Math.cos(pitch);
    dir.set(Math.sin(yaw) * cp, -Math.sin(pitch), Math.cos(yaw) * cp);

    shownDist = resolveCollision(dt);
    three.position.set(
      look.x + dir.x * shownDist,
      look.y + dir.y * shownDist,
      look.z + dir.z * shownDist,
    );
    applyShake(dt);
    three.lookAt(look);
  }

  function getYaw() {
    return yaw + Math.PI;
  }

  function getPitch() {
    return pitch;
  }

  function setYaw(r) {
    if (!Number.isFinite(r)) return;
    yaw = r - Math.PI; // inverse of getYaw(): setYaw(v) makes getYaw() return v
  }

  function setPitch(r) {
    if (!Number.isFinite(r)) return;
    pitch = clamp(r, CAMERA.PITCH_MIN, CAMERA.PITCH_MAX);
  }

  function setDistance(d) {
    if (!Number.isFinite(d)) {
      console.warn("camera: setDistance expects a number");
      return;
    }
    distTarget = clamp(d, CAMERA.DIST_MIN, CAMERA.DIST_MAX);
  }

  function setOffset(v) {
    if (!Array.isArray(v) || v.length < 3 || !v.slice(0, 3).every(Number.isFinite)) {
      console.warn("camera: setOffset expects [x, y, z]");
      return;
    }
    offset[0] = v[0];
    offset[1] = v[1];
    offset[2] = v[2];
  }

  function shake(intensity, durationS) {
    const i = Number.isFinite(intensity) ? clamp(intensity, 0, 1) : 0;
    const d = Number.isFinite(durationS) ? Math.max(0, durationS) : 0;
    if (i <= 0 || d <= 0) return;
    shakeAmp = i * SHAKE_AMPLITUDE;
    shakeDur = d;
    shakeLeft = d;
  }

  function reset() {
    distTarget = CAMERA.DIST_DEFAULT;
    dist = CAMERA.DIST_DEFAULT;
    shownDist = CAMERA.DIST_DEFAULT;
    pitch = CAMERA.PITCH_DEFAULT;
    offset[0] = 0;
    offset[1] = 0;
    offset[2] = 0;
    shakeAmp = 0;
    shakeDur = 0;
    shakeLeft = 0;
    // Yaw is not restored: spec 02 §5.3 resets distance/pitch/offset only, and place.js
    // sets the spawn yaw itself on the next load.
  }

  // ---- shift-lock: the only DOM this module owns (pointer lock + the crosshair) ----

  function addCrosshair() {
    if (crosshair || typeof document === "undefined" || !document.body) return;
    crosshair = document.createElement("div");
    crosshair.id = "oof-crosshair";
    // Color token from spec 06's UI kit with a hard fallback; pointer-events:none so a
    // 6 px dot in the middle of the screen never eats a tap meant for the world.
    crosshair.style.cssText =
      "position:fixed;left:50%;top:50%;width:6px;height:6px;margin:-3px 0 0 -3px;" +
      "border-radius:50%;background:var(--oof-text, #fff);opacity:0.8;pointer-events:none;";
    document.body.appendChild(crosshair);
  }

  function removeCrosshair() {
    if (crosshair && crosshair.parentNode) crosshair.parentNode.removeChild(crosshair);
    crosshair = null;
  }

  function requestLock() {
    if (!dom || typeof dom.requestPointerLock !== "function") return;
    // Chrome returns a promise that rejects when there is no transient user activation;
    // unhandled, that rejection reads as a console error in a smoke run.
    const pending = dom.requestPointerLock();
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  }

  function exitLock() {
    if (typeof document === "undefined") return;
    if (document.pointerLockElement === dom && typeof document.exitPointerLock === "function") {
      document.exitPointerLock();
    }
  }

  function setShiftLock(on) {
    if (inputCtl.isTouch()) {
      console.warn("camera: shift-lock is not available on touch devices");
      return;
    }
    const want = !!on;
    if (want === shiftLocked) return;
    shiftLocked = want;
    if (want) {
      addCrosshair();
      requestLock();
    } else {
      removeCrosshair();
      exitLock();
    }
  }

  function isShiftLocked() {
    return shiftLocked;
  }

  function onPointerLockChange() {
    // Esc drops pointer lock without telling us — leaving shift-lock on would keep the
    // avatar yawed to the camera while the mouse no longer orbits.
    if (shiftLocked && document.pointerLockElement !== dom) {
      shiftLocked = false;
      removeCrosshair();
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("pointerlockchange", onPointerLockChange);
  }

  function dispose() {
    if (typeof document !== "undefined") {
      document.removeEventListener("pointerlockchange", onPointerLockChange);
    }
    exitLock();
    removeCrosshair();
    shiftLocked = false;
  }

  return {
    three,
    setAspect,
    update,
    getYaw,
    getPitch,
    setYaw,
    setPitch,
    setDistance,
    setShiftLock,
    isShiftLocked,
    setOffset,
    shake,
    reset,
    dispose,
  };
}
