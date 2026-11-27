// EVENTS fx: telegraph decals, shockwave rings, projectiles, one pooled particle system, an eye beam.
// Everything pre-allocated; update() does no allocation.
import { clamp, distXZ } from "./util.js";

const DANGER = 0xc0141c;

export class FX {
  constructor(ev) {
    const THREE = ev.THREE; this.ev = ev; this.THREE = THREE;
    this.root = new THREE.Group(); this.root.name = "events-fx";
    this._v = new THREE.Vector3(); this._v2 = new THREE.Vector3(); this._up = new THREE.Vector3(0, 1, 0);
    // ---------- decals ----------
    const dg = new THREE.PlaneGeometry(2, 2); dg.rotateX(Math.PI * 0.5);
    const dvs = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }";
    const dfs = `uniform vec3 uColor; uniform float uProg; uniform float uAlpha; uniform float uKind; uniform float uHalf; uniform float uTime;
      varying vec2 vUv;
      void main(){
        vec2 p = vUv * 2.0 - 1.0; float d = length(p); float a = 0.0;
        if (uKind < 0.5) {
          if (d > 1.0) discard;
          float ring = smoothstep(0.84, 0.92, d) * (1.0 - smoothstep(0.96, 1.0, d));
          float fill = (1.0 - smoothstep(uProg - 0.03, uProg, d)) * 0.38;
          a = max(ring * 0.95, fill) + 0.08;
        } else if (uKind < 1.5) {
          float ang = abs(atan(p.x, p.y));
          if (d > 1.0 || ang > uHalf) discard;
          float edge = max(smoothstep(0.9, 1.0, d), smoothstep(uHalf - 0.06, uHalf, ang));
          float fill = (1.0 - smoothstep(uProg - 0.03, uProg, d)) * 0.38;
          a = max(edge * 0.9, fill) + 0.08;
        } else if (uKind < 2.5) {
          vec2 q = abs(p);
          float edge = max(smoothstep(0.86, 1.0, q.x), smoothstep(0.94, 1.0, q.y));
          float fill = step(p.y * 0.5 + 0.5, uProg) * 0.38;
          a = max(edge * 0.9, fill) + 0.08;
        } else {
          // ink puddle: soft blob with a slow wobble
          float wob = 0.85 + 0.08 * sin(atan(p.y, p.x) * 5.0 + uTime * 2.0);
          if (d > wob) discard;
          a = 0.92 * smoothstep(wob, wob - 0.15, d);
        }
        gl_FragColor = vec4(uColor, a * uAlpha);
      }`;
    this.decals = [];
    for (let i = 0; i < 28; i++) {
      const m = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(DANGER) }, uProg: { value: 0 },
        uAlpha: { value: 1 }, uKind: { value: 0 }, uHalf: { value: 1 }, uTime: { value: 0 } }, vertexShader: dvs,
        fragmentShader: dfs, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true,
        polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(dg, m); mesh.visible = false; mesh.renderOrder = 3; mesh.frustumCulled = false;
      this.root.add(mesh);
      this.decals.push({ mesh, mat: m, active: false, t: 0, dur: 1, hold: 0, fadeOut: 0.25, onDone: null, follow: null });
    }
    // ---------- shockwave rings ----------
    const rg = new THREE.CylinderGeometry(1, 1, 1, 56, 1, true); rg.translate(0, 0.5, 0);
    const rvs = "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }";
    const rfs = `uniform vec3 uColor; uniform float uAlpha; varying vec2 vUv;
      void main(){ float a = (1.0 - vUv.y) * (0.55 + 0.45 * smoothstep(0.0, 0.15, vUv.y)); gl_FragColor = vec4(uColor * 1.6, a * uAlpha); }`;
    this.rings = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.ShaderMaterial({ uniforms: { uColor: { value: new THREE.Color(0xff3a2a) }, uAlpha: { value: 1 } },
        vertexShader: rvs, fragmentShader: rfs, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, toneMapped: false });
      const mesh = new THREE.Mesh(rg, m); mesh.visible = false; mesh.frustumCulled = false; this.root.add(mesh);
      this.rings.push({ mesh, mat: m, active: false, x: 0, y: 0, z: 0, r: 0, speed: 10, maxR: 30, band: 0.9, h: 0.8,
        dmg: 0, rec: 1, hit: false, source: "" });
    }
    // ---------- projectiles ----------
    const boltG = new THREE.SphereGeometry(0.22, 10, 8);
    const rockG = new THREE.IcosahedronGeometry(0.6, 0);
    const shardG = new THREE.ConeGeometry(0.18, 1.4, 5); shardG.rotateX(Math.PI);
    const boltM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 0.3), toneMapped: false });
    const boltBlue = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.2, 2.6), toneMapped: false });
    let rockM; try { rockM = ev.ctx.engine.materials.get("stoneBrick"); } catch (e) { rockM = null; }
    if (!rockM) rockM = new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.9 });
    const shardM = new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.15, metalness: 0.2, emissive: 0x200004 });
    this.geos = { bolt: boltG, rock: rockG, shard: shardG }; this.mats = { bolt: boltM, blue: boltBlue, rock: rockM, shard: shardM };
    this.proj = [];
    for (let i = 0; i < 40; i++) {
      const mesh = new THREE.Mesh(boltG, boltM); mesh.visible = false; this.root.add(mesh);
      this.proj.push({ mesh, active: false, pos: mesh.position, vel: new THREE.Vector3(), g: 0, life: 0, radius: 0.5,
        dmg: 0, rec: 1, floorY: -1e9, aoe: 0, source: "", spin: 0, decal: null });
    }
    // ---------- particles ----------
    this.maxP = 1600;
    const pg = new THREE.BufferGeometry();
    this.pPos = new Float32Array(this.maxP * 3); this.pCol = new Float32Array(this.maxP * 4); this.pSize = new Float32Array(this.maxP);
    pg.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute("aCol", new THREE.BufferAttribute(this.pCol, 4).setUsage(THREE.DynamicDrawUsage));
    pg.setAttribute("aSize", new THREE.BufferAttribute(this.pSize, 1).setUsage(THREE.DynamicDrawUsage));
    pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const pm = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false,
      vertexShader: `attribute vec4 aCol; attribute float aSize; uniform float uScale; varying vec4 vC;
        void main(){ vC = aCol; vec4 mv = modelViewMatrix * vec4(position,1.0); vC.a *= smoothstep(0.5, 1.8, -mv.z); gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 0.0, 72.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec4 vC; void main(){ vec2 c = gl_PointCoord - 0.5; float d = dot(c,c); if (d > 0.25) discard; gl_FragColor = vec4(vC.rgb, vC.a * (1.0 - d * 4.0)); }` });
    this.points = new THREE.Points(pg, pm); this.points.frustumCulled = false; this.points.renderOrder = 4; this.root.add(this.points);
    this.pVel = new Float32Array(this.maxP * 3); this.pLife = new Float32Array(this.maxP); this.pMax = new Float32Array(this.maxP);
    this.pGrav = new Float32Array(this.maxP); this.pBaseA = new Float32Array(this.maxP); this.pHead = 0; this.pAlive = 0;
    for (let i = 0; i < this.maxP; i++) this.pPos[i * 3 + 1] = -1e6;
    // ---------- beam ----------
    const bg = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true); bg.translate(0, 0.5, 0);
    this.beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.15, 0.1), toneMapped: false,
      transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.visible = false; this.beam.frustumCulled = false; this.root.add(this.beam);
    this.t = 0;
    ev.scene.add(this.root);
  }
  budget() { const q = this.ev.quality(); return q <= 0 ? 300 : q === 1 ? 800 : this.maxP; }

  // ---------------- decals ----------------
  /** kind: "circle"|"cone"|"rect"|"ink". returns the decal record (has .active) */
  decal(kind, x, y, z, size, dur, opts) {
    let d = null;
    for (const c of this.decals) if (!c.active) { d = c; break; }
    if (!d) d = this.decals[0];
    d.active = true; d.t = 0; d.dur = Math.max(0.05, dur); d.hold = (opts && opts.hold) || 0; d.onDone = (opts && opts.onDone) || null;
    d.follow = (opts && opts.follow) || null;
    const m = d.mesh; m.visible = true; m.position.set(x, y + 0.05, z); m.rotation.set(0, (opts && opts.yaw) || 0, 0);
    const len = (opts && opts.length) || size;
    if (kind === "rect") m.scale.set(size, 1, len * 0.5); else m.scale.set(size, 1, size);
    if (kind === "rect") m.position.set(x + Math.sin(m.rotation.y) * len * 0.5, y + 0.05, z + Math.cos(m.rotation.y) * len * 0.5);
    const u = d.mat.uniforms;
    u.uKind.value = kind === "circle" ? 0 : kind === "cone" ? 1 : kind === "rect" ? 2 : 3;
    u.uHalf.value = (opts && opts.half) || 0.8; u.uProg.value = 0; u.uAlpha.value = 1;
    u.uColor.value.set(kind === "ink" ? 0x050307 : ((opts && opts.color) || DANGER));
    return d;
  }
  clearDecals() { for (const d of this.decals) { d.active = false; d.mesh.visible = false; d.onDone = null; } }

  // ---------------- rings ----------------
  ring(x, y, z, o) {
    let r = null; for (const c of this.rings) if (!c.active) { r = c; break; }
    if (!r) r = this.rings[0];
    r.active = true; r.x = x; r.y = y; r.z = z; r.r = o.r0 || 0.5; r.speed = o.speed || 12; r.maxR = o.maxR || 30;
    r.band = o.band || 0.9; r.h = o.height || 0.8; r.dmg = o.dmg || 0; r.rec = o.rec || 1; r.hit = false; r.source = o.source || "hollow";
    r.mat.uniforms.uColor.value.set(o.color || 0xff3a2a);
    r.mesh.visible = true; r.mesh.position.set(x, y, z);
    return r;
  }
  clearRings() { for (const r of this.rings) { r.active = false; r.mesh.visible = false; } }

  // ---------------- projectiles ----------------
  shoot(kind, x, y, z, vx, vy, vz, o) {
    let p = null; for (const c of this.proj) if (!c.active) { p = c; break; }
    if (!p) return null;
    p.active = true; p.pos.set(x, y, z); p.vel.set(vx, vy, vz); p.g = o.g || 0; p.life = o.life || 4; p.radius = o.radius || 0.5;
    p.dmg = o.dmg || 0; p.rec = o.rec || 1; p.floorY = o.floorY !== undefined ? o.floorY : -1e9; p.aoe = o.aoe || 0;
    p.source = o.source || "hollow"; p.spin = kind === "rock" ? 4 : 0; p.decal = o.decal || null; p.kind = kind;
    p.mesh.geometry = this.geos[kind === "blue" ? "bolt" : kind] || this.geos.bolt;
    p.mesh.material = this.mats[kind] || this.mats.bolt;
    p.mesh.scale.setScalar(o.scale || 1);
    p.mesh.visible = true; p.mesh.rotation.set(0, 0, 0);
    return p;
  }
  clearProj() { for (const p of this.proj) { p.active = false; p.mesh.visible = false; } }

  // ---------------- particles ----------------
  emit(x, y, z, vx, vy, vz, life, size, r, g, b, a, grav) {
    const lim = this.budget();
    const i = this.pHead; this.pHead = (this.pHead + 1) % lim;
    const i3 = i * 3, i4 = i * 4;
    this.pPos[i3] = x; this.pPos[i3 + 1] = y; this.pPos[i3 + 2] = z;
    this.pVel[i3] = vx; this.pVel[i3 + 1] = vy; this.pVel[i3 + 2] = vz;
    this.pLife[i] = life; this.pMax[i] = life; this.pSize[i] = size; this.pGrav[i] = grav;
    this.pCol[i4] = r; this.pCol[i4 + 1] = g; this.pCol[i4 + 2] = b; this.pCol[i4 + 3] = a; this.pBaseA[i] = a;
  }
  burst(x, y, z, n, speed, r, g, b, life, size, grav, up) {
    for (let k = 0; k < n; k++) {
      const th = Math.random() * Math.PI * 2, ph = Math.random() * 2 - 1, s = speed * (0.4 + Math.random() * 0.6);
      const c = Math.sqrt(1 - ph * ph);
      this.emit(x, y, z, Math.cos(th) * c * s, Math.abs(ph) * s * (up || 1), Math.sin(th) * c * s,
        life * (0.6 + Math.random() * 0.6), size * (0.6 + Math.random() * 0.8), r, g, b, 0.9, grav);
    }
  }
  clearParticles() { for (let i = 0; i < this.maxP; i++) { this.pLife[i] = 0; this.pPos[i * 3 + 1] = -1e6; } }

  // ---------------- beam ----------------
  setBeam(on, ax, ay, az, bx, by, bz, width) {
    const m = this.beam; m.visible = on; if (!on) return;
    const v = this._v.set(bx - ax, by - ay, bz - az); const len = v.length(); if (len < 0.01) return;
    v.divideScalar(len);
    m.position.set(ax, ay, az); m.quaternion.setFromUnitVectors(this._up, v); m.scale.set(width, len, width);
  }

  clearAll() { this.clearDecals(); this.clearRings(); this.clearProj(); this.clearParticles(); this.beam.visible = false; }

  update(dt) {
    this.t += dt;
    const ev = this.ev, pl = ev.player();
    const pp = pl ? pl.position : null;
    // decals
    for (const d of this.decals) {
      if (!d.active) continue;
      d.t += dt; const u = d.mat.uniforms; u.uTime.value = this.t;
      if (d.follow) { d.mesh.position.x = d.follow.x; d.mesh.position.z = d.follow.z; }
      u.uProg.value = clamp(d.t / d.dur, 0, 1);
      if (d.t >= d.dur && d.onDone) { const f = d.onDone; d.onDone = null; try { f(d); } catch (e) { console.warn("[events] decal", e); } }
      const end = d.dur + d.hold;
      if (d.t > end) { const k = (d.t - end) / 0.25; u.uAlpha.value = 1 - k; if (k >= 1) { d.active = false; d.mesh.visible = false; } }
    }
    // rings
    for (const r of this.rings) {
      if (!r.active) continue;
      r.r += r.speed * dt;
      const fade = 1 - clamp((r.r - r.maxR * 0.75) / (r.maxR * 0.25), 0, 1);
      r.mat.uniforms.uAlpha.value = fade;
      r.mesh.scale.set(r.r, r.h, r.r);
      if (r.r >= r.maxR) { r.active = false; r.mesh.visible = false; continue; }
      if (!r.hit && pp && r.dmg > 0) {
        const dd = Math.sqrt((pp.x - r.x) * (pp.x - r.x) + (pp.z - r.z) * (pp.z - r.z));
        if (Math.abs(dd - r.r) < r.band && pp.y - r.y < r.h * 0.7 && pp.y - r.y > -1.5 && !pl.dodging) {
          r.hit = true; ev.hurt(r.dmg, r.rec, r.source, r.x, r.z, 6);
        }
      }
    }
    // projectiles
    for (const p of this.proj) {
      if (!p.active) continue;
      p.vel.y -= p.g * dt; p.pos.addScaledVector(p.vel, dt); p.life -= dt;
      if (p.spin) { p.mesh.rotation.x += dt * p.spin; p.mesh.rotation.z += dt * p.spin * 0.7; }
      if (p.kind === "shard") { const sp = p.vel.length(); if (sp > 0.1) { this._v2.copy(p.vel).divideScalar(-sp); p.mesh.quaternion.setFromUnitVectors(this._up, this._v2); } }
      let end = p.life <= 0;
      if (!end && pp && p.dmg > 0 && !p.aoe) {
        const dx = pp.x - p.pos.x, dy = pp.y + 0.9 - p.pos.y, dz = pp.z - p.pos.z;
        if (dx * dx + dy * dy + dz * dz < (p.radius + 0.45) * (p.radius + 0.45) && !pl.dodging) {
          ev.hurt(p.dmg, p.rec, p.source, p.pos.x - p.vel.x, p.pos.z - p.vel.z, 4); end = true;
        }
      }
      if (!end && p.pos.y <= p.floorY) {
        end = true;
        if (p.aoe && pp && !pl.dodging && distXZ(pp, p.pos) < p.aoe && Math.abs(pp.y - p.floorY) < 2.5) ev.hurt(p.dmg, p.rec, p.source, p.pos.x, p.pos.z, 7);
        const dark = p.kind === "shard" || p.kind === "rock";
        this.burst(p.pos.x, p.floorY + 0.2, p.pos.z, 10, 5, dark ? 0.08 : 1, dark ? 0.07 : 0.3, dark ? 0.08 : 0.2, 0.7, 0.25, 9, 1);
        ev.sfx(p.kind === "rock" ? "rock_tumble" : "hit_flesh", p.pos, 0.6);
      }
      if (end) { p.active = false; p.mesh.visible = false; }
    }
    // particles
    const lim = this.budget(); const P = this.pPos, V = this.pVel, L = this.pLife, C = this.pCol;
    for (let i = 0; i < lim; i++) {
      if (L[i] <= 0) continue;
      L[i] -= dt; const i3 = i * 3;
      if (L[i] <= 0) { P[i3 + 1] = -1e6; continue; }
      V[i3 + 1] -= this.pGrav[i] * dt;
      P[i3] += V[i3] * dt; P[i3 + 1] += V[i3 + 1] * dt; P[i3 + 2] += V[i3 + 2] * dt;
      C[i * 4 + 3] = this.pBaseA[i] * Math.min(1, L[i] / (this.pMax[i] * 0.5));
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
    const h = ev.renderer ? ev.renderer.domElement.height : 720;
    this.points.material.uniforms.uScale.value = h * 0.6;
  }
}
