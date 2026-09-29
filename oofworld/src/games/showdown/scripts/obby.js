// src/games/showdown/scripts/obby.js - Showdown's six-stage lobby obby. Spec 25 §11 owns
// this file, and this file owns the LOGIC only. The column, its pads, its kill slabs, its
// stage signs and its two paired parts are authored in place.json (§3.1); nothing here
// builds a platform. The one part it does create is the `error` stage's flicker label,
// which HAS to be a runtime part: setColor on an anchored, behaviourless place.json part in
// a bucket of two or more throws, because that part was InstancedMesh'd at load and
// instanced parts are permanently immutable (§2.7) - and a throw out of update sets
// updateHalted and kills the Place for the rest of the session.
//
// Why the obby exists at all: the intermission is forty seconds and the fight after it can
// run four minutes, so §11 hangs six stages of platforming 260 studs above the lobby's west
// end for the waiting and the dead to climb. The six ids, in order, are config's
// OBBY_STAGES - easy, hard, insane, nil, dilly, error - and `error` is spec 25's own
// difficulty, above Dilly Impossible. There are NO towers: the Difficulty Chart Obby
// dropped them and this obby matches that convention.
//
// ---------------------------------------------------------------------------------------
// The five rules that shape every line below.
// ---------------------------------------------------------------------------------------
//
// 1. CHECKPOINTS ARE touchEvent PADS PLUS ctx.player.setCheckpoint, NEVER THE `checkpoint`
//    BEHAVIOUR (§11.1). The engine keeps ONE monotonic per-Place gate,
//    checkpointHighestOrder, which only ever rises and is reset only by parts.clear(),
//    which no Place can call. With the behaviour, a player who reached `error` and then
//    left for a round could never re-arm stage one, and their respawn point would stay 500
//    studs up in the column for the rest of the session. setCheckpoint is unconditional and
//    positional and may move BACKWARD, which is exactly what six stages, an arch stage
//    picker and a round that borrows the same respawn point all need. The 90-stage obby
//    uses the behaviour nowhere, for this reason.
//
// 2. A STAGE IS CLEARED ONLY WHEN ITS OWN ENTRY PAD WAS TOUCHED BEFORE ITS EXIT PAD - a
//    sequence check, not a high-water touch (§11.1). The exit pad is otherwise reachable
//    from outside the stage, which the 1000-win flight unlock made trivial: hovering up the
//    column at FLY_SPEED/FLY_RISE touched the `error` stage's pads directly and would have
//    paid 300 Oofbux, awarded showdown.obby-six and showdown.error-handled and unlocked the
//    12000-Oofbux Glitchsteel skin - the one thing this obby gates - without playing a
//    stage. Flight is refused while inObby() for the same reason (§13.2); those are two
//    locks on one door, and enter() clamping to cleared() below is a third.
//
// 3. save.obbyStage IS THE NUMBER OF STAGES *CLEARED*, 0..6, never "the highest stage
//    reached" (§14). Read as "reached", merely entering `error` would satisfy glitchsteel's
//    needsStage 6 and the obby-six badge without clearing anything. On clearing index i
//    this module writes obbyStage = max(obbyStage, i + 1), and the 0-indexed six-rung
//    OBBY_FIRST_CLEAR_OOFBUX ladder then lines up exactly with stageOofbux(i). Each stage
//    pays ONCE EVER, tracked in save.paidStages, which holds stage IDS and never indexes.
//    This module writes those two fields into the save object and nothing else in the blob;
//    game.js is what calls economy.award and what calls saves.save (§11.1).
//
// 4. NOTHING HERE "REVERSES" A BEHAVIOUR PARAM (§11). initBehaviorRuntime reads
//    params.direction/speed/axis exactly once into physics.setColliderMotion, which is not
//    on ctx.engine.physics at all, and nothing on ctx.engine.parts can rewrite a behaviour
//    param afterwards. Hand-rotating a spinner does not work either: applyInterpolation
//    overwrites the quaternion from the behaviour's own prevQuat/curQuat every frame, and a
//    hand-moved part carries no angularVel so it sweeps nobody. So every reversal in this
//    obby is TWO OPPOSED AUTHORED PARTS - stage 5's counter-running conveyor lanes, stage
//    6's counter-rotating spinners - and setReversalPhase alternates which one is solid with
//    ctx.engine.parts.setCanCollide. Turning canCollide off re-registers that part's
//    collider as a SENSOR, and a sensor holds nobody up: you fall through it. Both halves
//    carry behaviours, so neither was instanced and both are mutable.
//
//    THE PRICE, WRITTEN DOWN HERE RATHER THAN DISCOVERED LATER: setCanCollide runs
//    syncColliderForRecord, which removes the old collider and registers a NEW one the
//    moment sensor-ness changes - and setColliderMotion is called exactly once, in
//    initBehaviorRuntime, so the re-registered collider comes back with no surfaceVel and no
//    angularVel. A half that has been toggled off and on again is solid again, still scrolls
//    its stripes and still spins, but it no longer carries or sweeps. The alternation's
//    honest mechanic is therefore WHICH HALF OF THE PAIR YOU CAN STAND ON, which is what
//    §11 asks of it, and the carry belongs to whichever half has not been toggled yet.
//    Nothing breaks and nothing soft-locks - it is a hazard of presence rather than of
//    surface speed - and there is no repair available from a Place, because
//    setColliderMotion is not on ctx.
//
// 5. DYING IN THE OBBY IS NOT THE ROUND'S BUSINESS. This module never touches the alive
//    set, never publishes, never reads the roster and never arms spectate mode; §12.2 arms
//    spectating only for a death taken as a living fighter while ph === "fight". All this
//    module owes the round is a truthful inObby(), which round.js, hud.js and the flight
//    refusal read. It deliberately branches on NOTHING in the RoundFacts it is handed: the
//    obby runs identically in `intermission`, `fight` and `result`, which is exactly what
//    §11.3's STAY IN OBBY promises a player who lets a round start without them. A missed
//    jump dies on that stage's own thin kill slab about 8 studs under its playable volume,
//    not at TUNE.KILL_Y, which is the MAPS' death plane 300 to 600 studs below.
//
// The stay-or-join prompt is NOT owned here (§11.3): hud.js draws it with its visible
// five-second countdown, game.js resolves it, and obby.js only answers inObby().

