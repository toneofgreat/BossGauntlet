// src/games/obby/scripts/layout.js — the deterministic world build: hop mathematics,
// obstacle segments, checkpoints/gates/signs/connectors, the winners' area and the
// per-stage kill floors. Spec 08 §5.4-§5.8 own this file.
// Pure ESM, no DOM / THREE / ctx (spec 08 §8.1 R0) — tools import it under Node to run
// the route check, so it must stay runnable outside a browser.
// SLICE: spec 08 §4 splits the obstacle emitters into scripts/segments.js; the slice
// builds through one owned file, so `createSegments` lives here beside `buildLayout`.
// The split is a file move, not a rewrite: the factory already closes over `st` exactly
// as §4's table describes.

import { DIFFS, ROSTER, HEADINGS, ANCHOR, TUNE, FEAS, mulberry32 } from "./config.js";

export const LAYOUT_VERSION = "1";

const LAT_LEASH = 10; // §5.5 step 1: how far a hop may wander off the row centre line
const CP_GAP = 2.5; // §5.4 step 2: every non-first checkpoint hops in at this gap
const CP_RISE = 0;

// 2-decimal quantization of every emitted coordinate (§5.4). `-0` normalizes to `0`.
function F(v) {
  const r = Math.round(v * 100) / 100;
  return r === 0 ? 0 : r;
}

// Distance from a box centre to its edge along the unit direction (ux,uz) (§5.5).
function edgeDist(hx, hz, ux, uz) {
  const ax = Math.abs(ux);
  const az = Math.abs(uz);
  return Math.min(ax < 1e-9 ? Infinity : hx / ax, az < 1e-9 ? Infinity : hz / az);
}

// Perceived brightness gate of §5.7.1: near-black difficulty colours would be unreadable
// as label text, so they are lightened instead.
function labelColor(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 0.18 ? "#e0e0e0" : hex;
}

// Which way a text plane has to look. §3.4/§5.7.1 give a StageLabel `yaw: heading.yaw`,
// which points its FRONT along the heading — away from the climber walking that way, who
// then reads the mirrored back face. Signs face back down the path instead. Reported as
// a spec defect; the label geometry is otherwise exactly §5.7.1's.
function signYaw(heading) {
  return ((heading.yaw + 360) % 360) - 180;
}

function diffByName(name) {
  const row = DIFFS.find((d) => d.name === name);
  if (!row) throw new Error(`obby layout: no DIFFS row for "${name}" (spec 08 §5.2)`);
  return row;
}

// ---------------------------------------------------------------------------
// Core: generator state + hop mathematics (§5.5) + part/node emission.
// ---------------------------------------------------------------------------

