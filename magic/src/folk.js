/* ===========================================================================
   folk.js - the people standing about in a chapter, and talking to them.

   The cast is pure data in folk/*.js: a name, what kind of person, roughly how
   far off they should be, and what they say. Nothing in that data knows where
   anything is, because the chapters are built by hand and a hand-written
   coordinate would end up inside a wall. This file finds each of them a place
   to stand that is (a) not inside a collider, (b) not on the far side of one
   from where the player starts, and (c) on ground at about the player's level.

   Walk near someone and their name fades in over their head; E (or the TALK
   button on a phone) hears them out. The second time you ask, they say
   something else.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { $, R, AU, UI, rnd, pick, clamp, damp, TAU, angWrap } from './core.js';
import { buildAvatar, poseIdle, solid, glow } from './avatar.js';
import { castFor } from './folk/index.js';

const ZONES = { near: [3.4, 7], mid: [8, 16], far: [17, 30] };
const SCALE = { teacher: 1.06, student: 0.95, caretaker: 1.02, shopkeeper: 1.0, ghost: 1.0, creature: 1.0 };

/* a look that is stable for a given person, so they do not change between visits */
function lookFor(name, kind) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  const n = (k) => ((h >>> (k * 4)) & 0xff);
  const old = kind === 'teacher' || kind === 'caretaker' || kind === 'shopkeeper';
  return {
    skin: n(0) % 7,
    hair: old ? 2 + (n(1) % 5) : n(1) % 7,
    hairCol: old ? (n(2) % 2 ? 5 : 0) : n(2) % 7,
    eyes: n(3) % 6,
    wear: old ? 4 + (n(4) % 3) : n(4) % 4,
    name
  };
}

/* ------------------------------------------------------- the name over them */
function plate(name) {
  const c = document.createElement('canvas');
  c.width = 320; c.height = 72;
  const x = c.getContext('2d');
  x.font = '30px "Iowan Old Style", Palatino, Georgia, serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.shadowColor = 'rgba(0,0,0,.95)'; x.shadowBlur = 12;
  x.fillStyle = 'rgba(234,228,214,.95)';
  x.fillText(name, 160, 38);
  x.fillText(name, 160, 38);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: t, transparent: true, opacity: 0, depthWrite: false, fog: true
  }));
  sp.material.__owned = true;
  sp.scale.set(1.8, 0.4, 1);
  return sp;
}

/* ------------------------------------------------- something small and odd - */
function creature(seed) {
  const g = new THREE.Group();
  const fur = solid([0x6b5a44, 0x4a4a52, 0x5a4030, 0x3a4a3a][seed % 4], 1);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 9), fur);
  body.position.y = 0.36; body.scale.set(1, 0.85, 1.2);
  body.castShadow = true;
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 9), fur);
  head.position.set(0, 0.68, 0.22);
  head.castShadow = true;
  g.add(head);
  [-1, 1].forEach((s) => {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.26, 7), fur);
    ear.position.set(s * 0.14, 0.86, 0.18);
    ear.rotation.z = s * 0.3;
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 7), glow(0xffd86a, 1.8));
    eye.position.set(s * 0.09, 0.72, 0.41);
    g.add(eye);
  });
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.01, 0.5, 6), fur);
  tail.position.set(0, 0.4, -0.38);
  tail.rotation.x = 1.1;
  g.add(tail);
  g.userData.parts = null;             // no avatar rig: posed by hand below
  g.userData.head = head;
  return g;
}

/* ------------------------------------------------------------- where to put */
function segBox(ax, az, bx, bz, minx, minz, maxx, maxz) {
  // slab test, in the ground plane
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 2; i++) {
    const p = i ? dz : dx, o = i ? az : ax;
    const lo = i ? minz : minx, hi = i ? maxz : maxx;
    if (Math.abs(p) < 1e-6) { if (o < lo || o > hi) return false; continue; }
    let a = (lo - o) / p, b = (hi - o) / p;
    if (a > b) { const t = a; a = b; b = t; }
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}
function inside(world, x, z, pad) {
  for (const c of world.colliders) {
    if (c.max.y < 0.5) continue;
    if (x > c.min.x - pad && x < c.max.x + pad && z > c.min.z - pad && z < c.max.z + pad) return true;
  }
  return false;
}
function blocked(world, ax, az, bx, bz) {
  for (const c of world.colliders) {
    if (c.max.y < 0.9) continue;                 // you can step over it
    if (segBox(ax, az, bx, bz, c.min.x - 0.2, c.min.z - 0.2, c.max.x + 0.2, c.max.z + 0.2)) return true;
  }
  return false;
}
function spotFor(world, from, zone, i, n, bounds, taken) {
  const [r0, r1] = ZONES[zone] || ZONES.mid;
  const gy = world.groundY ? world.groundY(from.x, from.z) : 0;
  for (let t = 0; t < 48; t++) {
    const a = ((i + 0.5) / n) * TAU + t * 0.41;
    const r = r0 + (r1 - r0) * ((t % 6) / 5);
    const x = from.x + Math.cos(a) * r, z = from.z + Math.sin(a) * r;
    if (bounds && (Math.abs(x) > bounds - 2 || Math.abs(z) > bounds - 2)) continue;
    if (inside(world, x, z, 0.9)) continue;
    // and not on top of somebody already standing there
    if (taken.some((p) => Math.hypot(p.x - x, p.z - z) < 2.6)) continue;
    if (blocked(world, from.x, from.z, x, z)) continue;
    const y = world.groundY ? world.groundY(x, z) : 0;
    if (Math.abs(y - gy) > 1.4) continue;
    return new THREE.Vector3(x, y, z);
  }
  // nothing clean: stand them just off the spawn, spaced out, and let them be
  // awkward about it
  const a = ((i + 0.5) / n) * TAU;
  const r = 3 + i * 0.6;
  return new THREE.Vector3(from.x + Math.cos(a) * r, gy, from.z + Math.sin(a) * r);
}

