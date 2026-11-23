// PLATYPUS — magmor.js (LEVELS3.md B6): MAGMOR, the heart of the mountain. Level 12's INSANE (but fair) boss.
//
// A colossal lava golem standing waist-deep in the crater lake: cracked basalt plates over glowing magma, a molten
// CORE behind two chest plates, four knuckle CRYSTALS, three shoulder VENTS. Rigid-skinned (17 bones), 3 draw calls:
// the rock body (cracks glow through a noise-texture seam pattern), the glow parts (eyes, mouth, crystals, vents,
// core, magma under the plates: one MeshBasic with a per-part intensity uniform) and the crumble rocks of the ending.
//
// Phases (each its own checkpoint):
//   0 FISTS     SLAM (a fist falls on your island), SWEEP (an arm drags across a line: jump it), GRAB (a hand closes on
//               an island: leave it). After a slam the fist rests 2.5 s and one crystal glows: 3 Tail Slaps or 2 Stings
//               shatter it. 4 crystals -> stunned.
//   1 ERUPTION  lava rises, islands sink (4 stay), bombs rain, lava waves roll out (jump), fireballs (strafe). The vents
//               open in turn: throw the potion into an open vent (hit("vent", i)). Ice flowers on the islands refill it.
//   2 CORE      islands in a ring, updrafts; both hands at once, a ring slam, fire breath over half the arena. Ride an
//               updraft up: the core opens for 3 s: SCREAM into it (hit("core", updraft)). Three, each from a new updraft.
// Telegraphs >= 0.8 s, each with fx.dangerZone + a sound + the eyes flaring. Nothing allocates per frame.

import { mulberry, clamp, lerp, smooth, TAU, angDiff, lumpify, createMerger, mat4, noiseTexture, lavaMaterial } from "./kit3.js";

