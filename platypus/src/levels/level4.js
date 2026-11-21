// level4.js - LEVEL 4 "THE SHOW" (LEVELS.md C4).
// Backstage tunnel -> entrance -> three rhythm acts (warm-up, water, duet) -> the flaming hoop -> bows ->
// carried home to the habitat at night. The show cannot be failed: every beat ends by itself.
//
// Rhythm: notes are judged on the AUDIO clock (audio.showMusic.time()); if that clock stalls (no audio, a
// suspended context) the level carries on with its own real-time clock so the show always finishes.
import { createStage } from "../stage.js";
import { createZoo } from "../zoo.js";
import { createFriend } from "../friend.js";
import { createCrowd } from "../crowd.js";
import { createProps } from "../props.js";

export const meta = { n: 4, title: "THE SHOW" };

const STEPS = ["backstage", "entrance", "act1", "act2", "act3", "finale", "bows", "home", "done"];
const BPM = 112, BEAT = 60 / BPM, LEAD = 4;
const WIN_PERFECT = 0.11, WIN_GOOD = 0.24, WIN = 0.30;
const WATER_Y = -0.05;

const LAND = [
  { name: "spin", label: "Spin", call: "SPIN" },
  { name: "backflip", label: "Backflip", call: "BACKFLIP" },
  { name: "roll", label: "Roll", call: "ROLL" },
  { name: "twirlLeap", label: "Twirl leap", call: "TWIRL LEAP" },
];
const WATER = [
  { name: "tailSplash", label: "Tail splash", call: "TAIL SPLASH" },
  { name: "waterLeap", label: "Water leap", call: "WATER LEAP" },
  { name: "diveFlip", label: "Dive flip", call: "DIVE FLIP" },
  { name: "waterLeap", label: "Ring leap", call: "RING LEAP" },
];
const TR_LAND = LAND.map((s) => ({ label: s.label }));
const TR_WATER = WATER.map((s) => ({ label: s.label }));
const TR_FINALE = [{ label: "Spin", enabled: false }, { label: "Backflip", enabled: false }, { label: "Roll", enabled: false }, { label: "JUMP!" }];

// charts: [beat, lane] relative to the act's first bar
// act 1: every 2 beats (lanes 1-2, then all four), then runs on every beat. 24 notes.
const CHART1 = [
  [0, 0], [2, 1], [4, 0], [6, 1], [8, 0], [10, 1],
  [12, 2], [14, 0], [16, 3], [18, 1], [20, 2], [22, 3],
  [28, 0], [29, 1], [30, 0], [31, 1],
  [36, 2], [37, 3], [38, 2], [39, 3],
  [44, 0], [45, 2], [46, 1], [47, 3],
];
const LEN1 = 51;
// act 2: 30 notes. Every lane-4 note (ring leap) has two clear beats after it; the performers swap sides in the rest.
const CHART2 = [
  [0, 0], [2, 1], [4, 2], [6, 0], [8, 3], [10, 0], [12, 1], [14, 2], [16, 3], [18, 0], [19, 0], [20, 1], [22, 2], [24, 3], [26, 1], [28, 3],
  [36, 0], [37, 0], [38, 1], [40, 3], [42, 2], [43, 0], [44, 1], [46, 3], [48, 0], [49, 2], [50, 1], [52, 3], [54, 0], [56, 3],
];
const LEN2 = 59.5, SWAP_AT = 30.2, SWAP_END = 35.2;
// act 3: six call-and-response phrases; Pip plays on these beats of one bar, the player echoes them one bar later
const DUET = [
  { at: [0, 1, 2, 3], lanes: [0, 0, 1, 1] },
  { at: [0, 1, 2, 3], lanes: [0, 1, 2, 1] },
  { at: [0, 1, 2, 3], lanes: [2, 3, 2, 0] },
  { at: [0, 1.5, 2, 3], lanes: [0, 1, 1, 2] },
  { at: [0, 1, 2, 3], lanes: [3, 2, 1, 0] },
  { at: [0, 0.5, 2, 3], lanes: [0, 0, 3, 1] },
];
const CHART3 = [];
for (let p = 0; p < DUET.length; p++) for (let i = 0; i < 4; i++) CHART3.push([p * 8 + 4 + DUET[p].at[i], DUET[p].lanes[i], p]);
const LEN3 = DUET.length * 8 + 0.6;
const NOTE_COUNT = CHART1.length + CHART2.length + CHART3.length;
const MAX_SCORE = NOTE_COUNT * 3;

