/* ===========================================================================
   modes.js - the seven kinds of thing a chapter can be. Chapters supply the
   scenery and the numbers; this file supplies the game.
   ========================================================================= */
import * as THREE from '../vendor/three.module.js';
import { solid, glow } from './avatar.js';
import { AU, R, UI, rnd, rndInt, clamp, lerp, damp, TAU, pick, angWrap } from './core.js';
import { SPELLS, makeTarget } from './spells.js';
import { hurt, wandTip, aimDir, mountBroom, dismount, CAM } from './player.js';
import { buildBludger, buildSnitch, flapWings } from './foes.js';

const V = new THREE.Vector3(), V2 = new THREE.Vector3();

/* ====================================================== enemy projectiles = */
export class Hazards {
  constructor(ctx) {
    this.ctx = ctx;
    this.list = [];
  }
  fire(from, dir, o) {
    o = o || {};
    const col = o.col === undefined ? 0x8fff6a : o.col;
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(o.r || 0.22, 12, 10),
      new THREE.MeshBasicMaterial({ color: col, fog: false })
    );
    m.position.copy(from);
    this.ctx.world.group.add(m);
    const l = new THREE.PointLight(col, 4, 8, 2);
    m.add(l);
    this.list.push({
      m, v: dir.clone().normalize().multiplyScalar(o.speed || 13),
      life: o.life || 5, r: o.r || 0.22, dmg: o.dmg || 1, col,
      grav: o.grav || 0, homing: o.homing || 0
    });
  }
  update(dt) {
    const p = this.ctx.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      h.life -= dt;
      if (h.homing) {
        V.copy(p.pos).add(V2.set(0, 1, 0)).sub(h.m.position).normalize();
        h.v.lerp(V.multiplyScalar(h.v.length()), clamp(h.homing * dt, 0, 1));
      }
      if (h.grav) h.v.y -= h.grav * dt;
      h.m.position.addScaledVector(h.v, dt);
      // the shield eats it
      if (this.ctx.caster.shield) {
        const s = this.ctx.caster.shield.position;
        if (h.m.position.distanceTo(s) < 1.5) {
          this.ctx.caster.fx.burst(h.m.position, 0x7fd4ff, 14, 4, 0.08);
          AU.sfx('shield');
          this.kill(i);
          continue;
        }
      }
      V.copy(p.pos); V.y += 0.9;
      if (h.m.position.distanceTo(V) < (h.r + 0.55)) {
        if (hurt(p, h.dmg)) {
          UI.hurt(); AU.sfx('hurt'); R.kick(0.14, 0.3);
          this.ctx.caster.fx.burst(h.m.position, h.col, 16, 4, 0.09);
          if (this.ctx.onPlayerHurt) this.ctx.onPlayerHurt();
        }
        this.kill(i);
        continue;
      }
      if (h.life <= 0 || h.m.position.y < 0.02) {
        this.ctx.caster.fx.burst(h.m.position, h.col, 6, 2, 0.06);
        this.kill(i);
      }
    }
  }
  kill(i) {
    const h = this.list[i];
    this.ctx.world.group.remove(h.m);
    h.m.geometry.dispose(); h.m.material.dispose();
    this.list.splice(i, 1);
  }
  clear() { while (this.list.length) this.kill(0); }
}

