// src/games/tycoon/scripts/plot.js — the tycoon plot: its world (belt, collector,
// buy pads, purchased builds), its drop lifecycle and its purchase rules.
// Spec 10 §5.1 (geometry), §5.5 (drops) and §5.6 (purchases) own this file.
//
// SLICE: spec 10 §4 splits this across three modules — plot.js (builders), drops.js
// (§5.5) and purchases.js (§5.6). The slice owns one file, so those two sections
// live here behind their own headers, exporting exactly the names §4's table gives
// them; splitting them out later is a move, not a rewrite.

import {
  LAYOUT, TUNING, PURCHASES, MILESTONES, CODES, fmt, getPurchase, computeIncome, computeMultiplier,
} from "./config.js";

const LABEL_PX_PER_UNIT = 48; // canvas resolution of a world-space label plate
const LABEL_LINE_RATIO = 0.42; // line height as a fraction of plate height (2 lines)

// ---------------------------------------------------------------------------
// SECTION: world-space labels
// SLICE: spec 10 §5.14 gives these to scripts/labels.js as projected DOM nodes
// (addLabel/setLabel/updateLabels + LABEL_MAX_DIST culling). That module cannot be
// written here — and its projection step needs the THREE camera, which ctx does not
// expose (spec 04 §5.7's ctx.engine.camera is the follow-cam controller, not the
// camera object; reported with this task). The slice draws the same lines as
// procedural canvas plates parented to the scene through parts.addCustom, so the
// pad text, its three §5.1 colour states and the dispose path all already exist.
// ---------------------------------------------------------------------------

function fitFont(c2d, px, text, maxWidth) {
  let size = px;
  for (;;) {
    c2d.font = `bold ${size}px system-ui, "Segoe UI", sans-serif`;
    if (size <= 8 || c2d.measureText(text).width <= maxWidth) return;
    size -= 2;
  }
}

function paintPlate(plate, lines, color) {
  const { canvas, c2d } = plate;
  c2d.clearRect(0, 0, canvas.width, canvas.height);
  c2d.textAlign = "center";
  c2d.textBaseline = "middle";
  c2d.shadowColor = "#000000cc";
  c2d.shadowBlur = 6;
  c2d.shadowOffsetY = 2;
  c2d.fillStyle = color;
  const rows = lines.length;
  const lineH = canvas.height * (rows > 1 ? LABEL_LINE_RATIO : 0.7);
  const top = canvas.height / 2 - ((rows - 1) * lineH) / 2;
  for (let i = 0; i < rows; i++) {
    fitFont(c2d, lineH * 0.8, lines[i], canvas.width * 0.94);
    c2d.fillText(lines[i], canvas.width / 2, top + i * lineH);
  }
  plate.tex.needsUpdate = true;
}

// A camera-facing text plate at a world position. Tracked by parts.addCustom so the
// engine removes it from the scene on dispose; the texture/material are freed by
// disposePlot (the engine only owns part meshes).
function addLabel(ctx, state, key, pos, lines, color, worldW, worldH) {
  const THREE = ctx.engine.THREE;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(worldW * LABEL_PX_PER_UNIT);
  canvas.height = Math.round(worldH * LABEL_PX_PER_UNIT);
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(pos[0], pos[1], pos[2]);
  sprite.scale.set(worldW, worldH, 1);
  const plate = { canvas, c2d: canvas.getContext("2d"), tex, mat, sprite, id: null, drawn: "" };
  paintPlate(plate, lines, color);
  plate.id = ctx.engine.parts.addCustom(sprite);
  state.labels[key] = plate;
  return plate;
}

// Repaint only when the rendered text/colour actually changed (§5.13's "write only
// when the displayed string changes", applied to the world labels too).
function setLabel(state, key, lines, color) {
  const plate = state.labels[key];
  if (!plate) return;
  const stamp = color + "|" + lines.join("\n");
  if (plate.drawn === stamp) return;
  plate.drawn = stamp;
  paintPlate(plate, lines, color);
}

function removeLabel(ctx, state, key) {
  const plate = state.labels[key];
  if (!plate) return;
  ctx.engine.parts.remove(plate.id);
  plate.mat.dispose();
  plate.tex.dispose();
  delete state.labels[key];
}

// ---------------------------------------------------------------------------
// SECTION: builders — spec 10 §5.1
// ---------------------------------------------------------------------------

