// level9.js - LEVEL 9 "THE TRIBE" (LEVELS2.md Part C, level 9; STORY2.md level 9).
//
//   1  intro    the hidden camp at dusk, Moss at your side
//   2  meet     four introductions in any order: Old Burra, Tika, Rok (shove back!), Nib (hide and seek, twice)
//   3  food     the feast: three things to eat (hearts appear), Nib steals a berry, Burra points across the river
//   4  hunt     Rok leads six hunters over the log bridge                               checkpoint "bridge"
//   5  ambush   three Ash scouts burst out of the bushes: the first real fight          checkpoint "path"
//   6  rival    the Ash camp: gate, creek (one pulse) or the red totem; three food bundles; the chief
//                                                                                        checkpoint "hoard"
//   7  home     back over the river, Nib rides on your back, the camp cheers             checkpoint "home"
//   8  gather   4 leaves (jump / slap them down), 2 vines (the second needs Moss), 2 bones (slap the sand; a crab)
//   9  craft    lay the pieces on the frame, three lacing pulls, wear the leaf armor     checkpoint "armor"
//  10  night    the dance round the fire (jump on the beat), then to bed
//  11  vision   the dream: 5 DAYS. Pip in the cell over the lava.
//  12  wake     first light. "Five days."  LEVEL 9 COMPLETE
//
// How the script is organised (as level 5): every beat has a STARTER (startMeet, startFood ...) that first
// calls hardStop() - everything back to nothing behind black - then stages the world exactly as a playthrough
// would have it and calls the beat's begin function. The story itself flows from begin to begin without a
// cut. skipTo(name) calls the starter; a checkpoint's restore() re-stages only what a death can have changed.
import { createJungle } from "../jungle.js";
import { createTribe } from "../tribe.js";
import { createCombat } from "../combat.js";
import { createLair } from "../lair.js";
import { createFriend } from "../friend.js";

export const meta = { n: 9, title: "THE TRIBE" };

const STEPS = ["intro", "meet", "food", "hunt", "ambush", "rival", "home", "gather", "craft", "night", "sleep", "vision", "wake", "done"];
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);
const WAR_PAINT = 0xf2efe6;
const NEED = { leaf: 4, vine: 2, bone: 2 };
const KIND_LABEL = { leaf: "leaf", vine: "vine", bone: "bone" };

