// src/games/showdown/scripts/round.js - Showdown's round state machine and its peer model.
// Spec 25 §4 (the four phases and both `fight` transitions), §5 (self-sovereign facts, the
// lowest-id conductor, staleness, the published blob) and §6 (the vote, and how the ground is
// resolved). This is the heart of the Place: every other module asks it what time it is.
//
// What it deliberately does NOT do. It writes nothing to the world - no parts, no teleport, no
// checkpoint, no lighting - it awards nothing, it saves nothing, and it never touches the DOM.
// game.js does all of that from the onPhase and onWin callbacks, which fire SYNCHRONOUSLY
// inside the edge that caused them, so §4.1's order (checkpoint, then teleport, then full HP,
// then the axe) still runs before the new phase is visible to anything that could kill you -
// which is exactly what §11.3 requires for an obby player auto-joined at 1 s of clock left.
//
// It is also the only module that calls net.publish, and it never calls net.send, net.join,
// net.leave, net.update or net.dispose: the wire is closed and `publish` is all of it (§5).
//
// Every piece of state lives in the closure `create` returns, so a second create after a
// dispose starts clean and nothing mutable survives the Place. There is nothing to
// unsubscribe either: this module registers no ctx.events, input or net listener at all.
//
// House rules for this file (§17.1): sim time only - ctx.time and dt, because there is no wall
// clock and no timer API a Place may touch - no banned identifier anywhere including inside a
// string, and every number imported from TUNE rather than written out a second time.

import { MAPS, TUNE, mapById } from "./config.js";

// The four phases of §4 as values rather than strings scattered through the file, because they
// are also what a conductor's `ph` is compared against and what debugSkipTo takes.
const PHASE_BOOT = "boot";
const PHASE_INTERMISSION = "intermission";
const PHASE_FIGHT = "fight";
const PHASE_RESULT = "result";

// The ground ids in MAPS order. §6.2's tie breaks to the LOWEST MAPS index and §6.3's quiet
// room rotates `roundIndex % MAPS.length`, so both rules read this array and nothing in this
// file hard-codes "forest" as a default.
const MAP_IDS = Object.freeze(MAPS.map((m) => m.id));

// The cap-expiry settle can never be shorter than five publish slots, or a hit landing in the
// last fraction of a second decides nothing and two clients each score the same round (§4.2,
// which config.js's RESULT_SETTLE_S comment states from the other side).
const SETTLE_S = Math.max(TUNE.RESULT_SETTLE_S, 5 * TUNE.PUBLISH_MIN_S);

// The longest id that may ride the wire. Peer ids are six base36 characters (the relay stamps
// `(nextId++).toString(36).padStart(6, "0")`) and the longest row ids in config.js are
// `galaxyspire` and `galaxydrift` at eleven, so 24 is slack rather than a limit: it is here so
// a sibling's bug cannot grow the blob. Worst case the published object is about 230 bytes of
// JSON, well inside the 4096-byte message cap.
const ID_MAX = 24;

// A conductor publishes its `t` rounded to a WHOLE second (§5.5), so up to half a second of
// disagreement with it IS that rounding and not drift. Chasing it is not harmless: the
// conductor's clock is quantized the same way, so a follower that slews toward every rounding
// step spends longer on the ticks where the step points backwards than on the ticks where it
// points forwards, and a measured 40 s intermission came out at 44.7 s. So the deadband is the
// rounding itself, and only the error BEYOND it is ever slewed away.
const CLOCK_DEADBAND_S = 0.5;

function isPhase(p) {
  return p === PHASE_BOOT || p === PHASE_INTERMISSION || p === PHASE_FIGHT || p === PHASE_RESULT;
}

function emptyVotes() {
  const out = {};
  for (const id of MAP_IDS) out[id] = 0;
  return out;
}

function idOrNull(v) {
  return typeof v === "string" && v && v.length <= ID_MAX ? v : null;
}

