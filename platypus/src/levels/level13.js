// level13.js - LEVEL 13, "THE FAR LANDS" (LEVELS3.md Part C, STORY3.md).
//   woods ambush den   alone into the dark woods, Pip's trail, the wolves, the den, the vines
//   sleep morning      home together; hide and seek in the morning
//   grove show puzzle  follow Pip past the red threads; the FAR LANDS PORTAL rock; the tribe; the four stones
//   enter              into the portal... nothing happens. (From here on, quietly, the illusion.)
//   babies robots      Pip's babies; the next day they are evil robots with superpowers
//   chase chase2 chase3 back   run! ...but where? the portal!
//   reveal close       knocked out again: only 3 seconds had passed. Close the portal.
//   build build2..6 cozy       the platypus house, together; everyone asleep somewhere safe. TO BE CONTINUED
// Structure follows level12.js: every beat starter begins from hardStop(). The modules this level needs that have
// no shared builder (the restricted grove + portal + puzzle, the babies, the house) are built in this file and
// shared through ctx.shared("farlands" | "babies" | "house").
import { createWoods } from "../woods.js";
import { createJungle } from "../jungle.js";
import { createTribe } from "../tribe.js";
import { createFriend } from "../friend.js";
import { skyDome, lumpify, createMerger, heightGrid, textTexture, mulberry, GLSL_NOISE } from "../kit3.js";

export const meta = { n: 13, title: "THE FAR LANDS" };

const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const STEPS = ["intro", "woods", "ambush", "den", "sleep", "morning", "grove", "show", "puzzle", "enter", "babies", "robots",
  "chase", "chase2", "chase3", "back", "reveal", "close", "build", "build2", "build3", "build4", "build5", "build6", "cozy", "done"];
const FACES = ["sun", "moon", "star", "wave"];
const ANSWER = [0, 1, 2, 3];                     // stone i (W, N, E, S) wants face: sun, moon, star, wave
const CD = { sting: 0.45, slap: 0.75 };