function track(ctx, state, id, def) {
  const partId = ctx.engine.parts.create(def);
  (state.builtParts[id] || (state.builtParts[id] = [])).push(partId);
  return partId;
}

function box(size, position, color, extra) {
  return Object.assign({
    shape: "box", size, position, rotation: [0, 0, 0], color,
    material: "plastic", transparency: 0, anchored: true, canCollide: true, behaviors: [],
  }, extra);
}

// buildStatic — belt, collector, every buy pad + label, then a silent rebuild of
// everything already owned, in PURCHASES order so restores are deterministic (§5.1).
export function buildStatic(ctx, state) {
  const L = LAYOUT;
  track(ctx, state, "plot", box(L.BELT_SIZE, L.BELT_POS, L.BELT_COLOR, {
    behaviors: [{ type: "conveyor", direction: [0, 0, -1], speed: TUNING.CONVEYOR_SPEED }],
  }));
  for (const sx of [-1, 1]) {
    track(ctx, state, "plot", box(
      L.BELT_WALL_SIZE, [sx * L.BELT_WALL_X, L.BELT_WALL_Y, L.BELT_WALL_Z], L.BELT_WALL_COLOR,
    ));
  }
  track(ctx, state, "plot", box(L.BIN_SIZE, L.BIN_POS, L.BIN_COLOR, { material: "metal" }));
  track(ctx, state, "plot", box(L.BIN_BACK_SIZE, L.BIN_BACK_POS, L.BIN_COLOR));
  track(ctx, state, "plot", box(L.BIN_GLOW_SIZE, L.BIN_GLOW_POS, L.BIN_GLOW_COLOR, {
    material: "neon", transparency: 0.5, canCollide: false,
  }));

  addLabel(ctx, state, "collector", L.COLLECTOR_LABEL_POS, ["COLLECTOR"], L.BIN_GLOW_COLOR, 10, 2);
  addLabel(ctx, state, "sign", L.SIGN_POS, [L.SIGN_TEXT], L.LABEL_COLOR_PLAIN, 13, 2);

  for (const p of PURCHASES) buildPad(ctx, state, p);
  for (const p of PURCHASES) {
    if (state.save.purchased[p.id]) buildPurchase(ctx, state, p.id, { silent: true });
  }
  refreshPadLabels(ctx, state);
}

function buildPad(ctx, state, p) {
  const owned = !!state.save.purchased[p.id];
  const partId = ctx.engine.parts.create(box(
    LAYOUT.PAD_SIZE, p.pad.slice(),
    owned ? LAYOUT.PAD_COLOR_OWNED : LAYOUT.PAD_COLOR_UNOWNED,
    { material: owned ? "plastic" : "neon" },
  ));
  state.padsById[p.id] = { part: partId, pos: p.pad.slice() };
  addLabel(
    ctx, state, "pad:" + p.id,
    [p.pad[0], p.pad[1] + LAYOUT.PAD_LABEL_DY, p.pad[2]],
    padLines(p, owned), LAYOUT.LABEL_COLOR_PLAIN, 7, 2.4,
  );
}

function padLines(p, owned) {
  if (owned) return [p.name, "PURCHASED"];
  return [p.name, p.cost === 0 ? "FREE" : fmt(p.cost)];
}

// An owned pad turns gray plastic (§5.1). ctx exposes no setMaterial, so the pad is
// rebuilt rather than recoloured — one part, only on purchase.
function repaintPad(ctx, state, p) {
  const pad = state.padsById[p.id];
  if (pad) ctx.engine.parts.remove(pad.part);
  buildPadOwned(ctx, state, p);
  setLabel(state, "pad:" + p.id, padLines(p, true), LAYOUT.LABEL_COLOR_OWNED);
}

function buildPadOwned(ctx, state, p) {
  const partId = ctx.engine.parts.create(box(
    LAYOUT.PAD_SIZE, p.pad.slice(), LAYOUT.PAD_COLOR_OWNED, { material: "plastic" },
  ));
  state.padsById[p.id] = { part: partId, pos: p.pad.slice() };
}

