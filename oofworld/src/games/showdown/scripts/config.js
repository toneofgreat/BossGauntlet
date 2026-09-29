// src/games/showdown/scripts/config.js - Showdown's frozen contract: every tuning
// number, the weapon catalogue, the three grounds, the six obby stages, the shop
// catalogues, the badge rows and the save shape. Spec 25 owns this file.
//
// Pure data plus a few pure helpers: it imports NOTHING, touches no ctx, no THREE, no
// DOM and no browser global, and it has no side effects at module scope. That is what
// lets tools/validate.js import() it under Node (rules 25:S2 / 25:S3) and what lets ten
// authors write ten sibling modules that agree with each other.
//
// House rules that apply to every line below (spec 25 §17.1):
//   - colours are lower-case hex, six digits, because the part schema rejects uppercase
//   - shapes come only from the 13 in spec 04, materials only from the 16
//   - sfx names only from the closed 25, music ids only from the closed 7
//   - the win counter is Fighting Points; the currency is Oofbux; nothing else
//   - deferred work is marked with the house // SLICE: prefix and nothing else

// =====================================================================================
// TUNE - every timing, cap, speed, damage, reach, cooldown and budget in the Place.
// Each line names the spec 25 section the number is quoted from. Nothing re-derives a
// number that lives here, and nothing here is computed from anything else.
// =====================================================================================

export const TUNE = Object.freeze({
  // --- round state machine (§4) -----------------------------------------------------
  ROUND_CAP_S: 240,          // §4 phase 2: the hard cap on a fight
  INTERMISSION_S: 40,        // §4 phase 1: lobby time between rounds
  VOTE_WINDOW_S: 20,         // §4/§6: voting is open for the first 20 s of intermission
  BUILD_START_S: 20,         // §3.4: seconds into intermission when the map starts building
  RESULT_S: 8,               // §4 phase 3: winner on screen, controls handed back
  RESULT_SETTLE_S: 1.5,      // §4.2: after the cap every client force-publishes its final
                             // hp/dd and the winner is computed this much later. Never below
                             // 5 * PUBLISH_MIN_S, or a hit landing in the last tick decides
                             // nothing and two clients each score the same round.
  OBBY_CHOICE_S: 5,          // §11.3: the stay-or-join countdown, auto-joins the round
  OBBY_PROMPT_AT_S: 34,      // §11.3: seconds INTO intermission the prompt latches, i.e. at
                             // OBBY_CHOICE_S + 1 = 6 s of clock left. It must be strictly under
                             // INTERMISSION_S - OBBY_CHOICE_S (rule 25:S4): at 35 the auto-join
                             // resolved on the same tick as the phase flip, so the join sequence
                             // could not run BEFORE `fight`, and an auto-joined player who died
                             // in the opening seconds respawned at their obby checkpoint as a
                             // living fighter 260 studs up and 1500 studs from the ground, where
                             // nobody could reach them - forcing every round to the cap, which
                             // their untouched 100 HP then won.
  OBBY_CHOICE_LEAD_S: 1,     // §11.3: the prompt resolves this many seconds BEFORE the flip
  DEATH_TO_SPECTATE_S: 1.5,  // §12.3: from your death to spectate mode arming
  WEAPON_RESPAWN_S: 25,      // §7.2: a taken ground weapon re-arms after this

  // Engine facts this Place must design around, not numbers it chooses (§12, §14).
  ENGINE_RESPAWN_S: 1.0,     // §12: the auto-respawn delay; it cannot be cancelled
  ENGINE_GRACE_S: 0.5,       // §12: the post-respawn damage grace the engine applies

  // --- fighter (§8) -----------------------------------------------------------------
  HP_MAX: 100,               // §8: full HP at every round start
  IFRAME_S: 0.35,            // §8: the victim's hit-again window, PER ATTACKER (a
                             // lastHitAt keyed by peer id), never one shared window: shared,
                             // three players landing hits inside 0.35 s deal one hit's worth
                             // between them and being outnumbered is mechanically SAFER than a
                             // duel, in a last-player-standing Place.
  REGEN_DELAY_S: 6,          // §8: seconds since the last damage TAKEN before regen starts
  REGEN_PER_S: 4,            // §8: HP per second back, capped at HP_MAX, applied by the
                             // victim to itself and visible through the published hp. Suspended
                             // by a Warden lunge as well as a player hit. Without it a 240 s cap
                             // and no healing anywhere means one bad corner at 0:30 is carried
                             // for three and a half minutes, and the last two survivors meet at
                             // whatever the Wardens left them.
  HIT_CONE_DOT: 0.5,         // §8: flat-plane facing dot a target must clear - a 120 deg
                             // cone, and a FLOOR that caps the widest rows. At 0.25 it was a
                             // 151 deg cone, wider than every arcDeg in this file plus the
                             // fist, so it could never reject a hit that arcDeg/2 accepted: a
                             // second gate that was dead weight dressed as a test. At 0.5 it
                             // bites starcenser (140), neonsign (130) and antlermaul (120).
  LONG_REACH_OVER: 5.5,      // §7.1: a row whose range exceeds this carries LONG_REACH_MIN
  LONG_REACH_MIN: 2.5,       // §7.1: inside this the long rows WHIFF. With no knockback on
                             // ctx and every fighter at FIGHT_WALK_SPEED, reach would otherwise
                             // be the only defensive stat in the game and the city's RARE rebar
                             // and the forest's UNCOMMON thornwhip would dominate their grounds'
                             // top tiers - inverting the rarity ladder the pads and the luck
                             // unlock are built on. Closing the gap beats out-ranging.
  FIST_DAMAGE: 6,            // §7.1: unarmed, always available
  FIST_RANGE: 3.6,           // §7.1
  FIST_ARC_DEG: 100,         // §7.1
  FIST_COOLDOWN_S: 0.5,      // §7.1
  FIGHT_WALK_SPEED: 20,      // §8: while a living fighter; 16 everywhere else
  FIGHT_JUMP_POWER: 52,      // §8: while a living fighter; 50 everywhere else
  WALK_SPEED_DEFAULT: 16,    // §8: restored on leaving a round and in dispose
  JUMP_POWER_DEFAULT: 50,    // §8: restored on leaving a round and in dispose
  GRAVITY_DEFAULT: 196.2,    // §8: never changed; asserted restored by the dispose gate
  SHAKE_ON_HIT: 0.35,        // §8: camera.shake intensity, 0..1
  SHAKE_ON_HIT_S: 0.18,      // §8: camera.shake duration in seconds

  // --- weapons and luck (§7) --------------------------------------------------------
  WEAPON_PADS_PER_MAP: 12,   // §7.2: every ground carries exactly this many pads
  LUCK_BOOST: 0.10,          // §7.3: chance the rarity roll is drawn twice, rarer kept
  RARITY_WEIGHTS: Object.freeze({   // §7.2: they sum to 100 so the odds read exact
    common: 46, uncommon: 28, rare: 17, epic: 7, legendary: 2,
  }),

  // --- Rogue Wardens (§9) -----------------------------------------------------------
  WARDEN_COUNT: 3,           // §9: per round, on every ground, solo or full room
  WARDEN_HP: 60,             // §9.3
  WARDEN_DAMAGE: 12,         // §9.2: only the lunge hurts
  WARDEN_TAG_R: 4.5,         // §9.2: the radius that starts a telegraph. It must clear the
                             // drum plus the player capsule: a canCollide:true body of collider
                             // radius r holds the player at >= r + 1 studs centre to centre
                             // (the capsule radius is 1), so at 2.6 any drum wider than about
                             // 3.2 studs could never reach its own telegraph radius and the
                             // telegraph/lunge cycle never started. The drum is a SENSOR -
                             // canCollide:false WITH one behaviour - so it is a hazard and not a
                             // wall, and so a walking drum does not shove the player out through
                             // penetration resolution (setPosition gives a part no collider
                             // motion, and setColliderMotion is not on ctx.engine.physics).
  WARDEN_BODY_W_MAX: 3,      // §9.1: the drum's maximum width in studs, so TAG_R always wins
  WARDEN_LOST_S: 6,          // §9.5: a Warden that cannot close on its target for this long
                             // reassembles at the target's OWN platform and resumes from there.
                             // Both the forest and the city are built around canopy walkways and
                             // rooftops, so without reachability standing still on a high
                             // platform for 240 s is a free Fighting Point, 25 Oofbux and - no
                             // hits taken, clock always expiring at zero - the `untouched` and
                             // `photo-finish` badges too, which would make the 1000-win unlock
                             // about eighty hours of standing still.
  WARDEN_SPEED: Object.freeze([9, 11, 13]),  // §9.4: all well under a fighter's 20
  WARDEN_TELEGRAPH_S: 0.9,   // §9.2: eye flare before the lunge (spec 21 §3.3)
  WARDEN_LUNGE_S: 0.55,      // §9.2: the only window in which a Warden can hurt you
  WARDEN_HIT_COOLDOWN_S: 1.2,// §9.2: at most one lunge hit per Warden per this
  WARDEN_WAKE_S: 6,          // §9.2: seconds into the fight before they move
  WARDEN_RESPAWN_S: 18,      // §9.3: a broken Warden reassembles at its spot

  // --- world materialization (§3.2, §3.4) -------------------------------------------
  MAP_PARTS_MAX: 1800,       // §3.2: hard ceiling on one ground's runtime parts
  MAP_COLLIDER_MAX: 900,     // §3.2: of those, how many may collide
  DRAIN_PER_TICK: 90,        // §3.4: parts built per update tick while draining
  VFX_MAX: 120,              // §8: live effect parts before the oldest is swept
  KILL_Y: -40,               // §3: place.json killY, below every walkable surface
  LOBBY_Y: 0,                // §3: the lobby band
  OBBY_BASE_Y: 260,          // §3: the bottom of the obby column
  PERCH: Object.freeze([0, 46, -62]),  // §12.1: the LOBBY perch, and ONLY the lobby perch -
                             // intermission and result. It is not where a dead fighter watches
                             // from: the lobby sits at x -70..70 while the grounds are 900-3300
                             // studs away on +X, camera FAR is 1200, and resolveFog clamps fog
                             // far to 300 on the low tier SwiftShader and phones report - so a
                             // lobby perch shows an empty lobby, and the city and forgotten
                             // grounds are past the camera's far plane entirely. Each map
                             // builder returns its own landmarks.perch inside its band (§3.2),
                             // and world.release restores this one.
  PERCH_ABOVE_ORIGIN: Object.freeze([0, 90, 0]),  // §3.2: the offset from a map's origin a
                             // builder's landmarks.perch sits at, clear of every rooftop

  // --- spectating (§12) -------------------------------------------------------------
  SPECTATE_HEIGHT: 22,       // §12.3: studs your ghost hovers above the tracked fighter
  SPECTATE_DIST: 46,         // §12.2: camera.setDistance, clamped 4..60 by the engine
  SPECTATE_PITCH: -28,       // §12.2: camera.setPitch takes DEGREES here
  SPECTATE_OFFSET_Y: 14,     // §12.2: camera.setOffset, the only unclamped camera lever

  // --- flight, the 1000-win unlock (§13.2) ------------------------------------------
  FLY_SPEED: 26,             // §13.2: horizontal studs per second while hovering
  FLY_RISE: 14,              // §13.2: vertical studs per second while rising
  FLY_CEILING_Y: 120,        // §13.2: studs above the LIVE ground's bounds.min[1], and the
                             // hover is clamped to that ground's bounds in XZ as well. With no
                             // map live it is LOBBY_Y + this, because "studs above the map
                             // floor" is undefined in a lobby that has no map - and the lobby is
                             // where flight is mostly used, since it is refused while you are a
                             // living fighter in `fight` AND refused while obby.inObby(), or a
                             // 1000-win player would hover up the obby column and touch the
                             // `error` stage's pads without playing a stage.

  // --- points, unlocks, Oofbux (§13) ------------------------------------------------
  WIN_POINTS: 1,             // §8.1: one Fighting Point per round won
  WIN_OOFBUX: 25,            // §13.4: award(25, "showdown:win")
  SOURCE_CAP: 700,           // §13.4: the SOURCE_CAPS.showdown row this Place needs, with
                             // the arithmetic written down so it can be re-derived: the
                             // OBBY_FIRST_CLEAR_OOFBUX ladder below sums to
                             // 10+20+40+80+150+300 = 600, all of it through
                             // award(n, "showdown:...") against ONE rolling 60 s window, so the
                             // worst honest minute is 600 + WIN_OOFBUX = 625, and 700 covers
                             // 600 + 2*WIN_OOFBUX = 650 with headroom. At 400 the two largest
                             // rungs plus one win (475) was already over, and everything past
                             // the cap is silently truncated with a single console.warn - the
                             // player's biggest reward in the Place quietly not arriving. Badge
                             // bonuses are NOT in this total: badges.js pays them under the
                             // uncapped `badge` token, not `showdown`. Rule 25:S3 asserts
                             // SOURCE_CAP >= sum(ladder) + 2 * WIN_OOFBUX.
  LUCK_UNLOCK_POINTS: 100,   // §13.1: SPENDS all 100 Fighting Points
  LUCK_UNLOCK_PERCENT: 10,   // §13.1: the display number for LUCK_BOOST
  FLY_UNLOCK_WINS: 1000,     // §13.2: lifetime wins, never spent
  OBBY_FIRST_CLEAR_OOFBUX: Object.freeze([10, 20, 40, 80, 150, 300]),  // §11.1, once ever

  // --- emotes (§10.2) ---------------------------------------------------------------
  EMOTE_FLIP_S: 0.9,         // §10.2: the backflip
  EMOTE_SUPERNOVA_S: 3,      // §10.2: how long the supernova runs and you float
  EMOTE_FLOAT_H: 5,          // §10.2: studs up, on repeated teleport, not zero gravity
  EMOTE_PARTICLES: 24,       // §10.2: canCollide:false neon motes
  EMOTE_LIGHTS: 1,           // §10.2: one point light, because the low tier renders two
  EMOTE_COOLDOWN_S: 12,      // §10.2

  // --- presence (§5) ----------------------------------------------------------------
  STATE_V: 1,                // §5.4: the published state schema version
  PUBLISH_MIN_S: 0.2,        // §5.4: throttle, forced on phase, vote, hit, death, win
  CLOCK_TOLERANCE_S: 2,      // §5.3: slew to the conductor while within this of your clock
  RESYNC_AFTER_S: 3,         // §5.3: drift past the tolerance held this long, or ANY phase
                             // mismatch, SNAPS your clock and phase to the conductor's instead
                             // of ignoring it. A tolerance rule on its own only ever accepts a
                             // conductor that already agrees, so the one case that needs
                             // correcting - a mid-round joiner on a fresh 40 s intermission, or
                             // a backgrounded tab whose sim stopped - could never resynchronize
                             // and would fight its own private round on its own ground.
  CONDUCTOR_STALE_S: 3,      // §5.3: skip a conductor stale this long and let the next-lowest
                             // candidate take over, so handover needs no message
  PEER_STALE_S: 3,           // §5.3: applied to EVERY peer-derived set - the alive set, the
                             // vote tally, the cap-expiry HP comparison, the spectate list, the
                             // fighter set. A peer staler than this, or whose state is null, or
                             // whose state.v !== 1, counts as al:0 and jn:0 and has no vote.
                             // Staleness is ctx.time minus the last tick that peer's state JSON
                             // CHANGED: peer.at is stamped from net.js's own private accumulator
                             // which ctx.services.net does not expose, and ctx.time is
                             // per-Place and shares no origin with it. net.js evicts on its own
                             // only at 15 s and only while a socket is open, so when YOUR socket
                             // drops the roster freezes with peers still published as al:1,
                             // hp:100: no round could resolve by last standing and every cap
                             // expiry would be won by a ghost on full HP.
  KEEPALIVE_S: 5,            // §5.5: publish at least this often even when nothing this
                             // client owns changed. net.publish drops an unchanged blob and
                             // `move` is suppressed while standing still, so a suppressed
                             // publish is indistinguishable from a disconnect after net.js's
                             // STALE_S 15 - a real standing player gets evicted with a `bye`,
                             // their rig vanishes, and the last-standing rule hands somebody a
                             // false win. Publishing your own whole-second `t` every tick is the
                             // other half of this: see the §5.5 note on the wire shape.

  // --- presentation and housekeeping (§15, §14) -------------------------------------
  HUD_REFRESH_S: 0.25,       // §15: HUD throttle, after comparing formatted strings
  SAVE_DEBOUNCE_S: 2,        // §14: save on change, never per tick
  UI_Z: 50,                  // §15: the game DOM layer, below HUD 100 and panels 200
  TOUCH_MIN_PX: 44,          // §15: the minimum tappable size, platform-wide
});

