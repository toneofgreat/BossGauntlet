// src/games/showdown/scripts/wardens.js - the Rogue Wardens. Spec 25 §9 owns this file:
// TUNE.WARDEN_COUNT welded metal drums per round, on every ground, in a solo round and in
// a room of twenty alike. They wake six seconds in, walk the ground in a straight line,
// freeze and flare before they lunge, hurt you only inside the lunge, and can be broken.
//
// THEY ARE HAZARDS, NEVER PLAYERS, AND NOTHING IN THIS FILE CAN MAKE THEM ONE
// (ARCHITECTURE §9, spec 25 §9.1). A Warden is a drum with one unblinking eye, numbered on
// its back in neon, in the lineage of spec 24's Keepers and spec 26's training dummies. It
// is moved by this module and by nothing else. It appears in no roster, no net.count(), no
// alive set, no leaderboard and no spectate target list, and nothing about it is published
// - not even as a cause of death. §5.5 is explicit that `ki.by` is null for a Warden
// lunge: a prop reported as a killer is exactly what ARCHITECTURE §9 forbids, and a peer
// reading `ki.by === SELF_ID` must never be credited a kill nobody made. So this module
// never touches ctx.services.net at all, and the only thing it hands back to game.js is a
// damage number and an index.
//
// THE DRUM IS A SENSOR: canCollide:false WITH one behaviour, which is what the engine
// turns into a sensor collider - canCollide:false with NO behaviour registers no collider
// at all, the same part WITH one registers a sensor. It is never a solid body, for the two
// reasons TUNE.WARDEN_TAG_R's own comment writes down:
//   - a solid collider of radius r holds the player at >= r + 1 studs centre to centre,
//     because the player capsule's radius is 1, so a drum three studs wide could never
//     reach its own telegraph radius and the telegraph/lunge cycle would never start;
//   - a solid part moved with parts.setPosition carries no collider motion at all
//     (setColliderMotion is not on ctx.engine.physics), so a walking solid drum would
//     SHOVE the player out through penetration resolution instead of pushing them.
// The behaviour is `touchEvent`, the same thing that makes a weapon pad a sensor (§7.2),
// with `once: true` and an event name nothing in this Place listens for. That is not an
// oversight: a Warden hurts you from inside its lunge window and from nowhere else, so the
// touch is not the weapon - the behaviour is there because a sensor is what the contract
// fixes the drum as, and a hazard you can walk through is the opposite of a wall.
//
// TELEGRAPH DISCIPLINE (§9.3, and spec 21's rule that the warning lives on the emitter).
// Inside TUNE.WARDEN_TAG_R the drum does not simply touch you: it freezes, LOCKS the line
// it is going to travel, flares its eye and both welded bands for WARDEN_TELEGRAPH_S, and
// only then lunges for WARDEN_LUNGE_S. The lock is the whole point. A drum that kept
// tracking you through its own wind-up would make the flare decoration - there would be
// nothing to dodge into and only leaving the radius would work. Locked, a sidestep beats
// it and nine tenths of a second of flare is a real answer. Nothing instant, nothing off
// screen: the audio cues below are distance-gated for the same reason.
//
// REACHABILITY IS THE MECHANIC (§9.5), not a nicety. Both the forest and the city are
// built around canopy walkways and rooftops, so a drum that could be out-waited on a high
// platform would make 240 s of standing still a free Fighting Point, 25 Oofbux and - no
// hits taken, the clock always expiring at zero - the `untouched` and `photo-finish`
// badges as well, which would turn the 1000-win unlock into about eighty hours of standing
// still. So a drum that cannot CLOSE on its target for WARDEN_LOST_S reassembles on the
// target's own platform and carries on from there.
//
// Straight-line pressure and no pathfinding: it walks at you, it rolls over a kerb, and
// anything taller than a kerb is §9.5's business rather than the walker's. WARDEN_SPEED is
// 9 / 11 / 13 against a fighter's 20 (§9.7), so a fighter who keeps moving is never
// cornered by speed alone - which is what makes these pressure and not a death sentence.
//
// WHAT `brokenCount()` COUNTS, said plainly because a sibling module could read it either
// way: the number of DISTINCT drums broken at least once since spawnAll, not the number
// lying broken right now. §9.6 wins a solo round for "the only fighter has broken all
// three" and §13.3's `warden-breaker` badge is "break all three in one round"; with a
// WARDEN_RESPAWN_S of 18 s the instantaneous reading would instead demand all three inside
// eighteen seconds of each other and would flip back to false the moment the first one
// stood up again. `list()` reports every drum's own `state`, so a caller that wants the
// instantaneous count can count it without this module guessing which it meant.
//
// Every part is created through ctx.engine.parts.create and every one is removed in
// clear(), which game.js calls at the end of a round and again in dispose. There is no
// module-level mutable state in this file: it all lives in the closure create() returns, so
// a second init after a dispose starts clean by construction. The drums cost about eleven
// parts each and are budgeted against TUNE.MAP_PARTS_MAX with the ground and the weapon
// props (§3.2).

import { TUNE } from "./config.js";
import { uid } from "./world.js";

