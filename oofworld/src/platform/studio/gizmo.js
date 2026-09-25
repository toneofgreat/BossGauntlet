// src/platform/studio/gizmo.js — Oof Studio's move/rotate/scale handles: the meshes,
// the hit test, and the drag math that turns a pointer ray into a snapped number.
// Spec 11 §5.5's gizmo table.
//
// World axes only, no local mode, no plane-drag quads (§10 defers both). Three arrows
// beat six handles when the person holding the phone is eight years old, and the two
// things they actually need — "move it that way" and "make it taller" — are both one
// unambiguous drag.

import * as THREE from "../../../assets/vendor/three.module.js";

// ---- tuning constants, spec 11 §6 -------------------------------------------------
const GIZMO_SCREEN_SCALE = 0.12; // × distance to camera
const GIZMO_HIT_R = 0.35; // × gizmoScale, desktop
const GIZMO_HIT_R_TOUCH = 0.8; // × gizmoScale, coarse pointers
const ROT_SNAP = 15; // degrees
const RENDER_ORDER = 950;

const AXIS_COLORS = { x: "#e5484d", y: "#46a758", z: "#3e63dd" };
const ACTIVE_COLOR = "#ffffff";
const UNIFORM_COLOR = "#ffffff";

const AXIS_VECTORS = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

function handleMaterial(hex) {
  // depthTest:false + a high renderOrder: the handles are a tool, not scenery, and a
  // gizmo you cannot grab because a part is in front of it is a gizmo that does not work.
  return new THREE.MeshBasicMaterial({ color: hex, depthTest: false, toneMapped: false });
}

// Hit volumes are real geometry the raycaster can see but the renderer skips
// (material.visible = false). They are deliberately much fatter than the drawn handle
// — 0.8 × gizmoScale on touch is roughly a fingertip.
function hitMaterial() {
  return new THREE.MeshBasicMaterial({ visible: false });
}

function orientToAxis(object, axis) {
  if (axis === "x") object.rotation.set(0, 0, -Math.PI / 2);
  else if (axis === "z") object.rotation.set(Math.PI / 2, 0, 0);
}