function createCore(rng) {
  const st = {
    heading: HEADINGS.E,
    node: null,
    stage: null,
    d: null,
    rowLat: 0,
    sinceSpin: 99,
    count: true,
    deco: true,
  };

  const rr = (a, b) => a + rng() * (b - a);
  const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const perp = () => ({ x: -st.heading.uz, z: st.heading.ux });

  // Authored sizes are [alongHeading, height, lateral]; headings are axis-aligned, so
  // "heading-oriented" is an axis swap and every generated box stays at yaw 0 (§3.2:
  // "0 for most parts") rather than carrying an OBB rotation.
  const orient = (along, lateral) => (st.heading.uz === 0 ? [along, lateral] : [lateral, along]);

  function part(kind, pos, size, extra) {
    const p = {
      kind,
      pos: [F(pos[0]), F(pos[1]), F(pos[2])],
      size: [F(size[0]), F(size[1]), F(size[2])],
      yaw: 0,
    };
    if (extra) Object.assign(p, extra);
    st.stage.parts.push(p);
    return p;
  }

  function pushNode(node) {
    st.stage.path.push(node);
    st.node = node;
    return node;
  }

  function decorate(x, z, top, sx, sz) {
    if (sx >= 4 && sz >= 4 && rng() < 0.3) part("deco", [x, top - 4, z], [1.2, 6, 1.2]);
    if (st.d.glitch && rng() < 0.35) {
      const p = perp();
      const off = (rng() < 0.5 ? 1 : -1) * (sx / 2 + rr(2, 4));
      part("deco", [x + p.x * off, top - rr(6, 12), z + p.z * off], [0.9, 0.9, 0.9]);
    }
  }

  function plat(xRaw, zRaw, topRaw, sx, sz, hop, kind = "platform") {
    const x = F(xRaw);
    const z = F(zRaw);
    const top = F(topRaw);
    part(kind, [x, top - 0.5, z], [sx, 1, sz]);
    pushNode({ x, z, top, hx: F(sx / 2), hz: F(sz / 2), hop });
    if (kind === "platform" && st.count) st.stage.budget += 1;
    if (st.deco) decorate(x, z, top, sx, sz);
  }

  // Land a new footprint at edge-to-edge gap `g`, height change `rise` and lateral
  // shift `lat` from st.node (§5.5). The solve is iterative because the realized edge
  // gap of a laterally-shifted hop is not the straight-line distance.
  function hopTarget(g, rise, lat, nhx, nhz) {
    const from = st.node;
    const h = st.heading;
    const p = perp();
    let shift = lat;
    const curLat = h.uz === 0 ? p.z * (from.z - st.rowLat) : 0;
    if (curLat + shift > LAT_LEASH) shift = -Math.abs(shift);
    else if (curLat + shift < -LAT_LEASH) shift = Math.abs(shift);

    let A = g + from.hx + nhx + 1;
    for (let attempt = 0; attempt < 8; attempt++) {
      for (let i = 0; i < 6; i++) {
        const vx = h.ux * A + p.x * shift;
        const vz = h.uz * A + p.z * shift;
        const len = Math.hypot(vx, vz) || 1e-9;
        A += g + edgeDist(from.hx, from.hz, vx / len, vz / len) + edgeDist(nhx, nhz, vx / len, vz / len) - len;
        if (A < 0.5) A = 0.5;
      }
      const vx = h.ux * A + p.x * shift;
      const vz = h.uz * A + p.z * shift;
      const len = Math.hypot(vx, vz) || 1e-9;
      const realized = len - edgeDist(from.hx, from.hz, vx / len, vz / len) - edgeDist(nhx, nhz, vx / len, vz / len);
      if (realized <= g + 0.25 || Math.abs(shift) < 0.4) break;
      shift *= 0.55;
    }
    return {
      x: from.x + h.ux * A + p.x * shift,
      z: from.z + h.uz * A + p.z * shift,
      top: from.top + rise,
    };
  }

  // Height change for a hop of gap `g`, kept inside the COMBO_MAX envelope (§5.5).
  function pickRise(g) {
    const cap = Math.min(2, (FEAS.COMBO_MAX - g) / 1.3 - 0.15, FEAS.RISE_MAX);
    let rise;
    if (rng() < 0.55 || cap <= 0.3) rise = rng() < 0.5 ? 0 : -rr(0.3, 1.5);
    else rise = rr(0.3, Math.max(0.31, cap));
    // §5.4 rise clamp: the path never sinks below MIN_TOP_Y.
    if (st.node.top < TUNE.MIN_TOP_Y && rise <= 0) rise = rr(0.3, Math.min(2, cap));
    return rise;
  }

  return { st, rng, rr, ri, perp, orient, part, pushNode, plat, hopTarget, pickRise };
}

// ---------------------------------------------------------------------------
// Segments (§5.5). Each returns the number of counted platforms it consumed.
// SLICE: segBeam / segChecker / segHug (§5.5) are not in the slice — no slice roster
// row draws the beams, checker or squeeze themes (§5.6 themesFor: they unlock at
// Difficult, Challenging and Hard's hug branch). They fill in from §5.5 alongside the
// §5.3 roster rows that use them.
// ---------------------------------------------------------------------------

