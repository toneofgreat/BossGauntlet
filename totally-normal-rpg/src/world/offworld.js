// offworld.js - the pocket zones far from the valley: the King's pitch-black disc, the foggy desert (looping,
// bones, ruins, the one blooming cactus), the forest trail (totem side path, boundary colliders), the forest house
// (cabin interior + clearing), the hollow desert ("a desert again": the girl's dune, half-buried pieces of the
// valley, the dark-glass arena ring) and the final arena (a floating disc of torn landscape over a white void).

const PI = Math.PI;

export async function buildOffworld(W) {
  buildKingDark(W);
  await W.yieldFrame();
  buildDesert(W);
  await W.yieldFrame();
  buildForest(W);
  buildForestHouse(W);
  await W.yieldFrame();
  buildHollowDesert(W);
  await W.yieldFrame();
  buildFinalArena(W);
}

function ringWall(z, cx, cz, r, n, hgt, y, skip) {
  const seg = (2 * PI * r) / n + 0.4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * PI * 2;
    if (skip && skip(a)) continue;
    z.colBox(cx + Math.sin(a) * r, y + hgt / 2, cz + Math.cos(a) * r, seg, hgt, 1.0, { ry: a + PI / 2, walk: false });
  }
}

function buildKingDark(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("kingDark");
  const z = Z.z;
  const CX = 2000, CZ = 0;
  const obs = K.custom("kingFloor", () => new THREE.MeshStandardMaterial({ color: "#050507", roughness: 0.5, metalness: 0.25 })); // rough: the near weapon-glow light must not streak a white beam across the lens
  z.geo(K.circleGeo(30, 64), obs, CX, 0, CZ, { layer: "flat" });
  z.cyl(obs, CX, -1.0, CZ, 30, 28, 2.0, { seg: 64, open: false });
  z.colCyl(CX, -2, CZ, 30, 2, { surface: "stone" });
  // faint etched circles (only catch the staff light)
  const etch = K.custom("kingEtch", () => new THREE.MeshStandardMaterial({ color: "#141418", roughness: 0.6, metalness: 0.2 }));
  for (const r of [8, 18, 26]) z.geo(K.ringGeo(r, r + 0.12, 64), etch, CX, 0.005, CZ, { layer: "flat" });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; z.box(etch, CX + Math.sin(a) * 13, 0.006, CZ + Math.cos(a) * 13, 0.1, 0.004, 10, { layer: "flat", ry: a }); }
  // six broken obsidian pillars near the rim
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * PI * 2 + 0.5, r = 24;
    const hh = 2 + (i % 3) * 1.6;
    z.cyl(obs, CX + Math.sin(a) * r, hh / 2, CZ + Math.cos(a) * r, 0.9, 1.1, hh, { seg: 8, col: true });
  }
  ringWall(z, CX, CZ, 29.6, 36, 8, 0);
  z.finish();
}

