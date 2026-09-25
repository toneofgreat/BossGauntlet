// src/games/bossfight/scripts/bosses.js — the three bosses. Spec 22 §4/§5 owns this.
//
// The numbers live in BOSS_SPEC, one frozen table, because rule 22:B1 checks the fight
// arithmetic against it: HP strictly rising, no hit bigger than the player's bar, the
// reward ladder strictly rising. The state machines live here too, driven by dt and
// the injected `parts` — the hazards.js pattern, so a Node test can run a whole fight
// with a stub parts object and no browser.
//
// The fairness rules are spec 21 §3.3's, learned the hard way there: every attack is
// telegraphed (windup flash, painted floor), and a projectile cannot hurt anyone until
// it is both 0.25 s old AND 6 studs from the muzzle — visible before dangerous.

export const PLAYER_HP = 100;
export const SWING = Object.freeze({ RANGE: 7, ARC_DEG: 100, DAMAGE: 10, COOLDOWN_S: 0.45 });
export const HIT_IFRAMES_S = 0.8;
export const REGEN_DELAY_S = 4;
export const REGEN_PER_S = 10;
export const PROJ = Object.freeze({ SPEED: 22, HIT_R: 1.4, ARM_S: 0.25, ARM_DIST: 6, LIFE_S: 6 });
export const SHOCKWAVE = Object.freeze({ SPEED: 14, BAND: 1.0, HEIGHT: 1.6, MAX_R: 24 });
export const ERUPT = Object.freeze({ WARN_S: 1.0, LIVE_S: 0.6, TILE: 6 });
export const POOL_LIFE_S = 6;
export const WINDUP_S = 0.7;       // every attack telegraphs at least this long

// Phase thresholds: a phase change at 66% and 33% ADDS a pattern (spec 22 §4).
export const PHASE_AT = Object.freeze([1.0, 0.66, 0.33]);

export const BOSS_SPEC = Object.freeze([
  Object.freeze({
    key: "grass", name: "Mossback", icon: "🌱",
    hp: 60, contact: 15, aggroR: 22, chargeOvershoot: 10,
    reward: Object.freeze({ first: 150, repeat: 25 }),
    badge: "grass",
    // pattern cadence per phase (seconds between attack decisions)
    cadence: Object.freeze([3.2, 2.6, 2.0]),
    color: "#4f9e3f", accent: "#2f8f4a", eye: "#f5cd30",
  }),
  Object.freeze({
    key: "wood", name: "Timberjaw", icon: "🪵",
    hp: 140, contact: 20, aggroR: 24, chargeOvershoot: 0,
    reward: Object.freeze({ first: 300, repeat: 50 }),
    badge: "wood",
    cadence: Object.freeze([2.8, 2.3, 1.8]),
    color: "#a07040", accent: "#6b4a2c", eye: "#ffb347",
  }),
  Object.freeze({
    key: "lava", name: "Magmarok", icon: "🌋",
    hp: 260, contact: 30, aggroR: 24, chargeOvershoot: 0,
    reward: Object.freeze({ first: 600, repeat: 100 }),
    badge: "lava",
    cadence: Object.freeze([2.6, 2.1, 1.7]),
    color: "#1f2027", accent: "#ff5a1f", eye: "#ffd93d",
  }),
]);

const V = {
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  planar: (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]),
  norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
};

// ---------------------------------------------------------------------------------
// Boss bodies: multi-part assemblies with local offsets, bobbed and dragged around by
// setPosition — the chaser technique from trollobby's hazards.
// ---------------------------------------------------------------------------------