function createSegments(core) {
  const { st, rng, rr, ri, perp, orient, part, plat, hopTarget, pickRise } = core;

  function segJump(opts = {}) {
    const d = st.d;
    const g = opts.g !== undefined ? opts.g : rr(d.gMin, d.gMax);
    const rise = opts.rise !== undefined ? opts.rise : pickRise(g);
    const lat = opts.lat !== undefined ? opts.lat : rr(-3.5, 3.5);
    const s = opts.size !== undefined ? opts.size : d.size;
    const t = hopTarget(g, rise, lat, s / 2, s / 2);
    plat(t.x, t.z, t.top, s, s, "jump");
    const dc = opts.decoyChance !== undefined ? opts.decoyChance : d.decoy;
    // A decoy is the mirror of the real landing: it reads as the obvious platform and
    // kills. Only worth emitting when the shift is wide enough to be a real choice.
    if (dc && rng() < dc && Math.abs(lat) * 2 >= s + 1.6) {
      const p = perp();
      part("killTile", [t.x - p.x * lat * 2, t.top - 0.5, t.z - p.z * lat * 2], [s, 1, s]);
    }
    return 1;
  }

  function segWalkway(nParts, len, w, headhitter) {
    const [sx, sz] = orient(len, w);
    let mid = null;
    for (let i = 0; i < nParts; i++) {
      const t = hopTarget(-0.05, 0, i === 0 ? 0 : rr(-1, 1), sx / 2, sz / 2);
      plat(t.x, t.z, t.top, sx, sz, "walk");
      if (i === Math.floor((nParts - 1) / 2)) mid = { x: F(t.x), z: F(t.z), top: F(t.top) };
    }
    // Head-height slab: walk under (avatar 5 tall), jump and you bonk. HEADHITTER_CLR
    // is the wall BOTTOM above the deck; the 1.2-tall slab centres 0.6 higher.
    if (headhitter && mid) {
      part("wall", [mid.x, mid.top + FEAS.HEADHITTER_CLR + 0.6, mid.z], [sx, 1.2, sz]);
    }
    return nParts;
  }

  function segSpinner() {
    const d = st.d;
    const g = rr(d.gMin, d.gMax);
    const rise = pickRise(g);
    const lat = rr(-2, 2);
    const t = hopTarget(g, rise, lat, 6, 6);
    plat(t.x, t.z, t.top, 12, 12, "jump");
    const R = TUNE.SPIN_R;
    part("spinnerHub", [t.x, t.top + 0.6, t.z], [3, 1.2, 3]);
    const bars = ri(1, 2);
    // Two limits, whichever is tighter: tip speed stays under the difficulty's cap, and
    // consecutive arms never pass faster than SPIN_PASS_MIN_S apart (§5.10).
    const tipLimit = (d.spin * 180) / (Math.PI * R);
    const passLimit = 360 / (2 * bars) / TUNE.SPIN_PASS_MIN_S;
    const spin = F(Math.min(tipLimit, passLimit) * TUNE.SPIN_SAFETY);
    for (let k = 0; k < bars; k++) {
      part("spinnerBar", [t.x, t.top + 0.9, t.z], [2 * R, TUNE.SPIN_BAR_H, TUNE.SPIN_BAR_W], { yaw: k * 90, spin });
    }
    st.sinceSpin = 0;
    return 1;
  }

  return { segJump, segWalkway, segSpinner };
}

// ---------------------------------------------------------------------------
// Stage furniture: checkpoints, gates, signs, connectors, themes (§5.6, §5.7).
// ---------------------------------------------------------------------------

