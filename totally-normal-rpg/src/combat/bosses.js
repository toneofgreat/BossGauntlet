// bosses.js - COMBAT boss fights: Rat King, the Guards (Fydor + Myles), the King, Big Tom (cat), Rookie.
// Arena, phases, boss bar events, music, gates, summons, win/lose/reset, re-fights.
import { KINDS } from "./stats.js";
import { hasAbility } from "./ngplus.js";

const ROOKIE_LINES = [
  ["Oh! H-hello. I'm Rookie. The Rookie Boss. Brand new.", "Nobody's ever heard of me. Which is... the plan.", "So. Um. Fight me?!"],
  ["You came back! Okay. Okay okay okay.", "I've been practising. On a haystack. The haystack won, but I learned a lot.", "Fight me?!"],
  ["Third time! I have a cape now. Well, I had a cape. It's the same cape.", "Please don't tell anyone about the haystack.", "Fight me?!"],
];
const ROOKIE_WIN = ["Ow. Good fight! I'm writing that in my diary.", "You're really good. I'm going to be really good too. Later.", "Okay that one I let you win. Mostly."];
const ROOKIE_P2 = "I've got this!";
const KING_TAUNTS = ["Kneel.", "The light was never my friend.", "Again. Do it again.", "You swing like a farmer. Good.", "Every hero comes down here eventually."];