function grassBody(c, y) {
  return [
    { key: "body", shape: "sphere", size: [9, 7.5, 9], off: [0, 3.4, 0], color: c.color },
    { key: "belly", shape: "sphere", size: [7, 5.5, 7], off: [0, 2.6, -1.6], color: "#7ac74f" },
    { key: "head", shape: "sphere", size: [5, 4.6, 5], off: [0, 6.6, -3.4], color: c.color },
    { key: "eyeL", shape: "sphere", size: [1.1, 1.1, 1.1], off: [-1.1, 7.2, -5.4], color: "#ffffff" },
    { key: "eyeR", shape: "sphere", size: [1.1, 1.1, 1.1], off: [1.1, 7.2, -5.4], color: "#ffffff" },
    { key: "pupilL", shape: "sphere", size: [0.5, 0.5, 0.5], off: [-1.1, 7.2, -5.85], color: "#1b1b1b" },
    { key: "pupilR", shape: "sphere", size: [0.5, 0.5, 0.5], off: [1.1, 7.2, -5.85], color: "#1b1b1b" },
    { key: "tuft1", shape: "cylinder", size: [1.2, 2.6, 1.2], off: [-2, 7.6, 1], rot: [0, 0, -14], color: c.accent },
    { key: "tuft2", shape: "cylinder", size: [1.4, 3.2, 1.4], off: [0.4, 8, 1.8], rot: [0, 0, 8], color: c.accent },
    { key: "tuft3", shape: "cylinder", size: [1.0, 2.2, 1.0], off: [2.2, 7.2, 0.6], rot: [0, 0, 18], color: c.accent },
    { key: "footL", shape: "cylinder", size: [2.2, 1.6, 2.2], off: [-2.6, 0.8, -1], color: c.accent },
    { key: "footR", shape: "cylinder", size: [2.2, 1.6, 2.2], off: [2.6, 0.8, -1], color: c.accent },
  ];
}

function woodBody(c) {
  const p = [
    { key: "log1", shape: "cylinder", size: [3.4, 8, 3.4], off: [0, 2.2, 0], rot: [0, 0, 90], color: c.color },
    { key: "log2", shape: "cylinder", size: [3.0, 7, 3.0], off: [0, 5.2, -0.4], rot: [0, 0, 90], color: c.accent },
    { key: "log3", shape: "cylinder", size: [2.6, 6, 2.6], off: [0, 7.8, -0.8], rot: [0, 0, 90], color: c.color },
    { key: "jaw", size: [5.4, 1.6, 3.2], off: [0, 9.6, -2.6], color: c.accent },
    { key: "skull", size: [5.8, 2.6, 3.6], off: [0, 11.4, -2.2], color: c.color },
    { key: "eyeL", shape: "sphere", size: [1.0, 1.0, 1.0], off: [-1.5, 11.8, -4.0], color: c.eye, material: "neon" },
    { key: "eyeR", shape: "sphere", size: [1.0, 1.0, 1.0], off: [1.5, 11.8, -4.0], color: c.eye, material: "neon" },
    { key: "armL", shape: "cylinder", size: [1.2, 7, 1.2], off: [-4.6, 6, 0], rot: [0, 0, 24], color: c.accent },
    { key: "armR", shape: "cylinder", size: [1.2, 7, 1.2], off: [4.6, 6, 0], rot: [0, 0, -24], color: c.accent },
  ];
  // teeth: little wedges along the jaw
  for (let i = 0; i < 4; i++) {
    p.push({ key: "tooth" + i, shape: "wedge", size: [0.8, 0.9, 0.8], off: [-1.8 + i * 1.2, 10.5, -3.4], color: "#f2f4fa" });
  }
  return p;
}

function lavaBody(c) {
  const p = [
    { key: "base", size: [8, 3, 8], off: [0, 1.6, 0], rot: [0, 15, 0], color: c.color },
    { key: "mid", size: [6.4, 2.6, 6.4], off: [0, 4.6, 0], rot: [0, -12, 0], color: c.color },
    { key: "crack1", size: [8.2, 0.5, 8.2], off: [0, 3.2, 0], rot: [0, 15, 0], color: c.accent, material: "lava" },
    { key: "top", size: [5, 2.4, 5], off: [0, 7.2, 0], rot: [0, 28, 0], color: c.color },
    { key: "crack2", size: [6.6, 0.5, 6.6], off: [0, 6, 0], rot: [0, -12, 0], color: c.accent, material: "lava" },
    { key: "head", size: [3.6, 2.6, 3.6], off: [0, 10.2, 0], rot: [0, 8, 0], color: c.color },
    { key: "crack3", size: [4.4, 0.4, 4.4], off: [0, 8.8, 0], rot: [0, 8, 0], color: c.accent, material: "lava" },
    { key: "eyeL", shape: "sphere", size: [0.9, 0.9, 0.9], off: [-0.9, 10.4, -1.9], color: c.eye, material: "neon" },
    { key: "eyeR", shape: "sphere", size: [0.9, 0.9, 0.9], off: [0.9, 10.4, -1.9], color: c.eye, material: "neon" },
  ];
  for (let i = 0; i < 3; i++) {
    p.push({ key: "orb" + i, shape: "sphere", size: [1.1, 1.1, 1.1], off: [0, 5 + i * 1.8, 0], color: c.accent, material: "lava" });
  }
  return p;
}