function createStages(core, seg) {
  const { st, rng, rr, perp, orient, part, pushNode, plat, hopTarget } = core;
  const { segJump, segWalkway, segSpinner } = seg;

  function placeCheckpoint(gap, rise) {
    const t = hopTarget(gap, rise, 0, 3, 3);
    const x = F(t.x);
    const z = F(t.z);
    const top = F(t.top);
    part("cpPad", [x, top - 0.5, z], [6, 1, 6]);
    st.stage.cp = [x, top, z, st.heading.yaw];
    pushNode({ x, z, top, hx: 3, hz: 3, hop: "cp" });
    const p = perp();
    part("deco", [x + p.x * 4.5, top + 3, z + p.z * 4.5], [1, 6, 1]);
    st.stage.labels.push({
      text: `STAGE ${st.stage.n}\n${st.stage.name}`,
      pos: [F(x + p.x * 4.5), F(top + 7), F(z + p.z * 4.5)],
      yaw: signYaw(st.heading),
      w: TUNE.LABEL_W,
      h: TUNE.LABEL_H,
      color: labelColor(st.stage.color),
    });
  }

  // The difficulty arch. §5.7.3 hangs the crossbar at deck + 14, so its underside is 13
  // above the deck — clear of FEAS.GATE_CLEARANCE_MIN (12) and of a jumping avatar's
  // 11.37 head reach, which is why walking under an arch never bonks.
  function emitGate(overNode) {
    const p = perp();
    const h = st.heading;
    const [bx, bz] = orient(1.6, 11.1);
    part("gate", [overNode.x + p.x * 4.75, overNode.top + 5, overNode.z + p.z * 4.75], [1.2, 20, 1.2]);
    part("gate", [overNode.x - p.x * 4.75, overNode.top + 5, overNode.z - p.z * 4.75], [1.2, 20, 1.2]);
    part("gate", [overNode.x, overNode.top + 14, overNode.z], [bx, 2, bz]);
    st.stage.labels.push({
      text: st.d.name,
      pos: [F(overNode.x - h.ux * 1.0), F(overNode.top + 14), F(overNode.z - h.uz * 1.0)],
      yaw: signYaw(h),
      w: 10,
      h: 2,
      color: labelColor(st.stage.color),
    });
  }

  function emitSign() {
    const cp = st.stage.cp;
    const p = perp();
    const [bx, bz] = orient(0.4, 4.4);
    part("deco", [cp[0] + p.x * 6.5, cp[1] + 4, cp[2] + p.z * 6.5], [0.4, 16, 0.4]);
    part("sign", [cp[0] + p.x * 6.5, cp[1] + 11.2, cp[2] + p.z * 6.5], [bx, 2.4, bz]);
  }

  // The snake turn: run the row out to ROW_X_LIMIT, drop south a row, reverse.
  function maybeConnector() {
    const h = st.heading;
    const past = (h === HEADINGS.E && st.node.x > TUNE.ROW_X_LIMIT)
      || (h === HEADINGS.W && st.node.x < -TUNE.ROW_X_LIMIT);
    if (!past) return;
    const wasCount = st.count;
    st.count = false;
    let t = hopTarget(2, 0, 0, 5, 5);
    plat(t.x, t.z, t.top, 10, 10, "conn");
    st.heading = HEADINGS.S;
    for (let i = 0; i < 6; i++) {
      const [sx, sz] = orient(20, 8);
      t = hopTarget(-0.05, 0, 0, sx / 2, sz / 2);
      plat(t.x, t.z, t.top, sx, sz, "conn");
    }
    st.heading = h === HEADINGS.E ? HEADINGS.W : HEADINGS.E;
    st.rowLat = st.node.z;
    st.count = wasCount;
  }

  // §5.7.2 specials, by their §5.2 `special` order. Each ends able to hop onward.
  function emitSpecial(order) {
    if (order === 1) {
      // The Beginning owns no generated geometry: place.json holds the island and the
      // plaza. One rim node so stage 2's checkpoint hops off the plaza edge. §5.7.2
      // centres that node on x −1548 with hx 2, which puts half its footprint (out to
      // −1546) two studs PAST the §5.1 plaza's east face at −1548: every hop measured
      // from it is then 2 studs shorter than the one the player has to make. Centred on
      // −1550 instead, the footprint is the plaza's last four studs and the gap the
      // route check sees is the real one. Reported as a spec defect.
      pushNode({ x: -1550, z: 0, top: TUNE.BASE_Y, hx: 2, hz: 8, hop: "walk" });
      return;
    }
    if (order === 2) {
      segWalkway(1, 20, 8, false);
      emitGate(st.node);
      return;
    }
    if (order === 3) {
      let t = hopTarget(1.5, 0, 0, 4, 4);
      plat(t.x, t.z, t.top, 8, 8, "walk");
      emitGate(st.node);
      t = hopTarget(4, 0, 0, 4, 4);
      plat(t.x, t.z, t.top, 8, 8, "jump"); // the one 4-stud gap the whole stage teaches
      return;
    }
    if (order === 5) {
      segWalkway(1, 8, 6, false);
      emitGate(st.node);
      const [sx, sz] = orient(12, 14);
      const t = hopTarget(-0.05, 0, 0, sx / 2, sz / 2);
      plat(t.x, t.z, t.top, sx, sz, "walk");
      const [wx, wz] = orient(1.5, 10);
      part("wall", [F(t.x), F(t.top + 4), F(t.z)], [wx, 8, wz]); // 2 open studs each side
      segWalkway(1, 8, 6, false);
      return;
    }
    throw new Error(`obby layout: special ${order} is not in the slice (spec 08 §5.7.2)`);
  }

  // §5.6. SLICE: the beams / checker / squeeze / mixed themes need the segments the
  // slice defers (see createSegments) — they fill in from §5.6's table with them.
  function themeStep(theme, iter, remaining, zig) {
    const d = st.d;
    const gapMid = (d.gMin + d.gMax) / 2;
    if (theme === "jumps") return segJump();
    if (theme === "zigzag") return segJump({ lat: zig * rr(4, 6) });
    if (theme === "tiny") return segJump({ g: rr(d.gMin, gapMid), size: Math.max(1.4, d.size * 0.72) });
    if (theme === "longshot") {
      return segJump({ g: rr(gapMid, d.gMax), size: Math.min(d.size * 1.2, d.size + 1), lat: rr(-1.5, 1.5) });
    }
    if (theme === "walkrun") {
      return iter % 2 === 1 && remaining >= 2 ? segWalkway(Math.min(2, remaining), 8, Math.max(d.size, 4), false) : segJump();
    }
    if (theme === "decoy") {
      const lat = (rng() < 0.5 ? 1 : -1) * (d.size / 2 + 1.3);
      return segJump({ lat, decoyChance: 0.9 });
    }
    if (theme === "spin") {
      return st.sinceSpin > 3 && remaining >= 2 ? segSpinner() : segJump();
    }
    if (theme === "stairs") {
      const g = rr(d.gMin, gapMid);
      const cap = Math.min(5, (FEAS.COMBO_MAX - g) / 1.3 - 0.15);
      const rise = iter % 3 === 2 ? Math.max(-8, -rr(3, 6)) : Math.min(cap, rr(1.2, 3.2));
      return segJump({ g, rise, lat: rr(-2, 2) });
    }
    throw new Error(`obby layout: theme "${theme}" is not in the slice (spec 08 §5.6)`);
  }

  function emitThemed(theme, budget) {
    let remaining = budget;
    let iter = 0;
    let zig = 1;
    while (remaining > 0) {
      st.sinceSpin += 1;
      if (theme === "zigzag") zig = -zig;
      remaining -= themeStep(theme, iter, remaining, zig);
      iter += 1;
    }
  }

  return { placeCheckpoint, emitGate, emitSign, maybeConnector, emitSpecial, emitThemed };
}

