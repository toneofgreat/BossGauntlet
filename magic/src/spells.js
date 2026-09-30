/* ===========================================================================
   spells.js - eleven spells, what they look like leaving the wand, and what
   they do when they arrive.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { solid, glow } from './avatar.js';
import { AU, R, rnd, clamp, lerp, TAU, pick } from './core.js';

export const SPELLS = {
  bolt:   { id: 'bolt',   name: 'STUN',    glyph: '✦', col: 0xff3b6b, speed: 30, kind: 'bolt',
            words: 'A red bolt. It knocks things over and wakes things up.' },
  light:  { id: 'light',  name: 'LIGHT',   glyph: '☼', col: 0xffe9a8, speed: 0,  kind: 'self',
            words: 'A light on the end of your wand. Simple, and it has saved more lives than the rest put together.' },
  lift:   { id: 'lift',   name: 'LIFT',    glyph: '⇈', col: 0x8fd6ff, speed: 22, kind: 'bolt',
            words: 'Picks a thing up and holds it in the air. Swish, and flick.' },
  shield: { id: 'shield', name: 'SHIELD',  glyph: '○', col: 0x7fd4ff, speed: 0,  kind: 'self',
            words: 'A round wall of nothing, in front of you, for as long as you can hold it.' },
  fire:   { id: 'fire',   name: 'FIRE',    glyph: '♨', col: 0xff8a2a, speed: 24, kind: 'bolt',
            words: 'A rope of fire. Careful with it indoors.' },
  freeze: { id: 'freeze', name: 'FREEZE',  glyph: '❄', col: 0x9fe8ff, speed: 26, kind: 'bolt',
            words: 'Whatever it lands on stops, and thinks about what it has done.' },
  mend:   { id: 'mend',   name: 'MEND',    glyph: '✚', col: 0x8fffc0, speed: 20, kind: 'bolt',
            words: 'Puts a broken thing back the way it was. Works on chairs. Does not work on people.' },
  change: { id: 'change', name: 'CHANGE',  glyph: '✧', col: 0xc08fff, speed: 24, kind: 'bolt',
            words: 'Turns one thing into another thing. The hard part is turning it back.' },
  song:   { id: 'song',   name: 'SONG',    glyph: '♫', col: 0xffc0e8, speed: 0,  kind: 'aura',
            words: 'Not really a spell. A tune that puts big frightening things to sleep.' },
  track:  { id: 'track',  name: 'TRACK',   glyph: '✲', col: 0xa8ff8f, speed: 0,  kind: 'aura',
            words: 'Shows you where something went, in glowing footprints, for about ten seconds.' },
  blast:  { id: 'blast',  name: 'PUSH',    glyph: '⇊', col: 0xffe9a8, speed: 27, kind: 'bolt',
            words: 'It does not hurt anything. It moves it, hard, in the direction you were pointing.' },
  bind:   { id: 'bind',   name: 'ROPES',   glyph: '≋', col: 0xa8ff8f, speed: 23, kind: 'bolt',
            words: 'Rope out of nowhere, wrapped twice round whatever you aimed at. It holds for about three seconds.' },
  guard:  { id: 'guard',  name: 'GUARDIAN',glyph: '❈', col: 0xdff2ff, speed: 14, kind: 'guard',
            words: 'A silver animal made of the happiest thing that ever happened to you. It is the only thing the cold ones are afraid of.' }
};
export const SPELL_ORDER = ['bolt', 'light', 'lift', 'shield', 'fire', 'freeze', 'mend', 'change',
                            'blast', 'bind', 'song', 'track', 'guard'];

/* ============================================================== effects == */
export class FX {
  constructor(group) {
    this.group = group;
    this.bits = [];
    this.rings = [];
    this.pool = [];
  }
  burst(pos, col, n, spread, size) {
    n = n || 14;
    for (let i = 0; i < n; i++) {
      let m = this.pool.pop();
      if (!m) {
        m = new THREE.Mesh(new THREE.SphereGeometry(1, 6, 5), new THREE.MeshBasicMaterial({ transparent: true }));
        this.group.add(m);
      }
      m.visible = true;
      m.material.color.setHex(col);
      m.material.opacity = 1;
      m.position.copy(pos);
      const s = (size || 0.09) * rnd(0.5, 1.5);
      m.scale.setScalar(s);
      this.bits.push({
        m, life: rnd(0.35, 0.9), max: 0.9, s,
        v: new THREE.Vector3(rnd(-1, 1), rnd(-0.4, 1.4), rnd(-1, 1)).multiplyScalar((spread || 4) * rnd(0.3, 1)),
        g: -6
      });
    }
  }
  ring(pos, col, max, life) {
    const m = new THREE.Mesh(
      new THREE.TorusGeometry(1, 0.05, 6, 26),
      new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, fog: false })
    );
    m.position.copy(pos);
    m.lookAt(R.camera.position);
    this.group.add(m);
    this.rings.push({ m, t: 0, life: life || 0.5, max: max || 3 });
  }
  update(dt) {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.life -= dt;
      if (b.life <= 0) {
        b.m.visible = false;
        this.pool.push(b.m);
        this.bits.splice(i, 1);
        continue;
      }
      b.v.y += b.g * dt;
      b.m.position.addScaledVector(b.v, dt);
      const k = clamp(b.life / b.max, 0, 1);
      b.m.material.opacity = k;
      b.m.scale.setScalar(b.s * (0.4 + k * 0.8));
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.life;
      if (k >= 1) {
        this.group.remove(r.m);
        r.m.geometry.dispose(); r.m.material.dispose();
        this.rings.splice(i, 1);
        continue;
      }
      r.m.scale.setScalar(0.1 + k * r.max);
      r.m.material.opacity = 0.9 * (1 - k);
      r.m.lookAt(R.camera.position);
    }
  }
}