export function bodyFor(spec) {
  if (spec.key === "grass") return grassBody(spec);
  if (spec.key === "wood") return woodBody(spec);
  return lavaBody(spec);
}

// The trophy head placed on a plaza plinth after a kill — a small copy of the face.
export function trophyParts(spec, at) {
  return [
    { shape: spec.key === "grass" ? "sphere" : "box", size: [2.4, 2.2, 2.4],
      position: [at[0], at[1] + 1.1, at[2]], color: spec.color, material: spec.key === "lava" ? "metal" : "plastic" },
    { shape: "sphere", size: [0.5, 0.5, 0.5], position: [at[0] - 0.55, at[1] + 1.4, at[2] - 1.05], color: spec.eye, material: "neon" },
    { shape: "sphere", size: [0.5, 0.5, 0.5], position: [at[0] + 0.55, at[1] + 1.4, at[2] - 1.05], color: spec.eye, material: "neon" },
  ];
}

// ---------------------------------------------------------------------------------
// createFight — one controller for one boss. game.js makes three and gates them.
// deps: { parts, spec, home: [x,y,z] (floor point), floorTop, sfx(name),
//         onPlayerHit(amount, what), onDown(timeS), telegraph(msg) }
// ---------------------------------------------------------------------------------

export function createFight(deps) {
  const { parts, spec, home, floorTop } = deps;
  const sfx = deps.sfx || (() => {});
  const onPlayerHit = deps.onPlayerHit || (() => {});
  const onDown = deps.onDown || (() => {});

  let built = [];            // [{ id, def }] — live engine parts of the body
  let alive = true;
  let engaged = false;
  let hp = spec.hp;
  let pos = [home[0], home[1], home[2]];
  let yaw = 0;
  let t = 0;                 // fight clock, sim seconds, runs while engaged
  let sinceAttack = 0;
  let windup = null;         // { kind, at, target } — the telegraph in progress
  let charge = null;         // { dir, left } — mossback's dash
  let flashLeft = 0;         // body flash after taking a hit
  let bob = 0;

  let shots = [];            // { id, pos, dir, age, from }
  let waves = [];            // { r, id } — expanding shockwave rings
  let erupts = [];           // { x, z, at, warnId, liveId }
  let pools = [];            // { x, z, age, id }

  function phase() {
    const frac = hp / spec.hp;
    if (frac <= PHASE_AT[2]) return 2;
    if (frac <= PHASE_AT[1]) return 1;
    return 0;
  }

  function build() {
    dissolve();
    built = bodyFor(spec).map((d) => {
      const def = {
        shape: d.shape || "box", size: d.size.slice(),
        position: [pos[0] + d.off[0], pos[1] + d.off[1], pos[2] + d.off[2]],
        rotation: (d.rot || [0, 0, 0]).slice(),
        color: d.color, material: d.material || "plastic",
        canCollide: false, // contact damage is OURS to deal; a solid boss would shove
      };
      let id = null;
      try { id = parts.create(def); } catch { /* a lost limb is not a lost fight */ }
      return { id, off: d.off, key: d.key, color: d.color, material: d.material || "plastic" };
    }).filter((b) => b.id !== null);
  }

  function dissolve() {
    for (const b of built) { try { parts.remove(b.id); } catch { /* gone */ } }
    built = [];
  }

  function clearArena() {
    for (const s of shots) { try { parts.remove(s.id); } catch { /* gone */ } }
    for (const w of waves) for (const id of w.segs) { try { parts.remove(id); } catch { /* gone */ } }
    for (const e of erupts) {
      try { if (e.warnId) parts.remove(e.warnId); } catch { /* gone */ }
      try { if (e.liveId) parts.remove(e.liveId); } catch { /* gone */ }
    }
    for (const p of pools) { try { parts.remove(p.id); } catch { /* gone */ } }
    shots = []; waves = []; erupts = []; pools = [];
    windup = null; charge = null;
  }

  function place() {
    const bobY = Math.sin(bob * 2.1) * 0.35;
    for (const b of built) {
      const c = Math.cos(yaw), s = Math.sin(yaw);
      const ox = b.off[0] * c - b.off[2] * s;
      const oz = b.off[0] * s + b.off[2] * c;
      try { parts.setPosition(b.id, [pos[0] + ox, pos[1] + b.off[1] + bobY, pos[2] + oz]); } catch { /* gone */ }
    }
  }

  function face(target) {
    // body-local -z is the face (same convention as the avatar rig): yaw so that -z
    // aims at the player.
    yaw = Math.atan2(target[0] - pos[0], target[2] - pos[2]) + Math.PI;
  }

  function flash(on) {
    for (const b of built) {
      try { parts.setColor(b.id, on ? "#ffffff" : b.color); } catch { /* gone */ }
    }
  }

  // ---- attacks --------------------------------------------------------------------

  function muzzle() {
    return [pos[0], pos[1] + 6, pos[2]];
  }

  function fireShot(at, spread) {
    const m = muzzle();
    const dir = V.norm([at[0] - m[0] + (spread || 0) * (Math.sin(t * 9)), 0, at[2] - m[2] + (spread || 0) * Math.cos(t * 7)]);
    let id = null;
    try {
      id = parts.create({ shape: "sphere", size: [PROJ.HIT_R * 2, PROJ.HIT_R * 2, PROJ.HIT_R * 2],
        position: m.slice(), color: spec.accent, material: spec.key === "grass" ? "neon" : "lava", canCollide: false });
    } catch { return; }
    shots.push({ id, pos: m.slice(), dir, age: 0, dist: 0 });
    sfx("whoosh");
  }

  function startWave() {
    // The ring is 14 segment blocks pushed outward each tick — setPosition is cheap
    // where a per-tick remove/create of a growing cylinder is churn.
    const segs = [];
    for (let i = 0; i < 14; i++) {
      try {
        segs.push(parts.create({ size: [2.6, SHOCKWAVE.HEIGHT, 1.2],
          position: [pos[0], floorTop + SHOCKWAVE.HEIGHT / 2, pos[2]],
          rotation: [0, (i / 14) * 360, 0],
          color: spec.accent, material: "neon", canCollide: false, transparency: 0.35 }));
      } catch { /* a gappy ring still reads */ }
    }
    if (!segs.length) return;
    waves.push({ r: 1, segs, cx: pos[0], cz: pos[2] });
    sfx("land");
  }

  function startErupt(at) {
    let warnId = null;
    try {
      warnId = parts.create({ size: [ERUPT.TILE, 0.3, ERUPT.TILE],
        position: [at[0], floorTop + 0.2, at[2]], color: "#ff9e3d", material: "neon", canCollide: false, transparency: 0.25 });
    } catch { return; }
    erupts.push({ x: at[0], z: at[2], at: 0, warnId, liveId: null });
  }

  function startPool(at) {
    let id = null;
    try {
      id = parts.create({ shape: "cylinder", size: [7, 0.3, 7],
        position: [at[0], floorTop + 0.18, at[2]], color: spec.accent, material: "lava", canCollide: false });
    } catch { return; }
    pools.push({ x: at[0], z: at[2], age: 0, id });
  }

  function decideAttack(playerPos, ph) {
    // Which patterns exist at this phase — spec 22 §4's table, one boss at a time.
    if (spec.key === "grass") {
      const wantBurst = ph >= 1 && Math.sin(t * 3.7) > 0;
      if (wantBurst) return { kind: "burst" };
      return { kind: "charge" };
    }
    if (spec.key === "wood") {
      if (ph >= 1 && Math.sin(t * 2.9) > 0.15) return { kind: "wave" };
      return { kind: ph >= 2 ? "doublethrow" : "throw" };
    }
    // lava
    if (ph >= 2 && Math.sin(t * 2.3) > 0.35) return { kind: "pool" };
    if (ph >= 1 && Math.sin(t * 3.1) > 0) return { kind: "erupt" };
    return { kind: "volley" };
  }

  function beginWindup(kind, playerPos) {
    windup = { kind, at: 0, target: playerPos.slice() };
    flash(true);
    sfx("pop");
  }

  function releaseAttack(playerPos) {
    const kind = windup.kind;
    const target = windup.target;
    windup = null;
    flash(false);
    if (kind === "charge") {
      const dir = V.norm([target[0] - pos[0], 0, target[2] - pos[2]]);
      const dist = V.planar(target, pos) + spec.chargeOvershoot;
      charge = { dir, left: dist, speed: 18 + phase() * 5 };
      sfx("boing");
    } else if (kind === "burst") {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const m = muzzle();
        fireShot([m[0] + Math.cos(a) * 10, m[1], m[2] + Math.sin(a) * 10], 0);
      }
    } else if (kind === "throw") {
      fireShot(playerPos, 0);
    } else if (kind === "doublethrow") {
      fireShot(playerPos, 0);
      fireShot(playerPos, 2.2);
    } else if (kind === "wave") {
      startWave();
    } else if (kind === "volley") {
      fireShot(playerPos, 0);
      fireShot(playerPos, 1.6);
      fireShot(playerPos, -1.6);
    } else if (kind === "erupt") {
      startErupt(target);
      startErupt([target[0] + 7, 0, target[2] - 5]);
    } else if (kind === "pool") {
      startPool(target);
    }
  }

  // ---- public ---------------------------------------------------------------------

  function hit(amount) {
    if (!alive || !engaged) return false;
    hp = Math.max(0, hp - amount);
    flashLeft = 0.12;
    flash(true);
    sfx("oof");
    if (hp <= 0) {
      alive = false;
      die();
      return true;
    }
    return true;
  }

  function die() {
    clearArena();
    // fall apart: the body's parts stay for a beat as a collapsing pile
    let n = 0;
    for (const b of built) {
      n += 1;
      try {
        parts.setPosition(b.id, [pos[0] + b.off[0] * 1.4, floorTop + 0.6 + (n % 3) * 0.8, pos[2] + b.off[2] * 1.4]);
      } catch { /* gone */ }
    }
    sfx("fanfare");
    onDown(t);
  }

  function reset() {
    // A player death resets the CURRENT fight fully (spec 22 §5): no chip-away.
    if (!alive) return;
    hp = spec.hp;
    engaged = false;
    t = 0;
    sinceAttack = 0;
    clearArena();
    pos = [home[0], home[1], home[2]];
    place();
  }

  function update(dt, playerPos) {
    if (!built.length || !alive) return;
    bob += dt;
    if (flashLeft > 0) { flashLeft -= dt; if (flashLeft <= 0) flash(false); }

    const dPlayer = V.planar(playerPos, pos);
    if (!engaged) {
      place();
      if (dPlayer <= spec.aggroR) {
        engaged = true;
        sfx("warp");
        if (deps.onEngage) deps.onEngage();
      }
      return;
    }

    t += dt;
    sinceAttack += dt;
    const ph = phase();

    // movement: mossback drifts toward you between attacks; the others hold court.
    if (spec.key === "grass" && !charge && !windup) {
      const dir = V.norm([playerPos[0] - pos[0], 0, playerPos[2] - pos[2]]);
      if (dPlayer > 8) { pos[0] += dir[0] * 4 * dt; pos[2] += dir[2] * 4 * dt; }
    }
    if (!charge) face(playerPos);

    // the charge in flight
    if (charge) {
      const step = Math.min(charge.left, charge.speed * dt);
      pos[0] += charge.dir[0] * step;
      pos[2] += charge.dir[2] * step;
      charge.left -= step;
      if (charge.left <= 0) charge = null;
    }

    // attack cycle: cadence -> windup (visible) -> release
    if (windup) {
      windup.at += dt;
      if (windup.at >= WINDUP_S) releaseAttack(playerPos);
    } else if (!charge && sinceAttack >= spec.cadence[ph]) {
      sinceAttack = 0;
      beginWindup(decideAttack(playerPos, ph).kind, playerPos);
    }

    // ---- live hazards -------------------------------------------------------------
    for (const s of shots) {
      s.age += dt;
      const step = PROJ.SPEED * dt;
      s.dist += step;
      s.pos = [s.pos[0] + s.dir[0] * step, s.pos[1], s.pos[2] + s.dir[2] * step];
      try { parts.setPosition(s.id, s.pos); } catch { /* gone */ }
      const armed = s.age >= PROJ.ARM_S && s.dist >= PROJ.ARM_DIST;
      if (armed && V.planar(s.pos, playerPos) <= PROJ.HIT_R + 1 && Math.abs(s.pos[1] - (playerPos[1] + 2.5)) < 4) {
        onPlayerHit(Math.round(spec.contact * 0.7), `${spec.name}'s shot`);
        s.age = PROJ.LIFE_S; // spent
      }
    }
    shots = shots.filter((s) => {
      if (s.age >= PROJ.LIFE_S) { try { parts.remove(s.id); } catch { /* gone */ } return false; }
      return true;
    });

    for (const w of waves) {
      w.r += SHOCKWAVE.SPEED * dt;
      for (let i = 0; i < w.segs.length; i++) {
        const a = (i / w.segs.length) * Math.PI * 2;
        try {
          parts.setPosition(w.segs[i], [w.cx + Math.cos(a) * w.r, floorTop + SHOCKWAVE.HEIGHT / 2, w.cz + Math.sin(a) * w.r]);
        } catch { /* gone */ }
      }
      const d = V.planar(playerPos, [w.cx, 0, w.cz]);
      const low = playerPos[1] <= floorTop + SHOCKWAVE.HEIGHT; // a jump clears it
      if (low && Math.abs(d - w.r) <= SHOCKWAVE.BAND) {
        onPlayerHit(Math.round(spec.contact * 0.8), `${spec.name}'s shockwave`);
      }
    }
    waves = waves.filter((w) => {
      if (w.r >= SHOCKWAVE.MAX_R) {
        for (const id of w.segs) { try { parts.remove(id); } catch { /* gone */ } }
        return false;
      }
      return true;
    });

    for (const e of erupts) {
      e.at += dt;
      if (e.at >= ERUPT.WARN_S && !e.liveId) {
        try { parts.remove(e.warnId); } catch { /* gone */ }
        e.warnId = null;
        try {
          e.liveId = parts.create({ size: [ERUPT.TILE, 5, ERUPT.TILE],
            position: [e.x, floorTop + 2.5, e.z], color: spec.accent, material: "lava", canCollide: false, transparency: 0.15 });
        } catch { /* gone */ }
        sfx("error");
      }
      if (e.liveId && Math.abs(playerPos[0] - e.x) <= ERUPT.TILE / 2 && Math.abs(playerPos[2] - e.z) <= ERUPT.TILE / 2
        && playerPos[1] <= floorTop + 5) {
        onPlayerHit(spec.contact, `${spec.name}'s eruption`);
      }
    }
    erupts = erupts.filter((e) => {
      if (e.at >= ERUPT.WARN_S + ERUPT.LIVE_S) {
        try { if (e.liveId) parts.remove(e.liveId); } catch { /* gone */ }
        try { if (e.warnId) parts.remove(e.warnId); } catch { /* gone */ }
        return false;
      }
      return true;
    });

    for (const p of pools) {
      p.age += dt;
      if (V.planar(playerPos, [p.x, 0, p.z]) <= 3.5 && playerPos[1] <= floorTop + 1.2) {
        onPlayerHit(Math.round(spec.contact * 0.5), `${spec.name}'s lava pool`);
      }
    }
    pools = pools.filter((p) => {
      if (p.age >= POOL_LIFE_S) { try { parts.remove(p.id); } catch { /* gone */ } return false; }
      return true;
    });

    // contact with the body itself
    if (dPlayer <= 5.4 && (charge || spec.key !== "grass")) {
      onPlayerHit(spec.contact, `${spec.name}`);
    }

    place();
  }

  function dispose() {
    clearArena();
    dissolve();
  }

  build();
  place();

  return {
    update, hit, reset, dispose,
    key: spec.key,
    hp: () => hp,
    maxHp: () => spec.hp,
    alive: () => alive,
    isEngaged: () => engaged,
    phase,
    pos: () => pos.slice(),
    fightTime: () => t,
    // the smoke scenario's window into arming (spec 22 §8)
    shotProbe: () => shots.map((s) => ({ age: s.age, dist: s.dist, pos: s.pos.slice() })),
  };
}
