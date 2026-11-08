// src/games/pighide/scripts/config.js - PIG HIDE's frozen contract (spec 27 §2.1, M16-T01).
//
// Pure data plus pure helpers. This module imports NOTHING and touches no ctx, no THREE,
// no DOM and no browser global, and it has no side effects at module scope, so
// tools/validate.js can import() it under Node (rules:27) and six builders can code
// against it in parallel.
//
// House rules for every line below:
//   - colours are lower-case six-digit hex (the part schema rejects uppercase)
//   - every number is quoted from spec 27 (mostly the §6.3 TUNE table); nothing here is
//     invented, and the few derived aliases say which spec number they repeat
//   - wins are THRESHOLDS on lifetime wins, never spent (§5). Only skins cost Oofbux
//   - the save mutators below are the ONLY code that edits a Save; callers persist it
//
// The exported data is deep-frozen. `newShared()` and `defaultSave()` return fresh,
// mutable objects (the shared state S and the Save are written every tick).

function deepFreeze(o) {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const k of Object.keys(o)) deepFreeze(o[k]);
  }
  return o;
}

export const STATE_V = 1;   // §4.6 wire version
export const SAVE_V = 1;    // §11.1 save version

// =====================================================================================
// TUNE - spec 27 §6.3, plus the numbers quoted in §4, §7, §8, §9 and §10.
// The table's "A / B / C" rows are split into one key each (PUNCH_DMG, PUNCH_RANGE,
// PUNCH_CD). Where a sibling module might reasonably spell a key with an `_S` suffix the
// alias is given too; aliases always equal their source key.
// =====================================================================================