import { TUNE, OBBY_STAGES, ERROR_FLICKER_COLOUR, stageOofbux } from "./config.js";

// =====================================================================================
// The authored names this module reaches for, and what happens when one is missing.
// =====================================================================================
// place.json is another author's file, so every id below is resolved through
// ctx.engine.parts.get() and every miss DEGRADES rather than throws: a throw out of update
// sets updateHalted and the Place is dead for the session, so "the sign was renamed" has to
// cost a flicker label and never the Place. Positions are read off the resolved record
// rather than copied into this file, so a pad that moves in place.json takes its checkpoint
// with it and nothing here goes stale.

// The arch pad in the lobby (§3.1). Its touch event, `obby-enter`, is routed by game.js to
// the stage picker and answered here with null. This module wants only the pad's box, so
// leave() can put a player down beside it rather than on it.
const ARCH_PAD_ID = "arch-pad";

// The `error` stage's static sign. Its `text` behaviour rasterises its string ONCE onto a
// 256x64 canvas at construction and hangs it on the mesh as a Sprite, and setColor replaces
// the mesh material and leaves the sprite alone - which is the other half of why the
// flickering part of that sign is a separate runtime part hung just under it.
const ERROR_SIGN_ID = "obby-error-sign";

// The two paired reversals of rule 4. `a` is the half that phase 0 leaves solid.
const REVERSAL_PAIRS = Object.freeze([
  Object.freeze({ a: "obby-dilly-conv-a", b: "obby-dilly-conv-b" }),  // stage 5's lanes
  Object.freeze({ a: "obby-error-spin-a", b: "obby-error-spin-b" }),  // stage 6's discs
]);

