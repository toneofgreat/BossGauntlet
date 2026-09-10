// src/games/bus/scripts/layout.js — The Bus Ride. Spec 25 owns this Place. Pure.
//
// A city bus you ride along an open road. buildBus() returns every static part def plus
// the handful of positions the game loop needs: where the riders sit (needle targets and
// the "everyone" who dies in a crash), the drive lanes, and where obstacles spawn and
// resolve. No engine imports — just data the engine's parts.create() understands.

export const FLOOR_TOP = 4;                    // y of the walkable bus floor
export const SPAWN = Object.freeze([9, FLOOR_TOP + 0.3, 0]);
export const SPAWN_YAW = 90;                   // facing +x, up the aisle toward the driver

// Bus body spans x in [0, BUS_LEN]; the windshield is at the front, the road beyond it.
const BUS_LEN = 46;
const HALF_W = 8;                              // interior half-width (z)
export const WINDSHIELD_X = 45;
export const DRIVER_SEAT = Object.freeze([41, FLOOR_TOP + 0.3, 0]);

// Drive mode: three lanes on the road ahead. Obstacles spawn far out and roll toward the
// bus; they resolve (crash or dodge) as they reach RESOLVE_X, just past the windshield.
export const LANE_Z = Object.freeze([-6.5, 0, 6.5]);
export const OBSTACLE_SPAWN_X = 200;
export const RESOLVE_X = 54;
export const STEER_X = 58;                      // where the lane arrow sits on the road

const BODY = "#f5c518";      // school-bus yellow
const TRIM = "#d94436";      // red belt line
const DARK = "#20242c";      // floor / asphalt
const GLASS = "#bfe8ff";
const SEAT = "#2f6fd0";

let seq = 0;
const P = (def) => ({ id: `bus_${seq++}`, material: "plastic", canCollide: true, ...def });

// A seated toy rider: a round one-eyed figure, deliberately NOT a blocky avatar, so it
// never reads as a fake player (ARCHITECTURE §9) — it is a prop, like the boss Keepers.
function buildRider(parts, n, x, z, bodyColor) {
  const aisle = z > 0 ? -1 : 1;               // they face the centre aisle
  const bodyId = `rider${n}_body`;
  const headId = `rider${n}_head`;
  const eyeId = `rider${n}_eye`;
  const headColor = "#ffd9a8";
  const bodyPos = [x, FLOOR_TOP + 1.2, z];
  const headPos = [x, FLOOR_TOP + 3.0, z];
  const eyePos = [x, FLOOR_TOP + 3.1, z + aisle * 0.75];
  parts.push({ id: bodyId, shape: "cylinder", size: [1.5, 2.3, 1.5], position: bodyPos, color: bodyColor, material: "plastic", canCollide: false });
  parts.push({ id: headId, shape: "sphere", size: [1.5, 1.5, 1.5], position: headPos, color: headColor, material: "plastic", canCollide: false });
  parts.push({ id: eyeId, shape: "sphere", size: [0.42, 0.42, 0.42], position: eyePos, color: "#101216", material: "plastic", canCollide: false });
  return {
    n, bodyId, headId, eyeId,
    bodyPos, headPos, eyePos,
    bodyColor, headColor,
  };
}

