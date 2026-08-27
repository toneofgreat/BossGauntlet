// src/platform/hub/scripts/ghosts.js — the Hub's ghost wanderers: fake "players" that
// walk a fixed waypoint graph around the plaza so the world is never an empty room.
// Spec 06 §5.4 owns this file.
//
// ARCHITECTURE §9 (honesty clause) is both the reason this module exists and the limit
// on what it may do: ghosts are local, simulated and purely cosmetic. No networking,
// no presence, no claim that anyone else is here. They are also not physics bodies —
// every part is canCollide:false and is placed kinematically from the sim step
// (§5.4.2), so the avatar walks straight through them and they never react to it
// (criterion 12).

import { randomUsername } from "./names.js";

// ---------------------------------------------------------------------------
// tuning constants — spec 06 §6 pins these to this module
// ---------------------------------------------------------------------------

const GHOST_SPEED_MIN = 8; // units/s, fixed per ghost at spawn
const GHOST_SPEED_MAX = 12;
const GHOST_IDLE_MIN_S = 2; // idle dwell at a waypoint
const GHOST_IDLE_MAX_S = 6;
const GHOST_EMOTE_CHANCE = 0.15; // emote roll on arrival
const GHOST_ARRIVE_RADIUS = 1.5; // waypoint arrival distance
const GHOST_TURN_DEG_S = 540; // max yaw rate
const WAYPOINT_RING_RADIUS = 38; // plaza ring radius

// §5.4.4 spawn/animation numbers that §6 does not tabulate.
const GHOST_SPAWN_TIMER_MAX_S = 4; // initial idle timer = rand(0,4) — desyncs the crowd
const WALK_SWING_DEG = 35; // limb swing amplitude while walking
const WALK_HZ_PER_SPEED = 1 / 3; // stride frequency = speed/3 Hz
const BOB_UNITS = 0.05; // idle "breathing" head bob amplitude
const BOB_HZ = 0.5;
const EMOTE_WAVE_S = 2.0;
const EMOTE_SPIN_S = 1.0;
const WAVE_ARM_DEG = -140; // right arm raised...
const WAVE_SWING_DEG = 25; // ...then oscillating about that by this much
const WAVE_HZ = 2;
const SPIN_DEG_S = 360;
const SPIN_HOP_UNITS = 2; // parabola peak of the spin hop
const SIT_DROP_UNITS = 1.5; // torso/head (and everything hung off them) drop
const SIT_LEG_DEG = -90; // legs rotate forward
const EMOTES = ["wave", "spin", "sit"];

// Writes below these deltas are skipped. Every setPosition/setRotation allocates
// inside the engine (a def slice, a Quaternion + Euler), and 8 ghosts x 6 parts x
// 60 Hz is enough traffic to be worth not rewriting a value the part already holds.
// Both thresholds are far under one screen pixel at plaza distances.
const POS_EPS = 0.005; // units
const ROT_EPS = 0.25; // degrees

// ---------------------------------------------------------------------------
// body plan — §5.4.2, avatar proportions, 5 units tall
// ---------------------------------------------------------------------------

const LEG_SIZE = [0.9, 1.8, 0.9];
const TORSO_SIZE = [2, 2, 1];
const ARM_SIZE = [0.8, 1.9, 0.8];
const HEAD_SIZE = [1.2, 1.2, 1.2];
const BODY_HEIGHT = LEG_SIZE[1] + TORSO_SIZE[1] + HEAD_SIZE[1]; // 5.0 exactly

// Local frame: origin at the feet, +y up, +z the direction the ghost faces, so the
// ghost's own LEFT is +x (right-handed frame, facing +z with +y up). Limbs hang from a
// pivot (hip / shoulder) rather than turning about their own centre — a part rotates
// about its centre, so each centre is derived from the pivot and the swing angle.
const HIP_X = 0.45; // torso half-width 1.0 minus leg half-width 0.45 — hips inside the torso
const HIP_Y = LEG_SIZE[1]; // 1.8
const SHOULDER_X = TORSO_SIZE[0] / 2 + ARM_SIZE[0] / 2; // 1.4
const SHOULDER_Y = LEG_SIZE[1] + TORSO_SIZE[1]; // 3.8
const TORSO_Y = LEG_SIZE[1] + TORSO_SIZE[1] / 2; // 2.8
const HEAD_Y = SHOULDER_Y + HEAD_SIZE[1] / 2; // 4.4

