// src/engine/parts.js — Part model: build/parse/instance parts into Three.js
// meshes, the 8 procedural materials, and the 12 standard behaviors. Spec 03
// (docs/specs/03-parts-physics-character.md), owned across several tasks —
// see the banner comments below for which task owns which section.

import * as THREE from "../../assets/vendor/three.module.js";
// PERF.instancingThreshold is the single source for the instancing batch-size cutoff
// (spec 03 §5.3 "threshold 2"; renderer.js's own header names parts.js as the
// consumer). Importing a sibling engine module is fine — ARCHITECTURE §7's forbidden-
// import rule only bars src/platform/ and src/games/ from engine files.
import { PERF } from "./renderer.js";

// ===================================================================================
// ===== SECTION: init / load / instancing / addPart / setters / dynamics /
// interpolation — owned by M1-T11, spec 03 §5.3, §5.8-§5.9 (P4). =====================
// ===================================================================================
// Exports here (spec 03 §4.2): init, load, clear, addPart, create, createMany,
// addCustom, removePart (+ alias remove), setEmissiveIntensity, getPart, setColor,
// setTransparency, setPosition, setRotation, setCanCollide, applyInterpolation,
// update, getStats. Uses the M1-T08 section's `getMaterial`/`getGeometry`/`bucket`
// (plain module-scope functions below, same file — no import needed) as the single
// source of truth for materials/geometry/the transparency-bucket formula.
//
// Colliders are registered INTERNALLY here: `load()`/`addPart()` call
// `physics.colliderDescFromShape` + `physics.registerCollider` per part (spec 03
// §5.4's kind-selection rule lives in physics.js; the *when-to-register* rule, §5.4
// para 1, is this section's job). Game code and place.js never call physics directly
// for part colliders.
//
// Defaults: `load(partDefs)` assumes place.js's `applyPartDefaults` (spec 04) already
// fully populated every field ("Defaults are applied exactly ONCE, by place.js... —
// parts.load receives fully-populated defs and never re-defaults", spec 03 §2) — it
// only back-fills a missing `id` (a structural necessity for the partsById key, not a
// schema default). `addPart`/`create`/`createMany` are the direct single-part APIs
// games call at runtime with no upstream defaulting pass (spec 04 §5.7's
// `ctx.engine.parts.create` row: "defaults applied"), so THEY apply the full §3.1
// Part-schema defaults themselves — this is also how 03 §7 criterion 2 is provable
// today, since no place.js exists yet to feed `load()`.

// ---- tuning constants this section consumes (spec 03 §6) --------------------------
const DYN_GRAVITY = 196.2; // GRAVITY
const DYN_TERMINAL = 250; // TERMINAL
const DYN_DAMP = 5; // DYN_DAMP, 1/s horizontal damping
const PART_DESPAWN_Y = -500; // PART_DESPAWN_Y

// ---- the 12 standard behavior type names (ARCHITECTURE §6) — used here only to
// validate/reject unknown or duplicate behavior types at load/create time (spec 03
// §3.2: "Unknown `type` -> parts.load throws"); the *handlers* are M1-T12's section.
const KNOWN_BEHAVIOR_TYPES = new Set([
  "kill", "checkpoint", "bounce", "speed", "conveyor", "spinner",
  "movingPlatform", "button", "door", "collectible", "teleport", "touchEvent",
]);

// ---- module state -------------------------------------------------------------------
let sceneRef = null;
let physicsRef = null;
let audioRef = null; // stored for the M1-T12 behavior section (same module scope);
let eventsRef = null; // unused by this section except the §5.8 partRemoved event.

let nextRuntimeSeq = 1; // id counter for addPart/create/createMany and load() fallback
const partsById = new Map(); // id -> internal record, see buildIndividualPart/buildInstancedBatch
const dynamicIds = new Set(); // ids of currently-unanchored (dynamics-stepped) parts
const addedObjects = new Set(); // every THREE.Object3D this module added to sceneRef
const instancedMeshes = []; // every InstancedMesh built by the current load()

// Same-module mirror of collider motion, keyed by colliderId. physics.js's exported
// API (spec 03 §4.1) only offers `setColliderMotion` (write-only) — no getter — but
// dynamics conveyor carry (§5.8 step 3b) needs to read a support collider's
// `surfaceVel`. Any code in this file that calls `physicsRef.setColliderMotion(...)`
// (the M1-T12 behavior section: conveyors, movers) must also call
// `setMotionMirror(id, motion)` below so this stays in sync; the character
// controller's own conveyor push (§5.6 step 10) lives in physics.js and reads its
// collider records directly, so it needs no mirror.
const colliderMotionMirror = new Map();
function setMotionMirror(colliderId, motion) {
  if (motion) colliderMotionMirror.set(colliderId, motion);
  else colliderMotionMirror.delete(colliderId);
}

// ---- id + behavior-schema helpers --------------------------------------------------

function generateRuntimeId() {
  let id;
  do {
    id = `rt${nextRuntimeSeq++}`;
  } while (partsById.has(id));
  return id;
}

function validateBehaviors(def) {
  const seen = new Set();
  for (const b of def.behaviors) {
    if (!KNOWN_BEHAVIOR_TYPES.has(b.type)) {
      throw new Error(`unknown behavior type '${b.type}' on part ${def.id}`);
    }
    if (seen.has(b.type)) {
      throw new Error(`duplicate behavior type '${b.type}' on part ${def.id}`);
    }
    seen.add(b.type);
  }
}

// Full §3.1 Part-schema defaulting — used by addPart/create/createMany ONLY (see the
// section banner above for why `load()` does not call this).
function normalizeRuntimePart(def) {
  const src = def || {};
  return {
    id: src.id != null ? String(src.id) : generateRuntimeId(),
    shape: src.shape || "box",
    size: (src.size || [4, 1, 2]).slice(),
    position: (src.position || [0, 0, 0]).slice(),
    rotation: (src.rotation || [0, 0, 0]).slice(),
    color: src.color || "#a3a2a5",
    material: src.material || "plastic",
    transparency: src.transparency != null ? src.transparency : 0,
    anchored: src.anchored != null ? src.anchored : true,
    canCollide: src.canCollide != null ? src.canCollide : true,
    behaviors: (src.behaviors || []).map((b) => ({ ...b })),
  };
}

// ---- geometry/material -> mesh transform helpers -----------------------------------

function quatFromEulerDeg(rotDeg) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(rotDeg[0]),
    THREE.MathUtils.degToRad(rotDeg[1]),
    THREE.MathUtils.degToRad(rotDeg[2]),
    "XYZ"
  ));
}

function buildMesh(def) {
  const mesh = new THREE.Mesh(getGeometry(def.shape), getMaterial(def.material, def.color, def.transparency));
  mesh.position.set(def.position[0], def.position[1], def.position[2]);
  mesh.quaternion.copy(quatFromEulerDeg(def.rotation));
  mesh.scale.set(def.size[0], def.size[1], def.size[2]);
  // transparency >= 1 -> invisible (spec 03 §5.1; "handled at the mesh-build layer").
  mesh.visible = def.transparency < 1;
  return mesh;
}

// ---- collider registration (spec 03 §5.4 "when to register" rule) -----------------
// Kind selection itself (aabb/obb/sphere/cylinder/wedge) is physics.js's
// `colliderDescFromShape` (M1-T09); this only decides IF a collider is registered and
// whether it is a sensor, per part canCollide/behaviors.

function registerColliderForDef(def) {
  const hasBehaviors = def.behaviors && def.behaviors.length > 0;
  if (!def.canCollide && !hasBehaviors) return null; // no collider at all
  const isSensor = !def.canCollide; // canCollide:false + behaviors -> sensor
  // spec 03 §5.7 spinner note: "build spinner colliders as OBB from the start" — the
  // only behavior-specific nuance that belongs at REGISTRATION time (this section);
  // the spinner's own runtime rotation/motion wiring is M1-T12's.
  const hasSpinner = hasBehaviors && def.behaviors.some((b) => b.type === "spinner");
  const desc = physicsRef.colliderDescFromShape(def.shape, def.size, def.position, def.rotation, { forceObb: hasSpinner });
  return physicsRef.registerCollider({ ...desc, partId: def.id, isSensor });
}

function syncColliderForRecord(record) {
  const def = record.def;
  const hasBehaviors = def.behaviors && def.behaviors.length > 0;
  const wantCollider = !!def.canCollide || hasBehaviors;
  const wantSensor = !def.canCollide;
  if (!wantCollider) {
    if (record.colliderId != null) {
      physicsRef.removeCollider(record.colliderId);
      record.colliderId = null;
      record.colliderIsSensor = null;
    }
    return;
  }
  if (record.colliderId == null) {
    record.colliderId = registerColliderForDef(def);
    record.colliderIsSensor = wantSensor;
    return;
  }
  if (record.colliderIsSensor !== wantSensor) {
    // physics.js exposes no isSensor setter (registry API, spec 03 §4.1) — re-create.
    physicsRef.removeCollider(record.colliderId);
    record.colliderId = registerColliderForDef(def);
    record.colliderIsSensor = wantSensor;
  }
}

