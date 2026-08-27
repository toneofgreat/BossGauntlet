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

// The last roster row: its tower carries the winners' area instead of an onward exit.
const FINAL_STAGE = 90;

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
    sinceFeature: 99,
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
  // How far off the row centre line the current node sits (§5.5 step 1). segChecker
  // aims at absolute lattice columns, so it needs exactly the number hopTarget leashes
  // against — computed once, here, rather than twice and possibly differently.
  function curLat() {
    const p = perp();
    return st.heading.uz === 0 ? p.z * (st.node.z - st.rowLat) : 0;
  }

  function hopTarget(g, rise, lat, nhx, nhz) {
    const from = st.node;
    const h = st.heading;
    const p = perp();
    let shift = lat;
    const cur = curLat();
    if (cur + shift > LAT_LEASH) shift = -Math.abs(shift);
    else if (cur + shift < -LAT_LEASH) shift = Math.abs(shift);

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

  // The largest rise still jumpable across a gap of `g`, from spec 03's constants —
  // maxJumpGap(r) >= g solved for r. COMBO_MAX is a straight line drawn through that
  // curve, and at the widest gaps the line sits ABOVE it: Dilly Impossible's 8.7-stud
  // gMax with any climb at all asks for a jump the engine cannot make. Route check
  // 08:R3 caught exactly that on stage 89, so the exact envelope caps the rise too.
  // Spec 08 §5.5 amended in this commit to carry this term.
  function physicsRiseCap(g) {
    const tMin = (g / FEAS.JUMP_MARGIN - 2) / FEAS.WALK_SPEED;
    const s = FEAS.GRAVITY * tMin - FEAS.JUMP_V;
    if (s <= 0) return FEAS.RISE_MAX; // the gap is reachable at any rise this table allows
    const disc = FEAS.JUMP_V * FEAS.JUMP_V - s * s;
    return disc <= 0 ? 0 : disc / (2 * FEAS.GRAVITY);
  }

  // Height change for a hop of gap `g`, kept inside the COMBO_MAX envelope (§5.5).
  function pickRise(g) {
    const cap = Math.min(2, (FEAS.COMBO_MAX - g) / 1.3 - 0.15, FEAS.RISE_MAX, physicsRiseCap(g));
    let rise;
    if (rng() < 0.55 || cap <= 0.3) rise = rng() < 0.5 ? 0 : -rr(0.3, 1.5);
    else rise = rr(0.3, Math.max(0.31, cap));
    // §5.4 rise clamp: the path never sinks below MIN_TOP_Y.
    if (st.node.top < TUNE.MIN_TOP_Y && rise <= 0) rise = rr(0.3, Math.min(2, cap));
    return rise;
  }

  return { st, rng, rr, ri, perp, orient, part, pushNode, plat, hopTarget, pickRise, curLat };
}

// ---------------------------------------------------------------------------
// Segments (§5.5). Each returns the number of counted platforms it consumed.
// ---------------------------------------------------------------------------

function createSegments(core) {
  const { st, rng, rr, ri, perp, orient, part, plat, hopTarget, pickRise, curLat } = core;

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

  // A narrow catwalk along the heading: long enough to run, too thin to drift on.
  function segBeam() {
    const d = st.d;
    const [sx, sz] = orient(rr(9, 14), d.beam);
    const g = rr(d.gMin, d.gMax);
    const rise = pickRise(g);
    const lat = rr(-2, 2);
    const t = hopTarget(g, rise, lat, sx / 2, sz / 2);
    plat(t.x, t.z, t.top, sx, sz, "jump");
    return 1;
  }

  // A three-column lattice where exactly one tile per row is safe (§5.5). The kill
  // tiles sit 0.8 tall against the platform's 1, so the safe column reads as the
  // slightly PROUD one — the tell is there for a player who looks for it.
  function segChecker(rows) {
    let col = ri(0, 2);
    for (let row = 0; row < rows; row++) {
      const t = hopTarget(1, 0, (col - 1) * 4 - curLat(), 1.5, 1.5);
      plat(t.x, t.z, t.top, 3, 3, row === 0 ? "ease" : "checker");
      const p = perp();
      for (let c = 0; c <= 2; c++) {
        if (c === col) continue;
        const off = (c - col) * 4;
        part("killTile", [t.x + p.x * off, t.top - 0.5, t.z + p.z * off], [3, 0.8, 3]);
      }
      col = Math.max(0, Math.min(2, col + ri(-1, 1)));
    }
    return rows;
  }

  // A ledge with a wall shoved across most of it: HUG_LEDGE studs of walkable slab
  // survive on one side, and which side is a coin flip you have to read on approach.
  function segHug() {
    const d = st.d;
    const g = rr(Math.min(d.gMin, 4), Math.min(d.gMax, 5));
    const [sx, sz] = orient(10, 3.6);
    const t = hopTarget(g, 0, 0, sx / 2, sz / 2);
    plat(t.x, t.z, t.top, sx, sz, "ease");
    const side = rng() < 0.5 ? 1 : -1;
    // 3.6/2 − ledge − wallHalf: the wall overhangs the far edge, so the ledge that is
    // left is exactly HUG_LEDGE wide and it is on `side`.
    const off = side * (3.6 / 2 - FEAS.HUG_LEDGE - 1.2);
    const p = perp();
    const [wx, wz] = orient(10, 2.4);
    part("wall", [t.x + p.x * off, t.top + 4, t.z + p.z * off], [wx, 8, wz]);
    return 1;
  }

  return { segJump, segWalkway, segSpinner, segBeam, segChecker, segHug };
}