// Name tag: §5.4.2's [4,1,0.01] billboard, "1.2 units above the head" — read as 1.2
// above the crown, which clears the head instead of overlapping it.
const TAG_W = 4;
const TAG_H = 1;
const TAG_Y = BODY_HEIGHT + 1.2;
const TAG_PX_PER_UNIT = 48; // canvas resolution, matching the hub's other world signs
const TAG_BG = "rgba(23,25,28,0.55)"; // 55%-alpha #17191c per §5.4.2
const TAG_TEXT = "#ffffff";
const TAG_FONT = '600 %PXpx "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

// index = ghost id, so the 8 ghosts of §6 are all distinct (§5.4.2).
const TORSO_COLORS = ["#0f5cc2", "#e74c3c", "#3ddc84", "#f5c542", "#9b59b6", "#e67e22",
  "#1abc9c", "#95a5a6"];
const SKIN_COLOR = "#f8d21c"; // head; §5.4.2 fixes it, and the arms follow it (see below)
const LEG_DARKEN = 0.3; // legs are a 30%-darkened torso colour

const BODY = [
  // Arms take the head's colour: §5.4.2 names a colour for head, torso and legs only,
  // and the plaza statue (§5.3.2 rows 6-14) paints its arms the same yellow as its
  // head, so ghosts follow the statue rather than invent a fourth colour.
  { key: "legL", size: LEG_SIZE, tint: "legs", pivot: [HIP_X, HIP_Y, 0] },
  { key: "legR", size: LEG_SIZE, tint: "legs", pivot: [-HIP_X, HIP_Y, 0] },
  { key: "armL", size: ARM_SIZE, tint: "skin", pivot: [SHOULDER_X, SHOULDER_Y, 0] },
  { key: "armR", size: ARM_SIZE, tint: "skin", pivot: [-SHOULDER_X, SHOULDER_Y, 0] },
  { key: "torso", size: TORSO_SIZE, tint: "torso", at: [0, TORSO_Y, 0] },
  { key: "head", size: HEAD_SIZE, tint: "skin", at: [0, HEAD_Y, 0] },
];

// ---------------------------------------------------------------------------
// waypoint graph — §5.4.3, 13 fixed nodes
// ---------------------------------------------------------------------------

// SPEC GAP (reported): §5.4.3 writes the ring as `(38cosT, 0, 38sinT)` but then fixes
// the convention as "angles increase counter-clockwise toward -z", which is
// z = -R*sin(T). The prose wins, because only it makes the portal-approach adjacencies
// geometrically true: node 9 (0,0,-58) is the lifting portal approach and is adjacent
// to the ring at 90 deg, which must therefore be the north point (0,0,-38). Under the
// literal formula that edge would run from the north approach to the SOUTH ring node —
// straight through the fountain and the statue.
const RING_NODES = 8;
const NODES = [];
for (let i = 0; i < RING_NODES; i++) {
  const a = (i * (360 / RING_NODES) * Math.PI) / 180;
  NODES.push([
    round2(WAYPOINT_RING_RADIUS * Math.cos(a)),
    0,
    round2(-WAYPOINT_RING_RADIUS * Math.sin(a)),
  ]);
}
NODES.push([-50, 0, -58]); // 8  obby portal approach
NODES.push([0, 0, -58]); //   9  lifting portal approach
NODES.push([50, 0, -58]); //  10 tycoon portal approach
NODES.push([62, 0, 0]); //    11 storefront door
NODES.push([-62, 0, 0]); //   12 badge wall bench

// The literal 13-element adjacency array §5.4.3 asks for. Ring nodes link to both ring
// neighbours; the five outliers link to the ring nodes §5.4.3's "concretely" list names
// by ANGLE (8<->{135,180}, 9<->{90,135}, 10<->{45,90}, 11<->{0,315}, 12<->{180,225}).
// SPEC GAP (reported): the same sentence's shorthand indices ("8<->{4,5}, 9<->{5,6}")
// disagree with its own angle list by one node; the angle list is the refinement that
// sentence introduces with "concretely", so it is the one encoded here.
const ADJ = [
  [1, 7, 11], //    0  ring   0 deg  east
  [0, 2, 10], //    1  ring  45 deg  north-east
  [1, 3, 9, 10], // 2  ring  90 deg  north
  [2, 4, 8, 9], //  3  ring 135 deg  north-west
  [3, 5, 8, 12], // 4  ring 180 deg  west
  [4, 6, 12], //    5  ring 225 deg  south-west
  [5, 7], //        6  ring 270 deg  south
  [6, 0, 11], //    7  ring 315 deg  south-east
  [3, 4], //        8  obby portal approach
  [2, 3], //        9  lifting portal approach
  [1, 2], //       10  tycoon portal approach
  [0, 7], //       11  storefront door
  [4, 5], //       12  badge wall bench
];