function intIn(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

// =====================================================================================
// create(ctx, save) -> Round
// =====================================================================================

export function create(ctx, save) {
  // §5.1: the Place has ONE identity, and everything below reads this one variable - every
  // comparison, every sort, every published `hit.to` and `ki.by`, every rank. Offline it is
  // "local", which sorts lowest, so debugState().conductor === "local" and isConductor is
  // true. It is a value and not a branch: no rule below asks whether a server exists.
  //
  // DEVIATION FROM §5.1's LITERAL `const`, flagged rather than hidden, because the literal
  // form cannot work online at all. shell.js calls net.join(slug) and then builds the ctx and
  // calls init(ctx) SYNCHRONOUSLY; net.js assigns `selfId` only inside its `welcome` handler,
  // which arrives a network round trip later - so at create() time net.self().id is null on
  // EVERY client, online included, and a `const` would freeze the literal "local" into a
  // populated room for good. §5.5 would then be unimplementable: an attacker publishes
  // `hit.to` = the victim's real relay id, the victim compares it against "local" and drops
  // it, so nobody could be hit, killed or credited and every round would run to the 240 s cap;
  // "local" also sorts below every base36 relay id, so every client would believe itself the
  // conductor, and every client would take the same spawns[] index. net.js nulls `selfId`
  // again on a socket close and the next `welcome` hands out a NEW id, so a reconnect has to
  // be picked up too or our own hits would be addressed to a name nobody answers to any more.
  //
  // So the identity is READ LIVE - once per tick, at the top of update, and nowhere else -
  // and the substitution §5.1 describes is what a client keeps for as long as it has no relay
  // id, which offline (the default in every dev checkout and every smoke run) is forever.
  let SELF_ID = readSelfId() || "local";

  // net.self() is a service call and this now runs every tick: a throw out of update sets
  // updateHalted and kills the Place for the session, so a missing or broken net service
  // degrades to "keep the id we have" rather than taking the Place with it.
  function readSelfId() {
    try {
      const self = ctx.services.net.self();
      return self && typeof self.id === "string" && self.id && self.id.length <= ID_MAX
        ? self.id : null;
    } catch {
      return null;
    }
  }

  // The two sets that are FROZEN for the life of a round carry our own id in them, so a
  // `welcome` that lands mid-round would otherwise cost us our rank (§4.1 step 3's
  // spawns[rank]) and our place in the cap-expiry comparison (§4.2) - we would not be a
  // candidate for a round we were alive in. Both are re-sorted after the substitution,
  // because every other client computes the same set from the published ids and sorts it the
  // same way.
  function renameSelf(from, to) {
    for (const set of [S.roundFighters, S.capAlive]) {
      const i = set.indexOf(from);
      if (i < 0) continue;
      set[i] = to;
      set.sort();
    }
  }

  function refreshSelfId() {
    const id = readSelfId();
    if (!id || id === SELF_ID) return;   // no relay id yet, or the one we already answer to
    const was = SELF_ID;
    SELF_ID = id;
    renameSelf(was, id);
    // The wire has to learn the new address on this tick rather than at the next throttle
    // slot, or a hit aimed at us is dropped for up to PUBLISH_MIN_S after the handover.
    arm(ctx.time);
  }

  const S = {
    phase: PHASE_BOOT,
    prevPhase: PHASE_BOOT,
    clock: 0,

    // §5.3: a client may not conduct until its boot tick has looked at the room and taken a
    // phase from it. `sitOut` is the other half - a phase you were snapped or adopted into is
    // a round you watch, not one you fight, until the next intermission.
    adopted: false,
    sitOut: false,

    joined: true,   // jn, and 1 is the default (§5.5)
    alive: false,   // al, only ever true for a living fighter inside `fight`
    dead: false,
    vote: null,

    roundIndex: 0,
    roundMapId: null,
    nextMapId: null,
    resolved: false,

    sawOpponent: false,
    scored: false,
    winner: null,

    fighterIds: [],      // the live fighter set, recomputed every tick for the HUD
    roundFighters: [],   // the set FROZEN at the intermission -> fight edge (§4.1 step 1)
    fightersAtStart: 0,
    capAlive: [],        // who was alive at the cap, snapshotted for the settle (§4.2)

    dd: 0,
    capExpired: false,
    settle: -1,
    driftFor: 0,

    aliveIds: [],
    peerIds: [],
    votes: emptyVotes(),
    voteOpen: false,
    conductor: null,
    isConductor: false,

    // The wire side. `selfHp` and the cosmetic fields are not ours: they arrive on
    // publishState's `extra` and are remembered here, so a keepalive publish needs no `extra`
    // at all and cannot accidentally carry a one-shot `hit` a second time.
    selfHp: TUNE.HP_MAX,
    liveMapId: null,
    weapon: null,
    skin: null,
    obbyStage: intIn(save && save.obbyStage, 0, TUNE.OBBY_FIRST_CLEAR_OOFBUX.length),
    lifetimeWins: intIn(save && save.lifetimeWins, 0, 1e9),

    seq: 0,
    pendHit: null,
    pendKi: null,
    lastPublishAt: -1e9,
    forcePublish: true,
    armedAt: -1e9,

    phaseSubs: new Set(),
    winSubs: new Set(),
    debugTarget: null,
    facts: null,
    disposed: false,
  };

  // ---- callbacks ---------------------------------------------------------------------
  // A throwing subscriber must never abort the machine that notified it, which is the same
  // contract the platform emitter keeps (spec 04 §5.1). The set is copied first so a handler
  // that unsubscribes during the fire does not skip its neighbour.
  function fire(subs, a, b, c) {
    for (const fn of [...subs]) {
      try {
        fn(a, b, c);
      } catch (err) {
        console.error("[oof] showdown round listener error", err);
      }
    }
  }

  // Forced on a phase change, a vote, a hit, a death, a win and the cap-expiry settle (§5.5).
  // `armedAt` records WHEN, so update() can tell a flag raised on this tick - which game.js's
  // own publishState call later in the same tick consumes, with fresh hp - from one raised on
  // an earlier tick that nothing consumed.
  function arm(now) {
    S.forcePublish = true;
    S.armedAt = Number.isFinite(now) ? now : ctx.time;
  }

  // ---- peers -------------------------------------------------------------------------
  // PeerView in, a trimmed row out. A `state` is only usable when it carries our schema
  // version; anything else counts as al:0 / jn:0 / no vote, exactly like a stale peer.
  //
  // §5.3: STALENESS IS THE PLACE'S JOB. peer.at is stamped from net.js's own private sim
  // accumulator, which ctx.services.net does not expose, and ctx.time is per-Place and shares
  // no origin with it - so game.js remembers ctx.time on every tick a peer's state JSON
  // changed and hands it here as lastChangeAt. When a caller gives us `stale` we take it; when
  // it gives us only lastChangeAt we derive it the same way, rather than letting a missing
  // field mean "fresh". net.js evicts on its own only at 15 s and only while a socket is open,
  // so without this window the roster freezes with peers still published as al:1, hp:100 the
  // moment YOUR socket drops: no round could resolve by last standing and every cap expiry
  // would be won by a ghost on full HP.
  function readPeers(now, peers) {
    const out = [];
    if (!Array.isArray(peers)) return out;
    for (const p of peers) {
      if (!p || typeof p.id !== "string" || !p.id || p.id === SELF_ID) continue;
      const st = p.state && typeof p.state === "object" && p.state.v === TUNE.STATE_V ? p.state : null;
      const at = Number.isFinite(p.lastChangeAt) ? p.lastChangeAt : now;
      let stale = p.stale === true || !st;
      if (!stale && Number.isFinite(p.lastChangeAt)) stale = now - at > TUNE.PEER_STALE_S;
      out.push({ id: p.id, st, at, stale });
    }
    return out;
  }

  // §5.3: the candidate set is YOURSELF plus every peer publishing our schema version, so it
  // is never empty and a null self().id (which sorts lowest as "local") cannot make the rule
  // vacuous. The lexicographically lowest id conducts. A conductor staler than
  // CONDUCTOR_STALE_S is skipped and the next-lowest takes over, which is why handover needs
  // no message and why a vanishing conductor is not a special case. A client that has not
  // adopted a phase may not conduct (§5.3 step 2), or a fresh joiner whose id sorts lowest
  // would publish ph "intermission" and drag a live round back into the lobby.
  function pickConductor(now, views) {
    let best = null;
    for (const v of views) {
      if (v.stale) continue;
      if (now - v.at > TUNE.CONDUCTOR_STALE_S) continue;
      if (best === null || v.id < best) best = v.id;
    }
    if (S.adopted && (best === null || SELF_ID < best)) return SELF_ID;
    return best;
  }

  // ---- the facts ---------------------------------------------------------------------
  // Rebuilt at the end of every update AND immediately before an onPhase or onWin callback
  // fires, so a handler that reads facts() from inside the edge that woke it sees the phase it
  // was just told about rather than the previous tick's snapshot. game.js's §4.1 step 3 runs
  // from exactly there, and it needs facts().mapId to be the ground it is teleporting into.
  function buildFacts() {
    S.facts = {
      phase: S.phase,
      clock: Math.max(0, S.clock),
      voteOpen: S.phase === PHASE_INTERMISSION && S.voteOpen,
      votes: S.votes,
      roundIndex: S.roundIndex,
      // mapId is the ground of the round you are IN; nextMapId is the ground the coming round
      // will be fought on, which is what game.js materializes from BUILD_START_S.
      mapId: S.roundMapId,
      nextMapId: S.nextMapId,
      alive: S.aliveIds.slice(),
      fighters: S.fighterIds.slice(),
      fightersAtStart: S.fightersAtStart,
      sawOpponent: S.sawOpponent,
      scored: S.scored,
      winner: S.winner,
      conductor: S.conductor,
      isConductor: S.isConductor,
    };
    return S.facts;
  }

  // ---- phase plumbing ----------------------------------------------------------------
  function setPhase(next, clock, snapped) {
    const prev = S.phase;
    S.phase = next;
    S.prevPhase = prev;
    S.clock = Math.max(0, clock);
    S.driftFor = 0;
    if (snapped) {
      // A phase you did not walk into is a round you sit out (§5.3 step 1): no HP, no vote,
      // al:0 and jn:0 until the next intermission. One uniform rule covers both the boot
      // adoption and a later snap, so a mid-round joiner can never turn up as a fighter.
      S.sitOut = true;
      S.joined = false;
      S.alive = false;
    }
    arm(ctx.time);
    buildFacts();
    fire(S.phaseSubs, next, prev);
  }

  function toIntermission(clock) {
    // Round-scoped state is cleared here as well as at the fight edge, so a snap into
    // intermission from anywhere leaves nothing of the last round standing in this module.
    S.sitOut = false;
    S.joined = true;
    S.alive = false;
    S.dead = false;
    S.vote = null;
    S.roundMapId = null;
    S.nextMapId = null;
    S.resolved = false;
    S.winner = null;
    S.scored = false;
    S.sawOpponent = false;
    S.capExpired = false;
    S.settle = -1;
    S.capAlive = [];
    S.roundFighters = [];
    S.fightersAtStart = 0;
    S.dd = 0;
    const t = Number.isFinite(clock) ? Math.min(clock, TUNE.INTERMISSION_S) : TUNE.INTERMISSION_S;
    setPhase(PHASE_INTERMISSION, t, false);
  }

  function toResult(clock) {
    // al goes to 0 the instant the fight is over: in `result` nobody is a living fighter, and
    // a peer still publishing al:1 here would sit in somebody's alive set into the next round.
    S.alive = false;
    const t = Number.isFinite(clock) ? Math.min(clock, TUNE.RESULT_S) : TUNE.RESULT_S;
    setPhase(PHASE_RESULT, t, false);
  }

  function snapTo(ph, t) {
    const clock = Number.isFinite(t) ? Math.max(0, t) : 0;
    if (ph === PHASE_INTERMISSION) {
      toIntermission(clock);
      return;
    }
    if (ph === PHASE_FIGHT) {
      S.dd = 0;
      S.sawOpponent = false;
      S.scored = false;
      S.winner = null;
      S.capExpired = false;
      S.settle = -1;
      S.capAlive = [];
      S.dead = false;
      setPhase(PHASE_FIGHT, Math.min(clock, TUNE.ROUND_CAP_S), true);
      return;
    }
    setPhase(PHASE_RESULT, Math.min(clock, TUNE.RESULT_S), true);
  }

  // ---- boot (§4 phase 0, §5.3 step 1) ------------------------------------------------
  // One tick, whose whole job is to look at the room BEFORE declaring a phase. If any
  // non-stale peer is mid-round we adopt its phase and clock and sit that round out; if
  // nobody is, we open our own intermission, which is not "dragging a live round back"
  // because there is no live round to drag. Either way `adopted` is true afterwards and this
  // client may conduct from the next tick.
  function bootTick(views) {
    let live = null;
    for (const v of views) {
      if (v.stale) continue;
      const ph = v.st.ph;
      if (ph !== PHASE_FIGHT && ph !== PHASE_RESULT) continue;
      if (live === null || v.id < live.id) live = v;
    }
    S.adopted = true;
    if (!live) {
      toIntermission(TUNE.INTERMISSION_S);
      return;
    }
    const rn = Number(live.st.rn);
    if (Number.isFinite(rn) && rn > S.roundIndex) S.roundIndex = Math.floor(rn);
    // The ground the room is already standing on, so facts.mapId tells game.js the truth about
    // a round this client is only watching (§6: every follower takes the conductor's `mp`).
    // Whether a watcher builds it is game.js's call, not ours.
    const mp = idOrNull(live.st.mp);
    if (mp && mapById(mp)) S.roundMapId = mp;
    snapTo(live.st.ph, Number(live.st.t));
  }

  // ---- following the conductor (§5.3 steps 3 and 4) ----------------------------------
  // Adoption is separate from slewing. On boot every client is in intermission with a fresh
  // 40 s clock, which is never within CLOCK_TOLERANCE_S of a fight at t = 132, so a tolerance
  // rule on its own only ever accepts a conductor that already agrees and the one case that
  // needs correcting could never resynchronize. So: a different `ph` snaps at once, and drift
  // past the tolerance held for RESYNC_AFTER_S snaps too.
  function followConductor(step, view) {
    const st = view.st;
    const rn = Number(st.rn);
    // The conductor's round index is the shared one (§5.5, §6.3), taken forward only, so a
    // conductor that restarts at 0 cannot walk our monotonic `rn` backwards.
    if (Number.isFinite(rn) && rn > S.roundIndex) S.roundIndex = Math.floor(rn);
    const ph = typeof st.ph === "string" ? st.ph : null;
    const t = Number(st.t);
    if (!ph || !isPhase(ph) || ph === PHASE_BOOT || !Number.isFinite(t)) return;
    if (ph !== S.phase) {
      snapTo(ph, t);
      return;
    }
    const err = t - S.clock;
    if (Math.abs(err) <= TUNE.CLOCK_TOLERANCE_S) {
      S.driftFor = 0;
      // Slew rather than snap inside the tolerance: snapping would jerk the local clock every
      // time the conductor's whole-second rounding flipped and the HUD countdown would stutter.
      // Only the error outside CLOCK_DEADBAND_S is real, and it is removed over about one
      // second, which is the conductor's own publish granularity - so no tuning number is
      // invented here either.
      const excess = err > CLOCK_DEADBAND_S ? err - CLOCK_DEADBAND_S
        : err < -CLOCK_DEADBAND_S ? err + CLOCK_DEADBAND_S : 0;
      if (excess !== 0) S.clock = Math.max(0, S.clock + excess * Math.min(1, step));
      return;
    }
    S.driftFor += step;
    if (S.driftFor >= TUNE.RESYNC_AFTER_S) snapTo(ph, t);
  }

  // ---- the vote (§6) -----------------------------------------------------------------
  // The tally a client shows is its own vote plus every NON-STALE peer's published `vt`, and
  // nothing else. A stale peer, a peer on another schema version and a peer sitting a round
  // out all publish no vote and are counted as none.
  function tallyVotes(views) {
    const out = emptyVotes();
    if (S.vote !== null && out[S.vote] !== undefined) out[S.vote] += 1;
    for (const v of views) {
      if (v.stale) continue;
      const vt = v.st.vt;
      if (typeof vt === "string" && out[vt] !== undefined) out[vt] += 1;
    }
    return out;
  }

  // At t = 20 s the vote closes and the ground is resolved. Highest tally wins; a tie breaks
  // to the lowest MAPS index, FULL STOP, with no conductor term - the conductor is recomputed
  // every tick from the roster, so "the conductor's own vote" could differ per client at the
  // instant the window shut, and the conductor may not have voted at all. With no votes cast
  // anywhere the ground is MAPS[roundIndex % MAPS.length], and `roundIndex` is the conductor's
  // published `rn`, never a per-client rotation counter that a joiner, a STAY-in-obby player
  // and a skipped round do not share. A quiet room still sees all three grounds.
  function resolveGround(views, cview) {
    const tally = tallyVotes(views);
    let best = null;
    let bestN = -1;
    for (const id of MAP_IDS) {
      const n = tally[id] || 0;
      if (n > bestN) {   // strictly greater, so the first and therefore lowest index keeps a tie
        bestN = n;
        best = id;
      }
    }
    if (bestN <= 0) best = MAP_IDS[Math.abs(S.roundIndex) % MAP_IDS.length];
    // If the conductor has already committed to a ground, that is the ground: the three sit in
    // different origin bands, so two clients on two grounds could never connect a hit and each
    // would fight alone believing the round was shared.
    const mp = cview ? idOrNull(cview.st.mp) : null;
    if (mp && mapById(mp)) best = mp;
    S.nextMapId = best;
    S.resolved = true;
  }

  // ---- the fighter set (§4.1 step 1) -------------------------------------------------
  // Yourself if you are joining, plus every non-stale peer publishing jn:1, sorted
  // lexicographically so every client computes the identical order from published data.
  function fighterSet(views) {
    const out = [];
    if (S.joined && !S.sitOut) out.push(SELF_ID);
    for (const v of views) {
      if (v.stale) continue;
      if (v.st.jn === 1) out.push(v.id);
    }
    out.sort();
    return out;
  }

  // ---- intermission -> fight (§4.1) --------------------------------------------------
  function toFight(views, cview) {
    const fighters = fighterSet(views);

    // Step 2: every client in the room chose STAY IN OBBY. An 1800-part ground is not built
    // for nobody and a 240 s fight with no fighters in it is not run, so the fight is skipped
    // and intermission re-runs. onPhase fires with intermission on both sides, which is what
    // makes game.js release the ground it had already started building. `roundIndex` is
    // deliberately NOT bumped: §4.1 puts that in step 4, after this early return, and a round
    // nobody fought is not a round the room has to agree on.
    if (fighters.length === 0) {
      toIntermission(TUNE.INTERMISSION_S);
      return;
    }

    // Step 3's ground. A client whose resolved map differs from the non-stale conductor's
    // published `mp` takes the conductor's, and game.js releases and re-materializes (§6, last
    // paragraph); without that the divergence is invisible and fatal.
    let mapId = S.nextMapId;
    const mp = cview ? idOrNull(cview.st.mp) : null;
    if (mp && mapById(mp)) mapId = mp;
    if (!mapId || !mapById(mapId)) mapId = MAP_IDS[Math.abs(S.roundIndex) % MAP_IDS.length];

    S.roundMapId = mapId;
    S.nextMapId = null;
    S.resolved = false;
    S.roundFighters = fighters.slice();
    S.fightersAtStart = fighters.length;
    S.capAlive = [];

    // Step 4, and the two latches of §4.2. `sawOpponent` false means a solo round cannot be
    // won on tick one - without it, whenever you are the only fighter (offline, or a room
    // where everybody else stayed in the obby) the round was won at zero risk and ROUND_CAP_S,
    // every WARDEN_* row and the whole of §9 were dead content. `scored` false means the award
    // block may run once more, and once only.
    S.sawOpponent = false;
    S.scored = false;
    S.winner = null;
    S.dd = 0;
    S.capExpired = false;
    S.settle = -1;
    S.dead = false;
    S.alive = S.joined && !S.sitOut;
    S.roundIndex += 1;

    setPhase(PHASE_FIGHT, TUNE.ROUND_CAP_S, false);
  }

  // ---- intermission ------------------------------------------------------------------
  function intermissionTick(views, cview) {
    const elapsed = TUNE.INTERMISSION_S - S.clock;
    // The window is shut for a client sitting the round out: it has no vote to cast, and a HUD
    // control offered to it would be a lie.
    S.voteOpen = !S.sitOut && S.clock > 0 && elapsed < TUNE.VOTE_WINDOW_S;
    if (!S.resolved && elapsed >= TUNE.BUILD_START_S) resolveGround(views, cview);
    if (S.clock <= 0) toFight(views, cview);
  }

  // ---- fight (§4.2) ------------------------------------------------------------------
  function aliveSet(views) {
    const out = [];
    if (S.alive && !S.dead) out.push(SELF_ID);
    for (const v of views) {
      if (v.stale) continue;   // a stale peer is excluded from the alive set, always
      if (v.st.al === 1) out.push(v.id);
    }
    out.sort();
    return out;
  }

  function declareWin(byLastStanding, clockLeft) {
    S.winner = SELF_ID;
    // `scored` is set BEFORE the callback runs, so an award block that throws cannot let the
    // predicate fire again on the next tick. The predicate is per-tick and would otherwise
    // stay true for the rest of `fight` and all 8 s of `result`: roughly 480 Fighting Points
    // and 480 lifetime wins for one round, which is enough to hand out both unlocks.
    S.scored = true;
    arm(ctx.time);
    buildFacts();
    fire(S.winSubs, S.roundMapId, Math.max(0, clockLeft), !!byLastStanding);
  }

  function fightTick(step, views) {
    const alive = aliveSet(views);
    S.aliveIds = alive;
    // The latch: some tick since `fight` began saw two or more in the alive set. Set once,
    // never cleared inside a round, and it does not test the roster size or ask whether a
    // relay exists - that is the forbidden branch on the server existing (ARCHITECTURE §9.2).
    if (alive.length >= 2) S.sawOpponent = true;

    if (!S.winner && !S.scored) {
      // The alive set emptying for ANY reason - two simultaneous deaths, every remaining
      // fighter leaving the room, every remaining fighter going stale - ends the fight
      // immediately, with no winner and nothing awarded. Without this a dead player whose
      // opponents closed their tabs sits in a fight with no fighters in it until the cap.
      if (alive.length === 0) {
        toResult(TUNE.RESULT_S);
        return;
      }
      if (alive.length === 1 && alive[0] === SELF_ID && S.sawOpponent) {
        declareWin(true, S.clock);
        toResult(TUNE.RESULT_S);
        return;
      }
    }

    // Cap expiry, tested last so a last-standing win on the very tick the clock runs out is
    // the win it looks like - and can still score §13.3's photo-finish, which a cap win never
    // does, because a cap always finishes at zero. Every client force-publishes its final hp
    // and dd here; the winner is computed SETTLE_S into `result` from what those publishes
    // carried, among the ids that were alive at this instant.
    if (S.clock <= 0 && !S.capExpired) {
      S.capExpired = true;
      S.capAlive = alive.slice();
      S.settle = SETTLE_S;
      arm(ctx.time);
      toResult(TUNE.RESULT_S);
    }
  }

  // ---- result, and the cap-expiry settle (§4.2) --------------------------------------
  // Among the fighters that were alive at the cap and are still non-stale, highest hp wins; a
  // tie breaks on damage dealt this round, and a remaining tie on the lowest id. Exactly one
  // alive at cap expiry is the same rule with one candidate. Said plainly, because it is real:
  // publishing is throttled to 0.2 s and the relay adds latency, so a hit landing in the last
  // fraction of a second is in some clients' views and not others', and two clients can each
  // believe they had the highest HP and each score a point for the same round. The settle
  // window is what bounds that, and `dd` is what stops the same lowest-id player winning every
  // full-HP stalemate.
  function settleCap(views) {
    if (S.winner || S.scored) return;
    const cands = [];
    if (S.capAlive.indexOf(SELF_ID) >= 0 && !S.dead) {
      cands.push({ id: SELF_ID, hp: S.selfHp, dd: S.dd });
    }
    for (const v of views) {
      if (v.stale) continue;
      if (S.capAlive.indexOf(v.id) < 0) continue;
      cands.push({ id: v.id, hp: intIn(v.st.hp, 0, TUNE.HP_MAX), dd: intIn(v.st.dd, 0, 1e9) });
    }
    if (cands.length === 0) return;   // everybody left or went stale: no winner, nothing awarded
    cands.sort((a, b) => (b.hp - a.hp) || (b.dd - a.dd) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const top = cands[0];
    S.winner = top.id;
    arm(ctx.time);
    // A win is scored only by the winner, about itself (§5.2). A peer's id in `winner` is for
    // the HUD's "so-and-so took the round" line and nothing else.
    if (top.id === SELF_ID) {
      S.scored = true;
      buildFacts();
      fire(S.winSubs, S.roundMapId, 0, false);
    }
  }

  function resultTick(step, views) {
    if (S.capExpired && S.settle >= 0) {
      S.settle -= step;
      if (S.settle <= 0) {
        S.settle = -1;
        settleCap(views);
      }
    }
    if (S.clock <= 0) {
      // A test seam that skipped most of `result` must not skip the settle along with it.
      if (S.capExpired && S.settle >= 0) {
        S.settle = -1;
        settleCap(views);
      }
      toIntermission(TUNE.INTERMISSION_S);
    }
  }

  // ---- the published blob (§5.5) -----------------------------------------------------
  // Only the keys the spec fixes, in the spec's order, with every value clamped: this object
  // is the entire wire surface of the Place, and a sibling's bug must not be able to grow it
  // past the message cap or put anything in it that ARCHITECTURE §9 forbids.
  function buildBlob() {
    return {
      v: TUNE.STATE_V,
      ph: S.phase,
      // Rounded to a WHOLE second, which is the other half of the keepalive: it makes a
      // follower's blob change about once a second rather than five times a second, and it is
      // why every client publishes a `ph` and `t` of which only the conductor's are read.
      t: Math.max(0, Math.round(S.clock)),
      mp: S.liveMapId,
      rn: S.roundIndex,
      vt: S.vote,
      hp: S.selfHp,
      al: S.alive && !S.dead ? 1 : 0,
      jn: S.joined && !S.sitOut ? 1 : 0,
      dd: S.dd,
      wp: S.weapon,
      sk: S.skin,
      ob: S.obbyStage,
      lw: S.lifetimeWins,
      hit: S.pendHit,
      ki: S.pendKi,
    };
  }

  // A hit is the one thing a sibling may hand us for the wire, and it is validated hard: an
  // integer sequence, damage inside 1..HP_MAX, a weapon id, and a `to` that is a REAL
  // non-stale peer this client can see. That last test is what keeps a prop off the wire - a
  // Warden is never a target id and never a killer id (§5.5, ARCHITECTURE §9).
  function sanitizeHit(h) {
    if (!h || typeof h !== "object") return null;
    const to = idOrNull(h.to);
    if (!to || to === SELF_ID || S.peerIds.indexOf(to) < 0) return null;
    const s = Number(h.s);
    const d = Number(h.d);
    if (!Number.isFinite(s) || s < 0 || !Number.isFinite(d) || d <= 0) return null;
    return { s: Math.floor(s), to, d: Math.min(TUNE.HP_MAX, Math.round(d)), w: idOrNull(h.w) };
  }

  // The fields round.js does not own arrive here. `ki` is NOT among them: declareDeath is the
  // only way a death reaches the wire, so no caller can name a Warden, an index or a void as a
  // killer even by accident.
  function absorbExtra(extra) {
    if (!extra || typeof extra !== "object") return;
    if ("hp" in extra) S.selfHp = intIn(extra.hp, 0, TUNE.HP_MAX);
    if ("mp" in extra) S.liveMapId = idOrNull(extra.mp);
    if ("wp" in extra) S.weapon = idOrNull(extra.wp);
    if ("sk" in extra) S.skin = idOrNull(extra.sk);
    if ("ob" in extra) S.obbyStage = intIn(extra.ob, 0, TUNE.OBBY_FIRST_CLEAR_OOFBUX.length);
    if ("lw" in extra) S.lifetimeWins = intIn(extra.lw, 0, 1e9);
    if (extra.hit) {
      const hit = sanitizeHit(extra.hit);
      if (hit) {
        S.pendHit = hit;
        arm(ctx.time);
      }
    }
  }

  // The single net.publish call site in the Place. Throttled to PUBLISH_MIN_S unless forced.
  function publishState(c, extra) {
    if (S.disposed) return;
    const cx = c && c.services ? c : ctx;
    const now = Number.isFinite(cx.time) ? cx.time : ctx.time;
    absorbExtra(extra);
    const since = now - S.lastPublishAt;
    const forced = S.forcePublish || since >= TUNE.KEEPALIVE_S;
    if (!forced && since < TUNE.PUBLISH_MIN_S) return;
    const carried = S.pendHit !== null || S.pendKi !== null;
    const blob = buildBlob();
    S.lastPublishAt = now;
    S.forcePublish = false;
    if (carried) {
      // §5.5: `hit` and `ki` are one-shot and MUST be cleared. The relay caches the last
      // published blob per connection and hands it to every new joiner inside the welcome, and
      // publish only sends on change - so a hit left sitting in the blob is applied by a
      // reloading or late-joining player at full HP, and a hit published at the end of round N
      // is applied again after resetForRound in round N+1. They are nulled now and the next
      // publish is forced, so the blob the relay ends up caching carries nulls.
      S.pendHit = null;
      S.pendKi = null;
      arm(now);
    }
    cx.services.net.publish(blob);
  }

  // =====================================================================================
  // update - once per tick, never re-entrant
  // =====================================================================================
  function update(dt, c, peers) {
    if (S.disposed) return S.facts;
    const cx = c && c.services ? c : ctx;
    const now = Number.isFinite(cx.time) ? cx.time : 0;
    // dt is 1/60 from the shell, but the clamp costs nothing and stops one long frame from
    // stepping a whole phase.
    const step = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;

    // Before anything reads an id this tick: a relay `welcome` (or a reconnect's second
    // welcome) can have handed this client its real id since the last tick, and readPeers
    // below filters our own row out of the roster by that id.
    refreshSelfId();

    const views = readPeers(now, peers);
    S.peerIds = views.map((v) => v.id);

    // The boot tick spends itself adopting a phase and does not also spend a clock: §4 phase 0
    // is one tick long and `intermission` opens on a full 40 s. The conductor is picked AFTER
    // it, so the phase this client just adopted is the phase it is judged on, and the phase
    // body below runs in the same tick as the adoption - the facts a caller reads after its
    // first update are coherent rather than a phase with last phase's votes attached.
    if (S.phase === PHASE_BOOT) bootTick(views);
    else S.clock = Math.max(0, S.clock - step);

    const conductor = pickConductor(now, views);
    S.conductor = conductor;
    S.isConductor = conductor === SELF_ID;
    // No conductor at all - offline, or every candidate stale - runs its own clock, which is
    // the same code path with a candidate set of one.
    const cview = conductor && conductor !== SELF_ID ? views.find((v) => v.id === conductor) : null;
    if (cview) followConductor(step, cview);

    if (S.phase === PHASE_INTERMISSION) intermissionTick(views, cview);
    else if (S.phase === PHASE_FIGHT) fightTick(step, views);
    else if (S.phase === PHASE_RESULT) resultTick(step, views);

    // Recomputed after the phase body, so a fighter set and a tally that game.js reads off the
    // facts describe the phase it is actually in and not the one this tick started in.
    S.fighterIds = fighterSet(views);
    S.votes = tallyVotes(views);

    if (S.phase !== PHASE_INTERMISSION) S.voteOpen = false;
    // `result` is in this list beside `boot` and `intermission` because §4 phase 3 defines
    // NOBODY as a living fighter in it: toResult sets S.alive false and the blob carries al:0,
    // so a set left holding the last fight tick's ids would have hud.js's "👥 N alive" chip
    // claim a living fighter for all 8 s of `result` - a count shown to the player that is not
    // the true one, which ARCHITECTURE §9 forbids. Nothing reads the set in `result`: the cap
    // settle compares S.capAlive, which is snapshotted at the cap and is not this array.
    if (S.phase === PHASE_BOOT || S.phase === PHASE_INTERMISSION || S.phase === PHASE_RESULT) {
      S.aliveIds = [];
    }

    // The test seam of §17.2 walks the machine forward one phase per tick until it arrives.
    if (S.debugTarget) {
      if (S.phase === S.debugTarget) S.debugTarget = null;
      else S.clock = 0;
    }

    buildFacts();

    // The safety net for the one-shot clear and for the 5 s keepalive. game.js publishing once
    // per tick - the intended shape, with fresh hp - consumes the forced flag itself and makes
    // this a no-op, because a flag armed on THIS tick is left alone. A caller that skips a tick
    // still cannot leave a `hit` sitting in the relay's cached blob, and a client standing
    // still with nothing of its own changing still cannot be evicted as a disconnect by net.js
    // at its 15 s window and have somebody handed a false win with a real player still up.
    // It passes NO extra: every field a caller owns is already remembered on S, and handing the
    // previous `extra` object back in would re-absorb the one-shot `hit` it carried and land the
    // same hit a second time - which is the very failure §5.5 nulls those keys to prevent.
    if ((S.forcePublish && S.armedAt < now) || now - S.lastPublishAt >= TUNE.KEEPALIVE_S) {
      publishState(cx, null);
    }

    return S.facts;
  }

  // =====================================================================================
  // the rest of the Round surface
  // =====================================================================================

  function facts() {
    return S.facts;
  }

  // The plinths and the DOM buttons are the same code path (§6), because the obby is 600 studs
  // west and 260 studs up with no fast way back, and a plinth-only vote would silently cost a
  // player their vote every round they spent in it.
  function castVote(mapId) {
    if (S.disposed || !S.voteOpen) return false;
    if (!mapById(mapId)) return false;
    if (S.vote !== mapId) {
      S.vote = mapId;
      arm(ctx.time);
    }
    return true;
  }

  // JOIN ROUND, or the default on spawn. During a live fight this only sets jn:1, which other
  // clients read at their OWN next fight edge: a mid-round joiner is never a fighter in the
  // round already running (§5.3 step 1).
  function joinRound() {
    if (S.disposed || S.sitOut || S.joined) return;
    S.joined = true;
    arm(ctx.time);
  }

  // STAY IN OBBY, or a manual exit. Leaving a live fight drops you out of every client's alive
  // set, which is exactly what §4.2's "the alive set empties" rule is written for.
  function leaveRound() {
    if (S.disposed || (!S.joined && !S.alive)) return;
    S.joined = false;
    if (S.phase === PHASE_FIGHT) S.alive = false;
    arm(ctx.time);
  }

  // Your rank in the lexicographically sorted fighter set, which every client computes
  // identically from published data and which is 0 solo with no branch. game.js takes
  // spawns[rank % spawns.length], so this is what stops index 0 being everybody's spawn.
  function spawnIndex() {
    const set = (S.phase === PHASE_FIGHT || S.phase === PHASE_RESULT) && S.roundFighters.length
      ? S.roundFighters
      : S.fighterIds;
    const i = set.indexOf(SELF_ID);
    return i < 0 ? 0 : i;
  }

  // The DYING client calls this about ITSELF (§5.2): a death is never declared by another
  // client. `by` is a peer id only for a published player hit - it is null for a Warden lunge,
  // a void death and every other cause - and an id this client cannot see as a real non-stale
  // peer is nulled rather than published, because a prop reported as a killer is what
  // ARCHITECTURE §9 forbids and a peer reading ki.by === SELF_ID must never be credited a kill
  // nobody made.
  function declareDeath(byPeerId) {
    if (S.disposed || S.phase !== PHASE_FIGHT) return;
    if (!S.alive || S.dead) return;
    S.dead = true;
    S.alive = false;
    S.seq += 1;
    const raw = idOrNull(byPeerId);
    const by = raw && raw !== SELF_ID && S.peerIds.indexOf(raw) >= 0 ? raw : null;
    S.pendKi = { s: S.seq, by };
    arm(ctx.time);
  }

  // Feeds the published `dd`, which is the cap-expiry tiebreak and nothing else.
  function noteDamageDealt(amount) {
    if (S.disposed || S.phase !== PHASE_FIGHT) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return;
    S.dd = Math.min(999999, S.dd + Math.round(n));
  }

  // §9.6: with fightersAtStart === 1 and no opponent ever seen, breaking all three Rogue
  // Wardens wins the round the instant the third one goes - which is what makes the honest solo
  // round sixty to ninety seconds of engaged play instead of four minutes of survival, and the
  // cap a fallback rather than the design.
  //
  // DEVIATION, flagged rather than hidden: the MODULE CONTRACT hands this module no Warden
  // input at all - update(dt, ctx, peers) carries none, and wardens.js publishes nothing - so
  // the one rule §9.6 states could not otherwise be expressed here, and scoring it in game.js
  // instead would bypass the `scored` latch that stops one round paying 480 times. This is that
  // seam, and it is purely additive: a game.js that never calls it behaves exactly as before.
  function declareObjectiveWin() {
    if (S.disposed || S.phase !== PHASE_FIGHT) return;
    if (S.winner || S.scored) return;
    if (!S.alive || S.dead) return;                          // a dead fighter wins nothing
    if (S.fightersAtStart !== 1 || S.sawOpponent) return;     // solo rounds only, and honestly solo
    declareWin(false, S.clock);
    toResult(TUNE.RESULT_S);
  }

  function onPhase(fn) {
    if (typeof fn !== "function") return () => {};
    S.phaseSubs.add(fn);
    return () => S.phaseSubs.delete(fn);
  }

  function onWin(fn) {
    if (typeof fn !== "function") return () => {};
    S.winSubs.add(fn);
    return () => S.winSubs.delete(fn);
  }

  // ---- the test seam (§17.2) ---------------------------------------------------------
  // One full cycle of this Place is 40 + 240 + 8 = 288 sim seconds, which is 640-1150 wall
  // seconds on the SwiftShader host the smoke run uses: merely reaching `fight` once exceeds
  // the default scenario budget, and no scenario in the repo waits past 4.6 sim seconds. These
  // two set clocks and nothing else, nothing in the Place ever calls them, and neither name is
  // a banned identifier.
  function debugAdvance(seconds) {
    const s = Number(seconds);
    if (S.disposed || !Number.isFinite(s) || s <= 0) return;
    if (S.phase === PHASE_BOOT) return;
    S.clock = Math.max(0, S.clock - s);
    if (S.settle >= 0) S.settle = Math.max(0, S.settle - s);
  }

  // Drives the named phase's clock to its last tick: the current phase when that is the one
  // named, otherwise one phase per tick until the machine arrives there.
  function debugSkipTo(phase) {
    if (S.disposed || !isPhase(phase) || phase === PHASE_BOOT) return;
    S.clock = 0;
    S.debugTarget = phase === S.phase ? null : phase;
  }

  // Nothing to release but the callback sets: this module holds no part, no DOM node, no
  // texture and no listener. `disposed` is what makes a stray late call from a sibling inert
  // rather than a throw out of update, which would set updateHalted and kill the Place.
  function dispose() {
    S.phaseSubs.clear();
    S.winSubs.clear();
    S.pendHit = null;
    S.pendKi = null;
    S.debugTarget = null;
    S.disposed = true;
  }

  // The facts a caller sees before the first update: phase `boot`, a zero clock and a candidate
  // set of one. ctx.time is reassigned by the shell immediately before update, so the first
  // update sees 1/60 and never 0, and nothing here is allowed to depend on that either way.
  S.facts = {
    phase: PHASE_BOOT,
    clock: 0,
    voteOpen: false,
    votes: emptyVotes(),
    roundIndex: 0,
    mapId: null,
    nextMapId: null,
    alive: [],
    fighters: [],
    fightersAtStart: 0,
    sawOpponent: false,
    scored: false,
    winner: null,
    conductor: null,
    isConductor: false,
  };

  return {
    update,
    facts,
    castVote,
    joinRound,
    leaveRound,
    spawnIndex,
    declareDeath,
    noteDamageDealt,
    declareObjectiveWin,
    publishState,
    onPhase,
    onWin,
    debugAdvance,
    debugSkipTo,
    dispose,
    // Additive, and nothing is required to read it: it is here so no sibling has to reach for
    // net.self().id raw, which §5.1 says is this module's to own. A GETTER and not a snapshot
    // value, because the identity is now read live (see the top of create): a property copied
    // at create time would hand game.js the literal "local" for the whole session and its
    // `hit.to !== selfId` test at every incoming hit would discard every real hit in the room.
    get selfId() { return SELF_ID; },
  };
}
