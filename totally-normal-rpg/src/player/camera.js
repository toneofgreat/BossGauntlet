// camera.js - third-person orbit camera (CONTRACT 5.8): follows the player, collides with physics (raycast),
// distance 2.5-7 (wheel / pinch-free), pitch -60..+70 deg, shake, fov/distance tweens, scripted control via take().
//   camera3p.yaw / pitch (radians; pitch > 0 = camera above the player looking down)
//   camera3p.isFirstPerson, camera3p.resetBehind(yaw), camera3p.focusPoint (Vector3, where shadows should centre)

const D2R = Math.PI / 180;
const PITCH_MIN = -60 * D2R, PITCH_MAX = 70 * D2R;
const DIST_MIN = 2.5, DIST_MAX = 7;

export function createCamera3p(ctx, engine) {
  const THREE = ctx.THREE, state = ctx.state, bus = ctx.bus;
  const cam = engine.camera;
  let yaw = 0, pitch = 0.32;
  let dist = 4.6, distTarget = 4.6, distFrom = 4.6, distT = 1, distDur = 0;
  let colDist = 4.6;
  let baseFov = 70, fovFrom = 70, fovTo = 70, fovT = 1, fovDur = 0;
  let shakeAmp = 0, shakeDur = 0, shakeT = 0;
  let rollCur = 0, rollFrom = 0, rollTo = 0, rollT = 1, rollDur = 0;
  let owner = null, ctlId = 0;
  let lockObj = null;
  let lookIdle = 0;
  let fp = false, fpPose = false;
  const pivot = new THREE.Vector3(0, 1.6, 0);
  let pivotInit = false;
  const focusPoint = new THREE.Vector3();
  // scripted state
  const S = {
    mode: "none",        // none | static | move | track
    pos: new THREE.Vector3(), look: new THREE.Vector3(),
    fromPos: new THREE.Vector3(), fromLook: new THREE.Vector3(),
    toPos: new THREE.Vector3(), toLook: new THREE.Vector3(),
    t: 0, dur: 0, ease: "inOut", resolve: null,
    target: null, off: new THREE.Vector3(0, 3, -6), lookOff: new THREE.Vector3(0, 1.5, 0)
  };
  // release blend
  const R = { t: 1, dur: 0, pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const curLook = new THREE.Vector3();

  const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _upDir = new THREE.Vector3(0, 1, 0);
  let closeHid = false;
  const _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0), _fwd = new THREE.Vector3();
  const _rollAxis = new THREE.Vector3(0, 0, 1);

  function ease(kind, x) {
    x = Math.min(1, Math.max(0, x));
    if (kind === "linear") return x;
    if (kind === "in") return x * x * x;
    if (kind === "out") return 1 - Math.pow(1 - x, 3);
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
  function settleMove() { if (S.resolve) { const r = S.resolve; S.resolve = null; r(); } }
  function avatarVisible(v) { try { if (engine.player && engine.player.avatar) engine.player.setVisible ? engine.player.setVisible(v) : engine.player.avatar.setVisible(v); } catch (e) { /* ignore */ } }

  function makeCtl(name) {
    const id = ++ctlId;
    const live = () => id === ctlId && owner === name;
    const ctl = {
      owner: name,
      set(pos, lookAt) {
        if (!live()) return;
        settleMove();
        S.mode = "static"; S.pos.set(pos.x, pos.y, pos.z);
        if (lookAt) S.look.set(lookAt.x, lookAt.y, lookAt.z); else S.look.copy(curLook);
        fpPose = true;
      },
      move(pos, lookAt, dur = 1, easeKind = "inOut") {
        if (!live()) return Promise.resolve();
        settleMove();
        S.fromPos.copy(cam.position); S.fromLook.copy(curLook);
        S.toPos.set(pos.x, pos.y, pos.z);
        if (lookAt) S.toLook.set(lookAt.x, lookAt.y, lookAt.z); else S.toLook.copy(curLook);
        S.t = 0; S.dur = Math.max(0.001, dur || 0); S.ease = easeKind || "inOut"; S.mode = "move";
        fpPose = true;
        return new Promise((res) => { S.resolve = res; });
      },
      follow(obj, offset, lookOffset) {
        if (!live()) return;
        settleMove();
        S.mode = "track"; S.target = obj || null;
        if (offset) S.off.set(offset.x || 0, offset.y || 0, offset.z || 0); else S.off.set(0, 3, -6);
        if (lookOffset) S.lookOff.set(lookOffset.x || 0, lookOffset.y || 0, lookOffset.z || 0); else S.lookOff.set(0, 1.5, 0);
        fpPose = true;
      },
      firstPerson(on) {
        if (!live()) return;
        fp = !!on;
        if (fp) { S.mode = "none"; fpPose = false; settleMove(); }
        avatarVisible(!fp);
      },
      roll(rad, dur = 0.5) {
        rollFrom = rollCur; rollTo = rad || 0; rollT = 0; rollDur = Math.max(0.001, dur || 0);
        if (!dur) { rollCur = rollTo; rollT = 1; }
      },
      release(dur = 0.6) {
        if (!live()) return;
        settleMove();
        R.pos.copy(cam.position); R.quat.copy(cam.quaternion); R.t = 0; R.dur = Math.max(0.001, dur == null ? 0.6 : dur);
        if (fp) { fp = false; avatarVisible(true); }
        S.mode = "none"; S.target = null; fpPose = false;
        owner = null;
        if (Math.abs(rollTo) > 1e-4 || Math.abs(rollCur) > 1e-4) { rollFrom = rollCur; rollTo = 0; rollT = 0; rollDur = R.dur; }
        // continue from the angle the shot ended on so the blend is short
        _d.copy(curLook).sub(cam.position);
        if (_d.lengthSq() > 1e-4) {
          _d.normalize();
          yaw = Math.atan2(_d.x, _d.z);
          pitch = Math.min(PITCH_MAX, Math.max(-0.3, -Math.asin(Math.max(-1, Math.min(1, _d.y)))));
        }
      }
    };
    return ctl;
  }

  const api = {
    get yaw() { return yaw; },
    set yaw(v) { yaw = v; },
    get pitch() { return pitch; },
    set pitch(v) { pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, v)); },
    get distance() { return distTarget; },
    get owner() { return owner; },
    get isFirstPerson() { return fp && !fpPose; },
    get firstPersonOn() { return fp; },
    focusPoint,
    shake(amp, dur) {
      const a = Math.max(0, +amp || 0), d = Math.max(0.05, +dur || 0.4);
      const rem = shakeT < shakeDur ? shakeAmp * Math.pow(1 - shakeT / shakeDur, 2) : 0;
      if (a >= rem) { shakeAmp = a; shakeDur = d; shakeT = 0; }
    },
    setFov(deg, dur = 0.5) {
      fovFrom = baseFov; fovTo = Math.max(20, Math.min(110, +deg || 70)); fovT = 0; fovDur = Math.max(0.001, dur == null ? 0.5 : dur);
      if (!dur) { baseFov = fovTo; fovT = 1; }
    },
    setDistance(m, dur = 0.5) {
      distFrom = distTarget; distTarget = Math.max(DIST_MIN, Math.min(DIST_MAX, +m || 4.6)); distT = 0; distDur = Math.max(0.001, dur == null ? 0.5 : dur);
    },
    take(name) {
      const nm = String(name || "script");
      if (owner && owner !== nm) settleMove();
      owner = nm;
      R.t = 1;
      return makeCtl(nm);
    },
    lockTarget(obj) { lockObj = obj || null; },
    resetBehind(y) {
      if (y != null) yaw = y;
      pitch = 0.32;
      const p = engine.player && engine.player.position;
      if (p) { pivot.set(p.x, p.y + 1.55, p.z); pivotInit = true; }
      colDist = dist;
      if (!owner) R.t = 1;
    },
    update
  };

  // ---- per-frame -----------------------------------------------------------------------------------------
  function followPose(dt, outPos, outLook) {
    const pl = engine.player;
    const p = pl.position;
    // pivot: shoulder height, vertical smoothing only (no horizontal lag jitter)
    const py = p.y + 1.55;
    if (!pivotInit) { pivot.set(p.x, py, p.z); pivotInit = true; }
    pivot.x = p.x; pivot.z = p.z;
    pivot.y += (py - pivot.y) * Math.min(1, dt * (Math.abs(py - pivot.y) > 3 ? 30 : 10));
    if (fp) {
      restoreCloseHide();
      pl.forward(_fwd);
      outPos.set(p.x + _fwd.x * 0.12, p.y + 1.62, p.z + _fwd.z * 0.12);
      const cp = Math.cos(pitch);
      outLook.set(outPos.x + Math.sin(yaw) * cp * 5, outPos.y - Math.sin(pitch) * 5, outPos.z + Math.cos(yaw) * cp * 5);
      return;
    }
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    _d.set(-Math.sin(yaw) * cp, sp, -Math.cos(yaw) * cp); // pivot -> camera direction
    // over-the-shoulder offset (slightly right) so the avatar does not cover the aim point
    const sx = -Math.cos(yaw) * 0.35, sz = Math.sin(yaw) * 0.35;
    _s.set(pivot.x + sx, pivot.y, pivot.z + sz);
    // collision: ray from the pivot towards the wanted camera position
    const want = dist;
    let allowed = want;
    let hit = engine.physics.raycast(_s, _d, want + 0.3);
    if (hit) allowed = Math.max(0.35, hit.dist - 0.3);
    // second ray a little higher: keeps the near plane out of ceilings / roofs the centre ray just misses
    _v.set(_s.x, _s.y + 0.28, _s.z);
    hit = engine.physics.raycast(_v, _d, allowed + 0.3);
    if (hit) allowed = Math.max(0.35, Math.min(allowed, hit.dist - 0.3));
    // overhang: the player stands in the open but the wanted camera spot is under a roof/porch/eave right above it
    // (the rays above miss it because it is above the camera, yet it fills the top of the view): pull in until clear
    if (allowed > 1.7 && !engine.physics.raycast(_s, _upDir, 2.4)) {
      let dd = allowed;
      for (let i = 0; i < 4; i++) {
        _v.copy(_s).addScaledVector(_d, dd);
        if (!engine.physics.raycast(_v, _upDir, 1.6)) break;
        dd = Math.max(1.7, dd - (allowed - 1.7) * 0.34);
      }
      allowed = dd;
    }
    if (allowed < colDist) colDist = allowed; else colDist += (allowed - colDist) * Math.min(1, dt * 3.5);
    outPos.copy(_s).addScaledVector(_d, colDist);
    // never under the ground
    const th = engine.terrain.heightAt(outPos.x, outPos.z);
    if (th > -1e8 && outPos.y < th + 0.35) outPos.y = th + 0.35;
    outLook.set(_s.x, pivot.y + 0.05, _s.z);
    // camera pushed into the avatar (wall/gate right behind): hide the avatar instead of filling the view with a face
    const pobj = pl.object;
    if (pobj) {
      if (colDist < 0.95) { if (pobj.visible) { pobj.visible = false; closeHid = true; } }
      else if (closeHid) { pobj.visible = true; closeHid = false; }
    }
  }
  function restoreCloseHide() { if (closeHid) { closeHid = false; try { if (engine.player && engine.player.object) engine.player.object.visible = true; } catch (e) { /* ignore */ } } }

  function update(dt, t) {
    // runs every sub-step (so it never lags the controller); per-frame input only on sub-step 0
    const first = engine.loop.substep === 0;
    const realDt = dt;
    const pl = engine.player;
    if (!pl) return;
    const input = engine.input;
    // look input
    const lookOk = pl.lookEnabled !== false && !state.ui.modal && (state.rt.playing || engine.devMode);
    if (lookOk && first && (!owner || fp)) {
      const dx = input.look.dx, dy = input.look.dy;
      if (dx !== 0 || dy !== 0) lookIdle = 0; else lookIdle += realDt;
      yaw -= dx * 0.0026;
      pitch = Math.min(PITCH_MAX, Math.max(fp ? -1.2 : PITCH_MIN, pitch + dy * 0.0024));
      const w = input.consumeWheel ? input.consumeWheel() : 0;
      if (w && !fp) { distFrom = distTarget; distTarget = Math.max(DIST_MIN, Math.min(DIST_MAX, distTarget + w * 0.45)); distT = 1; dist = distTarget; }
    }
    // tweens
    if (distT < 1) { distT = Math.min(1, distT + realDt / distDur); dist = distFrom + (distTarget - distFrom) * ease("inOut", distT); }
    else dist += (distTarget - dist) * Math.min(1, realDt * 10);
    if (fovT < 1) { fovT = Math.min(1, fovT + realDt / fovDur); baseFov = fovFrom + (fovTo - fovFrom) * ease("inOut", fovT); }
    if (rollT < 1) { rollT = Math.min(1, rollT + dt / rollDur); rollCur = rollFrom + (rollTo - rollFrom) * ease("inOut", rollT); }
    // soft lock-on
    if (lockObj && !owner) {
      lockObj.getWorldPosition(_v);
      const ty = Math.atan2(_v.x - pl.position.x, _v.z - pl.position.z);
      let dy = ty - yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      yaw += dy * Math.min(1, dt * 3);
    } else if (input.mode === "touch" && !owner && lookIdle > 1.5 && pl.isMoving() && !fp) {
      // phones: gently swing behind the walking direction
      const ty = pl.yaw;
      let dy = ty - yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      if (Math.abs(dy) < 2.2) yaw += dy * Math.min(1, dt * 0.8);
    }

    // pose
    if (owner && S.mode !== "none") {
      restoreCloseHide();
      if (S.mode === "move") {
        S.t = Math.min(S.dur, S.t + dt);
        const e = ease(S.ease, S.t / S.dur);
        _p.lerpVectors(S.fromPos, S.toPos, e);
        curLook.lerpVectors(S.fromLook, S.toLook, e);
        cam.position.copy(_p);
        if (S.t >= S.dur) { S.mode = "static"; S.pos.copy(S.toPos); S.look.copy(S.toLook); settleMove(); }
      } else if (S.mode === "track") {
        if (S.target) {
          S.target.getWorldPosition(_v);
          cam.position.copy(_v).add(S.off);
          curLook.copy(_v).add(S.lookOff);
        }
      } else {
        cam.position.copy(S.pos); curLook.copy(S.look);
      }
      orient(cam.position, curLook);
    } else {
      followPose(dt, _p, curLook);
      if (R.t < 1) {
        R.t = Math.min(1, R.t + realDt / R.dur);
        const e = ease("inOut", R.t);
        cam.position.lerpVectors(R.pos, _p, e);
        orient(_p, curLook);
        _q.copy(cam.quaternion);
        cam.quaternion.slerpQuaternions(R.quat, _q, e);
        applyRoll();
      } else {
        cam.position.copy(_p);
        orient(cam.position, curLook);
      }
    }
    // shake (real time so it reads in slow motion too)
    if (shakeT < shakeDur) {
      shakeT += realDt;
      const k = shakeAmp * Math.pow(1 - Math.min(1, shakeT / shakeDur), 2);
      const tt = engine.realTime * 31;
      cam.position.x += (Math.sin(tt * 1.13) + Math.sin(tt * 2.31) * 0.5) * k * 0.6;
      cam.position.y += (Math.sin(tt * 1.71 + 1.3) + Math.sin(tt * 2.9) * 0.5) * k * 0.6;
      cam.position.z += Math.sin(tt * 1.37 + 2.1) * k * 0.4;
    }
    // fov (portrait screens widen the vertical fov so the horizontal view stays usable)
    const aspect = cam.aspect || 1;
    let fov = baseFov;
    if (aspect < 1.2) {
      const hTarget = 2 * Math.atan(Math.tan(baseFov * D2R / 2) * 1.2) / D2R; // horizontal fov at aspect 1.2
      fov = Math.min(100, 2 * Math.atan(Math.tan(hTarget * D2R / 2) / aspect) / D2R * 0.82);
      fov = Math.max(baseFov, fov);
    }
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    cam.updateMatrixWorld();
    // shadow focus: a bit ahead of the player into the view
    if (!owner || S.mode === "none") {
      cam.getWorldDirection(_fwd);
      focusPoint.set(pl.position.x + _fwd.x * 6, pl.position.y, pl.position.z + _fwd.z * 6);
    } else {
      cam.getWorldDirection(_fwd);
      focusPoint.copy(curLook);
      if (focusPoint.distanceToSquared(cam.position) > 900) focusPoint.copy(cam.position).addScaledVector(_fwd, 12);
    }
  }

  function orient(pos, look) {
    _m.lookAt(pos, look, _up);
    cam.quaternion.setFromRotationMatrix(_m);
    applyRoll();
  }
  function applyRoll() {
    if (Math.abs(rollCur) > 1e-5) { _q.setFromAxisAngle(_rollAxis, rollCur); cam.quaternion.multiply(_q); }
  }

  bus.on("game:start", () => { try { api.resetBehind(engine.player.yaw); } catch (e) { console.warn("[camera]", e); } });
  bus.on("run:reset", () => {
    try {
      lockObj = null;
      if (owner) { owner = null; S.mode = "none"; settleMove(); }
      if (fp) { fp = false; avatarVisible(true); }
      rollCur = rollTo = 0; rollT = 1;
      baseFov = fovTo = 70; fovT = 1;
    } catch (e) { console.warn("[camera]", e); }
  });
  return api;
}
