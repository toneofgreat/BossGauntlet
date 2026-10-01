/* ===========================================================================
   player.js - you: on foot, and on a broom. Also the camera that follows you
   around, and the collision that stops you walking through the school.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { buildAvatar, buildWand, poseWalk, poseIdle, poseCast, poseFly, solid } from './avatar.js';
import { mat } from './tex.js';
import { IN, R, clamp, lerp, damp, angWrap, TAU, rnd } from './core.js';

const V = new THREE.Vector3();
const V2 = new THREE.Vector3();

export function buildBroom() {
  const g = new THREE.Group();
  const woodM = mat('wood', { size: 128, repeat: [1, 6], dark: [44, 28, 14], light: [104, 70, 34], roughness: 0.55 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 2.1, 12), woodM);
  shaft.rotation.x = Math.PI / 2;
  g.add(shaft);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.04, 0.34, 10), solid(0x2a1a10, 0.85));
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0.95;
  g.add(handle);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), solid(0xb08d57, 0.35, 0.8));
  band.rotation.x = Math.PI / 2; band.position.z = -0.55;
  g.add(band);
  const bris = solid(0xa8792e, 1);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * TAU, r = 0.03 + (i % 3) * 0.022;
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.8, 4), bris);
    b.position.set(Math.cos(a) * r, Math.sin(a) * r, -1.35);
    b.rotation.x = Math.PI / 2 + rnd(-0.1, 0.1);
    b.rotation.z = rnd(-0.08, 0.08);
    g.add(b);
  }
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  return g;
}

export function makePlayer(world, look, opts) {
  opts = opts || {};
  const av = buildAvatar(look, {});
  const wand = buildWand(opts.wand || 0);
  // the wand rides in the right hand
  const hand = av.userData.handR;
  wand.scale.setScalar(1.0);
  wand.position.set(0, -0.02, 0.04);
  wand.rotation.x = -0.4;
  hand.add(wand);

  const root = new THREE.Group();
  root.add(av);
  // a hand-width of moonlight that follows you: without it the hero is a black
  // smudge in half the chapters, and the dark stops being frightening and
  // starts being annoying
  const me = new THREE.PointLight(0x9fb4e0, 2.6, 6.5, 2);
  me.position.set(0, 1.5, 0.35);
  root.add(me);
  const broom = buildBroom();
  broom.visible = false;
  root.add(broom);
  world.group.add(root);

  const p = {
    root, av, wand, broom,
    pos: world.spawn.clone(),
    vel: new THREE.Vector3(),
    yaw: world.spawnYaw || 0,
    mode: 'walk',
    grounded: true,
    speed: 0,
    castT: 0,
    hp: opts.hp || 5, maxHp: opts.hp || 5,
    invuln: 0,
    radius: 0.36,
    height: 1.75,
    flySpeed: 0,
    pitch: 0,
    frozen: false,
    hasBroom: false
  };
  root.position.copy(p.pos);
  root.rotation.y = p.yaw;
  return p;
}

/* -------------------------------------------------------------- camera -- */
export const CAM = {
  yaw: 0, pitch: 0.24, dist: 5.2, targetDist: 5.2, height: 1.5, shake: 0,
  first: false,
  reset(yaw) { this.yaw = yaw || 0; this.pitch = 0.24; this.dist = this.targetDist; }
};

export function updateCamera(p, dt, world, o) {
  o = o || {};
  const look = IN.takeLook();
  CAM.yaw -= look.x;
  CAM.pitch = clamp(CAM.pitch + look.y, o.minPitch === undefined ? -0.5 : o.minPitch, o.maxPitch === undefined ? 1.15 : o.maxPitch);
  const dist = o.dist === undefined ? CAM.targetDist : o.dist;
  CAM.dist = damp(CAM.dist, dist, 6, dt);
  const h = o.height === undefined ? CAM.height : o.height;
  const cy = Math.cos(CAM.pitch), sy = Math.sin(CAM.pitch);
  const tx = p.pos.x, ty = p.pos.y + h, tz = p.pos.z;
  let cx = tx + Math.sin(CAM.yaw) * cy * CAM.dist;
  let cz = tz + Math.cos(CAM.yaw) * cy * CAM.dist;
  let cyy = ty + sy * CAM.dist + 0.2;
  // do not push the camera through a wall
  if (world && world.colliders && !o.noClip) {
    const dir = V.set(cx - tx, cyy - ty, cz - tz);
    const len = dir.length();
    dir.normalize();
    let best = len;
    for (const b of world.colliders) {
      const t = rayBox(tx, ty, tz, dir.x, dir.y, dir.z, b);
      if (t !== null && t < best) best = Math.max(0.7, t - 0.35);
    }
    if (best < len) {
      cx = tx + dir.x * best; cyy = ty + dir.y * best; cz = tz + dir.z * best;
    }
  }
  R.camera.position.set(cx, Math.max(cyy, 0.4), cz);
  R.camera.lookAt(tx, ty + (o.lookUp || 0), tz);
}