/* a ring of light that races outwards along the floor and knocks you over */
export function shockwave(ctx, at, o) {
  o = o || {};
  const m = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.16, 8, 40),
    new THREE.MeshBasicMaterial({ color: o.col || 0xff7a3a, transparent: true, opacity: 0.85, fog: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.copy(at); m.position.y = 0.12;
  ctx.world.group.add(m);
  const w = { m, r: 0.6, max: o.max || 16, speed: o.speed || 13, hitDone: false, dmg: o.dmg || 1 };
  ctx.waves = ctx.waves || [];
  ctx.waves.push(w);
  AU.sfx('hit'); R.kick(0.2, 0.4);
  return w;
}
export function updateWaves(ctx, dt) {
  if (!ctx.waves) return;
  const p = ctx.player;
  for (let i = ctx.waves.length - 1; i >= 0; i--) {
    const w = ctx.waves[i];
    w.r += w.speed * dt;
    w.m.scale.setScalar(w.r);
    w.m.material.opacity = 0.85 * (1 - w.r / w.max);
    const d = Math.hypot(p.pos.x - w.m.position.x, p.pos.z - w.m.position.z);
    if (!w.hitDone && Math.abs(d - w.r) < 0.9 && p.pos.y < 1.1) {
      w.hitDone = true;
      if (hurt(p, w.dmg)) { UI.hurt(); AU.sfx('hurt'); R.kick(0.2, 0.4); if (ctx.onPlayerHurt) ctx.onPlayerHurt(); }
    }
    if (w.r >= w.max) {
      ctx.world.group.remove(w.m);
      w.m.geometry.dispose(); w.m.material.dispose();
      ctx.waves.splice(i, 1);
    }
  }
}

/* ======================================================= MODE: targets === */
export function modeTargets(ctx, cfg) {
  const list = [];
  const n = cfg.n || 6;
  for (let i = 0; i < n; i++) {
    const at = cfg.place ? cfg.place(i, n) : { x: Math.cos(i / n * TAU) * 7, y: 0, z: Math.sin(i / n * TAU) * 7 - 4 };
    const obj = makeTarget(ctx.world, { kind: cfg.kind || 'dummy', x: at.x, y: at.y, z: at.z, col: cfg.col });
    obj.userData.base = obj.position.clone();
    obj.userData.ph = Math.random() * 9;
    const t = {
      obj, r: cfg.r || 0.9, h: cfg.h === undefined ? (cfg.kind === 'orb' ? 0 : 1.2) : cfg.h, tag: 'target', hit: false,
      onHit: (spellId) => {
        if (t.hit) return;
        if (cfg.spell && spellId !== cfg.spell) {
          UI.toast('NOT THAT ONE', 0.9);
          return;
        }
        t.hit = true; t.dead = true;
        AU.sfx('good');
        ctx.caster.fx.burst(obj.position.clone().setY(obj.position.y + 0.8), SPELLS[spellId].col, 26, 5, 0.1);
        if (cfg.onHit) cfg.onHit(obj, list.filter((x) => x.hit).length, n);
        if (cfg.vanish === false) {
          obj.traverse((m) => { if (m.isMesh && m.material) { m.material = m.material.clone(); m.material.__owned = true; } });
        } else {
          obj.visible = false;
        }
        done++;
        refresh();
        if (done >= n) ctx.win(cfg.winMsg);
      }
    };
    list.push(t);
    ctx.targets.push(t);
  }
  let done = 0, time = cfg.time || 0;
  const refresh = () => {
    ctx.tally('<b>' + done + '</b> / ' + n + (time ? ' &middot; <b>' + Math.ceil(time) + '</b>s' : ''));
  };
  refresh();
  return {
    solveNext() {
      const t = list.find((q) => !q.hit);
      if (!t) return null;
      return { pos: t.obj.getWorldPosition(new THREE.Vector3()), spell: cfg.spell || 'bolt' };
    },
    update(dt) {
      if (cfg.moving) {
        list.forEach((t, i) => {
          if (t.hit) return;
          const b = t.obj.userData.base, ph = t.obj.userData.ph;
          t.obj.position.x = b.x + Math.sin(R.elapsed * (cfg.moving) + ph) * (cfg.range || 3);
          t.obj.position.z = b.z + Math.cos(R.elapsed * (cfg.moving * 0.7) + ph) * (cfg.range || 3) * 0.5;
          if (cfg.float) t.obj.position.y = b.y + Math.sin(R.elapsed * 1.6 + ph) * 0.6 + 0.6;
        });
      }
      if (cfg.time) {
        time -= dt;
        refresh();
        if (time <= 0) ctx.lose(cfg.loseMsg || 'Out of time.');
      }
    }
  };
}

/* ====================================================== MODE: sequence === */
export function modeSequence(ctx, cfg) {
  const items = cfg.items;
  let step = 0, mistakes = 0;
  const objs = items.map((it, i) => {
    const g = cfg.make(it, i, ctx);
    g.userData.item = it;
    return g;
  });
  const refresh = () => {
    ctx.goal(cfg.goalFor ? cfg.goalFor(step) : cfg.goal);
    ctx.tally('<b>' + step + '</b> / ' + items.length + (mistakes ? ' &middot; ' + mistakes + ' wrong' : ''));
  };
  objs.forEach((g, i) => {
    ctx.targets.push({
      obj: g, r: cfg.r || 1.0, h: cfg.h || 0.5, tag: 'seq',
      onHit: () => {
        if (i === cfg.order[step]) {
          step++;
          AU.sfx('good');
          ctx.caster.fx.ring(g.position.clone().setY(g.position.y + 0.8), 0x8fffc0, 3, 0.5);
          if (cfg.onStep) cfg.onStep(step, g, ctx);
          refresh();
          if (step >= cfg.order.length) ctx.win(cfg.winMsg);
        } else {
          mistakes++;
          step = 0;
          AU.sfx('bad');
          UI.toast('WRONG ORDER', 1.2);
          ctx.caster.fx.burst(g.position.clone().setY(1), 0xff5a3a, 20, 4, 0.09);
          if (cfg.onWrong) cfg.onWrong(g, ctx, mistakes);
          if (cfg.maxMistakes && mistakes >= cfg.maxMistakes) ctx.lose(cfg.loseMsg || 'That is not how the recipe goes.');
          refresh();
        }
      }
    });
  });
  refresh();
  return {
    update(dt) {
      objs.forEach((g, i) => {
        const lit = i === cfg.order[step];
        if (g.userData.marker) g.userData.marker.visible = cfg.showNext !== false && lit;
      });
    },
    objs,
    solveNext() {
      if (step >= cfg.order.length) return null;
      const g = objs[cfg.order[step]];
      return { pos: g.getWorldPosition(new THREE.Vector3()), spell: cfg.spell || 'bolt' };
    }
  };
}

/* ========================================================= MODE: rings === */
export function modeRings(ctx, cfg) {
  const gates = [];
  const n = cfg.gates.length;
  const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, emissive: 0x6b4a08, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.8 });
  const dimMat = new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.7, metalness: 0.4 });
  cfg.gates.forEach((p, i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(cfg.radius || 3.2, 0.22, 10, 34), i === 0 ? goldMat : dimMat);
    m.position.set(p[0], p[1], p[2]);
    if (p[3] !== undefined) m.rotation.y = p[3];
    m.castShadow = true;
    ctx.world.group.add(m);
    const l = new THREE.PointLight(0xffd070, 0, 14, 2);
    m.add(l);
    gates.push({ m, l, done: false, pos: m.position.clone(), yaw: p[3] || 0 });
  });
  let idx = 0, time = cfg.time || 0;
  const refresh = () => ctx.tally('<b>' + idx + '</b> / ' + n + (cfg.time ? ' &middot; <b>' + Math.max(0, Math.ceil(time)) + '</b>s' : ''));
  refresh();
  gates[0].l.intensity = 9;
  return {
    update(dt) {
      const p = ctx.player;
      if (cfg.time) { time -= dt; if (time <= 0) { ctx.lose(cfg.loseMsg || 'The whistle went.'); return; } }
      const g = gates[idx];
      if (g) {
        const d = p.pos.distanceTo(g.pos);
        if (d < (cfg.radius || 3.2) * 0.92) {
          g.done = true;
          g.m.material = goldMat;
          g.l.intensity = 0;
          AU.sfx('catch');
          ctx.caster.fx.ring(g.pos, 0xffd070, 6, 0.6);
          idx++;
          refresh();
          if (idx >= n) { ctx.win(cfg.winMsg); return; }
          gates[idx].l.intensity = 9;
        }
        // point the next one out
        gates.forEach((q, i) => {
          q.m.material = i < idx ? goldMat : (i === idx ? goldMat : dimMat);
          q.m.scale.setScalar(i === idx ? 1 + Math.sin(R.elapsed * 3) * 0.04 : 1);
        });
      }
      refresh();
    },
    gates,
    nextPos() { return gates[idx] ? gates[idx].pos : null; }
  };
}

