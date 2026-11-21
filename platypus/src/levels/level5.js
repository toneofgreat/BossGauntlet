// level5.js - LEVEL 5 "THE HAPPIEST DAY" (LEVELS.md C5, STORY.md level 5).
//
//   PART A  the happiest day: six joys, all open at once, any order (slide, goal, treasure, double act,
//           sunbathe, picnic). The day ends 30 s after the fourth joy (or at ten minutes).
//   PART B  bedtime: for once the two sleep side by side.
//   PART C  the alarm: woken at night, carried out, Pip leaps through the glass ... and lies still.
//   PART D  hope: Wizard Wobble in the dark, the rise to the "8 DAYS" timer, Pip in the cell over the lava.
//   PART E  training on the ledge: TAIL SLAP and HOLD. Fade to black. TO BE CONTINUED.
//
// How the script is organised: every beat has a STARTER (startDay, startBedtime, startNight, startHope,
// startTraining, startEnd). A starter first calls hardStop(), which puts every shared actor, the HUD, the
// cinema and the sound loops back to nothing behind black, and then builds its beat from scratch. The
// story flows from starter to starter, and skipTo(name) simply calls the right one - so a skipped
// cutscene, a debug jump and the normal flow all arrive in exactly the same state.
import { createZoo } from "../zoo.js";
import { createLair } from "../lair.js";
import { createFriend } from "../friend.js";
import { createCrowd } from "../crowd.js";
import { createProps } from "../props.js";
import { getWizard, getDummy } from "./common.js";

export const meta = { n: 5, title: "THE HAPPIEST DAY" };

const STEPS = ["intro", "day", "bedtime", "alarm", "taken", "leap", "still", "wizard", "reveal", "slap", "hold", "end", "done"];
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const rnd = (a, b) => a + Math.random() * (b - a);

// the four trick keys of this level (slot 3 turns into "Ball" while the ball is at the player's nose)
const TRICKS = [
  { name: "spin", label: "Spin", base: 1 },
  { name: "backflip", label: "Backflip", base: 2 },
  { name: "roll", label: "Roll", base: 1 },
  { name: "twirlLeap", label: "Twirl leap", base: 3 },
];
const TRICK_UI = TRICKS.map((t) => ({ label: t.label }));
const TRICK_UI_BALL = TRICK_UI.map((t, i) => (i === 2 ? { label: "Ball" } : t));
const JOY_ID = ["slide", "goal", "treasure", "act", "sun", "picnic"];
const JOY_COLOR = [0x6fd6ff, 0xffb84a, 0xfff07a, 0xff7ad1, 0xffd9a0, 0x9be36a];
const DAY_EVENING = 420, DAY_MAX = 600, COIN_GOAL = 40;

