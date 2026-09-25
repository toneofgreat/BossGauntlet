// OofRig procedural animation — spec 05 §5.2 (POSES, mode blending, walk cadence,
// EMOTES) and §6 (AVATAR_TUNING: the single source of truth for every avatar number).
// Pure math over the rig's joint pivots; no three import, no DOM.

// §6 — tuning table. Values are cited by name everywhere else in the avatar service.
export const AVATAR_TUNING = Object.freeze({
  RIG_HEIGHT: 5.0,
  POSE_BLEND_TIME: 0.15,
  EMOTE_BLEND_OUT: 0.2,
  STRIDE_LENGTH: 6.4,
  WALK_SWING_DEG: 45,
  WALK_SPEED_CLAMP_MIN: 0.3,
  WALK_SPEED_CLAMP_MAX: 1.5,
  // The reference WalkSpeed the amplitude scale is measured against (ARCHITECTURE §5:
  // "WalkSpeed default 16 units/s"), so speed 16 lands exactly on WALK_SWING_DEG.
  WALK_SPEED_REF: 16,
  ARM_SWING_RATIO: 0.8,
  IDLE_ARM_SWAY_DEG: 3,
  IDLE_ARM_SWAY_HZ: 0.4,
  IDLE_HEAD_SWAY_DEG: 1.5,
  IDLE_HEAD_SWAY_HZ: 0.25,
  WALK_MODE_MIN_SPEED: 0.5,
  JUMP_VY_THRESHOLD: 1,
  OOF_FACE_SECONDS: 1.5,
  FACE_CANVAS_SIZE: 128,
  GEAR_HOLD_ANGLE: 90,
  TRAIL_MIN_SPEED: 2,
  TRAIL_SAMPLE_STEPS: 3,
  TRAIL_MAX_POINTS: 30,
  SPRITE_TEX_SIZE: 32,
  PREVIEW_FOV: 40,
  PREVIEW_TARGET_Y: 2.5,
  PREVIEW_DIST: 9,
  PREVIEW_DIST_MIN: 4,
  PREVIEW_DIST_MAX: 12,
  PREVIEW_AUTOROTATE: 30,
  PREVIEW_PITCH_MIN: -10,
  PREVIEW_PITCH_MAX: 60,
  THUMB_SIZE: 96,
  CONFIRM_PRICE_THRESHOLD: 1000,
  GHOST_HAT_CHANCE: 0.3,
});

// §5.2 — joint-angle sets in DEGREES. Omitted joints are 0; head is [pitch, yaw].
export const POSES = Object.freeze({
  idle: Object.freeze({ leftArm: 2, rightArm: -2, leftLeg: 0, rightLeg: 0, head: Object.freeze([0, 0]) }),
  jump: Object.freeze({ leftArm: 170, rightArm: 170, leftLeg: 15, rightLeg: -10, head: Object.freeze([8, 0]) }),
  fall: Object.freeze({ leftArm: 140, rightArm: 150, leftLeg: -20, rightLeg: 25, head: Object.freeze([-12, 0]) }),
  gearHold: Object.freeze({ rightArm: AVATAR_TUNING.GEAR_HOLD_ANGLE }),
});

// §5.2.4 — the emote hook. Later specs append entries here and call rig.playEmote.
export const EMOTES = Object.freeze({
  wave: Object.freeze([
    { at: 0.0, pose: { rightArm: 170 } },
    { at: 0.3, pose: { rightArm: 170, head: [0, -15] } },
    { at: 0.6, pose: { rightArm: 170, head: [0, 15] } },
    { at: 0.9, pose: { rightArm: 170, head: [0, 0] } },
    { at: 1.2, pose: { rightArm: 0 } },
  ]),
  cheer: Object.freeze([
    { at: 0.0, pose: { leftArm: 170, rightArm: 170 } },
    { at: 0.25, pose: { leftArm: 150, rightArm: 150 } },
    { at: 0.5, pose: { leftArm: 170, rightArm: 170 } },
    { at: 0.75, pose: { leftArm: 150, rightArm: 150 } },
    { at: 1.0, pose: { leftArm: 0, rightArm: 0 } },
  ]),
});

const MODES = ["idle", "walk", "jump", "fall"];
const SWING_JOINTS = ["leftArm", "rightArm", "leftLeg", "rightLeg"];
const TAU = Math.PI * 2;
const DEG2RAD = Math.PI / 180;