// ---- dynamics state (unanchored parts, spec 03 §5.8) -------------------------------

function isAnchoredPartId(partId) {
  const r = partsById.get(partId);
  return !!r && !!r.def && r.def.anchored === true;
}

// Support-probe raycast filter: "static (anchored) non-sensor colliders only" (§5.8
// step 3). Colliders with no owning part (partId null — registered directly by a game
// via ctx.engine.physics) are treated as static too: nothing in this file ever gives
// such a collider motion, so it is static by construction.
function dynamicsSupportFilter(c) {
  return !c.isSensor && (c.partId == null || isAnchoredPartId(c.partId));
}

// Rotated world half-extent along +Y, for the dynamics support-probe origin
// (part bottom-center) and landing snap. Same |R|*half formula physics.js uses
// internally for collider world-AABBs (not importable — physics.js exports no such
// helper — so reimplemented locally; rotation is frozen for dynamics per §5.8's
// explicit "no rotation dynamics" limitation, so this is computed once at spawn).
function worldHalfExtentY(quat, half) {
  const x = quat.x, y = quat.y, z = quat.z, w = quat.w;
  const r10 = 2 * (x * y + z * w), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - x * w);
  return Math.abs(r10) * half[0] + Math.abs(r11) * half[1] + Math.abs(r12) * half[2];
}

function makeDynState(def) {
  const half = [def.size[0] / 2, def.size[1] / 2, def.size[2] / 2];
  const halfY = worldHalfExtentY(quatFromEulerDeg(def.rotation), half);
  return {
    vel: [0, 0, 0],
    prevPos: def.position.slice(),
    curPos: def.position.slice(),
    halfY,
    carriedLastTick: false,
  };
}

function despawnDynamicPart(id) {
  removePartInternal(id);
  eventsRef?.emit?.("partRemoved", { partId: id });
}

// spec 03 §5.8, steps 1-5, run once per sim tick for every unanchored part. Exported
// (beyond spec 03 §4.2's summary table) because physics.js's `step(dt)` — the single
// binding tick order of spec 03 §5.5 — calls this as its own phase 2, separately from
// and after `update(dt)`'s phase 1 (see physics.js's `step`, which calls
// `parts.update(dt)` then `parts.stepDynamics(dt)`); `update(dt)` below must NOT also
// call this or dynamics would run twice per tick.
export function stepDynamics(dt) {
  if (dynamicIds.size === 0) return;
  const toDespawn = [];
  for (const id of dynamicIds) {
    const record = partsById.get(id);
    if (!record) continue;
    const dyn = record.dyn;
    const pos = dyn.curPos;
    dyn.prevPos[0] = pos[0]; dyn.prevPos[1] = pos[1]; dyn.prevPos[2] = pos[2];

    // 1. gravity; horizontal damping, except while conveyor-carried. The carry state
    // step 3b determines isn't known until later THIS tick (same same-tick ordering
    // physics.step itself has for movers vs. character carry, §5.5) — read here as of
    // the END of the PREVIOUS tick's probe, a one-tick lag with no acceptance-criteria
    // dependence (no criterion combines a moving dynamics part with a conveyor).
    dyn.vel[1] = Math.max(dyn.vel[1] - DYN_GRAVITY * dt, -DYN_TERMINAL);
    if (!dyn.carriedLastTick) {
      const damp = Math.max(0, 1 - DYN_DAMP * dt);
      dyn.vel[0] *= damp;
      dyn.vel[2] *= damp;
    }

    // 2. integrate.
    pos[0] += dyn.vel[0] * dt;
    pos[1] += dyn.vel[1] * dt;
    pos[2] += dyn.vel[2] * dt;

    // 3. support probe. Origin Y is measured from `prevPos` (this tick's STARTING
    // bottom), not the just-integrated `pos`: at rest, gravity alone sinks a resting
    // part's bottom by GRAVITY*dt*dt (~0.055 u at 60 Hz) every tick, which exceeds the
    // spec's 0.01 origin epsilon — an origin built from the post-integration `pos`
    // then starts each probe already inside the support collider, and a ray whose
    // origin starts inside an AABB returns a same-tick t=0 "hit" AT THE ORIGIN itself
    // (correct ray semantics, per physics.js's slab method), not the true surface —
    // so the snap (`hit.point + halfY`) reconstructs the already-sunk position instead
    // of correcting it, and the part drifts downward tick over tick until it tunnels
    // through entirely. Casting from the tick-start bottom (always at/above the last
    // known-good surface) keeps the ray's origin outside the collider, so a hit's
    // `point` is the real surface every time; `maxDist` (this tick's actual vertical
    // travel + 0.1) is unchanged and still spans the full sweep. Discovered and fixed
    // via direct testing against 03 §7 criterion 28 (see the task's `verification`
    // notes) — not a spec ambiguity, a numerical-stability fix to make the literal
    // formula's rest case actually converge instead of drift.
    const maxDist = Math.abs(dyn.vel[1] * dt) + 0.1;
    const origin = [pos[0], dyn.prevPos[1] - dyn.halfY + 0.01, pos[2]];
    const hit = physicsRef.raycast(origin, [0, -1, 0], maxDist, dynamicsSupportFilter);
    let carriedNow = false;
    if (hit) {
      pos[1] = hit.point[1] + dyn.halfY;
      dyn.vel[1] = 0;
      // 3b. conveyor carry — positional only, never enters vel (§5.8).
      const motion = colliderMotionMirror.get(hit.colliderId);
      const sv = motion && motion.surfaceVel;
      if (sv && (sv[0] !== 0 || sv[1] !== 0 || sv[2] !== 0)) {
        pos[0] += sv[0] * dt;
        pos[2] += sv[2] * dt;
        carriedNow = true;
      }
    }
    dyn.carriedLastTick = carriedNow;

    // 4. update mesh + collider (live, so the avatar/other statics can rest on it).
    // `def.position` is this module's live transform of record — setPosition() keeps it
    // in step with mesh + collider — so dynamics must keep it current too, or
    // getPart(id).def.position reports a fallen part's SPAWN height forever.
    record.def.position[0] = pos[0];
    record.def.position[1] = pos[1];
    record.def.position[2] = pos[2];
    record.mesh.position.set(pos[0], pos[1], pos[2]);
    if (record.colliderId != null) {
      physicsRef.updateCollider(record.colliderId, { position: pos, rotationDeg: record.def.rotation });
    }

    // 5. despawn plane.
    if (pos[1] < PART_DESPAWN_Y) toDespawn.push(id);
  }
  for (const id of toDespawn) despawnDynamicPart(id);
}

// ---- part construction (shared by load()'s individual path and addPart/createMany) -

function buildIndividualPart(def) {
  const mesh = buildMesh(def);
  sceneRef?.add(mesh);
  addedObjects.add(mesh);
  const colliderId = registerColliderForDef(def);
  const record = {
    def, mesh, colliderId, instanced: false,
    colliderIsSensor: colliderId != null ? !def.canCollide : null,
    ownMaterial: false, // true once setEmissiveIntensity has cloned mesh.material
    dyn: null, custom: false,
  };
  partsById.set(def.id, record);
  if (def.anchored === false) {
    record.dyn = makeDynState(def);
    dynamicIds.add(def.id);
  }
  return record;
}

function buildInstancedBatch(defs) {
  const sample = defs[0];
  const mesh = new THREE.InstancedMesh(
    getGeometry(sample.shape),
    getMaterial(sample.material, sample.color, sample.transparency),
    defs.length
  );
  const m4 = new THREE.Matrix4();
  const posV = new THREE.Vector3();
  const scaleV = new THREE.Vector3();
  defs.forEach((def, i) => {
    posV.set(def.position[0], def.position[1], def.position[2]);
    scaleV.set(def.size[0], def.size[1], def.size[2]);
    m4.compose(posV, quatFromEulerDeg(def.rotation), scaleV);
    mesh.setMatrixAt(i, m4);
  });
  mesh.instanceMatrix.needsUpdate = true;
  // Every part in a batch shares bucket(transparency) by construction (it's part of
  // the batch key), so a single visibility flag is correct for the whole InstancedMesh.
  mesh.visible = bucket(sample.transparency) < 1;
  sceneRef?.add(mesh);
  addedObjects.add(mesh);
  instancedMeshes.push(mesh);

  for (const def of defs) {
    const colliderId = registerColliderForDef(def);
    partsById.set(def.id, {
      def, mesh: null, colliderId, instanced: true,
      colliderIsSensor: colliderId != null ? !def.canCollide : null,
      ownMaterial: false, dyn: null, custom: false,
    });
  }
}

function removePartInternal(id) {
  const record = partsById.get(id);
  if (!record) return;
  if (record.mesh) {
    sceneRef?.remove(record.mesh);
    addedObjects.delete(record.mesh);
  }
  if (record.colliderId != null) physicsRef.removeCollider(record.colliderId);
  dynamicIds.delete(id);
  partsById.delete(id);
}

// ---- public API (spec 03 §4.2) ------------------------------------------------------

export function init(deps) {
  sceneRef = deps.scene;
  physicsRef = deps.physics;
  audioRef = deps.audio;
  eventsRef = deps.events;
}