/* =============================================================== caster == */
export class Caster {
  constructor(ctx) {
    this.ctx = ctx;
    this.shots = [];
    this.fx = new FX(ctx.world.group);
    this.shield = null;
    this.shieldT = 0;
    this.aura = null;
    this.cool = 0;
    this.lightOn = false;
  }
  /* targets: [{obj|pos, r, tag, onHit(spellId, shot)}] supplied by the chapter */
  cast(spellId, from, dir) {
    const S = SPELLS[spellId];
    if (!S) return null;
    if (this.cool > 0) return null;
    this.cool = spellId === 'bolt' ? 0.34 : 0.5;
    AU.sfx(S.kind === 'self' ? (spellId === 'light' ? 'light' : 'shield') : 'cast');
    this.fx.burst(from, S.col, 7, 2.4, 0.055);

    if (spellId === 'light') {
      this.lightOn = !this.lightOn;
      return { self: true };
    }
    if (spellId === 'shield') {
      this.raiseShield();
      return { self: true };
    }
    if (spellId === 'song' || spellId === 'track') {
      this.pulse(spellId, from);
      return { self: true };
    }

    const m = new THREE.Mesh(
      new THREE.SphereGeometry(spellId === 'guard' ? 0.34 : 0.15, 12, 10),
      new THREE.MeshBasicMaterial({ color: S.col, fog: false })
    );
    m.position.copy(from);
    this.ctx.world.group.add(m);
    const l = new THREE.PointLight(S.col, spellId === 'guard' ? 14 : 5, spellId === 'guard' ? 20 : 9, 2);
    m.add(l);
    let guardMesh = null;
    if (spellId === 'guard') guardMesh = buildGuardian(S.col, m);
    const shot = {
      id: spellId, m, guardMesh,
      v: dir.clone().normalize().multiplyScalar(S.speed),
      life: spellId === 'guard' ? 6 : 3.2,
      trail: []
    };
    this.shots.push(shot);
    return shot;
  }
  raiseShield() {
    if (this.shield) return;
    const g = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 22, 16),
      new THREE.MeshStandardMaterial({
        color: 0x7fd4ff, emissive: 0x2a86c0, emissiveIntensity: 0.9,
        transparent: true, opacity: 0.22, roughness: 0.1, metalness: 0.4, side: THREE.DoubleSide
      })
    );
    this.ctx.world.group.add(g);
    this.shield = g;
    this.shieldT = 3.2;
  }
  pulse(kind, from) {
    const col = SPELLS[kind].col;
    this.fx.ring(from, col, 9, 1.1);
    this.fx.burst(from, col, 22, 5, 0.07);
    if (kind === 'song') {
      [523, 659, 784, 1046].forEach((f, i) => AU.tone({ f, dur: 0.9, type: 'sine', g: 0.11, at: i * 0.13 }));
    } else AU.sfx('light');
    if (this.ctx.onPulse) this.ctx.onPulse(kind, from);
  }
  hitTest(shot) {
    const targets = this.ctx.targets || [];
    for (const t of targets) {
      if (t.dead) continue;
      if (t.obj && !t.obj.visible) continue;
      const p = t.obj ? t.obj.getWorldPosition(TMP) : t.pos;
      const r = (t.r || 1) + 0.25;
      const s = shot.m.position;
      const cy = p.y + clamp(s.y - p.y, 0, t.h || 0);    // nearest point up its body
      const dx = s.x - p.x, dy = s.y - cy, dz = s.z - p.z;
      if (dx * dx + dy * dy + dz * dz <= r * r) return t;
    }
    return null;
  }
  update(dt) {
    if (this.cool > 0) this.cool -= dt;
    this.fx.update(dt);
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      s.m.position.addScaledVector(s.v, dt);
      if (s.id === 'fire') {
        this.fx.burst(s.m.position, 0xff9a2a, 1, 1.2, 0.07);
      } else if (s.id === 'guard') {
        this.fx.burst(s.m.position, 0xdff2ff, 2, 0.8, 0.08);
        if (s.guardMesh) s.guardMesh.rotation.y += dt * 3;
      } else if (Math.random() < 0.6) {
        this.fx.burst(s.m.position, SPELLS[s.id].col, 1, 0.8, 0.05);
      }
      const hit = this.hitTest(s);
      const ground = s.m.position.y < 0.05;
      const wall = this.ctx.world.colliders && hitsWall(s.m.position, this.ctx.world.colliders);
      if (hit || ground || wall || s.life <= 0) {
        if (hit) {
          this.fx.burst(s.m.position, SPELLS[s.id].col, 20, 5, 0.1);
          this.fx.ring(s.m.position, SPELLS[s.id].col, 3.2, 0.4);
          AU.sfx(s.id === 'bolt' ? 'zap' : 'hit');
          if (hit.onHit) hit.onHit(s.id, s);
        } else if (ground || wall) {
          this.fx.burst(s.m.position, SPELLS[s.id].col, 8, 3, 0.07);
          AU.sfx('hit');
          if (this.ctx.onMiss) this.ctx.onMiss(s.id, s.m.position.clone());
        }
        this.ctx.world.group.remove(s.m);
        s.m.geometry.dispose(); s.m.material.dispose();
        this.shots.splice(i, 1);
      }
    }
    // shield sits in front of you and fades
    if (this.shield) {
      this.shieldT -= dt;
      const p = this.ctx.player;
      const f = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      this.shield.position.copy(p.pos).addScaledVector(f, 1.1).add(new THREE.Vector3(0, 1.0, 0));
      this.shield.material.opacity = 0.1 + clamp(this.shieldT / 3.2, 0, 1) * 0.22;
      this.shield.rotation.y += dt * 0.6;
      if (this.shieldT <= 0) {
        this.ctx.world.group.remove(this.shield);
        this.shield.geometry.dispose(); this.shield.material.dispose();
        this.shield = null;
      }
    }
    // the wand light
    const wl = this.ctx.player.wand.userData.light;
    const tip = this.ctx.player.wand.userData.tip;
    const want = this.lightOn ? 9 : 0.0;
    wl.intensity = lerp(wl.intensity, want, 1 - Math.pow(0.001, dt));
    wl.distance = 16;
    tip.material = this.lightOn ? GLOW_ON : GLOW_OFF;
  }
  shieldUp() { return !!this.shield; }
  clear() {
    this.shots.forEach((s) => this.ctx.world.group.remove(s.m));
    this.shots.length = 0;
  }
}
const TMP = new THREE.Vector3();
const GLOW_ON = new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false });
const GLOW_OFF = new THREE.MeshStandardMaterial({ color: 0xffe9a8, emissive: 0x6b5a20, emissiveIntensity: 0.4, roughness: 0.4 });