/* ============================================================== populate == */
export function populate(ctx) {
  const world = ctx.world, chapter = ctx.chapter;
  const cast = castFor(chapter.id).slice(0, 5);
  const people = [];
  const from = world.spawn.clone();
  const bounds = (chapter.walkOpts && chapter.walkOpts.bounds) || (chapter.flyOpts && chapter.flyOpts.bounds) || 0;
  const flying = !!chapter.fly;

  cast.forEach((d, i) => {
    const kind = d.kind || 'student';
    const g = new THREE.Group();
    let av, light = null;
    if (kind === 'creature') {
      av = creature(i);
    } else {
      av = buildAvatar(d.look ? Object.assign(lookFor(d.name, kind), d.look) : lookFor(d.name, kind),
        { hat: kind === 'student' || kind === 'teacher' });
      av.scale.setScalar(SCALE[kind] || 1);
    }
    if (kind === 'ghost') {
      av.traverse((o) => {
        if (o.isMesh) {
          o.material = o.material.clone();
          o.material.transparent = true;
          o.material.opacity = 0.46;
          o.material.emissive = new THREE.Color(0x35718c);
          o.material.emissiveIntensity = 0.7;
          o.material.__owned = true;
          o.castShadow = false;
        }
      });
      light = new THREE.PointLight(0x6fa8d8, 3.2, 9, 2);
      light.position.y = 1.5;
      g.add(light);
    }
    g.add(av);
    const tag = plate(d.name);
    tag.position.y = kind === 'creature' ? 1.3 : 2.45;
    g.add(tag);

    // flying chapters: everyone waits where you take off from, or you would
    // never get near enough to say hello
    const zone = flying ? 'near' : (d.zone || 'mid');
    const at = spotFor(world, from, zone, i, Math.max(1, cast.length), bounds, people.map((q) => q.g.position));
    g.position.copy(at);
    const home = Math.atan2(from.x - at.x, from.z - at.z);
    g.rotation.y = home;
    world.group.add(g);

    people.push({
      data: d, kind, g, av, tag, light, home, yaw: home,
      ph: i * 1.7 + 0.3, said: false, moreI: 0, bob: 0
    });
  });

  const el = $('talk');
  let near = null;
  const talkR = flying ? 9 : 4.6;

  const api = {
    people,
    /* the closest person you could talk to, or null */
    near() { return near; },
    update(dt) {
      const p = ctx.player;
      if (!p) return;
      const t = R.elapsed;
      let best = null, bestD = 1e9;
      for (const f of people) {
        const dx = f.g.position.x - p.pos.x, dz = f.g.position.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        // alive, even when nobody is looking
        if (f.av.userData.parts) poseIdle(f.av, t + f.ph);
        if (f.kind === 'ghost') {
          f.bob += dt;
          f.av.position.y = 0.25 + Math.sin(f.bob * 0.9 + f.ph) * 0.16;
          f.g.rotation.y += dt * 0.12;
        }
        if (f.kind === 'creature') {
          f.g.children[0].rotation.y = Math.sin(t * 0.7 + f.ph) * 0.5;
          f.av.position.y = Math.abs(Math.sin(t * 2.2 + f.ph)) * 0.05;
        }
        // they turn to watch you go past, then settle back
        if (f.kind !== 'ghost') {
          const want = d < 9 ? Math.atan2(p.pos.x - f.g.position.x, p.pos.z - f.g.position.z) : f.home;
          f.yaw += angWrap(want - f.yaw) * Math.min(1, dt * 2.2);
          f.g.rotation.y = f.yaw;
        }
        // the name over the head fades in as you come up
        const want = d < 13 ? clamp((13 - d) / 5, 0, 1) * 0.95 : 0;
        f.tag.material.opacity = damp(f.tag.material.opacity, want, 6, dt);
        f.tag.visible = f.tag.material.opacity > 0.02;
        if (d < talkR && d < bestD) { best = f; bestD = d; }
      }
      near = UI.talking() ? null : best;
      if (near) {
        el.querySelector('b').textContent = near.data.name;
        el.classList.add('show');
      } else el.classList.remove('show');
    },
    /* say hello. First time you get their piece; after that, one line at a time */
    talk() {
      if (!near || UI.talking()) return false;
      const f = near;
      const d = f.data;
      let lines;
      if (!f.said && d.lines && d.lines.length) {
        lines = d.lines.slice();
        f.said = true;
      } else if (d.more && d.more.length) {
        lines = [d.more[f.moreI % d.more.length]];
        f.moreI++;
      } else {
        lines = [pick(['They have said their piece.', 'Nothing more, apparently.'])];
      }
      el.classList.remove('show');
      AU.sfx(f.kind === 'ghost' ? 'ghost' : 'page');
      UI.say(lines.map((l) => [d.name, l]));
      return true;
    },
    clear() {
      el.classList.remove('show');
      near = null;
    }
  };
  return api;
}
