// area2.js - Brindlewick village (8 villager homes on the ring + outer cottages, the square, the well with its
// bucket, the Village Exchange, smithy, coop, market, notice board), the Old Barn (Big Tom's rafters) and the
// guard post (walls, banners, Fydor & Myles's yard, the watchtower with Myles's letter in the top room).

import { villageHouse, VILLAGE } from "./zones.js";

const PI = Math.PI;

export async function buildArea2(W) {
  buildVillage(W);
  await W.yieldFrame();
  buildBarn(W);
  await W.yieldFrame();
  buildGuardPost(W);
}

function buildVillage(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("village");
  const z = Z.z, h = W.h, fx = Z.fx;
  const CX = VILLAGE.cx, CZ = VILLAGE.cz;
  const plasters = ["#e8dcc0", "#e2d2b0", "#efe6d2", "#d8c8a8", "#e6d6c0", "#dccfb8", "#ebe0c8", "#d6c4a2"];
  const shutters = ["#5d7a4a", "#4f6f84", "#8a4a3a", "#6a5a8a", "#3a6a6a", "#8a7a3a", "#5a4a3a", "#4a6a4a"];
  // ---------------------------------------------------------------- the eight villager homes
  for (let k = 0; k < 8; k++) {
    const H = villageHouse(k);
    const gy = Math.min(h(H.x, H.z), 0.4);
    z.frame(H.x, gy, H.z, H.yaw, () => {
      const thatch = k % 3 !== 1;
      const r = P.house(z, { w: VILLAGE.houseW, d: VILLAGE.houseD, h: 3.0, roof: thatch ? "thatch" : "tile", pitch: thatch ? 45 : 36,
        plaster: plasters[k], shutter: shutters[k], interior: true, doorAngle: 1.25 + (k % 3) * 0.1, found: 1.2,
        roofColor: thatch ? undefined : ["#8e4a33", "#7a4a3a", "#6e3e2e"][k % 3], doorX: (k % 2 ? 1.6 : -1.6) });
      if (r.chimneyTop) fx.smoke.add(r.chimneyTop.x, r.chimneyTop.y, r.chimneyTop.z, 14, 0.8, 7, 1);
      if (k === 1 && r.chimneyTop) W.point("kitten2", r.chimneyTop.x, r.chimneyTop.y - 0.1, r.chimneyTop.z);
      // simple interior (detail layer, per-house anchor)
      const fy = r.floorY;
      P.fireplace(z, 2.6, -2.6, 0, { y: fy, layer: "detail" }, fx.flames);
      P.table(z, -1.6, -0.6, { y: fy, w: 1.4, d: 0.8, ry: 0.1 * k });
      P.chair(z, -1.6, 0.15, PI, { y: fy }); P.chair(z, -1.6, -1.35, 0, { y: fy });
      P.bed(z, -3.1, -1.9, PI / 2, { y: fy, blanket: k % 2 ? "clothGreen" : "clothRed" });
      P.shelf(z, 3.6, 0.6, -PI / 2, { y: fy, seed: k + 11 });
      P.barrel(z, 3.2, 2.4, { y: fy, layer: "detail", h: 0.8, r: 0.3 });
      // pitchfork rack by the door (outside)
      const sx = (k % 2 ? 1.6 : -1.6) + (k % 2 ? -1.4 : 1.4);
      z.cyl(M("woodDark"), sx, fy + 0.9, 3.55, 0.025, 0.025, 1.8, { rz: 0.15, seg: 5 });
      z.box(M("iron", { color: "#555" }), sx + 0.13, fy + 1.82, 3.55, 0.22, 0.04, 0.03, { rz: 0.15 });
      // vegetable garden behind
      P.cropRows(z, 0, -6.2, 5.0, 3.0, 0);
      P.picket(z, -2.7, -4.55, -2.7, -7.9, { color: "#cfc6b0" }); P.picket(z, 2.7, -4.55, 2.7, -7.9, { color: "#cfc6b0" }); P.picket(z, -2.7, -7.9, 2.7, -7.9, { color: "#cfc6b0" });
      // cycle 1: eyes in the windows
      P.redEyes(z, -2.2, fy + 1.75, 3.42, 0, { r: 0.04, sp: 0.12 });
      P.redEyes(z, 2.0, fy + 1.6, -3.42, PI, { r: 0.04, sp: 0.12 });
      z.exclude(0, -1, 7.5);
    });
  }
  // tavern sign on house 6, smithy beside house 3
  {
    const H = villageHouse(6);
    z.frame(H.x, Math.min(h(H.x, H.z), 0.4), H.z, H.yaw, () => {
      z.box(M("iron", { color: "#2a2a2a" }), 2.6, 3.0, 3.9, 0.05, 0.05, 1.1);
      const t = K.signTex(["THE TIPSY", "RAT"], { w: 256, h: 192 });
      z.geo(K.planeGeo(0.8, 0.6), K.texMat("tipsyrat", t), 2.6, 2.6, 4.35, { ry: PI / 2 });
      z.geo(K.planeGeo(0.8, 0.6), K.texMat("tipsyrat", t), 2.6, 2.6, 4.35, { ry: -PI / 2 });
      P.barrel(z, -0.4, 4.4, {}); P.barrel(z, 0.4, 4.6, { h: 0.8 }); P.table(z, 1.0, 5.5, { layer: "main" }); P.bench(z, 1.0, 6.3, PI); P.bench(z, 1.0, 4.7, 0);
    });
  }
  // ---------------------------------------------------------------- outer cottages on the slopes
  const outer = [1, 2, 3, 5, 6, 7];
  for (const k of outer) {
    const a = k * (PI / 4), r = 54 + (k % 2) * 3;
    const x = CX + Math.sin(a) * r, zz = CZ + Math.cos(a) * r;
    const corners = [[-4, -3], [4, -3], [-4, 3], [4, 3]].map(([dx, dz]) => h(x + dx, zz + dz));
    const gy = Math.min(...corners);
    const drop = Math.max(...corners) - gy;
    z.frame(x, gy, zz, a + PI + (k % 2 ? 0.25 : -0.2), () => {
      const r2 = P.house(z, { w: 7 + (k % 3), d: 5.8, h: 2.8 + (k % 2) * 0.4, roof: k % 2 ? "tile" : "thatch", pitch: k % 2 ? 34 : 44,
        plaster: plasters[(k + 3) % 8], shutter: shutters[(k + 2) % 8], found: 1.5 + drop, floorY: 0.35 + drop, roofColor: k % 2 ? "#7e4433" : undefined });
      if (r2.chimneyTop) fx.smoke.add(r2.chimneyTop.x, r2.chimneyTop.y, r2.chimneyTop.z, 10, 0.8, 7, 1);
      P.woodpile(z, -4.6 - (k % 3) * 0.2, -1, PI / 2, { y: drop, w: 2.0, rows: 3 });
      P.redEyes(z, -2.0, drop + 0.35 + 1.6, 2.95, 0, { r: 0.04, sp: 0.12 });
    });
    z.exclude(x, zz, 8);
  }
  // ---------------------------------------------------------------- the square
  z.geo(K.circleGeo(15, 40, 2.5), M("cobble", { color: "#8a8478" }), CX, 0.025, CZ, { layer: "flat" });
  z.geo(K.ringGeo(15, 15.6, 40, 1), M("stoneBrick", { color: "#7a7468" }), CX, 0.04, CZ, { layer: "flat" });
  const bucket = P.well(z, CX, CZ, {});
  W.prop("wellBucket", bucket);
  P.signpost(z, -1.8, CZ - 2.4, PI, ["WELL", "do not drop things in"], { w: 1.2, h: 0.8, col: false });
  // the Village Exchange (Odo)
  {
    const ex = 12, ez = 226;
    const yaw = Math.atan2(CX - ex, CZ - ez);
    z.frame(ex, 0, ez, yaw, () => {
      P.stall(z, 0, -0.6, 0, { color: "#2c5a3a", sign: ["VILLAGE", "EXCHANGE"], goods: "mixed", seed: 4 });
      z.box(M("woodDark"), 1.9, 0.5, -0.4, 0.6, 1.0, 1.2, { col: true });
      P.crate(z, -2.4, -0.6, 0.7); P.crate(z, -2.3, 0.2, 0.55); P.barrel(z, 2.5, 0.6, { h: 0.9 });
      const board = K.signTex(["NOTHING IS FOR SALE", "EVERYTHING IS", "FOR EARNING"], { w: 512, h: 256, style: "paper" });
      z.geo(K.planeGeo(1.2, 0.6), K.texMat("exboard", board), -1.45, 1.55, 0.45, { ry: 0 });
      z.box(M("woodDark"), -1.45, 1.55, 0.42, 1.3, 0.7, 0.04);
    });
  }
  // Ilsa's bench (she sits on it), Pell's corner, notice board, market stalls, lamp posts
  P.bench(z, -9, 232, Math.atan2(9, 8));
  W.point("ilsaBench", -9, 0, 232);
  z.frame(6.8, 0, 251.2, PI + 0.5, () => {
    z.box(M("woodPlank", { color: "#7a5a3a" }), 0, 0.2, 0, 2.6, 0.4, 1.8, { col: true, surface: "wood" });
    z.cyl(M("woodPlank", { color: "#a07a4c" }), 0.8, 0.62, 0.2, 0.2, 0.2, 0.45, { seg: 8 });
    z.box(M("clothRed", { color: "#6a2a5a" }), -0.6, 0.42, -0.5, 0.8, 0.04, 0.5);   // hat on the floor for coins
  });
  z.frame(-11.5, 0, 247.5, PI + 0.9, () => {
    for (const sx of [-0.9, 0.9]) z.box(M("woodDark"), sx, 1.1, 0, 0.12, 2.2, 0.12);
    z.box(M("woodPlank", { color: "#6a4a2c" }), 0, 1.5, 0, 2.0, 1.2, 0.08, { col: true });
    z.box(M("roofTile", { color: "#6a3a2a" }), 0, 2.25, 0, 2.3, 0.06, 0.5);
    const posters = [["WANTED", "the Rat King", "(any size)"], ["LOST CAT", "very big", "answers to Tom"], ["GUARD POST", "do not challenge", "FYDOR"]];
    posters.forEach((p, i) => z.geo(K.planeGeo(0.52, 0.62), K.texMat("poster" + i, K.signTex(p, { w: 192, h: 240, style: "paper" })), -0.62 + i * 0.62, 1.5 + (i % 2) * 0.08, 0.05, { rz: (i - 1) * 0.06 }));
  });
  const stalls = [[-12.5, 228, "#a83a2a", "cheese"], [-4, 254, "#3a5aa8", "mixed"], [13, 251, "#a8883a", "mixed"]];
  stalls.forEach(([x, zz, c, goods], i) => P.stall(z, x, zz, Math.atan2(CX - x, CZ - zz), { color: c, goods, seed: 20 + i }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * PI * 2 + PI / 8 + PI / 8;
    P.lamppost(z, CX + Math.sin(a) * 30, CZ + Math.cos(a) * 30, { y: h(CX + Math.sin(a) * 30, CZ + Math.cos(a) * 30) }, fx.flames);
  }
  // carts, barrels, crates scattered around the ring road
  const r1 = W.rng(5);
  for (let i = 0; i < 16; i++) {
    const a = r1() * PI * 2, rr = 18 + r1() * 12;
    const x = CX + Math.sin(a) * rr, zz = CZ + Math.cos(a) * rr;
    if (Math.abs(x) < 4) continue;
    const t = i % 4;
    if (t === 0) P.barrel(z, x, zz, { y: h(x, zz) });
    else if (t === 1) P.crate(z, x, zz, 0.7 + r1() * 0.3, { y: h(x, zz), ry: a });
    else if (t === 2 && i % 8 === 2) P.cart(z, x, zz, a, { y: h(x, zz), load: r1() < 0.5 ? "hay" : "barrels" });
    else P.hayBale(z, x, h(x, zz), zz, a);
  }
  // washing lines between neighbouring houses
  for (const k of [0, 2, 5]) {
    const A = villageHouse(k), B = villageHouse(k + 1);
    const ax = A.x + (B.x - A.x) * 0.3, az = A.z + (B.z - A.z) * 0.3, bx = A.x + (B.x - A.x) * 0.7, bz = A.z + (B.z - A.z) * 0.7;
    const off = 1.15;
    P.washingLine(z, CX + (ax - CX) * off, CZ + (az - CZ) * off, CX + (bx - CX) * off, CZ + (bz - CZ) * off);
  }
  // smithy (open shed with anvil + forge) between houses 3 and 4
  {
    const a = VILLAGE.angle0 + 3.5 * VILLAGE.step, x = CX + Math.sin(a) * 41, zz = CZ + Math.cos(a) * 41;
    z.frame(x, h(x, zz), zz, a + PI, () => {
      for (const sx of [-2, 2]) for (const sz of [-1.6, 1.6]) z.box(M("woodDark"), sx, 1.4, sz, 0.2, 2.8, 0.2, { col: true });
      z.box(M("roofTile", { color: "#5a4a40" }), 0, 2.95, 0, 4.8, 0.12, 4.0, { rx: 0.12 });
      z.box(M("stoneBrick", { color: "#6a645a" }), 0, 0.55, -1.2, 1.8, 1.1, 1.2, { col: true });
      z.box(K.glow("#ff7a2a", 1.6), 0, 1.12, -1.2, 1.2, 0.04, 0.7, { layer: "glow" });
      z.box(M("stoneBrick", { color: "#5a544a" }), 0, 2.2, -1.5, 0.7, 1.6, 0.6);
      const w = z.world(0, 1.15, -1.2); fx.flames.add(w.x, w.y, w.z, 8, 0.4, 0.7, 1.2); fx.motes.add(w.x, w.y + 0.3, w.z, 10, 0.05, 2, 0.6);
      z.geo(K.latheGeo("anvilbase", [[0, 0], [0.3, 0], [0.18, 0.5], [0, 0.5]], 8), M("woodDark"), 1.2, 0, 0.5);
      z.box(M("iron", { color: "#3a3a3c" }), 1.2, 0.62, 0.5, 0.7, 0.24, 0.28);
      z.geo(K.coneGeo(0.12, 0.35, 6), M("iron", { color: "#3a3a3c" }), 1.72, 0.66, 0.5, { rz: -PI / 2 });
      P.weaponRack(z, -1.2, 1.4, PI);
      P.barrel(z, 1.8, -1.0, { water: true });
    });
    z.exclude(x, zz, 4);
  }
  // chicken coop + chickens (live)
  const coop = { x: -22, z: 216 };
  z.frame(coop.x, h(coop.x, coop.z), coop.z, 0.7, () => {
    z.box(M("woodPlank", { color: "#8a6a44" }), 0, 0.9, 0, 1.8, 1.0, 1.3, { col: true });
    for (const sx of [-0.8, 0.8]) for (const sz of [-0.55, 0.55]) z.box(M("woodDark"), sx, 0.2, sz, 0.08, 0.4, 0.08);
    z.box(M("roofTile", { color: "#6a3a2a" }), 0, 1.5, 0, 2.1, 0.06, 1.6, { rx: 0.2 });
    z.box(M("woodPlank"), 0.4, 0.3, 0.95, 0.35, 0.06, 1.0, { rx: -0.6 });
  });
  P.fenceRun(z, coop.x - 4, coop.z - 3, coop.x + 3, coop.z - 4, { h: 0.9, ground: h, step: 1.2 });
  P.fenceRun(z, coop.x + 3, coop.z - 4, coop.x + 4, coop.z + 3, { h: 0.9, ground: h, step: 1.2 });
  const hens = [];
  const hc = ["#e8e0d0", "#a0602a", "#3a2a22", "#e8e0d0", "#c08040", "#e8d8b8"];
  for (let i = 0; i < 6; i++) {
    const c = P.chicken(hc[i]);
    c.userData.home = { x: coop.x + (i % 3) * 1.4 - 1.5, z: coop.z + ((i / 3) | 0) * 1.6 - 0.4 };
    c.userData.p = i * 2.3;
    c.position.set(c.userData.home.x, h(c.userData.home.x, c.userData.home.z), c.userData.home.z);
    Z.root.add(c);
    hens.push(c);
  }
  W.anim("village", (dt, t) => {
    for (let i = 0; i < hens.length; i++) {
      const c = hens[i], u = c.userData, a = t * 0.25 + u.p;
      c.position.x = u.home.x + Math.sin(a) * 1.2;
      c.position.z = u.home.z + Math.sin(a * 1.7) * 0.9;
      c.rotation.y = Math.atan2(Math.cos(a) * 1.2, Math.cos(a * 1.7) * 1.53);
      const peck = Math.max(0, Math.sin(t * 3.1 + u.p * 3));
      u.head.position.y = 0.48 - peck * 0.12;
      u.head.position.z = 0.13 + peck * 0.06;
    }
  }, 90);
  // village name stone at the south entrance
  z.frame(4.2, h(4.2, 192), 192, -0.3, () => {
    // a rough standing stone (irregular rock body + a dressed face for the lettering), sunk into a few boulders
    P.rock(z, 0, 0, 0.3, 1.05, 3, { color: "#9a968a", sx: 0.75, sy: 1.15, sz: 0.3, col: true });
    z.box(M("rock", { color: "#a29e92" }), 0, 0.62, -0.13, 1.28, 0.86, 0.12, { tex: 1 });
    P.rock(z, -0.75, 0, 0.1, 0.35, 5, { color: "#8a867a" }); P.rock(z, 0.7, 0, -0.05, 0.28, 6, { color: "#8a867a" });
    z.geo(K.planeGeo(1.2, 0.8), K.texMat("brindle2", K.signTex(["BRINDLEWICK", "pop. 9"], { w: 256, h: 170, style: "stone" })), 0, 0.62, -0.195, { ry: PI });
  });
  z.excludeRect(-16, 224, 16, 256);
  z.finish();
}

function buildBarn(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("barn");
  const z = Z.z, h = W.h;
  const BX = -80, BZ = 236;
  // house() in a frame whose local +Z = world +X: w (local x) runs along world Z (24 m), d along X (16 m)
  let fy = 0.2;
  z.frame(BX, 0, BZ, PI / 2, () => {
    const r = P.house(z, { w: 24, d: 16, h: 5.6, roof: "tile", pitch: 40, wallMat: "woodPlank", plaster: "#7a3a2c", interior: true,
      doorW: 4.2, doorH: 4.2, beams: true, chimney: false, windows: true, shutter: "#e8e0d0", flowers: false, found: 0.8, floorY: 0.2,
      noDoor: true, ceiling: false, roofColor: "#5a4038", floorColor: "#7a6040", ov: 0.7 });
    fy = r.floorY;
    // sliding doors pushed open along the wall
    for (const s of [-1, 1]) {
      z.box(M("woodPlank", { color: "#6a3226" }), s * 4.3, fy + 2.15, 8.25, 2.2, 4.2, 0.12);
      z.box(M("plaster", { color: "#e8e0d0" }), s * 4.3, fy + 2.15, 8.33, 2.0, 0.12, 0.02, { rz: s * 1.1 });
      z.box(M("plaster", { color: "#e8e0d0" }), s * 4.3, fy + 2.15, 8.33, 2.0, 0.12, 0.02, { rz: -s * 1.1 });
    }
    z.box(M("iron", { color: "#3a3a3a" }), 0, fy + 4.45, 8.3, 13, 0.08, 0.08);
    // rafters (tie beams across the barn at y 6) - walkable (Big Tom lives up there)
    for (let i = 0; i < 8; i++) {
      const lx = -10.5 + i * 3;
      z.box(M("woodDark"), lx, 6.1, 0, 0.3, 0.3, 15.6, { col: true, surface: "wood" });
      z.box(M("woodDark"), lx, 7.6, 0, 0.2, 3.0, 0.2);
      for (const s of [-1, 1]) z.box(M("woodDark"), lx, 6.9, s * 3.6, 0.16, 0.16, 5.0, { rx: s * 0.55 });
    }
    z.box(M("woodDark"), 0, 6.1, 0, 23.6, 0.25, 0.25);
    // hayloft deck at the far end with a ladder-ramp
    z.box(M("woodPlank", { color: "#7a5a3a" }), -9.2, 3.6, 0, 5.4, 0.2, 15.6, { col: true, surface: "wood" });
    for (let i = 0; i < 10; i++) P.hayBale(z, -10.6 + (i % 3) * 1.2, 3.7 + ((i / 6) | 0) * 0.5, -6 + ((i / 3) | 0) * 1.4 + (i % 2) * 0.3, 0.2, { col: false });
    z.ramp(-2.8, fy, 5.5, -6.6, 3.7, 5.5, 1.2, "wood");
    for (let i = 0; i < 11; i++) { const t = (i + 0.5) / 11; z.box(M("woodPlank"), -2.8 - 3.8 * t, fy + 3.5 * t, 5.5, 0.3, 0.06, 1.1); }
    for (const s of [-0.6, 0.6]) z.box(M("woodDark"), -4.7, fy + 1.8, 5.5 + s, 5.3, 0.1, 0.1, { rz: Math.atan2(3.5, 3.8) });
    // stalls along the back wall
    for (let i = 0; i < 4; i++) {
      const lx = -4 + i * 3.2;
      z.box(M("woodPlank", { color: "#6a4a30" }), lx, fy + 0.7, -5.6, 0.12, 1.4, 4.4, { col: true });
      z.box(M("straw"), lx + 1.6, fy + 0.04, -5.6, 3.0, 0.06, 4.2, { layer: "flat" });
    }
    P.cart(z, 6.5, 2.0, 0.3, { y: fy, load: "hay" });
    for (let i = 0; i < 8; i++) P.hayBale(z, 8.6 + (i % 2) * 1.2, fy + ((i / 4) | 0) * 0.5, -1 + ((i / 2) | 0) % 2 * 0.6, PI / 2);
    P.barrel(z, 10.6, 5.6, { y: fy }); P.barrel(z, 10.0, 6.4, { y: fy, h: 0.8 });
    P.weaponRack(z, -1.0, -7.4, 0, { y: fy });
  });
  // the lamp (prop "barnLamp": COMBAT/EVENTS may darken the barn) + the zone's single light
  const lamp = new THREE.Group();
  {
    const chain = new THREE.Mesh(K.cylGeo(0.01, 0.01, 1.2, 4), M("iron")); chain.position.y = 0.6; lamp.add(chain);
    const body = new THREE.Mesh(K.boxGeo(0.24, 0.32, 0.24), M("iron", { color: "#2c2a28" })); lamp.add(body);
    const glowB = new THREE.Mesh(K.boxGeo(0.18, 0.24, 0.18), K.glow("#ffcf80", 1.4)); glowB.name = "glow"; lamp.add(glowB);
  }
  lamp.position.set(BX, 4.9, BZ + 2);
  Z.root.add(lamp);
  const light = new THREE.PointLight("#ffb060", 10, 18, 2);
  light.position.set(BX, 4.6, BZ + 2);
  W.light("barn", light, { flicker: false, base: 10 });
  lamp.userData.setLit = (v) => { light.intensity = v ? 10 : 0; lamp.getObjectByName("glow").visible = !!v; lamp.userData.lit = !!v; };
  lamp.userData.lit = true;
  W.prop("barnLamp", lamp);
  // bell at the barn door (prop "barnBell")
  const bell = new THREE.Group();
  {
    const b = new THREE.Mesh(K.latheGeo("bell", [[0, 0.32], [0.08, 0.31], [0.12, 0.22], [0.14, 0.06], [0.2, 0.0], [0.18, -0.02], [0, 0.04]], 14), M("gold", { color: "#b08a3a" }));
    b.castShadow = true; b.position.y = -0.32; bell.add(b);
    const clap = new THREE.Mesh(K.sphereGeo(0.035, 6, 4), M("iron")); clap.position.y = -0.3; bell.add(clap);
  }
  z.box(M("woodDark"), -71.4, 1.6, 231.6, 0.16, 3.2, 0.16, { col: true });
  z.box(M("woodDark"), -71.4, 3.1, 231.95, 0.12, 0.12, 0.8);
  bell.position.set(-71.4, 3.04, 232.3);
  Z.root.add(bell);
  W.prop("barnBell", bell);
  W.point("barnDoor", -70.8, 0, 236);
  // Big Tom's corner: scratched beam + a too-big food bowl (only a hint)
  z.cyl(M("iron", { color: "#8a8a90" }), -86.8, fy + 0.12, 244.5, 0.6, 0.5, 0.25, { seg: 16, col: true });
  z.geo(K.planeGeo(1.2, 0.5), K.texMat("tom", K.signTex(["TOM"], { w: 256, h: 100 })), -86.8, fy + 0.15, 245.12, { rx: -0.1 });
  // outside: hay, a trough, a muddy patch
  for (let i = 0; i < 4; i++) P.hayBale(z, -70.8, h(-70.8, 240.5 + i * 0.6) + (i > 1 ? 0.5 : 0), 240.6 + (i % 2) * 0.6, 0, { col: i < 2 });
  P.haystack(z, -66, 228, 1.6, { y: h(-66, 228) });
  z.excludeRect(-90, 222, -68, 250);
  z.finish();
}

function buildGuardPost(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("guardPost");
  const z = Z.z, h = W.h, fx = Z.fx;
  const st = M("stoneBrick", { color: "#8e887c" }), stD = M("stoneBrick", { color: "#7a746a" });
  const X0 = -15, X1 = 15, Z0 = 290, Z1 = 310, T = 1.2, WH = 4.2;
  // perimeter walls with archways on the road (x -2.6..2.6)
  const wall = (cx, cz, w, d) => {
    z.box(st, cx, WH / 2 - 0.5, cz, w, WH + 1, d, { col: true, walk: false, tex: 2 });
    // crenellations
    const along = w > d ? "x" : "z", len = Math.max(w, d);
    const n = Math.floor(len / 1.2);
    for (let i = 0; i < n; i++) {
      if (i % 2) continue;
      const o = -len / 2 + 0.6 + i * 1.2;
      z.inst(K.boxGeo(0.7, 0.7, T + 0.1), stD, cx + (along === "x" ? o : 0), WH + 0.35, cz + (along === "z" ? o : 0), { ry: along === "x" ? 0 : PI / 2 });
    }
    z.box(stD, cx, WH, cz, w + 0.1, 0.15, d + 0.1);
  };
  wall((X0 - 2.6) / 2, Z0, -2.6 - X0, T); wall((X1 + 2.6) / 2, Z0, X1 - 2.6, T);
  wall((X0 - 2.6) / 2, Z1, -2.6 - X0, T); wall((X1 + 2.6) / 2, Z1, X1 - 2.6, T);
  wall(X0, (Z0 + Z1) / 2, T, Z1 - Z0 - T); wall(X1, (Z0 + Z1) / 2, T, Z1 - Z0 - T);
  for (const zz of [Z0, Z1]) {
    z.box(stD, 0, WH + 0.3, zz, 5.6, 1.4, T + 0.3);
    for (const sx of [-1, 1]) z.box(st, sx * 3.0, WH / 2, zz, 0.8, WH + 0.6, T + 0.4, { col: true });
    P.torch(z, -3.6, 2.6, zz + (zz === Z0 ? -0.7 : 0.7), zz === Z0 ? PI : 0, fx.flames);
    P.torch(z, 3.6, 2.6, zz + (zz === Z0 ? -0.7 : 0.7), zz === Z0 ? PI : 0, fx.flames);
  }
  // corner turrets (round)
  for (const [cx, cz] of [[X0, Z0], [X0, Z1], [X1, Z0]]) {
    z.cyl(st, cx, 3.0, cz, 1.6, 1.8, 7, { col: true, seg: 14, tex: 2 });
    z.cyl(stD, cx, 6.7, cz, 1.9, 1.9, 0.6, { seg: 14 });
    z.geo(K.coneGeo(2.1, 2.2, 14), M("roofTile", { color: "#5a3a34" }), cx, 8.1, cz);
  }
  // yard floor: packed dirt + flagstones on the road
  z.box(M("dirt", { color: "#7a6448" }), 0, 0.02, 300, 28.8, 0.04, 18.8, { layer: "flat", tex: 3 });
  z.box(M("cobble", { color: "#8a8478" }), 0, 0.045, 300, 5, 0.04, 20, { layer: "flat" });
  // banners on the inner walls (blue with a tower)
  for (const bx of [-10, -5.5, 5.5, 10]) {
    P.banner(z, bx, 3.9, Z0 + T / 2 + 0.05, 1.1, 2.4, "#2c4a7e", { emblem: "tower", trim: "#e8e0d0", layer: "c0" });
    P.banner(z, bx, 3.9, Z0 + T / 2 + 0.05, 1.1, 2.4, "#1a1414", { emblem: "tower", trim: "#8a2a22", torn: true, layer: "ng" });
  }
  // the guard hut (west), weapon racks, dummies, braziers, archery target, barrels
  z.frame(-10.2, 0, 303.6, PI / 2, () => {
    P.house(z, { w: 9, d: 5, h: 3.0, roof: "tile", pitch: 30, plaster: "#cfc4ae", beams: true, chimney: true, found: 0.6,
      roofColor: "#5a3a34", shutter: "#2c4a7e", flowers: false, doorAngle: 0.4 });
  });
  fx.smoke.add(-12.6, 7.2, 306.8, 8, 0.7, 7, 1);
  P.weaponRack(z, -7.4, 296.0, PI / 2); P.weaponRack(z, 7.4, 296.0, -PI / 2);
  P.dummy(z, 8.5, 300.5, -1.8); P.dummy(z, 9.8, 302.8, -2.2); P.dummy(z, -6.5, 307.2, 2.6);
  P.brazier(z, -3.4, 293.2, fx.flames); P.brazier(z, 3.4, 293.2, fx.flames);
  P.brazier(z, -3.4, 306.6, fx.flames); P.brazier(z, 3.4, 306.6, fx.flames);
  z.frame(-12.4, 0, 292.6, 0.6, () => {
    z.cyl(M("straw"), 0, 1.3, 0, 0.7, 0.7, 0.3, { rx: PI / 2, seg: 18 });
    z.cyl(M("clothWhite"), 0, 1.3, 0.16, 0.5, 0.5, 0.02, { rx: PI / 2, seg: 18 });
    z.cyl(M("clothRed"), 0, 1.3, 0.175, 0.3, 0.3, 0.02, { rx: PI / 2, seg: 18 });
    z.cyl(K.flat("#e8c840"), 0, 1.3, 0.19, 0.1, 0.1, 0.02, { rx: PI / 2, seg: 12 });
    for (const s of [-0.4, 0.4]) z.box(M("woodDark"), s, 0.6, -0.2, 0.08, 1.4, 0.08, { rx: 0.2 });
    z.colBox(0, 0.8, 0, 1.4, 1.6, 0.5);
  });
  P.barrel(z, -13.4, 298.6, {}); P.barrel(z, -13.6, 299.5, { h: 0.85 }); P.crate(z, -13.2, 300.6, 0.8);
  z.frame(4.5, 0, 308.4, 0, () => {
    z.box(M("woodPlank", { color: "#6a4e32" }), 0, 0.35, 0, 2.4, 0.7, 0.7, { col: true });
    z.box(K.flat("#2c3a3a", 0.08, 0.3), 0, 0.62, 0, 2.2, 0.04, 0.5);
  });
  // the long bench where the brothers rest
  P.bench(z, -1.0, 308.6, PI); P.bench(z, 1.0, 308.6, PI);
  // ---------------------------------------------------------------- the watchtower (inside the NE corner)
  // shell x 8.4..14.4, z 303.4..309.4; square spiral stair of 6 flights along the inner walls to the top room (y 12)
  const TX0 = 8.4, TX1 = 14.4, TZ0 = 303.4, TZ1 = 309.4, TW = 0.4, TOP = 12, TH = 12.2;
  const tcx = (TX0 + TX1) / 2, tcz = (TZ0 + TZ1) / 2;
  const door = { x0: 10.6, x1: 11.9 };
  z.box(st, tcx, TH / 2, TZ1 - TW / 2, TX1 - TX0, TH, TW, { col: true, walk: false });
  z.box(st, TX0 + TW / 2, TH / 2, tcz, TW, TH, TZ1 - TZ0 - 2 * TW, { col: true, walk: false });
  z.box(st, TX1 - TW / 2, TH / 2, tcz, TW, TH, TZ1 - TZ0 - 2 * TW, { col: true, walk: false });
  z.box(st, (TX0 + door.x0) / 2, TH / 2, TZ0 + TW / 2, door.x0 - TX0, TH, TW, { col: true, walk: false });
  z.box(st, (door.x1 + TX1) / 2, TH / 2, TZ0 + TW / 2, TX1 - door.x1, TH, TW, { col: true, walk: false });
  z.box(st, (door.x0 + door.x1) / 2, 2.3 + (TH - 2.3) / 2, TZ0 + TW / 2, door.x1 - door.x0, TH - 2.3, TW, { col: true, walk: false });
  // arrow slits (dark)
  for (let y = 3; y < 11; y += 3) for (const [x, zz, ry] of [[tcx, TZ0 - 0.01, 0], [TX0 - 0.01, tcz, PI / 2]]) z.box(K.flat("#14110e"), x, y, zz, 0.18, 0.9, 0.02, { ry });
  const IX0 = TX0 + TW, IX1 = TX1 - TW, IZ0 = TZ0 + TW, IZ1 = TZ1 - TW, SW = 1.1;
  const stairM = M("woodPlank", { color: "#7a5a3a" });
  const flights = [
    // [x0,z0,y0, x1,z1,y1]
    [IX1 - SW / 2, IZ0 + SW, 0.05, IX1 - SW / 2, IZ1 - SW, 2.15],
    [IX1 - SW, IZ1 - SW / 2, 2.15, IX0 + SW, IZ1 - SW / 2, 4.25],
    [IX0 + SW / 2, IZ1 - SW, 4.25, IX0 + SW / 2, IZ0 + SW, 6.35],
    [IX0 + SW, IZ0 + SW / 2, 6.35, IX1 - SW, IZ0 + SW / 2, 8.45],
    [IX1 - SW / 2, IZ0 + SW, 8.45, IX1 - SW / 2, IZ1 - SW, 10.55],
    [IX1 - SW, IZ1 - SW / 2, 10.55, IX0 + SW + 1.0, IZ1 - SW / 2, TOP],
  ];
  for (const [x0, z0, y0, x1, z1, y1] of flights) {
    z.ramp(x0, y0, z0, x1, y1, z1, SW, "wood");
    const len = Math.hypot(x1 - x0, z1 - z0), steps = Math.max(4, Math.round(len / 0.28));
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      z.inst(K.boxGeo(SW, 0.08, len / steps + 0.04, 1), stairM, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - 0.04, z0 + (z1 - z0) * t, { ry: yaw });
    }
    z.box(M("woodDark"), (x0 + x1) / 2, (y0 + y1) / 2 - 0.2, (z0 + z1) / 2, 0.12, 0.3, len, { ry: yaw, rx: -Math.atan2(y1 - y0, len) });
  }
  // landings (corners)
  const land = (x, zz, y) => z.box(stairM, x, y - 0.08, zz, SW, 0.16, SW, { col: true, surface: "wood" });
  land(IX1 - SW / 2, IZ0 + SW / 2, 0.0);
  land(IX1 - SW / 2, IZ1 - SW / 2, 2.15); land(IX0 + SW / 2, IZ1 - SW / 2, 4.25);
  land(IX0 + SW / 2, IZ0 + SW / 2, 6.35); land(IX1 - SW / 2, IZ0 + SW / 2, 8.45); land(IX1 - SW / 2, IZ1 - SW / 2, 10.55);
  // inner rails along the open stairwell
  for (const [x0, z0, x1, z1] of [[IX0 + SW, IZ0 + SW, IX1 - SW, IZ0 + SW], [IX1 - SW, IZ0 + SW, IX1 - SW, IZ1 - SW], [IX0 + SW, IZ1 - SW, IX1 - SW, IZ1 - SW], [IX0 + SW, IZ0 + SW, IX0 + SW, IZ1 - SW]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
    for (let y = 1.2; y < 12; y += 2.1) z.box(M("woodDark"), (x0 + x1) / 2, y + 0.9, (z0 + z1) / 2, 0.06, 0.06, len, { ry: yaw });
  }
  // top room: floor with the stair hole, parapet, posts, pyramid roof, letter on a little table
  const floorM = M("woodPlank", { color: "#7a5a3a" });
  z.box(floorM, (IX0 + IX1 - SW) / 2, TOP - 0.1, (IZ0 + IZ1 - SW) / 2, IX1 - IX0 - SW, 0.2, IZ1 - IZ0 - SW, { col: true, surface: "wood" });
  z.box(floorM, (IX0 + IX0 + SW + 1.0) / 2, TOP - 0.1, IZ1 - SW / 2, SW + 1.0, 0.2, SW, { col: true, surface: "wood" });
  z.box(stD, tcx, TOP + 0.55, TZ0 + 0.2, TX1 - TX0 + 0.4, 1.1, 0.4, { col: true, walk: false });
  z.box(stD, tcx, TOP + 0.55, TZ1 - 0.2, TX1 - TX0 + 0.4, 1.1, 0.4, { col: true, walk: false });
  z.box(stD, TX0 + 0.2, TOP + 0.55, tcz, 0.4, 1.1, TZ1 - TZ0, { col: true, walk: false });
  z.box(stD, TX1 - 0.2, TOP + 0.55, tcz, 0.4, 1.1, TZ1 - TZ0, { col: true, walk: false });
  for (const [x, zz] of [[TX0 + 0.2, TZ0 + 0.2], [TX1 - 0.2, TZ0 + 0.2], [TX0 + 0.2, TZ1 - 0.2], [TX1 - 0.2, TZ1 - 0.2]]) z.box(M("woodDark"), x, TOP + 1.8, zz, 0.25, 3.6, 0.25);
  z.geo(K.coneGeo(4.9, 2.6, 4), M("roofTile", { color: "#5a3a34" }), tcx, TOP + 4.9, tcz, { ry: PI / 4 });
  z.colBox(tcx, TOP + 3.75, tcz, TX1 - TX0, 0.3, TZ1 - TZ0);
  // rail around the stair hole up top
  z.box(M("woodDark"), IX1 - SW - 0.03, TOP + 0.9, (IZ0 + IZ1) / 2 - SW / 2, 0.06, 0.06, IZ1 - IZ0 - SW, {});
  z.colBox(IX1 - SW - 0.03, TOP + 0.5, (IZ0 + IZ1) / 2 - SW / 2, 0.12, 1.0, IZ1 - IZ0 - SW, { walk: false });
  // little table with the letter (STORY registers the interactable at point "towerLetter")
  P.table(z, 12.0, 306.0, { y: TOP, w: 0.9, d: 0.6, layer: "main", col: true });
  P.chair(z, 12.0, 305.3, 0, { y: TOP, layer: "main" });
  const letter = new THREE.Mesh(K.boxGeo(0.22, 0.004, 0.3), K.texMat("letterpaper", K.signTex(["M."], { w: 64, h: 90, style: "paper" })));
  letter.position.set(12.0, TOP + 0.79, 306.0); letter.rotation.y = 0.3; letter.castShadow = true;
  Z.root.add(letter);
  W.prop("letter", letter);
  P.candle(z, 12.3, TOP + 0.78, 306.15, fx.flames, { layer: "main" });
  W.point("towerLetter", 12.0, TOP, 306.4);
  W.point("watchtowerTop", 12.0, TOP, 306.4);
  // banner on the tower
  P.banner(z, tcx, TOP - 0.5, TZ0 - 0.02, 1.3, 3.2, "#2c4a7e", { emblem: "tower", trim: "#e8e0d0", ry: PI, layer: "c0" });
  P.banner(z, tcx, TOP - 0.5, TZ0 - 0.02, 1.3, 3.2, "#1a1414", { emblem: "tower", trim: "#8a2a22", torn: true, ry: PI, layer: "ng" });
  z.excludeRect(-17, 288, 17, 312);
  z.finish();
}
