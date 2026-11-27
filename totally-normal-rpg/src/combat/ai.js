// ai.js - generic enemy brain: idle/wander, aggro, chase/orbit, weighted attack picking, telegraphed attack
// execution (windup -> active -> recover), defence (blocks, shields, dodges), stagger, movement integration.
// No allocation in the per-frame paths (index loops, module scratch).
import { hasAbility } from "./ngplus.js";

const TAU = Math.PI * 2;
function wrapAngle(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
function approachAngle(a, b, step) { const d = wrapAngle(b - a); if (Math.abs(d) <= step) return b; return a + Math.sign(d) * step; }

export function AI(C) {
  const engine = C.engine;
  const fx = C.fx;
  const pl = () => engine.player;
  const scratchDir = { x: 0, y: 0, z: 0 };
  const scratchV = new C.THREE.Vector3();

  function ng() { return C.cycle() >= 1; }
  function attackById(def, id) { const a = def.attacks; for (let i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }

  // ------------------------------------------------------------------ think
  function think(e, dt, t, dist, dx, dz) {
    const def = e.def;
    const atks = def.attacks;
    for (let i = 0; i < atks.length; i++) { const id = atks[i].id; if (e.cds[id] > 0) e.cds[id] -= dt; }
    e.gcd -= dt; e.st += dt;
    if (e.blockT > 0) e.blockT -= dt;
    if (e.dodgeT > 0) e.dodgeT -= dt;
    const pAlive = C.playerAlive();
    const p = pl().position;
    const dy = p.y - e.pos.y;

    // Myles: shield up 3 s / down 1.5 s; glint when lowering
    if (def.shieldCycle && e.aggro && e.state !== "attack") {
      e.shieldT += dt;
      const up = e.shieldState === 1;
      if (up && e.shieldT >= def.shieldCycle[0]) { e.shieldState = 0; e.shieldT = 0; glint(e); }
      else if (!up && e.shieldT >= def.shieldCycle[1]) { e.shieldState = 1; e.shieldT = 0; }
      const target = e.shieldState;
      e.shieldUp += (target - e.shieldUp) * Math.min(1, dt * 8);
    } else if (def.shieldCycle && e.state === "attack") {
      e.shieldUp += (0 - e.shieldUp) * Math.min(1, dt * 10);
    } else if (!def.shieldCycle && e.shieldUp > 0 && !(e.atk && e.atk.type === "shieldwall" && e.atkPhase === 1)) {
      e.shieldUp = Math.max(0, e.shieldUp - dt * 4);
    }

    e.dvx = 0; e.dvz = 0; e.faceP = false;
    switch (e.state) {
      case "idle":
      case "wander": {
        idle(e, dt, dist);
        if (!e.peaceful && pAlive && !C.rt().cinematic && Math.abs(dy) < 5 && dist < (def.aggro || 8) * (C.sneak ? C.sneak() : 1)) {
          if (def.coward) { e.state = "flee"; e.st = 0; e.fleeT = 2.5; }
          else C.enemies.aggro(e);
        }
        break;
      }
      case "emerge": {
        const hx = e.home.x - e.pos.x, hz = e.home.z - e.pos.z;
        const L = Math.sqrt(hx * hx + hz * hz);
        if (L < 0.6 || e.st > 5) { e.state = "idle"; e.st = 0; }
        else { e.dvx = hx / L * 2.2; e.dvz = hz / L * 2.2; }
        break;
      }
      case "brother": {
        e.faceP = true;
        e.brotherT -= dt;
        if (e.brotherT <= 0) { e.state = "chase"; e.st = 0; }
        break;
      }
      case "chase": {
        if (!pAlive || e.peaceful) { e.state = e.fight ? "idle" : "return"; e.aggro = false; break; }
        if (!e.fight) {
          const hx = e.pos.x - e.home.x, hz = e.pos.z - e.home.z;
          if (hx * hx + hz * hz > e.leash * e.leash || dist > e.leash + 15) { e.state = "return"; e.aggro = false; e.st = 0; break; }
        }
        // flee once at low HP (rats)
        if (def.fleeAt && !e.fled && e.hp < e.maxHp * def.fleeAt) { e.fled = true; e.state = "flee"; e.fleeT = 1; e.st = 0; break; }
        if (C.preThink && C.preThink(e, dt, dist)) break;
        e.faceP = true;
        if (e.gcd <= 0 && Math.abs(dy) < 4.5) {
          const a = pick(e, dist);
          if (a) { startAttack(e, a); break; }
        }
        chaseMove(e, dt, dist, dx, dz, readyReach(e));
        break;
      }
      case "attack": runAttack(e, dt, t); break;
      case "stagger": {
        if (e.st >= e.staggerDur) { e.state = e.aggro ? "chase" : "idle"; e.st = 0; }
        break;
      }
      case "trip": {
        // Rookie face-planted over his own cape
        const k = e.st < 0.25 ? e.st / 0.25 : e.st > 1.7 ? Math.max(0, 1 - (e.st - 1.7) / 0.3) : 1;
        e.pitch = 1.35 * k;
        if (e.st >= 2) { e.pitch = 0; e.state = "chase"; e.st = 0; e.gcd = 0.4; }
        break;
      }
      case "flee": {
        e.fleeT -= dt;
        const L = Math.max(0.01, dist);
        const sp = (def.coward ? def.speed : def.speed * 1.15) * e.moveMul;
        e.dvx = -dx / L * sp; e.dvz = -dz / L * sp;
        if (e.fleeT <= 0) {
          if (def.coward) { e.state = dist < (def.aggro || 8) ? "flee" : "idle"; e.fleeT = 1.5; }
          else { e.state = "chase"; }
          e.st = 0;
        }
        break;
      }
      case "return": {
        const hx = e.home.x - e.pos.x, hz = e.home.z - e.pos.z;
        const L = Math.sqrt(hx * hx + hz * hz);
        if (e.hp < e.maxHp) { e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25 * dt); if (e.plate) C.plates.setHp(e.plate, e.hp / e.maxHp); }
        if (L < 1) { e.state = "idle"; e.st = 0; e.hp = e.maxHp; e.damaged = false; if (e.plate) C.plates.setHp(e.plate, 1); }
        else { const sp = def.speed * 0.9; e.dvx = hx / L * sp; e.dvz = hz / L * sp; }
        if (pAlive && dist < (def.aggro || 8) * 0.6 && e.st > 1.5) C.enemies.aggro(e);
        break;
      }
      case "custom":
        if (C.customThink) C.customThink(e, dt, t, dist);
        break;
      default: break;
    }
    if (e.faceP) e.tyaw = Math.atan2(dx, dz);
  }

  function idle(e, dt, dist) {
    const def = e.def;
    if (e.kind === "royalGuard" || e.kind === "fydor" || e.kind === "myles" || e.fight) {
      // stand at post
      const hx = e.home.x - e.pos.x, hz = e.home.z - e.pos.z;
      const L = Math.sqrt(hx * hx + hz * hz);
      if (L > 0.8 && !e.fight) { e.dvx = hx / L * 2; e.dvz = hz / L * 2; }
      else e.tyaw = e.homeYaw;
      return;
    }
    e.wanderT -= dt;
    if (e.wanderT <= 0) {
      e.wanderT = 2 + Math.random() * 4;
      const r = e.kind === "villager" ? 2.5 : 5;
      const a = Math.random() * TAU;
      e.wx = e.home.x + Math.cos(a) * r * Math.random();
      e.wz = e.home.z + Math.sin(a) * r * Math.random();
    }
    const wx = e.wx - e.pos.x, wz = e.wz - e.pos.z;
    const L = Math.sqrt(wx * wx + wz * wz);
    if (L > 0.4) {
      const sp = e.kind === "villager" ? 1.3 : e.golden ? 2.5 : 1.6;
      e.dvx = wx / L * sp; e.dvz = wz / L * sp;
    }
  }

  // when a close-range attack is off cooldown, close in to its range instead of hovering at "keep"
  function readyReach(e) {
    if (e.gcd > 0.25) return 0;
    const atks = e.def.attacks;
    let r = 0;
    for (let i = 0; i < atks.length; i++) {
      const a = atks[i];
      if (a.minRange || a.range > 6 || e.cds[a.id] > 0.2) continue;
      if (a.ng && !ng()) continue;
      if ((a.minPhase || 1) > e.phase) continue;
      if (a.type !== "melee" && a.type !== "ring" && a.type !== "cone") continue;
      if (r === 0 || a.range < r) r = a.range;
    }
    return r;
  }
  function chaseMove(e, dt, dist, dx, dz, reach) {
    const def = e.def;
    const L = Math.max(0.01, dist);
    const sp = def.speed * e.moveMul;
    const keep = reach > 0 ? Math.min(def.keep || 2, reach * 0.8) : (def.keep || 2);
    const nx = dx / L, nz = dz / L;
    e.orbitT -= dt;
    if (e.orbitT <= 0) { e.orbitT = 1.2 + Math.random() * 2; if (Math.random() < 0.5) e.orbitDir = -e.orbitDir; }
    if (dist > keep + 0.4) {
      // approach, with a little lateral weave for rats
      const weave = def.orbit ? Math.sin(e.st * 5 + e.slot) * 0.5 : 0;
      e.dvx = (nx + -nz * weave) * sp; e.dvz = (nz + nx * weave) * sp;
    } else if (dist < keep * 0.55) {
      e.dvx = -nx * sp * 0.6; e.dvz = -nz * sp * 0.6;
    } else {
      const os = def.orbit ? sp * 0.85 : sp * 0.35;
      e.dvx = -nz * e.orbitDir * os; e.dvz = nx * e.orbitDir * os;
    }
  }

  // weighted pick among eligible attacks (two passes, no allocation)
  function eligible(e, a, dist) {
    if (a.ng && !ng()) return false;
    if (a.ng && !hasAbility(e.kind, abilityOf(a), C.cycle())) return false;
    if ((a.minPhase || 1) > e.phase) return false;
    if (a.maxPhase && a.maxPhase < e.phase) return false;
    if (e.cds[a.id] > 0) return false;
    if (dist > a.range || dist < (a.minRange || 0)) return false;
    if (a.needPartner) {
      const pt = e.partner;
      if (!pt || !pt.alive || !pt.aggro || pt.state === "attack") return false;
      const x = pt.pos.x - e.pos.x, z = pt.pos.z - e.pos.z;
      if (x * x + z * z > 25) return false;
    }
    if (a.type === "summon" && C.canSummon && !C.canSummon(e, a)) return false;
    if (e.clone && (a.type === "summon" || a.type === "teleport")) return false;
    if (a.bleedNg) { /* plain bite in any cycle */ }
    return true;
  }
  function abilityOf(a) {
    switch (a.id) {
      case "pounce": return "pounce"; case "burrow": return "burrow"; case "bombs": return "cheeseBomb"; case "torch": return "torch";
      case "fissure": return "fissure"; case "blink": return "blink"; default: return a.id;
    }
  }
  function pick(e, dist) {
    const atks = e.def.attacks;
    let sum = 0;
    for (let i = 0; i < atks.length; i++) if (eligible(e, atks[i], dist)) sum += atks[i].w || 1;
    if (sum <= 0) return null;
    let r = Math.random() * sum;
    for (let i = 0; i < atks.length; i++) {
      const a = atks[i];
      if (!eligible(e, a, dist)) continue;
      r -= a.w || 1;
      if (r <= 0) return a;
    }
    return null;
  }

  // ------------------------------------------------------------------ attacks
  function windupOf(e, a) {
    let w = a.windup;
    if (e.kind === "rookie" && e.phase >= 2) w = Math.min(w, 0.9);
    if (e.enraged) w *= 0.85;
    return w;
  }

  function startAttack(e, a) {
    const d = e.atkData;
    const p = pl().position;
    e.state = "attack"; e.atk = a; e.atkPhase = 0; e.atkT = 0; e.st = 0;
    e.cds[a.id] = a.cd * (e.kind === "rookie" && e.phase >= 2 ? 0.7 : 1);
    e.gcd = e.def.gap || 0.6;
    d.hit = false; d.n = 0; d.k = 0;
    d.tx = p.x; d.ty = p.y; d.tz = p.z;
    d.sx = e.pos.x; d.sy = e.pos.y; d.sz = e.pos.z;
    const w = windupOf(e, a);
    const yawTo = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
    if (d.decal) { fx.cancelDecal(d.decal); d.decal = null; }
    switch (a.tele) {
      case "circle": d.decal = fx.telegraphCircle(d.tx, d.ty, d.tz, a.radius || 2, w + (a.type === "leap" ? a.active : 0)); break;
      case "ring": {
        const fr = a.front || 0;
        d.decal = fx.telegraphRing(e.pos.x + Math.sin(yawTo) * fr, e.pos.y, e.pos.z + Math.cos(yawTo) * fr, a.teleR || a.maxR || 4, w);
        break;
      }
      case "line": d.decal = fx.telegraphLine(e.pos.x, e.pos.y, e.pos.z, yawTo, a.len || 4, a.width || 1.2, w); break;
      default: break;
    }
    if (a.tele === "ring" || a.type === "leap" || a.type === "burrow") C.sfx("heavy_charge", e.pos, { vol: 0.6, rate: 0.8 });
    if (a.type === "summon" || a.id === "squeak") C.sfx(a.sfx, e.pos, { vol: 0.9 });
    if (a.tele === "staff") C.sfx("staff_charge", e.pos, { vol: 0.7 });
    // animation (humanoids) / poses (quadrupeds)
    if (e.model && e.model.h && a.anim) {
      const speed = a.anim === "slash" || a.anim === "heavy" || a.anim === "punch" ? Math.max(0.35, Math.min(1.6, 0.55 / (w + 0.12))) : 1;
      e.model.play(a.anim, { speed });
    }
    if (a.type === "burrow") { e.burrowed = false; }
    if (C.onAttackStart) C.onAttackStart(e, a);
  }

  function glint(e) {
    const sh = e.model && e.model.shield;
    if (sh && sh.userData.glint) { sh.userData.glint.material.opacity = 1; e.glintT = 0.35; }
    C.sfx("block", e.pos, { vol: 0.35, rate: 1.8 });
  }

  function runAttack(e, dt, t) {
    const a = e.atk;
    if (!a) { e.state = "chase"; return; }
    const d = e.atkData;
    const p = pl().position;
    e.atkT += dt;
    if (e.atkPhase === 0) {
      const w = windupOf(e, a);
      // track the player during most of the windup, then commit
      if (e.atkT < w * 0.7 && a.type !== "summon") {
        e.faceP = true;
        if (a.tele === "circle" && a.type === "leap") { d.tx = p.x; d.ty = p.y; d.tz = p.z; if (d.decal) d.decal.g.position.set(p.x, fx.groundY(p.x, p.z, p.y) + 0.04, p.z); }
        if (a.tele === "line" && d.decal) d.decal.g.rotation.y = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
      }
      // telegraph extras
      if (a.tele === "glint" && Math.random() < 0.6) {
        const hand = e.model && e.model.h && e.model.h.hand;
        if (hand) { hand.getWorldPosition(scratchV); fx.burst("spark", scratchV.x, scratchV.y, scratchV.z, 1, 0.05); }
      }
      if (a.tele === "staff" && Math.random() < 0.7) {
        const orb = e.model && e.model.weapon && e.model.weapon.userData.orb;
        if (orb) { orb.getWorldPosition(scratchV); fx.burst("bolt", scratchV.x, scratchV.y, scratchV.z, 1, 0.06); }
      }
      // quadruped poses
      if (e.herd) {
        if (a.anim === "rear") e.pitch = -0.35 * Math.min(1, e.atkT / w);
        else if (a.anim === "lunge" || a.anim === "crouch") e.pitch = 0.15 * Math.min(1, e.atkT / w);
        else if (a.anim === "bite") e.headPitch = -0.35 * Math.min(1, e.atkT / w);
        else if (a.anim === "hiss") e.headPitch = -0.3;
      }
      if (a.type === "burrow") {
        // sink into the ground, then the eruption circle follows you
        const k = Math.min(1, e.atkT / (w * 0.35));
        e.airY = -k * (e.def.height + 0.6);
        if (k >= 1 && !e.burrowed) {
          e.burrowed = true;
          fx.burst("dust", e.pos.x, e.pos.y + 0.2, e.pos.z, 30, 1.2);
          d.decal = fx.telegraphCircle(p.x, p.y, p.z, a.radius, w * 0.65);
          d.decal.follow = p;
        }
        if (e.burrowed && Math.random() < 0.5) fx.burst("dust", p.x, p.y + 0.1, p.z, 1, 1.2);
        if (e.atkT > w * 0.85 && d.decal && d.decal.follow) { d.decal.follow = null; d.tx = p.x; d.ty = p.y; d.tz = p.z; }
      }
      if (e.atkT >= w) { e.atkPhase = 1; e.atkT = 0; activate(e, a, d); }
      return;
    }
    if (e.atkPhase === 1) {
      activeUpdate(e, a, d, dt, t);
      if (e.atk !== a) return;  // chained into another attack
      if (e.atkT >= activeDur(e, a)) { e.atkPhase = 2; e.atkT = 0; endActive(e, a, d); }
      return;
    }
    // recover
    if (e.herd) { e.pitch *= Math.max(0, 1 - dt * 6); }
    if (e.atkT >= a.recover) {
      e.atk = null; e.pitch = e.herd ? 0 : e.pitch;
      if (e.def.tripChance && Math.random() < e.def.tripChance) {
        e.state = "trip"; e.st = 0;
        C.sfx("rookie_oof", e.pos, { vol: 1 });
        C.bark(e, TRIP_LINES[(Math.random() * TRIP_LINES.length) | 0]);
        return;
      }
      e.state = "chase"; e.st = 0;
    }
  }
  const TRIP_LINES = ["Oof! My cape!", "That was on purpose!", "Ow. Ow. Okay.", "Nobody saw that."];

  function activeDur(e, a) { return (e.kind === "rookie" && e.phase >= 2 && a.p2Hits) ? 0.75 : a.active; }
  function dmgOf(e, a) { return (a.dmg || 0) * e.dmgMul * (e.clone ? 0.6 : 1); }

  function hurt(e, raw, opts) {
    opts.rec = e.rec; opts.source = e.kind;
    return C.hurtPlayer(raw, opts);
  }

  const hurtOpts = { rec: 1, source: "", dir: null, knock: 0 };
  function meleeHit(e, a, reachBonus = 0) {
    const p = pl().position;
    const dx = p.x - e.pos.x, dz = p.z - e.pos.z, dy = p.y - (e.pos.y + e.airY);
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist > a.range + 0.45 + reachBonus || dy > 2.2 || dy < -1.5) return 0;
    const fx0 = Math.sin(e.yaw), fz0 = Math.cos(e.yaw);
    const dot = dist > 0.01 ? (dx * fx0 + dz * fz0) / dist : 1;
    if (dist > 0.9 && dot < Math.cos((a.arc || 90) * Math.PI / 360)) return 0;
    scratchV.set(dx, 0, dz).normalize();
    hurtOpts.dir = scratchV; hurtOpts.knock = a.knock || 2.5;
    const applied = hurt(e, dmgOf(e, a), hurtOpts);
    if (applied > 0) {
      C.sfx(e.kind === "rat" || e.kind === "cat" ? "rat_bite" : "hit_flesh", p, { vol: 0.8 });
      if (a.stun) engine.player.root && engine.player.root(a.stun);
      if ((a.bleed || (a.bleedNg && hasAbility(e.kind, "bleed", C.cycle())))) C.bleedPlayer(3, 3, e.rec, e.kind);
    }
    return applied;
  }

  function activate(e, a, d) {
    const p = pl().position;
    switch (a.type) {
      case "melee":
        if (!a.hits && !(e.kind === "rookie" && e.phase >= 2 && a.p2Hits)) { meleeHit(e, a); C.sfx(a.sfx, e.pos, { vol: 0.8 }); }
        break;
      case "ring": {
        const yaw = e.yaw, fr = a.front || 0;
        fx.shockwave({ x: e.pos.x + Math.sin(yaw) * fr, y: e.pos.y, z: e.pos.z + Math.cos(yaw) * fr, maxR: a.maxR, speed: a.speed,
          dmg: dmgOf(e, a), rec: e.rec, source: e.kind, particle: e.def.shadow || e.kind === "king" ? "shadow" : "dust" });
        C.sfx(a.sfx, e.pos, { vol: 1 });
        if (a.shake) C.shake(a.shake, 0.35, e.pos);
        if (e.herd) e.pitch = 0.2;
        break;
      }
      case "leap":
        d.sx = e.pos.x; d.sy = e.pos.y; d.sz = e.pos.z;
        C.sfx(a.sfx, e.pos, { vol: 0.9 });
        break;
      case "charge": {
        const yaw = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
        d.dx = Math.sin(e.yaw); d.dz = Math.cos(e.yaw);
        if (Math.abs(wrapAngle(yaw - e.yaw)) > 1.2) { d.dx = Math.sin(yaw); d.dz = Math.cos(yaw); }
        C.sfx(a.sfx, e.pos, { vol: 0.9 });
        if (e.herd) { e.headPitch = -0.4; }
        break;
      }
      case "projectile": fireProjectiles(e, a, d, 0); break;
      case "summon": C.summon(e, a); break;
      case "teleport": {
        const pf = engine.player.forward ? engine.player.forward(scratchV) : scratchV.set(Math.sin(engine.player.yaw || 0), 0, Math.cos(engine.player.yaw || 0));
        let nx, nz;
        if (a.behind) { nx = p.x - pf.x * a.dist; nz = p.z - pf.z * a.dist; }
        else {
          const dx = p.x - e.pos.x, dz = p.z - e.pos.z, L = Math.sqrt(dx * dx + dz * dz) || 1;
          const side = Math.random() < 0.5 ? 1 : -1;
          nx = p.x - dx / L * 2.2 + -dz / L * side * 1.5; nz = p.z - dz / L * 2.2 + dx / L * side * 1.5;
        }
        fx.burst("shadow", e.pos.x, e.pos.y + 1, e.pos.z, 26, 0.6);
        C.teleportEntity(e, nx, nz);
        fx.burst("shadow", e.pos.x, e.pos.y + 1, e.pos.z, 26, 0.6);
        C.sfx("teleport", e.pos, { vol: 0.9 });
        if (a.whisper) C.sfx("king_whisper", e.pos, { vol: 1 });
        e.yaw = e.tyaw = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
        const next = a.then ? attackById(e.def, a.then) : null;
        if (next) { e.cds[next.id] = 0; startAttack(e, next); }
        break;
      }
      case "cone": d.n = 0; C.sfx(a.sfx, e.pos, { vol: 1 }); break;
      case "fissure": {
        const yaw = Math.atan2(p.x - e.pos.x, p.z - e.pos.z);
        fx.fissure({ x: e.pos.x + Math.sin(yaw) * 1.5, y: e.pos.y, z: e.pos.z + Math.cos(yaw) * 1.5, yaw, len: a.len, speed: a.speedP, dmg: dmgOf(e, a), rec: e.rec, source: e.kind });
        C.sfx(a.sfx, e.pos, { vol: 1 });
        C.shake(0.25, 0.3, e.pos);
        break;
      }
      case "shieldwall":
        e.shieldUp = 1;
        if (e.partner && e.partner.alive && e.partner.state !== "attack") { startAttack(e.partner, a); e.partner.atkPhase = 1; e.partner.atkT = 0; e.partner.shieldUp = 1; }
        C.sfx(a.sfx, e.pos, { vol: 0.7 });
        break;
      case "burrow": {
        // erupt under the locked spot
        C.teleportEntity(e, d.tx, d.tz);
        e.burrowed = false;
        fx.burst("dust", d.tx, e.pos.y + 0.2, d.tz, 40, 1.4);
        C.sfx("ground_crack", e.pos, { vol: 1 });
        C.shake(0.4, 0.4, e.pos);
        const dx = p.x - d.tx, dz = p.z - d.tz;
        if (dx * dx + dz * dz < a.radius * a.radius) { scratchV.set(dx, 0, dz).normalize(); hurtOpts.dir = scratchV; hurtOpts.knock = 8; hurt(e, dmgOf(e, a), hurtOpts); }
        break;
      }
      case "rafters": e.rafter = true; d.n = 0; C.sfx("creak", e.pos, { vol: 0.8 }); break;
      default: break;
    }
  }

  function fireProjectiles(e, a, d, idx) {
    const p = pl().position;
    const hand = e.model && e.model.weapon && e.model.weapon.userData.orb;
    let ox = e.pos.x + Math.sin(e.yaw) * (e.def.radius + 0.4), oy = e.pos.y + e.airY + e.def.height * 0.7, oz = e.pos.z + Math.cos(e.yaw) * (e.def.radius + 0.4);
    if (hand) { hand.getWorldPosition(scratchV); ox = scratchV.x; oy = scratchV.y; oz = scratchV.z; }
    const dx = p.x - ox, dy = p.y + 1.0 - oy, dz = p.z - oz;
    const L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const sp = a.speedP || 14;
    const dmg = dmgOf(e, a);
    const projType = cycleProj(a.proj);
    if (a.pattern === "fan") {
      const n = a.count || 3, spread = a.spread || 0.3;
      const base = Math.atan2(dx, dz);
      for (let i = 0; i < n; i++) {
        const ang = base + (i - (n - 1) / 2) * spread;
        const hz = Math.sqrt(dx * dx + dz * dz) / L;
        fx.projectile({ type: projType, x: ox, y: oy, z: oz, vx: Math.sin(ang) * sp * hz, vy: dy / L * sp, vz: Math.cos(ang) * sp * hz,
          dmg, rec: e.rec, team: "enemy", source: e.kind, life: a.life || 2.5 });
      }
      C.sfx(a.sfx, e.pos, { vol: 0.9 });
    } else if (a.pattern === "spiral") {
      const ang = e.yaw + idx * 0.52 + d.k;
      fx.projectile({ type: projType, x: e.pos.x, y: e.pos.y + 1.2, z: e.pos.z, vx: Math.sin(ang) * sp, vy: 0, vz: Math.cos(ang) * sp,
        dmg, rec: e.rec, team: "enemy", source: e.kind, life: a.life || 3 });
      if (idx % 3 === 0) C.sfx(a.sfx === "staff_charge" ? "staff_bolt" : a.sfx, e.pos, { vol: 0.5 });
    } else if (a.pattern === "lob") {
      const n = a.count || 1;
      for (let i = 0; i < n; i++) {
        const T = 0.9 + i * 0.12;
        const tx = p.x + (n > 1 ? (Math.random() - 0.5) * 4 : 0), tz = p.z + (n > 1 ? (Math.random() - 0.5) * 4 : 0);
        const g = 14;
        const lx = tx - ox, lz = tz - oz, ly = p.y - oy;
        const kind = a.patch;
        const rec = e.rec, src = e.kind;
        fx.projectile({ type: projType, x: ox, y: oy, z: oz, vx: lx / T, vy: (ly + 0.5 * g * T * T) / T, vz: lz / T, gravity: g,
          dmg, rec, team: "enemy", source: src, life: 4,
          onLand: (x, y, z) => {
            if (kind === "fire") { fx.patch("fire", x, y, z, 1.7, 4.5, 5 * e.dmgMul, rec); C.sfx("fire", { x, y, z }, { vol: 0.6 }); }
            else if (kind === "poison") { fx.patch("poison", x, y, z, 2.2, 4, 4 * e.dmgMul, rec); C.sfx("cheese_bomb", { x, y, z }, { vol: 0.7 }); }
          } });
      }
      C.sfx(a.sfx, e.pos, { vol: 0.9 });
    } else {
      // single (cheese wheel rolls along the ground)
      const hz = Math.sqrt(dx * dx + dz * dz) || 1;
      const roll = a.proj === "wheel";
      fx.projectile({ type: projType, x: roll ? e.pos.x + dx / hz * 2.5 : ox, y: roll ? e.pos.y + 1 : oy, z: roll ? e.pos.z + dz / hz * 2.5 : oz,
        vx: dx / hz * sp, vy: roll ? 0 : dy / L * sp, vz: dz / hz * sp, dmg, rec: e.rec, team: "enemy", source: e.kind,
        life: a.life || 3, radius: a.radiusP });
      C.sfx(a.sfx, e.pos, { vol: 1 });
    }
  }
  function cycleProj(p) { if (p === "bolt" && C.cycle() >= 1) return "shadowBolt"; return p; }

  function activeUpdate(e, a, d, dt, t) {
    const p = pl().position;
    switch (a.type) {
      case "melee": {
        const hits = (e.kind === "rookie" && e.phase >= 2 && a.p2Hits) ? a.p2Hits : a.hits;
        if (hits) {
          while (d.n < hits.length && e.atkT >= hits[d.n]) {
            meleeHit(e, a);
            C.sfx(a.sfx, e.pos, { vol: 0.7, rate: 1 + d.n * 0.08 });
            if (e.model && e.model.h && d.n > 0) e.model.play(a.anim || "slash", { speed: 1.6 });
            if (e.herd) e.headPitch = -0.3;
            // small step-in so combos connect
            e.vel.x += Math.sin(e.yaw) * 2.2; e.vel.z += Math.cos(e.yaw) * 2.2;
            d.n++;
          }
        }
        break;
      }
      case "leap": {
        const k = Math.min(1, e.atkT / a.active);
        const x = d.sx + (d.tx - d.sx) * k, z = d.sz + (d.tz - d.sz) * k;
        e.pos.x = x; e.pos.z = z;
        e.airY = Math.sin(k * Math.PI) * (a.arcH || 1.5);
        e.yaw = e.tyaw = Math.atan2(d.tx - d.sx, d.tz - d.sz);
        if (e.herd) e.pitch = -0.3 + k * 0.5;
        if (k >= 1 && !d.hit) {
          d.hit = true; e.airY = 0;
          const dx = p.x - d.tx, dz = p.z - d.tz;
          if (dx * dx + dz * dz < a.radius * a.radius && p.y - e.pos.y < 2) {
            scratchV.set(dx, 0, dz); if (scratchV.lengthSq() < 1e-4) scratchV.set(0, 0, 1); scratchV.normalize();
            hurtOpts.dir = scratchV; hurtOpts.knock = 7;
            const applied = hurt(e, dmgOf(e, a), hurtOpts);
            if (applied > 0 && a.bleed && hasAbility(e.kind, "bleed", C.cycle())) C.bleedPlayer(3, 3, e.rec, e.kind);
          }
          fx.burst("dust", d.tx, e.pos.y + 0.1, d.tz, 26, a.radius * 0.6);
          if (a.shake) C.shake(a.shake, 0.3, e.pos);
          C.sfx(e.herd ? "land_hard" : "armor_clank", e.pos, { vol: 0.9 });
        }
        break;
      }
      case "charge": {
        const sp = (a.chargeSpeed || 12) * e.moveMul;
        e.dvx = d.dx * sp; e.dvz = d.dz * sp;
        e.vel.x = e.dvx; e.vel.z = e.dvz;
        if (Math.random() < 0.5) fx.burst("dust", e.pos.x, e.pos.y + 0.1, e.pos.z, 1, 0.4);
        if (!d.hit) {
          const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
          const rr = e.def.radius + 0.9;
          if (dx * dx + dz * dz < rr * rr && Math.abs(p.y - e.pos.y) < 2) {
            d.hit = true;
            scratchV.set(d.dx, 0, d.dz);
            hurtOpts.dir = scratchV; hurtOpts.knock = 8;
            hurt(e, dmgOf(e, a), hurtOpts);
          }
        }
        break;
      }
      case "projectile":
        if (a.pattern === "spiral") {
          const target = Math.floor((e.atkT / a.active) * (a.count || 12) * 2);
          while (d.n < target) { fireProjectiles(e, a, d, d.n); d.n++; }
          d.k += dt * 0.6;
        }
        break;
      case "cone": {
        if (!d.hit) {
          const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          const dot = dist > 0.01 ? (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / dist : 1;
          if (dist < a.range && dot > Math.cos((a.arc || 60) * Math.PI / 360)) {
            d.hit = true;
            C.slowPlayer(a.slow || 0.4, (a.slowT || 2) * (hasAbility(e.kind, "doubleHiss", C.cycle()) ? 1.6 : 1));
            if (a.dmg) { scratchV.set(dx, 0, dz).normalize(); hurtOpts.dir = scratchV; hurtOpts.knock = 3; hurt(e, dmgOf(e, a), hurtOpts); }
          }
        }
        if (Math.random() < 0.8) {
          const ang = e.yaw + (Math.random() - 0.5) * 1.1;
          fx.burst("dust", e.pos.x + Math.sin(e.yaw) * 2, e.pos.y + 1.3, e.pos.z + Math.cos(e.yaw) * 2, 1, 0.3, Math.sin(ang) * 2, 0, Math.cos(ang) * 2);
        }
        break;
      }
      case "shieldwall": e.shieldUp = 1; e.faceP = true; break;
      case "rafters": {
        // jump to the rafters, wait (a shadow follows you), then drop on you
        const T = e.atkT;
        const top = C.rafterHeight ? C.rafterHeight(e) : 6;
        if (T < 0.6) { e.airY = Math.sin(Math.min(1, T / 0.6) * Math.PI / 2) * top; }
        else if (T < 2.0) {
          e.airY = top;
          if (!d.decal && T > 1.0) { d.decal = fx.telegraphCircle(p.x, p.y, p.z, a.radius, 1.0); d.decal.follow = p; }
          if (d.decal && T > 1.75) { d.decal.follow = null; d.tx = p.x; d.tz = p.z; }
          // creep along the rafter above you
          const dx = p.x - e.pos.x, dz = p.z - e.pos.z;
          e.dvx = dx * 1.5; e.dvz = dz * 1.5;
          e.faceP = true;
        } else {
          const k = Math.min(1, (T - 2.0) / 0.5);
          e.rafter = false;
          e.pos.x += (d.tx - e.pos.x) * Math.min(1, dt * 10); e.pos.z += (d.tz - e.pos.z) * Math.min(1, dt * 10);
          e.airY = top * (1 - k * k);
          if (k >= 1 && !d.hit) {
            d.hit = true; e.airY = 0;
            const dx = p.x - d.tx, dz = p.z - d.tz;
            if (dx * dx + dz * dz < a.radius * a.radius) { scratchV.set(dx, 0, dz).normalize(); hurtOpts.dir = scratchV; hurtOpts.knock = 8; hurt(e, dmgOf(e, a), hurtOpts); }
            fx.burst("straw", e.pos.x, e.pos.y + 0.2, e.pos.z, 40, 2);
            C.shake(0.4, 0.35, e.pos);
            C.sfx("pounce", e.pos, { vol: 1 });
          }
        }
        if (d.decal && !d.decal.active) d.decal = null;
        break;
      }
      default: break;
    }
  }

  function endActive(e, a, d) {
    if (a.type === "leap" || a.type === "rafters") { e.airY = 0; e.rafter = false; }
    if (a.type === "charge") { e.dvx = 0; e.dvz = 0; }
    if (a.type === "burrow") e.airY = 0;
    if (d.decal && a.type !== "fissure") { d.decal = null; }
  }

  // ------------------------------------------------------------------ defence (blocks, shields, dodges)
  function defend(e, info, front) {
    const def = e.def;
    if (e.rafter) return "miss";
    if (e.dodgeT > 0) { C.ui("damageNumber", info.point, "MISS", "hit"); return "dodge"; }
    // shield wall (royal guards with a partner): front immune
    if (front && e.atk && e.atk.type === "shieldwall" && e.atkPhase === 1) return blocked(e, info);
    if (front && e.kind === "villager" && e.blockT > 0) return blocked(e, info);
    if (front && def.shieldCycle && e.shieldUp > 0.6) {
      if (info.bolt) { C.bark(e, "Caught it."); }
      if (hasAbility(e.kind, "riposte", C.cycle()) && !info.bolt) {
        // counter-riposte: parry and strike 20 immediately
        const r = blocked(e, info);
        const p = pl().position;
        scratchV.set(p.x - e.pos.x, 0, p.z - e.pos.z).normalize();
        hurtOpts.dir = scratchV; hurtOpts.knock = 5;
        hurt(e, 20 * e.dmgMul, hurtOpts);
        if (e.model && e.model.h) e.model.play("slash", { speed: 1.8 });
        C.sfx("whoosh_sword", e.pos, { vol: 1 });
        return r;
      }
      return blocked(e, info);
    }
    return null;
  }
  function blocked(e, info) {
    C.sfx("block", e.pos, { vol: 1 });
    fx.burst("spark", info.point.x, info.point.y, info.point.z, 12, 0.1);
    C.ui("damageNumber", info.point, "BLOCK", "hit");
    if (e.model && e.model.h && e.kind === "villager") e.model.play("block", { speed: 1.5 });
    return "block";
  }

  // called by COMBAT when the player releases an attack (before the hit frame)
  function onPlayerAttack(e, heavy, dist, frontOfEnemy) {
    if (!e.alive || !e.aggro) return;
    if (e.kind === "villager" && frontOfEnemy && dist < 4 && e.state !== "attack" && Math.random() < (e.def.blockChance || 0)) {
      e.blockT = 0.6;
      if (e.model && e.model.h) e.model.play("block", { speed: 1.4 });
    }
    if (heavy && e.def.dodgeHeavy && dist < 5 && e.state !== "attack" && e.state !== "stagger" && Math.random() < e.def.dodgeHeavy) {
      // Myles reads you: side-step roll out of the heavy
      e.dodgeT = 0.5;
      const side = Math.random() < 0.5 ? 1 : -1;
      e.vel.x += Math.cos(e.yaw) * side * 9; e.vel.z += -Math.sin(e.yaw) * side * 9;
      C.sfx("dodge", e.pos, { vol: 0.8 });
      if (Math.random() < 0.4) C.bark(e, "Saw that coming.");
    }
  }

  function stagger(e, dur) {
    if (e.state === "dead") return;
    if (e.atk && e.atkData.decal) { fx.cancelDecal(e.atkData.decal); e.atkData.decal = null; }
    if (e.atk && (e.atk.type === "leap" || e.atk.type === "rafters" || e.atk.type === "burrow") && e.atkPhase >= 1) return; // airborne: no stagger
    if (e.atk && e.atk.type === "burrow") { e.airY = 0; e.burrowed = false; }
    e.atk = null; e.state = "stagger"; e.st = 0; e.staggerDur = dur;
    if (e.model && e.model.h) e.model.play("hurt", { speed: 1.2 });
  }

  // ------------------------------------------------------------------ movement integration
  function integrate(e, dt, t) {
    const def = e.def;
    if (e.state === "attack" && e.atk && (e.atk.type === "leap" || e.atk.type === "rafters") && e.atkPhase >= 1 && e.atk.type === "leap") {
      // leap path is driven directly
    } else {
      const k = Math.min(1, dt * (e.state === "attack" ? 6 : 9));
      e.vel.x += (e.dvx - e.vel.x) * k;
      e.vel.z += (e.dvz - e.vel.z) * k;
      if (e.state === "stagger" || e.state === "trip" || e.state === "brother") { e.vel.x *= Math.max(0, 1 - dt * 10); e.vel.z *= Math.max(0, 1 - dt * 10); }
      e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
    }
    if (e.hitKnock > 0.05) {
      const kb = def.boss ? 0.25 : 1;
      e.pos.x += e.kx * e.hitKnock * kb * dt; e.pos.z += e.kz * e.hitKnock * kb * dt;
      e.hitKnock *= Math.max(0, 1 - dt * 9);
    }
    // separation from other enemies
    const L = C.enemies.list;
    for (let i = 0; i < L.length; i++) {
      const o = L[i];
      if (o === e || !o.alive || !o.active || o.distP > 40) continue;
      const dx = e.pos.x - o.pos.x, dz = e.pos.z - o.pos.z;
      const rr = def.radius + o.def.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (rr - d) * 0.5;
        e.pos.x += dx / d * push; e.pos.z += dz / d * push;
      }
    }
    // keep out of the player's capsule
    const p = pl().position;
    {
      const dx = e.pos.x - p.x, dz = e.pos.z - p.z;
      const rr = def.radius + 0.4;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr && d2 > 1e-6 && Math.abs(p.y - e.pos.y) < def.height + 0.5 && e.airY < 0.8) {
        const d = Math.sqrt(d2);
        e.pos.x += dx / d * (rr - d); e.pos.z += dz / d * (rr - d);
      }
    }
    if (e.fight && C.clampArena) C.clampArena(e);
    // ground
    if (e.lod === 0 || ((C.frame() + e.slot) & 3) === 0) {
      e.groundY = C.groundY(e.pos.x, e.pos.z, e.pos.y + 1.2);
    }
    e.pos.y += (e.groundY - e.pos.y) * Math.min(1, dt * 20);
    // facing
    const sp2 = e.vel.x * e.vel.x + e.vel.z * e.vel.z;
    e.speed = Math.sqrt(sp2);
    if (!e.faceP && sp2 > 0.2 && e.state !== "attack") e.tyaw = Math.atan2(e.vel.x, e.vel.z);
    if (e.tyaw !== undefined && e.state !== "dead" && e.state !== "trip") {
      const rate = (def.turn || 6) * (e.state === "attack" && e.atkPhase > 0 ? 0.25 : 1) * dt;
      e.yaw = wrapAngle(approachAngle(e.yaw, e.tyaw, rate));
    }
    if (e.glintT > 0) {
      e.glintT -= dt;
      const g = e.model && e.model.shield && e.model.shield.userData.glint;
      if (g) g.material.opacity = Math.max(0, e.glintT / 0.35);
    }
  }

  return { think, integrate, defend, stagger, startAttack, onPlayerAttack, attackById, wrapAngle };
}
