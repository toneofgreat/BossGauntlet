// Difficulty Chart Obby — layout generator + validator + Lua serializer.
// See CONTRACT.md. Usage: node generator.js --selftest
'use strict';

// ---------------------------------------------------------------------------
// Deterministic RNG (mulberry32, seed 90)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const F = (v) => Math.round(v * 100) / 100; // 2-decimal quantize
function fmt(v) {
  v = F(v);
  if (Object.is(v, -0)) v = 0;
  let s = v.toFixed(2);
  s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s;
}
function hex(h) {
  return [0, 2, 4].map((i) => Math.round((parseInt(h.slice(i, i + 2), 16) / 255) * 1000) / 1000);
}

// ---------------------------------------------------------------------------
// Difficulty table (CONTRACT.md)
// ---------------------------------------------------------------------------
const DIFFS = [
  { name: 'The Beginning', count: 1, special: 1, color: 'FFFFFF' },
  { name: 'Exist', count: 1, special: 2, color: 'E8E8E8' },
  { name: 'Just Jump', count: 1, special: 3, color: 'D0F0FF' },
  { name: 'Simply Walk', count: 1, special: 4, color: 'C8FFC8' },
  { name: 'Walk Around It', count: 1, special: 5, color: 'FFE8C0' },
  { name: 'Cake Walk', count: 5, color: 'F7A8D8', plats: [6, 8], gap: [2, 3], size: 8 },
  { name: 'Effortless', count: 5, color: '9FF781', plats: [8, 10], gap: [3, 4], size: 7 },
  { name: 'Easy', count: 5, color: '75F347', plats: [10, 12], gap: [4, 4.8], size: 6, decoy: 0.1 },
  { name: 'Medium', count: 10, tower: true, color: 'FFFE00', plats: [12, 16], gap: [4.5, 5.5], size: 5.5, decoy: 0.15, spin: 8 },
  { name: 'Hard', count: 5, tower: true, color: 'FD7C00', plats: [15, 18], gap: [5, 6], size: 5, decoy: 0.18, spin: 10, head: true },
  { name: 'Difficult', count: 5, tower: true, color: 'FF0536', plats: [18, 21], gap: [5.5, 6.5], size: 4.5, decoy: 0.2, spin: 12, head: true, beam: 2 },
  { name: 'Challenging', count: 5, tower: true, color: 'B01030', plats: [21, 24], gap: [6, 6.6], size: 4, decoy: 0.22, spin: 12, head: true, beam: 2, checker: true },
  { name: 'Intense', count: 5, tower: true, color: '661717', plats: [24, 27], gap: [6, 7], size: 3.5, decoy: 0.25, spin: 14, head: true, beam: 2, checker: true, hug: true },
  { name: 'Remorseless', count: 5, tower: true, color: 'FF00EA', plats: [27, 30], gap: [6.5, 7], size: 3, decoy: 0.25, spin: 16, head: true, beam: 2, checker: true, hug: true },
  { name: 'Insane', count: 5, tower: true, color: '0034FF', plats: [30, 33], gap: [6.5, 7.5], size: 2.8, decoy: 0.28, spin: 18, head: true, beam: 1.5, checker: true, hug: true },
  { name: 'Extreme', count: 5, tower: true, color: '00A2FF', plats: [33, 36], gap: [7, 7.5], size: 2.5, decoy: 0.3, spin: 20, head: true, beam: 1.5, checker: true, hug: true },
  { name: 'Terrifying', count: 10, tower: true, color: '7F00FF', plats: [36, 40], gap: [7, 8], size: 2.2, decoy: 0.3, spin: 22, head: true, beam: 1.5, checker: true, hug: true },
  { name: 'Catastrophic', count: 5, tower: true, color: 'FFFFFF', plats: [40, 44], gap: [7.5, 8], size: 2, decoy: 0.32, spin: 24, head: true, beam: 1.5, checker: true, hug: true },
  { name: 'NIL', count: 5, tower: true, color: '4A4A4A', plats: [44, 48], gap: [7.5, 8.2], size: 2, decoy: 0.32, spin: 24, head: true, beam: 1.5, checker: true, hug: true, glitch: true },
  { name: 'Megadeath', count: 3, tower: true, color: '1A0000', plats: [48, 52], gap: [8, 8.5], size: 1.8, decoy: 0.35, spin: 24, head: true, beam: 1.5, checker: true, hug: true },
  { name: 'Dilly Impossible', count: 2, tower: true, color: '14000A', plats: [55, 55], gap: [8.2, 8.7], size: 1.6, decoy: 0.4, spin: 24, head: true, beam: 1.5, checker: true, hug: true },
];

const GLOBAL_GAP_MAX = 8.7;
const GLOBAL_RISE_MAX = 5;
const COMBO_MAX = 9.3; // g + 1.3*max(r,0)
const ROW_X_LIMIT = 1600;
const ROW_Z_STEP = 120;

// headings: E=+X, S=+Z, W=-X (snake). ry = spawn yaw so LookVector = heading.
const HEADINGS = {
  E: { x: 1, z: 0, ry: -90 },
  S: { x: 0, z: 1, ry: 180 },
  W: { x: -1, z: 0, ry: 90 },
};

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
function edgeDist(hx, hz, ux, uz) {
  const a = Math.abs(ux) > 1e-9 ? hx / Math.abs(ux) : Infinity;
  const b = Math.abs(uz) > 1e-9 ? hz / Math.abs(uz) : Infinity;
  return Math.min(a, b);
}