export function load(partDefs) {
  clear();
  const list = partDefs || [];

  // Single validation/id pass before building anything (mirrors createMany's
  // contract, and matches "Unknown type -> parts.load throws", spec 03 §3.2).
  const prepared = list.map((def) => {
    const withId = def.id != null ? def : { ...def, id: generateRuntimeId() };
    validateBehaviors(withId);
    return withId;
  });

  const batches = new Map();
  const individuals = [];
  for (const def of prepared) {
    const instanceable = def.anchored === true && (!def.behaviors || def.behaviors.length === 0);
    if (instanceable) {
      const key = `${def.shape}|${def.material}|${def.color}|${bucket(def.transparency)}`;
      let list2 = batches.get(key);
      if (!list2) { list2 = []; batches.set(key, list2); }
      list2.push(def);
    } else {
      individuals.push(def);
    }
  }

  for (const defs of batches.values()) {
    if (defs.length >= PERF.instancingThreshold) {
      buildInstancedBatch(defs);
    } else {
      individuals.push(...defs); // batch-of-1 -> plain individual mesh (spec 03 §5.3)
    }
  }

  for (const def of individuals) buildIndividualPart(def);
}

export function clear() {
  for (const obj of addedObjects) sceneRef?.remove(obj);
  addedObjects.clear();
  for (const record of partsById.values()) {
    if (record.colliderId != null) physicsRef.removeCollider(record.colliderId);
  }
  partsById.clear();
  dynamicIds.clear();
  instancedMeshes.length = 0;
  colliderMotionMirror.clear();
  nextRuntimeSeq = 1;
  // M1-T12's behavior section owns its own state (channel subscriptions, per-part
  // behavior timers) and tears it down here too — spec 03 §7 criterion 30 ("no
  // button:* subscription survives a previous load").
  clearBehaviorState();
}

export function addPart(def) {
  const full = normalizeRuntimePart(def);
  validateBehaviors(full);
  buildIndividualPart(full); // addPart never joins a batch (spec 03 §5.3 point 4)
  return full.id;
}

export function create(def) {
  return addPart(def); // alias, ctx.engine.parts.create (spec 04 §5.7)
}

export function createMany(defs) {
  const fulls = defs.map((d) => {
    const full = normalizeRuntimePart(d);
    validateBehaviors(full); // single validation pass before any part is built
    return full;
  });
  return fulls.map((full) => {
    buildIndividualPart(full);
    return full.id;
  });
}

export function addCustom(object3D) {
  const id = generateRuntimeId();
  sceneRef?.add(object3D);
  addedObjects.add(object3D);
  partsById.set(id, { def: null, mesh: object3D, colliderId: null, instanced: false, ownMaterial: false, dyn: null, custom: true });
  return id;
}

export function removePart(id) {
  const record = partsById.get(id);
  if (!record) return;
  if (record.instanced) throw new Error(`part ${id} is instanced; instanced parts are immutable`);
  removePartInternal(id);
}

export function remove(id) {
  return removePart(id);
}

function requireMutablePart(id) {
  const record = partsById.get(id);
  if (!record) throw new Error(`part ${id} not found`);
  if (record.instanced) throw new Error(`part ${id} is instanced; instanced parts are immutable`);
  return record;
}

export function setEmissiveIntensity(id, mult) {
  const record = requireMutablePart(id);
  const mat = record.def.material;
  if (mat !== "neon" && mat !== "lava") {
    throw new Error(`setEmissiveIntensity: part ${id} material '${mat}' has no emissive channel`);
  }
  if (!record.ownMaterial) {
    record.mesh.material = record.mesh.material.clone(); // never mutate the shared cache
    record.ownMaterial = true;
  }
  const base = mat === "neon" ? 1.0 : 0.85; // spec 03 §5.1 recipe table
  record.mesh.material.emissiveIntensity = base * mult;
}

export function getPart(id) {
  return partsById.get(id) || null;
}

export function setColor(id, hex) {
  const record = requireMutablePart(id);
  record.def.color = hex;
  // A fresh cache lookup, never a mutation of the old entry (criterion 7).
  record.mesh.material = getMaterial(record.def.material, hex, record.def.transparency);
  record.ownMaterial = false;
}

export function setTransparency(id, t) {
  const record = requireMutablePart(id);
  record.def.transparency = t;
  record.mesh.material = getMaterial(record.def.material, record.def.color, t);
  record.mesh.visible = t < 1;
  record.ownMaterial = false;
}

export function setPosition(id, pos) {
  const record = requireMutablePart(id);
  record.def.position = pos.slice();
  record.mesh.position.set(pos[0], pos[1], pos[2]);
  if (record.dyn) {
    record.dyn.curPos = pos.slice();
    record.dyn.prevPos = pos.slice();
  }
  if (record.colliderId != null) {
    physicsRef.updateCollider(record.colliderId, { position: record.def.position, rotationDeg: record.def.rotation });
  }
}

export function setRotation(id, rotDeg) {
  const record = requireMutablePart(id);
  record.def.rotation = rotDeg.slice();
  record.mesh.quaternion.copy(quatFromEulerDeg(rotDeg));
  if (record.colliderId != null) {
    physicsRef.updateCollider(record.colliderId, { position: record.def.position, rotationDeg: record.def.rotation });
  }
}

export function setCanCollide(id, bool) {
  const record = requireMutablePart(id);
  record.def.canCollide = bool;
  syncColliderForRecord(record);
}

export function applyInterpolation(alpha) {
  for (const id of dynamicIds) {
    const record = partsById.get(id);
    if (!record || !record.mesh) continue;
    const { prevPos, curPos } = record.dyn;
    record.mesh.position.set(
      prevPos[0] + (curPos[0] - prevPos[0]) * alpha,
      prevPos[1] + (curPos[1] - prevPos[1]) * alpha,
      prevPos[2] + (curPos[2] - prevPos[2]) * alpha
    );
  }
  // M1-T12: movers (spinner slerp, movingPlatform lerp), spec 03 §5.9.
  for (const [partId, list] of behaviorStateByPartId) {
    const record = partsById.get(partId);
    if (!record || !record.mesh) continue;
    for (const entry of list) {
      if (entry.type === "movingPlatform") {
        const { prevPos, curPos } = entry.state;
        record.mesh.position.set(
          prevPos[0] + (curPos[0] - prevPos[0]) * alpha,
          prevPos[1] + (curPos[1] - prevPos[1]) * alpha,
          prevPos[2] + (curPos[2] - prevPos[2]) * alpha
        );
      } else if (entry.type === "spinner") {
        record.mesh.quaternion.copy(entry.state.prevQuat).slerp(entry.state.curQuat, alpha);
      }
    }
  }
}

export function update(dt) {
  // Spec 03 §5.5 step 1 (movers advance, conveyor texture scroll, behavior timers) —
  // M1-T12's behavior section (below materials/geometry in this file). physics.js's
  // `step(dt)` calls this and `stepDynamics(dt)` (phase 2, section above) as two
  // separate calls, in that order, every tick.
  runBehaviorTick(dt);
}

// Delegate for physics.js's `setPartVelocity` (spec 03 §4.1) — the actual dynamics
// vel state lives here (§5.8), so physics.js's export forwards into this one.
// Unknown or anchored partId -> console.warn, no-op (spec 03 §5.8).
export function setPartVelocity(partId, v) {
  const record = partsById.get(partId);
  if (!record || !record.dyn) {
    console.warn("parts.setPartVelocity: unknown or anchored part", partId);
    return;
  }
  record.dyn.vel[0] = v[0];
  record.dyn.vel[1] = v[1];
  record.dyn.vel[2] = v[2];
}

export function getStats() {
  let partCount = 0, individualMeshes = 0, colliderCount = 0;
  for (const record of partsById.values()) {
    if (!record.custom) partCount++;
    if (!record.instanced) individualMeshes++;
    if (record.colliderId != null) colliderCount++;
  }
  return { partCount, individualMeshes, instancedBatches: instancedMeshes.length, colliderCount };
}

// ===== END SECTION: init / load / instancing / addPart / setters / dynamics /
// interpolation (M1-T11) ==============================================================

// ===== SECTION: standard behaviors (kill, checkpoint, bounce, speed,
// conveyor, spinner, movingPlatform, button, door, collectible, teleport,
// touchEvent) — owned by M1-T12, spec 03 §5.7. Canonical params/defaults are
// spec 04 §3.2 (the place.json owner); event names/payloads are spec 04 §5.2,
// matched character-for-character below since the platform services bind to
// those exact strings. All positions in payloads are [x,y,z] arrays.
//
// This section is additive to three hooks that physically live in the section
// above (each already carries an "M1-T12 extends this" comment there, left by
// M1-T11): `update(dt)` now calls `runBehaviorTick`, `applyInterpolation`
// gained a mover loop, and `clear()` gained behavior-state teardown. It also
// CALLS (never edits) that section's `registerColliderForDef`-adjacent helpers
// (`quatFromEulerDeg`, `worldHalfExtentY`, `setMotionMirror`) and module state
// (`partsById`) already in scope — same file, same module, no import needed.
//
// Touch routing (spec 03 §5.7): physics hands `(entered, stayed, exited)`
// collider ids to the contact handler registered below; this file maps
// id -> part -> behaviors and calls the per-behavior handlers. "on enter" =
// the collider id is in `entered` (edge-triggered).