// A stage's two pads. The pad PART ids and the touch EVENT names are two different naming
// schemes in place.json, and both are derived from the stage id here so that the pair can
// never drift apart anywhere in this file.
function cpPartId(stageId) { return "obby-" + stageId + "-cp"; }
function exitPartId(stageId) { return "obby-" + stageId + "-exit"; }
function cpEventName(stageId) { return "obby-cp-" + stageId; }
function exitEventName(stageId) { return "obby-exit-" + stageId; }

// =====================================================================================
// Local constants. Every number this Place has already decided lives in TUNE and is
// imported from it; these are the handful TUNE does not hold, each with its reason.
// =====================================================================================

// Feet clearance above a pad's top face, matching place.json's own `spawn` convention of
// pad top plus 0.2. Standing a player exactly on a surface gives one tick of gravity the
// chance to put them inside it before the ground snap runs.
const PAD_FEET_CLEARANCE = 0.2;

// How long each half of a paired reversal stays solid. §11 asks stage 6's spinners to "hand
// off on a count you have to learn", so the count has to be countable: three seconds is
// four or five hops of reading time, and the phase resets to 0 on every stage entry (below)
// so the count always starts from the same half. Much under two seconds it is a guess
// rather than a count; much over five and the off half is dead scenery for most of a run.
const REVERSAL_PERIOD_S = 3;

// How long each of the `error` label's two colours holds (§11: it flickers between the
// stage colour and ERROR_FLICKER_COLOUR). 0.4 s is 2.5 Hz - plainly a stutter, and well
// under the band a strobe sits in, which a label on screen for a whole stage attempt has no
// business entering.
const FLICKER_PERIOD_S = 0.4;

// The flicker label's own geometry, hung under the static sign. Behaviourless and
// canCollide:false, which registers NO collider at all - the cheapest detail in the engine
// - so the column's collider count does not move for it.
const LABEL_SIZE = Object.freeze([16, 0.9, 0.5]);
const LABEL_GAP = 0.5;   // studs of air between the sign's bottom face and the label
const LABEL_FALLBACK_OFF = Object.freeze([6, 6, 0]);   // off the error cp pad, with no sign

// Where leave() puts a player down: clear of the arch pad's +x edge by this much, so the
// landing does not immediately re-fire `obby-enter` and re-open the picker they just used.
// The lobby ground's top face is TUNE.LOBBY_Y.
const ARCH_CLEAR_X = 2.5;
const LOBBY_RETURN_FALLBACK = Object.freeze([-44, TUNE.LOBBY_Y + PAD_FEET_CLEARANCE, 0]);

// The column test (§3: the obby column is x -640..-560, y 260..560). y is the test that
// does the work, because nothing else in this Place is anywhere near it: the lobby sits at
// y 0, the three grounds at y 0, a ground's own perch at origin + TUNE.PERCH_ABOVE_ORIGIN,
// and the fly ceiling with no map live is TUNE.LOBBY_Y + TUNE.FLY_CEILING_Y. The x test is
// belt and braces, and both margins are generous because the box is derived from the twelve
// pads rather than from the stages' full playable width, which this module cannot see.
const COLUMN_MARGIN_X = 80;
const COLUMN_MARGIN_BELOW = 12;   // reaches a stage's kill slab, which sits ~8 studs under
const COLUMN_MARGIN_ABOVE = 40;

// How far below a stage's entry pad still counts as standing on that stage, for
// stageIndex(). It has to reach that stage's own kill slab, so a player in the middle of
// the fall the slab exists to end is still reported on the stage they fell off.
const STAGE_BAND_BELOW = 10;

// =====================================================================================
// Small total helpers. None of them throws, and none of them touches state.
// =====================================================================================