export const TUNE = deepFreeze({
  // --- players and round clock (§4.2-§4.4) ----------------------------------------------
  MIN_PLAYERS: 2,
  MAX_PIGS: 23,
  HIDE_S: 30,
  SEEK_S: 270,
  ROUND_S: 300,               // HIDE_S + SEEK_S: "each round is 5 minutes"
  RESULT_S: 8,
  START_HOLD_S: 10,

  // --- freshness and the conductor (§4.1, §4.2) ------------------------------------------
  PEER_STALE_S: 4,
  PEER_SILENT_S: 20,
  CONDUCTOR_STALE_S: 3,
  CLOCK_TOLERANCE_S: 2,
  RESYNC_AFTER_S: 3,
  PIG_ABSENT_S: 15,
  HUNTER_ABSENT_S: 10,

  // --- wire (§4.6) ------------------------------------------------------------------------
  PUBLISH_MIN_S: 0.2,
  HIT_HOLD_S: 1.5,            // §4.7 a hit stays on the wire this long (victims dedupe by seq)
  RESULT_SETTLE_S: 1.5,       // §4.8 seek clock at 0 waits this long for a last cg:1
  STALL_FORFEIT_S: 4,         // §4.8 a pig whose own sim stalled this long sits the round out
  KEEPALIVE_S: 5,
  HEARTBEAT_MOD: 1000,        // k = floor(now) % 1000
  BLOB_MAX_BYTES: 3500,       // worst case must stay under this (rules:27 P5)
  WIRE_MAX_BOMBS: 4,          // sanitize: bm <= 4 entries
  WIRE_MAX_HITS: 24,          // sanitize: hits <= 24 entries
  WIRE_MAX_ID: 64,            // sanitize: ids are strings <= 64
  WIRE_MAX_SEQ: 1e9,          // sanitize: th / fl clamp
  WIRE_MAX_HP: 200,           // sanitize: hp clamp
  WIRE_BOUNDS_PAD: 20,        // sanitize: coords inside PLACE_BOUNDS padded by 20
  POS_ROUND: 0.1,             // clone positions on the wire
  YAW_ROUND: 0.01,            // clone yaw on the wire

  // --- HUD and rigs (§9.0, §10.1) ---------------------------------------------------------
  HUD_REFRESH_S: 0.25,
  RIG_PAIR_S: 0.25,
  RIG_PAIR_R2: 16,
  TOUCH_MIN_PX: 56,
  BOTTOM_CLEAR_PX: 176,
  LOBBY_LIST_MAX: 8,

  // --- platform defaults (§15.4) ----------------------------------------------------------
  WALK_DEFAULT: 16,
  JUMP_DEFAULT: 50,
  GRAVITY_DEFAULT: 196.2,
  WALK_MAX: 100,              // ctx.player.setWalkSpeed clamp

  // --- pigs (§5, §7) ----------------------------------------------------------------------
  PIG_HP: 100,
  STRONG_HP: 200,
  DASH_WALK: 32,
  DASH_S: 5,
  DASH_CD_S: 30,
  DASH_TRAIL_S: 0.15,         // §7.2 fx.dust every 0.15 s
  CREEP_S: 3,
  CREEP_MULT: 20,
  CREEP_WALK: 100,
  CREEP_TARGET_SPEED: 320,    // CREEP_MULT * WALK_DEFAULT (§7.4)
  CREEP_SKIN: 0.9,            // §7.4 raycast margin
  CREEP_RAY_Y: 1.2,           // §7.4 ray origin height
  CREEP_MIN_V: 1,             // §7.4 supplement only when |v| > 1
  CREEP_OPACITY: 0.3,         // §7.4 local look opacity
  PLANE_S: 5,
  PLANE_CD_S: 60,
  PLANE_ARRIVE_S: 1.0,
  PLANE_LEAVE_S: 1.0,         // §7.5 departure fade
  PLANE_SPEED: 60,
  PLANE_RISE: 24,
  PLANE_CEIL_Y: 70,
  PLANE_FLOOR_Y: 1,           // §7.5 clamp(y, 1, 70)
  PLANE_START_DIST: 120,      // §7.5 appears 120 studs away
  PLANE_START_UP: 40,         // §7.5 ...and 40 studs above
  BALL_S: 10,
  BALL_WALK: 48,
  BALL_DIAMETER: 3,           // §7.6
  BALL_SPIN_DIV: 1.5,         // §7.6 spin rate |v| / 1.5 rad/s
  THUMP_S: 2,
  THUMP_CD_S: 15,
  THUMP_SHAKE: 0.7,
  THUMP_LOBBY_R: 30,
  THUMP_PITCH: 0.5,           // §7.6 pop sfx pitch
  BOAR_WALK: 32,
  SWAP_CD_S: 50,
  SWAP_MIN_DIST: 2,           // §7.8 clone must be >= 2 studs away
  CLONE_MOVE_DEBOUNCE_S: 1,
  RADAR_S: 5,
  RADAR_CD_S: 45,
  RADAR_NEED: 1000,           // §5 Pig Radar: 1000 lifetime pig wins

  // --- hunter weapons (§8) ----------------------------------------------------------------
  PUNCH_DMG: 20,
  PUNCH_RANGE: 4.5,
  PUNCH_CD: 0.6,
  PUNCH_CD_S: 0.6,
  SWORD_DMG: 34,
  SWORD_RANGE: 6.5,
  SWORD_CD: 0.55,
  SWORD_CD_S: 0.55,
  MELEE_ARC_DEG: 120,
  GLOCK_DMG: 25,
  GLOCK_RANGE: 80,
  GLOCK_CD: 0.35,
  GLOCK_CD_S: 0.35,
  GLOCK_PITCH: 1.6,           // §8.4 pop sfx pitch
  AIM_CONE_DEG: 14,
  AIM_LOS_SLACK: 1,           // §8.1 LOS ok if hit.distance >= dist - 1
  BOMB_DMG: 120,
  BOMB_RADIUS: 18,
  BOMB_FUSE: 5,
  BOMB_FUSE_S: 5,
  BOMB_CD: 5,
  BOMB_CD_S: 5,
  BOMB_MAX_LIVE: 2,
  BOMB_PITCH: 0.4,            // §8.5 pop sfx pitch
  RPG_DMG: 100,
  RPG_RADIUS: 10,
  RPG_CD: 2,
  RPG_CD_S: 2,
  RPG_SPEED: 90,
  RPG_RANGE: 140,
  RPG_PROX: 2.5,
  RPG_SHOULDER: 0.6,          // §8.7 eye + right * 0.6
  DETECT_S: 1,
  DETECT_CD: 50,
  DETECT_CD_S: 50,
  DETECT_PULSE_HZ: 8,         // §8.8 opacity 0.6 <-> 1.0 at 8 Hz
  DETECT_PITCH: 0.7,          // §8.8 chime sfx pitch
  FLASH_S: 5,
  FLASH_CD: 70,
  FLASH_CD_S: 70,
  FLASH_CONE_S: 0.5,          // §8.9 helmet light cone drawn for 0.5 s
  BLIND_FADE_S: 0.6,

  // --- x-ray (§9.5) -----------------------------------------------------------------------
  XRAY_RED: "#ff1a1a",
  XRAY_YELLOW: "#ffff00",
  XRAY_OPACITY: 0.9,
  XRAY_FADE_S: 0.3,           // yellow fades in and out over 0.3 s
  XRAY_RENDER_ORDER: 1000,

  // --- spectating, camera, geometry (§4.9, §8, §9) ----------------------------------------
  SPECTATE_UP: 26,
  SPECTATE_DIST: 40,
  SPECTATE_PITCH: -35,
  EYE_Y: 4.5,
  PIG_CENTER_Y: 1.2,
  LEG_SWING_DEG: 30,          // §9.1
  STRONG_SCALE: 1.25,         // §9.1 strong pig body width
  BOAR_DARKEN: 0.8,           // §9.1 boar palette multiplier
  SPARKLE_EMISSIVE: 0.4,      // §9.1 "sparkle" pattern
  RAINBOW_HZ: 0.2,            // §9.1 "rainbow" pattern
  VISOR_GLOW: 1.2,            // §9.2 hunter visor emissive

  // --- scoring (§4.8, §12) ----------------------------------------------------------------
  CLOSE_CALL_HP: 20,
  CLEAN_SWEEP_N: 3,
  LOBBY_RETURN_N: 12,
  PIG_DROPS_N: 16,
  WIN_MAX: 1e9,               // §11.2 integers clamp to 0..1e9
});

// =====================================================================================
// Abilities (§7, §8). `label` is the button's aria-label (§10.1 table). `slot` is the
// key: E = first ability, Q = second, T = the Pig Radar item.
// =====================================================================================