// ---- spec 04 §3.2 canonical defaults ------------------------------------------------
// Behaviors reach this file already fully defaulted when loaded through
// place.js (spec 03 §5.7: "params (spec-04 defaults applied by place.js)"),
// but place.js doesn't exist yet (M1-T14) and `addPart`/`createMany` apply
// only the §3.1 Part-schema defaults, never per-behavior-type param defaults
// (see that section's `normalizeRuntimePart`) — so every param is defaulted
// HERE too. Applying them twice (once here, once later by place.js) is a
// no-op once place.js lands.
const BEHAVIOR_DEFAULTS = {
  kill: {},
  checkpoint: {}, // order: required, no default
  bounce: { power: 50 },
  speed: { walkSpeed: 30, duration: 5 },
  conveyor: { direction: [1, 0, 0], speed: 8 },
  spinner: { axis: "y", speed: 90 },
  movingPlatform: { speed: 6, pauseS: 1, mode: "pingpong" }, // waypoints: required
  button: { once: false, cooldownS: 1 }, // channel: required
  door: { mode: "open", openS: 4 }, // channel: required
  collectible: { kind: "oofbux", value: 1, respawnS: 30 }, // event: required iff kind:"event"
  teleport: { cooldownS: 1 }, // target: required
  touchEvent: { once: false, cooldownS: 0.25 }, // event: required
};

function behaviorParams(b) {
  const merged = { ...(BEHAVIOR_DEFAULTS[b.type] || {}), ...b };
  // Defensive per-instance copies so two parts sharing a default array (e.g.
  // conveyor's default `direction`) can never alias one another's state.
  if (merged.direction) merged.direction = merged.direction.slice();
  if (merged.waypoints) merged.waypoints = merged.waypoints.map((p) => p.slice());
  return merged;
}

// ---- module state (reset in `clear()`, extended below) -----------------------------
const behaviorStateByPartId = new Map(); // partId -> [{ type, params, state }, ...]
const colliderIdToPartId = new Map();    // rebuilt every tick, before dispatchContacts runs
const doorUnsubByPartId = new Map();     // partId -> unsub() for its button:pressed subscription
let checkpointHighestOrder = -1;         // per-Place shared gate (spec 03 §5.7 "state.highestOrder")
let simTimeElapsed = 0;                  // sim seconds since this file's current load() (ARCHITECTURE
                                          // §7 "ctx.time" semantics) — the only clock touch:<event>'s
                                          // `time` field needs; sim-tick-driven only, never wall clock.
let contactHandlerArmed = false;         // physicsRef.setContactHandler registered exactly once

function playSfx(name) {
  if (audioRef && typeof audioRef.playSfx === "function") audioRef.playSfx(name);
}
function emit(name, payload) {
  if (eventsRef && typeof eventsRef.emit === "function") eventsRef.emit(name, payload);
}

// ---- small shared helpers ------------------------------------------------------------

// Feet position on top of a part (spec 03 §5.7 checkpoint/teleport: "topCenter =
// [pos.x, partWorldAABB.maxY, pos.z]"). Reuses `worldHalfExtentY`/`quatFromEulerDeg`
// from the load/instancing section above (same module scope).
function topCenterOf(record) {
  const def = record.def;
  const half = [def.size[0] / 2, def.size[1] / 2, def.size[2] / 2];
  const halfY = worldHalfExtentY(quatFromEulerDeg(def.rotation), half);
  return [def.position[0], def.position[1] + halfY, def.position[2]];
}

// "conveyor, button, checkpoint, door" receive a cloned material at build so the
// shared cache is never mutated (spec 03 §5.7); reuses the `ownMaterial` flag/
// convention already established by `setEmissiveIntensity` in the section above.
function ensureOwnMaterial(record) {
  if (!record.ownMaterial) {
    record.mesh.material = record.mesh.material.clone();
    record.ownMaterial = true;
  }
}

// physics.js exposes no isSensor setter (same constraint `syncColliderForRecord`
// documents above) — recreate the collider at the same transform with the wanted
// sensor flag. Used by door (open/close toggle) and collectible (forced sensor).
function setColliderSensorOverride(record, wantSensor) {
  if (record.colliderId != null && record.colliderIsSensor === wantSensor) return;
  if (record.colliderId != null) physicsRef.removeCollider(record.colliderId);
  const def = record.def;
  const desc = physicsRef.colliderDescFromShape(def.shape, def.size, def.position, def.rotation, {});
  record.colliderId = physicsRef.registerCollider({ ...desc, partId: def.id, isSensor: wantSensor });
  record.colliderIsSensor = wantSensor;
}

function advanceWaypointTarget(state, mode, n) {
  if (mode === "cycle") {
    state.targetIndex = (state.targetIndex + 1) % n;
    return;
  }
  if (state.direction === 1) {
    if (state.targetIndex >= n - 1) { state.direction = -1; state.targetIndex = n >= 2 ? n - 2 : 0; }
    else state.targetIndex += 1;
  } else {
    if (state.targetIndex <= 0) { state.direction = 1; state.targetIndex = n >= 2 ? 1 : 0; }
    else state.targetIndex -= 1;
  }
}

function normalizeDirectionXZ(direction) {
  const x = direction[0], z = direction[2];
  const len = Math.hypot(x, z);
  if (len < 1e-9) return [1, 0, 0]; // degenerate (purely vertical) input — safe fallback
  return [x / len, 0, z / len];
}

function axisAngleQuatDeg(axisName, deg) {
  const axis = axisName === "x" ? AXIS_X : axisName === "z" ? AXIS_Z : AXIS_Y;
  return new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(deg));
}
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function eulerDegFromQuat(q) {
  const e = new THREE.Euler().setFromQuaternion(q, "XYZ");
  return [THREE.MathUtils.radToDeg(e.x), THREE.MathUtils.radToDeg(e.y), THREE.MathUtils.radToDeg(e.z)];
}

function applyMaterialOpacityForTransparency(material, t) {
  material.transparent = t > 0;
  material.opacity = 1 - t;
}

// ---- conveyor stripe texture (spec 03 §5.7 conveyor "Visual") ----------------------
// SPEC GAP (non-blocking, cosmetic only — no acceptance criterion reads pixels, same
// class of gap as the wedge UV-axis tie documented in the M1-T08 section below): the
// spec ties bar orientation to "the travel axis" but a box's default per-face UV
// layout isn't specified precisely enough to derive which UV axis that is for every
// face. Bars are drawn perpendicular to the U axis and scrolled along whichever UV
// axis (`offset.x` for a dominant-X travel direction, `offset.y` for dominant-Z)
// matches the conveyor's world direction — deterministic and visually indicates
// direction, but not bound to a literal per-face UV derivation.
const CONVEYOR_BAR_COUNT = 8;
const CONVEYOR_BAR_WIDTH = 6; // px
const CONVEYOR_DARKEN = 0.85;

function buildStripeTexture(baseCanvas) {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx2d = canvas.getContext("2d");
  ctx2d.drawImage(baseCanvas, 0, 0, TEX_SIZE, TEX_SIZE);
  const img = ctx2d.getImageData(0, 0, TEX_SIZE, TEX_SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] *= CONVEYOR_DARKEN; d[i + 1] *= CONVEYOR_DARKEN; d[i + 2] *= CONVEYOR_DARKEN;
  }
  const spacing = TEX_SIZE / CONVEYOR_BAR_COUNT;
  for (let b = 0; b < CONVEYOR_BAR_COUNT; b++) {
    const start = Math.round(b * spacing);
    for (let off = 0; off < CONVEYOR_BAR_WIDTH; off++) {
      const u = (start + off) % TEX_SIZE;
      for (let v = 0; v < TEX_SIZE; v++) {
        const idx = (v * TEX_SIZE + u) * 4;
        d[idx] = 255; d[idx + 1] = 255; d[idx + 2] = 255;
      }
    }
  }
  ctx2d.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- per-behavior-type first-sight setup --------------------------------------------
// "At load, each behavior instance gets { part, params, state }" (spec 03 §5.7). Parts
// only ever gain behaviors as individual (never instanced) meshes, so `record.mesh`
// always exists here.

