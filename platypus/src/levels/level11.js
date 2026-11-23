// level11.js - LEVEL 11, "THE PLATYPUS KING" (LEVELS2.md Part C, STORY2.md).
//   Part 1  the dream with no wizard: "3 DAYS...", the light that will not be caught, "Your power is within you-"
//   Part 2  the army comes: the camp wakes in the storm, the battle on the riverbank in three waves; every soldier
//           you knock out can be woken as a platypus with a potion, so your army grows
//   Part 3  the Platypus King: three phases, a checkpoint per phase; the LIVING POTION and the paper you cannot read
//   Part 4  you set off alone to find Pip ... and are shot
//   Part 5  the echo: Wizard Wobble, seen at last, teaches the scream on purpose. TO BE CONTINUED.
// Structure follows level5.js: every beat has a starter that begins from hardStop(), so skipTo() and the
// checkpoint restores set the world exactly as a playthrough would have it.
import { getWizard } from "./common.js";
import { createDream } from "../dream.js";
import { createJungle } from "../jungle.js";
import { createTribe } from "../tribe.js";
import { createCombat } from "../combat.js";
import { createPotions } from "../potions.js";
import { createBoss } from "../boss.js";

export const meta = { n: 11, title: "THE PLATYPUS KING" };

const STEPS = ["intro", "void", "wake", "battle", "wave2", "wave3", "march", "king", "king2", "king3", "fall", "drop", "paper",
  "farewell", "trail", "shot", "echo", "lesson", "test", "end", "done"];
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

const WAVES = [null, { soldiers: 8, officers: 0, cap: 6, music: 0.6 }, { soldiers: 12, officers: 1, cap: 9, music: 0.8 }, { soldiers: 14, officers: 2, cap: 12, music: 1 }];
const WAVE_STEP = [null, "battle", "wave2", "wave3"], WAVE_CP = [null, "field", "wave2", "wave3"];
const KING_STEP = ["king", "king2", "king3"], KING_CP = ["king0", "king1", "king2"];
const ARMY_AT = { battle: 11, wave2: 13, wave3: 16, king: 20, king2: 22, king3: 24 }; // what skipTo gives you (a fair playthrough)
const ALLY_HP = 90;           // the army takes three bolts, not two: it should grow through the battle, not melt
const CD = { sting: 0.45, slap: 0.8, pulse: 2.5 };
const BOSS_DMG = { sting: 8, slap: 12, finisher: 12, shot: 6 };
const COUNTER = {
  sweep: "Jump over the tail!",
  slam: "Step out of the circle, then strike his stuck bill!",
  charge: "Stand in front of a stone, then dodge!",
  pound: "Jump over the ring!",
  spit: "Keep moving! The venom slows you.",
};