function build(errors) {
  const rnd = mulberry32(90);
  const rr = (a, b) => a + rnd() * (b - a);
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));

  const stages = []; // {n,name,diff,color,tower,cp,parts,path,budgetPlats,expectedPlats}
  const ctx = {
    heading: HEADINGS.E,
    node: null, // {x,z,top,hx,hz,hop} last landable
    stage: null,
    d: null,
    rowLat: 0, // z of current row centerline (or x when heading S — unused there)
    sinceSpin: 99,
  };

  const perp = () => ({ x: -ctx.heading.z, z: ctx.heading.x }); // right of heading

  function part(kind, x, y, z, sx, sy, sz, opts) {
    const p = { kind, x: F(x), y: F(y), z: F(z), sx: F(sx), sy: F(sy), sz: F(sz), ry: 0 };
    if (opts && opts.exempt) p.exempt = opts.exempt;
    ctx.stage.parts.push(p);
    return p;
  }
  function node(x, z, top, hx, hz, hop) {
    const nd = { x: F(x), z: F(z), top: F(top), hx: F(hx), hz: F(hz), hop };
    ctx.stage.path.push(nd);
    ctx.node = nd;
    return nd;
  }
  // platform part + path node in one
  function plat(x, z, top, sx, sz, hop, kind) {
    part(kind || 1, x, top - 0.5, z, sx, 1, sz);
    const nd = node(x, z, top, sx / 2, sz / 2, hop);
    if ((kind === undefined || kind === 1) && ctx.count !== false) {
      ctx.stage.budgetPlats += 1;
      // hanging support prop under bigger platforms (detail; not inside towers)
      if (ctx.deco !== false && sx >= 4 && sz >= 4 && rnd() < 0.3) {
        part(3, x, top - 4, z, 1.2, 6, 1.2);
      }
      if (ctx.deco !== false && ctx.d.glitch && rnd() < 0.35) {
        // floating glitch cubes well below the path (pure decoration)
        const pp = perp();
        const off = (sx / 2 + rr(2, 4)) * (rnd() < 0.5 ? 1 : -1);
        part(3, x + pp.x * off, top - rr(6, 12), z + pp.z * off, 0.9, 0.9, 0.9);
      }
    }
    return nd;
  }

  // Lateral coordinate of a point relative to the row centerline, measured in
  // perp-space (positive = toward perp()), so steering corrections point the
  // right way in BOTH east and west rows.
  function latOf(x, z) {
    if (ctx.heading.z !== 0) return 0;
    const p = perp();
    return p.x * (x - 0) + p.z * (z - ctx.rowLat);
  }

  // Land a new box (halves nhx,nhz) at edge-gap g, rise, lateral shift lat.
  function hopTarget(g, rise, lat, nhx, nhz) {
    const h = ctx.heading, p = perp();
    const from = ctx.node;
    // keep the path near the row centerline
    const curLat = latOf(from.x, from.z);
    if (curLat + lat > 10) lat = -Math.abs(lat);
    if (curLat + lat < -10) lat = Math.abs(lat);
    let A = g + from.hx + nhx + 1;
    for (let tries = 0; tries < 8; tries++) {
      A = g + from.hx + nhx + 1;
      for (let i = 0; i < 6; i++) {
        const vx = h.x * A + p.x * lat, vz = h.z * A + p.z * lat;
        const len = Math.hypot(vx, vz) || 1;
        const ux = vx / len, uz = vz / len;
        const e1 = edgeDist(from.hx, from.hz, ux, uz);
        const e2 = edgeDist(nhx, nhz, ux, uz);
        A += g + e1 + e2 - len;
        if (A < 0.5) A = 0.5;
      }
      // verify the realized edge gap; a too-large lateral request can make the
      // hop wider than asked — shrink the lateral and retry
      const vx = h.x * A + p.x * lat, vz = h.z * A + p.z * lat;
      const len = Math.hypot(vx, vz) || 1;
      const ux = vx / len, uz = vz / len;
      const real = len - edgeDist(from.hx, from.hz, ux, uz) - edgeDist(nhx, nhz, ux, uz);
      if (real <= g + 0.25 || Math.abs(lat) < 0.4) break;
      lat *= 0.55;
    }
    return { x: from.x + h.x * A + p.x * lat, z: from.z + h.z * A + p.z * lat, top: from.top + rise };
  }

  function pickRise(g) {
    const cap = Math.min(2, (COMBO_MAX - g) / 1.3 - 0.15, GLOBAL_RISE_MAX);
    if (rnd() < 0.55 || cap <= 0.3) return rnd() < 0.5 ? 0 : -rr(0.3, 1.5);
    return rr(0.3, Math.max(0.31, cap));
  }

  // --- segments (each returns platforms consumed) -------------------------
  function segJump(d) {
    const g = rr(d.gap[0], d.gap[1]);
    const rise = pickRise(g);
    const lat = rr(-3.5, 3.5);
    const s = d.size;
    const t = hopTarget(g, rise, lat, s / 2, s / 2);
    const nd = plat(t.x, t.z, t.top, s, s, 'jump');
    if (d.decoy && rnd() < d.decoy && Math.abs(lat) * 2 >= s + 1.6) {
      const p = perp();
      part(2, nd.x - p.x * lat * 2, nd.top - 0.5, nd.z - p.z * lat * 2, s, 1, s);
    }
    return 1;
  }
  function segBeam(d) {
    const g = rr(d.gap[0], d.gap[1]);
    const len = rr(9, 14), w = d.beam;
    const h = ctx.heading;
    const nhx = Math.abs(h.x) > 0 ? len / 2 : w / 2;
    const nhz = Math.abs(h.x) > 0 ? w / 2 : len / 2;
    const t = hopTarget(g, pickRise(g), rr(-2, 2), nhx, nhz);
    plat(t.x, t.z, t.top, nhx * 2, nhz * 2, 'jump');
    return 1;
  }
  function segWalkway(d, n, len, w, hh) {
    // n abutting parts; optional headhitter over the middle one
    let consumed = 0;
    for (let i = 0; i < n; i++) {
      const h = ctx.heading;
      const nhx = Math.abs(h.x) > 0 ? len / 2 : w / 2;
      const nhz = Math.abs(h.x) > 0 ? w / 2 : len / 2;
      const t = hopTarget(-0.05, 0, i === 0 ? 0 : rr(-1, 1), nhx, nhz);
      const nd = plat(t.x, t.z, t.top, nhx * 2, nhz * 2, 'walk');
      consumed += 1;
      if (hh && i === Math.floor(n / 2)) {
        part(4, nd.x, nd.top + 6.75 + 0.6, nd.z, nhx * 2, 1.2, nhz * 2, { exempt: 'head' });
      }
    }
    return consumed;
  }
  function segSpinner(d) {
    const g = rr(d.gap[0], d.gap[1]);
    const t = hopTarget(g, pickRise(g), rr(-2, 2), 6, 6);
    const nd = plat(t.x, t.z, t.top, 12, 12, 'jump');
    const radius = 4, armWidth = 1.2;
    const arms = ri(2, 3);
    const tipLimit = (d.spin * 180) / (Math.PI * radius);
    const passLimit = 360 / arms / 1.2; // deg/s so a pass period >= 1.2 s
    const speed = F(Math.min(tipLimit, passLimit) * 0.9);
    ctx.stage.parts.push({ kind: 9, x: nd.x, y: nd.top, z: nd.z, radius, arms, speed, armWidth });
    ctx.sinceSpin = 0;
    return 1;
  }
  function segChecker(d, rows) {
    // 3 columns of 3x3 tiles; the safe column random-walks
    let col = ri(0, 2);
    for (let r = 0; r < rows; r++) {
      const lat = (col - 1) * 4 - latOf(ctx.node.x, ctx.node.z) * 0; // relative shift below
      const curLat = latOf(ctx.node.x, ctx.node.z);
      const targetLat = (col - 1) * 4;
      const t = hopTarget(1, 0, targetLat - curLat, 1.5, 1.5);
      const nd = plat(t.x, t.z, t.top, 3, 3, r === 0 ? 'ease' : 'checker');
      // the two unsafe tiles beside the safe one
      const p = perp();
      for (let c = 0; c < 3; c++) {
        if (c === col) continue;
        const off = (c - col) * 4;
        part(2, nd.x + p.x * off, nd.top - 0.5, nd.z + p.z * off, 3, 0.8, 3);
      }
      col = Math.max(0, Math.min(2, col + ri(-1, 1)));
    }
    return rows;
  }
  function segHug(d) {
    const g = rr(Math.min(d.gap[0], 4), Math.min(d.gap[1], 5));
    const h = ctx.heading;
    const len = 10, w = 3.6;
    const nhx = Math.abs(h.x) > 0 ? len / 2 : w / 2;
    const nhz = Math.abs(h.x) > 0 ? w / 2 : len / 2;
    const t = hopTarget(g, 0, 0, nhx, nhz);
    const nd = plat(t.x, t.z, t.top, nhx * 2, nhz * 2, 'ease');
    // wall on top leaving a 1.2-stud ledge on one side
    const side = rnd() < 0.5 ? 1 : -1;
    const p = perp();
    const wallW = 2.4, off = side * (w / 2 - 1.2 - wallW / 2);
    const wx = Math.abs(h.x) > 0 ? len : wallW;
    const wz = Math.abs(h.x) > 0 ? wallW : len;
    part(4, nd.x + p.x * off, nd.top + 4, nd.z + p.z * off, wx, 8, wz, { exempt: 'hug' });
    return 1;
  }

  function emitGate(d, overNode) {
    // pillars + crossbar over a walkway node (kind 7). Crossbar thickness 1.6 >
    // pillar 1.2 so the server's "largest sx" crossbar detection always works.
    const h = ctx.heading, p = perp();
    const halfSpan = 4.75;
    const top = overNode.top;
    for (const s of [-1, 1]) {
      part(7, overNode.x + p.x * halfSpan * s, top + 5, overNode.z + p.z * halfSpan * s, 1.2, 20, 1.2);
    }
    const cw = Math.abs(h.x) > 0 ? 1.6 : 11.1;
    const cd = Math.abs(h.x) > 0 ? 11.1 : 1.6;
    part(7, overNode.x, top + 14, overNode.z, cw, 2, cd);
  }

  function emitSign(stage) {
    // pole + board on the right of the checkpoint pad, facing along the path
    const p = perp(), h = ctx.heading;
    const cp = stage.cp;
    const bx = cp[0] + p.x * 6.5, bz = cp[2] + p.z * 6.5;
    part(3, bx, cp[1] + 4, bz, 0.4, 16, 0.4);
    const sx = Math.abs(h.x) > 0 ? 0.4 : 4.4;
    const sz = Math.abs(h.x) > 0 ? 4.4 : 0.4;
    part(8, bx, cp[1] + 11.2, bz, sx, 2.4, sz);
  }

  function placeCheckpoint(stage, gapv, risev) {
    const t = hopTarget(gapv, risev, 0, 3, 3);
    stage.cp = [F(t.x), F(t.top), F(t.z), ctx.heading.ry];
    node(t.x, t.z, t.top, 3, 3, 'cp');
  }

  // --- specials ------------------------------------------------------------
  function emitSpecial(stage, d) {
    if (d.special === 1) {
      // The Beginning: plaza on a grassy island + arch
      const cp = stage.cp;
      const h = ctx.heading;
      const px = cp[0] + h.x * 12, pz = cp[2] + h.z * 12;
      const top = cp[1] - 1; // pad sits on the plaza
      part(3, px, top - 5.5, pz, 28, 9, 28); // island
      plat(px, pz, top, 24, 24, 'walk');
      stage.cp[1] = F(top + 1);
      // re-point the entry node onto the plaza top (pad top)
      emitGate(d, { x: px + h.x * 8, z: pz + h.z * 8, top });
      node(px + h.x * 10, pz + h.z * 10, top, 2, 2, 'walk');
    } else if (d.special === 2) {
      segWalkway(d, 1, 20, 8, false);
      emitGate(d, ctx.stage.path[ctx.stage.path.length - 1]);
    } else if (d.special === 3) {
      const t1 = hopTarget(1.5, 0, 0, 4, 4);
      const n1 = plat(t1.x, t1.z, t1.top, 8, 8, 'walk');
      emitGate(d, n1);
      const t2 = hopTarget(4, 0, 0, 4, 4);
      plat(t2.x, t2.z, t2.top, 8, 8, 'jump');
    } else if (d.special === 4) {
      const first = segWalkway(d, 1, 10, 6, false);
      emitGate(d, ctx.stage.path[ctx.stage.path.length - 1]);
      for (let i = 0; i < 3; i++) segWalkway(d, 1, 10, 6, false);
    } else if (d.special === 5) {
      segWalkway(d, 1, 8, 6, false);
      emitGate(d, ctx.stage.path[ctx.stage.path.length - 1]);
      // big platform with a wall you walk around
      const h = ctx.heading;
      const nhx = Math.abs(h.x) > 0 ? 6 : 7;
      const nhz = Math.abs(h.x) > 0 ? 7 : 6;
      const t = hopTarget(-0.05, 0, 0, nhx, nhz);
      const nd = plat(t.x, t.z, t.top, nhx * 2, nhz * 2, 'walk');
      const wx = Math.abs(h.x) > 0 ? 1.5 : 10;
      const wz = Math.abs(h.x) > 0 ? 10 : 1.5;
      part(4, nd.x, nd.top + 4, nd.z, wx, 8, wz, { exempt: 'hug' });
      segWalkway(d, 1, 8, 6, false);
    }
  }

  // --- towers --------------------------------------------------------------
  function emitTower(stage, d, budget, isFinal) {
    const h = ctx.heading, p = perp();
    const cp = stage.cp;
    const C = { x: cp[0] + h.x * 24, z: cp[2] + h.z * 24 };
    const floorTop = cp[1];
    // interior base floor (safe, kind 3)
    part(3, C.x, floorTop - 1, C.z, 31, 2, 31);
    // doorway walkway: pad -> interior (2 parts, 6x6; not counted as stage length)
    ctx.count = false;
    segWalkway(d, 2, 6, 6, false);
    ctx.count = true;
    let consumed = 0;
    // spiral — starts on the lateral side (clear of the entry walkway), ends
    // exactly at the front (+heading) where the final oversized platform is
    // the summit and exits straight through the wall, so the exit bridge only
    // ever passes over ring platforms a full revolution below it.
    ctx.deco = false;
    const size = Math.max(d.size, 1.8);
    const R = 10;
    const a0 = Math.atan2(-h.z, -h.x); // points back toward the entry
    const aStart = a0 + Math.PI / 2;
    let ang = aStart;
    let top = floorTop + 8;
    const ringPlats = budget; // the final ring platform is the summit
    // per-hop steps sized for the platforms involved, normalized to end at
    // aStart + 2*pi*K + pi/2  (== a0 + pi: the front)
    const sizes = [];
    {
      let lastRest = 0;
      for (let i = 0; i < ringPlats; i++) {
        const rest = i - lastRest >= 25 && i < ringPlats - 4;
        if (rest) lastRest = i;
        sizes.push(rest ? 6 : size);
      }
      sizes[ringPlats - 1] = 8; // the summit
    }
    const steps = [];
    let stepSum = 0;
    for (let i = 0; i < ringPlats; i++) {
      const prevS = i === 0 ? 4 : sizes[i - 1];
      const chord = prevS / 2 + sizes[i] / 2 + 2.6;
      const st2 = chord / R;
      steps.push(st2);
      stepSum += st2;
    }
    const K = Math.max(1, Math.round((stepSum - Math.PI / 2) / (2 * Math.PI)));
    const scale = (2 * Math.PI * K + Math.PI / 2) / stepSum;
    // three uncounted approach platforms from the walkway end to the actual
    // first ring platform position
    {
      const fa = aStart + steps[0] * scale;
      const sx0 = C.x + Math.cos(fa) * R, sz0 = C.z + Math.sin(fa) * R;
      const w = ctx.node;
      for (let i = 1; i <= 3; i++) {
        const fx2 = w.x + ((sx0 - w.x) * i) / 4, fz2 = w.z + ((sz0 - w.z) * i) / 4;
        ctx.count = false;
        plat(fx2, fz2, floorTop + i * 2, 4, 4, 'tower');
        ctx.count = true;
      }
    }
    let summitTop = 0;
    for (let i = 0; i < ringPlats; i++) {
      ang += steps[i] * scale;
      const x = C.x + Math.cos(ang) * R, z = C.z + Math.sin(ang) * R;
      plat(x, z, top, sizes[i], sizes[i], i === 0 ? 'tower0' : 'tower');
      summitTop = F(top);
      top += rr(2.5, 3.3);
      consumed += 1;
    }
    ctx.deco = true;
    // shell: 4 walls, thickness 1.5, from base to summit + 10
    const wallTopY = summitTop + 10;
    const wallH = wallTopY - (floorTop - 2);
    const wallMidY = (wallTopY + floorTop - 2) / 2;
    const T = 1.5, HALF = 16;
    const wallBox = (cx, cz, alongHeading, len, cy, hgt) => {
      const sx = Math.abs(h.x) > 0 ? (alongHeading ? len : T) : (alongHeading ? T : len);
      const sz = Math.abs(h.x) > 0 ? (alongHeading ? T : len) : (alongHeading ? len : T);
      part(4, cx, cy, cz, sx, hgt, sz);
    };
    // lateral side walls (full)
    for (const s of [-1, 1]) {
      wallBox(C.x + p.x * HALF * s, C.z + p.z * HALF * s, true, 35, wallMidY, wallH);
    }
    // entry wall (behind, -heading): doorway 8 wide x 9 tall at the base
    const ex = C.x - h.x * HALF, ez = C.z - h.z * HALF;
    for (const s of [-1, 1]) {
      wallBox(ex + p.x * 10 * s, ez + p.z * 10 * s, false, 12, wallMidY, wallH);
    }
    {
      const doorTop = floorTop + 9;
      const overH = wallTopY - doorTop;
      wallBox(ex, ez, false, 8, doorTop + overH / 2, overH);
    }
    // front wall (+heading): full for the final tower, else a top exit hole
    const fx = C.x + h.x * HALF, fz = C.z + h.z * HALF;
    if (isFinal) {
      wallBox(fx, fz, false, 32, wallMidY, wallH);
    } else {
      for (const s of [-1, 1]) {
        wallBox(fx + p.x * 10 * s, fz + p.z * 10 * s, false, 12, wallMidY, wallH);
      }
      const holeBot = summitTop - 1.2, holeTop = summitTop + 9;
      const belowH = holeBot - (floorTop - 2);
      wallBox(fx, fz, false, 8, (holeBot + floorTop - 2) / 2, belowH);
      const aboveH = wallTopY - holeTop;
      wallBox(fx, fz, false, 8, holeTop + aboveH / 2, aboveH);
      // exit bridge through the hole (not counted as stage length)
      ctx.count = false;
      segWalkway(d, 2, 10, 6, false);
      ctx.count = true;
    }
    return consumed;
  }

  // --- connectors / rows ---------------------------------------------------
  function maybeConnector() {
    const h = ctx.heading;
    if (h.z !== 0) return;
    if ((h.x > 0 && ctx.node.x < ROW_X_LIMIT) || (h.x < 0 && ctx.node.x > -ROW_X_LIMIT)) return;
    // corner plate then walk S one row, then reverse direction
    ctx.count = false;
    const t = hopTarget(2, 0, 0, 5, 5);
    plat(t.x, t.z, t.top, 10, 10, 'conn');
    ctx.stage.connPlats = (ctx.stage.connPlats || 0) + 1;
    ctx.heading = HEADINGS.S;
    for (let i = 0; i < 6; i++) {
      const tt = hopTarget(-0.05, 0, 0, 4, 10);
      plat(tt.x, tt.z, tt.top, 8, 20, 'conn');
      ctx.stage.connPlats += 1;
    }
    ctx.heading = h.x > 0 ? HEADINGS.W : HEADINGS.E;
    ctx.rowLat = ctx.node.z;
    ctx.count = true;
  }

  // --- main loop -----------------------------------------------------------
  let stageN = 0;
  // seed origin: a virtual node the first checkpoint hops from
  ctx.rowLat = 0;
  ctx.node = { x: -ROW_X_LIMIT, z: 0, top: 100, hx: 3, hz: 3, hop: 'seed' };

  for (const d of DIFFS) {
    const dd = Object.assign({}, d, { color: hex(d.color) });
    const normals = d.count - (d.tower ? 1 : 0);
    for (let s = 1; s <= d.count; s++) {
      stageN += 1;
      const isTower = d.tower && s === d.count;
      let name;
      if (d.count === 1) name = d.name;
      else if (isTower) name = d.name + ' Tower';
      else name = d.name + ' ' + s;
      const stage = {
        n: stageN, name, diff: d.name, color: dd.color, tower: !!isTower,
        cp: null, parts: [], path: [], budgetPlats: 0, connPlats: 0, expectedPlats: 0,
      };
      ctx.stage = stage;
      ctx.d = d;
      stages.push(stage);

      placeCheckpoint(stage, 2.5, 0);
      // budget
      let budget = 0;
      if (!d.special) {
        if (isTower) {
          const last = normals === 1 ? d.plats[0] : Math.round(d.plats[0] + ((normals - 1) / (normals - 1)) * (d.plats[1] - d.plats[0]));
          budget = 5 * d.plats[1];
          // by table: tower = 5 x last normal count = 5 * plats[1]
        } else {
          budget = normals === 1 ? d.plats[0]
            : Math.round(d.plats[0] + ((s - 1) / (normals - 1)) * (d.plats[1] - d.plats[0]));
        }
      }
      stage.expectedPlats = budget;

      if (d.special) {
        emitSpecial(stage, d);
      } else if (isTower) {
        emitTower(stage, d, budget, stageN === 90);
      } else {
        let remaining = budget;
        // difficulty gate + entrance walkway on the first stage of the difficulty
        if (s === 1) {
          remaining -= segWalkway(d, 2, 10, 8, false);
          emitGate(d, stage.path[stage.path.length - 2]);
        }
        while (remaining > 0) {
          ctx.sinceSpin += 1;
          let done = 0;
          const roll = rnd();
          if (d.spin && ctx.sinceSpin > 7 && remaining >= 2 && roll < 0.14) done = segSpinner(d);
          else if (d.checker && remaining >= 5 && roll < 0.26) done = segChecker(d, Math.min(ri(4, 6), remaining - 1));
          else if (d.head && remaining >= 4 && roll < 0.38) done = segWalkway(d, 3, 6, Math.max(d.size, 3.2), true);
          else if (d.beam && remaining >= 2 && roll < 0.5) done = segBeam(d);
          else if (d.hug && remaining >= 2 && roll < 0.6) done = segHug(d);
          else done = segJump(d);
          remaining -= done;
        }
      }
      emitSign(stage);
      maybeConnector();
    }
  }

  // --- kill floors ---------------------------------------------------------
  const CORE_KINDS = { 1: 1, 2: 1, 3: 1, 4: 1, 7: 1, 8: 1 };
  function coreAabb(stage) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
    const grow = (x, y, z, hx, hy, hz) => {
      minX = Math.min(minX, x - hx); maxX = Math.max(maxX, x + hx);
      minY = Math.min(minY, y - hy); maxY = Math.max(maxY, y + hy);
      minZ = Math.min(minZ, z - hz); maxZ = Math.max(maxZ, z + hz);
    };
    for (const p of stage.parts) {
      if (p.kind === 9) grow(p.x, p.y + 0.9, p.z, p.radius + p.armWidth, 0.9, p.radius + p.armWidth);
      else if (CORE_KINDS[p.kind]) grow(p.x, p.y, p.z, p.sx / 2, p.sy / 2, p.sz / 2);
    }
    grow(stage.cp[0], stage.cp[1] - 0.5, stage.cp[2], 3, 0.5, 3);
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }
  const aabbs = stages.map(coreAabb);
  let worldMinY = Infinity;
  for (const a of aabbs) worldMinY = Math.min(worldMinY, a.minY);
  for (let i = 0; i < stages.length; i++) {
    const a = aabbs[i];
    const rect = { minX: a.minX - 20, maxX: a.maxX + 20, minZ: a.minZ - 20, maxZ: a.maxZ + 20 };
    let minY = a.minY;
    for (let j = 0; j < stages.length; j++) {
      if (j === i) continue;
      const b = aabbs[j];
      if (rect.minX < b.maxX && rect.maxX > b.minX && rect.minZ < b.maxZ && rect.maxZ > b.minZ) {
        minY = Math.min(minY, b.minY);
      }
    }
    const top = minY - 27;
    stages[i].parts.push({
      kind: 6, x: F((rect.minX + rect.maxX) / 2), y: F(top - 1), z: F((rect.minZ + rect.maxZ) / 2),
      sx: F(rect.maxX - rect.minX), sy: 2, sz: F(rect.maxZ - rect.minZ), ry: 0,
    });
  }
  // global void catch plane (well below everything)
  {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const a of aabbs) {
      minX = Math.min(minX, a.minX); maxX = Math.max(maxX, a.maxX);
      minZ = Math.min(minZ, a.minZ); maxZ = Math.max(maxZ, a.maxZ);
    }
    stages[0].parts.push({
      kind: 6, x: F((minX + maxX) / 2), y: F(worldMinY - 80), z: F((minZ + maxZ) / 2),
      sx: F(maxX - minX + 400), sy: 2, sz: F(maxZ - minZ + 400), ry: 0,
    });
  }

  return { stages, aabbs };
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------
function validate(stages, aabbs, errors) {
  const err = (m) => errors.push(m);

  // 1. exact roster
  const expected = [];
  for (const d of DIFFS) {
    for (let s = 1; s <= d.count; s++) {
      const isTower = d.tower && s === d.count;
      expected.push({
        diff: d.name,
        name: d.count === 1 ? d.name : isTower ? d.name + ' Tower' : d.name + ' ' + s,
        tower: !!isTower,
      });
    }
  }
  if (stages.length !== 90) err(`stage count ${stages.length} != 90`);
  if (expected.length !== 90) err(`internal roster ${expected.length} != 90`);
  const towerList = [];
  for (let i = 0; i < Math.min(stages.length, expected.length); i++) {
    const st = stages[i], ex = expected[i];
    if (st.n !== i + 1) err(`stage ${i + 1} has n=${st.n}`);
    if (st.name !== ex.name || st.diff !== ex.diff || st.tower !== ex.tower) {
      err(`stage ${i + 1}: got ${st.diff}/"${st.name}"/tower=${st.tower}, want ${ex.diff}/"${ex.name}"/tower=${ex.tower}`);
    }
    if (st.tower) towerList.push(st.n);
  }
  const wantTowers = [30, 35, 40, 45, 50, 55, 60, 65, 75, 80, 85, 88, 90];
  if (JSON.stringify(towerList) !== JSON.stringify(wantTowers)) {
    err(`towers at ${towerList} want ${wantTowers}`);
  }
  // tower length = 5x last normal; difficulties get longer
  let prevLast = 0;
  for (const d of DIFFS) {
    if (d.special) continue;
    const dStages = stages.filter((s) => s.diff === d.name);
    const normals = dStages.filter((s) => !s.tower);
    const tower = dStages.find((s) => s.tower);
    const last = normals[normals.length - 1];
    if (last && last.budgetPlats < prevLast) {
      err(`${d.name}: last normal ${last.budgetPlats} plats < previous difficulty ${prevLast} (must get longer)`);
    }
    if (last) prevLast = last.budgetPlats;
    for (const s of normals) {
      if (s.budgetPlats !== s.expectedPlats) err(`stage ${s.n} plats ${s.budgetPlats} != expected ${s.expectedPlats}`);
    }
    if (tower) {
      if (tower.budgetPlats !== 5 * d.plats[1]) err(`tower stage ${tower.n} plats ${tower.budgetPlats} != 5x${d.plats[1]}`);
      if (last && tower.budgetPlats !== 5 * last.budgetPlats) {
        err(`tower stage ${tower.n}: ${tower.budgetPlats} != 5 x last normal ${last.budgetPlats}`);
      }
    }
  }

  const diffByName = {};
  for (const d of DIFFS) diffByName[d.name] = d;

  // 2. hop feasibility along the full path (checkpoint pads included)
  let maxGap = 0, maxRise = 0;
  const allNodes = [];
  for (const st of stages) for (const nd of st.path) allNodes.push({ st, nd });
  for (let i = 1; i < allNodes.length; i++) {
    const a = allNodes[i - 1].nd, b = allNodes[i].nd;
    const st = allNodes[i].st;
    const d = diffByName[st.diff];
    const vx = b.x - a.x, vz = b.z - a.z;
    const len = Math.hypot(vx, vz);
    let g = 0;
    if (len > 1e-6) {
      const ux = vx / len, uz = vz / len;
      g = Math.max(0, len - edgeDist(a.hx, a.hz, ux, uz) - edgeDist(b.hx, b.hz, ux, uz));
    }
    const r = b.top - a.top;
    const where = `stage ${st.n} (${st.name}) hop ${i}`;
    if (g > GLOBAL_GAP_MAX + 0.02) err(`${where}: gap ${g.toFixed(2)} > ${GLOBAL_GAP_MAX}`);
    if (r > GLOBAL_RISE_MAX + 0.02) err(`${where}: rise ${r.toFixed(2)} > ${GLOBAL_RISE_MAX}`);
    if (g + 1.3 * Math.max(r, 0) > COMBO_MAX + 0.05) err(`${where}: g+1.3r ${(g + 1.3 * Math.max(r, 0)).toFixed(2)} > ${COMBO_MAX}`);
    if (b.hop === 'cp') {
      if (g > 4.05) err(`${where}: checkpoint gap ${g.toFixed(2)} > 4`);
      if (r > 2.02) err(`${where}: checkpoint rise ${r.toFixed(2)} > 2`);
    } else if (b.hop === 'jump' && d && d.gap) {
      if (g > d.gap[1] + 0.1) err(`${where}: gap ${g.toFixed(2)} > diff max ${d.gap[1]}`);
      if (g < d.gap[0] - 0.5) err(`${where}: jump gap ${g.toFixed(2)} < diff min ${d.gap[0]}`);
    } else if (b.hop === 'ease' && d && d.gap) {
      if (g > d.gap[1] + 0.1) err(`${where}: ease gap ${g.toFixed(2)} > diff max ${d.gap[1]}`);
    } else if (d && d.gap && (b.hop === 'tower' || b.hop === 'tower0')) {
      if (g > 4.8) err(`${where}: tower gap ${g.toFixed(2)} > 4.8`);
    }
    if (g > maxGap) maxGap = g;
    if (r > maxRise) maxRise = r;
    if (![ 'walk', 'jump', 'ease', 'cp', 'checker', 'conn', 'tower', 'tower0' ].includes(b.hop)) err(`${where}: unknown hop type ${b.hop}`);
  }

  // 3. headroom over every path node
  const nodeKeys = new Set();
  for (const st of stages) {
    for (const nd of st.path) nodeKeys.add(`${nd.x}|${nd.z}|${nd.top}`);
  }
  for (let si = 0; si < stages.length; si++) {
    const st = stages[si];
    const near = stages.slice(Math.max(0, si - 1), si + 2);
    for (const nd of st.path) {
      for (const ost of near) {
        for (const p of ost.parts) {
          if (p.kind === 9 || p.kind === 6) continue;
          const hx = p.sx / 2, hz = p.sz / 2, hy = p.sy / 2;
          const ovX = Math.min(nd.x + nd.hx, p.x + hx) - Math.max(nd.x - nd.hx, p.x - hx);
          const ovZ = Math.min(nd.z + nd.hz, p.z + hz) - Math.max(nd.z - nd.hz, p.z - hz);
          if (ovX <= 0.05 || ovZ <= 0.05) continue;
          const bottom = p.y - hy;
          const clr = bottom - nd.top;
          if (clr <= 0.01 || clr >= 7) continue;
          if (p.kind === 1 && clr < 4 && nodeKeys.has(`${p.x}|${p.z}|${F(p.y + p.sy / 2)}`)) {
            // a staircase step: the offending part is itself a path platform a
            // step above; allowed while most of the lower platform stays open
            if (ovX * ovZ > 0.6 * (nd.hx * 2) * (nd.hz * 2)) {
              err(`stage ${st.n}: step platform covers most of the one below`);
            }
          } else if (p.exempt === 'head') {
            if (clr < 6.6 || clr > 6.9) err(`stage ${st.n}: headhitter clearance ${clr.toFixed(2)} not ~6.75`);
          } else if (p.exempt === 'hug') {
            const clear = Math.max(nd.hx * 2, nd.hz * 2) - Math.max(ovX, ovZ);
            if (clear < 1.15) err(`stage ${st.n}: wall-hug leaves ${clear.toFixed(2)} < 1.2 studs`);
          } else {
            err(`stage ${st.n} (${st.name}): part kind ${p.kind} only ${clr.toFixed(2)} above a path platform`);
          }
        }
      }
    }
  }

  // 4. separation for non-adjacent stages: coarse AABB test first; L-shaped
  // stages (with row connectors) get an exact part-level fallback
  const CORE = { 1: 1, 2: 1, 3: 1, 4: 1, 7: 1, 8: 1 };
  const partGap = (p, q) => {
    const ph = p.kind === 9 ? { hx: p.radius + p.armWidth, hy: 0.9, hz: p.radius + p.armWidth, y: p.y + 0.9 } : { hx: p.sx / 2, hy: p.sy / 2, hz: p.sz / 2, y: p.y };
    const qh = q.kind === 9 ? { hx: q.radius + q.armWidth, hy: 0.9, hz: q.radius + q.armWidth, y: q.y + 0.9 } : { hx: q.sx / 2, hy: q.sy / 2, hz: q.sz / 2, y: q.y };
    const gx = Math.max(p.x - ph.hx - (q.x + qh.hx), q.x - qh.hx - (p.x + ph.hx));
    const gy = Math.max(ph.y - ph.hy - (qh.y + qh.hy), qh.y - qh.hy - (ph.y + ph.hy));
    const gz = Math.max(p.z - ph.hz - (q.z + qh.hz), q.z - qh.hz - (p.z + ph.hz));
    return Math.max(gx, gy, gz);
  };
  for (let i = 0; i < stages.length; i++) {
    for (let j = i + 2; j < stages.length; j++) {
      const a = aabbs[i], b = aabbs[j];
      const gx = Math.max(a.minX - b.maxX, b.minX - a.maxX);
      const gy = Math.max(a.minY - b.maxY, b.minY - a.maxY);
      const gz = Math.max(a.minZ - b.maxZ, b.minZ - a.maxZ);
      if (Math.max(gx, gy, gz) >= 4) continue;
      let minGap = Infinity;
      const pi = stages[i].parts.filter((p) => CORE[p.kind] || p.kind === 9);
      const pj = stages[j].parts.filter((p) => CORE[p.kind] || p.kind === 9);
      for (const p of pi) {
        for (const q of pj) {
          const g2 = partGap(p, q);
          if (g2 < minGap) minGap = g2;
          if (minGap < 4) break;
        }
        if (minGap < 4) break;
      }
      if (minGap < 4) {
        errors.push(`stages ${i + 1} and ${j + 1} have parts closer than 4 studs (${minGap.toFixed(2)})`);
      }
    }
  }

  // 5. kill floors: exist, depth, coverage, no intersection with core parts
  for (let i = 0; i < stages.length; i++) {
    const st = stages[i];
    const floors = st.parts.filter((p) => p.kind === 6);
    if (floors.length < 1) { errors.push(`stage ${st.n}: no kill floor`); continue; }
    const f = floors[0];
    const a = aabbs[i];
    if (f.y + 1 > a.minY - 25) errors.push(`stage ${st.n}: kill floor only ${(a.minY - (f.y + 1)).toFixed(1)} below lowest part`);
    if (f.x - f.sx / 2 > a.minX - 19.9 || f.x + f.sx / 2 < a.maxX + 19.9 - 0.2 && false) { /* span checked below */ }
    if (!(f.x - f.sx / 2 <= a.minX - 19 && f.x + f.sx / 2 >= a.maxX + 19 &&
          f.z - f.sz / 2 <= a.minZ - 19 && f.z + f.sz / 2 >= a.maxZ + 19)) {
      errors.push(`stage ${st.n}: kill floor does not span AABB+~20`);
    }
    for (let j = 0; j < stages.length; j++) {
      const b = aabbs[j];
      const ix = f.x - f.sx / 2 < b.maxX && f.x + f.sx / 2 > b.minX;
      const iz = f.z - f.sz / 2 < b.maxZ && f.z + f.sz / 2 > b.minZ;
      const iy = f.y - 1 < b.maxY && f.y + 1 > b.minY;
      if (ix && iz && iy) errors.push(`stage ${st.n}: kill floor intersects stage ${j + 1} parts`);
    }
    if (i > 0) {
      const pf = stages[i - 1].parts.filter((p) => p.kind === 6)[0];
      if (pf) {
        const ox = Math.min(f.x + f.sx / 2, pf.x + pf.sx / 2) - Math.max(f.x - f.sx / 2, pf.x - pf.sx / 2);
        const oz = Math.min(f.z + f.sz / 2, pf.z + pf.sz / 2) - Math.max(f.z - f.sz / 2, pf.z - pf.sz / 2);
        if (ox < 0 || oz < 0) errors.push(`stages ${i} and ${i + 1}: kill floors leave an uncovered gap`);
      }
    }
  }

  // 6. spinners
  for (const st of stages) {
    const d = diffByName[st.diff];
    for (const p of st.parts) {
      if (p.kind !== 9) continue;
      const tip = (p.radius * p.speed * Math.PI) / 180;
      if (d && d.spin && tip > d.spin + 0.05) errors.push(`stage ${st.n}: spinner tip speed ${tip.toFixed(1)} > ${d.spin}`);
      if (2 * (p.radius + p.armWidth) > 8) {
        const period = 360 / p.arms / p.speed;
        if (period < 1.19) errors.push(`stage ${st.n}: spinner pass period ${period.toFixed(2)}s < 1.2`);
      }
      const host = st.path.find((nd) => Math.abs(nd.x - p.x) < 0.01 && Math.abs(nd.z - p.z) < 0.01 && Math.abs(nd.top - p.y) < 0.01);
      if (!host) { errors.push(`stage ${st.n}: spinner has no host platform`); continue; }
      const sweep = p.radius + p.armWidth;
      if (sweep > Math.min(host.hx, host.hz) - 0.5) errors.push(`stage ${st.n}: spinner sweep ${sweep} exceeds host platform`);
      const dcp = Math.hypot(st.cp[0] - p.x, st.cp[2] - p.z);
      if (dcp < sweep + 4.3) errors.push(`stage ${st.n}: spinner sweeps near the checkpoint pad`);
      if (p.armWidth > 2) errors.push(`stage ${st.n}: spinner armWidth ${p.armWidth} > 2`);
    }
  }

  // 7. bounds / sanity
  let bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  for (const a of aabbs) {
    bounds.minX = Math.min(bounds.minX, a.minX); bounds.maxX = Math.max(bounds.maxX, a.maxX);
    bounds.minY = Math.min(bounds.minY, a.minY); bounds.maxY = Math.max(bounds.maxY, a.maxY);
    bounds.minZ = Math.min(bounds.minZ, a.minZ); bounds.maxZ = Math.max(bounds.maxZ, a.maxZ);
  }
  if (Math.max(Math.abs(bounds.minX), bounds.maxX, Math.abs(bounds.minZ), bounds.maxZ) > 8000) errors.push('layout exceeds |x|,|z| 8000');
  if (bounds.maxY > 12000) errors.push('layout exceeds y 12000');
  for (const st of stages) {
    for (const p of st.parts) {
      const vals = p.kind === 9 ? [p.x, p.y, p.z, p.radius, p.arms, p.speed, p.armWidth] : [p.x, p.y, p.z, p.sx, p.sy, p.sz];
      for (const v of vals) if (typeof v !== 'number' || !isFinite(v)) errors.push(`stage ${st.n}: bad number in part`);
      if (p.kind !== 9 && (p.sx <= 0 || p.sy <= 0 || p.sz <= 0)) errors.push(`stage ${st.n}: non-positive part size`);
    }
    if (!st.cp || st.cp.some((v) => !isFinite(v))) errors.push(`stage ${st.n}: bad checkpoint`);
  }

  return { maxGap: F(maxGap), maxRise: F(maxRise), bounds };
}