function buildDesert(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("desert");
  const z = Z.z, h = W.h;
  const CX = 0, CZ = -2000, R = 320;
  const rnd = W.rng(311);
  const bone = M("bone"), rockM = M("rock", { color: "#b8a68a" }), deadWood = M("bark", { color: "#8a7a66" });
  // rock formations + boulders
  for (let i = 0; i < 46; i++) {
    const a = rnd() * PI * 2, r = 40 + rnd() * R;
    const x = CX + Math.sin(a) * r, zz = CZ + Math.cos(a) * r;
    if (Math.hypot(x - 0, zz + 1700) < 18) continue;
    const s = 1.2 + rnd() * (i % 7 === 0 ? 7 : 2.4);
    P.rock(z, x, h(x, zz) - s * 0.3, zz, s, i * 3 + 1, { mat: "rock", color: "#b8a68a", sy: i % 7 === 0 ? 1.8 : 1, col: s > 2 });
  }
  // dead trees
  for (let i = 0; i < 18; i++) {
    const a = rnd() * PI * 2, r = 30 + rnd() * R;
    const x = CX + Math.sin(a) * r, zz = CZ + Math.cos(a) * r;
    z.frame(x, h(x, zz), zz, rnd() * PI * 2, () => {
      z.cyl(deadWood, 0, 1.4, 0, 0.12, 0.22, 2.8, { seg: 7, rz: 0.12, col: true });
      for (let b = 0; b < 4; b++) z.cyl(deadWood, Math.sin(b * 1.6) * 0.5, 2.4 + b * 0.3, Math.cos(b * 1.6) * 0.5, 0.03, 0.07, 1.4, { seg: 5, rz: Math.sin(b * 1.6) * 0.9, rx: Math.cos(b * 1.6) * 0.9 });
    });
  }
  // bleached skeletons + skulls
  for (let i = 0; i < 26; i++) {
    const a = rnd() * PI * 2, r = 15 + rnd() * R;
    const x = CX + Math.sin(a) * r, zz = CZ + Math.cos(a) * r;
    P.bones(z, x, h(x, zz) + 0.02, zz, 100 + i);
  }
  // a giant beast skull half-buried (landmark)
  z.frame(-60, h(-60, -1790) - 1.0, -1790, 0.7, () => {
    z.geo(K.sphereGeo(3.2, 16, 12), bone, 0, 1.6, 0, { sx: 1.4, sy: 0.9, col: false });
    z.geo(K.sphereGeo(1.0, 10, 8), K.flat("#2a2218"), 1.6, 2.2, 2.2, {});
    z.geo(K.sphereGeo(1.0, 10, 8), K.flat("#2a2218"), -1.6, 2.2, 2.2, {});
    for (const s of [-1, 1]) z.geo(K.coneGeo(0.5, 6, 8), bone, s * 3.4, 3.8, 0.8, { rz: -s * 0.9, rx: -0.3 });
    z.colCyl(0, 0, 0, 3.8, 3.5);
  });
  // ruined pillars (an old road of columns heading nowhere)
  for (let i = 0; i < 9; i++) {
    const x = 40 + i * 14, zz = -1760 - i * 9;
    const hh = 1.5 + ((i * 7) % 5) * 0.9;
    z.cyl(M("sand", { color: "#c8b48c" }), x, h(x, zz) + hh / 2 - 0.4, zz, 0.7, 0.8, hh, { seg: 10, col: true });
    if (i % 3 === 0) z.cyl(M("sand", { color: "#c8b48c" }), x + 1.6, h(x + 1.6, zz) + 0.3, zz + 0.8, 0.7, 0.7, 2.2, { seg: 10, rz: PI / 2, ry: 0.4 });
  }
  // an abandoned wagon
  P.cart(z, 25, -1745, 1.1, { y: h(25, -1745) - 0.2 });
  z.geo(K.torusGeo(0.55, 0.05, 6, 18), M("woodDark"), 27.5, h(27.5, -1742) + 0.05, -1742, { rx: PI / 2 - 0.1 });
  // standing stones around the desertBack portal (arrival)
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * PI * 2 + 0.3, r = 5.5;
    const x = 0 + Math.sin(a) * r, zz = -1696 + Math.cos(a) * r;
    if (Math.cos(a) < -0.6) continue;     // leave the way forward (-Z) open
    z.box(M("rock", { color: "#a89880" }), x, h(x, zz) + 0.9, zz, 0.7, 2.2, 0.5, { ry: a, col: true, rz: (i % 2 ? 0.08 : -0.06), tex: 1 });
  }
  // a few big saguaros near the arrival so the place reads at once (ENGINE scatters the rest)
  const cactM = M("cactus");
  const saguaro = (x, zz, s, flower) => {
    z.frame(x, h(x, zz) - 0.1, zz, x * 0.37, () => {
      const g = z;
      g.cyl(cactM, 0, 2.6 * s, 0, 0.32 * s, 0.38 * s, 5.2 * s, { seg: 12, col: true });
      g.geo(K.sphereGeo(0.32 * s, 12, 6), cactM, 0, 5.2 * s, 0, { sy: 0.8 });
      for (const sx of [-1, 1]) {
        g.cyl(cactM, sx * 0.7 * s, 2.3 * s, 0, 0.2 * s, 0.2 * s, 0.9 * s, { seg: 10, rz: PI / 2 });
        g.cyl(cactM, sx * 1.1 * s, 3.1 * s + (sx > 0 ? 0.4 : 0), 0, 0.22 * s, 0.22 * s, 1.8 * s, { seg: 10 });
        g.geo(K.sphereGeo(0.22 * s, 10, 5), cactM, sx * 1.1 * s, 4.0 * s + (sx > 0 ? 0.4 : 0), 0, { sy: 0.8 });
      }
    });
  };
  saguaro(-14, -1712, 1.1); saguaro(18, -1725, 0.9); saguaro(-30, -1760, 1.3); saguaro(42, -1690, 1.0);
  // the one blooming cactus (prop "cactusFlower", secret)
  const fx0 = 95, fz0 = -1950;
  saguaro(fx0, fz0, 1.15);
  const flower = new THREE.Group();
  {
    const pet = K.flat("#f07ab8", 0.6), core = K.flat("#ffe060", 0.5);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * PI * 2;
      const p = new THREE.Mesh(K.sphereGeo(0.14, 8, 6), pet);
      p.scale.set(0.6, 0.25, 1.3); p.position.set(Math.sin(a) * 0.15, 0, Math.cos(a) * 0.15); p.rotation.y = a;
      flower.add(p);
    }
    const c = new THREE.Mesh(K.sphereGeo(0.07, 8, 6), core); flower.add(c);
    const glow2 = new THREE.Mesh(K.sphereGeo(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: "#ff9ad0", transparent: true, opacity: 0.12, depthWrite: false }));
    flower.add(glow2);
  }
  flower.position.set(fx0, h(fx0, fz0) - 0.1 + 5.2 * 1.15 + 0.28, fz0);
  Z.root.add(flower);
  W.prop("cactusFlower", flower);
  W.point("cactusFlower", fx0, h(fx0, fz0), fz0 + 1.2);
  W.anim("desert", (dt, t) => { flower.rotation.y = Math.sin(t * 0.4) * 0.15; }, 120);
  W.sound("wind", { x: 0, y: 2, z: -1700 }, 2000);
  z.finish();
}

