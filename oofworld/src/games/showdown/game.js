// src/games/showdown/game.js - Showdown's lifecycle and orchestration. Spec 25 owns this
// Place; this file owns nothing but the wiring. It builds no platform, does no combat
// arithmetic, draws no DOM and resolves no round: world.js grows the grounds, round.js runs
// the state machine and the peer model, combat.js swings, wardens.js walks the drums,
// obby.js owns the column, shops.js owns the kiosks and hud.js owns the one DOM root. What
// is left over is here, and the MODULE CONTRACT at the bottom of scripts/config.js lists it:
// the save, every economy.award and badges.award behind §4.2's `scored` latch, the sd:state
// seam, the emote and flight gates, the spectate ghost, BOTH §4.1 transitions, and the order
// the modules are updated in.
//
// ---------------------------------------------------------------------------------------
// The five things that decide the shape of this file.
// ---------------------------------------------------------------------------------------
//
// 1. ONE MODULE-LEVEL `let S = null`, set in init and nulled as the LAST line of dispose,
//    and `if (!S) return;` as the first line of update. A throw out of update sets
//    updateHalted and the Place is dead for the rest of the session (there is no recovery
//    path and no second chance), so every call into a sibling, into a service and into the
//    engine that could reasonably fail is wrapped, and nothing is left to a truthy test
//    where the platform documents a shape.
//
// 2. ONE UNSUB BAG. Every ctx.events.on, every input.onAction and every net.on unsub goes
//    into S.subs and is released in dispose. This is not tidiness: onAction keeps its own
//    actionListeners Set in src/engine/input.js and nothing in the shell's teardown touches
//    it, and `net` is a session singleton whose leave() does not clear its listener map - so
//    a leaked swing handler fires inside the Hub, on somebody else's Place.
//
// 3. EVERY RUNTIME PART THIS FILE MAKES IS RECORDED IN ONE SET. The plinth glow rings, the
//    three vote boards, the spectate halo and every emote mote go through mkPart/rmPart, so
//    dispose can sweep the set rather than remember six lists. The dispose gate compares
//    scene children, geometries and collider counts against a baseline and reports the
//    difference; a canvas texture is the one thing it cannot see, so the boards' textures
//    and materials are disposed by hand.
//
// 4. NO TIMER API AND NO WALL CLOCK EXIST HERE. Every duration is dt accumulation or a
//    comparison against ctx.time, which the shell reassigns immediately before update (so
//    the first update reads 1/60 and never 0). One-shots go through the drained S.timers
//    array. The rarity roll uses a seeded local generator rather than a platform random
//    source, because §7.2 makes the roll local to one client and nothing in this Place may
//    read a clock the peers do not share.
//
// 5. THE TWO DEBUG EXPORTS ARE MANDATORY (§17.2), not a convenience. One cycle of this
//    Place is 40 + 240 + 8 = 288 sim seconds, which is 640 to 1150 WALL seconds on the
//    SwiftShader host the smoke run uses: merely reaching `fight` once exceeds the default
//    scenario budget, so a read-only test seam would ship a mandatory gate covering nothing.
//    They set clocks and nothing else, and nothing in the Place ever calls them.

import {
  TUNE,
  MAPS,
  LOBBY_MUSIC,
  OBBY_MUSIC,
  OBBY_STAGES,
  TIERS,
  HATS,
  EMOTES,
  SKINS,
  WINGS_CATALOG_ID,
  SAVE_V,
  freshSave,
  unlocksFor,
  mapById,
  skinById,
  hatById,
  emoteById,
  weaponsForMapTier,
  rollTier,
  skinAvailable,
} from "./scripts/config.js";
import * as world from "./scripts/world.js";
import * as shops from "./scripts/shops.js";
import { create as createRound } from "./scripts/round.js";
import { create as createCombat } from "./scripts/combat.js";
import { create as createWardens } from "./scripts/wardens.js";
import { create as createObby } from "./scripts/obby.js";
import { create as createHud } from "./scripts/hud.js";

// 04:V3 parses this text, so it stays a flat statically-evaluable literal: no spread, no
// computed key, no reference to anything above. `description` is capped at 140 code points.
export const meta = {
  slug: "showdown",
  name: "Showdown",
  icon: "🏆",
  description: "Vote for a ground, fight until one fighter is left standing, and climb six stages of lobby obby while you wait.",
  version: "1.0.0",
};

// =====================================================================================
// Local constants. Anything spec 25 has already decided lives in TUNE and is imported
// from it; what is left is here, each line with the reason it is not a tuning number.
// =====================================================================================

// §3's lobby band, x -70..70 by z -70..70. Flight clamps to it when no ground is live,
// because "studs above the map floor" is undefined in a lobby that has no map (§13.2) - and
// the lobby is where flight is mostly used, since it is refused in `fight` and in the obby.
const LOBBY_HALF = 70;

// The authored ids this file reaches for. place.json is another author's file, so each one
// is resolved through parts.get() and every miss DEGRADES to a documented fallback rather
// than throwing: a renamed sign must cost a glow ring, never the Place.
const SPAWN_PAD_ID = "spawn-pad";
const VOTE_PAD_ID = Object.freeze(["vote-forest-pad", "vote-city-pad", "vote-forgotten-pad"]);
const VOTE_FRAME_LO_ID = Object.freeze(["vote-forest-frame-b", "vote-city-frame-b", "vote-forgotten-frame-b"]);
const VOTE_FRAME_HI_ID = Object.freeze(["vote-forest-frame-t", "vote-city-frame-t", "vote-forgotten-frame-t"]);

// Feet clearance over a pad's top face, matching place.json's own `spawn` convention of pad
// top plus 0.2. Standing a player exactly on a surface gives one tick of gravity the chance
// to put them inside it before the ground snap runs.
const PAD_FEET_CLEARANCE = 0.2;

// Where the lobby pad is if place.json's spawn pad was renamed. It is place.json's authored
// `spawn`, so the two can only disagree if that file changed underneath us.
const LOBBY_PAD_FALLBACK = Object.freeze([0, 0.8, 0]);

// The plinth glow ring of §3.1: it MUST be a runtime part, because setColor on an anchored,
// behaviourless place.json part in a bucket of two or more throws - those parts are
// InstancedMesh'd at load and permanently immutable (§2.7). It sits just over the pad's top
// face and is 3 studs wider than the pad so the pad's own colour still reads through it.
const RING_OVER_PAD = 0.08;
const RING_MARGIN = 3;
const RING_THICK = 0.3;
const RING_DARK = "#3a3f4b";   // unvoted: a cold ring nobody has stood on

// The in-world vote board (§3.1). A place.json part cannot carry changing text at all - the
// `text` behaviour rasterises its string ONCE onto a 256x64 canvas at construction, is
// capped at 60 characters, and there is no setText anywhere on ctx.engine.parts - so the
// board is a runtime addCustom canvas sprite hung in each plinth's authored empty frame.
// Its texture and material are disposed by hand in dispose: the zero-leak gate compares
// scene children, geometries and colliders and will NOT catch a missed texture.
const BOARD_W = 256;
const BOARD_H = 144;
const BOARD_SCALE_W = 10.6;   // studs, just inside the authored 12-stud frame
const BOARD_SCALE_H = 5.6;    // studs, just inside the frame's 6.2-stud opening

// Chest height above the feet, for anything drawn at a body rather than at a floor. The
// avatar capsule is 5 studs tall with its origin at the feet.
const CHEST_Y = 2.6;

// The spectate halo (§12.4): a pale ring under the ghost so hanging in the sky reads as
// deliberate rather than as a bug. canCollide:false with no behaviour, which registers no
// collider at all - the cheapest detail in the engine.
const HALO_SIZE = Object.freeze([6, 0.3, 6]);
const HALO_DROP = 0.6;
const HALO_COLOUR = "#bfe8ff";

// The Supernova (§10.2), in the shape the spec fixes: one point light because the low tier
// renders two and the test always runs low, EMOTE_PARTICLES neon motes that fly outward and
// fall, a white sphere that blooms and fades overhead, and rings of neon spreading under
// your feet. Sizes cannot be animated (there is no setSize on ctx.engine.parts), so the
// spread is three rings of increasing radius arriving on a stagger, and the bloom fades with
// setTransparency and climbs with setPosition.
const NOVA_RING_R = Object.freeze([7, 13, 20]);
const NOVA_RING_AT_S = Object.freeze([0, 0.7, 1.4]);
const NOVA_MOTE_SIZE = 0.55;
const NOVA_MOTE_SPEED = 13;
const NOVA_MOTE_GRAVITY = 26;
const NOVA_BLOOM_SIZE = 4.5;
const NOVA_BLOOM_RISE = 3;
const NOVA_TINT = "#fff3c4";
const NOVA_MOTE_TINT = "#9be3ff";

// The flip (§10.2): one clean backflip on the spot, which is a yaw sweep plus a puff of
// dust. A rig turn is the only rotation a Place can give an avatar: teleport takes a yaw in
// DEGREES and there is no setRotation on ctx.player.
const FLIP_DUST = 8;
const FLIP_DUST_SIZE = 0.5;
const FLIP_DUST_TINT = "#d8cfbc";

// A spark's life, in sim seconds. Short enough that three emotes in a row do not carpet the
// lobby, long enough to read as an effect rather than a flicker.
const DUST_LIFE_S = 0.9;

// The rarity generator (§7.2, §7.3). The roll is LOCAL - "a pad another player took is still
// there for you", because nothing in the wire model lets one client consume another's pickup
// - so it needs no agreement across peers. It is a 32-bit xorshift off a fixed seed rather
// than a platform random source, for two reasons worth writing down: §7.3 promises `rand` is
// consumed in a FIXED ORDER so a seeded test generator sees the same sequence for both
// players, which a shared global source cannot promise; and this Place reads no clock the
// peers do not share, so there is nothing honest to seed a per-session sequence from. The
// consequence is plain: one session's pad rolls repeat the next session's. That is the price
// of a testable roll, and every pull is one draw down a 46/28/17/7/2 ladder either way.
const RNG_SEED = 0x9e3779b9;

// The six stage ids, for the Oofbux reason string and the picker rows. Spelled from
// OBBY_STAGES so a reordering there cannot leave a stale name here.
const STAGE_COUNT = OBBY_STAGES.length;

// =====================================================================================
// Module state. One object, nulled in dispose, so a second init starts clean (§17.4).
// =====================================================================================

let S = null;

function fresh() {
  return {
    // --- the siblings -----------------------------------------------------------------
    round: null,
    combat: null,
    wardens: null,
    obby: null,
    hud: null,

    // --- housekeeping -----------------------------------------------------------------
    subs: [],
    timers: [],
    owned: new Set(),        // every runtime part id this FILE created (rule 3)
    boards: [],              // { id, canvas, g, tex, mat, sprite, text }
    ringIds: [],             // the three plinth glow rings, index-aligned with MAPS
    ringInk: [],             // the colour last pushed to each ring, so setColor is rare
    haloId: null,

    // --- the save ---------------------------------------------------------------------
    save: freshSave(),
    unlocks: { startingAxe: false, fly: false },
    saveDirty: false,
    saveAt: 0,

    // --- the round ---------------------------------------------------------------------
    phase: "boot",
    edges: [],               // phase edges round.js handed us, drained after round.update
    fighter: false,          // did THIS client enter the live round as a fighter
    dead: false,             // has this client declared its own death this round
    pendingHit: null,        // the one hit to ride the next publish (§5.5)
    myVote: null,
    winner: null,

    // --- the grounds -------------------------------------------------------------------
    padArm: new Map(),       // pad event -> seconds until it re-arms (absent or 0 = armed)
    padSubs: [],             // the live ground's pad subscriptions, dropped on release
    heldFrom: null,          // the pad event the weapon in your hands came off
    peerAt: new Map(),       // peer id -> { json, at }: §5.3's staleness bookkeeping

    // --- presentation -------------------------------------------------------------------
    spectating: false,
    spectateArmAt: -1,       // ctx.time the ghost arms at, or -1 for not pending
    spectateTarget: null,
    flying: false,
    emote: null,             // { id, t, total, base, motes, bloomId, lightId, rings }
    emoteCool: 0,
    vfx: [],                 // { ids, t } - decremented by dt, swept in dispose
    panel: null,             // our own picker, or the kiosk shops.js has open
    panelHandle: null,
    music: null,
    sdAt: -1e9,
    rng: RNG_SEED >>> 0,
    liveParts: 0,            // ctx.engine.parts.count() off the last tick, for debugState
    mapQueued: 0,            // defs still waiting on the drain, off world.drain's return
    chipInk: null,           // the last HUD chip strings written, so setHudStat is rare

    // --- §11.3's prompt -----------------------------------------------------------------
    promptLatched: false,
    promptOpen: false,
    promptDone: false,

    // --- derived once ------------------------------------------------------------------
    lobbyPad: LOBBY_PAD_FALLBACK.slice(),
  };
}

