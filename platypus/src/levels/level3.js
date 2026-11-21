// level3.js - LEVEL 3 "ANOTHER DAY" (LEVELS.md C3).
// Another amazing day with Pip in the zoo habitat, morning to golden evening:
//   wake -> BREAKFAST HUNT (the bill's electro-sense) -> TAG -> BUBBLE TRAIL -> SYNCHRO PRACTICE -> HOOP
//   -> SHOW TIME (earn 50 coins) -> DINNER -> the poster: "1 DAY LEFT".
// Every beat is a begin*(instant) function that sets its own stage completely, so skipTo() can jump to any
// of them; all delayed work is guarded by a generation counter that hardStop() bumps.
import { createZoo } from "../zoo.js";
import { createFriend } from "../friend.js";
import { createCrowd } from "../crowd.js";
import { createProps } from "../props.js";

export const meta = { n: 3, title: "ANOTHER DAY" };

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (a, b) => a + Math.random() * (b - a);

const STEPS = ["wake", "forage", "tag", "bubbles", "synchro", "hoop", "show", "dinner", "poster", "done"];
const QUEST_OF = { forage: "forage", tag: "tag", bubbles: "bubbles", synchro: "synchro", hoop: "synchro", show: "show", dinner: "dinner" };
const SLOTS = [
  { name: "spin", label: "Spin", call: "SPIN", base: 1 },
  { name: "backflip", label: "Backflip", call: "BACKFLIP", base: 2 },
  { name: "roll", label: "Roll", call: "ROLL", base: 1 },
  { name: "twirlLeap", label: "Twirl leap", call: "TWIRL LEAP", base: 3 },
];
const TRICKS_ON = SLOTS.map((s) => ({ label: s.label, enabled: true }));
const TRICKS_OFF = SLOTS.map((s) => ({ label: s.label, enabled: false }));
const COIN_GOAL = 50;
const MAX_WATCHERS = 12;
// six fixed breakfast spots: two in the sand bank, two in the stream shallows, one by the reeds, one at the log bridge
const SNACK_SPOTS = [[2.2, 3.6], [1.2, 0.4], [-8.1, -4.25], [-7.25, -2.2], [-9.1, 7.2], [-5.9, -4.5]];
const KEEPER_SCATTER = { x: 7.6, z: 0.2 };

