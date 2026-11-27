// controller.js - the third-person character controller (CONTRACT 5.3).
// Capsule (r 0.4, h 1.8, step 0.45, max slope 45 deg) vs physics colliders + terrain; walk 5 / sprint 8 m/s,
// accel 40 ground / 12 air, jump v0 7.2, gravity 20, coyote 0.12 s, jump buffer 0.12 s, dodge roll 6 m in 0.45 s
// (i-frames 0.25 s, cooldown 0.9 s). Camera-relative movement. Swims (floats) in the deep river.

import { createHumanoid } from "../engine/humanoid.js";

const WALK = 5, SPRINT = 8, ACC_G = 40, ACC_A = 12, JUMP_V = 7.2, GRAV = 20, COYOTE = 0.12, BUFFER = 0.12;
const DODGE_DIST = 6, DODGE_T = 0.45, DODGE_IFR = 0.25, DODGE_CD = 0.9;

export const PLAYER_LOOK = { height: 1.8, build: "normal", skin: "#c99a74", shirt: "#56603f", pants: "#3b3128", hair: "#3d2a1a", cape: null, eyes: "normal" };

export function createController(ctx, engine) {
  const THREE = ctx.THREE, bus = ctx.bus, state = ctx.state;
  const physics = engine.physics, terrain = engine.terrain;
  const object = new THREE.Group();
  object.name = "player";
  engine.scene.add(object);
  const avatar = createHumanoid(THREE, engine, PLAYER_LOOK);
  object.add(avatar.root);
  avatar.mesh.castShadow = true;

  const s = {
    pos: object.position, vel: new THREE.Vector3(), onGround: false, groundId: -1, groundSurface: "grass",
    radius: 0.4, height: 1.8, stepUp: 0.45, landSpeed: 0, steep: false
  };
  let yaw = 0, targetYaw = 0;
  let control = true, lookOn = true;
  let coyote = 0, jumpBuf = 0, airTime = 0;
  let dodgeT = -1, dodgeCd = 0, dodgeX = 0, dodgeZ = 1;
  let rootUntil = -1, stagger = 0;
  let stepAcc = 0;
  let fellLatch = false;
  let safeTimer = 0;
  const safeRing = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  let safeIdx = 0;
  const lastSafe = new THREE.Vector3();
  let attackTurn = 0;
  let swimming = false;
  const stepPayload = { surface: "grass", run: false };
  const landPayload = { fall: 0 };
  const fellPayload = { y: 0 };
  const slots = { hand: null, back: null, head: null, body: null };
  let nameTag = null;
  const tagCache = new Map();
  let morph = "human";

  const _f = new THREE.Vector3();

  function camYaw() { return engine.camera3p ? engine.camera3p.yaw : yaw; }

  function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

  bus.on("input:attack", (p) => {
    if (p.phase !== "down") return;
    // face where the camera looks when not steering
    const m = engine.input.move;
    if (Math.hypot(m.x, m.y) < 0.15 && dodgeT < 0) { targetYaw = camYaw(); attackTurn = 0.15; }
  });

  function update(dt) {
    const input = engine.input;
    const playing = state.rt.playing || engine.devMode;
    if (!playing) {
      avatar.update(dt, 0, false);
      return;
    }
    const now = engine.time;
    const rooted = now < rootUntil;
    const canMove = control && !rooted && !state.rt.cinematic;
    // ---- desired velocity
    let mx = canMove ? input.move.x : 0, my = canMove ? input.move.y : 0;
    const cy = camYaw();
    const fx = Math.sin(cy), fz = Math.cos(cy);
    const rx = -Math.cos(cy), rz = Math.sin(cy);
    let wx = fx * my + rx * mx, wz = fz * my + rz * mx;
    const mag = Math.min(1, Math.hypot(wx, wz));
    if (mag > 1e-3) { wx /= Math.hypot(wx, wz); wz /= Math.hypot(wx, wz) || 1; }
    const sprint = canMove && input.down("sprint");
    let speed = (sprint ? SPRINT : WALK) * mag * engine.player.speedMul;
    // water
    const wl = engine.water ? engine.water.levelAt(s.pos.x, s.pos.z) : -1e9;
    swimming = wl > -1e8 && s.pos.y < wl - 1.1;
    if (swimming) speed *= 0.55;
    // ---- dodge
    dodgeCd -= dt;
    if (canMove && dodgeT < 0 && dodgeCd <= 0 && input.pressed("dodge")) {
      if (mag > 0.1) { dodgeX = wx; dodgeZ = wz; } else { dodgeX = Math.sin(yaw); dodgeZ = Math.cos(yaw); }
      dodgeT = 0; dodgeCd = DODGE_CD;
      targetYaw = Math.atan2(dodgeX, dodgeZ);
      yaw = targetYaw;
      bus.emit("player:dodge", {});
      avatar.play("roll");
    }
    let accel = s.onGround ? ACC_G : ACC_A;
    if (stagger > 0) { stagger -= dt; accel = 8; }
    if (dodgeT >= 0) {
      dodgeT += dt;
      const v = DODGE_DIST / DODGE_T;
      s.vel.x = dodgeX * v; s.vel.z = dodgeZ * v;
      if (dodgeT >= DODGE_T) { dodgeT = -1; s.vel.x *= 0.4; s.vel.z *= 0.4; }
    } else {
      const tx = wx * speed, tz = wz * speed;
      const dx = tx - s.vel.x, dz = tz - s.vel.z;
      const dl = Math.hypot(dx, dz);
      const st = accel * dt;
      if (dl <= st) { s.vel.x = tx; s.vel.z = tz; } else { s.vel.x += dx / dl * st; s.vel.z += dz / dl * st; }
    }
    // ---- jump (buffer + coyote)
    if (input.pressed("jump")) jumpBuf = BUFFER; else jumpBuf -= dt;
    coyote = s.onGround || swimming ? COYOTE : coyote - dt;
    if (canMove && jumpBuf > 0 && coyote > 0 && dodgeT < 0) {
      s.vel.y = JUMP_V * engine.player.jumpMul * (swimming ? 0.75 : 1);
      jumpBuf = 0; coyote = 0;
      s.onGround = false;
      bus.emit("player:jump", {});
      avatar.play("jump");
    }
    // ---- gravity / buoyancy
    const gm = engine.player.gravityMul;
    s.vel.y -= GRAV * gm * dt;
    if (swimming) {
      const depth = (wl - 1.35) - s.pos.y;
      if (depth > 0) s.vel.y += Math.min(depth * 30, 40) * dt;
      s.vel.y *= Math.pow(0.1, dt);
    }
    if (s.vel.y < -55) s.vel.y = -55;
    // ---- moving platforms (once per frame)
    if (s.onGround && s.groundId > 0 && engine.loop.substep === 0) {
      const c = physics.colliderMoved(s.groundId);
      if (c) { s.pos.x += c.dx; s.pos.y += c.dy; s.pos.z += c.dz; }
    }
    // ---- integrate
    const wasGround = s.onGround;
    s.landSpeed = 0;
    if (gm < 0) s.onGround = false;
    physics.moveCapsule(s, dt);
    if (gm < 0) { s.onGround = false; }
    if (s.onGround) airTime = 0; else airTime += dt;
    if (!wasGround && s.onGround) {
      landPayload.fall = s.landSpeed;
      if (s.landSpeed > 2.5) bus.emit("player:land", landPayload);
    }
    // ---- footsteps (in sync with the avatar stride)
    const hs = Math.hypot(s.vel.x, s.vel.z);
    if (s.onGround && hs > 0.6 && dodgeT < 0) {
      const wR = hs > 6.8 ? 1 : hs < 3.8 ? 0 : (hs - 3.8) / 3;
      const half = (1.45 + wR * 1.0) * 0.5;
      stepAcc += hs * dt;
      if (stepAcc >= half) {
        stepAcc -= half;
        stepPayload.surface = s.groundSurface || "grass";
        stepPayload.run = hs > 6;
        bus.emit("player:step", stepPayload);
      }
    } else stepAcc = Math.min(stepAcc, 0.3);
    // ---- facing
    if (attackTurn > 0) attackTurn -= dt;
    else if (dodgeT < 0 && hs > 0.4 && mag > 0.05) targetYaw = Math.atan2(s.vel.x, s.vel.z);
    if (engine.camera3p && engine.camera3p.isFirstPerson) targetYaw = engine.camera3p.yaw;
    const dyaw = wrapAngle(targetYaw - yaw);
    const turn = (attackTurn > 0 ? 22 : 12) * dt;
    yaw = Math.abs(dyaw) <= turn ? targetYaw : wrapAngle(yaw + Math.sign(dyaw) * turn);
    object.rotation.y = yaw;
    // ---- kill plane
    const region = terrain.regionAt(s.pos.x, s.pos.z);
    const ky = physics.killY(region === "none" ? "none" : region);
    if (s.pos.y < ky && !fellLatch) {
      fellLatch = true;
      fellPayload.y = s.pos.y;
      bus.emit("player:fell", fellPayload);
    } else if (fellLatch && s.onGround && s.pos.y > ky + 5) fellLatch = false;
    // ---- last safe ground (sampled; the oldest of 4 samples ~1 s back)
    safeTimer -= dt;
    if (safeTimer <= 0 && s.onGround && !s.steep && dodgeT < 0) {
      safeTimer = 0.3;
      safeRing[safeIdx].copy(s.pos);
      safeIdx = (safeIdx + 1) % safeRing.length;
      lastSafe.copy(safeRing[safeIdx]);
      if (lastSafe.lengthSq() === 0) lastSafe.copy(s.pos);
    }
    // ---- triggers
    physics.updateTriggers(s.pos);
    // ---- avatar
    avatar.update(dt, s.onGround ? hs : hs * 0.5, !s.onGround && airTime > 0.15 && !swimming);
  }

  function makeTag(text) {
    if (tagCache.has(text)) return tagCache.get(text);
    const c = document.createElement("canvas");
    const g = c.getContext("2d");
    const font = "500 34px system-ui, -apple-system, Segoe UI, sans-serif";
    g.font = font;
    const w = Math.ceil(g.measureText(text).width) + 24;
    c.width = Math.max(64, w); c.height = 52;
    g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
    g.shadowColor = "rgba(0,0,0,0.7)"; g.shadowBlur = 6;
    g.fillStyle = "rgba(255,255,255,1)";
    g.fillText(text, c.width / 2, c.height / 2);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.7, depthWrite: false, fog: false });
    m.color.setScalar(1.6);
    const rec = { mat: m, aspect: c.width / c.height };
    tagCache.set(text, rec);
    return rec;
  }

  const player = {
    object, avatar,
    get position() { return object.position; },
    get velocity() { return s.vel; },
    get yaw() { return yaw; },
    set yaw(v) { yaw = targetYaw = v; object.rotation.y = v; },
    get onGround() { return s.onGround; },
    get dodging() { return dodgeT >= 0 && dodgeT < DODGE_IFR; },
    get rolling() { return dodgeT >= 0; },
    get swimming() { return swimming; },
    get lastSafe() { return lastSafe; },
    get groundSurface() { return s.groundSurface; },
    speedMul: 1, jumpMul: 1, gravityMul: 1,
    teleport(p, yw) {
      s.pos.set(p.x, p.y, p.z);
      s.vel.set(0, 0, 0);
      if (yw != null) { yaw = targetYaw = yw; object.rotation.y = yw; }
      const g = physics.groundAt(p.x, p.z, p.y + 0.5, 0.4);
      if (g.y > -1e8 && p.y - g.y < 1.2) { s.pos.y = g.y; s.onGround = true; s.groundId = g.id; s.groundSurface = g.surface; }
      else s.onGround = false;
      for (const v of safeRing) v.copy(s.pos);
      lastSafe.copy(s.pos);
      fellLatch = false; dodgeT = -1; stagger = 0; jumpBuf = 0; airTime = 0;
      object.updateMatrixWorld(true);
      if (engine.camera3p) engine.camera3p.resetBehind(yaw);
    },
    setControl(v) { control = !!v; if (!control) { jumpBuf = 0; } },
    get control() { return control; },
    setLook(v) { lookOn = !!v; },
    get lookEnabled() { return lookOn; },
    knockback(imp) {
      s.vel.x += imp.x || 0; s.vel.y += imp.y || 0; s.vel.z += imp.z || 0;
      if ((imp.y || 0) > 0) s.onGround = false;
      stagger = 0.3;
    },
    root(sec) { rootUntil = Math.max(rootUntil, engine.time + Math.max(0, sec || 0)); },
    forward(out) { out.set(Math.sin(yaw), 0, Math.cos(yaw)); return out; },
    isMoving() { return Math.hypot(s.vel.x, s.vel.z) > 0.35 && Math.hypot(engine.input.move.x, engine.input.move.y) > 0.1; },
    isSprinting() { return player.isMoving() && engine.input.down("sprint") && Math.hypot(s.vel.x, s.vel.z) > 5.5; },
    setMorph(kind) {
      morph = kind || "human";
      const L = PLAYER_LOOK;
      avatar.root.scale.y = avatar.root.scale.x;
      if (morph === "villager") {
        avatar.setColors({ skin: L.skin, shirt: "#7d6b4b", pants: "#4b4031", hair: L.hair, cape: "#5a4a36" }); avatar.setHat("straw"); avatar.setEyes("normal");
      } else if (morph === "scarecrow") {
        avatar.setColors({ skin: "#b8975e", shirt: "#7d5f34", pants: "#5a4828", hair: "#c9a85a", cape: "#6a5530" }); avatar.setHat("straw"); avatar.setEyes("normal");
      } else if (morph === "hollow") {
        avatar.setColors({ skin: "#040404", shirt: "#060606", pants: "#040404", hair: "#020202", cape: "#030303" }); avatar.setHat(null); avatar.setEyes("glow");
        avatar.root.scale.y = avatar.root.scale.x * 1.18;
      } else {
        avatar.setColors({ skin: L.skin, shirt: L.shirt, pants: L.pants, hair: L.hair, cape: L.cape }); avatar.setHat(null); avatar.setEyes("normal");
      }
    },
    get morph() { return morph; },
    attach(slot, obj) {
      const sock = slot === "hand" ? avatar.hand : slot === "back" ? avatar.sockets.back : slot === "head" ? avatar.sockets.head : avatar.sockets.body;
      if (!sock) return;
      if (slots[slot] && slots[slot].parent === sock) sock.remove(slots[slot]);
      slots[slot] = obj || null;
      if (obj) {
        sock.add(obj);
        obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      }
    },
    attached(slot) { return slots[slot] || null; },
    setArmorLook(look) { avatar.setArmor(look || null); },
    play(action, opts) { return avatar.play(action, opts); },
    setNameTag(text) {
      if (!text) { if (nameTag) nameTag.visible = false; return; }
      const rec = makeTag(String(text).slice(0, 24));
      if (!nameTag) {
        nameTag = new THREE.Sprite(rec.mat); nameTag.renderOrder = 50; object.add(nameTag);
        // fade the own tag out when the camera is pushed in close (collision, first person, cinematics) so the
        // world-scaled sprite never balloons over the HUD
        const tagPos = new THREE.Vector3();
        nameTag.onBeforeRender = (r, sc, cam) => {
          tagPos.setFromMatrixPosition(nameTag.matrixWorld);
          const d = cam.position.distanceTo(tagPos);
          const k = d < 2.2 ? 0 : d > 3.2 ? 1 : (d - 2.2);
          nameTag.material.opacity = 0.7 * k;
        };
      }
      nameTag.material = rec.mat;
      nameTag.visible = true;
      const h = 0.2;
      nameTag.scale.set(h * rec.aspect, h, 1);
      nameTag.position.set(0, 2.12, 0);
    },
    setVisible(v) { avatar.setVisible(v); if (nameTag) nameTag.visible = !!v && nameTag.material.map != null; },
    update,
    _state: s
  };
  return player;
}