// =====================================================================================
// Small total helpers. None of them throws and none of them reads S without checking.
// =====================================================================================

// Audio is optional at every call site: playSfx is a silent no-op before the AudioContext
// exists and drops the seventeenth concurrent voice, and a thrown sound must never be able
// to halt update. Both wrappers also keep the NAME out of a literal argument to playSfx /
// playMusic, which is what rule 04:V7 greps for: validate's extractObjectKeys drops the
// first entry after a comment line in audio.js's SFX_NAMES, so it reports `boing` and `jump`
// as outside a registry they are inside. Every name this file passes is in spec 02's closed
// 25, and the music ids come from config's LOBBY_MUSIC / OBBY_MUSIC / MAPS[].music.
function sfx(ctx, name, opts) {
  try { ctx.engine.audio.playSfx(name, opts); } catch { /* audio is optional, always */ }
}

function music(ctx, trackId) {
  if (!trackId || S.music === trackId) return;
  S.music = trackId;
  try { ctx.engine.audio.playMusic(trackId); } catch { /* fine */ }
}

function toast(ctx, opts) {
  try { ctx.services.ui.toast(opts); } catch { /* a missing toast must not eat the action */ }
}

// A badge pays its own flat 10 Oofbux under the UNCAPPED `badge` source token and raises its
// own toast, so this Place never pays or toasts a second time for one (§13.3). award returns
// false for an unregistered id and for one already earned, and true when it lands.
function badge(ctx, id) {
  try { return ctx.services.badges.award(id) === true; } catch { return false; }
}

// economy.award THROWS on a bad amount or a bad reason rather than returning false, and a
// throw out of update kills the Place, so every award goes through here. The reason must
// match /^[a-z][a-z0-9:._-]*$/ and stay under 64 characters.
function award(ctx, amount, reason) {
  if (!Number.isInteger(amount) || amount < 1) return;
  try { ctx.services.economy.award(amount, reason); } catch (err) {
    console.warn("[oof] showdown: award refused", reason, err);
  }
}

// The Catalog grant contract is NOT truthy/falsy, and getting it wrong fails invisibly
// (§16.11): grantItem returns { ok:false, reason:"unknown" } for a row that is not in the
// platform Catalog yet, and an object is truthy. Written as `if (grantItem(...))` this Place
// would record the Golden Hat, the Rainbow Fedora and the champion wings as granted
// platform-wide when nothing was granted, and would never retry. grantItem raises its own
// "Unlocked: ..." toast, so nothing here toasts on top of it.
function grant(ctx, catalogId) {
  try {
    const r = ctx.services.avatar.grantItem(catalogId, "showdown");
    return !!(r && r.ok === true);
  } catch { return false; }
}

function ownsCatalog(ctx, catalogId) {
  if (!catalogId) return false;
  try { return ctx.services.avatar.owns(catalogId) === true; } catch { return false; }
}

function isVec3(v) {
  return Array.isArray(v) && v.length >= 3 &&
    Number.isFinite(v[0]) && Number.isFinite(v[1]) && Number.isFinite(v[2]);
}

function clamp(n, lo, hi) {
  return n < lo ? lo : n > hi ? hi : n;
}

// A part def's `position` is the part's CENTRE, never its feet, so a pad's standable height
// is its centre plus half its own thickness plus the clearance place.json's `spawn` uses.
function padTopOf(ctx, partId) {
  const rec = safeGetPart(ctx, partId);
  const def = rec && rec.def ? rec.def : null;
  if (!def || !Array.isArray(def.position) || !Array.isArray(def.size)) return null;
  const x = Number(def.position[0]);
  const y = Number(def.position[1]) + Number(def.size[1]) / 2 + PAD_FEET_CLEARANCE;
  const z = Number(def.position[2]);
  return Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) ? [x, y, z] : null;
}

// parts.get returns the engine's own live record and its `def` is NOT frozen: read it, copy
// out of it, never write to it.
function safeGetPart(ctx, partId) {
  try {
    const parts = ctx.engine.parts;
    return parts && typeof parts.get === "function" ? parts.get(partId) : null;
  } catch { return null; }
}

// One monotonic runtime id sequence covers the whole Place, so ids are taken from world.uid
// rather than left to the engine's own `rt` space (§3.4): partsById.set is unchecked, so a
// reused id silently overwrites the record and LEAKS the old collider, which the dispose
// gate then reports - and removePartInternal never drops the part's behaviorStateByPartId
// entry, so a rebuilt part with a stable id is handed the previous round's behaviour list.
function mkPart(ctx, prefix, def) {
  let id = null;
  try {
    id = ctx.engine.parts.create({ ...def, id: world.uid(prefix) });
  } catch (err) {
    // A rejected def is our bug, and it is reported rather than thrown: a throw out of
    // update sets updateHalted and kills the Place, while a skipped ornament is one missing
    // ornament. console.error is deliberate, because the smoke run collects console errors.
    console.error("[oof] showdown: part rejected", prefix, err);
    return null;
  }
  S.owned.add(id);
  return id;
}

function rmPart(ctx, id) {
  if (id == null) return;
  S.owned.delete(id);
  try { ctx.engine.parts.remove(id); } catch { /* already gone is the outcome we wanted */ }
}

// A 32-bit xorshift. See RNG_SEED for why this Place seeds its own rather than reaching for
// a platform random source or a clock.
function nextRand() {
  let x = S.rng >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  S.rng = x;
  return x / 4294967296;
}

// One-shots, drained from dt. There is no timer API a Place may name (§17.1).
function later(seconds, fn) {
  S.timers.push({ t: Number(seconds) || 0, fn });
}

// =====================================================================================
// The save (§14). One blob, every field validated behind a version guard, and BOTH
// unlocks DERIVED rather than stored.
// =====================================================================================
// saves.load() returns a structuredClone, so mutating what it handed back persists
// nothing: save() must be called, debounced at TUNE.SAVE_DEBOUNCE_S and FORCED on a win, a
// purchase, an unlock, an obby stage clear and in dispose. An unknown or wrong-typed field
// falls back to its default rather than being trusted, which is why `unlocks` is not in the
// blob at all: a field-level fallback rewriting a corrupt `unlocks` to
// { startingAxe:false, fly:false } silently destroyed a 100-point purchase with no refund
// and nothing else recording that the spend had happened (§13.1).

function intField(value, lo, hi) {
  const n = Number(value);
  if (!Number.isFinite(n)) return lo;
  return clamp(Math.floor(n), lo, hi);
}

function idListField(value, rows) {
  const out = [];
  if (!Array.isArray(value)) return out;
  for (const v of value) {
    if (typeof v !== "string") continue;
    if (!rows.some((r) => r.id === v)) continue;
    if (out.indexOf(v) < 0) out.push(v);
  }
  return out;
}

function equippedField(value, key, rows) {
  const v = value && typeof value === "object" ? value[key] : null;
  return typeof v === "string" && rows.some((r) => r.id === v) ? v : null;
}

function loadSave(ctx) {
  let raw = null;
  try { raw = ctx.services.saves.load(); } catch { raw = null; }
  const out = freshSave();
  if (!raw || typeof raw !== "object" || raw.schemaVersion !== SAVE_V) return out;

  out.points = intField(raw.points, 0, 1e9);
  out.pointsSpent = intField(raw.pointsSpent, 0, 1e9);
  out.lifetimeWins = intField(raw.lifetimeWins, 0, 1e9);
  out.obbyStage = intField(raw.obbyStage, 0, STAGE_COUNT);
  out.paidStages = idListField(raw.paidStages, OBBY_STAGES);
  for (const m of MAPS) {
    const src = raw.mapWins && typeof raw.mapWins === "object" ? raw.mapWins[m.id] : 0;
    out.mapWins[m.id] = intField(src, 0, 1e9);
  }
  out.ownedHats = idListField(raw.ownedHats, HATS);
  out.ownedEmotes = idListField(raw.ownedEmotes, EMOTES);
  out.ownedSkins = idListField(raw.ownedSkins, SKINS);
  out.equipped.hat = equippedField(raw.equipped, "hat", HATS);
  out.equipped.emote = equippedField(raw.equipped, "emote", EMOTES);
  out.equipped.skin = equippedField(raw.equipped, "skin", SKINS);
  out.seenIntro = raw.seenIntro === true;
  return out;
}

// `force` writes now; anything else waits for the debounce. saves.save throws past the
// 65536-byte serialized cap and on a cycle, and this blob is nowhere near either, but a
// throw out of update is fatal so the call is wrapped anyway.
function writeSave(ctx, force) {
  if (!force && (!S.saveDirty || ctx.time - S.saveAt < TUNE.SAVE_DEBOUNCE_S)) return;
  S.saveDirty = false;
  S.saveAt = ctx.time;
  try { ctx.services.saves.save(S.save); } catch (err) {
    console.warn("[oof] showdown: save refused", err);
  }
}

function markSave() {
  S.saveDirty = true;
}

// Both unlocks are recomputed rather than read: startingAxe = pointsSpent >= 100,
// fly = lifetimeWins >= FLY_UNLOCK_WINS (§13.1, §13.2, §14).
function deriveUnlocks() {
  S.unlocks = unlocksFor(S.save);
  return S.unlocks;
}

// =====================================================================================
// Peers (§5.3). STALENESS IS THE PLACE'S JOB, not peer.at's.
// =====================================================================================
// peer.at is stamped from net.js's own private simTime accumulator, which
// ctx.services.net does not expose, and ctx.time is per-Place and reassigned by the shell,
// so `simTime - peer.at` is not computable here at all. Instead: remember ctx.time on every
// tick a peer's published `state` JSON CHANGES, and compare ctx.time against that. net.js
// evicts peers on its own only at STALE_S 15 s and only while a socket is open, so without
// this window the roster freezes with peers still published as al:1, hp:100 the moment YOUR
// socket drops: no round could resolve by last standing and every cap expiry would be won by
// a ghost on full HP.
function readPeers(ctx) {
  const now = ctx.time;
  const out = [];
  let roster = [];
  try { roster = ctx.services.net.roster() || []; } catch { roster = []; }

  const seen = new Set();
  for (const p of roster) {
    if (!p || typeof p.id !== "string" || !p.id) continue;
    seen.add(p.id);
    const state = p.state && typeof p.state === "object" ? p.state : null;
    let json = "null";
    try { json = JSON.stringify(state); } catch { json = "null"; }
    let rec = S.peerAt.get(p.id);
    if (!rec) { rec = { json, at: now }; S.peerAt.set(p.id, rec); }
    else if (rec.json !== json) { rec.json = json; rec.at = now; }
    // A stale peer, a peer on another schema version and a peer with no state at all count
    // as al:0 and jn:0 everywhere in this Place, with no vote (§5.3).
    const stale = !state || state.v !== TUNE.STATE_V || now - rec.at > TUNE.PEER_STALE_S;
    out.push({
      id: p.id,
      name: typeof p.name === "string" ? p.name : "",
      pos: Array.isArray(p.pos) && p.pos.length >= 3 ? p.pos : null,
      yaw: Number.isFinite(p.yaw) ? p.yaw : 0,
      state,
      lastChangeAt: rec.at,
      stale,
    });
  }
  // A peer that left must not bring its old change stamp back with it when it returns.
  if (S.peerAt.size > seen.size) {
    for (const id of Array.from(S.peerAt.keys())) if (!seen.has(id)) S.peerAt.delete(id);
  }
  return out;
}