// buildPurchase — the §5.1 parts of one purchase. Always silent; `opts` exists
// because §5.1's restore loop passes { silent: true }.
export function buildPurchase(ctx, state, id, opts = {}) {
  const p = getPurchase(id);
  if (!p || state.builtParts[id]) return;
  state.builtParts[id] = [];
  if (p.kind === "dropper") buildDropper(ctx, state, p);
  else if (p.kind === "upgrader") buildArch(ctx, state, p);
  else if (id === "walls1") buildBackWall(ctx, state, p);
  else if (id === "lights") buildLights(ctx, state, p);
  else if (id === "walls3") buildFrontWall(ctx, state, p);
  else if (id === "walls2") buildSideWalls(ctx, state, p);
  else if (id === "roof") buildRoof(ctx, state, p);
  else if (id === "laserdoor") buildBossDoor(ctx, state, p);
  else if (id === "ladder") buildRamp(ctx, state, p);
  else if (id === "helicopter") buildChopper(ctx, state, p);
  else if (id === "bossstatue") buildStatue(ctx, state, p);
  else if (p.kind === "gear") buildGearPad(ctx, state, p);
  else if (id.startsWith("aura")) buildAura(ctx, state, p);
  repaintPad(ctx, state, p);
}

function buildDropper(ctx, state, p) {
  const L = LAYOUT;
  const x = L.DROPPER_SIDE_X * p.side;
  track(ctx, state, p.id, box(L.DROPPER_PILLAR_SIZE, [x, 3, p.dropZ], p.color));
  track(ctx, state, p.id, box(L.DROPPER_BODY_SIZE, [x, 8, p.dropZ], p.color));
  // Arm reaches from the body to the spout over the belt: §5.1's 3.5·side.
  track(ctx, state, p.id, box(L.DROPPER_ARM_SIZE, [(L.DROPPER_SIDE_X / 2) * p.side, 8, p.dropZ], p.color));
  track(ctx, state, p.id, box(L.DROPPER_SPOUT_SIZE, [0, 7, p.dropZ], p.color, {
    material: "neon", canCollide: false,
  }));
  addLabel(
    ctx, state, "machine:" + p.id, [x, L.DROPPER_LABEL_Y, p.dropZ],
    [p.name, fmt(p.value) + " each"], p.color, 8, 2.4,
  );
}

function buildArch(ctx, state, p) {
  const L = LAYOUT;
  const extra = { material: "neon", transparency: L.ARCH_TRANSPARENCY, canCollide: false };
  for (const sx of [-1, 1]) {
    track(ctx, state, p.id, box(L.ARCH_PILLAR_SIZE, [sx * L.ARCH_PILLAR_X, 3, p.archZ], L.ARCH_COLOR, extra));
  }
  track(ctx, state, p.id, box(L.ARCH_BEAM_SIZE, [0, L.ARCH_BEAM_Y, p.archZ], L.ARCH_COLOR, extra));
  addLabel(ctx, state, "machine:" + p.id, [0, L.ARCH_BEAM_Y + 3, p.archZ], ["×3 UPGRADER"], L.ARCH_COLOR, 8, 2);
}

// The rest of §5.1's Buildings rows. Each is only geometry: what a purchase COSTS and
// what it requires is config's business, and nothing here reads the save.

// Two segments with a door gap at centre, per §5.1's walls3 row. No lintel: the gap is
// full height and the Boss Door fills it exactly.
function buildFrontWall(ctx, state, p) {
  const [w, h, t] = LAYOUT.WALLS3_SIZE;
  const [cx, cy, cz] = LAYOUT.WALLS3_POS;
  const gapW = LAYOUT.DOOR_GAP_W;
  const segW = (w - gapW) / 2;
  for (const sx of [-1, 1]) {
    track(ctx, state, p.id, box(
      [segW, h, t],
      [cx + sx * (gapW / 2 + segW / 2), cy, cz],
      LAYOUT.WALLS1_COLOR,
    ));
  }
}