function partDefOf(ctx, partId) {
  const parts = ctx && ctx.engine ? ctx.engine.parts : null;
  if (!parts || typeof parts.get !== "function") return null;
  const record = parts.get(partId);
  // The record's `def` is the engine's own live object and is NOT frozen: read it, copy out
  // of it, never write to it.
  return record && record.def ? record.def : null;
}

// A pad's top face plus feet clearance, as a fresh array, or null when that pad is not in
// this place.json. A part def's `position` is the part's CENTRE, never its feet.
function padFeetOf(ctx, partId) {
  const def = partDefOf(ctx, partId);
  if (!def || !Array.isArray(def.position) || !Array.isArray(def.size)) return null;
  const x = Number(def.position[0]);
  const y = Number(def.position[1]) + Number(def.size[1]) / 2 + PAD_FEET_CLEARANCE;
  const z = Number(def.position[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

function isVec3(v) {
  return Array.isArray(v) && v.length === 3 &&
    Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

// save.paidStages holds stage IDS and may be anything at all after §14's field-level
// fallback, so every read of it goes through here rather than trusting its type.
function paidList(save) {
  return save && Array.isArray(save.paidStages) ? save.paidStages : null;
}

// =====================================================================================
// create(ctx, save) -> Obby
// =====================================================================================

export function create(ctx, save) {
  // The six stages, resolved once against the authored column. `cp` and `exit` are the
  // checkpoint positions those pads stand for; either may be null if place.json has been
  // rearranged, in which case the player's own feet at the moment of the touch are used
  // instead - the pad fired, so they are standing on it.
  const stages = OBBY_STAGES.map((row, index) => Object.freeze({
    index,
    id: row.id,
    name: row.name,
    colour: row.colour,
    cpEvent: cpEventName(row.id),
    exitEvent: exitEventName(row.id),
    cp: padFeetOf(ctx, cpPartId(row.id)),
    exit: padFeetOf(ctx, exitPartId(row.id)),
  }));

  // Event name -> stage index, off the same derivation the stage rows used, so a touch is
  // answered with two map lookups rather than twelve string builds per event.
  const byCpEvent = new Map();
  const byExitEvent = new Map();
  for (const st of stages) {
    byCpEvent.set(st.cpEvent, st.index);
    byExitEvent.set(st.exitEvent, st.index);
  }

  // The column's box, grown from whichever pads resolved. With none of them resolved there
  // is no honest box to test against, so `column` stays null and inObby() is driven by the
  // entry pads and leave() alone - which still holds, because a pad is the only way in.
  const column = deriveColumn(stages);

  const lobbyReturn = deriveLobbyReturn(ctx);

  const errorStage = stages[stages.length - 1];

  const S = {
    inColumn: false,   // the truth behind inObby(): the player's feet are in the column
    stage: -1,         // the stage you are standing in, derived from your feet every tick
    // The sequence latch of rule 2: ctx.time the entry pad of each stage was last touched,
    // or -1 for "not entered". An exit pad with -1 beside it is being reached from outside
    // its own stage and clears nothing. The clear it allows sets it back to -1, so one
    // entry buys exactly one clear.
    entryAt: OBBY_STAGES.map(() => -1),
    revWhich: 0,       // which half of every pair is solid right now, 0 or 1
    revT: 0,           // seconds accumulated toward the next hand-off
    revArmed: false,   // is the alternation running (only while inColumn)
    flickT: 0,
    flickOn: false,    // is the label currently showing ERROR_FLICKER_COLOUR
    labelId: null,     // the one runtime part this module owns, removed in dispose
    phase: "boot",     // the round's phase, recorded and branched on nowhere (rule 5)
    disposed: false,
  };

  // ---------------------------------------------------------------------------------
  // The runtime flicker label (§11, §2.7).
  // ---------------------------------------------------------------------------------
  function labelPosition() {
    const signDef = partDefOf(ctx, ERROR_SIGN_ID);
    if (signDef && Array.isArray(signDef.position) && Array.isArray(signDef.size)) {
      const y = Number(signDef.position[1]) - Number(signDef.size[1]) / 2
        - LABEL_GAP - LABEL_SIZE[1] / 2;
      if (Number.isFinite(y)) {
        return [Number(signDef.position[0]), y, Number(signDef.position[2])];
      }
    }
    if (isVec3(errorStage.cp)) {
      return [
        errorStage.cp[0] + LABEL_FALLBACK_OFF[0],
        errorStage.cp[1] + LABEL_FALLBACK_OFF[1],
        errorStage.cp[2] + LABEL_FALLBACK_OFF[2],
      ];
    }
    return null;
  }

  function createLabel() {
    const pos = labelPosition();
    if (!pos) return;   // nothing to hang it on; the stage keeps its static sign alone
    // No `id`: the engine stamps its own runtime id, which can never collide with an
    // authored name or with world.js's uid stamps. `light` is omitted entirely rather than
    // passed as null, which the part schema rejects outright.
    S.labelId = ctx.engine.parts.create({
      shape: "box",
      size: LABEL_SIZE.slice(),
      position: pos,
      color: errorStage.colour,
      material: "neon",
      anchored: true,
      canCollide: false,
    });
  }

  function tickFlicker(dt) {
    if (S.labelId == null) return;
    S.flickT += dt;
    if (S.flickT < FLICKER_PERIOD_S) return;
    // A while loop, not an if: a frame hitch that swallows several periods must not leave
    // the label owing the difference and stuttering to catch up afterwards.
    while (S.flickT >= FLICKER_PERIOD_S) S.flickT -= FLICKER_PERIOD_S;
    S.flickOn = !S.flickOn;
    ctx.engine.parts.setColor(S.labelId, S.flickOn ? ERROR_FLICKER_COLOUR : errorStage.colour);
  }

  function restLabel() {
    if (S.labelId == null || !S.flickOn) return;
    S.flickOn = false;
    S.flickT = 0;
    ctx.engine.parts.setColor(S.labelId, errorStage.colour);
  }

  // ---------------------------------------------------------------------------------
  // The paired reversals (rule 4).
  // ---------------------------------------------------------------------------------
  // The one guard that matters: setCanCollide throws for a part that is missing and for a
  // part that is instanced, and a throw out of update kills the Place. Missing is checked
  // here; instanced cannot happen, because both halves of every pair carry a behaviour and
  // a part with a behaviour is never bucketed into an InstancedMesh.
  function solidify(partId, solid) {
    if (!partDefOf(ctx, partId)) return;
    ctx.engine.parts.setCanCollide(partId, solid);
  }

  // Both halves solid, which is how place.json authors them. This is what the column is
  // left in whenever nobody is climbing it, so a Place in `fight` is not carrying a
  // half-sensor platform 500 studs above the lobby waiting for its next visitor.
  function releasePairs() {
    for (const pair of REVERSAL_PAIRS) {
      solidify(pair.a, true);
      solidify(pair.b, true);
    }
  }

  function applyPhase(which) {
    S.revWhich = which;
    for (const pair of REVERSAL_PAIRS) {
      solidify(pair.a, which === 0);
      solidify(pair.b, which === 1);
    }
  }

  function armReversal() {
    S.revArmed = true;
    S.revT = 0;
    applyPhase(0);   // every run starts on the same half, so the count is learnable
  }

  function disarmReversal() {
    if (!S.revArmed) return;
    S.revArmed = false;
    S.revT = 0;
    S.revWhich = 0;
    releasePairs();
  }

  function tickReversal(dt) {
    if (!S.revArmed) return;
    S.revT += dt;
    if (S.revT < REVERSAL_PERIOD_S) return;
    let flips = 0;
    while (S.revT >= REVERSAL_PERIOD_S) { S.revT -= REVERSAL_PERIOD_S; flips += 1; }
    // An even number of swallowed periods is no hand-off at all, and re-applying the phase
    // we are already in would churn four colliders for nothing.
    if (flips % 2 === 1) applyPhase(S.revWhich === 0 ? 1 : 0);
  }

  // ---------------------------------------------------------------------------------
  // Where you are.
  // ---------------------------------------------------------------------------------
  function feetNow() {
    const p = ctx && ctx.player && typeof ctx.player.position === "function"
      ? ctx.player.position() : null;
    return isVec3(p) ? p : null;
  }

  function insideColumn(feet) {
    if (!column || !feet) return false;
    return feet[0] >= column.minX && feet[0] <= column.maxX
      && feet[1] >= column.minY && feet[1] <= column.maxY;
  }

  // The stage you are standing in: the highest stage whose entry pad is at or below your
  // feet, reaching STAGE_BAND_BELOW under it so a player mid-fall is still reported on the
  // stage they fell off. Derived rather than latched, so a teleport, a respawn or a fall can
  // never leave a stale stage number behind it.
  function stageFromFeet(feet) {
    if (!feet) return -1;
    for (let i = stages.length - 1; i >= 0; i--) {
      const cp = stages[i].cp;
      if (isVec3(cp) && feet[1] >= cp[1] - STAGE_BAND_BELOW) return i;
    }
    return -1;
  }

  // Everything an attempt accumulated, dropped. Called when the player leaves the column by
  // any route: the leave control, a JOIN ROUND that teleports them into a ground, or §4.1's
  // teleport back to the lobby pad on the result -> intermission edge. Dropping the latches
  // here is the defensive half of rule 2 - a player pulled out of the obby mid-attempt
  // cannot come back a round later, touch an exit pad and be paid for a stage they never
  // climbed.
  function endRun() {
    S.inColumn = false;
    S.stage = -1;
    for (let i = 0; i < S.entryAt.length; i++) S.entryAt[i] = -1;
    disarmReversal();
    restLabel();
  }

  // ---------------------------------------------------------------------------------
  // Progress (rule 3).
  // ---------------------------------------------------------------------------------
  function clearedCount() {
    const raw = save ? Number(save.obbyStage) : 0;
    const n = Number.isFinite(raw) ? raw | 0 : 0;
    if (n < 0) return 0;
    return n > OBBY_STAGES.length ? OBBY_STAGES.length : n;
  }

  function stageUnlocked(index) {
    // Cleared stages, plus the next one - which at cleared() 0 is stage one. This is the
    // third lock of rule 2: even a picker that offered `error` to a player with nothing
    // cleared could not put them on it.
    return index >= 0 && index <= clearedCount() && index < OBBY_STAGES.length;
  }

  // Returns the Oofbux this clear has earned: stageOofbux(index) the first time this stage
  // is ever cleared and 0 every time after, indexed by the CLEARED stage's own 0-based
  // index. game.js is what awards it and what saves.
  function recordClear(index) {
    if (!save) return 0;
    const st = stages[index];
    const next = index + 1;
    const known = Number(save.obbyStage);
    if (!Number.isFinite(known) || known < next) save.obbyStage = next;   // max(), not set
    const paid = paidList(save);
    if (!paid) {
      // A corrupt paidStages cannot be trusted to say a stage was already paid, and paying
      // a second time for one stage is the worse of the two failures against a 700-per-
      // minute source cap, so a fresh list is started and this clear counts as paid.
      save.paidStages = [st.id];
      return 0;
    }
    if (paid.indexOf(st.id) >= 0) return 0;   // once ever, by stage ID and never by index
    paid.push(st.id);
    return stageOofbux(index);
  }

  // ---------------------------------------------------------------------------------
  // Checkpoints. The only calls to ctx.player.setCheckpoint in this module, and this module
  // is the only thing in the Place that ever points the respawn point into the obby (§11.2:
  // whoever owns you sets it on entry).
  // ---------------------------------------------------------------------------------
  function pinCheckpoint(where) {
    if (!isVec3(where)) return;
    ctx.player.setCheckpoint(where);
  }

  // The pad fired, so the player is on it: their own feet are a correct checkpoint, and the
  // pad's resolved top is a better one, because it is centred and cannot be an edge clip
  // taken at the top of a jump.
  function padOrFeet(where) {
    return isVec3(where) ? where : feetNow();
  }

  function enterStage(stageIndex, alreadyStanding) {
    const i = stageUnlocked(stageIndex) ? stageIndex : clearedCount();
    const st = stages[i] || stages[0];
    if (!st) return;
    S.inColumn = true;
    S.stage = st.index;
    S.entryAt[st.index] = Number(ctx.time) || 0;   // the sequence latch of rule 2
    if (!S.revArmed) armReversal();
    else { S.revT = 0; applyPhase(0); }            // a fresh stage, a fresh count
    // Checkpoint BEFORE the teleport, in §4.1 step 3's order, so a death on this very tick
    // cannot land the player back where they came from.
    pinCheckpoint(padOrFeet(st.cp));
    if (!alreadyStanding && isVec3(st.cp)) ctx.player.teleport(st.cp);
  }

  // ---------------------------------------------------------------------------------
  // The object §11's module contract describes.
  // ---------------------------------------------------------------------------------
  const api = {
    // Teleports you onto a stage's entry pad and sets the checkpoint there. The arch's
    // stage picker calls this for anything already cleared, and a clear calls it for the
    // next stage, because the six stages are six separate islands with no walkable link
    // between them: the exit of one sits 26 studs below and 36 studs across from the entry
    // of the next, and code is the only way up.
    enter(context, stageIndex) {
      if (S.disposed) return;
      enterStage(Number(stageIndex) | 0, false);
    },

    // Hands the respawn point back (§11.2). Called on JOIN ROUND, before §4.1 step 3 points
    // it at the live ground's perch, and by the leave control, which is the only way down
    // from a 260-stud column. It teleports ONLY a player who is actually up there, so
    // game.js may call it unconditionally and never move an avatar standing in the lobby -
    // which the smoke run's 0.5-stud spawn check would fail on.
    leave(context) {
      if (S.disposed) return;
      const wasUp = S.inColumn;
      endRun();
      if (!wasUp) return;
      pinCheckpoint(lobbyReturn);
      ctx.player.teleport(lobbyReturn);
    },

    // One touch pad, answered. Returns null for every event this module does not own,
    // including the arch's own `obby-enter`, which game.js routes to the stage picker.
    onPadTouched(context, event) {
      if (S.disposed || typeof event !== "string") return null;

      const entryIndex = byCpEvent.get(event);
      if (entryIndex !== undefined) {
        enterStage(entryIndex, true);
        ctx.engine.audio.playSfx("chime");
        return { kind: "checkpoint", stageIndex: stages[entryIndex].index, oofbux: 0 };
      }

      const exitIndex = byExitEvent.get(event);
      if (exitIndex === undefined) return null;

      // Rule 2, the whole of it: no entry, no clear, no checkpoint, no Oofbux, and no
      // record that this pad was ever touched.
      if (S.entryAt[exitIndex] < 0) return null;
      S.entryAt[exitIndex] = -1;   // one entry buys exactly one clear

      const oofbux = recordClear(exitIndex);
      const st = stages[exitIndex];
      ctx.engine.audio.playSfx("sparkle");

      if (exitIndex + 1 < stages.length) {
        // Straight onto the next island. enterStage sets that stage's checkpoint, so
        // setting the exit pad's here would only be overwritten in the same tick.
        enterStage(exitIndex + 1, false);
      } else {
        // `error` cleared, and there is nothing above it. The exit pad becomes the
        // checkpoint, so the fall that follows the celebration lands back on the pad rather
        // than at the bottom of the stage, and the player leaves by the control that
        // brought them up. game.js is what awards showdown.error-handled and
        // showdown.obby-six off the cleared count this write just raised to six.
        pinCheckpoint(padOrFeet(st.exit));
      }
      return { kind: "cleared", stageIndex: st.index, oofbux };
    },

    // One tick: read the feet, keep inObby() and stageIndex() honest, run the reversal
    // hand-off and the label's stutter. It branches on nothing in `facts` (rule 5).
    update(dt, context, facts) {
      if (S.disposed) return;
      const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
      if (facts && typeof facts.phase === "string") S.phase = facts.phase;

      const feet = feetNow();
      if (insideColumn(feet)) {
        S.inColumn = true;   // a respawn or a teleport can have put them back up here
        S.stage = stageFromFeet(feet);
        if (!S.revArmed) armReversal();
        tickReversal(step);
        tickFlicker(step);
      } else if (S.inColumn || S.revArmed) {
        // They left by a route that did not go through leave(): a JOIN ROUND teleport into
        // a ground, §4.1's teleport back to the lobby pad, or a fall out of the column past
        // its own kill slab. Either way the attempt is over and the column goes to rest.
        endRun();
      }
    },

    // What the flight refusal, the vote HUD and §11.3's prompt all read (§13.2, §6).
    inObby() { return !S.disposed && S.inColumn; },

    // The stage you are standing in, 0..5, or -1 when you are not in the obby at all.
    stageIndex() { return S.disposed ? -1 : S.stage; },

    // save.obbyStage: stages CLEARED, 0..6 (rule 3). The Glitchsteel gate, the obby-six
    // badge and the arch's stage picker all read this one number.
    cleared() { return S.disposed ? 0 : clearedCount(); },

    // The single write path for rule 4's alternation: `which` 0 leaves each pair's `a` half
    // solid and makes `b` a sensor, and 1 the other way about. update drives the cadence
    // through it, and the test seam can drive it directly to put both pairs in a known
    // phase without waiting out a period.
    setReversalPhase(context, which) {
      if (S.disposed) return;
      applyPhase((Number(which) | 0) % 2 === 0 ? 0 : 1);
      S.revT = 0;
    },

    // Everything this module created or changed, undone, so a second init after a dispose
    // starts clean (§17.4). The label is the only part it ever made; the pairs go back to
    // both-solid, which is how place.json authors them.
    dispose(context) {
      if (S.disposed) return;
      S.disposed = true;
      if (S.labelId != null) {
        ctx.engine.parts.remove(S.labelId);
        S.labelId = null;
      }
      releasePairs();
      S.inColumn = false;
      S.stage = -1;
      S.revArmed = false;
      for (let i = 0; i < S.entryAt.length; i++) S.entryAt[i] = -1;
    },
  };

  createLabel();
  return api;
}

// =====================================================================================
// Derivations from the authored column, run once in create().
// =====================================================================================

// The box inObby() tests against, grown from whichever of the twelve pads resolved. Null
// when none of them did, which leaves inObby() driven by the entry pads and leave() alone -
// still correct, because a pad is the only way into the column.
function deriveColumn(stages) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let any = false;
  for (const st of stages) {
    for (const p of [st.cp, st.exit]) {
      if (!isVec3(p)) continue;
      any = true;
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  if (!any) return null;
  return Object.freeze({
    minX: minX - COLUMN_MARGIN_X,
    maxX: maxX + COLUMN_MARGIN_X,
    minY: minY - COLUMN_MARGIN_BELOW,
    maxY: maxY + COLUMN_MARGIN_ABOVE,
  });
}

// Where leave() puts a player down: on the lobby ground just past the arch pad's +x edge.
function deriveLobbyReturn(ctx) {
  const def = partDefOf(ctx, ARCH_PAD_ID);
  if (def && Array.isArray(def.position) && Array.isArray(def.size)) {
    const x = Number(def.position[0]) + Number(def.size[0]) / 2 + ARCH_CLEAR_X;
    const z = Number(def.position[2]);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      return [x, TUNE.LOBBY_Y + PAD_FEET_CLEARANCE, z];
    }
  }
  return LOBBY_RETURN_FALLBACK.slice();
}