// Living, non-stale fighters off the roster, and nothing else (§12.7). No Wardens, because
// they are props; no invented names, because ARCHITECTURE §9 forbids it.
function livingPeers(peers) {
  const out = [];
  for (const p of peers) {
    if (p.stale || !p.state || p.state.al !== 1) continue;
    if (!isVec3(p.pos)) continue;
    out.push(p);
  }
  return out;
}

// =====================================================================================
// The lobby furniture this file owns: the three plinth glow rings and the three boards.
// =====================================================================================

// A glow ring per voting plinth, because a plinth that lit up by itself would need setColor
// on an instanced authored part, which throws (§3.1). Ring i is index-aligned with MAPS[i].
function buildRings(ctx) {
  for (let i = 0; i < MAPS.length; i++) {
    const top = padTopOf(ctx, VOTE_PAD_ID[i]);
    const rec = safeGetPart(ctx, VOTE_PAD_ID[i]);
    const width = rec && rec.def && Array.isArray(rec.def.size) ? Number(rec.def.size[0]) : 10;
    if (!top || !Number.isFinite(width)) { S.ringIds.push(null); S.ringInk.push(null); continue; }
    const d = width + RING_MARGIN;
    const id = mkPart(ctx, "glow", {
      shape: "ring",
      size: [d, RING_THICK, d],
      position: [top[0], top[1] - PAD_FEET_CLEARANCE + RING_OVER_PAD, top[2]],
      color: RING_DARK,
      material: "neon",
      canCollide: false,
    });
    S.ringIds.push(id);
    S.ringInk.push(id === null ? null : RING_DARK);
  }
}

// The voted plinth wears its ground's headline colour and the other two go dark. setColor is
// only called when the reading actually changed, because it replaces the mesh material.
function paintRings(ctx) {
  for (let i = 0; i < S.ringIds.length; i++) {
    const id = S.ringIds[i];
    if (id == null) continue;
    const want = S.myVote === MAPS[i].id ? MAPS[i].sky : RING_DARK;
    if (S.ringInk[i] === want) continue;
    S.ringInk[i] = want;
    try { ctx.engine.parts.setColor(id, want); } catch { /* a removed ring paints nothing */ }
  }
}

// One canvas sprite per plinth, hung in that plinth's authored empty frame. It mirrors the
// DOM tally (§6), which is the live one; this is the in-world copy the spec asks for so a
// player standing at the plinths can read the room without looking at the HUD.
function buildBoards(ctx) {
  const THREE = ctx.engine.THREE;
  if (!THREE || typeof document === "undefined") return;
  for (let i = 0; i < MAPS.length; i++) {
    const lo = safeGetPart(ctx, VOTE_FRAME_LO_ID[i]);
    const hi = safeGetPart(ctx, VOTE_FRAME_HI_ID[i]);
    if (!lo || !hi || !lo.def || !hi.def) continue;
    const y = (Number(lo.def.position[1]) + Number(hi.def.position[1])) / 2;
    const x = Number(hi.def.position[0]);
    const z = Number(hi.def.position[2]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) continue;

    const canvas = document.createElement("canvas");
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
    const g = canvas.getContext("2d");
    if (!g) continue;
    let tex = null;
    let mat = null;
    let sprite = null;
    try {
      tex = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
      mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
      sprite = new THREE.Sprite(mat);
    } catch (err) {
      console.warn("[oof] showdown: vote board not built", err);
      if (mat) { try { mat.dispose(); } catch { /* fine */ } }
      if (tex) { try { tex.dispose(); } catch { /* fine */ } }
      continue;
    }
    sprite.scale.set(BOARD_SCALE_W, BOARD_SCALE_H, 1);
    // A hair in front of the frame's plane, so the sprite is not z-fighting the metalwork.
    sprite.position.set(x, y, z + 0.6);
    let id = null;
    try { id = ctx.engine.parts.addCustom(sprite); } catch { id = null; }
    if (id == null) {
      try { mat.dispose(); tex.dispose(); } catch { /* fine */ }
      continue;
    }
    S.owned.add(id);
    S.boards.push({ id, index: i, canvas, g, tex, mat, sprite, text: null });
  }
}

// Redrawn only when the STRING it would draw changed, at most once per HUD_REFRESH_S, which
// is the same discipline the DOM HUD keeps (§15).
function paintBoards(facts) {
  for (const b of S.boards) {
    const row = MAPS[b.index];
    const n = facts.votes && Number.isFinite(facts.votes[row.id]) ? facts.votes[row.id] : 0;
    const shut = Math.max(0, Math.ceil(facts.clock - (TUNE.INTERMISSION_S - TUNE.VOTE_WINDOW_S)));
    const line = facts.voteOpen
      ? (shut > 0 ? "CLOSES IN " + shut : "CLOSING")
      : (facts.mapId === row.id || facts.nextMapId === row.id ? "THIS ROUND" : "VOTE SHUT");
    const text = row.name + "|" + n + "|" + line + "|" + (S.myVote === row.id ? "1" : "0");
    if (b.text === text) continue;
    b.text = text;
    const g = b.g;
    g.clearRect(0, 0, BOARD_W, BOARD_H);
    g.fillStyle = "rgba(12,14,19,0.86)";
    g.fillRect(0, 0, BOARD_W, BOARD_H);
    g.strokeStyle = S.myVote === row.id ? "#f5c542" : row.sky;
    g.lineWidth = 5;
    g.strokeRect(3, 3, BOARD_W - 6, BOARD_H - 6);
    g.textAlign = "center";
    g.fillStyle = row.sky;
    g.font = "700 22px system-ui,sans-serif";
    g.fillText(row.icon + " " + row.name.toUpperCase(), BOARD_W / 2, 34);
    g.fillStyle = "#f2f4f6";
    g.font = "800 54px system-ui,sans-serif";
    g.fillText(String(n), BOARD_W / 2, 92);
    g.fillStyle = "#aab2ba";
    g.font = "600 18px system-ui,sans-serif";
    g.fillText(line, BOARD_W / 2, 124);
    b.tex.needsUpdate = true;
  }
}

function disposeBoards(ctx) {
  for (const b of S.boards) {
    rmPart(ctx, b.id);
    // The leak gate compares scene children, geometries and collider counts and cannot see
    // a canvas texture, so these two calls are the only thing standing between a board and a
    // leak nothing reports (§3.1).
    try { b.mat.dispose(); } catch { /* fine */ }
    try { b.tex.dispose(); } catch { /* fine */ }
  }
  S.boards.length = 0;
}

// =====================================================================================
// Effects. Everything here is a canCollide:false runtime part with no behaviour, which
// registers NO collider at all, and every id is in S.owned (rule 3).
// =====================================================================================

function pushVfx(ctx, ids, life) {
  const live = ids.filter((id) => id != null);
  if (!live.length) return;
  S.vfx.push({ ids: live, t: Number(life) || DUST_LIFE_S });
  // VFX_MAX is the ceiling the collider budget is derived from. The OLDEST batch goes, not
  // the newest, so the effect a player is looking at now is the one that survives.
  while (S.vfx.length > TUNE.VFX_MAX) {
    const old = S.vfx.shift();
    for (const id of old.ids) rmPart(ctx, id);
  }
}

function tickVfx(ctx, dt) {
  for (let i = S.vfx.length - 1; i >= 0; i--) {
    const v = S.vfx[i];
    v.t -= dt;
    if (v.t > 0) continue;
    for (const id of v.ids) rmPart(ctx, id);
    S.vfx.splice(i, 1);
  }
}

function sweepVfx(ctx) {
  for (const v of S.vfx) for (const id of v.ids) rmPart(ctx, id);
  S.vfx.length = 0;
}

function dust(ctx, at, count, size, tint) {
  const ids = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const r = 1.2 + nextRand() * 1.6;
    ids.push(mkPart(ctx, "vfx", {
      shape: "sphere",
      size: [size, size, size],
      position: [at[0] + Math.cos(a) * r, at[1] + 0.3 + nextRand() * 1.2, at[2] + Math.sin(a) * r],
      color: tint,
      material: "neon",
      canCollide: false,
    }));
  }
  pushVfx(ctx, ids, DUST_LIFE_S);
}

// =====================================================================================
// Emotes (§10.2). Place-local, drawn by this Place, and they go nowhere else.
// =====================================================================================
// They play in the lobby, in the obby and in `result`, and they are REFUSED while you are a
// living fighter in `fight`, because three seconds of Supernova hover is a free dodge in a
// fighting Place - and refused while spectate mode is armed, because §12.3's ghost owns the
// per-tick teleport and two things fighting over it would tear.

function emoteRefused(facts) {
  if (S.spectating || S.spectateArmAt >= 0) return "spectating";
  if (facts.phase === "fight" && S.fighter && !S.dead) return "fighting";
  if (S.emote) return "busy";
  if (S.emoteCool > 0) return "cooldown";
  return null;
}

function startEmote(ctx, facts) {
  const id = S.save.equipped.emote;
  const row = emoteById(id);
  if (!row || S.save.ownedEmotes.indexOf(row.id) < 0) {
    sfx(ctx, "denied");
    toast(ctx, { icon: "😄", title: "No emote equipped", body: "Buy one at the Emotes kiosk and tap it to equip." });
    return;
  }
  const why = emoteRefused(facts);
  if (why) {
    sfx(ctx, "denied");
    if (why === "fighting") S.hud.toastLocal("Emotes are for the lobby, not the fight.");
    return;
  }

  const feet = ctx.player.position();
  S.emoteCool = TUNE.EMOTE_COOLDOWN_S;
  S.emote = {
    id: row.id,
    t: 0,
    total: row.id === "supernova" ? TUNE.EMOTE_SUPERNOVA_S : TUNE.EMOTE_FLIP_S,
    base: feet.slice(),
    motes: [],
    bloomId: null,
    lightId: null,
    ringsAt: 0,
    ringIds: [],
    rang: false,   // the fanfare fires once, on the bloom rather than on the first mote
  };

  if (row.id === "supernova") {
    sfx(ctx, "sparkle");
    // ONE point light, moved with you: the renderer lights at most two on the low tier that
    // SwiftShader and every phone report, and spending both on one emote would black out the
    // lobby's own lamps (§3.3, §10.2).
    S.emote.lightId = mkPart(ctx, "emo", {
      shape: "sphere", size: [1.2, 1.2, 1.2],
      position: [feet[0], feet[1] + CHEST_Y, feet[2]],
      color: NOVA_TINT, material: "neon", canCollide: false,
      light: { intensity: 1.6, range: 34 },
    });
    S.emote.bloomId = mkPart(ctx, "emo", {
      shape: "sphere", size: [NOVA_BLOOM_SIZE, NOVA_BLOOM_SIZE, NOVA_BLOOM_SIZE],
      position: [feet[0], feet[1] + CHEST_Y + 3.4, feet[2]],
      color: "#ffffff", material: "neon", canCollide: false, transparency: 0.1,
    });
    for (let i = 0; i < TUNE.EMOTE_PARTICLES; i++) {
      const a = (i / TUNE.EMOTE_PARTICLES) * Math.PI * 2;
      const lift = 0.5 + nextRand() * 1.4;
      const id = mkPart(ctx, "emo", {
        shape: "sphere", size: [NOVA_MOTE_SIZE, NOVA_MOTE_SIZE, NOVA_MOTE_SIZE],
        position: [feet[0], feet[1] + CHEST_Y, feet[2]],
        color: NOVA_MOTE_TINT, material: "neon", canCollide: false,
      });
      if (id == null) continue;
      S.emote.motes.push({
        id,
        p: [feet[0], feet[1] + CHEST_Y, feet[2]],
        v: [Math.cos(a) * NOVA_MOTE_SPEED, lift * NOVA_MOTE_SPEED * 0.6, Math.sin(a) * NOVA_MOTE_SPEED],
      });
    }
  } else {
    sfx(ctx, "boing", { pitch: 1.1 });
    dust(ctx, feet, FLIP_DUST, FLIP_DUST_SIZE, FLIP_DUST_TINT);
  }
}