function rayBox(ox, oy, oz, dx, dy, dz, b) {
  let tmin = 0, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  const mn = [b.min.x, b.min.y, b.min.z], mx = [b.max.x, b.max.y, b.max.z];
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-6) { if (o[i] < mn[i] || o[i] > mx[i]) return null; }
    else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

/* ---------------------------------------------------------- collision --- */
function resolve(p, world) {
  const r = p.radius, h = p.height;
  for (let pass = 0; pass < 2; pass++) {
    for (const b of world.colliders) {
      const py = p.pos.y;
      if (py + h < b.min.y || py > b.max.y) continue;
      const cx = clamp(p.pos.x, b.min.x, b.max.x);
      const cz = clamp(p.pos.z, b.min.z, b.max.z);
      const dx = p.pos.x - cx, dz = p.pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 > r * r) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), push = r - d;
        p.pos.x += (dx / d) * push;
        p.pos.z += (dz / d) * push;
      } else {
        // dead centre: shove out of the nearest face
        const ox = Math.min(p.pos.x - b.min.x, b.max.x - p.pos.x);
        const oz = Math.min(p.pos.z - b.min.z, b.max.z - p.pos.z);
        if (ox < oz) p.pos.x += (p.pos.x < (b.min.x + b.max.x) / 2 ? -1 : 1) * (ox + r);
        else p.pos.z += (p.pos.z < (b.min.z + b.max.z) / 2 ? -1 : 1) * (oz + r);
      }
    }
  }
}

function groundAt(p, world) {
  let best = world.groundY ? world.groundY(p.pos.x, p.pos.z) : 0;
  for (const b of world.colliders) {
    if (p.pos.x < b.min.x - p.radius || p.pos.x > b.max.x + p.radius) continue;
    if (p.pos.z < b.min.z - p.radius || p.pos.z > b.max.z + p.radius) continue;
    if (b.max.y <= p.pos.y + 0.55 && b.max.y > best) best = b.max.y;
  }
  return best;
}

/* ------------------------------------------------------------ on foot --- */
export function updateWalk(p, dt, world, o) {
  o = o || {};
  const t = R.elapsed;
  if (p.frozen) { poseIdle(p.av, t); p.root.position.copy(p.pos); p.root.rotation.y = p.yaw; return; }
  const mv = IN.move();
  const run = IN.running() ? 1.65 : 1;
  const sp = (o.speed || 4.4) * run;
  // movement is relative to where the camera is looking
  // the camera sits at +(sin yaw, cos yaw) behind you, so "away from the camera"
  // is -(sin yaw, cos yaw) and screen-right is (cos yaw, -sin yaw). mv.y is -1 for W.
  const fx = Math.sin(CAM.yaw), fz = Math.cos(CAM.yaw);
  let wx = mv.x * fz + mv.y * fx;
  let wz = mv.y * fz - mv.x * fx;
  const m = Math.hypot(wx, wz);
  const moving = m > 0.02;
  if (moving) { wx /= m; wz /= m; }
  const targetVX = moving ? wx * sp * m : 0;
  const targetVZ = moving ? wz * sp * m : 0;
  p.vel.x = damp(p.vel.x, targetVX, 12, dt);
  p.vel.z = damp(p.vel.z, targetVZ, 12, dt);

  // gravity and jumping
  const g = o.gravity === undefined ? 22 : o.gravity;
  p.vel.y -= g * dt;
  if (IN.takeJump() && p.grounded && o.canJump !== false) { p.vel.y = 7.4; p.grounded = false; }

  p.pos.x += p.vel.x * dt;
  p.pos.z += p.vel.z * dt;
  resolve(p, world);
  p.pos.y += p.vel.y * dt;
  const gy = groundAt(p, world);
  if (p.pos.y <= gy) { p.pos.y = gy; p.vel.y = 0; p.grounded = true; }
  else p.grounded = false;

  if (o.bounds) {
    p.pos.x = clamp(p.pos.x, -o.bounds, o.bounds);
    p.pos.z = clamp(p.pos.z, -o.bounds, o.bounds);
  }

  const horiz = Math.hypot(p.vel.x, p.vel.z);
  p.speed = horiz;
  if (moving) p.yaw = angTowardsSmooth(p.yaw, Math.atan2(p.vel.x, p.vel.z), 12 * dt);
  p.root.position.copy(p.pos);
  p.root.rotation.y = p.yaw;

  if (p.castT > 0) {
    p.castT -= dt;
    poseWalk(p.av, t, horiz / 5);
    poseCast(p.av, clamp(p.castT * 3, 0, 1));
  } else if (horiz > 0.3) {
    p.av.userData.parts.armR.rotation.z = lerp(p.av.userData.parts.armR.rotation.z, 0, 0.2);
    p.av.userData.parts.body.rotation.x = lerp(p.av.userData.parts.body.rotation.x, 0, 0.2);
    poseWalk(p.av, t, horiz / 5);
  } else {
    p.av.userData.parts.armR.rotation.z = lerp(p.av.userData.parts.armR.rotation.z, 0, 0.2);
    p.av.userData.parts.body.rotation.x = lerp(p.av.userData.parts.body.rotation.x, 0, 0.2);
    poseIdle(p.av, t);
  }
  if (p.invuln > 0) {
    p.invuln -= dt;
    p.av.visible = Math.floor(R.elapsed * 14) % 2 === 0;
    if (p.invuln <= 0) p.av.visible = true;
  }
}
function angTowardsSmooth(a, b, k) { return a + angWrap(b - a) * clamp(k, 0, 1); }

