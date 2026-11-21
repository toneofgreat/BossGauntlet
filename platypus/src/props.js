// props.js - the toys and treasures of levels 2-5 (LEVELS.md B7).
// A beach ball, ring triggers, shiny treasures, snacks, the food bowl, coins, the little cushion and a
// rubber duck. Everything is pooled and built once; nothing allocates in update().
//
// Draw calls when everything is out at once: ball 1, coins 1 (instanced), shinies 1 and snacks 1 (each ONE
// skinned mesh: every item is rigidly bound to its own bone, so eight different shapes cost one call),
// bowl 2, cushion 1, duck 1. Only the ball and the cushion cast shadows.

const GRAV = 17;
const TAU = Math.PI * 2;
const TINY = 1e-4;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function createProps(ctx) {
  const THREE = ctx.THREE;
  const group = new THREE.Group();
  group.name = "props";
  let world = null;
  let clock = 0;

  // ---------------------------------------------------------------- helpers
  const _p = new THREE.Vector3(), _p2 = new THREE.Vector3(), _s = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
  const _r = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  const _e = new THREE.Euler(), _m = new THREE.Matrix4();
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);
  const _axis = new THREE.Vector3();
  const tmpObj = { x: 0, y: 0, z: 0 };

  function sfx(name, a, b, c) {
    const au = ctx.audio, f = au && au[name];
    if (typeof f === "function") f.call(au, a, b, c);
  }
  function vfx(name, a, b, c, d, e, f) {
    const o = ctx.fx, fn = o && o[name];
    if (typeof fn === "function") return fn.call(o, a, b, c, d, e, f);
    return undefined;
  }
  const bedAt = (x, z) => (world ? world.heightAt(x, z) : 0);
  const waterAt = (x, z) => (world && world.waterAt ? world.waterAt(x, z) : -Infinity);
  function confine(obj, r) {
    if (world && world.confine) world.confine(obj, r);
  }
  // world pose of an anchor, expressed in this group's space (the group normally sits at the origin)
  function anchorPose(anchor, outPos, outQuat) {
    anchor.updateWorldMatrix(true, false);
    anchor.matrixWorld.decompose(outPos, outQuat, _s);
    group.worldToLocal(outPos);
  }

  // ---- tiny geometry kit: transform parts, then merge them with a colour (and a bone) per part ----
  function xf(geo, px = 0, py = 0, pz = 0, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz));
    geo.applyMatrix4(m);
    return geo;
  }
  const part = (geo, hex, bone = 0) => ({ geo, color: new THREE.Color(hex), bone });
  function merge(parts, skinned) {
    let nv = 0, ni = 0;
    for (const p of parts) {
      nv += p.geo.attributes.position.count;
      ni += p.geo.index ? p.geo.index.count : p.geo.attributes.position.count;
    }
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    const si = skinned ? new Uint16Array(nv * 4) : null, sw = skinned ? new Float32Array(nv * 4) : null;
    let vo = 0, io = 0;
    for (const p of parts) {
      const g = p.geo, n = g.attributes.position.count;
      if (!g.attributes.normal) g.computeVertexNormals();
      pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
      nor.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
      const gc = g.attributes.color;
      for (let i = 0; i < n; i++) {
        const k = gc ? gc.getX(i) : 1; // an optional per-vertex shade already on the part
        col[(vo + i) * 3] = p.color.r * k;
        col[(vo + i) * 3 + 1] = p.color.g * k;
        col[(vo + i) * 3 + 2] = p.color.b * k;
        if (skinned) { si[(vo + i) * 4] = p.bone; sw[(vo + i) * 4] = 1; }
      }
      if (g.index) {
        const a = g.index.array;
        for (let i = 0; i < g.index.count; i++) idx[io + i] = a[i] + vo;
        io += g.index.count;
      } else {
        for (let i = 0; i < n; i++) idx[io + i] = vo + i;
        io += n;
      }
      vo += n;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    if (skinned) {
      out.setAttribute("skinIndex", new THREE.BufferAttribute(si, 4));
      out.setAttribute("skinWeight", new THREE.BufferAttribute(sw, 4));
    }
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    return out;
  }
  // one draw call for many independently moving rigid items
  function boneSet(parts, nBones, material, parent) {
    const mesh = new THREE.SkinnedMesh(merge(parts, true), material);
    const bones = [];
    for (let i = 0; i < nBones; i++) {
      const b = new THREE.Bone();
      bones.push(b);
      mesh.add(b);
    }
    mesh.bind(new THREE.Skeleton(bones)); // bound at identity: a bone's local transform IS its item's transform
    for (let i = 0; i < nBones; i++) bones[i].scale.setScalar(TINY);
    mesh.frustumCulled = false;
    mesh.visible = false;
    parent.add(mesh);
    return { mesh, bones };
  }
  // a view-dependent sparkle: surfaces flash as they turn to face the camera
  function glint(material, r, g, b, power, key) {
    material.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
        {
          float glintF = pow( abs( dot( normal, normalize( vViewPosition ) ) ), ${power.toFixed(1)} );
          totalEmissiveRadiance += vec3( ${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)} ) * glintF;
        }`);
    };
    material.customProgramCacheKey = () => "platy-glint-" + key;
    return material;
  }

  // ---------------------------------------------------------------- pushers
  const pushers = [];
  function addPusher(obj, radius) {
    if (!obj) return;
    for (let i = 0; i < pushers.length; i++) if (pushers[i].obj === obj) { pushers[i].r = radius; return; }
    pushers.push({ obj, r: radius });
  }
  function clearPushers() { pushers.length = 0; }
  // velocity of a pusher (speed + yaw, or vx/vz)
  let pvx = 0, pvz = 0, pspeed = 0;
  function pusherVel(o) {
    if (typeof o.vx === "number" && typeof o.vz === "number" && typeof o.yaw !== "number") {
      pvx = o.vx; pvz = o.vz;
    } else {
      const sp = o.speed || 0, yaw = o.yaw || 0;
      pvx = Math.sin(yaw) * sp; pvz = Math.cos(yaw) * sp;
    }
    pspeed = Math.hypot(pvx, pvz);
  }

  // ================================================================= BALL
  function ballTexture() {
    const cv = document.createElement("canvas");
    cv.width = 512; cv.height = 256;
    const g = cv.getContext("2d");
    const cols = ["#f2443a", "#fbfaf4", "#2f8fe6", "#fbfaf4", "#ffc928", "#fbfaf4"];
    for (let i = 0; i < 6; i++) {
      g.fillStyle = cols[i];
      g.fillRect((i * 512) / 6, 0, 512 / 6 + 1, 256);
    }
    // soft panel seams
    g.strokeStyle = "rgba(60,40,30,.16)";
    g.lineWidth = 2;
    for (let i = 0; i <= 6; i++) { g.beginPath(); g.moveTo((i * 512) / 6, 0); g.lineTo((i * 512) / 6, 256); g.stroke(); }
    // the two white end caps (and a little valve)
    g.fillStyle = "#fbfaf4";
    g.fillRect(0, 0, 512, 20);
    g.fillRect(0, 236, 512, 20);
    g.fillStyle = "rgba(60,40,30,.2)";
    g.fillRect(0, 19, 512, 2);
    g.fillRect(0, 235, 512, 2);
    g.fillStyle = "#d9d6cc";
    g.fillRect(0, 0, 512, 3);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  const BALL_R = 0.22;
  const ballGroup = new THREE.Group();
  ballGroup.name = "ball";
  const ballMesh = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 24, 14),
    new THREE.MeshStandardMaterial({ map: ballTexture(), roughness: 0.34, metalness: 0 }));
  ballMesh.castShadow = true;
  ballMesh.rotation.set(0.5, 0.3, 0.9); // rest with the stripes at a jaunty angle
  ballGroup.add(ballMesh);
  ballGroup.visible = false;
  group.add(ballGroup);

  let ballAnchor = null, ballHop = 1, hopX = 0, hopY = 0, hopZ = 0, ballWet = false, ballSquash = 0, ballSquashV = 0;
  let ballBounceCd = 0;
  const ball = {
    group: ballGroup, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: BALL_R, active: false, resting: true,
    onBounce: null, tilt: 0,
    place(x, z) {
      ballAnchor = null;
      this.active = true;
      this.x = x; this.z = z;
      this.vx = this.vy = this.vz = 0;
      this.tilt = 0;
      const bed = bedAt(x, z), w = waterAt(x, z);
      ballWet = w > bed + 0.12;
      this.y = ballWet ? w + BALL_R * 0.45 : bed + BALL_R;
      this.resting = true;
      ballSquash = ballSquashV = 0;
      ballGroup.visible = true;
      ballGroup.position.set(this.x, this.y, this.z);
      ballGroup.scale.set(1, 1, 1);
    },
    kick(dirX, dirZ, speed, up = 2) {
      if (!this.active) return;
      if (ballAnchor) { ballAnchor = null; this.tilt = 0; }
      const d = Math.hypot(dirX, dirZ);
      if (d > 1e-5) { this.vx = (dirX / d) * speed; this.vz = (dirZ / d) * speed; }
      this.vy = Math.max(this.vy, up);
      if (this.y - BALL_R < bedAt(this.x, this.z) + 0.01) this.y += 0.02;
      this.resting = false;
    },
    balanceOn(anchor) {
      if (!anchor) {
        if (ballAnchor) { ballAnchor = null; this.vy = 0.6; this.resting = false; }
        this.tilt = 0;
        return;
      }
      if (!this.active) { this.active = true; ballGroup.visible = true; anchorPose(anchor, _p, _q); this.x = _p.x; this.y = _p.y; this.z = _p.z; }
      ballAnchor = anchor;
      this.tilt = 0;
      ballHop = 0; hopX = this.x; hopY = this.y; hopZ = this.z;
      this.vx = this.vy = this.vz = 0;
      this.resting = false;
      ballGroup.scale.set(1, 1, 1);
    },
    drop() {
      if (!ballAnchor) return;
      anchorPose(ballAnchor, _p, _q);
      _r.copy(AX).applyQuaternion(_q);
      const t = clamp(this.tilt, -1.3, 1.3);
      const side = t === 0 ? 0 : (t > 0 ? 1 : -1) * (0.9 + Math.abs(t) * 0.9);
      this.vx += _r.x * side; this.vz += _r.z * side;
      this.vy = 1.3;
      ballAnchor = null;
      this.tilt = 0;
      this.resting = false;
    },
  };

  function spinBall(dx, dz) {
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    _axis.set(dz / d, 0, -dx / d);
    _q.setFromAxisAngle(_axis, d / BALL_R);
    ballMesh.quaternion.premultiply(_q);
  }

  function reflect(o, nx, nz, e) {
    const vn = o.vx * nx + o.vz * nz;
    if (vn < 0) { o.vx -= (1 + e) * vn * nx; o.vz -= (1 + e) * vn * nz; return -vn; }
    return 0;
  }

  // circles (world statics + level transients) bounce rolling things
  function collideCircles(o, r, e) {
    for (let pass = 0; pass < 2; pass++) {
      const list = pass === 0 ? (world && world.colliders) : ctx.colliders;
      if (!list) continue;
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        if (!c.on) continue;
        const dx = o.x - c.x, dz = o.z - c.z, rr = c.r + r, d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) {
          const d = Math.sqrt(d2);
          o.x = c.x + (dx / d) * rr; o.z = c.z + (dz / d) * rr;
          reflect(o, dx / d, dz / d, e);
        }
      }
    }
  }

  function pushBody(o, r, lift) {
    for (let i = 0; i < pushers.length; i++) {
      const p = pushers[i], b = p.obj;
      const dx = o.x - b.x, dz = o.z - b.z, rr = p.r + r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const by = (b.y || 0) + 0.18;
      if (o.y - r > by + 0.45 || o.y + r < by - 0.45) continue;
      const d = Math.sqrt(d2) || 1e-4;
      let nx = dx / d, nz = dz / d;
      if (d2 < 1e-8) { nx = Math.sin(b.yaw || 0); nz = Math.cos(b.yaw || 0); }
      pusherVel(b);
      o.x = b.x + nx * rr; o.z = b.z + nz * rr;
      const into = pvx * nx + pvz * nz;
      if (pspeed > 0.25 && into > 0.05) {
        // dribble / kick: mostly along the push normal, a little along the heading, at 1.25 x the walker's speed
        let kx = nx * 0.62 + (pvx / pspeed) * 0.38, kz = nz * 0.62 + (pvz / pspeed) * 0.38;
        const kl = Math.hypot(kx, kz) || 1;
        kx /= kl; kz /= kl;
        const want = pspeed * 1.25;
        const cur = o.vx * kx + o.vz * kz;
        if (cur < want) { o.vx += kx * (want - cur); o.vz += kz * (want - cur); }
        if (lift > 0 && o.vy < 0.2) o.vy = Math.max(o.vy, lift * (0.5 + pspeed * 0.32));
        o.resting = false;
      } else {
        reflect(o, nx, nz, 0.35);
      }
    }
  }

  function updateBall(dt) {
    if (!ball.active) return;
    const r = BALL_R;
    if (ballBounceCd > 0) ballBounceCd -= dt;
    if (ballAnchor) {
      anchorPose(ballAnchor, _p, _q);
      _r.copy(AX).applyQuaternion(_q);
      _u.copy(AY).applyQuaternion(_q);
      const t = clamp(ball.tilt, -1.25, 1.25);
      const off = t * 0.15, lift = r * 0.93 - t * t * 0.04;
      let tx = _p.x + _r.x * off + _u.x * lift, ty = _p.y + _r.y * off + _u.y * lift, tz = _p.z + _r.z * off + _u.z * lift;
      if (ballHop < 1) {
        ballHop = Math.min(1, ballHop + dt / 0.32);
        const k = smooth(ballHop);
        tx = hopX + (tx - hopX) * k; tz = hopZ + (tz - hopZ) * k;
        ty = hopY + (ty - hopY) * k + Math.sin(Math.PI * k) * 0.28;
      }
      if (dt > 1e-5) {
        // remember the carried motion so a drop inherits it
        const k = Math.min(1, dt * 10);
        ball.vx += (clamp((tx - ball.x) / dt, -4, 4) - ball.vx) * k;
        ball.vz += (clamp((tz - ball.z) / dt, -4, 4) - ball.vz) * k;
      }
      ball.x = tx; ball.y = ty; ball.z = tz; ball.vy = 0;
      ball.resting = false;
      ballGroup.position.set(tx, ty, tz);
      ballGroup.scale.set(1, 1, 1);
      // rolls on the bill as it leans
      ballMesh.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(AZ, -off / r)).multiply(_q2.setFromAxisAngle(AX, 0.5));
      return;
    }

    pushBody(ball, r, 1);

    const ox = ball.x, oz = ball.z;
    let nx = ball.x + ball.vx * dt, nz = ball.z + ball.vz * dt;
    // walls and tall steps: bounce off instead of climbing
    const bottom = ball.y - r;
    const hNew = bedAt(nx, nz);
    if (hNew > bottom + 0.3 && (ball.vx !== 0 || ball.vz !== 0)) {
      const e = 0.12;
      let gx = bedAt(ox + e, oz) - bedAt(ox - e, oz), gz = bedAt(ox, oz + e) - bedAt(ox, oz - e);
      let gl = Math.hypot(gx, gz);
      if (gl < 1e-4) { gx = ball.vx; gz = ball.vz; gl = Math.hypot(gx, gz) || 1; }
      const hit = reflect(ball, -gx / gl, -gz / gl, 0.55);
      if (hit > 1.2 && ballBounceCd <= 0) { ballBounceCd = 0.12; sfx("ballBounce", clamp(hit / 7, 0.1, 1)); if (ball.onBounce) ball.onBounce(clamp(hit / 7, 0.1, 1)); }
      nx = ox + ball.vx * dt; nz = oz + ball.vz * dt;
      if (bedAt(nx, nz) > bottom + 0.3) { nx = ox; nz = oz; }
    }
    ball.x = nx; ball.z = nz;
    collideCircles(ball, r, 0.55);
    const cx = ball.x, cz = ball.z;
    confine(ball, r);
    if (ball.x !== cx || ball.z !== cz) {
      const ddx = ball.x - cx, ddz = ball.z - cz, dl = Math.hypot(ddx, ddz) || 1;
      reflect(ball, ddx / dl, ddz / dl, 0.55);
    }

    const bed = bedAt(ball.x, ball.z), w = waterAt(ball.x, ball.z);
    const floating = w > bed + 0.12 && ball.y - r < w + 0.02;
    let onGround = false;
    if (floating) {
      if (!ballWet) {
        ballWet = true;
        if (ball.vy < -2.2) { vfx("splash", ball.x, w, ball.z, clamp(-ball.vy / 9, 0.25, 0.8)); sfx("splash", clamp(-ball.vy / 10, 0.2, 0.7)); }
      }
      const target = w + r * 0.45;
      ball.vy += ((target - ball.y) * 70 - ball.vy * 7) * dt;
      ball.y += ball.vy * dt;
      const drag = Math.exp(-1.4 * dt);
      ball.vx *= drag; ball.vz *= drag;
      if (ball.y - r * 0.4 < bed) { ball.y = bed + r * 0.4; if (ball.vy < 0) ball.vy = 0; }
      onGround = Math.abs(ball.vy) < 0.25;
    } else {
      ballWet = false;
      ball.vy -= GRAV * dt;
      ball.y += ball.vy * dt;
      if (ball.y - r <= bed) {
        ball.y = bed + r;
        const e = 0.1;
        const hx = (bedAt(ball.x + e, ball.z) - bedAt(ball.x - e, ball.z)) / (2 * e);
        const hz = (bedAt(ball.x, ball.z + e) - bedAt(ball.x, ball.z - e)) / (2 * e);
        const sx = clamp(hx, -1.5, 1.5), sz = clamp(hz, -1.5, 1.5);
        if (ball.vy < -1.3) {
          // bounce off the slope
          const il = 1 / Math.sqrt(sx * sx + 1 + sz * sz);
          const ux = -sx * il, uy = il, uz = -sz * il;
          const vn = ball.vx * ux + ball.vy * uy + ball.vz * uz;
          if (vn < 0) {
            const k = -(1 + 0.62) * vn;
            ball.vx += ux * k; ball.vy += uy * k; ball.vz += uz * k;
            ball.vx *= 0.94; ball.vz *= 0.94;
            const strength = clamp(-vn / 8, 0.08, 1);
            ballSquashV -= strength * 9;
            if (ballBounceCd <= 0) {
              ballBounceCd = 0.08;
              sfx("ballBounce", strength);
              if (strength > 0.3) vfx("dust", ball.x, bed + 0.02, ball.z, strength * 0.6);
              if (ball.onBounce) ball.onBounce(strength);
            }
          } else ball.vy = 0;
        } else {
          // rolling: follow the slope, lose a little speed
          ball.vy = 0;
          ball.vx -= sx * GRAV * 0.55 * dt; ball.vz -= sz * GRAV * 0.55 * dt;
          const fr = Math.exp(-0.85 * dt);
          ball.vx *= fr; ball.vz *= fr;
          const sp = Math.hypot(ball.vx, ball.vz);
          if (sp < 0.12 && Math.abs(sx) + Math.abs(sz) < 0.12) { ball.vx = ball.vz = 0; }
          onGround = true;
        }
      }
    }
    const sp = Math.hypot(ball.vx, ball.vz);
    ball.resting = onGround && sp < 0.08;
    spinBall(ball.x - ox, ball.z - oz);

    // squash spring (visual only)
    ballSquashV += (-ballSquash * 520 - ballSquashV * 26) * dt;
    ballSquash = clamp(ballSquash + ballSquashV * dt, -0.32, 0.2);
    const sy = 1 + ballSquash, sxz = 1 - ballSquash * 0.5;
    ballGroup.scale.set(sxz, sy, sxz);
    ballGroup.position.set(ball.x, ball.y - (1 - sy) * r, ball.z);
  }

  // ================================================================= HOOP (pure logic)
  // The ring stands upright; its axis is the horizontal direction (sin yaw, cos yaw) - the same convention as
  // a character's facing (so "axis along x" is yaw = +-PI/2). A spec may give nx / nz to say it outright.
  // Passing straight through the middle counts whatever the facing.
  function hoop(spec) {
    let px = 0, py = 0, pz = 0, has = false, armed = true;
    return {
      passed(x, y, z) {
        const yaw = spec.yaw || 0;
        let nx = typeof spec.nx === "number" ? spec.nx : Math.sin(yaw);
        let nz = typeof spec.nz === "number" ? spec.nz : Math.cos(yaw);
        const nl = Math.hypot(nx, nz) || 1;
        nx /= nl; nz /= nl;
        const r = spec.r || 0.6;
        const dx = x - spec.x, dy = y - spec.y, dz = z - spec.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        let hit = false;
        if (has && armed) {
          const mx = x - px, my = y - py, mz = z - pz;
          if (mx * mx + my * my + mz * mz < 9) { // a teleport is not a pass
            const d1 = dx * nx + dz * nz;
            const d0 = (px - spec.x) * nx + (pz - spec.z) * nz;
            if ((d0 < 0 && d1 >= 0) || (d0 > 0 && d1 <= 0)) {
              const t = d0 / (d0 - d1);
              const qx = px + mx * t - spec.x, qy = py + my * t - spec.y, qz = pz + mz * t - spec.z;
              if (qx * qx + qy * qy + qz * qz <= r * r) hit = true;
            }
            if (!hit && dist < r * 0.4) hit = true;
          }
        }
        if (hit) armed = false;
        else if (!armed && dist > r * 1.15) armed = true;
        px = x; py = y; pz = z; has = true;
        return hit;
      },
      reset() { has = false; armed = true; },
    };
  }

  // ================================================================= SHINIES
  const N_SHINY = 8;
  function shinyParts() {
    const parts = [];
    for (let i = 0; i < N_SHINY; i++) {
      const kind = i % 4;
      if (kind === 0) {
        // scallop shell: a ribbed fan
        const g = new THREE.SphereGeometry(0.07, 18, 6, 0, TAU, 0, Math.PI / 2);
        const a = g.attributes.position;
        for (let v = 0; v < a.count; v++) {
          const x = a.getX(v), y = a.getY(v), z = a.getZ(v);
          const ang = Math.atan2(z, x), rib = Math.cos(ang * 9);
          const fan = 0.72 + 0.28 * Math.max(0, Math.sin(ang * 0.5 + 0.0001)); // narrower toward the hinge
          a.setXYZ(v, x * (1 + 0.05 * rib) * fan, y * (0.42 + 0.1 * rib), z * (1 + 0.05 * rib) * (0.8 + 0.2 * fan));
        }
        g.computeVertexNormals();
        parts.push(part(g, i < 4 ? 0xffd6cf : 0xfff0c4, i));
        parts.push(part(xf(new THREE.CircleGeometry(0.066, 14), 0, 0.001, 0, 1, 1, 1, Math.PI / 2, 0, 0), 0xf3b9ae, i));
      } else if (kind === 1) {
        // glass marble with a swirl
        parts.push(part(new THREE.SphereGeometry(0.046, 14, 10), i < 4 ? 0x35c9ee : 0x8f6cf0, i));
        parts.push(part(xf(new THREE.TorusGeometry(0.03, 0.012, 5, 12), 0, 0, 0, 1, 1, 1, 0.6, 0.3, 0), 0xffffff, i));
      } else if (kind === 2) {
        // little brass key
        const c = 0xf0c64a;
        parts.push(part(xf(new THREE.TorusGeometry(0.03, 0.009, 6, 14), 0, 0, -0.045, 1, 1, 1, Math.PI / 2, 0, 0), c, i));
        parts.push(part(xf(new THREE.CylinderGeometry(0.0075, 0.0075, 0.09, 7), 0, 0, 0.028, 1, 1, 1, Math.PI / 2, 0, 0), c, i));
        parts.push(part(xf(new THREE.BoxGeometry(0.03, 0.01, 0.012), 0.016, 0, 0.062), c, i));
        parts.push(part(xf(new THREE.BoxGeometry(0.022, 0.01, 0.012), 0.012, 0, 0.042), c, i));
      } else {
        // bottle cap: crimped skirt, bright top
        const g = new THREE.CylinderGeometry(0.04, 0.046, 0.016, 21, 1);
        const a = g.attributes.position;
        for (let v = 0; v < a.count; v++) {
          const x = a.getX(v), y = a.getY(v), z = a.getZ(v);
          if (y < 0 && x * x + z * z > 1e-5) {
            const k = 1 + 0.07 * Math.cos(Math.atan2(z, x) * 21);
            a.setXYZ(v, x * k, y, z * k);
          }
        }
        g.computeVertexNormals();
        parts.push(part(g, i < 4 ? 0xe2473f : 0x39b56a, i));
        parts.push(part(xf(new THREE.CircleGeometry(0.03, 14), 0, 0.0086, 0, 1, 1, 1, -Math.PI / 2, 0, 0), 0xfff6e6, i));
      }
    }
    return parts;
  }
  const shinyMat = glint(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.25, emissive: 0x2a2416, side: THREE.DoubleSide }), 1.0, 0.95, 0.75, 14, "shiny");
  const shinySet = boneSet(shinyParts(), N_SHINY, shinyMat, group);
  const shOn = new Uint8Array(N_SHINY), shPop = new Float32Array(N_SHINY).fill(-1);
  const shX = new Float32Array(N_SHINY), shY = new Float32Array(N_SHINY), shZ = new Float32Array(N_SHINY);
  let shinyLive = 0;
  const shinies = {
    count: N_SHINY,
    place(i, x, y, z) {
      if (!(i >= 0 && i < N_SHINY)) return;
      shOn[i] = 1; shPop[i] = -1;
      shX[i] = x; shZ[i] = z;
      shY[i] = typeof y === "number" ? y : bedAt(x, z);
      shinySet.mesh.visible = true;
    },
    collect(i) {
      if (!(i >= 0 && i < N_SHINY) || !shOn[i] || shPop[i] >= 0) return;
      shPop[i] = 0;
      _p.set(shX[i], shY[i] + 0.1, shZ[i]);
      if (vfx("sparkle", _p, 0xfff2b0, 10) === undefined) vfx("coinSparkle", _p);
    },
    active(i) { return i >= 0 && i < N_SHINY && shOn[i] === 1 && shPop[i] < 0; },
    nearest(x, y, z, maxDist = Infinity) {
      let best = -1, bd = maxDist * maxDist;
      for (let i = 0; i < N_SHINY; i++) {
        if (!shOn[i] || shPop[i] >= 0) continue;
        const dx = shX[i] - x, dy = shY[i] + 0.08 - y, dz = shZ[i] - z, d = dx * dx + dy * dy + dz * dz;
        if (d <= bd) { bd = d; best = i; }
      }
      return best;
    },
    pos(i, out) { out.x = shX[i]; out.y = shY[i] + 0.08; out.z = shZ[i]; return out; },
    clear() {
      for (let i = 0; i < N_SHINY; i++) { shOn[i] = 0; shPop[i] = -1; shinySet.bones[i].scale.setScalar(TINY); }
      shinySet.mesh.visible = false;
      shinyLive = 0;
    },
  };
  function updateShinies(dt, time) {
    if (!shinySet.mesh.visible) return;
    let live = 0;
    for (let i = 0; i < N_SHINY; i++) {
      if (!shOn[i]) continue;
      const b = shinySet.bones[i];
      let sc = 1.9 + Math.sin(time * 2.3 + i * 1.7) * 0.12;
      let up = 0.1 + Math.sin(time * 1.6 + i * 2.1) * 0.025;
      if (shPop[i] >= 0) {
        shPop[i] += dt / 0.3;
        const k = shPop[i];
        if (k >= 1) { shOn[i] = 0; shPop[i] = -1; b.scale.setScalar(TINY); continue; }
        sc *= k < 0.35 ? 1 + k * 1.6 : 1.56 * (1 - (k - 0.35) / 0.65);
        up += k * 0.3;
      }
      live++;
      b.position.set(shX[i], shY[i] + up, shZ[i]);
      b.rotation.set(0.55, time * 1.5 + i * 0.9, 0.25);
      b.scale.setScalar(Math.max(TINY, sc));
    }
    shinyLive = live;
    if (!live) shinySet.mesh.visible = false;
  }

  // ================================================================= SNACKS + BOWL food models
  function wormParts(bone, out, scale = 1) {
    const pts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      pts.push(new THREE.Vector3(Math.sin(t * 5.2) * 0.022 * scale, (0.014 + Math.sin(t * Math.PI) * 0.006) * scale, (t - 0.5) * 0.17 * scale));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 9, 0.0125 * scale, 5, false);
    out.push(part(g, 0xe58f93, bone));
    out.push(part(xf(new THREE.SphereGeometry(0.0128 * scale, 5, 3), pts[0].x, pts[0].y, pts[0].z), 0xd97a82, bone));
    out.push(part(xf(new THREE.SphereGeometry(0.0128 * scale, 5, 3), pts[6].x, pts[6].y, pts[6].z), 0xf0a9a6, bone));
    // the pale saddle band
    const mid = pts[3];
    out.push(part(xf(new THREE.SphereGeometry(0.0155 * scale, 5, 3), mid.x, mid.y, mid.z, 1, 1, 1.5), 0xf6c1b4, bone));
  }
  function yabbyParts(bone, out, scale = 1) {
    const S = scale, shell = 0x4f86ad, dark = 0x3a6788, claw = 0x6aa3c6;
    const sph = (r, x, y, z, sx, sy, sz, c, rx = 0, ry = 0, w = 6, h = 4) =>
      out.push(part(xf(new THREE.SphereGeometry(r * S, w, h), x * S, y * S, z * S, sx, sy, sz, rx, ry, 0), c, bone));
    const box = (r, x, y, z, sx, sy, sz, c, ry = 0) =>
      out.push(part(xf(new THREE.BoxGeometry(r * S * 2, r * S * 2, r * S * 2), x * S, y * S, z * S, sx, sy, sz, 0, ry, 0), c, bone));
    sph(0.026, 0, 0.026, 0.02, 1, 0.85, 1.7, shell, 0, 0, 8, 5); // carapace
    sph(0.02, 0, 0.024, -0.03, 1, 0.8, 1.0, dark); // tail segments
    sph(0.017, 0, 0.021, -0.055, 1, 0.75, 1.0, shell);
    sph(0.014, 0, 0.018, -0.076, 1, 0.7, 1.0, dark);
    sph(0.022, 0, 0.012, -0.098, 1.2, 0.25, 0.8, claw); // tail fan
    for (let s = -1; s <= 1; s += 2) {
      box(0.006, s * 0.03, 0.02, 0.058, 1, 1, 2.6, dark, s * 0.5); // arm
      sph(0.014, s * 0.045, 0.02, 0.09, 0.9, 0.6, 1.6, claw, 0, s * 0.25); // claw
      box(0.005, s * 0.038, 0.02, 0.112, 0.8, 0.6, 2.0, claw, -s * 0.2); // pincer finger
      box(0.004, s * 0.012, 0.043, 0.056, 1, 1, 1, 0x111111); // eye
      for (let k = 0; k < 2; k++) box(0.0035, s * 0.032, 0.01, 0.022 - k * 0.026, 3.4, 0.7, 0.9, dark, s * (k ? -0.3 : 0.3)); // legs
    }
  }
  const foodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.02 });

  const N_SNACK = 8;
  function snackParts() {
    const parts = [];
    for (let i = 0; i < N_SNACK; i++) {
      wormParts(i, parts, 1.25);
      yabbyParts(N_SNACK + i, parts, 1.15);
      // the bump in the sand that gives a buried snack away
      const g = new THREE.SphereGeometry(0.15, 12, 5, 0, TAU, 0, Math.PI / 2);
      const a = g.attributes.position;
      for (let v = 0; v < a.count; v++) {
        const x = a.getX(v), z = a.getZ(v);
        a.setY(v, a.getY(v) * (0.3 + 0.05 * Math.sin(x * 60 + i) * Math.cos(z * 50)));
      }
      g.computeVertexNormals();
      parts.push(part(g, 0xd8c193, N_SNACK * 2 + i));
    }
    return parts;
  }
  const snackSet = boneSet(snackParts(), N_SNACK * 3, foodMat, group);
  const snOn = new Uint8Array(N_SNACK), snKind = new Uint8Array(N_SNACK), snBuried = new Uint8Array(N_SNACK);
  const snX = new Float32Array(N_SNACK), snY = new Float32Array(N_SNACK), snZ = new Float32Array(N_SNACK);
  const snPop = new Float32Array(N_SNACK), snYaw = new Float32Array(N_SNACK);
  function snackHideBones(i) {
    snackSet.bones[i].scale.setScalar(TINY);
    snackSet.bones[N_SNACK + i].scale.setScalar(TINY);
    snackSet.bones[N_SNACK * 2 + i].scale.setScalar(TINY);
  }
  const snacks = {
    count: N_SNACK,
    place(i, x, z, kind = "worm", buried = false) {
      if (!(i >= 0 && i < N_SNACK)) return;
      snOn[i] = 1;
      snKind[i] = kind === "yabby" ? 1 : 0;
      snBuried[i] = buried ? 1 : 0;
      snX[i] = x; snZ[i] = z; snY[i] = bedAt(x, z);
      snPop[i] = buried ? 0 : 1;
      snYaw[i] = (i * 2.399 + x * 3.1 + z * 1.7) % TAU;
      snackHideBones(i);
      snackSet.mesh.visible = true;
    },
    reveal(i) {
      if (!(i >= 0 && i < N_SNACK) || !snOn[i] || !snBuried[i]) return;
      snBuried[i] = 0; snPop[i] = 0;
      vfx("sandPuff", snX[i], snY[i] + 0.03, snZ[i], 0.8);
    },
    eat(i) {
      if (!(i >= 0 && i < N_SNACK) || !snOn[i]) return;
      snOn[i] = 0;
      snackHideBones(i);
      _p.set(snX[i], snY[i] + 0.06, snZ[i]);
      vfx("crumbs", _p);
    },
    active(i) { return i >= 0 && i < N_SNACK && snOn[i] === 1; },
    buried(i) { return i >= 0 && i < N_SNACK && snOn[i] === 1 && snBuried[i] === 1; },
    nearest(x, z, maxDist = Infinity) {
      let best = -1, bd = maxDist * maxDist;
      for (let i = 0; i < N_SNACK; i++) {
        if (!snOn[i]) continue;
        const dx = snX[i] - x, dz = snZ[i] - z, d = dx * dx + dz * dz;
        if (d <= bd) { bd = d; best = i; }
      }
      return best;
    },
    pos(i, out) { out.x = snX[i]; out.y = snY[i]; out.z = snZ[i]; return out; },
    clear() {
      for (let i = 0; i < N_SNACK; i++) { snOn[i] = 0; snackHideBones(i); }
      snackSet.mesh.visible = false;
    },
  };
  function updateSnacks(dt, time) {
    if (!snackSet.mesh.visible) return;
    let live = 0;
    for (let i = 0; i < N_SNACK; i++) {
      if (!snOn[i]) continue;
      live++;
      const item = snackSet.bones[snKind[i] ? N_SNACK + i : i];
      const mound = snackSet.bones[N_SNACK * 2 + i];
      if (snBuried[i]) {
        item.scale.setScalar(TINY);
        mound.position.set(snX[i], snY[i] - 0.004, snZ[i]);
        mound.rotation.set(0, snYaw[i], 0);
        // the faintest stir now and then
        const stir = Math.max(0, Math.sin(time * 1.3 + i * 2.7) - 0.9) * 1.2;
        mound.scale.set(1, 1 + stir, 1);
        continue;
      }
      if (snPop[i] < 1) snPop[i] = Math.min(1, snPop[i] + dt / 0.5);
      const k = snPop[i];
      const hop = Math.sin(Math.PI * Math.min(1, k * 1.15)) * 0.26 * (1 - k * 0.2);
      const grow = k < 0.25 ? k / 0.25 : 1;
      const mk = Math.max(TINY, 1 - k * 1.6);
      mound.position.set(snX[i], snY[i] - 0.004, snZ[i]);
      mound.scale.set(mk, mk, mk);
      const wig = Math.sin(time * (snKind[i] ? 5 : 7) + i * 1.9);
      item.position.set(snX[i], snY[i] + 0.004 + hop, snZ[i]);
      if (snKind[i]) {
        item.rotation.set(-hop * 2.5, snYaw[i] + wig * 0.12 + (1 - k) * 5, 0);
        item.scale.setScalar(Math.max(TINY, grow));
      } else {
        item.rotation.set(0, snYaw[i] + wig * 0.3 + (1 - k) * 5, hop * 3);
        item.scale.set(Math.max(TINY, grow * (1 + wig * 0.1)), Math.max(TINY, grow), Math.max(TINY, grow * (1 - wig * 0.08)));
      }
    }
    if (!live) snackSet.mesh.visible = false;
  }

  // ---- bowl ----
  const bowlGroup = new THREE.Group();
  bowlGroup.name = "bowl";
  bowlGroup.visible = false;
  group.add(bowlGroup);
  {
    const v2 = (x, y) => new THREE.Vector2(x, y);
    const outer = new THREE.LatheGeometry([v2(0.001, 0), v2(0.125, 0), v2(0.135, 0.008), v2(0.165, 0.05), v2(0.192, 0.082), v2(0.197, 0.09)], 28);
    const inner = new THREE.LatheGeometry([v2(0.197, 0.09), v2(0.188, 0.092), v2(0.176, 0.082), v2(0.15, 0.045), v2(0.115, 0.02), v2(0.001, 0.016)], 28);
    const dish = new THREE.Mesh(
      merge([part(outer, 0x4f93c4), part(inner, 0xf4efe2)], false),
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.05, side: THREE.DoubleSide }));
    dish.receiveShadow = true;
    bowlGroup.add(dish);
  }
  const N_FOOD = 8;
  const foodParts = [];
  for (let i = 0; i < N_FOOD; i++) { wormParts(i, foodParts, 1.2); yabbyParts(N_FOOD + i, foodParts, 1.0); }
  const foodSet = boneSet(foodParts, N_FOOD * 2, foodMat, bowlGroup);
  let bowlAnchor = null, bowlLeft = 0, bowlKind = 0, bowlX = 0, bowlY = 0, bowlZ = 0;
  function layFood() {
    for (let i = 0; i < N_FOOD; i++) {
      for (let k = 0; k < 2; k++) {
        const b = foodSet.bones[k * N_FOOD + i];
        if (k === bowlKind && i < bowlLeft) {
          const ring = i < 5 ? 0.075 : 0.025, a = i < 5 ? i * (TAU / 5) + 0.4 : (i - 5) * (TAU / 3);
          b.position.set(Math.cos(a) * ring, i < 5 ? 0.034 : 0.05, Math.sin(a) * ring);
          b.rotation.set(i < 5 ? 0.25 : 0, a * 1.7 + i, i < 5 ? 0.2 : 0);
          b.scale.setScalar(1);
        } else b.scale.setScalar(TINY);
      }
    }
    foodSet.mesh.visible = bowlLeft > 0;
  }
  const bowl = {
    group: bowlGroup,
    get left() { return bowlLeft; },
    get x() { return bowlX; }, get y() { return bowlY; }, get z() { return bowlZ; },
    place(x, z) {
      bowlAnchor = null;
      bowlX = x; bowlZ = z; bowlY = bedAt(x, z);
      bowlGroup.position.set(bowlX, bowlY, bowlZ);
      bowlGroup.quaternion.identity();
      bowlGroup.visible = true;
    },
    attach(anchor) {
      if (anchor) { bowlAnchor = anchor; bowlGroup.visible = true; followBowl(); return; }
      if (!bowlAnchor) return;
      bowlAnchor = null;
      // set down where it is
      bowlY = bedAt(bowlX, bowlZ);
      bowlGroup.position.set(bowlX, bowlY, bowlZ);
      bowlGroup.quaternion.identity();
    },
    fill(kind, n) {
      bowlKind = kind === "worm" ? 0 : 1;
      bowlLeft = clamp(n | 0, 0, N_FOOD);
      layFood();
    },
    bite() {
      if (bowlLeft <= 0) return false;
      bowlLeft--;
      layFood();
      _p.set(0, 0.09, 0);
      bowlGroup.localToWorld(_p);
      vfx("crumbs", _p);
      return true;
    },
    hide() { bowlAnchor = null; bowlGroup.visible = false; },
  };
  function followBowl() {
    if (!bowlAnchor) return;
    anchorPose(bowlAnchor, _p, _q);
    bowlX = _p.x; bowlY = _p.y; bowlZ = _p.z;
    bowlGroup.position.copy(_p);
    // stay level however the hand turns: keep only the heading
    _f.copy(AZ).applyQuaternion(_q);
    bowlGroup.rotation.set(0, Math.atan2(_f.x, _f.z), 0);
  }

  // ================================================================= COINS
  const N_COIN = 48, COIN_R = 0.085;
  function coinTexture() {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 128;
    const g = cv.getContext("2d");
    g.fillStyle = "#e9a91c";
    g.fillRect(0, 0, 128, 128);
    const gr = g.createRadialGradient(54, 50, 4, 64, 64, 62);
    gr.addColorStop(0, "#fff0a6");
    gr.addColorStop(0.55, "#f7c53a");
    gr.addColorStop(1, "#d99310");
    g.fillStyle = gr;
    g.beginPath(); g.arc(64, 64, 62, 0, TAU); g.fill();
    g.strokeStyle = "#b9780a";
    g.lineWidth = 5;
    g.beginPath(); g.arc(64, 64, 49, 0, TAU); g.stroke();
    g.strokeStyle = "rgba(255,246,190,.9)";
    g.lineWidth = 2;
    g.beginPath(); g.arc(64, 64, 45, 0, TAU); g.stroke();
    // a little paw print
    g.fillStyle = "#b9780a";
    g.beginPath(); g.ellipse(64, 74, 17, 14, 0, 0, TAU); g.fill();
    for (let i = 0; i < 4; i++) {
      const a = -2.25 + i * 0.47;
      g.beginPath(); g.ellipse(64 + Math.cos(a) * 26, 72 + Math.sin(a) * 26, 6.5, 8, a + Math.PI / 2, 0, TAU); g.fill();
    }
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const coinGeo = new THREE.CylinderGeometry(COIN_R, COIN_R, 0.02, 12, 1);
  coinGeo.rotateX(Math.PI / 2); // faces along z: spinning about y shows them
  const coinMat = glint(new THREE.MeshStandardMaterial({ map: coinTexture(), color: 0xffffff, roughness: 0.3, metalness: 0.35, emissive: 0x5a3c00 }), 1.0, 0.86, 0.45, 20, "coin");
  const coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, N_COIN);
  coinMesh.frustumCulled = false;
  coinMesh.visible = false;
  group.add(coinMesh);
  _m.makeScale(0, 0, 0);
  for (let i = 0; i < N_COIN; i++) coinMesh.setMatrixAt(i, _m);
  // state: 0 free, 1 flying, 2 lying, 3 flying to the magnet, 4 waiting to drop (rain)
  const cS = new Uint8Array(N_COIN), cB = new Uint8Array(N_COIN);
  const cX = new Float32Array(N_COIN), cY = new Float32Array(N_COIN), cZ = new Float32Array(N_COIN);
  const cVX = new Float32Array(N_COIN), cVY = new Float32Array(N_COIN), cVZ = new Float32Array(N_COIN);
  const cT = new Float32Array(N_COIN), cVal = new Float32Array(N_COIN), cPh = new Float32Array(N_COIN);
  let coinLive = 0, coinLying = 0;
  function coinFree(i) {
    cS[i] = 0;
    _m.makeScale(0, 0, 0);
    coinMesh.setMatrixAt(i, _m);
    coinMesh.instanceMatrix.needsUpdate = true;
  }
  function coinCollected(i) {
    const v = cVal[i], x = cX[i], y = cY[i], z = cZ[i];
    coinFree(i);
    _p.set(x, y, z);
    vfx("coinSparkle", _p);
    if (coins.onCollect) coins.onCollect(v, x, y, z);
  }
  function coinSlot() {
    for (let i = 0; i < N_COIN; i++) if (cS[i] === 0) return i;
    // pool full: bank the oldest coin so no money is ever lost
    let best = 0, bt = -1;
    for (let i = 0; i < N_COIN; i++) {
      const age = cT[i] + (cS[i] === 2 ? 1000 : 0);
      if (age > bt) { bt = age; best = i; }
    }
    coinCollected(best);
    return best;
  }
  const coins = {
    magnet: null,
    onCollect: null,
    get lying() { return coinLying; },
    get live() { return coinLive; },
    toss(from, to, value = 1) {
      const i = coinSlot();
      const fy = typeof from.y === "number" ? from.y : 1.2;
      const ty = (typeof to.y === "number" ? to.y : bedAt(to.x, to.z)) + COIN_R;
      let top = Math.max(fy, ty) + 0.7;
      const gl = world && world.glass;
      if (gl && typeof gl.z === "number" && (from.z - gl.z) * (to.z - gl.z) < 0) top = Math.max(top, (gl.height || 2.4) + 0.55);
      top += Math.random() * 0.35;
      const vy = Math.sqrt(2 * GRAV * (top - fy));
      const T = vy / GRAV + Math.sqrt((2 * (top - ty)) / GRAV);
      cS[i] = 1; cB[i] = 0; cT[i] = 0; cVal[i] = value; cPh[i] = Math.random() * TAU;
      cX[i] = from.x; cY[i] = fy; cZ[i] = from.z;
      cVX[i] = (to.x - from.x) / T; cVY[i] = vy; cVZ[i] = (to.z - from.z) / T;
      coinMesh.visible = true;
      return i;
    },
    rain(cx, cz, radius, n, value = 1) {
      for (let k = 0; k < n; k++) {
        const i = coinSlot();
        const a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * radius;
        tmpObj.x = cx + Math.cos(a) * rr; tmpObj.z = cz + Math.sin(a) * rr; tmpObj.y = 0;
        confine(tmpObj, 0.15);
        cS[i] = 4; cB[i] = 0; cVal[i] = value; cPh[i] = Math.random() * TAU;
        cT[i] = -(k / Math.max(1, n)) * 1.4 - Math.random() * 0.25; // staggered: a shower, not a slab
        cX[i] = tmpObj.x; cZ[i] = tmpObj.z;
        cY[i] = Math.max(bedAt(tmpObj.x, tmpObj.z), waterAt(tmpObj.x, tmpObj.z)) + 6;
        cVX[i] = (Math.random() - 0.5) * 0.8; cVY[i] = -1 - Math.random(); cVZ[i] = (Math.random() - 0.5) * 0.8;
      }
      coinMesh.visible = true;
    },
    clear() {
      _m.makeScale(0, 0, 0);
      for (let i = 0; i < N_COIN; i++) { cS[i] = 0; coinMesh.setMatrixAt(i, _m); }
      coinMesh.instanceMatrix.needsUpdate = true;
      coinMesh.visible = false;
      coinLive = coinLying = 0;
    },
  };
  function updateCoins(dt, time) {
    if (!coinMesh.visible) return;
    let live = 0, lying = 0;
    const mg = coins.magnet;
    for (let i = 0; i < N_COIN; i++) {
      const st = cS[i];
      if (st === 0) continue;
      live++;
      cT[i] += dt;
      let scale = 1, rx = 0, ry = 0, yOff = 0;
      if (st === 4) {
        if (cT[i] < 0) continue; // still up in the rafters (matrix is zero-scale)
        cS[i] = 1; cT[i] = 0;
      }
      if (cS[i] === 1) {
        cVY[i] -= GRAV * dt;
        cX[i] += cVX[i] * dt; cY[i] += cVY[i] * dt; cZ[i] += cVZ[i] * dt;
        const bed = bedAt(cX[i], cZ[i]), w = waterAt(cX[i], cZ[i]);
        if (w > bed + 0.05 && cY[i] < w) {
          // sinks gently, glittering
          if (cB[i] < 200) { cB[i] = 200; if (cVY[i] < -2) vfx("splash", cX[i], w, cZ[i], 0.15); }
          const d = Math.exp(-5 * dt);
          cVX[i] *= d; cVZ[i] *= d;
          cVY[i] = Math.max(cVY[i] * d, -1.1);
        }
        if (cY[i] <= bed + COIN_R && cVY[i] <= 0) {
          cY[i] = bed + COIN_R;
          const nb = cB[i] >= 200 ? 3 : cB[i];
          if (nb < 2 && cVY[i] < -1.6) {
            cVY[i] = -cVY[i] * 0.42; cVX[i] *= 0.55; cVZ[i] *= 0.55;
            cB[i]++;
          } else {
            tmpObj.x = cX[i]; tmpObj.z = cZ[i]; tmpObj.y = cY[i];
            confine(tmpObj, 0.12);
            cX[i] = tmpObj.x; cZ[i] = tmpObj.z;
            cY[i] = bedAt(cX[i], cZ[i]) + COIN_R;
            cS[i] = 2; cT[i] = 0; cVX[i] = cVY[i] = cVZ[i] = 0;
          }
        }
        rx = cT[i] * 13 + cPh[i]; ry = cT[i] * 8 + cPh[i];
      }
      if (cS[i] === 2) {
        lying++;
        // stands up and turns slowly so it catches the light and reads as "pick me up"
        const up = smooth(cT[i] * 3);
        yOff = up * (0.06 + Math.sin(time * 3 + cPh[i]) * 0.022);
        ry = time * 3.2 + cPh[i];
        rx = (1 - up) * 1.4;
        if (mg) {
          const dx = mg.x - cX[i], dz = mg.z - cZ[i], dy = (mg.y || 0) + 0.2 - cY[i];
          if (dx * dx + dz * dz < 1.69 && dy > -2.6 && dy < 2.6) { cS[i] = 3; cT[i] = 0; }
        }
      } else if (cS[i] === 3) {
        const k = Math.min(1, dt * (9 + cT[i] * 40));
        if (mg) {
          cX[i] += (mg.x - cX[i]) * k; cZ[i] += (mg.z - cZ[i]) * k;
          cY[i] += ((mg.y || 0) + 0.28 - cY[i]) * k;
          const dx = mg.x - cX[i], dz = mg.z - cZ[i];
          if (cT[i] > 0.32 || dx * dx + dz * dz < 0.03) { coinCollected(i); continue; }
        } else { coinCollected(i); continue; }
        scale = Math.max(0.45, 1 - cT[i] * 1.6);
        ry = time * 14 + cPh[i];
      }
      _p.set(cX[i], cY[i] + yOff, cZ[i]);
      _e.set(rx, ry, 0);
      _q.setFromEuler(_e);
      _s.set(scale, scale, scale);
      _m.compose(_p, _q, _s);
      coinMesh.setMatrixAt(i, _m);
    }
    coinLive = live; coinLying = lying;
    coinMesh.instanceMatrix.needsUpdate = true;
    if (!live) coinMesh.visible = false;
  }

  // ================================================================= CUSHION (the level-1 cushion in miniature)
  const CUSH_HALF = 0.18, CUSH_TOP = 0.075, CUSH_BOT = 0.05;
  function cushionGeometry() {
    const N = 14, n1 = N + 1, M = 44, SIDES = 5;
    const nv = n1 * n1 * 2 + M * SIDES;
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const idx = [];
    const superR = (th) => Math.pow(Math.pow(Math.abs(Math.cos(th)), 4) + Math.pow(Math.abs(Math.sin(th)), 4), -0.25);
    const tufts = [[0, 0], [0.46, 0.46], [-0.46, 0.46], [0.46, -0.46], [-0.46, -0.46]];
    for (let side = 0; side < 2; side++) {
      const base = side * n1 * n1, H = side === 0 ? CUSH_TOP : -CUSH_BOT;
      for (let j = 0; j <= N; j++) {
        for (let i = 0; i <= N; i++) {
          const u = (i / N) * 2 - 1, v = (j / N) * 2 - 1;
          const rho = Math.max(Math.abs(u), Math.abs(v));
          const th = Math.atan2(v, u);
          const R = superR(th);
          const ux = rho * R * Math.cos(th), uz = rho * R * Math.sin(th);
          const corner = Math.pow(Math.abs(Math.sin(2 * th)), 2) * rho * rho * rho;
          let h = Math.pow(Math.max(0, 1 - Math.pow(rho, 2.6)), 0.55) * (1 - 0.32 * corner);
          let dim = 0;
          for (let t = 0; t < tufts.length; t++) {
            const ddx = ux - tufts[t][0], ddz = uz - tufts[t][1];
            dim += Math.exp(-(ddx * ddx + ddz * ddz) / 0.014);
          }
          // soft radial puckers running out of each tuft
          h -= dim * (side === 0 ? 0.34 : 0.2);
          h += Math.sin(u * 9.0 + v * 4.0) * Math.sin(v * 8.0 - u * 3.0) * 0.012 * (1 - rho);
          const k = (base + j * n1 + i) * 3;
          pos[k] = ux * CUSH_HALF; pos[k + 1] = Math.max(0, h) * H; pos[k + 2] = uz * CUSH_HALF;
          const shade = (side === 0 ? 1 : 0.9) * (1 - 0.3 * Math.min(1, dim)) * (1 - 0.12 * Math.pow(rho, 8));
          col[k] = 0.985 * shade; col[k + 1] = 0.975 * shade; col[k + 2] = 0.95 * shade;
        }
      }
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const a = base + j * n1 + i, b = a + 1, c = a + n1, d = c + 1;
          if (side === 0) idx.push(a, c, b, b, c, d);
          else idx.push(a, b, c, b, d, c);
        }
      }
    }
    // piped seam round the equator
    const sb = n1 * n1 * 2, pr = 0.0095;
    for (let k = 0; k < M; k++) {
      const th = (k / M) * TAU, R = superR(th) * CUSH_HALF * 1.004;
      const cxr = Math.cos(th), czr = Math.sin(th);
      for (let s = 0; s < SIDES; s++) {
        const ph = (s / SIDES) * TAU;
        const o = (sb + k * SIDES + s) * 3;
        pos[o] = cxr * (R + Math.cos(ph) * pr); pos[o + 1] = Math.sin(ph) * pr; pos[o + 2] = czr * (R + Math.cos(ph) * pr);
        col[o] = 0.93; col[o + 1] = 0.915; col[o + 2] = 0.88;
      }
    }
    for (let k = 0; k < M; k++) {
      const k2 = (k + 1) % M;
      for (let s = 0; s < SIDES; s++) {
        const s2 = (s + 1) % SIDES;
        const a = sb + k * SIDES + s, b = sb + k * SIDES + s2, c = sb + k2 * SIDES + s, d = sb + k2 * SIDES + s2;
        idx.push(a, b, c, b, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  const cushGroup = new THREE.Group();
  cushGroup.name = "cushion";
  cushGroup.visible = false;
  const cushMesh = new THREE.Mesh(cushionGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 }));
  cushMesh.castShadow = true;
  cushMesh.receiveShadow = true;
  cushGroup.add(cushMesh);
  group.add(cushGroup);
  let cushAnchor = null, cvx = 0, cvy = 0, cvz = 0, cushThrown = false, cushHitDone = false, cushBounced = false;
  let cushSq = 0, cushSqV = 0, cushSpinX = 0, cushSpinY = 0, cushRX = 0, cushRY = 0, cushRZ = 0, cushWet = false;
  const cushion = {
    group: cushGroup, x: 0, y: 0, z: 0, state: "ground",
    onLand: null, onHit: null, hitTarget: null, active: false,
    place(x, z) {
      cushAnchor = null;
      this.active = true;
      this.state = "ground";
      this.x = x; this.z = z;
      this.y = Math.max(bedAt(x, z), waterAt(x, z) - 0.02) + CUSH_BOT;
      cvx = cvy = cvz = 0; cushThrown = false; cushSq = cushSqV = 0;
      cushRX = cushRZ = 0; cushRY = 0.35;
      cushGroup.visible = true;
      cushGroup.position.set(this.x, this.y, this.z);
      cushGroup.rotation.set(0, cushRY, 0);
      cushGroup.scale.set(1, 1, 1);
    },
    canPickUp(x, z) {
      if (!this.active || this.state !== "ground") return false;
      const dx = this.x - x, dz = this.z - z;
      return dx * dx + dz * dz <= 0.81;
    },
    pickUp(anchor) {
      if (!anchor) return;
      if (!this.active) { this.active = true; cushGroup.visible = true; }
      cushAnchor = anchor;
      this.state = "held";
      cushThrown = false;
      cushSq = -0.18; cushSqV = 0; // squeezed by the grip, then puffs back
      followCushion();
    },
    drop() {
      if (this.state !== "held") return;
      followCushion();
      cushAnchor = null;
      this.state = "flying";
      cushThrown = false; cushBounced = true;
      cvx = cvz = 0; cvy = 0.4;
      cushSpinX = 0; cushSpinY = 0;
      cushRX = cushRZ = 0;
    },
    throwAt(dirX, dirZ, speed = 6, up = 3.5) {
      if (!this.active) return;
      if (this.state === "held") followCushion();
      cushAnchor = null;
      const d = Math.hypot(dirX, dirZ) || 1;
      cvx = (dirX / d) * speed; cvz = (dirZ / d) * speed; cvy = up;
      this.state = "flying";
      cushThrown = true; cushHitDone = false; cushBounced = false;
      cushSpinX = 7 + Math.random() * 3; cushSpinY = (Math.random() - 0.5) * 6;
      if (this.y < bedAt(this.x, this.z) + CUSH_BOT + 0.02) this.y += 0.05;
    },
  };
  function followCushion() {
    if (!cushAnchor) return;
    anchorPose(cushAnchor, _p, _q);
    cushion.x = _p.x; cushion.y = _p.y; cushion.z = _p.z;
    cushGroup.position.copy(_p);
    cushGroup.quaternion.copy(_q);
  }
  function updateCushion(dt) {
    if (!cushion.active) return;
    cushSqV += (-cushSq * 300 - cushSqV * 16) * dt;
    cushSq = clamp(cushSq + cushSqV * dt, -0.5, 0.3);
    const sy = 1 + cushSq, sxz = 1 - cushSq * 0.35;
    cushGroup.scale.set(sxz, sy, sxz);
    if (cushion.state === "held") { followCushion(); return; }
    if (cushion.state !== "flying") return;
    cvy -= GRAV * dt;
    cushion.x += cvx * dt; cushion.y += cvy * dt; cushion.z += cvz * dt;
    const px = cushion.x, pz = cushion.z;
    confine(cushion, CUSH_HALF);
    if (cushion.x !== px || cushion.z !== pz) { cvx *= -0.25; cvz *= -0.25; }
    cushRX += cushSpinX * dt; cushRY += cushSpinY * dt;
    // the target: an upright cylinder of radius r standing at (x, y, z)
    const t = cushion.hitTarget;
    if (cushThrown && !cushHitDone && t) {
      const dx = cushion.x - t.x, dz = cushion.z - t.z, rr = (t.r || 0.4) + CUSH_HALF;
      const ty = t.y || 0;
      if (dx * dx + dz * dz < rr * rr && cushion.y > ty - 0.35 && cushion.y < ty + 1.7) {
        cushHitDone = true;
        const d = Math.hypot(dx, dz) || 1;
        const sp = Math.hypot(cvx, cvz);
        cvx = (dx / d) * sp * 0.28; cvz = (dz / d) * sp * 0.28; cvy = Math.max(cvy * 0.2, 1.6);
        cushSpinX *= -0.5;
        cushSq = -0.3;
        _p.set(cushion.x, cushion.y, cushion.z);
        vfx("cushionPuff", cushion.x, cushion.y, cushion.z, 1.2);
        if (cushion.onHit) cushion.onHit();
      }
    }
    const bed = bedAt(cushion.x, cushion.z), w = waterAt(cushion.x, cushion.z);
    const wet = w > bed + 0.08;
    const floor = (wet ? Math.max(bed, w - 0.02) : bed) + CUSH_BOT;
    if (cushion.y <= floor && cvy <= 0) {
      cushion.y = floor;
      const impact = clamp(-cvy / 8, 0, 1);
      if (!cushBounced && impact > 0.3 && !wet) {
        cushBounced = true;
        cvy = -cvy * 0.28; cvx *= 0.45; cvz *= 0.45;
        cushSpinX *= 0.4; cushSpinY *= 0.4;
        cushSq = -0.22 * impact;
        vfx("cushionPuff", cushion.x, bed + 0.03, cushion.z, 0.5 + impact);
      } else {
        cushion.state = "ground";
        cvx = cvy = cvz = 0;
        cushRX = cushRZ = 0;
        cushSq = Math.min(cushSq, -0.12 - 0.25 * impact);
        cushThrown = false;
        if (wet) {
          if (!cushWet) { vfx("splash", cushion.x, w, cushion.z, 0.35); sfx("splash", 0.3); }
        } else {
          vfx("cushionPuff", cushion.x, bed + 0.03, cushion.z, 0.4 + impact);
          sfx("cushionStep", 0.35 + impact * 0.4, 0);
        }
        cushGroup.position.set(cushion.x, cushion.y, cushion.z);
        cushGroup.rotation.set(0, cushRY, 0);
        if (cushion.onLand) cushion.onLand(cushion.x, cushion.z);
        cushWet = wet;
        return;
      }
    }
    cushWet = wet && cushion.y <= floor + 0.01;
    cushGroup.position.set(cushion.x, cushion.y, cushion.z);
    cushGroup.rotation.set(cushRX, cushRY, cushRZ);
  }

  // ================================================================= RUBBER DUCK
  const duckGroup = new THREE.Group();
  duckGroup.name = "duck";
  duckGroup.visible = false;
  {
    const yel = 0xffd426, org = 0xff8b1e;
    const S = (r, w, h) => new THREE.SphereGeometry(r, w, h);
    const parts = [
      part(xf(S(0.09, 14, 9), 0, 0.062, 0, 1, 0.74, 1.28), yel),
      part(xf(S(0.058, 12, 8), 0, 0.148, 0.062), yel),
      part(xf(S(0.05, 7, 5), 0, 0.09, -0.105, 0.7, 0.5, 0.9, -0.7, 0, 0), yel), // perky tail
      part(xf(S(0.05, 7, 5), 0.078, 0.075, -0.01, 0.3, 0.6, 1.0, 0, 0, -0.2), 0xf7c81e), // wings
      part(xf(S(0.05, 7, 5), -0.078, 0.075, -0.01, 0.3, 0.6, 1.0, 0, 0, 0.2), 0xf7c81e),
      part(xf(S(0.03, 8, 5), 0, 0.14, 0.122, 1.0, 0.36, 1.1), org), // bill
      part(xf(S(0.026, 8, 5), 0, 0.132, 0.118, 0.95, 0.3, 1.0), 0xe9720f),
      part(xf(S(0.0095, 6, 4), 0.028, 0.166, 0.105), 0x16130f),
      part(xf(S(0.0095, 6, 4), -0.028, 0.166, 0.105), 0x16130f),
      part(xf(S(0.0035, 5, 4), 0.031, 0.17, 0.112), 0xffffff),
      part(xf(S(0.0035, 5, 4), -0.025, 0.17, 0.112), 0xffffff),
    ];
    const m = new THREE.Mesh(merge(parts, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0 }));
    m.scale.setScalar(1.25);
    duckGroup.add(m);
  }
  group.add(duckGroup);
  const duckBody = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, resting: true, yaw: 0, spin: 0, active: false, rock: 0 };
  const duck = {
    group: duckGroup,
    get x() { return duckBody.x; }, get y() { return duckBody.y; }, get z() { return duckBody.z; },
    place(x, z) {
      duckBody.active = true;
      duckBody.x = x; duckBody.z = z; duckBody.vx = duckBody.vz = duckBody.vy = 0;
      duckBody.yaw = (x * 1.3 + z * 0.7) % TAU; duckBody.spin = 0; duckBody.rock = 0;
      duckBody.y = Math.max(bedAt(x, z), waterAt(x, z) - 0.03);
      duckGroup.visible = true;
      duckGroup.position.set(x, duckBody.y, z);
    },
    hide() { duckBody.active = false; duckGroup.visible = false; },
  };
  function updateDuck(dt, time) {
    const d = duckBody;
    if (!d.active) return;
    const bx = d.vx, bz = d.vz;
    d.y += 0.1; // test the pushers against its middle
    pushBody(d, 0.12, 0);
    d.y -= 0.1;
    const kick = Math.hypot(d.vx - bx, d.vz - bz);
    if (kick > 0.3) { d.spin += (Math.random() - 0.5) * kick * 3; d.rock = Math.min(1, d.rock + kick * 0.5); }
    const bed = bedAt(d.x, d.z), w = waterAt(d.x, d.z);
    const afloat = w > bed + 0.06;
    d.x += d.vx * dt; d.z += d.vz * dt;
    const px = d.x, pz = d.z;
    confine(d, 0.12);
    if (d.x !== px || d.z !== pz) { d.vx *= -0.3; d.vz *= -0.3; }
    // a duck stays on its pond: turn back at the shore
    if (afloat && waterAt(d.x, d.z) <= bedAt(d.x, d.z) + 0.06) { d.x -= d.vx * dt * 2; d.z -= d.vz * dt * 2; d.vx *= -0.4; d.vz *= -0.4; }
    const drag = Math.exp(-(afloat ? 1.1 : 6) * dt);
    d.vx *= drag; d.vz *= drag;
    d.spin *= Math.exp(-1.6 * dt);
    d.yaw += (d.spin + (afloat ? Math.sin(time * 0.31) * 0.12 : 0)) * dt;
    d.rock *= Math.exp(-1.5 * dt);
    const b2 = bedAt(d.x, d.z), w2 = waterAt(d.x, d.z);
    const bob = afloat ? Math.sin(time * 2.1) * 0.012 + Math.sin(time * 3.7 + 1) * 0.006 : 0;
    const ty = (w2 > b2 + 0.06 ? Math.max(b2, w2 - 0.03) : b2) + bob;
    d.y += (ty - d.y) * Math.min(1, dt * 12);
    duckGroup.position.set(d.x, d.y, d.z);
    const amp = afloat ? 0.05 + d.rock * 0.3 : d.rock * 0.1;
    duckGroup.rotation.set(Math.sin(time * 2.4 + 0.5) * amp, d.yaw, Math.sin(time * 1.9) * amp * 1.2);
  }

  // ================================================================= module surface
  function setWorld(w) { world = w || null; }

  function update(dt, time) {
    if (!(dt > 0)) dt = 0;
    clock = typeof time === "number" ? time : clock + dt;
    updateBall(dt);
    updateCoins(dt, clock);
    updateShinies(dt, clock);
    updateSnacks(dt, clock);
    if (bowlAnchor) followBowl();
    updateCushion(dt);
    updateDuck(dt, clock);
  }

  function reset() {
    ballAnchor = null;
    ball.active = false; ball.resting = true;
    ball.vx = ball.vy = ball.vz = 0; ball.tilt = 0;
    ballSquash = ballSquashV = 0; ballHop = 1; ballWet = false;
    ballGroup.visible = false;
    ballGroup.scale.set(1, 1, 1);
    shinies.clear();
    snacks.clear();
    bowlLeft = 0;
    layFood();
    bowl.hide();
    coins.clear();
    cushAnchor = null;
    cushion.active = false; cushion.state = "ground"; cushion.hitTarget = null;
    cvx = cvy = cvz = 0; cushThrown = false; cushSq = cushSqV = 0;
    cushGroup.visible = false;
    cushGroup.scale.set(1, 1, 1);
    cushGroup.rotation.set(0, 0, 0);
    duck.hide();
  }

  return {
    group, setWorld, update, reset,
    addPusher, clearPushers,
    ball, hoop, shinies, snacks, bowl, coins, cushion,
    toys: { duck },
    get world() { return world; },
  };
}