export function createMagmor(ctx, volcano) {
  const THREE = ctx.THREE;
  const R = mulberry(0xa9a0);
  const rr = (a, b) => a + (b - a) * R();
  const sq = (v) => v * v;
  function sfx(name, a, b, c) { const o = ctx.audio, f = o && o[name]; return typeof f === "function" ? f.call(o, a, b, c) : undefined; }
  function vfx(name, a, b, c, d, e, f) { const o = ctx.fx, fn = o && o[name]; return typeof fn === "function" ? fn.call(o, a, b, c, d, e, f) : undefined; }
  const V = volcano;
  const BX = V.boss.x, BZ = V.boss.z;

  // ------------------------------------------------------------------------------------------ skeleton (bind pose)
  const BN = ["root", "hips", "spine", "chest", "neck", "head", "jaw", "shL", "upL", "foL", "haL", "shR", "upR", "foR", "haR", "plL", "plR"];
  const BI = {}; BN.forEach((n, i) => (BI[n] = i));
  const REST = {
    root: [0, -10, 0], hips: [0, 10, 0], spine: [0, 6, 0], chest: [0, 7, 0], neck: [0, 7, 0], head: [0, 2.6, 0.6], jaw: [0, -1.2, 1.6],
    shL: [7.6, 3.6, 0], upL: [2.6, 0, 0], foL: [0, -9, 0], haL: [0, -9, 0],
    shR: [-7.6, 3.6, 0], upR: [-2.6, 0, 0], foR: [0, -9, 0], haR: [0, -9, 0],
    plL: [1.6, 0, 6.2], plR: [-1.6, 0, 6.2],
  };
  const PARENT = { hips: "root", spine: "hips", chest: "spine", neck: "chest", head: "neck", jaw: "head", shL: "chest", upL: "shL", foL: "upL", haL: "foL", shR: "chest", upR: "shR", foR: "upR", haR: "foR", plL: "chest", plR: "chest" };
  const bones = BN.map((n) => { const b = new THREE.Bone(); b.name = "mag_" + n; b.position.fromArray(REST[n]); return b; });
  for (const n of BN) if (PARENT[n]) bones[BI[PARENT[n]]].add(bones[BI[n]]);
  const root = bones[0];
  // world (bind) position of every bone
  const BW = {};
  (function () { for (const n of BN) { const p = PARENT[n] ? BW[PARENT[n]] : [0, 0, 0]; BW[n] = [p[0] + REST[n][0], p[1] + REST[n][1], p[2] + REST[n][2]]; } })();

  // ------------------------------------------------------------------------------------------ geometry
  const body = createMerger(THREE, ["aBone"]);
  const glow = createMerger(THREE, ["aBone", "aPart"]);
  const rock = (r, det, seed, amt) => lumpify(THREE, new THREE.IcosahedronGeometry(r, det || 2), amt === undefined ? r * 0.22 : amt, 1.3 / r, seed);
  const C_ROCK = [0x2a2422, 0x241f1d, 0x302826, 0x1f1b1a];
  function chunk(bone, x, y, z, r, sx, sy, sz, rx, ry, seed, det) {
    const c = new THREE.Color(C_ROCK[seed % 4]).lerp(new THREE.Color(0x3a332f), R() * 0.3);
    body.add(rock(r, det, seed), mat4(THREE, x, y, z, rx || rr(-0.3, 0.3), ry || rr(0, 6), rr(-0.3, 0.3), sx, sy, sz), c, { aBone: BI[bone] });
  }
  function magma(bone, x, y, z, r, part, hex, sx, sy, sz) {
    glow.add(new THREE.IcosahedronGeometry(r, 1), mat4(THREE, x, y, z, 0, 0, 0, sx || 1, sy || sx || 1, sz || sx || 1), hex === undefined ? 0xff5a12 : hex, { aBone: BI[bone], aPart: part });
  }
  const at = (n, dx, dy, dz) => [BW[n][0] + (dx || 0), BW[n][1] + (dy || 0), BW[n][2] + (dz || 0)];
  let sd = 1;
  // pelvis + belly (half under the lava)
  chunk("hips", ...at("hips", 0, -0.5, 0), 6.2, 1.3, 0.9, 1.0, 0, 0, sd++);
  chunk("hips", ...at("hips", 3.2, 1.5, 1.5), 3.4, 1, 1, 1, 0, 0, sd++);
  chunk("hips", ...at("hips", -3.4, 1.2, 1.2), 3.2, 1, 1, 1, 0, 0, sd++);
  magma("hips", ...at("hips", 0, 3, 0), 5.2, 10);
  // spine / waist
  chunk("spine", ...at("spine", 0, 0.5, 0), 5.6, 1.15, 0.8, 0.95, 0, 0, sd++);
  chunk("spine", ...at("spine", 2.8, 1.5, -2), 3.2, 1, 1, 1, 0, 0, sd++);
  chunk("spine", ...at("spine", -2.6, 1.4, -2.2), 3.1, 1, 1, 1, 0, 0, sd++);
  magma("spine", ...at("spine", 0, 3.5, 0), 5.4, 10, undefined, 1.2, 0.8, 1);
  // chest: a huge slab, the shoulder masses, the back ridge
  chunk("chest", ...at("chest", 0, 1, -0.6), 7.8, 1.3, 0.92, 0.82, 0, 0, sd++, 3);
  chunk("chest", ...at("chest", 4.6, 3.2, 1.6), 3.8, 1, 0.9, 1, 0, 0, sd++);
  chunk("chest", ...at("chest", -4.6, 3.2, 1.6), 3.8, 1, 0.9, 1, 0, 0, sd++);
  chunk("chest", ...at("chest", 3.4, -2.6, 3.4), 3.2, 1, 1, 1, 0, 0, sd++);
  chunk("chest", ...at("chest", -3.4, -2.6, 3.4), 3.2, 1, 1, 1, 0, 0, sd++);
  for (let i = 0; i < 5; i++) chunk("chest", ...at("chest", rr(-2, 2), 3 + i * 0.8, -5 - i * 0.2), 1.6 - i * 0.15, 0.8, 2.2, 0.8, -0.5, 0, sd++, 1); // back spines
  // the core: a molten heart behind two plates
  magma("chest", ...at("chest", 0, 0, 5.4), 2.6, 9, 0xffd27a);
  magma("chest", ...at("chest", 0, 0, 4.6), 3.6, 10, 0xff7a20);
  // chest plates (bones plL / plR open sideways)
  body.add(rock(2.9, 2, 77), mat4(THREE, ...at("plL", 0.2, 0, 0.2), 0.1, 0.4, 0, 0.9, 1.25, 0.55), 0x2d2624, { aBone: BI.plL });
  body.add(rock(2.9, 2, 78), mat4(THREE, ...at("plR", -0.2, 0, 0.2), 0.1, -0.4, 0, 0.9, 1.25, 0.55), 0x2d2624, { aBone: BI.plR });
  // three vents: left shoulder, right shoulder, the back between the shoulders (rims in rock, the throats glow)
  const VENT_AT = [["shL", 0.8, 3.4, -0.6], ["shR", -0.8, 3.4, -0.6], ["chest", 0, 6.4, -3.6]];
  VENT_AT.forEach(([b, dx, dy, dz], i) => {
    const p = at(b, dx, dy, dz);
    const rim = lumpify(THREE, new THREE.TorusGeometry(1.5, 0.75, 8, 14), 0.25, 0.8, 30 + i);
    body.add(rim, mat4(THREE, p[0], p[1], p[2], Math.PI / 2 + (i === 2 ? -0.5 : 0), 0, 0), 0x1e1a19, { aBone: BI[b] });
    magma(b, p[0], p[1] - 0.2, p[2], 1.15, 6 + i, 0xff9a3a, 1, 0.45, 1);
  });
  // neck, head, horns, jaw
  chunk("neck", ...at("neck", 0, 0.5, 0.4), 3.4, 1.1, 1, 1, 0, 0, sd++);
  magma("neck", ...at("neck", 0, 0.6, 0.3), 2.8, 10);
  chunk("head", ...at("head", 0, 0.8, 0.2), 3.4, 1.15, 0.85, 1.05, 0, 0, sd++);
  chunk("head", ...at("head", 0, 1.7, 2.1), 1.9, 1.7, 0.5, 0.8, 0.2, 0, sd++, 1);  // the brow ridge
  for (const s of [1, -1]) {
    const hg = lumpify(THREE, new THREE.ConeGeometry(0.9, 4.4, 7, 3), 0.15, 1, 40 + s);
    body.add(hg, mat4(THREE, ...at("head", s * 2.4, 3.2, -0.6), -0.5, 0, -s * 0.7), 0x1a1616, { aBone: BI.head });
    magma("head", ...at("head", s * 1.15, 1.0, 3.05), 0.42, 0, 0xffe08a, 1.35, 0.75, 0.6);   // eyes
  }
  chunk("jaw", ...at("jaw", 0, -0.5, 0.6), 2.6, 1.15, 0.6, 1.0, 0, 0, sd++);
  magma("jaw", ...at("jaw", 0, 0.35, 1.2), 1.4, 1, 0xff8a26, 1.5, 0.35, 0.9);                    // the mouth glow
  // arms
  for (const S of ["L", "R"]) {
    const s = S === "L" ? 1 : -1;
    chunk("sh" + S, ...at("sh" + S, 1.2 * s, 0.8, 0), 4.0, 1.05, 0.95, 1.05, 0, 0, sd++);   // the shoulder boulder (vent on top)
    for (let k = 0; k < 3; k++) chunk("up" + S, ...at("up" + S, rr(-0.3, 0.3), -1.5 - k * 3, rr(-0.3, 0.3)), 2.6 - k * 0.15, 1, 1.25, 1, 0, 0, sd++);
    magma("up" + S, ...at("up" + S, 0, -4.5, 0), 1.9, 10, undefined, 1, 2.6, 1);
    for (let k = 0; k < 3; k++) chunk("fo" + S, ...at("fo" + S, rr(-0.3, 0.3), -1.8 - k * 3, rr(-0.3, 0.3)), 2.5 + k * 0.25, 1, 1.25, 1, 0, 0, sd++);
    magma("fo" + S, ...at("fo" + S, 0, -4.5, 0), 2.0, 10, undefined, 1, 2.6, 1);
    // the fist: a great knuckled boulder
    chunk("ha" + S, ...at("ha" + S, 0, -2.2, 0.3), 3.0, 1.1, 1.0, 1.15, 0, 0, sd++);
    for (let k = 0; k < 4; k++) chunk("ha" + S, ...at("ha" + S, (k - 1.5) * 1.3, -4.4, 1.6), 1.05, 1, 1, 1, 0, 0, sd++, 1);
    magma("ha" + S, ...at("ha" + S, 0, -2.2, 0.2), 2.3, 10);
    // crystals: on the outer forearm (k 0) and the back of the fist (k 1)
    for (let k = 0; k < 2; k++) {
      const ci = (S === "L" ? 0 : 2) + k, part = 2 + ci;
      const base = k === 0 ? at("fo" + S, 2.2 * s, -6.5, 0.4) : at("ha" + S, 0, -1.2, 2.6);
      const bone = k === 0 ? "fo" + S : "ha" + S;
      for (let j = 0; j < 5; j++) {
        const g = new THREE.OctahedronGeometry(0.85 + (j === 0 ? 0.5 : 0), 0);
        const ax = k === 0 ? s : 0, az = k === 0 ? 0 : 1;
        glow.add(g, mat4(THREE, base[0] + ax * rr(0, 0.5) + rr(-0.5, 0.5), base[1] + rr(-0.8, 0.8), base[2] + az * rr(0, 0.5) + rr(-0.4, 0.4), rr(-0.6, 0.6), rr(0, 3), (k === 0 ? -s : 0) * 0.9 + rr(-0.4, 0.4), 0.75, 2.4 - j * 0.22, 0.75), 0xffb24a, { aBone: BI[bone], aPart: part });
      }
    }
  }
  function finishSkinned(geo) {
    const n = geo.attributes.position.count, b = geo.attributes.aBone.array;
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { si[i * 4] = b[i]; sw[i * 4] = 1; }
    geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(sw, 4));
    geo.deleteAttribute("aBone");
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 8, 0), 34);
    return geo;
  }
  const bodyGeo = finishSkinned(body.build());
  const glowGeo = finishSkinned(glow.build());

  // ------------------------------------------------------------------------------------------ materials
  const U = { uHeat: { value: 1 }, uStone: { value: 0 }, uTime: { value: 0 }, uFlare: { value: 0 }, tNoise: { value: noiseTexture(THREE) } };
  const NP = 11; // parts: 0 eyes, 1 mouth, 2..5 crystals, 6..8 vents, 9 core, 10 magma
  const partU = { value: new Float32Array(NP).fill(1) };
  const iceU = { value: new Float32Array(NP) };
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.05, flatShading: true });
  bodyMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vBind;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvBind = position;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uHeat, uStone, uTime, uFlare; uniform sampler2D tNoise; varying vec3 vBind;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.34, 0.33, 0.32) * (0.8 + 0.4 * texture2D(tNoise, vBind.xz * 0.05).r), uStone);`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        { vec2 uv = vec2(vBind.x + vBind.z * 0.7, vBind.y - vBind.z * 0.4) * 0.035;
          vec4 a = texture2D(tNoise, uv), b = texture2D(tNoise, uv * 2.7 + 0.31);
          float seam = smoothstep(0.085, 0.0, a.b) + smoothstep(0.05, 0.0, b.b) * 0.22;
          float low = smoothstep(18.0, -4.0, vBind.y);                       // hotter toward the lava
          float pulse = 0.75 + 0.25 * sin(uTime * 2.2 - vBind.y * 0.25);
          float h = seam * (0.55 + 0.6 * low) * pulse * uHeat;
          totalEmissiveRadiance += mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.65, 0.2), seam * 0.5) * h * 1.6;
          totalEmissiveRadiance += vec3(0.6, 0.1, 0.0) * low * low * 0.12 * uHeat;
          diffuseColor.rgb *= 1.0 - min(h, 0.8); }`);
  };
  bodyMat.customProgramCacheKey = () => "magmorBody";
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  glowMat.onBeforeCompile = (sh) => {
    sh.uniforms.uPart = partU; sh.uniforms.uIce = iceU; sh.uniforms.uHeat = U.uHeat; sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aPart; varying float vPart;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvPart = aPart;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uPart[11]; uniform float uIce[11]; uniform float uHeat, uTime; varying float vPart;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        { int pi = int(vPart + 0.5); float k = 1.0, ice = 0.0;
          for (int i = 0; i < 11; i++) if (i == pi) { k = uPart[i]; ice = uIce[i]; }
          float fl = 0.85 + 0.15 * sin(uTime * 7.0 + vPart * 3.1);
          vec3 hot = diffuseColor.rgb * (pi == 10 ? 1.0 : fl) * k * mix(0.15, 1.0, uHeat);
          vec3 cold = vec3(0.55, 0.85, 1.0) * (0.7 + 0.3 * fl);
          diffuseColor.rgb = mix(hot, cold, ice);
          if (k <= 0.001 && ice < 0.01) discard; }`);
  };
  glowMat.customProgramCacheKey = () => "magmorGlow";

  // ------------------------------------------------------------------------------------------ meshes
  const group = new THREE.Group(); group.name = "magmor";
  group.position.set(BX, 0, BZ);
  const bodyMesh = new THREE.SkinnedMesh(bodyGeo, bodyMat); bodyMesh.name = "magmorBody"; bodyMesh.castShadow = true; bodyMesh.frustumCulled = false;
  const glowMesh = new THREE.SkinnedMesh(glowGeo, glowMat); glowMesh.name = "magmorGlow"; glowMesh.frustumCulled = false;
  bodyMesh.add(root);
  group.add(bodyMesh, glowMesh);
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  bodyMesh.bind(skeleton); glowMesh.bind(skeleton);
  // crumble rocks for the ending + the lava wave ring (both one draw call each, hidden in the fight)
  const CR = 26;
  const crumbleGeo = rock(1.6, 1, 91);
  const crumble = new THREE.InstancedMesh(crumbleGeo, new THREE.MeshStandardMaterial({ color: 0x4a4644, roughness: 0.95, flatShading: true }), CR);
  crumble.name = "magmorRocks"; crumble.frustumCulled = false; crumble.visible = false; crumble.castShadow = true;
  crumble.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const crs = { x: new Float32Array(CR), y: new Float32Array(CR), z: new Float32Array(CR), vx: new Float32Array(CR), vy: new Float32Array(CR), vz: new Float32Array(CR), s: new Float32Array(CR), t0: new Float32Array(CR) };
  const waveMat = lavaMaterial(THREE, { uTime: U.uTime, uGlow: { value: 1.3 }, uCool: { value: 0 } }, { scale: 0.5, flowZ: 2 });
  const wave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 8, 64).rotateX(Math.PI / 2).scale(1, 9, 1), waveMat);
  wave.name = "lavaWave"; wave.visible = false; wave.frustumCulled = false;
  // ice flowers (phase 2): glowing blue blooms on the islands, an InstancedMesh of 4
  const flowerGeo = (() => {
    const mg = createMerger(THREE, []);
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; mg.add(new THREE.ConeGeometry(0.16, 0.7, 5), mat4(THREE, Math.sin(a) * 0.22, 0.38, Math.cos(a) * 0.22, Math.cos(a) * 0.6, 0, -Math.sin(a) * 0.6), 0xbfefff); }
    mg.add(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 5), mat4(THREE, 0, 0.2, 0), 0x6ad0e8);
    mg.add(new THREE.IcosahedronGeometry(0.13, 1), mat4(THREE, 0, 0.42, 0), 0xffffff);
    return mg.build();
  })();
  const flowerMesh = new THREE.InstancedMesh(flowerGeo, new THREE.MeshBasicMaterial({ vertexColors: true }), 4);
  flowerMesh.name = "iceFlowers"; flowerMesh.frustumCulled = false; flowerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const flowers = [0, 1, 2, 5].map((isl, i) => ({ i, island: isl, on: false, t: 0, get x() { return V.islands[isl].x + 1.2; }, get z() { return V.islands[isl].z + 0.8; } }));
  group.add(crumble);
  V.group.add(group);
  // the wave and flowers live in world space (the arena), not in the boss's frame
  const fxRoot = new THREE.Group(); fxRoot.name = "magmorFx"; fxRoot.add(wave, flowerMesh); V.group.add(fxRoot);

  // ------------------------------------------------------------------------------------------ posing
  const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), tv = new THREE.Vector3(), tv2 = new THREE.Vector3(), tv3 = new THREE.Vector3(), tm = new THREE.Matrix4(), te = new THREE.Euler();
  const DOWN = new THREE.Vector3(0, -1, 0);
  const ID = new THREE.Quaternion();
  const armQ = { L: { up: new THREE.Quaternion(), fo: new THREE.Quaternion(), ha: new THREE.Quaternion() }, R: { up: new THREE.Quaternion(), fo: new THREE.Quaternion(), ha: new THREE.Quaternion() } };
  // arm targets in world space; k = how much of the IK pose is used (0 = idle pose)
  const arm = {
    L: { tx: 0, ty: 0, tz: 0, k: 0, kWant: 0, rate: 3, fist: 0 },
    R: { tx: 0, ty: 0, tz: 0, k: 0, kWant: 0, rate: 3, fist: 0 },
  };
  const L1 = 9, L2 = 9;
  const pole = new THREE.Vector3(), nAx = new THREE.Vector3(), dir = new THREE.Vector3(), upDir = new THREE.Vector3(), inv = new THREE.Matrix4();
  function solveArm(S, outUp, outFo) {
    const a = arm[S], up = bones[BI["up" + S]], chest = bones[BI.chest];
    // the shoulder joint in world space, the target in chest space
    up.getWorldPosition(tv);
    tv2.set(a.tx, a.ty, a.tz).sub(tv);                     // world vector shoulder -> target
    chest.getWorldQuaternion(tq).invert();                 // chest world rotation inverse
    tv2.applyQuaternion(tq);                                // now in chest space (shoulder bone has no rotation)
    const d = clamp(tv2.length(), 3, L1 + L2 - 0.2);
    dir.copy(tv2).normalize();
    const cosE = clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1), bend = Math.PI - Math.acos(cosE);
    const a1 = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    pole.set(S === "L" ? 0.6 : -0.6, -0.3, -1).normalize();                    // elbows out and back
    nAx.crossVectors(dir, pole); if (nAx.lengthSq() < 1e-6) nAx.set(1, 0, 0); nAx.normalize();
    upDir.copy(dir).applyAxisAngle(nAx, -a1);
    outUp.setFromUnitVectors(DOWN, upDir);
    tv3.copy(nAx).applyQuaternion(tq2.copy(outUp).invert());
    outFo.setFromAxisAngle(tv3, bend);
  }
  // idle / attack body pose, set every frame
  const pose = { lean: 0, twist: 0, headPitch: 0, jaw: 0.05, rise: 0, roar: 0, slump: 0, yaw: Math.PI, plate: 0, breathe: 0 };
  function applyPose(dt) {
    const t = clock;
    const br = Math.sin(t * 0.9) * 0.025;
    root.position.set(0, -10 + V.lavaY + (pose.rise - 1) * 34 - pose.slump * 6, 0);
    group.rotation.y = pose.yaw;
    bones[BI.hips].rotation.set(pose.lean * 0.3, pose.twist * 0.4, 0);
    bones[BI.spine].rotation.set(pose.lean * 0.4 + br, pose.twist * 0.3, Math.sin(t * 0.5) * 0.02);
    bones[BI.chest].rotation.set(pose.lean * 0.3 - pose.roar * 0.25 + br + pose.slump * 0.4, pose.twist * 0.3, 0);
    bones[BI.neck].rotation.set(pose.headPitch * 0.5 - pose.roar * 0.3 + pose.slump * 0.3, pose.twist * 0.2, 0);
    bones[BI.head].rotation.set(pose.headPitch * 0.5 - pose.roar * 0.35, 0, Math.sin(t * 0.7) * 0.03);
    bones[BI.jaw].rotation.set(pose.jaw + pose.roar * 0.55, 0, 0);
    bones[BI.plL].position.fromArray(REST.plL); bones[BI.plR].position.fromArray(REST.plR);
    bones[BI.plL].position.x += pose.plate * 2.6; bones[BI.plR].position.x -= pose.plate * 2.6;
    bones[BI.plL].rotation.y = pose.plate * 0.9; bones[BI.plR].rotation.y = -pose.plate * 0.9;
    root.updateMatrixWorld(true);
    for (const S of ["L", "R"]) {
      const a = arm[S], s = S === "L" ? 1 : -1, Q = armQ[S];
      if (a.k !== a.kWant) { const st = a.rate * dt; a.k = Math.abs(a.kWant - a.k) <= st ? a.kWant : a.k + Math.sign(a.kWant - a.k) * st; }
      // idle: arms hang forward, fists resting on the lava, a slow sway
      te.set(-0.35 + Math.sin(t * 0.8 + s) * 0.04 - pose.roar * 0.9, 0, s * (0.18 + pose.roar * 0.7) + pose.slump * s * 0.2); tq.setFromEuler(te);
      te.set(-0.55 - pose.roar * 0.5, 0, 0); tq2.setFromEuler(te);
      if (a.k > 0.001) {
        solveArm(S, Q.up, Q.fo);
        const k = smooth(a.k);
        tq.slerp(Q.up, k); tq2.slerp(Q.fo, k);
      }
      bones[BI["up" + S]].quaternion.copy(tq);
      bones[BI["fo" + S]].quaternion.copy(tq2);
      bones[BI["ha" + S]].rotation.set(-0.3 * (1 - a.fist), 0, 0);
      bones[BI["up" + S]].updateMatrixWorld(true);
    }
  }
  const handPos = { L: new THREE.Vector3(), R: new THREE.Vector3() };
  const CRYSTAL_OFF = [["foL", new THREE.Vector3(2.2, -6.5, 0.4)], ["haL", new THREE.Vector3(0, -1.2, 2.6)], ["foR", new THREE.Vector3(-2.2, -6.5, 0.4)], ["haR", new THREE.Vector3(0, -1.2, 2.6)]];
  const CORE_OFF = new THREE.Vector3(0, 0, 6.2);
  const crystals = [0, 1, 2, 3].map((i) => ({ i, x: 0, y: 0, z: 0, hp: 3, broken: false, glowing: false, part: "crystal", hand: i < 2 ? "L" : "R" }));
  const vents = [0, 1, 2].map((i) => ({ i, x: 0, y: 0, z: 0, open: false, plugged: false, part: "vent" }));
  const core = { x: 0, y: 0, z: 0, open: false, openT: 0, part: "core" };
  const boneOffs = [];
  function readPoints() {
    for (const S of ["L", "R"]) { tv.set(0, -2.6, 0.3); handPos[S].copy(tv).applyMatrix4(bones[BI["ha" + S]].matrixWorld); }
    for (let i = 0; i < 4; i++) { const [b, off] = CRYSTAL_OFF[i]; tv.copy(off).applyMatrix4(bones[BI[b]].matrixWorld); crystals[i].x = tv.x; crystals[i].y = tv.y; crystals[i].z = tv.z; }
    for (let i = 0; i < 3; i++) { const [b, dx, dy, dz] = VENT_AT[i]; tv.set(dx, dy, dz).applyMatrix4(bones[BI[b]].matrixWorld); vents[i].x = tv.x; vents[i].y = tv.y; vents[i].z = tv.z; }
    tv.copy(CORE_OFF).applyMatrix4(bones[BI.chest].matrixWorld); core.x = tv.x; core.y = tv.y; core.z = tv.z;
  }

  // ------------------------------------------------------------------------------------------ fight state
  let clock = 0, phase = 0, hp = 1, stunned = false, defeated = false, running = false, assist = 0;
  let act = null, actT = 0, nextT = 2, attackN = 0, stunT = 0, flareT = 0, shakeT = 0;
  const deaths = [0, 0, 0];
  let lastReset = -1;
  const zones = [];
  const pl = () => ctx.player;
  function telegraphK() { return 1 + assist * 0.25; }
  function zone(o) { const id = vfx("dangerZone", o); if (typeof id === "number" && id >= 0) zones.push(id); return id; }
  function clearZones() { for (const id of zones) vfx("dangerCancel", id); zones.length = 0; }
  function flare(s) { flareT = Math.max(flareT, s || 1); sfx("magmorRoar", 0.35); }
  function playerFloor() { const p = pl(); return V.heightAt(p.x, p.z); }
  function airborne() { const p = pl(); return !p.grounded || p.y - playerFloor() > 0.45; }
  function hurt(x, z, kind, knock) { if (!ctx.health || !ctx.health.on) return false; return ctx.health.damage(1, { x, z, kind: kind || "blast", knock: knock || 5 }); }
  function playerIsland() {
    const p = pl(); let best = -1, bd = 1e9;
    for (const o of V.islands) { const d = Math.hypot(p.x - o.x, p.z - o.z) - o.r; if (d < bd) { bd = d; best = o.i; } }
    return best;
  }
  function aimArm(S, x, y, z, k, rate) { const a = arm[S]; a.tx = x; a.ty = y; a.tz = z; a.kWant = k; a.rate = rate || 3; }
  function sideFor(x, z) {
    // which hand reaches (x, z): the boss faces the player; left hand is +x in its frame
    const lx = Math.cos(pose.yaw) * (x - BX) - Math.sin(pose.yaw) * (z - BZ);
    return lx >= 0 ? "L" : "R";
  }
  function emit(name, x, z, t) { if (boss.onAttack) boss.onAttack(name, x, z, t); }
  function startAct(name, o) { act = Object.assign({ name, t: 0 }, o || {}); actT = 0; attackN++; }

  // FISTS ----------------------------------------------------------------------------------
  function pickPhase0() {
    const p = pl(), r = R();
    const left = crystals.filter((c) => !c.broken).length;
    if (attackN % 3 === 0 || r < 0.45) {
      let S = sideFor(p.x, p.z);
      // a hand with no crystals left would rest with nothing to hit: slam with the other one
      if (!crystals.some((c) => c.hand === S && !c.broken)) S = S === "L" ? "R" : "L";
      startAct("slam", { S, x: p.x, z: p.z, T: 1.25 * telegraphK() });
    } else if (r < 0.75) startAct("sweep", { S: R() < 0.5 ? "L" : "R", T: 1.0 * telegraphK() });
    else startAct("grab", { S: sideFor(p.x, p.z), isl: playerIsland(), T: 1.4 * telegraphK() });
    void left;
  }
  function runPhase0(dt) {
    const a = act, p = pl();
    a.t += dt;
    if (a.name === "slam") {
      const y0 = V.heightAt(a.x, a.z);
      if (!a.z0) { a.z0 = 1; a.id = zone({ shape: "circle", x: a.x, z: a.z, r: 5, seconds: a.T, colorHex: 0xff4a12 }); flare(a.T); sfx("bossWindup"); emit("slam", a.x, a.z, a.T); }
      if (a.t < a.T) aimArm(a.S, a.x + (BX - a.x) * 0.08, y0 + 12 - a.t * 2, a.z + (BZ - a.z) * 0.08, 1, 2.2);
      else if (!a.hit) { aimArm(a.S, a.x, y0 + 2.6, a.z, 1, 14); if (a.t > a.T + 0.12) { a.hit = 1; impact(a.x, y0, a.z, 5); if (Math.hypot(p.x - a.x, p.z - a.z) < 5) hurt(a.x, a.z, "melee", 7); crackNear(a.x, a.z); } }
      else if (a.t < a.T + 2.6) {
        // the fist rests: one crystal on that hand glows
        const ci = crystals.find((c) => c.hand === a.S && !c.broken);
        for (const c of crystals) c.glowing = c === ci;
        arm[a.S].fist = 1;
      } else { for (const c of crystals) c.glowing = false; arm[a.S].kWant = 0; arm[a.S].rate = 1.2; arm[a.S].fist = 0; endAct(1.2); }
    } else if (a.name === "sweep") {
      // a line across the islands perpendicular to the boss -> player direction, swept from one side to the other
      if (!a.init) {
        a.init = 1;
        const dx = p.x - BX, dz = p.z - BZ, l = Math.hypot(dx, dz) || 1;
        a.ux = dx / l; a.uz = dz / l; a.d = clamp(l, 10, 19); a.cx = BX + a.ux * a.d; a.cz = BZ + a.uz * a.d;
        a.px = -a.uz * (a.S === "L" ? 1 : -1); a.pz = a.ux * (a.S === "L" ? 1 : -1);
        zone({ shape: "line", x: a.cx - a.px * 16, z: a.cz - a.pz * 16, yaw: Math.atan2(a.px, a.pz), len: 32, width: 3.2, seconds: a.T, colorHex: 0xff4a12 });
        flare(a.T); sfx("bossWindup"); emit("sweep", a.cx, a.cz, a.T);
      }
      const k = clamp((a.t - a.T) / 1.1, 0, 1), s = lerp(-16, 16, smooth(k));
      const hx = a.cx + a.px * (a.t < a.T ? -16 : s), hz = a.cz + a.pz * (a.t < a.T ? -16 : s);
      aimArm(a.S, hx, V.lavaY + (a.t < a.T ? 4 : 1.4), hz, 1, a.t < a.T ? 2 : 8);
      if (a.t >= a.T && k < 1) {
        if (R() < dt * 20) vfx("lavaSplash", hx, V.lavaY, hz, 0.6);
        // the arm passes the player: on the ground in the band = hit
        const along = (p.x - a.cx) * a.px + (p.z - a.cz) * a.pz, across = (p.x - a.cx) * a.ux + (p.z - a.cz) * a.uz;
        if (!a.hitDone && Math.abs(along - s) < 2.2 && Math.abs(across) < 2 && !airborne()) { a.hitDone = 1; hurt(hx, hz, "melee", 6); }
        if (!a.snd) { a.snd = 1; sfx("bossSwipe"); }
      }
      if (k >= 1) { arm[a.S].kWant = 0; arm[a.S].rate = 1.5; endAct(1.0); }
    } else if (a.name === "grab") {
      const o = V.islands[a.isl];
      if (!a.init) { a.init = 1; zone({ shape: "circle", x: o.x, z: o.z, r: o.r + 1, seconds: a.T, colorHex: 0xff4a12 }); flare(a.T); sfx("bossWindup"); emit("grab", o.x, o.z, a.T); }
      if (a.t < a.T) aimArm(a.S, o.x, o.y + 8, o.z, 1, 2.4);
      else if (!a.hit) { aimArm(a.S, o.x, o.y + 2, o.z, 1, 10); arm[a.S].fist = 1; if (a.t > a.T + 0.15) { a.hit = 1; impact(o.x, o.y, o.z, 3); if (Math.hypot(p.x - o.x, p.z - o.z) < o.r + 0.6) hurt(o.x, o.z, "melee", 8); } }
      else if (a.t > a.T + 1.4) { arm[a.S].kWant = 0; arm[a.S].fist = 0; endAct(1.0); }
    }
  }
  function crackNear(x, z) {
    for (const b of V.bridges) { if (!b.intact) continue; const mx = (b.ax + b.bx) / 2, mz = (b.az + b.bz) / 2; if (Math.hypot(mx - x, mz - z) < 6 && R() < 0.5) b.crack(1.5); }
  }
  function impact(x, y, z, r) {
    vfx("slam", x, z, r); vfx("shockRing", x, y + 0.1, z, r * 1.3); vfx("rockDebris", x, y, z, 10); vfx("lavaSplash", x, y, z, 1.2);
    V.puff(x, y + 0.5, z, 2.2, 0x2a2422, 2.4, 2); V.puff(x + 1, y + 0.5, z - 1, 1.6, 0x4a3a30, 1.6, 1.6);
    sfx("bossSlam"); sfx("magmorStep");
    V.quake(0.55, 0.6);
  }
  function endAct(rest) { act = null; nextT = rest * (1 + assist * 0.3); }

  // ERUPTION -------------------------------------------------------------------------------
  let ventCycle = 0, ventT = 0, ventIdx = -1, waveR = -1, waveHit = false;
  function pickPhase1() {
    const r = R();
    if (r < 0.34) startAct("bombs", { n: 3 + (attackN % 2), T: 0.9 * telegraphK() });
    else if (r < 0.67) startAct("wave", { T: 1.1 * telegraphK() });
    else startAct("fireball", { n: 3, T: 0.8 * telegraphK() });
  }
  function runPhase1(dt) {
    const a = act, p = pl();
    a.t += dt;
    if (a.name === "bombs") {
      if (!a.init) { a.init = 1; flare(a.T); pose.roar = 0.6; emit("bombs", BX, BZ, a.T); }
      if (a.t > a.T && !a.done) { a.done = 1; V.erupt(BX + rr(-6, 6), BZ + rr(-3, 3), 1 + (a.n - 3) * 0.3); for (let i = 1; i < a.n; i++) V.bombs.launch(BX, 14, BZ, p.x + rr(-5, 5), p.z + rr(-5, 5), 1.6 + i * 0.25, 2.2); }
      if (a.t > a.T + 1.2) endAct(1.4);
    } else if (a.name === "wave") {
      if (!a.init) { a.init = 1; flare(a.T); aimArm("L", BX + 6, V.lavaY + 10, BZ - 4, 1, 2); aimArm("R", BX - 6, V.lavaY + 10, BZ - 4, 1, 2); emit("wave", BX, BZ, a.T); sfx("bossWindup"); zone({ shape: "ring", x: BX, z: BZ, r: 12, width: 1.8, seconds: a.T, colorHex: 0xff4a12 }); }
      if (a.t > a.T && !a.done) { a.done = 1; aimArm("L", BX + 6, V.lavaY, BZ - 5, 1, 10); aimArm("R", BX - 6, V.lavaY, BZ - 5, 1, 10); impact(BX, V.lavaY, BZ - 6, 4); waveR = 7; waveHit = false; wave.visible = true; sfx("eruption", BX, BZ, 0.8); }
      if (a.t > a.T + 1) { arm.L.kWant = 0; arm.R.kWant = 0; }
      if (a.t > a.T + 3) endAct(0.8);
    } else if (a.name === "fireball") {
      if (!a.init) { a.init = 1; a.k = 0; flare(a.T); emit("fireball", p.x, p.z, a.T); }
      pose.jaw = 0.4;
      if (a.t > a.T + a.k * 0.55 && a.k < a.n) {
        a.k++;
        tv.set(0, -0.5, 2.6).applyMatrix4(bones[BI.jaw].matrixWorld);
        // aimed at where the player is now: strafing dodges it
        V.bombs.launch(tv.x, tv.y, tv.z, p.x, p.z, 1.05 / (1 - assist * 0.2), 1.6);
        sfx("magmorRoar", 0.25);
      }
      if (a.k >= a.n && a.t > a.T + a.n * 0.55 + 0.5) { pose.jaw = 0.05; endAct(1.2); }
    }
  }
  function updateVents(dt) {
    // the vents open in turn (5 s each, 1.5 s rest), only unplugged ones
    ventT -= dt;
    if (ventT <= 0) {
      for (const v of vents) v.open = false;
      const left = vents.filter((v) => !v.plugged);
      if (!left.length) return;
      ventCycle = (ventCycle + 1) % 2;
      if (ventCycle === 1) { ventIdx = left[(attackN + left.length) % left.length].i; vents[ventIdx].open = true; ventT = 5.5 + assist * 1.5; sfx("eruption", vents[ventIdx].x, vents[ventIdx].z, 0.4); }
      else ventT = 1.5;
    }
    for (const v of vents) if (v.open && R() < dt * 10) V.puff(v.x, v.y + 1, v.z, 1.4, 0x3a2a24, 5, 1.6);
  }
  function updateWave(dt) {
    if (waveR < 0) return;
    waveR += dt * 9;
    wave.position.set(BX, V.lavaY + 0.05, BZ); wave.scale.set(waveR, 1, waveR);
    const p = pl(), d = Math.hypot(p.x - BX, p.z - BZ);
    if (!waveHit && Math.abs(d - waveR) < 0.9 && !airborne()) { waveHit = true; hurt(BX, BZ, "blast", 6); }
    if (waveR > 42) { waveR = -1; wave.visible = false; }
  }
  function updateFlowers(dt) {
    let dirty = false;
    for (const f of flowers) {
      const isl = V.islands[f.island];
      if (phase !== 1 || defeated) f.on = false;
      if (!f.on) { f.t -= dt; if (f.t <= 0 && isl.above && phase === 1 && running) { f.on = true; f.grow = 0; vfx("sparkle", f.x, isl.y + 0.5, f.z, 8, 0x9adfff); } }
      if (f.on) { f.grow = Math.min(1, (f.grow || 0) + dt * 1.5); const s = smooth(f.grow) * (1 + Math.sin(clock * 3 + f.i) * 0.06); tm.compose(tv.set(f.x, isl.y, f.z), ID, tv2.set(s, s, s)); flowerMesh.setMatrixAt(f.i, tm); dirty = true; }
      else { tm.makeScale(0, 0, 0); flowerMesh.setMatrixAt(f.i, tm); dirty = true; }
    }
    if (dirty) flowerMesh.instanceMatrix.needsUpdate = true;
  }

  // CORE -----------------------------------------------------------------------------------
  const usedDrafts = [];
  function pickPhase2() {
    const r = R(), p = pl();
    if (r < 0.4) startAct("double", { T: 1.2 * telegraphK() });
    else if (r < 0.7) startAct("ringslam", { T: 1.2 * telegraphK() });
    else startAct("breath", { T: 1.3 * telegraphK(), side: R() < 0.5 ? 1 : -1 });
    void p;
  }
  function runPhase2(dt) {
    const a = act, p = pl();
    a.t += dt;
    if (a.name === "double") {
      if (!a.init) {
        a.init = 1;
        // one fist on the player's island, the other on a neighbour
        const i0 = playerIsland(), i1 = (i0 + (R() < 0.5 ? 1 : 6)) % 7, o0 = V.islands[i0], o1 = V.islands[i1];
        a.x0 = p.x; a.z0 = p.z; a.x1 = o1.x; a.z1 = o1.z;
        a.S0 = sideFor(a.x0, a.z0); a.S1 = a.S0 === "L" ? "R" : "L";
        zone({ shape: "circle", x: a.x0, z: a.z0, r: 4.5, seconds: a.T, colorHex: 0xff4a12 });
        zone({ shape: "circle", x: a.x1, z: a.z1, r: 4.5, seconds: a.T, colorHex: 0xff4a12 });
        flare(a.T); sfx("bossWindup"); emit("double", a.x0, a.z0, a.T); void o0;
      }
      if (a.t < a.T) { aimArm(a.S0, a.x0, V.heightAt(a.x0, a.z0) + 11, a.z0, 1, 2.4); aimArm(a.S1, a.x1, V.heightAt(a.x1, a.z1) + 11, a.z1, 1, 2.4); }
      else if (!a.hit) {
        aimArm(a.S0, a.x0, V.heightAt(a.x0, a.z0) + 2.6, a.z0, 1, 14); aimArm(a.S1, a.x1, V.heightAt(a.x1, a.z1) + 2.6, a.z1, 1, 14);
        if (a.t > a.T + 0.12) { a.hit = 1; impact(a.x0, V.heightAt(a.x0, a.z0), a.z0, 4.5); impact(a.x1, V.heightAt(a.x1, a.z1), a.z1, 4.5); if (Math.hypot(p.x - a.x0, p.z - a.z0) < 4.5 || Math.hypot(p.x - a.x1, p.z - a.z1) < 4.5) hurt(a.x0, a.z0, "melee", 7); }
      } else if (a.t > a.T + 1.6) { arm.L.kWant = 0; arm.R.kWant = 0; endAct(1.2); }
    } else if (a.name === "ringslam") {
      if (!a.init) { a.init = 1; aimArm("L", BX + 5, V.lavaY + 14, BZ - 3, 1, 2); aimArm("R", BX - 5, V.lavaY + 14, BZ - 3, 1, 2); flare(a.T); pose.roar = 0.5; zone({ shape: "ring", x: BX, z: BZ, r: 17, width: 2.2, seconds: a.T + 0.9, colorHex: 0xff4a12 }); emit("ringslam", BX, BZ, a.T); sfx("bossWindup"); }
      if (a.t > a.T && !a.done) { a.done = 1; pose.roar = 0; aimArm("L", BX + 5, V.lavaY, BZ - 6, 1, 12); aimArm("R", BX - 5, V.lavaY, BZ - 6, 1, 12); impact(BX, V.lavaY, BZ - 6, 5); waveR = 7; waveHit = false; wave.visible = true; }
      if (a.t > a.T + 1) { arm.L.kWant = 0; arm.R.kWant = 0; }
      if (a.t > a.T + 2.6) endAct(1);
    } else if (a.name === "breath") {
      // fire over half the arena: a cone from the mouth, swept from the centre line to one side
      const baseYaw = Math.atan2(p.x - BX, p.z - BZ);
      if (!a.init) { a.init = 1; a.yaw = baseYaw + a.side * 0.9; zone({ shape: "cone", x: BX, z: BZ, yaw: a.yaw, arc: 1.9, r: 34, seconds: a.T, colorHex: 0xff3a10 }); flare(a.T); pose.roar = 0.3; emit("breath", BX + Math.sin(a.yaw) * 15, BZ + Math.cos(a.yaw) * 15, a.T); sfx("magmorRoar", 0.6); }
      if (a.t > a.T && a.t < a.T + 1.4) {
        pose.jaw = 0.7;
        tv.set(0, -0.5, 2.6).applyMatrix4(bones[BI.jaw].matrixWorld);
        if (R() < dt * 30) { const k = rr(0.2, 1), ang = a.yaw + rr(-0.95, 0.95); V.puff(BX + Math.sin(ang) * 30 * k, V.lavaY + 1 + 8 * (1 - k), BZ + Math.cos(ang) * 30 * k, 1.5 + k * 2, 0xff7a2a, 0.6, 0.8); }
        const pd = Math.hypot(p.x - BX, p.z - BZ), pa = Math.atan2(p.x - BX, p.z - BZ);
        if (!a.hitDone && pd < 34 && Math.abs(angDiff(pa, a.yaw)) < 0.95) { a.hitDone = 1; hurt(BX, BZ, "blast", 4); }
      }
      if (a.t > a.T + 1.6) { pose.jaw = 0.05; pose.roar = 0; endAct(1.2); }
    }
  }
  function updateCore(dt) {
    const p = pl();
    // ridden up an updraft to chest height -> the plates open for 3 s
    if (!core.open && p && p.y > V.lavaY + 9 && Math.hypot(p.x - BX, p.z - BZ) < 24) boss.openCore(3);
    if (core.open) { core.openT -= dt; if (core.openT <= 0) { core.open = false; } }
    pose.plate += ((core.open ? 1 : 0) - pose.plate) * Math.min(1, dt * 5);
    partU.value[9] = 0.4 + pose.plate * 1.6 + (core.open ? Math.sin(clock * 14) * 0.2 : 0);
  }

  // ------------------------------------------------------------------------------------------ boss API
  let coolK = 1, coolFrom = 1, coolT = 1, coolDur = 1, crumbleT = -1, riseK = 1, riseWant = 1, riseRate = 1, stoneT = -1;
  const boss = {
    group, name: "MAGMOR", bones, skeleton, crystals, vents, core, flowers,
    onPhase: null, onDefeat: null, onAttack: null,
    get phase() { return phase; }, get hp() { return hp; }, get stunned() { return stunned; }, get defeated() { return defeated; },
    get running() { return running; }, get attack() { return act ? act.name : null; }, get assist() { return assist; }, deaths,
    get x() { return BX; }, get z() { return BZ; },
    // potion / scream targets (objects with x, y, z)
    targets: [],
    start(n) {
      phase = clamp(n | 0, 0, 2); running = true; stunned = false; defeated = false; act = null; nextT = 2.2; attackN = 0;
      group.visible = true; fxRoot.visible = true;
      if (phase === 0) { for (const c of crystals) { c.hp = 3; c.broken = false; c.glowing = false; } hp = 1; }
      if (phase === 1) { for (const v of vents) { v.plugged = false; v.open = false; } ventT = 2; hp = 1; V.setLava(0.35, 3); for (const i of [3, 4, 6]) V.islands[i].sink(1, 4); for (const f of flowers) { f.on = false; f.t = 1 + f.i; } }
      if (phase === 2) { usedDrafts.length = 0; core.open = false; hp = 1; V.setLava(0.2, 2); V.setRing(1, 4); for (const o of V.islands) o.raise(1, 3); for (let i = 0; i < 4; i++) V.setUpdraft(i, true); V.collapseWall(); }
      boss.targets.length = 0;
      if (phase === 1) for (const v of vents) boss.targets.push(v);
      if (phase === 2) boss.targets.push(core);
    },
    stop() { running = false; act = null; clearZones(); arm.L.kWant = arm.R.kWant = 0; for (const c of crystals) c.glowing = false; for (const v of vents) v.open = false; },
    reset(n) {
      n = clamp(n | 0, 0, 2);
      if (lastReset === n) deaths[n]++; lastReset = n;
      boss.setAssist(deaths[n] >= 4 ? 1 : 0);
      boss.stop(); waveR = -1; wave.visible = false; crumble.visible = false; crumbleT = -1;
      coolK = 1; U.uHeat.value = 1; U.uStone.value = 0; pose.slump = 0; pose.roar = 0; pose.plate = 0; riseK = riseWant = 1;
      V.resetArena();
      // the arena as that phase begins
      if (n >= 1) { V.setLava(0.35, 0); for (const i of [3, 4, 6]) V.islands[i].sink(1, 0); }
      if (n >= 2) { V.setLava(0.2, 0); V.setRing(1, 0); for (const o of V.islands) o.raise(1, 0); for (let i = 0; i < 4; i++) V.setUpdraft(i, true); }
      for (let i = 0; i < 4; i++) crystals[i].broken = n > 0;
      for (const v of vents) v.plugged = n > 1;
      phase = n; hp = 1; defeated = false; stunned = false;
      updateParts(0);
    },
    setAssist(k) { assist = clamp(k, 0, 1); V.bombs.setSpeed(1 - assist * 0.3); },
    noteDeath() { deaths[phase]++; boss.setAssist(deaths[phase] >= 4 ? 1 : 0); },
    // the intro: rises out of the lake over `seconds`
    rise(seconds) { group.visible = true; riseK = 0; riseWant = 1; riseRate = 1 / Math.max(0.1, seconds || 8); sfx("magmorRoar", 1); V.quake(0.8, seconds || 8); for (let i = 0; i < 8; i++) V.puff(BX + rr(-8, 8), V.lavaY + 1, BZ + rr(-6, 6), 3, 0x2a2220, 3, 3); },
    roar(size) { pose.roar = 1; roarT = 1.8; sfx("magmorRoar", size === undefined ? 1 : size); flare(1.6); V.quake(0.6 * (size || 1), 1.6); },
    openCore(s) { if (phase !== 2 || defeated) return; core.open = true; core.openT = Math.max(core.openT, s || 3); sfx("rockCrack"); },
    hit(part, i, power) {
      if (!running || defeated) return false;
      power = power === undefined ? 1 : power;
      if (part === "crystal" && phase === 0) {
        const c = crystals[i];
        if (!c || c.broken || !c.glowing) return false;
        c.hp -= power;
        vfx("sparks", c.x, c.y, c.z, 12, 0xffb050); sfx("rockCrack");
        if (c.hp <= 0) {
          c.broken = true; c.glowing = false;
          vfx("glassShards", c.x, c.y, c.z, 0, -1, 50, V.lavaY + 0.5);
          sfx("glassShatter"); sfx("magmorRoar", 0.7); pose.roar = 0.7; roarT = 1;
          const left = crystals.filter((q) => !q.broken).length;
          hp = left / 4;
          if (!left) phaseDone();
        }
        return true;
      }
      if (part === "vent" && phase === 1) {
        const v = vents[i];
        if (!v || v.plugged || !v.open) return false;
        v.plugged = true; v.open = false; ventT = 1.2;
        vfx("potionSplash", v.x, v.y, v.z, 0x9adfff); V.puff(v.x, v.y + 1, v.z, 2.4, 0xeaf6ff, 3, 2.2);
        sfx("potionSmash"); sfx("magmorRoar", 0.6); pose.roar = 0.6; roarT = 1;
        const left = vents.filter((q) => !q.plugged).length;
        hp = left / 3;
        if (!left) phaseDone();
        return true;
      }
      if (part === "core" && phase === 2) {
        if (!core.open) return false;
        const d = i | 0;
        if (usedDrafts.indexOf(d) >= 0 && i !== undefined && i !== null && i >= 0) return false;
        usedDrafts.push(d);
        core.open = false; core.openT = 0;
        vfx("screamWave", core.x, core.y, core.z, 6); vfx("sparks", core.x, core.y, core.z, 30, 0xffe0a0);
        sfx("magmorRoar", 1.2); pose.roar = 1; roarT = 2; V.quake(0.8, 1.2);
        hp = 1 - usedDrafts.length / 3;
        if (usedDrafts.length >= 3) { defeated = true; running = false; act = null; clearZones(); if (boss.onDefeat) boss.onDefeat(); }
        else if (ctx.music && ctx.music.setPhase && usedDrafts.length === 2) { /* the key lift is the level's (music.setPhase) */ }
        return true;
      }
      return false;
    },
    // the potion slot is refilled by ice flowers: the level calls this when the player walks into one
    takeFlower(x, z, r) {
      for (const f of flowers) { if (!f.on) continue; if (Math.hypot(x - f.x, z - f.z) < (r || 1.1)) { f.on = false; f.t = 6; vfx("sparkle", f.x, V.islands[f.island].y + 0.5, f.z, 14, 0x9adfff); sfx("potionPickup"); return true; } }
      return false;
    },
    // the ending: magma darkens to stone, it settles and crumbles into the lake (bloodless)
    coolDown(seconds) {
      seconds = Math.max(0.5, seconds || 6);
      boss.stop(); defeated = true; coolFrom = U.uHeat.value; coolT = 0; coolDur = seconds; stoneT = 0;
      V.setCool && V.setCool(1, seconds * 1.4); V.setGlow(0.25, seconds * 1.4);
      for (let i = 0; i < 4; i++) V.setUpdraft(i, false);
      sfx("rockGrind", 1); sfx("magmorRoar", 0.5);
    },
    update(dt) {
      clock += dt; U.uTime.value = clock;
      if (riseK < riseWant) riseK = Math.min(riseWant, riseK + dt * riseRate);
      pose.rise = smooth(riseK);
      // face the player (within +-65 degrees of the arena front)
      const p = pl();
      if (p && !defeated) { const want = clamp(angDiff(Math.atan2(p.x - BX, p.z - BZ), Math.PI), -1.1, 1.1) + Math.PI; pose.yaw += angDiff(want, pose.yaw) * Math.min(1, dt * 0.8); }
      if (roarT > 0) { roarT -= dt; if (roarT <= 0) pose.roar = 0; }
      if (flareT > 0) flareT -= dt;
      if (running && !defeated) {
        if (stunT > 0) { stunT -= dt; if (stunT <= 0) stunned = false; }
        else if (act) { if (phase === 0) runPhase0(dt); else if (phase === 1) runPhase1(dt); else runPhase2(dt); }
        else { nextT -= dt; if (nextT <= 0) { if (phase === 0) pickPhase0(); else if (phase === 1) pickPhase1(); else pickPhase2(); } }
        if (phase === 1) updateVents(dt);
        if (phase === 2) { updateCore(dt); shakeT -= dt; if (shakeT <= 0) { shakeT = 1.2; if (ctx.cinema && ctx.cinema.shake) ctx.cinema.shake(0.04, 1.3); } }
      } else if (!defeated) pose.plate += (0 - pose.plate) * Math.min(1, dt * 3);
      updateWave(dt);
      updateFlowers(dt);
      if (stoneT >= 0) updateCool(dt);
      applyPose(dt);
      readPoints();
      updateParts(dt);
      if (running && !defeated && R() < dt * 3) { const S = R() < 0.5 ? "L" : "R"; if (arm[S].k < 0.2) vfx("embers", handPos[S].x, V.lavaY + 0.3, handPos[S].z, 1, 3); }
    },
    stats() { return { phase, hp, act: act && act.name, crystals: crystals.map((c) => c.hp), vents: vents.map((v) => (v.plugged ? "P" : v.open ? "O" : "-")).join(""), core: core.open, defeated, tris: (bodyGeo.index.count + glowGeo.index.count) / 3 }; },
  };
  let roarT = 0;
  function phaseDone() {
    stunned = true; stunT = 3.2; act = null; clearZones(); arm.L.kWant = arm.R.kWant = 0;
    pose.roar = 1; roarT = 2.4; sfx("magmorRoar", 1.3); V.quake(0.9, 2);
    running = false;
    const done = phase;
    if (boss.onPhase) boss.onPhase(done);
  }
  function updateParts(dt) {
    const f = flareT > 0 ? 1 : 0;
    partU.value[0] = 1 + f * 2.2 + (stunned ? -0.6 : 0);
    partU.value[1] = 0.6 + pose.jaw * 1.5 + pose.roar * 1.2;
    for (let i = 0; i < 4; i++) { const c = crystals[i]; partU.value[2 + i] = c.broken ? 0 : c.glowing ? 1.8 + Math.sin(clock * 10) * 0.5 : 0.55; }
    for (let i = 0; i < 3; i++) { const v = vents[i]; partU.value[6 + i] = v.open ? 2.2 + Math.sin(clock * 12) * 0.4 : phase >= 1 && !v.plugged ? 0.7 : 0.35; iceU.value[6 + i] = v.plugged ? 1 : 0; }
    if (phase !== 2) partU.value[9] = 0.4 + pose.plate * 1.6;
    partU.value[10] = 1;
  }
  function updateCool(dt) {
    stoneT += dt;
    coolT = Math.min(1, coolT + dt / coolDur);
    const k = smooth(coolT);
    U.uHeat.value = lerp(coolFrom, 0, k); U.uStone.value = k;
    pose.slump = smooth(clamp((stoneT - coolDur * 0.6) / (coolDur * 1.2), 0, 1));
    pose.roar = 0; pose.jaw = 0.25 * (1 - k);
    arm.L.kWant = arm.R.kWant = 0;
    if (coolT >= 1 && crumbleT < 0) startCrumble();
    if (crumbleT >= 0) {
      crumbleT += dt;
      for (let i = 0; i < CR; i++) {
        if (crumbleT < crs.t0[i]) continue;
        crs.vy[i] -= 14 * dt; crs.x[i] += crs.vx[i] * dt; crs.y[i] += crs.vy[i] * dt; crs.z[i] += crs.vz[i] * dt;
        const floor = V.lavaY - 0.5;
        if (crs.y[i] < floor) { crs.y[i] = floor; crs.vy[i] *= -0.15; crs.vx[i] *= 0.5; crs.vz[i] *= 0.5; if (!crs.landed) { V.puff(crs.x[i] + BX, floor + 1, crs.z[i] + BZ, 2, 0xd8d4d0, 1, 2.5); } }
        tm.compose(tv.set(crs.x[i], crs.y[i], crs.z[i]), tq.setFromAxisAngle(tv2.set(0.3, 1, 0.2).normalize(), crumbleT * 0.6 + i), tv3.set(crs.s[i], crs.s[i], crs.s[i]));
        crumble.setMatrixAt(i, tm);
      }
      crumble.instanceMatrix.needsUpdate = true;
      // the body itself settles down into the crust: a quiet mountain
      pose.slump = 1 + clamp(crumbleT / 6, 0, 1) * 1.6;
    }
  }
  function startCrumble() {
    crumbleT = 0; crumble.visible = true;
    for (let i = 0; i < CR; i++) {
      const h = rr(4, 26), a = rr(0, TAU), r = rr(2, 8);
      crs.x[i] = Math.sin(a) * r; crs.y[i] = h + V.lavaY; crs.z[i] = Math.cos(a) * r;
      crs.vx[i] = Math.sin(a) * rr(1, 4); crs.vy[i] = rr(0, 3); crs.vz[i] = Math.cos(a) * rr(1, 4); crs.s[i] = rr(0.6, 1.6); crs.t0[i] = rr(0, 3);
      crumble.setMatrixAt(i, tm.makeScale(0, 0, 0));
    }
    sfx("rockGrind", 1); V.quake(0.4, 4);
  }
  group.visible = false;
  boss.reset(0); lastReset = -1; deaths[0] = 0;
  applyPose(0); readPoints();
  void boneOffs; void tm;
  return boss;
}