export const ABILITIES = deepFreeze({
  dash: { id: "dash", name: "Speed Boost", icon: "⚡", label: "Speed Boost", side: "pig",
    cooldownS: TUNE.DASH_CD_S, durationS: TUNE.DASH_S, perRound: false, slot: "E" },
  creep: { id: "creep", name: "Creep", icon: "🥷", label: "Creep", side: "pig",
    cooldownS: 0, durationS: TUNE.CREEP_S, perRound: true, slot: "E" },
  plane: { id: "plane", name: "Call Plane", icon: "✈️", label: "Call Plane", side: "pig",
    cooldownS: TUNE.PLANE_CD_S, durationS: TUNE.PLANE_S, perRound: false, slot: "E" },
  ball: { id: "ball", name: "Ball Roll", icon: "⚽", label: "Ball Roll", side: "pig",
    cooldownS: 0, durationS: TUNE.BALL_S, perRound: true, slot: "E" },
  thump: { id: "thump", name: "Thump", icon: "💥", label: "Thump", side: "pig",
    cooldownS: TUNE.THUMP_CD_S, durationS: TUNE.THUMP_S, perRound: false, slot: "Q" },
  clone: { id: "clone", name: "Make Clone", icon: "🧬", label: "Make Clone", labelMove: "Move Clone",
    side: "pig", cooldownS: TUNE.CLONE_MOVE_DEBOUNCE_S, durationS: 0, perRound: false, slot: "E" },
  swap: { id: "swap", name: "Swap With Clone", icon: "🔄", label: "Swap With Clone", side: "pig",
    cooldownS: TUNE.SWAP_CD_S, durationS: 0, perRound: false, slot: "Q" },
  radar: { id: "radar", name: "Pig Radar", icon: "📡", label: "Pig Radar", side: "pig",
    cooldownS: TUNE.RADAR_CD_S, durationS: TUNE.RADAR_S, perRound: false, slot: "T" },
  detect: { id: "detect", name: "Pig Detector", icon: "🚨", label: "Pig Detector", side: "hunter",
    cooldownS: TUNE.DETECT_CD_S, durationS: TUNE.DETECT_S, perRound: false, slot: "E" },
  flashlight: { id: "flashlight", name: "Flashlight", icon: "🔦", label: "Flashlight", side: "hunter",
    cooldownS: TUNE.FLASH_CD_S, durationS: TUNE.FLASH_S, perRound: false, slot: "Q" },
});

export const ATTACK_LABEL = "Attack";   // §10.1 hunter primary aria-label (F / left click)

// =====================================================================================
// Weapons (§8). The "glock" is the user's label for a chunky cartoon toy blaster that
// fires oof pellets (§1 FLAG 22). Copy says "tag" / "catch".
// =====================================================================================

export const WEAPONS = deepFreeze({
  punch: { id: "punch", name: "Punch", icon: "👊", kind: "melee", damage: TUNE.PUNCH_DMG,
    range: TUNE.PUNCH_RANGE, cooldownS: TUNE.PUNCH_CD, arcDeg: TUNE.MELEE_ARC_DEG },
  sword: { id: "sword", name: "Wooden Sword", icon: "🗡️", kind: "melee", damage: TUNE.SWORD_DMG,
    range: TUNE.SWORD_RANGE, cooldownS: TUNE.SWORD_CD, arcDeg: TUNE.MELEE_ARC_DEG,
    colors: { blade: "#b98a52", hilt: "#7a4a2a" } },
  glock: { id: "glock", name: "Glock", icon: "🔫", kind: "hitscan", damage: TUNE.GLOCK_DMG,
    range: TUNE.GLOCK_RANGE, cooldownS: TUNE.GLOCK_CD, coneDeg: TUNE.AIM_CONE_DEG },
  bomb: { id: "bomb", name: "Bomb", icon: "💣", kind: "bomb", damage: TUNE.BOMB_DMG,
    range: 0, cooldownS: TUNE.BOMB_CD, radius: TUNE.BOMB_RADIUS, fuseS: TUNE.BOMB_FUSE,
    maxLive: TUNE.BOMB_MAX_LIVE },
  rpg: { id: "rpg", name: "RPG", icon: "🚀", kind: "rocket", damage: TUNE.RPG_DMG,
    range: TUNE.RPG_RANGE, cooldownS: TUNE.RPG_CD, coneDeg: TUNE.AIM_CONE_DEG,
    radius: TUNE.RPG_RADIUS, speed: TUNE.RPG_SPEED, prox: TUNE.RPG_PROX },
});

// =====================================================================================
// Ladders (§5, §6). Order = ladder order; `need` = lifetime wins (thresholds, never spent).
// Classes do not inherit: each rung's kit is exactly its row (one FLAGged exception: the
// Detector Hunter keeps the RPG).
// =====================================================================================