function clampNum(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function smoothstep(t) {
  const c = clampNum(t, 0, 1);
  return c * c * (3 - 2 * c);
}

function zeroAngles() {
  return { leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0, headPitch: 0, headYaw: 0 };
}

function poseAngles(pose) {
  const a = zeroAngles();
  if (!pose) return a;
  for (const key of SWING_JOINTS) if (Number.isFinite(pose[key])) a[key] = pose[key];
  if (Array.isArray(pose.head)) {
    if (Number.isFinite(pose.head[0])) a.headPitch = pose.head[0];
    if (Number.isFinite(pose.head[1])) a.headYaw = pose.head[1];
  }
  return a;
}

function lerpAngles(from, to, s) {
  const out = zeroAngles();
  for (const key of Object.keys(out)) out[key] = from[key] + (to[key] - from[key]) * s;
  return out;
}

// createAnimator(rig) owns every joint rotation on that rig. It reads `rig.gearEquipped`
// for §5.2 step 5 (the rig sets that flag in setState — the animator is never told about
// items directly) and writes `rig.joints.*.rotation`.
export function createAnimator(rig) {
  const T = AVATAR_TUNING;
  let mode = "idle";
  let speed = 0;
  let clock = 0;                       // animator-local sim seconds (idle breathing)
  let phase = 0;                       // walk cycle phase, radians
  let blendFrom = zeroAngles();
  let blendT = T.POSE_BLEND_TIME;      // == blend time means "settled, no blend running"
  let current = zeroAngles();
  let emote = null;                    // { keys, t } while an emote plays

  function modeTarget() {
    let a;
    if (mode === "walk") {
      const amp = T.WALK_SWING_DEG
        * clampNum(speed / T.WALK_SPEED_REF, T.WALK_SPEED_CLAMP_MIN, T.WALK_SPEED_CLAMP_MAX);
      const swing = Math.sin(phase);
      a = zeroAngles();
      a.leftLeg = amp * swing;
      a.rightLeg = -amp * swing;
      a.leftArm = -T.ARM_SWING_RATIO * amp * swing;
      a.rightArm = T.ARM_SWING_RATIO * amp * swing;
    } else if (mode === "idle") {
      a = poseAngles(POSES.idle);
      const sway = T.IDLE_ARM_SWAY_DEG * Math.sin(TAU * T.IDLE_ARM_SWAY_HZ * clock);
      a.leftArm += sway;
      a.rightArm -= sway;
      a.headPitch += T.IDLE_HEAD_SWAY_DEG * Math.sin(TAU * T.IDLE_HEAD_SWAY_HZ * clock);
    } else {
      a = poseAngles(POSES[mode]);
    }
    // Step 5: held gear is carried out front in idle and walk, never in jump/fall.
    if (rig && rig.gearEquipped && (mode === "idle" || mode === "walk")) {
      a.rightArm = POSES.gearHold.rightArm;
    }
    return a;
  }

  // Returns the emote's angles for this step, or null once it has fully blended out.
  function emoteAngles(step, target) {
    emote.t += step;
    const keys = emote.keys;
    const last = keys[keys.length - 1];
    if (emote.t <= last.at) {
      let i = 0;
      while (i < keys.length - 1 && emote.t > keys[i + 1].at) i++;
      const k0 = keys[i];
      const k1 = keys[Math.min(i + 1, keys.length - 1)];
      const span = k1.at - k0.at;
      const u = span > 0 ? (emote.t - k0.at) / span : 1;
      return lerpAngles(poseAngles(k0.pose), poseAngles(k1.pose), u);
    }
    const outT = emote.t - last.at;
    if (outT < T.EMOTE_BLEND_OUT) {
      // Blend-out reuses the mode blend's smoothstep so the two never read differently.
      return lerpAngles(poseAngles(last.pose), target, smoothstep(outT / T.EMOTE_BLEND_OUT));
    }
    emote = null;
    return null;
  }

  function writeJoints(a) {
    const joints = rig && rig.joints;
    if (!joints) return;
    // Positive rotation about the pivot's local X swings the limb forward (§5.1).
    joints.leftArm.rotation.x = a.leftArm * DEG2RAD;
    joints.rightArm.rotation.x = a.rightArm * DEG2RAD;
    joints.leftLeg.rotation.x = a.leftLeg * DEG2RAD;
    joints.rightLeg.rotation.x = a.rightLeg * DEG2RAD;
    joints.head.rotation.set(a.headPitch * DEG2RAD, a.headYaw * DEG2RAD, 0);
  }

  function setAnimState(next) {
    if (!next || typeof next !== "object") return;
    if (Number.isFinite(next.speed)) speed = Math.max(0, next.speed);
    const wanted = next.mode;
    if (typeof wanted !== "string" || !MODES.includes(wanted) || wanted === mode) return;
    blendFrom = { ...current };
    blendT = 0;
    if (mode === "walk") phase = 0;    // §5.2 step 3: leaving walk resets the cycle
    mode = wanted;
  }

  function playEmote(name) {
    const keys = EMOTES[name];
    if (!Array.isArray(keys) || keys.length === 0) return;   // unknown emote: no-op
    emote = { keys, t: 0 };            // a new emote cancels the running one
  }

  function update(dt) {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    clock += step;
    if (mode === "walk") phase += TAU * (speed / T.STRIDE_LENGTH) * step;
    const target = modeTarget();
    let out = target;
    if (blendT < T.POSE_BLEND_TIME) {
      blendT += step;
      out = lerpAngles(blendFrom, target, smoothstep(blendT / T.POSE_BLEND_TIME));
    }
    if (emote) {
      const posed = emoteAngles(step, target);
      if (posed) out = posed;          // an emote fully overrides the mode pose
    }
    current = out;
    writeJoints(out);
  }

  return { setAnimState, playEmote, update };
}