/* ---------------------------------------------------------- on a broom -- */
export function mountBroom(p) {
  p.mode = 'fly';
  p.broom.visible = true;
  p.broom.position.set(0, 0.66, 0);
  p.av.position.set(0, 0.24, 0.06);
  p.hasBroom = true;
  p.flySpeed = 8;
  CAM.targetDist = 7.2;
}
export function dismount(p) {
  p.mode = 'walk';
  p.broom.visible = false;
  p.av.position.set(0, 0, 0);
  p.av.rotation.set(0, 0, 0);
  p.av.userData.parts.body.rotation.set(0, 0, 0);
  CAM.targetDist = 5.2;
}

export function updateFly(p, dt, world, o) {
  o = o || {};
  if (p.frozen) return;
  const mv = IN.move();
  const maxS = o.maxSpeed || 26, minS = o.minSpeed || 4;
  // W/S (stick up/down) is throttle, A/D is a turn, look is where you point
  const throttle = -mv.y;
  p.flySpeed = clamp(p.flySpeed + throttle * dt * 22 - (throttle === 0 ? (p.flySpeed - (o.cruise || 13)) * dt * 0.8 : 0), minS, maxS);
  // yaw comes from the camera, pitch from the camera too: you fly where you look
  p.yaw = angWrap(CAM.yaw + Math.PI);
  const targetPitch = clamp(-CAM.pitch, -0.9, 0.9);
  p.pitch = damp(p.pitch, targetPitch, 5, dt);
  const bank = damp(p.bank || 0, -mv.x * 0.9, 5, dt);
  p.bank = bank;

  const dirX = Math.sin(p.yaw) * Math.cos(p.pitch);
  const dirZ = Math.cos(p.yaw) * Math.cos(p.pitch);
  const dirY = Math.sin(p.pitch);
  // a bit of strafe so you can sidestep a bludger
  const sx = -Math.cos(p.yaw), sz = Math.sin(p.yaw);
  p.vel.x = damp(p.vel.x, dirX * p.flySpeed + sx * mv.x * 8, 4, dt);
  p.vel.z = damp(p.vel.z, dirZ * p.flySpeed + sz * mv.x * 8, 4, dt);
  p.vel.y = damp(p.vel.y, dirY * p.flySpeed, 4, dt);

  p.pos.addScaledVector(p.vel, dt);
  const floor = o.floor === undefined ? 1.2 : o.floor;
  if (p.pos.y < floor) { p.pos.y = floor; if (p.vel.y < 0) p.vel.y = 0; }
  if (o.ceil && p.pos.y > o.ceil) { p.pos.y = o.ceil; if (p.vel.y > 0) p.vel.y = 0; }
  if (o.bounds) {
    p.pos.x = clamp(p.pos.x, -o.bounds, o.bounds);
    p.pos.z = clamp(p.pos.z, -o.bounds, o.bounds);
  }
  p.root.position.copy(p.pos);
  p.root.rotation.set(0, p.yaw, 0);
  p.broom.rotation.set(p.pitch, 0, -bank * 0.8);
  p.av.rotation.set(p.pitch, 0, -bank * 0.8);
  poseFly(p.av, p.pitch, bank);
  p.speed = p.flySpeed;
  if (p.invuln > 0) {
    p.invuln -= dt;
    p.av.visible = Math.floor(R.elapsed * 14) % 2 === 0;
    if (p.invuln <= 0) p.av.visible = true;
  }
}

/* --------------------------------------------------------------- hurt --- */
export function hurt(p, n) {
  if (p.invuln > 0) return false;
  p.hp -= (n || 1);
  p.invuln = 1.2;
  return true;
}

/* where the wand tip is in the world right now */
export function wandTip(p, out) {
  const tip = p.wand.userData.tip;
  return tip.getWorldPosition(out || new THREE.Vector3());
}
/* the direction the player is aiming: the camera's forward */
export function aimDir(out) {
  const d = out || new THREE.Vector3();
  R.camera.getWorldDirection(d);
  return d;
}