function buildForest(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("forest");
  const z = Z.z, h = W.h;
  const rnd = W.rng(977);
  const XE = -1735, XW = -2165;          // trail from the portal (east) to the clearing (west)
  // boundary: 12 m either side of the trail, with a notch north to the totem (x -1906..-1894, z 12..40)
  const HW = 12;
  for (let x = XE; x > XW + 20; x -= 10) {
    const x1 = Math.max(x - 10, XW + 20), cx = (x + x1) / 2, len = x - x1;
    z.colBox(cx, h(cx, -HW) + 3, -HW, len + 0.4, 10, 1, { walk: false });
    if (x1 >= -1894 || x <= -1906) z.colBox(cx, h(cx, HW) + 3, HW, len + 0.4, 10, 1, { walk: false });
  }
  // north side pieces around the notch
  z.colBox((-1894 + -1884) / 2, h(-1889, HW) + 3, HW, 10.4, 10, 1, { walk: false });
  z.colBox((-1906 + -1916) / 2, h(-1911, HW) + 3, HW, 10.4, 10, 1, { walk: false });
  // the notch corridor + totem clearing
  z.colBox(-1906.5, h(-1906, 20) + 3, 19.9, 1, 10, 16.2, { walk: false });
  z.colBox(-1893.5, h(-1894, 20) + 3, 19.9, 1, 10, 16.2, { walk: false });
  ringWall(z, -1900, 34, 9, 18, 10, h(-1900, 34) - 2, (a) => Math.cos(a) < -0.55);
  z.colBox(XE, h(XE, 0) + 3, 0, 1, 10, 2 * HW, { walk: false });
  // the clearing end is enclosed by the forest-house boundary (see buildForestHouse)
  // trail dressing: fallen logs, stumps, mossy rocks, mushrooms, ferns
  for (let i = 0; i < 40; i++) {
    const x = XE - 8 - rnd() * (XE - XW - 30), side = rnd() < 0.5 ? -1 : 1, zz = side * (3.8 + rnd() * 6.5);
    const k = i % 4;
    if (k === 0) P.log(z, x, h(x, zz), zz, 3 + rnd() * 3, 0.25 + rnd() * 0.15, rnd() * PI, { col: false });
    else if (k === 1) P.stump(z, x, zz, 0.3 + rnd() * 0.3, { y: h(x, zz) - 0.05 });
    else P.rock(z, x, h(x, zz) - 0.2, zz, 0.5 + rnd() * 0.9, i + 300, { color: "#5e6a52" });
  }
  const fern = K.coneGeo(0.5, 0.55, 5), fernM = M("leaves", { color: "#3a5a2a" });
  for (let i = 0; i < 300; i++) {
    const x = XE - rnd() * (XE - XW), side = rnd() < 0.5 ? -1 : 1, zz = side * (3.2 + rnd() * 8.5);
    z.inst(fern, fernM, x, h(x, zz) + 0.2, zz, { layer: "small", sy: 0.6 + rnd() * 0.6, sx: 0.8 + rnd() * 0.6, sz: 0.8 + rnd() * 0.6, ry: rnd() * 6 });
  }
  const capM = K.flat("#a83a2a", 0.6), stemM = K.flat("#e8e0d0", 0.8);
  for (let i = 0; i < 70; i++) {
    const x = XE - rnd() * (XE - XW), side = rnd() < 0.5 ? -1 : 1, zz = side * (2.8 + rnd() * 6);
    const y = h(x, zz);
    z.inst(K.cylGeo(0.02, 0.025, 0.1, 5), stemM, x, y + 0.05, zz, { layer: "small" });
    z.inst(K.sphereGeo(0.06, 6, 4), capM, x, y + 0.1, zz, { layer: "small", sy: 0.5 });
  }
  // a hunter's stand, an old signpost, a lantern post at the start
  P.signpost(z, -1752, 3.4, -PI / 2, ["<- the house", "(don't)"], { w: 1.3, y: h(-1752, 3.4) });
  z.frame(-1960, h(-1960, -9), -9, 0.3, () => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) z.cyl(M("woodDark"), sx * 0.9, 2.2, sz * 0.9, 0.08, 0.09, 4.4, { seg: 6, col: true });
    z.box(M("woodPlank", { color: "#6a5034" }), 0, 4.0, 0, 2.2, 0.12, 2.2);
    z.box(M("woodPlank", { color: "#6a5034" }), 0, 4.5, -1.05, 2.2, 0.9, 0.08);
  });
  // the whispering totem (secret) at the end of the side path
  const totem = new THREE.Group();
  {
    const tex = K.canvasTex("totemface", 128, 256, (g, w, hh) => {
      g.fillStyle = "#5a4a3a"; g.fillRect(0, 0, w, hh);
      for (let i = 0; i < 3; i++) {
        const y = 40 + i * 80;
        g.fillStyle = "#2a2018"; g.beginPath(); g.ellipse(40, y, 12, 8, 0, 0, 7); g.ellipse(88, y, 12, 8, 0, 0, 7); g.fill();
        g.fillRect(44, y + 22, 40, 10 + i * 4);
        g.strokeStyle = "#3a2e22"; g.lineWidth = 4; g.strokeRect(10, y - 30, 108, 72);
      }
    });
    const tm = K.texMat("totemM", tex, { roughness: 0.95 });
    const pole = new THREE.Mesh(K.cylGeo(0.42, 0.5, 4.2, 10), tm); pole.position.y = 2.1; pole.castShadow = true; totem.add(pole);
    const top = new THREE.Mesh(K.boxGeo(2.0, 0.25, 0.5), M("woodDark")); top.position.y = 3.7; totem.add(top);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(K.sphereGeo(0.05, 6, 4), P.eyesR); e.position.set(s * 0.16, 3.2, 0.44); e.name = "eye"; totem.add(e); }
  }
  totem.position.set(-1900, h(-1900, 32), 32);
  totem.rotation.y = PI;
  Z.root.add(totem);
  W.prop("totem", totem);
  W.point("totem", -1900, h(-1900, 30.5), 30.5);
  z.colCyl(-1900, h(-1900, 32), 32, 0.55, 4.2);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * PI * 2; P.rock(z, -1900 + Math.sin(a) * 2.6, h(-1900, 32) - 0.15, 32 + Math.cos(a) * 2.6, 0.35, i + 500, { color: "#6a6a62" }); }
  z.excludeRect(-1907, 10, -1893, 40);
  z.exclude(-1900, 33, 8);
  z.finish();
}