function tickEmote(ctx, dt) {
  if (S.emoteCool > 0) S.emoteCool = Math.max(0, S.emoteCool - dt);
  const e = S.emote;
  if (!e) return;
  e.t += dt;
  const k = clamp(e.t / e.total, 0, 1);

  if (e.id === "flip") {
    // The rig turns ONCE. A yaw in teleport is the only rotation a Place can hand an avatar:
    // there is no setRotation on ctx.player and the shell writes avatar.rotation.y itself
    // from the render transform every frame.
    ctx.player.teleport(e.base, (k * 360) % 360);
  } else {
    // You float EMOTE_FLOAT_H studs up on repeated teleport, which zeroes velocity every
    // tick, rather than on setGravity(0): gravity is GLOBAL and would leak out of the Place
    // if dispose were ever skipped (§13.2's same rule).
    const ease = Math.sin(Math.min(1, k * 1.15) * Math.PI);
    const y = e.base[1] + TUNE.EMOTE_FLOAT_H * ease;
    ctx.player.teleport([e.base[0], y, e.base[2]]);
    if (e.lightId != null) trySetPosition(ctx, e.lightId, [e.base[0], y + CHEST_Y, e.base[2]]);
    if (e.bloomId != null) {
      trySetPosition(ctx, e.bloomId, [e.base[0], y + CHEST_Y + 3.4 + NOVA_BLOOM_RISE * k, e.base[2]]);
      // Sizes cannot be animated, so the bloom fades instead of shrinking.
      try { ctx.engine.parts.setTransparency(e.bloomId, clamp(0.1 + k * 0.85, 0, 1)); } catch { /* fine */ }
    }
    for (const m of e.motes) {
      m.v[1] -= NOVA_MOTE_GRAVITY * dt;
      m.p[0] += m.v[0] * dt; m.p[1] += m.v[1] * dt; m.p[2] += m.v[2] * dt;
      trySetPosition(ctx, m.id, m.p);
    }
    // Rings of neon spreading under your feet, three of them on a stagger, because a ring
    // that could grow would need a setSize this engine does not have.
    while (e.ringsAt < NOVA_RING_R.length && e.t >= NOVA_RING_AT_S[e.ringsAt]) {
      const r = NOVA_RING_R[e.ringsAt];
      e.ringsAt += 1;
      const id = mkPart(ctx, "emo", {
        shape: "ring", size: [r, 0.3, r],
        position: [e.base[0], e.base[1] + 0.12, e.base[2]],
        color: NOVA_TINT, material: "neon", canCollide: false, transparency: 0.25,
      });
      if (id != null) e.ringIds.push(id);
    }
    // fanfare lands on the bloom rather than on the first mote, so the sound and the picture
    // peak together.
    if (!e.rang && e.t >= e.total * 0.55) { e.rang = true; sfx(ctx, "fanfare", { volume: 0.7 }); }
  }

  if (e.t < e.total) return;
  endEmote(ctx);
}

function endEmote(ctx) {
  const e = S.emote;
  if (!e) return;
  S.emote = null;
  rmPart(ctx, e.lightId);
  rmPart(ctx, e.bloomId);
  for (const m of e.motes) rmPart(ctx, m.id);
  for (const id of e.ringIds) rmPart(ctx, id);
}

function trySetPosition(ctx, id, at) {
  try { ctx.engine.parts.setPosition(id, at); } catch { /* a removed part moves nowhere */ }
}

// =====================================================================================
// Flight (§13.2). Place-local, and the 1000-lifetime-win unlock.
// =====================================================================================
// It is a hover on repeated ctx.player.teleport - which zeroes velocity every tick - and
// NOT setGravity(0): gravity is global and would leak out of the Place if dispose were ever
// skipped. It is refused while you are a living fighter in `fight`, for the same reason the
// Supernova hover is, and refused while obby.inObby() is true, which is not a nicety: during
// the 40 s intermission a 1000-win player could otherwise hover straight up the obby column
// at 26/14 studs a second and touch the `error` stage's pads directly, which would award
// obby-six, error-handled and the 12000-Oofbux Glitchsteel skin - the one thing the obby
// gates - without playing a stage. §11.1's entry-before-exit sequence check is the second
// lock on that same door.

function flyRefused(facts) {
  if (!S.unlocks.fly) return "locked";
  if (S.spectating || S.spectateArmAt >= 0) return "spectating";
  if (facts.phase === "fight" && S.fighter && !S.dead) return "fighting";
  if (S.obby.inObby()) return "obby";
  return null;
}

function toggleFly(ctx, facts) {
  if (S.flying) { S.flying = false; sfx(ctx, "click"); return; }
  const why = flyRefused(facts);
  if (why) {
    sfx(ctx, "denied");
    if (why === "obby") S.hud.toastLocal("No flying in the obby. Climb it.");
    else if (why === "fighting") S.hud.toastLocal("No flying in a fight.");
    return;
  }
  S.flying = true;
  sfx(ctx, "lift");
}

// The ceiling is the LIVE ground's, measured FLY_CEILING_Y above its bounds.min[1], and the
// hover is clamped to that ground's bounds in XZ as well. With no map live it is the lobby
// band with an absolute ceiling of LOBBY_Y + FLY_CEILING_Y.
function flyBox() {
  const b = world.bounds();
  if (b && isVec3(b.min) && isVec3(b.max)) {
    return {
      minX: b.min[0], maxX: b.max[0],
      minZ: b.min[2], maxZ: b.max[2],
      minY: b.min[1] + 1, maxY: b.min[1] + TUNE.FLY_CEILING_Y,
    };
  }
  return {
    minX: -LOBBY_HALF, maxX: LOBBY_HALF,
    minZ: -LOBBY_HALF, maxZ: LOBBY_HALF,
    minY: TUNE.LOBBY_Y + 1, maxY: TUNE.LOBBY_Y + TUNE.FLY_CEILING_Y,
  };
}

function tickFly(ctx, dt, facts) {
  if (!S.flying) return;
  if (flyRefused(facts)) { S.flying = false; return; }

  const feet = ctx.player.position();
  let mv = { x: 0, z: 0 };
  try { mv = ctx.engine.input.getMoveVector() || mv; } catch { /* fine */ }
  const push = Math.min(1, Math.sqrt(mv.x * mv.x + mv.z * mv.z));

  // getMoveVector is CONTROL space, not facing, and nothing on ctx reports the camera's yaw.
  // The one value that DOES report where you are looking is ctx.player.avatar.rotation.y,
  // in radians, which the shell writes from the render transform - and because the engine
  // already turns the rig to face the direction it is walking, that yaw IS the joystick's
  // world direction. So the hover flies where the rig is pointing, at the stick's magnitude.
  const a = ctx.player.avatar;
  const yaw = a && a.rotation ? a.rotation.y : 0;
  const box = flyBox();
  // Rising is the jump control, which is the only vertical input a Place is handed; letting
  // go HOLDS altitude rather than sinking, and the way down is switching flight off. A gentle
  // sink would have to guess where the floor is, and there is no ground query on ctx.
  let rise = 0;
  try { rise = ctx.engine.input.isJumpHeld() ? TUNE.FLY_RISE : 0; } catch { rise = 0; }

  const next = [
    clamp(feet[0] + Math.sin(yaw) * push * TUNE.FLY_SPEED * dt, box.minX, box.maxX),
    clamp(feet[1] + rise * dt, box.minY, box.maxY),
    clamp(feet[2] + Math.cos(yaw) * push * TUNE.FLY_SPEED * dt, box.minZ, box.maxZ),
  ];
  ctx.player.teleport(next);
}

// =====================================================================================
// Spectating (§12). Death cannot be vetoed, so death is handled by moving the checkpoint.
// =====================================================================================
// kill() hides the rig and 1.0 s later the engine relocates you to your checkpoint
// UNCONDITIONALLY and emits player:respawned with a 0.5 s grace. So the checkpoint was
// pointed at the live ground's own perch before the round began (§4.1 step 3), and what is
// left for this file is the ghost: walk speed 0, jump power 0, the camera swung out, and your
// own avatar teleported SPECTATE_HEIGHT studs above the fighter you are watching. The camera
// cannot be detached - it is hard-wired to the local rig and no ctx API moves it anywhere
// else - so spectating IS moving your own avatar, and other players see you up there.

function armSpectate(ctx) {
  if (S.spectating) return;
  S.spectating = true;
  S.spectateArmAt = -1;
  try { ctx.player.setWalkSpeed(0); ctx.player.setJumpPower(0); } catch { /* fine */ }
  try {
    ctx.engine.camera.setDistance(TUNE.SPECTATE_DIST);
    ctx.engine.camera.setPitch(TUNE.SPECTATE_PITCH);
    ctx.engine.camera.setOffset([0, TUNE.SPECTATE_OFFSET_Y, 0]);
  } catch { /* fine */ }
  // avatar.visible = false hides you in YOUR OWN view only: physics forces it back to true
  // on every respawn, and other players still see your rig from your `move` frames. That is
  // honest - you ARE a real player standing in the sky - and §12.6 says so rather than
  // pretending otherwise.
  try { ctx.player.avatar.visible = false; } catch { /* fine */ }
  if (S.haloId == null) {
    S.haloId = mkPart(ctx, "halo", {
      shape: "ring", size: [HALO_SIZE[0], HALO_SIZE[1], HALO_SIZE[2]],
      position: ctx.player.position(),
      color: HALO_COLOUR, material: "neon", canCollide: false, transparency: 0.35,
    });
  }
  sfx(ctx, "warp", { volume: 0.6 });
}

// UNCONDITIONAL, on the fight -> result transition and in dispose. Nothing may survive into
// the next round: a walk speed of 0, an offset camera, an invisible rig and a perch
// checkpoint carried into `fight` would produce a fighter who cannot walk, vote, shop or be
// reached, and would force every subsequent round to the 240 s cap (§12.5).
function disarmSpectate(ctx) {
  S.spectateArmAt = -1;
  S.spectateTarget = null;
  rmPart(ctx, S.haloId);
  S.haloId = null;
  if (!S.spectating) return;
  S.spectating = false;
  try { ctx.player.setWalkSpeed(TUNE.WALK_SPEED_DEFAULT); ctx.player.setJumpPower(TUNE.JUMP_POWER_DEFAULT); } catch { /* fine */ }
  try { ctx.engine.camera.reset(); } catch { /* fine */ }
  try { ctx.player.avatar.visible = true; } catch { /* fine */ }
}

function tickSpectate(ctx, dt, facts, peers) {
  if (S.spectateArmAt >= 0 && ctx.time >= S.spectateArmAt) armSpectate(ctx);
  if (!S.spectating) return;

  const list = livingPeers(peers);
  // When the tracked id leaves the roster or goes stale, re-target to the next in the list;
  // when the list empties, park on the map's perch (§12.7). Solo the list is empty from the
  // start and the round plays out below you.
  if (!list.some((p) => p.id === S.spectateTarget)) S.spectateTarget = list.length ? list[0].id : null;
  const target = list.find((p) => p.id === S.spectateTarget) || null;
  const at = target
    ? [target.pos[0], target.pos[1] + TUNE.SPECTATE_HEIGHT, target.pos[2]]
    : world.perch();
  ctx.player.teleport(at);
  if (S.haloId != null) trySetPosition(ctx, S.haloId, [at[0], at[1] - HALO_DROP, at[2]]);
}

function cycleSpectate(ctx, peers, step) {
  if (!S.spectating) return;
  const list = livingPeers(peers);
  if (!list.length) { sfx(ctx, "denied"); return; }
  const i = list.findIndex((p) => p.id === S.spectateTarget);
  const n = list.length;
  S.spectateTarget = list[(((i < 0 ? 0 : i) + step) % n + n) % n].id;
  sfx(ctx, "click");
}

// =====================================================================================
// Weapon pads (§7.2). Every roll is LOCAL, and a pad another player took is still there
// for you: nothing in the wire model lets one client consume another's pickup, and
// pretending otherwise would need an authority the relay does not have (§16.9).
// =====================================================================================
// The pads are `touchEvent` sensors and NEVER `collectible`: a collectible of kind "oofbux"
// is bridged to a real payout by economy.bindEvents, so a ground full of them would quietly
// print money. Their own sensors carry a 0.5 s touch cooldown, which is a debounce so
// standing on one does not fire sixty times a second; the real 25 s WEAPON_RESPAWN_S re-arm
// lives here, because a behaviour param is read once into its runtime and no Place can
// rewrite it afterwards.

