// The Catalog tables — spec 05 §3 (item schema) and §5.8 (STARTER_CATALOG,
// PLACE_REWARDS) plus §5.7's free body swatches. Pure data and lookups: this file
// imports nothing, so spec 05 §8 can import it in Node and validate it field-by-field.

// §5.7 — the 24 free body colors, usable on any limb through setBodyColor.
export const BASE_SWATCHES = Object.freeze([
  "#f5cd30", "#e8a33d", "#e8641b", "#d94436", "#e0245e", "#b0305c", "#6b3fa0", "#4b56d2",
  "#2a67c9", "#35a3e0", "#35e0e0", "#2fbf9b", "#37a04c", "#7ac74f", "#c9d92e", "#f2f4fa",
  "#c7cdd9", "#9aa3b8", "#5c6478", "#2e3345", "#1b1b1b", "#8c5a3c", "#9b6a3f", "#d9b48f",
]);

// §5.7 — the "Classic Oof" palette: the default for every limb, and the preset the
// body_classic item applies. avatar.js reads it for §3.1's default state and for the
// "unowned premium swatch reverts to the default hex" rule.
export const DEFAULT_BODY_COLORS = Object.freeze({
  head: "#f5cd30",
  torso: "#2a67c9",
  leftArm: "#f5cd30",
  rightArm: "#f5cd30",
  leftLeg: "#37a04c",
  rightLeg: "#37a04c",
});

// §3.1 — the two items a fresh profile already owns (both price 0).
export const DEFAULT_OWNED = Object.freeze(["face_smile", "body_classic"]);

