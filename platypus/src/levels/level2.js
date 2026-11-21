// level2.js - LEVEL 2 "THE CHAOS REALM" (LEVELS.md C2, STORY.md level 2).
//
// Beats, in order (each is also a skip point for tests):
//   title    black, LEVEL 2 - THE CHAOS REALM
//   wake     first person, one eye opens: the habitat, and another platypus peering at you
//   cutscene the friend plays with you (stretch, nudge, rings, play-bow, splash, call) - skippable
//   race     quest 1: follow the friend over the rocks
//   hide     quest 2: hide and seek, three rounds
//   dive     quest 3: catch five fish
//   ball     quest 4: pass the ball six times
//   friends  the friendship meter is full: nuzzle, YOU ARE FRIENDS, the friend is called Pip
//   feed     the keeper brings breakfast
//   school   Pip teaches spin, backflip, tail stand and the ball balance; the first visitors pay
//   show     free play: earn 30 coins
//   poster   evening; the camera pushes through the glass to the poster, the riddle can be clicked
//   done     fade, ctx.complete()
//
// Everything that waits for something (an event, the player, a timer) also has a way out, so no beat
// can dead-end: quests help after a while, cutscenes time out their "until" steps, events have fallbacks.
import { createZoo } from "../zoo.js";
import { createFriend } from "../friend.js";
import { createCrowd } from "../crowd.js";
import { createProps } from "../props.js";

export const meta = { n: 2, title: "THE CHAOS REALM" };

const STEPS = ["title", "wake", "cutscene", "race", "hide", "dive", "ball", "friends", "feed", "school", "show", "poster", "done"];
const IDX = {};
for (let i = 0; i < STEPS.length; i++) IDX[STEPS[i]] = i;

const GOAL = 30, MAX_WATCH = 9, FISH_GOAL = 5, PASS_GOAL = 6, ROUNDS = 3, EATS = 3;
const TR = [
  { name: "spin", label: "Spin", title: "SPIN" },
  { name: "backflip", label: "Backflip", title: "BACKFLIP" },
  { name: "tailStand", label: "Tail stand", title: "TAIL STAND" },
];
const BASE = { spin: 1, backflip: 2, tailStand: 2, waterLeap: 3, ringLeap: 5, hoop: 4, ball: 1 };
const TITLE = { spin: "SPIN", backflip: "BACKFLIP", tailStand: "TAIL STAND", waterLeap: "WATER LEAP", ringLeap: "RING LEAP", hoop: "HOOP JUMP", ball: "BALL BALANCE" };
const SHOW_HINTS = [
  "Do a DIFFERENT trick each time for a combo!",
  "Jump through the hoop for a big bonus!",
  "Dive deep in the pool and pop up fast: WATER LEAP!",
  "Stand by the ball and balance it on your bill!",
];

const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const hyp = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