export function createLevel(ctx) {
  const { THREE, player, platypus, ui, cinema, audio, fx } = ctx;
  let zoo = null, friend = null, crowd = null, props = null, keeper = null, P = null, hoopLogic = null;

  let step = "boot", gen = 0, now = 0, live = false, finished = false;
  let coins = 0, tossed = 0, collected = 0, lastTossT = 0, lastCollectT = 0;
  let friendEv = null;
  let markT = 0, idleT = 0, fallLvl = -1;
  const done = { forage: false, tag: false, bubbles: false, synchro: false, show: false, dinner: false };
  const tmpV = new THREE.Vector3(), scr = { x: 0, y: 0, visible: false };
  const land = { x: 0, z: 0 }, fromPt = { x: 0, y: 2.7, z: 10.6 };
  const keeperCol = { x: 0, z: 0, r: 0.34, on: false }, bowlCol = { x: 0, z: 0, r: 0.2, on: false };

  // ---- tricks and money
  const pend = { on: false, name: "", label: "", base: 0, same: false, combo: 1 };
  let combo = 1, lastTrick = null, trickEndT = -99, lastTrickT = -99, gatherN = 0, mirror = false, tricksLive = false;
  let nobodyHint = false, comingHint = false, hoopLive = false, hoopCd = 0, hoops = 0, leapCd = 0;
  let hoopSide = NaN, hoopT = 0, hoopEasy = false, gatherT = -99;

  // ---- per-beat state
  let introNudged = false, keeperPut = false;
  let foragePlaced = false, forageN = 0, senseCd = 0, eating = false, pipHelpT = 0, pipBusy = false, pipFound = 0, fNear = -1, senseTip = 0;
  let tagPhase = "flee", tagT = 0, tags = 0, tagLock = false, tired = false, roundT = 0;
  const RINGS = [];
  const ringOn = new Uint8Array(8), ringGot = new Uint8Array(8), ringPuff = new Float32Array(8);
  let ringN = 0, pipRing = 0, ringForceT = 0, shellOn = false, shellT = 0, diveHint = false;
  const syn = { phase: "go", round: 0, seq: [0, 2, 3], n: 3, i: 0, t: 0, mistakes: 0, help: false, want: -1, goT: 0 };
  let showT = 0, showEnded = false, coinTip = false, showBoost = false;
  let camAim = 0, camAimT = 0;
  let bites = 0, dinnerReady = false, dinnerDone = false;

  const yawTo = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
  const later = (sec, fn) => { const g = gen; ctx.after(sec, () => { if (g === gen && step !== "done" && step !== "boot") fn(); }); };
  const distPF = () => Math.hypot(player.x - friend.x, player.z - friend.z);
  const topAt = (x, z) => { const h = zoo.heightAt(x, z), w = zoo.waterAt(x, z); return w > h ? w : h; };
  function ringAt(x, z, color) { fx.ring(x, z, color, topAt(x, z) + 0.06); }
  function progress() { idleT = 0; }

  // =================================================================================== build / enter / exit
  function build() {
    zoo = ctx.shared("zoo", () => createZoo(ctx));
    friend = ctx.shared("friend", () => createFriend(ctx));
    crowd = ctx.shared("crowd", () => createCrowd(ctx));
    props = ctx.shared("props", () => createProps(ctx));
    keeper = crowd.staff[0];
    P = zoo.P;
    hoopLogic = props.hoop(zoo.hoop);
    if (ctx.debug) ctx.debug.level3 = { zoo, friend, crowd, props, keeper, RINGS };
    // Pip's bubble slalom: two near the surface, three mid-water, the sunken log, the deepest point, the floating ring
    const sl = P.sunkenLog, zr = zoo.ring;
    RINGS.push(
      { x: -2.6, y: -0.18, z: 2.4, yaw: Math.PI / 2, r: 0.65 },
      { x: -4.0, y: -0.18, z: 3.7, yaw: 1.2, r: 0.65 },
      { x: -5.6, y: -0.8, z: 3.3, yaw: Math.PI / 2, r: 0.65 },
      { x: -7.5, y: -0.9, z: 2.9, yaw: 2.4, r: 0.65 },
      { x: -7.6, y: -0.8, z: 1.1, yaw: Math.PI, r: 0.65 },
      { x: sl.x, y: sl.y, z: sl.z, yaw: sl.yaw || 0, r: 0.5 },
      { x: P.poolDeep.x, y: -1.3, z: P.poolDeep.z, yaw: 0.6, r: 0.65 },
      { x: zr.x, y: zr.y, z: zr.z, yaw: zr.yaw, r: zr.r },
    );
  }

  function resetState() {
    coins = 0; tossed = 0; collected = 0; lastTossT = 0; lastCollectT = 0;
    for (const k in done) done[k] = false;
    forageN = 0; pipFound = 0; tags = 0; ringN = 0; hoops = 0; bites = 0;
    syn.round = 0; syn.phase = "go";
    nobodyHint = false; comingHint = false; diveHint = false; coinTip = false; senseTip = 0;
    finished = false;
    resetTransient();
  }
  // everything a beat may have left running (not the day's totals)
  function resetTransient() {
    live = false; friendEv = null; markT = 0; idleT = 0;
    pend.on = false; combo = 1; lastTrick = null; trickEndT = -99; lastTrickT = -99; gatherN = 0; mirror = false; tricksLive = false;
    hoopLive = false; hoopCd = 0; leapCd = 0; hoopSide = NaN; hoopT = 0; hoopEasy = false; gatherT = -99;
    introNudged = false; keeperPut = false;
    foragePlaced = false; senseCd = 0; eating = false; pipHelpT = 0; pipBusy = false; fNear = -1;
    tagPhase = "flee"; tagT = 0; tagLock = false; tired = false; roundT = 0;
    ringOn.fill(0); ringGot.fill(0); ringPuff.fill(0); pipRing = 0; ringForceT = 0; shellOn = false; shellT = 0;
    syn.phase = "go"; syn.i = 0; syn.t = 0; syn.mistakes = 0; syn.help = false; syn.want = -1; syn.goT = 0;
    showT = 0; showEnded = false; showBoost = false; camAimT = 0;
    dinnerReady = false; dinnerDone = false;
    keeperCol.on = false; bowlCol.on = false;
  }

  function enter() {
    gen++;
    zoo.reset();
    zoo.group.add(friend.group, crowd.group, props.group);
    friend.reset(); crowd.reset(); props.reset();
    props.clearPushers();
    friend.setWorld(zoo); friend.setName("Pip");
    props.setWorld(zoo);
    crowd.setLane(zoo.walkway, zoo.glass.z);
    props.addPusher(player, 0.35); props.addPusher(friend, 0.32);
    props.coins.magnet = player;
    props.coins.onCollect = onCollect;
    if (platypus.reset) platypus.reset();
    platypus.onEvent = onPlatyEvent;
    friend.onEvent = (type, data) => { if (friendEv) friendEv(type, data); };
    zoo.poster.setText("PLATYPUS TRICKS", "IN 2 DAYS");
    ctx.setWorld(zoo);
    zoo.setTime("morning", 0);
    if (fx.setGround) fx.setGround(zoo.heightAt, zoo.waterAt);
    audio.zooAmbience(true, "day");
    ctx.colliders.push(keeperCol, bowlCol);
    resetState();
    fallLvl = -1;
    step = "wake";
    stageIntro();
  }

  function exit() {
    gen++;
    step = "boot"; live = false; friendEv = null;
    player.scripted = false; player.hidden = false; player.carrying = false;
    platypus.onEvent = null;
    platypus.sleep(false); platypus.pose(null); platypus.lookAt(null);
    if (platypus.reset) platypus.reset();
    friend.onEvent = null;
    friend.reset(); crowd.reset(); props.reset();
    props.clearPushers();
    props.coins.magnet = null; props.coins.onCollect = null;
    zoo.reset();
    zoo.poster.setText("PLATYPUS TRICKS", "IN 2 DAYS");
    if (fx.setGround) fx.setGround(null);
    audio.waterfall(0);
    audio.zooAmbience(false);
    keeperCol.on = false; bowlCol.on = false;
  }

  // Stop whatever is running (cutscene, timers, actors) and leave a neutral stage. Used by skipTo() and win().
  function hardStop() {
    gen++;
    ctx.clearTimers();
    cinema.reset();
    ui.clearSpeech();
    ctx.setTimeScale(1, 0);
    player.stop();
    player.scripted = false; player.hidden = false; player.enabled = false; player.lock = 0; player.face = null;
    player.maxSpeed = 3; player.carrying = false;
    platypus.sleep(false); platypus.pose(null); platypus.lookAt(null);
    friend.reset();
    keeper.reset();
    zoo.door.reset();
    crowd.disperse();
    props.snacks.clear(); props.shinies.clear(); props.bowl.hide();
    ui.setAction(null); ui.setObjective(null); ui.setTricks(null); ui.setCombo(0);
    resetTransient();
  }

  // =================================================================================== HUD
  function hud() {
    ui.showHud(true);
    ui.setFriendship(1, "Pip");
    ui.setCoins(coins);
    const q = QUEST_OF[step];
    ui.setQuests([
      { id: "forage", text: forageText(), done: done.forage, current: q === "forage" },
      { id: "tag", text: tagText(), done: done.tag, current: q === "tag" },
      { id: "bubbles", text: ringText(), done: done.bubbles, current: q === "bubbles" },
      { id: "synchro", text: "Show practice with Pip", done: done.synchro, current: q === "synchro" },
      { id: "show", text: showText(), done: done.show, current: q === "show" },
      { id: "dinner", text: "Dinner with Pip", done: done.dinner, current: q === "dinner" },
    ], "Today");
  }
  const forageText = () => "Sniff out yabbies " + Math.min(forageN, 6) + " / 6";
  const tagText = () => "Tag Pip " + Math.min(tags, 3) + " / 3";
  const ringText = () => "Bubble rings " + Math.min(ringN, 8) + " / 8";
  const showText = () => "Earn coins " + Math.min(coins, COIN_GOAL) + " / " + COIN_GOAL;
  function setStep(name) { step = name; }
  function setTod(name, seconds) { if (zoo.time !== name) zoo.setTime(name, seconds || 0); }
  function putBoth(px, pz, pyaw, qx, qz, qyaw) {
    player.teleport(px, pz, pyaw);
    friend.place(qx, qz, qyaw === undefined ? yawTo(qx, qz, px, pz) : qyaw);
  }
  function questDone(id) {
    done[id] = true;
    audio.questDone();
    ui.setQuest(id, { done: true });
    ui.objectiveDone();
    friend.emote("happy");
    progress();
  }
  function tricksShown(enabled) { ui.setTricks(enabled ? TRICKS_ON : TRICKS_OFF); }

  // =================================================================================== money
  function onCollect(v, x, y, z) {
    v = Math.round(v) || 1;
    coins += v; collected += v; lastCollectT = now;
    ui.addCoins(v);
    tmpV.set(x, y, z);
    ctx.project(tmpV, scr, 0.2);
    if (scr.visible) ui.floatText("+" + v, scr.x, scr.y);
    audio.coin();
    ui.setQuest("show", { text: showText() });
    progress();
  }
  function payDirect(n, obj) {
    coins += n;
    ui.addCoins(n);
    ctx.project(obj || platypus.group, scr, 0.5);
    if (scr.visible) ui.floatText("+" + n, scr.x, scr.y);
    audio.payout(n);
    ui.setQuest("show", { text: showText() });
  }
  function landing() {
    land.x = player.x + rnd(-1.3, 1.3);
    land.z = Math.min(9.0, player.z + rnd(-1.0, 1.2));
    zoo.confine(land, 0.3);
    return land;
  }
  function tossOne(v) {
    const ok = crowd.tossCoin((from) => { tossed += v; lastTossT = now; props.coins.toss(from, landing(), v); });
    if (!ok) {
      // nobody is standing at the glass yet: the coin still comes over the top
      fromPt.x = clamp(player.x + rnd(-1.5, 1.5), -11, 11); fromPt.y = 2.7; fromPt.z = 10.6;
      tossed += v; lastTossT = now;
      props.coins.toss(fromPt, landing(), v);
    }
  }
  function tossCoins(c) {
    const k = Math.min(c, 5);
    for (let i = 0; i < k; i++) tossOne(Math.floor(c / k) + (i < c % k ? 1 : 0));
  }

  // =================================================================================== tricks
  function canTrick() {
    return player.enabled && player.lock <= 0 && !platypus.acting && player.grounded && !player.swimming && !cinema.playing;
  }
  function queueTrick(name, label, base) {
    const same = name === lastTrick;
    const inTime = lastTrick !== null && now - trickEndT <= 3;
    const up = !same && inTime;
    combo = same ? 1 : up ? Math.min(5, combo + 1) : 1;
    pend.on = true; pend.name = name; pend.label = label; pend.base = base; pend.same = same; pend.combo = combo;
    lastTrick = name; lastTrickT = now;
    if (up) audio.comboUp(combo);
  }
  function startTrick(slot) {
    if (!canTrick()) return false;
    const s = SLOTS[slot];
    const d = platypus.trick(s.name);
    if (!(d > 0)) return false;
    player.lock = d;
    audio.trickWhoosh(slot);
    ui.flashTrick(slot, true);
    queueTrick(s.name, s.call, s.base);
    trickEndT = now + d;
    if (mirror) friend.trick(s.name, 0.3);
    progress();
    return true;
  }
  function payTrick() {
    if (!pend.on) return;
    pend.on = false;
    const paying = step === "show" || step === "hoop";
    const inZone = player.z > 3;
    if (inZone && gatherN === 0) { gatherN = 3; gatherT = now; crowd.gather(player.x, 3); }
    let w = inZone ? crowd.watchers(player.x) : 0;
    if (w <= 0 && inZone && gatherN > 0 && now - gatherT > 7) w = 1; // called over long ago: somebody saw it
    if (w <= 0) {
      ui.call(pend.label + "!", "", "good");
      if (paying) {
        if (!inZone) { if (!nobodyHint) { nobodyHint = true; ui.hint("Nobody saw that! Do tricks near the glass.", 3.4); } }
        else if (!comingHint) { comingHint = true; ui.hint("The visitors are coming over. Do another one!", 3); }
      }
      ui.setCombo(pend.combo);
      return;
    }
    let c = Math.ceil(pend.base * pend.combo * (0.5 + 0.1 * w));
    if (pend.same) c = Math.floor(c / 2);
    else if (showBoost && step === "show") c *= 2;
    ui.call(pend.label + "!", c > 0 ? "+" + c : "again?", pend.combo >= 3 ? "perfect" : "good");
    if (pend.same) crowd.react("laugh", 0.5);
    else crowd.react(c >= 6 ? "cheer" : c >= 3 ? "clap" : "ooh", clamp(0.4 + c / 14, 0.4, 1));
    ui.setCombo(pend.combo);
    if (c > 0) {
      tossCoins(c);
      gatherN = Math.min(MAX_WATCHERS, gatherN + 1);
      crowd.gather(player.x, gatherN);
      if (!coinTip) { coinTip = true; later(1.4, () => ui.hint("Walk over the coins to pick them up.", 3)); }
    }
  }
  function onPlatyEvent(type, name) {
    if (type === "apex") {
      if (pend.on && pend.name === name) {
        if (name === "waterLeap") {
          const zr = zoo.ring;
          if (Math.hypot(player.x - zr.x, player.z - zr.z) < 1.2) { pend.label = "RING LEAP"; pend.base = 5; ringPass(7); }
        }
        payTrick();
      }
    } else if (type === "land") {
      audio.trickLand(true);
      if (name === "waterLeap") { fx.splash(player.x, 0, player.z, 0.6); audio.splash(0.6); }
    } else if (type === "bite") audio.eat();
  }
  function tickTricks(dt) {
    if (hoopCd > 0) hoopCd -= dt;
    if (leapCd > 0) leapCd -= dt;
    // the land hoop: crossing the ring's plane within its width. The jump only has to be a jump (a child's
    // timing is never punished); after a long struggle in the hoop lesson simply running through counts.
    const hp = zoo.hoop;
    const hnx = typeof hp.nx === "number" ? hp.nx : Math.sin(hp.yaw || 0), hnz = typeof hp.nz === "number" ? hp.nz : Math.cos(hp.yaw || 0);
    const hdx = player.x - hp.x, hdz = player.z - hp.z;
    const side = hdx * hnx + hdz * hnz;
    const through = hoopSide === hoopSide && Math.abs(side - hoopSide) < 0.8 && ((hoopSide < 0 && side >= 0) || (hoopSide > 0 && side <= 0)) &&
      Math.abs(hdx * hnz - hdz * hnx) < hp.r + 0.12 && player.y < hp.y + hp.r + 0.6;
    hoopSide = side;
    if (through && hoopLive && live && hoopCd <= 0 && !player.swimming && (!player.grounded || (hoopEasy && step === "hoop"))) {
      hoopCd = 1;
      hoops++;
      const h = zoo.hoop;
      tmpV.set(h.x, h.y, h.z);
      fx.sparkle(tmpV, 0xfff2a8, 14);
      audio.trickLand(true);
      queueTrick("hoop", "HOOP", 4);
      trickEndT = now;
      payTrick();
      progress();
      if (step === "hoop") hoopDone();
    }
    if (combo > 1 && now - trickEndT > 3 && !platypus.acting) { combo = 1; ui.setCombo(0); }
    if (gatherN > 0 && step !== "synchro" && now - lastTrickT > 12) { gatherN = 0; comingHint = false; crowd.disperse(); }
  }
  function tryWaterLeap(depth) {
    if (!live || !tricksLive || leapCd > 0 || platypus.acting || !player.enabled) return;
    if (depth < 1.0 || player.speed <= 1.5) return;
    const d = platypus.trick("waterLeap");
    if (!(d > 0)) return;
    leapCd = d + 0.4;
    fx.splash(player.x, 0, player.z, 0.7);
    audio.trickWhoosh(3);
    queueTrick("waterLeap", "WATER LEAP", 3);
    trickEndT = now + d;
    if (mirror && friend.swimming) friend.trick("waterLeap", 0.3);
    progress();
  }

  // =================================================================================== the keeper
  function keeperIn(dest, onPut) {
    const g = gen;
    keeperPut = false;
    zoo.door.open(true);
    keeper.place(P.doorOut.x, P.doorOut.z, -Math.PI / 2);
    keeper.walkTo(P.doorIn.x, P.doorIn.z, () => {
      if (g !== gen) return;
      keeper.walkTo(dest.x, dest.z, () => {
        if (g !== gen) return;
        keeper.kneel(() => { if (g !== gen) return; onPut(); keeperPut = true; });
      });
    });
  }
  function keeperOut() {
    const g = gen;
    keeper.hold(false);
    keeper.walkTo(P.doorIn.x, P.doorIn.z, () => {
      if (g !== gen) return;
      keeper.walkTo(P.doorOut.x, P.doorOut.z, () => {
        if (g !== gen) return;
        keeper.reset();
        if (zoo.door.isOpen) zoo.door.open(false);
      });
    });
  }

  // =================================================================================== 1. WAKE
  function stageIntro() {
    setStep("wake");
    live = false;
    setTod("morning", 0);
    player.teleport(P.nest.x, P.nest.z, P.nest.yaw);
    platypus.sleep(true);
    friend.place(P.lookout.x, P.lookout.z, P.lookout.yaw);
    friend.do("sleep"); // yawns and curls up in place, behind the title card
    crowd.stroll(3);
  }
  function wakePlayer() {
    platypus.sleep(false);
    platypus.wakeStretch();
    audio.yawn();
  }
  function playIntro() {
    const g = gen;
    friendEv = (type) => { if (type === "nudged") introNudged = true; };
    cinema.play([
      { shot: { pos: P.camNest.pos, look: P.camNest.look, fov: 38, to: { pos: [6.25, 1.25, -5.05] }, dur: 6.5, ease: "out" }, hold: false },
      { fade: "clear", dur: 1.5 },
      { caption: "Morning in the habitat.", dur: 2.6, narr: true },
      () => { friend.do("idle"); friend.emote("yawn"); },
      { shot: { pos: [7.3, 2.3, -4.8], look: friend.group, lookY: 0.2, fov: 36, hand: 0.4, dur: 2.5 } },
      () => { introNudged = false; friend.do("nudge"); },
      { shot: { pos: [6.3, 1.05, -4.9], look: platypus.group, lookY: 0.22, fov: 40, to: { pos: [6.9, 0.8, -5.3] }, dur: 6, ease: "inOut" }, hold: false },
      { until: () => introNudged, max: 6 },
      wakePlayer,
      { caption: "Pip is already up!", dur: 2.3, narr: true },
      () => { friend.do("idle"); friend.emote("happy"); },
      { wait: 1.3 },
    ], {
      skippable: true,
      onSkip() {
        platypus.sleep(false);
        friend.place(P.nestFriend.x, P.nestFriend.z, yawTo(P.nestFriend.x, P.nestFriend.z, P.nest.x, P.nest.z));
        friend.do("idle");
      },
      onDone() { if (g !== gen) return; platypus.sleep(false); beginForage(false); },
    });
  }
  function start() {
    const g = gen;
    cinema.titleCard({ kicker: "LEVEL 3", title: "ANOTHER DAY" }, () => { if (g === gen && step === "wake") playIntro(); });
  }

  // =================================================================================== 2. BREAKFAST HUNT
  function placeSnacks() {
    if (foragePlaced) return;
    foragePlaced = true;
    for (let i = 0; i < 6; i++) {
      const s = SNACK_SPOTS[i];
      props.snacks.place(i, s[0], s[1], "yabby", true);
    }
    fx.sandPuff(KEEPER_SCATTER.x - 0.6, topAt(KEEPER_SCATTER.x - 0.6, KEEPER_SCATTER.z) + 0.03, KEEPER_SCATTER.z, 0.7);
  }
  function snacksLeft() {
    let n = 0;
    for (let i = 0; i < 6; i++) if (props.snacks.active(i)) n++;
    return n;
  }
  function beginForage(instant) {
    setStep("forage");
    live = false;
    setTod("morning", 0);
    hud();
    if (instant) {
      putBoth(6.2, -2.4, -2.0, 7.3, -3.2);
      placeSnacks();
      forageGo();
      return;
    }
    // out of the burrow (the follow camera cannot see into it), in the open, watching the keeper
    putBoth(5.0, 1.6, yawTo(5.0, 1.6, KEEPER_SCATTER.x, KEEPER_SCATTER.z), 4.3, 0.3, yawTo(4.3, 0.3, KEEPER_SCATTER.x, KEEPER_SCATTER.z));
    friend.do("idle");
    keeperIn(KEEPER_SCATTER, placeSnacks);
    const g = gen;
    cinema.play([
      { shot: { pos: [5.9, 1.5, 3.3], look: keeper.group, lookY: 1.05, fov: 42, hand: 0.3, dur: 0 } },
      { caption: "Here comes the keeper with breakfast.", dur: 3, narr: true, hold: false },
      { until: () => keeperPut, max: 10 },
      () => { keeper.wave(); },
      { caption: "It is hidden in the sand. Sniff it out!", dur: 2.6, narr: true },
    ], {
      skippable: true,
      onSkip() { placeSnacks(); },
      onDone() { if (g !== gen) return; placeSnacks(); keeperOut(); forageGo(); },
    });
  }
  function forageGo() {
    live = true;
    player.enabled = true;
    friendEv = null;
    friend.do("follow");
    pipHelpT = 0; pipBusy = false; senseCd = 0; eating = false;
    ui.setObjective("Sniff out 6 yabbies with your bill", ctx.touch ? "tap Sense" : "E = Sense");
    ui.hint(ctx.touch ? "Your bill points the way!" : "Press E to sense. Your bill points the way!", 4);
    progress();
  }
  function forageFound(byPip) {
    forageN = 6 - snacksLeft();
    ui.setQuest("forage", { text: forageText() });
    audio.objective();
    progress();
    if (!byPip) pipHelpT = 0;
    if (forageN >= 6 && !done.forage) {
      ui.setAction(null);
      questDone("forage");
      later(2.4, () => beginTag(false));
    }
  }
  function forageAction() {
    if (!player.enabled || player.lock > 0 || player.diving || eating || done.forage) return;
    const S = props.snacks;
    const i = S.nearest(player.x, player.z, 0.9);
    if (i < 0) {
      if (senseCd > 0) return;
      senseCd = 0.8;
      const j = S.nearest(player.x, player.z, 1e4);
      if (j < 0) return;
      S.pos(j, tmpV);
      const dx = tmpV.x - player.x, dz = tmpV.z - player.z, d = Math.hypot(dx, dz) || 1;
      const close = clamp(1 - d / 13, 0, 1);
      platypus.zap();
      player.lock = 0.45;
      player.face = Math.atan2(dx, dz); // the bill swings toward it
      const k = 0.25 + 0.75 * close;
      fx.senseRing(player.x, Math.max(player.y, topAt(player.x, player.z)) + 0.06, player.z, (dx / d) * k, (dz / d) * k);
      audio.sensePulse(close);
      senseTip++;
      if (d < 2) ui.hint("Right here! Step closer and dig.", 2);
      else if (d < 6) ui.hint("Warm... it is this way!", 2);
      else if (senseTip <= 3) ui.hint("Something is far over there. Follow your bill.", 2.4);
      progress();
    } else if (S.buried(i)) {
      S.pos(i, tmpV);
      player.face = Math.atan2(tmpV.x - player.x, tmpV.z - player.z);
      player.lock = 0.6;
      platypus.playBow();
      S.reveal(i);
      audio.step("sand", 1, 0);
      audio.pickup();
      progress();
    } else {
      S.pos(i, tmpV);
      player.face = Math.atan2(tmpV.x - player.x, tmpV.z - player.z);
      eating = true;
      player.lock = platypus.eat();
      later(0.36, () => { eating = false; if (S.active(i)) { S.eat(i); forageFound(false); } });
    }
  }
  // Pip sniffs one out by itself when the player is taking long (two at most, never the last one)
  function pipHelp() {
    const S = props.snacks;
    if (pipBusy || pipFound >= 2 || snacksLeft() <= 1) { pipHelpT = 20; return; }
    let best = -1, bd = -1;
    for (let i = 0; i < 6; i++) {
      if (!S.buried(i)) continue;
      S.pos(i, tmpV);
      const d = Math.hypot(tmpV.x - player.x, tmpV.z - player.z);
      if (d > bd) { bd = d; best = i; }
    }
    if (best < 0) { pipHelpT = 20; return; }
    pipBusy = true; pipHelpT = 0;
    const i = best;
    S.pos(i, tmpV);
    const sx = tmpV.x, sz = tmpV.z;
    friend.emote("call");
    friend.do("goto", { x: sx + 0.35, z: sz + 0.2, run: true });
    const back = () => { pipBusy = false; if (step === "forage") { friendEv = null; friend.do("follow"); } };
    friendEv = (type) => {
      if (type !== "arrived") return;
      friendEv = null;
      if (!S.active(i) || snacksLeft() <= 1) { back(); return; }
      if (S.buried(i)) S.reveal(i);
      friend.eat();
      later(0.5, () => {
        if (S.active(i) && snacksLeft() > 1) { S.eat(i); pipFound++; forageFound(true); ui.hint("Pip found one!", 2); }
      });
      later(2.2, back);
    };
    later(14, () => { if (pipBusy && friendEv) back(); });
  }
  function tickForage(dt) {
    if (senseCd > 0) senseCd -= dt;
    let label = null;
    fNear = -1;
    if (!done.forage && player.enabled && player.lock <= 0 && !player.diving && !eating) {
      fNear = props.snacks.nearest(player.x, player.z, 0.9);
      label = fNear < 0 ? "Sense" : props.snacks.buried(fNear) ? "Dig" : "Eat";
    }
    ui.setAction(label);
    if (!done.forage) {
      pipHelpT += dt;
      if (pipHelpT > 40) pipHelp();
    }
  }

  // =================================================================================== 3. TAG
  function beginTag(instant) {
    setStep("tag");
    setTod("morning", 0);
    hud();
    ui.setAction(null);
    if (instant) putBoth(2, 0, 0.5, 4.6, 1.6);
    tagPhase = "flee"; tagT = 20; tagLock = false; tired = false; roundT = 0;
    live = true;
    player.enabled = true;
    ui.banner("TAG!", "Run! Pip is it!", 2.6);
    ui.setObjective("Run away from Pip!", "");
    friendEv = onTagEvent;
    friend.do("idle");
    friend.emote("call");
    later(1.1, () => { if (tagPhase === "flee") friend.do("chase", { role: "it" }); });
    progress();
  }
  function onTagEvent(type, who) {
    if (type !== "tag") return;
    if (tagPhase === "flee" && who === "friend") {
      ui.hint("Pip got you! Hee hee!", 1.8);
      audio.objective();
      later(1.8, () => { if (step === "tag" && tagPhase === "flee") friend.do("chase", { role: "it" }); });
    } else if (tagPhase === "catch" && who === "player") registerTag();
  }
  function startCatch() {
    tagPhase = "catch"; tagLock = true;
    friend.do("idle");
    ui.banner("YOU'RE IT!", "Catch Pip 3 times", 2.6);
    ui.setObjective("Tag Pip! Run into your friend", "");
    later(1.7, startRun);
    progress();
  }
  function startRun() {
    if (step !== "tag" || done.tag) return;
    tagLock = false; tired = false; roundT = 0;
    friend.do("chase", { role: "runner", pool: tags === 2 });
    if (tags === 2) ui.hint("Last one! Pip loves the pool...", 2.6);
  }
  function registerTag() {
    if (tagLock || done.tag) return;
    tagLock = true;
    tags++;
    ui.call("TAG!", tags + " / 3", "good");
    ui.setQuest("tag", { text: tagText() });
    audio.objective();
    tmpV.set(friend.x, friend.y + 0.35, friend.z);
    fx.hearts(tmpV, 2);
    progress();
    if (tags >= 3) {
      friend.do("idle");
      questDone("tag");
      later(2.6, () => beginBubbles(false));
    } else {
      if (tired) { friend.do("idle"); friend.emote("laugh"); }
      later(2, startRun);
    }
  }
  function tickTag(dt) {
    if (done.tag) return;
    if (tagPhase === "flee") {
      tagT -= dt;
      if (tagT <= 0) startCatch();
      return;
    }
    if (tagLock) return;
    roundT += dt;
    if (!tired && roundT > 32) {
      // a long round: Pip runs out of puff and sits down, so nobody can get stuck here
      tired = true;
      friend.do("sit");
      ui.hint("Pip is out of breath. Now!", 2.6);
    }
    const reach = tired ? 1.0 : 0.8;
    if (roundT > 0.7 && distPF() < reach && Math.abs(player.y - friend.y) < 1.7) registerTag();
  }

  // =================================================================================== 4. BUBBLE TRAIL
  function puffRing(i) {
    const r = RINGS[i];
    ringPuff[i] = 5;
    if (i === 7) { tmpV.set(r.x, r.y + 0.1, r.z); fx.sparkle(tmpV, 0xbfe9ff, 10); }
    else fx.bubbleRing(r.x, r.y, r.z, r.yaw, r.r);
  }
  function pipNextRing() {
    if (step !== "bubbles") return;
    if (pipRing >= 8) { friendEv = null; friend.do("follow", { dist: 1.2 }); return; }
    const r = RINGS[pipRing];
    friendEv = (type) => {
      if (type !== "arrived") return;
      if (!ringOn[pipRing]) { ringOn[pipRing] = 1; puffRing(pipRing); }
      pipRing++;
      pipNextRing();
    };
    friend.do("goto", { x: r.x, z: r.z, y: Math.min(r.y, -0.1), run: true });
  }
  function beginBubbles(instant) {
    setStep("bubbles");
    setTod("morning", 0);
    hud();
    ui.setAction(null);
    if (instant) putBoth(P.sandbank.x, P.sandbank.z, P.sandbank.yaw, 1.4, 3.6);
    ringOn.fill(0); ringGot.fill(0); ringPuff.fill(0);
    ringN = 0; pipRing = 0; ringForceT = 0; shellOn = false; shellT = 0;
    ui.setQuest("bubbles", { text: ringText() });
    live = true;
    tricksLive = true;
    player.enabled = true;
    ui.banner("BUBBLE TRAIL", "Follow Pip into the pool", 2.8);
    ui.setObjective("Swim through 8 bubble rings", ctx.touch ? "hold Jump to dive" : "hold Space to dive");
    friend.do("idle");
    friend.emote("call");
    later(1.0, pipNextRing);
    progress();
  }
  function ringPass(i) {
    if (step !== "bubbles" || !ringOn[i] || ringGot[i]) return;
    ringGot[i] = 1;
    ringN++;
    const r = RINGS[i];
    tmpV.set(r.x, r.y, r.z);
    fx.sparkle(tmpV, 0xcdf2ff, 14);
    audio.comboUp(ringN);
    ui.call(ringN + " / 8", "", "good");
    ui.setQuest("bubbles", { text: ringText() });
    progress();
    if (ringN >= 8) {
      shellOn = true; shellT = 0;
      props.shinies.place(0, P.poolDeep.x, undefined, P.poolDeep.z);
      ui.objectiveDone();
      later(1.2, () => {
        if (step !== "bubbles" || !shellOn) return;
        ui.setObjective("Dive for Pip's shiny shell!", ctx.touch ? "hold Jump to dive" : "hold Space to dive");
      });
    }
  }
  function nextRing() {
    for (let i = 0; i < 8; i++) if (ringOn[i] && !ringGot[i]) return i;
    return -1;
  }
  function tickBubbles(dt) {
    if (done.bubbles) return;
    const bx = player.x, by = player.y + 0.15, bz = player.z;
    if (shellOn) {
      shellT += dt;
      // generous reach; after a long while it is enough to be floating right above it
      const near = props.shinies.nearest(bx, by, bz, 0.95);
      const above = shellT > 50 && Math.hypot(bx - P.poolDeep.x, bz - P.poolDeep.z) < 1.0;
      if (near === 0 || (above && props.shinies.active(0))) {
        shellOn = false;
        props.shinies.collect(0);
        payDirect(10);
        ui.call("SHINY SHELL!", "+10", "perfect");
        questDone("bubbles");
        tricksLive = false;
        later(2.8, () => beginSynchro(false));
      }
      return;
    }
    // every ring appears even if Pip dawdles
    ringForceT += dt;
    if (ringForceT > 24) for (let i = 0; i < 8; i++) if (!ringOn[i]) { ringOn[i] = 1; puffRing(i); }
    for (let i = 0; i < 8; i++) {
      if (!ringOn[i] || ringGot[i]) continue;
      const r = RINGS[i];
      ringPuff[i] -= dt;
      if (ringPuff[i] <= 0) puffRing(i);
      const dx = bx - r.x, dy = by - r.y, dz = bz - r.z, rr = r.r + 0.3;
      if (dx * dx + dy * dy + dz * dz < rr * rr) ringPass(i);
    }
  }

  // =================================================================================== 5. SYNCHRO PRACTICE
  function makeSeq(round) {
    const n = 3 + round;
    syn.n = n;
    if (round === 0) { syn.seq[0] = 0; syn.seq[1] = 2; syn.seq[2] = 3; return; } // teaches Roll and Twirl leap
    let prev = -1, hasFlip = false;
    for (let i = 0; i < n; i++) {
      let s = (Math.random() * 4) | 0;
      if (s === prev) s = (s + 1 + ((Math.random() * 3) | 0)) % 4;
      if (i === n - 1 && !hasFlip && prev !== 1) s = 1;
      if (s === 1) hasFlip = true;
      syn.seq[i] = s; prev = s;
    }
  }
  function clearWant() {
    if (syn.want >= 0) ui.setTrickState(syn.want, { want: false });
    syn.want = -1;
  }
  function beginSynchro(instant) {
    setStep("synchro");
    setTod("noon", instant ? 0 : 15);
    hud();
    ui.setAction(null);
    if (instant) putBoth(2.2, 4.6, 0.3, 3.6, 5.2);
    crowd.stroll(5);
    syn.phase = "go"; syn.round = 0; syn.goT = 0; syn.mistakes = 0; syn.help = false; syn.want = -1;
    live = true;
    player.enabled = true;
    tricksShown(false);
    ui.banner("SHOW PRACTICE", "Copy Pip's tricks", 2.8);
    ui.setObjective("Meet Pip at the show rock", "");
    friendEv = null;
    friend.do("goto", { x: P.showFriend.x, z: P.showFriend.z, yaw: 0, run: true });
    progress();
  }
  function synStartRound() {
    makeSeq(syn.round);
    syn.mistakes = 0; syn.help = false;
    synDemo(0.9);
  }
  // turn the follow camera so Pip's demonstration is in view, just past the player's shoulder
  function synFrame() {
    camAim = yawTo(player.x, player.z, P.showFriend.x, P.showFriend.z) - 0.3;
    camAimT = 1.4;
  }
  function synDemo(delay) {
    clearWant();
    synFrame();
    syn.phase = "demo"; syn.i = 0; syn.t = delay;
    tricksShown(false);
    ui.setObjective("Round " + (syn.round + 1) + " of 3: watch Pip...", "");
    if (friend.distTo(P.showFriend.x, P.showFriend.z) > 1.2) friend.place(P.showFriend.x, P.showFriend.z, 0);
    friend.do("goto", { x: P.showFriend.x, z: P.showFriend.z, yaw: 0 });
  }
  function synTurn() {
    clearWant();
    syn.phase = "turn"; syn.i = 0;
    tricksShown(true);
    ui.call("YOUR TURN!", "", "good");
    synObjective();
    if (syn.help) { syn.want = syn.seq[0]; ui.setTrickState(syn.want, { want: true }); }
    friend.do("sit", { at: { x: P.showFriend.x, z: P.showFriend.z } });
  }
  function synObjective() {
    ui.setObjective("Your turn! Copy Pip: " + syn.i + " / " + syn.n, ctx.touch ? "tap the tricks" : "keys 1 2 3 4");
  }
  function synPress(slot) {
    if (syn.phase !== "turn" || !canTrick()) return;
    if (slot === syn.seq[syn.i]) {
      const s = SLOTS[slot];
      const d = platypus.trick(s.name) || 1;
      player.lock = d;
      audio.trickWhoosh(slot);
      ui.flashTrick(slot, true);
      clearWant();
      syn.i++;
      synObjective();
      lastTrickT = now;
      progress();
      if (syn.i >= syn.n) { syn.phase = "between"; syn.t = d + 0.3; tricksShown(false); }
      else if (syn.help) { syn.want = syn.seq[syn.i]; ui.setTrickState(syn.want, { want: true }); }
    } else {
      ui.flashTrick(slot, false);
      audio.trickLand(false);
      syn.mistakes++;
      syn.help = true; // from now on the right button glows on the player's turn
      ui.call("OOPS!", "Watch Pip again", "miss");
      synDemo(1.5);
    }
  }
  function synRoundDone() {
    const perfect = syn.mistakes === 0;
    const pay = perfect ? 5 : 3;
    ui.call(perfect ? "PERFECT!" : "NICE!", "+" + pay, perfect ? "perfect" : "good");
    crowd.react(perfect ? "cheer" : "clap", 0.8);
    tossCoins(pay);
    audio.comboUp(syn.round + 2);
    friend.emote("happy");
    if (!coinTip) { coinTip = true; later(1.4, () => ui.hint("Walk over the coins to pick them up.", 3)); }
    syn.round++;
    progress();
    if (syn.round >= 3) {
      syn.phase = "done";
      ui.objectiveDone();
      later(2.4, () => beginHoop(false));
    } else { syn.phase = "pause"; syn.t = 2.6; }
  }
  function tickSynchro(dt) {
    if (syn.phase === "go") {
      syn.goT += dt;
      const near = Math.hypot(player.x - P.showRock.x, player.z - P.showRock.z) < 1.7;
      const pipThere = friend.distTo(P.showFriend.x, P.showFriend.z) < 0.7 || syn.goT > 25;
      if (near && pipThere) {
        gatherN = 4; gatherT = now; lastTrickT = now;
        crowd.gather(3.8, 4);
        synStartRound();
        progress();
      }
      return;
    }
    if (syn.phase === "demo") {
      if (camAimT > 0) {
        camAimT -= dt;
        let dy = camAim - ctx.cam.yaw;
        while (dy > Math.PI) dy -= TAU;
        while (dy < -Math.PI) dy += TAU;
        ctx.cam.yaw += dy * Math.min(1, dt * 4);
      }
      if (ctx.cam.manualT < 2) ctx.cam.manualT = 2;
      syn.t -= dt;
      if (syn.t > 0) return;
      clearWant();
      if (syn.i < syn.n) {
        const slot = syn.seq[syn.i], s = SLOTS[slot];
        let d = friend.trick(s.name);
        if (!(d > 0)) d = 1;
        syn.want = slot;
        ui.setTrickState(slot, { want: true });
        ui.call(s.call, (syn.i + 1) + " of " + syn.n);
        audio.trickWhoosh(slot);
        syn.i++;
        syn.t = d + 0.45;
      } else synTurn();
      return;
    }
    if (syn.phase === "between") { syn.t -= dt; if (syn.t <= 0) synRoundDone(); return; }
    if (syn.phase === "pause") { syn.t -= dt; if (syn.t <= 0) synStartRound(); }
  }

  // =================================================================================== 6. HOOP
  function beginHoop(instant) {
    setStep("hoop");
    setTod("noon", 0);
    hud();
    ui.setAction(null);
    clearWant();
    if (instant) putBoth(3.4, 4.1, Math.PI / 2, 6.5, 2.6);
    live = true;
    player.enabled = true;
    hoopLive = true; tricksLive = true;
    hoopLogic.reset(); hoopSide = NaN; hoopT = 0; hoopEasy = false;
    tricksShown(true);
    ui.banner("THE HOOP", "A new trick!", 2.4);
    ui.setObjective("Run and jump through the hoop!", ctx.touch ? "Jump button" : "Space = jump");
    friendEv = null;
    friend.do("sit", { at: { x: zoo.hoop.x, z: zoo.hoop.z - 1.4 } });
    progress();
  }
  function tickHoop(dt) {
    if (done.synchro) return;
    hoopT += dt;
    if (!hoopEasy && hoopT > 40) {
      hoopEasy = true;
      ui.hint("Tricky! Just run right through the hoop.", 3.6);
      ui.setObjective("Run through the hoop!", "");
    }
    if (hoopT > 120) { ui.hint("Good try! You can practise the hoop any time.", 3.4); hoopDone(); }
  }
  function hoopDone() {
    if (done.synchro) return;
    questDone("synchro");
    later(2.6, () => beginShow(false));
  }

  // =================================================================================== 7. SHOW TIME
  function beginShow(instant) {
    setStep("show");
    setTod("evening", instant ? 0 : 30);
    if (instant && coins < 25) coins = 25;
    hud();
    ui.setAction(null);
    if (instant) putBoth(P.showRock.x, P.showRock.z, 0, P.showFriend.x, P.showFriend.z, 0);
    crowd.stroll(8);
    live = true;
    player.enabled = true;
    hoopLive = true; tricksLive = true; mirror = true;
    showT = 0; showEnded = false;
    tricksShown(true);
    ui.banner("SHOW TIME", "Earn " + COIN_GOAL + " coins", 3);
    ui.setObjective("Earn " + COIN_GOAL + " coins near the glass", ctx.touch ? "tap the tricks" : "keys 1 2 3 4");
    ui.hint("Different tricks in a row make a combo!", 4);
    friendEv = null;
    friend.do("follow", { dist: 1.4, side: 0.9 });
    progress();
  }
  function tickShow(dt) {
    if (showEnded) return;
    showT += dt;
    // coins nobody picked up for a long time: Pip brings them over, so the total can always be reached
    const owed = tossed - collected;
    if (owed > 0 && props.coins.lying > 0 && now - lastTossT > 22 && now - lastCollectT > 22) {
      props.coins.clear();
      collected = tossed;
      payDirect(owed, friend.group);
      ui.hint("Pip fetched your coins!", 2.4);
      friend.emote("happy");
    }
    if (!showBoost && showT > 150 && coins < COIN_GOAL) { showBoost = true; ui.hint("The visitors love you two. Double coins!", 3.6); crowd.react("cheer", 0.7); }
    if ((coins >= COIN_GOAL || showT > 300) && showT > 6 && !platypus.acting) {
      showEnded = true;
      mirror = false;
      crowd.react("cheer", 1);
      ui.banner("WHAT A SHOW!", "The visitors loved it", 3);
      questDone("show");
      later(3.2, () => beginDinner(false));
    }
  }

  // =================================================================================== 8. DINNER
  function putBowl() {
    if (dinnerReady) return;
    dinnerReady = true;
    props.bowl.attach(null);
    props.bowl.place(P.bowl.x, P.bowl.z);
    props.bowl.fill("worm", 6);
    bowlCol.x = P.bowl.x; bowlCol.z = P.bowl.z; bowlCol.on = true;
  }
  function beginDinner(instant) {
    setStep("dinner");
    setTod("evening", 0);
    if (instant && coins < COIN_GOAL) coins = COIN_GOAL;
    hud();
    ui.setAction(null);
    ui.setTricks(null); ui.setCombo(0);
    live = false;
    hoopLive = false; tricksLive = false; mirror = false;
    gatherN = 0;
    crowd.disperse();
    crowd.stroll(4);
    bites = 0; dinnerReady = false; dinnerDone = false;
    if (instant) {
      putBoth(8.2, 0.4, 2.4, 9.2, 1.2);
      putBowl();
      dinnerGo();
      return;
    }
    props.bowl.fill("worm", 6);
    props.bowl.attach(keeper.handAnchor);
    keeperIn({ x: P.bowl.x + 0.55, z: P.bowl.z - 0.45 }, putBowl);
    const g = gen;
    cinema.play([
      { shot: { pos: [7.4, 1.4, 1.3], look: keeper.group, lookY: 1.0, fov: 42, hand: 0.3, dur: 0 } },
      { caption: "The sun is going down. Dinner time!", dur: 3, narr: true, hold: false },
      { until: () => keeperPut, max: 10 },
      () => { keeper.wave(); friend.emote("happy"); },
      { wait: 1.6 },
    ], {
      skippable: true,
      onSkip() { putBowl(); },
      onDone() { if (g !== gen) return; putBowl(); keeperOut(); dinnerGo(); },
    });
  }
  function dinnerGo() {
    live = true;
    player.enabled = true;
    ui.setObjective("Eat dinner with Pip", ctx.touch ? "tap Eat at the bowl" : "E at the bowl");
    friendEv = null;
    {
      // right at the bowl, on the far side from the door
      const dx = P.bowlFriend.x - P.bowl.x, dz = P.bowlFriend.z - P.bowl.z, l = Math.hypot(dx, dz) || 1;
      const fx2 = P.bowl.x + (dx / l) * 0.62, fz2 = P.bowl.z + (dz / l) * 0.62;
      friend.do("goto", { x: fx2, z: fz2, yaw: yawTo(fx2, fz2, P.bowl.x, P.bowl.z) });
    }
    progress();
  }
  function dinnerAction() {
    if (dinnerDone || !dinnerReady || !player.enabled || player.lock > 0 || eating) return;
    if (Math.hypot(player.x - P.bowl.x, player.z - P.bowl.z) > 1.25) return;
    eating = true;
    player.face = Math.atan2(P.bowl.x - player.x, P.bowl.z - player.z);
    const d = platypus.eat();
    player.lock = d;
    later(0.36, () => { props.bowl.bite(); });
    if (!friend.busy && friend.distTo(P.bowl.x, P.bowl.z) < 1.9) {
      friend.eat();
      later(0.6, () => { if (props.bowl.left > 1) props.bowl.bite(); });
    }
    later(d + 0.05, () => {
      eating = false;
      bites++;
      progress();
      if (bites >= 3 && !dinnerDone) {
        dinnerDone = true;
        ui.setAction(null);
        questDone("dinner");
        later(1.6, () => { friend.emote("yawn"); });
        later(3.6, () => beginPoster(false));
      }
    });
  }
  function tickDinner() {
    const can = !dinnerDone && dinnerReady && player.enabled && player.lock <= 0 && !eating &&
      Math.hypot(player.x - P.bowl.x, player.z - P.bowl.z) <= 1.25;
    ui.setAction(can ? "Eat" : null);
  }

  // =================================================================================== 9. THE POSTER
  function finish() {
    if (finished) return;
    finished = true;
    step = "done";
    live = false;
    ctx.complete();
  }
  function beginPoster() {
    setStep("poster");
    live = false;
    player.enabled = false;
    hoopLive = false; tricksLive = false; mirror = false;
    ui.setAction(null); ui.setObjective(null); ui.setTricks(null); ui.setCombo(0);
    setTod("evening", 0);
    zoo.poster.setText("PLATYPUS TRICKS", "1 DAY LEFT");
    if (keeper.visible) { keeper.reset(); zoo.door.reset(); }
    keeperCol.on = false;
    const g = gen;
    const R = P.showRock, SF = P.showFriend, PO = P.poster, PC = P.posterClose;
    // closing time: the visitors drift out, so nobody stands between the camera and the poster
    crowd.disperse(); crowd.stroll(0);
    const settle = () => {
      if (step !== "poster") return;
      if (Math.hypot(player.x - R.x, player.z - R.z) > 0.4) { player.stop(); player.teleport(R.x, R.z, 0); }
      if (friend.distTo(SF.x, SF.z) > 0.5) { friend.do("idle"); friend.place(SF.x, SF.z, 0); }
      friendEv = null;
      friend.do("sit", { lookAt: PO });
      platypus.pose("sit", 0.6);
      tmpV.set(PO.x, PO.y, PO.z); platypus.lookAt(tmpV);
    };
    cinema.play([
      { fade: "black", dur: 0.6 },
      () => {
        ui.showHud(false);
        props.coins.clear();
        player.stop();
        putBoth(2.3, 5.3, 0.3, 3.9, 5.1, 0.3);
        friendEv = (type) => { if (type === "arrived" && step === "poster") friend.do("sit", { lookAt: PO }); };
        player.walkTo(R.x, R.z, { speed: 0.45, face: 0 });
        friend.do("goto", { x: SF.x, z: SF.z, yaw: 0 });
      },
      // the two of them wander up to the glass
      { shot: { pos: [0.6, 1.7, 3.4], look: [3.6, 0.5, 7.2], fov: 44, to: { pos: [1.2, 1.3, 4.2] }, dur: 4.6 }, hold: false },
      { fade: "clear", dur: 0.8 },
      { caption: "What a day.", dur: 2.6, narr: true },
      { until: () => !player.walking, max: 3 },
      settle,
      // over their shoulders, looking out through the glass
      { shot: { pos: [3.8, 1.2, 3.8], look: [4.3, 1.1, 10], fov: 50, to: { pos: [3.85, 1.15, 4.6] }, dur: 3.2 } },
      // ...through it, to the poster
      { shot: { to: { pos: [PC.x, PC.y, PC.z], look: [PO.x, PO.y, PO.z], fov: fovFor(2.15, PO.z - PC.z, 40) }, dur: 5, ease: "inOut" } },
      { caption: "Tomorrow is the big show.", dur: 4, narr: true },
      { fade: "black", dur: 1.4 },
    ], {
      skippable: true,
      release: null,
      onDone() { if (g !== gen) return; finish(); },
    });
  }
  // a vertical fov that fits `width` metres at `dist` across the screen (matters on a phone held upright)
  function fovFor(width, dist, landscapeFov) {
    const need = 2 * Math.atan(width / 2 / dist / ctx.camera.aspect) * 180 / Math.PI;
    return clamp(need, landscapeFov, 95);
  }

  // =================================================================================== markers and hints
  function mark() {
    if (step === "forage") {
      if (fNear < 0) {
        const i = props.snacks.nearest(player.x, player.z, 2.6);
        if (i >= 0) { props.snacks.pos(i, tmpV); ringAt(tmpV.x, tmpV.z, 0xffe08a); }
      }
    } else if (step === "tag") {
      if (tagPhase === "catch" && !done.tag) ringAt(friend.x, friend.z, 0xff9ac8);
    } else if (step === "bubbles") {
      if (shellOn) {
        props.shinies.pos(0, tmpV);
        fx.sparkle(tmpV, 0xfff2a8, 6);
        ringAt(tmpV.x, tmpV.z, 0xfff2a8);
      } else {
        const i = nextRing();
        if (i >= 0) {
          const r = RINGS[i];
          tmpV.set(r.x, r.y, r.z);
          fx.sparkle(tmpV, 0xbfe9ff, 6);
          ringAt(r.x, r.z, 0xbfe9ff);
        } else if (!done.bubbles) ringAt(P.poolCenter.x, P.poolCenter.z, 0xbfe9ff);
      }
    } else if (step === "synchro") {
      if (syn.phase === "go") ringAt(P.showRock.x, P.showRock.z, 0xffe08a);
    } else if (step === "hoop") {
      const h = zoo.hoop;
      ringAt(h.x, h.z, 0xffe08a);
      tmpV.set(h.x, h.y, h.z);
      fx.sparkle(tmpV, 0xfff2a8, 4);
    } else if (step === "show") {
      if (player.z <= 3 && !showEnded) ringAt(P.showRock.x, P.showRock.z, 0xffe08a);
    } else if (step === "dinner") {
      if (dinnerReady && !dinnerDone) ringAt(P.bowl.x, P.bowl.z, 0xffe08a);
    }
  }
  function idleHint() {
    const t = ctx.touch;
    if (step === "forage") ui.hint(t ? "Tap Sense, then walk where your bill points." : "Press E to sense, then walk where your bill points.", 3.4);
    else if (step === "tag") ui.hint(tagPhase === "catch" ? "Run into Pip to tag! Follow the pink ring." : "Keep running!", 3);
    else if (step === "bubbles") ui.hint(shellOn ? (t ? "Hold Jump to dive to the bottom of the pool." : "Hold Space to dive to the bottom of the pool.")
      : (t ? "Swim into the pool. Hold Jump to dive through the rings." : "Swim into the pool. Hold Space to dive through the rings."), 3.6);
    else if (step === "synchro") ui.hint(syn.phase === "go" ? "Walk to the glowing ring by the glass." : syn.phase === "turn" ? "Do Pip's tricks in the same order." : "Watch Pip...", 3);
    else if (step === "hoop") ui.hint(t ? "Run at the ring and tap Jump just before it." : "Run at the ring and press Space just before it.", 3.4);
    else if (step === "show") ui.hint(props.coins.lying > 0 ? "Walk over the coins to pick them up." : t ? "Tap the tricks near the glass. Mix them up!" : "Press 1 2 3 4 near the glass. Mix them up!", 3.4);
    else if (step === "dinner") ui.hint("The bowl is by the keeper door. Follow the ring.", 3);
  }

  // =================================================================================== per frame
  const TICK = { forage: tickForage, tag: tickTag, bubbles: tickBubbles, synchro: tickSynchro, hoop: tickHoop, show: tickShow, dinner: tickDinner };
  function update(dt, time) {
    now = time;
    if (step === "boot") return;
    friend.update(dt, time);
    crowd.update(dt, time);
    props.update(dt, time);
    // the waterfall gets louder as you come closer
    const fd = Math.hypot(player.x - zoo.fall.x, player.z - zoo.fall.z);
    const lv = Math.round(clamp(1 - fd / 16, 0, 1) * 20) / 20;
    if (lv !== fallLvl) { fallLvl = lv; audio.waterfall(lv); }
    keeperCol.on = keeper.visible;
    if (keeperCol.on) { keeperCol.x = keeper.x; keeperCol.z = keeper.z; }
    if (step === "done") return;
    tickTricks(dt);
    if (!live || cinema.playing) return;
    const f = TICK[step];
    if (f) f(dt);
    markT -= dt;
    if (markT <= 0) { markT = 0.85; mark(); }
    idleT += dt;
    if (idleT > 28) { idleT = 6; idleHint(); }
  }

  function onAction(name) {
    if (!live || step === "done") return false;
    if (name === "interact") {
      if (step === "forage") forageAction();
      else if (step === "dinner") dinnerAction();
    } else if (name.charCodeAt(0) === 116 && name.length === 6) { // "trick1".."trick4"
      const slot = name.charCodeAt(5) - 49;
      if (slot < 0 || slot > 3) return false;
      if (step === "synchro") synPress(slot);
      else if (step === "hoop" || step === "show") startTrick(slot);
    }
    return false;
  }
  function onSwim(on) {
    if (on && step === "bubbles" && !diveHint) {
      diveHint = true;
      ui.hint(ctx.touch ? "Hold the Jump button to dive." : "Hold Space to dive.", 3.4);
    }
  }
  function onDive(under, depth) {
    if (!under) tryWaterLeap(depth || 0);
  }

  // =================================================================================== debug seam
  const BEGIN = {
    forage: beginForage, tag: beginTag, bubbles: beginBubbles, synchro: beginSynchro, hoop: beginHoop,
    show: beginShow, dinner: beginDinner,
  };
  function skipTo(name) {
    const idx = STEPS.indexOf(name);
    if (idx < 0 || step === "boot" || finished) return false;
    if (name === "done") { win(); return true; }
    hardStop();
    // the day so far: earlier quests count as done
    done.forage = idx > 1; done.tag = idx > 2; done.bubbles = idx > 3; done.synchro = idx > 5; done.show = idx > 6; done.dinner = idx > 7;
    if (done.forage) forageN = 6;
    if (done.tag) tags = 3;
    if (done.bubbles) ringN = 8;
    props.coins.clear();
    tossed = collected = 0;
    crowd.stroll(idx >= 6 ? 8 : idx >= 4 ? 5 : 3);
    if (name === "wake") {
      forageN = 0; pipFound = 0; tags = 0; ringN = 0; hoops = 0; bites = 0; coins = 0;
      ui.showHud(false);
      cinema.fade("black", 0);
      stageIntro();
      playIntro();
      return true;
    }
    if (name === "poster") {
      if (coins < COIN_GOAL) coins = COIN_GOAL;
      setStep("poster");
      hud();
      putBoth(2.4, 5.9, 0.1, 3.7, 5.7, 0.1);
      beginPoster();
      return true;
    }
    BEGIN[name](true);
    return true;
  }
  function win() {
    if (finished || step === "boot") return;
    hardStop();
    step = "done";
    const g = gen;
    cinema.fade("black", 0.5, () => { if (g === gen) finish(); });
  }
  function state() {
    return {
      step, coins, live,
      yabbies: forageN, pipFound, tags, tagPhase, rings: ringN, shell: shellOn,
      synchroRound: syn.round, synchroPhase: syn.phase, hoops, bites,
      combo, watchers: gatherN, time: zoo ? zoo.time : "",
      seq: Array.prototype.slice.call(syn.seq, 0, syn.n), seqI: syn.i, ringNext: step === "bubbles" ? nextRing() : -1,
      ringsOn: Array.prototype.slice.call(ringOn), showT, tired, dinnerReady, lying: props ? props.coins.lying : 0,
      quests: { forage: done.forage, tag: done.tag, bubbles: done.bubbles, synchro: done.synchro, show: done.show, dinner: done.dinner },
    };
  }

  return {
    build, enter, start, update, exit, onAction, onSwim, onDive,
    state, skipTo, win, STEPS,
  };
}
