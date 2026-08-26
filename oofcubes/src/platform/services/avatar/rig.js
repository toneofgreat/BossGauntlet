// The OofRig — spec 05 §5.1: the six-box blocky avatar, its joint pivots, the head's
// six-material front-face canvas texture (§5.3), and the per-rig update that drives the
// animator (§5.2). Rig meshes are NOT Parts and never enter the collider set (§2).

import * as THREE from "../../../../assets/vendor/three.module.js";
// The engine material factory (spec 03 §5.1's plastic/neon/metal/glass/wood/lava
// looks), named as a dependency by spec 05 §2. Its materials are cached and shared
// engine-wide, so dispose() below never disposes them — only the geometry and the face
// texture/material this rig created.
import { getMaterial } from "../../../engine/parts.js";
import { paintFace, DEFAULT_FACE_ID } from "./faces.js";
import { createAnimator, AVATAR_TUNING } from "./animator.js";
import { getItem, DEFAULT_BODY_COLORS } from "./catalog-data.js";

const FACE_CANVAS_SIZE = AVATAR_TUNING.FACE_CANVAS_SIZE;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_MATERIAL = "plastic";
const DEG = Math.PI / 180;

// §5.1 — every limb: its joint pivot in rig-local space (origin = feet centre, +Y up,
// facing -Z), the mesh offset from that pivot, and the box size. Legs 2 + torso 2 +
// head 1 = RIG_HEIGHT (5.0): the head mesh top lands at 4 + 0.5 + 0.5 exactly.
const LIMBS = Object.freeze([
  { key: "leftLeg", pivot: [-0.5, 2, 0], offset: [0, -1, 0], size: [1, 2, 1] },
  { key: "rightLeg", pivot: [0.5, 2, 0], offset: [0, -1, 0], size: [1, 2, 1] },
  { key: "leftArm", pivot: [-1.5, 4, 0], offset: [0, -1, 0], size: [1, 2, 1] },
  { key: "rightArm", pivot: [1.5, 4, 0], offset: [0, -1, 0], size: [1, 2, 1] },
  { key: "head", pivot: [0, 4, 0], offset: [0, 0.5, 0], size: [1.2, 1, 1.2] },
]);
// The torso hangs off the rig root (§5.1's "root [0,3,0]" pivot with a zero mesh
// offset), so it has no entry in `joints` — nothing ever rotates it.
const TORSO = Object.freeze({ center: [0, 3, 0], size: [2, 2, 1] });

// §5.4 anchor points, created here because they are rig structure. attachments.js
// (§5.4, task M2-T12) hangs hat/gear prim groups off them.
const HAT_ANCHOR = [0, 0.5, 0];    // head-local: the top face of the 1-unit head
const GEAR_ANCHOR = [0, -2, 0];    // rightArm-pivot-local: the hand end of the arm

// BoxGeometry material slots run +X, -X, +Y, -Y, +Z, -Z; the rig faces -Z, so the face
// texture belongs to slot 5.
const HEAD_FACE_SLOT = 5;

const LIMB_KEYS = Object.freeze(["head", "torso", "leftArm", "rightArm", "leftLeg", "rightLeg"]);

// A limb color is either a hex literal or a bodycolor item id whose swatch also names
// the material to render it with (§3.1 / §3.5). Unknown values fall back to the
// "Classic Oof" default for that limb — §3.1's "never crash on unknown ids".
function resolveLimb(limbKey, value) {
  if (typeof value === "string" && HEX_RE.test(value)) {
    return { color: value.toLowerCase(), material: DEFAULT_MATERIAL };
  }
  const item = getItem(value);
  const swatch = item && item.type === "bodycolor" && item.appearance ? item.appearance.swatch : null;
  if (swatch) return { color: swatch, material: item.appearance.material || DEFAULT_MATERIAL };
  return { color: DEFAULT_BODY_COLORS[limbKey], material: DEFAULT_MATERIAL };
}

function readColors(state) {
  const src = (state && state.bodyColors) || {};
  const out = {};
  for (const key of LIMB_KEYS) out[key] = resolveLimb(key, src[key]);
  return out;
}

function readEquipped(state) {
  const eq = (state && state.equipped) || {};
  return {
    face: typeof eq.face === "string" && eq.face ? eq.face : DEFAULT_FACE_ID,
    hat: eq.hat || null,
    gear: eq.gear || null,
    aura: eq.aura || null,
    trail: eq.trail || null,
  };
}

function makeMesh(size, position) {
  const geo = new THREE.BoxGeometry(size[0], size[1], size[2]);
  const mesh = new THREE.Mesh(geo, getMaterial(DEFAULT_MATERIAL, DEFAULT_BODY_COLORS.torso, 0));
  mesh.position.set(position[0], position[1], position[2]);
  // Harmless when the quality tier has shadows off — the renderer owns that switch.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeAnchor(name, at) {
  const anchor = new THREE.Object3D();
  anchor.name = name;
  anchor.position.set(at[0], at[1], at[2]);
  return anchor;
}

