// enemies.js - enemy entities, kind definitions and their AI (DESIGN 4.6 / 4.7).
// Entities are created once and revived for respawns; per-frame work allocates nothing.
import { KINDS, recFor, hpFor, dmgMulFor } from "./stats.js";
import { hasAbility } from "./ngplus.js";
import { AI } from "./ai.js";

let NEXT_ID = 1;

// ------------------------------------------------------------------------------------------ kind definitions
// Attack fields: id, type, range, minRange, windup, active, recover, cd, dmg, w (weight), tele, anim, sfx, ng (cycle>=1 only),
// minPhase/maxPhase, plus type params. Damage numbers are DESIGN raw hits; cycle x1.4 and enrage are applied by e.dmgMul.
export const DEFS = {
  rat: {
    model: "rat", scale: 1.25, radius: 0.38, height: 0.45, speed: 4.6, turn: 9, aggro: 6, leash: 34, poise: 0, respawn: 4,
    hitSfx: "hit_flesh", hurtSfx: "rat_squeak", deathSfx: "rat_death", gap: 0.4, keep: 1.7, orbit: true, fleeAt: 0.2,
    attacks: [
      { id: "bite", type: "melee", range: 1.05, windup: 0.32, active: 0.08, recover: 0.45, cd: 1.2, dmg: 6, arc: 80, tele: "pose", anim: "bite", sfx: "rat_bite", w: 3, bleedNg: true },
      { id: "pounce", type: "leap", ng: true, range: 5.2, minRange: 2.4, windup: 0.5, active: 0.42, recover: 0.6, cd: 4, dmg: 6, radius: 1.1, arcH: 1.0, tele: "circle", sfx: "rat_squeak", w: 2, bleed: true },
    ],
  },
  goldenRat: {
    model: "goldenRat", scale: 1.3, radius: 0.4, height: 0.45, speed: 7.2, turn: 12, aggro: 11, leash: 40, poise: 0, respawn: null,
    hitSfx: "hit_metal", hurtSfx: "rat_squeak", deathSfx: "rat_death", coward: true, attacks: [],
  },
  ratKing: {
    model: "ratKing", scale: 4.2, radius: 1.5, height: 1.7, speed: 4.2, turn: 3.2, aggro: 30, leash: 60, poise: 9999, respawn: null,
    hitSfx: "hit_flesh", hurtSfx: "ratking_squeak", deathSfx: "ratking_roar", gap: 0.9, keep: 3.2, boss: true,
    attacks: [
      { id: "tail", type: "ring", range: 4.2, windup: 0.7, active: 0.1, recover: 0.7, cd: 3.5, dmg: 12, maxR: 5, speed: 11, tele: "ring", teleR: 5, anim: "spin", sfx: "whoosh_sword", w: 3 },
      { id: "lunge", type: "charge", range: 7, minRange: 2, windup: 0.6, active: 0.45, recover: 0.8, cd: 3, dmg: 15, chargeSpeed: 13, tele: "line", len: 7, width: 2.4, anim: "lunge", sfx: "rat_bite", w: 3 },
      { id: "summon", type: "summon", range: 99, windup: 0.9, active: 0.1, recover: 0.6, cd: 20, count: 3, tele: "pose", anim: "rear", sfx: "ratking_roar", w: 10, firstDelay: 6 },
      { id: "wheel", type: "projectile", minPhase: 2, range: 26, minRange: 5, windup: 0.9, active: 0.1, recover: 1.0, cd: 7, dmg: 20, proj: "wheel", pattern: "single", speedP: 11, life: 3.2, radiusP: 1.2, tele: "line", len: 20, width: 2.2, anim: "rear", sfx: "cheese_roll", w: 3 },
      { id: "squeak", type: "ring", minPhase: 2, range: 12, windup: 0.8, active: 0.1, recover: 0.8, cd: 6, dmg: 10, maxR: 15, speed: 10, tele: "ring", teleR: 15, anim: "rear", sfx: "ratking_squeak", w: 2 },
      { id: "burrow", type: "burrow", ng: true, range: 20, minRange: 4, windup: 1.6, active: 0.3, recover: 1.0, cd: 10, dmg: 18, radius: 2.6, sfx: "ground_crack", w: 2 },
      { id: "bombs", type: "projectile", ng: true, range: 18, minRange: 4, windup: 0.7, active: 0.1, recover: 0.8, cd: 8, dmg: 8, proj: "cheeseBomb", pattern: "lob", count: 3, life: 3, tele: "pose", anim: "rear", sfx: "cheese_bomb", w: 2, patch: "poison" },
    ],
  },
  villager: {
    model: "humanoid", radius: 0.42, height: 1.8, speed: 4.3, turn: 7, aggro: 10, leash: 30, poise: 0, respawn: 20,
    hitSfx: "hit_flesh", hurtSfx: "grunt", deathSfx: "grunt", gap: 0.6, keep: 2.0, blockChance: 0.25, staggerT: 0.3,
    attacks: [
      { id: "poke", type: "melee", range: 2.5, windup: 0.45, active: 0.1, recover: 0.5, cd: 1.1, dmg: 14, arc: 40, tele: "pose", anim: "punch", sfx: "whoosh_sword", w: 4 },
      { id: "sweep", type: "melee", range: 2.3, windup: 0.7, active: 0.12, recover: 0.7, cd: 3.5, dmg: 18, arc: 170, tele: "glint", anim: "slash", sfx: "whoosh_sword", w: 2 },
      { id: "kick", type: "melee", range: 1.4, windup: 0.3, active: 0.08, recover: 0.5, cd: 3, dmg: 8, arc: 70, knock: 9, tele: "pose", anim: "punch", sfx: "grunt", w: 2 },
      { id: "torch", type: "projectile", ng: true, range: 14, minRange: 5, windup: 0.7, active: 0.1, recover: 0.8, cd: 6, dmg: 6, proj: "torch", pattern: "lob", count: 1, life: 3, tele: "glint", anim: "slash", sfx: "torch_whoosh", w: 3, patch: "fire" },
    ],
  },
  fydor: {
    model: "humanoid", radius: 0.55, height: 2.1, speed: 3.3, turn: 4, aggro: 40, leash: 60, poise: 160, respawn: null,
    hitSfx: "hit_metal", hurtSfx: "grunt", deathSfx: "armor_clank", gap: 0.8, keep: 2.6, boss: true, staggerT: 0.45, yields: true,
    attacks: [
      { id: "cleave", type: "melee", range: 3.3, windup: 0.75, active: 0.12, recover: 0.8, cd: 2.4, dmg: 26, arc: 150, tele: "glint", anim: "slash", sfx: "halberd", w: 4 },
      { id: "slam", type: "ring", range: 6, windup: 0.9, active: 0.1, recover: 1.0, cd: 6, dmg: 22, maxR: 10, speed: 10, tele: "ring", teleR: 10, front: 2.2, anim: "heavy", sfx: "ground_crack", w: 3, shake: 0.35 },
      { id: "charge", type: "charge", range: 14, minRange: 5, windup: 0.7, active: 0.8, recover: 1.0, cd: 7, dmg: 20, chargeSpeed: 12, tele: "line", len: 10, width: 1.8, anim: "run", sfx: "grunt", w: 2 },
      { id: "fissure", type: "fissure", ng: true, range: 16, minRange: 4, windup: 0.7, active: 0.1, recover: 0.8, cd: 7, dmg: 22, len: 18, speedP: 13, tele: "line", len2: 18, anim: "heavy", sfx: "fissure", w: 3 },
    ],
  },
  myles: {
    model: "humanoid", radius: 0.45, height: 1.9, speed: 4.7, turn: 8, aggro: 40, leash: 60, poise: 120, respawn: null,
    hitSfx: "hit_metal", hurtSfx: "grunt", deathSfx: "armor_clank", gap: 0.5, keep: 2.1, boss: true, staggerT: 0.35, shieldCycle: [3, 1.5],
    dodgeHeavy: 0.5, yields: true,
    attacks: [
      { id: "combo", type: "melee", range: 2.5, windup: 0.4, active: 0.7, recover: 0.6, cd: 2.4, dmg: 10, arc: 100, hits: [0, 0.3, 0.6], tele: "pose", anim: "slash", sfx: "whoosh_sword", w: 4 },
      { id: "bash", type: "melee", range: 1.9, windup: 0.5, active: 0.1, recover: 0.6, cd: 4.5, dmg: 18, arc: 80, stun: 0.5, knock: 5, tele: "glint", anim: "punch", sfx: "shield_bash", w: 2 },
    ],
  },
  royalGuard: {
    model: "humanoid", radius: 0.45, height: 1.95, speed: 4.5, turn: 6, aggro: 10, leash: 26, poise: 140, respawn: 15,
    hitSfx: "hit_metal", hurtSfx: "armor_clank", deathSfx: "armor_clank", gap: 0.7, keep: 2.6, staggerT: 0.35, pair: true,
    attacks: [
      { id: "thrust", type: "melee", range: 3.3, windup: 0.5, active: 0.1, recover: 0.6, cd: 1.6, dmg: 22, arc: 36, tele: "line", len: 3.4, width: 0.8, anim: "punch", sfx: "whoosh_sword", w: 4 },
      { id: "leap", type: "leap", range: 11, minRange: 4, windup: 0.8, active: 0.55, recover: 0.8, cd: 6, dmg: 30, radius: 2.6, arcH: 2.6, tele: "circle", anim: "heavy", sfx: "armor_clank", w: 3, shake: 0.3 },
      { id: "wall", type: "shieldwall", range: 9, windup: 0.3, active: 3.0, recover: 0.3, cd: 10, tele: "pose", anim: "block", sfx: "shield_bash", w: 2, needPartner: true },
      { id: "blink", type: "teleport", ng: true, range: 14, minRange: 4, windup: 0.4, active: 0.05, recover: 0.05, cd: 7, dist: 6, then: "thrust", sfx: "teleport", w: 3 },
    ],
  },
  shadowGuard: {
    model: "humanoid", radius: 0.45, height: 1.95, speed: 4.3, turn: 6, aggro: 60, leash: 80, poise: 0, respawn: null,
    hitSfx: "hit_flesh", hurtSfx: "hollow_breath", deathSfx: "hollow_breath", gap: 0.8, keep: 2.4, staggerT: 0.3, shadow: true,
    attacks: [
      { id: "thrust", type: "melee", range: 3.0, windup: 0.55, active: 0.1, recover: 0.6, cd: 1.8, dmg: 15, arc: 40, tele: "line", len: 3.1, width: 0.8, anim: "punch", sfx: "whoosh_sword", w: 1 },
    ],
  },
  king: {
    model: "humanoid", radius: 0.55, height: 2.0, speed: 3.7, turn: 6, aggro: 60, leash: 80, poise: 9999, respawn: null,
    hitSfx: "hit_metal", hurtSfx: "king_laugh", deathSfx: "king_whisper", gap: 0.8, keep: 7, boss: true,
    attacks: [
      { id: "fan", type: "projectile", range: 24, minRange: 3, windup: 0.7, active: 0.1, recover: 0.6, cd: 2.6, dmg: 20, proj: "bolt", pattern: "fan", count: 3, spread: 0.32, speedP: 17, life: 2.4, tele: "staff", anim: "slash", sfx: "staff_bolt", w: 4 },
      { id: "swing", type: "melee", range: 3.2, windup: 0.55, active: 0.12, recover: 0.6, cd: 2.0, dmg: 25, arc: 150, tele: "staff", anim: "slash", sfx: "whoosh_sword", w: 5 },
      { id: "teleport", type: "teleport", minPhase: 2, range: 40, minRange: 4, windup: 0.6, active: 0.05, recover: 0.1, cd: 6.5, dist: 2.6, behind: true, then: "swing", sfx: "teleport", whisper: true, w: 4 },
      { id: "slam", type: "ring", minPhase: 2, range: 9, windup: 0.9, active: 0.1, recover: 0.9, cd: 7, dmg: 28, maxR: 12, speed: 10, tele: "ring", teleR: 12, anim: "heavy", sfx: "ground_crack", w: 3, shake: 0.4 },
      { id: "guards", type: "summon", minPhase: 2, range: 99, windup: 1.0, active: 0.1, recover: 0.6, cd: 25, count: 2, tele: "staff", anim: "heavy", sfx: "king_laugh", w: 8 },
      { id: "spiral", type: "projectile", minPhase: 3, range: 40, windup: 0.8, active: 2.0, recover: 0.8, cd: 9, dmg: 12, proj: "bolt", pattern: "spiral", count: 12, speedP: 11, life: 3.5, tele: "staff", anim: "heavy", sfx: "staff_charge", w: 5 },
    ],
  },
  cat: {
    model: "cat", scale: 5.0, radius: 1.4, height: 2.2, speed: 6.2, turn: 5, aggro: 40, leash: 60, poise: 9999, respawn: null,
    hitSfx: "hit_flesh", hurtSfx: "cat_hiss", deathSfx: "meow", gap: 0.6, keep: 3.6, boss: true,
    attacks: [
      { id: "pounce", type: "leap", range: 14, minRange: 4, windup: 0.85, active: 0.6, recover: 0.8, cd: 4.5, dmg: 24, radius: 2.8, arcH: 3.5, tele: "circle", anim: "crouch", sfx: "pounce", w: 3, shake: 0.35 },
      { id: "swipes", type: "melee", range: 3.4, windup: 0.45, active: 0.75, recover: 0.6, cd: 2.4, dmg: 9, arc: 120, hits: [0, 0.32, 0.64], tele: "pose", anim: "swipe", sfx: "whoosh_punch", w: 4 },
      { id: "hiss", type: "cone", range: 8, windup: 0.6, active: 0.6, recover: 0.5, cd: 7, dmg: 0, arc: 70, slow: 0.4, slowT: 2, tele: "line", len: 8, width: 5, anim: "hiss", sfx: "cat_hiss", w: 2 },
      { id: "rafters", type: "rafters", range: 99, minRange: 0, windup: 0.5, active: 2.6, recover: 0.2, cd: 14, dmg: 24, radius: 3.0, sfx: "pounce", w: 2, firstDelay: 8 },
    ],
  },
  rookie: {
    model: "humanoid", radius: 0.42, height: 1.75, speed: 4.2, turn: 6, aggro: 30, leash: 40, poise: 0, respawn: null,
    hitSfx: "hit_flesh", hurtSfx: "rookie_oof", deathSfx: "rookie_oof", gap: 0.9, keep: 2.2, boss: true, staggerT: 0.25, tripChance: 0.3, yields: true,
    attacks: [
      { id: "slash", type: "melee", range: 2.4, windup: 1.5, active: 0.12, recover: 0.6, cd: 1.6, dmg: 14, arc: 110, tele: "glint", anim: "slash", sfx: "whoosh_sword", w: 4, p2Hits: [0, 0.28, 0.56] },
      { id: "spin", type: "ring", range: 3.5, windup: 1.5, active: 0.1, recover: 0.9, cd: 6, dmg: 12, maxR: 4.5, speed: 9, tele: "ring", teleR: 4.5, anim: "heavy", sfx: "whoosh_sword", w: 2 },
      { id: "lunge", type: "charge", range: 9, minRange: 3, windup: 1.5, active: 0.5, recover: 1.0, cd: 5, dmg: 16, chargeSpeed: 11, tele: "line", len: 6, width: 1.4, anim: "run", sfx: "rookie_oof", w: 2 },
    ],
  },
};

