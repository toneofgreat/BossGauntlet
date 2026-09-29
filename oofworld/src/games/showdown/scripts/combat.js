// src/games/showdown/scripts/combat.js - Showdown's combat. Spec 25 §7 and §8 own this
// file: the weapon in your hands, the swing that finds a target by arithmetic, the HP
// that only you may subtract from, and the weapon props that let a room see what
// everybody is carrying.
//
// THE ATTACKER ONLY ANNOUNCES; THE VICTIM APPLIES (§8, §16.9). A swing that connects with
// a player produces a SwingResult and nothing else: no HP is written anywhere but on the
// client that owns it, and this module never publishes, never kills, never awards and
// never saves. game.js hands the SwingResult to round.publishState as `hit`, the named
// victim reads it off the roster, calls applyIncoming on ITSELF, and if that empties its
// own HP its own client declares its own death. The relay is not authoritative and cannot
// arbitrate a hit (ARCHITECTURE §9.1), so a model where the attacker subtracted the
// victim's HP would be two clients disagreeing about who is alive, with no tiebreaker.
//
// Four gates every hit passes, and each one is a defect that had to be written down:
//   - PHASE. Outside `fight` every incoming hit is refused (§5.5). A hit published at the
//     end of round N sits in the relay's cached blob, is handed to every new joiner inside
//     the `welcome`, and would otherwise land on a full-HP player in round N+1.
//   - ADDRESS. `hit.to` must be SELF_ID. Nothing else reads somebody else's mail.
//   - SEQUENCE. A per-attacker MONOTONIC HIGH-WATER, reset at every entry to `fight`, not
//     a fixed-size ring whose evicted keys let one hit land twice in a 240 s round.
//   - I-FRAMES, PER ATTACKER (`TUNE.IFRAME_S`, keyed by peer id). One shared window would
//     mean three players landing hits inside 0.35 s deal one hit's worth of damage between
//     them, so being outnumbered would be mechanically SAFER than a duel, in a
//     last-player-standing Place.
//
// Facing comes from `ctx.player.avatar.rotation.y` and from nowhere else (§8, and the Yaw
// note in config.js's MODULE CONTRACT). It is RADIANS, written from
// physics.getRenderTransform(alpha).yaw in the shell's renderFrame, so it refreshes per
// RENDERED frame rather than per sim tick and reads 0 before the first frame. There is no
// getYaw and no getRenderTransform on ctx.engine.physics, and input.getMoveVector() is
// CONTROL space rather than facing, so this is the only reachable source.
//
// Every spatial test here is hand-rolled arithmetic because the alternatives are not on
// ctx: there is no AABB overlap query, and a sensor part is invisible to physics.raycast
// through ctx, so a raycast could not find a player or a Warden drum either.
//
// Fists are always available (§7.1), so nobody is ever defenceless and nobody is obliged
// to scavenge: `heldWeapon()` answers the FIST row below when your hands are empty.

import { TUNE, weaponById, skinById, minRangeOf, ERROR_FLICKER_COLOUR } from "./config.js";
import { uid } from "./world.js";

// The phase name this module cares about. round.js owns the machine (§4); combat only ever
// asks "is this `fight`", because that is the one window in which HP means anything.
const PHASE_FIGHT = "fight";

// =====================================================================================
// FISTS (§7.1). Not a WEAPONS row, on purpose: the pad roll must never hand out fists and
// rule 25:S2 walks WEAPONS asserting every row names a real ground, which a fist could not
// do. Every number is quoted from TUNE, so the fist is tuned in config.js like everything
// else. `fist: true` is what game.js tests to decide the published `wp` is null rather
// than the string below, because §5.5's `wp` is "held weapon id, or null" and empty hands
// are not a weapon anybody found.
// =====================================================================================

const FIST = Object.freeze({
  id: "fist", name: "Fists", icon: "✊", tier: "starter", fist: true,
  damage: TUNE.FIST_DAMAGE, range: TUNE.FIST_RANGE,
  arcDeg: TUNE.FIST_ARC_DEG, cooldownS: TUNE.FIST_COOLDOWN_S,
  maps: Object.freeze([]),
  desc: "Your own two hands. No reach, no weight, and never taken off you.",
});

// =====================================================================================
// Presentation, which lives here because config.js has no field for it. A WEAPONS row
// carries damage, reach, arc and cooldown and deliberately no colour: a skin is what
// dresses a weapon (§10.3), and a weapon with no skin still has to look like something.
// So the tier decides the unskinned tint, which also means the rarity you rolled is
// readable across a rooftop without a label.
// =====================================================================================

const TIER_TINT = Object.freeze({
  starter: "#c08a3e",     // the earned axe: brass and oiled wood
  common: "#9aa3ad",      // scrap grey
  uncommon: "#5fbf6a",
  rare: "#4a8ef0",
  epic: "#a45cd6",
  legendary: "#e0a92a",
});
const TINT_FALLBACK = "#9aa3ad";

// The grip, in the avatar's own frame. The rig's origin is its FEET (spec 04), its torso
// runs to about y 3.5, so 2.6 is hand height; the side offset puts the weapon beside the
// body rather than through it. One consistent side is all this needs: the rig builds no
// left/right hand anchor a Place can read, and a prop on the wrong hand is invisible as a
// mistake while a prop inside the chest is not.
const HAND_Y = 2.6;
const HAND_FWD = 0.5;
const HAND_SIDE = 0.9;

// The prop itself: a haft pointing the way you are facing and a head on the end of it. Two
// parts per holder, which at the 20-player room cap is 40 parts against
// TUNE.MAP_PARTS_MAX's 1800 (§10.3 budgets them there). The haft's LENGTH is read off the
// weapon's own `range` rather than a second table, so the Rebar Spear looks like the
// longest reach on any ground because it IS, and a row retuned in config.js cannot leave a
// lying prop behind.
const HAFT_THICK = 0.18;
const HAFT_MIN = 0.8;
const HAFT_MAX = 3.6;
const HAFT_OF_RANGE = 0.5;
const HEAD_SIZE = Object.freeze([0.5, 0.52, 0.3]);
const HEAD_RISE = 0.34;      // the head sits a little above the grip, so it reads as held
                             // at an angle without a second rotation axis to get wrong

