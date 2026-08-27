// src/games/lifting/scripts/lift.js — spec 09 §5.3 (the three input sources, the rate
// gate, candle burn) and §5.4 (the held item and the rep animation). This is the game:
// everything else exists to make the numbers under this loop mean something.
//
// The rep is built to read as EFFORT, not as a number ticking. §5.4's timeline is a dip
// (the knees), a press that leaves the chest fast and grinds into lockout, a held lockout
// with a squeeze, and a fall back to carry. All of it is driven off the sim step's dt —
// no timers anywhere (validate 04:V6), so a throttled tab lifts at the same rate a
// focused one does.

import { TUNING, fmt, itemById } from "./config.js";
import { buildItemGroup, spinItemGroup, disposeItemGroup } from "./items.js";
import { addStrength, recomputeMulti } from "./state.js";
import { gainText, burst } from "./fx.js";

const A = TUNING.LIFT_ANIM_S;
const T_DIP_END = A.dip;                     // 0.10
const T_PRESS_END = T_DIP_END + A.press;     // 0.25
const T_LOCK_END = T_PRESS_END + A.lockout;  // 0.35
const T_END = A.total;                       // 0.45
const DIP_Y = -0.6;                          // §5.4's dip depth
const LOCKOUT_SQUEEZE = 0.08;                // §5.4's 1.0 -> 1.08 -> 1.0 y-scale pulse

// Strain trim — NOT in §5.4's table, which specifies offsets only. The table alone gives
// a rep that slides; these two make it look heavy: the item noses down as the player sinks
// into the dip, and a fast low-amplitude tremble runs through the press and dies out over
// the lockout. Both are cosmetic, both are pure functions of animT, neither touches gain.
const PITCH_DIP = 0.18;      // rad, ~10 degrees
const TREMBLE_AMP = 0.06;    // rad, ~3.4 degrees
const TREMBLE_HZ = 9;

// Floating-point slack for the autoclicker's "is the next tick due" compare: 60 steps of
// 1/60 do not sum to exactly 1.0, and §7 criterion 8 wants exactly 5 lifts in that second.
const DUE_EPS = 1e-9;
const AUTO_MAX_PER_STEP = 8; // a runaway clock must not fire an unbounded burst of lifts

let ctxRef = null;
let stateRef = null;
let held = null;         // { group, halfHeight, halfDepth, id, partId }
let simT = 0;
let animT = Infinity;    // >= T_END means "not lifting"
let manualTimes = [];    // sim timestamps of the last MANUAL_RATE_MAX manual lifts
let holdT = 0;           // how long action1 / the LIFT button has been down
let holdRepeat = 0;
let buttonHeld = false;
let autoElapsed = 0;     // sim seconds the autoclicker has been enabled for
let autoFired = 0;
let autoSfxCount = 0;
let lastBurnToastAt = -Infinity;
let unsubs = [];

// ---------------------------------------------------------------------------
// §5.4 the carry pose and the rep timeline
// ---------------------------------------------------------------------------

function easeOutQuad(u) { return 1 - (1 - u) * (1 - u); }
function easeInQuad(u) { return u * u; }
function easeOutCubic(u) { return 1 - Math.pow(1 - u, 3); }

// Returns the item's offset from the carry pose at animT:
//   dy      studs above carry height
//   fwd     multiplier on the forward carry distance (1 = in front, 0 = over the head)
//   scaleY  the lockout squeeze
//   pitch/roll  the strain trim above
function animPose(t) {
  if (!(t < T_END)) return { dy: 0, fwd: 1, scaleY: 1, pitch: 0, roll: 0 };
  const tremble = TREMBLE_AMP * Math.sin(t * TREMBLE_HZ * Math.PI * 2);

  if (t < T_DIP_END) {
    // dip 0.00-0.10: the item drops as the lifter loads up. Anticipation.
    const e = easeOutQuad(t / A.dip);
    return { dy: DIP_Y * e, fwd: 1, scaleY: 1, pitch: -PITCH_DIP * e, roll: 0 };
  }
  if (t < T_PRESS_END) {
    // press 0.10-0.25: −0.6 -> +3.0 while the forward offset collapses to 0, so the item
    // ends centred over the head. easeOutCubic = it comes off the chest fast and creeps
    // through the sticking point, which is what makes it look heavy.
    const u = (t - T_DIP_END) / A.press;
    const e = easeOutCubic(u);
    return {
      dy: DIP_Y + (TUNING.LIFT_OVERHEAD_RISE - DIP_Y) * e,
      fwd: 1 - e,
      scaleY: 1,
      pitch: -PITCH_DIP * (1 - e),
      roll: tremble * Math.sin(Math.PI * u),
    };
  }
  if (t < T_LOCK_END) {
    // lockout 0.25-0.35: held overhead, one squeeze, tremble dying away.
    const u = (t - T_PRESS_END) / A.lockout;
    return {
      dy: TUNING.LIFT_OVERHEAD_RISE,
      fwd: 0,
      scaleY: 1 + LOCKOUT_SQUEEZE * Math.sin(Math.PI * u),
      pitch: 0,
      roll: tremble * (1 - u) * 0.5,
    };
  }
  // return 0.35-0.45: back down to carry, accelerating (easeInQuad) — a drop, not a float.
  const e = easeInQuad((t - T_LOCK_END) / A.return);
  return {
    dy: TUNING.LIFT_OVERHEAD_RISE * (1 - e),
    fwd: e,
    scaleY: 1,
    pitch: 0,
    roll: 0,
  };
}