export function createLevel(ctx) {
  const { THREE, player, platypus, cam, ui, cinema, audio, fx } = ctx;

  // feature-guarded calls into the audio / fx extensions (a missing sound must never stop the story)
  function A(name, a, b, c) { const f = audio[name]; return typeof f === "function" ? f.call(audio, a, b, c) : undefined; }
  function FX(name, a, b, c, d, e, g) { const f = fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e, g) : undefined; }

  let zoo = null, lair = null, friend = null, crowd = null, props = null, wizard = null, dummy = null, keeper = null, handler = null;
  let Z = null, L = null;
  let step = "boot";
  let gen = 0; // bumped by hardStop(): callbacks that outlive their beat compare it and do nothing

  // ---- scratch (nothing below allocates per frame) ----
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), q1 = new THREE.Quaternion();
  const scr = { x: 0, y: 0, visible: false };
  const pt = { x: 0, y: 0, z: 0, color: 0xffffff, ok: false };
  const eyeObj = new THREE.Object3D(), lookObj = new THREE.Object3D();
  const eyeWant = new THREE.Vector3(), lookWant = new THREE.Vector3();
  const tossTo = { x: 0, z: 0 };
  const tossVals = [];
  const hitTarget = { x: 0, y: 0, z: 0, r: 0.45 };
  const colW = { x: 0, z: 0, r: 0.45, on: false }, colD = { x: 0, z: 0, r: 0.34, on: false };
  const leadRoute = [{ x: 0, z: 0 }];
  const sleepSpot = { x: 0, z: 0, yaw: 0 };
  const groundWater = (x, z) => { const w = zoo.waterAt(x, z); return w > -1e6 ? w : null; };

  // =====================================================================================================
  // state
  // =====================================================================================================
  // ---- the day ----
  const joys = [false, false, false, false, false, false];
  const joy = { slides: 0, goals: 0, shinies: 0, bites: 0, rest: 0, restShown: -1, coinsShown: -1 };
  let dayT = 0, dayEndAt = 0, evening = false, yawnT = 0, idleT = 0, markT = 0, markI = 0, fallT = 0, hintT = 0;
  let pip = null, pipT = 0, pipThink = 0, pipTarget = -1, bubbleT = 0, introCallT = 0;
  let dayAct = null;
  // tricks and money
  const tr = { on: false, name: "", label: "", base: 0, sync: false, same: false, apexT: 0, endT: 0, scored: true, last: "", endAt: -99, combo: 1 };
  let watchersWant = 3, gathered = false, crowdIdle = 0, lingerT = 0, lingerArmed = true, hintedUnseen = false, ballSlot = false;
  const bal = { on: false, t: 0, pay: 0, paid: 0, tilt: 0, v: 0 };
  // slide
  let slidePts = null, slideCum = null, slideLen = 1;
  const slide = { on: false, t: 0, splashed: false, pipOn: false, x: 0, y: 0, z: 0 };
  let hoopGoal = null, hoopJump = null, goalArmed = true, ballWetT = 0, fetchCd = 0;
  let resting = false;
  const picnic = { state: 0, eatT: -1, pipBiteT: -1 }; // 0 not yet, 1 keeper on the way, 2 bowl is down, 3 finished
  // ---- bedtime ----
  let sleepSeq = false;
  // ---- the night ----
  const night = { on: false, carried: false, scared: false, scaredT: 0, chase: false, chaseT: 0, lookPip: false, fp: false,
    atNest: false, out: false, corner: false, leapt: false, glass: false, landed: false, moteT: 0, motes: false };
  // ---- hope ----
  let talkT = 0, blipT = 0, tickT = -1, tickN = 0;
  // ---- training ----
  let inLair = false, slaps = 0, slapT = -1, slapCd = 0, holding = false, holdSub = "", throwT = -1, thrown = false, misses = 0, trainIdle = 0, trainMarkT = 0;
  let endLook = false, creaked = false;
  const sayQ = [];
  let sayThen = null;

  // =====================================================================================================
  // small helpers
  // =====================================================================================================
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const nearPlayer = (p, r) => dist2(player.x, player.z, p.x, p.z) <= r;
  function joyCount() { let n = 0; for (let i = 0; i < 6; i++) if (joys[i]) n++; return n; }
  function floatAtPlayer(text, kind) {
    ctx.project(platypus.group, scr, 0.55);
    if (scr.visible) ui.floatText(text, scr.x, scr.y, kind);
  }

  // ---- the wizard speaks (speech bubbles; one line at a time, like level 1) ----
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

  // =====================================================================================================
  // build / worlds
  // =====================================================================================================
  function build() {
    zoo = ctx.shared("zoo", () => createZoo(ctx));
    lair = ctx.shared("lair", () => createLair(ctx));
    friend = ctx.shared("friend", () => createFriend(ctx));
    crowd = ctx.shared("crowd", () => createCrowd(ctx));
    props = ctx.shared("props", () => createProps(ctx));
    wizard = getWizard(ctx);
    dummy = getDummy(ctx, 0);
    keeper = crowd.staff[0];
    handler = crowd.staff[1];
    Z = zoo.P;
    L = lair.P;
    hoopGoal = props.hoop(zoo.hoop);
    hoopJump = props.hoop(zoo.hoop);
    // the way down the waterfall: zoo.slide if the world publishes it, else a path built from the named points
    slidePts = Array.isArray(zoo.slide) && zoo.slide.length >= 3 ? zoo.slide : [
      { x: Z.fallTop.x, y: Z.fallTop.y, z: Z.fallTop.z },
      { x: Z.fallTop.x, y: 0.3, z: Z.fallTop.z + 1.4 },
      { x: Z.logBridge.x, y: -0.1, z: Z.logBridge.z },
      { x: Z.poolCenter.x - 1, y: -0.1, z: Z.poolCenter.z - 0.6 },
    ];
    slideCum = new Float32Array(slidePts.length);
    for (let i = 1; i < slidePts.length; i++) {
      const a = slidePts[i - 1], b = slidePts[i];
      slideCum[i] = slideCum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    }
    slideLen = slideCum[slidePts.length - 1] || 1;
    colW.x = L.wizard.x; colW.z = L.wizard.z;
    colD.x = L.dummy.x; colD.z = L.dummy.z;
    if (ctx.debug) ctx.debug.level5 = { zoo, lair, friend, crowd, props, joys, joy, night, picnic };
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
    ui.setObjective(null); ui.setAction(null); ui.setQuests(null); ui.setTricks(null); ui.setCombo(null);
    ui.setFriendship(null); ui.setAbilities({}); ui.setHolding(false);
    ctx.setSpeaker(null);
    A("alarm", false); A("panic", false); A("lullaby", false); A("sadTheme", false); A("lavaRumble", 0);
    A("zooAmbience", false); A("waterfall", 0); A("snore", false);
    // shared actors
    friend.reset();
    crowd.reset();
    props.reset();
    props.cushion.hitTarget = null;
    platypus.reset();
    wizard.setTalking(false);
    wizard.group.visible = false;
    dummy.reset();
    dummy.group.visible = false;
    colW.on = colD.on = false;
    // the player
    player.scripted = false; player.hidden = false; player.enabled = false; player.carrying = false;
    player.maxSpeed = 3; player.lock = 0; player.face = null; player.canJump = player.canDive = true;
    player.swimming = player.diving = false; player.pitch = player.roll = 0; player.speed = 0; player.vy = 0; player.grounded = true;
    player.stop();
    // flags of every beat
    dayAct = null; resting = false; slide.on = false; slide.pipOn = false; bal.on = false; tr.on = false; sleepSeq = false;
    picnic.eatT = picnic.pipBiteT = -1;
    pip = null; pipTarget = -1;
    night.on = night.carried = night.scared = night.chase = night.lookPip = night.fp = night.motes = false;
    night.atNest = night.out = night.corner = night.leapt = night.glass = night.landed = false;
    talkT = 0; tickT = -1; tickN = 0;
    slapT = -1; slapCd = 0; holding = false; holdSub = ""; throwT = -1; thrown = false; misses = 0; trainIdle = 0;
    endLook = false; creaked = false;
    tossVals.length = 0;
  }

  function toZoo() {
    zoo.reset();
    zoo.group.add(friend.group, crowd.group, props.group);
    friend.setWorld(zoo);
    props.setWorld(zoo);
    crowd.setLane(zoo.walkway, zoo.glass.z);
    ctx.setWorld(zoo);
    FX("setGround", zoo.heightAt, groundWater);
    FX("setGlint", 0xfff2dc);
    inLair = false;
  }
  function toLair() {
    ctx.setWorld(lair);
    lair.reset();
    lair.group.add(wizard.group, dummy.group, props.group);
    props.setWorld(lair);
    friend.setWorld(lair);
    FX("setGround", null, null);
    inLair = true;
    // Pip, alive, curled up in the cell
    friend.attachTo(lair.cell.floor);
    wizard.group.position.set(L.wizard.x, 0, L.wizard.z);
    wizard.group.visible = false;
    dummy.group.position.set(L.dummy.x, 0, L.dummy.z);
    dummy.group.rotation.y = L.dummy.yaw || 0;
    dummy.group.visible = false;
  }

  // =====================================================================================================
  // PART A - the happiest day
  // =====================================================================================================
  function questText(i) {
    switch (i) {
      case 0: return "Slide down the waterfall " + Math.min(joy.slides, 2) + " / 2";
      case 1: return "Nose the ball through the hoop " + Math.min(joy.goals, 3) + " / 3";
      case 2: return "Find shiny things in the pool " + Math.min(joy.shinies, 5) + " / 5";
      case 3: return "Do tricks with Pip: coins " + Math.min(ui.coins, COIN_GOAL) + " / " + COIN_GOAL;
      case 4: return "Rest on the warm rock together";
      default: return picnic.state === 0 ? "A surprise (finish 3 joys)" : "Share the feast " + Math.min(joy.bites, 4) + " / 4";
    }
  }
  function showQuests() {
    const list = [];
    for (let i = 0; i < 6; i++) list.push({ id: JOY_ID[i], text: questText(i), done: joys[i] });
    ui.setQuests(list, "Best day ever");
  }
  function dayObjective() {
    const n = joyCount();
    if (n >= 6) ui.setObjective("The best day ever!", "play as long as you like");
    else if (n >= 4) ui.setObjective("What a day! Keep playing with Pip", "the sun is getting low");
    else ui.setObjective("Best day ever: pick any joy from the list  " + n + " / 4", "follow the glowing rings");
  }

  // Places everything for the day (behind black). The player wakes at the nest, Pip is bouncing at its mouth.
  function setupDay() {
    for (let i = 0; i < 6; i++) joys[i] = false;
    joy.slides = joy.goals = joy.shinies = joy.bites = 0; joy.rest = 0; joy.restShown = -1; joy.coinsShown = -1;
    dayT = 0; dayEndAt = 0; evening = false; yawnT = 20; idleT = 0; markT = 0; markI = 0; fallT = 0; hintT = 0;
    pip = null; pipT = 0; pipThink = 0; pipTarget = -1; bubbleT = 0; introCallT = 0.4;
    tr.on = false; tr.last = ""; tr.endAt = -99; tr.combo = 1; tr.scored = true;
    watchersWant = 3; gathered = false; crowdIdle = 0; lingerT = 0; lingerArmed = true; hintedUnseen = false; ballSlot = false;
    goalArmed = true; ballWetT = 0; fetchCd = 0;
    picnic.state = 0;
    ui.setCoins(0);

    player.teleport(Z.nest.x, Z.nest.z, Z.nest.yaw);
    friend.place(Z.nestFriend.x, Z.nestFriend.z, Math.atan2(Z.nest.x - Z.nestFriend.x, Z.nest.z - Z.nestFriend.z));
    friend.do("idle");
    props.ball.place(Z.ballSpot.x, Z.ballSpot.z);
    hoopGoal.reset(); hoopJump.reset();
    // five treasures on the pool bed: the deep end, the sunken log, under the fall, and two more
    const spots = [
      [Z.poolDeep.x, Z.poolDeep.z], [Z.sunkenLog.x, Z.sunkenLog.z], [zoo.fall ? zoo.fall.footX : Z.fallTop.x, zoo.fall ? zoo.fall.footZ : Z.fallTop.z + 1.5],
      [Z.poolCenter.x - 2.4, Z.poolCenter.z + 1.5], [Z.poolCenter.x + 2.0, Z.poolCenter.z + 1.0],
      [Z.poolCenter.x, Z.poolCenter.z - 1.4], [Z.poolCenter.x - 2.6, Z.poolCenter.z - 0.8], [Z.poolCenter.x + 1.2, Z.poolCenter.z + 2.0],
    ];
    let n = 0;
    for (let i = 0; i < spots.length && n < 5; i++) {
      const x = spots[i][0], z = spots[i][1];
      if (zoo.waterAt(x, z) - zoo.heightAt(x, z) < 0.3) continue; // must lie under water
      props.shinies.place(n++, x, null, z);
    }
    for (let i = 0; n < 5; i++) props.shinies.place(n++, Z.poolCenter.x + Math.cos(i * 2.2) * 1.6, null, Z.poolCenter.z + Math.sin(i * 2.2) * 1.2);
    if (props.toys && props.toys.duck) props.toys.duck.place(Z.poolCenter.x + 1.4, Z.poolCenter.z - 1.2);
    crowd.stroll(8);
    A("zooAmbience", true, "day");
  }

  function startIntro() {
    hardStop();
    toZoo();
    setupDay();
    step = "intro";
    start();
  }

  // Title card, then a short look at the two of them before the day is handed to the player.
  function start() {
    const g = gen;
    cinema.titleCard({ kicker: "LEVEL 5", title: "THE HAPPIEST DAY" }, () => {
      if (g !== gen || step !== "intro") return;
      const c = Z.camNest;
      cinema.play([
        { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: friend.group, lookY: 0.2, fov: 40,
          to: { pos: [c.pos.x - 0.5, c.pos.y - 0.15, c.pos.z + 0.7] }, dur: 7 }, hold: false },
        { fade: "clear", dur: 1.4 },
        { wait: 0.4 },
        { caption: "Today is going to be the best day ever.", dur: 4, narr: true },
        { call: () => friend.emote("happy") },
        { wait: 0.9 },
      ], { skippable: true, onDone: () => { if (g === gen) beginDay(); } });
    });
  }

  function startDay() {
    hardStop();
    toZoo();
    setupDay();
    cinema.fade("clear", 0.9);
    beginDay();
  }

  function beginDay() {
    step = "day";
    ui.showHud(true);
    ui.setCoins(ui.coins);
    ui.setFriendship(joyCount() / 6, "Happiness");
    showQuests();
    ui.setTricks(TRICK_UI);
    dayObjective();
    player.enabled = true;
    setPip("follow");
    ui.hint("Six joys. Any order. Pip is coming with you!", 4);
  }

  // ---- Pip's job during the day ----
  function setPip(mode) {
    pip = mode;
    pipT = 0;
    pipTarget = -1;
    if (mode === "follow") friend.do("follow", { dist: 1.3, side: 0.7 });
  }
  function thinkPip() {
    if (pip === "lead" || pip === "fetch" || pip === "slide" || pip === "sun") {
      // a job with an end: give it up if it drags on, so Pip never gets stuck doing it
      if (pipT > (pip === "sun" ? 9999 : pip === "lead" ? 30 : 14)) setPip("follow");
      return;
    }
    // treasure: float above the nearest shiny thing and blow bubbles
    if (!joys[2] && player.swimming && zoo.inPool(player.x, player.z)) {
      const i = props.shinies.nearest(player.x, player.y, player.z, 30);
      if (i >= 0) {
        if (pip !== "treasure" || pipTarget !== i) {
          pip = "treasure"; pipT = 0; pipTarget = i;
          props.shinies.pos(i, pt);
          friend.do("goto", { x: pt.x, z: pt.z, run: true });
        }
        return;
      }
    }
    // picnic: wait at the bowl
    if (picnic.state === 2 && !joys[5] && dist2(player.x, player.z, props.bowl.x, props.bowl.z) < 5) {
      if (pip !== "picnic") { pip = "picnic"; pipT = 0; friend.do("goto", { x: Z.bowlFriend.x, z: Z.bowlFriend.z, yaw: Z.bowlFriend.yaw, run: true }); }
      return;
    }
    if (pip !== "follow") setPip("follow");
  }

  // where joy i wants the player to go right now (pt.ok false = nothing to show)
  function joyPoint(i) {
    pt.ok = true; pt.color = JOY_COLOR[i];
    switch (i) {
      case 0: {
        const up = player.y > Z.fallTop.y - 0.7 && nearPlayer(Z.fallTop, 4);
        const p = up ? Z.fallTop : Z.fallSteps;
        pt.x = p.x; pt.z = p.z; pt.y = p.y + 0.07;
        break;
      }
      case 1:
        if (!props.ball.active || bal.on) { pt.ok = false; break; }
        if (dist2(player.x, player.z, props.ball.x, props.ball.z) > 2.2) { pt.x = props.ball.x; pt.z = props.ball.z; }
        else { pt.x = zoo.hoop.x; pt.z = zoo.hoop.z; }
        pt.y = Math.max(zoo.heightAt(pt.x, pt.z), zoo.waterAt(pt.x, pt.z)) + 0.07;
        break;
      case 2: {
        const k = props.shinies.nearest(player.x, player.y, player.z, 60);
        if (k < 0) { pt.ok = false; break; }
        props.shinies.pos(k, pt);
        pt.y = 0.04; // on the water, right above it
        break;
      }
      case 3: pt.x = Z.showRock.x; pt.z = Z.showRock.z; pt.y = Z.showRock.y + 0.07; break;
      case 4: pt.x = Z.sunRock.x; pt.z = Z.sunRock.z; pt.y = Z.sunRock.y + 0.07; break;
      default:
        if (picnic.state !== 2) { pt.ok = false; break; }
        pt.x = props.bowl.x; pt.z = props.bowl.z; pt.y = props.bowl.y + 0.07;
    }
    return pt.ok;
  }

  function completeJoy(i) {
    if (joys[i]) return;
    joys[i] = true;
    A("questDone");
    ui.setQuest(JOY_ID[i], { text: questText(i), done: true });
    const n = joyCount();
    ui.setFriendship(n / 6, "Happiness");
    friend.emote("happy");
    platypus.billTip.getWorldPosition(v1);
    v1.y += 0.2;
    FX("hearts", v1, 4);
    floatAtPlayer("joy!", "heart");
    dayObjective();
    if (n >= 3 && picnic.state === 0 && step === "day") {
      const g = gen;
      ctx.after(2.2, () => { if (g === gen && step === "day") startPicnic(); });
    }
    if (n >= 6) { ui.banner("THE BEST DAY EVER", "every single joy", 3.5); dayEndAt = dayEndAt > 0 ? Math.min(dayEndAt, dayT + 9) : dayT + 9; }
    else if (n >= 4 && dayEndAt === 0) dayEndAt = dayT + 30;
  }

  // Once the day is on its way out, anything joyful the player is still doing buys a little more of it
  // (never past the ten minutes): bedtime must not cut a game off in the middle.
  function lingerDay(secs) {
    if (dayEndAt > 0 && joyCount() < 6) dayEndAt = Math.max(dayEndAt, dayT + (secs || 20));
  }

  // ---- money ----
  function onCoin(value, x, y, z) {
    ui.addCoins(value);
    v1.set(x, y + 0.2, z);
    ctx.project(v1, scr, 0);
    if (scr.visible) ui.floatText("+" + value, scr.x, scr.y, "coin");
    A("coin");
  }
  function onToss(from) {
    const v = tossVals.length ? tossVals.shift() : 1;
    tossTo.x = clamp(player.x + rnd(-0.9, 0.9), -11.5, 11.5);
    tossTo.z = clamp(player.z + rnd(-0.7, 0.8), -8.5, 8.9);
    props.coins.toss(from, tossTo, v);
  }
  function pay(coins) {
    const n = Math.min(coins, 5);
    const each = Math.floor(coins / n);
    let left = coins;
    for (let i = 0; i < n; i++) {
      const v = i === n - 1 ? left : each;
      left -= v;
      tossVals.push(v);
      if (!crowd.tossCoin(onToss)) { tossVals.pop(); onCoin(v, player.x, player.y + 0.3, player.z); }
    }
  }
  function wantCrowd() {
    if (gathered) return;
    gathered = true;
    crowd.gather(player.x, watchersWant);
  }

  // ---- tricks (LEVELS.md "TRICKS AND MONEY") ----
  function dayBusy() { return slide.on || resting || sleepSeq || cinema.playing; }
  function beginTrick(name, label, base, dur, apex, sync) {
    const now = ctx.time.now;
    tr.same = name === tr.last;
    if (tr.same) tr.combo = 1;
    else if (tr.last && now - tr.endAt <= 3) tr.combo = Math.min(5, tr.combo + 1);
    else tr.combo = 1;
    tr.name = name; tr.label = label; tr.base = base; tr.sync = sync; tr.last = name;
    tr.apexT = apex; tr.endT = dur; tr.on = true; tr.scored = false;
    idleT = 0; crowdIdle = 0;
    if (player.z > 3) wantCrowd();
    if (apex <= 0) scoreTrick();
  }
  function scoreTrick() {
    tr.scored = true;
    const w = crowd.watchers(player.x);
    const seen = w > 0 && player.z > 3;
    ui.setCombo(tr.combo);
    if (tr.combo > 1) A("comboUp", tr.combo);
    if (!seen) {
      ui.call(tr.label.toUpperCase() + "!", tr.sync ? "together!" : "", undefined);
      if (!hintedUnseen) { hintedUnseen = true; ui.hint("Nobody saw that! Do tricks near the glass.", 3.2); }
      return;
    }
    let coins = Math.ceil(tr.base * (tr.sync ? 2 : 1) * tr.combo * (0.5 + 0.1 * w));
    if (tr.same) { coins = Math.floor(coins / 2); crowd.react("laugh", 0.5); }
    if (coins <= 0) { ui.call(tr.label.toUpperCase() + "!", "try a different one", "miss"); return; }
    ui.call(tr.label.toUpperCase() + "!", "+" + coins + (tr.sync ? "  in sync" : ""), tr.combo >= 3 ? "perfect" : "good");
    crowd.react(coins >= 6 ? "cheer" : coins >= 3 ? "clap" : "ooh", clamp(0.4 + coins * 0.05, 0.4, 1));
    pay(coins);
    lingerDay(15);
    watchersWant = Math.min(14, watchersWant + 1);
    crowd.gather(player.x, watchersWant);
  }
  function tryTrick(slot) {
    if (step !== "day" || dayBusy()) return;
    if (slot === 2 && (ballSlot || bal.on)) { if (bal.on) endBalance("stop"); else startBalance(); return; }
    if (bal.on) return;
    const T = TRICKS[slot];
    if (!T) return;
    if (!player.grounded || player.swimming || player.lock > 0 || platypus.acting || tr.on) { ui.flashTrick(slot, false); return; }
    const info = platypus.tricks && platypus.tricks[T.name];
    const d = platypus.trick(T.name) || (info ? info.dur : 1);
    player.lock = d;
    A("trickWhoosh", slot);
    ui.flashTrick(slot, true);
    // Pip joins in when it is right beside you: a synchronised trick counts double
    let sync = false;
    if ((pip === "follow" || pip === "picnic") && !friend.busy && !friend.swimming && friend.distTo(player.x, player.z) < 5) {
      friend.trick(T.name, 0);
      sync = true;
    }
    beginTrick(T.name, T.label, T.base, d, info ? info.apex : d * 0.45, sync);
  }

  // ---- ball balance ----
  function startBalance() {
    if (!player.grounded || player.swimming || player.lock > 0 || tr.on) return;
    bal.on = true; bal.t = 0; bal.pay = 0; bal.paid = 0; bal.tilt = 0; bal.v = rnd(-0.3, 0.3);
    props.ball.balanceOn(platypus.ballAnchor);
    platypus.pose("balance", 0.3);
    player.maxSpeed = 1.2;
    ui.flashTrick(2, true);
    ui.call("BALL BALANCE!", ctx.touch ? "steer left and right" : "steer with A and D", undefined);
    crowdIdle = 0; idleT = 0;
    if (player.z > 3) wantCrowd();
  }
  function endBalance(how) {
    if (!bal.on) return;
    bal.on = false;
    platypus.pose(null, 0.3);
    player.maxSpeed = 3;
    if (how === "drop") { props.ball.drop(); crowd.react("ooh", 0.5); }
    else {
      props.ball.balanceOn(null);
      if (how === "win") { crowd.react("cheer", 0.8); ui.call("BALANCED!", "", "perfect"); friend.emote("happy"); A("trickLand", true); }
    }
    tr.last = "ball"; tr.endAt = ctx.time.now;
  }
  function updateBalance(dt) {
    bal.t += dt;
    bal.v += (Math.random() - 0.5) * 6 * dt;
    bal.v *= Math.exp(-1.1 * dt);
    bal.tilt += (bal.v * 0.9 + player.turn * 0.1 + bal.tilt * 0.45 - ctx.input.x * 1.6) * dt;
    props.ball.tilt = bal.tilt;
    crowdIdle = 0;
    bal.pay += dt;
    if (bal.pay >= 0.5) {
      bal.pay -= 0.5;
      if (bal.paid < 8) {
        bal.paid++;
        const w = crowd.watchers(player.x);
        if (w > 0 && player.z > 3) pay(Math.ceil(0.5 + 0.1 * w));
      }
    }
    if (Math.abs(bal.tilt) >= 1 || !player.grounded || player.swimming) endBalance("drop");
    else if (bal.t >= 4) endBalance("win");
  }

  // ---- a. the waterfall slide ----
  function samplePath(d, out) {
    const n = slidePts.length;
    let i = 1;
    while (i < n - 1 && slideCum[i] < d) i++;
    const a = slidePts[i - 1], b = slidePts[i], seg = slideCum[i] - slideCum[i - 1];
    const k = seg > 1e-5 ? clamp((d - slideCum[i - 1]) / seg, 0, 1) : 1;
    out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.z = a.z + (b.z - a.z) * k;
    return out;
  }
  function startSlide() {
    if (slide.on || dayBusy() || bal.on) return;
    slide.on = true; slide.t = 0; slide.splashed = false;
    slide.x = player.x; slide.y = player.y; slide.z = player.z;
    player.scripted = true;
    player.stop();
    player.swimming = true; player.diving = false; player.grounded = true; player.speed = 2.6; player.vy = 0;
    ui.setAction(null); dayAct = null;
    A("trickWhoosh", 1);
    A("splash", 0.4);
    ui.call("WHEEE!", "", undefined);
    // Pip comes down right behind if it is up here too
    slide.pipOn = friend.distTo(Z.fallTop.x, Z.fallTop.z) < 3.6 && !friend.busy;
    if (slide.pipOn) { pip = "slide"; pipT = 0; friend.do("idle"); }
    else friend.emote("happy");
    idleT = 0;
  }
  function updateSlide(dt) {
    slide.t += dt;
    const k = clamp(slide.t / 2.6, 0, 1);
    const d = Math.pow(k, 1.25) * slideLen;
    samplePath(d, v1);
    samplePath(Math.min(slideLen, d + 0.35), v2);
    const f = Math.min(1, dt * 16);
    slide.x += (v1.x - slide.x) * f; slide.y += (v1.y - slide.y) * f; slide.z += (v1.z - slide.z) * f;
    const dx = v2.x - v1.x, dz = v2.z - v1.z, dy = v2.y - v1.y, h = Math.hypot(dx, dz);
    if (h > 0.02) player.yaw = wrap(player.yaw + clamp(wrap(Math.atan2(dx, dz) - player.yaw), -10 * dt, 10 * dt));
    player.pitch += (clamp(-Math.atan2(dy, Math.max(h, 0.1)), -0.2, 1.0) - player.pitch) * Math.min(1, dt * 10);
    player.x = slide.x; player.y = slide.y; player.z = slide.z;
    platypus.group.position.set(slide.x, slide.y, slide.z);
    platypus.group.rotation.set(player.pitch, player.yaw, Math.sin(slide.t * 9) * 0.08);
    if (slide.y < 0.5) FX("wake", slide.x, slide.z, 0, 0.9);
    if (!slide.splashed && slide.y < 0.25) {
      slide.splashed = true;
      FX("splash", slide.x, 0, slide.z, 0.9);
      A("splash", 1);
      if (zoo.ripple) zoo.ripple(slide.x, slide.z, 1.6);
    }
    if (slide.pipOn) {
      const kp = clamp((slide.t - 0.45) / 2.6, 0, 1);
      if (kp > 0) {
        const dp = Math.pow(kp, 1.25) * slideLen;
        samplePath(dp, v1);
        samplePath(Math.min(slideLen, dp + 0.35), v2);
        friend.place(v1.x, v1.z, Math.atan2(v2.x - v1.x, v2.z - v1.z));
      }
    }
    if (k >= 1 && (!slide.pipOn || slide.t >= 3.05)) endSlide();
  }
  function endSlide() {
    slide.on = false;
    const e = slidePts[slidePts.length - 1];
    player.scripted = false;
    player.x = e.x; player.z = e.z; player.y = ctx.floorAt(e.x, e.z);
    player.pitch = 0; player.roll = 0; player.vy = 0; player.grounded = true; player.swimming = false; player.speed = 2;
    FX("splash", e.x, 0, e.z, 0.7);
    A("splash", 0.7);
    if (zoo.ripple) zoo.ripple(e.x, e.z, 1.4);
    if (zoo.fish && zoo.fish.scare) zoo.fish.scare(e.x, -0.4, e.z, 2.5);
    if (slide.pipOn) { slide.pipOn = false; setPip("follow"); }
    lingerDay(15);
    if (!joys[0]) {
      joy.slides++;
      ui.setQuest("slide", { text: questText(0) });
      if (joy.slides >= 2) completeJoy(0);
      else { A("objective"); ui.hint("Again! Climb back up the rocks.", 2.6); friend.emote("laugh"); }
    }
  }

  // ---- e. sunbathe ----
  function setResting(on) {
    if (on === resting) return;
    resting = on;
    if (on) {
      platypus.pose("curl", 0.8);
      A("lullaby", true);
      player.face = Z.sunRock.yaw;
      // Pip settles down right beside you
      const s = Math.sin(player.yaw), c = Math.cos(player.yaw);
      sleepSpot.x = player.x + c * 0.7; sleepSpot.z = player.z - s * 0.7; sleepSpot.yaw = player.yaw;
      pip = "sun"; pipT = 0;
      friend.do("sleep", { at: sleepSpot });
    } else {
      platypus.pose(null, 0.5);
      A("lullaby", false);
      cinema.tint(null);
      if (pip === "sun") setPip("follow");
    }
  }
  function updateRest(dt) {
    const want = !joys[4] && nearPlayer(Z.sunRock, 1.7) && ctx.input.held("interact") && !slide.on && !bal.on && !tr.on && player.grounded;
    if (want !== resting) setResting(want);
    if (resting) {
      joy.rest += dt;
      player.lock = Math.max(player.lock, 0.2);
      idleT = 0;
      cinema.tint("warm", 0.5 * clamp(joy.rest / 1.5, 0, 1));
      cam.manualT = 1;
      cam.yaw += 0.14 * dt;
      cam.pitch += (0.78 - cam.pitch) * Math.min(1, dt * 0.6);
      cam.wantDist += (4.8 - cam.wantDist) * Math.min(1, dt * 0.6);
      if (joy.rest >= 5) { setResting(false); cam.wantDist = 3.7; completeJoy(4); return; }
    } else if (joy.rest > 0 && !joys[4]) joy.rest = Math.max(0, joy.rest - dt * 0.35);
    const shown = joys[4] ? -1 : Math.floor(joy.rest);
    if (shown !== joy.restShown && !joys[4]) {
      joy.restShown = shown;
      ui.setQuest("sun", { text: shown > 0 ? "Rest on the warm rock together  " + shown + " / 5" : "Rest on the warm rock together" });
    }
  }

  // ---- f. the picnic ----
  function startPicnic() {
    if (picnic.state !== 0) return;
    picnic.state = 1;
    const g = gen;
    crowd.disperse();
    gathered = false;
    zoo.door.open(true);
    keeper.place(Z.doorOut.x, Z.doorOut.z, -PI / 2);
    props.bowl.fill("yabby", 8);
    props.bowl.attach(keeper.handAnchor);
    ui.setQuest("picnic", { text: questText(5) });
    ui.hint("Look! The keeper is bringing a picnic.", 3.2);
    A("friendChirp", "happy", 0.8, 0);
    const bx = Z.bowl.x, bz = Z.bowl.z;
    keeper.walkTo(Z.doorIn.x, Z.doorIn.z, () => {
      if (g !== gen) return;
      keeper.walkTo(bx + 0.8, bz + 0.1, () => {
        if (g !== gen) return;
        keeper.kneel(() => {
          if (g !== gen) return;
          props.bowl.attach(null);
          props.bowl.place(bx, bz);
          picnic.state = 2;
          lingerDay(30);
          A("drop");
          ui.hint("A feast! Go and share it with Pip.", 3);
          ctx.after(1.5, () => {
            if (g !== gen) return;
            keeper.wave();
            keeper.walkTo(Z.doorIn.x, Z.doorIn.z, () => {
              if (g !== gen) return;
              keeper.walkTo(Z.doorOut.x, Z.doorOut.z, () => {
                if (g !== gen) return;
                keeper.visible = false;
                zoo.door.open(false);
              });
            });
          });
        });
      });
    });
  }
  function eatBite() {
    if (picnic.state !== 2 || joys[5] || player.lock > 0 || picnic.eatT >= 0 || props.bowl.left <= 0) return;
    const d = platypus.eat() || 1.4;
    player.lock = d;
    player.face = Math.atan2(props.bowl.x - player.x, props.bowl.z - player.z);
    picnic.eatT = (platypus.eatBiteTimes && platypus.eatBiteTimes[0]) || 0.3;
    // Pip eats too, as long as there is enough left for your four bites
    if (friend.distTo(props.bowl.x, props.bowl.z) < 2.4 && !friend.busy && props.bowl.left > 4 - joy.bites) {
      friend.eat();
      picnic.pipBiteT = 0.75;
    }
    idleT = 0;
  }
  function updatePicnic(dt) {
    if (picnic.eatT >= 0) {
      picnic.eatT -= dt;
      if (picnic.eatT < 0) {
        props.bowl.bite();
        A("eat");
        joy.bites++;
        lingerDay(15);
        ui.setQuest("picnic", { text: questText(5) });
        floatAtPlayer("yum!", "heart");
        if (joy.bites >= 4) { picnic.state = 3; completeJoy(5); }
      }
    }
    if (picnic.pipBiteT >= 0) {
      picnic.pipBiteT -= dt;
      if (picnic.pipBiteT < 0 && props.bowl.left > Math.max(0, 4 - joy.bites)) props.bowl.bite();
    }
  }

  // ---- b. goal! ----
  function updateGoal(dt) {
    const B = props.ball;
    if (!B.active || bal.on) return;
    const through = hoopGoal.passed(B.x, B.y, B.z);
    const dh = dist2(B.x, B.z, zoo.hoop.x, zoo.hoop.z);
    if (!goalArmed && dh > 1.5) goalArmed = true;
    const moving = Math.hypot(B.vx, B.vz) > 0.4;
    if (goalArmed && (through || (dh < 0.42 && moving && B.y < zoo.hoop.y + zoo.hoop.r))) {
      goalArmed = false;
      v1.set(zoo.hoop.x, zoo.hoop.y, zoo.hoop.z);
      FX("sparkle", v1, 0xffe08a, 14);
      A("objective");
      crowd.react("cheer", 0.7);
      lingerDay(20);
      if (!joys[1]) {
        joy.goals++;
        ui.call("GOAL!", Math.min(joy.goals, 3) + " / 3", joy.goals >= 3 ? "perfect" : "good");
        ui.setQuest("goal", { text: questText(1) });
        if (joy.goals >= 3) completeJoy(1);
      } else ui.call("GOAL!", "", "good");
      // Pip passes it back
      if (!joys[1] && pip === "follow") { pip = "fetch"; pipT = 0; friend.do("fetch", { ball: B }); }
    }
    // the ball never gets lost: out of the water it comes
    if (fetchCd > 0) fetchCd -= dt;
    const wet = zoo.waterAt(B.x, B.z) - zoo.heightAt(B.x, B.z) > 0.3;
    ballWetT = wet ? ballWetT + dt : 0;
    if (ballWetT > 9 && !joys[1]) {
      ballWetT = 0;
      B.place(Z.ballSpot.x, Z.ballSpot.z);
      v1.set(B.x, B.y, B.z);
      FX("sparkle", v1, 0xffffff, 8);
      ui.hint("Pip put the ball back on the sand.", 2.4);
    }
  }

  // ---- c. treasure dive ----
  function updateTreasure(dt) {
    if (joys[2]) return;
    const i = props.shinies.nearest(player.x, player.y, player.z, 3);
    if (i >= 0) {
      props.shinies.pos(i, pt);
      if (dist2(player.x, player.z, pt.x, pt.z) < 0.8 && player.y - pt.y < 0.95) {
        props.shinies.collect(i);
        joy.shinies++;
        lingerDay(25);
        ui.addCoins(2);
        floatAtPlayer("+2", "coin");
        A("coin");
        A("objective");
        ui.setQuest("treasure", { text: questText(2) });
        if (joy.shinies >= 5 || props.shinies.nearest(player.x, player.y, player.z, 99) < 0) completeJoy(2);
        else if (joy.shinies === 1) ui.hint("Shiny! Pip is blowing bubbles over the next one.", 3);
      }
    }
    // Pip marks the spot
    if (pip === "treasure" && pipTarget >= 0 && props.shinies.active(pipTarget)) {
      bubbleT -= dt;
      if (bubbleT <= 0) {
        bubbleT = 1.2;
        props.shinies.pos(pipTarget, pt);
        if (friend.distTo(pt.x, pt.z) < 1.6) FX("bubbles", pt.x, pt.y + 0.1, pt.z, 4, 0);
      }
    }
  }

  function dayInteract() {
    if (dayBusy()) return;
    if (dayAct === "eat") eatBite();
    else if (dayAct === "slide") startSlide();
    // "rest" is a hold: updateRest() watches the key
  }

  function updateDay(dt) {
    dayT += dt;
    // the light of the day
    if (!evening && dayT >= DAY_EVENING) { evening = true; zoo.setTime("evening", 40); yawnT = 12; }
    if (evening) {
      yawnT -= dt;
      if (yawnT <= 0 && pip === "follow" && !friend.busy) { yawnT = rnd(22, 34); friend.emote("yawn"); }
    }
    if (slide.on) { updateSlide(dt); return; }

    updateRest(dt);
    if (bal.on) updateBalance(dt);
    if (tr.on) {
      tr.apexT -= dt; tr.endT -= dt;
      if (!tr.scored && tr.apexT <= 0) scoreTrick();
      if (tr.endT <= 0) { tr.on = false; tr.endAt = ctx.time.now; A("trickLand", true); }
    }
    updateGoal(dt);
    updateTreasure(dt);
    updatePicnic(dt);

    // a jump through the toy hoop is a trick too
    const through = hoopJump.passed(player.x, player.y + 0.25, player.z);
    if (through && !player.grounded && !tr.on && !bal.on) beginTrick("hoop", "Hoop jump", 4, 0.3, 0, false);

    // d. the double act counts every coin you two have earned today
    if (!joys[3] && ui.coins !== joy.coinsShown) {
      joy.coinsShown = ui.coins;
      ui.setQuest("act", { text: questText(3) });
      if (ui.coins >= COIN_GOAL) completeJoy(3);
    }

    // visitors: they come when you linger at the glass, and drift off after 12 s without a trick
    crowdIdle += dt;
    if (gathered && crowdIdle > 12) { gathered = false; crowd.disperse(); watchersWant = 3; ui.setCombo(null); }
    if (player.z > 5 && picnic.state !== 1) {
      lingerT += dt;
      if (lingerT > 1.2 && lingerArmed && !gathered) { lingerArmed = false; wantCrowd(); crowdIdle = 4; }
    } else { lingerT = 0; if (player.z < 2.5) lingerArmed = true; }

    // the contextual "Ball" trick slot
    const B = props.ball;
    const bs = bal.on || (B.active && Math.hypot(B.x - player.x, B.y - player.y - 0.2, B.z - player.z) < 1.6 && player.grounded && !player.swimming);
    if (bs !== ballSlot) { ballSlot = bs; ui.setTricks(bs ? TRICK_UI_BALL : TRICK_UI); }

    // the action prompt: one thing at a time
    let act = null;
    if (!dayBusy() && !bal.on && player.lock <= 0) {
      if (picnic.state === 2 && !joys[5] && props.bowl.left > 0 && dist2(player.x, player.z, props.bowl.x, props.bowl.z) < 1.5) act = "eat";
      else if (player.y > Z.fallTop.y - 0.6 && nearPlayer(Z.fallTop, 1.7)) act = "slide";
      else if (!joys[4] && nearPlayer(Z.sunRock, 1.7)) act = "rest";
    } else if (resting) act = "rest";
    if (act !== dayAct) {
      dayAct = act;
      ui.setAction(act === "eat" ? "Eat" : act === "slide" ? "Slide!" : act === "rest" ? (ctx.touch ? "Rest (hold)" : "Rest (hold E)") : null);
    }

    // glowing rings on every joy that is still open, one after another
    markT -= dt;
    if (markT <= 0) {
      markT = 0.34;
      for (let n = 0; n < 6; n++) {
        markI = (markI + 1) % 6;
        if (joys[markI]) continue;
        if (joyPoint(markI)) FX("ring", pt.x, pt.z, pt.color, pt.y);
        break;
      }
    }

    // Pip
    pipT += dt;
    pipThink -= dt;
    if (pipThink <= 0) { pipThink = 0.4; thinkPip(); }
    if (player.moving || player.lock > 0 || !player.grounded || player.swimming) idleT = 0; else idleT += dt;
    if (idleT > 12 && pip === "follow" && joyCount() < 6 && !friend.busy) {
      idleT = 0;
      // lead to the nearest joy that is still open
      let best = -1, bd = 1e9;
      for (let i = 0; i < 6; i++) {
        if (joys[i] || !joyPoint(i)) continue;
        const d = dist2(player.x, player.z, pt.x, pt.z);
        if (d < bd && d > 2.5) { bd = d; best = i; }
      }
      if (best >= 0) {
        joyPoint(best);
        const p = best === 0 ? Z.fallSteps : best === 2 ? Z.sandbank : pt;
        leadRoute[0].x = p.x; leadRoute[0].z = p.z;
        pip = "lead"; pipT = 0;
        friend.do("lead", { route: leadRoute, waitDist: 4.5, run: true });
        ui.hint("Pip wants to show you something!", 2.6);
      }
    }

    // the day ends by itself: never in the middle of something
    // (and not while the keeper is still on his way with the picnic)
    if ((dayT >= DAY_MAX || (dayEndAt > 0 && dayT >= dayEndAt && picnic.state !== 1)) && !dayBusy() && !bal.on && !tr.on && player.lock <= 0 && picnic.eatT < 0 && player.grounded) beginBedtime();
  }

  // =====================================================================================================
  // PART B - bedtime
  // =====================================================================================================
  function beginBedtime() {
    step = "bedtime";
    sleepSeq = false;
    if (bal.on) endBalance("stop");
    setResting(false);
    // the keeper, if he is still about, is gone; the feast stays where it is
    if (picnic.state === 1) { props.bowl.hide(); picnic.state = 3; }
    keeper.reset();
    zoo.door.open(false);
    ui.setQuests(null);
    ui.setTricks(null);
    ui.setCombo(null);
    ui.setAction(null); dayAct = null;
    crowd.disperse();
    crowd.stroll(0);
    gathered = false;
    zoo.setTime("night", 12);
    A("zooAmbience", true, "night");
    ui.banner("BEDTIME", "What a perfect day.", 3.5);
    ui.setObjective("Go to sleep next to Pip", "the nest is glowing");
    pip = "sleep";
    friend.do("sleep", { at: Z.nestFriend });
    markT = 0;
  }
  function startBedtime() {
    hardStop();
    toZoo();
    setupDay();
    for (let i = 0; i < 4; i++) joys[i] = true;
    player.teleport(Z.lookoutFoot ? Z.lookoutFoot.x : 3.5, Z.lookoutFoot ? Z.lookoutFoot.z : -4.5, 1.2);
    friend.place(Z.nestFriend.x - 1.5, Z.nestFriend.z + 1.5, 0);
    ui.showHud(true);
    ui.setCoins(ui.coins);
    ui.setFriendship(joyCount() / 6, "Happiness");
    player.enabled = true;
    cinema.fade("clear", 0.9);
    beginBedtime();
  }

  function playSleep() {
    if (sleepSeq) return;
    sleepSeq = true;
    const g = gen;
    ui.setAction(null); dayAct = null;
    ui.setObjective(null);
    player.enabled = false;
    const nf = Z.nestFriend, ne = Z.nest;
    // Pip must be there, whatever it was doing
    if (friend.behaviour !== "sleep" || friend.distTo(nf.x, nf.z) > 2.5) { friend.place(nf.x, nf.z, nf.yaw); friend.do("sleep", { at: nf }); }
    const mx = (ne.x + nf.x) / 2, mz = (ne.z + nf.z) / 2, my = Math.max(ne.y, nf.y) + 0.14;
    const c = Z.camNest.pos;
    const fx0 = Math.sin(ne.yaw), fz0 = Math.cos(ne.yaw);
    cinema.play([
      { call: () => player.walkTo(ne.x, ne.z, { speed: 0.5, face: ne.yaw }) },
      { shot: { pos: [c.x, c.y, c.z], look: [mx, my, mz], fov: 38,
        to: { pos: [c.x + (mx - c.x) * 0.5, c.y + (my + 0.35 - c.y) * 0.6, c.z + (mz - c.z) * 0.5], fov: 34 }, dur: 9, ease: "out" }, hold: false },
      { until: () => !player.walking, max: 4 },
      { call: () => {
        player.stop();
        platypus.sleep(true);
        A("lullaby", true);
        if (friend.behaviour !== "sleep" || friend.distTo(nf.x, nf.z) > 0.8) { friend.place(nf.x, nf.z, nf.yaw); friend.do("sleep", { at: nf }); }
      } },
      { wait: 2.2 },
      { caption: "For once, you fall asleep right next to each other.", dur: 4, narr: true },
      // through your own eye: Pip, close, already dreaming
      { call: () => { player.hidden = true; } },
      { shot: { pos: [ne.x + fx0 * 0.28, ne.y + 0.2, ne.z + fz0 * 0.28], look: [nf.x, nf.y + 0.13, nf.z], fov: 58, dur: 0 } },
      { eye: "close", duration: 6, tint: "night" },
      { fade: "black", dur: 2 },
      { call: () => A("lullaby", false) },
    ], { skippable: true, release: null, onDone: () => { if (g === gen) startNight("alarm"); } });
  }

  function updateBedtime(dt) {
    if (sleepSeq) return;
    const near = nearPlayer(Z.nest, 2.0);
    const act = near && player.lock <= 0 ? "sleep" : null;
    if (act !== dayAct) { dayAct = act; ui.setAction(act ? "Sleep" : null); }
    markT -= dt;
    if (markT <= 0) { markT = 1.1; FX("ring", Z.nest.x, Z.nest.z, 0x9fb8ff, Z.nest.y + 0.07); }
    hintT += dt;
    if (hintT > 25) { hintT = 0; ui.hint("Pip is waiting at the nest.", 2.6); }
  }

  // =====================================================================================================
  // PART C - the alarm (one long cutscene; not skippable until the level has been beaten once)
  // =====================================================================================================
  function alarmOn() {
    A("alarm", true);
    A("panic", true);
    crowd.panic(true);
    cinema.tint("alarm", 0.7);
    FX("setGlint", 0xff6a55);
  }
  // the player's body, curled at the nest, seen through its own eye; Pip pressed against it
  function setupAtNest() {
    const ne = Z.nest;
    player.x = ne.x; player.z = ne.z; player.yaw = ne.yaw; player.y = ctx.floorAt(ne.x, ne.z);
    platypus.group.position.set(player.x, player.y, player.z);
    platypus.group.rotation.set(0, player.yaw, 0);
    player.hidden = true;
    night.fp = true;
    const fxn = Math.sin(ne.yaw), fzn = Math.cos(ne.yaw);
    eyeWant.set(ne.x + fxn * 0.28, player.y + 0.22, ne.z + fzn * 0.28);
    eyeObj.position.copy(eyeWant);
    // look out toward the glass first
    lookWant.set(ne.x - 5, 1.1, ne.z + 13);
    lookObj.position.copy(lookWant);
    // Pip: half a metre ahead, a little to the side, in view
    const dx = lookWant.x - eyeWant.x, dz = lookWant.z - eyeWant.z, dl = Math.hypot(dx, dz) || 1;
    const px = eyeWant.x + (dx / dl) * 0.8 - (dz / dl) * 0.34, pz = eyeWant.z + (dz / dl) * 0.8 + (dx / dl) * 0.34;
    friend.place(px, pz, Math.atan2(eyeWant.x - px, eyeWant.z - pz));
    friend.do("idle");
    friend.lookAt(eyeObj);
    night.scared = true; night.scaredT = 0;
  }
  // the handler already has the player in his arms at (x, z)
  function setupCarried(x, z, yaw) {
    handler.place(x, z, yaw);
    handler.carry(true);
    keeper.place(Z.hallCorner.x + 1.1, Z.hallCorner.z + 0.9, -PI / 2);
    keeper.hold(false);
    night.carried = true;
    platypus.pose("carried", 0.05);
    player.hidden = false;
    player.x = x; player.z = z; player.y = handler.y; player.yaw = yaw;
    eyeWant.set(x, handler.y + 1.4, z);
    eyeObj.position.copy(eyeWant);
    night.atNest = night.out = true;
  }
  function pipLooksOn() {
    friend.place(10.8, 8.3, 0.6);
    friend.do("idle");
    friend.lookAt(eyeObj);
    night.lookPip = true;
  }
  function onLeap() {
    if (night.leapt) return;
    night.leapt = true;
    ctx.setTimeScale(0.12, 0.25);
    A("alarm", false);
  }
  function onGlass(x, y) {
    if (night.glass) return;
    night.glass = true;
    zoo.glass.shatter(x, y);
    A("glassShatter", true);
    cinema.shake(0.03, 0.6);
    ctx.setTimeScale(0.2, 0.8);
  }
  function onLanded() {
    if (night.landed) return;
    night.landed = true;
    night.scared = false;
    ctx.setTimeScale(1, 1.5);
    A("alarm", false);
    A("panic", false);
    A("heartDrop");
    cinema.tint("sad", 1);
    crowd.panic(false);
  }
  // whatever happened to the leap, by now Pip lies still beyond the broken glass
  function ensureLanded() {
    if (!night.leapt) onLeap();
    if (!night.glass) onGlass(5.3, 1.5);
    if (!night.landed) {
      friend.place(Z.leapTo.x + 0.1, Z.leapTo.z + 0.7, Z.leapTo.yaw);
      onLanded();
    }
    if (friend.behaviour !== "still") friend.do("still");
    friend.lookAt(null);
    ctx.setTimeScale(1, 0.6);
  }

  function segAlarm(S) {
    S.push(
      { shot: { track: eyeObj, pos: [0, 0, 0], look: lookObj, fov: 62, dur: 0 } },
      { wait: 2.5 }, // black, and silence
      { call: () => { alarmOn(); A("eyeOpen"); cinema.eye.shut("alarm"); } }, // lids closed before the black lifts
      { fade: "clear", dur: 0.5 },
      { eye: "open", tint: "alarm", blinks: 2, duration: 5 },
      // the head turns: Pip, right there, frightened
      { call: () => { night.lookPip = true; } },
      { wait: 2.4 },
    );
  }
  function segTaken(S) {
    const g = gen;
    const ne = Z.nest, di = Z.doorIn, dout = Z.doorOut;
    const nl = Math.hypot(di.x - ne.x, di.z - ne.z) || 1, nx = (di.x - ne.x) / nl, nz = (di.z - ne.z) / nl;
    S.push(
      { call: () => {
        step = "taken";
        zoo.door.open(true);
        handler.place(dout.x, dout.z, -PI / 2);
        keeper.place(dout.x + 1.0, dout.z + 0.5, -PI / 2);
        keeper.hold(false);
        handler.walkTo(di.x, di.z, () => {
          if (g !== gen) return;
          handler.walkTo(ne.x + nx * 0.78, ne.z + nz * 0.78, () => { if (g === gen) night.atNest = true; }, true);
        }, true);
        keeper.walkTo(di.x + 0.2, di.z + 0.7, () => {
          if (g !== gen) return;
          keeper.walkTo(ne.x + nx * 2.1 - nz * 0.9, ne.z + nz * 2.1 + nx * 0.9, null, true);
        }, true);
        // the eye goes to the door
        night.lookPip = false;
        lookWant.set(di.x, 1.2, di.z);
      } },
      { wait: 1.2 },
      { call: () => { handler.lookAt(player); lookWant.set(ne.x + nx * 1.6, 1.25, ne.z + nz * 1.6); } },
      { until: () => night.atNest, max: 8 },
      { call: () => {
        night.atNest = true;
        handler.reach({ x: player.x, y: player.y + 0.15, z: player.z });
        lookWant.set(ne.x + nx * 0.78, 1.45, ne.z + nz * 0.78);
        friend.emote("scared");
      } },
      { wait: 0.7 },
      { call: () => {
        handler.kneel(() => {
          if (g !== gen) return;
          // lifted
          handler.carry(true);
          night.carried = true;
          platypus.pose("carried", 0.3);
          A("pickup");
          A("friendChirp", "scared", 1, 0);
        });
      } },
      { until: () => night.carried, max: 2 },
      { call: () => { if (!night.carried) { handler.carry(true); night.carried = true; platypus.pose("carried", 0.2); } handler.stand(); } },
      { wait: 0.9 },
      // over the shoulder, looking BACK at Pip
      { bars: true },
      { call: () => {
        player.hidden = false;
        night.fp = false;
        night.scared = false;
        night.chase = true; night.chaseT = 0.5;
        handler.lookAt(null);
        keeper.walkTo(di.x, di.z, () => {
          if (g !== gen) return;
          keeper.walkTo(dout.x, dout.z, () => { if (g === gen) keeper.walkTo(Z.outside.x + 0.9, Z.outside.z - 2, null, true); }, true);
        }, true);
        handler.walkTo(di.x, di.z, () => {
          if (g !== gen) return;
          handler.walkTo(dout.x, dout.z, () => { if (g === gen) night.out = true; });
        });
      } },
      { shot: { track: handler.group, trackYaw: true, pos: [0.42, 1.62, 1.25], look: friend.group, lookY: 0.2, fov: 46, dur: 0, hand: 0.5 } },
      { until: () => night.out, max: 12 },
      { call: () => {
        night.out = true;
        night.chase = false;
        zoo.door.open(false);
        friend.do("goto", { x: 11.9, z: Z.doorIn.z, yaw: PI / 2 });
        A("friendChirp", "call", 1, 0);
      } },
      { wait: 1.3 },
    );
  }
  function segCarry(S) {
    const g = gen;
    S.push(
      { call: () => {
        // hurried along the service path, round to the visitor side
        handler.walkTo(Z.outside.x, Z.outside.z, () => {
          if (g !== gen) return;
          handler.walkTo(Z.hallCorner.x, Z.hallCorner.z, () => { if (g === gen) night.corner = true; }, true);
        }, true);
        keeper.walkTo(Z.hallCorner.x + 1.1, Z.hallCorner.z + 0.9, null, true);
        friend.do("goto", { x: 10.8, z: 8.3, yaw: 0.6, run: true });
        friend.lookAt(eyeObj);
      } },
      { shot: { track: handler.group, trackYaw: true, pos: [-0.55, 1.75, -2.1], look: [0.1, 1.25, 2.5], fov: 54, dur: 0, hand: 0.8 } },
      { until: () => night.corner, max: 9 },
    );
  }
  function segLeap(S) {
    const g = gen;
    S.push(
      { call: () => {
        step = "leap";
        night.corner = true;
        night.lookPip = true;
        night.fp = true;
        player.hidden = true;
        handler.walkTo(11.2, Z.hallEnd.z, null, false);
        const fr = friend.distTo(Z.leapFrom.x, Z.leapFrom.z);
        friend.glassLeap({ from: Z.leapFrom, to: Z.leapTo, apex: 1.6, duration: 1.1 });
        // if Pip is somehow far away, do not make the moment wait for a long run
        if (fr > 9) friend.place(Z.leapFrom.x + 2.5, Z.leapFrom.z + 0.3, -PI / 2);
      } },
      // carried along the glass: through it, Pip racing to keep level
      { shot: { track: eyeObj, pos: [0, 0, 0], look: lookObj, fov: 50, dur: 0, hand: 0.6 } },
      { until: () => night.leapt, max: 7 },
      // side-on and wide, from inside the habitat: the leap in slow motion
      { call: () => {
        if (!night.leapt) { onLeap(); }
        player.hidden = false;
        night.fp = false;
        const cy = Math.max(1.25, zoo.heightAt(0.6, 7.0) + 0.7);
        cinema.shot({ pos: [0.6, cy, 7.0], look: [5.4, 1.25, 10.4], fov: 50, to: { pos: [1.5, cy - 0.05, 7.5], look: [5.6, 1.0, 11.2], fov: 46 }, dur: 9, ease: "linear" });
      } },
      { until: () => night.glass, max: 7 },
      { until: () => night.landed, max: 7 },
    );
  }
  function segStill(S) {
    S.push(
      { call: () => {
        step = "still";
        ensureLanded();
        handler.walkTo(9.4, Z.hallEnd.z + 0.05, null, false); // two more steps, slower, and he stops
        handler.lookAt(friend);
      } },
      { wait: 2.6 },
      // through your own eyes: Pip, small, not moving
      { call: () => {
        player.hidden = true;
        night.fp = true;
        night.lookPip = true;
        night.motes = true; night.moteT = 0.2;
        lookWant.set(friend.x, friend.y + 0.1, friend.z);
        lookObj.position.copy(lookWant);
        cinema.shot({ track: eyeObj, pos: [0, 0, 0], look: lookObj, fov: 40, dur: 0, hand: 0.25 });
      } },
      { wait: 3 }, // silence
      { call: () => {
        A("sadTheme", true);
        // you reach for Pip: the view pushes in ten centimetres
        eyeObj.getWorldPosition(v1);
        v2.set(friend.x - v1.x, friend.y + 0.1 - v1.y, friend.z - v1.z).normalize().multiplyScalar(0.1);
        cinema.shot({ track: eyeObj, pos: [0, 0, 0], look: lookObj, fov: 40, to: { pos: [v2.x, v2.y, v2.z], fov: 36 }, dur: 7, ease: "inOut", hand: 0.2 });
      } },
      { wait: 7 },
      // you are put to sleep
      { eye: "close", duration: 5, tint: "night" },
      { fade: "black", dur: 1.2 },
      { wait: 4 },
      { call: () => A("sadTheme", false) },
      { wait: 1.6 },
    );
  }

  function startNight(from) {
    hardStop();
    toZoo();
    zoo.setTime("alarm", 0);
    A("zooAmbience", true, "night");
    A("waterfall", 0.15);
    step = from;
    night.on = true;
    player.scripted = true;
    player.enabled = false;
    ui.showHud(false);
    const S = [];
    if (from === "alarm") {
      setupAtNest();
      segAlarm(S); segTaken(S); segCarry(S); segLeap(S); segStill(S);
    } else if (from === "taken") {
      setupAtNest();
      alarmOn();
      night.lookPip = true;
      S.push({ shot: { track: eyeObj, pos: [0, 0, 0], look: lookObj, fov: 62, dur: 0 } }, { fade: "clear", dur: 0.6 }, { wait: 0.6 });
      segTaken(S); segCarry(S); segLeap(S); segStill(S);
    } else if (from === "leap") {
      setupCarried(Z.hallCorner.x, Z.hallCorner.z, -PI / 2);
      alarmOn();
      pipLooksOn();
      S.push({ shot: { track: eyeObj, pos: [0, 0, 0], look: lookObj, fov: 50, dur: 0 } }, { fade: "clear", dur: 0.6 });
      segLeap(S); segStill(S);
    } else {
      setupCarried(10.6, Z.hallEnd.z, -PI / 2);
      crowd.panic(true);
      pipLooksOn();
      ensureLanded();
      S.push({ shot: { pos: [1.5, 1.25, 7.5], look: [5.6, 1.0, 11.2], fov: 46, dur: 0 } }, { fade: "clear", dur: 0.8 });
      segStill(S);
    }
    const g = gen;
    cinema.play(S, {
      skippable: !!(ctx.progress && ctx.progress.isBeaten && ctx.progress.isBeaten(5)),
      bars: from !== "alarm" && from !== "taken", // the first minutes are seen through an eye, not a film frame
      release: null,
      onDone: () => { if (g === gen) startHope("wizard"); },
    });
  }

  function updateNight(dt) {
    const raw = ctx.time.rawDt || dt;
    if (night.scared) {
      night.scaredT -= dt;
      if (night.scaredT <= 0) { night.scaredT = 5; friend.emote("scared"); }
    }
    if (night.carried) {
      handler.carryAnchor.getWorldPosition(v1);
      handler.carryAnchor.getWorldQuaternion(q1);
      platypus.group.position.copy(v1);
      platypus.group.quaternion.copy(q1);
      player.x = handler.x; player.z = handler.z; player.y = handler.y; player.yaw = handler.group.rotation.y;
      // the eye rides a little above the cradle, leaning toward what it looks at
      v2.set(lookObj.position.x - v1.x, 0, lookObj.position.z - v1.z);
      const l = v2.length();
      if (l > 0.01) v2.multiplyScalar(0.3 / l);
      eyeWant.set(v1.x + v2.x, v1.y + 0.26, v1.z + v2.z);
      // Pip runs after them as far as the door
      if (night.chase) {
        night.chaseT -= dt;
        if (night.chaseT <= 0) {
          night.chaseT = 0.4;
          const yaw = handler.group.rotation.y;
          const tx = Math.min(handler.x - Math.sin(yaw) * 1.7, 11.9), tz = handler.z - Math.cos(yaw) * 1.7;
          friend.do("goto", { x: tx, z: tz, run: friend.distTo(tx, tz) > 2.2 });
        }
      }
    }
    if (night.lookPip) lookWant.set(friend.x, friend.y + 0.16, friend.z);
    eyeObj.position.lerp(eyeWant, Math.min(1, raw * 9));
    lookObj.position.lerp(lookWant, Math.min(1, raw * (night.leapt && !night.landed ? 9 : 2.2)));
    if (night.motes) {
      night.moteT -= dt;
      if (night.moteT <= 0) { night.moteT = 2.4; v1.set(friend.x, friend.y + 0.9, friend.z); FX("sadMotes", v1, 5); }
    }
  }

  // =====================================================================================================
  // PART D - hope
  // =====================================================================================================
  function segWizard(S) {
    const c = L.camWizard;
    S.push(
      { call: () => { step = "wizard"; lair.setVoid(true); lair.setGlow(0); } },
      { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: [c.look.x, c.look.y, c.look.z], fov: 40,
        to: { pos: [c.pos.x - 0.25, c.pos.y + 0.03, c.pos.z + 0.45], fov: 36 }, dur: 11, ease: "out" }, hold: false },
      { wait: 1.0 },
      { call: () => {
        wizard.group.visible = true;
        wizard.lookAt(c.pos.x, c.pos.z);
        wizard.appear();
        A("wizardAppear");
        A("wizardMotif");
      } },
      { fade: "clear", dur: 2 },
      { wait: 0.7 },
      { call: () => { wizard.setTalking(true); wizard.gesture("point"); talkT = 3.4; blipT = 0; } },
      { caption: "There is still hope. The platypus will survive.", dur: 6, who: "Wizard Wobble" },
      { wait: 0.9 },
    );
  }
  function segReveal(S) {
    const r0 = L.camRise0, r1 = L.camTimer, cc = L.camCell, cl = L.camLava;
    S.push(
      { call: () => {
        step = "reveal";
        talkT = 0;
        wizard.setTalking(false);
        wizard.group.visible = true;
        lair.setVoid(false);
        lair.setGlow(1, 4);
        A("lavaRumble", 0.7);
        if (lair.timer && lair.timer.text !== "8 DAYS") lair.timer.setText("8 DAYS");
      } },
      // one continuous crane, up past the chains to the timer
      { shot: { pos: [r0.pos.x, r0.pos.y, r0.pos.z], look: [r0.look.x, r0.look.y, r0.look.z], fov: 46,
        to: { pos: [r1.pos.x, r1.pos.y, r1.pos.z], look: [r1.look.x, r1.look.y, r1.look.z], fov: 40 }, dur: 7, ease: "inOut" } },
      { call: () => { tickT = 0; tickN = 3; } },
      { wait: 3 },
      // inside the cell: Pip. Curled up. Breathing.
      { shot: { pos: [cc.pos.x, cc.pos.y, cc.pos.z], look: [cc.look.x, cc.look.y, cc.look.z], fov: 30,
        to: { pos: [cc.pos.x - 0.35, cc.pos.y - 0.05, cc.pos.z + 0.5], fov: 27 }, dur: 5, ease: "out" }, hold: false },
      { wait: 1.2 },
      { call: () => { A("chainCreak"); lair.cell.sway(0.3); if (friend.body && friend.body.blink) friend.body.blink(); } },
      { wait: 3.6 },
      // far below: the lava, and the tiny cell above it
      { shot: { pos: [cl.pos.x, cl.pos.y, cl.pos.z], look: [cl.look.x, cl.look.y, cl.look.z], fov: 52,
        to: { pos: [cl.pos.x + 0.4, cl.pos.y + 0.25, cl.pos.z - 0.3] }, dur: 5.5, ease: "linear" }, hold: false },
      { wait: 0.8 },
      { caption: "Eight days.", dur: 3.6, narr: true },
      { wait: 0.6 },
      { fade: "black", dur: 0.9 },
    );
  }
  function startHope(from) {
    hardStop();
    toLair();
    step = from;
    player.hidden = true;
    player.teleport(L.spawn.x, L.spawn.z, L.spawn.yaw || 0);
    const S = [];
    if (from === "wizard") { lair.setVoid(true); lair.setGlow(0); segWizard(S); segReveal(S); }
    else {
      lair.setGlow(0);
      segReveal(S);
      // a fade step blocks, so the black lifts from a call while the crane is already moving
      S.splice(1, 0, { call: () => cinema.fade("clear", 1.2) });
    }
    const g = gen;
    cinema.play(S, { skippable: true, release: null, onDone: () => { if (g === gen) startTraining("slap"); } });
  }
  function updateHope(dt) {
    const raw = ctx.time.rawDt || dt;
    if (talkT > 0) {
      talkT -= raw;
      blipT -= raw;
      if (blipT <= 0) { blipT = rnd(0.09, 0.15); blip(); }
      if (talkT <= 0) wizard.setTalking(false);
    }
    if (tickN > 0) {
      tickT -= raw;
      if (tickT <= 0) { tickT = 1; tickN--; A("timerTick"); }
    }
  }

  // =====================================================================================================
  // PART E - training on the ledge
  // =====================================================================================================
  function slapObjective() {
    ui.setObjective("Tail Slap the dummy  " + Math.min(slaps, 3) + " / 3", ctx.touch ? "tap Slap, right next to it" : "L or left click, right next to it");
  }
  function startTraining(phase) {
    hardStop();
    toLair();
    A("lavaRumble", 0.7);
    step = phase;
    wizard.group.visible = true;
    dummy.group.visible = true;
    colW.on = colD.on = true;
    player.teleport(L.spawn.x, L.spawn.z, L.spawn.yaw || 0);
    wizard.lookAt(player.x, player.z);
    slaps = phase === "hold" ? 3 : 0;
    ui.showHud(true);
    ui.setCoins(null);
    ui.setAbilities({ slap: true, hold: phase === "hold" });
    ctx.setSpeaker(wizard.group, 2.12);
    const c = L.camTrain, g = gen;
    cinema.play([
      { shot: { pos: [c.pos.x, c.pos.y, c.pos.z], look: [c.look.x, c.look.y, c.look.z], fov: 46, dur: 0 } },
      { fade: "clear", dur: 1.2 },
      { wait: 0.9 },
    ], { skippable: true, release: 1.4, onDone: () => { if (g !== gen) return; if (phase === "hold") beginHold(); else beginSlap(); } });
  }
  function beginSlap() {
    step = "slap";
    player.enabled = true;
    slapObjective();
    trainIdle = 0;
    wizSay([
      { t: "There you are, little one. Pip needs you strong.", g: "wave" },
      { t: "Your tail is as hard as wood. SLAP that dummy!", g: "point" },
    ]);
  }
  function trySlap() {
    if (slapCd > 0 || player.lock > 0 || !player.grounded || holding || throwT >= 0) return;
    platypus.tailSlap();
    player.lock = 0.7;
    slapCd = 0.9;
    slapT = platypus.slapHitTime || 0.28;
    trainIdle = 0;
  }
  function slapHit() {
    const dx = L.dummy.x - player.x, dz = L.dummy.z - player.z, d = Math.hypot(dx, dz);
    if (!dummy.alive || d > 1.5) {
      A("tailSlap");
      if (step === "slap" && d > 1.5 && d < 5) ui.hint("Closer! Stand right next to the dummy.", 2);
      return;
    }
    const ux = dx / (d || 1), uz = dz / (d || 1);
    dummy.hit(ux, uz, 1.6);
    FX("slapRing", L.dummy.x - ux * 0.25, 0.6, L.dummy.z - uz * 0.25, Math.atan2(ux, uz));
    A("tailSlapHit");
    cinema.shake(0.015, 0.2);
    if (step !== "slap") return;
    slaps++;
    slapObjective();
    ui.call(slaps >= 3 ? "CRACK!" : "SLAP!", slaps + " / 3", slaps >= 3 ? "perfect" : "good");
    if (slaps >= 3) {
      dummy.defeat();
      ui.objectiveDone();
      A("questDone");
      const g = gen;
      step = "hold"; // the next slap must not count; the wizard is talking
      holdSub = "wait";
      ctx.after(1.3, () => { if (g === gen) beginHold(); });
    } else A("objective");
  }

  function beginHold() {
    step = "hold";
    player.enabled = true;
    holdSub = "pick";
    misses = 0; thrown = false; trainIdle = 0;
    ui.setAbilities({ slap: true, hold: true });
    props.cushion.place(L.cushion.x, L.cushion.z);
    props.cushion.hitTarget = null;
    ui.setObjective("Pick up the cushion", ctx.touch ? "tap Hold, next to it" : "H or right click, next to it");
    wizSay([
      { t: slaps >= 3 ? "Ha! Hard as oak!" : "Good.", g: "cheer" },
      { t: "Now HOLD. Pick up that little cushion.", g: "point" },
    ]);
  }
  function releaseHold() {
    holding = false;
    platypus.setCarry(false);
    player.carrying = false;
    player.maxSpeed = 3;
    ui.setHolding(false);
  }
  function toggleHold() {
    if (step !== "hold" || holdSub === "wait" || holdSub === "done" || player.lock > 0 || throwT >= 0) return;
    const c = props.cushion;
    trainIdle = 0;
    if (!holding) {
      if (!c.active || c.state !== "ground") return;
      if (dist2(player.x, player.z, c.x, c.z) > 1.4) { ui.hint("Get closer to the cushion.", 2); return; }
      c.pickUp(platypus.holdAnchor);
      platypus.setCarry(true);
      player.carrying = true;
      player.maxSpeed = 2;
      ui.setHolding(true);
      A("pickup");
      holding = true;
      thrown = false;
      if (holdSub === "pick") {
        holdSub = "carry";
        A("objective");
        ui.setObjective("Carry it to the glowing ring and drop it", ctx.touch ? "tap Hold to drop" : "H to drop");
        wizSay([{ t: "Just so! Carry it to the glowing ring and drop it.", g: "point" }]);
      } else if (holdSub === "throw") {
        ui.setObjective("THROW it at the dummy", ctx.touch ? "tap Slap to throw" : "left click, J or L to throw");
      }
      return;
    }
    releaseHold();
    c.drop();
    A("drop");
    if (holdSub === "carry") {
      if (nearPlayer(L.dropRing, 1.8)) {
        holdSub = "throw";
        A("objective");
        dummy.reset(); // a fresh dummy stands up
        v1.set(L.dummy.x, 0.8, L.dummy.z);
        FX("hitBurst", v1, 0xb49cff);
        ui.setObjective("Pick it up again and THROW it at the dummy", ctx.touch ? "Hold, then Slap" : "H, then left click or L");
        wizSay([{ t: "Now pick it up again and THROW it at the dummy!", g: "point" }]);
      } else ui.hint("Not here. Carry it to the glowing ring.", 2.4);
    }
  }
  function throwCushion() {
    if (!holding || throwT >= 0 || player.lock > 0) return;
    const d = platypus.throwAnim() || 0.5;
    player.lock = d;
    throwT = platypus.throwReleaseTime || 0.22;
    player.face = Math.atan2(L.dummy.x - player.x, L.dummy.z - player.z);
    trainIdle = 0;
  }
  function throwRelease() {
    const c = props.cushion;
    if (!holding) return;
    // generous aim: it flies at the dummy
    const dx = L.dummy.x - c.x, dz = L.dummy.z - c.z, d = Math.hypot(dx, dz) || 1;
    hitTarget.x = L.dummy.x; hitTarget.y = 0; hitTarget.z = L.dummy.z;
    hitTarget.r = 0.45 + Math.min(misses, 3) * 0.15;
    c.hitTarget = hitTarget;
    c.throwAt(dx, dz, clamp(d / 0.42, 4, 12.5), 3.5);
    A("throwWhoosh");
    releaseHold();
    thrown = true;
  }
  function onCushionHit() {
    if (step !== "hold" || holdSub !== "throw") return;
    const c = props.cushion;
    const dx = L.dummy.x - player.x, dz = L.dummy.z - player.z, d = Math.hypot(dx, dz) || 1;
    dummy.hit(dx / d, dz / d, 1.4);
    A("cushionHit");
    v1.set(c.x, c.y, c.z);
    FX("hitBurst", v1, 0xffffff);
    holdSub = "done";
    thrown = false;
    ui.objectiveDone();
    A("questDone");
    ui.call("BULLSEYE!", "", "perfect");
    const g = gen;
    ctx.after(1.4, () => { if (g === gen) startEnd(false); });
  }
  function onCushionLand() {
    if (!thrown) return;
    thrown = false;
    if (step !== "hold" || holdSub !== "throw") return;
    misses++;
    ui.setObjective("Pick it up again and THROW it at the dummy", ctx.touch ? "Hold, then Slap" : "H, then left click or L");
    if (!ui.speaking()) wizSay([{ t: misses > 1 ? "Ho ho! Nearly. A little closer this time." : "Ho ho! Nearly. Pick it up and try again." }]);
  }

  function updateTraining(dt) {
    if (slapCd > 0) { slapCd -= dt; ui.setCooldown("slap", clamp(slapCd / 0.9, 0, 1)); }
    if (slapT >= 0) { slapT -= dt; if (slapT < 0) slapHit(); }
    if (throwT >= 0) { throwT -= dt; if (throwT < 0) throwRelease(); }
    const c = props.cushion;
    // the cushion can never be lost
    if (step === "hold" && c.active && c.state !== "held" && (c.y < -0.5 || Math.abs(c.x) > 7.2 || Math.abs(c.z) > 5.2)) c.place(L.cushion.x, L.cushion.z);
    // markers
    trainMarkT -= dt;
    if (trainMarkT <= 0) {
      trainMarkT = 1.1;
      if (step === "slap" && dummy.alive) FX("ring", L.dummy.x, L.dummy.z, 0xffc94a, 0.07);
      else if (step === "hold") {
        if (holdSub === "pick" || (holdSub === "throw" && !holding)) { if (c.state === "ground") FX("ring", c.x, c.z, 0xffffff, 0.07); }
        else if (holdSub === "carry") FX("ring", L.dropRing.x, L.dropRing.z, 0x66e0ff, 0.07);
        else if (holdSub === "throw") FX("ring", L.dummy.x, L.dummy.z, 0xffc94a, 0.07);
      }
    }
    // the pick-up prompt (E works as well as H)
    let act = null;
    if (step === "hold" && !holding && holdSub !== "wait" && holdSub !== "done" && c.active && c.state === "ground" && dist2(player.x, player.z, c.x, c.z) < 1.4) act = "pick";
    if (act !== dayAct) { dayAct = act; ui.setAction(act ? "Pick up" : null, "H"); }
    // a nudge when nothing happens for a while
    if (player.enabled && !ui.speaking()) {
      trainIdle += dt;
      if (trainIdle > 14) {
        trainIdle = 0;
        if (step === "slap") ui.hint(ctx.touch ? "Stand next to the dummy and tap Slap." : "Stand next to the dummy and press L.", 3);
        else if (holdSub === "pick") ui.hint(ctx.touch ? "Walk to the little cushion and tap Hold." : "Walk to the little cushion and press H.", 3);
        else if (holdSub === "carry") ui.hint(holding ? "Walk into the blue ring, then drop it." : "Pick the cushion up again.", 3);
        else if (holdSub === "throw") ui.hint(holding ? (ctx.touch ? "Tap Slap to throw it." : "Left click or press L to throw it.") : "Pick the cushion up first.", 3);
      }
    }
    wizard.lookAt(player.x, player.z);
  }

  // ---- the last words ----
  function startEnd(hard) {
    if (hard) {
      hardStop();
      toLair();
      A("lavaRumble", 0.7);
      wizard.group.visible = true;
      dummy.group.visible = true;
      colW.on = colD.on = true;
      player.teleport(L.dropRing.x, L.dropRing.z - 0.6, 0);
      wizard.lookAt(player.x, player.z);
      ui.showHud(true);
      ui.setCoins(null);
      ctx.setSpeaker(wizard.group, 2.12);
      cinema.fade("clear", 0.9);
    }
    step = "end";
    if (holding) { releaseHold(); props.cushion.drop(); }
    player.enabled = false;
    ui.setObjective(null);
    ui.setAction(null); dayAct = null;
    ui.setAbilities({});
    const g = gen;
    wizSay([
      { t: "Splendid! A tail like wood and a grip like iron.", g: "cheer" },
      { t: "Eight days, little one. We begin tomorrow.", g: "cast" },
    ], () => {
      if (g !== gen) return;
      endLook = true;
      ctx.after(3.4, () => {
        if (g !== gen || step !== "end") return;
        step = "done";
        cinema.endCard("TO BE CONTINUED", { hold: 4 }, () => ctx.complete());
      });
    });
  }
  function updateEnd(dt) {
    wizard.lookAt(player.x, player.z);
    if (!endLook) return;
    // you turn and look up at the cell
    const want = Math.atan2(L.cell.x - player.x, L.cell.z - player.z);
    cam.manualT = 1;
    cam.yaw += wrap(want - cam.yaw) * Math.min(1, dt * 1.1);
    cam.pitch += (0.1 - cam.pitch) * Math.min(1, dt * 1.1);
    cam.wantDist += (4.6 - cam.wantDist) * Math.min(1, dt);
    player.face = want;
    player.lock = Math.max(player.lock, 0.3);
    if (!creaked) { creaked = true; A("chainCreak"); lair.cell.sway(0.25); platypus.lookAt(v1.set(L.cell.x, L.cell.y + 0.6, L.cell.z)); }
  }

  // =====================================================================================================
  // level interface
  // =====================================================================================================
  function enter() {
    hardStop();
    ctx.colliders.push(colW, colD);
    props.clearPushers();
    props.addPusher(player, 0.35);
    props.addPusher(friend, 0.32);
    props.coins.magnet = player;
    props.coins.onCollect = onCoin;
    props.cushion.onHit = onCushionHit;
    props.cushion.onLand = onCushionLand;
    friend.setName("Pip");
    friend.onEvent = onFriend;
    toZoo();
    setupDay();
    step = "intro";
  }

  function onFriend(type, data) {
    if (night.on) {
      if (type === "leap") onLeap();
      else if (type === "glass") onGlass(data ? data.x : 5.3, data ? data.y : 1.5);
      else if (type === "landed") onLanded();
      return;
    }
    if (step === "day") {
      if (type === "arrived" && pip === "lead") { friend.emote("call"); setPip("follow"); }
      else if (type === "returned" && pip === "fetch") setPip("follow");
    }
  }

  function update(dt, time) {
    if (step === "boot") return;
    if (inLair) {
      friend.update(dt, time);
      props.update(dt, time);
      wizard.update(dt, time);
      dummy.update(dt, time);
      if (step === "wizard" || step === "reveal") updateHope(dt);
      else if (step === "slap" || step === "hold") updateTraining(dt);
      else if (step === "end" || step === "done") updateEnd(dt);
      return;
    }
    if (step === "day") updateDay(dt);
    else if (step === "bedtime") updateBedtime(dt);
    else if (step === "intro") {
      introCallT -= dt;
      if (introCallT <= 0 && !friend.busy) { introCallT = 1.7; friend.emote("call"); }
    }
    friend.update(dt, time);
    crowd.update(dt, time);
    props.update(dt, time);
    if (night.on) updateNight(dt);
    else {
      // the waterfall is heard from wherever you are
      fallT -= dt;
      if (fallT <= 0) {
        fallT = 0.25;
        const f = zoo.fall || Z.fallTop;
        A("waterfall", clamp(1 - dist2(player.x, player.z, f.x, f.z) / 15, 0.05, 1));
      }
    }
  }

  function onAction(name) {
    idleT = 0;
    if (step === "day") {
      if (name === "jump") return slide.on || resting;
      if (name === "interact") dayInteract();
      else if (name === "trick1") tryTrick(0);
      else if (name === "trick2") tryTrick(1);
      else if (name === "trick3") tryTrick(2);
      else if (name === "trick4") tryTrick(3);
      return false;
    }
    if (step === "bedtime") {
      if (name === "interact" && !sleepSeq && nearPlayer(Z.nest, 2.0)) playSleep();
      return false;
    }
    if (step === "slap" || step === "hold") {
      if (name === "tailSlap" || name === "primary") {
        if (holding) {
          if (holdSub === "throw") throwCushion();
          else if (name === "tailSlap") ui.hint(ctx.touch ? "Tap Hold to drop it." : "Press H to drop it.", 2);
        } else trySlap();
      } else if (name === "hold" || name === "interact" || name === "secondary") toggleHold(); // H, E or right click
    }
    return false;
  }

  // a dive of a metre or more, let go while moving: the water leap (through the floating ring it is a RING LEAP)
  function onDive(under, depth) {
    if (step !== "day" || under || dayBusy() || bal.on || tr.on) return;
    if (!(depth >= 1.0) || player.speed <= 1.5) return;
    const info = platypus.tricks && platypus.tricks.waterLeap;
    const d = platypus.trick("waterLeap") || (info ? info.dur : 1.4);
    player.lock = d;
    A("trickWhoosh", 3);
    FX("splash", player.x, 0, player.z, 0.8);
    A("splash", 0.7);
    const ring = dist2(player.x, player.z, zoo.ring.x, zoo.ring.z) < 1.4;
    beginTrick(ring ? "ringLeap" : "waterLeap", ring ? "Ring leap" : "Water leap", ring ? 5 : 3, d, info ? info.apex : 0.6, false);
  }

  function exit() {
    hardStop();
    cinema.eye.clear();
    cinema.tint(null);
    props.clearPushers();
    props.coins.magnet = null;
    props.coins.onCollect = null;
    props.cushion.onHit = null;
    props.cushion.onLand = null;
    friend.onEvent = null;
    friend.lookAt(null);
    zoo.reset();
    lair.reset();
    FX("setGround", null, null);
    FX("setGlint", 0xfff2dc);
    inLair = false;
    step = "boot";
  }

  function win() {
    if (step === "done" || step === "boot") return;
    hardStop();
    step = "done";
    cinema.endCard("TO BE CONTINUED", { hold: 2.5 }, () => ctx.complete());
  }

  function skipTo(name) {
    if (step === "boot" || STEPS.indexOf(name) < 0) return false;
    switch (name) {
      case "intro": startIntro(); break;
      case "day": startDay(); break;
      case "bedtime": startBedtime(); break;
      case "alarm": case "taken": case "leap": case "still": startNight(name); break;
      case "wizard": case "reveal": startHope(name); break;
      case "slap": case "hold": startTraining(name); break;
      case "end": startEnd(true); break;
      default: win();
    }
    return true;
  }

  return {
    build, enter, start, update, exit, onAction, onDive,
    onJump() { idleT = 0; },
    onLand() { idleT = 0; },
    state() {
      return { step, joys: joys.slice(), coins: ui.coins, slaps, cushion: props ? props.cushion.state : "ground",
        pip, holdSub, dayT: Math.round(dayT), picnic: picnic.state, night: night.on, lair: inLair };
    },
    skipTo, win,
    STEPS,
  };
}