// The widest a swing can actually connect, in degrees: TUNE.HIT_CONE_DOT is a FLOOR, so
// 2 * acos(0.5) = 120 deg caps the Star Censer's authored 140 (§8). The arc effect is drawn
// at THIS width and never at the authored one, because a visual that promised 140 deg of
// reach the gates then refuse would be the effect lying about the rules.
const CONE_MAX_DEG = 2 * Math.acos(TUNE.HIT_CONE_DOT) * 180 / Math.PI;

// Effect lifetimes and sizes. Presentation only: nothing here is a tuning value, nothing
// here is published, and a dropped spark cannot desync a peer.
const ARC_BLADES = 4;
const ARC_LIFE_S = 0.16;
const ARC_BLADE_SIZE = Object.freeze([0.7, 0.14, 0.22]);
const ARC_AT_RANGE = 0.7;    // fraction of the weapon's reach the arc is drawn at
const SPARK_COUNT = 5;
const SPARK_LIFE_S = 0.35;
const SPARK_SIZE = Object.freeze([0.26, 0.26, 0.26]);
const SPARK_SPREAD = Object.freeze([-0.7, -0.35, 0, 0.35, 0.7]);  // fixed, not sampled:
                             // nothing in this Place may reach for a random source for a
                             // thing a peer might have to agree about, and a fixed fan
                             // costs one multiply instead
const CHEST_Y = 3.0;         // where a hit reads from, feet plus a torso

// How long an announced hit waits for its victim to admit it (§8's "connect feedback
// follows the victim"). Derived, not chosen: the victim force-publishes on a hit, publishing
// is throttled to TUNE.PUBLISH_MIN_S and the relay adds latency, so ten publish periods is
// a generous ceiling on the round trip and still far too short for the next exchange to be
// credited to this swing.
const CONNECT_WINDOW_S = TUNE.PUBLISH_MIN_S * 10;

// The skin flourish step (§10.3). Glitchsteel is specified as a stutter between three
// colours; at 60 Hz that is invisible and costs sixty setColor calls a second, so the
// stutter runs at this step instead, which the eye reads as a stutter and the frame budget
// does not notice.
const MOTION_STEP_S = 0.08;