function wirePads(ctx) {
  unwirePads();
  for (const pad of world.weaponPads()) {
    if (!pad || typeof pad.event !== "string" || !pad.event) continue;
    if (pad.kind !== "weapon") continue;
    const event = pad.event;
    S.padArm.set(event, 0);
    S.padSubs.push(ctx.events.on("touch:" + event, () => onWeaponPad(ctx, event)));
  }
}

function unwirePads() {
  for (const u of S.padSubs) { try { u(); } catch { /* fine */ } }
  S.padSubs.length = 0;
  S.padArm.clear();
  S.heldFrom = null;
}

function armedPads() {
  let n = 0;
  for (const rem of S.padArm.values()) if (!(rem > 0)) n += 1;
  return n;
}

function tickPads(dt) {
  for (const [event, rem] of S.padArm) {
    if (rem > 0) S.padArm.set(event, Math.max(0, rem - dt));
  }
}

function onWeaponPad(ctx, event) {
  const facts = S.round.facts();
  if (facts.phase !== "fight" || !S.fighter || S.dead || S.spectating) return;
  if (S.padArm.get(event) > 0) return;
  const mapId = world.currentMapId();
  if (!mapId) return;

  // The rarity is rolled at TOUCH time from RARITY_WEIGHTS, biased by §7.3's luck gate, and
  // THEN a row of that tier is picked uniformly among the ground's own. A pad carries no
  // tier of its own: the weights, the 100-point luck unlock and §7.1's "every tier
  // represented on every ground" are what decide, and rollTier reads `rand` exactly three
  // times in a fixed order whether or not the player is lucky.
  const tier = rollTier(nextRand, S.unlocks.startingAxe);
  let rows = weaponsForMapTier(mapId, tier);
  if (!rows.length) {
    // Rule 25:S2 asserts every tier has a findable row on every ground, so this is a config
    // regression rather than a live case. Handing back the commonest row beats handing back
    // nothing, which would make the pad look broken.
    for (const t of TIERS) { rows = weaponsForMapTier(mapId, t); if (rows.length) break; }
  }
  if (!rows.length) return;
  const row = rows[Math.min(rows.length - 1, Math.floor(nextRand() * rows.length))];

  // You carry ONE (§7.2): picking up a second drops the first back onto its pad, which is
  // the pad it came off. That pad re-arms at once, so the weapon you put down is there to be
  // picked back up rather than lost for 25 seconds.
  const dropped = S.combat.dropWeapon();
  if (dropped && S.heldFrom && S.heldFrom !== event) S.padArm.set(S.heldFrom, 0);
  S.combat.giveWeapon(row.id);
  S.heldFrom = event;
  S.padArm.set(event, TUNE.WEAPON_RESPAWN_S);
  sfx(ctx, "chime", { pitch: 1.05 });
  S.hud.toastLocal(row.icon + " " + row.name);
  S.round.publishState(ctx, { wp: row.id });
}

// =====================================================================================
// The obby (§11). obby.js owns the column; this file owns the arch, the Oofbux and the
// badges, because it owns the save and the ledger.
// =====================================================================================

function onObbyPad(ctx, event) {
  const ev = S.obby.onPadTouched(ctx, event);
  if (!ev) return;
  if (ev.kind === "cleared") {
    // obby.js wrote save.obbyStage and save.paidStages and returned what this clear earned;
    // it never awards and never saves, so both are here, and the save is FORCED because a
    // tab close never calls dispose.
    const stage = OBBY_STAGES[ev.stageIndex];
    if (ev.oofbux > 0 && stage) award(ctx, ev.oofbux, "showdown:obby-" + stage.id);
    markSave();
    writeSave(ctx, true);
    if (stage) S.hud.toastLocal("Cleared " + stage.name + (ev.oofbux > 0 ? " · " + ev.oofbux + " Oofbux" : ""));
    if (S.obby.cleared() >= STAGE_COUNT) {
      badge(ctx, "obby-six");
      badge(ctx, "error-handled");
    }
  }
  S.round.publishState(ctx, { ob: S.obby.cleared() });
}

// The arch's own event. obby.js answers `obby-enter` with null on purpose: the stage picker
// is this file's, because it is a panel and panels are a game-wide resource (one at a time).
function openObbyPicker(ctx) {
  const cleared = S.obby.cleared();
  if (S.obby.inObby()) return;   // already up there; the arch is only the way in
  if (cleared <= 0) { S.obby.enter(ctx, 0); music(ctx, OBBY_MUSIC); return; }

  closePanel(ctx);
  let handle = null;
  try {
    handle = ctx.services.ui.openPanel({
      title: "🪜 Lobby Obby",
      onClose: () => { if (S && S.panelHandle === handle) { S.panelHandle = null; S.panel = null; } },
    });
  } catch { handle = null; }
  const body = handle && (handle.bodyEl || handle.el);
  if (!body) {
    if (handle && typeof handle.close === "function") { try { handle.close(); } catch { /* fine */ } }
    S.obby.enter(ctx, cleared);
    music(ctx, OBBY_MUSIC);
    return;
  }
  S.panelHandle = handle;
  S.panel = "obby";

  const intro = document.createElement("p");
  intro.setAttribute("style", "margin:0 0 12px;color:var(--oof-text-dim, #9aa3b8);font-size:14px;");
  intro.textContent = "Pick a stage. Everything you have cleared stays open, and the next one is always there.";
  body.appendChild(intro);

  // Rows 0..cleared, which at cleared 0 is stage one. obby.enter clamps anything above
  // cleared() down to cleared() as a third lock on §11.1's sequence check.
  for (let i = 0; i <= cleared && i < STAGE_COUNT; i++) {
    const st = OBBY_STAGES[i];
    const done = i < cleared;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("style",
      "display:flex;align-items:center;gap:10px;width:100%;min-height:" + TUNE.TOUCH_MIN_PX + "px;"
      + "margin:0 0 8px;padding:10px 12px;border-radius:12px;cursor:pointer;text-align:left;"
      + "background:var(--oof-surface2, #1d2130);border:2px solid " + st.colour + ";"
      + "color:var(--oof-text, #f2f4fa);font:700 15px inherit;");
    const label = document.createElement("span");
    label.textContent = (done ? "✅ " : "▶ ") + (i + 1) + ". " + st.name;
    const note = document.createElement("span");
    note.setAttribute("style", "margin-left:auto;color:var(--oof-text-dim, #9aa3b8);font-weight:600;font-size:12px;");
    note.textContent = done ? "cleared" : "next";
    btn.append(label, note);
    btn.addEventListener("click", () => {
      closePanel(ctx);
      S.obby.enter(ctx, i);
      music(ctx, OBBY_MUSIC);
      sfx(ctx, "teleport");
    });
    body.appendChild(btn);
  }
}

// =====================================================================================
// Panels (§10). ONE AT A TIME, AND CLOSING IT IS OUR JOB.
// =====================================================================================
// A second openPanel silently closes the first, and a panel left open at dispose is never
// closed by the platform: the shell's teardown clears HUD chips and hides the rig and leaves
// panels alone, so a kiosk open when the player walks back to the Hub sits over the Hub for
// ever. HUD chips through setHudStat ARE auto-cleared; panels are not.

function closePanel(ctx) {
  const handle = S.panelHandle;
  S.panelHandle = null;
  S.panel = null;
  if (handle && typeof handle.close === "function") { try { handle.close(); } catch { /* fine */ } }
  shops.close(ctx);
}

function openShop(ctx, which) {
  closePanel(ctx);
  S.panel = which;
  shops.open(ctx, which, S.save, shopHandlers(ctx));
}

// shops.js never spends and never writes the save. It hands over a kind, an id and the
// price off the config row, and reads back one of three verdicts.
function shopHandlers(ctx) {
  return {
    onBuy: (kind, id, price) => onBuy(ctx, kind, id, price),
    onEquip: (kind, id) => onEquip(ctx, kind, id),
    onSpendPoints: () => onSpendPoints(ctx),
    onClaimWings: () => grant(ctx, WINGS_CATALOG_ID),
  };
}

function ownedListFor(kind) {
  if (kind === "hat") return S.save.ownedHats;
  if (kind === "emote") return S.save.ownedEmotes;
  if (kind === "skin") return S.save.ownedSkins;
  return null;
}

function rowFor(kind, id) {
  if (kind === "hat") return hatById(id);
  if (kind === "emote") return emoteById(id);
  if (kind === "skin") return skinById(id);
  return null;
}

// AN OWNED ROW IS NEVER A BUY TARGET (§10). Without the guard a second tap on the Golden Hat
// calls spend(1000, ...) again and succeeds, and a player who already owns hat_golden from
// anywhere else on the platform - or whose local ownedHats was reset by §14's field-level
// fallback - is charged 1000 Oofbux for a hat already on their head. An item is marked owned
// ONLY when spend returned true; spend returns false with no mutation when you are short and
// is never rate-capped.
function onBuy(ctx, kind, id, price) {
  const row = rowFor(kind, id);
  const owned = ownedListFor(kind);
  if (!row || !owned) return "denied";
  if (owned.indexOf(row.id) >= 0) return "owned";
  if (kind === "hat" && ownsCatalog(ctx, row.catalogId)) {
    // Owned platform-wide but not in our list: record it and charge nothing.
    owned.push(row.id);
    markSave();
    writeSave(ctx, true);
    return "owned";
  }
  if (kind === "skin" && !skinAvailable(row, S.obby.cleared())) return "denied";

  let ok = false;
  try { ok = ctx.services.economy.spend(price, row.reason) === true; } catch { ok = false; }
  if (!ok) return "denied";

  owned.push(row.id);
  S.save.equipped[kind] = row.id;
  if (kind === "skin") S.combat.setSkin(row.id);
  markSave();
  writeSave(ctx, true);
  if (kind === "hat") grant(ctx, row.catalogId);
  if (kind === "skin") S.round.publishState(ctx, { sk: row.id });
  return "bought";
}

function onEquip(ctx, kind, id) {
  const row = rowFor(kind, id);
  const owned = ownedListFor(kind);
  if (!row || !owned || owned.indexOf(row.id) < 0) return;
  S.save.equipped[kind] = row.id;
  if (kind === "skin") {
    S.combat.setSkin(row.id);
    S.round.publishState(ctx, { sk: row.id });
  }
  // A Catalog hat that is owned here but not platform-wide gets one more attempt at the
  // grant every time it is equipped, which is the same retry the Vault's wings button is.
  if (kind === "hat" && !ownsCatalog(ctx, row.catalogId)) grant(ctx, row.catalogId);
  markSave();
  writeSave(ctx, true);
}

// §13.1: the oath SPENDS all hundred Fighting Points, and both halves are written in ONE
// forced save(). Two statements against the 2 s debounce could persist apart, and a tab
// close never calls dispose. `startingAxe` is DERIVED from pointsSpent, never stored, so a
// field-level fallback cannot destroy the purchase and the button's own guard is what stops
// a 200-point player paying twice for an unlock they already hold.
function onSpendPoints(ctx) {
  if (S.save.points < TUNE.LUCK_UNLOCK_POINTS || S.unlocks.startingAxe) return false;
  S.save.points -= TUNE.LUCK_UNLOCK_POINTS;
  S.save.pointsSpent += TUNE.LUCK_UNLOCK_POINTS;
  markSave();
  writeSave(ctx, true);
  deriveUnlocks();
  badge(ctx, "axe-oath");
  sfx(ctx, "purchase");
  return true;
}

