// level8.js - LEVEL 8 "THE SCREAM" (LEVELS2.md Part C, STORY2.md level 8).
//
//   PART 1  flashbacks: three playable memories of Pip in the zoo (the pool, the trick, the door).
//   PART 2  taken: waking in the jungle, the capture party, the struggle, carried ... THE SCREAM.
//   PART 3  the strange noise: audio-led tracking along six call points, Moss, the hidden tribe.
//
// Organised like level 5: every beat has a STARTER that first calls hardStop() (every shared actor, the HUD,
// the cinema and the loops back to nothing, behind black) and then builds its beat from scratch. The story
// flows from beat to beat through "begin..." functions that work from wherever the player is; skipTo(name)
// calls the matching starter, which sets the world up as a playthrough would have it and then calls the same
// "begin..." function - so the normal flow, a skipped cutscene and a debug jump all arrive in the same state.
import { createZoo } from "../zoo.js";
import { createFriend } from "../friend.js";
import { createCrowd } from "../crowd.js";
import { createJungle } from "../jungle.js";
import { createCombat } from "../combat.js";
import { createTribe } from "../tribe.js";

export const meta = { n: 8, title: "THE SCREAM" };

const STEPS = ["intro", "memory1", "memory2", "memory3", "wake", "taken", "carried", "scream", "glade", "trail", "meet", "follow", "reveal", "end", "done"];
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
const rnd = (a, b) => a + Math.random() * (b - a);

// memory 2: the four trick keys, and the three tricks Pip shows (slots)
const TRICKS = [
  { name: "spin", label: "Spin" },
  { name: "roll", label: "Roll" },
  { name: "wave", label: "Wave" },
  { name: "backflip", label: "Backflip" },
];
const TRICK_UI = TRICKS.map((t) => ({ label: t.label }));
const ROUNDS = [0, 2, 3];
const RING_N = 5;
// the capture party in carrying formation: metres along the path from the platypus (front carrier, rear
// carrier, the one walking ahead, the one walking behind)
const MAN_OFF = [0.85, -0.85, 3.3, -3.2];
const STRUGGLE_PRESSES = 12;
const CALL_EVERY = 4.5, PING_SECS = 1.2;

