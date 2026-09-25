// src/platform/hub/scripts/brickclimb.js — the Brick Climb: the Hub's own obby, and the
// ONLY way to Brick Legend. Spec 06 §5.3.7 owns this file (added 2026-09-25).
//
// Why it is here and not its own Place: the reward for finishing is a door OUT of
// OofWorld (Brick Legend is a separate game on the same site), so there is nothing on
// the other side of a portal to load. And it has to be somewhere a first-time player
// walks past, which is the plaza.
//
// It is deliberately a FORGIVING obby: no kill bricks and no checkpoints, because the
// Hub has no fall damage and no death — miss a jump and you land on the grass and walk
// back to the bottom. A lobby climb that punishes is a lobby people leave.
//
// Reachability (the numbers, so nobody has to re-derive them): WalkSpeed 16, jump
// initial velocity 50, gravity 196.2 (ARCHITECTURE §5) — apex 6.37 studs, and a running
// jump clears about 9 studs of gap. The spiral's step chord is 2·R·sin(π/STEPS_PER_TURN)
// = 2·11·sin(18°) = 6.8 studs with a 2.2-stud rise, which is comfortably inside that on
// every step; the three special steps (bounce pad, mover, spinner) only ever make a hop
// easier, never longer.

const STEPS = 20;
const STEPS_PER_TURN = 10;
const RADIUS = 11;
const RISE = 2.2;
const BASE = [0, 0, 76]; // due south of spawn (0, 3, 34) — turn around and it is there
const PLINTH_Y = 1;
const STEP_SIZE = [5, 1, 5];

const BRICK = "#9c4a3c";
const BRICK_DARK = "#6d3329";
const MORTAR = "#c9b8a8";
const GOLD = "#f5c542";
const NEON_PORTAL = "#ff6a2a";

// Which steps are special, and what they are. Chosen so the first five are plain (learn
// the spiral), and so no two specials are adjacent (landing on a mover FROM a spinner is
// not a jump anyone can plan).
const SPECIAL_STEPS = new Map([
  [7, "bounce"],
  [11, "mover"],
  [15, "spinner"],
  [18, "conveyor"],
]);

function stepPose(i) {
  const angle = (i / STEPS_PER_TURN) * Math.PI * 2;
  return {
    x: BASE[0] + Math.cos(angle) * RADIUS,
    y: PLINTH_Y + 1 + (i + 1) * RISE,
    z: BASE[2] + Math.sin(angle) * RADIUS,
    angleDeg: (angle * 180) / Math.PI,
  };
}

