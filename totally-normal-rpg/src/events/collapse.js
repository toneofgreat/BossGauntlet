// The collapsing valley (DESIGN 8.5, CONTRACT 10.4): EVENTS-owned zone `collapse`, a ~2.5 minute parkour run from a
// crumbling lobby (3000,0,0) to the castle gate replica (3000,18,600). 6 sections, 6 checkpoints, colliders under
// tag `ev.collapse`. Built lazily on first use (spread over frames).
import { clamp, safe, hash1 } from "./util.js";

const CX = 3000;
const CP = [[0, 0.1, 4], [0, 0.1, 111], [0, 0.1, 200], [0, 2.3, 295], [0, 6.1, 393], [0, 6.1, 483]];
const TAG = "ev.collapse";
let C = null;

// ------------------------------------------------------------------------------------------------ build helpers
function mats(ev) {
  const T = ev.THREE;
  const get = (n, c) => { try { const m = ev.engine.materials.get(n); if (m) return m; } catch (e) { /* */ } return new T.MeshStandardMaterial({ color: c, roughness: 0.9 }); };
  return { rock: get("rock", 0x4a4440), grass: get("grass", 0x3e5a2a), plank: get("woodPlank", 0x6a4c30), stone: get("stoneBrick", 0x6a665e),
    plaster: get("plaster", 0xb8ad98), roof: get("roofTile", 0x6a3424), cobble: get("cobble", 0x5c5850), dirt: get("dirt", 0x5a4632),
    water: new T.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.08, metalness: 0.5 }),
    gateGlow: new T.MeshBasicMaterial({ color: new T.Color(1.6, 0.05, 0.04), toneMapped: false, transparent: true, opacity: 0.85, side: T.DoubleSide }) };
}
function phys(ev) { return ev.engine && ev.engine.physics; }
function addBox(ev, cx, cy, cz, sx, sy, sz, surface, yaw) {
  const ph = phys(ev); if (!ph) return null;
  try { return ph.addBox({ center: { x: cx, y: cy, z: cz }, size: { x: sx, y: sy, z: sz }, yaw: yaw || 0, tag: TAG, walkable: true, surface: surface || "rock" }); }
  catch (e) { console.warn("[events] collapse box", e); return null; }
}
function moveBox(ev, id, x, y, z) { const ph = phys(ev); if (ph && id !== null) { try { ph.move(id, { x, y, z }); } catch (e) { /* */ } } }
function enable(ev, id, on) { const ph = phys(ev); if (ph && id !== null) { try { ph.setEnabled(id, on); } catch (e) { /* */ } } }

/** a floating piece: grassy/stone top slab + a rock cone hanging below; collider = top slab */
function makeSlab(ev, g, m, topMat, x, yTop, z, sx, sz, depth, surface) {
  const T = ev.THREE;
  const grp = new T.Group(); grp.position.set(x, yTop, z);
  const top = new T.Mesh(g.box, topMat); top.scale.set(sx, 0.6, sz); top.position.y = -0.3; top.receiveShadow = true; top.castShadow = true;
  const under = new T.Mesh(g.coneDown, m.rock); under.scale.set(sx * 0.62, depth, sz * 0.62); under.position.y = -0.55; under.rotation.y = hash1(x * 3 + z) * 3;
  grp.add(top, under); C.root.add(grp);
  const p = { grp, cid: addBox(ev, x, yTop - 0.3, z, sx, 0.6, sz, surface), x, y: yTop, z, bx: x, by: yTop, bz: z, sx, sz,
    falling: false, vy: 0, gone: false, rx: (hash1(z) - 0.5) * 0.8, rz: (hash1(z + 1) - 0.5) * 0.8 };
  return p;
}
function resetPiece(ev, p) {
  p.falling = false; p.gone = false; p.vy = 0; p.x = p.bx; p.y = p.by; p.z = p.bz;
  p.grp.visible = true; p.grp.position.set(p.x, p.y, p.z); p.grp.rotation.set(0, 0, 0);
  moveBox(ev, p.cid, p.x, p.y - 0.3, p.z); enable(ev, p.cid, true);
}
function dropPiece(ev, p) { if (!p.falling && !p.gone) { p.falling = true; p.vy = 0.5; ev.sfx("rock_tumble", p.grp.position, 0.6); } }
function updateFall(ev, p, dt) {
  if (!p.falling || p.gone) return;
  p.vy += 13 * dt; p.y -= p.vy * dt;
  p.grp.position.y = p.y; p.grp.rotation.x += p.rx * dt; p.grp.rotation.z += p.rz * dt;
  if (p.y < -45) { p.gone = true; p.grp.visible = false; enable(ev, p.cid, false); }
  else moveBox(ev, p.cid, p.x, p.y - 0.3, p.z);
}