export function createLevel(ctx) {
  const { THREE, player, platypus, cam, ui, cinema, audio, fx } = ctx;

  // guarded calls into audio / fx / music: a missing sound or effect must never stop the story
  function A(name, a, b, c, d) { const f = audio[name]; return typeof f === "function" ? f.call(audio, a, b, c, d) : undefined; }
  function FX(name, a, b, c, d, e, g) { const f = fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e, g) : undefined; }
  function MU(name, a, b) { const m = ctx.music, f = m && m[name]; return typeof f === "function" ? f.call(m, a, b) : 0; }
  const key = (k, t) => (ctx.touch ? t : k);

  let zoo = null, friend = null, crowd = null, jungle = null, combat = null, tribe = null;
  let keeper = null, handler = null, moss = null, burra = null, nib = null;
  let Z = null, J = null;
  let net = null, cage = null;
  const prints = [null, null];
  let step = "boot";
  let gen = 0; // bumped by hardStop(): callbacks that outlive their beat compare it and do nothing
  let inJungle = false;

  // ---- scratch (nothing below allocates per frame) ----
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), lookV = new THREE.Vector3();
  const mouth = { x: 0, z: 0, yaw: 0 }, slideU = { x: 0, z: 0, len: 1 };
  const sleepAt = { x: 0, z: 0, yaw: 0 };
  const mossSpot = { x: 0, z: 0, yaw: 0 };
  const footAt = { x: 0, z: 0, yaw: 0 };
  const gotoO = { x: 0, z: 0, yaw: 0, run: true };
  const layerO = { birds: 1, insects: 1, wind: 1 };
  const ringPos = [];
  for (let i = 0; i < RING_N; i++) ringPos.push({ x: 0, z: 0, yaw: 0 });
  const manRoute = [];
  for (let i = 0; i < 4; i++) manRoute.push([{ x: 0, z: 0 }, { x: 0, z: 0 }]);
  const men = [null, null, null, null];
  const leadRoute = [];
  const REVEAL_AT = { x: 11.6, z: 62.4, yaw: 0 };
  const waterFn = (x, z) => { const w = ctx.world && ctx.world.waterAt ? ctx.world.waterAt(x, z) : -Infinity; return w > -1e6 ? w : null; };
  // The directed shots are composed for 16:9; on a tall screen the vertical field of view opens (as level 5).
  function F(v) {
    const a = ctx.camera.aspect || 1.78;
    if (a >= 1.3) return v;
    return Math.min(80, (2 * Math.atan((Math.tan((v * PI) / 360) * 1.3) / a) * 180) / PI);
  }
  const arr = (p) => [p.x, p.y, p.z];
  const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  const nearP = (p, r) => dist2(player.x, player.z, p.x, p.z) <= r;
  // run fn only if the beat that scheduled it is still the current one
  const live = (fn) => { const g = gen; return (a, b) => { if (g === gen) fn(a, b); }; };

  // =====================================================================================================
  // state
  // =====================================================================================================
  let memory = 0, memT = 0;
  // memory 1
  let ringI = 0, ringFxT = 0, ringBubT = 0, pipLeft = false, pipCallT = 0, autoRingT = 0, m1Done = false;
  // memory 2
  let round = 0, m2 = "", m2T = 0, copyT = 0, m2Slot = -1, m2Good = false, nuzzled = false;
  // memory 3
  const m3 = { slide: 0, prevD: 0, t: 0, phase: 0, pt: 0, waved: false, manT: 0 };
  // part 2
  let wakeT = 0, wakeX = 0, wakeZ = 0;
  const tk = { t: 0, phase: 0, gotoT: 0, netT: -1, netX: 0, netZ: 0, st: 0 };
  let struggle = 0, presses = 0, squeak = 0, wrig = 0, wrigClock = 0;
  let carriedT = 0, carryDur = 10, arrived = false, flashN = 0, musT = 0, carrying = false;
  let screamed = false, sx = 0, sz = 0, syaw = 0;
  const fall = { on: false, y: 0, vy: 0 };
  let lookI = 0, lookT = 0, leafT = 0;
  // part 3
  let gladeT = 0, trailI = -1, callT = 0, idleT = 0, pingT = 0, pingX = 0, pingZ = 0, pingK = 0, pendT = -1, pendBoost = 0, lookOffT = 0;
  let mossState = "unseen", mossHid = false, mossSeg = 0, dryT = -1, crossHint = false, echoHint = false;
  let meetPhase = "", greeted = false, greetT = 0, mossCallT = 0, bowed = false;
  let camp = false, nibSat = false, cheered = false;
  let mark = null, mark2 = null, objText = "";

  function setObj(text, hint) { if (text === objText) return; objText = text; ui.setObjective(text, hint); }
  function setMark(x, y, z, color) {
    if (mark && mark.set) { mark.set(x, y, z); return; }
    mark = FX("beacon", x, y, z, color === undefined ? 0xffe08a : color) || null;
  }
  function dropMark(h) { if (h && h.remove) { try { h.remove(); } catch (e) { /* the pool was already cleared */ } } }
  function clearMarks() { dropMark(mark); dropMark(mark2); mark = mark2 = null; }
  function gy(x, z) { return ctx.floorAt(x, z); }

  // =====================================================================================================
  // build / worlds
  // =====================================================================================================
  function makePrints() {
    let tex = null;
    if (typeof document !== "undefined") {
      const cv = document.createElement("canvas");
      cv.width = 128; cv.height = 256;
      const g = cv.getContext("2d");
      if (g) {
        const foot = (cx, cy, rot, s) => {
          g.save(); g.translate(cx, cy); g.rotate(rot); g.scale(s, s);
          g.fillStyle = "rgba(34,22,12,0.85)";
          g.beginPath(); g.ellipse(0, 6, 7, 9, 0, 0, TAU); g.fill();
          // the web: a fan in front of the pad, then five toes with claw dots
          g.fillStyle = "rgba(34,22,12,0.5)";
          g.beginPath(); g.moveTo(-7, 2); g.lineTo(-15, -12); g.quadraticCurveTo(0, -24, 15, -12); g.lineTo(7, 2); g.closePath(); g.fill();
          g.strokeStyle = "rgba(30,18,10,0.9)"; g.lineWidth = 2.6; g.lineCap = "round";
          for (let i = -2; i <= 2; i++) {
            const a = i * 0.36;
            g.beginPath(); g.moveTo(Math.sin(a) * 5, -Math.cos(a) * 2); g.lineTo(Math.sin(a) * 19, -Math.cos(a) * 19); g.stroke();
            g.beginPath(); g.arc(Math.sin(a) * 22.5, -Math.cos(a) * 22.5, 1.4, 0, TAU); g.fill();
          }
          g.restore();
        };
        for (let i = 0; i < 5; i++) {
          const y = 232 - i * 46;
          foot(40 + (i % 2) * 6, y, -0.28, 0.82);
          foot(88 - (i % 2) * 6, y - 22, 0.28, 0.82);
        }
        tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
      }
    }
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: tex ? 0xffffff : 0x2a1c10, transparent: true, opacity: tex ? 0.9 : 0, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.7).rotateX(-PI / 2), mat);
      mesh.name = "level8-prints" + i;
      mesh.visible = false;
      mesh.renderOrder = 2;
      prints[i] = mesh;
    }
  }
  // lay a prints decal on the ground at a trail point, toes toward (tx, tz)
  function layPrints(i, x, z, tx, tz) {
    const m = prints[i];
    if (!m) return;
    const h = jungle.heightAt(x, z), e = 0.5;
    const dx = (jungle.heightAt(x + e, z) - jungle.heightAt(x - e, z)) / (2 * e), dz = (jungle.heightAt(x, z + e) - jungle.heightAt(x, z - e)) / (2 * e);
    m.position.set(x, h + 0.05, z);
    m.rotation.order = "YXZ";
    // the plane's -Z edge is the top of the picture (the toes): turn it toward the target
    m.rotation.set(-Math.atan(clamp(dz, -0.6, 0.6)) * 0.9, Math.atan2(-(tx - x), -(tz - z)), 0);
    void dx;
    m.material.opacity = m.material.map ? 0.9 : 0;
    m.visible = true;
  }

  function build() {
    zoo = ctx.shared("zoo", () => createZoo(ctx));
    friend = ctx.shared("friend", () => createFriend(ctx));
    crowd = ctx.shared("crowd", () => createCrowd(ctx));
    jungle = ctx.shared("jungle", () => createJungle(ctx));
    combat = ctx.shared("combat", () => createCombat(ctx));
    tribe = ctx.shared("tribe", () => createTribe(ctx));
    keeper = crowd.staff[0];
    handler = crowd.staff[1];
    Z = zoo.P;
    J = jungle.P;
    moss = tribe.members.moss; burra = tribe.members.burra; nib = tribe.members.nib;
    if (typeof tribe.warm === "function") tribe.warm(); // the full models and the village crowd, behind the title card
    {
      // just outside the burrow mouth: where Pip sleeps in the third memory, and the line it slides along
      const ne = Z.nest, ax = Math.sin(ne.yaw), az = Math.cos(ne.yaw);
      mouth.x = ne.x + ax * 2.3; mouth.z = ne.z + az * 2.3; mouth.yaw = ne.yaw;
      const dx = Z.doorIn.x - 0.9 - mouth.x, dz = Z.doorIn.z - mouth.z, l = Math.hypot(dx, dz) || 1;
      slideU.x = dx / l; slideU.z = dz / l; slideU.len = l;
    }
    // the net that drops over the player (a wire dome; one draw call, only visible for a few seconds)
    net = new THREE.Mesh(new THREE.SphereGeometry(0.82, 12, 6, 0, TAU, 0, PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xcbbd94, wireframe: true, transparent: true, opacity: 0.85 }));
    net.name = "level8-net";
    net.visible = false;
    // the cage the man carries in the third memory (dark wire box in his hand)
    cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.46, 0.34, 0.62, 3, 1, 4)),
      new THREE.LineBasicMaterial({ color: 0x1a1c20 }));
    cage.name = "level8-cage";
    cage.position.set(0, -0.26, 0.05);
    makePrints();
    leadRoute.length = 0;
    leadRoute.push(J.leadPath && J.leadPath[1] ? J.leadPath[1] : { x: 7.5, z: 55 }, J.campGate);
    REVEAL_AT.yaw = Math.atan2(J.camp.x - REVEAL_AT.x, J.camp.z - REVEAL_AT.z);
    if (ctx.debug) ctx.debug.level8 = { zoo, jungle, combat, tribe, friend, men, ringPos, mouth };
  }

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
    ui.setObjective(null); objText = "";
    ui.setAction(null); ui.setTricks(null); ui.setCharge(null); ui.setPing(null);
    ctx.setSpeaker(null);
    ctx.abilities.cancel();
    ctx.abilities.buttons({ jump: true });
    clearMarks();
    // loops
    A("zooAmbience", false); A("waterfall", 0); A("snore", false);
    A("jungleAmbience", false); A("tribeChatter", 0); A("screamCharge", 0); A("muffle", 0, 0.2);
    MU("duck", 0, 0.1);
    // shared actors
    friend.reset();
    friend.lookAt(null);
    crowd.reset();
    if (cage.parent) cage.parent.remove(cage);
    combat.reset();
    combat.frozen = false;
    combat.bodyTTL = 12;
    tribeShadows(true);
    tribe.reset();
    platypus.reset();
    platypus.lookAt(null);
    if (typeof platypus.screamCharge === "function") platypus.screamCharge(0);
    net.visible = false;
    for (let i = 0; i < 4; i++) men[i] = null;
    // the player
    player.scripted = false; player.hidden = false; player.enabled = false; player.carrying = false;
    player.maxSpeed = 3; player.lock = 0; player.face = null; player.canJump = player.canDive = true;
    player.swimming = player.diving = false; player.pitch = player.roll = 0; player.speed = 0; player.vy = 0; player.grounded = true;
    player.stop();
    cam.manualT = 0;
    // flags of every beat
    memory = 0; memT = 0; m1Done = false; m2 = ""; nuzzled = false; m3.phase = 0;
    tk.phase = 0; tk.netT = -1; carrying = false; arrived = false; fall.on = false;
    struggle = 0; presses = 0; squeak = 0; wrig = 0;
    pingT = 0; pendT = -1; lookOffT = 0; dryT = -1; mossHid = false;
    meetPhase = ""; greeted = false; bowed = false; nibSat = false; cheered = false;
  }

  function toZoo(time) {
    zoo.reset();
    zoo.group.add(friend.group, crowd.group);
    friend.setWorld(zoo);
    crowd.setLane(zoo.walkway, zoo.glass.z);
    ctx.setWorld(zoo);
    zoo.setTime(time, 0);
    FX("setGround", zoo.heightAt, waterFn);
    FX("setGlint", 0xfff2dc);
    inJungle = false;
  }
  function toJungle(time) {
    ctx.setWorld(jungle);
    jungle.reset();
    jungle.group.add(combat.group, tribe.group, net, prints[0], prints[1]);
    combat.setWorld(jungle);
    tribe.setWorld(jungle);
    combat.showCones(false);       // the capture party is scripted: no vision cones
    jungle.setZone("camp", false); // the hidden camp stays hidden until the reveal
    jungle.setTime(time, 0);
    if (typeof jungle.refreshFx === "function") jungle.refreshFx();
    FX("setGround", jungle.heightAt, waterFn);
    FX("setGlint", 0xfff2dc);
    prints[0].visible = prints[1].visible = false;
    inJungle = true;
    camp = false;
  }
  // into the jungle for a beat of part 2 or 3 (behind black)
  function setupJungle(time, sound) {
    hardStop();
    toJungle(time);
    jungle.wreck.setSmoke(true);
    A("jungleAmbience", true, sound || "day");
    layers(1, 1, 1, 0.3);
    layPrints(0, J.trail[0].x, J.trail[0].z, J.trail[1].x, J.trail[1].z);
    layPrints(1, J.trail[2].x + 0.6, J.trail[2].z + 0.5, J.trail[3].x, J.trail[3].z);
  }
  function layers(birds, insects, wind, seconds) {
    layerO.birds = birds; layerO.insects = insects; layerO.wind = wind;
    A("jungleLayers", layerO, seconds);
  }

  // =====================================================================================================
  // PART 1 - the memories
  // =====================================================================================================
  function startIntro() {
    hardStop();
    toZoo("morning");
    step = "intro";
    start();
  }

  // Title card. Then black, the sound of leaves, a music box ... and the first memory opens.
  function start() {
    const g = gen;
    cinema.titleCard({ kicker: "LEVEL 8", title: meta.title }, () => {
      if (g !== gen || step !== "intro") return;
      A("vines");
      MU("play", "flashback", { intensity: 0, at: "now" });
      MU("motif", "pip", { at: "now" });
      cinema.after(1.3, () => { if (g === gen && step === "intro") A("vines"); });
      cinema.after(1.6, () => { if (g === gen && step === "intro") cinema.caption("I remember...", 2.4, { narr: true }); });
      cinema.after(3.4, () => { if (g === gen && step === "intro") startMemory(1, true); });
    });
  }

  function startMemory(n, fromBlack) {
    hardStop();
    toZoo(n === 1 ? "morning" : n === 2 ? "evening" : "night");
    memory = n; memT = 0;
    step = "memory" + n;
    // a memory: seen through half-open, warm, soft eyes; the world a little muffled
    cinema.eye.set(0.85, 1.5, 1.15);
    cinema.tint("warm", 0.5);
    MU("play", "flashback", { intensity: n === 1 ? 0 : n === 2 ? 0.3 : 0.5, at: "now" });
    A("zooAmbience", true, n === 3 ? "night" : "day");
    A("muffle", 0.35, 0.5);
    ui.showHud(true);
    if (n === 1) setupM1(); else if (n === 2) setupM2(); else setupM3();
    if (fromBlack) cinema.fade("clear", 1.6);
    else { cinema.fade("white", 0); cinema.fade("clear", 0.9); }
  }

  // ---- memory 1: the pool ----
  function poolDepth(x, z) {
    if (typeof zoo.depthAt === "function") return zoo.depthAt(x, z);
    const w = zoo.waterAt(x, z);
    return w > -1e6 ? w - zoo.heightAt(x, z) : 0;
  }
  function setupM1() {
    const pc = Z.poolCenter, sb = Z.sandbank;
    let px = sb.x, pz = sb.z;
    for (let i = 0; i < RING_N; i++) {
      const a = -0.5 + (i * TAU) / RING_N, r = ringPos[i];
      let k = 1;
      do { r.x = pc.x + Math.cos(a) * 2.9 * k; r.z = pc.z + Math.sin(a) * 2.0 * k; k *= 0.72; } while (poolDepth(r.x, r.z) < 0.35 && k > 0.15);
      r.yaw = Math.atan2(r.x - px, r.z - pz); // the hoop faces the way you swim into it
      px = r.x; pz = r.z;
    }
    ringI = 0; ringFxT = 0; ringBubT = 0; pipLeft = false; pipCallT = 3; autoRingT = 0; m1Done = false;
    const yaw = Math.atan2(pc.x - sb.x, pc.z - sb.z);
    player.teleport(sb.x, sb.z, yaw);
    player.canDive = false; // the memory stays at the surface (and the muffle shares the underwater filter)
    cam.yaw = yaw; cam.manualT = 1.5;
    friend.place(ringPos[0].x, ringPos[0].z, Math.atan2(sb.x - ringPos[0].x, sb.z - ringPos[0].z));
    friend.do("idle");
    friend.lookAt(platypus.group);
    setObj("Swim with Pip  0 / " + RING_N, "swim through the bubble rings");
    ui.hint(key("A memory... Swim through Pip's bubble rings. (WASD)", "A memory... Swim through Pip's bubble rings."), 4.5);
    player.enabled = true;
  }
  function passRing() {
    const r = ringPos[ringI];
    v1.set(r.x, 0.2, r.z);
    FX("sparkle", v1, 0xbfefff, 16);
    FX("splash", r.x, 0, r.z, 0.35);
    ringI++;
    pipLeft = false; ringBubT = 0; pipCallT = 4;
    MU("setIntensity", (ringI / RING_N) * 0.9, 1.2);
    setObj("Swim with Pip  " + ringI + " / " + RING_N, "swim through the bubble rings");
    if (ringI >= RING_N) {
      // the fifth: white, and the memory is gone
      m1Done = true;
      ui.objectiveDone();
      player.enabled = false;
      A("friendship");
      friend.emote("happy");
      cinema.fade("white", 0.4, live(() => startMemory(2)));
      return;
    }
    A("questDone");
    if (!friend.busy) friend.emote("happy");
  }
  function updateM1(dt) {
    if (m1Done) return;
    memT += dt;
    const r = ringPos[ringI];
    // the hoop: a ring of bubbles renewed before it fades, and sparkles running round its rim
    ringBubT -= dt;
    if (ringBubT <= 0) { ringBubT = 5.2; FX("bubbleRing", r.x, 0.1, r.z, r.yaw, 0.62); }
    ringFxT -= dt;
    if (ringFxT <= 0) {
      ringFxT = 0.2;
      const a = Math.random() * TAU, c = Math.cos(a) * 0.62;
      v1.set(r.x + Math.cos(r.yaw) * c, 0.14 + Math.abs(Math.sin(a)) * 0.62, r.z - Math.sin(r.yaw) * c);
      FX("sparkle", v1, 0xbfefff, 2);
    }
    const d = dist2(player.x, player.z, r.x, r.z);
    // Pip floats in the hoop until you come, then darts on to where the next one will be
    if (!pipLeft && d < 3.4) {
      pipLeft = true;
      const n = ringPos[ringI + 1];
      if (n) { gotoO.x = n.x; gotoO.z = n.z; gotoO.yaw = Math.atan2(r.x - n.x, r.z - n.z); gotoO.run = true; friend.do("goto", gotoO); }
      else friend.do("follow");
      A("friendChirp", "giggle", 0.8, 0);
    }
    pipCallT -= dt;
    if (pipCallT <= 0 && !friend.busy) { pipCallT = 4.5; friend.emote("call"); }
    // forgiving: the hoop grows if it takes long, and after a long while the memory plays itself out
    if (d < (memT > 45 ? 2.4 : 1.05)) passRing();
    else if (memT > 80) { autoRingT -= dt; if (autoRingT <= 0) { autoRingT = 1.5; passRing(); } }
  }

  // ---- memory 2: the trick ----
  function setupM2() {
    const sr = Z.showRock, sf = Z.showFriend;
    player.teleport(sr.x, sr.z, Math.atan2(sf.x - sr.x, sf.z - sr.z));
    friend.place(sf.x, sf.z, Math.atan2(sr.x - sf.x, sr.z - sf.z));
    friend.do("idle");
    friend.lookAt(platypus.group);
    // over the shoulder: Pip near the middle of the frame, the player's back and tail in the corner
    cam.yaw = Math.atan2(sf.x - sr.x, sf.z - sr.z) - 0.55; cam.pitch = 0.32; cam.wantDist = 2.9; cam.manualT = 1e9;
    round = 0; m2 = "pre"; m2T = 1.6; copyT = 0; m2Slot = -1; nuzzled = false;
    ui.setTricks(TRICK_UI);
    setObj("Copy Pip's trick  0 / 3", "watch Pip, then do the same");
    ui.hint("Another memory... Pip has a new trick to show you.", 3.6);
    player.enabled = false; // the two of them stay on the show rock
  }
  function m2Show() {
    const want = ROUNDS[round];
    m2 = "show"; m2T = 3.2;
    ui.setTrickState(want, { want: false });
    friend.trick(TRICKS[want].name);
    A("friendChirp", "happy", 0.8, 0);
  }
  function m2Copy() {
    const want = ROUNDS[round];
    m2 = "copy"; copyT = 0;
    ui.setTrickState(want, { want: true });
    ui.hint(key("Your turn! Press " + (want + 1) + " for " + TRICKS[want].label + ".", "Your turn! Tap " + TRICKS[want].label + "."), 3.2);
  }
  function m2Try(slot) {
    if (step !== "memory2") return;
    if (m2 === "show" || m2 === "pre") { ui.hint("Watch Pip first!", 1.4); return; }
    if (m2 !== "copy" || platypus.acting) return;
    const t = TRICKS[slot];
    if (!t) return;
    const info = platypus.tricks && platypus.tricks[t.name];
    const d = platypus.trick(t.name) || (info ? info.dur : 1);
    player.lock = d;
    A("trickWhoosh", slot);
    m2 = "doing"; m2T = d; m2Slot = slot; m2Good = slot === ROUNDS[round];
  }
  function m2Scored() {
    const want = ROUNDS[round];
    ui.flashTrick(m2Slot, m2Good);
    if (m2Good) {
      A("trickLand", true);
      friend.emote("happy");
      ui.setTrickState(want, { want: false });
      round++;
      MU("setIntensity", 0.3 + 0.2 * round, 1.2);
      setObj("Copy Pip's trick  " + round + " / 3", "watch Pip, then do the same");
      if (round >= 3) m2Nuzzle(); else { m2 = "pre"; m2T = 1.3; }
    } else {
      // wrong one: Pip only giggles, and shows it again
      A("friendChirp", "giggle", 1, 0);
      friend.emote("laugh");
      ui.hint("Pip giggles. Watch again!", 1.8);
      m2 = "pre"; m2T = 1.4;
    }
  }
  function m2Nuzzle() {
    if (m2 === "nuzzle" || m2 === "freeze") return;
    ui.setTricks(null);
    ui.objectiveDone();
    m2 = "nuzzle"; m2T = 5.5; nuzzled = false;
    friend.do("nuzzle");
  }
  function m2NuzzleNow() {
    if (nuzzled) return;
    nuzzled = true;
    const d = platypus.nuzzle() || 1.4;
    player.lock = d;
    A("nuzzle");
    platypus.billTip.getWorldPosition(v1); v1.y += 0.1;
    FX("hearts", v1, 4);
    m2T = Math.min(m2T, 1.25);
  }
  function m2Freeze() {
    // the image holds for a second, and whites out
    m2 = "freeze";
    ctx.setTimeScale(0.05, 0.25);
    cinema.fade("white", 1.2, live(() => startMemory(3)));
  }
  function updateM2(dt) {
    memT += dt;
    if (m2 === "pre") { m2T -= dt; if (m2T <= 0) m2Show(); }
    else if (m2 === "show") { m2T -= dt; if (m2T <= 0) m2Copy(); }
    else if (m2 === "copy") {
      copyT += dt;
      if (memT > 80) { m2Nuzzle(); return; }           // the memory plays itself out
      if (copyT > 8) { ui.hint("Pip shows you again.", 1.6); m2Show(); }
    } else if (m2 === "doing") { m2T -= dt; if (m2T <= 0) m2Scored(); }
    else if (m2 === "nuzzle") {
      m2T -= dt;
      if (!nuzzled && (friend.distTo(player.x, player.z) < 0.95 || m2T < 2.2)) m2NuzzleNow();
      if (m2T <= 0) m2Freeze();
    }
  }

  // ---- memory 3: the door ----
  function setupM3() {
    const sb = Z.sandbank;
    const sxp = sb.x + 1.6, szp = sb.z - 1.2;
    const yaw = Math.atan2(mouth.x - sxp, mouth.z - szp);
    player.teleport(sxp, szp, yaw);
    cam.yaw = yaw; cam.manualT = 1.5;
    sleepAt.x = mouth.x; sleepAt.z = mouth.z; sleepAt.yaw = mouth.yaw + 0.4;
    friend.place(mouth.x, mouth.z, sleepAt.yaw);
    friend.do("sleep", { at: sleepAt });
    m3.slide = 0; m3.t = 0; m3.phase = 0; m3.pt = 0; m3.waved = false; m3.manT = 0;
    m3.prevD = dist2(sxp, szp, mouth.x, mouth.z);
    zoo.door.open(false);
    setMark(mouth.x, gy(mouth.x, mouth.z), mouth.z, 0xffe9c0);
    setObj("Stay close to Pip", "walk to Pip");
    ui.hint("The last memory... Pip is asleep by the burrow.", 3.6);
    player.enabled = true;
  }
  function m3End() {
    if (m3.phase >= 3) return;
    m3.phase = 3;
    player.enabled = false;
    player.stop();
    handler.reach({ x: friend.x, y: friend.y + 0.15, z: friend.z });
    A("friendChirp", "scared", 1, 0);
    // hands close over the view
    cinema.eye.close({ duration: 0.6, onDone: live(() => {
      cinema.fade("black", 0);
      clearMarks();
      cinema.caption("Pip...", 2.6, { narr: true });
      cinema.after(3.2, live(() => startWake()));
    }) });
  }
  function updateM3(dt) {
    memT += dt;
    if (m3.phase >= 3) return;
    m3.t += dt; m3.pt += dt;
    // the nearer you come, the further the nest slides away - toward the door
    const d = dist2(player.x, player.z, friend.x, friend.z);
    const adv = m3.prevD - d;
    let s = m3.slide;
    if (adv > 0) s += adv * 0.8;
    if (m3.phase >= 1) s += dt * 0.28;
    s = Math.min(slideU.len, s);
    if (s - m3.slide > 1e-4) {
      m3.slide = s;
      const px = mouth.x + slideU.x * s, pz = mouth.z + slideU.z * s;
      if (m3.phase < 2 || !friend.busy) friend.place(px, pz);
      if (mark && mark.set) mark.set(px, gy(px, pz), pz);
    }
    m3.prevD = dist2(player.x, player.z, friend.x, friend.z);
    const k = m3.slide / slideU.len;
    player.maxSpeed = 3 - 1.7 * k; // heavy, the way running is in dreams
    if (m3.phase === 0 && (m3.t > 5 || m3.slide > 1.2)) {
      // the door. A man with a cage; the keeper behind him
      m3.phase = 1; m3.pt = 0;
      const di = Z.doorIn, dout = Z.doorOut;
      zoo.door.open(true);
      handler.place(dout.x, dout.z, -PI / 2);
      handler.handAnchor.add(cage);
      handler.walkTo(di.x - 0.5, di.z, null, false);
      keeper.place(dout.x + 1.0, dout.z + 0.6, -PI / 2);
      keeper.hold(false);
      keeper.walkTo(di.x + 0.3, di.z + 0.9, null, false);
      MU("play", "sorrow", { at: "now" });
      MU("motif", "pipSad");
      cinema.tint("sad", 0.55);
    } else if (m3.phase === 1 && (k > 0.5 || m3.pt > 8)) {
      // Pip wakes, frightened
      m3.phase = 2; m3.pt = 0;
      friend.do("idle");
      friend.lookAt(platypus.group);
      friend.emote("scared");
      handler.lookAt(friend);
      setObj("Stay close to Pip", "run!");
    } else if (m3.phase === 2) {
      if (!m3.waved && m3.pt > 1.6 && !friend.busy) { m3.waved = true; friend.trick("wave"); A("friendChirp", "call", 1, 0); } // reaches a paw
      m3.manT -= dt;
      if (m3.manT <= 0) { m3.manT = 0.5; handler.walkTo(friend.x + slideU.x * 0.95, friend.z + slideU.z * 0.95, null, false); }
      if (k >= 0.97 || m3.pt > 7 || d < 1.2) m3End();
    }
    if (m3.t > 26) m3End();
  }

  // =====================================================================================================
  // PART 2 - taken
  // =====================================================================================================
  function startWake() {
    setupJungle("day", "day");
    step = "wake";
    MU("stop", 2);
    const w = J.wake, c = J.camCanopy;
    player.teleport(w.x, w.z, w.yaw || 0);
    platypus.pose("still", 0);
    player.hidden = true;
    cinema.eye.shut("day");
    const g = gen;
    const y = gy(w.x, w.z);
    cinema.play([
      { shot: { pos: arr(c.pos), look: arr(c.look), fov: 62, dur: 0 } },
      { wait: 1.2 },
      { call: () => A("eyeOpen") },
      { fade: "clear", dur: 0.6 },
      { eye: "open", duration: 6, blinks: 2, tint: "day" },
      // out of its eyes: the platypus on its side among the broken branches, the wreck smoking behind
      { call: () => { player.hidden = false; platypus.pose("limp", 1.2); } },
      { shot: { pos: [w.x + 1.9, y + 0.55, w.z + 2.3], look: platypus.group, lookY: 0.15, fov: F(38), to: { pos: [w.x + 1.4, y + 0.42, w.z + 1.9] }, dur: 3.2 }, hold: false },
      { wait: 3.2 },
    ], { skippable: true, onSkip() { player.hidden = false; }, onDone: () => { if (g === gen) beginWake(); } });
  }
  function beginWake() {
    step = "wake";
    cinema.eye.clear();
    player.hidden = false;
    platypus.pose("limp", 0.4);
    player.maxSpeed = 1.2; player.canJump = false;
    wakeT = 0; wakeX = player.x; wakeZ = player.z;
    cam.yaw = 0; cam.manualT = 1.5;
    ui.showHud(true);
    setObj("Get up", key("WASD to move", "use the stick"));
    player.enabled = true;
  }
  function updateWake(dt) {
    if (cinema.playing) return;
    wakeT += dt;
    if (wakeT > 6 || dist2(player.x, player.z, wakeX, wakeZ) > 3) beginTaken();
  }

  function startTaken() {
    setupJungle("day", "day");
    MU("stop", 0.5);
    const w = J.wake;
    player.teleport(w.x + 0.6, w.z + 2.0, 0.2);
    cinema.fade("clear", 0.8);
    beginWake();
    beginTaken();
  }
  // voices; four of them step out of the ferns on all sides
  function beginTaken() {
    step = "taken";
    tk.t = 0; tk.phase = 0; tk.gotoT = 0; tk.netT = -1; tk.st = 0;
    struggle = 0; presses = 0;
    A("guardVoice", "radio", 0, 0.5);
    MU("stinger", "danger");
    ui.objectiveDone();
    setObj("Something is coming...", "");
    platypus.pose("scared", 0.5);
    player.maxSpeed = 1.2; player.canJump = false;
    ctx.abilities.buttons({ sting: true });
    for (let i = 0; i < 4; i++) {
      const a = PI / 4 + (i * PI) / 2;
      const x = player.x + Math.sin(a) * 5.6, z = player.z + Math.cos(a) * 5.6;
      men[i] = combat.spawn("handler", x, z, { yaw: Math.atan2(player.x - x, player.z - z), passive: true });
    }
    ctx.after(0.9, live(() => A("guardVoice", "hey", 0, 0.2)));
  }
  function dropNet() {
    tk.phase = 1; tk.netT = 0; tk.st = 0;
    tk.netX = player.x; tk.netZ = player.z;
    player.enabled = false;
    player.stop();
    net.visible = true;
    A("canvasFlap", 0.9);
    A("guardVoice", "order", 0, 0);
    setObj("Struggle!", key("mash J", "tap fast"));
    ui.hint(key("Struggle! (mash J)", "Struggle! Tap fast!"), 3);
    ui.setAction("Struggle");
    ui.setCharge(0, "STRUGGLE");
    for (let i = 0; i < 4; i++) {
      const e = men[i];
      if (!e || !e.alive) continue;
      const a = PI / 4 + (i * PI) / 2;
      e.goto(player.x + Math.sin(a) * 1.45, player.z + Math.cos(a) * 1.45, false);
    }
  }
  function struggleTap() {
    presses++;
    wrig = 1;
    if (step === "taken") {
      if (tk.phase !== 1) return;
      struggle = Math.min(0.9, struggle + 0.085);
      platypus.hurt();
      A("friendChirp", "scared", 0.5 + 0.3 * struggle, 0);
      FX("footDust", tk.netX + rnd(-0.4, 0.4), gy(tk.netX, tk.netZ) + 0.03, tk.netZ + rnd(-0.4, 0.4), 0.4);
    } else if (step === "carried") {
      squeak = 0.25 + 0.75 * Math.min(1, presses / STRUGGLE_PRESSES);
    }
  }
  function updateTaken(dt) {
    tk.t += dt;
    if (tk.phase === 0) {
      // they close in from every side; a limping platypus cannot get out of the ring
      tk.gotoT -= dt;
      let close = 0;
      for (let i = 0; i < 4; i++) {
        const e = men[i];
        if (!e || !e.alive) continue;
        if (dist2(e.x, e.z, player.x, player.z) < 2.3) close++;
      }
      if (tk.gotoT <= 0) {
        tk.gotoT = 0.4;
        for (let i = 0; i < 4; i++) {
          const e = men[i];
          if (!e || !e.alive) continue;
          const a = PI / 4 + (i * PI) / 2;
          const d = dist2(e.x, e.z, player.x, player.z);
          e.goto(player.x + Math.sin(a) * 1.5, player.z + Math.cos(a) * 1.5, d > 4.2);
        }
        const e = men[lookI++ & 3];
        if (e) { lookV.set(e.x, e.y + 1.4, e.z); platypus.lookAt(lookV); }
      }
      if (tk.t > 0.8 && (close >= 3 || tk.t > 6.5)) dropNet();
      return;
    }
    // the net: it falls, and holds
    if (tk.netT >= 0) {
      tk.netT += dt;
      const k = clamp(tk.netT / 0.35, 0, 1), g0 = gy(tk.netX, tk.netZ);
      net.position.set(tk.netX, g0 + (1 - k * k) * 3.2, tk.netZ);
      const s = 1 + 0.06 * Math.sin(wrigClock * 30) * wrig;
      net.scale.set(s, 1 - 0.12 * wrig, 2 - s);
      if (tk.netT > 0.35 && tk.netT - dt <= 0.35) { FX("footDust", tk.netX, g0 + 0.03, tk.netZ, 1.2); A("step", "leaves", 1, 0); platypus.lookAt(null); }
    }
    // the struggle cannot be won - the drain grows - but the effort is the point
    tk.st += dt;
    struggle = Math.max(0, struggle - (0.22 + 0.16 * tk.st) * dt);
    ui.setCharge(struggle, "STRUGGLE");
    if (tk.st >= 5) {
      struggle = 0;
      ui.setCharge(0, "STRUGGLE");
      cinema.shake(0.35, 0.3);
      beginCarried(false);
    }
  }

  // put the four in carrying formation at (x, z), heading along the capture path
  function formUp(x, z, atEnd) {
    const c1 = J.carryPath[1], c2 = J.carryPath[2];
    let ux = c1.x - x, uz = c1.z - z;
    const l1 = Math.hypot(ux, uz) || 1;
    ux /= l1; uz /= l1;
    let wx = c2.x - c1.x, wz = c2.z - c1.z;
    const l2 = Math.hypot(wx, wz) || 1;
    wx /= l2; wz /= l2;
    const hx = atEnd ? wx : ux, hz = atEnd ? wz : uz, yaw = Math.atan2(hx, hz);
    for (let i = 0; i < 4; i++) {
      const o = MAN_OFF[i];
      let e = men[i];
      if (!e || !e.alive) e = men[i] = combat.spawn("handler", x + hx * o, z + hz * o, { yaw, passive: true });
      e.gotoOn = false;
      e.x = x + hx * o; e.z = z + hz * o; e.yaw = yaw;
      if (typeof e.face === "function") e.face(yaw);
      e.carry(i < 2);
      const R = manRoute[i];
      R[0].x = c1.x + ux * o; R[0].z = c1.z + uz * o;
      R[1].x = c2.x + wx * o; R[1].z = c2.z + wz * o;
      if (atEnd) e.setRoute(null, false); else e.setRoute(R, false);
    }
    carryDur = atEnd ? 0.01 : (l1 + l2) / 1.25 + 0.4;
    syaw = yaw;
  }
  function startCarried() {
    setupJungle("day", "day");
    const p = J.carryPath[0];
    player.teleport(p.x, p.z, 0.3);
    cinema.fade("clear", 0.6);
    beginCarried(true);
  }
  // lifted on the pole between two of them, one ahead, one behind
  function beginCarried(hard) {
    step = "carried";
    const x = player.x, z = player.z;
    if (!hard) { cinema.fade("white", 0); cinema.after(0.1, live(() => cinema.fade("clear", 0.25))); }
    net.visible = false; tk.netT = -1;
    formUp(x, z, false);
    carrying = true; carriedT = 0; arrived = false; flashN = 0; musT = 0;
    presses = 0; struggle = 0; squeak = 0; wrig = 0;
    player.enabled = false; player.scripted = true; player.speed = 0; player.grounded = true;
    player.stop();
    platypus.lookAt(null);
    platypus.pose("struggle", 0.15);
    cam.wantDist = 2.7; cam.pitch = 0.17; cam.yaw = syaw; cam.manualT = 0;
    ui.showHud(true);
    ctx.abilities.buttons({ sting: true });
    setObj("Struggle!", key("mash J", "tap fast"));
    ui.setAction("Struggle");
    ui.setCharge(0, "STRUGGLE");
    MU("play", "stealth", { intensity: 0.5 });
    A("pickup");
    A("guardVoice", "laugh", 0, 0.1);
    placeCarried(0);
  }
  function placeCarried(dt) {
    const a = men[0], b = men[1];
    if (!a || !b) return;
    const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
    a.carryAnchor.getWorldPosition(v1);
    b.carryAnchor.getWorldPosition(v2);
    v1.lerp(v2, 0.5);
    // until combat has drawn a carrying frame the anchors are stale: hang between the two shoulders instead
    if (Math.hypot(v1.x - mx, v1.z - mz) > 1.2 || !(v1.y > a.y + 0.3)) v1.set(mx, (a.y + b.y) / 2 + 0.95, mz);
    wrig *= Math.exp(-5 * dt);
    wrigClock += dt;
    const g = platypus.group;
    g.position.copy(v1);
    g.rotation.set(Math.cos(wrigClock * 31) * 0.22 * wrig, a.yaw + Math.sin(wrigClock * 23) * 0.3 * wrig, Math.sin(wrigClock * 38) * 0.4 * wrig);
    player.x = v1.x; player.y = v1.y; player.z = v1.z; player.yaw = a.yaw;
    syaw = a.yaw;
  }
  function memoryFlash(n) {
    // a white flash of memory: Pip's voice, the music box
    cinema.fade("white", 0);
    cinema.after(0.07, live(() => cinema.fade("clear", 0.22)));
    A("friendChirp", n === 2 ? "scared" : "call", 0.7, 0);
    MU("motif", n === 2 ? "pipSad" : "pip", { at: "now", gain: 0.7 });
  }
  function updateCarried(dt) {
    carriedT += dt;
    placeCarried(dt);
    // the camera swings behind the party unless the player is orbiting
    if (cam.manualT <= 0) cam.yaw += Math.sin(wrap(syaw - cam.yaw)) * 1.4 * dt;
    const prog = clamp(carriedT / carryDur, 0, 1);
    if (flashN < 3 && prog > 0.26 + flashN * 0.25) memoryFlash(flashN++);
    // the squeak rises and cracks with every wriggle
    squeak = Math.max(0, squeak - dt * 1.3);
    A("screamCharge", squeak);
    // the bar fills and STAYS; whether or not the player presses, it is full at the glade
    const a = men[0], R = manRoute[0][1];
    if (!arrived && a && (dist2(a.x, a.z, R.x, R.z) < 0.5 || carriedT > carryDur + 4)) arrived = true;
    struggle = arrived ? 1 : Math.max(struggle, Math.min(0.97, prog * 0.6 + Math.min(1, presses / STRUGGLE_PRESSES) * 0.4));
    ui.setCharge(struggle, "STRUGGLE");
    musT -= dt;
    if (musT <= 0) { musT = 0.6; MU("setIntensity", 0.5 + 0.5 * struggle, 0.6); }
    if (arrived) playScream();
  }

  function startScream() {
    setupJungle("day", "day");
    const p = J.screamSpot;
    player.teleport(p.x, p.z, 0);
    formUp(p.x, p.z, true);
    carrying = true; carriedT = 0; arrived = true; presses = STRUGGLE_PRESSES; struggle = 1;
    player.scripted = true; player.enabled = false;
    platypus.pose("struggle", 0);
    MU("play", "stealth", { intensity: 1, at: "now" });
    placeCarried(0);
    cinema.fade("clear", 0.4);
    playScream();
  }
  // the moment the sound leaves: everything at once
  function burst() {
    if (screamed) return;
    screamed = true;
    carrying = false;
    sx = player.x; sz = player.z;
    platypus.billTip.getWorldPosition(v1);
    A("scream", 1, false);
    FX("screamWave", v1.x, v1.y, v1.z, 1);
    cinema.shake(1.2, 1.4);
    combat.frozen = false;
    combat.bodyTTL = Infinity; // they do not get up, and they do not fade
    combat.blast(sx, sz, 22, 1);
    jungle.scare(sx, sz, 40);
    MU("stop", 0.1);
    layers(0, 0, 0, 0.1);
    // the white frame, and time crawling back over two seconds
    cinema.fade("white", 0);
    cinema.after(0.09, live(() => cinema.fade("clear", 0.5)));
    ctx.setTimeScale(0.2, 0);
    ctx.setTimeScale(1, 2);
    // the pole is gone from under it: the platypus drops
    fall.on = true; fall.y = platypus.group.position.y; fall.vy = 0;
    lookI = 0; lookT = 2.6; leafT = 0.4;
  }
  // the after-scream state, however we got here (played, skipped, jumped to)
  function ensureScreamed() {
    if (!screamed) {
      screamed = true;
      carrying = false;
      sx = player.x; sz = player.z;
      combat.frozen = false;
      combat.bodyTTL = Infinity;
      combat.blast(sx, sz, 22, 1);
      MU("stop", 0.1);
      layers(0, 0, 0, 0.1);
    }
    combat.frozen = false;
    ctx.setTimeScale(1, 0);
    fall.on = false;
    A("screamCharge", 0);
    if (typeof platypus.screamCharge === "function") platypus.screamCharge(0);
    MU("duck", 0, 0.5);
  }
  function playScream() {
    if (step === "scream") return;
    step = "scream";
    screamed = false;
    const g = gen;
    ui.setAction(null);
    ui.setCharge(null);
    ctx.abilities.scream.onRelease = (p) => { if (g === gen && step === "scream") platypus.scream(p === undefined ? 1 : p, false); };
    const sp = J.screamSpot, c = J.camGlade;
    const near = dist2(player.x, player.z, sp.x, sp.z) < 2.5;
    const cp = near ? arr(c.pos) : [player.x + 1.7, gy(player.x + 1.7, player.z - 2.7) + 0.4, player.z - 2.7];
    const x = player.x, z = player.z, y0 = gy(x, z);
    cinema.play([
      // a breath of total silence
      { call: () => {
        MU("duck", 1, 0.1);
        layers(0, 0, 0, 0.1);
        A("screamCharge", 0);
        combat.frozen = true;
        if (typeof platypus.screamCharge === "function") platypus.screamCharge(1);
        ctx.setTimeScale(0.15, 0);
      } },
      { shot: { pos: cp, look: platypus.billTip, fov: F(26), dur: 0 } },
      { wait: 0.4 },
      { call: () => { ctx.setTimeScale(1, 0); ctx.abilities.scream.force(1); } },
      { wait: platypus.screamTime > 0 ? platypus.screamTime : 0.12 },
      { call: burst },
      { shot: { pos: [x + 4.4, y0 + 2.9, z - 5.4], look: platypus.group, lookY: 0.2, fov: F(44), to: { pos: [x + 2.7, y0 + 1.5, z - 3.5] }, dur: 8.5, ease: "out" }, hold: false },
      // THE SILENCE: the ring in the ears, a heartbeat, leaves still falling. No music. No words.
      { wait: 1.0 + 3.0 },
      { caption: "...what was that?", dur: 3, narr: true },
      { wait: 0.7 },
    ], { skippable: true, onSkip: ensureScreamed, onDone: () => { if (g === gen) beginGlade(); } });
  }
  // after the burst, inside the cutscene: the drop, the shaking, the looking
  function updateAfterScream(dt) {
    const g = platypus.group, g0 = gy(sx, sz);
    if (fall.on) {
      fall.vy -= 17 * dt;
      fall.y += fall.vy * dt;
      if (fall.y <= g0) {
        fall.y = g0; fall.on = false;
        FX("footDust", sx, g0 + 0.03, sz, 0.9);
        FX("leaves", sx, g0 + 0.2, sz, 8);
        A("step", "leaves", 1, 0);
        platypus.pose("scared", 0.5);
      }
    } else fall.y = g0;
    g.position.set(sx, fall.y, sz);
    g.rotation.set(0, syaw, 0);
    player.x = sx; player.z = sz; player.y = fall.y; player.yaw = syaw;
    // leaves still coming down; it looks from one fallen man to the next, and at its own paws
    leafT -= dt;
    if (leafT <= 0) { leafT = 0.55; FX("leaves", sx + rnd(-5, 5), g0 + rnd(5, 8), sz + rnd(-5, 5), 5); }
    lookT -= dt;
    if (lookT <= 0) {
      lookT = 1.0;
      const e = men[lookI & 3];
      if (lookI >= 4 || !e) lookV.set(sx + Math.sin(syaw) * 0.4, g0 + 0.02, sz + Math.cos(syaw) * 0.4);
      else lookV.set(e.x, e.y + 0.2, e.z);
      platypus.lookAt(lookV);
      lookI++;
    }
  }

  // =====================================================================================================
  // PART 3 - the strange noise
  // =====================================================================================================
  // bodies in the glade for the starters that begin after the scream
  function fallenMen() {
    const p = J.screamSpot;
    formUp(p.x, p.z, true);
    sx = p.x; sz = p.z;
    screamed = true;
    combat.bodyTTL = Infinity;
    combat.blast(p.x, p.z, 22, 1);
    for (let i = 0; i < 12; i++) combat.update(0.25, i * 0.25); // let them finish falling behind black
  }
  function startGlade() {
    setupJungle("day", "day");
    MU("stop", 0.3);
    layers(0, 0, 0, 0.1);
    fallenMen();
    player.teleport(sx, sz, 0);
    cinema.fade("clear", 0.9);
    beginGlade();
  }
  function beginGlade() {
    step = "glade";
    ensureScreamed();
    player.scripted = false;
    player.teleport(sx, sz, syaw);
    player.maxSpeed = 3; player.canJump = true;
    platypus.pose(null, 0.8);
    platypus.lookAt(null);
    net.visible = false;
    cam.wantDist = 3.7; cam.pitch = 0.42; cam.manualT = 0;
    ui.showHud(true);
    ui.setCharge(null); ui.setAction(null);
    ctx.abilities.buttons({ jump: true });
    ctx.checkpoint.set("glade", { x: sx, z: sz, yaw: syaw, silent: true });
    setObj("Get away from here", "head for the light");
    setMark(5.5, gy(5.5, -17.5), -17.5, 0xfff2c8);
    // the forest's sound comes back in layers: wind, then insects, the birds last
    jungle.setTime("mist", 25);
    layers(0, 0, 1, 6);
    ctx.after(5, live(() => layers(0, 1, 1, 10)));
    ctx.after(12, live(() => layers(1, 1, 1, 20)));
    MU("play", "chill", { intensity: 0.15 });
    gladeT = 0; trailI = -1; mossState = "unseen";
    player.enabled = true;
  }
  function updateGlade(dt) {
    gladeT += dt;
    if (player.z > -18 || gladeT > 35) theCall();
  }

  function startTrail() {
    setupJungle("mist", "mist");
    fallenMen();
    player.teleport(5.2, -18.6, 0.3);
    cinema.fade("clear", 0.9);
    syaw = 0.3; sx = 5.2; sz = -18.6;
    beginGlade();
    ctx.clearTimers();
    layers(1, 1, 1, 2);
    theCall();
  }
  // THE CALL
  function theCall() {
    step = "trail";
    trailI = 0;
    clearMarks();
    ui.objectiveDone();
    setObj("What is that sound?", "listen");
    ui.hint("Listen. Follow the sound.", 4);
    idleT = 0; pendT = -1; crossHint = false; echoHint = false;
    callNow(0.1 - (1 - dist2(player.x, player.z, J.trail[0].x, J.trail[0].z) / 45)); // the first one is faint
    MU("setIntensity", 0.25, 3);
  }
  // where the sound comes from right now
  function tgt(out) {
    const p = trailI === 4 ? J.logOut : J.trail[Math.min(trailI, 5)];
    out.x = p.x; out.z = p.z;
    return out;
  }
  function soundFrom(x, z, closeness, pingK2, secs) {
    const b = ctx.bearing(x, z);
    A("mysteryCall", clamp(closeness, 0.05, 1), Math.sin(b));
    pingX = x; pingZ = z; pingK = clamp(pingK2, 0.1, 1); pingT = secs;
  }
  function callNow(boost) {
    tgt(mossSpot); // scratch
    const tx = mossSpot.x, tz = mossSpot.z;
    const d = dist2(player.x, player.z, tx, tz);
    const close = clamp(1 - d / 45 + (boost || 0), 0.05, 1);
    callT = CALL_EVERY; idleT = 0;
    // at the giant fig the call echoes: first a false one from the wrong side, then - louder - the true one
    if (trailI === 4 && dist2(player.x, player.z, J.fig.x, J.fig.z) < 12 && pendT < 0) {
      const fx2 = player.x * 2 - tx, fz2 = player.z * 2 - tz;
      soundFrom(fx2, fz2, close * 0.35, 0.2, 0.55);
      pendT = 0.85; pendBoost = (boost || 0) + 0.15;
      if (!echoHint) { echoHint = true; ui.hint("An echo! The louder call is the real one.", 3.4); }
      return;
    }
    soundFrom(tx, tz, close, close, PING_SECS);
    // the head snaps toward it
    lookV.set(tx, gy(tx, tz) + 0.4, tz);
    platypus.lookAt(lookV);
    lookOffT = PING_SECS;
  }
  // Moss, glimpsed: something small darting away through the ferns
  function mossDart(fx0, fz0, tx, tz) {
    moss.visible = true;
    const yaw = Math.atan2(tx - fx0, tz - fz0);
    moss.place(fx0, fz0, yaw);
    mossSpot.x = tx; mossSpot.z = tz; mossSpot.yaw = yaw + PI;
    moss.do("hide", { spot: mossSpot });
    mossHid = false;
    mossState = "glimpsed";
    FX("leaves", fx0, gy(fx0, fz0) + 0.4, fz0, 10);
    A("vines");
  }
  // from trail point i toward the next: appear `a` metres on, run to `b` metres on
  function dartAlong(i, a, b) {
    const p = J.trail[i], q = i === 3 ? J.logIn : i === 4 ? J.trail[5] : J.trail[i + 1];
    if (!q) return;
    const o = i === 4 ? J.logOut : p;
    const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1;
    b = Math.min(b, l + 1.5);
    mossSeg = i;
    mossDart(o.x + (dx / l) * Math.min(a, b - 1), o.z + (dz / l) * Math.min(a, b - 1), o.x + (dx / l) * b, o.z + (dz / l) * b);
  }
  function reach(i) {
    const p = J.trail[i];
    trailI = i + 1;
    callT = 1.6; idleT = 0; pendT = -1;
    MU("setIntensity", 0.25 + 0.06 * (i + 1), 2);
    switch (i) {
      case 0: {
        // the fern bank: webbed prints in the mud - the camera dips to them
        setObj("Follow the sound", "listen - watch the edge of the screen");
        const y = gy(p.x, p.z), g = gen;
        cinema.play([
          { shot: { pos: [p.x - 1.0, y + 1.6, p.z - 1.3], look: [p.x, y, p.z], fov: F(36), to: { pos: [p.x - 0.55, y + 0.95, p.z - 0.75] }, dur: 3 }, hold: false },
          { wait: 0.5 },
          { caption: "Webbed prints. Like mine...", dur: 2.5, narr: true },
        ], { skippable: true, onDone: () => { if (g === gen) dartAlong(0, 3.5, 9); } });
        break;
      }
      case 1:
        // the river's edge: it comes from ACROSS
        setObj("Cross the river", "wade the ford or jump the stones");
        if (!crossHint) { crossHint = true; ui.hint("It is coming from across the river. Wade the ford, or jump the stones.", 4.5); }
        clearMarks();
        mark = FX("beacon", J.ford.x, 0.05, J.ford.z, 0x9fe8ff) || null;
        mark2 = FX("beacon", J.stones.x, 0.3, J.stones.z, 0x9fe8ff) || null;
        // a shape on the far bank, gone as soon as it is seen
        mossSeg = 1;
        mossDart(J.trail[2].x + 1.6, J.trail[2].z - 2.2, J.trail[2].x - 2.5, J.trail[2].z + 5);
        break;
      case 2:
        // the far side: wet prints on a rock, drying as you watch
        clearMarks();
        setObj("Follow the sound", "listen - watch the edge of the screen");
        ctx.checkpoint.set("trail2", { x: p.x, z: p.z, yaw: 0, silent: true });
        dryT = 0;
        cinema.caption("Wet prints. They are drying already.", 3, { narr: true });
        dartAlong(2, 3.5, 9);
        break;
      case 3:
        // the giant fig
        dartAlong(3, 3, 9);
        break;
      case 4:
        // the hollow log: through its dark
        ctx.checkpoint.set("trail4", { x: J.logOut.x, z: J.logOut.z, yaw: J.logOut.yaw || 0, silent: true });
        cinema.caption("It is close now.", 2.4, { narr: true });
        dartAlong(4, 2.5, 9);
        break;
      default:
        beginMeet();
    }
  }
  function updateTrail(dt) {
    if (cinema.playing) return;
    // the subtle visual aid: an arc at the screen edge for a moment after each call
    if (pingT > 0) {
      pingT -= dt;
      if (pingT > 0) ui.setPing(ctx.bearing(pingX, pingZ), pingK, "sound"); else ui.setPing(null);
    }
    if (lookOffT > 0) { lookOffT -= dt; if (lookOffT <= 0) platypus.lookAt(null); }
    if (pendT >= 0) { pendT -= dt; if (pendT < 0) { pendT = -1; const b = pendBoost; pendT = 0; callNow(b); pendT = -1; } }
    // every 4.5 s; and standing still for 8 s anywhere brings it again, a little louder (nobody gets lost)
    callT -= dt;
    idleT = player.speed < 0.25 ? idleT + dt : 0;
    if (idleT > 8) callNow(0.2);
    else if (callT <= 0) callNow(0);
    // the prints on the rock dry
    if (dryT >= 0 && prints[1]) {
      dryT += dt;
      const k = clamp(1 - dryT / 7, 0, 1);
      prints[1].material.opacity = (prints[1].material.map ? 0.9 : 0) * k;
      if (k <= 0) { prints[1].visible = false; dryT = -1; }
    }
    // Moss keeps ahead: come too near his hiding place and he is off again
    if (mossHid && mossState === "glimpsed" && moss.distTo(player.x, player.z) < 4.6) {
      const q = mossSeg === 3 ? J.logIn : mossSeg === 4 ? J.trail[5] : J.trail[mossSeg + 1];
      if (q && mossSeg < 4 && dist2(moss.x, moss.z, q.x, q.z) > 4) {
        const dx = q.x - moss.x, dz = q.z - moss.z, l = Math.hypot(dx, dz) || 1, s = Math.min(8, l + 2);
        mossDart(moss.x, moss.z, moss.x + (dx / l) * s, moss.z + (dz / l) * s);
        A("tribeChirp", "giggle", 0.6, Math.sin(ctx.bearing(moss.x, moss.z)));
      } else {
        // out of trail: he slips away for good, until the meeting
        FX("leaves", moss.x, moss.y + 0.4, moss.z, 10);
        A("vines");
        moss.visible = false; mossHid = false;
      }
    }
    // reaching the current point - or any later one, for those who find their own way
    for (let i = 5; i >= trailI; i--) {
      const p = J.trail[i];
      let hit;
      if (i === 4) hit = (jungle.log && jungle.log.inside && jungle.log.inside(player.x, player.z)) || nearP(J.logOut, 2.4) || nearP(p, 1.6);
      else hit = nearP(p, 4);
      if (hit) { reach(i); break; }
    }
  }

  function startMeet() {
    setupJungle("mist", "mist");
    screamed = true;
    const p = J.trail[5];
    player.teleport(p.x, p.z - 1.5, 0);
    MU("play", "chill", { intensity: 0.5, at: "now" });
    ctx.checkpoint.set("trail4", { x: J.logOut.x, z: J.logOut.z, yaw: J.logOut.yaw || 0, silent: true });
    ui.showHud(true);
    player.enabled = true;
    trailI = 6;
    cinema.fade("clear", 0.9);
    beginMeet();
  }
  // the vine curtain: the call from right behind it, clearly musical now
  function beginMeet() {
    step = "meet";
    meetPhase = "curtain";
    trailI = 6;
    ui.setPing(null); pingT = 0;
    platypus.lookAt(null);
    clearMarks();
    setObj("Push through the vines", key("E at the curtain", "tap Push through"));
    setMark(jungle.curtain.x, gy(jungle.curtain.x, jungle.curtain.z - 0.8), jungle.curtain.z - 0.8, 0xbfffc8);
    // Moss, behind it, back turned, calling
    const m = J.meet;
    moss.visible = true;
    moss.place(m.x, m.z + 1.3, 0);
    moss.do("idle");
    mossState = "calling"; mossHid = false;
    mossCallT = 0.6;
    greeted = false; bowed = false;
    // the score recognises it first
    ctx.after(2.2, live(() => MU("motif", "platypus", { gain: 0.6 })));
    MU("setIntensity", 0.5, 2);
  }
  function pushThrough() {
    if (meetPhase !== "curtain") return;
    jungle.curtain.open();
    A("vines");
    ui.setAction(null);
    clearMarks();
    playMeet();
  }
  function settleMeet() {
    const m = J.meet;
    if (!jungle.curtain.opened) jungle.curtain.open();
    player.stop();
    player.teleport(m.x, m.z - 0.6, 0);
    moss.visible = true;
    moss.place(m.x + 0.15, m.z + 0.45, PI);
    moss.do("idle");
    moss.lookAt(platypus.group);
    platypus.lookAt(null);
    MU("duck", 0, 0.5);
    greeted = true;
  }
  function playMeet() {
    meetPhase = "cine";
    const g = gen, m = J.meet;
    const y = gy(m.x, m.z);
    cinema.play([
      { call: () => { player.walkTo(m.x, m.z - 0.6, { speed: 0.45, face: 0 }); } },
      // from just inside the curtain, over the newcomer: Moss with his back turned (jungle.P.camMeet is behind a flower bush)
      { shot: { pos: [m.x - 2.0, y + 1.0, m.z - 1.4], look: moss.group, lookY: 0.2, fov: F(40), dur: 0 } },
      { wait: 1.4 },
      { call: () => moss.do("call") },
      { wait: 2.3 },
      // it turns. Both freeze.
      { call: () => {
        gotoO.x = moss.x; gotoO.z = moss.z; gotoO.yaw = Math.atan2(player.x - moss.x, player.z - moss.z); gotoO.run = false;
        moss.do("goto", gotoO);
        moss.lookAt(platypus.group);
        lookV.set(moss.x, moss.y + 0.25, moss.z);
        platypus.lookAt(lookV);
        MU("duck", 0.7, 0.3);
      } },
      { shot: { pos: [m.x + 2.6, y + 0.55, m.z + 0.4], look: [m.x, y + 0.22, m.z + 0.35], fov: F(32), to: { pos: [m.x + 2.3, y + 0.5, m.z + 0.4] }, dur: 3.4 }, hold: false },
      { wait: 1.9 },
      { call: () => { mossState = "met"; moss.emote("curious"); } },
      { wait: 1.5 },
      { call: () => { MU("duck", 0, 1.2); moss.do("greet"); } },
      { shot: { pos: [m.x + 2.9, y + 1.25, m.z - 2.2], look: platypus.group, lookY: 0.2, fov: F(40), to: { pos: [m.x + 2.2, y + 0.9, m.z - 1.7] }, dur: 9 }, hold: false },
      { until: () => greeted, max: 11 },
      { wait: 0.5 },
    ], { skippable: true, onSkip: settleMeet, onDone: () => { if (g === gen) beginGreet(); } });
  }
  function beginGreet() {
    meetPhase = "greet";
    mossState = "met";
    greeted = true;
    greetT = 0; bowed = false;
    platypus.lookAt(null);
    if (!jungle.curtain.opened) jungle.curtain.open();
    ui.showHud(true);
    setObj("Say hello", key("press E", "tap Greet"));
    ui.setAction("Greet");
    player.enabled = false;
  }
  function doGreet() {
    if (bowed) return;
    bowed = true;
    ui.setAction(null);
    ui.objectiveDone();
    player.face = Math.atan2(moss.x - player.x, moss.z - player.z);
    const d = platypus.playBow() || 1.1;
    player.lock = d;
    A("friendship");
    platypus.billTip.getWorldPosition(v1); v1.y += 0.12;
    FX("hearts", v1, 5);
    MU("setIntensity", 0.6, 1.5);
    ctx.after(0.7, live(() => moss.emote("happy")));
    ctx.after(0.9, live(() => cinema.caption("[You are like me!]", 2.5, { who: "Moss" })));
    ctx.after(3.6, live(() => { moss.emote("call"); cinema.caption("[Come. Come!]", 2.3, { who: "Moss" }); }));
    ctx.after(4.6, live(beginFollow));
  }
  function updateMeet(dt) {
    if (cinema.playing) return;
    if (meetPhase === "curtain") {
      mossCallT -= dt;
      if (mossCallT <= 0 && !moss.busy) { mossCallT = 4.5; moss.do("call"); }
      const cu = jungle.curtain, m = J.meet;
      ui.setAction(dist2(player.x, player.z, cu.x, cu.z) < 2.8 ? "Push through" : null);
      // the wall of vines is soft at its ends: whoever walks round it still meets him
      if (player.z > cu.z + 0.5 && nearP(m, 5)) pushThrough();
    } else if (meetPhase === "greet") {
      greetT += dt;
      if (!bowed && greetT > 14) doGreet(); // he waits; then the platypus bows anyway
    }
  }

  function startFollow() {
    setupJungle("mist", "mist");
    screamed = true;
    MU("play", "chill", { intensity: 0.6, at: "now" });
    ctx.checkpoint.set("trail4", { x: J.logOut.x, z: J.logOut.z, yaw: J.logOut.yaw || 0, silent: true });
    settleMeet();
    cinema.fade("clear", 0.9);
    beginFollow();
  }
  // a joyful run through the last trees
  function beginFollow() {
    step = "follow";
    meetPhase = "";
    mossState = "leading";
    ui.showHud(true);
    ui.setAction(null);
    setObj("Follow Moss!", "run with him");
    player.maxSpeed = 3.2; player.canJump = true;
    player.enabled = true;
    moss.lookAt(null);
    moss.do("lead", { route: leadRoute, waitDist: 5, run: true });
    MU("setIntensity", 0.8, 3);
    setMark(moss.x, moss.y, moss.z, 0xbfffc8);
  }
  function updateFollow() {
    if (mark && mark.set) mark.set(moss.x, moss.y, moss.z);
    if (nearP(J.campGate, 2.2)) playReveal();
  }

  function startReveal() {
    setupJungle("mist", "mist");
    screamed = true;
    if (!jungle.curtain.opened) jungle.curtain.open();
    const gte = J.campGate;
    player.teleport(gte.x - 0.6, gte.z - 1.2, gte.yaw || 0.6);
    moss.visible = true;
    moss.place(gte.x + 0.5, gte.z + 0.8, 0.6);
    moss.do("idle");
    mossState = "leading";
    MU("play", "chill", { intensity: 0.8, at: "now" });
    cinema.fade("clear", 0.5);
    playReveal();
  }
  // the camp, all at once (idempotent: the cutscene and its skip both call it)
  // The reveal is the heaviest frame of the level (the village crowd + four full platypus models). The crowd
  // casts no shadows; for the length of the reveal neither do Moss, Burra and Nib (the triangle budget), back on in hardStop.
  function tribeShadows(on) {
    for (const m of [moss, burra, nib]) {
      if (!m || !m.built) continue;
      m.body.group.traverse((o) => { if (o.isMesh) { if (o.userData.l8Shadow === undefined) o.userData.l8Shadow = o.castShadow; o.castShadow = on ? o.userData.l8Shadow : false; } });
    }
  }
  function campOn() {
    if (camp) return;
    camp = true;
    tribeShadows(false);
    ui.setObjective(null); objText = ""; // no "Follow Moss!" left over after the crane
    combat.reset(); // the fallen capture party lies 85 m back in the glade: out of the reveal (they are not culled)
    for (let i = 0; i < 4; i++) men[i] = null;
    mossState = "home";
    clearMarks();
    jungle.setZone("camp", true);
    jungle.setTime("dusk", 6);
    tribe.village.populate(J.spots);
    for (let i = 0; i < jungle.fires.length; i++) jungle.fires[i].set(1);
    A("tribeChatter", 0.8);
    MU("play", "tribe", { intensity: 0.8, at: "now" });
    burra.visible = true;
    burra.place(J.elder.x, J.elder.z, J.elder.yaw || PI);
    burra.do("sit");
    gotoO.x = 13.4; gotoO.z = 64.2; gotoO.yaw = Math.atan2(REVEAL_AT.x - 13.4, REVEAL_AT.z - 64.2); gotoO.run = true;
    moss.do("goto", gotoO);
    nib.visible = false;
    nib.place(14.4, 66.9, PI);
    player.enabled = false;
    player.walkTo(REVEAL_AT.x, REVEAL_AT.z, { speed: 0.5, face: REVEAL_AT.yaw });
  }
  function nibOut() {
    const s = Math.sin(REVEAL_AT.yaw), c = Math.cos(REVEAL_AT.yaw);
    footAt.x = REVEAL_AT.x + s * 0.42 - c * 0.16; footAt.z = REVEAL_AT.z + c * 0.42 + s * 0.16;
    footAt.yaw = REVEAL_AT.yaw + PI;
    nib.visible = true;
    nib.do("sit", { at: footAt, lookAt: platypus.group });
    A("tribeChirp", "curious", 0.9, 0, 1.5);
  }
  function cheer() {
    if (cheered) return;
    cheered = true;
    tribe.village.setMood("cheer");
    tribe.village.wave();
    A("tribeCheer", 1);
    A("tribeChatter", 0.8);
    MU("duck", 0, 0.4);
    MU("setIntensity", 1, 1);
    moss.emote("cheer");
    nib.emote("happy");
  }
  // everything of the reveal in its final state (a skipped crane)
  function settleReveal() {
    campOn();
    player.stop();
    player.teleport(REVEAL_AT.x, REVEAL_AT.z, REVEAL_AT.yaw);
    tribe.village.lookAt(player);
    nibOut();
    nib.place(footAt.x, footAt.z, footAt.yaw);
    nibSat = true;
    cheer();
  }
  function playReveal() {
    if (step === "reveal") return;
    step = "reveal";
    const g = gen, c = J.camCampReveal, T = REVEAL_AT;
    const y = gy(T.x, T.z);
    ui.setAction(null);
    nibSat = false; cheered = false;
    cinema.play([
      { call: campOn },
      // the crane over the root arch
      { shot: { pos: arr(c.pos), look: arr(c.look), fov: F(48), to: { pos: [25.5, 4.6, 62.6], look: [20, 0.8, 75] }, dur: 9, ease: "inOut" }, hold: false },
      { wait: 4.4 },
      // they all turn. Silence in the chatter for one beat.
      { call: () => { tribe.village.setMood("curious"); tribe.village.lookAt(player); A("tribeChatter", 0.04); MU("duck", 0.75, 0.25); burra.lookAt(platypus.group); } },
      { wait: 1.8 },
      // then Nib waddles out and sits on your foot
      { call: nibOut },
      { wait: 2.8 },
      { shot: { pos: [T.x + 1.9, y + 0.6, T.z + 1.2], look: platypus.group, lookY: 0.12, fov: F(34), to: { pos: [T.x + 1.5, y + 0.48, T.z + 1.0] }, dur: 6 }, hold: false },
      { until: () => nibSat, max: 4.5 },
      { call: () => { nibSat = true; lookV.set(nib.x, nib.y + 0.15, nib.z); platypus.lookAt(lookV); v1.set(nib.x, nib.y + 0.4, nib.z); FX("hearts", v1, 3); } },
      { wait: 1.2 },
      { call: cheer },
      { wait: 1.1 },
      { caption: "You are not the only one.", dur: 4.2, narr: true },
      { wait: 0.9 },
    ], { skippable: true, release: null, onSkip: settleReveal, onDone: () => { if (g === gen) startEnd(); } });
  }
  function startEnd() {
    step = "end";
    player.enabled = false;
    ui.setAction(null);
    cinema.fade("black", 2, live(() => {
      step = "done";
      ui.showComplete({ kicker: "LEVEL 8", title: "COMPLETE", sub: "You are not the only one." }, () => ctx.complete());
    }));
  }

  // =====================================================================================================
  // engine hooks
  // =====================================================================================================
  function onFriend(type) {
    if (step === "memory2") {
      if (type === "trickDone" && m2 === "show") m2T = Math.min(m2T, 0.35);
      else if (type === "nuzzled" && m2 === "nuzzle") m2NuzzleNow();
    }
  }
  function onMoss(type) {
    if (type === "hidden") { mossHid = true; if (step === "trail") moss.do("peek"); }
    else if (type === "greeted") greeted = true;
    else if (type === "checkpoint" && step === "follow") { if (!moss.busy) moss.emote("chirp"); }
    else if (type === "arrived" && step === "follow") playReveal();
  }
  function onNib(type) { if (type === "arrived" && step === "reveal") nibSat = true; }
  function onCombat(type, a) { if (type === "routeEnd" && step === "carried" && a === men[0]) arrived = true; }

  function enter() {
    hardStop();
    friend.setName("Pip");
    friend.onEvent = onFriend;
    moss.onEvent = onMoss;
    nib.onEvent = onNib;
    combat.onEvent = onCombat;
    screamed = false; trailI = -1; mossState = "unseen"; camp = false; lookI = 0;
    toZoo("morning");
    step = "intro";
  }

  function update(dt, time) {
    if (step === "boot") return;
    if (!inJungle) {
      if (step === "memory1") updateM1(dt);
      else if (step === "memory2") updateM2(dt);
      else if (step === "memory3") updateM3(dt);
      friend.update(dt, time);
      crowd.update(dt, time);
      return;
    }
    combat.update(dt, time);
    switch (step) {
      case "wake": updateWake(dt); break;
      case "taken": wrig *= Math.exp(-5 * dt); wrigClock += dt; updateTaken(dt); break;
      case "carried": updateCarried(dt); break;
      case "scream": if (screamed) updateAfterScream(dt); else if (carrying) placeCarried(dt); break;
      case "glade": updateGlade(dt); break;
      case "trail": updateTrail(dt); break;
      case "meet": updateMeet(dt); break;
      case "follow": updateFollow(); break;
      default: break;
    }
    tribe.update(dt, time);
  }

  function onAction(name) {
    if (step === "memory2") {
      if (name === "trick1") m2Try(0);
      else if (name === "trick2") m2Try(1);
      else if (name === "trick3") m2Try(2);
      else if (name === "trick4") m2Try(3);
      return false;
    }
    if (step === "taken" || step === "carried") {
      // anything the player can hit is a wriggle
      if (name === "primary" || name === "interact" || name === "jump" || name === "tailSlap" || name === "secondary") { struggleTap(); return true; }
      return false;
    }
    if (step === "meet") {
      if (name === "interact" || name === "primary") {
        if (meetPhase === "curtain" && ui.actionOn !== false && dist2(player.x, player.z, jungle.curtain.x, jungle.curtain.z) < 2.8) pushThrough();
        else if (meetPhase === "greet") doGreet();
      }
      return false;
    }
    return false;
  }

  function exit() {
    hardStop();
    A("muffle", 0, 0);
    friend.onEvent = null;
    moss.onEvent = null;
    nib.onEvent = null;
    combat.onEvent = null;
    ctx.abilities.scream.onRelease = null;
    zoo.reset();
    jungle.reset();
    if (net.parent) net.parent.remove(net);
    for (let i = 0; i < 2; i++) if (prints[i] && prints[i].parent) prints[i].parent.remove(prints[i]);
    FX("setGround", null, null);
    FX("setGlint", 0xfff2dc);
    inJungle = false;
    step = "boot";
  }

  function win() {
    if (step === "done" || step === "boot") return;
    hardStop();
    step = "done";
    ui.showComplete({ kicker: "LEVEL 8", title: "COMPLETE", sub: "You are not the only one." }, () => ctx.complete());
  }

  function skipTo(name) {
    if (step === "boot" || STEPS.indexOf(name) < 0) return false;
    switch (name) {
      case "intro": startIntro(); break;
      case "memory1": startMemory(1, true); break;
      case "memory2": startMemory(2); break;
      case "memory3": startMemory(3); break;
      case "wake": startWake(); break;
      case "taken": startTaken(); break;
      case "carried": startCarried(); break;
      case "scream": startScream(); break;
      case "glade": startGlade(); break;
      case "trail": startTrail(); break;
      case "meet": startMeet(); break;
      case "follow": startFollow(); break;
      case "reveal": startReveal(); break;
      default: win();
    }
    return true;
  }

  return {
    build, enter, start, update, exit, onAction,
    state() {
      return { step, memory, struggle: Math.round(struggle * 100) / 100, screamed, trail: trailI, moss: mossState, camp,
        rings: ringI, round, m2, m3: m3.phase, presses, meet: meetPhase, jungle: inJungle };
    },
    skipTo, win,
    STEPS,
  };
}
