// src/games/pighide/scripts/fx.js - PIG HIDE's local visual effects (spec 27 §2.5).
//
// Pure visuals: no wire, no hits, no sounds, no colliders. Everything hangs off ONE group
// added through parts.addCustom, every geometry is shared and created once, and every
// per-effect material is disposed when the effect ends. A hard cap on live effects keeps the
// draw-call budget honest even when a Speedy Pig trails dust for five seconds.
//
// House rules: sim time only (update(dt)), no banned timer identifiers, lower-case hex.

const MAX_LIVE = 70;
const GRAVITY = 40;

export function createFx(ctx) {
  const THREE = ctx.engine.THREE;
  const parts = ctx.engine.parts;

  const root = new THREE.Group();
  root.name = "PHFx";
  let rootId = null;
  try { rootId = parts.addCustom(root); } catch { rootId = null; ctx.engine.scene.add(root); }

  const G = {
    sphere: new THREE.SphereGeometry(1, 14, 10),
    lowSphere: new THREE.IcosahedronGeometry(1, 0),
    box: new THREE.BoxGeometry(1, 1, 1),
    ring: new THREE.RingGeometry(0.82, 1, 40),
    arc: new THREE.RingGeometry(1.4, 2.6, 24, 1, -1.05, 2.1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 8),
    cone: new THREE.ConeGeometry(1, 1, 10),
    gem: new THREE.OctahedronGeometry(1, 0),
  };

  const live = [];      // { obj, mats: [], t, life, tick(e, k, dt) }
  const rockets = [];   // handles
  const bombs = new Set();
  let animT = 0;
  let disposed = false;

  function basic(color, opts = {}) {
    return new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: opts.opacity ?? 1,
      depthWrite: false,
      blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      side: opts.double ? THREE.DoubleSide : THREE.FrontSide,
    });
  }

  function mesh(geo, mat) {
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    return m;
  }

  function endEffect(e) {
    if (e.obj.parent) e.obj.parent.remove(e.obj);
    for (const m of e.mats) m.dispose();
    e.mats.length = 0;
  }

  function push(obj, mats, life, tick) {
    if (disposed) { for (const m of mats) m.dispose(); return null; }
    while (live.length >= MAX_LIVE) { const old = live.shift(); endEffect(old); if (old.onEnd) old.onEnd(); }
    root.add(obj);
    const e = { obj, mats, t: 0, life, tick };
    live.push(e);
    return e;
  }

  const v3 = (p) => new THREE.Vector3(p[0] || 0, p[1] || 0, p[2] || 0);
  const ok3 = (p) => Array.isArray(p) && p.length >= 3 && p.every(Number.isFinite);

  // ---- explosion: fireball + core flash + shock ring + debris + smoke -------------------
  function explosion(p, radius) {
    if (!ok3(p)) return;
    const r = Number.isFinite(radius) && radius > 0 ? radius : 10;
    const g = new THREE.Group();
    g.position.copy(v3(p));
    const fireM = basic("#ff7a1a", { additive: true });
    const coreM = basic("#fff2b0", { additive: true });
    const ringM = basic("#ffd36f", { additive: true, double: true });
    const smokeM = basic("#4a4040", { opacity: 0.6 });
    const debrisM = basic("#3a2a1a");
    const fire = mesh(G.sphere, fireM);
    const core = mesh(G.sphere, coreM);
    const ring = mesh(G.ring, ringM);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    const smoke = mesh(G.lowSphere, smokeM);
    g.add(fire, core, ring, smoke);
    const debris = [];
    for (let i = 0; i < 10; i++) {
      const d = mesh(G.box, debrisM);
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.4;
      const sp = 0.6 * r + Math.random() * 0.5 * r;
      d.userData.v = [Math.cos(a) * sp, 10 + Math.random() * 14, Math.sin(a) * sp];
      d.scale.setScalar(0.3 + Math.random() * 0.4);
      d.position.set(0, 1, 0);
      debris.push(d);
      g.add(d);
    }
    push(g, [fireM, coreM, ringM, smokeM, debrisM], 1.1, (e, k, dt) => {
      const fk = Math.min(1, k / 0.55);
      fire.scale.setScalar(0.2 * r + 0.55 * r * Math.sqrt(fk));
      fireM.opacity = Math.max(0, 0.95 * (1 - fk));
      fireM.color.setHSL(0.08 - 0.06 * fk, 1, 0.55 - 0.25 * fk);
      core.scale.setScalar(0.15 * r * (1 - Math.min(1, k / 0.3)) + 0.01);
      coreM.opacity = Math.max(0, 1 - k / 0.3);
      ring.scale.setScalar(0.2 * r + 1.0 * r * Math.min(1, k / 0.7));
      ringM.opacity = Math.max(0, 0.9 * (1 - k / 0.7));
      smoke.scale.setScalar(0.3 * r * (0.4 + k));
      smoke.position.y = 1 + k * 6;
      smokeM.opacity = Math.max(0, 0.55 * (1 - k));
      for (const d of debris) {
        const v = d.userData.v;
        v[1] -= GRAVITY * dt;
        d.position.x += v[0] * dt;
        d.position.y = Math.max(0.1, d.position.y + v[1] * dt);
        d.position.z += v[2] * dt;
        d.rotation.x += dt * 8;
        d.rotation.z += dt * 6;
      }
      debrisM.opacity = Math.max(0, 1 - Math.max(0, k - 0.6) / 0.4);
    });
  }

  // ---- tracer: a glowing pellet streak, 0.12 s --------------------------------------------
  function tracer(from, to, color) {
    if (!ok3(from) || !ok3(to)) return;
    const a = v3(from), b = v3(to);
    const len = a.distanceTo(b);
    if (len < 0.01) return;
    const m = basic(color || "#ffb21a", { additive: true });
    const t = mesh(G.cyl, m);
    t.scale.set(0.09, len, 0.09);
    t.position.copy(a).add(b).multiplyScalar(0.5);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    const g = new THREE.Group();
    g.add(t);
    const pellet = mesh(G.sphere, m);
    pellet.scale.setScalar(0.25);
    pellet.position.copy(b);
    g.add(pellet);
    push(g, [m], 0.12, (e, k) => { m.opacity = 1 - k; t.scale.x = t.scale.z = 0.09 * (1 - k * 0.5); });
  }

  // ---- melee swoosh: a fading arc, 0.2 s --------------------------------------------------
  function swoosh(p, yaw, color) {
    if (!ok3(p)) return;
    const m = basic(color || "#ffffff", { additive: true, double: true, opacity: 0.8 });
    const arc = mesh(G.arc, m);
    arc.rotation.x = -Math.PI / 2;
    const g = new THREE.Group();
    g.position.copy(v3(p));
    g.rotation.y = (Number.isFinite(yaw) ? yaw : 0) - Math.PI / 2;
    g.add(arc);
    push(g, [m], 0.2, (e, k) => {
      m.opacity = 0.8 * (1 - k);
      arc.rotation.z = -0.9 + k * 1.8;
      const s = 0.8 + 0.4 * k;
      arc.scale.set(s, s, s);
    });
  }

  // ---- dust: little puffs (ability starts, trails) ---------------------------------------
  function dust(p) {
    if (!ok3(p)) return;
    const m = basic("#d8cfbc", { opacity: 0.7 });
    const g = new THREE.Group();
    g.position.copy(v3(p));
    const puffs = [];
    for (let i = 0; i < 4; i++) {
      const s = mesh(G.lowSphere, m);
      const a = Math.random() * Math.PI * 2;
      s.userData.v = [Math.cos(a) * 3, 1.5 + Math.random() * 1.5, Math.sin(a) * 3];
      s.position.set(0, 0.3, 0);
      s.scale.setScalar(0.35);
      puffs.push(s);
      g.add(s);
    }
    push(g, [m], 0.6, (e, k, dt) => {
      for (const s of puffs) {
        const v = s.userData.v;
        s.position.x += v[0] * dt;
        s.position.y += v[1] * dt;
        s.position.z += v[2] * dt;
        s.scale.setScalar(0.35 + 0.7 * k);
      }
      m.opacity = 0.7 * (1 - k);
    });
  }

  // ---- sparkle: spinning gems rising ------------------------------------------------------
  function sparkle(p, color) {
    if (!ok3(p)) return;
    const m = basic(color || "#fff4b0", { additive: true });
    const g = new THREE.Group();
    g.position.copy(v3(p));
    const gems = [];
    for (let i = 0; i < 8; i++) {
      const s = mesh(G.gem, m);
      const a = (i / 8) * Math.PI * 2;
      s.userData.a = a;
      s.userData.r = 0.8 + Math.random() * 0.8;
      s.userData.vy = 2 + Math.random() * 3;
      s.scale.setScalar(0.18);
      gems.push(s);
      g.add(s);
    }
    push(g, [m], 0.8, (e, k) => {
      for (const s of gems) {
        const a = s.userData.a + k * 3;
        const r = s.userData.r * (0.6 + k);
        s.position.set(Math.cos(a) * r, 0.5 + s.userData.vy * k * 1.5, Math.sin(a) * r);
        s.rotation.y = k * 12;
        s.scale.setScalar(0.18 * (1 - k * 0.6));
      }
      m.opacity = 1 - k * k;
    });
  }

  // ---- rocket: visual flight only (hunters.js simulates the hit) -------------------------
  function rocket(from, dir, speed, maxDist, onDone) {
    if (!ok3(from) || !ok3(dir) || disposed) return null;
    const d = v3(dir);
    if (d.lengthSq() < 1e-6) return null;
    d.normalize();
    const bodyM = new THREE.MeshStandardMaterial({ color: "#5d626c", roughness: 0.5, metalness: 0.6 });
    const noseM = new THREE.MeshStandardMaterial({ color: "#d94f4f", roughness: 0.5, metalness: 0.2 });
    const flameM = basic("#ffb21a", { additive: true });
    const smokeM = basic("#b6b0a4", { opacity: 0.5 });
    const g = new THREE.Group();
    const inner = new THREE.Group();
    inner.rotation.x = Math.PI / 2;   // the cylinder's +Y axis points along local +Z
    g.add(inner);
    const body = mesh(G.cyl, bodyM); body.scale.set(0.22, 1.3, 0.22); inner.add(body);
    const nose = mesh(G.cone, noseM); nose.scale.set(0.22, 0.45, 0.22); nose.position.y = 0.87; inner.add(nose);
    for (let i = 0; i < 4; i++) {
      const fin = mesh(G.box, noseM);
      fin.scale.set(0.04, 0.35, 0.3);
      fin.position.set(0, -0.5, 0);
      fin.rotation.y = (i * Math.PI) / 2;
      fin.translateZ(0.22);
      inner.add(fin);
    }
    const flame = mesh(G.cone, flameM); flame.scale.set(0.2, 0.8, 0.2); flame.position.y = -1.05; flame.rotation.x = Math.PI; inner.add(flame);
    g.position.copy(v3(from));
    g.lookAt(g.position.clone().add(d));
    root.add(g);
    const h = {
      g, d, speed: Number.isFinite(speed) && speed > 0 ? speed : 90,
      max: Number.isFinite(maxDist) && maxDist > 0 ? maxDist : 140,
      travelled: 0, smokeT: 0, done: false, onDone,
      mats: [bodyM, noseM, flameM, smokeM], smokeM,
      stop() { finishRocket(h, false); },
    };
    rockets.push(h);
    return h;
  }

  function finishRocket(h, natural) {
    if (h.done) return;
    h.done = true;
    if (h.g.parent) h.g.parent.remove(h.g);
    for (const m of h.mats) if (m !== h.smokeM) m.dispose();
    // the smoke material stays alive until its puffs fade; puffs own a ref
    h.smokeOwned = true;
    const i = rockets.indexOf(h);
    if (i >= 0) rockets.splice(i, 1);
    if (natural && typeof h.onDone === "function") {
      const p = h.g.position;
      try { h.onDone([p.x, p.y, p.z]); } catch { /* visual only */ }
    }
    if (!h.smokeLive) h.smokeM.dispose();
  }

  function tickRockets(dt) {
    for (const h of rockets.slice()) {
      const step = h.speed * dt;
      h.g.position.addScaledVector(h.d, step);
      h.travelled += step;
      h.smokeT -= dt;
      if (h.smokeT <= 0) {
        h.smokeT = 0.04;
        const m = h.smokeM;
        const s = mesh(G.lowSphere, m);
        s.position.copy(h.g.position).addScaledVector(h.d, -1.2);
        s.scale.setScalar(0.3);
        h.smokeLive = (h.smokeLive || 0) + 1;
        const e = push(s, [], 0.7, (e2, k) => { s.scale.setScalar(0.3 + 1.1 * k); });
        if (e) {
          e.onEnd = () => {
            h.smokeLive -= 1;
            if (h.done && h.smokeLive <= 0) m.dispose();
          };
        } else h.smokeLive -= 1;
      }
      const fl = h.g.children[0].children.find((c) => c.material === h.mats[2]);
      if (fl) fl.scale.y = 0.6 + Math.random() * 0.5;
      if (h.travelled >= h.max) finishRocket(h, true);
    }
  }

  // ---- bomb model: black sphere, red band, sparking fuse ----------------------------------
  function bombModel() {
    const g = new THREE.Group();
    g.name = "PHBomb";
    const blk = new THREE.MeshStandardMaterial({ color: "#2b2b2b", roughness: 0.4, metalness: 0.3 });
    const band = new THREE.MeshStandardMaterial({ color: "#d94f4f", roughness: 0.5, emissive: "#d94f4f", emissiveIntensity: 0.3 });
    const cord = new THREE.MeshStandardMaterial({ color: "#7a4a2a", roughness: 0.8 });
    const spark = new THREE.MeshBasicMaterial({ color: "#ffd36f", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const body = mesh(new THREE.SphereGeometry(0.65, 18, 14), blk); body.position.y = 0.65; g.add(body);
    const ring = mesh(new THREE.TorusGeometry(0.66, 0.08, 8, 24), band); ring.position.y = 0.65; ring.rotation.x = Math.PI / 2; g.add(ring);
    const cap = mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.2, 10), blk); cap.position.y = 1.32; g.add(cap);
    const fuse = mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.45, 6), cord); fuse.position.set(0.06, 1.6, 0); fuse.rotation.z = -0.3; g.add(fuse);
    const tip = mesh(new THREE.SphereGeometry(0.14, 8, 6), spark); tip.position.set(0.14, 1.84, 0); g.add(tip);
    const glint = mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5 }));
    glint.position.set(-0.25, 0.95, 0.42); g.add(glint);
    g.userData.fxBomb = { tip, body, born: animT };
    bombs.add(g);
    return g;
  }

  function tickBombs() {
    for (const g of Array.from(bombs)) {
      const b = g.userData.fxBomb;
      if (!g.parent) {
        // Never attached after a second, or detached by its owner: forget it (the owner disposes).
        if (animT - b.born > 1) bombs.delete(g);
        continue;
      }
      const age = animT - b.born;
      const rate = 8 + Math.min(5, age) * 6;
      const pulse = Math.max(0, Math.sin(age * rate));
      b.tip.scale.setScalar(0.8 + 0.9 * pulse);
      b.body.scale.setScalar(1 + 0.06 * pulse * Math.min(1, age / 4));
    }
  }

  // ---------------------------------------------------------------------------------------

  function update(dt) {
    if (disposed) return;
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 0;
    animT += step;
    for (let i = live.length - 1; i >= 0; i--) {
      const e = live[i];
      e.t += step;
      const k = Math.min(1, e.t / e.life);
      try { e.tick(e, k, step); } catch { /* visual only */ }
      if (e.t >= e.life) {
        live.splice(i, 1);
        endEffect(e);
        if (e.onEnd) e.onEnd();
      }
    }
    tickRockets(step);
    tickBombs();
  }

  function dispose() {
    if (disposed) return;
    for (const h of rockets.slice()) finishRocket(h, false);
    for (const e of live.splice(0)) { endEffect(e); if (e.onEnd) e.onEnd(); }
    for (const h of rockets) h.smokeM.dispose();
    bombs.clear();
    disposed = true;
    if (rootId != null) { try { parts.remove(rootId); } catch { /* gone */ } }
    if (root.parent) root.parent.remove(root);
    for (const k of Object.keys(G)) G[k].dispose();
  }

  return {
    update, explosion, tracer, rocket, swoosh, dust, sparkle, bombModel, dispose,
    liveCount: () => live.length + rockets.length,
  };
}