async function build(ev, seq) {
  const T = ev.THREE; const m = mats(ev);
  const root = new T.Group(); root.name = "collapse"; root.visible = false; ev.scene.add(root);
  C = { root, built: false, active: false, cp: 0, end: false, t: 0, plates: [], lips: [], planks: null, plankCols: [], plankZ: [],
    chunks: [], houses: [], deco: [], wall: [], towers: [], steps: [], debris: null, front: -1, frontOn: false, m,
    giantT: 0, swipeT: 6, mtx: new T.Matrix4(), q: new T.Quaternion(), e: new T.Euler(), s: new T.Vector3(1, 1, 1), v: new T.Vector3() };
  const g = {
    box: new T.BoxGeometry(1, 1, 1),
    coneDown: (() => { const c = new T.ConeGeometry(0.7, 1, 7); c.rotateX(Math.PI); c.translate(0, -0.5, 0); return c; })(),
    tower: new T.CylinderGeometry(1.5, 1.7, 16, 12),
    towerRoof: new T.ConeGeometry(2.0, 3, 12),
  };
  C.g = g;
  const yieldF = async () => { if (ev.engine && ev.engine.yieldFrame) await seq.p(ev.engine.yieldFrame()); };

  // ---------------- S1: the lobby plateau cracking (z -10 .. 108) ----------------
  // lobby house silhouette at the start
  const house = new T.Group(); house.position.set(CX - 4, 0, -5); root.add(house);
  const hw = new T.Mesh(g.box, m.plaster); hw.scale.set(9, 4, 7); hw.position.y = 2; hw.castShadow = true; house.add(hw);
  const hr = new T.Mesh(g.box, m.roof); hr.scale.set(9.6, 0.4, 7.6); hr.position.y = 4.6; hr.rotation.z = 0.08; house.add(hr);
  house.rotation.z = 0.06; C.house = house;
  const plateDefs = [[-10, 24, 16], [1.6, 10, 14], [2.0, 9, 13], [2.4, 10, 12], [2.8, 8, 12], [2.2, 10, 11], [3.2, 9, 11], [2.6, 10, 10], [3.0, 9, 10]];
  let z = -10;
  for (let i = 0; i < plateDefs.length; i++) {
    const [gap, len, w] = plateDefs[i];
    const zs = i === 0 ? -10 : z + gap; const ze = zs + len;
    const xo = i === 0 ? 0 : (hash1(i * 7.1) - 0.5) * 3;
    const p = makeSlab(ev, g, m, m.grass, CX + xo, 0, (zs + ze) / 2, w, len, 9, "grass");
    p.zEnd = ze; C.plates.push(p);
    if (i > 0) {
      // lips that make the crack narrow at first; they break away as you come close (the crack widens)
      const lip = gap * 0.32;
      const la = makeSlab(ev, g, m, m.grass, CX + C.plates[i - 1].bx - CX, 0, z + lip / 2, w * 0.8, lip, 3, "grass");
      const lb = makeSlab(ev, g, m, m.grass, CX + xo, 0, zs - lip / 2, w * 0.8, lip, 3, "grass");
      la.crack = z; lb.crack = z; C.lips.push(la, lb);
    }
    z = ze;
  }
  C.s1End = z; // ~108
  await yieldF();

  // ---------------- S2: the bridge snapping plank by plank (z 108 .. 204) ----------------
  const ab1 = makeSlab(ev, g, m, m.stone, CX, 0, 111, 6, 6, 6, "stone"); ab1.fixed = true;
  const nP = 82, z0 = 114;
  const missing = new Set([18, 19, 40, 41, 42, 62, 63]);
  const pg = new T.BoxGeometry(3.6, 0.18, 0.92);
  const planks = new T.InstancedMesh(pg, m.plank, nP); planks.castShadow = true; planks.receiveShadow = true; root.add(planks);
  C.planks = planks; C.plankState = new Float32Array(nP * 3); // y, vy, rot
  for (let i = 0; i < nP; i++) { C.plankZ.push(z0 + i + 0.5); C.plankState[i * 3] = missing.has(i) ? -999 : -0.09; }
  for (let i = 0; i < nP; i += 2) {
    if (missing.has(i) || missing.has(i + 1)) { C.plankCols.push(null); continue; }
    C.plankCols.push(addBox(ev, CX, -0.15, z0 + i + 1, 3.6, 0.3, 2, "wood"));
  }
  const ab2 = makeSlab(ev, g, m, m.stone, CX, 0, 200, 6, 8, 6, "stone"); ab2.fixed = true;
  C.ab = [ab1, ab2];
  // the river below, draining into the void
  const water = new T.Mesh(g.box, m.water); water.scale.set(160, 0.2, 40); water.position.set(CX, -14, 156); root.add(water); C.water = water;
  // rope rails (visual)
  for (let s = -1; s <= 1; s += 2) { const r = new T.Mesh(g.box, m.plank); r.scale.set(0.08, 0.08, 82); r.position.set(CX + s * 1.85, 0.9, 155); root.add(r); C["rail" + s] = r; }
  await yieldF();

  // ---------------- S3: floating rat-field chunks bobbing (z 204 .. 299) ----------------
  const cz = [210, 219, 228.5, 238, 247.5, 257, 266.5, 276, 285.5];
  const cxo = [0, 2.5, -1, -3, 0.5, 3, 0, -2.5, 0];
  for (let i = 0; i < cz.length; i++) {
    const p = makeSlab(ev, g, m, m.grass, CX + cxo[i], 0.3 + i * 0.2, cz[i], 6, 6, 7, "grass");
    p.amp = 0.6; p.ph = i * Math.PI / 3; C.chunks.push(p);
    // haystack decor on a few
    if (i % 3 === 1) { const h = new T.Mesh(g.box, m.dirt); h.scale.set(1.4, 1.1, 1.4); h.position.set(1.6, 0.55, -1.4); h.rotation.y = 0.5; p.grp.add(h); }
  }
  const p3 = makeSlab(ev, g, m, m.grass, CX, 2.2, 295, 8, 8, 8, "grass"); p3.fixed = true; C.p3 = p3;
  await yieldF();

  // ---------------- S4: village rooftops (z 302 .. 387) ----------------
  const roofShape = new T.Shape(); roofShape.moveTo(-3.8, 0); roofShape.lineTo(3.8, 0); roofShape.lineTo(0, 2.1); roofShape.lineTo(-3.8, 0);
  const roofGeo = new T.ExtrudeGeometry(roofShape, { depth: 8.6, bevelEnabled: false }); roofGeo.translate(0, 0, -4.3);
  C.roofGeo = roofGeo;
  const hx = [0, 1.5, -1.5, 1.0, -1.0, 2.0, 0, -1.5];
  const ph = phys(ev);
  for (let i = 0; i < 8; i++) {
    const zc = 306 + i * 11, ridge = 3.0 + i * 0.5, x = CX + hx[i];
    const grp = new T.Group(); grp.position.set(x, 0, zc); root.add(grp);
    const walls = new T.Mesh(g.box, m.plaster); walls.scale.set(7, 8, 8); walls.position.y = ridge - 2 - 4; walls.castShadow = true; grp.add(walls);
    const roof = new T.Mesh(roofGeo, m.roof); roof.position.y = ridge - 2.1; roof.castShadow = true; roof.receiveShadow = true; grp.add(roof);
    const chim = new T.Mesh(g.box, m.stone); chim.scale.set(0.8, 1.6, 0.8); chim.position.set(2.0, ridge - 0.6, 2.4); grp.add(chim);
    const ids = [];
    if (ph) {
      try {
        ids.push(ph.addRamp({ from: { x: x - 3.6, y: ridge - 1.98, z: zc }, to: { x: x - 0.15, y: ridge, z: zc }, width: 8, surface: "stone", tag: TAG }));
        ids.push(ph.addRamp({ from: { x: x + 3.6, y: ridge - 1.98, z: zc }, to: { x: x + 0.15, y: ridge, z: zc }, width: 8, surface: "stone", tag: TAG }));
      } catch (e) { console.warn("[events] ramp", e); }
      ids.push(addBox(ev, x, ridge - 0.15, zc, 0.6, 0.3, 8, "stone"));
    }
    C.houses.push({ grp, ids, x, z: zc, ridge, sink: 0, falling: false });
  }
  // decorative houses tilting and sliding into the void beside the run
  for (let i = 0; i < 6; i++) {
    const s = i % 2 ? 1 : -1;
    const grp = new T.Group(); grp.position.set(CX + s * (15 + hash1(i) * 8), -2, 305 + i * 15); root.add(grp);
    const w = new T.Mesh(g.box, m.plaster); w.scale.set(6, 6, 7); w.position.y = 3; grp.add(w);
    const r = new T.Mesh(roofGeo, m.roof); r.scale.set(0.85, 1, 0.85); r.position.y = 6; grp.add(r);
    C.deco.push({ grp, s, bx: grp.position.x, by: -2, t: hash1(i * 3) * 10 });
  }
  await yieldF();

  // ---------------- S5: guard-post wall top, towers falling (z 390 .. 486) ----------------
  const segs = [[390, 414], [416.5, 438], [441, 462], [464.5, 486]];
  for (const [a, b] of segs) {
    const len = b - a, zc = (a + b) / 2;
    const wm = new T.Mesh(g.box, m.stone); wm.scale.set(1.6, 18, len); wm.position.set(CX, 6 - 9, zc); wm.castShadow = true; wm.receiveShadow = true; root.add(wm);
    C.wall.push({ mesh: wm, cid: addBox(ev, CX, 5.7, zc, 1.6, 0.6, len, "stone") });
  }
  const merl = new T.InstancedMesh(g.box, m.stone, 120); let mi = 0;
  for (const [a, b] of segs) for (let zz = a + 0.8; zz < b - 0.4 && mi < 120; zz += 1.6) for (let s = -1; s <= 1 && mi < 120; s += 2) {
    C.mtx.compose(C.v.set(CX + s * 0.72, 6.25, zz), C.q.identity(), C.s.set(0.16, 0.5, 0.7)); merl.setMatrixAt(mi++, C.mtx);
  }
  merl.count = mi; root.add(merl);
  const tz = [403, 427, 452, 476];
  for (let i = 0; i < tz.length; i++) {
    const side = i % 2 ? -1 : 1;
    const pivot = new T.Group(); pivot.position.set(CX + side * 5, -8, tz[i]); root.add(pivot);
    const tw = new T.Mesh(g.tower, m.stone); tw.position.y = 8; tw.castShadow = true; pivot.add(tw);
    const tr = new T.Mesh(g.towerRoof, m.roof); tr.position.y = 17.5; pivot.add(tr);
    C.towers.push({ pivot, side, z: tz[i], state: 0, t: 0, decal: null });
  }
  await yieldF();

  // ---------------- S6: stairs in the sky rising up to the castle gate (z 488 .. 612) ----------------
  for (let k = 0; k < 15; k++) {
    const p = makeSlab(ev, g, m, m.cobble, CX + 1.5 * Math.sin(k * Math.PI / 2), 6.9 + k * 0.9, 490.2 + k * 6.2, 4, 4, 5, "stone");
    p.risen = false; p.rt = 0; C.steps.push(p);
  }
  const gp = makeSlab(ev, g, m, m.stone, CX, 18, 598.5, 14, 27, 10, "stone"); gp.fixed = true; C.gatePad = gp;
  const gate = new T.Group(); gate.position.set(CX, 18, 600); root.add(gate);
  for (let s = -1; s <= 1; s += 2) {
    const t = new T.Mesh(g.tower, m.stone); t.scale.set(1.6, 1, 1.6); t.position.set(s * 6.5, 8, 0); t.castShadow = true; gate.add(t);
    const r = new T.Mesh(g.towerRoof, m.roof); r.scale.set(1.6, 1.4, 1.6); r.position.set(s * 6.5, 18, 0); gate.add(r);
  }
  const arch = new T.Mesh(g.box, m.stone); arch.scale.set(10, 4, 3); arch.position.set(0, 9, 0); gate.add(arch);
  const glow = new T.Mesh(new T.PlaneGeometry(7, 7), m.gateGlow); glow.position.set(0, 3.5, 0.2); gate.add(glow); C.gateGlow = glow;
  // floating debris all around
  const deb = new T.InstancedMesh(new T.IcosahedronGeometry(1, 0), m.rock, 160);
  C.debrisData = new Float32Array(160 * 6);
  for (let i = 0; i < 160; i++) {
    const s = hash1(i * 1.7) < 0.5 ? -1 : 1;
    const d = C.debrisData;
    d[i * 6] = CX + s * (22 + hash1(i * 2.3) * 70); d[i * 6 + 1] = -40 + hash1(i * 3.1) * 80; d[i * 6 + 2] = -20 + hash1(i * 4.7) * 640;
    d[i * 6 + 3] = 0.6 + hash1(i * 5.3) * 2.4; d[i * 6 + 4] = 0.3 + hash1(i * 6.1) * 1.4; d[i * 6 + 5] = hash1(i * 7.9) * 6;
  }
  root.add(deb); C.debris = deb;
  setAllEnabled(ev, false);
  C.built = true;
  try {
    if (ev.world && typeof ev.world.registerZone === "function" && !C.registered) {
      ev.world.registerZone({ id: "collapse", name: "The Collapse", region: "none", atmo: "collapse", music: "chase",
        bounds: { x0: CX - 130, z0: -80, x1: CX + 130, z1: 700, y0: -200, y1: 300 }, spawn: { pos: { x: CX, y: 0.1, z: 4 }, yaw: 0 }, root });
      C.registered = true;
    }
  } catch (e) { console.warn("[events] registerZone collapse", e); }
}

