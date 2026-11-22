// level7.js - LEVEL 7, "THE CIRCUS" (LEVELS2.md Part C7; STORY2.md "Level 7 - the circus").
//
//   Part 1  the cage and the wagons   wake in the cage wagon, slap the latch off (the first stealth lesson costs
//                                     nothing), sneak through the wagon row            steps: intro, cage, wagons
//   Part 2  the big top, the back lot cross the tent three honest ways, get through the gate           tent, lot, heli
//   Part 3  the flight                steal the helicopter and LEARN to fly it: wires, power lines, searchlights,
//                                     a valley and a bridge, towers and gusts, the jungle at dawn, an engine that
//                                     coughs, and a landing that is a crash either way
//                                                                  takeoff, fields, valley, jungle, landing, end
//
// Hard but fair: there is no health on foot (a completed grab = back to the checkpoint) and the hull in the air;
// every failure is ctx.checkpoint.respawn(), under a second. The assist rule of LEVELS2.md A2 is applied quietly.
// Checkpoints: cage (silent), cp1, cp2, cp3, cp4, pad, fields, valley, jungle.
// Skip points: intro, cage, wagons, tent, lot, heli, takeoff, fields, valley, jungle, landing, end.
import { createCircus } from "../circus.js";
import { createHeli } from "../heli.js";
import { createCombat } from "../combat.js";

export const meta = { n: 7, title: "THE CIRCUS" };

const STEPS = ["intro", "cage", "wagons", "tent", "lot", "heli", "takeoff", "fields", "valley", "jungle", "landing", "end", "done"];
const PI = Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const AIR_LABEL = { pad: "Lift-off", fields: "Fields", valley: "River valley", jungle: "Jungle" };
const AIR_INT = { pad: 0.2, fields: 0.35, valley: 0.6, jungle: 1 };
const AIR_STEP = { pad: "takeoff", fields: "fields", valley: "valley", jungle: "jungle" };
const FOOT_STEP = { cage: "cage", cp1: "wagons", cp2: "tent", cp3: "lot", cp4: "heli" };
const ACT_LABEL = { latch: "Slap latch", heli: "Climb in", bell: "Ring bell", bottles: "Knock over", calliope: "Crank", generator: "Pull lever", bar: "Slap the bar" };
const NOH = { pass() {}, set() {}, remove() {} }; // a handle that does nothing (fx pool unavailable)
const CAGE_FRONT = { x: -27.25, z: -20 }; // where the guard stands to look into the cage
const DRIVER = { x: -15.9, z: 36.6 }; // the truck's driver, by the tailboard, watching the loose board