// =====================================================================================
// MAPS - the three grounds (§3.2). `sky` is the headline colour the vote plinth and the
// banner use; `lighting` is the spec 04 §3.3 config world.js applies when the ground
// materializes, and each map builder may return its own to override it. `origin` is the
// centre of that ground's band in the shared coordinate space (§3): side by side in XZ,
// never stacked, because killY is one number for the whole Place.
//
// FOG, and why these numbers look small (§3.3). resolveFog derives fogNear as
// 0.55 * fogFar and NEVER reads a `near` key, then clamps far to the quality tier's
// maximum - 300 low, 500 med, 700 high. SwiftShader always reports low and so does a
// phone, so low is what the test and most players get. Every `far` below is therefore
// authored at <= 300, so the number written is the number that renders; no `near` key is
// written at all, because it would be documentation pretending to be configuration. The
// honest consequence: on the low tier the three grounds are separated by fog COLOUR and
// by their neon/lava/galaxy materials, not by fog distance. Rule 25:S2 asserts both.
// =====================================================================================

export const MAPS = Object.freeze([
  Object.freeze({
    id: "forest",
    name: "Giant Forest",
    blurb: "Trees the size of towers, a fallen trunk you can walk the length of, and three levels of canopy to fight on.",
    music: "clash",
    sky: "#8fce7a",
    icon: "🌳",
    origin: Object.freeze([900, 0, 0]),
    lighting: Object.freeze({
      skyTop: "#4f8fd0", skyBottom: "#a8e08a",
      ambient: "#cfe8b8", ambientIntensity: 0.85,
      sunColor: "#fff2cf", sunIntensity: 1.35,
      sunDirection: Object.freeze([-0.35, -1, -0.25]),
      fog: Object.freeze({ color: "#7fb86a", far: 300 }),
    }),
  }),
  Object.freeze({
    id: "city",
    name: "City",
    blurb: "Four blocks of concrete and glass at dusk, with roofs worth holding and alleys worth avoiding.",
    music: "pump",
    sky: "#3a4363",
    icon: "🏙️",
    origin: Object.freeze([2100, 0, 0]),
    lighting: Object.freeze({
      skyTop: "#232a44", skyBottom: "#6b5a7a",
      ambient: "#9db2c9", ambientIntensity: 0.7,
      sunColor: "#ffd8a8", sunIntensity: 1.1,
      sunDirection: Object.freeze([0.4, -0.8, 0.3]),
      fog: Object.freeze({ color: "#2b3049", far: 300 }),
    }),
  }),
  Object.freeze({
    id: "forgotten",
    name: "Forgotten City",
    blurb: "The same streets a thousand years later and somewhere else: cobble under sand, roofless colonnades, humming obelisks.",
    music: "voidchill",
    sky: "#2a1a4a",
    icon: "🏛️",
    origin: Object.freeze([3300, 0, 0]),
    lighting: Object.freeze({
      skyTop: "#150b28", skyBottom: "#4a2f6a",
      ambient: "#b9a8d8", ambientIntensity: 0.6,
      sunColor: "#d8c8ff", sunIntensity: 0.85,
      sunDirection: Object.freeze([-0.2, -0.9, 0.4]),
      fog: Object.freeze({ color: "#1b1030", far: 220 }),
    }),
  }),
]);

// The lobby's own lighting, restored by world.release() every time a ground is torn
// down (§3.1, §3.3). place.json carries the same values so the first frame matches.
export const LOBBY_LIGHTING = Object.freeze({
  skyTop: "#4a7fc0", skyBottom: "#bcd9f0",
  ambient: "#e6f0ff", ambientIntensity: 0.95,
  sunColor: "#fff4e0", sunIntensity: 1.3,
  sunDirection: Object.freeze([-0.3, -1, -0.3]),
  fog: Object.freeze({ color: "#c8dcf0", far: 300 }),
});

export const LOBBY_MUSIC = "plaza";   // §3.1
export const OBBY_MUSIC = "ascent";   // §11, and spec 25 §16.7