// §5.4's carry pose, recomputed every sim step: chest height + half the item, one item
// half-depth in front of the torso, facing wherever the avatar faces. The rig's yaw is
// read-only here — the shell owns it.
function poseHeld() {
  if (!held || !ctxRef) return;
  const feet = ctxRef.player.position();
  const avatar = ctxRef.player.avatar;
  const yaw = avatar ? avatar.rotation.y : 0;
  const carryF = TUNING.CARRY_FORWARD_BASE + held.halfDepth;
  const carryY = TUNING.CARRY_HEIGHT_BASE + held.halfHeight;
  const pose = animPose(animT);
  const fwd = carryF * pose.fwd;
  held.group.position.set(
    feet[0] + Math.sin(yaw) * fwd,
    feet[1] + carryY + pose.dy,
    feet[2] + Math.cos(yaw) * fwd,
  );
  held.group.rotation.set(pose.pitch, yaw, pose.roll);
  held.group.scale.set(1, pose.scaleY, 1);
}

function itemWorldPos() {
  if (!held) return ctxRef ? ctxRef.player.position() : [0, 0, 0];
  const p = held.group.position;
  return [p.x, p.y, p.z];
}

// ---------------------------------------------------------------------------
// §5.4 the held item group
// ---------------------------------------------------------------------------

function releaseHeld() {
  if (!held) return;
  if (ctxRef && held.partId !== null) ctxRef.engine.parts.remove(held.partId);
  disposeItemGroup(held.group);
  held = null;
}

// Rebuilt from scratch on every equip change (§5.4): geometries and materials are per-item
// and there is nothing to reuse between a Pencil and the Moon.
function buildHeld() {
  releaseHeld();
  const built = buildItemGroup(ctxRef.engine.THREE, stateRef.equippedItem);
  built.id = stateRef.equippedItem;
  // addCustom: in the scene and tracked for dispose, with no collider — §7 criterion 21's
  // "the held item never collides" is a property of how it is registered, not a filter.
  built.partId = ctxRef.engine.parts.addCustom(built.group);
  held = built;
  poseHeld(); // place it now: one frame at the world origin is one frame too many
}

// ---------------------------------------------------------------------------
// §5.3 the lift
// ---------------------------------------------------------------------------

// Manual sources share a rolling 1.0 s window of at most MANUAL_RATE_MAX lifts. Excess
// requests vanish silently: §5.3 is explicit that dropping must feel like nothing
// happened, not like a punishment.
function manualAllowed() {
  const cutoff = simT - 1.0;
  while (manualTimes.length && manualTimes[0] <= cutoff) manualTimes.shift();
  if (manualTimes.length >= TUNING.MANUAL_RATE_MAX) return false;
  manualTimes.push(simT);
  return true;
}

function playLiftSfx(source) {
  // §5.14: the lift pitch rises with Power Surge steps, capped at +0.3.
  const pitch = 1 + Math.min(0.3, (stateRef.surgeSteps || 0) * 0.03);
  if (source === "auto") {
    autoSfxCount++;
    if (autoSfxCount % TUNING.AUTO_SFX_EVERY !== 0) return;
    ctxRef.engine.audio.playSfx("lift", { volume: 0.2, pitch });
    return;
  }
  ctxRef.engine.audio.playSfx("lift", { volume: 0.5, pitch });
}

// §5.4: a lift that arrives mid-rep restarts at the PRESS phase, never queues. Under the
// autoclicker that reads as a continuous grind instead of a stutter.
function startAnim() {
  animT = animT < T_END ? T_DIP_END : 0;
}

