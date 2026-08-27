// src/platform/studio/editor.js — the edit-mode world: the scene built from a
// StudioDoc, selection, the tool modes, part placement, the keyboard map, and the one
// choke point every doc mutation goes through. Spec 11 §5.2, §5.4, §5.5.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE:
//  1. `doc` is the single source of truth. Nothing outside this file writes to it;
//     everything flows through a command (commands.js) so undo is total (§5.2).
//  2. Edit mode performs ZERO physics queries (§5.2, binding). Selection and placement
//     raycast the part MESHES with THREE.Raycaster. Behaviours are never handed to the
//     engine in edit mode either, so a kill brick under the fly cam does nothing.

import * as THREE from "../../../assets/vendor/three.module.js";
import {
  createCommandStack, cmdAddParts, cmdRemoveParts, cmdTransform,
  cmdSetProps, cmdSetBehaviors, cmdSetWorld,
} from "./commands.js";
import { createGizmo } from "./gizmo.js";
import { mergePlaceLighting } from "./worldpanel.js";
import { BEHAVIOR_PARAM_SCHEMAS } from "./behaviors-schema.js";

// ---- tuning constants, spec 11 §6 -------------------------------------------------
const MAX_STUDIO_PARTS = 500;
const MAX_UNDO = 100;
const GRID_OPTIONS = [1, 0.5, 0.25];
const TAP_SLOP = 10; // px
const TAP_MS = 350;
const SIZE_MAX = 2048; // spec 04 size ceiling
const GHOST_OPACITY = 0.45;
const OUTLINE_COLOR = "#ffd166";
const BADGE_SCALE = 1.6;
const BADGE_LIFT = 1.2; // + size[1]/2
const GRID_SIZE = 128;
const GRID_OPACITY = 0.12;
const EDITOR_RENDER_ORDER = 900;

// The spawn marker, §5.2. It is selectable like a part under the reserved id "@spawn",
// which no real part can collide with: spec 04's part-id charset excludes "@".
const SPAWN_ID = "@spawn";
const SPAWN_SIZE = [4, 0.4, 4];
const SPAWN_COLOR = "#46a758";
const SPAWN_TRANSPARENCY = 0.3;

const DEG = Math.PI / 180;

// §3.4's pack quanta. The grid (1 / 0.5 / 0.25) is what a DRAG snaps to; these are what
// the share code can actually carry, and they are the floor under every other snap.
const COORD_QUANTUM = 0.05; // studs — position and size
const DEG_QUANTUM = 1; // degrees — rotation and spawnYaw

