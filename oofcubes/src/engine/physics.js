// physics.js — colliders, spatial-hash broadphase, and raycast (bottom half, M1-T09).
// The kinematic character controller (top half, M1-T10) is appended below the marked
// placeholder section. Owned by docs/specs/03-parts-physics-character.md §5.4 (this half).

import * as THREE from "../../assets/vendor/three.module.js";
// physics.step(dt) runs the whole sim tick (spec 03 §5.5): its phases 1-2 are parts.js
// movers/behavior timers and unanchored-part dynamics, so the character half calls into
// parts.js. parts.js receives physics through its own init deps and never imports back.
import * as parts from "./parts.js";

// ===================================================================================
// ===== SECTION: tuning constants (bottom-half subset) — spec 03 §6 =================
// ===================================================================================
// Spec 03 §6 is ONE binding tuning table; the character-controller half (M1-T10) adds
// the remaining rows it needs (GRAVITY, WALK_SPEED, JUMP_POWER, ...) in its own section
// below. Only the constants this half's code actually consumes are declared here.

const CELL = 8;               // spatial hash cell size, studs (spec 03 §6 CELL)
const HUGE_CELL_SPAN = 4096;  // cell-count threshold beyond which a collider goes into
                               // hugeSet instead of per-cell buckets (spec 03 §6 HUGE_CELL_SPAN)
const SKIN = 0.02;            // depenetration margin (spec 03 §6 SKIN); used here only
                               // for the wedge "inside the solid" plane test (spec 03
                               // §5.4: "A point is inside the wedge solid iff inside
                               // the OBB AND dot(n, p) <= d + skin")
const RAY_EPS = 1e-6;         // numerical tolerance for slab/quadratic ray tests — a
                               // generic epsilon, not a spec-named constant

// ===================================================================================
// ===== SECTION: collider registry + spatial-hash broadphase + raycast — M1-T09 =====
// ===================================================================================
// Owns: registerCollider/updateCollider/removeCollider/setColliderMotion/query/raycast
// (spec 03 §4.1's exports), the collider-kind shape math (spec 03 §5.4), and the
// spatial hash + hugeSet broadphase. The character-controller half (M1-T10) reads
// `colliders`/`grid`/`hugeSet` and calls query()/raycast() directly (same module
// scope — no export needed) for its penetration tests (spec 03 §5.6) and ground-snap
// raycasts; `clearColliders()` below is a same-module helper for its clear().

let nextColliderId = 1;
const colliders = new Map();  // colliderId -> internal record (superset of spec 03 §3.3)
const grid = new Map();       // "cx,cy,cz" -> Set<colliderId>
const hugeSet = new Set();    // colliderIds whose cell span exceeds HUGE_CELL_SPAN

// ---- spatial hash cell math -------------------------------------------------------

function cellKeyStr(cx, cy, cz) {
  return cx + "," + cy + "," + cz;
}

function cellRangeForAabb(min, max) {
  return {
    cx0: Math.floor(min[0] / CELL), cx1: Math.floor(max[0] / CELL),
    cy0: Math.floor(min[1] / CELL), cy1: Math.floor(max[1] / CELL),
    cz0: Math.floor(min[2] / CELL), cz1: Math.floor(max[2] / CELL),
  };
}

function cellCount(range) {
  return (range.cx1 - range.cx0 + 1) * (range.cy1 - range.cy0 + 1) * (range.cz1 - range.cz0 + 1);
}

function sameRange(a, b) {
  return a.cx0 === b.cx0 && a.cx1 === b.cx1 &&
         a.cy0 === b.cy0 && a.cy1 === b.cy1 &&
         a.cz0 === b.cz0 && a.cz1 === b.cz1;
}

// ---- shape math: local <-> world, per collider kind -------------------------------

function cloneVec3(v) {
  return [v[0], v[1], v[2]];
}

function quatFromEulerDeg(rotDeg) {
  const q = new THREE.Quaternion();
  q.setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(rotDeg[0]),
    THREE.MathUtils.degToRad(rotDeg[1]),
    THREE.MathUtils.degToRad(rotDeg[2]),
    "XYZ"
  ));
  return q;
}

function aabbFieldsFromHalf(half, position) {
  return {
    min: [position[0] - half[0], position[1] - half[1], position[2] - half[2]],
    max: [position[0] + half[0], position[1] + half[1], position[2] + half[2]],
  };
}

function obbFieldsFromHalf(half, position, rotationDeg) {
  const q = quatFromEulerDeg(rotationDeg);
  return { center: cloneVec3(position), half: cloneVec3(half), quat: q.toArray() };
}

// Unit-space wedge slope plane (spec 03 §5.4): passes through local points
// (0, +half.y, -half.z) and (0, -half.y, +half.z) with local normal proportional to
// (0, half.z, half.y) — matches the wedge mesh geometry of spec 03 §5.2.
function wedgePlaneFromHalf(half, position, rotationDeg) {
  const q = quatFromEulerDeg(rotationDeg);
  const normalLocal = new THREE.Vector3(0, half[2], half[1]).normalize();
  const pointLocal = new THREE.Vector3(0, half[1], -half[2]);
  const centerV = new THREE.Vector3(position[0], position[1], position[2]);
  const normalWorld = normalLocal.applyQuaternion(q);
  const pointWorld = pointLocal.applyQuaternion(q).add(centerV);
  return { normal: normalWorld.toArray(), d: normalWorld.dot(pointWorld) };
}

function localHalfOf(desc) {
  if (desc.kind === "aabb") {
    const { min, max } = desc.aabb;
    return [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
  }
  if (desc.kind === "obb" || desc.kind === "wedge") return cloneVec3(desc.obb.half);
  return null;
}

// Pure geometry helper implementing spec 03 §5.4's binding "Collider kind selection"
// rule: given a Part's shape/size/position/rotation, builds the descriptor
// registerCollider() expects. parts.js (M1-T11) is expected to call this for the
// default case, passing `{ forceObb: true }` for parts whose behavior will rotate
// them later (spec 03 §5.7 spinner note: "build spinner colliders as OBB from the
// start"). Not itself one of spec 03 §4.1's named exports.
export function colliderDescFromShape(shape, size, position, rotationDeg, opts = {}) {
  const rot = rotationDeg || [0, 0, 0];
  const unrotated = Math.abs(rot[0]) < RAY_EPS && Math.abs(rot[1]) < RAY_EPS && Math.abs(rot[2]) < RAY_EPS;
  const half = [size[0] / 2, size[1] / 2, size[2] / 2];

  if (shape === "sphere") {
    return { kind: "sphere", sphere: { center: cloneVec3(position), radius: size[0] / 2 } };
  }
  if (shape === "cylinder") {
    if (unrotated && !opts.forceObb) {
      return {
        kind: "cylinder",
        cylinder: { center: cloneVec3(position), radius: Math.min(size[0], size[2]) / 2, halfHeight: size[1] / 2 },
      };
    }
    return { kind: "obb", obb: obbFieldsFromHalf(half, position, rot) };
  }
  if (shape === "wedge") {
    return {
      kind: "wedge",
      obb: obbFieldsFromHalf(half, position, rot),
      wedgePlane: wedgePlaneFromHalf(half, position, rot),
    };
  }
  // box (default)
  if (unrotated && !opts.forceObb) {
    return { kind: "aabb", aabb: aabbFieldsFromHalf(half, position) };
  }
  return { kind: "obb", obb: obbFieldsFromHalf(half, position, rot) };
}

// ---- world AABB (grid insertion) per kind ------------------------------------------

// World-axis-aligned half-extent of a box of local half-extents `half` rotated by
// quaternion `quatArr` ([x,y,z,w]) — the standard |R|*half formula, used to build a
// tight enclosing AABB for grid insertion without allocating a THREE.Matrix4 per call.
function absExtentFromQuat(quatArr, half) {
  const x = quatArr[0], y = quatArr[1], z = quatArr[2], w = quatArr[3];
  const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - z * w), r02 = 2 * (x * z + y * w);
  const r10 = 2 * (x * y + z * w), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - x * w);
  const r20 = 2 * (x * z - y * w), r21 = 2 * (y * z + x * w), r22 = 1 - 2 * (x * x + y * y);
  return [
    Math.abs(r00) * half[0] + Math.abs(r01) * half[1] + Math.abs(r02) * half[2],
    Math.abs(r10) * half[0] + Math.abs(r11) * half[1] + Math.abs(r12) * half[2],
    Math.abs(r20) * half[0] + Math.abs(r21) * half[1] + Math.abs(r22) * half[2],
  ];
}