// ---------------------------------------------------------------------------
// Winners' area (§5.8.3) and kill floors (§5.8.2).
// ---------------------------------------------------------------------------

// SLICE: §5.8.3 puts this above the final tower and paints the floor neon #ffd700 with
// two confetti spinners. The slice has no towers (§5.8.1), so it caps the last stage's
// climb instead — three rising steps to a podium terrace. The gold floor and the
// confetti bars are emitted with the colours §5.12's kind table gives them: a StagePart
// (§3.2) carries no colour override, and §5.12 maps every spinnerBar to `kill`, which
// would make a celebration prop lethal. Reported as a spec defect; the confetti pair
// fills in from §5.8.3 once the schema can express it.
function emitWinners(core, stage) {
  const { st, orient, part, pushNode, plat, hopTarget } = core;
  const wasCount = st.count;
  st.count = false; // the terrace is not part of the last stage's platform budget
  for (let i = 0; i < 3; i++) {
    const t = hopTarget(1.5, 2, 0, 3, 3);
    plat(t.x, t.z, t.top, 6, 6, "ease");
  }
  const t = hopTarget(1.5, 0, 0, 20, 20);
  const x = F(t.x);
  const z = F(t.z);
  const top = F(t.top);
  part("platform", [x, top - 1, z], [40, 2, 40]);
  pushNode({ x, z, top, hx: 20, hz: 20, hop: "walk" });
  const h = st.heading;
  const podium = [[-4, 1], [0, 2], [4, 3]];
  const p = { x: -h.uz, z: h.ux };
  for (const [off, height] of podium) {
    part("deco", [x + p.x * off, top + height / 2, z + p.z * off], [4, height, 4]);
  }
  part("winPad", [x + h.ux * 6, top + 0.5, z + h.uz * 6], [8, 1, 8]);
  const [bx, bz] = orient(0.5, 16);
  part("sign", [x + h.ux * 19, top + 2.5, z + h.uz * 19], [bx, 5, bz]); // stands on the floor
  stage.labels.push({
    text: "YOU BEAT THE OBBY!\nCONGRATULATIONS!",
    pos: [F(x + h.ux * 18.5), F(top + 3.5), F(z + h.uz * 18.5)],
    yaw: signYaw(h),
    w: 16,
    h: 4,
    color: "#ffd700",
  });
  st.count = wasCount;
}