export function createLevel(ctx) {
  const { THREE, player, platypus, cam, ui, cinema, audio, fx } = ctx;

  // guarded calls into audio / fx / music: a missing sound or effect must never stop the level
  function A(name, a, b, c, d) { const f = audio[name]; return typeof f === "function" ? f.call(audio, a, b, c, d) : undefined; }
  function FX(name, a, b, c, d, e, g) { const f = fx[name]; return typeof f === "function" ? f.call(fx, a, b, c, d, e, g) : undefined; }
  function M(name, a, b) { const m = ctx.music, f = m && m[name]; return typeof f === "function" ? f.call(m, a, b) : undefined; }
  const K = (keys, touch) => (ctx.touch ? touch : keys);
  // directed shots are composed for 16:9; on a tall screen the vertical field of view opens so the middle is not cut off
  function F(v) {
    const a = ctx.camera.aspect || 1.78;
    if (a >= 1.3) return v;
    return Math.min(80, (2 * Math.atan((Math.tan((v * PI) / 360) * 1.3) / a) * 180) / PI);
  }
  const arr = (p) => [p.x, p.y, p.z];

  let circus = null, heliMod = null, flight = null, craft = null, combat = null, P = null, LATCH = null;
  let ringRoute = null, lotRoute = null;
  let step = "boot";
  let gen = 0;  // bumped by hardStop(): callbacks that outlive their beat compare it and do nothing
  let sect = 0; // bumped whenever a section (re)starts: section-scoped timers compare it

  // ---- scratch (nothing below allocates per frame) ----
  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const heliCol = { x: 0, z: 46, r: 1.35, on: false };
  const told = {};
  const tools = [];
  const gateH = new Array(16).fill(null);

  // ---- state ----
  let objText = null, actId = null, goalH = null;
  let inFlight = false, ending = false, boarding = false;
  let takedowns = 0, downs = 0, lastCause = "";
  // on foot
  let sneaking = false, stingCd = 0, slapCd = 0, musInt = -1, dangerT = 0, wasInside = false, gapT = 0;
  let guardA = null, guardB = null, ringGuard = null, driver = null;
  const cg = { state: "patrol", t: 0, grace: 0, nag: 0 }; // the guard and the cage: patrol | coming | watch | open
  let padT = -1, padStage = 0, drvT = 0, drvAway = false, gateAtCp4 = true, inSpot = false;
  // in the air
  let gateNext = 0, gateCount = 0, beamT = 0, humLv = 0, tut = 0, tutT = 0, flightInt = 0.2, archDone = false;
  let coughing = false, coughT = 0, birdsZ = 0, landHintT = 0, jungleAmb = false, landBeacon = null, landRing = null, backT = 0;

  const d2 = (ax, az, b) => (ax - b.x) * (ax - b.x) + (az - b.z) * (az - b.z);
  const panOf = (x, z) => clamp(Math.sin(ctx.bearing ? ctx.bearing(x, z) : 0), -1, 1);

  // =====================================================================================================
  // small helpers
  // =====================================================================================================
  function objective(text, keys) {
    if (text === objText) return;
    objText = text;
    ui.setObjective(text, keys);
  }
  function goal(x, y, z, color) {
    if (goalH) goalH.remove();
    goalH = x === null ? null : (FX("beacon", x, y, z, color || 0xffe08a) || null);
  }
  function tool(p) {
    const h = FX("beacon", p.x, circus.heightAt(p.x, p.z), p.z, 0x8fd0ff);
    if (h) tools.push(h);
  }
  function clearTools() {
    for (let i = 0; i < tools.length; i++) tools[i].remove();
    tools.length = 0;
  }
  function hintOnce(key, text, secs) {
    if (told[key]) return false;
    told[key] = true;
    ui.hint(text, secs || 4);
    return true;
  }
  function setAct(id) {
    if (id === actId) return;
    actId = id;
    ui.setAction(id ? ACT_LABEL[id] : null);
  }
  function setSneak(on, force) {
    if (on === sneaking && !force) return;
    sneaking = on;
    player.maxSpeed = on ? 1.5 : 3.0 * ((ctx.gear && ctx.gear.speed) || 1);
    platypus.pose(on ? "sneak" : null, 0.25);
  }
  function heliSound(on, crashed) {
    const h = audio.heli;
    if (!h) return;
    if (on) { if (!h.on && typeof h.start === "function") h.start(); }
    else if (h.on && typeof h.stop === "function") h.stop(!!crashed);
  }
  // LEVELS2.md A2: quiet help after a few restarts at the same checkpoint
  function applyAssist() {
    const t = ctx.checkpoint.tries, lv = t >= 6 ? 2 : t >= 3 ? 1 : 0;
    combat.viewScale = lv === 2 ? 0.65 : lv === 1 ? 0.8 : 1;
    combat.aimScale = lv === 2 ? 1.5 : lv === 1 ? 1.25 : 1;
    craft.assist = lv === 2 ? 0.85 : lv === 1 ? 0.6 : 0.35;
    craft.windScale = lv === 2 ? 0.3 : lv === 1 ? 0.6 : 1;
  }
  function causeHint() {
    const id = ctx.checkpoint.id;
    if (lastCause === "wire") return "Climb earlier before the wires.";
    if (lastCause === "shot") return "Stay out of the beams: wait for one to pass, or climb above 30 m.";
    if (lastCause === "ground") return K("Keep holding Space while the nose is down, or you sink.", "Keep holding Jump while the nose is down, or you sink.");
    if (lastCause === "obstacle") return K("Slow down near towers and trees: pull back with S.", "Slow down near towers and trees: pull the stick back.");
    if (id === "cage") return K("Hide at the back of the cage (hold Shift) until he walks away.", "Hide at the back of the cage (hold Sneak) until he walks away.");
    if (id === "cp1") return "Crawl under a wagon and let the patrol walk past first.";
    if (id === "cp2") return "Under the seats nobody can see you. Wait there for the aisle to clear.";
    if (id === "cp3") return "Crank the calliope: both gate guards go to look. Then slap the gate bar.";
    return "Straight to the helicopter. Do not wait!";
  }
  function onRespawn() {
    applyAssist();
    const t = ctx.checkpoint.tries;
    if (t >= 6 && t % 3 === 0) {
      const s = sect, text = causeHint();
      ctx.after(0.9, () => { if (s === sect && !ending) ui.hint(text, 5.5); });
    }
  }

  // =====================================================================================================
  // build / worlds
  // =====================================================================================================
  function build() {
    circus = ctx.shared("circus", () => createCircus(ctx));
    heliMod = ctx.shared("heli", () => createHeli(ctx));
    combat = ctx.shared("combat", () => createCombat(ctx));
    flight = heliMod.world;
    craft = heliMod.craft;
    P = circus.P;
    LATCH = P.latch || circus.cage.latch.pos;
    // the ring guard starts on the far side of the ring, the lot patrol at the far corner (fair respawns)
    const rr = circus.routes.ringA, ls = circus.routes.lotSweep;
    ringRoute = rr.slice(4).concat(rr.slice(0, 4));
    lotRoute = ls.slice(2).concat(ls.slice(0, 2));
    heliCol.x = P.heliSpot.x; heliCol.z = P.heliSpot.z;
    if (ctx.debug) ctx.debug.level7 = { circus, heli: heliMod, combat, cg };
  }

  function toFlightWorld() {
    flight.group.add(craft.group);
    craft.setWorld(flight);
    ctx.setWorld(flight);
    FX("setGround", flight.heightAt, null);
    inFlight = true;
    heliCol.on = false;
  }
  function toCircus() {
    circus.group.add(combat.group, craft.group);
    combat.setWorld(circus);
    craft.setWorld(circus);
    ctx.setWorld(circus);
    craft.place(P.heliSpot.x, 0.05, P.heliSpot.z, 0);
    FX("setGround", circus.heightAt, null);
    inFlight = false;
    heliCol.on = true;
    A("circusAmbience", true);
  }

  // Everything back to nothing, behind black. Every starter begins here.
  function hardStop() {
    gen++; sect++;
    cinema.reset();
    cinema.fade("black", 0);
    ctx.clearTimers();
    ctx.setTimeScale(1, 0);
    ui.clearSpeech();
    ui.showHud(false);
    ui.setObjective(null); ui.setAction(null); ui.setSeen(null); ui.flight.show(false);
    objText = null; actId = null;
    ctx.abilities.cancel();
    if (ctx.vehicle.active) ctx.vehicle.exit();
    ctx.checkpoint.clear();
    M("duck", 0, 0.1);
    M("stop", 0.3);
    A("circusAmbience", false); A("warnBeep", false); A("searchlightHum", 0); A("siren", false, "circus");
    A("jungleAmbience", false); A("wind", 0); A("rotorWash", 0);
    heliSound(false, false);
    goal(null); clearTools(); clearGates(); clearLanding();
    FX("windStreaks", false, 0, 0, 0);
    // modules
    combat.reset();
    combat.viewScale = combat.aimScale = combat.seenRate = 1;
    combat.bodyTTL = 12;
    circus.reset();
    heliMod.reset();
    craft.assist = 0.35; craft.windScale = 1; craft.rpmLimit = 1;
    // the player
    platypus.reset();
    if (platypus.revive && platypus.collapsed) platypus.revive();
    player.scripted = false; player.hidden = false; player.enabled = false; player.carrying = false;
    player.maxSpeed = 3; player.lock = 0; player.face = null; player.canJump = player.canDive = true;
    player.pitch = player.roll = 0; player.speed = 0; player.vy = 0; player.grounded = true; player.kx = player.kz = 0;
    player.stop();
    // flags of every beat
    for (const k in told) delete told[k];
    inFlight = false; ending = false; boarding = false;
    takedowns = 0; downs = 0; lastCause = "";
    sneaking = false; stingCd = slapCd = 0; musInt = -1; dangerT = 0; wasInside = false; gapT = 0;
    guardA = guardB = ringGuard = driver = null;
    cg.state = "patrol"; cg.t = 0; cg.grace = 0; cg.nag = 0;
    padT = -1; padStage = 0; drvT = 0; drvAway = false; gateAtCp4 = true; inSpot = false;
    gateNext = 0; gateCount = 0; beamT = 0; humLv = 0; tut = 0; tutT = 0; flightInt = 0.2; archDone = false;
    coughing = false; coughT = 0; birdsZ = 0; landHintT = 0; jungleAmb = false; backT = 0;
    heliCol.on = false;
  }

  // =====================================================================================================
  // PART 1 + 2 - on foot
  // =====================================================================================================
  function spawnGuard(route, squad, passive) {
    return combat.spawn("guard", route[0].x, route[0].z, { route, squad, passive: !!passive });
  }
  function spawnPost(x, z, yaw, squad, sweep, passive) {
    return combat.spawn("guard", x, z, { yaw, post: true, sweep, squad, passive: !!passive });
  }
  function openCage() {
    const c = circus.cage;
    if (c.latch.hits < 3) c.latch.hits = 3;
    if (!c.door.opened) c.door.open();
  }

  // (Re)starts the section that belongs to checkpoint `id`: enemies, doors, distractions. Called when a checkpoint
  // is reached, by its restore(), and by skipTo. Sets `step`.
  function beginSection(id) {
    sect++;
    combat.reset();
    combat.seenRate = 1;
    applyAssist();
    guardA = guardB = ringGuard = driver = null;
    padT = -1; padStage = 0; drvT = 0; drvAway = false; boarding = false; inSpot = false;
    stingCd = slapCd = 0; musInt = -1; dangerT = 0;
    ui.setCooldown("sting", 0); ui.setCooldown("slap", 0);
    setSneak(false, true);
    const D = circus.distractions, R = circus.routes;
    D.bell.reset(); D.bottles.reset(); D.generator.reset(); D.calliope.reset();
    circus.setLights("night");
    A("siren", false, "circus");
    step = FOOT_STEP[id] || "wagons";
    const sentry = R.tentDoor[0];
    if (id === "cage") {
      circus.reset();
      cg.state = "patrol"; cg.t = 0; cg.grace = 0; cg.nag = 0;
      // the same four people as section A, harmless until the door is open
      guardA = spawnGuard(R.wagonsA, 1, true);
      guardB = spawnGuard(R.wagonsB, 1, true);
      spawnPost(sentry.x, sentry.z, PI, 2, 0.7, true);
      spawnGuard(R.midway, 3, true);
      return;
    }
    openCage();
    if (id === "cp1") {
      cg.state = "open";
      guardA = spawnGuard(R.wagonsA, 1);
      guardB = spawnGuard(R.wagonsB, 1);
      spawnPost(sentry.x, sentry.z, PI, 2, 0.7);
      spawnGuard(R.midway, 3);
    } else if (id === "cp2") {
      ringGuard = spawnGuard(ringRoute, 4);
      spawnGuard(R.ringB, 4);
      spawnPost(sentry.x, sentry.z, PI, 2, 0.7);
      spawnGuard(R.midway, 3);
    } else {
      // the back lot: two at the gate (heads turning on a 5 s rhythm), one sweeping the lot, the truck's driver
      const gl = R.gateL[0], gr = R.gateR[0];
      spawnPost(gl.x, gl.z, PI, 5, 0.9);
      spawnPost(gr.x, gr.z, PI, 5, 0.9);
      spawnGuard(lotRoute, 6);
      driver = spawnPost(DRIVER.x, DRIVER.z, Math.atan2(P.gateGap.x - DRIVER.x, P.gateGap.z - DRIVER.z), 7, 0);
      const g = circus.gate;
      if (id === "cp3") { g.opened = false; g.t = 0; }
      else { g.opened = gateAtCp4; if (gateAtCp4) g.t = 1; padT = 12; }
    }
  }
  // objective line, markers and stealth meter of a section (only once play is live)
  function sectionHud(id) {
    clearTools();
    if (id === "cage") {
      ui.setSeen(null);
      objective("Get out of the cage", K("L: Tail Slap", "Slap button"));
      goal(LATCH.x, circus.heightAt(P.cage.x, P.cage.z), LATCH.z);
      return;
    }
    ui.setSeen(0, "hidden");
    const sneak = K("Shift: sneak", "Sneak button");
    if (id === "cp1") {
      objective("Sneak into the big top", sneak);
      goal(P.doorWest.x, P.doorWest.y, P.doorWest.z);
      tool(P.bellPad); tool(P.generatorLever);
    } else if (id === "cp2") {
      objective("Cross the tent to the back flap", sneak);
      goal(P.doorNorth.x, P.doorNorth.y, P.doorNorth.z);
      tool(P.bottles); tool(P.drapeHide);
    } else if (id === "cp3") {
      objective("Get through the gate to the helicopter", sneak);
      goal(P.gate.x, P.gate.y, P.gate.z);
      tool(P.calliopeCrank); tool(P.gateGap);
    } else {
      objective("Climb into the helicopter!", K("E", "tap Climb in"));
      goal(P.heliSpot.x, circus.heightAt(P.heliSpot.x, P.heliSpot.z), P.heliSpot.z);
    }
  }
  function restoreFoot(id) {
    beginSection(id);
    sectionHud(id);
  }
  function footHud() {
    ui.showHud(true);
    ctx.abilities.buttons({ sting: true, slap: true, jump: true, down: "Sneak" });
    ctx.abilities.targets = combat.enemies;
  }

  // ---- beat 2: the cage ----
  function beginCage() {
    step = "cage";
    platypus.sleep(false);
    platypus.pose(null, 0.3);
    footHud();
    sectionHud("cage");
    player.enabled = true;
    ui.hint(K("Tail Slap (L) the glowing latch.", "Stand by the glowing latch and tap Slap."), 5);
  }
  function guardDist(g, p) { return Math.hypot(g.x - p.x, g.z - p.z); }
  function latchSlap() {
    const c = circus.cage;
    if (cg.state === "watch") {
      c.rattle(); A("cageRattle");
      ui.hint(K("Not while he is looking! Hide at the back (hold Shift).", "Not while he is looking! Hide at the back (hold Sneak)."), 2.8);
      return;
    }
    const broke = c.latch.hit();
    FX("hitBurst", v1.set(LATCH.x, LATCH.y, LATCH.z), 0xffe08a);
    cinema.shake(0.012, 0.15);
    A("tailSlapHit");
    const near = guardA && guardA.alive && cg.grace <= 0 && guardDist(guardA, P.cage) < 8;
    if (broke) { doorOpened(near || cg.state === "coming"); return; }
    A("cageRattle");
    objective("Get out of the cage (" + c.latch.hits + "/3)", K("L: Tail Slap", "Slap button"));
    if (near && cg.state === "patrol") {
      // noise: he comes to look. Hiding at the back sends him away again - the first stealth lesson costs nothing
      cg.state = "coming"; cg.t = 0;
      guardA.setRoute(null);
      guardA.goto(CAGE_FRONT.x, CAGE_FRONT.z, false);
      A("guardVoice", "huh", panOf(guardA.x, guardA.z), 0.3);
      ui.hint(K("A guard heard that! Crouch at the back of the cage: hold Shift.", "A guard heard that! Crouch at the back of the cage: hold Sneak."), 4.5);
    } else if (!told.slapMore) { told.slapMore = true; ui.hint("Again! Slap it while nobody is near.", 2.6); }
  }
  function doorOpened(heard) {
    const c = circus.cage;
    A("latchBreak");
    c.door.open();
    cg.state = "open";
    M("play", "stealth", { intensity: 0.25 });
    musInt = 0.25;
    // from here the guards are real
    const en = combat.enemies;
    for (let i = 0; i < en.length; i++) en[i].passive = false;
    if (guardA && guardA.alive) {
      guardA.setRoute(circus.routes.wagonsA);
      if (heard) guardA.distract(CAGE_FRONT.x, CAGE_FRONT.z, 5);
    }
    combat.showCones(true);
    ui.objectiveDone();
    objective("Sneak out of the cage", K("Shift: sneak", "Sneak button"));
    goal(P.cageOut.x, P.cageOut.y, P.cageOut.z);
    ui.setSeen(0, "hidden");
    ui.hint(K("Hold Shift to sneak. Stay out of the light cones.", "Hold Sneak to creep. Stay out of the light cones."), 5.5);
  }
  function updateCage(dt) {
    const g = guardA;
    if (cg.grace > 0) cg.grace -= dt;
    if (g && g.alive && cg.state === "coming") {
      cg.t += dt;
      if (guardDist(g, CAGE_FRONT) < 0.7 || cg.t > 9) { cg.state = "watch"; cg.t = 0; cg.nag = 1.2; }
    } else if (g && g.alive && cg.state === "watch") {
      const hid = sneaking && circus.hidden(player.x, player.z);
      if (hid) {
        cg.t += dt;
        if (cg.t >= 4) {
          // nothing to see: he shrugs and walks on
          cg.state = "patrol"; cg.grace = 7;
          g.setRoute(circus.routes.wagonsA);
          A("guardVoice", "lost", panOf(g.x, g.z), 0.2);
          ui.hint("He is leaving. Now: the latch!", 3);
        }
      } else {
        cg.t = 0;
        cg.nag -= dt;
        if (cg.nag <= 0) {
          cg.nag = 4;
          circus.cage.rattle(); A("cageRattle");
          A("guardVoice", "laugh", panOf(g.x, g.z), 0.1);
          ui.hint(K("He is watching. Crouch at the BACK of the cage: hold Shift.", "He is watching. Crouch at the BACK of the cage: hold Sneak."), 3.4);
        }
      }
    }
    if (circus.cage.door.opened && player.x > -28.3) reachCp1();
  }
  // beat 3: out of the cage. The guards are the same people (no reset), the checkpoint is behind the first wagon.
  function reachCp1() {
    const p = P.cp1;
    step = "wagons";
    ctx.checkpoint.set("cp1", { x: p.x, z: p.z, yaw: p.yaw || 0, label: "Checkpoint", restore: restoreFoot });
    applyAssist();
    ui.objectiveDone();
    sectionHud("cp1");
  }

  // ---- reaching cp2 / cp3 / cp4 ----
  function flash(c, text) {
    const g = gen, s = sect;
    if (c && c.pos) {
      combat.frozen = true;
      cinema.play([
        { shot: { pos: arr(c.pos), look: arr(c.look), fov: F(48), to: { pos: [c.pos.x + 0.5, c.pos.y + 0.25, c.pos.z + 0.4] }, dur: 2.3, ease: "inOut" } },
      ], { skippable: true, onDone: () => { if (g === gen) combat.frozen = false; } });
    }
    ctx.after(3.2, () => { if (g === gen && s === sect) ui.hint(text, 6); });
  }
  function reach(id) {
    const p = P[id];
    if (id === "cp4") gateAtCp4 = circus.gate.opened;
    ctx.checkpoint.set(id, { x: p.x, z: p.z, yaw: p.yaw || 0, label: id === "cp4" ? "Helipad" : "Checkpoint", restore: restoreFoot });
    ui.objectiveDone();
    if (id === "cp4") {
      // the guards you slipped past are still out there: they come back
      step = "heli";
      applyAssist();
      padT = 12; padStage = 0;
      sectionHud("cp4");
      ui.hint("The helicopter! Quick, before they come back.", 3.5);
      return;
    }
    beginSection(id);
    sectionHud(id);
    if (id === "cp2") flash(P.camRing, "Three ways across: under the seats, between the spotlights, or knock the bottles over.");
    else flash(P.camGate, "Skirt the lamplight. The calliope, the loose board, or the guards' backs...");
  }

  // ---- distractions and things to slap ----
  function ringBell() {
    const b = circus.distractions.bell, s = sect;
    b.trigger();
    A("tailSlapHit");
    ctx.after(0.45, () => { if (s === sect) combat.noise(b.x + 0.3, b.z + 1.4, b.radius || 12, 6); });
    hintOnce("bellDone", "DING! They go to look. Move!", 2.6);
  }
  function knockBottles() {
    const b = circus.distractions.bottles;
    if (b.used) return;
    b.trigger();
    // toward the ring, where a guard can stand
    const dx = circus.tent.x - b.x, dz = circus.tent.z - b.z, dl = Math.hypot(dx, dz) || 1;
    const nx = b.x + (dx / dl) * 2.2, nz = b.z + (dz / dl) * 2.2;
    if (ringGuard && ringGuard.alive) ringGuard.distract(nx, nz, 8);
    combat.noise(nx, nz, b.radius || 7, 6);
    hintOnce("bottlesDone", "CRASH! The ring guard comes to look. Slip round the other way.", 3.4);
  }
  function crank() {
    const c = circus.distractions.calliope;
    if (c.t >= 0) return;
    c.trigger();
    // they come to the far side of the wagon; the crank is on this side
    combat.noise(c.x + 0.5, c.z + 2.1, c.radius || 14, c.seconds || 10);
    ui.hint("It wheezes into a waltz. The gate guards are coming to look: go round!", 4);
  }
  function pullLever() {
    const d = circus.distractions.generator;
    if (circus.lights === "dark") return;
    A("leverPull");
    d.trigger();
    ui.hint("Lights out! Eight seconds of dark.", 3);
  }
  function openGate() {
    circus.gate.open();
    A("gateOpen", false); A("fenceRattle"); A("tailSlapHit");
    FX("hitBurst", v1.set(circus.gate.bar.x, circus.gate.bar.y, circus.gate.bar.z), 0xffe08a);
    cinema.shake(0.012, 0.15);
    combat.noise(P.gate.x, P.gate.z, 5, 4);
    ui.hint("The gate swings open. Go!", 2.4);
  }
  // a tail slap landed: was something slappable in reach?
  function slapSpecial() {
    const px = player.x, pz = player.z;
    if (step === "cage") {
      if (!circus.cage.door.opened && d2(px, pz, LATCH) < 2.9) { latchSlap(); return true; }
      return false;
    }
    if (d2(px, pz, P.bell) < 4.4) { ringBell(); return true; }
    if (!circus.gate.opened && d2(px, pz, P.gateBar) < 3.7) { openGate(); return true; }
    if (!circus.distractions.bottles.used && d2(px, pz, P.bottles) < 4.2) { knockBottles(); return true; }
    return false;
  }
  function findAct() {
    if (!player.enabled || cinema.playing || boarding || ctx.checkpoint.respawning) return null;
    const px = player.x, pz = player.z, D = circus.distractions;
    if (step === "cage") return !circus.cage.door.opened && d2(px, pz, LATCH) < 2.9 ? "latch" : null;
    if (step === "heli" && d2(px, pz, P.heliSpot) < 9.6) return "heli";
    if (pz < -10 && d2(px, pz, P.bell) < 4) return "bell";
    if (!D.bottles.used && d2(px, pz, P.bottles) < 4) return "bottles";
    if (D.calliope.t < 0 && d2(px, pz, P.calliopeCrank) < 3.6) return "calliope";
    if (circus.lights !== "dark" && d2(px, pz, P.generatorLever) < 3.3) return "generator";
    if (step === "lot" && !circus.gate.opened && d2(px, pz, P.gateBar) < 3.6) return "bar";
    return null;
  }

  // ---- attacks (LEVELS2.md Part C conventions) ----
  function attack(kind) {
    if (platypus.acting || player.lock > 0 || !player.grounded) return;
    if (kind === "pulse") { ui.hint("The pulse needs water!", 1.6); return; }
    if (kind === "sting" ? stingCd > 0 : slapCd > 0) return;
    const fin = combat.wouldFinish(kind);
    let t;
    if (fin) { platypus.finisher(); t = platypus.finisherHitTime || 0.4; player.lock = 0.6; }
    else if (kind === "slap") { platypus.tailSlap(); t = platypus.slapHitTime || 0.28; player.lock = 0.6; }
    else { platypus.sting(); A("sting"); t = platypus.stingHitTime || 0.15; player.lock = 0.22; }
    if (kind === "sting") stingCd = 0.45; else slapCd = 0.8;
    const s = sect, k = fin ? "finisher" : kind, slap = kind === "slap";
    ctx.after(t, () => {
      if (s !== sect || ending || inFlight) return;
      const special = slap && slapSpecial();
      const r = combat.strike(k);
      if (r.result === "miss" && slap && !special) A("tailSlap");
    });
  }
  function doInteract() {
    const a = findAct();
    if (!a) return;
    if (a === "heli") boardHeli();
    else if (a === "calliope") crank();
    else if (a === "generator") pullLever();
    else attack("slap");
  }
  function onCombat(type, a, b) {
    if (step === "boot" || inFlight || ending) return;
    if (type === "caught") {
      if (boarding || cinema.playing || ctx.checkpoint.respawning) return;
      lastCause = "caught";
      A("guardVoice", "laugh", panOf(a.x, a.z), 0);
      ctx.checkpoint.respawn({ text: "Caught! Try again" });
    } else if (type === "spotted") {
      if (dangerT <= 0) { dangerT = 4; M("stinger", "danger"); }
      hintOnce("spotted", "SPOTTED! Run, break their line of sight, and hide.", 3.6);
    } else if (type === "allClear") {
      ui.hint("They lost you.", 2);
    } else if (type === "down") {
      downs++;
      if (b === "takedown") { takedowns++; ui.call("TAKEDOWN", "silent", "perfect"); }
    }
  }

  function updateFoot(dt, time) {
    combat.update(dt, time);
    if (ending) return;
    if (stingCd > 0) { stingCd -= dt; ui.setCooldown("sting", Math.max(0, stingCd) / 0.45); }
    if (slapCd > 0) { slapCd -= dt; ui.setCooldown("slap", Math.max(0, slapCd) / 0.8); }
    if (dangerT > 0) dangerT -= dt;
    if (step === "intro" || boarding) return;
    const live = player.enabled && !cinema.playing && !ctx.checkpoint.respawning;
    const px = player.x, pz = player.z;

    // sneaking
    const want = live && ctx.input.held("down");
    if (want !== sneaking) setSneak(want, false);

    // the stealth read-out and the score
    if (cg.state === "open") {
      ui.setSeen(combat.seen, combat.alertState);
      const urgent = step === "heli" && padStage > 0 ? 0.15 : 0;
      const wantI = combat.alerted > 0 ? 0.3 + 0.7 * Math.min(1, combat.alerted / 2) : combat.alertState === "suspicious" ? 0.42 + urgent : 0.25 + urgent;
      if (Math.abs(wantI - musInt) > 0.04) { musInt = wantI; M("setIntensity", wantI, 1.2); }
    }

    setAct(findAct());
    if (!live) return;

    if (step === "cage") { updateCage(dt); return; }

    // the canvas flaps as you slip through a door
    const tx = px - circus.tent.x, tz = pz - circus.tent.z, inside = tx * tx + tz * tz < (circus.tent.r - 0.6) * (circus.tent.r - 0.6);
    if (inside !== wasInside) { wasInside = inside; A("canvasFlap", 0.5); }

    // the ring spotlights: standing in one fills `seen` three times faster
    let spot = false;
    if (inside) for (let i = 0; i < 2; i++) { const s = circus.spots[i]; if (d2(px, pz, s) < s.r * s.r) spot = true; }
    if (spot !== inSpot) {
      inSpot = spot;
      combat.seenRate = spot ? 3 : 1;
      if (spot) hintOnce("spot", "In the spotlight they see you three times faster!", 3.2);
    }

    // lessons, each given once, where it matters
    if (!told.behind) {
      const en = combat.enemies;
      for (let i = 0; i < en.length; i++) {
        const e = en[i];
        if (e.alive && !e.aware && !e.passive && d2(px, pz, e) < 5.8 && e.behind(px, pz)) {
          hintOnce("behind", K("Sting from behind! (J or click)", "Sting from behind! (the green button)"), 3.6);
          break;
        }
      }
    }
    if (!told.under && circus.hidden(px, pz)) hintOnce("under", "Hidden. Nobody can see you here.", 2.6);
    if (!told.light && !inside && circus.lit(px, pz) > 0.6) hintOnce("light", "Lamplight! They see much farther here.", 3);

    if (step === "wagons") {
      if (!told.crawl) { const w = circus.wagons; for (let i = 0; i < w.length; i++) if (d2(px, pz, w[i]) < 16) { hintOnce("crawl", "Crawl UNDER the wagons: guards cannot follow or see you there.", 4.5); break; } }
      if (!told.bell && d2(px, pz, P.bell) < 30) hintOnce("bell", K("The high striker! Tail Slap (L) it from behind: the guards go to look.", "The high striker! Slap it from behind: the guards go to look."), 5);
      if (!told.sentry && d2(px, pz, P.doorSouth) < 90 && pz < -9) hintOnce("sentry", "The main entrance is lit and guarded. Try the west door.", 4);
    } else if (step === "tent") {
      if (!told.bottles && d2(px, pz, P.bottles) < 20) hintOnce("bottles", K("Bottles! Knock them over (E) to pull the ring guard away.", "Bottles! Knock them over to pull the ring guard away."), 4.5);
    } else if (step === "lot") {
      // the driver looks away only while he lights his lantern: 3 s in every 9
      drvT += dt;
      const away = drvT % 9 > 6;
      if (away !== drvAway) {
        drvAway = away;
        if (driver && driver.alive && !driver.aware && driver.state === "idle") {
          const yaw = Math.atan2(P.gateGap.x - DRIVER.x, P.gateGap.z - DRIVER.z);
          driver.face(away ? yaw + 2.3 : yaw);
          if (away) { FX("sparkle", v1.set(driver.x + 0.3, 1.1, driver.z), 0xffc060, 6); A("guardVoice", "yawn", panOf(driver.x, driver.z), 0.5); }
        }
      }
      if (!told.calliope && d2(px, pz, P.calliopeCrank) < 30) hintOnce("calliope", K("The calliope! Crank it (E): both gate guards will come to look.", "The calliope! Crank it: both gate guards will come to look."), 5);
      if (!told.gap && d2(px, pz, P.gateGap) < 60) hintOnce("gap", "A loose board! The driver looks away while he lights his lantern.", 5);
      if (!told.bar && !circus.gate.opened && d2(px, pz, P.gateBar) < 9) hintOnce("bar", K("Tail Slap (L) the bar to open the gate.", "Slap the bar to open the gate."), 4);
      // squeezing through the loose board
      if (gapT > 0) gapT -= dt;
      else if (Math.abs(pz - P.gate.z) < 0.45 && Math.abs(px - P.gateGap.x) < 0.6) { gapT = 2; A("fenceRattle"); }
    } else if (step === "heli") {
      // urgency: they return to their posts, then come looking
      if (padT > 0) {
        padT -= dt;
        if (padT <= 0) {
          if (padStage === 0) {
            padStage = 1; padT = 13;
            combat.calm();
            A("guardVoice", "search", 0, 0.5);
            ui.hint("They are coming back. Into the helicopter!", 3.5);
          } else {
            padStage = 2;
            const en = combat.enemies;
            for (let i = 0; i < en.length; i++) if (en[i].alive) en[i].alert(px, pz);
            ui.hint("They have seen you. RUN to the helicopter!", 3.5);
          }
        }
      }
    }

    // checkpoints by where you are (any route is a good route)
    if (step === "wagons" && inside) reach("cp2");
    else if ((step === "wagons" || step === "tent") && !inside && pz > 26.2 && pz < 38.4) reach("cp3");
    else if (step !== "heli" && pz > P.gate.z + 0.75) reach("cp4");
  }

  // =====================================================================================================
  // PART 3 - the flight
  // =====================================================================================================
  function clearGates() {
    for (let i = 0; i < gateH.length; i++) { if (gateH[i]) gateH[i].remove(); gateH[i] = null; }
  }
  function resetGates() {
    clearGates();
    const G = flight.gates;
    gateNext = 0;
    while (gateNext < G.length && G[gateNext].z <= craft.z + 4) gateNext++;
  }
  function clearLanding() {
    if (landBeacon) landBeacon.remove();
    if (landRing) landRing.remove();
    landBeacon = landRing = null;
  }
  function flightObjective() {
    if (coughing) objective("Find somewhere to land!", K("Shift: down", "Down button"));
    else if (step === "takeoff" && craft.z < 40) objective("Take off!", K("Space: up  ·  W: forward", "Jump: up  ·  stick: forward"));
    else objective("Fly to the jungle: follow the rings", K("Space: up  ·  Shift: down", "Jump: up  ·  Down: down"));
  }

  // beat 7: climb in, start her up, and the world changes under the pad lamps
  function boardHeli() {
    if (boarding || inFlight) return;
    boarding = true;
    const g = gen, c = P.camPad, T = flight.P.camTakeoff;
    setAct(null);
    setSneak(false, true);
    ui.setSeen(null);
    ui.objectiveDone();
    objText = null;
    goal(null); clearTools();
    player.enabled = false;
    heliCol.on = false;
    ctx.vehicle.enter(craft, { seat: craft.seat });
    craft.locked = true;
    cinema.play([
      { shot: { pos: arr(c.pos), look: craft.group, lookY: 1.2, fov: F(40), to: { pos: [c.pos.x - 1.6, c.pos.y - 0.7, c.pos.z + 1.4] }, dur: 5.4, ease: "inOut" }, hold: false },
      { wait: 0.8 },
      { call: () => { A("friendChirp", "curious", 0.8, 0); } },
      { wait: 0.7 },
      { call: () => { A("leverPull"); craft.startEngine(); heliSound(true); } },
      { wait: 1.1 },
      { call: () => {
        // shouts behind, the hand siren, every lamp on
        A("guardVoice", "alert", -0.6, 0.5); A("siren", true, "circus");
        circus.setLights("alarm", 30);
        const en = combat.enemies;
        for (let i = 0; i < en.length; i++) if (en[i].alive) en[i].alert(P.heliSpot.x, P.heliSpot.z);
      } },
      { wait: 1.0 },
      { call: () => { A("guardVoice", "hey", 0.5, 0.4); } },
      { wait: 1.5 },
      { fade: "white", dur: 0.2 },
      { call: () => { if (g === gen) toFlight(); } },
      { shot: { pos: arr(T.pos), look: craft.group, lookY: 1.2, fov: F(42), dur: 0.9 }, hold: false },
      { fade: "clear", dur: 0.5 },
      { wait: 0.4 },
    ], { skippable: true, release: 0.7, onSkip: () => { if (g === gen) toFlight(); }, onDone: () => { if (g === gen) beginFlight(); } });
  }
  // the corridor's stand-in circus is at the same place: swap worlds, sit the craft on its pad with the rotor at speed
  function toFlight() {
    if (inFlight) return;
    A("circusAmbience", false); A("siren", false, "circus");
    combat.reset();
    toFlightWorld();
    flight.reset();
    craft.reset();
    craft.place(0, 0.05, 0, 0);
    craft.launch(0);
    if (!ctx.vehicle.active) ctx.vehicle.enter(craft, { seat: craft.seat });
    craft.locked = true;
    heliSound(true);
    flightInt = 0.2;
    M("play", "flight", { intensity: 0.2, at: "now" });
    resetGates();
    ui.setSeen(null);
    setAct(null);
  }
  function beginFlight() {
    boarding = false;
    step = "takeoff";
    craft.locked = false;
    player.enabled = true;
    ui.showHud(true);
    ui.flight.show(true);
    ctx.abilities.buttons({ jump: true });
    ctx.checkpoint.set("pad", { label: AIR_LABEL.pad, restore: restoreAir });
    applyAssist();
    tut = 0; tutT = 0.4;
    flightObjective();
  }
  function cpOf(id) {
    const C = flight.checkpoints;
    for (let i = 0; i < C.length; i++) if (C[i].id === id) return C[i];
    return C[0];
  }
  // restore of every air checkpoint: the craft back in the air at the checkpoint's speed, hull whole, lights reset
  function restoreAir(id) {
    const c = cpOf(id);
    sect++;
    flight.reset();
    if (flight.resetLights) flight.resetLights();
    craft.reset();
    craft.place(c.x || 0, c.y, c.z, c.yaw || 0);
    craft.launch(c.speed || 0);
    craft.hull = 1; craft.rpmLimit = 1;
    applyAssist();
    coughing = false; coughT = 0; beamT = 0; humLv = 0; archDone = false; backT = 0; landHintT = 0;
    A("warnBeep", false); A("searchlightHum", 0);
    if (jungleAmb && c.z < 760) { jungleAmb = false; A("jungleAmbience", false); }
    clearLanding();
    resetGates();
    birdsZ = Math.max(790, c.z + 30);
    cam.yaw = craft.yaw; cam.tx = craft.x; cam.ty = craft.y + 1.3; cam.tz = craft.z;
    step = AIR_STEP[id] || "takeoff";
    if (id === "pad") { tut = 0; tutT = 0.6; }
    flightInt = AIR_INT[id] === undefined ? 0.2 : AIR_INT[id];
    const m = ctx.music;
    if (m && (m.pending || m.state) !== "flight") M("play", "flight", { intensity: flightInt, at: "now" });
    else M("setIntensity", flightInt, 0.6);
    M("duck", 0, 0.2);
    objText = null;
    flightObjective();
  }
  function airCp(id) {
    step = AIR_STEP[id];
    ctx.checkpoint.set(id, { label: AIR_LABEL[id], restore: restoreAir });
    applyAssist();
    if (AIR_INT[id] > flightInt) { flightInt = AIR_INT[id]; M("setIntensity", flightInt, 2); }
    objText = null;
    flightObjective();
  }
  function startCough() {
    if (coughing) return;
    coughing = true; coughT = 0;
    step = "landing";
    craft.rpmLimit = 0.83; // below the 0.85 it takes to climb, but a long, flat glide: the clearing is reachable from the rings' height
    A("warnBeep", true);
    cinema.shake(0.02, 0.4);
    M("play", "stealth", { intensity: 0.8, at: "now" });
    objText = null;
    flightObjective();
    ui.hint("The engine is coughing! You cannot climb: glide to the clearing.", 5);
    const L = flight.landing, gy = flight.heightAt(L.x, L.z);
    clearLanding();
    landBeacon = FX("beacon", L.x, gy, L.z, 0xffe08a) || null;
    landRing = FX("ringGate", L.x, gy + 7, L.z, 0, 9, 0xffe08a) || null;
  }

  function onCrash(cause) {
    if (step === "boot" || ending || !inFlight) return;
    ui.hurtFlash();
    A("warnBeep", false); A("searchlightHum", 0); humLv = 0;
    if (coughing || craft.z > 1080) { endFlight(false); return; }
    lastCause = cause || "ground";
    ctx.checkpoint.respawn({ text: cause === "wire" ? "Wires! Try again" : cause === "shot" ? "Shot down! Try again" : "Try again" });
  }
  function onScrape() {
    if (step === "boot" || ending || !inFlight) return;
    ui.hurtFlash();
    cinema.shake(0.02, 0.25);
  }
  function onLand(v, where) {
    if (step === "boot" || ending || !inFlight) return;
    if (coughing || craft.z > 1080) { endFlight(true, where && where.inZone); return; }
    if (craft.z > 12 && landHintT <= 0) { landHintT = 6; ui.hint(K("Down safe. Hold Space to take off again.", "Down safe. Hold Jump to take off again."), 3); }
  }

  function updateGates() {
    const G = flight.gates;
    while (gateNext < G.length && craft.z >= G[gateNext].z) {
      const g = G[gateNext], h = gateH[gateNext];
      const dx = craft.x - g.x, dy = craft.y + 1.3 - g.y, r = g.r + 0.6;
      if (dx * dx + dy * dy < r * r) {
        if (h) h.pass();
        gateCount++;
        A("armyUp", gateCount);
        craft.hull = Math.min(1, craft.hull + 0.08);
        flightInt = Math.min(1, flightInt + 0.05);
        M("setIntensity", flightInt, 1.5);
      } else if (h) h.remove();
      gateH[gateNext] = null;
      gateNext++;
    }
    const n = Math.min(G.length, gateNext + 3);
    for (let i = gateNext; i < n; i++) {
      if (gateH[i]) continue;
      const g = G[i];
      gateH[i] = FX("ringGate", g.x, g.y, g.z, g.yaw, g.r, i === gateNext ? 0xffe08a : 0x8fe9ff) || NOH;
    }
  }
  function burst(sl) {
    // tracers come up from the ground: the hull takes it
    const gy = flight.heightAt(sl.x, sl.z);
    v1.set(sl.x, (typeof sl.y === "number" ? sl.y : gy + 2), sl.z);
    for (let i = 0; i < 3; i++) {
      v2.set(craft.x + (i - 1) * 1.6, craft.y + 1.2 + (i - 1) * 0.5, craft.z + (i - 1) * 1.2);
      FX("tracer", v1, v2, 110, 0xffe9a0);
    }
    const pan = panOf(sl.x, sl.z), s = sect;
    A("gunshot", 0.8, pan, "rifle");
    ctx.after(0.12, () => { if (s === sect) A("gunshot", 0.8, pan, "rifle"); });
    ui.hurtFlash();
    cinema.shake(0.025, 0.25);
    lastCause = "shot";
    hintOnce("shot", "They are shooting! Get out of the beam.", 3);
    if (craft.damage) craft.damage(0.2, "shot");
    else { craft.hull -= 0.2; if (craft.hull <= 0 && craft.crash) craft.crash("shot"); }
  }
  function tutorial(dt) {
    if (tut > 4) return;
    let text = null;
    const alt = craft.altitude, z = craft.z;
    if (tut === 0) { if (alt >= 4) { tut = 1; tutT = 0; } else text = K("Hold Space to climb.", "Hold Jump to climb."); }
    if (tut === 1) { if (alt >= 9 || z > 24) { tut = 2; tutT = 0; } else text = "Careful: wires ahead! Climb above them first."; }
    if (tut === 2) {
      if (z > 60) { tut = 3; tutT = 0; }
      else text = K("W: nose down to fly forward. Keep holding Space or you sink.", "Stick forward: nose down. Keep holding Jump or you sink.");
    }
    if (tut === 3) {
      ui.hint(K("A / D to turn. Shift to descend.", "Stick left / right to turn. The Down button descends."), 6);
      tut = 4; tutT = 9;
      return;
    }
    if (tut === 4) {
      tutT -= dt;
      if (tutT <= 0 || z > 150) { tut = 5; if (z < 160) ui.hint("Fly through the rings: each one mends the hull a little.", 5); }
      return;
    }
    if (!text) return;
    tutT -= dt;
    if (tutT <= 0) { tutT = 5.5; ui.hint(text, 4.6); }
  }

  function updateFlight(dt) {
    // the seated model does not walk
    player.speed = 0; player.moving = false; player.grounded = true;
    if (ending || boarding || step === "done") return;
    if (ctx.checkpoint.respawning) return;
    const z = craft.z;
    if (landHintT > 0) landHintT -= dt;

    // air checkpoints (about every 30 s of flying)
    if (!craft.crashed && !coughing) {
      if (step === "takeoff" && z >= 150) airCp("fields");
      else if ((step === "takeoff" || step === "fields") && z >= 400) airCp("valley");
      else if ((step === "takeoff" || step === "fields" || step === "valley") && z >= 760) airCp("jungle");
    }
    if (step === "takeoff" && objText === "Take off!" && z >= 40) { objText = null; flightObjective(); }

    updateGates();

    // searchlights: in a beam for 1.2 s and the tracers come up
    let warn = flight.warning(craft), lit = null;
    if (z > 230 && z < 430 && !craft.crashed) {
      const S = flight.searchlights;
      for (let i = 0; i < S.length; i++) if (S[i].inBeam(craft.x, craft.y, craft.z)) lit = S[i];
    }
    if (lit) {
      beamT += dt;
      warn = "SEARCHLIGHT";
      hintOnce("beam", "A searchlight has you! Move out of the beam.", 2.6);
      if (beamT >= 1.2) { beamT = 0.3; burst(lit); }
    } else if (beamT > 0) beamT = Math.max(0, beamT - dt * 1.5);
    const hum = lit ? clamp(0.25 + beamT / 1.2, 0, 1) : 0;
    if (Math.abs(hum - humLv) > 0.05 || (hum === 0 && humLv !== 0)) { humLv = hum; A("searchlightHum", hum); }
    if (ending || ctx.checkpoint.respawning) return; // the burst may have brought her down

    // do not wander off behind the circus
    if (z < -70) { warn = "TURN BACK"; craft.vz += 7 * dt; backT -= dt; if (backT <= 0) { backT = 5; ui.hint("Wrong way! The jungle is ahead.", 3); } }

    ui.flight.set(craft.altitude, craft.speed, craft.vy, craft.hull, warn, 40);

    if (step === "takeoff") tutorial(dt);

    // section lessons, once each
    if (z > 165 && z < 215) hintOnce("power", "Power lines! Go OVER them (climb now), or low underneath.", 4.5);
    else if (z > 245 && z < 300) hintOnce("lights", "Searchlights! Slip past between the sweeps, or climb above 30 m.", 5);
    else if (z > 402 && z < 440) hintOnce("valley", "Down into the valley. Through the bridge arch, if you dare!", 4.5);
    else if (z > 545 && z < 580) hintOnce("ridge", "Radio towers and gusts. Watch the streaks: they show the wind.", 5);
    else if (z > 765 && z < 800) hintOnce("dawn", "Dawn! Stay above the canopy and weave between the giants.", 4.5);
    if (!told.gust && flight.gust && flight.gust.phase === "warn") hintOnce("gust", K("A gust is coming: steer into it (A / D).", "A gust is coming: steer into it."), 3.5);
    if (!told.hull && craft.hull < 0.45 && !craft.crashed) hintOnce("hull", "The hull is weak! Fly through a ring to mend it.", 4);

    // through the arch earns a flourish
    if (!archDone && flight.inArch && flight.inArch(craft.x, craft.y, craft.z)) {
      archDone = true;
      M("motif", "platypus");
      ui.hint("Nice flying!", 2.4);
    }

    // the jungle: birds lift as you pass
    if (z > 760 && !jungleAmb) { jungleAmb = true; A("jungleAmbience", true, "dawn"); }
    if (z > birdsZ && z > 790 && z < 1100) {
      birdsZ = z + 50 + Math.random() * 30;
      const side = Math.random() < 0.5 ? -1 : 1, bx = craft.x + side * (10 + Math.random() * 10), bz = z + 34;
      const cy = flight.canopyAt ? flight.canopyAt(bx, bz) : -Infinity;
      FX("birds", bx, cy > -1e6 ? cy + 0.5 : flight.heightAt(bx, bz) + 18, bz, 10, side * 0.6, 0.5);
      A("birdsFlush", 8, panOf(bx, bz));
    }

    // z 1000: the engine coughs. From here any ground contact is the landing.
    if (!coughing && z >= 1000 && !craft.crashed) startCough();
    if (coughing) {
      coughT += dt;
      // it sags further over the clearing (or if you dawdle): you cannot stay up
      const lim = coughT > 45 ? 0.5 : (z > 1140 || coughT > 16) ? 0.7 : 0.83;
      if (craft.rpmLimit !== lim) { craft.rpmLimit = lim; cinema.shake(0.015, 0.3); }
      if (craft.grounded && craft.rpm < 0.85) endFlight(true, flight.inLanding(craft.x, craft.z));
      else if (z > flight.length - 12 || coughT > 70) { if (craft.crash) craft.crash("ground"); else endFlight(false); }
    }
  }

  // beat 15: the landing. Soft or hard, the flight ends here: branches, a crunch, black.
  function whip() {
    FX("leaves", craft.x - 1.5, craft.y + 2.2, craft.z + 1, 26, 0x4f8a3a);
    FX("leaves", craft.x + 1.8, craft.y + 1.4, craft.z - 1.5, 22, 0x6aa04a);
    FX("birds", craft.x, craft.y + 3, craft.z, 12, 0, 0);
  }
  function endFlight(soft, inZone) {
    if (ending) return;
    ending = true;
    step = "end";
    sect++;
    const g = gen;
    player.enabled = false;
    craft.locked = true;
    A("warnBeep", false); A("searchlightHum", 0);
    ui.setObjective(null); objText = null;
    clearGates(); clearLanding();
    const toBlack = () => {
      if (g !== gen) return;
      cinema.fade("black", 0.06, () => { if (g === gen) inBlack(g); });
    };
    if (soft) {
      // down in one piece: a proud chirp ... and then the tail rotor clips a branch anyway
      A("friendChirp", "happy", 1, 0);
      ui.call(inZone ? "LANDED!" : "DOWN!", "", "perfect");
      cinema.after(1.25, () => {
        if (g !== gen) return;
        ctx.setTimeScale(0.4, 0.05);
        whip();
        FX("crashSparks", v1.set(craft.x - Math.sin(craft.yaw) * 3.2, craft.y + 1.6, craft.z - Math.cos(craft.yaw) * 3.2), 24);
        A("crash", 0.8);
        cinema.shake(0.05, 0.35);
        M("duck", 1, 0.2);
        cinema.after(0.4, toBlack);
      });
    } else {
      // the crash IS the story (heli.js has already played the crunch and the sparks)
      ctx.setTimeScale(0.4, 0.05);
      whip();
      cinema.shake(0.05, 0.35);
      M("duck", 1, 0.2);
      cinema.after(0.55, toBlack);
    }
  }
  function inBlack(g) {
    ctx.setTimeScale(1, 0);
    heliSound(false, true);
    A("wind", 0); A("rotorWash", 0);
    FX("windStreaks", false, 0, 0, 0);
    ui.showHud(false);
    ui.flight.show(false);
    // black, 2 s: dripping leaves, one bird
    A("jungleAmbience", true, "mist");
    cinema.after(1.1, () => { if (g === gen) A("birdsFlush", 1, 0.4); });
    cinema.after(2.6, () => {
      if (g !== gen) return;
      step = "done";
      M("stop", 0.4);
      ui.showComplete({ kicker: "LEVEL 7", title: "COMPLETE", sub: "Down in the jungle. Alive." }, () => ctx.complete());
    });
  }

  // =====================================================================================================
  // starters (the intro, and the debug jumps)
  // =====================================================================================================
  function setupIntro() {
    toCircus();
    beginSection("cage");
    player.teleport(P.cage.x, P.cage.z, P.cage.yaw || PI / 2);
    ctx.checkpoint.set("cage", { x: P.cage.x, z: P.cage.z, yaw: P.cage.yaw || PI / 2, silent: true, restore: restoreFoot });
    platypus.sleep(true);
    step = "intro";
  }
  // beats 1-2: title card, the first look through the bars
  function start() {
    const g = gen;
    cinema.titleCard({ kicker: "LEVEL 7", title: "THE CIRCUS" }, () => {
      if (g !== gen || step !== "intro") return;
      const c = P.camCage;
      cinema.play([
        { shot: { pos: arr(c.pos), look: arr(c.look), fov: F(52), to: { pos: [c.pos.x + 0.25, c.pos.y + 0.1, c.pos.z + 0.2] }, dur: 9, ease: "inOut" }, hold: false },
        { fade: "clear", dur: 2.0 },
        { wait: 1.8 },
        { call: () => { platypus.sleep(false); platypus.wakeStretch(); } },
        { wait: 2.3 },
        { call: () => { platypus.pose("scared", 0.3); A("friendChirp", "scared", 0.8, 0); } },
        { shot: { pos: [P.cage.x + 0.85, P.cage.y + 0.62, P.cage.z + 0.68], look: platypus.group, lookY: 0.2, fov: F(38), to: { pos: [P.cage.x + 1.05, P.cage.y + 0.56, P.cage.z + 0.45] }, dur: 3.6 }, hold: false },
        { caption: "This is not the zoo.", dur: 3.4, narr: true },
        { call: () => { platypus.pose(null, 0.5); FX("sparkle", v1.set(LATCH.x, LATCH.y, LATCH.z), 0xffe08a, 8); } },
        { shot: { pos: [P.cage.x - 0.7, P.cage.y + 0.85, P.cage.z - 0.72], look: [LATCH.x, LATCH.y - 0.5, LATCH.z], fov: F(36), dur: 1.9 } },
      ], { skippable: true, onSkip: () => { platypus.sleep(false); platypus.pose(null, 0); }, onDone: () => { if (g === gen) beginCage(); } });
    });
  }
  function startFoot(id) {
    hardStop();
    toCircus();
    const p = id === "cage" ? P.cage : P[id];
    if (id === "cp4") { circus.gate.open(); circus.gate.t = 1; gateAtCp4 = true; }
    beginSection(id);
    player.teleport(p.x, p.z, p.yaw || 0);
    ctx.checkpoint.set(id, { x: p.x, z: p.z, yaw: p.yaw || 0, silent: true, label: id === "cp4" ? "Helipad" : "Checkpoint", restore: restoreFoot });
    applyAssist();
    footHud();
    sectionHud(id);
    if (id !== "cage") {
      cg.state = "open";
      combat.showCones(true);
      musInt = 0.25;
      M("play", "stealth", { intensity: 0.25, at: "now" });
    }
    player.enabled = true;
    cinema.fade("clear", 0.6);
  }
  function startAir(id, cough) {
    hardStop();
    toFlight();
    boarding = false;
    ctx.checkpoint.set(id, { silent: true, label: AIR_LABEL[id], restore: restoreAir });
    restoreAir(id);
    if (cough) {
      // the last stretch: on the clear line, the engine about to go
      craft.place(-2, 30, 998, 0);
      craft.launch(16);
      cam.tx = craft.x; cam.ty = craft.y + 1.3; cam.tz = craft.z;
      resetGates();
      birdsZ = 1030;
      jungleAmb = true; A("jungleAmbience", true, "dawn");
      told.dawn = true;
    }
    tut = id === "pad" ? 0 : 5;
    craft.locked = false;
    player.enabled = true;
    ui.showHud(true);
    ui.flight.show(true);
    ctx.abilities.buttons({ jump: true });
    cinema.fade("clear", 0.6);
  }

  // =====================================================================================================
  // level interface
  // =====================================================================================================
  function enter() {
    hardStop();
    if (ctx.colliders.indexOf(heliCol) < 0) ctx.colliders.push(heliCol);
    combat.onEvent = onCombat;
    craft.onCrash = onCrash; craft.onScrape = onScrape; craft.onLand = onLand;
    ctx.checkpoint.onRespawn = onRespawn;
    // compile the corridor's shaders now, behind black (a first activation mid-level would hitch and clear the fx)
    if (!flight.warmed) toFlightWorld();
    setupIntro();
  }

  function update(dt, time) {
    if (step === "boot") return;
    craft.update(dt, time);
    if (inFlight) updateFlight(dt);
    else if (step !== "done") updateFoot(dt, time);
  }

  function onAction(name) {
    if (step === "boot" || step === "intro" || step === "done" || ending || inFlight || boarding) return false;
    if (!player.enabled || ctx.checkpoint.respawning) return false;
    if (name === "interact") { doInteract(); return false; }
    const kind = name === "primary" ? "sting" : name === "tailSlap" ? "slap" : name === "secondary" ? "pulse" : null;
    if (!kind) return false;
    attack(kind);
    return true;
  }

  function exit() {
    hardStop();
    cinema.tint(null);
    combat.onEvent = null;
    craft.onCrash = craft.onScrape = craft.onLand = null;
    ctx.checkpoint.onRespawn = null;
    FX("setGround", null, null);
    step = "boot";
  }

  function win() {
    if (step === "done" || step === "boot") return;
    hardStop();
    step = "done";
    ui.showComplete({ kicker: "LEVEL 7", title: "COMPLETE", sub: "Down in the jungle. Alive." }, () => ctx.complete());
  }

  function skipTo(name) {
    if (step === "boot" || STEPS.indexOf(name) < 0) return false;
    switch (name) {
      case "intro": hardStop(); setupIntro(); start(); break;
      case "cage": startFoot("cage"); break;
      case "wagons": startFoot("cp1"); break;
      case "tent": startFoot("cp2"); break;
      case "lot": startFoot("cp3"); break;
      case "heli": startFoot("cp4"); break;
      case "takeoff": startAir("pad", false); break;
      case "fields": case "valley": case "jungle": startAir(name, false); break;
      case "landing": startAir("jungle", true); break;
      default: win();
    }
    return true;
  }

  return {
    build, enter, start, update, exit, onAction, skipTo, win,
    state() {
      const r1 = (v) => Math.round(v * 10) / 10;
      return {
        step, checkpoint: ctx.checkpoint.id, tries: ctx.checkpoint.tries,
        seen: combat ? Math.round(combat.seen * 100) / 100 : 0, alerted: combat ? combat.alerted : 0, alertState: combat ? combat.alertState : "hidden",
        takedowns, downs, guards: combat ? combat.alive : 0, latch: circus ? circus.cage.latch.hits : 0, cage: cg.state,
        gate: circus ? circus.gate.opened : false, flying: inFlight, gates: gateCount, coughing,
        alt: inFlight && craft ? r1(craft.altitude) : 0, speed: inFlight && craft ? r1(craft.speed) : r1(player.speed || 0),
        hull: craft ? Math.round(craft.hull * 100) / 100 : 1, z: r1(inFlight && craft ? craft.z : player.z),
      };
    },
    STEPS,
  };
}