// ------------------------------------------------------------------------------------------ the factory
export function createEnemies(C) {
  const THREE = C.THREE;
  const engine = C.engine;
  const fx = C.fx;
  const list = [];
  const root = new THREE.Group(); root.name = "combat.enemies";
  C.scene.add(root);
  const plateRoot = new THREE.Group(); plateRoot.name = "combat.plates";
  C.scene.add(plateRoot);
  const ai = AI(C);

  // herds (one InstancedMesh per species)
  const ratHerd = C.models.createQuadHerd("rat", 28, { key: "field" });
  const goldHerd = C.models.createQuadHerd("rat", 2, { key: "gold", metalness: 0.85, roughness: 0.32, tint: 0xffffff, emissive: 0x2a1a00, rim: 0.2 });
  // golden rat: recolour via a gold tint (vertex colours stay; metal look dominates)
  goldHerd.mesh.material.color.setRGB(2.4, 1.8, 0.7);
  root.add(ratHerd.mesh, goldHerd.mesh);

  const tmp = new THREE.Vector3();

  function cycle() { return C.cycle(); }

  function makeEntity(kind, pos, opts) {
    const def = DEFS[kind];
    if (!def) throw new Error("unknown enemy kind " + kind);
    const e = {
      id: kind + "#" + (NEXT_ID++), kind, def, root: null, pos: null, yaw: opts.yaw || 0, vel: new THREE.Vector3(),
      hp: 1, maxHp: 1, rec: 1, alive: false, boss: !!def.boss, zone: opts.zone || null, home: new THREE.Vector3(pos.x, pos.y, pos.z),
      homeYaw: opts.yaw || 0, leash: opts.leash || def.leash, state: "idle", st: 0, atk: null, atkT: 0, atkPhase: 0, atkHits: 0,
      atkData: { tx: 0, ty: 0, tz: 0, sx: 0, sy: 0, sz: 0, dx: 0, dz: 0, decal: null, hit: false, n: 0, k: 0 },
      cds: {}, gcd: 0, aggro: false, dvx: 0, dvz: 0, speed: 0, moveMul: 1, dmgMul: 1, phase: 1, enraged: false,
      stinkT: 0, stinkTick: 0, flash: 0, lean: 0, poiseDmg: 0, poiseT: 0, deadT: 0, respawnT: -1, noReward: !!opts.noReward,
      summoned: !!opts.summoned, fight: opts.fight || null, partner: null, blockT: 0, shieldUp: 0, shieldT: 0, shieldState: 1,
      airY: 0, burrowed: false, hidden: false, visible: true, lod: 0, distP: 1e9, orbitDir: Math.random() < 0.5 ? -1 : 1, orbitT: 0,
      fleeT: 0, fled: false, wanderT: Math.random() * 3, wx: pos.x, wz: pos.z, gait: 0, animPhase: Math.random() * 6, headYaw: 0, headPitch: 0,
      pitch: 0, roll: 0, twitch: 0, slot: -1, herd: null, model: null, plate: null, damaged: false, rafter: false, spawnPoints: opts.spawnPoints || null,
      variant: opts.variant || 0, recOverride: opts.rec || 0, hpMul: opts.hpMul || 1, frameSkip: 0, groundY: pos.y, shout: false,
      brotherT: 0, tripT: 0, emerge: 0, golden: kind === "goldenRat", waitGolden: false, clone: !!opts.clone, mimic: opts.mimic || null,
      lineIdx: 0, active: true, despawn: null, hitKnock: 0, kx: 0, kz: 0, hp0: 0,
    };
    e.despawn = () => despawn(e);
    // model
    if (def.model === "rat" || def.model === "goldenRat") {
      const herd = def.model === "rat" ? ratHerd : goldHerd;
      e.herd = herd; e.slot = herd.alloc();
      e.root = new THREE.Object3D();
      if (e.slot < 0) throw new Error("rat herd full");
    } else if (def.model === "ratKing") {
      e.model = C.models.buildRatKing();
      e.root = e.model.root; e.model.body.scale.setScalar(def.scale); root.add(e.root);
      e.herd = e.model.herd; e.slot = 0;
    } else if (def.model === "cat") {
      e.model = C.models.buildCat();
      e.root = e.model.root; e.model.body.scale.setScalar(def.scale); root.add(e.root);
      e.herd = e.model.herd; e.slot = 0;
    } else {
      e.model = C.models.buildHumanoidEnemy(kind, e.variant);
      e.root = e.model.root; root.add(e.root);
    }
    e.pos = e.root.position;
    e.pos.set(pos.x, pos.y, pos.z);
    e.root.rotation.y = e.yaw;
    // name plate (normal enemies only; bosses use the UI boss bar)
    if (!def.boss && !e.clone) {
      const name = KINDS[kind] ? KINDS[kind].name : kind;
      e.plate = C.plates.create(name, 1, 0, { bar: true });
      plateRoot.add(e.plate.group);
    }
    list.push(e);
    revive(e, pos);
    return e;
  }

  function revive(e, pos) {
    const k = e.kind;
    const cyc = cycle();
    e.rec = e.recOverride || recFor(k, cyc, C.level());
    e.maxHp = Math.max(1, Math.round(hpFor(k, cyc) * e.hpMul));
    if (e.clone) e.maxHp = 1;
    e.hp = e.maxHp;
    e.alive = true; e.active = true; e.state = "idle"; e.st = 0; e.atk = null; e.aggro = false; e.gcd = 0.5;
    for (const id in e.cds) e.cds[id] = 0;
    for (const a of e.def.attacks) if (a.firstDelay) e.cds[a.id] = a.firstDelay;
    e.dmgMul = dmgMulFor(cyc); e.moveMul = 1; e.enraged = false; e.phase = 1;
    e.stinkT = 0; e.flash = 0; e.lean = 0; e.poiseDmg = 0; e.deadT = 0; e.respawnT = -1; e.airY = 0; e.burrowed = false;
    e.fled = false; e.fleeT = 0; e.damaged = false; e.shout = false; e.brotherT = 0; e.tripT = 0; e.blockT = 0;
    e.shieldUp = 0; e.shieldT = 0; e.shieldState = 1; e.rafter = false; e.pitch = 0; e.roll = 0; e.twitch = 0;
    e.vel.set(0, 0, 0); e.dvx = 0; e.dvz = 0; e.speed = 0; e.waitGolden = false; e.hitKnock = 0;
    if (pos) e.pos.set(pos.x, pos.y, pos.z);
    e.groundY = C.groundY(e.pos.x, e.pos.z, e.pos.y + 1);
    e.pos.y = e.groundY;
    e.hidden = false;
    if (e.model && e.model.h && e.model.h.reset) e.model.h.reset();
    if (e.model && e.model.h) {
      try { e.model.play("idle", { loop: true }); } catch (er) { /* ignore */ }
      if (e.model.body) { e.model.body.position.set(0, 0, 0); e.model.body.rotation.set(0, 0, 0); e.model.body.scale.setScalar(1); }
      if (e.model.extras) e.model.extras.visible = true;
      if (e.model.weapon) e.model.weapon.visible = true;
      if (e.model.shield) e.model.shield.visible = true;
      e.model.setEyes(eyeModeFor(e));
      try { if (e.model.h.setVisible) e.model.h.setVisible(true); } catch (er) { /* ignore */ }
    }
    if (e.model && !e.model.h && e.model.body) {
      e.model.body.position.set(0, 0, 0); e.model.body.rotation.set(0, 0, 0);
    }
    if (e.root.parent || e.herd) e.root.visible = true;
    if (e.plate) { C.plates.setRec(e.plate, e.rec, C.level()); C.plates.refresh(e.plate, C.level()); C.plates.setHp(e.plate, 1); }
    try { C.bus.emit("enemy:spawn", { id: e.id, kind: e.kind }); } catch (er) { /* bus logs */ }
  }

  function eyeModeFor(e) {
    const ng = cycle() >= 1;
    if (e.kind === "king" || e.kind === "shadowGuard") return ng ? "red" : "glow";
    return ng ? "red" : "normal";
  }

  function spawn(kind, pos, opts = {}) {
    // reuse a dead pooled entity of the same kind when it is a free-floating spawn (summons, EVENTS spawns)
    if (opts.reuse !== false) {
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e.kind === kind && !e.active && e.pooled) {
          e.pooled = false; e.summoned = !!opts.summoned; e.noReward = !!opts.noReward; e.fight = opts.fight || null;
          e.recOverride = opts.rec || 0; e.hpMul = opts.hpMul || 1; e.zone = opts.zone || null; e.clone = !!opts.clone; e.mimic = opts.mimic || null;
          e.home.set(pos.x, pos.y, pos.z); e.leash = opts.leash || e.def.leash; e.yaw = opts.yaw || 0; e.spawnPoints = opts.spawnPoints || null;
          if (e.herd && e.slot < 0) e.slot = e.herd.alloc();
          if (!e.herd && e.root && !e.root.parent) root.add(e.root);
          if (e.plate && !e.plate.group.parent) plateRoot.add(e.plate.group);
          revive(e, pos);
          return e;
        }
      }
    }
    return makeEntity(kind, pos, opts);
  }

  // remove from play; entity object is kept for reuse (pooled)
  function despawn(e) {
    if (!e || !e.active) return;
    e.active = false; e.alive = false; e.pooled = true; e.state = "dead"; e.respawnT = -1;
    if (e.atkData.decal) { fx.cancelDecal(e.atkData.decal); e.atkData.decal = null; }
    if (e.herd && (e.def.model === "rat" || e.def.model === "goldenRat")) { e.herd.free(e.slot); e.slot = -1; }
    else if (e.root) e.root.visible = false;
    if (e.plate) e.plate.group.visible = false;
  }

  function despawnAll(filter) {
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active) continue;
      if (filter && !filter(e)) continue;
      despawn(e);
    }
  }

  // ------------------------------------------------------------------ damage on enemies
  const dirTmp = new THREE.Vector3();
  // info: { dmg, heavy, crit, dir (player->enemy), point, stink, bolt, source:"player"|... , weapon }
  function hitEntity(e, info) {
    if (!e.alive || e.burrowed) return "none";
    if (e.clone) { pop(e); return "hit"; }
    // in front? (player in the enemy's forward half-space)
    const fx0 = Math.sin(e.yaw), fz0 = Math.cos(e.yaw);
    const front = -(info.dir.x * fx0 + info.dir.z * fz0) > 0.3;
    const r = ai.defend(e, info, front);
    if (r) return r;
    let dmg = info.dmg;
    if (dmg <= 0) return "none";
    e.hp -= dmg;
    e.damaged = true;
    e.flash = 1;
    e.lean = Math.min(1, e.lean + (info.heavy ? 1 : 0.55));
    e.kx = info.dir.x; e.kz = info.dir.z; e.hitKnock = info.heavy ? 6 : 3;
    if (!e.aggro) aggro(e);
    if (e.partner && e.partner.alive && !e.partner.aggro) aggro(e.partner);
    if (info.stink) { e.stinkT = 3; }
    C.sfx(e.def.hitSfx, e.pos, { vol: info.heavy ? 1 : 0.8 });
    if (Math.random() < 0.5) C.sfx(e.def.hurtSfx, e.pos, { vol: 0.6, rate: 0.9 + Math.random() * 0.2 });
    // particles: sparks for armour, dust for fur
    const metal = e.def.hitSfx === "hit_metal";
    fx.burst(metal ? "spark" : (e.def.shadow || e.kind === "king" ? "shadow" : "dust"), info.point.x, info.point.y, info.point.z, info.heavy ? 14 : 7, 0.15, -info.dir.x * 0.3, 0.2, -info.dir.z * 0.3);
    if (info.crumbs) fx.burst("crumbs", info.point.x, info.point.y, info.point.z, 10, 0.1);
    if (info.extraFx) fx.burst(info.extraFx, info.point.x, info.point.y, info.point.z, 8, 0.1);
    C.ui("damageNumber", info.point, String(Math.max(1, Math.round(dmg))), info.crit ? "crit" : "hit");
    // stagger (poise)
    e.poiseDmg += info.heavy ? dmg * 1.6 : dmg;
    e.poiseT = 2.5;
    if (e.hp > 0 && e.poiseDmg >= e.def.poise && e.state !== "dead") {
      e.poiseDmg = 0;
      ai.stagger(e, info.heavy ? (e.def.staggerT || 0.3) * 1.8 : (e.def.staggerT || 0.3));
    }
    if (e.plate) C.plates.setHp(e.plate, e.hp / e.maxHp);
    C.onEntityHit(e, dmg, info);
    if (e.hp <= 0) kill(e, info);
    return "hit";
  }

  function pop(e) {
    // King clone: pops into shadow smoke
    fx.burst("shadow", e.pos.x, e.pos.y + 1.2, e.pos.z, 30, 0.6);
    C.sfx("teleport", e.pos, { vol: 0.7, rate: 1.4 });
    despawn(e);
  }

  function aggro(e) {
    if (e.aggro || !e.alive) return;
    e.aggro = true;
    if (e.state === "idle" || e.state === "wander" || e.state === "return") { e.state = "chase"; e.st = 0; }
    if (e.kind === "villager" && !e.shout) {
      e.shout = true;
      if (C.hasMorph()) {
        e.brotherT = 1.3; e.state = "brother"; e.st = 0;
        C.bark(e, cycle() >= 1 ? "...brother? No. Not again." : "...brother?");
      } else {
        C.bark(e, cycle() >= 1 ? "Get off my land. My land. MY LAND." : "Get off my land!");
        C.sfx("villager_shout", e.pos, {});
      }
    }
    if (e.def.pair && e.partner && e.partner.alive && !e.partner.aggro) aggro(e.partner);
  }

  function kill(e, info) {
    if (!e.alive) return;
    e.alive = false;
    e.hp = 0;
    e.state = "dead"; e.st = 0; e.deadT = 0;
    if (e.atkData.decal) { fx.cancelDecal(e.atkData.decal); e.atkData.decal = null; }
    e.atk = null; e.burrowed = false; e.airY = 0;
    C.sfx(e.def.deathSfx, e.pos, { vol: 1 });
    if (e.model && e.model.h) {
      e.model.play(e.def.yields ? "kneel" : "die");
      if (e.model.shield) e.model.shield.visible = false;
    }
    if (e.plate) e.plate.group.visible = false;
    fx.burst(e.def.shadow ? "shadow" : "dust", e.pos.x, e.pos.y + 0.3, e.pos.z, 16, 0.5);
    // respawn scheduling (normal enemies); bosses are handled by their fight controller
    if (!e.summoned && e.def.respawn != null && !e.fight) e.respawnT = e.def.respawn;
    C.onKilled(e, info || null);
  }

  // ------------------------------------------------------------------ per-frame
  const pp = () => engine.player.position;
  let frame = 0;
  let herdShadow = false;
  const setShadow = [(o) => { if (o.isMesh) o.castShadow = false; }, (o) => { if (o.isMesh) o.castShadow = true; }];
  function update(dt, t) {
    frame++;
    herdShadow = false;
    const p = pp();
    const playing = C.playing();
    const lvl = C.level();
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active) continue;
      const dx = p.x - e.pos.x, dy = p.y - e.pos.y, dz = p.z - e.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      e.distP = Math.abs(dy) > 80 ? 1e9 : dist;
      // respawn countdown (runs even when far away)
      if (!e.alive) {
        e.deadT += dt;
        if (e.respawnT >= 0) {
          e.respawnT -= dt;
          if (e.respawnT <= 0 && !e.waitGolden) { respawnEntity(e); continue; }
        }
        animateDead(e, dt, t);
        continue;
      }
      // visibility + LOD
      const vis = e.distP < 120;
      if (vis !== e.visible) { e.visible = vis; setVisible(e, vis); }
      if (!vis && !e.fight) {
        if (e.aggro) { e.aggro = false; e.state = "idle"; e.hp = e.maxHp; }
        continue;
      }
      e.lod = e.distP > 60 ? 1 : 0;
      // shadows only within 30 m (CONTRACT 15)
      const sh = e.distP < 30;
      if (sh !== e.shadowOn) { e.shadowOn = sh; if (e.root && !e.herd) e.root.traverse(setShadow[sh ? 1 : 0]); else if (e.herd && e.def.model !== "rat" && e.def.model !== "goldenRat") e.herd.mesh.castShadow = sh; }
      if (e.herd && (e.def.model === "rat" || e.def.model === "goldenRat") && sh) herdShadow = true;
      if (playing) ai.think(e, dt, t, dist, dx, dz);
      ai.integrate(e, dt, t);
      // stink damage over time
      if (e.stinkT > 0) {
        e.stinkT -= dt; e.stinkTick -= dt;
        if (Math.random() < 0.35) fx.burst("fumes", e.pos.x, e.pos.y + e.def.height * 0.6, e.pos.z, 1, 0.3);
        if (e.stinkTick <= 0) { e.stinkTick = 0.5; C.dot(e, 1); }
      }
      if (e.poiseT > 0) { e.poiseT -= dt; if (e.poiseT <= 0) e.poiseDmg = 0; }
      animate(e, dt, t);
      // name plate
      if (e.plate) {
        const show = e.distP < 22 && (e.aggro || e.damaged || e.distP < 9) && C.playing();
        if (show !== e.plate.group.visible) e.plate.group.visible = show;
        if (show) {
          e.plate.group.position.set(e.pos.x, e.pos.y + e.def.height * (e.def.scale && e.def.model !== "humanoid" ? 1 : 1) + 0.55 + e.airY, e.pos.z);
          C.plates.size(e.plate, e.distP);
          if (e.plate.rec !== e.rec) C.plates.setRec(e.plate, e.rec, lvl);
        }
      }
    }
    ratHerd.mesh.castShadow = herdShadow; goldHerd.mesh.castShadow = herdShadow;
    ratHerd.commit(); goldHerd.commit();
    for (let i = 0; i < list.length; i++) { const e = list[i]; if (e.active && (e.def.model === "ratKing" || e.def.model === "cat")) e.herd.commit(); }
  }

  function setVisible(e, v) {
    if (e.def.model === "rat" || e.def.model === "goldenRat") { if (!v) e.herd.hide(e.slot); }
    else if (e.root) e.root.visible = v;
    if (!v && e.plate) e.plate.group.visible = false;
  }

  function respawnEntity(e) {
    e.respawnT = -1;
    let pt = e.home;
    if (e.kind === "rat" && e.spawnPoints && e.spawnPoints.length) {
      const sp = e.spawnPoints[(Math.random() * e.spawnPoints.length) | 0];
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (sp.radius || 4);
      tmp.set(sp.pos.x + Math.cos(a) * r, sp.pos.y, sp.pos.z + Math.sin(a) * r);
      pt = tmp;
      // 1 in 40: a golden rat appears instead (max one at a time)
      if (C.goldenRoll(e, pt)) { e.waitGolden = true; e.respawnT = 4; return; }
    }
    if (e.kind === "villager") {
      // walk out of his own house: start inside the door, walk to his spot
      const vx = C.villageCentre.x - e.home.x, vz = C.villageCentre.z - e.home.z;
      const L = Math.sqrt(vx * vx + vz * vz) || 1;
      tmp.set(e.home.x - vx / L * 3.2, e.home.y, e.home.z - vz / L * 3.2);
      revive(e, tmp);
      e.state = "emerge"; e.st = 0; e.yaw = Math.atan2(vx, vz);
      return;
    }
    revive(e, pt);
  }

  // ------------------------------------------------------------------ animation
  function animate(e, dt, t) {
    const def = e.def;
    const sp = e.speed;
    if (e.flash > 0) e.flash = Math.max(0, e.flash - dt * 6);
    if (e.lean > 0) e.lean = Math.max(0, e.lean - dt * 4);
    if (e.herd) {
      const qs = def.scale || 1;
      const runRef = def.model === "cat" ? 6 : 4.5;
      e.gait += (Math.min(1, sp / runRef) - e.gait) * Math.min(1, dt * 8);
      e.animPhase += dt * (sp / (qs * 0.11 + 0.05)) * (def.model === "cat" ? 0.55 : 0.9);
      const eye = cycle() >= 1 ? 1 : 0;
      const sq = 1 + e.lean * 0.08;
      if (def.model === "rat" || def.model === "goldenRat") {
        e.herd.set(e.slot, e.pos.x, e.pos.y + e.airY, e.pos.z, e.yaw, e.pitch - e.lean * 0.15, e.roll, qs, 1 / sq, sq);
      } else {
        e.root.rotation.set(0, e.yaw, 0);
        e.model.body.position.y = e.airY;
        e.model.body.rotation.set(e.pitch - e.lean * 0.12, 0, e.roll);
        e.model.body.scale.set(qs * sq, qs / sq, qs * sq);
        if (e.model.headPivot) e.model.headPivot.rotation.set(e.headPitch + Math.sin(e.animPhase * 2) * 0.06 * e.gait, e.headYaw, 0, "YXZ");
      }
      e.herd.anim(e.slot, e.animPhase, e.gait, t + e.slot * 1.7, e.flash, e.headYaw, e.headPitch, e.twitch, eye);
      if (e.headPitch !== 0) e.headPitch *= Math.max(0, 1 - dt * 5);
      return;
    }
    // humanoid
    e.root.rotation.set(0, e.yaw, 0);
    const m = e.model;
    m.body.position.y = e.airY;
    m.body.rotation.x = -e.lean * 0.22 + e.pitch;
    m.body.rotation.z = e.roll;
    const pulse = 1 + e.flash * 0.04;
    m.body.scale.set(pulse, pulse, pulse);
    if (e.lod === 0 || (frame & 3) === 0) m.update(e.lod ? dt * 4 : dt, sp, e.airY > 0.2);
    if (m.shield) m.shieldPose(e.shieldUp);
    if (m.glints && e.kind === "king") {
      // staff orb flicker before attacks
      const orb = m.weapon && m.weapon.userData.orb;
      const tele = e.atk && e.atkPhase === 0 ? 1 : 0;
      if (orb) orb.scale.setScalar(1 + tele * (0.3 + 0.3 * Math.sin(t * 40)));
    }
  }

  function animateDead(e, dt, t) {
    if (!e.active) return;
    const def = e.def;
    if (e.herd) {
      const k = Math.min(1, e.deadT / 0.45);
      e.roll = (Math.PI / 2) * (1 - (1 - k) * (1 - k));
      e.twitch = e.deadT < 1.6 ? Math.max(0, 1 - e.deadT / 1.6) : 0;
      const sink = e.deadT > 2.4 ? Math.min(1.2, (e.deadT - 2.4) * 0.6) : 0;
      const qs = def.scale || 1;
      if (def.model === "rat" || def.model === "goldenRat") {
        if (e.deadT > 4.4) { e.herd.hide(e.slot); return; }
        e.herd.set(e.slot, e.pos.x, e.pos.y - sink * 0.35 * qs, e.pos.z, e.yaw, 0, e.roll, qs, 1, 1);
      } else {
        e.root.rotation.set(0, e.yaw, 0);
        e.model.body.rotation.set(0, 0, e.roll);
        e.model.body.position.y = -sink * 0.3 * qs;
        if (e.deadT > 6) { e.root.visible = false; }
      }
      e.herd.anim(e.slot, e.animPhase, 0, t, 0, 0, 0.3, e.twitch, 0);
      if (def.model !== "rat" && def.model !== "goldenRat") e.herd.commit();
      return;
    }
    const m = e.model;
    if (!m) return;
    if (e.deadT < 3 || def.yields) m.update(dt, 0, false);
    if (e.deadT > 2.6 && !def.yields) {
      const k = Math.min(1, (e.deadT - 2.6) / 1.4);
      m.body.position.y = -k * 0.9;
      if (k >= 1 && e.root.visible) e.root.visible = false;
    }
    if (m.extras && e.deadT > 0.4 && !def.yields) m.extras.visible = e.deadT < 2.6;
  }

  return { list, spawn, despawn, despawnAll, hitEntity, kill, aggro, update, revive, respawnEntity, ai, ratHerd, goldHerd, root, plateRoot };
}