/* ===================================================== MODE: quidditch === */
export function modeQuidditch(ctx, cfg) {
  const snitch = buildSnitch();
  snitch.position.set(rnd(-30, 30), rnd(8, 22), rnd(-40, 40));
  ctx.world.group.add(snitch);
  const sn = {
    obj: snitch,
    vel: new THREE.Vector3(),
    target: new THREE.Vector3(),
    pickT: 0
  };
  const bludgers = [];
  for (let i = 0; i < (cfg.bludgers || 0); i++) {
    const b = buildBludger(0.45);
    b.position.set(rnd(-30, 30), rnd(6, 20), rnd(-40, 40));
    ctx.world.group.add(b);
    bludgers.push({ obj: b, vel: new THREE.Vector3(rnd(-6, 6), 0, rnd(-6, 6)), chase: cfg.chase || i === 0 });
  }
  let time = cfg.time || 0;
  let caught = 0;
  const need = cfg.catches || 1;
  const bounds = cfg.bounds || 52;
  const ceil = cfg.ceil || 34;
  let lightning = 0;
  const refresh = () => {
    ctx.tally('SNITCH <b>' + caught + '</b>/' + need + (cfg.time ? ' &middot; <b>' + Math.max(0, Math.ceil(time)) + '</b>s' : '')
      + (cfg.bludgers ? ' &middot; ' + ctx.player.hp + ' left' : ''));
  };
  refresh();
  return {
    update(dt) {
      const p = ctx.player;
      const t = R.elapsed;
      /* --- the snitch runs away from you, badly --- */
      sn.pickT -= dt;
      if (sn.pickT <= 0) {
        sn.pickT = rnd(0.7, 1.9);
        sn.target.set(rnd(-bounds * 0.8, bounds * 0.8), rnd(4, ceil * 0.8), rnd(-bounds * 0.8, bounds * 0.8));
      }
      // it also swerves away when you get close
      V.copy(sn.target).sub(snitch.position).normalize().multiplyScalar(cfg.snitchSpeed || 15);
      const dp = snitch.position.distanceTo(p.pos);
      if (dp < 16) {
        V2.copy(snitch.position).sub(p.pos).normalize().multiplyScalar((16 - dp) * (cfg.snitchPanic || 2.4));
        V.add(V2);
      }
      sn.vel.lerp(V, 1 - Math.pow(0.02, dt));
      snitch.position.addScaledVector(sn.vel, dt);
      snitch.position.y = clamp(snitch.position.y, 2.2, ceil);
      snitch.position.x = clamp(snitch.position.x, -bounds, bounds);
      snitch.position.z = clamp(snitch.position.z, -bounds, bounds);
      flapWings(snitch, t);
      snitch.rotation.y += dt * 2;

      if (dp < (cfg.catchAt || 2.4)) {
        caught++;
        AU.sfx('catch');
        ctx.caster.fx.ring(snitch.position.clone(), 0xffd070, 8, 0.8);
        ctx.caster.fx.burst(snitch.position.clone(), 0xffd070, 40, 7, 0.1);
        UI.toast('CAUGHT IT', 1.6);
        if (caught >= need) { ctx.win(cfg.winMsg); return; }
        snitch.position.set(rnd(-bounds, bounds), rnd(8, ceil * 0.7), rnd(-bounds, bounds));
      }

      /* --- the heavy ones --- */
      bludgers.forEach((b, i) => {
        if (b.chase) {
          V.copy(p.pos).sub(b.obj.position);
          const d = V.length();
          V.normalize().multiplyScalar(cfg.bludgerSpeed || 12);
          b.vel.lerp(V, 1 - Math.pow(0.25, dt));
          if (d < 2.0) {
            if (hurt(p, 1)) {
              UI.hurt(); AU.sfx('hurt'); R.kick(0.25, 0.5);
              ctx.caster.fx.burst(b.obj.position.clone(), 0x888888, 20, 5, 0.1);
              // it knocks you away
              p.vel.addScaledVector(V.normalize(), 16);
              b.vel.multiplyScalar(-0.6);
              refresh();
              if (p.hp <= 0) { ctx.lose(cfg.loseMsg || 'It knocked you clean off the broom.'); return; }
            }
          }
        } else {
          b.vel.y = Math.sin(t * 1.3 + i) * 5;
          if (Math.abs(b.obj.position.x) > bounds) b.vel.x *= -1;
          if (Math.abs(b.obj.position.z) > bounds) b.vel.z *= -1;
        }
        b.obj.position.addScaledVector(b.vel, dt);
        b.obj.position.y = clamp(b.obj.position.y, 2, ceil);
        b.obj.rotation.x += dt * 3; b.obj.rotation.z += dt * 2;
      });

      /* --- weather --- */
      if (cfg.storm) {
        lightning -= dt;
        if (lightning <= 0) {
          lightning = rnd(3.5, 9);
          UI.flash(500);
          AU.sfx('thunder');
          if (ctx.world.sun) {
            ctx.world.sun.intensity = 5;
            setTimeout(() => { if (ctx.world.sun) ctx.world.sun.intensity = 0.5; }, 160);
          }
        }
        // the wind shoves you about
        p.vel.x += Math.sin(t * 0.7) * cfg.storm * dt * 14;
        p.vel.z += Math.cos(t * 0.53) * cfg.storm * dt * 14;
        p.vel.y += Math.sin(t * 1.9) * cfg.storm * dt * 8;
      }

      if (cfg.time) {
        time -= dt;
        if (time <= 0) { ctx.lose(cfg.loseMsg || 'The match ended without you.'); return; }
      }
      refresh();
    },
    snitch,
    bludgers
  };
}