// =====================================================================================
// Geometry and feel. Every number here is either derived from TUNE or is a local shape
// number TUNE does not hold; nothing re-states a value config.js already owns.
// =====================================================================================

const DEG = 180 / Math.PI;

// The envelope no part of a drum may leave: §9.2 caps the drum at TUNE.WARDEN_BODY_W_MAX
// studs wide so WARDEN_TAG_R always wins, and the cheapest way to keep that true as the
// model gains fittings is to measure every offset against one radius.
const ENV_R = TUNE.WARDEN_BODY_W_MAX / 2;
// The hull sits half a stud inside the envelope so the eye can bulge and the welded bands
// can stand proud of it while the whole silhouette still fits WARDEN_BODY_W_MAX.
const HULL_D = TUNE.WARDEN_BODY_W_MAX - 0.5;

// How far the lunge reaches. It is the same arithmetic TUNE.WARDEN_TAG_R's comment quotes
// for a solid body - collider radius plus the player capsule's 1 - so the hit lands when
// the drum arrives on you rather than at the moment it commits. Testing the tag radius
// itself would deal the damage 4.5 studs early, with the drum still visibly short of you.
const CONTACT_R = ENV_R + 1;

// The lunge covers exactly its own telegraph radius in its own lunge window: it always
// crosses the gap it committed to and never more. Written as the division rather than as a
// speed so it cannot drift out of step if either TUNE number is retuned.
const LUNGE_SPEED = TUNE.WARDEN_TAG_R / TUNE.WARDEN_LUNGE_S;

// Three drums that all walked at one point would stack into one silhouette. Each aims at
// its own point on a ring around you instead, well inside the tag radius so it still starts
// its cycle on the approach - they surround you, which is pressure you can read.
const RING_R = TUNE.WARDEN_TAG_R * 0.6;

// Where a drum reassembles when §9.5 fires: just OUTSIDE its own telegraph radius, so it
// arrives having to close on you rather than already winding up in your face.
const ARRIVE_R = TUNE.WARDEN_TAG_R + 2;

// What a drum can roll over, and therefore what it can lunge at. It stands about 3.4 studs
// tall on a rim skirt, so a 2.5-stud lip is a kerb, a tree root or a low plinth that a
// machine plainly climbs; anything taller is a PLATFORM, which is §9.5's business.
//
// This one number is load-bearing twice, and the second use is a defect it repairs. The
// telegraph needs the vertical gate as well as the radius: a drum standing under a walkway
// four studs up is inside a 4.5-stud tag radius in three dimensions, so without the gate it
// would flare and lunge at a floor for ever - and because every flare resets the lost-sight
// decay, the drum would loop harmlessly under the player's feet and §9.5 would never fire
// on the one geometry it exists for.
const STEP_Y = 2.5;

// The decay's definition of progress. The slowest drum covers 0.15 studs in a tick, so a
// drum closing head-on clears half a stud every four ticks and its timer is reset over and
// over; a drum whose target is out of reach, or which is being kited at a fixed gap, never
// clears it once. That is the difference §9.5 is about.
const LOST_PROGRESS = 0.5;

// Turning is deliberately slower than a fighter can circle. A drum tracks at 200 deg/s;
// circling one at the tag radius at FIGHT_WALK_SPEED is 20 / 4.5 = 4.4 rad/s, about
// 254 deg/s - so a fighter who circles CAN stay off its nose, which is a real answer to a
// drum rather than a stat check. A drum that snapped its eye onto you every tick would
// leave the frozen telegraph nothing to say.
const TURN_RATE_DEG = 200;

// The flare strobe: about six flips a second, so the wind-up reads as an alarm rather than
// as a colour change, and it costs at most three setColor calls per flip per drum.
const FLARE_STROBE_S = 0.15;

// playSfx is not positional (there is no `position` in its options), so a drum winding up
// three hundred studs away would be a warning about something you cannot see - which is
// what spec 21's discipline forbids. Cues are gated on the one distance this module knows:
// drum to local player. 60 studs is well past the longest weapon's reach and well inside
// the low tier's 300-stud fog.
const AUDIBLE_R = 60;

// Below this a drum is close enough to its destination to stop walking, which keeps a
// parked drum from jittering across an epsilon for ever.
const ARRIVE_EPS = 0.75;

// Nothing is pushed to the engine unless it actually moved or turned: a drum asleep at its
// post, or standing frozen through a telegraph, costs no engine calls at all.
const WRITE_EPS = 0.002;
const TURN_EPS = 0.0005;

// The Keeper palette of spec 24, quoted rather than re-invented, because these drums are
// meant to read as the same family of machine (§9.1). Lower-case six-digit hex: the part
// schema rejects anything else.
const C = Object.freeze({
  shell: "#2a2f3a",     // dark welded plate
  trim: "#8a93a6",      // bands, lid and shards
  eyeDim: "#4a3a14",    // asleep: lit by nothing
  eyeIdle: "#ffd93d",   // awake and hunting
  eyeHot: "#fff2cf",    // the flare's white half
  eyeFlare: "#ff5a3c",  // the flare's red half, and the whole lunge
  eyeDead: "#4a4a4a",   // the wreck's eye
  mark: "#ffd93d",      // the numbering on its back
});

