// src/games/cats/scripts/roster.js - Find The Cats' fixed tables (spec 28 §3). A straight port
// of the original game's Roster: the 17 difficulty tiers in the owner's EXACT order, the 100 cat
// slots (cat number n == index order == difficulty order) and the 7 zones. Pure data: no ctx,
// no THREE, no DOM, so tools and tests can import it under Node.

const T = (name, color, text, count, effect, blurb) => ({ name, color, text, count, effect, blurb });

// effect: null | "rainbow" | "glitch" | "glow" | "flicker" | "void"
const TIER_ROWS = [
  T("Easy", "#4cc850", "#ffffff", 12, null, "Literally just walk to it."),
  T("Medium", "#ffcd00", "#1e1e1e", 11, null, "Look behind stuff. Maybe jump."),
  T("Hard", "#ff7d00", "#ffffff", 10, null, "Parkour, small puzzles, sneaky hiding."),
  T("Intense", "#d71e1e", "#ffffff", 9, null, "Real puzzles. Real obbies. Real tears."),
  T("Insane", "#0050ff", "#ffffff", 8, null, "Multi-step puzzles and precise jumps."),
  T("Extreme", "#96005a", "#ffffff", 7, null, "Long chains of clues. Bring snacks."),
  T("nil", "#121216", "#c8c8c8", 6, "void", "This cat does not exist. Or does it."),
  T("Obama", "#1e3c96", "#ffd75a", 6, "glow", "Presidential-grade hiding. Very official."),
  T("HAHAHAHA", "#ff00aa", "#ffffff", 5, "rainbow", "The game is laughing at you. LOUDLY."),
  T("...", "#787882", "#ffffff", 5, "flicker", "..."),
  T("Impossible", "#fafafa", "#000000", 5, null, "Seems impossible. Is not. Probably."),
  T("Eat My Shorts", "#ffe150", "#3c1e00", 4, null, "Rude. Unfair. Solvable."),
  T("Give Up", "#555f6e", "#ffffff", 4, null, "You should. You won't."),
  T("Aleph Nil", "#00ffff", "#000000", 3, "glow", "Infinitely hard. The smallest infinity, though."),
  T("!@#$%^&**&^%$#@!", "#ff2828", "#00ff3c", 2, "glitch", "Error: difficulty overflowed."),
  T("#", "#000000", "#ffffff", 2, "void", "#"),
  T("You Have To Be AI To Do This", "#ffffff", "#000000", 1, "rainbow", "No human was meant to find this cat."),
];

export const TOTAL = 100;

// TIERS[t] for t = 1..17 (TIERS[0] is null so the index is the tier number, as in the original).
export const TIERS = (() => {
  const out = [null];
  let n = 0;
  TIER_ROWS.forEach((row, i) => {
    const first = n + 1;
    n += row.count;
    out.push(Object.freeze({ ...row, t: i + 1, first, last: n }));
  });
  if (n !== TOTAL) throw new Error("cats roster: tier counts must sum to 100");
  return Object.freeze(out);
})();

// TIER_OF[n] -> t
export const TIER_OF = (() => {
  const out = [0];
  for (let t = 1; t < TIERS.length; t++) for (let n = TIERS[t].first; n <= TIERS[t].last; n++) out[n] = t;
  return Object.freeze(out);
})();

export function tierOf(n) {
  return TIER_OF[n] || 1;
}

// Per-zone presentation that the original kept in its client: music is an engine TRACKS id,
// sky/fog feed renderer.applyLighting when the zone is entered (fog far authored <= 300 so the
// low tier renders what is written; spec 25 §3.3 explains the clamp).
const Z = (name, first, last, unlock, color, music, lighting) => ({ name, first, last, unlock, color, music, lighting });

