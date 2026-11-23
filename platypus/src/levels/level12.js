// level12.js - LEVEL 12, "THE VOLCANO" (LEVELS3.md Part C, STORY3.md).
//   travel     the flight to the volcano, the climb up the black slope to the dream shrine (lava channels, steam vents)
//   spell      five runestones, Wobble's song: light them in order, then sleep on the warm stone
//   dream      the ember dream: find Pip asleep in a cage of light and wake her ("Wake up, Pip!")
//   wake       you wake; the mountain trembles; the climb to the crater under falling rocks; Pip's cage; MAGMOR rises
//   boss1-3    MAGMOR, the heart of the mountain: FISTS (crystals), ERUPTION (vents + the potion), CORE (updrafts + the scream)
//   potion     the bridge rises, the cage opens: give Pip the LIVING POTION
//   winddance  the wind duet over the clouds and the flight home
//   dinner     eating at the camp with Pip; morning tag, noon pebbles, night fireflies; bed
//   missing    the middle of the night: Pip is gone. Pawprints into the woods. A wolf howls.
// Structure follows level11.js: every beat has a starter that begins from hardStop(), so skipTo() and the checkpoint
// restores set the world exactly as a playthrough would have it. The modules this level needs that have no shared
// builder yet (the ember dream, the wind duet's sky, the small games with Pip) are built here, inside the level.
import { getWizard } from "./common.js";
import { createVolcano } from "../volcano.js";
import { createMagmor } from "../magmor.js";
import { createDream } from "../dream.js";
import { createJungle } from "../jungle.js";
import { createTribe } from "../tribe.js";
import { createFriend } from "../friend.js";
import { createPotions } from "../potions.js";
import { skyDome, GLSL_NOISE, lumpify, noise3 } from "../kit3.js";

export const meta = { n: 12, title: "THE VOLCANO" };

const STEPS = ["intro", "travel", "spell", "dream", "wake", "boss1", "boss2", "boss3", "potion", "winddance", "dinner",
  "morning", "noon", "night", "bed", "missing", "done"];
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const rnd = (a, b) => a + Math.random() * (b - a);

const SONG = [0, 3, 1, 4, 2];                      // Wobble's motif on the five runestones
const CD = { sting: 0.45, slap: 0.8 };
const BOSS_STEP = ["boss1", "boss2", "boss3"];
const BOSS_OBJ = [
  (n) => ["Shatter the crystals " + n + "/4", "dodge the fist · when it rests, Sting (J) the glowing crystal"],
  (n) => ["Freeze the vents " + n + "/3 (Q)", "throw the potion into the open vent · blue flowers refill it"],
  (n) => ["Ride the wind — scream into its heart " + n + "/3", "stand in a wind column and jump · then hold R and let go"],
];
const LANES = ["spin", "flip", "dive", "wave"];
const LANE_TRICK = ["spin", "backflip", "tailSplash", "wave"];
// the wind duet: Pip calls a phrase of four, you answer it. Three sets, faster each time.
const DANCE = [
  [[0, 0, 1, 1], [0, 1, 0, 1], [3, 3, 0, 0], [1, 3, 1, 3]],
  [[0, 2, 1, 3], [2, 2, 3, 1], [3, 0, 2, 1], [1, 2, 3, 0]],
  [[0, 1, 2, 3], [3, 2, 1, 0], [2, 0, 2, 3], [1, 3, 0, 2], [0, 1, 2, 3]],
];
const SET_BEAT = [0.5, 0.45, 0.4];                  // seconds per beat in each set