// =====================================================================================
// Winning (§8.1), behind §4.2's `scored` latch, which round.js sets BEFORE it calls us.
// =====================================================================================
// A win is scored only by the WINNER, about ITSELF. The predicate is per-tick and would
// otherwise stay true for the rest of `fight` and all 8 s of `result`: roughly 480 Fighting
// Points and 480 lifetime wins for one round, which is enough to hand out both unlocks.
function onWin(ctx, mapId, clockLeft, byLastStanding) {
  const row = mapById(mapId);
  S.save.points += TUNE.WIN_POINTS;
  S.save.lifetimeWins += 1;
  if (row) S.save.mapWins[row.id] = (S.save.mapWins[row.id] || 0) + 1;
  markSave();
  writeSave(ctx, true);
  const before = S.unlocks.fly;
  deriveUnlocks();

  award(ctx, TUNE.WIN_OOFBUX, "showdown:win");

  badge(ctx, "first-win");
  if (S.save.lifetimeWins >= 10) badge(ctx, "wins-10");
  if (S.save.lifetimeWins >= 100) badge(ctx, "wins-100");
  if (S.save.lifetimeWins >= TUNE.FLY_UNLOCK_WINS) badge(ctx, "wins-1000");
  if (row) badge(ctx, "win-" + row.id);
  if (MAPS.every((m) => (S.save.mapWins[m.id] || 0) > 0)) badge(ctx, "map-sweep");
  if (S.wardens.brokenCount() >= TUNE.WARDEN_COUNT) badge(ctx, "warden-breaker");
  if (S.combat.untouched()) badge(ctx, "untouched");
  // photo-finish needs a LAST-STANDING win with the clock under five seconds. A cap expiry
  // always finishes with the clock at zero, so a cap win would otherwise score it every
  // single time, which would make a secret badge the most routine thing in the Place.
  if (byLastStanding && clockLeft < 5) badge(ctx, "photo-finish");

  // The wings are a Catalog `aura` item: EQUIP_SLOTS is closed and the rig builds no back
  // anchor, so a `wings` type would never render and a `gear` one would mount them on your
  // right hand (§13.2).
  if (!before && S.unlocks.fly) grant(ctx, WINGS_CATALOG_ID);

  sfx(ctx, "win");
  later(0.8, () => { if (S) sfx(ctx, "fanfare"); });
  S.hud.toastLocal("You took the round. +1 Fighting Point, +" + TUNE.WIN_OOFBUX + " Oofbux");
}

// =====================================================================================
// The §4.1 transitions. NOTHING ELSE in this Place moves a player between the lobby and
// a ground, and the order inside each one is the order the spec fixes.
// =====================================================================================

function enterFight(ctx, facts) {
  // §11.3's "if the flip arrives with the prompt unresolved", FIRST, before anything else in
  // this tick: tickPrompt cannot do it, because it returns the moment the phase stops being
  // `intermission`. The old code cleared promptDone and left promptOpen true, which left a
  // centred pointer-events:auto card over the whole fight - and its STAY IN OBBY button
  // calls leaveRound() mid-round, which publishes al:0, empties the alive set and ends a live
  // round with no winner and nothing awarded.
  resolveOpenPrompt(ctx);
  const amFighter = facts.fighters.indexOf(S.round.selfId) >= 0;
  S.fighter = amFighter;
  S.dead = false;
  S.winner = null;
  S.flying = false;
  if (S.emote) endEmote(ctx);

  // §6's last paragraph: a client whose resolved ground differs from the non-stale
  // conductor's `mp` releases and re-materializes the conductor's. Without it the divergence
  // is invisible and fatal - the three grounds sit in different origin bands, so two clients
  // on two grounds can never connect a hit and each fights alone believing the round is
  // shared. world.materialize releases a different live ground itself.
  if (facts.mapId && world.currentMapId() !== facts.mapId) {
    try {
      S.mapQueued = world.materialize(ctx, facts.mapId);
      wirePads(ctx);
    } catch (err) {
      console.error("[oof] showdown: ground refused", facts.mapId, err);
    }
  }

  const row = mapById(facts.mapId);
  music(ctx, row ? row.music : LOBBY_MUSIC);

  if (!amFighter) {
    // Adopted out, or STAY IN OBBY: no HP, no spawn, no teleport. You may still climb, shop
    // and watch from the lobby perch, and the next intermission asks again (§11.3). The
    // ground above is still built for this client ON PURPOSE, even though it will not fight
    // on it: §6 says every follower materializes the conductor's `mp`, and a client that
    // skipped the build would publish `mp: null` while the room published a ground - which a
    // late joiner's boot adoption reads to learn which ground the room is standing on, and
    // which every other client's fight-entry reconciliation compares against. The ground is
    // released on the result -> intermission edge like everybody else's.
    return;
  }

  // A kiosk, or the obby stage picker, left open in the lobby is a platform panel: it sits at
  // --oof-z-panel (200) behind a position:fixed;inset:0 scrim, and this Place's whole HUD is
  // one root at TUNE.UI_Z (50). So a round that starts with one open covers the fight - the
  // swing button is right there and 72x72 and every tap on it lands on the panel body or the
  // scrim instead, and on a phone the panel is the entire screen, joystick zone included.
  // The HUD already hides the kiosk buttons for a living fighter; this is the missing half of
  // that. A NON-fighter keeps theirs on purpose: the early return above is a player who chose
  // STAY IN OBBY or was adopted out, and §12 lets them spend the round climbing and shopping.
  closePanel(ctx);
  // Step 3, in this order. obby.leave FIRST, or the lobby checkpoint it sets would clobber
  // the perch a line later; it teleports only a player actually up in the column, so calling
  // it unconditionally can never move an avatar standing in the lobby.
  S.obby.leave(ctx);
  // The checkpoint is set BEFORE the teleport, so a death in the opening tick cannot land in
  // the obby or the lobby - and it is the LIVE MAP's own perch, not TUNE.PERCH: the lobby
  // sits at x -70..70 while the grounds are 900 to 3300 studs away on +X, the camera's far
  // plane is 1200, and fog far is clamped to 300 on the low tier that SwiftShader and phones
  // report, so a lobby perch would show an empty lobby and for two of the three grounds the
  // map would be past the far plane entirely (§12.1).
  ctx.player.setCheckpoint(world.perch());
  const spawns = world.spawns();
  if (spawns.length) {
    const at = spawns[S.round.spawnIndex() % spawns.length];
    if (isVec3(at)) ctx.player.teleport([at[0], at[1], at[2]]);
  }
  S.combat.resetForRound(ctx, S.unlocks.startingAxe);
  S.combat.setSkin(S.save.equipped.skin);
  try {
    ctx.player.setWalkSpeed(TUNE.FIGHT_WALK_SPEED);
    ctx.player.setJumpPower(TUNE.FIGHT_JUMP_POWER);
  } catch { /* fine */ }
  // The drums go up after the ground is materialized, so wardenSpots() has the builder's
  // three (§9). They are there in a twenty-player round too: the mode is not different, the
  // company is.
  S.wardens.spawnAll(ctx, world.wardenSpots());
  S.round.publishState(ctx, {
    hp: S.combat.hp(), mp: world.currentMapId(),
    wp: heldWireId(), sk: S.save.equipped.skin, ob: S.obby.cleared(), lw: S.save.lifetimeWins,
  });
}

// fight -> result. The map is still standing; the controls come back and the ghost comes
// down. §17.3.5 asserts walk 16, jump 50 and a reset camera on exactly this edge.
function endFight(ctx) {
  disarmSpectate(ctx);
  S.fighter = false;
  S.dead = false;
  S.flying = false;
  try {
    ctx.player.setWalkSpeed(TUNE.WALK_SPEED_DEFAULT);
    ctx.player.setJumpPower(TUNE.JUMP_POWER_DEFAULT);
  } catch { /* fine */ }
  try { ctx.engine.camera.reset(); } catch { /* fine */ }
  // brokenCount is read by onWin, which round.js already fired, and clear() empties the
  // roster by design - so the badge was read before this line, and the win it scored is held
  // by §4.2's `scored` latch rather than by anything in wardens.js.
  S.wardens.clear(ctx);
  S.combat.dropWeapon();
  S.heldFrom = null;
}

// result -> intermission, in this order: teleport every player to the lobby pad, hand the
// checkpoint back per §11.2, THEN world.release(). Releasing first would drop the winner
// through a ground that no longer exists and kill them at killY - a death that can race the
// phase flip and be counted as a round death.
function toIntermission(ctx) {
  disarmSpectate(ctx);
  S.fighter = false;
  S.dead = false;
  S.winner = null;
  S.myVote = null;
  S.promptLatched = false;
  S.promptDone = false;
  S.promptOpen = false;
  S.hud.dismissPrompt();
  if (S.emote) endEmote(ctx);
  // A player up in the obby stays up in the obby: that is what STAY IN OBBY promised, and
  // obby.leave() would drop them out of a run they chose (§11.3).
  if (!S.obby.inObby()) {
    ctx.player.teleport(S.lobbyPad);
    ctx.player.setCheckpoint(S.lobbyPad);
  }
  unwirePads();
  world.release(ctx);
  S.wardens.clear(ctx);
  music(ctx, S.obby.inObby() ? OBBY_MUSIC : LOBBY_MUSIC);
  paintRings(ctx);
}

// The fight nobody signed up for (§4.1 step 2): every client in the room chose STAY IN OBBY,
// so onPhase fires with `intermission` on BOTH sides and the ground that was already
// building is released. An 1800-part ground is not built for nobody.
function skippedFight(ctx) {
  // The same edge as enterFight's, for the same reason: this one is reachable with the prompt
  // still open by a client that was adopted into a phase (`sitOut`), whose jn is 0 while the
  // card is still up. Nothing may carry an open prompt out of an intermission.
  resolveOpenPrompt(ctx);
  unwirePads();
  world.release(ctx);
  S.wardens.clear(ctx);
  S.myVote = null;
  S.promptLatched = false;
  music(ctx, S.obby.inObby() ? OBBY_MUSIC : LOBBY_MUSIC);
}

function drainEdges(ctx) {
  while (S.edges.length) {
    const e = S.edges.shift();
    const facts = S.round.facts();
    if (e.next === "fight") enterFight(ctx, facts);
    else if (e.next === "result") endFight(ctx);
    else if (e.next === "intermission") {
      // `boot` -> `intermission` is the ordinary opening of the Place, and it must do
      // NOTHING to the world: there is no ground to release, no round to hand a checkpoint
      // back from, and above all no teleport. §3 is explicit that init never moves the
      // avatar, and the smoke run's checkSpawn allows 0.5 studs from place.json's `spawn` -
      // so snapping the player onto the lobby pad on the first tick would be a teleport the
      // spec forbids, and one that would undo any drift on a slow first frame.
      if (e.prev === "boot") continue;
      if (e.prev === "intermission") skippedFight(ctx);
      else toIntermission(ctx);
    }
  }
}

// =====================================================================================
// The published wire fields this file owns (§5.5). round.js is the ONLY module that calls
// net.publish, and `ki` is deliberately not among the keys a caller may hand it:
// declareDeath is the only path a death takes to the wire, so no sibling can name a
// Warden, an index or a void as a killer even by accident.
// =====================================================================================

// `wp` is a weapon somebody FOUND. The fist is not one: its row carries fist:true and its id
// is the string "fist", which is deliberately not a WEAPONS row, so it is published as null.
function heldWireId() {
  const w = S.combat.heldWeapon();
  return w && !w.fist ? w.id : null;
}

function publish(ctx) {
  const extra = {
    hp: S.combat.hp(),
    mp: world.currentMapId(),
    wp: heldWireId(),
    sk: S.save.equipped.skin,
    ob: S.obby.cleared(),
    lw: S.save.lifetimeWins,
  };
  if (S.pendingHit) { extra.hit = S.pendingHit; S.pendingHit = null; }
  S.round.publishState(ctx, extra);
}

// The victim applies the damage to ITSELF from a published hit, and if that takes it to zero
// it declares its own death (§8). combat.applyIncoming returns true when the damage LANDED -
// it is not a "killed" flag - and false for a duplicate, an i-frame, a hit not addressed to
// us and any hit at all outside `fight`.
function readIncoming(ctx, peers) {
  const selfId = S.round.selfId;
  for (const p of peers) {
    if (p.stale || !p.state) continue;
    const hit = p.state.hit;
    if (!hit || typeof hit !== "object" || hit.to !== selfId) continue;
    if (!S.combat.applyIncoming(hit, p.id)) continue;
    if (S.combat.hp() <= 0) declareOwnDeath(ctx, p.id);
  }
}