function computeWorldAabb(record) {
  switch (record.kind) {
    case "aabb":
      return { min: record.aabb.min, max: record.aabb.max };
    case "obb":
    case "wedge": {
      const c = record.obb.center;
      const ext = absExtentFromQuat(record.obb.quat, record.obb.half);
      return { min: [c[0] - ext[0], c[1] - ext[1], c[2] - ext[2]], max: [c[0] + ext[0], c[1] + ext[1], c[2] + ext[2]] };
    }
    case "sphere": {
      const c = record.sphere.center, r = record.sphere.radius;
      return { min: [c[0] - r, c[1] - r, c[2] - r], max: [c[0] + r, c[1] + r, c[2] + r] };
    }
    case "cylinder": {
      const c = record.cylinder.center, r = record.cylinder.radius, hh = record.cylinder.halfHeight;
      return { min: [c[0] - r, c[1] - hh, c[2] - r], max: [c[0] + r, c[1] + hh, c[2] + r] };
    }
    default:
      return { min: [0, 0, 0], max: [0, 0, 0] };
  }
}

// ---- grid membership ---------------------------------------------------------------

function placementFor(record) {
  const wa = computeWorldAabb(record);
  const range = cellRangeForAabb(wa.min, wa.max);
  return { range, huge: cellCount(range) > HUGE_CELL_SPAN };
}

function insertToGrid(record, placement) {
  const p = placement || placementFor(record);
  record.range = p.range;
  if (p.huge) {
    record.inHugeSet = true;
    record.cellKeys = null;
    hugeSet.add(record.id);
    return;
  }
  record.inHugeSet = false;
  const keys = [];
  for (let cx = p.range.cx0; cx <= p.range.cx1; cx++) {
    for (let cy = p.range.cy0; cy <= p.range.cy1; cy++) {
      for (let cz = p.range.cz0; cz <= p.range.cz1; cz++) {
        const key = cellKeyStr(cx, cy, cz);
        let set = grid.get(key);
        if (!set) { set = new Set(); grid.set(key, set); }
        set.add(record.id);
        keys.push(key);
      }
    }
  }
  record.cellKeys = keys;
}

function removeFromGrid(record) {
  if (record.inHugeSet) {
    hugeSet.delete(record.id);
    record.inHugeSet = false;
    return;
  }
  if (record.cellKeys) {
    for (const key of record.cellKeys) {
      const set = grid.get(key);
      if (set) {
        set.delete(record.id);
        if (set.size === 0) grid.delete(key);
      }
    }
  }
  record.cellKeys = null;
}

function currentCenterOf(record) {
  if (record.aabb) {
    return [
      (record.aabb.min[0] + record.aabb.max[0]) / 2,
      (record.aabb.min[1] + record.aabb.max[1]) / 2,
      (record.aabb.min[2] + record.aabb.max[2]) / 2,
    ];
  }
  if (record.obb) return record.obb.center;
  if (record.sphere) return record.sphere.center;
  if (record.cylinder) return record.cylinder.center;
  return [0, 0, 0];
}

// ---- public registry API (spec 03 §4.1) --------------------------------------------

// desc = spec 03 §3.3's collider descriptor minus `id` (id is assigned here). Kind and
// kind-specific world-space fields are supplied by the caller (colliderDescFromShape
// above builds them per the §5.4 kind-selection rule); this stores a defensive copy
// plus the rotation-invariant local dimensions needed to recompute on updateCollider.
export function registerCollider(desc) {
  const id = nextColliderId++;
  const record = {
    id,
    partId: desc.partId != null ? desc.partId : null,
    kind: desc.kind,
    isSensor: !!desc.isSensor,
    motion: desc.motion || null,
    aabb: desc.aabb ? { min: cloneVec3(desc.aabb.min), max: cloneVec3(desc.aabb.max) } : null,
    obb: desc.obb ? { center: cloneVec3(desc.obb.center), half: cloneVec3(desc.obb.half), quat: desc.obb.quat.slice() } : null,
    sphere: desc.sphere ? { center: cloneVec3(desc.sphere.center), radius: desc.sphere.radius } : null,
    cylinder: desc.cylinder
      ? { center: cloneVec3(desc.cylinder.center), radius: desc.cylinder.radius, halfHeight: desc.cylinder.halfHeight }
      : null,
    wedgePlane: desc.wedgePlane ? { normal: cloneVec3(desc.wedgePlane.normal), d: desc.wedgePlane.d } : null,
    half: localHalfOf(desc),
    radius: desc.sphere ? desc.sphere.radius : (desc.cylinder ? desc.cylinder.radius : null),
    halfHeight: desc.cylinder ? desc.cylinder.halfHeight : null,
    cellKeys: null,
    inHugeSet: false,
    range: null,
  };
  colliders.set(id, record);
  insertToGrid(record);
  return id;
}

// Recompute shape at a new transform (spec 03 §4.1); re-inserts into the grid only if
// the occupied cell range actually changed (spec 03 §5.4).
export function updateCollider(colliderId, opts = {}) {
  const record = colliders.get(colliderId);
  if (!record) return;
  const position = opts.position || currentCenterOf(record);
  const rotationDeg = opts.rotationDeg || [0, 0, 0];

  if (record.kind === "aabb") {
    record.aabb = aabbFieldsFromHalf(record.half, position);
  } else if (record.kind === "obb") {
    record.obb = obbFieldsFromHalf(record.half, position, rotationDeg);
  } else if (record.kind === "wedge") {
    record.obb = obbFieldsFromHalf(record.half, position, rotationDeg);
    record.wedgePlane = wedgePlaneFromHalf(record.half, position, rotationDeg);
  } else if (record.kind === "sphere") {
    record.sphere = { center: cloneVec3(position), radius: record.radius };
  } else if (record.kind === "cylinder") {
    record.cylinder = { center: cloneVec3(position), radius: record.radius, halfHeight: record.halfHeight };
  }

  const placement = placementFor(record);
  const changed = placement.huge !== record.inHugeSet ||
    (!placement.huge && (!record.range || !sameRange(record.range, placement.range)));
  if (changed) {
    removeFromGrid(record);
    insertToGrid(record, placement);
  } else {
    record.range = placement.range;
  }
}

export function removeCollider(colliderId) {
  const record = colliders.get(colliderId);
  if (!record) return;
  removeFromGrid(record);
  colliders.delete(colliderId);
}

export function setColliderMotion(colliderId, motion) {
  const record = colliders.get(colliderId);
  if (!record) return;
  record.motion = motion || null;
}

// Broadphase query, deduplicated (spec 03 §4.1): walks the cell range, unions per-cell
// sets + hugeSet.
export function query(aabbMin, aabbMax) {
  const range = cellRangeForAabb(aabbMin, aabbMax);
  const result = new Set();
  for (const id of hugeSet) result.add(id);
  for (let cx = range.cx0; cx <= range.cx1; cx++) {
    for (let cy = range.cy0; cy <= range.cy1; cy++) {
      for (let cz = range.cz0; cz <= range.cz1; cz++) {
        const set = grid.get(cellKeyStr(cx, cy, cz));
        if (set) for (const id of set) result.add(id);
      }
    }
  }
  return Array.from(result);
}

// Not one of spec 03 §4.1's named exports — a same-module helper the character-
// controller half's clear() (spec 03 §4.1) can call to wipe collider state alongside
// its own character-state reset.
function clearColliders() {
  colliders.clear();
  grid.clear();
  hugeSet.clear();
  nextColliderId = 1;
}

// ---- raycast: per-kind analytic intersection tests (spec 03 §5.4) -----------------

// Ray vs. an axis-aligned box [min,max] in the SAME space as origin/dir (slab method).
// Returns { t, tExit, normal } (entry/exit distances + outward normal at entry) or
// null. Reused directly for AABB colliders, and for OBB/wedge colliders after
// transforming the ray into the box's local space (rayObbTest below).
function rayAabbTest(origin, dir, min, max) {
  let tmin = -Infinity, tmax = Infinity;
  let enterAxis = -1, enterSign = 1;
  for (let axis = 0; axis < 3; axis++) {
    const o = origin[axis], d = dir[axis];
    if (Math.abs(d) < RAY_EPS) {
      if (o < min[axis] || o > max[axis]) return null;
      continue;
    }
    const inv = 1 / d;
    let tNear = (min[axis] - o) * inv;
    let tFar = (max[axis] - o) * inv;
    let sign = -1; // entering through the min face -> outward normal points -axis
    if (tNear > tFar) {
      const tmp = tNear; tNear = tFar; tFar = tmp;
      sign = 1;     // entering through the max face -> outward normal points +axis
    }
    if (tNear > tmin) { tmin = tNear; enterAxis = axis; enterSign = sign; }
    if (tFar < tmax) tmax = tFar;
    if (tmin > tmax) return null;
  }
  if (tmax < 0) return null;
  const normal = [0, 0, 0];
  if (enterAxis >= 0) normal[enterAxis] = enterSign;
  return { t: Math.max(tmin, 0), tExit: tmax, normal };
}

