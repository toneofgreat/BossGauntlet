// src/platform/services/avatar/effects.js — spec 05 §5.5: the auras that orbit, rise,
// twinkle and pulse around an avatar, and the trails it leaves behind. Everything here
// is a THREE.Sprite over one shared procedural texture, or a ribbon mesh rebuilt per
// frame; none of it is a Part and none of it ever enters the collider set (§2).
//
// Effects step on SIM ticks from rig.update(dt). Aura particles live in rig-local space
// (the group is a child of rig.group); a trail is world-space by nature — the point of a
// trail is that it stays where you were, not where you are.

import * as THREE from "../../../../assets/vendor/three.module.js";
import { AVATAR_TUNING } from "./animator.js";

const TRAIL_MAX_POINTS = AVATAR_TUNING.TRAIL_MAX_POINTS;
const TRAIL_MIN_SPEED = 2; // §5.5: below this the avatar is not moving enough to trail
const TRAIL_STEP_TICKS = 3; // §5.5: a point every third sim step
const RAINBOW_DEG_PER_S = 60;

// One 32x32 radial gradient, shared by every sprite in the process. Built lazily so the
// module stays importable somewhere without a DOM (the route check imports its siblings).
let sharedTexture = null;
function particleTexture() {
  if (sharedTexture) return sharedTexture;
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const g = canvas.getContext("2d");
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.5, "rgba(255,255,255,0.55)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  sharedTexture = new THREE.CanvasTexture(canvas);
  return sharedTexture;
}