// Composing a weapon's sound out of the closed 25-name registry (§16.6). There is no
// sword, axe or gunshot recipe to reach for, so weight is expressed as pitch and volume:
// a slower row (a longer cooldownS) lands lower and louder, which is the whole difference
// between the Heartwood Greatclub and a Fallen Branch to the ear.
function swingPitch(w) {
  return clamp(1.35 - w.cooldownS * 0.5, 0.55, 1.35);
}
function swingVolume(w) {
  return clamp(0.45 + w.damage / TUNE.HP_MAX, 0.45, 1);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function degOf(rad) {
  return rad * 180 / Math.PI;
}

// =====================================================================================
// create(ctx) -> Combat
// =====================================================================================
// State lives in this closure and nowhere else, so a second init after a dispose starts
// clean by construction rather than by remembering to reset a module-level holder.

export function create(ctx, round) {
  // §5.1: the same identity substitution round.js makes - but NOT read once. net.self().id is
  // null until a relay `welcome` arrives, which offline - the default in every dev checkout
  // and every smoke run - is never, so "local" is what a solo client addresses and is
  // addressed by. It is a value, not a branch: the hit gates below read it and never ask
  // whether a server exists (ARCHITECTURE §9.2).
  //
  // WHY THE ADDRESS IS A LIVE READ AND NOT A BOOT-TIME CONSTANT. The shell calls init
  // SYNCHRONOUSLY, and net.js assigns its own `selfId` only later, inside the relay's
  // `welcome` handler. Freezing the id at create left combat answering to "local" for the
  // life of a populated room: game.js's readIncoming matched `hit.to` against round's LIVE
  // id and forwarded the hit, and applyIncoming then refused it one line later on
  // `hit.to !== SELF_ID`, so PvP damage never landed online. round.js already solved this
  // once and publishes the answer as a live getter, so the address is taken from there
  // rather than read a second time out of net - one identity for the whole Place, adopted on
  // the same tick round adopts it. `round` is optional only so this module still stands up
  // in a harness with no round machine; the fallback is the substitution round.js makes.
  const ROUND = round && typeof round === "object" ? round : null;
  let SELF_ID = null;   // set below, once S exists; every reader goes through selfId()

  const S = {
    hpNow: TUNE.HP_MAX,
    dead: false,          // latched at 0 HP and cleared only by resetForRound, so a corpse
                          // neither regenerates nor takes a second killing blow
    inRound: false,       // is this client a fighter in the round that is running? §4.1 step 3
                          // calls resetForRound for FIGHTERS ONLY - a client that answered
                          // STAY IN OBBY, or that was adopted out by §5.3, never reaches it -
                          // so the latch it sets is this module's own answer, and update drops
                          // it the moment the phase leaves `fight` so it cannot carry over
    dd: 0,                // damage dealt to PLAYERS this round, for the published `dd`
    clean: true,          // no damage taken this round, for the `untouched` badge
    weaponId: null,       // a WEAPONS id, or null for fists
    skinId: null,
    cd: 0,                // swing cooldown, counted down from the row's own cooldownS
    seq: 0,               // the published hit sequence. It is monotonic for the LIFE of the
                          // Place, not per round: the victim resets its high-water on every
                          // entry to `fight`, so a sequence that only ever rises can never
                          // be mistaken for a replay of an older one.
    now: 0,               // ctx.time, refreshed every tick. applyIncoming and takeWardenHit
                          // are handed no ctx by the contract, so the clock has to be here.
    phase: "boot",
    hurtAt: -TUNE.REGEN_DELAY_S,   // "long enough ago that regen is available", written as
                                   // the delay itself so a round beginning at ctx.time 0
                                   // does not spend its first six seconds unable to heal
    lastHitAt: new Map(),   // peer id -> the tick we last accepted a hit from them (i-frames)
    hiSeq: new Map(),       // peer id -> the highest `s` we have SEEN from them
    pending: [],            // {id, damage, at} announced hits waiting for the victim's own
                            // published HP to drop, which is what earns the connect feedback
    peerHp: new Map(),      // peer id -> the last `hp` we read off their published state
    peers: [],              // last tick's roster view, because swing() is handed no peers
    wardens: [],            // last tick's WardenViews, for the same reason
    props: new Map(),       // peer id -> {key, ids}
    mine: null,             // {key, ids} for your own held weapon
    vfx: [],                // [{ids, t}] transient effect parts, oldest first
    vfxParts: 0,
    hurtFx: 0,              // damage taken since the last tick, drawn on the next one
    motionAt: 0,
    motionStep: 0,
    motionWrote: null,      // {color, transparency} last pushed to the head, so a static
                            // skin costs no engine calls at all
  };

  // The address, re-read wherever it is compared. It may change EXACTLY ONCE, when
  // `welcome` lands and "local" is replaced by the relay's name for us. Both replay guards
  // are keyed by the ATTACKER's id but they are records of what THIS identity has already
  // accepted, so a high-water carried across the handover would refuse the first real hits
  // of the room under the previous identity's sequence numbers. They are cleared with the
  // id, exactly as resetForRound clears them on a round edge (§5.5).
  function selfId() {
    const fromRound = ROUND && typeof ROUND.selfId === "string" && ROUND.selfId
      ? ROUND.selfId : null;
    const live = fromRound || readSelfId(ctx);
    if (live !== SELF_ID) {
      // Not on the first read: there is nothing to forget before the first hit.
      if (SELF_ID !== null) {
        S.hiSeq.clear();
        S.lastHitAt.clear();
      }
      SELF_ID = live;
    }
    return SELF_ID;
  }
  selfId();

  // -----------------------------------------------------------------------------------
  // Reading yourself
  // -----------------------------------------------------------------------------------

  function held() {
    return weaponById(S.weaponId) || FIST;
  }

  function skin() {
    return skinById(S.skinId);
  }

  // §5.3: a peer is stale when the Place's own bookkeeping says so, when its state is null,
  // or when its state carries the wrong schema version, and A STALE PEER COUNTS AS al:0 AND
  // jn:0 EVERYWHERE in this Place. peer.at is no use for the window: it is stamped from
  // net.js's own private sim accumulator, which ctx.services.net does not expose, and
  // ctx.time is per-Place and shares no origin with it. So game.js remembers ctx.time on
  // every tick a peer's state JSON changed and hands it over as lastChangeAt, and this
  // compares that against our own clock. When the caller has already decided, we take its
  // answer; when it gives us only lastChangeAt we derive the same window, rather than letting
  // a missing field mean "fresh".
  function isStale(p) {
    if (p.stale === true) return true;
    const st = p.state;
    if (!st || typeof st !== "object" || st.v !== TUNE.STATE_V) return true;
    if (Number.isFinite(p.lastChangeAt) && S.now - p.lastChangeAt > TUNE.PEER_STALE_S) return true;
    return false;
  }

  // The flat-plane facing of §8, as [x, z]. A missing avatar reads as yaw 0 rather than
  // throwing: rotation.y is 0 before the first rendered frame anyway, and a swing on the
  // first tick of a round is a swing into whatever the rig was pointing at.
  function facing() {
    const a = ctx.player.avatar;
    const yaw = a && a.rotation ? a.rotation.y : 0;
    return [Math.sin(yaw), Math.cos(yaw), yaw];
  }

  // -----------------------------------------------------------------------------------
  // The swing (§8)
  // -----------------------------------------------------------------------------------
  // Two gates that BOTH bite, in the order the spec fixes them: the flat-plane facing dot
  // above TUNE.HIT_CONE_DOT, and inside arcDeg / 2. The dot is a floor that caps the widest
  // rows, so the Censer's 140 deg sweep connects across 120 and no wider; at the old 0.25
  // it was a 151 deg cone, wider than every row in the table plus the fist, and therefore a
  // second test that could never reject anything arcDeg/2 accepted.
  //
  // DISTANCE IS MEASURED IN THREE DIMENSIONS while the cone is flat. Both grounds that are
  // built vertically - the forest's three canopy levels, the city's roofs linked by planks -
  // would otherwise let a fighter on a walkway connect with somebody forty studs below
  // through the boards, because a flat distance between two feet positions says they are
  // standing on each other. The cone stays flat because a swing is aimed with the camera's
  // yaw and nothing on ctx reports its pitch.
  function testTarget(me, f, w, target) {
    const dx = target[0] - me[0];
    const dy = target[1] - me[1];
    const dz = target[2] - me[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > w.range) return -1;
    const flat = Math.sqrt(dx * dx + dz * dz);
    // At zero separation there is no direction to test at all, so it reads as a miss rather
    // than as a guaranteed hit: standing inside somebody is not aiming at them.
    if (flat <= 0) return -1;
    const dot = (dx * f[0] + dz * f[1]) / flat;
    if (dot < TUNE.HIT_CONE_DOT) return -1;
    if (dot < Math.cos((w.arcDeg / 2) * Math.PI / 180)) return -1;
    return dist;
  }

  // Every living, non-stale fighter, and every awake Warden that is not already broken.
  // A stale peer counts as al:0 everywhere in this Place (§5.3), which here means a tab
  // whose sim stopped cannot be farmed for damage from across the map.
  function livingPeers() {
    const out = [];
    const me = selfId();
    for (const p of S.peers) {
      if (!p || typeof p.id !== "string" || !p.id || p.id === me) continue;
      if (isStale(p)) continue;
      if (!Array.isArray(p.pos) || p.pos.length < 3) continue;
      if (!p.state || p.state.al !== 1) continue;
      out.push(p);
    }
    return out;
  }

  function swing() {
    if (S.cd > 0) return null;
    // The same refusal as a cooldown, and for the same reason it is expressed as null: a
    // swing outside `fight`, or after your own death, has nothing to hit and nothing to
    // publish. Every victim would refuse the hit anyway (§5.5); refusing to announce it is
    // how this client stops asking.
    if (S.phase !== PHASE_FIGHT || S.dead) return null;

    const w = held();
    S.cd = w.cooldownS;
    const me = ctx.player.position();
    const f = facing();

    // The whoosh is LOCAL AND IMMEDIATE, and it is the only feedback a swing gets on its
    // own (§8). Everything that says "you connected" waits for the victim.
    sfx("whoosh", { pitch: swingPitch(w), volume: swingVolume(w) });
    arcVfx(me, f, w);

    const inner = minRangeOf(w);
    let best = null, bestD = Infinity, bestKind = null;
    let close = null, closeD = Infinity;

    for (const p of livingPeers()) {
      const d = testTarget(me, f, w, p.pos);
      if (d < 0) continue;
      // Inside minRange the swing WHIFFS (§7.1). It is the only price reach pays: with no
      // knockback reachable from a Place and every fighter at the same FIGHT_WALK_SPEED,
      // reach would otherwise be the only defensive stat in the game and the city's rare
      // Rebar Spear would simply beat its own ground's legendary.
      if (d < inner) { if (d < closeD) { closeD = d; close = p.id; } continue; }
      if (d < bestD) { bestD = d; best = p; bestKind = "player"; }
    }

    for (const v of S.wardens) {
      if (!v || v.state === "broken" || !v.awake) continue;
      if (!Array.isArray(v.position) || v.position.length < 3) continue;
      const d = testTarget(me, f, w, v.position);
      if (d < 0) continue;
      if (d < inner) { if (d < closeD) { closeD = d; close = String(v.index); } continue; }
      if (d < bestD) { bestD = d; best = v; bestKind = "warden"; }
    }

    // The NEAREST qualifying target takes the hit, whatever it is: one swing, one target,
    // even for a 140 deg sweep. A target inside minRange is not qualifying, so a valid
    // target always beats one that is too close, and the whiff is reported only when the
    // too-close target was the only thing in front of you.
    // `seq` on anything but a player hit is the last sequence this client published and is
    // not consumed: only an announcement addressed to a victim gets a number, because only
    // an announcement is something a victim has to be able to recognise as new.
    if (!best) {
      return {
        kind: close === null ? "miss" : "whiff",
        // The too-close target's id, so the HUD can say why the swing did nothing rather
        // than leaving a whiff and a miss looking identical to the player.
        targetId: close, damage: 0, killed: false, seq: S.seq,
      };
    }

    if (bestKind === "player") {
      S.seq += 1;
      S.dd += w.damage;
      // The announcement, and the receipt this client keeps for it. Nothing is applied here:
      // game.js publishes {s: seq, to: targetId, d: damage, w: heldWeapon().id} and the
      // named victim is the only thing that may subtract it from anybody.
      S.pending.push({ id: best.id, damage: w.damage, at: S.now });
      return { kind: "player", targetId: best.id, damage: w.damage, killed: false, seq: S.seq };
    }

    // A Warden is a prop, so its hit is applied locally and published to nobody, not even
    // as a cause of death (§9.1, §5.5). `boing` is the plating; the `pop` of a Warden
    // actually breaking belongs to whoever applies the break, so it is not played twice.
    sfx("boing", { pitch: swingPitch(w), volume: 0.7 });
    sparkAt([best.position[0], best.position[1] + CHEST_Y, best.position[2]], tintOf(held(), skin()));
    const hpLeft = Number(best.hp);
    return {
      kind: "warden",
      targetId: String(best.index),
      damage: w.damage,
      // ADVISORY, and marked as such: wardens.damage(index, amount) is what actually breaks
      // a drum and its own return is the authority. This is a read of the WardenView the
      // last tick handed us, for feedback that wants to know before the next tick does.
      killed: Number.isFinite(hpLeft) && hpLeft - w.damage <= 0,
      seq: S.seq,
    };
  }

  // -----------------------------------------------------------------------------------
  // Incoming (§8) - the only place this client's HP goes down
  // -----------------------------------------------------------------------------------

  function applyIncoming(hit, fromPeerId) {
    if (!hit || typeof hit !== "object") return false;
    // Outside `fight` every incoming hit is refused, without exception. The relay caches
    // the last blob per connection and hands it to every new joiner inside the `welcome`,
    // so a hit published at the end of round N is still in the blob at the start of N+1 and
    // would be applied again straight after resetForRound.
    if (S.phase !== PHASE_FIGHT || S.dead) return false;
    // AND THE VICTIM HAS TO BE IN THE ROUND. The phase gate and the death latch above are one
    // clause short of §5.5's list: during `fight` they both pass on a client that answered
    // STAY IN OBBY or was adopted out by §5.3, which publishes `al:0` and is 600 studs west and
    // 260 studs up in the obby column. Applying a hit there drops that client's published `hp`,
    // plays `oof`, spits a spark and shakes the camera mid-jump with the round's own HP card
    // hidden, so nothing on screen explains it - exactly the disturbance §12.2 forbids, in a
    // rage obby. No honest client addresses such a peer (a swing requires `al === 1` on its
    // target), so this is only reachable from a modified one, which is what §5.5's gates are
    // the defence against.
    if (!S.inRound) return false;
    if (hit.to !== selfId()) return false;
    const from = typeof fromPeerId === "string" && fromPeerId ? fromPeerId : null;
    if (!from) return false;
    const s = Number(hit.s);
    if (!Number.isFinite(s)) return false;

    const hi = S.hiSeq.get(from);
    if (hi !== undefined && s <= hi) return false;

    // THE HIGH-WATER RISES ON EVERY HIT WE SEE, including one we are about to refuse for
    // an i-frame. game.js re-reads the roster every tick and the attacker's blob does not
    // change until they publish again, so a sequence left un-raised would be handed to us
    // sixty times and applied the moment the 0.35 s window expired: the i-frame would delay
    // the hit rather than deny it.
    S.hiSeq.set(from, s);

    const d = clamp(Number(hit.d) || 0, 0, TUNE.HP_MAX);
    if (d <= 0) return false;

    const last = S.lastHitAt.get(from);
    if (last !== undefined && S.now - last < TUNE.IFRAME_S) return false;
    S.lastHitAt.set(from, S.now);

    hurt(d);
    return true;
  }

  // A Warden lunge (§9.2). It carries no i-frame of its own because wardens.js already
  // limits itself to one hit per TUNE.WARDEN_HIT_COOLDOWN_S per drum, and it is never
  // attributed on the wire: a prop reported as a killer is exactly what ARCHITECTURE §9
  // forbids, so game.js declares this death with ki.by null.
  function takeWardenHit(damage) {
    if (S.phase !== PHASE_FIGHT || S.dead) return false;
    const d = clamp(Number(damage) || 0, 0, TUNE.HP_MAX);
    if (d <= 0) return false;
    hurt(d);
    return S.dead;
  }

  function hurt(d) {
    S.hpNow = Math.max(0, S.hpNow - d);
    S.clean = false;
    // Regen is suspended by a Warden lunge exactly as it is by a player hit (§8), which is
    // why both paths land here and neither has a clock of its own.
    S.hurtAt = S.now;
    S.hurtFx += d;
    if (S.hpNow <= 0) { S.hpNow = 0; S.dead = true; }
  }

  // -----------------------------------------------------------------------------------
  // Out-of-combat regeneration (§8)
  // -----------------------------------------------------------------------------------
  // Without it a 240 s cap with no healing anywhere means one bad corner at 0:30 is carried
  // for three and a half minutes, and the last two survivors meet at whatever the Wardens
  // left them: the duel decided by who met a drum rather than by the fight.
  function regen(dt) {
    if (S.phase !== PHASE_FIGHT || S.dead) return;
    if (S.hpNow >= TUNE.HP_MAX) return;
    if (S.now - S.hurtAt < TUNE.REGEN_DELAY_S) return;
    S.hpNow = Math.min(TUNE.HP_MAX, S.hpNow + TUNE.REGEN_PER_S * dt);
  }

  // -----------------------------------------------------------------------------------
  // The connect, which follows the VICTIM and not the swing (§8)
  // -----------------------------------------------------------------------------------
  // A victim honours its own i-frames, so the hit we announced may have been discarded.
  // Firing `oof`, the spark and camera.shake off our own swing told two attackers they
  // connected when the victim had thrown one of the hits away. So the feedback waits for
  // that peer's next published `hp` to fall, and a fall is only credited to our announcement
  // when it is at least as large as the damage we claimed - unless the victim reached zero,
  // where a 15-damage swing into 8 remaining HP is a 8-point drop and still a kill.
  function readConnects() {
    const seen = new Set();
    const me = selfId();
    for (const p of S.peers) {
      if (!p || typeof p.id !== "string" || !p.id || p.id === me) continue;
      seen.add(p.id);
      if (isStale(p) || !p.state) continue;
      const now = Number(p.state.hp);
      if (!Number.isFinite(now)) continue;
      const was = S.peerHp.get(p.id);
      S.peerHp.set(p.id, now);
      if (was === undefined) continue;
      const drop = was - now;
      if (drop <= 0) continue;

      let budget = now <= 0 ? Infinity : drop;
      let landed = 0;
      for (let i = 0; i < S.pending.length; i++) {
        const q = S.pending[i];
        if (q.id !== p.id) continue;
        if (q.damage > budget) continue;
        budget -= q.damage;
        landed += 1;
        S.pending.splice(i, 1);
        i -= 1;
      }
      if (landed > 0) connectFx(p);
    }
    // A peer that left the roster must not have an old HP compared against its first
    // published one when it comes back, and this map is presentation bookkeeping rather
    // than round state, so pruning it is free. lastHitAt and hiSeq are deliberately NOT
    // pruned here: they are the replay guard, and they are cleared by resetForRound.
    if (S.peerHp.size > seen.size) {
      for (const id of Array.from(S.peerHp.keys())) if (!seen.has(id)) S.peerHp.delete(id);
    }
  }

  function connectFx(p) {
    if (!Array.isArray(p.pos) || p.pos.length < 3) return;
    const at = [p.pos[0], p.pos[1] + CHEST_Y, p.pos[2]];
    sfx("oof", { volume: 0.85 });
    sparkAt(at, tintOf(held(), skin()));
    // A connect gets a camera kick and a spark because knockback is not reachable from a
    // Place at all: physics.launch is not on ctx and the only impulse a Place can build is a
    // vertical `bounce` part (§16.4).
    shake(TUNE.SHAKE_ON_HIT, TUNE.SHAKE_ON_HIT_S);
  }

  // Being hit is drawn on the tick AFTER it is applied, because applyIncoming and
  // takeWardenHit are handed no ctx by the contract and nothing here holds one over from a
  // previous call. One tick is 1/60 s, which is under the threshold at which anybody could
  // tell, and it keeps ctx out of this closure's long-lived state.
  function drawHurt() {
    if (S.hurtFx <= 0) return;
    const d = S.hurtFx;
    S.hurtFx = 0;
    const me = ctx.player.position();
    sfx("oof", { pitch: 0.9, volume: 0.9 });
    sparkAt([me[0], me[1] + CHEST_Y, me[2]], "#e0562f");
    shake(clamp(TUNE.SHAKE_ON_HIT * (0.6 + d / TUNE.HP_MAX), 0, 1), TUNE.SHAKE_ON_HIT_S);
  }

  // -----------------------------------------------------------------------------------
  // Weapon props (§10.3)
  // -----------------------------------------------------------------------------------
  // Publishing `sk` draws nothing on anybody else's rig. A Place has no handle on a remote
  // rig at all: `remotes` is created and disposed by the shell and is not on ctx, a roster
  // row carries no Object3D, and ctx.services.avatar acts only on the local player. So each
  // client reads every peer's wp/sk and builds its OWN prop for them.
  //
  // YOUR OWN weapon is a parts.create part too, and is NOT parented to ctx.player.avatar.
  // rigRoot is built once at boot and only HIDDEN at teardown; a mesh added with
  // avatar.add() is not in parts' tracked set so parts.clear() never removes it; and as a
  // CHILD of rigRoot it does not change scene.children.length, which is all disposePlace
  // compares. A weapon left on the rig is worn in the Hub with nothing reporting it.

  function tintOf(w, sk) {
    if (sk) return sk.tint;
    return TIER_TINT[w.tier] || TINT_FALLBACK;
  }

  function materialOf(sk) {
    return sk ? sk.material : "metal";
  }

  // The prop's identity: rebuild only when the weapon or the skin actually changes, because
  // a part's material is fixed at create time and a skin is a material change.
  function propKey(weaponId, skinId) {
    return `${weaponId || ""}|${skinId || ""}`;
  }

  function buildProp(w, sk) {
    const len = clamp(w.range * HAFT_OF_RANGE, HAFT_MIN, HAFT_MAX);
    const tint = tintOf(w, sk);
    const ids = [];
    try {
      ids.push(ctx.engine.parts.create({
        id: uid("prop"), shape: "box", size: [HAFT_THICK, HAFT_THICK, len],
        position: [0, -100, 0], color: sk ? tint : "#6b4a2a",
        material: sk ? materialOf(sk) : "wood", canCollide: false,
      }));
      ids.push(ctx.engine.parts.create({
        id: uid("prop"), shape: "box", size: HEAD_SIZE.slice(),
        position: [0, -100, 0], color: tint, material: materialOf(sk), canCollide: false,
      }));
    } catch { /* a prop is decoration: a refused create must never cost a round */ }
    // Parked under the ground for the one tick between create and the first placeProp, so a
    // new prop never blinks at the world origin.
    return { key: propKey(w.id, sk ? sk.id : null), ids, len };
  }

  function placeProp(entry, pos, yaw) {
    if (!entry || entry.ids.length < 2) return;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // One consistent perpendicular is all a held prop needs (see HAND_SIDE).
    const rx = fz, rz = -fx;
    const hx = pos[0] + fx * HAND_FWD + rx * HAND_SIDE;
    const hy = pos[1] + HAND_Y;
    const hz = pos[2] + fz * HAND_FWD + rz * HAND_SIDE;
    const half = entry.len / 2;
    const yawDeg = degOf(yaw);
    try {
      ctx.engine.parts.setPosition(entry.ids[0], [hx + fx * half, hy + HEAD_RISE * 0.5, hz + fz * half]);
      ctx.engine.parts.setRotation(entry.ids[0], [0, yawDeg, 0]);
      ctx.engine.parts.setPosition(entry.ids[1], [hx + fx * entry.len, hy + HEAD_RISE, hz + fz * entry.len]);
      ctx.engine.parts.setRotation(entry.ids[1], [0, yawDeg, 0]);
    } catch { /* the part is gone; the next reconcile rebuilds it */ }
  }

  function dropProp(entry) {
    if (!entry) return;
    for (const id of entry.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    entry.ids.length = 0;
  }

  // Your own prop, reconciled against what you are holding and wearing.
  function syncMine() {
    const w = held();
    const sk = skin();
    // Empty hands carry no prop at all: fists are the weapon, and a floating fist-shaped
    // box beside every idle player in the lobby would read as a bug.
    const want = w.fist ? null : propKey(w.id, sk ? sk.id : null);
    if (!want) { if (S.mine) { dropProp(S.mine); S.mine = null; S.motionWrote = null; } return; }
    if (!S.mine || S.mine.key !== want) {
      dropProp(S.mine);
      S.mine = buildProp(w, sk);
      S.motionWrote = null;
    }
    const f = facing();
    placeProp(S.mine, ctx.player.position(), f[2]);
  }

  function syncPeerProps(cx, peers) {
    const rows = Array.isArray(peers) ? peers : [];
    const seen = new Set();
    const me = selfId();
    for (const p of rows) {
      if (!p || typeof p.id !== "string" || !p.id || p.id === me) continue;
      if (!Array.isArray(p.pos) || p.pos.length < 3) continue;
      // A stale peer's blob is not describing anything current (§5.3), so its prop goes
      // with the rest of its claims rather than hanging in the air where it last stood.
      const st = isStale(p) ? null : p.state;
      const w = st ? weaponById(st.wp) : null;
      if (!w) continue;
      seen.add(p.id);
      const sk = st ? skinById(st.sk) : null;
      const want = propKey(w.id, sk ? sk.id : null);
      let entry = S.props.get(p.id);
      if (!entry || entry.key !== want) {
        dropProp(entry);
        entry = buildProp(w, sk);
        S.props.set(p.id, entry);
      }
      // A peer's `yaw` is RADIANS, like our own avatar.rotation.y and unlike the DEGREES
      // player.teleport and camera.setPitch take. Mixing them silently points every blade
      // in the room the wrong way.
      const yaw = Number(p.yaw);
      placeProp(entry, p.pos, Number.isFinite(yaw) ? yaw : 0);
    }
    // A peer that dropped its weapon, went stale, or left the room on a `bye` simply stops
    // qualifying above, and its prop is removed on that tick. That is why this module
    // subscribes to nothing: there is no net.on unsub here to leak into the Hub, and
    // net.on unsubs are not auto-cleared by the shell.
    for (const id of Array.from(S.props.keys())) {
      if (!seen.has(id)) { dropProp(S.props.get(id)); S.props.delete(id); }
    }
  }

  // The skin flourishes of §10.3, on your own prop only: a peer's blade is drawn from what
  // they published, and animating theirs would be this client inventing detail about
  // somebody else. Only colour and transparency are reachable - there is no setSize on
  // ctx.engine.parts and a part's material is fixed at create - so every motion below is
  // written in those two.
  function motion() {
    if (!S.mine || S.mine.ids.length < 2) return;
    const sk = skin();
    if (!sk || sk.motion === "none") return;
    if (S.now - S.motionAt < MOTION_STEP_S) return;
    S.motionAt = S.now;
    S.motionStep += 1;

    let color = sk.tint;
    let transparency = 0;
    if (sk.motion === "glitch") {
      // "Stutters between three colours" (§10.3): its own tint, the `error` stage's second
      // colour, and white. The pair is the obby's, because Glitchsteel is what clearing the
      // `error` stage unlocks.
      const k = S.motionStep % 3;
      color = k === 0 ? sk.tint : k === 1 ? ERROR_FLICKER_COLOUR : "#ffffff";
    } else if (sk.motion === "pulse") {
      // "Pulses in time with your swing cooldown, so you can read it": lit when the swing is
      // ready, dark while it is not. The cooldown is already on screen this way, with no HUD
      // chip and no second source of truth.
      color = S.cd > 0 ? "#4a2a55" : sk.tint;
    } else if (sk.motion === "shimmer" || sk.motion === "mist") {
      transparency = S.motionStep % 2 === 0 ? 0.15 : 0.3;
    } else if (sk.motion === "edge" || sk.motion === "flakes" || sk.motion === "orbit") {
      color = S.motionStep % 4 === 0 ? "#ffffff" : sk.tint;
    }

    const was = S.motionWrote;
    if (was && was.color === color && was.transparency === transparency) return;
    S.motionWrote = { color, transparency };
    try {
      ctx.engine.parts.setColor(S.mine.ids[1], color);
      ctx.engine.parts.setTransparency(S.mine.ids[1], transparency);
    } catch { /* the prop was rebuilt underneath us; the next step writes it again */ }
  }

  // -----------------------------------------------------------------------------------
  // Effects. Every part created here is removed on expiry AND swept again in dispose.
  // -----------------------------------------------------------------------------------

  function pushVfx(ids, life) {
    if (!ids.length) return;
    S.vfx.push({ ids, t: life });
    S.vfxParts += ids.length;
    // TUNE.VFX_MAX is a hard ceiling on live effect parts (§8): past it the OLDEST group
    // goes, so a long exchange between four fighters degrades into fewer sparks rather than
    // into a part count that eats the collider and draw budget the smoke run asserts.
    while (S.vfxParts > TUNE.VFX_MAX && S.vfx.length > 0) {
      const old = S.vfx.shift();
      S.vfxParts -= old.ids.length;
      for (const id of old.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    }
  }

  function tickVfx(dt) {
    for (let i = S.vfx.length - 1; i >= 0; i--) {
      const v = S.vfx[i];
      v.t -= dt;
      if (v.t > 0) continue;
      S.vfx.splice(i, 1);
      S.vfxParts -= v.ids.length;
      for (const id of v.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    }
    if (S.vfxParts < 0) S.vfxParts = 0;
  }

  function arcVfx(me, f, w) {
    const tint = tintOf(w, skin());
    const half = Math.min(w.arcDeg, CONE_MAX_DEG) / 2;
    const r = Math.max(w.range * ARC_AT_RANGE, HAFT_MIN);
    const yaw = f[2];
    const ids = [];
    for (let k = 0; k < ARC_BLADES; k++) {
      const frac = ((k + 0.5) / ARC_BLADES) * 2 - 1;
      const a = yaw + frac * half * Math.PI / 180;
      const dx = Math.sin(a), dz = Math.cos(a);
      try {
        ids.push(ctx.engine.parts.create({
          id: uid("vfx"), shape: "box", size: ARC_BLADE_SIZE.slice(),
          position: [me[0] + dx * r, me[1] + HAND_Y + HEAD_RISE, me[2] + dz * r],
          rotation: [0, degOf(a), 0], color: tint, material: "neon", canCollide: false,
        }));
      } catch { /* an effect that cannot be built is simply not drawn */ }
    }
    pushVfx(ids, ARC_LIFE_S);
  }

  function sparkAt(at, tint) {
    const ids = [];
    for (let k = 0; k < SPARK_COUNT; k++) {
      const o = SPARK_SPREAD[k % SPARK_SPREAD.length];
      try {
        ids.push(ctx.engine.parts.create({
          id: uid("vfx"), shape: "sphere", size: SPARK_SIZE.slice(),
          position: [at[0] + o, at[1] + Math.abs(o) * 0.6, at[2] - o * 0.7],
          color: k % 2 === 0 ? tint : "#ffffff", material: "neon", canCollide: false,
        }));
      } catch { /* as above */ }
    }
    pushVfx(ids, SPARK_LIFE_S);
  }

  // -----------------------------------------------------------------------------------
  // The tick
  // -----------------------------------------------------------------------------------

  function update(dt, cx, facts, peers, wardens) {
    // ctx is the same object the shell built for this Place and is re-handed here every
    // tick; the closure keeps the one it was created with and reads the CLOCK off whichever
    // arrives, because ctx.time is reassigned by the shell immediately before update and
    // the first tick already reads 1/60 rather than 0.
    S.now = Number((cx || ctx).time) || S.now;
    if (facts && typeof facts.phase === "string") S.phase = facts.phase;
    // The round is over for this client the instant the phase leaves `fight`, whichever edge
    // took it there: a win, a cap expiry, a skipped fight. Clearing it here rather than in
    // resetForRound's counterpart is what makes it impossible for last round's membership to
    // answer for this one - game.js's own drainEdges runs BEFORE this tick's combat.update, so
    // the latch resetForRound sets on the fight edge is never cleared by the tick that set it.
    if (S.phase !== PHASE_FIGHT) S.inRound = false;
    S.peers = Array.isArray(peers) ? peers : [];
    S.wardens = Array.isArray(wardens) ? wardens : [];

    if (S.cd > 0) S.cd = Math.max(0, S.cd - dt);
    regen(dt);
    drawHurt();

    // An announcement nobody ever admitted to is dropped rather than credited late.
    for (let i = S.pending.length - 1; i >= 0; i--) {
      if (S.now - S.pending[i].at > CONNECT_WINDOW_S) S.pending.splice(i, 1);
    }

    readConnects();
    // Called from here so game.js has one call per tick to make and cannot forget this one;
    // it is idempotent, so a caller that also calls it directly only repositions twice.
    syncPeerProps(cx || ctx, S.peers);
    syncMine();
    motion();
    tickVfx(dt);
  }

  // -----------------------------------------------------------------------------------
  // Round boundaries and inventory
  // -----------------------------------------------------------------------------------

  function resetForRound(cx, startingAxe) {
    // §4.1 runs the join sequence BEFORE the phase becomes `fight`, so this can land on a
    // tick where update has not refreshed the clock yet. Reading it here is what makes the
    // regen window below honest on the round's very first tick.
    S.now = Number((cx || ctx).time) || S.now;
    S.hpNow = TUNE.HP_MAX;
    S.dead = false;
    // §4.1 step 3 runs this for a FIGHTER and returns before it for everybody else, so being
    // called at all is what says this client is in the round now starting - and applyIncoming
    // reads it as the missing membership gate.
    S.inRound = true;
    S.dd = 0;
    S.clean = true;
    S.cd = 0;
    S.hurtFx = 0;
    // Regen is available from the first tick of the round rather than six seconds into it:
    // nobody has taken damage yet, so there is nothing for the delay to be measuring.
    S.hurtAt = S.now - TUNE.REGEN_DELAY_S;
    // The replay guard is reset at every entry to `fight` (§5.5), which is what stops a hit
    // published in the last tick of the previous round from landing on a full-HP fighter.
    S.hiSeq.clear();
    S.lastHitAt.clear();
    S.pending.length = 0;
    S.peerHp.clear();
    // Weapons are FOUND, not carried over (§2.5): every weapon in a round came off the
    // ground of the map you voted for. The one exception is the earned axe, which is granted
    // at every round start once the hundred Fighting Points have been spent (§13.1).
    S.weaponId = startingAxe ? "axe" : null;
    syncMine();
  }

  function giveWeapon(weaponId) {
    const w = weaponById(weaponId);
    if (!w) return false;
    // You carry ONE (§7.2). game.js calls dropWeapon() first when it wants the outgoing id
    // to put back on its pad; this only ever sets what is in your hands.
    S.weaponId = w.id;
    syncMine();
    return true;
  }

  function dropWeapon() {
    const id = S.weaponId;
    if (!id) return null;
    S.weaponId = null;
    syncMine();
    return id;
  }

  function setSkin(skinId) {
    const sk = skinById(skinId);
    S.skinId = sk ? sk.id : null;
    syncMine();
  }

  // `cx` is the contract's parameter and is deliberately unread: every id below was created
  // through the ctx this closure was built with, and removing a part through a different one
  // would be removing it from a different Place's engine view.
  function dispose(cx) {
    for (const v of S.vfx) for (const id of v.ids) { try { ctx.engine.parts.remove(id); } catch { /* gone */ } }
    S.vfx.length = 0;
    S.vfxParts = 0;
    for (const entry of S.props.values()) dropProp(entry);
    S.props.clear();
    dropProp(S.mine);
    S.mine = null;
    S.motionWrote = null;
    S.peers = [];
    S.wardens = [];
    S.pending.length = 0;
    S.peerHp.clear();
    S.hiSeq.clear();
    S.lastHitAt.clear();
    // Nothing else to release: this module owns no DOM, no HUD chip, no panel, no music and
    // no subscription of any kind, and walk speed, jump power, gravity and the camera belong
    // to game.js's dispose (§17.4).
  }

  // Test seam (§17.2), clocks only. Spec 25 §17.2 promises debugAdvance subtracts from the
  // "pad, warden, regen, emote and prompt timers", and the REGEN clock is this module's: the
  // delay is measured as S.now - S.hurtAt against TUNE.REGEN_DELAY_S, and S.now is ctx.time,
  // which no test may move. So the shift lands on hurtAt, which is the same arithmetic on the
  // other side of the subtraction, and leaves the cooldown alone deliberately - the swing
  // cooldown is already a countdown a test can wait out in a third of a second, while the
  // regen delay is six sim seconds and on this host that is twenty wall seconds a test would
  // otherwise have to spend. It moves a clock and returns: the healing itself still happens
  // in regen(), on a real tick, capped at TUNE.HP_MAX, so this can bring regeneration FORWARD
  // and can never invent a point of HP of its own. Nothing in the Place calls it.
  function debugAdvance(seconds) {
    const s = Number(seconds);
    if (!Number.isFinite(s) || s <= 0) return;
    S.hurtAt -= s;
    S.cd = Math.max(0, S.cd - s);
  }

  // -----------------------------------------------------------------------------------
  // Small helpers that need the closure
  // -----------------------------------------------------------------------------------

  // One wrapper, named the way battles names its own, because audio is optional at every
  // call site: playSfx is a silent no-op before the AudioContext exists and drops the 17th
  // concurrent voice, and a thrown sound must never be able to halt `update`.
  //
  // This module uses exactly three names, and all three are in spec 02's closed 25-name
  // registry: `whoosh` for the swing, `oof` for a connect and for being hit, and `boing`
  // for a Warden's plating (§8, §16.6). There is no sword, axe or gunshot recipe to reach
  // for, so weight is pitch and volume and nothing else. Worth writing down: a direct
  // `playSfx("boing")` call site is reported by rule 04:V7 as outside the registry although
  // it is inside it, because validate's extractObjectKeys drops the first entry after a
  // comment line in SFX_NAMES and audio.js has one above `boing` and one above `jump`. The
  // wrapper is the house shape anyway, and no name below is reached for on a guess.
  function sfx(name, opts) {
    try { ctx.engine.audio.playSfx(name, opts); } catch { /* audio is optional, always */ }
  }

  function shake(intensity, durationS) {
    try { ctx.engine.camera.shake(intensity, durationS); } catch { /* fine */ }
  }

  return {
    update,
    swing,
    giveWeapon,
    dropWeapon,
    // The FIST row when your hands are empty, so nothing downstream has to decide what an
    // unarmed swing does. It carries `fist: true`, and that is what game.js tests to publish
    // `wp: null` rather than the id "fist": §5.5's `wp` is a weapon somebody found, and
    // fists are not one.
    heldWeapon: held,
    setSkin,
    // Ceil rather than round or floor, so a fighter on 0.4 HP publishes 1 and reads as alive,
    // which they are: the death latch is the internal value reaching zero, and a display that
    // rounded it to 0 would have peers dropping a living fighter from their alive set and
    // handing somebody a false win by last standing.
    hp: () => Math.ceil(clamp(S.hpNow, 0, TUNE.HP_MAX)),
    // Damage announced against PLAYERS this round, and deliberately not against Wardens. The
    // `dd` it feeds is the cap-expiry tiebreak between fighters (§4.2), and counting drum
    // damage would turn a stalemate between two people into a contest over which of them
    // farmed a prop harder.
    damageDealt: () => Math.round(S.dd),
    applyIncoming,
    takeWardenHit,
    resetForRound,
    untouched: () => S.clean,
    syncPeerProps,
    debugAdvance,
    dispose,
  };
}

// =====================================================================================
// Module-scope helpers. Pure, so they hold nothing that could survive a dispose.
// =====================================================================================

function readSelfId(ctx) {
  try {
    const self = ctx.services.net.self();
    return (self && self.id) || "local";
  } catch {
    return "local";
  }
}