// =====================================================================================
// WEAPONS - eighteen rows (§7.1). Every field:
//   id         short, lower-case, stable; it rides the wire as `wp`
//   name       what the HUD calls it
//   icon       one or two code points for the swing button and the pad label
//   tier       starter | common | uncommon | rare | epic | legendary
//   damage     per connected swing, against 100 HP
//   range      studs, centre to centre, tested by hand (there is no overlap query)
//   arcDeg     the full cone width; a target must also clear TUNE.HIT_CONE_DOT
//   cooldownS  seconds between swings
//   minRange   studs below which the swing WHIFFS; present only on rows whose range is
//              above TUNE.LONG_REACH_OVER, where it equals TUNE.LONG_REACH_MIN. It is the
//              only cost reach pays: there is no knockback on ctx and every fighter moves
//              at the same 20 studs/s, so without it the long rows would simply win.
//   maps       which grounds it can be found on; "axe" is granted, not found
//   desc       one line, shown on pickup and in the Vault
//
// The invariants this table actually obeys, stated precisely because a looser sentence
// here was false of its own rows and rule 25:S2 would have been written against it:
//   - DAMAGE rises with tier on every ground, and each ground's legendary is the highest
//     damage on that ground. Every legendary kills in THREE connected swings against
//     TUNE.HP_MAX (34 / 34 / 35, i.e. 102 or better); every common needs ten to thirteen
//     (pipe 10 -> 10, shard 9 -> 12, branch 8 -> 13).
//   - No non-legendary row's DPS (damage / cooldownS) exceeds its own ground's legendary
//     DPS. That is what the Boar Tusk Dagger's 0.8 s cooldown is for: at 0.5 s it was
//     36 DPS - a RARE out-damaging the forest's legendary by 31 per cent.
//   - DPS is deliberately NOT monotonic below that ceiling. A slow heavy weapon that kills
//     in three swings is worth more in this Place than a fast one that needs ten, so the
//     rare Relic Mace out-damaging the epic Star Censer per swing is the design, not a bug;
//     the Censer buys a 140 deg sweep with it.
//   - REACH and ARC are not ranked by tier at all, and that is where the exceptions live:
//     the city's rare Rebar Spear has the longest reach on any ground and the forgotten
//     city's epic Star Censer trades damage for the widest arc.
// Nothing bought in a shop changes a number in this table (§2.5).
// =====================================================================================

export const WEAPONS = Object.freeze([
  // The earned starter (§13.1). Granted every round once the 100 points are spent, and
  // the only row that appears on all three grounds.
  Object.freeze({
    id: "axe", name: "Woodsman's Axe", icon: "🪓", tier: "starter",
    damage: 12, range: 4.5, arcDeg: 90, cooldownS: 0.6,
    maps: Object.freeze(["forest", "city", "forgotten"]),
    desc: "The axe you swore a hundred Fighting Points for. Honest, balanced, always in your hands.",
  }),

  // --- GIANT FOREST: wooden and primal -----------------------------------------------
  Object.freeze({
    id: "branch", name: "Fallen Branch", icon: "🌿", tier: "common",
    damage: 8, range: 4.2, arcDeg: 95, cooldownS: 0.5,
    maps: Object.freeze(["forest"]),
    desc: "Knotted oak off the forest floor. It will do until something better falls.",
  }),
  Object.freeze({
    id: "flintaxe", name: "Flint Hatchet", icon: "🪨", tier: "uncommon",
    damage: 14, range: 4.4, arcDeg: 80, cooldownS: 0.75,
    maps: Object.freeze(["forest"]),
    desc: "A shard of flint lashed to a handle with green cord. Bites deeper than it looks.",
  }),
  Object.freeze({
    id: "thornwhip", name: "Thorn Whip", icon: "🌹", tier: "uncommon",
    damage: 10, range: 6.5, arcDeg: 45, cooldownS: 0.65, minRange: 2.5,
    maps: Object.freeze(["forest"]),
    desc: "A live bramble, still growing. Reaches across a gap no axe could - and useless in your face.",
  }),
  Object.freeze({
    id: "tusk", name: "Boar Tusk Dagger", icon: "🐗", tier: "rare",
    damage: 18, range: 3.4, arcDeg: 60, cooldownS: 0.8,
    maps: Object.freeze(["forest"]),
    desc: "Short, quick and unkind. You have to be close, and it rewards you for it.",
  }),
  Object.freeze({
    id: "antlermaul", name: "Antler Maul", icon: "🦌", tier: "epic",
    damage: 26, range: 4.8, arcDeg: 120, cooldownS: 1.1,
    maps: Object.freeze(["forest"]),
    desc: "A crown of antler on a trunk of ash. Slow, wide, and it clears a walkway.",
  }),
  Object.freeze({
    id: "heartwood", name: "Heartwood Greatclub", icon: "🌲", tier: "legendary",
    damage: 34, range: 5.2, arcDeg: 110, cooldownS: 1.2,
    maps: Object.freeze(["forest"]),
    desc: "Cut from the middle of the oldest tree on the ground. Three of these ends anyone.",
  }),

  // --- CITY: modern and industrial ---------------------------------------------------
  Object.freeze({
    id: "pipe", name: "Lead Pipe", icon: "🔧", tier: "common",
    damage: 10, range: 4.2, arcDeg: 85, cooldownS: 0.5,
    maps: Object.freeze(["city"]),
    desc: "Pulled out of a wall on the second floor. Dependable in the dullest way.",
  }),
  Object.freeze({
    id: "wrench", name: "Heavy Wrench", icon: "🛠️", tier: "uncommon",
    damage: 15, range: 4.0, arcDeg: 70, cooldownS: 0.7,
    maps: Object.freeze(["city"]),
    desc: "Site issue, one size, far too big. Swings like a promise.",
  }),
  Object.freeze({
    id: "crowbar", name: "Crowbar", icon: "🪚", tier: "uncommon",
    damage: 13, range: 4.6, arcDeg: 60, cooldownS: 0.6,
    maps: Object.freeze(["city"]),
    desc: "Opens doors, shutters and arguments.",
  }),
  Object.freeze({
    id: "rebar", name: "Rebar Spear", icon: "📏", tier: "rare",
    damage: 17, range: 7.0, arcDeg: 40, cooldownS: 0.7, minRange: 2.5,
    maps: Object.freeze(["city"]),
    desc: "Two metres of ribbed steel off the scaffold. The longest reach on any ground, and nothing at all up close.",
  }),
  Object.freeze({
    id: "hatchet", name: "Fire Hatchet", icon: "🧯", tier: "epic",
    damage: 22, range: 4.4, arcDeg: 90, cooldownS: 0.85,
    maps: Object.freeze(["city"]),
    desc: "Break glass to obtain. Somebody already did.",
  }),
  Object.freeze({
    id: "neonsign", name: "Neon Sign", icon: "🪧", tier: "legendary",
    damage: 34, range: 5.4, arcDeg: 130, cooldownS: 1.15,
    maps: Object.freeze(["city"]),
    desc: "Still lit, still wired, still spelling half a word. Wide enough to sweep a roof.",
  }),

  // --- FORGOTTEN CITY: ancient and arcane --------------------------------------------
  Object.freeze({
    id: "shard", name: "Cobble Shard", icon: "🧱", tier: "common",
    damage: 9, range: 3.8, arcDeg: 95, cooldownS: 0.45,
    maps: Object.freeze(["forgotten"]),
    desc: "A piece of a street that stopped being a street. Sharp on one side.",
  }),
  Object.freeze({
    id: "glaive", name: "Sunken Glaive", icon: "⚔️", tier: "uncommon",
    damage: 16, range: 5.6, arcDeg: 70, cooldownS: 0.8, minRange: 2.5,
    maps: Object.freeze(["forgotten"]),
    desc: "Drawn out of the drifted sand of the amphitheatre floor, and still keen.",
  }),
  Object.freeze({
    id: "relicmace", name: "Relic Mace", icon: "🏺", tier: "rare",
    damage: 24, range: 4.2, arcDeg: 110, cooldownS: 1.0,
    maps: Object.freeze(["forgotten"]),
    desc: "Marble head, bronze collar, a name on it nobody here can read.",
  }),
  Object.freeze({
    id: "starcenser", name: "Star Censer", icon: "✨", tier: "epic",
    damage: 20, range: 6.0, arcDeg: 140, cooldownS: 0.9, minRange: 2.5,
    maps: Object.freeze(["forgotten"]),
    desc: "Swung on its chain it trails cold light, and hits everything in front of you.",
  }),
  Object.freeze({
    id: "galaxyspire", name: "Galaxy Spire", icon: "🌌", tier: "legendary",
    damage: 35, range: 5.0, arcDeg: 100, cooldownS: 1.15,
    maps: Object.freeze(["forgotten"]),
    desc: "A splinter off one of the floating obelisks. It hums, and the hum is the damage.",
  }),
]);

// Tier order, rarest last. `rollTier` and the Vault's sort both read it (§7.2, §7.3).
export const TIERS = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"]);

// =====================================================================================
// OBBY_STAGES - exactly six, in this order (§11). The first five borrow spec 08 §5.2's
// names and colours; `error` is spec 25's own difficulty and the new hardest. There are
// NO towers here: the Difficulty Chart Obby dropped them and this obby matches that.
// Checkpoints are touchEvent pads plus player.setCheckpoint, never the checkpoint
// behaviour, because that gate only ever rises (§11.1).
// =====================================================================================

export const OBBY_STAGES = Object.freeze([
  Object.freeze({ id: "easy", name: "Easy", colour: "#75f347",
    blurb: "Wide pads, short hops, a warm-up while you wait." }),
  Object.freeze({ id: "hard", name: "Hard", colour: "#fd7c00",
    blurb: "Smaller pads, one spinner and a beam you have to duck." }),
  Object.freeze({ id: "insane", name: "Insane", colour: "#0034ff",
    blurb: "Long jumps over open void and a moving platform that will not wait." }),
  Object.freeze({ id: "nil", name: "NIL", colour: "#4a4a4a",
    blurb: "Thin grey beams against a grey sky. You will lose track of which is which." }),
  Object.freeze({ id: "dilly", name: "Dilly Impossible", colour: "#14000a",
    blurb: "Tiny pads, conveyors that reverse, and a lava gauntlet with no margin." }),
  Object.freeze({ id: "error", name: "error", colour: "#00ff9c",
    blurb: "The stage lies. Decoy pads you fall through, a beam whose safe half looks wrong, and a last jump you take backwards." }),
]);

