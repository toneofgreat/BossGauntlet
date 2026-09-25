// src/games/lifting/scripts/items.js — spec 09 §3.3/§5.4: turns an item's frozen prim
// recipe (config.js) into a live THREE.Group, and frees every geometry/material/texture
// it made. Pure construction: no ctx, no DOM, no per-step logic — lift.js owns the held
// group's pose, board.js owns the 12 pedestal displays' pose. Both hand their subtrees
// back here to be disposed, because spec 04 §5.5's zero-leak check counts geometries and
// the engine only ever owns *part* meshes (a parts.addCustom subtree is ours to free).

import { itemById } from "./config.js";

const DEG = Math.PI / 180;

// Mirrors the engine's own glass rule (spec 03 §5.1) so a glass prim on a held item
// reads like a glass part in the world. The engine's material factory is module-private
// to parts.js and ctx exposes no material API (spec 04 §5.7), so held-item materials are
// rebuilt here from the same numbers rather than shared with it. Reported as a gap.
const GLASS_MIN_T = 0.55;

// Segment counts. Nothing in the spec fixes them; these are picked so a Moon held at
// arm's length still reads round on a phone while 12 pedestal displays + the held item
// stay far under §5.6's 250-mesh budget for code-added customs.
const SEG_RADIAL = 16;
const SEG_SPHERE_W = 20;
const SEG_SPHERE_H = 14;
const SEG_TORUS_TUBE = 10;
const SEG_TORUS_RING = 28;

// §3.3's size conventions, verbatim: box extents; cylinder/cone [radius, height, radius];
// sphere [rx, ry, rz] (RADII, not extents — every planet recipe's surface detail is
// offset by about its listed radius, e.g. moon's craters at z −1.35 on a [1.6,1.6,1.6]
// body); torus [ringR, tubeR, 0].
function geometryFor(THREE, p) {
  const s = p.size;
  switch (p.shape) {
    case "box": return new THREE.BoxGeometry(s[0], s[1], s[2]);
    case "cylinder": return new THREE.CylinderGeometry(s[0], s[0], s[1], SEG_RADIAL);
    case "cone": return new THREE.ConeGeometry(s[0], s[1], SEG_RADIAL);
    case "torus": return new THREE.TorusGeometry(s[0], s[1], SEG_TORUS_TUBE, SEG_TORUS_RING);
    // A unit sphere scaled per-axis: one geometry shape serves every radius triple, and
    // the flattened shells (Earth's cloud band, Jupiter's belts) need the anisotropy.
    default: return new THREE.SphereGeometry(1, SEG_SPHERE_W, SEG_SPHERE_H);
  }
}

// §3.3's material names. Transparency is honoured on EVERY material here including neon
// — the engine drops it for neon parts (spec 03 §5.1), but §5.5's recipes lean on
// translucent neon (the Sun's outer corona at 0.7, the Black Hole's outer ring at 0.4,
// the GD Star's halo at 0.4): opaque shells would swallow the body they are drawn over.
// A deliberate held-item-only deviation, not a change to how parts render.
function materialFor(THREE, p) {
  const t = p.transparency || 0;
  let mat;
  if (p.material === "neon") {
    mat = new THREE.MeshLambertMaterial({ color: "#000000", emissive: p.color, emissiveIntensity: 1 });
  } else if (p.material === "glass") {
    const effT = Math.max(t, GLASS_MIN_T);
    const tinted = new THREE.Color(p.color).lerp(new THREE.Color("#bfe3ff"), 0.25);
    return new THREE.MeshLambertMaterial({
      color: tinted, transparent: true, opacity: Math.min(0.45, Math.max(0.08, 1 - effT)), depthWrite: false,
    });
  } else if (p.material === "metal") {
    // Lambert has no specular channel, so metal would be indistinguishable from plastic
    // at held-item scale. Phong with a tight highlight is the cheapest thing that reads
    // as metal; a judgement call the spec does not make.
    mat = new THREE.MeshPhongMaterial({ color: p.color, specular: "#ffffff", shininess: 70 });
  } else {
    mat = new THREE.MeshLambertMaterial({ color: p.color }); // plastic, wood
  }
  if (t > 0 && t < 1) {
    mat.transparent = true;
    mat.opacity = 1 - t;
  }
  return mat;
}