export const PIG_CLASSES = deepFreeze([
  { id: "normal", name: "Normal Pig", icon: "🐷", need: 0, hp: TUNE.PIG_HP, walk: TUNE.WALK_DEFAULT,
    abilities: [], blurb: "A good, honest pig." },
  { id: "speedy", name: "Speedy Pig", icon: "⚡", need: 1, hp: TUNE.PIG_HP, walk: TUNE.WALK_DEFAULT,
    abilities: ["dash"], blurb: "2x speed for 5 seconds. Every 30 s." },
  { id: "strong", name: "Strong Pig", icon: "💪", need: 5, hp: TUNE.STRONG_HP, walk: TUNE.WALK_DEFAULT,
    abilities: [], blurb: "Double HP. Takes twice the catching." },
  { id: "creeper", name: "Creeper Pig", icon: "🥷", need: 10, hp: TUNE.PIG_HP, walk: TUNE.WALK_DEFAULT,
    abilities: ["creep"], blurb: "Turn invisible with 20x speed for 3 s. Once a round." },
  { id: "flying", name: "Flying Pig", icon: "✈️", need: 15, hp: TUNE.PIG_HP, walk: TUNE.WALK_DEFAULT,
    abilities: ["plane"], blurb: "A plane swoops in from nowhere. Fly anywhere for 5 s. Every 60 s." },
  { id: "casoh", name: "Casoh Pig", icon: "🌀", need: 25, hp: TUNE.PIG_HP, walk: TUNE.WALK_DEFAULT,
    abilities: ["ball", "thump"],
    blurb: "Roll as a ball at 3x for 10 s (once a round). THUMP shakes every screen (every 15 s)." },
  { id: "boar", name: "Wild Boar", icon: "🐗", need: 30, hp: TUNE.PIG_HP, walk: TUNE.BOAR_WALK,
    abilities: [], blurb: "Twice as fast as a normal pig, all round long." },
  { id: "scientist", name: "Mad Scientist Pig", icon: "🧪", need: 50, hp: TUNE.PIG_HP, walk: TUNE.WALK_DEFAULT,
    abilities: ["clone", "swap"], blurb: "Make a decoy clone, move it any time, swap bodies every 50 s." },
]);

export const HUNTER_CLASSES = deepFreeze([
  { id: "basic", name: "Basic Hunter", icon: "👊", need: 0, walk: TUNE.WALK_DEFAULT, weapon: "punch",
    abilities: [], blurb: "Catches pigs with a good old punch." },
  { id: "sword", name: "Sword Hunter", icon: "🗡️", need: 1, walk: TUNE.WALK_DEFAULT, weapon: "sword",
    abilities: [], blurb: "A trusty wooden sword with a wide swing." },
  { id: "glock", name: "Glock Hunter", icon: "🔫", need: 5, walk: TUNE.WALK_DEFAULT, weapon: "glock",
    abilities: [], blurb: "A toy blaster that tags pigs from far away." },
  { id: "bomber", name: "Bomb Hunter", icon: "💣", need: 10, walk: TUNE.WALK_DEFAULT, weapon: "bomb",
    abilities: [], blurb: "Plant a bomb every 5 s. 5 s fuse, big boom." },
  { id: "glock-speed", name: "Speed Glock Hunter", icon: "💨", need: 15, walk: 32, weapon: "glock",
    abilities: [], blurb: "The toy blaster plus 2x speed all round." },
  { id: "rpg", name: "RPG Hunter", icon: "🚀", need: 25, walk: TUNE.WALK_DEFAULT, weapon: "rpg",
    abilities: [], blurb: "Launch a rocket every 2 seconds." },
  { id: "detector", name: "Detector Hunter", icon: "🚨", need: 75, walk: TUNE.WALK_DEFAULT, weapon: "rpg",
    abilities: ["detect"], blurb: "Every pig flashes bright red through walls for 1 s. Every 50 s." },
  { id: "amazing", name: "The Amazing Hunter", icon: "🦸", need: 250, walk: TUNE.WALK_DEFAULT, weapon: "rpg",
    abilities: ["detect", "flashlight"],
    blurb: "RPG, Pig Detector, and a flashlight that blinds every pig for 5 s (every 70 s)." },
]);

export const PIG_ITEM = deepFreeze({
  id: "pig-radar", name: "Pig Radar", icon: "📡", need: TUNE.RADAR_NEED, ability: "radar",
  blurb: "Every pig, you included, glows bright yellow through walls for 5 s. Every 45 s. Pigs only.",
});

// =====================================================================================
// Skins (§10.3, §10.4). Cosmetic only, bought with Oofbux. `colors` holds the model's
// slots. `glow` is the emissive intensity the model builder applies (pig "sparkle" and
// "galaxy" patterns 0.4 on the accent; hunters 1.2 on the visor/glow slot).
// =====================================================================================

function pigSkinRow(id, name, icon, price, body, belly, snout, ear, hoof, accent, pattern) {
  const glow = pattern === "sparkle" || pattern === "galaxy" ? TUNE.SPARKLE_EMISSIVE : 0;
  return { id, name, icon, price, colors: { body, belly, snout, ear, hoof, accent }, pattern, glow };
}

export const PIG_SKINS = deepFreeze([
  pigSkinRow("pink", "Normal Pink", "🐷", 0, "#f4a7b9", "#f9c9d4", "#e88aa0", "#e07f97", "#5a3a3a", "#ff6f91", "none"),
  pigSkinRow("mud", "Muddy Pig", "🟤", 40, "#b88a6a", "#d2a98a", "#9a6a4a", "#8a5a3a", "#3a2a1a", "#6b4a2f", "spots"),
  pigSkinRow("spotted", "Spotted Pig", "🐄", 80, "#f7e6dc", "#ffffff", "#f2b5b5", "#e9a0a0", "#3a2a2a", "#2b2b2b", "spots"),
  pigSkinRow("midnight", "Midnight Pig", "🌙", 150, "#2f3a5a", "#45507a", "#5a6aa0", "#2a3350", "#111522", "#88c9e8", "sparkle"),
  pigSkinRow("candy", "Candy Pig", "🍬", 250, "#ff9ad5", "#ffd1ec", "#ff6fb8", "#c86bff", "#7a2a5a", "#7ff7ff", "stripes"),
  pigSkinRow("mint", "Mint Chip", "🍃", 350, "#9be8c8", "#d7fff0", "#6ccfa6", "#5ab890", "#3a2a1a", "#4a2f1f", "spots"),
  pigSkinRow("lava", "Lava Pig", "🌋", 500, "#3a1a12", "#5a2a1a", "#ff6a1a", "#ff4a1a", "#1a0a08", "#ffb21a", "sparkle"),
  pigSkinRow("golden", "Golden Pig", "🌟", 800, "#f2c94c", "#ffe58a", "#d4a428", "#c9971f", "#6b5310", "#fff4b0", "sparkle"),
  pigSkinRow("rainbow", "Rainbow Pig", "🌈", 1500, "#ff8fb1", "#ffffff", "#ffd36f", "#7fd3ff", "#3a2a3a", "#b98aff", "rainbow"),
  pigSkinRow("galaxy", "Galaxy Pig", "🌌", 3000, "#2a1a4a", "#3e2a6e", "#8a6aff", "#5a3ab0", "#0e0a1e", "#ffffff", "galaxy"),
]);