const CORE_KINDS = new Set([
  "platform", "killTile", "deco", "wall", "towerShell", "gate", "sign",
  "spinnerHub", "spinnerBar", "cpPad", "winPad",
]);

function coreAabb(stage) {
  const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const p of stage.parts) {
    if (!CORE_KINDS.has(p.kind)) continue;
    // A spinner bar sweeps a disc of its own length, so its extent is that length on
    // both horizontal axes (§5.8.2 point 1).
    const spread = p.kind === "spinnerBar" ? Math.max(p.size[0], p.size[2]) : 0;
    const hx = Math.max(p.size[0], spread) / 2;
    const hz = Math.max(p.size[2], spread) / 2;
    box.minX = Math.min(box.minX, p.pos[0] - hx);
    box.maxX = Math.max(box.maxX, p.pos[0] + hx);
    box.minY = Math.min(box.minY, p.pos[1] - p.size[1] / 2);
    box.maxY = Math.max(box.maxY, p.pos[1] + p.size[1] / 2);
    box.minZ = Math.min(box.minZ, p.pos[2] - hz);
    box.maxZ = Math.max(box.maxZ, p.pos[2] + hz);
  }
  return box;
}

function overlapsXZ(rect, box) {
  return rect.minX <= box.maxX && rect.maxX >= box.minX && rect.minZ <= box.maxZ && rect.maxZ >= box.minZ;
}

// One floor per stage, dropped clear of every stage whose footprint shares the rect, so
// a fall anywhere over the stage dies instead of drifting into a neighbour's air (§5.8.2).
function emitKillFloors(stages) {
  const boxes = stages.map(coreAabb);
  stages.forEach((stage, i) => {
    const b = boxes[i];
    const m = TUNE.KILLFLOOR_MARGIN;
    const rect = { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m };
    let minY = b.minY;
    boxes.forEach((other, j) => {
      if (j !== i && overlapsXZ(rect, other)) minY = Math.min(minY, other.minY);
    });
    const top = minY - TUNE.KILLFLOOR_DROP;
    stage.parts.push({
      kind: "killFloor",
      pos: [F((rect.minX + rect.maxX) / 2), F(top - 1), F((rect.minZ + rect.maxZ) / 2)],
      size: [F(rect.maxX - rect.minX), 2, F(rect.maxZ - rect.minZ)],
      yaw: 0,
    });
  });
}