function buildForestHouse(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("forestHouse");
  const z = Z.z, h = W.h, fx = Z.fx;
  const CX = -2160, CZ = 0;
  const gy = h(CX, CZ);
  let H = null;
  // the cabin: frame yaw PI/2 so the door (local +Z) faces world +X at x = -2155
  z.frame(CX, gy, CZ, PI / 2, () => {
    H = P.house(z, { w: 8, d: 10, h: 2.9, roof: "tile", pitch: 34, wallMat: "woodPlank", plaster: "#5a4430", beams: true,
      interior: true, doorAngle: 0, found: 1.2, shutter: "#3a3a2a", flowers: false, roofColor: "#3a3430", floorColor: "#5e4a34", ov: 0.6 });
    const fy = H.floorY;
    // interior: dust, a candle, the rocking chair, bed, stove, shelves, rug, a table
    P.table(z, -1.4, -1.8, { y: fy, w: 1.2, d: 0.8 });
    P.chair(z, -1.4, -1.0, PI, { y: fy });
    P.candle(z, -1.2, fy + 0.79, -1.8, fx.flames);
    P.bed(z, 2.8, -3.6, PI / 2, { y: fy, blanket: "clothBlue" });
    P.shelf(z, -3.6, 1.0, PI / 2, { y: fy, seed: 31 });
    P.rug(z, 0, fy + 0.025, 0.8, 2.0, 2.6, { color: "#3a2a3a" });
    // iron stove + pipe
    z.box(M("iron", { color: "#2a2826" }), 3.0, fy + 0.45, 0.8, 0.8, 0.9, 0.7, { layer: "detail", col: true });
    z.cyl(M("iron", { color: "#2a2826" }), 3.0, fy + 2.0, 0.8, 0.09, 0.09, 2.3, { layer: "detail", seg: 8 });
    // rocking chair by the stove (static here; the lobby one is the animated prop)
    z.frame(1.6, fy, 1.8, -0.6, () => {
      const wm = M("woodPlank", { color: "#5a3e28" });
      z.box(wm, 0, 0.45, 0, 0.55, 0.05, 0.5, { layer: "detail" });
      z.box(wm, 0, 0.88, -0.27, 0.55, 0.8, 0.05, { layer: "detail", rx: -0.18 });
      for (const sx of [-0.26, 0.26]) z.geo(K.torusGeo(0.6, 0.025, 5, 16, 0.9), wm, sx, 0.6, 0, { layer: "detail", ry: PI / 2, rz: -PI / 2 - 0.45 });
    });
    // dust motes in the candle light
    const w0 = z.world(-1.2, fy + 1.1, -1.8);
    fx.motes.add(w0.x, w0.y, w0.z, 30, 0.04, 6, 1.2);
  });
  // door: closed by default (prop "forestHouseDoor"); EVENTS' interactable at forestHouseDoorOut opens it
  const door = H.door;
  const doorCol = z.colBox(-2155 + 0.14, gy + H.floorY + 1.1, CZ, 0.3, 2.2, 1.25, { walk: false });
  let open = false;
  door.userData.setOpen = (v) => {
    open = !!v;
    door.rotation.y = door.userData.closedYaw + (v ? 1.6 : 0);
    W.colEnabled(doorCol, !v);
  };
  door.userData.isOpen = () => open;
  W.prop("forestHouseDoor", door);
  W.forestDoor(door, { x: -2155, y: gy, z: CZ });
  // the zone light: candle inside
  const candle = new THREE.PointLight("#ffb060", 14, 12, 2);
  candle.position.set(CX + 1.8, gy + H.floorY + 1.2, CZ + 1.2);
  W.light("forestHouse", candle, { flicker: true, base: 14 });
  // the clearing: woodpile, chopping stump, old well, outhouse, a child's swing on a dead branch, fence
  P.woodpile(z, CX - 1, CZ + 7.2, 0, { y: gy });
  P.stump(z, -2150, 6.5, 0.45, { y: h(-2150, 6.5) });
  z.box(M("iron"), -2149.9, h(-2150, 6.5) + 0.55, 6.5, 0.2, 0.14, 0.03, { rz: 0.4 });
  z.cyl(M("woodDark"), -2150.1, h(-2150, 6.5) + 0.76, 6.5, 0.025, 0.025, 0.6, { rz: 0.4, seg: 5 });
  const wb = P.well(z, -2146, -9, { y: h(-2146, -9) });
  void wb;
  z.frame(-2170, h(-2170, -9), -9, 0.4, () => {
    z.box(M("woodPlank", { color: "#5a4430" }), 0, 1.1, 0, 1.3, 2.2, 1.3, { col: true, tex: 1.2 });
    z.box(M("roofTile", { color: "#3a3430" }), 0, 2.32, 0, 1.6, 0.08, 1.7, { rx: -0.15 });
  });
  z.frame(-2141, h(-2141, 8), 8, 0, () => {
    z.cyl(M("bark", { color: "#4a3e34" }), 0, 2.4, 0, 0.25, 0.4, 4.8, { seg: 8, col: true });
    z.cyl(M("bark", { color: "#4a3e34" }), 1.4, 4.2, 0, 0.08, 0.14, 3.0, { seg: 6, rz: -1.3 });
    for (const s of [-0.25, 0.25]) z.cyl(K.flat("#b8a070"), 2.2, 3.15, s, 0.01, 0.01, 2.1, { seg: 3 });
    z.box(M("woodPlank", { color: "#8a6a46" }), 2.2, 2.1, 0, 0.3, 0.04, 0.6);
  });
  P.fenceRun(z, -2146, 13, -2172, 13, { ground: h, broken: (i) => i === 4 || i === 7 });
  P.lantern(z, -2154.6, gy + 2.3, 1.0, fx.flames);
  // boundary: ring around the clearing, open toward the trail (east)
  ringWall(z, CX + 2, CZ, 24, 30, 10, gy - 2, (a) => Math.sin(a) > 0.95);
  W.point("forestHouseInside", CX - 2, gy + H.floorY, CZ);
  W.point("forestHouseDoorOut", -2155.9, gy + H.floorY, CZ);
  W.point("forestHouseDoorFront", -2153, h(-2153, 0), CZ);
  z.excludeRect(CX - 7, -8, CX + 7, 8);
  z.exclude(CX, CZ, 14);
  z.finish();
}