function buildRoof(ctx, state, p) {
  const [w, h, d] = LAYOUT.ROOF_SIZE;
  const [cx, cy, cz] = LAYOUT.ROOF_POS;
  const [hw, hd] = LAYOUT.ROOF_HATCH;
  const steps = LAYOUT.RAMP_STEPS;
  const hx = LAYOUT.RAMP_X;
  const hz = LAYOUT.RAMP_Z0 + (steps - 1) * LAYOUT.RAMP_STEP_SIZE[2]; // the top step
  const minX = cx - w / 2, maxX = cx + w / 2;
  const minZ = cz - d / 2, maxZ = cz + d / 2;
  const holeX0 = hx - hw / 2, holeX1 = hx + hw / 2;
  const holeZ0 = hz - hd / 2, holeZ1 = hz + hd / 2;
  const slab = (x0, x1, z0, z1) => {
    if (x1 - x0 < 0.01 || z1 - z0 < 0.01) return;
    track(ctx, state, p.id, box(
      [x1 - x0, h, z1 - z0],
      [(x0 + x1) / 2, cy, (z0 + z1) / 2],
      LAYOUT.WALLS1_COLOR,
    ));
  };
  slab(minX, holeX0, minZ, maxZ);        // everything west of the hatch
  slab(holeX1, maxX, minZ, maxZ);        // everything east of it
  slab(holeX0, holeX1, minZ, holeZ0);    // the strip south of it
  slab(holeX0, holeX1, holeZ1, maxZ);    // and the strip north
}

// The boss door sits IN the front wall, so it needs the front wall to be there —
// which is what its `requires` row says. It pulses in updatePlot.
function buildBossDoor(ctx, state, p) {
  const id = track(ctx, state, p.id, box(LAYOUT.DOOR_SIZE, LAYOUT.DOOR_POS, LAYOUT.DOOR_COLOR, {
    material: "neon", transparency: 0.25, canCollide: false,
  }));
  state.doorPartId = id;
}

// A stepped ramp rather than a ladder: the character controller climbs steps, and a
// real ladder would need a climb mode the engine does not have.
function buildRamp(ctx, state, p) {
  const rise = (LAYOUT.ROOF_POS[1] + LAYOUT.ROOF_SIZE[1] / 2) / LAYOUT.RAMP_STEPS;
  for (let i = 0; i < LAYOUT.RAMP_STEPS; i++) {
    track(ctx, state, p.id, box(
      LAYOUT.RAMP_STEP_SIZE,
      [LAYOUT.RAMP_X, rise * (i + 1) - 0.5, LAYOUT.RAMP_Z0 + i * LAYOUT.RAMP_STEP_SIZE[2]],
      LAYOUT.RAMP_COLOR,
    ));
  }
}

// §5.8 — a ring of blocks orbiting the plot. Positions are written every step by
// updatePlot; this only creates them and records the tier they belong to.
function buildAura(ctx, state, p) {
  const tier = LAYOUT.AURA_TIERS.find((t) => t.id === p.id);
  if (!tier) return;
  const ids = [];
  for (let i = 0; i < LAYOUT.AURA_COUNT; i++) {
    ids.push(track(ctx, state, p.id, box(tier.size, [tier.radius, tier.height, 0], tier.color, {
      material: "neon", canCollide: false,
    })));
  }
  state.auras.push({ tier, ids });
}

// §5.9 — a helipad, a chopper, and a seat you can actually stand on. The seat carries
// the engine's movingPlatform behavior, so physics carries the rider for free; the
// airframe just follows the seat each step at §5.9's three fixed offsets.
function buildChopper(ctx, state, p) {
  const L2 = LAYOUT;
  track(ctx, state, p.id, box(L2.HELIPAD_SIZE, L2.HELIPAD_POS, L2.HELIPAD_COLOR));
  track(ctx, state, p.id, box(L2.HELI_H_SIZE, L2.HELI_H_POS, L2.HELI_H_COLOR, {
    material: "neon", canCollide: false,
  }));
  const seat = track(ctx, state, p.id, box(L2.HELI_SEAT_SIZE, L2.HELI_SEAT_POS, L2.HELI_H_COLOR, {
    material: "neon",
    behaviors: [{
      type: "movingPlatform",
      waypoints: L2.HELI_WAYPOINTS.map((w) => w.slice()),
      speed: L2.HELI_SPEED,
      pauseS: L2.HELI_PAUSE_S,
      mode: "cycle",
    }],
  }));
  const body = track(ctx, state, p.id, box(L2.HELI_BODY_SIZE, L2.HELI_SEAT_POS, L2.HELI_BODY_COLOR));
  const tail = track(ctx, state, p.id, box(L2.HELI_TAIL_SIZE, L2.HELI_SEAT_POS, L2.HELI_BODY_COLOR));
  const rotor = track(ctx, state, p.id, box(L2.HELI_ROTOR_SIZE, L2.HELI_SEAT_POS, "#2c2c34", {
    behaviors: [{ type: "spinner", axis: "y", speed: L2.ROTOR_SPEED }],
  }));
  state.chopper = {
    seat,
    followers: [
      { id: body, off: L2.HELI_BODY_OFF },
      { id: tail, off: L2.HELI_TAIL_OFF },
      { id: rotor, off: L2.HELI_ROTOR_OFF },
    ],
    ridingSince: null,
  };
}

