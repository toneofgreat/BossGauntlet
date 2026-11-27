// lobby.js - the Lobby House (porch, interior, climbable roof, basement under the rug), its yard, the sign,
// the sealed spot behind the house, the old graves, the void edge and the first stretch of road (path1).

export function buildLobby(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("lobby");
  const z = Z.z, fx = Z.fx;
  const PI = Math.PI;

  // ===================================================================================== the house (12 x 10)
  const HOLE = { x: 2, z: -2.2, w: 1.6, d: 2.8 };
  const H = P.house(z, { w: 12, d: 10, h: 3.2, roof: "tile", pitch: 36, plaster: "#e9e0cc", roofColor: "#7e4433",
    interior: true, doorAngle: 1.35, found: 0.4, shutter: "#4f6f84", floorHole: HOLE, floorColor: "#7c5c3c", ov: 0.55 });
  const fy = H.floorY;
  // climbable roof (kitten #1 on the ridge): two walkable ramps
  const eave = 5 + 0.55;
  z.ramp(0, H.eaveY + 0.2, -eave, 0, H.ridgeY + 0.2, 0, 13.1, "stone");
  z.ramp(0, H.eaveY + 0.2, eave, 0, H.ridgeY + 0.2, 0, 13.1, "stone");
  W.point("kitten0", -4, H.ridgeY + 0.42, -0.12);
  // side chimney already made by house(); smoke
  if (H.chimneyTop) fx.smoke.add(H.chimneyTop.x, H.chimneyTop.y, H.chimneyTop.z, 18, 0.9, 7, 1);

  // the climb: woodpile -> rain barrel on a stand -> back eave
  P.woodpile(z, -6.75, -4.0, PI / 2, { w: 2.4, rows: 4 });
  z.box(M("woodDark"), -7.0, 0.575, -6.15, 1.0, 1.15, 1.0, { col: true, surface: "wood" });
  for (const sx of [-0.42, 0.42]) for (const sz of [-0.42, 0.42]) z.box(M("woodDark"), -7.0 + sx, 0.55, -6.15 + sz, 0.12, 1.1, 0.12);
  P.barrel(z, -7.0, -6.15, { y: 1.15, h: 0.95, r: 0.42, water: true });
  z.cyl(M("iron", { color: "#555" }), -6.4, 2.4, -5.7, 0.05, 0.05, 1.6, { seg: 6 });   // downpipe

  // ------------------------------------------------------------------ porch (z 5..8)
  const pd = 0.3;
  z.box(M("woodPlank", { color: "#8b6a46" }), 0, pd / 2, 6.6, 12.4, pd, 3.2, { col: true, surface: "wood", tex: 1.5 });
  z.box(M("stoneBrick"), 0, 0.1, 8.55, 2.4, 0.2, 0.7, { col: true });               // steps
  z.box(M("stoneBrick"), 0, 0.05, 9.1, 2.0, 0.1, 0.5);
  const postM = M("woodDark");
  for (const px of [-6, -3.2, 3.2, 6]) {
    z.box(postM, px, pd + 1.35, 8.05, 0.2, 2.7, 0.2, { col: true, surface: "wood" });
  }
  // porch roof (lean-to)
  z.box(M("roofTile", { color: "#7e4433" }), 0, 3.15, 6.75, 13, 0.12, 3.9, { rx: 0.14, col: false });
  z.colBox(0, 3.2, 6.75, 13, 0.3, 3.9);
  z.box(postM, 0, 2.95, 8.05, 12.4, 0.2, 0.22);
  // railings with a gap for the steps
  for (const [x0, x1] of [[-6, -1.4], [1.4, 6]]) {
    const cx = (x0 + x1) / 2, w = x1 - x0;
    z.box(postM, cx, pd + 0.9, 8.05, w, 0.08, 0.1);
    z.box(postM, cx, pd + 0.2, 8.05, w, 0.06, 0.08);
    for (let x = x0 + 0.25; x < x1; x += 0.28) z.inst(K.boxGeo(0.05, 0.7, 0.05), postM, x, pd + 0.55, 8.05);
    z.colBox(cx, pd + 0.5, 8.05, w, 1.0, 0.15, { walk: false });
  }
  for (const sx of [-1, 1]) {
    z.box(postM, sx * 6.05, pd + 0.9, 6.55, 0.1, 0.08, 3.0);
    for (let q = 5.3; q < 8; q += 0.28) z.inst(K.boxGeo(0.05, 0.7, 0.05), postM, sx * 6.05, pd + 0.55, q);
    z.colBox(sx * 6.05, pd + 0.5, 6.55, 0.15, 1.0, 3.0, { walk: false });
  }
  // rocking chair (prop: EVENTS rocks it)
  const chair = new THREE.Group();
  {
    const wm = M("woodPlank", { color: "#6e4e30" });
    const add = (g, x, y, zz, rx, rz) => { const me = new THREE.Mesh(g, wm); me.position.set(x, y, zz); me.rotation.set(rx || 0, 0, rz || 0); me.castShadow = true; chair.add(me); };
    for (const sx of [-0.25, 0.25]) add(K.torusGeo(0.6, 0.025, 5, 16, 0.9), sx, 0.6, 0.0, 0, 0);
    chair.children.forEach((c) => { c.rotation.y = PI / 2; c.rotation.z = -PI / 2 - 0.45; });
    add(K.boxGeo(0.56, 0.05, 0.5), 0, 0.45, 0.0);
    add(K.boxGeo(0.56, 0.8, 0.05), 0, 0.88, -0.27, -0.18);
    for (const sx of [-0.26, 0.26]) { add(K.boxGeo(0.04, 0.45, 0.04), sx, 0.22, 0.2); add(K.boxGeo(0.04, 0.45, 0.04), sx, 0.22, -0.2); add(K.boxGeo(0.05, 0.04, 0.5), sx, 0.66, 0.0); }
    const blanket = new THREE.Mesh(K.boxGeo(0.5, 0.04, 0.6), M("clothRed", { color: "#6a3a3a" })); blanket.position.set(0, 0.49, 0.02); chair.add(blanket);
  }
  z.object(chair, -3.0, pd, 6.6, 0.35);
  chair.userData.baseRx = 0;
  W.prop("lobbyRockingChair", chair);
  z.colBox(-3.0, pd + 0.5, 6.6, 0.7, 1.0, 0.8, { walk: false });
  // porch dressing
  P.lantern(z, -1.05, pd + 2.05, 5.25, fx.flames);
  P.lantern(z, 1.05, pd + 2.05, 5.25, fx.flames);
  P.bench(z, 4.6, 5.55, 0, { y: pd });
  P.barrel(z, 5.5, 7.5, { y: pd, h: 0.8, r: 0.3 });
  z.box(M("woodPlank", { color: "#5a6a3a" }), -5.2, pd + 0.35, 5.5, 0.9, 0.7, 0.4);       // boot box
  z.box(K.flat("#3a2a1a"), -1.8, pd + 0.02, 6.4, 1.1, 0.02, 0.7);                           // doormat
  // potted plants by the steps
  for (const sx of [-1.5, 1.5]) {
    z.geo(K.latheGeo("pot", [[0, 0], [0.2, 0], [0.28, 0.4], [0.3, 0.42], [0, 0.42]], 10), M("roofTile", { color: "#a85a3a" }), sx, pd, 7.6);
    z.geo(K.sphereGeo(0.32, 8, 6), M("leaves"), sx, pd + 0.65, 7.6, { layer: "c0" });
    z.geo(K.sphereGeo(0.25, 6, 4), K.flat("#4a3a22"), sx, pd + 0.55, 7.6, { layer: "ng", sy: 0.6 });
  }

  // ------------------------------------------------------------------ interior (detail)
  const IN = { layer: "detail" };
  z.layer("detail", { hideDist: 60, anchor: { x: 0, y: 1, z: 0 } });
  P.fireplace(z, -5.45, 1.0, PI / 2, { y: fy }, fx.flames);
  P.table(z, -1.8, 1.4, { y: fy, w: 1.6, d: 0.95 });
  P.chair(z, -1.8, 2.25, PI, { y: fy }); P.chair(z, -1.8, 0.55, 0, { y: fy }); P.chair(z, -2.85, 1.4, PI / 2, { y: fy });
  P.candle(z, -1.6, fy + 0.79, 1.3, fx.flames);
  z.cyl(M("woodPlank", { color: "#c8b088" }), -2.1, fy + 0.8, 1.5, 0.13, 0.11, 0.05, { ...IN, seg: 12 });   // bowl
  z.geo(K.sphereGeo(0.05, 6, 5), K.flat("#b83a2a"), -2.12, fy + 0.86, 1.48, IN);
  P.bed(z, 4.6, -3.2, 0, { y: fy, blanket: "clothBlue" });
  P.shelf(z, -3.5, -4.55, 0, { y: fy, seed: 4 });
  P.shelf(z, 0.0, -4.55, 0, { y: fy, seed: 7 });
  // wardrobe
  z.box(M("woodDark"), 5.4, fy + 1.0, 0.8, 0.6, 2.0, 1.4, { ...IN, col: true });
  z.box(M("woodPlank", { color: "#6a4a2c" }), 5.09, fy + 1.0, 0.45, 0.02, 1.8, 0.62, IN);
  z.box(M("woodPlank", { color: "#6a4a2c" }), 5.09, fy + 1.0, 1.15, 0.02, 1.8, 0.62, IN);
  // kitchen corner
  z.box(M("woodPlank", { color: "#8a6440" }), -4.7, fy + 0.45, -3.7, 1.8, 0.9, 1.2, { ...IN, col: true });
  z.box(M("stoneBrick", { color: "#b0aaa0" }), -4.7, fy + 0.92, -3.7, 1.85, 0.05, 1.25, IN);
  P.barrel(z, -5.3, -1.9, { y: fy, h: 0.8, r: 0.3, layer: "detail" });
  for (let i = 0; i < 4; i++) z.cyl(M("iron", { color: "#3a3634" }), -5.2 + i * 0.3, fy + 1.6, -4.7, 0.11, 0.09, 0.05, { ...IN, rx: PI / 2, seg: 10 });
  // wall clock + pictures
  z.cyl(M("woodDark"), 2.8, fy + 2.2, -4.82, 0.28, 0.28, 0.05, { ...IN, rx: PI / 2, seg: 16 });
  z.cyl(K.flat("#efe6cf"), 2.8, fy + 2.2, -4.79, 0.24, 0.24, 0.02, { ...IN, rx: PI / 2, seg: 16 });
  z.box(K.flat("#1a1a1a"), 2.8, fy + 2.27, -4.77, 0.02, 0.16, 0.01, IN);
  const picTex = K.canvasTex("lobbyPic", 128, 96, (g, w, h) => {
    const sky = g.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#9ec4e8"); sky.addColorStop(1, "#f0e0b0"); g.fillStyle = sky; g.fillRect(0, 0, w, h);
    g.fillStyle = "#5a8a3a"; g.beginPath(); g.moveTo(0, 70); g.quadraticCurveTo(40, 50, 80, 66); g.quadraticCurveTo(110, 74, 128, 60); g.lineTo(128, 96); g.lineTo(0, 96); g.fill();
    g.fillStyle = "#8a8070"; g.fillRect(84, 34, 18, 30); g.fillRect(80, 28, 6, 8); g.fillRect(100, 28, 6, 8); g.fillRect(90, 28, 6, 8);
  });
  z.box(M("woodDark"), 5.83, fy + 1.9, -2.0, 0.04, 0.6, 0.8, IN);
  z.geo(K.planeGeo(0.7, 0.5), K.texMat("lobbyPic", picTex), 5.8, fy + 1.9, -2.0, { ...IN, ry: -PI / 2 });
  // interior hanging lamp + the one zone light (fireplace glow)
  P.lantern(z, 0.5, fy + 2.55, 0.8, fx.flames, { layer: "detail" });
  const fireLight = new THREE.PointLight("#ff9a4a", 6, 9, 2);
  z.object(fireLight, -4.6, fy + 0.8, 1.0);
  fireLight.castShadow = false;
  W.light("lobby", fireLight, { flicker: true, base: 6 });

  // rug + trapdoor over the basement hatch
  const rugMesh = P.rug(z, HOLE.x, fy + 0.025, HOLE.z, 2.3, 3.4, { color: "#7a2a22" });
  rugMesh.userData.home = rugMesh.position.clone();
  W.prop("lobbyRug", rugMesh);
  const trap = new THREE.Group();
  const leafM = M("woodPlank", { color: "#6a4a2c" });
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(s * HOLE.w / 2, 0, 0);
    const leaf = new THREE.Mesh(K.boxGeo(HOLE.w / 2, 0.05, HOLE.d), leafM);
    leaf.position.set(-s * HOLE.w / 4, 0, 0);
    leaf.castShadow = true; leaf.receiveShadow = true;
    const ring = new THREE.Mesh(K.torusGeo(0.06, 0.012, 4, 10), M("iron"));
    ring.rotation.x = PI / 2; ring.position.set(-s * (HOLE.w / 2 - 0.1), 0.03, 0);
    leaf.add(ring);
    hinge.add(leaf);
    hinge.userData.side = s;
    trap.add(hinge);
  }
  z.object(trap, HOLE.x, fy + 0.0, HOLE.z, 0);
  const trapCol = z.colBox(HOLE.x, fy - 0.03, HOLE.z, HOLE.w, 0.06, HOLE.d, { surface: "wood" });
  let trapOpen = 0;
  trap.userData.setOpen = (v) => {
    trapOpen = v ? 1 : 0;
    trap.children.forEach((hg) => { hg.rotation.z = hg.userData.side * (v ? 1.75 : 0); });
    W.colEnabled(trapCol, !v);
  };
  trap.userData.isOpen = () => trapOpen > 0;
  W.prop("trapdoor", trap);
  // keeps the collider in sync if someone animates the leaves directly
  W.watch(() => {
    const a = Math.abs(trap.children[0].rotation.z);
    const open = a > 0.35;
    if (open !== (trapOpen > 0)) { trapOpen = open ? 1 : 0; W.colEnabled(trapCol, !open); }
  });

  // ------------------------------------------------------------------ basement (under terrain)
  const BL = z.layer("cave", { cast: false, receive: true, renderOrder: 11, hideDist: 40, anchor: { x: 2, y: -2, z: -3 } });
  void BL;
  const C = { layer: "cave" };
  const bst = K.flat("#5e5850", 0.95), bfl = K.flat("#4a443c", 1);
  const bx0 = -1.0, bx1 = 5.0, bz0 = -7.5, bz1 = 0.0, by0 = -3.2, by1 = -0.4;
  const bcx = (bx0 + bx1) / 2, bcz = (bz0 + bz1) / 2, bh = by1 - by0;
  z.box(bfl, bcx, by0 - 0.1, bcz, bx1 - bx0, 0.2, bz1 - bz0, { ...C, col: true, surface: "stone" });
  z.box(bst, bx0 - 0.15, by0 + bh / 2, bcz, 0.3, bh, bz1 - bz0, { ...C, col: true, tex: 1.5 });
  z.box(bst, bx1 + 0.15, by0 + bh / 2, bcz, 0.3, bh, bz1 - bz0, { ...C, col: true, tex: 1.5 });
  z.box(bst, bcx, by0 + bh / 2, bz0 - 0.15, bx1 - bx0, bh, 0.3, { ...C, col: true, tex: 1.5 });
  z.box(bst, bcx, by0 + bh / 2, bz1 + 0.15, bx1 - bx0, bh, 0.3, { ...C, col: true, tex: 1.5 });
  // ceiling beams + boards (with the hatch opening)
  for (const [x0, z0, x1, z1] of P.holeRects(bx0, bz0, bx1, bz1, HOLE)) {
    z.box(M("woodDark"), (x0 + x1) / 2, by1 + 0.05, (z0 + z1) / 2, x1 - x0, 0.1, z1 - z0, C);
  }
  for (let x = bx0 + 0.6; x < bx1; x += 1.2) z.box(M("woodDark"), x, by1 - 0.08, bcz, 0.16, 0.18, bz1 - bz0, C);
  // shaft walls of the hatch (drawn after the depth punch)
  const sh = 0.35 - by1;
  z.box(bst, HOLE.x - HOLE.w / 2 - 0.05, by1 + sh / 2, HOLE.z, 0.1, sh, HOLE.d, C);
  z.box(bst, HOLE.x + HOLE.w / 2 + 0.05, by1 + sh / 2, HOLE.z, 0.1, sh, HOLE.d, C);
  z.box(bst, HOLE.x, by1 + sh / 2, HOLE.z - HOLE.d / 2 - 0.05, HOLE.w, sh, 0.1, C);
  z.box(bst, HOLE.x, by1 + sh / 2, HOLE.z + HOLE.d / 2 + 0.05, HOLE.w, sh, 0.1, C);
  // stairs down (-z), ramp collider + visual steps
  const st0 = { y: 0.1, z: -0.85 }, st1 = { y: by0, z: -4.65 };
  z.ramp(HOLE.x, st0.y, st0.z, HOLE.x, st1.y, st1.z, 1.5, "wood");
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) / steps;
    const sy = st0.y + (st1.y - st0.y) * t, sz = st0.z + (st1.z - st0.z) * t;
    z.box(M("woodPlank", { color: "#6a4e32" }), HOLE.x, sy - 0.04, sz, 1.4, 0.06, 0.34, C);
  }
  for (const sx of [-0.72, 0.72]) {
    const L = Math.hypot(st0.y - st1.y, st0.z - st1.z);
    z.box(M("woodDark"), HOLE.x + sx, (st0.y + st1.y) / 2 - 0.12, (st0.z + st1.z) / 2, 0.08, 0.22, L, { ...C, rx: Math.atan2(st0.y - st1.y, st0.z - st1.z) });
  }
  // the chalk drawing of the Hollow on the back wall
  const chalk = K.canvasTex("chalk", 512, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.strokeStyle = "rgba(235,235,228,0.85)"; g.lineCap = "round"; g.lineJoin = "round";
    const wob = (x, y, i) => [x + Math.sin(i * 7.3) * 1.5, y + Math.cos(i * 5.1) * 1.5];
    const line = (pts, wdt) => { g.lineWidth = wdt; g.beginPath(); pts.forEach((p, i) => { const q = wob(p[0], p[1], i); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }); g.stroke(); };
    // ground + little house
    line([[20, 330], [490, 335]], 3);
    line([[60, 330], [60, 280], [100, 250], [140, 280], [140, 330]], 3);
    line([[90, 330], [90, 300], [110, 300], [110, 330]], 2);
    // the tall thing behind it
    line([[300, 330], [305, 200], [300, 120]], 5); line([[330, 330], [326, 200], [332, 120]], 5);
    line([[300, 120], [316, 100], [332, 120]], 4);
    line([[302, 140], [250, 220], [215, 300], [205, 345]], 4); line([[330, 140], [380, 230], [420, 310], [430, 350]], 4);
    g.fillStyle = "rgba(240,240,232,0.9)"; g.beginPath(); g.ellipse(316, 85, 20, 26, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1a1714"; g.beginPath(); g.arc(309, 82, 2.5, 0, 7); g.arc(323, 82, 2.5, 0, 7); g.fill();
    // a small figure with a crown, arm out (the first King)
    line([[180, 330], [180, 300]], 3); line([[180, 300], [170, 330]], 2); line([[180, 305], [205, 295], [240, 290]], 3);
    line([[172, 288], [175, 280], [180, 286], [185, 280], [188, 288]], 2);
    g.beginPath(); g.lineWidth = 2.5; g.arc(180, 293, 7, 0, 7); g.stroke();
    // tally marks + scrawl
    for (let i = 0; i < 17; i++) line([[30 + i * 9, 40], [30 + i * 9 + (i % 5 === 4 ? -36 : 0), 75]], 2);
    g.font = "italic 26px Georgia, serif"; g.fillStyle = "rgba(235,235,228,0.8)";
    g.fillText("keep it behind the house", 150, 190);
  });
  const chalkM = K.custom("chalkM", () => new THREE.MeshStandardMaterial({ map: chalk, transparent: true, roughness: 1, depthWrite: false }));
  const chalkMesh = z.mesh(K.planeGeo(3.6, 2.7), chalkM, 2.0, by0 + 1.45, bz0 + 0.02, { ry: 0 });
  chalkMesh.renderOrder = 12;
  chalkMesh.userData.layer = "cave";
  W.addToLayer(z.layer("cave").group, chalkMesh);
  // a stub of candle and an old chest
  P.candle(z, 0.2, by0, -6.8, fx.flames, { layer: "cave" });
  z.box(M("woodDark"), 4.2, by0 + 0.3, -6.7, 1.0, 0.6, 0.6, { ...C, col: true });
  z.box(M("iron", { color: "#4a4440" }), 4.2, by0 + 0.62, -6.7, 1.02, 0.05, 0.62, C);
  // the punch (lets you see down into the hatch) + a shadow lid over the room
  const pm = z.punch(K.planeGeo(HOLE.w, HOLE.d), HOLE.x, 0.34, HOLE.z, { rx: -PI / 2 });
  W.punch(pm, (cam) => cam.y > 0.36 && Math.abs(cam.x - 2) < 30 && Math.abs(cam.z + 2) < 30);
  z.shadowLid(bcx, -0.2, bcz - 0.5, bx1 - bx0 + 7, 0.3, bz1 - bz0 + 7);
  W.point("basement", 2, by0, -5.6);

  // ===================================================================================== the yard
  // flagstone path to the road
  const flag = M("stoneBrick", { color: "#a09a8e" });
  // laid as a stepping-stone path: start clear of the porch step (z 9.35), small alternating offsets/turns
  for (let i = 0; i < 7; i++) z.box(flag, (i % 2 ? 0.12 : -0.1), 0.035, 10.0 + i * 0.72, 0.95 + (i % 3) * 0.08, 0.07, 0.58, { layer: "flat", ry: (i % 2 ? 0.06 : -0.05) + (i % 3) * 0.02 });
  // the Totally Normal sign (npc "sign")
  const signG = new THREE.Group();
  const mkSignFace = (lines) => K.texMat("lobbysign|" + lines.join("|"), K.signTex(lines, { w: 512, h: 320 }));
  const faceA = mkSignFace(["TOTALLY A", "NORMAL RPG", "nothing to see behind the house"]);
  const faceB = mkSignFace(["TOTALLY A", "NORMAL RPG?", "nothing to see behind the house"]);
  {
    const wm = M("woodDark");
    for (const sx of [-0.85, 0.85]) { const p = new THREE.Mesh(K.boxGeo(0.12, 2.3, 0.12), wm); p.position.set(sx, 1.15, -0.05); p.castShadow = true; signG.add(p); }
    const back = new THREE.Mesh(K.boxGeo(1.9, 1.2, 0.07), M("woodPlank", { color: "#5e4228" })); back.position.set(0, 1.7, -0.05); back.castShadow = true; signG.add(back);
    const face = new THREE.Mesh(K.planeGeo(1.8, 1.12), faceA); face.position.set(0, 1.7, -0.01); face.name = "face"; signG.add(face);
    const roofb = new THREE.Mesh(K.boxGeo(2.1, 0.06, 0.35), M("roofTile", { color: "#7e4433" })); roofb.position.set(0, 2.38, -0.05); signG.add(roofb);
  }
  z.object(signG, 3.5, 0, 12, -0.35);
  z.colBox(3.5, 1.1, 12, 2.0, 2.2, 0.3, { ry: -0.35 });
  signG.userData.setCycle = (c) => { signG.getObjectByName("face").material = c >= 1 ? faceB : faceA; signG.rotation.z = c >= 1 ? 0.07 : 0; };
  W.signObject(signG);

  // vegetable garden (east) with a little picket fence
  P.cropRows(z, 11.5, 1.0, 5.6, 6.0, 0);
  P.picket(z, 8.4, -2.3, 14.6, -2.3); P.picket(z, 14.6, -2.3, 14.6, 4.3); P.picket(z, 8.4, 4.3, 12.6, 4.3); P.picket(z, 8.4, -2.3, 8.4, 4.3);
  P.scarecrow(z, 13.0, 2.6, -0.6);
  // tool shed
  z.frame(10.5, 0, -9.5, 0.2, () => {
    const sh2 = P.house(z, { w: 3.2, d: 2.6, h: 2.3, roof: "tile", pitch: 30, plaster: "#8a6a4a", beams: false, chimney: false,
      windows: false, found: 0.6, doorAngle: 0.3, floorY: 0.2, roofColor: "#5a4a3a" });
    void sh2;
  });
  P.crate(z, 12.6, -8.0, 0.7); P.crate(z, 12.9, -8.9, 0.55, { y: 0 }); P.barrel(z, 8.7, -8.2);
  // clothesline + bench + mailbox
  P.washingLine(z, -9, 6, -16, 3);
  P.bench(z, -10.5, 11.5, PI * 0.85);
  // mailbox: square post + brace, rounded-top steel box, front door with a latch, red flag
  {
    const wd = M("woodDark"), mb = M("iron", { color: "#4a5a6a" }), mbD = M("iron", { color: "#2e3a46" });
    z.box(wd, -1.6, 0.55, 12.6, 0.1, 1.1, 0.1);
    z.box(wd, -1.6, 1.06, 12.6, 0.16, 0.05, 0.5);
    z.box(mb, -1.6, 1.17, 12.6, 0.26, 0.18, 0.46);
    z.cyl(mb, -1.6, 1.26, 12.6, 0.13, 0.13, 0.46, { rx: PI / 2, seg: 14 });
    z.box(mbD, -1.6, 1.2, 12.84, 0.25, 0.26, 0.015);
    z.box(K.flat("#c9c2b0", 0.4), -1.6, 1.24, 12.855, 0.05, 0.02, 0.02);
    z.box(K.flat("#b0201c", 0.6), -1.45, 1.36, 12.55, 0.015, 0.06, 0.16);
    z.box(K.flat("#b0201c", 0.6), -1.45, 1.28, 12.48, 0.015, 0.2, 0.03);
  }
  P.lamppost(z, 1.8, 13.8, {}, fx.flames);
  // outhouse
  z.frame(-14, 0, -10, 0.6, () => {
    z.box(M("woodPlank", { color: "#7a5a3a" }), 0, 1.1, 0, 1.3, 2.2, 1.3, { col: true, tex: 1.2 });
    z.box(M("roofTile", { color: "#5a4a3a" }), 0, 2.32, 0, 1.6, 0.08, 1.7, { rx: -0.15 });
    z.box(K.flat("#1a1410"), 0, 1.9, 0.66, 0.12, 0.2, 0.02);
  });
  P.woodpile(z, -12, -2, 0.1, { w: 2.0, rows: 3 });
  P.stump(z, -10.5, -0.5, 0.42);
  z.cyl(M("woodDark"), -10.5, 0.75, -0.5, 0.025, 0.025, 0.6, { rz: 0.5, seg: 5 });    // axe handle
  z.box(M("iron"), -10.38, 0.53, -0.5, 0.2, 0.12, 0.03, { rz: 0.5 });
  // flower beds in front of the porch
  for (const sx of [-1, 1]) {
    z.box(M("dirt", { color: "#4e3a26" }), sx * 4.0, 0.08, 9.0, 3.2, 0.16, 0.9, { layer: "flat" });
    for (let i = 0; i < 12; i++) {
      const fx2 = sx * 4.0 - 1.4 + (i % 6) * 0.55, fz = 8.8 + ((i / 6) | 0) * 0.4;
      z.geo(K.sphereGeo(0.12, 6, 4), M("leaves", { color: "#4f7a32" }), fx2, 0.25, fz, { layer: "c0" });
      z.geo(K.sphereGeo(0.06, 6, 4), K.flat(["#e8443a", "#f4d040", "#f0f0f0", "#d070c0"][i % 4]), fx2 + 0.03, 0.38, fz, { layer: "c0" });
      z.box(K.flat("#4a3a26"), fx2, 0.24, fz, 0.03, 0.2, 0.03, { layer: "ng", rz: 0.6 });
    }
  }
  // stone circle behind the house: where the first King sealed the way (portal lobbyBack at (0,0,-12))
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * PI * 2 + 0.2;
    const r = 3.6, sx = Math.sin(a) * r, sz = -12 + Math.cos(a) * r;
    if (Math.abs(sx) < 1.2 && sz > -12) continue;    // leave the approach open
    z.frame(sx, 0, sz, a, () => {
      const hh = 1.1 + (i % 3) * 0.35;
      z.box(M("rock", { color: "#8a8a84" }), 0, hh / 2, 0, 0.6, hh, 0.35, { col: true, rz: (i % 2 ? 0.06 : -0.05), tex: 1 });
      z.box(K.glow("#c0141c", 1.6), 0, hh * 0.55, 0.18, 0.05, hh * 0.5, 0.01, { layer: "ngGlow" });
    });
  }
  z.box(M("rust"), 0.0, 0.6, -12.0, 0.08, 1.2, 0.08, { rz: 0.08, layer: "c0" });                 // the old iron stake
  z.geo(K.circleGeo(2.4, 24, 2), M("dirt", { color: "#5a4a3a" }), 0, 0.02, -12, { layer: "flat" });
  z.exclude(0, -12, 5);
  z.excludeRect(-7.5, -6.5, 7.5, 9.8);
  z.excludeRect(-1.5, 8, 1.5, 14);
  z.exclude(11.5, 1.0, 4.5);
  z.exclude(10.5, -9.5, 3);
  z.exclude(-14, -10, 2);
  z.exclude(-12, -2, 2.2);
  z.finish();

  // ===================================================================================== the old graves
  buildGraves(W);
  // ===================================================================================== the void edge
  buildVoidEdge(W);
  // ===================================================================================== path1
  buildPath1(W);
}