// The error stage's second colour, which its label flickers to (§11).
export const ERROR_FLICKER_COLOUR = "#14000a";

// =====================================================================================
// HATS - Oofbux, and CATALOG items, so they are worn in EVERY Place and not only here
// (§10.1). After spend() returns true, avatar.grantItem(catalogId, "showdown").
//
// The grant contract is NOT truthy/falsy, and getting it wrong fails invisibly
// (§16.11). grantItem returns { ok:false, reason:"unknown" } for a Catalog row that does
// not exist yet - which IS TRUTHY - and { ok:true, alreadyOwned } on success. So:
//     const r = ctx.services.avatar.grantItem(catalogId, "showdown");
//     const granted = !!(r && r.ok === true);
// Written as `if (grantItem(id, "showdown")) markGranted()` this Place would record the
// golden hat, the rainbow fedora and the champion wings as granted platform-wide when
// nothing was granted, and would never retry. Anything but ok === true leaves the item
// LOCAL - drawn on your rig inside Showdown only - and the grant is re-attempted on the
// next load and from the Vault's claim button. grantItem raises its OWN "Unlocked: ..."
// toast, so this Place never toasts on top of it.
//
// A row is also never a BUY target once it is owned (§10): ownership for these two is
// ownedHats.includes(id) || avatar.owns(catalogId), and an owned row renders as EQUIP.
// Without that guard a second tap calls spend(1000, ...) again and succeeds, and a player
// who already owns hat_golden from anywhere else on the platform is charged for a hat
// they are already wearing.
// =====================================================================================

export const HATS = Object.freeze([
  Object.freeze({ id: "golden", name: "Golden Hat", icon: "👑", price: 1000,
    catalogId: "hat_golden", reason: "showdown:hat_golden",
    desc: "Solid gold, absurdly heavy, worn in every Place you visit." }),
  Object.freeze({ id: "rainbow-fedora", name: "Rainbow Fedora", icon: "🎩", price: 10000,
    catalogId: "hat_rainbow_fedora", reason: "showdown:hat_rainbow_fedora",
    desc: "Every colour at once, cycling slowly. The most expensive thing in the lobby." }),
]);

// The Catalog cosmetic the 1000-win unlock grants (§13.2). Same grant contract as the
// hats above, and one extra constraint: it must be specified in the platform Catalog as an
// `aura` item, NOT as a new `wings` type and NOT as `gear`. EQUIP_SLOTS is closed to
// ["face","hat","gear","aura","trail","shirt","pants"] and the rig builds exactly four
// accessory anchors - hat on the head, gear on the right ARM, shirt and pants on the torso.
// There is no back anchor, so a `wings` type would never equip or render and a `gear` type
// would mount the wings on your right hand. `aura` is drawn by avatar/effects.js and needs
// no new anchor. The two hats stay type "hat".
export const WINGS_CATALOG_ID = "wings_champion";
export const WINGS_CATALOG_TYPE = "aura";

// =====================================================================================
// EMOTES - Oofbux, and PLACE-LOCAL: they are drawn by this Place and go nowhere else
// (§10.2). Refused while you are a living fighter in `fight`, because three seconds of
// hover would be a free dodge.
// =====================================================================================

export const EMOTES = Object.freeze([
  Object.freeze({ id: "flip", name: "Flip", icon: "🤸", price: 500,
    reason: "showdown:emote_flip", durationS: 0.9, floatH: 0,
    desc: "One clean backflip on the spot." }),
  Object.freeze({ id: "supernova", name: "Supernova", icon: "💥", price: 2500,
    reason: "showdown:emote_supernova", durationS: 3, floatH: 5,
    desc: "A light shines on you, motes fly everywhere, a white star blooms overhead, rings spread under your feet, and you float five studs up for three seconds." }),
]);

// =====================================================================================
// SKINS - Oofbux, PLACE-LOCAL, appearance only: a skin never changes damage, reach, arc
// or cooldown (§10.3). `material` and `tint` are what combat.js dresses the held weapon
// in; `motion` is the flourish hud.js and combat.js animate. Published as `sk` so peers
// draw your blade the same way.
// `needsStage` gates a row behind save.obbyStage, which is the number of stages CLEARED
// (§14), not the highest stage reached: glitchsteel needs all six cleared, which is
// obbyStage >= 6. Read the other way, merely ENTERING the `error` stage would satisfy it
// and the obby's one gated reward would arrive a whole stage early.
// =====================================================================================

export const SKINS = Object.freeze([
  Object.freeze({ id: "oak", name: "Oakheart", icon: "🪵", price: 250,
    reason: "showdown:skin_oak", material: "wood", tint: "#8a5a34",
    motion: "none", needsStage: 0, desc: "Warm oak with brass banding." }),
  Object.freeze({ id: "ember", name: "Emberglow", icon: "🔥", price: 600,
    reason: "showdown:skin_ember", material: "lava", tint: "#e0562f",
    motion: "shimmer", needsStage: 0, desc: "A core that never quite goes out." }),
  Object.freeze({ id: "frost", name: "Frostbite", icon: "❄️", price: 900,
    reason: "showdown:skin_frost", material: "ice", tint: "#8bd0e6",
    motion: "mist", needsStage: 0, desc: "Cold enough to fog in front of you." }),
  Object.freeze({ id: "neonpulse", name: "Neon Pulse", icon: "🟣", price: 1500,
    reason: "showdown:skin_neonpulse", material: "neon", tint: "#b64bd6",
    motion: "pulse", needsStage: 0, desc: "Pulses in time with your swing cooldown, so you can read it." }),
  Object.freeze({ id: "obsidian", name: "Obsidian", icon: "⬛", price: 2400,
    reason: "showdown:skin_obsidian", material: "marble", tint: "#15131a",
    motion: "edge", needsStage: 0, desc: "Near black, with one thin white edge." }),
  Object.freeze({ id: "goldleaf", name: "Gold Leaf", icon: "🥇", price: 4000,
    reason: "showdown:skin_goldleaf", material: "gold", tint: "#e0b23a",
    motion: "flakes", needsStage: 0, desc: "Sheds a slow drift of gold flakes as you walk." }),
  Object.freeze({ id: "galaxydrift", name: "Galaxy Drift", icon: "🌠", price: 7500,
    reason: "showdown:skin_galaxydrift", material: "galaxy", tint: "#2a1a4a",
    motion: "orbit", needsStage: 0, desc: "A small moon orbits the head of it, and never lands." }),
  Object.freeze({ id: "glitchsteel", name: "Glitchsteel", icon: "🧩", price: 12000,
    reason: "showdown:skin_glitchsteel", material: "neon", tint: "#00ff9c",
    motion: "glitch", needsStage: 6,
    desc: "Stutters between three colours, one frame each. Only sold once you have cleared the error stage." }),
]);

// =====================================================================================
// BADGES - the rows to append to the CLOSED platform registry in
// src/platform/services/badges.js, under a `// showdown (spec 25)` comment, as
// B("showdown.<id>", name, icon, description, secret?). `id` here is the SUFFIX:
// badges.award("first-win") auto-prefixes to "showdown.first-win". An id that is not in
// the registry logs an unknown-badge line, returns false, and the badge never exists.
// Each badge pays its own flat 10 Oofbux and raises its own toast, so nothing in this
// Place pays or toasts a second time for one (§13.3).
// =====================================================================================

export const BADGES = Object.freeze([
  Object.freeze({ id: "first-win", name: "First Showdown", icon: "🏆",
    description: "Win your first round of Showdown." }),
  Object.freeze({ id: "wins-10", name: "Still Standing", icon: "🥇",
    description: "Win 10 rounds of Showdown." }),
  Object.freeze({ id: "wins-100", name: "Centurion", icon: "🎖️",
    description: "Win 100 rounds of Showdown." }),
  Object.freeze({ id: "wins-1000", name: "Winged", icon: "🕊️",
    description: "Win 1,000 rounds and earn your wings." }),
  Object.freeze({ id: "axe-oath", name: "The Axe Oath", icon: "🪓",
    description: "Spend 100 Fighting Points on the starting axe." }),
  Object.freeze({ id: "win-forest", name: "Deep Wood", icon: "🌳",
    description: "Win a round in the Giant Forest." }),
  Object.freeze({ id: "win-city", name: "Street Level", icon: "🏙️",
    description: "Win a round in the City." }),
  Object.freeze({ id: "win-forgotten", name: "Older Streets", icon: "🏛️",
    description: "Win a round in the Forgotten City." }),
  Object.freeze({ id: "map-sweep", name: "Three Grounds", icon: "🗺️",
    description: "Win a round on all three grounds." }),
  Object.freeze({ id: "warden-breaker", name: "Warden Breaker", icon: "👁️",
    description: "Break all three Rogue Wardens in one round." }),
  Object.freeze({ id: "obby-six", name: "Six Stages Up", icon: "🪜",
    description: "Clear all six stages of the lobby obby." }),
  Object.freeze({ id: "error-handled", name: "Error Handled", icon: "🧩",
    description: "Clear the error stage, the hardest in the lobby obby." }),
  Object.freeze({ id: "untouched", name: "Untouched", icon: "🛡️",
    description: "Win a round without taking a single hit.", secret: true }),
  Object.freeze({ id: "photo-finish", name: "Photo Finish", icon: "⏱️",
    description: "Win with under five seconds left on the round clock.", secret: true }),
]);