const ZONE_ROWS = [
  Z("Cozy Meadow", 1, 14, 0, "#78d25a", "chill",
    { skyTop: "#7ec8ff", skyBottom: "#f4fbff", ambient: "#b9d4c2", ambientIntensity: 0.7, sunColor: "#fff2d6", sunIntensity: 1.05, sunDirection: [-0.5, -1, -0.3], fog: { color: "#dff1ff", near: 160, far: 300 } }),
  Z("Catford Town", 15, 28, 6, "#e6b478", "plaza",
    { skyTop: "#8fc3f0", skyBottom: "#fbe9d2", ambient: "#c7b9a6", ambientIntensity: 0.65, sunColor: "#ffe6c0", sunIntensity: 1.0, sunDirection: [-0.4, -1, -0.5], fog: { color: "#f3dfc8", near: 160, far: 300 } }),
  Z("Haunted Litterbox Manor", 29, 42, 15, "#6e4696", "voidchill",
    { skyTop: "#1b1030", skyBottom: "#4a2e63", ambient: "#6c5a86", ambientIntensity: 0.55, sunColor: "#b9a6ff", sunIntensity: 0.55, sunDirection: [0.3, -1, 0.4], fog: { color: "#2a1a3c", near: 90, far: 220 } }),
  Z("Mount Hairball (Volcano Lab)", 43, 57, 26, "#ff5a1e", "clash",
    { skyTop: "#3a1410", skyBottom: "#ff9a5a", ambient: "#a0705a", ambientIntensity: 0.6, sunColor: "#ffb37a", sunIntensity: 1.0, sunDirection: [-0.3, -1, 0.2], fog: { color: "#6b2a18", near: 140, far: 280 } }),
  Z("The nil Void", 58, 71, 38, "#191923", "voidchill",
    { skyTop: "#000000", skyBottom: "#14141e", ambient: "#50506a", ambientIntensity: 0.6, sunColor: "#c8c8ff", sunIntensity: 0.6, sunDirection: [0.2, -1, -0.2], fog: { color: "#05050a", near: 110, far: 240 } }),
  Z("The Meme Dimension", 72, 84, 50, "#ff00c8", "pump",
    { skyTop: "#ff4fd8", skyBottom: "#7af7ff", ambient: "#d0a0e0", ambientIntensity: 0.75, sunColor: "#fff0ff", sunIntensity: 1.0, sunDirection: [-0.6, -1, 0.1], fog: { color: "#f6c6ff", near: 160, far: 300 } }),
  Z("The End Of Cats", 85, 100, 62, "#f0f0ff", "ascent",
    { skyTop: "#d8dcff", skyBottom: "#ffffff", ambient: "#c8c8e0", ambientIntensity: 0.8, sunColor: "#ffffff", sunIntensity: 0.95, sunDirection: [0.1, -1, 0.3], fog: { color: "#eef0ff", near: 160, far: 300 } }),
];

// ZONES[k] for k = 1..7 (ZONES[0] is null).
export const ZONES = Object.freeze([null, ...ZONE_ROWS.map((z, i) => Object.freeze({ ...z, k: i + 1 }))]);

export function zoneOf(n) {
  for (let k = 1; k < ZONES.length; k++) if (n >= ZONES[k].first && n <= ZONES[k].last) return k;
  return 0;
}

// ---- world layout (studs) ----------------------------------------------------------------------
// Hub plaza at the origin. Zone k is a 400 x 400 box centred at (ZONE_SPACING * k, 0, 0), exactly as
// the original, so a zone port can keep its zone-local coordinates. Only ONE zone exists at a time
// (built when you enter it, torn down when you leave), so the spacing is about killY and fog, not
// about draw distance.
export const ZONE_SPACING = 600;
export const ZONE_HALF = 200;          // zone-local x,z in [-200, 200]; build inside [-195, 195]
export const ZONE_MIN_Y = -120;        // zone-local y range; ground top is y = 0
export const ZONE_MAX_Y = 320;
export const KILL_Y = -150;            // place.json killY: below every zone's lowest floor
export const HUB_RADIUS = 110;
export const ZONE_SPAWN = Object.freeze([-185, 0.2, 0]);   // zone-local FEET position on the spawn pad
export const ZONE_RETURN = Object.freeze([-185, 0, 18]);   // zone-local return-to-hub portal (centre, on the ground)
export const PORTAL_DIST = 88;         // hub portals sit on this radius
export const PORTAL_BACK = 74;         // coming home from zone k lands you in front of its portal
export const HUB_SPAWN = Object.freeze([0, 0.4, 52]);     // = place.json spawn (pad top 0.2)
export const HUB_SPAWN_YAW = 180;                          // facing the statue (-Z)