// The plaza disc (§5.3.2 row 2) is a 90-wide cylinder whose top face sits at y = 0.5,
// while §5.4.3 puts every node at "y = 0 walk height". Taken literally the ring ghosts
// would stand shin-deep in the plaza, so foot height follows the surface underneath,
// with a short blend across the disc's rim so the step off it is not a pop. A
// judgement call the spec did not make.
const PLAZA_RADIUS = 45;
const PLAZA_TOP_Y = 0.5;
const PLAZA_EDGE_BLEND = 2;

// Judgement call the spec did not make (reported): §5.4.4 spawns ghosts "at distinct
// random waypoints", but ring node 6 (0,0,38) sits four units from the Hub's own spawn
// point (§3.3, spawn [0,3,34]) and therefore straight down the boot camera's line of
// sight. With 8 ghosts on 13 nodes that node is occupied in most sessions, so the
// player's first sight of the plaza is somebody's back. Nodes inside this radius of the
// player are skipped when choosing INITIAL positions only — they stay ordinary walk
// targets, so ghosts still wander through the spawn area seconds later.
const SPAWN_CLEARANCE = 12;

// ---------------------------------------------------------------------------
// small math helpers
// ---------------------------------------------------------------------------

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;
const WALK_SWING = WALK_SWING_DEG * DEG;
const WAVE_ARM = WAVE_ARM_DEG * DEG;
const WAVE_SWING = WAVE_SWING_DEG * DEG;
const SIT_LEG = SIT_LEG_DEG * DEG;
const TURN_RAD_S = GHOST_TURN_DEG_S * DEG;
const SPIN_RAD_S = SPIN_DEG_S * DEG;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pickIndex(list) {
  return Math.floor(Math.random() * list.length);
}

// Signed shortest angular difference, wrapped into (-PI, PI].
function angleDelta(from, to) {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

function turnToward(from, to, maxStep) {
  const d = angleDelta(from, to);
  return from + (Math.abs(d) <= maxStep ? d : Math.sign(d) * maxStep);
}

function groundY(x, z) {
  const r = Math.hypot(x, z);
  if (r <= PLAZA_RADIUS - PLAZA_EDGE_BLEND) return PLAZA_TOP_Y;
  if (r >= PLAZA_RADIUS) return 0;
  return (PLAZA_TOP_Y * (PLAZA_RADIUS - r)) / PLAZA_EDGE_BLEND;
}

// 30%-darkened torso colour for the legs: a linear multiply toward black, the same
// shape as the engine's own darken() for hemisphere ground colour.
function darken(hex, factor) {
  const n = parseInt(hex.slice(1), 16);
  const k = 1 - factor;
  const ch = (v) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, "0");
  return "#" + ch((n >> 16) & 255) + ch((n >> 8) & 255) + ch(n & 255);
}

// Cosmetic-only motion stops under reduced motion (§5.4.4 point 1, §5.6.2 rule 3).
// The shell owns the effective flag and publishes it as a body class, which is the
// only read of it available to a Place — ctx carries no motion preference.
function reducedMotion() {
  return typeof document !== "undefined" && !!document.body
    && document.body.classList.contains("oof-reduced-motion");
}

// ---------------------------------------------------------------------------
// name tag — a Sprite, because there is no billboard part
// ---------------------------------------------------------------------------

// SPEC GAP (reported): §5.4.2 asks for a "[4,1,0.01]" part with the "billboard flag
// from parts spec"; the parts spec has no such flag, and ctx exposes no camera object
// to aim a plane at by hand. A Sprite is camera-facing by construction and is already
// the house pattern for world-space labels (src/games/tycoon/scripts/plot.js), so the
// tag is a Sprite of exactly those world dimensions, added via parts.addCustom.
function fitFont(c2d, text, startPx, maxWidth) {
  let px = startPx;
  for (;;) {
    c2d.font = TAG_FONT.replace("%PX", String(px));
    if (px <= 8 || c2d.measureText(text).width <= maxWidth) return;
    px -= 1;
  }
}

