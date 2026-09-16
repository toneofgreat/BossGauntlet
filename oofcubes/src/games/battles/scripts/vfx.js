// src/games/battles/scripts/vfx.js — Battles' juice engine. Spec 26.
//
// A single THREE.Group (hung on the scene via parts.addCustom) that owns every
// transient spark, shard, shockwave ring and floating damage number in the Place.
// Everything here is render-side candy: nothing collides, nothing publishes,
// nothing touches the sim — so a dropped particle can never desync a peer.
//
// The budget is hard: at most MAXP live particles; past it, new bursts shrink
// rather than the frame rate. Geometries are shared; materials are per-particle
// (they fade independently) and disposed the moment their particle dies.

export function createVfx(ctx) {
  const THREE = ctx.engine.THREE;
  const root = new THREE.Group();
  root.name = "bt-vfx";
  const rootId = ctx.engine.parts.addCustom(root);

  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    sphere: new THREE.SphereGeometry(0.5, 6, 5),
    shard: new THREE.TetrahedronGeometry(0.62),
    ring: new THREE.TorusGeometry(1, 0.09, 6, 36),
    disc: new THREE.CircleGeometry(1, 28),
  };
  const MAXP = 450;
  const MAXT = 36;

  const parts = []; // {mesh, vel, grav, drag, spin, t, life, s0, fade, shrink}
  const rings = []; // {mesh, t, life, r0, r1, a0}
  const texts = []; // {sprite, tex, mat, t, life, vy, s0}

  function mat(color, opacity) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: opacity == null ? 1 : opacity, depthWrite: false });
  }

  // one particle. o: {shape, size, color, vel:[3], grav, drag, spin, life, fade, shrink, stretch}
  function spawn(pos, o = {}) {
    if (parts.length >= MAXP) return null;
    const geo = GEO[o.shape || "sphere"] || GEO.sphere;
    const m = new THREE.Mesh(geo, mat(o.color || "#ffffff", o.opacity));
    const s = o.size || 0.5;
    m.position.set(pos[0], pos[1], pos[2]);
    const vel = o.vel || [0, 0, 0];
    if (o.stretch) {
      // orient a long thin streak along its own velocity
      m.scale.set(s * 0.28, s * 0.28, s * o.stretch);
      const len = Math.hypot(vel[0], vel[1], vel[2]) || 1;
      m.lookAt(pos[0] + vel[0] / len, pos[1] + vel[1] / len, pos[2] + vel[2] / len);
    } else {
      m.scale.set(s, s, s);
      m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    }
    root.add(m);
    parts.push({
      mesh: m, vel, t: 0, life: o.life || 0.6, s0: s,
      grav: o.grav == null ? 18 : o.grav,
      drag: o.drag == null ? 1.5 : o.drag,
      spin: o.spin == null ? (o.stretch ? 0 : 4) : o.spin,
      fade: o.fade !== false, shrink: o.shrink !== false,
      stretch: o.stretch || 0,
    });
    return m;
  }

  // a radial explosion. o: {count, colors, speed, up, grav, size, sizeJitter, life,
  // lifeJitter, shapes, spread(0..1 flattens toward the ground plane), stretch}
  function burst(pos, o = {}) {
    const room = Math.max(0, MAXP - parts.length);
    const n = Math.min(o.count || 10, room);
    const cols = o.colors || ["#ffffff"];
    const shapes = o.shapes || ["sphere"];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.7;
      const tilt = (o.spread == null ? 0.5 : o.spread) * (Math.random() - 0.15);
      const sp = (o.speed || 8) * (0.55 + Math.random() * 0.75);
      spawn(pos, {
        shape: shapes[i % shapes.length],
        color: cols[i % cols.length],
        size: (o.size || 0.5) * (1 - (o.sizeJitter || 0.4) * Math.random()),
        vel: [Math.cos(a) * sp * (1 - Math.abs(tilt)), (o.up == null ? 5 : o.up) + tilt * sp, Math.sin(a) * sp * (1 - Math.abs(tilt))],
        grav: o.grav, life: (o.life || 0.6) * (1 - (o.lifeJitter || 0.35) * Math.random()),
        stretch: o.stretch, drag: o.drag, spin: o.spin, opacity: o.opacity,
      });
    }
  }

  // a flat expanding shockwave. o: {color, r0, r1, life, y offset handled by pos, fill}
  function ring(pos, o = {}) {
    if (rings.length > 24) return;
    const m = new THREE.Mesh(o.fill ? GEO.disc : GEO.ring, mat(o.color || "#ffffff", o.opacity == null ? 0.85 : o.opacity));
    m.position.set(pos[0], pos[1], pos[2]);
    m.rotation.x = -Math.PI / 2;
    const r0 = o.r0 == null ? 0.5 : o.r0;
    m.scale.set(r0, r0, 1);
    m.renderOrder = 500;
    root.add(m);
    rings.push({ mesh: m, t: 0, life: o.life || 0.5, r0, r1: o.r1 == null ? 8 : o.r1, a0: o.opacity == null ? 0.85 : o.opacity });
  }

  // a floating number / word. o: {color, scale, life, vy, outline}
  function text(pos, str, o = {}) {
    if (texts.length >= MAXT) return;
    const c = document.createElement("canvas"); c.width = 256; c.height = 112;
    const g = c.getContext("2d");
    g.font = "800 " + (o.px || 58) + "px system-ui,sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.lineWidth = 10; g.strokeStyle = o.outline || "rgba(10,6,16,0.9)"; g.lineJoin = "round";
    g.strokeText(str, 128, 58);
    g.fillStyle = o.color || "#ffffff";
    g.fillText(str, 128, 58);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const sm = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(sm);
    const s0 = (o.scale || 1) * 3.4;
    sprite.scale.set(s0, s0 * 0.44, 1);
    sprite.position.set(pos[0], pos[1], pos[2]);
    sprite.renderOrder = 1001;
    root.add(sprite);
    texts.push({ sprite, tex, mat: sm, t: 0, life: o.life || 1.0, vy: o.vy == null ? 3.2 : o.vy, s0 });
  }

  function killPart(i) {
    const p = parts[i];
    root.remove(p.mesh);
    try { p.mesh.material.dispose(); } catch { /* fine */ }
    parts.splice(i, 1);
  }

  function step(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.t += dt;
      if (p.t >= p.life) { killPart(i); continue; }
      const k = p.t / p.life;
      const dr = Math.max(0, 1 - p.drag * dt);
      p.vel[0] *= dr; p.vel[2] *= dr;
      p.vel[1] -= p.grav * dt;
      p.mesh.position.x += p.vel[0] * dt;
      p.mesh.position.y += p.vel[1] * dt;
      p.mesh.position.z += p.vel[2] * dt;
      if (p.spin) { p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.y += p.spin * 0.7 * dt; }
      if (p.fade) p.mesh.material.opacity = Math.max(0, 1 - k * k);
      if (p.shrink && !p.stretch) { const s = p.s0 * (1 - k * 0.75); p.mesh.scale.set(s, s, s); }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        root.remove(r.mesh);
        try { r.mesh.material.dispose(); } catch { /* fine */ }
        rings.splice(i, 1); continue;
      }
      const e = 1 - (1 - k) * (1 - k); // ease-out
      const s = r.r0 + (r.r1 - r.r0) * e;
      r.mesh.scale.set(s, s, 1);
      r.mesh.material.opacity = r.a0 * (1 - k);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const t = texts[i]; t.t += dt;
      const k = t.t / t.life;
      if (k >= 1) {
        root.remove(t.sprite);
        try { t.mat.dispose(); t.tex.dispose(); } catch { /* fine */ }
        texts.splice(i, 1); continue;
      }
      t.sprite.position.y += t.vy * dt;
      t.mat.opacity = k < 0.7 ? 1 : (1 - k) / 0.3;
      const pop = k < 0.12 ? 0.6 + (k / 0.12) * 0.4 : 1; // spawn pop-in
      t.sprite.scale.set(t.s0 * pop, t.s0 * 0.44 * pop, 1);
    }
  }

  function alive() { return parts.length; }

  function dispose() {
    for (const p of parts) { try { p.mesh.material.dispose(); } catch { /* fine */ } }
    for (const r of rings) { try { r.mesh.material.dispose(); } catch { /* fine */ } }
    for (const t of texts) { try { t.mat.dispose(); t.tex.dispose(); } catch { /* fine */ } }
    parts.length = 0; rings.length = 0; texts.length = 0;
    for (const g of Object.values(GEO)) { try { g.dispose(); } catch { /* fine */ } }
    try { ctx.engine.parts.remove(rootId); } catch { /* fine */ }
  }

  return { spawn, burst, ring, text, step, alive, dispose };
}
