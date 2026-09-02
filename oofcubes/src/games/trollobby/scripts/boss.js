// src/games/trollobby/scripts/boss.js — the trollface at the end. Spec 21 §3.4 owns this.
//
// It cannot be attacked directly. The only way to damage it is to block its own shots
// back into it, which makes the block button — the thing sections 5 and 7 taught you —
// the whole fight rather than a defensive option you could have ignored.
//
// Three phases, three reflected hits each. Each phase adds a pattern rather than just
// raising a number, so the fight ends because you learned something.

export const HITS_PER_PHASE = 3;
export const PHASES = 3;
export const BOSS_HITS = HITS_PER_PHASE * PHASES;

export const PHASE_SPEC = Object.freeze([
  // 1 — single aimed shots. Learn the reflect.
  Object.freeze({ period: 2.2, shots: 1, spread: 0, dropTiles: false, beam: false, color: "#f2f2f2" }),
  // 2 — a three-shot spread, and the floor starts going.
  Object.freeze({ period: 2.6, shots: 3, spread: 0.30, dropTiles: true, beam: false, color: "#ffd0f0" }),
  // 3 — spread plus a sweeping laugh-beam you have to jump.
  Object.freeze({ period: 3.0, shots: 3, spread: 0.42, dropTiles: true, beam: true, color: "#ff9ee0" }),
]);

export const BEAM_WARN_S = 0.9;   // the beam is drawn, harmless, for this long first
export const BEAM_LIVE_S = 0.7;
export const BEAM_HEIGHT = 2.4;   // studs off the floor — a jump clears it
export const TILE_DROP_EVERY_S = 4;