function rayObbTest(origin, dir, obb) {
  const q = new THREE.Quaternion(obb.quat[0], obb.quat[1], obb.quat[2], obb.quat[3]);
  const invQ = q.clone().invert();
  const centerV = new THREE.Vector3(obb.center[0], obb.center[1], obb.center[2]);
  const originLocal = new THREE.Vector3(origin[0], origin[1], origin[2]).sub(centerV).applyQuaternion(invQ);
  const dirLocal = new THREE.Vector3(dir[0], dir[1], dir[2]).applyQuaternion(invQ);
  const half = obb.half;
  const local = rayAabbTest(
    [originLocal.x, originLocal.y, originLocal.z],
    [dirLocal.x, dirLocal.y, dirLocal.z],
    [-half[0], -half[1], -half[2]],
    [half[0], half[1], half[2]]
  );
  if (!local) return null;
  const normalWorld = new THREE.Vector3(local.normal[0], local.normal[1], local.normal[2])
    .applyQuaternion(q).normalize();
  return { t: local.t, tExit: local.tExit, normal: [normalWorld.x, normalWorld.y, normalWorld.z] };
}

function raySphereTest(origin, dir, sphere) {
  const ox = origin[0] - sphere.center[0], oy = origin[1] - sphere.center[1], oz = origin[2] - sphere.center[2];
  const a = dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2];
  const b = 2 * (ox * dir[0] + oy * dir[1] + oz * dir[2]);
  const c = ox * ox + oy * oy + oz * oz - sphere.radius * sphere.radius;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  let t = (-b - sq) / (2 * a);
  if (t < 0) t = (-b + sq) / (2 * a);
  if (t < 0) return null;
  const px = origin[0] + dir[0] * t, py = origin[1] + dir[1] * t, pz = origin[2] + dir[2] * t;
  const r = sphere.radius;
  return { t, normal: [(px - sphere.center[0]) / r, (py - sphere.center[1]) / r, (pz - sphere.center[2]) / r] };
}

function rayCylinderTest(origin, dir, cyl) {
  const cx = cyl.center[0], cy = cyl.center[1], cz = cyl.center[2];
  const top = cy + cyl.halfHeight, bot = cy - cyl.halfHeight;
  let best = null;

  const a = dir[0] * dir[0] + dir[2] * dir[2];
  if (a > RAY_EPS) {
    const ox = origin[0] - cx, oz = origin[2] - cz;
    const b = 2 * (ox * dir[0] + oz * dir[2]);
    const c = ox * ox + oz * oz - cyl.radius * cyl.radius;
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const sq = Math.sqrt(disc);
      for (const t of [(-b - sq) / (2 * a), (-b + sq) / (2 * a)]) {
        if (t < 0) continue;
        const y = origin[1] + dir[1] * t;
        if (y < bot || y > top) continue;
        const px = origin[0] + dir[0] * t, pz = origin[2] + dir[2] * t;
        best = { t, normal: [(px - cx) / cyl.radius, 0, (pz - cz) / cyl.radius] };
        break; // roots ascend; the first valid one is nearest via the side
      }
    }
  }
  if (Math.abs(dir[1]) > RAY_EPS) {
    for (const planeY of [top, bot]) {
      const t = (planeY - origin[1]) / dir[1];
      if (t < 0) continue;
      const px = origin[0] + dir[0] * t, pz = origin[2] + dir[2] * t;
      const d2 = (px - cx) * (px - cx) + (pz - cz) * (pz - cz);
      if (d2 <= cyl.radius * cyl.radius && (!best || t < best.t)) {
        best = { t, normal: [0, planeY === top ? 1 : -1, 0] };
      }
    }
  }
  return best;
}

// Slab-test the wedge's OBB, then clip per spec 03 §5.4: a slab entry point outside
// the solid (violates the slope plane) is discarded in favor of the ray/plane
// crossing, accepted only if it lies within the OBB's ray interval.
function rayWedgeTest(origin, dir, obb, wedgePlane) {
  const obbHit = rayObbTest(origin, dir, obb);
  if (!obbHit) return null;
  const n = wedgePlane.normal;
  const entry = [origin[0] + dir[0] * obbHit.t, origin[1] + dir[1] * obbHit.t, origin[2] + dir[2] * obbHit.t];
  const dotEntry = n[0] * entry[0] + n[1] * entry[1] + n[2] * entry[2];
  if (dotEntry <= wedgePlane.d + SKIN) return obbHit;

  const denom = n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2];
  if (Math.abs(denom) < RAY_EPS) return null;
  const dotOrigin = n[0] * origin[0] + n[1] * origin[1] + n[2] * origin[2];
  const tPlane = (wedgePlane.d - dotOrigin) / denom;
  if (tPlane < obbHit.t - RAY_EPS || tPlane > obbHit.tExit + RAY_EPS) return null;
  return { t: Math.max(tPlane, 0), normal: n.slice() };
}

function testColliderRay(record, origin, dir) {
  switch (record.kind) {
    case "aabb": return rayAabbTest(origin, dir, record.aabb.min, record.aabb.max);
    case "obb": return rayObbTest(origin, dir, record.obb);
    case "sphere": return raySphereTest(origin, dir, record.sphere);
    case "cylinder": return rayCylinderTest(origin, dir, record.cylinder);
    case "wedge": return rayWedgeTest(origin, dir, record.obb, record.wedgePlane);
    default: return null;
  }
}

function stepQueryBounds(origin, ndir, t0, t1) {
  const p0 = [origin[0] + ndir[0] * t0, origin[1] + ndir[1] * t0, origin[2] + ndir[2] * t0];
  const p1 = [origin[0] + ndir[0] * t1, origin[1] + ndir[1] * t1, origin[2] + ndir[2] * t1];
  return {
    min: [Math.min(p0[0], p1[0]), Math.min(p0[1], p1[1]), Math.min(p0[2], p1[2])],
    max: [Math.max(p0[0], p1[0]), Math.max(p0[1], p1[1]), Math.max(p0[2], p1[2])],
  };
}

// raycast (spec 03 §4.1/§3.4/§5.4): steps the broadphase along the ray in CELL
// increments (not exact DDA — "accepted cost" per spec), analytically tests each new
// candidate, and stops as soon as the best hit found is within the fully-covered
// range (any collider in a farther cell cannot beat it — see spec 03 §5.4).
export function raycast(origin, dir, maxDist, filterFn) {
  const filter = filterFn || ((c) => !c.isSensor);
  const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1] + dir[2] * dir[2]);
  if (len < RAY_EPS || maxDist <= 0) return null;
  const ndir = [dir[0] / len, dir[1] / len, dir[2] / len];

  const tested = new Set();
  let best = null;
  const steps = Math.ceil(maxDist / CELL);
  for (let i = 0; i < steps; i++) {
    const t0 = i * CELL;
    const t1 = Math.min((i + 1) * CELL, maxDist);
    const bounds = stepQueryBounds(origin, ndir, t0, t1);
    for (const id of query(bounds.min, bounds.max)) {
      if (tested.has(id)) continue;
      tested.add(id);
      const record = colliders.get(id);
      if (!record || !filter(record)) continue;
      const hit = testColliderRay(record, origin, ndir);
      if (!hit || hit.t < 0 || hit.t > maxDist) continue;
      if (!best || hit.t < best.t) best = { t: hit.t, normal: hit.normal, colliderId: id, partId: record.partId };
    }
    if (best && best.t <= t1 + RAY_EPS) break;
  }
  if (!best) return null;
  return {
    colliderId: best.colliderId,
    partId: best.partId,
    point: [origin[0] + ndir[0] * best.t, origin[1] + ndir[1] * best.t, origin[2] + ndir[2] * best.t],
    normal: best.normal,
    distance: best.t,
  };
}

// ===================================================================================
// ===== SECTION: character controller (top half) — M1-T10 ===========================
// ===================================================================================
// Spec 03 §5.5 (physics.step tick order) + §5.6 (the kinematic capsule controller,
// incl. §5.6.1 death & respawn). This section consumes the collider registry above by
// plain module-scope reference (colliders, query, raycast, computeWorldAabb,
// cloneVec3, clearColliders, SKIN) — same file, no import.
//
// There is deliberately NO avatar kill plane here: void death is the per-Place killY
// checked by place.js (spec 03 §5.6 step 11 / spec 04 §5.4 step 7). PART_DESPAWN_Y
// applies to unanchored parts only (§5.8, parts.js).