// ---------------------------------------------------------------------------
// Stage furniture: checkpoints, gates, signs, connectors, themes (§5.6, §5.7).
// ---------------------------------------------------------------------------

function createStages(core, seg) {
  const { st, rng, rr, ri, perp, orient, part, pushNode, plat, hopTarget } = core;
  const { segJump, segWalkway, segSpinner, segBeam, segChecker, segHug } = seg;

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
    if (order === 4) {
      // Simply Walk: four walkway runs. Each segWalkway after the first draws its own
      // rr(−1,1) lateral drift, which is what makes the corridor wander gently instead
      // of running dead straight.
      segWalkway(1, 10, 6, false);
      emitGate(st.node);
      for (let i = 0; i < 3; i++) segWalkway(1, 10, 6, false);
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
    throw new Error(`obby layout: unknown special ${order} (spec 08 §5.7.2)`);
  }

  // §5.6's per-iteration table. `st.sinceFeature` paces the themes that would be
  // exhausting back-to-back; emitThemed resets it to 99 so every stage may open with
  // its feature.
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
    if (theme === "beams") {
      if (st.sinceFeature > 1 && remaining >= 2) { st.sinceFeature = 0; return segBeam(); }
      return segJump();
    }
    if (theme === "checker") {
      if (st.sinceFeature > 2 && remaining >= 5) {
        st.sinceFeature = 0;
        return segChecker(Math.min(ri(4, 6), remaining - 1));
      }
      return segJump();
    }
    if (theme === "squeeze") {
      if (st.sinceFeature > 2 && remaining >= 4) {
        st.sinceFeature = 0;
        if (d.hug && rng() < 0.4) return segHug();
        return segWalkway(3, 6, Math.max(d.size, 3.2), true);
      }
      return segJump();
    }
    if (theme === "mixed") {
      const roll = rng();
      if (d.spin && st.sinceSpin > 7 && remaining >= 2 && roll < 0.14) return segSpinner();
      if (d.checker && remaining >= 5 && roll < 0.26) return segChecker(Math.min(ri(4, 6), remaining - 1));
      if (d.head && remaining >= 4 && roll < 0.38) return segWalkway(3, 6, Math.max(d.size, 3.2), true);
      if (d.beam && remaining >= 2 && roll < 0.5) return segBeam();
      if (d.hug && remaining >= 2 && roll < 0.6) return segHug();
      return segJump();
    }
    throw new Error(`obby layout: unknown theme "${theme}" (spec 08 §5.6)`);
  }

  function emitThemed(theme, budget) {
    let remaining = budget;
    let iter = 0;
    let zig = 1;
    st.sinceFeature = 99;
    while (remaining > 0) {
      st.sinceSpin += 1;
      st.sinceFeature += 1;
      if (theme === "zigzag") zig = -zig;
      remaining -= themeStep(theme, iter, remaining, zig);
      iter += 1;
    }
  }

  // §5.8.1 — the difficulty's capstone: a glass-shelled spiral climbed on a radius-10
  // helix. The shell is not only scenery, it keeps a missed hop inside the tower, and
  // the interior base floor catches that fall safely instead of dropping the player to
  // a kill floor. `budget` is the tower's platform count (§5.2: 5 x the difficulty's
  // last normal budget), so a tower IS its rings.
  function emitTower(budget, isFinal) {
    const d = st.d;
    const h = st.heading;
    const p = perp();
    const cp = st.stage.cp;
    const floorTop = cp[1];
    const C = { x: cp[0] + h.ux * 24, z: cp[2] + h.uz * 24 };
    const wasDeco = st.deco;
    const wasCount = st.count;
    st.deco = false; // §5.8.1 step 3: no hanging supports or glitch cubes inside

    part("deco", [C.x, floorTop - 1, C.z], [31, 2, 31]);

    st.count = false;
    segWalkway(2, 6, 6, false); // pad -> interior, through the doorway
    st.count = wasCount;

    // Ring sizes: the difficulty's own platform (floored at 1.8), a wider rest ring
    // every 25th, and an 8x8 summit. Rests are suppressed near the top so the last few
    // hops are the hard ones the tower has been building towards.
    const R = 10;
    const base = Math.max(d.size, 1.8);
    const sizes = [];
    for (let i = 0; i < budget; i++) {
      if (i === budget - 1) sizes.push(8);
      else if ((i + 1) % 25 === 0 && i < budget - 4) sizes.push(6);
      else sizes.push(base);
    }

    // Angular step per ring is the chord its two platforms need, converted to radians.
    // Normalizing by `scale` makes the helix close on a whole number of turns PLUS the
    // quarter it starts offset by, so the summit lands dead ahead of the entry and the
    // exit bridge runs straight out of the front wall.
    const steps = [];
    let prevSize = base;
    for (let i = 0; i < budget; i++) {
      steps.push((prevSize / 2 + sizes[i] / 2 + 2.6) / R);
      prevSize = sizes[i];
    }
    const sum = steps.reduce((a, b) => a + b, 0);
    const K = Math.max(1, Math.round((sum - Math.PI / 2) / (2 * Math.PI)));
    const scale = (2 * Math.PI * K + Math.PI / 2) / sum;
    const a0 = Math.atan2(-h.uz, -h.ux); // the bearing back towards the doorway
    let ang = a0 + Math.PI / 2;

    const firstAng = ang + steps[0] * scale;
    const first = { x: C.x + R * Math.cos(firstAng), z: C.z + R * Math.sin(firstAng) };
    const from = { x: st.node.x, z: st.node.z };
    st.count = false;
    for (let i = 1; i <= 3; i++) {
      const f = i / 4;
      plat(from.x + (first.x - from.x) * f, from.z + (first.z - from.z) * f, floorTop + 2 * i, 4, 4, "tower");
    }
    st.count = wasCount;

    let top = floorTop + 6;
    for (let i = 0; i < budget; i++) {
      ang += steps[i] * scale;
      plat(C.x + R * Math.cos(ang), C.z + R * Math.sin(ang), top, sizes[i], sizes[i], i === 0 ? "tower0" : "tower");
      top += rr(2.5, 3.3);
    }
    const summitTop = st.node.top;

    // §5.8.1 step 4 — the shell.
    const HALF = 16;
    const TH = 1.5;
    const yBot = floorTop - 2;
    const yTop = summitTop + 10;
    const midY = (yBot + yTop) / 2;
    const height = yTop - yBot;
    const [latX, latZ] = orient(35, TH);
    part("towerShell", [C.x + p.x * HALF, midY, C.z + p.z * HALF], [latX, height, latZ]);
    part("towerShell", [C.x - p.x * HALF, midY, C.z - p.z * HALF], [latX, height, latZ]);

    const ex = C.x - h.ux * HALF;
    const ez = C.z - h.uz * HALF;
    const [sideX, sideZ] = orient(TH, 12);
    part("towerShell", [ex + p.x * 10, midY, ez + p.z * 10], [sideX, height, sideZ]);
    part("towerShell", [ex - p.x * 10, midY, ez - p.z * 10], [sideX, height, sideZ]);
    const doorTop = floorTop + 9;
    const [gapX, gapZ] = orient(TH, 8);
    part("towerShell", [ex, (doorTop + yTop) / 2, ez], [gapX, yTop - doorTop, gapZ]);

    // The front wall carries the exit. §5.8.1 gives the FINAL tower "one full 32-wide
    // wall" — but §5.8.3 places the winners' area "after its tower summit exit walkway",
    // and a sealed front wall leaves stage 90 with no way out and the game with no way
    // to be won. Amended in this commit: the final tower keeps the exit, and what full
    // width buys it is a picture window - single 32-wide panels above and below the
    // opening instead of the usual side segments.
    const fx = C.x + h.ux * HALF;
    const fz = C.z + h.uz * HALF;
    const holeBot = summitTop - 1.2;
    const holeTop = summitTop + 9;
    const [holeX, holeZ] = orient(TH, isFinal ? 32 : 8);
    if (!isFinal) {
      part("towerShell", [fx + p.x * 10, midY, fz + p.z * 10], [sideX, height, sideZ]);
      part("towerShell", [fx - p.x * 10, midY, fz - p.z * 10], [sideX, height, sideZ]);
    }
    part("towerShell", [fx, (yBot + holeBot) / 2, fz], [holeX, holeBot - yBot, holeZ]);
    part("towerShell", [fx, (holeTop + yTop) / 2, fz], [holeX, yTop - holeTop, holeZ]);

    st.count = false;
    segWalkway(2, 10, 6, false); // out through the hole
    st.count = wasCount;
    st.deco = wasDeco;
  }

  return { placeCheckpoint, emitGate, emitSign, maybeConnector, emitSpecial, emitThemed, emitTower };
}