// ---------------------------------------------------------------------------
// Lua serialization
// ---------------------------------------------------------------------------
function luaStage(st) {
  const parts = st.parts.map((p) => {
    if (p.kind === 9) {
      return `{9,${fmt(p.x)},${fmt(p.y)},${fmt(p.z)},${fmt(p.radius)},${p.arms},${fmt(p.speed)},${fmt(p.armWidth)}}`;
    }
    return `{${p.kind},${fmt(p.x)},${fmt(p.y)},${fmt(p.z)},${fmt(p.sx)},${fmt(p.sy)},${fmt(p.sz)},${fmt(p.ry)}}`;
  }).join(',');
  const c = st.color.map((v) => fmt(v)).join(',');
  const cp = st.cp.map((v) => fmt(v)).join(',');
  return `{n=${st.n},name="${st.name}",diff="${st.diff}",color={${c}},tower=${st.tower},cp={${cp}},parts={${parts}}}`;
}

function serialize(stages) {
  const modules = [];
  let cur = [], curLen = 0, idx = 1;
  const flush = () => {
    if (!cur.length) return;
    modules.push({ name: 'StageData' + idx, source: 'return {\n' + cur.join(',\n') + '\n}\n' });
    idx += 1; cur = []; curLen = 0;
  };
  for (const st of stages) {
    const s = luaStage(st);
    if (curLen + s.length > 120 * 1024) flush();
    cur.push(s);
    curLen += s.length + 2;
  }
  flush();
  modules.push({
    name: 'StageIndex',
    source: [
      'local S = {}',
      'local i = 1',
      'while true do',
      '\tlocal m = script.Parent:FindFirstChild("StageData" .. i)',
      '\tif not m then break end',
      '\tlocal list = require(m)',
      '\tfor j = 1, #list do',
      '\t\tS[#S + 1] = list[j]',
      '\tend',
      '\ti = i + 1',
      'end',
      'table.sort(S, function(a, b) return a.n < b.n end)',
      'return S',
      '',
    ].join('\n'),
  });
  return modules;
}