// ---- tuning constants (spec 03 §6; SKIN is declared with the bottom half above) ----
const GRAVITY = 196.2;
const WALK_SPEED = 16;
const JUMP_POWER = 50;
const TERMINAL = 250;
const CAPSULE_RADIUS = 1;
const CAPSULE_HEIGHT = 5;
const STEP_HEIGHT = 1.1;
const SLOPE_MAX_DEG = 55;
// Both windows are 7, not 6 (spec 03 §6). §5.6 step 5 decrements the counter BEFORE
// testing it, so a stored 6 only ever yields 5 usable frames; and the jump is checked at
// step 5 while the landing is resolved at step 8, so a press buffered on the touchdown
// tick can only fire the tick after it. §7 criterion 13's counting convention — frame 0
// is the first tick on which step 5's jump check observes the new state — then requires
// offsets 0-5 to fire and offset 6 not to: six usable frames in BOTH windows. Measured,
// not reasoned; measure coyote by removing the floor collider, never by a ledge walk-off
// (the capsule's round bottom re-contacts the ledge corner and re-arms the counter).
const COYOTE = 7;
const BUFFER = 7;
const SNAP_DIST = 0.25;
const SLIDE_ITERS = 3;
const TOUCH_PAD = 0.05;
const TURN_SPEED = 720;
const DEATH_DELAY = 1.0;
const RESPAWN_GRACE = 0.5;
const TELEPORT_COOLDOWN = 0.5;

// Derived from the rows above + the capsule description in spec 03 §5.6.
const SLOPE_COS = Math.cos((SLOPE_MAX_DEG * Math.PI) / 180); // ~0.5736
const SEG_HALF = CAPSULE_HEIGHT / 2 - CAPSULE_RADIUS;        // 1.5 (segment half-length)
const FEET_OFFSET = CAPSULE_HEIGHT / 2;                      // 2.5 (center -> feet)
// A capsule of radius R at rest on a plane of normal-y `ny` cannot touch the surface
// point directly under its axis — its bottom cap goes tangent further up-slope — so the
// feet sit hoverFor(ny) ABOVE that point: 0 on flat ground, 0.556 at 50°, 0.743 at the
// SLOPE_MAX_DEG limit. Step 9 needs both a ray long enough to reach that point and a gap
// test measured against it.
const MAX_HOVER = CAPSULE_RADIUS * (1 / SLOPE_COS - 1);      // ~0.7434 at 55°
const SNAP_RAY = FEET_OFFSET + MAX_HOVER + SNAP_DIST;        // ~3.4934
const DEG = Math.PI / 180;

// Literal thresholds quoted from the §5.6 algorithm prose (not §6 rows).
const CEIL_NY = -0.7;         // step 8: normal.y <= -0.7 is a ceiling
const VERT_ITERS = 3;         // step 8: "up to 3 iterations"
const QUERY_INFLATE = 0.5;    // step 7: capsule AABB inflated by 0.5 for the broadphase
const FLAT_MIN = 0.01;        // step 7: degenerate flattened wall normal
const WEDGE_SOLID_EPS = 0.01; // §5.6 wedge test: dot(n, point) <= d + 0.01 -> solid hit
const WEDGE_SLACK = 0.1;      // §5.6 wedge test: projection clamp slack
const FACE_MIN_SPEED = 0.5;   // step 13: only face travel above this horizontal speed
const CAP_TOL = 0.75;         // §5.6 cylinder cap-contact tolerance
const STEP_EPS = 1e-6;        // float slack on the (0, STEP_HEIGHT] step-up interval
const EPS = 1e-9;
const TIMER_EPS = 1e-9;      // float residue floor for sim-tick countdowns

// ---- module state (spec 03 §5.6 "State:") ------------------------------------------

let audio = null;
let events = null;
let input = null;
let camera = null;

let enabled = true;
let attached = null;      // avatar root Object3D; its origin is the FEET (spec 03 §5.6.14)
let contactHandler = null;

const pos = [0, FEET_OFFSET, 0];      // capsule CENTER
const vel = [0, 0, 0];
const prevPos = [0, FEET_OFFSET, 0];
let yaw = 0;                          // radians
let prevYaw = 0;

let grounded = false;
let groundColliderId = null;
let gravityDy = 0;                    // vel.y change gravity applied this tick (step 6)
let coyoteFrames = 0;
let bufferFrames = 0;
let baseWalkSpeed = WALK_SPEED;
let jumpPower = JUMP_POWER;
let effectSpeed = WALK_SPEED;         // speed-pad override (spec 03 §5.7 "speed")
let effectTimer = 0;
let gravity = GRAVITY;
let dying = false;
let deathTimer = 0;
let graceTimer = 0;
let teleportTimer = 0;                // global anti-ping-pong window (§5.7 "teleport")
let skipSnap = false;                 // teleport skips ground-snap for one tick
let spawnFeet = [0, 0, 0];
let checkpoint = { index: -1, feetPos: [0, 0, 0] };

let contactIds = new Set();           // collider ids contacted this step
let prevContactIds = new Set();
let contactParts = new Set();         // partIds behind contactIds (getContacts)

// ---- small math helpers -------------------------------------------------------------

function clampNum(v, lo, hi) {
  return v < lo ? lo : (v > hi ? hi : v);
}

// v rotated by quaternion q ([x,y,z,w]); the three.js formula, kept allocation-light
// because the penetration tests run several times per sim tick.
function rotQ(q, v) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const ix = w * v[0] + y * v[2] - z * v[1];
  const iy = w * v[1] + z * v[0] - x * v[2];
  const iz = w * v[2] + x * v[1] - y * v[0];
  const iw = -x * v[0] - y * v[1] - z * v[2];
  return [
    ix * w + iw * -x + iy * -z - iz * -y,
    iy * w + iw * -y + iz * -x - ix * -z,
    iz * w + iw * -z + ix * -y - iy * -x,
  ];
}

function invRotQ(q, v) {
  return rotQ([-q[0], -q[1], -q[2], q[3]], v);
}

function wrapAngle(a) {
  let r = a;
  while (r > Math.PI) r -= 2 * Math.PI;
  while (r < -Math.PI) r += 2 * Math.PI;
  return r;
}

// ---- capsule geometry ---------------------------------------------------------------

function capsuleBounds(p, radius, inflate) {
  const h = SEG_HALF + radius + inflate;   // = FEET_OFFSET for the normal radius
  const r = radius + inflate;
  return {
    min: [p[0] - r, p[1] - h, p[2] - r],
    max: [p[0] + r, p[1] + h, p[2] + r],
  };
}

// Closest point on the (always vertical) capsule segment to `target`.
function segClosest(p, target) {
  return [p[0], clampNum(target[1], p[1] - SEG_HALF, p[1] + SEG_HALF), p[2]];
}

function feetOf(p) {
  return [p[0], p[1] - FEET_OFFSET, p[2]];
}

// ---- capsule-vs-shape penetration tests (spec 03 §5.6) ------------------------------

function boxToLocal(p, center, quat) {
  const d = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
  return quat ? invRotQ(quat, d) : d;
}

function boxToWorld(local, center, quat) {
  const d = quat ? rotQ(quat, local) : local;
  return [d[0] + center[0], d[1] + center[1], d[2] + center[2]];
}

function clampPointToBox(p, center, half, quat) {
  const l = boxToLocal(p, center, quat);
  const c = [
    clampNum(l[0], -half[0], half[0]),
    clampNum(l[1], -half[1], half[1]),
    clampNum(l[2], -half[2], half[2]),
  ];
  return boxToWorld(c, center, quat);
}

// How far a single tick may legitimately translate the avatar out of a solid it is
// already inside: this tick's own travel (prevPos is the tick-start centre, §5.6.14),
// plus the `radius` a shallow surface contact could itself demand. Penetration deeper
// than that was not created by this tick's motion, so the depenetration branches below
// repair it over the following ticks — at least one radius per tick, ~1 stud at
// CAPSULE_RADIUS — instead of teleporting the avatar clean out the far side of the solid.
function maxDepenetration(p, radius) {
  const dx = prevPos[0] - p[0], dy = prevPos[1] - p[1], dz = prevPos[2] - p[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz) + radius;
}