function buildHollowDesert(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("hollowDesert");
  const z = Z.z, h = W.h;
  const rnd = W.rng(4242);
  const CZ = -4150;
  // the girl's dune: a smooth lump (visual) + stepped cylinders (walkable)
  const gz = -4080, gx = 0, gyb = h(gx, gz);
  const duneG = K.latheGeo("dune", [[0, 1.05], [1.5, 0.98], [3.0, 0.75], [4.6, 0.38], [6.2, 0.08], [7.0, 0]], 24);
  z.geo(duneG, M("sand"), gx, gyb - 0.02, gz, { layer: "flat" });
  z.colCyl(gx, gyb - 1, gz, 5.2, 1.3, { surface: "sand" });
  z.colCyl(gx, gyb - 1, gz, 3.6, 1.7, { surface: "sand" });
  z.colCyl(gx, gyb - 1, gz, 1.9, 2.02, { surface: "sand" });
  W.point("girl", gx, gyb + 1.02, gz);
  // half-buried pieces of the valley
  z.frame(42, h(42, -4040) - 1.4, -4040, 0.5, () => {
    z.geo(K.prismGeo(10, 3.6, 12, 2.5), M("roofTile", { color: "#7e4433" }), 0, 0, 0, { rz: 0.18 });
    z.box(M("stoneBrick"), 3.4, 1.4, -4.0, 0.85, 4.0, 0.85, { rz: 0.18 });
    z.colBox(0, 0.9, 0, 9, 2.2, 11, { walk: true, surface: "stone" });
  });
  z.frame(-18, h(-18, -4008), -4008, 0.6, () => {
    for (const sx of [-0.85, 0.85]) z.box(M("woodDark"), sx, 0.5, 0, 0.12, 1.4, 0.12, { rz: 0.3 });
    z.box(M("woodPlank", { color: "#5e4228" }), 0.25, 0.75, 0, 1.9, 1.2, 0.07, { rz: 0.3 });
    z.geo(K.planeGeo(1.8, 1.12), K.texMat("lobbysign|TOTALLY A|NORMAL RPG?|nothing to see behind the house", K.signTex(["TOTALLY A", "NORMAL RPG?", "nothing to see behind the house"], { w: 512, h: 320 })), 0.25, 0.75, 0.04, { rz: 0.3 });
    z.colBox(0.2, 0.6, 0, 1.9, 1.2, 0.3, { ry: 0 });
  });
  for (let i = 0; i < 14; i++) {
    const x = -50 + i * 1.6, zz = -4030 - i * 0.9;
    z.box(M("woodPlank", { color: "#6e5638" }), x, h(x, zz) + 0.25, zz, 0.14, 0.7, 0.14, { rz: ((i * 7) % 5 - 2) * 0.12 });
  }
  for (let i = 0; i < 16; i++) {
    const a = rnd() * PI * 2, r = 20 + rnd() * 230;
    const x = Math.sin(a) * r, zz = CZ + Math.cos(a) * r;
    if (Math.hypot(x, zz - CZ) < 64 && i % 2) continue;
    if (i % 3 === 0) P.bones(z, x, h(x, zz) + 0.02, zz, 700 + i);
    else P.rock(z, x, h(x, zz) - 0.4, zz, 1 + rnd() * 2.5, i + 900, { color: "#d8c49a", col: true });
  }
  // the ring of dark glass (prop "glassRing"): 40 shards that rise around the arena (r 60)
  const ring = new THREE.Group(); ring.name = "glassRing";
  const gm = K.custom("darkGlass", () => new THREE.MeshStandardMaterial({ color: "#0a0a10", roughness: 0.05, metalness: 0.8, transparent: true, opacity: 0.92 }));
  const shards = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * PI * 2;
    const hh = 7 + ((i * 7) % 5) * 1.6;
    const m = new THREE.Mesh(K.boxGeo(9.6, hh, 0.6), gm);
    m.position.set(Math.sin(a) * 60, -hh, CZ + Math.cos(a) * 60);
    m.rotation.set(((i * 3) % 5 - 2) * 0.03, a + PI / 2, ((i * 5) % 7 - 3) * 0.04);
    m.userData.h = hh; m.userData.base = h(Math.sin(a) * 60, CZ + Math.cos(a) * 60);
    m.castShadow = true;
    ring.add(m); shards.push(m);
  }
  Z.root.add(ring);
  const ringCols = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * PI * 2;
    const id = z.colBox(Math.sin(a) * 60.4, shards[i].userData.base + 5, CZ + Math.cos(a) * 60.4, 9.8, 12, 1.0, { ry: a + PI / 2, walk: false });
    W.colEnabled(id, false);
    ringCols.push(id);
  }
  let ringT = 0, ringTarget = 0, ringSpeed = 0.25;
  ring.userData.setRaised = (v, dur) => {
    ringTarget = typeof v === "number" ? Math.max(0, Math.min(1, v)) : v ? 1 : 0;
    ringSpeed = dur > 0 ? 1 / dur : 1e3;
    for (const id of ringCols) W.colEnabled(id, ringTarget > 0.5);
  };
  ring.userData.raised = () => ringT;
  ring.visible = false;
  W.anim("hollowDesert", (dt) => {
    if (ringT === ringTarget) return;
    const d = ringTarget - ringT, st = ringSpeed * dt;
    ringT = Math.abs(d) <= st ? ringTarget : ringT + Math.sign(d) * st;
    ring.visible = ringT > 0.001;
    for (const m of shards) m.position.y = m.userData.base - m.userData.h * (1 - ringT) + m.userData.h * 0.5 * ringT - 0.5;
  }, 2000);
  W.prop("glassRing", ring);
  // boundary r 280 around the pocket
  ringWall(z, 0, CZ, 280, 60, 30, -10);
  W.sound("wind", { x: 0, y: 2, z: -3990 }, 2000);
  z.exclude(gx, gz, 8);
  z.finish();
}

