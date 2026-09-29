// src/games/showdown/scripts/world.js - Showdown's materializer. Spec 25 §3.4 owns this
// file, and it owns exactly one thing: the live id set of the ONE ground that exists at a
// time, plus the queue that ground is built out of.
//
// Why a materializer exists at all (§2.1): place.json holds the lobby and the whole
// six-stage obby and nothing else, because parts.load buckets every anchored,
// behaviourless part and InstancedMesh'es any bucket of two or more, and an instanced part
// is permanently immutable - remove, setPosition, setColor and setCanCollide all throw on
// it. There is no parts.load on ctx either. So a ground authored in place.json could never
// be torn down between rounds, and the three grounds are therefore grown at runtime
// through ctx.engine.parts.create and released again.
//
// The three builders are pure (§3.2): they import nothing, touch no ctx, no THREE and no
// DOM, so tools/validate.js can import() them under Node and assert their geometry. All
// three grounds sit side by side in XZ at MAPS[].origin, never stacked, because killY is
// one number for the whole Place and a lower ground's floor would sit under it (§3).
//
// Nothing else in this Place may remove a world part. game.js drains, reads the landmarks
// and calls release; it never touches the ids.

import { TUNE, LOBBY_LIGHTING, mapById } from "./config.js";
import { build as buildForest } from "./maps/forest.js";
import { build as buildCity } from "./maps/city.js";
import { build as buildForgotten } from "./maps/forgotten.js";

// One builder per MAPS row, keyed by the id that rides the wire as `mp` (§5.5). A map id
// with no row here is a programming error, not a player input, so materialize throws on it
// rather than quietly building nothing: a client that silently skipped materialization
// would stand in the lobby for a whole round believing it was fighting (§6).
const BUILDERS = Object.freeze({
  forest: buildForest,
  city: buildCity,
  forgotten: buildForgotten,
});

// Returned instead of a fresh literal by landmarks / weaponPads / wardenSpots before a
// ground is materialized. Frozen so a caller cannot start using it as scratch space, and
// shared so the per-tick readers in game.js and hud.js allocate nothing.
const NO_LANDMARKS = Object.freeze({});
const NO_PADS = Object.freeze([]);
const NO_SPOTS = Object.freeze([]);

// =====================================================================================
// The monotonic runtime id stamp (§3.4).
// =====================================================================================
// A RUNTIME PART ID IS NEVER REUSED, EVER, NOT EVEN ACROSS ROUNDS, and uniqueness merely
// within one build satisfies neither of the two reasons:
//   1. buildIndividualPart does partsById.set(def.id, record) unchecked, so a reused id
//      silently overwrites the record and LEAKS the old collider, which the dispose gate
//      then reports as colliders:+N and which fails the smoke run.
//   2. removePartInternal drops the record, the collider and the lamp but NEVER the
//      part's behaviorStateByPartId entry. That map is cleared only by parts.clear(),
//      which no Place can call. So a rebuilt part with a stable id is handed the PREVIOUS
//      round's behaviour list and initBehaviorRuntime never runs for the new record: a
//      re-built conveyor or spinner never gets setColliderMotion called for its new
//      collider and so carries and sweeps nobody, a touchEvent weapon pad comes back with
//      its old fired/cooldown and can never fire again, and a movingPlatform ticks from a
//      stale prevPos/curPos baseline.
//
// `seq` is module scope and reset() deliberately does NOT rewind it. It is a counter, not
// world state: nothing observes it, it only ever rises, and rewinding it is the one thing
// that could hand round N+1 an id round N already used. The engine's own runtime ids are
// `rt<n>` and place.json's are authored names, so a prefixed stamp can never collide with
// either; callers pass their subsystem's prefix (`vfx`, `prop`, `wdn`) and never "rt".
let seq = 0;

export function uid(prefix) {
  seq += 1;
  // The seq is the last segment, so two subsystems whose prefixes differ can never land
  // on the same string however their prefixes end.
  const tag = typeof prefix === "string" && prefix.length > 0 ? prefix : "sd";
  return `${tag}_${seq}`;
}

// =====================================================================================
// State. One module-level holder, nulled by reset() so a second init starts clean.
// =====================================================================================

