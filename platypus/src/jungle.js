// PLATYPUS — jungle.js (LEVELS2.md B12): the jungle of levels 8-11.
// The landing clearing and the wreck, the scream glade, the river (ford, stepping stones, waterfall
// and plunge pool), the sound trail (fern bank, fig, hollow log, vine curtain), the hidden tribe camp
// on its creek, the Ash tribe's thorn ring, the riverbank field and the stone circle.
//
// How it stays inside the budget:
//  - ground: ONE height grid (1.32 m pitch) that is both the mesh and heightAt (bilinear), splat-painted
//    in vertex colours, with faked canopy dapple in the fragment shader (no trunk shadows);
//  - water: one ribbon mesh (river + creek + the rivals' creek), one waterfall strip;
//  - giant trees: 5 trunk shapes, each one InstancedMesh for the whole forest; canopy = 2 InstancedMeshes;
//  - everything leafy below the canopy is an alpha-TESTED instanced card from ONE 4x4 atlas, split into
//    8 ZONES (2 InstancedMeshes each: understorey cards, mid-storey palms / tree ferns) that are shown
//    only near the focus or the camera; wind and fx.shock bend them in the vertex shader;
//  - set pieces (camp, rival camp, stone circle) are merged vertex-coloured meshes in three groups.
// Nothing is allocated, redrawn or rebuilt per frame.