export function buildBus() {
  seq = 0;
  const parts = [];
  const riders = [];

  // ---- floor + a strip of dark road running far ahead of the windshield ----
  parts.push(P({ id: "floor", size: [BUS_LEN + 2, 1, HALF_W * 2 + 2], position: [BUS_LEN / 2, FLOOR_TOP - 0.5, 0], color: "#2a2f3a", material: "metal" }));
  parts.push(P({ size: [340, 1, 30], position: [WINDSHIELD_X + 168, FLOOR_TOP - 0.5, 0], color: DARK, material: "plastic" }));
  // lane lines on the road so the three drive lanes read
  for (const lz of [-3.2, 3.2]) {
    for (let s = 0; s < 22; s++) parts.push(P({ size: [5, 0.12, 0.5], position: [WINDSHIELD_X + 12 + s * 15, FLOOR_TOP + 0.06, lz], color: "#f7c948", material: "neon", canCollide: false }));
  }

  // ---- bus shell: back wall, side panels with a window band, roof ----
  parts.push(P({ size: [1, 9, HALF_W * 2], position: [-0.5, FLOOR_TOP + 4.5, 0], color: BODY }));
  for (const side of [-1, 1]) {
    const z = side * HALF_W;
    parts.push(P({ size: [BUS_LEN, 3, 0.6], position: [BUS_LEN / 2, FLOOR_TOP + 1.6, z], color: BODY }));                    // lower panel
    parts.push(P({ size: [BUS_LEN, 0.6, 0.7], position: [BUS_LEN / 2, FLOOR_TOP + 3.2, z], color: TRIM, material: "neon", canCollide: false })); // belt line
    parts.push(P({ size: [BUS_LEN, 3.2, 0.4], position: [BUS_LEN / 2, FLOOR_TOP + 5.4, z], color: GLASS, material: "glass", canCollide: false })); // window band
    parts.push(P({ size: [BUS_LEN, 1, 0.7], position: [BUS_LEN / 2, FLOOR_TOP + 7.4, z], color: BODY, canCollide: false }));  // top rail
  }
  parts.push(P({ size: [BUS_LEN + 1, 0.8, HALF_W * 2 + 1], position: [BUS_LEN / 2, FLOOR_TOP + 8, 0], color: BODY, canCollide: false })); // roof
  // window mullions
  for (let s = 1; s < 6; s++) for (const side of [-1, 1]) parts.push(P({ size: [0.5, 3.2, 0.9], position: [s * 7.4, FLOOR_TOP + 5.4, side * HALF_W], color: BODY, canCollide: false }));

  // ---- the front: windshield, hood, headlights, driver seat + wheel ----
  parts.push(P({ size: [0.5, 7, HALF_W * 2 - 0.5], position: [WINDSHIELD_X, FLOOR_TOP + 4.4, 0], color: GLASS, material: "glass" }));
  parts.push(P({ size: [3.5, 2.4, HALF_W * 2 + 1], position: [WINDSHIELD_X + 1.6, FLOOR_TOP + 0.9, 0], color: BODY })); // hood (low, so the driver sees the road)
  for (const side of [-1, 1]) parts.push(P({ shape: "sphere", size: [1, 1, 1], position: [WINDSHIELD_X + 3.3, FLOOR_TOP + 1.6, side * (HALF_W - 1.5)], color: "#fff59e", material: "neon", canCollide: false }));
  parts.push(P({ size: [3, 1.4, 3], position: [42, FLOOR_TOP + 1.2, 0], color: "#1c2029", material: "metal" })); // driver seat base
  parts.push(P({ size: [0.6, 2.4, 3], position: [43.2, FLOOR_TOP + 2.4, 0], color: "#1c2029", material: "metal", canCollide: false })); // seat back
  parts.push(P({ shape: "cylinder", size: [0.4, 2, 0.4], position: [40, FLOOR_TOP + 1.8, 0], rotation: [70, 0, 0], color: "#12141c", material: "metal", canCollide: false })); // steering column
  parts.push(P({ shape: "cylinder", size: [1.7, 0.35, 1.7], position: [39.5, FLOOR_TOP + 2.7, 0], rotation: [70, 0, 0], color: "#12141c", material: "metal", canCollide: false })); // wheel

  // ---- wheels (visual, below the floor) ----
  for (const wx of [9, 37]) for (const side of [-1, 1]) parts.push(P({ shape: "cylinder", size: [2.6, 1.4, 2.6], position: [wx, FLOOR_TOP - 1.4, side * (HALF_W + 0.4)], rotation: [90, 0, 0], color: "#15171d", material: "metal", canCollide: false }));

  // ---- seats + riders down both sides (riders are the needle targets & crash victims) ----
  const rows = [14, 21, 28, 35];
  const riderPlan = [
    [14, 5, "#e0245e"], [14, -5, "#3ddc84"],
    [21, 5, "#a05cff"], [28, -5, "#35a3e0"],
    [35, 5, "#ff8c1a"], [28, 5, "#f7c948"],
  ];
  for (const rx of rows) for (const side of [-1, 1]) {
    const z = side * 5;
    parts.push(P({ size: [3, 1.2, 3], position: [rx, FLOOR_TOP + 0.6, z], color: SEAT })); // seat
    parts.push(P({ size: [0.6, 2.2, 3], position: [rx + (side > 0 ? 1.2 : -1.2), FLOOR_TOP + 1.6, z], color: SEAT, canCollide: false })); // backrest
  }
  riderPlan.forEach(([x, z, c], i) => riders.push(buildRider(parts, i, x, z, c)));

  // ---- grab poles down the aisle ----
  for (let s = 0; s < 5; s++) parts.push(P({ shape: "cylinder", size: [0.25, 7, 0.25], position: [12 + s * 7, FLOOR_TOP + 3.5, 0], color: "#c9d2e4", material: "metal", canCollide: false }));

  // ---- the steering lane-arrow used in drive mode (starts hidden far below) ----
  const steerId = "bus_steer";
  parts.push({ id: steerId, shape: "wedge", size: [3, 2, 4], position: [STEER_X, -60, 0], color: "#f7c948", material: "neon", canCollide: false });

  return { parts, riders, steerId };
}