/* ========================================================== MODE: boss === */
export function modeBoss(ctx, cfg) {
  const B = cfg.build(ctx);
  const boss = {
    obj: B.obj,
    hp: cfg.hp || 8,
    maxHp: cfg.hp || 8,
    open: false, openT: 0, cycleT: cfg.firstWindow || 3,
    state: 'idle', stateT: 0,
    phase: 0,
    home: B.obj.position.clone(),
    r: cfg.r || 1.6,
    stagger: 0
  };
  const haz = new Hazards(ctx);
  ctx.hazards = haz;
  let hitFlash = 0;

  const bar = document.createElement('div');
  const refresh = () => {
    const pips = [];
    for (let i = 0; i < boss.maxHp; i++) pips.push(i < boss.hp ? '◆' : '◇');
    ctx.tally('<span style="color:#ff8a8a">' + (cfg.name || 'IT') + '</span> ' + pips.join('') +
      (ctx.player.maxHp ? '<br>YOU ' + '♥'.repeat(Math.max(0, ctx.player.hp)) : ''));
  };
  refresh();

  ctx.targets.push({
    obj: boss.obj, r: boss.r, h: cfg.h || 0, tag: 'boss',
    onHit: (spellId) => {
      if (cfg.weakness && spellId !== cfg.weakness) {
        UI.toast(cfg.weaknessHint || 'THAT DOES NOTHING', 1.1);
        ctx.caster.fx.burst(boss.obj.position.clone().setY(boss.obj.position.y + 1.6), 0x777777, 12, 3, 0.08);
        AU.sfx('bad');
        return;
      }
      if (cfg.needsOpen !== false && !boss.open) {
        UI.toast(cfg.guardHint || 'IT IS GUARDED', 1.0);
        ctx.caster.fx.burst(boss.obj.position.clone().setY(boss.obj.position.y + 1.6), 0x6fa8d8, 14, 3, 0.08);
        AU.sfx('shield');
        return;
      }
      boss.hp--;
      hitFlash = 0.25;
      boss.stagger = 0.6;
      R.kick(0.18, 0.35);
      AU.sfx('hit');
      ctx.caster.fx.burst(boss.obj.position.clone().setY(boss.obj.position.y + 1.6), 0xffd0a0, 26, 6, 0.11);
      refresh();
      if (cfg.onDamage) cfg.onDamage(boss, ctx);
      if (boss.hp <= 0) {
        if (cfg.onDeath) cfg.onDeath(boss, ctx);
        ctx.win(cfg.winMsg);
      } else if (cfg.needsOpen !== false) {
        boss.open = false;
        boss.cycleT = cfg.window === undefined ? rnd(3.5, 5.5) : cfg.window;
      }
    }
  });

  return {
    boss, hazards: haz,
    solveNext() {
      if (boss.hp <= 0) return null;
      if (cfg.needsOpen !== false && !boss.open) return { wait: true };
      return { pos: boss.obj.getWorldPosition(new THREE.Vector3()), spell: cfg.weakness || 'bolt', dist: (cfg.r || 1.6) + 4 };
    },
    update(dt) {
      const p = ctx.player, t = R.elapsed;
      if (hitFlash > 0) hitFlash -= dt;
      if (boss.stagger > 0) boss.stagger -= dt;
      haz.update(dt);
      updateWaves(ctx, dt);

      /* the window when it can be hit at all */
      if (cfg.needsOpen !== false) {
        boss.cycleT -= dt;
        if (boss.cycleT <= 0) {
          boss.open = !boss.open;
          boss.cycleT = boss.open ? (cfg.openFor || 2.6) : (cfg.window || rnd(3.5, 5.5));
          if (boss.open) { UI.toast(cfg.openMsg || 'NOW', 1.0); AU.sfx('unlock'); }
        }
      } else boss.open = true;

      // phases by health
      const frac = boss.hp / boss.maxHp;
      const want = frac > 0.66 ? 0 : frac > 0.33 ? 1 : 2;
      if (want !== boss.phase) {
        boss.phase = want;
        if (cfg.onPhase) cfg.onPhase(boss, want, ctx);
      }

      if (cfg.behave) cfg.behave(boss, ctx, dt, t, haz);

      if (cfg.glowWhenOpen !== false && B.glow) {
        B.glow.forEach((m) => {
          if (m.material && m.material.emissiveIntensity !== undefined) {
            m.material.emissiveIntensity = boss.open ? 2.6 + Math.sin(t * 9) * 0.8 : 1.0;
          }
        });
      }
      if (hitFlash > 0 && B.tint) B.tint.forEach((m) => { if (m.material) m.material.emissiveIntensity = 3; });

      if (p.hp <= 0) ctx.lose(cfg.loseMsg || 'It was too much.');
      refresh();
    },
    dispose() { haz.clear(); }
  };
}