const RING_DUR = 1.0, RING_START = 0.18, RING_MID = 0.6; // the hoop is crossed at the water leap's apex (0.6 s)
const SLOT_IN = 1.3, SLOT_OUT = 3.9, POOL_LINE = 3;
// the finale leap: a straight ballistic line from the tower's edge through the flaming hoop into the pool
const LEAP_FROM = { x: -7.3, z: 1.6 }, LEAP_T = 1.3, LEAP_APEX = 2.0;
const HOOP3 = { x: 0, y: 2.3, z: 3 };
const LEAP_LEN = Math.hypot(HOOP3.x - LEAP_FROM.x, HOOP3.z - LEAP_FROM.z);
const LEAP_DX = (HOOP3.x - LEAP_FROM.x) / LEAP_LEN, LEAP_DZ = (HOOP3.z - LEAP_FROM.z) / LEAP_LEN;
const LEAP_TO = { x: HOOP3.x + LEAP_DX * 3.3, z: HOOP3.z + LEAP_DZ * 3.3 };
const LEAP_TO_PIP = { x: HOOP3.x + LEAP_DX * 2.3, z: HOOP3.z + LEAP_DZ * 2.3 };
const LEAP_YAW = Math.atan2(LEAP_DX, LEAP_DZ);
const LEAP_KH = LEAP_LEN / (LEAP_LEN + 3.3);
const PIP_WAIT = { x: LEAP_FROM.x - LEAP_DX * 0.75, z: LEAP_FROM.z - LEAP_DZ * 0.75 };
const HOME_DROP = { x: 9.75, z: -6.35 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (k) => { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

export function createLevel(ctx) {
  const { THREE, player, platypus, ui, cinema, audio, fx, cam } = ctx;
  let stage = null, zoo = null, friend = null, crowd = null, props = null, audience = null, keeper = null, SP = null, ZP = null;

  let step = "boot", gen = 0, finished = false;
  // score
  let score = 0, combo = 0, bestCombo = 0, hits = 0, perfects = 0, misses = 0, stars = 0;
  let exc = 0.3, excShown = -1, coins = 0, owed = 0, got = 0, bonus = 0;
  const rewardCd = [0, 0, 0];
  let missStreak = 0, easyTip = false;
  // song clock
  let musicOn = false, songT = 0, songLast = -1, songStall = 0, songFallback = false;
  let friendEv = null;
  // backstage
  let markT = 0, idleT = 0, backPhase = 0, backT = 0;
  // act runtime (camT: real seconds until the act's slow camera drift may start)
  let camT = 0;
  const act = { live: false, n: 0, t0: 0, len: 0, notes: [], first: 0, set: LAND, duet: false, wantLane: -1, bar: -99, swapped: false, swapping: false, swapLeg: 0, said: false };
  const phr = { idx: -1, cnt: 0, perf: 0, hit: 0 };
  let pSide = -1, pOut = false, fSide = 1, fOut = false;
  const trP = { on: false, t: 0, x0: 0, x1: 0, spark: false }, trF = { on: false, t: 0, x0: 0, x1: 0, yaw: 0 };
  let duetPX = -1.5;
  // gathering both performers somewhere
  const meet = { on: false, t: 0, max: 0, px: 0, pz: 0, pyaw: 0, qx: 0, qz: 0, qyaw: 0, done: null };
  // finale
  const roll = { on: false, goT: 0, t0: 0, n: 0, ids: [-1, -1, -1, -1], done: false, early: false };
  const lp = { on: false, k: 0, crossed: false, slow2: false, pipGo: false, pipT: 0, pDone: false, fDone: false, endT: 0, rating: 0, after: 0 };
  const bows = { phase: 0, t: 0 };
  const home = { switched: false, carried: false, down: false, pipLeg: 0, pipUp: false, pipT: 0 };

  const tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), scr = { x: 0, y: 0, visible: false };
  const confL = new THREE.Vector3(-9, 1.1, 6), confR = new THREE.Vector3(9, 1.1, 6);
  const dirL = new THREE.Vector3(4, 9, -3.5), dirR = new THREE.Vector3(-4, 9, -3.5);
  const popV = new THREE.Vector3();

  const songBeat = () => songT / BEAT;
  // The shots are composed for 16:9. On a tall (phone portrait) screen keep at least ~60 % of that width in
  // view by opening the vertical fov, so both performers stay in frame.
  function fovA(f) {
    const asp = ctx.camera.aspect || 1.78;
    if (asp >= 1.5) return f;
    const t = Math.tan(f * Math.PI / 360) * 1.778 * 0.62 / asp;
    return Math.min(88, Math.max(f, Math.atan(t) * 360 / Math.PI));
  }

  // =================================================================================== build / enter / exit
  function build() {
    stage = ctx.shared("stage", () => createStage(ctx));
    zoo = ctx.shared("zoo", () => createZoo(ctx));
    friend = ctx.shared("friend", () => createFriend(ctx));
    crowd = ctx.shared("crowd", () => createCrowd(ctx));
    props = ctx.shared("props", () => createProps(ctx));
    audience = crowd.audience;
    keeper = crowd.staff[0];
    SP = stage.P; ZP = zoo.P;
    audience.build(stage.seats);
    if (ctx.debug) ctx.debug.level4 = { stage, zoo, friend, crowd, props, keeper, audience, pending };
  }
  // test hook: the next thing the player has to press -> { act, i, lane, d (seconds until it is due) } or null
  function pending() {
    if (roll.on) return { act: 9, i: 0, lane: 3, d: roll.goT - songT };
    if (!act.live) return null;
    for (let i = act.first; i < act.notes.length; i++) {
      const n = act.notes[i];
      if (!n.judged) return { act: act.n, i, lane: n.lane, d: n.beat * BEAT - songT };
    }
    return null;
  }

  function resetState() {
    score = 0; combo = 0; bestCombo = 0; hits = 0; perfects = 0; misses = 0; stars = 0;
    exc = 0.3; excShown = -1; coins = 0; owed = 0; got = 0; bonus = 0;
    missStreak = 0; easyTip = false;
    finished = false;
    resetTransient();
  }
  // everything a beat may have left running (not the show's totals)
  function resetTransient() {
    friendEv = null;
    rewardCd[0] = rewardCd[1] = rewardCd[2] = 0;
    markT = 0; idleT = 0; backPhase = 0; backT = 0; camT = 0;
    act.live = false; act.notes.length = 0; act.first = 0; act.wantLane = -1; act.bar = -99; act.swapped = false; act.swapping = false; act.swapLeg = 0; act.said = false;
    phr.idx = -1; phr.cnt = 0; phr.perf = 0; phr.hit = 0;
    pSide = -1; pOut = false; fSide = 1; fOut = false;
    trP.on = false; trF.on = false;
    meet.on = false; meet.done = null;
    roll.on = false; roll.done = false; roll.early = false; roll.n = 0;
    lp.on = false; lp.pDone = false; lp.fDone = false; lp.after = 0;
    bows.phase = 0; bows.t = 0;
    home.carried = false; home.down = false; home.pipLeg = 0; home.pipUp = false; home.pipT = 0;
  }

  // make the arena the place we are in (also used when a debug skip jumps back from the habitat)
  function toStage() {
    stage.group.add(friend.group, props.group, audience.group);
    friend.setWorld(stage);
    props.setWorld(stage);
    props.coins.magnet = player;
    if (ctx.world !== stage) ctx.setWorld(stage);
    if (fx.setGround) fx.setGround(stage.heightAt, stage.waterAt);
    fx.spotDust(true, [-11, 0.4, -7, 11, 7, 7]);
    audio.zooAmbience(false);
    home.switched = false;
  }

  function enter() {
    gen++;
    resetState();
    stage.reset();
    friend.reset(); crowd.reset(); props.reset();
    props.clearPushers();
    friend.setName("Pip");
    props.coins.magnet = player;
    props.coins.onCollect = onCollect;
    if (platypus.reset) platypus.reset();
    platypus.onEvent = onPlaty;
    friend.onEvent = (type, data) => { if (friendEv) friendEv(type, data); };
    home.switched = true; // force toStage() to do its work
    toStage();
    stage.setCue("preshow", 0);
    stage.screen.setText("PLATYPUS", "TRICKS");
    musicOn = false; songT = 0; songLast = -1; songStall = 0; songFallback = false;
    step = "backstage";
    stageBackstage();
  }

  function exit() {
    gen++;
    step = "boot"; friendEv = null;
    act.live = false; roll.on = false; lp.on = false; meet.on = false; meet.done = null;
    player.scripted = false; player.hidden = false; player.carrying = false;
    platypus.onEvent = null;
    platypus.sleep(false); platypus.pose(null); platypus.lookAt(null);
    if (platypus.reset) platypus.reset();
    platypus.group.rotation.set(0, player.yaw, 0);
    friend.onEvent = null;
    friend.reset(); crowd.reset(); props.reset();
    props.clearPushers();
    props.coins.magnet = null; props.coins.onCollect = null;
    stage.spots[0].follow(null); stage.spots[1].follow(null);
    stage.reset();
    zoo.reset();
    if (fx.setGround) fx.setGround(null);
    fx.spotDust(false);
    audio.showMusic.stop(0.3);
    audio.preShow(false);
    audio.crowdBed(0);
    audio.zooAmbience(false);
    musicOn = false;
  }

  // Stop whatever is running (cutscene, timers, actors) and leave a neutral arena. Used by skipTo() and win().
  function hardStop() {
    gen++;
    ctx.clearTimers();
    cinema.reset();
    ctx.setTimeScale(1, 0);
    player.stop();
    player.scripted = false; player.hidden = false; player.enabled = false; player.lock = 0; player.face = null;
    player.maxSpeed = 3; player.carrying = false; player.grounded = true; player.vy = 0;
    platypus.sleep(false); platypus.pose(null); platypus.lookAt(null);
    if (platypus.reset) platypus.reset();
    platypus.group.rotation.set(0, player.yaw, 0);
    friend.reset();
    keeper.reset();
    props.coins.clear();
    owed = got;
    ui.beat.clear(); ui.beat.show(false);
    ui.setAction(null); ui.setObjective(null); ui.setTricks(null); ui.setCombo(0);
    stage.spots[0].follow(null); stage.spots[1].follow(null);
    stage.setHoopFlame(false);
    resetTransient();
  }

  // =================================================================================== small services
  function startMusic() {
    if (musicOn) return;
    audio.showMusic.start(BPM);
    audio.showMusic.setIntensity(exc);
    musicOn = true; songT = 0; songLast = -1; songStall = 0; songFallback = false;
  }
  function tickSong(raw) {
    if (!musicOn) return;
    if (!songFallback) {
      const mt = audio.showMusic.time();
      if (mt > songLast + 1e-4) { songLast = mt; songT = mt; songStall = 0; }
      else { songStall += raw; if (songStall > 0.6) songFallback = true; }
    }
    if (songFallback) songT += raw;
    stage.setBeat(songFallback ? null : songT / BEAT);
  }

  function station(x, z, yaw) { friend.do("goto", { x, z, yaw, run: true }); }
  function putBoth(px, pz, pyaw, qx, qz, qyaw) {
    player.stop();
    player.scripted = false;
    player.teleport(px, pz, pyaw);
    friend.place(qx, qz, qyaw);
    station(qx, qz, qyaw);
  }
  // walk both performers to their spots; `done` always fires (they are snapped there after `max` seconds)
  function meetAt(px, pz, pyaw, qx, qz, qyaw, max, speed, done) {
    meet.on = true; meet.t = 0; meet.max = max;
    meet.px = px; meet.pz = pz; meet.pyaw = pyaw; meet.qx = qx; meet.qz = qz; meet.qyaw = qyaw;
    meet.done = done || null;
    player.lock = 0; player.face = null;
    player.walkTo(px, pz, { speed, face: pyaw });
    station(qx, qz, qyaw);
  }
  function tickMeet(raw) {
    if (!meet.on) return;
    meet.t += raw;
    const pd = Math.hypot(player.x - meet.px, player.z - meet.pz), qd = friend.distTo(meet.qx, meet.qz);
    const pOk = !player.walking && pd < 0.3;
    if ((pOk && qd < 0.45) || meet.t > meet.max) {
      meet.on = false;
      if (!pOk) { player.stop(); player.teleport(meet.px, meet.pz, meet.pyaw); }
      if (qd >= 0.45) { friend.place(meet.qx, meet.qz, meet.qyaw); station(meet.qx, meet.qz, meet.qyaw); }
      const f = meet.done;
      meet.done = null;
      if (f) f();
    }
  }

  function hud() {
    ui.showHud(true);
    ui.setQuests(null);
    ui.setCoins(coins);
    ui.setExcitement(exc, "Crowd");
    excShown = -1;
  }
  function pushExc(force) {
    if (!force && Math.abs(exc - excShown) < 0.012) return;
    excShown = exc;
    ui.setExcitement(exc, "Crowd");
    audio.showMusic.setIntensity(exc);
    audience.setExcitement(0.3 + 0.7 * exc);
    stage.setEnergy(exc);
    audio.crowdBed(0.3 + 0.6 * exc);
  }
  function confettiCannons(n) {
    fx.confetti(confL, dirL, n, 0);
    fx.confetti(confR, dirR, n, 0);
  }
  function reward(i) {
    const n = i === 0 ? 12 : i === 1 ? 20 : 30;
    props.coins.rain(player.x, player.z, 3, n, 1);
    owed += n;
    audience.wave();
    confettiCannons(i === 2 ? 90 : 60);
    audio.crowd(i === 2 ? "roar" : "cheer", 0.7 + i * 0.15, false);
    audio.payout(4 + i * 2);
    ui.hint(i === 0 ? "The crowd loves it!" : i === 1 ? "They are going wild!" : "A standing ovation!", 2.2);
  }
  function addExc(d) {
    const prev = exc;
    exc = clamp(exc + d, 0, 1);
    if (d > 0) {
      for (let i = 0; i < 3; i++) {
        const th = i === 0 ? 0.5 : i === 1 ? 0.75 : 1;
        if (prev < th && exc >= th && rewardCd[i] <= 0) { rewardCd[i] = 12; reward(i); }
      }
    }
  }
  function onCollect(v, x, y, z) {
    got += v;
    coins = ui.addCoins(v);
    audio.coin();
    tmpV.set(x, y, z);
    ctx.project(tmpV, scr, 0.3);
    if (scr.visible) ui.floatText("+" + v, scr.x, scr.y, "coin");
  }
  function onPlaty(type, name) {
    if (step === "boot" || step === "home" || step === "done") return;
    if (type === "land") {
      if (player.swimming) {
        fx.splash(player.x, WATER_Y, player.z, 0.7);
        audio.splash(0.6);
        stage.splashAt(player.x, player.z, 1);
      } else {
        audio.trickLand(true);
        fx.dust(player.x, player.y, player.z, 0.4);
      }
    } else if (type === "apex" && player.swimming) {
      if (name === "tailSplash") {
        fx.splash(player.x - Math.sin(player.yaw) * 0.4, WATER_Y, player.z - Math.cos(player.yaw) * 0.4, 0.6);
        audio.splash(0.45);
        stage.splashAt(player.x, player.z, 0.8);
      } else if (name === "diveFlip") fx.bubbles(player.x, WATER_Y - 0.3, player.z, 8, WATER_Y);
    }
  }

  // =================================================================================== 1. BACKSTAGE
  function stageBackstage() {
    step = "backstage";
    stage.setCue("preshow", 0);
    stage.setHoopFlame(false);
    audio.preShow(true);
    audio.crowdBed(0.25);
    audience.setExcitement(0.15);
    stage.setEnergy(0.1);
    const s = SP.tunnelStart;
    player.teleport(s.x, s.z, 0);
    friend.place(s.x + 0.85, s.z + 0.5, -2.2);
    friend.do("idle");
    cam.yaw = 0; cam.pitch = 0.3; cam.wantDist = 3.2;
  }
  function beginBackstage() {
    const g = gen;
    step = "backstage";
    backPhase = 0; backT = 0; idleT = 0; markT = 0;
    cinema.fade("clear", 1.4);
    hud();
    ui.setExcitement(null);
    ui.setCoins(null);
    ui.setObjective("Walk into the light", ctx.touch ? "use the stick" : "W A S D");
    player.enabled = true;
    cinema.caption("Tonight is the night. The big show!", 3.2, { narr: true });
    friendEv = (type) => {
      if (g !== gen || step !== "backstage") return;
      if (type === "nuzzled" && backPhase === 0) {
        backPhase = 1; backT = 0;
        if (player.speed < 0.3 && player.grounded) platypus.nuzzle();
        tmpV.set((player.x + friend.x) * 0.5, player.y + 0.45, (player.z + friend.z) * 0.5);
        fx.hearts(tmpV, 3);
      }
    };
    friend.do("nuzzle");
  }
  function tickBackstage(raw) {
    backT += raw;
    // Pip: nuzzle -> beckon -> trot ahead to the tunnel mouth and wait there
    if (backPhase === 0 && backT > 6) { backPhase = 1; backT = 0; }
    else if (backPhase === 1 && backT > 1.5) { backPhase = 2; backT = 0; friend.do("idle"); friend.emote("call"); }
    else if (backPhase === 2 && backT > 1.3) { backPhase = 3; backT = 0; friend.do("goto", { x: 0.8, z: SP.tunnelMouth.z - 0.6, yaw: Math.PI, run: true }); }
    else if (backPhase === 3 && backT > 6) { backT = 0; if (player.z < -9.5) friend.emote("call"); }
    markT -= raw;
    if (markT <= 0) { markT = 0.85; fx.ring(SP.tunnelMouth.x, SP.tunnelMouth.z, 0xfff2a8, 0.06); }
    if (player.moving) idleT = 0; else idleT += raw;
    if (idleT > 10) { idleT = 0; ui.hint(ctx.touch ? "Push the stick forward to walk" : "Walk forward: W or the up arrow", 3); }
    if (player.z > SP.tunnelMouth.z - 0.7) beginEntrance();
  }

  // =================================================================================== 2. ENTRANCE
  function entranceLights() {
    stage.setCue("entrance", 1.5);
    stage.screen.setText("PLATYPUS", "TRICKS");
    stage.spots[0].follow(platypus.group);
    stage.spots[1].follow(friend.group);
    audio.preShow(false);
    audio.crowdBed(0.6);
    audience.setExcitement(0.7);
    stage.setEnergy(0.5);
  }
  function beginEntrance() {
    const g = gen;
    step = "entrance";
    friendEv = null;
    player.enabled = false;
    ui.setObjective(null);
    const c = SP.centre, f = SP.friendMark, cr = SP.camCrane, cw = SP.camWide;
    cinema.play([
      () => {
        entranceLights();
        audio.crowd("roar", 1, false);
        audience.wave();
        meetAt(c.x, c.z, 0, f.x, f.z, 0, 9, 0.55, null);
      },
      { shot: { pos: cr.pos, look: [0, 0.6, -3.5], fov: fovA(46), to: { pos: [cw.pos.x, cw.pos.y - 1.5, cw.pos.z - 3], look: [0, 0.8, -2] }, dur: 7.5, ease: "inOut" }, hold: false },
      { caption: "Ladies and gentlemen... PLATYPUS TRICKS!", dur: 3.6, who: "Announcer" },
      { until: () => !meet.on, max: 9 },
      { shot: { pos: [0.8, 1.0, 1.6], look: [0.8, 0.3, -2.5], fov: fovA(38), to: { pos: [0.8, 1.2, 2.6] }, dur: 5, ease: "out", hand: 0.3 }, hold: false },
      { wait: 0.4 },
      () => {
        platypus.trick("bow"); friend.trick("bow");
        audio.crowd("cheer", 0.9, false);
        audience.flashes(0.8);
      },
      { wait: 1.6 },
      startMusic,
      { caption: ctx.touch ? "Tap each trick when its number reaches the circle." : "Press the number when it reaches the circle.", dur: 3 },
    ], {
      skippable: true, release: null,
      onSkip() {
        meet.on = false; meet.done = null;
        entranceLights();
        putBoth(c.x, c.z, 0, f.x, f.z, 0);
      },
      onDone() { if (g !== gen) return; beginAct(1, false); },
    });
  }

  // =================================================================================== 3-6. THE ACTS
  function actCamera(n, instant) {
    const d = instant ? 0.01 : n === 1 ? 2.2 : 3;
    if (n === 1) cinema.shot({ to: { pos: [0.8, 1.75, 1.7], look: [0.8, 0.05, -2.5], fov: fovA(40) }, dur: d, ease: "inOut", hand: 0.25 });
    else if (n === 2) cinema.shot({ to: { pos: [5.4, 2.9, 8.6], look: [0, 0.2, 3], fov: fovA(48) }, dur: d, ease: "inOut", hand: 0.25 });
    else cinema.shot({ to: { pos: [-3.2, 1.5, -5.7], look: [0, 0.35, 0.5], fov: fovA(44) }, dur: d, ease: "inOut", hand: 0.25 });
    camT = d + 0.15;
  }
  function actDrift(n) {
    if (n === 1) cinema.shot({ to: { pos: [0.8, 1.5, 1.0], look: [0.8, 0.05, -2.5] }, dur: 30, ease: "linear", hand: 0.25 });
    else if (n === 2) cinema.shot({ to: { pos: [-5.4, 2.9, 8.6], look: [0, 0.2, 3] }, dur: 36, ease: "linear", hand: 0.25 });
    else cinema.shot({ to: { pos: [3.2, 1.5, -5.7], look: [0, 0.35, 0.5] }, dur: 30, ease: "linear", hand: 0.25 });
  }
  function beginAct(n, instant) {
    const g = gen;
    step = "act" + n;
    friendEv = null;
    player.enabled = false;
    act.live = false;
    startMusic();
    hud();
    pushExc(true);
    ui.beat.clear();
    ui.beat.show(true);
    ui.setCombo(combo);
    stage.spots[0].follow(platypus.group);
    stage.spots[1].follow(friend.group);
    stage.setHoopFlame(false);
    const c = SP.centre, f = SP.friendMark;
    const go = () => { if (g === gen) runAct(n); };
    if (n === 1) {
      stage.setCue("show", 1.5);
      stage.screen.setText("ACT 1", "WARM-UP");
      ui.setTricks(TR_LAND);
      if (instant) putBoth(c.x, c.z, 0, f.x, f.z, 0);
      ui.call("ACT 1", "Warm-up");
      actCamera(1, instant);
      go();
    } else if (n === 2) {
      stage.setCue("water", 1.5);
      stage.screen.setText("ACT 2", "WATER");
      ui.setTricks(TR_WATER);
      ui.setObjective("Into the pool!");
      pSide = -1; pOut = false; fSide = 1; fOut = false;
      ui.call("ACT 2", "Water tricks");
      actCamera(2, instant);
      if (instant) { putBoth(-SLOT_IN, POOL_LINE, 0, SLOT_IN, POOL_LINE, 0); go(); }
      else meetAt(-SLOT_IN, POOL_LINE, 0, SLOT_IN, POOL_LINE, 0, 7, 0.85, go);
    } else {
      stage.setCue("duet", 1.5);
      stage.screen.setText("ACT 3", "DUET");
      ui.setTricks(TR_LAND);
      ui.setObjective("Back on stage!");
      duetPX = instant || player.x < 0 ? -1.5 : 1.5;
      ui.call("ACT 3", "Duet: copy Pip");
      actCamera(3, instant);
      const done = () => { if (g !== gen) return; if (platypus.shake && !instant) platypus.shake(); go(); };
      if (instant) { putBoth(duetPX, -1.5, 0, -duetPX, -1.5, 0); go(); }
      else meetAt(duetPX, -1.5, 0, -duetPX, -1.5, 0, 8, 0.85, done);
    }
  }
  function runAct(n) {
    const chart = n === 1 ? CHART1 : n === 2 ? CHART2 : CHART3;
    const duet = n === 3;
    const t0 = Math.ceil((songBeat() + LEAD + 0.5) / 4) * 4;
    act.n = n; act.t0 = t0; act.len = n === 1 ? LEN1 : n === 2 ? LEN2 : LEN3;
    act.set = n === 2 ? WATER : LAND; act.duet = duet;
    act.first = 0; act.wantLane = -1; act.bar = -99; act.swapped = false; act.swapping = false; act.swapLeg = 0; act.said = false;
    act.notes.length = 0;
    for (let i = 0; i < chart.length; i++) {
      const c = chart[i];
      act.notes.push({ beat: t0 + c[0], lane: c[1], pipBeat: t0 + c[0] - (duet ? 4 : 0), id: -1, spawned: false, judged: false, pipDone: false, phrase: duet ? c[2] : -1 });
    }
    phr.idx = -1; phr.cnt = 0; phr.perf = 0; phr.hit = 0;
    trP.on = false; trF.on = false;
    player.lock = 0; player.face = null;
    act.live = true;
    ui.setObjective(duet ? "Watch Pip, then copy the tricks" : "Hit each trick on the beat", ctx.touch ? "tap the tricks" : "1 2 3 4");
    if (camT <= 0) actDrift(n);
  }
  function setWant(lane) {
    if (lane === act.wantLane) return;
    if (act.wantLane >= 0) ui.setTrickState(act.wantLane, { want: false });
    if (lane >= 0) ui.setTrickState(lane, { want: true });
    act.wantLane = lane;
  }
  function endAct() {
    act.live = false;
    setWant(-1);
    ui.beat.clear();
    if (trP.on) endRingP();
    if (trF.on) endRingF();
    const n = act.n;
    audio.crowd("cheer", 0.6 + 0.4 * exc, false);
    friend.emote("happy");
    if (n === 1) beginAct(2, false);
    else if (n === 2) beginAct(3, false);
    else beginFinale(false);
  }

  // ---- ring leaps (act 2, lane 4): the performer crosses its hoop along the pool's centre line
  function ringS(u) {
    if (u <= RING_START) return 0;
    if (u < RING_MID) { const q = (u - RING_START) / (RING_MID - RING_START); return 0.5 * q * q; }
    const q = 1 - (u - RING_MID) / (1 - RING_MID);
    return 1 - 0.5 * q * q;
  }
  function startRingP() {
    if (trP.on) endRingP();
    trP.x0 = pSide * (pOut ? SLOT_OUT : SLOT_IN);
    pOut = !pOut;
    trP.x1 = pSide * (pOut ? SLOT_OUT : SLOT_IN);
    trP.t = 0; trP.spark = false; trP.on = true;
    player.stop();
    player.lock = 0; player.face = null;
    player.yaw = trP.x1 > trP.x0 ? Math.PI / 2 : -Math.PI / 2;
  }
  function endRingP() {
    trP.on = false;
    player.x = trP.x1; player.z = POOL_LINE;
    player.face = 0; player.lock = 0.45;
  }
  function startRingF() {
    if (trF.on) endRingF();
    trF.x0 = fSide * (fOut ? SLOT_OUT : SLOT_IN);
    fOut = !fOut;
    trF.x1 = fSide * (fOut ? SLOT_OUT : SLOT_IN);
    trF.yaw = trF.x1 > trF.x0 ? Math.PI / 2 : -Math.PI / 2;
    trF.t = 0; trF.on = true;
    friend.trick("waterLeap");
  }
  function endRingF() {
    trF.on = false;
    friend.place(trF.x1, POOL_LINE, trF.yaw);
    station(trF.x1, POOL_LINE, 0);
  }
  // call BEFORE friend.update (Pip's place) - dt is the scaled dt, like the trick animation
  function tickRings(dt) {
    if (trP.on) {
      trP.t += dt;
      const u = Math.min(1, trP.t / RING_DUR);
      player.x = trP.x0 + (trP.x1 - trP.x0) * ringS(u);
      player.z = POOL_LINE;
      if (!trP.spark && trP.t >= RING_MID) {
        trP.spark = true;
        const h = stage.hoops[pSide < 0 ? 0 : 1];
        tmpV.set(h.x, h.y, h.z);
        fx.sparkle(tmpV, 0xfff2a8, 10);
      }
      if (u >= 1) endRingP();
    }
    if (trF.on) {
      trF.t += dt;
      const u = Math.min(1, trF.t / RING_DUR);
      if (u >= 1) endRingF();
      else friend.place(trF.x0 + (trF.x1 - trF.x0) * ringS(u), POOL_LINE, trF.yaw);
    }
  }
  // mid-act: the two swap sides so the player uses the other hoop
  function startSwap() {
    act.swapping = true; act.swapLeg = 0;
    if (trP.on) endRingP();
    if (trF.on) endRingF();
    pSide = -pSide; fSide = -fSide; pOut = false; fOut = false;
    const g = gen, px = pSide * SLOT_IN;
    player.lock = 0; player.face = null;
    player.walkTo(0, POOL_LINE + 1.0, { speed: 1, then() { if (g === gen && act.swapping) player.walkTo(px, POOL_LINE, { speed: 1, face: 0 }); } });
    friend.do("goto", { x: 0, z: POOL_LINE - 1.0, run: true });
    ui.call("SWITCH!", "Swap sides");
  }
  function tickSwap(b) {
    const qx = fSide * SLOT_IN;
    if (act.swapLeg === 0 && friend.distTo(0, POOL_LINE - 1.0) < 0.5) { act.swapLeg = 1; station(qx, POOL_LINE, 0); }
    if (b < act.t0 + SWAP_END) return;
    act.swapping = false;
    const px = pSide * SLOT_IN;
    if (player.walking || Math.hypot(player.x - px, player.z - POOL_LINE) > 0.3) {
      player.stop();
      player.x = px; player.z = POOL_LINE; player.yaw = 0;
    }
    if (friend.distTo(qx, POOL_LINE) > 0.4) friend.place(qx, POOL_LINE, 0);
    station(qx, POOL_LINE, 0);
  }

  // ---- performing and judging
  function playerTrick(lane) {
    if (act.n === 2 && lane === 3) startRingP();
    platypus.trick(act.set[lane].name);
  }
  function pipPlay(n) {
    if (act.n === 2 && n.lane === 3) startRingF();
    else friend.trick(act.set[n.lane].name);
    if (act.duet) { ui.flashTrick(n.lane, true); audio.trickWhoosh(n.lane); }
  }
  function phraseNote(n, rate) {
    if (n.phrase < 0) return;
    if (n.phrase !== phr.idx) { phr.idx = n.phrase; phr.cnt = 0; phr.perf = 0; phr.hit = 0; }
    phr.cnt++;
    if (rate > 0) phr.hit++;
    if (rate === 2) phr.perf++;
    if (phr.cnt < 4) return;
    if (phr.perf === 4) {
      audience.flashes(1);
      audio.crowd("cheer", 0.8, false);
      ui.call("PERFECT ECHO!", "", "perfect");
      addExc(0.03);
      friend.emote("happy");
    } else if (phr.hit === 4) friend.emote("chirp");
  }
  function judgeHit(n, rate) {
    n.judged = true;
    missStreak = 0;
    combo++; hits++;
    if (rate === 2) perfects++;
    if (combo > bestCombo) bestCombo = combo;
    const mult = combo >= 16 ? 3 : combo >= 8 ? 2 : 1;
    score += (rate === 2 ? 3 : 1) * mult;
    if (n.id >= 0) ui.beat.resolve(n.id, true);
    ui.flashTrick(n.lane, true);
    ui.setCombo(combo);
    if (rate === 2) ui.call(act.set[n.lane].call + "!", "PERFECT", "perfect");
    audio.showMusic.sting(rate === 2 ? "perfect" : "good");
    audio.trickWhoosh(n.lane);
    if (combo === 8 || combo === 16) {
      audio.comboUp(combo / 8);
      ui.hint(combo === 8 ? "Combo! Double points" : "Super combo! Triple points", 1.8);
    }
    addExc(rate === 2 ? 0.035 : 0.015);
    playerTrick(n.lane);
    phraseNote(n, rate);
  }
  function judgeMiss(n) {
    n.judged = true;
    combo = 0; misses++;
    // struggling? point out the easy key once (it hits whatever note is due, GOOD at best)
    if (++missStreak >= 4 && !easyTip) { easyTip = true; ui.hint(ctx.touch ? "Tip: the Jump button hits any trick" : "Tip: Space hits any trick", 4); }
    if (n.id >= 0) ui.beat.resolve(n.id, false);
    ui.setCombo(0);
    audio.showMusic.sting("miss");
    addExc(-0.03);
    phraseNote(n, 0);
  }
  // lane 0..3 = that trick key; -1 = the easy key (Space / jump button / click): any lane, GOOD at best
  function press(lane) {
    if (roll.on) { rollPress(lane); return; }
    if (!act.live) return;
    // input arrives between frames: read the audio clock now, not last frame's copy
    if (musicOn && !songFallback) { const mt = audio.showMusic.time(); if (mt > songT) songT = mt; }
    const notes = act.notes;
    let hit = null, hitD = 0, other = null, otherD = 0;
    for (let i = act.first; i < notes.length; i++) {
      const n = notes[i];
      if (n.judged) continue;
      const d = n.beat * BEAT - songT;
      if (d > WIN) break;
      if (d < -WIN) continue;
      if (lane < 0 || n.lane === lane) { hit = n; hitD = Math.abs(d); break; }
      if (!other) { other = n; otherD = Math.abs(d); }
    }
    if (hit) {
      if (lane < 0) judgeHit(hit, 1);
      else if (hitD <= WIN_PERFECT) judgeHit(hit, 2);
      else if (hitD <= WIN_GOOD) judgeHit(hit, 1);
      else { ui.flashTrick(lane, false); judgeMiss(hit); }
    } else if (other && otherD <= WIN_GOOD) {
      ui.flashTrick(lane, false);
      judgeMiss(other);
    }
    // a stray press with no note near costs nothing
  }
  function tickAct() {
    const b = songBeat(), notes = act.notes;
    let next = -1;
    for (let i = act.first; i < notes.length; i++) {
      const n = notes[i];
      if (!n.pipDone && b >= n.pipBeat) { n.pipDone = true; pipPlay(n); }
      if (n.judged) { if (i === act.first && n.pipDone) act.first++; continue; }
      const ahead = n.beat - b;
      if (!n.spawned && ahead <= LEAD) { n.spawned = true; if (ahead > 0.4) n.id = ui.beat.spawn(n.lane, ahead * BEAT); }
      if (-ahead * BEAT > WIN) { judgeMiss(n); continue; }
      if (next < 0 && n.pipDone && ahead < 1.3) next = n.lane;
      if (ahead > LEAD + 4.5) break;
    }
    setWant(next);
    if (act.n === 2) {
      if (!act.swapped && b >= act.t0 + SWAP_AT) { act.swapped = true; startSwap(); }
      if (act.swapping) tickSwap(b);
    } else if (act.duet) {
      const bar = Math.floor((b - act.t0) / 4);
      if (bar !== act.bar && bar >= 0 && bar < DUET.length * 2) {
        act.bar = bar;
        if (bar % 2 === 0) { ui.setObjective("Watch Pip..."); friend.lookAt(null); }
        else { ui.setObjective("Your turn! Copy Pip", ctx.touch ? "tap the tricks" : "1 2 3 4"); friend.lookAt(platypus.group); }
      }
    }
    if (b >= act.t0 + act.len) endAct();
  }

  // =================================================================================== 7. FINALE
  function finaleLights() {
    stage.setCue("finale", 1.5);
    stage.setHoopFlame(true);
    stage.screen.setText("FINALE", "THE FLAMING HOOP");
    stage.spots[0].follow(platypus.group);
    stage.spots[1].follow(friend.group);
  }
  function towerPut() {
    putBoth(LEAP_FROM.x, LEAP_FROM.z, LEAP_YAW, PIP_WAIT.x, PIP_WAIT.z, LEAP_YAW);
  }
  function beginFinale(instant) {
    const g = gen;
    step = "finale";
    friendEv = null;
    act.live = false;
    player.enabled = false;
    startMusic();
    hud();
    pushExc(true);
    ui.beat.clear();
    ui.beat.show(false);
    ui.setTricks(null);
    ui.setObjective(null);
    if (instant) {
      finaleLights();
      towerPut();
      beginRoll();
      return;
    }
    const rf = SP.rampFoot;
    cinema.play([
      () => {
        finaleLights();
        audio.crowd("ooh", 0.9, false);
        meetAt(rf.x + 0.1, rf.z - 0.25, 0, rf.x - 0.5, rf.z - 0.9, 0, 9, 0.9, () => {
          if (g !== gen) return;
          meetAt(LEAP_FROM.x, LEAP_FROM.z, LEAP_YAW, PIP_WAIT.x, PIP_WAIT.z, LEAP_YAW, 6, 0.6, null);
        });
      },
      { shot: { to: { pos: [-4.4, 2.5, 3.4], look: [-7.7, 1.0, -1.0], fov: fovA(46) }, dur: 3.0, ease: "inOut", hand: 0.3 }, hold: false },
      { caption: "And now... THE FLAMING HOOP!", dur: 3.4, who: "Announcer" },
      { until: () => !meet.on && Math.abs(player.x - LEAP_FROM.x) < 0.4 && Math.abs(player.z - LEAP_FROM.z) < 0.4, max: 13 },
      { shot: { pos: [SP.camHero.pos.x - 1.5, SP.camHero.pos.y, SP.camHero.pos.z], look: [HOOP3.x, HOOP3.y, HOOP3.z], fov: fovA(34), to: { pos: [-1.2, 1.5, 8.4], look: [-5, 1.9, 2.2], fov: fovA(46) }, dur: 3.2, ease: "inOut" } },
    ], {
      skippable: true, release: null,
      onSkip() {
        meet.on = false; meet.done = null;
        finaleLights();
        towerPut();
      },
      onDone() {
        if (g !== gen) return;
        if (Math.hypot(player.x - LEAP_FROM.x, player.z - LEAP_FROM.z) > 0.4) { meet.on = false; meet.done = null; towerPut(); }
        beginRoll();
      },
    });
  }
  function beginRoll() {
    player.stop();
    player.lock = 0; player.face = null; player.yaw = LEAP_YAW;
    hud();
    ui.setTricks(TR_FINALE);
    ui.beat.clear();
    ui.beat.show(true);
    ui.setTrickState(3, { want: true });
    ui.setObjective("JUMP on the fourth beat!", ctx.touch ? "tap JUMP!" : "4 or Space");
    ui.call("3 - 2 - 1 - JUMP!", "Wait for the last beat");
    cinema.shot({ to: { pos: [-3.0, 2.2, 8.7], look: [-3.5, 1.75, 2.3], fov: fovA(52) }, dur: 2, ease: "inOut", hand: 0.2 });
    const t0 = Math.ceil((songBeat() + LEAD + 1.5) / 4) * 4;
    roll.t0 = t0; roll.goT = (t0 + 3) * BEAT; roll.n = 0; roll.done = false; roll.early = false;
    for (let i = 0; i < 4; i++) roll.ids[i] = -1;
    roll.on = true;
    audio.crowd("ooh", 0.8, false);
  }
  function tickRoll() {
    const b = songBeat();
    // the four notes (lane 4), spawned a bar ahead; the first three are the drum roll
    for (let i = 0; i < 4; i++) {
      if (roll.ids[i] === -1 && roll.t0 + i - b <= LEAD) {
        const ahead = roll.t0 + i - b;
        roll.ids[i] = ahead > 0.4 ? ui.beat.spawn(3, ahead * BEAT, i === 3 ? "GO" : String(3 - i)) : -2;
      }
    }
    while (roll.n < 3 && b >= roll.t0 + roll.n) {
      if (roll.ids[roll.n] >= 0) ui.beat.resolve(roll.ids[roll.n], true);
      audio.showMusic.sting("good");
      audio.trickWhoosh(roll.n);
      ui.call(String(3 - roll.n), "", "good");
      audience.setExcitement(0.75 + 0.08 * roll.n);
      roll.n++;
    }
    if (songT - roll.goT > WIN) launch(0);
  }
  function rollPress(lane) {
    if (roll.done || (lane >= 0 && lane !== 3)) return;
    if (musicOn && !songFallback) { const mt = audio.showMusic.time(); if (mt > songT) songT = mt; }
    const d = songT - roll.goT, a = Math.abs(d);
    if (a <= WIN) launch(a <= WIN_PERFECT ? 2 : a <= WIN_GOOD ? 1 : 0);
    else if (d < 0) {
      ui.flashTrick(3, false);
      if (!roll.early) { roll.early = true; ui.hint("Not yet! Wait for GO", 1.6); }
    }
  }
  // whatever the timing, the leap happens; the timing only sets the bonus
  function launch(rating) {
    if (roll.done) return;
    roll.done = true; roll.on = false;
    if (roll.ids[3] >= 0) ui.beat.resolve(roll.ids[3], true);
    ui.setTrickState(3, { want: false });
    ui.flashTrick(3, true);
    ui.setObjective(null);
    ui.beat.show(false);
    ui.setTricks(null);
    ui.setCombo(0);
    bonus = rating === 2 ? 30 : rating === 1 ? 15 : 5;
    lp.rating = rating;
    lp.on = true; lp.k = 0; lp.crossed = false; lp.slow2 = false; lp.pipGo = false; lp.pipT = 0; lp.pDone = false; lp.fDone = false; lp.endT = 0; lp.after = 0;
    player.stop();
    player.scripted = true;
    player.grounded = false; player.swimming = false; player.diving = false;
    player.x = LEAP_FROM.x; player.z = LEAP_FROM.z; player.yaw = LEAP_YAW;
    platypus.jump();
    audio.jump();
    audio.trickWhoosh(3);
    audio.showMusic.sting(rating === 2 ? "perfect" : "good");
    audio.crowd("gasp", 0.8, false);
    ctx.setTimeScale(0.25, 0.2);
    cinema.shot({ to: { pos: [SP.camHero.pos.x + 0.6, SP.camHero.pos.y + 0.2, SP.camHero.pos.z + 0.3], look: platypus.group, fov: fovA(46) }, look: platypus.group, lookY: 0.15, dur: 0.6, ease: "out" });
    friendEv = (type) => {
      if (type !== "landed" || lp.fDone) return;
      lp.fDone = true;
      fx.splash(friend.x, WATER_Y, friend.z, 0.9);
      audio.splash(0.8);
      stage.splashAt(friend.x, friend.z, 1.3);
      friend.do("idle");
    };
  }
  function tickLeap(dt, raw) {
    if (!lp.pDone) {
      lp.k = Math.min(1, lp.k + dt / LEAP_T);
      const k = lp.k, y0 = 1.6, y1 = WATER_Y - 0.1;
      const x = LEAP_FROM.x + (LEAP_TO.x - LEAP_FROM.x) * k, z = LEAP_FROM.z + (LEAP_TO.z - LEAP_FROM.z) * k;
      const y = y0 + (y1 - y0) * k + LEAP_APEX * 4 * k * (1 - k);
      const vy = ((y1 - y0) + LEAP_APEX * 4 * (1 - 2 * k)) / LEAP_T, vh = (LEAP_LEN + 3.3) / LEAP_T;
      player.x = x; player.y = y; player.z = z; player.yaw = LEAP_YAW;
      player.vy = vy; player.speed = vh; player.grounded = false;
      platypus.group.position.set(x, y, z);
      platypus.group.rotation.set(clamp(-Math.atan2(vy, vh) * 0.8, -0.9, 0.9), LEAP_YAW, Math.PI * 2 * smooth((k - 0.3) / 0.55));
      if (!lp.crossed && k >= LEAP_KH) {
        lp.crossed = true;
        tmpV.set(HOOP3.x, HOOP3.y, HOOP3.z);
        fx.sparkle(tmpV, 0xffb040, 24);
        confettiCannons(100);
        audio.crowd("roar", 1, false);
        audience.setExcitement(1);
        audience.flashes(1);
        audience.wave();
        cinema.shake(0.02, 0.4);
        ui.call(lp.rating === 2 ? "PERFECT!" : lp.rating === 1 ? "GREAT JUMP!" : "THROUGH THE HOOP!", "+" + bonus + " coins", lp.rating === 2 ? "perfect" : "good");
        exc = Math.max(exc, 0.9);
        pushExc(true);
      }
      if (!lp.slow2 && k >= 0.8) { lp.slow2 = true; ctx.setTimeScale(0.5, 0.3); }
      if (k >= 1) {
        lp.pDone = true;
        player.scripted = false;
        player.x = LEAP_TO.x; player.z = LEAP_TO.z; player.y = y1; player.yaw = LEAP_YAW;
        player.vy = 0; player.speed = 0; player.grounded = true; player.pitch = 0; player.roll = 0;
        platypus.land(0.7);
        if (platypus.setWet) platypus.setWet(1);
        fx.splash(LEAP_TO.x, WATER_Y, LEAP_TO.z, 1);
        audio.splash(1);
        stage.splashAt(LEAP_TO.x, LEAP_TO.z, 1.5);
      }
    }
    // Pip follows a moment behind on the same line, landing a little shorter
    if (!lp.pipGo) {
      lp.pipT += dt;
      if (lp.pipT >= 0.05) {
        lp.pipGo = true;
        friend.glassLeap({ from: LEAP_FROM, to: LEAP_TO_PIP, apex: 2.5, duration: 1.2 });
      }
    }
    if (lp.pDone) {
      lp.endT += raw;
      if (!lp.fDone && lp.endT > 5) {
        lp.fDone = true;
        friend.place(LEAP_TO_PIP.x, LEAP_TO_PIP.z, LEAP_YAW);
        friend.do("idle");
      }
      if (lp.fDone) {
        if (lp.after === 0) ctx.setTimeScale(1, 0.5);
        lp.after += raw;
        if (lp.after > 1.5) { lp.on = false; friendEv = null; beginBows(false); }
      }
    }
  }

  // =================================================================================== 8. BOWS
  function beginBows(instant) {
    const g = gen;
    step = "bows";
    friendEv = null;
    act.live = false; roll.on = false; lp.on = false;
    player.enabled = false;
    player.scripted = false;
    ctx.setTimeScale(1, 0);
    startMusic();
    hud();
    exc = Math.max(exc, 0.9);
    pushExc(true);
    ui.beat.clear();
    ui.beat.show(false);
    ui.setTricks(null);
    ui.setCombo(0);
    ui.setObjective("Take a bow!");
    stage.setCue("finale", 1);
    stage.setHoopFlame(false);
    stage.screen.setText("BRAVO!", "THANK YOU");
    stage.spots[0].follow(platypus.group);
    stage.spots[1].follow(friend.group);
    bows.phase = 0; bows.t = 0;
    const b = SP.bow;
    cinema.shot({ to: { pos: [2.4, 1.2, 8.9], look: [0, 0.35, b.z], fov: fovA(42) }, dur: instant ? 0.01 : 3, ease: "inOut", hand: 0.3 });
    const go = () => { if (g === gen) bowNow(); };
    if (instant) { if (bonus === 0) bonus = 5; putBoth(b.x - 0.7, b.z + 0.1, 0, b.x + 0.7, b.z + 0.1, 0); go(); }
    else meetAt(b.x - 0.7, b.z + 0.1, 0, b.x + 0.7, b.z + 0.1, 0, 8, 0.85, go);
  }
  function bowNow() {
    bows.phase = 1; bows.t = 0;
    if (platypus.shake) platypus.shake();
    cinema.shot({ to: { pos: [-2.4, 1.3, 8.9], look: [0, 0.35, SP.bow.z] }, dur: 9, ease: "linear", hand: 0.3 });
    audio.crowd("roar", 1, false);
    audience.setExcitement(1);
    audience.flashes(1);
    audience.wave();
  }
  function tickBows(raw) {
    bows.t += raw;
    if (bows.phase === 1 && bows.t > 0.9) {
      bows.phase = 2;
      platypus.trick("bow"); friend.trick("bow");
      popV.set(player.x + 0.7, 0.6, player.z);
      fx.confetti(popV, null, 90, 0);
      // the bonus for the hoop rains down within reach of the magnet
      const big = bonus >= 15, n = big ? bonus / 3 : bonus;
      props.coins.rain(player.x, player.z, 1.1, n, big ? 3 : 1);
      owed += bonus;
      audio.payout(8);
    } else if (bows.phase === 2 && bows.t > 4.6) {
      bows.phase = 3;
      // anything still lying about the stage is swept up for the performers
      const rest = owed - got;
      props.coins.magnet = null;
      props.coins.clear();
      owed = got;
      if (rest > 0) { coins = ui.addCoins(rest); audio.payout(Math.min(10, rest)); }
      stars = score >= MAX_SCORE * 0.8 ? 3 : score >= MAX_SCORE * 0.55 ? 2 : 1;
      ui.setObjective(null);
      ui.banner(stars === 3 ? "★ ★ ★" : stars === 2 ? "★ ★ ☆" : "★ ☆ ☆", "You earned " + coins + " coins", 5);
      audio.questDone();
      audio.showMusic.stop(2);
      musicOn = false;
      audio.afterShow();
      audio.crowdBed(0.35);
      stage.setCue("house", 2.5);
      stage.setEnergy(0.2);
      friend.emote("happy");
    } else if (bows.phase === 3 && bows.t > 10.4) {
      bows.phase = 4;
      beginHome();
    }
  }

  // =================================================================================== 9. HOME
  function switchToZoo() {
    if (home.switched) return;
    home.switched = true;
    act.live = false;
    stage.spots[0].follow(null); stage.spots[1].follow(null);
    audio.crowdBed(0);
    audio.preShow(false);
    if (musicOn) { audio.showMusic.stop(0.5); musicOn = false; }
    fx.clear(false);
    ctx.setWorld(zoo);
    zoo.reset();
    zoo.group.add(friend.group, crowd.group, props.group);
    friend.reset(); friend.setWorld(zoo); friend.setName("Pip");
    props.reset(); props.setWorld(zoo);
    crowd.reset(); crowd.setLane(zoo.walkway, zoo.glass.z); crowd.stroll(0);
    zoo.setTime("night", 0);
    if (fx.setGround) fx.setGround(zoo.heightAt, zoo.waterAt);
    audio.zooAmbience(true, "night");
    // the keeper carries you in through the door; Pip trots in beside
    const dOut = ZP.doorOut, dIn = ZP.doorIn;
    zoo.door.open(true);
    keeper.place(dOut.x, dOut.z, -Math.PI / 2);
    keeper.carry(true);
    home.carried = true; home.down = false; home.pipLeg = 0; home.pipUp = false; home.pipT = 0;
    player.stop();
    player.scripted = true;
    player.speed = 0; player.vy = 0; player.grounded = true; player.swimming = false; player.diving = false;
    player.x = dOut.x; player.z = dOut.z;
    platypus.pose("carried", 0);
    carryPlayer();
    friend.place(dIn.x - 0.9, dIn.z + 1.0, Math.PI / 2);
    friend.do("follow", { dist: 1.2, side: 0.8 });
  }
  function homeWalk() {
    if (!home.switched || home.down) return;
    const g = gen, dIn = ZP.doorIn;
    keeper.walkTo(dIn.x, dIn.z, () => {
      if (g !== gen) return;
      keeper.walkTo(HOME_DROP.x, HOME_DROP.z, () => {
        if (g !== gen) return;
        keeper.kneel(() => { if (g === gen) setDown(); });
      });
    });
  }
  function carryPlayer() {
    keeper.carryAnchor.getWorldPosition(tmpV);
    keeper.carryAnchor.getWorldQuaternion(tmpQ);
    platypus.group.position.copy(tmpV);
    platypus.group.quaternion.copy(tmpQ);
    player.x = keeper.x; player.z = keeper.z; player.y = tmpV.y - 0.9; player.yaw = keeper.group.rotation.y;
  }
  function setDown() {
    if (home.down) return;
    home.down = true; home.carried = false;
    const n = ZP.nest, g = gen;
    player.scripted = false;
    platypus.pose(null, 0.4);
    player.teleport(n.x, n.z, n.yaw);
    audio.drop();
    keeper.stand();
    keeper.walkTo(ZP.doorIn.x, ZP.doorIn.z, () => {
      if (g !== gen) return;
      keeper.walkTo(ZP.doorOut.x, ZP.doorOut.z, () => {
        if (g !== gen) return;
        keeper.reset();
        if (zoo.door.isOpen) zoo.door.open(false);
      });
    });
    // Pip trots off and climbs to its own spot on the lookout
    home.pipLeg = 1; home.pipT = 0;
    const lf = ZP.lookoutFoot;
    friend.do("goto", { x: lf.x, z: lf.z, run: true });
  }
  function pipOnLookout() {
    if (home.pipUp) return;
    const lo = ZP.lookout, n = ZP.nest;
    if (friend.distTo(lo.x, lo.z) > 0.6) friend.place(lo.x, lo.z, Math.atan2(n.x - lo.x, n.z - lo.z));
    home.pipUp = true; home.pipLeg = 3;
    friend.do("sit", { lookAt: platypus.group });
  }
  function tickHome(raw) {
    if (home.carried) carryPlayer();
    if (home.pipLeg === 1 || home.pipLeg === 2) {
      home.pipT += raw;
      const lf = ZP.lookoutFoot, lo = ZP.lookout;
      if (home.pipLeg === 1 && (friend.distTo(lf.x, lf.z) < 0.5 || home.pipT > 7)) {
        home.pipLeg = 2; home.pipT = 0;
        friend.do("goto", { x: lo.x, z: lo.z, yaw: Math.atan2(ZP.nest.x - lo.x, ZP.nest.z - lo.z) });
      } else if (home.pipLeg === 2 && (friend.distTo(lo.x, lo.z) < 0.35 || home.pipT > 8)) pipOnLookout();
    }
  }
  function beginHome() {
    const g = gen;
    step = "home";
    friendEv = null;
    act.live = false; roll.on = false; lp.on = false; meet.on = false; meet.done = null;
    player.enabled = false;
    ui.setObjective(null);
    const n = ZP.nest, lo = ZP.lookout;
    cinema.play([
      { fade: "black", dur: 1.4 },
      () => {
        ui.beat.show(false); ui.setTricks(null); ui.setCombo(0); ui.setExcitement(null);
        switchToZoo();
      },
      { shot: { pos: [9.0, 1.35, -0.4], look: keeper.group, lookY: 0.85, fov: fovA(46), hand: 0.3, dur: 0 } },
      { caption: "Later that night...", dur: 2.6, narr: true },
      homeWalk,
      { fade: "clear", dur: 1.6 },
      { wait: 1.6 },
      { shot: { pos: [7.4, 1.0, -3.6], look: keeper.group, lookY: 0.8, fov: fovA(48), hand: 0.3, dur: 0 } },
      { caption: "What a show.", dur: 2.4, narr: true, hold: false },
      { until: () => home.down, max: 9 },
      () => { if (g === gen) setDown(); },
      { shot: { pos: ZP.camNest.pos, look: platypus.group, lookY: 0.2, fov: fovA(38), to: { pos: [ZP.camNest.pos.x + 0.5, ZP.camNest.pos.y + 0.15, ZP.camNest.pos.z + 0.4] }, dur: 4, ease: "out" }, hold: false },
      { caption: "Home.", dur: 2.4, narr: true },
      { shot: { pos: [7.7, 2.0, -2.9], look: [7.25, 1.0, -7.2], fov: fovA(50), to: { pos: [7.4, 2.4, -2.5] }, dur: 9, ease: "inOut", hand: 0.2 }, hold: false },
      { until: () => home.pipUp, max: 9 },
      () => {
        if (g !== gen) return;
        pipOnLookout();
        tmpV.set(lo.x, lo.y + 0.25, lo.z);
        platypus.lookAt(tmpV);
        friend.lookAt(platypus.group);
      },
      { wait: 1.4 },
      () => { friend.emote("yawn"); },
      { caption: "Goodnight, Pip.", dur: 2.8, narr: true },
      () => {
        friend.do("sleep");
        platypus.lookAt(null);
        platypus.sleep(true);
      },
      { shot: { pos: [7.4, 2.4, -2.5], look: [7.25, 1.0, -7.2], fov: fovA(50), to: { pos: [7.2, 3.2, -1.6], look: [7.3, 0.8, -7.2], fov: fovA(50) }, dur: 6, ease: "inOut" }, hold: false },
      { wait: 4 },
      { fade: "black", dur: 2 },
    ], {
      skippable: true, release: null,
      onSkip() {},
      onDone() { if (g !== gen) return; finish(); },
    });
  }
  function finish() {
    if (finished) return;
    finished = true;
    step = "done";
    player.enabled = false;
    ctx.complete();
  }

  // =================================================================================== start / update / input
  function start() {
    const g = gen;
    cinema.titleCard({ kicker: "LEVEL 4", title: "THE SHOW" }, () => { if (g === gen && step === "backstage") beginBackstage(); });
  }

  function update(dt, time) {
    if (step === "boot" || finished) return;
    const raw = ctx.time.rawDt || dt;
    for (let i = 0; i < 3; i++) if (rewardCd[i] > 0) rewardCd[i] -= raw;
    tickSong(raw);
    if (camT > 0) { camT -= raw; if (camT <= 0 && act.live) actDrift(act.n); }
    if (step === "backstage") { if (player.enabled) tickBackstage(raw); }
    else if (step === "home") tickHome(raw);
    else {
      if (act.live) tickAct();
      if (roll.on) tickRoll();
      if (lp.on) tickLeap(dt, raw);
      if (step === "bows") tickBows(raw);
      if (step !== "entrance") pushExc(false);
    }
    tickMeet(raw);
    tickRings(dt);
    friend.update(dt, time);
    crowd.update(dt, time);
    props.update(dt, time);
  }

  function onAction(name) {
    if (step === "boot" || finished) return false;
    const show = act.live || roll.on;
    if (name === "jump") { if (show) { press(-1); return true; } return step !== "backstage"; }
    if (name === "primary") { if (show) press(-1); return false; }
    if (show && name.length === 6 && name.charCodeAt(0) === 116) press(name.charCodeAt(5) - 49);
    return false;
  }

  function skipTo(name) {
    const idx = STEPS.indexOf(name);
    if (idx < 0 || step === "boot" || finished) return false;
    if (name === "done") { win(); return true; }
    hardStop();
    toStage();
    stage.setEnergy(exc);
    if (name === "backstage" || name === "entrance") {
      audio.showMusic.stop(0.2);
      musicOn = false;
      stageBackstage();
      if (name === "backstage") { cinema.fade("black", 0); beginBackstage(); }
      else { player.teleport(SP.tunnelMouth.x, SP.tunnelMouth.z - 0.6, 0); friend.place(0.8, SP.tunnelMouth.z - 0.6, 0); hud(); beginEntrance(); }
      return true;
    }
    audio.preShow(false);
    if (name === "act1") beginAct(1, true);
    else if (name === "act2") beginAct(2, true);
    else if (name === "act3") beginAct(3, true);
    else if (name === "finale") beginFinale(true);
    else if (name === "bows") beginBows(true);
    else { putBoth(SP.bow.x - 0.7, SP.bow.z, 0, SP.bow.x + 0.7, SP.bow.z, 0); hud(); beginHome(); }
    return true;
  }
  function win() {
    if (finished || step === "boot") return;
    hardStop();
    if (stars === 0) stars = 1;
    step = "done";
    const g = gen;
    cinema.fade("black", 0.5, () => { if (g === gen) finish(); });
  }
  function state() {
    return {
      step, score, maxScore: MAX_SCORE, excitement: exc, combo, bestCombo, coins, stars,
      hits, perfects, misses, notes: NOTE_COUNT, bonus,
      act: act.live ? act.n : 0, actBeat: act.live ? songBeat() - act.t0 : 0, rolling: roll.on, leaping: lp.on,
      music: musicOn, songBeat: songBeat(), clock: songFallback ? "fallback" : "audio",
      world: ctx.world ? ctx.world.name : "",
      ringLeap: trP.on, meeting: meet.on, bowPhase: bows.phase, homeDown: home.down, pipUp: home.pipUp,
      friend: friend ? { x: friend.x, y: friend.y, z: friend.z } : null,
    };
  }

  return { build, enter, start, update, exit, onAction, state, skipTo, win, STEPS };
}