export function createLevel(ctx) {
  const { THREE, player, platypus, ui, cinema, audio, fx } = ctx;
  const music = ctx.music;

  // guarded calls into the audio / fx / music modules: a missing sound must never stop the story
  function A(name, a, b, c, d) { const f = audio[name]; return typeof f === "function" ? f.call(audio, a, b, c, d) : undefined; }
  function FX(name, a, b, c, d, e, g) { const f = fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e, g) : undefined; }
  function MU(name, a, b) { const f = music && music[name]; return typeof f === "function" ? f.call(music, a, b) : undefined; }

  let jungle = null, tribe = null, combat = null, lair = null, friend = null;
  let P = null, L = null, MB = null; // jungle points, lair points, tribe members
  let step = "boot";
  let gen = 0;       // bumped by hardStop(): callbacks that outlive their beat compare it and do nothing
  let inLair = false;

  // ---- scratch (nothing below allocates per frame) ----
  const v1 = new THREE.Vector3();
  const scr = { x: 0, y: 0, visible: false };
  const pt = { x: 0, y: 0, z: 0 };
  const hurtSrc = { x: 0, z: 0, kind: "melee", knock: 4 };
  const zoneSpec = { shape: "circle", x: 0, z: 0, r: 1.25, yaw: 0, arc: 0, len: 0, width: 0, seconds: 0.75, colorHex: 0xff3020 };
  const benchCol = { x: 0, z: 0, r: 0.62, on: false };
  // the directed shots are composed for 16:9; on a tall screen the vertical field of view opens up
  function F(v) {
    const a = ctx.camera.aspect || 1.78;
    if (a >= 1.3) return v;
    return Math.min(80, (2 * Math.atan((Math.tan((v * PI) / 360) * 1.3) / a) * 180) / PI);
  }

  // =====================================================================================================
  // state
  // =====================================================================================================
  const st = { met: 0, food: 0, bundles: 0, leaf: 0, vine: 0, bone: 0, pulls: 0, armor: false, helm: false, rivalsDown: 0, beats: 0 };
  let actKey = null;                  // the contextual prompt that is showing
  let stingCd = 0, slapCd = 0, pulseCd = 0, shownSting = -1, shownSlap = -1, shownPulse = -1;
  let fightOn = false;                // sting / slap / pulse all live (hunt ... home)
  let sndT = 0, chatter = 0, fireSnd = 0, ringT = 0;
  // the goal marker (a beacon + a pulsing ground ring) and a breadcrumb trail of points
  const goal = { on: false, x: 0, y: 0, z: 0, color: 0xffe08a };
  let goalH = null;
  const marks = [];                   // extra beacons: { key, h }
  let trail = null, trailI = 0, trailDone = null;
  // ---- meet ----
  const met = { burra: false, tika: false, rok: false, nib: false };
  let meetBusy = 0, kneeling = false, rokShove = 0, rokHintT = 0, markMoveT = 0;
  const nibG = { on: false, round: 0, spot: -1, hidden: false, t: 0 };
  let nibSpots = null;
  // ---- food ----
  const served = [false, false, false];
  let serveT = 0, serving = -1, eating = false, nibSteal = 0, foodTalk = false;
  // ---- hunt / ambush ----
  let huntLeg = 0, rokLead = null, rokLeadDelay = 0, ambushT = 0, ambushEnd = false;
  // ---- the rival camp ----
  const sentries = [], insiders = [], drinkers = [];
  const bundleDone = [false, false, false];
  let carrying = -1, carryT = 0, chief = null, chiefOut = false, chiefBeaten = false, campAlarm = false, drinkersAwake = false;
  let govT = 0, distractT = 0, hintPulse = false, hintTotem = false, hintCarry = false, rivalEnd = false, intenT = 0;
  // ---- home ----
  let nibRide = 0, homeDone = false;
  // ---- gather ----
  const vineS = [0, 0], boneS = [0, 0], boneId = [-1, -1];   // 0 untouched, 1 in progress / popped, 2 collected
  let pullT = -1, pullI = -1, pullWithMoss = false, needMoss = 0, mossT = 0, hintLeaf = false, hintBone = false, hintCrab = false;
  let idleT = 0, pingShow = 0, gatherDone = false, areaCp = "";
  const crab = { g: null, on: false, x: 0, z: 0, hx: 0, hz: 0, yaw: 0, state: "guard", t: 0, zone: undefined };
  const berry = { state: 0, x: 0, z: 0 };   // 0 lying, 1 carried, 2 tossed, 3 gone
  // ---- craft ----
  let craftPhase = 0, placeCd = 0, sweepT = 0, slips = 0, pullCd = 0, zoneShown = -1, rokTest = 0;
  // ---- night ----
  let nightPhase = 0, danceT = 0, sleepSeq = false;
  // ---- vision ----
  let tickT = -1, tickN = 0;

  // =====================================================================================================
  // small helpers
  // =====================================================================================================
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const near = (o, r) => Math.hypot(player.x - o.x, player.z - o.z) <= r;
  const yawTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
  const after = (name) => STEPS.indexOf(step) > STEPS.indexOf(name);
  function groundY(x, z) { const h = jungle.heightAt(x, z), w = jungle.waterAt(x, z) - 0.1; return w > h ? w : h; }
  const groundWater = (x, z) => { const w = jungle.waterAt(x, z); return w > -1e6 ? w : null; };
  function floatAtPlayer(text, kind) {
    ctx.project(platypus.group, scr, 0.55);
    if (scr.visible) ui.floatText(text, scr.x, scr.y, kind || "plain");
  }
  function setAct(key, label) {
    if (key === actKey) return;
    actKey = key;
    ui.setAction(key ? label : null);
  }
  // a tribe member speaks: the chirp is the voice, the caption is what the platypus understands
  function say(m, text, dur) {
    if (m && typeof m.emote === "function" && !m.busy) m.emote("chirp");
    cinema.caption("[" + text + "]", dur || Math.max(2.6, 1.2 + text.length * 0.06), { who: m && m.name ? m.name : m || "" });
  }
  function keyHint(keys, touch) { return ctx.touch ? touch : keys; }

  // ---- markers ----
  function setGoal(p, color) {
    if (!p) { goal.on = false; if (goalH) { goalH.remove(); goalH = null; } return; }
    goal.x = p.x; goal.z = p.z; goal.y = typeof p.y === "number" ? p.y : groundY(p.x, p.z); goal.color = color || 0xffe08a;
    goal.on = true;
    if (goalH) goalH.remove();
    goalH = FX("beacon", goal.x, goal.y, goal.z, goal.color) || null;
    ringT = 0;
  }
  function addMark(key, x, z, color, y) {
    dropMark(key);
    const h = FX("beacon", x, typeof y === "number" ? y : groundY(x, z), z, color || 0xffe08a) || null;
    marks.push({ key, h });
  }
  function moveMark(key, x, z) {
    for (let i = 0; i < marks.length; i++) if (marks[i].key === key && marks[i].h && marks[i].h.set) marks[i].h.set(x, groundY(x, z), z);
  }
  function dropMark(key) {
    for (let i = marks.length - 1; i >= 0; i--) if (marks[i].key === key) { if (marks[i].h) marks[i].h.remove(); marks.splice(i, 1); }
  }
  function dropMarks() {
    for (let i = 0; i < marks.length; i++) if (marks[i].h) marks[i].h.remove();
    marks.length = 0;
    setGoal(null);
    trail = null; trailDone = null;
  }
  // walk the player along a list of points: the marker sits on the next one
  function setTrail(list, done) {
    trail = list; trailI = 0; trailDone = done || null;
    if (list && list.length) setGoal(list[0]);
  }
  function tickTrail() {
    if (!trail) return;
    // any later point reached counts (a player who cuts a corner is never sent back)
    for (let i = trail.length - 1; i >= trailI; i--) {
      if (near(trail[i], i === trail.length - 1 ? 2.6 : 3.6)) {
        trailI = i + 1;
        if (trailI >= trail.length) { const f = trailDone; trail = null; trailDone = null; setGoal(null); if (f) f(); }
        else setGoal(trail[trailI]);
        return;
      }
    }
  }

  // =====================================================================================================
  // build
  // =====================================================================================================
  function buildCrab() {
    const pos = [], nor = [], col = [];
    const c = new THREE.Color();
    function part(geo, hex, sx, sy, sz, x, y, z, rz) {
      const g = geo.toNonIndexed();
      g.scale(sx, sy, sz);
      if (rz) g.rotateZ(rz);
      g.translate(x, y, z);
      g.computeVertexNormals();
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      c.setHex(hex);
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(c.r, c.g, c.b); }
      g.dispose(); geo.dispose();
    }
    part(new THREE.SphereGeometry(0.16, 12, 8), 0xc4502c, 1.35, 0.5, 1, 0, 0.11, 0);
    part(new THREE.SphereGeometry(0.075, 8, 6), 0xd9623a, 1, 0.75, 1.5, 0.22, 0.12, 0.17);
    part(new THREE.SphereGeometry(0.075, 8, 6), 0xd9623a, 1, 0.75, 1.5, -0.22, 0.12, 0.17);
    for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 3; k++) part(new THREE.CylinderGeometry(0.012, 0.009, 0.22, 4), 0x9c3c20, 1, 1, 1, s * 0.24, 0.06, -0.09 + k * 0.08, s * 1.05);
    part(new THREE.SphereGeometry(0.024, 6, 5), 0x15110f, 1, 1, 1, 0.06, 0.21, 0.11);
    part(new THREE.SphereGeometry(0.024, 6, 5), 0x15110f, 1, 1, 1, -0.06, 0.21, 0.11);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0 }));
    mesh.castShadow = false;
    const g = new THREE.Group();
    g.name = "level9-crab";
    g.rotation.order = "YXZ";
    g.add(mesh);
    g.visible = false;
    crab.g = g;
  }

  function build() {
    jungle = ctx.shared("jungle", () => createJungle(ctx));
    tribe = ctx.shared("tribe", () => createTribe(ctx));
    combat = ctx.shared("combat", () => createCombat(ctx));
    lair = ctx.shared("lair", () => createLair(ctx));
    friend = ctx.shared("friend", () => createFriend(ctx));
    P = jungle.P; L = lair.P; MB = tribe.members;
    if (typeof tribe.warm === "function") tribe.warm();
    buildCrab();
    benchCol.x = P.bench.x; benchCol.z = P.bench.z;
    // three hiding places for Nib: behind a totem, by the food store, by the burrows
    nibSpots = [
      { x: P.totems[3].x + 0.9, z: P.totems[3].z + 1.2, yaw: 2.2 },
      { x: P.foodStore.x + 1.6, z: P.foodStore.z + 1.7, yaw: -2.4 },
      { x: P.burrows[4].x + 0.4, z: P.burrows[4].z - 1.9, yaw: 3.0 },
    ];
    if (ctx.debug) ctx.debug.level9 = { jungle, tribe, combat, lair, friend, st, crab };
  }

  // =====================================================================================================
  // hardStop and the staging helpers
  // =====================================================================================================
  // Everything back to nothing, behind black. Every starter begins here.
  function hardStop() {
    gen++;
    cinema.reset();
    cinema.eye.clear();
    cinema.tint(null);
    cinema.fade("black", 0);
    ctx.clearTimers();
    ctx.setTimeScale(1, 0);
    ui.clearSpeech();
    ui.showHud(false);
    ui.setObjective(null); ui.setAction(null); actKey = null;
    ui.setCharge(null); ui.setPing(null);
    ctx.setSpeaker(null);
    ctx.abilities.cancel();
    ctx.abilities.buttons({});
    ctx.army.show(false);
    A("tribeDrums", false); A("tribeChatter", 0); A("fire", 0); A("jungleAmbience", false); A("river", 0); A("lavaRumble", 0);
    chatter = 0; fireSnd = 0;
    dropMarks();
    // shared actors
    combat.reset();
    combat.frozen = false;
    combat.allyDamage = 5; combat.allyRate = 1.8; combat.rivalDamage = 1; combat.aimScale = 1; combat.damageScale = 1;
    tribe.reset();
    if (MB.nib && typeof MB.nib.attachTo === "function") MB.nib.attachTo(null);
    friend.reset();
    friend.group.scale.set(1, 1, 1);
    platypus.reset();
    platypus.pose(null);
    platypus.setCarry(false);
    platypus.sleep(false);
    crab.on = false; if (crab.g) crab.g.visible = false; crab.zone = undefined;
    benchCol.on = false;
    // the player
    player.scripted = false; player.hidden = false; player.enabled = false; player.carrying = false;
    player.maxSpeed = 3; player.lock = 0; player.face = null; player.canJump = player.canDive = true;
    player.swimming = player.diving = false; player.pitch = player.roll = 0; player.speed = 0; player.vy = 0; player.grounded = true;
    player.kx = player.kz = 0;
    player.stop();
    // flags of every beat
    fightOn = false; stingCd = slapCd = pulseCd = 0;
    meetBusy = 0; kneeling = false; rokShove = 0; nibG.on = false; nibG.hidden = false; nibG.round = 0;
    serving = -1; eating = false; nibSteal = 0; foodTalk = false; served[0] = served[1] = served[2] = false;
    huntLeg = 0; rokLead = null; ambushEnd = false;
    sentries.length = insiders.length = drinkers.length = 0;
    carrying = -1; chief = null; chiefOut = false; campAlarm = false; drinkersAwake = false; distractT = 0; rivalEnd = false;
    nibRide = 0; homeDone = false;
    pullT = -1; needMoss = 0; pingShow = 0; idleT = 0; gatherDone = false; areaCp = "";
    craftPhase = 0; rokTest = 0; zoneShown = -1;
    nightPhase = 0; sleepSeq = false;
    tickT = -1; tickN = 0;
  }

  // what a playthrough has earned by the time `name` begins
  function presetFor(name) {
    const i = STEPS.indexOf(name);
    const past = (s) => i > STEPS.indexOf(s);
    st.met = past("meet") ? 4 : 0;
    met.burra = met.tika = met.rok = met.nib = past("meet");
    st.food = past("food") ? 3 : 0;
    st.bundles = past("rival") ? 3 : 0;
    bundleDone[0] = bundleDone[1] = bundleDone[2] = past("rival");
    chiefBeaten = past("rival");
    st.rivalsDown = past("rival") ? 14 : past("ambush") ? 3 : 0;
    st.leaf = past("gather") ? NEED.leaf : 0; st.vine = past("gather") ? NEED.vine : 0; st.bone = past("gather") ? NEED.bone : 0;
    vineS[0] = vineS[1] = boneS[0] = boneS[1] = past("gather") ? 2 : 0;
    boneId[0] = boneId[1] = -1;
    st.pulls = past("craft") ? 3 : 0;
    st.armor = past("craft");
    if (!past("craft")) st.helm = false;
    st.beats = 0;
    slips = 0;
    hintPulse = hintTotem = hintCarry = hintLeaf = hintBone = hintCrab = false;
    berry.state = 0;
    // gear and health exactly as they would be
    ctx.gear.clear();
    if (st.armor) ctx.gear.wear("body", "leaf", { armor: 0.3 });
    if (st.helm) ctx.gear.wear("head", "boneHelm", { armor: 0.05 });
    if (past("food")) { if (!ctx.health.on) hearts(); ctx.health.set(5); } else ctx.health.disable();
    ctx.checkpoint.clear();
  }
  function hearts() { ctx.health.enable({ max: 5, hearts: true, regen: 0.2, regenDelay: 5 }); }

  function ambience(time) {
    A("jungleAmbience", true, time === "night" ? "night" : time === "dawn" ? "dawn" : "day");
    sndT = 0;
  }
  function toJungle(time) {
    jungle.reset();
    jungle.curtain.open();
    ctx.setWorld(jungle);
    jungle.group.add(tribe.group, combat.group, crab.g);
    tribe.setWorld(jungle);
    combat.setWorld(jungle);
    tribe.enemies = combat.enemies;
    jungle.setTime(time, 0);
    FX("setGround", jungle.heightAt, groundWater);
    inLair = false;
    ambience(time);
  }
  function toLair() {
    ctx.setWorld(lair);
    lair.reset();
    friend.setWorld(lair);
    FX("setGround", null, null);
    inLair = true;
    friend.attachTo(lair.cell.floor);
  }

  // the camp and its five named members, placed for a beat
  function stageCamp(mode) {
    const V = tribe.village;
    V.populate(P.spots);
    V.fire = P.fire; V.burrows = P.burrows;
    tribe.bench.reset();
    tribe.bench.place(P.bench.x, P.bench.z, P.bench.yaw);
    benchCol.on = true;
    const tx = P.bench.x + 1.15, tz = P.bench.z + 0.1;
    MB.burra.place(P.elder.x, P.elder.z, P.elder.yaw); MB.burra.do("sit");
    MB.tika.place(tx, tz, yawTo(tx, tz, P.bench.x, P.bench.z)); MB.tika.do("craft", { yaw: yawTo(tx, tz, P.bench.x, P.bench.z) });
    MB.nib.place(P.fire.x - 3.8, P.fire.z - 2.8, 1); MB.nib.do("wander", { center: { x: P.fire.x - 3.4, z: P.fire.z - 2.4 }, radius: 2.6 });
    const away = mode === "away";
    if (!away) {
      MB.rok.place(P.fire.x + 2.6, P.fire.z - 1.9, -1.2); MB.rok.do("guard", { yaw: -2.2 });
    }
    if (mode === "war" || away) V.setMood("war", 0);
    else if (mode === "sleep") { V.setMood("sleep", 0); jungle.fires[0].set(0.22); }
    else if (mode === "night") V.setMood("cheer", 0);
    chatter = mode === "sleep" ? 0.08 : mode === "war" || away ? 0.3 : 0.6;
    fireSnd = mode === "sleep" ? 0.3 : 0.75;
  }
  function mossBeside(x, z, yaw) {
    MB.moss.place(x + Math.cos(yaw) * 0.9, z - Math.sin(yaw) * 0.9, yaw);
    MB.moss.do("follow");
  }
  // the hunting party round a point: four painted hunters in the crowd, Moss and (optionally) Rok as named heroes
  function stageHunters(x, z, withRok) {
    for (let i = 0; i < 4; i++) {
      const a = i * 1.57 + 0.6;
      combat.addAlly(x + Math.sin(a) * 1.5, z + Math.cos(a) * 1.5, { look: i * 3 + 1, paint: WAR_PAINT, hp: 150 });
    }
    MB.moss.place(x - 0.9, z - 0.8, 0);
    combat.addAlly(MB.moss.x, MB.moss.z, { hero: MB.moss, hp: 150 });
    MB.rok.place(x + 1.0, z + 0.9, 0);
    if (withRok) combat.addAlly(MB.rok.x, MB.rok.z, { hero: MB.rok, hp: 200 });
    else { ctx.army.add(MB.rok); MB.rok.do("idle"); }
    combat.order("follow");
    ctx.army.show("Hunters");
  }
  // Rok joins the fight as a combat hero (he was only leading until now)
  function rokFights() {
    for (let i = 0; i < combat.allies.length; i++) if (combat.allies[i].hero === MB.rok) return;
    ctx.army.remove(MB.rok);
    combat.addAlly(MB.rok.x, MB.rok.z, { hero: MB.rok, hp: 200 });
    rokLead = null;
  }
  function healParty() {
    for (let i = 0; i < combat.allies.length; i++) { const a = combat.allies[i]; a.hp = a.maxHp; }
    if (MB.rok.hurt) MB.rok.heal();
    if (MB.moss.hurt) MB.moss.heal();
  }
  function fightButtons() {
    ctx.abilities.buttons({ sting: true, slap: true, zap: true, jump: true });
    fightOn = true;
  }
  function campButtons() {
    ctx.abilities.buttons({ slap: true, jump: true });
    fightOn = false;
  }
  function reach(id, at, label) {
    ctx.checkpoint.set(id, { x: at.x, z: at.z, yaw: at.yaw || 0, label: label || "Checkpoint", restore: restoreCp });
  }
  function quietCp(id, at) {
    ctx.checkpoint.set(id, { x: at.x, z: at.z, yaw: at.yaw || 0, silent: true, restore: restoreCp });
  }

  // =====================================================================================================
  // 1 - intro
  // =====================================================================================================
  function stageMeet() {
    stageCamp("meet");
    player.teleport(P.campGate.x, P.campGate.z, P.campGate.yaw);
    mossBeside(P.campGate.x, P.campGate.z, P.campGate.yaw);
    MU("play", "tribe", { intensity: 0.5 });
    quietCp("camp", P.campGate);
  }
  function startIntro() {
    hardStop();
    presetFor("meet");
    toJungle("dusk");
    stageMeet();
    step = "intro";
    start();
  }
  function start() {
    const g = gen;
    cinema.titleCard({ kicker: "LEVEL 9", title: meta.title }, () => {
      if (g !== gen || step !== "intro") return;
      const c = P.camCampReveal, f = P.fire;
      cinema.play([
        // the crane over the root arch: the whole camp in the last light
        { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: [c.look.x, c.look.y, c.look.z], fov: F(46),
          to: { pos: [c.pos.x - 3.5, c.pos.y - 3.2, c.pos.z + 5], look: [f.x, f.y + 0.6, f.z] }, dur: 7.5, ease: "inOut" }, hold: false },
        { fade: "clear", dur: 1.6 },
        { wait: 1.2 },
        { caption: "The hidden camp of the river tribe.", dur: 3.6, narr: true },
        { wait: 0.9 },
        // down at the gate: you, and Moss who found you
        { shot: { pos: [player.x - 2.4, player.y + 0.85, player.z - 2.6], look: platypus.group, lookY: 0.25, fov: F(36),
          to: { pos: [player.x - 1.6, player.y + 0.7, player.z - 2.9] }, dur: 4.6, ease: "out" }, hold: false },
        { wait: 0.5 },
        { call: () => { MB.moss.emote("call"); } },
        { caption: "[Come! Come and meet everyone!]", dur: 3.4, who: "Moss" },
        { wait: 0.4 },
      ], { skippable: true, onDone: () => { if (g === gen) beginMeet(); } });
    });
  }

  // =====================================================================================================
  // 2 - introductions
  // =====================================================================================================
  function startMeet() {
    hardStop();
    presetFor("meet");
    toJungle("dusk");
    stageMeet();
    cinema.fade("clear", 0.9);
    beginMeet();
  }
  function meetObjective() { ui.setObjective("Meet the tribe  " + st.met + "/4", keyHint("walk up, press E", "walk up, tap Greet")); }
  function beginMeet() {
    step = "meet";
    ui.showHud(true);
    campButtons();
    meetObjective();
    player.enabled = true;
    MB.moss.do("follow");
    if (!met.burra) addMark("burra", MB.burra.x, MB.burra.z, 0xffe08a);
    if (!met.tika) addMark("tika", MB.tika.x, MB.tika.z, 0xffe08a);
    if (!met.rok) addMark("rok", MB.rok.x, MB.rok.z, 0xffe08a);
    if (!met.nib) addMark("nib", MB.nib.x, MB.nib.z, 0xffe08a);
    markMoveT = 0;
  }
  function metOne(k) {
    if (met[k]) return;
    met[k] = true;
    st.met++;
    dropMark(k);
    A("objective");
    floatAtPlayer("friend!", "heart");
    MU("setIntensity", 0.5 + 0.12 * st.met, 2);
    if (!MB.moss.busy) MB.moss.emote("happy");
    meetObjective();
    if (st.met >= 4) {
      const g = gen;
      ui.objectiveDone();
      setAct(null);
      ctx.after(2.4, () => { if (g === gen && step === "meet") beginFood(); });
    }
  }
  function greet(k) {
    const m = MB[k], g = gen;
    setAct(null);
    player.face = yawTo(player.x, player.z, m.x, m.z);
    if (k === "burra") {
      // you bow before the elder; he touches your brow
      meetBusy = 4.2; kneeling = true;
      player.lock = 4.2;
      platypus.pose("kneel");
      m.emote("bow");
      A("nuzzle");
      ctx.after(1.0, () => { if (g === gen) say(m, "You came from the sky. You are welcome here.", 3.6); });
      ctx.after(3.9, () => { if (g === gen && step === "meet") metOne("burra"); });
    } else if (k === "tika") {
      // she holds the half-made armor up against you ... and it is far too small
      meetBusy = 3.6;
      player.lock = 2.2;
      m.emote("curious");
      FX("leaves", P.bench.x, P.bench.y + 0.7, P.bench.z, 5, 0x4f9a3a);
      A("craft", "weave");
      ctx.after(1.3, () => {
        if (g !== gen) return;
        A("craft", "slip");
        FX("leaves", P.bench.x, P.bench.y + 0.5, P.bench.z, 8, 0x4f9a3a);
        say(m, "Too small. Later.", 3);
      });
      ctx.after(3.3, () => { if (g === gen && step === "meet") { metOne("tika"); m.do("craft", { yaw: m.yaw }); } });
    } else if (k === "rok") {
      // he looks you over ... and shoves you
      meetBusy = 1.5;
      player.lock = 0.9;
      m.emote("sniff");
      ctx.after(0.9, () => {
        if (g !== gen || step !== "meet") return;
        const dx = player.x - m.x, dz = player.z - m.z, d = Math.hypot(dx, dz) || 1;
        player.kx += (dx / d) * 5.5; player.kz += (dz / d) * 5.5;
        platypus.hurt();
        A("punch");
        v1.set(player.x, player.y + 0.25, player.z);
        FX("hitBurst", v1, 0xfff0c8);
        m.emote("war");
        rokShove = 1; rokHintT = 0;
        ui.hint(keyHint("Shove back! Tail Slap him (L)", "Shove back! Tap Slap"), 3.2);
      });
    } else if (k === "nib") {
      meetBusy = 1.6;
      m.emote("happy");
      say(m, "Hide and seek! Find me!", 2.8);
      nibG.on = true; nibG.round = 0; nibG.spot = -1;
      ctx.after(1.5, () => { if (g === gen && step === "meet") hideNib(); });
    }
  }
  function hideNib() {
    let s = Math.floor(Math.random() * 3);
    if (s === nibG.spot) s = (s + 1) % 3;
    nibG.spot = s; nibG.hidden = false; nibG.t = 0;
    MB.nib.do("hide", { spot: nibSpots[s] });
    dropMark("nib");
    ui.hint("Listen for the giggle...", 2.6);
  }
  function rokLaughs() {
    rokShove = 2;
    const m = MB.rok;
    m.emote("happy");
    A("tribeChirp", "giggle", 1, 0, 0.8);
    v1.set(m.x, m.y + 0.3, m.z);
    FX("hitBurst", v1, 0xfff0c8);
    say(m, "Good.", 2.4);
    const g = gen;
    ctx.after(1.4, () => { if (g === gen && step === "meet") metOne("rok"); });
  }
  function updateMeet(dt) {
    if (kneeling && meetBusy < 0.7) { kneeling = false; platypus.pose(null); }
    // the markers follow the ones who move
    markMoveT -= dt;
    if (markMoveT <= 0) {
      markMoveT = 0.4;
      if (!met.rok) moveMark("rok", MB.rok.x, MB.rok.z);
      if (!met.nib && !nibG.on) moveMark("nib", MB.nib.x, MB.nib.z);
    }
    if (rokShove === 1) {
      rokHintT += dt;
      if (rokHintT > 9) { rokHintT = 0; ui.hint(keyHint("Tail Slap Rok! (L)", "Tap Slap next to Rok"), 2.6); }
    }
    // hide and seek: the giggle is the clue, the arc at the screen edge the subtle aid
    if (nibG.on && !met.nib) {
      const n = MB.nib;
      nibG.t += dt;
      if (!nibG.hidden && nibG.t > 9) nibG.hidden = true;           // however he got there, he is hiding now
      if (nibG.hidden) ui.setPing(ctx.bearing(n.x, n.z), clamp(1.1 - dist2(player.x, player.z, n.x, n.z) / 26, 0.25, 1), "sound");
    }
    if (meetBusy > 0) { meetBusy -= dt; setAct(null); return; }
    if (st.met >= 4) { setAct(null); return; }
    if (nibG.on && !met.nib && nibG.hidden && near(MB.nib, 1.9)) { setAct("nibFound", "Found you!"); return; }
    if (!met.burra && near(MB.burra, 2.7)) setAct("burra", "Greet Old Burra");
    else if (!met.tika && near(MB.tika, 2.3)) setAct("tika", "Greet Tika");
    else if (!met.rok && rokShove === 0 && near(MB.rok, 2.3)) setAct("rok", "Greet Rok");
    else if (!met.nib && !nibG.on && near(MB.nib, 2.3)) setAct("nib", "Greet Nib");
    else setAct(null);
  }

  // =====================================================================================================
  // 3 - food
  // =====================================================================================================
  function placeFeast() {
    // the last of the store, a little way out toward the fire
    const s = P.foodStore, dx = P.fire.x - s.x, dz = P.fire.z - s.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
    const F0 = tribe.food;
    F0.clear();
    F0.place(0, s.x + ux * 2.0, s.z + uz * 2.0, "crayfish");
    F0.place(1, s.x + ux * 2.3 - uz * 0.6, s.z + uz * 2.3 + ux * 0.6, "grub");
    F0.place(2, s.x + ux * 2.3 + uz * 0.6, s.z + uz * 2.3 - ux * 0.6, "berries");
    F0.place(3, s.x + ux * 2.8, s.z + uz * 2.8, "berries");
  }
  function startFood() {
    hardStop();
    presetFor("food");
    toJungle("dusk");
    stageCamp("meet");
    player.teleport(P.seat.x, P.seat.z, P.seat.yaw);
    mossBeside(P.seat.x, P.seat.z, P.seat.yaw);
    MB.nib.do("follow", { dist: 2.2, side: -1 });
    MU("play", "tribe", { intensity: 1 });
    quietCp("camp", P.campGate);
    cinema.fade("clear", 0.9);
    beginFood();
  }
  function foodObjective() { ui.setObjective("Eat with the tribe  " + st.food + "/3", keyHint("E to eat", "tap Eat")); }
  function beginFood() {
    step = "food";
    ui.showHud(true);
    campButtons();
    player.enabled = true;
    ui.setPing(null);
    dropMarks();
    foodObjective();
    // Burra thumps his tail: the feast
    MB.burra.emote("call");
    A("tailSlap");
    say(MB.burra, "Eat! You are thin as a reed.", 3.2);
    tribe.village.setMood("feast", 1.5);
    tribe.village.gather(P.fire.x, P.fire.z, 4.6);
    placeFeast();
    MB.nib.do("follow", { dist: 2.2, side: -1 });
    MB.moss.do("follow");
    serve(0);
  }
  function serve(i) {
    serving = i; serveT = 0;
    const who = i === 0 ? MB.rok : i === 1 ? MB.tika : MB.moss;
    who.do("feed", { food: i });
    if (i === 2) { nibSteal = 1; }
  }
  function onServed(i) {
    if (i < 0 || i > 2 || served[i]) return;
    served[i] = true;
    tribe.food.pos(i, pt);
    addMark("food", pt.x, pt.z, 0x9dff8a, pt.y);
    if (i === 0) ui.hint(keyHint("Rok brought you a crayfish. Press E to eat", "Rok brought you a crayfish. Tap Eat"), 3.2);
    if (i === 2 && nibSteal === 1) {
      // while you look at your berries, Nib goes for the other one
      nibSteal = 2;
      tribe.food.pos(3, pt);
      MB.nib.do("goto", { x: pt.x, z: pt.z, run: true });
    }
  }
  function eatFood(i) {
    if (eating) return;
    eating = true;
    setAct(null);
    dropMark("food");
    const g = gen;
    const d = platypus.eat() || 1.4;
    player.lock = d;
    A("eat");
    ctx.after(0.65, () => { if (g === gen) { tribe.food.eat(i); A("eatFruit"); } });
    ctx.after(d, () => {
      if (g !== gen || step !== "food") return;
      eating = false;
      st.food++;
      // the hearts appear for the first time, and fill as you eat
      if (!ctx.health.on) { hearts(); ctx.health.set(2); }
      ctx.health.set(Math.min(5, 2 + st.food));
      A("objective");
      floatAtPlayer("+1", "heart");
      foodObjective();
      if (st.food < 3) { const who = st.food === 1 ? MB.rok : MB.tika; who.do(st.food === 1 ? "guard" : "craft", st.food === 1 ? { yaw: who.yaw } : { yaw: who.yaw }); serve(st.food); }
      else { ui.objectiveDone(); ctx.after(1.6, () => { if (g === gen && step === "food") storeScene(); }); }
    });
  }
  function nibStole() {
    if (nibSteal !== 2) return;
    nibSteal = 3;
    MB.nib.eat();
    tribe.food.eat(3);
    A("tribeChirp", "giggle", 0.9, 0, 1.45);
    ui.hint("Nib stole a berry!", 2.2);
    const g = gen;
    ctx.after(1.6, () => { if (g === gen && (step === "food")) MB.nib.do("follow", { dist: 2.2, side: -1 }); });
  }
  // the store is nearly empty: Burra points across the river
  function storeScene() {
    if (foodTalk) return;
    foodTalk = true;
    const g = gen;
    setAct(null);
    ui.setObjective(null);
    const s = P.foodStore, e = P.camElder, b = MB.burra;
    cinema.play([
      { shot: { pos: [s.x - 2.6, s.y + 1.1, s.z + 2.4], look: [s.x, s.y + 0.5, s.z], fov: F(38), to: { pos: [s.x - 2.0, s.y + 0.9, s.z + 2.0] }, dur: 3.4, ease: "out" }, hold: false },
      { wait: 0.4 },
      { caption: "But the food store is almost empty.", dur: 3, narr: true },
      { call: () => { b.emote("call"); b.lookAt({ x: P.rival.x, z: P.rival.z }); MU("motif", "king", { gain: 0.7 }); jungle.setTime("night", 8); tribe.village.setMood("war", 3); } },
      { shot: { pos: [e.pos.x, e.pos.y, e.pos.z], look: [e.look.x, e.look.y, e.look.z], fov: F(34), to: { pos: [e.pos.x + 0.3, e.pos.y - 0.1, e.pos.z + 0.6] }, dur: 5.2, ease: "inOut" }, hold: false },
      { caption: "[The Ash tribe takes our food.]", dur: 2.8, who: "Old Burra" },
      { caption: "[Tonight we take it back.]", dur: 2.8, who: "Old Burra" },
      { call: () => { MB.rok.emote("war"); A("warCry"); } },
      { wait: 0.9 },
    ], { skippable: true, onDone: () => {
      if (g !== gen) return;
      b.lookAt(null);
      jungle.setTime("night", cinema.faded > 0.5 ? 0 : 6);
      beginHunt();
    } });
  }
  function updateFood(dt) {
    if (eating || foodTalk) { setAct(null); return; }
    // a dish that never arrives is simply there (a feeder stuck behind the crowd must not stall the feast)
    if (serving >= 0 && !served[serving]) {
      serveT += dt;
      if (serveT > 16) {
        const i = serving;
        MB[i === 0 ? "rok" : i === 1 ? "tika" : "moss"].do("idle");
        tribe.food.place(i, player.x + Math.sin(player.yaw) * 0.55, player.z + Math.cos(player.yaw) * 0.55, i === 0 ? "crayfish" : i === 1 ? "grub" : "berries");
        onServed(i);
      }
    }
    if (nibSteal === 2 && MB.nib.distTo(P.foodStore.x, P.foodStore.z) < 20) {
      tribe.food.pos(3, pt);
      if (MB.nib.distTo(pt.x, pt.z) < 0.7) nibStole();
    }
    const i = serving;
    if (i >= 0 && served[i] && tribe.food.active(i) && player.lock <= 0) {
      tribe.food.pos(i, pt);
      if (dist2(player.x, player.z, pt.x, pt.z) < 1.5) { setAct("eat", "Eat"); return; }
    }
    setAct(null);
  }

  // =====================================================================================================
  // 4 - the hunt
  // =====================================================================================================
  function startHunt() {
    hardStop();
    presetFor("hunt");
    toJungle("night");
    stageCamp("war");
    player.teleport(P.campEdge.x, P.campEdge.z, PI);
    MU("play", "tribe", { intensity: 0.6 });
    quietCp("camp", P.campEdge);
    cinema.fade("clear", 0.9);
    beginHunt();
  }
  function beginHunt() {
    step = "hunt";
    ui.showHud(true);
    player.enabled = true;
    setAct(null);
    dropMarks();
    tribe.food.clear();
    fightButtons();
    combat.reset();
    stageHunters(player.x, player.z, false);
    tribe.village.setMood("war", 2);
    tribe.village.disperse();
    MB.tika.do("craft", { yaw: MB.tika.yaw });
    MB.nib.do("wander", { center: { x: P.fire.x - 3.4, z: P.fire.z - 2.4 }, radius: 2.6 });
    chatter = 0.3;
    MU("play", "stealth", { intensity: 0.3 });
    ui.setObjective("Follow Rok to the Ash tribe");
    huntLeg = 1;
    rokLead = P.huntPath; rokLeadDelay = 0.3;
    setTrail(P.huntPath, atBridge);
    A("warCry");
  }
  function atBridge() {
    if (step !== "hunt" || huntLeg !== 1) return;
    huntLeg = 2;
    reach("bridge", P.logBridge[0], "The log bridge");
    healParty();
    say(MB.rok, "Stay close. We fight what you fight.", 3.4);
    ui.hint("Your hunters follow you and fight what you fight.", 3.6);
    rokLead = [P.logBridge[1], P.rivalPath[0]]; rokLeadDelay = 0.2;
    ui.setObjective("Cross the log and follow the path");
    setTrail([P.logBridge[1], P.rivalPath[0], P.ambush[0]], null);
  }
  function restoreBridge() {
    combat.reset();
    tribe.food.clear();
    stageHunters(P.logBridge[0].x - 1.2, P.logBridge[0].z - 1.6, false);
    step = "hunt"; huntLeg = 2; ambushEnd = false;
    rokLead = [P.logBridge[1], P.rivalPath[0]]; rokLeadDelay = 0.3;
    fightButtons();
    MU("play", "stealth", { intensity: 0.3 });
    ui.setObjective("Cross the log and follow the path");
    setTrail([P.logBridge[1], P.rivalPath[0], P.ambush[0]], null);
  }
  function updateHunt(dt) {
    // Rok runs ahead point by point (set a moment after the squad is made, so combat's own "follow" does not win)
    if (rokLead) {
      rokLeadDelay -= dt;
      if (rokLeadDelay <= 0) { MB.rok.do("lead", { route: rokLead, waitDist: 7, run: true }); rokLead = null; }
    }
    // the bushes on the far bank
    for (let i = 0; i < 3; i++) if (near(P.ambush[i], i === 0 ? 5.5 : 4.5)) { beginAmbush(); return; }
    if (huntLeg === 1 && near(P.logBridge[0], 2.6)) atBridge();
  }

  // =====================================================================================================
  // 5 - the ambush
  // =====================================================================================================
  function startAmbush() {
    hardStop();
    presetFor("ambush");
    toJungle("night");
    stageCamp("away");
    player.teleport(P.rivalPath[0].x, P.rivalPath[0].z, yawTo(P.rivalPath[0].x, P.rivalPath[0].z, P.ambush[0].x, P.ambush[0].z));
    stageHunters(player.x - 1.5, player.z - 1.5, false);
    quietCp("bridge", P.logBridge[0]);
    cinema.fade("clear", 0.9);
    ui.showHud(true);
    player.enabled = true;
    fightButtons();
    beginAmbush();
  }
  function beginAmbush() {
    if (step === "ambush") return;
    step = "ambush";
    trail = null; setGoal(null);
    ambushT = 0; ambushEnd = false;
    rokFights();
    combat.allyDamage = 0.01;        // for five seconds the hunters only harry: the first blows are yours
    for (let i = 0; i < 3; i++) {
      const a = P.ambush[i];
      combat.spawn("rival", a.x, a.z, { yaw: yawTo(a.x, a.z, player.x, player.z), alert: true });
      FX("leaves", a.x, a.y + 0.5, a.z, 16, 0x4f7a34);
    }
    A("warCry");
    A("vines");
    cinema.shake(0.012, 0.3);
    MU("play", "combat", { intensity: 0.5, at: "now" });
    MU("stinger", "danger");
    ui.setObjective("Ambush! Fight off the Ash scouts", keyHint("J sting  ·  L tail slap", "Sting  ·  Slap"));
    ui.hint(keyHint("Sting (J), then hit again to FINISH. Tail Slap (L) knocks them over.", "Sting, then hit again to FINISH. Slap knocks them over."), 4.5);
  }
  function ambushDone() {
    if (step !== "ambush" || ambushEnd) return;
    ambushEnd = true;
    const g = gen;
    ui.objectiveDone();
    MU("play", "stealth", { intensity: 0.4 });
    for (let i = 0; i < combat.allies.length; i++) combat.allies[i].cheerT = 1.4;
    A("tribeCheer", 0.5);
    ctx.after(1.6, () => {
      if (g !== gen || step !== "ambush") return;
      healParty();
      reach("path", P.rivalPath[1], "The Ash path");
      spawnRivalCamp();
      beginRival();
    });
  }

  // =====================================================================================================
  // 6 - the rival camp
  // =====================================================================================================
  function bundleSpot(k, out) {
    const h = P.hoard, a = Math.atan2(P.rival.z - h.z, P.rival.x - h.x) + (k - 1) * 0.62;
    out.x = h.x + Math.cos(a) * 1.95; out.z = h.z + Math.sin(a) * 1.95;
    return out;
  }
  function placeBundles() {
    const kinds = ["crayfish", "egg", "berries"];
    tribe.food.clear();
    for (let k = 0; k < 3; k++) if (!bundleDone[k]) { bundleSpot(k, pt); tribe.food.place(4 + k, pt.x, pt.z, kinds[k]); }
    carrying = -1; carryT = 0;
    platypus.setCarry(false); player.carrying = false;
  }
  function spawnRivalCamp() {
    sentries.length = insiders.length = drinkers.length = 0;
    chief = null; chiefOut = false; campAlarm = false; drinkersAwake = false; distractT = 0;
    placeBundles();
    if (chiefBeaten) return;
    const R = (x, z, o) => combat.spawn("rival", x, z, o);
    sentries.push(R(43.4, 20, { route: "rivalGuardA", yaw: -2.4 }));
    sentries.push(R(45.3, 22.8, { yaw: -2.4 }));
    const f = P.rivalFire;
    insiders.push(R(f.x - 1.5, f.z - 1.2, { yaw: 1 }), R(f.x + 1.6, f.z - 1.0, { yaw: -1 }), R(P.hoard.x - 1.7, P.hoard.z - 1.9, { yaw: 2.6 }), R(47.6, 29.6, { route: "rivalGuardB" }));
    // four at the creek, bills in the water, backs to the camp
    for (let i = 0; i < 4; i++) {
      const d = P.rivalDrink[i];
      const e = R(d.x - 1.06, d.z + 1.06, { passive: true, yaw: yawTo(d.x - 1.06, d.z + 1.06, d.x, d.z) });
      drinkers.push(e);
    }
  }
  function startRival() {
    hardStop();
    presetFor("rival");
    toJungle("night");
    stageCamp("away");
    player.teleport(P.rivalPath[1].x, P.rivalPath[1].z, yawTo(P.rivalPath[1].x, P.rivalPath[1].z, P.rivalPath[2].x, P.rivalPath[2].z));
    stageHunters(player.x - 1.6, player.z - 1.6, true);
    quietCp("path", P.rivalPath[1]);
    spawnRivalCamp();
    MU("play", "stealth", { intensity: 0.4 });
    cinema.fade("clear", 0.9);
    beginRival();
  }
  function rivalObjective() {
    if (st.bundles >= 3) ui.setObjective(chiefBeaten ? "Take back the food  3/3" : "Beat the Ash chief!");
    else ui.setObjective("Take back the food  " + st.bundles + "/3", carrying >= 0 ? "hand it to a hunter, or carry it out" : keyHint("E to take a bundle", "tap Take"));
  }
  function beginRival() {
    step = "rival";
    ui.showHud(true);
    player.enabled = true;
    fightButtons();
    rokFights();
    combat.allyDamage = 5;
    rivalEnd = false;
    rivalObjective();
    setGoal(P.hoard, 0x9dff8a);
    govT = 0; intenT = 0;
    const g = gen;
    ctx.after(1.2, () => { if (g === gen && step === "rival" && !campAlarm) say(MB.rok, "Their camp. The gate, the creek behind, or that red totem.", 4.6); });
  }
  function restoreRival() {
    combat.reset();
    stageHunters(P.rivalPath[1].x - 1.6, P.rivalPath[1].z - 1.6, true);
    jungle.rivalTotem.reset();
    spawnRivalCamp();
    step = "rival"; rivalEnd = false;
    fightButtons();
    combat.allyDamage = 5;
    combat.aimScale = ctx.checkpoint.tries >= 2 ? 1.3 : 1;      // a quiet kindness: slower bites after two falls
    rivalObjective();
    setGoal(P.hoard, 0x9dff8a);
    MU("play", "stealth", { intensity: 0.4 });
  }
  function takeBundle(i) {
    carrying = i; carryT = 0;
    tribe.food.carry(i, platypus.holdAnchor);
    platypus.setCarry(true); player.carrying = true;
    A("pickup");
    setAct(null);
    rivalObjective();
    if (!hintCarry) { hintCarry = true; ui.hint("Walk into a hunter to hand it over, or carry it out of the camp.", 4); }
    if (!chiefOut && !chiefBeaten && st.bundles + 1 >= 2) spawnChief();
  }
  function dropBundle() {
    if (carrying < 0) return;
    tribe.food.carry(carrying, null);
    carrying = -1;
    platypus.setCarry(false); player.carrying = false;
    A("drop");
    if (step === "rival") rivalObjective();
  }
  function deliverBundle(ally) {
    const i = carrying;
    if (i < 0) return;
    tribe.food.carry(i, null);
    tribe.food.eat(i);                 // it is gone from the ground: a hunter has it now
    carrying = -1;
    platypus.setCarry(false); player.carrying = false;
    bundleDone[i - 4] = true;
    st.bundles++;
    A("questDone");
    floatAtPlayer("food +1", "plain");
    if (ally) { ally.cheerT = 1.3; v1.set(ally.x, ally.y + 0.4, ally.z); FX("hearts", v1, 2); A("tribeChirp", "cheer", 0.8, 0, 1); }
    rivalObjective();
    if (st.bundles < 3) setGoal(P.hoard, 0x9dff8a); else setGoal(null);
    checkRivalEnd();
  }
  function spawnChief() {
    chiefOut = true;
    campAlarm = true;
    const f = P.rivalFire;
    chief = combat.spawn("rival", f.x + 0.4, f.z + 2.4, { skin: "chief", hp: 120, alert: true, yaw: yawTo(f.x, f.z, player.x, player.z) });
    A("warCry");
    cinema.shake(0.014, 0.35);
    MU("stinger", "danger");
    MU("setIntensity", 1, 1);
    cinema.caption("[THIEVES! Face me!]", 3, { who: "The Ash chief" });
    ui.hint("The chief lunges along the red line. Step aside, then strike!", 4.2);
  }
  function chiefDown() {
    if (chiefBeaten) return;
    chiefBeaten = true;
    chief = null;
    const g = gen;
    cinema.caption("[...Enough. Take it. Go.]", 3.2, { who: "The Ash chief" });
    MU("stinger", "victory");
    A("tribeCheer", 0.8);
    // the rest lose heart and run
    ctx.after(0.35, () => {
      if (g !== gen) return;
      const E = combat.enemies;
      for (let i = 0; i < E.length; i++) { const e = E[i]; if (e.alive && e.kind === "rival") e.knockOut({ x: player.x, z: player.z }); }
      for (let i = 0; i < combat.allies.length; i++) combat.allies[i].cheerT = 1.6;
      if (step === "rival") {
        reach("hoard", player, "The hoard");
        rivalObjective();
        checkRivalEnd();
      }
    });
  }
  function checkRivalEnd() {
    if (rivalEnd || step !== "rival") return;
    if (st.bundles >= 3 && chiefBeaten) {
      rivalEnd = true;
      const g = gen;
      ui.objectiveDone();
      ctx.after(1.8, () => { if (g === gen && step === "rival") beginHome(); });
    }
  }
  function slapTotem() {
    const T = jungle.rivalTotem;
    if (T.fallen || T.falling || dist2(player.x, player.z, T.x, T.z) > 2.5) return false;
    if (!T.fall()) return false;
    A("logCreak");
    const g = gen;
    ctx.after(0.85, () => {
      if (g !== gen) return;
      A("bodyFall", "wood");
      cinema.shake(0.02, 0.35);
      ui.hint("The totem crushed the thorns: a second way in!", 3.4);
      // the sentries run to look
      distractT = 9;
      for (let i = 0; i < sentries.length; i++) {
        const e = sentries[i];
        if (e.alive && !e.aware) { e.passive = true; e.goto(P.rivalBreach.x - 1.2 + i * 1.4, P.rivalBreach.z - 1.6, true); }
      }
    });
    return true;
  }
  function wakeDrinkers() {
    if (drinkersAwake) return;
    drinkersAwake = true;
    for (let i = 0; i < drinkers.length; i++) { const e = drinkers[i]; if (e.alive) { e.passive = false; e.alert(player.x, player.z); } }
  }
  function updateRival(dt) {
    const E = combat.enemies;
    // ---- who is awake: never more than five at a time
    govT -= dt;
    if (govT <= 0) {
      govT = 0.3;
      const full = combat.alerted >= 5;
      if (distractT > 0) { distractT -= 0.3; if (distractT <= 0) for (let i = 0; i < sentries.length; i++) { const e = sentries[i]; if (e.alive) { e.passive = false; if (i === 0) e.setRoute("rivalGuardA", true); } } }
      for (let i = 0; i < sentries.length; i++) { const e = sentries[i]; if (e.alive && !e.aware && distractT <= 0) e.passive = full; }
      let others = 0;
      for (let i = 0; i < insiders.length; i++) { const e = insiders[i]; if (!e.alive) continue; others++; if (!e.aware) e.passive = full; }
      for (let i = 0; i < sentries.length; i++) if (sentries[i].alive) others++;
      if (combat.alerted > 0) campAlarm = true;
      if (!drinkersAwake && !chiefBeaten) {
        let wake = others === 0 && (campAlarm || st.bundles > 0 || carrying >= 0);
        for (let i = 0; i < drinkers.length; i++) {
          const e = drinkers[i];
          if (!e.alive) continue;
          if (e.hp < e.maxHp || dist2(player.x, player.z, e.x, e.z) < 2.4) wake = true;
        }
        if (wake) wakeDrinkers();
      }
      // the music follows the fight
      MU("setIntensity", 0.25 + 0.75 * Math.min(1, combat.alerted / 3), 1.2);
      const want = combat.alerted > 0 ? "combat" : "stealth";
      intenT -= 0.3;
      if (music && music.state !== want && music.pending !== want && intenT <= 0) { intenT = 3; MU("play", want, { intensity: combat.alerted > 0 ? 0.6 : 0.4 }); }
    }
    // ---- hints the layout offers
    if (!hintPulse && player.inWater && player.x > 52 && player.z > 37) {
      let any = false;
      for (let i = 0; i < drinkers.length; i++) if (drinkers[i].alive && !drinkers[i].aware) any = true;
      if (any) { hintPulse = true; ui.hint(keyHint("They are standing in the water... (K)", "They are standing in the water... (Pulse)"), 4); }
    }
    if (!hintTotem && !jungle.rivalTotem.fallen && dist2(player.x, player.z, jungle.rivalTotem.x, jungle.rivalTotem.z) < 4.5) {
      hintTotem = true;
      ui.hint(keyHint("That red totem leans over the thorns... Tail Slap it! (L)", "That red totem leans over the thorns... Slap it!"), 4);
    }
    // ---- the bundles
    if (carrying >= 0) {
      carryT += dt;
      setAct(null);
      if (carryT > 0.7) {
        const AL = combat.allies;
        for (let i = 0; i < AL.length; i++) {
          const a = AL[i];
          if (a.alive && a.state !== "hurt" && dist2(player.x, player.z, a.x, a.z) < 1.25) { deliverBundle(a); return; }
        }
        if (dist2(player.x, player.z, P.rival.x, P.rival.z) > jungle.rival.r + 3) { deliverBundle(null); return; }
      }
    } else if (st.bundles < 3 && player.lock <= 0 && !platypus.acting) {
      const i = tribe.food.nearest(player.x, player.z, 1.6);
      if (i >= 4 && i <= 6) setAct("take", "Take the food"); else setAct(null);
    } else setAct(null);
    // (kept honest if the chief was beaten by the hunters while every enemy list was being swept)
    if (chiefOut && !chiefBeaten && chief && !chief.alive) chiefDown();
    if (E.length === 0 && chiefBeaten) checkRivalEnd();
  }

  // =====================================================================================================
  // 7 - home
  // =====================================================================================================
  function startHome() {
    hardStop();
    presetFor("home");
    toJungle("night");
    stageCamp("away");
    player.teleport(P.rivalPath[1].x, P.rivalPath[1].z, yawTo(P.rivalPath[1].x, P.rivalPath[1].z, P.rivalPath[0].x, P.rivalPath[0].z));
    stageHunters(player.x + 1.6, player.z + 1.6, true);
    quietCp("hoard", P.rivalPath[1]);
    cinema.fade("clear", 0.9);
    beginHome();
  }
  function homeTrail() { return [P.rivalPath[1], P.rivalPath[0], P.logBridge[1], P.logBridge[0], P.huntPath[4], P.huntPath[3], P.huntPath[2], P.huntPath[1], P.huntPath[0], P.campEdge, P.seat]; }
  function beginHome() {
    step = "home";
    ui.showHud(true);
    player.enabled = true;
    fightButtons();
    setAct(null);
    tribe.food.clear();
    homeDone = false; nibRide = 0;
    combat.order("follow");
    ui.setObjective("Bring the food home");
    MU("play", "tribe", { intensity: 1 });
    setTrail(homeTrail(), arriveHome);
    say(MB.moss, "We did it! Home, home, home!", 3);
  }
  function restoreHoard() {
    combat.reset();
    tribe.food.clear();
    carrying = -1; platypus.setCarry(false); player.carrying = false;
    stageHunters(player.x + 1.2, player.z + 1.2, true);
    if (step === "rival") { placeBundles(); rivalObjective(); setGoal(st.bundles < 3 ? P.hoard : null, 0x9dff8a); }
    else { homeDone = false; setTrail(homeTrail(), arriveHome); }
  }
  function arriveHome() {
    if (homeDone || step !== "home") return;
    homeDone = true;
    const g = gen;
    setGoal(null);
    ui.objectiveDone();
    // the squad lines the fire: they are the village again
    combat.reset();
    combat.setAllies(4);
    combat.order("hold", { x: P.fire.x, z: P.fire.z, r: 5.2 });
    ctx.army.show(false);
    campButtons();
    if (nibRide === 2) { MB.nib.attachTo(null); nibRide = 3; }
    MB.nib.emote("happy");
    MB.nib.do("follow", { dist: 2.2, side: -1 });
    MB.moss.do("follow");
    MB.rok.do("sit", { at: { x: P.fire.x + 2.6, z: P.fire.z - 1.9 } });
    tribe.village.setMood("cheer", 1);
    tribe.village.wave();
    A("tribeCheer", 1);
    chatter = 0.7;
    ctx.health.set(5);
    jungle.setTime("dawn", 10);
    ambience("dawn");
    reach("home", P.seat, "Home");
    ui.banner("HOME", "The tribe eats tonight.", 3.6);
    say(MB.burra, "You hunt like one of us.", 3.4);
    ctx.after(5.5, () => { if (g === gen && step === "home") beginGather(); });
  }
  function updateHome(dt) {
    if (homeDone) return;
    // Nib comes running, and rides the last stretch on your back
    const dCamp = dist2(player.x, player.z, P.fire.x, P.fire.z);
    if (nibRide === 0 && dCamp < 24) {
      nibRide = 1;
      MB.nib.place(P.campEdge.x, P.campEdge.z, PI);
      MB.nib.do("follow", { dist: 0.5, side: 0 });
      A("tribeChirp", "giggle", 0.9, 0, 1.45);
    } else if (nibRide === 1 && MB.nib.distTo(player.x, player.z) < 1.3) {
      nibRide = 2;
      MB.nib.attachTo(platypus.capeAnchor || platypus.group, "sit");
      A("tribeChirp", "cheer", 1, 0, 1.45);
      ui.hint("Nib rides on your back!", 2.4);
      v1.set(player.x, player.y + 0.5, player.z);
      FX("hearts", v1, 3);
    }
  }

  // =====================================================================================================
  // 8 - gathering
  // =====================================================================================================
  function startGather() {
    hardStop();
    presetFor("gather");
    toJungle("dawn");
    stageCamp("home");
    player.teleport(P.seat.x, P.seat.z, P.seat.yaw);
    mossBeside(P.seat.x, P.seat.z, P.seat.yaw);
    MB.nib.do("follow", { dist: 2.2, side: -1 });
    quietCp("home", P.seat);
    cinema.fade("clear", 0.9);
    beginGather();
  }
  function gatherObjective() {
    if (st.leaf >= NEED.leaf && st.vine >= NEED.vine && st.bone >= NEED.bone) ui.setObjective("Bring it all to Tika's frame");
    else ui.setObjective("Gather:  leaves " + st.leaf + "/4  ·  vines " + st.vine + "/2  ·  bones " + st.bone + "/2");
  }
  // everything of the gathering that a death (the crab) can disturb, put back; what was gathered stays gathered
  function stageGather() {
    const Mt = tribe.materials, S = P.matSpots;
    Mt.clear();
    dropMark("vine0"); dropMark("vine1"); dropMark("bone0"); dropMark("bone1"); dropMark("moss");
    for (let i = 0; i < NEED.leaf - st.leaf; i++) Mt.spawn("leaf", S.leaf[i].x, S.leaf[i].z, 1.4);
    for (let i = 0; i < 2; i++) {
      if (vineS[i] < 2) { vineS[i] = 0; addMark("vine" + i, S.vine[i].x, S.vine[i].z, 0xd8ff7a); }
      if (boneS[i] < 2) { boneS[i] = 0; boneId[i] = -1; addMark("bone" + i, S.bone[i].x, S.bone[i].z, 0xfff0c8); }
    }
    pullT = -1; pullI = -1; needMoss = 0;
    // the crab sits on the second bone; a berry lies a little way off
    crab.hx = S.bone[1].x; crab.hz = S.bone[1].z; crab.x = crab.hx; crab.z = crab.hz; crab.yaw = 0;
    crab.state = boneS[1] >= 2 ? "calm" : "guard"; crab.t = 0; crab.zone = undefined;
    crab.on = true; crab.g.visible = true;
    berry.state = 0;
    tribe.food.clear();
    if (boneS[1] < 2) {
      const dx = P.trail[3].x - P.boneYard.x, dz = P.trail[3].z - P.boneYard.z, d = Math.hypot(dx, dz) || 1;
      berry.x = P.boneYard.x + (dx / d) * 5.5; berry.z = P.boneYard.z + (dz / d) * 5.5;
      tribe.food.place(7, berry.x, berry.z, "berries");
    }
    carrying = -1; platypus.setCarry(false); player.carrying = false;
    MB.moss.do("follow");
    MB.nib.do("follow", { dist: 2.4, side: -1 });
  }
  function beginGather() {
    step = "gather";
    ui.showHud(true);
    player.enabled = true;
    campButtons();
    setAct(null);
    setGoal(null);
    gatherDone = false; idleT = 0; pingShow = 0; areaCp = "";
    tribe.village.setMood("calm", 2);
    tribe.village.disperse();
    chatter = 0.5;
    MU("play", "chill", { intensity: 0.5 });
    // Tika taps the frame
    MB.tika.emote("call");
    A("craft", "bone");
    say(MB.tika, "Now you get a coat of your own. Leaves, vines, bones!", 4.2);
    stageGather();
    gatherObjective();
    const g = gen;
    ctx.after(4.6, () => { if (g === gen && step === "gather") ui.hint("The glowing lights in the forest mark what Tika needs.", 3.6); });
  }
  function gotMaterial(kind) {
    if (st[kind] < NEED[kind]) st[kind]++;
    A("objective");
    floatAtPlayer("+1 " + KIND_LABEL[kind], "plain");
    idleT = 0;
    gatherObjective();
    if (!gatherDone && st.leaf >= NEED.leaf && st.vine >= NEED.vine && st.bone >= NEED.bone) {
      gatherDone = true;
      setAct(null);
      ui.setPing(null); pingShow = 0;
      setGoal(P.bench, 0x9dff8a);
      if (!MB.moss.busy) MB.moss.emote("happy");
      say(MB.moss, "That is everything! Back to Tika!", 3);
    }
  }
  function startPull(i, withMoss) {
    pullT = 0; pullI = i; pullWithMoss = withMoss;
    player.lock = 1.05;
    player.face = yawTo(player.x, player.z, P.matSpots.vine[i].x, P.matSpots.vine[i].z);
    platypus.nuzzle();
    A("vines");
    setAct(null);
  }
  function endPull() {
    const i = pullI, S = P.matSpots.vine[i];
    pullT = -1; pullI = -1;
    ui.setCharge(null);
    if (i === 1 && !pullWithMoss) {
      // the second one is caught fast: this needs two
      A("craft", "slip");
      vineS[1] = 0;
      needMoss = 1; mossT = 0;
      ui.hint(keyHint("It is stuck! Call Moss: press E next to him.", "It is stuck! Call Moss: tap Call next to him."), 4);
      addMark("moss", MB.moss.x, MB.moss.z, 0x9dff8a);
      return;
    }
    vineS[i] = 2;
    dropMark("vine" + i);
    FX("leaves", S.x, groundY(S.x, S.z) + 1, S.z, 12, 0x4f9a3a);
    A("materialPickup", "vine");
    if (pullWithMoss) { needMoss = 4; dropMark("moss"); MB.moss.do("follow"); MB.moss.emote("happy"); }
    gotMaterial("vine");
  }
  function callMoss() {
    if (needMoss !== 1) return;
    needMoss = 2; mossT = 0;
    const S = P.matSpots.vine[1];
    dropMark("moss");
    MB.moss.emote("call");
    MB.moss.do("goto", { x: S.x + 0.7, z: S.z - 0.8, run: true });
    ui.hint("Moss bites the vine. Now pull together!", 3);
    setAct(null);
  }
  function popBone(i) {
    const S = P.matSpots.bone[i];
    boneS[i] = 1;
    dropMark("bone" + i);
    FX("sandPuff", S.x, groundY(S.x, S.z) + 0.05, S.z, 1);
    FX("footDust", S.x, groundY(S.x, S.z) + 0.05, S.z, 1.2, 0xd9cfae);
    A("tailSlapHit");
    boneId[i] = tribe.materials.spawn("bone", S.x + (i === 1 ? 0.5 : 0.3), S.z + 0.3);
    if (boneId[i] < 0) { boneS[i] = 2; gotMaterial("bone"); }       // no slot (never in practice): it is simply yours
  }
  // a tail slap in the gathering grounds: leaves come down, buried bones pop up, the crab flips over
  function slapGather() {
    const Mt = tribe.materials, S = P.matSpots;
    let hit = false;
    for (let id = 0; id < Mt.count; id++) {
      if (!Mt.hanging(id)) continue;
      Mt.pos(id, pt);
      if (dist2(player.x, player.z, pt.x, pt.z) < 2.1) { Mt.drop(id); FX("leaves", pt.x, pt.y, pt.z, 6, 0x4f9a3a); hit = true; }
    }
    for (let i = 0; i < 2; i++) if (boneS[i] === 0 && dist2(player.x, player.z, S.bone[i].x, S.bone[i].z) < 2.2) { popBone(i); hit = true; }
    if (crab.on && crab.state !== "stun" && crab.state !== "calm" && dist2(player.x, player.z, crab.x, crab.z) < 1.9) {
      if (crab.zone !== undefined) { FX("dangerCancel", crab.zone); crab.zone = undefined; }
      crab.state = "stun"; crab.t = 0;
      v1.set(crab.x, groundY(crab.x, crab.z) + 0.15, crab.z);
      FX("hitBurst", v1, 0xffb28a);
      ui.hint("The crab is on its back. Quick!", 2.4);
      hit = true;
    }
    return hit;
  }
  function tossBerry() {
    if (berry.state !== 1) return;
    berry.state = 2;
    let dx = crab.hx - player.x, dz = crab.hz - player.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    berry.x = crab.hx + dx * 3.6; berry.z = crab.hz + dz * 3.6;
    pt.x = berry.x; pt.z = berry.z;
    jungle.confine(pt, 0.4);
    berry.x = pt.x; berry.z = pt.z;
    tribe.food.carry(7, null);
    tribe.food.place(7, berry.x, berry.z, "berries");
    platypus.setCarry(false); player.carrying = false;
    A("throwWhoosh");
    if (crab.state !== "calm") { if (crab.zone !== undefined) { FX("dangerCancel", crab.zone); crab.zone = undefined; } crab.state = "lured"; crab.t = 0; }
    ui.hint("The crab scuttles after the berry!", 2.6);
    setAct(null);
  }
  function updateCrab(dt) {
    const c = crab;
    if (!c.on) return;
    c.t += dt;
    const d = dist2(player.x, player.z, c.x, c.z);
    let tx = c.hx, tz = c.hz, speed = 0, rear = 0, flip = 0;
    if (c.state === "guard") {
      speed = 1.2;
      if (d < 1.75 && boneS[1] < 2 && ctx.health.on && !ctx.health.dead && !ctx.checkpoint.respawning) {
        c.state = "wind"; c.t = 0;
        zoneSpec.x = c.x; zoneSpec.z = c.z;
        c.zone = FX("dangerZone", zoneSpec);
        A("craft", "bone");
        if (!hintCrab) { hintCrab = true; ui.hint(keyHint("A grumpy crab! Step back, Tail Slap it (L), or lure it away with the berry.", "A grumpy crab! Step back, Slap it, or lure it away with the berry."), 4.6); }
      }
    } else if (c.state === "wind") {
      rear = Math.min(1, c.t / 0.3);
      if (c.t >= 0.75) {
        c.zone = undefined;
        if (d < 1.4) { hurtSrc.x = c.x; hurtSrc.z = c.z; if (ctx.health.damage(1, hurtSrc)) A("punch"); }
        c.state = "cool"; c.t = 0;
      }
    } else if (c.state === "cool") { if (c.t > 1.7) { c.state = "guard"; c.t = 0; } }
    else if (c.state === "stun") { flip = 1; if (c.t > 5.5) { c.state = boneS[1] >= 2 ? "calm" : "guard"; c.t = 0; } }
    else if (c.state === "lured") {
      tx = berry.x; tz = berry.z; speed = 1.9;
      if (dist2(c.x, c.z, tx, tz) < 0.35) {
        if (berry.state === 2) { berry.state = 3; tribe.food.eat(7); A("eatFruit"); }
        if (c.t > 24) { c.state = boneS[1] >= 2 ? "calm" : "guard"; c.t = 0; }
      }
    } else {
      // content: a slow sideways amble round its patch
      tx = c.hx + Math.sin(c.t * 0.35) * 1.6; tz = c.hz + Math.cos(c.t * 0.35) * 1.6; speed = 0.5;
    }
    const mx = tx - c.x, mz = tz - c.z, md = Math.hypot(mx, mz);
    let moving = false;
    if (speed > 0 && md > 0.08) { const s = Math.min(md, speed * dt); c.x += (mx / md) * s; c.z += (mz / md) * s; moving = true; }
    // crabs face you and walk sideways
    const want = d < 6 ? yawTo(c.x, c.z, player.x, player.z) : c.yaw;
    let dy = want - c.yaw;
    while (dy > PI) dy -= TAU;
    while (dy < -PI) dy += TAU;
    c.yaw += clamp(dy, -4 * dt, 4 * dt);
    const g = c.g;
    g.position.set(c.x, groundY(c.x, c.z) + (flip ? 0.2 : 0) + (moving ? Math.abs(Math.sin(c.t * 22)) * 0.015 : 0), c.z);
    g.rotation.set(-rear * 0.5 + (c.state === "wind" ? Math.sin(c.t * 40) * 0.05 : 0), c.yaw, flip ? PI + Math.sin(c.t * 16) * 0.12 : moving ? Math.sin(c.t * 22) * 0.07 : 0);
  }
  function updateGather(dt) {
    const Mt = tribe.materials, S = P.matSpots;
    updateCrab(dt);
    // a pull in progress
    if (pullT >= 0) {
      pullT += dt;
      ui.setCharge(clamp(pullT, 0, 1), "PULL", 1);
      if (pullT >= 1) endPull();
      return;
    }
    // pick up whatever lies at your feet
    const id = Mt.nearest(player.x, player.z, 0.95);
    if (id >= 0 && !Mt.hanging(id)) {
      const kind = Mt.collect(id);
      if (kind === "bone") { for (let i = 0; i < 2; i++) if (boneId[i] === id) { boneS[i] = 2; boneId[i] = -1; if (i === 1 && crab.state !== "stun" && crab.state !== "lured") { crab.state = "calm"; crab.t = 0; } } }
      if (kind) gotMaterial(kind);
    }
    // a jump under a hanging leaf knocks it loose as well
    if (!player.grounded) {
      for (let k = 0; k < Mt.count; k++) {
        if (!Mt.hanging(k)) continue;
        Mt.pos(k, pt);
        if (dist2(player.x, player.z, pt.x, pt.z) < 0.9 && player.y + 0.45 > pt.y - 0.35) { Mt.drop(k); A("vines"); FX("leaves", pt.x, pt.y, pt.z, 5, 0x4f9a3a); }
      }
    }
    // the death restart puts you at the edge of the ground you were working
    const area = near(P.boneYard, 14) ? "bone" : near(P.leafGrove, 14) ? "leaf" : near(P.vineWall, 13) ? "vine" : "";
    if (area && area !== areaCp && player.grounded && !near(crab, 4)) { areaCp = area; ctx.checkpoint.set("home", { x: player.x, z: player.z, yaw: player.yaw, silent: true, restore: restoreCp }); }
    // first-time hints
    if (!hintLeaf && st.leaf < NEED.leaf && near(P.leafGrove, 7.5)) { hintLeaf = true; ui.hint(keyHint("The leaves hang high. Jump at one, or Tail Slap (L) under it.", "The leaves hang high. Jump at one, or Slap under it."), 4.4); }
    if (!hintBone && st.bone < NEED.bone && near(P.boneYard, 6.5)) { hintBone = true; ui.hint(keyHint("Bones lie buried here. Tail Slap the sand! (L)", "Bones lie buried here. Slap the sand!"), 4.2); }
    // Moss and the stuck vine
    if (needMoss === 1) {
      mossT += dt;
      moveMark("moss", MB.moss.x, MB.moss.z);
      if (mossT > 12) callMoss();                 // he works it out by himself in the end
    } else if (needMoss === 2) {
      mossT += dt;
      if (MB.moss.distTo(S.vine[1].x + 0.7, S.vine[1].z - 0.8) < 0.6 || mossT > 9) { needMoss = 3; MB.moss.emote("call"); }
    }
    // the idle aid: an arc toward the nearest thing still needed
    if (!gatherDone) {
      if (player.speed < 0.3) idleT += dt; else if (pingShow <= 0) idleT = 0;
      if (idleT > 10) { idleT = 0; pingShow = 6; }
      if (pingShow > 0) {
        pingShow -= dt;
        let bx = 0, bz = 0, bd = 1e9;
        if (st.leaf < NEED.leaf) { const d = dist2(player.x, player.z, P.leafGrove.x, P.leafGrove.z); if (d < bd) { bd = d; bx = P.leafGrove.x; bz = P.leafGrove.z; } }
        if (st.vine < NEED.vine) { const d = dist2(player.x, player.z, P.vineWall.x, P.vineWall.z); if (d < bd) { bd = d; bx = P.vineWall.x; bz = P.vineWall.z; } }
        if (st.bone < NEED.bone) { const d = dist2(player.x, player.z, P.boneYard.x, P.boneYard.z); if (d < bd) { bd = d; bx = P.boneYard.x; bz = P.boneYard.z; } }
        if (pingShow <= 0 || bd > 1e8) ui.setPing(null); else ui.setPing(ctx.bearing(bx, bz), 0.8, "sound");
      }
    }
    // ---- the prompt
    if (player.lock > 0 || platypus.acting) { setAct(null); return; }
    if (gatherDone) {
      if (near(P.bench, 3)) { beginCraft(); return; }
      setAct(null);
      return;
    }
    if (berry.state === 1) { if (crab.state !== "calm" && dist2(player.x, player.z, crab.hx, crab.hz) < 7) setAct("toss", "Toss the berry"); else setAct(null); return; }
    for (let i = 0; i < 2; i++) {
      if (vineS[i] >= 2 || dist2(player.x, player.z, S.vine[i].x, S.vine[i].z) > 2.3) continue;
      if (i === 1 && needMoss === 1) break;
      if (i === 1 && needMoss === 2) { setAct(null); return; }
      setAct("vine" + i, i === 1 && needMoss === 3 ? "Pull together" : "Pull the vine");
      return;
    }
    if (needMoss === 1 && near(MB.moss, 2.4)) { setAct("moss", "Call Moss"); return; }
    if (berry.state === 0 && boneS[1] < 2 && crab.state !== "calm" && tribe.food.active(7) && dist2(player.x, player.z, berry.x, berry.z) < 1.4) { setAct("berry", "Take the berry"); return; }
    setAct(null);
  }

  // =====================================================================================================
  // 9 - crafting
  // =====================================================================================================
  function startCraft() {
    hardStop();
    presetFor("craft");
    toJungle("dawn");
    stageCamp("home");
    player.teleport(P.bench.x - 1.9, P.bench.z - 1.2, yawTo(P.bench.x - 1.9, P.bench.z - 1.2, P.bench.x, P.bench.z));
    mossBeside(player.x, player.z, player.yaw + PI);
    MB.nib.do("follow", { dist: 2.4, side: -1 });
    MU("play", "chill", { intensity: 0.5 });
    quietCp("home", P.seat);
    cinema.fade("clear", 0.9);
    ui.showHud(true);
    player.enabled = true;
    campButtons();
    beginCraft();
  }
  function beginCraft() {
    if (step === "craft") return;
    step = "craft";
    crab.on = false; crab.g.visible = false;
    setGoal(null);
    ui.setPing(null);
    dropMark("moss");
    craftPhase = 0; placeCd = 0; sweepT = 0; slips = 0; pullCd = 0; zoneShown = -1; rokTest = 0;
    st.pulls = 0;
    MU("setIntensity", 0.7, 2);
    MB.tika.emote("happy");
    say(MB.tika, "Lay them on the frame. I will lace with you.", 3.6);
    ui.setObjective("Lay the pieces on the frame  0/8", keyHint("E to place", "tap Place"));
    addMark("bench", P.bench.x, P.bench.z, 0x9dff8a);
  }
  function placePiece() {
    const B = tribe.bench;
    const kind = B.have.leaf < NEED.leaf ? "leaf" : B.have.vine < NEED.vine ? "vine" : "bone";
    if (!B.put(kind)) return;
    placeCd = 0.32;
    const n = B.have.leaf + B.have.vine + B.have.bone;
    ui.setObjective("Lay the pieces on the frame  " + n + "/8", keyHint("E to place", "tap Place"));
    if (!MB.tika.busy && n % 3 === 0) MB.tika.emote("chirp");
    if (B.ready) {
      craftPhase = 1; sweepT = 0; pullCd = 0.6;
      dropMark("bench");
      ui.objectiveDone();
      ui.setObjective("Lace it tight  0/3", keyHint("press E when the bar says PULL", "tap Pull when the bar says PULL"));
      ui.hint(keyHint("Lacing: press E while the bar is past the mark.", "Lacing: tap Pull while the bar is past the mark."), 4);
    }
  }
  const zoneLo = () => (st.pulls === 0 ? 0.5 : 0.6);
  const zoneHi = () => (st.pulls === 0 ? 0.9 : 0.85);
  function sweepFrac() { const p = (sweepT * 0.9) % 1; return p < 0.5 ? p * 2 : 2 - p * 2; }
  function lacePull() {
    if (pullCd > 0) return;
    const B = tribe.bench, f = sweepFrac();
    pullCd = 0.55;
    if (f >= zoneLo() && f <= zoneHi() && B.tighten(1)) {
      st.pulls = B.stage;
      A("craft", "tighten");
      ui.call("TIGHT!", st.pulls + "/3", "perfect");
      FX("leaves", P.bench.x, P.bench.y + 0.7, P.bench.z, 4, 0x4f9a3a);
      if (!MB.tika.busy) MB.tika.emote("chirp");
      platypus.nuzzle(); player.lock = 0.5;
      zoneShown = -1;
      if (B.done) {
        craftPhase = 2;
        ui.setCharge(null);
        A("craft", "done");
        MU("stinger", "gear");
        ui.objectiveDone();
        ui.setObjective("Wear your armor", keyHint("E", "tap Wear it"));
        MB.tika.emote("cheer");
        say(MB.tika, slips === 0 ? "Not one slip! It is yours." : "It holds. It is yours.", 3);
      } else ui.setObjective("Lace it tight  " + st.pulls + "/3", keyHint("press E when the bar says PULL", "tap Pull when the bar says PULL"));
    } else {
      B.tighten(0.2);
      slips++;
      ui.call("Slipped!", "try again", "miss");
    }
  }
  function wearArmor() {
    if (craftPhase !== 2) return;
    craftPhase = 3;
    const g = gen;
    setAct(null);
    ui.setObjective(null);
    tribe.bench.takeArmor();
    A("pickup");
    player.face = yawTo(player.x, player.z, P.bench.x, P.bench.z);
    const helm = slips === 0;
    cinema.play([
      { shot: { pos: [P.bench.x - 2.2, P.bench.y + 1.2, P.bench.z - 2.4], look: [P.bench.x, P.bench.y + 0.7, P.bench.z], fov: F(34), dur: 1.5, ease: "out" } },
      { call: () => {
        ctx.gear.wear("body", "leaf", { armor: 0.3 });
        A("gearOn", "leaf");
        v1.set(player.x, player.y + 0.4, player.z);
        FX("sparkle", v1, 0x9dff8a, 14);
        FX("leaves", player.x, player.y + 0.6, player.z, 10, 0x4f9a3a);
        platypus.pose("proud");
        tribe.village.setMood("cheer", 1);
        tribe.village.wave();
        A("tribeCheer", 0.8);
      } },
      // the slow turntable
      { shot: { track: platypus.group, trackYaw: true, pos: [1.9, 0.7, 1.7], look: [0, 0.22, 0], fov: F(30), to: { pos: [-1.9, 0.75, 1.7] }, dur: 4, ease: "inOut" }, hold: false },
      { wait: 1.2 },
      { caption: "Leaf and bone: the armor of the river tribe.", dur: 2.6, narr: true },
      { wait: 0.3 },
    ], { skippable: true, onDone: () => { if (g === gen) afterArmor(helm); } });
  }
  function afterArmor(helm) {
    st.armor = true;
    platypus.pose(null);
    if (ctx.gear.worn.body !== "leaf") ctx.gear.wear("body", "leaf", { armor: 0.3 });
    tribe.village.setMood("cheer", 0.5);
    if (helm) {
      st.helm = true;
      ctx.gear.wear("head", "boneHelm", { armor: 0.05 });
      A("gearOn", "leaf");
      say(MB.tika, "Perfect lacing earns the bone helm.", 3.4);
    }
    step = "craft"; craftPhase = 4;
    ui.showHud(true);
    player.enabled = true;
    reach("armor", player, "Armor made");
    ui.setObjective("Rok wants to test it...");
    // Rok tests it: one shove that now barely moves you
    rokTest = 1;
    MB.rok.do("goto", { x: player.x + Math.sin(player.yaw) * 1.0, z: player.z + Math.cos(player.yaw) * 1.0, run: true });
    const g = gen;
    ctx.after(7, () => { if (g === gen && rokTest === 1) rokShoves(); });
  }
  function rokShoves() {
    if (rokTest !== 1) return;
    rokTest = 2;
    const m = MB.rok, g = gen;
    const dx = player.x - m.x, dz = player.z - m.z, d = Math.hypot(dx, dz) || 1;
    m.emote("war");
    A("punch"); A("armorClank", 0.3);
    player.kx += (dx / d) * 1.1; player.kz += (dz / d) * 1.1;
    v1.set(player.x, player.y + 0.3, player.z);
    FX("hitBurst", v1, 0x9dff8a);
    ui.hint("The armor holds!", 2.4);
    ctx.after(1.2, () => { if (g === gen) { m.emote("happy"); say(m, "Good coat.", 2.4); } });
    ctx.after(4.2, () => { if (g === gen && step === "craft") beginNight(); });
  }
  function updateCraft(dt) {
    if (placeCd > 0) placeCd -= dt;
    if (pullCd > 0) pullCd -= dt;
    const close = near(P.bench, 2.6);
    if (craftPhase === 0) { setAct(close && placeCd <= 0 ? "place" : null, "Place"); }
    else if (craftPhase === 1) {
      sweepT += dt;
      const f = sweepFrac(), inZone = f >= zoneLo() && f <= zoneHi();
      // (the label only changes when the marker crosses the edge of the zone: no per-frame strings)
      ui.setCharge(f, inZone ? "PULL NOW!" : "lacing...", zoneLo());
      zoneShown = inZone ? 1 : 0;
      setAct(close ? "pull" : null, "Pull");
      if (!close) ui.setCharge(null);
    } else if (craftPhase === 2) setAct(close ? "wear" : null, "Wear it");
    else {
      setAct(null);
      if (rokTest === 1 && MB.rok.distTo(player.x, player.z) < 1.5) rokShoves();
    }
  }

  // =====================================================================================================
  // 10 - the night
  // =====================================================================================================
  function startNight() {
    hardStop();
    presetFor("night");
    toJungle("dawn");
    stageCamp("home");
    player.teleport(P.seat.x, P.seat.z, P.seat.yaw);
    mossBeside(P.seat.x, P.seat.z, P.seat.yaw);
    quietCp("armor", P.seat);
    cinema.fade("clear", 0.9);
    beginNight();
  }
  function beginNight() {
    step = "night";
    ui.showHud(true);
    player.enabled = true;
    campButtons();
    setAct(null);
    dropMarks();
    nightPhase = 0; danceT = 0; st.beats = 0;
    jungle.setTime("night", 6);
    ambience("night");
    MU("play", "tribe", { intensity: 0.9 });
    MB.tika.do("dance", { center: { x: P.fire.x, z: P.fire.z }, radius: 2.7 });
    MB.nib.do("dance", { center: { x: P.fire.x, z: P.fire.z }, radius: 3.5 });
    MB.rok.do("sit", { at: { x: P.fire.x + 2.9, z: P.fire.z - 2.2 } });
    MB.moss.do("follow");
    tribe.village.setMood("cheer", 2);
    tribe.village.gather(P.fire.x, P.fire.z, 5.4);
    chatter = 0.8; fireSnd = 0.9;
    A("tribeDrums", true, 0.8, MU("nextBeatIn") || 0, (music && music.bpm) || 96);
    ui.setObjective("Dance! Jump on the beat", "or talk to Old Burra when you are tired");
    ui.hint(keyHint("Jump (Space) in time with the drums!", "Tap Jump in time with the drums!"), 3.6);
    addMark("burra", MB.burra.x, MB.burra.z, 0xffe08a);
  }
  function danceJump() {
    if (step !== "night" || nightPhase !== 0) return;
    const ph = MU("beatPhase");
    if (typeof ph !== "number") return;
    if (ph < 0.22 || ph > 0.8) {
      st.beats++;
      A("tribeCheer", 0.35);
      FX("embers", P.fire.x, P.fire.y + 0.5, P.fire.z, 0.7, 16);
      tribe.village.wave(P.fire.x, P.fire.z);
      ui.call("ON THE BEAT!", st.beats > 1 ? "x" + st.beats : "", "good");
    }
  }
  function burraBed() {
    if (nightPhase !== 0) return;
    nightPhase = 1;
    dropMark("burra");
    setAct(null);
    A("tribeDrums", true, 0.35, MU("nextBeatIn") || 0, (music && music.bpm) || 96);
    MU("setIntensity", 0.45, 3);
    MB.burra.emote("call");
    say(MB.burra, "Sleep. Tomorrow you tell us of the one you lost.", 4.6);
    ui.setObjective("Go to sleep", keyHint("E at your hollow", "tap Sleep at your hollow"));
    setGoal(P.bed, 0x9fb8ff);
    tribe.village.disperse();
    tribe.village.setMood("calm", 4);
  }
  function playSleep() {
    if (sleepSeq) return;
    sleepSeq = true;
    step = "sleep";
    const g = gen;
    setAct(null);
    setGoal(null);
    ui.setObjective(null);
    player.enabled = false;
    const b = P.bed, c = P.camBed;
    cinema.play([
      { call: () => player.walkTo(b.x, b.z, { speed: 0.5, face: b.yaw }) },
      { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: [c.look.x, c.look.y, c.look.z], fov: F(38), to: { pos: [c.pos.x - 0.5, c.pos.y - 0.15, c.pos.z + 0.4], fov: F(33) }, dur: 9, ease: "out" }, hold: false },
      { until: () => !player.walking, max: 4 },
      { call: () => {
        player.stop();
        platypus.sleep(true);
        // Nib curls against you; the fire burns down
        MB.nib.place(b.x + 2.2, b.z - 1.4, 0);
        MB.nib.do("sleep", { at: { x: b.x + Math.cos(b.yaw) * 0.55, z: b.z - Math.sin(b.yaw) * 0.55, yaw: b.yaw + 0.4 } });
        MB.tika.do("sit", { at: { x: P.fire.x - 2.2, z: P.fire.z + 1.6 } });
        jungle.fires[0].set(0.2);
        tribe.village.setMood("sleep", 3);
        A("tribeDrums", false);
        chatter = 0.05; fireSnd = 0.3;
        MU("play", "dream", { intensity: 0.2 });
      } },
      { wait: 2.6 },
      { caption: "For the first time since the glass, you are not alone.", dur: 4, narr: true },
      { wait: 0.4 },
      { eye: "close", duration: 2.5, tint: "night" },
      { fade: "black", dur: 0.8 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startVision(); } });
  }
  function updateNight(dt) {
    if (nightPhase === 0) {
      danceT += dt;
      if (danceT > 30) { burraBed(); return; }
      setAct(near(MB.burra, 2.7) ? "burra" : null, "Talk to Old Burra");
    } else setAct(near(P.bed, 2.1) && player.lock <= 0 ? "sleep" : null, "Sleep");
  }

  // =====================================================================================================
  // 11 - the vision: 5 DAYS
  // =====================================================================================================
  function startVision() {
    hardStop();
    presetFor("vision");
    toLair();
    step = "vision";
    player.hidden = true;
    player.teleport(L.spawn.x, L.spawn.z, L.spawn.yaw || 0);
    lair.setVoid(false);
    lair.setGlow(0.7);
    if (lair.timer && lair.timer.text !== "5 DAYS") lair.timer.setText("5 DAYS");
    // Pip, alive, curled up in the cell. Thinner.
    friend.group.scale.set(0.86, 0.92, 1);
    lair.cell.sway(0.5);
    A("lavaRumble", 0.55);
    if (!music || (music.state !== "dream" && music.pending !== "dream")) MU("play", "dream", { intensity: 0.2 });
    const g = gen, t = L.camTimer, c = L.camCell, cy = L.cell.y;
    cinema.play([
      { day: "5 DAYS", hold: 3.2, kicker: "A DREAM" },
      { call: () => { cinema.fade("clear", 1.4); tickT = 0.6; tickN = 4; } },
      // the timer above the lava
      { shot: { pos: [t.pos.x, t.pos.y - 0.8, t.pos.z - 2.5], look: [t.look.x, t.look.y, t.look.z], fov: F(44),
        to: { pos: [t.pos.x, t.pos.y, t.pos.z], fov: F(40) }, dur: 4, ease: "inOut" } },
      // the cell: Pip
      { call: () => { A("chainCreak"); lair.cell.sway(0.35); MU("motif", "pipSad", { at: "now" }); tickT = 1; tickN = 6; } },
      { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: [c.look.x, c.look.y - 0.3, c.look.z], fov: F(30),
        to: { pos: [c.pos.x - 0.9, c.pos.y - 0.25, c.pos.z + 0.9], fov: F(24) }, dur: 5.4, ease: "out" }, hold: false },
      { wait: 1.6 },
      // it lifts its head as if it heard something ... and looks straight at you
      { call: () => {
        const b = friend.body;
        if (b) {
          if (b.pose) b.pose("sad", 0.9);
          if (b.lookAt) b.lookAt(v1.copy(ctx.camera.position));
          if (b.blink) b.blink();
        }
        A("friendChirp", "sad", 0.5, 0);
      } },
      { wait: 1.5 },
      { caption: "[...are you there?]", dur: 2.6, who: "Pip" },
      // snap to black on a tick
      { call: () => { A("timerTick"); tickN = 0; cinema.fade("black", 0); } },
      { wait: 1.3 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startWake(); } });
    void cy;
  }
  function updateVision(dt) {
    const raw = ctx.time.rawDt || dt;
    if (tickN > 0) {
      tickT -= raw;
      if (tickT <= 0) { tickT = 1; tickN--; A("timerTick"); }
    }
  }

  // =====================================================================================================
  // 12 - waking
  // =====================================================================================================
  function startWake() {
    hardStop();
    presetFor("wake");
    lair.reset();
    toJungle("dawn");
    stageCamp("sleep");
    step = "wake";
    const b = P.bed, c = P.camBed, g = gen;
    player.teleport(b.x, b.z, b.yaw);
    platypus.sleep(true);
    MB.nib.place(b.x + Math.cos(b.yaw) * 0.55, b.z - Math.sin(b.yaw) * 0.55, b.yaw + 0.4);
    MB.nib.do("sleep");
    // Moss is already awake, watching you
    const mx = b.x - Math.cos(b.yaw) * 1.3, mz = b.z + Math.sin(b.yaw) * 1.3;
    MB.moss.place(mx, mz, yawTo(mx, mz, b.x, b.z));
    MB.moss.do("sit");
    MU("play", "chill", { intensity: 0.15 });
    quietCp("armor", b);
    cinema.play([
      { shot: { pos: [c.pos.x - 0.4, c.pos.y - 0.2, c.pos.z + 0.3], look: [b.x, b.y + 0.25, b.z], fov: F(30), to: { pos: [c.pos.x, c.pos.y, c.pos.z], fov: F(34) }, dur: 5.5, ease: "out" }, hold: false },
      { fade: "clear", dur: 0.35 },
      // with a start
      { call: () => { platypus.sleep(false); platypus.hurt(); A("friendChirp", "scared", 0.6, 0); MB.moss.emote("curious"); MU("motif", "pip", { gain: 0.8 }); } },
      { wait: 1.6 },
      { caption: "Five days.", dur: 3, narr: true },
      { wait: 0.4 },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) finish(); } });
  }
  function finish() {
    if (step === "done") return;
    step = "done";
    player.enabled = false;
    setAct(null);
    ui.setObjective(null);
    ui.showComplete({ kicker: "LEVEL 9", title: "COMPLETE", sub: "Five days." }, () => ctx.complete());
  }

  // =====================================================================================================
  // checkpoints
  // =====================================================================================================
  // Put the section back (the engine then teleports the player to the checkpoint and fades in).
  function restoreCp(id) {
    setAct(null);
    carrying = -1;
    platypus.setCarry(false); player.carrying = false;
    player.maxSpeed = 3 * ctx.gear.speed;
    pullT = -1; ui.setCharge(null);
    if (id === "bridge") restoreBridge();
    else if (id === "path") restoreRival();
    else if (id === "hoard") restoreHoard();
    else if (id === "home" && step === "gather") { const done = gatherDone; stageGather(); gatherDone = done; gatherObjective(); if (done) setGoal(P.bench, 0x9dff8a); }
    return true;
  }

  // =====================================================================================================
  // attacks
  // =====================================================================================================
  // things in the world a tail slap means something to (called at the moment the tail lands)
  function slapWorld() {
    v1.set(player.x, player.y + 0.1, player.z);
    FX("slapRing", player.x, player.y + 0.05, player.z, player.yaw);
    if (step === "meet" && rokShove === 1 && near(MB.rok, 2.6)) { A("tailSlapHit"); rokLaughs(); return true; }
    if (step === "rival" && slapTotem()) { A("tailSlapHit"); return true; }
    if (step === "gather") return slapGather();
    return false;
  }
  function onStrike(kind, result, count) {
    if (kind === "pulse") {
      // the ones drinking in the creek all go down to a single pulse
      if (count > 0 && step === "rival") {
        let n = 0;
        for (let i = 0; i < drinkers.length; i++) {
          const e = drinkers[i];
          if (e.alive && dist2(player.x, player.z, e.x, e.z) < 11 && jungle.waterAt(e.x, e.z) > -1e6) { e.knockOut({ x: player.x, z: player.z }); n++; }
        }
        if (n > 1) ui.call("ALL OF THEM!", "one pulse", "perfect");
        wakeDrinkers();
      } else if (count === 0) ui.hint("Nothing in the water to hit.", 1.6);
      return;
    }
    if (result === "finish" || result === "takedown") cinema.shake(0.01, 0.15);
  }
  function attack(kind) {
    if (platypus.acting || player.lock > 0) return true;
    if (kind === "sting") { if (stingCd > 0) return true; }
    else if (kind === "slap") { if (slapCd > 0) return true; }
    else {
      if (pulseCd > 0) return true;
      if (!player.inWater) { ui.hint("The pulse needs water!", 1.6); return true; }
    }
    if (carrying >= 0) dropBundle();
    const g = gen;
    const fin = fightOn && kind !== "pulse" && combat.wouldFinish(kind);
    const t = fin ? platypus.finisherHitTime : kind === "slap" ? platypus.slapHitTime : kind === "sting" ? platypus.stingHitTime : platypus.zapFireTime;
    let d;
    if (fin) { d = platypus.finisher(); A("sting"); }
    else if (kind === "slap") { d = platypus.tailSlap(); A("tailSlap"); }
    else if (kind === "sting") { d = platypus.sting(); A("sting"); }
    else { d = platypus.zap(); A("zapCharge"); }
    player.lock = Math.max(player.lock, (d || 0.5) * 0.7);
    if (kind === "sting") stingCd = 0.45; else if (kind === "slap") slapCd = 0.8; else pulseCd = 2.5;
    ctx.after(t || 0.25, () => {
      if (g !== gen) return;
      if (kind === "pulse") A("zapFire");
      let result = "miss", count = 0;
      if (fightOn) { const r = combat.strike(fin ? "finisher" : kind); result = r.result; count = r.count; }
      if (kind === "slap" || fin) { if (slapWorld()) return; }
      onStrike(kind, result, count);
    });
    return true;
  }

  // =====================================================================================================
  // level interface
  // =====================================================================================================
  function onMember(key, type, data) {
    if (step === "boot") return;
    if (key === "nib") {
      if (type === "hidden" && nibG.on) nibG.hidden = true;
      else if (type === "found" && nibG.on && step === "meet" && !met.nib) {
        nibG.round++;
        ui.setPing(null);
        if (nibG.round >= 2) {
          nibG.on = false;
          say(MB.nib, "You are good at this!", 2.6);
          MB.nib.do("follow", { dist: 2.2, side: -1 });
          metOne("nib");
        } else {
          const g = gen;
          say(MB.nib, "Again! Again!", 2.2);
          ctx.after(1.5, () => { if (g === gen && step === "meet" && nibG.on) hideNib(); });
        }
      } else if (type === "arrived" && nibSteal === 2) nibStole();
    } else if (type === "fed" && step === "food") onServed(typeof data === "number" ? data : serving);
    else if (key === "rok" && type === "arrived" && rokTest === 1) rokShoves();
    else if (key === "moss" && type === "arrived" && needMoss === 2) { needMoss = 3; MB.moss.emote("call"); }
  }
  function onCombat(type, a) {
    if (step === "boot") return;
    if (type === "down") {
      if (a && a.kind === "rival") {
        st.rivalsDown++;
        if (a.big) chiefDown();
      }
    } else if (type === "allDown") {
      const g = gen;
      if (step === "ambush") ctx.after(0.5, () => { if (g === gen) ambushDone(); });
    } else if (type === "playerHit") { if (carrying >= 0) dropBundle(); }
    else if (type === "spotted") { if (step === "rival") campAlarm = true; }
  }

  function enter() {
    hardStop();
    ctx.colliders.push(benchCol);
    for (const k in MB) { const key = k; MB[k].onEvent = (type, data) => onMember(key, type, data); }
    combat.onEvent = onCombat;
    ctx.health.onHurt = () => { if (carrying >= 0 && step === "rival") dropBundle(); if (berry.state === 1) { berry.state = 0; tribe.food.carry(7, null); tribe.food.pos(7, pt); berry.x = pt.x; berry.z = pt.z; platypus.setCarry(false); player.carrying = false; } };
    friend.setName("Pip");
    friend.onEvent = null;
    presetFor("meet");
    toJungle("dusk");
    stageMeet();
    step = "intro";
  }

  function tickSound(dt) {
    sndT -= dt;
    if (sndT > 0) return;
    sndT = 0.4;
    const k = clamp(1 - (dist2(player.x, player.z, P.fire.x, P.fire.z) - 12) / 26, 0, 1);
    A("tribeChatter", chatter * k);
    A("fire", fireSnd * clamp(1 - (dist2(player.x, player.z, P.fire.x, P.fire.z) - 3) / 16, 0, 1));
    A("river", clamp(1 - Math.abs(player.z - jungle.riverZ(player.x)) / 22, 0.06, 0.8));
  }
  function tickCooldowns(dt) {
    if (stingCd > 0) stingCd = Math.max(0, stingCd - dt);
    if (slapCd > 0) slapCd = Math.max(0, slapCd - dt);
    if (pulseCd > 0) pulseCd = Math.max(0, pulseCd - dt);
    const a = Math.round((stingCd / 0.45) * 20), b = Math.round((slapCd / 0.8) * 20), c = Math.round((pulseCd / 2.5) * 20);
    if (a !== shownSting) { shownSting = a; ui.setCooldown("sting", a / 20); }
    if (b !== shownSlap) { shownSlap = b; ui.setCooldown("slap", b / 20); }
    if (c !== shownPulse) { shownPulse = c; ui.setCooldown("zap", c / 20); }
  }

  function update(dt, time) {
    if (step === "boot") return;
    if (inLair) {
      friend.update(dt, time);
      updateVision(dt);
      return;
    }
    tribe.update(dt, time);
    combat.update(dt, time);
    tickSound(dt);
    tickCooldowns(dt);
    // the goal: a ring on the ground every second or so, and the trail of points
    if (goal.on) { ringT -= dt; if (ringT <= 0) { ringT = 1.1; FX("ring", goal.x, goal.z, goal.color, goal.y + 0.07); } }
    if (trail && player.enabled) tickTrail();
    const want = carrying >= 0 || berry.state === 1 ? 2 : 3 * (ctx.gear.speed || 1);
    if (player.maxSpeed !== want && !ctx.health.dead) player.maxSpeed = want;
    switch (step) {
      case "meet": updateMeet(dt); break;
      case "food": updateFood(dt); break;
      case "hunt": updateHunt(dt); break;
      case "ambush":
        ambushT += dt;
        if (ambushT > 5 && combat.allyDamage < 1) combat.allyDamage = 5;
        MU("setIntensity", 0.4 + 0.6 * Math.min(1, combat.alerted / 3), 1.2);
        break;
      case "rival": updateRival(dt); break;
      case "home": updateHome(dt); break;
      case "gather": updateGather(dt); break;
      case "craft": updateCraft(dt); break;
      case "night": updateNight(dt); break;
      default: break;
    }
  }

  function interact() {
    const k = actKey;
    if (!k || player.lock > 0 || platypus.acting) return;
    if (step === "meet") {
      if (meetBusy > 0) return;
      if (k === "nibFound") { if (MB.nib.found()) { nibG.hidden = false; setAct(null); A("friendChirp", "giggle", 1, 0); } else { nibG.hidden = false; onMember("nib", "found"); } }
      else if (k === "burra" || k === "tika" || k === "rok" || k === "nib") greet(k);
    } else if (step === "food") { if (k === "eat" && serving >= 0) eatFood(serving); }
    else if (step === "rival") {
      if (k === "take") { const i = tribe.food.nearest(player.x, player.z, 1.8); if (i >= 4 && i <= 6) takeBundle(i); }
    } else if (step === "gather") {
      if (k === "vine0") { vineS[0] = 1; startPull(0, false); }
      else if (k === "vine1") { vineS[1] = 1; startPull(1, needMoss === 3); }
      else if (k === "moss") callMoss();
      else if (k === "berry") { berry.state = 1; tribe.food.carry(7, platypus.holdAnchor); platypus.setCarry(true); player.carrying = true; A("pickup"); setAct(null); ui.hint("Carry it near the crab and toss it.", 2.8); }
      else if (k === "toss") tossBerry();
    } else if (step === "craft") {
      if (k === "place") placePiece();
      else if (k === "pull") lacePull();
      else if (k === "wear") wearArmor();
    } else if (step === "night") {
      if (k === "burra") burraBed();
      else if (k === "sleep") playSleep();
    }
  }

  function onAction(name) {
    if (step === "boot" || step === "done" || inLair) return false;
    idleT = 0;
    if (name === "interact") { interact(); return false; }
    if (name === "jump") return false;
    if (!player.enabled) return false;
    if (fightOn) {
      const kind = name === "primary" ? "sting" : name === "tailSlap" ? "slap" : name === "secondary" ? "pulse" : null;
      if (!kind) return false;
      return attack(kind);
    }
    // in the camp only the tail is in play (left click / J is an alias, as in level 5)
    if (name === "tailSlap" || name === "primary") {
      if (step === "craft" && name === "primary" && actKey) { interact(); return true; }
      return attack("slap");
    }
    return false;
  }

  function exit() {
    hardStop();
    for (const k in MB) MB[k].onEvent = null;
    combat.onEvent = null;
    combat.allyDamage = 12; combat.allyRate = 1.2;
    tribe.enemies = null;
    friend.onEvent = null;
    friend.lookAt(null);
    if (crab.g && crab.g.parent) crab.g.parent.remove(crab.g);
    jungle.reset();
    lair.reset();
    FX("setGround", null, null);
    inLair = false;
    step = "boot";
  }

  function win() {
    if (step === "done" || step === "boot") return;
    hardStop();
    finish();
  }

  function skipTo(name) {
    if (step === "boot" || STEPS.indexOf(name) < 0) return false;
    switch (name) {
      case "intro": startIntro(); break;
      case "meet": startMeet(); break;
      case "food": startFood(); break;
      case "hunt": startHunt(); break;
      case "ambush": startAmbush(); break;
      case "rival": startRival(); break;
      case "home": startHome(); break;
      case "gather": startGather(); break;
      case "craft": startCraft(); break;
      case "night": startNight(); break;
      case "sleep": startNight(); burraBed(); player.teleport(P.bed.x + 1.2, P.bed.z - 1.2, P.bed.yaw); break;
      case "vision": startVision(); break;
      case "wake": startWake(); break;
      default: win();
    }
    return true;
  }

  return {
    build, enter, start, update, exit, onAction,
    onJump() { idleT = 0; danceJump(); },
    onLand() { idleT = 0; },
    state() {
      return {
        step, met: st.met, food: st.food, rivals: combat ? combat.count("rival") : 0, bundles: st.bundles,
        leaf: st.leaf, vine: st.vine, bone: st.bone, pulls: st.pulls, armor: st.armor, hp: ctx.health.on ? ctx.health.hp : null,
        helm: st.helm, down: st.rivalsDown, carrying, chief: chiefOut ? (chiefBeaten ? "beaten" : "out") : (chiefBeaten ? "beaten" : "in"),
        hunters: ctx.army.count, checkpoint: ctx.checkpoint.id, lair: inLair, beats: st.beats, craftPhase, nightPhase,
      };
    },
    skipTo, win,
    STEPS,
  };
}