function boundsOf(stages) {
  const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const stage of stages) {
    for (const p of stage.parts) {
      b.minX = Math.min(b.minX, p.pos[0] - p.size[0] / 2);
      b.maxX = Math.max(b.maxX, p.pos[0] + p.size[0] / 2);
      b.minY = Math.min(b.minY, p.pos[1] - p.size[1] / 2);
      b.maxY = Math.max(b.maxY, p.pos[1] + p.size[1] / 2);
      b.minZ = Math.min(b.minZ, p.pos[2] - p.size[2] / 2);
      b.maxZ = Math.max(b.maxZ, p.pos[2] + p.size[2] / 2);
    }
  }
  return b;
}

function freezeLayout(layout) {
  for (const stage of layout.stages) {
    for (const p of stage.parts) {
      Object.freeze(p.pos);
      Object.freeze(p.size);
      Object.freeze(p);
    }
    for (const n of stage.path) Object.freeze(n);
    for (const l of stage.labels) {
      Object.freeze(l.pos);
      Object.freeze(l);
    }
    Object.freeze(stage.parts);
    Object.freeze(stage.path);
    Object.freeze(stage.labels);
    Object.freeze(stage.cp);
    Object.freeze(stage);
  }
  Object.freeze(layout.stages);
  Object.freeze(layout.bounds);
  Object.freeze(layout.totals);
  return Object.freeze(layout);
}

// ---------------------------------------------------------------------------
// §5.4 buildLayout — the whole world, deterministic in mulberry32(TUNE.SEED).
// ---------------------------------------------------------------------------

export function buildLayout() {
  const core = createCore(mulberry32(TUNE.SEED));
  const seg = createSegments(core);
  const api = createStages(core, seg);
  const { st } = core;
  const stages = [];

  st.node = { x: ANCHOR[0], z: ANCHOR[2], top: TUNE.BASE_Y, hx: 12, hz: 12, hop: "seed" };

  for (const row of ROSTER) {
    const d = diffByName(row.diff);
    const stage = {
      n: row.n,
      name: row.name,
      diff: row.diff,
      theme: row.theme,
      tower: row.tower,
      color: d.color,
      cp: null,
      budget: 0,
      parts: [],
      path: [],
      labels: [],
    };
    stages.push(stage);
    st.stage = stage;
    st.d = d;

    if (row.n === 1) {
      // The one fixed pad: it sits ON the plaza place.json already owns (§5.4 step 2).
      const cp = [-1552, 101, 0, HEADINGS.E.yaw];
      core.part("cpPad", [cp[0], cp[1] - 0.5, cp[2]], [6, 1, 6]);
      stage.cp = cp;
      core.pushNode({ x: cp[0], z: cp[2], top: cp[1], hx: 3, hz: 3, hop: "cp" });
      stage.labels.push({
        text: `STAGE ${stage.n}\n${stage.name}`,
        pos: [cp[0], cp[1] + 7, cp[2] + 4.5],
        yaw: signYaw(HEADINGS.E),
        w: TUNE.LABEL_W,
        h: TUNE.LABEL_H,
        color: labelColor(stage.color),
      });
    } else {
      api.placeCheckpoint(CP_GAP, CP_RISE);
    }

    if (d.special) {
      api.emitSpecial(d.special);
    } else {
      // Every slice stage is its difficulty's first, so each opens with the entrance
      // walkway and its difficulty arch (§5.4 step 3).
      const used = seg.segWalkway(2, 10, 8, false);
      api.emitGate(stage.path[stage.path.length - 2]);
      api.emitThemed(row.theme, row.plats - used);
    }

    api.emitSign();
    api.maybeConnector();
  }

  emitWinners(core, stages[stages.length - 1]);
  emitKillFloors(stages);

  const totals = {
    parts: stages.reduce((n, s) => n + s.parts.length, 0),
    platforms: stages.reduce((n, s) => n + s.parts.filter((p) => p.kind === "platform").length, 0),
    labels: stages.reduce((n, s) => n + s.labels.length, 0),
  };
  return freezeLayout({ stages, bounds: boundsOf(stages), totals });
}