// The DYING client declares its own death, about itself. `by` is a peer id only for a
// published player hit; it is null for a Warden lunge, a void death and every other cause,
// because A WARDEN IS NEVER NAMED ON THE WIRE - a prop reported as a killer is exactly what
// ARCHITECTURE §9 forbids, and a peer reading ki.by === SELF_ID must never be credited a
// kill nobody made (§5.5).
function declareOwnDeath(ctx, byPeerId) {
  if (S.dead) return;
  const facts = S.round.facts();
  if (facts.phase !== "fight" || !S.fighter) return;
  S.dead = true;
  S.round.declareDeath(byPeerId || null);
  // Spectate mode arms only for a death taken as a living fighter while ph === "fight". It
  // is NOT armed by dying in the obby - which is the normal outcome of an obby - because
  // that would freeze the player at walk speed 0, swing the camera out and teleport them
  // over a fighter, losing the run they chose to stay for (§12.2).
  S.spectateArmAt = ctx.time + TUNE.DEATH_TO_SPECTATE_S;
  S.flying = false;
  publish(ctx);
}

// =====================================================================================
// Swinging. The ⚔️ button and `action1` are one code path.
// =====================================================================================

function onSwing(ctx) {
  const r = S.combat.swing();
  if (!r) return;
  if (r.kind === "player") {
    // A hit on a player is PUBLISHED, never applied: the named victim reads it off the
    // roster, subtracts it from its own HP, honours its own i-frame window, and declares its
    // own death if that takes it to zero.
    S.pendingHit = { s: r.seq, to: r.targetId, d: r.damage, w: heldWireId() };
    S.round.noteDamageDealt(r.damage);
    publish(ctx);
    return;
  }
  if (r.kind !== "warden") return;
  // A hit on a Warden is applied locally and published to nobody, because a Warden is a
  // prop. wardens.damage's return is the AUTHORITY on the break; combat's own `killed` is
  // advisory, read off last tick's WardenView, and combat deliberately leaves `pop` to
  // whoever applies the break so it is not played twice.
  if (!S.wardens.damage(Number(r.targetId), r.damage)) return;
  sfx(ctx, "pop");
  const facts = S.round.facts();
  if (S.wardens.brokenCount() >= TUNE.WARDEN_COUNT) {
    S.hud.toastLocal("All three Rogue Wardens broken.");
    // §9.6: with fightersAtStart 1 and no opponent ever seen, breaking all three ends the
    // round as a win the instant the third one goes. round.declareObjectiveWin re-checks
    // every one of those guards itself and holds the `scored` latch, so this is a request
    // rather than a decision.
    if (S.wardens.allBroken() && facts.fightersAtStart === 1 && !facts.sawOpponent) {
      S.round.declareObjectiveWin();
    }
  }
}

// =====================================================================================
// init (§4 phase 0). One tick: the save is loaded, the lobby is lit and there is no map.
// init NEVER teleports the avatar - the smoke spawn check allows 0.5 studs (§17.3).
// =====================================================================================

export function init(ctx) {
  S = fresh();

  S.save = loadSave(ctx);
  deriveUnlocks();
  S.saveAt = ctx.time;
  S.lobbyPad = padTopOf(ctx, SPAWN_PAD_ID) || LOBBY_PAD_FALLBACK.slice();

  // The siblings, in dependency order: round.js reads the save, obby.js holds it by
  // reference and writes two fields into it, and hud.js wants handlers that can reach the
  // rest of them.
  S.round = createRound(ctx, S.save);
  // combat is handed the round machine, not a second reading of net: round.js owns the one
  // identity substitution this Place makes and publishes it as a live getter, so the address
  // combat refuses a hit against is the address game.js matched it with (§5.1, §5.5).
  S.combat = createCombat(ctx, S.round);
  S.wardens = createWardens(ctx);
  S.obby = createObby(ctx, S.save);
  S.hud = createHud(ctx, {
    onSwing: () => onSwing(ctx),
    onEmote: () => startEmote(ctx, S.round.facts()),
    onFly: () => toggleFly(ctx, S.round.facts()),
    onSpectateNext: () => cycleSpectate(ctx, readPeers(ctx), 1),
    onSpectatePrev: () => cycleSpectate(ctx, readPeers(ctx), -1),
    onShop: (which) => openShop(ctx, which),
    onVote: (mapId) => onVote(ctx, mapId),
    onObbyEnter: () => openObbyPicker(ctx),
    onObbyLeave: () => { S.obby.leave(ctx); music(ctx, LOBBY_MUSIC); },
  });
  S.combat.setSkin(S.save.equipped.skin);

  buildRings(ctx);
  buildBoards(ctx);

  // §11.2: the lobby pad is the respawn point until something else owns you. Nothing else in
  // this Place calls setCheckpoint but obby.js, which owns you in the column, and §4.1 step
  // 3, which owns you in a round.
  try { ctx.player.setCheckpoint(S.lobbyPad); } catch { /* fine */ }
  try {
    ctx.player.setWalkSpeed(TUNE.WALK_SPEED_DEFAULT);
    ctx.player.setJumpPower(TUNE.JUMP_POWER_DEFAULT);
    ctx.engine.physics.setGravity(TUNE.GRAVITY_DEFAULT);
  } catch { /* fine */ }

  // ---- subscriptions. Every unsub goes in the bag (rule 2) ---------------------------
  const on = (evt, fn) => S.subs.push(ctx.events.on(evt, fn));

  for (const m of MAPS) on("touch:vote-" + m.id, () => onVote(ctx, m.id));
  for (const which of ["hats", "emotes", "skins", "vault"]) {
    on("touch:shop-" + which, () => openShop(ctx, which));
  }
  on("touch:obby-enter", () => openObbyPicker(ctx));
  for (const st of OBBY_STAGES) {
    on("touch:obby-cp-" + st.id, () => onObbyPad(ctx, "obby-cp-" + st.id));
    on("touch:obby-exit-" + st.id, () => onObbyPad(ctx, "obby-exit-" + st.id));
  }

  // A void death, a stage's own kill slab and anything else the engine kills us for arrive
  // here rather than through combat, which only knows about damage. In `fight` that is still
  // a death this client has to declare about itself, with ki.by null.
  on("player:died", () => {
    if (!S) return;
    const facts = S.round.facts();
    if (facts.phase === "fight" && S.fighter && !S.dead) declareOwnDeath(ctx, null);
  });

  // onAction unsubs are NOT auto-cleared (src/engine/input.js keeps its own listener Set and
  // nothing in the shell's teardown touches it), so these two go in the bag with the rest.
  try {
    S.subs.push(ctx.engine.input.onAction("action1", () => { if (S) onSwing(ctx); }));
    S.subs.push(ctx.engine.input.onAction("action2", () => { if (S) toggleFly(ctx, S.round.facts()); }));
  } catch { /* an input service with no onAction leaves the DOM buttons, which is enough */ }

  // net is a session singleton and leave() does not clear its listener map: only dispose()
  // does, and the shell never calls it per Place. So this unsub is in the bag too.
  try {
    S.subs.push(ctx.services.net.on("bye", () => { if (S) S.spectateTarget = null; }));
  } catch { /* offline is the default and has no relay to listen to */ }

  S.subs.push(S.round.onPhase((next, prev) => { if (S) S.edges.push({ next, prev }); }));
  S.subs.push(S.round.onWin((mapId, clockLeft, byLastStanding) => {
    if (S) onWin(ctx, mapId, clockLeft, byLastStanding);
  }));

  music(ctx, LOBBY_MUSIC);
  refreshChips(ctx);
  emitState(ctx, true);
}

function onVote(ctx, mapId) {
  if (!S.round.castVote(mapId)) { sfx(ctx, "denied"); return; }
  S.myVote = mapId;
  paintRings(ctx);
  sfx(ctx, "click");
  const row = mapById(mapId);
  if (row) S.hud.toastLocal("Voted " + row.icon + " " + row.name);
}

// HUD chips go through ui.setHudStat, which the platform DOES clear on dispose - unlike a
// panel. They are written only when the formatted string changed, which is the same
// discipline the DOM HUD keeps and the reason a 60 Hz sim step touches the platform HUD once
// a round rather than sixty times a second (§15).
function refreshChips(ctx) {
  const ink = S.save.points + "/" + S.save.lifetimeWins;
  if (S.chipInk === ink) return;
  S.chipInk = ink;
  try {
    ctx.services.ui.setHudStat("sd-points", {
      icon: "🏆", label: "Fighting Points", value: String(S.save.points),
    });
    ctx.services.ui.setHudStat("sd-wins", {
      icon: "🥇", label: "Wins", value: String(S.save.lifetimeWins),
    });
  } catch { /* fine */ }
}

// =====================================================================================
// update. The ONLY per-tick hook: there is no render or frame hook a Place may take.
// =====================================================================================
// The order is the one config.js's MODULE CONTRACT fixes, and it is not arbitrary:
//   world.drain -> round.update -> wardens.update -> combat.update -> obby.update ->
//   spectate/fly -> hud.update -> publish -> save-if-dirty -> sd:state-if-dirty
// world.drain runs first so a ground finishes building before the machine that teleports
// fighters into it takes a tick; wardens before combat so a swing tests this tick's drum
// positions rather than last tick's; publish last so the blob carries the HP, the weapon and
// the obby count this tick actually produced.

export function update(dt, ctx) {
  if (!S) return;

  const step = Number.isFinite(dt) && dt > 0 ? dt : 0;

  // One-shots, drained backwards so a handler that pushes another timer does not run it in
  // the same pass. A throwing handler is swallowed: a cosmetic follow-up must never be able
  // to halt update and kill the Place.
  for (let i = S.timers.length - 1; i >= 0; i--) {
    const T = S.timers[i];
    T.t -= step;
    if (T.t > 0) continue;
    S.timers.splice(i, 1);
    try { T.fn(); } catch (err) { console.warn("[oof] showdown: timer failed", err); }
  }

  S.mapQueued = world.drain(ctx, TUNE.DRAIN_PER_TICK);
  try { S.liveParts = ctx.engine.parts.count(); } catch { /* keep the last reading */ }

  const peers = readPeers(ctx);
  const facts = S.round.update(step, ctx, peers);
  // The phase edges round.update just fired are applied HERE rather than inside the callback,
  // because the fighter set and the ground in `facts` are only coherent once update has
  // finished its phase body: §4.1 step 3 needs to know whether THIS client is in the frozen
  // fighter set, and that is the one question the callback cannot answer yet.
  drainEdges(ctx);
  const live = S.round.facts();
  if (live.phase !== S.phase) { S.phase = live.phase; emitState(ctx, true); }

  // §3.4: materialization begins at BUILD_START_S, the instant the vote closes, and drains at
  // DRAIN_PER_TICK with twenty seconds of intermission left as slack. round.js resolves the
  // ground and exposes it as nextMapId; this is what builds it.
  if (live.phase === "intermission" && live.nextMapId && world.currentMapId() !== live.nextMapId) {
    try {
      S.mapQueued = world.materialize(ctx, live.nextMapId);
      wirePads(ctx);
    } catch (err) {
      console.error("[oof] showdown: ground refused", live.nextMapId, err);
    }
  }

  const fighting = live.phase === "fight" && S.fighter && !S.dead && !S.spectating;

  const hit = S.wardens.update(step, ctx, ctx.player.position(), fighting);
  if (hit && S.combat.takeWardenHit(hit.damage)) {
    // A Warden lunge killed us. The death is declared with ki.by NULL: a Warden is never
    // named on the wire, not even as a cause of death (§5.5, ARCHITECTURE §9).
    declareOwnDeath(ctx, null);
  }

  const wardenList = S.wardens.list();
  S.combat.update(step, ctx, live, peers, wardenList);
  readIncoming(ctx, peers);
  if (fighting && S.combat.hp() <= 0) declareOwnDeath(ctx, null);

  S.obby.update(step, ctx, live);
  tickPads(step);
  tickEmote(ctx, step);
  tickVfx(ctx, step);
  tickSpectate(ctx, step, live, peers);
  tickFly(ctx, step, live);
  tickPrompt(ctx, live);

  // §16.7's whole music table, in one place: `ascent` in the obby wherever the round has got
  // to (a player who chose STAY IN OBBY is still climbing, and the ground they are not on is
  // not the round they are in), the voted ground's own track during a fight, and `plaza` in
  // the lobby. music() only calls playMusic when the id actually changed, so this is a
  // comparison per tick and a crossfade per transition.
  music(ctx, S.obby.inObby()
    ? OBBY_MUSIC
    : (live.phase === "fight" && mapById(live.mapId) ? mapById(live.mapId).music : LOBBY_MUSIC));

  S.hud.update(step, ctx, hudView(live, peers, wardenList));
  paintBoards(live);
  paintRings(ctx);
  refreshChips(ctx);

  publish(ctx);
  writeSave(ctx, false);
  emitState(ctx, false);
}