function makeTag(ctx, username) {
  const THREE = ctx.engine.THREE;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(TAG_W * TAG_PX_PER_UNIT);
  canvas.height = Math.round(TAG_H * TAG_PX_PER_UNIT);
  const c2d = canvas.getContext("2d");

  // The 14px DOM floor (§5.6.2 rule 1) is a DOM rule; a world-space texture has no
  // fixed px size, so the tag is drawn to fill its plate and legibility comes from the
  // plate's world size instead.
  c2d.clearRect(0, 0, canvas.width, canvas.height);
  c2d.fillStyle = TAG_BG;
  const radius = canvas.height * 0.3;
  if (typeof c2d.roundRect === "function") {
    c2d.beginPath();
    c2d.roundRect(0, 0, canvas.width, canvas.height, radius);
    c2d.fill();
  } else {
    c2d.fillRect(0, 0, canvas.width, canvas.height);
  }
  c2d.textAlign = "center";
  c2d.textBaseline = "middle";
  c2d.fillStyle = TAG_TEXT;
  fitFont(c2d, username, Math.round(canvas.height * 0.62), canvas.width * 0.88);
  c2d.fillText(username, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(TAG_W, TAG_H, 1);
  return { sprite, tex, mat, id: ctx.engine.parts.addCustom(sprite) };
}

// ---------------------------------------------------------------------------
// pose — local body frame -> world part transforms
// ---------------------------------------------------------------------------

// A limb's world rotation is Ry(yaw) * Rx(swing); parts take XYZ Euler degrees, and
// that composition is NOT (swing, yaw, 0) in XYZ order once yaw is non-zero, so it is
// composed as quaternions and decomposed once. Scratch objects are reused: this runs
// for every limb of every ghost, every sim step.
function rotationDegrees(scratch, yaw, swing, out) {
  if (swing === 0) {
    out[0] = 0;
    out[1] = yaw * RAD;
    out[2] = 0;
    return out;
  }
  scratch.qa.setFromAxisAngle(scratch.up, yaw);
  scratch.qb.setFromAxisAngle(scratch.right, swing);
  scratch.qa.multiply(scratch.qb);
  scratch.euler.setFromQuaternion(scratch.qa, "XYZ");
  out[0] = scratch.euler.x * RAD;
  out[1] = scratch.euler.y * RAD;
  out[2] = scratch.euler.z * RAD;
  return out;
}

// Limb swing angles for the current state. Positive swings a limb backward (-z),
// negative forward, following Rx applied to a limb hanging down the -y axis.
function swingAngles(g, sit) {
  const out = { legL: 0, legR: 0, armL: 0, armR: 0 };
  if (sit) {
    out.legL = SIT_LEG;
    out.legR = SIT_LEG;
    return out;
  }
  if (g.state === "walk") {
    const s = Math.sin(g.clock * TAU * g.speed * WALK_HZ_PER_SPEED) * WALK_SWING;
    out.legL = s;
    out.legR = -s;
    out.armL = -s; // opposite arm to leg on the same side
    out.armR = s;
    return out;
  }
  if (g.state === "emote" && g.emote === "wave") {
    out.armR = WAVE_ARM + Math.sin(g.emoteT * TAU * WAVE_HZ) * WAVE_SWING;
  }
  return out;
}

function applyPart(api, g, key, lx, ly, lz, swing) {
  const id = g.parts[key];
  if (id === undefined) return;
  const sy = Math.sin(g.yaw);
  const cy = Math.cos(g.yaw);
  const wx = g.pos[0] + lx * cy + lz * sy;
  const wy = g.pos[1] + ly;
  const wz = g.pos[2] - lx * sy + lz * cy;

  const held = g.applied[key];
  if (Math.abs(held.pos[0] - wx) > POS_EPS || Math.abs(held.pos[1] - wy) > POS_EPS
    || Math.abs(held.pos[2] - wz) > POS_EPS || !Number.isFinite(held.pos[0])) {
    held.pos[0] = wx;
    held.pos[1] = wy;
    held.pos[2] = wz;
    api.parts.setPosition(id, held.pos);
  }

  const rot = rotationDegrees(api.scratch, g.yaw, swing, api.rotBuf);
  if (Math.abs(held.rot[0] - rot[0]) > ROT_EPS || Math.abs(held.rot[1] - rot[1]) > ROT_EPS
    || Math.abs(held.rot[2] - rot[2]) > ROT_EPS || !Number.isFinite(held.rot[0])) {
    held.rot[0] = rot[0];
    held.rot[1] = rot[1];
    held.rot[2] = rot[2];
    api.parts.setRotation(id, held.rot);
  }
}

function applyPose(api, g, reduced) {
  const sit = g.state === "emote" && g.emote === "sit";
  const drop = sit ? -SIT_DROP_UNITS : 0;
  const bob = !reduced && g.state === "idle" ? Math.sin(g.clock * TAU * BOB_HZ) * BOB_UNITS : 0;
  const swing = swingAngles(g, sit);

  for (const b of BODY) {
    if (b.pivot) {
      // Centre of a limb hanging `half` below its pivot, swung by its angle.
      const half = b.size[1] / 2;
      const a = swing[b.key];
      applyPart(api, g, b.key,
        b.pivot[0],
        b.pivot[1] + drop - half * Math.cos(a),
        b.pivot[2] - half * Math.sin(a),
        a);
    } else {
      applyPart(api, g, b.key, b.at[0], b.at[1] + drop + (b.key === "head" ? bob : 0), b.at[2], 0);
    }
  }

  if (g.tag) g.tag.sprite.position.set(g.pos[0], g.pos[1] + TAG_Y + drop, g.pos[2]);
}

// ---------------------------------------------------------------------------
// state machine — §5.4.4, one pass per sim step
// ---------------------------------------------------------------------------

function toIdle(g) {
  g.state = "idle";
  g.emote = null;
  g.emoteT = 0;
  g.timer = rand(GHOST_IDLE_MIN_S, GHOST_IDLE_MAX_S);
}

function startWalk(g) {
  const neighbours = ADJ[g.waypoint];
  if (!neighbours || neighbours.length === 0) {
    toIdle(g); // unreachable with the fixed graph; a lone node would simply idle on
    return;
  }
  g.target = neighbours[pickIndex(neighbours)];
  g.state = "walk";
}

function arrive(g) {
  // The waypoint is snapped, the position is NOT: stopping inside the arrival radius
  // and staying there avoids a visible jump of up to 1.5 units onto the node centre,
  // and the next walk simply starts from wherever the ghost actually stopped.
  g.waypoint = g.target;
  if (Math.random() < GHOST_EMOTE_CHANCE) {
    g.state = "emote";
    g.emote = EMOTES[pickIndex(EMOTES)];
    g.emoteT = 0;
    g.timer = g.emote === "wave" ? EMOTE_WAVE_S
      : g.emote === "spin" ? EMOTE_SPIN_S
        : rand(GHOST_IDLE_MIN_S, GHOST_IDLE_MAX_S);
    return;
  }
  toIdle(g);
}

function stepWalk(g, dt) {
  const node = NODES[g.target];
  const dx = node[0] - g.pos[0];
  const dz = node[2] - g.pos[2];
  const dist = Math.hypot(dx, dz);
  if (dist > 1e-4) {
    g.yaw = turnToward(g.yaw, Math.atan2(dx, dz), TURN_RAD_S * dt);
    const step = Math.min(g.speed * dt, dist);
    g.pos[0] += (dx / dist) * step;
    g.pos[2] += (dz / dist) * step;
  }
  if (Math.hypot(node[0] - g.pos[0], node[2] - g.pos[2]) < GHOST_ARRIVE_RADIUS) arrive(g);
}

function stepGhost(api, g, dt, reduced) {
  g.clock += dt;
  let hop = 0;

  if (g.state === "idle") {
    g.timer -= dt;
    if (g.timer <= 0) startWalk(g);
  } else if (g.state === "walk") {
    stepWalk(g, dt);
  } else {
    g.emoteT += dt;
    g.timer -= dt;
    if (g.emote === "spin") {
      g.yaw += SPIN_RAD_S * dt; // a full 360 over the 1 s spin, so the pose restores itself
      const u = Math.min(1, Math.max(0, g.emoteT / EMOTE_SPIN_S));
      hop = 4 * SPIN_HOP_UNITS * u * (1 - u); // parabola peaking +2 at mid-emote
    }
    if (g.timer <= 0) toIdle(g);
  }

  g.pos[1] = groundY(g.pos[0], g.pos[2]) + hop;
  applyPose(api, g, reduced);
}

// ---------------------------------------------------------------------------
// spawn / handle
// ---------------------------------------------------------------------------

function shuffledNodes() {
  const order = NODES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  return order;
}

// Start nodes: shuffled for distinctness, minus anything the player is standing in
// (see SPAWN_CLEARANCE). Falls back to the unfiltered order if that would leave too
// few nodes, and when ctx has no player to ask (headless callers).
function startNodes(ctx, wanted) {
  const order = shuffledNodes();
  const at = ctx.player && typeof ctx.player.position === "function" ? ctx.player.position() : null;
  if (!Array.isArray(at)) return order;
  const clear = order.filter((n) => Math.hypot(NODES[n][0] - at[0], NODES[n][2] - at[2]) > SPAWN_CLEARANCE);
  return clear.length >= wanted ? clear : order;
}

function createGhost(ctx, api, id, node, taken) {
  const torso = TORSO_COLORS[id % TORSO_COLORS.length];
  const g = {
    id,
    username: randomUsername(taken),
    parts: {},
    colors: { torso, legs: darken(torso, LEG_DARKEN) },
    state: "idle",
    waypoint: node,
    target: node,
    speed: rand(GHOST_SPEED_MIN, GHOST_SPEED_MAX),
    timer: rand(0, GHOST_SPAWN_TIMER_MAX_S),
    emote: null,
    pos: [NODES[node][0], 0, NODES[node][2]],
    yaw: 0,
    // Animation phase, seeded per ghost so two ghosts idling side by side do not
    // breathe in lockstep (§5.4.4's desynchronisation intent).
    clock: rand(0, 10),
    emoteT: 0,
    applied: {},
    tag: null,
  };
  g.pos[1] = groundY(g.pos[0], g.pos[2]);
  // Spec-silent judgement call: spawn facing the fountain, so the plaza reads as a
  // crowd looking at the statue rather than at random walls.
  g.yaw = Math.atan2(-g.pos[0], -g.pos[2]);

  const tint = { torso: g.colors.torso, legs: g.colors.legs, skin: SKIN_COLOR };
  for (const b of BODY) {
    g.parts[b.key] = api.parts.create({
      id: "hubGhost_" + id + "_" + b.key,
      shape: "box",
      size: b.size,
      position: [g.pos[0], g.pos[1], g.pos[2]],
      color: tint[b.tint],
      material: "plastic",
      canCollide: false, // §5.4.2 — ghosts are scenery, never colliders (criterion 12)
    });
    // Seeded off-pose so the first applyPose writes every part exactly once.
    g.applied[b.key] = { pos: [NaN, NaN, NaN], rot: [NaN, NaN, NaN] };
  }
  g.tag = makeTag(ctx, g.username);
  return g;
}

// count = GHOST_COUNT from hub/game.js (§6: 8). Returns the handle §4 specifies —
// { update(dt), dispose() } — plus the read-only accessors the hub's debug object
// (§3.7, §8 scenario 5) hangs `ghostPositions()` off.
export function spawnGhosts(ctx, count) {
  const wanted = Math.max(0, Math.floor(Number(count) || 0));
  const api = {
    parts: ctx.engine.parts,
    rotBuf: [0, 0, 0],
    scratch: null,
  };
  const ghosts = [];

  if (wanted > 0) {
    const THREE = ctx.engine.THREE;
    api.scratch = {
      qa: new THREE.Quaternion(),
      qb: new THREE.Quaternion(),
      up: new THREE.Vector3(0, 1, 0),
      right: new THREE.Vector3(1, 0, 0),
      euler: new THREE.Euler(),
    };
    // Distinct random start nodes (§5.4.4). More ghosts than nodes would have to share
    // one, which the fixed 8 against 13 nodes never reaches.
    const starts = startNodes(ctx, wanted);
    const taken = new Set();
    const reduced = reducedMotion();
    for (let i = 0; i < wanted; i++) {
      const g = createGhost(ctx, api, i, starts[i % starts.length], taken);
      applyPose(api, g, reduced); // no first-frame flash at the creation position
      ghosts.push(g);
    }
  }

  return {
    count: ghosts.length,
    update(dt) {
      if (!(dt > 0)) return; // a paused or malformed step must not rewind the crowd
      const reduced = reducedMotion();
      for (const g of ghosts) stepGhost(api, g, dt, reduced);
    },
    // Debug/soak reads (§8 scenario 5, criterion 11). Copies, never the live arrays.
    positions() {
      return ghosts.map((g) => g.pos.slice());
    },
    usernames() {
      return ghosts.map((g) => g.username);
    },
    dispose() {
      for (const g of ghosts) {
        for (const key of Object.keys(g.parts)) api.parts.remove(g.parts[key]);
        g.parts = {};
        if (g.tag) {
          // The engine owns removal from the scene; the texture and material were made
          // here, so they are freed here (the same split hub/scripts/layout.js uses).
          api.parts.remove(g.tag.id);
          g.tag.mat.dispose();
          g.tag.tex.dispose();
          g.tag = null;
        }
      }
      ghosts.length = 0;
    },
  };
}