function buildGraves(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("graves");
  const z = Z.z;
  const PI = Math.PI;
  // low stone wall + wrought iron fence, gate gap facing the house (x 25..28 on the north side)
  const wallM = M("stoneBrick", { color: "#8e897e" }), ir = M("iron", { color: "#26262a" });
  const x0 = 22, x1 = 38, z0 = -14, z1 = -1.6;
  const runs = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x0, z0, x0, z1], [x0, z1, 25.2, z1], [28.2, z1, x1, z1]];
  for (const [ax, az, bx, bz] of runs) {
    const len = Math.hypot(bx - ax, bz - az), yaw = Math.atan2(bx - ax, bz - az);
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    z.box(wallM, cx, 0.25, cz, 0.45, 0.5, len, { ry: yaw, col: true, tex: 1.2 });
    z.box(wallM, cx, 0.53, cz, 0.55, 0.06, len + 0.1, { ry: yaw });
    const n = Math.round(len / 0.18);
    for (let i = 0; i <= n; i++) {
      const t = i / n, px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
      z.inst(K.boxGeo(0.025, 0.9, 0.025), ir, px, 1.0, pz, { ry: yaw });
      z.inst(K.coneGeo(0.03, 0.09, 4), ir, px, 1.49, pz, { ry: yaw });
    }
    z.box(ir, cx, 1.3, cz, 0.03, 0.04, len, { ry: yaw });
    z.box(ir, cx, 0.7, cz, 0.03, 0.04, len, { ry: yaw });
    z.colBox(cx, 1.0, cz, 0.3, 1.5, len, { ry: yaw, walk: false });
  }
  for (const gx of [25.2, 28.2]) z.box(wallM, gx, 0.9, z1, 0.5, 1.8, 0.5, { col: true });
  // the open iron gate leaf
  z.box(ir, 25.6, 0.95, z1 + 0.9, 0.04, 1.3, 1.5, { ry: 0.2 });
  // the six graves (grave0..grave5): stone + plot + (buried) mound
  const graves = [];
  const NAMES = W.GRAVE_NAMES;
  for (let k = 0; k < 6; k++) {
    const gx = 25 + k * 2, gz = -8;
    P.gravestone(z, gx, gz - 1.0, { text: [NAMES[k]], color: k === 5 ? "#b4b0a8" : "#9a968c" });
    z.box(M("dirt", { color: "#5a4632" }), gx, 0.02, gz, 0.9, 0.04, 1.6, { layer: "flat" });
    const mound = new THREE.Group();
    const dm = new THREE.Mesh(K.sphereGeo(0.62, 12, 6), M("dirt", { color: "#4a3626" }));
    dm.scale.set(0.8, 0.28, 1.35); dm.position.y = 0.02; dm.receiveShadow = true; dm.castShadow = true;
    mound.add(dm);
    // the buried thing: a hilt / staff top / ribbon peeking out
    const itemCol = ["#f2c84b", "#9a7449", "#9aa0a8", "#e0b040", "#7a90b0", "#c0141c"][k];
    const stick = new THREE.Mesh(K.boxGeo(0.05, 0.5, 0.05), K.flat(itemCol, 0.5, k === 2 || k === 3 ? 0.8 : 0));
    stick.position.set(0, 0.32, -0.45); mound.add(stick);
    if (k < 4) { const guard = new THREE.Mesh(K.boxGeo(0.28, 0.04, 0.06), K.flat(itemCol, 0.5, 0.6)); guard.position.set(0, 0.42, -0.45); mound.add(guard); }
    else if (k === 4) { const orb = new THREE.Mesh(K.sphereGeo(0.07, 8, 6), K.glow("#9ab8ff", 1.2)); orb.position.set(0, 0.6, -0.45); mound.add(orb); }
    else { stick.scale.set(1.6, 0.4, 0.3); stick.position.y = 0.12; }
    z.object(mound, gx, 0, gz, 0);
    mound.visible = false;
    const pos = { x: gx, y: 0, z: gz };
    graves.push({ id: "grave" + k, name: NAMES[k], pos, setBuried(b) { mound.visible = !!b; }, mound });
  }
  W.graves(graves);
  // older nameless graves behind (atmosphere)
  for (let i = 0; i < 9; i++) {
    const gx = 23.6 + i * 1.7, gz = -12.2 + (i % 2) * 0.4;
    P.gravestone(z, gx, gz, { cross: i % 3 === 1, tilt: ((i * 37) % 7 - 3) * 0.05, color: "#868278", ry: ((i * 13) % 5 - 2) * 0.05 });
  }
  // shovel leaning on the fence (prop "shovel")
  const shovel = new THREE.Group();
  {
    const h1 = new THREE.Mesh(K.cylGeo(0.025, 0.025, 1.1, 6), M("woodPlank", { color: "#9a7a52" })); h1.position.y = 0.55;
    const grip = new THREE.Mesh(K.boxGeo(0.16, 0.04, 0.04), M("woodDark")); grip.position.y = 1.12;
    const blade = new THREE.Mesh(K.boxGeo(0.22, 0.3, 0.02), M("iron", { color: "#6a6a68" })); blade.position.y = -0.12;
    shovel.add(h1, grip, blade);
    shovel.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  }
  z.object(shovel, 32, 0.2, -2.05, 0);
  shovel.rotation.x = -0.28;
  W.prop("shovel", shovel);
  W.point("graveShovel", 32, 0, -2.6);
  // a big dead yew and a bench
  z.cyl(M("bark", { color: "#4a3e34" }), 36.2, 2.2, -4.2, 0.28, 0.42, 4.4, { col: true, seg: 9 });
  for (let i = 0; i < 6; i++) {
    const a = i * 1.1;
    z.cyl(M("bark", { color: "#4a3e34" }), 36.2 + Math.sin(a) * 0.9, 3.8 + (i % 3) * 0.5, -4.2 + Math.cos(a) * 0.9, 0.05, 0.12, 2.2, { rz: Math.sin(a) * 0.9, rx: Math.cos(a) * 0.9, seg: 6 });
  }
  P.bench(z, 24.2, -3.4, PI, {});
  P.lantern(z, 26.7, 1.7, -1.6, Z.fx.flames);
  z.excludeRect(21.5, -14.5, 38.5, -1.2);
  z.finish();
}