export function createLevel(ctx) {
  const { THREE, player, platypus, ui, cinema, audio, fx } = ctx;
  let zoo = null, friend = null, crowd = null, props = null, keeper = null;
  let hoopT = null, ringT = null;

  // ------------------------------------------------------------------ state
  let step = "boot";
  let gen = 0;        // bumps on every beat change / skip: pending timers of the old beat do nothing
  let visit = 0;      // bumps on enter / exit
  let cineSeq = 0, cineCur = 0;
  let friendship = 0, coinsGot = 0, riddleFallen = false;
  const done = { race: false, hide: false, dive: false, ball: false };
  const count = { race: 0, raceLen: 0, found: 0, fish: 0, passes: 0, eats: 0, lesson: 0 };
  // flags set by events (reset on every beat)
  const fl = { nudged: false, circled: false, splashes: 0, arrived: false, hidden: false, nuzzled: false, trickDone: null, keeperAt: false, bowlDown: false };
  // per-beat scratch (reset on every beat)
  const q = {
    over: false, phase: "", t: 0, t2: 0, t3: 0, n: 0, idx: 0, base: 0, route: null, round: 0, spots: [], spot: null,
    eyeShut: false, band: 0, bandT: 0, heartT: 0, helped: false, swam: false, knock: false, rest: 0, fetching: false,
    eats: 0, first: false, pip: 0, pipAt: false, pipEating: false, lesson: -1, pick: null, hintT: 0, hintI: 0, markT: 0,
  };
  // tricks and money (kept across school -> show)
  const tk = {
    on: false, unlocked: [false, false, false], ballUnlocked: false, want: -1, sig: -1,
    last: null, lastEnd: -99, combo: 1, comboVis: false, pendKey: null, pendName: null, pendGap: false,
    crowdN: 0, gatherT: 99, idle: 0, hintUnseen: false, hintCoins: false, ringAt: -99, ballSlot: false,
  };
  const bal = { on: false, t: 0, payT: 0, ticks: 0, bias: 1, wob: 0, fails: 0 };
  const mk = { on: false, x: 0, y: 0, z: 0, t: 0, color: 0xffe27a };
  const drops = [];
  for (let i = 0; i < 16; i++) drops.push({ x: 0, z: 0, on: false, age: 0 });
  let dropNext = 0;
  const keeperCol = { x: 0, z: 0, r: 0.36, on: false };
  const bowlCol = { x: 0, z: 0, r: 0.2, on: false };
  let act = null;           // what "interact" does right now
  let fallT = 0;

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), eyePos = new THREE.Vector3();
  const scr = { x: 0, y: 0, visible: false };
  const tossFrom = { x: 0, y: 1.5, z: 10.5 };
  const probe = { x: 0, y: 0, z: 0 };

  // ------------------------------------------------------------------ small helpers
  function later(sec, fn) {
    const g = gen;
    ctx.after(sec, () => { if (g === gen) fn(); });
  }
  function resetFlags() {
    fl.nudged = fl.circled = fl.arrived = fl.hidden = fl.nuzzled = fl.keeperAt = fl.bowlDown = false;
    fl.splashes = 0; fl.trickDone = null;
  }
  function go(name) {
    gen++;
    step = name;
    resetFlags();
    q.over = false; q.phase = ""; q.t = q.t2 = q.t3 = 0; q.n = 0; q.idx = 0; q.base = 0; q.route = null; q.round = 0; q.spot = null;
    q.eyeShut = false; q.band = 0; q.bandT = 0; q.heartT = 0; q.helped = false; q.swam = false; q.knock = false; q.rest = 0; q.fetching = false;
    q.eats = 0; q.first = false; q.pip = 0; q.pipAt = false; q.pipEating = false; q.lesson = -1; q.pick = null; q.hintT = 0; q.markT = 0;
    clearMark();
    prompt(null, null);
  }
  function prompt(label, fn) {
    act = label ? fn : null;
    ui.setAction(label || null);
  }
  function setMark(x, z, y, color) {
    mk.on = true; mk.x = x; mk.z = z;
    mk.y = typeof y === "number" ? y : groundY(x, z) + 0.05;
    mk.color = color || 0xffe27a;
    if (mk.t > 0.85) mk.t = 0;
  }
  function clearMark() { mk.on = false; mk.t = 0; }
  function groundY(x, z) {
    const h = zoo.heightAt(x, z), w = zoo.waterAt(x, z);
    return w > h ? w : h;
  }
  const pipName = () => friend.name || "your friend";
  const moveKeys = () => (ctx.touch ? "use the stick" : "WASD or arrows");
  function heartsAt(x, y, z, n) { v1.set(x, y, z); fx.hearts(v1, n); }
  function floatAt(text, x, y, z, kind) {
    v1.set(x, y, z);
    ctx.project(v1, scr, 0);
    if (scr.visible) ui.floatText(text, scr.x, scr.y, kind);
  }
  function chirp(mood) { friend.emote(mood); }

  // one wrapper round cinema.play: a skip drops the cutscene's timers, a debug abort silences onDone
  function playCine(steps, o, onDone) {
    const id = ++cineSeq;
    cineCur = id;
    cinema.play(steps, {
      skippable: o.skippable !== false,
      release: o.release === null ? null : o.release === undefined ? 0.8 : o.release,
      onSkip() { if (cineCur !== id) return; gen++; if (o.onSkip) o.onSkip(); },
      onDone(skipped) { if (cineCur !== id) return; cineCur = 0; onDone(skipped); },
    });
  }

  // ------------------------------------------------------------------ HUD
  function hud() {
    const i = IDX[step];
    ui.showHud(true);
    if (i >= IDX.race && i <= IDX.friends) {
      ui.setQuests([
        { id: "race", text: "Rock race", done: done.race, current: step === "race" },
        { id: "hide", text: "Hide and seek", done: done.hide, current: step === "hide" },
        { id: "dive", text: "Catch " + FISH_GOAL + " fish", done: done.dive, current: step === "dive" },
        { id: "ball", text: "Play ball", done: done.ball, current: step === "ball" },
      ], "Play with your friend");
    } else if (i >= IDX.feed && i <= IDX.show) {
      ui.setQuests([
        { id: "feed", text: "Eat breakfast", done: i > IDX.feed, current: i === IDX.feed },
        { id: "school", text: "Learn tricks", done: i > IDX.school, current: i === IDX.school },
        { id: "show", text: "Earn " + GOAL + " coins", done: false, current: i === IDX.show },
      ], "Today");
    } else ui.setQuests(null);
    if (i >= IDX.race && i <= IDX.show) ui.setFriendship(friendship, friend.name || "Friendship");
    else ui.setFriendship(null);
    ui.setCoins(i >= IDX.school && i <= IDX.show ? coinsGot : null);
  }
  function questDone(id, next, emoteDelay) {
    if (q.over) return;
    q.over = true;
    done[id] = true;
    friendship = Math.min(1, friendship + 0.25);
    audio.questDone();
    ui.setQuest(id, { done: true });
    ui.objectiveDone();
    ui.setFriendship(friendship, friend.name || "Friendship");
    clearMark();
    prompt(null, null);
    if (emoteDelay > 0) later(emoteDelay, () => friend.emote("happy")); else friend.emote("happy");
    floatAt("+1", friend.x, friend.y + 0.55, friend.z, "heart");
    later(2.6 + (emoteDelay || 0), next);
  }

  // ------------------------------------------------------------------ build / enter / exit
  function build() {
    zoo = ctx.shared("zoo", () => createZoo(ctx));
    friend = ctx.shared("friend", () => createFriend(ctx));
    crowd = ctx.shared("crowd", () => createCrowd(ctx));
    props = ctx.shared("props", () => createProps(ctx));
    keeper = crowd.staff[0];
    hoopT = props.hoop(zoo.hoop);
    ringT = props.hoop(zoo.ring);
    if (ctx.debug) ctx.debug.level2 = { zoo, friend, crowd, props };
  }

  function resetModel() {
    if (typeof platypus.reset === "function") platypus.reset();
    else { platypus.sleep(false); platypus.pose(null); platypus.setCarry(false); platypus.lookAt(null); platypus.setEyes(null); }
  }
  function resetTricks() {
    tk.on = false; tk.unlocked[0] = tk.unlocked[1] = tk.unlocked[2] = false; tk.ballUnlocked = false; tk.want = -1; tk.sig = -1;
    tk.last = null; tk.lastEnd = -99; tk.combo = 1; tk.comboVis = false; tk.pendKey = null; tk.pendName = null; tk.pendGap = false;
    tk.crowdN = 0; tk.gatherT = 99; tk.idle = 0; tk.hintUnseen = false; tk.hintCoins = false; tk.ringAt = -99; tk.ballSlot = false;
    bal.on = false; bal.fails = 0;
    for (let i = 0; i < drops.length; i++) drops[i].on = false;
    hoopT.reset(); ringT.reset();
  }

  function enter() {
    visit++;
    gen++;
    cineCur = 0;
    step = "title";
    friendship = 0; coinsGot = 0; riddleFallen = false;
    done.race = done.hide = done.dive = done.ball = false;
    count.race = count.raceLen = count.found = count.fish = count.passes = count.eats = count.lesson = 0;

    zoo.reset();
    zoo.group.add(friend.group, crowd.group, props.group);
    friend.reset(); crowd.reset(); props.reset();
    friend.setWorld(zoo); props.setWorld(zoo);
    crowd.setLane(zoo.walkway, zoo.glass.z);
    props.clearPushers();
    props.addPusher(player, 0.35);
    props.addPusher(friend, 0.32);
    props.coins.magnet = player;
    props.coins.onCollect = onCoin;
    friend.setName("");
    friend.onEvent = onFriend;
    resetModel();
    platypus.onEvent = onModel;
    resetTricks();
    go("title");

    ctx.setWorld(zoo);
    zoo.setTime("morning", 0);
    zoo.poster.setText("PLATYPUS TRICKS", "IN 2 DAYS");
    zoo.fish.respawn = true;
    if (typeof fx.setGround === "function") fx.setGround(zoo.heightAt, waterOrNull);
    keeperCol.on = bowlCol.on = false;
    ctx.colliders.push(keeperCol, bowlCol);
    audio.zooAmbience(true, "day");
    fallT = 0;

    placeAsleep();
    crowd.stroll(4);
  }
  function waterOrNull(x, z) {
    const w = zoo.waterAt(x, z);
    return w > -1000 ? w : null;
  }

  function exit() {
    visit++;
    gen++;
    cineCur = 0;
    stopBalance("quiet");
    friend.onEvent = null;
    friend.reset();
    friend.setName("");
    crowd.reset();
    props.coins.magnet = null;
    props.coins.onCollect = null;
    props.clearPushers();
    props.reset();
    platypus.onEvent = null;
    resetModel();
    player.scripted = false; player.hidden = false; player.maxSpeed = 3; player.canJump = true; player.face = null;
    zoo.reset();
    if (typeof fx.setGround === "function") fx.setGround(null, null);
    audio.zooAmbience(false);
    audio.waterfall(0);
    keeperCol.on = bowlCol.on = false;
    act = null;
    step = "boot";
  }

  // ------------------------------------------------------------------ placements
  const SPOT = {
    out: { x: 8.2, z: -4.6 },        // open sand in front of the burrow: where the friend plays with you
    shore: { x: 0.2, z: 2.6 },       // the friend's place on the sand bank
    mid: { x: 1.5, z: 1.2 },
    pre: { x: 5.6, z: -3.4 },        // round the lookout terrace, not through it
    logW: { x: 0.45, z: -5.6 },      // the west mouth of the hollow log
    ballShow: { x: 1.3, z: 7.2 },    // the ball next to the show rock
    keeper: { x: 10.75, z: -1.62 },  // where the keeper kneels
    hug: { x: 1.0, z: 2.2 },         // the friendship moment, with the pool behind
  };
  function placeAsleep() {
    const N = zoo.P.nest, s = Math.sin(N.yaw), c = Math.cos(N.yaw);
    player.teleport(N.x, N.z, N.yaw);
    platypus.sleep(true);
    const fxp = N.x + s * 1.25, fzp = N.z + c * 1.25;
    eyePos.set(N.x + s * 0.42, ctx.floorAt(N.x, N.z) + 0.2, N.z + c * 0.42);
    friend.do("idle");
    // on all fours, three-quarters on, its face turned to you (seen from the sleeper's eye the upright
    // "sit" reads as a blob, and "still" is the lying-down pose): a goto to where it already stands holds it there
    const fyaw = Math.atan2(N.x - fxp, N.z - fzp) - 0.6;
    friend.place(fxp, fzp, fyaw);
    friend.do("goto", { x: fxp, z: fzp, yaw: fyaw });
    friend.lookAt(eyePos);
  }
  function yawOutToPool() { return Math.atan2(SPOT.shore.x - SPOT.out.x, SPOT.shore.z - SPOT.out.z); }
  function placeAfterCutscene() {
    player.hidden = false;
    platypus.sleep(false);
    platypus.pose(null);
    player.stop();
    player.teleport(SPOT.out.x, SPOT.out.z, yawOutToPool());
    friend.do("idle");
    friend.lookAt(null);
    friend.place(SPOT.shore.x, SPOT.shore.z, Math.atan2(SPOT.out.x - SPOT.shore.x, SPOT.out.z - SPOT.shore.z));
    cinema.tint(null);
  }

  // ------------------------------------------------------------------ 1-3. title, wake, cutscene
  function start() {
    const v = visit;
    step = "title";
    cinema.titleCard({ kicker: "LEVEL 2", title: "THE CHAOS REALM" }, () => {
      if (v !== visit || step !== "title") return;
      startWake();
    });
  }

  function startWake() {
    go("wake");
    cinema.fade("black", 0);
    ui.showHud(false);
    player.enabled = false;
    zoo.setTime("morning", 0);
    placeAsleep();
    player.hidden = true;
    cinema.eye.shut("day");
    audio.eyeOpen();
    const steps = [
      { shot: { pos: eyePos, look: friend.group, lookY: 0.16, fov: 58, dur: 0 } },
      { fade: "clear", dur: 0.6 },
      () => {
        later(3.2, () => friend.emote("curious"));
        later(6.0, () => friend.emote("chirp"));
      },
      { eye: "open", duration: 8, blinks: 3, tint: "day" },
      { caption: "Good morning.", dur: 2.4, narr: true },
    ];
    playCine(steps.concat(cutSteps()), { onSkip: placeAfterCutscene }, startRace);
  }

  function startCutscene() {
    go("cutscene");
    ui.showHud(false);
    player.enabled = false;
    placeAsleep();
    playCine(cutSteps(), { onSkip: placeAfterCutscene }, startRace);
  }

  // the friend plays with you: about 35 seconds, every wait has a time limit
  function cutSteps() {
    const P = zoo.P, B = SPOT.out, S = SPOT.shore;
    return [
      // the nest: you uncurl and stretch, the friend hops for joy
      () => {
        step = "cutscene";
        player.hidden = false;
        platypus.sleep(false);
        friend.do("idle");
        friend.lookAt(platypus.group);
        later(1.0, () => platypus.wakeStretch());
        later(1.7, () => friend.emote("happy"));
      },
      // from the side, so the friend does not stand between the camera and the sleeper
      { shot: { pos: [7.96, 0.9, -4.69], look: [8.5, 0.25, -7.1], fov: 34, to: { pos: [7.4, 0.72, -5.0], fov: 31 }, dur: 5.5, hand: 0.3 }, hold: false },
      { wait: 3.8 },
      // out into the morning: the friend runs ahead and calls
      () => {
        friend.lookAt(null);
        fl.arrived = false;
        friend.do("goto", { x: B.x - 1.3, z: B.z + 1.0, run: true });
        later(1.5, () => friend.emote("call"));
        player.walkTo(B.x, B.z, { speed: 0.55, face: yawOutToPool() });
      },
      { shot: { pos: [8.8, 1.0, -1.6], look: [8.5, 0.3, -5.6], fov: 40, to: { pos: [8.9, 0.9, -2.0], look: [8.2, 0.3, -5.0] }, dur: 5, hand: 0.3 }, hold: false },
      { until: () => !player.walking, max: 5 },
      // a nudge
      () => {
        if (hyp(player.x, player.z, B.x, B.z) > 0.6) { player.stop(); player.teleport(B.x, B.z, yawOutToPool()); }
        friend.do("nudge");
      },
      // from the open side: the friend comes in from the left and never crosses the lens
      { shot: { track: platypus.group, pos: [1.7, 0.55, 2.0], look: [-0.4, 0.2, 0.3], fov: 38, to: { pos: [1.4, 0.5, 2.3] }, dur: 4, hand: 0.4 }, hold: false },
      { until: () => fl.nudged, max: 4 },
      { wait: 1.0 },
      // rings round you
      () => friend.do("circle", { radius: 1.15, laps: 2 }),
      { shot: { pos: [B.x - 0.4, 3.4, B.z + 2.6], look: platypus.group, lookY: 0.1, fov: 44, to: { pos: [B.x + 0.6, 3.0, B.z + 2.9] }, dur: 5 }, hold: false },
      { until: () => fl.circled, max: 6 },
      // a play-bow, and you answer it
      () => {
        friend.do("idle");
        friend.emote("bow");
        later(0.9, () => platypus.playBow());
      },
      { shot: { track: platypus.group, pos: [2.3, 0.65, 2.3], look: [0, 0.2, 0], fov: 36, to: { pos: [2.0, 0.55, 2.5] }, dur: 2.5, hand: 0.4 }, hold: false },
      { wait: 2.5 },
      // the whole habitat
      () => { fl.splashes = 0; friend.do("splash", { at: P.poolCenter }); },
      { shot: { pos: P.camWide.pos, look: P.camWide.look, fov: 46, to: { pos: [-8.5, 4.2, 8.2], look: [-2, 0.3, 0] }, dur: 6.5 }, hold: false },
      { wait: 1.2 },
      { caption: "This is home.", dur: 3.2, narr: true },
      { wait: 2.1 },
      // the friend in the pool
      { shot: { pos: [-0.8, 1.1, 2.4], look: friend.group, lookY: 0.15, fov: 38, dur: 0, hand: 0.5 }, hold: false },
      { until: () => fl.splashes >= 2, max: 6 },
      () => { fl.arrived = false; friend.do("goto", { x: S.x, z: S.z, run: true }); },
      { until: () => fl.arrived, max: 4.5 },
      // people on the other side of the glass
      { shot: { pos: P.camGlass.pos, look: P.camGlass.look, fov: 44, to: { pos: [0, 1.4, 5.4] }, dur: 3 }, hold: false },
      { caption: "And that…", dur: 2.6, narr: true },
      () => { friend.lookAt(platypus.group); friend.emote("call"); },
      { shot: { track: friend.group, pos: [1.5, 0.45, -0.7], look: [0, 0.22, 0], fov: 30, to: { pos: [1.3, 0.4, -0.6] }, dur: 3, hand: 0.4 }, hold: false },
      { caption: "…is a friend?", dur: 2.6, narr: true },
      () => { friend.lookAt(null); ctx.cam.yaw = player.yaw; },
    ];
  }

  // ------------------------------------------------------------------ 4. quest 1: the rock race
  function startRace() {
    go("race");
    hud();
    player.hidden = false;
    player.enabled = true;
    const P = zoo.P;
    const route = [];
    if (player.x > 4.5) route.push(SPOT.pre);
    route.push(SPOT.logW, P.hollowLog, P.logBridgeA, P.logBridgeB, P.fallSteps, P.sunRock, P.lookoutFoot, P.lookout);
    q.route = route;
    q.idx = 0; q.base = 0; q.t = 0; q.phase = "come";
    count.race = 0; count.raceLen = route.length;
    ui.setObjective("Follow your friend!", moveKeys());
    // the friend comes over first, calls, then dashes off
    const dx = route[0].x - player.x, dz = route[0].z - player.z, d = Math.hypot(dx, dz) || 1;
    probe.x = player.x + (dx / d) * 1.8; probe.z = player.z + (dz / d) * 1.8;
    zoo.confine(probe, 0.4);
    friend.do("goto", { x: probe.x, z: probe.z, run: true });
  }
  function raceLead() {
    if (step !== "race" || q.phase !== "come") return;
    q.phase = "call";
    friend.emote("call");
    later(0.95, () => {
      q.phase = "lead"; q.t = 0; q.base = 0;
      friend.do("lead", { route: q.route, waitDist: 4.5, run: true });
    });
  }
  function raceCheckpoint(i) {
    if (q.phase !== "lead" || q.over) return;
    const pt = q.route[q.base + i];
    q.idx = q.base + i + 1;
    q.t = 0;
    count.race = q.idx;
    audio.objective();
    if (pt) { v1.set(pt.x, groundY(pt.x, pt.z) + 0.4, pt.z); fx.sparkle(v1, 0xfff2a8, 10); }
    ui.setQuest("race", { text: "Rock race (" + q.idx + "/" + q.route.length + ")" });
    if (pt === zoo.P.lookoutFoot) ui.hint(ctx.touch ? "Up the rocks! Tap Jump if you get stuck" : "Up the rocks! Press Space to jump", 4);
  }
  function raceFinish() {
    if (step !== "race" || q.over) return;
    count.race = q.route.length;
    ui.setQuest("race", { text: "Rock race" });
    friend.trick("spin");
    ui.call("YOU MADE IT!", "", "good");
    questDone("race", startHide, 1.1);
  }
  function updateRace(dt) {
    if (q.over) return;
    q.t += dt;
    if (q.phase === "come") { if (q.t > 7) raceLead(); return; }
    if (q.phase !== "lead") return;
    const pt = q.route[Math.min(q.idx, q.route.length - 1)];
    setMark(pt.x, pt.z);
    if (q.t > 70) {
      // stuck for a long time: Pip stops waiting at that rock and carries on
      q.t = 0;
      q.idx++;
      count.race = q.idx;
      if (q.idx >= q.route.length) { raceFinish(); return; }
      ui.hint("This way!", 2);
      q.base = q.idx;
      friend.do("lead", { route: q.route.slice(q.idx), waitDist: 4.5, run: true });
    }
  }

  // ------------------------------------------------------------------ 5. quest 2: hide and seek
  function startHide() {
    go("hide");
    hud();
    player.enabled = true;
    const P = zoo.P;
    const pool = [P.reeds, P.fallBehind, P.hollowLog, P.ferns, P.nest];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0, t = pool[i];
      pool[i] = pool[j]; pool[j] = t;
    }
    q.spots = pool;
    q.round = 0;
    count.found = 0;
    hideRound();
  }
  function hideRound() {
    if (step !== "hide" || q.over) return;
    // not a spot the seeker is standing on, if another is left
    for (let k = q.round + 1; k < q.spots.length; k++) {
      if (hyp(q.spots[q.round].x, q.spots[q.round].z, player.x, player.z) > 5) break;
      const t = q.spots[q.round];
      q.spots[q.round] = q.spots[k]; q.spots[k] = t;
    }
    q.spot = q.spots[q.round];
    q.phase = "count"; q.t = 0; q.eyeShut = false; q.helped = false; q.knock = false; q.band = 0; q.bandT = 0; q.heartT = 0;
    fl.hidden = false;
    player.enabled = false;
    player.stop();
    clearMark();
    prompt(null, null);
    ui.setObjective("Hide and seek! Close your eyes…", "");
    cinema.caption("Close your eyes… 3, 2, 1", 2.6, { narr: true });
    const g = gen;
    cinema.eye.close({ duration: 2.2, sway: 0.2, tint: "day", onDone() { if (g === gen) q.eyeShut = true; } });
    friend.do("hide", { spot: q.spot });
  }
  function hideOpen() {
    q.phase = "opening";
    const g = gen;
    cinema.eye.open({ duration: 1.6, blinks: 1, tint: "day", sway: 0.2, onDone() { if (g === gen) hideSeek(); } });
    later(2.6, hideSeek); // if the eye never reports back
  }
  function hideSeek() {
    if (step !== "hide" || q.phase !== "opening") return;
    q.phase = "seek"; q.t = 0; q.helped = false;
    cinema.eye.clear();
    player.enabled = true;
    ui.setObjective("Find your friend! (" + (q.round + 1) + "/" + ROUNDS + ")", "listen for the giggles");
  }
  function hideFoundPress() {
    if (step !== "hide" || q.phase !== "seek") return;
    q.phase = "found";
    prompt(null, null);
    clearMark();
    audio.objective();
    ui.call("FOUND YOU!", (q.round + 1) + " of " + ROUNDS, "good");
    const r = q.round;
    if (!friend.found()) friend.emote("happy");
    later(2.4, () => { if (q.phase === "found" && q.round === r) hideNext(); });
  }
  function hideNext() {
    if (step !== "hide" || q.phase !== "found") return;
    q.round++;
    count.found = q.round;
    ui.setQuest("hide", { text: "Hide and seek (" + q.round + "/" + ROUNDS + ")" });
    if (q.round >= ROUNDS) {
      ui.setQuest("hide", { text: "Hide and seek" });
      questDone("hide", startDive, 0);
      return;
    }
    q.phase = "pause";
    later(1.4, hideRound);
  }
  function updateHide(dt) {
    if (q.over) return;
    q.t += dt;
    if (q.phase === "count") {
      if (q.t > 3.4 && !q.knock) { q.knock = true; cinema.caption("No peeking…", 2.2, { narr: true }); }
      if (q.t > 6.5 && !fl.hidden && !q.helped) { q.helped = true; friend.place(q.spot.x, q.spot.z, q.spot.yaw); }
      if (q.eyeShut && (fl.hidden || q.t > 8.5)) hideOpen();
      else if (q.t > 11) hideOpen();
      return;
    }
    if (q.phase !== "seek") return;
    const d = friend.distTo(player.x, player.z);
    // hot / cold
    if (q.bandT > 0) q.bandT -= dt;
    const band = d < 3 ? 3 : d < 6 ? 2 : d < 10 ? 1 : 0;
    if (band !== q.band && q.bandT <= 0) {
      if (band > q.band) ui.hint(band === 3 ? "Very warm!" : band === 2 ? "Warmer…" : "Getting warmer…", 1.6);
      else ui.hint("Colder…", 1.4);
      q.band = band; q.bandT = 2.5;
    }
    if (d < 5) {
      q.heartT -= dt;
      if (q.heartT <= 0) { q.heartT = 2; heartsAt(friend.x, friend.y + 0.4, friend.z, 2); }
    }
    if (q.t > 40) {
      if (!q.helped) { q.helped = true; ui.hint("Look for the glowing ring!", 3); }
      setMark(friend.x, friend.z, undefined, 0xff9ac8);
    }
    // the longer the search, the further away "found" reaches (a spot must never be out of reach)
    const reach = clamp((q.t - 60) / 30, 0, 1) * 2.3;
    if (d < 0.8 + reach * 0.5) hideFoundPress();
    else if (d < 1.7 + reach) prompt("Found you!", hideFoundPress);
    else prompt(null, null);
  }

  // ------------------------------------------------------------------ 6. quest 3: the fish dive
  function fishText() { return "Catch " + FISH_GOAL + " fish (" + count.fish + "/" + FISH_GOAL + ")"; }
  function startDive() {
    go("dive");
    hud();
    player.enabled = true;
    cinema.eye.clear();
    count.fish = 0;
    zoo.fish.respawn = true;
    ui.setObjective(fishText(), "swim out into the pool");
    const c = zoo.P.poolCenter;
    setMark(c.x, c.z, 0.04, 0x9fe8ff);
    friend.do("splash", { at: c });
    if (player.swimming) diveSwam();
  }
  function diveSwam() {
    if (q.swam) return;
    q.swam = true;
    ui.hint(ctx.touch ? "Hold the Jump button to dive" : "Hold Space to dive", 4.5);
    ui.setObjective(fishText(), ctx.touch ? "hold Jump to dive" : "hold Space to dive");
    friend.do("follow", { dist: 1.6, side: 1.0 });
  }
  function fishCaught(x, y, z, byPip) {
    count.fish++;
    q.t = 0;
    audio.eat();
    if (byPip) fx.bubbles(x, y, z, 7, 0);
    ui.setObjective(fishText(), ctx.touch ? "hold Jump to dive" : "hold Space to dive");
    ui.setQuest("dive", { text: fishText() });
    if (!byPip) { platypus.eat(); floatAt("+1", x, y + 0.3, z, "plain"); }
    if (count.fish >= FISH_GOAL) {
      ui.setQuest("dive", { text: "Catch " + FISH_GOAL + " fish" });
      questDone("dive", startBall, 0);
    } else audio.objective();
  }
  function updateDive(dt) {
    if (q.over) return;
    q.t += dt;
    const F = zoo.fish;
    // show where the nearest fish is, on the surface above it
    const near = F.nearest(player.x, player.y, player.z, 40);
    if (near >= 0) { F.pos(near, v2); setMark(v2.x, v2.z, 0.04, 0x9fe8ff); }
    if (player.diving) {
      const bx = player.x + Math.sin(player.yaw) * 0.35, bz = player.z + Math.cos(player.yaw) * 0.35, by = player.y + 0.1;
      // the longer since the last catch, the bigger the bite
      const R = 0.55 + clamp((q.t - 12) / 30, 0, 1) * 0.75;
      const i = F.nearest(bx, by, bz, R);
      if (i >= 0) {
        F.pos(i, v2);
        const fxp = v2.x, fyp = v2.y, fzp = v2.z;
        if (F.catch(i)) fishCaught(fxp, fyp, fzp, false);
      }
    }
    if (q.t > 60 && !q.over) {
      ui.hint(pipName() === "your friend" ? "Your friend caught one for you!" : pipName() + " caught one for you!", 3);
      friend.emote("happy");
      fishCaught(friend.x, friend.y, friend.z, true);
    }
  }

  // ------------------------------------------------------------------ 7. quest 4: play ball
  function ballText() { return "Pass the ball with your friend (" + count.passes + "/" + PASS_GOAL + ")"; }
  function startBall() {
    go("ball");
    hud();
    player.enabled = true;
    count.passes = 0;
    const s = zoo.P.ballSpot;
    props.ball.place(s.x, s.z);
    ui.setObjective(ballText(), "walk into the ball");
    friend.do("playBall", { ball: props.ball });
  }
  function ballPass(helped) {
    if (step !== "ball" || q.over) return;
    count.passes++;
    q.t = 0; q.knock = false;
    ui.setObjective(ballText(), "walk into the ball");
    ui.setQuest("ball", { text: "Play ball (" + count.passes + "/" + PASS_GOAL + ")" });
    floatAt("+1", friend.x, friend.y + 0.5, friend.z, "plain");
    if (helped) ui.hint("Nice one!", 1.6);
    if (count.passes >= PASS_GOAL) {
      ui.setQuest("ball", { text: "Play ball" });
      questDone("ball", startFriends, 0);
    } else audio.objective();
  }
  function ballNearPlayer() {
    probe.x = player.x + Math.sin(player.yaw) * 1.3; probe.z = player.z + Math.cos(player.yaw) * 1.3;
    zoo.confine(probe, 0.4);
    props.ball.place(probe.x, probe.z);
  }
  function updateBall(dt) {
    if (q.over) return;
    const b = props.ball;
    if (!b.active) { ballNearPlayer(); return; }
    q.t += dt;
    const sp = Math.hypot(b.vx, b.vz), dP = hyp(b.x, b.z, player.x, player.z);
    if (sp < 0.6) setMark(b.x, b.z); else clearMark();
    if (dP < 0.85 && player.speed > 0.4) q.knock = true;
    if (q.fetching) {
      q.t2 += dt;
      if (q.t2 > 12) { q.fetching = false; ballNearPlayer(); friend.do("playBall", { ball: b }); }
    } else {
      if (sp < 0.2 && dP > 1.2) q.rest += dt; else q.rest = 0;
      if (q.rest > 6) { q.rest = 0; q.fetching = true; q.t2 = 0; friend.do("fetch", { ball: b }); }
    }
    // a pass that will not come: count the try
    if ((q.t > 45 && q.knock) || q.t > 110) ballPass(true);
    else if (q.t > 20 && !q.knock && q.t3 <= 0) { q.t3 = 25; ui.hint("Walk into the ball to knock it to your friend", 3.5); }
    if (q.t3 > 0) q.t3 -= dt;
  }

  // ------------------------------------------------------------------ 8. becoming friends
  function startFriends() {
    go("friends");
    hud();
    ui.setObjective(null);
    player.enabled = false;
    player.stop();
    friendship = 1;
    const H = SPOT.hug;
    playCine([
      { fade: "black", dur: 0.5 },
      () => {
        ui.setQuests(null);
        player.teleport(H.x, H.z, 0);
        friend.do("idle");
        friend.place(H.x + 1.6, H.z + 2.4, PI);
        cinema.tint("warm", 0.55);
        friend.do("nuzzle");
      },
      { shot: { pos: [3.6, 0.55, 3.3], look: [1.0, 0.3, 2.6], fov: 36, to: { pos: [3.0, 0.42, 2.9], fov: 30 }, dur: 10 }, hold: false },
      { fade: "clear", dur: 0.7 },
      { until: () => fl.nuzzled, max: 6 },
      () => {
        if (!fl.nuzzled) friendsNuzzle();
        const y = ctx.floorAt(H.x, H.z) + 0.45;
        heartsAt(H.x, y, H.z + 0.4, 3);
        later(0.5, () => heartsAt(H.x, y, H.z + 0.4, 3));
        later(1.0, () => heartsAt(H.x, y + 0.1, H.z + 0.4, 3));
        audio.friendship();
      },
      { wait: 1.7 },
      () => {
        friend.setName("Pip");
        ui.setFriendship(1, "Pip");
        ui.showHud(true);
        ui.banner("YOU ARE FRIENDS", "Your friend's name is Pip", 5);
        friend.emote("happy");
      },
      { wait: 5.2 },
      () => { cinema.tint(null); ctx.cam.yaw = player.yaw; },
    ], { skippable: false }, () => {
      cinema.tint(null);
      friend.setName("Pip");
      friend.do("follow", { dist: 1.5, side: 0.9 });
      startFeed();
    });
  }
  function friendsNuzzle() {
    if (fl.nuzzled) return;
    fl.nuzzled = true;
    const d = platypus.nuzzle();
    player.lock = d > 0 ? d : 1.4;
  }

  // ------------------------------------------------------------------ 9. feeding
  function startFeed() {
    go("feed");
    hud();
    player.enabled = true;
    count.eats = 0;
    zoo.setTime("noon", 20);
    crowd.disperse();
    crowd.stroll(4);
    ui.setObjective("Mmm… what is that smell?", "");
    q.phase = "wait";
    later(2.2, feedCutscene);
  }
  function putBowl() {
    if (fl.bowlDown) return;
    fl.bowlDown = true;
    const b = zoo.P.bowl;
    if (props.bowl.left <= 0) props.bowl.fill("yabby", 6);
    props.bowl.attach(null);
    props.bowl.place(b.x, b.z);
    bowlCol.x = b.x; bowlCol.z = b.z; bowlCol.on = true;
    audio.drop();
  }
  function keeperLeave() {
    const P = zoo.P;
    keeper.stand();
    keeper.hold(false);
    keeper.walkTo(P.doorIn.x, P.doorIn.z, () => keeper.walkTo(P.doorOut.x, P.doorOut.z, () => {
      keeper.visible = false;
      keeperCol.on = false;
      zoo.door.open(false);
    }));
  }
  // the ball from the last game must not sit in front of the keeper's camera (or on the bowl's spot)
  function clearStage() {
    const b = props.ball;
    if (b.active && b.x > 6 && b.z < 3.5) b.place(SPOT.ballShow.x, SPOT.ballShow.z);
    if (player.x > 8.6 && player.z < 1.2 && player.z > -4.2) { player.stop(); player.teleport(8.2, 0.6, 2.0); }
  }
  function feedCutscene() {
    if (step !== "feed" || q.phase !== "wait") return;
    q.phase = "cine";
    player.stop();
    const P = zoo.P, K = SPOT.keeper;
    playCine([
      () => {
        zoo.door.open(true);
        keeper.place(P.doorOut.x, P.doorOut.z, -PI / 2);
        props.bowl.fill("yabby", 6);
        props.bowl.attach(keeper.handAnchor);
        keeperCol.on = true;
        friend.do("sit", { lookAt: keeper.group });
        clearStage();
      },
      // wide enough for the whole keeper inside the letterbox
      { shot: { pos: [7.0, 1.4, 1.4], look: [12.0, 0.9, -2], fov: 40, to: { pos: [7.2, 1.25, 1.05], look: [10.6, 0.95, -1.6], fov: 38 }, dur: 7.5 }, hold: false },
      { wait: 0.9 },
      () => keeper.walkTo(P.doorIn.x, P.doorIn.z, () => keeper.walkTo(K.x, K.z, () => { fl.keeperAt = true; })),
      { caption: "Breakfast time!", dur: 2.4, who: "Keeper" },
      { until: () => fl.keeperAt, max: 6 },
      () => {
        if (!fl.keeperAt) keeper.place(K.x, K.z, -PI / 2);
        keeper.kneel(putBowl);
        friend.do("goto", { x: P.bowlFriend.x, z: P.bowlFriend.z, yaw: P.bowlFriend.yaw, run: true });
      },
      { until: () => fl.bowlDown, max: 2.5 },
      { wait: 0.7 },
      () => { putBowl(); keeper.stand(); keeper.wave(); },
      { caption: "There you go, little ones.", dur: 2.3, who: "Keeper" },
      keeperLeave,
      { wait: 0.9 },
    ], {
      onSkip() {
        if (!keeper.visible) { zoo.door.open(true); keeper.place(K.x, K.z, -PI / 2); }
        else keeper.place(K.x, K.z, -PI / 2);
        keeperCol.on = true;
        clearStage();
        putBowl();
        keeperLeave();
        friend.do("idle");
        friend.place(P.bowlFriend.x, P.bowlFriend.z, P.bowlFriend.yaw);
        q.pipAt = true;
      },
    }, feedPlay);
  }
  function feedText() { return "Eat your breakfast (" + q.eats + "/" + EATS + ")"; }
  function feedPlay() {
    if (step !== "feed") return;
    q.phase = "eat"; q.t = 0;
    player.enabled = true;
    putBowl();
    ui.setObjective(feedText(), ctx.touch ? "go to the bowl · tap Eat" : "go to the bowl · press E");
    setMark(bowlCol.x, bowlCol.z);
  }
  function eatPress() {
    if (step !== "feed" || q.phase !== "eat" || q.eats >= EATS || player.lock > 0) return;
    q.eats++;
    count.eats = q.eats;
    q.first = true;
    player.face = Math.atan2(bowlCol.x - player.x, bowlCol.z - player.z);
    const d = platypus.eat();
    player.lock = d > 0 ? d : 1.4;
    q.t2 = player.lock + 0.3;
    prompt(null, null);
    clearMark();
    ui.setObjective(feedText(), ctx.touch ? "tap Eat" : "press E");
  }
  function feedDone() {
    if (step !== "feed" || q.over) return;
    q.over = true;
    prompt(null, null);
    clearMark();
    audio.questDone();
    ui.setQuest("feed", { done: true });
    ui.objectiveDone();
    ui.hint("Yum!", 1.6);
    later(2.0, startSchool);
  }
  function updateFeed(dt) {
    if (q.over || q.phase !== "eat") return;
    q.t += dt;
    if (q.t2 > 0) q.t2 -= dt;
    // Pip eats beside you
    if (!q.pipAt && q.t > 6) { q.pipAt = true; }
    if (q.pipAt && !q.pipEating && q.pip < 3 && !friend.busy) {
      if (friend.distTo(zoo.P.bowlFriend.x, zoo.P.bowlFriend.z) > 0.8) { if (q.t > 6 && friend.behaviour !== "goto") friend.do("goto", { x: zoo.P.bowlFriend.x, z: zoo.P.bowlFriend.z, yaw: zoo.P.bowlFriend.yaw }); }
      else { q.pipEating = true; q.t3 = 2.4; friend.eat(); }
    }
    if (q.pipEating) { q.t3 -= dt; if (q.t3 <= 0) pipAte(); }
    if (q.eats >= EATS) {
      if (q.t2 <= 0 && player.lock <= 0) feedDone();
      return;
    }
    const d = hyp(player.x, player.z, bowlCol.x, bowlCol.z);
    if (d < 1.45 && player.grounded && !player.swimming && player.lock <= 0 && !platypus.acting) prompt("Eat", eatPress);
    else { prompt(null, null); if (player.lock <= 0) setMark(bowlCol.x, bowlCol.z); }
  }
  function pipAte() {
    if (step !== "feed" || !q.pipEating) return;
    q.pipEating = false;
    q.pip++;
    if (props.bowl.left > EATS - q.eats) props.bowl.bite();
  }

  // ------------------------------------------------------------------ 10. tricks school
  function startSchool() {
    go("school");
    hud();
    player.enabled = true;
    tk.on = true;
    tk.sig = -1;
    q.phase = "walk"; q.lesson = -1; q.t = 0;
    count.lesson = 0;
    const s = zoo.P.showRock;
    ui.setObjective("Follow Pip to the rock by the glass", moveKeys());
    setMark(s.x, s.z);
    friend.do("sit", { at: zoo.P.showFriend });
    crowd.stroll(5);
  }
  function lesson(i) {
    if (step !== "school") return;
    q.lesson = i;
    count.lesson = i;
    q.t2 = 0;
    fl.trickDone = null;
    tk.want = -1;
    if (i < 3) {
      q.phase = "demo";
      ui.setObjective("Watch Pip do a " + TR[i].title + "!", "");
      if (!(friend.trick(TR[i].name) > 0)) fl.trickDone = TR[i].name;
    } else if (i === 3) {
      q.phase = "try";
      tk.ballUnlocked = true;
      bal.fails = 0;
      const b = props.ball, s = SPOT.ballShow;
      if (!b.active || hyp(b.x, b.z, s.x, s.z) > 4) b.place(s.x, s.z);
      tk.want = 3;
      ui.setObjective("Balance the ball on your bill", ctx.touch ? "go to the ball · tap Ball" : "go to the ball · press 4");
    } else startShow();
  }
  function lessonTry() {
    if (step !== "school" || q.phase !== "demo") return;
    const i = q.lesson;
    q.phase = "try";
    tk.unlocked[i] = true;
    tk.want = i;
    ui.setObjective("Your turn: " + TR[i].title, ctx.touch ? "tap " + TR[i].label : "press " + (i + 1));
  }
  function lessonDone() {
    if (step !== "school" || q.phase !== "try") return;
    q.phase = "pause";
    tk.want = -1;
    audio.objective();
    ui.objectiveDone();
    clearMark();
    const n = q.lesson + 1;
    later(0.5, () => friend.emote("happy"));
    later(1.9, () => lesson(n));
  }
  function updateSchool(dt) {
    q.t += dt;
    if (q.phase === "walk") {
      const s = zoo.P.showRock;
      if (hyp(player.x, player.z, s.x, s.z) < 2.5 && (fl.arrived || q.t > 10)) {
        clearMark();
        tk.crowdN = 3; tk.gatherT = 0;
        crowd.gather(s.x, tk.crowdN);
        lesson(0);
      }
    } else if (q.phase === "demo") {
      q.t2 += dt;
      if (fl.trickDone || q.t2 > 2.8) lessonTry();
    } else if (q.phase === "try" && q.lesson === 3) {
      if (bal.on) clearMark(); else if (props.ball.active) setMark(props.ball.x, props.ball.z);
    }
  }

  // ------------------------------------------------------------------ 11. show time
  function showText() { return "Earn " + GOAL + " coins with tricks (" + Math.min(coinsGot, GOAL) + "/" + GOAL + ")"; }
  function startShow() {
    go("show");
    hud();
    player.enabled = true;
    tk.on = true;
    tk.sig = -1;
    tk.unlocked[0] = tk.unlocked[1] = tk.unlocked[2] = true;
    tk.ballUnlocked = true;
    tk.want = -1;
    tk.idle = 0;
    if (!props.ball.active) props.ball.place(SPOT.ballShow.x, SPOT.ballShow.z);
    ui.setObjective(showText(), "do tricks near the glass");
    friend.do("follow", { dist: 1.6, side: 1.0 });
    q.hintT = 7; q.hintI = 2;
    if (coinsGot >= GOAL) showDone();
  }
  function showDone() {
    if (step !== "show" || q.over) return;
    q.over = true;
    audio.questDone();
    ui.objectiveDone();
    ui.setQuest("show", { done: true });
    clearMark();
    later(1.6, startPoster);
  }
  function updateShow(dt) {
    if (q.over) return;
    // the next helpful thing: get to the glass, or pick up what was thrown
    let dr = null;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d.on) continue;
      d.age += dt;
      if (d.age > 40) d.on = false;
      else if (d.age > 2.5 && (!dr || d.age > dr.age)) dr = d;
    }
    if (props.coins.lying <= 0) dr = null;
    if (dr) setMark(dr.x, dr.z, undefined, 0xffd24a);
    else if (player.z <= 3 && !player.swimming) setMark(zoo.P.showRock.x, zoo.P.showRock.z);
    else clearMark();
    // twelve quiet seconds and the people wander off
    if (tk.crowdN > 0 && tk.idle > 12) { tk.crowdN = 0; crowd.disperse(); }
    q.hintT -= dt;
    if (q.hintT <= 0 && !platypus.acting && !bal.on) {
      q.hintT = 26;
      ui.hint(SHOW_HINTS[q.hintI % SHOW_HINTS.length], 4.5);
      q.hintI++;
    }
  }

  // ------------------------------------------------------------------ tricks and money (shared rules)
  function watchersNow() {
    if (player.z <= 3) return 0;
    let w = crowd.watchers(player.x, 7);
    if (w === 0 && tk.crowdN > 0 && (tk.gatherT > 6 || step === "school")) w = 1; // they were called: somebody saw it
    return w;
  }
  function beginTrick(key, modelName) {
    tk.pendKey = key;
    tk.pendName = modelName || null;
    tk.pendGap = tk.last !== null && ctx.time.now - tk.lastEnd <= 3;
    tk.idle = 0;
    if (player.z > 3) {
      if (tk.crowdN === 0) { tk.crowdN = 3; tk.gatherT = 0; }
      crowd.gather(player.x, tk.crowdN);
    }
  }
  function tossCoins(total) {
    const n = Math.min(total, 5);
    let left = total;
    for (let k = 0; k < n; k++) {
      const v = k === n - 1 ? left : Math.floor(total / n);
      left -= v;
      const d = drops[dropNext];
      dropNext = (dropNext + 1) % drops.length;
      const a = Math.random() * PI * 2, r = 0.7 + Math.random() * 0.6;
      d.x = player.x + Math.sin(a) * r; d.z = Math.min(9.1, player.z + Math.cos(a) * r);
      zoo.confine(d, 0.3);
      d.on = true; d.age = 0;
      if (!crowd.tossCoin((from) => { props.coins.toss(from, d, v); })) {
        tossFrom.x = clamp(player.x + (Math.random() - 0.5) * 3, -11.5, 11.5);
        props.coins.toss(tossFrom, d, v);
      }
    }
    if (!tk.hintCoins) { tk.hintCoins = true; later(1.3, () => ui.hint("Walk over the coins to pick them up", 3.5)); }
  }
  function pay(key, base, half) {
    const title = TITLE[key] || key.toUpperCase();
    const w = watchersNow();
    if (w <= 0) {
      ui.call(title + "!", "", undefined);
      if (!tk.hintUnseen) { tk.hintUnseen = true; ui.hint("Nobody saw that! Do tricks near the glass.", 3.5); }
      return 0;
    }
    const coins = Math.ceil(base * tk.combo * (0.5 + 0.1 * w));
    if (half) crowd.react("laugh", 0.6);
    if (coins <= 0) { ui.call(title + "!", "again? try a new one", "miss"); return 0; }
    ui.call(title + "!", "+" + coins, tk.combo >= 3 ? "perfect" : "good");
    if (!half) crowd.react(coins >= 6 ? "cheer" : coins >= 3 ? "clap" : "ooh", clamp(0.45 + coins * 0.06, 0, 1));
    if (tk.combo > 1) audio.comboUp(tk.combo);
    tossCoins(coins);
    tk.crowdN = Math.min(MAX_WATCH, Math.max(3, tk.crowdN) + 1);
    crowd.gather(player.x, tk.crowdN);
    return coins;
  }
  function scoreTrick(key) {
    let half = false;
    if (tk.last === key) { tk.combo = 1; half = true; }
    else if (tk.pendGap) tk.combo = Math.min(5, tk.combo + 1);
    else tk.combo = 1;
    tk.last = key;
    tk.pendKey = null;
    pay(key, half ? Math.floor(BASE[key] / 2) : BASE[key], half);
    ui.setCombo(tk.combo);
    tk.comboVis = tk.combo > 1;
    if (step === "school" && q.phase === "try" && q.lesson >= 0 && q.lesson < 3 && key === TR[q.lesson].name) lessonDone();
  }
  function tryTrick(slot) {
    if (!tk.on || step === "poster" || step === "done") return;
    if (slot === 3) {
      if (!tk.ballSlot) return;
      if (bal.on) stopBalance("stop"); else startBalance();
      return;
    }
    const t = TR[slot];
    if (!t) return;
    if (!tk.unlocked[slot]) { ui.flashTrick(slot, false); ui.hint("Pip will show you that one soon", 1.6); return; }
    if (bal.on || player.lock > 0 || platypus.acting || !player.grounded || player.swimming || !player.enabled) { ui.flashTrick(slot, false); return; }
    const d = platypus.trick(t.name);
    if (!(d > 0)) return;
    player.lock = d;
    audio.trickWhoosh(slot);
    ui.flashTrick(slot, true);
    beginTrick(t.name, t.name);
    // Pip joins in during the show
    if (step === "show" && !friend.busy && !friend.swimming && friend.distTo(player.x, player.z) < 6) friend.trick(t.name, 0.3);
  }
  function startBalance() {
    const b = props.ball;
    if (bal.on || !b.active || player.swimming || !player.grounded || player.lock > 0 || platypus.acting) { ui.flashTrick(3, false); return; }
    bal.on = true; bal.t = 0; bal.payT = 0; bal.ticks = 0; bal.wob = 0;
    bal.bias = Math.random() < 0.5 ? -1 : 1;
    b.balanceOn(platypus.ballAnchor);
    b.tilt = 0;
    platypus.pose("balance", 0.3);
    player.maxSpeed = 1.2;
    player.canJump = false;
    beginTrick("ball", null);
    if (tk.last === "ball") tk.combo = 1;
    else if (tk.pendGap) tk.combo = Math.min(5, tk.combo + 1);
    else tk.combo = 1;
    tk.last = "ball";
    ui.setCombo(tk.combo);
    tk.comboVis = tk.combo > 1;
    audio.trickWhoosh(3);
    ui.flashTrick(3, true);
    ui.call("BALL BALANCE!", ctx.touch ? "steer under the ball with the stick" : "steer under the ball with A and D", undefined);
  }
  // how: "drop" (it fell), "win" (four seconds), "stop" (the key again / had to stop), "quiet" (no fuss: clean-up)
  function stopBalance(how) {
    if (!bal.on) return;
    bal.on = false;
    const b = props.ball;
    if (how === "drop") b.drop(); else b.balanceOn(null);
    platypus.pose(null, 0.3);
    player.maxSpeed = 3;
    player.canJump = true;
    tk.lastEnd = ctx.time.now;
    if (how === "quiet") return;
    if (how === "drop") {
      bal.fails++;
      crowd.react("ooh", 0.5);
      ui.call("OOPS!", "the ball fell", "miss");
      audio.trickLand(false);
    } else if (how === "win") {
      crowd.react("cheer", 0.9);
      ui.call("PERFECT BALANCE!", "", "perfect");
      audio.trickLand(true);
    }
    if (step === "school" && q.phase === "try" && q.lesson === 3 && (how === "win" || bal.t >= 1.5 || bal.fails >= 3)) lessonDone();
  }
  function updateBalance(dt) {
    const b = props.ball;
    if (player.swimming || !player.grounded || !b.active) { stopBalance("stop"); return; }
    bal.t += dt;
    tk.idle = 0;
    if (Math.random() < dt * 0.5) bal.bias = -bal.bias;
    bal.wob += ((Math.random() - 0.5) * 2 - bal.wob) * Math.min(1, dt * 2);
    const drift = bal.bias * (0.16 + 0.07 * bal.t) + bal.wob * 0.35 + player.turn * 0.03;
    // positive tilt leans to the animal's left (screen left with the camera behind): steer toward the lean to get under it
    b.tilt = clamp(b.tilt + (drift + ctx.input.x * 1.1) * dt, -1.2, 1.2);
    bal.payT += dt;
    while (bal.payT >= 0.5 && bal.ticks < 8) {
      bal.payT -= 0.5;
      bal.ticks++;
      const w = watchersNow();
      if (w > 0) { tossCoins(Math.ceil(BASE.ball * tk.combo * (0.5 + 0.1 * w))); ui.flashTrick(3, true); }
      else if (!tk.hintUnseen) { tk.hintUnseen = true; ui.hint("Nobody saw that! Do tricks near the glass.", 3.5); }
    }
    if (Math.abs(b.tilt) >= 1) stopBalance("drop");
    else if (bal.t >= 4) stopBalance("win");
  }
  function refreshTricks() {
    if (!tk.on) {
      if (tk.sig !== 0) { tk.sig = 0; ui.setTricks(null); ui.setCombo(0); tk.comboVis = false; }
      return;
    }
    const b = props.ball;
    tk.ballSlot = tk.ballUnlocked && b.active && (bal.on || (!player.swimming && hyp(b.x, b.z, player.x, player.z) < 1.6));
    const sig = 512 | (tk.unlocked[0] ? 1 : 0) | (tk.unlocked[1] ? 2 : 0) | (tk.unlocked[2] ? 4 : 0) | (tk.ballSlot ? 8 : 0) | (bal.on ? 16 : 0) | ((tk.want + 1) << 5);
    if (sig === tk.sig) return;
    tk.sig = sig;
    ui.setTricks([
      { label: TR[0].label, enabled: tk.unlocked[0] },
      { label: TR[1].label, enabled: tk.unlocked[1] },
      { label: TR[2].label, enabled: tk.unlocked[2] },
      tk.ballSlot ? { label: bal.on ? "Let go" : "Ball", enabled: true } : null,
    ]);
    if (tk.want >= 0 && (tk.want < 3 || tk.ballSlot)) ui.setTrickState(tk.want, { want: true });
  }
  function updateTricks(dt) {
    refreshTricks();
    if (!tk.on) return;
    tk.idle += dt;
    tk.gatherT += dt;
    if (bal.on) updateBalance(dt);
    const now = ctx.time.now;
    // the hoop on land (only a real jump counts) and the ring in the pool
    const hp = hoopT.passed(player.x, player.y + 0.15, player.z);
    if (hp && !player.grounded && !bal.on && player.enabled) {
      beginTrick("hoop", null);
      scoreTrick("hoop");
      tk.lastEnd = now;
      audio.trickLand(true);
    }
    if (ringT.passed(player.x, player.y + 0.2, player.z)) tk.ringAt = now;
    if (tk.comboVis && !platypus.acting && !bal.on && now - tk.lastEnd > 3) { tk.comboVis = false; ui.setCombo(0); }
  }

  // the player's model: trick apex / landing / bites / end of a one-shot
  function onModel(type, name) {
    if (step === "boot") return;
    if (type === "apex") {
      if (tk.pendKey && tk.pendName === name) {
        let key = tk.pendKey;
        if (key === "waterLeap") {
          const r = zoo.ring;
          if (ctx.time.now - tk.ringAt < 3 || hyp(player.x, player.z, r.x, r.z) < 1.3) key = "ringLeap";
        }
        scoreTrick(key);
      }
    } else if (type === "land") {
      if (name === "waterLeap") { fx.splash(player.x, 0, player.z, 0.7); audio.splash(0.6); }
      else { audio.trickLand(true); fx.dust(player.x, player.y + 0.03, player.z, 0.5); }
    } else if (type === "bite") {
      if (step === "feed" && name === "eat") {
        audio.eat();
        if (q.first) { q.first = false; props.bowl.bite(); }
        else { v1.set(bowlCol.x, ctx.floorAt(bowlCol.x, bowlCol.z) + 0.1, bowlCol.z); fx.crumbs(v1); }
      }
    } else if (type === "done") {
      if (platypus.tricks && platypus.tricks[name]) { tk.lastEnd = ctx.time.now; if (tk.pendName === name) { tk.pendKey = null; tk.pendName = null; } }
    }
  }

  // money counts when it is picked up
  function onCoin(v, x, y, z) {
    coinsGot += v;
    if (ui.coins !== undefined) ui.addCoins(v);
    floatAt("+" + v, x, y + 0.3, z, "coin");
    audio.coin();
    let best = null, bd = 2.25;
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      if (!d.on) continue;
      const dd = (d.x - x) * (d.x - x) + (d.z - z) * (d.z - z);
      if (dd < bd) { bd = dd; best = d; }
    }
    if (best) best.on = false;
    if (step === "show" && !q.over) {
      ui.setObjective(showText(), "do tricks near the glass");
      if (coinsGot >= GOAL) showDone();
    }
  }

  // ------------------------------------------------------------------ 12. the poster
  function startPoster() {
    go("poster");
    stopBalance("quiet");
    tk.on = false;
    refreshTricks();
    player.enabled = false;
    player.stop();
    ui.setObjective(null); ui.setQuests(null); ui.setFriendship(null); ui.setCoins(null); ui.setAction(null);
    ui.showHud(false);
    zoo.setTime("evening", 6);
    crowd.react("cheer", 1);
    zoo.poster.setText("PLATYPUS TRICKS", "IN 2 DAYS");
    const P = zoo.P, R = P.showRock, SF = P.showFriend, PO = P.poster;
    const portrait = ctx.camera.aspect < 1;
    player.walkTo(R.x, R.z, { speed: 0.75, face: 0 });
    friend.do("sit", { at: SF, lookAt: PO });
    // closing time: the visitors drift out, so nobody stands between the camera and the posters
    later(1.4, () => { crowd.disperse(); crowd.stroll(0); });
    playCine([
      { shot: { pos: [0.6, 1.7, 3.4], look: [3.6, 0.5, 7.2], fov: 44, to: { pos: [1.2, 1.3, 4.2] }, dur: 4 }, hold: false },
      { caption: "What a day.", dur: 2.2, narr: true },
      { until: () => !player.walking, max: 3 },
      () => {
        if (hyp(player.x, player.z, R.x, R.z) > 0.4) { player.stop(); player.teleport(R.x, R.z, 0); }
        if (friend.distTo(SF.x, SF.z) > 0.5) { friend.do("idle"); friend.place(SF.x, SF.z, 0); friend.do("sit", { lookAt: PO }); }
        platypus.pose("sit", 0.6);
        platypus.lookAt(v2.set(PO.x, PO.y, PO.z));
      },
      // over the shoulders of the two friends, looking out through the glass
      { shot: { pos: [3.8, 1.2, 3.8], look: [4.3, 1.1, 10], fov: 50, to: { pos: [3.85, 1.15, 4.6] }, dur: 3.2 } },
      // ...through it, to the poster
      { shot: { to: { pos: [P.posterClose.x, P.posterClose.y, P.posterClose.z], look: [PO.x, PO.y, PO.z], fov: fovFor(2.15, PO.z - P.posterClose.z, 40) }, dur: 5 } },
      { wait: 3 },
      // and back a little: there is a second, smaller poster
      { shot: { to: { pos: [portrait ? 5.33 : P.posterCam.x, P.posterCam.y, P.posterCam.z], look: [portrait ? 5.33 : (PO.x + P.riddle.x) / 2, 2.12, PO.z], fov: fovFor(2.9, PO.z - P.posterCam.z, 38) }, dur: 3.2 } },
    ], { skippable: false, release: null }, posterReady);
  }
  // a vertical fov that fits `width` metres at `dist` across the screen (matters on a phone held upright)
  function fovFor(width, dist, landscapeFov) {
    const need = 2 * Math.atan(width / 2 / dist / ctx.camera.aspect) * 180 / PI;
    return clamp(need, landscapeFov, 95);
  }
  function posterReady() {
    if (step !== "poster") return;
    q.phase = "ready";
    q.pick = ctx.pick.add(zoo.riddle.object, { onClick: clickRiddle, maxDist: 40 });
    // a toast, not a caption: the caption line sits exactly where the Continue prompt appears
    // (on touch the prompt is at the side and the toast would cover it, so there it is the caption)
    later(0.8, () => {
      if (q.phase !== "ready") return;
      if (ctx.touch) cinema.caption("Psst… tap the little poster!", 6, { narr: true });
      else { ui.showHud(true); ui.hint("Psst… click the little poster!", 6); }
    });
    later(2.5, () => {
      if (q.phase !== "ready") return;
      ui.showHud(true);
      prompt("Continue", finish);
    });
  }
  function clickRiddle() {
    if (step !== "poster" || q.phase !== "ready") return;
    q.phase = "falling";
    riddleFallen = true;
    prompt(null, null);
    ui.showHud(false);
    cinema.caption(null);
    ui.hint("", 0.01);
    if (q.pick) q.pick.enabled = false;
    const d = zoo.riddle.fall();
    const A = zoo.P.answer, portrait = ctx.camera.aspect < 1;
    later((d > 0 ? d : 2.6) + 0.25, () => {
      cinema.shot({ to: { pos: [A.x - 0.04, A.y + 0.03, 13.25], look: [A.x, A.y, A.z], fov: portrait ? 40 : 26 }, dur: 2, ease: "inOut" });
      later(2 + 3, finish);
    });
  }
  function finish() {
    if (step === "done" || step === "boot") return;
    go("done");
    ui.showHud(false);
    cinema.caption(null);
    const v = visit;
    cinema.fade("black", 1, () => { if (v === visit) ctx.complete(); });
  }

  // ------------------------------------------------------------------ friend events
  function onFriend(type, data) {
    switch (type) {
      case "nudged": fl.nudged = true; break;
      case "done": fl.circled = true; break;
      case "splash": fl.splashes++; break;
      case "hidden": fl.hidden = true; break;
      case "trickDone": fl.trickDone = data || "trick"; break;
      case "arrived":
        fl.arrived = true;
        if (step === "race") { if (q.phase === "come") raceLead(); else if (q.phase === "lead") raceFinish(); }
        else if (step === "feed") q.pipAt = true;
        break;
      case "checkpoint": if (step === "race") raceCheckpoint(data | 0); break;
      case "found": if (step === "hide") hideNext(); break;
      case "pass": if (step === "ball") ballPass(false); break;
      case "returned":
        if (step === "ball" && !q.over) { q.fetching = false; q.rest = 0; friend.do("playBall", { ball: props.ball }); }
        break;
      case "nuzzled": if (step === "friends") friendsNuzzle(); break;
      case "ate": pipAte(); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ per frame
  function update(dt, time) {
    if (step === "boot") return;
    friend.update(dt, time);
    crowd.update(dt, time);
    props.update(dt, time);

    fallT -= dt;
    if (fallT <= 0) {
      fallT = 0.25;
      audio.waterfall(clamp(1.12 - hyp(player.x, player.z, zoo.fall.x, zoo.fall.z) / 15, 0.05, 1));
    }
    if (keeper.visible) { keeperCol.x = keeper.x; keeperCol.z = keeper.z; }
    else keeperCol.on = false;

    switch (step) {
      case "race": updateRace(dt); break;
      case "hide": updateHide(dt); break;
      case "dive": updateDive(dt); break;
      case "ball": updateBall(dt); break;
      case "feed": updateFeed(dt); break;
      case "school": updateSchool(dt); break;
      case "show": updateShow(dt); break;
      case "poster":
        // a twinkle on the little poster while it can be clicked
        if (q.phase === "ready") {
          q.markT -= dt;
          if (q.markT <= 0) { q.markT = 1.1; const r = zoo.P.riddle; v1.set(r.x + (Math.random() - 0.5) * 0.4, r.y + (Math.random() - 0.5) * 0.4, r.z - 0.06); fx.sparkle(v1, 0xfff2a8, 5); }
        }
        break;
      default: break;
    }
    updateTricks(dt);

    if (mk.on) {
      mk.t -= dt;
      if (mk.t <= 0) { mk.t = 0.85; fx.ring(mk.x, mk.z, mk.color, mk.y); }
    }
  }

  // ------------------------------------------------------------------ input and engine hooks
  function onAction(name) {
    if (step === "boot" || step === "done") return false;
    if (name === "interact") { if (act) act(); return false; }
    if (name.length === 6 && name.charCodeAt(0) === 116 && name.charCodeAt(1) === 114) { tryTrick(name.charCodeAt(5) - 49); return false; }
    return false;
  }
  function onSwim(on) {
    if (on && step === "dive" && !q.over) diveSwam();
    if (on && bal.on) stopBalance("stop");
  }
  function onDive(under, depth) {
    if (!tk.on) return;
    if (under) {
      // the people follow you along the glass, so a leap is seen
      if (player.z > 3 && tk.crowdN > 0) crowd.gather(player.x, tk.crowdN);
      return;
    }
    if (depth >= 0.8 && player.speed > 1.0 && !platypus.acting && !bal.on && player.enabled) {
      const d = platypus.trick("waterLeap");
      if (!(d > 0)) return;
      player.lock = d;
      beginTrick("waterLeap", "waterLeap");
      audio.trickWhoosh(2);
      fx.splash(player.x, 0, player.z, 0.8);
      audio.splash(0.7);
    }
  }

  // ------------------------------------------------------------------ test seam
  // stop whatever is running (cutscene, title card, eye, timers) and leave a neutral, playable state
  function abortAll() {
    gen++;
    cineCur = 0;
    cinema.reset();
    ctx.clearTimers();
    ctx.pick.clear();
    stopBalance("quiet");
    player.hidden = false; player.scripted = false; player.lock = 0; player.face = null; player.maxSpeed = 3; player.canJump = true;
    player.stop();
    resetModel();
    ui.clearSpeech();
    ui.setObjective(null); ui.setQuests(null); ui.setTricks(null); ui.setCombo(0); ui.setAction(null);
    act = null;
    clearMark();
    keeper.reset();
    keeperCol.on = bowlCol.on = false;
    if (zoo.door.isOpen) zoo.door.reset();
    zoo.riddle.reset();
    riddleFallen = false;
    friend.reset();
    crowd.disperse();
    crowd.stroll(4);
    props.reset();
    resetTricks();
    ctx.setTimeScale(1, 0);
  }
  function setupFor(name) {
    const i = IDX[name];
    done.race = i > IDX.race; done.hide = i > IDX.hide; done.dive = i > IDX.dive; done.ball = i > IDX.ball;
    friendship = (done.race ? 0.25 : 0) + (done.hide ? 0.25 : 0) + (done.dive ? 0.25 : 0) + (done.ball ? 0.25 : 0);
    friend.setName(i > IDX.friends ? "Pip" : "");
    zoo.setTime(i >= IDX.feed ? "noon" : "morning", 0);
    if (i < IDX.school) coinsGot = 0;
    if (i >= IDX.poster) coinsGot = Math.max(coinsGot, GOAL);
    if (i >= IDX.show) { tk.unlocked[0] = tk.unlocked[1] = tk.unlocked[2] = true; tk.ballUnlocked = true; }
    // somewhere sensible to stand
    if (i <= IDX.cutscene) return;
    let px, pz, pyaw, fxp, fzp;
    if (i === IDX.race) { placeAfterCutscene(); return; }
    if (i >= IDX.school) {
      const R = zoo.P.showRock, SF = zoo.P.showFriend;
      if (i === IDX.poster) { px = R.x; pz = R.z; pyaw = 0; fxp = SF.x; fzp = SF.z; }
      else { px = 2.4; pz = 5.2; pyaw = 0; fxp = 3.9; fzp = 5.0; }
    } else { px = SPOT.mid.x; pz = SPOT.mid.z; pyaw = -1.2; fxp = 2.9; fzp = 2.0; }
    player.teleport(px, pz, pyaw);
    friend.place(fxp, fzp, Math.atan2(px - fxp, pz - fzp));
  }
  const BEATS = {
    wake: startWake, cutscene: startCutscene, race: startRace, hide: startHide, dive: startDive, ball: startBall,
    friends: startFriends, feed: startFeed, school: startSchool, show: startShow, poster: startPoster,
  };
  function skipTo(name) {
    if (step === "boot" || step === "done") return false;
    if (name === "done") { win(); return true; }
    if (!BEATS[name]) return false;
    abortAll();
    setupFor(name);
    BEATS[name]();
    return true;
  }
  function win() {
    if (step === "boot" || step === "done") return;
    const black = cinema.faded > 0.9;
    abortAll();
    step = "done";
    player.enabled = false;
    ui.showHud(false);
    const v = visit;
    if (black) { cinema.fade("black", 0); ctx.complete(); }
    else cinema.fade("black", 0.6, () => { if (v === visit) ctx.complete(); });
  }
  function state() {
    return {
      step, friendship, coins: coinsGot, goal: GOAL, phase: q.phase,
      race: count.race, raceLen: count.raceLen, found: count.found, fish: count.fish, passes: count.passes, eats: count.eats, lesson: count.lesson,
      combo: tk.combo, watchers: crowd ? crowd.watchers(player.x, 7) : 0, balancing: bal.on,
      friendName: friend ? friend.name : "", friendBehaviour: friend ? friend.behaviour : "", riddleFallen,
      mark: mk.on ? { x: mk.x, y: mk.y, z: mk.z } : null,
    };
  }

  return { build, enter, start, update, exit, onAction, onSwim, onDive, state, skipTo, win, STEPS };
}
