// src/platform/hub/scripts/layout.js — the Hub's procedural world: the portal arches
// (one per Place registry row), the badge-wall seam, the hidden parkour route, and the
// canvas-texture signs the Place schema cannot express. Spec 06 §5.3.3 owns this file.
// Everything here reaches the platform through `ctx` only (criterion 26).

// Tuning constants — spec 06 §6 pins these three to this module.
const BEACON_DURATION_S = 5; // cloud-badge celebration beacon
const PARKOUR_BLOCK_COUNT = 15; // jumps incl. the cloud
const BADGE_WALL_SLOTS = 32; // 4x8 plaque grid (see buildBadgeWall)

// Portal geometry — §5.3.3. The §5.3.1 zone map fixes three anchors at x = -50/0/+50
// on z = -70; that is a 50-unit pitch centred on the fountain axis, so the anchors are
// derived from the pitch rather than hard-coded. Three rows reproduce the map exactly;
// the slice's two rows stay centred instead of leaving a hole where `lifting` will go.
const PORTAL_SPACING_X = 50;
const PORTAL_Z = -70;
const PORTAL_FRONT = 0.4; // signs sit this far SOUTH (+z) of the arch plane
const RIBBON_FRONT = 2.4; // NEW! ribbon clears the 4-deep pillars (see buildRibbon)

// Canvas-texture signs: pixels per world unit, and the emoji size §5.3.3 names.
const LABEL_PX_PER_UNIT = 48;
const EMOJI_PX = 128;
const LABEL_FONT = '800 %PXpx ui-sans-serif, system-ui, "Segoe UI", Arial, sans-serif';
const EMOJI_FONT = '%PXpx "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

const PILLAR_COLOR = "#7f8c8d";
const SIGN_COLOR = "#17191c";
const SIGN_TEXT = "#ffffff";
const PLAQUE_GOLD = "#f5c542";
const RIBBON_COLOR = "#ff4757";
const PARKOUR_COLOR = "#cfd8dc";

// The rising spiral of §5.3.3: storefront corner -> cloud over the fountain. Gaps are
// 6-9 units with 3-4 unit rises, clearable at WalkSpeed 16 / Jump 50 with no powerups.
const PARKOUR_STEPS = [
  [60, 3, 60], [54, 6, 52], [46, 9, 45], [40, 13, 37], [33, 17, 30],
  [27, 21, 23], [20, 25, 17], [14, 29, 11], [8, 33, 6], [2, 37, 2],
  [-4, 41, -2], [-8, 45, -6], [-6, 49, -12], [-2, 52, -8],
];

// ---------------------------------------------------------------------------
// canvas textures (ARCHITECTURE §2: assets are procedural, never files)
// ---------------------------------------------------------------------------

function fitFont(c2d, template, text, maxPx, maxWidth) {
  let px = maxPx;
  for (;;) {
    c2d.font = template.replace("%PX", String(px));
    if (px <= 8 || c2d.measureText(text).width <= maxWidth) return;
    px -= 2;
  }
}

// A transparent-background text/emoji plate. `worldW/worldH` are studs; the canvas is
// sized from them so text density is the same on every sign.
function makeLabelMesh(ctx, { text, worldW, worldH, color, font, maxPx }) {
  const THREE = ctx.engine.THREE;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(16, Math.round(worldW * LABEL_PX_PER_UNIT));
  canvas.height = Math.max(16, Math.round(worldH * LABEL_PX_PER_UNIT));
  const c2d = canvas.getContext("2d");
  c2d.clearRect(0, 0, canvas.width, canvas.height);
  c2d.textAlign = "center";
  c2d.textBaseline = "middle";
  c2d.fillStyle = color;
  fitFont(c2d, font, text, maxPx || Math.round(canvas.height * 0.7), canvas.width * 0.9);
  c2d.fillText(text, canvas.width / 2, canvas.height / 2);

  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.scale.set(worldW, worldH, 1);
  mesh.userData.oofLabel = { tex, mat };
  return mesh;
}

function disposeLabelMesh(mesh) {
  const held = mesh.userData.oofLabel;
  if (mesh.parent) mesh.parent.remove(mesh);
  mesh.geometry.dispose();
  if (held) {
    held.mat.dispose();
    held.tex.dispose();
  }
}

// ---------------------------------------------------------------------------
// build tracker — every handle returned below disposes exactly what it created
// ---------------------------------------------------------------------------

