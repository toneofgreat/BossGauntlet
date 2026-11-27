// area3.js - the castle gate wall (gate3 + portcullis), the climbing castle road, Castle Aldmoor (curtain walls,
// towers, gatehouse, courtyard with the first King's statue, barracks/stables, the great hall with the King's
// portal, the hidden portrait room) and the throne room (dais, throne, torches EVENTS can turn blue).

const PI = Math.PI;

export function buildArea3(W) {
  buildGate3(W);
  buildCastle(W);
  buildThrone(W);
}

function buildGate3(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("gate3");
  const z = Z.z, h = W.h, fx = Z.fx;
  const GZ = 332, st = M("stoneBrick", { color: "#8e887c" }), stD = M("stoneBrick", { color: "#7a746a" });
  // full-width stone wall following the terrain (4 m segments)
  const seg = K.boxGeo(4.05, 7, 1.6, 2), mer = K.boxGeo(0.8, 0.8, 1.7);
  for (let x = -218; x <= 218; x += 4) {
    if (Math.abs(x) < 8) continue;
    const y = Math.min(h(x - 2, GZ), h(x + 2, GZ), h(x, GZ));
    z.inst(seg, st, x, y + 2.0, GZ);
    z.inst(mer, stD, x - 1.0, y + 5.9, GZ); z.inst(mer, stD, x + 1.0, y + 5.9, GZ);
    z.colBox(x, y + 2.5, GZ, 4.05, 8, 1.6, { walk: false });
  }
  // gatehouse towers
  const gy = h(0, GZ);
  for (const sx of [-1, 1]) {
    z.frame(sx * 5.2, gy, GZ, 0, () => {
      z.box(st, 0, 4.0, 0, 4.4, 10, 4.4, { col: true, walk: false, tex: 2 });
      for (let i = 0; i < 4; i++) for (const [ox, oz] of [[-1.6, -2.3], [1.6, -2.3], [-1.6, 2.3], [1.6, 2.3], [-2.3, 0], [2.3, 0]]) if (i === 0) z.box(stD, ox, 9.4, oz, 0.9, 0.9, 0.9);
      z.box(stD, 0, 9.0, 0, 4.8, 0.3, 4.8);
      z.box(K.flat("#14110e"), 0, 6.5, -2.21, 0.25, 1.1, 0.02);
      P.banner(z, 0, 8.4, -2.25, 1.6, 4.2, "#7a1e22", { emblem: "crown", ry: PI, layer: "c0" });
      P.banner(z, 0, 8.4, -2.25, 1.6, 4.2, "#140e0e", { emblem: "crown", trim: "#5a1a1a", torn: true, ry: PI, layer: "ng" });
      P.torch(z, -sx * 2.25, 2.8, -2.4, PI, fx.flames);
    });
  }
  // arch over the road
  z.box(st, 0, gy + 6.25, GZ, 6.0, 3.5, 4.4, { tex: 2 });
  for (let i = 0; i < 4; i++) z.box(stD, -2.25 + i * 1.5, gy + 8.4, GZ - 2.0, 0.9, 0.9, 0.9);
  const vou = 9;
  for (let i = 0; i < vou; i++) {
    const a = -PI / 2 + (PI * (i + 0.5)) / vou;
    z.box(stD, Math.sin(a) * 2.75, gy + 4.5 + Math.cos(a) * 0.5, GZ - 2.25, 0.7, 0.5, 0.15, { rz: -a * 0.3 });
  }
  // portcullis (raises when area3 opens)
  const pc = new THREE.Group();
  const ir = M("iron", { color: "#3a3a3c" });
  for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(K.boxGeo(0.1, 4.6, 0.1), ir); b.position.set(-2.4 + i * 0.6, 2.3, 0); b.castShadow = true; pc.add(b); }
  for (let j = 0; j < 6; j++) { const b = new THREE.Mesh(K.boxGeo(5.0, 0.08, 0.08), ir); b.position.set(0, 0.4 + j * 0.8, 0); pc.add(b); }
  for (let i = 0; i < 9; i++) { const tp = new THREE.Mesh(K.coneGeo(0.07, 0.25, 4), ir); tp.position.set(-2.4 + i * 0.6, -0.1, 0); tp.rotation.x = PI; pc.add(tp); }
  z.object(pc, 0, gy, GZ - 0.6, 0);
  pc.userData.closedY = gy; pc.userData.openY = gy + 4.2;
  const col = z.colBox(0, gy + 2.2, GZ - 0.6, 5.0, 4.4, 0.4, { walk: false });
  W.gateVisual("area3", { lift: pc, col, kind: "lift", pos: { x: 0, y: gy, z: GZ } });
  P.signpost(z, 3.4, GZ - 5, 0.3, ["CASTLE ALDMOOR", "by royal permission"], { w: 1.5, y: h(3.4, GZ - 5) });
  // the castle road: stone paving that follows the slope + parapets + lamps
  for (let zz = 334; zz < 400; zz += 2) {
    const y0 = h(0, zz), y1 = h(0, zz + 2), ang = Math.atan2(y1 - y0, 2);
    z.inst(K.boxGeo(7.6, 0.12, 2.1, 2.5), M("cobble", { color: "#8a8478" }), 0, (y0 + y1) / 2 + 0.03, zz + 1, { rx: -ang, layer: "flat" });
    for (const sx of [-4.3, 4.3]) {
      const py = Math.min(h(sx, zz), h(sx, zz + 2));
      z.inst(K.boxGeo(0.6, 1.6, 2.05, 1.5), st, sx, py + 0.3, zz + 1, { rx: -ang });
      z.inst(K.boxGeo(0.7, 0.12, 2.1), stD, sx, py + 1.15, zz + 1, { rx: -ang });
    }
    if ((zz - 334) % 10 === 0) for (const sx of [-4.3, 4.3]) z.colBox(sx, Math.min(h(sx, zz), h(sx, zz + 10)) + 1.0, zz + 5, 0.6, 3.5, 10, { walk: false });
  }
  for (let zz = 342; zz < 400; zz += 14) {
    for (const sx of [-4.3, 4.3]) {
      const y = h(sx, zz) + 1.2;
      z.cyl(M("woodDark"), sx, y + 2.0, zz, 0.06, 0.07, 4.0, { seg: 6 });
      P.banner(z, sx, y + 3.8, zz + 0.08, 0.7, 1.8, "#7a1e22", { emblem: "crown", ry: sx > 0 ? -PI / 2 : PI / 2, layer: "c0" });
      P.banner(z, sx, y + 3.8, zz + 0.08, 0.7, 1.8, "#140e0e", { emblem: "crown", trim: "#5a1a1a", torn: true, ry: sx > 0 ? -PI / 2 : PI / 2, layer: "ng" });
      P.torch(z, sx * 0.97, y - 0.1, zz + 1, sx > 0 ? -PI / 2 : PI / 2, fx.flames);
    }
  }
  z.excludeRect(-220, GZ - 1.4, 220, GZ + 1.4);
  z.excludeRect(-5, 330, 5, 400);
  z.finish();
}