function deepCopy(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

// Behaviours live in the doc only (§5.2): the engine never sees them in edit mode.
function stripBehaviors(def) {
  const copy = deepCopy(def);
  copy.behaviors = [];
  return copy;
}

// Two decimals covers the 0.05-stud pack quantum (§3.4); every derived
// coordinate goes through here so float noise never reaches the doc.
function round2(value) {
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

// Float noise (0.1 + 0.2 = 0.30000000000000004) would otherwise accumulate over a
// hundred drags. Every grid option is a multiple of the 0.05-stud pack quantum (§3.4),
// so rounding to two decimals lands exactly on that quantum and the share-code round
// trip stays bit-identical.
function snapTo(value, grid) {
  return round2(Math.round(value / grid) * grid);
}

// createEditor(doc, deps) -> editor — §5.2.
// deps: { scene, rendererApi, partsApi, audio, ui, flycam, onDirty }
export function createEditor(doc, deps) {
  const { scene, partsApi, flycam } = deps;
  const stage = flycam.stage;
  const stack = createCommandStack(MAX_UNDO);

  let tool = "select"; // select | move | rotate | scale
  let armedShape = null; // place mode (§5.5)
  let multiTouchSelect = false; // the tool bar's "＋" toggle
  let selection = []; // part ids, "@spawn" allowed as a single selection
  let dirty = false;
  let disposed = false;
  const changeListeners = new Set();

  const raycaster = new THREE.Raycaster();
  const pointerNdc = new THREE.Vector2();
  const owned = new Set(); // every Object3D this module added to the scene

  // ---- editor-only scene objects --------------------------------------------------
  const outlines = new Map(); // partId -> LineSegments
  const badges = new Map(); // partId -> Sprite
  const edgesCache = new Map(); // shape -> EdgesGeometry of the unit geometry
  const badgeTextures = new Map(); // icon -> CanvasTexture
  let gridHelper = null;
  let spawnMarker = null;
  let ghost = null;

  function addOwned(object3D) {
    object3D.renderOrder = EDITOR_RENDER_ORDER;
    scene.add(object3D);
    owned.add(object3D);
    return object3D;
  }

  function removeOwned(object3D) {
    if (!object3D) return;
    scene.remove(object3D);
    owned.delete(object3D);
    if (object3D.geometry) object3D.geometry.dispose();
    if (object3D.material && object3D.material.dispose && !object3D.material.__shared) {
      object3D.material.dispose();
    }
  }

  // The engine caches one unit geometry per shape and never exports it (spec 03 §5.2).
  // Rather than re-deriving the wedge's six corners here — a second source of truth for
  // a shape the engine already owns — a throwaway part is created and immediately
  // removed just to read the cached geometry off its mesh. removePart never disposes a
  // cached geometry, so this costs one build the first time and nothing after.
  function unitGeometry(shape) {
    const probeId = partsApi.addPart({
      id: "@probe-" + shape, shape, size: [1, 1, 1], position: [0, -100000, 0],
      rotation: [0, 0, 0], color: "#ffffff", material: "plastic",
      transparency: 0, anchored: true, canCollide: false, behaviors: [],
    });
    const record = partsApi.getPart(probeId);
    const geometry = record && record.mesh ? record.mesh.geometry : null;
    partsApi.removePart(probeId);
    return geometry;
  }

  function edgesFor(shape) {
    if (!edgesCache.has(shape)) {
      const geometry = unitGeometry(shape);
      edgesCache.set(shape, geometry ? new THREE.EdgesGeometry(geometry, 25) : null);
    }
    return edgesCache.get(shape);
  }

  function partOf(id) {
    return doc.world.parts.find((p) => p.id === id) || null;
  }

  function meshOf(id) {
    if (id === SPAWN_ID) return spawnMarker;
    const record = partsApi.getPart(id);
    return record && record.mesh ? record.mesh : null;
  }

  // partMeshes() — what a PLACEMENT ray may rest a new part against: real parts only.
  // §5.5 step 1 says "raycast part meshes"; the spawn pad is an editor marker, and
  // stacking bricks against the side of it is never what someone meant to do.
  function partMeshes() {
    const list = [];
    for (const part of doc.world.parts) {
      const mesh = meshOf(part.id);
      if (mesh) {
        mesh.userData.oofStudioId = part.id;
        list.push(mesh);
      }
    }
    return list;
  }

  // pickables() — what a SELECTION ray may hit: the parts plus the spawn pad, which is
  // selectable and draggable like a part (§5.2, §5.5).
  function pickables() {
    const list = partMeshes();
    if (spawnMarker) list.push(spawnMarker);
    return list;
  }

  // ---- grid helper ----------------------------------------------------------------
  function buildGrid() {
    removeOwned(gridHelper);
    const divisions = Math.round(GRID_SIZE / doc.editor.grid);
    gridHelper = new THREE.GridHelper(GRID_SIZE, divisions, 0xffffff, 0xffffff);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = GRID_OPACITY;
    gridHelper.material.depthWrite = false;
    gridHelper.position.y = 0;
    addOwned(gridHelper);
  }

  // ---- spawn marker ---------------------------------------------------------------
  // A pad plus a flat arrow so `spawnYaw` is something you can SEE rather than a number
  // in a panel — the difference between a child understanding which way they will face
  // and not (§5.2).
  function buildSpawnMarker() {
    if (spawnMarker) removeOwned(spawnMarker);
    const group = new THREE.Group();
    const padMat = new THREE.MeshBasicMaterial({
      color: SPAWN_COLOR, transparent: true, opacity: 1 - SPAWN_TRANSPARENCY, depthWrite: false,
    });
    const pad = new THREE.Mesh(new THREE.BoxGeometry(SPAWN_SIZE[0], SPAWN_SIZE[1], SPAWN_SIZE[2]), padMat);
    group.add(pad);
    const arrowMat = new THREE.MeshBasicMaterial({ color: "#eafff0", depthWrite: false });
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 2.2), arrowMat);
    shaft.position.set(0, SPAWN_SIZE[1] / 2 + 0.05, 0.1);
    const headL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 1.0), arrowMat);
    headL.position.set(-0.42, SPAWN_SIZE[1] / 2 + 0.05, -0.85);
    headL.rotation.y = -0.7;
    const headR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 1.0), arrowMat);
    headR.position.set(0.42, SPAWN_SIZE[1] / 2 + 0.05, -0.85);
    headR.rotation.y = 0.7;
    group.add(shaft, headL, headR);
    group.userData.oofStudioId = SPAWN_ID;
    spawnMarker = group;
    addOwned(group);
    // The doc stores the avatar's FEET position (§3.1); the pad is centred on its own
    // half height so its TOP sits at the feet plane.
    syncSpawnMarker();
  }

  function syncSpawnMarker() {
    if (!spawnMarker) return;
    const s = doc.world.spawn;
    spawnMarker.position.set(s[0], s[1] - SPAWN_SIZE[1] / 2, s[2]);
    spawnMarker.rotation.y = (doc.world.spawnYaw || 0) * DEG;
  }

  // ---- behaviour badges ------------------------------------------------------------
  function badgeTexture(icon) {
    if (badgeTextures.has(icon)) return badgeTextures.get(icon);
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, 64, 64);
      ctx.font = "44px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(icon, 32, 36);
    }
    const texture = new THREE.CanvasTexture(canvas);
    badgeTextures.set(icon, texture);
    return texture;
  }

  function refreshBadge(id) {
    const existing = badges.get(id);
    if (existing) {
      scene.remove(existing);
      owned.delete(existing);
      existing.material.dispose();
      badges.delete(id);
    }
    const part = partOf(id);
    if (!part || !part.behaviors || part.behaviors.length === 0) return;
    const schema = BEHAVIOR_PARAM_SCHEMAS[part.behaviors[0].type];
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: badgeTexture(schema ? schema.icon : "⚙"), transparent: true, depthTest: false,
    }));
    sprite.scale.set(BADGE_SCALE, BADGE_SCALE, 1);
    sprite.position.set(
      part.position[0],
      part.position[1] + part.size[1] / 2 + BADGE_LIFT,
      part.position[2],
    );
    badges.set(id, sprite);
    addOwned(sprite);
  }

  // ---- selection outlines ----------------------------------------------------------
  function refreshOutlines() {
    for (const [, line] of outlines) {
      scene.remove(line);
      owned.delete(line);
      line.material.dispose();
    }
    outlines.clear();
    for (const id of selection) {
      const line = id === SPAWN_ID ? outlineForSpawn() : outlineForPart(id);
      if (line) {
        outlines.set(id, line);
        addOwned(line);
      }
    }
  }

  function outlineMaterial() {
    return new THREE.LineBasicMaterial({ color: OUTLINE_COLOR, depthTest: false, transparent: true });
  }

  function outlineForPart(id) {
    const part = partOf(id);
    const edges = part ? edgesFor(part.shape) : null;
    if (!edges) return null;
    const line = new THREE.LineSegments(edges, outlineMaterial());
    line.material.__shared = false;
    line.geometry.__shared = true; // the EdgesGeometry cache owns it, not this line
    // 1.002 so the outline clears the surface it wraps instead of z-fighting it.
    line.scale.set(part.size[0] * 1.002, part.size[1] * 1.002, part.size[2] * 1.002);
    line.position.set(part.position[0], part.position[1], part.position[2]);
    // "XYZ" matches spec 03 parts.js quatFromEulerDeg exactly — an outline in a
    // different Euler order would drift off its part the moment two axes are non-zero.
    line.rotation.set(part.rotation[0] * DEG, part.rotation[1] * DEG, part.rotation[2] * DEG, "XYZ");
    return line;
  }

  function outlineForSpawn() {
    const edges = edgesFor("box");
    if (!edges) return null;
    const line = new THREE.LineSegments(edges, outlineMaterial());
    line.geometry.__shared = true;
    line.scale.set(SPAWN_SIZE[0] * 1.002, SPAWN_SIZE[1] * 1.002, SPAWN_SIZE[2] * 1.002);
    line.position.copy(spawnMarker.position);
    line.rotation.y = spawnMarker.rotation.y;
    return line;
  }

  // ---- gizmo -----------------------------------------------------------------------
  const gizmo = createGizmo(scene, { touch: flycam.isTouchLayout() });

  function selectionAabb() {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let any = false;
    for (const id of selection) {
      const box = id === SPAWN_ID
        ? { position: doc.world.spawn, size: SPAWN_SIZE }
        : partOf(id);
      if (!box) continue;
      any = true;
      for (let k = 0; k < 3; k++) {
        // The AABB of a rotated part is approximated by its unrotated extents: the
        // pivot only has to be somewhere sensible in the middle of the selection.
        min[k] = Math.min(min[k], box.position[k] - box.size[k] / 2);
        max[k] = Math.max(max[k], box.position[k] + box.size[k] / 2);
      }
    }
    if (!any) return null;
    return { min, max };
  }

  function pivot() {
    const aabb = selectionAabb();
    if (!aabb) return [0, 0, 0];
    return [
      (aabb.min[0] + aabb.max[0]) / 2,
      (aabb.min[1] + aabb.max[1]) / 2,
      (aabb.min[2] + aabb.max[2]) / 2,
    ];
  }

  function refreshGizmo() {
    // Scale is hidden while the spawn pad is selected — it has no size to change (§5.2).
    const spawnOnly = selection.length === 1 && selection[0] === SPAWN_ID;
    // Place mode replaces the active tool (§5.5), so its handles come down with it:
    // a gizmo left floating over the world would swallow the taps meant to place parts.
    const usable = tool !== "select" && selection.length > 0 && armedShape === null
      && !(spawnOnly && tool === "scale");
    gizmo.setMode(tool === "select" ? null : tool);
    gizmo.setVisible(usable);
    if (usable) gizmo.setPivot(pivot());
  }

  // ===================================================================================
  // ===== doc mutation — the internals commands.js calls (§5.2, §5.4) =================
  // ===================================================================================

  function notify() {
    for (const cb of changeListeners) {
      try {
        cb();
      } catch (err) {
        console.error("[oof] studio editor listener failed", err);
      }
    }
  }

  function markDirty() {
    dirty = true;
    if (deps.onDirty) deps.onDirty();
  }

  function addEngineMesh(def) {
    partsApi.addPart(stripBehaviors(def));
  }

  // Size, shape and material all change the MESH, and spec 03's setters only move,
  // recolour and re-fade an existing one — so those three go through a remove + re-add.
  function rebuildEngineMesh(id) {
    const part = partOf(id);
    if (!part) return;
    if (partsApi.getPart(id)) partsApi.removePart(id);
    addEngineMesh(part);
  }

  const ed = {
    doc,
    stack,

    insertPart(def, index) {
      const at = Math.max(0, Math.min(index, doc.world.parts.length));
      doc.world.parts.splice(at, 0, def);
      addEngineMesh(def);
      refreshBadge(def.id);
      markDirty();
      notify();
    },

    deletePart(id) {
      const at = doc.world.parts.findIndex((p) => p.id === id);
      if (at === -1) return;
      doc.world.parts.splice(at, 1);
      if (partsApi.getPart(id)) partsApi.removePart(id);
      const badge = badges.get(id);
      if (badge) {
        scene.remove(badge);
        owned.delete(badge);
        badge.material.dispose();
        badges.delete(id);
      }
      markDirty();
      notify();
    },

    // writePartFields(id, fields) — the ONLY writer of a part's fields. `fields` is a
    // partial Part: position / rotation / size / color / material / transparency /
    // canCollide, any subset.
    writePartFields(id, fields) {
      if (id === SPAWN_ID) {
        // The spawn pad is not a part; a transform aimed at it lands on the world.
        if (fields.position) ed.writeWorld("spawn", fields.position.slice());
        if (fields.rotation) ed.writeWorld("spawnYaw", fields.rotation[1]);
        return;
      }
      const part = partOf(id);
      if (!part) return;
      let rebuild = false;
      if (fields.size) {
        part.size = fields.size.slice();
        rebuild = true;
      }
      if (fields.shape && fields.shape !== part.shape) {
        part.shape = fields.shape;
        rebuild = true;
      }
      if (fields.material && fields.material !== part.material) {
        part.material = fields.material;
        rebuild = true;
      }
      if (fields.position) part.position = fields.position.slice();
      if (fields.rotation) part.rotation = fields.rotation.slice();
      if (fields.color !== undefined) part.color = fields.color;
      if (fields.transparency !== undefined) part.transparency = fields.transparency;
      if (fields.canCollide !== undefined) part.canCollide = fields.canCollide;

      if (rebuild) {
        rebuildEngineMesh(id);
      } else {
        if (fields.position) partsApi.setPosition(id, part.position);
        if (fields.rotation) partsApi.setRotation(id, part.rotation);
        if (fields.color !== undefined) partsApi.setColor(id, part.color);
        if (fields.transparency !== undefined) partsApi.setTransparency(id, part.transparency);
        if (fields.canCollide !== undefined) partsApi.setCanCollide(id, part.canCollide);
      }
      refreshBadge(id);
      markDirty();
      notify();
    },

    writeBehaviors(id, behaviors) {
      const part = partOf(id);
      if (!part) return;
      part.behaviors = behaviors;
      refreshBadge(id);
      markDirty();
      notify();
    },

    writeWorld(key, value) {
      if (key === "name") doc.name = value;
      else doc.world[key] = value;

      if (key === "spawn" || key === "spawnYaw") syncSpawnMarker();
      // Merged against spec 04 §3.3 before it goes to the renderer, never handed over
      // raw: applyLighting fills the gaps from renderer.js's OWN defaults, which are not
      // the Place-level defaults a playtest gets (mergePlaceLighting, worldpanel.js).
      if (key === "lighting" && deps.rendererApi) deps.rendererApi.applyLighting(mergePlaceLighting(value));
      refreshOutlines();
      refreshGizmo();
      markDirty();
      notify();
    },

    setSelection(ids) {
      selection = ids.filter((id) => id === SPAWN_ID || partOf(id) !== null);
      refreshOutlines();
      refreshGizmo();
      notify();
    },
  };

  // ===================================================================================
  // ===== high-level mutators — every one builds ONE command and pushes it ============
  // ===================================================================================

  function transformStateOf(id) {
    if (id === SPAWN_ID) {
      return { position: doc.world.spawn.slice(), rotation: [0, doc.world.spawnYaw || 0, 0] };
    }
    const part = partOf(id);
    return {
      position: part.position.slice(),
      rotation: part.rotation.slice(),
      size: part.size.slice(),
    };
  }

  Object.assign(ed, {
    addParts(defs) {
      if (doc.world.parts.length + defs.length > MAX_STUDIO_PARTS) {
        if (deps.audio) deps.audio.playSfx("error", { volume: 0.5 });
        if (deps.ui) deps.ui.toast("Part limit reached (" + MAX_STUDIO_PARTS + ")");
        return false;
      }
      stack.push(cmdAddParts(ed, defs));
      return true;
    },

    removeSelected() {
      const ids = selection.filter((id) => id !== SPAWN_ID);
      if (ids.length === 0) return false;
      stack.push(cmdRemoveParts(ed, ids));
      return true;
    },

    duplicateSelected() {
      const ids = selection.filter((id) => id !== SPAWN_ID);
      if (ids.length === 0) return false;
      const grid = doc.editor.grid;
      const copies = ids.map((id) => {
        const source = deepCopy(partOf(id));
        source.id = "s" + doc.editor.nextPartNum++;
        // §5.4: the copy sits one grid step diagonally off the original — a plain
        // offset, so a copy of an off-grid part keeps the same relationship to it.
        source.position = [
          round2(source.position[0] + grid),
          source.position[1],
          round2(source.position[2] + grid),
        ];
        return source;
      });
      return ed.addParts(copies);
    },

    applyProps(ids, key, value) {
      const targets = ids.filter((id) => id !== SPAWN_ID);
      if (targets.length === 0) return;
      const before = targets.map((id) => deepCopy(partOf(id)[key]));
      stack.push(cmdSetProps(ed, targets, key, before, value));
    },

    // applyTransform(ids, afterStates) — afterStates is aligned to ids, each a partial
    // { position?, rotation?, size? }. The `before` snapshot is read here, so a caller
    // that has already moved MESHES around (a gizmo drag) must pass the snapshot it
    // took at drag start via applyTransformFrom instead.
    applyTransform(ids, afterStates) {
      ed.applyTransformFrom(ids, ids.map(transformStateOf), afterStates);
    },

    applyTransformFrom(ids, beforeStates, afterStates) {
      stack.push(cmdTransform(ed, ids, beforeStates, afterStates));
    },

    applyBehaviors(id, behaviors) {
      const part = partOf(id);
      if (!part) return;
      stack.push(cmdSetBehaviors(ed, id, deepCopy(part.behaviors || []), deepCopy(behaviors)));
    },

    applyWorld(key, value) {
      const before = key === "name" ? doc.name : deepCopy(doc.world[key]);
      stack.push(cmdSetWorld(ed, key, before, value));
    },

    undo() {
      if (stack.undo()) return true;
      if (deps.audio) deps.audio.playSfx("error", { volume: 0.5 });
      return false;
    },

    redo() {
      if (stack.redo()) return true;
      if (deps.audio) deps.audio.playSfx("error", { volume: 0.5 });
      return false;
    },
  });

  // ===================================================================================
  // ===== place mode — the ghost and its snapping (§5.5) =============================
  // ===================================================================================

  function disposeGhost() {
    if (!ghost) return;
    scene.remove(ghost);
    owned.delete(ghost);
    ghost.material.dispose();
    ghost = null;
  }

  function ensureGhost(shape, material, color) {
    const key = shape + "|" + material + "|" + color;
    if (ghost && ghost.userData.key === key) return ghost;
    disposeGhost();
    const geometry = unitGeometry(shape);
    if (!geometry) return null;
    // A clone, not the cached material: the ghost is translucent and the cache entry is
    // shared with every real part wearing the same material/colour.
    const mat = partsApi.getMaterial(material, color, 0).clone();
    mat.transparent = true;
    mat.opacity = GHOST_OPACITY;
    mat.depthTest = true;
    mat.depthWrite = false;
    ghost = new THREE.Mesh(geometry, mat);
    ghost.userData.key = key;
    ghost.geometry.__shared = true;
    addOwned(ghost);
    return ghost;
  }

  function dominantAxis(vec) {
    const ax = Math.abs(vec.x);
    const ay = Math.abs(vec.y);
    const az = Math.abs(vec.z);
    if (ax >= ay && ax >= az) return [Math.sign(vec.x) || 1, 0, 0];
    if (ay >= az) return [0, Math.sign(vec.y) || 1, 0];
    return [0, 0, Math.sign(vec.z) || 1];
  }

  const normalMatrix = new THREE.Matrix3();

  // ghostPlacement(clientX, clientY) -> { position } | null — §5.5's four steps.
  function ghostPlacement(clientX, clientY, size) {
    const caster = rayFrom(clientX, clientY);
    const grid = doc.editor.grid;
    const hits = caster.intersectObjects(partMeshes(), true);
    if (hits.length > 0 && hits[0].face) {
      const hit = hits[0];
      normalMatrix.getNormalMatrix(hit.object.matrixWorld);
      const worldNormal = hit.face.normal.clone().applyMatrix3(normalMatrix).normalize();
      const n = dominantAxis(worldNormal);
      // Half the new part's extent ALONG the face normal — this is what rests it on
      // the surface instead of burying half of it.
      const half = (Math.abs(n[0]) * size[0] + Math.abs(n[1]) * size[1] + Math.abs(n[2]) * size[2]) / 2;
      const p = [hit.point.x + n[0] * half, hit.point.y + n[1] * half, hit.point.z + n[2] * half];
      // The two axes across the face snap to the grid...
      for (let k = 0; k < 3; k++) if (n[k] === 0) p[k] = snapTo(p[k], grid);
      // ...and the third snaps its CONTACT coordinate, then re-adds the half extent
      // (§5.5 step 3). With every editor-placed surface already on the grid the two
      // readings of that sentence agree; on an imported off-grid surface this one puts
      // the part on the grid rather than flush, which is the literal text.
      const axis = n[0] !== 0 ? 0 : (n[1] !== 0 ? 1 : 2);
      const contact = snapTo(p[axis] * n[axis] - half, grid);
      p[axis] = n[axis] * (contact + half);
      return p;
    }
    // No hit: drop it on the y = 0 plane (§5.5 step 4).
    const dir = caster.ray.direction;
    const origin = caster.ray.origin;
    if (Math.abs(dir.y) < 1e-6) return null;
    const t = -origin.y / dir.y;
    if (t <= 0) return null; // the ray points at or above the horizon
    return [
      snapTo(origin.x + dir.x * t, grid),
      size[1] / 2,
      snapTo(origin.z + dir.z * t, grid),
    ];
  }

  function ghostDefAt(clientX, clientY) {
    if (!armedShape) return null;
    const defaults = deps.getPlaceDefaults ? deps.getPlaceDefaults() : { material: "plastic", color: "#a3a2a5" };
    const size = deps.getPlaceSize ? deps.getPlaceSize(armedShape) : [4, 1, 4];
    const position = ghostPlacement(clientX, clientY, size);
    if (!position) return null;
    return {
      id: null, // assigned at commit, so an aborted placement burns no id
      shape: armedShape,
      size: size.slice(),
      position,
      rotation: [0, 0, 0],
      color: defaults.color,
      material: defaults.material,
      transparency: 0,
      anchored: true, // §5.5: every Studio part is anchored
      canCollide: true,
      behaviors: [],
    };
  }

  function updateGhost(clientX, clientY) {
    if (!armedShape) {
      disposeGhost();
      return null;
    }
    const def = ghostDefAt(clientX, clientY);
    const defaults = deps.getPlaceDefaults ? deps.getPlaceDefaults() : { material: "plastic", color: "#a3a2a5" };
    const mesh = ensureGhost(armedShape, defaults.material, defaults.color);
    if (!mesh) return null;
    if (!def) {
      mesh.visible = false;
      return null;
    }
    mesh.visible = true;
    mesh.position.set(def.position[0], def.position[1], def.position[2]);
    mesh.scale.set(def.size[0], def.size[1], def.size[2]);
    return def;
  }

  function commitPlacement(def) {
    if (!def) return;
    if (doc.world.parts.length >= MAX_STUDIO_PARTS) {
      if (deps.audio) deps.audio.playSfx("error", { volume: 0.5 });
      if (deps.ui) deps.ui.toast("Part limit reached (" + MAX_STUDIO_PARTS + ")");
      return; // stays armed, nothing written (§5.5 step 5)
    }
    const placed = deepCopy(def);
    placed.id = "s" + doc.editor.nextPartNum++;
    if (ed.addParts([placed]) && deps.audio) deps.audio.playSfx("click", { volume: 0.4 });
  }

  // ===================================================================================
  // ===== pointer interaction (§5.3 layering, §5.5 selection/placement/gizmo) =========
  // ===================================================================================
  // These listeners run in the CAPTURE phase on flycam's stage, so they see every
  // pointer before flycam's own bubble-phase handlers do. stopPropagation is the claim:
  // a gizmo drag and a placement consume the pointer, a tap does NOT (the same finger
  // is allowed to look around while the tap is still undecided).

  // setPointerCapture throws NotFoundError for a pointer id the browser has no live
  // pointer for — which is exactly what the §8 smoke scenario dispatches. Capture is a
  // nicety (it keeps a drag alive off-element), never a correctness requirement, so a
  // failure to get it is swallowed rather than becoming an uncaught console error.
  function capturePointer(id) {
    try {
      stage.setPointerCapture(id);
    } catch {
      /* synthetic pointer: no capture to take */
    }
  }

  function rayFrom(clientX, clientY) {
    // A raycast reads matrixWorld, which three only refreshes during a render. A part
    // added, moved or resized since the last frame would still be raycast at its OLD
    // transform (an identity matrix, for one added this tick) — so the graph is brought
    // up to date first. updateMatrixWorld skips anything unchanged, so this is cheap.
    scene.updateMatrixWorld();
    const rect = stage.getBoundingClientRect();
    pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNdc, flycam.three);
    return raycaster;
  }

  let drag = null; // { kind: "gizmo" | "place" | "tap", ... }

  function previewPart(id, state) {
    const mesh = meshOf(id);
    if (mesh) {
      if (state.position) mesh.position.set(state.position[0], state.position[1], state.position[2]);
      if (state.size && id !== SPAWN_ID) mesh.scale.set(state.size[0], state.size[1], state.size[2]);
      if (state.rotation) {
        if (id === SPAWN_ID) mesh.rotation.y = state.rotation[1] * DEG;
        else mesh.rotation.set(state.rotation[0] * DEG, state.rotation[1] * DEG, state.rotation[2] * DEG, "XYZ");
      }
      if (id === SPAWN_ID && state.position) {
        mesh.position.y = state.position[1] - SPAWN_SIZE[1] / 2;
      }
    }
    const outline = outlines.get(id);
    if (outline && mesh) {
      outline.position.copy(mesh.position);
      outline.rotation.copy(mesh.rotation);
      const size = state.size || (id === SPAWN_ID ? SPAWN_SIZE : partOf(id).size);
      outline.scale.set(size[0] * 1.002, size[1] * 1.002, size[2] * 1.002);
    }
    const badge = badges.get(id);
    if (badge && state.position) {
      const size = state.size || partOf(id).size;
      badge.position.set(state.position[0], state.position[1] + size[1] / 2 + BADGE_LIFT, state.position[2]);
    }
  }

  function pivotOfStates(ids, states) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    ids.forEach((id, i) => {
      const state = states[i];
      const size = state.size || (id === SPAWN_ID ? SPAWN_SIZE : partOf(id).size);
      for (let k = 0; k < 3; k++) {
        min[k] = Math.min(min[k], state.position[k] - size[k] / 2);
        max[k] = Math.max(max[k], state.position[k] + size[k] / 2);
      }
    });
    return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  }

  // Spec 04 rejects a non-uniform sphere and a cylinder whose x and z differ, and a
  // Place that fails validation can be neither tested nor shared. JUDGEMENT CALL (the
  // spec's scale table does not mention it): the constraint is applied as the handle is
  // dragged, so those shapes simply cannot be pulled into an invalid size.
  function constrainSize(shape, size, changedAxis) {
    const out = size.slice();
    if (shape === "sphere") {
      const v = out[changedAxis === undefined ? 0 : changedAxis];
      return [v, v, v];
    }
    if (shape === "cylinder" && changedAxis !== 1) {
      const v = out[changedAxis === undefined ? 0 : changedAxis];
      return [v, out[1], v];
    }
    return out;
  }

  function clampSize(v, grid) {
    return Math.min(SIZE_MAX, Math.max(grid, snapTo(v, grid)));
  }

  function computeDragStates(result) {
    const grid = doc.editor.grid;
    return drag.ids.map((id, i) => {
      const before = drag.before[i];
      const state = deepCopy(before);
      if (result.mode === "move") {
        const axis = result.handle === "x" ? 0 : (result.handle === "y" ? 1 : 2);
        // "position = start + axis·snapped" (§5.5), NOT a re-snap onto the absolute
        // grid: a part resting on an off-grid surface has to keep resting on it, and
        // the drag distance is what the grid quantises.
        state.position[axis] = round2(before.position[axis] + result.snapped);
      } else if (result.mode === "rotate") {
        const axis = result.handle === "x" ? 0 : (result.handle === "y" ? 1 : 2);
        // Multi-select rotates each part about its OWN centre — positions never move
        // (§5.5; pivot-orbit is deferred in §10).
        if (id === SPAWN_ID) {
          state.rotation = [0, normalizeDeg((before.rotation[1] || 0) + result.snapped), 0];
        } else {
          state.rotation[axis] = normalizeDeg(before.rotation[axis] + result.snapped);
        }
      } else if (result.mode === "scale" && state.size) {
        const part = partOf(id);
        if (result.handle === "uniform") {
          const factor = 1 + (result.raw || 0) / 2;
          state.size = constrainSize(part.shape, [
            clampSize(before.size[0] * factor, grid),
            clampSize(before.size[1] * factor, grid),
            clampSize(before.size[2] * factor, grid),
          ]);
        } else {
          const axis = result.handle === "x" ? 0 : (result.handle === "y" ? 1 : 2);
          const next = state.size.slice();
          next[axis] = clampSize(before.size[axis] + result.snapped, grid);
          state.size = constrainSize(part.shape, next, axis);
        }
      }
      return state;
    });
  }

  function normalizeDeg(deg) {
    // spec 04 accepts -360..360; wrapping keeps a spun part inside that window.
    let v = deg % 360;
    if (v > 360) v -= 360;
    if (v < -360) v += 360;
    return v;
  }

  function sameStates(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function onPointerDown(ev) {
    if (disposed || drag) return;
    if (ev.target !== stage) return; // a Studio panel or a fly button owns this pointer
    if (ev.pointerType === "mouse" && ev.button !== 0) return; // RMB is flycam's look

    const caster = rayFrom(ev.clientX, ev.clientY);
    // 1. the gizmo gets first refusal (§5.3 touch rule 2) — except while a "Pick part…"
    // field is waiting for a tap, where every tap belongs to the pick.
    const handle = pickMode ? null : gizmo.hitTest(caster);
    if (handle && selection.length > 0) {
      if (!gizmo.startDrag(handle, caster.ray, flycam.three)) return;
      drag = {
        kind: "gizmo",
        pointerId: ev.pointerId,
        ids: selection.slice(),
        before: selection.map(transformStateOf),
        last: null,
      };
      capturePointer(ev.pointerId);
      ev.stopPropagation();
      ev.preventDefault();
      return;
    }

    // 2. place mode consumes the pointer too — a ghost following the finger must not
    // also spin the camera.
    if (armedShape) {
      drag = { kind: "place", pointerId: ev.pointerId, def: updateGhost(ev.clientX, ev.clientY) };
      capturePointer(ev.pointerId);
      ev.stopPropagation();
      ev.preventDefault();
      return;
    }

    // 3. an undecided tap. No stopPropagation: on touch this same finger is flycam's
    // look finger until it turns out to have been a tap.
    drag = {
      kind: "tap",
      pointerId: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      t: performance.now(),
      additive: ev.shiftKey === true || multiTouchSelect,
    };
  }

  function onPointerMove(ev) {
    if (disposed) return;
    if (!drag && ev.target !== stage) return;
    if (!drag || ev.pointerId !== drag.pointerId) {
      // Desktop place mode previews under the bare cursor, with no button held.
      if (!drag && armedShape && ev.pointerType === "mouse") updateGhost(ev.clientX, ev.clientY);
      return;
    }
    if (drag.kind === "gizmo") {
      const caster = rayFrom(ev.clientX, ev.clientY);
      const result = gizmo.drag(caster.ray, doc.editor.grid);
      if (!result) return;
      const states = computeDragStates(result);
      drag.last = states;
      // Meshes only — the doc is written once, at pointer-up, as ONE command (§5.4).
      drag.ids.forEach((id, i) => previewPart(id, states[i]));
      gizmo.setPivot(pivotOfStates(drag.ids, states));
      ev.stopPropagation();
      ev.preventDefault();
    } else if (drag.kind === "place") {
      drag.def = updateGhost(ev.clientX, ev.clientY);
      ev.stopPropagation();
    } else if (drag.kind === "tap") {
      const moved = Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y);
      if (moved > TAP_SLOP) drag.kind = "look"; // it was a camera drag after all
    }
  }

  function onPointerUp(ev) {
    if (disposed || !drag || ev.pointerId !== drag.pointerId) return;
    if (drag.kind === "tap" && ev.target !== stage) {
      drag = null; // the finger drifted off the stage; that is not a tap on the world
      return;
    }
    const finished = drag;
    drag = null;
    if (stage.hasPointerCapture && stage.hasPointerCapture(ev.pointerId)) {
      stage.releasePointerCapture(ev.pointerId);
    }

    if (finished.kind === "gizmo") {
      gizmo.endDrag();
      const states = finished.last;
      if (!states || sameStates(states, finished.before)) {
        // A drag that snapped to nothing writes no undo step (§5.5); the meshes are
        // put back where the doc still says they are.
        finished.ids.forEach((id, i) => previewPart(id, finished.before[i]));
        refreshGizmo();
        return;
      }
      ed.applyTransformFrom(finished.ids, finished.before, states);
      if (deps.audio) deps.audio.playSfx("click", { volume: 0.4 });
      refreshGizmo();
      ev.stopPropagation();
      return;
    }

    if (finished.kind === "place") {
      commitPlacement(finished.def || updateGhost(ev.clientX, ev.clientY));
      ev.stopPropagation();
      return;
    }

    if (finished.kind === "tap") {
      const elapsed = performance.now() - finished.t;
      const moved = Math.hypot(ev.clientX - finished.x, ev.clientY - finished.y);
      if (elapsed > TAP_MS || moved > TAP_SLOP) return;
      selectAtPointer(ev.clientX, ev.clientY, finished.additive);
    }
  }

  function onPointerCancel(ev) {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    if (drag.kind === "gizmo") {
      gizmo.endDrag();
      drag.ids.forEach((id, i) => previewPart(id, drag.before[i]));
      refreshGizmo();
    }
    drag = null;
  }

  // pickMode: the property panel's "Pick part…" button (§5.6.3 partId control) borrows
  // the next tap instead of changing the selection.
  let pickMode = null; // { resolve(id | null) }

  function selectAtPointer(clientX, clientY, additive) {
    const caster = rayFrom(clientX, clientY);
    const hits = caster.intersectObjects(pickables(), true);
    let id = null;
    for (const hit of hits) {
      let node = hit.object;
      while (node && id === null) {
        if (node.userData && node.userData.oofStudioId) id = node.userData.oofStudioId;
        node = node.parent;
      }
      if (id !== null) break;
    }

    if (pickMode) {
      const resolve = pickMode.resolve;
      pickMode = null;
      stage.style.cursor = "";
      resolve(id === SPAWN_ID ? null : id);
      notify();
      return;
    }

    if (id === null) {
      if (!additive) ed.setSelection([]);
      return;
    }
    if (additive && id !== SPAWN_ID) {
      const next = selection.includes(id)
        ? selection.filter((s) => s !== id)
        : selection.filter((s) => s !== SPAWN_ID).concat(id);
      ed.setSelection(next);
    } else {
      ed.setSelection([id]);
    }
    if (deps.audio) deps.audio.playSfx("click", { volume: 0.35 });
  }

  // Attached to WINDOW in the capture phase, not to the stage: at-target listeners run
  // in registration order regardless of their capture flag, and flycam registered its
  // own stage listeners first — so a gizmo drag would also have started a camera look.
  // An ancestor capture listener always runs first, and its stopPropagation keeps the
  // event from reaching the stage at all. Only events whose target IS the stage count;
  // the fly buttons and every Studio panel are different elements and keep their own handlers.
  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerCancel, true);

  // ===================================================================================
  // ===== keyboard map (§5.4) =========================================================
  // ===================================================================================

  function typingInAField() {
    const active = document.activeElement;
    if (!active) return false;
    const tag = active.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || active.isContentEditable === true;
  }

  function onKeyDown(ev) {
    if (disposed || typingInAField()) return;
    const meta = ev.ctrlKey || ev.metaKey;
    const key = ev.key.toLowerCase();

    if (meta && key === "z") {
      ev.preventDefault();
      if (ev.shiftKey) ed.redo();
      else ed.undo();
      return;
    }
    if (meta && key === "y") {
      ev.preventDefault();
      ed.redo();
      return;
    }
    if (meta && key === "d") {
      ev.preventDefault();
      ed.duplicateSelected();
      return;
    }
    if (meta) return; // every other Ctrl/Cmd chord belongs to the browser

    if (key === "delete" || key === "backspace") {
      ev.preventDefault();
      ed.removeSelected();
      return;
    }
    if (key === "escape") {
      if (pickMode) {
        const resolve = pickMode.resolve;
        pickMode = null;
        stage.style.cursor = "";
        resolve(null);
      } else if (armedShape) {
        ed.armPlace(null);
      } else {
        ed.setSelection([]);
      }
      return;
    }
    if (key === "1") ed.setTool("select");
    else if (key === "2") ed.setTool("move");
    else if (key === "3") ed.setTool("rotate");
    else if (key === "4") ed.setTool("scale");
    else if (key === "f") ed.focusSelection();
  }
  window.addEventListener("keydown", onKeyDown);

  // ===================================================================================
  // ===== scene build / teardown (§5.2) ===============================================
  // ===================================================================================

  function buildScene() {
    for (const part of doc.world.parts) addEngineMesh(part);
    buildGrid();
    buildSpawnMarker();
    for (const part of doc.world.parts) refreshBadge(part.id);
    refreshOutlines();
    refreshGizmo();
    if (deps.rendererApi) deps.rendererApi.applyLighting(mergePlaceLighting(doc.world.lighting));
  }

  // Removes only what THIS module put in the scene. Engine parts belong to partsApi and
  // are cleared by the caller (playtest) or by closeStudio.
  function teardownVisuals() {
    disposeGhost();
    for (const [, line] of outlines) {
      scene.remove(line);
      owned.delete(line);
      line.material.dispose();
    }
    outlines.clear();
    for (const [, sprite] of badges) {
      scene.remove(sprite);
      owned.delete(sprite);
      sprite.material.dispose();
    }
    badges.clear();
    for (const object of Array.from(owned)) {
      scene.remove(object);
      owned.delete(object);
      // traverse, not a flat check: the spawn marker is a Group whose pad and arrow
      // meshes own their own geometry and materials.
      object.traverse((node) => {
        if (node.geometry && !node.geometry.__shared) node.geometry.dispose();
        if (node.material && node.material.dispose) node.material.dispose();
      });
    }
    gridHelper = null;
    spawnMarker = null;
    gizmo.setVisible(false);
  }

  // ===================================================================================
  // ===== the editor surface ==========================================================
  // ===================================================================================

  Object.assign(ed, {
    onChange(cb) {
      changeListeners.add(cb);
      return () => changeListeners.delete(cb);
    },

    selection: () => selection.slice(),
    selectedParts: () => selection.map(partOf).filter((p) => p !== null),
    isSpawnSelected: () => selection.length === 1 && selection[0] === SPAWN_ID,
    partOf,
    partCount: () => doc.world.parts.length,
    maxParts: MAX_STUDIO_PARTS,
    spawnId: SPAWN_ID,

    getTool: () => tool,
    setTool(next) {
      tool = next;
      if (next !== "place") ed.armPlace(null);
      refreshGizmo();
      notify();
    },

    getArmedShape: () => armedShape,
    armPlace(shape) {
      armedShape = shape || null;
      if (!armedShape) disposeGhost();
      stage.style.cursor = armedShape ? "crosshair" : "";
      refreshGizmo();
      notify();
    },

    setMultiSelectMode(on) {
      multiTouchSelect = !!on;
      notify();
    },
    getMultiSelectMode: () => multiTouchSelect,

    // The one snapper. Gizmo drags and place mode already ran every coordinate through
    // it; the panels' TYPED fields now do too (§5.6.3: "values always displayed snapped
    // to the §3.4 quanta"). A typed 3.33 passes the range check and sits in the doc, but
    // packPlace rounds it to 3.35 — so the Place a friend opens from the share code is
    // not the Place that was built, and nothing in the editor ever said so.
    snapToQuantum: (value, quantum) => snapTo(value, quantum),
    quanta: Object.freeze({ coord: COORD_QUANTUM, degrees: DEG_QUANTUM }),

    getGrid: () => doc.editor.grid,
    setGrid(value) {
      // A view setting, not a command (§5.6.1): it changes how the next drag snaps,
      // never what is already in the doc, so undo has nothing to say about it.
      doc.editor.grid = GRID_OPTIONS.includes(value) ? value : 1;
      buildGrid();
      markDirty();
      notify();
    },
    cycleGrid() {
      const at = GRID_OPTIONS.indexOf(doc.editor.grid);
      ed.setGrid(GRID_OPTIONS[(at + 1) % GRID_OPTIONS.length]);
    },

    focusSelection() {
      const aabb = selectionAabb();
      if (aabb) flycam.focus(aabb);
      else if (spawnMarker) {
        const s = doc.world.spawn;
        flycam.focus({ min: [s[0] - 4, s[1] - 4, s[2] - 4], max: [s[0] + 4, s[1] + 4, s[2] + 4] });
      }
    },

    // beginPickPart() -> Promise<partId | null> — the property panel's partId control.
    beginPickPart() {
      return new Promise((resolve) => {
        if (pickMode) pickMode.resolve(null);
        pickMode = { resolve };
        stage.style.cursor = "crosshair";
        notify();
      });
    },
    isPicking: () => pickMode !== null,

    isDirty: () => dirty,
    clearDirty() {
      dirty = false;
    },

    // Called once per RENDER frame by studio.js. The gizmo is the only thing here that
    // has to track the camera every frame (screen-constant size, §5.5).
    frame() {
      gizmo.update(flycam.three);
    },

    // Playtest borrows the world: the visuals come down on the way in and the whole
    // edit scene is rebuilt from the doc on the way out (§5.8 steps 3 and 3').
    teardownVisuals,
    rebuildScene() {
      teardownVisuals();
      buildScene();
    },

    dispose() {
      disposed = true;
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
      teardownVisuals();
      gizmo.dispose();
      for (const [, edges] of edgesCache) if (edges) edges.dispose();
      edgesCache.clear();
      for (const [, texture] of badgeTextures) texture.dispose();
      badgeTextures.clear();
      changeListeners.clear();
      stack.clear();
    },
  });

  // ===================================================================================
  // ===== debug handle helpers (§8) ===================================================
  // ===================================================================================
  // These dispatch REAL PointerEvents at the stage rather than calling the internals:
  // a smoke test that bypassed the interaction code would prove nothing about it.

  function dispatchPointer(type, clientX, clientY, extra) {
    stage.dispatchEvent(new PointerEvent(type, {
      pointerId: 1, pointerType: "mouse", button: 0, buttons: type === "pointerup" ? 0 : 1,
      clientX, clientY, bubbles: true, cancelable: true, ...(extra || {}),
    }));
  }

  Object.assign(ed, {
    debugPlaceAt(shape, clientX, clientY) {
      ed.armPlace(shape);
      dispatchPointer("pointerdown", clientX, clientY);
      dispatchPointer("pointermove", clientX, clientY);
      dispatchPointer("pointerup", clientX, clientY);
    },

    // debugGizmoDrag(handle, dxPx, dyPx) — grabs the handle where it actually is on
    // screen, so the drag exercises the same ray math a finger would.
    debugGizmoDrag(handle, dxPx, dyPx) {
      if (selection.length === 0 || tool === "select") return false;
      const p = pivot();
      const scale = gizmo.getScale();
      // Where to grab: an arrow/cube handle sits at the tip of its axis, but a rotate
      // RING is a circle around the pivot — grabbing it at the axis tip would land on
      // whichever ring the ray reaches first. For rotate, grab the ring midway between
      // the OTHER two axes, which no other ring passes near.
      const grab = handle === "uniform"
        ? [0, 0, 0]
        : (tool === "rotate"
          ? (handle === "x" ? [0, 0.707, 0.707] : (handle === "y" ? [0.707, 0, 0.707] : [0.707, 0.707, 0]))
          : (handle === "x" ? [1, 0, 0] : (handle === "y" ? [0, 1, 0] : [0, 0, 1])));
      const world = new THREE.Vector3(
        p[0] + grab[0] * scale,
        p[1] + grab[1] * scale,
        p[2] + grab[2] * scale,
      );
      const projected = world.project(flycam.three);
      const rect = stage.getBoundingClientRect();
      const x = rect.left + ((projected.x + 1) / 2) * rect.width;
      const y = rect.top + ((1 - projected.y) / 2) * rect.height;
      dispatchPointer("pointerdown", x, y);
      dispatchPointer("pointermove", x + dxPx, y + dyPx);
      dispatchPointer("pointerup", x + dxPx, y + dyPx);
      return true;
    },

    debugTapAt(clientX, clientY) {
      dispatchPointer("pointerdown", clientX, clientY);
      dispatchPointer("pointerup", clientX, clientY);
    },
  });

  // bringSpawnToCamera() — the world panel's "Bring pad to camera" (§5.6.4). Lives here,
  // not in worldpanel.js, because it needs a raycast against the part meshes and this
  // file is the one that owns THREE and the pickable list.
  Object.assign(ed, {
    bringSpawnToCamera() {
      const pose = flycam.getPose();
      const grid = doc.editor.grid;
      const x = snapTo(pose.pos[0], grid);
      const z = snapTo(pose.pos[2], grid);
      scene.updateMatrixWorld();
      const down = new THREE.Raycaster(
        new THREE.Vector3(x, pose.pos[1], z), new THREE.Vector3(0, -1, 0), 0, 5000,
      );
      // The first part top under the camera, or the ground plane when there is none.
      const hits = down.intersectObjects(partMeshes(), true);
      const y = hits.length ? Math.round(hits[0].point.y * 100) / 100 : 0;
      ed.applyWorld("spawn", [x, y, z]);
    },
  });

  buildScene();
  return ed;
}
