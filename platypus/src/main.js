// main.js - renderer, scene, lights, loop, camera, input and player physics.
import * as THREE from "../vendor/three.module.js";
import { createCushionField } from "./cushions.js";
import { createPlatypus } from "./platypus.js";
import { createAudio } from "./audio.js";
import { createWizard } from "./wizard.js";
import { createDummy, createHuman } from "./actors.js";
import { createFx } from "./fx.js";
import { createUI } from "./ui.js";
import { createGame } from "./game.js";

const TAU = Math.PI * 2;
const wrap = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const ui = createUI();
const canvas = document.getElementById("scene");
const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
if (coarse) ui.enableTouch();

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
  // portrait phones: widen the vertical field of view so the wizard, the water and the foe stay in frame
  function fitFov() {
    const a = window.innerWidth / window.innerHeight;
    camera.fov = a < 1 ? Math.min(72, 52 + (1 - a) * 36) : 52;
    camera.aspect = a;
    camera.updateProjectionMatrix();
  }
  fitFov();

  // ---- soft white studio light ----
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
  const lRight = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), SUN_DIR).normalize();
  const lUp = new THREE.Vector3().crossVectors(SUN_DIR, lRight).normalize();
  const TEXEL = (SH * 2) / 1024;
  const vT = new THREE.Vector3();
  function followSun(x, y, z) {
    vT.set(x, 0, z);
    const r = Math.round(vT.dot(lRight) / TEXEL) * TEXEL;
    const u = Math.round(vT.dot(lUp) / TEXEL) * TEXEL;
    const d = vT.dot(SUN_DIR);
    sun.target.position.set(0, 0, 0).addScaledVector(lRight, r).addScaledVector(lUp, u).addScaledVector(SUN_DIR, d);
    sun.position.copy(sun.target.position).addScaledVector(SUN_DIR, 25);
    sun.target.updateMatrixWorld();
  }

  // ---- world ----
  const cushions = createCushionField(THREE, { renderer });
  scene.add(cushions.group);
  cushions.fadeColor.copy(scene.fog.color);
  cushions.material.color.set(0xffffff);
  const platypus = createPlatypus(THREE);
  platypus.group.rotation.order = "YXZ";
  scene.add(platypus.group);
  const wizard = createWizard(THREE);
  scene.add(wizard.group);
  const dummies = [createDummy(THREE), createDummy(THREE), createDummy(THREE), createDummy(THREE)];
  for (const d of dummies) scene.add(d.group);
  const human = createHuman(THREE);
  scene.add(human.group);
  const fx = createFx(THREE);
  scene.add(fx.group);
  fx.setSun(SUN_DIR.x, SUN_DIR.y, SUN_DIR.z);
  const audio = createAudio();

  // soft glow at the wizard's crystal (one sprite, no light)
  const glowTex = (() => {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 64;
    const g = cv.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.25, "rgba(190,170,255,.55)");
    gr.addColorStop(1, "rgba(150,120,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, opacity: 0.75, fog: false }));
  glow.scale.setScalar(0.42);
  wizard.staffTip.add(glow);

  // ---- player ----
  const cam = { yaw: 0, pitch: 0.42, dist: 9, wantDist: 3.7, tx: 0, ty: 0.4, tz: 0, manualT: 0 };
  const player = {
    x: 0, y: 0, z: 0, yaw: 0, vy: 0, grounded: true, speed: 0, maxSpeed: 3.0, turn: 0, moving: false,
    lock: 0, face: null, kx: 0, kz: 0, invuln: 0, enabled: false, inWater: false, pitch: 0, roll: 0, airT: 0,
    teleport(x, z, yaw) {
      this.x = x; this.z = z; this.yaw = yaw; this.vy = 0; this.grounded = true; this.speed = 0; this.kx = this.kz = 0; this.lock = 0;
      this.y = cushions.heightAt(x, z);
      cam.tx = x; cam.ty = this.y + 0.4; cam.tz = z; cam.yaw = yaw; cam.dist = cam.wantDist + 1.2;
    },
  };
  const colliders = [];

  const game = createGame({ THREE, cushions, platypus, wizard, fx, audio, ui, player, dummies, human, colliders });

  // ---- footsteps ----
  platypus.onFootstep = (i, lx, lz, strength) => {
    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    const wx = player.x + lx * c + lz * s;
    const wz = player.z - lx * s + lz * c;
    const wet = player.inWater;
    cushions.press(wx, wz, 0.32 + 0.4 * strength);
    // pan: the foot's offset along the camera's right vector
    const pan = clamp(((wx - cam.tx) * -Math.cos(cam.yaw) + (wz - cam.tz) * Math.sin(cam.yaw)) * 1.6, -1, 1);
    audio.cushionStep(wet ? strength * 0.6 : strength, pan);
    if (wet) fx.rippleAt(wx, wz, 0.5 + strength * 0.5);
    else if (i < 2 || strength > 0.7) fx.cushionPuff(wx, cushions.heightAt(wx, wz) + 0.02, wz, strength * 0.55);
  };

  // ---- input ----
  let running = false; // world simulated + rendered
  let muted = false;
  const keys = Object.create(null);
  const inp = { sx: 0, sy: 0, jumpT: 0 };
  function doJump() { inp.jumpT = 0.16; }
  function gesture() { audio.resume(); }

  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    gesture();
    if (!running) return;
    if (e.code === "Space") doJump();
    else if (e.code === "KeyJ") game.trySting();
    else if (e.code === "KeyK") game.tryZap();
    else if (e.code === "Enter" || e.code === "KeyE") ui.advance();
    else if (e.code === "KeyM") { muted = !muted; audio.setListenerMuted(muted); ui.hint(muted ? "Sound off" : "Sound on", 1.2); }
  });
  window.addEventListener("keyup", (e) => { keys[e.code] = false; });
  let stickId = -1, stickX = 0, stickY = 0, lookId = -1, lookX = 0, lookY = 0, mouseDrag = false;
  const STICK_R = 52;
  function homeStick() { ui.setStick(false, Math.min(92, Math.max(64, window.innerWidth * 0.19)), window.innerHeight - 104, 0, 0); }
  homeStick();
  function releaseInput() {
    for (const k in keys) keys[k] = false;
    inp.sx = inp.sy = 0;
    mouseDrag = false; stickId = -1; lookId = -1;
    homeStick();
  }
  window.addEventListener("blur", releaseInput);
  document.addEventListener("visibilitychange", () => {
    audio.setListenerMuted(document.hidden || muted);
    if (document.hidden) releaseInput();
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  canvas.addEventListener("pointerdown", (e) => {
    gesture();
    if (e.pointerType === "touch") {
      ui.enableTouch();
      if (!running) return;
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
    if (e.button === 0) game.trySting();
    else if (e.button === 2) game.tryZap();
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
      // a second mouse button pressed while one is held arrives as a pointermove (button 0 / 2), not a pointerdown
      if (running) {
        if (e.button === 0) game.trySting();
        else if (e.button === 2) game.tryZap();
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
  canvas.addEventListener("wheel", (e) => { e.preventDefault(); cam.wantDist = clamp(cam.wantDist + Math.sign(e.deltaY) * 0.4, 2.2, 6.5); }, { passive: false });

  function bindButton(el, fn) {
    el.addEventListener("pointerdown", (e) => {
      e.preventDefault(); e.stopPropagation();
      gesture();
      el.classList.add("down");
      if (running) fn();
    });
    const up = () => el.classList.remove("down");
    el.addEventListener("pointerup", up);
    el.addEventListener("pointerleave", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("contextmenu", (e) => e.preventDefault());
  }
  bindButton(ui.el.btnSting, () => game.trySting());
  bindButton(ui.el.btnZap, () => game.tryZap());
  bindButton(ui.el.btnJump, doJump);

  window.addEventListener("resize", () => {
    renderer.setPixelRatio(pr);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    fitFov();
    if (stickId < 0) homeStick();
  });

  // ---- player physics ----
  const GRAV = 17, JUMP_V = 6.0;
  const anim = { speed: 0, maxSpeed: 3, grounded: true, vy: 0, turn: 0, moving: false, time: 0 };
  let clockT = 0, last = 0;
  let fps = 60, frames = 0;

  function floorAt(x, z) {
    const h = cushions.heightAt(x, z);
    const w = game.waterLevelAt(x, z) - 0.1; // paddle with the back out of the water
    return w > h ? w : h;
  }

  function updatePlayer(dt) {
    let ix = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + inp.sx;
    let iy = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + inp.sy;
    let mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
    if (player.lock > 0) player.lock -= dt;
    const free = player.enabled && player.lock <= 0;
    if (!free) mag = 0;

    let target = 0, turned = 0;
    if (mag > 0.08) {
      const fwx = Math.sin(cam.yaw), fwz = Math.cos(cam.yaw);
      const wx = fwx * iy - fwz * ix, wz = fwz * iy + fwx * ix;
      const diff = wrap(Math.atan2(wx, wz) - player.yaw);
      const a = Math.abs(diff);
      turned = clamp(diff, -11 * dt, 11 * dt);
      target = player.maxSpeed * mag * (a > 1.7 ? 0.2 : a > 0.9 ? 0.6 : 1);
      if (player.inWater) target *= 0.8;
    } else if (player.lock > 0 && player.face !== null) {
      turned = clamp(wrap(player.face - player.yaw), -9 * dt, 9 * dt);
    }
    player.yaw = wrap(player.yaw + turned);
    player.turn = dt > 0 ? turned / dt : 0;
    player.speed += clamp(target - player.speed, -20 * dt, (player.grounded ? 13 : 6) * dt);
    if (player.speed < 0.01 && target === 0) player.speed = 0;
    player.moving = player.speed > 0.05;

    player.x += (Math.sin(player.yaw) * player.speed + player.kx) * dt;
    player.z += (Math.cos(player.yaw) * player.speed + player.kz) * dt;
    const damp = Math.exp(-7 * dt);
    player.kx *= damp; player.kz *= damp;

    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
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

    const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
    const h = floorAt(player.x, player.z);
    if (inp.jumpT > 0) inp.jumpT -= dt;
    if (player.grounded) {
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
      if (inp.jumpT > 0 && free) {
        inp.jumpT = 0;
        player.grounded = false;
        player.vy = JUMP_V;
        player.airT = 0;
        platypus.jump();
        audio.jump();
        cushions.press(player.x, player.z, 1.3);
        fx.cushionPuff(player.x, h + 0.03, player.z, 1.0);
        game.onJump();
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
        audio.cushionLand(impact);
        cushions.press(player.x, player.z, 0.8 + 1.15 * impact);
        if (player.inWater) fx.rippleAt(player.x, player.z, 2.5);
        fx.cushionPuff(player.x, h + 0.03, player.z, 0.8 + 1.6 * impact);
        game.onLand();
      }
    }

    const g = platypus.group;
    g.position.set(player.x, player.y, player.z);
    g.rotation.set(player.pitch, player.yaw, player.roll);
    // blink while invulnerable after a hit
    g.visible = !(player.invuln > 0 && player.invuln < 1.35 && game.step === "fight" && ((clockT * 14) | 0) % 2 === 0);

    anim.speed = player.speed; anim.maxSpeed = player.maxSpeed; anim.grounded = player.grounded; anim.vy = player.vy;
    anim.turn = player.turn; anim.moving = player.moving; anim.time = clockT;
    platypus.update(dt, anim);
  }

  // ---- camera ----
  const vP = new THREE.Vector3();
  function updateCamera(dt) {
    if (cam.manualT > 0) cam.manualT -= dt;
    else if (player.moving && lookId < 0 && !mouseDrag) {
      // drift gently behind the walking platypus
      cam.yaw += Math.sin(wrap(player.yaw - cam.yaw)) * 0.75 * dt * Math.min(1, player.speed / 2);
    }
    const kx = Math.min(1, dt * 11), ky = Math.min(1, dt * 5);
    cam.tx += (player.x - cam.tx) * kx;
    cam.tz += (player.z - cam.tz) * kx;
    // follow the ground, and only a third of a jump, so the leap reads against a steady frame
    const gy = Math.max(floorAt(player.x, player.z), -0.3);
    cam.ty += (gy + Math.max(0, player.y - gy) * 0.35 + 0.38 - cam.ty) * ky;
    cam.dist += (cam.wantDist - cam.dist) * Math.min(1, dt * 1.6);
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const cx = cam.tx - Math.sin(cam.yaw) * cp * cam.dist;
    const cz = cam.tz - Math.cos(cam.yaw) * cp * cam.dist;
    let cy = cam.ty + sp * cam.dist;
    const floor = cushions.heightAt(cx, cz) + 0.3;
    if (cy < floor) cy = floor;
    camera.position.set(cx, cy, cz);
    camera.lookAt(cam.tx, cam.ty + 0.22, cam.tz);
  }

  // ---- loop ----
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt < 0.5) fps += (1 / dt - fps) * 0.05;
    if (dt > 0.05) dt = 0.05;
    ui.update(dt);
    if (!running) return;
    clockT += dt;
    frames++;

    // dynamic resolution: if the frame rate stays low, render fewer pixels (never steps back up)
    if (fps < 50 && clockT > 3 && pr > 0.75) {
      slowT += dt;
      if (slowT > 1.5) {
        slowT = 0;
        pr = pr > 1.25 ? 1.25 : pr > 1 ? 1 : pr > 0.85 ? 0.85 : 0.75;
        renderer.setPixelRatio(pr);
        renderer.setSize(window.innerWidth, window.innerHeight, false);
      }
    } else slowT = 0;

    updatePlayer(dt);
    game.update(dt, clockT);
    cushions.update(dt, player.x, player.z);
    wizard.update(dt, clockT);
    fx.update(dt, clockT);
    updateCamera(dt);
    followSun(player.x, player.y, player.z);

    if (ui.speaking()) {
      const wg = wizard.group;
      vP.set(wg.position.x, wg.position.y + 2.12, wg.position.z).project(camera);
      const on = wg.visible && vP.z < 1 && vP.x > -1.1 && vP.x < 1.1 && vP.y > -1 && vP.y < 1.2;
      ui.setBubbleAnchor((vP.x * 0.5 + 0.5) * window.innerWidth, (-vP.y * 0.5 + 0.5) * window.innerHeight, on, window.innerWidth, window.innerHeight);
    }
    renderer.render(scene, camera);
  }

  // ---- warm-up: compile every shader once behind the start screen ----
  function warm() {
    const vis = [];
    scene.traverse((o) => { vis.push(o, o.visible); o.visible = true; });
    const w = fx.createWater(0, 0, 2, 1, 0, { surfaceY: -5 });
    camera.lookAt(0, 0, 0);
    followSun(0, 0, 0);
    try { renderer.compile(scene, camera); renderer.render(scene, camera); } catch (e) { console.warn(e); }
    w.dispose();
    for (let i = 0; i < vis.length; i += 2) vis[i].visible = vis[i + 1];
    fx.clear(false);
  }
  warm();

  ui.onStart(() => {
    audio.resume();
    audio.uiClick();
    ui.playIntro({
      onBlack() { audio.introBoom(); },
      onRise(d) { audio.introRise(d); },
      onReveal() {
        running = true;
        player.teleport(0, 0, 0);
        cam.dist = 8.5; cam.pitch = 0.42;
        audio.startAmbience();
        canvas.focus();
      },
      onDone() {
        player.enabled = true;
        game.start();
      },
    });
  });
  ui.setHearts(5, 5);
  ui.setReady();
  requestAnimationFrame(frame);

  // ---- debug seam ----
  window.__platy = {
    state() {
      const s = game.state();
      s.running = running;
      s.player = { x: player.x, y: player.y, z: player.z, yaw: player.yaw, grounded: player.grounded, inWater: player.inWater, speed: player.speed, enabled: player.enabled };
      s.cam = { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist };
      s.fps = fps;
      s.pixelRatio = pr;
      s.frames = frames;
      s.render = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, programs: renderer.info.programs ? renderer.info.programs.length : 0 };
      return s;
    },
    skipTo(name) { return game.skipTo(name); },
    win() { game.win(); },
    tp(x, z, yaw) { player.teleport(x, z, yaw === undefined ? player.yaw : yaw); },
    look(yaw, pitch, dist) { cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; if (dist !== undefined) cam.wantDist = cam.dist = dist; cam.manualT = 1e9; },
    game, player, cam, renderer, scene, camera, cushions, platypus, wizard, fx, audio, human, dummies, sun, hemi,
  };
}

// let the start screen paint before the (synchronous) world build
requestAnimationFrame(() => setTimeout(boot, 30));