function initBehaviorRuntime(record, type, params) {
  switch (type) {
    case "checkpoint":
      ensureOwnMaterial(record);
      return { pulseT: -1 };

    case "bounce":
      return { cooldown: 0, squashT: -1 };

    case "conveyor": {
      ensureOwnMaterial(record);
      const dir = normalizeDirectionXZ(params.direction);
      const motion = { surfaceVel: [dir[0] * params.speed, 0, dir[2] * params.speed], linearVel: [0, 0, 0], angularVel: 0 };
      if (record.colliderId != null) {
        physicsRef.setColliderMotion(record.colliderId, motion);
        setMotionMirror(record.colliderId, motion);
      }
      const st = { tex: null, rate: 0 };
      const mat = record.mesh.material;
      if (mat.map && mat.map.image) {
        const axisIsX = Math.abs(dir[0]) >= Math.abs(dir[2]);
        const tex = buildStripeTexture(mat.map.image);
        mat.map = tex;
        const sizeAlongAxis = axisIsX ? record.def.size[0] : record.def.size[2];
        st.tex = tex;
        st.axisIsX = axisIsX;
        st.rate = sizeAlongAxis > 1e-6 ? params.speed / sizeAlongAxis : 0;
      }
      return st;
    }

    case "spinner": {
      // Colliders for spinner parts are already forced OBB at registration (the
      // section above, `registerColliderForDef`'s `hasSpinner` check) — nothing to
      // redo here. `angularVel/axis/pivot` are constant for the part's lifetime, so
      // the motion record is set once, not every tick.
      const motion = { angularVel: params.speed, axis: params.axis, pivot: record.def.position.slice(), linearVel: [0, 0, 0], surfaceVel: [0, 0, 0] };
      if (record.colliderId != null) {
        physicsRef.setColliderMotion(record.colliderId, motion);
        setMotionMirror(record.colliderId, motion);
      }
      const baseQuat = quatFromEulerDeg(record.def.rotation);
      return { angle: 0, prevQuat: baseQuat.clone(), curQuat: baseQuat.clone() };
    }

    case "movingPlatform":
      return {
        curPos: record.def.position.slice(),
        prevPos: record.def.position.slice(),
        targetIndex: params.waypoints.length >= 2 ? 1 : 0,
        direction: 1,
        pauseTimer: 0,
      };

    case "button":
      ensureOwnMaterial(record);
      return { fired: false, cooldown: 0, sinkT: -1, tinted: false };

    case "door": {
      ensureOwnMaterial(record);
      const state = { open: false, autoCloseTimer: 0, curT: record.def.transparency, tweenActive: false, tweenElapsed: 0, tweenFrom: 0, tweenTo: 0 };
      if (eventsRef && typeof eventsRef.on === "function") {
        const unsub = eventsRef.on("button:pressed", (payload) => {
          if (payload && payload.channel === params.channel) handleDoorButtonPress(record, params, state);
        });
        doorUnsubByPartId.set(record.def.id, unsub);
      }
      return state;
    }

    case "collectible":
      // "Collider is always a sensor (even if canCollide true — collectibles never
      // block)" (spec 03 §5.7) — forced here regardless of the authored value, without
      // mutating `def.canCollide` (so `getPart(id).def` still reports what was authored).
      setColliderSensorOverride(record, true);
      return { active: true, popT: -1, respawnTimer: 0, baseY: record.def.position[1], phase: 0 };

    case "teleport":
      return { cooldown: 0 };

    case "touchEvent":
      return { fired: false, cooldown: 0 };

    default: // kill, speed: no extra state
      return {};
  }
}

function getOrInitBehaviorList(partId, record) {
  let list = behaviorStateByPartId.get(partId);
  if (list) return list;
  list = record.def.behaviors.map((b) => {
    const params = behaviorParams(b);
    return { type: b.type, params, state: initBehaviorRuntime(record, b.type, params) };
  });
  behaviorStateByPartId.set(partId, list);
  return list;
}

// ---- per-tick advancement: movers, tweens, cooldown timers (spec 03 §5.5 step 1) ---

const CHECKPOINT_PULSE_S = 0.5;
const CHECKPOINT_PULSE_COLOR = new THREE.Color("#7ec850");
function tickCheckpointPulse(record, state, dt) {
  if (state.pulseT < 0) return;
  state.pulseT += dt;
  const half = CHECKPOINT_PULSE_S / 2;
  let f;
  if (state.pulseT >= CHECKPOINT_PULSE_S) { f = 0; state.pulseT = -1; }
  else if (state.pulseT <= half) f = state.pulseT / half;
  else f = 1 - (state.pulseT - half) / half;
  record.mesh.material.color.set(record.def.color).lerp(CHECKPOINT_PULSE_COLOR, f);
}

const BOUNCE_SQUASH_S = 0.15;
function tickBounceSquash(record, state, dt) {
  if (state.squashT < 0) return;
  state.squashT += dt;
  const half = BOUNCE_SQUASH_S / 2;
  let f;
  if (state.squashT >= BOUNCE_SQUASH_S) { f = 0; state.squashT = -1; }
  else if (state.squashT <= half) f = state.squashT / half;
  else f = 1 - (state.squashT - half) / half;
  record.mesh.scale.y = record.def.size[1] * (1 - 0.2 * f);
}

function tickConveyorScroll(state, dt) {
  if (!state.tex) return;
  if (state.axisIsX) state.tex.offset.x = (state.tex.offset.x + state.rate * dt) % 1;
  else state.tex.offset.y = (state.tex.offset.y + state.rate * dt) % 1;
}

function tickSpinner(record, params, state, dt) {
  state.prevQuat.copy(state.curQuat);
  state.angle = (state.angle + params.speed * dt) % 360;
  const spinQuat = axisAngleQuatDeg(params.axis, state.angle);
  const baseQuat = quatFromEulerDeg(record.def.rotation);
  const composed = spinQuat.multiply(baseQuat); // spin about the WORLD axis, applied after the part's own orientation
  state.curQuat.copy(composed);
  record.mesh.quaternion.copy(composed);
  if (record.colliderId != null) {
    physicsRef.updateCollider(record.colliderId, { position: record.def.position, rotationDeg: eulerDegFromQuat(composed) });
  }
}

function tickMovingPlatform(record, params, state, dt) {
  const wps = params.waypoints;
  const n = wps.length;
  const before = state.curPos.slice();
  state.prevPos[0] = before[0]; state.prevPos[1] = before[1]; state.prevPos[2] = before[2];
  if (state.pauseTimer > 0) {
    state.pauseTimer = Math.max(0, state.pauseTimer - dt);
  } else {
    let remaining = params.speed * dt;
    let guard = 0;
    while (remaining > 1e-9 && guard <= n + 2) {
      guard++;
      const target = wps[state.targetIndex];
      const dx = target[0] - state.curPos[0], dy = target[1] - state.curPos[1], dz = target[2] - state.curPos[2];
      const segLen = Math.hypot(dx, dy, dz);
      if (segLen < 1e-9) {
        advanceWaypointTarget(state, params.mode, n);
        state.pauseTimer = params.pauseS;
        if (state.pauseTimer > 0) break;
        continue;
      }
      if (remaining < segLen) {
        const f = remaining / segLen;
        state.curPos[0] += dx * f; state.curPos[1] += dy * f; state.curPos[2] += dz * f;
        remaining = 0;
      } else {
        state.curPos[0] = target[0]; state.curPos[1] = target[1]; state.curPos[2] = target[2];
        remaining -= segLen;
        advanceWaypointTarget(state, params.mode, n);
        state.pauseTimer = params.pauseS;
        if (state.pauseTimer > 0) remaining = 0;
      }
    }
  }
  const linearVel = [(state.curPos[0] - before[0]) / dt, (state.curPos[1] - before[1]) / dt, (state.curPos[2] - before[2]) / dt];
  record.mesh.position.set(state.curPos[0], state.curPos[1], state.curPos[2]);
  record.def.position[0] = state.curPos[0]; record.def.position[1] = state.curPos[1]; record.def.position[2] = state.curPos[2];
  if (record.colliderId != null) {
    physicsRef.updateCollider(record.colliderId, { position: state.curPos, rotationDeg: record.def.rotation });
    const motion = { linearVel, angularVel: 0, surfaceVel: [0, 0, 0] };
    physicsRef.setColliderMotion(record.colliderId, motion);
    setMotionMirror(record.colliderId, motion);
  }
}

const BUTTON_SINK_S = 0.15;
const BUTTON_SINK_DIST = 0.3;
function tickButton(record, params, state, dt) {
  if (state.sinkT >= 0) {
    state.sinkT += dt;
    const half = BUTTON_SINK_S / 2;
    let f;
    if (state.sinkT >= BUTTON_SINK_S) { f = 0; state.sinkT = -1; }
    else if (state.sinkT <= half) f = state.sinkT / half;
    else f = 1 - (state.sinkT - half) / half;
    const down = new THREE.Vector3(0, -1, 0).applyQuaternion(quatFromEulerDeg(record.def.rotation));
    record.mesh.position.set(
      record.def.position[0] + down.x * BUTTON_SINK_DIST * f,
      record.def.position[1] + down.y * BUTTON_SINK_DIST * f,
      record.def.position[2] + down.z * BUTTON_SINK_DIST * f
    );
  }
  if (state.cooldown === 0 && state.tinted) {
    record.mesh.material.color.set(record.def.color);
    state.tinted = false;
  }
}

const DOOR_TWEEN_S = 0.3;
function tickDoor(record, params, state, dt) {
  if (state.tweenActive) {
    state.tweenElapsed += dt;
    const f = Math.min(1, state.tweenElapsed / DOOR_TWEEN_S);
    state.curT = state.tweenFrom + (state.tweenTo - state.tweenFrom) * f;
    applyMaterialOpacityForTransparency(record.mesh.material, state.curT);
    if (f >= 1) state.tweenActive = false;
  }
  if (params.mode === "open" && state.open && state.autoCloseTimer > 0) {
    state.autoCloseTimer = Math.max(0, state.autoCloseTimer - dt);
    if (state.autoCloseTimer === 0) closeDoor(record, params, state);
  }
}