// buildItemGroup(THREE, id) -> { group, halfHeight, halfDepth } (§4's contract).
// halfHeight/halfDepth are half the group's bounding-box Y/Z, which §5.4's carry formula
// reads to keep a Train's underside off the avatar's chest and a Pencil close in.
// An unknown id falls back to the pencil rather than returning an empty group: §3.1's
// load already guarantees a valid id, so reaching here means a bug, and a visible pencil
// is a better failure than an invisible nothing.
export function buildItemGroup(THREE, id) {
  const item = itemById(id) || itemById("pencil");
  const group = new THREE.Group();
  group.name = "lifting-item-" + item.id;
  group.userData.itemId = item.id;
  const spinners = [];

  for (const p of item.prims) {
    const mesh = new THREE.Mesh(geometryFor(THREE, p), materialFor(THREE, p));
    mesh.position.set(p.offset[0], p.offset[1], p.offset[2]);
    mesh.rotation.set(p.rotation[0] * DEG, p.rotation[1] * DEG, p.rotation[2] * DEG);
    if (p.shape === "sphere") mesh.scale.set(p.size[0], p.size[1], p.size[2]);
    if (p.spin) {
      // §3.3: spin is "about the ITEM's local Y", not the prim's own. A pivot at the
      // item origin gives exactly that for free — an off-centre prim orbits, a centred
      // one rotates in place — and keeps the per-step tick to one rotation.y write.
      const pivot = new THREE.Group();
      pivot.userData.spinDegS = p.spin;
      pivot.add(mesh);
      group.add(pivot);
      spinners.push(pivot);
    } else {
      group.add(mesh);
    }
  }

  group.userData.spinners = spinners;
  group.updateMatrixWorld(true); // Box3 reads world matrices; the group is still at origin
  const box = new THREE.Box3().setFromObject(group);
  const halfHeight = Number.isFinite(box.max.y - box.min.y) ? (box.max.y - box.min.y) / 2 : 0.5;
  const halfDepth = Number.isFinite(box.max.z - box.min.z) ? (box.max.z - box.min.z) / 2 : 0.5;
  return { group, halfHeight, halfDepth };
}

// Advances every spinning prim of a built group. Called from lift.update for the held
// item and from board.update for the pedestal displays, so the two never drift apart.
export function spinItemGroup(group, dt) {
  if (!group) return;
  const spinners = group.userData.spinners;
  if (!spinners) return;
  for (const pivot of spinners) {
    pivot.rotation.y += pivot.userData.spinDegS * DEG * dt;
  }
}

// Frees an addCustom subtree. Takes any Object3D — the FX sprites, the leaderboard box
// and the title tag go through here too, so there is one place that knows a CanvasTexture
// has to be disposed alongside its material (§5.15 step 3).
export function disposeItemGroup(group) {
  if (!group) return;
  const geometries = new Set();
  const materials = new Set();
  group.traverse((obj) => {
    // THREE.Sprite hands every instance in the PROCESS the same module-level quad
    // (three.core.js: `if (_geometry === undefined) _geometry = new BufferGeometry()`),
    // and it is never rebuilt. Disposing it here would free the GPU buffers of every
    // other live sprite in the app (the platform's, another Place's) and decrement
    // renderer.info.memory.geometries for a geometry that is still in use. It is not
    // ours to free, so it is skipped; the sprite's material and CanvasTexture below
    // are per-instance and still go.
    if (obj.geometry && !obj.isSprite) geometries.add(obj.geometry);
    const mat = obj.material;
    if (Array.isArray(mat)) for (const m of mat) materials.add(m);
    else if (mat) materials.add(mat);
  });
  for (const geo of geometries) geo.dispose();
  for (const mat of materials) {
    if (mat.map) mat.map.dispose();
    mat.dispose();
  }
  group.clear();
}