function buildCastle(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("castle");
  const z = Z.z, fx = Z.fx;
  const Y = 18;
  const st = M("stoneBrick", { color: "#a09888" }), stD = M("stoneBrick", { color: "#8a8274" }), stL = M("stoneBrick", { color: "#b4ac9c" });
  const roofM = M("roofTile", { color: "#3e4a5e" });
  const X0 = -45, X1 = 45, Z0 = 400, Z1 = 510, T = 3, WH = 10;
  // ---------------------------------------------------------------- curtain walls
  const curtain = (cx, cz, w, d) => {
    z.box(st, cx, Y + WH / 2 - 2, cz, w, WH + 4, d, { col: true, walk: false, tex: 2.5 });
    z.box(stD, cx, Y + WH + 0.1, cz, w + 0.2, 0.25, d + 0.2);
    const alongX = w > d, len = Math.max(w, d);
    for (let o = -len / 2 + 0.75; o < len / 2; o += 1.5) {
      for (const side of [-1, 1]) {
        const ox = alongX ? o : side * (d / 2 - 0.3), oz = alongX ? side * (d / 2 - 0.3) : o;
        z.inst(K.boxGeo(alongX ? 0.8 : 0.6, 1.0, alongX ? 0.6 : 0.8), stD, cx + ox, Y + WH + 0.7, cz + oz);
      }
    }
  };
  curtain((X0 - 3.6) / 2, Z0, -3.6 - X0, T); curtain((X1 + 3.6) / 2, Z0, X1 - 3.6, T);
  curtain(0, Z1, X1 - X0, T);
  curtain(X0, (Z0 + Z1) / 2, T, Z1 - Z0); curtain(X1, (Z0 + Z1) / 2, T, Z1 - Z0);
  // towers: 4 corners + mid east/west
  const tower = (x, zz, r, hh) => {
    z.cyl(stL, x, Y + hh / 2 - 2, zz, r, r * 1.08, hh + 4, { col: true, seg: 18, tex: 2.5 });
    z.cyl(stD, x, Y + hh + 0.2, zz, r + 0.5, r + 0.4, 0.6, { seg: 18 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * PI * 2; z.inst(K.boxGeo(0.9, 1.0, 0.6), stD, x + Math.sin(a) * (r + 0.2), Y + hh + 1.0, zz + Math.cos(a) * (r + 0.2), { ry: a }); }
    z.geo(K.coneGeo(r + 0.9, r * 1.6, 18), roofM, x, Y + hh + 0.5 + r * 0.8 + 0.5, zz);
    z.cyl(M("woodDark"), x, Y + hh + r * 1.6 + 2.0, zz, 0.05, 0.05, 2.4, { seg: 5 });
    for (let k = 0; k < 3; k++) z.box(K.flat("#14110e"), x + r + 0.02, Y + 4 + k * 4, zz, 0.02, 1.0, 0.25);
    return Y + hh + r * 1.6 + 3.0;
  };
  const flagTops = [];
  for (const [x, zz] of [[X0, Z0], [X1, Z0], [X0, Z1], [X1, Z1]]) flagTops.push([x, tower(x, zz, 5, 18), zz]);
  for (const [x, zz] of [[X0, 455], [X1, 455]]) flagTops.push([x, tower(x, zz, 4, 14), zz]);
  // flags (thin double-sided planes) on the tower spires
  for (const [x, y, zz] of flagTops) {
    P.banner(z, x + 0.65, y + 0.2, zz, 1.2, 0.8, "#7a1e22", { emblem: "crown", ry: PI / 2, layer: "c0" });
    P.banner(z, x + 0.65, y + 0.2, zz, 1.2, 0.8, "#140e0e", { trim: "#5a1a1a", torn: true, ry: PI / 2, layer: "ng" });
  }
  // gatehouse with open doors + raised portcullis
  for (const sx of [-1, 1]) {
    z.box(stL, sx * 6.0, Y + 6, Z0, 5.0, 16, 7, { col: true, walk: false, tex: 2.5 });
    for (let o = -2; o <= 2; o += 1.33) z.box(stD, sx * 6.0 + o, Y + 14.6, Z0 - 3.4, 0.8, 1.0, 0.6);
    P.torch(z, sx * 3.7, Y + 2.8, Z0 - 3.6, PI, fx.flames);
    P.banner(z, sx * 6.0, Y + 12.5, Z0 - 3.55, 2.0, 6.0, "#7a1e22", { emblem: "crown", ry: PI, layer: "c0" });
    P.banner(z, sx * 6.0, Y + 12.5, Z0 - 3.55, 2.0, 6.0, "#140e0e", { trim: "#5a1a1a", torn: true, ry: PI, layer: "ng" });
    z.box(M("woodPlank", { color: "#5a4028" }), sx * 3.3, Y + 3.2, Z0 + 3.2, 0.25, 6.2, 3.3, { ry: sx * 0.25, tex: 1 });
  }
  z.box(stL, 0, Y + 11.0, Z0, 7.2, 6.0, 7, { tex: 2.5 });
  for (let o = -3; o <= 3; o += 1.5) z.box(stD, o, Y + 14.5, Z0 - 3.4, 0.8, 1.0, 0.6);
  const ir = M("iron", { color: "#3a3a3c" });
  for (let i = 0; i < 11; i++) z.box(ir, -3.0 + i * 0.6, Y + 7.6, Z0 - 1.5, 0.1, 1.6, 0.1);
  z.box(M("woodDark"), 0, Y + 0.03, Z0, 7.2, 0.06, 7, { layer: "flat" });
  // ---------------------------------------------------------------- courtyard
  z.box(M("cobble", { color: "#9a9284" }), 0, Y + 0.02, 425, 84, 0.04, 46, { layer: "flat", tex: 2.5 });
  z.box(M("cobble", { color: "#9a9284" }), 0, Y + 0.02, 480, 84, 0.04, 56, { layer: "flat", tex: 2.5 });
  // the first King's statue (holding his staff point-down: the seal)
  z.frame(0, Y, 411, 0, () => {
    z.box(stD, 0, 0.6, 0, 3.0, 1.2, 3.0, { col: true });
    z.box(stL, 0, 1.35, 0, 2.4, 0.3, 2.4);
    // carved from one pale stone (no brick courses): robe, shoulders, beard, hands on the staff
    const sm = M("rock", { color: "#c4bcac" });
    z.geo(K.latheGeo("statueRobe2", [[0, 0], [0.78, 0], [0.74, 0.12], [0.64, 1.0], [0.56, 1.6], [0.46, 2.15], [0.42, 2.35], [0.3, 2.5], [0, 2.5]], 20), sm, 0, 1.5, 0);
    z.geo(K.sphereGeo(0.42, 14, 8), sm, 0, 3.86, 0, { sx: 1.35, sy: 0.5, sz: 0.85 });
    z.geo(K.coneGeo(0.16, 0.34, 8), sm, 0, 3.98, 0.17, { rx: PI });
    for (const sx of [-1, 1]) z.geo(K.sphereGeo(0.1, 8, 6), sm, 0.45 + sx * 0.08, 3.05, 0.5 + sx * 0.04, { sx: 1.2, sy: 0.9 });
    z.geo(K.sphereGeo(0.26, 12, 10), sm, 0, 4.25, 0.02);
    z.cyl(sm, 0, 4.0, 0, 0.13, 0.15, 0.3, { seg: 10 });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * PI * 2; z.geo(K.coneGeo(0.05, 0.16, 4), M("gold", { color: "#c8a040" }), Math.sin(a) * 0.2, 4.55, Math.cos(a) * 0.2); }
    z.cyl(M("gold", { color: "#c8a040" }), 0, 4.47, 0, 0.23, 0.23, 0.07, { seg: 14 });
    z.cyl(sm, 0.32, 3.3, 0.35, 0.06, 0.06, 1.4, { rz: 0.5, rx: 0.4, seg: 6 });
    z.cyl(sm, 0.62, 2.6, 0.55, 0.05, 0.05, 3.0, { seg: 6 });
    z.geo(K.sphereGeo(0.12, 8, 6), K.glow("#9ab8ff", 0.9), 0.62, 4.15, 0.55, { layer: "c0" });
    z.geo(K.sphereGeo(0.12, 8, 6), K.glow("#c0141c", 1.4), 0.62, 4.15, 0.55, { layer: "ngGlow" });
    P.redEyes(z, 0, 4.3, 0.24, 0, { r: 0.03, sp: 0.1 });
    const plaque = K.signTex(["THE FIRST KING", "who kept the way shut"], { w: 384, h: 128, style: "stone" });
    z.geo(K.planeGeo(1.8, 0.6), K.texMat("statueplaque", plaque), 0, 0.65, -1.51, { ry: PI });
  });
  // guard posts: small stone plinths with a spear stand behind each royal guard spawn
  for (const [x, zz] of W.ROYAL_POSTS) {
    z.box(stD, x, Y + 0.08, zz, 1.6, 0.16, 1.6, { layer: "flat" });
    z.cyl(M("woodDark"), x + 0.9, Y + 1.2, zz + 0.6, 0.04, 0.04, 2.4, { seg: 5 });
  }
  // barracks (west) + stables (east) along the walls
  z.frame(-36.5, Y, 424, PI / 2, () => {
    P.house(z, { w: 30, d: 9, h: 4.2, roof: "tile", pitch: 30, plaster: "#cfc4ae", roofColor: "#3e4a5e", shutter: "#7a1e22", chimney: true, flowers: false, found: 0.5, doorAngle: 0.2 });
  });
  fx.smoke.add(-40.5, Y + 9.2, 438.4, 8, 0.8, 7, 1);
  z.frame(37.5, Y, 424, -PI / 2, () => {
    for (let i = 0; i < 7; i++) {
      const lx = -12 + i * 4;
      z.box(M("woodDark"), lx, 1.8, 3.4, 0.25, 3.6, 0.25, { col: true });
      z.box(M("woodPlank", { color: "#6a4a30" }), lx, 0.75, 0, 0.12, 1.5, 6.0, { col: true });
      z.box(M("straw"), lx + 2, 0.04, 0, 3.6, 0.06, 6.0, { layer: "flat" });
    }
    z.box(M("woodPlank", { color: "#5a4a3a" }), 0, 2.2, 0, 28.5, 4.4, 0.3, { col: true });
    z.box(roofM, 0, 3.8, 1.8, 29, 0.15, 4.6, { rx: 0.28 });
    for (let i = 0; i < 6; i++) P.hayBale(z, -10 + i * 4.1, 0, -1.5, 0.3);
    z.box(M("woodPlank", { color: "#6a4e32" }), 0, 0.35, 4.4, 6.0, 0.7, 0.7, { col: true });
    z.box(K.flat("#2c3a3a", 0.08, 0.3), 0, 0.62, 4.4, 5.8, 0.04, 0.5);
  });
  // courtyard dressing: well, carts, barrels, crates, lamp posts, a training ring
  P.well(z, 22, 415, { y: Y });
  P.cart(z, -24, 444, 0.3, { y: Y, load: "barrels" });
  P.cart(z, 27, 444, -0.6, { y: Y, load: "hay" });
  for (let i = 0; i < 6; i++) { P.barrel(z, -30 + (i % 3) * 0.8, 407 + ((i / 3) | 0) * 0.8, { y: Y }); P.crate(z, 30 + (i % 2) * 0.9, 406 + i * 0.9, 0.8, { y: Y }); }
  for (const [x, zz] of [[-12, 405], [12, 405], [-12, 446], [12, 446], [-30, 425], [30, 425]]) P.lamppost(z, x, zz, { y: Y }, fx.flames);
  // ---------------------------------------------------------------- great hall (x -14..14, z 452..479), floor 18.45
  const HF = Y + 0.45, HX0 = -14, HX1 = 14, HZ0 = 452, HZ1 = 480, HWT = 1.0, HH = 13;
  // front terrace + 3 steps
  z.box(stL, 0, Y + 0.225, 449, 16, 0.45, 6, { col: true, surface: "stone" });
  for (let i = 0; i < 3; i++) z.box(stL, 0, Y + 0.075 + i * 0.15, 445.6 + i * 0.25 - 0.4, 12, 0.15 + i * 0.15, 0.5, { col: true });
  const hall = (cx, cy, cz, w, hh, d) => z.box(st, cx, cy, cz, w, hh, d, { col: true, walk: false, tex: 2.5 });
  // north wall with the throne-room doorway (x -2..2, up to y 24.6)
  hall((HX0 - 2) / 2, HF + HH / 2, HZ1 - HWT / 2, -2 - HX0, HH, HWT);
  hall((HX1 + 2) / 2, HF + HH / 2, HZ1 - HWT / 2, HX1 - 2, HH, HWT);
  hall(0, 24.6 + (HF + HH - 24.6) / 2, HZ1 - HWT / 2, 4, HF + HH - 24.6, HWT);
  z.box(stL, 0, Y + 1.0, HZ1 - 0.5, 4.0, 2.0, 1.2, { col: true, surface: "stone" });
  // west wall with the side door to the portrait corridor (z 463.8..466.2, 3 m tall)
  hall(HX0 + HWT / 2, HF + HH / 2, (HZ0 + 463.8) / 2, HWT, HH, 463.8 - HZ0);
  hall(HX0 + HWT / 2, HF + HH / 2, (466.2 + HZ1) / 2, HWT, HH, HZ1 - 466.2);
  hall(HX0 + HWT / 2, HF + 3.0 + (HH - 3.0) / 2, 465, HWT, HH - 3.0, 2.4);
  hall(HX1 - HWT / 2, HF + HH / 2, (HZ0 + HZ1) / 2, HWT, HH, HZ1 - HZ0);
  hall((HX0 - 2.5) / 2 - 0.5, HF + HH / 2, HZ0 + HWT / 2, -2.5 - HX0 + 1, HH, HWT);
  hall((HX1 + 2.5) / 2 + 0.5, HF + HH / 2, HZ0 + HWT / 2, HX1 - 2.5 + 1, HH, HWT);
  hall(0, HF + 5.5 + (HH - 5.5) / 2, HZ0 + HWT / 2, 5, HH - 5.5, HWT);
  // gable roof along Z
  const rise = 6;
  for (const s of [-1, 1]) {
    const th = Math.atan2(rise, 15);
    z.box(roofM, s * 7.5, HF + HH + rise / 2 + 0.2, (HZ0 + HZ1) / 2, Math.hypot(15, rise) + 0.6, 0.35, HZ1 - HZ0 + 1.4, { rz: -s * th, tex: 2.5 });
  }
  for (const zz of [HZ0, HZ1]) z.geo(K.prismGeo(28, rise, 1.0, 2.5), st, 0, HF + HH, zz + (zz === HZ0 ? 0.5 : -0.5), {});
  z.colBox(0, HF + HH + 0.2, (HZ0 + HZ1) / 2, 28, 0.4, 27);
  // tall windows (glass + frames) along both sides
  for (const sx of [HX0 - 0.02, HX1 + 0.02]) for (let zz = 456; zz < 478; zz += 5.2) {
    z.box(stD, sx, HF + 6.2, zz, 0.3, 5.6, 2.0);
    z.box(K.glass(), sx + (sx < 0 ? -0.16 : 0.16), HF + 6.2, zz, 0.02, 5.0, 1.5);
    z.box(K.glass(), sx + (sx < 0 ? 1.04 : -1.04), HF + 6.2, zz, 0.02, 5.0, 1.5, { layer: "detail" });
    z.box(stD, sx + (sx < 0 ? -0.18 : 0.18), HF + 6.2, zz, 0.06, 5.0, 0.08);
  }
  // front doors (open) + door frame
  for (const s of [-1, 1]) z.box(M("woodPlank", { color: "#5a3a24" }), s * 2.3, HF + 2.7, HZ0 + 1.9, 0.2, 5.4, 2.4, { ry: s * 0.3 });
  z.box(stD, 0, HF + 5.7, HZ0 - 0.1, 5.6, 0.5, 1.3);
  for (const s of [-1, 1]) P.banner(z, s * 4.5, HF + 9.5, HZ0 - 0.55, 2.0, 6.0, "#7a1e22", { emblem: "crown", ry: PI, layer: "c0" });
  for (const s of [-1, 1]) P.banner(z, s * 4.5, HF + 9.5, HZ0 - 0.55, 2.0, 6.0, "#140e0e", { trim: "#5a1a1a", torn: true, ry: PI, layer: "ng" });
  // interior (detail)
  const D = { layer: "detail" };
  z.layer("detail", { hideDist: 75, anchor: { x: 0, y: 22, z: 465 } });
  z.box(M("stoneBrick", { color: "#7a7468" }), 0, HF - 0.22, (HZ0 + HZ1) / 2, 26, 0.45, 26, { col: true, surface: "stone", tex: 1.5 });
  z.box(M("clothRed", { color: "#7a1e22" }), 0, HF + 0.015, 463, 3.0, 0.03, 20, { layer: "flat", tex: 50 });
  for (const sx of [-1.6, 1.6]) z.box(M("gold", { color: "#b08a3a" }), sx, HF + 0.02, 463, 0.12, 0.03, 20, { layer: "flat" });
  for (const sx of [-8, 8]) for (let zz = 456; zz <= 476; zz += 5) {
    z.cyl(stL, sx, HF + HH / 2, zz, 0.55, 0.6, HH, { ...D, seg: 14, col: true });
    z.box(stD, sx, HF + 0.25, zz, 1.5, 0.5, 1.5, D);
    z.box(stD, sx, HF + HH - 0.3, zz, 1.4, 0.6, 1.4, D);
  }
  for (let zz = 456; zz <= 476; zz += 5) z.box(M("woodDark"), 0, HF + HH - 0.5, zz, 27, 0.5, 0.45, D);
  // long tables + benches
  for (const sx of [-4.6, 4.6]) {
    P.table(z, sx, 462, { y: HF, w: 1.2, d: 12, layer: "detail" });
    P.bench(z, sx - 1.0, 462, PI / 2, { y: HF, layer: "detail" }); P.bench(z, sx + 1.0, 462, -PI / 2, { y: HF, layer: "detail" });
    for (let i = 0; i < 5; i++) { P.candle(z, sx, HF + 0.79, 457 + i * 2.6, fx.flames); z.cyl(M("gold", { color: "#b08a3a" }), sx + 0.3, HF + 0.83, 458 + i * 2.6, 0.06, 0.04, 0.12, { ...D, seg: 8 }); }
  }
  // chandeliers (glowing rings + flames) and the zone light
  for (const zz of [458, 466]) {
    z.geo(K.torusGeo(1.4, 0.06, 6, 24), M("iron", { color: "#2c2a28" }), 0, HF + 8.5, zz, { ...D, rx: PI / 2 });
    z.cyl(M("iron", { color: "#2c2a28" }), 0, HF + 10.8, zz, 0.02, 0.02, 4.4, { ...D, seg: 4 });
    for (let i = 0; i < 10; i++) { const a = (i / 10) * PI * 2; P.candle(z, Math.sin(a) * 1.4, HF + 8.55, zz + Math.cos(a) * 1.4, fx.flames, D); }
  }
  const hallLight = new THREE.PointLight("#ffc080", 14, 26, 2);
  hallLight.position.set(0, HF + 7.5, 462);
  W.light("castle", hallLight, { flicker: true, base: 14 });
  // banners between columns
  for (const sx of [HX0 + 1.05, HX1 - 1.05]) for (let zz = 458.6; zz < 476; zz += 5.2) {
    P.banner(z, sx, HF + 11.2, zz, 1.6, 4.5, "#7a1e22", { emblem: "crown", ry: sx < 0 ? PI / 2 : -PI / 2, layer: "c0" });
    P.banner(z, sx, HF + 11.2, zz, 1.6, 4.5, "#140e0e", { trim: "#5a1a1a", torn: true, ry: sx < 0 ? PI / 2 : -PI / 2, layer: "ng" });
  }
  // stairs up to the throne-room door (x -4..4, z 476.2..479, 18.45 -> 20)
  z.ramp(0, HF, 476.0, 0, Y + 2, 479.0, 8, "stone");
  for (let i = 0; i < 8; i++) { const t = (i + 0.5) / 8; z.box(stL, 0, HF + (Y + 2 - HF) * t - 0.1, 476.0 + 3.0 * t, 8, 0.2 + (Y + 2 - HF) * t, 3.0 / 8 + 0.02, D); }
  W.point("kingPortal", 0, HF, 474);
  W.point("greatHall", 0, HF, 465);
  W.point("kingReturnArrive", 0, HF, 469);
  // ---------------------------------------------------------------- the portrait room (secret): x -40..-21, z 457..473
  const PX0 = -40, PX1 = -21, PZ0 = 457, PZ1 = 473, PW = 0.6, PH = 6;
  const pw = (cx, cz, w, d, hh, y0) => z.box(stD, cx, (y0 || HF) + (hh || PH) / 2, cz, w, hh || PH, d, { col: true, walk: false, tex: 2.5 });
  pw((PX0 + PX1) / 2, PZ0 + PW / 2, PX1 - PX0, PW); pw((PX0 + PX1) / 2, PZ1 - PW / 2, PX1 - PX0, PW);
  pw(PX0 + PW / 2, (PZ0 + PZ1) / 2, PW, PZ1 - PZ0);
  pw(PX1 - PW / 2, (PZ0 + 463.8) / 2, PW, 463.8 - PZ0); pw(PX1 - PW / 2, (466.2 + PZ1) / 2, PW, PZ1 - 466.2);
  pw(PX1 - PW / 2, 465, PW, 2.4, PH - 3.0, HF + 3.0);
  z.box(stL, (PX0 + PX1) / 2, HF - 0.22, (PZ0 + PZ1) / 2, PX1 - PX0, 0.45, PZ1 - PZ0, { col: true });
  z.box(roofM, (PX0 + PX1) / 2, HF + PH + 0.2, (PZ0 + PZ1) / 2, PX1 - PX0 + 1, 0.4, PZ1 - PZ0 + 1, { col: true });
  // corridor from the hall's west wall (door x=-14, z 463.8..466.2) to the room
  z.box(stL, -17.5, HF - 0.22, 465, 7.4, 0.45, 2.6, { col: true });
  for (const sz of [463.5, 466.5]) z.box(stD, -17.5, HF + 1.6, sz, 7.0, 3.2, 0.6, { col: true, walk: false });
  z.box(stD, -17.5, HF + 3.4, 465, 7.0, 0.4, 3.6, { col: true });
  // a tapestry half-hides the side door
  z.geo(K.planeGeo(2.0, 3.0), K.custom("tapestry", () => new THREE.MeshStandardMaterial({ color: "#5a2a3a", roughness: 1, side: THREE.DoubleSide })), HX0 + HWT + 0.03, HF + 2.0, 467.7, { ry: PI / 2, rz: 0.04 });
  // the portrait
  const paint = K.canvasTex("portrait", 384, 288, (g, w, hh) => {
    const bg = g.createLinearGradient(0, 0, 0, hh); bg.addColorStop(0, "#3a2e22"); bg.addColorStop(1, "#1e1812"); g.fillStyle = bg; g.fillRect(0, 0, w, hh);
    const fig = (x, y, s, robe, hair, extra) => {
      g.fillStyle = robe; g.beginPath(); g.moveTo(x - 26 * s, hh); g.quadraticCurveTo(x - 30 * s, y + 40 * s, x, y + 22 * s); g.quadraticCurveTo(x + 30 * s, y + 40 * s, x + 26 * s, hh); g.fill();
      g.fillStyle = "#d8b090"; g.beginPath(); g.ellipse(x, y, 13 * s, 16 * s, 0, 0, 7); g.fill();
      g.fillStyle = hair; g.beginPath(); g.ellipse(x, y - 8 * s, 14 * s, 10 * s, 0, PI, 0); g.fill();
      g.fillStyle = "#2a1a10"; g.fillRect(x - 6 * s, y - 2 * s, 3 * s, 3 * s); g.fillRect(x + 3 * s, y - 2 * s, 3 * s, 3 * s);
      if (extra) extra(x, y, s);
    };
    fig(80, 120, 2.0, "#5a1a22", "#c8c0b0", (x, y, s) => {
      g.fillStyle = "#d8b040"; g.beginPath(); g.moveTo(x - 14 * s, y - 14 * s); g.lineTo(x - 12 * s, y - 28 * s); g.lineTo(x - 5 * s, y - 18 * s); g.lineTo(x, y - 30 * s); g.lineTo(x + 5 * s, y - 18 * s); g.lineTo(x + 12 * s, y - 28 * s); g.lineTo(x + 14 * s, y - 14 * s); g.fill();
      g.strokeStyle = "#8aa0c8"; g.lineWidth = 4; g.beginPath(); g.moveTo(x + 40, y + 10); g.lineTo(x + 44, hh); g.stroke();
      g.fillStyle = "#c8d8ff"; g.beginPath(); g.arc(x + 40, y + 8, 7, 0, 7); g.fill();
    });
    fig(190, 170, 1.15, "#3a4a6a", "#5a3a20");                                                        // Fydor (older boy)
    fig(262, 182, 1.0, "#4a5a3a", "#3a2a18", (x, y, s) => { g.strokeStyle = "#8a6a3a"; g.lineWidth = 5; g.beginPath(); g.moveTo(x - 12, y + 22); g.lineTo(x + 12, y + 24); g.stroke(); });   // Myles (scarf)
    fig(325, 200, 0.85, "#e8e4da", "#6a4a2a", (x, y, s) => { g.fillStyle = "#c0141c"; g.beginPath(); g.ellipse(x - 12, y - 10, 6, 4, 0.5, 0, 7); g.ellipse(x - 4, y - 14, 6, 4, -0.5, 0, 7); g.fill(); });  // Elsie, red ribbon
    g.globalAlpha = 0.25; for (let i = 0; i < 3000; i++) { g.fillStyle = i % 2 ? "#000" : "#a08060"; g.fillRect(Math.random() * w, Math.random() * hh, 2, 2); }
    g.globalAlpha = 1;
    g.font = "italic 14px Georgia, serif"; g.fillStyle = "rgba(220,200,150,0.7)"; g.fillText("F. M. E.  - before the desert", 18, 278);
  });
  z.box(M("gold", { color: "#a07a2a" }), PX0 + PW + 0.05, HF + 2.6, 465, 0.12, 2.3, 3.0);
  const portraitMesh = z.mesh(K.planeGeo(2.6, 1.95), K.texMat("portraitM", paint, { roughness: 0.7 }), PX0 + PW + 0.12, HF + 2.6, 465, { ry: PI / 2 });
  P.redEyes(z, PX0 + PW + 0.14, HF + 2.95, 465 - 0.86, PI / 2, { r: 0.02, sp: 0.06 });
  W.point("portrait", PX0 + 2.6, HF, 465);
  W.prop("portrait", portraitMesh);
  // dust sheets over chairs, a cabinet, candles, cobwebs
  for (let i = 0; i < 4; i++) {
    const x = -34 + i * 3.2, zz = 460 + (i % 2) * 7;
    z.geo(K.latheGeo("sheet", [[0, 1.2], [0.4, 1.15], [0.55, 0.6], [0.62, 0]], 8), M("clothWhite", { color: "#d8d2c4" }), x, HF, zz, { sx: 0.8, sz: 0.9, ry: i });
  }
  z.box(M("woodDark"), -38.6, HF + 1.1, 470.5, 1.2, 2.2, 0.6, { col: true });
  P.candle(z, -38.6, HF + 2.2, 470.5, fx.flames, { layer: "main" });
  const web = K.custom("web", () => new THREE.MeshBasicMaterial({ color: "#dedad0", transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  for (const [x, zz, ry] of [[PX0 + 0.8, PZ0 + 0.8, PI / 4], [PX0 + 0.8, PZ1 - 0.8, -PI / 4], [PX1 - 0.8, PZ1 - 0.8, PI + PI / 4]]) z.geo(K.circleGeo(0.9, 6), web, x, HF + PH - 0.6, zz, { rx: PI / 2 - 0.6, ry, layer: "detail" });
  z.box(M("clothRed", { color: "#4a2a2a" }), -30.5, HF + 0.015, 465, 5, 0.02, 3.5, { layer: "flat" });
  z.finish();
}

function buildThrone(W) {
  const { K, P, THREE } = W;
  const M = (n, o) => K.mat(n, o);
  const Z = W.zone("throne");
  const z = Z.z, fx = Z.fx;
  const F = 20, X0 = -12, X1 = 12, Z0 = 480, Z1 = 510, WT = 1.0, H = 14;
  const st = M("stoneBrick", { color: "#9a9282" }), stD = M("stoneBrick", { color: "#847c6e" }), stL = M("stoneBrick", { color: "#b0a896" });
  // floor + walls + roof
  z.box(M("stoneBrick", { color: "#6e685e" }), 0, F - 1.0, (Z0 + Z1) / 2, X1 - X0, 2.0, Z1 - Z0, { col: true, surface: "stone", tex: 1.5 });
  // checker tiles (EVENTS may drop floor tiles in P4: it builds its own)
  for (let i = 0; i < 10; i++) for (let j = 0; j < 12; j++) if ((i + j) % 2 === 0) z.inst(K.boxGeo(2.2, 0.02, 2.2, 2.2), M("stoneBrick", { color: "#5a544c" }), X0 + 1.2 + i * 2.4, F + 0.012, Z0 + 1.6 + j * 2.4, { layer: "flat" });
  const wall = (cx, cy, cz, w, hh, d) => z.box(st, cx, cy, cz, w, hh, d, { col: true, walk: false, tex: 2.5 });
  wall(0, F + H / 2, Z1 - WT / 2, X1 - X0, H, WT);
  wall(X0 + WT / 2, F + H / 2, (Z0 + Z1) / 2, WT, H, Z1 - Z0);
  wall(X1 - WT / 2, F + H / 2, (Z0 + Z1) / 2, WT, H, Z1 - Z0);
  wall((X0 - 2) / 2, F + H / 2, Z0 + WT / 2, -2 - X0, H, WT);
  wall((X1 + 2) / 2, F + H / 2, Z0 + WT / 2, X1 - 2, H, WT);
  wall(0, F + 4.6 + (H - 4.6) / 2, Z0 + WT / 2, 4, H - 4.6, WT);
  z.box(M("roofTile", { color: "#3e4a5e" }), 0, F + H + 0.2, (Z0 + Z1) / 2, X1 - X0 + 1.5, 0.4, Z1 - Z0 + 1.5, { col: true });
  for (let zz = Z0 + 3; zz < Z1; zz += 4) z.box(M("woodDark"), 0, F + H - 0.5, zz, X1 - X0 - 2, 0.6, 0.5);
  // the door (prop "throneDoor": EVENTS seals it during the fight)
  const leaves = [];
  for (const s of [-1, 1]) {
    const hinge = new THREE.Group();
    const leaf = new THREE.Mesh(K.boxGeo(2.0, 4.5, 0.18), M("woodPlank", { color: "#4a3020" }));
    leaf.position.set(-s * 1.0, 2.25, 0); leaf.castShadow = true;
    for (const yy of [0.8, 2.2, 3.6]) { const b = new THREE.Mesh(K.boxGeo(1.9, 0.12, 0.04), M("iron", { color: "#2a2a2a" })); b.position.set(-s * 1.0, yy, 0.11); hinge.add(b); }
    hinge.add(leaf);
    K.bake(hinge);
    z.object(hinge, s * 2.0, F, Z0 + WT / 2, 0);
    hinge.userData.side = s;
    hinge.rotation.y = -s * 1.45;
    leaves.push(hinge);
  }
  const doorCol = z.colBox(0, F + 2.3, Z0 + WT / 2, 4, 4.6, 0.6, { walk: false });
  W.colEnabled(doorCol, false);
  const door = new THREE.Group(); door.name = "throneDoor"; Z.root.add(door);
  let doorT = 0, doorTarget = 0;
  door.userData.setClosed = (v) => { doorTarget = v ? 1 : 0; W.colEnabled(doorCol, !!v); };
  door.userData.isClosed = () => doorTarget > 0;
  W.anim("throne", (dt) => {
    if (doorT === doorTarget) return;
    doorT = Math.max(0, Math.min(1, doorT + Math.sign(doorTarget - doorT) * dt * 1.5));
    for (const hg of leaves) hg.rotation.y = -hg.userData.side * 1.45 * (1 - doorT);
  }, 300);
  W.prop("throneDoor", door);
  // columns + torches (prop "throneTorches": userData.setColor("#4a8aff") turns them blue)
  const torchFx = Z.fx.torchFlames;
  const torchGlowMat = new THREE.MeshBasicMaterial({ color: "#ffb060", toneMapped: false });
  for (const sx of [-7.5, 7.5]) for (let zz = Z0 + 4; zz <= Z1 - 6; zz += 5) {
    z.cyl(stL, sx, F + H / 2, zz, 0.6, 0.7, H, { seg: 14, col: true });
    z.box(stD, sx, F + 0.3, zz, 1.7, 0.6, 1.7);
    z.box(stD, sx, F + H - 0.5, zz, 1.6, 0.8, 1.6);
    P.torch(z, sx + (sx < 0 ? 0.7 : -0.7), F + 3.0, zz, sx < 0 ? PI / 2 : -PI / 2, torchFx);
    z.box(torchGlowMat, sx + (sx < 0 ? 0.92 : -0.92), F + 3.5, zz, 0.08, 0.1, 0.08, { layer: "glow" });
  }
  const torches = new THREE.Group(); torches.name = "throneTorches"; Z.root.add(torches);
  torches.userData.setColor = (hex) => {
    const sys = torchFx.object;
    if (sys) { const u = sys.material.uniforms; const c = new THREE.Color(hex); u.uColor.value.copy(c).lerp(new THREE.Color("#ffffff"), 0.35); u.uColor2.value.copy(c); }
    torchGlowMat.color.set(hex);
  };
  torches.userData.setVisible = (v) => { if (torchFx.object) torchFx.object.visible = !!v; torchGlowMat.visible = !!v; };
  W.prop("throneTorches", torches);
  // carpet + side banners
  z.box(M("clothRed", { color: "#7a1e22" }), 0, F + 0.03, 493, 3.2, 0.03, 18, { layer: "flat", tex: 50 });
  for (const sx of [X0 + 1.05, X1 - 1.05]) for (let zz = Z0 + 6.5; zz < Z1 - 3; zz += 5) {
    P.banner(z, sx, F + 11, zz, 1.8, 5.5, "#7a1e22", { emblem: "crown", ry: sx < 0 ? PI / 2 : -PI / 2, layer: "c0" });
    P.banner(z, sx, F + 11, zz, 1.8, 5.5, "#140e0e", { trim: "#5a1a1a", torn: true, ry: sx < 0 ? PI / 2 : -PI / 2, layer: "ng" });
  }
  // rose window (glowing stained glass) on the north wall
  const rose = K.canvasTex("rose", 256, 256, (g, w) => {
    g.fillStyle = "#0a0a10"; g.fillRect(0, 0, w, w);
    const cols = ["#2a4aa8", "#a82a2a", "#d8b040", "#2a8a5a", "#7a3aa8"];
    for (let r = 5; r > 0; r--) for (let i = 0; i < 12; i++) {
      g.fillStyle = cols[(i + r) % 5]; g.beginPath(); g.moveTo(128, 128);
      g.arc(128, 128, r * 24, (i / 12) * PI * 2 + 0.03, ((i + 1) / 12) * PI * 2 - 0.03); g.fill();
    }
    g.strokeStyle = "#0a0a10"; g.lineWidth = 6; for (let r = 1; r <= 5; r++) { g.beginPath(); g.arc(128, 128, r * 24, 0, 7); g.stroke(); }
    g.globalCompositeOperation = "destination-in"; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill();
  });
  const roseM = K.custom("roseM", () => new THREE.MeshBasicMaterial({ map: rose, transparent: true, toneMapped: false, color: "#c8c0b8" }));
  z.geo(K.circleGeo(3.2, 32), roseM, 0, F + 9.5, Z1 - WT - 0.02, { rx: PI / 2 });
  z.geo(K.torusGeo(3.3, 0.25, 6, 32), stD, 0, F + 9.5, Z1 - WT - 0.05, {});
  // dais + throne
  z.box(stL, 0, F + 0.5, 506, 10, 1.0, 7, { col: true, surface: "stone" });
  for (let i = 0; i < 3; i++) z.box(stL, 0, F + 0.17 + i * 0.165, 502.2 - i * 0.3 + 0.0, 6, 0.33 + i * 0.33, 0.6, { col: true });
  z.box(M("clothRed", { color: "#7a1e22" }), 0, F + 1.01, 505.5, 3.2, 0.02, 6, { layer: "flat" });
  const throne = new THREE.Group();
  {
    // built facing local +Z, then the inner group turns it to face the door (south, -Z). The world resets the outer
    // group rotation on new runs, so the turn lives on the inner group.
    const inner = new THREE.Group(); inner.rotation.y = PI; inner.position.z = -0.35; throne.add(inner);
    const gm = M("gold", { color: "#c8a040" }), wd = M("clothRed", { color: "#6a1a1e" }), sm = M("stoneBrick", { color: "#6a6058" });
    const dk = M("woodDark");
    const add = (g, m, x, y, zz, rx, rz) => { const me = new THREE.Mesh(g, m); me.position.set(x, y, zz); me.rotation.x = rx || 0; me.rotation.z = rz || 0; me.castShadow = true; me.receiveShadow = true; inner.add(me); return me; };
    // plinth + seat with a stepped front edge and gold trim
    add(K.boxGeo(1.7, 0.18, 1.3), sm, 0, 0.09, 0);
    add(K.boxGeo(1.56, 0.36, 1.16), dk, 0, 0.36, 0);
    add(K.boxGeo(1.6, 0.05, 0.05), gm, 0, 0.52, 0.6);
    add(K.boxGeo(1.36, 0.14, 1.0), wd, 0, 0.61, 0.04);
    // tall back: dark wood frame, red padded panel with buttons, gold edging, pointed crest
    add(K.boxGeo(1.6, 3.0, 0.22), dk, 0, 1.95, -0.58);
    add(K.boxGeo(1.24, 2.3, 0.08), wd, 0, 1.85, -0.44);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) add(K.sphereGeo(0.03, 6, 4), gm, -0.36 + c * 0.36, 1.05 + r * 0.55, -0.4);
    for (const sx of [-0.74, 0.74]) add(K.boxGeo(0.07, 3.0, 0.07), gm, sx, 1.95, -0.46);
    add(K.boxGeo(1.55, 0.07, 0.07), gm, 0, 3.4, -0.46);
    add(K.prismGeo(1.6, 0.7, 0.22), dk, 0, 3.44, -0.58);
    add(K.sphereGeo(0.12, 10, 8), gm, 0, 4.2, -0.58);
    for (const sx of [-0.8, 0.8]) add(K.coneGeo(0.06, 0.3, 6), gm, sx, 3.6, -0.58);
    // arms: posts, rails, scroll ends (gold balls), carved front legs
    for (const sx of [-0.8, 0.8]) {
      add(K.boxGeo(0.16, 0.5, 1.1), dk, sx, 0.8, -0.02);
      add(K.boxGeo(0.24, 0.08, 1.24), dk, sx, 1.08, 0.02);
      add(K.cylGeo(0.06, 0.06, 0.24, 8), gm, sx, 1.08, 0.62, PI / 2);
      add(K.sphereGeo(0.12, 10, 8), gm, sx, 1.26, 0.56);
      add(K.cylGeo(0.07, 0.09, 0.5, 8), dk, sx, 0.33, 0.52);
    }
  }
  z.object(throne, 0, F + 1.0, 506.2, 0);
  W.prop("throne", throne);
  z.colBox(0, F + 1.0 + 0.6, 506.2, 1.6, 1.2, 1.2);
  z.colBox(0, F + 2.7, 505.6, 1.6, 3.4, 0.3, { walk: false });
  // the crack (EVENTS shows it): jagged black decal on the backrest + floor
  const crackTex = K.canvasTex("crack", 256, 512, (g, w, hh) => {
    g.clearRect(0, 0, w, hh); g.strokeStyle = "#050405"; g.lineCap = "round";
    const br = (x, y, a, len, wdt, d) => {
      if (d > 5 || wdt < 0.6) return;
      const nx = x + Math.sin(a) * len, ny = y + Math.cos(a) * len;
      g.lineWidth = wdt; g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
      br(nx, ny, a + (Math.random() - 0.5) * 0.9, len * 0.8, wdt * 0.75, d + 1);
      if (Math.random() < 0.55) br(nx, ny, a + (Math.random() < 0.5 ? 0.8 : -0.8), len * 0.6, wdt * 0.55, d + 1);
    };
    br(128, 0, 0.05, 90, 9, 0);
    g.fillStyle = "rgba(192,20,28,0.5)"; g.fillRect(126, 0, 4, 40);
  });
  const crackM = K.custom("crackM", () => new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, depthWrite: false }));
  const crack = new THREE.Group(); crack.name = "throneCrack";
  const c1 = new THREE.Mesh(K.planeGeo(1.3, 2.6), crackM); c1.position.set(0, F + 2.75, 506.2 - 0.39); c1.renderOrder = 4; crack.add(c1);
  const c2 = new THREE.Mesh(K.planeGeo(2.0, 6), crackM); c2.rotation.x = -PI / 2; c2.position.set(0, F + 1.02, 503.5); c2.renderOrder = 4; crack.add(c2);
  crack.visible = false;
  Z.root.add(crack);
  W.prop("throneCrack", crack);
  W.point("throneSeat", 0, F + 1.0, 505.6);
  W.point("throneDoor", 0, F, 483.5);
  W.point("throneCenter", 0, F, 494);
  // braziers either side of the dais
  P.brazier(z, -4.2, 502.0, fx.flames, { y: F });
  P.brazier(z, 4.2, 502.0, fx.flames, { y: F });
  z.finish();
}