function tickCollectible(record, params, state, dt) {
  if (state.popT >= 0) {
    state.popT += dt;
    const f = Math.min(1, state.popT / 0.1);
    const s = 1 + 0.4 * f;
    record.mesh.scale.set(record.def.size[0] * s, record.def.size[1] * s, record.def.size[2] * s);
    if (state.popT >= 0.1) { state.popT = -1; record.mesh.visible = false; }
  }
  if (!state.active) {
    if (params.respawnS > 0 && state.respawnTimer > 0) {
      state.respawnTimer = Math.max(0, state.respawnTimer - dt);
      if (state.respawnTimer === 0) respawnCollectible(record, state);
    }
    return;
  }
  state.phase += dt;
  record.mesh.position.y = state.baseY + 0.5 * Math.sin((2 * Math.PI * state.phase) / 2);
  record.mesh.rotation.y = (record.mesh.rotation.y + THREE.MathUtils.degToRad(120) * dt) % (2 * Math.PI);
}

function respawnCollectible(record, state) {
  state.active = true;
  state.phase = 0;
  record.mesh.visible = true;
  record.mesh.scale.set(record.def.size[0], record.def.size[1], record.def.size[2]);
  record.mesh.position.y = state.baseY;
  setColliderSensorOverride(record, true);
}

function tickBehaviorEntry(record, entry, dt) {
  const { type, params, state } = entry;
  if (typeof state.cooldown === "number" && state.cooldown > 0) {
    state.cooldown = Math.max(0, state.cooldown - dt);
  }
  switch (type) {
    case "checkpoint": tickCheckpointPulse(record, state, dt); break;
    case "bounce": tickBounceSquash(record, state, dt); break;
    case "conveyor": tickConveyorScroll(state, dt); break;
    case "spinner": tickSpinner(record, params, state, dt); break;
    case "movingPlatform": tickMovingPlatform(record, params, state, dt); break;
    case "button": tickButton(record, params, state, dt); break;
    case "door": tickDoor(record, params, state, dt); break;
    case "collectible": tickCollectible(record, params, state, dt); break;
    default: break; // kill, speed, teleport, touchEvent: the generic cooldown decrement above is all they need
  }
}

// ---- door open/close (spec 03 §5.7 door) --------------------------------------------

function startDoorTween(state, target) {
  state.tweenActive = true;
  state.tweenElapsed = 0;
  state.tweenFrom = state.curT;
  state.tweenTo = target;
}

function openDoor(record, params, state) {
  state.open = true;
  setColliderSensorOverride(record, true);
  startDoorTween(state, 0.6);
  emit("door:opened", { channel: params.channel, partId: record.def.id });
  if (params.mode === "open") state.autoCloseTimer = params.openS;
}

function closeDoor(record, params, state) {
  state.open = false;
  setColliderSensorOverride(record, !record.def.canCollide);
  startDoorTween(state, record.def.transparency);
  emit("door:closed", { channel: params.channel, partId: record.def.id });
}

function handleDoorButtonPress(record, params, state) {
  if (params.mode === "open") {
    if (!state.open) openDoor(record, params, state);
    else state.autoCloseTimer = params.openS; // re-press while open: refresh the auto-close window
  } else if (state.open) {
    closeDoor(record, params, state);
  } else {
    openDoor(record, params, state);
  }
}

// ---- touch-edge handlers (spec 03 §5.7 / 04 §3.2) ------------------------------------

function onKillTouch(partId) {
  physicsRef.kill("kill:" + partId); // physics.kill is internally guarded by dying/grace (spec 03 §5.7)
}

function onCheckpointEnter(record, entry) {
  const { params, state } = entry;
  if (!(params.order > checkpointHighestOrder)) return;
  checkpointHighestOrder = params.order;
  physicsRef.setCheckpoint(topCenterOf(record));
  playSfx("chime");
  emit("checkpoint:reached", { order: params.order, partId: record.def.id });
  state.pulseT = 0;
}

// "landing on top": the primary case from spec 03 §5.7 — this tick's ground collider
// is this part. SPEC GAP (see task report): the spec's OR-fallback ("contact
// normal.y >= SLOPE_COS", for a canCollide:false/sensor bounce pad the avatar never
// technically "stands on") needs a per-contact surface normal, which physics.js's
// public contact-handler API (colliderIds only) does not expose to this file — not
// implementable without a physics.js API change (an unowned file), so only the
// grounded-on-this-part case is implemented; acceptance criterion 21 only exercises
// a solid (canCollide:true) bounce pad, so this is not a gap in tested behavior.
function onBounceTouch(partId, record, entry) {
  const { params, state } = entry;
  if (state.cooldown > 0) return;
  if (!(physicsRef.isGrounded() && physicsRef.getStandingOn() === partId)) return;
  const v = physicsRef.getVelocity();
  physicsRef.launch([v[0], params.power, v[2]]);
  state.cooldown = 0.1; // spec 03 §5.7 bounce: literal 0.1 s, not a behavior param
  playSfx("boing");
  emit("bounce:launched", { partId });
  state.squashT = 0;
}

function onSpeedEnter(entry) {
  physicsRef.setSpeedEffect(entry.params.walkSpeed, entry.params.duration);
  playSfx("whoosh");
}

function onButtonEnter(record, entry) {
  const { params, state } = entry;
  if (state.cooldown > 0) return;
  if (params.once && state.fired) return;
  state.fired = true;
  state.cooldown = params.cooldownS;
  playSfx("click");
  emit("button:pressed", { channel: params.channel, partId: record.def.id });
  state.sinkT = 0;
  state.tinted = true;
  record.mesh.material.color.set(record.def.color).multiplyScalar(0.8); // -20% brightness
}

function onCollectibleEnter(record, entry) {
  const { params, state } = entry;
  if (!state.active) return;
  playSfx("sparkle");
  state.active = false;
  state.popT = 0;
  if (record.colliderId != null) {
    physicsRef.removeCollider(record.colliderId); // "disable the sensor"
    record.colliderId = null;
    record.colliderIsSensor = null;
  }
  emit("collectible:collected", { kind: params.kind, value: params.value, partId: record.def.id });
  if (params.kind === "event" && params.event) {
    emit("touch:" + params.event, { partId: record.def.id, position: record.def.position.slice(), time: simTimeElapsed });
  }
  state.respawnTimer = params.respawnS > 0 ? params.respawnS : 0;
}

function onTeleportEnter(record, entry) {
  const { params, state } = entry;
  if (state.cooldown > 0) return;
  if (physicsRef.getTeleportCooldown() > 0) return; // global anti-ping-pong (spec 03 §5.7)
  const targetRecord = partsById.get(params.target);
  if (!targetRecord || !targetRecord.def) {
    console.warn("teleport behavior: target part not found", params.target);
    return;
  }
  playSfx("warp");
  physicsRef.teleport(topCenterOf(targetRecord)); // zeroes vel, skips ground-snap, arms the global cooldown
  state.cooldown = params.cooldownS;
  emit("teleport:used", { partId: record.def.id, target: params.target });
}

function onTouchEventEnter(record, entry) {
  const { params, state } = entry;
  if (state.cooldown > 0) return;
  if (params.once && state.fired) return;
  state.fired = true;
  state.cooldown = params.cooldownS;
  emit("touch:" + params.event, { partId: record.def.id, position: record.def.position.slice(), time: simTimeElapsed });
}

function dispatchTouch(partId, isEnter) {
  const record = partsById.get(partId);
  if (!record || !record.def) return;
  const list = behaviorStateByPartId.get(partId);
  if (!list) return;
  for (const entry of list) {
    switch (entry.type) {
      case "kill": onKillTouch(partId); break; // enter or stay
      case "bounce": onBounceTouch(partId, record, entry); break; // enter or stay
      case "checkpoint": if (isEnter) onCheckpointEnter(record, entry); break;
      case "speed": if (isEnter) onSpeedEnter(entry); break;
      case "button": if (isEnter) onButtonEnter(record, entry); break;
      case "collectible": if (isEnter) onCollectibleEnter(record, entry); break;
      case "teleport": if (isEnter) onTeleportEnter(record, entry); break;
      case "touchEvent": if (isEnter) onTouchEventEnter(record, entry); break;
      default: break; // conveyor, spinner, movingPlatform, door: no touch response
    }
  }
}

// physics hands raw collider ids; map to partId via the table `runBehaviorTick`
// rebuilds every tick (below). `exited` is unused: spec 03 §5.7's 12 behaviors are
// all "on enter" or "on enter or stay" — none act on the exit edge.
function handlePhysicsContactEvents(entered, stayed, exited) { // eslint-disable-line no-unused-vars
  for (const colliderId of entered) {
    const partId = colliderIdToPartId.get(colliderId);
    if (partId != null) dispatchTouch(partId, true);
  }
  for (const colliderId of stayed) {
    const partId = colliderIdToPartId.get(colliderId);
    if (partId != null) dispatchTouch(partId, false);
  }
}