// Capsule vs AABB/OBB: the two-pass converge of spec 03 §5.6, plus the deep-penetration
// branch for when the segment point ends up inside the box.
//
// Also reports `inside` (the segment point is within the box) and `axisPoint` (the
// converged closest segment point P). wedgePenetration needs both to apply §5.4's real
// solid test — inside the OBB is not the same as inside a wedge — and nothing else reads
// them; the numbers in the shallow branch are untouched, so surface contacts (all of flat
// ground) resolve bit-identically.
function boxPenetration(p, radius, center, half, quat) {
  let P = segClosest(p, center);
  let Q = clampPointToBox(P, center, half, quat);
  P = segClosest(p, Q);
  Q = clampPointToBox(P, center, half, quat);
  const dx = P[0] - Q[0], dy = P[1] - Q[1], dz = P[2] - Q[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len >= radius) return null;

  const l = boxToLocal(P, center, quat);
  const inside = Math.abs(l[0]) <= half[0] && Math.abs(l[1]) <= half[1] && Math.abs(l[2]) <= half[2];
  if (inside) {
    // DEEP PENETRATION. The capsule's axis is inside the box, so there is no nearest
    // surface point to push away from. §5.6's wording — "use the face of minimum exit
    // distance: depth = r + minExit" — is written for a barely-swallowed capsule; on a
    // DEEP box (a tall wedge's OBB, a thick platform) minExit is many studs, and that
    // one-tick translation shoves the avatar clean out the far side. Two corrections,
    // each bounded by what a single tick can physically justify:
    //   (a) DIRECTION — of the six faces, prefer the ones the capsule could actually
    //       have come through: those whose outward normal points back along the
    //       displacement it has accumulated this tick (prevPos is the tick-start centre,
    //       §5.6.14). Least penetration among those wins, so this is still "the axis of
    //       least penetration" — just measured relative to where the capsule came from
    //       instead of to the box's own proportions. It also stops a fast faller being
    //       pushed DOWN through a thin platform it half-tunnelled into. With no motion to
    //       go on (a spawn or teleport that lands inside geometry) fall back to the plain
    //       minimum-exit face, which is §5.6's text verbatim.
    //   (b) MAGNITUDE — maxDepenetration() above: never further than one tick can
    //       justify. Sinking briefly is recoverable; being flung through a ramp is not.
    const backWorld = [prevPos[0] - p[0], prevPos[1] - p[1], prevPos[2] - p[2]];
    const back = quat ? invRotQ(quat, backWorld) : backWorld;
    let axis = -1;
    let sign = 1;
    let exit = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(back[i]) <= EPS) continue;
      const s = back[i] < 0 ? -1 : 1;
      const e = half[i] - s * l[i];
      if (e < exit) { exit = e; axis = i; sign = s; }
    }
    if (axis < 0) {
      axis = 0;
      sign = l[0] < 0 ? -1 : 1;
      exit = half[0] - Math.abs(l[0]);
      for (let i = 1; i < 3; i++) {
        const e = half[i] - Math.abs(l[i]);
        if (e < exit) { exit = e; axis = i; sign = l[i] < 0 ? -1 : 1; }
      }
    }
    const nLocal = [0, 0, 0];
    nLocal[axis] = sign;
    const face = [l[0], l[1], l[2]];
    face[axis] = sign * half[axis];
    return {
      normal: quat ? rotQ(quat, nLocal) : nLocal,
      depth: Math.min(radius + exit, maxDepenetration(p, radius)),
      point: boxToWorld(face, center, quat),
      inside: true,
      axisPoint: P,
    };
  }
  if (len < EPS) return null;
  return { normal: [dx / len, dy / len, dz / len], depth: radius - len, point: Q, inside: false, axisPoint: P };
}

function spherePenetration(p, radius, s) {
  const P = segClosest(p, s.center);
  const dx = P[0] - s.center[0], dy = P[1] - s.center[1], dz = P[2] - s.center[2];
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const depth = radius + s.radius - len;
  if (depth <= 0) return null;
  const n = len < EPS ? [0, 1, 0] : [dx / len, dy / len, dz / len];
  return {
    normal: n,
    depth,
    point: [s.center[0] + n[0] * s.radius, s.center[1] + n[1] * s.radius, s.center[2] + n[2] * s.radius],
  };
}

// Capsule vs upright cylinder: the binding cap/side branches of spec 03 §5.6.
function cylinderPenetration(p, radius, cyl) {
  const cx = cyl.center[0], cy = cyl.center[1], cz = cyl.center[2];
  const ddx = p[0] - cx, ddz = p[2] - cz;
  const dXZ = Math.sqrt(ddx * ddx + ddz * ddz);
  const top = cy + cyl.halfHeight, bot = cy - cyl.halfHeight;
  const feet = p[1] - FEET_OFFSET, head = p[1] + FEET_OFFSET;

  if (dXZ <= cyl.radius) {
    // SPEC DEFECT, spec 03 §5.6 "vs cylinder" branch (a). The spec writes the cap depth
    // as `r - (feet - top)` with `feet = pos.y - 2.5`, but 2.5 is the capsule's
    // centre->SOLE distance (FEET_OFFSET = SEG_HALF 1.5 + radius 1), not its
    // centre->segment-endpoint distance. Feeding the sole into a formula that expects
    // the segment endpoint leaves depth = r at the RESTING position, so moveVertical
    // lifts the avatar one full radius clear of every cylinder cap and then loses the
    // contact entirely (the old `feet - top < radius` guard), which makes `grounded`
    // flicker on alternate ticks. Measured before this fix, on the Hub's own plaza
    // disc (a cylinder whose cap is y = 0.5): feet settled at 1.5, grounded 101010...,
    // getStandingOn() null — so carry/conveyor/behaviour dispatch all failed on any
    // cylinder floor, and the demo's tower cylinder could not be stood on at all.
    // The box branch has no such error because it measures from the segment via
    // segClosest; penetration of the SOLE into the cap plane is simply `top - feet`,
    // which is that same quantity rewritten for this analytic case.
    if (feet >= top - CAP_TOL && feet <= top) {
      return { normal: [0, 1, 0], depth: Math.min(top - feet, radius), point: [p[0], top, p[2]] };
    }
    if (head <= bot + CAP_TOL && head >= bot) {
      return { normal: [0, -1, 0], depth: Math.min(head - bot, radius), point: [p[0], bot, p[2]] };
    }
  }
  if (dXZ >= cyl.radius + radius || feet > top || head < bot) return null;
  const n = dXZ < EPS ? [1, 0, 0] : [ddx / dXZ, 0, ddz / dXZ];
  return {
    normal: n,
    depth: cyl.radius + radius - dXZ,
    point: [cx + n[0] * cyl.radius, clampNum(p[1], bot, top), cz + n[2] * cyl.radius],
  };
}

// Capsule vs wedge: OBB test first, then the slope-plane branch (spec 03 §5.6).
function wedgePenetration(p, radius, record) {
  const hit = boxPenetration(p, radius, record.obb.center, record.obb.half, record.obb.quat);
  if (!hit) return null;
  const n = record.wedgePlane.normal;
  const d = record.wedgePlane.d;
  // Spec 03 §5.4: a point is inside the wedge SOLID iff it is inside the OBB AND
  // dot(n, p) <= d + skin. The box test only knows the OBB, so a "deep penetration" it
  // reports may be the capsule's axis sitting in the box's EMPTY half, above the slope —
  // which is exactly where a capsule climbing the ramp sits, upper body over the slope
  // and inside the bounding box. Resolving that against a box face is what ejected
  // climbers out the back of a tall wedge (a 24-deep one threw the avatar 13 studs in one
  // tick); the real contact there is the slope plane, handled by the branch below.
  const axisInSolid = n[0] * hit.axisPoint[0] + n[1] * hit.axisPoint[1] + n[2] * hit.axisPoint[2] <= d + SKIN;
  if ((!hit.inside || axisInSolid) &&
      n[0] * hit.point[0] + n[1] * hit.point[1] + n[2] * hit.point[2] <= d + WEDGE_SOLID_EPS) return hit;

  // Over the slope: the closest segment point to the plane is the endpoint with the
  // smallest dot(n, P) — the foot when the slope faces up.
  const P = [p[0], p[1] + (n[1] > 0 ? -SEG_HALF : (n[1] < 0 ? SEG_HALF : 0)), p[2]];
  const dist = n[0] * P[0] + n[1] * P[1] + n[2] * P[2] - d;
  // Same one-tick bound as the box branch: this push is always perpendicular to the slope
  // face, so it can only ever pop the capsule out onto the ramp — but a capsule teleported
  // deep into the solid is still 11 studs under a tall ramp's surface, and that is not a
  // move one tick may make.
  const depth = Math.min(radius - dist, maxDepenetration(p, radius));
  if (depth <= 0) return null;
  const proj = [P[0] - n[0] * dist, P[1] - n[1] * dist, P[2] - n[2] * dist];
  const l = boxToLocal(proj, record.obb.center, record.obb.quat);
  const half = record.obb.half;
  for (let i = 0; i < 3; i++) if (Math.abs(l[i]) > half[i] + WEDGE_SLACK) return null;
  return { normal: [n[0], n[1], n[2]], depth, point: proj };
}