export function createJungle(ctx) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.name = "jungle";
  const maxAniso = ctx.renderer && ctx.renderer.capabilities && ctx.renderer.capabilities.getMaxAnisotropy ? ctx.renderer.capabilities.getMaxAnisotropy() : 1;

  function sfx(name, a, b, c) { const o = ctx.audio, f = o && o[name]; return typeof f === "function" ? f.call(o, a, b, c) : undefined; }
  function vfx(name, a, b, c, d, e, f) { const o = ctx.fx, fn = o && o[name]; return typeof fn === "function" ? fn.call(o, a, b, c, d, e, f) : undefined; }

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); };
  const sstep = (a, b, x) => smooth((x - a) / (b - a));
  const sq = (v) => v * v;
  const TAU = Math.PI * 2;
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const R = mulberry(0x9e3779b1);
  const rr = (a, b) => a + (b - a) * R();
  function segDist(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 > 1e-9 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = ax + dx * t - px, qz = az + dz * t - pz;
    return Math.sqrt(qx * qx + qz * qz);
  }
  function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }

  // ------------------------------------------------------------------------------------------------
  // Layout (binding: x in [-62, 62], z in [-52, 92])
  // ------------------------------------------------------------------------------------------------
  const MINX = -62, MAXX = 62, MINZ = -52, MAXZ = 92;
  const PITCH = 1.32, GX = 101, GZ = 117, X0 = -66, Z0 = -56;       // the height grid (and the ground mesh)
  const GX1 = X0 + (GX - 1) * PITCH, GZ1 = Z0 + (GZ - 1) * PITCH;

  // the river: west -> east along z ~ 0, crossing z = 0 exactly at the ford (x -10) and the stones (x 14)
  const RK = Math.PI / 24;
  function riverZ(x) { return -4.5 * Math.sin((x - 14) * RK); }
  function riverHalf(x) { return 4 + 0.45 * Math.sin(x * 0.13 + 1) + 2.4 * Math.exp(-sq(x + 46) / 14); }
  function riverDist(x, z) { const s = -4.5 * RK * Math.cos((x - 14) * RK); return Math.abs(z - riverZ(x)) / Math.sqrt(1 + s * s); }

  // the camp's creek: comes in from the north, fills the creek pool, runs south and joins the river
  // under the log bridge. A table of x by z (1 m), blurred from a few keys.
  const CK = [[0, 34.5], [2, 32], [4, 29.3], [6, 26.8], [9, 25.6], [14, 25.5], [22, 27.5], [34, 31], [46, 33.5], [58, 34.5], [68, 32.6], [76, 30.4], [79, 29.5], [84, 33.6], [88, 35], [99, 35]];
  const CT = new Float32Array(100);
  (function () {
    let k = 0;
    for (let z = 0; z < 100; z++) {
      while (k < CK.length - 2 && CK[k + 1][0] <= z) k++;
      const a = CK[k], b = CK[k + 1];
      CT[z] = lerp(a[1], b[1], clamp((z - a[0]) / (b[0] - a[0]), 0, 1));
    }
    const tmp = new Float32Array(100);
    for (let pass = 0; pass < 2; pass++) {
      tmp.set(CT);
      for (let z = 1; z < 99; z++) CT[z] = (tmp[z - 1] + 2 * tmp[z] + tmp[z + 1]) * 0.25;
    }
  })();
  function creekX(z) { const f = clamp(z, 0, 98.999), i = f | 0; return CT[i] + (CT[i + 1] - CT[i]) * (f - i); }
  function creekDist(x, z) { const i = clamp(z, 0, 98) | 0, s = CT[i + 1] - CT[i]; return Math.abs(x - creekX(z)) / Math.sqrt(1 + s * s); }
  function creekHalf(z) { return 1.35 + 2.8 * Math.exp(-sq(z - 79) / 5); }
  function creekY(z) { return z > 4 ? 0.0085 * (z - 4) : 0; }
  // the creek behind the Ash camp (level 9: "they are standing in the water...")
  const RC = { ax: 63.5, az: 48.5, bx: 55, bz: 40, half: 1.7, y: 0.6 };

  const pt = (x, z, yaw) => ({ x, y: 0, z, yaw: yaw || 0 });
  const CAMP = { x: 20, z: 74, r: 15, y: 1.25 };
  const RIVAL = { x: 50, z: 32, r: 12, y: 0.95 };
  const ARENA = { x: -40, z: -30, r: 15 };
  const FIELD = { x: -8, z: -22, r: 16 };
  const BR = { ax: 28.93, az: 0.46, bx: 35.07, bz: 3.54, y: 0.7, r: 0.55 };   // the log bridge (named ends + 1.2 m)
  const LOG = { x: -12, z: 34, yaw: 0.72, len: 7.2, r: 1.25 };                    // the hollow log (axis = (sin yaw, cos yaw))
  LOG.dx = Math.sin(LOG.yaw); LOG.dz = Math.cos(LOG.yaw);
  LOG.ax = LOG.x - LOG.dx * LOG.len / 2; LOG.az = LOG.z - LOG.dz * LOG.len / 2;
  LOG.bx = LOG.x + LOG.dx * LOG.len / 2; LOG.bz = LOG.z + LOG.dz * LOG.len / 2;
  const STONES = [];                                                             // the stepping stones at x 14
  for (let i = 0; i < 8; i++) STONES.push({ x: 14 + [0.3, -0.35, 0.2, -0.15, 0.4, -0.3, 0.1, -0.2][i], z: -4.1 + i * 1.17, r: 0.56 + (i % 3) * 0.04 });
  const ELDER = { x: 20, z: 82, r: 1.2, y: 0 };

  // flat places: { x, z, r, b (blend width), y, w (weight) }
  const FLATS = [
    { x: CAMP.x, z: CAMP.z, r: 14, b: 5, y: CAMP.y, w: 1 },
    { x: ARENA.x, z: ARENA.z, r: 12.5, b: 4.5, y: 0, w: 1 },
    { x: 0, z: -40, r: 5, b: 4, y: 0.55, w: 1 },
    { x: 3, z: -24, r: 4, b: 4, y: 0.6, w: 1 },
    { x: RIVAL.x, z: RIVAL.z, r: 11, b: 4, y: RIVAL.y, w: 1 },
    { x: FIELD.x, z: FIELD.z, r: 13, b: 6, y: 0.55, w: 0.75 },
    { x: 4, z: 50, r: 3, b: 3, y: 1.05, w: 1 },
  ];

  function land(x, z) {
    const h = 0.5 + 0.011 * Math.max(0, z - 4) + 0.42 * Math.sin(x * 0.093 + 1.3) * Math.cos(z * 0.081 - 0.4)
      + 0.3 * Math.sin(x * 0.047 - z * 0.061 + 2.1) + 0.13 * Math.sin(x * 0.31 + z * 0.27);
    return h < 0.34 ? 0.34 - (0.34 - h) * 0.15 : h;
  }
  function cliffK(x, z) { return sstep(-50.6, -53.2, x) * sstep(-16, -11, z) * sstep(24, 19, z); }
  // build-time ground height (the grid is sampled from this; heightAt reads the grid)
  function hRaw(x, z) {
    let h = land(x, z);
    for (let i = 0; i < FLATS.length; i++) {
      const f = FLATS[i], d = Math.hypot(x - f.x, z - f.z);
      if (d < f.r + f.b) h = lerp(h, f.y, (1 - sstep(f.r, f.r + f.b, d)) * f.w);
    }
    { // the stone circle lies in a sunken glade: a rim, open at the two entrances
      const dx = x - ARENA.x, dz = z - ARENA.z, d = Math.hypot(dx, dz);
      if (d > 11 && d < 21) {
        const a = Math.atan2(dz, dx);
        const gate = Math.max(Math.exp(-sq(angDiff(a, 0.142)) / 0.05), Math.exp(-sq(angDiff(a, -3.0)) / 0.05));
        h += 1.0 * Math.exp(-sq(d - 15.8) / 3.2) * (1 - gate);
      }
    }
    h += 2.4 * sstep(86.6, 89.2, z) * sstep(5, 8, x) * sstep(28, 25, x);          // the burrow bank
    { const d2 = sq(x - 30) + sq(z - 86); if (d2 < 60) h = lerp(h, 3.0, Math.exp(-d2 / 6.5)); }  // the lookout root
    { const d2 = sq(x + 61) + sq(z + 34); if (d2 < 400) h = lerp(h, 3.0, Math.exp(-d2 / 40)); }  // the crest of the far trail
    { // the wreck's furrow
      const d = segDist(x, z, 0, -51.5, 0, -42.5);
      if (d < 2.4) h += -0.38 * Math.exp(-d * d / 0.5) + 0.16 * Math.exp(-sq(d - 1.3) / 0.25);
    }
    // the river
    if (x > -54) {
      const rd = riverDist(x, z), rh = riverHalf(x);
      if (rd < rh) {
        const t = rd / rh;
        let bed = -1.6 * (1 - t * t) * (1 + 0.5 * Math.exp(-sq(x + 46) / 14));
        bed = lerp(bed, bed * 0.11, 1 - sstep(2, 4.5, Math.abs(x + 10)));       // the ford: knee-deep
        h = bed;
      } else if (rd < rh + 3.6) {
        const k = (rd - rh) / 3.6;
        h *= 0.25 * k + 0.75 * smooth(k);
      }
    }
    // the creek
    if (z > 0.5 && x > 16 && x < 44) {
      const cd = creekDist(x, z), ch = creekHalf(z), cy = creekY(z);
      if (cd < ch) {
        const t = cd / ch, bed = cy - (0.45 + 0.5 * Math.exp(-sq(z - 79) / 5)) * (1 - t * t);
        if (bed < h) h = bed;
      } else if (cd < ch + 2.2 && h > cy) {
        const k = (cd - ch) / 2.2;
        h = cy + (h - cy) * (0.25 * k + 0.75 * smooth(k));
      }
    }
    { // the rivals' creek
      const d = segDist(x, z, RC.ax, RC.az, RC.bx, RC.bz);
      if (d < RC.half) { const t = d / RC.half, bed = RC.y - 0.5 * (1 - t * t); if (bed < h) h = bed; }
      else if (d < RC.half + 1.8 && h > RC.y) { const k = (d - RC.half) / 1.8; h = RC.y + (h - RC.y) * (0.25 * k + 0.75 * smooth(k)); }
    }
    const c = cliffK(x, z);                                                       // the waterfall cliff
    if (c > 0) h = lerp(h, 8 + 0.5 * Math.sin(x * 0.7) * Math.cos(z * 0.5) - 0.7 * Math.exp(-sq(z - 4) / 3), c);
    return h;
  }

  const H = new Float32Array(GX * GZ);
  for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) H[j * GX + i] = hRaw(X0 + i * PITCH, Z0 + j * PITCH);
  function gridH(x, z) {
    let fx = (x - X0) / PITCH, fz = (z - Z0) / PITCH;
    if (fx < 0) fx = 0; else if (fx > GX - 1.001) fx = GX - 1.001;
    if (fz < 0) fz = 0; else if (fz > GZ - 1.001) fz = GZ - 1.001;
    const ix = fx | 0, iz = fz | 0, tx = fx - ix, tz = fz - iz, o = iz * GX + ix;
    const a = H[o], b = H[o + 1], c = H[o + GX], d = H[o + GX + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  BR.y = Math.max(gridH(BR.ax, BR.az), gridH(BR.bx, BR.bz)) + 0.3;
  ELDER.y = gridH(ELDER.x, ELDER.z) + 0.55;

  function heightAt(x, z) {
    let h = gridH(x, z);
    if (x > 12.5 && x < 15.5 && z > -5.2 && z < 5.2) {
      for (let i = 0; i < STONES.length; i++) {
        const s = STONES[i], d2 = sq(x - s.x) + sq(z - s.z);
        if (d2 < s.r * s.r) { const t = 0.24 - 0.1 * d2 / (s.r * s.r); if (t > h) h = t; }
      }
    } else if (x > 28 && x < 36 && z > -0.5 && z < 4.6) {
      const d = segDist(x, z, BR.ax, BR.az, BR.bx, BR.bz);
      if (d < BR.r) { const t = BR.y - d * d * 0.5; if (t > h) h = t; }
    } else if (x > 18.5 && x < 21.5 && z > 80.5 && z < 83.5) {
      const d2 = sq(x - ELDER.x) + sq(z - ELDER.z);
      if (d2 < ELDER.r * ELDER.r) { const t = ELDER.y - d2 * 0.05; if (t > h) h = t; }
    }
    return h;
  }
  // the level of the water body whose footprint holds (x, z), wherever the bed is below it
  function waterLevel(x, z) {
    if (z > -13 && z < 13 && x > -52.5) { if (riverDist(x, z) < riverHalf(x) + 0.7) return 0; }
    if (z > 0.5 && x > 20 && x < 40) { if (creekDist(x, z) < creekHalf(z) + 0.45) return creekY(z); }
    if (x > 52 && z > 37) { if (segDist(x, z, RC.ax, RC.az, RC.bx, RC.bz) < RC.half + 0.4) return RC.y; }
    return -Infinity;
  }
  function waterAt(x, z) {
    const w = waterLevel(x, z);
    return w !== -Infinity && gridH(x, z) < w ? w : -Infinity;
  }
  function depthAt(x, z) {
    const w = waterLevel(x, z);
    if (w === -Infinity) return 0;
    const d = w - heightAt(x, z);
    return d > 0 ? d : 0;
  }

  // ------------------------------------------------------------------------------------------------
  // Named points, routes, cameras
  // ------------------------------------------------------------------------------------------------
  const P = {
    crash: pt(0, -40), wake: pt(2, -37, 0.3),
    carryPath: [pt(2, -37), pt(4, -30), pt(3, -24)], screamSpot: pt(3, -24),
    ford: pt(-10, 0), stones: pt(14, 0), logBridge: [pt(30, 1, 1.1), pt(34, 3, 1.1)], fallFoot: pt(-50, 4), pool: pt(-46, 2),
    trail: [pt(8, -14), pt(-6, -7), pt(-10, 6), pt(-22, 18), pt(-12, 34), pt(4, 46)],
    fig: pt(-22, 18), log: pt(-12, 34, LOG.yaw), logIn: pt(LOG.ax - LOG.dx * 1.2, LOG.az - LOG.dz * 1.2, LOG.yaw), logOut: pt(LOG.bx + LOG.dx * 1.2, LOG.bz + LOG.dz * 1.2, LOG.yaw),
    curtain: pt(4, 48), meet: pt(4, 50, Math.PI), campGate: pt(10, 60, 0.6), campEdge: pt(14, 66, 0.6),
    camp: pt(CAMP.x, CAMP.z), fire: pt(20, 73), fires: [pt(20, 73), pt(13.5, 79), pt(26, 71)], elder: pt(20, 82, Math.PI),
    burrows: [], totems: [pt(12.2, 65.8, 0.5), pt(27.6, 73.4, -1.4), pt(24.6, 85, 2.9), pt(8.8, 80.4, 1.5)],
    bench: pt(11, 75, 1.2), foodStore: pt(27, 67, -0.6), bed: pt(14, 83, 2.4), creekPool: pt(29, 79), lookout: pt(30, 86, Math.PI), seat: pt(17, 74, 1.9), spots: [],
    leafGrove: pt(-30, 42), vineWall: pt(-18, 62), boneYard: pt(-42, 22),
    matSpots: { leaf: [], vine: [], bone: [] },
    rivalPath: [pt(30, 6), pt(40, 16), pt(46, 24)], rival: pt(RIVAL.x, RIVAL.z), rivalGate: pt(44, 26, 0.79), hoard: pt(54, 36), rivalFire: pt(50, 31),
    ambush: [pt(32.6, 10.4), pt(39.6, 12.6), pt(41.4, 21.4)], rivalTotem: pt(39.9, 23.5), rivalBreach: pt(40.8, 24.3), rivalCreek: pt(57, 42),
    rivalDrink: [pt(55.4, 40.4), pt(57, 42), pt(58.6, 43.6), pt(60.2, 45.2)],
    field: pt(FIELD.x, FIELD.z), fieldGates: [pt(-30, -40, 0.9), pt(16, -44, -0.5)], barricade: pt(-4, -10, Math.PI),
    arenaIn: pt(-26, -28, -1.5), arenaBack: pt(-54, -32, -1.5), farTrail: pt(-60, -34, -1.5), idol: pt(-45.6, -24.4, 2.4), paper: pt(-56, -32.6),
    baseTrail: pt(58, -28, -1.4),
    huntPath: [pt(12, 62), pt(24, 60), pt(28, 44), pt(23.4, 24), pt(22.6, 9), pt(27, 2.2), pt(30, 1)],
    leadPath: [pt(4, 50), pt(7.5, 55), pt(10, 60), pt(14, 66)],
  };
  for (let i = 0; i < 6; i++) P.burrows.push(pt(9.5 + i * 3.2, 86.2, Math.PI));
  for (let i = 0; i < 6; i++) { const a = 0.5 + i * 1.05; P.matSpots.leaf.push(pt(-30 + Math.cos(a) * 4.2, 42 + Math.sin(a) * 4.2)); }
  for (let i = 0; i < 4; i++) P.matSpots.vine.push(pt(-21 + i * 2, 61.4 + (i % 2) * 0.4, 0));
  for (let i = 0; i < 4; i++) { const a = 0.9 + i * 1.6; P.matSpots.bone.push(pt(-42 + Math.cos(a) * 3.4, 22 + Math.sin(a) * 3.2)); }
  (function spots() {
    const S = P.spots, fx0 = P.fire.x, fz0 = P.fire.z;
    const toFire = (x, z) => Math.atan2(fx0 - x, fz0 - z);
    const add = (x, z, kind, yaw) => S.push({ x, y: 0, z, yaw: yaw === undefined ? toFire(x, z) : yaw, kind });
    const seatA = Math.atan2(P.seat.z - fz0, P.seat.x - fx0);
    for (let i = 0, n = 0; n < 10 && i < 14; i++) {
      const a = i * (TAU / 12.5) + 0.2;
      if (Math.abs(angDiff(a, seatA)) < 0.42) continue;
      const r = 3.1 + (i % 3) * 0.36;
      add(fx0 + Math.cos(a) * r, fz0 + Math.sin(a) * r, "sit"); n++;
    }
    for (let i = 0; i < 6; i++) { const a = i * (TAU / 6) + 0.7; add(fx0 + Math.cos(a) * 5.3, fz0 + Math.sin(a) * 5 - 0.4, "eat"); }
    for (let i = 0; i < 6; i++) add(P.burrows[i].x + (i % 2 ? 0.7 : -0.6), 84.9 - (i % 3) * 0.3, "sleep", 2.2 + i);
    add(9.6, 76.3, "work", 2.2); add(12.5, 76.5, "work", -2.4); add(10.1, 73.5, "work", 0.5); add(12.7, 73.7, "work", -0.6);
    add(25.3, 80.2, "idle", 1.4); add(25.9, 77.3, "idle", 1.2); add(26.6, 82.6, "idle", 1.9); add(24.8, 78.7, "idle", 1.6);
    add(15, 68, "idle", 0.4); add(23, 66.6, "idle", -2.6); add(25.2, 75.4, "idle", 2.9); add(16.2, 80.4, "idle", 2); add(22.6, 79.2, "idle", -1.2); add(18.2, 85.2, "idle", 2.7);
  })();
  const arena = {
    x: ARENA.x, y: 0, z: ARENA.z, r: ARENA.r,
    pillars: [{ x: -40, z: -21, r: 1.0, hits: 0 }, { x: -31, z: -30, r: 1.0, hits: 0 }, { x: -40, z: -39, r: 1.0, hits: 0 }, { x: -49, z: -30, r: 1.0, hits: 0 }],
    gates: [P.arenaIn, P.arenaBack],
  };
  P.arena = arena;
  (function fillY(o) {
    for (const k in o) {
      const v = o[k];
      if (!v || typeof v !== "object") continue;
      if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) if (v[i] && typeof v[i].x === "number") v[i].y = Math.max(heightAt(v[i].x, v[i].z), 0); }
      else if (typeof v.x === "number" && typeof v.z === "number") { if (v !== arena) v.y = heightAt(v.x, v.z); }
      else fillY(v);
    }
  })(P);
  P.pool.y = 0; P.ford.y = 0; P.fallFoot.y = 0;
  const cam = (px, py, pz, lx, ly, lz) => ({ pos: { x: px, y: py, z: pz }, look: { x: lx, y: ly, z: lz } });
  const gy = (x, z) => Math.max(heightAt(x, z), 0);
  P.camCrash = cam(6.4, gy(6.4, -47) + 2.7, -47, 0, 1.2, -40.4);
  P.camGlade = cam(4.7, P.screamSpot.y + 0.34, -26.7, 3, P.screamSpot.y + 0.3, -24);
  P.camCanopy = cam(2, P.wake.y + 0.45, -37, 2.5, 30, -36.1);
  P.camRiver = cam(-1.5, gy(-1.5, -9) + 1.9, -9, -9, 0.1, 1);
  P.camFig = cam(-16.8, gy(-16.8, 14) + 1.3, 14, -24, 5, 19.6);
  P.camMeet = cam(7.4, P.meet.y + 0.7, 51.6, 3.6, P.meet.y + 0.3, 49.4);
  P.camCampReveal = cam(30, 9, 58, 20, 1, 76);
  P.camFire = cam(23.8, CAMP.y + 1.5, 69.2, 20, CAMP.y + 0.6, 73.2);
  P.camElder = cam(20.7, CAMP.y + 1.25, 78.4, 20, ELDER.y + 0.35, 82);
  P.camBed = cam(16.6, CAMP.y + 1.1, 80.6, 14, CAMP.y + 0.2, 83);
  P.camRival = cam(38.5, 4.6, 19, 50, 1, 32);
  P.camField = cam(-2, 5.5, -4, -10, 0.6, -26);
  P.camArena = cam(-40, 10, -48, -40, 1, -30);
  P.camIdol = cam(-41.2, 1.1, -27.6, -45.6, 2.3, -24.4);
  P.camFarTrail = cam(-51.5, 6.6, -29.6, -78, 6.2, -37);

  const routes = {
    captors: [{ x: 2, z: -37 }, { x: 4, z: -30 }, { x: 3, z: -24 }],
    campWalk: [{ x: 16, z: 70 }, { x: 24, z: 69.6, wait: 2 }, { x: 26.4, z: 76 }, { x: 22, z: 80.4, wait: 3 }, { x: 15.4, z: 79 }, { x: 12, z: 72.6, wait: 2 }],
    rivalGuardA: [{ x: 43.4, z: 20, wait: 3 }, { x: 40.6, z: 18.6 }, { x: 44.6, z: 17.4, wait: 2 }, { x: 46.8, z: 18.6 }],
    rivalGuardB: [{ x: 47.6, z: 29.6, wait: 2 }, { x: 54, z: 30.6 }, { x: 52, z: 37.8, wait: 3 }, { x: 47, z: 36 }],
    fieldLine: [{ x: -14, z: -9.2 }, { x: -9, z: -9.8, wait: 2 }, { x: -4, z: -10 }, { x: 1, z: -9.8, wait: 2 }, { x: 6, z: -9.2 }],
    hunt: P.huntPath, lead: P.leadPath,
    fieldWest: [{ x: -30, z: -40 }, { x: -20, z: -31 }, { x: -10, z: -20 }],
    fieldEast: [{ x: 16, z: -44 }, { x: 10, z: -34 }, { x: -2, z: -20 }],
    arenaGuard: [{ x: -54, z: -32 }, { x: -47, z: -31 }, { x: -40, z: -30 }],
  };

  // walking lanes kept clear of trunks and undergrowth: [x0, z0, x1, z1]
  const PATHS = [];
  function lane(list) { for (let i = 0; i + 1 < list.length; i++) PATHS.push([list[i].x, list[i].z, list[i + 1].x, list[i + 1].z]); }
  lane([P.crash, P.wake, P.carryPath[1], P.carryPath[2], P.trail[0], P.trail[1]]);
  lane([P.trail[1], P.ford, P.trail[2], P.trail[3], P.logIn, P.logOut, P.trail[5], P.meet, P.leadPath[1], P.campGate, P.campEdge, P.camp]);
  lane([P.trail[1], { x: 6, z: -6 }, { x: 14, z: -5.6 }]); lane([{ x: 14, z: 5.6 }, { x: 2, z: 9 }, P.trail[2]]);
  lane(P.huntPath); lane([P.logBridge[0], P.logBridge[1], P.rivalPath[0], P.rivalPath[1], P.rivalPath[2], P.rivalGate, P.rival]);
  lane([P.field, { x: -18, z: -25 }, P.arenaIn, { x: -33, z: -29 }]); lane([{ x: -47, z: -31 }, P.arenaBack, P.farTrail, { x: -70, z: -37 }]);
  lane([P.baseTrail, { x: 40, z: -27 }, { x: 22, z: -24 }, { x: 8, z: -22 }, P.field]); lane([P.field, P.barricade, P.ford]);
  lane([P.trail[3], P.boneYard]); lane([P.trail[4], P.leafGrove]); lane([P.meet, { x: -8, z: 56 }, P.vineWall]); lane([P.fieldGates[1], { x: 8, z: -34 }]);
  function pathDist(x, z) { let m = 99; for (let i = 0; i < PATHS.length; i++) { const p = PATHS[i], d = segDist(x, z, p[0], p[1], p[2], p[3]); if (d < m) m = d; } return m; }

  // hide spots: tall grass, fern banks, the ambush bushes
  const GRASS = [], FERNS = [], HIDE = [];
  for (let i = 0; i < 8; i++) { const a = i * (TAU / 8) + 0.4; if (Math.abs(angDiff(a, -1.45)) < 0.5) continue; GRASS.push({ x: 3 + Math.cos(a) * 5.6, z: -24 + Math.sin(a) * 5.6, r: 1.9 }); }
  [[-19, -12, 2.4], [-23.5, -20, 2.2], [5.5, -11.5, 2], [11.5, -27, 2.2], [-14, -34, 2.4], [-1, -31.5, 1.8], [22, -20, 2.4], [36, -26, 2.6], [48, -27, 2.4], [-30, -14, 2.2], [24, 12, 2], [36.5, 22, 1.8]]
    .forEach((g) => GRASS.push({ x: g[0], z: g[1], r: g[2] }));
  [[9.6, -12.8, 2.6], [-16, 10.5, 2.4], [-2, 40, 2.4], [-26, 30, 2.6], [-6.5, 21, 2.2], [14, 40, 2.4]].forEach((g) => FERNS.push({ x: g[0], z: g[1], r: g[2] }));
  for (let i = 0; i < GRASS.length; i++) HIDE.push(GRASS[i]);
  for (let i = 0; i < FERNS.length; i++) HIDE.push(FERNS[i]);
  for (let i = 0; i < 3; i++) HIDE.push({ x: P.ambush[i].x, z: P.ambush[i].z, r: 1.6 });
  function hidden(x, z) {
    for (let i = 0; i < HIDE.length; i++) { const h = HIDE[i], dx = x - h.x, dz = z - h.z; if (dx * dx + dz * dz < h.r * h.r) return true; }
    return false;
  }

  // ------------------------------------------------------------------------------------------------
  // Placement: giant trees, mid-storey, rocks -> colliders, sight blockers, cover, canopy shade
  // ------------------------------------------------------------------------------------------------
  const EX = [
    [CAMP.x, CAMP.z, 16.5], [ARENA.x, ARENA.z, 17.5], [FIELD.x, FIELD.z, 15], [0, -40, 8], [3, -24, 7], [RIVAL.x, RIVAL.z, 14.5],
    [4, 50, 3.6], [-42, 22, 5.5], [-61, -34, 9], [58, -28, 3.5], [-30, 42, 3], [-18, 63.4, 4.4], [LOG.x, LOG.z, 5], [30, 86, 3.6],
    [-22, 18, 2.6], [8, -14, 2.6], [-6, -7, 2.6], [-10, 6, 2.6], [4, 46, 2.6], [10, 60, 2.2], [-30, -40, 3], [16, -44, 3], [32, 2, 4.5], [57, 42, 5], [-4, -10.6, 5], [32.6, 10.4, 2], [39.6, 12.6, 2], [41.4, 21.4, 2], [39.9, 23.5, 2],
  ];
  function freeAt(x, z, m) {
    if (x > -55 && Math.abs(z) < 16 && riverDist(x, z) < riverHalf(x) + 2 + m) return false;
    if (z > -1 && z < 99 && x > 14 && x < 46 && creekDist(x, z) < creekHalf(z) + 1.3 + m) return false;
    if (segDist(x, z, RC.ax, RC.az, RC.bx, RC.bz) < RC.half + 1.6 + m) return false;
    if (x < -49.5 && z > -18 && z < 26) return false;
    for (let i = 0; i < EX.length; i++) { const e = EX[i], r = e[2] + m; if (r > 0 && sq(x - e[0]) + sq(z - e[1]) < r * r) return false; }
    return pathDist(x, z) >= 1.7 + m;
  }
  const zoneOf = (x, z) => (x < 0 ? 0 : 4) + (z < -18 ? 0 : z < 18 ? 1 : z < 54 ? 2 : 3);
  const ZONES = [];
  for (let c = 0; c < 2; c++) for (let r = 0; r < 4; r++) {
    ZONES.push({ x0: c ? 0 : X0, x1: c ? GX1 : 0, z0: [Z0, -18, 18, 54][r], z1: [-18, 18, 54, GZ1][r], under: null, mid: null, mode: null, cards: [], mids: [] });
  }

  const giants = [];   // { x, y, z, type, s, sy, rot, r }
  function addGiant(x, z, type, s) {
    const g = { x, y: Math.max(gridH(x, z), 0) - 0.15, z, type, s, sy: s * rr(0.9, 1.15), rot: R() * TAU, r: [1.45, 1.35, 1.6, 1.3, 1.4][type] * s };
    giants.push(g);
    return g;
  }
  const figTree = addGiant(-24.8, 19.8, 4, 1.45);
  const birdTrees = [addGiant(-4.5, -18.5, 0, 0.95), addGiant(10.5, -20.5, 1, 0.95), addGiant(8.8, -31.8, 2, 0.95)];
  addGiant(0.9, 48.2, 1, 0.9); addGiant(7.1, 48.2, 3, 0.9); addGiant(-3.7, 47.6, 0, 0.85); addGiant(11.6, 47.4, 2, 0.85);
  addGiant(7.1, 60.7, 0, 0.95); addGiant(13, 59.5, 2, 0.95); addGiant(32.3, 88.7, 1, 1.15);
  addGiant(-14, -22, 3, 0.7); addGiant(-6.4, -32.4, 0, 0.7); addGiant(-3.8, -35.4, 3, 1.0);
  for (let tries = 0; tries < 6000 && giants.length < 60; tries++) {
    const x = rr(-80, 80), z = rr(-70, 110);
    const inside = x > MINX && x < MAXX && z > MINZ && z < MAXZ;
    if (!freeAt(x, z, 0.9)) continue;
    const gap = inside ? 7.6 : 9.5;
    let ok = true;
    for (let i = 0; i < giants.length; i++) if (sq(x - giants[i].x) + sq(z - giants[i].z) < gap * gap) { ok = false; break; }
    if (!ok) continue;
    const t = R();
    addGiant(x, z, t < 0.27 ? 0 : t < 0.52 ? 1 : t < 0.74 ? 2 : t < 0.92 ? 3 : 4, rr(0.82, 1.22));
  }
  for (let i = 0; i < birdTrees.length; i++) birdTrees[i] = { x: birdTrees[i].x, y: birdTrees[i].y + 24 * birdTrees[i].sy, z: birdTrees[i].z };
  for (let i = 14; i < giants.length && birdTrees.length < 14; i += 4) { const g = giants[i]; if (g.x > MINX && g.x < MAXX && g.z > MINZ && g.z < MAXZ) birdTrees.push({ x: g.x, y: g.y + 24 * g.sy, z: g.z }); }

  const mids = [];     // palms and tree ferns: { x, y, z, s, rot, tile }
  for (let tries = 0; tries < 9000 && mids.length < 232; tries++) {
    const x = rr(-72, 72), z = rr(-62, 102);
    if (!freeAt(x, z, -0.45)) continue;
    let ok = true;
    for (let i = 0; i < giants.length && ok; i++) { const g = giants[i], d = g.r + 1.7; if (sq(x - g.x) + sq(z - g.z) < d * d) ok = false; }
    for (let i = 0; i < mids.length && ok; i++) if (sq(x - mids[i].x) + sq(z - mids[i].z) < 10.5) ok = false;
    if (!ok) continue;
    const zi = zoneOf(x, z);
    if (ZONES[zi].mids.length >= 34) continue;
    const fern = R() < 0.4;
    const m = { x, y: Math.max(gridH(x, z), 0) - 0.1, z, s: fern ? rr(0.5, 0.78) : rr(0.85, 1.45), rot: R() * TAU, tile: fern ? 9 : 8 };
    mids.push(m);
    ZONES[zi].mids.push(m);
  }

  // rocks: { x, y (centre), z, sx, sy, sz, rot, solid, tint }
  const rocks = [], foamSrc = [];
  function addRock(x, z, s, o) {
    o = o || {};
    const sy = (o.sy !== undefined ? o.sy : rr(0.6, 0.85)) * s, top = o.top;
    const base = Math.max(gridH(x, z), o.wet ? -0.6 : -9);
    const rk = { x, z, sx: s * rr(0.9, 1.15), sy, sz: s * rr(0.85, 1.1), y: top !== undefined ? top - sy * 0.92 : base + sy * (o.sink !== undefined ? o.sink : 0.45), rot: R() * TAU, solid: o.solid !== false && s > 0.62, tint: o.tint || 0 };
    rocks.push(rk);
    return rk;
  }
  [-38, -31, -24.5, -17, -3, 4.5, 21, 27, 41, 48.5, 56].forEach((x, i) => {
    const z = riverZ(x) + (i % 2 ? 1 : -1) * rr(1.2, 2.8), s = rr(0.8, 1.5);
    const rk = addRock(x, z, s, { wet: true, sink: 0.35 });
    rk.y = Math.min(rk.y, 0.1); foamSrc.push({ x, z, r: s * 1.9 });
  });
  for (let i = 0; i < 10; i++) { const x = -12.6 + i * 0.58 + rr(-0.2, 0.2), z = riverZ(x) + rr(-3.3, 3.3); addRock(x, z, rr(0.34, 0.52), { top: rr(0.07, 0.16), sy: 0.6, solid: false }); foamSrc.push({ x, z, r: 0.9 }); }
  for (let i = 0; i < STONES.length; i++) { const s = STONES[i]; const rk = addRock(s.x, s.z, s.r * 1.08, { top: 0.25, sy: 0.5, solid: false }); rk.sx = rk.sz = s.r * 1.1; foamSrc.push({ x: s.x, z: s.z, r: 1.0 }); }
  for (let i = 0; i < 5; i++) { const z = 0.6 + i * 1.7, x = -49.4 + rr(-0.5, 0.9); addRock(x, z, rr(0.8, 1.5), { wet: true, sink: 0.3 }); }
  foamSrc.push({ x: -49.6, z: 4, r: 4.4 });
  addRock(-52.6, 1.3, 1.5, { top: 8.9 }); addRock(-52.8, 6.9, 1.7, { top: 9.1 }); addRock(-52.4, 4.1, 0.7, { top: 8.25, solid: false });
  for (let i = 0; i < 11; i++) { const z = -15 + i * 3.7; if (z > -2 && z < 10) continue; addRock(-50.6 + rr(-0.4, 0.6), z + rr(-0.8, 0.8), rr(1.0, 2.0), { sink: 0.5 }); }
  const fieldRocks = [[-15.5, -27.8], [-9.5, -30.5], [-1.5, -17.5], [12.5, -26.6], [-20.5, -17], [11.5, -16.5], [-7, -37], [-15.5, -36.5]].map((p) => addRock(p[0], p[1], rr(1.25, 1.7), { sy: 0.8, sink: 0.6 }));
  for (let tries = 0, n = 0; tries < 900 && n < 24; tries++) { const x = rr(-64, 64), z = rr(-54, 94); if (!freeAt(x, z, 0.2)) continue; addRock(x, z, rr(0.45, 1.5)); n++; }
  for (let i = 0; i < 6; i++) addRock(-23 + i * 2.05 + rr(-0.3, 0.3), 64.5 + rr(-0.4, 0.4), rr(1.7, 2.2), { sy: 1.15, sink: 0.7 });       // the vine wall
  [[-1.3, 48.3, 1.5], [9.3, 48.3, 1.5], [-6.2, 48, 1.3], [-8.8, 47.3, 1.1], [14.1, 47.6, 1.3], [16.6, 47, 1.0]].forEach((p) => addRock(p[0], p[1], p[2], { sy: 0.95, sink: 0.6 }));
  for (let i = 0; i < 7; i++) { const a = 0.7 + i * 0.86; if (Math.abs(angDiff(a, 0.14)) < 0.4 || Math.abs(angDiff(a, -3.0)) < 0.4) continue; addRock(ARENA.x + Math.cos(a) * 16.4, ARENA.z + Math.sin(a) * 16.4, rr(0.9, 1.5)); }
  [[-44.5, 24.2, 0.7], [-39.4, 19.4, 0.55], [-45.8, 20.2, 0.5]].forEach((p) => addRock(p[0], p[1], p[2], { tint: 1, solid: false }));
  addRock(ELDER.x, ELDER.z, 1.32, { top: ELDER.y + 0.02, sy: 0.5, solid: false });
  const firePits = [P.fires[0], P.fires[1], P.fires[2], P.rivalFire];
  for (let f = 0; f < firePits.length; f++) for (let i = 0; i < 8; i++) { const a = i * (TAU / 8) + f; addRock(firePits[f].x + Math.cos(a) * 0.78, firePits[f].z + Math.sin(a) * 0.78, rr(0.17, 0.24), { sy: 0.7, sink: 0.5, solid: false, tint: 2 }); }
  for (let i = 0; i < 6; i++) { addRock(P.burrows[i].x - 0.85, 87.25, rr(0.36, 0.48), { solid: false }); addRock(P.burrows[i].x + 0.85, 87.3, rr(0.36, 0.48), { solid: false }); }
  [[53.2, 37.2, 0.5], [55.2, 35.2, 0.45], [54.9, 37.3, 0.4]].forEach((p) => addRock(p[0], p[1], p[2], { solid: false }));

  // fallen logs: { x, y, z, len, d, yaw, pitch, tint } (the bridge, the barricade, seats, driftwood ...)
  const logsI = [];
  function addLog(x, z, len, d, yaw, o) {
    o = o || {};
    const l = { x, z, len, d, yaw, pitch: o.pitch || 0, y: (o.y !== undefined ? o.y : Math.max(gridH(x, z), 0) + d * 0.32), tint: o.tint || 0, solid: !!o.solid };
    logsI.push(l);
    return l;
  }
  const brYaw = Math.atan2(BR.bx - BR.ax, BR.bz - BR.az), brLen = Math.hypot(BR.bx - BR.ax, BR.bz - BR.az);
  addLog((BR.ax + BR.bx) / 2, (BR.az + BR.bz) / 2, brLen + 0.5, BR.r * 2, brYaw, { y: BR.y - BR.r });
  const barr = [];   // the tribe's line at the barricade
  [[-6.9, -11.3, 4.6, 0.62, 1.52], [-2.3, -11.2, 4.4, 0.66, 1.62], [-4.6, -11.25, 4.6, 0.5, 1.6], [-7.4, -11.25, 2.6, 0.44, 1.5]].forEach((b, i) => {
    const l = addLog(b[0], b[1], b[2], b[3], b[4], i > 1 ? { y: gridH(b[0], b[1]) + (i === 2 ? 0.78 : 1.2) } : undefined);
    if (i < 2) barr.push(l);
  });
  for (let i = 0; i < 7; i++) addLog(-9.2 + i * 1.45, -12, 1.7, 0.13, rr(-0.25, 0.25) + Math.PI, { pitch: -0.75, y: gridH(-9.2 + i * 1.45, -12) + 0.55, tint: 3 });
  [[17.2, 75.4, 2.4, 0.42, 0.4], [22.9, 75.3, 2.6, 0.44, -0.5], [20.4, 70.2, 2.6, 0.4, 1.55]].forEach((b) => addLog(b[0], b[1], b[2], b[3], b[4]));
  for (let f = 0; f < firePits.length; f++) for (let i = 0; i < 3; i++) addLog(firePits[f].x + Math.cos(i * 2.1 + f) * 0.2, firePits[f].z + Math.sin(i * 2.1 + f) * 0.2, 0.95, 0.16, i * 2.1 + f, { pitch: 0.28, tint: 2, y: firePits[f].y + 0.16 });
  for (let tries = 0, n = 0; tries < 400 && n < 9; tries++) { const x = rr(-58, 58), z = rr(-48, 88); if (!freeAt(x, z, 1.6)) continue; addLog(x, z, rr(3.5, 7), rr(0.5, 0.85), R() * TAU, { solid: true }); n++; }
  [[-2.2, -43.4, 2.6, 0.18, 0.8], [2.6, -44.6, 3.1, 0.22, -0.5], [-3.4, -38.6, 2.2, 0.15, 2.1], [3.9, -41.2, 1.9, 0.14, 1.2]].forEach((b) => addLog(b[0], b[1], b[2], b[3], b[4], { tint: 3 }));
  [[-40.5, 24.6, 3.4, 0.36, 0.7], [-44.6, 21.4, 2.6, 0.3, 2.2], [-38.6, 21.8, 2.2, 0.24, -0.4], [-43, 18.8, 3, 0.28, 1.5]].forEach((b) => addLog(b[0], b[1], b[2], b[3], b[4], { tint: 1 }));

  // ---- colliders, sight blockers, cover ----
  const colliders = [], cover = [], coverPoints = [];
  const BL = [];       // sight blockers { x, z, r, on }
  function solid(x, z, r, h, blocks) {
    const c = { x, z, r, on: true };
    colliders.push(c);
    const cv = h > 0.5 ? { x, z, r, h } : null;
    if (cv) cover.push(cv);
    const b = blocks ? { x, z, r: r * 0.8, on: true } : null;
    if (b) BL.push(b);
    return { c, cv, b };
  }
  for (let i = 0; i < giants.length; i++) { const g = giants[i]; solid(g.x, g.z, g.r, 8, true); }
  // the fire pits: nobody walks through the flames (a low ring: no cover, no sight blocking)
  for (const f of [P.fires[0], P.fires[1], P.fires[2], P.rivalFire]) colliders.push({ x: f.x, z: f.z, r: 0.7, on: true });
  for (let i = 0; i < mids.length; i++) colliders.push({ x: mids[i].x, z: mids[i].z, r: 0.26, on: true });
  for (let i = 0; i < rocks.length; i++) {
    const rk = rocks[i];
    if (!rk.solid) continue;
    const top = rk.y + rk.sy - Math.max(gridH(rk.x, rk.z), 0);
    if (top < 0.45) continue;
    solid(rk.x, rk.z, Math.max(rk.sx, rk.sz) * 0.82, top, top > 1.25 && rk.sx > 0.9);
  }
  for (let i = 0; i < fieldRocks.length; i++) { const rk = fieldRocks[i]; coverPoints.push({ x: rk.x, z: rk.z - rk.sz - 0.75 }); }
  coverPoints.push({ x: -14, z: -23.8 }, { x: -6.4, z: -34 }, { x: -4.5, z: -20.2 }, { x: 10.5, z: -22.2 });
  for (let i = 0; i < logsI.length; i++) {
    const l = logsI[i];
    if (!l.solid) continue;
    for (let k = -1; k <= 1; k++) solid(l.x + Math.sin(l.yaw) * k * l.len * 0.33, l.z + Math.cos(l.yaw) * k * l.len * 0.33, l.d * 0.55, l.d * 0.9, false);
  }
  for (let i = 0; i < barr.length; i++) for (let k = -1; k <= 1; k += 2) solid(barr[i].x + k * 1.15, barr[i].z, 0.72, 1.05, false);
  const pillarSolid = arena.pillars.map((p) => solid(p.x, p.z, p.r, 5, true));
  solid(P.idol.x, P.idol.z, 2.3, 2, true);
  solid(0.2, -41.2, 1.5, 1.6, true); solid(-0.9, -43.6, 0.9, 0.9, false);                          // the wreck
  for (let k = 0; k < 5; k++) for (let s = -1; s <= 1; s += 2) {                                     // the hollow log's walls
    const t = -LOG.len / 2 + 0.5 + k * (LOG.len - 1) / 4;
    solid(LOG.x + LOG.dx * t + LOG.dz * s * (LOG.r + 0.3), LOG.z + LOG.dz * t - LOG.dx * s * (LOG.r + 0.3), 0.5, 2.2, k === 2);
  }
  for (let i = 0; i < 4; i++) colliders.push({ x: P.totems[i].x, z: P.totems[i].z, r: 0.42, on: true });
  for (let f = 0; f < firePits.length; f++) colliders.push({ x: firePits[f].x, z: firePits[f].z, r: 0.6, on: true });
  solid(P.foodStore.x, P.foodStore.z, 1.15, 1.4, false); solid(P.hoard.x, P.hoard.z, 1.2, 1.0, false);
  const curtainCol = { x: 4, z: 48.2, r: 1.45, on: true };
  colliders.push(curtainCol, { x: 2.4, z: 48.2, r: 0.7, on: true }, { x: 5.6, z: 48.2, r: 0.7, on: true });
  const curtainSide = [colliders[colliders.length - 2], colliders[colliders.length - 1]];
  // the Ash tribe's thorn ring: one gap at the gate, one where the creek comes through
  const thorn = [];    // { x, z, a, col, breach }
  {
    const gateA = Math.atan2(21.6 - RIVAL.z, 44.2 - RIVAL.x), creekA = Math.atan2(40.6 - RIVAL.z, 55.6 - RIVAL.x);
    const breachA = Math.atan2(P.rivalBreach.z - RIVAL.z, P.rivalBreach.x - RIVAL.x);
    const n = 46;
    for (let i = 0; i < n; i++) {
      const a = (i + 0.5) / n * TAU - Math.PI;
      if (Math.abs(angDiff(a, gateA)) < 0.2 || Math.abs(angDiff(a, creekA)) < 0.24) continue;
      const x = RIVAL.x + Math.cos(a) * RIVAL.r, z = RIVAL.z + Math.sin(a) * RIVAL.r;
      const c = { x, z, r: 0.95, on: true };
      colliders.push(c);
      thorn.push({ x, z, a, col: c, breach: Math.abs(angDiff(a, breachA)) < 0.13 });
    }
  }
  const rivalTotemCol = { x: P.rivalTotem.x, z: P.rivalTotem.z, r: 0.42, on: true };
  colliders.push(rivalTotemCol);

  // sight: a coarse grid of the blockers, walked along the segment
  const SC = 8, SX0 = -84, SZ0 = -76, SNX = 21, SNZ = 24;
  const cellStart = new Int32Array(SNX * SNZ + 1);
  let cellList;
  (function () {
    const cnt = new Int32Array(SNX * SNZ);
    const each = (fn) => {
      for (let b = 0; b < BL.length; b++) {
        const o = BL[b];
        const i0 = clamp(Math.floor((o.x - o.r - SX0) / SC), 0, SNX - 1), i1 = clamp(Math.floor((o.x + o.r - SX0) / SC), 0, SNX - 1);
        const j0 = clamp(Math.floor((o.z - o.r - SZ0) / SC), 0, SNZ - 1), j1 = clamp(Math.floor((o.z + o.r - SZ0) / SC), 0, SNZ - 1);
        for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * SNX + i, b);
      }
    };
    each((c) => { cnt[c]++; });
    for (let c = 0; c < SNX * SNZ; c++) cellStart[c + 1] = cellStart[c] + cnt[c];
    cellList = new Int16Array(cellStart[SNX * SNZ]);
    cnt.fill(0);
    each((c, b) => { cellList[cellStart[c] + cnt[c]++] = b; });
  })();
  function sight(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
    if (l2 < 1e-6) return true;
    let i0 = Math.floor(((x0 < x1 ? x0 : x1) - SX0) / SC), i1 = Math.floor(((x0 > x1 ? x0 : x1) - SX0) / SC);
    let j0 = Math.floor(((z0 < z1 ? z0 : z1) - SZ0) / SC), j1 = Math.floor(((z0 > z1 ? z0 : z1) - SZ0) / SC);
    if (i0 < 0) i0 = 0; if (j0 < 0) j0 = 0; if (i1 > SNX - 1) i1 = SNX - 1; if (j1 > SNZ - 1) j1 = SNZ - 1;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        // skip cells the segment does not come near
        const cx = SX0 + (i + 0.5) * SC - x0, cz = SZ0 + (j + 0.5) * SC - z0;
        let t = (cx * dx + cz * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = cx - dx * t, ez = cz - dz * t;
        if (ex * ex + ez * ez > 34) continue;
        const c = j * SNX + i;
        for (let k = cellStart[c], e = cellStart[c + 1]; k < e; k++) {
          const b = BL[cellList[k]];
          if (!b.on) continue;
          const bx = b.x - x0, bz = b.z - z0;
          let u = (bx * dx + bz * dz) / l2;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const qx = bx - dx * u, qz = bz - dz * u;
          if (qx * qx + qz * qz < b.r * b.r) return false;
        }
      }
    }
    return true;
  }

  // canopy shade (0 = open sky, 1 = deep under the giants) and the splat codes, one per grid vertex
  const SHADE = new Uint8Array(GX * GZ), SURF_CODE = new Uint8Array(GX * GZ);
  const SURF = ["leaves", "dirt", "mud", "grass", "rock", "dirt"];
  for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
    const x = X0 + i * PITCH, z = Z0 + j * PITCH;
    let s = 0;
    for (let k = 0; k < giants.length; k++) {
      const g = giants[k], cr = 10.5 * g.s, d2 = sq(x - g.x) + sq(z - g.z);
      if (d2 < cr * cr) { const v = 1 - sstep(cr * 0.5, cr, Math.sqrt(d2)); if (v > s) s = v; }
    }
    if (s < 0.5) for (let k = 0; k < mids.length; k++) { const m = mids[k], d2 = sq(x - m.x) + sq(z - m.z); if (d2 < 7) { const v = 0.5 * (1 - d2 / 7); if (v > s) s = v; } }
    SHADE[j * GX + i] = Math.round(s * 255);
    // splat
    const o = j * GX + i, h = H[o];
    const sl = Math.max(Math.abs(H[Math.min(o + 1, GX * GZ - 1)] - h), Math.abs(H[Math.min(o + GX, GX * GZ - 1)] - h)) / PITCH;
    const wl = waterLevel(x, z);
    let code = 0;
    const dCamp = Math.hypot(x - CAMP.x, z - CAMP.z), dField = Math.hypot(x - FIELD.x, z - FIELD.z);
    if (cliffK(x, z) > 0.15 || sl > 1.15 || Math.hypot(x - ARENA.x, z - ARENA.z) < 11.6) code = 4;
    else if (Math.hypot(x + 42, z - 22) < 6.2) code = 5;
    else if ((wl !== -Infinity && h < wl + 0.22) || (x > -52 && Math.abs(z) < 14 && riverDist(x, z) < riverHalf(x) + 1.5)) code = 2;
    else if (pathDist(x, z) < 1.0 || Math.hypot(x - RIVAL.x, z - RIVAL.z) < 10.8 || segDist(x, z, 0, -51.5, 0, -42) < 1.6 || (dCamp < 12.6 && Math.sin(x * 1.3) * Math.cos(z * 1.1) < 0.35)) code = 1;
    else if (dField < 17 || dCamp < 15 || Math.hypot(x - 3, z + 24) < 6.5 || Math.hypot(x + 61, z + 34) < 9 || Math.hypot(x - 4, z - 50) < 3.6 || Math.hypot(x, z + 40) < 7) code = 3;
    SURF_CODE[o] = code;
  }
  function cellOf(x, z) {
    let i = Math.round((x - X0) / PITCH), j = Math.round((z - Z0) / PITCH);
    i = i < 0 ? 0 : i > GX - 1 ? GX - 1 : i; j = j < 0 ? 0 : j > GZ - 1 ? GZ - 1 : j;
    return j * GX + i;
  }
  function shadeAt(x, z) { return SHADE[cellOf(x, z)] / 255; }
  function inLog(x, z) {
    const rx = x - LOG.x, rz = z - LOG.z, t = rx * LOG.dx + rz * LOG.dz;
    if (t < -LOG.len / 2 || t > LOG.len / 2) return false;
    return Math.abs(rx * LOG.dz - rz * LOG.dx) < LOG.r - 0.05;
  }
  function surfaceAt(x, z) {
    const w = waterLevel(x, z), h = heightAt(x, z);
    if (x > 28 && x < 36 && z > -0.5 && z < 4.6 && h >= BR.y - 0.2 && segDist(x, z, BR.ax, BR.az, BR.bx, BR.bz) < BR.r) return "wood";
    if (w !== -Infinity) { if (h < w - 0.04) return "water"; if (h < w + 0.3 && x > 12.5 && x < 15.5) return "rock"; }
    if (x > -17 && x < -7 && z > 29 && z < 39 && inLog(x, z)) return "wood";
    return SURF[SURF_CODE[cellOf(x, z)]];
  }

  // ------------------------------------------------------------------------------------------------
  // Textures (all painted once, here)
  // ------------------------------------------------------------------------------------------------
  function mkCanvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; }
  function mkTex(canvas, o) {
    o = o || {};
    const t = new THREE.CanvasTexture(canvas);
    if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
    if (o.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = Math.max(1, Math.min(o.aniso || 4, maxAniso));
    return t;
  }
  const TR = mulberry(0x51ab77);
  const tr = (a, b) => a + (b - a) * TR();
  const hsl = (h, s, l, a) => "hsla(" + h.toFixed(0) + "," + s.toFixed(0) + "%," + l.toFixed(0) + "%," + (a === undefined ? 1 : a.toFixed(2)) + ")";
  function leafShape(g, x, y, len, wid, ang, c0, c1, rib) {
    g.save(); g.translate(x, y); g.rotate(ang);
    const gr = g.createLinearGradient(0, 0, len, 0);
    gr.addColorStop(0, c0); gr.addColorStop(1, c1);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.42, -wid, len, 0); g.quadraticCurveTo(len * 0.42, wid, 0, 0); g.fill();
    if (rib !== false) { g.strokeStyle = "rgba(214,236,150,0.32)"; g.lineWidth = Math.max(1, wid * 0.09); g.beginPath(); g.moveTo(0, 0); g.lineTo(len * 0.93, 0); g.stroke(); }
    g.restore();
  }
  function frond(g, x, y, ang, len, bend, ll, n, hue, lum, slim) {
    let px = x, py = y, a = ang;
    const st = len / n;
    g.lineCap = "round";
    for (let i = 0; i < n; i++) {
      const t = i / n;
      a += bend / n;
      const nx = px + Math.cos(a) * st, ny = py + Math.sin(a) * st;
      g.strokeStyle = hsl(hue - 22, 34, lum - 6); g.lineWidth = 3.4 * (1 - t) + 1;
      g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
      const L = ll * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * t)), 0.75) * (1 - t * 0.25);
      const c0 = hsl(hue + tr(-8, 8), 52, lum + tr(-4, 3)), c1 = hsl(hue + tr(-6, 10), 56, lum + tr(4, 12));
      leafShape(g, nx, ny, L, L * (slim || 0.2), a - 1.02 + t * 0.3, c0, c1, false);
      leafShape(g, nx, ny, L, L * (slim || 0.2), a + 1.02 - t * 0.3, c0, c1, false);
      px = nx; py = ny;
    }
  }
  const UPA = -Math.PI / 2;
  const TILE_PAINT = [
    function fern(g) { for (let i = 0; i < 11; i++) { const k = i - 5; frond(g, 128 + k * 3, 252, UPA + k * 0.25 + tr(-0.07, 0.07), tr(150, 222) * (1 - Math.abs(k) * 0.05), k * 0.1, tr(25, 35), 17, tr(96, 116), tr(24, 31)); } },
    function broad(g) {
      for (let i = 0; i < 7; i++) {
        const k = i - 3, a = UPA + k * 0.33 + tr(-0.08, 0.08), sl = tr(30, 70), L = tr(150, 196) - Math.abs(k) * 12;
        const bx = 128 + k * 4, by = 252, sx = bx + Math.cos(a) * sl, sy = by + Math.sin(a) * sl;
        g.strokeStyle = hsl(96, 40, 26); g.lineWidth = 5; g.beginPath(); g.moveTo(bx, by); g.lineTo(sx, sy); g.stroke();
        leafShape(g, sx, sy, L, tr(34, 48), a + k * 0.05, hsl(tr(108, 124), 56, tr(20, 27)), hsl(tr(100, 116), 58, tr(31, 40)));
      }
    },
    function flowers(g) {
      for (let i = 0; i < 6; i++) { g.strokeStyle = hsl(90, 35, 22); g.lineWidth = 4; g.beginPath(); g.moveTo(128, 252); g.quadraticCurveTo(128 + tr(-30, 30), 200, 128 + tr(-70, 70), 150); g.stroke(); }
      for (let i = 0; i < 80; i++) { const a = tr(0, TAU), r = Math.sqrt(TR()) * 98, x = 128 + Math.cos(a) * r, y = 150 + Math.sin(a) * r * 0.86; leafShape(g, x, y, tr(26, 40), tr(8, 13), tr(0, TAU), hsl(tr(100, 125), 50, tr(16, 26) + (150 - y) * 0.05), hsl(tr(95, 115), 55, tr(28, 38))); }
      const hues = [338, 12, 48, 300, 352];
      for (let i = 0; i < 10; i++) {
        const a = tr(0, TAU), r = tr(20, 92), x = 128 + Math.cos(a) * r, y = 138 + Math.sin(a) * r * 0.8, hue = hues[i % hues.length], pr = tr(6, 9);
        for (let k = 0; k < 5; k++) { g.fillStyle = hsl(hue + tr(-8, 8), 84, tr(56, 68)); g.beginPath(); g.arc(x + Math.cos(k * 1.257) * pr, y + Math.sin(k * 1.257) * pr, pr * 0.92, 0, TAU); g.fill(); }
        g.fillStyle = hsl(50, 95, 62); g.beginPath(); g.arc(x, y, pr * 0.55, 0, TAU); g.fill();
      }
    },
    function tallGrass(g) {
      g.lineCap = "round";
      for (let i = 0; i < 48; i++) {
        const x0 = 128 + tr(-74, 74), hgt = tr(150, 240), lean = tr(-42, 42);
        g.strokeStyle = hsl(tr(66, 96), tr(42, 58), tr(26, 44)); g.lineWidth = tr(3.2, 6);
        g.beginPath(); g.moveTo(x0, 253); g.quadraticCurveTo(x0 + lean * 0.2, 253 - hgt * 0.6, x0 + lean, 253 - hgt); g.stroke();
        if (i % 6 === 0) { g.fillStyle = hsl(44, 50, 58); g.beginPath(); g.ellipse(x0 + lean, 253 - hgt, 3.4, 11, lean * 0.01, 0, TAU); g.fill(); }
      }
    },
    function shortGrass(g) {
      g.lineCap = "round";
      for (let i = 0; i < 44; i++) {
        const x0 = 128 + tr(-92, 92), hgt = tr(60, 150), lean = tr(-36, 36);
        g.strokeStyle = hsl(tr(74, 104), tr(44, 60), tr(26, 42)); g.lineWidth = tr(4, 7.5);
        g.beginPath(); g.moveTo(x0, 253); g.quadraticCurveTo(x0 + lean * 0.2, 253 - hgt * 0.6, x0 + lean, 253 - hgt); g.stroke();
      }
    },
    function bush(g) {
      for (let i = 0; i < 130; i++) {
        const t = i / 130, a = tr(0, TAU), r = Math.sqrt(TR()) * 104, x = 128 + Math.cos(a) * r, y = Math.min(246, 150 + Math.sin(a) * r * 0.92);
        leafShape(g, x, y, tr(24, 38), tr(9, 14), tr(0, TAU), hsl(tr(98, 128), 48, 14 + t * 12 + (150 - y) * 0.04), hsl(tr(92, 118), 54, 24 + t * 14));
      }
    },
    function taro(g) {
      for (let i = 0; i < 6; i++) {
        const k = i - 2.5, a = UPA + k * 0.36, sl = tr(90, 150), sx = 128 + Math.cos(a) * sl, sy = 252 + Math.sin(a) * sl;
        g.strokeStyle = hsl(100, 36, 30); g.lineWidth = 4.5; g.beginPath(); g.moveTo(128 + k * 3, 252); g.quadraticCurveTo(128 + k * 14, 200, sx, sy); g.stroke();
        const L = tr(84, 108);
        leafShape(g, sx - Math.cos(a + k * 0.3) * L * 0.25, sy - Math.sin(a + k * 0.3) * L * 0.25, L, L * 0.44, a + k * 0.3, hsl(tr(112, 126), 52, tr(21, 28)), hsl(tr(104, 118), 56, tr(32, 40)));
      }
    },
    function vine(g) {
      for (let s = 0; s < 3; s++) {
        const x0 = 70 + s * 58 + tr(-10, 10), ph = tr(0, 6);
        g.strokeStyle = hsl(70, 30, 24); g.lineWidth = 4; g.lineCap = "round"; g.beginPath();
        for (let y = 254; y >= 4; y -= 6) { const x = x0 + Math.sin(y * 0.045 + ph) * 13; if (y === 254) g.moveTo(x, y); else g.lineTo(x, y); }
        g.stroke();
        for (let y = 246, k = 0; y >= 10; y -= 14, k++) { const x = x0 + Math.sin(y * 0.045 + ph) * 13, side = k % 2 ? 1 : -1; leafShape(g, x, y, tr(20, 30), tr(7, 10), side > 0 ? tr(0.2, 0.9) : Math.PI - tr(0.2, 0.9), hsl(tr(96, 120), 50, tr(22, 30)), hsl(tr(92, 112), 56, tr(32, 40))); }
      }
    },
    function palm(g) {
      g.fillStyle = "#6e5a44"; g.fillRect(4, 4, 30, 248);
      for (let y = 6; y < 252; y += 9) { g.fillStyle = hsl(28, 24, tr(20, 30)); g.fillRect(4, y, 30, tr(2, 3.5)); }
      g.strokeStyle = hsl(84, 40, 30); g.lineWidth = 5; g.beginPath(); g.moveTo(146, 252); g.lineTo(146, 10); g.stroke();
      for (let y = 246; y > 12; y -= 6.5) {
        const t = (252 - y) / 242, L = 98 * Math.pow(Math.sin(Math.PI * (0.07 + 0.93 * t)), 0.6), a = 1.2 - t * 0.55;
        const c0 = hsl(tr(96, 112), 52, tr(22, 28)), c1 = hsl(tr(88, 104), 56, tr(31, 39));
        leafShape(g, 146, y, L, 5.5, UPA + a, c0, c1, false); leafShape(g, 146, y, L, 5.5, UPA - a, c0, c1, false);
      }
    },
    function treeFern(g) {
      g.fillStyle = "#3a2c22"; g.fillRect(4, 4, 30, 248);
      for (let i = 0; i < 60; i++) { g.fillStyle = hsl(24, 30, tr(10, 24)); g.fillRect(tr(4, 30), tr(4, 248), 2, tr(5, 14)); }
      g.strokeStyle = hsl(60, 34, 24); g.lineWidth = 4; g.beginPath(); g.moveTo(146, 252); g.lineTo(146, 10); g.stroke();
      for (let y = 247; y > 12; y -= 9) {
        const t = (252 - y) / 242, L = 94 * Math.pow(Math.sin(Math.PI * (0.06 + 0.94 * t)), 0.7), a = 1.3 - t * 0.5;
        for (let s = -1; s <= 1; s += 2) frond(g, 146, y, UPA + s * a, L, s * 0.25, 9, 9, tr(108, 124), tr(22, 29), 0.26);
      }
    },
    function clump(g) {
      for (let i = 0; i < 190; i++) {
        const t = i / 190, a = tr(0, TAU), r = Math.sqrt(TR()) * 114, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.94;
        leafShape(g, x, y, tr(28, 44), tr(10, 15), tr(0, TAU), hsl(tr(100, 130), 46, 12 + t * 12 + (128 - y) * 0.05), hsl(tr(94, 120), 52, 22 + t * 15 + (128 - y) * 0.05));
      }
    },
    function ceiling(g) {
      for (let c = 0; c < 15; c++) {
        const cx = tr(30, 226), cy = tr(30, 226);
        for (let i = 0; i < 20; i++) { const a = tr(0, TAU), r = Math.sqrt(TR()) * 46; leafShape(g, clamp(cx + Math.cos(a) * r, 24, 232), clamp(cy + Math.sin(a) * r, 24, 232), tr(22, 34), tr(8, 12), tr(0, TAU), hsl(tr(100, 128), 44, tr(10, 19)), hsl(tr(96, 120), 50, tr(18, 30))); }
      }
    },
    function thornBush(g) {
      g.lineCap = "round";
      for (let i = 0; i < 28; i++) {
        const x0 = 128 + tr(-80, 80), x1 = x0 + tr(-70, 70), y1 = tr(40, 170), mx = (x0 + x1) / 2 + tr(-40, 40), my = tr(120, 220);
        g.strokeStyle = hsl(tr(22, 34), tr(16, 26), tr(20, 34)); g.lineWidth = tr(3, 6.5);
        g.beginPath(); g.moveTo(x0, 253); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
        g.lineWidth = 2;
        for (let k = 1; k < 8; k++) { const t = k / 8, u = 1 - t, px = u * u * x0 + 2 * u * t * mx + t * t * x1, py = u * u * 253 + 2 * u * t * my + t * t * y1, a = tr(0, TAU); g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * 9, py + Math.sin(a) * 9); g.stroke(); }
      }
      for (let i = 0; i < 22; i++) leafShape(g, 128 + tr(-90, 90), tr(60, 230), tr(12, 18), tr(4, 6), tr(0, TAU), hsl(tr(70, 90), 30, tr(20, 28)), hsl(tr(66, 86), 34, tr(28, 36)), false);
    },
    function lily(g) {
      const gr = g.createRadialGradient(128, 128, 8, 128, 128, 114);
      gr.addColorStop(0, hsl(104, 50, 40)); gr.addColorStop(0.8, hsl(112, 48, 29)); gr.addColorStop(1, hsl(118, 46, 22));
      g.fillStyle = gr; g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 114, 0.22, TAU - 0.22); g.closePath(); g.fill();
      g.strokeStyle = "rgba(200,232,150,0.3)"; g.lineWidth = 2;
      for (let k = 0; k < 13; k++) { const a = 0.4 + k * (TAU - 0.8) / 12; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 106, 128 + Math.sin(a) * 106); g.stroke(); }
    },
    function ginger(g) {
      for (let i = 0; i < 15; i++) { const k = i - 7; leafShape(g, 128 + k * 2, 252, tr(120, 176), tr(15, 22), UPA + k * 0.17 + tr(-0.05, 0.05), hsl(tr(104, 122), 52, tr(18, 26)), hsl(tr(98, 114), 56, tr(30, 38))); }
      for (let i = 0; i < 4; i++) {
        const x = 78 + i * 34 + tr(-8, 8), top = tr(44, 96);
        g.strokeStyle = hsl(96, 40, 28); g.lineWidth = 4; g.beginPath(); g.moveTo(128, 252); g.quadraticCurveTo(x, 190, x, top + 50); g.stroke();
        for (let k = 0; k < 9; k++) { const y = top + 50 - k * 6; leafShape(g, x, y, 15 - k, 6, UPA - 0.75, hsl(tr(352, 364), 84, tr(40, 52)), hsl(8, 90, 58), false); leafShape(g, x, y, 15 - k, 6, UPA + 0.75, hsl(tr(352, 364), 84, tr(40, 52)), hsl(8, 90, 58), false); }
      }
    },
    function reeds(g) {
      g.lineCap = "round";
      for (let i = 0; i < 26; i++) {
        const x0 = 128 + tr(-80, 80), hgt = tr(165, 244), lean = tr(-16, 16);
        g.strokeStyle = hsl(tr(64, 84), tr(30, 42), tr(30, 44)); g.lineWidth = tr(2.6, 4);
        g.beginPath(); g.moveTo(x0, 253); g.quadraticCurveTo(x0, 253 - hgt * 0.5, x0 + lean, 253 - hgt); g.stroke();
        if (i % 3 === 0) { g.strokeStyle = "#4a2f1c"; g.lineWidth = 8; g.beginPath(); g.moveTo(x0 + lean * 0.8, 253 - hgt + 34); g.lineTo(x0 + lean * 0.95, 253 - hgt + 8); g.stroke(); }
      }
    },
  ];
  const atlasTex = (function () {
    const c = mkCanvas(1024, 1024), g = c.getContext("2d");
    for (let t = 0; t < 16; t++) {
      g.save();
      g.beginPath(); g.rect((t % 4) * 256 + 3, (t >> 2) * 256 + 3, 250, 250); g.clip();
      g.translate((t % 4) * 256, (t >> 2) * 256);
      TILE_PAINT[t](g);
      g.restore();
    }
    return mkTex(c, { aniso: 2 });
  })();
  const TILE = { fern: 0, broad: 1, flowers: 2, tallGrass: 3, shortGrass: 4, bush: 5, taro: 6, vine: 7, palm: 8, treeFern: 9, clump: 10, ceiling: 11, thorn: 12, lily: 13, ginger: 14, reeds: 15 };
  const tileU = (t) => (t % 4) * 0.25, tileV = (t) => 0.75 - (t >> 2) * 0.25;

  const barkTex = (function () {
    const c = mkCanvas(128, 256), g = c.getContext("2d");
    g.fillStyle = "#93806b"; g.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 260; i++) {
      const x = tr(0, 128), y = tr(0, 256), L = tr(30, 150);
      g.strokeStyle = hsl(tr(22, 38), tr(12, 30), tr(26, 64), tr(0.25, 0.7)); g.lineWidth = tr(1, 4.2);
      for (let w = 0; w < 2; w++) { const yy = y - w * 256; g.beginPath(); g.moveTo(x, yy); g.bezierCurveTo(x + tr(-4, 4), yy + L * 0.3, x + tr(-4, 4), yy + L * 0.7, x + tr(-3, 3), yy + L); g.stroke(); }
    }
    for (let i = 0; i < 30; i++) { g.fillStyle = hsl(tr(80, 130), 22, tr(50, 66), 0.22); g.beginPath(); g.ellipse(tr(0, 128), tr(0, 256), tr(3, 9), tr(3, 8), 0, 0, TAU); g.fill(); }
    return mkTex(c, { repeat: true });
  })();
  const groundTex = (function () {
    const c = mkCanvas(256, 256), g = c.getContext("2d");
    g.fillStyle = "rgb(204,198,186)"; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1300; i++) {
      const x = tr(0, 256), y = tr(0, 256), rx = tr(2.5, 7), ry = tr(1.2, 3), a = tr(0, Math.PI);
      g.fillStyle = hsl(tr(22, 74), tr(12, 34), tr(54, 94), tr(0.45, 0.9));
      for (let w = 0; w < 4; w++) { g.beginPath(); g.ellipse(x - (w & 1) * 256, y - (w >> 1) * 256, rx, ry, a, 0, TAU); g.fill(); }
    }
    for (let i = 0; i < 70; i++) { const x = tr(0, 256), y = tr(0, 256), a = tr(0, TAU), L = tr(6, 18); g.strokeStyle = hsl(26, 22, tr(36, 52), 0.7); g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L); g.stroke(); }
    return mkTex(c, { repeat: true });
  })();
  const dappleTex = (function () {
    const c = mkCanvas(256, 256), g = c.getContext("2d");
    g.fillStyle = "#000"; g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = "lighter";
    for (let i = 0; i < 90; i++) {
      const x = tr(0, 256), y = tr(0, 256), r = tr(8, 30);
      for (let w = 0; w < 4; w++) {
        const xx = x - (w & 1) * 256, yy = y - (w >> 1) * 256, gr = g.createRadialGradient(xx, yy, 0, xx, yy, r);
        gr.addColorStop(0, "rgba(255,255,255,0.6)"); gr.addColorStop(0.5, "rgba(255,255,255,0.3)"); gr.addColorStop(1, "rgba(255,255,255,0)");
        g.fillStyle = gr; g.beginPath(); g.arc(xx, yy, r, 0, TAU); g.fill();
      }
    }
    return mkTex(c, { repeat: true, srgb: false });
  })();
  const ropeTex = (function () {
    const c = mkCanvas(32, 128), g = c.getContext("2d");
    g.lineCap = "round";
    g.strokeStyle = "#54432f"; g.lineWidth = 8; g.beginPath();
    for (let y = -4; y <= 132; y += 4) { const x = 16 + Math.sin(y * TAU / 64) * 3; if (y === -4) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    g.strokeStyle = "rgba(150,140,96,0.5)"; g.lineWidth = 2; g.beginPath();
    for (let y = -4; y <= 132; y += 4) { const x = 14.5 + Math.sin(y * TAU / 64) * 3; if (y === -4) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
    for (let y = 10; y < 128; y += 21) leafShape(g, 16 + Math.sin(y * TAU / 64) * 3, y, 13, 5, (y % 2 ? 0.5 : Math.PI - 0.5), hsl(108, 48, 24), hsl(100, 54, 34), false);
    return mkTex(c, { repeat: true });
  })();
  const flagTex = (function () {
    const c = mkCanvas(512, 512), g = c.getContext("2d");
    g.fillStyle = "#33342e"; g.fillRect(0, 0, 512, 512);
    for (let j = 0; j < 10; j++) for (let i = 0; i < 10; i++) {
      const cx = 26 + i * 51 + tr(-9, 9) + (j % 2) * 20, cy = 26 + j * 51 + tr(-9, 9), n = 6 + ((i + j) % 3);
      g.fillStyle = hsl(tr(50, 96), tr(3, 10), tr(34, 54));
      g.beginPath();
      for (let k = 0; k < n; k++) { const a = k / n * TAU + tr(-0.2, 0.2), r = tr(22, 30); if (k === 0) g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); else g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.fill();
    }
    for (let i = 0; i < 34; i++) { let x = tr(30, 480), y = tr(30, 480), a = tr(0, TAU); g.strokeStyle = "rgba(24,24,20,0.8)"; g.lineWidth = tr(1, 2.4); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { a += tr(-0.7, 0.7); x += Math.cos(a) * tr(8, 22); y += Math.sin(a) * tr(8, 22); g.lineTo(x, y); } g.stroke(); }
    for (let i = 0; i < 90; i++) { const a = tr(0, TAU), r = 256 * Math.pow(TR(), 0.45); g.fillStyle = hsl(tr(86, 112), 36, tr(20, 32), tr(0.2, 0.5)); g.beginPath(); g.ellipse(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, tr(6, 22), tr(5, 16), tr(0, 3), 0, TAU); g.fill(); }
    g.globalCompositeOperation = "destination-in";
    g.beginPath();
    for (let k = 0; k <= 90; k++) { const a = k / 90 * TAU, r = 234 + 11 * Math.sin(a * 7) + 6 * Math.sin(a * 17 + 1); if (k === 0) g.moveTo(256 + Math.cos(a) * r, 256 + Math.sin(a) * r); else g.lineTo(256 + Math.cos(a) * r, 256 + Math.sin(a) * r); }
    g.closePath(); g.fillStyle = "#fff"; g.fill();
    return mkTex(c, {});
  })();

  // ------------------------------------------------------------------------------------------------
  // Materials
  // ------------------------------------------------------------------------------------------------
  const fxShock = ctx.fx && ctx.fx.shock && ctx.fx.shock.uniform ? ctx.fx.shock.uniform : { value: new THREE.Vector4(0, 0, 0, 0) };
  const U = {
    jTime: { value: 0 }, jShock: fxShock, jWind: { value: new THREE.Vector3(0.8, 0.6, 1) },
    jDapple: { value: dappleTex }, jDapK: { value: 1 }, jLight: { value: 1 },
    jSky: { value: new THREE.Color(0.7, 0.85, 0.9) }, jSunDir: { value: new THREE.Vector3(0.35, 0.85, -0.38).normalize() }, jSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
  };
  const f3 = (v) => v.toFixed(3);
  // wind + the scream's shock ring, applied in WORLD space after the instance matrix
  function windChunk(amp, bend) {
    return [
      "vec4 jw = vec4( transformed, 1.0 );",
      "#ifdef USE_INSTANCING",
      "  jw = instanceMatrix * jw;",
      "#endif",
      "jw = modelMatrix * jw;",
      "{",
      "  float jph = jw.x * 0.31 + jw.z * 0.27;",
      "  float jg = 0.5 + 0.5 * sin( jTime * 0.9 + jph * 0.35 );",
      "  float ja = aSway * jWind.z * " + f3(amp) + ";",
      "  jw.xz += jWind.xy * ja * ( 0.05 + 0.12 * jg ) * ( 0.6 + 0.4 * sin( jTime * 2.3 + jph * 1.7 ) );",
      "  jw.xz += vec2( sin( jTime * 1.3 + jph * 2.1 ), cos( jTime * 1.1 + jph * 1.3 ) ) * ja * 0.025;",
      "  vec2 jsd = jw.xz - jShock.xy;",
      "  float jsl = length( jsd ) + 0.0001;",
      "  float jfr = 1.0 - smoothstep( 0.0, 2.5, abs( jsl - jShock.z ) );",
      "  float jsb = jShock.w * aSway * max( jfr, step( jsl, jShock.z ) * 0.75 ) * " + f3(bend) + ";",
      "  jw.xz += jsd / jsl * jsb;",
      "  jw.y -= jsb * 0.55;",
      "}",
      "vec4 mvPosition = viewMatrix * jw;",
      "gl_Position = projectionMatrix * mvPosition;",
    ].join("\n");
  }
  function foliage(mat, key, amp, bend, tiled) {
    mat.customProgramCacheKey = () => "jungle-" + key;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.jTime = U.jTime; sh.uniforms.jShock = U.jShock; sh.uniforms.jWind = U.jWind;
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float jTime;\nuniform vec4 jShock;\nuniform vec3 jWind;\nattribute float aSway;\n" + (tiled ? "attribute vec2 aTile;\n" : ""))
        .replace("#include <uv_vertex>", "#include <uv_vertex>\n" + (tiled ? "#ifdef USE_MAP\n  vMapUv = vMapUv * 0.25 + aTile;\n#endif\n" : ""))
        .replace("#include <project_vertex>", windChunk(amp, bend));
      // cards are lit as if they faced the sky from both sides (no back-face flip)
      sh.fragmentShader = sh.fragmentShader.replace("#include <normal_fragment_begin>", "#include <normal_fragment_begin>\n  normal = normalize( vNormal );\n");
    };
    return mat;
  }
  const cardMat = foliage(new THREE.MeshLambertMaterial({ map: atlasTex, alphaTest: 0.42, side: THREE.DoubleSide }), "card", 1, 0.8, true);
  const midMat = foliage(new THREE.MeshLambertMaterial({ map: atlasTex, alphaTest: 0.42, side: THREE.DoubleSide }), "mid", 2.4, 1.4, true);
  const canopyMat = foliage(new THREE.MeshLambertMaterial({ map: atlasTex, alphaTest: 0.4, side: THREE.DoubleSide, color: 0xb9c4b4 }), "canopy", 3.2, 2.2, true);
  const lianaMat = foliage(new THREE.MeshLambertMaterial({ map: ropeTex, alphaTest: 0.4, side: THREE.DoubleSide }), "liana", 1.8, 1.2, false);
  const barkMat = new THREE.MeshLambertMaterial({ map: barkTex, vertexColors: true });
  const barkMatDS = new THREE.MeshLambertMaterial({ map: barkTex, vertexColors: true, side: THREE.DoubleSide });
  const rockMat = new THREE.MeshLambertMaterial({ map: groundTex, vertexColors: true });
  const propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const propMatDS = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const floorMat = new THREE.MeshLambertMaterial({ map: flagTex, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const terrainMat = new THREE.MeshLambertMaterial({ map: groundTex, vertexColors: true });
  terrainMat.customProgramCacheKey = () => "jungle-ground";
  terrainMat.onBeforeCompile = (sh) => {
    sh.uniforms.jTime = U.jTime; sh.uniforms.jDapple = U.jDapple; sh.uniforms.jDapK = U.jDapK;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aShade;\nvarying float vJShade;\nvarying vec2 vJW;\n")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\n  vJShade = aShade;\n  vJW = position.xz;\n");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform sampler2D jDapple;\nuniform float jDapK;\nuniform float jTime;\nvarying float vJShade;\nvarying vec2 vJW;\n")
      .replace("#include <color_fragment>", [
        "#include <color_fragment>",
        "{",
        "  vec2 jdu = vJW * 0.085 + vec2( sin( jTime * 0.6 + vJW.y * 0.2 ), cos( jTime * 0.5 + vJW.x * 0.2 ) ) * 0.006;",
        "  float jd = texture2D( jDapple, jdu ).r;",
        "  float jd2 = texture2D( jDapple, vJW * 0.031 + 0.37 ).r;",
        "  diffuseColor.rgb *= mix( 1.0, 0.44 + 1.25 * jd + 0.3 * jd2, vJShade * jDapK );",
        "}",
      ].join("\n"));
  };

  const GLSL_NOISE = [
    "float jh21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }",
    "float jvn( vec2 p ) { vec2 i = floor( p ), f = fract( p ); f = f * f * ( 3.0 - 2.0 * f );",
    "  return mix( mix( jh21( i ), jh21( i + vec2( 1.0, 0.0 ) ), f.x ), mix( jh21( i + vec2( 0.0, 1.0 ) ), jh21( i + vec2( 1.0, 1.0 ) ), f.x ), f.y ); }",
  ].join("\n");
  const fogU = () => ({ fogColor: { value: new THREE.Color(1, 1, 1) }, fogNear: { value: 1 }, fogFar: { value: 100 }, fogDensity: { value: 0.01 } });
  const waterMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(fogU(), {
      jTime: U.jTime, jLight: U.jLight, jSky: U.jSky, jSunDir: U.jSunDir, jSunCol: U.jSunCol,
      uDeep: { value: new THREE.Color(0x0e3a35) }, uShallow: { value: new THREE.Color(0x4f8f7a) },
    }),
    vertexShader: [
      "attribute vec3 aData;", "attribute vec2 aFlow;",
      "uniform float jTime;",
      "varying vec3 vW;", "varying vec3 vData;", "varying vec2 vFlow;",
      "#include <fog_pars_vertex>",
      "void main() {",
      "  vec3 p = position;",
      "  p.y += sin( jTime * 1.6 + p.x * 0.9 + p.z * 1.3 ) * 0.012 * min( aData.x * 3.0, 1.0 );",
      "  vW = p; vData = aData; vFlow = aFlow;",
      "  vec4 mvPosition = modelViewMatrix * vec4( p, 1.0 );",
      "  gl_Position = projectionMatrix * mvPosition;",
      "  #include <fog_vertex>",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform float jTime;", "uniform float jLight;", "uniform vec3 jSky;", "uniform vec3 jSunDir;", "uniform vec3 jSunCol;", "uniform vec3 uDeep;", "uniform vec3 uShallow;",
      "varying vec3 vW;", "varying vec3 vData;", "varying vec2 vFlow;",
      "#include <common>",
      "#include <fog_pars_fragment>",
      GLSL_NOISE,
      "void main() {",
      "  float depth = max( vData.x, 0.0 );",
      "  vec2 fl = vFlow * jTime;",
      "  float n1 = jvn( vW.xz * 1.7 - fl * 0.9 );",
      "  float n2 = jvn( vW.xz * 3.9 - fl * 1.5 + 7.3 );",
      "  float n3 = jvn( vW.zx * 2.6 - fl.yx * 1.1 + 3.1 );",
      "  vec3 N = normalize( vec3( ( n1 - 0.5 ) * 0.5 + ( n2 - 0.5 ) * 0.28, 1.0, ( n3 - 0.5 ) * 0.5 + ( n2 - 0.5 ) * 0.2 ) );",
      "  vec3 V = normalize( cameraPosition - vW );",
      "  float fres = 0.05 + 0.9 * pow( 1.0 - max( dot( N, V ), 0.0 ), 3.0 );",
      "  vec3 base = mix( uShallow, uDeep, smoothstep( 0.0, 1.2, depth ) ) * jLight;",
      "  vec3 col = mix( base, jSky, fres );",
      "  float spec = pow( max( dot( reflect( -jSunDir, N ), V ), 0.0 ), 120.0 );",
      "  col += jSunCol * spec * 0.9;",
      "  float foamN = jvn( vW.xz * 4.5 - fl * 2.4 ) * 0.6 + n2 * 0.4;",
      "  float foam = smoothstep( 0.5, 0.86, vData.y * 0.75 + foamN * ( 0.25 + vData.y ) * 0.62 );",
      "  foam = max( foam, ( 1.0 - smoothstep( 0.02, 0.12, depth ) ) * smoothstep( 0.45, 0.8, foamN ) * 0.6 );",
      "  col = mix( col, vec3( 0.93, 0.97, 0.95 ) * ( 0.25 + 0.75 * jLight ), foam );",
      "  float a = clamp( 0.3 + depth * 0.85 + fres * 0.8 + foam, 0.0, 0.95 ) * smoothstep( -0.02, 0.07, vData.x );",
      "  gl_FragColor = vec4( col, a );",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "  #include <fog_fragment>",
      "}",
    ].join("\n"),
    transparent: true, depthWrite: false, fog: true,
  });
  const fallMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(fogU(), { jTime: U.jTime, jLight: U.jLight }),
    vertexShader: [
      "varying vec2 vUv2;",
      "#include <fog_pars_vertex>",
      "void main() {",
      "  vUv2 = uv;",
      "  vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );",
      "  gl_Position = projectionMatrix * mvPosition;",
      "  #include <fog_vertex>",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform float jTime;", "uniform float jLight;",
      "varying vec2 vUv2;",
      "#include <common>",
      "#include <fog_pars_fragment>",
      GLSL_NOISE,
      "void main() {",
      "  float n = jvn( vec2( vUv2.x * 9.0, vUv2.y * 2.6 - jTime * 1.9 ) );",
      "  float n2 = jvn( vec2( vUv2.x * 23.0 + 3.1, vUv2.y * 5.2 - jTime * 3.1 ) );",
      "  float w = clamp( 0.3 + 1.5 * n * n2 + 0.25 * vUv2.y, 0.0, 1.0 );",
      "  vec3 col = mix( vec3( 0.4, 0.62, 0.66 ), vec3( 0.95, 0.98, 1.0 ), w ) * ( 0.2 + 0.8 * jLight );",
      "  float edge = smoothstep( 0.0, 0.14, vUv2.x ) * smoothstep( 1.0, 0.86, vUv2.x );",
      "  gl_FragColor = vec4( col, ( 0.5 + 0.5 * w ) * edge );",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "  #include <fog_fragment>",
      "}",
    ].join("\n"),
    transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
  });
  const domeU = {
    jTime: U.jTime, uTop: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uTree: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() }, uSunDir: U.jSunDir, uStars: { value: 0 }, uLair: { value: 0 },
  };
  const domeMat = new THREE.ShaderMaterial({
    uniforms: domeU,
    vertexShader: "varying vec3 vDir;\nvoid main() {\n  vDir = position;\n  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );\n}",
    fragmentShader: [
      "uniform float jTime;", "uniform vec3 uTop;", "uniform vec3 uHor;", "uniform vec3 uTree;", "uniform vec3 uSunCol;", "uniform vec3 uSunDir;", "uniform float uStars;", "uniform float uLair;",
      "varying vec3 vDir;",
      "#include <common>",
      "float jh21( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }",
      "void main() {",
      "  vec3 d = normalize( vDir );",
      "  float h = d.y;",
      "  vec3 col = mix( uHor, uTop, smoothstep( 0.0, 0.55, h ) );",
      "  float sd = max( dot( d, uSunDir ), 0.0 );",
      "  col += uSunCol * ( pow( sd, 24.0 ) * 0.3 + pow( sd, 500.0 ) * 1.4 );",
      "  if ( uStars > 0.01 ) {",
      "    vec2 sp = d.xz / ( abs( d.y ) + 0.35 ) * 38.0;",
      "    vec2 ip = floor( sp );",
      "    float st = jh21( ip );",
      "    float dd = length( fract( sp ) - 0.5 - ( vec2( jh21( ip + 3.1 ), jh21( ip + 7.7 ) ) - 0.5 ) * 0.6 );",
      "    col += vec3( 0.9, 0.95, 1.0 ) * uStars * step( 0.93, st ) * smoothstep( 0.12, 0.0, dd ) * ( 0.6 + 0.4 * sin( jTime * 2.0 + st * 40.0 ) ) * smoothstep( 0.05, 0.3, h );",
      "  }",
      "  float az = atan( d.z, d.x );",
      "  float west = smoothstep( 0.2, 0.85, -d.x / ( length( d.xz ) + 0.0001 ) );",
      "  float mh = ( 0.1 + 0.07 * sin( az * 7.0 + 1.0 ) + 0.035 * sin( az * 19.0 ) + 0.02 * sin( az * 43.0 + 2.0 ) ) * west;",
      "  float mt = smoothstep( mh + 0.004, mh - 0.004, h ) * step( 0.001, west );",
      "  col = mix( col, mix( uHor, uTree, 0.4 ), mt * 0.9 );",
      "  vec3 gd = normalize( vec3( -1.0, 0.03, -0.12 ) );",
      "  float glow = max( dot( d, gd ), 0.0 );",
      "  col += vec3( 1.0, 0.22, 0.06 ) * uLair * ( pow( glow, 900.0 ) + pow( glow, 60.0 ) * 0.22 ) * ( 0.85 + 0.15 * sin( jTime * 1.7 ) );",
      "  float tl = 0.06 + 0.018 * sin( az * 23.0 + 1.0 ) + 0.012 * sin( az * 57.0 ) + 0.008 * sin( az * 131.0 + 2.0 ) + 0.006 * sin( az * 211.0 );",
      "  col = mix( col, mix( uTree, uHor, 0.5 ), smoothstep( tl + 0.006, tl - 0.006, h ) );",
      "  col = mix( col, uHor, smoothstep( 0.02, -0.05, h ) );",
      "  gl_FragColor = vec4( col, 1.0 );",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "}",
    ].join("\n"),
    depthWrite: false, depthTest: false, fog: false, side: THREE.BackSide,
  });
  const rainU = { jTime: U.jTime, uRain: { value: 0 } };
  const rainMat = new THREE.ShaderMaterial({
    uniforms: rainU,
    vertexShader: [
      "attribute float aEnd;", "uniform float jTime;", "uniform float uRain;", "varying float vA;",
      "void main() {",
      "  vec3 box = vec3( 26.0, 16.0, 26.0 );",
      "  vec3 q = vec3( position.x * box.x + jTime * 2.2, position.y * box.y - jTime * ( 17.0 + position.x * 5.0 ), position.z * box.z + jTime * 1.1 );",
      "  q = mod( q - cameraPosition + box * 0.5, box ) - box * 0.5 + cameraPosition;",
      "  q.y += 3.0;",
      "  q += vec3( 0.07, -0.65, 0.035 ) * aEnd * ( 0.7 + uRain );",
      "  vA = 1.0 - aEnd * 0.7;",
      "  gl_Position = projectionMatrix * viewMatrix * vec4( q, 1.0 );",
      "}",
    ].join("\n"),
    fragmentShader: "uniform float uRain;\nvarying float vA;\nvoid main() {\n  gl_FragColor = vec4( 0.75, 0.82, 0.9, 0.34 * uRain * vA );\n}",
    transparent: true, depthWrite: false, fog: false,
  });
  const flyMat = new THREE.ShaderMaterial({
    uniforms: Object.assign(fogU(), { jTime: U.jTime, jLight: U.jLight }),
    vertexShader: [
      "attribute vec4 aHome;", "attribute vec3 aCol;", "uniform float jTime;", "varying vec3 vCol;",
      "#include <fog_pars_vertex>",
      "void main() {",
      "  float ph = aHome.w, t = jTime;",
      "  vec3 c = aHome.xyz + vec3( sin( t * 0.5 + ph ) * 1.7 + sin( t * 1.3 + ph * 2.0 ) * 0.5, sin( t * 0.9 + ph * 3.0 ) * 0.4 + sin( t * 2.7 + ph ) * 0.08, cos( t * 0.43 + ph * 1.7 ) * 1.7 );",
      "  vec2 vel = vec2( cos( t * 0.5 + ph ) * 0.85 + cos( t * 1.3 + ph * 2.0 ) * 0.65, -sin( t * 0.43 + ph * 1.7 ) * 0.73 );",
      "  float hd = atan( vel.x, vel.y );",
      "  float f = sin( t * 17.0 + ph * 5.0 ) * 1.05 + 0.25;",
      "  vec3 lp = vec3( position.x * cos( f ), abs( position.x ) * sin( f ), position.z ) * 0.085;",
      "  float ch = cos( hd ), sh = sin( hd );",
      "  vec3 wp = c + vec3( lp.x * ch + lp.z * sh, lp.y, -lp.x * sh + lp.z * ch );",
      "  vCol = aCol * ( 0.7 + 0.3 * abs( position.x ) );",
      "  vec4 mvPosition = viewMatrix * vec4( wp, 1.0 );",
      "  gl_Position = projectionMatrix * mvPosition;",
      "  #include <fog_vertex>",
      "}",
    ].join("\n"),
    fragmentShader: [
      "uniform float jLight;", "varying vec3 vCol;",
      "#include <common>",
      "#include <fog_pars_fragment>",
      "void main() {",
      "  gl_FragColor = vec4( vCol * ( 0.3 + 0.7 * jLight ), 1.0 );",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "  #include <fog_fragment>",
      "}",
    ].join("\n"),
    side: THREE.DoubleSide, fog: true,
  });

  // ------------------------------------------------------------------------------------------------
  // Geometry builders (build time only)
  // ------------------------------------------------------------------------------------------------
  const _m4 = new THREE.Matrix4(), _m4b = new THREE.Matrix4(), _nm = new THREE.Matrix3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, "YXZ");
  const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _s = new THREE.Vector3(), _t = new THREE.Vector3(), _n1 = new THREE.Vector3(), _n2 = new THREE.Vector3(), _ref = new THREE.Vector3();
  const _c = new THREE.Color();
  const C = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mulc = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const WHITE = [1, 1, 1];
  const hash2 = (x, z) => { const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return v - Math.floor(v); };
  function MB() { return { p: [], n: [], u: [], c: [], s: [], i: [] }; }
  function V(m, x, y, z, nx, ny, nz, u, v, col, sway) {
    m.p.push(x, y, z); m.n.push(nx, ny, nz); m.u.push(u, v); m.c.push(col[0], col[1], col[2]); m.s.push(sway || 0);
    return m.p.length / 3 - 1;
  }
  // a triangle wound so that its face normal agrees with (rx, ry, rz)
  function triRef(P, I, a, b, c, rx, ry, rz) {
    const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
    const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
    const d = (uy * vz - uz * vy) * rx + (uz * vx - ux * vz) * ry + (ux * vy - uy * vx) * rz;
    if (d >= 0) I.push(a, b, c); else I.push(a, c, b);
  }
  function finish(m, recompute) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(m.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(m.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(m.u, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(m.c, 3));
    g.setAttribute("aSway", new THREE.Float32BufferAttribute(m.s, 1));
    g.setIndex(m.i);
    if (recompute) g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
  // a tube along pts [[x, y, z, r], ...]. o: { col | col(i, j, nx, ny, nz), uRep, vRep, uv(i, j), cap0, cap1, sway(i), ref: [x, y, z] }
  function tube(m, pts, sides, o) {
    o = o || {};
    const n = pts.length, base = m.p.length / 3, colF = typeof o.col === "function" ? o.col : null, col = colF ? null : o.col || WHITE;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, n - 1)], p = pts[i];
      _t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
      if (o.ref) _ref.set(o.ref[0], o.ref[1], o.ref[2]); else if (Math.abs(_t.y) < 0.9) _ref.set(0, 1, 0); else _ref.set(1, 0, 0);
      _n1.crossVectors(_t, _ref).normalize(); _n2.crossVectors(_t, _n1);
      for (let j = 0; j <= sides; j++) {
        const ang = j / sides * TAU, cs = Math.cos(ang), sn = Math.sin(ang);
        const nx = _n1.x * cs + _n2.x * sn, ny = _n1.y * cs + _n2.y * sn, nz = _n1.z * cs + _n2.z * sn;
        const uvv = o.uv ? o.uv(i, j) : null;
        V(m, p[0] + nx * p[3], p[1] + ny * p[3], p[2] + nz * p[3], nx, ny, nz, uvv ? uvv[0] : j / sides * (o.uRep || 1), uvv ? uvv[1] : i / (n - 1) * (o.vRep || 1),
          colF ? colF(i, j, nx, ny, nz) : col, o.sway ? o.sway(i) : 0);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < sides; j++) {
      const a = base + i * (sides + 1) + j, b = a + 1, c = a + sides + 2, d = a + sides + 1;
      m.i.push(a, b, c, a, c, d);
    }
    for (let e = 0; e < 2; e++) {
      if (!(e ? o.cap1 : o.cap0)) continue;
      const p = pts[e ? n - 1 : 0], q = pts[e ? n - 2 : 1], ring = base + (e ? n - 1 : 0) * (sides + 1);
      _t.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]).normalize();
      const cc = colF ? colF(e ? n - 1 : 0, 0, _t.x, _t.y, _t.z) : col;
      const ci = V(m, p[0], p[1], p[2], _t.x, _t.y, _t.z, 0.5, 0.5, o.capCol || mulc(cc, 0.8), 0);
      for (let j = 0; j < sides; j++) triRef(m.p, m.i, ci, ring + j, ring + j + 1, _t.x, _t.y, _t.z);
    }
  }
  // append a three.js geometry: mat = Matrix4 | null, col = [r, g, b] | fn(pos, normal) -> [r, g, b], o: { warp(v), sway }
  function append(m, g, mat, col, o) {
    const base = m.p.length / 3, pa = g.getAttribute("position"), na = g.getAttribute("normal"), ua = g.getAttribute("uv");
    if (mat) _nm.getNormalMatrix(mat);
    for (let k = 0; k < pa.count; k++) {
      _v.fromBufferAttribute(pa, k);
      _n.fromBufferAttribute(na, k);
      if (o && o.warp) o.warp(_v, _n);
      if (mat) { _v.applyMatrix4(mat); _n.applyMatrix3(_nm).normalize(); }
      V(m, _v.x, _v.y, _v.z, _n.x, _n.y, _n.z, ua ? ua.getX(k) : 0, ua ? ua.getY(k) : 0, typeof col === "function" ? col(_v, _n) : col, o && o.sway ? o.sway : 0);
    }
    const idx = g.index;
    if (idx) for (let k = 0; k < idx.count; k++) m.i.push(base + idx.getX(k)); else for (let k = 0; k < pa.count; k++) m.i.push(base + k);
    g.dispose();
  }
  function xf(x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx || 0, ry || 0, rz || 0);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(_e), new THREE.Vector3(sx === undefined ? 1 : sx, sy === undefined ? (sx === undefined ? 1 : sx) : sy, sz === undefined ? (sx === undefined ? 1 : sx) : sz));
  }
  function put(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e);
    _m4.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
    mesh.setMatrixAt(i, _m4);
  }
  function inst(geo, mat, n, name, parent) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(n, 1));
    m.count = n; m.name = name; m.castShadow = false; m.receiveShadow = false; m.matrixAutoUpdate = false;
    (parent || group).add(m);
    return m;
  }
  function staticMesh(geo, mat, name, parent, shadow) {
    const m = new THREE.Mesh(geo, mat);
    m.name = name; m.castShadow = !!shadow; m.receiveShadow = false; m.matrixAutoUpdate = false;
    (parent || group).add(m);
    return m;
  }
  // a geometry that shares base's vertex data and adds the per-instance atlas tile
  function tiledGeo(base, tiles) {
    const g = new THREE.BufferGeometry();
    for (const k in base.attributes) g.setAttribute(k, base.attributes[k]);
    g.setIndex(base.index);
    const arr = new Float32Array(Math.max(tiles.length, 1) * 2);
    for (let i = 0; i < tiles.length; i++) { arr[i * 2] = tileU(tiles[i]); arr[i * 2 + 1] = tileV(tiles[i]); }
    g.setAttribute("aTile", new THREE.InstancedBufferAttribute(arr, 2));
    g.boundingSphere = base.boundingSphere.clone();
    return g;
  }

  // ------------------------------------------------------------------------------------------------
  // The ground
  // ------------------------------------------------------------------------------------------------
  const PAL = {
    leaf0: C(0x4a3d22), leaf1: C(0x3a4020), leaf2: C(0x5d4b2b), dirt: C(0x70563a), mud: C(0x40331f), grass0: C(0x4d7a2b), grass1: C(0x6d9238),
    rock: C(0x6f716a), moss: C(0x45602e), sand: C(0xbba87c), bed: C(0x38402f), bark: C(0xb7a48d), barkDark: C(0x6f5f4e),
  };
  (function buildGround() {
    const m = MB(), shade = [];
    for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
      const x = X0 + i * PITCH, z = Z0 + j * PITCH, o = j * GX + i, h = H[o], code = SURF_CODE[o], n = hash2(i, j), n2 = hash2(i * 1.7 + 3, j * 1.3 + 9);
      let col;
      if (code === 0) col = mixc(mixc(PAL.leaf0, PAL.leaf1, n), PAL.leaf2, n2 * 0.5);
      else if (code === 1) col = mulc(PAL.dirt, 0.85 + 0.3 * n);
      else if (code === 2) col = mulc(PAL.mud, 0.85 + 0.35 * n);
      else if (code === 3) col = mixc(PAL.grass0, PAL.grass1, n);
      else if (code === 4) col = mixc(PAL.rock, PAL.moss, clamp(n * 1.3 - 0.45, 0, 1) * 0.75);
      else col = mulc(PAL.sand, 0.85 + 0.25 * n);
      const wl = waterLevel(x, z);
      if (wl !== -Infinity) { if (h < wl) col = mixc(col, PAL.bed, clamp((wl - h) * 1.6 + 0.3, 0, 1)); else if (h < wl + 0.25) col = mulc(col, 0.78); }
      V(m, x, h, z, 0, 1, 0, x * 0.21, z * 0.21, col, 0);
      shade.push(SHADE[o] / 255 * (code === 3 ? 0.8 : 1));
    }
    for (let j = 0; j < GZ - 1; j++) for (let i = 0; i < GX - 1; i++) {
      const a = j * GX + i, b = a + 1, c = a + GX + 1, d = a + GX;
      if ((i + j) & 1) { triRef(m.p, m.i, a, b, c, 0, 1, 0); triRef(m.p, m.i, a, c, d, 0, 1, 0); }
      else { triRef(m.p, m.i, a, b, d, 0, 1, 0); triRef(m.p, m.i, b, c, d, 0, 1, 0); }
    }
    // a skirt far out into the fog, so the world has no edge
    const edge = [];
    for (let i = 0; i < GX; i++) edge.push(i);
    for (let j = 1; j < GZ; j++) edge.push(j * GX + GX - 1);
    for (let i = GX - 2; i >= 0; i--) edge.push((GZ - 1) * GX + i);
    for (let j = GZ - 2; j >= 1; j--) edge.push(j * GX);
    const outer = [], skirtCol = mixc(PAL.leaf0, PAL.leaf1, 0.5);
    for (let k = 0; k < edge.length; k++) {
      const e = edge[k], i = e % GX, j = (e / GX) | 0;
      let dx = i === 0 ? -1 : i === GX - 1 ? 1 : 0, dz = j === 0 ? -1 : j === GZ - 1 ? 1 : 0;
      const l = Math.hypot(dx, dz) || 1;
      const x = X0 + i * PITCH + dx / l * 120, z = Z0 + j * PITCH + dz / l * 120;
      outer.push(V(m, x, 0.7, z, 0, 1, 0, x * 0.21, z * 0.21, skirtCol, 0));
      shade.push(1);
    }
    for (let k = 0; k < edge.length; k++) {
      const k2 = (k + 1) % edge.length;
      triRef(m.p, m.i, edge[k], edge[k2], outer[k2], 0, 1, 0); triRef(m.p, m.i, edge[k], outer[k2], outer[k], 0, 1, 0);
    }
    const g = finish(m, true);
    g.setAttribute("aShade", new THREE.Float32BufferAttribute(shade, 1));
    const mesh = staticMesh(g, terrainMat, "ground");
    mesh.receiveShadow = true;
  })();

  // ------------------------------------------------------------------------------------------------
  // Water: the river, the creek, the rivals' creek (one mesh), the waterfall
  // ------------------------------------------------------------------------------------------------
  function foamAt(x, z) {
    let f = 0;
    for (let i = 0; i < foamSrc.length; i++) { const s = foamSrc[i], v = 1 - Math.hypot(x - s.x, z - s.z) / s.r; if (v > f) f = v; }
    return f;
  }
  (function buildWater() {
    const P3 = [], D = [], F = [], I = [];
    const wv = (x, y, z, foam, fx, fz) => { P3.push(x, y, z); D.push(y - gridH(x, z), clamp(foam, 0, 1), 0); F.push(fx, fz); return P3.length / 3 - 1; };
    const strip = (rows) => {
      for (let r = 0; r + 1 < rows.length; r++) for (let k = 0; k + 1 < rows[r].length; k++) {
        const a = rows[r][k], b = rows[r][k + 1], c = rows[r + 1][k + 1], d = rows[r + 1][k];
        triRef(P3, I, a, b, c, 0, 1, 0); triRef(P3, I, a, c, d, 0, 1, 0);
      }
    };
    let rows = [];
    for (let x = -51.6; x <= 66.01; x += 1.6) {
      const s = -4.5 * RK * Math.cos((x - 14) * RK), k = Math.sqrt(1 + s * s), hw = (riverHalf(x) + 0.6) * k, row = [];
      const ford = 1 - sstep(2, 5, Math.abs(x + 10)), sp = 0.8 + 0.7 * ford;
      for (let c = -3; c <= 3; c++) {
        const z = riverZ(x) + c / 3 * hw;
        row.push(wv(x, 0, z, foamAt(x, z) + (x < -49 ? 0.8 : 0) + ford * 0.3 * hash2(x, z), sp / k, sp * s / k));
      }
      rows.push(row);
    }
    strip(rows);
    rows = [];
    for (let z = 0.8; z <= 97.01; z += 1.2) {
      const i = clamp(z, 0, 98) | 0, s = CT[i + 1] - CT[i], k = Math.sqrt(1 + s * s), hw = (creekHalf(z) + 0.4) * k, row = [];
      const riffle = z < 74 ? 0.45 * Math.pow(Math.max(0, Math.sin(z * 0.9)), 4) : z < 76.6 ? 0.6 : 0;
      for (let c = -2; c <= 2; c++) row.push(wv(creekX(z) + c / 2 * hw, creekY(z), z, riffle, -0.8 * s / k, -0.8 / k));
      rows.push(row);
    }
    strip(rows);
    rows = [];
    {
      const dx = RC.bx - RC.ax, dz = RC.bz - RC.az, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, hw = RC.half + 0.4;
      for (let k = 0; k <= 7; k++) {
        const t = -0.5 + k * (l + 1.4) / 7, row = [];
        for (let c = -1; c <= 1; c++) row.push(wv(RC.ax + ux * t - uz * c * hw, RC.y, RC.az + uz * t + ux * c * hw, 0, ux * 0.35, uz * 0.35));
        rows.push(row);
      }
    }
    strip(rows);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P3, 3));
    g.setAttribute("aData", new THREE.Float32BufferAttribute(D, 3));
    g.setAttribute("aFlow", new THREE.Float32BufferAttribute(F, 2));
    g.setIndex(I);
    g.computeBoundingSphere();
    const mesh = staticMesh(g, waterMat, "water");
    mesh.renderOrder = 2;
    // the fall: a short flat run on the plateau, then the drop
    const m = MB(), frows = [];
    const prof = [[-64, 8.05], [-58, 8.05], [-54, 8.05]];
    for (let k = 0; k <= 9; k++) { const t = k / 9; prof.push([-52.3 + 2.0 * t, 8.05 * (1 - t * t) + 0.02]); }
    for (let r = 0; r < prof.length; r++) {
      const hw = 2.1 + 0.5 * clamp((r - 3) / 9, 0, 1), row = [];
      for (let c = 0; c <= 4; c++) row.push(V(m, prof[r][0], prof[r][1], 4 + (c / 4 - 0.5) * 2 * hw, 0, 1, 0, c / 4, r / (prof.length - 1) * 3, WHITE, 0));
      frows.push(row);
    }
    for (let r = 0; r + 1 < frows.length; r++) for (let c = 0; c < 4; c++) m.i.push(frows[r][c], frows[r][c + 1], frows[r + 1][c + 1], frows[r][c], frows[r + 1][c + 1], frows[r + 1][c]);
    const fall = staticMesh(finish(m), fallMat, "waterfall");
    fall.renderOrder = 3;
  })();

  // ------------------------------------------------------------------------------------------------
  // Sky dome (follows the camera), rain (storm), butterflies (day)
  // ------------------------------------------------------------------------------------------------
  const dome = staticMesh(new THREE.SphereGeometry(80, 28, 14), domeMat, "sky");
  dome.matrixAutoUpdate = true; dome.frustumCulled = false; dome.renderOrder = -10;
  const rain = (function () {
    const N = 640, pos = new Float32Array(N * 6), end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) { const x = R(), y = R(), z = R(); pos.set([x, y, z, x, y, z], i * 6); end[i * 2 + 1] = 1; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aEnd", new THREE.BufferAttribute(end, 1));
    const l = new THREE.LineSegments(g, rainMat);
    l.name = "rain"; l.frustumCulled = false; l.visible = false; l.renderOrder = 5; l.matrixAutoUpdate = false;
    group.add(l);
    return l;
  })();
  const butterflies = (function () {
    const spots = [[2.8, -36.2], [4, -25], [1.6, -22.6], [8, -14], [-5, -8.6], [-11, 6.6], [-2, -5.4], [15, 6.4], [-20.6, 17], [-28, 40], [-31.5, 43.5], [4, 50.6], [-8, -22], [-14, -17],
      [0, -28], [18, 72], [24, 77], [13, 70], [27, 68.4], [-4, 40], [-13, 30], [8.6, 56], [36, 12], [-40, 20]];
    const N = spots.length, home = new Float32Array(N * 4), col = new Float32Array(N * 3);
    const cols = [C(0xff9a2e), C(0x3aa0ff), C(0xffe14a), C(0xf4f4ee), C(0xe04fb0), C(0x58d6c0)];
    for (let i = 0; i < N; i++) {
      home.set([spots[i][0], Math.max(gridH(spots[i][0], spots[i][1]), 0) + rr(0.7, 1.7), spots[i][1], R() * 40], i * 4);
      col.set(cols[i % cols.length], i * 3);
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, -0.4, 0, 0, 0.45, -1, 0, 0.62, -1, 0, -0.55, 0, 0, -0.4, 0, 0, 0.45, 1, 0, 0.62, 1, 0, -0.55], 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]);
    g.setAttribute("aHome", new THREE.InstancedBufferAttribute(home, 4));
    g.setAttribute("aCol", new THREE.InstancedBufferAttribute(col, 3));
    g.instanceCount = N;
    const mesh = staticMesh(g, flyMat, "butterflies");
    mesh.frustumCulled = false;
    return mesh;
  })();

  // ------------------------------------------------------------------------------------------------
  // Vegetation geometry
  // ------------------------------------------------------------------------------------------------
  const crossGeo = (function () {      // two crossed, slightly bent cards; base at y 0, 1 wide, 1 tall
    const m = MB();
    for (let q = 0; q < 2; q++) {
      const a = q * Math.PI / 2 + 0.35, dx = Math.cos(a), dz = Math.sin(a), b = m.p.length / 3;
      for (let r = 0; r < 3; r++) for (let s = 0; s < 2; s++) {
        const v = r / 2, sd = s ? 0.5 : -0.5, nx = dx * sd * 0.7, nz = dz * sd * 0.7, l = Math.hypot(nx, 1, nz);
        V(m, dx * sd, v, dz * sd, nx / l, 1 / l, nz / l, s ? 0.98 : 0.02, 0.02 + 0.96 * v, WHITE, v * v);
      }
      for (let r = 0; r < 2; r++) { const o = b + r * 2; m.i.push(o, o + 1, o + 3, o, o + 3, o + 2); }
    }
    return finish(m);
  })();
  const flatGeo = (function () {       // a flat card on the ground / in the canopy
    const m = MB();
    V(m, -0.5, 0, 0.5, 0, 1, 0, 0.02, 0.02, WHITE, 0.25); V(m, 0.5, 0, 0.5, 0, 1, 0, 0.98, 0.02, WHITE, 0.25);
    V(m, 0.5, 0, -0.5, 0, 1, 0, 0.98, 0.98, WHITE, 0.25); V(m, -0.5, 0, -0.5, 0, 1, 0, 0.02, 0.98, WHITE, 0.25);
    m.i.push(0, 1, 2, 0, 2, 3);
    return finish(m);
  })();
  const padGeo = (function () { const g = flatGeo.clone(); const s = g.getAttribute("aSway"); for (let i = 0; i < s.count; i++) s.setX(i, 0); return g; })();
  const clumpGeo = (function () {      // a leaf mass: two upright crossed cards and a flat one
    const m = MB();
    for (let q = 0; q < 2; q++) {
      const a = q * Math.PI / 2 + 0.2, dx = Math.cos(a), dz = Math.sin(a), b = m.p.length / 3;
      V(m, -dx * 0.5, -0.5, -dz * 0.5, 0, 1, 0, 0.02, 0.02, WHITE, 0.4); V(m, dx * 0.5, -0.5, dz * 0.5, 0, 1, 0, 0.98, 0.02, WHITE, 0.4);
      V(m, dx * 0.5, 0.5, dz * 0.5, 0, 1, 0, 0.98, 0.98, WHITE, 0.4); V(m, -dx * 0.5, 0.5, -dz * 0.5, 0, 1, 0, 0.02, 0.98, WHITE, 0.4);
      m.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const b = m.p.length / 3;
    V(m, -0.5, 0, 0.5, 0, 1, 0, 0.02, 0.02, WHITE, 0.4); V(m, 0.5, 0, 0.5, 0, 1, 0, 0.98, 0.02, WHITE, 0.4);
    V(m, 0.5, 0, -0.5, 0, 1, 0, 0.98, 0.98, WHITE, 0.4); V(m, -0.5, 0, -0.5, 0, 1, 0, 0.02, 0.98, WHITE, 0.4);
    m.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
    return finish(m);
  })();
  const midGeo = (function () {        // a palm / tree fern: a slim curved trunk and eight arching fronds (atlas tiles 8 / 9)
    const m = MB(), pts = [];
    for (let i = 0; i <= 4; i++) { const y = i * 1.15; pts.push([0.3 * Math.sin(y * 0.45), y, 0, 0.17 - 0.013 * i]); }
    tube(m, pts, 6, { uv: (i, j) => [0.035 + 0.07 * (j / 6), 0.03 + 0.94 * i / 4], sway: (i) => 0.14 * sq(i / 4) });
    const ox = 0.3 * Math.sin(4.6 * 0.45);
    for (let k = 0; k < 8; k++) {
      const az = k * TAU / 8 + (k % 2) * 0.22, up = k % 2 === 0, rx = Math.cos(az), rz = Math.sin(az), b = m.p.length / 3, l = Math.hypot(0.35, 1);
      for (let r = 0; r <= 3; r++) {
        const s = r / 3, rho = 2.7 * s * (up ? 0.82 : 1), y = 4.55 + (up ? 1.7 * s - 1.4 * s * s : 0.8 * s - 2.0 * s * s), w = 0.5 * (0.12 + 0.88 * Math.sin(Math.PI * (0.16 + 0.78 * s)));
        for (let sd = -1; sd <= 1; sd += 2) V(m, ox + rx * rho - rz * w * sd, y, rz * rho + rx * w * sd, rx * 0.35 / l, 1 / l, rz * 0.35 / l, sd < 0 ? 0.19 : 0.95, 0.03 + 0.94 * s, WHITE, 0.35 + 0.65 * s);
      }
      for (let r = 0; r < 3; r++) { const o = b + r * 2; m.i.push(o, o + 1, o + 3, o, o + 3, o + 2); }
    }
    return finish(m);
  })();
  // the five giants: buttressed lathes (0 kapok: four great fins, 1 five twisting fins, 2 three plank buttresses,
  // 3 a fluted column, 4 the strangler fig: a ribbed lattice trunk with aerial roots)
  function trunkGeo(type) {
    const m = MB(), T = mulberry(100 + type * 17), q = (a, b) => a + (b - a) * T();
    const nb = [4, 5, 3, 6, 8][type], N = [16, 20, 18, 18, 16][type], amp = [1.5, 1.25, 1.9, 0.8, 0.42][type], hf = [2.1, 2.6, 1.9, 1.5, 40][type];
    const pw = [4, 3, 5, 2.5, 1][type], R0 = [0.82, 0.8, 0.86, 0.9, 1.05][type], tw = [0, 0.12, 0, 0.05, 0.03][type];
    const YS = [-0.7, 0.45, 1.2, 2.3, 4.2, 7.5, 12, 18, 24, 30];
    const lx = q(0.2, 0.7), lz = q(0.2, 0.7), p1 = q(0, 6), p2 = q(0, 6);
    const cx = (y) => lx * (Math.sin(y * 0.09 + p1) - Math.sin(p1)), cz = (y) => lz * (Math.sin(y * 0.075 + p2) - Math.sin(p2));
    for (let i = 0; i < YS.length; i++) {
      const y = YS[i], yy = Math.max(y, 0), r0 = R0 * (1 - 0.5 * yy / 30), fl = amp * Math.exp(-yy / hf);
      for (let j = 0; j <= N; j++) {
        const th = j / N * TAU, jj = j % N, b = Math.pow(0.5 + 0.5 * Math.cos(nb * (th + tw * y)), pw);
        const r = r0 * (1 + fl * b) * (1 + 0.05 * Math.sin(3 * th + y * 0.6)) * (y < 0 ? 1.12 : 1);
        const moss = clamp(1 - yy / 5.5, 0, 1) * (0.3 + 0.7 * hash2(jj * 1.3 + type, i * 2.1)), crease = (1 - b) * Math.min(fl, 1);
        const col = mulc(mixc(mixc(PAL.bark, PAL.barkDark, hash2(jj, i + type * 7) * 0.6), PAL.moss, moss * 0.62), 1 - 0.34 * crease);
        V(m, cx(y) + Math.cos(th) * r, y, cz(y) + Math.sin(th) * r, Math.cos(th), 0, Math.sin(th), th / TAU * 3, y * 0.3, col, 0);
      }
    }
    for (let i = 0; i < YS.length - 1; i++) for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, b = a + 1, c = a + N + 2, d = a + N + 1, th = (j + 0.5) / N * TAU;
      triRef(m.p, m.i, a, b, c, Math.cos(th), 0, Math.sin(th)); triRef(m.p, m.i, a, c, d, Math.cos(th), 0, Math.sin(th));
    }
    const trunkVerts = m.p.length / 3;
    const nBr = type === 4 ? 5 : 4;
    for (let k = 0; k < nBr; k++) {
      const yb = 20 + k * 2.4 + q(0, 1), az = k * 2.4 + q(0, 1), ax = Math.cos(az), azz = Math.sin(az), L = q(7, 10);
      tube(m, [[cx(yb), yb - 0.4, cz(yb), 0.36], [cx(yb) + ax * L * 0.45, yb + L * 0.3, cz(yb) + azz * L * 0.45, 0.24], [cx(yb) + ax * L, yb + L * 0.48, cz(yb) + azz * L, 0.1]], 5,
        { col: mixc(PAL.bark, PAL.barkDark, 0.4), uRep: 1, vRep: 3, ref: [0, 1, 0] });
    }
    if (type === 4) for (let k = 0; k < 7; k++) {
      const az = k * 0.9 + q(0, 0.5), rho = q(1.5, 2.7), y0 = q(9, 14);
      tube(m, [[Math.cos(az) * rho * 0.75, y0, Math.sin(az) * rho * 0.75, 0.1], [Math.cos(az) * rho, y0 * 0.5, Math.sin(az) * rho, 0.12], [Math.cos(az) * rho * 1.08, -0.4, Math.sin(az) * rho * 1.08, 0.17]], 4,
        { col: mixc(PAL.bark, PAL.moss, 0.25), uRep: 1, vRep: 4, ref: [1, 0, 0.3] });
    }
    const g = finish(m, false);
    // smooth normals for the lathe part only (the tubes carry their own), with the seam welded
    const pos = g.getAttribute("position"), nor = g.getAttribute("normal"), acc = new Float32Array(trunkVerts * 3);
    for (let k = 0; k < (YS.length - 1) * N * 6; k += 3) {
      const a = m.i[k], b = m.i[k + 1], c = m.i[k + 2];
      _v.fromBufferAttribute(pos, a); _n1.fromBufferAttribute(pos, b).sub(_v); _n2.fromBufferAttribute(pos, c).sub(_v); _n.crossVectors(_n1, _n2);
      for (const id of [a, b, c]) { acc[id * 3] += _n.x; acc[id * 3 + 1] += _n.y; acc[id * 3 + 2] += _n.z; }
    }
    for (let i = 0; i < YS.length; i++) {
      const a = i * (N + 1), b = a + N;
      for (let k = 0; k < 3; k++) { const s = acc[a * 3 + k] + acc[b * 3 + k]; acc[a * 3 + k] = s; acc[b * 3 + k] = s; }
    }
    for (let k = 0; k < trunkVerts; k++) { _n.set(acc[k * 3], acc[k * 3 + 1], acc[k * 3 + 2]).normalize(); nor.setXYZ(k, _n.x, _n.y, _n.z); }
    return g;
  }
  const lianaGeo = (function () {      // a hanging rope from (0,0,0) to (1,0,0), sagging by 1: two crossed strips
    const m = MB();
    for (let q = 0; q < 2; q++) {
      const b = m.p.length / 3;
      for (let k = 0; k <= 9; k++) {
        const s = k / 9, y = -4 * s * (1 - s);
        for (let sd = -1; sd <= 1; sd += 2) V(m, s, y + (q ? 0 : sd * 0.055), q ? sd * 0.16 : 0, 0, 1, 0, sd < 0 ? 0 : 1, s * 7, WHITE, Math.sin(Math.PI * s));
      }
      for (let k = 0; k < 9; k++) { const o = b + k * 2; m.i.push(o, o + 1, o + 3, o, o + 3, o + 2); }
    }
    return finish(m);
  })();
  const rootGeo = (function () {       // a root arching out of the ground: a half ring in the XY plane, feet at x = +-1
    const m = MB(), pts = [];
    for (let k = 0; k <= 6; k++) { const a = Math.PI * k / 6; pts.push([Math.cos(a), Math.sin(a) * 0.92 - 0.06, 0.05 * Math.sin(a * 3), 0.1 + 0.03 * Math.abs(Math.cos(a))]); }
    tube(m, pts, 4, { col: (i, j, nx, ny) => mixc(PAL.bark, PAL.moss, clamp(ny, 0, 1) * 0.45), uRep: 1, vRep: 3, ref: [0, 0, 1] });
    return finish(m);
  })();
  const logGeo = (function () {        // a fallen log along z, 1 long, 1 thick
    const m = MB(), pts = [];
    for (let k = 0; k <= 5; k++) pts.push([0.02 * Math.sin(k * 2.1), 0.02 * Math.cos(k * 1.7), -0.5 + k / 5, 0.5 * (1 + 0.07 * Math.sin(k * 2.7 + 1))]);
    tube(m, pts, 8, { col: (i, j, nx, ny) => mixc(PAL.bark, PAL.moss, clamp(ny * 1.2 - 0.2, 0, 1) * 0.6), uRep: 2, vRep: 1.5, cap0: true, cap1: true, capCol: C(0xc9b28e) });
    return finish(m);
  })();
  function rockGeo(seed) {
    const m = MB();
    append(m, new THREE.IcosahedronGeometry(1, 1), null, (p, n) => mulc(mixc(PAL.rock, PAL.moss, clamp(n.y * 1.5 - 0.35, 0, 1) * (0.45 + 0.5 * hash2(p.x * 3 + seed, p.z * 3))), 0.82 + 0.3 * hash2(p.x * 7, p.y * 5 + seed)), {
      warp: (v) => { v.multiplyScalar(1 + 0.2 * Math.sin(v.x * 2.1 + seed) * Math.cos(v.z * 1.7 + seed * 2) + 0.12 * Math.sin(v.y * 3.3 + seed * 3)); if (v.y < -0.55) v.y = -0.55 - (v.y + 0.55) * 0.3; },
    });
    return finish(m);
  }
  const monoGeo = (function () {       // a standing stone: base at y 0, 1 tall (scaled per instance)
    const m = MB();
    append(m, new THREE.CylinderGeometry(0.62, 1, 1, 7, 4), xf(0, 0.5, 0), (p, n) => mulc(mixc(PAL.rock, PAL.moss, clamp(0.75 - p.y * 1.1 + 0.5 * hash2(p.x * 5, p.z * 5 + p.y * 3), 0, 1) * 0.7 + (n.y > 0.5 ? 0.3 : 0)), 0.8 + 0.3 * hash2(p.y * 9, p.x * 4)), {
      warp: (v) => { const k = 1 + 0.12 * Math.sin(v.y * 7 + v.x * 3) + 0.08 * Math.cos(v.z * 5 + v.y * 4); v.x *= k * 0.86; v.z *= k * 1.1; },
    });
    return finish(m);
  })();

  // ------------------------------------------------------------------------------------------------
  // Scatter: the understorey cards of every zone
  // ------------------------------------------------------------------------------------------------
  function addCard(x, z, tile, w, h, y) {
    const zx = clamp(x, X0, GX1 - 0.01);
    ZONES[zoneOf(zx, z)].cards.push({ x, y: y !== undefined ? y : Math.max(gridH(x, z), -0.05) - 0.04, z, ry: R() * TAU, sx: w, sy: h, tile, k: 0.76 + 0.36 * R(), warm: R() });
  }
  const inList = (list, x, z) => { for (let i = 0; i < list.length; i++) if (sq(x - list[i].x) + sq(z - list[i].z) < list[i].r * list[i].r) return true; return false; };
  for (let gz = Z0 + 1; gz < GZ1 - 1; gz += 1.5) for (let gx = X0 + 1; gx < GX1 - 1; gx += 1.5) {
    const x = gx + rr(-0.6, 0.6), z = gz + rr(-0.6, 0.6), h = gridH(x, z), wl = waterLevel(x, z), u = R(), t = R();
    if (cliffK(x, z) > 0.05) continue;
    if (wl !== -Infinity && h < wl + 0.03) { if (wl - h < 0.32 && u < 0.4) addCard(x, z, TILE.reeds, rr(1, 1.5), rr(1.3, 2)); continue; }
    if (pathDist(x, z) < 0.85) continue;
    if (Math.hypot(x - ARENA.x, z - ARENA.z) < 12.7 || Math.hypot(x - RIVAL.x, z - RIVAL.z) < 10.7 || Math.hypot(x, z + 41) < 3.6) continue;
    if (Math.hypot(x - LOG.x, z - LOG.z) < 4.4 && segDist(x, z, LOG.ax, LOG.az, LOG.bx, LOG.bz) < LOG.r + 0.5) continue;
    if (segDist(x, z, BR.ax, BR.az, BR.bx, BR.bz) < 1 || Math.hypot(x - 4, z - 48.2) < 2.2) continue;
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < 12.6) { if (u < 0.09 && SURF_CODE[cellOf(x, z)] === 3) addCard(x, z, TILE.shortGrass, rr(0.9, 1.2), rr(0.3, 0.5)); continue; }
    if (inList(GRASS, x, z)) { addCard(x, z, TILE.tallGrass, rr(1.3, 1.7), rr(1.25, 1.6)); addCard(x + rr(-0.5, 0.5), z + rr(-0.5, 0.5), TILE.tallGrass, rr(1.2, 1.6), rr(1.1, 1.5)); continue; }
    if (inList(FERNS, x, z)) { addCard(x, z, TILE.fern, rr(1.8, 2.4), rr(1.25, 1.6)); if (u < 0.5) addCard(x + rr(-0.5, 0.5), z + rr(-0.5, 0.5), TILE.broad, rr(1.5, 2), rr(1.5, 2)); continue; }
    const code = SURF_CODE[cellOf(x, z)];
    if (code === 3) { if (u < 0.8) addCard(x, z, t < 0.05 ? TILE.flowers : TILE.shortGrass, rr(0.9, 1.35), t < 0.05 ? rr(0.7, 1) : rr(0.34, 0.62)); continue; }
    // the leaf grove (level 9): a ring of giant taro round an open floor, so the hanging leaves (radius 4.2) and the
    // camera stay clear of the big cards
    { const dg = Math.hypot(x + 30, z - 42);
      if (dg < 5.6) { if (u < 0.45) addCard(x, z, TILE.shortGrass, rr(0.9, 1.2), rr(0.3, 0.5)); continue; }
      if (dg < 8) { if (u < 0.85) addCard(x, z, t < 0.6 ? TILE.taro : TILE.broad, rr(2, 2.8), rr(1.7, 2.4)); continue; } }
    // the foot of the vine wall and the bone yard (level 9): open ground to work in
    if (Math.abs(x + 18) < 5 && z > 56 && z < 61.2) { if (u < 0.35) addCard(x, z, TILE.shortGrass, rr(0.9, 1.2), rr(0.3, 0.5)); continue; }
    if (Math.hypot(x + 42, z - 22) < 5.2) { if (u < 0.3) addCard(x, z, TILE.shortGrass, rr(0.9, 1.2), rr(0.3, 0.5)); continue; }
    if (code === 5 || code === 4) { if (u < 0.08) addCard(x, z, code === 5 ? TILE.reeds : TILE.fern, rr(0.9, 1.3), rr(0.8, 1.3)); continue; }
    if (code === 1) continue;
    if (code === 2) { if (u < 0.5) addCard(x, z, t < 0.4 ? TILE.taro : t < 0.7 ? TILE.reeds : TILE.fern, rr(1.2, 1.8), rr(0.9, 1.5)); continue; }
    if (u > 0.54) continue;
    if (t < 0.36) addCard(x, z, TILE.fern, rr(1.3, 2.1), rr(0.8, 1.3));
    else if (t < 0.5) addCard(x, z, TILE.broad, rr(1.5, 2.4), rr(1.5, 2.4));
    else if (t < 0.66) addCard(x, z, TILE.bush, rr(1.3, 2.2), rr(1.1, 1.8));
    else if (t < 0.76) addCard(x, z, TILE.taro, rr(1.3, 2), rr(1.1, 1.7));
    else if (t < 0.82) addCard(x, z, TILE.flowers, rr(1.2, 1.7), rr(1.1, 1.5));
    else if (t < 0.88) addCard(x, z, TILE.ginger, rr(1.4, 2), rr(1.3, 1.9));
    else addCard(x, z, TILE.shortGrass, rr(0.9, 1.3), rr(0.35, 0.6));
  }
  for (let i = 0; i < 3; i++) for (let k = 0; k < 6; k++) addCard(P.ambush[i].x + rr(-1.1, 1.1), P.ambush[i].z + rr(-1.1, 1.1), TILE.bush, rr(2.2, 2.8), rr(1.8, 2.3));
  for (let i = 0; i < giants.length; i++) {         // vines hanging from the giants' boughs (flipped cards: anchored at the top)
    const g = giants[i];
    if (g.x < X0 || g.x > GX1 || g.z < Z0 || g.z > GZ1) continue;
    for (let k = 0; k < 3; k++) {
      const a = R() * TAU, d = rr(1.9, 5.5) * g.s, x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d, top = g.y + rr(7, 12);
      const len = Math.min(rr(3.5, 7), top - Math.max(gridH(x, z), 0) - (pathDist(x, z) < 2 ? 2.3 : 1.3));
      if (len > 2) addCard(x, z, TILE.vine, rr(1, 1.5), -len, top);
    }
  }
  for (let i = 0; i < 9; i++) addCard(-23.4 + i * 1.3, 63.5 + rr(-0.2, 0.2), TILE.vine, rr(1.1, 1.5), -rr(2.2, 3), gridH(-18, 63.4) + rr(3, 3.6));
  for (let i = 0; i < 12; i++) { const z = -14 + i * 3.1; if (z > 0.5 && z < 7.5) continue; addCard(-50.3 + rr(-0.2, 0.3), z, TILE.vine, rr(1.2, 1.7), -rr(3.5, 6), rr(7.2, 8.2)); }

  // ------------------------------------------------------------------------------------------------
  // Instanced meshes
  // ------------------------------------------------------------------------------------------------
  for (let zi = 0; zi < ZONES.length; zi++) {
    const Z = ZONES[zi], cards = Z.cards;
    Z.under = inst(tiledGeo(crossGeo, cards.map((c) => c.tile)), cardMat, cards.length, "under" + zi);
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      put(Z.under, i, c.x, c.y, c.z, 0, c.ry, 0, c.sx, c.sy, c.sx);
      Z.under.setColorAt(i, _c.setRGB(c.k * (0.9 + 0.2 * c.warm), c.k, c.k * (0.92 - 0.14 * c.warm)));
    }
    Z.mid = inst(tiledGeo(midGeo, Z.mids.map((c) => c.tile)), midMat, Z.mids.length, "mid" + zi);
    for (let i = 0; i < Z.mids.length; i++) {
      const c = Z.mids[i], k = rr(0.8, 1.1);
      put(Z.mid, i, c.x, c.y, c.z, rr(-0.07, 0.07), c.rot, rr(-0.07, 0.07), c.s, c.s * rr(0.9, 1.15), c.s);
      Z.mid.setColorAt(i, _c.setRGB(k, k, k * 0.95));
    }
    Z.cards = null;
  }
  {
    const byType = [[], [], [], [], []];
    for (let i = 0; i < giants.length; i++) byType[giants[i].type].push(giants[i]);
    for (let t = 0; t < 5; t++) {
      const mesh = inst(trunkGeo(t), barkMat, byType[t].length, "trunk" + t);
      for (let i = 0; i < byType[t].length; i++) { const g = byType[t][i], k = rr(0.82, 1.08); put(mesh, i, g.x, g.y, g.z, 0, g.rot, 0, g.s, g.sy, g.s); mesh.setColorAt(i, _c.setRGB(k, k * 0.98, k * 0.94)); }
    }
    // the canopy: leaf masses round every crown, and a roof of flat leaf cards under them
    const clumps = [], roof = [];
    for (let i = 0; i < giants.length; i++) {
      const g = giants[i];
      for (let k = 0; k < 6; k++) { const a = k * 1.05 + R(), d = k === 0 ? 0 : rr(3, 7.5) * g.s; clumps.push([g.x + Math.cos(a) * d, g.y + rr(24, 31) * g.sy, g.z + Math.sin(a) * d, rr(8, 11.5) * g.s]); }
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + R(), d = rr(1, 6.5) * g.s; roof.push([g.x + Math.cos(a) * d, g.y + rr(18.5, 22.5) * g.sy, g.z + Math.sin(a) * d, rr(13, 17) * g.s]); }
    }
    const cm = inst(tiledGeo(clumpGeo, clumps.map(() => TILE.clump)), canopyMat, clumps.length, "canopy");
    for (let i = 0; i < clumps.length; i++) { const c = clumps[i], k = rr(0.75, 1.1); put(cm, i, c[0], c[1], c[2], rr(-0.2, 0.2), R() * TAU, rr(-0.2, 0.2), c[3], c[3] * 0.8, c[3]); cm.setColorAt(i, _c.setRGB(k * 0.95, k, k * 0.85)); }
    const rm = inst(tiledGeo(flatGeo, roof.map(() => TILE.ceiling)), canopyMat, roof.length, "roof");
    for (let i = 0; i < roof.length; i++) { const c = roof[i], k = rr(0.5, 0.8); put(rm, i, c[0], c[1], c[2], rr(-0.12, 0.12), R() * TAU, rr(-0.12, 0.12), c[3], 1, c[3]); rm.setColorAt(i, _c.setRGB(k, k, k * 0.9)); }
  }
  // lianas between neighbouring giants (+ the beam the vine curtain hangs from)
  const curtainY = Math.max(gridH(4, 48.2), 0) + 4.4;
  {
    const L = [[0.9, curtainY + 0.15, 48.2, 7.1, curtainY + 0.1, 48.2, 0.35]];
    for (let i = 0; i < giants.length && L.length < 52; i++) for (let j = i + 1; j < giants.length && L.length < 52; j++) {
      const a = giants[i], b = giants[j], d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < 8 || d > 16.5 || R() < 0.45) continue;
      L.push([a.x, a.y + rr(9, 15) * a.sy, a.z, b.x, b.y + rr(9, 15) * b.sy, b.z, rr(1.6, 3.6)]);
    }
    const lm = inst(lianaGeo, lianaMat, L.length, "lianas");
    for (let i = 0; i < L.length; i++) {
      const l = L[i], dx = l[3] - l[0], dy = l[4] - l[1], dz = l[5] - l[2], lh = Math.hypot(dx, dz), l3 = Math.hypot(lh, dy);
      put(lm, i, l[0], l[1], l[2], 0, Math.atan2(-dz, dx), Math.atan2(dy, lh), l3, l[6], 1);
    }
  }
  const rootMesh = (function () {
    const Rt = [];   // [x, y, z, rx, ry, rz, sx, sy, sz, tint]
    for (let i = 0; i < giants.length; i++) {
      const g = giants[i];
      if (g.x < X0 || g.x > GX1 || g.z < Z0 || g.z > GZ1) continue;
      for (let k = 0; k < (i % 2 ? 2 : 1); k++) {
        const a = R() * TAU, len = rr(1.2, 2.3), d = g.r * 0.7 + len, x = g.x + Math.cos(a) * d, z = g.z + Math.sin(a) * d;
        if (pathDist(x, z) < 1 || waterLevel(x, z) !== -Infinity) continue;
        Rt.push([x, Math.max(gridH(x, z), 0), z, rr(-0.35, 0.35), -a, 0, len, rr(0.28, 0.55), 1.5, 0]);
      }
    }
    const gA = Math.atan2(-(59.5 - 60.7), 13 - 7.1), gY = gridH(10, 60);       // the root arch of the camp gate
    for (let k = 0; k < 5; k++) Rt.push([10 + rr(-0.15, 0.15), gY - 0.1, 60.1 + (k - 2) * 0.22, (k - 2) * 0.16, gA + rr(-0.08, 0.08), 0, 2.45 + (k % 2) * 0.3, 2.7 + (k % 3) * 0.3, 2.3, 0]);
    for (let k = 0; k < 4; k++) Rt.push([30 + rr(-0.3, 0.3), CAMP.y - 0.1, 86 + rr(-0.3, 0.3), rr(-0.2, 0.2), 0.5 + k * 0.8, 0, 3.4, (3.0 - CAMP.y + 0.1) / 0.86, 3.2, 0]);   // the lookout root
    for (let k = 0; k < 8; k++) { const a = k * 0.8, x = -42 + Math.cos(a) * rr(0.8, 3.6), z = 22 + Math.sin(a) * rr(0.8, 3.2); Rt.push([x, gridH(x, z) - 0.05, z, rr(-0.5, 0.5), R() * TAU, 0, rr(0.45, 0.8), rr(0.6, 0.95), 0.6, 1]); }   // old ribs
    for (let i = 0; i < 6; i++) Rt.push([P.burrows[i].x, gridH(P.burrows[i].x, 87.2) - 0.1, 87.35, -0.25, 0, 0, 0.78, 0.95, 1.6, 2]);            // burrow mouths
    const mesh = inst(rootGeo, barkMat, Rt.length, "roots");
    for (let i = 0; i < Rt.length; i++) {
      const r = Rt[i], k = rr(0.8, 1.05);
      put(mesh, i, r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8]);
      if (r[9] === 1) mesh.setColorAt(i, _c.setRGB(1.5, 1.45, 1.3)); else if (r[9] === 2) mesh.setColorAt(i, _c.setRGB(0.6, 0.48, 0.36)); else mesh.setColorAt(i, _c.setRGB(k, k, k * 0.95));
    }
    return mesh;
  })();
  {
    const lm = inst(logGeo, barkMat, logsI.length, "logs");
    const tints = [[1, 1, 1], [1.5, 1.45, 1.32], [0.2, 0.18, 0.17], [1.25, 1.08, 0.86]];
    for (let i = 0; i < logsI.length; i++) { const l = logsI[i], t = tints[l.tint], k = l.tint ? 1 : rr(0.8, 1.05); put(lm, i, l.x, l.y, l.z, l.pitch, l.yaw, 0, l.d, l.d, l.len); lm.setColorAt(i, _c.setRGB(t[0] * k, t[1] * k, t[2] * k)); }
    lm.castShadow = true;
    const rm = [inst(rockGeo(1.3), rockMat, (rocks.length + 1) >> 1, "rocksA"), inst(rockGeo(4.1), rockMat, rocks.length >> 1, "rocksB")];
    const tr3 = [[1, 1, 1], [1.45, 1.42, 1.3], [0.5, 0.48, 0.46]];
    for (let i = 0; i < rocks.length; i++) { const rk = rocks[i], t = tr3[rk.tint], k = rr(0.8, 1.1); put(rm[i & 1], i >> 1, rk.x, rk.y, rk.z, 0, rk.rot, 0, rk.sx, rk.sy, rk.sz); rm[i & 1].setColorAt(i >> 1, _c.setRGB(t[0] * k, t[1] * k, t[2] * k)); }
  }
  {
    // lily pads on the calm water
    const pads = [];
    for (let tries = 0; tries < 1500 && pads.length < 64; tries++) {
      let x, z;
      const pick = R();
      if (pick < 0.6) { x = rr(-48, 60); z = riverZ(x) + (R() < 0.5 ? -1 : 1) * riverHalf(x) * rr(0.55, 0.92); }
      else if (pick < 0.85) { const a = R() * TAU, d = rr(1, 3.4); x = 29.5 + Math.cos(a) * d; z = 79 + Math.sin(a) * d; }
      else { const t = R(); x = lerp(RC.ax, RC.bx, t) + rr(-1, 1); z = lerp(RC.az, RC.bz, t) + rr(-1, 1); }
      const wl = waterAt(x, z);
      if (wl === -Infinity || wl - gridH(x, z) < 0.25 || foamAt(x, z) > 0.02 || Math.abs(x + 10) < 5 || Math.abs(x - 14) < 2.5 || x < -43.5) continue;
      pads.push([x, wl + 0.02, z, rr(0.5, 0.95)]);
    }
    const pm = inst(tiledGeo(padGeo, pads.map(() => TILE.lily)), cardMat, pads.length, "lilies");
    for (let i = 0; i < pads.length; i++) { const p = pads[i], k = rr(0.8, 1.1); put(pm, i, p[0], p[1], p[2], 0, R() * TAU, 0, p[3], 1, p[3]); pm.setColorAt(i, _c.setRGB(k, k, k)); }
  }
  // the hollow log of the trail (walk through it)
  {
    const m = MB(), y0 = gridH(LOG.x, LOG.z) + LOG.r - 0.32, pts = [], pin = [];
    for (let k = 0; k <= 6; k++) {
      const t = -LOG.len / 2 + k * LOG.len / 6, x = LOG.x + LOG.dx * t, z = LOG.z + LOG.dz * t;
      pts.push([x, y0 + 0.04 * Math.sin(k * 1.9), z, LOG.r * (1 + 0.05 * Math.sin(k * 2.3))]);
      pin.push([x, y0 + 0.04 * Math.sin(k * 1.9), z, (LOG.r - 0.15) * (1 + 0.05 * Math.sin(k * 2.3))]);
    }
    tube(m, pts, 12, { col: (i, j, nx, ny) => mixc(PAL.bark, PAL.moss, clamp(ny * 1.3, 0, 1) * 0.7), uRep: 4, vRep: 2.4 });
    tube(m, pin, 12, { col: mulc(PAL.barkDark, 0.4), uRep: 4, vRep: 2.4 });
    for (let e = -1; e <= 1; e += 2) append(m, new THREE.RingGeometry(LOG.r - 0.16, LOG.r + 0.02, 12), xf(LOG.x + LOG.dx * e * LOG.len / 2, y0, LOG.z + LOG.dz * e * LOG.len / 2, 0, LOG.yaw, 0), mulc(PAL.bark, 0.9));
    staticMesh(finish(m), barkMatDS, "hollowLog", null, true);
  }
  // the vine curtain in front of the meeting place
  const curtainMesh = (function () {
    const S = [];
    for (let i = 0; i < 26; i++) S.push({ x: 1.95 + (i % 13) * 0.345 + rr(-0.08, 0.08), z: 48.1 + (i < 13 ? 0 : 0.34), y: curtainY + rr(-0.15, 0.1), w: rr(0.85, 1.1), len: 0, ry: R() * TAU, k: R() });
    for (let i = 0; i < S.length; i++) S[i].len = S[i].y - Math.max(gridH(S[i].x, S[i].z), 0) - rr(0.02, 0.25);
    const mesh = inst(tiledGeo(crossGeo, S.map(() => TILE.vine)), cardMat, S.length, "curtain");
    for (let i = 0; i < S.length; i++) { const k = rr(0.8, 1.1); mesh.setColorAt(i, _c.setRGB(k, k, k * 0.9)); }
    mesh.userData.strands = S;
    return mesh;
  })();
  function curtainPose(k) {
    const S = curtainMesh.userData.strands, e = smooth(k);
    for (let i = 0; i < S.length; i++) {
      const s = S[i], side = s.x < 4 ? -1 : 1, near = 1 - Math.min(Math.abs(s.x - 4) / 2.3, 1);
      put(curtainMesh, i, s.x + side * e * (0.5 + 1.5 * near) * (0.7 + 0.3 * s.k), s.y, s.z, 0, 0, side * e * (0.25 + 0.4 * near), s.w, -s.len, s.w);
    }
    curtainMesh.instanceMatrix.needsUpdate = true;
  }
  curtainPose(0);

  // ------------------------------------------------------------------------------------------------
  // Set pieces
  // ------------------------------------------------------------------------------------------------
  const TM = (a, b) => a.clone().multiply(b);
  // the wreck of the circus helicopter at the end of its furrow
  const wreck = (function () {
    const g = new THREE.Group();
    g.name = "wreck";
    g.rotation.order = "YXZ";
    g.position.set(0, gridH(0, -41) + 0.05, -41);
    g.rotation.set(0.12, 0.25, 0.3);
    const m = MB(), cream = C(0xe6dfcc), red = C(0xb3271e), dark = C(0x2a2c2f), soot = C(0x1a1917), steel = C(0x80858a);
    append(m, new THREE.SphereGeometry(1, 14, 10), xf(0, 1.05, 0, 0, 0, 0, 1.05, 1, 1.9), (p) => {
      const stripe = Math.abs(p.y - 1.12) < 0.13 ? 1 : 0, burn = clamp((p.y - 1.3) * 1.2 + (-p.z - 0.6) * 0.5 + hash2(p.x * 4, p.z * 4) * 0.5, 0, 1);
      return mixc(stripe ? red : cream, soot, burn * 0.85);
    }, { warp: (v) => { v.x += 0.1 * Math.sin(v.y * 5 + v.z * 3); v.z += 0.06 * Math.sin(v.x * 6); if (v.y < -0.7) v.y = -0.7; if (v.x > 0.55) v.x = 0.55 + (v.x - 0.55) * 0.35; } });
    append(m, new THREE.SphereGeometry(0.8, 10, 8), xf(0, 1.22, 1.2, 0, 0, 0, 1, 0.85, 1), C(0x16222a));
    append(m, new THREE.BoxGeometry(0.95, 0.5, 1.1), xf(0, 2.0, -0.5, 0.1, 0, 0), mixc(dark, soot, 0.5));
    tube(m, [[0, 1.2, -1.5, 0.3], [0.08, 1.3, -2.5, 0.25], [0.2, 1.36, -3.4, 0.2]], 8, { col: (i) => mixc(cream, soot, 0.25 + 0.2 * i), cap1: true });
    tube(m, [[0.55, 0.42, -3.7, 0.19], [1.1, 0.3, -4.7, 0.16], [1.7, 0.22, -5.7, 0.12]], 8, { col: cream, cap0: true, cap1: true });
    append(m, new THREE.BoxGeometry(0.07, 0.95, 0.6), xf(1.72, 0.55, -5.75, 0.3, 0.5, 0.9), red);
    append(m, new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), xf(0, 2.4, -0.2), steel);
    append(m, new THREE.SphereGeometry(0.17, 6, 4), xf(0, 2.66, -0.2), steel);
    append(m, new THREE.BoxGeometry(0.24, 0.04, 3.6), TM(xf(0, 2.66, -0.2, -0.38, 0.4, 0), xf(0, 0, 1.8)), dark);
    append(m, new THREE.BoxGeometry(0.24, 0.04, 3.2), TM(xf(0, 2.66, -0.2, -0.62, 2.6, 0.2), xf(0, 0, 1.6)), dark);
    append(m, new THREE.BoxGeometry(0.24, 0.04, 3.4), xf(2.7, 0.12, 1.5, 0.05, 1.1, 0.1), dark);
    for (let s = -1; s <= 1; s += 2) {
      tube(m, [[s * 0.8, 0.1, -1.25, 0.05], [s * 0.82, 0.08, 0, 0.05], [s * (s > 0 ? 1.05 : 0.8), s > 0 ? 0.2 : 0.1, 1.35, 0.05]], 5, { col: steel, cap0: true, cap1: true });
      for (let k = -1; k <= 1; k += 2) append(m, new THREE.CylinderGeometry(0.035, 0.035, 0.55, 5), xf(s * 0.7, 0.34, k * 0.7, 0, 0, -s * 0.35), steel);
    }
    const mesh = new THREE.Mesh(finish(m), propMat);
    mesh.castShadow = true; mesh.name = "wreckBody";
    g.add(mesh);
    group.add(g);
    g.updateMatrix();
    const sp = new THREE.Vector3(0, 2.3, -0.7).applyMatrix4(g.matrix);
    return { group: g, smoking: false, smokeAt: { x: sp.x, y: sp.y, z: sp.z }, setSmoke(on) { this.smoking = !!on; return this; } };
  })();

  // a carved platypus pole: heads with bills, painted bands
  function totem(m, x, y, z, yaw, hgt, heads, pal) {
    const M = xf(x, y - 0.2, z, 0, yaw, 0), wood = C(0x8a6a48);
    append(m, new THREE.CylinderGeometry(0.27, 0.36, hgt + 0.2, 8, 1), TM(M, xf(0, (hgt + 0.2) / 2, 0)), (p) => mulc(wood, 0.8 + 0.3 * hash2(p.y * 6, p.x * 9)));
    for (let k = 0; k < heads; k++) {
      const hy = hgt * (heads === 3 ? [0.3, 0.6, 0.9][k] : [0.45, 0.85][k]) + 0.2, col = pal[k % pal.length], sc = 1 - k * 0.08;
      append(m, new THREE.SphereGeometry(0.42 * sc, 8, 6), TM(M, xf(0, hy, 0, 0, 0, 0, 1, 0.82, 1)), col);
      append(m, new THREE.SphereGeometry(0.3 * sc, 6, 4), TM(M, xf(0, hy - 0.05, 0.47 * sc, 0, 0, 0, 0.95, 0.26, 1.25)), C(0x2a2622));
      for (let s = -1; s <= 1; s += 2) append(m, new THREE.OctahedronGeometry(0.07 * sc), TM(M, xf(s * 0.2 * sc, hy + 0.13, 0.33 * sc)), pal[3]);
      append(m, new THREE.TorusGeometry(0.36 * sc, 0.05, 4, 8), TM(M, xf(0, hy - 0.36 * sc, 0, Math.PI / 2, 0, 0)), pal[(k + 1) % 3]);
    }
    append(m, new THREE.ConeGeometry(0.2, 0.45, 6), TM(M, xf(0, hgt + 0.55, 0)), pal[2]);
  }
  const HOME_PAL = [C(0xc98d3a), C(0x2f8f86), C(0xe8e2cf), C(0xf4f0e2)], ASH_PAL = [C(0xb3261e), C(0x3a3632), C(0x8c1c16), C(0xe9e4d6)];

  const campGroup = new THREE.Group(); campGroup.name = "camp"; group.add(campGroup);
  (function buildCamp() {
    const m = MB(), wood = C(0x7c5f42), tan = C(0xc2a26c), leaf = C(0x4f7a32), dry = C(0x9a8a4a);
    for (let i = 0; i < 4; i++) totem(m, P.totems[i].x, P.totems[i].y, P.totems[i].z, P.totems[i].yaw, 3.1 + (i % 2) * 0.5, 3, HOME_PAL);
    for (let i = 0; i < 6; i++) { const b = P.burrows[i], by = gridH(b.x, 87.5); append(m, new THREE.CircleGeometry(0.66, 10), xf(b.x, by + 0.42, 87.42, 0.3, Math.PI, 0, 1, 1.05, 1), C(0x0a0705)); }
    { // the food store: a raised rack under a leaf roof
      const f = P.foodStore, M = xf(f.x, f.y, f.z, 0, f.yaw, 0);
      for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) append(m, new THREE.CylinderGeometry(0.06, 0.07, 1.9, 5), TM(M, xf(sx * 0.85, 0.95, sz * 0.6)), wood);
      append(m, new THREE.BoxGeometry(1.95, 0.08, 1.45), TM(M, xf(0, 0.85, 0)), mulc(wood, 1.15));
      for (let s = -1; s <= 1; s += 2) append(m, new THREE.BoxGeometry(2.2, 0.05, 1.0), TM(M, xf(0, 1.95, s * 0.42, s * 0.55, 0, 0)), (p) => mixc(leaf, dry, hash2(p.x * 3, p.z * 3)));
      for (let k = 0; k < 3; k++) {
        append(m, new THREE.CylinderGeometry(0.26, 0.2, 0.3, 8), TM(M, xf(-0.6 + k * 0.6, 1.04, 0.1 * (k - 1))), mulc(tan, 0.85 + 0.1 * k));
        // nearly empty: a last handful in the bottom of two baskets (level 9: "the food store is almost empty")
        if (k < 2) append(m, new THREE.SphereGeometry(0.11, 6, 4), TM(M, xf(-0.6 + k * 0.6 + 0.05, 1.16, 0.1 * (k - 1) - 0.04, 0, 0, 0, 1, 0.5, 1)), k ? C(0x6b2d7a) : C(0xb3352b));
      }
    }
    { // your sleeping hollow
      const b = P.bed;
      append(m, new THREE.TorusGeometry(0.62, 0.2, 5, 12), xf(b.x, b.y + 0.08, b.z, Math.PI / 2, 0, 0, 1, 1, 0.6), (p) => mixc(leaf, dry, hash2(p.x * 9, p.z * 9)));
      append(m, new THREE.CylinderGeometry(0.58, 0.6, 0.08, 10), xf(b.x, b.y + 0.04, b.z), C(0x5d6b34));
    }
    append(m, new THREE.CylinderGeometry(0.46, 0.48, 0.04, 10), xf(P.seat.x, P.seat.y + 0.02, P.seat.z), tan);
    { // a drying rack by the bank
      const M = xf(22.6, gridH(22.6, 84.6), 84.6, 0, 0.3, 0);
      for (let s = -1; s <= 1; s += 2) append(m, new THREE.CylinderGeometry(0.05, 0.06, 1.5, 5), TM(M, xf(s * 0.9, 0.75, 0, 0, 0, s * 0.08)), wood);
      append(m, new THREE.CylinderGeometry(0.04, 0.04, 2.0, 5), TM(M, xf(0, 1.45, 0, 0, 0, Math.PI / 2)), wood);
      for (let k = 0; k < 4; k++) append(m, new THREE.BoxGeometry(0.26, 0.5, 0.04), TM(M, xf(-0.6 + k * 0.4, 1.17, 0, 0, 0.2 * k, 0)), k % 2 ? dry : leaf);
    }
    staticMesh(finish(m), propMat, "campProps", campGroup, true);
  })();

  const rivalGroup = new THREE.Group(); rivalGroup.name = "rival"; group.add(rivalGroup);
  const thornMesh = (function () {
    const m = MB(), wood = C(0x5c4a3a), bone = C(0xd8d2c0);
    [[46.6, 26.6, 0.9], [55.6, 27.4, -0.6], [47, 38.4, 2.2]].forEach((t) => totem(m, t[0], gridH(t[0], t[1]), t[1], t[2], 2.7, 2, ASH_PAL));
    { // the hoard: a low platform heaped with stolen bundles
      const h = P.hoard, M = xf(h.x, h.y, h.z, 0, 0.5, 0);
      append(m, new THREE.BoxGeometry(2.1, 0.3, 1.7), TM(M, xf(0, 0.2, 0)), wood);
      for (let k = 0; k < 6; k++) append(m, new THREE.SphereGeometry(0.3, 6, 4), TM(M, xf(-0.7 + (k % 3) * 0.7, 0.55 + (k > 2 ? 0.32 : 0), (k > 2 ? 0 : (k % 2 ? 0.35 : -0.3)), 0, k, 0, 1, 0.75, 1.15)), k % 2 ? C(0x55783a) : C(0xb59a62));
      for (let k = 0; k < 3; k++) append(m, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 4), TM(M, xf(1.3, 1.0, -0.5 + k * 0.5, 0.25 * (k - 1), 0, 0.3)), wood);
      for (let k = 0; k < 4; k++) append(m, new THREE.SphereGeometry(0.13, 5, 4), TM(M, xf(-1.3, 0.14, -0.5 + k * 0.33)), bone);
    }
    staticMesh(finish(m), propMat, "rivalProps", rivalGroup, true);
    const T = [];
    for (let i = 0; i < thorn.length; i++) for (let k = 0; k < 2; k++) {
      const t = thorn[i], a = t.a + (k ? 0.035 : -0.03), rad = RIVAL.r + (k ? 0.35 : -0.3);
      T.push({ x: RIVAL.x + Math.cos(a) * rad, z: RIVAL.z + Math.sin(a) * rad, w: rr(2.1, 2.6), h: rr(1.6, 2.1), ry: R() * TAU, breach: t.breach });
    }
    const mesh = inst(tiledGeo(crossGeo, T.map(() => TILE.thorn)), cardMat, T.length, "thorns", rivalGroup);
    for (let i = 0; i < T.length; i++) { const k = rr(0.8, 1.1); T[i].y = gridH(T[i].x, T[i].z) - 0.05; mesh.setColorAt(i, _c.setRGB(k, k * 0.95, k * 0.9)); }
    mesh.userData.T = T;
    return mesh;
  })();
  function thornPose(broken) {
    const T = thornMesh.userData.T;
    for (let i = 0; i < T.length; i++) { const t = T[i], flat = broken && t.breach; put(thornMesh, i, t.x, t.y, t.z, flat ? 1.2 : 0, t.ry, 0, t.w, flat ? t.h * 0.5 : t.h, t.w); }
    thornMesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < thorn.length; i++) if (thorn[i].breach) thorn[i].col.on = !broken;
  }
  thornPose(false);
  // the red totem by the gate: Tail Slap it and it falls across the thorn fence
  const totemPivot = new THREE.Group();
  totemPivot.rotation.order = "YXZ";
  totemPivot.position.set(P.rivalTotem.x, P.rivalTotem.y, P.rivalTotem.z);
  totemPivot.rotation.y = Math.atan2(P.rivalBreach.x - P.rivalTotem.x, P.rivalBreach.z - P.rivalTotem.z);
  rivalGroup.add(totemPivot);
  { const m = MB(); totem(m, 0, 0, 0, 0, 3.4, 3, ASH_PAL); const mesh = new THREE.Mesh(finish(m), propMat); mesh.castShadow = true; mesh.name = "rivalTotem"; totemPivot.add(mesh); }
  const rivalTotem = {
    x: P.rivalTotem.x, y: P.rivalTotem.y, z: P.rivalTotem.z, group: totemPivot, fallen: false, falling: false, t: 0, onFall: null,
    fall() { if (this.fallen || this.falling) return false; this.falling = true; this.t = 0; return true; },
    reset() { this.fallen = false; this.falling = false; this.t = 0; totemPivot.rotation.x = 0; rivalTotemCol.on = true; thornPose(false); },
  };

  const arenaGroup = new THREE.Group(); arenaGroup.name = "arena"; group.add(arenaGroup);
  const idolTop = { x: P.idol.x, y: 1.5, z: P.idol.z, yaw: P.idol.yaw };
  const monoMesh = (function () {
    const fl = new THREE.Mesh(new THREE.CircleGeometry(11.9, 48), floorMat);
    fl.rotation.x = -Math.PI / 2; fl.position.set(ARENA.x, 0.035, ARENA.z); fl.receiveShadow = true; fl.name = "flagstones";
    arenaGroup.add(fl);
    // the fallen idol: a great stone platypus, half sunk and rolled on its side (the King's throne)
    const m = MB(), M = xf(P.idol.x, -0.3, P.idol.z, 0, P.idol.yaw, 0.36);
    const stone = (p, n) => mulc(mixc(PAL.rock, PAL.moss, clamp(n.y * 1.4 - 0.3, 0, 1) * (0.4 + 0.6 * hash2(p.x * 2, p.z * 2))), 0.8 + 0.3 * hash2(p.x * 5, p.y * 5 + p.z));
    append(m, new THREE.SphereGeometry(1, 12, 8), TM(M, xf(0, 0.8, 0, 0, 0, 0, 1.45, 0.88, 2.5)), stone);
    append(m, new THREE.SphereGeometry(1, 8, 6), TM(M, xf(0, 0.66, 2.9, 0.08, 0, 0, 0.95, 0.2, 1.05)), stone);
    append(m, new THREE.SphereGeometry(1, 8, 6), TM(M, xf(0, 0.62, -3.0, -0.1, 0, 0, 0.9, 0.16, 1.15)), stone);
    for (let sx = -1; sx <= 1; sx += 2) for (let sz = -1; sz <= 1; sz += 2) append(m, new THREE.SphereGeometry(1, 6, 4), TM(M, xf(sx * 1.3, 0.3, sz * 1.35, 0, 0, 0, 0.5, 0.32, 0.62)), stone);
    for (let k = 0; k < 5; k++) append(m, new THREE.BoxGeometry(0.22, 0.4, 0.22), TM(M, xf(Math.sin(k * 1.257) * 0.42, 1.62, 1.75 + Math.cos(k * 1.257) * 0.42, 0, k, 0)), stone);
    staticMesh(finish(m), rockMat, "idol", arenaGroup, true);
    // standing stones: 0..3 are the four pillars of the fight, the rest ring the glade
    const mesh = inst(monoGeo, rockMat, 16, "stones", arenaGroup);
    mesh.castShadow = true;
    const S = [];
    for (let i = 0; i < 4; i++) S.push({ x: arena.pillars[i].x, z: arena.pillars[i].z, h: 5.2, w: 1.05, rx: 0, rz: 0, ry: i * 1.3, y: -0.2 });
    for (let k = 0, a = 0.5; S.length < 16; k++, a += 0.47) {
      if (Math.abs(angDiff(a, 0.142)) < 0.3 || Math.abs(angDiff(a, -3.0)) < 0.3 || Math.abs(angDiff(a, Math.atan2(P.idol.z - ARENA.z, P.idol.x - ARENA.x))) < 0.2) continue;
      const fallen = S.length === 7 || S.length === 12, rad = 13.5 + (k % 3) * 0.4;
      S.push({ x: ARENA.x + Math.cos(a) * rad, z: ARENA.z + Math.sin(a) * rad, h: rr(2.3, 4.3), w: rr(0.7, 0.95), rx: fallen ? 1.42 : rr(-0.14, 0.14), rz: rr(-0.14, 0.14), ry: R() * TAU, y: fallen ? 0.45 : -0.2 });
    }
    for (let i = 0; i < 16; i++) { const s = S[i], k = rr(0.85, 1.1); s.y += Math.max(gridH(s.x, s.z), 0); put(mesh, i, s.x, s.y, s.z, s.rx, s.ry, s.rz, s.w, s.h, s.w); mesh.setColorAt(i, _c.setRGB(k, k, k)); if (i >= 4 && s.rx < 1) solid(s.x, s.z, s.w * 0.8, s.h, false); }
    mesh.userData.S = S;
    return mesh;
  })();
  P.idol.y = idolTop.y; P.throne = idolTop;
  function pillarPose(i) {
    const s = monoMesh.userData.S[i], hits = arena.pillars[i].hits, broken = hits >= 3;
    put(monoMesh, i, s.x, s.y, s.z, broken ? 0.3 : hits * 0.055, s.ry, broken ? -0.2 : hits * 0.04, s.w * (broken ? 1.12 : 1), broken ? s.h * 0.2 : s.h, s.w * (broken ? 1.12 : 1));
    monoMesh.instanceMatrix.needsUpdate = true;
    const ps = pillarSolid[i];
    ps.c.on = !broken; ps.b.on = !broken; ps.cv.h = broken ? 0.4 : 5;
  }
  arena.setPillar = (i, hits) => {
    const p = arena.pillars[i];
    if (!p) return;
    const was = p.hits;
    p.hits = clamp(hits | 0, 0, 3);
    if (p.hits === was) return;
    pillarPose(i);
    if (p.hits > was) { vfx("footDust", p.x, 0.3, p.z, p.hits >= 3 ? 1.6 : 0.8, 0x8a8c84); if (p.hits >= 3) vfx("slam", p.x, p.z, 1.6, 0xb9b7ac); }
  };
  arena.pillarHit = (i, broken) => { const p = arena.pillars[i]; if (p) arena.setPillar(i, broken ? 3 : Math.min(2, p.hits + 1)); };
  arena.standing = (i) => !!arena.pillars[i] && arena.pillars[i].hits < 3;
  arena.restore = () => { for (let i = 0; i < 4; i++) { arena.pillars[i].hits = 0; pillarPose(i); } };

  // ------------------------------------------------------------------------------------------------
  // Time of day
  // ------------------------------------------------------------------------------------------------
  const ENV = {
    day: { background: 0xa9c9b4, fog: [0xa9c9b4, 16, 62], hemi: [0xdff0e0, 0x3a4a2a, 1.25], sun: [0xfff0d0, 2.0], sunDir: [0.35, 0.85, -0.38], far: 95, dark: false },
    dusk: { background: 0xc98f62, fog: [0xc98f62, 14, 58], hemi: [0xf0b890, 0x2c3324, 0.95], sun: [0xff9d4a, 1.7], sunDir: [-0.75, 0.32, -0.3], far: 95, dark: false },
    night: { background: 0x0d1a2c, fog: [0x0d1a2c, 9, 46], hemi: [0x4a6a9a, 0x0b1210, 0.6], sun: [0x9ab8ff, 0.6], sunDir: [0.3, 0.8, 0.4], far: 95, dark: true },
    dawn: { background: 0xe7b9b0, fog: [0xe7b9b0, 12, 56], hemi: [0xf3cfc8, 0x33402e, 1.0], sun: [0xffc0a0, 1.4], sunDir: [0.8, 0.3, 0.25], far: 95, dark: false },
    mist: { background: 0xdfe8e2, fog: [0xdfe8e2, 8, 26], hemi: [0xeaf2ec, 0x56604e, 1.25], sun: [0xffffff, 0.6], sunDir: [0.2, 0.9, -0.2], far: 95, dark: false },
    storm: { background: 0x39454a, fog: [0x39454a, 9, 44], hemi: [0x7d8c92, 0x1c221e, 0.8], sun: [0xaab6c4, 0.5], sunDir: [-0.3, 0.8, 0.3], far: 95, dark: true },
  };
  // what the env cannot say: sky, shafts, mist, creatures, wind, how lit a spot counts as
  const LOOK = {
    day: { top: 0x5fa3d6, tree: 0x2c4a2a, shaft: 0xfff2c0, mist: 0xdfe9e4, sky: 0xa8cbd8, shaftK: 0.55, mistOp: 0.12, light: 1, dapple: 1, stars: 0, flies: 0, butter: 1, rain: 0, wind: 1, litOpen: 0.8, litShade: 0.3, fireK: 0.2 },
    dusk: { top: 0x5a5f9a, tree: 0x2a2a22, shaft: 0xffb46a, mist: 0xe0b090, sky: 0xd8a070, shaftK: 0.7, mistOp: 0.16, light: 0.75, dapple: 0.7, stars: 0.15, flies: 0.3, butter: 0.3, rain: 0, wind: 0.8, litOpen: 0.6, litShade: 0.25, fireK: 0.7 },
    night: { top: 0x0a1428, tree: 0x050a0e, shaft: 0x9ab8ff, mist: 0x51688c, sky: 0x1c2f52, shaftK: 0.22, mistOp: 0.16, light: 0.22, dapple: 0.45, stars: 1, flies: 1, butter: 0, rain: 0, wind: 0.6, litOpen: 0.28, litShade: 0.1, fireK: 1 },
    dawn: { top: 0x8fb0d8, tree: 0x3a3a34, shaft: 0xffc9b0, mist: 0xf3d2cc, sky: 0xf0c0b8, shaftK: 0.6, mistOp: 0.34, light: 0.8, dapple: 0.6, stars: 0.05, flies: 0, butter: 0.5, rain: 0, wind: 0.7, litOpen: 0.6, litShade: 0.25, fireK: 0.5 },
    mist: { top: 0xe6eeea, tree: 0xb8c6bc, shaft: 0xffffff, mist: 0xf2f6f3, sky: 0xdfe8e2, shaftK: 0.18, mistOp: 0.4, light: 0.85, dapple: 0.15, stars: 0, flies: 0, butter: 0.3, rain: 0, wind: 0.5, litOpen: 0.55, litShade: 0.4, fireK: 0.3 },
    storm: { top: 0x20282c, tree: 0x12181a, shaft: 0x8090a0, mist: 0x59666c, sky: 0x4a565c, shaftK: 0, mistOp: 0.2, light: 0.4, dapple: 0, stars: 0, flies: 0, butter: 0, rain: 1, wind: 2.2, litOpen: 0.35, litShade: 0.15, fireK: 0.8 },
  };
  const NUM = ["shaftK", "mistOp", "light", "dapple", "stars", "flies", "butter", "rain", "wind", "litOpen", "litShade", "fireK"], COL = ["top", "tree", "shaft", "mist", "sky"];
  const mkLook = () => { const o = {}; for (const k of NUM) o[k] = 0; for (const k of COL) o[k] = new THREE.Color(); return o; };
  const cur = mkLook(), lkA = mkLook(), lkB = mkLook();
  let timeName = "day", tK = 1, tDur = 0, active = false, fxDirty = true, fxT = 0, lastFxX = 1e9, lastFxZ = 1e9, lastT = -1, clock = 0;
  function applyLook(k) {
    for (let i = 0; i < NUM.length; i++) { const n = NUM[i]; cur[n] = lkA[n] + (lkB[n] - lkA[n]) * k; }
    for (let i = 0; i < COL.length; i++) { const n = COL[i]; cur[n].copy(lkA[n]).lerp(lkB[n], k); }
    domeU.uTop.value.copy(cur.top); domeU.uTree.value.copy(cur.tree); domeU.uStars.value = cur.stars;
    U.jLight.value = cur.light; U.jDapK.value = cur.dapple; U.jSky.value.copy(cur.sky); U.jWind.value.z = cur.wind;
    rainU.uRain.value = cur.rain; rain.visible = cur.rain > 0.01;
    butterflies.visible = cur.butter > 0.25;
    fxDirty = true;
  }
  function envUniforms(e) {       // until the engine's onEnv says otherwise
    domeU.uHor.value.set(e.fog[0]);
    U.jSunDir.value.set(e.sunDir[0], e.sunDir[1], e.sunDir[2]).normalize();
    U.jSunCol.value.set(e.sun[0]).multiplyScalar(clamp(e.sun[1] / 2, 0, 1.2));
    domeU.uSunCol.value.copy(U.jSunCol.value);
  }
  function setTime(name, seconds) {
    const L = LOOK[name];
    if (!L) return;
    seconds = seconds > 0 ? seconds : 0;
    timeName = name;
    world.time = name;
    world.env = ENV[name];
    for (let i = 0; i < NUM.length; i++) { const n = NUM[i]; lkA[n] = cur[n]; lkB[n] = L[n]; }
    for (let i = 0; i < COL.length; i++) { const n = COL[i]; lkA[n].copy(cur[n]); lkB[n].set(L[n]); }
    tDur = seconds; tK = seconds > 0 ? 0 : 1;
    if (ctx.world === world && typeof ctx.setEnv === "function") ctx.setEnv(ENV[name], seconds);
    else if (!seconds) envUniforms(ENV[name]);
    if (!seconds) applyLook(1);
  }

  // ---- light shafts and mist: fx shows the nearest few of these ----
  const SHAFTS = [], MISTS = [];
  [[3, -24, 3.2, 20], [2.6, -36.2, 2.6, 22], [-0.6, -40.6, 3.4, 20], [8, -14.4, 2.4, 18], [-6.4, -7.6, 2.8, 20], [-20, riverZ(-20), 3.6, 22], [2, riverZ(2), 3.4, 22], [22, riverZ(22), 3.6, 22],
    [-10.4, 6.6, 2.4, 18], [-21, 17, 2.8, 22], [-9, 37.4, 2.4, 18], [4, 50.6, 2.6, 18], [8, 55, 2.2, 18], [20, 73, 3.8, 22], [26.6, 78, 3.2, 20], [14, 69.6, 3, 20], [18, 83, 2.6, 20],
    [-8, -22, 3.8, 22], [-16, -14, 3.2, 20], [2, -14, 3, 20], [-40, -30, 4, 24], [-35, -25, 3, 22], [-45.6, -24.4, 3.2, 22], [-30, 42, 3, 20], [-18, 61, 2.6, 18], [-42, 22, 3.4, 20],
    [50, 32, 3.4, 20], [34, 10, 2.4, 18], [-58, -33.4, 3.4, 20], [56, -28, 2.6, 18], [-46, 3, 3.6, 22]]
    .forEach((s) => SHAFTS.push({ x: s[0], y: Math.max(gridH(s[0], s[1]), 0), z: s[1], yaw: 0, w: s[2], h: s[3], tilt: 0.3 }));
  for (let x = -44; x <= 58; x += 11) MISTS.push({ x, y: 1.1, z: riverZ(x), w: 15, h: 3.2 });
  [[-48.6, 3.2, 4, 9, 8], [29.5, CAMP.y + 0.6, 79.6, 9, 2.6], [-40, 1.3, -30, 20, 3.6], [-8, 1.5, -22, 22, 3.4], [-30, 2, 42, 12, 3.4], [4, 2, 50, 9, 3], [-42, 1.6, 22, 12, 3], [33, 1.8, 46, 10, 3],
    [58, 1.8, 43.6, 9, 2.8], [3, 1.6, -24, 12, 3], [-12, 2, 34, 10, 3.2], [-22, 2, 18, 12, 3.6], [20, CAMP.y + 1.2, 68, 16, 3]]
    .forEach((s) => MISTS.push({ x: s[0], y: s[1], z: s[2], w: s[3], h: s[4] }));
  const shaftList = [], mistList = [], pickD = new Float32Array(10), pickI = new Int16Array(10);
  function nearest(src, n, x, z, out) {
    let cnt = 0;
    for (let i = 0; i < src.length; i++) {
      const d = sq(src[i].x - x) + sq(src[i].z - z);
      if (cnt < n) { pickD[cnt] = d; pickI[cnt] = i; cnt++; continue; }
      let w = 0;
      for (let k = 1; k < n; k++) if (pickD[k] > pickD[w]) w = k;
      if (d < pickD[w]) { pickD[w] = d; pickI[w] = i; }
    }
    out.length = cnt;
    for (let k = 0; k < cnt; k++) out[k] = src[pickI[k]];
  }
  function refreshFx(x, z) {
    fxDirty = false; fxT = 0.3; lastFxX = x; lastFxZ = z;
    if (!active) return;
    if (cur.shaftK > 0.02) {
      const sd = U.jSunDir.value, yaw = Math.atan2(sd.x, sd.z) + Math.PI / 2, tilt = clamp(Math.atan2(Math.hypot(sd.x, sd.z), Math.max(sd.y, 0.05)), 0, 1.1);
      nearest(SHAFTS, 8, x, z, shaftList);
      for (let i = 0; i < shaftList.length; i++) { shaftList[i].yaw = yaw; shaftList[i].tilt = tilt; }
      vfx("lightShafts", shaftList, cur.shaft.getHex(), cur.shaftK);
    } else vfx("lightShafts", null);
    if (cur.mistOp > 0.02) { nearest(MISTS, 10, x, z, mistList); vfx("mistCards", mistList, cur.mist.getHex(), cur.mistOp); } else vfx("mistCards", null);
    vfx("fireflies", cur.flies > 0.5, x, z, 16, 46);
  }

  // ---- fires (fx.campfire handles; made on entry, dropped on leaving) ----
  const fireH = [null, null, null, null], fireApplied = [-1, -1, -1, -1];
  const mkFire = (i, p) => ({ x: p.x, y: p.y, z: p.z, level: 1, set(v) { this.level = clamp(+v || 0, 0, 1); return this; } });
  const fires = [mkFire(0, P.fires[0]), mkFire(1, P.fires[1]), mkFire(2, P.fires[2])], rivalFire = mkFire(3, P.rivalFire);
  const fireAll = [fires[0], fires[1], fires[2], rivalFire];
  function makeFires() {
    for (let i = 0; i < 4; i++) {
      if (fireH[i] && fireH[i].remove) fireH[i].remove();
      const f = fireAll[i];
      fireH[i] = vfx("campfire", f.x, f.y + 0.1, f.z, i === 0 ? 1.25 : 0.9) || null;
      fireApplied[i] = -1;
    }
  }
  function dropFires() { for (let i = 0; i < 4; i++) { if (fireH[i] && fireH[i].remove) fireH[i].remove(); fireH[i] = null; fireApplied[i] = -1; } }

  // ---- zones ----
  const zoneMode = { camp: null, rival: null, arena: null };
  function setZone(name, on) {
    const v = on === undefined || on === null ? null : !!on;
    if (name === "all") { for (let i = 0; i < 8; i++) ZONES[i].mode = v; zoneMode.camp = zoneMode.rival = zoneMode.arena = v; }
    else if (typeof name === "number") { if (ZONES[name]) ZONES[name].mode = v; }
    else if (name in zoneMode) zoneMode[name] = v;
  }
  const rectD2 = (Z, x, z) => { const dx = x < Z.x0 ? Z.x0 - x : x > Z.x1 ? x - Z.x1 : 0, dz = z < Z.z0 ? Z.z0 - z : z > Z.z1 ? z - Z.z1 : 0; return dx * dx + dz * dz; };
  function updateZones(fx, fz, cx, cz) {
    for (let i = 0; i < 8; i++) {
      const Z = ZONES[i], v = Z.mode !== null ? Z.mode : rectD2(Z, fx, fz) < 2304 || rectD2(Z, cx, cz) < 2304;
      Z.under.visible = v; Z.mid.visible = v;
    }
    const near = (o, r) => sq(fx - o.x) + sq(fz - o.z) < r * r || sq(cx - o.x) + sq(cz - o.z) < r * r;
    campGroup.visible = zoneMode.camp !== null ? zoneMode.camp : near(CAMP, 66);
    rivalGroup.visible = zoneMode.rival !== null ? zoneMode.rival : near(RIVAL, 62);
    arenaGroup.visible = zoneMode.arena !== null ? zoneMode.arena : near(ARENA, 64);
  }

  // ---- birds: scare(x, z, radius) ----
  const Q_MAX = 16, qT = new Float32Array(Q_MAX), qX = new Float32Array(Q_MAX), qY = new Float32Array(Q_MAX), qZ = new Float32Array(Q_MAX), qDx = new Float32Array(Q_MAX), qDz = new Float32Array(Q_MAX);
  let qN = 0;
  function scare(x, z, radius) {
    radius = radius > 0 ? radius : 20;
    let n = 0;
    for (let i = 0; i < birdTrees.length && qN < Q_MAX; i++) {
      const t = birdTrees[i], dx = t.x - x, dz = t.z - z, d = Math.hypot(dx, dz);
      if (d > radius) continue;
      qT[qN] = d / 60 + Math.random() * 0.25; qX[qN] = t.x; qY[qN] = t.y; qZ[qN] = t.z; qDx[qN] = d > 0.5 ? dx / d : 0; qDz[qN] = d > 0.5 ? dz / d : 0;
      qN++; n++;
    }
    const g0 = Math.max(gridH(x, z), 0);
    for (let k = 0; k < 3; k++) vfx("leaves", x + Math.cos(k * 2.1) * 3.5, g0 + 6 + k, z + Math.sin(k * 2.1) * 3.5, 16);
    if (n) sfx("birdsFlush", Math.min(14, 4 + n * 2), 0);
    return n;
  }

  // ---- the curtain ----
  let curtainK = 0, curtainWant = 0;
  const curtain = {
    x: 4, z: 48.2,
    get opened() { return curtainWant === 1; },
    open() {
      if (curtainWant === 1) return false;
      curtainWant = 1; curtainCol.on = false; curtainSide[0].on = false; curtainSide[1].on = false;
      vfx("leaves", 4, curtainY - 2.2, 48.2, 14);
      return true;
    },
    close() { curtainWant = 0; curtainK = 0; curtainCol.on = true; curtainSide[0].on = true; curtainSide[1].on = true; curtainPose(0); },
  };

  // ------------------------------------------------------------------------------------------------
  // Per frame
  // ------------------------------------------------------------------------------------------------
  let stepN = 0, smokeT = 0, sprayT = 0, uwSound = false;
  function lit(x, z) {
    const s = SHADE[cellOf(x, z)] / 255;
    let v = cur.litOpen + (cur.litShade - cur.litOpen) * s;
    if (cur.fireK > 0.25) {
      for (let i = 0; i < 4; i++) {
        const f = fireAll[i], d2 = sq(x - f.x) + sq(z - f.z);
        if (d2 < 36 && f.level > 0.05) { const l = 0.9 * cur.fireK * f.level * (1 - d2 / 48); if (l > v) v = l; }
      }
    }
    return v;
  }
  function update(dt, time, focusX, focusZ) {
    if (time !== undefined && time === lastT) return;      // the engine and a level may both call this
    lastT = time;
    clock += dt;
    U.jTime.value = clock;
    const pl = ctx.player, cp = ctx.camera ? ctx.camera.position : null;
    const fx = typeof focusX === "number" ? focusX : pl ? pl.x : 0, fz = typeof focusZ === "number" ? focusZ : pl ? pl.z : 0;
    const cx = cp ? cp.x : fx, cz = cp ? cp.z : fz;
    if (cp) dome.position.copy(cp);
    if (tK < 1) { tK = Math.min(1, tK + dt / Math.max(tDur, 1e-3)); applyLook(smooth(tK)); }
    updateZones(fx, fz, cx, cz);
    // fx that follow the focus
    fxT -= dt;
    if ((fxDirty && fxT <= 0) || sq(fx - lastFxX) + sq(fz - lastFxZ) > 25) refreshFx(fx, fz);
    if (active) {
      for (let i = 0; i < 4; i++) {
        const want = (i < 3 ? campGroup.visible : rivalGroup.visible) ? fireAll[i].level : 0;
        if (fireH[i] && want !== fireApplied[i]) { fireH[i].level(want); fireApplied[i] = want; }
      }
    }
    // birds queued by scare()
    for (let i = qN - 1; i >= 0; i--) {
      qT[i] -= dt;
      if (qT[i] > 0) continue;
      vfx("birds", qX[i], qY[i], qZ[i], 6, qDx[i], qDz[i]);
      vfx("leaves", qX[i] + qDx[i] * 2, qY[i] - 14, qZ[i] + qDz[i] * 2, 12);
      qN--;
      qT[i] = qT[qN]; qX[i] = qX[qN]; qY[i] = qY[qN]; qZ[i] = qZ[qN]; qDx[i] = qDx[qN]; qDz[i] = qDz[qN];
    }
    if (curtainK !== curtainWant) { curtainK = Math.min(1, curtainK + dt / 1.2); curtainPose(curtainK); }
    if (rivalTotem.falling) {
      rivalTotem.t += dt;
      const k = Math.min(rivalTotem.t / 0.85, 1);
      totemPivot.rotation.x = k * k * 1.47;
      if (k >= 1) {
        rivalTotem.falling = false; rivalTotem.fallen = true; rivalTotemCol.on = false;
        thornPose(true);
        vfx("footDust", P.rivalBreach.x, P.rivalBreach.y + 0.2, P.rivalBreach.z, 1.6);
        vfx("leaves", P.rivalBreach.x, P.rivalBreach.y + 1, P.rivalBreach.z, 18, 0x5c4a3a);
        if (rivalTotem.onFall) rivalTotem.onFall();
      }
    }
    if (wreck.smoking && active) { smokeT -= dt; if (smokeT <= 0) { smokeT = 0.5; if (sq(cx - wreck.smokeAt.x) + sq(cz - wreck.smokeAt.z) < 4900) vfx("smoke", wreck.smokeAt.x, wreck.smokeAt.y, wreck.smokeAt.z, 0.9, 5); } }
    if (active) {
      sprayT -= dt;
      if (sprayT <= 0) { sprayT = 0.55 + Math.random() * 0.4; if (sq(cx + 50) + sq(cz - 4) < 1600) vfx("splash", -49.9 + Math.random() * 0.8, 0, 2 + Math.random() * 4, 0.2); }
      if (pl && !pl.hidden && !pl.scripted) {
        if (pl.swimming && !pl.diving && pl.speed > 0.4) { const w = waterLevel(pl.x, pl.z); if (w !== -Infinity) vfx("wake", pl.x, pl.z, w, clamp(pl.speed / 3.4, 0.2, 1)); }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------
  // The world
  // ------------------------------------------------------------------------------------------------
  function confine(o, r) {
    r = r || 0;
    const a = MINX + 0.6 + r, b = MAXX - 0.6 - r, c = MINZ + 0.6 + r, d = MAXZ - 0.6 - r;
    if (o.x < a) o.x = a; else if (o.x > b) o.x = b;
    if (o.z < c) o.z = c; else if (o.z > d) o.z = d;
  }
  const world = {
    name: "jungle", group, swim: true, maxStep: 0.5, time: "day",
    heightAt, waterAt, depthAt, surfaceAt, sight, hidden, lit, shadeAt,
    colliders, cover, coverPoints, confine,
    camBounds: { minX: -65, maxX: 65, minZ: -55, maxZ: 96, maxY: 38 },
    env: ENV.day, ENV, LOOK,
    P, routes, arena, wreck, curtain, fires, rivalFire, rivalTotem,
    trail: P.trail, fig: P.fig, log: { x: LOG.x, z: LOG.z, yaw: LOG.yaw, len: LOG.len, r: LOG.r, a: P.logIn, b: P.logOut, inside: inLog },
    camp: { x: CAMP.x, y: CAMP.y, z: CAMP.z, r: CAMP.r, spots: P.spots, fire: P.fire, burrows: P.burrows },
    rival: { x: RIVAL.x, y: RIVAL.y, z: RIVAL.z, r: RIVAL.r }, field: { x: FIELD.x, z: FIELD.z, r: FIELD.r },
    spots: P.spots, matSpots: P.matSpots, grass: GRASS, ferns: FERNS, ambush: P.ambush, birdTrees, stones: STONES, bridge: BR,
    setTime, setZone, scare, update,
    riverZ, riverHalf, creekX,
    setFarGlow(v) { domeU.uLair.value = clamp(+v || 0, 0, 1); },
    onFootstep(wx, wz, strength, footIndex, wet, pan) {
      const s = surfaceAt(wx, wz);
      stepN++;
      if (wet || s === "water") {
        sfx("step", "water", strength, pan);
        if (stepN % 2 === 0) { const w = waterLevel(wx, wz); if (w !== -Infinity) vfx("splash", wx, w, wz, 0.07 + 0.1 * strength); }
        return;
      }
      sfx("step", s, strength, pan);
      if (s === "dirt" || s === "mud") { if (footIndex < 2 || strength > 0.7) vfx("footDust", wx, heightAt(wx, wz) + 0.02, wz, strength * 0.45, s === "mud" ? 0x4a3a28 : 0x9c8c72); }
      else if (s === "leaves" && strength > 0.8 && stepN % 3 === 0) vfx("leaves", wx, heightAt(wx, wz) + 0.1, wz, 2, 0x6b5a30);
    },
    onJump(x, z, floorY) {
      const w = waterAt(x, z);
      if (w !== -Infinity) vfx("splash", x, w, z, 0.25);
      else vfx("footDust", x, floorY + 0.03, z, 0.5);
    },
    onLand(x, z, floorY, impact, wet) {
      const w = waterAt(x, z);
      if (wet || w !== -Infinity) { sfx("splash", 0.3 + 0.6 * impact); vfx("splash", x, w !== -Infinity ? w : floorY, z, 0.3 + 0.6 * impact); return; }
      const s = surfaceAt(x, z);
      sfx("step", s, 0.75 + 0.5 * impact, 0);
      if (s === "leaves" || s === "grass") vfx("leaves", x, floorY + 0.15, z, 3 + Math.round(4 * impact), s === "grass" ? 0x5f8a34 : 0x6b5a30);
      else vfx("footDust", x, floorY + 0.03, z, 0.3 + 0.6 * impact);
    },
    onSwim(on, x, z) {
      const w = waterLevel(x, z), y = w !== -Infinity ? w : 0;
      if (on) { sfx("splash", 0.35); vfx("splash", x, y, z, 0.35); } else sfx("step", "water", 0.6, 0);
    },
    onDive(under, x, z) {
      const w = waterLevel(x, z), y = w !== -Infinity ? w : 0;
      if (under) { sfx("diveIn"); sfx("underwater", true); uwSound = true; vfx("bubbles", x, y - 0.3, z, 8, y); vfx("splash", x, y, z, 0.3); }
      else { sfx("surface"); sfx("underwater", false); uwSound = false; vfx("splash", x, y, z, 0.45); }
    },
    // the engine re-styled the lights: follow with this world's own shaders
    onEnv(o) {
      domeU.uHor.value.copy(o.fog);
      U.jSunDir.value.copy(o.dir);
      U.jSunCol.value.copy(o.sunC).multiplyScalar(clamp(o.sun / 2, 0, 1.2));
      domeU.uSunCol.value.copy(U.jSunCol.value);
      fxDirty = true;
    },
    onEnter() { active = true; makeFires(); fxDirty = true; fxT = 0; lastFxX = 1e9; },
    onLeave() {
      active = false;
      dropFires();
      vfx("lightShafts", null); vfx("mistCards", null); vfx("fireflies", false);
      if (uwSound) { sfx("underwater", false); uwSound = false; }
    },
    // fx.clear() drops the fires, shafts and mist: call this to bring them back mid-level
    refreshFx() { if (active) { makeFires(); fxDirty = true; fxT = 0; } },
    reset() {
      curtain.close();
      rivalTotem.reset();
      arena.restore();
      wreck.setSmoke(false);
      for (let i = 0; i < 4; i++) fireAll[i].level = 1;
      setZone("all", null);
      qN = 0;
      domeU.uLair.value = 0;
      if (uwSound) { sfx("underwater", false); uwSound = false; }
      setTime("day", 0);
    },
    stats() {
      let cards = 0, midN = 0;
      for (let i = 0; i < 8; i++) { cards += ZONES[i].under.count; midN += ZONES[i].mid.count; }
      return { giants: giants.length, mids: midN, cards, rocks: rocks.length, logs: logsI.length, colliders: colliders.length, cover: cover.length, blockers: BL.length };
    },
  };
  for (const k in P) if (k.indexOf("cam") === 0 && P[k] && P[k].pos) world[k] = P[k];      // camCrash, camGlade ... also on the world itself
  world.figTree = { x: figTree.x, z: figTree.z, r: figTree.r };
  for (const k of NUM) cur[k] = LOOK.day[k];
  for (const k of COL) cur[k].set(LOOK.day[k]);
  setTime("day", 0);
  updateZones(P.wake.x, P.wake.z, P.wake.x, P.wake.z);
  return world;
}