// ---------------------------------------------------------------------------
// generate()
// ---------------------------------------------------------------------------
function generate() {
  const errors = [];
  let built;
  try {
    built = build(errors);
  } catch (e) {
    errors.push('generator crashed: ' + (e && e.stack || e));
    return { luaModules: [], stats: {}, errors };
  }
  const { stages, aabbs } = built;
  let vstats = {};
  try {
    vstats = validate(stages, aabbs, errors);
  } catch (e) {
    errors.push('validator crashed: ' + (e && e.stack || e));
  }
  let partCount = 91; // 90 pads + spawn built by the server
  for (const st of stages) {
    for (const p of st.parts) partCount += p.kind === 9 ? p.arms + 1 : 1;
  }
  const stats = {
    stageCount: stages.length,
    partCount,
    towers: stages.filter((s) => s.tower).map((s) => s.n),
    maxGap: vstats.maxGap,
    maxRise: vstats.maxRise,
    bounds: vstats.bounds && {
      x: [F(vstats.bounds.minX), F(vstats.bounds.maxX)],
      y: [F(vstats.bounds.minY), F(vstats.bounds.maxY)],
      z: [F(vstats.bounds.minZ), F(vstats.bounds.maxZ)],
    },
  };
  const luaModules = errors.length ? [] : serialize(stages);
  return { luaModules, stats, errors };
}

module.exports = { generate };

// ---------------------------------------------------------------------------
if (require.main === module) {
  const a = generate();
  if (process.argv.includes('--selftest')) {
    const b = generate();
    const sa = JSON.stringify(a.luaModules), sb = JSON.stringify(b.luaModules);
    if (sa !== sb) {
      console.error('DETERMINISM FAIL: two runs differ');
      process.exit(1);
    }
    console.log('determinism OK (two runs byte-identical)');
  }
  console.log('stats:', JSON.stringify(a.stats, null, 1));
  if (a.errors.length) {
    console.error(`\n${a.errors.length} validator errors:`);
    for (const e of a.errors.slice(0, 40)) console.error('  - ' + e);
    if (a.errors.length > 40) console.error(`  ... and ${a.errors.length - 40} more`);
    process.exit(1);
  }
  console.log('all validator checks pass');
  for (const m of a.luaModules) console.log(`  ${m.name}: ${(m.source.length / 1024).toFixed(1)} KB`);
}