// =====================================================================================
// SAVE_V and the save shape (§14). One blob in ctx.services.saves, scoped
// oofcubes.v1.place.showdown, far under the 65536-byte serialized cap. saves.load()
// returns a clone, so mutating it persists nothing: save() must be called, debounced at
// TUNE.SAVE_DEBOUNCE_S and forced on a win, a purchase, an unlock, an obby stage and in
// dispose. Every field is validated on load behind a version guard, and a missing or
// wrong-typed field falls back to its default rather than being trusted.
//
//   {
//     schemaVersion: 1,            // === SAVE_V; anything else is migrated or reset
//     points: 0,                   // SPENDABLE Fighting Points
//     pointsSpent: 0,              // monotonic TOTAL ever spent; startingAxe derives from it
//     lifetimeWins: 0,             // monotonic, display only, NEVER spent; fly derives from it
//     obbyStage: 0,                // 0..6, the number of stages CLEARED
//     paidStages: [],              // stage IDS that already paid their first clear
//     mapWins: { forest: 0, city: 0, forgotten: 0 },
//     ownedHats: [], ownedEmotes: [], ownedSkins: [],
//     equipped: { hat: null, emote: null, skin: null },
//     seenIntro: false,
//   }
//
// THERE IS NO `unlocks` OBJECT, on purpose. Both unlocks are DERIVED on load:
//     startingAxe = save.pointsSpent >= TUNE.LUCK_UNLOCK_POINTS
//     fly         = save.lifetimeWins >= TUNE.FLY_UNLOCK_WINS
// Stored as flags they were destroyable and repeatable. A field-level fallback rewriting a
// corrupt or wrong-typed `unlocks` to { startingAxe:false, fly:false } silently destroyed a
// 100-point purchase with no refund and nothing else in the save recording that the spend
// happened; and `points -= 100` and `unlocks.startingAxe = true` written as two statements
// against a 2 s debounce could persist apart, because a tab close never calls dispose. So
// the Vault's axe button is guarded on `points >= 100 && !startingAxe`, and it writes
// `points -= 100; pointsSpent += 100;` in ONE forced save().
//
// obbyStage is the number of stages CLEARED, 0..6 - not "the highest stage reached". The
// two readings are incompatible and ten sibling modules would pick differently: read as
// "reached", entering the `error` stage already satisfies needsStage 6 and the obby-six
// badge without clearing anything; read as "cleared", the six-rung 0-indexed
// OBBY_FIRST_CLEAR_OOFBUX ladder lines up exactly. On clearing index i,
// obbyStage = max(obbyStage, i + 1). paidStages holds stage IDS, never indexes.
// =====================================================================================

export const SAVE_V = 1;

export function freshSave() {
  return {
    schemaVersion: SAVE_V,
    points: 0,
    pointsSpent: 0,
    lifetimeWins: 0,
    obbyStage: 0,
    paidStages: [],
    mapWins: { forest: 0, city: 0, forgotten: 0 },
    ownedHats: [],
    ownedEmotes: [],
    ownedSkins: [],
    equipped: { hat: null, emote: null, skin: null },
    seenIntro: false,
  };
}

// The two unlocks, derived rather than stored, so neither can be lost by a field-level
// fallback and neither can be claimed twice (§13.1, §13.2). game.js recomputes both on
// load and on every win, and nothing ever writes them into the blob.
export function unlocksFor(save) {
  const sp = Number(save && save.pointsSpent) || 0;
  const lw = Number(save && save.lifetimeWins) || 0;
  return {
    startingAxe: sp >= TUNE.LUCK_UNLOCK_POINTS,
    fly: lw >= TUNE.FLY_UNLOCK_WINS,
  };
}

// =====================================================================================
// Pure helpers. Small, total, and side-effect free, so validate can exercise them.
// =====================================================================================

export function mapById(id) { return MAPS.find((m) => m.id === id) || null; }
export function mapIndex(id) { const i = MAPS.findIndex((m) => m.id === id); return i < 0 ? 0 : i; }
export function weaponById(id) { return WEAPONS.find((w) => w.id === id) || null; }
export function stageById(id) { return OBBY_STAGES.find((s) => s.id === id) || null; }
export function skinById(id) { return SKINS.find((s) => s.id === id) || null; }
export function hatById(id) { return HATS.find((h) => h.id === id) || null; }
export function emoteById(id) { return EMOTES.find((e) => e.id === id) || null; }

// Every row that can be FOUND on a ground. The starter axe is granted, never found, so
// it is excluded here and included nowhere in the pad roll (§7.1, §7.2).
export function weaponsForMap(mapId) {
  return WEAPONS.filter((w) => w.tier !== "starter" && w.maps.indexOf(mapId) >= 0);
}

export function weaponsForMapTier(mapId, tier) {
  return weaponsForMap(mapId).filter((w) => w.tier === tier);
}

// The inner edge of a row's reach: below it the swing whiffs (§7.1). Rows at or under
// TUNE.LONG_REACH_OVER have no inner edge at all, and neither does the fist.
export function minRangeOf(weapon) {
  if (!weapon) return 0;
  if (Number.isFinite(weapon.minRange)) return weapon.minRange;
  return weapon.range > TUNE.LONG_REACH_OVER ? TUNE.LONG_REACH_MIN : 0;
}

// DPS, which rule 25:S2 compares against each ground's legendary so the rarity ladder can
// never invert again (see the WEAPONS header).
export function dpsOf(weapon) {
  if (!weapon || !(weapon.cooldownS > 0)) return 0;
  return weapon.damage / weapon.cooldownS;
}

// One rarity draw from TUNE.RARITY_WEIGHTS. `rand` is an injectable 0..1 source so the
// odds are testable; nothing here calls Math.random itself.
export function drawTier(rand) {
  const w = TUNE.RARITY_WEIGHTS;
  let total = 0;
  for (const t of TIERS) total += w[t];
  let r = Math.max(0, Math.min(1, Number(rand) || 0)) * total;
  for (const t of TIERS) {
    r -= w[t];
    // `<=`, not `<`: with rand exactly 1 the running total reaches exactly 0 on the LAST
    // tier, a `< 0` test failed there, and the fallback turned the rarest possible draw
    // into the commonest. The fallback is the rarest tier for the same reason.
    if (r <= 0) return t;
  }
  return TIERS[TIERS.length - 1];
}

// The luck rule of §7.3, in full: with probability TUNE.LUCK_BOOST the rarity roll is
// drawn twice and the rarer of the two is kept. Place-local, and it biases nothing but
// this roll.
//
// `rand` is read in a FIXED order - the luck gate, the first draw, the second draw -
// exactly three times, whether or not the player has luck. Short-circuiting the gate on
// `hasLuck` consumed the generator once for an unlucky player and two or three times for a
// lucky one, so a seeded test generator saw two different sequences and the comment above
// promising a fixed order was false.
export function rollTier(rand, hasLuck) {
  const gate = Number(rand());
  const lucky = !!hasLuck && gate < TUNE.LUCK_BOOST;
  const first = drawTier(rand());
  const second = drawTier(rand());
  if (!lucky) return first;
  return TIERS.indexOf(second) > TIERS.indexOf(first) ? second : first;
}

// The Oofbux a stage pays the first time it is ever cleared, indexed by the CLEARED
// stage's 0-based index - so clearing OBBY_STAGES[0] pays row 0 and clearing `error`
// (index 5) pays row 5 (§11.1). save.obbyStage, which counts stages cleared, is
// therefore stageIndex + 1 afterwards; do not index this row with it.
export function stageOofbux(stageIndex) {
  const i = stageIndex | 0;
  const row = TUNE.OBBY_FIRST_CLEAR_OOFBUX;
  return i >= 0 && i < row.length ? row[i] : 0;
}

// Whether a shop row may be sold yet. Only `needsStage` gates anything today, and only
// glitchsteel uses it (§10.3). `obbyStage` here is the number of stages CLEARED, so
// glitchsteel's needsStage 6 means all six cleared in sequence (§11.1, §14).
export function skinAvailable(skin, obbyStage) {
  return !!skin && (skin.needsStage || 0) <= (obbyStage | 0);
}

