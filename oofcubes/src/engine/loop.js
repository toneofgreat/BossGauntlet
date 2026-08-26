// src/engine/loop.js
// Fixed-step simulation loop: decouples the 60 Hz sim clock from the render rate via a
// time accumulator, with a spiral-of-death panic clamp and pause/resume. Spec 02 §5.1.

export const SIM_DT = 1 / 60;

// Tuning constants, spec 02 §6 (the single source for these numbers).
const MAX_FRAME_DT = 0.1; // wall-clock clamp per rAF callback
const MAX_STEPS_PER_FRAME = 6; // sim steps allowed per rAF before the panic clamp
const FPS_EMA = 0.05; // fps smoothing coefficient

export function createLoop({ step, render, onPanic }) {
  if (typeof step !== "function" || typeof render !== "function") {
    throw new TypeError("loop: step and render must be functions");
  }

  let running = false;
  let paused = false;
  let last = 0; // performance.now() at the previous rAF callback
  let acc = 0; // seconds of un-simulated wall time
  let stepCount = 0;
  let lastAlpha = 0;
  let rafHandle = null;
  let fps = 0;
  let stepsLastFrame = 0;
  let panics = 0;

  function time() {
    return stepCount * SIM_DT;
  }

  function updateFps(frameDt) {
    if (frameDt <= 0) return; // guards a div-by-zero on a degenerate (same-timestamp) frame
    const instFps = 1 / frameDt;
    fps = fps === 0 ? instFps : fps + FPS_EMA * (instFps - fps);
  }

  function onVisibilityChange() {
    // A backgrounded tab stops delivering rAF; on return `last` is stale by however
    // long the tab was hidden. Re-anchor the frame clock here so the next callback's
    // `raw` is small, rather than relying on the MAX_FRAME_DT clamp alone.
    if (document.visibilityState === "visible") {
      last = performance.now();
      acc = 0;
    }
  }

  function frame(now) {
    const raw = (now - last) / 1000;
    last = now;
    const frameDt = Math.min(raw, MAX_FRAME_DT);

    if (paused) {
      render(lastAlpha, frameDt);
      updateFps(frameDt);
      if (running) rafHandle = requestAnimationFrame(frame);
      return;
    }

    // Panic accounting lives HERE — at the clamp, because this is the only place wall
    // time is ever dropped, but AFTER the paused early-return above (spec 02 §5.1 step
    // 2): `panics` means "simulation time was owed and dropped", and a paused loop owes
    // none, so a jank frame while the pause menu is open must not count one. §6 sets
    // MAX_FRAME_DT (0.1) === MAX_STEPS_PER_FRAME (6) * SIM_DT exactly, so a clamped frame
    // always drains in exactly 6 steps and step 6's `acc >= SIM_DT` test below is
    // arithmetically unreachable at the shipped constants. The unclamped `raw` is
    // deliberately NOT accumulated: dropping the overflow is what prevents the catch-up
    // storm the clamp exists for (spec 02 §5.1 steps 2 and 6).
    if (raw > MAX_FRAME_DT) {
      const dropped = raw - MAX_FRAME_DT;
      panics++;
      if (onPanic) onPanic(dropped);
    }

    acc += frameDt;
    let steps = 0;
    while (acc >= SIM_DT && steps < MAX_STEPS_PER_FRAME) {
      step(SIM_DT, time());
      stepCount++;
      acc -= SIM_DT;
      steps++;
    }

    // Defensive backstop for the same spiral-of-death clamp: unreachable while
    // MAX_FRAME_DT === MAX_STEPS_PER_FRAME * SIM_DT, kept so the accounting stays
    // correct if either constant is ever re-tuned. Drops the remainder rather than ever
    // advancing sim time for it, so gameplay slows down instead of teleporting forward.
    if (acc >= SIM_DT) {
      const dropped = acc;
      acc = 0;
      panics++;
      if (onPanic) onPanic(dropped);
    }

    stepsLastFrame = steps;
    const alpha = acc / SIM_DT;
    lastAlpha = alpha;
    render(alpha, frameDt);
    updateFps(frameDt);
    if (running) rafHandle = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      running = true;
      last = performance.now();
      acc = 0;
      document.addEventListener("visibilitychange", onVisibilityChange);
      rafHandle = requestAnimationFrame(frame);
    },
    stop() {
      if (!running) return;
      running = false;
      if (rafHandle !== null) cancelAnimationFrame(rafHandle);
      rafHandle = null;
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
    pause() {
      paused = true;
    },
    resume() {
      // Reset the frame clock so the wall-clock gap accrued while paused is never read
      // back as elapsed time (spec 02 §5.1: resume "resets the frame clock so no
      // catch-up occurs").
      paused = false;
      last = performance.now();
      acc = 0;
    },
    isPaused() {
      return paused;
    },
    time,
    getStats() {
      return { fps, alpha: lastAlpha, stepsLastFrame, panics };
    },
  };
}
