// main.js - the engine: renderer, scene, lights, loop, follow camera, input, player physics,
// and the LEVEL MANAGER (level select -> level -> back to the level select). Levels are modules in
// src/levels/ that receive the `ctx` object built here. The contract is written down in LEVELS.md.
import * as THREE from "../vendor/three.module.js";
import { createPlatypus } from "./platypus.js";
import { createAudio } from "./audio.js";
import { createFx } from "./fx.js";
import { createUI } from "./ui.js";
import { createCinema } from "./cinema.js";
import { createProgress, LEVEL_COUNT } from "./progress.js";

const LOADERS = [
  () => import("./levels/level1.js"),
  () => import("./levels/level2.js"),
  () => import("./levels/level3.js"),
  () => import("./levels/level4.js"),
  () => import("./levels/level5.js"),
];

const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const ui = createUI();
const progress = createProgress();
const canvas = document.getElementById("scene");
const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
if (coarse) ui.enableTouch();
ui.showMenu(progress);

function boot() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: (window.devicePixelRatio || 1) < 1.5, powerPreference: "high-performance", stencil: false });
  } catch (e) {
    ui.fatal("This game needs WebGL, and your browser could not start it.");
    return;
  }
  // pixel ratio is stepped down at runtime if the GPU cannot hold the frame rate (see frame())
  let pr = Math.min(window.devicePixelRatio || 1, 1.5);
  let slowT = 0;
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0xffffff, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xffffff);
  scene.fog = new THREE.Fog(0xffffff, 11, 23.5);

  const camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.1, 60);
  camera.position.set(0, 2, -5);
  // portrait phones: widen the vertical field of view so the action stays in frame
  let baseFov = 52;
  const camCtl = { taken: false, blend: 0, blendDur: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 52 };
  function fitFov() {
    const a = window.innerWidth / window.innerHeight;
    baseFov = a < 1 ? Math.min(72, 52 + (1 - a) * 36) : 52;
    camera.aspect = a;
    if (!camCtl.taken) camera.fov = baseFov;
    camera.updateProjectionMatrix();
  }
  fitFov();

  // ---- lights: exactly one hemisphere + one shadow-casting sun, always. Worlds restyle them through an env. ----
  const hemi = new THREE.HemisphereLight(0xffffff, 0xd6daf0, 1.55);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfffaf2, 1.9);
  const SUN_DIR = new THREE.Vector3(-0.52, 0.72, -0.46).normalize();
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const SH = 10;
  sun.shadow.camera.left = -SH; sun.shadow.camera.right = SH; sun.shadow.camera.top = SH; sun.shadow.camera.bottom = -SH;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 50;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.035;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  // light-space basis for texel snapping (keeps the shadow edge from swimming as it follows)
  const UP = new THREE.Vector3(0, 1, 0);
  const lRight = new THREE.Vector3(), lUp = new THREE.Vector3();
  const TEXEL = (SH * 2) / 1024;
  const vT = new THREE.Vector3();
  function sunBasis() {
    lRight.crossVectors(UP, SUN_DIR).normalize();
    lUp.crossVectors(SUN_DIR, lRight).normalize();
  }
  sunBasis();
  function followSun(x, y, z) {
    vT.set(x, 0, z);
    const r = Math.round(vT.dot(lRight) / TEXEL) * TEXEL;
    const u = Math.round(vT.dot(lUp) / TEXEL) * TEXEL;
    const d = vT.dot(SUN_DIR);
    sun.target.position.set(0, 0, 0).addScaledVector(lRight, r).addScaledVector(lUp, u).addScaledVector(SUN_DIR, d);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 25);
    sun.target.updateMatrixWorld();
  }

  // ---- shared actors and services (exist for every level) ----
  const platypus = createPlatypus(THREE);
  platypus.group.rotation.order = "YXZ";
  platypus.group.visible = false;
  scene.add(platypus.group);
  const fx = createFx(THREE);
  scene.add(fx.group);
  fx.setSun(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z);
  const audio = createAudio();

  // ---- environment (background, fog, light colours): set per world, blendable for time-of-day ----
  const ENV_DEFAULT = { background: 0xffffff, fog: [0xffffff, 11, 23.5], hemi: [0xffffff, 0xd6daf0, 1.55], sun: [0xfffaf2, 1.9], sunDir: [-0.52, 0.72, -0.46], far: 60, dark: false };
  const mkEnv = () => ({ bg: new THREE.Color(), fog: new THREE.Color(), near: 0, far: 0, sky: new THREE.Color(), ground: new THREE.Color(), hemi: 0, sunC: new THREE.Color(), sun: 0, dir: new THREE.Vector3(), camFar: 60 });
  const envA = mkEnv(), envB = mkEnv(), envC = mkEnv();
  let envT = 1, envDur = 0;
  function readEnv(e, o) {
    const d = ENV_DEFAULT;
    o.bg.set(e.background !== undefined ? e.background : d.background);
    const f = e.fog || d.fog, h = e.hemi || d.hemi, s = e.sun || d.sun, sd = e.sunDir || d.sunDir;
    o.fog.set(f[0]); o.near = f[1]; o.far = f[2];
    o.sky.set(h[0]); o.ground.set(h[1]); o.hemi = h[2];
    o.sunC.set(s[0]); o.sun = s[1];
    o.dir.set(sd[0], sd[1], sd[2]).normalize();
    o.camFar = e.far || d.far;
  }
  function applyEnv(o) {
    scene.background.copy(o.bg);
    scene.fog.color.copy(o.fog); scene.fog.near = o.near; scene.fog.far = o.far;
    hemi.color.copy(o.sky); hemi.groundColor.copy(o.ground); hemi.intensity = o.hemi;
    sun.color.copy(o.sunC); sun.intensity = o.sun;
    if (SUN_DIR.distanceToSquared(o.dir) > 1e-8) { SUN_DIR.copy(o.dir); sunBasis(); fx.setSun(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z); }
    if (camera.far !== o.camFar) { camera.far = o.camFar; camera.updateProjectionMatrix(); }
    if (world && world.onEnv) world.onEnv(o);
  }
  // env: { background, fog: [color, near, far], hemi: [sky, ground, intensity], sun: [color, intensity], sunDir: [x,y,z], far, dark }
  // (every field optional; missing fields mean level 1's white studio). seconds > 0 blends from the current look.
  function setEnv(env, seconds) {
    env = env || ENV_DEFAULT;
    envA.bg.copy(envC.bg); envA.fog.copy(envC.fog); envA.near = envC.near; envA.far = envC.far; envA.sky.copy(envC.sky); envA.ground.copy(envC.ground);
    envA.hemi = envC.hemi; envA.sunC.copy(envC.sunC); envA.sun = envC.sun; envA.dir.copy(envC.dir); envA.camFar = envC.camFar;
    readEnv(env, envB);
    ui.setDark(!!env.dark);
    if (seconds > 0) { envT = 0; envDur = seconds; envC.camFar = Math.max(envA.camFar, envB.camFar); }
    else { envT = 1; readEnv(env, envC); applyEnv(envC); }
  }
  function blendEnv(dt) {
    if (envT >= 1) return;
    envT = Math.min(1, envT + dt / envDur);
    const k = envT * envT * (3 - 2 * envT), a = envA, b = envB, c = envC;
    c.bg.copy(a.bg).lerp(b.bg, k); c.fog.copy(a.fog).lerp(b.fog, k); c.near = a.near + (b.near - a.near) * k; c.far = a.far + (b.far - a.far) * k;
    c.sky.copy(a.sky).lerp(b.sky, k); c.ground.copy(a.ground).lerp(b.ground, k); c.hemi = a.hemi + (b.hemi - a.hemi) * k;
    c.sunC.copy(a.sunC).lerp(b.sunC, k); c.sun = a.sun + (b.sun - a.sun) * k;
    c.dir.copy(a.dir).lerp(b.dir, k).normalize();
    if (envT >= 1) c.camFar = b.camFar;
    applyEnv(c);
  }
  readEnv(ENV_DEFAULT, envC);

  // ---- the active world ----
  let world = null;
  function warm() {
    const vis = [];
    scene.traverse((o) => { vis.push(o, o.visible); o.visible = true; });
    const undo = world && world.warm ? world.warm() : null;
    followSun(0, 0, 0);
    try { renderer.compile(scene, camera); renderer.render(scene, camera); } catch (e) { console.warn(e); }
    if (undo) undo();
    for (let i = 0; i < vis.length; i += 2) vis[i].visible = vis[i + 1];
    fx.clear(false);
  }
  // Makes `w` the one world in the scene (null = none). Applies w.env, and compiles its shaders the first time.
  function setWorld(w) {
    if (w === world) return;
    if (world) { scene.remove(world.group); if (world.onLeave) world.onLeave(); }
    world = w || null;
    if (!world) return;
    scene.add(world.group);
    setEnv(world.env || null, 0);
    if (!world.warmed) { world.warmed = true; warm(); }
    if (world.onEnter) world.onEnter();
  }

  // ---- player ----
  const cam = { yaw: 0, pitch: 0.42, dist: 9, wantDist: 3.7, tx: 0, ty: 0.4, tz: 0, manualT: 0, minDist: 2.2, maxDist: 6.5 };
  function floorAt(x, z) {
    if (!world) return 0;
    const h = world.heightAt(x, z);
    if (!world.waterAt) return h;
    const w = world.waterAt(x, z) - 0.1; // paddle with the back out of the water
    return w > h ? w : h;
  }
  const auto = { on: false, x: 0, z: 0, speed: 1, then: null, face: null };
  const player = {
    x: 0, y: 0, z: 0, yaw: 0, vy: 0, grounded: true, speed: 0, maxSpeed: 3.0, turn: 0, moving: false,
    lock: 0, face: null, kx: 0, kz: 0, invuln: 0, enabled: false, inWater: false, pitch: 0, roll: 0, airT: 0,
    hidden: false, scripted: false, flicker: false, canJump: true, canDive: true, swimming: false, diving: false, diveDepth: 0, carrying: false,
    teleport(x, z, yaw) {
      this.x = x; this.z = z; if (yaw !== undefined) this.yaw = yaw;
      this.vy = 0; this.grounded = true; this.speed = 0; this.kx = this.kz = 0; this.lock = 0;
      this.swimming = this.diving = false; auto.on = false;
      this.y = floorAt(x, z);
      cam.tx = x; cam.ty = this.y + 0.4; cam.tz = z; cam.yaw = this.yaw; cam.dist = cam.wantDist + 1.2;
      platypus.group.position.set(x, this.y, z);
      platypus.group.rotation.set(0, this.yaw, 0);
    },
    // walk by itself to a point (cutscenes, "come here" beats). o: { speed: 0..1 fraction of maxSpeed (0.7), then(), face: yaw at the end }
    walkTo(x, z, o) {
      auto.on = true; auto.x = x; auto.z = z;
      auto.speed = o && o.speed !== undefined ? o.speed : 0.7;
      auto.then = (o && o.then) || null;
      auto.face = o && o.face !== undefined ? o.face : null;
    },
    stop() { auto.on = false; this.speed = 0; },
    get walking() { return auto.on; },
  };
  function resetPlayer() {
    player.maxSpeed = 3; player.enabled = false; player.lock = 0; player.face = null; player.invuln = 0; player.kx = player.kz = 0;
    player.hidden = player.scripted = player.flicker = player.carrying = false; player.canJump = player.canDive = true;
    player.swimming = player.diving = player.inWater = false; player.pitch = player.roll = 0; player.vy = 0; player.grounded = true; player.speed = 0;
    auto.on = false;
    cam.yaw = 0; cam.pitch = 0.42; cam.wantDist = 3.7; cam.dist = 9; cam.manualT = 0; cam.minDist = 2.2; cam.maxDist = 6.5;
  }

  // ---- time ----
  const time = { scale: 1, now: 0, real: 0, dt: 0, rawDt: 0 };
  let tsTo = 1, tsRate = 0;
  function setTimeScale(s, ramp) {
    tsTo = clamp(s, 0, 2);
    if (ramp > 0) tsRate = Math.abs(tsTo - time.scale) / ramp; else { time.scale = tsTo; tsRate = 0; }
  }
  const timers = [];
  let timerGen = 0;
  function after(t, fn) { timers.push({ t, fn, gen: timerGen }); }

  // ---- level manager state ----
  let mode = "menu"; // "menu" | "loading" | "level" | "leaving"
  let running = false; // world simulated + rendered
  let active = null, activeN = 0;
  const levels = [null, null, null, null, null];
  const mods = [null, null, null, null, null];
  const sharedPool = Object.create(null);
  let muted = false;
  let sinceEnter = 0;

  // ---- camera ownership ----
  const rig = {
    take() { camCtl.taken = true; camCtl.blend = 0; },
    release(blend) {
      if (!camCtl.taken) return;
      camCtl.taken = false;
      camCtl.blendDur = blend || 0;
      camCtl.blend = blend > 0 ? 1 : 0;
      camCtl.pos.copy(camera.position); camCtl.quat.copy(camera.quaternion); camCtl.fov = camera.fov;
      if (!(blend > 0) && camera.fov !== baseFov) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    },
  };
  let hudBeforeCine = false;
  const cinema = createCinema(THREE, {
    camera, canvas, rig, audio, setTimeScale,
    onPlaying(on) {
      if (on) { hudBeforeCine = ui.el.hud.classList.contains("on"); ui.showHud(false); }
      else if (hudBeforeCine && mode === "level") ui.showHud(true);
    },
  });

  // ---- footsteps ----
  platypus.onFootstep = (i, lx, lz, strength) => {
    if (!world || !world.onFootstep || player.scripted) return;
    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    const wx = player.x + lx * c + lz * s;
    const wz = player.z - lx * s + lz * c;
    // pan: the foot's offset along the camera's right vector
    const pan = clamp(((wx - cam.tx) * -Math.cos(cam.yaw) + (wz - cam.tz) * Math.sin(cam.yaw)) * 1.6, -1, 1);
    world.onFootstep(wx, wz, strength, i, player.inWater, pan);
  };

  // ---- picking (clickable world objects) ----
  const picks = [];
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hits = [];
  let hoverPick = null, pickDirty = false, mouseX = 0, mouseY = 0;
  function pickAt(cx, cy) {
    if (!picks.length || !running) return null;
    ndc.set((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    let best = null, bd = Infinity;
    for (let i = 0; i < picks.length; i++) {
      const p = picks[i];
      if (!p.enabled || !p.object.visible) continue;
      hits.length = 0;
      raycaster.intersectObject(p.object, true, hits);
      if (hits.length && hits[0].distance < bd && hits[0].distance <= p.maxDist) { bd = hits[0].distance; best = p; }
    }
    hits.length = 0;
    return best;
  }
  function setHover(p) {
    if (p === hoverPick) return;
    if (hoverPick && hoverPick.onHover) hoverPick.onHover(false);
    hoverPick = p;
    document.body.classList.toggle("pickhover", !!p);
    if (p && p.onHover) p.onHover(true);
  }
  const pick = {
    // object: any Object3D (its meshes are ray-tested, so prefer one simple proxy mesh).
    // o: { onClick(handle), onHover(bool), maxDist: metres from the camera (default 60) }
    // returns a handle: { object, enabled, remove() }
    add(object, o) {
      const h = { object, enabled: true, onClick: (o && o.onClick) || null, onHover: (o && o.onHover) || null, maxDist: (o && o.maxDist) || 60,
        remove() { const i = picks.indexOf(h); if (i >= 0) picks.splice(i, 1); if (hoverPick === h) setHover(null); } };
      picks.push(h);
      return h;
    },
    clear() { picks.length = 0; setHover(null); },
    // the handle under a screen point (CSS pixels), or null
    at: pickAt,
  };

  // ---- world -> screen ----
  const vP = new THREE.Vector3();
  // out: { x, y (CSS pixels), visible }. v: Vector3 or Object3D (world position; yOff added)
  function project(v, out, yOff) {
    if (v.isObject3D) v.getWorldPosition(vP); else vP.copy(v);
    vP.y += yOff || 0;
    vP.project(camera);
    out.x = (vP.x * 0.5 + 0.5) * window.innerWidth;
    out.y = (-vP.y * 0.5 + 0.5) * window.innerHeight;
    out.visible = vP.z < 1 && vP.x > -1.1 && vP.x < 1.1 && vP.y > -1.1 && vP.y < 1.2;
    return out;
  }
  let speaker = null, speakerH = 2.12;
  const spOut = { x: 0, y: 0, visible: false };

  // ---- the context handed to every level ----
  const colliders = [];
  const ctx = {
    THREE, renderer, scene, camera, canvas,
    platypus, player, cam, audio, fx, ui, cinema, progress, time, pick, colliders,
    setWorld, setEnv, setTimeScale, after, project,
    get world() { return world; },
    get touch() { return ui.touch; },
    floorAt,
    takeCamera() { rig.take(); },
    releaseCamera(blend) { rig.release(blend === undefined ? 0.8 : blend); },
    // whose head the speech bubble points at (null = pinned at the top of the screen)
    setSpeaker(obj, height) { speaker = obj || null; speakerH = height === undefined ? 2.12 : height; },
    // one shared instance per key across all levels (the wizard, the zoo world, the friend...)
    shared(key, make) { return key in sharedPool ? sharedPool[key] : (sharedPool[key] = make()); },
    clearTimers() { timerGen++; timers.length = 0; },
    // the level was beaten: save progress, fade out, back to the level select (which plays the unlock animation)
    complete() { leave(true); },
    // leave without beating it
    quit() { leave(false); },
    input: {
      // is this action's key / button down right now ("jump", "interact", "primary", "secondary", "tailSlap", "hold", "trick1".."trick4")
      held: (name) => !!held[name],
      // raw move input, -1..1 (keys + touch stick): x = right, y = forward. Readable even while player.enabled is false.
      get x() { return clamp((keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + inp.sx, -1, 1); },
      get y() { return clamp((keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + inp.sy, -1, 1); },
    },
  };

  // ---- input ----
  const keys = Object.create(null);
  const held = Object.create(null); // action name -> bool (for ctx.input.held)
  const inp = { sx: 0, sy: 0, jumpT: 0, jumpHeld: false, skipHeld: false };
  const KEY_ACTION = { KeyJ: "primary", KeyK: "secondary", KeyL: "tailSlap", KeyH: "hold", Digit1: "trick1", Digit2: "trick2", Digit3: "trick3", Digit4: "trick4",
    Numpad1: "trick1", Numpad2: "trick2", Numpad3: "trick3", Numpad4: "trick4" };
  function gesture() { audio.resume(); }
  function canAct() { return running && mode === "level" && active && !cinema.playing; }
  // deliver a named action to the active level. Names: "primary" (J / left mouse / green button), "secondary"
  // (K / right mouse / blue button), "interact" (E / action prompt), "trick1".."trick4" (1-4 / trick buttons),
  // "tailSlap" (L / slap button), "hold" (H / hold button), "jump" (Space / jump button; return true to consume it).
  function act(name) {
    if (!canAct()) return false;
    if (name.charCodeAt(0) === 116 && name.charCodeAt(1) === 114 && !ui.tricksOn) return false; // "tr.." = trick keys only while a level shows them
    return active.onAction ? active.onAction(name) === true : false;
  }
  function doJump() {
    if (!canAct()) return;
    if (act("jump")) return;
    inp.jumpT = 0.16;
  }
  function doInteract() { if (!ui.advance()) act("interact"); }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    gesture();
    if (e.code === "Enter") inp.skipHeld = true;
    if (!running) return;
    const a = KEY_ACTION[e.code];
    if (a) { held[a] = true; act(a); }
    else if (e.code === "Space") { inp.jumpHeld = held.jump = true; doJump(); }
    else if (e.code === "Enter") ui.advance();
    else if (e.code === "KeyE") { held.interact = true; doInteract(); }
    else if (e.code === "KeyM") { muted = !muted; audio.setListenerMuted(muted); ui.hint(muted ? "Sound off" : "Sound on", 1.2); }
  });
  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
    const a = KEY_ACTION[e.code];
    if (a) held[a] = false;
    else if (e.code === "Space") inp.jumpHeld = held.jump = false;
    else if (e.code === "Enter") inp.skipHeld = false;
    else if (e.code === "KeyE") held.interact = false;
  });
  let stickId = -1, stickX = 0, stickY = 0, lookId = -1, lookX = 0, lookY = 0, mouseDrag = false;
  const STICK_R = 52;
  function homeStick() { ui.setStick(false, Math.min(92, Math.max(64, window.innerWidth * 0.19)), window.innerHeight - 104, 0, 0); }
  homeStick();
  function releaseInput() {
    for (const k in keys) keys[k] = false;
    for (const k in held) held[k] = false;
    inp.sx = inp.sy = 0; inp.jumpHeld = false; inp.skipHeld = false;
    mouseDrag = false; stickId = -1; lookId = -1;
    homeStick();
  }
  window.addEventListener("blur", releaseInput);
  document.addEventListener("visibilitychange", () => {
    audio.setListenerMuted(document.hidden || muted);
    if (document.hidden) releaseInput();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  function tryPick(e) {
    const p = pickAt(e.clientX, e.clientY);
    if (!p) return false;
    if (p.onClick) p.onClick(p);
    return true;
  }
  canvas.addEventListener("pointerdown", (e) => {
    gesture();
    if (e.pointerType === "touch") {
      ui.enableTouch();
      if (!running) return;
      if (tryPick(e)) return;
      if (e.clientX < window.innerWidth * 0.45 && stickId < 0) {
        stickId = e.pointerId; stickX = e.clientX; stickY = e.clientY;
        ui.setStick(true, stickX, stickY, 0, 0);
      } else if (lookId < 0) {
        lookId = e.pointerId; lookX = e.clientX; lookY = e.clientY;
      }
      return;
    }
    if (!running) return;
    canvas.setPointerCapture(e.pointerId);
    mouseDrag = true; lookX = e.clientX; lookY = e.clientY;
    if (e.button === 0) { if (!tryPick(e)) act("primary"); }
    else if (e.button === 2) act("secondary");
  });
  function orbit(dx, dy, k) {
    cam.yaw -= dx * k;
    cam.pitch = clamp(cam.pitch + dy * k * 0.8, 0.08, 1.15);
    cam.manualT = 2.5;
  }
  window.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") {
      if (e.pointerId === stickId) {
        let dx = e.clientX - stickX, dy = e.clientY - stickY;
        const l = Math.hypot(dx, dy);
        if (l > STICK_R) { dx *= STICK_R / l; dy *= STICK_R / l; }
        inp.sx = dx / STICK_R; inp.sy = -dy / STICK_R;
        ui.setStick(true, stickX, stickY, dx, dy);
      } else if (e.pointerId === lookId) {
        orbit(e.clientX - lookX, e.clientY - lookY, 0.006);
        lookX = e.clientX; lookY = e.clientY;
      }
    } else {
      mouseX = e.clientX; mouseY = e.clientY; pickDirty = true;
      // a second mouse button pressed while one is held arrives as a pointermove (button 0 / 2), not a pointerdown
      if (running) {
        if (e.button === 0) act("primary");
        else if (e.button === 2) act("secondary");
      }
      if (!mouseDrag) return;
      if (e.buttons === 0) { mouseDrag = false; return; }
      orbit(e.clientX - lookX, e.clientY - lookY, 0.005);
      lookX = e.clientX; lookY = e.clientY;
    }
  });
  function pointerEnd(e) {
    if (e.pointerId === stickId) { stickId = -1; inp.sx = inp.sy = 0; homeStick(); }
    if (e.pointerId === lookId) lookId = -1;
    if (e.pointerType !== "touch" && !e.buttons) mouseDrag = false;
  }
  window.addEventListener("pointerup", pointerEnd);
  window.addEventListener("pointercancel", pointerEnd);
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.wantDist = clamp(cam.wantDist + Math.sign(e.deltaY) * 0.4, cam.minDist, cam.maxDist); }, { passive: false });

  // on-screen buttons: fn on press; optional heldName keeps ctx.input.held(name) true while the finger is down
  function bindButton(el, fn, heldName, always) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      gesture();
      el.classList.add("down");
      if (heldName) held[heldName] = true;
      if (running || always) fn();
    });
    const up = () => { el.classList.remove("down"); if (heldName) held[heldName] = false; if (heldName === "jump") inp.jumpHeld = false; if (heldName === "skip") inp.skipHeld = false; };
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  bindButton(ui.el.btnSting, () => act("primary"), "primary");
  bindButton(ui.el.btnZap, () => act("secondary"), "secondary");
  bindButton(ui.el.btnSlap, () => act("tailSlap"), "tailSlap");
  bindButton(ui.el.btnHold, () => act("hold"), "hold");
  bindButton(ui.el.btnJump, () => { inp.jumpHeld = true; doJump(); }, "jump");
  bindButton(ui.el.action, doInteract, "interact");
  for (let i = 0; i < 4; i++) bindButton(ui.el.trk[i], () => act("trick" + (i + 1)), "trick" + (i + 1));
  bindButton(cinema.skipEl, () => { inp.skipHeld = true; }, "skip", true);
  ui.el.menuBtn.addEventListener("click", () => { if (mode === "level") { audio.uiClick(); leave(false); } });

  window.addEventListener("resize", () => {
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    fitFov();
    if (stickId < 0) homeStick();
  });

  // ---- player physics ----
  const GRAV = 17, JUMP_V = 6.0;
  const anim = { speed: 0, maxSpeed: 3, grounded: true, vy: 0, turn: 0, moving: false, time: 0, swimming: false, diving: false, carrying: false, inWater: false };
  let last = 0;
  let fps = 60, frames = 0;

  function updatePlayer(dt) {
    if (player.lock > 0) player.lock -= dt;
    if (player.invuln > 0) player.invuln -= dt;
    const g = platypus.group;
    if (player.scripted || !world) {
      // the level animates the model itself; keep the animation clock running
      g.visible = !player.hidden;
      anim.speed = player.speed; anim.maxSpeed = player.maxSpeed; anim.grounded = player.grounded; anim.vy = player.vy;
      anim.turn = player.turn; anim.moving = player.speed > 0.05; anim.time = time.now;
      anim.swimming = player.swimming; anim.diving = player.diving; anim.carrying = player.carrying; anim.inWater = player.inWater;
      platypus.update(dt, anim);
      return;
    }
    let wx = 0, wz = 0, mag = 0;
    const cine = cinema.playing;
    if (auto.on && player.lock <= 0) {
      const dx = auto.x - player.x, dz = auto.z - player.z, d = Math.hypot(dx, dz);
      if (d < 0.16) {
        auto.on = false;
        if (auto.face !== null) { player.face = auto.face; player.lock = Math.max(player.lock, 0.35); }
        const f = auto.then; auto.then = null;
        if (f) f();
      } else { wx = dx / d; wz = dz / d; mag = Math.min(auto.speed, 0.25 + d * 1.6); }
    } else if (player.enabled && player.lock <= 0 && !cine) {
      let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + inp.sx;
      let iy = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + inp.sy;
      mag = Math.hypot(ix, iy);
      if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
      if (mag > 0.08) {
        const fwx = Math.sin(cam.yaw), fwz = Math.cos(cam.yaw);
        wx = fwx * iy - fwz * ix; wz = fwz * iy + fwx * ix;
      }
    }
    const free = player.enabled && player.lock <= 0 && !cine;

    let target = 0, turned = 0;
    if (mag > 0.08) {
      const diff = wrap(Math.atan2(wx, wz) - player.yaw);
      const a = Math.abs(diff);
      turned = clamp(diff, -11 * dt, 11 * dt);
      target = player.maxSpeed * mag * (a > 1.7 ? 0.2 : a > 0.9 ? 0.6 : 1);
      if (player.swimming) target *= player.diving ? 1.3 : 1.12;
      else if (player.inWater) target *= 0.8;
    } else if (player.lock > 0 && player.face !== null) {
      turned = clamp(wrap(player.face - player.yaw), -9 * dt, 9 * dt);
    }
    player.yaw = wrap(player.yaw + turned);
    player.turn = dt > 0 ? turned / dt : 0;
    player.speed += clamp(target - player.speed, -20 * dt, (player.grounded ? 13 : 6) * dt);
    if (player.speed < 0.01 && target === 0) player.speed = 0;
    player.moving = player.speed > 0.05;

    const ox = player.x, oz = player.z;
    player.x += (Math.sin(player.yaw) * player.speed + player.kx) * dt;
    player.z += (Math.cos(player.yaw) * player.speed + player.kz) * dt;
    const damp = Math.exp(-7 * dt);
    player.kx *= damp; player.kz *= damp;

    for (let pass = 0; pass < 2; pass++) {
      const list = pass === 0 ? world.colliders : colliders;
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.on) continue;
        const dx = player.x - c.x, dz = player.z - c.z;
        const r = c.r + platypus.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          player.x = c.x + (dx / d) * r;
          player.z = c.z + (dz / d) * r;
        }
      }
    }
    if (world.confine) world.confine(player, platypus.radius);
    // ledges too tall to waddle up block the way (jump onto them instead)
    if (world.maxStep !== undefined && (player.x !== ox || player.z !== oz)) {
      // (a diver is measured from the float line, or the water surface above would count as a ledge and freeze it)
      const lim = (player.swimming ? Math.max(player.y, floorAt(ox, oz)) : player.y) + world.maxStep;
      if (floorAt(player.x, player.z) > lim) {
        if (floorAt(player.x, oz) <= lim) player.z = oz;
        else if (floorAt(ox, player.z) <= lim) player.x = ox;
        else { player.x = ox; player.z = oz; }
      }
    }

    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    const h = floorAt(player.x, player.z);
    const bed = world.heightAt(player.x, player.z);
    const surf = world.waterAt ? world.waterAt(player.x, player.z) : -Infinity;
    if (!world.ownsWater) player.inWater = surf > bed + 0.02 && player.y < surf + 0.05;
    if (inp.jumpT > 0) inp.jumpT -= dt;
    const canSwim = !!world.swim && surf - 0.1 > bed + 0.1;
    if (canSwim && player.grounded) {
      // afloat: Space (held) dives, letting go floats back up
      if (!player.swimming) { player.swimming = true; if (world.onSwim) world.onSwim(true, player.x, player.z); if (active && active.onSwim) active.onSwim(true); }
      inp.jumpT = 0;
      const top = surf - 0.1;
      const down = free && player.canDive && inp.jumpHeld;
      const want = down ? Math.max(bed + 0.07, surf - 2.4) : top;
      player.y += clamp(want - player.y, -1.8 * dt, 2.3 * dt);
      if (player.y < bed + 0.05) player.y = bed + 0.05;
      const under = player.y < top - 0.14;
      if (under !== player.diving) {
        player.diving = under;
        if (under) player.diveDepth = 0;
        if (world.onDive) world.onDive(under, player.x, player.z);
        if (active && active.onDive) active.onDive(under, player.diveDepth);
      }
      if (under && surf - player.y > player.diveDepth) player.diveDepth = surf - player.y;
      const k = Math.min(1, dt * 6);
      player.pitch += ((Math.abs(want - player.y) > 0.05 ? (want < player.y ? 0.5 : -0.4) : 0) - player.pitch) * k;
      player.roll += (0 - player.roll) * k;
      player.vy = 0;
    } else if (player.grounded) {
      if (player.swimming) { player.swimming = player.diving = false; if (world.onSwim) world.onSwim(false, player.x, player.z); if (active && active.onSwim) active.onSwim(false); }
      const hF = floorAt(player.x + s * 0.3, player.z + c * 0.3);
      const hB = floorAt(player.x - s * 0.3, player.z - c * 0.3);
      const hL = floorAt(player.x + c * 0.16, player.z - s * 0.16);
      const hR = floorAt(player.x - c * 0.16, player.z + s * 0.16);
      const body = Math.max(h, (hF + hB) * 0.5);
      player.y += (body - player.y) * Math.min(1, dt * 22);
      const k = Math.min(1, dt * 10);
      player.pitch += (clamp(Math.atan2(hB - hF, 0.6), -0.55, 0.55) * 0.85 - player.pitch) * k;
      player.roll += (clamp(Math.atan2(hL - hR, 0.32), -0.45, 0.45) * 0.7 - player.roll) * k;
      player.vy = 0;
      if (inp.jumpT > 0 && free && player.canJump) {
        inp.jumpT = 0;
        player.grounded = false;
        player.vy = JUMP_V;
        player.airT = 0;
        platypus.jump();
        audio.jump();
        if (world.onJump) world.onJump(player.x, player.z, h);
        if (active && active.onJump) active.onJump();
      }
    } else {
      player.airT += dt;
      player.vy -= GRAV * dt;
      player.y += player.vy * dt;
      const k = Math.min(1, dt * 6);
      player.pitch += (clamp(-player.vy * 0.035, -0.26, 0.16) - player.pitch) * k;
      player.roll += (0 - player.roll) * k;
      if (player.y <= h && player.vy <= 0) {
        const impact = clamp(-player.vy / 8, 0.15, 1);
        player.y = h;
        player.grounded = true;
        player.vy = 0;
        platypus.land(impact);
        if (world.onLand) world.onLand(player.x, player.z, h, impact, player.inWater || canSwim);
        if (active && active.onLand) active.onLand(impact);
      }
    }

    g.position.set(player.x, player.y, player.z);
    g.rotation.set(player.pitch, player.yaw, player.roll);
    // blink while invulnerable after a hit
    g.visible = !player.hidden && !(player.flicker && player.invuln > 0 && player.invuln < 1.35 && ((time.now * 14) | 0) % 2 === 0);

    anim.speed = player.speed; anim.maxSpeed = player.maxSpeed; anim.grounded = player.grounded; anim.vy = player.vy;
    anim.turn = player.turn; anim.moving = player.moving; anim.time = time.now;
    anim.swimming = player.swimming; anim.diving = player.diving; anim.carrying = player.carrying; anim.inWater = player.inWater;
    platypus.update(dt, anim);
  }

  // ---- camera ----
  const qT = new THREE.Quaternion(), vC = new THREE.Vector3();
  function updateCamera(dt, rawDt) {
    if (cam.manualT > 0) cam.manualT -= dt;
    else if (player.moving && lookId < 0 && !mouseDrag && !camCtl.taken) {
      // drift gently behind the walking platypus
      cam.yaw += Math.sin(wrap(player.yaw - cam.yaw)) * 0.75 * dt * Math.min(1, player.speed / 2);
    }
    const kx = Math.min(1, dt * 11), ky = Math.min(1, dt * 5);
    cam.tx += (player.x - cam.tx) * kx;
    cam.tz += (player.z - cam.tz) * kx;
    // follow the ground, and only a third of a jump, so the leap reads against a steady frame
    const gy = Math.max(floorAt(player.x, player.z), -0.3);
    cam.ty += ((player.diving ? player.y : gy + Math.max(0, player.y - gy) * 0.35) + 0.38 - cam.ty) * ky;
    cam.dist += (cam.wantDist - cam.dist) * Math.min(1, dt * 1.6);
    if (camCtl.taken) return;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    let cx = cam.tx - Math.sin(cam.yaw) * cp * cam.dist;
    let cz = cam.tz - Math.cos(cam.yaw) * cp * cam.dist;
    let cy = cam.ty + sp * cam.dist;
    if (world) {
      const b = world.camBounds;
      if (b) { cx = clamp(cx, b.minX, b.maxX); cz = clamp(cz, b.minZ, b.maxZ); if (b.maxY !== undefined && cy > b.maxY) cy = b.maxY; }
      const floor = floorAt(cx, cz) + 0.3;
      if (cy < floor) cy = floor;
    }
    camera.position.set(cx, cy, cz);
    camera.lookAt(cam.tx, cam.ty + 0.22, cam.tz);
    if (camCtl.blend > 0) {
      // easing back from a cutscene pose
      camCtl.blend = Math.max(0, camCtl.blend - rawDt / camCtl.blendDur);
      const k = camCtl.blend * camCtl.blend * (3 - 2 * camCtl.blend);
      vC.copy(camera.position); qT.copy(camera.quaternion);
      camera.position.lerpVectors(vC, camCtl.pos, k);
      camera.quaternion.slerpQuaternions(qT, camCtl.quat, k);
      camera.fov = baseFov + (camCtl.fov - baseFov) * k;
      camera.updateProjectionMatrix();
    }
  }

  // ---- loop ----
  function frame(now) {
    requestAnimationFrame(frame);
    let raw = (now - last) / 1000;
    last = now;
    if (!(raw > 0)) raw = 0.016;
    if (raw < 0.5) fps += (1 / raw - fps) * 0.05;
    if (raw > 0.05) raw = 0.05;
    time.real += raw;
    time.rawDt = raw;
    ui.update(raw);
    if (!running) { cinema.update(raw, inp.skipHeld); return; }
    if (time.scale !== tsTo) time.scale += clamp(tsTo - time.scale, -tsRate * raw, tsRate * raw);
    const dt = raw * time.scale;
    time.dt = dt;
    time.now += dt;
    sinceEnter += raw;
    frames++;

    // dynamic resolution: if the frame rate stays low, render fewer pixels (never steps back up)
    if (fps < 50 && sinceEnter > 3 && pr > 0.75) {
      slowT += raw;
      if (slowT > 1.5) {
        slowT = 0;
        pr = pr > 1.25 ? 1.25 : pr > 1 ? 1 : pr > 0.85 ? 0.85 : 0.75;
        renderer.setPixelRatio(pr);
        renderer.setSize(window.innerWidth, window.innerHeight, false);
      }
    } else slowT = 0;

    updatePlayer(dt);
    for (let i = 0; i < timers.length; i++) {
      const e = timers[i];
      e.t -= dt;
      if (e.t <= 0) { timers.splice(i, 1); i--; if (e.gen === timerGen) e.fn(); }
    }
    if (active && mode !== "menu") active.update(dt, time.now);
    if (world && world.update) world.update(dt, time.now, player.x, player.z);
    fx.update(dt, time.now);
    updateCamera(dt, raw);
    cinema.update(raw, inp.skipHeld);
    blendEnv(dt);
    followSun(player.x, player.y, player.z);

    if (pickDirty) { pickDirty = false; if (picks.length || hoverPick) setHover(mouseDrag ? null : pickAt(mouseX, mouseY)); }
    if (ui.speaking()) {
      if (speaker) {
        project(speaker, spOut, speakerH);
        ui.setBubbleAnchor(spOut.x, spOut.y, speaker.visible && spOut.visible && spOut.x > -0.05 * window.innerWidth && spOut.x < 1.05 * window.innerWidth && spOut.y > 0, window.innerWidth, window.innerHeight);
      } else ui.setBubbleAnchor(0, 0, false, window.innerWidth, window.innerHeight);
    }
    renderer.render(scene, camera);
  }

  // ---- level manager ----
  function fail(e) {
    console.error(e);
    try { if (active && active.exit) active.exit(); } catch (e2) { console.error(e2); }
    teardown();
    ui.showMenu(progress, { fade: true });
    ui.setBlack(false);
    ui.el.startTip.textContent = "that level could not load - please try again";
  }
  // everything transient goes; worlds and level objects are kept for the next visit
  function teardown() {
    running = false;
    mode = "menu";
    active = null; activeN = 0;
    timerGen++; timers.length = 0;
    colliders.length = 0;
    pick.clear();
    speaker = null;
    releaseInput();
    resetPlayer();
    platypus.group.visible = false;
    fx.clear(true);
    if (audio.stopAll) audio.stopAll(); else audio.stopAmbience();
    ui.resetHud();
    cinema.reset();
    setTimeScale(1, 0);
    camCtl.taken = false; camCtl.blend = 0;
    if (camera.fov !== baseFov) { camera.fov = baseFov; camera.updateProjectionMatrix(); }
    setWorld(null);
  }
  // n: 1..5. Returns a promise that resolves true once the level is running (false if it was refused).
  function startLevel(n) {
    n |= 0;
    if (mode !== "menu" || n < 1 || n > LEVEL_COUNT || !progress.isUnlocked(n)) return Promise.resolve(false);
    mode = "loading";
    audio.resume();
    audio.uiClick();
    ui.menuGo(n);
    ui.setBlack(true);
    const covered = new Promise((res) => ui.after(0.55, res));
    const loaded = mods[n - 1] ? Promise.resolve(mods[n - 1]) : LOADERS[n - 1]().then((m) => (mods[n - 1] = m));
    return Promise.all([loaded, covered]).then(([mod]) => {
      // behind the black cover: build (first time), warm the shaders, reset, enter
      ui.hideMenu();
      ui.resetHud();
      cinema.reset();
      cinema.fade("black", 0);
      ui.setBlack(false, true);
      resetPlayer();
      let L = levels[n - 1];
      if (!L) { L = levels[n - 1] = mod.createLevel(ctx); if (L.build) L.build(); }
      active = L; activeN = n;
      L.enter();
      if (!world) throw new Error("level " + n + " did not call ctx.setWorld() in enter()");
      platypus.group.visible = !player.hidden;
      mode = "level";
      running = true;
      sinceEnter = 0; last = performance.now();
      canvas.focus();
      L.start();
      return true;
    }).catch((e) => { fail(e); return false; });
  }
  function leave(beaten) {
    if (mode !== "level") return;
    mode = "leaving";
    const n = activeN;
    const un = beaten ? progress.beat(n) : 0;
    player.enabled = false;
    cinema.fade("black", cinema.faded >= 1 ? 0.05 : 0.7, () => {
      try { if (active && active.exit) active.exit(); } catch (e) { console.error(e); }
      ui.setBlack(true, true);
      teardown();
      ui.showMenu(progress, { unlock: un, onUnlock() { (audio.levelUnlock || audio.objective).call(audio); } });
      // let the black cover paint once before it fades off the level select
      ui.after(0.12, () => ui.setBlack(false));
    });
  }
  ui.onLevel((n) => { startLevel(n); });
  ui.onLocked(() => { audio.resume(); audio.uiClick(); });

  ui.setReady();
  requestAnimationFrame(frame);

  // ---- debug seam (tests, tools) ----
  const dbg = {
    state() {
      const s = active && active.state ? active.state() : {};
      s.mode = mode;
      s.levelN = activeN;
      s.running = running;
      s.progress = { unlocked: progress.unlocked, beaten: progress.beaten.slice() };
      s.player = { x: player.x, y: player.y, z: player.z, yaw: player.yaw, grounded: player.grounded, inWater: player.inWater, speed: player.speed, enabled: player.enabled, swimming: player.swimming, diving: player.diving };
      s.cam = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, taken: camCtl.taken };
      s.cinema = { playing: cinema.playing, faded: cinema.faded, eye: cinema.eye.openness };
      s.timeScale = time.scale;
      s.fps = fps;
      s.pixelRatio = pr;
      s.frames = frames;
      s.render = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs ? renderer.info.programs.length : 0 };
      return s;
    },
    skipTo(name) { return active && active.skipTo ? active.skipTo(name) : false; },
    win() { if (active && active.win) active.win(); },
    startLevel,
    unlock(n) { progress.unlock(n); if (mode === "menu") ui.showMenu(progress); },
    unlockAll() { progress.unlock(LEVEL_COUNT); if (mode === "menu") ui.showMenu(progress); },
    resetProgress() { progress.reset(); if (mode === "menu") ui.showMenu(progress); },
    level() { return active; },
    quit() { leave(false); },
    tp(x, z, yaw) { player.teleport(x, z, yaw === undefined ? player.yaw : yaw); },
    look(yaw, pitch, dist) { cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; if (dist !== undefined) cam.wantDist = cam.dist = dist; cam.manualT = 1e9; },
    ctx, player, cam, renderer, scene, camera, platypus, fx, audio, sun, hemi, ui, cinema, progress,
    get world() { return world; },
  };
  ctx.debug = dbg; // levels may hang their own handles here (level 1 adds game, cushions, wizard, human, dummies)
  window.__platy = dbg;
}

// let the level select paint before the (synchronous) engine start
requestAnimationFrame(() => setTimeout(boot, 30));