let S = null;

function fresh() {
  return {
    mapId: null,     // the materialized ground, from materialize until release
    build: null,     // the MapBuild the builder returned, read-only from here on
    queue: [],       // the builder's PartDefs, unstamped and unbuilt
    at: 0,           // read cursor into `queue`; a cursor rather than shift() so a
                     // 1800-part queue is not re-packed 1800 times during one drain
    live: [],        // runtime ids, IN CREATION ORDER, which is release order
    colliders: 0,    // how many of `live` registered a collider (§3.2's 900 ceiling)
    lit: false,      // has this ground's lighting been applied yet (§3.3)
  };
}

// Whether a def will register a collider at all, which is the cheapest detail in the
// engine: canCollide:false with NO behaviours registers no collider, the same part WITH a
// behaviour registers a SENSOR (which is what a weapon pad is, §7.2). Mirrors
// registerColliderForDef, including normalizeRuntimePart's default of canCollide:true for
// a def that omits the key.
function registersCollider(def) {
  const hasBehaviors = !!(def && def.behaviors && def.behaviors.length > 0);
  return !def || def.canCollide !== false || hasBehaviors;
}

// The config a ground is lit with (§3.3). A builder may return its own `lighting` to
// override its MAPS row, which is the only reason MapBuild carries the key at all; the
// row is the fallback so a builder that returns none still gets a fully-populated spec 04
// §3.3 config rather than applyLighting's defaults. Scene lights are never written
// directly, and no fog `near` key is ever passed: resolveFog derives near as 0.55 * far
// and clamps far to 300 on the low tier that SwiftShader and phones report.
function lightingFor(mapId, build) {
  const authored = build && build.lighting;
  if (authored && typeof authored === "object") return authored;
  const row = mapById(mapId);
  return (row && row.lighting) || LOBBY_LIGHTING;
}

