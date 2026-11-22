// level10.js - LEVEL 10 "THE BASE" (LEVELS2.md Part C10, STORY2.md).
//
// Beats: camp at dusk (Burra's one line) -> the overlook -> SECTION 1 the fence (stealth) -> SECTION 2 the yard
// (patrols, the lever) -> SECTION 3 THE APRON (the ambush; four of the eight are lost) -> THE DOOR (three Tail Slaps)
// -> THE ARMOURY (suit, glasses, blaster) -> SECTION 4 FIGHT OUT (apron / fuel dump / yard and the blown gate, or
// the fuel-dump gap) -> OUT into the grass -> the walk home -> the fire (Burra's leaves) -> LEVEL COMPLETE.
//
// Structure: one `setup(stage, respawn)` builds the exact state of a stage (world, gear, squad, enemies, objective,
// music). The natural flow calls the small reachX() functions; ctx.checkpoint's restore() and skipTo() call setup().
// Every death is ctx.checkpoint.respawn() (the engine's fast restart) back to the stage's checkpoint.
import { createJungle } from "../jungle.js";
import { createBase } from "../base.js";
import { createCombat } from "../combat.js";
import { createTribe } from "../tribe.js";

export const meta = { n: 10, title: "THE BASE" };

const STEPS = ["intro", "fence", "yard", "apron", "door", "armoury", "fightout", "fuel", "gate", "home", "end", "done"];
const ORDER = ["fence", "yard", "apron", "door", "armoury", "fightout", "fuel", "gate", "run"];   // setup stages inside the base
const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { a = (a + PI) % (PI * 2); if (a < 0) a += PI * 2; return a - PI; };
const SQUAD = 8;                       // Rok, Moss and six fighters
const GEAR_KEYS = ["suit", "glasses", "blaster"];
const GEAR_NAME = { suit: "Tactical suit", glasses: "Tactical glasses", blaster: "Blaster" };
const HUGE = 1e6;                      // hit points of someone the story does not let fall here