// §5.10 — the end of the line, and deliberately just a big gold Oof.
function buildStatue(ctx, state, p) {
  const [bx, by, bz] = LAYOUT.STATUE_POS;
  const gold = { material: "metal" };
  track(ctx, state, p.id, box([14, 2, 14], [bx, by, bz], "#6b6b6b"));
  track(ctx, state, p.id, box([6, 6, 3], [bx, by + 5, bz], LAYOUT.STATUE_COLOR, gold));
  track(ctx, state, p.id, box([3.6, 3.6, 3.6], [bx, by + 10, bz], LAYOUT.STATUE_COLOR, gold));
  for (const sx of [-1, 1]) {
    track(ctx, state, p.id, box([2, 6, 2], [bx + sx * 4.5, by + 5.5, bz], LAYOUT.STATUE_COLOR, gold));
    track(ctx, state, p.id, box([2.4, 6, 2.4], [bx + sx * 1.6, by - 1, bz], LAYOUT.STATUE_COLOR, gold));
  }
  addLabel(ctx, state, "machine:bossstatue", [bx, by + 14, bz], ["THE BOSS"], LAYOUT.STATUE_COLOR, 10, 2.6);
}

// A gear pad shows what it sells standing on it, so the plot reads without labels.
function buildGearPad(ctx, state, p) {
  const [x, , z] = p.pad;
  const y = 2.2;
  if (p.id === "sword") {
    track(ctx, state, p.id, box([0.5, 4, 0.5], [x, y + 2, z], "#d9b48f", { canCollide: false }));
    track(ctx, state, p.id, box([2, 0.5, 0.5], [x, y + 0.4, z], "#9b6a3f", { canCollide: false }));
  } else if (p.id === "magiccarpet") {
    track(ctx, state, p.id, box([4, 0.3, 6], [x, y, z], "#b01030", { canCollide: false }));
  } else {
    const color = p.id === "speedcoil" ? "#35e0e0" : p.id === "gravitycoil" ? "#9a5cff" : "#ff8c1a";
    track(ctx, state, p.id, box([1.4, 3.4, 1.4], [x, y + 1, z], color, { material: "neon", canCollide: false }));
  }
}

function buildBackWall(ctx, state, p) {
  track(ctx, state, p.id, box(LAYOUT.WALLS1_SIZE, LAYOUT.WALLS1_POS, LAYOUT.WALLS1_COLOR));
}

function buildLights(ctx, state, p) {
  for (const [x, z] of LAYOUT.LIGHT_XZ) {
    track(ctx, state, p.id, box(LAYOUT.LIGHT_SIZE, [x, LAYOUT.LIGHT_Y, z], LAYOUT.LIGHT_COLOR, {
      material: "neon", canCollide: false,
    }));
  }
}

// Pad labels carry §5.1's three colour states: affordable+eligible, too poor, owned.
function refreshPadLabels(ctx, state) {
  for (const p of PURCHASES) {
    const owned = !!state.save.purchased[p.id];
    if (owned) {
      setLabel(state, "pad:" + p.id, padLines(p, true), LAYOUT.LABEL_COLOR_OWNED);
      continue;
    }
    const ok = state.save.cash >= p.cost && requirementMissing(state, p) === null;
    setLabel(
      state, "pad:" + p.id, padLines(p, false),
      ok ? LAYOUT.LABEL_COLOR_AFFORD : LAYOUT.LABEL_COLOR_POOR,
    );
  }
}