// §11.3: the prompt fires on a LATCHED THRESHOLD CROSSING, once per intermission - the first
// tick on which the intermission clock is at or below OBBY_CHOICE_S + 1 while inObby() - and
// it RESOLVES at OBBY_CHOICE_LEAD_S of clock remaining, not on the flip. 35 + 5 = 40 would
// land the auto-join on the very tick `intermission` becomes `fight`, which makes §12.1's
// "before the round starts, set the checkpoint" impossible for exactly the players the prompt
// exists for: an auto-joined player who died in the opening seconds would respawn at their
// obby checkpoint as a living fighter, 260 studs up and 1500 studs from the ground, where
// nobody can reach or kill them - so the round could only end at the cap, and their untouched
// 100 HP would win the tiebreak.
function tickPrompt(ctx, facts) {
  if (facts.phase !== "intermission") { S.promptLatched = false; return; }
  if (!S.promptLatched && S.obby.inObby() && facts.clock <= TUNE.OBBY_CHOICE_S + 1) {
    S.promptLatched = true;
    S.promptOpen = true;
    S.promptDone = false;
    S.hud.prompt("obby-choice", TUNE.OBBY_CHOICE_S, (choice) => applyChoice(ctx, choice));
  }
  // A prompt that never appeared is not an undefined state, and neither is one the flip
  // caught unresolved: a clock adopted from a conductor, or a frame hitch, can step past a
  // threshold, so the JOIN default is applied inside this tick either way.
  if (S.promptOpen && facts.clock <= TUNE.OBBY_CHOICE_LEAD_S) {
    S.hud.dismissPrompt();
    applyChoice(ctx, "join");
  }
}

// §11.3's last paragraph, called from the edges OUT of intermission. tickPrompt resolves the
// prompt at OBBY_CHOICE_LEAD_S of clock left, which is the normal path; a clock adopted from a
// conductor, a frame hitch or the test seam can step straight past that threshold, and then the
// flip is the last place the default can still be applied. dismissPrompt does NOT call back, so
// the choice below is applied exactly once. `joined` is already true by default, so for the
// player the fighter set was just computed from the join half is a no-op and only the latch and
// the DOM card actually change.
function resolveOpenPrompt(ctx) {
  if (!S.promptOpen) return;
  S.hud.dismissPrompt();
  applyChoice(ctx, "join");
}

// Resolves at most once per prompt. The default is the FIGHT, because a round with a player
// standing idle in it is worse than a lost obby attempt.
function applyChoice(ctx, choice) {
  if (S.promptDone) return;
  S.promptDone = true;
  S.promptOpen = false;
  if (choice === "stay") {
    // jn:0, the checkpoint stays in the obby, and this client is kept out of that round. It
    // may still spectate from the lobby perch, and the next intermission asks again.
    S.round.leaveRound();
    S.hud.toastLocal("Staying in the obby. Next round asks again.");
  } else {
    S.round.joinRound();
    S.hud.toastLocal("Joining the round.");
  }
  publish(ctx);
}

function hudView(facts, peers, wardenList) {
  const row = mapById(facts.mapId || facts.nextMapId);
  const target = S.spectateTarget
    ? peers.find((p) => p.id === S.spectateTarget)
    : null;
  const stage = S.obby.inObby() ? OBBY_STAGES[S.obby.stageIndex()] : null;
  return {
    phase: facts.phase,
    clock: facts.clock,
    votes: facts.votes,
    voteOpen: facts.voteOpen,
    myVote: S.myVote,
    mapName: row ? row.name : "",
    hp: S.combat.hp(),
    weapon: S.combat.heldWeapon(),
    skin: skinById(S.save.equipped.skin),
    alive: facts.alive,
    points: S.save.points,
    lifetimeWins: S.save.lifetimeWins,
    dead: S.dead,
    spectating: S.spectating,
    spectateName: target ? (target.name || target.id) : "",
    canFly: S.unlocks.fly,
    flying: S.flying,
    inObby: S.obby.inObby(),
    stageName: stage ? stage.name : "",
    wardens: wardenList,
  };
}

// =====================================================================================
// dispose (§17.4). Everything, unconditionally, so a second init starts clean and the
// platform's leak check is empty.
// =====================================================================================
// disposePlace compares scene children, geometries and collider counts against a baseline
// captured before the load and reports the difference; the shell filters out only the
// `geometries:` class, because spec 03's geometry cache is shared. sceneChildren:+N,
// colliders:+N and listeners:N all fail the smoke gate. And the platform does NOT restore
// the camera between Places: teardown() clears HUD chips, hides the rig and disables physics,
// and disposePlace's physics.clear() restores walk speed, jump power and gravity - but
// nothing calls cameraCtl.reset(), so §12's setDistance(46) / setPitch(-28) /
// setOffset([0,14,0]) would follow the player into the Hub.

export function dispose(ctx) {
  if (!S) return;

  // The save first, forced, while every module that writes into it is still alive.
  writeSave(ctx, true);

  for (const u of S.subs) { try { u(); } catch { /* fine */ } }
  S.subs.length = 0;
  unwirePads();
  S.timers.length = 0;

  // The panel, ours and shops', because the platform never closes a Place's panel for it.
  closePanel(ctx);
  try { S.hud.dismissPrompt(); } catch { /* fine */ }
  try { S.hud.dispose(); } catch (err) { console.warn("[oof] showdown: hud dispose", err); }

  // The ghost comes down before anything is removed, so walk speed, jump power, the camera
  // and the rig's visibility are restored even if a later line throws.
  disarmSpectate(ctx);
  S.flying = false;
  if (S.emote) endEmote(ctx);
  sweepVfx(ctx);

  try { S.obby.dispose(ctx); } catch (err) { console.warn("[oof] showdown: obby dispose", err); }
  try { S.wardens.clear(ctx); } catch (err) { console.warn("[oof] showdown: wardens clear", err); }
  try { S.combat.dispose(ctx); } catch (err) { console.warn("[oof] showdown: combat dispose", err); }
  try { S.round.dispose(); } catch (err) { console.warn("[oof] showdown: round dispose", err); }

  // release(ctx) FIRST and reset() LAST: reset takes no ctx and therefore cannot remove a
  // part, so a ground still live when it runs is a ground that leaks.
  try { world.release(ctx); } catch (err) { console.warn("[oof] showdown: world release", err); }

  disposeBoards(ctx);
  // Whatever is left in the set - a ring, a halo, a mote a path above missed - goes now. This
  // is the backstop that makes rule 3 worth keeping the set for.
  for (const id of Array.from(S.owned)) rmPart(ctx, id);
  S.owned.clear();
  S.ringIds.length = 0;
  S.ringInk.length = 0;

  try {
    ctx.services.ui.removeHudStat("sd-points");
    ctx.services.ui.removeHudStat("sd-wins");
  } catch { /* fine */ }

  try {
    ctx.player.setWalkSpeed(TUNE.WALK_SPEED_DEFAULT);
    ctx.player.setJumpPower(TUNE.JUMP_POWER_DEFAULT);
    ctx.engine.physics.setGravity(TUNE.GRAVITY_DEFAULT);
  } catch { /* fine */ }
  try { ctx.engine.camera.reset(); } catch { /* fine */ }
  try { ctx.player.avatar.visible = true; } catch { /* fine */ }
  // The Hub's own track, the way battles hands it back.
  try { ctx.engine.audio.playMusic("chill"); } catch { /* fine */ }

  try { world.reset(); } catch { /* fine */ }

  S = null;
}

// =====================================================================================
// The test seam (§17.2). Read by scenario:showdown off debugState() and off `sd:state`.
// =====================================================================================

// `sd:` is this Place's private event prefix (`bt:` and `ot:` are the precedent). The Place
// emits nothing under a reserved platform prefix and never calls ctx.events.clear().
// Throttled, and FORCED on every phase change.
function emitState(ctx, force) {
  if (!force && ctx.time - S.sdAt < TUNE.HUD_REFRESH_S) return;
  S.sdAt = ctx.time;
  try { ctx.events.emit("sd:state", debugState()); } catch { /* fine */ }
}

// The §17.2 field list, exactly. `winner`, `scored`, `fightersAtStart` and `padsArmed` are
// load-bearing rather than decoration: without `winner` and `scored` the smoke run cannot
// tell a single award from a repeated one, and without `padsArmed` §17.3.3 has nothing to
// assert on at all.
export function debugState() {
  if (!S) return null;
  const facts = S.round.facts();
  const list = S.wardens.list();
  return {
    phase: facts.phase,
    clock: facts.clock,
    voteOpen: facts.voteOpen,
    votes: facts.votes,
    roundIndex: facts.roundIndex,
    mapId: facts.mapId,
    mapLive: world.liveCount(),
    mapQueued: S.mapQueued,
    alive: facts.alive,
    fighters: facts.fighters,
    fightersAtStart: facts.fightersAtStart,
    sawOpponent: facts.sawOpponent,
    scored: facts.scored,
    winner: facts.winner,
    conductor: facts.conductor,
    isConductor: facts.isConductor,
    hp: S.combat.hp(),
    weapon: heldWireId(),
    skin: S.save.equipped.skin,
    padsArmed: armedPads(),
    points: S.save.points,
    pointsSpent: S.save.pointsSpent,
    lifetimeWins: S.save.lifetimeWins,
    obbyStage: S.obby.cleared(),
    inObby: S.obby.inObby(),
    choicePrompt: S.promptOpen,
    dead: S.dead,
    spectating: S.spectating,
    spectateTarget: S.spectateTarget,
    perch: world.perch(),
    wardens: list,
    wardensBroken: S.wardens.brokenCount(),
    flying: S.flying,
    panel: shops.isOpen() ? S.panel : (S.panelHandle ? S.panel : null),
    liveParts: S.liveParts,
    // The live ground's own colliders, which is the only collider count reachable from a
    // Place: there is no total on ctx.engine.physics and no query that counts them. It is the
    // number §3.2's MAP_COLLIDER_MAX budgets and therefore the one that can actually move a
    // round, and §17.3.9's 3000 assert is read off the engine by the smoke run itself.
    colliders: world.liveColliderCount(),
  };
}

// TEST ONLY. Subtracts from the current phase clock and from the pad, Warden, emote and
// prompt timers, and sets nothing else; nothing in the Place ever calls it. One cycle of
// this Place is 288 sim seconds against a 2.0-4.5 fps SwiftShader host, so without this the
// mandatory smoke gate would ship covering nothing.
export function debugAdvance(seconds) {
  if (!S) return;
  const s = Number(seconds);
  if (!Number.isFinite(s) || s <= 0) return;
  S.round.debugAdvance(s);
  S.wardens.debugAdvance(s);
  // The regen delay is combat's own clock, measured off its private hurtAt against ctx.time,
  // and §17.2 names "regen" in the list this seam moves.
  S.combat.debugAdvance(s);
  for (const [event, rem] of S.padArm) {
    if (rem > 0) S.padArm.set(event, Math.max(0, rem - s));
  }
  if (S.emoteCool > 0) S.emoteCool = Math.max(0, S.emoteCool - s);
  if (S.emote) S.emote.t += s;
  if (S.spectateArmAt >= 0) S.spectateArmAt = Math.max(0, S.spectateArmAt - s);
  for (const T of S.timers) T.t = Math.max(0, T.t - s);
  S.saveAt -= s;
  S.sdAt -= s;
}

// TEST ONLY. Drives the current phase to its last tick, or walks one phase per tick until
// the machine arrives at the named one.
export function debugSkipTo(phase) {
  if (!S) return;
  S.round.debugSkipTo(phase);
}
