// fx.js - COMBAT effects: one pooled particle system, telegraph decals, jumpable shockwave rings,
// pooled projectiles, fire / poison patches, fissure lines. Everything allocated at init, reused.

const RED = 0xc0141c;

export function createFx(ctx, hooks) {
  const THREE = ctx.THREE;
  const engine = ctx.engine;
  const scene = ctx.scene || engine.scene;
  const root = new THREE.Group();
  root.name = "combat.fx";
  scene.add(root);

  const tmpV = new THREE.Vector3();
  const tmpC = new THREE.Color();

  function groundY(x, z, yHint) {
    try {
      const g = engine.physics && engine.physics.groundAt(x, z, yHint + 2.5);
      if (g && g.y > -1e8) return g.y;
    } catch (e) { /* ignore */ }
    return yHint;
  }
  function playerPos() { return engine.player.position; }
  function playerGrounded() {
    const p = engine.player;
    if (p.onGround) return true;
    const gy = groundY(p.position.x, p.position.z, p.position.y);
    return p.position.y - gy < 0.35;
  }

  // ------------------------------------------------------------------ particles
  const MAXP = 2000;
  const pPos = new Float32Array(MAXP * 3);
  const pCol = new Float32Array(MAXP * 4);
  const pSize = new Float32Array(MAXP);
  const pVel = new Float32Array(MAXP * 3);
  const pLife = new Float32Array(MAXP);
  const pMax = new Float32Array(MAXP);
  const pGrav = new Float32Array(MAXP);
  const pDrag = new Float32Array(MAXP);
  const pA0 = new Float32Array(MAXP);
  const pGeo = new THREE.BufferGeometry();
  const aPos = new THREE.BufferAttribute(pPos, 3); aPos.setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.BufferAttribute(pCol, 4); aCol.setUsage(THREE.DynamicDrawUsage);
  const aSize = new THREE.BufferAttribute(pSize, 1); aSize.setUsage(THREE.DynamicDrawUsage);
  pGeo.setAttribute("position", aPos);
  pGeo.setAttribute("color", aCol);
  pGeo.setAttribute("size", aSize);
  pGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const pUniforms = { uScale: { value: 400 } };
  const pMat = new THREE.ShaderMaterial({
    uniforms: pUniforms,
    vertexShader: `
      attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale;
      void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0);
        vC.a *= smoothstep(0.5, 1.8, -mv.z);   // fade out right in front of the lens (no screen-filling blobs)
        gl_PointSize = clamp(size * uScale / max(0.1, -mv.z), 0.0, 64.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      varying vec4 vC;
      void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d,d); if (r > 0.25) discard;
        float a = vC.a * smoothstep(0.25, 0.05, r); gl_FragColor = vec4(vC.rgb, a); }`,
    transparent: true, depthWrite: false,
  });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  root.add(points);
  let pHead = 0, pHigh = 0, pAlive = 0;

  const PTYPES = {
    spark:  { col: 0xfff2c8, size: 0.06, life: 0.35, speed: 5, grav: 9, drag: 2, up: 1.5, a: 1 },
    dust:   { col: 0xb8a68a, size: 0.22, life: 0.9, speed: 1.2, grav: -0.3, drag: 2.5, up: 0.6, a: 0.45 },
    crumbs: { col: 0xf2c84a, size: 0.07, life: 0.8, speed: 3.5, grav: 12, drag: 1, up: 2.5, a: 1 },
    fumes:  { col: 0x7fa84a, size: 0.3, life: 1.4, speed: 0.5, grav: -0.8, drag: 1.5, up: 0.6, a: 0.35 },
    ink:    { col: 0x08060c, size: 0.18, life: 0.9, speed: 2.5, grav: 4, drag: 1.5, up: 1.2, a: 0.85 },
    gold:   { col: 0xffd36a, size: 0.08, life: 0.9, speed: 2.5, grav: 3, drag: 1, up: 2, a: 1 },
    flies:  { col: 0x101010, size: 0.035, life: 2.5, speed: 1.0, grav: 0, drag: 0.1, up: 0.3, a: 1, jitter: 6 },
    straw:  { col: 0xd9b86a, size: 0.06, life: 1.6, speed: 1.2, grav: 2, drag: 1.2, up: 0.8, a: 1 },
    rust:   { col: 0x9a4a22, size: 0.05, life: 0.9, speed: 2, grav: 8, drag: 1, up: 1, a: 1 },
    mold:   { col: 0x6f9a3a, size: 0.09, life: 1.0, speed: 1.5, grav: 3, drag: 1, up: 1, a: 0.9 },
    ember:  { col: 0xff8a2a, size: 0.07, life: 0.9, speed: 1.0, grav: -2.5, drag: 0.8, up: 1.4, a: 1 },
    smoke:  { col: 0x3a3632, size: 0.45, life: 1.6, speed: 0.6, grav: -0.9, drag: 1.2, up: 0.7, a: 0.35 },
    bolt:   { col: 0xbfe6ff, size: 0.12, life: 0.35, speed: 0.6, grav: 0, drag: 2, up: 0, a: 0.9 },
    shadow: { col: 0x2a1036, size: 0.2, life: 0.6, speed: 0.8, grav: -0.5, drag: 1.5, up: 0.5, a: 0.8 },
    level:  { col: 0xffd84a, size: 0.09, life: 1.1, speed: 2.2, grav: -1.5, drag: 1.2, up: 2.5, a: 1 },
    hair:   { col: 0x8a7a64, size: 0.07, life: 1.2, speed: 1.5, grav: 4, drag: 1.5, up: 1, a: 1 },
    milk:   { col: 0xf4f2e6, size: 0.06, life: 0.8, speed: 0.4, grav: 7, drag: 0.5, up: 0, a: 0.9 },
    cardboard: { col: 0x9a7a4e, size: 0.06, life: 0.9, speed: 1.6, grav: 8, drag: 1, up: 1, a: 1 },
  };
  for (const k in PTYPES) { const t = PTYPES[k]; const c = new THREE.Color(t.col); t.r = c.r; t.g = c.g; t.b = c.b; }

  function budget() {
    const q = engine.quality ? engine.quality.level : 1;
    return q <= 0 ? 200 : q === 1 ? 800 : q === 2 ? 1500 : 2000;
  }

  // emit n particles of a type at (x,y,z). dirx/diry/dirz optional bias direction.
  function burst(type, x, y, z, n, spread = 0.2, dirx = 0, diry = 0, dirz = 0) {
    const t = PTYPES[type] || PTYPES.spark;
    const lim = budget();
    const q = engine.quality ? engine.quality.level : 1;
    if (q <= 0) n = Math.ceil(n * 0.4);
    for (let i = 0; i < n; i++) {
      if (pAlive >= lim) return;
      const k = pHead; pHead = (pHead + 1) % lim;
      if (pLife[k] <= 0) pAlive++;
      if (k + 1 > pHigh) pHigh = k + 1;
      const k3 = k * 3, k4 = k * 4;
      pPos[k3] = x + (Math.random() - 0.5) * spread * 2;
      pPos[k3 + 1] = y + (Math.random() - 0.5) * spread;
      pPos[k3 + 2] = z + (Math.random() - 0.5) * spread * 2;
      const s = t.speed * (0.4 + Math.random() * 0.8);
      pVel[k3] = (Math.random() - 0.5) * 2 * s + dirx * t.speed;
      pVel[k3 + 1] = Math.random() * t.up + diry * t.speed;
      pVel[k3 + 2] = (Math.random() - 0.5) * 2 * s + dirz * t.speed;
      const shade = 0.85 + Math.random() * 0.3;
      pCol[k4] = Math.min(1, t.r * shade); pCol[k4 + 1] = Math.min(1, t.g * shade); pCol[k4 + 2] = Math.min(1, t.b * shade);
      pCol[k4 + 3] = t.a;
      pA0[k] = t.a;
      pSize[k] = t.size * (0.7 + Math.random() * 0.6);
      pLife[k] = pMax[k] = t.life * (0.7 + Math.random() * 0.6);
      pGrav[k] = t.grav; pDrag[k] = t.drag + (t.jitter ? 0 : 0);
      if (t.jitter) pDrag[k] = -t.jitter; // negative drag = jitter flag (flies)
    }
  }

  function updateParticles(dt) {
    if (!pAlive) { if (pHigh) { pHigh = 0; pGeo.setDrawRange(0, 0); } return; }
    let alive = 0;
    for (let k = 0; k < pHigh; k++) {
      if (pLife[k] <= 0) continue;
      pLife[k] -= dt;
      const k3 = k * 3, k4 = k * 4;
      if (pLife[k] <= 0) { pCol[k4 + 3] = 0; continue; }
      alive++;
      const d = pDrag[k];
      if (d < 0) {
        // flies: buzz around their spawn area
        pVel[k3] += (Math.random() - 0.5) * -d * dt * 6;
        pVel[k3 + 1] += (Math.random() - 0.5) * -d * dt * 6;
        pVel[k3 + 2] += (Math.random() - 0.5) * -d * dt * 6;
        const damp = 1 - Math.min(1, 2.5 * dt);
        pVel[k3] *= damp; pVel[k3 + 1] *= damp; pVel[k3 + 2] *= damp;
      } else {
        const damp = 1 - Math.min(1, d * dt);
        pVel[k3] *= damp; pVel[k3 + 2] *= damp; pVel[k3 + 1] *= (1 - Math.min(1, d * 0.3 * dt));
        pVel[k3 + 1] -= pGrav[k] * dt;
      }
      pPos[k3] += pVel[k3] * dt; pPos[k3 + 1] += pVel[k3 + 1] * dt; pPos[k3 + 2] += pVel[k3 + 2] * dt;
      const f = pLife[k] / pMax[k];
      pCol[k4 + 3] = pA0[k] * (f < 0.35 ? f / 0.35 : 1);
    }
    pAlive = alive;
    pGeo.setDrawRange(0, pHigh);
    aPos.needsUpdate = true; aCol.needsUpdate = true; aSize.needsUpdate = true;
    const h = (ctx.renderer && ctx.renderer.domElement) ? ctx.renderer.domElement.height : 720;
    const cam = ctx.camera;
    const fov = cam && cam.fov ? cam.fov : 60;
    pUniforms.uScale.value = h * 0.5 / Math.tan(fov * Math.PI / 360);
  }

  // ------------------------------------------------------------------ decals (telegraphs)
  const circleGeo = new THREE.CircleGeometry(1, 48); circleGeo.rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(0.9, 1, 64); ringGeo.rotateX(-Math.PI / 2);
  const lineGeo = new THREE.PlaneGeometry(1, 1); lineGeo.rotateX(-Math.PI / 2); lineGeo.translate(0, 0, 0.5);
  const NDEC = 28;
  const decals = [];
  function decalMat() {
    return new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.4, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: true });
  }
  for (let i = 0; i < NDEC; i++) {
    const g = new THREE.Group();
    const fill = new THREE.Mesh(circleGeo, decalMat());
    const ring = new THREE.Mesh(ringGeo, decalMat());
    const line = new THREE.Mesh(lineGeo, decalMat());
    fill.renderOrder = ring.renderOrder = line.renderOrder = 3;
    g.add(fill, ring, line);
    g.visible = false;
    root.add(g);
    decals.push({ g, fill, ring, line, t: 0, dur: 0, type: "", r: 1, w: 1, len: 1, active: false, follow: null, grow: 0 });
  }
  function takeDecal() {
    for (let i = 0; i < NDEC; i++) if (!decals[i].active) return decals[i];
    let best = decals[0];
    for (let i = 1; i < NDEC; i++) if (decals[i].t / decals[i].dur > best.t / best.dur) best = decals[i];
    return best;
  }
  // red filled circle that fills in over `dur` (leap strikes, pounces, eruptions)
  function telegraphCircle(x, y, z, r, dur, follow = null) {
    const d = takeDecal();
    d.active = true; d.type = "circle"; d.t = 0; d.dur = Math.max(0.05, dur); d.r = r; d.follow = follow;
    d.g.position.set(x, groundY(x, z, y) + 0.04, z);
    d.g.rotation.set(0, 0, 0);
    d.fill.visible = true; d.ring.visible = true; d.line.visible = false;
    d.ring.scale.set(r, 1, r); d.fill.scale.set(0.01, 1, 0.01);
    d.g.visible = true;
    return d;
  }
  // red outline ring (ring shockwaves are coming, jump!)
  function telegraphRing(x, y, z, r, dur) {
    const d = takeDecal();
    d.active = true; d.type = "ring"; d.t = 0; d.dur = Math.max(0.05, dur); d.r = r; d.follow = null;
    d.g.position.set(x, groundY(x, z, y) + 0.04, z);
    d.g.rotation.set(0, 0, 0);
    d.fill.visible = true; d.ring.visible = true; d.line.visible = false;
    d.ring.scale.set(r, 1, r); d.fill.scale.set(r, 1, r);
    d.g.visible = true;
    return d;
  }
  // red rectangle from (x,z) along yaw (charges, thrusts, fissures)
  function telegraphLine(x, y, z, yaw, len, width, dur) {
    const d = takeDecal();
    d.active = true; d.type = "line"; d.t = 0; d.dur = Math.max(0.05, dur); d.len = len; d.w = width; d.follow = null;
    d.g.position.set(x, groundY(x, z, y) + 0.05, z);
    d.g.rotation.set(0, yaw, 0);
    d.fill.visible = false; d.ring.visible = false; d.line.visible = true;
    d.line.scale.set(width, 1, 0.01);
    d.g.visible = true;
    return d;
  }
  // cone wedge drawn with the line decal (hiss / scream)
  function cancelDecal(d) { if (d) { d.active = false; d.g.visible = false; } }

  function updateDecals(dt) {
    for (let i = 0; i < NDEC; i++) {
      const d = decals[i];
      if (!d.active) continue;
      d.t += dt;
      const f = Math.min(1, d.t / d.dur);
      const pulse = 0.5 + 0.5 * Math.sin(d.t * 18);
      if (d.follow) d.g.position.set(d.follow.x, groundY(d.follow.x, d.follow.z, d.follow.y) + 0.04, d.follow.z);
      if (d.type === "circle") {
        const s = Math.max(0.01, d.r * f);
        d.fill.scale.set(s, 1, s);
        d.fill.material.opacity = 0.22 + 0.25 * f;
        d.ring.material.opacity = 0.55 + 0.35 * pulse;
      } else if (d.type === "ring") {
        d.fill.material.opacity = 0.08 + 0.1 * f;
        d.ring.material.opacity = 0.5 + 0.45 * pulse;
      } else {
        d.line.scale.set(d.w, 1, Math.max(0.01, d.len * Math.min(1, f * 1.6)));
        d.line.material.opacity = 0.25 + 0.3 * f + 0.15 * pulse;
      }
      if (d.t >= d.dur) { d.active = false; d.g.visible = false; }
    }
  }

  // ------------------------------------------------------------------ shockwave rings (jumpable)
  const torusGeo = new THREE.TorusGeometry(1, 0.06, 6, 72); torusGeo.rotateX(Math.PI / 2);
  const bandGeo = new THREE.RingGeometry(0.82, 1, 72); bandGeo.rotateX(-Math.PI / 2);
  const NRING = 10;
  const rings = [];
  for (let i = 0; i < NRING; i++) {
    const g = new THREE.Group();
    const tor = new THREE.Mesh(torusGeo, new THREE.MeshBasicMaterial({ color: 0xffe0c0, transparent: true, opacity: 0.8, depthWrite: false }));
    const band = new THREE.Mesh(bandGeo, new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.45, depthWrite: false,
      side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }));
    g.add(tor, band); g.visible = false; root.add(g);
    rings.push({ g, tor, band, active: false, x: 0, y: 0, z: 0, r: 0, maxR: 1, speed: 1, dmg: 0, rec: 1, source: "", hit: false, band: 0.7, knock: 0, kind: "dust" });
  }
  function shockwave(o) {
    let s = null;
    for (let i = 0; i < NRING; i++) if (!rings[i].active) { s = rings[i]; break; }
    if (!s) s = rings[0];
    s.active = true; s.x = o.x; s.z = o.z; s.y = groundY(o.x, o.z, o.y);
    s.r = o.r0 || 0.5; s.maxR = o.maxR || 8; s.speed = o.speed || 9; s.dmg = o.dmg || 10; s.rec = o.rec || 1;
    s.source = o.source || "shockwave"; s.hit = false; s.band = o.band || 0.75; s.knock = o.knock || 4; s.kind = o.particle || "dust";
    s.tor.material.color.set(o.color || 0xffe0c0);
    s.g.position.set(s.x, s.y + 0.15, s.z);
    s.g.visible = true;
    return s;
  }
  function updateRings(dt) {
    const pp = playerPos();
    for (let i = 0; i < NRING; i++) {
      const s = rings[i];
      if (!s.active) continue;
      s.r += s.speed * dt;
      const f = s.r / s.maxR;
      s.g.scale.set(s.r, 1, s.r);
      s.tor.scale.set(1, 1 + 4 * (1 - f), 1);
      s.tor.material.opacity = 0.85 * (1 - f * 0.7);
      s.band.material.opacity = 0.42 * (1 - f);
      // dust kicked up along the front
      if (Math.random() < 0.6) {
        const a = Math.random() * Math.PI * 2;
        burst(s.kind, s.x + Math.cos(a) * s.r, s.y + 0.1, s.z + Math.sin(a) * s.r, 1, 0.1);
      }
      if (!s.hit) {
        const dx = pp.x - s.x, dz = pp.z - s.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (Math.abs(dist - s.r) < s.band && Math.abs(pp.y - s.y) < 2.2 && playerGrounded()) {
          s.hit = true;
          const inv = dist > 0.01 ? 1 / dist : 0;
          tmpV.set(dx * inv, 0, dz * inv);
          hooks.hurtPlayer(s.dmg, { rec: s.rec, source: s.source, dir: tmpV, knock: s.knock });
        }
      }
      if (s.r >= s.maxR) { s.active = false; s.g.visible = false; }
    }
  }

  // ------------------------------------------------------------------ projectiles
  const sphereGeo = new THREE.SphereGeometry(1, 14, 10);
  const wheelGeo = new THREE.CylinderGeometry(1, 1, 0.55, 28); wheelGeo.rotateZ(Math.PI / 2);
  const torchGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.8, 8);
  const shardGeo = new THREE.OctahedronGeometry(1, 0);
  const cheeseTex = engine.materials && engine.materials.texture ? safeTex("cheese") : null;
  function safeTex(n) { try { return engine.materials.texture(n); } catch (e) { return null; } }
  const PMATS = {
    bolt: new THREE.MeshBasicMaterial({ color: 0xcfeaff }),
    playerBolt: new THREE.MeshBasicMaterial({ color: 0xe6f6ff }),
    badBolt: new THREE.MeshBasicMaterial({ color: 0xb6d48a }),
    shadowBolt: new THREE.MeshBasicMaterial({ color: 0x6a2a8a }),
    cheeseBomb: new THREE.MeshStandardMaterial({ color: 0x9aa84a, roughness: 0.8, emissive: 0x2a3a08 }),
    wheel: new THREE.MeshStandardMaterial({ color: 0xe8b64a, roughness: 0.7, map: cheeseTex || null }),
    torch: new THREE.MeshStandardMaterial({ color: 0x5a3a1e, roughness: 0.9, emissive: 0x401800 }),
    debris: new THREE.MeshStandardMaterial({ color: 0x5a4a3c, roughness: 0.95 }),
  };
  const glowTex = makeGlowTexture(THREE);
  // additive glow sprites fade out when they come within ~2.5 m of the camera, so a halo passing the lens never
  // smears a huge white blob over the screen (assigned once; no per-frame closures)
  const _camP = new THREE.Vector3(), _sprP = new THREE.Vector3();
  function fadeNearCam(r, sc, cam) {
    _camP.setFromMatrixPosition(cam.matrixWorld); _sprP.setFromMatrixPosition(this.matrixWorld);
    const d = _camP.distanceTo(_sprP), k = d < 1.2 ? 0 : d > 2.6 ? 1 : (d - 1.2) / 1.4;
    const m = this.material; if (m.userData.baseOpacity === undefined) m.userData.baseOpacity = m.opacity;
    m.opacity = m.userData.baseOpacity * k;
  }
  const NPROJ = 48;
  const projs = [];
  for (let i = 0; i < NPROJ; i++) {
    const m = new THREE.Mesh(sphereGeo, PMATS.bolt);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xbfe6ff, transparent: true,
      depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.onBeforeRender = fadeNearCam;
    m.add(halo);
    m.visible = false; root.add(m);
    projs.push({ m, halo, active: false, type: "", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 0, r: 0.2, dmg: 0, rec: 1,
      team: "enemy", source: "", spin: 0, trail: "", homing: 0, roll: false, onLand: null, pierce: false, crit: false, hitIds: 0, owner: null });
  }
  const PDEF = {
    bolt:       { geo: sphereGeo, mat: "bolt", scale: 0.16, halo: 0xbfe6ff, haloS: 0.9, trail: "bolt", g: 0 },
    playerBolt: { geo: sphereGeo, mat: "playerBolt", scale: 0.2, halo: 0xd8f0ff, haloS: 1.3, trail: "bolt", g: 0 },
    badBolt:    { geo: sphereGeo, mat: "badBolt", scale: 0.18, halo: 0xb6d48a, haloS: 1.1, trail: "mold", g: 0 },
    shadowBolt: { geo: sphereGeo, mat: "shadowBolt", scale: 0.18, halo: 0x8a3aaa, haloS: 1.0, trail: "shadow", g: 0 },
    cheeseBomb: { geo: sphereGeo, mat: "cheeseBomb", scale: 0.32, halo: 0, haloS: 0, trail: "mold", g: 14 },
    wheel:      { geo: wheelGeo, mat: "wheel", scale: 1.1, halo: 0, haloS: 0, trail: "crumbs", g: 0, roll: true },
    torch:      { geo: torchGeo, mat: "torch", scale: 1, halo: 0xff8a2a, haloS: 0.8, trail: "ember", g: 14 },
    debris:     { geo: shardGeo, mat: "debris", scale: 0.45, halo: 0, haloS: 0, trail: "dust", g: 14 },
  };
  function projectile(o) {
    let p = null;
    for (let i = 0; i < NPROJ; i++) if (!projs[i].active) { p = projs[i]; break; }
    if (!p) return null;
    const def = PDEF[o.type] || PDEF.bolt;
    p.active = true; p.type = o.type;
    p.x = o.x; p.y = o.y; p.z = o.z; p.vx = o.vx || 0; p.vy = o.vy || 0; p.vz = o.vz || 0;
    p.g = o.gravity != null ? o.gravity : def.g; p.life = o.life || 3; p.r = o.radius || def.scale * 1.4;
    p.dmg = o.dmg || 10; p.rec = o.rec || 1; p.team = o.team || "enemy"; p.source = o.source || o.type;
    p.trail = def.trail; p.homing = o.homing || 0; p.roll = !!def.roll; p.onLand = o.onLand || null;
    p.pierce = !!o.pierce; p.crit = !!o.crit; p.owner = o.owner || null; p.hitIds = 0; p.spin = Math.random() * 6;
    p.m.geometry = def.geo; p.m.material = PMATS[def.mat];
    const sc = o.scale || def.scale;
    p.m.scale.set(sc, sc, sc);
    p.halo.visible = def.haloS > 0;
    if (def.haloS > 0) { p.halo.material.color.setHex(def.halo); const hs = def.haloS / sc; p.halo.scale.set(hs, hs, hs); }
    p.m.position.set(p.x, p.y, p.z);
    if (p.roll) p.m.rotation.set(0, Math.atan2(p.vx, p.vz), 0);
    p.m.visible = true;
    return p;
  }
  function killProj(p) { p.active = false; p.m.visible = false; }
  function updateProjectiles(dt) {
    const pp = playerPos();
    for (let i = 0; i < NPROJ; i++) {
      const p = projs[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.homing > 0 && p.team === "enemy") {
        const dx = pp.x - p.x, dy = pp.y + 1.0 - p.y, dz = pp.z - p.z;
        const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
        const k = Math.min(1, p.homing * dt);
        p.vx += (dx / L * sp - p.vx) * k; p.vy += (dy / L * sp - p.vy) * k; p.vz += (dz / L * sp - p.vz) * k;
      }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.roll) {
        const gy = groundY(p.x, p.z, p.y);
        p.y = gy + p.m.scale.y * 1.0;
        p.spin += Math.sqrt(p.vx * p.vx + p.vz * p.vz) * dt / p.m.scale.y;
        p.m.rotation.set(p.spin, Math.atan2(p.vx, p.vz), 0, "YXZ");
      } else {
        p.spin += dt * 8;
        p.m.rotation.set(p.spin, p.spin * 0.7, 0);
      }
      p.m.position.set(p.x, p.y, p.z);
      if (p.trail && Math.random() < 0.7) burst(p.trail, p.x, p.y, p.z, 1, 0.05);
      // collisions
      if (p.team === "enemy") {
        const dx = pp.x - p.x, dz = pp.z - p.z;
        const dy = p.y - (pp.y + 0.9);
        const rr = p.r + 0.42;
        if (dx * dx + dz * dz < rr * rr && Math.abs(dy) < 0.9 + p.r) {
          tmpV.set(dx, 0, dz); if (tmpV.lengthSq() < 1e-6) tmpV.set(0, 0, 1); tmpV.normalize();
          hooks.hurtPlayer(p.dmg, { rec: p.rec, source: p.source, dir: tmpV, knock: p.roll ? 7 : 2.5 });
          if (p.type === "torch") hooks.burn && hooks.burn();
          if (!p.roll) { burst(p.trail || "spark", p.x, p.y, p.z, 8, 0.1); if (p.onLand) p.onLand(p.x, p.y, p.z); killProj(p); continue; }
        }
      } else {
        if (hooks.hitTargets(p, p.x, p.y, p.z, p.r)) {
          burst("bolt", p.x, p.y, p.z, 14, 0.15);
          if (!p.pierce) { killProj(p); continue; }
        }
      }
      if (!p.roll) {
        const gy = groundY(p.x, p.z, p.y);
        if (p.y <= gy + 0.05) {
          burst(p.trail || "dust", p.x, gy + 0.1, p.z, 10, 0.2);
          if (p.onLand) p.onLand(p.x, gy, p.z);
          killProj(p); continue;
        }
      }
      if (p.life <= 0) { if (p.roll) burst("crumbs", p.x, p.y, p.z, 20, 0.5); killProj(p); }
    }
  }

  // ------------------------------------------------------------------ hazards: fire / poison patches
  const NFIRE = 8;
  const fires = [];
  const fireGeo = new THREE.CircleGeometry(1, 28); fireGeo.rotateX(-Math.PI / 2);
  for (let i = 0; i < NFIRE; i++) {
    const m = new THREE.Mesh(fireGeo, new THREE.MeshBasicMaterial({ color: 0xff6a1a, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 }));
    m.visible = false; root.add(m);
    fires.push({ m, active: false, x: 0, y: 0, z: 0, r: 1, t: 0, dur: 1, dps: 5, rec: 1, tick: 0, kind: "fire", source: "fire" });
  }
  function patch(kind, x, y, z, r, dur, dps, rec) {
    let f = null;
    for (let i = 0; i < NFIRE; i++) if (!fires[i].active) { f = fires[i]; break; }
    if (!f) f = fires[0];
    f.active = true; f.kind = kind; f.x = x; f.z = z; f.y = groundY(x, z, y); f.r = r; f.t = 0; f.dur = dur; f.dps = dps;
    f.rec = rec; f.tick = 0; f.source = kind === "fire" ? "fire" : "poison";
    f.m.material.color.setHex(kind === "fire" ? 0xff6a1a : 0x7a9a2a);
    f.m.material.blending = kind === "fire" ? THREE.AdditiveBlending : THREE.NormalBlending;
    f.m.position.set(x, f.y + 0.05, z); f.m.scale.set(r, 1, r); f.m.visible = true;
    return f;
  }
  function updatePatches(dt) {
    const pp = playerPos();
    for (let i = 0; i < NFIRE; i++) {
      const f = fires[i];
      if (!f.active) continue;
      f.t += dt;
      const life = 1 - f.t / f.dur;
      f.m.material.opacity = (f.kind === "fire" ? 0.35 + 0.15 * Math.sin(f.t * 21) : 0.4) * Math.min(1, life * 3);
      if (Math.random() < (f.kind === "fire" ? 0.9 : 0.4)) {
        const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * f.r;
        burst(f.kind === "fire" ? "ember" : "fumes", f.x + Math.cos(a) * rr, f.y + 0.1, f.z + Math.sin(a) * rr, 1, 0.05);
      }
      f.tick -= dt;
      const dx = pp.x - f.x, dz = pp.z - f.z;
      if (f.tick <= 0 && dx * dx + dz * dz < f.r * f.r && Math.abs(pp.y - f.y) < 1.2) {
        f.tick = 0.5;
        hooks.hurtPlayer(f.dps * 0.5, { rec: f.rec, source: f.source, dot: true });
      }
      if (f.t >= f.dur) { f.active = false; f.m.visible = false; }
    }
  }

  // ------------------------------------------------------------------ fissures (travel along the ground)
  const NFIS = 4;
  const fis = [];
  for (let i = 0; i < NFIS; i++) fis.push({ active: false, x: 0, y: 0, z: 0, dx: 0, dz: 0, d: 0, len: 0, speed: 0, dmg: 0, rec: 1, hit: false, decal: null, source: "" });
  function fissure(o) {
    let f = null;
    for (let i = 0; i < NFIS; i++) if (!fis[i].active) { f = fis[i]; break; }
    if (!f) return null;
    f.active = true; f.x = o.x; f.y = o.y; f.z = o.z; f.dx = Math.sin(o.yaw); f.dz = Math.cos(o.yaw); f.d = 0;
    f.len = o.len || 18; f.speed = o.speed || 12; f.dmg = o.dmg || 20; f.rec = o.rec || 1; f.hit = false; f.source = o.source || "fissure";
    f.decal = telegraphLine(o.x, o.y, o.z, o.yaw, f.len, 0.9, f.len / f.speed + 0.4);
    return f;
  }
  function updateFissures(dt) {
    const pp = playerPos();
    for (let i = 0; i < NFIS; i++) {
      const f = fis[i];
      if (!f.active) continue;
      f.d += f.speed * dt;
      const tx = f.x + f.dx * f.d, tz = f.z + f.dz * f.d;
      burst("dust", tx, groundY(tx, tz, f.y) + 0.1, tz, 2, 0.3);
      if (Math.random() < 0.5) burst("spark", tx, groundY(tx, tz, f.y) + 0.1, tz, 1, 0.2);
      if (!f.hit) {
        const ex = pp.x - tx, ez = pp.z - tz;
        if (ex * ex + ez * ez < 1.3 * 1.3 && playerGrounded()) {
          f.hit = true;
          tmpV.set(f.dx, 0, f.dz);
          hooks.hurtPlayer(f.dmg, { rec: f.rec, source: f.source, dir: tmpV, knock: 5 });
        }
      }
      if (f.d >= f.len) f.active = false;
    }
  }

  function update(dt) {
    updateDecals(dt);
    updateRings(dt);
    updateProjectiles(dt);
    updatePatches(dt);
    updateFissures(dt);
    updateParticles(dt);
  }

  function clear() {
    for (const d of decals) { d.active = false; d.g.visible = false; }
    for (const s of rings) { s.active = false; s.g.visible = false; }
    for (const p of projs) killProj(p);
    for (const f of fires) { f.active = false; f.m.visible = false; }
    for (const f of fis) f.active = false;
  }

  // remove hazards owned by a fight (keeps particles)
  function clearHostile() {
    for (const s of rings) { s.active = false; s.g.visible = false; }
    for (const p of projs) if (p.team === "enemy") killProj(p);
    for (const f of fires) { f.active = false; f.m.visible = false; }
    for (const f of fis) f.active = false;
    for (const d of decals) { d.active = false; d.g.visible = false; }
  }

  return { root, burst, telegraphCircle, telegraphRing, telegraphLine, cancelDecal, shockwave, projectile, patch, fissure,
    update, clear, clearHostile, groundY, glowTex, fadeNearCam, PTYPES };
}

export function makeGlowTexture(THREE) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.25, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