// The six boxes and the five joint pivots of §5.1's table.
function buildSkeleton() {
  const group = new THREE.Group();
  group.name = "OofRig";
  const joints = {};
  const meshes = { torso: makeMesh(TORSO.size, TORSO.center) };
  group.add(meshes.torso);
  for (const limb of LIMBS) {
    const pivot = new THREE.Group();
    pivot.name = "OofJoint_" + limb.key;
    pivot.position.set(limb.pivot[0], limb.pivot[1], limb.pivot[2]);
    const mesh = makeMesh(limb.size, limb.offset);
    pivot.add(mesh);
    group.add(pivot);
    joints[limb.key] = pivot;
    meshes[limb.key] = mesh;
  }
  return { group, joints, meshes };
}

// §5.3 — the head's front face is a canvas texture; the other five slots share the head
// color, so a head recolor repaints this canvas's background too.
function buildFace() {
  const canvas = document.createElement("canvas");
  canvas.width = FACE_CANVAS_SIZE;
  canvas.height = FACE_CANVAS_SIZE;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { ctx: canvas.getContext("2d"), texture, material: new THREE.MeshLambertMaterial({ map: texture }) };
}

// buildRig(scene, state) -> Rig (§5.1). `scene` may be null for an off-scene rig (the
// Avatar Editor preview builds its own scene and adds the group itself).
export function buildRig(scene, state) {
  const { group, joints, meshes } = buildSkeleton();
  const { ctx: faceCtx, texture: faceTexture, material: faceMaterial } = buildFace();

  const anchors = {
    hat: makeAnchor("HatAnchor", HAT_ANCHOR),
    gear: makeAnchor("GearAnchor", GEAR_ANCHOR),
  };
  meshes.head.add(anchors.hat);
  joints.rightArm.add(anchors.gear);

  const rig = {
    group, joints, meshes, anchors,
    faceId: DEFAULT_FACE_ID,     // the id currently PAINTED (spec 05 §8's probe field)
    gearEquipped: false,         // read by the animator for §5.2 step 5's hold pose
  };
  const animator = createAnimator(rig);

  let colors = null;             // last applied resolved limb colors
  let equipped = null;           // last applied equipped ids
  let flash = null;              // { faceId, remaining } while flashFace is running
  let attachTime = 0;            // sim seconds, drives §5.4 prim spin/bob/flicker

  function paint() {
    const wanted = flash ? flash.faceId : equipped.face;
    rig.faceId = paintFace(faceCtx, wanted, colors.head.color);
    faceTexture.needsUpdate = true;
  }

  function headMaterials(sideMaterial) {
    const slots = [sideMaterial, sideMaterial, sideMaterial, sideMaterial, sideMaterial, sideMaterial];
    slots[HEAD_FACE_SLOT] = faceMaterial;
    return slots;
  }

  function applyColors(next) {
    const headChanged = !colors || colors.head.color !== next.head.color
      || colors.head.material !== next.head.material;
    for (const key of LIMB_KEYS) {
      const prev = colors ? colors[key] : null;
      if (prev && prev.color === next[key].color && prev.material === next[key].material) continue;
      const mat = getMaterial(next[key].material, next[key].color, 0);
      meshes[key].material = key === "head" ? headMaterials(mat) : mat;
    }
    colors = next;
    return headChanged;
  }

  // §5.4 attachments. Lives here rather than in attachments.js (M2-T12's file) because
  // that module does not exist and the Catalog's three accessories are inside SLICE.md's
  // scope — without this, buying the Traffic Cone spends 75 of a starting 100 Oofbux and
  // changes nothing on the avatar. Moving these three functions into attachments.js
  // later is a file move, not a rewrite: they touch only `anchors`, never the rig
  // skeleton, the state or the item schema.
  // SLICE: auras and trails (§5.5, effects.js) are still deferred — no Catalog row in
  // the slice selects one.
  const attached = { hat: null, gear: null }; // { group, prims: [{ mesh, base, spin, bob, flicker }] }

  function primGeometry(prim) {
    const size = Array.isArray(prim.size) ? prim.size : [1, 1, 1];
    const sx = size[0] || 0, sy = size[1] || 0, sz = size[2] || 0;
    switch (prim.shape) {
      // Segment counts are §5.4's: cylinder/cone 16 radial, sphere 12x8, torus 24x8.
      case "cylinder": return new THREE.CylinderGeometry(sx / 2, sx / 2, sy, 16);
      case "cone": return new THREE.ConeGeometry(sx / 2, sy, 16);
      case "sphere": return new THREE.SphereGeometry(sx / 2, 12, 8);
      case "torus": return new THREE.TorusGeometry(sx, sy, 8, 24);
      default: return new THREE.BoxGeometry(sx, sy, sz);
    }
  }

  function buildAttachment(item) {
    const prims = item && item.appearance && Array.isArray(item.appearance.prims)
      ? item.appearance.prims : null;
    if (!prims || !prims.length) return null;
    const group = new THREE.Group();
    group.name = "OofAttach_" + item.id;
    const records = [];
    for (const prim of prims) {
      const mesh = new THREE.Mesh(
        primGeometry(prim),
        getMaterial(prim.material || DEFAULT_MATERIAL, prim.color || "#ffffff", prim.transparency || 0)
      );
      const off = Array.isArray(prim.offset) ? prim.offset : [0, 0, 0];
      const rot = Array.isArray(prim.rotation) ? prim.rotation : [0, 0, 0];
      mesh.position.set(off[0] || 0, off[1] || 0, off[2] || 0);
      // §5.4: "torus lies flat, i.e. rotated so the ring is horizontal before
      // `rotation` applies" — THREE builds it in the XY plane, so tip it onto XZ first.
      const baseX = prim.shape === "torus" ? -Math.PI / 2 : 0;
      mesh.rotation.set(baseX + rot[0] * DEG, rot[1] * DEG, rot[2] * DEG);
      group.add(mesh);
      records.push({
        mesh,
        baseY: mesh.position.y,
        spin: Number(prim.spin) || 0,
        bob: prim.bob && Number.isFinite(prim.bob.amp) ? prim.bob : null,
        flicker: prim.flicker && Number.isFinite(prim.flicker.amp) ? prim.flicker : null,
      });
    }
    return { group, prims: records };
  }

  function clearAttachment(slot) {
    const current = attached[slot];
    if (!current) return;
    if (current.group.parent) current.group.parent.remove(current.group);
    // Materials come from the engine's shared cache (see the getMaterial import) and
    // are never this rig's to dispose; the geometries are.
    for (const record of current.prims) record.mesh.geometry.dispose();
    attached[slot] = null;
  }

  function applySlot(slot, itemId) {
    const prevId = equipped ? equipped[slot] : null;
    if (attached[slot] && prevId === itemId) return;
    clearAttachment(slot);
    if (!itemId) return;
    const built = buildAttachment(getItem(itemId));
    if (!built) return;
    anchors[slot].add(built.group);
    attached[slot] = built;
  }

  function applyAttachments(next) {
    applySlot("hat", next.hat);
    applySlot("gear", next.gear);
    rig.gearEquipped = Boolean(next.gear);
  }

  // §5.4's prim animation, advanced on SIM time only (never wall clock).
  function stepAttachments(step) {
    if (!attached.hat && !attached.gear) return;
    attachTime += step;
    for (const slot of ["hat", "gear"]) {
      const current = attached[slot];
      if (!current) continue;
      for (const record of current.prims) {
        if (record.spin) record.mesh.rotation.y += record.spin * DEG * step;
        if (record.bob) {
          record.mesh.position.y = record.baseY
            + record.bob.amp * Math.sin(2 * Math.PI * (record.bob.hz || 0) * attachTime);
        }
        if (record.flicker) {
          record.mesh.scale.y = 1
            + record.flicker.amp * Math.sin(2 * Math.PI * (record.flicker.hz || 0) * attachTime);
        }
      }
    }
  }

  // setState(avatarState) — §5.1: re-apply colors/face/hat/gear/aura/trail; idempotent,
  // and only what actually changed is rebuilt.
  function setState(avatarState) {
    const nextColors = readColors(avatarState);
    const nextEquipped = readEquipped(avatarState);
    const headChanged = applyColors(nextColors);
    const faceChanged = !equipped || equipped.face !== nextEquipped.face;
    equipped = nextEquipped;
    applyAttachments(nextEquipped);
    if (headChanged || faceChanged) paint();
  }

  function setAnimState(next) {
    animator.setAnimState(next);
  }

  function playEmote(name) {
    animator.playEmote(name);
  }

  // flashFace(faceId, seconds) — §5.3: paint now, revert to the equipped face after
  // `seconds` of SIM time (counted down in update); a second flash restarts the timer.
  function flashFace(faceId, seconds) {
    const s = Number.isFinite(seconds) && seconds > 0 ? seconds : AVATAR_TUNING.OOF_FACE_SECONDS;
    flash = { faceId, remaining: s };
    paint();
  }

  function update(dt) {
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    animator.update(step);
    if (flash) {
      flash.remaining -= step;
      if (flash.remaining <= 0) {
        flash = null;
        paint();
      }
    }
    stepAttachments(step);
    // SLICE: aura/trail particle stepping (§5.5) joins this line with effects.js.
  }

  function dispose() {
    clearAttachment("hat");
    clearAttachment("gear");
    if (group.parent) group.parent.remove(group);
    for (const key of LIMB_KEYS) {
      const mesh = meshes[key];
      if (mesh && mesh.geometry) mesh.geometry.dispose();
    }
    faceTexture.dispose();
    faceMaterial.dispose();
  }

  rig.setState = setState;
  rig.setAnimState = setAnimState;
  rig.playEmote = playEmote;
  rig.flashFace = flashFace;
  rig.update = update;
  rig.dispose = dispose;

  // Joints are left at zero rotation: §5.1's table is the REST pose, and §7 criterion 1
  // measures the six mesh centres against it straight after buildRig. The first
  // update(dt) writes the live pose.
  setState(state);
  if (scene) scene.add(group);
  return rig;
}