function penetrationFor(record, p, radius) {
  switch (record.kind) {
    case "aabb": {
      const mn = record.aabb.min, mx = record.aabb.max;
      const center = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
      const half = [(mx[0] - mn[0]) / 2, (mx[1] - mn[1]) / 2, (mx[2] - mn[2]) / 2];
      return boxPenetration(p, radius, center, half, null);
    }
    case "obb": return boxPenetration(p, radius, record.obb.center, record.obb.half, record.obb.quat);
    case "sphere": return spherePenetration(p, radius, record.sphere);
    case "cylinder": return cylinderPenetration(p, radius, record.cylinder);
    case "wedge": return wedgePenetration(p, radius, record);
    default: return null;
  }
}

// Deepest non-sensor contact against a capsule centered at `p` (spec 03 §5.6 steps
// 7-8). Iteration follows the broadphase's insertion order, so a fixed input sequence
// resolves identically every run (determinism, spec 03 §7).
function deepestContact(p, radius) {
  const b = capsuleBounds(p, radius, QUERY_INFLATE);
  const ids = query(b.min, b.max);
  let best = null;
  for (let i = 0; i < ids.length; i++) {
    const record = colliders.get(ids[i]);
    if (!record || record.isSensor) continue;
    const hit = penetrationFor(record, p, radius);
    if (!hit) continue;
    if (!best || hit.depth > best.depth) {
      best = { normal: hit.normal, depth: hit.depth, point: hit.point, colliderId: ids[i], record };
    }
  }
  return best;
}

// ---- per-tick phases (spec 03 §5.6, numbered as in the spec) ------------------------

// Steps 2-3: camera-relative wish direction (the ONLY place camera yaw is applied) and
// the instant, un-ramped horizontal velocity.
function applyWish() {
  const mv = input && typeof input.getMoveVector === "function" ? input.getMoveVector() : null;
  const mx = mv && Number.isFinite(mv.x) ? mv.x : 0;
  const mz = mv && Number.isFinite(mv.z) ? mv.z : 0;
  const camYaw = camera && typeof camera.getYaw === "function" ? camera.getYaw() : 0;
  const cos = Math.cos(camYaw), sin = Math.sin(camYaw);
  // A heading t means the direction (sin t, cos t) everywhere in this engine, so
  // camera-forward is (sin, cos) and camera-RIGHT is forward x up = (-cos, sin).
  // camera.js already writes that same vector for the shift-lock offset ("right of the
  // look direction = (cos yaw, 0, -sin yaw)", written there in ORBIT yaw, which is
  // getYaw() - PI). Spec 03 §5.6 step 2 had the strafe term as +moveX*cos / -moveX*sin,
  // which is camera-LEFT: holding D walked the avatar left, and both strafe probes in
  // the suite had been aimed to match it. Spec amended in this commit; moveX = +1 is
  // the camera's right, per spec 02 §5.4's control-space contract.
  let wx = mz * sin - mx * cos;
  let wz = mz * cos + mx * sin;
  const len = Math.sqrt(wx * wx + wz * wz);
  if (len > 1) { wx /= len; wz /= len; }
  const speed = effectTimer > 0 ? effectSpeed : baseWalkSpeed;
  vel[0] = wx * speed;
  vel[2] = wz * speed;
}

// Step 4: moving-platform / spinner carry. Position only — the avatar's yaw is never
// rotated by the platform (binding).
function applyCarry(dt) {
  if (!grounded || groundColliderId === null) return;
  const record = colliders.get(groundColliderId);
  const m = record && record.motion;
  if (!m) return;
  const lv = m.linearVel;
  if (lv) { pos[0] += lv[0] * dt; pos[1] += lv[1] * dt; pos[2] += lv[2] * dt; }
  if (m.angularVel) rotateAbout(m.axis || "y", m.pivot || [0, 0, 0], m.angularVel * dt);
}

function rotateAbout(axis, pivot, deg) {
  const a = deg * DEG;
  const s = Math.sin(a), c = Math.cos(a);
  const dx = pos[0] - pivot[0], dy = pos[1] - pivot[1], dz = pos[2] - pivot[2];
  if (axis === "x") {
    pos[1] = pivot[1] + dy * c - dz * s;
    pos[2] = pivot[2] + dy * s + dz * c;
  } else if (axis === "z") {
    pos[0] = pivot[0] + dx * c - dy * s;
    pos[1] = pivot[1] + dx * s + dy * c;
  } else {
    pos[0] = pivot[0] + dx * c + dz * s;
    pos[2] = pivot[2] - dx * s + dz * c;
  }
}

// Step 5: coyote time, jump buffering, the jump itself. Both windows are counted in
// FRAMES (spec 03 §6: COYOTE/BUFFER = 6 frames = 100 ms), never wall-clock.
function applyJump() {
  if (grounded) coyoteFrames = COYOTE;
  else if (coyoteFrames > 0) coyoteFrames--;
  const pressed = input && typeof input.wasPressed === "function" ? !!input.wasPressed("jump") : false;
  if (pressed) bufferFrames = BUFFER;
  else if (bufferFrames > 0) bufferFrames--;
  if (bufferFrames <= 0 || !(grounded || coyoteFrames > 0)) return false;
  vel[1] = jumpPower;
  grounded = false;
  groundColliderId = null;
  coyoteFrames = 0;
  bufferFrames = 0;
  playSfx("jump");
  return true;
}

// Step 6. Records the velocity change actually applied (the TERMINAL clamp can make it
// smaller than gravity*dt) so step 8 can integrate position with the midpoint velocity.
function applyGravity(dt) {
  const before = vel[1];
  vel[1] -= gravity * dt;
  if (vel[1] < -TERMINAL) vel[1] = -TERMINAL;
  gravityDy = vel[1] - before;
}

// Step 7.
function moveHorizontal(dt) {
  pos[0] += vel[0] * dt;
  pos[2] += vel[2] * dt;
  for (let i = 0; i < SLIDE_ITERS; i++) {
    const c = deepestContact(pos, CAPSULE_RADIUS);
    if (!c) break;
    contactIds.add(c.colliderId);
    if (c.normal[1] >= SLOPE_COS) break;   // floors are the vertical phase's job
    if (tryStepUp(c)) continue;
    pushOutOfWall(c);
  }
}

function tryStepUp(c) {
  if (!grounded) return false;
  const rise = computeWorldAabb(c.record).max[1] - (pos[1] - FEET_OFFSET);
  if (rise <= 0 || rise > STEP_HEIGHT + STEP_EPS) return false;
  const lifted = [pos[0], pos[1] + rise + SKIN, pos[2]];
  if (deepestContact(lifted, CAPSULE_RADIUS)) return false;
  pos[1] = lifted[1];
  return true;
}

function pushOutOfWall(c) {
  let nx = c.normal[0], ny = 0, nz = c.normal[2];
  const flat = Math.sqrt(nx * nx + nz * nz);
  if (flat < FLAT_MIN) { nx = c.normal[0]; ny = c.normal[1]; nz = c.normal[2]; }
  else { nx /= flat; nz /= flat; }
  const push = c.depth + SKIN;
  pos[0] += nx * push;
  pos[1] += ny * push;
  pos[2] += nz * push;
  const vn = vel[0] * nx + vel[1] * ny + vel[2] * nz;
  if (vn < 0) { vel[0] -= nx * vn; vel[1] -= ny * vn; vel[2] -= nz * vn; }
}

// Step 8.
// Vertical position integrates with the MIDPOINT velocity — the trapezoid (velocity-
// Verlet) form `pos.y += (velBeforeGravity + vel.y)/2 * dt`, written as
// `vel.y - gravityDy/2` so that a wall push which changed vel.y between steps 6 and 8
// (a ceiling clip during the horizontal slide) is respected rather than overridden by a
// stale pre-gravity value. It is exact for constant acceleration, which is what makes
// the discrete jump apex 6.371 u = JUMP_POWER²/(2*GRAVITY): semi-implicit Euler
// undershoots to 5.96, and spec 12 §5.2.6's maxJumpGap() — the helper spec 08's R3 gate
// uses to certify that every obby stage is completable — bakes in 6.371. Whenever
// gravity was not applied this tick (grounded motion, and the post-resolve iterations)
// gravityDy is 0 and this reduces bit-exactly to the plain `pos.y += vel.y * dt`.
function moveVertical(dt) {
  pos[1] += (vel[1] - gravityDy / 2) * dt;
  for (let i = 0; i < VERT_ITERS; i++) {
    const c = deepestContact(pos, CAPSULE_RADIUS);
    if (!c) break;
    contactIds.add(c.colliderId);
    const ny = c.normal[1];
    if (ny >= SLOPE_COS) {
      pos[1] += c.depth;
      vel[1] = 0;
      grounded = true;
      groundColliderId = c.colliderId;
    } else if (ny <= CEIL_NY) {
      pushAlongNormal(c);
      if (vel[1] > 0) vel[1] = 0;
    } else {
      // Too steep to stand on: depenetrate, project velocity onto the plane, and leave
      // `grounded` alone so gravity keeps pulling — that is the slide.
      pushAlongNormal(c);
      const vn = vel[0] * c.normal[0] + vel[1] * c.normal[1] + vel[2] * c.normal[2];
      if (vn < 0) {
        vel[0] -= c.normal[0] * vn;
        vel[1] -= c.normal[1] * vn;
        vel[2] -= c.normal[2] * vn;
      }
    }
  }
}