function allPieces() { return C.plates.concat(C.lips, C.chunks, C.steps, C.ab, [C.p3, C.gatePad]); }
function setAllEnabled(ev, on) {
  for (const p of allPieces()) enable(ev, p.cid, on);
  for (const id of C.plankCols) enable(ev, id, on);
  for (const h of C.houses) for (const id of h.ids) enable(ev, id, on);
  for (const w of C.wall) enable(ev, w.cid, on);
}

function resetSection(ev, k) {
  const T = ev.THREE;
  if (k === 0) { for (const p of C.plates) resetPiece(ev, p); for (const p of C.lips) resetPiece(ev, p); C.house.visible = true; C.house.position.y = 0; }
  if (k === 1) {
    C.frontOn = false; C.front = 112;
    const st = C.plankState;
    for (let i = 0; i < C.plankZ.length; i++) { if (st[i * 3] !== -999) { st[i * 3] = -0.09; st[i * 3 + 1] = 0; st[i * 3 + 2] = 0; } }
    for (let j = 0; j < C.plankCols.length; j++) { const id = C.plankCols[j]; if (id !== null) { enable(ev, id, true); } }
    writePlanks();
    C.water.position.y = -14;
  }
  if (k === 2) for (const p of C.chunks) resetPiece(ev, p);
  if (k === 3) for (const h of C.houses) { h.sink = 0; h.falling = false; h.grp.position.y = 0; h.grp.visible = true; for (const id of h.ids) enable(ev, id, true); }
  if (k === 4) for (const t of C.towers) { t.state = 0; t.t = 0; t.pivot.visible = true; t.pivot.rotation.set(0, 0, 0); }
  if (k === 5) for (const p of C.steps) { resetPiece(ev, p); p.risen = false; p.rt = 0; p.y = p.by - 16; p.grp.position.y = p.y; moveBox(ev, p.cid, p.x, p.y - 0.3, p.z); }
  if (T) { /* noop: keeps signature symmetrical */ }
}
function writePlanks() {
  const st = C.plankState, m = C.mtx;
  for (let i = 0; i < C.plankZ.length; i++) {
    const y = st[i * 3];
    if (y === -999 || y < -60) { m.makeScale(0, 0, 0); m.setPosition(CX, -999, C.plankZ[i]); }
    else { C.e.set(st[i * 3 + 2], 0, st[i * 3 + 2] * 0.5); C.q.setFromEuler(C.e); m.compose(C.v.set(CX, y, C.plankZ[i]), C.q, C.s.set(1, 1, 1)); }
    C.planks.setMatrixAt(i, m);
  }
  C.planks.instanceMatrix.needsUpdate = true;
}