/* ========================================================== MODE: find === */
export function modeFind(ctx, cfg) {
  const spots = cfg.spots.map((s, i) => {
    const g = cfg.make ? cfg.make(s, i, ctx) : makeTarget(ctx.world, { kind: 'orb', x: s.x, y: s.y || 1, z: s.z, col: 0x8fd6ff });
    g.visible = cfg.hidden ? false : true;
    return { g, s, i, found: false };
  });
  let found = 0;
  const need = cfg.need || spots.length;
  const refresh = () => ctx.tally('<b>' + found + '</b> / ' + need + ' found');
  refresh();
  ctx.onPulse = (kind, from) => {
    if (kind !== (cfg.reveal || 'track')) return;
    spots.forEach((sp) => {
      if (sp.g.position.distanceTo(from) < (cfg.revealRange || 26)) {
        sp.g.visible = true;
        sp.revealed = true;
      }
    });
    UI.toast('SOMETHING THAT WAY', 1.2);
  };
  return {
    solveNext() {
      const sp = spots.find((q) => !q.found);
      if (!sp) return null;
      return { goto: sp.g.position.clone() };
    },
    update(dt) {
      const p = ctx.player;
      spots.forEach((sp) => {
        if (sp.found) return;
        sp.g.rotation.y += dt * 0.8;
        sp.g.position.y = (sp.s.y || 1) + Math.sin(R.elapsed * 1.6 + sp.i) * 0.12;
        const d = p.pos.distanceTo(sp.g.position);
        if (sp.g.visible && d < (cfg.pickRange || 2.2)) {
          sp.found = true; found++;
          sp.g.visible = false;
          AU.sfx('good');
          ctx.caster.fx.ring(sp.g.position.clone(), 0x8fd6ff, 5, 0.6);
          if (cfg.onFind) cfg.onFind(sp, found, ctx);
          refresh();
          if (found >= need) ctx.win(cfg.winMsg);
        }
        // a hint when you are close but it is still hidden
        if (!sp.g.visible && d < (cfg.warmRange || 9)) {
          sp.g.visible = true;
        }
      });
      if (cfg.update) cfg.update(dt, ctx);
    },
    spots
  };
}

