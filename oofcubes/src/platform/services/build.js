// src/platform/services/build.js — the shared build. Spec 18 owns this file.
//
// One job: keep the parts in MY world identical to the parts the server says the room
// has. Everybody runs this, leader or not, because a build that only its author could
// see would not be building together — it would be building alone in public.
//
// The server is the single source of truth for what exists. This module never invents a
// part, never keeps one the server has removed, and never edits one locally and hopes:
// even the leader's own changes are drawn when they come back off the socket. That is
// slower by one round trip and it is the reason everyone sees the same thing.

const AURA_RING_SEGMENTS = 24;

export function createBuild(deps = {}) {
  const { net } = deps;
  let ctx = null;
  const live = new Map();  // partId -> { def, engineId, extras: [engineId|Object3D] }
  const offs = [];
  let onChange = null;

  // ---- rendering ------------------------------------------------------------------

  function partDef(p) {
    return {
      id: `oof-build-${p.id}`,
      shape: p.shape,
      size: p.size,
      position: p.position,
      rotation: p.rotation,
      color: p.color,
      material: p.material,
      transparency: p.transparency,
      anchored: true,
      // A built part can be walked on or walked through, and the tools let you choose.
      canCollide: p.canCollide !== false,
    };
  }

  function makeTextSprite(THREE, text) {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const g = canvas.getContext("2d");
    g.clearRect(0, 0, 256, 64);
    g.fillStyle = "rgba(14,16,24,0.62)";
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = "#ffffff";
    g.font = "bold 34px system-ui, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    // The text came off a socket and has already been through the server's filter; it is
    // still drawn as text on a canvas rather than injected anywhere.
    g.fillText(text, 128, 33, 236);
    const tex = new THREE.CanvasTexture(canvas);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(4, 1, 1);
    sprite.renderOrder = 900;
    return { sprite, tex, mat };
  }

  function makeAura(THREE, p) {
    const group = new THREE.Group();
    const radius = Math.max(p.size[0], p.size[2]) * 0.8 + 1;
    if (p.aura === "ring") {
      const geo = new THREE.TorusGeometry(radius, 0.12, 8, AURA_RING_SEGMENTS);
      const mat = new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.8 });
      const ring = new THREE.Mesh(geo, mat);
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    } else if (p.aura === "glow") {
      const geo = new THREE.SphereGeometry(radius, 12, 10);
      const mat = new THREE.MeshBasicMaterial({
        color: p.color, transparent: true, opacity: 0.16, depthWrite: false,
      });
      group.add(new THREE.Mesh(geo, mat));
    } else if (p.aura === "sparks") {
      const mat = new THREE.MeshBasicMaterial({ color: p.color });
      for (let i = 0; i < 6; i++) {
        const s = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), mat);
        const a = (i / 6) * Math.PI * 2;
        s.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
        group.add(s);
      }
    }
    group.position.set(p.position[0], p.position[1], p.position[2]);
    return group;
  }

  function spawn(p) {
    if (!ctx) return;
    despawn(p.id);
    const THREE = ctx.engine.THREE;
    const parts = ctx.engine.parts;
    let engineId = null;
    try { engineId = parts.create(partDef(p)); } catch { engineId = null; }
    const extras = [];
    if (p.text) {
      const t = makeTextSprite(THREE, p.text);
      t.sprite.position.set(p.position[0], p.position[1] + p.size[1] / 2 + 1.2, p.position[2]);
      const id = parts.addCustom(t.sprite);
      extras.push({ kind: "custom", id, dispose: () => { t.mat.dispose(); t.tex.dispose(); } });
    }
    if (p.aura && p.aura !== "none") {
      const g = makeAura(THREE, p);
      const id = parts.addCustom(g);
      extras.push({
        kind: "custom",
        id,
        object: g,
        dispose: () => g.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        }),
      });
    }
    live.set(p.id, { def: p, engineId, extras });
  }

  function despawn(id) {
    const entry = live.get(id);
    if (!entry || !ctx) { live.delete(id); return; }
    const parts = ctx.engine.parts;
    if (entry.engineId !== null) { try { parts.remove(entry.engineId); } catch { /* gone */ } }
    for (const e of entry.extras) {
      try { parts.remove(e.id); } catch { /* gone */ }
      if (e.dispose) e.dispose();
    }
    live.delete(id);
  }

  function clearAll() {
    for (const id of [...live.keys()]) despawn(id);
  }

  // ---- effects ----------------------------------------------------------------------

  let t = 0;
  function update(dt) {
    if (!ctx || live.size === 0) return;
    t += dt;
    const parts = ctx.engine.parts;
    for (const entry of live.values()) {
      const p = entry.def;
      if (p.effect === "spin" && entry.engineId !== null) {
        try { parts.setRotation(entry.engineId, [p.rotation[0], (p.rotation[1] + t * 60) % 360, p.rotation[2]]); }
        catch { /* the part went away mid-frame */ }
      } else if (p.effect === "bob" && entry.engineId !== null) {
        const y = p.position[1] + Math.sin(t * 2) * 0.6;
        try { parts.setPosition(entry.engineId, [p.position[0], y, p.position[2]]); }
        catch { /* same */ }
      } else if (p.effect === "pulse" && entry.engineId !== null) {
        const a = 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(t * 3));
        try { parts.setTransparency(entry.engineId, Math.min(0.95, a)); } catch { /* same */ }
      }
      for (const e of entry.extras) {
        if (e.object) e.object.rotation.y += dt * 0.8;
      }
    }
  }

  // ---- wire ---------------------------------------------------------------------------

  function handle(m) {
    if (m.op === "clear") { clearAll(); if (onChange) onChange(); return; }
    if (m.op === "remove") { despawn(m.id); if (onChange) onChange(); return; }
    if (m.op === "set" && m.part) { spawn(m.part); if (onChange) onChange(); }
  }

  return {
    // Called by the shell on every Place load; the ctx is what owns the engine.
    attach(nextCtx) {
      ctx = nextCtx;
      clearAll();
      while (offs.length) offs.pop()();
      if (!net || typeof net.on !== "function") return;
      offs.push(net.on("build", handle));
      // `welcome` carries whatever the room has already built (spec 18 §5.2), so somebody
      // arriving late sees the same world as everybody already there.
      offs.push(net.on("welcome", (w) => {
        clearAll();
        for (const p of (w && w.build) || []) spawn(p);
        if (onChange) onChange();
      }));
    },
    detach() {
      while (offs.length) offs.pop()();
      clearAll();
      ctx = null;
    },
    update,
    count: () => live.size,
    ids: () => [...live.keys()],
    get: (id) => (live.get(id) ? live.get(id).def : null),
    onChange(fn) { onChange = fn; },

    // ---- the tools' outbound half. Nothing here draws anything: the change is drawn
    // when the server echoes it back, so the leader sees exactly what everyone else does.
    add(part) { return net && net.send({ t: "build", op: "add", part }); },
    updatePart(id, part) { return net && net.send({ t: "build", op: "update", id, part }); },
    remove(id) { return net && net.send({ t: "build", op: "remove", id }); },
    clear() { return net && net.send({ t: "build", op: "clear" }); },
  };
}