// Hub fixtures that place.json (static) and scripts/hub.js (runtime text) must agree on.
export const HUB = Object.freeze({
  statueTop: 6,                                   // pedestal top; the statue stands on it
  plaque: Object.freeze({ pos: [0, 3.5, 6.1], size: [8, 2.2, 0.4] }),
  chart: Object.freeze({ pos: [0, 27, 100], size: [76, 54, 2] }),   // front (-Z) faces the plaza
  howto: Object.freeze({ pos: [60, 13, 82], size: [24, 22, 1.5] }),
  progress: Object.freeze({ pos: [-60, 13, 82], size: [24, 22, 1.5] }),
  doorLocal: Object.freeze({ pos: [0, 7.9, 0], size: [11, 15, 0.5] }),
  signLocal: Object.freeze({ pos: [0, 23.5, 0], size: [18, 5, 0.6] }),
});

export const HUB_LIGHTING = Object.freeze({
  skyTop: "#7fc4ff", skyBottom: "#ffeef8", ambient: "#c4b8d8", ambientIntensity: 0.7,
  sunColor: "#fff1dc", sunIntensity: 1.05, sunDirection: [-0.5, -1, -0.35],
  fog: { color: "#f6e8ff", near: 165, far: 300 },
});

export function zoneOrigin(k) {
  return [ZONE_SPACING * k, 0, 0];
}

// Hub portal k: the direction the original used (-120 + 40*(k-1) degrees from north).
export function portalDir(k) {
  const a = ((-120 + (k - 1) * 40) * Math.PI) / 180;
  return [Math.sin(a), 0, -Math.cos(a)];
}

// The yaw (degrees about +Y) that turns a portal's local -Z towards the plaza centre.
export function portalYaw(k) {
  return 180 - (-120 + (k - 1) * 40);
}

// The avatar yaw (degrees, 0 = facing +Z) that looks along [dx, dz].
export function yawToward(dx, dz) {
  return (Math.atan2(dx, dz) * 180) / Math.PI;
}

// Badges this Place awards (spec 28 §8). The platform registry is closed: these rows must be
// appended to src/platform/services/badges.js by the integrator, or award() warns and skips.
export const BADGES = Object.freeze([
  Object.freeze({ id: "first-cat", at: 1, name: "Here Kitty", icon: "🐱", description: "Find your first cat in Find The Cats." }),
  Object.freeze({ id: "cats-25", at: 25, name: "Cat Collector", icon: "🧶", description: "Find 25 cats." }),
  Object.freeze({ id: "cats-50", at: 50, name: "Crazy Cat Person", icon: "😼", description: "Find 50 cats." }),
  Object.freeze({ id: "cats-75", at: 75, name: "Purrfectionist", icon: "🏅", description: "Find 75 cats." }),
  Object.freeze({ id: "cats-100", at: 100, name: "You Are The AI Now", icon: "🤖", description: "Find all 100 cats." }),
]);

// Oofbux per find, by tier (spec 28 §8). Indexed by t; scales from "walk to it" up to the AI cat.
export const REWARD = Object.freeze([0, 5, 8, 12, 16, 22, 30, 40, 50, 60, 75, 90, 110, 130, 160, 200, 250, 500]);