export function deactivate(ev) {
  if (!C || !C.built) return;
  C.active = false; C.root.visible = false; setAllEnabled(ev, false);
  const gnt = ev.models.giant; if (gnt) gnt.setVisible(false);
}
function activate(ev) {
  C.active = true; C.root.visible = true; C.end = false; C.cp = 0; C.t = 0;
  setAllEnabled(ev, true);
  for (let k = 0; k < 6; k++) resetSection(ev, k);
}

function respawn(ev) {
  const c = CP[C.cp];
  safe(ev.ui, "glitch", 0.5, 0.6);
  ev.teleport({ x: CX + c[0], y: c[1], z: c[2] }, 0); ev.heal();
  for (let k = C.cp; k < 6; k++) resetSection(ev, k);
  // the section you respawn in is intact; also keep the checkpoint anchor (piece under the checkpoint) in place
  ev.emit("player:respawn", { zone: "collapse" });
}

export function debugCheckpoint(ev, n) {
  if (!C || !C.active) return false;
  C.cp = clamp(n, 0, 5); respawn(ev); return true;
}

// ------------------------------------------------------------------------------------------------ per frame
export function update(ev, dt) {
  if (!C || !C.active) return;
  const pl = ev.player(); if (!pl) return;
  const pp = pl.position; C.t += dt; const t = C.t;
  // checkpoints by progress (only on firm ground)
  for (let k = 5; k > C.cp; k--) if (pp.z > CP[k][2] - 1 && pl.onGround && pp.y > CP[k][1] - 1.5) { C.cp = k; ev.toast("Checkpoint", "info", 1.2); break; }
  // S1: lips break as you approach the crack; plates behind you sink into the void
  for (const p of C.lips) { if (!p.falling && !p.gone && pp.z > p.crack - 17) dropPiece(ev, p); updateFall(ev, p, dt); }
  for (let i = 0; i < C.plates.length; i++) {
    const p = C.plates[i]; if (!p.falling && !p.gone && pp.z > p.zEnd + 14) dropPiece(ev, p); updateFall(ev, p, dt);
  }
  if (C.house.visible) { if (pp.z > 16) { C.house.position.y -= dt * (2 + C.house.position.y * -0.6); C.house.rotation.x += dt * 0.05; if (C.house.position.y < -40) C.house.visible = false; } }
  // ambient cracking debris along the run
  if (Math.random() < dt * 3) ev.fx.burst(pp.x + (Math.random() - 0.5) * 16, pp.y - 0.5, pp.z + 6 + Math.random() * 20, 6, 2.5, 0.25, 0.2, 0.18, 1.2, 0.3, 6, 1);
  // S2: the bridge front chases you
  if (!C.frontOn && pp.z > 118 && pp.z < 200 && pp.y > -3) { C.frontOn = true; C.front = 112; ev.sfx("collapse", { x: CX, y: 0, z: 114 }, 0.9); }
  if (C.frontOn) {
    if (C.front < 200) C.front += 4.6 * dt;
    const st = C.plankState; let moved = false;
    for (let i = 0; i < C.plankZ.length; i++) {
      const y = st[i * 3]; if (y === -999 || y < -60) continue;
      if (C.plankZ[i] < C.front) { st[i * 3 + 1] += 14 * dt; st[i * 3] -= st[i * 3 + 1] * dt; st[i * 3 + 2] += dt * (1.5 + (i % 3)); moved = true; }
    }
    for (let j = 0; j < C.plankCols.length; j++) { const id = C.plankCols[j]; if (id !== null && 114 + j * 2 + 1 < C.front) enable(ev, id, false); }
    if (moved) writePlanks();
    C.water.position.y -= dt * 0.8;
  }
  // S3: chunks bob (neighbours roughly in phase so the jumps stay fair)
  for (const p of C.chunks) {
    if (p.falling) { updateFall(ev, p, dt); continue; }
    if (p.gone) continue;
    p.y = p.by + Math.sin(t * (Math.PI * 2 / 4) + p.ph) * p.amp;
    p.grp.position.y = p.y; moveBox(ev, p.cid, p.x, p.y - 0.3, p.z);
    if (pp.z > p.z + 16) dropPiece(ev, p);
  }
  // S4: houses behind you sink; decorative houses slide off into the void
  for (const h of C.houses) {
    if (!h.falling && pp.z > h.z + 18) { h.falling = true; for (const id of h.ids) enable(ev, id, false); ev.sfx("collapse", h.grp.position, 0.5); }
    if (h.falling && h.grp.visible) { h.sink += dt * (3 + h.sink); h.grp.position.y = -h.sink; h.grp.rotation.z = h.sink * 0.01; if (h.sink > 50) h.grp.visible = false; }
  }
  for (const d of C.deco) {
    d.t += dt; const k = (d.t % 14) / 14;
    d.grp.position.x = d.bx + d.s * k * 30; d.grp.position.y = d.by - k * k * 40; d.grp.rotation.z = d.s * k * 0.9; d.grp.rotation.x = k * 0.3;
  }
  // S5: towers lean onto the wall and shatter
  for (const tw of C.towers) {
    if (tw.state === 0 && pp.z > tw.z - 24 && pp.z < tw.z + 4 && pp.y > 3) {
      tw.state = 1; tw.t = 0; ev.sfx("rumble", tw.pivot.position, 0.9);
      tw.decal = ev.fx.decal("rect", CX - 2, 6, tw.z, 1.9, 1.4, { yaw: Math.PI / 2, length: 4, hold: 0.1 });
    }
    if (tw.state === 1) {
      tw.t += dt; const k = clamp(tw.t / 1.4, 0, 1);
      tw.pivot.rotation.z = tw.side * k * k * 0.33;
      if (k >= 1) {
        tw.state = 2; ev.shake(0.5, 0.5); ev.sfx("collapse", tw.pivot.position, 1);
        ev.fx.burst(CX, 7, tw.z, 50, 7, 0.4, 0.38, 0.34, 1.6, 0.5, 9, 1);
        tw.pivot.visible = false;
        if (Math.abs(pp.z - tw.z) < 2.1 && Math.abs(pp.x - CX) < 2.5 && pp.y > 4) { safe(pl, "knockback", { x: -tw.side * 9, y: 5, z: 0 }); }
      }
    }
  }
  // S6: steps rise into place as you approach; ones behind you fall
  for (const p of C.steps) {
    if (p.falling) { updateFall(ev, p, dt); continue; }
    if (p.gone) continue;
    if (!p.risen && pp.z > p.z - 22 && pp.z > 486) { p.risen = true; p.rt = 0; ev.sfx("rock_tumble", p.grp.position, 0.5); }
    if (p.risen && p.rt < 1.4) {
      p.rt += dt; const k = clamp(p.rt / 1.4, 0, 1); const e = 1 - Math.pow(1 - k, 3);
      p.y = p.by - 16 + 16 * e + Math.sin(k * Math.PI) * 0.4; p.grp.position.y = p.y; moveBox(ev, p.cid, p.x, p.y - 0.3, p.z);
    }
    if (pp.z > p.z + 12) dropPiece(ev, p);
  }
  if (C.gateGlow) C.gateGlow.material.opacity = 0.65 + Math.sin(t * 3) * 0.2;
  // end: through the gate
  if (pp.z > 596.5 && pp.z < 606 && Math.abs(pp.x - CX) < 4.5 && pp.y > 16) C.end = true;
  // debris drift (instanced, no allocation)
  const d = C.debrisData, m = C.mtx;
  const n = ev.quality() <= 0 ? 80 : 160; C.debris.count = n;
  for (let i = 0; i < n; i++) {
    d[i * 6 + 1] += d[i * 6 + 4] * dt; if (d[i * 6 + 1] > 45) d[i * 6 + 1] = -45;
    C.e.set(t * 0.3 + d[i * 6 + 5], t * 0.2 + i, 0); C.q.setFromEuler(C.e);
    m.compose(C.v.set(d[i * 6], d[i * 6 + 1], d[i * 6 + 2]), C.q, C.s.setScalar(d[i * 6 + 3])); C.debris.setMatrixAt(i, m);
  }
  C.debris.instanceMatrix.needsUpdate = true;
  // the Hollow, huge in the sky, following and swiping
  const gnt = ev.models.giant;
  if (gnt && gnt.root.visible) {
    gnt.position.set(CX + 62, -26, pp.z + 34); gnt.yaw = -Math.PI / 2 - 0.35; gnt.mode = "idle";
    C.swipeT -= dt;
    if (C.swipeT <= 0) {
      C.swipeT = 7 + Math.random() * 4; gnt.play(Math.random() < 0.5 ? "swipeR" : "swipeL", 1.6);
      ev.after(1.1, () => { if (!C.active) return; ev.shake(0.45, 0.7); ev.sfx("collapse", pp, 0.8); const p2 = pl.position; ev.fx.burst(p2.x + 14, p2.y + 2, p2.z + 20, 60, 9, 0.3, 0.27, 0.25, 2, 0.6, 7, 1); });
    }
  }
}

