// level6.js - LEVEL 6: ANOTHER DREAM (LEVELS2.md Part C, STORY2.md).
// A playground, not a lecture: Wizard Wobble shows each idea once and the player DOES it on dream soldiers
// that are harmless but react properly. Nothing can be failed, there is no health and no checkpoint.
//
//   intro   the title card, a drift down through the nebula, the platypus wakes on the quilt
//   find    walk to Wizard Wobble
//   fight   LESSON 1  sting twice + finish (3), then tail slap + finish (3); one soldier tries the slow grab
//   pool    LESSON 2  pulse three soldiers from the water at once, then free practice on three more
//   brew    LESSON 3  fetch three ingredients (three tiny puzzles), add them in rune order, stir on the beat
//   potion  LESSON 4  throw the potion at the fallen: they wake as platypuses and follow (5)
//   ending  free play with the five, the dream dims, they turn to motes, Wobble fades, black
//   done    the level card
//
// Skip points (skipTo): fight, pool, brew, potion, ending (also intro, find, done).
import { getWizard } from "./common.js";
import { createDream } from "../dream.js";
import { createCombat } from "../combat.js";
import { createPotions } from "../potions.js";

export const meta = { n: 6, title: "ANOTHER DREAM" };

const STEPS = ["intro", "find", "fight", "pool", "brew", "potion", "ending", "done"];
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const KINDS = ["glowcap", "moonpetal", "dewdrop"];
const NAME = { glowcap: "Glowcap", moonpetal: "Moonpetal", dewdrop: "Dewdrop" };
const ADD_LABEL = { glowcap: "Add the glowcap", moonpetal: "Add the moonpetal", dewdrop: "Add the dewdrop" };
const RUNE = { glowcap: "blue", moonpetal: "silver", dewdrop: "clear" };
const KIND_HEX = { glowcap: 0x6fc8ff, moonpetal: 0xe6ecff, dewdrop: 0xa8fff0 };
const CD = { sting: 0.45, slap: 0.8, zap: 2.5 };
const MIST = 0xbfd0ff, GOLD = 0xffe08a, GREEN = 0x8dffb0;
const NEED_WOKEN = 5, REFILL_SECONDS = 20, FREE_PLAY = 10;