// SLICE: the remaining 39 rows of spec 05 §5.8 (9 more faces, 10 more hats, 4 more
// gear, the 5 premium bodycolor swatches, 6 auras, 5 trails) are a later append into
// this same array — every row below already uses §3's final schema, so growing the
// Catalog is an append and never a rewrite. The rows that DO ship are §5.8's own,
// verbatim, except the two designed skins (body_slushie, body_chrome): SLICE.md scopes
// the Catalog to "3 skins + 3 accessories", and §5.8's bodycolor block offers only one
// whole-body colourway (body_classic), the other five being single premium swatches.
// Those two ids are outside §5.8's namespace, so the later append collides with
// nothing.
//
// Reading note for §5.8's prim rows: a prim's material is named only when it is not
// plastic (the fully written-out example in §3.8 spells "plastic" on all three prims),
// so prims below whose §5.8 row named no material carry material "plastic".
export const STARTER_CATALOG = [
  // ---- faces -------------------------------------------------------------------
  // The default face. Its ops are §5.3's face_smile row; faces.js keeps the same table
  // for painting, since it must paint face_oof on death whether or not that row ships.
  {
    id: "face_smile",
    name: "Classic Smile",
    type: "face",
    price: 0,
    rarity: "common",
    grantOnly: false,
    sourcePlace: null,
    appearance: {
      ops: [
        ["circle", 40, 50, 10, "#1b1b1b"],
        ["circle", 88, 50, 10, "#1b1b1b"],
        ["arc", 64, 72, 24, 25, 155, 6, "#1b1b1b"],
      ],
    },
  },

  // ---- bodycolor: the three skins ----------------------------------------------
  // Each is a whole-body colourway (a §3.5 preset) and they read as a set: head and
  // arms share one color, the torso a second, the legs a third.
  {
    id: "body_classic",
    name: "Classic Oof",
    type: "bodycolor",
    price: 0,
    rarity: "common",
    grantOnly: false,
    sourcePlace: null,
    appearance: {
      swatch: null,
      material: null,
      preset: {
        head: "#f5cd30",
        torso: "#2a67c9",
        leftArm: "#f5cd30",
        rightArm: "#f5cd30",
        leftLeg: "#37a04c",
        rightLeg: "#37a04c",
      },
    },
  },
  // The loud one: frozen-drink cyan on raspberry with lime legs. Every color is a §5.7
  // base swatch, so the same look is reachable limb-by-limb with setBodyColor — buying
  // the skin buys the arrangement, not the pigment.
  {
    id: "body_slushie",
    name: "Slushie Rush",
    type: "bodycolor",
    price: 300,
    rarity: "uncommon",
    grantOnly: false,
    sourcePlace: null,
    appearance: {
      swatch: null,
      material: null,
      preset: {
        head: "#35e0e0",
        torso: "#e0245e",
        leftArm: "#35e0e0",
        rightArm: "#35e0e0",
        leftLeg: "#c9d92e",
        rightLeg: "#c9d92e",
      },
    },
  },
  // The goal one: a bright chrome head over midnight plating. §3.5 hangs `material` off
  // `swatch`, not `preset`, so a whole-body colourway can only ever render as plastic —
  // the palette does the metallic reading on its own (reported as a spec defect).
  {
    id: "body_chrome",
    name: "Chrome Dome",
    type: "bodycolor",
    price: 1500,
    rarity: "epic",
    grantOnly: false,
    sourcePlace: null,
    appearance: {
      swatch: null,
      material: null,
      preset: {
        head: "#f2f4fa",
        torso: "#2e3345",
        leftArm: "#c7cdd9",
        rightArm: "#c7cdd9",
        leftLeg: "#5c6478",
        rightLeg: "#5c6478",
      },
    },
  },

  // ---- accessories: two hats and one gear ---------------------------------------
  // §5.8's rows verbatim: a cone anyone affords in a few minutes of play, a sword that
  // shows off the gear-hold pose, and a halo priced as a real goal.
  {
    id: "hat_cone",
    name: "Traffic Cone",
    type: "hat",
    price: 75,
    rarity: "common",
    grantOnly: false,
    sourcePlace: null,
    appearance: {
      prims: [
        { shape: "box", size: [1.1, 0.08, 1.1], offset: [0, 0.04, 0], rotation: [0, 0, 0],
          color: "#e8641b", material: "plastic", transparency: 0, spin: 0, bob: null, flicker: null },
        { shape: "cone", size: [0.5, 1.2, 0.5], offset: [0, 0.68, 0], rotation: [0, 0, 0],
          color: "#e8641b", material: "plastic", transparency: 0, spin: 0, bob: null, flicker: null },
        { shape: "cylinder", size: [0.38, 0.15, 0.38], offset: [0, 0.55, 0], rotation: [0, 0, 0],
          color: "#ffffff", material: "plastic", transparency: 0, spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "gear_sword",
    name: "Wooden Sword",
    type: "gear",
    price: 150,
    rarity: "uncommon",
    grantOnly: false,
    sourcePlace: null,
    appearance: {
      prims: [
        { shape: "cylinder", size: [0.07, 0.35, 0.07], offset: [0, 0, 0], rotation: [0, 0, 0],
          color: "#8c5a3c", material: "wood", transparency: 0, spin: 0, bob: null, flicker: null },
        { shape: "box", size: [0.4, 0.08, 0.12], offset: [0, 0.2, 0], rotation: [0, 0, 0],
          color: "#9b6a3f", material: "plastic", transparency: 0, spin: 0, bob: null, flicker: null },
        { shape: "box", size: [0.14, 1.4, 0.05], offset: [0, 0.94, 0], rotation: [0, 0, 0],
          color: "#d9b48f", material: "wood", transparency: 0, spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "hat_halo",
    name: "Halo",
    type: "hat",
    price: 1200,
    rarity: "rare",
    grantOnly: false,
    sourcePlace: null,
    appearance: {
      prims: [
        { shape: "torus", size: [0.5, 0.08, 0], offset: [0, 0.35, 0], rotation: [0, 0, 0],
          color: "#f7c948", material: "neon", transparency: 0, spin: 0,
          bob: { amp: 0.05, hz: 0.5 }, flicker: null },
      ],
      particles: null,
    },
  },
];

// §5.9 — Place-granted rewards. Ships EMPTY; each granting Place's own task appends its
// rows inside the marked region below (grantOnly: true, price: null, sourcePlace: its
// slug). This array is the ONLY thing a Place task may edit outside its own folder.
export const PLACE_REWARDS = [
  // region:place-rewards:start
  // region:place-rewards:end
];

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return value;
}

deepFreeze(STARTER_CATALOG);
deepFreeze(PLACE_REWARDS);

const BY_ID = new Map();
for (const item of [...STARTER_CATALOG, ...PLACE_REWARDS]) BY_ID.set(item.id, item);

// Unknown ids answer null everywhere — §3.1's load rules drop them rather than crash.
export function getItem(id) {
  return BY_ID.get(id) || null;
}

export function getAllItems() {
  return [...STARTER_CATALOG, ...PLACE_REWARDS];
}

export function getItemsByType(type) {
  return getAllItems().filter((item) => item.type === type);
}
