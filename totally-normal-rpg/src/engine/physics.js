// physics.js - player-only kinematic collision world (CONTRACT 5.2): oriented boxes, vertical cylinders, walkable
// ramps, the terrain heightfield, triggers, raycasts, ground queries. Spatial hash broadphase (8 m cells).
// No allocation in the hot paths (move/groundAt/raycast/triggers use module scratch objects).

const CELL = 8;
const OFF = 2048;
const BIG = 96; // colliders larger than this (in x or z) go into the always-tested list
const HOLE = -1e8;

export function createPhysics(THREE, terrain) {
  const cells = new Map();      // key -> array of colliders
  const big = [];
  const byId = new Map();
  const triggers = [];
  let nextId = 1;
  let stamp = 1;
  const killY = { main: -60 };
  let frame = 0;

  function key(ix, iz) { return (ix + OFF) * 4096 + (iz + OFF); }

  function computeAabb(c) {
    if (c.type === 0) {
      const ca = Math.abs(c.cos), sa = Math.abs(c.sin);
      const ex = c.hx * ca + c.hz * sa, ez = c.hx * sa + c.hz * ca;
      c.minX = c.cx - ex; c.maxX = c.cx + ex; c.minZ = c.cz - ez; c.maxZ = c.cz + ez;
      c.minY = c.cy - c.hy; c.maxY = c.cy + c.hy;
    } else if (c.type === 1) {
      c.minX = c.cx - c.radius; c.maxX = c.cx + c.radius; c.minZ = c.cz - c.radius; c.maxZ = c.cz + c.radius;
      c.minY = c.cy; c.maxY = c.cy + c.height;
    } else {
      const hw = c.width * 0.5;
      c.minX = Math.min(c.ax, c.bx) - hw; c.maxX = Math.max(c.ax, c.bx) + hw;
      c.minZ = Math.min(c.az, c.bz) - hw; c.maxZ = Math.max(c.az, c.bz) + hw;
      c.minY = Math.min(c.ay, c.by) - 0.3; c.maxY = Math.max(c.ay, c.by);
    }
  }

  function insert(c) {
    computeAabb(c);
    if (c.maxX - c.minX > BIG || c.maxZ - c.minZ > BIG) { c.isBig = true; big.push(c); return; }
    c.isBig = false;
    const x0 = Math.floor(c.minX / CELL), x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL), z1 = Math.floor(c.maxZ / CELL);
    c.cx0 = x0; c.cx1 = x1; c.cz0 = z0; c.cz1 = z1;
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const k = key(ix, iz);
      let a = cells.get(k);
      if (!a) { a = []; cells.set(k, a); }
      a.push(c);
    }
  }

  function unindex(c) {
    if (c.isBig) { const i = big.indexOf(c); if (i >= 0) big.splice(i, 1); return; }
    for (let ix = c.cx0; ix <= c.cx1; ix++) for (let iz = c.cz0; iz <= c.cz1; iz++) {
      const a = cells.get(key(ix, iz));
      if (!a) continue;
      const i = a.indexOf(c);
      if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); }
    }
  }

  function base(type, o) {
    return {
      id: nextId++, type, tag: o.tag || "", enabled: true, walkable: o.walkable !== false,
      surface: o.surface || (type === 1 ? "wood" : "stone"),
      cx: 0, cy: 0, cz: 0, hx: 0, hy: 0, hz: 0, yaw: 0, cos: 1, sin: 0, radius: 0, height: 0,
      ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, width: 0, ux: 0, uz: 0, len: 0,
      minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0, cx0: 0, cx1: 0, cz0: 0, cz1: 0, isBig: false,
      stamp: 0, dx: 0, dy: 0, dz: 0, movedFrame: -1
    };
  }

  function addBox(o) {
    const c = base(0, o);
    c.cx = o.center.x; c.cy = o.center.y; c.cz = o.center.z;
    c.hx = Math.abs(o.size.x) * 0.5; c.hy = Math.abs(o.size.y) * 0.5; c.hz = Math.abs(o.size.z) * 0.5;
    c.yaw = o.yaw || 0; c.cos = Math.cos(c.yaw); c.sin = Math.sin(c.yaw);
    byId.set(c.id, c); insert(c);
    return c.id;
  }
  function addCylinder(o) {
    const c = base(1, o);
    c.cx = o.base.x; c.cy = o.base.y; c.cz = o.base.z; c.radius = o.radius; c.height = o.height;
    byId.set(c.id, c); insert(c);
    return c.id;
  }
  function setupRamp(c, f, t, w) {
    c.ax = f.x; c.ay = f.y; c.az = f.z; c.bx = t.x; c.by = t.y; c.bz = t.z; c.width = w;
    const dx = c.bx - c.ax, dz = c.bz - c.az;
    c.len = Math.hypot(dx, dz) || 1e-4;
    c.ux = dx / c.len; c.uz = dz / c.len;
    c.cx = (c.ax + c.bx) * 0.5; c.cy = (c.ay + c.by) * 0.5; c.cz = (c.az + c.bz) * 0.5;
  }
  function addRamp(o) {
    const c = base(2, o);
    setupRamp(c, o.from, o.to, o.width || 2);
    byId.set(c.id, c); insert(c);
    return c.id;
  }

  function move(id, center, yaw) {
    const c = byId.get(id);
    if (!c) return;
    unindex(c);
    if (c.movedFrame !== frame) { c.dx = 0; c.dy = 0; c.dz = 0; }
    if (c.type === 2) {
      const ox = center.x - c.cx, oy = center.y - c.cy, oz = center.z - c.cz;
      c.dx += ox; c.dy += oy; c.dz += oz;
      c.ax += ox; c.ay += oy; c.az += oz; c.bx += ox; c.by += oy; c.bz += oz;
      c.cx = center.x; c.cy = center.y; c.cz = center.z;
    } else {
      c.dx += center.x - c.cx; c.dy += center.y - c.cy; c.dz += center.z - c.cz;
      c.cx = center.x; c.cy = center.y; c.cz = center.z;
      if (c.type === 0 && yaw != null) { c.yaw = yaw; c.cos = Math.cos(yaw); c.sin = Math.sin(yaw); }
    }
    c.movedFrame = frame;
    insert(c);
  }
  function setEnabled(id, on) {
    const c = byId.get(id);
    if (c) { c.enabled = !!on; return; }
    for (let i = 0; i < triggers.length; i++) if (triggers[i].id === id) triggers[i].enabled = !!on;
  }
  function remove(id) {
    const c = byId.get(id);
    if (c) { unindex(c); byId.delete(id); return; }
    for (let i = triggers.length - 1; i >= 0; i--) if (triggers[i].id === id) triggers.splice(i, 1);
  }
  function clearTag(prefix) {
    const kill = [];
    for (const c of byId.values()) if (c.tag.startsWith(prefix)) kill.push(c.id);
    for (let i = 0; i < kill.length; i++) remove(kill[i]);
    for (let i = triggers.length - 1; i >= 0; i--) if ((triggers[i].tag || "").startsWith(prefix)) triggers.splice(i, 1);
  }

  // ---- triggers ---------------------------------------------------------------------------------------------
  function addTrigger(o) {
    const t = {
      id: nextId++, tag: o.tag || "", enabled: true, inside: false, once: !!o.once,
      cx: o.center.x, cy: o.center.y, cz: o.center.z,
      box: !!o.size, hx: o.size ? o.size.x * 0.5 : 0, hy: o.size ? o.size.y * 0.5 : (o.height || 4) * 0.5,
      hz: o.size ? o.size.z * 0.5 : 0, radius: o.radius || 2, onEnter: o.onEnter || null, onExit: o.onExit || null
    };
    if (o.center && typeof o.center.x === "number" && o.center.isVector3) t.live = o.center; // live positions allowed
    triggers.push(t);
    return t.id;
  }
  function updateTriggers(p) {
    // p = player feet; test the capsule's centre point
    const px = p.x, py = p.y + 0.9, pz = p.z;
    for (let i = 0; i < triggers.length; i++) {
      const t = triggers[i];
      if (!t.enabled) { if (t.inside) { t.inside = false; } continue; }
      if (t.live) { t.cx = t.live.x; t.cy = t.live.y; t.cz = t.live.z; }
      let inside;
      if (t.box) inside = Math.abs(px - t.cx) <= t.hx && Math.abs(py - t.cy) <= t.hy && Math.abs(pz - t.cz) <= t.hz;
      else {
        const dx = px - t.cx, dz = pz - t.cz;
        inside = dx * dx + dz * dz <= t.radius * t.radius && Math.abs(py - t.cy) <= t.hy;
      }
      if (inside !== t.inside) {
        t.inside = inside;
        const fn = inside ? t.onEnter : t.onExit;
        if (fn) { try { fn(); } catch (e) { console.warn("[physics] trigger", t.tag, e); } }
        if (inside && t.once) { triggers.splice(i, 1); i--; }
      }
    }
  }

  // ---- candidate gathering ----------------------------------------------------------------------------------
  const cand = [];
  function gather(minX, minZ, maxX, maxZ) {
    cand.length = 0;
    stamp++;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 600) {
      for (const c of byId.values()) if (c.enabled && c.maxX >= minX && c.minX <= maxX && c.maxZ >= minZ && c.minZ <= maxZ) cand.push(c);
      return cand;
    }
    for (let ix = x0; ix <= x1; ix++) for (let iz = z0; iz <= z1; iz++) {
      const a = cells.get(key(ix, iz));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const c = a[i];
        if (c.stamp === stamp || !c.enabled) continue;
        c.stamp = stamp;
        if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
        cand.push(c);
      }
    }
    for (let i = 0; i < big.length; i++) {
      const c = big[i];
      if (!c.enabled || c.stamp === stamp) continue;
      c.stamp = stamp;
      if (c.maxX < minX || c.minX > maxX || c.maxZ < minZ || c.minZ > maxZ) continue;
      cand.push(c);
    }
    return cand;
  }

  // top of a collider at (x,z) or -Infinity if (x,z) is outside its footprint
  function topAt(c, x, z) {
    if (c.type === 0) {
      const dx = x - c.cx, dz = z - c.cz;
      const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
      if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) return c.cy + c.hy;
      return -Infinity;
    }
    if (c.type === 1) {
      const dx = x - c.cx, dz = z - c.cz;
      return dx * dx + dz * dz <= c.radius * c.radius ? c.cy + c.height : -Infinity;
    }
    const rx = x - c.ax, rz = z - c.az;
    const t = rx * c.ux + rz * c.uz;
    if (t < -0.05 || t > c.len + 0.05) return -Infinity;
    const lat = Math.abs(-rx * c.uz + rz * c.ux);
    if (lat > c.width * 0.5) return -Infinity;
    const f = Math.max(0, Math.min(1, t / c.len));
    return c.ay + (c.by - c.ay) * f;
  }

  // ---- ground query -------------------------------------------------------------------------------------------
  const ground = { y: -1e9, surface: "grass", id: 0, terrain: false };
  function groundAt(x, z, yTop = 1e4, pad = 0) {
    ground.y = -1e9; ground.surface = "grass"; ground.id = 0; ground.terrain = false;
    const th = terrain.heightAt(x, z);
    if (th > HOLE && th <= yTop + 1e-3) { ground.y = th; ground.surface = terrain.surfaceAt(x, z); ground.terrain = true; }
    const cs = gather(x - pad - 0.01, z - pad - 0.01, x + pad + 0.01, z + pad + 0.01);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (!c.walkable) continue;
      let top = topAt(c, x, z);
      if (pad > 0) {
        const k = pad * 0.7;
        top = Math.max(top, topAt(c, x + k, z), topAt(c, x - k, z), topAt(c, x, z + k), topAt(c, x, z - k));
      }
      if (top > ground.y && top <= yTop + 1e-3) { ground.y = top; ground.surface = c.surface; ground.id = c.id; ground.terrain = false; }
    }
    return ground;
  }

  // ---- raycast ----------------------------------------------------------------------------------------------
  const hit = { point: new THREE.Vector3(), normal: new THREE.Vector3(), dist: 0, id: 0, tag: "" };
  let hBest, hId, hTag, hnx, hny, hnz;
  function consider(t, id, tag, nx, ny, nz) {
    if (t >= 0 && t < hBest) { hBest = t; hId = id; hTag = tag; hnx = nx; hny = ny; hnz = nz; }
  }
  function rayBox(c, ox, oy, oz, dx, dy, dz, maxD) {
    // to local
    const rx = ox - c.cx, rz = oz - c.cz;
    const lox = rx * c.cos - rz * c.sin, loz = rx * c.sin + rz * c.cos, loy = oy - c.cy;
    const ldx = dx * c.cos - dz * c.sin, ldz = dx * c.sin + dz * c.cos, ldy = dy;
    let tmin = -Infinity, tmax = Infinity, ax = 0, sgn = 0;
    // x
    if (Math.abs(ldx) < 1e-9) { if (Math.abs(lox) > c.hx) return; } else {
      let t1 = (-c.hx - lox) / ldx, t2 = (c.hx - lox) / ldx, s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; ax = 0; sgn = s; }
      if (t2 < tmax) tmax = t2;
    }
    if (Math.abs(ldy) < 1e-9) { if (Math.abs(loy) > c.hy) return; } else {
      let t1 = (-c.hy - loy) / ldy, t2 = (c.hy - loy) / ldy, s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; ax = 1; sgn = s; }
      if (t2 < tmax) tmax = t2;
    }
    if (Math.abs(ldz) < 1e-9) { if (Math.abs(loz) > c.hz) return; } else {
      let t1 = (-c.hz - loz) / ldz, t2 = (c.hz - loz) / ldz, s = -1;
      if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
      if (t1 > tmin) { tmin = t1; ax = 2; sgn = s; }
      if (t2 < tmax) tmax = t2;
    }
    if (tmax < tmin || tmax < 0 || tmin > maxD) return;
    if (tmin < 0) return; // origin inside: ignore (camera pivots inside props)
    // local normal -> world (inverse rotation)
    let lnx = ax === 0 ? sgn : 0, lny = ax === 1 ? sgn : 0, lnz = ax === 2 ? sgn : 0;
    const wnx = lnx * c.cos + lnz * c.sin, wnz = -lnx * c.sin + lnz * c.cos;
    consider(tmin, c.id, c.tag, wnx, lny, wnz);
  }
  function rayCyl(c, ox, oy, oz, dx, dy, dz, maxD) {
    const rx = ox - c.cx, rz = oz - c.cz;
    const a = dx * dx + dz * dz;
    if (a > 1e-9) {
      const b = 2 * (rx * dx + rz * dz), cc = rx * rx + rz * rz - c.radius * c.radius;
      const disc = b * b - 4 * a * cc;
      if (disc >= 0) {
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t >= 0 && t <= maxD) {
          const y = oy + dy * t;
          if (y >= c.cy && y <= c.cy + c.height) {
            const nx = (rx + dx * t) / c.radius, nz = (rz + dz * t) / c.radius;
            consider(t, c.id, c.tag, nx, 0, nz);
          }
        }
      }
    }
    if (Math.abs(dy) > 1e-9) {
      for (let s = 0; s < 2; s++) {
        const py = s === 0 ? c.cy + c.height : c.cy;
        const t = (py - oy) / dy;
        if (t < 0 || t > maxD) continue;
        const qx = rx + dx * t, qz = rz + dz * t;
        if (qx * qx + qz * qz <= c.radius * c.radius) consider(t, c.id, c.tag, 0, s === 0 ? 1 : -1, 0);
      }
    }
  }
  function rayRamp(c, ox, oy, oz, dx, dy, dz, maxD) {
    // plane through A with tangent u=(ux, slope, uz) and lateral l=(-uz,0,ux)
    const sy = (c.by - c.ay) / c.len;
    // normal = l x t  -> upward
    let nx = -c.ux * sy, ny = 1, nz = -c.uz * sy;
    const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
    const den = nx * dx + ny * dy + nz * dz;
    if (Math.abs(den) < 1e-9) return;
    const t = (nx * (c.ax - ox) + ny * (c.ay - oy) + nz * (c.az - oz)) / den;
    if (t < 0 || t > maxD) return;
    const px = ox + dx * t, pz = oz + dz * t;
    const rx = px - c.ax, rz = pz - c.az;
    const along = rx * c.ux + rz * c.uz, lat = Math.abs(-rx * c.uz + rz * c.ux);
    if (along < 0 || along > c.len || lat > c.width * 0.5) return;
    consider(t, c.id, c.tag, den < 0 ? nx : -nx, den < 0 ? ny : -ny, den < 0 ? nz : -nz);
  }
  const _tn = { x: 0, y: 1, z: 0 };
  function rayTerrain(ox, oy, oz, dx, dy, dz, maxD) {
    const step = maxD > 40 ? 1.5 : 0.5;
    let prevT = 0;
    let h0 = terrain.heightAt(ox, oz);
    let prevD = h0 > HOLE ? oy - h0 : 1e9;
    if (prevD < 0 && prevD > -1e8) return; // starts under terrain (cave): ignore terrain
    for (let t = step; t <= maxD + step; t += step) {
      const tt = Math.min(t, maxD);
      const x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
      const h = terrain.heightAt(x, z);
      const d = h > HOLE ? y - h : 1e9;
      if (d < 0 && prevD >= 0 && prevD < 1e8) {
        let a = prevT, b = tt;
        for (let k = 0; k < 8; k++) {
          const m = (a + b) * 0.5;
          const hm = terrain.heightAt(ox + dx * m, oz + dz * m);
          if (hm > HOLE && oy + dy * m - hm < 0) b = m; else a = m;
        }
        terrain.normalAt(ox + dx * b, oz + dz * b, _tn);
        consider(b, 0, "terrain", _tn.x, _tn.y, _tn.z);
        return;
      }
      prevD = d; prevT = tt;
      if (tt >= maxD) break;
    }
  }
  function raycast(origin, dir, maxDist, mask) {
    const ox = origin.x, oy = origin.y, oz = origin.z;
    let dx = dir.x, dy = dir.y, dz = dir.z;
    const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    hBest = Infinity; hId = 0; hTag = "";
    const ex = ox + dx * maxDist, ez = oz + dz * maxDist;
    const cs = gather(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez));
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (mask && !c.tag.startsWith(mask)) continue;
      if (c.type === 0) rayBox(c, ox, oy, oz, dx, dy, dz, maxDist);
      else if (c.type === 1) rayCyl(c, ox, oy, oz, dx, dy, dz, maxDist);
      else rayRamp(c, ox, oy, oz, dx, dy, dz, maxDist);
    }
    if (!mask || "terrain".startsWith(mask)) rayTerrain(ox, oy, oz, dx, dy, dz, Math.min(maxDist, hBest));
    if (hBest === Infinity) return null;
    hit.dist = hBest; hit.id = hId; hit.tag = hTag;
    hit.point.set(ox + dx * hBest, oy + dy * hBest, oz + dz * hBest);
    hit.normal.set(hnx, hny, hnz);
    return hit;
  }

  // ---- character capsule move -------------------------------------------------------------------------------
  // s = { pos:Vector3 (feet), vel:Vector3, onGround, groundId, groundSurface, radius, height, stepUp, steep:{x,z} }
  const _n2 = { x: 0, y: 1, z: 0 };
  function pushWalls(s, stepAllowed) {
    const r = s.radius, p = s.pos;
    const feet = p.y, head = p.y + s.height;
    const cs = gather(p.x - r - 0.05, p.z - r - 0.05, p.x + r + 0.05, p.z + r + 0.05);
    let any = false;
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.type === 2) continue; // ramps are floors
      const top = c.maxY, bottom = c.minY;
      if (bottom >= head - 0.05) continue;
      const allowed = c.walkable ? stepAllowed : 0.05;
      if (top <= feet + allowed) continue;
      if (c.type === 0) {
        const dx = p.x - c.cx, dz = p.z - c.cz;
        const lx = dx * c.cos - dz * c.sin, lz = dx * c.sin + dz * c.cos;
        const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
        let ddx = lx - qx, ddz = lz - qz;
        let d2 = ddx * ddx + ddz * ddz;
        if (d2 >= r * r) continue;
        let nx, nz, push;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2); nx = ddx / d; nz = ddz / d; push = r - d;
        } else {
          // centre inside the box: leave by the shallowest side
          const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz);
          if (px < pz) { nx = lx < 0 ? -1 : 1; nz = 0; push = px + r; } else { nx = 0; nz = lz < 0 ? -1 : 1; push = pz + r; }
        }
        // back to world
        const wx = nx * c.cos + nz * c.sin, wz = -nx * c.sin + nz * c.cos;
        p.x += wx * push; p.z += wz * push;
        const vn = s.vel.x * wx + s.vel.z * wz;
        if (vn < 0) { s.vel.x -= wx * vn; s.vel.z -= wz * vn; }
        any = true;
      } else {
        const dx = p.x - c.cx, dz = p.z - c.cz;
        const rr = r + c.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const nx = dx / d, nz = dz / d;
        p.x += nx * (rr - d); p.z += nz * (rr - d);
        const vn = s.vel.x * nx + s.vel.z * nz;
        if (vn < 0) { s.vel.x -= nx * vn; s.vel.z -= nz * vn; }
        any = true;
      }
    }
    return any;
  }

  function ceiling(s, prevFeet) {
    const r = s.radius * 0.7, p = s.pos;
    const cs = gather(p.x - r, p.z - r, p.x + r, p.z + r);
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i];
      if (c.type === 2) continue;
      const bottom = c.minY;
      if (bottom < prevFeet + s.height - 0.05) continue;
      if (bottom > p.y + s.height) continue;
      if (topAt(c, p.x, p.z) === -Infinity && topAt(c, p.x + r, p.z) === -Infinity && topAt(c, p.x - r, p.z) === -Infinity &&
          topAt(c, p.x, p.z + r) === -Infinity && topAt(c, p.x, p.z - r) === -Infinity) continue;
      p.y = bottom - s.height;
      if (s.vel.y > 0) s.vel.y = 0;
    }
  }

  function moveCapsule(s, dt) {
    const p = s.pos;
    const wasGround = s.onGround;
    const stepAllowed = wasGround ? s.stepUp : 0.08;
    // horizontal, sub-divided
    const mx = s.vel.x * dt, mz = s.vel.z * dt;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(mx), Math.abs(mz)) / 0.22));
    for (let k = 0; k < n; k++) {
      const ox = p.x, oz = p.z;
      p.x += mx / n; p.z += mz / n;
      // steep terrain acts as a wall when going up more than a step
      const th = terrain.heightAt(p.x, p.z);
      if (th > HOLE && th > p.y + stepAllowed && th < p.y + s.height + 2) {
        terrain.normalAt(p.x, p.z, _n2);
        if (_n2.y < 0.72) { p.x = ox; p.z = oz; }
      }
      pushWalls(s, stepAllowed);
      pushWalls(s, stepAllowed);
    }
    // vertical
    const prevFeet = p.y;
    p.y += s.vel.y * dt;
    if (s.vel.y > 0) ceiling(s, prevFeet);
    // ground probe: highest walkable surface below the step height above where the feet were
    const yTop = Math.max(prevFeet, p.y) + (wasGround ? s.stepUp : 0.08);
    const g = groundAt(p.x, p.z, yTop, s.radius);
    s.onGround = false;
    s.steep = false;
    const snap = wasGround && s.vel.y <= 0.01 ? 0.45 : 0;
    if (g.y > -1e8 && s.vel.y <= 0.01 && p.y <= g.y + snap + 1e-3) {
      let walk = true;
      if (g.terrain) {
        terrain.normalAt(p.x, p.z, _n2);
        if (_n2.y < 0.7) {
          walk = false;
          // slide down steep terrain
          s.steep = true;
          s.vel.x += _n2.x * 14 * dt; s.vel.z += _n2.z * 14 * dt;
          p.y = Math.max(p.y, g.y);
        }
      }
      if (walk) {
        p.y = g.y;
        s.onGround = true;
        s.groundId = g.id;
        s.groundSurface = g.surface;
        if (s.vel.y < 0) { s.landSpeed = -s.vel.y; s.vel.y = 0; }
      }
    } else if (g.terrain === false && g.y > -1e8 && p.y < g.y && s.vel.y > 0 && p.y > g.y - 0.3) {
      // rising through a thin walkable top: allow
    }
    // never sink into terrain that is near the feet
    const th = terrain.heightAt(p.x, p.z);
    if (th > HOLE && p.y < th && th - p.y < 2.5 && th <= yTop + 2.5) {
      p.y = th;
      if (!s.onGround) {
        terrain.normalAt(p.x, p.z, _n2);
        if (_n2.y >= 0.7) { s.onGround = true; s.groundId = 0; s.groundSurface = terrain.surfaceAt(p.x, p.z); if (s.vel.y < 0) { s.landSpeed = -s.vel.y; s.vel.y = 0; } }
        else if (s.vel.y < 0) s.vel.y *= 0.5;
      }
    }
    if (!s.onGround) s.groundId = -1;
  }

  function colliderMoved(id) {
    const c = byId.get(id);
    return c && c.movedFrame === frame ? c : null;
  }

  return {
    addBox, addCylinder, addRamp, move, setEnabled, remove, addTrigger, raycast, groundAt, clearTag,
    setKillY(region, y) { killY[region] = y; },
    killY(region) { return killY[region] != null ? killY[region] : -40; },
    updateTriggers, moveCapsule, colliderMoved,
    get(id) { return byId.get(id) || null; },
    nextFrame() { frame++; },
    get frame() { return frame; },
    get count() { return byId.size; },
    get triggerCount() { return triggers.length; },
    _topAt: topAt
  };
}
