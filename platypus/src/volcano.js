// PLATYPUS — volcano.js (LEVELS3.md B5): the volcano of level 12.
// Scenes (setScene, behind black): "slope" (the black basalt valley up to the DREAM SHRINE, lava channels to hop,
// steam vents on a 3 s rhythm, the 180 m cone behind), "cell" (the crater rim; Pip's cage on chains over the lava
// lake; the stone bridge that rises when MAGMOR is beaten), "arena" (the crater floor: a lava lake r 40, seven basalt
// islands, crust bridges, rising lava, updrafts) and "cool" (the arena after the fight: crusted, steaming, morning).
//
// Budget: every scene <= 30 draw calls, <= 110k tris. One lava material (shared uniforms), one glow-rock material,
// instanced rocks / islands / bridges / bombs / puffs, camera-following ash + embers (2 points draws), a sky dome.
// Nothing is allocated per frame.

import { mulberry, clamp, lerp, smooth, sstep, TAU, noise3, fbm2, lumpify, createMerger, mat4, heightGrid,
  glowRockMaterial, lavaMaterial, skyDome, particleCloud, GLSL_NOISE } from "./kit3.js";

export function createVolcano(ctx) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.name = "volcano";
  const R = mulberry(0x51ce);
  const rr = (a, b) => a + (b - a) * R();
  const sq = (v) => v * v;
  function sfx(name, a, b, c) { const o = ctx.audio, f = o && o[name]; return typeof f === "function" ? f.call(o, a, b, c) : undefined; }
  function vfx(name, a, b, c, d, e, f) { const o = ctx.fx, fn = o && o[name]; return typeof fn === "function" ? fn.call(o, a, b, c, d, e, f) : undefined; }

  const U = { uTime: { value: 0 }, uGlow: { value: 1 }, uGlowCol: { value: new THREE.Color(0xff5a14) }, uCool: { value: 0 } };
  const rockMat = glowRockMaterial(THREE, U, { flat: false });
  const rockFlat = glowRockMaterial(THREE, U, { flat: true, roughness: 0.85 });
  const lavaMat = lavaMaterial(THREE, U, { scale: 0.2, flowZ: -0.5 });
  const lavaFlow = lavaMaterial(THREE, U, { scale: 0.35, flowZ: -2.2 });

  // ----------------------------------------------------------------------------------------- sky + air
  const sky = skyDome(THREE, { top: 0x1b1414, horizon: 0x6a3a26, bottom: 0x2a1a14, glowCol: 0xff6a1e, glowDir: [0, 0.25, 1], glowK: 0.9, uTime: U.uTime, clouds: 0.9, cloudCol: 0x2a2220 });
  group.add(sky.mesh);
  const ash = particleCloud(THREE, U, { kind: 0, count: 700, box: 34, color: 0x9a918c, size: 0.07, name: "ash", seed: 3 });
  const embers = particleCloud(THREE, U, { kind: 1, count: 420, box: 30, color: 0xff7a26, size: 0.06, name: "embers", seed: 9 });
  group.add(ash.points, embers.points);

  // ----------------------------------------------------------------------------------------- shared pools
  // steam / smoke puffs: one InstancedMesh of soft spheres (per-instance colour), 32 alive at most
  const PUFFS = 32;
  const puffMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });
  const puffGeo = lumpify(THREE, new THREE.IcosahedronGeometry(1, 2), 0.25, 1.4, 4);
  const puffs = new THREE.InstancedMesh(puffGeo, puffMat, PUFFS);
  puffs.name = "puffs"; puffs.frustumCulled = false;
  puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const pf = { x: new Float32Array(PUFFS), y: new Float32Array(PUFFS), z: new Float32Array(PUFFS), vx: new Float32Array(PUFFS), vy: new Float32Array(PUFFS), vz: new Float32Array(PUFFS), t: new Float32Array(PUFFS), life: new Float32Array(PUFFS), s: new Float32Array(PUFFS) };
  let puffNext = 0;
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), tc = new THREE.Color();
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < PUFFS; i++) { puffs.setMatrixAt(i, zeroM); puffs.setColorAt(i, tc.set(0xffffff)); pf.life[i] = 0; }
  function puff(x, y, z, size, hex, vy, life) {
    const i = puffNext; puffNext = (puffNext + 1) % PUFFS;
    pf.x[i] = x; pf.y[i] = y; pf.z[i] = z; pf.vx[i] = rr(-0.4, 0.4); pf.vz[i] = rr(-0.4, 0.4); pf.vy[i] = vy === undefined ? 2.2 : vy;
    pf.t[i] = 0; pf.life[i] = life || 2.4; pf.s[i] = size;
    puffs.setColorAt(i, tc.set(hex === undefined ? 0xe8e4e0 : hex));
    puffs.instanceColor.needsUpdate = true;
  }
  function updatePuffs(dt) {
    for (let i = 0; i < PUFFS; i++) {
      if (pf.life[i] <= 0) continue;
      pf.t[i] += dt;
      const k = pf.t[i] / pf.life[i];
      if (k >= 1) { pf.life[i] = 0; puffs.setMatrixAt(i, zeroM); continue; }
      pf.x[i] += pf.vx[i] * dt; pf.y[i] += pf.vy[i] * dt; pf.z[i] += pf.vz[i] * dt;
      pf.vy[i] *= 1 - dt * 0.5;
      const s = pf.s[i] * (0.4 + 1.4 * Math.sqrt(k)) * (1 - k * k * 0.6);
      tm.compose(tv.set(pf.x[i], pf.y[i], pf.z[i]), tq.identity(), ts.set(s, s * 0.85, s));
      puffs.setMatrixAt(i, tm);
    }
    puffs.instanceMatrix.needsUpdate = true;
  }
  group.add(puffs);

  // lava bombs: glowing rocks on parabolas, a danger circle where they will land
  const NB = 24;
  const bombGeo = lumpify(THREE, new THREE.IcosahedronGeometry(0.5, 1), 0.18, 2.2, 8);
  bombGeo.setAttribute("aGlow", new THREE.BufferAttribute(new Float32Array(bombGeo.attributes.position.count).fill(0.75), 1));
  bombGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(bombGeo.attributes.position.count * 3).fill(0.12), 3));
  const bombMesh = new THREE.InstancedMesh(bombGeo, rockFlat, NB);
  bombMesh.name = "bombs"; bombMesh.frustumCulled = false; bombMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const B = { on: new Uint8Array(NB), sx: new Float32Array(NB), sy: new Float32Array(NB), sz: new Float32Array(NB), x: new Float32Array(NB), z: new Float32Array(NB), y1: new Float32Array(NB), t: new Float32Array(NB), T: new Float32Array(NB), r: new Float32Array(NB), h: new Float32Array(NB), zone: new Int32Array(NB) };
  for (let i = 0; i < NB; i++) bombMesh.setMatrixAt(i, zeroM);
  group.add(bombMesh);
  let bombSpeed = 1;
  const bombs = {
    onLand: null,
    get active() { let n = 0; for (let i = 0; i < NB; i++) n += B.on[i]; return n; },
    // launch one: from (sx, sy, sz) to land at (x, z) after `T` seconds; r = blast radius
    launch(sx, sy, sz, x, z, T, r) {
      let i = -1;
      for (let k = 0; k < NB; k++) if (!B.on[k]) { i = k; break; }
      if (i < 0) return -1;
      T = (T || 1.6) / bombSpeed;
      B.on[i] = 1; B.sx[i] = sx; B.sy[i] = sy; B.sz[i] = sz; B.x[i] = x; B.z[i] = z; B.y1[i] = heightAt(x, z); B.t[i] = 0; B.T[i] = Math.max(0.8, T); B.r[i] = r || 2.2;
      B.h[i] = Math.max(sy, B.y1[i]) + 6 + B.T[i] * 4;
      B.zone[i] = vfx("dangerZone", { shape: "circle", x, z, y: B.y1[i] + 0.05, r: B.r[i], seconds: B.T[i], colorHex: 0xff5a1e });
      return i;
    },
    setSpeed(k) { bombSpeed = clamp(k, 0.3, 2); },
    clear() { for (let i = 0; i < NB; i++) { if (B.on[i] && B.zone[i] >= 0) vfx("dangerCancel", B.zone[i]); B.on[i] = 0; bombMesh.setMatrixAt(i, zeroM); } bombMesh.instanceMatrix.needsUpdate = true; },
  };
  function updateBombs(dt) {
    let any = false;
    for (let i = 0; i < NB; i++) {
      if (!B.on[i]) continue;
      any = true;
      B.t[i] += dt;
      const k = Math.min(1, B.t[i] / B.T[i]);
      const x = lerp(B.sx[i], B.x[i], k), z = lerp(B.sz[i], B.z[i], k);
      // a parabola through (0, sy), (0.5, h), (1, y1)
      const a = B.sy[i], c = B.y1[i], b = B.h[i];
      const y = a * (1 - k) * (1 - 2 * k) + 4 * b * k * (1 - k) + c * k * (2 * k - 1);
      tq.setFromAxisAngle(tv.set(0.6, 0.8, 0).normalize(), B.t[i] * 5 + i);
      const s = 0.9 + 0.5 * B.r[i] / 3;
      tm.compose(tv.set(x, y, z), tq, ts.set(s, s, s));
      bombMesh.setMatrixAt(i, tm);
      if (k >= 1) {
        B.on[i] = 0; bombMesh.setMatrixAt(i, zeroM);
        landFx(B.x[i], B.y1[i], B.z[i], B.r[i]);
        if (bombs.onLand) bombs.onLand(B.x[i], B.z[i], B.r[i]);
        else defaultHit(B.x[i], B.z[i], B.r[i]);
      }
    }
    if (any || bombDirty) { bombMesh.instanceMatrix.needsUpdate = true; bombDirty = any; }
  }
  let bombDirty = false;
  function landFx(x, y, z, r) {
    puff(x, y + 0.4, z, 1.1 * r / 2, 0x2b2522, 2.6, 2);
    puff(x + 0.6, y + 0.2, z - 0.4, 0.8 * r / 2, 0x4a3a33, 1.8, 1.6);
    vfx("embers", x, y + 0.3, z, 0.9, 10);
    vfx("lavaSplash", x, y, z, r / 2);
    vfx("rockDebris", x, y, z, 6);
    vfx("slam", x, z, r * 0.8);
    sfx("eruption", x, z, 0.35);
  }
  function defaultHit(x, z, r) {
    const p = ctx.player;
    if (p && ctx.health && ctx.health.on && sq(p.x - x) + sq(p.z - z) < r * r) ctx.health.damage(1, { x, z, kind: "blast", knock: 5 });
  }

  // =========================================================================================== SCENE: slope
  const slope = new THREE.Group(); slope.name = "slope";
  const pathX = (z) => 7 * Math.sin(z * 0.045);
  const PLAT_Z = 100, SHR = { x: pathX(104), z: 104 };
  const baseY = (z) => { const a = 0.2 * Math.max(z, -10); return z < PLAT_Z - 6 ? a : lerp(a, 0.2 * PLAT_Z, sstep(PLAT_Z - 6, PLAT_Z, z)); };
  // lava channels across the valley: polyline segments, flowing downhill (from upper left to lower right)
  const RIVER_OFF0 = -6.6;
  const CH = [26, 50, 74].map((c, i) => ({ c, ax: pathX(c) + 8.6, az: c + 1.6, bx: pathX(c) + RIVER_OFF0, bz: c - 1.6, half: 0.85 }));
  function segT(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = ((px - ax) * dx + (pz - az) * dz) / l2; return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  function segD(px, pz, ax, az, bx, bz) { const t = segT(px, pz, ax, az, bx, bz); return Math.hypot(ax + (bx - ax) * t - px, az + (bz - az) * t - pz); }
  const VENTS = [{ z: 38 }, { z: 62 }, { z: 86 }].map((v, i) => ({ x: pathX(v.z) + (i % 2 ? 1.2 : -1.0), z: v.z, r: 1.5, phase: i * 1.0, puffing: false, on: true }));
  const RIVER_OFF = RIVER_OFF0; // the long lava river down the left of the valley floor
  function slopeRaw(x, z) {
    const px = pathX(z), d = Math.abs(x - px);
    let h = baseY(z) + 0.25 * fbm2(x * 0.15, z * 0.15, 3);
    const wall = Math.max(0, d - 9.5);
    h += Math.pow(wall, 1.35) * 0.42 + wall * 0.25 * (0.5 + fbm2(x * 0.08 + 9, z * 0.08, 3));
    // the plateau of the shrine
    const ds = Math.hypot(x - SHR.x, z - SHR.z);
    if (ds < 14) h = lerp(h, 0.2 * PLAT_Z + 0.05 * fbm2(x, z, 2), 1 - sstep(9, 14, ds));
    // the river trench on the left
    const dr = Math.abs(x - (px + RIVER_OFF));
    if (dr < 2.8 && z < 96) h -= (1 - sstep(1.4, 2.8, dr)) * 1.6;
    for (const c of CH) {
      const dd = segD(x, z, c.ax + px * 0, c.az, c.bx, c.bz);
      if (dd < 1.8) h -= (1 - sstep(c.half * 0.7, 1.8, dd)) * 0.9;
    }
    return h;
  }
  const SG = heightGrid(THREE, {
    x0: -40, z0: -14, nx: 61, nz: 89, pitch: 1.45, h: slopeRaw,
    c: (x, z, y, s) => {
      const px = pathX(z), d = Math.abs(x - px);
      const n = fbm2(x * 0.3, z * 0.3, 3);
      let col = new THREE.Color(0x2a2624).lerp(new THREE.Color(0x413a36), 0.5 + n * 0.5);
      if (d < 2.2 && z < 98) col.lerp(new THREE.Color(0x5a4c42), 0.55 * (1 - d / 2.2)); // the worn path: ash grey-brown
      if (s > 0.35) col.lerp(new THREE.Color(0x161312), 0.6);                                   // steep basalt: near black
      const ash = sstep(0.1, 0.6, n) * (1 - s);
      col.lerp(new THREE.Color(0x6e6560), ash * 0.35);
      let glow = 0;
      const dr = Math.abs(x - (px + RIVER_OFF));
      if (dr < 2.2) glow = Math.max(glow, (1 - dr / 2.2) * 0.45);
      for (const c of CH) { const dd = segD(x, z, c.ax, c.az, c.bx, c.bz); if (dd < 1.5) glow = Math.max(glow, (1 - dd / 1.5) * 0.4); }
      for (const v of VENTS) { const dv = Math.hypot(x - v.x, z - v.z); if (dv < 1.4) glow = Math.max(glow, (1 - dv / 1.4) * 0.4); }
      return { hex: col.getHex(), glow };
    },
  });
  const slopeGround = new THREE.Mesh(SG.geometry, rockMat);
  slopeGround.receiveShadow = true; slopeGround.name = "slopeGround";
  slope.add(slopeGround);
  // lava ribbons that follow the ground (channels + river)
  function ribbon(pts, half, under, mat) {
    const n = pts.length, pos = new Float32Array(n * 2 * 3), idx = [];
    for (let i = 0; i < n; i++) {
      const [x, z] = pts[i], [x2, z2] = pts[Math.min(n - 1, i + 1)], [x0, z0] = pts[Math.max(0, i - 1)];
      let dx = x2 - x0, dz = z2 - z0; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      for (let s = 0; s < 2; s++) {
        const sx = x + (s ? 1 : -1) * -dz * half, sz = z + (s ? 1 : -1) * dx * half;
        pos[(i * 2 + s) * 3] = sx; pos[(i * 2 + s) * 3 + 1] = slopeRaw(x, z) + under; pos[(i * 2 + s) * 3 + 2] = sz;
      }
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.name = "lavaRibbon"; return m;
  }
  const chanLava = [];
  for (const c of CH) { const pts = []; for (let i = 0; i <= 30; i++) pts.push([lerp(c.ax, c.bx, i / 30), lerp(c.az, c.bz, i / 30)]); chanLava.push(pts); }
  // merge the three channels into one mesh
  {
    const mg = createMerger(THREE, []);
    for (const pts of chanLava) mg.add(ribbon(pts, 1.25, 0.32, lavaFlow).geometry);
    const pts = []; for (let z = -14; z <= 96; z += 2) pts.push([pathX(z) + RIVER_OFF, z]);
    mg.add(ribbon(pts, 1.6, 1.05, lavaFlow).geometry);
    const lv = new THREE.Mesh(mg.build(), lavaFlow); lv.name = "slopeLava"; slope.add(lv);
  }
  // steam vents on the path (puff on a 3 s rhythm, each a beat apart)
  // boulders and spires
  const rockGeo = lumpify(THREE, new THREE.DodecahedronGeometry(1, 1), 0.28, 0.9, 2);
  rockGeo.setAttribute("aGlow", new THREE.BufferAttribute(new Float32Array(rockGeo.attributes.position.count), 1));
  rockGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(rockGeo.attributes.position.count * 3).fill(0.16), 3));
  const slopeRocks = new THREE.InstancedMesh(rockGeo, rockFlat, 70);
  slopeRocks.castShadow = true; slopeRocks.receiveShadow = true; slopeRocks.name = "slopeRocks";
  const colliders = [];
  {
    let n = 0;
    for (let i = 0; i < 400 && n < 70; i++) {
      const z = rr(-10, 110), side = R() < 0.5 ? -1 : 1, d = rr(4.5, 17), x = pathX(z) + side * d;
      if (Math.abs(x - (pathX(z) + RIVER_OFF)) < 3.6) continue;
      if (Math.hypot(x - SHR.x, z - SHR.z) < 8) continue;
      let bad = false; for (const c of CH) if (segD(x, z, c.ax, c.az, c.bx, c.bz) < 2.5) bad = true;
      if (bad) continue;
      const s = d < 9 ? rr(0.35, 0.9) : rr(0.9, 2.6), y = slopeRaw(x, z);
      tm.compose(tv.set(x, y + s * 0.2, z), tq.setFromEuler(new THREE.Euler(rr(0, 3), rr(0, 6), rr(0, 3))), ts.set(s, s * rr(0.6, 1.4), s));
      slopeRocks.setMatrixAt(n++, tm);
      if (d < 10 && s > 0.6) colliders.push({ x, z, r: s * 0.85, on: true, scene: "slope" });
    }
    slopeRocks.count = n;
  }
  slope.add(slopeRocks);
  // the far cone (180 m) with lava streaks and a glowing crater mouth, and the ash plume
  const CONE = { x: 0, z: 250 };
  {
    const ring = 34, seg = 72, pos = [], col = [], glow = [], idx = [];
    const c = new THREE.Color();
    for (let j = 0; j <= ring; j++) {
      const k = j / ring, r = lerp(175, 26, k), y = 182 * Math.pow(k, 1.45) - 6;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, n = noise3(Math.cos(a) * 3, k * 6, Math.sin(a) * 3);
        const rad = r * (1 + 0.05 * n) + (j === ring ? 0 : 4 * noise3(a * 5, k * 13, 1));
        pos.push(CONE.x + Math.sin(a) * rad, y + n * 3 * (1 - k), CONE.z + Math.cos(a) * rad);
        c.set(0x231e1c).lerp(new THREE.Color(0x4b423d), 0.5 + 0.5 * noise3(a * 9, k * 20, 4));
        if (k > 0.85) c.lerp(new THREE.Color(0x5a5552), (k - 0.85) * 4);
        col.push(c.r, c.g, c.b);
        // lava streaks: a few channels running down from the rim
        const st = Math.max(0, Math.cos(a * 5 + noise3(k * 3, a, 2) * 1.5) - 0.86) * 7;
        glow.push(clamp(st * (0.35 + 0.65 * k), 0, 1) * (k < 0.97 ? 1 : 0) + (j === ring ? 0.9 : 0));
      }
    }
    for (let j = 0; j < ring; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("aGlow", new THREE.Float32BufferAttribute(glow, 1)); g.setIndex(idx); g.computeVertexNormals();
    const cone = new THREE.Mesh(g, rockMat); cone.name = "cone"; slope.add(cone);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(25, 32).rotateX(-Math.PI / 2), lavaMat); mouth.position.set(CONE.x, 172, CONE.z); slope.add(mouth);
  }
  const PLUME = 12;
  const plumeMat = new THREE.MeshLambertMaterial({ color: 0x3a3230, transparent: true, opacity: 0.82, depthWrite: false, emissive: 0x3a1206 });
  const plume = new THREE.InstancedMesh(puffGeo, plumeMat, PLUME); plume.name = "plume"; plume.frustumCulled = false; plume.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  slope.add(plume);
  // the DREAM SHRINE: five obsidian runestones in a ring around a flat warm stone
  const RUNE_N = 5, RUNE_R = 4.6;
  const runeU = { uRune: { value: new Float32Array(RUNE_N) }, uTime: U.uTime };
  const runePts = [];
  const shrineY = 0.2 * PLAT_Z;
  {
    const mg = createMerger(THREE, ["aGlow", "aIdx"]);
    for (let i = 0; i < RUNE_N; i++) {
      const a = Math.PI + (i / RUNE_N) * TAU, x = SHR.x + Math.sin(a) * RUNE_R, z = SHR.z + Math.cos(a) * RUNE_R;
      runePts.push({ x, z, yaw: a + Math.PI, y: shrineY });
      const h = 2.1 + (i % 2) * 0.35;
      const g = lumpify(THREE, new THREE.BoxGeometry(0.85, h, 0.42, 3, 6, 2), 0.05, 2.5, i + 1);
      mg.add(g, mat4(THREE, x, shrineY + h / 2 - 0.1, z, rr(-0.05, 0.05), a + Math.PI, rr(-0.04, 0.04)), 0x0c0b10, {
        aGlow: 0, aIdx: i,
      });
      // the carved glyph on the face toward the centre: little bars set into the stone (they glow when lit)
      const GL = [[[0, 0.55, 0.06, 0.5]], [[-0.15, 0.9, 0.05, 0.3], [0.15, 0.9, 0.05, 0.3], [0, 1.2, 0.36, 0.05]], [[0, 0.75, 0.05, 0.6], [-0.12, 0.95, 0.24, 0.05], [0.12, 0.6, 0.24, 0.05]],
        [[-0.12, 0.85, 0.05, 0.5], [0.12, 0.85, 0.05, 0.5], [0, 1.1, 0.29, 0.05], [0, 0.6, 0.29, 0.05]], [[0, 0.85, 0.05, 0.55], [-0.13, 1.05, 0.2, 0.05], [0.13, 1.05, 0.2, 0.05], [0, 0.55, 0.3, 0.05]]][i];
      for (const [gx, gy, gw, gh] of GL) {
        const ox = -Math.sin(a) * 0.228, oz = -Math.cos(a) * 0.228;
        mg.add(new THREE.BoxGeometry(gw, gh, 0.03), mat4(THREE, x + Math.cos(a) * gx + ox, shrineY + gy, z - Math.sin(a) * gx + oz, 0, a + Math.PI, 0), 0x1a1030, { aGlow: 1, aIdx: i });
        mg.add(new THREE.BoxGeometry(gw, gh, 0.03), mat4(THREE, x + Math.cos(a) * gx + ox, shrineY + gy + 0.75, z - Math.sin(a) * gx + oz, 0, a + Math.PI, 0), 0x1a1030, { aGlow: 1, aIdx: i });
      }
    }
    // the warm stone (the bed) and a low step
    const bed = lumpify(THREE, new THREE.CylinderGeometry(1.5, 1.7, 0.5, 40, 3, false), 0.05, 2.2, 5);
    mg.add(bed, mat4(THREE, SHR.x, shrineY + 0.2, SHR.z, 0, 0, 0, 1.3, 1, 0.9), 0x2a201c, { aGlow: (vx, vy, vz) => (vy > shrineY + 0.3 ? 0.15 + 0.5 * clamp(noise3(vx * 2.5, 0, vz * 2.5) * 2, 0, 1) : 0.05), aIdx: 5 });
    const geo = mg.build();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.3 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRune = runeU.uRune; sh.uniforms.uTime = U.uTime; sh.uniforms.uGlow = U.uGlow;
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aGlow; attribute float aIdx; varying float vGl; varying float vIdx;")
        .replace("#include <fog_vertex>", "#include <fog_vertex>\nvGl = aGlow; vIdx = aIdx;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uRune[5]; uniform float uTime, uGlow; varying float vGl; varying float vIdx;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
          { int i = int(vIdx + 0.5); float on = 0.0;
            for (int k = 0; k < 5; k++) if (k == i) on = uRune[k];
            if (i == 5) totalEmissiveRadiance += vec3(1.0, 0.35, 0.08) * vGl * (0.5 + 0.2 * sin(uTime * 1.3)) * uGlow;
            else totalEmissiveRadiance += mix(vec3(0.3, 0.1, 0.5) * 0.25, vec3(0.75, 0.55, 1.4), on) * vGl * (0.4 + on * 1.4); }`);
    };
    const shrine = new THREE.Mesh(geo, m); shrine.name = "shrine"; shrine.castShadow = true; shrine.receiveShadow = true;
    slope.add(shrine);
    for (const p of runePts) colliders.push({ x: p.x, z: p.z, r: 0.55, on: true, scene: "slope" });
  }
  let runeLit = 0;
  const runeTarget = new Float32Array(RUNE_N);
  const runes = Object.assign(runePts, {
    light(i, on) { if (i < 0 || i >= RUNE_N) return; runeTarget[i] = on ? 1 : 0; if (on) runeLit |= 1 << i; else runeLit &= ~(1 << i); if (on) vfx("sparkle", runePts[i].x, shrineY + 1.6, runePts[i].z, 10, 0xb488ff); },
    get lit() { return runeLit; },
    reset() { runeLit = 0; for (let i = 0; i < RUNE_N; i++) { runeTarget[i] = 0; runeU.uRune.value[i] = 0; } },
    nearest(x, z, max) { let b = -1, bd = (max || 1.8) ** 2; for (let i = 0; i < RUNE_N; i++) { const d = sq(x - runePts[i].x) + sq(z - runePts[i].z); if (d < bd) { bd = d; b = i; } } return b; },
  });
  group.add(slope);

  // =========================================================================================== SCENE: cell (crater rim)
  const cell = new THREE.Group(); cell.name = "cell";
  const LAKE_Y = -22;
  function craterWall(r0, y0, r1, y1, seg, rings, glowLow, seed, topFn) {
    const pos = [], col = [], gl = [], idx = [];
    const c = new THREE.Color();
    for (let j = 0; j <= rings; j++) {
      const k = j / rings;
      for (let i = 0; i <= seg; i++) {
        const a = (i / seg) * TAU, n = noise3(Math.cos(a) * 4 + seed, k * 5, Math.sin(a) * 4);
        const r = lerp(r0, r1, Math.pow(k, 0.8)) + n * 2.2 + 1.2 * noise3(a * 12, k * 18, seed);
        const yt = topFn ? topFn(a) : y1;
        pos.push(Math.sin(a) * r, lerp(y0, yt, k) + n * 1.5 * (yt - y0 > 8 ? 1 : 0.2), Math.cos(a) * r);
        c.set(0x1a1716).lerp(new THREE.Color(0x3c3431), 0.5 + 0.5 * noise3(a * 20, k * 30, seed + 2));
        col.push(c.r, c.g, c.b);
        const fall = Math.max(0, Math.cos(a * 7 + seed) - 0.93) * 14 * (1 - k);
        gl.push(clamp((1 - sstep(0, glowLow, k)) * 0.9 + fall, 0, 1));
      }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("aGlow", new THREE.Float32BufferAttribute(gl, 1)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  {
    const w = new THREE.Mesh(craterWall(40, LAKE_Y - 1, 50, 20, 96, 24, 0.22, 1, (a) => lerp(20 + 6 * Math.sin(a * 3), -1.5, sstep(-0.82, -0.96, Math.cos(a)))), rockMat); w.name = "rimWall"; cell.add(w);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(43, 48).rotateX(-Math.PI / 2), lavaMat); lake.position.y = LAKE_Y; lake.name = "rimLake"; cell.add(lake);
  }
  // the rim ledge where the player stands (south side), the outer slope falling away beyond it
  function rimRaw(x, z) {
    const r = Math.hypot(x, z);
    let h = 0.25 * fbm2(x * 0.2, z * 0.2, 3);
    if (r < 46) h = lerp(h, LAKE_Y, sstep(46, 41, r));
    if (r > 58) h -= (r - 58) * 0.6;
    h += Math.max(0, Math.abs(x) - 12) * 0.5 * (r > 45 ? 1 : 0);
    // the bridge abutment
    if (Math.abs(x) < 2 && z > -47 && z < -43) h = Math.max(h, 0);
    return h;
  }
  const RG = heightGrid(THREE, {
    x0: -24, z0: -68, nx: 34, nz: 22, pitch: 1.5, h: rimRaw,
    c: (x, z, y, s) => ({ hex: new THREE.Color(0x2b2624).lerp(new THREE.Color(0x544943), 0.5 + 0.5 * fbm2(x * 0.4, z * 0.4, 2)).getHex(), glow: y < -3 ? 0.5 : 0 }),
  });
  const rimGround = new THREE.Mesh(RG.geometry, rockMat); rimGround.receiveShadow = true; rimGround.name = "rimGround"; cell.add(rimGround);
  // the arch over the crater, the chains and Pip's cage
  const CAGE = { x: 0, z: 0, top: 8, low: 0.15 };
  {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-48, -4, 4), new THREE.Vector3(-30, 16, 2), new THREE.Vector3(0, 24, 0), new THREE.Vector3(30, 16, -2), new THREE.Vector3(48, -4, -4)]);
    const tube = lumpify(THREE, new THREE.TubeGeometry(curve, 48, 2.6, 9, false), 0.9, 0.35, 6);
    tube.setAttribute("aGlow", new THREE.BufferAttribute(new Float32Array(tube.attributes.position.count), 1));
    const ca = new Float32Array(tube.attributes.position.count * 3);
    for (let i = 0; i < ca.length; i += 3) { const v = 0.1 + 0.08 * R(); ca[i] = v; ca[i + 1] = v * 0.93; ca[i + 2] = v * 0.9; }
    tube.setAttribute("color", new THREE.BufferAttribute(ca, 3));
    const arch = new THREE.Mesh(tube, rockFlat); arch.name = "arch"; arch.castShadow = true; cell.add(arch);
  }
  const cageG = new THREE.Group(); cageG.name = "cage";
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2e2a28, roughness: 0.55, metalness: 0.75 });
  {
    const mg = createMerger(THREE, []);
    const n = 14, r = 1.6, h = 2.6;
    for (let i = 0; i < n; i++) { if (i === 0 || i === 1) continue; const a = (i / n) * TAU; mg.add(new THREE.CylinderGeometry(0.05, 0.05, h, 6), mat4(THREE, Math.sin(a) * r, h / 2, Math.cos(a) * r)); }
    mg.add(new THREE.TorusGeometry(r, 0.07, 6, 28).rotateX(Math.PI / 2), mat4(THREE, 0, 0.05, 0));
    mg.add(new THREE.TorusGeometry(r, 0.07, 6, 28).rotateX(Math.PI / 2), mat4(THREE, 0, h, 0));
    mg.add(new THREE.CylinderGeometry(r, r, 0.12, 28), mat4(THREE, 0, 0, 0), 0x3a3330);
    const dome = new THREE.SphereGeometry(r, 16, 6, 0, TAU, 0, Math.PI / 2);
    mg.add(dome, mat4(THREE, 0, h, 0, 0, 0, 0, 1, 0.6, 1));
    mg.add(new THREE.TorusGeometry(0.35, 0.08, 6, 12), mat4(THREE, 0, h + 1.1, 0));
    const body = new THREE.Mesh(mg.build(), ironMat); body.castShadow = true; cageG.add(body);
    // the door: two bars that slide up
    const dg = createMerger(THREE, []);
    for (const i of [0, 1]) { const a = (i / n) * TAU; dg.add(new THREE.CylinderGeometry(0.05, 0.05, h, 6), mat4(THREE, Math.sin(a) * r, h / 2, Math.cos(a) * r)); }
    const door = new THREE.Mesh(dg.build(), ironMat); door.name = "cageDoor"; cageG.add(door); cageG.userData.door = door;
    // chains: links up to the arch (stretched as the cage lowers)
    const cg = createMerger(THREE, []);
    for (let c = 0; c < 4; c++) {
      const a = (c / 4) * TAU + Math.PI / 4;
      for (let k = 0; k < 22; k++) {
        const t = k / 22, x = Math.sin(a) * r * 0.9 * (1 - t), z = Math.cos(a) * r * 0.9 * (1 - t);
        cg.add(new THREE.TorusGeometry(0.16, 0.04, 4, 8), mat4(THREE, x, h + 0.3 + k * 0.5, z, 0, (k % 2) * Math.PI / 2 + a, Math.PI / 2 - 0.1));
      }
    }
    const chains = new THREE.Mesh(cg.build(), ironMat); chains.name = "chains"; cageG.add(chains); cageG.userData.chains = chains;
  }
  cell.add(cageG);
  let cageK = 0, cageWant = 0, cageRate = 1, doorK = 0, doorWant = 0, doorRate = 1;
  const cage = {
    group: cageG, get x() { return CAGE.x; }, get z() { return CAGE.z; }, get y() { return cageG.position.y; },
    lower(k, seconds) { cageWant = clamp(k === undefined ? 1 : k, 0, 1); cageRate = seconds ? 1 / seconds : 1e3; if (!seconds) { cageK = cageWant; poseCage(); } else sfx("chainCreak"); },
    open(seconds) { doorWant = 1; doorRate = 1 / Math.max(0.05, seconds || 1); sfx("gateOpen"); },
    close() { doorWant = 0; doorK = 0; poseCage(); },
    get opened() { return doorK >= 0.99; },
    reset() { cageK = cageWant = 0; doorK = doorWant = 0; poseCage(); },
  };
  function poseCage() {
    const y = lerp(CAGE.top, CAGE.low, smooth(cageK));
    cageG.position.set(CAGE.x, y, CAGE.z);
    const ch = cageG.userData.chains;
    ch.scale.y = (24 - 2.9 - y) / 11.3 / 1; // chains reach the arch apex (y 24)
    ch.position.y = 0;
    cageG.userData.door.position.y = doorK * 2.4;
  }
  // the narrow bridge to the cage (submerged until the boss is beaten)
  const BRIDGE = { x: 0, z0: -44, z1: -1.4, half: 1.05, low: LAKE_Y - 1.5, high: 0.05 };
  let walkK = 0, walkWant = 0, walkRate = 1;
  const walkMesh = (() => {
    const mg = createMerger(THREE, ["aGlow"]);
    for (let z = BRIDGE.z0; z < BRIDGE.z1; z += 1.1) {
      const g = lumpify(THREE, new THREE.BoxGeometry(2.3, 0.9, 1.25, 2, 1, 2), 0.08, 1.6, z);
      mg.add(g, mat4(THREE, rr(-0.08, 0.08), -0.45, z + 0.55, rr(-0.04, 0.04), rr(-0.1, 0.1), rr(-0.03, 0.03)), 0x2e2826, { aGlow: (x, y) => (y < -0.6 ? 0.6 : 0) });
    }
    const m = new THREE.Mesh(mg.build(), rockFlat); m.name = "cageWalk"; m.castShadow = true; m.receiveShadow = true; return m;
  })();
  cell.add(walkMesh);
  const cageWalk = {
    mesh: walkMesh,
    rise(seconds) { walkWant = 1; walkRate = 1 / Math.max(0.05, seconds || 3); if (seconds) { sfx("rockGrind", 0.6); quake(0.25, seconds); } else { walkK = 1; poseWalk(); } },
    sink() { walkWant = 0; walkK = 0; poseWalk(); },
    get k() { return walkK; }, get up() { return walkK >= 0.98; },
  };
  function poseWalk() { walkMesh.position.y = lerp(BRIDGE.low, BRIDGE.high, smooth(walkK)); }
  group.add(cell);

  // =========================================================================================== SCENE: arena (crater floor)
  const arena = new THREE.Group(); arena.name = "arena";
  const LAKE_R = 40, BOSS = { x: 0, z: 8 };
  let lavaY = 0, lavaFrom = 0, lavaTo = 0, lavaT = 1, lavaDur = 1;
  const arenaWall = new THREE.Mesh(craterWall(43, -6, 58, 72, 90, 26, 0.12, 5), rockMat); arenaWall.name = "arenaWall";
  arena.add(arenaWall);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(48, 64).rotateX(-Math.PI / 2), lavaMat); lake.name = "lake";
  arena.add(lake);
  // heat haze: a faint glowing sheet above the lake (cheap: additive, no screen pass)
  const hazeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uGlow: U.uGlow, uCool: U.uCool }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: "varying vec3 vP; void main(){ vP = (modelMatrix * vec4(position,1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP,1.0); }",
    fragmentShader: `uniform float uTime, uGlow, uCool; varying vec3 vP; ${GLSL_NOISE}
      void main(){ float n = k3f(vP.xz * 0.12 + vec2(uTime * 0.05, -uTime * 0.07)); float a = smoothstep(0.35, 0.8, n) * 0.07 * uGlow * (1.0 - uCool);
        a *= smoothstep(46.0, 30.0, length(vP.xz)); gl_FragColor = vec4(vec3(1.0, 0.45, 0.15) * a, 1.0); }`,
  });
  const haze = new THREE.Mesh(new THREE.CircleGeometry(46, 32).rotateX(-Math.PI / 2), hazeMat); haze.name = "haze"; haze.position.y = 2.2; haze.renderOrder = 5;
  arena.add(haze);
  // islands
  const ISL0 = [[0, -16, 4.6], [-9, -10.5, 3.6], [9, -10.5, 3.6], [-15.5, -1.5, 3.4], [15.5, -1.5, 3.4], [-6.2, -2.2, 3.0], [6.2, -2.2, 3.0]];
  const islandGeo = (() => {
    const g = lumpify(THREE, new THREE.CylinderGeometry(1, 1.3, 1, 30, 7), 0.15, 1.9, 11);
    g.translate(0, -0.5, 0); // top at y = 0, a 1-high pillar scaled down into the lava
    const P = g.attributes.position, c = new Float32Array(P.count * 3), gl = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) {
      const y = P.getY(i), top = y > -0.08 ? 1 : 0, n = noise3(P.getX(i) * 4, y * 4, P.getZ(i) * 4);
      const ash = top ? 0.5 + 0.5 * noise3(P.getX(i) * 1.7, 2, P.getZ(i) * 1.7) : 0;
      const v = top ? 0.07 + 0.08 * ash + 0.02 * n : 0.045 + 0.03 * Math.abs(n);
      c[i * 3] = v * 1.05; c[i * 3 + 1] = v * 0.95; c[i * 3 + 2] = v * 0.9;
      gl[i] = y < -0.7 ? 0.9 : y < -0.5 ? 0.35 : !top && n > 0.45 ? 0.5 : 0;
      if (top) P.setY(i, y + 0.05 * (1 - (P.getX(i) ** 2 + P.getZ(i) ** 2)) + 0.02 * n);
    }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.setAttribute("aGlow", new THREE.BufferAttribute(gl, 1)); g.computeVertexNormals();
    return g;
  })();
  const islandMesh = new THREE.InstancedMesh(islandGeo, rockFlat, 7); islandMesh.name = "islands"; islandMesh.receiveShadow = true; islandMesh.castShadow = true;
  islandMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arena.add(islandMesh);
  const islands = ISL0.map(([x, z, r], i) => {
    const o = {
      i, x, z, r, y: 1.0, x0: x, z0: z, top: 1.0, sinkK: 0, sinkWant: 0, sinkRate: 0.5, mx: x, mz: z, mFrom: null,
      sink(k, seconds) { o.sinkWant = clamp(k === undefined ? 1 : k, 0, 1); o.sinkRate = 1 / Math.max(0.05, seconds || 2.5); if (seconds === 0) o.sinkK = o.sinkWant; sfx("rockGrind", 0.5); },
      raise(k, seconds) { o.sink(1 - clamp(k === undefined ? 1 : k, 0, 1), seconds); },
      get above() { return o.y > lavaY + 0.15; },
    };
    return o;
  });
  // the ring of phase 3: the islands slide into a circle around MAGMOR
  let ringK = 0, ringWant = 0, ringRate = 0.3;
  const RING_R = 17;
  const ringPos = islands.map((o, i) => { const a = Math.PI + (i - 3) * (TAU * 0.8 / 7); return { x: BOSS.x + Math.sin(a) * RING_R, z: BOSS.z + Math.cos(a) * RING_R }; });
  function setRing(k, seconds) { ringWant = clamp(k, 0, 1); ringRate = 1 / Math.max(0.05, seconds || 4); if (!seconds) ringK = ringWant; if (seconds) { quake(0.5, seconds); sfx("rockGrind", 0.9); } }
  // bridges
  const BR_PAIRS = [[0, 1], [0, 2], [1, 3], [2, 4], [1, 5], [2, 6], [5, 6]];
  const bridgeGeo = (() => {
    const g = lumpify(THREE, new THREE.BoxGeometry(1, 0.5, 1, 8, 1, 2), 0.04, 3, 21);
    g.translate(0, -0.25, 0);
    const P = g.attributes.position, c = new Float32Array(P.count * 3), gl = new Float32Array(P.count);
    for (let i = 0; i < P.count; i++) { const n = noise3(P.getX(i) * 9, 0, P.getZ(i) * 9); c[i * 3] = 0.17 + 0.05 * n; c[i * 3 + 1] = 0.14; c[i * 3 + 2] = 0.12; gl[i] = n > 0.4 ? 0.7 : P.getY(i) < -0.3 ? 0.6 : 0.05; }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3)); g.setAttribute("aGlow", new THREE.BufferAttribute(gl, 1)); g.computeVertexNormals();
    return g;
  })();
  const bridgeMesh = new THREE.InstancedMesh(bridgeGeo, rockFlat, BR_PAIRS.length); bridgeMesh.name = "bridges"; bridgeMesh.receiveShadow = true;
  bridgeMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arena.add(bridgeMesh);
  const bridges = BR_PAIRS.map(([a, b], i) => {
    const o = {
      i, a, b, intact: true, cracking: -1, wobble: 0,
      crack(seconds) { if (!o.intact || o.cracking >= 0) return; o.cracking = Math.max(0.2, seconds === undefined ? 1.2 : seconds); o.T = o.cracking; sfx("rockCrack"); },
      restore() { o.intact = true; o.cracking = -1; },
      get ax() { return islands[a].x; }, get az() { return islands[a].z; }, get bx() { return islands[b].x; }, get bz() { return islands[b].z; },
    };
    return o;
  });
  // updrafts (phase 3)
  const updraftMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: "varying vec2 vUv; varying float vY; void main(){ vUv = uv; vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform float uTime; varying vec2 vUv; varying float vY; ${GLSL_NOISE}
      void main(){ float n = k3f(vec2(vUv.x * 6.0, vUv.y * 3.0 - uTime * 1.6)); float s = smoothstep(0.45, 0.9, n);
        float a = s * (1.0 - vUv.y) * smoothstep(0.0, 0.1, vUv.y) * 0.5; gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * a + vec3(0.9, 0.95, 1.0) * a * 0.4, 1.0); }`,
  });
  const updraftMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 0.7, 1, 16, 1, true).translate(0, 0.5, 0), updraftMat, 4);
  updraftMesh.name = "updrafts"; updraftMesh.frustumCulled = false; updraftMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  arena.add(updraftMesh);
  const UPD_ISL = [1, 6, 3, 4];
  const updrafts = UPD_ISL.map((ii, i) => ({ i, island: ii, get x() { return islands[ii].x; }, get z() { return islands[ii].z; }, r: 1.6, on: false, k: 0 }));
  // rubble for the wall collapse (phase 3) and the cooled crater
  const arenaRocks = new THREE.InstancedMesh(rockGeo, rockFlat, 40); arenaRocks.name = "arenaRocks"; arenaRocks.castShadow = true;
  for (let i = 0; i < 40; i++) { const a = rr(0, TAU), r = rr(42, 47), s = rr(1.4, 4.2); tm.compose(tv.set(Math.sin(a) * r, -1 + s * 0.3, Math.cos(a) * r), tq.setFromEuler(new THREE.Euler(rr(0, 3), rr(0, 6), 0)), ts.set(s, s * 0.7, s)); arenaRocks.setMatrixAt(i, tm); }
  arena.add(arenaRocks);
  group.add(arena);

  // =========================================================================================== heights per scene
  let scene = "slope";
  function islandH(o, x, z) {
    const d = Math.hypot(x - o.x, z - o.z);
    if (d > o.r + 0.25) return -Infinity;
    return o.y + 0.08 * (1 - Math.min(1, (d / o.r) ** 2)) - (d > o.r ? (d - o.r) * 3 : 0);
  }
  function bridgeY(b) { return Math.min(islands[b.a].y, islands[b.b].y) - 0.08; }
  function arenaH(x, z) {
    let h = -Infinity;
    for (let i = 0; i < 7; i++) { const v = islandH(islands[i], x, z); if (v > h) h = v; }
    if (ringK < 0.5) for (let i = 0; i < bridges.length; i++) {
      const b = bridges[i];
      if (!b.intact) continue;
      if (segD(x, z, b.ax, b.az, b.bx, b.bz) < 0.8) { const y = bridgeY(b); if (y > lavaY && y > h) h = y; }
    }
    const r = Math.hypot(x, z);
    const floor = r > LAKE_R + 2 ? lavaY + (r - LAKE_R - 2) * 2 : lavaY - 0.6;
    return Math.max(h, floor);
  }
  function onLava(x, z) {
    if (scene === "slope") {
      const px = pathX(z);
      if (Math.abs(x - (px + RIVER_OFF)) < 1.5 && z < 96) return true;
      for (const c of CH) if (segD(x, z, c.ax, c.az, c.bx, c.bz) < c.half) return true;
      return false;
    }
    if (scene === "cell") {
      if (Math.abs(x - BRIDGE.x) < BRIDGE.half && z > BRIDGE.z0 && z < BRIDGE.z1 + 0.6 && walkK > 0.9) return false;
      if (cageK > 0.9 && Math.hypot(x - CAGE.x, z - CAGE.z) < 1.7) return false;
      return Math.hypot(x, z) < 43.5 && rimRaw(x, z) < -3;
    }
    if (scene === "arena") return arenaH(x, z) <= lavaY - 0.55 && Math.hypot(x, z) < LAKE_R + 2;
    return false;
  }
  function heightAt(x, z) {
    if (scene === "slope") return SG.heightAt(x, z);
    if (scene === "cell") {
      let h = RG.heightAt(x, z);
      if (Math.abs(x - BRIDGE.x) < BRIDGE.half && z > BRIDGE.z0 && z < BRIDGE.z1 + 0.6) h = Math.max(h, walkMesh.position.y);
      if (Math.hypot(x - CAGE.x, z - CAGE.z) < 1.6) h = Math.max(h, cageG.position.y + 0.06);
      return h;
    }
    return arenaH(x, z);
  }
  function surfaceAt(x, z) {
    if (onLava(x, z)) return "lava";
    if (scene === "slope") { const d = Math.abs(x - pathX(z)); return d < 2.2 ? "dirt" : "concrete"; }
    return "concrete";
  }
  function confine(o, r) {
    r = r || 0;
    if (scene === "slope") {
      if (o.z < -10 + r) o.z = -10 + r; if (o.z > 111 - r) o.z = 111 - r;
      const px = pathX(o.z), lim = (Math.hypot(o.x - SHR.x, o.z - SHR.z) < 12 ? 12 : 9.2) - r;
      if (o.x < px - lim) o.x = px - lim; if (o.x > px + lim) o.x = px + lim;
    } else if (scene === "cell") {
      const onBridge = Math.abs(o.x - BRIDGE.x) < BRIDGE.half + 0.3 && o.z > BRIDGE.z0 - 1 && o.z < BRIDGE.z1 + 1 && walkK > 0.9;
      const inCage = cageK > 0.9 && Math.hypot(o.x - CAGE.x, o.z - CAGE.z) < 1.5;
      if (onBridge || inCage) { if (onBridge && Math.abs(o.x - BRIDGE.x) > BRIDGE.half - r) o.x = BRIDGE.x + Math.sign(o.x - BRIDGE.x) * (BRIDGE.half - r); return; }
      if (o.x < -12 + r) o.x = -12 + r; if (o.x > 12 - r) o.x = 12 - r;
      if (o.z < -62 + r) o.z = -62 + r;
      const rr2 = Math.hypot(o.x, o.z), min = 45 + r;
      if (rr2 < min && !(Math.abs(o.x) < BRIDGE.half && walkK > 0.9)) { const k = min / rr2; o.x *= k; o.z *= k; }
    } else {
      const d = Math.hypot(o.x - BOSS.x, o.z - BOSS.z);
      if (d < 7 + r) { const k = (7 + r) / (d || 1); o.x = BOSS.x + (o.x - BOSS.x) * k; o.z = BOSS.z + (o.z - BOSS.z) * k; }
      const rr2 = Math.hypot(o.x, o.z), max = LAKE_R - 1 - r;
      if (rr2 > max) { o.x *= max / rr2; o.z *= max / rr2; }
    }
  }

  // =========================================================================================== P, envs
  const pt = (x, z, yaw) => ({ x, y: 0, z, yaw: yaw || 0 });
  const cam = (px, py, pz, lx, ly, lz) => ({ pos: { x: px, y: py, z: pz }, look: { x: lx, y: ly, z: lz } });
  const path = []; for (let z = 0; z <= 100; z += 12.5) path.push(pt(pathX(z), z, 0));
  const P = {
    spawn: pt(pathX(-4), -4, 0), path, shrine: pt(SHR.x, SHR.z - 6.5, 0), bed: pt(SHR.x, SHR.z, Math.PI), runes: runePts,
    vents: VENTS, channels: CH.map((c) => ({ x: pathX(c.c), z: c.c })), crater: pt(pathX(108), 110, 0),
    camSlope: cam(pathX(-14) + 6, 9, -14, pathX(20), 6, 20), camShrine: cam(SHR.x + 8, 0.2 * PLAT_Z + 4, SHR.z - 10, SHR.x, 0.2 * PLAT_Z + 1, SHR.z),
    rim: pt(0, -54, 0), cage: pt(CAGE.x, CAGE.z, Math.PI), cageWalk: { x: BRIDGE.x, z0: BRIDGE.z0, z1: BRIDGE.z1 }, cageDoor: pt(0, -2.2, 0),
    camRim: cam(9, 6, -64, 0, 2, -10), camCage: cam(5, 5, -12, 0, 5, 0),
    arenaStart: pt(ISL0[0][0], ISL0[0][1] - 1, 0), boss: pt(BOSS.x, BOSS.z, Math.PI),
    camArena: cam(0, 11, -34, 0, 6, 0), camBoss: cam(3, 3, -18, 0, 24, 8),
  };
  for (const k of ["spawn", "shrine", "bed", "crater"]) P[k].y = SG.heightAt(P[k].x, P[k].z);
  for (const p of path) p.y = SG.heightAt(p.x, p.z);
  P.rim.y = RG.heightAt(P.rim.x, P.rim.z);
  const ENVS = {
    slope: { background: 0x3a2622, fog: [0x4a2e26, 30, 260], hemi: [0xb09a90, 0x6a2a14, 0.85], sun: [0xffa060, 1.7], sunDir: [-0.5, 0.45, -0.7], far: 600, dark: true },
    cell: { background: 0x2a1410, fog: [0x3a1a10, 40, 220], hemi: [0x9a8070, 0xa0380e, 0.9], sun: [0xff9050, 1.3], sunDir: [0.3, 0.6, -0.6], far: 500, dark: true },
    arena: { background: 0x1e0d08, fog: [0x351409, 30, 170], hemi: [0x7a6050, 0xd04a10, 1.0], sun: [0xff8a40, 1.25], sunDir: [0.25, 0.85, -0.45], far: 400, dark: true },
    cool: { background: 0x8a949c, fog: [0x8f969a, 70, 380], hemi: [0xdfe6ee, 0x55504c, 1.0], sun: [0xfff0dc, 1.6], sunDir: [0.4, 0.7, -0.5], far: 400, dark: false },
  };
  const SKY = {
    slope: [0x1b1414, 0x6a3a26, 0xff6a1e, 0.9, [0, 0.25, 1], 0.9],
    cell: [0x150c0a, 0x5a2414, 0xff5a10, 1.2, [0, -0.3, 0.2], 0.7],
    arena: [0x0e0807, 0x4a1a0c, 0xff4a10, 1.3, [0, -0.5, 0], 0.5],
    cool: [0x6f8aa4, 0xc9cfd2, 0xfff2e0, 0.4, [0.4, 0.3, -0.5], 0.3],
  };
  const world = {
    name: "volcano", group, maxStep: 0.55, env: ENVS.slope, ENVS, P,
    heightAt, surfaceAt, confine, colliders, waterAt() { return -Infinity; },
    camBounds: { minX: -60, maxX: 60, minZ: -70, maxZ: 120, maxY: 60 },
    get scene() { return scene; }, get lavaY() { return lavaY; },
    runes, cage, cageWalk, islands, bridges, updrafts, bombs, vents: VENTS, boss: BOSS, lakeR: LAKE_R,
    onLava, pathX,
    ventAt(x, z) { for (const v of VENTS) if (v.on && v.puffing && sq(x - v.x) + sq(z - v.z) < v.r * v.r) return v; return null; },
    setScene(name, seconds) {
      if (!ENVS[name]) return;
      scene = name;
      slope.visible = name === "slope"; cell.visible = name === "cell"; arena.visible = name === "arena" || name === "cool";
      for (const c of colliders) c.on = c.scene === name;
      world.env = ENVS[name];
      const s = SKY[name];
      sky.u.uTop.value.set(s[0]); sky.u.uHor.value.set(s[1]); sky.u.uGlowCol.value.set(s[2]); sky.u.uGlowK.value = s[3]; sky.u.uGlowDir.value.fromArray(s[4]).normalize(); sky.u.uClouds.value = s[5];
      if (name === "cool") { for (const u of updrafts) u.on = false; U.uCool.value = 1; U.uGlow.value = 0.15; ash.setOn(0.25); embers.setOn(0); }
      else { U.uCool.value = 0; U.uGlow.value = 1; ash.setOn(1); embers.setOn(name === "slope" ? 0.6 : 1); }
      if (active && ctx.setEnv) ctx.setEnv(world.env, seconds || 0);
      bombs.clear();
      if (active) sfx("lavaAmbience", name === "cool" ? 0 : name === "slope" ? 0.5 : 0.9);
    },
    setGlow(k, seconds) { glowFrom = U.uGlow.value; glowTo = clamp(k, 0, 1.5); glowT = 0; glowDur = Math.max(0.001, seconds || 0); if (!seconds) U.uGlow.value = glowTo; },
    setCool(k, seconds) { coolFrom = U.uCool.value; coolTo = clamp(k, 0, 1); coolT = 0; coolDur = Math.max(0.001, seconds || 0); if (!seconds) U.uCool.value = coolTo; },
    quake, erupt, puff,
    setLava(y, seconds) { lavaFrom = lavaY; lavaTo = y; lavaT = 0; lavaDur = Math.max(0.001, seconds || 0); if (!seconds) { lavaY = y; lavaT = 1; } else sfx("rockGrind", 0.5); },
    setRing, get ringK() { return ringK; },
    setUpdraft(i, on) { if (updrafts[i]) updrafts[i].on = !!on; },
    collapseWall() { quake(1, 3); for (let i = 0; i < 6; i++) { const a = Math.PI + rr(-1.2, 1.2); puff(Math.sin(a) * 44, 6 + rr(0, 20), Math.cos(a) * 44, 5, 0x2a2523, 1, 4); } vfx("rockDebris", 0, 10, 40, 30); sfx("eruption", 0, 40, 1.4); },
    resetArena() {
      lavaY = lavaTo = 0; lavaT = 1; ringK = ringWant = 0;
      for (const o of islands) { o.sinkK = o.sinkWant = 0; o.x = o.x0; o.z = o.z0; }
      for (const b of bridges) b.restore();
      for (const u of updrafts) { u.on = false; u.k = 0; }
      bombs.clear();
      U.uCool.value = scene === "cool" ? 1 : 0;
      poseArena(0);
    },
    reset() { world.resetArena(); runes.reset(); cage.reset(); cageWalk.sink(); quakeT = 0; },
    update, onEnter, onLeave,
    onFootstep(wx, wz, strength, foot, wet, pan) { sfx("step", surfaceAt(wx, wz) === "dirt" ? "dirt" : "concrete", strength, pan); if (strength > 0.7 && foot < 2) vfx("footDust", wx, heightAt(wx, wz) + 0.02, wz, strength * 0.4, 0x4a423e); },
    onJump(x, z, floorY) { vfx("footDust", x, floorY + 0.03, z, 0.4, 0x4a423e); },
    onLand(x, z, floorY, impact) { sfx("step", "concrete", 0.7 + impact * 0.5, 0); vfx("footDust", x, floorY + 0.03, z, 0.3 + impact * 0.6, 0x4a423e); },
    stats() { return { scene, lavaY, ringK, bombs: bombs.active }; },
  };
  let active = false;
  let glowFrom = 1, glowTo = 1, glowT = 1, glowDur = 1, coolFrom = 0, coolTo = 0, coolT = 1, coolDur = 1;
  let quakeT = 0, quakeAmp = 0, quakeSnd = 0;
  function quake(strength, seconds) {
    quakeAmp = Math.max(quakeAmp * (quakeT > 0 ? 1 : 0), clamp(strength, 0, 1)); quakeT = Math.max(quakeT, seconds || 1);
    if (ctx.cinema && ctx.cinema.shake) ctx.cinema.shake(0.05 + 0.3 * strength, seconds || 1);
    sfx("rockGrind", 0.3 + 0.7 * strength);
  }
  function erupt(x, z, size) {
    size = size === undefined ? 1 : size;
    const y = heightAt(x, z);
    for (let i = 0; i < 3 + size * 3; i++) puff(x + rr(-1, 1) * size, y + 0.5 + i * 0.6, z + rr(-1, 1) * size, (1.2 + R()) * size, i % 2 ? 0x2a2320 : 0x4a3328, 3 + R() * 2, 2.6);
    vfx("embers", x, y + 1, z, 1.5 * size, 20);
    vfx("lavaSplash", x, y, z, size);
    sfx("eruption", x, z, size);
    if (ctx.cinema && ctx.cinema.shake) ctx.cinema.shake(0.12 * size, 0.6);
    const n = Math.round(2 + size * 3), p = ctx.player;
    for (let i = 0; i < n; i++) {
      let tx, tz;
      if (scene === "arena" && R() < 0.75) { const o = islands[(R() * 7) | 0]; const a = rr(0, TAU), d = R() * o.r * 0.8; tx = o.x + Math.sin(a) * d; tz = o.z + Math.cos(a) * d; if (p && i === 0) { tx = p.x + rr(-1.5, 1.5); tz = p.z + rr(-1.5, 1.5); } }
      else { tx = (p ? p.x : x) + rr(-7, 7); tz = (p ? p.z : z) + rr(-7, 7); }
      bombs.launch(x, y + 2, z, tx, tz, 1.5 + R() * 0.8, 2 + R() * 0.6 * size);
    }
  }
  function poseArena(dt) {
    for (const o of islands) {
      if (o.sinkK !== o.sinkWant) { const s = o.sinkRate * dt; o.sinkK = Math.abs(o.sinkWant - o.sinkK) <= s ? o.sinkWant : o.sinkK + Math.sign(o.sinkWant - o.sinkK) * s; }
      const k = smooth(ringK);
      o.x = lerp(o.x0, ringPos[o.i].x, k); o.z = lerp(o.z0, ringPos[o.i].z, k);
      o.y = 1.0 - smooth(o.sinkK) * 3.2 + Math.sin(clock * 0.8 + o.i) * 0.02;
      tm.compose(tv.set(o.x, o.y, o.z), tq.setFromAxisAngle(tv2.set(0, 1, 0), o.i * 1.3), ts.set(o.r, 6, o.r));
      islandMesh.setMatrixAt(o.i, tm);
    }
    islandMesh.instanceMatrix.needsUpdate = true;
    for (const b of bridges) {
      const A = islands[b.a], Bi = islands[b.b];
      if (b.cracking >= 0) { b.cracking -= dt; if (b.cracking <= 0) { b.cracking = -1; b.intact = false; puff((A.x + Bi.x) / 2, lavaY + 0.4, (A.z + Bi.z) / 2, 1.4, 0x3a2a24, 1.6, 1.8); vfx("lavaSplash", (A.x + Bi.x) / 2, lavaY, (A.z + Bi.z) / 2, 1); sfx("rockCrack"); } }
      const show = b.intact && ringK < 0.05;
      if (!show) { bridgeMesh.setMatrixAt(b.i, zeroM); continue; }
      const dx = Bi.x - A.x, dz = Bi.z - A.z, L = Math.hypot(dx, dz);
      const shake = b.cracking >= 0 ? Math.sin(clock * 40 + b.i) * 0.04 * (1 - b.cracking / b.T) : 0;
      tm.compose(tv.set((A.x + Bi.x) / 2 + shake, bridgeY(b) + shake, (A.z + Bi.z) / 2), tq.setFromAxisAngle(tv2.set(0, 1, 0), Math.atan2(dx, dz)), ts.set(1.6, 1, L));
      bridgeMesh.setMatrixAt(b.i, tm);
    }
    bridgeMesh.instanceMatrix.needsUpdate = true;
    for (const u of updrafts) {
      const want = u.on ? 1 : 0; u.k += (want - u.k) * Math.min(1, dt * 2);
      if (u.k < 0.01) { updraftMesh.setMatrixAt(u.i, zeroM); continue; }
      const o = islands[u.island];
      tm.compose(tv.set(o.x, o.y, o.z), tq.identity(), ts.set(u.r * u.k, 26 * u.k, u.r * u.k));
      updraftMesh.setMatrixAt(u.i, tm);
    }
    updraftMesh.instanceMatrix.needsUpdate = true;
    lake.position.y = lavaY; haze.position.y = lavaY + 2.2;
  }
  const tv2 = new THREE.Vector3();
  let clock = 0, ventClock = 0, bubbleT = 0;
  function update(dt, time) {
    if (time !== undefined && time === lastT) return;
    lastT = time;
    clock += dt;
    U.uTime.value = clock;
    const camO = ctx.camera;
    if (camO) { sky.mesh.position.copy(camO.position); ash.follow(camO); embers.follow(camO); }
    if (glowT < 1) { glowT = Math.min(1, glowT + dt / glowDur); U.uGlow.value = lerp(glowFrom, glowTo, smooth(glowT)); }
    if (coolT < 1) { coolT = Math.min(1, coolT + dt / coolDur); U.uCool.value = lerp(coolFrom, coolTo, smooth(coolT)); }
    if (lavaT < 1) { lavaT = Math.min(1, lavaT + dt / lavaDur); lavaY = lerp(lavaFrom, lavaTo, smooth(lavaT)); }
    if (quakeT > 0) { quakeT -= dt; if (quakeT <= 0) quakeAmp = 0; }
    updatePuffs(dt);
    updateBombs(dt);
    if (scene === "slope") {
      // vents: puff for 1.2 s every 3 s, staggered
      ventClock += dt;
      for (const v of VENTS) {
        const ph = (ventClock + v.phase) % 3, was = v.puffing;
        v.puffing = v.on && ph < 1.2;
        if (v.puffing && !was) sfx("steamVent", v.x, v.z);
        if (v.puffing && R() < dt * 14) puff(v.x + rr(-0.3, 0.3), SG.heightAt(v.x, v.z) + 0.3, v.z + rr(-0.3, 0.3), 0.7, 0xeeeae6, 4.5, 1.4);
        if (!v.puffing && ph > 2.4 && R() < dt * 2) puff(v.x, SG.heightAt(v.x, v.z) + 0.2, v.z, 0.3, 0xdedad6, 1.2, 1);
      }
      // the plume
      for (let i = 0; i < PLUME; i++) {
        const k = ((clock * 0.02 + i / PLUME) % 1), s = 18 + k * 60;
        tm.compose(tv.set(CONE.x + Math.sin(i * 2.1 + k * 3) * 10 * k + k * 50, 180 + k * 160, CONE.z + Math.cos(i * 1.7) * 8 * k), tq.identity(), ts.set(s, s * 0.8, s));
        plume.setMatrixAt(i, tm);
      }
      plume.instanceMatrix.needsUpdate = true;
      for (let i = 0; i < RUNE_N; i++) { const v = runeU.uRune.value[i]; runeU.uRune.value[i] = v + (runeTarget[i] - v) * Math.min(1, dt * 4); }
    }
    if (scene === "cell") {
      let dirty = false;
      if (cageK !== cageWant) { const s = cageRate * dt; cageK = Math.abs(cageWant - cageK) <= s ? cageWant : cageK + Math.sign(cageWant - cageK) * s; dirty = true; }
      if (doorK !== doorWant) { const s = doorRate * dt; doorK = Math.abs(doorWant - doorK) <= s ? doorWant : doorK + Math.sign(doorWant - doorK) * s; dirty = true; }
      if (walkK !== walkWant) { const s = walkRate * dt; walkK = Math.abs(walkWant - walkK) <= s ? walkWant : walkK + Math.sign(walkWant - walkK) * s; poseWalk(); if (R() < dt * 6) puff(rr(-1, 1), walkMesh.position.y, rr(BRIDGE.z0, BRIDGE.z1), 1.2, 0x5a4a44, 2, 1.6); }
      if (dirty || cageK < 1) { cageG.rotation.y = Math.sin(clock * 0.6) * 0.06 * (1 - cageK); poseCage(); }
    }
    if (scene === "arena" || scene === "cool") {
      if (ringK !== ringWant) { const s = ringRate * dt; ringK = Math.abs(ringWant - ringK) <= s ? ringWant : ringK + Math.sign(ringWant - ringK) * s; }
      poseArena(dt);
      if (scene === "cool" && R() < dt * 3) { const a = rr(0, TAU), r = rr(5, 38); puff(Math.sin(a) * r, lavaY + 0.2, Math.cos(a) * r, rr(1, 2.4), 0xe4e2e0, 1.4, 3.5); }
    }
    if (scene !== "cool") {
      bubbleT -= dt;
      if (bubbleT <= 0 && active) {
        bubbleT = 0.5 + R() * 1.2;
        const p = ctx.player;
        if (p) { const a = rr(0, TAU), d = rr(4, 14); if (!onLava(p.x + Math.sin(a) * d, p.z + Math.cos(a) * d)) {} else { sfx("lavaBubble", p.x + Math.sin(a) * d, p.z + Math.cos(a) * d); vfx("embers", p.x + Math.sin(a) * d, (scene === "arena" ? lavaY : heightAt(p.x, p.z)) + 0.1, p.z + Math.cos(a) * d, 0.4, 4); } }
      }
    }
  }
  let lastT = -1;
  function onEnter() { active = true; world.setScene(scene); }
  function onLeave() { active = false; sfx("lavaAmbience", 0); bombs.clear(); }
  world.setScene("slope");
  cage.reset(); cageWalk.sink(); poseArena(0);
  return world;
}