// ---------------------------------------------------------------------------
// Winners' area (§5.8.3) and kill floors (§5.8.2).
// ---------------------------------------------------------------------------

// §5.8.3 — the reward for 90 stages: a gold terrace off the final tower's exit, a
// podium, confetti, and the pad that ends the run. Not a stage: no checkpoint, no
// roster row, and nothing here counts against a platform budget.
function emitWinners(core, stage) {
  const { st, orient, part, pushNode, hopTarget } = core;
  const wasCount = st.count;
  st.count = false;
  const t = hopTarget(1.5, 0, 0, 20, 20);
  const x = F(t.x);
  const z = F(t.z);
  const top = F(t.top);
  part("winFloor", [x, top - 1, z], [40, 2, 40]);
  pushNode({ x, z, top, hx: 20, hz: 20, hop: "walk" });
  const h = st.heading;
  const p = { x: -h.uz, z: h.ux };
  for (const [off, height] of [[-4, 1], [0, 2], [4, 3]]) {
    part("deco", [x + p.x * off, top + height / 2, z + p.z * off], [4, height, 4]);
  }
  part("winPad", [x + h.ux * 6, top + 0.5, z + h.uz * 6], [8, 1, 8]);
  // Confetti: the same hub-and-bars rig as a killer spinner, built from the celebratory
  // kinds instead, so nothing on the terrace can kill the player who just beat the obby.
  for (const side of [1, -1]) {
    const cx = x + p.x * 16 * side + h.ux * 16;
    const cz = z + p.z * 16 * side + h.uz * 16;
    part("spinnerHub", [cx, top + 8, cz], [3, 1.2, 3]);
    part("confettiBar", [cx, top + 8.6, cz], [6, 0.8, 1.2], { yaw: 0, spin: 45 });
    part("confettiBarAlt", [cx, top + 8.6, cz], [6, 0.8, 1.2], { yaw: 90, spin: 45 });
  }
  const [bx, bz] = orient(0.5, 16);
  part("sign", [x + h.ux * 19, top + 2.5, z + h.uz * 19], [bx, 5, bz]);
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
  "spinnerHub", "spinnerBar", "cpPad", "winPad", "winFloor", "confettiBar", "confettiBarAlt",
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

  for (let i = 0; i < ROSTER.length; i++) {
    const row = ROSTER[i];
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
    } else if (row.tower) {
      api.emitTower(row.plats, row.n === FINAL_STAGE);
    } else {
      // §5.4 step 3: a difficulty's FIRST stage opens with an entrance walkway under
      // its arch, and those two slabs come out of the stage's platform budget.
      const firstOfDiff = i === 0 || ROSTER[i - 1].diff !== row.diff;
      let used = 0;
      if (firstOfDiff) {
        used = seg.segWalkway(2, 10, 8, false);
        api.emitGate(stage.path[stage.path.length - 2]);
      }
      api.emitThemed(row.theme, row.plats - used);
    }

    if (row.n === FINAL_STAGE) emitWinners(core, stage);
    api.emitSign();
    api.maybeConnector();
  }

  emitKillFloors(stages);

  const totals = {
    parts: stages.reduce((n, s) => n + s.parts.length, 0),
    platforms: stages.reduce((n, s) => n + s.parts.filter((p) => p.kind === "platform").length, 0),
    labels: stages.reduce((n, s) => n + s.labels.length, 0),
  };
  return freezeLayout({ stages, bounds: boundsOf(stages), totals });
}