function buildFinalArena(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("finalArena");
  const z = Z.z;
  const CX = 0, CZ = 8000, R = 70;
  const rnd = W.rng(8008);
  // the disc: grass top, torn rocky rim, inverted rock cone below
  z.geo(K.circleGeo(R, 72, 4), M("grass"), CX, 0, CZ, { layer: "flat" });
  z.geo(K.latheGeo("finalUnder", [[R, 0], [R + 1.5, -1.5], [R - 2, -6], [R * 0.75, -16], [R * 0.45, -30], [R * 0.2, -46], [0, -58]], 48), M("rock", { color: "#6e6a62" }), CX, 0, CZ, {});
  z.colCyl(CX, -4, CZ, R, 4, { surface: "grass" });
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * PI * 2 + rnd() * 0.05, r = R - 0.5 + rnd() * 1.5;
    P.rock(z, CX + Math.sin(a) * r, -0.9 - rnd() * 1.2, CZ + Math.cos(a) * r, 1.2 + rnd() * 1.6, i + 1200, { color: "#6e6a62" });
  }
  // torn patches: dirt road, cobbles, a fence line, part of the lobby house, the sign
  z.box(M("dirt"), CX + 4, 0.02, CZ + 10, 4, 0.04, 60, { layer: "flat", ry: 0.2 });
  z.geo(K.circleGeo(9, 24, 2.5), M("cobble", { color: "#8a8478" }), CX - 26, 0.03, CZ + 22, { layer: "flat" });
  P.fenceRun(z, CX + 30, CZ + 40, CX + 44, CZ + 26, { broken: (i) => i === 2 });
  z.frame(CX - 34, 0, CZ + 44, 0.7, () => {
    z.box(M("plaster", { color: "#e9e0cc" }), 0, 1.6, 0, 6, 3.2, 0.3, { col: true, rz: 0.05 });
    z.box(M("plaster", { color: "#e9e0cc" }), 2.9, 1.6, -2, 0.3, 3.2, 4, { col: true });
    z.geo(K.prismGeo(6.6, 2.4, 3.2, 2.5), M("roofTile", { color: "#7e4433" }), 0, 3.2, -1.6, { rz: 0.12 });
    P.windowUnit(z, -1.2, 1.9, 0.02, { shutter: "#4f6f84", flowers: true });
  });
  P.signpost(z, CX + 14, CZ + 54, PI + 0.3, ["TOTALLY A", "NORMAL RPG?"], { w: 1.6 });
  // rock pillars (cover from the eye beam) at r 25..45
  const pillars = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2 + 0.25, r = 24 + (i % 3) * 10;
    const x = CX + Math.sin(a) * r, zz = CZ + Math.cos(a) * r;
    const hh = 6 + (i % 4) * 2;
    z.frame(x, 0, zz, a, () => {
      for (let k = 0; k < 3; k++) P.rock(z, ((k * 7) % 3 - 1) * 0.35, k * hh / 3 - 0.6, ((k * 5) % 3 - 1) * 0.3, 1.6 - k * 0.25, i * 10 + k + 1300, { color: "#7a766e", sy: 2.0 });
    });
    z.colCyl(x, 0, zz, 1.7, hh);
    pillars.push({ x, y: 0, z: zz, r: 1.7, h: hh });
  }
  W.finalPillars = pillars;
  // dead trees + stumps
  for (let i = 0; i < 7; i++) {
    const a = rnd() * PI * 2, r = 10 + rnd() * 50;
    const x = CX + Math.sin(a) * r, zz = CZ + Math.cos(a) * r;
    if (zz < CZ - 40) continue;
    z.frame(x, 0, zz, rnd() * 6, () => {
      z.cyl(M("bark", { color: "#3e342c" }), 0, 2.0, 0, 0.14, 0.28, 4.0, { seg: 7, col: true });
      for (let b = 0; b < 4; b++) z.cyl(M("bark", { color: "#3e342c" }), Math.sin(b * 1.7) * 0.6, 3.2 + b * 0.35, Math.cos(b * 1.7) * 0.6, 0.03, 0.08, 1.8, { seg: 5, rz: Math.sin(b * 1.7) * 0.9, rx: Math.cos(b * 1.7) * 0.9 });
    });
  }
  // floating debris around the disc (slow drift)
  const debris = [];
  const dm = M("rock", { color: "#7a766e" });
  for (let i = 0; i < 26; i++) {
    const a = rnd() * PI * 2, r = R + 12 + rnd() * 70;
    const me = new THREE.Mesh(K.rockGeo(i % 7, 1), dm);
    const s = 1.2 + rnd() * 4;
    me.scale.set(s, s * 0.8, s);
    me.position.set(CX + Math.sin(a) * r, -20 + rnd() * 50, CZ + Math.cos(a) * r);
    me.userData.y0 = me.position.y; me.userData.p = rnd() * 6;
    Z.root.add(me);
    debris.push(me);
  }
  W.anim("finalArena", (dt, t) => {
    for (let i = 0; i < debris.length; i++) {
      const d = debris[i];
      d.position.y = d.userData.y0 + Math.sin(t * 0.3 + d.userData.p) * 1.5;
      d.rotation.y += dt * 0.05; d.rotation.x += dt * 0.03;
    }
  }, 4000);
  // invisible rim wall (open toward the giant, z < 7955 |x| < 26: EVENTS handles falls there)
  ringWall(z, CX, CZ, R + 0.2, 64, 3, 0, (a) => Math.cos(a) < -0.9);
  W.point("finalArrive", CX, 0, 8050);
  W.point("finalBoss", CX, 0, 7930);
  z.finish();
}