function hunterSkinRow(id, name, icon, price, suit, armor, trim, visor, cape, glow) {
  return { id, name, icon, price, colors: { suit, armor, trim, visor, cape, glow }, pattern: "none",
    glow: TUNE.VISOR_GLOW };
}

export const HUNTER_SKINS = deepFreeze([
  hunterSkinRow("classic", "Classic Hunter", "🎯", 0, "#2f3a4a", "#5d626c", "#d94f4f", "#1a1a24", "#8a1f1f", "#ff4a3a"),
  hunterSkinRow("camo", "Jungle Camo", "🌿", 60, "#3f5a2a", "#6b7a3a", "#2f3a1a", "#1a2412", "#2f4a1a", "#b8ff5a"),
  hunterSkinRow("arctic", "Arctic Ops", "❄️", 120, "#e8f0f8", "#b0c4d8", "#4f8fd9", "#1a2a3a", "#ffffff", "#7fd3ff"),
  hunterSkinRow("crimson", "Crimson Knight", "🛡️", 200, "#4a0f14", "#8a1f2a", "#d4a428", "#140608", "#2b0a0e", "#ff2a3a"),
  hunterSkinRow("neon", "Neon Runner", "🌃", 350, "#14141e", "#2b2b3a", "#ff36c8", "#0a0a12", "#22d3ee", "#22d3ee"),
  hunterSkinRow("desert", "Desert Ranger", "🏜️", 500, "#c9a46a", "#a4824a", "#6b4a2f", "#2a1a0a", "#e8c870", "#ffb21a"),
  hunterSkinRow("shadow", "Shadow Stalker", "🌑", 800, "#0e0e14", "#1e1e28", "#5a3ab0", "#000000", "#14101e", "#b98aff"),
  hunterSkinRow("royal", "Royal Guard", "👑", 1200, "#1f3a8a", "#d4a428", "#ffffff", "#0a1430", "#d94f4f", "#ffe58a"),
  hunterSkinRow("chrome", "Chrome Unit", "🤖", 2000, "#c8ccd4", "#eef1f5", "#5d626c", "#101418", "#8a8f99", "#9cffb0"),
  hunterSkinRow("gold", "Solid Gold", "🏆", 3500, "#d4a428", "#f2c94c", "#fff4b0", "#3a2a08", "#c9971f", "#ffffff"),
]);

// The Amazing Hunter's gold trim override (§9.2).
export const AMAZING_TRIM = "#f2c94c";

// =====================================================================================
// Plane liveries (§7.5): wire value pl = id (0 = not flying).
// livery = 1 + (hash32(selfId + rn + uses) % 3), see planeLivery().
// =====================================================================================

export const PLANE_LIVERIES = deepFreeze([
  { id: 1, name: "Red Biplane", kind: "biplane",
    colors: { body: "#d94f4f", wing: "#f2c94c", trim: "#ffffff", prop: "#3a2a1a", glass: "#88c9e8" } },
  { id: 2, name: "Yellow Seaplane", kind: "seaplane",
    colors: { body: "#f2c94c", wing: "#ffffff", trim: "#1f3a8a", prop: "#2b2b2b", glass: "#7fd3ff", float: "#d94f4f" } },
  { id: 3, name: "Silver Jet", kind: "jet",
    colors: { body: "#c8ccd4", wing: "#8a8f99", trim: "#d94f4f", prop: "#5d626c", glass: "#101418", glow: "#ffb21a" } },
]);

// =====================================================================================
// Badges (§12.3). `id` is the suffix passed to ctx.services.badges.award(id); `full` is
// the registry row in src/platform/services/badges.js. They MUST match one to one
// (rules:27 P1).
// =====================================================================================