export function createLevel(ctx) {
  const { THREE, player, platypus, cam, ui, cinema, audio, fx } = ctx;
  const music = ctx.music, ab = ctx.abilities;

  // guarded calls into audio / fx / music (a missing sound or effect must never stop the story)
  function A(name, a, b, c, d) { const f = audio[name]; return typeof f === "function" ? f.call(audio, a, b, c, d) : undefined; }
  function FX(name, a, b, c, d, e, g) { const f = fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e, g) : undefined; }
  function M(name, a, b) { const f = music && music[name]; return typeof f === "function" ? f.call(music, a, b) : undefined; }
  function F(v) {
    const a = ctx.camera.aspect || 1.78;
    if (a >= 1.3) return v;
    return Math.min(80, (2 * Math.atan((Math.tan((v * PI) / 360) * 1.3) / a) * 180) / PI);
  }

  let volcano = null, magmor = null, dream = null, jungle = null, tribe = null, friend = null, potions = null, wizard = null, sky = null;
  let V = null, J = null, mem = null;
  let step = "boot", gen = 0, place = "";

  // ---- scratch (no per-frame allocations) ----
  const v1 = new THREE.Vector3();
  const tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), ts = new THREE.Vector3(), tp = new THREE.Vector3();
  const flaskTo = { x: 0, y: 0, z: 0 };
  const REST = { speed: 0, maxSpeed: 3, grounded: false, vy: 0, turn: 0, moving: false };
  const cd = { sting: 0, slap: 0 };
  const beds = [];
  const hurtBy = {};                                   // what hurt the player in the fight (tests read it)
  const atk = { name: "", x: 0, z: 0, t: 0, at: -9 };   // the last attack MAGMOR telegraphed (tests read it)

  // ---- state of the beats ----
  let goal = null, actName = null, objKey = "";
  let hints = null, hintT = 0, hintLv = 0;
  let cpZ = 0, ventHurtT = 0;
  let songK = 0, demoOn = false, spellDone = false, demoLit = -1;   // demoLit: the stone singing now (tests listen to it)
  let wakes = 0, dreamStage = 0;
  let rockT = 0;
  let bossN = -1, bossOn = false, defeated = false, lastAttack = "", bareTold = false, dashT = 0;
  let ride = null;                                   // { i, t, stage, x, z, y0 }
  let given = false;
  let dance = null;
  let foodHeld = -1, foodDone = 0, foodGiven = [false, false, false];
  let tags = 0, tagStage = 0, tagT = 0;
  let pebblesGot = 0, flies = 0, missT = 0, missStage = 0, skyK = 0, skyMode = "";
  const pebbles = [];                               // { x, y, z, on }
  const fly = [];                                    // { ax, ay, az, ph, on, k }
  let waterSpots = null;

  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const nearP = (p, r) => dist2(player.x, player.z, p.x, p.z) <= r;
  const later = (s, fn) => { const g = gen; ctx.after(s, () => { if (g === gen) fn(); }); };
  const laterReal = (s, fn) => { const g = gen; cinema.after(s, () => { if (g === gen) fn(); }); };
  const keyHint = (keys, touch) => (ctx.touch ? touch : keys);

  // =====================================================================================================
  // small shared pieces
  // =====================================================================================================
  function setGoal(x, y, z, hex) {
    if (goal && goal.set) { goal.set(x, y, z); return; }
    goal = FX("beacon", x, y, z, hex === undefined ? 0xffe08a : hex) || null;
  }
  function clearGoal() { if (goal && goal.remove) goal.remove(); goal = null; }
  function setAct(label) { if (label !== actName) { actName = label; ui.setAction(label); } }
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
  function blip() { A("wizardBlip", 0.82 + Math.random() * 0.42); }
  function wearGear() {
    ctx.gear.wear("body", "suit", { armor: 0.25 });
    if (ctx.gear.worn.eyes) ctx.gear.remove("eyes");
  }
  function walkSpeed(k) { player.maxSpeed = 3 * (ctx.gear.speed || 1) * (k || 1); }

  // =====================================================================================================
  // level-owned props (built once): the light cage, the glider wind, pebbles, fireflies, the lantern, pawprints
  // =====================================================================================================
  const props = {};
  function buildProps() {
    const cageU = { uTime: { value: 0 }, uK: { value: 1 } };
    const cageMat = new THREE.ShaderMaterial({
      uniforms: cageU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform float uTime, uK; varying vec2 vUv;
        void main(){ float bar = smoothstep(0.86, 0.97, fract(vUv.x * 12.0)); float ring = smoothstep(0.9, 1.0, abs(vUv.y * 2.0 - 1.0));
          float a = max(bar, ring) * (0.75 + 0.25 * sin(uTime * 3.0 + vUv.y * 9.0)) * uK; a *= step(vUv.y, uK * 1.1);
          gl_FragColor = vec4(vec3(1.0, 0.72, 0.45) * a, 1.0); }`,
    });
    props.cageU = cageU;
    props.cage = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 1.6, 32, 1, true).translate(0, 0.8, 0), cageMat);
    props.cage.name = "lightCage";
    props.cage.visible = false;

    const pebGeo = new THREE.IcosahedronGeometry(0.13, 1);
    const pebMat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, emissive: 0x4ab8ff, emissiveIntensity: 1.4, roughness: 0.2, metalness: 0.3 });
    props.pebbles = new THREE.InstancedMesh(pebGeo, pebMat, 6);
    props.pebbles.name = "pebbles"; props.pebbles.frustumCulled = false; props.pebbles.visible = false;
    props.pebbles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    const flyMat = new THREE.MeshBasicMaterial({ color: 0xe6ff8a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    props.flies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.075, 8, 6), flyMat, 10);
    props.flies.name = "fireflies"; props.flies.frustumCulled = false; props.flies.visible = false;
    props.flies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    props.flyHalo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9fd04a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 10);
    props.flyHalo.name = "fireflyHalo"; props.flyHalo.frustumCulled = false; props.flyHalo.visible = false;
    props.flyHalo.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

    props.lantern = new THREE.Group(); props.lantern.name = "leafLantern";
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8, 0, TAU, 0, PI * 0.7), new THREE.MeshStandardMaterial({ color: 0x3f7a2a, side: THREE.DoubleSide, roughness: 0.8 }));
    leaf.rotation.x = PI; leaf.position.y = 0.12;
    props.lanternGlow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0xf2ff9a, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false }));
    props.lanternGlow.position.y = 0.06;
    props.lantern.add(leaf, props.lanternGlow);
    props.lantern.visible = false;

    const prGeo = new THREE.CircleGeometry(0.075, 10).rotateX(-PI / 2);
    props.prints = new THREE.InstancedMesh(prGeo, new THREE.MeshBasicMaterial({ color: 0x150f0a, transparent: true, opacity: 0.75, depthWrite: false }), 18);
    props.prints.name = "pawprints"; props.prints.visible = false; props.prints.frustumCulled = false;

    // the wind that carries you up in phase 3 (a column of streaks around the player while riding)
    const windU = { uTime: { value: 0 }, uK: { value: 0 } };
    props.windU = windU;
    props.wind = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 3.2, 20, 1, true).translate(0, 0.6, 0), new THREE.ShaderMaterial({
      uniforms: windU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform float uTime, uK; varying vec2 vUv; ${GLSL_NOISE}
        void main(){ float n = k3f(vec2(vUv.x * 8.0, vUv.y * 2.0 - uTime * 2.4)); float a = smoothstep(0.5, 0.85, n) * sin(vUv.y * 3.14159) * 0.7 * uK;
          gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * a, 1.0); }`,
    }));
    props.wind.name = "rideWind"; props.wind.visible = false; props.wind.frustumCulled = false;
  }
  function propsTo(g) {
    g.add(props.cage, props.pebbles, props.flies, props.flyHalo, props.lantern, props.prints, props.wind);
    props.cage.visible = props.pebbles.visible = props.flies.visible = props.flyHalo.visible = false;
    props.lantern.visible = props.prints.visible = props.wind.visible = false;
  }

  // =====================================================================================================
  // the sky (the flight there, the wind duet, the flight home): a world built here
  // =====================================================================================================
  function buildSky() {
    const group = new THREE.Group(); group.name = "sky";
    const U = { uTime: { value: 0 }, uFlow: { value: 0 }, uWarm: { value: 1 } };
    const dome = skyDome(THREE, { top: 0x4c62a6, horizon: 0xffc690, bottom: 0xffe2c0, glowCol: 0xffa452, glowDir: [0, 0.1, 1], glowK: 1.25, uTime: U.uTime, clouds: 0.55, cloudCol: 0xfff0e0 });
    group.add(dome.mesh);
    // the cloud sea: one big plane, soft billows lit from the low sun
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 1, 1).rotateX(-PI / 2), new THREE.ShaderMaterial({
      uniforms: U, fog: false, transparent: false,
      vertexShader: "varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
      fragmentShader: `uniform float uTime, uFlow, uWarm; varying vec3 vW; ${GLSL_NOISE}
        void main(){ vec2 p = vW.xz * 0.012 + vec2(0.0, -uFlow * 0.012);
          float n = k3f(p) * 0.65 + k3f(p * 3.1 + uTime * 0.02) * 0.35;
          float hi = smoothstep(0.35, 0.8, n);
          vec3 shade = mix(vec3(0.55, 0.45, 0.55), vec3(0.62, 0.66, 0.82), 1.0 - uWarm);
          vec3 lit = mix(vec3(1.0, 0.86, 0.7), vec3(0.95, 0.97, 1.0), 1.0 - uWarm);
          vec3 col = mix(shade, lit, hi);
          float d = length(vW.xz - cameraPosition.xz);
          vec3 haze = mix(vec3(1.0, 0.8, 0.62), vec3(0.85, 0.88, 0.95), 1.0 - uWarm);
          col = mix(col, haze, smoothstep(150.0, 1000.0, d));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    sea.name = "cloudSea";
    group.add(sea);
    // puffs that stream past (instanced; the "speed" you feel)
    const PUFF = 26;
    // soft cumulus: lit from the sun side, shadowed underneath, edges feathered to nothing (no hard facets)
    const puffMat = new THREE.ShaderMaterial({
      uniforms: { uWarm: U.uWarm }, transparent: true, depthWrite: false, fog: false,
      vertexShader: `varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ vec4 p = vec4(position, 1.0); vec3 n = normal;
          #ifdef USE_INSTANCING
            p = instanceMatrix * p; n = mat3(instanceMatrix) * n;
          #endif
          vec4 w = modelMatrix * p; vN = normalize(mat3(modelMatrix) * n); vV = normalize(cameraPosition - w.xyz); vY = position.y;
          gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uWarm; varying vec3 vN; varying vec3 vV; varying float vY;
        void main(){ vec3 n = normalize(vN);
          float sun = clamp(dot(n, normalize(vec3(0.0, 0.55, 1.0))) * 0.5 + 0.5, 0.0, 1.0);
          float under = smoothstep(-0.6, 0.4, vY);
          vec3 lit = mix(vec3(0.86, 0.9, 1.0), vec3(1.0, 0.9, 0.78), uWarm);
          vec3 shade = mix(vec3(0.52, 0.56, 0.7), vec3(0.72, 0.56, 0.6), uWarm);
          vec3 col = mix(shade, lit, sun * (0.45 + 0.55 * under));
          float rim = pow(1.0 - abs(dot(n, normalize(vV))), 2.0);
          col += rim * 0.18 * lit;
          float a = 0.85 * smoothstep(0.0, 0.55, abs(dot(n, normalize(vV))));
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    const puffGeo = lumpify(THREE, new THREE.IcosahedronGeometry(1, 3), 0.22, 1.6, 5);
    { const pp = puffGeo.attributes.position, nn = puffGeo.attributes.normal, v = new THREE.Vector3(); for (let i = 0; i < pp.count; i++) { v.fromBufferAttribute(pp, i).normalize(); nn.setXYZ(i, v.x, v.y, v.z); } }
    const puffs = new THREE.InstancedMesh(puffGeo, puffMat, PUFF);
    puffs.name = "skyPuffs"; puffs.frustumCulled = false; puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const PX = new Float32Array(PUFF), PY = new Float32Array(PUFF), PZ = new Float32Array(PUFF), PS = new Float32Array(PUFF);
    for (let i = 0; i < PUFF; i++) { PX[i] = rnd(-90, 90); if (Math.abs(PX[i]) < 12) PX[i] += Math.sign(PX[i] || 1) * 14; PY[i] = rnd(2, 30); PZ[i] = rnd(-300, 300); PS[i] = rnd(5, 16); }
    group.add(puffs);
    // the volcano (far) and the jungle (far)
    const coneMat = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, emissive: 0x2a0a02, fog: false });
    // a real strato-volcano silhouette: concave flanks, a notched crater rim, gullies running down, ash on the
    // shoulders and a lava-lit lip (one lathe, ~2.5k triangles)
    const coneGeo = (() => {
      const prof = [];
      for (let i = 0; i <= 14; i++) { const t = i / 14; prof.push(new THREE.Vector2(15 + 145 * Math.pow(1 - t, 2.1), -95 + 187 * t)); }
      prof.push(new THREE.Vector2(11, 82));
      const g = new THREE.LatheGeometry(prof, 72);
      const P = g.attributes.position, col = new Float32Array(P.count * 3);
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i), a = Math.atan2(x, z), h = (y + 95) / 187;
        const gully = Math.pow(Math.abs(Math.sin(a * 11 + noise3(x * 0.02, y * 0.02, z * 0.02) * 3)), 0.6);
        const k = 1 + (gully - 0.6) * 0.07 * (1 - h * 0.6) + noise3(x * 0.03, y * 0.03, z * 0.03) * 0.06;
        const notch = h > 0.95 ? 1 - 0.12 * Math.max(0, Math.sin(a * 3 + 1)) : 1;
        P.setXYZ(i, x * k, y * notch, z * k);
        const ash = Math.max(0, Math.min(1, (h - 0.45) * 2.2)) * (0.6 + 0.4 * gully);
        let r = 0.16 + 0.05 * gully, gg = 0.13 + 0.04 * gully, b = 0.12 + 0.035 * gully;
        r += ash * 0.22; gg += ash * 0.21; b += ash * 0.2;
        if (h > 0.93) { const lip = (h - 0.93) / 0.07; r += lip * 0.5; gg += lip * 0.16; }
        col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b;
      }
      g.setAttribute("color", new THREE.BufferAttribute(col, 3));
      g.computeVertexNormals();
      return g;
    })();
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.name = "farVolcano";
    const glow = new THREE.Mesh(new THREE.SphereGeometry(28, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff6a20, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    glow.position.y = 98; glow.scale.set(0.55, 0.3, 0.55);
    cone.add(glow);
    group.add(cone);
    const jungleG = new THREE.Group(); jungleG.name = "farJungle";
    const hills = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), new THREE.MeshLambertMaterial({ color: 0x2f5a2a, emissive: 0x0a1608, fog: false }), 24);
    hills.name = "farJungleHills";
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, r = rnd(10, 150), s = rnd(30, 70);
      tm.compose(tp.set(Math.sin(a) * r, -s * 0.55, Math.cos(a) * r * 0.6), tq.identity(), ts.set(s, s * 0.6, s));
      hills.setMatrixAt(i, tm);
    }
    jungleG.add(hills);
    group.add(jungleG);
    const world = {
      name: "sky", group, U, swim: false, maxStep: 0.5,
      env: { background: 0xf2c49a, fog: [0xf2c49a, 300, 1500], hemi: [0xffe6c8, 0x8a6a5a, 1.15], sun: [0xffc080, 1.8], sunDir: [0, 0.3, 1], far: 1700, dark: false },
      heightAt() { return -200; }, waterAt() { return -Infinity; }, surfaceAt() { return "air"; },
      colliders: [], k: 0, speed: 30, dir: 1,
      // where the two far places are: 0 = just left, 1 = arriving
      setProgress(k) {
        world.k = k;
        if (world.dir > 0) {      // home: the volcano falls behind, the jungle comes up ahead
          cone.position.set(-60, -40, -260 - k * 700); cone.scale.setScalar(1 - k * 0.3);
          jungleG.position.set(30, 0, 1100 - k * 960); jungleG.scale.setScalar(0.6 + k * 0.7);
          jungleG.visible = true;
        } else {                   // there: the volcano comes up ahead, the jungle behind
          cone.position.set(40, -40, 1200 - k * 900); cone.scale.setScalar(0.7 + k * 0.4);
          jungleG.position.set(-30, 0, -300 - k * 300); jungleG.scale.setScalar(0.7);
          jungleG.visible = k < 0.6;
        }
      },
      setLook(warm) {
        U.uWarm.value = warm;
        if (warm > 0.5) { dome.u.uTop.value.set(0x4c62a6); dome.u.uHor.value.set(0xffc690); dome.u.uGlowCol.value.set(0xffa452); dome.u.uGlowK.value = 1.25; glow.material.opacity = 0.15; coneMat.emissive.set(0x0a0402); }
        else { dome.u.uTop.value.set(0x2a2440); dome.u.uHor.value.set(0xb05a3a); dome.u.uGlowCol.value.set(0xff6a30); dome.u.uGlowK.value = 1.0; glow.material.opacity = 0.6; coneMat.emissive.set(0x2a0a02); }
      },
      update(dt) {
        U.uTime.value += dt;
        U.uFlow.value += dt * world.speed;
        for (let i = 0; i < PUFF; i++) {
          PZ[i] -= dt * world.speed * 1.6;
          if (PZ[i] < -300) { PZ[i] += 600; PX[i] = rnd(-90, 90); if (Math.abs(PX[i]) < 12) PX[i] += Math.sign(PX[i] || 1) * 14; }
          tm.compose(tp.set(PX[i], PY[i], PZ[i]), tq.identity(), ts.set(PS[i], PS[i] * 0.45, PS[i] * 0.8));
          puffs.setMatrixAt(i, tm);
        }
        puffs.instanceMatrix.needsUpdate = true;
      },
      onEnter() { FX("windStreaks", true, 0, -1, 0.9); },
      onLeave() { FX("windStreaks", false); },
    };
    world.setProgress(0);
    return world;
  }

  // =====================================================================================================
  // build / worlds
  // =====================================================================================================
  function build() {
    volcano = ctx.shared("volcano", () => createVolcano(ctx));
    magmor = ctx.shared("magmor", () => createMagmor(ctx, volcano));
    dream = ctx.shared("dream", () => createDream(ctx));
    jungle = ctx.shared("jungle", () => createJungle(ctx));
    tribe = ctx.shared("tribe", () => createTribe(ctx));
    friend = ctx.shared("friend", () => createFriend(ctx));
    potions = ctx.shared("potions", () => createPotions(ctx));
    wizard = getWizard(ctx);
    sky = buildSky();
    buildProps();
    V = volcano.P; J = jungle.P; mem = tribe.members;
    if (typeof tribe.warm === "function") tribe.warm();
    // only an OPEN vent is a target for the potion's aim
    for (const v of magmor.vents) if (!Object.getOwnPropertyDescriptor(v, "targetable")) Object.defineProperty(v, "targetable", { get() { return v.open && !v.plugged; }, configurable: true });
    if (ctx.debug) ctx.debug.level12 = { volcano, magmor, dream, jungle, tribe, friend, potions, sky, props, get ride() { return ride; }, get dance() { return dance; }, pebbles, fly, atk };
  }

  // Everything back to nothing, behind black. Every starter begins here.
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
    ui.setTricks(null);
    ui.setCombo(null);
    ui.beat.clear(); ui.beat.show(false);
    ctx.setSpeaker(null);
    clearGoal();
    setHints(null);
    stopBeds();
    A("dreamAmbience", false); A("jungleAmbience", false); A("screamCharge", 0); A("muffle", 0, 0); A("lavaAmbience", 0);
    FX("windStreaks", false); FX("fireflies", false);
    if (ctx.vehicle.active) ctx.vehicle.exit();
    ab.cancel();
    ab.potion.disable(); ab.scream.disable(); ab.shoot.disable();
    ab.potion.onThrow = ab.potion.onEmpty = null;
    ab.scream.onStart = ab.scream.onCharge = ab.scream.onRelease = ab.scream.onFizzle = ab.scream.onCancel = null;
    ab.targets = null;
    ab.buttons({});
    ctx.health.disable();
    ctx.health.shield = false;
    ctx.health.onHurt = null; ctx.health.onDeath = null;
    ctx.checkpoint.clear();
    // modules
    magmor.stop();
    magmor.onPhase = magmor.onDefeat = magmor.onAttack = null;
    magmor.group.visible = false;
    volcano.bombs.onLand = null;
    volcano.bombs.clear();
    potions.reset();
    if (potions.living && potions.living.hide) potions.living.hide();
    tribe.reset();
    if (tribe.food && tribe.food.clear) tribe.food.clear();
    friend.attachTo(null);
    friend.reset();
    friend.onEvent = null;
    friend.group.scale.set(1, 1, 1);
    platypus.reset();
    if (platypus.holdFlask) platypus.holdFlask(false);
    wizard.setTalking(false);
    wizard.group.visible = false;
    // the player
    player.scripted = false; player.hidden = false; player.enabled = false; player.carrying = false;
    player.maxSpeed = 3; player.lock = 0; player.face = null; player.canJump = player.canDive = true;
    player.kx = player.kz = 0; player.invuln = 0;
    player.stop();
    cam.wantDist = 3.7; cam.pitch = 0.42;
    // flags
    cpZ = 0; ventHurtT = 0; songK = 0; demoOn = false; spellDone = false; wakes = 0; dreamStage = 0; rockT = 0;
    bossN = -1; bossOn = false; defeated = false; lastAttack = "";
    ride = null; given = false; dance = null;
    foodHeld = -1; foodDone = 0; foodGiven[0] = foodGiven[1] = foodGiven[2] = false;
    tags = 0; tagStage = 0; tagT = 0; pebblesGot = 0; flies = 0; missT = 0; missStage = 0; skyK = 0; skyMode = "";
    cd.sting = cd.slap = 0;
    ui.setCooldown("sting", 0); ui.setCooldown("slap", 0);
    props.cageU.uK.value = 1;
  }

  function leaveWorld(w) { if (ctx.world === w) ctx.setWorld(null); }
  function toVolcano(scene) {
    leaveWorld(volcano);
    volcano.reset();
    volcano.setScene(scene);
    volcano.group.add(magmor.group, friend.group, potions.group);
    propsTo(volcano.group);
    friend.setWorld(volcano);
    potions.setWorld(volcano);
    friend.visible = false;
    ctx.setWorld(volcano);
    FX("setGround", volcano.heightAt, null);
    place = "volcano";
  }
  function toDream() {
    leaveWorld(dream);
    dream.setScene("school");
    dream.group.add(friend.group);
    propsTo(dream.group);
    friend.setWorld(dream);
    ctx.setWorld(dream);
    FX("setGround", dream.heightAt, null);
    place = "dream";
  }
  function toSky(dir) {
    leaveWorld(sky);
    sky.group.add(friend.group);
    propsTo(sky.group);
    sky.dir = dir;
    sky.setLook(dir > 0 ? 1 : 0);
    sky.setProgress(0);
    ctx.setWorld(sky);
    FX("setGround", null, null);
    place = "sky";
  }
  function groundWater(x, z) { const w = jungle.waterAt(x, z); return w > -1e6 ? w : null; }
  function gy(x, z) { return Math.max(jungle.heightAt(x, z), jungle.waterAt(x, z) - 0.1); }
  function toJungle(time) {
    leaveWorld(jungle);
    jungle.reset();
    jungle.group.add(tribe.group, friend.group, potions.group);
    propsTo(jungle.group);
    tribe.setWorld(jungle); friend.setWorld(jungle); potions.setWorld(jungle);
    jungle.setTime(time, 0);
    ctx.setWorld(jungle);
    FX("setGround", jungle.heightAt, groundWater);
    jungle.setZone("camp", true);
    place = "jungle";
  }
  function tribeLite(on) {
    tribe.maxFull = on ? 2 : 4;
    for (const k in mem) {
      const g = mem[k] && mem[k].body && mem[k].body.group;
      if (!g) continue;
      g.traverse((o) => { if (o.isMesh) { if (o.userData.l12Shadow === undefined) o.userData.l12Shadow = o.castShadow; o.castShadow = on ? false : o.userData.l12Shadow; } });
    }
  }
  function camp(mood) {
    tribeLite(true);
    if (tribe.village) {
      tribe.village.populate(J.spots);
      tribe.village.setMood(mood || "calm", 0);
    }
    for (const k in mem) mem[k].visible = false;
    mem.burra.visible = true;
    mem.burra.place(J.elder.x, J.elder.z, J.elder.yaw || PI);
    mem.burra.do("sit", { at: { x: J.elder.x, z: J.elder.z } });
  }

  // =====================================================================================================
  // PART 1 - the flight, the slope, the spell
  // =====================================================================================================
  function startIntro() {
    hardStop();
    step = "intro";
    toSky(-1);
    flightPose(0);
    start();
  }
  function start() {
    const g = gen;
    cinema.titleCard({ kicker: "LEVEL 12", title: meta.title }, () => {
      if (g !== gen || step !== "intro") return;
      flight();
    });
  }
  // the player rides the wind, scripted, at the sky's origin; the world streams past
  function flightPose(t) {
    player.scripted = true;
    player.x = 0; player.z = 0; player.y = 30 + Math.sin(t * 1.3) * 0.4; player.yaw = 0;
    player.grounded = false; player.vy = 0; player.speed = 0;
    platypus.group.position.set(player.x, player.y, player.z);
    platypus.group.rotation.set(0.12 + Math.sin(t * 0.9) * 0.05, 0, Math.sin(t * 0.7) * 0.12);
  }
  function flight() {
    step = "intro";
    skyMode = "travel";
    skyK = 0;
    M("play", "volcano", { at: "now", intensity: 0.25 });
    bed("windGust", 0.5);
    const g = gen, pg = platypus.group;
    cinema.play([
      { fade: "clear", dur: 1.2 },
      { shot: { pos: [3.5, 1.2, -6], look: pg, lookY: 0.2, fov: F(46), track: pg, to: { pos: [-4, 2.2, -7] }, dur: 5, ease: "inOut" }, hold: false },
      { caption: "The LIVING POTION is in your paws.", dur: 2.6, narr: true },
      { caption: "Pip is in a cage, over lava, in a volcano.", dur: 2.8, narr: true },
      { shot: { pos: [0, 3, -9], look: [0, 10, 400], fov: F(50), track: pg, to: { pos: [0, 1.4, -6] }, dur: 4.5, ease: "inOut" }, hold: false },
      { caption: "Wobble's map glows. The wind knows the way.", dur: 3.2, narr: true },
      { fade: "black", dur: 0.8 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startTravel(); } });
  }

  function slopeKit() {
    wearGear();
    walkSpeed();
    ctx.health.enable({ max: 6, hearts: true, regen: 0.35, regenDelay: 5, label: "Health" });
  }
  function startTravel() {
    hardStop();
    toVolcano("slope");
    slopeKit();
    const s = V.spawn;
    player.teleport(s.x, s.z, 0);
    cam.yaw = 0;
    step = "travel";
    cpZ = -10;
    slopeCheckpoint(s.x, s.z, "The black slope", true);
    M("play", "volcano", { at: "now", intensity: 0.3 });
    M("setIntensity", 0.3, 0.1);
    A("lavaAmbience", 0.5);
    FX("embers", s.x, s.y + 1, s.z, 3, 12);
    player.enabled = true;
    ui.showHud(true);
    objective("travel", "Climb to the dream shrine", "follow the path up · hop the lava · wait for the steam");
    setGoal(V.shrine.x, V.shrine.y, V.shrine.z, 0xb488ff);
    setHints("Follow the path up the mountain to the purple light.", "Lava channels: jump over them (Space). Steam vents puff every 3 s — wait, then pass.");
    cinema.fade("clear", 1.0);
    later(1.5, () => ui.hint("Lava is deadly! Jump over the glowing channels.", 4));
  }
  function slopeCheckpoint(x, z, label, silent) {
    ctx.checkpoint.set("slope" + Math.round(z), { x, z, yaw: 0, label, silent: !!silent, restore: () => { volcano.bombs.clear(); } });
  }
  // a paw on the edge is forgiven: only a step well into the lava counts (0.3 m in, every side)
  function inLava(x, z) {
    const o = volcano.onLava;
    return o(x, z) && o(x + 0.3, z) && o(x - 0.3, z) && o(x, z + 0.3) && o(x, z - 0.3);
  }
  function slopeHazards(dt) {
    if (!player.enabled || ctx.checkpoint.respawning || ctx.health.dead) return;
    if (player.grounded && inLava(player.x, player.z)) {
      FX("lavaSplash", player.x, player.y, player.z, 0.8);
      A("lavaBubble", player.x, player.z);
      ctx.health.kill({ x: player.x, z: player.z, kind: "fall" });
      return;
    }
    if (ventHurtT > 0) ventHurtT -= dt;
    const v = volcano.ventAt(player.x, player.z);
    if (v && ventHurtT <= 0 && player.y - volcano.heightAt(player.x, player.z) < 1.6) {
      ventHurtT = 1.2;
      if (ctx.health.damage(1, { x: v.x, z: v.z - 1, kind: "blast", knock: 6 })) ui.hint("Ouch, steam! Wait for the puff to stop.", 2.5);
    }
  }
  function updateTravel(dt) {
    slopeHazards(dt);
    // a checkpoint after each lava channel
    const C = V.channels;
    for (let i = 0; i < C.length; i++) {
      const z = C[i].z + 3.2;
      if (player.z > z && cpZ < z && player.grounded && !volcano.onLava(player.x, player.z)) { cpZ = z; slopeCheckpoint(player.x, player.z, "Over the lava", false); progressed(); M("setIntensity", 0.4 + i * 0.1, 3); }
    }
    if (step === "travel" && nearP(V.shrine, 3.2)) beginSpell();
  }

  // ---- the spell ----
  function startSpell() {
    hardStop();
    toVolcano("slope");
    slopeKit();
    const s = V.shrine;
    player.teleport(s.x, s.z, 0);
    cam.yaw = 0;
    slopeCheckpoint(s.x, s.z, "The dream shrine", true);
    M("play", "volcano", { at: "now", intensity: 0.6 });
    A("lavaAmbience", 0.5);
    player.enabled = true;
    ui.showHud(true);
    cinema.fade("clear", 0.8);
    beginSpell();
  }
  function beginSpell() {
    step = "spell";
    clearGoal();
    progressed();
    volcano.runes.reset();
    songK = 0; spellDone = false;
    objective("spell", "Do the dream spell", "touch the stones (E) in the order of the song");
    setHints("Listen: the stones light up in order. Touch them (E) in the same order.", "The order is: first the stone that lights first... watch again — it replays after a mistake.");
    cinema.caption("[Light the stones in the order of the song.]", 3.6, { who: "Wizard Wobble (far away)" });
    M("motif", "wobble", { at: "beat" });
    later(2.4, playSong);
  }
  function playSong() {
    if (step !== "spell" || spellDone) return;
    demoOn = true;
    volcano.runes.reset();
    for (let k = 0; k < SONG.length; k++) {
      const i = SONG[k];
      later(0.75 * k, () => { A("spellChime", i); volcano.runes.light(i, true); demoLit = i; });
      later(0.75 * k + 0.6, () => { demoLit = -1; if (!spellDone) volcano.runes.light(i, false); });
    }
    later(0.75 * SONG.length + 0.4, () => { demoOn = false; volcano.runes.reset(); songK = 0; ui.hint("Now you! Touch the stones in that order.", 3); });
  }
  function touchRune() {
    const i = volcano.runes.nearest(player.x, player.z, 2.1);
    if (i < 0 || demoOn || spellDone) return;
    progressed();
    if (i === SONG[songK]) {
      volcano.runes.light(i, true);
      A("spellChime", i);
      platypus.trick("wave");
      player.lock = 0.5;
      songK++;
      if (songK >= SONG.length) {
        spellDone = true;
        ui.objectiveDone();
        A("spellChime", 4); later(0.25, () => A("spellChime", 2)); later(0.5, () => A("spellChime", 0));
        FX("sparkle", v1.set(V.bed.x, V.bed.y + 1, V.bed.z), 0xb488ff, 24);
        later(1.2, () => { objective("sleep", "Lie on the warm stone", "the middle of the ring · Sleep (E)"); setGoal(V.bed.x, V.bed.y + 0.4, V.bed.z, 0xb488ff); setHints("Walk to the flat stone in the middle and press E to sleep."); });
      }
    } else {
      A("screamFizzle");
      FX("sparkle", v1.set(volcano.runes[i].x, V.bed.y + 1.2, volcano.runes[i].z), 0x553366, 6);
      volcano.runes.reset();
      songK = 0;
      ui.hint("Fzzt... not that one. Listen again.", 2.5);
      later(1.2, playSong);
    }
  }
  function updateSpell(dt) {
    slopeHazards(dt);
    if (cinema.playing) return;
    if (spellDone) { setAct(nearP(V.bed, 2.0) ? "Sleep" : null); return; }
    setAct(!demoOn && volcano.runes.nearest(player.x, player.z, 2.1) >= 0 ? "Touch" : null);
  }
  function sleepAtShrine() {
    setAct(null);
    clearGoal();
    player.enabled = false;
    const b = V.bed, g = gen;
    cinema.play([
      { call: () => player.walkTo(b.x, b.z - 0.2, { speed: 0.6, face: PI }) },
      { until: () => !player.walking, max: 3 },
      { call: () => { platypus.sleep(true); M("setIntensity", 0.1, 3); } },
      { shot: { pos: [b.x + 2.4, b.y + 1.6, b.z - 2.6], look: [b.x, b.y + 0.3, b.z], fov: F(40), to: { pos: [b.x + 1.2, b.y + 0.9, b.z - 1.4] }, dur: 3.2, ease: "inOut" }, hold: false },
      { caption: "The stone is warm. The runes hum.", dur: 2.6, narr: true },
      { fade: "black", dur: 1.4 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startDream(); } });
  }

  // =====================================================================================================
  // PART 2 - the ember dream
  // =====================================================================================================
  const DREAM_PIP = { x: 0, z: 10.5 };
  const DREAM_WAY = [{ x: -3, z: -2 }, { x: 2.5, z: 4 }, { x: 0, z: 9 }];
  function startDream() {
    hardStop();
    toDream();
    step = "dream";
    wearGear();
    walkSpeed();
    const s = dream.P.spawn;
    player.teleport(s.x, s.z, 0);
    cam.yaw = 0;
    cinema.tint("warm", 0.55);
    M("play", "dream", { at: "now", intensity: 0.4 });
    A("dreamAmbience", true);
    // Pip asleep in a cage of light
    friend.visible = true;
    friend.place(DREAM_PIP.x, DREAM_PIP.z, PI);
    friend.do("still");
    friend.body.sleep(true);
    props.cage.visible = true;
    props.cage.position.set(DREAM_PIP.x, dream.heightAt(DREAM_PIP.x, DREAM_PIP.z), DREAM_PIP.z);
    props.cageU.uK.value = 1;
    dreamStage = 0; wakes = 0;
    player.enabled = true;
    ui.showHud(true);
    objective("dream", "Find Pip in the dream", "follow the warm lights");
    setGoal(DREAM_WAY[0].x, dream.heightAt(DREAM_WAY[0].x, DREAM_WAY[0].z), DREAM_WAY[0].z, 0xffb070);
    setHints("Follow the warm light. Pip is somewhere ahead.", "Walk toward the glowing cage of light in the distance.");
    cinema.fade("clear", 1.6);
    later(2, () => cinema.caption("[...Pip?]", 2.4, { who: "You" }));
  }
  function updateDream() {
    if (cinema.playing) return;
    if (dreamStage < DREAM_WAY.length) {
      const w = DREAM_WAY[dreamStage];
      if (nearP(w, 2.2)) {
        dreamStage++;
        progressed();
        FX("sparkle", v1.set(w.x, dream.heightAt(w.x, w.z) + 0.8, w.z), 0xffc080, 12);
        A("spellChime", dreamStage);
        M("setIntensity", 0.4 + dreamStage * 0.2, 2);
        const n = dreamStage < DREAM_WAY.length ? DREAM_WAY[dreamStage] : DREAM_PIP;
        setGoal(n.x, dream.heightAt(n.x, n.z) + (dreamStage < DREAM_WAY.length ? 0 : 1.8), n.z, 0xffb070);
        if (dreamStage === DREAM_WAY.length) { M("motif", "pip", { at: "beat" }); objective("dream2", "Wake up Pip!", "go to her · press E"); }
      }
      return;
    }
    const near = nearP(DREAM_PIP, 2.0);
    setAct(near ? "Wake up Pip!" : null);
  }
  function wakePip() {
    if (wakes >= 3) return;
    wakes++;
    progressed();
    const lines = ["[Wake up, Pip.]", "[Wake up!]", "[Pip... wake up.]"];
    cinema.caption(lines[wakes - 1], 2.4, { who: "You" });
    platypus.trick(wakes === 2 ? "spin" : "wave");
    player.lock = 0.6;
    friend.body.blink();
    A("friendChirp", "sleepy", 0, 0.4 + wakes * 0.15);
    props.cageU.uK.value = 1 - wakes * 0.22;
    if (wakes < 3) return;
    setAct(null);
    clearGoal();
    ui.objectiveDone();
    const g = gen, pg = friend.group;
    cinema.play([
      { wait: 1.2 },
      { shot: { pos: [DREAM_PIP.x + 1.4, 0.7, DREAM_PIP.z - 1.8], look: pg, lookY: 0.3, fov: F(36), dur: 3.6 }, hold: false },
      { call: () => { friend.body.sleep(false); friend.body.wakeStretch(); A("dreamWake"); } },
      { wait: 1.6 },
      { call: () => { props.cageU.uK.value = 0.0; FX("sparkle", v1.set(DREAM_PIP.x, 1, DREAM_PIP.z), 0xffd090, 24); friend.do("idle"); friend.lookAt(platypus.group); M("setIntensity", 1, 2); } },
      { caption: "[You came.]", dur: 2.6, who: "Pip (a whisper)" },
      { call: () => friend.emote("happy") },
      { wait: 1.2 },
      { fade: "white", dur: 1.0 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startWake(); } });
  }

  // =====================================================================================================
  // PART 3 - waking, the climb to the crater, the rim, MAGMOR rises
  // =====================================================================================================
  function startWake() {
    hardStop();
    toVolcano("slope");
    slopeKit();
    step = "wake";
    const b = V.bed;
    player.teleport(b.x, b.z - 0.2, 0);
    cam.yaw = 0;
    platypus.sleep(true);
    volcano.runes.reset();
    for (let i = 0; i < 5; i++) volcano.runes.light(i, true);
    cinema.fade("black", 0);
    cinema.fade("white", 0);
    M("play", "volcano", { at: "now", intensity: 0.5 });
    A("lavaAmbience", 0.6);
    slopeCheckpoint(b.x, b.z, "The dream shrine", true);
    const g = gen;
    cinema.play([
      { fade: "clear", dur: 1.2 },
      { call: () => { platypus.sleep(false); platypus.wakeStretch(); A("dreamWake"); } },
      { wait: 1.2 },
      { call: () => { volcano.quake(0.6, 2.2); A("rockGrind", 0.8); } },
      { caption: "The mountain trembles. Pip is awake now — up there.", dur: 3, narr: true },
    ], { skippable: true, onDone: () => { if (g === gen) beginClimb(); } });
  }
  function beginClimb() {
    step = "wake";
    platypus.sleep(false);
    player.enabled = true;
    ui.showHud(true);
    rockT = 3;
    objective("climb", "Climb to the crater", "falling rocks — step out of the red circles");
    setGoal(V.crater.x, V.crater.y, V.crater.z, 0xff9050);
    setHints("Keep climbing up the path to the crater.", "Red circles on the ground: a rock is falling there. Step out of them!");
    M("setIntensity", 0.8, 3);
  }
  function updateWake(dt) {
    slopeHazards(dt);
    if (cinema.playing || !player.enabled) return;
    rockT -= dt;
    if (rockT <= 0) {
      rockT = rnd(1.6, 2.6);
      const ax = player.x + Math.sin(player.yaw) * player.speed * 1.0 + rnd(-1.5, 1.5), az = player.z + Math.cos(player.yaw) * player.speed * 1.0 + rnd(-1, 2);
      volcano.bombs.launch(player.x + rnd(-10, 10), player.y + 26, player.z + 30, ax, az, 1.7, 1.7);
      if (Math.random() < 0.35) volcano.quake(0.25, 0.8);
    }
    if (nearP(V.crater, 4.2) || player.z > V.crater.z - 2.5) rimScene();
  }
  function rimScene() {
    step = "rim";
    player.enabled = false;
    clearGoal();
    ui.objectiveDone();
    const g = gen;
    cinema.fade("black", 0.6, () => {
      if (g !== gen) return;
      volcano.bombs.clear();
      volcano.setScene("cell");
      ctx.setEnv(volcano.env, 0);
      const r = V.rim;
      player.teleport(r.x, r.z, 0);
      cam.yaw = 0;
      friend.visible = true;
      friend.attachTo(volcano.cage.group);
      friend.lookAt(platypus.group);
      magmor.reset(0);
      magmor.group.visible = false;
      rimCutscene();
    });
  }
  function rimCutscene() {
    const g = gen, c = V.camRim, cc = V.camCage, cb = V.camBoss;
    const rise = () => { magmor.group.visible = true; magmor.rise(8); M("stinger", "danger"); A("magmorRoar", 1); };
    cinema.play([
      { fade: "clear", dur: 0.8 },
      { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: [c.look.x, c.look.y, c.look.z], fov: F(46), to: { pos: [c.pos.x - 3, c.pos.y + 1, c.pos.z + 6] }, dur: 4.2, ease: "inOut" }, hold: false },
      { caption: "Pip's cage hangs on chains over the lava.", dur: 2.6, narr: true },
      { shot: { pos: [cc.pos.x, cc.pos.y, cc.pos.z], look: [cc.look.x, cc.look.y, cc.look.z], fov: F(38), dur: 3.2, ease: "inOut" }, hold: false },
      { call: () => { friend.emote("call"); A("friendChirp", "call", 0, 0.8); } },
      { caption: "[!!]", dur: 1.6, who: "Pip" },
      { call: () => { volcano.quake(0.9, 6); M("stop", 1.5); } },
      { caption: "The lake bubbles...", dur: 1.6, narr: true },
      { call: rise },
      { shot: { pos: [cb.pos.x, cb.pos.y, cb.pos.z - 20], look: [cb.look.x, cb.look.y, cb.look.z], fov: F(55), to: { pos: [cb.pos.x + 4, cb.pos.y + 2, cb.pos.z - 30] }, dur: 6, ease: "inOut" }, hold: false },
      { wait: 4.5 },
      { call: () => { magmor.roar(1.2); ui.banner("MAGMOR", "HEART OF THE MOUNTAIN", 3.2); } },
      { wait: 2.8 },
      { fade: "black", dur: 0.6 },
    ], { skippable: true, release: null, onSkip: () => { if (g === gen && !magmor.group.visible) rise(); }, onDone: () => { if (g === gen) startBoss(0, true); } });
  }

  // =====================================================================================================
  // PART 4 - MAGMOR
  // =====================================================================================================
  function bossHearts() { return 6 + (magmor.assist > 0 ? 2 : 0); }
  function startBoss(n, fromStory) {
    hardStop();
    toVolcano("arena");
    wearGear();
    walkSpeed(1.15);
    magmor.reset(n);
    magmor.group.visible = true;
    placeOnArena(n);
    ctx.checkpoint.set(BOSS_STEP[n], { label: n === 0 ? "MAGMOR" : "MAGMOR: phase " + (n + 1), silent: !!fromStory, restore: restoreBoss });
    M("play", "inferno", { at: "now", intensity: 0.85 });
    A("lavaAmbience", 0.9);
    cinema.fade("clear", 0.8);
    beginBoss(n);
  }
  function restoreBoss(id) {
    const n = Math.max(0, BOSS_STEP.indexOf(id));
    gen++;
    ctx.clearTimers();
    ctx.setTimeScale(1, 0);
    endRide(true);
    potions.reset();
    volcano.bombs.clear();
    magmor.reset(n);
    magmor.group.visible = true;
    placeOnArena(n);
    if (music && music.state !== "inferno" && music.pending !== "inferno") M("play", "inferno", { at: "now", intensity: 0.85 });
    beginBoss(n);
  }
  // the first island, wherever the lava ring has carried it: the start of every phase
  function placeOnArena(n) {
    volcano.update(0.001, ctx.time.now, player.x, player.z);
    // phases 1-2: the first island; phase 3 (the islands drift apart into a ring): the first wind column's island
    const o = volcano.islands[n === 2 ? volcano.updrafts[0].island : 0];
    const x = o.x, z = o.z;                                // its middle, facing MAGMOR
    player.teleport(x, z, Math.atan2(magmor.x - x, magmor.z - z));
    cam.yaw = player.yaw;
  }
  function bossKit(n) {
    ab.potion.disable(); ab.scream.disable();
    ab.buttons({ sting: true, slap: true });
    ctx.health.enable({ max: bossHearts(), hearts: true, regen: 0, label: "Health" });
    ctx.health.onHurt = onHurt;
    ctx.health.onDeath = null;
    if (n === 1) {
      ab.potion.enable({ count: 2, max: 3, cooldown: 0.8, range: [2, 40], flight: [0.6, 1.15], assist: 5, splash: 1.5, targets: magmor.targets });
      ab.potion.onThrow = onThrow;
      ab.potion.onEmpty = () => ui.hint("No potion! Grab a glowing blue ice flower on an island.", 3);
    }
    if (n === 2) {
      ab.scream.enable({ chargeTime: 0.8, minCharge: 0.2, cooldown: 1.0 });
      ab.scream.onStart = () => { if (platypus.screamCharge) platypus.screamCharge(0.02); };
      ab.scream.onCharge = (f) => { if (platypus.screamCharge) platypus.screamCharge(f); A("screamCharge", f); };
      ab.scream.onCancel = ab.scream.onFizzle = () => { if (platypus.screamCharge) platypus.screamCharge(0); A("screamCharge", 0); };
      ab.scream.onRelease = onScream;
    }
  }
  function beginBoss(n) {
    bossN = n;
    step = BOSS_STEP[n];
    bossOn = true; defeated = false; dashT = 0;
    walkSpeed(1.15);
    bossKit(n);
    magmor.onPhase = onPhase;
    magmor.onDefeat = onDefeat;
    magmor.onAttack = onAttack;
    magmor.start(n);
    player.enabled = true;
    ui.showHud(true);
    ui.boss.show("MAGMOR", 3);
    ui.boss.phase(n);
    ui.boss.set(1);
    M("setPhase", n);
    cam.wantDist = 6.2; cam.pitch = 0.36;
    objKey = "";
    bossObjective();
    if (n === 0) setHints("When the fist lands and rests, a crystal glows on it: run up and Sting (J) it twice!", "Red circle = a fist is coming: step out! Red line = an arm sweeps: JUMP it.");
    if (n === 1) setHints("Hold Q to aim the potion at the glowing vent on its shoulder, let go to throw.", "No potion? Walk into a blue ice flower. Jump the lava waves; strafe the fireballs.");
    if (n === 2) setHints("Stand in a column of wind and press Space: it lifts you up to its chest.", "Up high, when its chest opens, hold R and let go to SCREAM into its heart. Use a different wind each time.");
    if (n === 0) later(1.5, () => ui.hint("Step out of the red circles! Then Sting (J) the glowing crystal.", 4.5));
    if (n === 1) later(1.5, () => ui.hint(keyHint("Hold Q to aim at the open vent, let go to throw!", "Hold Potion, aim at the open vent, let go!"), 4.5));
    if (n === 2) later(1.5, () => ui.hint(keyHint("Stand in the wind and JUMP. Then hold R and let go into its heart!", "Stand in the wind and JUMP. Then hold Scream into its heart!"), 5));
  }
  // a fist aimed at you: a burst of speed to get out from under it (a fair chance, never announced)
  // while the islands drift apart into the ring, the one you stand on carries you with it
  let carryI = -1; const carryP = { x: 0, z: 0 };
  function carryOnDrift() {
    const k = volcano.ringK;
    if (k <= 0 || k >= 1 || ride || !player.enabled) { carryI = -1; return; }
    if (carryI < 0) {
      let bd = 1e9;
      volcano.islands.forEach((o, i) => { const d = dist2(player.x, player.z, o.x, o.z) - o.r; if (d < bd) { bd = d; carryI = i; } });
      if (bd > 1.5) { carryI = -1; return; }
    } else {
      const o = volcano.islands[carryI];
      player.x += o.x - carryP.x; player.z += o.z - carryP.z;
    }
    carryP.x = volcano.islands[carryI].x; carryP.z = volcano.islands[carryI].z;
  }
  function onAttack(name, x, z, t) {
    lastAttack = name; atk.name = name; atk.x = x; atk.z = z; atk.t = t; atk.at = ctx.time.now;
    if ((name === "slam" || name === "double" || name === "grab") && dist2(player.x, player.z, x, z) < 6.5) { dashT = t + 0.35; walkSpeed(1.75); }
  }
  function bossCount() {
    if (bossN === 0) { let k = 0; for (const c of magmor.crystals) if (c.broken) k++; return k; }
    if (bossN === 1) { let k = 0; for (const v of magmor.vents) if (v.plugged) k++; return k; }
    if (bossN === 2) return Math.round((1 - magmor.hp) * 3);
    return 0;
  }
  function bossObjective() {
    if (bossN < 0) return;
    const k = bossCount(), o = BOSS_OBJ[bossN](k);
    objective("b" + bossN + "-" + k, o[0], o[1]);
  }
  function onHurt(amount, src) {
    const k = src && src.kind === "fall" ? "lava" : lastAttack || (src && src.kind) || "?";
    hurtBy[k] = (hurtBy[k] || 0) + 1;
    if (lastAttack === "sweep" && !player.grounded) return;
    if (lastAttack) {
      const tip = { slam: "Red circle: step OUT of it!", sweep: "The arm sweeps along the red line: JUMP over it!", grab: "The hand closes on your island: run off it!",
        wave: "Lava wave! Jump when it reaches you.", fireball: "Fireballs aim where you stand: keep moving sideways!", bombs: "Bombs: watch the red circles and dodge.",
        double: "Both fists! Leave the red circles.", ringslam: "Ring of lava: jump when it reaches you!", breath: "Fire breath: get to the side it is NOT facing!" }[lastAttack];
      if (tip && Math.random() < 0.5) ui.hint(tip, 2.6);
    }
  }
  function onPhase(done) {
    bossOn = false;
    ab.cancel();
    endRide(false);
    progressed();
    ui.objectiveDone();
    ui.boss.set(0);
    M("stinger", "phase");
    const g = gen, next = done + 1;
    ctx.health.shield = true;
    cinema.caption(done === 0 ? "Its fists are broken! It ROARS — the lava rises!" : "The vents are frozen! Its chest cracks open...", 3.2, { narr: true });
    later(3.4, () => {
      if (g !== gen) return;
      ctx.health.shield = false;
      // the fight goes on from where you stand; a fall restarts this phase on the first island
      ctx.checkpoint.set(BOSS_STEP[next], { label: "MAGMOR: phase " + (next + 1), restore: restoreBoss });
      if (next === 2) placeOnArena(2);   // the islands drift apart: start on the first wind column's island
      beginBoss(next);
    });
  }
  function onDefeat() {
    if (defeated) return;
    defeated = true;
    bossOn = false;
    ab.cancel(); ab.scream.disable();
    ctx.health.shield = true;
    ui.boss.set(0);
    ui.objectiveDone();
    clearGoal();
    setHints(null);
    const g = gen;
    ctx.setTimeScale(0.3, 0.15);
    M("stop", 0.6);
    laterReal(1.1, () => ctx.setTimeScale(1, 0.6));
    laterReal(0.6, () => { endRide(false); magmor.coolDown(6); });
    laterReal(3.0, () => M("stinger", "victory"));
    laterReal(3.6, () => { ui.boss.hide(); cinema.caption("The fire goes out of it. MAGMOR cools to stone... and crumbles.", 4, { narr: true }); });
    laterReal(4.2, () => cinema.shot({ pos: [V.camBoss.pos.x, V.camBoss.pos.y + 3, V.camBoss.pos.z - 26], look: [V.boss.x, 14, V.boss.z], fov: F(50), dur: 5 }));
    laterReal(10.5, () => cinema.fade("black", 1.0, () => { if (g === gen) startPotion(); }));
  }
  function updateBoss(dt, raw) {
    magmor.update(dt);
    if (cd.sting > 0) { cd.sting = Math.max(0, cd.sting - dt); ui.setCooldown("sting", cd.sting / CD.sting); }
    if (cd.slap > 0) { cd.slap = Math.max(0, cd.slap - dt); ui.setCooldown("slap", cd.slap / CD.slap); }
    if (dashT > 0) { dashT -= dt; if (dashT <= 0) walkSpeed(1.15); }
    carryOnDrift();
    if (!bossOn) { if (ride) updateRide(dt); return; }
    ui.boss.set(clamp(magmor.hp, 0, 1));
    bossObjective();
    if (ride) updateRide(dt);
    else if (player.enabled && !ctx.checkpoint.respawning && !ctx.health.dead && player.grounded && inLava(player.x, player.z)) {
      FX("lavaSplash", player.x, player.y, player.z, 0.8);
      hurtBy.lava = (hurtBy.lava || 0) + 1;
      ctx.health.kill({ x: player.x, z: player.z, kind: "fall" });
      return;
    }
    if (bossN === 0) {
      let c = null;
      for (const q of magmor.crystals) if (q.glowing && !q.broken) c = q;
      // a fist came down with no crystal left on it: tell them to bring the other fist down
      if (!c && atk.name === "slam" && ctx.time.now - atk.at > atk.t + 0.4 && ctx.time.now - atk.at < atk.t + 0.6 && bossCount() < 4 && !bareTold) { bareTold = true; ui.hint("That fist has no crystal left! Stand on the OTHER side so the other fist comes down.", 4.5); later(12, () => { bareTold = false; }); }
      if (c) { if (atk.name === "slam") setGoal(atk.x, volcano.heightAt(atk.x, atk.z) + 3.4, atk.z, 0xffb050); else setGoal(c.x, c.y + 1.2, c.z, 0xffb050); } else clearGoal();
    } else if (bossN === 1) {
      if (magmor.takeFlower(player.x, player.z, 1.3)) { ab.potion.add(1); progressed(); ui.hint("Ice potion +1!", 1.6); }
      let v = null;
      for (const q of magmor.vents) if (q.open && !q.plugged) v = q;
      if (v) setGoal(v.x, v.y + 2, v.z, 0x9adfff);
      else if (ab.potion.count === 0) { let f = null; for (const q of magmor.flowers) if (q.on) f = q; if (f) setGoal(f.x, volcano.islands[f.island].y + 0.8, f.z, 0x9adfff); else clearGoal(); }
      else clearGoal();
    } else if (bossN === 2 && !ride) {
      let best = null, bd = 1e9;
      for (const u of volcano.updrafts) { if (!u.on) continue; const d = dist2(player.x, player.z, u.x, u.z); if (d < bd) { bd = d; best = u; } }
      if (best) setGoal(best.x, volcano.islands[best.island].y + 3.5, best.z, 0xfff0c0); else clearGoal();
      setAct(best && bd < best.r + 0.6 ? "Ride the wind" : null);
    }
    void raw;
  }
  // sting / slap at a glowing crystal
  function attack(kind) {
    if (!player.enabled || platypus.acting || cd[kind] > 0 || ride) return true;
    const t = (kind === "slap" ? platypus.slapHitTime : platypus.stingHitTime) || 0.25;
    if (kind === "slap") platypus.tailSlap(); else { platypus.sting(); A("sting"); }
    cd[kind] = CD[kind];
    player.lock = Math.max(player.lock, t + 0.12);
    later(t, () => {
      if (!bossOn || bossN !== 0) { if (kind === "slap") A("tailSlap"); return; }
      let hit = false;
      for (const c of magmor.crystals) {
        if (!c.glowing || c.broken) continue;
        const atFist = atk.name === "slam" && dist2(player.x, player.z, atk.x, atk.z) < 4.2;   // anywhere on the resting fist
        if ((atFist || dist2(player.x, player.z, c.x, c.z) < 6.0) && magmor.hit("crystal", c.i, kind === "sting" ? 1.5 : 1)) { hit = true; progressed(); cinema.shake(0.02, 0.2); }
      }
      if (kind === "slap") A(hit ? "tailSlapHit" : "tailSlap");
      if (!hit) {
        let near = false;
        for (const c of magmor.crystals) if (!c.broken && dist2(player.x, player.z, c.x, c.z) < 6) near = true;
        if (near) ui.hint("Only a GLOWING crystal cracks. Wait for the fist to rest!", 2);
      }
    });
    return true;
  }
  // the potion into an open vent
  function onThrow(from, to, seconds, apex, target) {
    potions.throw(from, to, seconds, apex, target);
    const tx = to.x, tz = to.z, tgt = target;
    later(seconds, () => {
      if (!bossOn || bossN !== 1) return;
      let ok = false;
      for (const v of magmor.vents) {
        if (!v.open || v.plugged) continue;
        if (tgt === v || dist2(tx, tz, v.x, v.z) < 4.5) ok = magmor.hit("vent", v.i) || ok;
      }
      if (ok) { progressed(); A("freeze"); ui.call("FROZEN!", "", "perfect"); }
      else ui.hint("Missed! Throw when a vent glows OPEN.", 2.2);
    });
  }
  // the scream into the heart
  function onScream(p) {
    if (platypus.screamCharge) platypus.screamCharge(0);
    A("screamCharge", 0);
    const dur = (platypus.scream ? platypus.scream(p, true) : 0) || 0.8;
    if (!ride) player.lock = Math.max(player.lock, Math.min(dur, 0.9));
    later(platypus.screamTime || 0.12, () => {
      A("scream", p, true);
      FX("screamWave", player.x, player.y + 0.3, player.z, p);
      cinema.shake(0.03 + 0.05 * p, 0.7);
      if (!bossOn || bossN !== 2) return;
      if (ride && ride.stage !== "down" && magmor.core.open) {
        const i = ride.i;
        if (magmor.hit("core", i, p)) {
          progressed();
          volcano.setUpdraft(i, false);
          ui.call("HEART HIT!", (3 - Math.round(magmor.hp * 3)) + " / 3", "perfect");
          if (Math.round((1 - magmor.hp) * 3) === 2) { M("setPhase", 2); M("stinger", "phase"); }
          // the wind carries you across the lava to the next column
          let nx = null, nd = 1e9;
          for (const q of volcano.updrafts) { if (!q.on || q.i === i) continue; const dd = dist2(player.x, player.z, q.x, q.z); if (dd < nd) { nd = dd; nx = q; } }
          ride.dest = nx ? nx.i : i;
          ride.sx = player.x; ride.sz = player.z; ride.sy = player.y;
          ride.stage = "down"; ride.t = 0;
        }
      } else if (ride) ui.hint("Wait until its chest opens and glows!", 2);
      else ui.hint("Too far! Ride a wind column up first (stand in it, jump).", 2.6);
    });
  }
  // ---- riding an updraft (scripted lift; the scream still works up there) ----
  function tryRide() {
    if (!bossOn || bossN !== 2 || ride || !player.enabled || !player.grounded) return false;
    for (const u of volcano.updrafts) {
      if (!u.on) continue;
      if (dist2(player.x, player.z, u.x, u.z) < u.r + 0.6) { startRide(u); return true; }
    }
    return false;
  }
  function startRide(u) {
    ride = { i: u.i, t: 0, stage: "up", x: player.x, z: player.z, y0: player.y, hx: 0, hz: 0 };
    player.scripted = true;
    player.grounded = false;
    props.wind.visible = true;
    props.windU.uK.value = 1;
    A("windWhoosh", 0); A("windGust", 0.9);
    setAct(null);
    clearGoal();
    progressed();
    ui.hint(keyHint("Up you go! When its chest glows open: hold R... let go!", "Up you go! When its chest glows open: hold Scream... let go!"), 3.5);
  }
  function updateRide(dt) {
    const r = ride;
    if (!r) return;
    r.t += dt;
    const u = volcano.updrafts[r.i];
    const top = volcano.lavaY + 12.5;
    if (r.stage === "up") {
      const k = smooth(Math.min(1, r.t / 1.6));
      r.x = lerp(r.x, u.x, Math.min(1, dt * 4)); r.z = lerp(r.z, u.z, Math.min(1, dt * 4));
      player.y = lerp(r.y0, top, k);
      if (k >= 1) { r.stage = "hover"; r.t = 0; }
    } else if (r.stage === "hover") {
      // a little steering up there; the wind keeps you over your column
      r.hx = clamp(r.hx + ctx.input.x * dt * 2.5, -2.5, 2.5); r.hz = clamp(r.hz + ctx.input.y * dt * 2.5, -2.5, 2.5);
      r.x = u.x + r.hx; r.z = u.z + r.hz;
      player.y = top + Math.sin(r.t * 2.2) * 0.25;
      if (r.t > 5.2) { r.stage = "down"; r.t = 0; r.dest = r.i; r.sx = player.x; r.sz = player.z; r.sy = player.y; ui.hint("The wind fades... wait for its chest to open next time.", 2.4); }
    } else {
      // a long glide down onto the island of the next column (or back home)
      const d = volcano.updrafts[r.dest === undefined ? r.i : r.dest];
      const T = r.dest !== r.i ? 2.4 : 1.3, k = smooth(Math.min(1, r.t / T));
      const dy = volcano.heightAt(d.x, d.z);
      const di = volcano.islands[d.island] || d;
      r.x = lerp(r.sx, lerp(d.x, di.x, 0.45), k); r.z = lerp(r.sz, lerp(d.z, di.z, 0.45), k);
      player.y = lerp(r.sy, dy, k) + Math.sin(k * PI) * 1.2;
      if (k >= 1) { endRide(true); return; }
    }
    player.x = r.x; player.z = r.z;
    player.yaw = Math.atan2(magmor.x - r.x, magmor.z - r.z);
    player.vy = 0; player.speed = 0; player.grounded = false;
    platypus.group.position.set(player.x, player.y, player.z);
    platypus.group.rotation.set(0, player.yaw, Math.sin(r.t * 3) * 0.08);
    props.wind.position.set(player.x, player.y - 1.2, player.z);
  }
  function endRide(land) {
    if (!ride) return;
    const u = volcano.updrafts[ride.dest === undefined ? ride.i : ride.dest];
    // carried to a new column: it has to gather again while MAGMOR comes for you (survive ~5 s)
    if (land && u && ride.dest !== undefined && ride.dest !== ride.i && bossOn) {
      const di = u.i;
      volcano.setUpdraft(di, false);
      ui.hint("The wind is gathering... survive until it rises again!", 3);
      later(5.5, () => { if (bossOn && bossN === 2) { volcano.setUpdraft(di, true); A("windGust", 0.7); ui.hint("The wind is back! Jump into it!", 2.4); } });
    }
    ride = null;
    player.scripted = false;
    props.wind.visible = false;
    props.windU.uK.value = 0;
    platypus.group.rotation.set(0, 0, 0);
    // land on solid ground: a step from the column toward its island's middle
    if (u) { const o = volcano.islands[u.island] || u, k = 0.45; player.teleport(lerp(u.x, o.x, k), lerp(u.z, o.z, k), player.yaw); }
  }

  // =====================================================================================================
  // PART 5 - the potion
  // =====================================================================================================
  function startPotion() {
    hardStop();
    toVolcano("cell");
    volcano.setCool(1, 0);
    volcano.setGlow(0.2, 0);
    ctx.setEnv(volcano.ENVS.cool, 0);
    step = "potion";
    wearGear();
    walkSpeed();
    const r = V.rim;
    player.teleport(r.x, r.z, 0);
    cam.yaw = 0;
    friend.visible = true;
    friend.attachTo(volcano.cage.group);
    volcano.cage.lower(0, 0);
    volcano.cageWalk.sink();
    ctx.checkpoint.set("potion", { x: r.x, z: r.z, yaw: 0, silent: true });
    M("play", "chill", { at: "now", intensity: 0.4 });
    A("lavaAmbience", 0);
    const g = gen, cc = V.camCage;
    cinema.play([
      { fade: "clear", dur: 1.0 },
      { shot: { pos: [cc.pos.x + 4, cc.pos.y + 2, cc.pos.z - 10], look: [0, 3, 0], fov: F(44), to: { pos: [cc.pos.x, cc.pos.y, cc.pos.z - 4] }, dur: 4.5, ease: "inOut" }, hold: false },
      { call: () => { volcano.cage.lower(1, 3.5); volcano.cageWalk.rise(3.5); } },
      { caption: "The lava has crusted over. A stone bridge rises to the cage.", dur: 3.2, narr: true },
      { wait: 1.2 },
      { call: () => volcano.cage.open(1.2) },
      { wait: 1.2 },
    ], { skippable: true, onSkip: () => { if (g !== gen) return; volcano.cage.lower(1, 0); volcano.cageWalk.rise(0); volcano.cage.open(0.05); }, onDone: () => { if (g === gen) beginPotion(); } });
  }
  function beginPotion() {
    friend.attachTo(null);
    friend.visible = true;
    friend.place(0, 0.2, PI);
    friend.do("sit", { at: { x: 0, z: 0.2 }, lookAt: platypus.group });
    player.enabled = true;
    ui.showHud(true);
    objective("potion", "Give Pip the potion", "walk across the bridge to the cage · Give (E)");
    setGoal(0, volcano.heightAt(0, -1.6) + 1.6, -1.6, 0xffe08a);
    setHints("Walk across the stone bridge to Pip's cage.", "Stand next to Pip and press E to give her the LIVING POTION.");
  }
  function updatePotion() {
    if (cinema.playing || given) return;
    setAct(dist2(player.x, player.z, friend.x, friend.z) < 3.2 ? "Give" : null);
  }
  function givePotion() {
    if (given) return;
    given = true;
    setAct(null);
    clearGoal();
    ui.objectiveDone();
    player.enabled = false;
    const g = gen, pg = friend.group;
    cinema.play([
      { call: () => { player.walkTo(friend.x, friend.z - 1.0, { speed: 0.5, face: 0 }); if (potions.living) { potions.living.pickUp(platypus.holdAnchor); potions.living.setGlow(1.2); } } },
      { shot: { pos: [1.6, 1.4, -2.6], look: pg, lookY: 0.35, fov: F(38), dur: 4 }, hold: false },
      { caption: "The LIVING POTION.", dur: 2, narr: true },
      { call: () => { if (potions.living) potions.living.pickUp(friend.body.holdAnchor); friend.body.pose("sit"); } },
      { wait: 1.0 },
      { call: () => { if (potions.living) potions.living.hide(); friend.eat(); A("eatCrunch"); } },
      { wait: 1.2 },
      { call: () => { FX("transformSwirl", friend.x, friend.y, friend.z, 2.6, 1.2); A("transform"); M("motif", "pip", { at: "beat" }); } },
      { caption: "Golden light. The colour comes back into her fur.", dur: 2.8, narr: true },
      { call: () => { friend.do("idle"); friend.trick("spin"); FX("sparkle", v1.set(friend.x, friend.y + 1, friend.z), 0xffe08a, 30); } },
      { wait: 1.2 },
      { call: () => { friend.do("nuzzle"); FX("hearts", v1.set(friend.x, friend.y + 0.8, friend.z), 6); A("friendChirp", "happy", 0, 1); } },
      { caption: "[You came for me.]", dur: 2.6, who: "Pip" },
      { call: () => { volcano.puff(0, volcano.heightAt(0, 0) + 1, 0, 3, 0xffffff, 6, 3); A("windGust", 1); } },
      { caption: "Warm air rises out of the crater — and lifts you both.", dur: 3, narr: true },
      { fade: "white", dur: 1.0 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startWindDance(); } });
  }

  // =====================================================================================================
  // PART 6 - the wind duet and the flight home
  // =====================================================================================================
  function buildChart() {
    const notes = [];
    let t = 3.0;                                    // seconds of real time before the first call
    for (let s = 0; s < DANCE.length; s++) {
      const B = SET_BEAT[s];
      for (let p = 0; p < DANCE[s].length; p++) {
        const ph = DANCE[s][p];
        for (let j = 0; j < 4; j++) notes.push({ call: true, lane: ph[j], t: t + j * B, set: s });
        for (let j = 0; j < 4; j++) notes.push({ call: false, lane: ph[j], t: t + (4 + j) * B, set: s, id: -1, spawned: false, judged: false });
        t += 9 * B;
      }
      t += 2.0;
    }
    return { notes, end: t + 1.5, t: 0, hits: 0, perfect: 0, total: notes.filter((n) => !n.call).length, combo: 0, set: -1, done: false, k: 0 };
  }
  function startWindDance() {
    hardStop();
    toSky(1);
    step = "winddance";
    skyMode = "dance";
    flightPose(0);
    friend.visible = true;
    friend.body.reset && friend.body.reset();
    pipFlyPose(0);
    M("play", "wind", { at: "now", intensity: 0.5 });
    bed("windGust", 0.4);
    bed("flightRush", 0.3);
    // a chase camera just behind and beside the two of them, looking ahead into the sun
    cinema.shot({ pos: [2.4, 1.35, -5.4], look: [0.9, 0.35, 3], fov: F(50), track: platypus.group, dur: 0.1, hand: 0.25 });
    cinema.fade("clear", 1.2);
    player.enabled = true;
    ui.showHud(true);
    objective("dance", "Dance with Pip on the wind!", "Pip calls, you answer: press 1-4 when the note reaches the circle");
    ui.setTricks([{ label: "Spin" }, { label: "Flip" }, { label: "Dive" }, { label: "Wave" }]);
    ui.beat.show(true);
    ui.setCombo(0);
    dance = buildChart();
    setHints("Watch Pip, then copy her: press 1, 2, 3 or 4 when each note reaches the circle.", "Missing is fine — the wind just slows. Tap the buttons (or 1-4) in time.");
    later(0.6, () => ui.hint(keyHint("Pip calls a dance — you answer! Keys 1-4 when the notes reach the circle.", "Pip calls a dance — you answer! Tap the buttons when the notes reach the circle."), 5));
  }
  function pipFlyPose(t) {
    const g = friend.group;
    g.position.set(1.8 + Math.sin(t * 0.8) * 0.3, 30.4 + Math.sin(t * 1.1 + 1) * 0.5, 0.6 + Math.sin(t * 0.5) * 0.4);
    g.rotation.set(0.1, 0, Math.sin(t * 0.9 + 0.5) * 0.15);
  }
  function updateSky(dt, raw) {
    sky.update(dt);
    const t = ctx.time.real;
    flightPose(t);
    if (skyMode === "travel") {
      skyK = Math.min(1, skyK + raw / 14);
      sky.setProgress(skyK);
      return;
    }
    if (skyMode !== "dance" || !dance) return;
    pipFlyPose(t);
    friend.body.update(dt, REST);
    const D = dance;
    if (D.done) return;
    D.t += raw;
    for (let i = 0; i < D.notes.length; i++) {
      const n = D.notes[i];
      if (n.call) {
        if (!n.played && D.t >= n.t) {
          n.played = true;
          friend.body.trick(LANE_TRICK[n.lane]);
          A("friendChirp", "happy", 0.6, 0.5);
          A("windWhoosh", 0.6);
          if (n.set !== D.set) { D.set = n.set; if (n.set > 0) { ui.banner(n.set === 1 ? "FASTER!" : "THE LAST DANCE!", "", 1.8); M("setIntensity", 0.5 + n.set * 0.25, 2); } }
        }
        continue;
      }
      if (!n.spawned && D.t >= n.t - 2.0) { n.spawned = true; n.id = ui.beat.spawn(n.lane, n.t - D.t, LANES[n.lane][0].toUpperCase()); }
      if (n.spawned && !n.judged && D.t > n.t + 0.3) {
        n.judged = true;
        if (n.id >= 0) ui.beat.resolve(n.id, false);
        D.combo = 0; ui.setCombo(0);
      }
    }
    // the gusts push you home: time does a little, good answers do most of it
    const want = clamp(0.35 * (D.t / D.end) + 0.65 * (D.hits / D.total), 0, 1);
    D.k += (Math.max(want, D.k) - D.k) * Math.min(1, raw * 2);
    sky.setProgress(D.k);
    sky.speed = 26 + 30 * (D.combo > 3 ? 1 : D.combo / 3);
    if (D.t >= D.end) {
      D.done = true;
      ui.beat.clear(); ui.beat.show(false); ui.setTricks(null); ui.setCombo(null);
      ui.objectiveDone();
      const g = gen;
      sky.setProgress(1);
      ui.banner(D.hits >= D.total * 0.8 ? "WIND DANCERS!" : "HOME!", D.hits + " / " + D.total + " answered", 2.6);
      M("stinger", "victory");
      later(2.8, () => cinema.fade("black", 1.2, () => { if (g === gen) startDinner(); }));
    }
  }
  function danceInput(lane) {
    const D = dance;
    if (!D || D.done) return;
    let best = null, bd = 1e9;
    for (let i = 0; i < D.notes.length; i++) {
      const n = D.notes[i];
      if (n.call || !n.spawned || n.judged || n.lane !== lane) continue;
      const d = Math.abs(n.t - D.t);
      if (d < bd) { bd = d; best = n; }
    }
    if (!best || bd > 0.3) { ui.flashTrick(lane, false); return; }
    best.judged = true;
    if (best.id >= 0) ui.beat.resolve(best.id, true);
    D.hits++;
    D.combo++;
    const perfect = bd < 0.1;
    if (perfect) D.perfect++;
    ui.setCombo(D.combo);
    ui.flashTrick(lane, true);
    ui.call(LANES[lane].toUpperCase() + "!", perfect ? "perfect" : "", perfect ? "perfect" : "good");
    platypus.trick(LANE_TRICK[lane]);
    A("windWhoosh", -0.4);
    if (D.combo % 4 === 0) A("windGust", 0.8);
    progressed();
  }

  // =====================================================================================================
  // PART 7 - the camp: dinner, morning tag, noon pebbles, night fireflies, bed
  // =====================================================================================================
  const FOOD = ["crayfish", "berries", "grub"];
  const foodAt = [{ x: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 0 }];
  function pipSeat() { return { x: J.seat.x, z: J.seat.z, yaw: J.seat.yaw }; }
  function jungleBase(time, mood) {
    toJungle(time);
    camp(mood);
    ctx.gear.clear();                 // home: the suit comes off
    walkSpeed();
    friend.visible = true;
    A("jungleAmbience", true, time === "night" ? "night" : time === "dusk" ? "dusk" : "day");
  }
  function startDinner() {
    hardStop();
    jungleBase("dusk", "feast");
    step = "dinner";
    const s = J.campGate;
    player.teleport(s.x, s.z, s.yaw || 0.6);
    cam.yaw = 0.6;
    const ps = pipSeat();
    friend.place(ps.x, ps.z, ps.yaw);
    friend.do("sit", { at: ps, lookAt: platypus.group });
    const f = J.foodStore;
    // laid out in front of the store, on the camp side
    { const dx = J.camp.x - f.x, dz = J.camp.z - f.z, l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
      for (let i = 0; i < 3; i++) { const k = (i - 1) * 0.75; foodAt[i].x = f.x + ux * 1.7 - uz * k; foodAt[i].z = f.z + uz * 1.7 + ux * k; tribe.food.place(i, foodAt[i].x, foodAt[i].z, FOOD[i]); } }
    foodHeld = -1; foodDone = 0;
    ctx.checkpoint.set("dinner", { x: s.x, z: s.z, yaw: 0.6, silent: true });
    M("play", "tribe", { at: "now", intensity: 0.5 });
    bed("campFire", 0.7);
    const g = gen;
    cinema.play([
      { fade: "clear", dur: 1.2 },
      { shot: { pos: [J.fire.x - 8, 5, J.fire.z - 9], look: [J.fire.x, 1, J.fire.z], fov: F(48), to: { pos: [J.fire.x - 5, 3, J.fire.z - 6] }, dur: 4.5, ease: "inOut" }, hold: false },
      { call: () => { if (tribe.village) { tribe.village.setMood("cheer", 0.5); tribe.village.wave && tribe.village.wave(); } A("crowdCheer", 0.8); } },
      { caption: "Home. The whole tribe cheers: Pip is back!", dur: 3.2, narr: true },
      { call: () => { if (tribe.village) tribe.village.setMood("feast", 1); } },
    ], { skippable: true, onDone: () => { if (g === gen) beginDinner(); } });
  }
  function beginDinner() {
    player.enabled = true;
    ui.showHud(true);
    dinnerObjective();
    setHints("Pick up food at the food store (E), then bring it to Pip by the fire.", "The food is in the basket corner of the camp (the light). Carry one piece at a time to Pip.");
  }
  function dinnerObjective() {
    if (foodDone >= 3) { objective("sit", "Sit with Pip and eat", "Sit (E)"); setGoal(friend.x, friend.y + 1.4, friend.z, 0xffd080); return; }
    objective("food" + foodDone, "Eat with Pip: bring food " + foodDone + "/3", foodHeld >= 0 ? "bring it to Pip · Give (E)" : "crayfish, berries, grubs · Pick up (E)");
    if (foodHeld >= 0) setGoal(friend.x, friend.y + 1.4, friend.z, 0xffd080);
    else { for (let i = 0; i < 3; i++) if (!foodGiven[i]) { setGoal(foodAt[i].x, gy(foodAt[i].x, foodAt[i].z) + 1.0, foodAt[i].z, 0xffd080); break; } }
  }
  function updateDinner() {
    if (cinema.playing) return;
    if (foodDone >= 3) { setAct(dist2(player.x, player.z, friend.x, friend.z) < 2.4 ? "Sit" : null); return; }
    if (foodHeld >= 0) { setAct(dist2(player.x, player.z, friend.x, friend.z) < 3.2 ? "Give" : null); return; }
    const i = tribe.food.nearest(player.x, player.z, 1.6);
    setAct(i >= 0 && i < 3 && !foodGiven[i] ? "Pick up" : null);
  }
  function dinnerAct() {
    if (actName === "Pick up") {
      const i = tribe.food.nearest(player.x, player.z, 1.6);
      if (i < 0 || i > 2 || foodGiven[i]) return;
      foodHeld = i;
      tribe.food.carry(i, platypus.holdAnchor);
      A("pickup");
      progressed();
    } else if (actName === "Give" && foodHeld >= 0) {
      const i = foodHeld;
      tribe.food.carry(i, null);
      const a = 0.9 + foodDone * 0.7;
      tribe.food.place(i, friend.x + Math.sin(friend.yaw + a) * 0.8, friend.z + Math.cos(friend.yaw + a) * 0.8, FOOD[i]);
      foodGiven[i] = true;
      foodHeld = -1;
      foodDone++;
      friend.emote("happy");
      A("friendChirp", "happy", 0, 0.8);
      progressed();
      if (foodDone >= 3) ui.objectiveDone();
    } else if (actName === "Sit") eatTogether();
    objKey = "";
    dinnerObjective();
  }
  function eatTogether() {
    setAct(null);
    clearGoal();
    player.enabled = false;
    const g = gen, pg = friend.group;
    const sx = friend.x + Math.sin(friend.yaw + 1.6) * 0.9, sz = friend.z + Math.cos(friend.yaw + 1.6) * 0.9;
    const munch = () => { platypus.eat(); friend.eat(); A("eatCrunch"); later(0.5, () => A("eatCrunch")); };
    cinema.play([
      { call: () => player.walkTo(sx, sz, { speed: 0.6, face: friend.yaw }) },
      { until: () => !player.walking, max: 3 },
      { call: () => platypus.pose("sit") },
      { shot: { pos: [sx + 2.2, gy(sx, sz) + 1.2, sz - 1.8], look: pg, lookY: 0.3, fov: F(40), dur: 6, hand: 0.4 }, hold: false },
      { call: () => { munch(); tribe.food.eat(0); } },
      { wait: 1.6 },
      { call: () => { munch(); tribe.food.eat(1); } },
      { caption: "Crayfish. Berries. Grubs. The best dinner ever.", dur: 2.6, narr: true },
      { call: () => { munch(); tribe.food.eat(2); friend.emote("laugh"); } },
      { wait: 1.4 },
      { fade: "black", dur: 1.4 },
      { card: { kicker: "", title: "The next morning", hold: 1.6 } },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startMorning(); } });
  }

  // ---- morning: tag ----
  function startMorning() {
    hardStop();
    jungleBase("dawn", "calm");
    step = "morning";
    const c = J.camp;
    player.teleport(c.x - 2, c.z - 2, 0.4);
    cam.yaw = 0.4;
    friend.place(c.x + 1.5, c.z + 1, PI);
    ctx.checkpoint.set("morning", { x: c.x - 2, z: c.z - 2, yaw: 0.4, silent: true });
    M("play", "chill", { at: "now", intensity: 0.6 });
    bed("morningBirds", 0.8);
    tags = 0; tagStage = 0; tagT = 0;
    friend.onEvent = onFriend;
    player.enabled = true;
    ui.showHud(true);
    cinema.fade("clear", 1.2);
    tagObjective();
    ui.setQuests([{ id: "tag", text: "Tag Pip 0/3", current: true }, { id: "run", text: "Then run from Pip!" }], "Tag");
    setHints("Run after Pip and touch her to tag her!", "Pip dodges. Corner her against the huts or the river.");
    later(1.0, () => { friend.emote("bow"); A("friendChirp", "giggle", 0, 0.9); cinema.caption("[Bet you can't catch me!]", 2.4, { who: "Pip" }); });
    later(1.6, () => runner());
  }
  function runner() { walkSpeed(1.3); friend.do("chase", { role: "runner", tagDist: 1.0 }); }
  function tagObjective() {
    if (tagStage === 0) objective("tag" + tags, "Play tag with Pip: tag her " + tags + "/3", "run after her");
    else objective("tag-it", "Now Pip is IT — run!", Math.max(0, Math.ceil(20 - tagT)) + " s");
  }
  function onFriend(type, data) {
    if (step !== "morning" || type !== "tag") return;
    if (tagStage === 0 && data === "player") {
      tags++;
      progressed();
      A("friendChirp", "giggle", 0, 1);
      FX("hearts", v1.set(friend.x, friend.y + 0.8, friend.z), 3);
      ui.setQuest("tag", { text: "Tag Pip " + tags + "/3", done: tags >= 3, current: tags < 3 });
      if (tags >= 3) {
        tagStage = 1; tagT = 0;
        ui.setQuest("run", { current: true });
        ui.hint("Your turn to run! Pip is IT!", 3);
        walkSpeed(1.0);
        later(1.2, () => friend.do("chase", { role: "it", tagDist: 0.8 }));
      } else later(1.2, runner);
    } else if (tagStage === 1 && data === "friend") {
      A("friendChirp", "giggle", 0, 1);
      ui.hint("Got you! Run again!", 1.6);
      later(1.6, () => { if (tagStage === 1) friend.do("chase", { role: "it", tagDist: 0.8 }); });
    }
    objKey = "";
    tagObjective();
  }
  function updateMorning(dt) {
    if (cinema.playing) return;
    if (tagStage === 0 && friend.behaviour === "chase" && dist2(player.x, player.z, friend.x, friend.z) < 1.05) {
      // a tag counts the moment you touch her, however she dodges
      friend.do("idle");
      onFriend("tag", "player");
      return;
    }
    if (tagStage === 1) {
      tagT += dt;
      const k = Math.ceil(20 - tagT);
      if (k !== Math.ceil(20 - tagT + dt)) { objKey = ""; tagObjective(); }
      if (tagT >= 20) {
        tagStage = 2;
        friend.do("idle");
        friend.emote("laugh");
        ui.setQuest("run", { done: true });
        ui.objectiveDone();
        const g = gen;
        cinema.caption("[Okay, okay! You win!]", 2.2, { who: "Pip" });
        later(2.6, () => cinema.fade("black", 1.0, () => { if (g === gen) startNoon(); }));
      }
    }
  }

  // ---- noon: pebbles ----
  function findWater() {
    if (waterSpots) return waterSpots;
    const out = [], c = J.camp;
    for (let r = 4; r < 40 && out.length < 24; r += 1.5) {
      for (let a = 0; a < TAU; a += 0.35) {
        const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
        const d = jungle.waterAt(x, z) - jungle.heightAt(x, z);
        if (d > 0.55 && d < 2.6) {
          let ok = true;
          for (const o of out) if (dist2(o.x, o.z, x, z) < 2.4) ok = false;
          if (ok) out.push({ x, z, y: jungle.heightAt(x, z) + 0.12, w: jungle.waterAt(x, z) });
        }
      }
    }
    waterSpots = out.slice(0, 6);
    return waterSpots;
  }
  function startNoon() {
    hardStop();
    jungleBase("day", "calm");
    step = "noon";
    const W = findWater();
    pebbles.length = 0;
    for (let i = 0; i < 6; i++) { const w = W[i] || W[0] || { x: J.camp.x + i, z: J.camp.z, y: 0, w: 0 }; pebbles.push({ x: w.x, y: w.y, z: w.z, on: true }); }
    const p0 = pebbles[0];
    const sx = p0.x + (J.camp.x - p0.x) * 0.25, sz = p0.z + (J.camp.z - p0.z) * 0.25;
    player.teleport(sx, sz, Math.atan2(p0.x - sx, p0.z - sz));
    cam.yaw = player.yaw;
    friend.place(sx + 1.2, sz + 0.6, player.yaw);
    friend.do("splash", { at: { x: p0.x, z: p0.z } });
    ctx.checkpoint.set("noon", { x: sx, z: sz, yaw: player.yaw, silent: true });
    props.pebbles.visible = true;
    syncPebbles(0);
    pebblesGot = 0;
    M("play", "chill", { at: "now", intensity: 0.8 });
    player.enabled = true;
    ui.showHud(true);
    cinema.fade("clear", 1.2);
    objective("peb0", "Dive for shiny pebbles 0/6", "swim to the glints · hold Space to dive");
    ui.setQuests([{ id: "peb", text: "Shiny pebbles 0/6", current: true }], "Noon");
    setHints("Shiny pebbles glint under the water. Swim over one and hold Space to dive down to it.", "Look for the blue sparkles in the water near the camp. Swim right over them.");
    later(1.0, () => cinema.caption("[First one to six pebbles wins!]", 2.4, { who: "Pip" }));
  }
  function syncPebbles(t) {
    for (let i = 0; i < 6; i++) {
      const p = pebbles[i];
      if (p && p.on) tm.compose(tp.set(p.x, p.y + Math.sin(t * 2 + i) * 0.03, p.z), tq.setFromAxisAngle(ts.set(0, 1, 0), t + i), ts.set(1, 0.7, 1));
      else tm.makeScale(0, 0, 0);
      props.pebbles.setMatrixAt(i, tm);
    }
    props.pebbles.instanceMatrix.needsUpdate = true;
  }
  function updateNoon(dt) {
    syncPebbles(ctx.time.now);
    if (cinema.playing || !player.enabled) return;
    let near = null, nd = 1e9;
    for (const p of pebbles) {
      if (!p.on) continue;
      const d = dist2(player.x, player.z, p.x, p.z);
      if (d < nd) { nd = d; near = p; }
      if (d < (player.diving ? 1.5 : 1.0) && (player.inWater || player.diving || player.swimming)) {
        p.on = false;
        pebblesGot++;
        progressed();
        A("coin"); A("splashSmall");
        FX("sparkle", v1.set(p.x, p.y + 0.4, p.z), 0x9adfff, 14);
        ui.setQuest("peb", { text: "Shiny pebbles " + pebblesGot + "/6", done: pebblesGot >= 6 });
        objective("peb" + pebblesGot, "Dive for shiny pebbles " + pebblesGot + "/6", "swim to the glints · hold Space to dive");
        if (pebblesGot === 3) { friend.emote("laugh"); cinema.caption("[Hey! Splash fight!]", 2, { who: "Pip" }); A("splash"); }
        if (pebblesGot >= 6) {
          ui.objectiveDone();
          clearGoal();
          friend.emote("happy");
          const g = gen;
          cinema.caption("[Six! You win... this time.]", 2.4, { who: "Pip" });
          later(2.8, () => cinema.fade("black", 1.0, () => { if (g === gen) startNight(); }));
          return;
        }
      }
    }
    if (near) {
      setGoal(near.x, Math.max(near.w || 0, near.y) + 1.2, near.z, 0x9adfff);
      if (friend.behaviour !== "splash" || Math.random() < dt * 0.05) friend.do("splash", { at: { x: near.x + 1.5, z: near.z + 1 } });
    }
  }

  // ---- night: fireflies ----
  function startNight() {
    hardStop();
    jungleBase("night", "sleep");
    step = "night";
    const c = J.camp, ps = pipSeat();
    player.teleport(ps.x - 2.4, ps.z - 2.2, 0.6);
    cam.yaw = 0.6;
    friend.place(ps.x, ps.z, ps.yaw);
    friend.do("sit", { at: ps, lookAt: platypus.group });
    // the lantern Pip holds
    props.lantern.visible = true;
    friend.body.holdAnchor.add(props.lantern);
    props.lantern.position.set(0, -0.05, 0.06);
    props.lantern.scale.setScalar(1);
    props.lanternGlow.material.opacity = 0.1;
    fly.length = 0;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + 0.3, r = 3.2 + (i % 3) * 1.6;
      const x = c.x + Math.sin(a) * r, z = c.z + Math.cos(a) * r;
      fly.push({ ax: x, az: z, ay: gy(x, z) + 0.95 + (i % 2) * 0.2, ph: i * 1.7, on: true, x, y: 0, z, k: 0 });
    }
    props.flies.visible = props.flyHalo.visible = true;
    flies = 0;
    ctx.checkpoint.set("night", { x: player.x, z: player.z, yaw: 0.6, silent: true });
    M("play", "lullaby", { at: "now", intensity: 0.4 });
    bed("cricketNight", 0.6);
    player.enabled = true;
    ui.showHud(true);
    cinema.fade("clear", 1.4);
    objective("fly0", "Catch fireflies 0/10", "jump (Space) into them");
    ui.setQuests([{ id: "fly", text: "Fireflies 0/10", current: true }], "Night");
    setHints("Jump (Space) right under a firefly to catch it in your paws.", "The fireflies float just above your head. Stand under one, then jump.");
    later(1.2, () => cinema.caption("[Catch them for my lantern!]", 2.4, { who: "Pip" }));
  }
  function updateNight(dt) {
    const t = ctx.time.now;
    let near = null, nd = 1e9;
    for (let i = 0; i < fly.length; i++) {
      const f = fly[i];
      if (f.on) {
        f.x = f.ax + Math.sin(t * 0.5 + f.ph) * 0.5; f.z = f.az + Math.cos(t * 0.4 + f.ph) * 0.5; f.y = f.ay + Math.sin(t * 1.3 + f.ph) * 0.12;
        const tw = 0.7 + 0.3 * Math.sin(t * 6 + f.ph * 3);
        tm.compose(tp.set(f.x, f.y, f.z), tq.identity(), ts.set(tw, tw, tw));
      } else if (f.k < 1) {
        // flying to Pip's lantern
        f.k = Math.min(1, f.k + dt * 1.2);
        props.lanternGlow.getWorldPosition(v1);
        const k = smooth(f.k);
        tm.compose(tp.set(lerp(f.x, v1.x, k), lerp(f.y, v1.y, k) + Math.sin(k * PI) * 0.6, lerp(f.z, v1.z, k)), tq.identity(), ts.set(1 - k * 0.6, 1 - k * 0.6, 1 - k * 0.6));
        if (f.k >= 1) tm.makeScale(0, 0, 0);
      } else tm.makeScale(0, 0, 0);
      props.flies.setMatrixAt(i, tm);
      props.flyHalo.setMatrixAt(i, tm);
      if (!f.on || cinema.playing || !player.enabled) continue;
      const d = dist2(player.x, player.z, f.x, f.z);
      if (d < nd) { nd = d; near = f; }
      const floor = gy(player.x, player.z);
      if (d < 0.95 && player.y - floor > 0.28) {
        f.on = false; f.k = 0;
        flies++;
        progressed();
        A("firefly"); A("coin");
        FX("sparkle", v1.set(f.x, f.y, f.z), 0xe6ff8a, 10);
        props.lanternGlow.material.opacity = 0.1 + flies * 0.085;
        props.lanternGlow.scale.setScalar(1 + flies * 0.12);
        ui.setQuest("fly", { text: "Fireflies " + flies + "/10", done: flies >= 10 });
        objective("fly" + flies, "Catch fireflies " + flies + "/10", "jump (Space) into them");
        if (flies >= 10) {
          ui.objectiveDone();
          clearGoal();
          friend.emote("happy");
          cinema.caption("[It's so bright! Like a little moon.]", 2.6, { who: "Pip" });
          later(2.4, beginBed);
        }
      }
    }
    props.flies.instanceMatrix.needsUpdate = true;
    props.flyHalo.instanceMatrix.needsUpdate = true;
    if (near && step === "night") setGoal(near.x, near.y + 0.7, near.z, 0xe6ff8a);
  }

  // ---- bed ----
  function bedSpot() { return { x: J.bed.x, z: J.bed.z, yaw: J.bed.yaw || 2.4 }; }
  function startBed() {
    hardStop();
    jungleBase("night", "sleep");
    const ps = pipSeat();
    player.teleport(ps.x - 2, ps.z - 1.5, 0.6);
    cam.yaw = 0.6;
    friend.place(ps.x, ps.z, ps.yaw);
    props.lantern.visible = true;
    friend.body.holdAnchor.add(props.lantern);
    props.lantern.position.set(0, -0.05, 0.06);
    props.lanternGlow.material.opacity = 0.95;
    props.lanternGlow.scale.setScalar(2.2);
    M("play", "lullaby", { at: "now", intensity: 0.5 });
    bed("cricketNight", 0.5);
    player.enabled = true;
    ui.showHud(true);
    cinema.fade("clear", 1.0);
    beginBed();
  }
  function beginBed() {
    step = "bed";
    ui.setQuests(null);
    const b = bedSpot();
    objective("bed", "Go to bed", "the moss beds by the burrows");
    setGoal(b.x, gy(b.x, b.z) + 1.2, b.z, 0xc8d8ff);
    friend.do("follow", { dist: 1.3, side: 0.7 });
    M("setIntensity", 0.6, 3);
    setHints("Walk to the soft moss beds near the burrows (follow the light).", "The beds are at the back of the camp, by the burrows. Press E there.");
  }
  function updateBed() {
    if (cinema.playing) return;
    setAct(nearP(bedSpot(), 1.9) ? "Sleep" : null);
  }
  function goToSleep() {
    setAct(null);
    clearGoal();
    ui.objectiveDone();
    player.enabled = false;
    const b = bedSpot(), g = gen;
    const px = b.x + Math.cos(b.yaw) * 0.55, pz = b.z - Math.sin(b.yaw) * 0.55;
    cinema.play([
      { call: () => { player.walkTo(b.x, b.z, { speed: 0.5, face: b.yaw }); friend.do("sleep", { at: { x: px, z: pz, yaw: b.yaw } }); } },
      { until: () => !player.walking, max: 3 },
      { call: () => { platypus.sleep(true); A("thatchRustle"); } },
      { shot: { pos: [b.x + 2.2, gy(b.x, b.z) + 2.0, b.z + 1.2], look: [b.x, gy(b.x, b.z) + 0.2, b.z], fov: F(38), to: { pos: [b.x + 1.4, gy(b.x, b.z) + 1.4, b.z + 0.8] }, dur: 6, ease: "inOut" }, hold: false },
      { wait: 2.2 },
      { call: () => { A("snore", "pip"); FX("zzz", v1.set(friend.x, friend.y + 0.6, friend.z)); M("setIntensity", 0.2, 3); } },
      { caption: "Pip curls up next to you. Safe. Warm. Home.", dur: 3, narr: true },
      { call: () => { A("snore", "pip"); M("stop", 3); } },
      { fade: "black", dur: 2.2 },
      { wait: 1.2 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startMissing(); } });
  }

  // ---- the middle of the night: Pip is missing ----
  function startMissing() {
    hardStop();
    jungleBase("night", "sleep");
    step = "missing";
    if (jungle.LOOK && jungle.ENV) jungle.setTime("night", 0);
    cinema.tint("night", 0.55);
    const b = bedSpot();
    player.teleport(b.x, b.z, b.yaw);
    cam.yaw = b.yaw + PI;
    platypus.sleep(true);
    friend.visible = false;
    // pawprints from the bed into the dark woods (north)
    props.prints.visible = true;
    const bx = b.x + 0.6, bz = b.z + 0.5, ex = b.x + 6, ez = 95;
    for (let i = 0; i < 18; i++) {
      const k = i / 17, x = lerp(bx, ex, k) + (i % 2 ? 0.12 : -0.12), z = lerp(bz, ez, k);
      tm.compose(tp.set(x, gy(x, z) + 0.03, z), tq.setFromAxisAngle(ts.set(0, 1, 0), Math.atan2(ex - bx, ez - bz)), ts.set(1, 1, 1.25));
      props.prints.setMatrixAt(i, tm);
    }
    props.prints.instanceMatrix.needsUpdate = true;
    bed("cricketNight", 0.25);
    missT = 0; missStage = 0;
    const g = gen;
    cinema.play([
      { fade: "clear", dur: 2.0 },
      { call: () => { platypus.sleep(false); platypus.wakeStretch(); } },
      { shot: { pos: [b.x - 1.6, gy(b.x, b.z) + 1.3, b.z - 1.8], look: [b.x + 0.6, gy(b.x, b.z) + 0.2, b.z + 0.5], fov: F(40), dur: 3.4, ease: "inOut" }, hold: false },
      { caption: "The middle of the night. The moss beside you is cold.", dur: 3, narr: true },
      { caption: "[Pip?]", dur: 1.8, who: "You" },
    ], { skippable: true, onDone: () => { if (g === gen) beginMissing(); } });
  }
  function beginMissing() {
    platypus.sleep(false);
    player.enabled = true;
    ui.showHud(true);
    walkSpeed(0.8);
    objective("missing", "Pip is missing...", "follow the pawprints");
    const b = bedSpot();
    setGoal(b.x + 4, gy(b.x + 4, 91) + 1.0, 91, 0xc8d8ff);
    setHints("Follow the little pawprints toward the dark trees.");
    M("motif", "pipSad", { gain: 0.8 });
    later(2.5, () => { A("wolfHowl", J.camp.x + 10, 120, 1); cinema.caption("A wolf howls, far away in the dark woods.", 3, { narr: true }); });
  }
  function updateMissing(dt) {
    if (cinema.playing || !player.enabled) return;
    missT += dt;
    if (missStage === 0 && (missT > 6 || player.z > bedSpot().z + 4)) { missStage = 1; cinema.caption("[PIP?!]", 2, { who: "You" }); A("wolfHowl", J.camp.x - 6, 125, 2); }
    if (missStage === 1 && (missT > 11 || player.z > 90)) {
      missStage = 2;
      ui.objectiveDone();
      player.enabled = false;
      clearGoal();
      setHints(null);
      M("stop", 0.2);
      const g = gen;
      cinema.fade("black", 0.15, () => {
        if (g !== gen) return;
        step = "done";
        cinema.endCard("PIP IS MISSING...", { hold: 3.5, sub: "LEVEL 12 COMPLETE" }, () => ctx.complete());
      });
    }
  }

  // =====================================================================================================
  // level interface
  // =====================================================================================================
  function enter() {
    hardStop();
    step = "intro";
    toSky(-1);
    flightPose(0);
  }

  function update(dt, time) {
    if (step === "boot" || step === "done") return;
    const raw = ctx.time.rawDt || dt;
    tickHints(dt);
    if (props.cage.visible) props.cageU.uTime.value += raw;
    if (props.wind.visible) props.windU.uTime.value += raw;
    if (place === "sky") { updateSky(dt, raw); return; }
    if (place === "volcano") {
      switch (step) {
        case "travel": updateTravel(dt); break;
        case "spell": updateSpell(dt); break;
        case "wake": updateWake(dt); break;
        case "boss1": case "boss2": case "boss3": updateBoss(dt, raw); break;
        case "rim": magmor.update(dt); break;
        case "potion": magmor.update(dt); updatePotion(); friend.update(dt, time); break;
      }
      if (step === "rim") friend.update(dt, time);
      return;
    }
    if (place === "dream") { friend.update(dt, time); if (step === "dream") updateDream(); return; }
    if (place === "jungle") {
      tribe.update(dt, time);
      friend.update(dt, time);
      switch (step) {
        case "dinner": updateDinner(); break;
        case "morning": updateMorning(dt); break;
        case "noon": updateNoon(dt); break;
        case "night": updateNight(dt); break;
        case "bed": updateNight(dt); updateBed(); break;
        case "missing": updateMissing(dt); break;
      }
    }
  }

  function onAction(name) {
    if (cinema.playing) return false;
    if (step === "winddance") {
      const m = /^trick([1-4])$/.exec(name);
      if (m) { danceInput(+m[1] - 1); return true; }
      return name === "jump";
    }
    if (name === "jump" && step === "boss3") return tryRide();
    if (step === "boss1" && bossOn) {
      if (name === "primary" || name === "interact") return attack("sting");
      if (name === "tailSlap") return attack("slap");
      return false;
    }
    if (step === "boss3" && name === "interact" && actName === "Ride the wind") { if (player.grounded) { for (const u of volcano.updrafts) if (u.on && dist2(player.x, player.z, u.x, u.z) < u.r + 0.6) { startRide(u); break; } } return false; }
    if (name !== "interact") return false;
    switch (step) {
      case "spell": if (spellDone) { if (actName === "Sleep") sleepAtShrine(); } else touchRune(); break;
      case "dream": if (actName) wakePip(); break;
      case "potion": if (actName === "Give") givePotion(); break;
      case "dinner": if (actName) dinnerAct(); break;
      case "bed": if (actName === "Sleep") goToSleep(); break;
    }
    return false;
  }

  function exit() {
    hardStop();
    cinema.eye.clear();
    cinema.tint(null);
    A("stopAll");
    if (props.lantern.parent) props.lantern.parent.remove(props.lantern);
    friend.reset();
    friend.visible = true;
    tribe.reset();
    tribeLite(false);
    potions.reset();
    potions.autoCollect = true;
    magmor.stop();
    magmor.group.visible = false;
    volcano.reset();
    jungle.reset();
    leaveWorld(dream); dream.setScene("school");
    leaveWorld(sky);
    FX("setGround", null, null);
    platypus.group.rotation.set(0, 0, 0);
    place = "";
    step = "boot";
  }

  function win() {
    if (step === "done" || step === "boot") return;
    hardStop();
    step = "done";
    cinema.endCard("PIP IS MISSING...", { hold: 2.5, sub: "LEVEL 12 COMPLETE" }, () => ctx.complete());
  }

  function skipTo(name) {
    if (step === "boot" || STEPS.indexOf(name) < 0) return false;
    switch (name) {
      case "intro": startIntro(); break;
      case "travel": startTravel(); break;
      case "spell": startSpell(); break;
      case "dream": startDream(); break;
      case "wake": startWake(); break;
      case "boss1": startBoss(0); break;
      case "boss2": startBoss(1); break;
      case "boss3": startBoss(2); break;
      case "potion": startPotion(); break;
      case "winddance": startWindDance(); break;
      case "dinner": startDinner(); break;
      case "morning": startMorning(); break;
      case "noon": startNoon(); break;
      case "night": startNight(); break;
      case "bed": startBed(); break;
      case "missing": startMissing(); break;
      default: win();
    }
    return true;
  }

  return {
    build, enter, start, update, exit, onAction,
    state() {
      const D = dance;
      return {
        step, place,
        hp: ctx.health.on ? Math.round(ctx.health.hp * 10) / 10 : 0, tries: ctx.checkpoint.tries || 0,
        songK, spellDone, demoOn, demoLit, dreamStage, wakes,
        bossN, bossOn, defeated, bossHp: magmor ? Math.round(magmor.hp * 100) / 100 : 0, assist: magmor ? magmor.assist : 0,
        riding: ride ? ride.stage : "", hurtBy, potions: ab.potion.on ? ab.potion.count : 0,
        given, dance: D ? { t: Math.round(D.t * 10) / 10, end: D.end, hits: D.hits, total: D.total, done: D.done } : null,
        foodDone, foodHeld, tags, tagStage, pebbles: pebblesGot, flies, missStage,
        action: actName || "",
      };
    },
    skipTo, win,
    STEPS,
  };
}