// updatePlot — per-step plot upkeep (§5.15's update order calls it after gear):
// the aura rings orbit, the boss door breathes, and the chopper trails the boss.
// All of it is driven off sim time, never a timer (ARCHITECTURE §5).
export function updatePlot(ctx, state, dt) {
  state.plotTime += dt;
  const t = state.plotTime;

  for (const aura of state.auras) {
    const { tier, ids } = aura;
    for (let i = 0; i < ids.length; i++) {
      const deg = (360 * i) / ids.length + tier.speed * t;
      const rad = (deg * Math.PI) / 180;
      ctx.engine.parts.setPosition(ids[i], [
        Math.cos(rad) * tier.radius,
        tier.height + Math.sin(t * 1.2 + i) * 0.8,
        Math.sin(rad) * tier.radius,
      ]);
    }
  }

  if (state.doorPartId !== null) {
    // A door you cannot walk through yet should still look alive.
    const pulse = 0.15 + 0.2 * (0.5 + 0.5 * Math.sin(2 * Math.PI * LAYOUT.DOOR_PULSE_HZ * t));
    ctx.engine.parts.setTransparency(state.doorPartId, pulse);
  }

  if (state.chopper) {
    // The seat is the authority — it is the part the engine is actually moving. Its
    // live position lives on the mesh (the movingPlatform mover writes there, not to
    // def.position), which is also exactly what the player can see.
    const seatRecord = ctx.engine.parts.get(state.chopper.seat);
    const seatPos = seatRecord && seatRecord.mesh ? seatRecord.mesh.position : null;
    if (seatPos) {
      for (const f of state.chopper.followers) {
        ctx.engine.parts.setPosition(f.id, [
          seatPos.x + f.off[0], seatPos.y + f.off[1], seatPos.z + f.off[2],
        ]);
      }
      // §5.9's ride detection. Standing ON the seat, not merely near it: the vertical
      // window opens at the seat surface and runs to head height, and the streak resets
      // the moment you step off, so a fly-past does not earn it.
      const p = ctx.player.position();
      const flat = Math.hypot(p[0] - seatPos.x, p[2] - seatPos.z);
      const rise = p[1] - seatPos.y;
      const aboard = flat <= LAYOUT.HELI_RIDE_RADIUS
        && rise >= LAYOUT.HELI_RIDE_Y_MIN && rise <= LAYOUT.HELI_RIDE_Y_MAX;
      if (!aboard) {
        state.chopper.ridingSince = null;
      } else {
        state.chopper.ridingSince = (state.chopper.ridingSince || 0) + dt;
        if (state.chopper.ridingSince >= TUNING.HELI_RIDE_BADGE_TIME) {
          ctx.services.badges.award("sky-boss");
          state.chopper.ridingSince = -Infinity; // awarded once; award() is idempotent anyway
        }
      }
    }
  }

  refreshPadLabels(ctx, state);
}

export function disposePlot(ctx, state) {
  for (const key of Object.keys(state.labels)) removeLabel(ctx, state, key);
  for (const id of Object.keys(state.builtParts)) {
    for (const partId of state.builtParts[id]) ctx.engine.parts.remove(partId);
    delete state.builtParts[id];
  }
  for (const id of Object.keys(state.padsById)) {
    ctx.engine.parts.remove(state.padsById[id].part);
    delete state.padsById[id];
  }
}

// ---------------------------------------------------------------------------
// SECTION: drops — spec 10 §5.5 (scripts/drops.js in §4's module table)
// ---------------------------------------------------------------------------

function inCollector(pos) {
  const lo = LAYOUT.COLLECT_MIN;
  const hi = LAYOUT.COLLECT_MAX;
  return pos[0] >= lo[0] && pos[0] <= hi[0] &&
         pos[1] >= lo[1] && pos[1] <= hi[1] &&
         pos[2] >= lo[2] && pos[2] <= hi[2];
}

// One drop cube per §3.5: unanchored, so spec 03 §5.8's dynamics drops it onto the
// belt and the conveyor's surface velocity carries it to the collector. Nothing in
// this file ever moves a drop by hand.
export function spawnDrop(ctx, state, id) {
  const p = getPurchase(id);
  if (!p || p.kind !== "dropper") return null;
  // §5.5 step 2: at the cap the OLDEST drop is credited, never discarded.
  if (state.drops.length >= TUNING.MAX_LIVE_DROPS) collectDrop(ctx, state, 0);
  const s = TUNING.DROP_SIZE;
  const partId = ctx.engine.parts.create({
    shape: "box", size: [s, s, s], position: [0, TUNING.DROP_SPAWN_Y, p.dropZ],
    rotation: [0, 0, 0], color: p.color, material: "neon", transparency: 0,
    anchored: false, canCollide: true, behaviors: [],
  });
  const record = { partId, baseValue: p.value, dropperId: id, bornAt: ctx.time, smacked: false };
  state.drops.push(record);
  ctx.events.emit("game:tycoon.dropSpawned", {
    partId, dropperId: id, value: p.value, z: p.dropZ, time: ctx.time,
  });
  return record;
}