export const BADGES = deepFreeze([
  { id: "first-pig-win", full: "pighide.first-pig-win", name: "Still Oinking", icon: "🐷",
    description: "Win your first round of PIG HIDE as a pig.", secret: false },
  { id: "pig-wins-10", full: "pighide.pig-wins-10", name: "Hide Master", icon: "🫥",
    description: "Win 10 rounds as a pig.", secret: false },
  { id: "pig-wins-50", full: "pighide.pig-wins-50", name: "Mad Scientist", icon: "🧪",
    description: "Win 50 rounds as a pig and unlock the Mad Scientist Pig.", secret: false },
  { id: "pig-wins-1000", full: "pighide.pig-wins-1000", name: "Pig Radar", icon: "📡",
    description: "Win 1,000 rounds as a pig and claim the Pig Radar.", secret: false },
  { id: "first-hunter-win", full: "pighide.first-hunter-win", name: "First Round-Up", icon: "🎯",
    description: "Catch every pig in a round as the hunter.", secret: false },
  { id: "hunter-wins-25", full: "pighide.hunter-wins-25", name: "Rocket Ranger", icon: "🚀",
    description: "Win 25 rounds as the hunter and unlock the RPG Hunter.", secret: false },
  { id: "hunter-wins-250", full: "pighide.hunter-wins-250", name: "The Amazing Hunter", icon: "🦸",
    description: "Win 250 rounds as the hunter and become The Amazing Hunter.", secret: false },
  { id: "clean-sweep", full: "pighide.clean-sweep", name: "Clean Sweep", icon: "🧹",
    description: "Catch three or more pigs in one winning round.", secret: false },
  { id: "new-look", full: "pighide.new-look", name: "New Look", icon: "🎨",
    description: "Buy your first pig skin or hunter skin.", secret: false },
  { id: "decoy-duty", full: "pighide.decoy-duty", name: "Decoy Duty", icon: "🥸",
    description: "Have the hunter catch your clone instead of you.", secret: true },
  { id: "close-call", full: "pighide.close-call", name: "Close Call", icon: "😅",
    description: "Win as a pig with 20 HP or less left.", secret: true },
]);

// Pig-win and hunter-win badge thresholds (§4.8). Each entry: award `id` once wins >= at.
export const PIG_WIN_BADGES = deepFreeze([
  { at: 1, id: "first-pig-win" }, { at: 10, id: "pig-wins-10" },
  { at: 50, id: "pig-wins-50" }, { at: 1000, id: "pig-wins-1000" },
]);
export const HUNTER_WIN_BADGES = deepFreeze([
  { at: 1, id: "first-hunter-win" }, { at: 25, id: "hunter-wins-25" }, { at: 250, id: "hunter-wins-250" },
]);

// =====================================================================================
// Rewards (§12.2). Reasons are colon-tokened per spec 07; the only faucets are wins.
// =====================================================================================

export const REWARDS = deepFreeze({
  pigWin: 25,
  hunterWin: 40,
  reasonPig: "pighide:pig-win",
  reasonHunter: "pighide:hunter-win",
  reasonSkin: "pighide:skin",
});

// =====================================================================================
// Lookups
// =====================================================================================

const PIG_INDEX = new Map(PIG_CLASSES.map((c, i) => [c.id, i]));
const HUNTER_INDEX = new Map(HUNTER_CLASSES.map((c, i) => [c.id, i]));
const PIG_SKIN_BY_ID = new Map(PIG_SKINS.map((s) => [s.id, s]));
const HUNTER_SKIN_BY_ID = new Map(HUNTER_SKINS.map((s) => [s.id, s]));

export function pigClass(id) {
  const i = PIG_INDEX.get(id);
  return i === undefined ? PIG_CLASSES[0] : PIG_CLASSES[i];
}

export function hunterClass(id) {
  const i = HUNTER_INDEX.get(id);
  return i === undefined ? HUNTER_CLASSES[0] : HUNTER_CLASSES[i];
}

export function pigClassIndex(id) {
  const i = PIG_INDEX.get(id);
  return i === undefined ? -1 : i;
}

export function hunterClassIndex(id) {
  const i = HUNTER_INDEX.get(id);
  return i === undefined ? -1 : i;
}

export function pigSkin(id) { return PIG_SKIN_BY_ID.get(id) || PIG_SKINS[0]; }
export function hunterSkin(id) { return HUNTER_SKIN_BY_ID.get(id) || HUNTER_SKINS[0]; }
export function weapon(id) { return (id && WEAPONS[id]) || null; }
export function ability(id) { return (id && ABILITIES[id]) || null; }

// The ability ids a pig of `classId` may use, in slot order, plus "radar" in slot T when
// the Pig Radar is equipped (§5).
export function pigKit(classId, radarEquipped) {
  const kit = pigClass(classId).abilities.slice();
  if (radarEquipped) kit.push(PIG_ITEM.ability);
  return kit;
}

export function hunterKit(classId) { return hunterClass(classId).abilities.slice(); }

export function pigHp(classId) { return pigClass(classId).hp; }
export function pigWalk(classId) { return pigClass(classId).walk; }
export function hunterWalk(classId) { return hunterClass(classId).walk; }

// Highest ladder index whose need <= wins.
function earnedTier(ladder, wins) {
  let t = 0;
  for (let i = 0; i < ladder.length; i++) if (ladder[i].need <= wins) t = i;
  return t;
}

// =====================================================================================
// Hashing and fair picks (§4.4, §7.5)
// =====================================================================================

// FNV-1a over UTF-16 code units (two bytes each), unsigned 32-bit. Every client computes
// the same value for the same string.
export function hash32(str) {
  const s = String(str);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h ^= c & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
    h ^= c >>> 8;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

// §4.4: the minimum rounds-as-hunter wins; ties break by the smallest hash32(id + ":" + rn),
// then by id. Returns null for an empty list.
export function pickHunter(ids, hc, rn) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  const counts = hc && typeof hc === "object" ? hc : {};
  let best = null, bestHc = Infinity, bestH = Infinity;
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const raw = counts[id];
    const n = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
    const h = hash32(id + ":" + rn);
    if (n < bestHc || (n === bestHc && (h < bestH || (h === bestH && id < best)))) {
      best = id; bestHc = n; bestH = h;
    }
  }
  return best;
}