export function createLevel(ctx) {
  const { THREE, player, platypus, ui, cinema, audio, fx } = ctx;
  const music = ctx.music, health = ctx.health, checkpoint = ctx.checkpoint, abilities = ctx.abilities, gear = ctx.gear, army = ctx.army;

  // guarded calls into audio / fx (a missing sound or effect must never stop the story)
  function A(name, a, b, c, d) { const f = audio[name]; if (typeof f !== "function") return undefined; try { return f.call(audio, a, b, c, d); } catch (e) { return undefined; } }
  function FX(name, a, b, c, d, e, g) { const f = fx[name]; if (typeof f !== "function") return undefined; try { return f.call(fx, a, b, c, d, e, g); } catch (err) { return undefined; } }
  function F(v) {
    const a = ctx.camera.aspect || 1.78;
    if (a >= 1.3) return v;
    return Math.min(80, (2 * Math.atan((Math.tan((v * PI) / 360) * 1.3) / a) * 180) / PI);
  }

  let jungle = null, base = null, combat = null, tribe = null;
  let rok = null, moss = null, burra = null, rokBack = null;
  let B = null, J = null;                 // named points of the base / the jungle
  let step = "boot", stage = "";
  let gen = 0;                            // bumped by hardStop() and setup(): late callbacks compare it and do nothing

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const scr = { x: 0, y: 0, visible: false };
  const aimList = [];                     // what the blaster may snap to (enemies + drums + lamps + range targets)
  const lampT = [null, null];             // shoot proxies for the two tower lamps
  const rackMarks = [null, null, null];
  let beacon = null, beacon2 = null, markOn = false, markX = 0, markZ = 0;

  // ---- state of the run -------------------------------------------------------------------------------------
  let rokAlly = null, mossAlly = null;
  let sneakOn = false, stingCd = 0, slapCd = 0, actNow = null, actKind = "", actI = -1;
  let musState = "", musI = 0, musT = 0, musHold = 0, humT = 0, hintT = 0, farShotT = 0;
  let alarmOn = false, alarmQuiet = 0, reinforced = false, barracks = false, hornCd = 0, spottedHint = false;
  let ambushed = false, ambushT = 0, lossStage = 0, mossDown = false;
  let doorT = 25, doorLineT = 4, cornerDone = false, slaps = 0;
  const got = { suit: false, glasses: false, blaster: false };
  let rangeHits = 0, clampHintT = 0, fightArmed = false;
  let outside = false, fuelBlown = false, fuelHint = false, gateBlown = false, gateCall = false, runEast = false, lostHint = false;
  let fightersAt = 2, lost = 0, kills = 0, lastKill = "", homeT = 0, homeFar = false, leavesLaid = 0, allHome = false;

  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const nearP = (p, r) => Math.hypot(player.x - p.x, player.z - p.z) <= r;
  const panOf = (x, z) => (ctx.bearing ? clamp(Math.sin(ctx.bearing(x, z)), -1, 1) : 0);
  const farOf = (x, z) => clamp(Math.hypot(x - player.x, z - player.z) / 45, 0, 1);
  const arr = (p) => [p.x, p.y, p.z];
  const inBase = () => ctx.world === base;
  const playing = () => step !== "boot" && step !== "intro" && step !== "end" && step !== "done" && !cinema.playing;
  const stealth = () => (step === "fence" || step === "yard") && !ambushed;
  const hasGlasses = () => got.glasses;

  function fighters() { let n = 0; const l = combat.allies; for (let i = 0; i < l.length; i++) if (l[i].alive && !l[i].hero) n++; return n; }
  function setFightersHp(hp) { const l = combat.allies; for (let i = 0; i < l.length; i++) if (!l[i].hero) { l[i].maxHp = hp; l[i].hp = hp; } }

  // ---- little helpers -----------------------------------------------------------------------------------------
  function mus(state, o) {
    musState = state; musI = o && typeof o.intensity === "number" ? o.intensity : musI; musT = 1.2;
    if (music && music.play) music.play(state, o);
  }
  function stinger(name) { if (music && music.stinger) music.stinger(name); }
  function line(who, text, secs, member, mood) {
    cinema.caption(text, secs || 3, { who });
    if (member && member.emote && !member.busy) member.emote(mood || "chirp");
  }
  function narr(text, secs) { cinema.caption(text, secs || 3.2, { narr: true }); }
  function hint(text, secs) { ui.hint(text, secs || 3); hintT = 6; }

  function setMark(x, z, color) {
    const y = ctx.floorAt ? ctx.floorAt(x, z) : 0;
    markOn = true; markX = x; markZ = z;
    if (beacon && beacon.set) beacon.set(x, y, z); else beacon = FX("beacon", x, y, z, color || 0xffe08a) || null;
  }
  function dropHandle(h) { if (h && h.remove) { try { h.remove(); } catch (e) { /* already gone */ } } }
  function clearMarks() {
    dropHandle(beacon); dropHandle(beacon2); beacon = beacon2 = null; markOn = false;
    for (let i = 0; i < 3; i++) { dropHandle(rackMarks[i]); rackMarks[i] = null; }
    for (let i = 0; i < 12; i++) ui.mark(i, 0, 0, null);
  }
  function setAct(label, kind, i) {
    if (label === actNow) { actKind = kind || ""; actI = i === undefined ? -1 : i; return; }
    actNow = label; actKind = kind || ""; actI = i === undefined ? -1 : i;
    ui.setAction(label);
  }
  function objective(text, keys) { ui.setObjective(text, keys); }

  // =====================================================================================================
  // build / worlds
  // =====================================================================================================
  function build() {
    jungle = ctx.shared("jungle", () => createJungle(ctx));
    base = ctx.shared("base", () => createBase(ctx));
    combat = ctx.shared("combat", () => createCombat(ctx));
    tribe = ctx.shared("tribe", () => createTribe(ctx));
    B = base.P; J = jungle.P;
    rok = tribe.members.rok; moss = tribe.members.moss; burra = tribe.members.burra;
    if (typeof tribe.warm === "function") { try { tribe.warm(); } catch (e) { /* built lazily then */ } }
    // where Moss rides when Rok carries him
    rokBack = new THREE.Object3D();
    rokBack.name = "rokBack";
    rokBack.position.set(0, 0.25, -0.06);
    rokBack.scale.setScalar(0.8);
    rok.group.add(rokBack);
    for (let i = 0; i < 2; i++) {
      const L = base.lights[i], lp = L.lamp || { x: L.tower ? L.tower.x : 0, y: 8.4, z: L.tower ? L.tower.z : 14 };
      lampT[i] = { x: lp.x, y: lp.y, z: lp.z, r: 1.3, alive: true, targetable: true, special: "lamp", light: L };
    }
    try { ctx.renderer.compile(base.group, ctx.camera); } catch (e) { /* compiled on first sight instead */ }
    if (ctx.debug) ctx.debug.level10 = { base, jungle, combat, tribe, got, setup: (n) => jump(n) };
  }

  function toBase() {
    ctx.setWorld(base);
    base.group.add(combat.group, tribe.group);
    combat.setWorld(base);
    tribe.setWorld(base);
    tribe.enemies = combat.enemies;
    FX("setGround", null, null);
  }
  function toJungle(time) {
    jungle.setTime(time, 0);
    ctx.setWorld(jungle);
    jungle.group.add(combat.group, tribe.group);
    combat.setWorld(jungle);
    tribe.setWorld(jungle);
    tribe.enemies = null;
    FX("setGround", null, null);
  }

  // Everything back to nothing, behind black. Every starter begins here.
  function hardStop() {
    gen++; introTok++;
    cinema.reset();
    cinema.fade("black", 0);
    cinema.tint(null);
    ctx.clearTimers();
    ctx.setTimeScale(1, 0);
    ui.clearSpeech();
    ui.showHud(false);
    ui.setObjective(null); ui.setAction(null); ui.setQuests(null); ui.setSeen(null); ui.setPing(null);
    actNow = null; actKind = ""; actI = -1;
    abilities.cancel();
    abilities.shoot.disable();
    abilities.shoot.onFire = null; abilities.shoot.onEmpty = null;
    abilities.buttons({});
    health.disable();
    health.onDeath = null; health.onHurt = null; health.shield = false;
    checkpoint.clear();
    army.show(false);
    gear.clear();
    clearMarks();
    A("siren", false, "base"); A("truckEngine", false); A("searchlightHum", 0); A("muffle", 0, 0.1); A("warnBeep", false);
    A("jungleAmbience", false); A("fire", 0); A("tribeChatter", 0);
    if (music && music.stop) music.stop(0.3);
    musState = ""; musI = 0;
    combat.reset();
    combat.onEvent = null;
    combat.maxShooters = 2; combat.aimScale = 1; combat.damageScale = 1; combat.viewScale = 1; combat.bodyTTL = 12;
    tribe.reset();
    base.onSpotted = null;
    base.fuel.onExplode = null;
    platypus.reset();
    if (platypus.pose) platypus.pose(null);
    if (platypus.setAim) platypus.setAim(null);
    player.scripted = false; player.hidden = false; player.enabled = false; player.carrying = false;
    player.maxSpeed = 3; player.lock = 0; player.face = null; player.canJump = true;
    player.speed = 0; player.vy = 0; player.grounded = true;
    player.stop();
    rokAlly = mossAlly = null;
    sneakOn = false; stingCd = slapCd = 0;
    alarmOn = false; reinforced = false; barracks = false; ambushed = false; lossStage = 0; mossDown = false;
    got.suit = got.glasses = got.blaster = false;
    outside = false; fuelBlown = false; fuelHint = false; gateBlown = false; gateCall = false; runEast = false; fightArmed = false;
    lostHint = false; spottedHint = false;
    fightersAt = 2; lost = 0; kills = 0; lastKill = ""; homeFar = false; leavesLaid = 0; allHome = false; rangeHits = 0;
    stage = "";
  }

  // =====================================================================================================
  // the squad
  // =====================================================================================================
  function hurtMoss(to) {
    mossDown = true;
    if (mossAlly) { mossAlly.state = "hurt"; mossAlly.targetable = false; mossAlly.hurt = true; mossAlly.heroMode = ""; mossAlly.tgt = null; }
    moss.do("hurt", { to });
  }
  function carryMoss() {
    mossDown = true;
    if (mossAlly) { mossAlly.state = "hurt"; mossAlly.targetable = false; mossAlly.hurt = true; mossAlly.heroMode = ""; mossAlly.tgt = null; }
    moss.attachTo(rokBack, "sit");
  }
  // Rok, Moss and n fighters round (x, z). mossMode: 0 well, 1 hurt and sitting at `mossAt`, 2 on Rok's back.
  function makeSquad(n, x, z, yaw, mossMode, mossAt, mortal) {
    moss.attachTo(null);
    if (typeof rok.heal === "function") rok.heal();
    if (typeof moss.heal === "function") moss.heal();
    rok.visible = true; moss.visible = true;
    rok.place(x + 0.9, z - 0.3, yaw);
    moss.place(x - 0.9, z - 0.3, yaw);
    rokAlly = combat.addAlly(rok.x, rok.z, { hero: rok, hp: HUGE });
    mossAlly = combat.addAlly(moss.x, moss.z, { hero: moss, hp: HUGE });
    combat.setAllies(2 + n, x, z);
    const l = combat.allies;
    for (let i = 0; i < l.length; i++) { l[i].yaw = yaw; if (!l[i].hero) { l[i].maxHp = l[i].hp = mortal ? 60 : HUGE; } }
    rokAlly.hp = rokAlly.maxHp = HUGE; mossAlly.hp = mossAlly.maxHp = HUGE;
    mossDown = false;
    if (mossMode === 1) { const at = mossAt || { x: x - 1.2, z: z - 1 }; moss.place(at.x, at.z, yaw); hurtMoss(at); }
    else if (mossMode === 2) carryMoss();
    lost = SQUAD - 2 - n;
    army.show("Squad");
  }

  // =====================================================================================================
  // enemies of each section
  // =====================================================================================================
  function sp(kind, x, z, o) { try { return combat.spawn(kind, x, z, o); } catch (e) { return null; } }
  function spawnFence() {
    sp("soldier", -26, 14.6, { route: "gatePost", squad: 1 });
    sp("soldier", -2.2, 9.8, { yaw: PI, post: true, sweep: 0.45, squad: 1 });
    sp("soldier", 2.2, 9.8, { yaw: PI, post: true, sweep: 0.45, squad: 1 });
  }
  function spawnYard() {
    sp("soldier", -12, 16.5, { route: "yardA", squad: 1 });
    sp("soldier", 4, 20, { route: "yardB", squad: 1 });
    sp("officer", 10, 39.7, { yaw: PI, post: true, sweep: 0.5, squad: 1 });
  }
  function spawnApron(alert) {
    const r = base.routes.apronLine, m = base.routes.mezzanine;
    for (let i = 0; i < r.length; i++) sp("soldier", r[i].x, r[i].z, { yaw: PI, post: true, squad: 2, alert });
    for (let i = 0; i < m.length; i++) sp("soldier", m[i].x, m[i].z, { yaw: PI, post: true, squad: 2, alert });
  }
  function spawnWaveA() {
    const m = base.routes.mezzanine;
    for (let i = 0; i < m.length; i++) sp("soldier", m[i].x, m[i].z, { yaw: PI, post: true, squad: 3 });
    sp("soldier", -13.5, 56.5, { yaw: -0.6, post: true, sweep: 0.6, squad: 3 });
    sp("soldier", -5, 60.4, { yaw: -1.2, post: true, sweep: 0.6, squad: 3 });
    sp("soldier", 5, 55, { yaw: -1.0, post: true, sweep: 0.6, squad: 3 });
    sp("soldier", 12.5, 59, { yaw: -1.3, post: true, sweep: 0.6, squad: 3 });
  }
  function spawnWaveB() {
    const r = base.routes.fuelSquad;
    for (let i = 0; i < r.length; i++) sp(i === 3 ? "officer" : "soldier", r[i].x, r[i].z, { yaw: -PI / 2, post: true, sweep: 0.5, squad: 4 });
  }
  function spawnWaveC() {
    let room = Math.max(0, 10 - combat.alive);
    const t = base.routes.truckUnload;
    for (let i = 0; i < t.length && room > 0; i++, room--) sp("soldier", t[i].x, t[i].z, { yaw: -PI / 2, squad: 5, alert: true });
    const s = base.routes.gateSentries;
    for (let i = 0; i < s.length && room > 0; i++, room--) sp("soldier", s[i].x, s[i].z, { yaw: 0, post: true, sweep: 0.5, squad: 6 });
    const NP = [[0, 57], [-1.6, 59.5], [1.6, 59.5], [0, 62]];
    for (let i = 0; i < NP.length && room > 0; i++, room--) sp(i === 3 ? "officer" : "soldier", NP[i][0], NP[i][1], { yaw: PI, route: "reinforceNorth", loop: false, squad: 5, alert: true });
    A("truckEngine", true);
    const g = gen;
    ctx.after(4, () => { if (g === gen) A("truckEngine", false); });
  }
  function spawnPursuit(east) {
    let room = Math.max(0, 8 - combat.alive);
    const PP = east ? [[36, 54], [33, 50], [30, 56]] : [[0, 30], [-3, 33], [3, 33]];
    for (let i = 0; i < PP.length && room > 0; i++, room--) sp("soldier", PP[i][0], PP[i][1], { yaw: PI, squad: 7, alert: true, route: east ? null : "pursuit", loop: false });
  }
  function alertAll() {
    const l = combat.enemies;
    for (let i = 0; i < l.length; i++) if (l[i].alive && !l[i].aware) l[i].alert(player.x, player.z);
  }

  // =====================================================================================================
  // assist (LEVELS2.md A2: quiet, never announced)
  // =====================================================================================================
  function applyAssist() {
    const t = checkpoint.tries || 0;
    combat.aimScale = t >= 6 ? 1.5 : t >= 3 ? 1.25 : 1;
    combat.damageScale = t >= 6 ? 0.5 : t >= 3 ? 0.75 : 1;
    combat.viewScale = t >= 6 ? 0.65 : t >= 3 ? 0.8 : 1;
  }
  function killHint() {
    if ((checkpoint.tries || 0) < 6) return;
    const s = stage;
    const text = s === "fence" ? (lastKill === "light" ? "Wait for the searchlight to pass, then go." : "Stay low in the dark. Hold " + (ctx.touch ? "Sneak" : "Shift") + " and keep behind them.")
      : s === "yard" ? "Move from crate stack to crate stack. Slap a truck to pull the guards away."
        : s === "apron" ? "Wait for the red line to lock, THEN run. Sneak inside a sandbag ring to be safe."
          : s === "door" ? "Get close - they cannot aim at you up close!"
            : s === "fightout" ? "Shoot the two on the balcony first. Two bolts each."
              : s === "fuel" ? "Shoot the fuel drums by the east fence, then leave through the gap."
                : "Keep running. Break their line of sight behind the crates.";
    const g = gen;
    ctx.after(1.2, () => { if (g === gen) hint(text, 5); });
  }

  // =====================================================================================================
  // setup(stage): the exact state of a stage. respawn = called from the checkpoint restore.
  // =====================================================================================================
  function restore() { setup(stage, true); return true; }
  function cp(id, x, z, yaw, label, silent) { checkpoint.set(id, { x, z, yaw, label: label || "Checkpoint", silent: !!silent, restore }); }

  function wearFor(idx) {
    gear.clear();
    got.suit = got.glasses = got.blaster = idx >= 5;
    if (idx >= 5) {
      gear.wear("body", "suit", { armor: 0.5 });
      gear.wear("eyes", "glasses", { visor: true });
      gear.wear("weapon", "blaster");
      armBlaster(40);
    } else {
      gear.wear("body", "leaf", { armor: 0.3 });
      abilities.shoot.disable();
    }
    base.outlineLights(got.glasses);
  }
  function armBlaster(ammo) {
    abilities.shoot.enable({ ammo, rate: 3, range: 20, muzzle: platypus.muzzle || null, targets: aimList });
    abilities.shoot.onFire = onFire;
    abilities.shoot.onEmpty = onEmpty;
  }

  function setup(name, respawn) {
    gen++;
    const idx = ORDER.indexOf(name);
    if (idx < 0) return;
    stage = name;
    step = name === "run" ? "gate" : name;
    if (!inBase()) toBase();
    // transient flags of every beat
    alarmOn = false; alarmQuiet = 0; reinforced = false; barracks = false; hornCd = 0;
    ambushed = false; ambushT = 0; lossStage = 0; doorT = 25; doorLineT = 4; cornerDone = false; slaps = 0;
    outside = false; gateCall = false; fightArmed = idx >= 5; clampHintT = 0; hintT = 0;
    stingCd = slapCd = 0;
    clearMarks();
    ui.setQuests(null);
    setAct(null);
    A("truckEngine", false); A("muffle", 0, 0.2);
    if (!respawn) { base.reset(); ctx.setTimeScale(1, 0); }

    // ---- the base itself ----
    if (idx < 2) { base.lever.reset(); base.gates.inner.close(); base.gates.inner.t = 0; }
    else { base.lever.pulled = true; base.gates.inner.open(); base.gates.inner.t = 1; }
    const dr = base.doors.armoury;
    if (idx <= 3) { if (dr.opened || dr.hits) dr.close(); } else if (!dr.opened) dr.open();
    if (idx === 4 && !respawn) for (const k in base.racks) base.racks[k].reset();
    if (idx >= 5) { for (const k in base.racks) base.racks[k].take(); for (let i = 0; i < base.ammo.length; i++) base.ammo[i].reset(); }
    if (idx <= 6 && base.fuel.exploded) base.fuel.reset();
    if (idx <= 6) fuelBlown = false;
    if (idx <= 7) { if (base.gates.main.opened) base.gates.main.close(); gateBlown = false; if (!respawn) runEast = false; }
    else if (!runEast && !base.gates.main.blown) { base.gates.main.blow(); gateBlown = true; }
    base.setAlarm(idx >= 3);
    A("siren", idx >= 3, "base");
    base.setHunt(idx >= 7);
    if (!respawn) base.setTime(idx >= 5 ? "predawn" : "night", 0);
    if (idx < 7) for (let i = 0; i < 2; i++) { const L = base.lights[i]; L.blinded = false; L.targetable = true; lampT[i].alive = lampT[i].targetable = true; }
    A("jungleAmbience", true, "night");

    // ---- the player's kit ----
    wearFor(idx);
    health.enable({ max: 100, label: "Health", regen: 12, regenDelay: (checkpoint.tries || 0) >= 6 ? 2.5 : 4 });
    health.onDeath = onDeath;
    abilities.buttons({ sting: true, slap: true, jump: true, down: "Sneak" });
    abilities.targets = aimList;
    if (platypus.pose) platypus.pose(null);
    sneakOn = false;
    player.maxSpeed = 3;

    // ---- combat ----
    combat.reset();
    combat.onEvent = onCombat;
    combat.bodyTTL = 12;
    combat.maxShooters = idx >= 5 ? 3 : 2;
    applyAssist();
    base.onSpotted = onSearchlight;
    base.fuel.onExplode = onFuel;
    ui.setSeen(idx < 2 ? 0 : null);

    switch (name) {
      case "fence":
        player.teleport(5, -5.2, -0.5);
        makeSquad(6, 6.6, -7, -0.5, 0);
        spawnFence();
        if (!respawn) cp("start", 5, -5.2, -0.5, "Checkpoint", true);
        objective("Get inside the fence", ctx.touch ? "hold Sneak" : "Shift: sneak");
        setMark(B.holeOut.x, B.holeOut.z);
        mus("stealth", { intensity: 0.3 });
        break;
      case "yard":
        player.teleport(B.cp1.x, B.cp1.z, 0);
        makeSquad(6, B.cp1.x - 0.6, B.cp1.z + 1.6, 0, 0);
        spawnFence(); spawnYard();
        if (!respawn) cp("cp1", B.cp1.x, B.cp1.z, 0, "Inside the fence");
        yardObjective();
        mus("stealth", { intensity: 0.3 });
        break;
      case "apron":
        player.teleport(B.cp2.x, B.cp2.z, 0);
        makeSquad(6, 0.9, 45.2, 0, 0);
        if (!respawn) cp("cp2", B.cp2.x, B.cp2.z, 0, "The inner gate");
        objective("Cross to the armoury");
        setMark(B.ring0.x, B.ring0.z);
        mus("stealth", { intensity: 0.45 });
        break;
      case "door":
        player.teleport(B.cp3.x, B.cp3.z, -PI / 2);
        makeSquad(2, -21.4, 76.3, -PI / 2, 1, { x: -22.7, z: 76.2 });
        spawnApron(false);
        ambushed = true; lossStage = 3;
        if (!respawn) cp("cp3", B.cp3.x, B.cp3.z, -PI / 2, "The armoury wall");
        objective("Break the door", ctx.touch ? "Slap x3" : "L x3");
        setMark(B.doorOut.x, B.doorOut.z);
        mus("sorrow", { intensity: 0.5 });
        break;
      case "armoury":
        player.teleport(B.cp4.x, B.cp4.z, PI);
        makeSquad(2, -28.6, 80.4, PI, 1, { x: -27.2, z: 83.6 });
        ambushed = true; lossStage = 3;
        if (!respawn) cp("cp4", B.cp4.x, B.cp4.z, PI, "The armoury");
        A("muffle", 0.7, 0.3);
        beginGearing();
        mus("stealth", { intensity: 0.2 });
        break;
      case "fightout":
        player.teleport(B.cp4.x, B.cp4.z, PI);
        makeSquad(2, -28.6, 80.4, PI, 2, null, true);
        ambushed = true; lossStage = 3;
        spawnWaveA();
        if (!respawn) cp("cp4", B.cp4.x, B.cp4.z, PI, "The armoury");
        A("muffle", 0.7, 0.3);
        objective("Escape! Back to the jungle", ctx.touch ? "hold Fire" : "F / click: fire");
        setMark(B.cp5.x, B.cp5.z);
        mus("stealth", { intensity: 0.5 });
        break;
      case "fuel":
        player.teleport(B.cp5.x, B.cp5.z, PI / 2);
        makeSquad(fightersAt, -1.6, 51.4, PI / 2, 2, null, true);
        ambushed = true; lossStage = 3; outside = true;
        spawnWaveB();
        if (!respawn) cp("cp5", B.cp5.x, B.cp5.z, PI / 2, "The apron");
        combat.order("attack");
        objective("Escape! Back to the jungle");
        setMark(B.innerGate.x, B.innerGate.z);
        mus("combat", { intensity: 0.85, at: "now" });
        break;
      case "gate":
        player.teleport(0, 42, PI);
        makeSquad(fightersAt, 0, 43.6, PI, 2, null, true);
        ambushed = true; lossStage = 3; outside = true;
        if (!respawn) cp("cp5b", 0, 42, PI, "The yard");
        spawnWaveC();
        combat.order("attack");
        objective("Escape! Back to the jungle");
        setMark(B.mainGate.x, 10);
        mus("combat", { intensity: 1, at: "now" });
        break;
      case "run": {
        const ex = runEast ? B.eastOut.x : B.cp6.x, ez = runEast ? B.eastOut.z - 2 : B.cp6.z;
        player.teleport(ex, ez, PI);
        makeSquad(fightersAt, ex, ez + 1.6, PI, 2, null, true);
        ambushed = true; lossStage = 3; outside = true;
        if (!respawn) cp("cp6", ex, ez, PI, runEast ? "The gap" : "The gate");
        spawnPursuit(runEast);
        combat.order("attack");
        objective("Run! Into the jungle");
        setMark(B.exit.x, B.exit.z);
        mus("combat", { intensity: 1, at: "now" });
        break;
      }
      default: break;
    }
    if (respawn) killHint();
  }

  function yardObjective() {
    if (base.lever.pulled) { objective("Go through the gate - NOW!"); setMark(B.cp2.x, B.cp2.z); }
    else { objective("Open the inner gate", ctx.touch ? "Slap the lever" : "L: slap the lever"); setMark(B.guardDoor.x, B.guardDoor.z); }
  }

  // jump straight to a stage (skipTo)
  function jump(name) {
    hardStop();
    toBase();
    setup(name, false);
    ui.showHud(true);
    player.enabled = true;
    cinema.fade("clear", 0.8);
  }

  // =====================================================================================================
  // intro: the camp at dusk, then the overlook
  // =====================================================================================================
  function campIntroSetup() {
    toJungle("dawn");
    A("jungleAmbience", true, "dawn");
    tribe.village.populate(J.spots);
    tribe.village.setMood("calm", 0);
    burra.visible = true; burra.place(J.elder.x, J.elder.z, PI);
    rok.visible = true; rok.place(J.elder.x + 2.1, J.elder.z - 1.5, -2.4);
    moss.visible = true; moss.place(J.elder.x - 2.0, J.elder.z - 1.3, 2.4);
    gear.wear("body", "leaf", { armor: 0.3 });
    player.teleport(J.elder.x, J.elder.z - 2.5, 0);
    if (platypus.pose) platypus.pose("sit");
  }
  function cutToBase() {
    if (platypus.pose) platypus.pose(null);
    tribe.village.clear();
    burra.visible = false;
    A("jungleAmbience", false);
    A("tribeChatter", 0);
    setup("fence", false);
  }
  // the intro sequence calls setup("fence") half-way (cutToBase), which bumps gen; its own callbacks use introTok
  let introTok = 0;
  function start() {
    const g = gen, t = introTok;
    cinema.titleCard({ kicker: "LEVEL 10", title: meta.title }, () => {
      if (g !== gen || step !== "intro") return;
      const ce = J.camElder, co = base.camOverlook;
      cinema.play([
        { shot: { pos: arr(ce.pos), look: arr(ce.look), fov: F(42), to: { pos: [ce.pos.x + 0.5, ce.pos.y + 0.1, ce.pos.z - 0.5] }, dur: 9 }, hold: false },
        { fade: "clear", dur: 1.2 },
        { call: () => { jungle.setTime("dusk", 5); A("tribeChatter", 0.4); } },
        { wait: 1.6 },
        { call: () => { if (burra.emote) burra.emote("sniff"); } },
        { caption: "[They have your friend's scent on them. Go and see.]", dur: 4.6, who: "Old Burra" },
        { wait: 0.5 },
        { fade: "black", dur: 0.7 },
        { call: cutToBase },
        { shot: { pos: arr(co.pos), look: arr(co.look), fov: F(46), to: { pos: [co.pos.x - 1.2, co.pos.y - 0.5, co.pos.z + 2.2] }, dur: 7 }, hold: false },
        { fade: "clear", dur: 1.0 },
        { caption: "Night. The place the soldiers come from.", dur: 3.4, narr: true },
        { call: () => { if (rok.emote) rok.emote("chirp"); } },
        { caption: "[Quiet. Stay in the dark.]", dur: 2.8, who: "Rok" },
      ], { skippable: true, onSkip: () => { if (t === introTok && stage !== "fence") cutToBase(); }, onDone: () => { if (t === introTok) beginFence(); } });
    });
  }
  function beginFence() {
    if (stage !== "fence") setup("fence", false);
    step = "fence";
    ui.showHud(true);
    player.enabled = true;
    const g = gen;
    ctx.after(1.0, () => { if (g === gen && step === "fence") hint(ctx.touch ? "Hold Sneak to creep. Stay out of the searchlight." : "Hold Shift to sneak. Stay out of the searchlight.", 5); });
  }
  function startIntro() {
    hardStop();
    campIntroSetup();
    step = "intro";
    start();
  }

  // =====================================================================================================
  // SECTIONS 1-2: stealth
  // =====================================================================================================
  function raiseAlarm(why) {
    if (alarmOn || !stealth()) return;
    alarmOn = true; alarmQuiet = 0;
    lastKill = why === "light" ? "light" : "seen";
    base.setAlarm(true);
    A("siren", true, "base");
    mus("combat", { intensity: 0.8, at: "now" });
    if (!reinforced) {
      reinforced = true;
      const R = [[6, 34], [8, 35.6], [4, 35.6], [6, 37.2]];
      let room = Math.max(0, 10 - combat.alive);
      for (let i = 0; i < R.length && room > 0; i++, room--) sp("soldier", R[i][0], R[i][1], { yaw: PI, route: "reinforceMain", loop: false, squad: 1, alert: true });
    }
    hint(step === "fence" ? "SPOTTED! Back into the tall grass!" : "SPOTTED! Break their line of sight!", 3.5);
    line("Rok", "[They see us! Hide!]", 2.4, rok, "scared");
    cinema.shake(0.015, 0.3);
  }
  function clearAlarm() {
    if (!alarmOn) return;
    alarmOn = false;
    if (!stealth()) return;
    base.setAlarm(false);
    A("siren", false, "base");
    mus("stealth", { intensity: 0.4 });
    hint("They lost you. Stay low.", 2.6);
  }
  function onSearchlight(i) {
    if (!playing() || !inBase()) return;
    if (stealth()) {
      const T = base.towers[i] || { x: 0, z: 14 };
      const l = combat.enemies;
      for (let k = 0; k < l.length; k++) { const e = l[k]; if (e.alive && !e.aware && dist2(e.x, e.z, T.x, T.z) < 40) e.alert(player.x, player.z); }
      raiseAlarm("light");
    } else if (stage === "gate" || stage === "run") alertAll();
  }
  function reachYard() {
    stage = "yard"; step = "yard";
    cp("cp1", B.cp1.x, B.cp1.z, 0, "Inside the fence");
    spawnYard();
    ui.objectiveDone();
    yardObjective();
    line("Rok", "[The lever is in the little house. Mind the one inside.]", 3.6, rok);
    const g = gen;
    ctx.after(4.2, () => { if (g === gen && step === "yard" && !base.lever.pulled) hint("Tail Slap a truck to draw the guards away. Behind a guard: one hit takes him down.", 5.5); });
  }
  function pullLever() {
    if (base.lever.pulled) return;
    base.lever.pull();                       // also rolls the inner gate open
    base.gates.inner.open();
    A("tailSlapHit"); A("gateOpen", true);
    cinema.shake(0.012, 0.3);
    ui.call("CLANK!", "The gate is opening", "good");
    ui.objectiveDone();
    combat.noise(0, 42, 28, 8);
    yardObjective();
    line("Rok", "[It is open. GO!]", 2.4, rok, "call");
  }
  function honk(t) {
    hornCd = 6;
    if (t.honk) t.honk();
    A("tailSlapHit"); A("warnBeep", true); A("truckEngine", true);
    const g = gen;
    ctx.after(0.55, () => { A("warnBeep", false); if (g === gen) A("truckEngine", false); });
    combat.noise(t.x, t.z, 24, 8);
    hint("HONK! The guards go to look.", 2.6);
  }
  function reachApron() {
    stage = "apron"; step = "apron";
    cp("cp2", B.cp2.x, B.cp2.z, 0, "The inner gate");
    if (alarmOn) { alarmOn = false; }
    ui.setSeen(null);
    objective("Cross to the armoury");
    setMark(B.ring0.x, B.ring0.z);
  }

  // =====================================================================================================
  // SECTION 3: the apron
  // =====================================================================================================
  function ambush() {
    if (ambushed) return;
    ambushed = true; ambushT = 0; lossStage = 0;
    // whoever was still wandering the yard: the far ones are gone, the near ones join in
    const l = combat.enemies;
    for (let i = l.length - 1; i >= 0; i--) {
      const e = l[i];
      if (!e.alive) continue;
      if (!e.aware && dist2(e.x, e.z, player.x, player.z) > 14) e.remove(); else e.alert(player.x, player.z);
    }
    base.setAlarm(true);
    A("siren", true, "base");
    mus("combat", { intensity: 0.9, at: "now" });
    combat.maxShooters = 2;
    spawnApron(true);
    cinema.shake(0.03, 0.5);
    ui.setSeen(null);
    line("Rok", "[RUN!]", 2.2, rok, "scared");
    objective("RUN! Ring to ring, to the armoury wall", ctx.touch ? "Sneak in a ring = safe" : "Shift in a ring = safe");
    setMark(B.ring0.x, B.ring0.z);
    const g = gen;
    ctx.after(2.4, () => { if (g === gen && step === "apron") hint("Watch the red lines. When one locks - sprint. Sneak inside a sandbag ring to be safe.", 5.5); });
  }
  function pickLoss() {
    const l = combat.allies, R = base.rings || [];
    let best = null, bs = -1;
    for (let i = 0; i < l.length; i++) {
      const a = l[i];
      if (!a.alive || a.hero) continue;
      let open = 9;
      for (let k = 0; k < R.length; k++) open = Math.min(open, dist2(a.x, a.z, R[k].x, R[k].z));
      const s = open + 0.3 * Math.min(6, dist2(a.x, a.z, player.x, player.z));
      if (s > bs) { bs = s; best = a; }
    }
    return best;
  }
  // one of the squad is hit and lies still. With restraint: a tracer, the fall, pale motes (combat.js), a mourning chirp.
  function loseOne() {
    const a = pickLoss();
    if (!a) return false;
    let sh = null, sd = 1e9;
    const l = combat.enemies;
    for (let i = 0; i < l.length; i++) { const e = l[i]; if (!e.alive || !e.muzzle) continue; const d = dist2(e.x, e.z, a.x, a.z); if (d < sd) { sd = d; sh = e; } }
    v2.set(a.x, (a.y || 0) + 0.2, a.z);
    if (sh) {
      v1.set(sh.muzzle.x, sh.muzzle.y, sh.muzzle.z);
      const dx = v2.x - v1.x, dz = v2.z - v1.z, d = Math.hypot(dx, dz) || 1;
      FX("muzzleFlash", v1, dx / d, dz / d, 1);
      FX("tracer", v1, v2, 90, 0xffe9a0);
      A("gunshot", farOf(sh.x, sh.z), panOf(sh.x, sh.z), "rifle");
    }
    FX("bulletImpact", v2, "concrete");
    a.hp = 1;
    if (typeof a.knockOut === "function") a.knockOut(sh ? { enemy: sh } : null);
    return true;
  }
  function lossBeat(n) {
    const g = gen;
    if (n === 1) {
      // the first one: the world slows, the drums fall away for two bars
      loseOne();
      ctx.setTimeScale(0.5, 0.12);
      cinema.after(1.5, () => { if (g === gen && !checkpoint.respawning && !health.dead) ctx.setTimeScale(1, 0.35); });
      musHold = 4.6;
      if (music && music.setIntensity) music.setIntensity(0.3, 0.3);
      ctx.after(2.3, () => { if (g === gen && step === "apron" && music && music.setIntensity) music.setIntensity(0.9, 1.2); });
      setMark(B.wall.x, B.wall.z);
    } else if (n === 2) {
      loseOne();
      ctx.after(0.55, () => { if (g === gen && step === "apron") loseOne(); });
    } else {
      loseOne();
      hurtMoss({ x: -22.7, z: 76.2 });
      A("tribeChirp", "scared", 0.9, panOf(moss.x, moss.z), 1.1);
      line("Rok", "[MOSS!]", 2, null);
    }
  }
  function updateApron(dt) {
    const px = player.x, pz = player.z;
    if (!ambushed) { if (pz > 48.3) ambush(); return; }
    ambushT += dt;
    if (lossStage === 0 && ambushT > 1.6 && (nearP(B.ring0, 3.4) || pz > 51.5 || ambushT > 9)) { lossStage = 1; lossBeat(1); }
    else if (lossStage === 1 && ambushT > 4 && (pz > 57.5 || (px < -16 && pz > 54.5))) { lossStage = 2; lossBeat(2); }
    else if (lossStage === 2 && pz > 63 && nearP(B.wall, 9.5)) { lossStage = 3; lossBeat(3); }
    if (pz > 70.5 && px < -16 && (nearP(B.cp3, 3) || nearP(B.wall, 2.6))) reachWall();
  }
  function reachWall() {
    // the story's losses happen even if the player outran their triggers
    while (lossStage < 3) { lossStage++; if (lossStage === 2) { loseOne(); loseOne(); } else if (lossStage === 1) loseOne(); else { loseOne(); hurtMoss({ x: -22.7, z: 76.2 }); } }
    while (fighters() > 2) { if (!loseOne()) break; }
    stage = "door"; step = "door";
    ctx.setTimeScale(1, 0.2);
    cp("cp3", B.cp3.x, B.cp3.z, -PI / 2, "The armoury wall");
    combat.calm();
    combat.order("hold", { x: -22, z: 76.6 });
    mus("sorrow", { intensity: 0.5, at: "bar" });
    ui.objectiveDone();
    objective("Catch your breath");
    clearMarks();
    doorT = 25; doorLineT = 5; cornerDone = false; slaps = 0;
    const g = gen;
    narr("Eight went in. Four reached the wall.", 3.6);
    ctx.after(1.2, () => { if (g === gen && rok.emote) rok.emote("mourn"); });
    ctx.after(4.2, () => {
      if (g !== gen || step !== "door") return;
      line("Rok", "[The door. Your tail. Break it!]", 3.2, rok, "call");
      objective("Break the door", ctx.touch ? "Slap x3" : "L x3");
      setMark(B.doorOut.x, B.doorOut.z);
    });
  }

  // =====================================================================================================
  // THE DOOR
  // =====================================================================================================
  const CORNER = { x: -24.3, y: 1.0, z: 74.7 };
  function chewCorner(n) {
    const g = gen;
    for (let i = 0; i < n; i++) {
      ctx.after(0.3 + i * 0.13, () => {
        if (g !== gen) return;
        v1.set(CORNER.x + (Math.random() - 0.5) * 0.5, CORNER.y + (Math.random() - 0.3) * 0.9, CORNER.z + Math.random() * 0.5);
        FX("bulletImpact", v1, "concrete");
        A("gunshot", 0.45, panOf(-18, 64), "rifle");
        if (i === 0) A("ricochet", panOf(CORNER.x, CORNER.z));
      });
    }
  }
  function doorSlap() {
    const d = base.doors.armoury;
    if (d.opened) return;
    const done = d.hit();
    slaps = d.hits;
    A("tailSlapHit"); A("armorClank", 1); A("fenceRattle");
    cinema.shake(0.02, 0.25);
    ui.call(done ? "CRACK!" : "SLAM!", Math.min(3, d.hits) + " / 3", done ? "perfect" : "good");
    chewCorner(3);
    if (done) {
      d.open();
      A("latchBreak"); A("bodyFall", "metal");
      ui.objectiveDone();
      objective("Get inside!");
      setMark(B.cp4.x, B.cp4.z);
      combat.order("follow");
    }
  }
  function updateDoor(dt) {
    const d = base.doors.armoury;
    if (d.opened) {
      if (player.x < -25.5 && player.z > 78.4 && player.z < 81.6) enterArmoury();
      return;
    }
    if (!markOn) return;                    // still catching breath
    if (doorT > 0) {
      doorT -= dt;
      doorLineT -= dt;
      if (doorLineT <= 0) {
        // their red lines creep round the corner
        doorLineT = 4.2;
        const k = 1 - doorT / 25;
        v1.set(-19.5 - k * 2, 1.3, 63 + k * 6);
        v2.set(CORNER.x, CORNER.y, CORNER.z);
        FX("telegraph", v1, v2, 1.1, 0xff3020);
        A("aimWarn", panOf(v1.x, v1.z));
        chewCorner(2);
      }
      if (doorT <= 0 && !cornerDone) {
        cornerDone = true;
        sp("soldier", -20.6, 66.5, { yaw: 0, squad: 2, alert: true });
        sp("soldier", -18.6, 65.2, { yaw: 0, squad: 2, alert: true });
        combat.order("attack");
        mus("combat", { intensity: 0.8, at: "now" });
        hint("They are coming round the corner. Get close - they cannot aim!", 4.5);
      }
    }
  }

  // =====================================================================================================
  // THE ARMOURY
  // =====================================================================================================
  function enterArmoury() {
    stage = "armoury"; step = "armoury";
    // inside is safe: whoever cannot see in is dropped from the fight
    const l = combat.enemies;
    for (let i = l.length - 1; i >= 0; i--) { const e = l[i]; if (e.alive && (dist2(e.x, e.z, player.x, player.z) > 9 || !base.sight(e.x, e.z, player.x, player.z))) e.remove(); }
    combat.calm();
    combat.order("follow");
    cp("cp4", B.cp4.x, B.cp4.z, PI, "The armoury");
    A("muffle", 0.7, 0.6);
    mus("stealth", { intensity: 0.2 });
    ui.objectiveDone();
    clearMarks();
    const g = gen, c = base.camRacks;
    cinema.play([
      { shot: { pos: arr(c.pos), look: arr(c.look), fov: F(48), to: { pos: [c.pos.x - 1.4, c.pos.y - 0.2, c.pos.z + 0.6] }, dur: 3.2 }, hold: false },
      { caption: "Their things. Their teeth and their shells.", dur: 3.2, narr: true },
    ], { skippable: true, onDone: () => { if (g === gen && step === "armoury") beginGearing(); } });
  }
  function beginGearing() {
    objective("Take the gear", ctx.touch ? "tap Take" : "E: take");
    ui.setQuests(GEAR_KEYS.map((k) => ({ id: k, text: GEAR_NAME[k], done: got[k] })), "Gear");
    for (let i = 0; i < 3; i++) {
      const r = base.racks[GEAR_KEYS[i]];
      dropHandle(rackMarks[i]);
      rackMarks[i] = got[GEAR_KEYS[i]] ? null : FX("beacon", r.x, 0, r.z, i === 0 ? 0x9fd0ff : i === 1 ? 0x8dffb0 : 0xffb070) || null;
    }
    moss.do("hurt", { to: { x: -27.2, z: 83.6 } });
  }
  function takeGear(i) {
    const k = GEAR_KEYS[i];
    if (got[k]) return;
    got[k] = true;
    base.racks[k].take();
    dropHandle(rackMarks[i]); rackMarks[i] = null;
    player.lock = 1.1;
    if (platypus.cheer) platypus.cheer();
    stinger("gear");
    ui.setQuest(k, { done: true });
    v1.set(player.x, player.y + 0.4, player.z);
    FX("sparkle", v1);
    if (k === "suit") {
      A("gearOn", "suit");
      gear.wear("body", "suit", { armor: 0.5 });
      ui.call("TACTICAL SUIT", "Armor: you can take more hits", "good");
    } else if (k === "glasses") {
      A("gearOn", "glasses"); A("visorOn");
      gear.wear("eyes", "glasses", { visor: true });
      base.outlineLights(true);
      ui.call("TACTICAL GLASSES", "You see them through walls", "good");
    } else {
      A("gearOn", "weapon");
      gear.wear("weapon", "blaster");
      armBlaster(40);
      ui.call("BLASTER", ctx.touch ? "Hold Fire" : "F or left mouse", "good");
      const g = gen;
      ctx.after(1.6, () => { if (g === gen && step === "armoury") hint(ctx.touch ? "Hold the Fire button to shoot. Try the two targets!" : "Hold F or the left mouse button to shoot. Try the two targets!", 5); });
    }
    if (got.suit && got.glasses && got.blaster) {
      const g = gen;
      ctx.after(2.2, () => { if (g === gen && step === "armoury") armFightout(); });
    }
  }
  // all three taken: the way out is open and the hunters are on the apron
  function armFightout() {
    stage = "fightout"; step = "fightout";
    fightArmed = true; outside = false;
    ui.setQuests(null);
    narr("Rok takes a strap of flash charges in his teeth.", 3.4);
    if (rok.emote) rok.emote("war");
    carryMoss();
    setFightersHp(60);
    combat.maxShooters = 3;
    spawnWaveA();
    cp("cp4", B.cp4.x, B.cp4.z, PI, "The armoury");   // same id: only the restore/position are refreshed
    base.setTime("predawn", 90);
    ui.objectiveDone();
    objective("Escape! Back to the jungle", ctx.touch ? "hold Fire" : "F / click: fire");
    setMark(B.cp5.x, B.cp5.z);
  }
  function takeAmmo(i) {
    const a = base.ammo[i];
    if (!a || a.taken) return;
    a.take();
    abilities.shoot.add(20);
    A("gearOn", "weapon");
    ctx.project(platypus.group, scr, 0.5);
    ui.floatText("+20", scr.x, scr.y, "plain");
  }

  // =====================================================================================================
  // SECTION 4: fight out
  // =====================================================================================================
  function onFire(o, dx, dz, t, d) {
    if (platypus.fire) platypus.fire();
    A("gunshot", 0, 0, "blaster");
    FX("muzzleFlash", o, dx, dz, 0.8);
    if (t && (t.special || t === base.fuel || t.kind === "target")) {
      v1.set(o.x, o.y, o.z); v2.set(t.x, t.y, t.z);
      FX("tracer", v1, v2, 90, 0x9fe8ff);
      if (t === base.fuel) base.fuel.hit();
      else if (t.special === "lamp") {
        if (t.light.hit()) { t.alive = t.targetable = false; A("glassShatter"); hint("That tower is blind now.", 2.6); }
      } else if (t.hit && t.hit()) { rangeHits++; A("bulletHit", "wood", 0); ui.call(rangeHits >= 2 ? "BULLSEYE!" : "HIT!", rangeHits >= 2 ? "You are dangerous now" : "", "good"); }
      return;
    }
    const e = combat.playerShot(o, dx, dz, t, d);
    if (e && !e.alive) cinema.shake(0.008, 0.12);
  }
  function onEmpty() { A("emptyClick"); hint("Out of ammo - get close!", 2.2); }
  function onFuel() {
    fuelBlown = true;
    combat.blast(34, 60, 10.5, 0.8);
    cinema.shake(0.05, 0.7);
    if (stage === "fightout" || stage === "fuel") {
      hint("The east fence is torn open - go!", 3.5);
      dropHandle(beacon2);
      beacon2 = FX("beacon", B.eastGap.x, 0, B.eastGap.z, 0xffb070) || null;
    }
  }
  function leaveArmoury() {
    outside = true;
    A("muffle", 0, 0.5);
    mus("combat", { intensity: 1, at: "now" });
    combat.order("attack");
    alertAll();
    line("Rok", "[Now THEY run.]", 2.6, null);
    const g = gen;
    ctx.after(2.8, () => { if (g === gen && step === "fightout") hint("Two bolts drop a soldier. One bolt and a sting works too.", 4.5); });
  }
  function reachFuel() {
    stage = "fuel"; step = "fuel";
    fightersAt = fighters();
    cp("cp5", B.cp5.x, B.cp5.z, PI / 2, "The apron");
    spawnWaveB();
    setMark(B.innerGate.x, B.innerGate.z);
    const g = gen;
    ctx.after(2.5, () => {
      if (g !== gen || step !== "fuel" || fuelBlown) return;
      fuelHint = true;
      hint("Fuel drums by the east fence. Shoot them!", 4.5);
    });
  }
  function reachGate() {
    stage = "gate"; step = "gate";
    fightersAt = fighters();
    cp("cp5b", 0, 42, PI, "The yard");
    spawnWaveC();
    base.setHunt(true);
    dropHandle(beacon2); beacon2 = null;
    setMark(B.mainGate.x, 10);
    hint("The searchlights are hunting you. Shoot a tower lamp to blind it.", 4.5);
  }
  function blowGate() {
    if (gateCall) return;
    gateCall = true;
    line("Rok", "[NOW!]", 1.8, null);
    A("tribeChirp", "war", 1, panOf(rok.x, rok.z), 0.8);
    const g = gen;
    ctx.after(0.7, () => {
      if (g !== gen || !inBase()) return;
      gateBlown = true;
      base.gates.main.blow();
      A("explosion", farOf(0, 8));
      cinema.shake(0.05, 0.7);
      combat.blast(0, 8.6, 7, 0.7);
      hint("The gate is gone - RUN!", 3);
      objective("Run! Into the jungle");
    });
  }
  function reachRun(east) {
    stage = "run"; step = "gate";
    runEast = !!east;
    fightersAt = fighters();
    const ex = east ? B.eastOut.x : B.cp6.x, ez = east ? B.eastOut.z - 2 : B.cp6.z;
    cp("cp6", ex, ez, PI, east ? "The gap" : "The gate");
    if (east) base.setHunt(true);
    spawnPursuit(east);
    dropHandle(beacon2); beacon2 = null;
    objective("Run! Into the jungle");
    setMark(B.exit.x, B.exit.z);
    if (east) line("Rok", "[Clever. Through the grass!]", 2.6, null);
  }
  function updateFightout() {
    const px = player.x, pz = player.z;
    if (stage === "fightout") {
      if (!outside) { if (px > -24.2) leaveArmoury(); }
      else if (nearP(B.cp5, 9) || (pz < 58 && px > -14)) reachFuel();
    } else if (stage === "fuel") {
      if (px > 41) reachRun(true);
      else if (pz < 43.2) reachGate();
    } else if (stage === "gate") {
      if (px > 41) { reachRun(true); return; }
      if (!gateCall && pz < 26) blowGate();
      if (gateBlown && pz < 14.5 && Math.abs(px) < 9) reachRun(false);
    }
    if (pz < 2.6 && (stage === "run" || stage === "gate" || stage === "fuel")) goOut();
  }

  // =====================================================================================================
  // OUT, the walk home, the fire
  // =====================================================================================================
  function goOut() {
    if (step === "home" || step === "end" || step === "done") return;
    const g = ++gen;
    step = "home"; stage = "home";
    fightersAt = fighters();
    allHome = fightersAt >= 2;
    lost = SQUAD - 2 - fightersAt;
    player.enabled = false;
    health.shield = true;
    abilities.cancel();
    combat.calm();
    ui.setObjective(null); setAct(null);
    clearMarks();
    mus("chill", { intensity: 0.3 });
    A("gunshot", 1, -0.4, "rifle");
    cinema.after(0.5, () => { if (g === gen) A("gunshot", 1, 0.3, "rifle"); });
    cinema.fade("black", 0.6, () => { if (g === gen) startHome(false); });
  }
  function startHome(hard) {
    if (hard) { hardStop(); fightersAt = 2; lost = 4; allHome = true; got.suit = got.glasses = got.blaster = true; }
    const g = ++gen;
    step = "home"; stage = "home";
    ctx.clearTimers();
    ctx.setTimeScale(1, 0);
    health.disable();
    abilities.shoot.disable();
    abilities.buttons({ jump: true });
    ui.setSeen(null); ui.setPing(null);
    for (let i = 0; i < 12; i++) ui.mark(i, 0, 0, null);
    A("siren", false, "base"); A("truckEngine", false); A("searchlightHum", 0); A("muffle", 0, 0.1);
    combat.reset();
    combat.onEvent = null;
    base.onSpotted = null;
    toJungle("dawn");
    A("jungleAmbience", true, "dawn");
    gear.clear();
    gear.wear("body", "suit", { armor: 0.5 });
    gear.wear("eyes", "glasses", { visor: true });
    gear.wear("weapon", "blaster");
    if (platypus.pose) platypus.pose(null);
    if (platypus.setAim) platypus.setAim(null);
    sneakOn = false;
    const T = J.baseTrail;
    player.maxSpeed = 3;
    player.teleport(T.x, T.z, -PI / 2);
    makeSquad(fightersAt, T.x + 1.8, T.z + 0.2, -PI / 2, 2, null, false);
    lost = SQUAD - 2 - fightersAt;
    combat.order("follow");
    if (musState !== "chill") mus("chill", { intensity: 0.3 });
    homeT = 0; homeFar = false;
    ui.showHud(true);
    objective("Walk home with the ones who are left");
    setMark(40, -27);
    player.enabled = true;
    cinema.fade("clear", 1.2);
    cinema.after(1.6, () => { if (g === gen && step === "home") narr("Dawn. The shooting thins behind you.", 3.4); });
  }
  function updateHome(dt) {
    homeT += dt;
    if (!homeFar && (player.x < 42 || nearP({ x: 40, z: -27 }, 4))) { homeFar = true; setMark(22, -24); line("Rok", "[Home. Slowly. Moss is heavy.]", 3, null); }
    // far, thinning gunfire behind
    farShotT -= dt;
    if (farShotT <= 0 && homeT < 14) { farShotT = 1.6 + Math.random() * 2.4 + homeT * 0.2; A("gunshot", 1, 0.7, "rifle"); }
    if (player.x < 25.5 || nearP({ x: 22, z: -24 }, 4.5) || homeT > 75) campScene(false);
  }
  function campPlace() {
    combat.reset();
    moss.attachTo(null);
    tribe.village.populate(J.spots);
    tribe.village.setCount(Math.max(8, (tribe.village.total || J.spots.length) - lost - 2));
    tribe.village.setMood("mourn", 0);
    const f = J.fire;
    burra.visible = true; burra.place(f.x + 1.9, f.z + 0.5, Math.atan2(-1.9, -0.5));
    rok.visible = true; rok.place(f.x - 1.4, f.z - 2.3, Math.atan2(1.4, 2.3));
    moss.visible = true; moss.place(f.x - 0.2, f.z - 2.7, Math.atan2(0.2, 2.7));
    moss.do("hurt", { to: { x: f.x - 0.2, z: f.z - 2.7 } });
    player.teleport(J.seat.x, J.seat.z, Math.atan2(f.x - J.seat.x, f.z - J.seat.z));
    if (platypus.pose) platypus.pose("sit");
    A("fire", 0.6);
    army.show(false);
  }
  function layLeaf() {
    const f = J.fire;
    leavesLaid++;
    if (burra.emote) burra.emote("bow");
    A("materialPickup", "leaf");
    FX("leaves", f.x, f.y + 0.7, f.z, 3, 0x6fae4a);
    v1.set(f.x, f.y + 0.6, f.z);
    FX("sadMotes", v1, 6);
  }
  function campScene(hard) {
    if (step === "end" || step === "done") return;
    if (hard) { hardStop(); lost = 4; allHome = true; toJungle("dawn"); A("jungleAmbience", true, "dawn"); gear.wear("body", "suit", { armor: 0.5 }); gear.wear("eyes", "glasses", { visor: true }); gear.wear("weapon", "blaster"); mus("chill", { intensity: 0.3 }); }
    const g = ++gen;
    step = "end";
    player.enabled = false;
    player.stop();
    ui.setObjective(null); setAct(null);
    clearMarks();
    const run = () => {
      if (g !== gen) return;
      campPlace();
      const cf = J.camFire, cr = J.camCampReveal, f = J.fire;
      const n = clamp(lost, 1, 6);
      const steps = [
        { shot: { pos: arr(cf.pos), look: arr(cf.look), fov: F(44), to: { pos: [cf.pos.x + 0.6, cf.pos.y + 0.25, cf.pos.z - 0.8] }, dur: 7 + n * 1.5 }, hold: false },
        { fade: "clear", dur: 1.4 },
        { caption: "They count who came back.", dur: 3.4, narr: true },
        { wait: 0.4 },
      ];
      for (let i = 0; i < n; i++) { steps.push({ call: layLeaf }); steps.push({ wait: 1.5 }); }
      steps.push(
        { call: () => { if (music && music.motif) music.motif("pipSad"); } },
        { caption: n === 4 ? "Four leaves on the fire. One for each." : "A leaf on the fire for each one.", dur: 3.6, narr: true },
        { wait: 0.6 },
        { shot: { pos: [f.x - 1.6, f.y + 0.9, f.z - 0.6], look: burra.group, lookY: 0.3, fov: F(34), to: { pos: [f.x - 1.3, f.y + 0.8, f.z - 0.4] }, dur: 7.5 }, hold: false },
        { call: () => { burra.lookAt(platypus.group); } },
        { caption: "[Now we know what they are.]", dur: 3.4, who: "Old Burra" },
        { wait: 0.4 },
        { caption: "[And they know what YOU are.]", dur: 3.6, who: "Old Burra" },
        { shot: { pos: arr(cr.pos), look: arr(cr.look), fov: F(46), to: { pos: [cr.pos.x - 1.5, cr.pos.y - 0.8, cr.pos.z + 1.5] }, dur: 5.5 }, hold: false },
        { call: riseUp },
        { wait: 2.2 },
      );
      if (allHome) steps.push({ call: () => { if (rok.emote) rok.emote("bow"); } }, { caption: "[You kept the last of us alive. I will not forget it.]", dur: 3.8, who: "Rok" });
      steps.push({ wait: 1.2 });
      cinema.play(steps, { skippable: true, release: null, onSkip: () => { if (g === gen) riseUp(); }, onDone: () => { if (g === gen) finish(); } });
    };
    if (hard || cinema.faded >= 0.99) run(); else cinema.fade("black", 0.8, run);
  }
  let risen = false;
  function riseUp() {
    if (risen) return;
    risen = true;
    tribe.village.setMood("war", 1.2);
    A("warCry"); A("tribeCheer", 0.6);
    if (rok.emote) rok.emote("war");
    mus("tribe", { intensity: 0.7, at: "bar" });
  }
  function finish() {
    if (step === "done") return;
    step = "done";
    player.enabled = false;
    ui.showComplete({ kicker: "LEVEL 10", title: "COMPLETE", sub: lost > 4 ? "They will be remembered." : "Now you are dangerous." }, () => ctx.complete());
  }

  // =====================================================================================================
  // combat events, attacks, interaction
  // =====================================================================================================
  function onDeath(src) {
    lastKill = src && src.kind ? src.kind : "bullet";
    return false;                             // the engine's fast restart
  }
  function onCombat(type, a, b) {
    if (type === "spotted") {
      if (stealth()) raiseAlarm("seen");
    } else if (type === "allClear") {
      if (stealth() && alarmOn) clearAlarm();
    } else if (type === "down") {
      kills++;
      if (b === "takedown") {
        ui.call("TAKEDOWN", "Silent", "perfect");
        // a squad member drags the body into the shadow: it is simply gone a moment later
        const g = gen, body = a && a.body;
        ctx.after(1.4, () => { if (g === gen && body && body.alive) body.age = combat.bodyTTL; });
      } else if (b === "finish" && fightArmed) ui.call("DOWN!", "", "good");
    } else if (type === "allyDown") {
      if (a && !a.hero) {
        lost = SQUAD - 2 - fighters();
        if (fightArmed && !lostHint) { lostHint = true; hint("You lost one of the squad. Keep them behind cover.", 3.5); }
      }
    } else if (type === "aim") {
      // the glasses: an early warning of who is aiming at you (edge ping + a second faint line)
      if (hasGlasses() && a && (b === player || !b || b === null)) {
        ui.setPing(ctx.bearing(a.x, a.z), 0.8, "danger");
        v1.set(a.muzzle.x, a.muzzle.y, a.muzzle.z); v2.set(player.x, player.y + 0.2, player.z);
        FX("telegraph", v1, v2, 0.3, 0x7dffb0);
      }
    }
  }

  function slapWorld() {
    const px = player.x, pz = player.z;
    if (step === "door" && markOn && !base.doors.armoury.opened && dist2(px, pz, base.doors.armoury.hinge.x, base.doors.armoury.hinge.z) < 2.4) { doorSlap(); return true; }
    if (step === "yard" && !base.lever.pulled && dist2(px, pz, base.lever.x, base.lever.z) < 2.0) { pullLever(); return true; }
    if ((step === "yard" || step === "fence") && hornCd <= 0) {
      const t = base.truckAt(px, pz, 1.3);
      if (t) { honk(t); return true; }
    }
    return false;
  }
  function onStrike(kind, fin, g) {
    if (g !== gen || !inBase()) return;
    const r = combat.strike(fin ? "finisher" : kind);
    const res = r ? r.result : "miss";
    if (res === "miss") {
      if (kind === "slap" && slapWorld()) return;
      A(kind === "slap" ? "tailSlap" : "sting");
      if (step === "door" && kind === "slap" && markOn && !base.doors.armoury.opened) hint("Closer! Stand at the door's hinge.", 2);
      return;
    }
    if (res === "finish") cinema.shake(0.014, 0.18);
    else if (res === "blocked") A("armorClank", 0.6);
    // slapping the door with a soldier in reach still counts for the door
    if (kind === "slap" && step === "door") slapWorld();
  }
  function onAction(name) {
    if (!playing() || !inBase()) return false;
    if (name === "interact") { doInteract(); return false; }
    const kind = name === "primary" ? "sting" : name === "tailSlap" ? "slap" : name === "secondary" ? "pulse" : null;
    if (!kind || platypus.acting) return false;
    if (kind === "pulse") { ui.hint("The pulse needs water!", 1.6); return true; }
    if (health.dead || player.lock > 0 || !player.grounded) return true;
    if (kind === "sting" ? stingCd > 0 : slapCd > 0) return true;
    const fin = combat.wouldFinish(kind);
    const t = fin ? platypus.finisherHitTime || 0.4 : kind === "slap" ? platypus.slapHitTime || 0.28 : platypus.stingHitTime || 0.2;
    if (fin && platypus.finisher) platypus.finisher(); else if (kind === "slap") platypus.tailSlap(); else platypus.sting();
    player.lock = fin ? 0.55 : kind === "slap" ? 0.45 : 0.25;
    if (kind === "sting") stingCd = 0.45; else slapCd = 0.8;
    const g = gen;
    ctx.after(t, () => onStrike(kind, fin, g));
    return true;
  }
  function doInteract() {
    if (actKind === "gear" && actI >= 0) takeGear(actI);
    else if (actKind === "ammo" && actI >= 0) takeAmmo(actI);
    else if (actKind === "lever") hint(ctx.touch ? "Hit it with your tail - tap Slap!" : "Hit it with your tail - press L!", 2.4);
  }
  function updatePrompt() {
    const px = player.x, pz = player.z;
    if (step === "armoury" || (stage === "fightout" && !outside)) {
      if (step === "armoury") {
        for (let i = 0; i < 3; i++) {
          const k = GEAR_KEYS[i], r = base.racks[k];
          if (!got[k] && dist2(px, pz, r.x, r.z) < 2.2) { setAct("Take the " + (k === "suit" ? "suit" : k), "gear", i); return; }
        }
      }
      if (got.blaster) {
        for (let i = 0; i < base.ammo.length; i++) {
          const a = base.ammo[i];
          if (!a.taken && dist2(px, pz, a.x, a.z) < 1.9) { setAct("Take ammo", "ammo", i); return; }
        }
      }
    } else if (step === "yard" && !base.lever.pulled && dist2(px, pz, base.lever.x, base.lever.z) < 2.0) { setAct("Lever", "lever", 0); return; }
    setAct(null);
  }

  // =====================================================================================================
  // per frame
  // =====================================================================================================
  function refreshAim() {
    aimList.length = 0;
    const l = combat.enemies;
    for (let i = 0; i < l.length; i++) aimList.push(l[i]);
    if (!got.blaster) return;
    if (step === "armoury" || (stage === "fightout" && !outside)) { for (let i = 0; i < base.targets.length; i++) if (base.targets[i].alive) aimList.push(base.targets[i]); }
    else {
      if (!base.fuel.exploded && (stage === "fuel" || stage === "fightout")) aimList.push(base.fuel);
      if (stage === "gate" || stage === "run") for (let i = 0; i < 2; i++) if (lampT[i].targetable) aimList.push(lampT[i]);
    }
  }
  function updateMarks() {
    let n = 0;
    const on = hasGlasses() && inBase() && !cinema.playing;
    if (on) {
      const l = combat.enemies;
      for (let i = 0; i < l.length && n < 8; i++) {
        const e = l[i];
        if (!e.alive) continue;
        v1.set(e.x, (e.y || 0) + 1.05, e.z);
        ctx.project(v1, scr, 0);
        if (scr.visible) ui.mark(n++, scr.x, scr.y, "foe");
      }
    }
    for (; n < 8; n++) ui.mark(n, 0, 0, null);
    let k = null;
    if (on && mossDown) { v1.set(moss.x, moss.y + 0.5, moss.z); ctx.project(v1, scr, 0); if (scr.visible) k = "ally"; }
    ui.mark(8, scr.x, scr.y, k);
    k = null;
    if (on && markOn) { v1.set(markX, 1.0, markZ); ctx.project(v1, scr, 0); if (scr.visible) k = "goal"; }
    ui.mark(9, scr.x, scr.y, k);
    k = null;
    if (on && !base.fuel.exploded && (stage === "fuel" || (stage === "fightout" && outside))) { v1.set(base.fuel.x, 1.1, base.fuel.z); ctx.project(v1, scr, 0); if (scr.visible) k = "loot"; }
    ui.mark(10, scr.x, scr.y, k);
    k = null;
    if (on && (stage === "gate" || stage === "run")) {
      const t = lampT[0].targetable && (!lampT[1].targetable || dist2(player.x, player.z, lampT[0].x, lampT[0].z) < dist2(player.x, player.z, lampT[1].x, lampT[1].z)) ? lampT[0] : lampT[1];
      if (t.targetable) { v1.set(t.x, t.y, t.z); ctx.project(v1, scr, 0); if (scr.visible) k = "loot"; }
    }
    ui.mark(11, scr.x, scr.y, k);
  }
  function musicTick(dt) {
    if (musHold > 0) { musHold -= dt; return; }
    musT -= dt;
    if (musT > 0 || !music || !music.setIntensity) return;
    musT = 0.5;
    let v = -1;
    const k = Math.min(1, combat.alerted / 3);
    if (musState === "stealth") v = (step === "armoury" ? 0.2 : 0.25) + 0.75 * k * (step === "armoury" ? 0 : 1) + (combat.alertState === "suspicious" ? 0.12 : 0);
    else if (musState === "combat") v = (fightArmed ? 0.7 : 0.6) + 0.3 * k;
    if (v >= 0 && Math.abs(v - musI) > 0.07) { musI = v; music.setIntensity(v, 1.2); }
  }
  function updateBase(dt) {
    const px = player.x, pz = player.z;
    // sneaking
    const sn = !!(ctx.input && ctx.input.held && ctx.input.held("down")) && !health.dead;
    if (sn !== sneakOn) { sneakOn = sn; if (platypus.pose) platypus.pose(sn ? "sneak" : null); }
    player.maxSpeed = sn ? 1.5 : 3 * (gear.speed || 1);
    // cooldowns
    if (stingCd > 0) { stingCd = Math.max(0, stingCd - dt); ui.setCooldown("sting", stingCd / 0.45); }
    if (slapCd > 0) { slapCd = Math.max(0, slapCd - dt); ui.setCooldown("slap", slapCd / 0.8); }
    if (hornCd > 0) hornCd -= dt;
    if (hintT > 0) hintT -= dt;
    refreshAim();
    updatePrompt();
    musicTick(dt);
    // the searchlights hum as they come near
    humT -= dt;
    if (humT <= 0) {
      humT = 0.25;
      let d = 99;
      for (let i = 0; i < 2; i++) { const L = base.lights[i]; if (L.on && !L.blinded) d = Math.min(d, dist2(px, pz, L.x, L.z)); }
      A("searchlightHum", clamp(1 - (d - 3) / 12, 0, 1));
    }
    if (stealth()) {
      ui.setSeen(combat.seen, combat.alertState);
      if (alarmOn) {
        // a safety net for "allClear": nobody has known where you are for a while
        alarmQuiet = combat.alerted > 0 ? 0 : alarmQuiet + dt;
        if (alarmQuiet > 9) clearAlarm();
      } else if (!spottedHint && combat.alertState === "suspicious" && combat.seen > 0.5) { spottedHint = true; hint("Someone is looking your way. Stop, sneak, get out of sight.", 3.5); }
    }
    if (step === "fence") {
      if (pz > 9.3 && Math.abs(px - B.cp1.x) < 4) reachYard();
    } else if (step === "yard") {
      if (!barracks && !sn && (player.speed || 0) > 1.9 && px < -21.6 && pz > 19.5 && pz < 40.5) {
        barracks = true;
        sp("soldier", -28.4, 23, { yaw: PI / 2, squad: 1, alert: true });
        sp("soldier", -28.4, 37, { yaw: PI / 2, squad: 1, alert: true });
        A("guardVoice", "huh", panOf(-28, 30), 0.3);
        hint("You woke the barracks! Sneak past the huts.", 3.5);
      }
      if (base.lever.pulled && pz > 45.3 && Math.abs(px) < 3.6) reachApron();
    } else if (step === "apron") updateApron(dt);
    else if (step === "door") updateDoor(dt);
    else if (step === "armoury") {
      // not without the gear
      if (player.x > -25.25 && player.z > 78.5 && player.z < 81.5) {
        player.x = -25.25;
        clampHintT -= dt;
        if (clampHintT <= 0) { clampHintT = 3; hint("Not yet. Take everything on the racks first.", 2.4); }
      }
    } else if (step === "fightout" || step === "fuel" || step === "gate") updateFightout();
    updateMarks();
  }

  function update(dt, time) {
    if (step === "boot") return;
    tribe.update(dt, time);
    combat.update(dt, time);
    if (step === "home") { if (!cinema.playing && player.enabled) updateHome(dt); return; }
    if (!playing() || !inBase() || checkpoint.respawning) return;
    updateBase(dt);
  }

  // =====================================================================================================
  // level interface
  // =====================================================================================================
  function enter() {
    hardStop();
    risen = false;
    campIntroSetup();
    step = "intro";
  }
  function exit() {
    hardStop();
    risen = false;
    cinema.eye.clear();
    tribe.enemies = null;
    tribe.village.clear();
    try { base.reset(); } catch (e) { /* nothing to undo */ }
    try { jungle.reset(); } catch (e) { /* nothing to undo */ }
    step = "boot";
  }
  function win() {
    if (step === "done" || step === "boot") return;
    hardStop();
    step = "done";
    ui.showComplete({ kicker: "LEVEL 10", title: "COMPLETE", sub: "" }, () => ctx.complete());
  }
  function skipTo(name) {
    if (step === "boot" || STEPS.indexOf(name) < 0) return false;
    risen = false;
    switch (name) {
      case "intro": startIntro(); break;
      case "fence": case "yard": case "apron": case "door": case "armoury": case "fightout": case "fuel": case "gate":
        jump(name); break;
      case "home": startHome(true); break;
      case "end": campScene(true); break;
      default: win();
    }
    return true;
  }

  return {
    build, enter, start, update, exit, onAction, skipTo, win,
    state() {
      const worn = [];
      if (gear && gear.worn) for (const k in gear.worn) if (gear.worn[k]) worn.push(gear.worn[k]);
      return {
        step, stage, checkpoint: checkpoint.id, hp: Math.round(health.hp || 0), squad: army.count, lost,
        alarm: !!(base && base.alarm), gear: worn, ammo: abilities.shoot.on ? (abilities.shoot.ammo === Infinity ? -1 : abilities.shoot.ammo) : 0,
        alive: combat ? combat.alive : 0, tries: checkpoint.tries || 0, deaths: checkpoint.deaths || 0, kills, slaps,
        ambushed, outside, fuelBlown, gateBlown, east: runEast, seen: combat ? combat.alertState : "hidden",
      };
    },
    STEPS,
  };
}