function pushAlongNormal(c) {
  const push = c.depth + SKIN;
  pos[0] += c.normal[0] * push;
  pos[1] += c.normal[1] * push;
  pos[2] += c.normal[2] * push;
}

// Step 9. Slope-aware: the spec's `gap = hit.point.y − feetY` is measured against the
// point straight below the capsule axis, but on a slope the feet rest MAX_HOVER-style
// above that point (see hoverFor / the derived-constants note above). Comparing the raw
// gap to SNAP_DIST therefore stops qualifying past acos(1/1.25) ≈ 36.9°, and the
// FEET_OFFSET + SNAP_DIST ray stops reaching the surface at the very same angle (both
// break where the hover first exceeds SNAP_DIST). That made `grounded` — and with it
// platform carry and conveyor push, which gate on it — flicker off on alternate ticks
// for an avatar standing still on any walkable slope steeper than ~37°. Correcting the
// ray's reach and the gap test by the same hover term fixes both; on flat ground
// ny = 1 → hover = 0 and every line below is the §5.6 step 9 text verbatim.
function hoverFor(ny) {
  return CAPSULE_RADIUS * (1 / ny - 1);
}

function groundSnap(wasGrounded, jumped) {
  if (!wasGrounded || jumped || vel[1] > 0) return;
  const hit = raycast(pos, [0, -1, 0], SNAP_RAY);
  if (hit && hit.normal[1] >= SLOPE_COS) {
    const restY = hit.point[1] + hoverFor(hit.normal[1]);   // where the feet rest here
    const gap = restY - (pos[1] - FEET_OFFSET);
    if (gap >= -SNAP_DIST && gap <= SNAP_DIST) {
      pos[1] = restY + FEET_OFFSET;
      grounded = true;
      groundColliderId = hit.colliderId;
      vel[1] = 0;
      contactIds.add(hit.colliderId);
      return;
    }
  }
  // No *qualifying* hit. Spec 03 §5.6 step 9 words this branch "if no hit", but a hit
  // out of snap range or too steep to stand on has to land here too — otherwise
  // `grounded` would stay stale-true and the avatar would hover on a 60-degree wedge
  // instead of sliding down it (§7 criterion 15).
  grounded = false;
  groundColliderId = null;
}

// Step 10: conveyors push positionally, so jumping off one does not fling (binding).
function conveyorPush(dt) {
  if (!grounded || groundColliderId === null) return;
  const record = colliders.get(groundColliderId);
  const sv = record && record.motion ? record.motion.surfaceVel : null;
  if (!sv || (sv[0] === 0 && sv[1] === 0 && sv[2] === 0)) return;
  pos[0] += sv[0] * dt;
  pos[1] += sv[1] * dt;
  pos[2] += sv[2] * dt;
}

// Step 12 (step 11 is intentionally absent: no avatar kill plane in the engine).
function buildContacts() {
  if (grounded && groundColliderId !== null) contactIds.add(groundColliderId);
  const radius = CAPSULE_RADIUS + TOUCH_PAD;
  const b = capsuleBounds(pos, radius, 0);
  const ids = query(b.min, b.max);
  for (let i = 0; i < ids.length; i++) {
    const record = colliders.get(ids[i]);
    if (!record || !record.isSensor) continue;
    if (penetrationFor(record, pos, radius)) contactIds.add(ids[i]);
  }
  contactParts = new Set();
  for (const id of contactIds) {
    const record = colliders.get(id);
    if (record && record.partId != null) contactParts.add(record.partId);
  }
}

// Step 13.
function updateFacing(dt) {
  if (camera && typeof camera.isShiftLocked === "function" && camera.isShiftLocked()) {
    // Shift-lock: the avatar faces where the camera looks (spec 02 §5.3 — "physics
    // reads isShiftLocked() and yaws the avatar to getYaw() each step").
    if (typeof camera.getYaw === "function") yaw = wrapAngle(camera.getYaw());
    return;
  }
  if (Math.sqrt(vel[0] * vel[0] + vel[2] * vel[2]) <= FACE_MIN_SPEED) return;
  const target = Math.atan2(vel[0], vel[2]);
  const maxStep = TURN_SPEED * DEG * dt;
  const d = clampNum(wrapAngle(target - yaw), -maxStep, maxStep);
  yaw = wrapAngle(yaw + d);
}

// Step 14: the rig origin is the FEET.
function syncAvatar() {
  if (!attached) return;
  attached.position.set(pos[0], pos[1] - FEET_OFFSET, pos[2]);
  attached.rotation.y = yaw;
}

// Sim-tick countdown that lands exactly on 0 after duration/dt ticks: subtracting
// 1/60 sixty times from 1.0 leaves ~1e-16, which would otherwise stretch every timed
// window (death delay, grace, teleport) by one extra tick.
function decayTimer(t, dt) {
  if (t <= 0) return 0;
  const next = t - dt;
  return next > TIMER_EPS ? next : 0;
}

function tickTimers(dt) {
  // Every gameplay timer here advances on sim ticks only (ARCHITECTURE §5), and runs
  // whether or not the character is frozen so grace/teleport windows always expire.
  graceTimer = decayTimer(graceTimer, dt);
  teleportTimer = decayTimer(teleportTimer, dt);
  effectTimer = decayTimer(effectTimer, dt);
}

function stepCharacter(dt) {
  prevPos[0] = pos[0]; prevPos[1] = pos[1]; prevPos[2] = pos[2];
  prevYaw = yaw;
  tickTimers(dt);
  if (dying) {
    contactIds = new Set();   // a hidden avatar touches nothing
    deathTimer = decayTimer(deathTimer, dt);
    if (deathTimer <= 0) relocateToCheckpoint();
    return;
  }
  if (!enabled) return;

  contactIds = new Set();
  const wasGrounded = grounded;
  applyWish();
  applyCarry(dt);
  const jumped = applyJump();
  gravityDy = 0;                 // stays 0 when grounded: step 8 then integrates plainly
  if (!grounded) applyGravity(dt);
  moveHorizontal(dt);
  moveVertical(dt);
  if (skipSnap) skipSnap = false;
  else groundSnap(wasGrounded, jumped);
  conveyorPush(dt);
  buildContacts();
  updateFacing(dt);
  syncAvatar();
}

function dispatchContacts() {
  const entered = [];
  const stayed = [];
  const exited = [];
  for (const id of contactIds) (prevContactIds.has(id) ? stayed : entered).push(id);
  for (const id of prevContactIds) if (!contactIds.has(id)) exited.push(id);
  prevContactIds = contactIds;
  if (contactHandler) contactHandler(entered, stayed, exited);
}

// ---- death & respawn (spec 03 §5.6.1) ----------------------------------------------

function playSfx(name) {
  if (audio && typeof audio.playSfx === "function") audio.playSfx(name);
}

function emit(name, payload) {
  if (events && typeof events.emit === "function") events.emit(name, payload);
}

function zeroVelocity() {
  vel[0] = 0; vel[1] = 0; vel[2] = 0;
}

function markRenderJumpCut() {
  // Relocations are instant: collapse prev onto cur so getRenderTransform never lerps
  // the avatar across the world (spec 03 §5.9; the camera jump-cuts on the same events).
  prevPos[0] = pos[0]; prevPos[1] = pos[1]; prevPos[2] = pos[2];
  prevYaw = yaw;
}

function setFeet(feetPos) {
  pos[0] = feetPos[0];
  pos[1] = feetPos[1] + FEET_OFFSET;
  pos[2] = feetPos[2];
}