export function createBoss(deps = {}) {
  const { parts, hazards, sfx, onHit, onWin, toast } = deps;

  let spec = null;          // the layout's boss descriptor
  let active = false;
  let phase = 0;
  let hits = 0;
  let t = 0;
  let lastShot = 0;
  let tiles = [];
  let tilesDropped = 0;
  let lastTileDrop = 0;
  let beam = null;          // { age, z, id }
  let beamNext = 0;
  let won = false;

  function setSpec(next, tileIds) {
    spec = next;
    tiles = (tileIds || []).slice();
  }

  function begin() {
    if (active || won || !spec) return;
    active = true;
    phase = 0;
    hits = 0;
    t = 0;
    lastShot = 0;
    lastTileDrop = 0;
    beamNext = 6;
    if (toast) toast("THE TROLL AWAKENS", { icon: "😈" });
    if (sfx) sfx("error");
  }

  function paintPhase() {
    const p = PHASE_SPEC[Math.min(phase, PHASES - 1)];
    try { parts.setColor(spec.headId, p.color); } catch { /* gone */ }
  }

  // A reflected shot that reaches the head is the only thing that counts.
  function checkReflected() {
    if (!active || !spec) return;
    const head = spec.muzzle;
    for (const s of hazards.shots().slice()) {
      if (!s.reflected) continue;
      const d = Math.hypot(s.pos[0] - head[0], s.pos[1] - head[1], s.pos[2] - head[2]);
      if (d > 9) continue;
      hazards.killShot(s);
      hits += 1;
      if (sfx) sfx("badge");
      const nextPhase = Math.floor(hits / HITS_PER_PHASE);
      if (hits >= BOSS_HITS) { finish(); return; }
      if (nextPhase !== phase) {
        phase = nextPhase;
        paintPhase();
        if (toast) toast(`Phase ${phase + 1}`, { icon: "😤" });
      } else if (toast) {
        toast(`${BOSS_HITS - hits} to go`, { icon: "💥" });
      }
    }
  }

  function finish() {
    active = false;
    won = true;
    // It goes transparent rather than being removed, so the arena still reads as an
    // arena and the finish behind it is obviously the way on.
    for (const id of spec.parts) {
      try { parts.setTransparency(id, 0.75); } catch { /* gone */ }
      try { parts.setCanCollide(id, false); } catch { /* gone */ }
    }
    clearBeam();
    if (sfx) sfx("fanfare");
    if (onWin) onWin();
  }

  function fire(playerPos) {
    const p = PHASE_SPEC[Math.min(phase, PHASES - 1)];
    const from = spec.muzzle;
    const dx = playerPos[0] - from[0];
    const dz = playerPos[2] - from[2];
    const base = Math.atan2(dz, dx);
    for (let i = 0; i < p.shots; i++) {
      const off = p.shots === 1 ? 0 : (i - (p.shots - 1) / 2) * p.spread;
      const a = base + off;
      hazards.spawnShot([from[0], from[1], from[2]], [Math.cos(a), 0, Math.sin(a)], { owner: "boss" });
    }
  }

  function dropTile() {
    // Drop from the middle out, so the arena shrinks toward its edges rather than
    // cutting the player off from the bridge behind them.
    const remaining = tiles.filter(Boolean);
    if (!remaining.length) return;
    const idx = Math.floor(Math.random() * remaining.length);
    const id = remaining[idx];
    tiles = tiles.filter((x) => x !== id);
    tilesDropped += 1;
    try { parts.setCanCollide(id, false); } catch { /* gone */ }
    try { parts.setTransparency(id, 0.65); } catch { /* gone */ }
    if (sfx) sfx("click");
  }

  function startBeam() {
    const c = spec.center;
    const z = c[2] + (Math.random() * 2 - 1) * 14;
    let id = null;
    try {
      id = parts.create({
        id: `tr-beam-${Math.round(t * 1000)}`,
        shape: "box", size: [46, 0.9, 3.2],
        position: [c[0], c[1] + BEAM_HEIGHT, z],
        color: "#ffd93d", material: "neon",
        anchored: true, canCollide: false, transparency: 0.55,
      });
    } catch { return; }
    beam = { age: 0, z, id };
    if (sfx) sfx("lift");
  }

  function clearBeam() {
    if (!beam) return;
    try { parts.remove(beam.id); } catch { /* gone */ }
    beam = null;
  }

  function update(dt, playerPos) {
    if (!active || !spec) return;
    t += dt;
    const p = PHASE_SPEC[Math.min(phase, PHASES - 1)];

    if (t - lastShot >= p.period) { lastShot = t; fire(playerPos); }
    checkReflected();

    if (p.dropTiles && t - lastTileDrop >= TILE_DROP_EVERY_S) {
      lastTileDrop = t;
      dropTile();
    }

    if (p.beam) {
      if (!beam && t >= beamNext) { startBeam(); beamNext = t + 5.5; }
      if (beam) {
        beam.age += dt;
        if (beam.age >= BEAM_WARN_S) {
          try { parts.setTransparency(beam.id, 0); } catch { /* gone */ }
          // Live: it hurts, but only at knee height, so a jump clears it.
          const dz = Math.abs(playerPos[2] - beam.z);
          const dy = playerPos[1] - spec.center[1];
          if (dz < 2.4 && dy < BEAM_HEIGHT && onHit) onHit("beam");
        }
        if (beam.age >= BEAM_WARN_S + BEAM_LIVE_S) clearBeam();
      }
    }
  }

  function reset() {
    active = false;
    phase = 0;
    hits = 0;
    t = 0;
    clearBeam();
    if (spec && !won) paintPhase();
    // Tiles come back on a restart — the run starts from the beginning, so the arena
    // has to as well.
    for (const id of tiles) {
      try { parts.setCanCollide(id, true); } catch { /* gone */ }
      try { parts.setTransparency(id, 0); } catch { /* gone */ }
    }
  }

  function restoreTiles(allTiles) {
    tiles = (allTiles || []).slice();
    tilesDropped = 0;
    for (const id of tiles) {
      try { parts.setCanCollide(id, true); } catch { /* gone */ }
      try { parts.setTransparency(id, 0); } catch { /* gone */ }
    }
  }

  return {
    setSpec, begin, update, reset, restoreTiles, dispose: clearBeam,
    isActive: () => active,
    hasWon: () => won,
    phase: () => phase,
    hits: () => hits,
    remaining: () => Math.max(0, BOSS_HITS - hits),
    tilesDropped: () => tilesDropped,
    beamLive: () => !!beam && beam.age >= BEAM_WARN_S,
  };
}