export function collectDrop(ctx, state, i) {
  const record = state.drops[i];
  if (!record) return 0;
  // §5.5 step 4.1. SLICE: boostRemaining only ever leaves 0 through §5.11's BOSSMODE
  // code and `smacked` only through §5.7's sword; the formula is the spec's, so both
  // become live the moment those sections land.
  const boost = state.save.boostRemaining > 0 ? TUNING.BOOST_MULT : 1;
  const smack = record.smacked ? TUNING.SMACK_BONUS : 1;
  const value = Math.round(record.baseValue * state.multiplier * boost * smack);
  state.save.cash += value;
  state.save.totalEarned += value;
  ctx.engine.parts.remove(record.partId);
  state.drops.splice(i, 1);
  if (ctx.time - state.lastCashSfxAt >= TUNING.CASH_SFX_THROTTLE) {
    state.lastCashSfxAt = ctx.time;
    ctx.engine.audio.playSfx("cash");
  }
  ctx.events.emit("game:tycoon.collected", {
    value, cash: state.save.cash, partId: record.partId, dropperId: record.dropperId, time: ctx.time,
  });
  return value;
}

export function updateDrops(ctx, state, dt) {
  for (const p of PURCHASES) {
    if (p.kind !== "dropper" || !state.save.purchased[p.id]) continue;
    const next = state.dropperClocks[p.id];
    if (next === undefined || ctx.time >= next) {
      state.dropperClocks[p.id] = ctx.time + TUNING.DROP_INTERVAL;
      spawnDrop(ctx, state, p.id);
    }
  }
  // Backwards: collectDrop/expiry splice out of this same array.
  for (let i = state.drops.length - 1; i >= 0; i--) {
    const record = state.drops[i];
    const part = ctx.engine.parts.get(record.partId);
    if (!part || !part.def) {
      state.drops.splice(i, 1); // the engine's own despawn plane got there first
      continue;
    }
    const pos = part.def.position;
    if (inCollector(pos)) {
      collectDrop(ctx, state, i);
    } else if (ctx.time - record.bornAt > TUNING.DROP_TTL || pos[1] < TUNING.KILL_Y) {
      ctx.engine.parts.remove(record.partId); // expired or fell off the world: no credit
      state.drops.splice(i, 1);
    }
  }
}

export function disposeDrops(ctx, state) {
  for (const record of state.drops) ctx.engine.parts.remove(record.partId);
  state.drops.length = 0;
}

// ---------------------------------------------------------------------------
// SECTION: purchases — spec 10 §5.6 (scripts/purchases.js in §4's module table)
// ---------------------------------------------------------------------------

// null when every requirement is met, else the blocking purchase record.
// SLICE: §5.4's "ALL_CORE" form (the Boss Chopper's 24-id set) arrives with the
// purchases that make up that set; only §3.3's single-id form exists in the slice.
function requirementMissing(state, p) {
  if (!p.requires) return null;
  if (state.save.purchased[p.requires]) return null;
  return getPurchase(p.requires) || { name: p.requires };
}

// Walking onto an unowned pad buys it: one attempt per PAD_DEBOUNCE, whatever the
// outcome, so a player standing on a pad they cannot afford is not spammed (§5.6).
export function updatePurchases(ctx, state) {
  if (ctx.time < state.padDebounceUntil) return;
  const a = ctx.player.position();
  if (a[1] < 0 || a[1] > 5) return;
  for (const p of PURCHASES) {
    if (state.save.purchased[p.id]) continue;
    if (Math.abs(a[0] - p.pad[0]) <= TUNING.PAD_RADIUS && Math.abs(a[2] - p.pad[2]) <= TUNING.PAD_RADIUS) {
      tryPurchase(ctx, state, p.id);
      state.padDebounceUntil = ctx.time + TUNING.PAD_DEBOUNCE;
      return;
    }
  }
}