function createTracker(ctx) {
  const partIds = [];
  const labels = [];
  return {
    part(def) {
      const id = ctx.engine.parts.create(def);
      partIds.push(id);
      return id;
    },
    // A world-placed sign: its own scene object, so the engine's part scaling never
    // reaches it.
    label(mesh) {
      const id = ctx.engine.parts.addCustom(mesh);
      partIds.push(id);
      labels.push(mesh);
      return { mesh, id };
    },
    // A decal on a part's own mesh, so it inherits that part's motion (the spinning
    // icon plate). Part meshes are unit geometry with `scale = size` (spec 03 §5.2),
    // so the decal's own scale/offset are divided by the host's size to stay square.
    decal(partId, mesh, offset) {
      labels.push(mesh); // tracked before attaching: an unattachable decal still frees
      const record = ctx.engine.parts.get(partId);
      if (!record || !record.mesh) return mesh;
      const size = record.def.size;
      mesh.scale.set(mesh.scale.x / size[0], mesh.scale.y / size[1], 1 / size[2]);
      mesh.position.set(0, 0, 0.5 + offset / size[2]);
      record.mesh.add(mesh);
      return mesh;
    },
    drop(id, mesh) {
      const at = partIds.indexOf(id);
      if (at >= 0) partIds.splice(at, 1);
      if (mesh) {
        const held = labels.indexOf(mesh);
        if (held >= 0) labels.splice(held, 1);
        disposeLabelMesh(mesh);
      }
      ctx.engine.parts.remove(id);
    },
    dispose() {
      for (const mesh of labels) disposeLabelMesh(mesh);
      labels.length = 0;
      for (const id of partIds) ctx.engine.parts.remove(id);
      partIds.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// portals — §5.3.3 buildPortals
// ---------------------------------------------------------------------------

function portalAnchorX(index, count) {
  return (index - (count - 1) / 2) * PORTAL_SPACING_X;
}

function buildOneArch(track, ctx, place, x) {
  const key = "hubPortal_" + place.slug;
  track.part({ id: key + "_pillarW", size: [4, 14, 4], position: [x - 8, 7, PORTAL_Z], color: PILLAR_COLOR, material: "plastic" });
  track.part({ id: key + "_pillarE", size: [4, 14, 4], position: [x + 8, 7, PORTAL_Z], color: PILLAR_COLOR, material: "plastic" });
  track.part({ id: key + "_lintel", size: [20, 4, 4], position: [x, 16, PORTAL_Z], color: PILLAR_COLOR, material: "plastic" });

  // The plane is the trigger: `event` carries no colon (spec 04 ids), so the emitted
  // event is `touch:portal-<slug>` exactly as §5.3.3 requires.
  track.part({
    id: key + "_plane", size: [12, 10, 0.5], position: [x, 6, PORTAL_Z],
    color: place.portalColor, material: "neon", transparency: 0.25, canCollide: false,
    behaviors: [{ type: "touchEvent", event: "portal-" + place.slug }],
  });

  track.part({ id: key + "_sign", size: [16, 3, 0.5], position: [x, 19.5, PORTAL_Z], color: SIGN_COLOR, material: "plastic" });
  track.label(placeLabel(ctx, {
    text: place.name, worldW: 15, worldH: 2.4, color: SIGN_TEXT, font: LABEL_FONT,
    position: [x, 19.5, PORTAL_Z + PORTAL_FRONT],
  }));

  const plateId = track.part({
    id: key + "_icon", size: [4, 4, 0.5], position: [x, 23, PORTAL_Z], color: SIGN_COLOR, material: "plastic",
    behaviors: [{ type: "spinner", axis: "y", speed: 30 }],
  });
  track.decal(plateId, makeLabelMesh(ctx, {
    text: place.icon, worldW: 3.4, worldH: 3.4, color: SIGN_TEXT, font: EMOJI_FONT, maxPx: EMOJI_PX,
  }), 0.1);
}

function placeLabel(ctx, opts) {
  const mesh = makeLabelMesh(ctx, opts);
  mesh.position.set(opts.position[0], opts.position[1], opts.position[2]);
  if (opts.yawDeg) mesh.rotation.y = (opts.yawDeg * Math.PI) / 180;
  return mesh;
}

function buildRibbon(track, ctx, place, x) {
  const key = "hubPortal_" + place.slug;
  // §5.3.3 places the ribbon at A.z - 0.4, which is BEHIND the portal plane as seen
  // from the spawn side (§5.3.1: north is -z, the player always approaches from +z) —
  // and 0.4 also buries it in the 4-deep pillars. Moved to the arch's south face so
  // the ribbon it exists to show is actually visible; reported as a spec defect.
  const z = PORTAL_Z + RIBBON_FRONT;
  const id = track.part({
    id: key + "_ribbon", size: [10, 2, 0.6], position: [x - 4, 10, z], rotation: [0, 0, -20],
    color: RIBBON_COLOR, material: "neon", canCollide: false,
  });
  const label = track.label(placeLabel(ctx, {
    text: "NEW!", worldW: 9, worldH: 1.6, color: SIGN_TEXT, font: LABEL_FONT,
    position: [x - 4, 10, z + 0.4],
  }));
  label.mesh.rotation.z = (-20 * Math.PI) / 180;
  return { id, label };
}

// places = the shell's registry snapshot (platform:places payload); visited = the
// profile's visitedPlaces. Returns a handle whose `forget(slug)` strips one ribbon.
export function buildPortals(ctx, places, visited) {
  const track = createTracker(ctx);
  const rows = (places || []).filter((p) => p && p.portalColor && !p.hidden);
  const seen = visited || [];
  const ribbons = new Map();

  rows.forEach((place, i) => {
    const x = portalAnchorX(i, rows.length);
    buildOneArch(track, ctx, place, x);
    if (!seen.includes(place.slug)) ribbons.set(place.slug, buildRibbon(track, ctx, place, x));
  });

  return {
    count: rows.length,
    slugs: rows.map((p) => p.slug),
    // Live NEW!-ribbon removal when the shell reports that Place loaded (§5.3.3 point 6).
    forget(slug) {
      const ribbon = ribbons.get(slug);
      if (!ribbon) return false;
      ribbons.delete(slug);
      track.drop(ribbon.label.id, ribbon.label.mesh);
      track.drop(ribbon.id);
      return true;
    },
    dispose() {
      ribbons.clear();
      track.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// badge wall — §5.3.3 buildBadgeWall
// ---------------------------------------------------------------------------

// SLICE: the plaque grid (06 §5.3.3 buildBadgeWall — BADGE_WALL_SLOTS = 32 plaques in
// 4 rows x 8 columns on x = -73.9, gold for earned / dark for unearned / "?" for
// unearned secrets, "+N" in the last slot past 32 defs, live swap on `badge:awarded`)
// is deferred with the rest of Badges (SLICE.md). It reads `badges.all()` and
// `badges.getDef(id)`, which arrive with badges.js (spec 07 §5.7); the slice's badge
// surface is award/has/list only. The wall, cap, buttresses, bench and sign it hangs
// on are in place.json, so filling this in is this function's body and nothing else.
export function buildBadgeWall(ctx) {
  const registry = ctx.services.badges;
  const ready = registry && typeof registry.all === "function" && typeof registry.getDef === "function";
  return {
    slots: BADGE_WALL_SLOTS,
    count: 0,
    pending: !ready,
    dispose() {},
  };
}

// ---------------------------------------------------------------------------
// parkour + cloud badge — §5.3.3 buildParkour
// ---------------------------------------------------------------------------

export function buildParkour(ctx) {
  const track = createTracker(ctx);
  PARKOUR_STEPS.forEach((pos, i) => {
    track.part({ id: "hubParkour_" + i, size: [4, 1, 4], position: pos, color: PARKOUR_COLOR, material: "plastic" });
  });
  track.part({ id: "hubParkour_cloud", size: [14, 2, 14], position: [0, 55, 0], color: "#ffffff", material: "plastic" });
  const triggerId = track.part({
    id: "hubParkour_top", size: [14, 6, 14], position: [0, 59, 0], transparency: 1, canCollide: false,
    behaviors: [{ type: "touchEvent", event: "cloudTop" }],
  });

  let beaconId = null;
  let beaconUntil = 0;

  return {
    blocks: PARKOUR_BLOCK_COUNT,
    triggerId,
    // The 5 s celebration beacon of §5.3.3. Timed on ctx.time in `update` — sim time
    // only, never a timer (ARCHITECTURE §5).
    celebrate(now) {
      if (beaconId === null) {
        beaconId = track.part({
          id: "hubParkour_beacon", size: [2, 40, 2], shape: "cylinder", position: [0, 76, 0],
          color: PLAQUE_GOLD, material: "neon", transparency: 0.6, canCollide: false,
        });
      }
      beaconUntil = now + BEACON_DURATION_S;
    },
    update(dt, now) {
      if (beaconId === null || now < beaconUntil) return;
      track.drop(beaconId);
      beaconId = null;
    },
    dispose() {
      beaconId = null;
      track.dispose();
    },
  };
}

// ---------------------------------------------------------------------------
// static-part signage — §5.3.2 rows `shopSign` and `badgeWallSign`
// ---------------------------------------------------------------------------

// Those two rows are authored in place.json as plain plates because the Place schema
// (spec 04 §3.1) has no texture field; their canvas text is procedural, here.
export function buildSigns(ctx) {
  const track = createTracker(ctx);
  track.label(placeLabel(ctx, {
    text: "CATALOG", worldW: 18, worldH: 3.2, color: PLAQUE_GOLD, font: LABEL_FONT,
    position: [64.6, 15, 0], yawDeg: -90,
  }));
  track.label(placeLabel(ctx, {
    text: "BADGE WALL", worldW: 18, worldH: 2.4, color: PLAQUE_GOLD, font: LABEL_FONT,
    position: [-73.6, 12.5, 0], yawDeg: 90,
  }));
  return { dispose: track.dispose };
}