// =====================================================================================
// =========================== MODULE CONTRACT (spec 25) ===============================
// =====================================================================================
// The exact exported signature of every sibling module. Ten authors write ten files
// against this block and nothing drifts. A module exports what is written here and
// nothing else that another module relies on; if a signature has to change, this block
// changes first, in its own commit, the way ARCHITECTURE.md is amended first.
//
// Shared shapes, referred to by name below:
//
//   PartDef      a spec 04 part literal: { shape?, size:[x,y,z], position:[x,y,z],
//                rotation?:[x,y,z] in DEGREES, color:"#rrggbb" lower-case, material?,
//                transparency?, anchored?, canCollide?, light?, behaviors?:[...] }.
//                Runtime parts are NEVER instanced, so they can be moved and removed.
//                A part with canCollide:false and NO behaviours registers no collider at
//                all; the same part WITH a behaviour is a sensor. Omit `light` entirely
//                rather than passing null. NOTE there is no `id` in a runtime PartDef -
//                see the world.js block for why that is a rule and not a convenience.
//   Vec3         [x, y, z], plain numbers, studs. FEET positions unless said otherwise:
//                ctx.player.position() is the feet, physics.getPosition() is the centre
//                (feet + 2.5). Never mix them.
//   Yaw          DEGREES in player.teleport and camera.setPitch; RADIANS in a net peer's
//                `yaw` and in physics.getRenderTransform(). Never mix them either.
//                YOUR OWN FACING, which every swing test and every Warden facing test
//                needs, is `ctx.player.avatar.rotation.y` - RADIANS, written from
//                physics.getRenderTransform(alpha).yaw in the shell's renderFrame, so it
//                refreshes PER RENDERED FRAME rather than per sim tick, and it is 0 before
//                the first frame. That is the only reachable source: there is no getYaw
//                and no getRenderTransform on ctx.engine.physics, and getMoveVector() is
//                CONTROL space, not facing.
//   PadDef       { id: string, position: Vec3, kind: "weapon" | "checkpoint" | "vote" |
//                "shop" | "obby", event: string } - the touchEvent name the builder put
//                on the sensor part, which game.js routes off the `touch:<event>` event.
//                `id` here is the PAD's own logical name, not a runtime part id.
//   Bounds       { min: Vec3, max: Vec3 } - the axis-aligned box a ground occupies, used
//                by rule 25:S1 and by the fly ceiling and clamp.
//   MapBuild     { parts: PartDef[], spawns: Vec3[], weaponPads: PadDef[],
//                  wardenSpots: Vec3[], landmarks: Record<string, Vec3>,
//                  lighting: LightingConfig, bounds: Bounds }
//                `landmarks.perch` is REQUIRED (§3.2).
//   RoundFacts   { phase: "boot"|"intermission"|"fight"|"result", clock: number,
//                  voteOpen: boolean, votes: {forest,city,forgotten}, roundIndex: number,
//                  mapId: string|null, nextMapId: string|null,
//                  alive: string[], fighters: string[], fightersAtStart: number,
//                  sawOpponent: boolean, scored: boolean, winner: string|null,
//                  conductor: string|null, isConductor: boolean }
//   PeerView     { id, name, pos: Vec3, yaw: number, state: object|null,
//                  lastChangeAt: number, stale: boolean } - a trimmed read of one net
//                roster row, plus the Place's own staleness bookkeeping (§5.3). `stale`
//                is true when ctx.time - lastChangeAt > TUNE.PEER_STALE_S, or when
//                `state` is null, or when state.v !== TUNE.STATE_V. A stale peer counts as
//                al:0 and jn:0 everywhere. Nothing writes a PeerView back.
//   SELF_ID      `ctx.services.net.self().id || "local"`. net.self().id is NULL until a
//                relay `welcome` arrives, which offline - the default in every dev
//                checkout and every smoke run - is never. This substitution is the SINGLE
//                place solo differs from a full room, and it is a value, not a branch:
//                every id comparison, sort, hit.to, ki.by and spectate row reads it, and
//                offline debugState().conductor === "local" with isConductor true.
//
// -------------------------------------------------------------------------------------
// scripts/maps/forest.js, scripts/maps/city.js, scripts/maps/forgotten.js
// -------------------------------------------------------------------------------------
//   export function build(): MapBuild
// Pure. Imports NOTHING, not even this config file, so validate can import() it under
// Node. No ctx, no THREE, no DOM, no Math.random (seed a local generator if you need
// variety, and keep it deterministic). Every position is absolute in the shared
// coordinate space, inside that ground's MAPS[].origin band.
//
// A BUILDER NEVER WRITES `id` ON A PART. world.js stamps every def with its own monotonic
// uid at materialize time (see below). Rule 25:S1 asserts the absence.
//
// At most TUNE.MAP_PARTS_MAX parts, of which at most TUNE.MAP_COLLIDER_MAX collide. Every
// walkable surface is above TUNE.KILL_Y. `spawns` holds at least 20 (the room cap), spread
// so two fighters never start inside each other - §4.1 is what assigns which fighter takes
// which index, by rank in the sorted fighter id set, so the builder only has to provide
// twenty that do not overlap. `weaponPads` holds exactly TUNE.WEAPON_PADS_PER_MAP rows,
// each already carrying its touchEvent sensor part in `parts`. `wardenSpots` holds exactly
// TUNE.WARDEN_COUNT positions, all in the open and all visible from a spawn, and no drum is
// wider than TUNE.WARDEN_BODY_W_MAX. `landmarks.perch` is REQUIRED and sits at roughly
// origin + TUNE.PERCH_ABOVE_ORIGIN, inside `bounds` and clear of every rooftop: it is where
// a dead fighter watches from, and TUNE.PERCH (the lobby perch) is 900-3300 studs away,
// past a fog far of 300 and, for two of the three grounds, past the camera's far plane.
//
// -------------------------------------------------------------------------------------
// scripts/world.js - the materializer (§3.4). Owns the live id set and nothing else.
// -------------------------------------------------------------------------------------
//   export function materialize(ctx, mapId): number      // parts queued; builds none yet
//   export function drain(ctx, maxPerTick): number       // parts still queued afterwards
//   export function release(ctx): void                   // removes every id, restores lobby lighting
//   export function liveCount(): number
//   export function liveColliderCount(): number
//   export function currentMapId(): string | null
//   export function landmarks(): Record<string, Vec3>    // {} before a map is live
//   export function perch(): Vec3                        // landmarks().perch, or TUNE.PERCH
//   export function weaponPads(): PadDef[]               // [] before a map is live
//   export function wardenSpots(): Vec3[]                // [] before a map is live
//   export function bounds(): Bounds | null
//   export function uid(prefix: string): string          // the monotonic runtime id stamp
//   export function reset(): void                        // drops internal state; dispose calls it last
// materialize throws on an unknown mapId and is a no-op if that map is already live.
// drain is the ONLY thing that calls parts.create for a ground, at most maxPerTick per
// tick; it applies that map's lighting on the first drained batch, not before, so the
// sky does not change while the lobby is still the only thing standing. release removes
// every id it made, in creation order, applies LOBBY_LIGHTING and restores TUNE.PERCH as
// the perch. Nothing else in the Place may remove a world part.
//
// A RUNTIME PART ID IS NEVER REUSED, EVER, NOT EVEN ACROSS ROUNDS. `drain` stamps each def
// with `uid(prefix)` immediately before parts.create. Two hard reasons, and uniqueness
// merely WITHIN one build satisfies neither:
//   1. partsById.set(def.id, record) is unchecked, so a reused id silently overwrites the
//      record and LEAKS the old collider, which the dispose gate then reports.
//   2. removePartInternal drops the record, the collider and the lamp but NEVER the part's
//      behaviorStateByPartId entry - that map is cleared only by parts.clear(), which no
//      Place can call. So a rebuilt part with a stable id is handed the PREVIOUS round's
//      behaviour list and initBehaviorRuntime never runs again for the new record: a
//      re-built conveyor or spinner never gets setColliderMotion called for its new
//      collider and carries or sweeps nobody, a touchEvent weapon pad comes back with its
//      old fired/cooldown, and a movingPlatform ticks from a stale prevPos/curPos baseline.
//
// -------------------------------------------------------------------------------------
// scripts/round.js - the state machine and the peer model (§4, §5, §6).
// -------------------------------------------------------------------------------------
//   export function create(ctx, save): Round
//   Round = {
//     update(dt, ctx, peers: PeerView[]): RoundFacts,   // called once per tick, never re-entrant
//     facts(): RoundFacts,                              // the last RoundFacts, no recompute
//     castVote(mapId: string): boolean,                 // false if the vote window is shut
//     joinRound(): void,                                // from the obby prompt, or on spawn
//     leaveRound(): void,                               // STAY IN OBBY, or a manual exit
//     spawnIndex(): number,                             // your rank in the sorted fighter set
//     declareDeath(byPeerId: string | null): void,      // the DYING client calls this about ITSELF
//     noteDamageDealt(amount: number): void,            // feeds the published `dd` tiebreak
//     publishState(ctx, extra: object): void,           // the single net.publish call site
//     onPhase(fn: (phase: string, prev: string) => void): () => void,
//     onWin(fn: (mapId: string, clockLeft: number, byLastStanding: boolean) => void): () => void,
//     debugAdvance(seconds: number): void,              // test seam; clocks only (§17.2)
//     debugSkipTo(phase: string): void,                 // test seam; clocks only (§17.2)
//     dispose(): void,
//   }
// Pure-ish: it reads ctx.time, ctx.services.net and ctx.events and writes nothing to the
// world. It never awards, never saves and never touches the DOM; game.js does that from
// the onWin callback. It is the ONLY module that calls net.publish, and it never calls
// net.send, net.join, net.leave, net.update or net.dispose.
//
// The rules it owns, each of which is a defect that was found in this contract:
//   - SELF_ID, once, at the top. Nothing compares net.self().id raw.
//   - THE WIN PREDICATE IS A LATCH. `alive == {SELF_ID}` wins only when `sawOpponent` is
//     true - some tick since `fight` began saw the alive set hold two or more. Set once,
//     never cleared inside a round. Without it, whenever you are the only fighter (offline,
//     or a full room where everybody else chose STAY IN OBBY) the round was won on tick 1
//     of `fight` at zero risk, which made ROUND_CAP_S, every WARDEN_* row and the whole of
//     §9 dead content. It cannot be repaired by testing roster size: that is the forbidden
//     branch on the server existing (ARCHITECTURE §9.2).
//   - `scored` is a per-round flag, set when game.js's award block runs and cleared on
//     entry to `fight`, and the block runs AT MOST ONCE. The predicate is per-tick and
//     stays true for the rest of `fight` and all of `result`, so without the flag one round
//     added roughly 480 Fighting Points and 480 lifetime wins - enough to hand out both
//     unlocks - and only the Oofbux were capped.
//   - `fightersAtStart` is frozen at the intermission -> fight edge: SELF_ID if joining,
//     plus every NON-STALE peer publishing jn:1. At 0 the fight is skipped entirely, the
//     ground is released and intermission re-runs. At 1, with no opponent ever seen, the
//     only wins are the cap and breaking all three Wardens (§9.6).
//   - The alive set emptying for ANY reason - simultaneous deaths, departures, staleness -
//     ends `fight` immediately with no winner. Otherwise a dead player whose opponents
//     closed their tabs sat in a fight with no fighters until the cap.
//   - CAP EXPIRY SETTLES. Every client force-publishes its final hp and dd, and the winner
//     is computed TUNE.RESULT_SETTLE_S later: highest hp among non-stale living fighters,
//     ties on dd, then the lowest id. Publishing is throttled and the relay adds latency,
//     so a divergent view double-awards; the settle window bounds that and the dd tiebreak
//     stops the same lowest-id player winning every full-HP stalemate.
//   - CONDUCTOR. The candidate set is YOURSELF plus every peer whose state carries
//     v: TUNE.STATE_V, so it is never empty; lowest id conducts. A conductor stale past
//     TUNE.CONDUCTOR_STALE_S is skipped and the next-lowest takes over, with no message.
//   - ADOPTION IS SEPARATE FROM SLEWING, and a joiner may not conduct. On boot, if any
//     non-stale peer publishes ph "fight" or "result", adopt that phase and clock and sit
//     the round out as a non-fighter (al:0, jn:0, no vote) until the next intermission. A
//     client may not be conductor until it has adopted a phase this way. A phase mismatch,
//     or drift past TUNE.CLOCK_TOLERANCE_S held for TUNE.RESYNC_AFTER_S, SNAPS to the
//     conductor rather than ignoring it.
//   - THE CONDUCTOR RESOLVES THE GROUND and every follower materializes its published `mp`.
//     Ties break to the lowest MAPS index, with no conductor term (the conductor is
//     recomputed every tick, so "the conductor's own vote" differed per client, and it may
//     not have voted at all). With no votes the ground is MAPS[roundIndex % MAPS.length]
//     with roundIndex adopted from the conductor - never a per-client rotation counter,
//     which a joiner and a STAY-in-obby player do not share. At `fight` entry a client
//     whose resolved map differs from the non-stale conductor's `mp` releases and
//     re-materializes the conductor's map: the grounds sit in different origin bands, so
//     two clients on two grounds can never connect a hit and each fights alone believing
//     the round is shared.
//   - PUBLISH SHAPE. Every client publishes its own ph and t (t rounded to a WHOLE second);
//     only the conductor's are read by anybody. That is the keepalive, not redundancy - a
//     follower whose blob omitted t was byte-identical tick after tick, net.publish dropped
//     it, `move` is suppressed while standing still, and net.js evicted a real connected
//     player at 15 s with a `bye`. Whole seconds keep a full room near 20 relayed messages
//     a second instead of 100. Publish at least every TUNE.KEEPALIVE_S regardless.
//   - `hit` and `ki` ARE ONE-SHOT AND MUST BE NULLED on the publish immediately after the
//     one that carried them. The relay caches the last blob per connection and hands it to
//     every new joiner in the welcome, so a stale hit was applied by a reloading or
//     late-joining player at full HP, and a hit published at the end of round N was applied
//     again after resetForRound in round N+1. The victim keeps a per-peer MONOTONIC
//     HIGH-WATER sequence, reset at every entry to `fight` - not a fixed-size ring, whose
//     evicted keys let the same hit land twice in a long round. A hit is ignored unless
//     to === SELF_ID, s > that peer's high-water, and ph === "fight".
//   - `ki.by` IS A PEER ID ONLY FOR A PUBLISHED PLAYER HIT. It is null for a Warden lunge,
//     a void death and every other cause, and A WARDEN IS NEVER NAMED ON THE WIRE - no
//     index, no name - because a prop reported as a killer is what ARCHITECTURE §9 forbids,
//     and a peer reading ki.by === SELF_ID must never be credited a kill nobody made.
//   - STALENESS IS THE PLACE'S JOB, not peer.at's: remember ctx.time each tick a peer's
//     state JSON changes and compare against it. TUNE.PEER_STALE_S applies to the alive
//     set, the vote tally, the fighter set, the cap comparison and the spectate list.
//   - debugAdvance / debugSkipTo subtract from clocks and nothing else. They are test-only
//     and nothing in the Place ever calls them (§17.2).
//
// -------------------------------------------------------------------------------------
// scripts/combat.js - swings, HP, inventory, hit publication (§7, §8).
// -------------------------------------------------------------------------------------
//   export function create(ctx, round: Round): Combat
//   Combat = {
//     update(dt, ctx, facts: RoundFacts, peers: PeerView[], wardens: WardenView[]): void,
//     swing(ctx): SwingResult | null,                   // null while on cooldown
//     giveWeapon(weaponId: string): boolean,            // false for an unknown id
//     dropWeapon(): string | null,                      // the id dropped, for the pad
//     heldWeapon(): object,                             // a WEAPONS row; the fist row when empty
//     setSkin(skinId: string | null): void,
//     hp(): number,
//     damageDealt(): number,                            // this round, for the published `dd`
//     applyIncoming(hit: object, fromPeerId: string): boolean,   // the VICTIM applies it to ITSELF
//     takeWardenHit(damage: number): boolean,           // true if it killed you
//     resetForRound(ctx, startingAxe: boolean): void,   // full HP, the axe if unlocked
//     untouched(): boolean,                             // for the Untouched badge
//     syncPeerProps(ctx, peers: PeerView[]): void,      // the peers' weapon props, below
//     debugAdvance(seconds: number): void,              // test seam; the regen clock only
//     dispose(ctx): void,
//   }
//   SwingResult = { kind: "miss"|"whiff"|"player"|"warden", targetId: string|null,
//                   damage: number, killed: boolean, seq: number }
// Distance and arc are hand-rolled: there is no AABB overlap query on ctx, and a sensor
// part is invisible to physics.raycast through ctx, so neither can find a target. Facing
// comes from ctx.player.avatar.rotation.y (RADIANS, per rendered frame - see Yaw above).
// A target must be within [minRangeOf(w), w.range] and clear BOTH gates: the flat-plane
// facing dot above TUNE.HIT_CONE_DOT and inside arcDeg / 2. Inside minRange the result is
// "whiff", which is the only price reach pays.
//
// A hit on a player is PUBLISHED and never applied locally; a hit on a Warden is applied
// locally and published to nobody, because a Warden is a prop. applyIncoming honours
// TUNE.IFRAME_S PER ATTACKER - lastHitAt keyed by peer id, never one shared window, or
// three attackers inside 0.35 s would deal one hit between them and being outnumbered
// would be safer than a duel - and returns false for a duplicate, an expired hit, a hit
// not addressed to SELF_ID, a hit aimed at a client that is not a FIGHTER in the round
// that is running (§5.5, §12.2: during `fight` the phase gate and the death latch both pass
// on a client that answered STAY IN OBBY or was adopted out by §5.3, and landing damage on
// it would shake the camera 260 studs up a rage obby with the HP card hidden), or any hit
// at all outside `fight`.
//
// AND SELF_ID IS A LIVE READ, NOT A BOOT-TIME CONSTANT. init runs synchronously and net.js
// names us only inside the relay's `welcome`, so an id frozen at create stays "local" for
// the life of every populated room and the address gate above refuses every real hit.
// `round` is passed in for exactly this: round.selfId is a live getter over the one
// substitution this Place makes, and the guards keyed by it (hiSeq, lastHitAt) are cleared
// when it changes, or a high-water from the old identity would survive the handover.
//
// CONNECT FEEDBACK FOLLOWS THE VICTIM, NOT THE SWING. The swing's `whoosh` is local and
// immediate; the connect feedback (oof, the spark, camera.shake) fires off the victim's
// next published hp DROP. Off the local swing result it told two attackers they connected
// when the victim had discarded their hits.
//
// REGEN: TUNE.REGEN_PER_S back, TUNE.REGEN_DELAY_S after the last damage TAKEN, capped at
// TUNE.HP_MAX, applied by the victim to itself and visible through the published hp.
// Suspended by a Warden lunge as well as a player hit.
//
// PEER WEAPON PROPS. Publishing `sk` draws nothing on anybody else's rig: `remotes` is the
// shell's and is not on ctx, a roster row carries no Object3D, and ctx.services.avatar acts
// only on the local player. So each client reads every peer's wp/sk and builds its OWN
// parts.create prop at that peer's pos/yaw - up to 19, canCollide:false, repositioned each
// tick - removes a peer's prop on `bye`, and sweeps the set in dispose. Budget them against
// TUNE.MAP_PARTS_MAX. Your own held weapon is a parts.create part too, repositioned each
// tick, and NOT parented to ctx.player.avatar: rigRoot is built once at boot and only
// HIDDEN at teardown, a mesh added with avatar.add() is not in parts' tracked set so
// parts.clear() never removes it, and as a CHILD of rigRoot it does not change
// scene.children.length - which is all disposePlace compares. A weapon left on the rig is
// worn in the Hub with nothing reporting it. If something must be parented there, it is
// explicitly avatar.remove()d and its geometry/material dispose()d in dispose.
//
// This module owns the swing sfx and the hit spark, and sweeps both in dispose.
//
// -------------------------------------------------------------------------------------
// scripts/wardens.js - the Rogue Wardens (§9). Local props, never peers.
// -------------------------------------------------------------------------------------
//   export function create(ctx): Wardens
//   Wardens = {
//     spawnAll(ctx, spots: Vec3[]): void,
//     update(dt, ctx, playerFeet: Vec3, playerIsFighting: boolean): WardenHit | null,
//     list(): WardenView[],
//     damage(index: number, amount: number): boolean,   // true if that broke it
//     brokenCount(): number,
//     allBroken(): boolean,                             // the solo win condition (§9.6)
//     debugAdvance(seconds: number): void,              // test seam; timers only
//     clear(ctx): void,                                 // removes every part; round end and dispose
//   }
//   WardenView = { index: number, position: Vec3, hp: number, awake: boolean,
//                  state: "asleep"|"walking"|"telegraph"|"lunging"|"broken",
//                  speed: number, lostFor: number }
//   WardenHit  = { index: number, damage: number }      // only ever during "lunging"
// update returns a hit ONLY from inside the lunge window, at most one per
// TUNE.WARDEN_HIT_COOLDOWN_S per Warden, and returns null whenever the player is not a
// living fighter. Nothing here publishes, nothing here reads the roster, and nothing here
// appears in RoundFacts.alive, in net.count(), in a published ki.by or in the spectate
// target list.
//
// THE DRUM IS A SENSOR: canCollide:false WITH one behaviour, never a solid body. Solid, a
// collider of radius r holds the player at >= r + 1 studs centre to centre so TUNE.WARDEN_
// TAG_R could never be reached, and a solid part moved with setPosition has no collider
// motion so it SHOVES the player through penetration resolution instead of pushing them.
// No drum exceeds TUNE.WARDEN_BODY_W_MAX studs wide.
//
// REACHABILITY IS THE MECHANIC. A Warden that cannot close on its target for
// TUNE.WARDEN_LOST_S reassembles at the target's own platform. Both the forest and the city
// are built around canopy walkways and rooftops, so without it standing still up high for
// 240 s was a free Fighting Point plus the `untouched` and `photo-finish` badges - and the
// 1000-win unlock became eighty hours of standing still. allBroken() is what ends a solo
// round as a win, in sixty to ninety seconds of engaged play rather than four minutes.
//
// -------------------------------------------------------------------------------------
// scripts/obby.js - the six stages, the checkpoints, the interrupt (§11).
// -------------------------------------------------------------------------------------
//   export function create(ctx, save): Obby
//   Obby = {
//     enter(ctx, stageIndex: number): void,             // teleports and sets the checkpoint
//     leave(ctx): void,                                 // hands the checkpoint back to the round
//     onPadTouched(ctx, event: string): StageEvent|null,
//     update(dt, ctx, facts: RoundFacts): void,
//     inObby(): boolean,
//     stageIndex(): number,                             // the stage you are standing in
//     cleared(): number,                                // save.obbyStage: stages CLEARED, 0..6
//     setReversalPhase(ctx, which: number): void,        // the paired-part reversal, below
//     dispose(ctx): void,
//   }
//   StageEvent = { kind: "checkpoint"|"cleared", stageIndex: number, oofbux: number }
// It calls ctx.player.setCheckpoint and NEVER uses the checkpoint behaviour, for the
// monotonic-gate reason in §11.1. `oofbux` is non-zero only on a stage's first ever clear
// and is stageOofbux(stageIndex) - indexed by the CLEARED stage's 0-based index; game.js is
// what awards it and what saves, and save.paidStages holds stage IDS. The stay-or-join
// prompt is NOT owned here: obby.js only answers inObby(), and hud.js draws the prompt.
//
// A STAGE IS CLEARED ONLY WHEN ITS OWN ENTRY PAD WAS TOUCHED BEFORE ITS EXIT PAD - a
// sequence check, not a high-water touch. Otherwise the exit pad can be reached from
// outside, which flight (§13.2) made trivial: hovering up the column at FLY_SPEED/FLY_RISE
// touched the `error` stage's pads directly and unlocked the 12000-Oofbux Glitchsteel skin
// without playing a stage. Flight is refused while inObby() for the same reason; these are
// two locks on one door. On a clear, save.obbyStage = max(save.obbyStage, i + 1).
//
// NOTHING IN THIS OBBY "REVERSES" A BEHAVIOUR PARAM. initBehaviorRuntime reads
// params.direction/speed/axis exactly ONCE into physics.setColliderMotion, which is not on
// ctx.engine.physics at all, and nothing on ctx.engine.parts can rewrite a behaviour param
// afterwards; hand-rotating a spinner does not work either, because applyInterpolation
// overwrites the quaternion from the behaviour's own prevQuat/curQuat every frame and a
// hand-moved part has no angularVel so it sweeps nobody. So every reversal - stage 5's
// conveyors, stage 6's spinner - is TWO OPPOSED PARTS, and setReversalPhase alternates
// which one is solid with ctx.engine.parts.setCanCollide: turning canCollide off
// re-registers that collider as a SENSOR, and a sensor carries nobody. Both parts carry
// behaviours, so neither is instanced and both are mutable.
//
// EVERY PART THIS MODULE MUTATES IS A RUNTIME PART OR CARRIES A BEHAVIOUR. An anchored,
// behaviourless place.json part in a bucket of two or more is InstancedMesh'd and
// permanently immutable - setColor, setPosition, setCanCollide and remove all THROW, and a
// throw out of update sets updateHalted and kills the Place for the session. The `error`
// stage's flicker label and any plinth glow are therefore parts.create parts, and their
// place.json siblings are static signage only.
//
// Each stage also carries a thin `kill`-behaviour slab about 8 studs under its playable
// volume (a part with a behaviour is never instanced, so this is legal in place.json).
// TUNE.KILL_Y at -40 is the MAPS' death plane and is 300-600 studs below the column: a
// missed jump would fall for two and a half seconds before the engine's own 1.0 s respawn
// delay even began, on stages whose whole design is repeated attempts.
//
// -------------------------------------------------------------------------------------
// scripts/shops.js - the four kiosks (§10).
// -------------------------------------------------------------------------------------
//   export function open(ctx, which: "hats"|"emotes"|"skins"|"vault", save, handlers): void
//   export function close(ctx): void
//   export function isOpen(): boolean
//   handlers = { onBuy(kind, id, price): "bought"|"owned"|"denied",
//                onEquip(kind, id): void,
//                onSpendPoints(): boolean,               // the 100-point unlock
//                onClaimWings(): boolean }               // re-attempt the Catalog grant ONLY
// One panel at a time: a second openPanel silently closes the first, so open() closes
// its own panel before opening another, and close() is called from dispose because the
// platform never closes a Place's panel for it. A row is marked owned ONLY when
// economy.spend returned true. Prices and reasons come from HATS / EMOTES / SKINS above
// and are never written inline anywhere else.
//
// onBuy RETURNS EARLY WITH "owned" - an already-owned toast, and no spend() call - when the
// id is in the owned list, or, for a hat, when ctx.services.avatar.owns(catalogId) is true.
// An owned row renders as EQUIP and is never a BUY target. Without that guard a second tap
// on the Golden Hat called spend(1000, ...) again and succeeded, and a player who already
// owned hat_golden from anywhere else on the platform - or whose local ownedHats was reset
// by a field-level fallback - was charged 1000 Oofbux for a hat already on their head.
//
// onSpendPoints is enabled only when `points >= TUNE.LUCK_UNLOCK_POINTS && !startingAxe`,
// and writes `points -= 100; pointsSpent += 100;` in ONE forced save().
//
// onClaimWings SPENDS NOTHING and is safe to press repeatedly: it only re-attempts
// avatar.grantItem(WINGS_CATALOG_ID, "showdown") and checks r.ok === true. It is shown only
// when `fly && !avatar.owns(WINGS_CATALOG_ID)`. `fly` itself is DERIVED from lifetimeWins
// (unlocksFor above) and is never claimed, so there is no button that can be pressed twice
// and nothing that can be lost.
//
// -------------------------------------------------------------------------------------
// scripts/hud.js - the one game-owned DOM root (§15).
// -------------------------------------------------------------------------------------
//   export function create(ctx, handlers): Hud
//   Hud = {
//     update(dt, ctx, view: HudView): void,             // throttled to TUNE.HUD_REFRESH_S
//     prompt(kind: "obby-choice", seconds: number, onPick: (choice: string) => void): void,
//     dismissPrompt(): void,
//     toastLocal(text: string): void,                   // the in-world banner, not ui.toast
//     dispose(): void,
//   }
//   HudView  = { phase, clock, votes, voteOpen, myVote, mapName, hp, weapon, skin, alive,
//                points, lifetimeWins, dead, spectating, spectateName, canFly, flying,
//                inObby, stageName, wardens }
//   handlers = { onSwing, onEmote, onFly, onSpectateNext, onSpectatePrev, onShop,
//                onVote, onObbyEnter, onObbyLeave }
// ONE position:fixed;inset:0;pointer-events:none;z-index:TUNE.UI_Z root on document.body,
// inline styles only, pointer-events:auto on the interactive children, every target at
// least TUNE.TOUCH_MIN_PX across, removed in dispose. Every control in this Place is a
// DOM button because input.setActionButtons is not on ctx.
//
// THE LIVE VOTE TALLY AND ITS COUNTDOWN ARE DOM, and so are three vote buttons - the SAME
// onVote code path as the plinths, live wherever you are for as long as voteOpen is true,
// including while inObby(). The vote window is the first 20 s of intermission and the obby
// is 600 studs west and 260 studs up with no fast way back, so a plinth-only vote silently
// cost you your vote every round you spent in the thing the Place tells you to play while
// you wait. A place.json part cannot carry changing text at all: the `text` behaviour
// rasterises its string ONCE onto a 256x64 canvas at construction, is capped at 60
// characters, and there is no setText anywhere on ctx.engine.parts. The in-world board is a
// runtime ctx.engine.parts.addCustom(sprite) canvas created in init, redrawn at most every
// TUNE.HUD_REFRESH_S, with its texture and material dispose()d by hand in dispose - the
// zero-leak gate will not catch a miss.
//
// The stay-or-join prompt is built here and NOT with ui.dialog, which queues FIFO and can
// express neither a visible countdown nor an auto-default.
//
// HUD chips go through ui.setHudStat, which the platform does clear on dispose.
//
// -------------------------------------------------------------------------------------
// game.js - lifecycle and orchestration only. No world building, no combat maths.
// -------------------------------------------------------------------------------------
//   export const meta = { slug: "showdown", name: "Showdown", icon: "🏆",
//                         description: "...", version: "1.0.0" };   // static literal
//   export function init(ctx): void
//   export function update(dt, ctx): void        // first line: if (!S) return;
//   export function dispose(ctx): void
//   export function debugState(): object         // the §17.2 field list, exactly
//   export function debugAdvance(seconds): void  // TEST ONLY: subtracts from the current
//                                                // phase clock and from pad, warden, regen,
//                                                // emote and prompt timers. Nothing else.
//   export function debugSkipTo(phase): void     // TEST ONLY: drives the current phase to
//                                                // its last tick.
// The two debug exports are mandatory, not a convenience, and this is why: sim time can
// never outrun real time. loop.js is a wall-clock accumulator clamped to 6 steps (0.1 s of
// sim) per rendered frame, smoke's WAIT_SIM_WALL_LIMIT_MS caps one waitSim at 15 s of WALL
// time, and SwiftShader renders 2.0-4.5 fps - 0.25-0.45 sim seconds per wall second,
// measured and written down in tools/smoke.js. One cycle of this Place is 40 + 240 + 8 =
// 288 sim seconds, i.e. 640-1150 wall seconds against a SCENARIO_TIMEOUT_MS of 120000 and
// against the largest per-scenario budget any scenario in this repo asks for. Merely
// reaching `fight` once exceeds the default budget, and no scenario in the repo waits past
// 4.6 sim seconds - so a read-only seam would ship a mandatory gate that covered nothing.
// Extra exports are legal (04:V3 pins only `meta`) and neither name is a banned identifier
// under 04:V6. scenario:showdown drives them and registers an explicit timeoutMs.
//
// One module-level `let S = null`, set in init, nulled as the last line of dispose. One
// unsub bag: every ctx.events.on, every input.onAction and every net.on unsub goes in it
// and is released in dispose, because onAction and net.on unsubs are NOT auto-cleared and
// a leaked swing handler would fire inside the Hub. One drained timer array for one-shots,
// ticked from dt, because no timer API may be named under src/games.
//
// game.js owns: the save (load, validate against freshSave, derive unlocksFor, debounce,
// force); every economy.award and badges.award, behind the §4.2 `scored` latch; the
// sd:state event; the emote and flight gates (emotes refused while a living fighter in
// `fight` AND while spectate is armed, since §12 owns the per-tick teleport; flight refused
// in `fight`, refused while inObby(), and clamped to the live ground's bounds or the lobby
// band); the spectate ghost and its UNCONDITIONAL disarm on the fight -> result edge and in
// dispose (walk 16, jump 50, camera.reset(), halo removed, avatar.visible = true, teleport
// to the lobby pad, checkpoint handed back) plus re-targeting when the tracked id leaves the
// roster; BOTH §4.1 transitions (fight entry: setCheckpoint(world.perch()) -> teleport(
// spawns[rank]) -> full HP -> the axe; result -> intermission: teleport everyone to the
// lobby pad and hand the checkpoint back BEFORE world.release(), or the winner drops through
// a released floor and dies at KILL_Y in a race with the phase flip); and the order in which
// the modules above are updated each tick:
//   world.drain -> round.update -> wardens.update -> combat.update -> obby.update ->
//   spectate/fly -> hud.update -> publish -> save-if-dirty -> sd:state-if-dirty.
//
// dispose(ctx) additionally calls ctx.engine.camera.reset(). The platform does NOT restore
// the camera between Places: teardown() clears HUD chips, hides the rig and disables
// physics, and disposePlace's physics.clear() restores walk speed 16, jump power 50 and
// gravity 196.2 - but nothing calls cameraCtl.reset(), so §12's setDistance(46) /
// setPitch(-28) / setOffset([0,14,0]) would follow the player into the Hub.
// =====================================================================================