export function createLevel(ctx) {
  const { THREE, player, platypus, ui, cinema, audio, fx } = ctx;

  // guarded calls into audio / fx / music: a missing sound or effect must never stop the story
  function A(name, a, b, c) { const f = audio && audio[name]; return typeof f === "function" ? f.call(audio, a, b, c) : undefined; }
  function FX(name, a, b, c, d, e, g) { const f = fx && fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e, g) : undefined; }
  function M(name, a, b) { const m = ctx.music, f = m && m[name]; return typeof f === "function" ? f.call(m, a, b) : undefined; }

  let dream = null, combat = null, potions = null, wizard = null, P = null;
  let step = "boot", sub = "";
  let gen = 0; // bumped by hardStop(): callbacks that outlive their beat compare it and do nothing

  // ---- scratch (nothing below allocates per frame) ----
  const v1 = new THREE.Vector3();
  const scr = { x: 0, y: 0, visible: false };
  const tmpP = { x: 0, y: 0, z: 0 };
  const colW = { x: 0, z: 0, r: 0.5, on: false }, colC = { x: 0, z: 0, r: 0.62, on: false };
  const wz = { x: 0, z: 0, tx: 0, tz: 0, moving: false, sparkT: 0 };
  const cd = { sting: 0, slap: 0, zap: 0 };
  const routes = [];           // six circle routes round the sparring ring (lesson 1, second half)
  const bodyTmp = [];
  const pickList = [];
  const ingId = { glowcap: -1, moonpetal: -1, dewdrop: -1 };
  const ingMark = { glowcap: null, moonpetal: null, dewdrop: null };
  const ingHinted = { glowcap: false, moonpetal: false, dewdrop: false };
  const sayQ = [];
  let sayThen = null;

  // ---- counters (state()) ----
  let finished = 0, fallenN = 0, brewed = false, woken = 0, joined = 0;
  // ---- transient ----
  let talking = false, camHeld = false, slowT = 0, nagT = 0, objNow = "", actNow = "", goal = null, goalHex = 0, goalT = 0;
  let motifDone = false, staggerHinted = false, missHintT = 0, hunter = null, hunterT = -1, hunterHinted = false, caughtN = 0;
  let poolDown = 0, bankAwake = false, pulsed = false, poolDoneT = -1;
  let heldVer = 0, pickSig = -1, stillT = 0, chargeOn = false, badStirs = 0, wrongN = 0;
  let flaskOn = false, refillT = 0, firstWake = false, wakeShot = false, wakeShotT = 0, twoPraised = false, missN = 0, emptyHinted = false;
  let potionDoneT = -1, bodyCheckT = 0, freeT = 0, jumps = 0, fadeStarted = false;

  // The directed shots are composed for 16:9; on a tall screen the vertical field of view opens.
  function F(v) {
    const a = ctx.camera.aspect || 1.78;
    if (a >= 1.3) return v;
    return Math.min(80, (2 * Math.atan((Math.tan((v * PI) / 360) * 1.3) / a) * 180) / PI);
  }
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const groundWater = (x, z) => { const w = dream.waterAt(x, z); return w > -1e6 ? w : null; };
  function floatAtPlayer(text, kind) {
    ctx.project(platypus.group, scr, 0.55);
    if (scr.visible) ui.floatText(text, scr.x, scr.y, kind || "plain");
  }
  function setObj(text, keys) {
    const sig = text ? text + "|" + (keys || "") : "";
    if (sig === objNow) return;
    objNow = sig;
    ui.setObjective(text || null, keys);
  }
  function setAct(label) {
    const l = label || "";
    if (l === actNow) return;
    actNow = l;
    ui.setAction(label || null);
  }
  function progress() { nagT = 0; }
  function slow(scale, realSeconds) { ctx.setTimeScale(scale, 0); slowT = realSeconds; }

  // ---- the goal marker: one beacon that moves ----
  function goalAt(x, z, hex, y) {
    const yy = typeof y === "number" ? y : dream.heightAt(x, z);
    if (goal && goalHex === hex) { goal.set(x, yy, z); return; }
    if (goal) goal.remove();
    goal = FX("beacon", x, yy, z, hex) || null;
    goalHex = hex;
  }
  function goalOff() { if (goal) { goal.remove(); goal = null; } }

  // ---- the wizard speaks (typed bubbles, one line at a time, as in level 5) ----
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
    wizard.setTalking(true);
    ui.say(l.t, { onBlip: blip, onTyped: sayTyped, onDone: sayNext });
  }
  function wizSay(lines, then) {
    sayQ.length = 0;
    for (let i = 0; i < lines.length; i++) sayQ.push(lines[i]);
    sayThen = then || null;
    sayNext();
  }
  // A directed conversation: the controls rest, the camera frames Wobble, the lines play (E / Enter / tap
  // steps through them, so it is as skippable as the player wants), then `then()`.
  // keep = true leaves the camera and the controls with the caller (who calls endTalk()).
  function talk(cam, lines, then, keep) {
    const g = gen;
    talking = true;
    player.enabled = false;
    player.stop();
    ctx.abilities.cancel();
    setAct(null);
    showPick(false);
    if (chargeOn) { chargeOn = false; ui.setCharge(null); }
    player.face = Math.atan2(wz.tx - player.x, wz.tz - player.z);
    player.lock = Math.max(player.lock, 0.7);
    if (cam) {
      const p = cam.pos, l = cam.look;
      cinema.letterbox(true);
      cinema.shot({ pos: [p.x, p.y, p.z], look: [l.x, l.y, l.z], fov: F(cam.fov || 44),
        to: { pos: [p.x + (l.x - p.x) * 0.07, p.y + (l.y - p.y) * 0.04, p.z + (l.z - p.z) * 0.07] }, dur: 14, ease: "out" });
      camHeld = true;
    }
    wizSay(lines, () => {
      if (g !== gen) return;
      if (!keep) endTalk();
      if (then) then();
    });
  }
  function endTalk() {
    talking = false;
    if (camHeld) { camHeld = false; cinema.letterbox(false); cinema.releaseCamera(0.9); }
    player.face = null;
    player.enabled = true;
    progress();
  }

  // ---- the wizard floats; he drifts from lesson to lesson ----
  function wizardPlace(x, z) {
    wz.x = wz.tx = x; wz.z = wz.tz = z; wz.moving = false;
    colW.x = x; colW.z = z;
    wizard.group.position.set(x, dream.heightAt(x, z) + 0.16, z);
  }
  function wizardTo(x, z) { wz.tx = x; wz.tz = z; wz.moving = true; }
  function updateWizard(dt, time) {
    if (wz.moving) {
      const dx = wz.tx - wz.x, dz = wz.tz - wz.z, d = Math.hypot(dx, dz), s = 3.2 * dt;
      if (d <= s) { wz.x = wz.tx; wz.z = wz.tz; wz.moving = false; }
      else { wz.x += (dx / d) * s; wz.z += (dz / d) * s; }
      wz.sparkT -= dt;
      if (wz.sparkT <= 0 && wizard.group.visible) {
        wz.sparkT = 0.12;
        FX("sparkle", v1.set(wz.x, wizard.group.position.y + 0.5, wz.z), 0xc9b8ff, 2);
      }
      colW.x = wz.x; colW.z = wz.z;
    }
    wizard.group.position.set(wz.x, dream.heightAt(wz.x, wz.z) + 0.16 + Math.sin(time * 1.3) * 0.05, wz.z);
    wizard.lookAt(player.x, player.z);
    wizard.update(dt, time);
  }

  // =====================================================================================================
  // build / reset
  // =====================================================================================================
  function build() {
    dream = ctx.shared("dream", () => createDream(ctx));
    combat = ctx.shared("combat", () => createCombat(ctx));
    potions = ctx.shared("potions", () => createPotions(ctx));
    wizard = getWizard(ctx);
    dream.setScene("school");
    P = dream.P;
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU + PI / 6, r = [];
      for (let k = 1; k <= 12; k++) { const a = a0 + (k / 12) * TAU; r.push({ x: Math.sin(a) * 4.5, z: Math.cos(a) * 4.5 }); }
      routes.push(r);
    }
    if (ctx.debug) ctx.debug.level6 = { dream, combat, potions, wizard };
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
    ui.setObjective(null); ui.setAction(null); ui.setTricks(null); ui.setCharge(null);
    objNow = ""; actNow = ""; pickSig = -1;
    ctx.setSpeaker(null);
    ctx.abilities.cancel();
    ctx.abilities.potion.disable();
    ctx.abilities.potion.onThrow = null; ctx.abilities.potion.onEmpty = null;
    ctx.abilities.targets = null;
    ctx.abilities.buttons({});
    ctx.army.show(false);
    goalOff();
    for (let i = 0; i < 3; i++) { const k = KINDS[i]; if (ingMark[k]) { ingMark[k].remove(); ingMark[k] = null; } ingId[k] = -1; ingHinted[k] = false; }
    // shared actors
    combat.reset();
    ctx.army.clear();
    potions.holdFlask(false);
    potions.reset();
    dream.setScene("school");
    P = dream.P;
    platypus.reset();
    wizard.setTalking(false);
    wizard.group.visible = false;
    colW.on = colC.on = false;
    // the player
    player.scripted = false; player.hidden = false; player.enabled = false; player.carrying = false;
    player.maxSpeed = 3; player.lock = 0; player.face = null; player.canJump = true; player.kx = player.kz = 0;
    player.stop();
    // flags of every beat
    sub = "";
    finished = 0; fallenN = 0; brewed = false; woken = 0; joined = 0;
    talking = false; camHeld = false; slowT = 0; nagT = 0; goalT = 0;
    cd.sting = cd.slap = cd.zap = 0;
    motifDone = false; staggerHinted = false; missHintT = 0; hunter = null; hunterT = -1; hunterHinted = false; caughtN = 0;
    poolDown = 0; bankAwake = false; pulsed = false; poolDoneT = -1;
    heldVer = 0; stillT = 0; chargeOn = false; badStirs = 0; wrongN = 0;
    flaskOn = false; refillT = 0; firstWake = false; wakeShot = false; wakeShotT = 0; twoPraised = false; missN = 0; emptyHinted = false;
    potionDoneT = -1; bodyCheckT = 0; freeT = 0; jumps = 0; fadeStarted = false;
  }

  // The dream as every playable beat needs it (called right after hardStop).
  function stage(px, pz, pyaw, wx, wzz) {
    combat.setWorld(dream);
    potions.setWorld(dream);
    combat.bodyTTL = Infinity;
    combat.onEvent = onCombat;
    ctx.abilities.targets = combat.enemies;
    player.teleport(px, pz, pyaw);
    wizard.group.visible = true;
    wizardPlace(wx, wzz);
    wizard.lookAt(px, pz);
    colW.on = true;
    ctx.setSpeaker(wizard.group, 2.3);
    A("dreamAmbience", true);
    FX("dreamMotes", true, 14, 0xcfd6ff);
  }
  function hud() {
    ui.showHud(true);
    ctx.abilities.buttons({ sting: true, zap: true, slap: true, jump: true });
  }
  function seedBodies(n) {
    for (let i = 0; i < n; i++) {
      const s = i < 6 ? P.soldiers[i] : i < 9 ? P.poolSpots[i - 6] : P.poolBank[(i - 9) % 3];
      combat.spawnBody("dreamSoldier", s.x, s.z, s.yaw || 0);
    }
  }
  function spawnSoldier(s, tag) {
    const e = combat.spawn("dreamSoldier", s.x, s.z, { yaw: s.yaw || 0, passive: true });
    e.tag = tag;
    FX("dissolve", s.x, dream.heightAt(s.x, s.z), s.z, 1.5, MIST, 18);
    return e;
  }

  // =====================================================================================================
  // 1-2  intro, find the wizard
  // =====================================================================================================
  function setupIntro() {
    stage(P.spawn.x, P.spawn.z, P.spawn.yaw || 0, P.wizard.x, P.wizard.z);
    step = "intro";
    platypus.sleep(true);
  }
  function startIntro() {
    hardStop();
    setupIntro();
    start();
  }
  function start() {
    const g = gen;
    M("play", "dream", { intensity: 0.2, at: "now", fade: 2 });
    A("dreamAmbience", true);
    cinema.titleCard({ kicker: "LEVEL 6", title: meta.title }, () => {
      if (g !== gen || step !== "intro") return;
      playIntro();
    });
  }
  function playIntro() {
    const g = gen, s = P.camSky, w = P.camWake;
    cinema.play([
      { shot: { pos: [s.pos.x, s.pos.y, s.pos.z], look: [s.look.x, s.look.y, s.look.z], fov: F(60), dur: 0 } },
      { call: () => cinema.fade("clear", 1.8) },
      { wait: 1.2 },
      { caption: "Another dream.", dur: 3.2, narr: true, hold: false },
      // four seconds down through the nebula, to the sleeper on the quilt
      { shot: { pos: [s.pos.x, s.pos.y, s.pos.z], look: [s.look.x, s.look.y, s.look.z], fov: F(60),
        to: { pos: [w.pos.x, w.pos.y, w.pos.z], look: [w.look.x, w.look.y, w.look.z], fov: F(40) }, dur: 4.2, ease: "inOut" } },
      { wait: 0.7 },
      { call: () => { platypus.sleep(false); platypus.wakeStretch(); A("yawn"); } },
      { shot: { pos: [w.pos.x, w.pos.y, w.pos.z], look: [w.look.x, w.look.y, w.look.z], fov: F(40),
        to: { pos: [w.pos.x - 0.5, w.pos.y + 0.12, w.pos.z + 0.25], fov: F(37) }, dur: 2.5, ease: "out" } },
    ], {
      skippable: true, release: 1.2,
      onSkip() { platypus.sleep(false); },
      onDone() { if (g === gen) beginFind(); },
    });
  }
  function startFind() {
    hardStop();
    stage(P.spawn.x, P.spawn.z, P.spawn.yaw || 0, P.wizard.x, P.wizard.z);
    M("play", "dream", { intensity: 0.2 });
    cinema.fade("clear", 0.8);
    beginFind();
  }
  function beginFind() {
    step = "find"; sub = "";
    platypus.sleep(false);
    hud();
    player.enabled = true;
    setObj("Find Wizard Wobble", ctx.touch ? "use the stick to walk" : "WASD or arrows to walk");
    goalAt(P.wizard.x, P.wizard.z, 0xc9b8ff);
    progress();
  }
  function updateFind() {
    const d = dist2(player.x, player.z, wz.x, wz.z);
    if (!motifDone && d < 6) {
      motifDone = true;
      M("motif", "wobble");
      wizard.gesture("wave");
    }
    if (d < 2.5) beginFight();
  }

  // =====================================================================================================
  // 3-4  LESSON 1 - the finish
  // =====================================================================================================
  function startFight() {
    hardStop();
    stage(-0.4, 3.2, 0, P.wizard.x, P.wizard.z);
    M("play", "dream", { intensity: 0.3 });
    hud();
    cinema.fade("clear", 0.8);
    beginFight();
  }
  function beginFight() {
    const g = gen;
    step = "fight"; sub = "talk";
    goalOff();
    setObj("Listen to Wizard Wobble", ctx.touch ? "tap to go on" : "E to go on");
    M("setIntensity", 0.3, 2);
    talk(P.camWizard, [
      { t: "Welcome back, little one.", g: "wave" },
      { t: "The people who took Pip will not ask nicely." },
      { t: "Tonight you learn to stop them.", g: "cast" },
    ], () => {
      // six soldiers of glass and mist rise out of the quilt
      for (let i = 0; i < 6; i++) spawnSoldier(P.soldiers[i], i);
      A("dissolve", 0);
      A("wizardAppear");
      M("setIntensity", 0.5, 2);
      cinema.shot({ pos: [1.2, 5.4, -9.6], look: [0, 0.7, 0.4], fov: F(48), to: { pos: [0.4, 4.6, -8.6] }, dur: 3.2, ease: "out" });
      camHeld = true;
      ctx.after(2.5, () => { if (g === gen) lessonFinish(); });
    }, true);
  }
  function fightObjective() {
    if (sub === "b") setObj("Tail Slap, then finish  (" + finished + "/6)", ctx.touch ? "Slap, then any hit" : "L, then any hit");
    else setObj("Sting, then finish  (" + finished + "/3)", ctx.touch ? "Sting twice, then once more" : "J or click twice, then once more");
  }
  function lessonFinish() {
    endTalk();
    sub = "a";
    fightObjective();
    ui.hint(ctx.touch ? "Tap Sting twice to stagger - then hit again to FINISH" : "Sting (J) twice to stagger - then hit again to FINISH", 6);
  }
  function lessonSlap() {
    sub = "b";
    fightObjective();
    // after the FINISH! call has had its moment (the two would overlap)
    const g = gen;
    ctx.after(1.1, () => { if (g === gen && step === "fight" && !talking) wizSay([{ t: "Faster: the tail.", g: "point" }]); });
    ui.hint(ctx.touch ? "Tail Slap knocks them flat - anything after that finishes." : "Tail Slap (L) knocks them flat - anything after that finishes.", 6);
    M("setIntensity", 0.62, 2);
    // the ones that are left start to circle, so where you stand matters
    const list = combat.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.alive && typeof e.tag === "number" && routes[e.tag]) e.setRoute(routes[e.tag], true);
    }
    hunterT = 6;
  }
  // one of the last three comes for the player with the slow grab
  function pickHunter() {
    const list = combat.enemies;
    let best = null, bd = -1;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive || e.staggered || e.state === "stunned") continue;
      const d = dist2(e.x, e.z, player.x, player.z);
      if (d > bd) { bd = d; best = e; }
    }
    if (!best) return;
    hunter = best;
    best.setRoute(null);
    best.passive = false;
    ui.hint("One of them is coming for you. Step away from its grab - or hit it first!", 4.5);
  }
  function updateFight(dt) {
    if (sub !== "a" && sub !== "b") return;
    if (sub === "b" && hunterT >= 0 && !talking) {
      hunterT -= dt;
      if (hunterT < 0 && combat.alive > 0 && combat.alive <= 3) pickHunter();
    }
    if (hunter && hunter.alive && hunter.state === "windup") {
      if (!hunterHinted) { hunterHinted = true; ui.hint("The red circle! Move out of it.", 2.2); }
    } else hunterHinted = false;
    // the marker sits on the nearest soldier still standing
    goalT -= dt;
    if (goalT <= 0) {
      goalT = 0.3;
      const e = nearestEnemy();
      if (e) goalAt(e.x, e.z, e.staggered ? GOLD : MIST, e.y); else goalOff();
    }
  }
  function nearestEnemy() {
    const list = combat.enemies;
    let best = null, bd = 1e9;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.alive) continue;
      const d = dist2(e.x, e.z, player.x, player.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // =====================================================================================================
  // 5  LESSON 2 - the pool
  // =====================================================================================================
  const POOL_CAM = { pos: { x: -2.6, y: 2.1, z: -4.6 }, look: { x: -7.4, y: 0.5, z: 2.4 }, fov: 46 };
  const POOL_WIZ = { x: -5.6, z: -1.9 };
  function startPool() {
    hardStop();
    stage(-3.2, -2.2, -0.9, POOL_WIZ.x, POOL_WIZ.z);
    finished = 6; fallenN = 6;
    seedBodies(6);
    M("play", "dream", { intensity: 0.5 });
    hud();
    cinema.fade("clear", 0.8);
    beginPool();
  }
  function beginPool() {
    step = "pool"; sub = "talk";
    hunter = null; hunterT = -1;
    goalOff();
    setObj("Listen to Wizard Wobble", ctx.touch ? "tap to go on" : "E to go on");
    wizardTo(POOL_WIZ.x, POOL_WIZ.z);
    // three wade into the dream pool, three more wait on the bank
    for (let i = 0; i < 3; i++) spawnSoldier(P.poolSpots[i], "pool");
    for (let i = 0; i < 3; i++) spawnSoldier(P.poolBank[i], "bank");
    A("dissolve", -0.4);
    FX("ring", P.pool.x, P.pool.z, 0x9fd8ff, P.pool.y + 0.02);
    talk(POOL_CAM, [{ t: "Water carries your spark.", g: "point" }], () => {
      sub = "pulse";
      setObj("Pulse them from the water", ctx.touch ? "wade in, then tap Pulse" : "wade in, then press K");
      ui.hint(ctx.touch ? "Wade into the glowing pool, then tap Pulse" : "Wade into the glowing pool, then press K (or right click)", 6);
      goalAt(P.poolEdge.x, P.poolEdge.z, 0x9fd8ff, P.pool.y);
      M("setIntensity", 0.5, 2);
    });
  }
  function poolAlive() {
    const list = combat.enemies;
    let n = 0;
    for (let i = 0; i < list.length; i++) if (list[i].alive && list[i].tag === "pool") n++;
    return n;
  }
  function wakeBank() {
    if (bankAwake) return;
    bankAwake = true;
    sub = "rest";
    const list = combat.enemies;
    for (let i = 0; i < list.length; i++) if (list[i].alive) list[i].passive = false;
    if (combat.alive > 0) {
      setObj("Knock out the rest  (" + fallenN + "/12)", "any attack you like");
      if (!talking) wizSay([{ t: "Now the others. Any way you like.", g: "cheer" }]);
      M("setIntensity", 0.65, 1.5);
    }
  }
  function onPulse(count) {
    if (count <= 0) {
      ui.hint("Nobody is in the water near you. Wade closer.", 2.2);
      return;
    }
    slow(0.35, 0.4);
    cinema.shake(0.02, 0.3);
    ui.call("ZAP!", count > 1 ? count + " at once" : "", count > 1 ? "perfect" : "good");
    if (!pulsed) { pulsed = true; M("stinger", "discover"); }
    FX("ring", player.x, player.z, 0x9fd8ff, P.pool.y + 0.02);
    dream.rippleAt(player.x, player.z, 3);
    // the spark carries: everyone it reached in the water goes down together
    const g = gen;
    ctx.after(0.3, () => {
      if (g !== gen) return;
      const list = combat.enemies;
      bodyTmp.length = 0;
      for (let i = 0; i < list.length; i++) { const e = list[i]; if (e.alive && (e.state === "stunned" || e.staggered) && dream.inPool(e.x, e.z)) bodyTmp.push(e); }
      tmpP.x = player.x; tmpP.z = player.z;
      for (let i = 0; i < bodyTmp.length; i++) { dream.rippleAt(bodyTmp[i].x, bodyTmp[i].z, 2); bodyTmp[i].knockOut(tmpP); }
      bodyTmp.length = 0;
    });
  }
  function updatePool(dt) {
    if (sub === "end" && poolDoneT >= 0) {
      poolDoneT = Math.max(0, poolDoneT - dt);
      if (poolDoneT <= 0 && !talking) { poolDoneT = -1; beginBrew(); }
      return;
    }
    if (sub !== "pulse" && sub !== "rest") return;
    goalT -= dt;
    if (goalT <= 0) {
      goalT = 0.3;
      if (sub === "pulse" && !player.inWater) goalAt(P.poolEdge.x, P.poolEdge.z, 0x9fd8ff, P.pool.y);
      else { const e = nearestEnemy(); if (e) goalAt(e.x, e.z, e.staggered ? GOLD : MIST, e.y); else goalOff(); }
    }
    if (poolDoneT >= 0) {
      poolDoneT = Math.max(0, poolDoneT - dt);
      if (poolDoneT <= 0 && !talking) { poolDoneT = -1; beginBrew(); }
    }
  }

  // =====================================================================================================
  // 6  LESSON 3 - the brew
  // =====================================================================================================
  function startBrew() {
    hardStop();
    stage(5.2, 0.2, 1.0, P.wizardCauldron.x, P.wizardCauldron.z);
    finished = 6; fallenN = 12;
    seedBodies(12);
    M("play", "dream", { intensity: 0.35 });
    hud();
    cinema.fade("clear", 0.8);
    beginBrew();
  }
  function showCauldron() {
    const c = potions.cauldron;
    c.place(P.cauldron.x, P.cauldron.z);
    c.recipe = KINDS.slice();
    c.show(true);
    colC.x = P.cauldron.x; colC.z = P.cauldron.z; colC.r = c.radius || 0.62; colC.on = true;
  }
  function beginBrew() {
    step = "brew"; sub = "talk";
    hunter = null;
    goalOff();
    setObj("Listen to Wizard Wobble", ctx.touch ? "tap to go on" : "E to go on");
    wizardTo(P.wizardCauldron.x, P.wizardCauldron.z);
    showCauldron();
    A("wizardAppear");
    M("setIntensity", 0.35, 3);
    talk(P.camCauldron, [
      { t: "They are only sleeping." },
      { t: "I know something better.", g: "cast" },
    ], () => {
      sub = "gather";
      for (let i = 0; i < 3; i++) spawnIngredient(KINDS[i]);
      brewObjective();
      ui.hint("Three ingredients glow around the island. Bring them to the cauldron.", 5);
    });
  }
  function spawnIngredient(kind) {
    const p = P.ingredients[kind];
    ingId[kind] = potions.ingredients.spawn(kind, p.x, p.z, kind === "dewdrop" ? 1.2 : undefined);
    if (ingMark[kind]) ingMark[kind].remove();
    ingMark[kind] = FX("beacon", p.x, dream.heightAt(p.x, p.z), p.z, KIND_HEX[kind]) || null;
    ingHinted[kind] = false;
  }
  function gathered() { return potions.ingredients.held.length + potions.cauldron.filled; }
  function brewObjective() {
    const c = potions.cauldron, held = potions.ingredients.held.length;
    if (sub === "stir") setObj("Stir on the beat  (" + c.stirs + "/4)", ctx.touch ? "tap Stir as the ring closes" : "E as the ring closes");
    else if (sub === "take") setObj("Take the potions", ctx.touch ? "tap Take potions" : "E at the cauldron");
    else if (held + c.filled >= 3) {
      setObj("Add them to the cauldron  (" + c.filled + "/3)", "match the runes, left to right");
      goalAt(c.x, c.z, GREEN);
    } else {
      setObj("Bring the three ingredients  (" + (held + c.filled) + "/3)", held ? "or add what you carry at the cauldron" : "follow the lights");
      goalOff();
    }
  }
  function takeIngredient(kind) {
    const id = ingId[kind];
    if (id < 0) return;
    const got = potions.ingredients.collect(id);
    if (!got) return;
    ingId[kind] = -1;
    if (ingMark[kind]) { ingMark[kind].remove(); ingMark[kind] = null; }
    heldVer++;
    floatAtPlayer(NAME[kind]);
    A("pickup");
    progress();
    brewObjective();
    if (gathered() >= 3) ui.hint("All three! The runes on the cauldron show the order: blue, silver, clear.", 5);
  }
  function showPick(on) {
    const sig = on ? heldVer : -1;
    if (sig === pickSig) return;
    pickSig = sig;
    if (!on) { ui.setTricks(null); return; }
    const h = potions.ingredients.held;
    pickList.length = 0;
    for (let i = 0; i < h.length; i++) pickList.push({ label: NAME[h[i]] });
    ui.setTricks(pickList);
  }
  function addIngredient(i) {
    const c = potions.cauldron, h = potions.ingredients.held;
    if (sub !== "gather" || i < 0 || i >= h.length || c.stirring || c.done) return;
    if (dist2(player.x, player.z, c.x, c.z) > 2.0) return;
    const kind = h[i];
    potions.ingredients.drop(kind);
    heldVer++;
    progress();
    if (c.add(kind)) {
      floatAtPlayer(NAME[kind] + " in!");
      if (c.filled >= 3) { beginStir(); return; }
      brewObjective();
      return;
    }
    // wrong: a grey puff, the cauldron is empty again, and everything that went in is back on its mound
    wrongN++;
    for (let k = 0; k < 3; k++) { const kd = KINDS[k]; if (h.indexOf(kd) < 0 && ingId[kd] < 0) spawnIngredient(kd); }
    ui.hint("Wrong order! Follow the runes: " + RUNE[c.recipe[0]] + " first - the " + c.recipe[0] + "." + (wrongN > 1 ? " Then " + c.recipe[1] + ", then " + c.recipe[2] + "." : ""), 5);
    brewObjective();
  }
  function beginStir() {
    sub = "stir";
    ui.clearSpeech(); sayQ.length = 0; sayThen = null; wizard.setTalking(false); // E must reach the spoon
    showPick(false);
    potions.cauldron.startStir();
    badStirs = 0;
    M("setIntensity", 0.75, 2);
    brewObjective();
    goalAt(potions.cauldron.x, potions.cauldron.z, GREEN);
    ui.hint(ctx.touch ? "Stir on the beat: tap Stir as the ring closes" : "Stir on the beat: press E as the ring closes", 6);
  }
  function stirPress() {
    const c = potions.cauldron, m = ctx.music;
    let q = 1;
    if (m && m.bpm > 0 && typeof m.beatPhase === "function") {
      const ph = m.beatPhase(), d = Math.min(ph, 1 - ph);
      // forgiving, and more so the longer it takes: nobody is ever stuck at the spoon
      q = d <= (badStirs >= 8 ? 0.5 : badStirs >= 4 ? 0.3 : 0.2) ? 1 : 0;
    }
    progress();
    if (c.stir(q)) {
      badStirs = 0;
      ui.call(c.stirs >= 4 ? "BREWED!" : "GOOD!", c.stirs + " / 4", c.stirs >= 4 ? "perfect" : "good");
      if (c.done || c.stirs >= 4) { brewDone(); return; }
      brewObjective();
    } else {
      badStirs++;
      if (badStirs === 2 || badStirs === 5) ui.hint("Listen to the music. Stir just as the ring closes on the brew.", 3);
    }
  }
  function brewDone() {
    brewed = true;
    sub = "take";
    potions.cauldron.beat(null);
    setObj("Stir on the beat  (4/4)", "");
    M("stinger", "transform");
    ui.objectiveDone();
    A("questDone");
    objNow = "";
    const g = gen;
    ctx.after(1.1, () => { if (g === gen && sub === "take") brewObjective(); });
    wizard.gesture("cheer");
  }
  function enablePotions(n) {
    const pot = ctx.abilities.potion;
    pot.enable({ count: n, max: 5, targets: combat.bodies });
    pot.onThrow = onThrow;
    pot.onEmpty = onEmpty;
    potions.bodies = combat.bodies;
    potions.allies = combat.allies;
    potions.onTransform = onTransform;
    potions.onJoined = onJoined;
    potions.onSplash = onSplash;
    potions.onMiss = onMiss;
  }
  function takePotions() {
    const c = potions.cauldron, pot = ctx.abilities.potion;
    if (!c.done) return;
    if (step === "brew") {
      c.take();
      enablePotions(3);
      refillT = REFILL_SECONDS;
      floatAtPlayer("+3 potions");
      setAct(null);
      beginPotion();
      return;
    }
    if (!canRefill()) return;
    c.take();
    pot.add(3);
    refillT = REFILL_SECONDS;
    emptyHinted = false;
    floatAtPlayer("+3 potions");
    progress();
    goalT = 0;
  }
  function canRefill() {
    const pot = ctx.abilities.potion;
    return pot.on && pot.count < pot.max && potions.cauldron.ready !== false && (refillT <= 0 || pot.count === 0);
  }
  function updateBrew(dt) {
    const c = potions.cauldron;
    if (sub === "gather") {
      let near = false;
      for (let i = 0; i < 3; i++) {
        const kind = KINDS[i];
        if (ingId[kind] < 0) continue;
        const p = P.ingredients[kind], d = dist2(player.x, player.z, p.x, p.z);
        if (kind === "glowcap") {
          if (d < 0.85) takeIngredient(kind);
          else if (d < 4.2 && !ingHinted[kind]) { ingHinted[kind] = true; ui.hint("A little moat. Hop over it - or wade.", 3); }
        } else if (kind === "moonpetal") {
          if (d < 1.5) {
            near = true;
            if (player.speed < 0.25 && player.grounded) {
              stillT += dt;
              if (!chargeOn) ui.hint("", 0.01); // the hint and the "Hold still" bar share the spot: the bar wins
              chargeOn = true;
              ui.setCharge(clamp(stillT, 0, 1), "Hold still...", 1);
              if (stillT >= 1) { chargeOn = false; ui.setCharge(null); stillT = 0; takeIngredient(kind); }
            } else {
              stillT = 0;
              if (chargeOn) { chargeOn = false; ui.setCharge(null); }
              if (!ingHinted[kind]) { ingHinted[kind] = true; ui.hint("Shh. The moonpetal only opens when you stand perfectly still.", 4); }
            }
          }
        } else if (d < 0.95) {
          if (player.y > dream.heightAt(player.x, player.z) + 0.4) takeIngredient(kind);
          else if (!ingHinted[kind]) { ingHinted[kind] = true; ui.hint(ctx.touch ? "The dewdrop floats. Jump for it!" : "The dewdrop floats. Jump for it! (Space)", 3.5); }
        } else if (d > 3) ingHinted[kind] = false;
      }
      if (!near) { stillT = 0; if (chargeOn) { chargeOn = false; ui.setCharge(null); } }
      const h = potions.ingredients.held;
      if (h.length && dist2(player.x, player.z, c.x, c.z) < 1.9 && !talking) {
        setAct(ADD_LABEL[h[0]]);
        showPick(h.length > 1);
      } else { setAct(null); showPick(false); }
    } else if (sub === "stir") {
      const m = ctx.music;
      c.beat(m && typeof m.beatPhase === "function" ? m.beatPhase() : null);
      setAct(dist2(player.x, player.z, c.x, c.z) < 2.3 ? "Stir" : null);
    } else if (sub === "take") {
      setAct(dist2(player.x, player.z, c.x, c.z) < 2.3 ? "Take potions" : null);
      goalAt(c.x, c.z, GREEN);
    }
  }

  // =====================================================================================================
  // 7  LESSON 4 - the potion
  // =====================================================================================================
  const FIELD_WIZ = { x: -4.6, z: 7.4 };
  // Brew the cauldron without the mini-game (skip points): the real calls, with their sounds held back.
  function brewSilently() {
    const c = potions.cauldron, names = ["ingredient", "stir", "brewDone", "brewFail"], keep = [];
    for (let i = 0; i < names.length; i++) { keep.push(audio[names[i]]); if (typeof audio[names[i]] === "function") audio[names[i]] = noop; }
    try {
      c.reset();
      for (let i = 0; i < 3; i++) c.add(c.recipe[i]);
      c.startStir();
      for (let i = 0; i < 4; i++) c.stir(1);
    } finally {
      for (let i = 0; i < names.length; i++) audio[names[i]] = keep[i];
    }
  }
  function noop() {}
  function startPotion() {
    hardStop();
    stage(5.6, 4.2, -0.9, P.wizardCauldron.x, P.wizardCauldron.z);
    finished = 6; fallenN = 12; brewed = true;
    seedBodies(5);
    showCauldron();
    brewSilently();
    enablePotions(3);
    refillT = REFILL_SECONDS;
    M("play", "dream", { intensity: 0.6 });
    hud();
    cinema.fade("clear", 0.8);
    beginPotion();
  }
  // The fallen drift, as mist, to the potion field: five of them lie there; the others thin away.
  function relocateBodies() {
    const list = combat.bodies;
    bodyTmp.length = 0;
    for (let i = 0; i < list.length; i++) if (list[i].alive !== false) bodyTmp.push(list[i]);
    let k = 0;
    for (let i = 0; i < bodyTmp.length; i++) {
      const b = bodyTmp[i];
      FX("dissolve", b.x, b.y, b.z, 0.6, MIST, 22);
      if (k < NEED_WOKEN) {
        const f = P.fallen[k++];
        b.x = f.x; b.z = f.z; b.yaw = f.yaw || 0;
        FX("dissolve", f.x, dream.heightAt(f.x, f.z), f.z, 0.6, MIST, 26);
      } else if (b.enemy && typeof b.enemy.remove === "function") b.enemy.remove();
    }
    bodyTmp.length = 0;
    while (k < NEED_WOKEN) { const f = P.fallen[k++]; combat.spawnBody("dreamSoldier", f.x, f.z, f.yaw || 0); }
    A("dissolve", 0);
  }
  function beginPotion() {
    step = "potion"; sub = "talk";
    goalOff();
    setObj("Listen to Wizard Wobble", ctx.touch ? "tap to go on" : "E to go on");
    relocateBodies();
    wizardTo(FIELD_WIZ.x, FIELD_WIZ.z);
    M("setIntensity", 0.6, 2);
    talk(P.camField, [{ t: "Throw it where they lie.", g: "point" }], () => {
      sub = "throw";
      ctx.army.show("Friends");
      potionObjective();
      ui.hint(ctx.touch ? "Hold the potion button, let go to throw" : "Hold Q to aim, let go to throw", 6);
      goalT = 0;
    });
  }
  function potionObjective() {
    setObj("Wake them as platypuses  (" + Math.min(woken, NEED_WOKEN) + "/" + NEED_WOKEN + ")", ctx.touch ? "hold Potion, let go to throw" : "hold Q, let go to throw");
  }
  function onThrow(from, to, seconds, apex, target) {
    potions.throw(from, to, seconds, apex, target);
    progress();
  }
  function onEmpty() {
    ui.hint("No potions left! The cauldron has more.", 2.4);
    goalT = 0;
  }
  function onSplash(x, z, n) {
    if (n <= 0) return;
    progress();
    if (!firstWake && step === "potion" && !talking) beginWakeShot(x, z);
    if (n >= 2 && !twoPraised) {
      twoPraised = true;
      ui.call("TWO WITH ONE!", "", "perfect");
      wizard.gesture("cheer");
      if (!talking && !wakeShot) wizSay([{ t: "Two with one!" }]);
    }
  }
  function onMiss() {
    missN++;
    ui.hint(missN > 1 ? "Aim at the sleeping soldiers: the ring turns green when it will land on one."
      : "Missed! Throw it right where they lie.", 3.2);
  }
  // the first waking, close and slow (once)
  function beginWakeShot(x, z) {
    firstWake = true;
    wakeShot = true;
    wakeShotT = 11;
    player.enabled = false;
    player.stop();
    ctx.abilities.cancel();
    const gy = dream.heightAt(x, z);
    let dx = player.x - x, dz = player.z - z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d; dz /= d;
    cinema.letterbox(true);
    cinema.shot({ pos: [x + dx * 2.5 + dz * 1.0, gy + 0.62, z + dz * 2.5 - dx * 1.0], look: [x, gy + 0.45, z], fov: F(40),
      to: { pos: [x + dx * 1.8 + dz * 0.5, gy + 0.42, z + dz * 1.8 - dx * 0.5], look: [x, gy + 0.3, z], fov: F(36) }, dur: 8, ease: "out" });
    ctx.setTimeScale(0.5, 0.3);
  }
  function endWakeShot() {
    if (!wakeShot) return;
    wakeShot = false;
    ctx.setTimeScale(1, 0.3);
    cinema.letterbox(false);
    cinema.releaseCamera(1.0);
    if (!talking && step === "potion") player.enabled = true;
    ui.hint("A new friend! Wake the others.", 3);
  }
  function onTransform(body, x, z) {
    const ally = combat.addAlly(x, z, { newborn: true, look: woken * 3 + 1 });
    woken++;
    progress();
    M("stinger", woken === 1 ? "discover" : "armyUp");
    if (step === "potion") potionObjective();
    if (wakeShot) {
      // the 2.6 s of the change were slow; the sit-up plays at full speed
      const g = gen;
      ctx.after(0.7, () => { if (g === gen && wakeShot) ctx.setTimeScale(1, 0.4); });
    }
    return ally;
  }
  function onJoined() {
    joined++;
    if (wakeShot) { const g = gen; ctx.after(0.7, () => { if (g === gen) endWakeShot(); }); }
    if (woken >= NEED_WOKEN && joined >= woken && step === "potion" && potionDoneT < 0) potionDoneT = 1.2;
  }
  function freeFallenSpot() {
    for (let i = 0; i < P.fallen.length; i++) {
      const f = P.fallen[i];
      let ok = true;
      for (let k = 0; k < combat.bodies.length && ok; k++) { const b = combat.bodies[k]; if (b.alive !== false && dist2(b.x, b.z, f.x, f.z) < 0.9) ok = false; }
      for (let k = 0; k < combat.allies.length && ok; k++) { const a = combat.allies[k]; if (dist2(a.x, a.z, f.x, f.z) < 0.7) ok = false; }
      if (ok && dist2(player.x, player.z, f.x, f.z) > 0.9) return f;
    }
    return null;
  }
  function nearestBody() {
    const list = combat.bodies;
    let best = null, bd = 1e9;
    for (let i = 0; i < list.length; i++) {
      const b = list[i];
      if (b.alive === false || b.targetable === false) continue;
      const d = dist2(b.x, b.z, player.x, player.z);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function updatePotion(dt) {
    const pot = ctx.abilities.potion, c = potions.cauldron;
    if (pot.aiming !== flaskOn) { flaskOn = pot.aiming; potions.holdFlask(flaskOn); }
    if (refillT > 0) refillT -= dt;
    if (wakeShot) {
      wakeShotT -= ctx.time.rawDt || dt;
      if (wakeShotT <= 0) endWakeShot();
    }
    if (sub !== "throw") return;
    // the refill: every 20 s, or at once when the flasks have run out
    const nearC = dist2(player.x, player.z, c.x, c.z) < 2.3;
    setAct(nearC && canRefill() && !wakeShot ? "Take potions" : null);
    if (pot.count === 0 && !pot.aiming && potions.transforming === 0 && woken < NEED_WOKEN && !emptyHinted && !wakeShot) {
      emptyHinted = true;
      ui.hint("Out of potions. The cauldron has filled again: take some more.", 3.5);
    }
    goalT -= dt;
    if (goalT <= 0) {
      goalT = 0.4;
      if (woken >= NEED_WOKEN) goalOff();
      else if (pot.count === 0) goalAt(c.x, c.z, GREEN);
      else { const b = nearestBody(); if (b) goalAt(b.x, b.z, GREEN, b.y); else goalOff(); }
    }
    // never a dead end: if a sleeper is missing, another drifts in
    bodyCheckT -= dt;
    if (bodyCheckT <= 0) {
      bodyCheckT = 1.5;
      if (potions.transforming === 0 && woken < NEED_WOKEN) {
        let n = 0;
        for (let i = 0; i < combat.bodies.length; i++) if (combat.bodies[i].alive !== false) n++;
        if (n < NEED_WOKEN - woken) {
          const f = freeFallenSpot();
          if (f) { combat.spawnBody("dreamSoldier", f.x, f.z, f.yaw || 0); FX("dissolve", f.x, dream.heightAt(f.x, f.z), f.z, 0.6, MIST, 26); A("dissolve", 0); }
        }
      }
      // every newborn is up although an "allyJoined" went missing: go on anyway
      if (woken >= NEED_WOKEN && potionDoneT < 0 && potions.transforming === 0 && ctx.army.count >= NEED_WOKEN) {
        let up = true;
        for (let i = 0; i < combat.allies.length; i++) if (combat.allies[i].state === "newborn") up = false;
        if (up) potionDoneT = 2.5;
      }
    }
    if (potionDoneT >= 0 && !wakeShot && !talking) {
      potionDoneT -= dt;
      if (potionDoneT < 0) beginEnding();
    }
  }

  // =====================================================================================================
  // 8-9  the ending
  // =====================================================================================================
  function startEnding() {
    hardStop();
    stage(0.4, 6.2, PI, FIELD_WIZ.x, FIELD_WIZ.z);
    finished = 6; fallenN = 12; brewed = true; woken = NEED_WOKEN; joined = NEED_WOKEN;
    showCauldron();
    brewSilently();
    potions.allies = combat.allies;
    for (let i = 0; i < NEED_WOKEN; i++) { const f = P.fallen[i]; combat.addAlly(f.x, f.z, { look: i * 3 + 1 }); }
    ctx.army.show("Friends");
    M("play", "dream", { intensity: 0.45 });
    hud();
    cinema.fade("clear", 0.8);
    beginEnding();
  }
  function beginEnding() {
    step = "ending"; sub = "talk";
    goalOff();
    setAct(null);
    ctx.abilities.cancel();
    if (flaskOn) { flaskOn = false; potions.holdFlask(false); }
    ctx.abilities.potion.disable();
    ctx.army.show("Friends");
    combat.order("follow");
    ui.objectiveDone();
    A("questDone");
    objNow = "";
    M("setIntensity", 0.45, 3);
    // he comes over to the six of you
    const dx = wz.x - player.x, dz = wz.z - player.z, d = Math.hypot(dx, dz) || 1;
    tmpP.x = player.x + (dx / d) * 2.6; tmpP.z = player.z + (dz / d) * 2.6;
    dream.confine(tmpP, 0.6);
    wizardTo(tmpP.x, tmpP.z);
    talk(null, [
      { t: "Not an end. A new beginning.", g: "cast" },
      { t: "Remember this when you wake.", g: "point" },
    ], () => {
      sub = "free";
      freeT = FREE_PLAY;
      setObj("Run with your new friends", ctx.touch ? "jump - they copy you!" : "Space - they copy you!");
      ui.hint("They follow you everywhere. Jump - and watch them copy you!", 5);
    });
  }
  function beginFade() {
    if (fadeStarted) return;
    fadeStarted = true;
    sub = "fade";
    const g = gen;
    player.enabled = false;
    player.stop();
    ctx.abilities.cancel();
    setObj(null);
    setAct(null);
    ctx.army.show(false);
    ui.clearSpeech(); sayQ.length = 0; sayThen = null; wizard.setTalking(false);
    player.face = Math.atan2(wz.x - player.x, wz.z - player.z);
    player.lock = 1;
    // the nebula dims
    dream.setGlow(0, 5);
    M("setIntensity", 0.1, 4);
    M("motif", "platypus");
    cinema.letterbox(true);
    const ux = Math.sin(player.face), uz = Math.cos(player.face);
    cinema.shot({ pos: [player.x - ux * 3.6 + uz * 2.2, player.y + 1.5, player.z - uz * 3.6 - ux * 2.2], look: platypus.group, lookY: 0.4, fov: F(46),
      to: { pos: [player.x - ux * 6.2 + uz * 0.8, player.y + 3.6, player.z - uz * 6.2 - ux * 0.8], fov: F(50) }, dur: 12, ease: "inOut" });
    camHeld = true;
    // one by one the followers turn to motes
    const n = combat.allies.length;
    for (let i = 0; i < n; i++) ctx.after(1.2 + i * 0.85, () => { if (g === gen) moteOne(); });
    ctx.after(1.2 + n * 0.85 + 0.7, () => {
      if (g !== gen) return;
      let said = false;
      const go = () => { if (g !== gen || said) return; said = true; wizardFades(); };
      wizSay([{ t: "Wake up. They are coming.", g: "point" }], go);
      ctx.after(7, go); // the bubble normally closes by itself; never wait on it for ever
    });
  }
  function moteOne() {
    const list = combat.allies, n = list.length;
    if (!n) return;
    const a = list[n - 1];
    FX("dissolve", a.x, a.y, a.z, 0.5, 0xd8e6ff, 30);
    FX("sparkle", v1.set(a.x, a.y + 0.3, a.z), 0xfff2c8, 10);
    A("dissolve", 0);
    A("tribeChirp", "sleepy", 0.5, 0, 1.1);
    combat.setAllies(n - 1);
  }
  function wizardFades() {
    const g = gen;
    ui.clearSpeech(); sayQ.length = 0; sayThen = null;
    wizard.setTalking(false);
    FX("dissolve", wz.x, wizard.group.position.y, wz.z, 1.9, 0xc9b8ff, 48);
    FX("sparkle", v1.set(wz.x, wizard.group.position.y + 1.2, wz.z), 0xc9b8ff, 16);
    A("dissolve", 0);
    wizard.group.visible = false;
    colW.on = false;
    ui.showHud(false);
    M("stop", 3);
    cinema.fade("black", 2.5, () => { if (g === gen) finish(); });
  }
  function finish() {
    step = "done"; sub = "";
    A("dreamAmbience", false);
    ui.showComplete({ kicker: "LEVEL 6", title: "COMPLETE", sub: "Wake up. They are coming." }, () => ctx.complete());
  }
  function updateEnding(dt) {
    if (sub !== "free") return;
    freeT -= dt;
    if (freeT <= 0) beginFade();
  }

  // =====================================================================================================
  // combat events and the attacks
  // =====================================================================================================
  function onCombat(type, a, b) {
    if (type === "down") onDown(a);
    else if (type === "stagger") {
      if (!staggerHinted && step === "fight" && sub === "a") { staggerHinted = true; ui.hint("It is staggering - see the gold ring. Hit again to FINISH!", 3.5); }
    } else if (type === "caught") onCaught(a);
  }
  function onDown(e) {
    fallenN++;
    progress();
    goalT = 0;
    if (e) { FX("dissolve", e.x, e.y, e.z, 1.3, MIST, 14); A("dissolve", 0); }
    if (e === hunter) hunter = null;
    if (step === "fight") {
      finished++;
      slow(0.35, 0.25);
      ui.call("FINISH!", finished + " / 6", "perfect");
      A("objective");
      if (finished >= 6) {
        fightObjective();
        ui.objectiveDone();
        A("questDone");
        objNow = "";
        goalOff();
        sub = "end";
        const g = gen;
        ctx.after(1.6, () => { if (g === gen && step === "fight") beginPool(); });
      } else if (finished === 3 && sub === "a") lessonSlap();
      else fightObjective();
      return;
    }
    if (step === "pool") {
      if (e && e.tag === "pool") poolDown++;
      if (combat.alive <= 0) {
        setObj("Knock out the rest  (" + fallenN + "/12)", "any attack you like");
        ui.objectiveDone();
        A("questDone");
        objNow = "";
        goalOff();
        sub = "end";
        poolDoneT = 1.8;
        return;
      }
      if (!bankAwake && poolAlive() === 0) { const g = gen; ctx.after(0.9, () => { if (g === gen && step === "pool") wakeBank(); }); }
      else if (bankAwake) setObj("Knock out the rest  (" + fallenN + "/12)", "any attack you like");
    }
  }
  // the grab is taught, never punished: a soft bump back and a chime
  function onCaught(e) {
    const dx = player.x - e.x, dz = player.z - e.z, d = Math.hypot(dx, dz) || 1;
    player.kx = (dx / d) * 14; player.kz = (dz / d) * 14;
    A("cushionLand", 0.5);
    A("uiClick");
    FX("ring", player.x, player.z, 0xffffff, player.y + 0.03);
    caughtN++;
    ui.hint(caughtN > 1 ? "Bumped again! Step out of the red circle, or hit it before it grabs."
      : "Bump! When the red circle shows, step out of it - or strike first.", 3.2);
    if (typeof e.stun === "function") e.stun(1.6);
  }
  function onStrike(kind, result) {
    if (result === "miss") {
      if (missHintT <= 0) {
        const e = nearestEnemy();
        if (e && dist2(e.x, e.z, player.x, player.z) < 4.5) { missHintT = 3; ui.hint("Closer! Stand right next to it.", 1.8); }
      }
      return;
    }
    if (result === "blocked") { ui.hint("Wait - it is still rising out of the quilt.", 1.6); return; }
    A(kind === "sting" ? "stingHit" : "tailSlapHit");
    cinema.shake(result === "finish" ? 0.022 : 0.012, result === "finish" ? 0.25 : 0.14);
  }
  function attack(name) {
    const kind = name === "primary" ? "sting" : name === "tailSlap" ? "slap" : name === "secondary" ? "pulse" : null;
    if (!kind) return false;
    if (platypus.acting || !player.enabled || talking || wakeShot || player.lock > 0) return true;
    if (kind === "pulse" && !player.inWater) { ui.hint("The pulse needs water!", 1.6); return true; }
    const g = gen;
    progress();
    if (kind === "pulse") {
      if (cd.zap > 0) return true;
      cd.zap = CD.zap;
      const t = platypus.zapFireTime || 0.3;
      platypus.zap();
      A("zapCharge");
      player.lock = t + 0.25;
      ctx.after(t, () => {
        if (g !== gen) return;
        A("zapFire");
        const r = combat.strike("pulse");
        onPulse(r.count | 0);
      });
      return true;
    }
    if ((kind === "sting" && cd.sting > 0) || (kind === "slap" && cd.slap > 0)) return true;
    const fin = combat.wouldFinish(kind);
    const t = fin ? platypus.finisherHitTime : kind === "slap" ? platypus.slapHitTime : platypus.stingHitTime;
    if (fin) { platypus.finisher(); A("trickWhoosh", 2); }
    else if (kind === "slap") { platypus.tailSlap(); A("tailSlap"); }
    else { platypus.sting(); A("sting"); }
    if (kind === "slap") cd.slap = CD.slap; else cd.sting = CD.sting;
    if (fin) cd.sting = cd.slap = Math.max(cd.sting, 0.5);
    player.lock = (t || 0.25) + 0.12;
    ctx.after(t || 0.25, () => {
      if (g !== gen) return;
      const r = combat.strike(fin ? "finisher" : kind);
      onStrike(fin ? "finisher" : kind, r.result);
    });
    return true;
  }

  // =====================================================================================================
  // hints for a player who has stopped
  // =====================================================================================================
  function nag() {
    if (talking || wakeShot || !player.enabled) return;
    if (step === "find") ui.hint("Wizard Wobble floats under the light. Walk up to him.", 4);
    else if (step === "fight" && sub === "a") ui.hint(ctx.touch ? "Stand next to a soldier. Tap Sting twice, then hit once more." : "Stand next to a soldier. Sting (J) twice, then hit once more.", 4.5);
    else if (step === "fight" && sub === "b") ui.hint(ctx.touch ? "Tail Slap one, then hit it again straight away." : "Tail Slap (L) one, then hit it again straight away.", 4.5);
    else if (step === "pool" && sub === "pulse") ui.hint(ctx.touch ? "Wade into the glowing pool next to them and tap Pulse." : "Wade into the glowing pool next to them and press K.", 4.5);
    else if (step === "pool" && sub === "rest") ui.hint("Sting, slap or pulse: knock the last ones out any way you like.", 4.5);
    else if (step === "brew" && sub === "gather") {
      const h = potions.ingredients.held;
      if (gathered() >= 3 || (h.length && ingId.glowcap < 0 && ingId.moonpetal < 0 && ingId.dewdrop < 0)) ui.hint("Carry them to the cauldron and add them in rune order: blue, silver, clear.", 4.5);
      else if (ingId.glowcap >= 0) ui.hint("The blue glowcap grows on the mound inside the little moat.", 4.5);
      else if (ingId.moonpetal >= 0) ui.hint("The silver moonpetal opens if you stand still beside it.", 4.5);
      else ui.hint("The dewdrop floats above its mound. Jump up to it.", 4.5);
    } else if (step === "brew" && sub === "stir") ui.hint(ctx.touch ? "Go to the cauldron and tap Stir on the beat." : "Go to the cauldron and press E on the beat.", 4.5);
    else if (step === "brew" && sub === "take") ui.hint("The potion is ready. Take it from the cauldron.", 4);
    else if (step === "potion" && sub === "throw") {
      if (ctx.abilities.potion.count > 0) ui.hint(ctx.touch ? "Hold the potion button, aim at a sleeping soldier, let go." : "Hold Q, aim at a sleeping soldier, let go to throw.", 4.5);
      else ui.hint("Fetch more potions from the cauldron.", 4);
    }
  }

  // =====================================================================================================
  // level interface
  // =====================================================================================================
  function enter() {
    hardStop();
    dream.group.add(wizard.group, combat.group, potions.group);
    ctx.setWorld(dream);
    FX("setGround", dream.heightAt, groundWater);
    ctx.colliders.push(colW, colC);
    setupIntro();
  }

  function update(dt, time) {
    if (step === "boot") return;
    const raw = ctx.time.rawDt || dt;
    if (slowT > 0) { slowT -= raw; if (slowT <= 0 && !wakeShot) ctx.setTimeScale(1, 0.2); }
    if (cd.sting > 0) cd.sting = Math.max(0, cd.sting - dt);
    if (cd.slap > 0) cd.slap = Math.max(0, cd.slap - dt);
    if (cd.zap > 0) cd.zap = Math.max(0, cd.zap - dt);
    if (missHintT > 0) missHintT -= dt;
    if (step !== "intro" && step !== "done") {
      ui.setCooldown("sting", cd.sting / CD.sting);
      ui.setCooldown("slap", cd.slap / CD.slap);
      ui.setCooldown("zap", cd.zap / CD.zap);
      ui.setZapUsable(!!player.inWater, false);
    }
    combat.update(dt, time);
    potions.update(dt, time);
    updateWizard(dt, time);
    if (step === "find") updateFind();
    else if (step === "fight") updateFight(dt);
    else if (step === "pool") updatePool(dt);
    else if (step === "brew") updateBrew(dt);
    else if (step === "potion") updatePotion(dt);
    else if (step === "ending") updateEnding(dt);
    if (step !== "intro" && step !== "done") {
      nagT += dt;
      if (nagT > 16) { nagT = 0; nag(); }
    }
  }

  function onAction(name) {
    if (step === "boot" || step === "intro" || step === "done") return false;
    if (name === "jump") { progress(); return false; }
    if (name === "interact") {
      if (talking || wakeShot || !player.enabled) return false;
      progress();
      if (step === "brew") {
        if (sub === "gather") addIngredient(0);
        else if (sub === "stir") { if (dist2(player.x, player.z, potions.cauldron.x, potions.cauldron.z) < 2.3) stirPress(); }
        else if (sub === "take") { if (dist2(player.x, player.z, potions.cauldron.x, potions.cauldron.z) < 2.3) takePotions(); }
      } else if (step === "potion" && sub === "throw") {
        if (dist2(player.x, player.z, potions.cauldron.x, potions.cauldron.z) < 2.3) takePotions();
      }
      return false;
    }
    if (name === "trick1" || name === "trick2" || name === "trick3") {
      if (step === "brew" && sub === "gather" && !talking && player.enabled) addIngredient(name === "trick1" ? 0 : name === "trick2" ? 1 : 2);
      return false;
    }
    if (step === "fight" || step === "pool" || step === "brew" || step === "potion" || step === "ending") return attack(name);
    return false;
  }

  function exit() {
    hardStop();
    cinema.tint(null);
    A("dreamAmbience", false);
    M("stop", 0.5);
    combat.bodyTTL = 12;
    combat.onEvent = null;
    potions.bodies = null;
    potions.allies = null;
    potions.onTransform = null; potions.onJoined = null; potions.onSplash = null; potions.onMiss = null;
    dream.reset();
    FX("setGround", null, null);
    step = "boot";
  }

  function win() {
    if (step === "done" || step === "boot") return;
    hardStop();
    M("stop", 2);
    finished = 6; fallenN = 12; brewed = true; woken = NEED_WOKEN;
    finish();
  }

  function skipTo(name) {
    if (step === "boot" || STEPS.indexOf(name) < 0) return false;
    switch (name) {
      case "intro": startIntro(); break;
      case "find": startFind(); break;
      case "fight": startFight(); break;
      case "pool": startPool(); break;
      case "brew": startBrew(); break;
      case "potion": startPotion(); break;
      case "ending": startEnding(); break;
      default: win();
    }
    return true;
  }

  return {
    build, enter, start, update, exit, onAction,
    onJump() {
      progress();
      if (step === "ending" && sub === "free") {
        jumps++;
        if (jumps === 1 || jumps % 3 === 0) { const g = gen; ctx.after(0.45, () => { if (g === gen && combat.allies.length) A("tribeChirp", "happy", 0.6, 0, 1.15); }); }
      }
    },
    onLand() {},
    state() {
      const pot = ctx.abilities.potion;
      return { step, sub, finished, fallen: fallenN, brewed, potions: pot.on ? pot.count : 0, woken, army: ctx.army.count,
        held: potions ? potions.ingredients.held.length : 0, filled: potions ? potions.cauldron.filled : 0,
        stirs: potions ? potions.cauldron.stirs : 0, alive: combat ? combat.alive : 0, bodies: combat ? combat.bodies.length : 0,
        ings: KINDS.filter((k) => ingId[k] >= 0), talking, wakeShot };
    },
    skipTo, win,
    STEPS,
  };
}