// The states a drum can be in, exactly as the MODULE CONTRACT's WardenView fixes them.
const ASLEEP = "asleep";
const WALKING = "walking";
const TELEGRAPH = "telegraph";
const LUNGING = "lunging";
const BROKEN = "broken";

// The two flare readings, which are not WardenView states and are never reported as one.
const HOT = "hot";
const FLARE = "flare";

// The one behaviour the hull carries, which is the whole of what makes it a sensor. The
// engine copies behaviours per part (normalizeRuntimePart maps them into fresh objects), so
// one frozen template is safe to share across every drum. `once: true` keeps a drum the
// player walks through from re-emitting an event nothing subscribes to.
const SENSOR = Object.freeze([Object.freeze({ type: "touchEvent", event: "sd_warden", once: true })]);

// =====================================================================================
// The body, as offsets from the drum's own FEET position (§9.1)
// =====================================================================================
// `off` is [x, y, z] in the drum's local frame with +z forward, so the eye faces where it
// walks. `faces` marks the parts whose own rotation has to follow the yaw (the round ones
// do not care, and not writing their rotation halves the engine calls). `flare` marks the
// parts the telegraph lights up, and `eye` picks the eye's colour out of the flare pair.
// Every part is canCollide:false and only the hull carries the sensor behaviour, so one
// drum registers exactly one collider and its other ten parts register none at all.
//
// Widths: the hull is HULL_D across, the bands stand 0.2 proud of it and the eye bulges to
// exactly ENV_R, so the whole drum measures TUNE.WARDEN_BODY_W_MAX at its widest and not a
// stud more. It stands about 3.4 studs tall, which is squat beside a player capsule and
// deliberately so: nobody could mistake one for somebody.

function bodyPlan(index) {
  const plan = [
    // The rim skirt it rolls on.
    { shape: "cylinder", size: [HULL_D - 0.2, 0.45, HULL_D - 0.2], off: [0, 0.22, 0], color: C.shell, material: "metal" },
    // THE HULL, and the drum's one sensor.
    { shape: "cylinder", size: [HULL_D, 2.6, HULL_D], off: [0, 1.75, 0], color: C.shell, material: "metal", sensor: true },
    // Two welded bands. They take the flare as well as the eye does, because an eye four
    // fifths of a stud across is not readable from across a ground, and a telegraph nobody
    // can see is not a telegraph.
    { shape: "cylinder", size: [HULL_D + 0.2, 0.28, HULL_D + 0.2], off: [0, 1.1, 0], color: C.trim, material: "metal", flare: true },
    { shape: "cylinder", size: [HULL_D + 0.2, 0.28, HULL_D + 0.2], off: [0, 2.6, 0], color: C.trim, material: "metal", flare: true },
    // The lid, welded shut.
    { shape: "dome", size: [HULL_D - 0.1, 0.8, HULL_D - 0.1], off: [0, 3.0, 0], color: C.trim, material: "metal" },
    // The eye housing, the eye and the hood over it. The eye sits at 2.3, just under the
    // 3.0 studs combat.js sparks a hit at, so a connected swing lands on the face of it.
    { shape: "box", size: [1.4, 1.1, 0.45], off: [0, 2.3, 1.0], color: C.shell, material: "metal", faces: true },
    { shape: "sphere", size: [0.8, 0.8, 0.8], off: [0, 2.3, ENV_R - 0.4], color: C.eyeDim, material: "neon", flare: true, eye: true },
    { shape: "wedge", size: [1.6, 0.36, 0.5], off: [0, 2.95, 0.95], color: C.trim, material: "metal", faces: true },
  ];
  // "Numbered" (§9.1), as index + 1 stamped plates up its back between the two bands. A
  // floating name label would have been the obvious way to number a thing and is exactly
  // the wrong one here: a nameplate over a body is what a remote player's rig wears, and
  // ARCHITECTURE §9 bans anything that reads as a player.
  for (let k = 0; k <= index; k++) {
    plan.push({
      shape: "box", size: [0.34, 0.34, 0.2], off: [0, 1.45 + k * 0.45, -(HULL_D / 2 + 0.05)],
      color: C.mark, material: "neon", faces: true,
    });
  }
  return plan;
}

// What is left where you broke it (§9.3). The drum reassembles at its SPOT eighteen seconds
// later, so the wreck lies where it fell until then and reads as the same machine in
// pieces. It is built with no yaw and never moved again, and every part of it is
// canCollide:false with no behaviour, so the whole wreck registers no collider at all.
function wreckPlan() {
  return [
    { shape: "cylinder", size: [HULL_D, 2.6, HULL_D], off: [0, HULL_D / 2, 0.2], rot: [0, 0, 90], color: C.shell, material: "metal" },
    { shape: "dome", size: [HULL_D - 0.1, 0.8, HULL_D - 0.1], off: [1.9, 0.35, -0.9], rot: [0, 0, 24], color: C.trim, material: "metal" },
    { shape: "sphere", size: [0.8, 0.8, 0.8], off: [-1.5, 0.4, 0.9], color: C.eyeDead, material: "neon" },
    { shape: "box", size: [0.9, 0.18, 0.7], off: [0.6, 0.09, 1.7], rot: [0, 22, 0], color: C.trim, material: "metal" },
    { shape: "box", size: [0.7, 0.16, 0.6], off: [-0.9, 0.08, -1.6], rot: [0, -40, 0], color: C.trim, material: "metal" },
  ];
}

