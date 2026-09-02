// src/games/trollobby/scripts/hazards.js — things thrown at you, things chasing you, and
// the shield that stops both. Spec 21 §3.2 / §3.3 own this.
//
// The whole design rests on one rule: **every attack is telegraphed.** An emitter flashes
// for TELEGRAPH_S before it fires, and the shot is then visible in flight on its way to
// you. A hazard that can kill you before you could have seen it is not difficulty, it is
// a coin flip, and this Place is already unfair enough on purpose.
//
// All timing is sim seconds (dt from the fixed 60 Hz step), never wall clock — so a
// throttled tab and a headless test see the same schedule the player does.

// The warning lives on the EMITTER, not on the shot. That is not a style choice: an
// emitter sits ~16 studs off the path and a shot crosses that in 0.6 s, so any arming
// delay near that number makes every projectile in the Place permanently harmless —
// which is exactly what a 1.2 s ARM_S did until a browser test fired one at a player
// and nothing happened. The flash is now the telegraph and is long enough to react to;
// ARM_S is only a muzzle grace, so a shot spawned on top of you is not an instant death.
//
// Total warning: TELEGRAPH_S of flashing, then ~0.6 s of visible flight.
export const TELEGRAPH_S = 1.2;   // emitter flashes this long before it fires
export const ARM_S = 0.15;        // muzzle grace only
export const SHOT_SPEED = 26;     // studs/s
export const SHOT_LIFE_S = 6;
export const SHOT_R = 1.1;        // hit radius against the player

export const BLOCK_S = 0.5;       // how long the shield is up
export const BLOCK_COOLDOWN_S = 1.0;
export const BLOCK_REACH = 4.6;   // studs in front of you the shield covers
export const BLOCK_ARC = 0.62;    // cos of the half-angle it covers (~52 degrees)

export const CHASER_STUN_S = 2;
export const CHASER_KNOCKBACK = 9;
export const CHASER_R = 2.0;

const SHOT_COLOR = "#ff36c8";
const SHOT_ARMED = "#ffd93d";

function len(v) { return Math.hypot(v[0], v[1], v[2]); }
function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }

export function createHazards(deps = {}) {
  const { parts, sfx, onHit } = deps;

  let shots = [];      // { id, pos, vel, age, hostile }
  let chasers = [];     // { id, parts, pos, home, range, speed, patrol, t, stun }
  let blockT = 0;       // seconds of shield remaining
  let blockCd = 0;
  let emitters = [];
  let time = 0;
  let seq = 0;
  let blocked = 0;      // shots destroyed by the shield, for the HUD and the suite

  // ---- the shield ---------------------------------------------------------------------

  function block() {
    if (blockCd > 0 || blockT > 0) return false;
    blockT = BLOCK_S;
    blockCd = BLOCK_COOLDOWN_S;
    if (sfx) sfx("whoosh");
    return true;
  }

  // Is `p` inside the shield right now? A cone in front of the player: within reach, and
  // within BLOCK_ARC of the facing direction. Blocking behind you would make the button
  // a panic button rather than a read of the attack.
  function shielded(p, playerPos, facing) {
    if (blockT <= 0) return false;
    const d = sub3(p, playerPos);
    const dist = len(d);
    if (dist > BLOCK_REACH) return false;
    if (dist < 1e-6) return true;
    const dot = (d[0] * facing[0] + d[2] * facing[2]) / dist;
    return dot >= BLOCK_ARC;
  }

  // ---- projectiles ----------------------------------------------------------------------

  function spawnShot(from, dir, opts = {}) {
    seq += 1;
    const id = `tr-shot-${seq}`;
    const speed = opts.speed || SHOT_SPEED;
    const d = len(dir) || 1;
    const vel = [(dir[0] / d) * speed, (dir[1] / d) * speed, (dir[2] / d) * speed];
    let partId = null;
    try {
      partId = parts.create({
        id, shape: "sphere", size: [2.0, 2.0, 2.0],
        position: [from[0], from[1], from[2]],
        color: SHOT_COLOR, material: "neon",
        anchored: true, canCollide: false,
      });
    } catch { return null; }
    const shot = {
      id: partId, pos: [from[0], from[1], from[2]], vel, age: 0,
      reflected: false, owner: opts.owner || null,
    };
    shots.push(shot);
    if (sfx) sfx("pop");
    return shot;
  }

  function killShot(shot) {
    const i = shots.indexOf(shot);
    if (i >= 0) shots.splice(i, 1);
    try { parts.remove(shot.id); } catch { /* already gone */ }
  }

  function setEmitters(list) {
    emitters = (list || []).map((e) => ({ ...e, lastFire: -999, flashing: false }));
  }

  // ---- chasers ---------------------------------------------------------------------------

  // A bobbing trollface. Six parts so it reads as a face at a glance rather than a blob —
  // you have to recognise it while running away from it.
  function chaserParts(idx, p) {
    const mk = (suffix, def) => {
      try {
        return parts.create({ id: `tr-chaser-${idx}-${suffix}`, anchored: true, canCollide: false, ...def });
      } catch { return null; }
    };
    return [
      mk("head", { shape: "sphere", size: [3.6, 3.6, 3.6], position: p, color: "#f2f2f2", material: "plastic" }),
      mk("mouth", { shape: "box", size: [2.4, 0.34, 0.3], position: [p[0], p[1] - 0.7, p[2] + 1.7], color: "#141414", material: "plastic" }),
      mk("cheekL", { shape: "box", size: [0.4, 0.8, 0.3], position: [p[0] - 1.2, p[1] - 0.3, p[2] + 1.6], color: "#141414", material: "plastic", rotation: [0, 0, 30] }),
      mk("cheekR", { shape: "box", size: [0.4, 0.8, 0.3], position: [p[0] + 1.2, p[1] - 0.3, p[2] + 1.6], color: "#141414", material: "plastic", rotation: [0, 0, -30] }),
      mk("eyeL", { shape: "sphere", size: [0.7, 0.9, 0.4], position: [p[0] - 0.8, p[1] + 0.8, p[2] + 1.6], color: "#141414", material: "plastic" }),
      mk("eyeR", { shape: "sphere", size: [0.7, 0.9, 0.4], position: [p[0] + 0.8, p[1] + 0.8, p[2] + 1.6], color: "#141414", material: "plastic" }),
    ].filter(Boolean);
  }

  const CHASER_OFFSETS = [
    [0, 0, 0], [0, -0.7, 1.7], [-1.2, -0.3, 1.6], [1.2, -0.3, 1.6],
    [-0.8, 0.8, 1.6], [0.8, 0.8, 1.6],
  ];

  function setChasers(list) {
    for (const c of chasers) for (const id of c.parts) { try { parts.remove(id); } catch { /* gone */ } }
    chasers = (list || []).map((spec, i) => ({
      home: spec.home.slice(),
      pos: spec.home.slice(),
      range: spec.range, speed: spec.speed, patrol: spec.patrol,
      t: i * 1.3, stun: 0,
      parts: chaserParts(i, spec.home),
    }));
  }

  function moveChaser(c) {
    for (let i = 0; i < c.parts.length; i++) {
      const o = CHASER_OFFSETS[i] || [0, 0, 0];
      try { parts.setPosition(c.parts[i], [c.pos[0] + o[0], c.pos[1] + o[1], c.pos[2] + o[2]]); }
      catch { /* the part went away mid-frame */ }
    }
  }

  // ---- the step ---------------------------------------------------------------------------

  function update(dt, playerPos, facing) {
    time += dt;
    if (blockT > 0) blockT = Math.max(0, blockT - dt);
    if (blockCd > 0) blockCd = Math.max(0, blockCd - dt);

    // emitters: flash, then fire
    for (const e of emitters) {
      const t = (time - (e.phase || 0)) % e.period;
      const wantFlash = t >= e.period - TELEGRAPH_S;
      if (wantFlash !== e.flashing) {
        e.flashing = wantFlash;
        try { parts.setColor(e.id, wantFlash ? SHOT_ARMED : "#9c2a7d"); } catch { /* gone */ }
      }
      if (time - e.lastFire >= e.period) {
        e.lastFire = time;
        spawnShot(e.from, e.dir);
      }
    }

    // projectiles
    for (const s of shots.slice()) {
      s.age += dt;
      if (s.age >= SHOT_LIFE_S) { killShot(s); continue; }
      s.pos[0] += s.vel[0] * dt;
      s.pos[1] += s.vel[1] * dt;
      s.pos[2] += s.vel[2] * dt;
      try { parts.setPosition(s.id, s.pos); } catch { /* gone */ }
      if (s.age < ARM_S) {
        // Still telegraphing: visible, moving, and harmless.
        if (!s.armedShown) {
          s.armedShown = true;
          try { parts.setColor(s.id, SHOT_ARMED); } catch { /* gone */ }
        }
        continue;
      }
      if (!s.reflected && shielded(s.pos, playerPos, facing)) {
        // Reflected, not deleted: the boss fight is won by sending these back.
        s.reflected = true;
        s.vel = [-s.vel[0], -s.vel[1], -s.vel[2]];
        s.age = 0;
        blocked += 1;
        try { parts.setColor(s.id, "#3ddc84"); } catch { /* gone */ }
        if (sfx) sfx("boing");
        continue;
      }
      if (!s.reflected && len(sub3(s.pos, playerPos)) <= SHOT_R + 1) {
        killShot(s);
        if (onHit) onHit("shot");
        continue;
      }
    }

    // chasers
    for (const c of chasers) {
      if (c.stun > 0) { c.stun = Math.max(0, c.stun - dt); moveChaser(c); continue; }
      c.t += dt;
      const d = sub3(playerPos, c.pos);
      const dist = Math.hypot(d[0], d[2]);
      if (dist <= c.range) {
        const k = (c.speed * dt) / (dist || 1);
        c.pos[0] += d[0] * k;
        c.pos[2] += d[2] * k;
        c.pos[1] = c.home[1] + Math.sin(c.t * 3) * 0.5;
      } else {
        // Patrol: back and forth across its home, so it is visible before it is a threat.
        c.pos[0] = c.home[0] + Math.sin(c.t * 0.6) * c.patrol;
        c.pos[2] = c.home[2];
        c.pos[1] = c.home[1] + Math.sin(c.t * 3) * 0.5;
      }
      moveChaser(c);
      const near = len(sub3(c.pos, playerPos));
      if (near <= CHASER_R + 1.6) {
        if (shielded(c.pos, playerPos, facing)) {
          const away = sub3(c.pos, playerPos);
          const l = len(away) || 1;
          c.pos[0] += (away[0] / l) * CHASER_KNOCKBACK;
          c.pos[2] += (away[2] / l) * CHASER_KNOCKBACK;
          c.stun = CHASER_STUN_S;
          blocked += 1;
          if (sfx) sfx("boing");
          moveChaser(c);
        } else if (onHit) {
          onHit("chaser");
        }
      }
    }
  }

  function clearShots() {
    for (const s of shots.slice()) killShot(s);
    shots = [];
  }

  function reset() {
    clearShots();
    for (const c of chasers) { c.pos = c.home.slice(); c.stun = 0; moveChaser(c); }
    blockT = 0;
    blockCd = 0;
  }

  function dispose() {
    clearShots();
    for (const c of chasers) for (const id of c.parts) { try { parts.remove(id); } catch { /* gone */ } }
    chasers = [];
    emitters = [];
  }

  return {
    block, update, reset, dispose, setEmitters, setChasers, spawnShot, killShot, shielded,
    shots: () => shots,
    isBlocking: () => blockT > 0,
    blockCooldown: () => blockCd,
    blockedCount: () => blocked,
    chaserCount: () => chasers.length,
  };
}