export function createLevel(ctx) {
  const { THREE, player, platypus, cam, ui, cinema, audio, fx } = ctx;
  const music = ctx.music, ab = ctx.abilities;

  // guarded calls into audio / fx (a missing sound or effect must never stop the story)
  function A(name, a, b, c, d) { const f = audio[name]; return typeof f === "function" ? f.call(audio, a, b, c, d) : undefined; }
  function FX(name, a, b, c, d, e, g) { const f = fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e, g) : undefined; }
  function M(name, a, b) { const f = music && music[name]; return typeof f === "function" ? f.call(music, a, b) : undefined; }
  function F(v) {
    const a = ctx.camera.aspect || 1.78;
    if (a >= 1.3) return v;
    return Math.min(80, (2 * Math.atan((Math.tan((v * PI) / 360) * 1.3) / a) * 180) / PI);
  }

  let dream = null, jungle = null, tribe = null, combat = null, potions = null, boss = null, wizard = null;
  let J = null;            // jungle.P
  let mem = null;          // tribe.members
  let step = "boot";
  let gen = 0;             // bumped by hardStop(): callbacks that outlive their beat compare it and do nothing
  let place = "";          // "void" | "jungle" | "echo": which module set update() drives

  // ---- scratch (no per-frame allocations) ----
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const pc = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  const tgts = [];                                  // what the blaster may snap to: living enemies (+ the King)
  const bossSrc = { kind: "sting", x: 0, z: 0 };
  const HOLD = { x: 0, z: 0, r: 14 };               // the rim of the stone circle (combat.order("hold", HOLD))
  const chargeAt = { x: 0, z: 0 };
  const colW = { x: 0, z: 0, r: 0.5, on: false };   // Wizard Wobble is solid
  const save = { army: 11, potions: 3, ammo: 30 };  // what the active checkpoint gives back
  const cd = { sting: 0, slap: 0, pulse: 0 };
  const queue = [];                                 // the wave still to come: 0 = soldier, 1 = officer
  const sayQ = [];
  let sayThen = null;

  // ---- state of the beats ----
  let voidStage = 0, voidT = 0;
  let wave = 0, spawned = 0, spawnT = 0, waveCheckT = 0, waveOver = false, routed = false, nagT = 0, flaskT = 0, thunderT = 0;
  let potionTaught = false, firstBody = false, tikaTold = false, allyTold = false, objKey = "";
  let bossOn = false, bossShown = false, finalOn = false, finalT = 0, finalAsked = false, openTold = false, musT = 0, musI = -1;
  let fCrown = false, fLanded = false, fDrop = false, lastHurt = "", hintedHard = false;
  const hits = { sweep: 0, slam: 0, charge: 0, pound: 0, spit: 0 };
  let goal = null, flaskShown = false, actName = null;
  let bottlePick = null, paperPick = null, readV = 0, readTo = 0;
  let trailStage = 0;
  let lesson = "", screams = 0, lastPower = 0, evalT = -1, testT = 0, caughtT = 0, fading = false, fadeT = 0;

  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const nearP = (p, r) => dist2(player.x, player.z, p.x, p.z) <= r;
  const later = (s, fn) => { const g = gen; ctx.after(s, () => { if (g === gen) fn(); }); };          // scaled game time
  const laterReal = (s, fn) => { const g = gen; cinema.after(s, () => { if (g === gen) fn(); }); };   // wall time
  const keyHint = (keys, touch) => (ctx.touch ? touch : keys);
  const groundWater = (x, z) => { const w = jungle.waterAt(x, z); return w > -1e6 ? w : null; };
  const gy = (x, z) => Math.max(jungle.heightAt(x, z), 0);

  // =====================================================================================================
  // small shared pieces
  // =====================================================================================================
  function setGoal(x, y, z, hex) {
    if (goal && goal.set) { goal.set(x, y, z); return; }
    goal = FX("beacon", x, y, z, hex === undefined ? 0xffe08a : hex) || null;
  }
  function clearGoal() { if (goal && goal.remove) goal.remove(); goal = null; }
  function setAct(label) { if (label !== actName) { actName = label; ui.setAction(label); } }
  function objective(key, text, keys) { if (key !== objKey) { objKey = key; ui.setObjective(text, keys || ""); } }

  // ---- Wizard Wobble speaks (typed bubbles, one line at a time, as in level 5) ----
  function blip() { A("wizardBlip", 0.82 + Math.random() * 0.42); }
  function sayTyped() { wizard.setTalking(false); }
  function sayNext() {
    if (!sayQ.length) {
      wizard.setTalking(false);
      const f = sayThen;
      sayThen = null;
      if (f) f();
      return;
    }
    const l = sayQ.shift();
    if (l.g) wizard.gesture(l.g);
    if (l.fn) l.fn();
    wizard.setTalking(true);
    ui.say(l.t, { onBlip: blip, onTyped: sayTyped, onDone: sayNext });
  }
  function wizSay(lines, then) {
    sayQ.length = 0;
    for (let i = 0; i < lines.length; i++) sayQ.push(lines[i]);
    const g = gen;
    sayThen = then ? () => { if (g === gen) then(); } : null;
    ctx.setSpeaker(wizard.group, 2.12);
    sayNext();
  }
  function wizBusy() { return sayQ.length > 0 || sayThen !== null || ui.speaking(); }

  // ---- gear won in level 10 (the engine empties every service on entry) ----
  function wearGear(glasses) {
    ctx.gear.wear("body", "suit", { armor: 0.5 });
    ctx.gear.wear("weapon", "blaster");
    if (glasses) ctx.gear.wear("eyes", "glasses", { visor: true }); else if (ctx.gear.worn.eyes) ctx.gear.remove("eyes");
  }
  function walkSpeed() { player.maxSpeed = 3 * (ctx.gear.speed || 1); }

  // =====================================================================================================
  // build / worlds
  // =====================================================================================================
  function build() {
    dream = ctx.shared("dream", () => createDream(ctx));
    jungle = ctx.shared("jungle", () => createJungle(ctx));
    tribe = ctx.shared("tribe", () => createTribe(ctx));
    combat = ctx.shared("combat", () => createCombat(ctx));
    potions = ctx.shared("potions", () => createPotions(ctx));
    boss = ctx.shared("boss", () => createBoss(ctx));
    wizard = getWizard(ctx);
    J = jungle.P;
    mem = tribe.members;
    if (typeof tribe.warm === "function") tribe.warm();
    HOLD.x = J.arena.x; HOLD.z = J.arena.z; HOLD.r = J.arena.r - 0.5;
    if (ctx.debug) ctx.debug.level11 = { dream, jungle, tribe, combat, potions, boss, save };
  }

  // Everything back to nothing, behind black. Every starter begins here.
  function hardStop() {
    gen++;
    cinema.reset();
    cinema.fade("black", 0);
    ctx.clearTimers();
    ctx.setTimeScale(1, 0);
    ui.clearSpeech();
    sayQ.length = 0; sayThen = null;
    ui.showHud(false);
    ui.setObjective(null); objKey = "";
    ui.setAction(null); actName = null;
    ui.boss.hide();
    ui.setCharge(null);
    ctx.setSpeaker(null);
    clearGoal();
    if (ctx.pick && ctx.pick.clear) ctx.pick.clear();
    bottlePick = paperPick = null;
    // loops of every beat
    A("dreamAmbience", false); A("jungleAmbience", false); A("rain", 0); A("tribeDrums", false); A("screamCharge", 0);
    A("muffle", 0, 0);
    // services
    ab.cancel();
    ab.potion.disable(); ab.scream.disable(); ab.shoot.disable();
    ab.potion.onThrow = ab.potion.onEmpty = null;
    ab.scream.onStart = ab.scream.onCharge = ab.scream.onRelease = ab.scream.onFizzle = ab.scream.onCancel = null;
    ab.shoot.onFire = ab.shoot.onEmpty = null;
    ab.targets = null;
    ab.buttons({});
    ctx.health.disable();
    ctx.health.shield = false;
    ctx.health.onHurt = null;
    ctx.army.show(false);
    // modules
    combat.reset();
    combat.bodyTTL = Infinity; combat.maxShooters = 2; combat.aimScale = 1; combat.damageScale = 1; combat.viewScale = 1; combat.frozen = false;
    potions.reset();
    boss.reset();
    boss.group.visible = false;
    tribe.reset();
    platypus.reset();
    if (platypus.holdFlask) platypus.holdFlask(false);
    wizard.setTalking(false);
    wizard.group.visible = false;
    wizard.group.scale.setScalar(1);
    colW.on = false;
    // the player
    player.scripted = false; player.hidden = false; player.enabled = false; player.carrying = false;
    player.maxSpeed = 3; player.lock = 0; player.face = null; player.canJump = player.canDive = true;
    player.kx = player.kz = 0; player.invuln = 0;
    player.stop();
    cam.wantDist = 3.7; cam.pitch = 0.42;
    // flags of every beat
    voidStage = 0; voidT = 0;
    wave = 0; spawned = 0; spawnT = 0; waveCheckT = 0; waveOver = false; routed = false; nagT = 0; flaskT = 0; thunderT = 6; queue.length = 0;
    potionTaught = false; firstBody = false; tikaTold = false; allyTold = false;
    bossOn = false; bossShown = false; finalOn = false; finalT = 0; finalAsked = false; openTold = false; musT = 0; musI = -1;
    fCrown = fLanded = fDrop = false; lastHurt = ""; hintedHard = false;
    hits.sweep = hits.slam = hits.charge = hits.pound = hits.spit = 0;
    flaskShown = false; readV = readTo = 0;
    trailStage = 0;
    lesson = ""; lastPower = 0; evalT = -1; testT = 0; caughtT = 0; fading = false; fadeT = 0;
    cd.sting = cd.slap = cd.pulse = 0;
    ui.setCooldown("sting", 0); ui.setCooldown("slap", 0); ui.setCooldown("zap", 0);
    tgts.length = 0;
  }

  // A world is re-entered cleanly even when it is already the active one (skipTo within the same place).
  function leaveWorld(w) { if (ctx.world === w) ctx.setWorld(null); }
  function toVoid() {
    leaveWorld(dream);
    dream.setScene("void");
    ctx.setWorld(dream);
    FX("setGround", dream.heightAt, null);
    place = "void";
  }
  // The jungle scenes sit at the triangle budget (the army + the named members + you): there the named members
  // cast no shadows and at most three are full models (as in levels 9 and 10). exit() puts them back.
  function tribeLite(on) {
    tribe.maxFull = on ? 3 : 4;
    for (const k in tribe.members) {
      const m = tribe.members[k], g = m && m.body && m.body.group;
      if (!g) continue;
      g.traverse((o) => { if (o.isMesh) { if (o.userData.l11Shadow === undefined) o.userData.l11Shadow = o.castShadow; o.castShadow = on ? false : o.userData.l11Shadow; } });
    }
  }
  function toJungle(time) {
    leaveWorld(jungle);
    tribeLite(true);
    jungle.reset();
    jungle.group.add(combat.group, potions.group, boss.group, tribe.group);
    combat.setWorld(jungle); potions.setWorld(jungle); boss.setWorld(jungle); tribe.setWorld(jungle);
    tribe.enemies = combat.enemies;
    boss.setArena(J.arena);
    boss.allies = combat.allies;
    jungle.setTime(time, 0);
    ctx.setWorld(jungle);
    FX("setGround", jungle.heightAt, groundWater);
    place = "jungle";
  }
  function toEcho() {
    leaveWorld(dream);
    dream.setScene("echo");
    dream.group.add(combat.group, wizard.group);
    combat.setWorld(dream);
    ctx.setWorld(dream);
    FX("setGround", dream.heightAt, null);
    place = "echo";
  }

  // ---- the tribe's named members: who stands where (never more than four full models) ----
  function member(m, x, z, yaw, what, opts) {
    m.visible = true;
    m.place(x, z, yaw || 0);
    m.do(what || "idle", opts);
  }
  function hideMember(m) { m.visible = false; }
  function lineAtBarricade() {
    const b = J.barricade;
    member(mem.moss, b.x + 2.6, b.z + 1.2, PI, "guard", { at: { x: b.x + 2.6, z: b.z + 1.2 }, yaw: PI });
    member(mem.tika, b.x - 2.8, b.z + 1.6, PI, "guard", { at: { x: b.x - 2.8, z: b.z + 1.6 }, yaw: PI });
    member(mem.burra, b.x - 4.6, b.z + 3.2, PI, "sit", { at: { x: b.x - 4.6, z: b.z + 3.2 } });
    hideMember(mem.nib);
  }
  function addRok(x, z) {
    mem.rok.visible = true;
    mem.rok.place(x, z, PI);
    return combat.addAlly(x, z, { hero: mem.rok, hp: ALLY_HP * 1.5 });
  }
  // a fresh army of n (Rok included) in rings round a point; the ten born in the tribe wear its white paint
  function makeArmy(n, x, z) {
    const paint = tribe.LOOKS && tribe.LOOKS.war ? tribe.LOOKS.war.paint : null;
    for (let i = 0; i < n - 1 && i < 39; i++) {
      const r = 1.1 + 0.6 * Math.floor(i / 7), a = (i % 7) / 7 * TAU + Math.floor(i / 7) * 0.45;
      combat.addAlly(x + Math.sin(a) * r, z + Math.cos(a) * r, { look: i * 3 + 1, paint: i < 10 ? paint : null, hp: ALLY_HP });
    }
    addRok(x + 0.4, z - 1.6);
  }
  // the tribe never lets the line get too thin: between waves (and before the King) the ones who stayed at the camp
  // come running, up to a floor. Without this one bad wave left two fighters for every retry after it.
  function topUpArmy(floor, x, z) {
    const need = Math.min(40, floor) - combat.allies.length;
    if (need <= 0) return 0;
    for (let i = 0; i < need; i++) {
      const a = (i / Math.max(1, need)) * TAU, r = 1.6 + 0.5 * (i % 3);
      combat.addAlly(x + Math.sin(a) * r, z + Math.cos(a) * r, { look: 60 + i * 3, hp: ALLY_HP });
    }
    return need;
  }
  // after a restart: the same ones back (combat.reset() remembered where they stood), up to the saved count
  function restoreArmy() {
    combat.setAllies(Math.max(0, save.army - 1));
    addRok(player.x - 1.2, player.z + 1.2);
  }
  function snapshot() {
    save.army = combat.allies.length;
    save.potions = ab.potion.count;
    save.ammo = ab.shoot.on && isFinite(ab.shoot.ammo) ? ab.shoot.ammo : 0;
  }

  // =====================================================================================================
  // fighting kit: health, potions, the blaster, sting / slap / pulse
  // =====================================================================================================
  function enableShoot(ammo) {
    if (ammo <= 0) { if (ab.shoot.on) ab.shoot.disable(); return; }
    ab.shoot.enable({ ammo, rate: 4, range: 22, muzzle: platypus.muzzle || null, targets: tgts });
  }
  function kitOn(potionCount, ammo) {
    wearGear(true);
    walkSpeed();
    ctx.health.enable({ max: 100, regen: 10, regenDelay: 4, label: "Health" });
    ctx.health.onHurt = onHurt;
    ab.buttons({ sting: true, slap: true, zap: true });
    ab.potion.enable({ count: potionCount, max: 6, targets: combat.bodies });
    ab.potion.onThrow = onThrow;
    ab.shoot.onFire = onFire;
    ab.shoot.onEmpty = onDry;
    enableShoot(ammo);
    potions.bodies = combat.bodies;
    potions.allies = combat.allies;
    potions.autoCollect = false;
    potions.onTransform = onTransform;
    potions.onJoined = onJoined;
    potions.onMiss = onMiss;
    combat.onEvent = onCombat;
    combat.bodyTTL = Infinity;
    combat.maxShooters = 2;
    ctx.army.show("Army");
  }
  function refill(potionCount, ammo) {
    ab.potion.count = clamp(potionCount, 0, ab.potion.max);
    ab.potion.add(0);
    if (ammo > 0 && ab.shoot.on) { ab.shoot.ammo = ammo; ab.shoot.add(0); } else enableShoot(ammo);
  }
  function applyAssist() {
    const t = ctx.checkpoint.tries || 0, k = t >= 6 ? 2 : t >= 3 ? 1 : 0;
    combat.aimScale = k === 2 ? 1.5 : k === 1 ? 1.25 : 1;
    combat.damageScale = k === 2 ? 0.5 : k === 1 ? 0.75 : 1;
    combat.viewScale = k === 2 ? 0.65 : k === 1 ? 0.8 : 1;
    boss.assist = k;
    if (k === 2 && !hintedHard) {
      hintedHard = true;
      const tip = COUNTER[lastHurt] || (lastHurt === "bullet" ? "When the red line stops moving, run sideways!" : "Fall back behind cover and let your health return.");
      later(1.2, () => ui.hint(tip, 5));
    }
  }
  function onHurt(amount, src) { if (src && src.kind === "bullet") lastHurt = "bullet"; }

  function onThrow(from, to, seconds, apex, target) { potions.throw(from, to, seconds, apex, target); }
  function onTransform(body, x, z) {
    if (combat.allies.length >= 40) return null;
    const ally = combat.addAlly(x, z, { newborn: true, hp: ALLY_HP });
    M("stinger", "armyUp");
    A("armyUp", combat.allies.length);
    if (!potionTaught) {
      potionTaught = true;
      if (firstBody) clearGoal();
      ui.hint("A new friend! Every soldier you knock out can join your army.", 4.5);
    }
    return ally;
  }
  function onJoined() { objKey = ""; }
  function onMiss() { if (!potionTaught) ui.hint("Aim the potion at a soldier you have knocked out.", 3); }

  function bossReach(kind) {
    if (!bossOn || !boss.alive) return false;
    const R = combat.strikeRange;
    return dist2(player.x, player.z, boss.x, boss.z) <= boss.r + (kind === "slap" ? R.slap : kind === "sting" ? R.sting : R.finisher) + 0.35;
  }
  function hitBoss(kind) {
    bossSrc.kind = kind; bossSrc.x = player.x; bossSrc.z = player.z;
    return boss.hit(BOSS_DMG[kind] || 8, bossSrc);
  }
  // sting / slap / pulse, exactly as LEVELS2.md Part C describes (plus the King)
  function attack(kind) {
    if (!player.enabled || platypus.acting || cd[kind] > 0) return true;
    if (kind === "pulse" && !player.inWater) { ui.hint("The pulse needs water!", 1.6); return true; }
    const fin = kind !== "pulse" && ((finalOn && bossReach("finisher")) || combat.wouldFinish(kind));
    const t = (fin ? platypus.finisherHitTime : kind === "slap" ? platypus.slapHitTime : kind === "sting" ? platypus.stingHitTime : platypus.zapFireTime) || 0.25;
    if (fin) platypus.finisher(); else if (kind === "slap") platypus.tailSlap(); else if (kind === "sting") platypus.sting(); else platypus.zap();
    if (kind === "sting" || fin) A("sting"); else if (kind === "pulse") A("zapCharge", t);
    cd[kind] = CD[kind];
    player.lock = Math.max(player.lock, t + 0.12);
    const k = fin ? "finisher" : kind;
    later(t, () => {
      const res = combat.strike(k).result;
      let onBoss = "none";
      if (kind !== "pulse" && bossReach(k)) onBoss = hitBoss(k);
      if (kind === "pulse") A("zapFire");
      if (res === "miss" && onBoss === "none") { if (kind === "slap") A("tailSlap"); }
      else if (kind === "slap" || fin) { A("tailSlapHit"); cinema.shake(0.014, 0.18); }
    });
    return true;
  }
  // one bolt of the blaster. Point-blank it is a sting instead (with the gun on, J / left click fire).
  function onFire(origin, dirX, dirZ, target, dist) {
    const close = bossReach("sting") || combat.wouldFinish("sting") || (target && target !== boss && dist < combat.strikeRange.sting + 0.1);
    if (close) { ab.shoot.add(1); attack("sting"); return; }
    A("gunshot", 0, 0, "blaster");
    FX("muzzleFlash", origin, dirX, dirZ, 0.8);
    if (platypus.fire) platypus.fire();
    let atBoss = target === boss;
    if (!atBoss && !target && bossOn && boss.alive) {
      // a free shot still hits him if he stands in its way
      const rx = boss.x - origin.x, rz = boss.z - origin.z, along = rx * dirX + rz * dirZ;
      atBoss = along > 0.3 && along < 22 && Math.abs(rx * dirZ - rz * dirX) < boss.r;
    }
    if (atBoss) {
      const d = Math.max(0.5, dist2(origin.x, origin.z, boss.x, boss.z) - boss.r * 0.7);
      v1.set(origin.x, origin.y, origin.z);
      v2.set(origin.x + dirX * d, gy(boss.x, boss.z) + 0.55, origin.z + dirZ * d);
      FX("tracer", v1, v2, 90, 0x9fe8ff);
      bossSrc.kind = "shot"; bossSrc.x = origin.x; bossSrc.z = origin.z;
      if (boss.hit(BOSS_DMG.shot, bossSrc) === "armor") { FX("bulletImpact", v2, "metal"); A("ricochet", 0); }
    } else combat.playerShot(origin, dirX, dirZ, target === boss ? null : target, dist);
    if (ab.shoot.ammo <= 0) later(0.35, () => { if (ab.shoot.on && ab.shoot.ammo <= 0) { ab.shoot.disable(); ui.hint("Out of bolts! Sting and slap.", 3); } });
  }
  function onDry() { A("emptyClick"); }

  function tickKit(dt) {
    if (cd.sting > 0) { cd.sting = Math.max(0, cd.sting - dt); ui.setCooldown("sting", cd.sting / CD.sting); }
    if (cd.slap > 0) { cd.slap = Math.max(0, cd.slap - dt); ui.setCooldown("slap", cd.slap / CD.slap); }
    if (cd.pulse > 0) { cd.pulse = Math.max(0, cd.pulse - dt); ui.setCooldown("zap", cd.pulse / CD.pulse); }
    // the flask in the paw while aiming
    const aim = !!ab.potion.aiming;
    if (aim !== flaskShown) { flaskShown = aim; potions.holdFlask(aim); if (platypus.holdFlask) platypus.holdFlask(aim); }
    // flasks lying about: picked up by walking over them, only while there is room for one
    if (ab.potion.on && ab.potion.count < ab.potion.max && potions.count > 0) {
      const id = potions.nearest(player.x, player.z, 0.95);
      if (id >= 0 && potions.collect(id)) ab.potion.add(1);
    }
    // the blaster's targets
    tgts.length = 0;
    const en = combat.enemies;
    for (let i = 0; i < en.length; i++) if (en[i].alive && !en[i].fleeing11) tgts.push(en[i]);
    if (bossOn && boss.alive) tgts.push(boss);
  }

  // =====================================================================================================
  // PART 1 - the dream with no wizard
  // =====================================================================================================
  function setupVoid() {
    toVoid();
    wearGear(false);
    M("duck", 0, 0.1);
    M("play", "dream", { intensity: 0.1 });
    A("dreamAmbience", true);
    const s = dream.P.spawn;
    player.teleport(s.x, s.z, 0);
    cam.yaw = 0;
  }
  function startIntro() {
    hardStop();
    setupVoid();
    step = "intro";
    start();
  }
  // Title card, then the countdown card, then the grey quilt in the dark.
  function start() {
    const g = gen;
    cinema.titleCard({ kicker: "LEVEL 11", title: meta.title }, () => {
      if (g !== gen || step !== "intro") return;
      cinema.dayCard("3 DAYS...", { kicker: "", hold: 3.2 }, () => { if (g === gen && step === "intro") beginVoid(); });
    });
  }
  function startVoid() {
    hardStop();
    setupVoid();
    beginVoid();
  }
  function beginVoid() {
    step = "void";
    voidStage = 0; voidT = 0;
    ab.buttons({});
    player.maxSpeed = 3;
    player.enabled = true;
    ui.showHud(true);
    objective("void", "Where is Wizard Wobble?", "walk toward the light");
    cinema.fade("clear", 1.8);
  }
  function updateVoid(dt) {
    if (voidStage >= 3) return;
    voidT += dt;
    const d = Math.hypot(player.x, player.z);
    if (voidStage === 0 && (d >= 12 || voidT >= 10)) {
      voidStage = 1;
      dream.setLight({ flicker: 0.7 }, 0.8);
      A("farVoice", 4, 0.3);
      cinema.caption("Wait...", 2.6, { who: "A voice, far away" });
    } else if (voidStage === 1 && (d >= 20 || voidT >= 17)) {
      voidStage = 2;
      dream.setLight({ dist: 36, flicker: 0.35 }, 7);
      A("farVoice", 5, 0.8);
      cinema.caption("Wait — don't go!", 2.8, { who: "A voice, far away" });
      player.maxSpeed = 3.6;
      M("setIntensity", 0.8, 2);
      objective("void2", "Catch the light!", "run");
    } else if (voidStage === 2 && (d >= 30 || voidT >= 25)) {
      voidStage = 3;
      endVoid();
    }
  }
  // The light stops, swells, speaks - and goes out. No Wobble was ever seen.
  function endVoid() {
    player.enabled = false;
    player.stop();
    ui.setObjective(null); objKey = "";
    dream.setLight({ dist: 11, swell: 2.8, flicker: 0 }, 1.3);
    A("farVoice", 7, 1);
    cinema.caption("Your power is within you—", 2.3, { who: "A voice, far away" });
    laterReal(2.3, () => {
      cinema.caption(null);
      dream.setLight({ on: 0 }, 0.08);
      M("duck", 1, 1.5);
      cinema.fade("black", 1.6, () => laterReal(0.9, () => startWake()));
    });
  }

  // =====================================================================================================
  // PART 2 - the army comes
  // =====================================================================================================
  function startWake() {
    hardStop();
    toJungle("storm");
    M("stop", 0.2);
    M("duck", 0, 0.3);
    step = "wake";
    jungle.setZone("arena", false); jungle.setZone("rival", false);
    A("jungleAmbience", true, "night");
    A("rain", 0.6);
    A("warCry");
    A("tribeDrums", true, 0.55);
    tribe.village.populate(jungle.spots || J.spots);
    tribe.village.threat = J.campGate;
    tribe.village.setMood("alarm", 0);
    const b = J.bed, e = J.campEdge;
    member(mem.nib, b.x + 0.9, b.z - 0.7, Math.atan2(-0.9, 0.7), "idle");
    member(mem.burra, b.x - 1.1, b.z - 1.7, Math.atan2(1.1, 1.7), "idle");
    member(mem.rok, e.x, e.z, Math.atan2(J.camp.x - e.x, J.camp.z - e.z), "guard", { at: { x: e.x, z: e.z }, yaw: Math.atan2(J.camp.x - e.x, J.camp.z - e.z) });
    hideMember(mem.moss); hideMember(mem.tika);
    wearGear(true);
    player.teleport(b.x, b.z, b.yaw || 0);
    if (platypus.sleep) platypus.sleep(true);
    mem.nib.lookAt(platypus.group); mem.burra.lookAt(platypus.group);
    const c = J.camBed, g = gen, by = gy(b.x, b.z);
    const awake = () => { if (platypus.sleep) platypus.sleep(false); };
    cinema.play([
      { wait: 1.2 },
      { call: () => { A("thunder", 0.5); mem.nib.emote("scared"); A("tribeChirp", "scared", 0.9, 0.2, 1.3); } },
      { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: [c.look.x, c.look.y, c.look.z], fov: F(40),
        to: { pos: [c.pos.x - 0.5, c.pos.y - 0.2, c.pos.z + 0.5] }, dur: 6.5 }, hold: false },
      { fade: "clear", dur: 1.4 },
      { caption: "[Wake up! Wake up! They are here!]", dur: 2.8, who: "Nib" },
      { call: () => { awake(); if (platypus.wakeStretch) player.lock = platypus.wakeStretch() || 1.2; } },
      { wait: 1.3 },
      { shot: { pos: [e.x + 2.2, gy(e.x, e.z) + 0.85, e.z + 2.8], look: mem.rok.group, lookY: 0.3, fov: F(34), dur: 0 } },
      { call: () => { mem.rok.emote("war"); A("warCry"); } },
      { caption: "[They followed us. All of them.]", dur: 3.4, who: "Rok" },
      { shot: { pos: [b.x + 1.5, by + 0.75, b.z - 0.2], look: mem.burra.group, lookY: 0.28, fov: F(34),
        to: { pos: [b.x + 1.2, by + 0.7, b.z - 0.4] }, dur: 4.2 }, hold: false },
      { call: () => { mem.burra.emote("bow"); A("potionPickup"); M("stinger", "gear"); } },
      { caption: "[Wobble showed you. I saw it in your sleep.]", dur: 4.2, who: "Old Burra" },
    ], { skippable: true, release: 1.0, onSkip: awake, onDone: () => { if (g === gen) beginMuster(); } });
  }
  // Three flasks in your paws; follow Rok to the gate.
  function beginMuster() {
    step = "wake";
    kitOn(3, 30);
    ctx.army.show(false);
    player.enabled = true;
    ui.showHud(true);
    const e = J.campEdge;
    objective("muster", "Follow Rok to the gate", "three potions: " + keyHint("Q", "the green button"));
    setGoal(e.x, gy(e.x, e.z), e.z);
    mem.nib.do("follow", { dist: 1.4, side: 1 });
    mem.burra.do("idle");
    ui.hint("Old Burra gave you three potions.", 3.5);
  }
  function updateMuster() {
    if (cinema.playing) return;
    if (nearP(J.campEdge, 3.2)) runToField();
  }
  // The run to the river is one cut: the whole tribe pours over the bank to the barricade.
  function fieldSpot() { return { x: J.barricade.x, z: J.barricade.z + 0.7, yaw: PI }; }
  function setupField(armyN) {
    tribe.village.hide();
    tribe.maxFull = 1;               // the army + the soldiers + the King fill the budget: only Rok is a full model
    jungle.setZone("camp", false); jungle.setZone("arena", false); jungle.setZone("rival", false);
    A("tribeDrums", false);
    lineAtBarricade();
    const s = fieldSpot();
    player.teleport(s.x, s.z, s.yaw);
    makeArmy(armyN, s.x, s.z + 2.6);
    ctx.army.show("Army");
    cam.wantDist = 4.8;
    cam.yaw = PI;
  }
  function runToField() {
    const g = gen, c = J.camField, s = fieldSpot();
    clearGoal();
    player.enabled = false;
    ui.setObjective(null); objKey = "";
    cinema.play([
      { fade: "black", dur: 0.5 },
      { call: () => {
        setupField(ARMY_AT.battle);
        player.teleport(s.x - 4.5, s.z + 6.5, PI);
        player.walkTo(s.x, s.z, { speed: 1, face: PI });
        A("tribeCheer", 0.5);
      } },
      // from the field side, low: the tribe pours over the bank toward the camera (J.camField looks the other way, at
      // the empty field)
      { shot: { pos: [s.x + 3.2, gy(s.x, s.z) + 4.6, s.z - 6.2], look: [s.x - 1.2, gy(s.x, s.z) + 0.3, s.z + 3.2], fov: F(48),
        to: { pos: [s.x + 2.6, gy(s.x, s.z) + 3.9, s.z - 5.2] }, dur: 6 }, hold: false },
      { fade: "clear", dur: 0.6 },
      { caption: "The whole tribe runs for the riverbank.", dur: 3, narr: true },
      { call: () => A("thunder", 0.35) },
      { until: () => !player.walking, max: 2.5 },
    ], { skippable: true, release: 1.0,
      onSkip: () => { if (g === gen && !combat.allies.length) setupField(ARMY_AT.battle); },
      onDone: () => { if (g !== gen) return; player.stop(); player.teleport(s.x, s.z, s.yaw); beginBattle(1); } });
  }

  // ---- the battle ----
  function startBattle(n) {
    hardStop();
    toJungle("storm");
    A("jungleAmbience", true, "night");
    A("rain", 0.6);
    const key = WAVE_STEP[n];
    kitOn(3, 30);
    setupField(ARMY_AT[key]);
    potionTaught = n > 1;
    tribe.maxFull = 1;
    cinema.fade("clear", 0.9);
    beginBattle(n);
  }
  function beginBattle(n) {
    step = WAVE_STEP[n];
    walkSpeed();
    player.enabled = true;
    ui.showHud(true);
    combat.order("attack");
    M("duck", 0, 0.3);
    M("play", "combat", { intensity: WAVES[n].music });
    const s = fieldSpot();
    if (n > 1 && ab.potion.count < 3) ab.potion.add(Math.min(2, 3 - ab.potion.count));
    if (n > 1 && topUpArmy(ARMY_AT[WAVE_STEP[n]] - 3, s.x, s.z + 2.2)) later(3.4, () => ui.hint("More of the tribe run to the line!", 3));
    ctx.checkpoint.set(WAVE_CP[n], { x: s.x, z: s.z, yaw: s.yaw, label: n === 1 ? "The riverbank" : "Wave " + n, restore: restoreBattle });
    snapshot();
    applyAssist();
    startWave(n);
    if (n === 1) ui.hint(keyHint("F or left click: blaster.  J: sting.  L: tail slap.", "Fire, Sting and Slap: fight as you learned."), 5);
  }
  function startWave(n) {
    wave = n;
    const W = WAVES[n];
    queue.length = 0;
    for (let i = 0; i < W.soldiers; i++) queue.push(0);
    for (let i = 0; i < W.officers; i++) queue.splice(Math.min(queue.length, 4 + i * 6), 0, 1);
    spawned = 0; spawnT = n === 1 ? 2.2 : 1.2; waveCheckT = 1; waveOver = false; routed = false; nagT = 3; flaskT = 12;
    objKey = "";
    if (n === 2) { A("thunder", 0.8); ui.hint("More of them, from both sides!", 3); }
    if (n === 3) { A("thunder", 0.9); A("warCry"); ui.hint("The last wave. Stand together!", 3); }
  }
  function restoreBattle(id) {
    const n = id === "wave3" ? 3 : id === "wave2" ? 2 : 1;
    gen++;
    ctx.clearTimers();
    clearGoal();
    combat.reset();
    potions.reset();
    restoreArmy();
    combat.order("attack");
    refill(Math.max(save.potions, 2), Math.max(save.ammo, 15));
    firstBody = false;
    step = WAVE_STEP[n];
    applyAssist();
    startWave(n);
  }
  function fighters() {
    let n = 0;
    const en = combat.enemies;
    for (let i = 0; i < en.length; i++) if (en[i].alive && !en[i].fleeing11) n++;
    return n;
  }
  function spawnNext() {
    const kind = queue.shift() ? "officer" : "soldier";
    const gi = wave === 1 ? 1 : spawned % 2;
    const g = J.fieldGates[gi];
    combat.spawn(kind, g.x + rnd(-2.6, 2.6), g.z + rnd(-2, 2), { yaw: g.yaw || 0, squad: gi + 1, alert: true });
    spawned++;
  }
  // the last of them throw down their rifles and run; nobody chases
  function rout() {
    routed = true;
    combat.calm();
    const en = combat.enemies;
    for (let i = 0; i < en.length; i++) {
      const e = en[i];
      if (!e.alive) continue;
      const g = J.fieldGates[dist2(e.x, e.z, J.fieldGates[0].x, J.fieldGates[0].z) < dist2(e.x, e.z, J.fieldGates[1].x, J.fieldGates[1].z) ? 0 : 1];
      e.passive = true; e.fleeing11 = true;
      e.goto(g.x, g.z, true);
    }
    A("guardVoice", "lost", 0, 0.3);
    ui.hint("They are running!", 2.5);
    later(6, removeFleeing);
  }
  function removeFleeing() {
    const en = combat.enemies;
    for (let i = en.length - 1; i >= 0; i--) if (en[i].fleeing11) en[i].remove();
  }
  function onCombat(type, a, b) {
    if (type === "down") {
      if (wave > 0 && !waveOver && !potionTaught && !firstBody && a && a.kind !== "dreamSoldier") {
        firstBody = true;
        setGoal(a.x, a.y, a.z, 0x6dffa8);
        ui.hint("Remember the dream. " + keyHint("Hold Q to aim a potion at him, let go to throw.", "Hold the Potion button, let go to throw."), 6);
      }
      objKey = "";
    } else if (type === "arrived") {
      if (a && a.fleeing11) a.remove();
    } else if (type === "allyDown") {
      if (!allyTold) { allyTold = true; ui.hint("A friend is down. Potions make your army grow again.", 4); }
    } else if (type === "caught") {
      if (step === "test") onCaught(a);
    }
  }
  function updateBattle(dt) {
    const W = WAVES[wave];
    if (!W || waveOver) return;
    // the wave arrives a few at a time
    spawnT -= dt;
    if (queue.length && spawnT <= 0 && fighters() < W.cap) { spawnT = wave === 1 ? 1.5 : 1.1; spawnNext(); }
    // nobody may wander off and stall the wave: stragglers are told where the fight is
    nagT -= dt;
    if (nagT <= 0) {
      nagT = 3;
      const en = combat.enemies;
      for (let i = 0; i < en.length; i++) {
        const e = en[i], s = e.state;
        if (e.alive && !e.fleeing11 && (s === "idle" || s === "patrol" || s === "search" || s === "suspicious")) e.alert(player.x, player.z);
      }
    }
    // Tika runs flasks to the barricade
    flaskT -= dt;
    if (flaskT <= 0) {
      flaskT = 12;
      if (potions.count < 3) {
        const b = J.barricade;
        potions.spawn(b.x + rnd(-1.8, 1.8), b.z + 1.2 + rnd(0, 1.2));
        mem.tika.emote("chirp");
        if (!tikaTold) { tikaTold = true; ui.hint("Tika brings fresh potions to the barricade.", 4); }
      }
    }
    thunderT -= dt;
    if (thunderT <= 0) { thunderT = rnd(9, 17); A("thunder", rnd(0.3, 0.9)); }
    // objective line and the end of the wave
    waveCheckT -= dt;
    if (waveCheckT <= 0) {
      waveCheckT = 0.3;
      const left = fighters() + queue.length, army = combat.allies.length;
      objective("w" + wave + ":" + left + ":" + army, "Defend the riverbank — wave " + wave + " of 3", left + " left · Army: " + army);
      if (wave === 3 && !routed && !queue.length && left > 0 && left <= 3) rout();
      else if (left === 0 && spawned > 0) endWave();
    }
    const want = clamp(W.music - 0.2 + 0.2 * Math.min(1, combat.alerted / 3), 0, 1);
    if (Math.abs(want - musI) > 0.07) { musI = want; M("setIntensity", want, 1.5); }
  }
  function endWave() {
    waveOver = true;
    const n = wave;
    A("tribeCheer", 0.4 + 0.2 * n);
    if (firstBody && !potionTaught) { /* the beacon stays on the first fallen soldier until a potion is thrown */ } else clearGoal();
    if (n < 3) {
      ui.objectiveDone();
      later(3.2, () => beginBattle(n + 1));
      return;
    }
    // the storm breaks; Tika's flasks left at the barricade go into your pack
    removeFleeing();
    if (potions.count > 0) { ab.potion.add(potions.count); potions.clear(); }
    combat.bodyTTL = 0.5;            // the fallen sink away while the banner is up (the march is at the triangle budget)
    ui.objectiveDone();
    jungle.setTime("dawn", 12);
    A("rain", 0);
    A("jungleAmbience", true, "dawn");
    combat.order("follow");
    M("setIntensity", 0.35, 3);
    ui.banner("THE RIVERBANK HOLDS", "Army: " + combat.allies.length, 3.2);
    later(4.2, beginMarch);
  }

  // ---- the ground shakes: the old king ----
  function kingSpot() { return { x: J.arena.x - 2.6, z: J.arena.z + 2.6, yaw: 1.62 }; }
  // the King casts no shadow while he sits on the throne far off (the march sits at the triangle budget with the
  // whole army behind you); he gets it back when the fight starts
  // In the fight ("fight" mode) the King and you cast shadows from the furred body only: the leather and the armor
  // add little to the silhouette and the shadow pass was what pushed the fight over the triangle budget.
  function kingShadow(on) {
    const g = boss.body ? boss.body.group : boss.group;
    const lite = (o) => /Leather/.test(o.name);
    g.traverse((o) => { if (o.isMesh) { if (o.userData.l11Shadow === undefined) o.userData.l11Shadow = o.castShadow; o.castShadow = on ? o.userData.l11Shadow && !lite(o) : false; } });
    platypus.group.traverse((o) => { if (o.isMesh && lite(o)) { if (o.userData.l11Shadow === undefined) o.userData.l11Shadow = o.castShadow; o.castShadow = on === "restore" || !on ? o.userData.l11Shadow : false; } });
  }
  function showKing() {
    jungle.setZone("arena", null);
    kingShadow(false);
    boss.group.visible = true;
    bossShown = true;
    const k = kingSpot();
    boss.place(k.x, k.z, k.yaw);
    if (boss.body && boss.body.pose) boss.body.pose("proud", 0.1);
  }
  function startMarch() {
    hardStop();
    toJungle("dawn");
    A("jungleAmbience", true, "dawn");
    kitOn(3, 30);
    setupField(ARMY_AT.king);
    potionTaught = true;
    combat.order("follow");
    cinema.fade("clear", 0.9);
    beginMarch();
  }
  function beginMarch() {
    step = "march";
    combat.bodyTTL = 1.5;
    wave = 0;
    clearGoal();
    showKing();
    walkSpeed();
    player.enabled = true;
    ui.showHud(true);
    combat.order("follow");
    cinema.shake(0.03, 0.5);
    A("bossStep", 0.9);
    later(0.9, () => { cinema.shake(0.04, 0.5); A("bossStep", 1); });
    later(1.8, () => { cinema.shake(0.05, 0.7); A("bossStep", 1); jungle.scare(J.arenaIn.x - 4, J.arenaIn.z, 30); });
    M("play", "boss", { at: "bar", intensity: 0.2 });
    M("motif", "king", { at: "bar" });
    later(2.6, () => { mem.burra.emote("sad"); cinema.caption("[The old king. He sold us to them.]", 4.5, { who: "Old Burra" }); });
    refill(ab.potion.count, 30);
    objective("march", "Face the Platypus King", "the stone circle, to the west");
    const a = J.arenaIn;
    setGoal(a.x, gy(a.x, a.z), a.z, 0xffc070);
  }
  function updateMarch() {
    if (cinema.playing) return;
    if (nearP(J.arenaIn, 3.4) || dist2(player.x, player.z, J.arena.x, J.arena.z) < J.arena.r - 1.5) kingIntro();
  }

  // =====================================================================================================
  // PART 3 - the Platypus King
  // =====================================================================================================
  function kingStart() { return { x: J.arenaIn.x - 3.2, z: J.arenaIn.z + 1.4, yaw: -1.55 }; }   // north of the east stone, a clear view of the throne
  function setKingCheckpoint(n) {
    const s = kingStart();
    ctx.checkpoint.set(KING_CP[n], { x: s.x, z: s.z, yaw: s.yaw, label: n === 0 ? "The stone circle" : "The King: phase " + (n + 1), restore: restoreKing });
    snapshot();
  }
  function kingIntro() {
    clearGoal();
    step = "king";
    player.enabled = false;
    player.stop();
    { const k = kingStart(); topUpArmy(ARMY_AT.king - 4, k.x + 4, k.z); }
    setKingCheckpoint(0);
    const g = gen, c = J.camArena, kb = boss.body ? boss.body.group : boss.group, s = kingStart();
    const roar = () => { if (!boss.started) { boss.start(); cinema.shake(0.06, 1.0); } };
    cinema.play([
      { call: () => { combat.order("hold", HOLD); player.walkTo(s.x, s.z, { speed: 0.6, face: s.yaw }); } },
      { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: kb, lookY: 0.9, fov: F(44),
        to: { pos: [c.pos.x + 5, c.pos.y - 4.5, c.pos.z + 3] }, dur: 4.2, ease: "inOut" }, hold: false },   // past the south stone, not through it
      { wait: 0.8 },
      { caption: "On the fallen idol, as on a throne: the Platypus King.", dur: 3.4, narr: true },
      { shot: { pos: [s.x + 1.2, gy(s.x, s.z) + 0.45, s.z + 0.9], look: kb, lookY: 1.25, fov: F(36),
        to: { pos: [s.x + 0.9, gy(s.x, s.z) + 0.4, s.z + 0.7] }, dur: 3.6 }, hold: false },
      { wait: 0.9 },
      { call: roar },
      { wait: 2.3 },
    ], { skippable: true, release: 1.0, onSkip: () => { if (g === gen) roar(); },
      onDone: () => { if (g !== gen) return; player.stop(); player.teleport(s.x, s.z, s.yaw); beginKing(0); } });
  }
  function startKing(n) {
    hardStop();
    toJungle("dawn");
    A("jungleAmbience", true, "dawn");
    kitOn(n === 0 ? 3 : 4, 30);
    lineAtBarricade();
    tribe.village.hide();
    tribe.maxFull = 1;
    jungle.setZone("camp", false); jungle.setZone("rival", false);
    showKing();
    const s = kingStart();
    player.teleport(s.x, s.z, s.yaw);
    makeArmy(ARMY_AT[KING_STEP[n]], s.x + 3, s.z);
    potionTaught = true;
    step = KING_STEP[n];
    setKingCheckpoint(n);
    M("play", "boss", { at: "now", intensity: 0.6 });
    if (n === 0) boss.start(); else { boss.setPhase(n); syncPillars(); }
    cinema.fade("clear", 0.9);
    beginKing(n);
  }
  function beginKing(n) {
    step = KING_STEP[n];
    kingShadow(true);
    combat.bodyTTL = Infinity;
    bossOn = true; bossShown = true; finalOn = false;
    boss.group.visible = true;
    boss.onEvent = onBoss;
    boss.pause(false);
    combat.order("hold", HOLD);
    walkSpeed();
    player.enabled = true;
    ui.showHud(true);
    ui.boss.show("THE PLATYPUS KING", 3);
    ui.boss.phase(n);
    ui.boss.set(boss.hp / boss.maxHp);
    M("setPhase", n);
    cam.wantDist = 5.4;
    applyAssist();
    objective("king" + n, "Defeat the Platypus King", "read the ground · strike when his ankles glow");
  }
  function syncPillars() {
    const a = jungle.arena || J.arena;
    if (!a || typeof a.setPillar !== "function") return;
    for (let i = 0; i < boss.pillars.length; i++) a.setPillar(i, boss.pillars[i].hits);
  }
  function restoreKing(id) {
    const n = id === "king2" ? 2 : id === "king1" ? 1 : 0;
    gen++;
    ctx.clearTimers();
    ctx.setTimeScale(1, 0);
    clearGoal();
    setAct(null);
    combat.reset();
    potions.reset();
    restoreArmy();
    refill(Math.max(save.potions, 2), Math.max(save.ammo, 15));
    boss.setPhase(n);
    syncPillars();
    M("duck", 0, 0.2);
    if (music && music.state !== "boss" && music.pending !== "boss") M("play", "boss", { at: "now", intensity: 0.6 });
    finalOn = false; finalAsked = false;
    beginKing(n);
  }
  function summon(n) {
    const g = J.arenaBack;
    for (let i = 0; i < n; i++) combat.spawn("soldier", g.x + rnd(-1.5, 1.5) + i * 0.4, g.z + rnd(-2.2, 2.2), { yaw: 1.5, squad: 9, alert: true });
    A("guardVoice", "order", -0.5, 0.4);
    ui.hint("His guard! Knock them out — then a potion.", 4);
  }
  function onBoss(type, a, b) {
    if (!bossOn && type !== "crownOff" && type !== "landed" && type !== "drop") return;
    switch (type) {
      case "hitPlayer":
        lastHurt = a;
        if (hits[a] !== undefined && ++hits[a] === 2 && COUNTER[a]) ui.hint(COUNTER[a], 4);
        break;
      case "opening":
        chargeAt.x = boss.x; chargeAt.z = boss.z;
        combat.order("charge", chargeAt);
        if (!openTold) { openTold = true; ui.hint("He is open! Strike his glowing ankles!", 3.5); }
        break;
      case "closed":
        combat.order("hold", HOLD);
        break;
      case "pillar":
        syncPillars();
        cinema.shake(b ? 0.07 : 0.04, b ? 0.8 : 0.4);
        if (b) ui.hint("The stone is broken.", 2);
        break;
      case "attack":
        // the ground pound flattens his own guard if they stand close: let him do your work
        if (a === "pound") {
          const en = combat.enemies;
          bossSrc.x = boss.x; bossSrc.z = boss.z;
          for (let i = en.length - 1; i >= 0; i--) { const e = en[i]; if (e.alive && dist2(e.x, e.z, boss.x, boss.z) < 3.6) e.knockOut(bossSrc); }
        }
        break;
      case "phase": {
        const n = a | 0;
        step = KING_STEP[n] || step;
        ui.boss.phase(n);
        M("setPhase", n);
        M("stinger", "phase");
        combat.order("hold", HOLD);
        ab.potion.add(2);
        hits.sweep = hits.slam = hits.charge = hits.pound = hits.spit = 0;
        setKingCheckpoint(n);
        applyAssist();
        objKey = "";
        objective("king" + n, "Defeat the Platypus King", n === 1 ? "jump the ring · keep moving from the venom" : "he is wounded · finish it together");
        break;
      }
      case "summon":
        summon(a | 0);
        break;
      case "finalStagger":
        finalOn = true; finalT = 0; finalAsked = false;
        ctx.setTimeScale(0.4, 0.4);
        M("duck", 0.5, 0.5);
        combat.order("hold", HOLD);
        objKey = "";
        objective("final", "Finish it!", "any attack");
        break;
      case "defeated":
        kingFalls();
        break;
      case "crownOff":
        fCrown = true;
        break;
      case "landed":
        fLanded = true;
        cinema.shake(0.12, 1.2);
        ctx.setTimeScale(1, 0.4);
        A("tribeChirp", "mourn", 0.7, 0, 0.9);
        laterReal((M("stinger", "victory") || 2.4) + 0.3, () => M("play", "sorrow", { intensity: 0.2 }));
        break;
      case "drop":
        fDrop = true;
        if (a && a.potion) {
          potions.living.drop(a.potion.x, a.potion.z);
          boss.paper.flutterDown(a.paper.x, a.paper.z);
        }
        break;
    }
  }
  function updateKing(dt, raw) {
    ui.boss.set(boss.hp / boss.maxHp);
    // the fight stays inside the ring
    const dx = player.x - J.arena.x, dz = player.z - J.arena.z, d = Math.hypot(dx, dz), m = J.arena.r - 0.9;
    if (d > m && !ctx.checkpoint.respawning) { player.x = J.arena.x + (dx / d) * m; player.z = J.arena.z + (dz / d) * m; }
    if (finalOn) {
      finalT += raw;
      if (!finalAsked && finalT > 4) { finalAsked = true; setAct("Finish it"); ui.hint("One last blow. Go to him!", 4); }
      return;
    }
    musT -= raw;
    if (musT <= 0) {
      musT = 0.5;
      const want = clamp(0.5 + 0.18 * boss.phase + (boss.vulnerable ? 0.14 : 0), 0, 1);
      if (Math.abs(want - musI) > 0.05) { musI = want; M("setIntensity", want, 1.2); }
    }
  }

  // ---- he drops down ----
  function fleeGuard() {
    combat.calm();
    const en = combat.enemies, g = J.arenaBack;
    for (let i = 0; i < en.length; i++) { const e = en[i]; if (e.alive) { e.passive = true; e.fleeing11 = true; e.goto(g.x - 5, g.z, true); } }
    later(5, removeFleeing);
  }
  function kingFalls() {
    step = "fall";
    finalOn = false;
    setAct(null);
    ui.setObjective(null); objKey = "";
    ab.cancel();
    ctx.health.shield = true;
    player.stop();
    fleeGuard();
    combat.order("hold", HOLD);
    M("duck", 0, 0.4);
    M("setIntensity", 0.25, 1.5);
    ctx.setTimeScale(0.6, 0.3);
    fCrown = fLanded = fDrop = false;
    const g = gen, kb = boss.body ? boss.body.group : boss.group;
    const sy = Math.sin(boss.yaw), cy = Math.cos(boss.yaw), h = gy(boss.x, boss.z);
    cinema.play([
      // low, from his side: he rears to his full height
      { shot: { pos: [boss.x + cy * 6.6 + sy * 1.5, h + 0.6, boss.z - sy * 6.6 + cy * 1.5], look: kb, lookY: 1.6, fov: F(42),
        to: { pos: [boss.x + cy * 5.9 + sy * 2.2, h + 0.8, boss.z - sy * 5.9 + cy * 2.2] }, dur: 5 }, hold: false },
      { until: () => fCrown, max: 7 },
      // the crown
      { shot: { pos: [boss.x - sy * 3.4 + cy * 2.2, h + 0.4, boss.z - cy * 3.4 - sy * 2.2], look: boss.crown.group, lookY: 0.05, fov: F(26), dur: 0, hand: 0.25 }, hold: false },
      { until: () => fLanded, max: 6 },
      { wait: 0.5 },
      // wide: the army is silent
      { shot: { pos: [boss.x + sy * 9 + cy * 3, h + 3.4, boss.z + cy * 9 - sy * 3], look: kb, lookY: 0.5, fov: F(42),
        to: { pos: [boss.x + sy * 7.6 + cy * 2.4, h + 2.6, boss.z + cy * 7.6 - sy * 2.4] }, dur: 6 }, hold: false },
      { caption: "He was one of them, once.", dur: 3.2, narr: true },
      { until: () => fDrop && potions.living.resting && boss.paper.resting, max: 8 },
      { wait: 0.8 },
    ], { skippable: true, release: 1.2, onSkip: () => { if (g === gen) finishFall(); }, onDone: () => { if (g === gen) afterFall(); } });
  }
  // the rest of his fall, at once (skip, and the "drop" skip point)
  function finishFall() {
    ctx.setTimeScale(1, 0);
    if (!boss.dying && !boss.dead) boss.defeat();
    for (let i = 0; i < 900 && !(boss.dead && potions.living.resting && boss.paper.resting); i++) { boss.update(1 / 30, 0); potions.update(1 / 30, 0); }
    if (!potions.living.resting) potions.living.place(boss.x + 2.4, undefined, boss.z + 0.6);
    if (!boss.paper.resting) boss.paper.place(boss.x + 3, boss.z + 1.6);
    fCrown = fLanded = fDrop = true;
  }
  // everything of the fight put away; the bottle and the paper lie by his paw
  function calmAfter() {
    bossOn = false; finalOn = false;
    kingShadow(true); kingShadow(false);   // he lies still: no shadow for him (yours stays fur-only until the trail)
    platypus.group.traverse((o) => { if (o.isMesh && /Leather/.test(o.name)) o.castShadow = false; });
    // most of the army goes back to the camp with the wounded (the farewell is at the triangle budget otherwise)
    if (combat.allies.length > 12) combat.setAllies(12);
    ctx.army.show(false);
    tribe.maxFull = 1;               // the others are back at the barricade: only Rok, beside you, is a full model
    ctx.setTimeScale(1, 0.3);
    ui.boss.hide();
    ctx.health.shield = true;
    ctx.health.disable();
    ab.cancel();
    ab.potion.disable(); ab.shoot.disable();
    ab.buttons({});
    removeFleeing();
    combat.order("hold", HOLD);
    cam.wantDist = 3.9;
    walkSpeed();
    ctx.checkpoint.set("after", { x: player.x, z: player.z, yaw: player.yaw, silent: true });
  }
  function afterFall() {
    calmAfter();
    step = "drop";
    player.enabled = true;
    ui.showHud(true);
    const L = potions.living;
    objective("drop", "What did he drop?", "look at the bottle");
    setGoal(L.x, gy(L.x, L.z), L.z, 0xffb0b4);
    if (ctx.pick && L.pick) bottlePick = ctx.pick.add(L.pick, { onClick: () => clickLook("drop"), maxDist: 30, active: () => !cinema.playing && step === "drop" && nearP(potions.living, 4) });
  }
  // the state of the circle once he is down, for the skip points after the fight
  function startAfter(name) {
    hardStop();
    toJungle("dawn");
    A("jungleAmbience", true, "dawn");
    wearGear(true);
    lineAtBarricade();
    tribe.village.hide();
    jungle.setZone("camp", false); jungle.setZone("rival", false);
    showKing();
    boss.place(J.arena.x, J.arena.z, 1.2);
    const s = { x: J.arena.x + 4.5, z: J.arena.z - 1.5 };
    player.teleport(s.x, s.z, -1.4);
    makeArmy(ARMY_AT.king3, J.arena.x + 8, J.arena.z);
    combat.onEvent = onCombat;
    combat.order("hold", HOLD);
    boss.onEvent = onBoss;
    M("play", "sorrow", { intensity: 0.2, at: "now" });
    boss.start();
    boss.pause(false);
    finishFall();
    A("stopAll");                                   // the roar and the fall belong to the fight that was skipped
    A("jungleAmbience", true, "dawn");
    cinema.fade("clear", 0.9);
    if (name === "drop") { afterFall(); return; }
    calmAfter();
    takeBottle();
    if (name === "paper") { beginPaper(); return; }
    boss.paper.place(J.paper.x, J.paper.z);
    ctx.gear.remove("eyes");
    placeFarewell();
    M("play", "chill", { intensity: 0.4, at: "now" });
    beginTrail();
    if (name === "shot") { player.teleport(J.farTrail.x + 2.2, J.farTrail.z + 0.3, -1.5); cam.yaw = -1.5; trailStage = 1; jungle.setFarGlow(1); }
  }

  // ---- the LIVING POTION ----
  function clickLook(which) {
    if (cinema.playing || step !== which) return;
    const o = which === "drop" ? potions.living : boss.paper;
    if (!nearP(o, 4)) { ui.hint("Go closer.", 1.5); return; }
    if (which === "drop") lookBottle(); else lookPaper();
  }
  function takeBottle() {
    potions.living.hide();
    ctx.gear.wear("back", "pack");
    if (bottlePick) { bottlePick.remove(); bottlePick = null; }
  }
  function lookBottle() {
    const L = potions.living, g = gen;
    clearGoal(); setAct(null);
    player.enabled = false; player.stop();
    const dx = player.x - L.x, dz = player.z - L.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d, y = L.y || gy(L.x, L.z);
    player.face = Math.atan2(-ux, -uz); player.lock = 0.6;
    L.setGlow(0.3);   // dim first, so the glass and the heart read; then it wakes (a brighter glow burns to white)
    cinema.play([
      { shot: { pos: [L.x + ux * 0.86 + uz * 0.16, y + 0.3, L.z + uz * 0.86 - ux * 0.16], look: [L.x, y + 0.14, L.z], fov: F(30),
        to: { pos: [L.x + ux * 0.72 + uz * 0.07, y + 0.26, L.z + uz * 0.72 - ux * 0.07] }, dur: 5.2, ease: "out" }, hold: false },
      { call: () => { L.setGlow(0.7); A("livingPotion"); } },
      { wait: 1.2 },
      { caption: "LIVING POTION.", dur: 3.4 },
      { shot: { pos: [player.x + uz * 1.5 + ux * 1.1, y + 0.55, player.z - ux * 1.5 + uz * 1.1], look: platypus.group, lookY: 0.22, fov: F(34), dur: 0 } },
      { call: () => { L.pickUp(platypus.holdAnchor); if (platypus.holdFlask) platypus.holdFlask(true); A("potionPickup"); M("motif", "pip", { at: "beat" }); } },
      { wait: 2.4 },
      { call: () => { if (platypus.holdFlask) platypus.holdFlask(false); takeBottle(); A("gearOn", "leaf"); } },
      { wait: 0.6 },
    ], { skippable: true, release: 0.9, onSkip: () => { if (g === gen) { if (platypus.holdFlask) platypus.holdFlask(false); takeBottle(); } },
      onDone: () => { if (g === gen) beginPaper(); } });
  }

  // ---- the paper you cannot read ----
  function beginPaper() {
    step = "paper";
    player.enabled = true;
    ui.showHud(true);
    const p = boss.paper;
    objective("paper", "He dropped a paper, too", "look at it");
    if (ctx.pick && p.pick && !paperPick) paperPick = ctx.pick.add(p.pick, { onClick: () => clickLook("paper"), maxDist: 30, active: () => !cinema.playing && step === "paper" && nearP(boss.paper, 4) });
    setGoal(p.x, gy(p.x, p.z), p.z, 0xfff2dc);
  }
  function blowPaper() {
    const p = boss.paper, f = J.farTrail;
    const dx = f.x - p.x, dz = f.z - p.z, d = Math.hypot(dx, dz) || 1, k = Math.min(3, d * 0.5);
    return { x: p.x + (dx / d) * k, z: p.z + (dz / d) * k };
  }
  function lookPaper() {
    const p = boss.paper, g = gen, to = blowPaper();
    clearGoal(); setAct(null);
    player.enabled = false; player.stop();
    p.setReadable(0); readV = readTo = 0;
    boss.paperShot(pc);
    // high enough to hold the whole sheet in frame (the module's 0.45 m fills the frame with paper and nothing else)
    // and from the side the words face (the module's offset films the sheet upside down)
    pc.pos.x = pc.look.x + (pc.look.x - pc.pos.x) * 1.6; pc.pos.z = pc.look.z + (pc.look.z - pc.pos.z) * 1.6;
    pc.pos.y = pc.look.y + 0.78;
    const y = p.y || gy(p.x, p.z);
    cinema.play([
      { call: () => A("paperUnfold") },
      { shot: { pos: [pc.pos.x, pc.pos.y + 0.12, pc.pos.z], look: [pc.look.x, pc.look.y, pc.look.z], fov: F(40),
        to: { pos: [pc.pos.x, pc.pos.y, pc.pos.z] }, dur: 2.2, ease: "out" } },
      // for the player only, the ink resolves
      { call: () => { readTo = 1; } },
      { wait: 0.8 + 2.5 },
      { call: () => { readTo = 0; } },
      { wait: 1.2 },
      { shot: { pos: [p.x + 1.3, y + 0.5, p.z + 1.2], look: platypus.group, lookY: 0.25, fov: F(32), dur: 0 } },
      { call: () => { if (platypus.lookAt) platypus.lookAt(v1.set(p.x, y, p.z)); } },
      { caption: "You cannot read. It is only paper.", dur: 3.6, narr: true },
      { call: () => { player.lock = platypus.shake ? platypus.shake() || 0.8 : 0.8; A("paperRustle"); p.flutterDown(to.x, to.z); } },
      { wait: 1.8 },
    ], { skippable: true, release: null,
      onSkip: () => { if (g === gen) { readV = readTo = 0; p.setReadable(0); p.place(to.x, to.z); } },
      onDone: () => { if (g === gen) farewell(); } });
  }

  // ---- Burra at the circle's edge ----
  function farewellSpots() {
    let dx = J.arenaIn.x - player.x, dz = J.arenaIn.z - player.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    return { dx, dz };
  }
  function placeFarewell() {
    tribe.maxFull = 3;               // Burra, Rok and Nib say goodbye as themselves (Moss stands back, a stand-in)
    const s = farewellSpots(), px = player.x, pz = player.z, yaw = Math.atan2(-s.dx, -s.dz);
    const at = (r, a) => ({ x: px + (s.dx * Math.cos(a) - s.dz * Math.sin(a)) * r, z: pz + (s.dz * Math.cos(a) + s.dx * Math.sin(a)) * r });
    const b = at(2.6, 0), r = at(3.3, 0.55), m = at(4.4, -0.6), n = at(2.0, 0.95);
    member(mem.burra, b.x, b.z, yaw, "sit", { at: b, lookAt: platypus.group });
    mem.rok.do("guard", { at: r, yaw });
    mem.rok.place(r.x, r.z, yaw);
    member(mem.moss, m.x, m.z, yaw, "idle");
    member(mem.nib, n.x, n.z, yaw, "idle");
    hideMember(mem.tika);
    mem.burra.lookAt(platypus.group); mem.moss.lookAt(platypus.group); mem.nib.lookAt(platypus.group);
  }
  function farewell() {
    step = "farewell";
    player.enabled = false; player.stop();
    ui.setObjective(null); objKey = "";
    const g = gen;
    placeFarewell();
    const s = farewellSpots(), px = player.x, pz = player.z, y = gy(px, pz);
    const done = () => { if (ctx.gear.worn.eyes) ctx.gear.remove("eyes"); boss.paper.place(J.paper.x, J.paper.z); };
    cinema.play([
      { shot: { pos: [px - s.dx * 1.9 - s.dz * 1.5, y + 0.8, pz - s.dz * 1.9 + s.dx * 1.5], look: mem.burra.group, lookY: 0.3, fov: F(36),
        to: { pos: [px - s.dx * 1.5 - s.dz * 1.2, y + 0.7, pz - s.dz * 1.5 + s.dx * 1.2] }, dur: 9 }, hold: false },
      { fade: "clear", dur: 0.5 },
      { call: () => { mem.burra.emote("curious"); player.face = Math.atan2(s.dx, s.dz); player.lock = 1; } },
      { caption: "[That bottle wakes what sleeps.]", dur: 3.8, who: "Old Burra" },
      { caption: "[Your friend. Go. Three days.]", dur: 3.8, who: "Old Burra" },
      { shot: { pos: [px + s.dx * 1.1 + s.dz * 2.6, y + 0.7, pz + s.dz * 1.1 - s.dx * 2.6], look: platypus.group, lookY: 0.25, fov: F(40), dur: 0 } },
      { call: () => { mem.rok.emote("war"); mem.moss.emote("chirp"); mem.nib.emote("happy"); A("tribeChirp", "greet", 0.8, 0, 1); } },
      { caption: "[We come with you.]", dur: 2.6, who: "Rok" },
      { call: () => { player.lock = platypus.shake ? platypus.shake() || 0.8 : 0.8; } },
      { caption: "No. This road is yours alone.", dur: 3.2, narr: true },
      { call: () => { mem.nib.emote("bow"); A("gearOn", "leaf"); if (ctx.gear.worn.eyes) ctx.gear.remove("eyes"); } },
      { caption: "[Then take my hat. For luck.]", dur: 3.2, who: "Nib" },
      { call: () => M("play", "chill", { intensity: 0.4 }) },
      { wait: 0.6 },
    ], { skippable: true, release: 1.2, onSkip: () => { if (g === gen) { done(); M("play", "chill", { intensity: 0.4 }); } },
      onDone: () => { if (g === gen) { done(); beginTrail(); } } });
  }

  // =====================================================================================================
  // PART 4 - the shot
  // =====================================================================================================
  function beginTrail() {
    step = "trail";
    tribe.maxFull = 1;               // they stay behind: only the nearest is a full model
    kingShadow(false);
    trailStage = 0;
    if (paperPick) { paperPick.remove(); paperPick = null; }
    player.enabled = true;
    walkSpeed();
    ui.showHud(true);
    combat.order("hold", HOLD);
    objective("trail", "Go and find Pip", "west, toward the mountains");
    const a = J.arenaBack;
    setGoal(a.x, gy(a.x, a.z), a.z);
    mem.nib.emote("call");
  }
  function updateTrail() {
    if (trailStage === 0 && (nearP(J.arenaBack, 3) || player.x < J.arenaBack.x + 1)) {
      // out of the trees: the widest view so far, and far away a red glow under a peak
      trailStage = 1;
      const f = J.farTrail;
      setGoal(f.x, gy(f.x, f.z), f.z);
      jungle.setFarGlow(1);
      M("setIntensity", 0.8, 3);
      M("motif", "platypus", { at: "bar" });
      cam.yaw = -1.5; cam.pitch = 0.2; cam.wantDist = cam.maxDist || 6.5; cam.manualT = 8;
      A("tribeCheer", 0.5);
    } else if (trailStage === 1 && (nearP(J.farTrail, 1.9) || player.x < J.farTrail.x + 0.9)) {
      // one red glint from the trees behind, a third of a second of warning
      trailStage = 2;
      v1.set(player.x + 7, gy(player.x, player.z) + 1.5, player.z + 2.5);
      FX("sparkle", v1, 0xff2a1a, 3);
      later(0.3, theShot);
    }
  }
  function theShot() {
    step = "shot";
    const g = gen;
    player.enabled = false; player.stop();
    ab.cancel();
    clearGoal();
    ctx.health.shield = true;
    ui.setObjective(null); objKey = "";
    ui.showHud(false);
    A("shotDown");
    if (platypus.collapse) platypus.collapse("shot");
    M("duck", 1, 0.05);
    M("stop", 0);
    cinema.fade("white", 0, () => { if (g === gen) cinema.fade("clear", 0.22); });
    cinema.shake(0.08, 0.5);
    ctx.setTimeScale(0.2, 0);
    // on the ground with you: the bottle, rolled out of the pack, unbroken; boots at the edge of the frame
    const fx0 = Math.sin(player.yaw), fz0 = Math.cos(player.yaw), rx = fz0, rz = -fx0, h = gy(player.x, player.z);
    const bx = player.x + fx0 * 0.85 + rx * 0.55, bz = player.z + fz0 * 0.85 + rz * 0.55;
    ctx.gear.remove("back");
    potions.living.place(bx, undefined, bz);
    potions.living.setGlow(0.8);
    combat.spawn("soldier", bx + fx0 * 1.5 + rx * 1.3, bz + fz0 * 1.5 + rz * 1.3, { passive: true, post: true, yaw: Math.atan2(-fx0 - rx, -fz0 - rz) });
    cinema.letterbox(true);
    cinema.shot({ pos: [player.x - fx0 * 1.0 - rx * 0.5, h + 0.24, player.z - fz0 * 1.0 - rz * 0.5], look: [bx, gy(bx, bz) + 0.1, bz], fov: F(38),
      to: { pos: [player.x - fx0 * 0.8 - rx * 0.42, h + 0.13, player.z - fz0 * 0.8 - rz * 0.42] }, dur: 3.2, ease: "out", hand: 0.5, roll: 0.16 });
    laterReal(1.0, () => {
      cinema.eye.close({ duration: 2.2, tint: "day", onDone: () => {
        if (g !== gen) return;
        cinema.fade("black", 0);
        A("jungleAmbience", false);
        // black, three seconds; the ringing fades to nothing
        laterReal(3, () => startEcho(false));
      } });
    });
  }

  // =====================================================================================================
  // PART 5 - the echo
  // =====================================================================================================
  function setupEcho() {
    hardStop();
    A("stopAll");                 // releases the shot's hush (audio.shotDown) and every loop of the jungle
    toEcho();
    wearGear(false);
    ctx.gear.remove("back");
    const P = dream.P;
    player.teleport(P.spawn.x, P.spawn.z, 0);
    cam.yaw = 0;
    wizard.group.position.set(P.wizard.x, P.wizard.y || dream.heightAt(P.wizard.x, P.wizard.z), P.wizard.z);
    wizard.group.visible = true;
    wizard.lookAt(player.x, player.z);
    colW.x = P.wizard.x; colW.z = P.wizard.z; colW.on = true;
    if (ctx.colliders.indexOf(colW) < 0) ctx.colliders.push(colW);
    combat.onEvent = onCombat;
    combat.bodyTTL = 3;
    M("duck", 0, 0.2);
    M("play", "dream", { intensity: 0.3, at: "now" });
    A("dreamAmbience", true);
  }
  function startEcho(fast) {
    setupEcho();
    step = "echo";
    const P = dream.P, a = P.camSun, w = P.camWizard || P.camWide, g = gen;
    M("motif", "wobble", { at: "now" });
    cinema.play([
      { shot: { pos: [a.pos.x, a.pos.y, a.pos.z], look: [a.look.x, a.look.y, a.look.z], fov: F(46),
        to: { pos: [a.pos.x - 0.3, a.pos.y + 0.25, a.pos.z + 1.2] }, dur: 7, ease: "inOut" }, hold: false },
      { fade: "clear", dur: fast ? 0.9 : 2.6 },
      { wait: fast ? 0.8 : 3.2 },
      { shot: { pos: [w.pos.x, w.pos.y, w.pos.z], look: wizard.group, lookY: 1.5, fov: F(38), dur: 0 } },
      { call: () => { wizard.gesture("wave"); A("wizardAppear"); } },
      { wait: 2.0 },
    ], { skippable: true, release: 1.2, onDone: () => { if (g === gen) echoTalk(); } });
  }
  function echoTalk() {
    step = "echo";
    ui.showHud(true);
    ab.buttons({});
    wizSay([
      { t: "There you are. I am sorry I could not come.", g: "wave" },
      { t: "They keep me far away now. But not from here.", g: "point" },
      { t: "You have done it once. By accident.", fn: () => {
        // a flash of the scream in the jungle
        const g = gen;
        cinema.fade("white", 0.07, () => { if (g === gen) cinema.fade("clear", 0.6); });
        cinema.shake(0.03, 0.5);
        FX("ring", player.x, player.z, 0xffffff, dream.heightAt(player.x, player.z) + 0.05);
      } },
      { t: "Now do it on purpose.", g: "cast" },
    ], () => beginLesson("a"));
  }
  function startLesson(name) {
    setupEcho();
    cinema.fade("clear", 0.9);
    ui.showHud(true);
    if (name === "test") { dream.pillars.blast(dream.P.rise.x, dream.P.rise.z, 40, 1); dream.pillars.blast(0, 0, 40, 1); beginTest(); }
    else if (name === "end") { dream.pillars.blast(dream.P.rise.x, dream.P.rise.z, 40, 1); dream.pillars.blast(0, 0, 40, 1); endTalk(); }
    else beginLesson("a");
  }
  function left(list) { let n = 0; for (let i = 0; i < list.length; i++) if (dream.pillars.standing(list[i])) n++; return n; }
  function screamOn(minCharge, cooldown) {
    ab.scream.enable({ chargeTime: 1.2, minCharge, cooldown });
    ab.scream.onStart = onScreamStart;
    ab.scream.onCharge = onScreamCharge;
    ab.scream.onRelease = onScream;
    ab.scream.onFizzle = onFizzle;
    ab.scream.onCancel = onScreamCancel;
  }
  function beginLesson(which) {
    step = "lesson";
    lesson = which;
    player.enabled = true;
    walkSpeed();
    ui.showHud(true);
    const P = dream.P;
    if (which === "a") {
      screamOn(0.25, 3);
      ui.hint(keyHint("Hold R to breathe in. Let go to scream.", "Hold the Scream button to breathe in. Let go to scream."), 6);
    } else if (which === "b") {
      screamOn(0.6, 3);          // the tick on the bar moves to 0.6: a small breath no longer carries
    } else if (which === "c") {
      screamOn(0.6, 3);
      const r = P.wizardRise || P.rise;
      wizard.group.position.set(r.x, r.y || dream.heightAt(r.x, r.z), r.z);
      wizard.appear();
      A("wizardAppear");
      colW.x = r.x; colW.z = r.z;
      setGoal(P.rise.x, P.rise.y || dream.heightAt(P.rise.x, P.rise.z), P.rise.z, 0xffe2c8);
    }
    objKey = "";
    lessonObjective();
  }
  function lessonObjective() {
    const Q = dream.pillars;
    if (lesson === "a") objective("a" + left(Q.near), keyHint("Hold R, then let go", "Hold Scream, then let go"), "near pillars " + (3 - left(Q.near)) + " / 3");
    else if (lesson === "b") objective("b" + left(Q.mid), "Break the middle ring", (5 - left(Q.mid)) + " / 5 · hold past the mark");
    else if (lesson === "c") objective("c" + Q.left, "All of them", (12 - Q.left) + " / 12 · from the rise, a full breath");
    else if (lesson === "d") objective("d" + combat.alive, "Drop them all with one breath", (8 - combat.alive) + " / 8");
  }
  function onScreamStart() { if (platypus.screamCharge) platypus.screamCharge(0.02); }
  function onScreamCharge(f) { if (platypus.screamCharge) platypus.screamCharge(f); A("screamCharge", f); }
  // a breath dropped without a scream (a cutscene began, the scream was switched off): no squeak, no words
  function onScreamCancel() { if (platypus.screamCharge) platypus.screamCharge(0); A("screamCharge", 0); }
  function onFizzle() {
    if (platypus.screamCharge) platypus.screamCharge(0);
    A("screamCharge", 0);
    A("screamFizzle");
    if (!wizBusy()) wizSay([{ t: "Deeper. From your belly." }]);
  }
  // THE SCREAM, on purpose
  function onScream(p) {
    screams++;
    lastPower = p;
    if (platypus.screamCharge) platypus.screamCharge(0);
    A("screamCharge", 0);
    const dur = (platypus.scream ? platypus.scream(p, true) : 0) || 0.9 + 0.5 * p;
    player.lock = Math.max(player.lock, dur);
    later(platypus.screamTime || 0.12, () => {
      const x = player.x, z = player.z, y = player.y + 0.3, R = 8 + 14 * p;
      const silence = A("scream", p, true);
      FX("screamWave", x, y, z, p);
      cinema.shake(0.025 + 0.06 * p, 0.8);
      M("duck", 1, 0.1);
      laterReal(0.5 + 0.5 * p + (typeof silence === "number" ? silence : 1.2 + 2 * p), () => M("duck", 0, 1.5));
      dream.pillars.blast(x, z, R, p);
      combat.blast(x, z, R, p);
      evalT = 1.15;
    });
  }
  // after the wave has passed: what broke, and what Wobble says about it
  function judge() {
    const Q = dream.pillars, P = dream.P, p = lastPower;
    objKey = "";
    if (step === "test") { lessonObjective(); if (combat.alive === 0) testDone(); else if (!wizBusy()) wizSay([{ t: "Some still stand. Breathe. Then again." }]); return; }
    if (step !== "lesson") return;
    const nearL = left(Q.near), midL = left(Q.mid), all = Q.left;
    if (all === 0) {
      clearGoal();
      lesson = "";
      ab.scream.disable();
      dream.flare(1);
      wizSay([{ t: "THAT is your voice.", g: "cheer" }, { t: "One more thing. They are coming.", g: "cast" }], beginTest);
    } else if (lesson === "a" && nearL === 0) {
      if (midL === 0) wizSay([{ t: "Oh! A big breath already. Good!", g: "cheer" }, { t: "Come up here.", g: "point" }], () => beginLesson("c"));
      else wizSay([{ t: "Good! Small breath, small voice.", g: "cheer" }, { t: "Now breathe longer. Past the mark." }], () => beginLesson("b"));
      lesson = "";
    } else if (lesson === "b" && midL === 0) {
      lesson = "";
      wizSay([{ t: "Yes! Bigger breath, bigger voice.", g: "cheer" }, { t: "Come up here.", g: "point" }], () => beginLesson("c"));
    } else if (lesson === "c" && !wizBusy()) {
      if (p < 0.93) wizSay([{ t: "More! Hold it until the bar glows." }]);
      else if (!nearP(P.rise, 5)) wizSay([{ t: "Come up here, beside me. Then again.", g: "point" }]);
    } else if (lesson === "a" && !wizBusy()) wizSay([{ t: "Closer to the glass. Then again." }]);
    lessonObjective();
  }
  // the test: eight of them, one breath
  function beginTest() {
    step = "test";
    lesson = "d";
    testT = 0; caughtT = 0;
    clearGoal();
    player.enabled = true;
    ui.showHud(true);
    screamOn(0.25, 6);           // now it is a moment to choose, not a button to mash
    const S = dream.P.soldiers;
    for (let i = 0; i < S.length && i < 8; i++) combat.spawn("dreamSoldier", S[i].x, S[i].z, { yaw: S[i].yaw || 0, passive: false });
    M("setIntensity", 1, 2);
    A("dissolve", 0);
    objKey = "";
    lessonObjective();
    ui.hint("Let them come close. Then one full breath.", 4.5);
  }
  function onCaught(e) {
    // a dream cannot hurt you: it only shoves you back
    if (caughtT > 0) return;
    caughtT = 1.2;
    const dx = player.x - e.x, dz = player.z - e.z, d = Math.hypot(dx, dz) || 1;
    player.kx += (dx / d) * 7; player.kz += (dz / d) * 7;
    if (platypus.hurt) platypus.hurt();
    A("playerHurt");
    cinema.shake(0.02, 0.25);
    if (e.stun) e.stun(1.6);
    ui.hint(keyHint("Hold R... and let go!", "Hold Scream... and let go!"), 2.5);
  }
  function testDone() {
    if (step !== "test") return;
    step = "end";
    lesson = "";
    ab.cancel();
    ab.scream.disable();
    ui.objectiveDone();
    M("stinger", "victory");
    M("setIntensity", 0.3, 3);
    later(2.2, endTalk);
  }
  function updateLesson(dt, raw) {
    wizard.lookAt(player.x, player.z);
    if (caughtT > 0) caughtT -= dt;
    if (evalT > 0) { evalT -= dt; if (evalT <= 0) { evalT = -1; judge(); } }
    if (step === "test") {
      testT += dt;
      if (evalT < 0 && combat.alive === 0 && testT > 1.5) testDone();
    }
  }
  // "Be the loudest thing in it."
  function endTalk() {
    step = "end";
    lesson = "";
    player.enabled = false; player.stop();
    ab.scream.disable();
    ui.setObjective(null); objKey = "";
    ui.showHud(true);
    clearGoal();
    dream.setGlow(0, 10);        // the sun sets in ten seconds
    M("setIntensity", 0.15, 4);
    wizSay([
      { t: "When you wake you will be in a cage again.", g: "point" },
      { t: "Do not be afraid of the dark. Be the loudest thing in it." },
      { t: "Three days, little one.", g: "wave" },
    ], () => {
      // Wobble is a point of light; gone
      fading = true; fadeT = 0;
      ui.showHud(false);
      M("motif", "wobble", { at: "beat" });
      const c = dream.P.camWide, g = gen;
      cinema.letterbox(true);
      cinema.shot({ pos: [player.x + 1.4, player.y + 0.6, player.z - 2.6], look: wizard.group, lookY: 1.2, fov: F(40),
        to: { pos: [c.pos.x * 0.5, c.pos.y * 0.6, c.pos.z * 0.6] }, dur: 7, ease: "inOut" });
      laterReal(3.2, () => cinema.fade("black", 3, () => {
        if (g !== gen) return;
        laterReal(0.8, () => A("timerTick"));
        laterReal(2.0, () => { step = "done"; cinema.endCard("TO BE CONTINUED", { hold: 4, sub: "LEVEL 11 COMPLETE" }, () => ctx.complete()); });
      }));
    });
  }
  function updateEnd(raw) {
    wizard.lookAt(player.x, player.z);
    if (!fading) return;
    fadeT += raw;
    const k = clamp(1 - fadeT / 2.6, 0, 1);
    wizard.group.scale.setScalar(Math.max(0.02, k * k));
    if (k <= 0 && wizard.group.visible) {
      wizard.group.visible = false;
      colW.on = false;
      wizard.staffTip.getWorldPosition(v1);
      FX("sparkle", v1, 0xcfd6ff, 14);
    }
  }

  // =====================================================================================================
  // level interface
  // =====================================================================================================
  function enter() {
    hardStop();
    screams = 0;
    setupVoid();
    step = "intro";
  }

  function update(dt, time) {
    if (step === "boot" || step === "done") return;
    const raw = ctx.time.rawDt || dt;
    if (place === "jungle") {
      tickKit(dt);
      combat.update(dt, time);
      potions.update(dt, time);
      if (bossShown) boss.update(dt, time);
      tribe.update(dt, time);
      if (readV !== readTo) { readV += clamp(readTo - readV, -raw / 0.8, raw / 0.8); boss.paper.setReadable(readV); }
      switch (step) {
        case "wake": updateMuster(); break;
        case "battle": case "wave2": case "wave3": updateBattle(dt); break;
        case "march": updateMarch(); break;
        case "king": case "king2": case "king3": if (bossOn) updateKing(dt, raw); break;
        case "drop": if (!cinema.playing) setAct(nearP(potions.living, 1.8) ? "Look" : null); break;
        case "paper": if (!cinema.playing) setAct(nearP(boss.paper, 1.8) ? "Look" : null); break;
        case "trail": updateTrail(); break;
      }
    } else if (place === "echo") {
      combat.update(dt, time);
      wizard.update(dt, time);
      if (step === "lesson" || step === "test") updateLesson(dt, raw);
      else if (step === "end") updateEnd(raw);
      else wizard.lookAt(player.x, player.z);
    } else if (step === "void") updateVoid(dt);
  }

  function onAction(name) {
    if (cinema.playing) return false;
    const fighting = wave > 0 || bossOn;
    if (name === "interact") {
      if (finalOn) { if (bossReach("finisher")) attack("sting"); else ui.hint("Get close to him!", 1.6); }
      else if (step === "drop" && actName) lookBottle();
      else if (step === "paper" && actName) lookPaper();
      return false;
    }
    if (!fighting || place !== "jungle") return false;
    const kind = name === "primary" ? "sting" : name === "tailSlap" ? "slap" : name === "secondary" ? "pulse" : null;
    if (!kind) return false;
    return attack(kind);
  }

  function exit() {
    hardStop();
    tribeLite(false);
    kingShadow("restore");
    { const g = boss.body ? boss.body.group : boss.group; g.traverse((o) => { if (o.isMesh && o.userData.l11Shadow !== undefined) o.castShadow = o.userData.l11Shadow; }); }
    cinema.eye.clear();
    cinema.tint(null);
    A("stopAll");
    // shared modules back to how the other levels expect them
    potions.autoCollect = true;
    potions.onTransform = potions.onJoined = potions.onMiss = potions.onSplash = null;
    potions.bodies = null; potions.allies = null;
    combat.onEvent = null;
    combat.bodyTTL = 12; combat.maxShooters = 2;
    boss.onEvent = null; boss.allies = null;
    tribe.enemies = null;
    mem.burra.lookAt(null); mem.moss.lookAt(null); mem.nib.lookAt(null);
    jungle.reset();
    leaveWorld(dream);
    dream.setScene("school");
    FX("setGround", null, null);
    place = "";
    step = "boot";
  }

  function win() {
    if (step === "done" || step === "boot") return;
    hardStop();
    step = "done";
    cinema.endCard("TO BE CONTINUED", { hold: 2.5, sub: "LEVEL 11 COMPLETE" }, () => ctx.complete());
  }

  function skipTo(name) {
    if (step === "boot" || STEPS.indexOf(name) < 0) return false;
    switch (name) {
      case "intro": startIntro(); break;
      case "void": startVoid(); break;
      case "wake": startWake(); break;
      case "battle": startBattle(1); break;
      case "wave2": startBattle(2); break;
      case "wave3": startBattle(3); break;
      case "march": startMarch(); break;
      case "king": startKing(0); break;
      case "king2": startKing(1); break;
      case "king3": startKing(2); break;
      case "fall": startKing(2); boss.defeat(); break;   // setPhase leaves him busy walking back, so a hit would bounce off
      case "drop": case "paper": case "trail": case "shot": startAfter(name); break;
      case "farewell": startAfter("paper"); clearGoal(); farewell(); break;
      case "echo": startEcho(true); break;
      case "lesson": case "test": case "end": startLesson(name); break;
      default: win();
    }
    return true;
  }

  return {
    build, enter, start, update, exit, onAction,
    state() {
      return {
        step, wave, alive: combat ? combat.alive : 0, army: combat ? combat.allies.length : 0,
        potions: ab.potion.on ? ab.potion.count : 0,
        bossHp: boss ? Math.round(boss.hp) : 0, bossPhase: boss ? boss.phase : 0,
        hp: ctx.health.on ? Math.round(ctx.health.hp) : 0,
        screams, pillars: dream && dream.pillars ? dream.pillars.left : 0, tries: ctx.checkpoint.tries || 0,
        place, lesson, voidStage, trailStage, ammo: ab.shoot.on && isFinite(ab.shoot.ammo) ? ab.shoot.ammo : 0,
      };
    },
    skipTo, win,
    STEPS,
  };
}