// =====================================================================================
// Pure helpers. Module scope, so they hold nothing that could survive a dispose.
// =====================================================================================

function dist3(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// A Vec3 this module is prepared to act on, or null. playerFeet arrives from game.js as
// ctx.player.position(), which is a fresh array of the FEET - the same convention a peer's
// `pos` uses and the one combat.js measures against, so the two never disagree about where
// a body is. physics.getPosition() is the CENTRE, feet plus 2.5, and is never mixed in here.
function vec3(v) {
  if (!Array.isArray(v) || v.length < 3) return null;
  const x = Number(v[0]), y = Number(v[1]), z = Number(v[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

// §9.7: 9 / 11 / 13, all well under a fighter's 20. Indexed with a wrap so a ground whose
// builder handed over a different number of spots still gets a speed for every drum.
function speedOf(index) {
  const row = TUNE.WARDEN_SPEED;
  return row[index % row.length];
}

// The drum's local frame rotated by its yaw, in the same convention the rest of this Place
// uses: a yaw of 0 points along +z, and a local +z maps to [sin(yaw), cos(yaw)] - which is
// exactly what combat.js's facing() returns for the player, so "forward" means one thing in
// this Place.
function worldOf(pos, off, sinY, cosY) {
  return [
    pos[0] + off[0] * cosY + off[2] * sinY,
    pos[1] + off[1],
    pos[2] - off[0] * sinY + off[2] * cosY,
  ];
}

// =====================================================================================
// create(ctx) -> Wardens
// =====================================================================================

export function create(ctx) {
  // The contract hands damage(index, amount) no ctx, and breaking a drum has to remove its
  // body, build its wreck and play a sound, so the closure holds one. It is the same object
  // the shell built for this Place and lives exactly as long as the Place does; every entry
  // point that IS handed a ctx refreshes this reference rather than trusting its own age.
  let cx = ctx;

  const S = {
    wardens: [],   // index-ordered; empty before spawnAll and after clear
  };

  // -----------------------------------------------------------------------------------
  // Engine calls, each one wrapped. A throw out of update sets updateHalted and kills the
  // Place for the rest of the session, so no drum is ever allowed to be the reason.
  // -----------------------------------------------------------------------------------

  function setPos(id, p) {
    if (!id) return;
    try { cx.engine.parts.setPosition(id, p); } catch { /* gone */ }
  }

  function setRot(id, r) {
    if (!id) return;
    try { cx.engine.parts.setRotation(id, r); } catch { /* gone */ }
  }

  function setCol(id, hex) {
    if (!id) return;
    try { cx.engine.parts.setColor(id, hex); } catch { /* gone */ }
  }

  function drop(id) {
    if (!id) return;
    try { cx.engine.parts.remove(id); } catch { /* already gone */ }
  }

  // One wrapper, the house shape: playSfx is a silent no-op before the AudioContext exists
  // and drops the seventeenth concurrent voice, and a thrown sound must never be able to
  // halt update. Five names, all of them inside spec 02's closed 25-name registry: `lift`
  // when a drum wakes, `click` for the flare, `whoosh` for the lunge, `pop` when one breaks
  // (§8 gives the break to whoever applies it, which is why combat.js deliberately does not
  // play it) and `warp` when one reassembles. `near` is {pos, to} when the cue should be
  // heard only from nearby, and absent when the caller is certain you are next to it.
  function sfx(name, opts, near) {
    if (near && dist3(near.pos, near.to) > AUDIBLE_R) return;
    try { cx.engine.audio.playSfx(name, opts); } catch { /* audio is optional, always */ }
  }

  // -----------------------------------------------------------------------------------
  // Building, breaking and removing a body
  // -----------------------------------------------------------------------------------

  function removeParts(w) {
    for (const id of w.ids) drop(id);
    w.ids = [];
    w.plan = null;
    w.wrote = null;
    w.lit = null;
  }

  // Builds a plan at `at` with the given yaw and leaves w.ids index-aligned with w.plan, so
  // a part the engine rejected is one missing plate rather than a drum wearing its eye
  // where its skirt should be. A rejection is reported through console.error, which the
  // smoke run collects, because a silent hole is worse than a loud one.
  function buildParts(w, plan, at, yaw) {
    removeParts(w);
    w.plan = plan;
    w.ids = [];
    w.pos = [at[0], at[1], at[2]];
    w.yaw = yaw;
    const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
    for (const t of plan) {
      const rot = t.rot ? t.rot.slice() : [0, 0, 0];
      if (t.faces) rot[1] += yaw * DEG;
      const def = {
        // `wdn` is this subsystem's stamp, and world.js's uid never rewinds, so no id this
        // Place has ever used is handed out twice: a reused id would silently overwrite
        // partsById's record and leak the old collider, which the dispose gate reports.
        id: uid("wdn"),
        shape: t.shape,
        size: t.size.slice(),
        position: worldOf(w.pos, t.off, sinY, cosY),
        rotation: rot,
        color: t.color,
        material: t.material,
        canCollide: false,
      };
      if (t.sensor) def.behaviors = SENSOR;
      let id = null;
      try {
        id = cx.engine.parts.create(def);
      } catch (err) {
        console.error("[oof] showdown wardens: part rejected", w.index, err);
      }
      w.ids.push(id);
    }
    w.wrote = { x: w.pos[0], y: w.pos[1], z: w.pos[2], yaw };
  }

  // The eye and the bands, in one of four readings. `w.lit` caches which one is on the drum,
  // so a colour is pushed on a change and never per tick.
  function paint(w, mode) {
    if (w.lit === mode || !w.plan) return;
    let eye = C.eyeIdle, band = C.trim;
    if (mode === ASLEEP) eye = C.eyeDim;
    else if (mode === HOT) { eye = C.eyeHot; band = C.eyeHot; }
    else if (mode === FLARE) { eye = C.eyeFlare; band = C.eyeFlare; }
    w.lit = mode;
    for (let i = 0; i < w.plan.length; i++) {
      const t = w.plan[i];
      if (!t.flare) continue;
      setCol(w.ids[i], t.eye ? eye : band);
    }
  }

  // Push the drum's current position and yaw onto its parts, and only if either actually
  // changed: a drum asleep at its post or frozen mid-telegraph costs nothing.
  function place(w) {
    const p = w.wrote;
    if (p
      && Math.abs(p.x - w.pos[0]) < WRITE_EPS
      && Math.abs(p.y - w.pos[1]) < WRITE_EPS
      && Math.abs(p.z - w.pos[2]) < WRITE_EPS
      && Math.abs(p.yaw - w.yaw) < TURN_EPS) return;
    const sinY = Math.sin(w.yaw), cosY = Math.cos(w.yaw);
    const yawDeg = w.yaw * DEG;
    for (let i = 0; i < w.plan.length; i++) {
      const t = w.plan[i];
      const id = w.ids[i];
      setPos(id, worldOf(w.pos, t.off, sinY, cosY));
      if (t.faces) setRot(id, [0, yawDeg, 0]);
    }
    w.wrote = { x: w.pos[0], y: w.pos[1], z: w.pos[2], yaw: w.yaw };
  }

  function breakIt(w) {
    w.hp = 0;
    w.state = BROKEN;
    // §9.6 and the `warden-breaker` badge both ask whether this drum was broken IN THIS
    // ROUND, which is a latch and not the current state: see the header.
    w.everBroken = true;
    w.respawn = TUNE.WARDEN_RESPAWN_S;
    w.lostFor = 0;
    w.best = Infinity;
    w.hitThisLunge = false;
    buildParts(w, wreckPlan(), w.pos, 0);
    // No distance gate: you broke it with a weapon whose longest reach on any ground is
    // 7 studs, so you are standing next to it by definition.
    sfx("pop", { pitch: 0.8, volume: 0.9 });
  }

  // Back on its feet at its own spot, WARDEN_RESPAWN_S after it broke (§9.3). Used by that
  // respawn and by nothing else: §9.5's relocation moves an intact drum and rebuilds none.
  function reassemble(w) {
    w.hp = TUNE.WARDEN_HP;
    w.state = WALKING;
    w.phaseT = 0;
    w.cool = 0;
    w.lostFor = 0;
    w.best = Infinity;
    w.hitThisLunge = false;
    w.strobeT = 0;
    w.strobeOn = false;
    buildParts(w, bodyPlan(w.index), w.spot, w.yaw0);
    paint(w, WALKING);
    sfx("warp", { pitch: 0.7, volume: 0.6 });
  }

  // -----------------------------------------------------------------------------------
  // Walking, turning and the lost-sight decay
  // -----------------------------------------------------------------------------------

  function turnToward(w, want, dt) {
    let d = want - w.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const max = (TURN_RATE_DEG / DEG) * dt;
    w.yaw += Math.abs(d) <= max ? d : (d > 0 ? max : -max);
  }

  function walkToward(w, to, dt) {
    const speed = speedOf(w.index);
    const dx = to[0] - w.pos[0], dz = to[2] - w.pos[2];
    const flat = Math.sqrt(dx * dx + dz * dz);
    if (flat > ARRIVE_EPS) {
      const step = Math.min(speed * dt, flat);
      w.pos[0] += (dx / flat) * step;
      w.pos[2] += (dz / flat) * step;
      turnToward(w, Math.atan2(dx, dz), dt);
    }
    // The kerb. It eases up or down a step at its own walking pace, so a drum does not hover
    // beside a two-stud lip it obviously rolls over; anything taller than STEP_Y it cannot
    // follow at all, which is what hands that geometry to §9.5.
    const dy = to[1] - w.pos[1];
    const rise = Math.abs(dy);
    if (rise > 1e-4 && rise <= STEP_Y) {
      const climb = Math.min(speed * dt, rise);
      w.pos[1] += dy > 0 ? climb : -climb;
    }
  }

  // Its own point on the ring around you, so three drums close on three sides.
  function aimPoint(w, target) {
    const a = (w.index * Math.PI * 2) / Math.max(1, S.wardens.length);
    return [target[0] + Math.sin(a) * RING_R, target[1], target[2] + Math.cos(a) * RING_R];
  }

  // Where §9.5 puts it: on the target's own platform, just outside the telegraph radius, on
  // the side it was already approaching from. Derived from its own position rather than
  // drawn from a random source, so the same situation always resolves the same way and a
  // test can assert on it.
  function arrivalNear(w, target) {
    const dx = w.pos[0] - target[0], dz = w.pos[2] - target[2];
    const flat = Math.sqrt(dx * dx + dz * dz);
    const a = (w.index * Math.PI * 2) / Math.max(1, S.wardens.length);
    const ux = flat > 1e-6 ? dx / flat : Math.sin(a);
    const uz = flat > 1e-6 ? dz / flat : Math.cos(a);
    return [target[0] + ux * ARRIVE_R, target[1], target[2] + uz * ARRIVE_R];
  }

  function relocate(w, to) {
    w.pos = [to[0], to[1], to[2]];
    w.lostFor = 0;
    w.best = Infinity;
    sfx("warp", { pitch: 0.85, volume: 0.6 });
  }

  // -----------------------------------------------------------------------------------
  // The telegraph and the lunge (§9.3)
  // -----------------------------------------------------------------------------------

  function flareAt(w, target) {
    w.state = TELEGRAPH;
    w.phaseT = TUNE.WARDEN_TELEGRAPH_S;
    // THE LINE IS LOCKED HERE and the drum freezes on it. See the header: a drum that
    // re-aimed through its own wind-up would leave nothing to dodge into.
    const dx = target[0] - w.pos[0], dz = target[2] - w.pos[2];
    const flat = Math.sqrt(dx * dx + dz * dz);
    if (flat > 1e-6) w.lungeDir = [dx / flat, dz / flat];
    else w.lungeDir = [Math.sin(w.yaw), Math.cos(w.yaw)];
    // It squares up on the locked line, so the flare shows you exactly where it is going.
    w.yaw = Math.atan2(w.lungeDir[0], w.lungeDir[1]);
    w.strobeT = 0;
    w.strobeOn = true;
    // It closed, so the decay has nothing left to measure until it is walking again.
    w.lostFor = 0;
    w.best = Infinity;
    paint(w, HOT);
    sfx("click", { pitch: 0.6, volume: 0.55 }, { pos: w.pos, to: target });
  }

  // Would this lunge connect on this tick? Distance in three dimensions against the drum's
  // own contact radius, and the player inside the cone it committed to. The cone floor is
  // TUNE.HIT_CONE_DOT, the one facing gate this Place has: a 120 degree cone reads the same
  // whether you are swinging or being lunged at, so a sidestep means one thing in both
  // directions.
  function connects(w, target) {
    const dx = target[0] - w.pos[0], dy = target[1] - w.pos[1], dz = target[2] - w.pos[2];
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) > CONTACT_R) return false;
    const flat = Math.sqrt(dx * dx + dz * dz);
    // Standing inside the drum as it charges is a hit whatever it is pointed at: under one
    // capsule radius of separation there is no direction left to have dodged into.
    if (flat < 1) return true;
    return (dx * w.lungeDir[0] + dz * w.lungeDir[1]) / flat >= TUNE.HIT_CONE_DOT;
  }

  function strobe(w, dt) {
    w.strobeT += dt;
    if (w.strobeT >= FLARE_STROBE_S) {
      w.strobeT = 0;
      w.strobeOn = !w.strobeOn;
    }
    paint(w, w.strobeOn ? HOT : FLARE);
  }

  // -----------------------------------------------------------------------------------
  // One drum, one tick. Returns true when it WANTS to land its hit; the caller decides,
  // because the contract returns one WardenHit and a cooldown must not be spent on a hit
  // that was never handed back.
  // -----------------------------------------------------------------------------------

  function tick(w, dt, target) {
    if (w.state === BROKEN) {
      w.respawn -= dt;
      if (w.respawn <= 0) reassemble(w);
      return false;
    }

    w.age += dt;
    if (w.cool > 0) w.cool = Math.max(0, w.cool - dt);

    if (w.state === ASLEEP) {
      // §9.3: it wakes WARDEN_WAKE_S into the round, in plain sight and at its post, so the
      // first thing a round teaches you is what one looks like before it hunts.
      if (w.age < TUNE.WARDEN_WAKE_S) return false;
      w.state = WALKING;
      paint(w, WALKING);
      sfx("lift", { pitch: 0.7, volume: 0.5 }, target ? { pos: w.pos, to: target } : null);
    }

    let wantsHit = false;

    if (w.state === TELEGRAPH) {
      w.phaseT -= dt;
      strobe(w, dt);
      if (w.phaseT <= 0) {
        w.state = LUNGING;
        w.phaseT = TUNE.WARDEN_LUNGE_S;
        w.hitThisLunge = false;
        paint(w, FLARE);
        sfx("whoosh", { pitch: 0.55, volume: 0.6 }, target ? { pos: w.pos, to: target } : null);
      }
    } else if (w.state === LUNGING) {
      w.phaseT -= dt;
      const travel = LUNGE_SPEED * dt;
      w.pos[0] += w.lungeDir[0] * travel;
      w.pos[2] += w.lungeDir[1] * travel;
      // ONLY THE LUNGE HURTS (§9.3), at most once per lunge and at most once per
      // TUNE.WARDEN_HIT_COOLDOWN_S, and never at all against somebody who is not a living
      // fighter: `target` is null for a player who is dead, spectating, in the obby or
      // standing in the lobby.
      if (target && !w.hitThisLunge && w.cool <= 0 && connects(w, target)) wantsHit = true;
      if (w.phaseT <= 0) {
        w.state = WALKING;
        w.best = Infinity;
        w.lostFor = 0;
        paint(w, WALKING);
      }
    } else if (!target) {
      // No living fighter on this client to hunt, so it walks back to its post. It must not
      // chase the local player here: §12.4 parks your own rig 22 studs above a fighter while
      // you spectate, and a drum that treated that as "the target's platform" would
      // reassemble into the sky beside a ghost. A drum still walking its ground is also the
      // honest picture of §9.8 - when you are dead the mode is not different, the company is.
      walkToward(w, w.spot, dt);
      w.lostFor = 0;
      w.best = Infinity;
    } else {
      const d = dist3(w.pos, target);
      if (d <= TUNE.WARDEN_TAG_R && Math.abs(target[1] - w.pos[1]) <= STEP_Y) {
        flareAt(w, target);
      } else {
        walkToward(w, aimPoint(w, target), dt);
        // §9.5's decay: progress resets it, a gap it cannot shrink runs it out.
        if (d < w.best - LOST_PROGRESS) {
          w.best = d;
          w.lostFor = 0;
        } else {
          w.lostFor += dt;
          if (w.lostFor >= TUNE.WARDEN_LOST_S) relocate(w, arrivalNear(w, target));
        }
      }
    }

    place(w);
    return wantsHit;
  }

  // -----------------------------------------------------------------------------------
  // The contract (config.js's MODULE CONTRACT, scripts/wardens.js block)
  // -----------------------------------------------------------------------------------

  // Three drums at the spots the map builder chose (§9). Idempotent: it clears whatever is
  // standing first, so a second round can never leave the first round's drums in the world -
  // their parts would be orphaned, the dispose gate would report their colliders, and two
  // sets of eyes would be walking one ground.
  function spawnAll(c, spots) {
    if (c) cx = c;
    clear(cx);

    const rows = Array.isArray(spots) ? spots : [];
    const at = [];
    for (const row of rows) {
      if (at.length >= TUNE.WARDEN_COUNT) break;
      const p = vec3(row);
      if (p) at.push(p);
    }
    // A builder is required to return exactly TUNE.WARDEN_COUNT spots and rule 25:S1 asserts
    // it, so a short list is a builder bug. It is reported, and the drums that do have a
    // spot are built: this module invents no geometry of its own, and a ground with two
    // drums on it is playable while a thrown error is not.
    if (at.length < TUNE.WARDEN_COUNT) {
      console.warn("[oof] showdown wardens: fewer spots than WARDEN_COUNT", at.length);
    }

    for (let i = 0; i < at.length; i++) {
      const w = {
        index: i,
        spot: at[i].slice(),
        pos: at[i].slice(),
        // The drums face different ways at their posts, so they read as posted machines
        // rather than a parade. It is also the yaw a respawn rebuilds at.
        yaw0: (i * Math.PI * 2) / Math.max(1, at.length),
        yaw: 0,
        hp: TUNE.WARDEN_HP,
        state: ASLEEP,
        everBroken: false,
        age: 0,             // since spawnAll, which is what WARDEN_WAKE_S is measured from
        phaseT: 0,          // telegraph or lunge time left
        cool: 0,            // WARDEN_HIT_COOLDOWN_S left
        respawn: 0,         // WARDEN_RESPAWN_S left, while broken
        lostFor: 0,         // §9.5's decay
        best: Infinity,     // closest approach since the last reset, for that decay
        lungeDir: [0, 1],   // locked at the flare
        hitThisLunge: false,
        strobeT: 0,
        strobeOn: false,
        ids: [],            // runtime part ids, index-aligned with `plan`
        plan: null,
        wrote: null,        // the position and yaw last pushed to the engine
        lit: null,          // the colour reading last pushed to the flare parts
      };
      buildParts(w, bodyPlan(i), w.spot, w.yaw0);
      paint(w, ASLEEP);
      S.wardens.push(w);
    }
  }

  // One tick for every drum. Returns the one WardenHit the contract allows, or null.
  function update(dt, c, playerFeet, playerIsFighting) {
    if (c) cx = c;
    const step = Number(dt);
    if (!Number.isFinite(step) || step <= 0) return null;
    // Anything but an explicit `true` is "not a living fighter", because the one thing this
    // must never do is hurt somebody who is dead, spectating, climbing the obby or standing
    // in the lobby. With no target a drum walks its own ground and hurts nobody.
    const target = playerIsFighting === true ? vec3(playerFeet) : null;

    let hit = null;
    for (const w of S.wardens) {
      const wants = tick(w, step, target);
      // The contract returns ONE hit, so the first drum to connect is the one that does. A
      // second drum connecting on the same tick keeps its cooldown and its per-lunge flag
      // and lands on the next tick instead: a lunge window is 0.55 s, which is 33 ticks, so
      // nothing is dropped and no cooldown is spent on a hit nobody was handed.
      if (!wants || hit) continue;
      w.hitThisLunge = true;
      w.cool = TUNE.WARDEN_HIT_COOLDOWN_S;
      hit = { index: w.index, damage: TUNE.WARDEN_DAMAGE };
    }
    return hit;
  }

  // The WardenViews combat.js aims at, hud.js draws and debugState() reports. Fresh objects
  // with copied positions on every call: a caller holds this array for a tick (combat.js
  // does, because swing() is handed no wardens of its own) and nothing outside this module
  // may hold a handle on a drum's own position.
  function list() {
    return S.wardens.map((w) => ({
      index: w.index,
      position: [w.pos[0], w.pos[1], w.pos[2]],
      // Ceil, for the reason combat.js ceils a fighter's HP: a drum on four tenths of a hit
      // point is not broken, and a display that floored it to 0 would have callers treating
      // a standing drum as wreckage.
      hp: Math.ceil(w.hp),
      awake: w.state !== ASLEEP && w.state !== BROKEN,
      state: w.state,
      speed: speedOf(w.index),
      lostFor: w.lostFor,
    }));
  }

  // The only way a drum loses HP. combat.js applies a Warden hit locally and publishes it to
  // nobody, so this return is the authority on whether the drum broke and nothing else has
  // to guess: its SwingResult marks its own `killed` as advisory for exactly that reason.
  function damage(index, amount) {
    const i = Number(index);
    if (!Number.isInteger(i) || i < 0 || i >= S.wardens.length) return false;
    const w = S.wardens[i];
    if (w.state === BROKEN) return false;
    const d = Number(amount);
    if (!Number.isFinite(d) || d <= 0) return false;
    w.hp = Math.max(0, w.hp - d);
    if (w.hp > 0) return false;
    breakIt(w);
    return true;
  }

  // Distinct drums broken at least once since spawnAll. See the header for why this is the
  // cumulative count and not the number currently lying in pieces.
  function brokenCount() {
    let n = 0;
    for (const w of S.wardens) if (w.everBroken) n += 1;
    return n;
  }

  // §9.6: with fightersAtStart 1 and no opponent ever seen, this is what wins the round -
  // sixty to ninety seconds of engaged play instead of four minutes of survival.
  //
  // `S.wardens.length > 0` is not defensive noise. With nothing spawned, "every drum is
  // broken" is vacuously true, and a solo round on a ground whose builder forgot its
  // wardenSpots would be won on the first tick of `fight` at zero risk - which is exactly
  // the free win §4.2's sawOpponent latch exists to prevent, arriving through another door.
  function allBroken() {
    return S.wardens.length > 0 && brokenCount() === S.wardens.length;
  }

  // Test seam (§17.2), clocks only. It moves the timers and returns; every transition they
  // now qualify for happens in the next update, through the same code path a real tick
  // takes, so this can advance a wake, a respawn or a cooldown and can never invent a
  // telegraph, a lunge, a hit or a break of its own. Nothing in the Place calls it.
  function debugAdvance(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return;
    for (const w of S.wardens) {
      w.age += s;
      w.phaseT = Math.max(0, w.phaseT - s);
      w.cool = Math.max(0, w.cool - s);
      w.respawn = Math.max(0, w.respawn - s);
      // Only a walking drum is failing to close on anything, so only a walking drum's decay
      // has a meaning to advance (§9.5).
      if (w.state === WALKING) w.lostFor += s;
    }
  }

  // Every part this module made, gone, and the roster with it. Called at the end of a round
  // and again in dispose, and safe either way round or twice over: a drum whose parts are
  // already gone is removed by id, and parts.remove on a missing record returns quietly.
  // Afterwards list() is empty, brokenCount() is 0 and allBroken() is false - so game.js
  // reads the count for §13.3's badge BEFORE it clears, and the win it already scored is
  // held by §4.2's `scored` latch rather than by anything in here.
  function clear(c) {
    if (c) cx = c;
    for (const w of S.wardens) removeParts(w);
    S.wardens = [];
  }

  return {
    spawnAll,
    update,
    list,
    damage,
    brokenCount,
    allBroken,
    debugAdvance,
    clear,
  };
}