function buildVoidEdge(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("voidEdge");
  const z = Z.z;
  // fence along x=-38 with a broken gap at z -5..-3 (prop "voidFence")
  const fenceRoot = new THREE.Group();
  fenceRoot.name = "voidFence";
  Z.root.add(fenceRoot);
  const fz = W.subKit("voidEdge", fenceRoot);
  P.fenceRun(fz, -38, -36, -38, -5.2, { col: true, color: "#6e5638", ground: W.h });
  P.fenceRun(fz, -38, -2.8, -38, 28, { col: true, color: "#6e5638", ground: W.h });
  // broken rails lying around
  fz.box(M("woodPlank", { color: "#6e5638" }), -37.2, 0.06, -4.4, 0.07, 0.1, 2.0, { ry: 0.6, rz: 0.1 });
  fz.box(M("woodPlank", { color: "#6e5638" }), -36.6, 0.05, -3.2, 0.07, 0.1, 1.6, { ry: -0.9 });
  fz.box(M("woodPlank", { color: "#6e5638" }), -38.05, 0.35, -5.3, 0.14, 0.7, 0.14, { rz: 0.5 });
  fz.finish();
  W.prop("voidFence", fenceRoot);
  // warning sign
  P.signpost(z, -34.5, -7.6, -0.9, ["KEEP BACK", "from the edge"], { w: 1.3, h: 1.1 });
  // jagged rocks along the rim and down the cliff
  for (let i = 0; i < 40; i++) {
    const zz = -38 + i * 1.75 + Math.sin(i * 2.3) * 0.5;
    if (zz > -6 && zz < -2) continue;
    P.rock(z, -40 - (i % 3) * 0.8, W.h(-39.5, zz) - 0.4, zz, 0.7 + (i % 4) * 0.35, i * 7 + 3, { color: "#7a7670" });
  }
  for (let i = 0; i < 26; i++) {
    const zz = -40 + i * 2.8, depth = 6 + (i % 5) * 9;
    P.rock(z, -42.5 - (i % 4) * 1.2, -depth, zz, 2.2 + (i % 3) * 0.9, i * 11 + 5, { color: "#6a665e", sy: 1.8 });
  }
  // a few floating stones far down in the white (cheap depth cue)
  for (let i = 0; i < 10; i++) {
    P.rock(z, -60 - i * 9, -30 - (i % 4) * 22, -30 + i * 6.5, 1.5 + (i % 3), i * 5 + 1, { color: "#8a8680" });
  }
  // the dead tree leaning over the edge
  z.frame(-39.0, W.h(-39, -12), -12, 0, () => {
    z.cyl(M("bark", { color: "#4a3e34" }), -0.9, 2.0, 0, 0.18, 0.3, 4.4, { rz: 0.42, seg: 8, col: false });
    z.cyl(M("bark", { color: "#4a3e34" }), -2.4, 3.9, 0.2, 0.06, 0.13, 2.0, { rz: 1.1, seg: 6 });
    z.cyl(M("bark", { color: "#4a3e34" }), -1.6, 4.3, -0.4, 0.05, 0.1, 1.6, { rz: 0.2, rx: 0.5, seg: 6 });
  });
  z.colCyl(-38.6, W.h(-38.6, -12), -12, 0.35, 2.0);
  // the gap itself: a worn patch
  z.geo(K.circleGeo(1.4, 16, 2), M("dirt", { color: "#6a5a44" }), -37.4, W.h(-37.4, -4) + 0.02, -4, { layer: "flat" });
  W.point("voidLeap", -36.6, W.h(-36.6, -4), -4);   // solid ground just inside the fence gap (the cliff drops from x ~ -38.2)
  W.point("voidFence", -37.4, W.h(-37.4, -4), -4);
  z.excludeRect(-41, -38, -36, 30);
  z.finish();
}

