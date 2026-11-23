// PLATYPUS — woods.js (LEVELS3.md B8): the dark woods north of the jungle camp, and the wolves.
// Night, moonlight through tall pines and twisted oaks (instanced, 3 LODs re-assigned only when the focus moves), fog,
// mossy rocks, a stream, fireflies, faintly glowing pawprints, eyes in the dark, and the wolf DEN where Pip is tied
// to a dead tree with three vines.
// Wolves: ONE InstancedMesh (<= 12) of a ~1.6k-triangle wolf animated in the vertex shader (legs, head, tail, crouch,
// breathing) from per-instance attributes; pack AI: circle the player, one lunges at a time after a 0.7 s crouch with
// a danger zone, packs flank, the ALPHA howls for help and charges. Bloodless: a beaten wolf yelps, cowers and runs off.

import { mulberry, clamp, lerp, smooth, sstep, TAU, angDiff, noise3, fbm2, lumpify, createMerger, mat4, heightGrid, skyDome, particleCloud, GLSL_NOISE } from "./kit3.js";

export function createWoods(ctx) {
  const THREE = ctx.THREE;
  const group = new THREE.Group(); group.name = "woods";
  const R = mulberry(0x700d5);
  const rr = (a, b) => a + (b - a) * R();
  const sq = (v) => v * v;
  function sfx(name, a, b, c) { const o = ctx.audio, f = o && o[name]; return typeof f === "function" ? f.call(o, a, b, c) : undefined; }
  function vfx(name, a, b, c, d, e, f) { const o = ctx.fx, fn = o && o[name]; return typeof fn === "function" ? fn.call(o, a, b, c, d, e, f) : undefined; }
  const U = { uTime: { value: 0 }, uGlow: { value: 1 }, uGlowCol: { value: new THREE.Color(0x9fd0ff) }, uCool: { value: 0 }, uWind: { value: 1 } };

  // ------------------------------------------------------------------------------------------ layout
  const MINX = -42, MAXX = 42, MINZ = -4, MAXZ = 142;
  const pathX = (z) => 6 * Math.sin(z * 0.04) + 3 * Math.sin(z * 0.11 + 1);
  const DEN = { x: pathX(120), z: 120, r: 13 };
  const TREE_DEAD = { x: DEN.x + 1.5, z: DEN.z + 7 };
  const STREAM = (x) => 62 + 4 * Math.sin(x * 0.08);   // the stream runs east-west across the path at z ~ 62
  function rawH(x, z) {
    let h = 1.2 * fbm2(x * 0.03, z * 0.03, 4) + 0.35 * fbm2(x * 0.12 + 5, z * 0.12, 2);
    const dp = Math.abs(x - pathX(z));
    h += Math.max(0, Math.abs(x) - 26) * 0.18;                                  // the valley walls (out of reach)
    h = lerp(h, 0.2 * fbm2(x * 0.05, z * 0.05, 2), (1 - sstep(1.6, 4, dp)) * 0.6); // the trail is worn flatter
    const dd = Math.hypot(x - DEN.x, z - DEN.z);
    if (dd < DEN.r + 4) h = lerp(h, 0.1, 1 - sstep(DEN.r - 2, DEN.r + 4, dd));
    const ds = Math.abs(z - STREAM(x));
    if (ds < 3) h -= (1 - sstep(0.8, 3, ds)) * 0.9;
    return h;
  }
  const TG = heightGrid(THREE, {
    x0: MINX - 6, z0: MINZ - 6, nx: 66, nz: 108, pitch: 1.45, h: rawH,
    c: (x, z, y, s) => {
      const n = fbm2(x * 0.2, z * 0.2, 3), dp = Math.abs(x - pathX(z));
      const c = new THREE.Color(0x1d2a1a).lerp(new THREE.Color(0x2e3a22), 0.5 + 0.5 * n);              // moss and needles
      c.lerp(new THREE.Color(0x3a3024), sstep(0.2, 0.7, fbm2(x * 0.07 + 3, z * 0.07, 2)) * 0.6);       // bare earth
      if (dp < 2.4) c.lerp(new THREE.Color(0x4a3e30), 0.6 * (1 - dp / 2.4));                           // the trail
      const ds = Math.abs(z - STREAM(x));
      if (ds < 2.2) c.lerp(new THREE.Color(0x2a2a26), 0.7);
      const dd = Math.hypot(x - DEN.x, z - DEN.z);
      if (dd < DEN.r) c.lerp(new THREE.Color(0x3b342a), 0.5 * (1 - dd / DEN.r));                         // trampled den floor
      return { hex: c.getHex(), glow: 0 };
    },
  });
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const ground = new THREE.Mesh(TG.geometry, groundMat); ground.receiveShadow = true; ground.name = "woodsGround";
  group.add(ground);
  const WATER_Y = -0.35;
  const water = (() => {
    const g = new THREE.PlaneGeometry(MAXX - MINX + 12, 6, 60, 4).rotateX(-Math.PI / 2);
    const P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i); P.setZ(i, P.getZ(i) + STREAM(x)); P.setY(i, WATER_Y); }
    const m = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMoon: { value: 1 } }]), fog: true, transparent: true,
      vertexShader: "#include <common>\n#include <fog_pars_vertex>\nvarying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}",
      fragmentShader: "#include <common>\n#include <fog_pars_fragment>\nuniform float uTime, uMoon; varying vec3 vW;\n" + GLSL_NOISE + "\nvoid main(){ float n = k3f(vec2(vW.x * 0.6 - uTime * 0.6, vW.z * 1.4)); float sp = smoothstep(0.62, 0.8, n) * uMoon; vec3 c = mix(vec3(0.02, 0.035, 0.05), vec3(0.06, 0.09, 0.13), n) + vec3(0.55, 0.65, 0.8) * sp * 0.5; gl_FragColor = vec4(c, 0.88);\n#include <colorspace_fragment>\n#include <fog_fragment>\n}",
    });
    m.uniforms.uTime = U.uTime;
    const mesh = new THREE.Mesh(g, m); mesh.name = "stream"; return mesh;
  })();
  group.add(water);
  // the log bridge over the stream
  const logGeo = new THREE.CylinderGeometry(0.42, 0.48, 7, 10, 1).rotateZ(Math.PI / 2);
  const bridgeLog = new THREE.Mesh(logGeo, new THREE.MeshLambertMaterial({ color: 0x3a2c20 }));
  { const z = STREAM(pathX(62)), x = pathX(z); bridgeLog.position.set(x, 0.05, z); bridgeLog.rotation.y = Math.PI / 2 + 0.1; bridgeLog.castShadow = true; group.add(bridgeLog); }

  // ------------------------------------------------------------------------------------------ sky, moon, fireflies
  const MOON_DIR = [0.35, 0.55, 0.75];
  const sky = skyDome(THREE, { top: 0x060a16, horizon: 0x1a2438, bottom: 0x0a0e16, glowCol: 0x3a4a70, glowDir: MOON_DIR, glowK: 0.5, moonDir: MOON_DIR, moon: 1.2, stars: 1, uTime: U.uTime });
  group.add(sky.mesh);
  const flies = particleCloud(THREE, U, { kind: 2, count: 70, box: 36, color: 0xd8ff70, size: 0.09, name: "fireflies", seed: 4, y0: -1 });
  const motes = particleCloud(THREE, U, { kind: 3, count: 260, box: 22, color: 0x8aa0c0, size: 0.03, name: "motes", seed: 5 });
  flies.u.uScale.value = 500;
  group.add(flies.points, motes.points);

  // ------------------------------------------------------------------------------------------ trees (3 LODs)
  const woodMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  woodMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uWind = U.uWind;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nuniform float uTime, uWind;")
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        { float h = max(transformed.y - 3.0, 0.0); vec4 ip = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float s = sin(uTime * 0.7 + ip.x * 0.3 + ip.z * 0.2) * 0.012 * h * uWind; transformed.x += s; transformed.z += s * 0.6; }`);
  };
  woodMat.customProgramCacheKey = () => "woodsTree";
  function pine(detail) {
    const mg = createMerger(THREE, []);
    const tall = 14;
    mg.add(new THREE.CylinderGeometry(0.16, 0.42, tall, detail > 1 ? 7 : 5, 1), mat4(THREE, 0, tall / 2, 0), 0x2c211a);
    const layers = detail > 1 ? 6 : detail > 0 ? 4 : 2;
    for (let i = 0; i < layers; i++) {
      const k = i / (layers - 1), r = lerp(3.2, 0.9, k), y = lerp(4.5, tall - 0.6, k), h = lerp(4.6, 2.6, k);
      const g = new THREE.ConeGeometry(r, h, detail > 1 ? 9 : detail > 0 ? 7 : 5, detail > 1 ? 2 : 1, true);
      if (detail > 1) lumpify(THREE, g, 0.25, 0.9, i + 3);
      mg.add(g, mat4(THREE, 0, y, 0, 0, i * 0.7, 0), (x, yy) => new THREE.Color(0x14241a).lerp(new THREE.Color(0x26402a), clamp((yy - y + h / 2) / h, 0, 1) * 0.8).getHex());
    }
    return mg.build();
  }
  function oak(detail) {
    const mg = createMerger(THREE, []);
    // a twisted trunk: a few leaning segments, then gnarled branches and clumps of dark leaves
    const segs = detail > 1 ? 5 : 3;
    let x = 0, z = 0, y = 0, r = 0.75;
    for (let i = 0; i < segs; i++) {
      const len = 1.8, ax = Math.sin(i * 1.7) * 0.35, az = Math.cos(i * 1.3) * 0.3;
      mg.add(new THREE.CylinderGeometry(r * 0.8, r, len, detail > 1 ? 8 : 5, 1), mat4(THREE, x + Math.sin(az) * len / 2, y + len / 2, z + Math.sin(ax) * len / 2, ax, 0, az), 0x2a2018);
      x += Math.sin(az) * len; z += Math.sin(ax) * len; y += len * 0.95; r *= 0.82;
    }
    const clumps = detail > 1 ? 7 : detail > 0 ? 4 : 2;
    for (let i = 0; i < clumps; i++) {
      const a = (i / clumps) * TAU, d = rr(1.4, 3), cy = y + rr(-0.5, 1.8);
      if (detail > 0) mg.add(new THREE.CylinderGeometry(0.12, 0.22, d + 0.6, 5), mat4(THREE, x + Math.sin(a) * d / 2, cy - 0.4, z + Math.cos(a) * d / 2, Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1), 0x2a2018);
      const g = lumpify(THREE, new THREE.IcosahedronGeometry(rr(1.5, 2.2), detail > 1 ? 1 : 0), 0.35, 0.8, i);
      mg.add(g, mat4(THREE, x + Math.sin(a) * d, cy + 0.4, z + Math.cos(a) * d, 0, 0, 0, 1, 0.75, 1), 0x1a2a18);
    }
    return mg.build();
  }
  const TYPES = [{ geo: [pine(2), pine(1), pine(0)], n: 0, list: [] }, { geo: [oak(2), oak(1), oak(0)], n: 0, list: [] }];
  // place trees: dense everywhere except the trail and the den, thinner by the stream
  {
    for (let i = 0; i < 2600 && (TYPES[0].list.length + TYPES[1].list.length) < 520; i++) {
      const x = rr(MINX - 4, MAXX + 4), z = rr(MINZ - 4, MAXZ + 4);
      const dp = Math.abs(x - pathX(z)), dd = Math.hypot(x - DEN.x, z - DEN.z), ds = Math.abs(z - STREAM(x));
      if (dp < 4.2 || dd < DEN.r + 1 || ds < 2.6) continue;
      if (noise3(x * 0.08, 1, z * 0.08) < -0.35 && dp < 12) continue;   // small glades
      let ok = true;
      for (const T of TYPES) for (const t of T.list) if (sq(t.x - x) + sq(t.z - z) < sq(t.s * 2.2)) { ok = false; break; }
      if (!ok) continue;
      const ty = R() < 0.72 ? 0 : 1, s = ty === 0 ? rr(0.8, 1.35) : rr(0.8, 1.2);
      TYPES[ty].list.push({ x, z, y: rawH(x, z) - 0.2, s, yaw: rr(0, TAU) });
    }
  }
  const lodMeshes = [];
  for (const T of TYPES) {
    T.meshes = T.geo.map((g, l) => {
      const m = new THREE.InstancedMesh(g, woodMat, T.list.length);
      m.name = "trees" + l; m.castShadow = l === 0; m.receiveShadow = l === 0; m.count = 0; m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(m); lodMeshes.push(m); return m;
    });
    T.mats = T.list.map((t) => new THREE.Matrix4().compose(new THREE.Vector3(t.x, t.y, t.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw), new THREE.Vector3(t.s, t.s, t.s)));
  }
  let lodX = 1e9, lodZ = 1e9;
  function relod(fx, fz) {
    lodX = fx; lodZ = fz;
    for (const T of TYPES) {
      const c = [0, 0, 0];
      for (let i = 0; i < T.list.length; i++) {
        const t = T.list[i], d2 = sq(t.x - fx) + sq(t.z - fz);
        const l = d2 < 22 * 22 ? 0 : d2 < 48 * 48 ? 1 : d2 < 95 * 95 ? 2 : -1;
        if (l < 0) continue;
        T.meshes[l].setMatrixAt(c[l]++, T.mats[i]);
      }
      for (let l = 0; l < 3; l++) { T.meshes[l].count = c[l]; T.meshes[l].instanceMatrix.needsUpdate = true; }
    }
  }
  const colliders = [];
  for (const T of TYPES) for (const t of T.list) if (Math.abs(t.x - pathX(t.z)) < 14) colliders.push({ x: t.x, z: t.z, r: 0.5 * t.s, on: true });
  // rocks and bushes (one instanced mesh each)
  const rockGeo = lumpify(THREE, new THREE.DodecahedronGeometry(1, 1), 0.25, 0.9, 7);
  { const P = rockGeo.attributes.position, c = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const up = P.getY(i) > 0.3 ? 1 : 0; const n = noise3(P.getX(i) * 3, P.getY(i) * 3, P.getZ(i) * 3); const col = new THREE.Color(0x3a3d3a).lerp(new THREE.Color(0x2c4a26), up * (0.5 + 0.5 * n)); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; } rockGeo.setAttribute("color", new THREE.BufferAttribute(c, 3)); }
  const rocks = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), 60);
  rocks.name = "woodsRocks"; rocks.castShadow = true; rocks.receiveShadow = true;
  const bushGeo = lumpify(THREE, new THREE.IcosahedronGeometry(1, 1), 0.3, 1.1, 9);
  const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshLambertMaterial({ color: 0x1c2e1a, flatShading: true }), 90);
  bushes.name = "woodsBushes";
  {
    const tm = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    let nr = 0, nb = 0;
    for (let i = 0; i < 900 && (nr < 60 || nb < 90); i++) {
      const z = rr(MINZ, MAXZ), side = R() < 0.5 ? -1 : 1, x = pathX(z) + side * rr(3.2, 20);
      if (Math.abs(z - STREAM(x)) < 2) continue;
      if (Math.hypot(x - DEN.x, z - DEN.z) < 4) continue;
      const y = rawH(x, z);
      if (nr < 60 && R() < 0.45) { const s = rr(0.3, 1.6); tm.compose(new THREE.Vector3(x, y + s * 0.15, z), q.setFromEuler(e.set(rr(0, 3), rr(0, 6), rr(0, 3))), new THREE.Vector3(s, s * rr(0.5, 0.9), s)); rocks.setMatrixAt(nr++, tm); if (s > 0.8 && Math.abs(x - pathX(z)) < 8) colliders.push({ x, z, r: s * 0.8, on: true }); }
      else if (nb < 90) { const s = rr(0.4, 1.0); tm.compose(new THREE.Vector3(x, y + s * 0.3, z), q.identity(), new THREE.Vector3(s * 1.3, s * 0.8, s * 1.3)); bushes.setMatrixAt(nb++, tm); }
    }
    rocks.count = nr; bushes.count = nb;
  }
  group.add(rocks, bushes);
  // the den: a ring of rocks, bones (old sticks), and the dead tree with Pip's vines
  const deadMat = new THREE.MeshLambertMaterial({ color: 0x3c342e });
  const deadTree = (() => {
    const mg = createMerger(THREE, []);
    mg.add(lumpify(THREE, new THREE.CylinderGeometry(0.55, 0.9, 7, 9, 4), 0.12, 1.2, 3), mat4(THREE, 0, 3.5, 0, 0.05, 0, -0.06));
    const br = [[1.6, 4.8, 0.9, 0.9], [-1.4, 5.6, -0.7, -1.1], [0.5, 6.4, 1.6, 0.4], [-0.6, 3.6, -0.4, -1.4]];
    for (const [bx, by, bz, a] of br) mg.add(new THREE.CylinderGeometry(0.08, 0.22, 3.2, 6), mat4(THREE, bx * 0.55, by, bz * 0.55, bz * 0.6, 0, -a));
    const m = new THREE.Mesh(mg.build(), deadMat); m.position.set(TREE_DEAD.x, rawH(TREE_DEAD.x, TREE_DEAD.z) - 0.2, TREE_DEAD.z); m.castShadow = true; m.name = "deadTree"; return m;
  })();
  group.add(deadTree);
  colliders.push({ x: TREE_DEAD.x, z: TREE_DEAD.z, r: 0.9, on: true });
  const vineMat = new THREE.MeshLambertMaterial({ color: 0x2e5a22 });
  const vineMeshes = [0, 1, 2].map((i) => {
    const y = 0.55 + i * 0.42;
    const pts = [];
    for (let k = 0; k <= 16; k++) { const a = (k / 16) * TAU * 1.1 + i; pts.push(new THREE.Vector3(Math.sin(a) * (0.95 + 0.25 * Math.sin(a * 2)), y + k * 0.012 + Math.sin(a * 3) * 0.05, Math.cos(a) * (0.95 + 0.25 * Math.sin(a * 2)) - 0.45)); }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.06, 5, false), vineMat);
    m.position.copy(deadTree.position); m.name = "vine" + i; group.add(m); return m;
  });
  const vines = {
    cut(i) { const m = vineMeshes[i]; if (!m || !m.visible) return false; m.visible = false; vfx("leaves", TREE_DEAD.x, m.position.y + 0.6 + i * 0.4, TREE_DEAD.z - 0.8, 10, 0x3e6a2a); sfx("vines"); return true; },
    get left() { return vineMeshes.filter((m) => m.visible).length; },
    isCut(i) { return !vineMeshes[i].visible; },
    reset() { for (const m of vineMeshes) m.visible = true; },
    pos(i, out) { out = out || {}; out.x = TREE_DEAD.x; out.y = vineMeshes[i].position.y + 0.55 + i * 0.42; out.z = TREE_DEAD.z - 1.1; return out; },
  };
  // pawprints along the trail (faint moonlit glow, revealed progressively)
  const PRINTS = 90;
  const printTex = (() => {
    const cv = document.createElement("canvas"); cv.width = cv.height = 64; const g = cv.getContext("2d");
    g.fillStyle = "#fff"; g.beginPath(); g.ellipse(32, 40, 13, 11, 0, 0, TAU); g.fill();
    for (const [x, y] of [[18, 20], [28, 13], [38, 13], [48, 20]]) { g.beginPath(); g.ellipse(x, y, 5, 6, 0, 0, TAU); g.fill(); }
    const t = new THREE.CanvasTexture(cv); return t;
  })();
  const prints = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.22).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: printTex, color: 0x9cc8ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }), PRINTS);
  prints.name = "pawprints"; prints.frustumCulled = false;
  const printPts = [];
  {
    const tm = new THREE.Matrix4(), q = new THREE.Quaternion();
    for (let i = 0; i < PRINTS; i++) {
      const z = 6 + i * 1.25, x = pathX(z) + (i % 2 ? 0.16 : -0.16) + Math.sin(i * 0.7) * 0.4;
      const yaw = Math.atan2(pathX(z + 1) - pathX(z - 1), 2);
      printPts.push({ x, z });
      tm.compose(new THREE.Vector3(x, rawH(x, z) + 0.03, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
      prints.setMatrixAt(i, tm);
    }
  }
  group.add(prints);
  // eyes in the dark: pairs of glowing dots (6 pairs), shown for scares
  const eyes = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd24a }), 12);
  eyes.name = "darkEyes"; eyes.frustumCulled = false; eyes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const eyeState = [0, 1, 2, 3, 4, 5].map(() => ({ on: false, x: 0, y: 0, z: 0, yaw: 0, t: 0, dur: 0 }));
  const zeroM = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < 12; i++) eyes.setMatrixAt(i, zeroM);
  group.add(eyes);

  // ------------------------------------------------------------------------------------------ wolves
  const MAXW = 12;
  const wolfGeo = (() => {
    const mg = createMerger(THREE, ["aLimb"]);
    const fur = (y) => new THREE.Color(0xd8d8d8).lerp(new THREE.Color(0xffffff), clamp((y - 0.5) / 0.4, 0, 1) * 0.2).getHex();
    // body: chest + barrel + hips
    mg.add(lumpify(THREE, new THREE.SphereGeometry(0.32, 12, 8), 0.04, 6, 1), mat4(THREE, 0, 0.72, 0.36, 0, 0, 0, 1, 1.12, 1.15), fur, { aLimb: 0 });
    mg.add(new THREE.SphereGeometry(0.27, 12, 8), mat4(THREE, 0, 0.7, -0.05, 0, 0, 0, 0.95, 0.95, 1.5), fur, { aLimb: 0 });
    mg.add(new THREE.SphereGeometry(0.26, 10, 8), mat4(THREE, 0, 0.71, -0.42, 0, 0, 0, 1, 1, 1.05), fur, { aLimb: 0 });
    mg.add(new THREE.ConeGeometry(0.2, 0.35, 8), mat4(THREE, 0, 0.98, 0.32, -0.4, 0, 0), 0xb8b8b8, { aLimb: 0 });     // the scruff
    // legs (pivot at the shoulder / hip; the shader swings them)
    const LEG = [[0.15, 0.36, 1], [-0.15, 0.36, 2], [0.15, -0.44, 3], [-0.15, -0.44, 4]];
    for (const [x, z, id] of LEG) {
      mg.add(new THREE.CylinderGeometry(0.075, 0.055, 0.42, 7), mat4(THREE, x, 0.5, z), fur, { aLimb: id });
      mg.add(new THREE.CylinderGeometry(0.05, 0.04, 0.32, 6), mat4(THREE, x, 0.17, z + (id > 2 ? -0.04 : 0.02)), 0xc8c8c8, { aLimb: id });
      mg.add(new THREE.SphereGeometry(0.06, 6, 4), mat4(THREE, x, 0.03, z + 0.04, 0, 0, 0, 1, 0.6, 1.4), 0x9a9a9a, { aLimb: id });
    }
    // neck + head (pivot at the neck)
    mg.add(new THREE.CylinderGeometry(0.15, 0.2, 0.36, 8), mat4(THREE, 0, 0.9, 0.58, 0.9, 0, 0), fur, { aLimb: 5 });
    mg.add(new THREE.SphereGeometry(0.17, 10, 8), mat4(THREE, 0, 1.0, 0.74, 0, 0, 0, 1, 0.92, 1.05), fur, { aLimb: 5 });
    mg.add(new THREE.ConeGeometry(0.095, 0.3, 8), mat4(THREE, 0, 0.95, 0.96, Math.PI / 2 + 0.12, 0, 0), 0xc4c4c4, { aLimb: 5 });    // the muzzle
    mg.add(new THREE.SphereGeometry(0.035, 6, 4), mat4(THREE, 0, 0.965, 1.1), 0x1a1a1a, { aLimb: 5 });                         // nose (dark)
    for (const s of [1, -1]) {
      mg.add(new THREE.ConeGeometry(0.055, 0.17, 5), mat4(THREE, s * 0.09, 1.16, 0.68, -0.15, 0, -s * 0.25), fur, { aLimb: 5 });
      mg.add(new THREE.SphereGeometry(0.026, 6, 4), mat4(THREE, s * 0.072, 1.04, 0.86), 0xffcc33, { aLimb: 7 });              // eyes (glow)
    }
    // tail
    mg.add(new THREE.ConeGeometry(0.09, 0.62, 7), mat4(THREE, 0, 0.66, -0.78, -1.9, 0, 0), fur, { aLimb: 6 });
    return mg.build();
  })();
  const wolfMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const iAnim = new THREE.InstancedBufferAttribute(new Float32Array(MAXW * 4), 4); iAnim.setUsage(THREE.DynamicDrawUsage);
  const iPose = new THREE.InstancedBufferAttribute(new Float32Array(MAXW * 4), 4); iPose.setUsage(THREE.DynamicDrawUsage);
  wolfGeo.setAttribute("iAnim", iAnim); wolfGeo.setAttribute("iPose", iPose);
  wolfMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace("#include <common>", `#include <common>
      attribute float aLimb; attribute vec4 iAnim; attribute vec4 iPose; varying float vEye;
      mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
        { // iAnim: x gait phase, y stride (0 idle .. 1 run), z crouch 0..1, w breathing phase
          // iPose: x head pitch, y tail wag, z cower 0..1, w jaw/howl
          float ph = iAnim.x, st = iAnim.y, cr = iAnim.z;
          int L = int(aLimb + 0.5);
          vEye = L == 7 ? 1.0 : 0.0;
          if (L >= 1 && L <= 4) {
            float off = (L == 1 || L == 4) ? 0.0 : 3.14159;          // diagonal pairs (trot / gallop-ish)
            float a = sin(ph + off) * 0.75 * st;
            vec3 piv = vec3(0.0, 0.72, L <= 2 ? 0.36 : -0.44);
            vec3 p = transformed - piv; p.yz = rot2(a) * p.yz; transformed = p + piv;
            transformed.y += max(0.0, -sin(ph + off)) * 0.06 * st;
            transformed.y -= cr * 0.18 * (1.0 - clamp(transformed.y / 0.7, 0.0, 1.0)) * -1.0;
          }
          if (L == 5 || L == 7) {
            vec3 piv = vec3(0.0, 0.88, 0.5);
            vec3 p = transformed - piv; p.yz = rot2(iPose.x + cr * 0.35) * p.yz; transformed = p + piv;
          }
          if (L == 6) {
            vec3 piv = vec3(0.0, 0.72, -0.6);
            vec3 p = transformed - piv; p.xz = rot2(iPose.y) * p.xz; p.yz = rot2(-iPose.z * 0.9 + st * 0.4) * p.yz; transformed = p + piv;
          }
          // crouch: the body sinks low, front first; cower: everything pressed down
          float sink = cr * 0.22 + iPose.z * 0.25;
          transformed.y -= sink * clamp(transformed.y / 0.6, 0.0, 1.0);
          // breathing + the gallop rocking
          transformed.y += sin(iAnim.w) * 0.008 + sin(ph * 2.0) * 0.03 * st;
        }`);
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vEye;")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.8, 0.25) * vEye * 1.4;");
  };
  wolfMat.customProgramCacheKey = () => "woodsWolf";
  const wolfMesh = new THREE.InstancedMesh(wolfGeo, wolfMat, MAXW);
  wolfMesh.name = "wolves"; wolfMesh.castShadow = true; wolfMesh.frustumCulled = false; wolfMesh.count = MAXW;
  wolfMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const COATS = [0x8a8a88, 0x6a6058, 0x4a4542, 0x7a6a58, 0x9a948a, 0x2e2a28];
  const tcol = new THREE.Color();
  for (let i = 0; i < MAXW; i++) { wolfMesh.setMatrixAt(i, zeroM); wolfMesh.setColorAt(i, tcol.set(COATS[i % COATS.length])); }
  group.add(wolfMesh);

  const W = [];
  for (let i = 0; i < MAXW; i++) W.push({ i, alive: false, active: false, x: 0, y: 0, z: 0, yaw: 0, vx: 0, vz: 0, hp: 6, max: 6, alpha: false, scale: 1, state: "off", t: 0, ph: R() * 6, stride: 0, crouch: 0, cower: 0, head: 0, wag: 0, jaw: 0, slot: 0, fleeT: 0, lunge: null, zone: -1, howled: false, targetable: true });
  let token = null, tokenT = 0;
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const wolves = {
    list: W, onKO: null, onHowl: null,
    get alive() { let n = 0; for (const w of W) if (w.alive) n++; return n; },
    get mesh() { return wolfMesh; },
    // spawn n wolves around `at` ({ x, z } or an array of points); returns the first wolf
    spawn(n, at, o) {
      o = o || {};
      let first = null;
      for (let k = 0; k < n; k++) {
        const w = W.find((q) => !q.active);
        if (!w) break;
        const p = Array.isArray(at) ? at[k % at.length] : at || { x: 0, z: 0 };
        const a = (k / Math.max(1, n)) * TAU + rr(-0.3, 0.3), d = Array.isArray(at) ? 0 : rr(1.5, 4);
        w.active = w.alive = true; w.targetable = true;
        w.x = p.x + Math.sin(a) * d; w.z = p.z + Math.cos(a) * d; w.y = TG.heightAt(w.x, w.z);
        w.alpha = !!o.alpha && k === 0; w.scale = w.alpha ? 1.32 : rr(0.92, 1.06);
        w.max = w.hp = w.alpha ? 12 : 6; w.state = o.passive ? "hold" : "approach"; w.t = rr(0, 0.5); w.howled = false; w.fleeT = 0; w.cower = 0; w.crouch = 0;
        w.slot = k; w.yaw = Math.atan2((ctx.player ? ctx.player.x : 0) - w.x, (ctx.player ? ctx.player.z : 0) - w.z);
        wolfMesh.setColorAt(w.i, tcol.set(w.alpha ? 0x2a2624 : COATS[(w.i * 7 + k) % COATS.length]));
        wolfMesh.instanceColor.needsUpdate = true;
        if (!first) first = w;
      }
      return first;
    },
    release() { for (const w of W) if (w.alive && w.state === "hold") { w.state = "approach"; w.t = rr(0, 0.6); } },
    reset() { for (const w of W) { w.active = w.alive = false; w.state = "off"; if (w.zone >= 0) vfx("dangerCancel", w.zone); w.zone = -1; wolfMesh.setMatrixAt(w.i, zeroM); } token = null; wolfMesh.instanceMatrix.needsUpdate = true; },
    nearest(x, z, max) { let b = null, bd = (max || 3) ** 2; for (const w of W) { if (!w.alive) continue; const d = sq(w.x - x) + sq(w.z - z); if (d < bd) { bd = d; b = w; } } return b; },
    // a Sting is 3 damage, a Tail Slap 2 (2 Stings / 3 Slaps for a wolf, 4 / 6 for the alpha)
    hit(w, kind, power) {
      if (typeof w === "number") w = W[w];
      if (!w || !w.alive || w.state === "ko") return false;
      const dmg = (power === undefined ? 1 : power) * (kind === "sting" ? 3 : kind === "slap" ? 2 : kind === "zap" ? 3 : 2);
      w.hp -= dmg;
      const p = ctx.player, dx = w.x - (p ? p.x : w.x), dz = w.z - (p ? p.z : w.z), l = Math.hypot(dx, dz) || 1;
      w.vx = (dx / l) * 6; w.vz = (dz / l) * 6;
      vfx("hitBurst", w.x, w.y + 0.7, w.z); sfx("wolfYelp");
      if (w === token) { token = null; if (w.zone >= 0) vfx("dangerCancel", w.zone); w.zone = -1; }
      if (w.hp <= 0) ko(w); else { w.state = "hurt"; w.t = 0.45; }
      return true;
    },
    // a scream scares every wolf within r (they flee for 3 s; the alpha only flinches)
    scream(x, z, r) {
      r = r || 8; let n = 0;
      for (const w of W) {
        if (!w.alive || w.state === "ko") continue;
        if (sq(w.x - x) + sq(w.z - z) > r * r) continue;
        n++;
        if (w === token) { token = null; if (w.zone >= 0) vfx("dangerCancel", w.zone); w.zone = -1; }
        if (w.alpha) { w.state = "hurt"; w.t = 0.8; w.hp -= 1; } else { w.state = "flee"; w.fleeT = 3; w.t = 3; w.hp -= 1.5; if (w.hp <= 0) ko(w); }
        sfx("wolfYelp");
      }
      return n;
    },
    howl(w) { w = w || W.find((q) => q.alive && q.alpha); if (!w) return; w.state = "howl"; w.t = 2.2; sfx("wolfHowl", w.x, w.z, 1); },
    update: updateWolves,
  };
  function ko(w) {
    w.state = "ko"; w.t = 0; w.alive = false; w.targetable = false; w.crouch = 0;
    if (w.zone >= 0) vfx("dangerCancel", w.zone); w.zone = -1;
    if (w === token) token = null;
    sfx("wolfYelp");
    if (wolves.onKO) wolves.onKO(w);
  }
  function hurtPlayer(w) { if (!ctx.health || !ctx.health.on) return; if (ctx.health.damage(1, { x: w.x, z: w.z, kind: "melee", knock: 4 })) sfx("wolfGrowl"); }
  function steer(w, tx, tz, speed, dt) {
    const dx = tx - w.x, dz = tz - w.z, l = Math.hypot(dx, dz);
    if (l > 0.05) { const want = Math.atan2(dx, dz); w.yaw += angDiff(want, w.yaw) * Math.min(1, dt * 7); }
    const sp = Math.min(speed, l / Math.max(dt, 1e-3));
    w.vx += (Math.sin(w.yaw) * sp - w.vx) * Math.min(1, dt * 6);
    w.vz += (Math.cos(w.yaw) * sp - w.vz) * Math.min(1, dt * 6);
  }
  let clock = 0;
  function updateWolves(dt) {
    const p = ctx.player;
    if (!p) return;
    if (token && !token.alive) token = null;
    tokenT -= dt;
    let aliveN = 0;
    for (const w of W) if (w.alive) aliveN++;
    let any = false;
    for (const w of W) {
      if (!w.active) continue;
      any = true;
      w.t -= dt;
      const dx = p.x - w.x, dz = p.z - w.z, d = Math.hypot(dx, dz) || 0.01;
      let speed = 0;
      w.head += ((w.state === "howl" ? -0.9 : w.state === "circle" ? 0.15 : 0) - w.head) * Math.min(1, dt * 5);
      switch (w.state) {
        case "hold": w.yaw += angDiff(Math.atan2(dx, dz), w.yaw) * Math.min(1, dt * 3); w.vx *= 0.8; w.vz *= 0.8; break;
        case "approach":
          if (w.t > 0) break;
          steer(w, p.x, p.z, 4.2, dt); speed = 4.2;
          if (d < 8) { w.state = "circle"; w.t = rr(1.2, 2.6); if (R() < 0.4) sfx("wolfGrowl"); }
          break;
        case "circle": {
          // orbit at 5.5-7 m, slots spread round the player; flankers drift behind it
          const ring = 6 + (w.slot % 2) * 1.2, behind = p.yaw + Math.PI;
          const slotA = behind + (w.slot - (aliveN - 1) / 2) * (TAU / Math.max(3, aliveN + 1)) + Math.sin(clock * 0.4 + w.i) * 0.4;
          const tx = p.x + Math.sin(slotA) * ring, tz = p.z + Math.cos(slotA) * ring;
          steer(w, tx, tz, 2.8, dt); speed = Math.hypot(w.vx, w.vz);
          if (speed < 0.5) w.yaw += angDiff(Math.atan2(dx, dz), w.yaw) * Math.min(1, dt * 4);
          if (w.t <= 0 && !token && tokenT <= 0 && d < 9) {
            if (w.alpha && !w.howled && w.hp < w.max * 0.75) { w.howled = true; wolves.howl(w); break; }
            token = w; w.state = "crouch"; w.t = 0.7 * (w.alpha ? 1.3 : 1); w.crouch = 0;
            const yaw = Math.atan2(dx, dz), len = w.alpha ? 11 : 6;
            w.lunge = { yaw, len, x: w.x, z: w.z };
            w.zone = vfx("dangerZone", { shape: "line", x: w.x, z: w.z, yaw, len, width: w.alpha ? 1.8 : 1.3, seconds: w.t, colorHex: 0xff3a2a });
            sfx(w.alpha ? "wolfGrowl" : "wolfBark");
          } else if (w.t <= 0) w.t = rr(0.6, 1.6);
          break;
        }
        case "crouch":
          w.crouch = Math.min(1, w.crouch + dt * 3); w.vx *= 0.7; w.vz *= 0.7;
          w.yaw += angDiff(w.lunge.yaw, w.yaw) * Math.min(1, dt * 8);
          if (w.t <= 0) { w.state = "lunge"; w.t = w.lunge.len / (w.alpha ? 13 : 11); w.crouch = 0; w.hitDone = false; w.zone = -1; sfx("wolfBark"); }
          break;
        case "lunge": {
          const sp = w.alpha ? 13 : 11;
          w.vx = Math.sin(w.lunge.yaw) * sp; w.vz = Math.cos(w.lunge.yaw) * sp; speed = sp;
          if (!w.hitDone && d < 0.95 * w.scale + 0.3 && p.y - TG.heightAt(p.x, p.z) < 0.6) { w.hitDone = true; hurtPlayer(w); }
          if (w.t <= 0) { w.state = "recover"; w.t = 0.6; if (token === w) { token = null; tokenT = 0.5; } }
          break;
        }
        case "recover": w.vx *= 0.85; w.vz *= 0.85; speed = Math.hypot(w.vx, w.vz); if (w.t <= 0) { w.state = "circle"; w.t = rr(1, 2.4); } break;
        case "hurt": w.vx *= 0.88; w.vz *= 0.88; w.cower = 0.5; if (w.t <= 0) { w.cower = 0; w.state = "circle"; w.t = rr(0.8, 1.6); } break;
        case "howl": w.vx *= 0.8; w.vz *= 0.8; w.jaw = 1;
          if (w.t <= 0) { w.jaw = 0; w.state = "circle"; w.t = 1; const a = Math.atan2(-dx, -dz); wolves.spawn(2, { x: p.x + Math.sin(a) * 16, z: p.z + Math.cos(a) * 16 }); if (wolves.onHowl) wolves.onHowl(w); }
          break;
        case "flee": { const a = Math.atan2(-dx, -dz); steer(w, w.x + Math.sin(a) * 5, w.z + Math.cos(a) * 5, 6, dt); speed = 6; w.cower = 0.3; if (w.t <= 0) { w.cower = 0; w.state = "approach"; w.t = 0.3; } break; }
        case "ko": {
          // yelp, cower a moment, then slink off into the dark and vanish
          if (w.t > -1.0) { w.cower = 1; w.vx *= 0.8; w.vz *= 0.8; }
          else { w.cower = 0.4; const a = Math.atan2(-dx, -dz); steer(w, w.x + Math.sin(a) * 6, w.z + Math.cos(a) * 6, 5.5, dt); speed = 5.5; }
          if (w.t < -4.5) { w.active = false; w.state = "off"; wolfMesh.setMatrixAt(w.i, zeroM); }
          break;
        }
      }
      if (!w.active) continue;
      // separation from the other wolves and from the player
      for (const o of W) { if (o === w || !o.active) continue; const ex = w.x - o.x, ez = w.z - o.z, e2 = ex * ex + ez * ez; if (e2 < 1.4 && e2 > 1e-4) { const k = (1.2 - Math.sqrt(e2)) * 2; w.vx += ex * k; w.vz += ez * k; } }
      if (w.state !== "lunge" && d < 1.2) { w.vx -= (dx / d) * 3 * dt * 10; w.vz -= (dz / d) * 3 * dt * 10; }
      w.x += w.vx * dt; w.z += w.vz * dt;
      w.x = clamp(w.x, MINX, MAXX); w.z = clamp(w.z, MINZ, MAXZ);
      w.y = TG.heightAt(w.x, w.z);
      const sp = Math.hypot(w.vx, w.vz);
      w.stride += (clamp(sp / 6, 0, 1) - w.stride) * Math.min(1, dt * 6);
      w.ph += dt * (2 + sp * 2.1);
      w.wag = Math.sin(clock * (w.state === "circle" ? 2 : 6) + w.i) * (w.state === "ko" ? 0.1 : 0.25);
      tm.compose(tv.set(w.x, w.y, w.z), tq.setFromAxisAngle(UP, w.yaw), ts.set(w.scale, w.scale, w.scale));
      wolfMesh.setMatrixAt(w.i, tm);
      iAnim.setXYZW(w.i, w.ph, w.stride, w.crouch, clock * 2.4 + w.i);
      iPose.setXYZW(w.i, w.head, w.wag, w.cower, w.jaw);
    }
    if (any || dirtyW) { wolfMesh.instanceMatrix.needsUpdate = true; iAnim.needsUpdate = true; iPose.needsUpdate = true; dirtyW = any; }
  }
  let dirtyW = false;

  // ------------------------------------------------------------------------------------------ the world
  const pt = (x, z, yaw) => ({ x, y: rawH(x, z), z, yaw: yaw || 0 });
  const cam = (px, py, pz, lx, ly, lz) => ({ pos: { x: px, y: py, z: pz }, look: { x: lx, y: ly, z: lz } });
  const path = []; for (let z = 4; z <= 116; z += 8) path.push(pt(pathX(z), z, 0));
  const P = {
    enter: pt(pathX(2), 2, 0), path, ambush: [pt(pathX(44) + 2.5, 47), pt(pathX(44) - 3, 48.5), pt(pathX(44), 50)], ambushAt: pt(pathX(42), 42, 0),
    den: pt(DEN.x, DEN.z - 6, 0), denCenter: pt(DEN.x, DEN.z), pipTree: pt(TREE_DEAD.x, TREE_DEAD.z - 1.3, Math.PI),
    denWolves: [pt(DEN.x - 3, DEN.z + 3), pt(DEN.x + 3.5, DEN.z + 2), pt(DEN.x - 5, DEN.z - 1), pt(DEN.x + 5, DEN.z - 2), pt(DEN.x, DEN.z + 4)],
    exit: pt(pathX(1), 1, Math.PI), stream: pt(pathX(62), STREAM(pathX(62)), 0), trail: printPts,
    scares: [pt(pathX(22) + 9, 24), pt(pathX(78) - 10, 80)],
    camDen: cam(DEN.x - 6, 3.2, DEN.z - 12, DEN.x, 1.2, DEN.z + 4), camEnter: cam(pathX(-4) + 2, 2.4, -4, pathX(12), 1, 12),
  };
  const ENV_DARK = { background: 0x070b14, fog: [0x0b1220, 8, 40], hemi: [0x5a6a90, 0x10141a, 0.5], sun: [0x9ab0e0, 0.55], sunDir: MOON_DIR, far: 140, dark: true };
  const ENV_BRIGHT = { background: 0x0c1424, fog: [0x121c30, 10, 55], hemi: [0x7080a8, 0x161a22, 0.65], sun: [0xb8ccf0, 0.85], sunDir: MOON_DIR, far: 160, dark: true };
  const ENV = { background: 0, fog: [0, 0, 0], hemi: [0, 0, 0], sun: [0, 0], sunDir: MOON_DIR, far: 150, dark: true };
  function blendEnv(k) {
    const c = new THREE.Color(), a = new THREE.Color();
    const mix = (x, y) => c.set(x).lerp(a.set(y), k).getHex();
    ENV.background = mix(ENV_DARK.background, ENV_BRIGHT.background);
    ENV.fog = [mix(ENV_DARK.fog[0], ENV_BRIGHT.fog[0]), lerp(8, 10, k), lerp(40, 55, k)];
    ENV.hemi = [mix(ENV_DARK.hemi[0], ENV_BRIGHT.hemi[0]), mix(ENV_DARK.hemi[1], ENV_BRIGHT.hemi[1]), lerp(0.5, 0.65, k)];
    ENV.sun = [mix(ENV_DARK.sun[0], ENV_BRIGHT.sun[0]), lerp(0.55, 0.85, k)];
    return Object.assign({}, ENV);
  }
  let active = false, printsShown = PRINTS, lastT = -1;
  function heightAt(x, z) {
    const h = TG.heightAt(x, z);
    // the log over the stream
    const lx = bridgeLog.position.x, lz = bridgeLog.position.z;
    if (Math.abs(z - lz) < 3.4 && Math.abs(x - lx) < 0.45) return Math.max(h, 0.48);
    return h;
  }
  function waterAt(x, z) { return Math.abs(z - STREAM(x)) < 2.2 ? WATER_Y : -Infinity; }
  function surfaceAt(x, z) { if (waterAt(x, z) > -Infinity && heightAt(x, z) < WATER_Y) return "water"; return Math.abs(x - pathX(z)) < 2 ? "dirt" : "leaves"; }
  function confine(o, r) {
    r = r || 0;
    if (o.z < MINZ + 1 + r) o.z = MINZ + 1 + r; if (o.z > MAXZ - 1 - r) o.z = MAXZ - 1 - r;
    const px = pathX(o.z), lim = (Math.hypot(o.x - DEN.x, o.z - DEN.z) < DEN.r + 2 ? DEN.r + 2 : 13) - r;
    if (o.x < px - lim) o.x = px - lim; if (o.x > px + lim) o.x = px + lim;
  }
  let scareT = 0, owlT = 6;
  const world = {
    name: "woods", group, maxStep: 0.5, swim: false, env: blendEnv(0.3), P, colliders,
    heightAt, waterAt, surfaceAt, confine, pathX,
    camBounds: { minX: MINX - 4, maxX: MAXX + 4, minZ: MINZ - 4, maxZ: MAXZ + 4, maxY: 30 },
    wolves, vines, den: { x: DEN.x, z: DEN.z, r: DEN.r },
    setMoon(k, seconds) { const e = blendEnv(clamp(k, 0, 1)); world.env = e; sky.u.uMoon.value = 0.6 + clamp(k, 0, 1); if (active && ctx.setEnv) ctx.setEnv(e, seconds || 0); },
    // reveal the pawprints up to distance `z` along the trail (all with Infinity)
    setTrail(z) { let n = 0; for (let i = 0; i < PRINTS; i++) if (printPts[i].z <= z) n = i + 1; printsShown = n; prints.count = n; },
    // eyes in the dark at (x, z) for `seconds`, then they blink out
    eyesAt(x, z, seconds, n) {
      n = n || 1;
      for (let k = 0; k < n; k++) {
        const e = eyeState.find((q) => !q.on); if (!e) return;
        e.on = true; e.x = x + rr(-1.5, 1.5) * (k ? 1 : 0); e.z = z + rr(-1, 1) * (k ? 1 : 0); e.y = rawH(e.x, e.z) + 0.75 + rr(-0.1, 0.1);
        const p = ctx.player; e.yaw = p ? Math.atan2(p.x - e.x, p.z - e.z) : 0; e.t = 0; e.dur = seconds || 2.5;
      }
      sfx("wolfGrowl");
    },
    scare(i) { const s = P.scares[i | 0]; if (s) world.eyesAt(s.x, s.z, 2.2, 2); },
    update, reset() { wolves.reset(); vines.reset(); world.setTrail(Infinity); for (const e of eyeState) e.on = false; },
    onEnter() { active = true; relod(ctx.player ? ctx.player.x : 0, ctx.player ? ctx.player.z : 0); sfx("forestNight", 0.7); sfx("cricketNight", 0.5); },
    onLeave() { active = false; sfx("forestNight", 0); sfx("cricketNight", 0); },
    onFootstep(wx, wz, strength, foot, wet, pan) { const s = surfaceAt(wx, wz); sfx("step", s === "water" ? "water" : s, strength, pan); if (s === "leaves" && strength > 0.8 && foot === 0) vfx("leaves", wx, heightAt(wx, wz) + 0.1, wz, 2, 0x3a3020); },
    onJump(x, z, floorY) { vfx("footDust", x, floorY + 0.03, z, 0.4, 0x3a3428); },
    onLand(x, z, floorY, impact) { const s = surfaceAt(x, z); sfx("step", s === "water" ? "water" : s, 0.7 + impact * 0.5, 0); if (s === "water") vfx("splash", x, WATER_Y, z, 0.3 + impact * 0.4); },
    stats() { return { trees: TYPES[0].list.length + TYPES[1].list.length, wolves: wolves.alive, lod: lodMeshes.map((m) => m.count).join("/") }; },
  };
  function update(dt, time, fx, fz) {
    if (time !== undefined && time === lastT) return;
    lastT = time;
    clock += dt; U.uTime.value = clock;
    const camO = ctx.camera, p = ctx.player;
    const px = typeof fx === "number" ? fx : p ? p.x : 0, pz = typeof fz === "number" ? fz : p ? p.z : 0;
    if (camO) { sky.mesh.position.copy(camO.position); flies.follow(camO); motes.follow(camO); }
    if (sq(px - lodX) + sq(pz - lodZ) > 16) relod(px, pz);
    if (p && ctx.audio && ctx.audio.setEar) ctx.audio.setEar(p.x, p.z, ctx.cam ? ctx.cam.yaw : p.yaw);
    // eyes in the dark
    let eDirty = false;
    for (let i = 0; i < eyeState.length; i++) {
      const e = eyeState[i];
      if (!e.on) { continue; }
      e.t += dt; eDirty = true;
      const blink = (e.t % 1.7) > 1.6 ? 0 : 1, fade = e.t > e.dur ? 0 : 1;
      if (e.t > e.dur) e.on = false;
      for (let s = 0; s < 2; s++) {
        const side = s ? -1 : 1, ox = Math.cos(e.yaw) * 0.075 * side, oz = -Math.sin(e.yaw) * 0.075 * side;
        tm.compose(tv.set(e.x + ox, e.y, e.z + oz), tq.identity(), ts.set(1, blink * fade, 1));
        eyes.setMatrixAt(i * 2 + s, e.on ? tm : zeroM);
      }
    }
    if (eDirty) eyes.instanceMatrix.needsUpdate = true;
    updateWolves(dt);
    if (active) {
      owlT -= dt;
      if (owlT <= 0) { owlT = rr(9, 18); sfx("owl"); }
      scareT -= dt;
      if (R() < dt * 0.6) sfx("firefly");
    }
    void scareT;
  }
  world.setTrail(Infinity);
  relod(P.enter.x, P.enter.z);
  return world;
}