export function buildBrickClimb(ctx, track) {
  const topY = stepPose(STEPS - 1).y + 3;

  // ---- the base: a plinth, the locked gate, and a sign ------------------------------
  track.part({
    id: "hubClimbPlinth", shape: "cylinder", size: [26, 2, 26], position: [BASE[0], PLINTH_Y, BASE[2]],
    color: MORTAR, material: "cobble",
  });
  // The central pillar the spiral wraps: a pipe, so the climb reads as a tower with a
  // core rather than a floating staircase.
  track.part({
    id: "hubClimbCore", shape: "tube", size: [9, topY, 9],
    position: [BASE[0], PLINTH_Y + 1 + topY / 2, BASE[2]], color: BRICK, material: "brick",
  });

  // The ground-level shortcut gate. Locked until the climb is beaten ONCE; after that
  // this is the door, so nobody has to climb twice.
  const gateZ = BASE[2] - 14;
  for (const side of [-1, 1]) {
    track.part({
      id: `hubClimbGatePillar_${side > 0 ? "e" : "w"}`, size: [3, 14, 3],
      position: [side * 7, 7, gateZ], color: BRICK_DARK, material: "brick",
    });
  }
  track.part({
    id: "hubClimbGateLintel", size: [17, 3, 3], position: [0, 15.5, gateZ],
    color: BRICK_DARK, material: "brick",
  });
  const gatePlane = track.part({
    id: "hubClimbGatePlane", size: [11, 12, 0.6], position: [0, 7, gateZ],
    color: "#2f3338", material: "plastic", transparency: 0.35, canCollide: false,
    behaviors: [{ type: "touchEvent", event: "brickGate" }],
  });
  const gateLock = track.part({
    id: "hubClimbGateLock", shape: "ring", size: [6, 6, 1], position: [0, 7, gateZ - 0.6],
    color: "#8b949e", material: "metal", canCollide: false,
  });

  // ---- the spiral ------------------------------------------------------------------
  const stepIds = [];
  for (let i = 0; i < STEPS; i++) {
    const pose = stepPose(i);
    const special = SPECIAL_STEPS.get(i) || null;
    const def = {
      id: "hubClimbStep_" + i,
      size: STEP_SIZE.slice(),
      position: [pose.x, pose.y, pose.z],
      rotation: [0, -pose.angleDeg, 0],
      color: i % 2 === 0 ? BRICK : BRICK_DARK,
      material: "brick",
    };
    if (special === "bounce") {
      def.color = "#3ddc84";
      def.material = "plastic";
      def.behaviors = [{ type: "bounce", power: 70 }];
    } else if (special === "mover") {
      // A short in-and-out slide along the radius: it changes WHEN you jump, not how far.
      const inward = [
        pose.x + Math.cos((pose.angleDeg * Math.PI) / 180) * -4,
        pose.y,
        pose.z + Math.sin((pose.angleDeg * Math.PI) / 180) * -4,
      ];
      def.color = "#f5c542";
      def.material = "metal";
      def.behaviors = [{
        type: "movingPlatform",
        waypoints: [[pose.x, pose.y, pose.z], inward],
        speed: 5,
        mode: "pingpong",
      }];
    } else if (special === "spinner") {
      def.shape = "prism";
      def.size = [7, 1, 7];
      def.color = "#00a2ff";
      def.material = "metal";
      def.behaviors = [{ type: "spinner", axis: "y", speed: 70 }];
    } else if (special === "conveyor") {
      def.color = "#ff6a2a";
      def.material = "metal";
      def.size = [6, 1, 6];
      // Pushes you along the spiral's tangent, i.e. towards the next step.
      const tangent = [-Math.sin((pose.angleDeg * Math.PI) / 180), 0, Math.cos((pose.angleDeg * Math.PI) / 180)];
      def.behaviors = [{ type: "conveyor", direction: tangent, speed: 6 }];
    }
    stepIds.push(track.part(def));

    // Every fourth step carries a lamp, so the tower is climbable at night and reads as
    // a lit spiral from the plaza.
    if (i % 4 === 1) {
      track.part({
        id: "hubClimbLamp_" + i, shape: "capsule", size: [1.4, 2.4, 1.4],
        position: [pose.x, pose.y + 2.6, pose.z], color: GOLD, material: "neon", canCollide: false,
        light: { color: GOLD, intensity: 1.4, range: 22 },
      });
    }
  }

  // ---- the top: the landing and the Brick Legend doorway ----------------------------
  const top = stepPose(STEPS - 1);
  const landingY = top.y + 3;
  track.part({
    id: "hubClimbLanding", shape: "cylinder", size: [16, 1, 16],
    position: [BASE[0], landingY, BASE[2]], color: MORTAR, material: "cobble",
  });
  // No ramp onto the landing: the last step's inner edge is half a stud from the
  // landing's rim and 3 studs below it, which is a step up, not a jump (apex is 6.37).
  for (const side of [-1, 1]) {
    track.part({
      id: `hubClimbTopPillar_${side > 0 ? "e" : "w"}`, shape: "tube", size: [2.4, 12, 2.4],
      position: [BASE[0] + side * 5, landingY + 6.5, BASE[2]], color: GOLD, material: "gold",
    });
  }
  track.part({
    id: "hubClimbTopArch", size: [13, 2, 2.4], position: [BASE[0], landingY + 13, BASE[2]],
    color: GOLD, material: "gold",
  });
  track.part({
    id: "hubClimbTopStar", shape: "star", size: [6, 6, 1.4],
    position: [BASE[0], landingY + 17, BASE[2]], color: GOLD, material: "gold", canCollide: false,
    light: { color: GOLD, intensity: 3, range: 40 },
    behaviors: [{ type: "spinner", axis: "y", speed: 40 }],
  });
  const topTrigger = track.part({
    id: "hubClimbTop", size: [9, 8, 9], position: [BASE[0], landingY + 4, BASE[2]],
    transparency: 1, canCollide: false,
    behaviors: [{ type: "touchEvent", event: "brickTop" }],
  });

  let beaconId = null;
  let beaconUntil = 0;

  return {
    steps: STEPS,
    topTrigger,
    gatePlane,
    landingY,
    base: BASE.slice(),
    gate: [0, 7, gateZ],

    // Locked: grey stone and a padlock ring. Unlocked: the plane glows and the lock
    // turns gold. Called on load with what the save says, and again the moment the climb
    // is finished — the same call either way, so there is one appearance per state.
    setUnlocked(on) {
      ctx.engine.parts.setColor(gatePlane, on ? NEON_PORTAL : "#2f3338");
      ctx.engine.parts.setTransparency(gatePlane, on ? 0.25 : 0.35);
      ctx.engine.parts.setColor(gateLock, on ? GOLD : "#8b949e");
      ctx.engine.parts.setLight(gateLock, on ? { color: NEON_PORTAL, intensity: 2.2, range: 30 } : null);
    },

    // A pillar of light up the tower when the climb is first beaten, lit long enough to
    // be seen from the plaza floor. Sim time only (ARCHITECTURE §5).
    celebrate(now, durationS) {
      if (beaconId === null) {
        beaconId = track.part({
          id: "hubClimbBeacon", shape: "cylinder", size: [3, 120, 3],
          position: [BASE[0], landingY + 60, BASE[2]], color: GOLD, material: "neon",
          transparency: 0.55, canCollide: false,
          light: { color: GOLD, intensity: 4, range: 80 },
        });
      }
      beaconUntil = now + durationS;
    },

    update(now) {
      if (beaconId !== null && now >= beaconUntil) {
        track.drop(beaconId);
        beaconId = null;
      }
    },

    dispose() {
      beaconId = null;
      stepIds.length = 0;
      track.dispose();
    },
  };
}