function makeSprite() {
  const material = new THREE.SpriteMaterial({
    map: particleTexture(),
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.visible = false;
  return sprite;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// colors[0] -> colors[1] over the particle's life; a single-colour spec just holds.
function applyColor(material, colors, t) {
  const from = colors[0];
  const to = colors.length > 1 ? colors[1] : colors[0];
  if (from === to) {
    material.color.set(from);
    return;
  }
  const a = new THREE.Color(from);
  const b = new THREE.Color(to);
  material.color.setRGB(lerp(a.r, b.r, t), lerp(a.g, b.g, t), lerp(a.b, b.b, t));
}

// ---------------------------------------------------------------------------
// Auras (§5.5 motions 1-4).
// ---------------------------------------------------------------------------

// Pool size is what the motion can have alive at once: a fixed ring for orbit/twinkle,
// and for rise however many a `rate` spawn rate keeps in the air over one lifetime.
function poolSize(spec) {
  if (spec.motion === "orbit") return Math.max(1, spec.count || 1);
  if (spec.motion === "twinkle") return Math.max(1, spec.count || 1);
  if (spec.motion === "rise") return Math.ceil((spec.rate || 1) * (spec.lifetime || 1)) + 2;
  return 0; // pulse's ring is a mesh, not a pool; its sub-emitter builds its own
}

function createOrbit(group, spec, sprites) {
  let t = 0;
  const count = sprites.length;
  const size = spec.size ? spec.size[0] : 0.2;
  for (const s of sprites) {
    s.visible = true;
    s.scale.set(size, size, 1);
    s.material.color.set(spec.colors[0]);
    s.material.opacity = 1;
  }
  return {
    update(dt) {
      t += dt;
      for (let i = 0; i < count; i++) {
        const deg = (360 * i) / count + (spec.speed || 0) * t;
        const rad = (deg * Math.PI) / 180;
        const bob = (spec.bob || 0) * Math.sin(2 * Math.PI * 0.5 * t + i);
        sprites[i].position.set(
          (spec.radius || 1) * Math.cos(rad),
          (spec.height || 0) + bob,
          (spec.radius || 1) * Math.sin(rad)
        );
      }
    },
  };
}

function createRise(group, spec, sprites) {
  const live = sprites.map(() => null);
  let spawnDebt = 0;
  const lifetime = spec.lifetime || 1;
  return {
    update(dt) {
      spawnDebt += (spec.rate || 0) * dt;
      for (let i = 0; i < sprites.length; i++) {
        const p = live[i];
        if (p) {
          p.age += dt;
          if (p.age >= lifetime) {
            live[i] = null;
            sprites[i].visible = false;
            continue;
          }
          const k = p.age / lifetime;
          const wob = spec.wobble || 0;
          const phase = 2 * Math.PI * 2 * p.age;
          p.x += wob * Math.sin(phase) * dt;
          p.z += wob * Math.cos(phase) * dt;
          p.y += (spec.speed || 0) * dt;
          sprites[i].position.set(p.x, p.y, p.z);
          const size = lerp(spec.size[0], spec.size[1], k);
          sprites[i].scale.set(size, size, 1);
          sprites[i].material.opacity = 1 - k;
          applyColor(sprites[i].material, spec.colors, k);
          continue;
        }
        if (spawnDebt < 1) continue;
        spawnDebt -= 1;
        const alpha = Math.random() * Math.PI * 2;
        live[i] = {
          age: 0,
          x: (spec.radius || 0) * Math.cos(alpha),
          y: spec.height || 0,
          z: (spec.radius || 0) * Math.sin(alpha),
        };
        sprites[i].visible = true;
      }
      if (spawnDebt > 4) spawnDebt = 4; // a starved frame must not burst the pool later
    },
  };
}

function createTwinkle(group, spec, sprites) {
  const live = sprites.map(() => null);
  let spawnDebt = 0;
  const lifetime = spec.lifetime || 0.6;
  const size = spec.size ? spec.size[0] : 0.14;
  return {
    update(dt) {
      spawnDebt += (spec.rate || 0) * dt;
      for (let i = 0; i < sprites.length; i++) {
        const p = live[i];
        if (p) {
          p.age += dt;
          if (p.age >= lifetime) {
            live[i] = null;
            sprites[i].visible = false;
            continue;
          }
          // 0 -> 1 -> 0 triangle: a spark that arrives and leaves rather than pops.
          const k = p.age / lifetime;
          sprites[i].material.opacity = 1 - Math.abs(k * 2 - 1);
          continue;
        }
        if (spawnDebt < 1) continue;
        spawnDebt -= 1;
        const alpha = Math.random() * Math.PI * 2;
        const r = spec.radius || 1;
        live[i] = { age: 0 };
        sprites[i].position.set(r * Math.cos(alpha), 0.5 + Math.random() * 4, r * Math.sin(alpha));
        sprites[i].scale.set(size, size, 1);
        sprites[i].material.color.set(spec.colors[Math.floor(Math.random() * spec.colors.length)]);
        sprites[i].material.opacity = 0;
        sprites[i].visible = true;
      }
      if (spawnDebt > 4) spawnDebt = 4;
    },
  };
}

// A flat ring that grows out of the avatar and fades, restarting every `lifetime`.
function createPulse(group, spec, held) {
  const geo = new THREE.TorusGeometry(spec.radius || 1, 0.05, 8, 32);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(spec.colors[0]),
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = -Math.PI / 2; // torus builds in XY; lay it flat
  ring.position.y = spec.height || 0;
  group.add(ring);
  held.geometries.push(geo);
  held.materials.push(mat);
  const lifetime = spec.lifetime || 1;
  let t = 0;
  return {
    update(dt) {
      t += dt;
      if (t >= lifetime) t -= lifetime;
      const k = t / lifetime;
      const grow = 1 + ((spec.speed || 0) * t) / Math.max(0.001, spec.radius || 1);
      ring.scale.set(grow, grow, 1);
      mat.opacity = 1 - k;
    },
  };
}

// createAura(parent, spec) -> { update(dt), dispose() } | null
export function createAura(parent, spec) {
  if (!spec || !spec.motion || !Array.isArray(spec.colors) || !spec.colors.length) return null;
  const group = new THREE.Group();
  group.name = "OofAura";
  parent.add(group);
  const held = { geometries: [], materials: [], sprites: [] };
  const movers = [];

  const n = poolSize(spec);
  const sprites = [];
  for (let i = 0; i < n; i++) {
    const s = makeSprite();
    group.add(s);
    sprites.push(s);
    held.sprites.push(s);
  }
  if (spec.motion === "orbit") movers.push(createOrbit(group, spec, sprites));
  else if (spec.motion === "rise") movers.push(createRise(group, spec, sprites));
  else if (spec.motion === "twinkle") movers.push(createTwinkle(group, spec, sprites));
  else if (spec.motion === "pulse") {
    movers.push(createPulse(group, spec, held));
    // §5.8's aura_storm is the one two-emitter aura: rings plus a ring of orbiters.
    if (spec.sub && spec.sub.motion === "orbit" && spec.sub.count > 0) {
      const subSprites = [];
      for (let i = 0; i < spec.sub.count; i++) {
        const s = makeSprite();
        group.add(s);
        subSprites.push(s);
        held.sprites.push(s);
      }
      movers.push(createOrbit(group, { ...spec.sub, colors: spec.colors }, subSprites));
    }
  }

  return {
    update(dt) {
      for (const m of movers) m.update(dt);
    },
    dispose() {
      if (group.parent) group.parent.remove(group);
      for (const s of held.sprites) s.material.dispose();
      for (const g of held.geometries) g.dispose();
      for (const m of held.materials) m.dispose();
      held.sprites.length = 0;
      held.geometries.length = 0;
      held.materials.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Trails (§5.5). World space: a trail marks where you have been.
// ---------------------------------------------------------------------------

function hueColor(deg) {
  const c = new THREE.Color();
  c.setHSL(((deg % 360) + 360) / 360 % 1, 0.85, 0.55);
  return c;
}

// createTrail(scene, spec, read) -> { update(dt), dispose() } | null
// `read()` answers { pos:[x,y,z], yaw, speed } in world space — the trail asks the rig
// rather than holding a reference to physics, so it stays a pure visual.
export function createTrail(scene, spec, read) {
  if (!spec || !spec.style || !Array.isArray(spec.colors) || !spec.colors.length) return null;
  const rainbow = spec.colors[0] === "rainbow";
  const fade = spec.fade || 0.5;
  const held = { geometries: [], materials: [], sprites: [] };
  let hue = 0;
  let tick = 0;

  // ---- ribbon ----
  const points = []; // { x, y, z, px, pz, age }
  let ribbon = null;
  let ribbonGeo = null;
  let ribbonMat = null;
  if (spec.style === "ribbon") {
    ribbonGeo = new THREE.BufferGeometry();
    ribbonGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(TRAIL_MAX_POINTS * 6), 3));
    ribbonGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array(TRAIL_MAX_POINTS * 6), 3));
    ribbonGeo.setAttribute("alpha", new THREE.BufferAttribute(new Float32Array(TRAIL_MAX_POINTS * 2), 1));
    ribbonMat = new THREE.MeshBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    ribbon = new THREE.Mesh(ribbonGeo, ribbonMat);
    ribbon.frustumCulled = false;
    scene.add(ribbon);
    held.geometries.push(ribbonGeo);
    held.materials.push(ribbonMat);
  }

  // ---- loose particles (the `particles` style, and a ribbon's embers) ----
  const emberRate = spec.style === "ribbon" ? spec.emberRate || 0 : spec.rate || 0;
  const emberLife = spec.style === "ribbon" ? 0.6 : fade;
  const emberPool = [];
  const emberLive = [];
  if (emberRate > 0) {
    const n = Math.ceil(emberRate * emberLife) + 2;
    for (let i = 0; i < n; i++) {
      const s = makeSprite();
      scene.add(s);
      emberPool.push(s);
      emberLive.push(null);
      held.sprites.push(s);
    }
  }
  let emberDebt = 0;

  function rebuildRibbon() {
    const pos = ribbonGeo.getAttribute("position");
    const col = ribbonGeo.getAttribute("color");
    const base = rainbow ? hueColor(hue) : new THREE.Color(spec.colors[0]);
    const width = spec.width || 0.6;
    let v = 0;
    const idx = [];
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const a = Math.max(0, 1 - p.age / fade);
      const c = rainbow ? hueColor(hue - i * 8) : base;
      // Two verts per point: the ribbon is a strip standing up from the feet.
      pos.setXYZ(v, p.x, p.y + 0.1, p.z);
      col.setXYZ(v, c.r * a, c.g * a, c.b * a);
      v += 1;
      pos.setXYZ(v, p.x, p.y + 0.1 + width, p.z);
      col.setXYZ(v, c.r * a, c.g * a, c.b * a);
      v += 1;
      if (i > 0) {
        const b = (i - 1) * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    for (; v < TRAIL_MAX_POINTS * 2; v++) {
      pos.setXYZ(v, 0, -10000, 0);
      col.setXYZ(v, 0, 0, 0);
    }
    pos.needsUpdate = true;
    col.needsUpdate = true;
    ribbonGeo.setIndex(idx);
    ribbonGeo.setDrawRange(0, idx.length);
  }

  return {
    update(dt) {
      const s = read();
      if (!s || !Array.isArray(s.pos)) return;
      hue += RAINBOW_DEG_PER_S * dt;
      const moving = (s.speed || 0) >= TRAIL_MIN_SPEED;
      tick += 1;

      if (ribbon) {
        for (const p of points) p.age += dt;
        while (points.length && points[0].age > fade) points.shift();
        if (moving && tick % TRAIL_STEP_TICKS === 0) {
          points.push({ x: s.pos[0], y: s.pos[1], z: s.pos[2], age: 0 });
          while (points.length > TRAIL_MAX_POINTS) points.shift();
        }
        ribbon.visible = points.length > 1;
        if (ribbon.visible) rebuildRibbon();
      }

      if (emberRate > 0) {
        if (moving) emberDebt += emberRate * dt;
        for (let i = 0; i < emberPool.length; i++) {
          const live = emberLive[i];
          if (live) {
            live.age += dt;
            if (live.age >= emberLife) {
              emberLive[i] = null;
              emberPool[i].visible = false;
              continue;
            }
            const k = live.age / emberLife;
            live.y += (spec.style === "ribbon" ? 1.0 : 0.6) * dt;
            emberPool[i].position.set(live.x, live.y, live.z);
            const size = spec.style === "ribbon" ? lerp(0.12, 0.02, k) : live.size;
            emberPool[i].scale.set(size, size, 1);
            emberPool[i].material.opacity = 1 - k;
            continue;
          }
          if (emberDebt < 1) continue;
          emberDebt -= 1;
          emberLive[i] = {
            age: 0,
            x: s.pos[0] + (Math.random() - 0.5) * 0.6,
            y: s.pos[1] + 0.1,
            z: s.pos[2] + (Math.random() - 0.5) * 0.6,
            size: 0.12 + Math.random() * 0.08,
          };
          emberPool[i].material.color.copy(rainbow ? hueColor(hue) : new THREE.Color(spec.colors[0]));
          emberPool[i].material.opacity = 1;
          emberPool[i].visible = true;
        }
        if (emberDebt > 4) emberDebt = 4;
      }
    },
    dispose() {
      if (ribbon && ribbon.parent) ribbon.parent.remove(ribbon);
      for (const s of held.sprites) {
        if (s.parent) s.parent.remove(s);
        s.material.dispose();
      }
      for (const g of held.geometries) g.dispose();
      for (const m of held.materials) m.dispose();
      held.sprites.length = 0;
      held.geometries.length = 0;
      held.materials.length = 0;
      points.length = 0;
    },
  };
}