function isVec3(v) {
  return Array.isArray(v) && v.length === 3 &&
    Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

// =====================================================================================
// materialize / drain / release (§3.4)
// =====================================================================================

// Queues that ground's parts and builds none of them. Materialization begins at t = 20 s
// into the intermission, the instant the vote closes, and the drain then has twenty
// seconds of intermission left as slack (§3.4).
//
// `ctx` is taken for symmetry with drain and release, and because the queue belongs to
// this ctx's Place; nothing here reaches into the engine, which is the point: no part is
// created until drain spends a tick budget on it.
export function materialize(ctx, mapId) {
  const builder = BUILDERS[mapId];
  if (!builder) throw new Error(`showdown world: unknown map id ${JSON.stringify(mapId)}`);

  // Materialize twice is a no-op: the second call returns what is still queued rather
  // than rebuilding a ground that is already standing. round.js calls this every tick
  // from the build window, so this is the normal path, not a defensive one.
  if (S && S.mapId === mapId) return S.queue.length - S.at;

  // A DIFFERENT ground live or queued is §6's divergence case: a client whose resolved
  // map differs from the non-stale conductor's `mp` re-materializes the conductor's map,
  // because the grounds sit in different origin bands and two clients on two grounds can
  // never connect a hit. Releasing the old one here rather than trusting the caller to is
  // what keeps "only ONE map exists at a time" (§2.1) true by construction: the
  // alternative leaks 1800 parts and their colliders into the dispose gate.
  if (S && S.mapId) release(ctx);

  S = fresh();
  const build = builder();
  if (!build || !Array.isArray(build.parts)) {
    throw new Error(`showdown world: builder for ${mapId} returned no parts`);
  }

  // §3.2's ceilings: at most MAP_PARTS_MAX parts of which at most MAP_COLLIDER_MAX
  // collide, which is what keeps the live collider count under the 3000 the smoke run
  // asserts with the lobby, the obby, the Wardens and the effects all present too. Rule
  // 25:S1 asserts both against every builder, so a warn here means a builder regressed
  // between validate and the browser. The tail past MAP_PARTS_MAX is dropped rather than
  // built, because the ceiling is the budget the collider gate is derived from; the
  // collider overrun is only reported, since dropping the parts that happen to be last in
  // a builder's array would open a hole in a floor somebody is standing on.
  let queued = build.parts;
  if (queued.length > TUNE.MAP_PARTS_MAX) {
    console.warn("[oof] showdown world: map over the part ceiling", mapId, queued.length);
    queued = queued.slice(0, TUNE.MAP_PARTS_MAX);
  }
  let colliding = 0;
  for (const def of queued) if (registersCollider(def)) colliding += 1;
  if (colliding > TUNE.MAP_COLLIDER_MAX) {
    console.warn("[oof] showdown world: map over the collider ceiling", mapId, colliding);
  }

  S.mapId = mapId;
  S.build = build;
  S.queue = queued;
  return S.queue.length - S.at;
}

// Builds at most maxPerTick of the queued defs and returns how many are still queued, so
// game.js can drain until it returns 0. This is the ONLY caller of parts.create for a
// ground, and every def is stamped with its own uid immediately before the call.
export function drain(ctx, maxPerTick) {
  if (!S || S.at >= S.queue.length) return 0;

  const budget = Number.isFinite(maxPerTick) && maxPerTick > 0
    ? Math.floor(maxPerTick)
    : TUNE.DRAIN_PER_TICK;

  // The lighting swap happens on the FIRST DRAINED BATCH, not at materialize time, so the
  // sky does not turn forest-green or city-violet twenty seconds before there is anything
  // standing under it and while the lobby is still the only thing to look at (§3.3).
  if (!S.lit) {
    ctx.engine.renderer.applyLighting(lightingFor(S.mapId, S.build));
    S.lit = true;
  }

  let made = 0;
  while (S.at < S.queue.length && made < budget) {
    const def = S.queue[S.at];
    S.at += 1;
    made += 1;
    // A SHALLOW COPY, never a mutation of the builder's own def: a builder may return a
    // frozen or a module-cached array, and stamping the id onto the original would either
    // throw or hand the NEXT round the previous round's id, which is exactly the id reuse
    // the whole uid rule exists to prevent. The spread puts our stamp last, so it also
    // wins over a stray `id` a builder should not have written (rule 25:S1 asserts none).
    const stamped = { ...def, id: uid("wd") };
    let id = null;
    try {
      id = ctx.engine.parts.create(stamped);
    } catch (err) {
      // A malformed def is a builder bug that rule 25:S1 is meant to catch first. It is
      // reported and skipped rather than allowed out of update, because a throw out of
      // update sets updateHalted and kills the Place for the rest of the session, while a
      // skipped part is one hole in one wall. console.error is deliberate: the smoke run
      // collects console errors, so this cannot hide.
      console.error("[oof] showdown world: part rejected", S.mapId, err);
      continue;
    }
    S.live.push(id);
    if (registersCollider(stamped)) S.colliders += 1;
  }
  return S.queue.length - S.at;
}

// Removes every id this module created, in creation order, restores the lobby sky and
// hands the perch back to the lobby's. Release with nothing live is a no-op.
//
// §4.1 is strict about WHEN this runs on the result -> intermission edge: every player is
// teleported to the lobby pad and handed their checkpoint back FIRST, because releasing
// the ground first drops the winner through a floor that no longer exists and kills them
// at killY, a death that can race the phase flip and be counted as a round death.
export function release(ctx) {
  if (!S || !S.mapId) return;

  // Creation order, forward: the ids are pushed in build order and a runtime part is
  // never instanced, so remove can neither throw here (instanced parts are the only
  // throw, and a missing record returns early) nor leave a collider behind.
  for (const id of S.live) ctx.engine.parts.remove(id);

  // The lobby sky comes back whether or not the drain ever got as far as applying the
  // ground's (the §4.2 skipped-fight path releases a ground that was only part-built), so
  // there is no path on which a released ground leaves its fog colour behind.
  ctx.engine.renderer.applyLighting(LOBBY_LIGHTING);

  // Dropping build and queue is what restores TUNE.PERCH as the perch and empties
  // weaponPads / wardenSpots / bounds: every reader below derives from S.build, so there
  // is no second copy of "which ground is live" to fall out of step with this one.
  S = fresh();
}

// =====================================================================================
// Readers. All of them are total, all of them are safe before a ground exists, and none
// of them allocates on the per-tick path except perch().
// =====================================================================================

export function liveCount() {
  return S ? S.live.length : 0;
}

export function liveColliderCount() {
  return S ? S.colliders : 0;
}

// The materialized ground's id, from materialize until release, which is also what
// round.js publishes as `mp` (§5.5). It is set at materialize rather than at the end of
// the drain on purpose: the ground a client has committed to is a fact from the moment the
// vote closes, and a follower comparing its own ground against the conductor's `mp` at the
// fight edge (§6) has to be able to see a part-built one.
export function currentMapId() {
  return S ? S.mapId : null;
}

// The builder's landmarks, read-only. Available from materialize for the same reason
// currentMapId is: §4.1 sets the checkpoint to the perch on the fight edge, where the
// drain may still have a tail in flight, and a checkpoint that fell back to the lobby
// perch for those clients would land a dead fighter 900 to 3300 studs from the ground.
export function landmarks() {
  return S && S.build && S.build.landmarks ? S.build.landmarks : NO_LANDMARKS;
}

// Where a dead fighter watches from (§12.1), as a fresh array so a caller may offset it in
// place without writing into the builder's own data.
//
// The fallback is TUNE.PERCH, the LOBBY perch, and the distinction is not cosmetic: the
// lobby sits at x -70..70 while the grounds are 900 to 3300 studs away on +X, the camera's
// far plane is 1200 and fog far is clamped to 300 on the low tier, so a lobby perch during
// a round shows an empty lobby and for two of the three grounds the map is past the far
// plane entirely. Every builder therefore returns its own landmarks.perch inside its own
// band, at roughly origin + TUNE.PERCH_ABOVE_ORIGIN, and release() hands this one back.
export function perch() {
  const p = landmarks().perch;
  const src = isVec3(p) ? p : TUNE.PERCH;
  return [src[0], src[1], src[2]];
}

// The twelve pads the live ground carries (§7.2), read-only. Each row is a PadDef whose
// sensor part is already in the builder's `parts`, so this is the routing table game.js
// reads when a `touch:<event>` arrives, not a second set of parts to create.
export function weaponPads() {
  return S && S.build && Array.isArray(S.build.weaponPads) ? S.build.weaponPads : NO_PADS;
}

// The WARDEN_COUNT spots the builder chose, read-only (§9). The Wardens themselves are
// wardens.js's parts, not this module's: it owns the ground and nothing that walks on it.
export function wardenSpots() {
  return S && S.build && Array.isArray(S.build.wardenSpots) ? S.build.wardenSpots : NO_SPOTS;
}

// The axis-aligned box the live ground occupies, or null with no ground. §13.2's flight
// clamps to it in XZ and measures its FLY_CEILING_Y above bounds.min[1], which is why
// "studs above the map floor" is undefined in a lobby with no map and the lobby band is
// flight's fallback there.
export function bounds() {
  return S && S.build && S.build.bounds ? S.build.bounds : null;
}

// The spawn positions §4.1 assigns by rank in the sorted fighter set, read-only. It is an
// additive reader beside the contract's twelve: the builders return `spawns`, §4.1 is the
// only consumer of them, and game.js can reach a live build no other way. Nothing here
// picks an index; twenty non-overlapping positions are all the builder promises.
export function spawns() {
  return S && S.build && Array.isArray(S.build.spawns) ? S.build.spawns : NO_SPOTS;
}

// =====================================================================================
// reset (§17.4). dispose calls release(ctx) and then this, last.
// =====================================================================================
// Nothing this module owns may survive a dispose, so a second init starts with no ground,
// no queue and no ids. `seq` is the deliberate exception and is documented at its
// declaration: rewinding a monotonic id stamp is the defect, not the state.
export function reset() {
  // reset() takes no ctx and therefore cannot remove a part, so a ground still live here
  // means dispose skipped release and the dispose gate is about to report the colliders.
  // Saying so is the most this function can honestly do about it.
  if (S && S.live.length > 0) {
    console.warn("[oof] showdown world: reset with parts still live", S.live.length);
  }
  S = null;
}
