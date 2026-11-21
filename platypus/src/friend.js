// friend.js - Pip, the player's friend (LEVELS.md B2).
// An autonomous platypus built on the shared platypus model. Three layers run every frame:
//   1. a BEHAVIOUR (idle, follow, lead, chase, hide, playBall ...) that only says where it would like to be,
//   2. an ALIVENESS layer that makes that wish less tidy - a meandering line, small hesitations with a glance
//      at the player, playful bursts, a head that looks about, little nods and tilts,
//   3. LOCOMOTION: smooth turning and acceleration over the world's ground and water, hops up ledges,
//      slides round walls, keeps off the player.
// One-shots (tricks, emotes, eating) play on top. Nothing allocates in update().
import { createPlatypus } from "./platypus.js";

const WALK = 1.6, RUN = 3.4, SWIM = 3.4, GRAV = 17, TURN = 7, RADIUS = 0.32;
const MAX_STEP = 0.45, MAX_HOP = 0.95;
const TAU = Math.PI * 2;
const TRICK_DUR = { spin: 0.9, backflip: 1.15, tailStand: 1.6, roll: 0.9, twirlLeap: 1.2, wave: 1.1, bow: 1.2, waterLeap: 1.4, diveFlip: 1.0, tailSplash: 0.8 };
const TRICK_APEX = { spin: 0.45, backflip: 0.5, tailStand: 0.7, roll: 0.45, twirlLeap: 0.55, wave: 0.5, bow: 0.6, waterLeap: 0.6, diveFlip: 0.5, tailSplash: 0.35 };
const BITES = [0.3, 0.65, 1.0];
const EMPTY = Object.freeze({});

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
function wrap(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function createFriend(ctx) {
  const THREE = ctx.THREE;
  const P = ctx.player;
  const body = createPlatypus(THREE, { variant: "friend" });
  // The friend owns an outer group (position, heading, lean); the model keeps its own group inside it.
  const group = new THREE.Group();
  group.name = "friend";
  group.add(body.group);
  if (!body.tricks) group.scale.setScalar(0.9); // model without the level 2-5 extensions: at least a size apart

  let world = null;
  let clock = 0;
  const seed = Math.random() * 100;

  // ------------------------------------------------------------------ the public object (state lives on it)
  const F = {
    group, body,
    x: 0, y: 0, z: 0, yaw: 0, speed: 0,
    name: "", behaviour: "idle", busy: false, radius: RADIUS, swimming: false, diving: false, inWater: false,
    grounded: true, vy: 0,
    onEvent: null,
    get visible() { return group.visible; },
    set visible(v) { group.visible = !!v; },
    setWorld, place, setName, reset, distTo, lookAt: setLook,
    do: doBehaviour, found, trick, emote, eat, glassLeap, attachTo, update,
  };

  // ------------------------------------------------------------------ small services
  function sfx(name, a, b, c) {
    const au = ctx.audio, f = au && au[name];
    if (typeof f === "function") f.call(au, a, b, c);
  }
  function vfx(name, a, b, c, d, e) {
    const o = ctx.fx, f = o && o[name];
    if (typeof f === "function") return f.call(o, a, b, c, d, e);
    return undefined;
  }
  const heightAt = (x, z) => (world ? world.heightAt(x, z) : 0);
  const waterAt = (x, z) => (world && world.waterAt ? world.waterAt(x, z) : -Infinity);
  function floorAt(x, z) {
    const h = heightAt(x, z), w = waterAt(x, z) - 0.1;
    return w > h ? w : h;
  }
  const probe = { x: 0, y: 0, z: 0 };
  function confined(x, z) {
    probe.x = x; probe.z = z; probe.y = F.y;
    if (world && world.confine) world.confine(probe, RADIUS);
    return probe;
  }

  // where the listener is: pan and distance fade for everything Pip says and does
  let earPan = 0, earVol = 1;
  function ears() {
    const cam = ctx.camera;
    if (!cam) return;
    const e = cam.matrixWorld.elements;
    const dx = F.x - e[12], dy = F.y - e[13], dz = F.z - e[14];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    earPan = clamp(((dx * e[0] + dz * e[2]) / (d + 0.6)) * 0.85, -1, 1);
    earVol = clamp(1.2 - d / 15, 0.15, 1);
  }
  function chirp(mood, vol = 1) {
    const au = ctx.audio;
    if (!au || !group.visible) return;
    if (typeof au.friendChirp === "function") au.friendChirp(mood, vol * earVol, earPan);
  }
  function surfaceHere() {
    if (world && world.surfaceAt) return world.surfaceAt(F.x, F.z);
    return world && world.name === "stage" ? "stage" : world && world.name === "lair" ? "rock" : "sand";
  }
  function stepSound(strength, wet) {
    const au = ctx.audio;
    if (!au || !group.visible) return;
    const v = clamp(strength, 0, 1.5) * 0.6 * earVol;
    if (typeof au.step === "function") au.step(wet ? "water" : surfaceHere(), v, earPan);
    else if (typeof au.cushionStep === "function") au.cushionStep(v * 0.6, earPan);
  }

  // events are queued and delivered at the end of update(), so a handler may call do() freely
  const evType = new Array(24).fill(null), evData = new Array(24).fill(null);
  let evN = 0;
  function emit(type, data) {
    if (evN < 24) { evType[evN] = type; evData[evN] = data; evN++; }
  }
  function flushEvents() {
    for (let i = 0; i < evN; i++) {
      const t = evType[i], d = evData[i];
      evType[i] = evData[i] = null;
      const cb = F.onEvent;
      if (cb) cb(t, d);
    }
    evN = 0;
  }

  // a few pooled one-shot timers on the scaled clock
  const tmT = new Float32Array(8), tmF = new Array(8).fill(null);
  function later(sec, fn) {
    for (let i = 0; i < 8; i++) if (!tmF[i]) { tmF[i] = fn; tmT[i] = sec; return; }
  }
  function runTimers(dt) {
    for (let i = 0; i < 8; i++) {
      const f = tmF[i];
      if (!f) continue;
      tmT[i] -= dt;
      if (tmT[i] <= 0) { tmF[i] = null; f(); }
    }
  }
  function clearTimers() { for (let i = 0; i < 8; i++) tmF[i] = null; }

  // ------------------------------------------------------------------ poses
  let basePose = null, overPose = null, poseNow = null, sleeping = false;
  function applyPose() {
    const want = shotName === "trick" || shotName === "eat" || shotName === "bow" || shotName === "nuzzle" ? null : overPose || basePose;
    if (want !== poseNow) {
      poseNow = want;
      if (typeof body.pose === "function") body.pose(want, want === "still" ? 0.6 : 0.4);
    }
  }
  function setSleep(on) {
    if (sleeping === on) return;
    sleeping = on;
    if (typeof body.sleep === "function") body.sleep(on);
    else basePose = on ? "curl" : null;
  }

  // ------------------------------------------------------------------ head / eyes
  const lookV = new THREE.Vector3(), forceV = new THREE.Vector3(), glanceV = new THREE.Vector3();
  let explicitLook = null, force = 0, noLook = false;
  let glanceKind = 0, glanceT = 1.5; // 0 nothing in particular, 1 the player, 2 a spot
  function setLook(target) { explicitLook = target || null; }
  function glanceAtPlayer(secs) { glanceKind = 1; glanceT = secs; }
  function resolve(target, out) {
    if (target.isObject3D) { target.getWorldPosition(out); out.y += 0.2; }
    else out.set(target.x || 0, typeof target.y === "number" ? target.y : floorAt(target.x || 0, target.z || 0) + 0.2, target.z || 0);
    return out;
  }
  function updateLook(dt) {
    if (typeof body.lookAt !== "function") return;
    let kind = 0;
    if (noLook) kind = 0;
    else if (explicitLook) { resolve(explicitLook, lookV); kind = 2; }
    else if (force === 1) kind = 1;
    else if (force === 2) { lookV.copy(forceV); kind = 2; }
    else {
      const pd = Math.hypot(P.x - F.x, P.z - F.z);
      glanceT -= dt;
      // something interesting: the player doing a trick or leaping nearby
      const showy = pd < 8 && (ctx.platypus.acting === true || P.grounded === false);
      if (showy && glanceKind !== 1) glanceAtPlayer(rnd(0.8, 1.6));
      if (glanceT <= 0) {
        const r = Math.random();
        const running = F.speed > 2.4;
        if (pd < 9 && r < (running ? 0.3 : 0.62)) glanceAtPlayer(running ? rnd(0.35, 0.7) : rnd(0.9, 2.6));
        else if (r < 0.84 && !running) {
          const a = F.yaw + rnd(-1.6, 1.6), d = rnd(1.5, 4);
          glanceV.set(F.x + Math.sin(a) * d, F.y + rnd(-0.05, 0.9), F.z + Math.cos(a) * d);
          glanceKind = 2; glanceT = rnd(0.7, 1.7);
        } else { glanceKind = 0; glanceT = running ? rnd(0.8, 2.2) : rnd(0.6, 1.8); }
      }
      kind = glanceKind;
      if (kind === 2) lookV.copy(glanceV);
    }
    if (kind === 1) lookV.set(P.x, P.y + 0.22, P.z);
    body.lookAt(kind ? lookV : null);
  }

  // ------------------------------------------------------------------ movement wish (written by behaviours)
  const mv = { on: false, x: 0, z: 0, speed: 0, diveY: NaN, face: NaN, keep: 0.6, casual: false, warp: false, slowIn: true };
  function go(x, z, speed, casual) {
    mv.on = true; mv.x = x; mv.z = z; mv.speed = speed; mv.casual = !!casual;
  }
  function halt(face) { mv.on = false; mv.face = face === undefined ? NaN : face; }
  const dist = (x, z) => Math.hypot(x - F.x, z - F.z);
  const distP = () => Math.hypot(P.x - F.x, P.z - F.z);
  const yawTo = (x, z) => Math.atan2(x - F.x, z - F.z);
  const yawToPlayer = () => Math.atan2(P.x - F.x, P.z - F.z);
  // walk/run there; true once within r
  function travel(x, z, speed, r, casual) {
    if (dist(x, z) <= r) { halt(); return true; }
    go(x, z, speed, casual);
    return false;
  }
  // turn on the spot; true once facing
  function faceTo(yaw, tol = 0.14) {
    halt(yaw);
    return Math.abs(wrap(yaw - F.yaw)) < tol;
  }

  // ------------------------------------------------------------------ aliveness
  let hesState = 0, hesT = rnd(2.5, 6), speedMul = 1;
  let bob = 0, bobX = 0, bobV = 0, lean = 0, leanWant = 0, tilt = 0, tiltWant = 0, wiggle = 0;
  function alive(dt) {
    speedMul = 1 + Math.sin(clock * 0.83 + seed) * 0.05;
    if (!mv.on) { hesState = 0; return; }
    const d = dist(mv.x, mv.z);
    if (mv.casual && d > 1.6) {
      hesT -= dt;
      if (hesT <= 0) {
        if (hesState === 0) { hesState = 1; hesT = rnd(0.25, 0.6); glanceAtPlayer(hesT + 0.5); } // hesitate, peek at the player
        else if (hesState === 1) { hesState = 2; hesT = rnd(0.45, 0.9); bobV += 1.6; } // ...and scamper on
        else { hesState = 0; hesT = rnd(3.2, 8); }
      }
      speedMul = hesState === 1 ? 0 : hesState === 2 ? 1.32 : 1 + Math.sin(clock * 0.83 + seed) * 0.12;
    } else if (hesState !== 0) { hesState = 0; hesT = rnd(3.2, 8); }
  }

  // ------------------------------------------------------------------ locomotion
  let mvDist = 0, airT = 0, hopCd = 0, wakeT = 0, stepN = 0;
  let detourT = 0, detourSide = 1, sampT = 0, sampX = 0, sampZ = 0;
  let dogX = 0, dogZ = 0, dogBest = Infinity, dogT = 0;
  let scripted = false;

  function avoidOne(cx, cz, cr, hx, hz) {
    const dx = cx - F.x, dz = cz - F.z;
    const ahead = dx * hx + dz * hz;
    if (ahead <= 0 || ahead > mvDist + 0.1) return 0;
    const R = cr + RADIUS + 0.14;
    if (ahead > R + 1.3) return 0;
    const lat = dx * hz - dz * hx;
    const al = lat < 0 ? -lat : lat;
    if (al >= R) return 0;
    const k = (1 - al / R) * (1 - Math.max(0, ahead - R) / 1.3);
    return (lat >= 0 ? -1 : 1) * k * 1.25;
  }
  function avoidance(yawWant) {
    const hx = Math.sin(yawWant), hz = Math.cos(yawWant);
    let s = 0;
    for (let pass = 0; pass < 2; pass++) {
      const list = pass === 0 ? (world && world.colliders) : ctx.colliders;
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (c.on) s += avoidOne(c.x, c.z, c.r, hx, hz);
      }
    }
    // walk round the player rather than into them (unless the player IS where we are going)
    if (mv.keep > 0.3 && Math.hypot(mv.x - P.x, mv.z - P.z) > mv.keep + 0.45) s += avoidOne(P.x, P.z, mv.keep - RADIUS, hx, hz);
    return clamp(s, -1.35, 1.35);
  }

  function hop(v) {
    if (!F.grounded || F.swimming) { bobV += 2.5; return; }
    F.grounded = false;
    F.vy = v;
    airT = 0;
    if (typeof body.jump === "function") body.jump();
  }

  function landFx(impact) {
    const bed = heightAt(F.x, F.z), surf = waterAt(F.x, F.z);
    if (surf > bed + 0.05) {
      vfx("splash", F.x, surf, F.z, 0.25 + impact * 0.45);
      sfx("splash", (0.2 + impact * 0.4) * earVol);
    } else {
      stepSound(0.5 + impact * 0.7, false);
      if (impact > 0.45) vfx("dust", F.x, F.y + 0.02, F.z, impact * 0.5);
    }
  }

  function warpTo(x, z) {
    F.x = x; F.z = z;
    F.y = floorAt(x, z);
    F.vy = 0; F.grounded = true; F.speed = 0;
    dogBest = Infinity; dogT = 0;
  }

  function locomote(dt, held) {
    const moving = mv.on && !held;
    let target = 0, turned = 0, wantYaw = NaN;
    mvDist = 0;
    if (moving) {
      const dx = mv.x - F.x, dz = mv.z - F.z;
      mvDist = Math.hypot(dx, dz);
      if (mvDist > 1e-3) {
        wantYaw = Math.atan2(dx, dz);
        // never a ruler-straight line: a lazy weave that fades out as it arrives
        const weave = mv.casual ? 0.3 : 0.1;
        if (mvDist > 1.1) wantYaw += Math.sin(clock * (mv.casual ? 1.5 : 2.3) + seed) * weave * Math.min(1, (mvDist - 1.1) / 2);
        if (detourT > 0) wantYaw += detourSide * 1.3;
        wantYaw += avoidance(wantYaw);
        target = mv.speed * speedMul;
        if (mv.slowIn) target = Math.min(target, 0.4 + mvDist * 2.6);
      }
    } else if (!isNaN(mv.face)) wantYaw = mv.face;

    if (!isNaN(wantYaw)) {
      const diff = wrap(wantYaw - F.yaw);
      const a = diff < 0 ? -diff : diff;
      const rate = (target > 0 ? TURN : 5.5) * (F.grounded ? 1 : 0.5);
      // ease into the turn so the head leads and the body follows
      turned = clamp(diff * Math.min(1, dt * 9), -rate * dt, rate * dt);
      if (target > 0) target *= a > 1.7 ? 0.25 : a > 0.9 ? 0.6 : 1;
    }
    F.yaw = wrap(F.yaw + turned);
    const turnRate = dt > 0 ? turned / dt : 0;
    if (F.swimming) target = Math.min(SWIM, target * 1.12);
    else if (F.inWater) target *= 0.8;
    if (!F.grounded) { if (moving && F.speed < 1.7) F.speed = 1.7; } // carry a hop over the lip
    else F.speed += clamp(target - F.speed, -14 * dt, 9 * dt);
    if (F.speed < 0.01 && target === 0) F.speed = 0;

    const ox = F.x, oz = F.z;
    F.x += Math.sin(F.yaw) * F.speed * dt;
    F.z += Math.cos(F.yaw) * F.speed * dt;

    for (let pass = 0; pass < 2; pass++) {
      const list = pass === 0 ? (world && world.colliders) : ctx.colliders;
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.on) continue;
        const dx = F.x - c.x, dz = F.z - c.z, r = c.r + RADIUS, d2 = dx * dx + dz * dz;
        if (d2 < r * r && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          F.x = c.x + (dx / d) * r; F.z = c.z + (dz / d) * r;
        }
      }
    }
    // give the player room: Pip steps aside, the player is never moved
    if (mv.keep > 0 && !P.hidden) {
      const dx = F.x - P.x, dz = F.z - P.z, d2 = dx * dx + dz * dz;
      const dy = F.y - P.y;
      if (d2 < mv.keep * mv.keep && dy < 0.8 && dy > -0.8) {
        const d = Math.sqrt(d2);
        const push = Math.min(mv.keep - d, 1.8 * dt);
        if (d > 1e-4) { F.x += (dx / d) * push; F.z += (dz / d) * push; }
        else { F.x += Math.sin(F.yaw + 1.6) * push; F.z += Math.cos(F.yaw + 1.6) * push; }
      }
    }
    if (world && world.confine) world.confine(F, RADIUS);

    // ledges: waddle up small ones, hop up to 0.9 m, slide along anything taller
    if (F.x !== ox || F.z !== oz) {
      if (F.grounded) {
        const rise = floorAt(F.x, F.z) - F.y;
        if (rise > MAX_STEP) {
          if (rise <= MAX_HOP && moving && hopCd <= 0) {
            F.x = ox; F.z = oz;
            F.grounded = false;
            F.swimming = F.diving = false;
            F.vy = Math.sqrt(2 * GRAV * (rise + 0.24));
            airT = 0;
            hopCd = 0.35;
            if (typeof body.jump === "function") body.jump();
          } else {
            const lim = F.y + MAX_STEP;
            if (floorAt(F.x, oz) <= lim) F.z = oz;
            else if (floorAt(ox, F.z) <= lim) F.x = ox;
            else { F.x = ox; F.z = oz; }
          }
        }
      } else {
        const lim = F.y + 0.03;
        if (floorAt(F.x, F.z) > lim) {
          if (floorAt(F.x, oz) <= lim) F.z = oz;
          else if (floorAt(ox, F.z) <= lim) F.x = ox;
          else { F.x = ox; F.z = oz; }
        }
      }
    }
    if (hopCd > 0) hopCd -= dt;

    // vertical: ground, water, air (the same rules as the player's)
    const s = Math.sin(F.yaw), c = Math.cos(F.yaw);
    const h = floorAt(F.x, F.z);
    const bed = heightAt(F.x, F.z), surf = waterAt(F.x, F.z);
    F.inWater = surf > bed + 0.02 && F.y < surf + 0.05;
    const canSwim = !!(world && world.swim) && surf - 0.1 > bed + 0.1;
    if (canSwim && F.grounded) {
      const top = surf - 0.1;
      if (!F.swimming) {
        F.swimming = true;
        if (F.speed > 1 && F.y > top - 0.3) { vfx("splash", F.x, surf, F.z, 0.3); sfx("splash", 0.25 * earVol); }
      }
      const want = isNaN(mv.diveY) ? top : clamp(mv.diveY, Math.max(bed + 0.07, surf - 2.4), top);
      F.y += clamp(want - F.y, -1.8 * dt, 2.3 * dt);
      if (F.y < bed + 0.05) F.y = bed + 0.05;
      if (F.y > top) F.y += (top - F.y) * Math.min(1, dt * 12);
      const under = F.y < top - 0.14;
      if (under !== F.diving) {
        F.diving = under;
        if (under) { vfx("bubbles", F.x, F.y, F.z, 5, surf); sfx("splash", 0.18 * earVol); }
        else { vfx("splash", F.x, surf, F.z, 0.22); sfx("splash", 0.16 * earVol); }
      }
      const k = Math.min(1, dt * 6);
      F.pitch += ((Math.abs(want - F.y) > 0.05 ? (want < F.y ? 0.5 : -0.4) : 0) - F.pitch) * k;
      F.roll += (clamp(-turnRate * 0.05, -0.25, 0.25) - F.roll) * k;
      F.vy = 0;
      if (F.speed > 0.5 && !under) {
        wakeT -= dt;
        if (wakeT <= 0) { wakeT = 0.2; vfx("wake", F.x, F.z, surf, clamp(F.speed / SWIM, 0.2, 1)); }
      }
    } else if (F.grounded) {
      if (F.swimming) F.swimming = F.diving = false;
      if (h < F.y - 0.55) {
        F.grounded = false; F.vy = 0; airT = 0; // ran off an edge: fall, do not snap
      } else {
        const hF = floorAt(F.x + s * 0.27, F.z + c * 0.27), hB = floorAt(F.x - s * 0.27, F.z - c * 0.27);
        const hL = floorAt(F.x + c * 0.15, F.z - s * 0.15), hR = floorAt(F.x - c * 0.15, F.z + s * 0.15);
        const bodyY = Math.max(h, (hF + hB) * 0.5);
        F.y += (bodyY - F.y) * Math.min(1, dt * 22);
        const k = Math.min(1, dt * 10);
        F.pitch += (clamp(Math.atan2(hB - hF, 0.54), -0.55, 0.55) * 0.85 - F.pitch) * k;
        // lean into fast turns like a running animal
        F.roll += (clamp(Math.atan2(hL - hR, 0.3), -0.45, 0.45) * 0.7 - clamp(turnRate * F.speed * 0.022, -0.2, 0.2) - F.roll) * k;
        F.vy = 0;
      }
    } else {
      airT += dt;
      F.vy -= GRAV * dt;
      F.y += F.vy * dt;
      const k = Math.min(1, dt * 6);
      F.pitch += (clamp(-F.vy * 0.035, -0.26, 0.16) - F.pitch) * k;
      F.roll += (0 - F.roll) * k;
      if (F.y <= h && F.vy <= 0) {
        const impact = clamp(-F.vy / 8, 0.15, 1);
        F.y = h; F.grounded = true; F.vy = 0;
        if (typeof body.land === "function") body.land(impact);
        landFx(impact);
      }
    }
    F.turn = turnRate;

    // stuck? try a way round; hopeless? (scripted trips only) just be there, so a level never waits for ever
    if (moving && mvDist > 0.3) {
      sampT += dt;
      if (sampT >= 0.5) {
        const moved = Math.hypot(F.x - sampX, F.z - sampZ);
        if (moved < 0.1 && mv.speed * speedMul > 0.4) { detourT = 0.75; detourSide = -detourSide; }
        sampT = 0; sampX = F.x; sampZ = F.z;
      }
      if (detourT > 0) detourT -= dt;
      if (mv.warp) {
        if (Math.hypot(mv.x - dogX, mv.z - dogZ) > 0.6) { dogX = mv.x; dogZ = mv.z; dogBest = Infinity; dogT = 0; }
        if (mvDist < dogBest - 0.2) { dogBest = mvDist; dogT = 0; }
        else {
          dogT += dt;
          if (dogT > 4.5) warpTo(mv.x, mv.z);
        }
      }
    } else { sampT = 0; sampX = F.x; sampZ = F.z; detourT = 0; dogT = 0; dogBest = Infinity; }
  }

  // ------------------------------------------------------------------ one-shots
  let shotName = null, shotArg = null, shotT = 0, shotDur = 0, shotHold = false, shotCue = 0;
  let pendTrick = null, pendT = 0;
  function startShot(name, dur, hold, arg) {
    shotName = name; shotArg = arg || null; shotT = 0; shotDur = dur; shotHold = hold; shotCue = 0;
    F.busy = true;
  }
  function endShot(silent) {
    if (!shotName) { if (!pendTrick) F.busy = false; return; }
    const n = shotName, a = shotArg;
    shotName = null; shotArg = null;
    if (n === "sad" || n === "scared") overPose = null;
    if (n === "yawn" && typeof body.setEyes === "function") body.setEyes(null);
    tiltWant = 0; wiggle = 0;
    if (!pendTrick) F.busy = false;
    if (n === "trick" && !silent) emit("trickDone", a);
    if (n === "eat" && !silent) emit("ate", null);
  }
  function heartsNow() {
    if (!group.visible) return;
    body.billTip.getWorldPosition(forceV);
    forceV.y += 0.12;
    vfx("hearts", forceV, 3);
  }
  function trickSplash() {
    const surf = waterAt(F.x, F.z);
    if (surf > heightAt(F.x, F.z) + 0.05) {
      vfx("splash", F.x - Math.sin(F.yaw) * 0.35, surf, F.z - Math.cos(F.yaw) * 0.35, 0.75);
      sfx("splash", 0.6 * earVol);
      if (bh.name === "splash") { bh.n++; emit("splash", bh.n); }
    } else {
      vfx("dust", F.x, F.y + 0.02, F.z, 0.6);
      if (bh.name === "splash") { bh.n++; emit("splash", bh.n); }
    }
  }
  function startTrick() {
    const n = pendTrick;
    pendTrick = null;
    endShot(true);
    let d;
    if (typeof body.trick === "function") d = body.trick(n);
    else { hop(3.4); if (typeof body.celebrate === "function") body.celebrate(); }
    if (!(d > 0)) d = (body.tricks && body.tricks[n] && body.tricks[n].dur) || TRICK_DUR[n] || 1;
    startShot("trick", d, true, n);
    if (n === "tailSplash" || n === "waterLeap") {
      const ap = (body.tricks && body.tricks[n] && body.tricks[n].apex) || TRICK_APEX[n];
      later(n === "waterLeap" ? d * 0.86 : ap, trickSplash);
    }
  }
  function trick(name, delay = 0) {
    if (attached || F.behaviour === "still") return 0;
    pendTrick = name;
    pendT = delay > 0 ? delay : 0;
    F.busy = true;
    const d = (body.tricks && body.tricks[name] && body.tricks[name].dur) || TRICK_DUR[name] || 1;
    if (pendT === 0) startTrick();
    return d;
  }
  function emote(name) {
    if (attached || F.behaviour === "still" || sleeping) return 0;
    endShot(true);
    switch (name) {
      case "happy":
        hop(3.1); chirp("happy"); later(0.14, heartsNow);
        startShot("happy", 0.75, true);
        break;
      case "chirp":
        chirp("happy", 0.7); bobV += 2.2;
        startShot("chirp", 0.35, false);
        break;
      case "call":
        hop(2.5); chirp("call");
        startShot("call", 0.85, true);
        break;
      case "laugh":
        chirp("giggle"); bobV += 2;
        startShot("laugh", 0.85, true);
        break;
      case "curious":
        chirp("curious", 0.6);
        tiltWant = Math.random() < 0.5 ? 0.17 : -0.17;
        startShot("curious", 1.3, true);
        break;
      case "sad":
        overPose = "sad"; chirp("sad");
        startShot("sad", 3.2, true);
        break;
      case "scared":
        overPose = "scared"; chirp("scared"); bobV -= 3;
        startShot("scared", 6, true);
        break;
      case "yawn":
        sfx("yawn");
        if (typeof body.setEyes === "function") body.setEyes(0.12);
        startShot("yawn", 1.5, true);
        break;
      case "bow": {
        let d = typeof body.playBow === "function" ? body.playBow() : 0;
        if (!(d > 0)) { d = 1.1; bobV += 4; }
        chirp("happy", 0.5);
        startShot("bow", d, true);
        break;
      }
      default:
        return 0;
    }
    return shotDur;
  }
  function eat() {
    if (attached || F.behaviour === "still") return 0;
    endShot(true);
    let d = typeof body.eat === "function" ? body.eat() : 0;
    if (!(d > 0)) d = 1.4;
    startShot("eat", d, true);
    return d;
  }
  function tickShot(dt) {
    if (pendTrick) {
      pendT -= dt;
      if (pendT <= 0) startTrick();
    }
    if (!shotName) return;
    shotT += dt;
    const k = shotDur > 0 ? shotT / shotDur : 1;
    switch (shotName) {
      case "call":
        force = 1; mv.face = yawToPlayer();
        break;
      case "curious":
        force = 2; forceV.set(P.x, P.y + 0.42, P.z);
        if (k > 0.8) tiltWant = 0;
        break;
      case "laugh":
        wiggle = Math.sin(shotT * 30) * 0.075 * (1 - k);
        if (shotCue === 0 && shotT > 0.3) { shotCue = 1; bobV += 2.4; }
        break;
      case "happy":
        force = 1;
        break;
      case "yawn":
        leanWant = -0.16 * Math.sin(Math.PI * clamp(k, 0, 1));
        break;
      case "eat": {
        const times = body.eatBiteTimes || BITES;
        if (shotCue < times.length && shotT >= times[shotCue]) { shotCue++; sfx("eat"); }
        break;
      }
      default:
        break;
    }
    if (shotT >= shotDur) endShot(false);
  }

  // ------------------------------------------------------------------ behaviours
  const bh = {
    name: "idle", phase: 0, t: 0, t2: 0, t3: 0, next: 0, i: 0, n: 0, a: 0, side: 1, x: 0, z: 0, yaw: NaN,
    done: false, waiting: false, o: EMPTY, ball: null, route: null,
    cx: 0, cz: 0, radius: 4, dist: 1.3, sideOff: 0.7, run: false, laps: 2, tagDist: 0.75, role: "it", pool: 0,
  };
  const glassPt = { x: 0, y: 0, z: 0 };
  const leap = { fx: 0, fz: 0, tx: 0, tz: 0, apex: 1.6, dur: 1.1, k: 0, y0: 0, y1: 0, crossed: false, v: 0, dx: 0, dz: 0, s: 0 };
  let attached = null, attaching = false, homeParent = null, twitchT = 3;

  function doBehaviour(name, opts) {
    const o = opts || EMPTY;
    if (attached && !attaching) attachTo(null);
    if (bh.name === "glassLeap" && !shotName && !pendTrick) F.busy = false;
    // leave the old one
    if (name !== "sleep") setSleep(false);
    basePose = null;
    if (shotName === "sad" || shotName === "scared") endShot(true);
    if (!BEHAVIOURS[name]) name = "idle";
    bh.name = name; bh.o = o;
    bh.phase = 0; bh.t = 0; bh.t2 = 0; bh.t3 = 0; bh.i = 0; bh.n = 0; bh.a = 0;
    bh.done = false; bh.waiting = false; bh.next = rnd(1.5, 3);
    bh.side = Math.random() < 0.5 ? 1 : -1;
    bh.ball = o.ball || null;
    bh.route = o.route || null;
    bh.yaw = NaN;
    dogBest = Infinity; dogT = 0; detourT = 0;
    switch (name) {
      case "idle": bh.t = rnd(1.2, 3); break;
      case "wander":
        bh.cx = o.center ? o.center.x : F.x; bh.cz = o.center ? o.center.z : F.z;
        bh.radius = o.radius > 0 ? o.radius : 4;
        break;
      case "follow":
        bh.dist = o.dist > 0 ? o.dist : 1.3; bh.sideOff = typeof o.side === "number" ? o.side : 0.7;
        bh.next = rnd(6, 11); bh.t = rnd(3, 6);
        break;
      case "goto":
        bh.x = o.x || 0; bh.z = o.z || 0; bh.yaw = typeof o.yaw === "number" ? o.yaw : NaN; bh.run = !!o.run;
        break;
      case "lead":
        bh.dist = o.waitDist > 0 ? o.waitDist : 4.5; bh.run = o.run !== false; bh.next = 0.5;
        if (!bh.route || !bh.route.length) bh.done = true;
        break;
      case "circle":
        bh.radius = o.radius > 0 ? o.radius : 1.1; bh.laps = o.laps > 0 ? o.laps : 2;
        break;
      case "chase":
        bh.role = o.role === "runner" ? "runner" : "it"; bh.tagDist = o.tagDist > 0 ? o.tagDist : 0.75;
        bh.pool = o.pool === true ? 1.6 : o.pool === false ? -3 : 0.15;
        bh.a = F.yaw; bh.t2 = 0; bh.i = rnd(2.6, 4.6);
        break;
      case "hide":
      case "sleep":
      case "sit": {
        const sp = name === "hide" ? o.spot : o.at;
        bh.waiting = !!sp; // has somewhere to go first
        bh.x = sp ? sp.x : F.x; bh.z = sp ? sp.z : F.z;
        bh.yaw = sp && typeof sp.yaw === "number" ? sp.yaw : NaN;
        bh.next = rnd(4, 6);
        break;
      }
      case "splash":
        bh.x = o.at ? o.at.x : F.x; bh.z = o.at ? o.at.z : F.z; bh.t = 0.4;
        break;
      case "still":
        basePose = "still"; F.speed = 0;
        endShot(true); pendTrick = null; F.busy = false;
        break;
      default: break;
    }
    F.behaviour = name;
  }

  const BEHAVIOURS = {
    // ---- stands, looks about, fidgets, glances at the player
    idle(dt) {
      mv.keep = 0.55;
      bh.t -= dt;
      if (bh.phase === 0) {
        halt(bh.yaw);
        if (bh.t <= 0 && !F.busy) {
          const r = Math.random(), pd = distP();
          bh.yaw = NaN;
          if (r < 0.28) {
            const a = rnd(0, TAU), d = rnd(0.5, 1.1);
            const c = confined(F.x + Math.sin(a) * d, F.z + Math.cos(a) * d);
            if (Math.abs(floorAt(c.x, c.z) - F.y) < 0.3 && Math.hypot(c.x - P.x, c.z - P.z) > 0.9) { bh.x = c.x; bh.z = c.z; bh.phase = 1; bh.t = 2.5; }
            else bh.t = 0.3;
          } else if (r < 0.46) { basePose = "sit"; bh.phase = 2; bh.t = rnd(3, 6); }
          else if (r < 0.64 && pd < 7) { emote("curious"); bh.t = rnd(2.2, 4); }
          else if (r < 0.8) { bh.phase = 3; bh.t = rnd(1, 1.6); bh.a = rnd(-0.5, 0.5); }
          else { bh.yaw = pd < 6 ? yawToPlayer() + rnd(-0.3, 0.3) : F.yaw + rnd(-1.4, 1.4); bh.t = rnd(1.5, 3.2); }
        }
      } else if (bh.phase === 1) {
        if (travel(bh.x, bh.z, 0.85, 0.14, false) || bh.t <= 0) { bh.phase = 0; bh.t = rnd(1.8, 4.5); }
      } else if (bh.phase === 2) {
        halt();
        mv.keep = 0;
        if (glanceKind !== 1 && distP() < 6) glanceAtPlayer(1.5); // sits and watches
        if (bh.t <= 0) { basePose = null; bh.phase = 0; bh.t = rnd(1.5, 3.5); }
      } else {
        // nose down: something smells interesting
        halt();
        force = 2;
        const a = F.yaw + bh.a + Math.sin(clock * 2.2) * 0.25;
        forceV.set(F.x + Math.sin(a) * 0.5, F.y - 0.05, F.z + Math.cos(a) * 0.5);
        if (bh.t <= 0) { bh.phase = 0; bh.t = rnd(1.2, 3); }
      }
    },

    wander(dt) {
      bh.t -= dt;
      if (bh.phase === 0) {
        halt();
        const a = rnd(0, TAU), d = Math.sqrt(Math.random()) * bh.radius;
        const c = confined(bh.cx + Math.sin(a) * d, bh.cz + Math.cos(a) * d);
        if (Math.abs(floorAt(c.x, c.z) - F.y) < 1.3 && dist(c.x, c.z) > 0.8) { bh.x = c.x; bh.z = c.z; bh.phase = 1; bh.t = 10; bh.a = rnd(0.75, 1.05); }
      } else if (bh.phase === 1) {
        if (travel(bh.x, bh.z, WALK * bh.a, 0.3, true) || bh.t <= 0) {
          bh.phase = 2; bh.t = rnd(0.9, 3.4);
          if (Math.random() < 0.2 && distP() < 7) emote("curious");
        }
      } else {
        halt();
        if (bh.t <= 0 && !F.busy) bh.phase = 0;
      }
    },

    // ---- trots beside / behind the player, waits when they stop, sometimes dashes ahead for fun
    follow(dt) {
      const ps = Math.sin(P.yaw), pc = Math.cos(P.yaw);
      const rx = pc, rz = -ps;
      const lat = (F.x - P.x) * rx + (F.z - P.z) * rz;
      if (lat > 0.5) bh.side = 1; else if (lat < -0.5) bh.side = -1;
      const pd = distP();
      const pSpeed = P.speed || 0;
      if (P.diving) mv.diveY = P.y;
      if (bh.phase === 1) {
        // playful burst: scamper past and look back
        bh.a -= dt;
        go(P.x + ps * 2.1 + rx * bh.side * 0.9, P.z + pc * 2.1 + rz * bh.side * 0.9, RUN, false);
        if (bh.a <= 0) { bh.phase = 0; glanceAtPlayer(1.4); if (Math.random() < 0.5) chirp("happy", 0.6); bh.next = rnd(6, 12); bh.t3 = 0; }
        return;
      }
      if (pSpeed < 0.25 && pd < bh.dist + 0.9) {
        // the player stopped: wait with them
        const fy = yawToPlayer();
        halt(Math.abs(wrap(fy - F.yaw)) > 0.7 ? fy : NaN);
        bh.t2 += dt;
        if (bh.t2 > bh.t && !F.busy) {
          bh.t2 = 0; bh.t = rnd(4, 8);
          const r = Math.random();
          if (r < 0.4) emote("curious");
          else if (r < 0.6) emote("bow");
          else if (r < 0.85) basePose = "sit";
          else glanceAtPlayer(2);
        }
        return;
      }
      if (basePose) basePose = null;
      bh.t2 = 0;
      const sx = P.x - ps * bh.dist * 0.85 + rx * bh.side * bh.sideOff;
      const sz = P.z - pc * bh.dist * 0.85 + rz * bh.side * bh.sideOff;
      const d = dist(sx, sz);
      if (d < 0.22 && pSpeed < 0.4) { halt(); return; }
      const sp = clamp(Math.max(WALK * 0.9, pSpeed * 1.03) + (d - 0.4) * 1.7, 0.6, RUN);
      go(sx, sz, sp, pSpeed < 1.2 && d > 2);
      if (pSpeed > 2.2 && !F.swimming) {
        bh.t3 += dt;
        if (bh.t3 > bh.next) { bh.phase = 1; bh.a = 1.25; bobV += 2; }
      }
    },

    goto() {
      if (typeof bh.o.y === "number") mv.diveY = bh.o.y;
      mv.warp = true;
      if (bh.phase === 0) {
        if (travel(bh.x, bh.z, bh.run ? RUN : WALK, 0.2, !bh.run)) bh.phase = 1;
      } else if (bh.phase === 1) {
        if (isNaN(bh.yaw) || faceTo(bh.yaw)) { bh.phase = 2; emit("arrived", null); }
      } else halt(bh.yaw);
    },

    // ---- runs ahead point by point, waits and calls when the player falls behind
    lead(dt) {
      if (bh.done) { halt(yawToPlayer()); return; }
      const pt = bh.route[bh.i];
      const pd = distP();
      const dpt = dist(pt.x, pt.z);
      const deep = typeof pt.y === "number" && waterAt(pt.x, pt.z) - 0.1 > pt.y + 0.1;
      if (deep) mv.diveY = pt.y;
      mv.keep = 0.35;
      const atPt = dpt < 0.6 && (!deep || Math.abs(F.y - Math.max(pt.y, heightAt(pt.x, pt.z) + 0.07)) < 0.45 || F.y <= heightAt(F.x, F.z) + 0.12);
      if (atPt) {
        const fy = yawToPlayer();
        halt(deep ? NaN : fy);
        force = 1;
        if (Math.hypot(P.x - pt.x, P.z - pt.z) < 1.6) {
          emit("checkpoint", bh.i);
          bh.i++;
          bh.t = 0; bh.next = rnd(1.6, 2.6); bh.waiting = false;
          bobV += 2;
          if (bh.i >= bh.route.length) { bh.done = true; emit("arrived", null); }
        } else {
          bh.t += dt;
          if (bh.t > bh.next && !F.busy) { bh.t = 0; bh.next = rnd(2.8, 4.4); emote(deep ? "chirp" : "call"); }
        }
        return;
      }
      if (pd > bh.dist) bh.waiting = true;
      else if (pd < bh.dist * 0.6) bh.waiting = false;
      if (bh.waiting) {
        halt(yawToPlayer());
        force = 1;
        bh.t += dt;
        if (bh.t > bh.next && !F.busy) { bh.t = 0; bh.next = rnd(2.8, 4.4); emote("call"); }
        return;
      }
      bh.t = 0; bh.next = 0.5;
      mv.warp = true;
      go(pt.x, pt.z, bh.run ? RUN : WALK * 1.25, false);
    },

    // ---- runs rings round the player
    circle() {
      if (bh.done) { halt(yawToPlayer()); return; }
      const pd = distP();
      mv.keep = bh.radius * 0.6;
      mv.slowIn = false;
      const ang = Math.atan2(F.x - P.x, F.z - P.z);
      if (bh.phase === 0) {
        go(P.x + Math.sin(ang) * bh.radius, P.z + Math.cos(ang) * bh.radius, RUN, false);
        if (pd < bh.radius + 0.5) { bh.phase = 1; bh.a = 0; bh.t = ang; }
        return;
      }
      bh.a += wrap(ang - bh.t);
      bh.t = ang;
      const lead = ang + bh.side * 1.0;
      // a slightly breathing ring, so it is never a perfect circle
      const rr = bh.radius * (1 + Math.sin(clock * 3.1 + seed) * 0.08);
      go(P.x + Math.sin(lead) * rr, P.z + Math.cos(lead) * rr, 3.0, false);
      if (Math.abs(bh.a) >= bh.laps * TAU) { bh.done = true; emit("done", null); F.speed *= 0.5; }
    },

    // ---- trots up and bumps the player's side
    nudge(dt) {
      const pd = distP();
      if (bh.phase === 0) {
        mv.keep = 0.5;
        mv.slowIn = false;
        const rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
        const lat = (F.x - P.x) * rx + (F.z - P.z) * rz;
        const sd = lat >= 0 ? 1 : -1;
        go(P.x + rx * sd * 0.3, P.z + rz * sd * 0.3, WALK * 1.35, false);
        if (pd < 0.74) {
          const nx = (P.x - F.x) / (pd || 1), nz = (P.z - F.z) / (pd || 1);
          P.kx += nx * 1.5; P.kz += nz * 1.5;
          F.speed = 0.3;
          bobV += 4.5;
          chirp("happy", 0.7);
          sfx("nuzzle");
          emit("nudged", null);
          bh.phase = 1; bh.t = 0;
        }
      } else {
        bh.t += dt;
        halt(yawToPlayer());
        force = 1;
        if (bh.phase === 1 && bh.t > 0.5) { bh.phase = 2; tiltWant = bh.side * 0.12; }
        if (bh.phase === 2 && bh.t > 1.3) { bh.phase = 3; tiltWant = 0; }
      }
    },

    // ---- comes nose to nose and nuzzles
    nuzzle() {
      if (bh.phase === 0) {
        mv.warp = true;
        mv.keep = 0.6;
        const tx = P.x + Math.sin(P.yaw) * 0.75, tz = P.z + Math.cos(P.yaw) * 0.75;
        if (travel(tx, tz, WALK * 1.25, 0.1, false)) bh.phase = 1;
      } else if (bh.phase === 1) {
        mv.keep = 0;
        if (faceTo(yawToPlayer(), 0.12)) {
          let d = typeof body.nuzzle === "function" ? body.nuzzle() : 0;
          if (!(d > 0)) { d = 1.4; bobV += 3; }
          sfx("nuzzle");
          endShot(true);
          startShot("nuzzle", d, true);
          emit("nuzzled", null);
          bh.phase = 2;
        }
      } else {
        mv.keep = 0;
        halt(F.busy ? NaN : yawToPlayer());
        force = 1;
      }
    },

    // ---- tag
    chase(dt) {
      const pd = distP();
      const dy = Math.abs(F.y - P.y);
      if (bh.done) { halt(yawToPlayer()); force = 1; return; }
      bh.t += dt;
      mv.keep = 0;
      mv.slowIn = false;
      const pMax = P.maxSpeed > 0 ? P.maxSpeed : 3;
      if (bh.role === "it") {
        if (bh.t < 0.9) { halt(yawToPlayer()); force = 1; return; } // a sporting head start
        if (pd < bh.tagDist && dy < 0.9) {
          bh.done = true; F.speed *= 0.3;
          emit("tag", "friend");
          emote("laugh");
          return;
        }
        const pv = P.speed || 0;
        const lead = Math.min(0.35, pd / 6);
        if (P.diving) mv.diveY = P.y;
        go(P.x + Math.sin(P.yaw) * pv * lead, P.z + Math.cos(P.yaw) * pv * lead, pMax * 0.92, false);
        return;
      }
      // runner
      if (pd < bh.tagDist && dy < 0.9 && bh.t > 0.6) {
        bh.done = true; F.speed *= 0.3;
        emit("tag", "player");
        emote("laugh");
        return;
      }
      if (pd > 7.5) {
        // far enough: stop, look back, tease
        halt(yawToPlayer());
        force = 1;
        bh.t3 += dt;
        if (bh.t3 > bh.next && !F.busy) { bh.t3 = 0; bh.next = rnd(2.5, 4); emote(Math.random() < 0.5 ? "call" : "laugh"); }
        return;
      }
      bh.t3 = 0;
      // jukes: flip the favoured side now and then, sooner when the player is close
      bh.t2 -= dt;
      let rethink = false;
      if (bh.t2 <= 0) { bh.t2 = pd < 2.2 ? rnd(0.5, 1.1) : rnd(1.1, 2.4); if (Math.random() < 0.65) bh.side = -bh.side; rethink = true; }
      bh.n -= dt;
      if (bh.n <= 0 || rethink) {
        bh.n = 0.22;
        const awayA = Math.atan2(F.x - P.x, F.z - P.z);
        let best = -1e9, bestA = awayA;
        for (let k = 0; k < 12; k++) {
          const a = awayA + (k / 12) * TAU;
          const sx = Math.sin(a), cz = Math.cos(a);
          let wx = F.x + sx * 2.6, wz = F.z + cz * 2.6;
          let c = confined(wx, wz);
          let score = -Math.hypot(c.x - wx, c.z - wz) * 2.4; // walls
          const ex = c.x, ez = c.z;
          score += Math.hypot(ex - P.x, ez - P.z); // get away
          const fl = floorAt(ex, ez);
          if (fl > F.y + MAX_HOP) score -= 6;
          if (waterAt(ex, ez) > heightAt(ex, ez) + 0.3) score += bh.pool;
          wx = F.x + sx * 5.4; wz = F.z + cz * 5.4;
          c = confined(wx, wz);
          score -= Math.hypot(c.x - wx, c.z - wz) * 0.9; // do not run into a corner
          score += Math.cos(a - F.yaw) * 0.55; // keep the line unless there is a reason
          score += Math.sin(a - awayA) * bh.side * 0.95; // the juke
          const toward = -(sx * (F.x - P.x) + cz * (F.z - P.z)) / (pd || 1);
          if (toward > 0.45 && pd < 3.2) score -= 5;
          if (score > best) { best = score; bestA = a; }
        }
        bh.a = bestA;
      }
      // quick, but it tires, and it cannot resist looking back - so a child always catches it in the end
      const tired = clamp((bh.t - 5) / 8, 0, 1);
      bh.i -= dt;
      if (bh.i <= -0.5) bh.i = rnd(2.6, 4.6);
      const peek = bh.i <= 0;
      if (peek) force = 1;
      const sp = pd < 4.8 ? Math.min(RUN, pMax * (0.9 - 0.16 * tired)) * (peek ? 0.5 : 1) : WALK * 1.35;
      if (F.swimming && pd < 3.6) mv.diveY = waterAt(F.x, F.z) - 1.15;
      go(F.x + Math.sin(bh.a) * 2.5, F.z + Math.cos(bh.a) * 2.5, sp, false);
    },

    // ---- hide and seek
    hide(dt) {
      if (bh.phase === 0) {
        mv.warp = true;
        mv.keep = 0.3;
        if (travel(bh.x, bh.z, RUN, 0.25, false)) { bh.phase = 1; bh.t = 0; }
      } else if (bh.phase === 1) {
        bh.t += dt;
        mv.keep = 0;
        if (isNaN(bh.yaw) || faceTo(bh.yaw, 0.2) || bh.t > 0.8) {
          bh.phase = 2; bh.t = 0; bh.next = rnd(2.5, 4);
          basePose = "scared"; // flat to the ground, holding its breath
          emit("hidden", null);
        }
      } else if (bh.phase === 2) {
        mv.keep = 0; noLook = true;
        halt();
        bh.t += dt;
        if (bh.t > bh.next) {
          bh.t = 0; bh.next = rnd(4, 6);
          // cannot help giggling - louder the nearer the seeker
          const pd = distP();
          const au = ctx.audio;
          if (au && typeof au.friendChirp === "function") au.friendChirp("giggle", clamp(1.12 - pd / 12, 0.12, 1), earPan);
          bh.t2 = 0.5;
        }
        if (bh.t2 > 0) { bh.t2 -= dt; wiggle = Math.sin(clock * 34) * 0.03 * clamp(bh.t2 / 0.5, 0, 1); }
      } else if (bh.phase === 3) {
        mv.keep = 0;
        halt(yawToPlayer());
        force = 1;
        bh.t += dt;
        if (bh.t > 0.9) { bh.phase = 4; emit("found", null); }
      } else { halt(yawToPlayer()); force = 1; }
    },

    // ---- ball games
    playBall(dt) {
      const B = bh.ball;
      const pd = distP();
      if (!B || !B.active) { halt(yawToPlayer()); return; }
      const bd = dist(B.x, B.z);
      const bp = Math.hypot(B.x - P.x, B.z - P.z);
      const bs = Math.hypot(B.vx, B.vz);
      if (bh.t > 0) bh.t -= dt;
      force = 2; forceV.set(B.x, B.y, B.z);
      // the player knocked it (walked into it): Pip may play it again, and that return is a real pass
      if (bp < 0.85 && (P.speed || 0) > 0.4) { bh.waiting = false; bh.i = 1; }
      if (!bh.waiting && bd < 0.9 && B.y < F.y + 1.0 && bh.t <= 0 && bp > 1.3) {
        // headbutt it back, leading the player a little
        const pv = P.speed || 0;
        const tx = P.x + Math.sin(P.yaw) * pv * 0.35, tz = P.z + Math.cos(P.yaw) * pv * 0.35;
        const dx = tx - B.x, dz = tz - B.z, dd = Math.hypot(dx, dz);
        B.kick(dx, dz, clamp(0.7 + dd * 0.78, 2.4, 7), 2 + dd * 0.15); // lands short and rolls up to the player
        sfx("ballBounce", 0.6 * earVol);
        if (bh.i === 1) { bh.n++; emit("pass", bh.n); } // Pip's opening serve does not count
        bh.i = 0;
        bh.t = 0.9;
        bh.waiting = true; // sent: now it is the player's turn
        hop(2.2); bobV += 3;
        if (Math.random() < 0.5) chirp("happy", 0.7);
        return;
      }
      const coming = bs > 0.6 && (B.vx * (F.x - B.x) + B.vz * (F.z - B.z)) > 0;
      const mine = !bh.waiting && bp > 1.3 && (coming || (bd < bp && bs < 1.2));
      if (mine) {
        const lt = Math.min(0.45, bd / RUN);
        const c = confined(B.x + B.vx * lt, B.z + B.vz * lt);
        mv.slowIn = false;
        go(c.x, c.z, RUN, false);
        return;
      }
      // take up a stance 4-6 m from the player and bounce about, ready
      if (pd > 4 && pd < 6) {
        halt(yawTo(B.x, B.z));
        bh.t3 += dt;
        if (bh.t3 > bh.next && !F.busy) {
          bh.t3 = 0; bh.next = rnd(2.4, 4.2);
          if (Math.random() < 0.35) emote("bow"); else { hop(2); bobV += 2; }
        }
      } else {
        let ux = F.x - P.x, uz = F.z - P.z;
        const ul = Math.hypot(ux, uz);
        if (ul < 0.2) { ux = Math.sin(P.yaw); uz = Math.cos(P.yaw); } else { ux /= ul; uz /= ul; }
        const c = confined(P.x + ux * 5, P.z + uz * 5);
        if (dist(c.x, c.z) < 0.35) halt(yawTo(B.x, B.z));
        else go(c.x, c.z, pd < 3 ? WALK * 1.5 : RUN, false);
      }
    },

    fetch(dt) {
      const B = bh.ball;
      if (bh.done || !B || !B.active) { halt(yawToPlayer()); force = 1; return; }
      const bd = dist(B.x, B.z);
      const bp = Math.hypot(B.x - P.x, B.z - P.z);
      force = 2; forceV.set(B.x, B.y, B.z);
      if (bp < 1.5) {
        bh.done = true;
        emit("returned", null);
        chirp("happy", 0.8); bobV += 3;
        return;
      }
      const ux = (B.x - P.x) / bp, uz = (B.z - P.z) / bp;
      const bx = B.x + ux * 0.45, bz = B.z + uz * 0.45;
      const behind = (F.x - B.x) * ux + (F.z - B.z) * uz;
      if (bh.t > 0) bh.t -= dt;
      mv.slowIn = false;
      if (bd < 0.75 && behind > 0.1) {
        // dribble: little taps toward the player
        go(P.x, P.z, WALK * 1.5, false);
        if (bh.t <= 0) { bh.t = 0.42; B.kick(-ux, -uz, clamp(1.7 + bp * 0.35, 2, 3.4), 0.5); bobV += 1.5; }
      } else if (behind < 0 && bd < 1.2) {
        // on the wrong side: swing round the ball
        const sd = ((F.x - B.x) * uz - (F.z - B.z) * ux) >= 0 ? 1 : -1;
        go(B.x + uz * sd * 0.8 + ux * 0.3, B.z - ux * sd * 0.8 + uz * 0.3, RUN, false);
      } else go(bx, bz, RUN, false);
    },

    // ---- swims out, circles, slaps the water with its tail
    splash(dt) {
      mv.keep = 0.6;
      if (bh.phase === 0) {
        mv.warp = true;
        if (travel(bh.x, bh.z, SWIM, 0.9, false)) { bh.phase = 1; bh.a = Math.atan2(F.x - bh.x, F.z - bh.z); bh.t = 0.5; }
        return;
      }
      bh.a += dt * 1.5 * bh.side;
      mv.slowIn = false;
      go(bh.x + Math.sin(bh.a + bh.side * 0.7) * 0.9, bh.z + Math.cos(bh.a + bh.side * 0.7) * 0.9, WALK * 1.2, false);
      bh.t -= dt;
      if (bh.t <= 0 && !F.busy) {
        bh.t = rnd(1.5, 2.3);
        trick("tailSplash");
        if (Math.random() < 0.3) bh.side = -bh.side;
      }
    },

    sit() {
      const o = bh.o;
      if (bh.phase === 0) {
        mv.warp = true;
        if (!bh.waiting || travel(bh.x, bh.z, WALK * 1.25, 0.2, false)) bh.phase = 1;
        return;
      }
      let ty;
      if (o.lookAt) { resolve(o.lookAt, forceV); force = 2; ty = yawTo(forceV.x, forceV.z); }
      else { force = 1; ty = yawToPlayer(); }
      mv.keep = 0;
      if (bh.phase === 1) {
        if (faceTo(ty, 0.2)) { bh.phase = 2; basePose = "sit"; emit("arrived", null); }
      } else {
        // sitting: the head follows; the body only shuffles round when it has to
        halt(Math.abs(wrap(ty - F.yaw)) > 1.1 ? ty : NaN);
      }
    },

    sleep(dt) {
      mv.keep = 0;
      if (bh.phase === 0) {
        mv.warp = true;
        if (!bh.waiting || travel(bh.x, bh.z, WALK, 0.2, true)) bh.phase = 1;
      } else if (bh.phase === 1) {
        if (isNaN(bh.yaw) || faceTo(bh.yaw)) { bh.phase = 2; bh.t = 0; emote("yawn"); }
      } else if (bh.phase === 2) {
        halt(bh.yaw);
        if (!F.busy) { bh.phase = 3; bh.t = 0; setSleep(true); }
      } else if (bh.phase === 3) {
        halt(); noLook = true;
        bh.t += dt;
        if (bh.t > 1.3) { bh.phase = 4; emit("asleep", null); }
      } else { halt(); noLook = true; }
    },

    still() {
      mv.keep = 0; noLook = true;
      halt();
    },

    // ---- level 5: the leap through the glass
    glassLeap(dt) {
      mv.keep = 0;
      if (bh.phase === 0) {
        mv.warp = true;
        if (dogT > 2) warpTo(leap.fx, leap.fz); // this run must not dither
        if (travel(leap.fx, leap.fz, RUN, 0.25, false)) { bh.phase = 1; bh.t = 0; }
        return;
      }
      const ddx = leap.tx - leap.fx, ddz = leap.tz - leap.fz;
      const len = Math.hypot(ddx, ddz) || 1;
      if (bh.phase === 1) {
        bh.t += dt;
        const ty = Math.atan2(ddx, ddz);
        if (faceTo(ty, 0.1) || bh.t > 0.3) {
          bh.phase = 2;
          F.yaw = ty;
          leap.k = 0; leap.crossed = false;
          leap.fx = F.x; leap.fz = F.z;
          leap.y0 = F.y; leap.y1 = floorAt(leap.tx, leap.tz);
          F.grounded = false; F.swimming = F.diving = false;
          if (typeof body.jump === "function") body.jump();
          emit("leap", null);
        }
        return;
      }
      scripted = true;
      noLook = true;
      if (bh.phase === 2) {
        const pz = F.z, px = F.x, py = F.y;
        leap.k = Math.min(1, leap.k + dt / leap.dur);
        const k = leap.k;
        F.x = leap.fx + (leap.tx - leap.fx) * k;
        F.z = leap.fz + (leap.tz - leap.fz) * k;
        F.y = leap.y0 + (leap.y1 - leap.y0) * k + leap.apex * 4 * k * (1 - k);
        F.vy = ((leap.y1 - leap.y0) + leap.apex * 4 * (1 - 2 * k)) / leap.dur;
        F.speed = len / leap.dur;
        F.pitch = clamp(-Math.atan2(F.vy, F.speed) * 0.75, -0.9, 0.9);
        F.roll = 0;
        if (!leap.crossed) {
          const g = world && world.glass;
          const gz = g && typeof g.z === "number" ? g.z : NaN;
          let t = -1;
          if (!isNaN(gz) && (pz - gz) * (F.z - gz) <= 0 && pz !== F.z) t = (gz - pz) / (F.z - pz);
          else if ((isNaN(gz) || (leap.fz - gz) * (leap.tz - gz) > 0) && k >= 0.5) t = 1;
          if (t >= 0) {
            leap.crossed = true;
            glassPt.x = px + (F.x - px) * t; glassPt.y = py + (F.y - py) * t + 0.15; glassPt.z = pz + (F.z - pz) * t;
            emit("glass", glassPt);
          }
        }
        if (k >= 1) {
          bh.phase = 3;
          F.grounded = true; F.vy = 0;
          F.y = leap.y1;
          leap.s = 0; leap.v = (0.8 * 2) / 0.7; leap.dx = ddx / len; leap.dz = ddz / len;
          if (typeof body.land === "function") body.land(1);
          basePose = "still";
          vfx("dust", F.x, F.y + 0.02, F.z, 0.8);
          emit("landed", null);
        }
        return;
      }
      // slides 0.8 m and comes to rest
      leap.s = Math.min(1, leap.s + dt / 0.7);
      const v = leap.v * (1 - leap.s);
      F.x += leap.dx * v * dt; F.z += leap.dz * v * dt;
      F.speed = 0;
      F.y += (floorAt(F.x, F.z) - F.y) * Math.min(1, dt * 14);
      F.pitch += (0 - F.pitch) * Math.min(1, dt * 7);
      if (leap.s >= 1) { bh.name = "still"; F.behaviour = "still"; F.busy = false; }
    },
  };

  function found() {
    if (bh.name !== "hide" || bh.phase >= 3) return false;
    basePose = null;
    bh.phase = 3; bh.t = 0;
    wiggle = 0;
    emote("happy");
    return true;
  }

  function glassLeap(o) {
    o = o || EMPTY;
    doBehaviour("idle");
    endShot(true); pendTrick = null; F.busy = true;
    const fr = o.from || F, to = o.to || F;
    leap.fx = fr.x; leap.fz = fr.z; leap.tx = to.x; leap.tz = to.z;
    leap.apex = o.apex > 0 ? o.apex : 1.6;
    leap.dur = o.duration > 0 ? o.duration : 1.1;
    leap.k = 0; leap.crossed = false; leap.s = 0;
    bh.name = "glassLeap"; bh.phase = 0; bh.t = 0;
    F.behaviour = "glassLeap";
  }

  function attachTo(obj) {
    if (obj) {
      if (!attached) homeParent = group.parent;
      attached = obj;
      attaching = true;
      doBehaviour("idle");
      attaching = false;
      endShot(true); pendTrick = null; F.busy = false;
      clearTimers();
      obj.add(group);
      group.position.set(0, 0, 0);
      group.rotation.set(0, 0.6, 0);
      F.speed = 0; F.vy = 0; F.grounded = true; F.swimming = F.diving = false;
      F.pitch = F.roll = 0;
      basePose = "curl";
      F.behaviour = "attached";
      twitchT = rnd(2, 4);
      return;
    }
    if (!attached) return;
    attached = null;
    if (homeParent) homeParent.add(group);
    else if (group.parent) group.parent.remove(group);
    homeParent = null;
    basePose = null;
    doBehaviour("idle");
    writeTransform();
  }

  // ------------------------------------------------------------------ plumbing
  function setWorld(w) { world = w || null; }
  function setName(n) { F.name = n || ""; group.name = F.name || "friend"; }
  function distTo(x, z) { return Math.hypot(x - F.x, z - F.z); }
  function place(x, z, yaw) {
    F.x = x; F.z = z;
    if (typeof yaw === "number") F.yaw = yaw;
    F.y = floorAt(x, z);
    F.vy = 0; F.grounded = true; F.speed = 0;
    F.pitch = 0; F.roll = 0;
    const surf = waterAt(x, z);
    F.swimming = !!(world && world.swim) && surf - 0.1 > heightAt(x, z) + 0.1;
    F.diving = false;
    dogBest = Infinity; dogT = 0; detourT = 0; sampX = x; sampZ = z; sampT = 0;
    bob = bobX = bobV = 0;
    if (!attached) writeTransform();
  }
  F.pitch = 0; F.roll = 0; F.turn = 0;

  function writeTransform() {
    group.position.set(F.x, F.y, F.z);
    group.rotation.set(F.pitch + bob + lean, F.yaw, F.roll + tilt + wiggle);
  }

  function reset() {
    if (attached) attachTo(null);
    clearTimers();
    evN = 0;
    pendTrick = null;
    endShot(true);
    shotName = null; F.busy = false;
    overPose = null;
    setSleep(false);
    doBehaviour("idle");
    explicitLook = null; force = 0; noLook = false; glanceKind = 0; glanceT = 1;
    if (typeof body.setEyes === "function") body.setEyes(null);
    if (typeof body.lookAt === "function") body.lookAt(null);
    if (typeof body.setCarry === "function") body.setCarry(false);
    applyPose();
    F.speed = 0; F.vy = 0; F.grounded = true; F.pitch = 0; F.roll = 0; F.turn = 0;
    F.swimming = F.diving = F.inWater = false;
    bob = bobX = bobV = lean = leanWant = tilt = tiltWant = wiggle = 0;
    hesState = 0; hesT = rnd(2.5, 6);
    group.visible = true;
    writeTransform();
  }

  // footsteps: 60 % of the player's loudness, placed where Pip is
  body.onFootstep = (footIndex, lx, lz, strength) => {
    if (attached || F.swimming || !F.grounded || !group.visible) return;
    const st = typeof strength === "number" ? strength : 0.6;
    stepSound(st, F.inWater);
    stepN++;
    if ((stepN & 1) === 0 && F.speed > 1) {
      const s = Math.sin(F.yaw), c = Math.cos(F.yaw);
      const wx = F.x + (lx || 0) * c + (lz || 0) * s, wz = F.z - (lx || 0) * s + (lz || 0) * c;
      if (F.inWater) vfx("splash", wx, waterAt(wx, wz), wz, 0.1);
      else if (surfaceHere() === "sand") vfx("sandPuff", wx, F.y + 0.02, wz, 0.22 * st);
    }
  };

  const anim = { speed: 0, maxSpeed: RUN, grounded: true, vy: 0, turn: 0, moving: false, time: 0, swimming: false, diving: false, carrying: false, inWater: false };

  function update(dt, time) {
    if (!(dt > 0)) dt = 0;
    clock = typeof time === "number" ? time : clock + dt;
    ears();
    runTimers(dt);

    // frame defaults, then the behaviour states its wish
    mv.on = false; mv.face = NaN; mv.diveY = NaN; mv.keep = 0.6; mv.casual = false; mv.warp = false; mv.slowIn = true;
    force = 0; noLook = false; scripted = false; leanWant = 0;

    if (attached) {
      noLook = true;
      F.speed = 0;
      // asleep in the cell: only the breathing, and now and then a twitch
      twitchT -= dt;
      if (twitchT <= 0) { twitchT = rnd(3.5, 7); bobV += 0.5; if (typeof body.blink === "function") body.blink(); }
    } else {
      BEHAVIOURS[bh.name](dt);
      tickShot(dt);
      if (!scripted) {
        alive(dt);
        if (bh.name === "still") { F.speed = 0; F.y += (floorAt(F.x, F.z) - F.y) * Math.min(1, dt * 10); }
        else locomote(dt, (F.busy && shotHold && shotName !== null) || sleeping);
      }
    }

    // nods and tilts ride on small springs
    bobV += (-bobX * 140 - bobV * 13) * dt;
    bobX += bobV * dt;
    bob = clamp(bobX * 0.3, -0.3, 0.3);
    lean += (leanWant - lean) * Math.min(1, dt * 8);
    tilt += (tiltWant - tilt) * Math.min(1, dt * 9);

    if (attached) group.rotation.set(bob * 0.3, 0.6, 0);
    else writeTransform();

    anim.speed = F.speed; anim.grounded = F.grounded; anim.vy = F.vy; anim.turn = F.turn;
    anim.moving = F.speed > 0.05; anim.time = clock + seed;
    anim.swimming = F.swimming; anim.diving = F.diving; anim.inWater = F.inWater;
    applyPose();
    body.update(dt, anim);
    updateLook(dt);
    flushEvents();
  }

  reset();
  return F;
}