// ------------------------------------------------------------------------------------------------ the sequence
export async function collapse(ev, seq) {
  ev.setPhase("collapse");
  seq.defer(() => { if (seq.aborted) safe(ev.ui, "fade", 0, 0.5); });
  await seq.fade(1, 0.3, "#000");
  if (!C || !C.built) await build(ev, seq);
  seq.check();
  activate(ev);
  seq.defer(() => deactivate(ev));
  const ph = phys(ev);
  safe(ph, "setKillY", "none", -32); seq.defer(() => safe(ph, "setKillY", "none", -40));
  ev.teleport({ x: CX, y: 0.1, z: 4 }, 0);
  safe(ev.engine, "showRegion", "none");
  safe(ev.engine, "setAtmosphere", "collapse", { dur: 0.3 });
  safe(ev.audio, "music", "chase", { fade: 0.5 });
  ev.setDeath(() => { respawn(ev); return true; }); seq.defer(() => ev.setDeath(null));
  const gnt = ev.model("giant"); gnt.setHeight(42); gnt.setVisible(true); gnt.mode = "idle";
  for (const c of gnt.cores) c.glow = 0;
  seq.defer(() => { gnt.setVisible(false); gnt.setHeight(60); });
  const T = ev.THREE; ev.target = new T.Vector3(CX, 20, 600); seq.defer(() => { ev.target = null; });
  ev.postfx({ aberration: 0.25, vignette: 0.5 }); seq.defer(() => ev.postfxReset());
  ev.ready();
  await seq.wait(0.3);
  await seq.fade(0, 0.6, "#000");
  safe(ev.ui, "banner", "RUN TO THE CASTLE", "", 2.5);
  await seq.until(() => C.end);
  ev.cine(seq, true);
  safe(ev.audio, "sfx", "portal_enter", { vol: 1 });
  await seq.fade(1, 0.45, "#000");
  return { id: "throne", opts: { fromCollapse: true } };
}