export function createBosses(C) {
  const THREE = C.THREE;
  const engine = C.engine;
  const bus = C.bus;
  const state = C.state;
  const fx = C.fx;
  const en = C.enemies;

  let fight = null;          // the running fight (one at a time)
  const scratch = new THREE.Vector3();
  const hpPayload = { id: "", hp: 0, maxHp: 0, phase: 1 };
  let ratKingEntity = null, rookieEntity = null, fydor = null, myles = null, king = null, cat = null;
  let ratKingRespawnT = -1, guardsRespawnT = -1;
  const summons = [];

  // ---------------------------------------------------------------- arenas (DESIGN 6.1 / 6.2, with world.point overrides)
  function pt(name, fb) {
    try { const p = C.world() && C.world().point(name); if (p) return p; } catch (e) { /* ignore */ }
    return fb;
  }
  function spawnOf(kind, fb) {
    try {
      const s = C.world() && C.world().spawns(kind);
      if (s && s.length) return s[0];
    } catch (e) { /* ignore */ }
    return { pos: fb, yaw: 0, radius: 0 };
  }
  // arena from WORLD zone bounds when available (falls back to DESIGN coordinates)
  function zoneArena(zoneId, fb, shrink = 0.5) {
    try {
      const z = C.world() && C.world().zones && C.world().zones[zoneId];
      const B = z && z.bounds;
      if (B && isFinite(B.x0) && isFinite(B.x1)) {
        // y = the arena floor (fb.y); zone y0 is a containment bound (e.g. -100 for kingDark), not the floor
        return { x: (B.x0 + B.x1) / 2, y: fb.y, z: (B.z0 + B.z1) / 2,
          rx: Math.max(3, (B.x1 - B.x0) / 2 - shrink), rz: Math.max(3, (B.z1 - B.z0) / 2 - shrink), r: fb.r ? Math.min(fb.r, Math.max(3, Math.min(B.x1 - B.x0, B.z1 - B.z0) / 2 - shrink)) : 0 };
      }
    } catch (e) { /* ignore */ }
    return fb;
  }
  const ARENAS = {
    // the Rat King stands at the ring centre
    ratKing: () => { const s = spawnOf("ratKing", { x: 0, y: -1.5, z: 148 }).pos; return { x: s.x, y: s.y, z: s.z, r: 15.2 }; },
    guards: () => zoneArena("guardPost", { x: 0, y: 0, z: 300, rx: 14.5, rz: 9.5 }, 0.6),
    king: () => zoneArena("kingDark", { x: 2000, y: 0, z: 0, r: 28.5 }, 1.5),
    cat: () => zoneArena("barn", { x: -80, y: 0, z: 236, rx: 7.2, rz: 11.2 }, 0.8),
    rookie: () => { const s = spawnOf("rookie", { x: -88, y: 1, z: 60 }).pos; return { x: s.x, y: s.y, z: s.z, r: 5 }; },
  };

  function clampArena(e) {
    const f = fight && fight.id === e.fight ? fight : null;
    const A = f ? f.arena : (ARENAS[e.fight] ? ARENAS[e.fight]() : null);
    if (!A) return;
    const dx = e.pos.x - A.x, dz = e.pos.z - A.z;
    if (A.r) {
      const lim = Math.max(0.5, A.r - e.def.radius);
      const d2 = dx * dx + dz * dz;
      if (d2 > lim * lim) { const d = Math.sqrt(d2); e.pos.x = A.x + dx / d * lim; e.pos.z = A.z + dz / d * lim; }
    } else {
      const lx = A.rx - e.def.radius, lz = A.rz - e.def.radius;
      if (dx > lx) e.pos.x = A.x + lx; if (dx < -lx) e.pos.x = A.x - lx;
      if (dz > lz) e.pos.z = A.z + lz; if (dz < -lz) e.pos.z = A.z - lz;
    }
  }

  // ---------------------------------------------------------------- Rat King gate (stakes rise behind you)
  let gate = null;
  function buildGate() {
    if (gate) return gate;
    const g = new THREE.Group(); g.name = "combat.ratKingGate";
    const n = 9;
    const stakeG = new THREE.CylinderGeometry(0.11, 0.13, 2.6, 7); stakeG.translate(0, 1.3, 0);
    const tipG = new THREE.ConeGeometry(0.13, 0.42, 7); tipG.translate(0, 2.81, 0);
    let wm;
    try { wm = engine.materials.get("woodDark"); } catch (e) { wm = null; }
    if (!wm) wm = new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.9 });
    const sm = new THREE.InstancedMesh(stakeG, wm, n), tm = new THREE.InstancedMesh(tipG, wm, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      m4.makeRotationZ((Math.random() - 0.5) * 0.08); m4.setPosition(-2.4 + i * 0.6, 0, 0);
      sm.setMatrixAt(i, m4); tm.setMatrixAt(i, m4);
    }
    sm.castShadow = tm.castShadow = true;
    g.add(sm, tm);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.16, 0.16), wm); beam.position.set(0, 1.9, -0.14); beam.castShadow = true; g.add(beam);
    const at = pt("ratKingGate", { x: 0, y: 0, z: 132 });
    g.position.set(at.x, C.groundY(at.x, at.z + 0.5, 2) - 2.9, at.z + 0.3);
    g.visible = false;
    C.scene.add(g);
    let collider = null;
    try {
      collider = engine.physics.addBox({ center: { x: at.x, y: C.groundY(at.x, at.z, 2) + 1.4, z: at.z + 0.3 }, size: { x: 5.8, y: 2.8, z: 0.6 }, tag: "combat.ratGate", walkable: false, surface: "wood" });
      engine.physics.setEnabled(collider, false);
    } catch (e) { collider = null; }
    gate = { g, collider, open: true, k: 0, baseY: C.groundY(at.x, at.z + 0.5, 2) };
    return gate;
  }
  function setGate(closed) {
    const G = buildGate();
    if (G.open === !closed) return;
    G.open = !closed;
    G.g.visible = true;
    try { if (G.collider != null) engine.physics.setEnabled(G.collider, closed); } catch (e) { /* ignore */ }
    C.sfx("gate_open", G.g.position, { vol: 0.9, rate: closed ? 1.2 : 1 });
  }
  function updateGate(dt) {
    if (!gate) return;
    const target = gate.open ? 0 : 1;
    if (gate.k === target) return;
    gate.k += Math.sign(target - gate.k) * dt / 0.6;
    gate.k = Math.max(0, Math.min(1, gate.k));
    const e = gate.k * gate.k * (3 - 2 * gate.k);
    gate.g.position.y = gate.baseY - 2.9 * (1 - e);
    if (gate.k === 0) gate.g.visible = false;
    if (Math.random() < 0.4 && gate.k > 0 && gate.k < 1) fx.burst("dust", gate.g.position.x + (Math.random() - 0.5) * 5, gate.baseY + 0.1, gate.g.position.z, 2, 0.3);
  }

  // ---------------------------------------------------------------- lights (King staff, barn lamp)
  let staffLight = null;
  function ensureStaffLight(e) {
    if (!staffLight) { staffLight = new THREE.PointLight(0xcfe6ff, 3, 18, 1.6); staffLight.castShadow = false; }
    const orb = e.model && e.model.weapon && e.model.weapon.userData.orb;
    if (orb && staffLight.parent !== orb) orb.add(staffLight);
    staffLight.visible = true;
  }
  let lamp = null;
  function buildLamp() {
    if (lamp) return lamp;
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.32, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x2a2620, metalness: 0.7, roughness: 0.5, side: THREE.DoubleSide }));
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc070 }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: fx.glowTex, color: 0xffb060, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(2.2, 2.2, 2.2);
    g.add(frame, flame, glow);
    const A = ARENAS.cat();
    g.position.set(A.x + 2, 4.4, A.z + 2);
    g.visible = false;
    C.scene.add(g);
    lamp = { g, flame, glow, lit: true, fall: 0, vy: 0, y0: 4.4 };
    return lamp;
  }

  // ---------------------------------------------------------------- fight lifecycle
  const FIGHTS = {
    ratKing: { name: "The Rat King", kinds: ["ratKing"], music: "boss", phases: [0.5] },
    guards: { name: "Fydor & Myles", kinds: ["fydor", "myles"], music: "boss", phases: [] },
    king: { name: "The King", kinds: ["king"], music: null, phases: [0.66, 0.33] },
    cat: { name: "Big Tom", kinds: ["cat"], music: "boss", phases: [0.5] },
    rookie: { name: "Rookie", kinds: ["rookie"], music: "bossRookie", phases: [0.5] },
  };

  function fightEntities(id) {
    switch (id) {
      case "ratKing": return ratKingEntity ? [ratKingEntity] : [];
      case "guards": return [fydor, myles].filter(Boolean);
      case "king": return king ? [king] : [];
      case "cat": return cat ? [cat] : [];
      case "rookie": return rookieEntity ? [rookieEntity] : [];
      default: return [];
    }
  }

  // persistent idle bodies (called on game:start)
  function populate() {
    const rk = spawnOf("ratKing", { x: 0, y: -1.5, z: 148 });
    ratKingEntity = en.spawn("ratKing", rk.pos, { yaw: Math.PI, fight: "ratKing", reuse: true });
    ratKingEntity.peaceful = true; ratKingEntity.yaw = ratKingEntity.tyaw = Math.PI;
    const rs = spawnOf("rookie", { x: -88, y: 1, z: 60 });
    rookieEntity = en.spawn("rookie", rs.pos, { yaw: rs.yaw || Math.PI / 2, fight: "rookie", reuse: true });
    rookieEntity.peaceful = true;
    buildGate(); setGateInstant(false);
    ratKingRespawnT = -1; guardsRespawnT = -1;
  }
  function setGateInstant(closed) {
    const G = buildGate();
    G.open = !closed; G.k = closed ? 1 : 0;
    G.g.position.y = G.baseY - 2.9 * (closed ? 0 : 1); G.g.visible = closed;
    try { if (G.collider != null) engine.physics.setEnabled(G.collider, closed); } catch (e) { /* ignore */ }
  }

  function canStart(id, force) {
    if (fight) return false;
    if (!C.playerAlive() && !force) return false;
    if (id === "cat" && !force && !(state.profile.secrets && state.profile.secrets.kittens)) return false;
    if (id === "ratKing" && (!ratKingEntity || !ratKingEntity.alive || ratKingRespawnT >= 0) && !force) return false;
    if (id === "guards" && guardsRespawnT >= 0 && !force) return false;
    return !!FIGHTS[id];
  }

  function start(id, opts = {}) {
    if (!canStart(id, !!opts.force)) return false;
    const F = FIGHTS[id];
    const arena = ARENAS[id]();
    fight = { id, F, arena, phase: 1, started: engine.time || 0, hpLast: -1, hitTaken: false, won: false, t: 0, tauntT: 6,
      lampDown: false, lightsOut: false, p2said: false, maxHp: 0, deadAt: -1 };
    const cyc = C.cycle();
    if (id === "ratKing") {
      if (!ratKingEntity || !ratKingEntity.alive) {
        const rk = spawnOf("ratKing", { x: 0, y: -1.5, z: 148 });
        ratKingEntity = en.spawn("ratKing", rk.pos, { yaw: Math.PI, fight: "ratKing" });
      }
      ratKingEntity.peaceful = false;
      setGate(true);
      en.aggro(ratKingEntity);
      C.sfx("ratking_roar", ratKingEntity.pos, { vol: 1 });
    } else if (id === "guards") {
      const fs = spawnOf("fydor", { x: -5, y: 0, z: 302 }), ms = spawnOf("myles", { x: 5, y: 0, z: 302 });
      fydor = en.spawn("fydor", fs.pos, { yaw: fs.yaw || Math.PI, fight: "guards" });
      myles = en.spawn("myles", ms.pos, { yaw: ms.yaw || Math.PI, fight: "guards" });
      fydor.partner = myles; myles.partner = fydor;
      C.setGuardIdleVisible(false);
      en.aggro(fydor); en.aggro(myles);
      C.bark(fydor, cyc >= 1 ? "Not again. Not you again." : "Let's see what you've got.");
    } else if (id === "king") {
      const ks = spawnOf("king", { x: 2000, y: 0, z: -10 });
      king = en.spawn("king", ks.pos, { yaw: 0, fight: "king" });
      ensureStaffLight(king);
      en.aggro(king);
      fight.lightsOut = hasAbility("king", "lightsOut", cyc);
      if (hasAbility("king", "clones", cyc)) {
        for (let i = 0; i < 2; i++) {
          const a = (i ? 1 : -1) * 0.9;
          scratch.set(ks.pos.x + Math.sin(a) * 6, ks.pos.y, ks.pos.z + Math.cos(a) * 6);
          const c = en.spawn("king", scratch, { fight: "king", clone: true, noReward: true, rec: king.rec });
          en.aggro(c);
          summons.push(c);
        }
      }
      C.sfx("king_laugh", king.pos, { vol: 1 });
      C.bark(king, cyc >= 1 ? "You again. Of course. Always you." : "So. Another one who wants my crown.");
      try { engine.setAtmosphere && engine.setAtmosphere("kingDark", { dur: 1.5 }); } catch (e) { /* ignore */ }
    } else if (id === "cat") {
      const cs = spawnOf("cat", { x: -80, y: 0, z: 236 });
      cat = en.spawn("cat", { x: cs.pos.x, y: 0, z: cs.pos.z }, { yaw: 0, fight: "cat" });
      en.aggro(cat);
      // Big Tom starts in the rafters and drops on you
      const L = buildLamp(); L.g.visible = true; L.lit = true; L.fall = 0; L.g.position.y = L.y0; L.flame.visible = true; L.glow.visible = true;
      const a = en.ai.attackById(cat.def, "rafters");
      if (a) { en.ai.startAttack(cat, a); cat.atkPhase = 1; cat.atkT = 0.6; cat.airY = C.rafterHeight(cat); cat.rafter = true; }
      C.sfx("cat_hiss", cat.pos, { vol: 1 });
      C.sfx("bell", cat.pos, { vol: 0.7 });
    } else if (id === "rookie") {
      if (!rookieEntity || !rookieEntity.alive) {
        const rs = spawnOf("rookie", { x: -88, y: 1, z: 60 });
        rookieEntity = en.spawn("rookie", rs.pos, { fight: "rookie" });
      }
      rookieEntity.peaceful = false;
      rookieEntity.recOverride = 0;
      rookieEntity.rec = Math.max(1, C.level());   // rec = your level, frozen at fight start
      rookieEntity.recOverride = rookieEntity.rec;
      en.aggro(rookieEntity);
    }
    const ents = fightEntities(id);
    let max = 0;
    for (const e of ents) max += e.maxHp;
    fight.maxHp = max;
    try { bus.emit("boss:start", { id, kind: id === "guards" ? "fydor" : ents[0] ? ents[0].kind : id, name: F.name, maxHp: max, segments: id === "guards" ? 2 : undefined }); } catch (e) { /* bus */ }
    if (F.music) {
      const track = F.music === "boss" && cyc >= 1 ? "boss_ng" : F.music;
      try { C.audio() && C.audio().pushMusic("boss", track); } catch (e) { /* ignore */ }
    }
    emitHp(true);
    return true;
  }

  function hpNow() {
    if (!fight) return 0;
    let h = 0;
    const ents = fightEntities(fight.id);
    for (let i = 0; i < ents.length; i++) { const e = ents[i]; if (e && e.alive) h += Math.max(0, e.hp); }
    return h;
  }
  function emitHp(force) {
    if (!fight) return;
    const h = Math.ceil(hpNow());
    if (!force && h === fight.hpLast) return;
    fight.hpLast = h;
    hpPayload.id = fight.id; hpPayload.hp = h; hpPayload.maxHp = fight.maxHp; hpPayload.phase = fight.phase;
    try { bus.emit("boss:hp", hpPayload); } catch (e) { /* bus */ }
  }

  function end(won) {
    if (!fight) return;
    const f = fight;
    fight = null;
    try { bus.emit("boss:end", { id: f.id, kind: f.id === "guards" ? "fydor" : f.id, won: !!won }); } catch (e) { /* bus */ }
    if (f.F.music) { try { C.audio() && C.audio().popMusic("boss"); } catch (e) { /* ignore */ } }
    if (won) { try { C.audio() && C.audio().stinger("bossWin"); } catch (e) { /* ignore */ } }
    fx.clearHostile();
    for (let i = 0; i < summons.length; i++) { const s = summons[i]; if (s.active) { if (s.alive && won) s.noReward = true; en.despawn(s); } }
    summons.length = 0;
    if (staffLight && f.id === "king") staffLight.visible = false;
    if (f.id === "cat") {
      try { if (f.lampDown && engine.popAtmosphere) engine.popAtmosphere("combat.cat", { dur: 2 }); } catch (e) { /* ignore */ }
      if (lamp) lamp.g.visible = false;
      C.setWeaponGlowAuto();
    }
    if (f.id === "king" && king && king.model && king.model.h) { try { king.model.h.setVisible(true); } catch (e) { /* ignore */ } }
    if (won) onWin(f); else onLose(f);
  }

  function onWin(f) {
    const run = state.run;
    if (f.id === "ratKing") {
      ratKingRespawnT = 10;    // gate reopens + the Rat King returns 10 s after defeat
    } else if (f.id === "guards") {
      guardsRespawnT = 30;
      const myLine = C.cycle() >= 1 ? "Fydor... it beat us again." : "Fydor... they beat us.";
      C.bark(myles, myLine);
      engine.after ? engine.after(2.6, () => C.bark(fydor, C.cycle() >= 1 ? "Then it's ready. Gods help us all." : "Then they're ready. Gods help them.")) : null;
    } else if (f.id === "king") {
      if (!f.hitTaken) run.flags["combat.kingHitless"] = true;
      // EVENTS reads run.kingWins on enemy:killed (emitted before this), then we count the win
      run.kingWins = (run.kingWins || 0) + 1;
      try { const p = C.world() && C.world().portal("kingReturn"); if (p) { const rp = pt("kingReturn", { x: 2000, y: 0, z: 24 }); p.setPos && p.setPos(rp); p.setActive(true); } } catch (e) { /* ignore */ }
      engine.after ? engine.after(6, () => { if (king && !king.alive && !fight) en.despawn(king); }) : null;
    } else if (f.id === "cat") {
      run.flags["combat.catBeaten"] = true;
      engine.after ? engine.after(6, () => { if (cat && !fight) en.despawn(cat); }) : null;
    } else if (f.id === "rookie") {
      const n = run.flags["combat.rookieWins"] = (run.flags["combat.rookieWins"] || 0) + 1;
      C.bark(rookieEntity, ROOKIE_WIN[(n - 1) % ROOKIE_WIN.length]);
      engine.after ? engine.after(5, () => {
        if (fight && fight.id === "rookie") return;
        const rs = spawnOf("rookie", { x: -88, y: 1, z: 60 });
        if (rookieEntity) { rookieEntity.recOverride = 0; en.revive(rookieEntity, rs.pos); rookieEntity.peaceful = true; }
      }) : null;
    }
    C.save();
  }

  function onLose(f) {
    // reset bosses to full HP (DESIGN 4.8)
    if (f.id === "ratKing") {
      setGate(false);
      const rk = spawnOf("ratKing", { x: 0, y: -1.5, z: 148 });
      if (ratKingEntity) { en.revive(ratKingEntity, rk.pos); ratKingEntity.peaceful = true; ratKingEntity.yaw = Math.PI; }
    } else if (f.id === "guards") {
      if (fydor) en.despawn(fydor); if (myles) en.despawn(myles);
      C.setGuardIdleVisible(true);
    } else if (f.id === "king") {
      if (king) en.despawn(king);
    } else if (f.id === "cat") {
      if (cat) en.despawn(cat);
    } else if (f.id === "rookie") {
      const rs = spawnOf("rookie", { x: -88, y: 1, z: 60 });
      if (rookieEntity) { rookieEntity.recOverride = 0; en.revive(rookieEntity, rs.pos); rookieEntity.peaceful = true; }
      C.bark(rookieEntity, "Oh no. Oh no, are you okay? I didn't mean to win!");
    }
  }

  // called by COMBAT for every kill
  function onKilled(e) {
    if (!fight) return;
    if (e.fight !== fight.id) return;
    if (fight.id === "guards" && (e === fydor || e === myles)) {
      const other = e === fydor ? myles : fydor;
      if (other && other.alive && !other.enraged) {
        other.enraged = true; other.moveMul = 1.3; other.dmgMul *= 1.2;
        C.bark(other, other === fydor ? (C.cycle() >= 1 ? "MYLES! Not again. NOT AGAIN." : "MYLES! ...You will pay for that.") : (C.cycle() >= 1 ? "Brother?! ...It always ends like this." : "Brother?! ...Fine. Just you and me."));
        C.sfx("grunt", other.pos, { vol: 1, rate: 0.8 });
      }
    }
    const ents = fightEntities(fight.id);
    let anyAlive = false;
    for (let i = 0; i < ents.length; i++) if (ents[i] && ents[i].alive) anyAlive = true;
    emitHp(true);
    if (!anyAlive) end(true);
  }

  function onEntityHit(e) {
    if (fight && e.fight === fight.id) emitHp(false);
  }

  function onPlayerHurt() { if (fight) fight.hitTaken = true; }
  function onPlayerDied() { if (fight) end(false); }

  // summons
  function canSummon(e, a) {
    let alive = 0;
    for (let i = 0; i < summons.length; i++) if (summons[i].alive && summons[i].active && !summons[i].clone) alive++;
    if (e.kind === "ratKing") return alive < 6;
    if (e.kind === "king") return alive < 2;
    return false;
  }
  function summon(e, a) {
    const n = a.count || 1;
    for (let i = 0; i < n; i++) {
      const ang = e.yaw + Math.PI + (i - (n - 1) / 2) * 0.9;
      scratch.set(e.pos.x + Math.sin(ang) * (e.def.radius + 1.6), e.pos.y, e.pos.z + Math.cos(ang) * (e.def.radius + 1.6));
      let s;
      if (e.kind === "ratKing") s = en.spawn("rat", scratch, { summoned: true, fight: fight ? fight.id : "ratKing", yaw: ang });
      else s = en.spawn("shadowGuard", scratch, { summoned: true, noReward: true, fight: "king", rec: e.rec, yaw: ang });
      en.aggro(s);
      summons.push(s);
      fx.burst(e.kind === "king" ? "shadow" : "dust", scratch.x, scratch.y + 0.5, scratch.z, 20, 0.6);
    }
    if (e.kind === "king") C.bark(e, "Guards.");
    for (let i = summons.length - 1; i >= 0; i--) if (!summons[i].active) summons.splice(i, 1);
  }

  // ---------------------------------------------------------------- per-frame
  function update(dt, t) {
    updateGate(dt);
    if (ratKingRespawnT >= 0) {
      ratKingRespawnT -= dt;
      if (ratKingRespawnT < 0) {
        setGate(false);
        const rk = spawnOf("ratKing", { x: 0, y: -1.5, z: 148 });
        if (ratKingEntity) { en.revive(ratKingEntity, rk.pos); ratKingEntity.peaceful = true; ratKingEntity.fight = "ratKing"; }
      }
    }
    if (guardsRespawnT >= 0) {
      guardsRespawnT -= dt;
      if (guardsRespawnT < 0) { if (fydor) en.despawn(fydor); if (myles) en.despawn(myles); C.setGuardIdleVisible(true); }
    }
    if (lamp && lamp.fall > 0 && lamp.g.visible) {
      lamp.vy -= 20 * dt; lamp.g.position.y += lamp.vy * dt; lamp.g.rotation.z += dt * 4;
      if (lamp.g.position.y < 0.2) { lamp.g.position.y = 0.2; lamp.fall = 0; lamp.vy = 0; C.sfx("hit_metal", lamp.g.position, { vol: 0.8, rate: 0.7 }); fx.burst("ember", lamp.g.position.x, 0.3, lamp.g.position.z, 20, 0.3); }
    }
    if (!fight) return;
    fight.t += dt;
    const f = fight;
    // the player left the arena (teleported away / walked off): reset
    const p = engine.player.position;
    const A = f.arena;
    const far = A.r ? A.r + 30 : Math.max(A.rx, A.rz) + 30;
    const dx = p.x - A.x, dz = p.z - A.z;
    if (dx * dx + dz * dz > far * far || Math.abs(p.y - A.y) > 60) { end(false); return; }
    // phases
    const hp = hpNow();
    const frac = f.maxHp > 0 ? hp / f.maxHp : 0;
    let phase = 1;
    for (let i = 0; i < f.F.phases.length; i++) if (frac < f.F.phases[i]) phase = i + 2;
    if (phase !== f.phase) { f.phase = phase; onPhase(f, phase); emitHp(true); }
    const ents = fightEntities(f.id);
    for (let i = 0; i < ents.length; i++) if (ents[i]) ents[i].phase = phase;
    // fight specifics
    if (f.id === "king" && king) {
      f.tauntT -= dt;
      if (f.tauntT <= 0 && king.alive) { f.tauntT = 14 + Math.random() * 8; C.bark(king, KING_TAUNTS[(Math.random() * KING_TAUNTS.length) | 0]); C.sfx("king_laugh", king.pos, { vol: 0.7 }); }
      if (staffLight) {
        const tele = king.atk && king.atkPhase === 0;
        const dark = f.lightsOut || phase >= 3;
        const base = dark ? 0.35 : 2.6;
        staffLight.intensity = tele ? base + 2.5 * (0.5 + 0.5 * Math.sin(t * 45)) : base + Math.sin(t * 3) * 0.15;
      }
      // King's footsteps are 3D-panned so you can hear where he is
      if (king.alive && king.speed > 0.5) {
        f.stepT = (f.stepT || 0) - dt * king.speed;
        if (f.stepT <= 0) { f.stepT = 1.6; C.sfx("step_stone", king.pos, { vol: 0.6, rate: 0.8 }); }
      }
      // dust motes in the staff light
      if (Math.random() < 0.3 && king.alive) fx.burst("dust", king.pos.x + (Math.random() - 0.5) * 3, king.pos.y + 1 + Math.random() * 2, king.pos.z + (Math.random() - 0.5) * 3, 1, 0.1);
    }
    if (f.id === "cat" && lamp && lamp.lit) { lamp.glow.material.opacity = 0.75 + Math.sin(t * 13) * 0.08; }
  }

  function onPhase(f, phase) {
    if (f.id === "ratKing" && phase >= 2 && ratKingEntity) {
      ratKingEntity.moveMul = 1.2;
      C.sfx("ratking_roar", ratKingEntity.pos, { vol: 1 });
      C.shake(0.3, 0.6, ratKingEntity.pos);
    } else if (f.id === "king" && king) {
      if (phase === 2) { C.bark(king, "Enough playing."); C.sfx("king_whisper", king.pos, { vol: 1 }); }
      if (phase >= 3 || f.lightsOut) {
        // the last lights go out: only his eyes, crown and staff glint
        try { king.model.h.setVisible(false); } catch (e) { /* ignore */ }
        if (king.model.extras) king.model.extras.visible = false;
        C.bark(king, "Now. Let's see you in the dark.");
        C.setWeaponGlow(true);
      }
    } else if (f.id === "cat" && phase >= 2 && cat && !f.lampDown) {
      // Big Tom knocks the lamp down: the barn goes dark
      f.lampDown = true;
      const L = buildLamp(); L.fall = 1; L.vy = 0; L.lit = false; L.flame.visible = false; L.glow.visible = false;
      C.sfx("creak", L.g.position, { vol: 1 }); C.sfx("meow", cat.pos, { vol: 1 });
      try { engine.pushAtmosphere && engine.pushAtmosphere("combat.cat", "forestNight", { dur: 1.2 }); } catch (e) { /* ignore */ }
      C.setWeaponGlow(true);
    } else if (f.id === "rookie" && phase >= 2 && rookieEntity && !f.p2said) {
      f.p2said = true;
      C.bark(rookieEntity, ROOKIE_P2);
    }
  }

  // King lights-out from phase 1 in cycle 1
  function onFightStartedKing() {
    if (fight && fight.id === "king" && fight.lightsOut && king) onPhase(fight, Math.max(fight.phase, 1));
  }

  // ---------------------------------------------------------------- talk / bells (COMBAT-owned interactables)
  async function talkRookie() {
    if (fight) return;
    const run = state.run;
    const n = run.flags["combat.rookieTalks"] = (run.flags["combat.rookieTalks"] || 0) + 1;
    const lines = ROOKIE_LINES[(n - 1) % ROOKIE_LINES.length];
    const ui = C.uiApi();
    let choice = 0;
    if (ui && ui.dialogue) {
      try { choice = await ui.dialogue({ speaker: "Rookie", lines, choices: ["Fight me?!", "Not now"], voice: "rookie" }); } catch (e) { choice = -1; }
    }
    if (choice === 0) start("rookie");
  }
  function ringBell() {
    if (fight) return;
    C.sfx("bell", pt("barnDoor", { x: -72, y: 0, z: 236 }), { vol: 1 });
    engine.after ? engine.after(1.2, () => start("cat")) : start("cat");
  }

  function resetAll() {
    if (fight) {
      const f = fight; fight = null;
      try { bus.emit("boss:end", { id: f.id, kind: f.id, won: false }); } catch (e) { /* bus */ }
      if (f.F.music) { try { C.audio() && C.audio().popMusic("boss", { fade: 0.5 }); } catch (e) { /* ignore */ } }
      if (f.id === "cat") { try { if (f.lampDown && engine.popAtmosphere) engine.popAtmosphere("combat.cat", { dur: 0.5 }); } catch (e) { /* ignore */ } }
    }
    summons.length = 0;
    ratKingRespawnT = -1; guardsRespawnT = -1;
    if (staffLight) staffLight.visible = false;
    if (lamp) lamp.g.visible = false;
    setGateInstant(false);
    C.setGuardIdleVisible(true);
    ratKingEntity = rookieEntity = fydor = myles = king = cat = null;
  }

  // debug: instantly win a COMBAT boss fight with full rewards
  function defeat(id) {
    if (!FIGHTS[id]) return false;
    if (!fight || fight.id !== id) {
      if (fight) end(false);
      if (!start(id, { force: true })) return false;
    }
    const ents = fightEntities(id);
    for (let i = 0; i < ents.length; i++) { const e = ents[i]; if (e && e.alive) en.kill(e, null); }
    if (fight && fight.id === id) end(true);
    return true;
  }

  return {
    start, end, update, onKilled, onEntityHit, onPlayerHurt, onPlayerDied, canSummon, summon, clampArena, populate, resetAll, defeat,
    talkRookie, ringBell, onFightStartedKing,
    get active() { return fight ? fight.id : null; },
    get fight() { return fight; },
    get rookie() { return rookieEntity; }, get ratKing() { return ratKingEntity; },
    entities: fightEntities, ARENAS,
  };
}