// Called by `update(dt)` (section above) every sim tick, before `stepCharacter`/
// `dispatchContacts` run later in the same `physics.step()` call — so the reverse
// index and any newly-created behavior state are ready before touches are dispatched
// this same tick (spec 03 §5.5's binding tick order).
function runBehaviorTick(dt) {
  if (!contactHandlerArmed && physicsRef) {
    physicsRef.setContactHandler(handlePhysicsContactEvents);
    contactHandlerArmed = true;
  }
  simTimeElapsed += dt;
  colliderIdToPartId.clear();
  for (const [partId, record] of partsById) {
    if (!record.def || !record.def.behaviors || record.def.behaviors.length === 0) continue;
    const list = getOrInitBehaviorList(partId, record);
    if (record.colliderId != null) colliderIdToPartId.set(record.colliderId, partId);
    for (const entry of list) tickBehaviorEntry(record, entry, dt);
  }
}

// Torn down from `clear()` (section above): drops all behavior runtime state and
// unsubscribes every door from `button:pressed` so a door from a previous load never
// reacts again (spec 03 §7 criterion 30).
function clearBehaviorState() {
  for (const unsub of doorUnsubByPartId.values()) unsub();
  doorUnsubByPartId.clear();
  behaviorStateByPartId.clear();
  colliderIdToPartId.clear();
  checkpointHighestOrder = -1;
  simTimeElapsed = 0;
}

// ===== END SECTION: standard behaviors (M1-T12) ======================================

// ===== SECTION: materials + geometry — owned by M1-T08 (this task), spec 03
// §5.1 (materials) and §5.2 (geometry cache). =====

// ---- tuning constants (spec 03 §6) ----
const TEX_SIZE = 128; // material canvas size, px
const GLASS_MIN_T = 0.55; // glass forced min transparency

// ---- deterministic PRNG: mulberry32 seeded by FNV-1a(materialName) ----
// Spec 03 §5.1: "use mulberry32 PRNG seeded with hash(materialName) (FNV-1a
// of the name) so every load produces identical pixels." mulberry32 body is
// the exact reference implementation also cited in spec 08 §5.4.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// rr(a,b) = uniform float in [a,b); ri(a,b) = uniform int in [a,b] inclusive.
// Naming matches spec 08 §5.4's own rng helpers (same convention, different
// file — layout.js does not import this).
function rr(rng, a, b) {
  return a + rng() * (b - a);
}
function ri(rng, a, b) {
  return a + Math.floor(rng() * (b - a + 1));
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// ---- value noise: hashed lattice + smoothstep interpolation ----
// SPEC GAP (non-blocking — see task report): spec 03 §5.1 names
// "valueNoise1D" (metal) and "value noise" (lava, n in 0..1, 4 octaves at
// grids 8/16/32/64 with given weights) but never states the lattice
// interpolation curve. No acceptance criterion (03 §7.3-4) reads pixel
// content, only material fields, so this is a documented implementation
// choice, not a blocked design decision: a seeded lattice of PRNG draws,
// smoothstep-faded between neighbors, both 1D (metal row noise) and 2D
// (lava octaves). It is still fully deterministic (same seed -> same
// bytes), which is the binding requirement.
function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function buildLattice1D(rng, points) {
  const g = new Float64Array(points);
  for (let i = 0; i < points; i++) g[i] = rng();
  return g;
}
function sampleValueNoise1D(lattice, coord) {
  const i0 = Math.floor(coord);
  const frac = coord - i0;
  const last = lattice.length - 1;
  const a = lattice[Math.min(Math.max(i0, 0), last)];
  const b = lattice[Math.min(Math.max(i0 + 1, 0), last)];
  return a + (b - a) * smoothstep(frac);
}

function buildLattice2D(rng, cells) {
  const size = cells + 1;
  const g = new Float64Array(size * size);
  for (let i = 0; i < g.length; i++) g[i] = rng();
  return { g, size };
}
function sampleValueNoise2D(lattice, u, v) {
  const { g, size } = lattice;
  const last = size - 1;
  const x0 = Math.min(Math.max(Math.floor(u), 0), last);
  const y0 = Math.min(Math.max(Math.floor(v), 0), last);
  const x1 = Math.min(x0 + 1, last);
  const y1 = Math.min(y0 + 1, last);
  const fx = smoothstep(clamp(u - Math.floor(u), 0, 1));
  const fy = smoothstep(clamp(v - Math.floor(v), 0, 1));
  const c00 = g[y0 * size + x0];
  const c10 = g[y0 * size + x1];
  const c01 = g[y1 * size + x0];
  const c11 = g[y1 * size + x1];
  const top = c00 + (c10 - c00) * fx;
  const bot = c01 + (c11 - c01) * fx;
  return top + (bot - top) * fy;
}

// ---- 8 material recipes: fill a TEX_SIZE*TEX_SIZE luminance (L, 0..255)
// buffer per spec 03 §5.1's table. Glass and neon have no map (handled
// directly in buildMaterial) so only 6 of the 8 names have a recipe here. ----

function buildPlasticL(rng) {
  const L = new Float64Array(TEX_SIZE * TEX_SIZE);
  for (let i = 0; i < L.length; i++) L[i] = 252 + rr(rng, -3, 3);
  return L;
}

function buildMetalL(rng) {
  const L = new Float64Array(TEX_SIZE * TEX_SIZE);
  // Lattice covers coord = y/6 for y in [0, TEX_SIZE-1], i.e. ~0..21.2.
  const lattice = buildLattice1D(rng, Math.ceil((TEX_SIZE - 1) / 6) + 2);
  const SQRT2 = Math.SQRT2;
  for (let y = 0; y < TEX_SIZE; y++) {
    const base = 205 + 20 * sampleValueNoise1D(lattice, y / 6);
    for (let x = 0; x < TEX_SIZE; x++) {
      let v = base + rr(rng, -6, 6);
      const d = Math.abs(x + y - TEX_SIZE) / SQRT2; // distance from line x+y=128
      v += 40 * Math.exp(-((d / 18) ** 2));
      L[y * TEX_SIZE + x] = v;
    }
  }
  return L;
}

function buildGrassL(rng) {
  const L = new Float64Array(TEX_SIZE * TEX_SIZE);
  for (let i = 0; i < L.length; i++) L[i] = 190 + rr(rng, -30, 30);
  for (let s = 0; s < 400; s++) {
    const x0 = ri(rng, 0, TEX_SIZE - 1);
    const y0 = ri(rng, 0, TEX_SIZE - 1);
    const h = ri(rng, 2, 4); // stroke height 2-4 px, width 1 px, drawn downward from (x0,y0)
    for (let dy = 0; dy < h; dy++) {
      const y = y0 + dy;
      if (y >= TEX_SIZE) break;
      L[y * TEX_SIZE + x0] -= 50;
    }
  }
  return L;
}

function buildLavaL(rng) {
  const L = new Float64Array(TEX_SIZE * TEX_SIZE);
  const octaves = [
    { cells: 8, weight: 0.5 },
    { cells: 16, weight: 0.25 },
    { cells: 32, weight: 0.15 },
    { cells: 64, weight: 0.1 },
  ];
  const n = new Float64Array(TEX_SIZE * TEX_SIZE);
  for (const { cells, weight } of octaves) {
    const lattice = buildLattice2D(rng, cells);
    for (let y = 0; y < TEX_SIZE; y++) {
      const v = (y / TEX_SIZE) * cells;
      for (let x = 0; x < TEX_SIZE; x++) {
        const u = (x / TEX_SIZE) * cells;
        n[y * TEX_SIZE + x] += weight * sampleValueNoise2D(lattice, u, v);
      }
    }
  }
  for (let i = 0; i < L.length; i++) L[i] = 40 + 215 * n[i] ** 3;
  return L;
}

function buildIceL(rng) {
  const L = new Float64Array(TEX_SIZE * TEX_SIZE).fill(240);
  const dirX = Math.cos(Math.PI / 3), dirY = Math.sin(Math.PI / 3); // 60 deg streak direction
  const nx = -dirY, ny = dirX; // unit normal to the streak direction
  // off = projection of (x,y) onto the normal; range over the 128x128
  // canvas is roughly [-111, 64] for this normal — sampled wide enough to
  // place streaks anywhere a diagonal at 60 deg could cross the canvas.
  for (let s = 0; s < 24; s++) {
    const off0 = rr(rng, -111, 64);
    const w = rr(rng, 2, 5);
    for (let y = 0; y < TEX_SIZE; y++) {
      for (let x = 0; x < TEX_SIZE; x++) {
        const off = x * nx + y * ny;
        if (Math.abs(off - off0) <= w / 2) L[y * TEX_SIZE + x] -= 20;
      }
    }
  }
  const speckCount = Math.round(TEX_SIZE * TEX_SIZE * 0.01); // 1% of pixels
  for (let i = 0; i < speckCount; i++) {
    const x = ri(rng, 0, TEX_SIZE - 1), y = ri(rng, 0, TEX_SIZE - 1);
    L[y * TEX_SIZE + x] = 255;
  }
  const cx = 32, cy = 32, radius = 48;
  for (let y = 0; y < TEX_SIZE; y++) {
    for (let x = 0; x < TEX_SIZE; x++) {
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < radius) L[y * TEX_SIZE + x] += 15 * (1 - dist / radius);
    }
  }
  return L;
}