function buildPath1(W) {
  const { K, P } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("path1");
  const z = Z.z;
  const h = W.h;
  // rail fences along the road with gaps, a milestone and a signpost
  P.fenceRun(z, -3.2, 14, -3.2, 34, { ground: h, broken: (i) => i === 4 });
  P.fenceRun(z, 3.2, 16, 3.2, 30, { ground: h });
  P.fenceRun(z, 3.2, 36, 3.2, 47, { ground: h, broken: (i) => i === 2 });
  P.fenceRun(z, -3.2, 38, -3.2, 48, { ground: h });
  z.frame(2.6, h(2.6, 24), 24, 0, () => {
    z.box(M("rock", { color: "#9a968a" }), 0, 0.4, 0, 0.45, 0.8, 0.3, { col: true, tex: 1 });
    z.geo(K.planeGeo(0.38, 0.4), K.texMat("mile1", K.signTex(["BRIDGE", "1/2"], { w: 128, h: 128, style: "stone" })), -0.23, 0.5, 0, { ry: -Math.PI / 2 });
  });
  P.signpost(z, -2.4, 42, Math.PI / 2, ["BRIDGE ->", "rat field beyond"], { w: 1.4, y: h(-2.4, 42) });
  // an old cart left by the road + rocks
  P.cart(z, -6.5, 29, 0.4, { y: h(-6.5, 29), load: "hay" });
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1, zz = 14 + i * 3.8;
    P.rock(z, side * (4.8 + (i % 3)), h(side * 5, zz) - 0.15, zz, 0.3 + (i % 4) * 0.12, i + 21);
  }
  z.finish();
}