export function requestLift(source) {
  if (!ctxRef || !stateRef || !held) return;
  if (source !== "auto" && !manualAllowed()) return;

  const item = itemById(stateRef.equippedItem) || itemById("pencil");
  let gain = item.power * recomputeMulti(stateRef);

  // §5.3 candle burn: the candle is a trap item until you are past 100K.
  if (item.id === "candle" && stateRef.strength < TUNING.CANDLE_SAFE) {
    gain *= TUNING.CANDLE_BURN_FACTOR;
    if (simT - lastBurnToastAt >= TUNING.BURN_TOAST_S) {
      lastBurnToastAt = simT;
      ctxRef.services.ui.toast("🔥 Too hot to grip! Gains halved until 100K Strength.", { icon: "🔥" });
    }
    burst(ctxRef, itemWorldPos(), "#ff5722", 6);
  }

  // §5.3 step 5-7: the gain lands NOW, not at lockout — responsiveness beats theatre.
  addStrength(ctxRef, stateRef, gain);
  gainText(ctxRef, itemWorldPos(), "+" + fmt(gain));
  playLiftSfx(source);
  startAnim();
  if (stateRef.stats.lifts === 1) ctxRef.services.badges.award("first-lift");
}

// The LIFT button's pointer state (§5.13 element 1). Keyboard/touch-button holds come from
// input.isDown instead; either one keeps the hold repeat alive.
export function setButtonHeld(down) {
  buttonHeld = !!down;
  if (!buttonHeld) {
    holdT = 0;
    holdRepeat = 0;
  }
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

// deps is §4's seam for injecting the fx module; fx.js is imported directly above (it is
// a sibling in the same folder with a module-scoped pool, so there is nothing to inject),
// and game.js passes an empty object so the signature stays as §4 specifies.
export function init(ctx, state, deps) {
  ctxRef = ctx;
  stateRef = state;
  simT = 0;
  animT = Infinity;
  manualTimes = [];
  holdT = 0;
  holdRepeat = 0;
  buttonHeld = false;
  autoElapsed = 0;
  autoFired = 0;
  autoSfxCount = 0;
  lastBurnToastAt = -Infinity;
  unsubs = [];
  buildHeld();
  // E on a keyboard, the engine's touch action button on a phone: one press, one lift.
  unsubs.push(ctx.engine.input.onAction("action1", () => requestLift("tap")));
}

export function update(dt, ctx) {
  if (!ctxRef || !stateRef) return;
  simT += dt;
  if (animT < T_END) animT += dt;

  // §5.3 source 2 — hold. Tapping is faster; holding is what a thumb can actually do for
  // twenty minutes, so it must never be strictly worse than nothing.
  const down = buttonHeld || ctx.engine.input.isDown("action1");
  if (down) {
    const wasBelow = holdT < TUNING.HOLD_DELAY_S;
    holdT += dt;
    if (wasBelow && holdT >= TUNING.HOLD_DELAY_S) {
      holdRepeat = 0;
      requestLift("hold"); // the repeat starts AT the delay, not one interval after it
    } else if (holdT >= TUNING.HOLD_DELAY_S) {
      holdRepeat += dt;
      while (holdRepeat >= TUNING.HOLD_INTERVAL_S) {
        holdRepeat -= TUNING.HOLD_INTERVAL_S;
        requestLift("hold");
      }
    }
  } else {
    holdT = 0;
    holdRepeat = 0;
  }

  // §5.3 source 3 — the autoclicker, in every zone, concurrent with the manual sources
  // and exempt from the rate gate. It counts its OWN elapsed time, so Rebirth 2 switching
  // it on mid-session starts a clean 0.2 s cadence instead of back-firing a batch.
  if (stateRef.autoUnlocked) {
    autoElapsed += dt;
    let guard = AUTO_MAX_PER_STEP;
    while (guard-- > 0 && (autoFired + 1) * TUNING.AUTO_INTERVAL_S <= autoElapsed + DUE_EPS) {
      autoFired++;
      requestLift("auto");
    }
  }

  // An equip, a purchase or a rebirth can swap the item out from under us; the pose runs
  // after so the new group is never drawn at the origin.
  if (held && held.id !== stateRef.equippedItem) buildHeld();
  poseHeld();
  if (held) spinItemGroup(held.group, dt);
}

export function dispose() {
  for (const off of unsubs) off();
  unsubs = [];
  releaseHeld();
  ctxRef = null;
  stateRef = null;
  simT = 0;
  animT = Infinity;
  manualTimes = [];
  buttonHeld = false;
  autoElapsed = 0;
  autoFired = 0;
  autoSfxCount = 0;
  holdT = 0;
  holdRepeat = 0;
  lastBurnToastAt = -Infinity;
}