/* ========================================================= MODE: story === */
/* A list of steps; each is an object the runner understands. */
export function modeStory(ctx, cfg) {
  let i = 0, waiting = false, waitT = 0, current = null;
  const doStep = async () => {
    if (i >= cfg.steps.length) { ctx.win(cfg.winMsg); return; }
    const s = cfg.steps[i++];
    current = s;
    if (s.goal) ctx.goal(s.goal);
    if (s.tally !== undefined) ctx.tally(s.tally);
    if (s.do) s.do(ctx);
    if (s.say) { await ctx.say(s.say); }
    if (s.wait) { waiting = true; waitT = s.wait; return; }
    if (s.until) { current = s; return; }
    doStep();
  };
  doStep();
  return {
    update(dt) {
      if (cfg.update) cfg.update(dt, ctx);
      if (waiting) {
        waitT -= dt;
        if (waitT <= 0) { waiting = false; doStep(); }
        return;
      }
      if (current && current.until) {
        if (current.until(ctx, dt)) { current = null; doStep(); }
      }
    }
  };
}

/* ====================================================== MODE: escort ===== */
/* protect a friend from waves of things; used for the wolf fight */
export function modeProtect(ctx, cfg) {
  const haz = new Hazards(ctx);
  ctx.hazards = haz;
  let waveT = cfg.firstWave || 2, wave = 0;
  const friend = cfg.friend;
  let friendHp = cfg.friendHp || 6;
  const foes = [];
  const refresh = () => ctx.tally((cfg.friendName || 'FRIEND') + ' ' + '♥'.repeat(Math.max(0, friendHp)) +
    '<br>YOU ' + '♥'.repeat(Math.max(0, ctx.player.hp)));
  refresh();
  return {
    foes, haz,
    update(dt) {
      haz.update(dt);
      updateWaves(ctx, dt);
      waveT -= dt;
      if (waveT <= 0 && wave < (cfg.waves || 4)) {
        waveT = cfg.every || 6;
        wave++;
        if (cfg.spawn) cfg.spawn(wave, ctx, foes);
        UI.toast('WAVE ' + wave, 1.2);
      }
      if (cfg.behave) cfg.behave(ctx, dt, foes, {
        hurtFriend: (n) => {
          friendHp -= (n || 1);
          refresh();
          AU.sfx('hurt');
          if (friendHp <= 0) ctx.lose(cfg.loseMsg || 'You could not keep it off him.');
        },
        friendHp: () => friendHp
      });
      if (ctx.player.hp <= 0) ctx.lose('You went down.');
      if (wave >= (cfg.waves || 4) && foes.every((f) => f.dead)) ctx.win(cfg.winMsg);
      refresh();
    }
  };
}

/* helper used by several chapters: a floating name over something */
export function label(ctx, obj, text, y, col) {
  const cv = document.createElement('canvas');
  cv.width = 640; cv.height = 128;
  const x = cv.getContext('2d');
  let size = 58;
  x.font = 'bold ' + size + 'px Georgia, serif';
  while (x.measureText(text).width > 600 && size > 22) {
    size -= 3;
    x.font = 'bold ' + size + 'px Georgia, serif';
  }
  x.textAlign = 'center';
  x.fillStyle = col || '#ffe9a8';
  x.shadowColor = '#000'; x.shadowBlur = 18;
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.65)';
  x.strokeText(text, 320, 84);
  x.fillText(text, 320, 84);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false, fog: false }));
  sp.scale.set(4.0, 0.8, 1);
  sp.position.y = y === undefined ? 2.4 : y;
  obj.add(sp);
  return sp;
}