// createGizmo(scene) -> gizmo — §5.5.
export function createGizmo(scene, opts = {}) {
  const touch = !!opts.touch;
  const root = new THREE.Group();
  root.name = "oof-studio-gizmo";
  root.renderOrder = RENDER_ORDER;
  root.visible = false;
  scene.add(root);

  const groups = { move: new THREE.Group(), rotate: new THREE.Group(), scale: new THREE.Group() };
  for (const group of Object.values(groups)) {
    group.visible = false;
    root.add(group);
  }

  const drawn = []; // { handle, mesh, color } — recoloured on hover/drag
  const hits = []; // invisible meshes the raycaster sees; userData.handle names them

  function addDrawn(group, handle, mesh, color) {
    mesh.renderOrder = RENDER_ORDER;
    group.add(mesh);
    drawn.push({ handle, mesh, color });
  }

  function addHit(group, handle, mesh) {
    mesh.userData.handle = handle;
    group.add(mesh);
    hits.push(mesh);
  }

  // ---- move: shaft + cone tip per axis, total length 1.0 gizmo unit --------------
  const shaftGeom = new THREE.CylinderGeometry(0.03, 0.03, 0.8, 8);
  const tipGeom = new THREE.ConeGeometry(0.09, 0.22, 12);
  for (const axis of ["x", "y", "z"]) {
    const color = AXIS_COLORS[axis];
    const arrow = new THREE.Group();
    const shaft = new THREE.Mesh(shaftGeom, handleMaterial(color));
    shaft.position.y = 0.5;
    const tip = new THREE.Mesh(tipGeom, handleMaterial(color));
    tip.position.y = 1.0;
    arrow.add(shaft, tip);
    orientToAxis(arrow, axis);
    groups.move.add(arrow);
    drawn.push({ handle: axis, mesh: shaft, color }, { handle: axis, mesh: tip, color });
    shaft.renderOrder = RENDER_ORDER;
    tip.renderOrder = RENDER_ORDER;

    const hitGeom = new THREE.SphereGeometry(touch ? GIZMO_HIT_R_TOUCH : GIZMO_HIT_R, 8, 6);
    const hit = new THREE.Mesh(hitGeom, hitMaterial());
    hit.position.copy(AXIS_VECTORS[axis]).multiplyScalar(0.95);
    addHit(groups.move, axis, hit);
  }

  // ---- rotate: one ring per axis, radius 1.0 ------------------------------------
  for (const axis of ["x", "y", "z"]) {
    const color = AXIS_COLORS[axis];
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.02, 6, 48), handleMaterial(color));
    // A torus is born in the XY plane (hole along Z); the ring for an axis must have
    // its hole ALONG that axis, so x and y get a quarter turn and z is already right.
    if (axis === "x") ring.rotation.y = Math.PI / 2;
    else if (axis === "y") ring.rotation.x = Math.PI / 2;
    addDrawn(groups.rotate, axis, ring, color);

    const hitRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.0, touch ? GIZMO_HIT_R_TOUCH * 0.5 : GIZMO_HIT_R * 0.5, 6, 32),
      hitMaterial(),
    );
    hitRing.rotation.copy(ring.rotation);
    addHit(groups.rotate, axis, hitRing);
  }

  // ---- scale: a cube per axis plus the white uniform cube at the pivot -----------
  const cubeGeom = new THREE.BoxGeometry(0.16, 0.16, 0.16);
  for (const axis of ["x", "y", "z"]) {
    const color = AXIS_COLORS[axis];
    const cube = new THREE.Mesh(cubeGeom, handleMaterial(color));
    cube.position.copy(AXIS_VECTORS[axis]);
    addDrawn(groups.scale, axis, cube, color);

    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(touch ? GIZMO_HIT_R_TOUCH : GIZMO_HIT_R, 8, 6),
      hitMaterial(),
    );
    hit.position.copy(AXIS_VECTORS[axis]);
    addHit(groups.scale, axis, hit);

    const stem = new THREE.Mesh(shaftGeom, handleMaterial(color));
    stem.position.y = 0.5;
    const stemHolder = new THREE.Group();
    stemHolder.add(stem);
    orientToAxis(stemHolder, axis);
    groups.scale.add(stemHolder);
    stem.renderOrder = RENDER_ORDER;
    drawn.push({ handle: axis, mesh: stem, color });
  }
  const uniformCube = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), handleMaterial(UNIFORM_COLOR));
  addDrawn(groups.scale, "uniform", uniformCube, UNIFORM_COLOR);
  const uniformHit = new THREE.Mesh(
    new THREE.SphereGeometry((touch ? GIZMO_HIT_R_TOUCH : GIZMO_HIT_R) * 0.7, 8, 6),
    hitMaterial(),
  );
  addHit(groups.scale, "uniform", uniformHit);

  // ---- state --------------------------------------------------------------------
  let mode = null; // "move" | "rotate" | "scale" | null
  let scale = 1; // gizmoScale, recomputed every frame from the camera distance
  let highlighted = null;
  let drag = null; // { handle, mode, axis, t0, startVec }

  function setHighlight(handle) {
    if (highlighted === handle) return;
    highlighted = handle;
    for (const entry of drawn) {
      entry.mesh.material.color.set(entry.handle === handle ? ACTIVE_COLOR : entry.color);
    }
  }

  function setMode(next) {
    mode = next === "move" || next === "rotate" || next === "scale" ? next : null;
    for (const [name, group] of Object.entries(groups)) group.visible = name === mode;
    root.visible = mode !== null && root.userData.wanted === true;
  }

  function setVisible(v) {
    root.userData.wanted = !!v;
    root.visible = !!v && mode !== null;
  }

  function setPivot(p) {
    root.position.set(p[0], p[1], p[2]);
  }

  // update(camera) — screen-constant size (§5.5): the gizmo grows with distance so it
  // stays the same number of pixels wide however far the fly cam has drifted.
  function update(camera) {
    const dist = camera.position.distanceTo(root.position);
    scale = Math.max(0.05, dist * GIZMO_SCREEN_SCALE);
    root.scale.setScalar(scale);
    root.updateMatrixWorld();
  }

  // hitTest(raycaster) -> "x" | "y" | "z" | "uniform" | null
  function hitTest(raycaster) {
    if (mode === null || !root.visible) return null;
    const candidates = hits.filter((mesh) => mesh.parent === groups[mode]);
    const found = raycaster.intersectObjects(candidates, false);
    return found.length ? found[0].object.userData.handle : null;
  }

  // ---- drag math (§5.5's table) --------------------------------------------------

  // Screen-right in world space: the uniform scale cube has no axis of its own, so it
  // is dragged along whatever "right" means from where the camera is. JUDGEMENT CALL —
  // §5.5 gives the formula (factor = 1 + delta/2) but never says which delta.
  function cameraRight(camera) {
    return new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  }

  // Closest-point parameter of the pointer ray onto the line through the pivot along
  // dirVec (§5.5: "closest-point parameter t of the pointer ray onto the axis line").
  // Returns null when the ray is near-parallel to that line, where the parameter is
  // numerically meaningless — the caller keeps the previous value instead of jumping.
  function paramAlong(ray, dirVec) {
    const w0 = new THREE.Vector3().copy(root.position).sub(ray.origin);
    const b = dirVec.dot(ray.direction);
    const denom = 1 - b * b;
    if (Math.abs(denom) < 1e-6) return null;
    const d = dirVec.dot(w0);
    const e = ray.direction.dot(w0);
    return (b * e - d) / denom;
  }

  // Ray/plane hit for rotation: the plane through the pivot with `axis` as its normal.
  function planeVector(ray, axis) {
    const normal = AXIS_VECTORS[axis];
    const denom = normal.dot(ray.direction);
    if (Math.abs(denom) < 1e-6) return null;
    const t = normal.dot(new THREE.Vector3().copy(root.position).sub(ray.origin)) / denom;
    if (t <= 0) return null;
    const hit = new THREE.Vector3().copy(ray.direction).multiplyScalar(t).add(ray.origin);
    return hit.sub(root.position).projectOnPlane(normal);
  }

  // startDrag(handle, ray, camera) -> bool
  function startDrag(handle, ray, camera) {
    if (mode === null) return false;
    setHighlight(handle);
    if (mode === "rotate") {
      const startVec = planeVector(ray, handle);
      if (!startVec || startVec.lengthSq() < 1e-8) return false;
      drag = { handle, mode, startVec, lastDeg: 0 };
      return true;
    }
    const dirVec = handle === "uniform" ? cameraRight(camera) : AXIS_VECTORS[handle];
    const t0 = paramAlong(ray, dirVec);
    if (t0 === null) return false;
    drag = { handle, mode, dirVec, t0, last: 0 };
    return true;
  }

  // drag(ray, grid) -> { mode, handle, snapped } | null. `snapped` is studs for
  // move/scale and degrees for rotate; the editor applies it to the doc.
  function dragTo(ray, grid) {
    if (!drag) return null;
    if (drag.mode === "rotate") {
      const now = planeVector(ray, drag.handle);
      if (!now || now.lengthSq() < 1e-8) return { mode: "rotate", handle: drag.handle, snapped: drag.lastDeg };
      const normal = AXIS_VECTORS[drag.handle];
      const cross = new THREE.Vector3().crossVectors(drag.startVec, now);
      const deg = Math.atan2(cross.dot(normal), drag.startVec.dot(now)) * 180 / Math.PI;
      drag.lastDeg = Math.round(deg / ROT_SNAP) * ROT_SNAP;
      return { mode: "rotate", handle: drag.handle, snapped: drag.lastDeg };
    }
    const t = paramAlong(ray, drag.dirVec);
    if (t === null) return { mode: drag.mode, handle: drag.handle, snapped: drag.last };
    const delta = t - drag.t0;
    drag.raw = delta;
    drag.last = drag.mode === "scale" && drag.handle === "uniform"
      ? delta // the uniform factor is snapped per-axis by the editor, not here
      : Math.round(delta / grid) * grid;
    return { mode: drag.mode, handle: drag.handle, snapped: drag.last, raw: delta };
  }

  function endDrag() {
    drag = null;
    setHighlight(null);
  }

  function disposeTree(object) {
    object.traverse((node) => {
      if (node.geometry) node.geometry.dispose();
      if (node.material) node.material.dispose();
    });
  }

  return {
    setMode,
    setVisible,
    setPivot,
    update,
    hitTest,
    setHighlight,
    startDrag,
    drag: dragTo,
    endDrag,
    isDragging: () => drag !== null,
    getScale: () => scale,
    dispose() {
      scene.remove(root);
      disposeTree(root);
      drawn.length = 0;
      hits.length = 0;
    },
  };
}