function buildWoodL(rng) {
  const L = new Float64Array(TEX_SIZE * TEX_SIZE);
  const PLANK_W = 21, PLANKS = 6, SEAM_L = 120; // 6*21 + 2 = 128: exact fit, one 2px seam
  const plankRand = [];
  for (let p = 0; p < PLANKS; p++) plankRand.push(rr(rng, -15, 15));
  const colRand = [];
  for (let x = 0; x < TEX_SIZE; x++) colRand.push(rng());
  for (let x = 0; x < TEX_SIZE; x++) {
    const plankIndex = Math.floor(x / PLANK_W);
    const inPlank = plankIndex < PLANKS;
    for (let y = 0; y < TEX_SIZE; y++) {
      let v;
      if (inPlank) {
        v = 200 + plankRand[plankIndex];
        v += 10 * Math.sin(y / 9 + colRand[x] * 6);
      } else {
        v = SEAM_L;
      }
      L[y * TEX_SIZE + x] = v;
    }
  }
  return L;
}

function buildLuminanceBuffer(name, rng) {
  switch (name) {
    case "plastic": return buildPlasticL(rng);
    case "metal": return buildMetalL(rng);
    case "grass": return buildGrassL(rng);
    case "lava": return buildLavaL(rng);
    case "ice": return buildIceL(rng);
    case "wood": return buildWoodL(rng);
    default:
      throw new Error(`material '${name}' has no texture recipe`);
  }
}

// ---- texture cache: one CanvasTexture per material NAME (not per color —
// color comes from material.color tinting the grayscale-on-white map),
// built once at first use, cached forever (spec 03 §5.1). ----
const textureCache = new Map();

function luminanceToTexture(L) {
  const canvas = document.createElement("canvas");
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx2d = canvas.getContext("2d");
  const img = ctx2d.createImageData(TEX_SIZE, TEX_SIZE);
  const data = img.data;
  for (let i = 0; i < TEX_SIZE * TEX_SIZE; i++) {
    const v = clamp(Math.round(L[i]), 0, 255);
    const o = i * 4;
    data[o] = v;
    data[o + 1] = v;
    data[o + 2] = v;
    data[o + 3] = 255;
  }
  ctx2d.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  // generateMipmaps left at its default (true) per spec 03 §5.1.
  return tex;
}

function getTexture(name) {
  let tex = textureCache.get(name);
  if (!tex) {
    const rng = mulberry32(fnv1a(name));
    tex = luminanceToTexture(buildLuminanceBuffer(name, rng));
    textureCache.set(name, tex);
  }
  return tex;
}

// ---- material builders per spec 03 §5.1's table ----

function buildGlassMaterial(colorHex, tBucket) {
  // effT/opacity formula and forced minimum transparency are spec 03 §5.1's
  // glass row, evaluated against the BUCKETED transparency (the cache key
  // already collapses to bucket granularity, so two raw values sharing a
  // bucket must produce the identical cached material).
  const effT = Math.max(tBucket, GLASS_MIN_T);
  const opacity = clamp(1 - effT, 0.08, 0.45);
  const color = new THREE.Color(colorHex).lerp(new THREE.Color("#bfe3ff"), 0.25);
  return new THREE.MeshLambertMaterial({
    color, transparent: true, opacity, depthWrite: false, flatShading: false,
  });
}

function buildNeonMaterial(colorHex) {
  // Pure glow, unaffected by scene lights. Excluded from the general
  // "non-glass, non-neon materials honor part transparency" rule (spec 03
  // §5.1) — transparency>=1 -> mesh.visible=false is handled at the
  // mesh-build layer (M1-T11), not here.
  return new THREE.MeshLambertMaterial({
    color: "#000000", emissive: colorHex, emissiveIntensity: 1.0, flatShading: false,
  });
}

function buildMaterial(name, colorHex, tBucket) {
  if (name === "glass") return buildGlassMaterial(colorHex, tBucket);
  if (name === "neon") return buildNeonMaterial(colorHex);

  const map = getTexture(name);
  const fields = { color: colorHex, map, flatShading: false };
  if (name === "lava") {
    // Lava keeps its emissive fields even when also made transparent below.
    fields.emissive = colorHex;
    fields.emissiveMap = map;
    fields.emissiveIntensity = 0.85;
  }
  // "Non-glass, non-neon materials honor part transparency": 0<t<1 -> transparent.
  // t>=1 (mesh.visible=false) is handled at the mesh-build layer (M1-T11).
  if (tBucket > 0 && tBucket < 1) {
    fields.transparent = true;
    fields.opacity = 1 - tBucket;
  }
  return new THREE.MeshLambertMaterial(fields);
}

// ---- material cache: `${material}|${colorHex}|${bucket(transparency)}` ----
// bucket() is also the formula spec 03 §5.3 reuses for the instancing batch
// key (`${shape}|${material}|${colorHex}|${bucket(transparency)}`) — the
// top-half section (M1-T11) should call this same function, not reimplement it.
const materialCache = new Map();

function bucket(t) {
  return Math.round(t * 20) / 20; // spec 03 §5.1 exact formula; T_BUCKET = 0.05 step
}

export function getMaterial(name, colorHex, transparency = 0) {
  const t = bucket(transparency);
  const key = `${name}|${colorHex}|${t}`;
  let mat = materialCache.get(key);
  if (!mat) {
    mat = buildMaterial(name, colorHex, t);
    materialCache.set(key, mat);
  }
  return mat;
}

// ---- geometry cache: one unit geometry per shape name (spec 03 §5.2).
// Meshes scale to a part's actual size via `mesh.scale.set(size[0], size[1],
// size[2])` — that scaling happens at the mesh-build layer (M1-T11); this
// cache is keyed by shape name only, not by size. Not part of the public
// export table (§4.2) — the top-half section calls `getGeometry` directly,
// same file, same module scope. ----
const geometryCache = new Map();

// UV axis picker for the wedge's planar faces: use the two local axes with
// the largest extent across a face's vertices, +0.5 shifted into 0..1 (spec
// 03 §5.2). SPEC GAP (non-blocking, cosmetic only — no acceptance criterion
// reads UVs): the slope face's three axis extents are an exact 3-way tie on
// the unit cube (all extent 1.0); resolved here by a fixed x > z > y
// priority so the result is still deterministic.
const UV_AXIS_PRIORITY = [0, 2, 1]; // x, z, y
function pickUvAxes(verts) {
  const extent = [0, 1, 2].map((axis) => {
    let lo = Infinity, hi = -Infinity;
    for (const v of verts) {
      if (v[axis] < lo) lo = v[axis];
      if (v[axis] > hi) hi = v[axis];
    }
    return hi - lo;
  });
  const order = [0, 1, 2].slice().sort((a, b) => {
    if (extent[b] !== extent[a]) return extent[b] - extent[a];
    return UV_AXIS_PRIORITY.indexOf(a) - UV_AXIS_PRIORITY.indexOf(b);
  });
  return [order[0], order[1]];
}

function buildWedgeGeometry() {
  // Six unit-space corners per spec 03 §5.2.
  const A = [-0.5, -0.5, -0.5];
  const B = [0.5, -0.5, -0.5];
  const C = [0.5, -0.5, 0.5];
  const D = [-0.5, -0.5, 0.5];
  const E = [-0.5, 0.5, -0.5];
  const F = [0.5, 0.5, -0.5];

  // Faces (CCW from outside) as triangle groups, per spec 03 §5.2 exactly.
  const faces = [
    { tris: [[A, B, C], [A, C, D]] }, // bottom
    { tris: [[A, E, F], [A, F, B]] }, // back (-Z, vertical face)
    { tris: [[D, C, F], [D, F, E]] }, // slope
    { tris: [[A, D, E]] },            // left triangle
    { tris: [[B, F, C]] },            // right triangle
  ];

  const positions = [];
  const uvs = [];
  for (const face of faces) {
    const faceVerts = face.tris.flat();
    const [ua, va] = pickUvAxes(faceVerts);
    for (const tri of face.tris) {
      for (const v of tri) {
        positions.push(v[0], v[1], v[2]);
        uvs.push(v[ua] + 0.5, v[va] + 0.5);
      }
    }
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geom.computeVertexNormals(); // faces are planar -> flat per-face normals in non-indexed form
  return geom;
}

function buildUnitGeometry(shape) {
  switch (shape) {
    case "box": return new THREE.BoxGeometry(1, 1, 1);
    case "cylinder": return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
    case "sphere": return new THREE.SphereGeometry(0.5, 20, 14);
    case "wedge": return buildWedgeGeometry();
    default:
      throw new Error(`unknown shape '${shape}' for geometry cache`);
  }
}

function getGeometry(shape) {
  let geom = geometryCache.get(shape);
  if (!geom) {
    geom = buildUnitGeometry(shape);
    geometryCache.set(shape, geom);
  }
  return geom;
}

// ===== END SECTION: materials + geometry (M1-T08) =====