function hitsWall(p, boxes) {
  for (const b of boxes) {
    if (p.x > b.min.x && p.x < b.max.x && p.y > b.min.y && p.y < b.max.y && p.z > b.min.z && p.z < b.max.z) return true;
  }
  return false;
}

/* a silver animal, for the cold ones */
function buildGuardian(col, parent) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, fog: false });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), m);
  body.scale.set(1.7, 0.85, 0.85);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), m);
  head.position.set(0.8, 0.28, 0);
  g.add(head);
  const snout = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.4, 8), m);
  snout.position.set(1.08, 0.2, 0); snout.rotation.z = -Math.PI / 2;
  g.add(snout);
  // antlers, because a stag is the traditional shape
  [-1, 1].forEach((s) => {
    for (let i = 0; i < 3; i++) {
      const h = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.34, 5), m);
      h.position.set(0.82 + i * 0.1, 0.62 + i * 0.12, s * (0.12 + i * 0.08));
      h.rotation.z = s * 0.4; h.rotation.x = s * 0.5;
      g.add(h);
    }
  });
  [-1, 1].forEach((s) => {
    for (let i = 0; i < 2; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.03, 0.6, 6), m);
      l.position.set(-0.3 + i * 0.75, -0.5, s * 0.3);
      g.add(l);
    }
  });
  const tail = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), m);
  tail.position.set(-0.86, 0.2, 0);
  g.add(tail);
  g.scale.setScalar(1.1);
  parent.add(g);
  return g;
}