// §7.5: plane livery 1..3.
export function planeLivery(selfId, rn, uses) {
  return 1 + (hash32(String(selfId) + String(rn) + String(uses)) % PLANE_LIVERIES.length);
}

// =====================================================================================
// Saves (§11)
// =====================================================================================

export function defaultSave() {
  return {
    v: SAVE_V,
    pigWins: 0, hunterWins: 0,
    pigTier: 0, hunterTier: 0,
    pigClass: PIG_CLASSES[0].id, hunterClass: HUNTER_CLASSES[0].id,
    pigSkin: PIG_SKINS[0].id, hunterSkin: HUNTER_SKINS[0].id,
    ownedPigSkins: [PIG_SKINS[0].id], ownedHunterSkins: [HUNTER_SKINS[0].id],
    radarClaimed: false, radarEquipped: false,
    rounds: 0, catches: 0, pigsSurvived: 0,
    practice: "pig",
  };
}

function clampInt(x, lo, hi) {
  if (typeof x !== "number" || !Number.isFinite(x)) return lo;
  const n = Math.floor(x);
  return n < lo ? lo : n > hi ? hi : n;
}

function ownedList(raw, byId, defaultId) {
  const out = [defaultId];
  if (Array.isArray(raw)) {
    for (const id of raw) {
      if (typeof id === "string" && byId.has(id) && !out.includes(id)) out.push(id);
    }
  }
  return out;
}

// §11.2: total, never throws. Anything unusable falls back to the default.
export function migrateSave(raw) {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || raw.v !== SAVE_V) return defaultSave();
    const s = defaultSave();
    const MAX = TUNE.WIN_MAX;
    s.pigWins = clampInt(raw.pigWins, 0, MAX);
    s.hunterWins = clampInt(raw.hunterWins, 0, MAX);
    s.pigTier = clampInt(raw.pigTier, 0, earnedTier(PIG_CLASSES, s.pigWins));
    s.hunterTier = clampInt(raw.hunterTier, 0, earnedTier(HUNTER_CLASSES, s.hunterWins));

    const pi = pigClassIndex(raw.pigClass);
    s.pigClass = pi >= 0 && pi <= s.pigTier ? PIG_CLASSES[pi].id : PIG_CLASSES[s.pigTier].id;
    const hi = hunterClassIndex(raw.hunterClass);
    s.hunterClass = hi >= 0 && hi <= s.hunterTier ? HUNTER_CLASSES[hi].id : HUNTER_CLASSES[s.hunterTier].id;

    s.ownedPigSkins = ownedList(raw.ownedPigSkins, PIG_SKIN_BY_ID, PIG_SKINS[0].id);
    s.ownedHunterSkins = ownedList(raw.ownedHunterSkins, HUNTER_SKIN_BY_ID, HUNTER_SKINS[0].id);
    s.pigSkin = s.ownedPigSkins.includes(raw.pigSkin) ? raw.pigSkin : PIG_SKINS[0].id;
    s.hunterSkin = s.ownedHunterSkins.includes(raw.hunterSkin) ? raw.hunterSkin : HUNTER_SKINS[0].id;

    s.radarClaimed = raw.radarClaimed === true && s.pigWins >= PIG_ITEM.need;
    s.radarEquipped = s.radarClaimed && raw.radarEquipped === true;

    s.rounds = clampInt(raw.rounds, 0, MAX);
    s.catches = clampInt(raw.catches, 0, MAX);
    s.pigsSurvived = clampInt(raw.pigsSurvived, 0, MAX);
    s.practice = raw.practice === "hunter" ? "hunter" : "pig";
    return s;
  } catch (e) {
    return defaultSave();
  }
}

// ---- ladder unlocks (§5, §6). Free once the threshold is met; never spends wins. ------

export function pigTierUnlockable(save) {
  if (!save) return null;
  const next = PIG_CLASSES[(save.pigTier | 0) + 1];
  return next && save.pigWins >= next.need ? next : null;
}

export function hunterTierUnlockable(save) {
  if (!save) return null;
  const next = HUNTER_CLASSES[(save.hunterTier | 0) + 1];
  return next && save.hunterWins >= next.need ? next : null;
}

// Advances the tier by one and equips the new rung ("upgrade your pig"). Any lower rung
// stays equippable through equipPig.
export function unlockNextPig(save) {
  const next = pigTierUnlockable(save);
  if (!next) return false;
  save.pigTier = (save.pigTier | 0) + 1;
  save.pigClass = next.id;
  return true;
}

export function unlockNextHunter(save) {
  const next = hunterTierUnlockable(save);
  if (!next) return false;
  save.hunterTier = (save.hunterTier | 0) + 1;
  save.hunterClass = next.id;
  return true;
}

export function equipPig(save, classId) {
  const i = pigClassIndex(classId);
  if (!save || i < 0 || i > (save.pigTier | 0)) return false;
  save.pigClass = PIG_CLASSES[i].id;
  return true;
}