export function tryPurchase(ctx, state, id) {
  const p = getPurchase(id);
  if (!p) return { ok: false, reason: "owned" };
  if (state.save.purchased[id]) {
    // Standing on gear you already own is how you pick it up (and put it down):
    // a pad that does nothing on the second touch reads as broken.
    if (p.kind === "gear") equipGear(ctx, state, state.save.equipped === id ? null : id);
    return { ok: false, reason: "owned" };
  }
  const missing = requirementMissing(state, p);
  if (missing) {
    ctx.services.ui.toast("Requires: " + missing.name, { icon: "🔒" });
    ctx.engine.audio.playSfx("error");
    return { ok: false, reason: "requires" };
  }
  if (state.save.cash < p.cost) {
    if (ctx.time >= state.poorToastAt) {
      state.poorToastAt = ctx.time + 1; // §5.6 step 3: at most one "Need $X!" per second
      ctx.services.ui.toast("Need " + fmt(p.cost) + "!", { icon: "💸" });
    }
    ctx.engine.audio.playSfx("error");
    return { ok: false, reason: "cash" };
  }
  state.save.cash -= p.cost;
  applyPurchase(ctx, state, id, {});
  return { ok: true };
}

export function applyPurchase(ctx, state, id, opts = {}) {
  const p = getPurchase(id);
  if (!p) return;
  state.save.purchased[id] = true;
  state.multiplier = computeMultiplier(state.save);
  state.incomePerSec = computeIncome(state.save);
  buildPurchase(ctx, state, id);
  // §5.6 step 4: buying gear adds a hotbar slot and never auto-equips — being
  // silently given 30 walk speed is disorienting when you did not ask for it.
  if (!opts.silent) {
    ctx.engine.audio.playSfx("buy");
    ctx.services.ui.toast(p.name + " purchased!", { icon: "🏭" });
  }
  ctx.events.emit("game:tycoon.purchased", { id, cost: p.cost, cash: state.save.cash });
  checkMilestones(ctx, state);
  saveNow(ctx, state);
}

// Milestones are the ONLY Cash -> Oofbux bridge (§5.11), paid once per save through
// the economy service (which applies its own source caps).
export function checkMilestones(ctx, state) {
  for (const m of MILESTONES) {
    if (state.save.milestones.includes(m.id) || !m.test(state.save)) continue;
    state.save.milestones.push(m.id);
    ctx.services.economy.award(m.oofbux, "tycoon:" + m.id);
    if (m.badgeId) ctx.services.badges.award(m.badgeId);
    ctx.services.ui.toast("Milestone: " + m.label + " +" + m.oofbux + " Oofbux", { icon: "🏅" });
  }
}

// §5.4 — equip one piece of gear, or none. Ownership is validated rather than
// trusted: the hotbar is built from the save, but so is everything else, and a
// corrupted save should not hand out a Magic Carpet.
export function equipGear(ctx, state, idOrNull) {
  if (idOrNull !== null) {
    const p = getPurchase(idOrNull);
    if (!p || p.kind !== "gear" || !state.save.purchased[idOrNull]) return;
  }
  state.save.equipped = idOrNull;
  const p = idOrNull ? getPurchase(idOrNull) : null;
  ctx.player.setWalkSpeed(p ? p.walk : 16);
  ctx.player.setJumpPower(p ? p.jump : 50);
  ctx.engine.audio.playSfx("click");
  saveNow(ctx, state);
}

// §5.11 — redeem a code. Matched case-insensitively after a trim, once each ever.
export function redeemCode(ctx, state, text) {
  const key = String(text == null ? "" : text).trim().toUpperCase();
  const row = CODES.find((c) => c.code === key);
  if (!row) {
    ctx.engine.audio.playSfx("error");
    return { ok: false, message: "Invalid code" };
  }
  if (state.save.codes.includes(row.code)) {
    ctx.engine.audio.playSfx("error");
    return { ok: false, message: "Already redeemed" };
  }
  state.save.codes.push(row.code);
  if (row.cash) state.save.cash += row.cash;
  if (row.boost) state.save.boostRemaining = (state.save.boostRemaining || 0) + row.boost;
  ctx.engine.audio.playSfx(row.sfx || "buy");
  ctx.services.ui.toast(row.message, { icon: "🎟️" });
  saveNow(ctx, state);
  return { ok: true, message: row.message };
}

// §3.1: the save is written after every purchase, on the §6 autosave interval, and
// in dispose. game.js owns the timer; this is the single writer.
export function saveNow(ctx, state) {
  state.saveTimer = 0;
  ctx.services.saves.save(state.save);
}