/* ------------------------------------------------ a thing you can aim at -- */
export function makeTarget(world, opt) {
  const g = new THREE.Group();
  const kind = opt.kind || 'dummy';
  g.userData.hitH = 2.0;
  if (kind === 'dummy') {
    const straw = solid(0xc8a44a, 1);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.7, 8), solid(0x4a3a24, 0.9));
    post.position.y = 0.85; g.add(post);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.8, 12), straw);
    body.position.y = 1.2; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 9), straw);
    head.position.y = 1.75; g.add(head);
    const arms = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), straw);
    arms.position.y = 1.42; arms.rotation.z = Math.PI / 2; g.add(arms);
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.34, 10), solid(0x5a2030, 0.9));
    hat.position.y = 2.0; g.add(hat);
  } else if (kind === 'bottle') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.4, 12), new THREE.MeshStandardMaterial({
      color: 0x6fb8a0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.8
    }));
    b.position.y = 0.2; g.add(b);
    const n = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.18, 10), b.material);
    n.position.y = 0.48; g.add(n);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.08, 8), solid(0xc8a070, 0.9));
    cork.position.y = 0.6; g.add(cork);
  } else if (kind === 'feather') {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.013, 0.38, 6), solid(0xe8e0cc, 0.8));
    shaft.position.y = 0.19; g.add(shaft);
    const vane = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), solid(0xf4eede, 0.95));
    vane.scale.set(0.42, 1.9, 0.08);
    vane.position.y = 0.23; g.add(vane);
    const vane2 = vane.clone();
    vane2.scale.set(0.3, 1.3, 0.07);
    vane2.position.y = 0.3; vane2.rotation.z = 0.2; g.add(vane2);
    g.rotation.z = 0.28;
  } else if (kind === 'crate') {
    const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.9 }));
    w.position.y = 0.3; g.add(w);
  } else if (kind === 'orb') {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 14), glow(opt.col || 0xffd070, 1.4));
    o.position.y = 0; g.add(o);
    const l = new THREE.PointLight(opt.col || 0xffd070, 3.5, 9, 2);
    g.add(l);
  }
  g.position.set(opt.x || 0, opt.y || 0, opt.z || 0);
  g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  world.group.add(g);
  return g;
}