export function equipHunter(save, classId) {
  const i = hunterClassIndex(classId);
  if (!save || i < 0 || i > (save.hunterTier | 0)) return false;
  save.hunterClass = HUNTER_CLASSES[i].id;
  return true;
}

export function pigClassUnlocked(save, classId) {
  const i = pigClassIndex(classId);
  return !!save && i >= 0 && i <= (save.pigTier | 0);
}

export function hunterClassUnlocked(save, classId) {
  const i = hunterClassIndex(classId);
  return !!save && i >= 0 && i <= (save.hunterTier | 0);
}

// ---- skins (§10.2). The caller spends Oofbux first (economy.spend(price, REWARDS.reasonSkin));
// on true it calls grant*Skin, which records ownership AND equips. ---------------------

export function ownsPigSkin(save, id) {
  return !!save && Array.isArray(save.ownedPigSkins) && save.ownedPigSkins.includes(id);
}

export function ownsHunterSkin(save, id) {
  return !!save && Array.isArray(save.ownedHunterSkins) && save.ownedHunterSkins.includes(id);
}

export function grantPigSkin(save, id) {
  if (!save || !PIG_SKIN_BY_ID.has(id)) return false;
  if (!ownsPigSkin(save, id)) save.ownedPigSkins.push(id);
  save.pigSkin = id;
  return true;
}

export function grantHunterSkin(save, id) {
  if (!save || !HUNTER_SKIN_BY_ID.has(id)) return false;
  if (!ownsHunterSkin(save, id)) save.ownedHunterSkins.push(id);
  save.hunterSkin = id;
  return true;
}

export function equipPigSkin(save, id) {
  if (!ownsPigSkin(save, id)) return false;
  save.pigSkin = id;
  return true;
}

export function equipHunterSkin(save, id) {
  if (!ownsHunterSkin(save, id)) return false;
  save.hunterSkin = id;
  return true;
}

// ---- the Pig Radar item (§5, §7.9) ------------------------------------------------------

export function radarClaimable(save) {
  return !!save && save.pigWins >= PIG_ITEM.need && !save.radarClaimed;
}

// Claims and equips the radar.
export function claimRadar(save) {
  if (!radarClaimable(save)) return false;
  save.radarClaimed = true;
  save.radarEquipped = true;
  return true;
}

export function setRadarEquipped(save, on) {
  if (!save || !save.radarClaimed) return false;
  save.radarEquipped = !!on;
  return true;
}

// ---- wins and stats (§4.8). Lifetime counters only ever grow. ---------------------------

export function applyPigWin(save) {
  save.pigWins = Math.min(TUNE.WIN_MAX, (save.pigWins | 0) + 1);
  save.pigsSurvived = Math.min(TUNE.WIN_MAX, (save.pigsSurvived | 0) + 1);
  return { pigWins: save.pigWins };
}

export function applyHunterWin(save, caught) {
  save.hunterWins = Math.min(TUNE.WIN_MAX, (save.hunterWins | 0) + 1);
  const n = Number.isFinite(caught) && caught > 0 ? Math.floor(caught) : 0;
  save.catches = Math.min(TUNE.WIN_MAX, (save.catches | 0) + n);
  return { hunterWins: save.hunterWins };
}

// Counts a round this client played in (pig or hunter), for display.
export function noteRoundPlayed(save) {
  save.rounds = Math.min(TUNE.WIN_MAX, (save.rounds | 0) + 1);
  return save.rounds;
}

// Badge ids earned at this win total (call after applyPigWin / applyHunterWin; award is
// idempotent, so returning every reached threshold is safe).
export function pigWinBadges(pigWins) {
  return PIG_WIN_BADGES.filter((b) => pigWins >= b.at).map((b) => b.id);
}

export function hunterWinBadges(hunterWins) {
  return HUNTER_WIN_BADGES.filter((b) => hunterWins >= b.at).map((b) => b.id);
}

// =====================================================================================
// The shared state S (§2.0). One per init; every field has exactly one writer.
// =====================================================================================

export function newShared(save) {
  const sv = save && typeof save === "object" && save.v === SAVE_V ? save : migrateSave(save);
  const hp = pigHp(sv.pigClass);
  return {
    // identity / platform (round.js)
    selfId: "local",
    selfName: "",
    online: false,
    now: 0,

    // save (game.js; config.js mutators)
    save: sv,

    // peers (round.js)
    peers: new Map(),
    fresh: [],
    participants: 1,

    // round (round.js)
    phase: "lobby",
    clock: 0,
    rn: 0,
    conductorId: "local",
    roster: null,
    role: null,
    rank: -1,
    hp, hpMax: hp,
    caught: false, caughtBy: null,
    spectating: false,
    result: null,
    canStart: false, startHint: "",
    startPending: false,
    pigsLeft: 0, pigsTotal: 0,

    // pig side (pigs.js)
    pig: {
      classId: sv.pigClass, skinId: sv.pigSkin,
      iv: 0, bl: 0, pl: 0,
      th: 0,
      cn: null,
      cd: {},
      act: {},
      used: {},
      radarOn: 0,
    },

    // hunter side (hunters.js)
    hunter: {
      classId: sv.hunterClass, skinId: sv.hunterSkin,
      fl: 0,
      cd: {},
      bm: [],
      rk: null,
      ex: null,
      detectOn: 0,
    },
    outHits: [],

    // local presentation
    blind: 0,
    practice: sv.practice === "hunter" ? "hunter" : "pig",
    toastQ: [],
  };
}