// =====================================================================================================
// THE ANCIENT GROVE (world "farlands"): a path over logs, the red-thread stones, giant old trees, the sunken
// court with four rune stones, the centre stone, the sundial, and THE ROCK: FAR LANDS PORTAL.
// =====================================================================================================
function createGrove(ctx) {
  const THREE = ctx.THREE;
  const R = mulberry(0x13f4);
  const rr = (a, b) => a + (b - a) * R();
  const group = new THREE.Group(); group.name = "farlands";
  const U = { uTime: { value: 0 } };
  const pathX = (z) => (z < 46 ? 2.4 * Math.sin(z * 0.08) : 2.4 * Math.sin(46 * 0.08) * (1 - clamp((z - 46) / 6, 0, 1)));
  const C = { x: 0, z: 60, r: 8.5 };
  const ROCK = { x: 0, z: 72.2 }, PORTAL = { x: 0, z: 70.4 };
  const LOGS = [10, 19];
  const THREAD_Z = 30;
  const SR = 6;
  const STONE_P = [{ x: -SR, z: C.z }, { x: 0, z: C.z + SR }, { x: SR, z: C.z }, { x: 0, z: C.z - SR }];
  const DIAL = { x: 5.6, z: 66.2 };
  function base(x, z) { return 0.22 * Math.sin(x * 0.21 + 1) * Math.cos(z * 0.17) + 0.12 * Math.sin(x * 0.5 + z * 0.31) + 0.05 * Math.sin(x * 1.3 - z * 0.9); }
  function heightAt(x, z) {
    let h = base(x, z);
    const dc = Math.hypot(x - C.x, z - C.z);
    if (dc < C.r + 1.6) {
      const k = smooth((C.r + 1.6 - dc) / 1.6);
      h = lerp(h, -0.5, k);
      if (dc < 0.95) h = -0.5 + 0.12;
      for (let i = 0; i < 4; i++) { const s = STONE_P[i]; if (Math.hypot(x - s.x, z - s.z) < 0.75) h = Math.max(h, -0.5 + 0.08); }
    }
    for (let i = 0; i < LOGS.length; i++) {
      const dz = z - LOGS[i];
      if (dz > -0.42 && dz < 0.42 && Math.abs(x - pathX(z)) < 3.2) h = Math.max(h, base(x, LOGS[i]) + 0.55 * Math.sqrt(1 - (dz / 0.42) * (dz / 0.42)));
    }
    return h;
  }
  function surfaceAt(x, z) {
    if (Math.hypot(x - C.x, z - C.z) < C.r) return "rock";
    for (let i = 0; i < LOGS.length; i++) if (Math.abs(z - LOGS[i]) < 0.42) return "wood";
    return Math.abs(x - pathX(z)) < 1.6 ? "dirt" : "leaves";
  }
  // ---- ground
  const grid = heightGrid(THREE, {
    x0: -34, z0: -10, nx: 69, nz: 101, pitch: 1,
    h: (x, z) => { let h = heightAt(x, z); for (const l of LOGS) if (Math.abs(z - l) < 0.6) h = base(x, z); return h - 0.01; },
    c: (x, z, y) => {
      const dc = Math.hypot(x - C.x, z - C.z);
      if (dc < C.r) { const ring = Math.abs(((dc * 1.25) % 1) - 0.5) < 0.06 || Math.abs(((Math.atan2(x, z - C.z) * 8 / PI) % 1)) < 0.05; return ring ? 0x4c4a44 : dc < 1 ? 0x8e8676 : 0x7a756a; }
      if (dc < C.r + 1.6) return 0x5a6040;
      const p = Math.abs(x - pathX(z));
      if (p < 1.3 && z < 50) return 0x6b5a40;
      const n = Math.sin(x * 1.7) * Math.cos(z * 1.3);
      return n > 0.3 ? 0x3c5a2a : n < -0.4 ? 0x4d4630 : 0x335024;
    },
  });
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
  const ground = new THREE.Mesh(grid.geometry, groundMat); ground.name = "groveGround"; ground.receiveShadow = true;
  group.add(ground);
  // ---- sky
  const sky = skyDome(THREE, { top: 0x4c5a96, horizon: 0xffc690, bottom: 0x3a3a2a, glowCol: 0xff9a52, glowDir: [-0.8, 0.12, 0.3], glowK: 1.1, uTime: U.uTime, clouds: 0.35, cloudCol: 0xffe0c8, stars: 0.2 });
  sky.mesh.scale.setScalar(140); sky.mesh.name = "groveSky"; sky.mesh.frustumCulled = false;
  group.add(sky.mesh);
  // ---- static props merged: logs, thread posts + threads, court rim wall, turntable bases, centre dais, sundial
  const mg = createMerger(THREE, []);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const put = (geo, x, y, z, rx, ry, rz, sx, sy, sz, col) => { e.set(rx, ry, rz, "YXZ"); q.setFromEuler(e); m4.compose(v.set(x, y, z), q, sc.set(sx, sy, sz)); mg.add(geo, m4, col); };
  for (const l of LOGS) { const x = pathX(l); put(lumpify(THREE, new THREE.CylinderGeometry(0.42, 0.45, 7.4, 12, 6).rotateZ(PI / 2), 0.05, 2, l), x, base(x, l) + 0.12, l, 0, 0.06, 0, 1, 1, 1, 0x5a4330); }
  for (let i = -3; i <= 3; i++) {
    const x = pathX(THREAD_Z) + i * 2.1, y = base(x, THREAD_Z);
    put(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6), x, y + 0.55, THREAD_Z, 0, 0, 0, 1, 1, 1, 0x6a5038);
    put(lumpify(THREE, new THREE.IcosahedronGeometry(0.32, 1), 0.08, 3, i + 9), x, y + 0.1, THREAD_Z, 0, i, 0, 1, 0.6, 1, 0x77746a);
    if (i < 3) for (let k = 0; k < 2; k++) put(new THREE.BoxGeometry(2.1, 0.03, 0.03), x + 1.05, y + 0.45 + k * 0.38, THREAD_Z, 0, 0, Math.sin(i + k) * 0.05, 1, 1, 1, 0xd0241a);
  }
  for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; if (Math.abs(Math.sin(a)) < 0.12 && Math.cos(a) < 0) continue; put(lumpify(THREE, new THREE.BoxGeometry(1.7, 0.55, 0.7), 0.06, 2, i), Math.sin(a) * (C.r + 0.35), -0.3, C.z + Math.cos(a) * (C.r + 0.35), 0, a, 0, 1, 1, 1, 0x6e6a60); }
  for (let i = 0; i < 4; i++) put(new THREE.CylinderGeometry(0.72, 0.8, 0.16, 18), STONE_P[i].x, -0.46, STONE_P[i].z, 0, 0, 0, 1, 1, 1, 0x5d5a52);
  put(new THREE.CylinderGeometry(0.95, 1.05, 0.2, 24), 0, -0.48, C.z, 0, 0, 0, 1, 1, 1, 0x8a8272);
  put(new THREE.CylinderGeometry(0.4, 0.5, 0.9, 10), DIAL.x, -0.05, DIAL.z, 0, 0, 0, 1, 1, 1, 0x7a746a);
  put(new THREE.CylinderGeometry(0.62, 0.62, 0.08, 24), DIAL.x, 0.44, DIAL.z, 0, 0, 0, 1, 1, 1, 0x9a9282);
  put(new THREE.BoxGeometry(0.04, 0.32, 0.4), DIAL.x, 0.6, DIAL.z, 0, 0, 0, 1, 1, 1, 0x5a564e);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; put(new THREE.BoxGeometry(0.03, 0.01, 0.12), DIAL.x + Math.sin(a) * 0.5, 0.49, DIAL.z + Math.cos(a) * 0.5, 0, a, 0, 1, 1, 1, 0x3a3630); }
  const propMesh = new THREE.Mesh(mg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  propMesh.name = "groveProps"; propMesh.castShadow = true; propMesh.receiveShadow = true;
  group.add(propMesh);
  // ---- trees: trunks and canopies instanced; colliders on every trunk
  const colliders = [];
  const trees = [];
  const okTree = (x, z) => { if (Math.abs(x - pathX(z)) < 3.4 && z < 52) return false; if (Math.hypot(x - C.x, z - C.z) < C.r + 3.4) return false; if (Math.abs(x) < 3 && z > 50 && z < 56) return false; for (const t of trees) if (Math.hypot(t.x - x, t.z - z) < t.s * 1.4 + 1.2) return false; return true; };
  for (let tries = 0; tries < 900 && trees.length < 64; tries++) {
    const z = rr(-8, 84), x = rr(-30, 30), giant = z > 40 && Math.hypot(x, z - C.z) < 22;
    const s = giant ? rr(1.6, 2.4) : rr(0.8, 1.4);
    if (okTree(x, z)) trees.push({ x, z, s, y: base(x, z) });
  }
  const trunkGeo = lumpify(THREE, new THREE.CylinderGeometry(0.42, 0.75, 12, 10, 8).translate(0, 6, 0), 0.12, 1.3, 3);
  const trunks = new THREE.InstancedMesh(trunkGeo, new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 }), trees.length);
  const canGeo = lumpify(THREE, new THREE.IcosahedronGeometry(3.2, 2), 0.6, 0.7, 5);
  const cans = new THREE.InstancedMesh(canGeo, new THREE.MeshStandardMaterial({ color: 0x2d4a22, roughness: 0.9, flatShading: true }), trees.length * 2);
  trunks.name = "groveTrunks"; cans.name = "groveCanopy"; trunks.castShadow = true; cans.castShadow = true;
  trees.forEach((t, i) => {
    m4.compose(v.set(t.x, t.y - 0.3, t.z), q.setFromEuler(e.set(0, i, 0)), sc.set(t.s, t.s * (0.9 + (i % 3) * 0.15), t.s)); trunks.setMatrixAt(i, m4);
    const top = t.y + 11 * t.s * (0.9 + (i % 3) * 0.15);
    m4.compose(v.set(t.x, top, t.z), q, sc.set(t.s * 1.3, t.s * 0.8, t.s * 1.3)); cans.setMatrixAt(i * 2, m4);
    m4.compose(v.set(t.x + 1.5 * t.s, top - 2.5 * t.s, t.z - t.s), q, sc.set(t.s * 0.9, t.s * 0.6, t.s * 0.9)); cans.setMatrixAt(i * 2 + 1, m4);
    colliders.push({ x: t.x, z: t.z, r: 0.75 * t.s + 0.1, on: true });
  });
  group.add(trunks, cans);
  const bushGeo = lumpify(THREE, new THREE.IcosahedronGeometry(0.6, 1), 0.2, 2, 8);
  const bushes = new THREE.InstancedMesh(bushGeo, new THREE.MeshStandardMaterial({ color: 0x3a6a2c, roughness: 0.9, flatShading: true }), 90);
  bushes.name = "groveFerns";
  for (let i = 0; i < 90; i++) {
    let x = 0, z = 0; for (let k = 0; k < 20; k++) { z = rr(-8, 84); x = rr(-22, 22); if (Math.abs(x - pathX(z)) > 2.2 && Math.hypot(x, z - C.z) > C.r + 2) break; }
    const s = rr(0.6, 1.5); m4.compose(v.set(x, base(x, z) + 0.1, z), q.identity(), sc.set(s, s * 0.6, s)); bushes.setMatrixAt(i, m4);
  }
  group.add(bushes);
  // ---- the rock: two halves that split, carved letters that glow
  const halfGeo = lumpify(THREE, new THREE.BoxGeometry(1.25, 4.2, 1.3, 4, 8, 4).translate(0, 2.1, 0), 0.08, 1.6, 21);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8880, roughness: 0.9 });
  const rockL = new THREE.Mesh(halfGeo, rockMat), rockR = new THREE.Mesh(halfGeo, rockMat);
  rockL.name = "farlandsRockL"; rockR.name = "farlandsRockR";
  rockL.castShadow = rockR.castShadow = true;
  const rockG = new THREE.Group(); rockG.position.set(ROCK.x, -0.5, ROCK.z);
  rockL.position.x = -0.62; rockR.position.x = 0.62; rockR.scale.x = -1;
  rockG.add(rockL, rockR);
  const letterTex = textTexture(THREE, ["FAR LANDS", "PORTAL"], { w: 1024, h: 512, font: "bold 150px Georgia, serif", color: "#fff" });
  const carved = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), new THREE.MeshBasicMaterial({ map: letterTex, color: 0x2a2620, transparent: true, opacity: 0.85, depthWrite: false }));
  const glowMat = new THREE.MeshBasicMaterial({ map: letterTex, color: 0xb98aff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const glowTxt = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), glowMat);
  carved.position.set(0, 2.7, -0.67); glowTxt.position.set(0, 2.7, -0.675);
  carved.rotation.y = glowTxt.rotation.y = PI;   // faces the court (south, -z)
  carved.name = "farlandsLetters"; glowTxt.name = "farlandsGlow";
  rockG.add(carved, glowTxt);
  group.add(rockG);
  colliders.push({ x: ROCK.x - 0.6, z: ROCK.z, r: 0.75, on: true }, { x: ROCK.x + 0.6, z: ROCK.z, r: 0.75, on: true });
  // ---- the four rune stones (a symbol atlas: sun, moon, star, wave, plain)
  function atlas(glow) {
    const cv = document.createElement("canvas"); cv.width = 640; cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = glow ? "#000" : "#86827a"; g.fillRect(0, 0, 640, 128);
    if (!glow) for (let i = 0; i < 400; i++) { g.fillStyle = "rgba(" + (60 + (i * 37) % 60) + ",60,55,0.25)"; g.fillRect((i * 97) % 640, (i * 53) % 128, 3, 3); }
    g.strokeStyle = g.fillStyle = glow ? "#fff" : "#3a3630"; g.lineWidth = 9; g.lineCap = "round";
    const cx = (k) => k * 128 + 64;
    g.beginPath(); g.arc(cx(0), 64, 20, 0, TAU); g.fill();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.beginPath(); g.moveTo(cx(0) + Math.cos(a) * 30, 64 + Math.sin(a) * 30); g.lineTo(cx(0) + Math.cos(a) * 46, 64 + Math.sin(a) * 46); g.stroke(); }
    g.beginPath(); g.arc(cx(1), 64, 40, 0.6, TAU - 0.6); g.arc(cx(1) + 18, 64, 30, TAU - 0.9, 0.9, true); g.fill();
    g.beginPath(); for (let i = 0; i < 10; i++) { const a = -PI / 2 + (i / 10) * TAU, r = i % 2 ? 18 : 44; g.lineTo(cx(2) + Math.cos(a) * r, 64 + Math.sin(a) * r); } g.closePath(); g.fill();
    for (let k = 0; k < 3; k++) { g.beginPath(); for (let x = -44; x <= 44; x += 4) g.lineTo(cx(3) + x, 40 + k * 22 + Math.sin(x * 0.12) * 8); g.stroke(); }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  const mapT = atlas(false), glowT = atlas(true);
  const FACE_COL = [1, 3, 4, 4, 0, 2];   // box faces +x -x +y -y +z -z -> atlas column (+z sun, +x moon, -z star, -x wave)
  const stoneGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
  { const uv = stoneGeo.attributes.uv; for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setX(i, (FACE_COL[f] + uv.getX(i)) / 5); } }
  stoneGeo.translate(0, 0.45, 0);
  const stones = [];
  for (let i = 0; i < 4; i++) {
    const s = STONE_P[i];
    const mat = new THREE.MeshStandardMaterial({ map: mapT, emissiveMap: glowT, emissive: 0x000000, roughness: 0.85 });
    const mesh = new THREE.Mesh(stoneGeo, mat); mesh.name = "runeStone" + i; mesh.castShadow = true;
    const baseYaw = Math.atan2(C.x - s.x, C.z - s.z);
    mesh.position.set(s.x, -0.42, s.z);
    const st = { i, x: s.x, z: s.z, mesh, mat, baseYaw, face: 0, yaw: baseYaw, want: baseYaw, glow: 0, glowTo: 0,
      turn() { st.face = (st.face + 1) % 4; st.want = baseYaw - st.face * (PI / 2); sfx("stoneTurn"); vfx("footDust", st.x, -0.45, st.z, 0.6, 0x8a8272); if (puzzle.onTurn) puzzle.onTurn(st); return st.face; },
      setFace(f) { st.face = f; st.want = st.yaw = baseYaw - f * (PI / 2); mesh.rotation.y = st.yaw; },
    };
    stones.push(st);
    colliders.push({ x: s.x, z: s.z, r: 0.55, on: true });
    group.add(mesh);
  }
  // light lines from the stones to the centre (one instanced quad, colour = brightness)
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const lines = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 1).rotateX(-PI / 2).translate(0, 0, 0.5), lineMat, 5);
  lines.name = "courtLines"; lines.frustumCulled = false;
  const lineK = new Float32Array(5), tcol = new THREE.Color();
  for (let i = 0; i < 5; i++) {
    const a = i < 4 ? STONE_P[i] : { x: 0, z: C.z + 0.9 }, b = i < 4 ? { x: 0, z: C.z } : PORTAL;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    m4.compose(v.set(a.x, -0.36, a.z), q.setFromEuler(e.set(0, Math.atan2(b.x - a.x, b.z - a.z), 0)), sc.set(1, 1, len)); lines.setMatrixAt(i, m4);
    lines.setColorAt(i, tcol.setRGB(0, 0, 0));
  }
  group.add(lines);
  const dais = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.92, 32).rotateX(-PI / 2), new THREE.MeshBasicMaterial({ color: 0xc8a0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  dais.position.set(0, -0.36, C.z); dais.name = "centreRing";
  group.add(dais);
  // ---- the portal: a vertical swirling disc
  const portU = { uTime: U.uTime, uK: { value: 0 }, uCol: { value: new THREE.Color(0xa070ff) } };
  const portal = new THREE.Mesh(new THREE.CircleGeometry(1.5, 48), new THREE.ShaderMaterial({
    uniforms: portU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform float uTime, uK; uniform vec3 uCol; varying vec2 vUv; ${GLSL_NOISE}
      void main(){ vec2 p = vUv * 2.0 - 1.0; float r = length(p), a = atan(p.y, p.x);
        float sw = k3f(vec2(a * 2.0 + r * 6.0 - uTime * 2.2, r * 3.0 - uTime * 0.6));
        float rim = smoothstep(0.75, 0.97, r) * (1.0 - smoothstep(0.97, 1.0, r));
        float body = (1.0 - smoothstep(0.0, 1.0, r)) * (0.35 + 0.65 * sw);
        vec3 c = mix(uCol, vec3(1.0, 0.9, 1.0), sw * (1.0 - r)) * (body * 1.4 + rim * 1.6);
        gl_FragColor = vec4(c * uK, 1.0); }`,
  }));
  portal.name = "portalDisc"; portal.position.set(PORTAL.x, 1.25, PORTAL.z); portal.rotation.y = PI; portal.scale.setScalar(0.001); portal.visible = false;
  group.add(portal);
  // the sundial's shadow
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.05, 0.48).rotateX(-PI / 2).translate(0, 0, 0.24), new THREE.MeshBasicMaterial({ color: 0x1a1814, transparent: true, opacity: 0.6, depthWrite: false }));
  shadow.position.set(DIAL.x, 0.49, DIAL.z); shadow.rotation.y = 2.1; shadow.name = "dialShadow";
  group.add(shadow);
  const dialTxtTex = textTexture(THREE, ["3 SECONDS"], { w: 1024, h: 256, font: "bold 140px Georgia, serif", color: "#ffe9a8" });
  const dialTxt = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshBasicMaterial({ map: dialTxtTex, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  dialTxt.position.set(DIAL.x, 1.25, DIAL.z); dialTxt.name = "dialText";
  group.add(dialTxt);

  function sfx(name, a, b, c) { const o = ctx.audio, f = o && o[name]; return typeof f === "function" ? f.call(o, a, b, c) : undefined; }
  function vfx(name, a, b, c, d, f) { const o = ctx.fx, fn = o && o[name]; return typeof fn === "function" ? fn.call(o, a, b, c, d, f) : undefined; }
  // ---- puzzle / portal state
  const puzzle = {
    onSolved: null, onTurn: null,
    get correct() { let n = 0; for (let i = 0; i < 4; i++) if (stones[i].face === ANSWER[i]) n++; return n; },
    get matched() { return puzzle.correct === 4; },
    solved: false,
    scramble() { stones[0].setFace(2); stones[1].setFace(3); stones[2].setFace(1); stones[3].setFace(2); puzzle.solved = false; },
    solveAll() { for (let i = 0; i < 4; i++) stones[i].setFace(ANSWER[i]); },
    reset() { puzzle.scramble(); },
  };
  let portalK = 0, portalTo = 0, portalRate = 1, letterK = 0, letterTo = 0, splitK = 0, splitTo = 0, dialK = 0, dialTo = 0, lineAll = 0;
  const portalApi = {
    get isOpen() { return portalTo > 0.5; }, get k() { return portalK; },
    open(s) { portalTo = 1; portalRate = 1 / Math.max(0.05, s || 2); portal.visible = true; splitTo = 1; sfx("portalOpen"); },
    close(s) { portalTo = 0; portalRate = 1 / Math.max(0.05, s || 2); splitTo = 0; },
    set(k) { portalK = portalTo = k; portal.visible = k > 0.001; splitK = splitTo = k > 0 ? 1 : 0; },
    dim(k) { portalTo = k; portalRate = 2; },
  };
  const ENV = {
    afternoon: { background: 0xd8c49a, fog: [0xc8b890, 14, 70], hemi: [0xffefd0, 0x3a4a2a, 1.15], sun: [0xffe0a8, 1.8], sunDir: [-0.5, 0.6, 0.3], far: 150, dark: false },
    dusk: { background: 0xc08a6a, fog: [0x9a7464, 10, 58], hemi: [0xf0b8a0, 0x2a2a30, 0.9], sun: [0xff9050, 1.35], sunDir: [-0.85, 0.22, 0.25], far: 150, dark: false },
  };
  const world = {
    name: "farlands", group, P: null, maxStep: 0.5, swim: false, env: ENV.dusk, ENV, colliders,
    heightAt, surfaceAt, waterAt() { return -Infinity; }, sight() { return true; }, hidden() { return false; }, lit() { return 0.5; }, cover: [],
    camBounds: { minX: -30, maxX: 30, minZ: -10, maxZ: 86, maxY: 30 },
    confine(o, r) { r = r || 0; o.x = clamp(o.x, -26 + r, 26 - r); o.z = clamp(o.z, -6 + r, 80 - r); },
    stones, puzzle, portal: portalApi, pathX, C, ROCK, PORTAL, DIAL, THREAD_Z,
    setLight(name, s) { const e2 = ENV[name] || ENV.dusk; world.env = e2; if (ctx.world === world) ctx.setEnv(e2, s || 0); sky.u.uHor.value.set(name === "afternoon" ? 0xffe0b0 : 0xffb080); sky.u.uGlowK.value = name === "afternoon" ? 0.6 : 1.2; },
    letters(k, s) { letterTo = k; if (!s) letterK = k; },
    lines(i, k) { lineK[i] = k; },
    allLines(k) { lineAll = k; },
    centre(k) { dais.material.opacity = k; },
    clock(on, text) { dialTo = on ? 1 : 0; void text; },
    reset() { puzzle.scramble(); portalApi.set(0); letterK = letterTo = 0; dialK = dialTo = 0; lineAll = 0; for (let i = 0; i < 5; i++) lineK[i] = 0; dais.material.opacity = 0; for (const s of stones) { s.glow = s.glowTo = 0; } },
    onFootstep(wx, wz, strength, foot, wet, pan) { sfx("step", surfaceAt(wx, wz), strength, pan); },
    onJump(x, z, y) { vfx("footDust", x, y + 0.03, z, 0.4, 0x6a5a40); },
    onLand(x, z, y, impact) { sfx("step", surfaceAt(x, z), 0.7 + impact * 0.5, 0); },
    update(dt, time) {
      U.uTime.value += dt;
      const cp = ctx.camera; if (cp) sky.mesh.position.copy(cp.position);
      for (const s of stones) {
        s.yaw += (s.want - s.yaw) * Math.min(1, dt * 9); s.mesh.rotation.y = s.yaw;
        const g = s.face === ANSWER[s.i] && puzzleLit ? 1 : 0; s.glow += (g - s.glow) * Math.min(1, dt * 4);
        s.mat.emissive.setRGB(0.75 * s.glow, 0.55 * s.glow, 1.0 * s.glow);
      }
      for (let i = 0; i < 5; i++) { const k = Math.max(lineK[i], lineAll) * (0.75 + 0.25 * Math.sin(U.uTime.value * 3 + i)); lines.setColorAt(i, tcol.setRGB(0.62 * k, 0.42 * k, 0.75 * k)); }
      lines.instanceColor.needsUpdate = true;
      if (portalK !== portalTo) { const d = portalTo - portalK, st2 = dt * portalRate; portalK = Math.abs(d) <= st2 ? portalTo : portalK + Math.sign(d) * st2; }
      portal.visible = portalK > 0.002; portU.uK.value = portalK; portal.scale.setScalar(0.05 + 0.95 * smooth(portalK));
      if (portal.visible) { portal.rotation.z += dt * 0.6; if (R() < dt * 2) vfx("sparkle", v.set(PORTAL.x + rr(-1, 1), 1.2 + rr(-1, 1), PORTAL.z), 0xc8a0ff, 2); }
      splitK += (splitTo - splitK) * Math.min(1, dt * 1.5);
      rockL.position.x = -0.62 - splitK * 1.05; rockR.position.x = 0.62 + splitK * 1.05;
      letterK += (letterTo - letterK) * Math.min(1, dt * 1.2);
      glowMat.opacity = letterK * (0.8 + 0.2 * Math.sin(U.uTime.value * 2.3));
      dialK += (dialTo - dialK) * Math.min(1, dt * 2); dialTxt.material.opacity = dialK; dialTxt.visible = dialK > 0.01;
      if (ctx.camera && dialTxt.visible) dialTxt.lookAt(ctx.camera.position);
      void time;
    },
  };
  let puzzleLit = true;
  world.setStoneGlow = (on) => { puzzleLit = !!on; };
  const pt = (x, z, yaw) => ({ x, y: heightAt(x, z), z, yaw: yaw || 0 });
  const route = [];
  for (let z = 4; z <= 48; z += 4) route.push(pt(pathX(z), z));
  route.push(pt(0, 52), pt(-1.5, C.z - 7.2));
  world.P = {
    start: pt(pathX(1), 1, 0), route, threads: pt(pathX(THREAD_Z), THREAD_Z), exit: pt(pathX(0), 0, PI), court: pt(0, C.z - 7.6, 0),
    centre: pt(0, C.z), rock: pt(ROCK.x, ROCK.z), portal: pt(PORTAL.x, PORTAL.z), land: pt(0, PORTAL.z - 6.4, 0), dial: pt(DIAL.x, DIAL.z),
    stones: STONE_P.map((s) => pt(s.x, s.z)), backStart: pt(pathX(44), 44, 0),
    camRock: { pos: { x: 3.5, y: 1.6, z: C.z - 5 }, look: { x: 0, y: 2.6, z: ROCK.z } },
  };
  // where the many stand to watch (south half of the court rim)
  world.spots = [];
  for (let i = 0; i < 26; i++) {
    const a = PI * 0.62 + (i / 25) * PI * 0.76, r = C.r + 0.9 + (i % 2) * 1.1;
    const x = Math.sin(a) * r, z = C.z + Math.cos(a) * r;
    world.spots.push({ x, z, yaw: Math.atan2(-x, C.z - z), kind: "idle" });
  }
  world.reset();
  return world;
}

// =====================================================================================================
// PIP'S BABIES: Pebble (grey), Fern (green), Dot (spotted). Needs (hunger, clean, happy, sleepy) as icons over
// their heads; a robot form (metal sheen, a visor with red eyes and a cyan antenna).
// =====================================================================================================
const NEEDS = ["hunger", "clean", "happy", "sleepy"];
function createBabies(ctx) {
  const THREE = ctx.THREE;
  const group = new THREE.Group(); group.name = "babies";
  const LOOK = [{ name: "Pebble", fur: 0x8a8a90 }, { name: "Fern", fur: 0x6a8a4a }, { name: "Dot", fur: 0x9a7a52 }];
  const list = [];
  // a baby is two meshes: the body (fur, belly, bill, feet, tail, eyes merged, vertex coloured) and its robot parts
  const robotMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0 });
  function mkRobot() {
    const mg = createMerger(THREE, []), m = new THREE.Matrix4();
    mg.add(new THREE.BoxGeometry(0.13, 0.04, 0.05), m.makeTranslation(0, 0.155, 0.17), 0x30343a);
    mg.add(new THREE.SphereGeometry(0.014, 8, 6), m.makeTranslation(-0.032, 0.157, 0.197), 0xff2020);
    mg.add(new THREE.SphereGeometry(0.014, 8, 6), m.makeTranslation(0.032, 0.157, 0.197), 0xff2020);
    mg.add(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 4), m.makeTranslation(0, 0.23, 0.1), 0x8a9098);
    mg.add(new THREE.SphereGeometry(0.016, 8, 6), m.makeTranslation(0, 0.28, 0.1), 0x40f0ff);
    for (let k = 0; k < 3; k++) mg.add(new THREE.BoxGeometry(0.2, 0.006, 0.006), m.makeTranslation(0, 0.13 + k * 0.012, -0.05 + k * 0.08), 0x50565e);
    return mg.build();
  }
  const robotGeo = mkRobot();
  function mkBaby(fur, spots) {
    const mg = createMerger(THREE, []), m = new THREE.Matrix4(), S = (x, y, z, sx, sy, sz) => m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    const sph = (w, h) => new THREE.SphereGeometry(1, w || 14, h || 10);
    mg.add(sph(), S(0, 0.09, 0, 0.1, 0.08, 0.14), fur);                 // body
    mg.add(sph(), S(0, 0.07, 0.01, 0.085, 0.055, 0.12), 0xf0e0c0);     // belly
    mg.add(sph(), S(0, 0.13, 0.13, 0.072, 0.065, 0.07), fur);           // head (big: a baby)
    mg.add(sph(12, 6), S(0, 0.115, 0.205, 0.05, 0.016, 0.06), 0x3a3a40); // bill
    mg.add(sph(10, 6), S(0, 0.06, -0.15, 0.065, 0.016, 0.085), 0x4a3a2c); // tail paddle
    for (let k = 0; k < 4; k++) mg.add(sph(8, 5), S((k % 2 ? 1 : -1) * 0.075, 0.018, k < 2 ? 0.07 : -0.06, 0.032, 0.014, 0.04), 0x3a3a40);
    for (let k = 0; k < 2; k++) mg.add(sph(8, 6), S((k ? 1 : -1) * 0.042, 0.155, 0.175, 0.011, 0.011, 0.011), 0x0a0a0a);
    if (spots) for (let k = 0; k < 6; k++) mg.add(sph(8, 4), S(Math.sin(k * 2.3) * 0.05, 0.16, -0.08 + k * 0.03, 0.02, 0.006, 0.02), 0xf2e6c8);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    const mesh = new THREE.Mesh(mg.build(), mat); mesh.castShadow = true;
    const g = new THREE.Group(); const pivot = new THREE.Group(); pivot.add(mesh); g.add(pivot);
    const robot = new THREE.Mesh(robotGeo, robotMat); robot.visible = false; pivot.add(robot);
    let ph = Math.random() * 6, sleepK = 0, sleepTo = 0, eatT = 0;
    const body = {
      group: g, mesh, mat, robot,
      update(dt, st) {
        ph += dt * (4 + st.speed * 14);
        sleepK += (sleepTo - sleepK) * Math.min(1, dt * 3);
        if (eatT > 0) eatT -= dt;
        const w = Math.min(1, st.speed * 2);
        pivot.rotation.z = Math.sin(ph) * 0.12 * w;
        pivot.position.y = Math.abs(Math.sin(ph)) * 0.02 * w;
        pivot.rotation.x = eatT > 0 ? 0.25 * Math.abs(Math.sin(eatT * 12)) : 0;
        pivot.scale.set(1 + sleepK * 0.08, 1 - sleepK * 0.25 + Math.sin(ph * 0.3) * 0.02 * sleepK, 1 - sleepK * 0.15);
      },
      eat() { eatT = 0.8; }, sleep(on) { sleepTo = on ? 1 : 0; },
    };
    return body;
  }
  LOOK.forEach((L, i) => {
    const body = mkBaby(L.fur, i === 2);
    const g = body.group; g.name = "baby" + L.name;
    const mats = [{ m: body.mat, c: body.mat.color.clone(), mt: 0, ro: 0.75 }];
    list.push({ i, name: L.name, body, group: g, robot: body.robot, mats, x: 0, y: 0, z: 0, yaw: 0, speed: 0, tx: 0, tz: 0, run: 1.2, fly: 0,
      need: { hunger: 0, clean: 0, happy: 0, sleepy: 0 }, carried: false, asleep: false, hop: 0, mode: "idle", t: 0 });
    group.add(g);
  });
  // need icons: one instanced billboard quad over an atlas of four little pictures
  const cv = document.createElement("canvas"); cv.width = 512; cv.height = 128;
  const c2 = cv.getContext("2d");
  for (let k = 0; k < 4; k++) {
    const x = k * 128 + 64;
    c2.fillStyle = "rgba(255,255,255,0.92)"; c2.beginPath(); c2.arc(x, 64, 58, 0, TAU); c2.fill();
    c2.fillStyle = ["#e8743a", "#3aa0e8", "#e83a7a", "#6a5ad8"][k]; c2.strokeStyle = c2.fillStyle; c2.lineWidth = 10; c2.lineCap = "round";
    if (k === 0) { c2.beginPath(); c2.arc(x, 66, 26, 0.3, PI * 1.7); c2.stroke(); c2.beginPath(); c2.arc(x + 20, 52, 7, 0, TAU); c2.fill(); }
    if (k === 1) { c2.beginPath(); c2.moveTo(x, 22); c2.quadraticCurveTo(x + 34, 70, x, 96); c2.quadraticCurveTo(x - 34, 70, x, 22); c2.fill(); }
    if (k === 2) { c2.beginPath(); c2.moveTo(x, 96); c2.bezierCurveTo(x - 50, 60, x - 22, 18, x, 44); c2.bezierCurveTo(x + 22, 18, x + 50, 60, x, 96); c2.fill(); }
    if (k === 3) { c2.font = "bold 64px sans-serif"; c2.textAlign = "center"; c2.textBaseline = "middle"; c2.fillText("Zz", x, 68); }
  }
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const iconGeo = new THREE.PlaneGeometry(0.2, 0.2);
  const aIcon = new THREE.InstancedBufferAttribute(new Float32Array(12), 1);
  iconGeo.setAttribute("aIcon", aIcon);
  const icons = new THREE.InstancedMesh(iconGeo, new THREE.ShaderMaterial({
    uniforms: { uMap: { value: tex } }, transparent: true, depthWrite: false, fog: false,
    vertexShader: `attribute float aIcon; varying vec2 vUv; void main(){ vUv = vec2((uv.x + aIcon) / 4.0, uv.y);
      vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0); float s = length(instanceMatrix[0].xyz);
      c.xy += position.xy * s; gl_Position = projectionMatrix * c; }`,
    fragmentShader: "uniform sampler2D uMap; varying vec2 vUv; void main(){ vec4 t = texture2D(uMap, vUv); if (t.a < 0.05) discard; gl_FragColor = t; }",
  }), 12);
  icons.name = "babyNeeds"; icons.frustumCulled = false;
  group.add(icons);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s3 = new THREE.Vector3(1, 1, 1), zero = new THREE.Matrix4().makeScale(0, 0, 0);
  let robotK = 0, robotTo = 0, robotRate = 1, iconsOn = false, world = null;
  const ST = { speed: 0, maxSpeed: 1.2, grounded: true, vy: 0, turn: 0, moving: false };
  const babies = {
    group, list,
    get robotK() { return robotK; },
    setWorld(w) { world = w; },
    show(on) { group.visible = !!on; },
    hide() { group.visible = false; iconsOn = false; },
    showNeeds(on) { iconsOn = !!on; },
    place(b, x, z, yaw) { b.x = b.tx = x; b.z = b.tz = z; b.yaw = yaw || 0; b.y = world ? world.heightAt(x, z) : 0; b.group.position.set(b.x, b.y, b.z); },
    goTo(b, x, z, run) { b.tx = x; b.tz = z; b.run = run || 1.2; },
    setRobot(k, s) { robotTo = k; robotRate = 1 / Math.max(0.01, s || 0.01); if (!s) { robotK = k; apply(); } },
    full(b) { return b.need.hunger >= 1 && b.need.clean >= 1 && b.need.happy >= 1 && b.need.sleepy >= 1; },
    get allFull() { return list.every((b) => babies.full(b)); },
    reset() {
      for (const b of list) { b.need.hunger = 0.2; b.need.clean = 0.3; b.need.happy = 0.4; b.need.sleepy = 0.3; b.carried = false; b.asleep = false; b.mode = "idle"; b.fly = 0; if (b.body.sleep) b.body.sleep(false); b.group.rotation.set(0, 0, 0); b.group.scale.set(1, 1, 1); }
      babies.setRobot(0); iconsOn = false; group.visible = false;
    },
    update(dt) {
      if (!group.visible) return;
      if (robotK !== robotTo) { const d = robotTo - robotK, st = dt * robotRate; robotK = Math.abs(d) <= st ? robotTo : robotK + Math.sign(d) * st; apply(); }
      for (const b of list) {
        if (!b.carried) {
          const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
          let sp = 0;
          if (d > 0.08 && !b.asleep) { sp = Math.min(b.run, d * 3); const want = Math.atan2(dx, dz); let da = want - b.yaw; while (da > PI) da -= TAU; while (da < -PI) da += TAU; b.yaw += da * Math.min(1, dt * 8); b.x += Math.sin(b.yaw) * sp * dt; b.z += Math.cos(b.yaw) * sp * dt; }
          b.speed = sp;
          b.y = world ? Math.max(world.heightAt(b.x, b.z), world.waterAt ? world.waterAt(b.x, b.z) - 0.05 : -1e9) : 0;
          b.hop = Math.max(0, b.hop - dt * 3);
          b.group.position.set(b.x, b.y + Math.sin(b.hop * PI) * 0.18 + b.fly, b.z);
          b.group.rotation.y = b.yaw;
        }
        ST.speed = b.speed; ST.moving = b.speed > 0.05;
        b.body.update(dt, ST);
      }
      if (iconsOn) {
        for (const b of list) {
          let shown = 0, cnt = 0;
          for (let n = 0; n < 4; n++) if (b.need[NEEDS[n]] < 1) cnt++;
          for (let n = 0; n < 4; n++) {
            const idx = b.i * 4 + n;
            if (b.need[NEEDS[n]] < 1 && !b.carried) { m4.compose(v.set(b.x + (shown - (cnt - 1) / 2) * 0.22, b.y + 0.55, b.z), q, s3); icons.setMatrixAt(idx, m4); aIcon.setX(idx, n); shown++; } else icons.setMatrixAt(idx, zero);
          }
        }
        icons.visible = true; icons.instanceMatrix.needsUpdate = true; aIcon.needsUpdate = true;
      } else icons.visible = false;
    },
  };
  const tc = new THREE.Color(), steel = new THREE.Color(0xc8d0dc);
  function apply() {
    for (const b of list) {
      for (const o of b.mats) { o.m.color.copy(o.c).lerp(tc.copy(steel), robotK); o.m.metalness = lerp(o.mt || 0, 0.65, robotK); o.m.roughness = lerp(o.ro, 0.32, robotK); }
      b.robot.visible = robotK > 0.4;
      b.robot.scale.setScalar(clamp((robotK - 0.4) / 0.6, 0.01, 1)); robotMat.emissiveIntensity = 0;
    }
  }
  babies.reset();
  return babies;
}

// =====================================================================================================
// THE PLATYPUS HOUSE: a round lodge by the camp. Every piece of all six stages lives in ONE merged geometry with a
// per-vertex piece id; a "built" uniform array shows the placed ones (dropping in), a ghost material shows the
// glowing slots of the current stage. Piles of materials stand round the site.
// =====================================================================================================
const HOUSE_STAGES = [
  { label: "Footings", n: 8, kinds: ["stone"], time: "dawn" },
  { label: "Floor", n: 6, kinds: ["plank"], time: "dawn" },
  { label: "Walls", n: 12, kinds: ["log"], time: "day" },
  { label: "Roof poles", n: 9, kinds: ["pole"], time: "day" },
  { label: "Thatch", n: 10, kinds: ["leaf"], time: "dusk" },
  { label: "Seal & beds", n: 15, kinds: ["mud", "moss", "lantern"], time: "dusk" },
];
function createHouse(ctx, jungle) {
  const THREE = ctx.THREE;
  const group = new THREE.Group(); group.name = "house";
  const SITE = { x: 21, z: 61 };
  const Y0 = jungle.heightAt(SITE.x, SITE.z);
  group.position.set(SITE.x, Y0, SITE.z);
  const mg = createMerger(THREE, ["aPiece"]);
  const pieces = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  // at: where a builder stands to place it (local); default = the piece itself
  function piece(stage, kind, geo, x, y, z, ry, sx, sy, sz, col, at) {
    const id = pieces.length;
    e.set(0, ry || 0, 0, "YXZ"); q.setFromEuler(e);
    m4.compose(v.set(x, y, z), q, sc.set(sx || 1, sy || 1, sz || 1));
    mg.add(geo, m4, col, { aPiece: id });
    const ax = at ? at.x : x, az = at ? at.z : z;
    pieces.push({ id, stage, kind, x: SITE.x + ax, z: SITE.z + az });
    return id;
  }
  const WALL_R = 2.3, SIDES = 7, FLOOR = 0.04, WALL_TOP = 0.95;
  const sideA = (k) => (k / SIDES) * TAU;            // side 0 (the door) faces +z, toward the camp
  const out = (a, r) => ({ x: Math.sin(a) * r, z: Math.cos(a) * r });
  // 1 footings
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; piece(0, "stone", lumpify(THREE, new THREE.IcosahedronGeometry(0.32, 1), 0.07, 3, i), Math.sin(a) * 2.05, 0.06, Math.cos(a) * 2.05, a, 1.1, 0.5, 1.1, 0x7d786c, out(a, 2.7)); }
  // 2 floor planks
  [-1.95, -1.17, -0.39, 0.39, 1.17, 1.95].forEach((x, i) => { const w = Math.abs(x) + 0.37, half = Math.sqrt(Math.max(0.3, 2.45 * 2.45 - w * w)); piece(1, "plank", new THREE.BoxGeometry(0.74, 0.05, 2 * half), x, FLOOR, 0, 0, 1, 1, 1, 0x9a7650, { x: x * 1.25 + (i < 3 ? -0.9 : 0.9), z: -0.2 }); });
  // 3 walls: two rings of six logs (the door side is open)
  const sideLen = 2 * WALL_R * Math.tan(PI / SIDES) + 0.2;
  for (let ring = 0; ring < 2; ring++) for (let k = 1; k < SIDES; k++) {
    const a = sideA(k);
    piece(2, "log", new THREE.CylinderGeometry(0.2, 0.2, sideLen, 9).rotateZ(PI / 2), Math.sin(a) * WALL_R, FLOOR + 0.22 + ring * 0.42, Math.cos(a) * WALL_R, a, 1, 1, 1, ring ? 0x6a4c34 : 0x5e432e, out(a, WALL_R + 0.75));
  }
  // 4 roof poles + the door frame
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + PI / 8, pts = [];
    for (let k = 0; k <= 6; k++) { const ang = (k / 6) * PI / 2; pts.push(new THREE.Vector3(Math.sin(a) * WALL_R * Math.cos(ang) * 0.98, WALL_TOP + Math.sin(ang) * 1.7, Math.cos(a) * WALL_R * Math.cos(ang) * 0.98)); }
    piece(3, "pole", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 8, 0.06, 5), 0, 0, 0, 0, 1, 1, 1, 0x8a6a48, out(a, WALL_R + 0.75));
  }
  { const dm = createMerger(THREE, []);
    dm.add(new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(-0.62, 0.55, 0), null, 0x7a5a3c);
    dm.add(new THREE.BoxGeometry(0.12, 1.1, 0.12).translate(0.62, 0.55, 0), null, 0x7a5a3c);
    dm.add(new THREE.BoxGeometry(1.4, 0.14, 0.14).translate(0, 1.1, 0), null, 0x6a4c34);
    const dg = dm.build(); dg.deleteAttribute("color");
    piece(3, "pole", dg, 0, FLOOR, WALL_R, 0, 1, 1, 1, 0x7a5a3c, { x: 0, z: WALL_R + 1.0 }); }
  // 5 thatch: a lower ring of five, an upper ring of four, the cap
  const thatch = (phi0, phiL, th0, thL) => { const g = new THREE.SphereGeometry(2.6, 8, 3, phi0, phiL, th0, thL); g.scale(1, 0.72, 1); g.translate(0, WALL_TOP - 0.05, 0); return lumpify(THREE, g, 0.05, 4, (phi0 * 10 + th0) | 0); };
  const thCol = (x, y, z) => (Math.sin(x * 9 + y * 13 + z * 7) > 0 ? 0x8a8a3a : 0x6f7a32);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU; piece(4, "leaf", thatch(a, TAU / 5 + 0.05, 0.95, PI / 2 - 0.9), 0, 0, 0, 0, 1, 1, 1, thCol, out(a + 0.6, 3.1)); }
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; piece(4, "leaf", thatch(a, TAU / 4 + 0.05, 0.42, 0.6), 0, 0, 0, 0, 1, 1, 1, thCol, out(a + 0.8, 3.1)); }
  piece(4, "leaf", thatch(0, TAU, 0, 0.47), 0, 0, 0, 0, 1, 1, 1, thCol, { x: 0.8, z: 3.1 });
  // 6 seal & furnish: 4 mud patches, 10 moss beds, 1 lantern
  for (let i = 0; i < 4; i++) { const a = sideA([1, 3, 4, 6][i]) + 0.2; piece(5, "mud", new THREE.SphereGeometry(0.42, 10, 6).scale(1, 0.6, 0.25), Math.sin(a) * (WALL_R + 0.18), FLOOR + 0.42, Math.cos(a) * (WALL_R + 0.18), a, 1, 1, 1, 0x4a3424, out(a, WALL_R + 0.8)); }
  const BEDS = [];
  for (let i = 0; i < 10; i++) {
    const inner = i < 2, a = inner ? PI * 0.5 + i * PI : ((i - 2) / 8) * TAU + PI / 8, r = inner ? 0.4 : 1.5;
    BEDS.push({ x: SITE.x + Math.sin(a) * r, z: SITE.z + Math.cos(a) * r, yaw: a + PI });
    piece(5, "moss", lumpify(THREE, new THREE.SphereGeometry(0.34, 10, 6).scale(1, 0.32, 0.8), 0.04, 5, i), Math.sin(a) * r, FLOOR + 0.06, Math.cos(a) * r, a, 1, 1, 1, 0x4f7a34, { x: 0, z: WALL_R + 0.9 });
  }
  const LANTERN = piece(5, "lantern", new THREE.BoxGeometry(0.16, 0.22, 0.16), 0, WALL_TOP + 0.3, 0, 0.4, 1, 1, 1, 0xd8b050, { x: 0, z: WALL_R + 0.9 });
  const NP = pieces.length;
  const geo = mg.build();
  const uB = { value: new Float32Array(64) }, uG = { value: new Float32Array(64) }, uCut = { value: 99 }, uT = { value: 0 };
  const vMod = (sh, arr) => {
    sh.uniforms.uB = arr; sh.uniforms.uCut = uCut;
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aPiece;\nuniform float uB[64];\nvarying float vWY;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nfloat bk = uB[int(aPiece + 0.5)];\ntransformed.y += (1.0 - bk) * 0.9;\nif (bk < 0.01) transformed = vec3(0.0, -50.0, 0.0);\nvWY = (modelMatrix * vec4(transformed, 1.0)).y;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uCut;\nvarying float vWY;").replace("void main() {", "void main() {\nif (vWY > uCut) discard;");
  };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => vMod(sh, uB); mat.customProgramCacheKey = () => "house13";
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (sh) => vMod(sh, uB); depth.customProgramCacheKey = () => "house13d";
  const solid = new THREE.Mesh(geo, mat); solid.name = "houseBuilt"; solid.castShadow = true; solid.receiveShadow = true; solid.customDepthMaterial = depth; solid.frustumCulled = false;
  const gmat = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  gmat.onBeforeCompile = (sh) => { vMod(sh, uG); sh.uniforms.uT = uT; sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform float uT;").replace("vec4 diffuseColor = vec4( diffuse, opacity );", "vec4 diffuseColor = vec4( diffuse, opacity * (0.55 + 0.45 * sin(uT * 4.0)) );"); };
  gmat.customProgramCacheKey = () => "house13g";
  const ghost = new THREE.Mesh(geo, gmat); ghost.name = "houseGhosts"; ghost.frustumCulled = false;
  group.add(solid, ghost);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.26, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.set(0, WALL_TOP + 0.3, 0); glow.name = "lanternGlow"; group.add(glow);
  // ---- piles round the site (one merged mesh) and the piece you carry (one small mesh per kind)
  const PILES = { stone: { x: 25.5, z: 56 }, plank: { x: 26.5, z: 64.5 }, log: { x: 27, z: 60.5 }, pole: { x: 16.5, z: 56.5 }, leaf: { x: 16, z: 64.5 }, mud: { x: 28.6, z: 68.2 }, moss: { x: 23.5, z: 67.5 }, lantern: { x: 18.5, z: 68.5 } };
  const pm = createMerger(THREE, []);
  const R = mulberry(77), rr = (a, b) => a + (b - a) * R();
  const pput = (g, x, y, z, ry, col) => { m4.compose(v.set(x, y, z), q.setFromEuler(e.set(0, ry, 0)), sc.set(1, 1, 1)); pm.add(g, m4, col); };
  for (const k in PILES) {
    const p = PILES[k], y = jungle.heightAt(p.x, p.z);
    for (let i = 0; i < 6; i++) {
      const ox = p.x + rr(-0.6, 0.6), oz = p.z + rr(-0.6, 0.6), oy = y + 0.1 + (i > 3 ? 0.22 : 0);
      if (k === "stone") pput(lumpify(THREE, new THREE.IcosahedronGeometry(0.28, 1), 0.06, 3, i), ox, oy, oz, i, 0x7d786c);
      else if (k === "plank") pput(new THREE.BoxGeometry(0.5, 0.05, 1.6), p.x, y + 0.04 + i * 0.06, p.z, i * 0.15, 0x9a7650);
      else if (k === "log") pput(new THREE.CylinderGeometry(0.18, 0.18, 1.8, 8).rotateZ(PI / 2), p.x, y + 0.18 + (i > 2 ? 0.32 : 0), p.z - 0.4 + (i % 3) * 0.38, 0, 0x5e432e);
      else if (k === "pole") pput(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5).rotateZ(1.3), p.x, y + 0.06 + i * 0.1, p.z + i * 0.08, i * 0.3, 0x8a6a48);
      else if (k === "leaf") pput(new THREE.SphereGeometry(0.35, 8, 4).scale(1.4, 0.3, 0.8), ox, oy, oz, i, 0x6f8a32);
      else if (k === "mud") pput(new THREE.CircleGeometry(0.4, 10).rotateX(-PI / 2), ox, y + 0.02, oz, 0, 0x3a2818);
      else if (k === "moss") pput(new THREE.SphereGeometry(0.3, 8, 5).scale(1, 0.4, 1), ox, oy - 0.05, oz, 0, 0x4f7a34);
      else if (k === "lantern" && i === 0) pput(new THREE.BoxGeometry(0.16, 0.22, 0.16), p.x, y + 0.12, p.z, 0, 0xd8b050);
    }
  }
  const piles = new THREE.Mesh(pm.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  piles.name = "housePiles"; piles.castShadow = false;
  const carry = {};
  const CG = { stone: [lumpify(THREE, new THREE.IcosahedronGeometry(0.16, 1), 0.04, 3, 1), 0x7d786c], plank: [new THREE.BoxGeometry(0.22, 0.03, 0.7), 0x9a7650], log: [new THREE.CylinderGeometry(0.08, 0.08, 0.8, 7).rotateZ(PI / 2), 0x5e432e],
    pole: [new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5).rotateX(PI / 2), 0x8a6a48], leaf: [new THREE.SphereGeometry(0.18, 8, 4).scale(1.4, 0.35, 0.9), 0x6f8a32], mud: [new THREE.SphereGeometry(0.13, 8, 5), 0x3a2818],
    moss: [new THREE.SphereGeometry(0.16, 8, 5).scale(1, 0.5, 1), 0x4f7a34], lantern: [new THREE.BoxGeometry(0.1, 0.14, 0.1), 0xd8b050] };
  for (const k in CG) { const m = new THREE.Mesh(CG[k][0], new THREE.MeshStandardMaterial({ color: CG[k][1], roughness: 0.85 })); m.name = "carry_" + k; m.visible = false; carry[k] = m; }
  // ---- state
  const built = new Uint8Array(NP), by = new Uint8Array(NP), anim = new Float32Array(NP);
  let stage = 0, done = false, ghostsOn = true;
  function showGhosts() { for (let i = 0; i < NP; i++) uG.value[i] = ghostsOn && pieces[i].stage === stage && !built[i] ? 1 : 0; ghost.visible = ghostsOn; }
  function sfxH(name, a) { const o = ctx.audio, f = o && o[name]; if (typeof f === "function") f.call(o, a); }
  const house = {
    group, piles, pieces, BEDS, PILES, SITE, carry, NP, LANTERN, WALL_R, Y0,
    onStage: null, onDone: null,
    get stage() { return stage; },
    get done() { return done; },
    get progress() { let n = 0; for (let i = 0; i < NP; i++) n += built[i]; return n / NP; },
    stageDef(s) { return HOUSE_STAGES[s === undefined ? stage : s]; },
    count(s) { let n = 0; for (const p of pieces) if (p.stage === s && built[p.id]) n++; return n; },
    byYou() { let n = 0; for (let i = 0; i < NP; i++) n += by[i] === 1 ? 1 : 0; return n; },
    byHelpers() { let n = 0; for (let i = 0; i < NP; i++) n += by[i] === 2 ? 1 : 0; return n; },
    isBuilt(id) { return !!built[id]; },
    open(kind) { const o = []; for (const p of pieces) if (p.stage === stage && !built[p.id] && (!kind || p.kind === kind)) o.push(p); return o; },
    nearestOpen(x, z, kind, max) { let b = null, bd = max || 1e9; for (const p of pieces) { if (p.stage !== stage || built[p.id] || (kind && p.kind !== kind)) continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; b = p; } } return b; },
    // place piece `id` (who: 1 = you, 2 = a helper); true when placed
    place(id, who) {
      const p = pieces[id];
      if (!p || built[id] || p.stage !== stage || done) return false;
      built[id] = 1; by[id] = who || 1; anim[id] = 0.001; uB.value[id] = 0.02; uG.value[id] = 0;
      sfxH(p.kind === "stone" ? "placeStone" : p.kind === "leaf" || p.kind === "moss" ? "thatchRustle" : "placeLog");
      sfxH("hammer", p.kind === "stone" ? "stone" : "wood");
      if (p.kind !== "stone" && p.kind !== "leaf" && p.kind !== "moss" && (id % 3) === 0) sfxH("sawWood"); // every third timber gets cut to fit
      if (house.count(stage) >= HOUSE_STAGES[stage].n) {
        const was = stage;
        if (stage === 5) { done = true; ghostsOn = false; showGhosts(); if (house.onStage) house.onStage(was); if (house.onDone) house.onDone(); }
        else { stage++; showGhosts(); if (house.onStage) house.onStage(was); }
      }
      return true;
    },
    skipToStage(s) {
      for (let i = 0; i < NP; i++) { const b = pieces[i].stage < s ? 1 : 0; built[i] = b; by[i] = b ? 3 : 0; anim[i] = b; uB.value[i] = b; }
      done = s > 5; stage = clamp(s, 0, 5); ghostsOn = !done; showGhosts();
    },
    interior(on) { uCut.value = on ? Y0 + WALL_TOP + 0.5 : 99; glow.material.opacity = on || done ? 0.85 : 0; },
    ghosts(on) { ghostsOn = !!on; showGhosts(); },
    reset() { house.skipToStage(0); uCut.value = 99; glow.material.opacity = 0; for (const k in carry) carry[k].visible = false; },
    update(dt) {
      uT.value += dt;
      for (let i = 0; i < NP; i++) if (built[i] && anim[i] < 1) { anim[i] = Math.min(1, anim[i] + dt * 2.4); const k = anim[i]; uB.value[i] = 0.02 + 0.98 * (1 - (1 - k) * (1 - k)); }
      if (done) glow.material.opacity = 0.6 + 0.08 * Math.sin(uT.value * 7);
    },
  };
  house.reset();
  return house;
}

// =====================================================================================================
// THE LEVEL
// =====================================================================================================
export function createLevel(ctx) {
  const { THREE, player, platypus, cam, ui, cinema, fx } = ctx;
  const audio = ctx.audio, music = ctx.music, ab = ctx.abilities;
  function A(name, a, b, c, d) { const f = audio && audio[name]; return typeof f === "function" ? f.call(audio, a, b, c, d) : undefined; }
  function FX(name, a, b, c, d, e, g) { const f = fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e, g) : undefined; }
  function M(name, a, b) { const f = music && music[name]; return typeof f === "function" ? f.call(music, a, b) : undefined; }
  function F(v) { const a = ctx.camera.aspect || 1.78; if (a >= 1.3) return v; return Math.min(80, (2 * Math.atan((Math.tan((v * PI) / 360) * 1.3) / a) * 180) / PI); }

  let woods = null, jungle = null, tribe = null, friend = null, grove = null, babies = null, house = null;
  let W = null, J = null, G = null, mem = null;
  let step = "boot", gen = 0, place = "";
  const v1 = new THREE.Vector3();
  const cd = { sting: 0, slap: 0 };
  const beds = [];
  const myCols = [];
  // ---- beat state
  let goal = null, actName = null, objKey = "";
  let hints = null, hintT = 0, hintLv = 0;
  let kos = 0, wave = 0, vinesCut = 0, alphaOut = false, trailZ = 0, scared = 0;
  let hides = 0, hideStage = 0, hideSpot = null, hideT = 0;
  let threadsSeen = false, groveArrived = false;
  let called = false, puzzleT = 0, nudged = -1, solved = false, screamed = false;
  let illuK = 0, illuTo = 0, illuRate = 1;
  let careHeld = null, careRockT = 0, careDone = false, babyChirpT = 0, foodBasket = [];
  let seg = -1, chaseOn = false, power = null, powerT = 0, robotsGone = false, panted = false;
  let closeTurned = [false, false, false, false], closeReady = false, closed = false;
  let carrying = null, perfectT = -1, perfects = 0, speedT = 0, helperT = 0;
  const helpers = [];
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const nearP = (p, r) => dist2(player.x, player.z, p.x, p.z) <= r;
  const later = (s, fn) => { const g = gen; ctx.after(s, () => { if (g === gen) fn(); }); };
  const keyHint = (keys, touch) => (ctx.touch ? touch : keys);

  function setGoal(x, y, z, hex) { if (goal && goal.set) { goal.set(x, y, z); return; } goal = FX("beacon", x, y, z, hex === undefined ? 0xffe08a : hex) || null; }
  function clearGoal() { if (goal && goal.remove) goal.remove(); goal = null; }
  function setAct(label, key) { if (label !== actName) { actName = label; ui.setAction(label, key); } }
  // on a touch screen there is no E / Space / R key: "Sleep (E)" reads "Sleep" (the on-screen button with that name)
  const KEYS_RE = / ?\((?:E|Space|R|Q|J|L|hold R)\)/g;
  const forTouch = (s) => (ctx.touch && typeof s === "string" ? s.replace(KEYS_RE, "").replace(/\bSpace\b/g, "Jump") : s);
  function objective(key, text, keys) { if (key !== objKey) { objKey = key; ui.setObjective(text, forTouch(keys || "")); } }
  function setHints(a, b) { a = forTouch(a); b = forTouch(b); hints = a ? [a, b || a] : null; hintT = 0; hintLv = 0; }
  function progressed() { hintT = 0; hintLv = 0; }
  function tickHints(dt) {
    if (!hints || !player.enabled || cinema.playing) return;
    hintT += dt;
    if (hintLv === 0 && hintT > 20) { hintLv = 1; ui.hint(hints[0], 4.5); }
    else if (hintLv === 1 && hintT > 45) { hintLv = 2; ui.hint(hints[1], 6); hintT = 20; hintLv = 1; }
  }
  function bed(name, a, b) { const h = A(name, a, b); if (h && typeof h.stop === "function") beds.push(h); return h; }
  function stopBeds() { for (let i = 0; i < beds.length; i++) { try { beds[i].stop(); } catch (_) { /* gone */ } } beds.length = 0; }
  function walkSpeed(k) { player.maxSpeed = 3 * (ctx.gear.speed || 1) * (k || 1); }
  function wearGear() { ctx.gear.wear("body", "suit", { armor: 0.25 }); if (ctx.gear.worn.eyes) ctx.gear.remove("eyes"); }
  function gy(x, z) { const w = ctx.world; if (!w) return 0; const h = w.heightAt(x, z), wa = w.waterAt ? w.waterAt(x, z) - 0.1 : -1e9; return h > wa ? h : wa; }
  function clearCols() { for (const c of myCols) { const i = ctx.colliders.indexOf(c); if (i >= 0) ctx.colliders.splice(i, 1); } myCols.length = 0; }
  function addCol(x, z, r) { const c = { x, z, r, on: true }; myCols.push(c); ctx.colliders.push(c); return c; }

  // ---- the jungle-side props of this level: the thread gate the chase runs to
  let threadGate = null;
  const GATE = { x: 41, z: 17 };
  function buildGate() {
    const mg = createMerger(THREE, []);
    const m = new THREE.Matrix4();
    for (let i = -1; i <= 1; i += 2) { m.makeTranslation(GATE.x + i * 1.2, jungle.heightAt(GATE.x + i * 1.2, GATE.z) + 0.55, GATE.z); mg.add(new THREE.CylinderGeometry(0.07, 0.09, 1.1, 6), m, 0x6a5038); }
    for (let k = 0; k < 2; k++) { m.makeTranslation(GATE.x, jungle.heightAt(GATE.x, GATE.z) + 0.5 + k * 0.38, GATE.z); mg.add(new THREE.BoxGeometry(2.4, 0.03, 0.03), m, 0xd0241a); }
    threadGate = new THREE.Mesh(mg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    threadGate.name = "threadGate"; threadGate.visible = false;
  }
  // ---- laser beams for the robot chase (3, pooled)
  const beams = [];
  function buildBeams() {
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1, 6).rotateX(PI / 2).translate(0, 0, 0.5), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.name = "laser" + i; m.visible = false; m.frustumCulled = false;
      beams.push(m);
    }
  }

  function build() {
    woods = ctx.shared("woods", () => createWoods(ctx));
    jungle = ctx.shared("jungle", () => createJungle(ctx));
    tribe = ctx.shared("tribe", () => createTribe(ctx));
    friend = ctx.shared("friend", () => createFriend(ctx));
    grove = ctx.shared("farlands", () => createGrove(ctx));
    babies = ctx.shared("babies", () => createBabies(ctx));
    house = ctx.shared("house", () => createHouse(ctx, jungle));
    W = woods.P; J = jungle.P; G = grove.P; mem = tribe.members;
    if (typeof tribe.warm === "function") tribe.warm();
    buildGate(); buildBeams();
    if (ctx.debug) ctx.debug.level13 = { woods, jungle, tribe, friend, grove, babies, house, beams, GATE, CHASE, get power() { return power; }, helpers };
  }

  function hardStop() {
    gen++;
    cinema.reset();
    cinema.fade("black", 0);
    cinema.tint(null);
    ctx.clearTimers();
    ctx.setTimeScale(1, 0);
    ui.clearSpeech();
    ui.showHud(false);
    ui.setObjective(null); objKey = "";
    ui.setAction(null); actName = null;
    ui.boss.hide();
    ui.setQuests(null);
    ui.setPing(null);
    ctx.setSpeaker(null);
    clearGoal(); setHints(null); stopBeds(); clearCols();
    A("jungleAmbience", false); A("screamCharge", 0);
    FX("fireflies", false);
    if (ctx.vehicle.active) ctx.vehicle.exit();
    ab.cancel();
    ab.potion.disable(); ab.scream.disable(); ab.shoot.disable();
    ab.scream.onStart = ab.scream.onCharge = ab.scream.onRelease = ab.scream.onFizzle = ab.scream.onCancel = null;
    ab.targets = null;
    ab.buttons({});
    ctx.health.disable(); ctx.health.shield = false; ctx.health.onHurt = null; ctx.health.onDeath = null;
    ctx.checkpoint.clear();
    woods.wolves.reset(); woods.wolves.onKO = woods.wolves.onHowl = null;
    tribe.reset();
    friend.attachTo(null); friend.reset(); friend.onEvent = null;
    babies.reset();
    for (const b of beams) b.visible = false;
    for (const k in house.carry) { house.carry[k].visible = false; if (house.carry[k].parent) house.carry[k].parent.remove(house.carry[k]); }
    house.onStage = house.onDone = null;
    if (tribe.food && tribe.food.clear) tribe.food.clear();
    platypus.reset();
    if (platypus.setCarry) platypus.setCarry(false);
    player.scripted = false; player.hidden = false; player.enabled = false; player.carrying = false;
    player.maxSpeed = 3; player.lock = 0; player.face = null; player.canJump = player.canDive = true;
    player.kx = player.kz = 0; player.invuln = 0;
    player.stop();
    cam.wantDist = 3.7; cam.pitch = 0.42;
    kos = 0; wave = 0; vinesCut = 0; alphaOut = false; trailZ = 0; scared = 0;
    hides = 0; hideStage = 0; hideSpot = null; hideT = 0; threadsSeen = false; groveArrived = false;
    called = false; puzzleT = 0; nudged = -1; solved = false; screamed = false;
    careHeld = null; careRockT = 0; careDone = false; foodBasket.length = 0;
    seg = -1; chaseOn = false; power = null; powerT = 0; robotsGone = false; panted = false;
    closeTurned = [false, false, false, false]; closeReady = false; closed = false;
    carrying = null; perfectT = -1; speedT = 0; helperT = 0; helpers.length = 0;
    cd.sting = cd.slap = 0; illuK = illuTo = 0; M("setDetune", 0, 0); ui.setCharge(null);
    ui.setCooldown("sting", 0); ui.setCooldown("slap", 0);
  }

  // ---- the illusion: a hair too warm and saturated, the music a little out of tune (never announced)
  function setIllusion(k, s) { illuTo = k; illuRate = 1 / Math.max(0.01, s || 0.01); if (!s) { illuK = k; applyIllusion(); } M("setDetune", 10 * k, s || 0); }
  function applyIllusion() { cinema.tint(illuK > 0.01 ? "warm" : null, 0.09 * illuK); }

  function leaveWorld(w) { if (ctx.world === w) ctx.setWorld(null); }
  function toWoods() {
    leaveWorld(woods);
    woods.reset();
    woods.group.add(friend.group);
    friend.setWorld(woods);
    friend.visible = false;
    ctx.setWorld(woods);
    woods.setMoon(0.4, 0);
    FX("setGround", woods.heightAt, null);
    place = "woods";
  }
  function groundWater(x, z) { const w = jungle.waterAt(x, z); return w > -1e6 ? w : null; }
  function toJungle(time) {
    leaveWorld(jungle);
    jungle.reset();
    jungle.group.add(tribe.group, friend.group, babies.group, house.group, house.piles, threadGate);
    for (const b of beams) jungle.group.add(b);
    house.group.visible = false; house.piles.visible = false; threadGate.visible = false;
    tribe.setWorld(jungle); friend.setWorld(jungle); babies.setWorld(jungle);
    jungle.setTime(time, 0);
    ctx.setWorld(jungle);
    FX("setGround", jungle.heightAt, groundWater);
    jungle.setZone("camp", true);
    place = "jungle";
  }
  function toGrove(light) {
    leaveWorld(grove);
    grove.reset();
    grove.group.add(tribe.group, friend.group, babies.group);
    for (const b of beams) grove.group.add(b);
    tribe.setWorld(grove); friend.setWorld(grove); babies.setWorld(grove);
    grove.setLight(light || "dusk", 0);
    ctx.setWorld(grove);
    grove.setLight(light || "dusk", 0);
    FX("setGround", grove.heightAt, null);
    place = "grove";
  }
  function tribeLite(on) {
    tribe.maxFull = on ? 3 : 4;
    for (const k in mem) {
      const g = mem[k] && mem[k].body && mem[k].body.group;
      if (!g) continue;
      g.traverse((o) => { if (o.isMesh) { if (o.userData.l13Shadow === undefined) o.userData.l13Shadow = o.castShadow; o.castShadow = on ? false : o.userData.l13Shadow; } });
    }
  }
  function camp(mood, burraSits) {
    tribeLite(true);
    if (tribe.village) { tribe.village.populate(burraSits === false ? (mood === "alarm" ? [] : J.spots.slice(0, 12)) : J.spots); tribe.village.setMood(mood || "calm", 0); }
    for (const k in mem) mem[k].visible = false;
    if (burraSits !== false) { mem.burra.visible = true; mem.burra.place(J.elder.x, J.elder.z, J.elder.yaw || PI); mem.burra.do("sit", { at: { x: J.elder.x, z: J.elder.z } }); }
  }
  function jungleBase(time, mood, elder) {
    toJungle(time);
    camp(mood, elder);
    ctx.gear.clear();
    walkSpeed();
    friend.visible = true;
    A("jungleAmbience", true, time === "night" ? "night" : time === "dusk" ? "dusk" : "day");
  }
  function fightKit(n) {
    wearGear();
    walkSpeed(1.1);
    ab.buttons({ sting: true, slap: true });
    ctx.health.enable({ max: n || 5, hearts: true, regen: 0.25, regenDelay: 5, label: "Health" });
    ab.scream.enable({ chargeTime: 0.8, minCharge: 0.2, cooldown: 2.2 });
    ab.scream.onStart = () => { if (platypus.screamCharge) platypus.screamCharge(0.02); };
    ab.scream.onCharge = (f) => { if (platypus.screamCharge) platypus.screamCharge(f); A("screamCharge", f); };
    ab.scream.onCancel = ab.scream.onFizzle = () => { if (platypus.screamCharge) platypus.screamCharge(0); A("screamCharge", 0); };
    ab.scream.onRelease = onScream;
  }

  // =====================================================================================================
  // PART 1 - the woods, the ambush, the den
  // =====================================================================================================
  function start() {
    const g = gen;
    cinema.titleCard({ kicker: "LEVEL 13", title: meta.title }, () => { if (g !== gen || step !== "intro") return; recap(); });
  }
  function recap() {
    jungleBase("night", "sleep");
    step = "intro";
    if (tribe.village) tribe.village.setMood("sleep", 0);
    mem.moss.visible = true; mem.moss.place(J.bed.x + 1.6, J.bed.z + 0.4, 2); mem.moss.do("sleep", { at: { x: J.bed.x + 1.6, z: J.bed.z + 0.4, yaw: 2 } });
    friend.visible = false;
    player.teleport(J.bed.x, J.bed.z, J.bed.yaw || 2.4);
    cinema.tint("night", 0.5);
    M("play", "woods", { at: "now", intensity: 0.2 });
    const g = gen, b = J.bed;
    cinema.play([
      { fade: "clear", dur: 1.6 },
      { shot: { pos: [b.x - 3, gy(b.x, b.z) + 2.2, b.z - 3], look: [b.x, gy(b.x, b.z) + 0.3, b.z], fov: F(42), to: { pos: [b.x - 2, gy(b.x, b.z) + 1.5, b.z - 2] }, dur: 5, ease: "inOut" }, hold: false },
      { caption: "In the middle of the night, Pip was gone.", dur: 2.8, narr: true },
      { call: () => { A("wolfHowl", J.camp.x + 8, 120, 1); } },
      { caption: "Wolves howled in the woods.", dur: 2.6, narr: true },
      { call: () => { mem.moss.emote("curious"); } },
      { caption: "Moss stirs... but you let him sleep. You go alone.", dur: 3, narr: true },
      { fade: "black", dur: 1 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startWoods(); } });
  }
  function woodsCheckpoint(id, p, label, silent, restore) { ctx.checkpoint.set(id, { x: p.x, z: p.z, yaw: p.yaw || 0, label, silent: !!silent, restore }); }
  function startWoods() {
    hardStop();
    toWoods();
    fightKit(5);
    step = "woods";
    player.teleport(W.enter.x, W.enter.z, 0);
    cam.yaw = 0;
    woodsCheckpoint("woods", W.enter, "The dark woods", true, () => { woods.wolves.reset(); });
    M("play", "woods", { at: "now", intensity: 0.3 });
    bed("owl"); bed("forestNight", 0.7); bed("cricketNight", 0.5);
    trailZ = W.enter.z + 18; woods.setTrail(trailZ);
    player.enabled = true;
    ui.showHud(true);
    objective("woods", "Follow Pip's trail", "the glowing pawprints · into the dark");
    setHints("Follow the faint glowing pawprints along the path.", "The trail goes north, deeper into the trees. Keep to the path.");
    cinema.fade("clear", 1.2);
    later(1.4, () => cinema.caption("[Pip... I'm coming.]", 2.4, { who: "You" }));
  }
  function updateWoodsTrail() {
    if (player.z + 22 > trailZ) { trailZ = player.z + 22; woods.setTrail(trailZ); }
    const P = W.path; let nx = null;
    for (const p of P) if (p.z > player.z + 3) { nx = p; break; }
    if (nx && step === "woods") setGoal(nx.x, nx.y, nx.z, 0xc8d8ff);
    if (scared < 2 && player.z > W.scares[scared].z - 8) { woods.scare(scared); A("owl"); scared++; if (scared === 1) cinema.caption("Eyes in the dark... and then nothing.", 2.4, { narr: true }); }
  }
  function updateWoods() {
    if (cinema.playing) return;
    updateWoodsTrail();
    if (player.z > W.ambushAt.z) beginAmbush();
  }
  // ---- the ambush
  function startAmbush() {
    hardStop();
    toWoods();
    fightKit(5);
    player.teleport(W.ambushAt.x, W.ambushAt.z - 5, 0);
    cam.yaw = 0;
    trailZ = W.ambushAt.z + 20; woods.setTrail(trailZ);
    M("play", "woods", { at: "now", intensity: 0.4 });
    player.enabled = true;
    ui.showHud(true);
    cinema.fade("clear", 0.6);
    beginAmbush();
  }
  // after a few restarts at the same fight the wolves telegraph longer and rest longer (LEVELS2.md A2: levels ease off)
  function wolfEase() { const t = ctx.checkpoint.tries || 0; woods.wolves.ease = t >= 6 ? 1 : t >= 3 ? 0.5 : 0; }
  function spawnAmbush() { woods.wolves.reset(); wolfEase(); kos = 0; woods.wolves.spawn(3, W.ambush); }
  function beginAmbush() {
    step = "ambush";
    clearGoal();
    spawnAmbush();
    woods.wolves.onKO = () => { kos++; progressed(); objective("amb" + kos, "Drive off the wolves " + kos + "/3", ambKeys()); if (kos >= 3) ambushWon(); };
    ctx.checkpoint.set("ambush", { x: player.x, z: player.z, yaw: 0, label: "Wolves!", restore: () => { spawnAmbush(); objKey = ""; objective("amb0", "Drive off the wolves 0/3", ambKeys()); } });
    M("play", "combat", { at: "bar", intensity: 0.6 });
    A("wolfGrowl");
    objective("amb0", "Drive off the wolves 0/3", ambKeys());
    setHints(keyHint("Scream to scare them (R)! Then Sting (J) or Tail Slap (L).", "Scream to scare them! Then Sting or Slap."), "Watch the red line: a wolf crouches, then lunges along it. Step aside, then hit back.");
    later(0.8, () => ui.hint(keyHint("Scream to scare them (hold R, let go)!", "Scream to scare them (hold Scream)!"), 4));
  }
  function ambKeys() { return keyHint("Scream (R) · Sting (J) · Slap (L) · dodge the red lines", "Scream · Sting · Slap · dodge the red lines"); }
  function ambushWon() {
    ui.objectiveDone();
    M("play", "woods", { at: "bar", intensity: 0.5 });
    later(1.2, () => { step = "toDen"; objective("toDen", "Follow the trail to the wolf den", "Pip is close"); });
  }
  function updateAmbush(dt) {
    combatTick(dt);
    if (step === "toDen") { updateWoodsTrail(); setGoal(W.den.x, W.den.y, W.den.z, 0xc8d8ff); if (player.z > W.den.z - 4) beginDen(true); }
  }
  // ---- the den
  function startDen() {
    hardStop();
    toWoods();
    fightKit(5);
    player.teleport(W.den.x, W.den.z - 3, 0);
    cam.yaw = 0;
    woods.setTrail(Infinity);
    M("play", "woods", { at: "now", intensity: 0.5 });
    player.enabled = true;
    ui.showHud(true);
    beginDen(false);
  }
  function denSetup() {
    woods.wolves.reset(); woods.vines.reset(); wolfEase();
    kos = 0; wave = 0; vinesCut = 0; alphaOut = false;
    friend.visible = true;
    friend.place(W.pipTree.x, W.pipTree.z, W.pipTree.yaw);
    friend.do("still");
    woods.wolves.spawn(4, W.denWolves.slice(0, 4), { passive: true });
    woods.wolves.spawn(1, [W.denWolves[4]], { alpha: true, passive: true });
  }
  function beginDen(story) {
    step = "den";
    clearGoal();
    denSetup();
    const g = gen;
    const go = () => {
      if (g !== gen) return;
      denFight();
    };
    if (!story) { cinema.fade("clear", 0.6); go(); return; }
    const c = W.camDen;
    cinema.play([
      { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: [c.look.x, c.look.y, c.look.z], fov: F(46), to: { pos: [c.pos.x + 2, c.pos.y - 0.6, c.pos.z + 3] }, dur: 5, ease: "inOut" }, hold: false },
      { caption: "The den. Pip is tied to a dead tree with vines.", dur: 2.8, narr: true },
      { call: () => { A("friendChirp", "sad", 0, 1); } },
      { caption: "[Help!]", dur: 1.6, who: "Pip" },
      { call: () => { woods.wolves.howl(); } },
      { caption: "The ALPHA and four wolves hold her.", dur: 2.4, narr: true },
    ], { skippable: true, onDone: go });
  }
  function denFight() {
    wave = 1;
    for (const w of woods.wolves.list) if (w.alive && !w.alpha) { w.state = "approach"; w.t = Math.random() * 0.6; }
    woods.wolves.onKO = onDenKO;
    woods.wolves.onHowl = () => { cinema.caption("The alpha HOWLS: two more wolves come running!", 2.4, { narr: true }); };
    ctx.checkpoint.set("den", { x: W.den.x, z: W.den.z - 3, yaw: 0, label: "The wolf den", restore: () => { denSetup(); objKey = ""; denFight(); } });
    M("play", "combat", { at: "bar", intensity: 1 });
    objective("den1", "Save Pip from the wolves", "drive them off · then the ALPHA");
    setHints(keyHint("Scream (R) when they circle you, then Sting (J) the scared ones.", "Scream when they circle, then Sting."), "The alpha is big: dodge its long charge (red line), then hit it 4 times.");
    player.enabled = true;
    ui.showHud(true);
  }
  function onDenKO(w) {
    kos++;
    progressed();
    if (w.alpha) { alphaOut = true; ui.boss.hide(); }
    if (wave === 1) {
      let left = 0; for (const q of woods.wolves.list) if (q.alive && !q.alpha) left++;
      if (left === 0) {
        wave = 2;
        const a = woods.wolves.list.find((q) => q.alive && q.alpha);
        if (a) { a.state = "approach"; a.t = 0.8; A("wolfHowl", W.denCenter.x, W.denCenter.z, 1); ui.boss.show("THE ALPHA", 1); ui.boss.set(clamp(a.hp / a.max, 0, 1)); objective("den2", "Drive off the ALPHA", "dodge its charge · hit it when it stops"); }
      }
    }
    if (wave === 2 && alphaOut && woods.wolves.alive === 0) denWon();
  }
  function denWon() {
    step = "vines";
    ui.objectiveDone();
    M("play", "woods", { at: "bar", intensity: 0.4 });
    woods.wolves.onKO = null;
    later(1.0, () => { objective("vines0", "Free Pip 0/3", keyHint("Tail Slap (L) the vines", "Slap the vines")); setHints(keyHint("Stand by the tree and Tail Slap (L) each vine.", "Stand by the tree and Slap each vine."), "The three vines hold Pip to the dead tree: slap them, one by one."); });
  }
  let alphaDizzy = false;
  function updateDen(dt) {
    combatTick(dt);
    if (wave === 2) {
      const a = woods.wolves.list.find((q) => q.alpha && q.active);
      if (a) {
        ui.boss.set(clamp(a.hp / a.max, 0, 1));
        // after its long charge the alpha skids to a stop, dizzy: the window to hit it
        if (a.state === "recover" && !alphaDizzy) { alphaDizzy = true; a.t = 2.4; a.cower = 0.4; FX("stunStars", a.x, a.y + 1.2, a.z, 2.4); }
        else if (a.state !== "recover") alphaDizzy = false;
      }
    }
    if (step === "vines") {
      const p = woods.vines.pos(vinesCut < 3 ? vinesCut : 0, v1);
      setGoal(p.x, gy(p.x, p.z), p.z, 0xc8d8ff);
      setAct(nearP(W.pipTree, 2.3) ? "Cut the vine" : null, "L");
    }
  }
  function cutVine() {
    if (step !== "vines" || !nearP(W.pipTree, 2.4)) return false;
    let i = 0; while (i < 3 && woods.vines.isCut(i)) i++;
    if (i >= 3) return false;
    platypus.tailSlap(); A("tailSlapHit");
    player.lock = 0.5;
    later(platypus.slapHitTime || 0.25, () => {
      woods.vines.cut(i); vinesCut++;
      progressed();
      objective("vines" + vinesCut, "Free Pip " + vinesCut + "/3", keyHint("Tail Slap (L) the vines", "Slap the vines"));
      if (vinesCut >= 3) freePip();
    });
    return true;
  }
  function freePip() {
    ui.objectiveDone(); clearGoal(); setAct(null); setHints(null);
    player.enabled = false;
    const g = gen, pg = friend.group;
    cinema.play([
      { call: () => { friend.do("idle"); friend.emote("happy"); A("friendChirp", "happy", 0, 1); FX("hearts", v1.set(friend.x, friend.y + 0.7, friend.z), 6); M("motif", "pip", { gain: 0.9 }); } },
      { shot: { pos: [W.pipTree.x - 2.4, W.pipTree.y + 1.2, W.pipTree.z - 2.6], look: pg, lookY: 0.25, fov: F(40), dur: 5, hand: 0.4 }, hold: false },
      { caption: "Pip falls into your arms.", dur: 2.6, narr: true },
      { caption: "[You came... alone? Into the dark woods?]", dur: 2.8, who: "Pip" },
      { caption: "[Of course I did.]", dur: 2, who: "You" },
      { fade: "black", dur: 1.2 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startSleep(); } });
  }
  // ---- fighting (wolves)
  function combatTick(dt) {
    if (cd.sting > 0) { cd.sting = Math.max(0, cd.sting - dt); ui.setCooldown("sting", cd.sting / CD.sting); }
    if (cd.slap > 0) { cd.slap = Math.max(0, cd.slap - dt); ui.setCooldown("slap", cd.slap / CD.slap); }
    const w = woods.wolves.nearest(player.x, player.z, 14);
    if (w && (step === "ambush" || step === "den")) ui.setPing(ctx.bearing(w.x, w.z), 0.5, "danger"); else ui.setPing(null);
  }
  function attack(kind) {
    if (!player.enabled || platypus.acting || cd[kind] > 0) return true;
    const t = (kind === "slap" ? platypus.slapHitTime : platypus.stingHitTime) || 0.25;
    const near = woods.wolves.nearest(player.x, player.z, 3.4);
    if (near) { player.yaw = Math.atan2(near.x - player.x, near.z - player.z); player.face = player.yaw; }
    if (kind === "slap") platypus.tailSlap(); else { platypus.sting(); A("sting"); }
    cd[kind] = CD[kind];
    player.lock = Math.max(player.lock, t + 0.12);
    later(t, () => {
      const w = woods.wolves.nearest(player.x, player.z, 2.1);
      const hit = w ? woods.wolves.hit(w, kind === "slap" ? "slap" : "sting", 1) : false;
      if (kind === "slap") A(hit ? "tailSlapHit" : "tailSlap");
      if (hit) { progressed(); cinema.shake(0.015, 0.15); }
    });
    return true;
  }
  function onScream(p) {
    if (platypus.screamCharge) platypus.screamCharge(0);
    A("screamCharge", 0);
    const dur = (platypus.scream ? platypus.scream(p, true) : 0) || 0.8;
    player.lock = Math.max(player.lock, Math.min(dur, 0.9));
    later(platypus.screamTime || 0.12, () => {
      A("scream", p, true);
      FX("screamWave", player.x, player.y + 0.3, player.z, p);
      cinema.shake(0.03 + 0.04 * p, 0.6);
      if (place === "woods") { const n = woods.wolves.scream(player.x, player.z, 6 + 3 * p); if (n) progressed(); }
      if (step === "puzzle" && solved && !screamed) centreScream();
    });
  }

  // =====================================================================================================
  // PART 2 - home together, hide and seek, the grove, the rock, the tribe, the puzzle, the portal
  // =====================================================================================================
  function bedSpot() { return { x: J.bed.x, z: J.bed.z, yaw: J.bed.yaw || 2.4 }; }
  function startSleep() {
    hardStop();
    jungleBase("night", "sleep");
    step = "sleep";
    if (tribe.village) tribe.village.setMood("sleep", 0);
    const s = { x: J.bed.x + 3, z: 88.5 };
    player.teleport(s.x, s.z, PI + 0.5);
    cam.yaw = PI + 0.5;
    friend.place(s.x + 0.8, s.z + 0.6, PI);
    friend.do("follow", { dist: 0.9, side: 0.5 });
    walkSpeed(0.7);
    M("play", "lullaby", { at: "now", intensity: 0.35 });
    bed("cricketNight", 0.5);
    player.enabled = true;
    ui.showHud(true);
    const b = bedSpot();
    objective("sleep", "Go to sleep together", "the moss beds · Sleep (E)");
    setGoal(b.x, gy(b.x, b.z), b.z, 0xc8d8ff);
    setHints("Walk slowly back to the moss beds with Pip (follow the light).", "The beds are just ahead, by the burrows. Press E there.");
    cinema.fade("clear", 1.2);
    later(1.2, () => cinema.caption("You walk home slowly, Pip leaning on you.", 3, { narr: true }));
  }
  function updateSleep() { if (!cinema.playing) setAct(nearP(bedSpot(), 1.9) ? "Sleep" : null); }
  function sleepTogether() {
    setAct(null); clearGoal(); ui.objectiveDone();
    player.enabled = false;
    const b = bedSpot(), g = gen;
    const px = b.x + Math.cos(b.yaw) * 0.55, pz = b.z - Math.sin(b.yaw) * 0.55;
    cinema.play([
      { call: () => { player.walkTo(b.x, b.z, { speed: 0.5, face: b.yaw }); friend.do("sleep", { at: { x: px, z: pz, yaw: b.yaw } }); } },
      { until: () => !player.walking, max: 3 },
      { call: () => { platypus.sleep(true); A("thatchRustle"); } },
      { shot: { pos: [b.x + 2.2, gy(b.x, b.z) + 2, b.z + 1.2], look: [b.x, gy(b.x, b.z) + 0.2, b.z], fov: F(38), to: { pos: [b.x + 1.4, gy(b.x, b.z) + 1.4, b.z + 0.8] }, dur: 6, ease: "inOut" }, hold: false },
      { wait: 2 },
      { call: () => { A("snore", "pip"); FX("zzz", v1.set(friend.x, friend.y + 0.5, friend.z)); } },
      { caption: "Together again. Safe.", dur: 2.6, narr: true },
      { fade: "black", dur: 1.8 },
      { card: { kicker: "", title: "The next morning", hold: 1.4 } },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startMorning(); } });
  }
  // ---- morning: hide and seek
  const HIDE = [{ x: 28.4, z: 65.6, yaw: 0.5 }, { x: 30.6, z: 84.4, yaw: PI }, { x: 9.2, z: 84.6, yaw: 2.8 }];
  function startMorning() {
    hardStop();
    jungleBase("dawn", "calm", step === "build" ? undefined : false);
    step = "morning";
    const c = J.camp;
    player.teleport(c.x - 1, c.z - 3, 0.3);
    cam.yaw = 0.3;
    friend.place(c.x + 1, c.z - 1, PI);
    ctx.checkpoint.set("morning", { x: c.x - 1, z: c.z - 3, yaw: 0.3, silent: true });
    M("play", "chill", { at: "now", intensity: 0.6 });
    bed("morningBirds", 0.8);
    friend.onEvent = onFriend;
    ui.showHud(true);
    ui.setQuests([{ id: "hide", text: "Find Pip 0/3", current: true }], "Hide and seek");
    setHints("Listen for Pip's giggles and look behind things. Press E when you find her.", "Pip hides near the edge of the camp: by the food store, the lookout, the burrows.");
    cinema.fade("clear", 1.2);
    later(0.6, () => cinema.caption("[Let's play hide and seek! You count!]", 2.4, { who: "Pip" }));
    later(2.8, nextHide);
  }
  function nextHide() {
    if (step !== "morning") return;
    hideStage = 1; hideT = 0;
    hideSpot = HIDE[hides];
    player.enabled = false;
    cinema.fade("black", 0.5, () => {
      friend.place(hideSpot.x, hideSpot.z, hideSpot.yaw);
      friend.do("hide", { spot: hideSpot });
      ui.hint("One... two... three... READY OR NOT!", 2.2);
      later(1.6, () => { cinema.fade("clear", 0.6); player.enabled = true; hideStage = 2; objective("hide" + hides, "Play hide and seek with Pip " + hides + "/3", "listen for her giggles · Found you (E)"); });
    });
  }
  function onFriend(type) {
    if (step === "morning" && type === "found") {
      hides++;
      progressed();
      ui.setQuest("hide", { text: "Find Pip " + hides + "/3", done: hides >= 3 });
      A("friendChirp", "giggle", 0, 1);
      FX("hearts", v1.set(friend.x, friend.y + 0.7, friend.z), 3);
      if (hides >= 3) { ui.objectiveDone(); later(1.6, afternoon); } else later(1.8, nextHide);
    }
  }
  function updateMorning(dt) {
    if (cinema.playing || hideStage !== 2) { setAct(null); return; }
    hideT += dt;
    const near = dist2(player.x, player.z, friend.x, friend.z) < 1.7;
    setAct(near ? "Found you!" : null);
    if (hideT > 45) setGoal(hideSpot.x, gy(hideSpot.x, hideSpot.z), hideSpot.z, 0xffd080);
    if (hideT > 20 && ((hideT * 10) | 0) % 50 === 0) ui.setPing(ctx.bearing(friend.x, friend.z), 0.6, "sound");
  }
  function foundPip() { if (friend.found()) { hideStage = 3; setAct(null); clearGoal(); ui.setPing(null); A("friendChirp", "happy", 0, 1); } }
  function afternoon() {
    const g = gen;
    cinema.play([{ fade: "black", dur: 1 }, { card: { kicker: "", title: "That afternoon", hold: 1.2 } }], { skippable: true, release: null, onDone: () => { if (g === gen) startGrove(); } });
  }
  // ---- the grove: follow Pip past the red threads
  function groveBase(light) {
    toGrove(light);
    ctx.gear.clear();
    walkSpeed();
    friend.visible = true;
    tribeLite(true);
    for (const k in mem) mem[k].visible = false;
  }
  function startGrove() {
    hardStop();
    groveBase("afternoon");
    step = "grove";
    player.teleport(G.start.x, G.start.z, 0);
    cam.yaw = 0;
    friend.place(G.start.x + 0.8, G.start.z + 2, 0);
    friend.onEvent = (type) => { if (type === "arrived" && step === "grove") groveArrived = true; };
    friend.do("lead", { route: G.route, waitDist: 6, run: false });
    ctx.checkpoint.set("grove", { x: G.start.x, z: G.start.z, yaw: 0, silent: true });
    M("play", "chill", { at: "now", intensity: 0.5 });
    bed("morningBirds", 0.4);
    player.enabled = true;
    ui.showHud(true);
    objective("grove", "Follow Pip!", "over the logs (jump) · stay close");
    setHints("Follow Pip along the path. Jump (Space) over the fallen logs.", "Pip waits for you when you fall behind. Follow her into the old trees.");
    cinema.fade("clear", 1.2);
    later(1.0, () => cinema.caption("[Follow me! I want to show you something!]", 2.4, { who: "Pip" }));
    grove.setLight("dusk", 45);
  }
  function updateGrove() {
    if (cinema.playing) return;
    setGoal(friend.x, gy(friend.x, friend.z), friend.z, 0xffd080);
    if (!threadsSeen && player.z > G.threads.z - 3) {
      threadsSeen = true;
      cinema.caption("[Never past the red threads.]", 2.8, { who: "Old Burra (a memory)" });
      later(3, () => cinema.caption("[Shh, just a peek!]", 2.2, { who: "Pip" }));
      M("play", "farlands", { at: "bar", intensity: 0.2 });
      M("setDetune", 3, 6);
    }
    if (groveArrived && nearP(G.court, 4)) rockReveal();
  }
  function rockReveal() {
    step = "reveal1";
    setAct(null); clearGoal(); setHints(null); ui.objectiveDone();
    player.enabled = false;
    grove.setLight("dusk", 2);
    const g = gen, c = G.camRock;
    cinema.play([
      { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: [c.look.x, c.look.y, c.look.z], fov: F(48), to: { pos: [c.pos.x - 2, c.pos.y + 0.6, c.pos.z + 3] }, dur: 6, ease: "inOut" }, hold: false },
      { caption: "At the end of the day, deep in the old grove...", dur: 2.6, narr: true },
      { call: () => { grove.letters(1, 2); A("runeHum", 0, true); M("stinger", "discover"); } },
      { wait: 1.6 },
      { caption: "Letters glow in the stone: FAR LANDS PORTAL.", dur: 3, narr: true },
      { caption: "[We have to show everyone!]", dur: 2.2, who: "Pip" },
    ], { skippable: true, onDone: () => { if (g === gen) beginShow(); } });
  }
  // ---- show the tribe
  function startShow() {
    hardStop();
    groveBase("dusk");
    grove.letters(1);
    player.teleport(G.court.x, G.court.z - 1, PI);
    cam.yaw = PI;
    friend.place(G.court.x + 1, G.court.z, PI);
    M("play", "farlands", { at: "now", intensity: 0.25 });
    player.enabled = true; ui.showHud(true);
    cinema.fade("clear", 0.6);
    beginShow();
  }
  function beginShow() {
    step = "show";
    called = false;
    friend.do("follow", { dist: 1.3, side: 0.7 });
    player.enabled = true;
    objective("show", "Show the rock to the tribe", "run back to camp (south)");
    setGoal(G.exit.x, gy(G.exit.x, G.exit.z), G.exit.z + 1, 0xffd080);
    setHints("Run back along the path to the camp (follow the light).", "The way home is south, back over the logs and the red threads.");
  }
  function updateShow() {
    if (cinema.playing) return;
    if (place === "grove" && player.z < G.exit.z + 2 && player.enabled) {
      player.enabled = false;
      const g = gen;
      cinema.fade("black", 0.5, () => { if (g === gen) showCamp(); });
    }
    if (place === "jungle") setAct(nearP(J.fire, 2.6) && !called ? "Call the tribe" : null);
  }
  function showCamp() {
    toJungle("dusk");
    camp("calm");
    friend.visible = true;
    A("jungleAmbience", true, "dusk");
    player.teleport(J.campEdge.x, J.campEdge.z, 0.6);
    cam.yaw = 0.6;
    friend.place(J.campEdge.x - 0.8, J.campEdge.z - 0.6, 0.6);
    friend.do("follow", { dist: 1.3, side: 0.7 });
    objective("call", "Call the tribe at the fire", "Call (E)");
    setGoal(J.fire.x, gy(J.fire.x, J.fire.z), J.fire.z, 0xffd080);
    player.enabled = true;
    cinema.fade("clear", 0.6);
  }
  function callTribe() {
    called = true; setAct(null); clearGoal(); ui.objectiveDone();
    player.enabled = false;
    const g = gen;
    cinema.play([
      { call: () => { platypus.trick && platypus.trick("wave"); A("crowdCheer", 0.4); if (tribe.village) { tribe.village.setMood("curious", 0.5); tribe.village.gather(J.fire.x, J.fire.z, 5); } } },
      { shot: { pos: [J.fire.x - 6, gy(J.fire.x, J.fire.z) + 3, J.fire.z - 6], look: [J.fire.x, 1.2, J.fire.z], fov: F(48), dur: 4 }, hold: false },
      { caption: "[Everyone! Come and see! In the old grove!]", dur: 2.6, who: "You" },
      { caption: "Lanterns are lit. The whole tribe follows you into the dusk.", dur: 3, narr: true },
      { fade: "black", dur: 1 },
      { call: () => groveTribe("show") },
      { fade: "clear", dur: 1 },
      { shot: { pos: [4, 1.8, G.centre.z - 8], look: [0, 2.4, G.rock.z], fov: F(50), to: { pos: [2, 1.4, G.centre.z - 4] }, dur: 7, ease: "inOut" }, hold: false },
      { call: () => { A("crowdMurmur", 0.5); mem.burra.do("goto", { x: G.rock.x - 1.2, z: G.rock.z - 1.6, yaw: 0 }); } },
      { caption: "They murmur. OLD BURRA, the oldest, steps forward and touches the letters.", dur: 3.4, narr: true },
      { caption: "[The Far Lands. Only a god can go there and come back alive.]", dur: 3.6, who: "Old Burra" },
      { call: () => { mem.rok.emote("laugh"); mem.nib.do("goto", { x: mem.tika.x - 0.4, z: mem.tika.z - 0.8 }); mem.nib.emote("scared"); } },
      { caption: "Rok laughs nervously. Nib hides behind Tika.", dur: 2.6, narr: true },
    ], { skippable: true, onSkip: () => groveTribe("show"), onDone: () => { if (g === gen) beginPuzzle(); } });
  }
  // the tribe stands round the court, exactly the same every time (the reveal depends on it)
  function groveTribe(mode) {
    if (place !== "grove") { toGrove("dusk"); ctx.gear.clear(); }
    grove.letters(1);
    tribeLite(true);
    if (tribe.village) { tribe.village.populate(grove.spots); tribe.village.setMood("curious", 0); tribe.village.lookAt(mode === "reveal" ? platypus.group : null); }
    for (const k in mem) mem[k].visible = false;
    const put = (m, x, z) => { m.visible = true; m.place(x, z, Math.atan2(-x, G.centre.z - z)); m.do("idle"); };
    put(mem.burra, -2.4, G.centre.z - 6.8); put(mem.rok, 3.2, G.centre.z - 7.4); put(mem.tika, -4.4, G.centre.z - 6.6); put(mem.nib, -5.0, G.centre.z - 7.6);
    friend.visible = true;
    walkSpeed();
    M("play", "farlands", { at: "now", intensity: 0.4 });
  }
  // ---- the puzzle
  function startPuzzle() {
    hardStop();
    groveTribe("show");
    player.teleport(2.6, G.centre.z - 3.2, -0.3);
    cam.yaw = 0;
    friend.place(1, G.centre.z - 5, 0);
    player.enabled = true; ui.showHud(true);
    cinema.fade("clear", 0.6);
    beginPuzzle();
  }
  function beginPuzzle() {
    step = "puzzle";
    grove.puzzle.scramble();
    grove.setStoneGlow(true);
    solved = false; screamed = false; puzzleT = 0; nudged = -1;
    friend.do("idle");
    ctx.checkpoint.set("puzzle", { x: 0, z: G.centre.z - 4, yaw: 0, silent: true });
    ab.buttons({ slap: true });
    ab.scream.enable({ chargeTime: 0.8, minCharge: 0.2, cooldown: 1.2 });
    ab.scream.onCharge = (f) => { if (platypus.screamCharge) platypus.screamCharge(f); A("screamCharge", f); };
    ab.scream.onCancel = ab.scream.onFizzle = () => { if (platypus.screamCharge) platypus.screamCharge(0); A("screamCharge", 0); };
    ab.scream.onRelease = onScream;
    grove.puzzle.onTurn = onStoneTurn;
    M("play", "farlands", { at: "bar", intensity: 0.55 });
    player.enabled = true; ui.showHud(true);
    objective("puzzle", "Solve the rock's puzzle", keyHint("turn a stone: Tail Slap (L) or E", "turn a stone: Slap or tap"));
    ui.setQuests([{ id: "riddle", text: "the sun sleeps, the moon wakes,", current: true }, { id: "riddle2", text: "the stars dance, the river runs home" }], "On the rock");
    setHints("Read the rock: sun, moon, star, wave. Turn each stone until its picture faces the middle.", "The sun sets in the WEST: west stone = sun, north = moon, east = star, south = wave.");
    later(0.8, () => cinema.caption("[The sun sleeps, the moon wakes, the stars dance, the river runs home.]", 4, { who: "Old Burra (reading)" }));
  }
  function nearestStone(r) { let b = null, bd = r || 2.2; for (const s of grove.stones) { const d = dist2(player.x, player.z, s.x, s.z); if (d < bd) { bd = d; b = s; } } return b; }
  function turnStone() {
    const s = nearestStone(2.2);
    if (!s) return false;
    if (step === "puzzle" && solved) return false;
    platypus.tailSlap(); A("tailSlap");
    player.lock = 0.45;
    later(platypus.slapHitTime || 0.25, () => s.turn());
    return true;
  }
  function onStoneTurn(s) {
    progressed();
    if (step === "puzzle") {
      const ok = s.face === ANSWER[s.i];
      grove.lines(s.i, ok ? 0.8 : 0);
      if (ok) { A("runeHum", s.i, true); mem.nib.emote("cheer"); ui.hint(FACES[s.face].toUpperCase() + "! That one glows.", 1.6); }
      if (grove.puzzle.matched && !solved) {
        solved = true;
        ui.objectiveDone(); ui.setQuests(null);
        grove.allLines(1); grove.centre(0.8);
        M("stinger", "discover");
        later(1.0, () => { objective("scream", "Stand in the centre and SCREAM", keyHint("hold R, let go", "hold Scream, let go")); setGoal(0, gy(0, G.centre.z), G.centre.z, 0xc8a0ff); setHints("Stand on the round stone in the middle, then hold R and let go.", "The middle of the court: the glowing ring. Scream there!"); });
      }
    } else if (step === "close") {
      if (!closeTurned[s.i]) { closeTurned[s.i] = true; let n = 0; for (const t of closeTurned) if (t) n++; grove.lines(s.i, 0); grove.portal.dim(1 - n * 0.2); A("stoneTurn"); objective("close" + n, "Close the portal: turn the stones back " + n + "/4", keyHint("Tail Slap (L) or E", "Slap or tap a stone")); if (n >= 4) { closeReady = true; ui.objectiveDone(); later(0.8, () => { objective("slap", "Tail Slap the rock to close it", keyHint("L", "Slap")); setGoal(G.rock.x, gy(G.rock.x, G.rock.z), G.rock.z - 1.6, 0xc8a0ff); }); } }
    }
  }
  function updatePuzzle(dt) {
    if (cinema.playing) return;
    puzzleT += dt;
    if (!solved) {
      const s = nearestStone(2.2);
      setAct(s ? "Turn the stone" : null);
      if (puzzleT > 45 && ((puzzleT * 4) | 0) % 24 === 0) for (let i = 0; i < 4; i++) { const st = grove.stones[i]; FX("sparkle", v1.set(st.x, 0.6, st.z), 0xffe08a, 3); }
      if (puzzleT > 90) {
        let wrong = -1; for (let i = 0; i < 4; i++) if (grove.stones[i].face !== ANSWER[i]) { wrong = i; break; }
        if (wrong >= 0 && wrong !== nudged) { nudged = wrong; const st = grove.stones[wrong]; friend.do("goto", { x: st.x + (st.x > 0 ? 1.1 : st.x < 0 ? -1.1 : 0), z: st.z + (st.x === 0 ? (st.z > G.centre.z ? 1.1 : -1.1) : 0) }); friend.emote("call"); setGoal(st.x, 0, st.z, 0xffe08a); }
      }
    } else setAct(null);
  }
  function centreScream() {
    if (dist2(player.x, player.z, 0, G.centre.z) > 1.5) { ui.hint("Stand ON the glowing ring in the middle first!", 2.4); return; }
    screamed = true;
    clearGoal(); setHints(null); ui.objectiveDone();
    player.enabled = false;
    const g = gen;
    cinema.play([
      { shake: 0.04, dur: 1.2 },
      { shot: { pos: [3, 1.6, G.centre.z - 2], look: [0, 1.8, G.rock.z], fov: F(46), dur: 5 }, hold: false },
      { call: () => { grove.portal.open(2.4); A("rockCrack"); A("rockGrind", 0.8); M("stinger", "discover"); A("crowdGasp"); } },
      { wait: 1.5 },
      { caption: "The rock splits... and the PORTAL opens.", dur: 3, narr: true },
      { call: () => M("play", "farlands", { at: "bar", intensity: 0.7 }) },
    ], { skippable: true, onSkip: () => grove.portal.set(1), onDone: () => { if (g === gen) beginEnter(); } });
  }
  // ---- enter the portal
  function startEnter() {
    hardStop();
    groveTribe("show");
    grove.puzzle.solveAll(); grove.allLines(1); grove.centre(0.8); grove.portal.set(1);
    player.teleport(0, G.centre.z, 0); cam.yaw = 0;
    friend.place(1.2, G.centre.z - 1.2, 0);
    player.enabled = true; ui.showHud(true);
    cinema.fade("clear", 0.6);
    beginEnter();
  }
  function beginEnter() {
    step = "enter";
    M("play", "farlands", { at: "bar", intensity: 0.7 });
    bed("portalHum", 0.6);
    player.enabled = true;
    objective("enter", "Enter the portal", "walk into the swirling light");
    setGoal(G.portal.x, gy(G.portal.x, G.portal.z), G.portal.z, 0xc8a0ff);
    setHints("Walk into the swirling purple light by the rock.");
  }
  function updateEnter() {
    if (cinema.playing || !player.enabled) return;
    if (dist2(player.x, player.z, G.portal.x, G.portal.z) < 1.3) knockOut();
  }
  function knockOut() {
    player.enabled = false;
    clearGoal(); ui.objectiveDone(); setHints(null);
    const g = gen;
    cinema.play([
      { fade: "white", dur: 0.25 },
      { call: () => { A("portalKnock"); player.teleport(G.land.x, G.land.z, 0); if (platypus.collapse) platypus.collapse(); } },
      { fade: "clear", dur: 0.6 },
      { shot: { pos: [2.2, gy(G.land.x, G.land.z) + 1.2, G.land.z - 2.4], look: platypus.group, lookY: 0.2, fov: F(42), dur: 5, hand: 0.5 }, hold: false },
      { call: () => { for (let i = 0; i < 6; i++) later(i * 0.25, () => FX("sparkle", v1.set(G.land.x + Math.sin(i * 1.1) * 0.35, gy(G.land.x, G.land.z) + 0.6, G.land.z + Math.cos(i * 1.1) * 0.35), 0xffffa0, 3)); A("crowdGasp"); } },
      { caption: "A flash... and you are knocked back out onto the grass.", dur: 3, narr: true },
      { call: () => { if (platypus.revive) platypus.revive(); } },
      { caption: "[Nothing happened?]", dur: 2, who: "You" },
      { caption: "[Hm. Not a god, then.]", dur: 2.4, who: "Old Burra" },
      { call: () => { setIllusion(1, 3); } },
      { caption: "Everyone goes home. Night falls... quickly.", dur: 2.8, narr: true },
      { fade: "black", dur: 1.2 },
      { card: { kicker: "", title: "The next morning", hold: 1.4 } },
    ], { skippable: true, release: null, onSkip: () => setIllusion(1), onDone: () => { if (g === gen) startBabies(); } });
  }

  // =====================================================================================================
  // PART 3 - (inside the illusion) the babies, the robots, the chase, back through the portal
  // =====================================================================================================
  const NEST = { x: 16.5, z: 81.5 };
  function babyHome(b) { return { x: NEST.x + (b.i - 1) * 0.7, z: NEST.z - 0.6 }; }
  function startBabies() {
    hardStop();
    jungleBase("dawn", "calm", step === "build" ? undefined : false);
    setIllusion(1);
    step = "babies";
    babies.show(true);
    babies.reset(); babies.show(true);
    for (const b of babies.list) { const h = babyHome(b); babies.place(b, h.x, h.z, PI); }
    friend.place(NEST.x, NEST.z + 0.6, PI);
    friend.do("sit", { at: { x: NEST.x, z: NEST.z + 0.6 } });
    player.teleport(NEST.x + 0.5, NEST.z - 3.5, 0);
    cam.yaw = 0;
    // the food basket: three grubs by the food store
    for (let i = 0; i < 3; i++) { const p = { x: J.foodStore.x + 1.2 + i * 0.4, z: J.foodStore.z + 1.0 }; tribe.food.place(i, p.x, p.z, "grub"); foodBasket.push(p); }
    ctx.checkpoint.set("babies", { x: player.x, z: player.z, yaw: 0, silent: true });
    M("play", "lullaby", { at: "now", intensity: 0.5 });
    bed("morningBirds", 0.6);
    const g = gen;
    cinema.play([
      { fade: "clear", dur: 1.4 },
      { shot: { pos: [NEST.x + 2.2, gy(NEST.x, NEST.z) + 1.3, NEST.z - 2.2], look: [NEST.x, gy(NEST.x, NEST.z) + 0.2, NEST.z], fov: F(40), to: { pos: [NEST.x + 1.4, gy(NEST.x, NEST.z) + 0.9, NEST.z - 1.6] }, dur: 7, ease: "inOut" }, hold: false },
      { caption: "The next day, Pip has a surprise...", dur: 2.4, narr: true },
      { call: () => { M("stinger", "babies"); for (let i = 0; i < 3; i++) later(0.35 * i, () => { A("babyChirp", i); babies.list[i].hop = 1; }); } },
      { caption: "BABIES! Pebble, Fern and Dot.", dur: 2.8, narr: true },
      { call: () => { if (tribe.village) { tribe.village.setMood("cheer", 0.4); } A("crowdCheer", 0.7); } },
      { caption: "[Will you help me take care of them?]", dur: 2.6, who: "Pip" },
    ], { skippable: true, onDone: () => { if (g === gen) beginCare(); } });
  }
  function beginCare() {
    step = "babies";
    if (tribe.village) tribe.village.setMood("calm", 1);
    M("play", "chill", { at: "bar", intensity: 0.5 });
    babies.showNeeds(true);
    player.enabled = true; ui.showHud(true);
    objective("care", "Take care of the babies", "feed · wash · play · rock to sleep");
    careQuests();
    setHints("Look at the little pictures over each baby: food, water drop, heart, Zz.", "Food: grubs from the basket by the food store. Water: carry a baby to the creek. Heart: tickle (E). Zz: hold E.");
  }
  function careQuests() {
    const row = (b) => { let n = 0; for (const k of NEEDS) if (b.need[k] >= 1) n++; return { id: b.name, text: b.name + " " + n + "/4", done: n >= 4, current: n < 4 }; };
    ui.setQuests(babies.list.map(row), "The babies");
  }
  function babyNear(r) { let b = null, bd = r || 1.3; for (const q of babies.list) { if (q.carried) continue; const d = dist2(player.x, player.z, q.x, q.z); if (d < bd) { bd = d; b = q; } } return b; }
  const CREEK = { x: 28.6, z: 79 };
  function careAction() {
    // what E would do here, now
    if (careHeld && careHeld.kind === "grub") { const b = babyNear(1.5); return b && b.need.hunger < 1 ? { a: "Feed " + b.name, b } : null; }
    if (careHeld && careHeld.kind === "baby") return dist2(player.x, player.z, CREEK.x, CREEK.z) < 2.6 ? { a: "Wash " + careHeld.b.name, b: careHeld.b } : null;
    const b = babyNear(1.4);
    if (b) {
      if (b.need.clean < 1) return { a: "Pick up " + b.name, b, k: "lift" };
      if (b.need.happy < 1) return { a: "Tickle " + b.name, b, k: "tickle" };
      if (b.need.hunger < 1) return null;
      if (b.need.sleepy < 1) return { a: "Rock " + b.name + " (hold E)", b, k: "rock" };
    }
    for (let i = 0; i < 3; i++) if (tribe.food.active(i) && dist2(player.x, player.z, foodBasket[i].x, foodBasket[i].z) < 1.4) return { a: "Take a grub", i, k: "grub" };
    return null;
  }
  let careNow = null;
  function careAct() {
    const c = careNow;
    if (!c) return;
    progressed();
    if (c.k === "grub") { tribe.food.carry(c.i, platypus.holdAnchor); careHeld = { kind: "grub", i: c.i }; A("pickup"); }
    else if (careHeld && careHeld.kind === "grub" && c.b) {
      tribe.food.carry(careHeld.i, null); tribe.food.place(careHeld.i, foodBasket[careHeld.i].x, foodBasket[careHeld.i].z, "grub");
      careHeld = null; c.b.need.hunger = 1; c.b.body.eat && c.b.body.eat(); A("eatCrunch"); A("babyChirp", c.b.i); c.b.hop = 1;
    } else if (c.k === "lift") {
      careHeld = { kind: "baby", b: c.b }; c.b.carried = true;
      platypus.holdAnchor.add(c.b.group); c.b.group.position.set(0, 0.02, 0.04); c.b.group.rotation.set(0, 0, 0);
      A("babyCry", c.b.i);
      ui.hint("Carry " + c.b.name + " to the creek to wash!", 2.2);
      setGoal(CREEK.x, gy(CREEK.x, CREEK.z), CREEK.z, 0x9adfff);
    } else if (careHeld && careHeld.kind === "baby") {
      const b = careHeld.b; careHeld = null; b.carried = false;
      jungle.group.add(b.group); babies.place(b, CREEK.x - 1.2, CREEK.z, -PI / 2);
      b.need.clean = 1; FX("splash", CREEK.x - 0.6, gy(CREEK.x, CREEK.z), CREEK.z, 0.5); A("splashSmall"); A("babyChirp", b.i);
      const h = babyHome(b); babies.goTo(b, h.x, h.z, 1.0); clearGoal();
    } else if (c.k === "tickle") { c.b.need.happy = Math.min(1, c.b.need.happy + 0.3); c.b.hop = 1; A("friendChirp", "giggle", 0, 0.9); FX("hearts", v1.set(c.b.x, c.b.y + 0.4, c.b.z), 2); }
    careQuests();
  }
  function updateCare(dt) {
    if (cinema.playing) return;
    babyChirpT -= dt;
    if (babyChirpT <= 0) { babyChirpT = 2 + Math.random() * 3; const i = (Math.random() * 3) | 0; if (Math.random() < 0.125) A("robotBeep", i); else A("babyChirp", i); }
    for (const b of babies.list) if (!b.carried && b.need.clean >= 1 && Math.random() < dt * 0.15 && !b.asleep && !(careNow && careNow.b === b) && dist2(b.x, b.z, player.x, player.z) > 2.2) { const h = babyHome(b); babies.goTo(b, h.x + (Math.random() - 0.5), h.z + (Math.random() - 0.5), 0.6); }
    careNow = careAction();
    setAct(careNow ? careNow.a : null);
    if (careNow && careNow.k === "rock" && ctx.input.held("interact")) {
      careRockT += dt;
      ui.setCharge(careRockT / 3, "Rocking...");
      if (careRockT >= 3) { const b = careNow.b; b.need.sleepy = 1; b.asleep = true; if (b.body.sleep) b.body.sleep(true); A("snore", "baby"); careRockT = 0; ui.setCharge(null); careQuests(); progressed(); M("motif", "pip", { gain: 0.4 }); }
    } else if (careRockT > 0) { careRockT = 0; ui.setCharge(null); }
    if (!careDone && babies.allFull) {
      careDone = true; ui.objectiveDone(); setAct(null); babies.showNeeds(false);
      player.enabled = false;
      const g = gen;
      cinema.play([
        { caption: "Three full, clean, happy, sleepy babies.", dur: 2.6, narr: true },
        { tint: "night", opacity: 0.4 },
        { caption: "The day goes by in a blink. Night falls... too fast.", dur: 2.8, narr: true },
        { fade: "black", dur: 1.2 },
        { card: { kicker: "", title: "The next day", hold: 1.4 } },
      ], { skippable: true, release: null, onDone: () => { if (g === gen) startRobots(); } });
    }
  }
  // ---- the robots
  function startRobots() {
    hardStop();
    jungleBase("dawn", "calm", step === "build" ? undefined : false);
    setIllusion(1);
    step = "robots";
    babies.reset(); babies.show(true);
    const c = J.camp;
    for (const b of babies.list) babies.place(b, c.x - 1 + b.i * 0.8, c.z + 2.5, 0);
    player.teleport(c.x, c.z - 1.5, 0);
    cam.yaw = 0;
    friend.place(c.x + 1.2, c.z - 1.8, 0);
    const birds = bed("morningBirds", 0.8);
    const g = gen;
    cinema.play([
      { fade: "clear", dur: 1.2 },
      { shot: { pos: [c.x - 2.5, gy(c.x, c.z) + 1.0, c.z - 3], look: [c.x, gy(c.x, c.z) + 0.2, c.z + 2.5], fov: F(42), dur: 9, ease: "inOut" }, hold: false },
      { caption: "Morning. The babies stand in a row, their backs to you.", dur: 2.8, narr: true },
      { call: () => { if (birds && birds.stop) birds.stop(); } },
      { caption: "...the birds stop singing.", dur: 2, narr: true },
      { call: () => { M("stinger", "glitch"); A("robotServo"); for (const b of babies.list) b.yaw = PI; babies.setRobot(1, 2); } },
      { wait: 2.2 },
      { call: () => { for (let i = 0; i < 3; i++) A("robotBeep", i); } },
      { caption: "Metal faces. Glowing eyes. EVIL ROBOTS WITH SUPERPOWERS!", dur: 2.8, narr: true },
      { caption: "[Those aren't my babies!]", dur: 2, who: "Pip" },
    ], { skippable: true, onSkip: () => babies.setRobot(1), onDone: () => { if (g === gen) startChase(0, true); } });
  }
  // ---- the chase: camp -> south along the creek -> behind the rock -> over the log bridge -> the red threads
  const CHASE = [
    [{ x: 20, z: 66 }, { x: 24, z: 60 }, { x: 28, z: 44 }],
    [{ x: 28, z: 44 }, { x: 23.4, z: 24 }, { x: 22.6, z: 11 }],
    [{ x: 22.6, z: 9 }, { x: 27, z: 2.2 }, { x: 30, z: 1 }, { x: 34.5, z: 3.4 }, { x: 40, z: 16 }],
  ];
  const SEG_NAME = ["chase", "chase2", "chase3"];
  let routeI = 0;
  function startChase(n, story) {
    hardStop();
    jungleBase("dawn", "alarm", false);
    setIllusion(1);
    babies.reset(); babies.show(true); babies.setRobot(1);
    if (n === 0 && story) babies.list.forEach((b) => babies.place(b, J.camp.x - 1 + b.i * 0.8, J.camp.z + 2.5, PI));
    beginChase(n);
    cinema.fade("clear", 0.4);
  }
  function placeChase(n) {
    const s = CHASE[n][0], nx = CHASE[n][1], yaw = Math.atan2(nx.x - s.x, nx.z - s.z);
    player.teleport(s.x, s.z, yaw); cam.yaw = yaw;
    friend.place(s.x - Math.sin(yaw) * 1.2 + 0.6, s.z - Math.cos(yaw) * 1.2, yaw);
    babies.list.forEach((b) => babies.place(b, s.x - Math.sin(yaw) * (7 + b.i), s.z - Math.cos(yaw) * (7 + b.i) + (b.i - 1) * 1.2, yaw));
    routeI = 1; power = null; powerT = 2.5;
    for (const b of beams) b.visible = false;
  }
  function beginChase(n) {
    seg = n; step = SEG_NAME[n]; chaseOn = true; panted = false;
    wearGear();
    walkSpeed(1.3);
    ctx.health.enable({ max: 5, hearts: true, regen: 0.2, regenDelay: 6, label: "Health" });
    ctx.health.onHurt = () => { if (Math.random() < 0.5) A("babyCry", 0); };
    placeChase(n);
    threadGate.visible = n === 2;
    friend.do("follow", { dist: 1.4, side: 0.8 });
    ctx.checkpoint.set(SEG_NAME[n], { x: player.x, z: player.z, yaw: player.yaw, label: n === 0 ? "RUN!" : "Keep running!", silent: n === 0, restore: () => { gen++; ctx.clearTimers(); placeChase(seg); chaseOn = true; } });
    M("play", "chase", { at: "now", intensity: 0.7 + n * 0.15 });
    player.enabled = true; ui.showHud(true);
    if (n < 2) objective("run" + n, "RUN!", "follow the light · jump the lasers");
    else objective("run2", "Run back to the FAR LANDS PORTAL!", "over the log bridge · to the red threads");
    setHints("Run along the path (the light). JUMP the red laser beams. Step out of red circles.", "Magnet? Keep holding forward! Blink? Run round the robot.");
  }
  function chaseTarget() { const r = CHASE[seg]; return r[Math.min(routeI, r.length - 1)]; }
  function updateChase(dt) {
    if (cinema.playing || !player.enabled) return;
    const t = chaseTarget(), r = CHASE[seg];
    setGoal(t.x, gy(t.x, t.z), t.z, seg === 2 && routeI >= r.length - 1 ? 0xc8a0ff : 0xff8060);
    if (dist2(player.x, player.z, t.x, t.z) < 3) {
      routeI++;
      progressed();
      if (routeI >= r.length) {
        chaseOn = false;
        if (seg === 0) { ui.objectiveDone(); beginChase(1); return; }
        if (seg === 1) { pant(); return; }
        if (seg === 2) { toPortal(); return; }
      }
    }
    if (!chaseOn) return;
    // the robots: always just behind, never catching up on their own
    const yaw = Math.atan2(t.x - player.x, t.z - player.z);
    for (const b of babies.list) {
      if (power && power.b === b && power.kind !== "laser") continue;
      const d = dist2(b.x, b.z, player.x, player.z);
      const bx = player.x - Math.sin(yaw) * (5.5 + b.i * 1.3) + Math.cos(yaw) * (b.i - 1) * 1.0, bz = player.z - Math.cos(yaw) * (5.5 + b.i * 1.3) - Math.sin(yaw) * (b.i - 1) * 1.0;
      babies.goTo(b, bx, bz, d > 11 ? 5.5 : d < 4 ? 2.2 : 3.7);
      if (power && power.b === b) babies.goTo(b, b.x, b.z, 0);
      if (d < 0.75) ctx.health.damage(1, { x: b.x, z: b.z, kind: "melee", knock: 4 });
    }
    updatePower(dt);
  }
  const POWERS = [["laser", "rocket"], ["laser", "rocket", "magnet"], ["laser", "rocket", "magnet", "blink"]];
  const told = {};
  function updatePower(dt) {
    if (!power) {
      powerT -= dt;
      if (powerT <= 0) {
        const list = POWERS[seg], kind = list[(Math.random() * list.length) | 0], b = babies.list[(Math.random() * 3) | 0];
        power = { kind, b, t: 0, phase: 0, zone: -1, x: 0, z: 0, sw: Math.random() < 0.5 ? 1 : -1 };
        if (!told[kind]) { told[kind] = true; ui.hint(forTouch({ laser: "LASER EYES! Jump (Space) over the red beam!", rocket: "ROCKET HOP! Get out of the red circle!", magnet: "MAGNET! Keep running forward, hard!", blink: "BLINK! It's in front of you: run round it!" }[kind]), 3); }
        A("robotServo");
      }
      return;
    }
    const p = power, b = p.b;
    p.t += dt;
    const t = chaseTarget(), yaw = Math.atan2(t.x - player.x, t.z - player.z);
    if (p.kind === "laser") {
      if (p.phase === 0) { if (p.t > 0.7) { p.phase = 1; p.t = 0; A("robotLaser"); } }
      else {
        const k = p.t / 1.0, beam = beams[b.i];
        const sx = player.x + Math.cos(yaw) * p.sw * (2.5 - 5 * k) + Math.sin(yaw) * 1.5, sz = player.z - Math.sin(yaw) * p.sw * (2.5 - 5 * k) + Math.cos(yaw) * 1.5;
        const ox = b.x, oy = b.y + 0.18, oz = b.z, ey = gy(sx, sz) + 0.22;
        beam.visible = true; beam.position.set(ox, oy, oz); beam.lookAt(sx, ey, sz);
        const len = Math.hypot(sx - ox, ey - oy, sz - oz) + 4; beam.scale.set(1, 1, len);
        // the player is hit when standing on the beam (jump to clear it)
        const dx = (sx - ox), dz = (sz - oz), L2 = dx * dx + dz * dz || 1, u = clamp(((player.x - ox) * dx + (player.z - oz) * dz) / L2, 0, 1.6);
        const cx = ox + dx * u, cz = oz + dz * u;
        if (Math.hypot(player.x - cx, player.z - cz) < 0.35 && player.y - gy(player.x, player.z) < 0.3) ctx.health.damage(1, { x: ox, z: oz, kind: "blast", knock: 2 });
        if (p.t > 1.0) { beam.visible = false; power = null; powerT = 2.6 + Math.random() * 1.4; }
      }
    } else if (p.kind === "rocket") {
      if (p.phase === 0) { p.x = player.x + Math.sin(yaw) * 3.2; p.z = player.z + Math.cos(yaw) * 3.2; p.sx = b.x; p.sz = b.z; p.zone = FX("dangerZone", { shape: "circle", x: p.x, z: p.z, r: 2, seconds: 1.1, colorHex: 0xff3a2a }); A("rocketBurst"); p.phase = 1; p.t = 0; }
      else if (p.phase === 1) {
        const k = Math.min(1, p.t / 1.1);
        b.x = lerp(p.sx, p.x, k); b.z = lerp(p.sz, p.z, k); b.tx = b.x; b.tz = b.z; b.fly = Math.sin(k * PI) * 3;
        if (Math.random() < 0.5) FX("sparkle", v1.set(b.x, b.y + b.fly, b.z), 0xffa040, 2);
        if (k >= 1) { b.fly = 0; p.phase = 2; p.t = 0; FX("shockRing", p.x, p.z, 8, 3, 0xff8060); cinema.shake(0.03, 0.3); if (dist2(player.x, player.z, p.x, p.z) < 2) ctx.health.damage(1, { x: p.x, z: p.z, kind: "blast", knock: 5 }); }
      } else if (p.t > 0.6) { power = null; powerT = 2.4 + Math.random() * 1.5; }
    } else if (p.kind === "magnet") {
      if (p.t < 1.5) {
        const dx = b.x - player.x, dz = b.z - player.z, l = Math.hypot(dx, dz) || 1, mash = ctx.input.y > 0.5 ? 0.35 : 1;
        player.kx = (dx / l) * 3.4 * mash; player.kz = (dz / l) * 3.4 * mash;
        if (Math.random() < 0.3) FX("sparkle", v1.set(lerp(b.x, player.x, Math.random()), b.y + 0.3, lerp(b.z, player.z, Math.random())), 0x80c0ff, 1);
        if (((p.t * 6) | 0) !== (((p.t - dt) * 6) | 0)) A("robotBeep", b.i);
      } else { power = null; powerT = 2.6 + Math.random() * 1.4; }
    } else if (p.kind === "blink") {
      if (p.phase === 0) { FX("dissolve", b.x, b.y, b.z, 0.5, 0xff4040, 12); p.x = player.x + Math.sin(yaw) * 6; p.z = player.z + Math.cos(yaw) * 6; babies.place(b, p.x, p.z, yaw + PI); FX("dissolve", p.x, gy(p.x, p.z), p.z, 0.5, 0xff4040, 12); p.zone = FX("dangerZone", { shape: "circle", x: p.x, z: p.z, r: 1.4, seconds: 1.8, colorHex: 0xff3a2a }); A("robotBeep", b.i); p.phase = 1; p.t = 0; }
      else { if (dist2(player.x, player.z, b.x, b.z) < 1.3) ctx.health.damage(1, { x: b.x, z: b.z, kind: "melee", knock: 4 }); if (p.t > 1.8) { const bx = player.x - Math.sin(yaw) * 8, bz = player.z - Math.cos(yaw) * 8; babies.place(b, bx, bz, yaw); power = null; powerT = 2.4 + Math.random() * 1.4; } }
    }
  }
  function pant() {
    panted = true;
    player.enabled = false;
    for (const b of beams) b.visible = false;
    power = null;
    const g = gen, rk = CHASE[1][2];
    cinema.play([
      { call: () => { babies.list.forEach((b, i) => babies.goTo(b, rk.x - 6 + i * 3, rk.z + 6, 1.5)); friend.do("goto", { x: rk.x + 0.9, z: rk.z - 0.3 }); } },
      { shot: { pos: [rk.x + 2.5, gy(rk.x, rk.z) + 1.0, rk.z - 2], look: platypus.group, lookY: 0.2, fov: F(42), dur: 6, hand: 0.6 }, hold: false },
      { caption: "You stop behind a rock, panting. The robots scan the trees.", dur: 3, narr: true },
      { call: () => { objKey = ""; ui.setObjective("Run... but where?", ""); } },
      { caption: "[Run... but WHERE?]", dur: 2, who: "You" },
      { call: () => { FX("sparkle", v1.set(player.x, player.y + 0.9, player.z), 0xfff8a0, 20); A("spellChime", 4); } },
      { caption: "[The portal!]", dur: 2, who: "You" },
    ], { skippable: true, onDone: () => { if (g === gen) beginChase(2); } });
  }
  function toPortal() {
    player.enabled = false;
    const g = gen;
    cinema.fade("black", 0.5, () => { if (g === gen) startBack(); });
  }
  // ---- back through the portal
  function startBack() {
    hardStop();
    groveBase("dusk");
    setIllusion(1);
    step = "back";
    grove.puzzle.solveAll(); grove.allLines(1); grove.centre(0.8); grove.portal.set(1); grove.letters(1);
    babies.reset(); babies.show(true); babies.setRobot(1);
    const s = G.backStart;
    player.teleport(s.x, s.z, 0); cam.yaw = 0;
    friend.place(s.x + 1, s.z - 1, 0); friend.do("follow", { dist: 1.2, side: 0.7 });
    babies.list.forEach((b) => babies.place(b, s.x - 2 + b.i * 2, s.z - 10, 0));
    wearGear(); walkSpeed(1.3);
    ctx.health.enable({ max: 5, hearts: true, regen: 0.2, regenDelay: 6, label: "Health" });
    ctx.checkpoint.set("back", { x: s.x, z: s.z, yaw: 0, label: "The portal!", silent: true, restore: () => babies.list.forEach((b) => babies.place(b, s.x - 2 + b.i * 2, s.z - 10, 0)) });
    M("play", "chase", { at: "now", intensity: 1 });
    bed("portalHum", 0.7);
    player.enabled = true; ui.showHud(true);
    objective("back", "Dive into the portal!", "Jump in! (Space)");
    setGoal(G.portal.x, gy(G.portal.x, G.portal.z), G.portal.z, 0xc8a0ff);
    setHints("Run to the swirling portal by the rock and JUMP in (Space).");
    cinema.fade("clear", 0.6);
  }
  function updateBack() {
    if (cinema.playing) return;
    for (const b of babies.list) babies.goTo(b, player.x + (b.i - 1) * 1.5, player.z - 4.5, dist2(b.x, b.z, player.x, player.z) > 9 ? 4.5 : 3.2);
    setAct(dist2(player.x, player.z, G.portal.x, G.portal.z) < 2.8 ? "Jump in!" : null, "Space");
  }
  function diveIn() {
    setAct(null); clearGoal(); ui.objectiveDone();
    player.enabled = false;
    const g = gen;
    cinema.play([
      { call: () => { player.walkTo(G.portal.x, G.portal.z, { speed: 1 }); platypus.jump && platypus.jump(); } },
      { wait: 0.7 },
      { fade: "white", dur: 0.3 },
      { call: () => A("portalKnock") },
    ], { skippable: false, release: null, onDone: () => { if (g === gen) startReveal(true); } });
  }
  // ---- the reveal: only 3 seconds had passed
  function startReveal(story) {
    hardStop();
    groveTribe("reveal");
    setIllusion(0);
    step = "reveal";
    grove.puzzle.solveAll(); grove.allLines(1); grove.centre(0.8); grove.portal.set(1); grove.letters(1);
    babies.hide();
    player.teleport(G.land.x, G.land.z, 0); cam.yaw = 0;
    if (platypus.collapse) platypus.collapse();
    friend.place(G.land.x + 0.9, G.land.z - 0.4, -0.4); friend.do("idle");
    M("stop", 0.1);
    bed("portalHum", 0.6);
    const g = gen;
    cinema.play([
      { fade: "clear", dur: story ? 0.4 : 1 },
      { call: () => { M("stinger", "illusion"); A("crowdGasp"); } },
      { shot: { pos: [-3, 1.8, G.land.z - 4.5], look: platypus.group, lookY: 0.2, fov: F(46), to: { pos: [-1.5, 1.2, G.land.z - 3] }, dur: 6, ease: "inOut" }, hold: false },
      { caption: "...onto the grass. At DUSK. Exactly where you landed the first time.", dur: 3.4, narr: true },
      { call: () => { if (platypus.revive) platypus.revive(); } },
      { shot: { pos: [1.5, 3.0, G.centre.z + 4], look: [0, 0.6, G.centre.z - 6.5], fov: F(58), dur: 3.6 }, hold: false },
      { caption: "The whole tribe stands there, mid-murmur. Nobody has moved. No babies.", dur: 3.4, narr: true },
      { caption: "[...You just went in.]", dur: 2.4, who: "Rok" },
      { call: () => { mem.burra.do("goto", { x: G.dial.x - 1, z: G.dial.z - 0.8 }); grove.clock(true); A("clockTick"); } },
      { shot: { pos: [G.dial.x - 2, 1.6, G.dial.z - 2.4], look: [G.dial.x, 0.6, G.dial.z], fov: F(40), dur: 4 }, hold: false },
      { caption: "Old Burra peers at the sundial stone. Its shadow has barely moved.", dur: 3, narr: true },
      { card: { kicker: "", title: "ONLY 3 SECONDS HAD PASSED.", hold: 2.2 } },
      { card: { kicker: "", title: "IT FELT LIKE 3 DAYS.", hold: 2.2 } },
      { fade: "clear", dur: 0.6 },
      { call: () => grove.clock(false) },
      { shot: { pos: [2.4, 1.4, G.land.z - 2.6], look: [0, 0.8, G.land.z], fov: F(44), dur: 6 }, hold: false },
      { caption: "[The Far Lands show you what is not there. An illusion.]", dur: 3.4, who: "Old Burra" },
      { caption: "[They never even came in after you! They were just standing here the whole time!]", dur: 3.6, who: "Pip" },
      { call: () => M("motif", "pip", { gain: 0.5 }) },
      { wait: 1 },
    ], { skippable: true, onSkip: () => { if (platypus.revive) platypus.revive(); grove.clock(false); }, onDone: () => { if (g === gen) beginClose(); } });
  }
  // ---- close the portal
  function startClose() {
    hardStop();
    groveTribe("reveal");
    grove.puzzle.solveAll(); grove.allLines(1); grove.centre(0.8); grove.portal.set(1); grove.letters(1);
    player.teleport(G.land.x, G.land.z, 0); cam.yaw = 0;
    friend.place(G.land.x + 0.9, G.land.z - 0.4, 0);
    player.enabled = true; ui.showHud(true);
    cinema.fade("clear", 0.6);
    beginClose();
  }
  function beginClose() {
    step = "close";
    closeTurned = [false, false, false, false]; closeReady = false; closed = false;
    grove.puzzle.onTurn = onStoneTurn;
    grove.setStoneGlow(false);
    friend.do("follow", { dist: 1.3, side: 0.7 });
    ab.buttons({ slap: true });
    M("play", "farlands", { at: "bar", intensity: 0.3 });
    ctx.checkpoint.set("close", { x: G.land.x, z: G.land.z, yaw: 0, silent: true });
    player.enabled = true; ui.showHud(true);
    objective("close0", "Close the portal: turn the stones back 0/4", keyHint("Tail Slap (L) or E", "Slap or tap"));
    setHints("Turn each of the four stones once (Tail Slap or E): the portal dims.", "Then Tail Slap the rock itself.");
  }
  function updateClose() {
    if (cinema.playing) return;
    if (!closeReady) { const s = nearestStone(2.2); setAct(s && !closeTurned[s.i] ? "Turn the stone" : null); let k = -1; for (let i = 0; i < 4; i++) if (!closeTurned[i]) { k = i; break; } if (k >= 0) { const st = grove.stones[k]; setGoal(st.x, -0.4, st.z, 0xc8a0ff); } }
    else if (!closed) setAct(dist2(player.x, player.z, G.rock.x, G.rock.z) < 3.4 ? "Slap the rock" : null, "L");
  }
  function slapRock() {
    if (!closeReady || closed || dist2(player.x, player.z, G.rock.x, G.rock.z) > 3.6) return false;
    closed = true;
    platypus.tailSlap(); A("tailSlapHit");
    player.enabled = false; setAct(null); clearGoal(); ui.objectiveDone();
    const g = gen;
    cinema.play([
      { wait: 0.3 },
      { call: () => { grove.portal.close(3); grove.letters(0, 3); grove.allLines(0); grove.centre(0); A("rockGrind", 0.8); stopBeds(); } },
      { shot: { pos: [3, 1.6, G.rock.z - 6], look: [0, 1.8, G.rock.z], fov: F(46), dur: 6 }, hold: false },
      { caption: "The rock closes. The letters fade to plain stone.", dur: 3, narr: true },
      { call: () => mem.burra.emote("happy") },
      { caption: "Burra nods.", dur: 1.6, narr: true },
      { caption: "[We need somewhere safe. All of us.]", dur: 2.6, who: "Rok" },
      { caption: "[A house.]", dur: 2, who: "Tika" },
      { fade: "black", dur: 1.2 },
      { card: { kicker: "", title: "The next morning", hold: 1.4 } },
    ], { skippable: true, release: null, onSkip: () => { grove.portal.set(0); grove.letters(0); }, onDone: () => { if (g === gen) startBuild(0); } });
    return true;
  }

  // =====================================================================================================
  // PART 4 - the platypus house, and the coziest sleep
  // =====================================================================================================
  const HELPERS = ["rok", "tika", "nib", "moss", "burra"];
  function stageText(s) { const d = HOUSE_STAGES[s]; return d.label + " " + house.count(s) + "/" + d.n + (s === 3 ? " (+ door)" : ""); }
  function startBuild(s) {
    hardStop();
    jungleBase(HOUSE_STAGES[s].time, "calm");
    step = s === 0 ? "build" : "build" + (s + 1);
    house.reset(); house.skipToStage(s);
    if (tribe.village) { tribe.village.populate(J.spots.slice(0, 6)); tribe.village.setMood("calm", 0); }
    house.group.visible = true; house.piles.visible = true;
    house.onStage = onHouseStage; house.onDone = onHouseDone;
    if (s >= 3) wallCols();
    const S = house.SITE;
    player.teleport(S.x - 1.5, S.z + 4.2, PI); cam.yaw = PI;
    friend.place(S.x + 1.5, S.z + 4, PI); friend.do("follow", { dist: 1.4, side: 0.8 });
    for (const k of HELPERS) mem[k].visible = true;
    mem.burra.place(S.x + 3.5, S.z + 3.8, PI);
    HELPERS.forEach((k, i) => { if (k !== "burra") mem[k].place(S.x - 3 + i * 1.6, S.z + 4.5 + (i % 2), PI); });
    helpers.length = 0;
    HELPERS.forEach((k, i) => helpers.push({ k, m: mem[k], st: "idle", t: 1.5 + i * 1.7, kind: null, id: -1 }));
    tribe.maxFull = 1;
    ctx.checkpoint.set("build" + (s + 1), { x: S.x - 1.5, z: S.z + 4.2, yaw: PI, silent: s === 0, label: "The house: " + HOUSE_STAGES[s].label, restore: () => { dropCarry(); } });
    M("play", "build", { at: "now", intensity: 0.35 + s * 0.12 });
    bed("morningBirds", s < 4 ? 0.6 : 0.2);
    player.enabled = true; ui.showHud(true);
    buildObjective();
    setHints("Pick up a piece at the glowing pile (E), carry it to a glowing ghost slot and press E. Press E again on the beat for PERFECT!", "The piles stand round the site: stones, planks, logs, poles, leaves, mud, moss, the lantern.");
    cinema.fade("clear", 1.0);
    if (s === 0) later(1.0, () => cinema.caption("[Footings first! Bring the big stones.]", 2.8, { who: "Tika" }));
  }
  function wallCols() { clearCols(); const S = house.SITE; for (let k = 1; k < 7; k++) { const a = (k / 7) * TAU; addCol(S.x + Math.sin(a) * house.WALL_R, S.z + Math.cos(a) * house.WALL_R, 0.85); } }
  function wantKinds() { return house.done ? [] : HOUSE_STAGES[house.stage].kinds.filter((k) => house.open(k).length > 0); }
  function buildObjective() {
    const s = house.stage;
    if (house.done) return;
    objective("b" + s + "-" + house.count(s), stageText(s), carrying ? "carry it to a glowing ghost · Place (E)" : "pick up at the pile (E)");
    ui.setQuests(HOUSE_STAGES.map((d, i) => ({ id: "s" + i, text: i < s ? d.label + " ✓" : i === s ? stageText(i) : d.label, done: i < s, current: i === s })), "The house");
  }
  // generous reach: a pile is picked up from 2.5 m and a piece placed from 3.2 m (over a half-built wall, with the
  // others crowding the site), so nobody has to squeeze through the door to the exact spot
  const PLACE_R = 3.2, PLACE_R_SOFT = 3.6;
  function pileNear() { let b = null, bd = 2.5; for (const k of wantKinds()) { const p = house.PILES[k], d = dist2(player.x, player.z, p.x, p.z); if (d < bd) { bd = d; b = k; } } return b; }
  function dropCarry() { carrying = null; for (const k in house.carry) house.carry[k].visible = false; platypus.setCarry(false); player.carrying = false; }
  function updateBuild(dt) {
    house.update(dt);
    if (speedT > 0) { speedT -= dt; if (speedT <= 0) walkSpeed(); }
    updateHelpers(dt);
    if (cinema.playing || house.done) return;
    if (carrying) {
      const p = house.nearestOpen(player.x, player.z, carrying, carrying === "moss" || carrying === "lantern" ? PLACE_R_SOFT : PLACE_R);
      setAct(p ? "Place" : null);
      const t = house.nearestOpen(player.x, player.z, carrying);
      if (t) setGoal(t.x, gy(t.x, t.z), t.z, 0x9fe8ff); else { carrying = null; for (const k in house.carry) house.carry[k].visible = false; platypus.setCarry(false); player.carrying = false; }
    } else {
      const k = pileNear();
      setAct(k ? "Pick up " + k : perfectT >= 0 ? "Hammer!" : null);
      const kinds = wantKinds();
      if (kinds.length) { let best = null, bd = 1e9; for (const q of kinds) { const p = house.PILES[q], d = dist2(player.x, player.z, p.x, p.z); if (d < bd) { bd = d; best = p; } } setGoal(best.x, gy(best.x, best.z), best.z, 0xffd080); }
    }
    if (perfectT >= 0) { perfectT += dt; if (perfectT > 0.9) { perfectT = -1; } }
  }
  function buildAct() {
    if (perfectT >= 0 && !carrying && actName === "Hammer!") {
      // the beat timing: within 0.12 s of a beat is PERFECT (never a fail)
      const ph = music && music.beatPhase ? music.beatPhase() : 0.5;
      const off = Math.min(ph, 1 - ph) * (60 / ((music && music.STATES && music.STATES.build && music.STATES.build.bpm) || 104));
      perfectT = -1;
      A("hammer", "wood");
      if (off < 0.12) { perfects++; ui.call("PERFECT!", "", "perfect"); speedT = 4; walkSpeed(1.3); }
      else ui.call("Nice!", "", "good");
      setAct(null);
      return;
    }
    if (!carrying) {
      const k = pileNear();
      if (!k) return;
      carrying = k;
      const m = house.carry[k]; platypus.holdAnchor.add(m); m.position.set(0, 0.06, 0.04); m.visible = true;
      platypus.setCarry(true); player.carrying = true;
      A(k === "stone" ? "placeStone" : k === "leaf" || k === "moss" ? "thatchRustle" : "pickup");
      progressed();
      objKey = ""; buildObjective();
      return;
    }
    const p = house.nearestOpen(player.x, player.z, carrying, carrying === "moss" || carrying === "lantern" ? PLACE_R_SOFT : PLACE_R);
    if (!p) return;
    house.carry[carrying].visible = false; carrying = null;
    platypus.setCarry(false); player.carrying = false;
    platypus.tailSlap && platypus.tailSlap();
    player.lock = 0.35;
    house.place(p.id, 1);
    FX("footDust", p.x, gy(p.x, p.z) + 0.1, p.z, 0.5);
    progressed();
    if (!house.done) { perfectT = 0; setAct("Hammer!"); }
    objKey = ""; buildObjective();
  }
  function updateHelpers(dt) {
    helperT -= dt;
    for (const h of helpers) {
      if (house.done) { if (h.st !== "done") { h.st = "done"; h.m.do("idle"); } continue; }
      h.t -= dt;
      if (h.st === "idle" && h.t <= 0) {
        const kinds = wantKinds(); if (!kinds.length) { h.t = 2; continue; }
        h.kind = kinds[(Math.random() * kinds.length) | 0];
        const p = house.PILES[h.kind]; h.st = "fetch"; h.m.do("goto", { x: p.x + 0.9, z: p.z + 0.5 }); h.t = 10;
      } else if (h.st === "fetch" && (h.m.distTo(house.PILES[h.kind].x + 0.9, house.PILES[h.kind].z + 0.5) < 0.6 || h.t <= 0)) {
        const p = house.nearestOpen(h.m.x, h.m.z, h.kind);
        if (!p) { h.st = "idle"; h.t = 1; continue; }
        h.id = p.id; h.st = "bring"; h.m.do("goto", { x: p.x + 0.5, z: p.z + 0.5 }); h.t = 12;
      } else if (h.st === "bring" && (h.m.distTo(house.pieces[h.id].x + 0.5, house.pieces[h.id].z + 0.5) < 0.7 || h.t <= 0)) {
        if (helperT <= 0 && !house.isBuilt(h.id) && house.pieces[h.id].stage === house.stage) { house.place(h.id, 2); h.m.emote("happy"); helperT = 7.5; objKey = ""; buildObjective(); }
        h.st = "idle"; h.t = 1.5 + Math.random() * 2;
      }
    }
  }
  function onHouseStage(was) {
    ui.objectiveDone();
    M("motif", "home", { gain: 0.8 });
    FX("confetti", v1.set(house.SITE.x, gy(house.SITE.x, house.SITE.z) + 2.5, house.SITE.z), null, 30);
    if (was === 2) wallCols();
    if (house.done) return;
    const s = house.stage;
    step = "build" + (s + 1);
    ctx.checkpoint.set("build" + (s + 1), { x: player.x, z: player.z, yaw: player.yaw, label: "The house: " + HOUSE_STAGES[s].label, restore: () => { dropCarry(); } });
    if (HOUSE_STAGES[s].time !== HOUSE_STAGES[was].time) jungle.setTime(HOUSE_STAGES[s].time, 6);
    M("setIntensity", 0.35 + s * 0.12, 3);
    const calls = ["", "[Now the floor planks!]", "[Logs for the walls! Two rings!]", "[Roof poles, and a door frame!]", "[Leaf bundles, bottom to top!]", "[Mud for the cracks, moss beds, and the lantern!]"];
    later(1, () => cinema.caption(calls[s], 2.6, { who: "Tika" }));
    objKey = ""; buildObjective();
  }
  function onHouseDone() {
    ui.objectiveDone(); setAct(null); clearGoal(); setHints(null); ui.setQuests(null);
    if (carrying) { house.carry[carrying].visible = false; carrying = null; platypus.setCarry(false); player.carrying = false; }
    player.enabled = false;
    const g = gen, S = house.SITE;
    cinema.play([
      { shot: { pos: [S.x + 6, gy(S.x, S.z) + 3, S.z + 7], look: [S.x, gy(S.x, S.z) + 1.2, S.z], fov: F(48), to: { pos: [S.x + 4.5, gy(S.x, S.z) + 2.2, S.z + 5.5] }, dur: 6, ease: "inOut" }, hold: false },
      { call: () => { if (tribe.village) { tribe.village.setMood("cheer", 0.4); tribe.village.wave(S.x, S.z); } A("crowdCheer", 0.9); M("stinger", "victory"); house.interior(false); } },
      { caption: "The house is finished! The whole tribe cheers.", dur: 3, narr: true },
      { call: () => { jungle.setTime("night", 3); A("campFire", 0.6); } },
      { caption: "The lantern is lit. Night falls.", dur: 2.6, narr: true },
    ], { skippable: true, onSkip: () => jungle.setTime("night", 0), onDone: () => { if (g === gen) beginCozy(); } });
  }
  // ---- cozy
  function startCozy() {
    hardStop();
    jungleBase("night", "sleep");
    house.reset(); house.skipToStage(6);
    tribe.maxFull = 1;
    if (tribe.village) { tribe.village.populate(J.spots.slice(0, 12)); tribe.village.setMood("sleep", 0); }
    house.group.visible = true; house.piles.visible = true;
    wallCols();
    const S = house.SITE;
    player.teleport(S.x, S.z + 4.5, PI); cam.yaw = PI;
    friend.place(S.x + 1, S.z + 4.2, PI);
    for (const k of HELPERS) mem[k].visible = true;
    HELPERS.forEach((k, i) => mem[k].place(S.x - 3 + i * 1.5, S.z + 5.2, PI));
    player.enabled = true; ui.showHud(true);
    cinema.fade("clear", 1);
    beginCozy();
  }
  function beginCozy() {
    step = "cozy";
    house.interior(true);
    const S = house.SITE;
    M("play", "lullaby", { at: "bar", intensity: 0.5 });
    bed("cricketNight", 0.4); bed("campFire", 0.4);
    friend.do("follow", { dist: 1.1, side: 0.6 });
    player.enabled = true; ui.showHud(true);
    objective("cozy", "Go to sleep", "inside the house · the middle bed · Sleep (E)");
    setGoal(S.x, gy(S.x, S.z), S.z, 0xffd080);
    setHints("Walk in through the door and lie down on the middle moss bed (E).");
  }
  function updateCozy(dt) { house.update(dt); if (!cinema.playing) setAct(nearP(house.SITE, 1.3) ? "Sleep" : null); }
  function cozySleep() {
    setAct(null); clearGoal(); ui.objectiveDone();
    player.enabled = false;
    const S = house.SITE, B = house.BEDS, g = gen, y = gy(S.x, S.z);
    cinema.play([
      { call: () => {
        player.walkTo(B[0].x, B[0].z, { speed: 0.5, face: B[0].yaw });
        friend.do("sleep", { at: { x: B[1].x, z: B[1].z, yaw: B[1].yaw } });
        HELPERS.forEach((k, i) => { mem[k].visible = true; mem[k].do("sleep", { at: { x: B[2 + i].x, z: B[2 + i].z, yaw: B[2 + i].yaw } }); });
        if (tribe.village) { const sp = []; for (let i = 7; i < 10; i++) sp.push({ x: B[i].x, z: B[i].z, yaw: B[i].yaw, kind: "sleep" }); tribe.village.populate(sp); tribe.village.setMood("sleep", 0); }
      } },
      { until: () => !player.walking, max: 3 },
      { call: () => { platypus.sleep(true); A("thatchRustle"); } },
      { shot: { pos: [S.x + 2.2, y + 2.8, S.z - 2.2], look: [S.x, y + 0.2, S.z], fov: F(46), to: { pos: [S.x + 0.6, y + 14, S.z - 0.6] }, dur: 12, ease: "inOut" }, hold: false },
      { call: () => { M("motif", "home", { gain: 0.8 }); A("snore", "pip"); FX("zzz", v1.set(S.x, y + 0.6, S.z)); } },
      { wait: 3 },
      { call: () => { A("snore", "burra"); FX("zzz", v1.set(B[3].x, y + 0.5, B[3].z)); } },
      { caption: "Everyone got to sleep somewhere safe and cozy.", dur: 4, narr: true },
      { wait: 2 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) theEnd(); } });
  }
  function theEnd() {
    step = "done";
    M("stop", 3);
    cinema.endCard("TO BE CONTINUED…", { hold: 3.5, sub: "" }, () => ctx.complete());
  }

  // =====================================================================================================
  // level interface
  // =====================================================================================================
  function enter() {
    hardStop();
    step = "intro";
    toJungle("night");
  }
  function update(dt, time) {
    if (step === "boot" || step === "done") return;
    tickHints(dt);
    if (illuK !== illuTo) { const d = illuTo - illuK, st = dt * illuRate; illuK = Math.abs(d) <= st ? illuTo : illuK + Math.sign(d) * st; }
    if (illuK > 0.01) applyIllusion();
    if (place === "woods") {
      friend.update(dt, time);
      switch (step) {
        case "woods": updateWoods(); break;
        case "ambush": case "toDen": updateAmbush(dt); break;
        case "den": case "vines": updateDen(dt); break;
      }
      if (audio && audio.setEar) audio.setEar(player.x, player.z, cam.yaw);
      return;
    }
    if (place === "grove") {
      tribe.update(dt, time); friend.update(dt, time); babies.update(dt);
      switch (step) {
        case "grove": updateGrove(); break;
        case "show": updateShow(); break;
        case "puzzle": updatePuzzle(dt); break;
        case "enter": updateEnter(); break;
        case "back": updateBack(); break;
        case "close": updateClose(); break;
      }
      return;
    }
    if (place === "jungle") {
      tribe.update(dt, time); friend.update(dt, time); babies.update(dt);
      switch (step) {
        case "sleep": updateSleep(); break;
        case "morning": updateMorning(dt); break;
        case "show": updateShow(); break;
        case "babies": updateCare(dt); break;
        case "chase": case "chase2": case "chase3": updateChase(dt); break;
        case "cozy": updateCozy(dt); break;
        default: if (step.startsWith("build")) updateBuild(dt);
      }
    }
  }
  function onAction(name) {
    if (cinema.playing) return false;
    const fight = place === "woods" && (step === "ambush" || step === "den" || step === "toDen" || step === "woods");
    if (fight) {
      if (name === "primary") return attack("sting");
      if (name === "tailSlap") return attack("slap");
    }
    if (step === "vines" && (name === "tailSlap" || name === "interact" || name === "primary")) return cutVine();
    if ((step === "puzzle" || step === "close") && (name === "tailSlap" || name === "interact")) {
      if (step === "close" && closeReady) return slapRock();
      return turnStone();
    }
    if (step === "back" && name === "jump" && actName === "Jump in!") { diveIn(); return true; }
    if (name !== "interact") return false;
    switch (step) {
      case "sleep": if (actName === "Sleep") sleepTogether(); break;
      case "morning": if (actName) foundPip(); break;
      case "show": if (actName === "Call the tribe") callTribe(); break;
      case "babies": if (careNow && careNow.k !== "rock") careAct(); break;
      case "cozy": if (actName === "Sleep") cozySleep(); break;
      default: if (step.startsWith("build")) buildAct();
    }
    return false;
  }
  function exit() {
    hardStop();
    setIllusion(0);
    cinema.tint(null);
    A("stopAll");
    friend.reset(); friend.visible = true;
    tribe.reset(); tribeLite(false);
    babies.reset();
    for (const o of [house.group, house.piles, threadGate, babies.group, ...beams]) if (o && o.parent) o.parent.remove(o);
    woods.reset(); jungle.reset(); grove.reset();
    leaveWorld(grove); leaveWorld(woods);
    FX("setGround", null, null);
    place = ""; step = "boot";
  }
  function win() {
    if (step === "done" || step === "boot") return;
    hardStop();
    step = "done";
    cinema.endCard("TO BE CONTINUED…", { hold: 2.5, sub: "" }, () => ctx.complete());
  }
  function skipTo(name) {
    if (step === "boot" || STEPS.indexOf(name) < 0) return false;
    switch (name) {
      case "intro": hardStop(); step = "intro"; toJungle("night"); start(); break;
      case "woods": startWoods(); break;
      case "ambush": startAmbush(); break;
      case "den": startDen(); break;
      case "sleep": startSleep(); break;
      case "morning": startMorning(); break;
      case "grove": startGrove(); break;
      case "show": startShow(); break;
      case "puzzle": startPuzzle(); break;
      case "enter": startEnter(); break;
      case "babies": startBabies(); break;
      case "robots": startRobots(); break;
      case "chase": startChase(0); break;
      case "chase2": startChase(1); break;
      case "chase3": startChase(2); break;
      case "back": startBack(); break;
      case "reveal": startReveal(false); break;
      case "close": startClose(); break;
      case "build": startBuild(0); break;
      case "build2": case "build3": case "build4": case "build5": case "build6": startBuild(+name.slice(5) - 1); break;
      case "cozy": startCozy(); break;
      default: win();
    }
    return true;
  }
  return {
    build, enter, start, update, exit, onAction, skipTo, win, STEPS,
    state() {
      return {
        step, place, hp: ctx.health.on ? Math.round(ctx.health.hp * 10) / 10 : 0, tries: ctx.checkpoint.tries || 0,
        wolves: woods ? woods.wolves.alive : 0, kos, wave, vinesCut, hides, hideStage,
        faces: grove ? grove.stones.map((s) => s.face) : [], solved, portal: grove ? Math.round(grove.portal.k * 100) / 100 : 0,
        illusion: Math.round(illuK * 100) / 100, careDone, held: careHeld ? careHeld.kind : "",
        needs: babies ? babies.list.map((b) => NEEDS.map((k) => (b.need[k] >= 1 ? 1 : 0)).join("")) : [],
        seg, routeI, power: power ? power.kind : "", closeTurned: closeTurned.filter(Boolean).length, closed,
        house: house ? { stage: house.stage, done: house.done, progress: Math.round(house.progress * 100) / 100, you: house.byYou(), helpers: house.byHelpers() } : null,
        carrying: carrying || "", perfects, action: actName || "",
      };
    },
  };
}