function relocateToCheckpoint() {
  setFeet(checkpoint.feetPos);
  zeroVelocity();
  grounded = false;
  groundColliderId = null;
  coyoteFrames = 0;
  bufferFrames = 0;
  effectTimer = 0;              // speed-pad boosts cancel on respawn (§5.6.1)
  skipSnap = false;
  dying = false;
  deathTimer = 0;
  graceTimer = RESPAWN_GRACE;
  contactIds = new Set();
  if (attached) attached.visible = true;
  markRenderJumpCut();
  syncAvatar();
  emit("player:respawned", { position: feetOf(pos) });
}

// ---- public API (spec 03 §4.1) -------------------------------------------------------

// `input` and `camera` are NOT in spec 03 §4.1's init signature, but §5.6 step 2 needs
// input.getMoveVector() / input.wasPressed("jump") and camera.getYaw(), and both modules
// are factory singletons (spec 02 §5.3/§5.4) that cannot be imported. They are accepted
// here in the same dependency bag; when absent the character reads no input and a zero
// camera yaw. (Reported as a spec gap by M1-T10.)
export function init(deps = {}) {
  audio = deps.audio || null;
  events = deps.events || null;
  input = deps.input || null;
  camera = deps.camera || null;
}

// The binding tick order of spec 03 §5.5. The loop calls ONLY this — never parts.update.
// Phases 1-2 live in parts.js (movers/behavior timers, then unanchored-part dynamics,
// §5.8); they are called through the module namespace so physics.js still steps cleanly
// when parts.js has no world loaded.
export function step(dt) {
  if (typeof parts.update === "function") parts.update(dt);
  if (typeof parts.stepDynamics === "function") parts.stepDynamics(dt);
  stepCharacter(dt);
  dispatchContacts();
  // Phase 5 housekeeping: the character's prev transform is stored at tick start
  // (§5.6.14); despawning parts below PART_DESPAWN_Y belongs to parts.js (§5.8 step 5).
}

export function attachAvatar(object3D) {
  attached = object3D || null;
  syncAvatar();
}

// `yawDeg` is in DEGREES: place.json's spawnYaw (spec 04 §3.3) is fed straight through
// by the loader, and the ctx surface takes degrees for angles (spec 04 §5.7).
export function spawnAt(feetPos, yawDeg = 0) {
  spawnFeet = cloneVec3(feetPos);
  checkpoint = { index: -1, feetPos: cloneVec3(feetPos) };
  setFeet(feetPos);
  zeroVelocity();
  yaw = wrapAngle(yawDeg * DEG);
  grounded = false;
  groundColliderId = null;
  coyoteFrames = 0;
  bufferFrames = 0;
  effectTimer = 0;
  dying = false;
  deathTimer = 0;
  graceTimer = 0;
  teleportTimer = 0;
  skipSnap = false;
  contactIds = new Set();
  prevContactIds = new Set();
  contactParts = new Set();
  if (attached) attached.visible = true;
  markRenderJumpCut();
  syncAvatar();
}

// Instant move, zero velocity, no death; ground-snap is skipped for one tick so the
// destination surface cannot yank the capsule back. Arms the global teleport cooldown
// (spec 03 §5.7 "teleport": both cooldowns exist). `yawDeg` in degrees.
export function teleport(feetPos, yawDeg) {
  setFeet(feetPos);
  zeroVelocity();
  if (Number.isFinite(yawDeg)) yaw = wrapAngle(yawDeg * DEG);
  groundColliderId = null;   // never carry over the old ground's motion
  skipSnap = true;
  teleportTimer = TELEPORT_COOLDOWN;
  markRenderJumpCut();
  syncAvatar();
}

export function respawn() {
  relocateToCheckpoint();
}

export function kill(cause) {
  if (dying || graceTimer > 0) return;
  dying = true;
  deathTimer = DEATH_DELAY;
  emit("player:died", { cause, position: feetOf(pos) });
  playSfx("oof");
  if (attached) attached.visible = false;
}

// UNCONDITIONAL and positional: the checkpoint behavior's monotonic `order` gate lives
// in parts.js, so games may move the respawn point backward (spec 03 §4.1).
export function setCheckpoint(feetPos) {
  checkpoint = { index: checkpoint.index + 1, feetPos: cloneVec3(feetPos) };
}

export function getCheckpoint() {
  return { feetPos: cloneVec3(checkpoint.feetPos) };
}

export function getContacts() {
  return contactParts;
}

export function getStandingOn() {
  if (!grounded || groundColliderId === null) return null;
  const record = colliders.get(groundColliderId);
  return record && record.partId != null ? record.partId : null;
}

export function setGravity(v) {
  if (Number.isFinite(v)) gravity = v;
}

export function getGravity() {
  return gravity;
}

// Dynamics state for unanchored parts lives with parts.js (spec 03 §5.8, task M1-T11);
// this is the entry point spec 03 §4.1 names, delegating to it.
export function setPartVelocity(partId, v) {
  if (typeof parts.setPartVelocity === "function") {
    parts.setPartVelocity(partId, v);
    return;
  }
  console.warn("physics.setPartVelocity: no dynamics owner for part", partId);
}

export function setWalkSpeed(v) {
  if (Number.isFinite(v)) baseWalkSpeed = clampNum(v, 0, 100);   // ctx clamp, spec 04 §5.7
}

export function getWalkSpeed() {
  return baseWalkSpeed;
}

export function setJumpPower(v) {
  if (Number.isFinite(v)) jumpPower = clampNum(v, 0, 200);       // ctx clamp, spec 04 §5.7
}

export function getJumpPower() {
  return jumpPower;
}

// Timed walk-speed override for the `speed` pad behavior (spec 03 §5.7). NOT one of
// §4.1's named exports: parts.js owns the pad, physics owns effectSpeed/effectTimer
// (§5.6 state), and no setter is specced. Reported as a spec gap by M1-T10.
export function setSpeedEffect(walkSpeed, durationS) {
  if (!Number.isFinite(walkSpeed) || !Number.isFinite(durationS)) return;
  effectSpeed = walkSpeed;
  effectTimer = durationS;
}

// Remaining seconds of the global anti-ping-pong window armed by every teleport (spec
// 03 §5.7 "teleport"); the teleport behavior ignores touches while this is > 0. Also
// not one of §4.1's named exports — same reported spec gap.
export function getTeleportCooldown() {
  return teleportTimer;
}

export function setEnabled(v) {
  enabled = !!v;
}

export function getPosition() {
  return cloneVec3(pos);
}

export function getVelocity() {
  return cloneVec3(vel);
}

export function isGrounded() {
  return grounded;
}

// Capsule CENTER + yaw in radians — what the renderer and camera consume (spec 02 §5.3
// takes targetPos as the capsule center; the avatar group is placed at the feet).
export function getRenderTransform(alpha) {
  const a = clampNum(Number.isFinite(alpha) ? alpha : 1, 0, 1);
  return {
    position: [
      prevPos[0] + (pos[0] - prevPos[0]) * a,
      prevPos[1] + (pos[1] - prevPos[1]) * a,
      prevPos[2] + (pos[2] - prevPos[2]) * a,
    ],
    yaw: wrapAngle(prevYaw + wrapAngle(yaw - prevYaw) * a),
  };
}

// Sets velocity outright (bounce pads, games). Un-grounds and clears the jump buffer so
// a buffered press cannot double-launch off a bounce pad (spec 03 §5.7 "bounce").
export function launch(v) {
  vel[0] = v[0]; vel[1] = v[1]; vel[2] = v[2];
  grounded = false;
  groundColliderId = null;
  bufferFrames = 0;
}

export function setContactHandler(fn) {
  contactHandler = typeof fn === "function" ? fn : null;
}

export function getDebugState() {
  return {
    position: cloneVec3(pos),
    velocity: cloneVec3(vel),
    grounded,
    checkpointIndex: checkpoint.index,
    colliderCount: colliders.size,
    dying,
  };
}

export function clear() {
  clearColliders();
  zeroVelocity();
  grounded = false;
  groundColliderId = null;
  coyoteFrames = 0;
  bufferFrames = 0;
  baseWalkSpeed = WALK_SPEED;
  jumpPower = JUMP_POWER;
  effectSpeed = WALK_SPEED;
  effectTimer = 0;
  gravity = GRAVITY;              // reset on Place load (spec 04 §5.7)
  dying = false;
  deathTimer = 0;
  graceTimer = 0;
  teleportTimer = 0;
  skipSnap = false;
  enabled = true;
  spawnFeet = [0, 0, 0];
  checkpoint = { index: -1, feetPos: [0, 0, 0] };
  contactIds = new Set();
  prevContactIds = new Set();
  contactParts = new Set();
  setFeet(spawnFeet);
  markRenderJumpCut();
  if (attached) attached.visible = true;
}
