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

// The whole of spec 05 §5.8: 12 hats, 10 faces, 5 gear, the bodycolor set, 6 auras and
// 5 trails. Two rows sit outside §5.8 — body_slushie and body_chrome are designed skins
// added for the playable slice, under ids §5.8 does not use, so they collide with nothing.
//
// Reading notes for §5.8. A prim names its material only when it is not plastic. Its
// shorthand "cone h1.2 r0.5" means size [0.5, 1.2, 0.5] — the radius letter is the size
// ACROSS that axis, not half of it; §5.8 fixes that mapping with its own worked example.
//
// Face rows carry `ops: null` rather than a copy of §5.3's op lists. faces.js owns those
// lists and paintFace resolves them by id, so nothing reads this field: a second copy here
// would be dead weight free to drift out of step with the ones that actually paint. That
// is a deliberate deviation from §5.8's "appearance = the op lists in §5.3, verbatim".
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
    appearance: { ops: null },
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

  // ---- faces: the other nine of §5.3, priced by §5.8 ---------------------------------
  {
    id: "face_grin", name: "Big Grin", type: "face",
    price: 50, rarity: "common", grantOnly: false, sourcePlace: null,
    appearance: { ops: null },
  },
  {
    id: "face_wink", name: "Wink", type: "face",
    price: 75, rarity: "common", grantOnly: false, sourcePlace: null,
    appearance: { ops: null },
  },
  {
    id: "face_sleepy", name: "Sleepy Eyes", type: "face",
    price: 80, rarity: "common", grantOnly: false, sourcePlace: null,
    appearance: { ops: null },
  },
  {
    id: "face_stern", name: "Stern Look", type: "face",
    price: 90, rarity: "common", grantOnly: false, sourcePlace: null,
    appearance: { ops: null },
  },
  {
    id: "face_surprised", name: "Surprised!", type: "face",
    price: 100, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: { ops: null },
  },
  {
    id: "face_tongue", name: "Tongue Out", type: "face",
    price: 120, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: { ops: null },
  },
  {
    id: "face_oof", name: "Permanent Oof", type: "face",
    price: 199, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: { ops: null },
  },
  {
    id: "face_hearts", name: "Heart Eyes", type: "face",
    price: 300, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: { ops: null },
  },
  {
    id: "face_money", name: "Money Eyes", type: "face",
    price: 750, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: { ops: null },
  },

  // ---- hats: §5.8's remaining ten ----------------------------------------------------
  {
    id: "hat_party", name: "Party Hat", type: "hat",
    price: 40, rarity: "common", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "cone", size: [0.45,1,0.45], offset: [0,0.5,0], rotation: [0,0,0],
          color: "#e0245e", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "sphere", size: [0.12,0.12,0.12], offset: [0,1.05,0], rotation: [0,0,0],
          color: "#f7c948", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "hat_beanie", name: "Beanie", type: "hat",
    price: 60, rarity: "common", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "sphere", size: [0.68,0.45,0.68], offset: [0,0.18,0], rotation: [0,0,0],
          color: "#4b56d2", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "torus", size: [0.62,0.1,0], offset: [0,0.02,0], rotation: [0,0,0],
          color: "#2e3345", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "sphere", size: [0.15,0.15,0.15], offset: [0,0.62,0], rotation: [0,0,0],
          color: "#f2f4fa", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "hat_cap", name: "Baseball Cap", type: "hat",
    price: 100, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "sphere", size: [0.68,0.38,0.68], offset: [0,0.12,0], rotation: [0,0,0],
          color: "#2a67c9", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "box", size: [0.9,0.06,0.5], offset: [0,0.05,-0.75], rotation: [0,0,0],
          color: "#2a67c9", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "hat_antenna", name: "Alien Antenna", type: "hat",
    price: 150, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "cylinder", size: [0.04,0.5,0.04], offset: [-0.25,0.25,0], rotation: [0,0,15],
          color: "#9aa3b8", material: "metal", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cylinder", size: [0.04,0.5,0.04], offset: [0.25,0.25,0], rotation: [0,0,-15],
          color: "#9aa3b8", material: "metal", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "sphere", size: [0.1,0.1,0.1], offset: [-0.38,0.52,0], rotation: [0,0,0],
          color: "#39ff6e", material: "neon", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "sphere", size: [0.1,0.1,0.1], offset: [0.38,0.52,0], rotation: [0,0,0],
          color: "#39ff6e", material: "neon", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "hat_tophat", name: "Top Hat", type: "hat",
    price: 250, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "cylinder", size: [0.85,0.08,0.85], offset: [0,0.04,0], rotation: [0,0,0],
          color: "#1b1b1b", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cylinder", size: [0.55,0.9,0.55], offset: [0,0.53,0], rotation: [0,0,0],
          color: "#1b1b1b", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cylinder", size: [0.57,0.12,0.57], offset: [0,0.2,0], rotation: [0,0,0],
          color: "#d94436", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "hat_propeller", name: "Propeller Cap", type: "hat",
    price: 400, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "sphere", size: [0.68,0.38,0.68], offset: [0,0.12,0], rotation: [0,0,0],
          color: "#d94436", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cylinder", size: [0.05,0.25,0.05], offset: [0,0.42,0], rotation: [0,0,0],
          color: "#9aa3b8", material: "metal", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "box", size: [0.9,0.04,0.15], offset: [0,0.55,0], rotation: [0,0,0],
          color: "#f7c948", material: "plastic", transparency: 0,
          spin: 360, bob: null, flicker: null },
        { shape: "box", size: [0.9,0.04,0.15], offset: [0,0.55,0], rotation: [0,90,0],
          color: "#f7c948", material: "plastic", transparency: 0,
          spin: 360, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "hat_wizard", name: "Wizard Hat", type: "hat",
    price: 500, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "cylinder", size: [0.9,0.06,0.9], offset: [0,0.03,0], rotation: [0,0,0],
          color: "#6b3fa0", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cone", size: [0.6,1.5,0.6], offset: [0,0.81,0], rotation: [0,0,0],
          color: "#6b3fa0", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cylinder", size: [0.45,0.1,0.45], offset: [0,0.25,0], rotation: [0,0,0],
          color: "#f7c948", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "hat_viking", name: "Viking Helm", type: "hat",
    price: 800, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "sphere", size: [0.7,0.5,0.7], offset: [0,0.1,0], rotation: [0,0,0],
          color: "#c7cdd9", material: "metal", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cone", size: [0.15,0.45,0.15], offset: [-0.7,0.35,0], rotation: [0,0,35],
          color: "#f2f4fa", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cone", size: [0.15,0.45,0.15], offset: [0.7,0.35,0], rotation: [0,0,-35],
          color: "#f2f4fa", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "hat_horns", name: "Devil Horns", type: "hat",
    price: 900, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "cone", size: [0.15,0.45,0.15], offset: [-0.35,0.2,0], rotation: [0,0,25],
          color: "#d94436", material: "neon", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cone", size: [0.15,0.45,0.15], offset: [0.35,0.2,0], rotation: [0,0,-25],
          color: "#d94436", material: "neon", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "hat_crown", name: "Crown", type: "hat",
    price: 5000, rarity: "legendary", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "cylinder", size: [0.55,0.35,0.55], offset: [0,0.18,0], rotation: [0,0,0],
          color: "#f7c948", material: "metal", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cone", size: [0.12,0.3,0.12], offset: [-0.4,0.45,0], rotation: [0,0,0],
          color: "#f7c948", material: "neon", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cone", size: [0.12,0.3,0.12], offset: [0.4,0.45,0], rotation: [0,0,0],
          color: "#f7c948", material: "neon", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cone", size: [0.12,0.3,0.12], offset: [0,0.45,-0.4], rotation: [0,0,0],
          color: "#f7c948", material: "neon", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cone", size: [0.12,0.3,0.12], offset: [0,0.45,0.4], rotation: [0,0,0],
          color: "#f7c948", material: "neon", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },

  // ---- gear: §5.8's remaining four ---------------------------------------------------
  {
    id: "gear_balloon", name: "Balloon", type: "gear",
    price: 90, rarity: "common", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "cylinder", size: [0.015,1.2,0.015], offset: [0,0.6,0], rotation: [0,0,0],
          color: "#c7cdd9", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "sphere", size: [0.4,0.48,0.4], offset: [0,1.45,0], rotation: [0,0,0],
          color: "#d94436", material: "plastic", transparency: 0,
          spin: 0, bob: {"amp":0.08,"hz":0.7}, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "gear_finger", name: "Foam Finger", type: "gear",
    price: 120, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "box", size: [0.5,0.7,0.15], offset: [0,0.35,0], rotation: [0,0,0],
          color: "#e0245e", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "box", size: [0.16,0.32,0.15], offset: [-0.17,0.86,0], rotation: [0,0,0],
          color: "#e0245e", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: null,
    },
  },
  {
    id: "gear_torch", name: "Torch", type: "gear",
    price: 200, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "cylinder", size: [0.08,0.6,0.08], offset: [0,0.3,0], rotation: [0,0,0],
          color: "#8c5a3c", material: "wood", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cone", size: [0.18,0.4,0.18], offset: [0,0.8,0], rotation: [0,0,0],
          color: "#ff8c1a", material: "neon", transparency: 0,
          spin: 0, bob: null, flicker: {"amp":0.2,"hz":8} },
      ],
      particles: {
        motion: "rise", rate: 3, colors: ["#ff8c1a","#d94436"], size: [0.1,0.02],
        lifetime: 0.6, radius: 0.05, speed: 0.8, height: 0.9,
      },
    },
  },
  {
    id: "gear_boombox", name: "Boombox", type: "gear",
    price: 2500, rarity: "epic", grantOnly: false, sourcePlace: null,
    appearance: {
      prims: [
        { shape: "box", size: [1.2,0.7,0.4], offset: [0,0.35,0], rotation: [0,0,0],
          color: "#2e3345", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cylinder", size: [0.22,0.06,0.22], offset: [-0.32,0.35,-0.22], rotation: [90,0,0],
          color: "#1b1b1b", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
        { shape: "cylinder", size: [0.22,0.06,0.22], offset: [0.32,0.35,-0.22], rotation: [90,0,0],
          color: "#1b1b1b", material: "plastic", transparency: 0,
          spin: 0, bob: null, flicker: null },
      ],
      particles: {
        motion: "rise", rate: 1, colors: ["#35e0e0"], size: [0.25,0.1],
        lifetime: 1.2, radius: 0.3, speed: 1, height: 0.8,
      },
    },
  },

  // ---- bodycolor: §5.8's five premium swatches ---------------------------------------
  {
    id: "body_ice", name: "Glacier", type: "bodycolor",
    price: 600, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: { swatch: "#bfe8ff", material: "glass", preset: null },
  },
  {
    id: "body_neon", name: "Neon Slime", type: "bodycolor",
    price: 800, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: { swatch: "#39ff6e", material: "neon", preset: null },
  },
  {
    id: "body_void", name: "Void Black", type: "bodycolor",
    price: 900, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: { swatch: "#0c0c14", material: "metal", preset: null },
  },
  {
    id: "body_lava", name: "Magma", type: "bodycolor",
    price: 1200, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: { swatch: "#ff5722", material: "lava", preset: null },
  },
  {
    id: "body_gold", name: "Golden Body", type: "bodycolor",
    price: 5000, rarity: "legendary", grantOnly: false, sourcePlace: null,
    appearance: { swatch: "#f7c948", material: "metal", preset: null },
  },

  // ---- auras (§3.6) — emitters that follow the avatar --------------------------------
  {
    id: "aura_ember", name: "Ember Aura", type: "aura",
    price: 600, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: {
      motion: "rise", count: 0, rate: 8, colors: ["#ff8c1a","#d94436"], size: [0.15,0.05],
      lifetime: 1.4, radius: 1.2, speed: 1.2, height: 0.1, bob: 0, wobble: 0.1, sub: null,
    },
  },
  {
    id: "aura_frost", name: "Frost Ring", type: "aura",
    price: 600, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: {
      motion: "orbit", count: 8, rate: 0, colors: ["#bfe8ff"], size: [0.18,0.18],
      lifetime: 0, radius: 1.6, speed: 90, height: 1.5, bob: 0.2, wobble: 0, sub: null,
    },
  },
  {
    id: "aura_toxic", name: "Toxic Bubbles", type: "aura",
    price: 800, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: {
      motion: "rise", count: 0, rate: 6, colors: ["#39ff6e","#2fbf9b"], size: [0.2,0.08],
      lifetime: 1.6, radius: 1, speed: 0.9, height: 0.1, bob: 0, wobble: 0.25, sub: null,
    },
  },
  {
    id: "aura_sparkle", name: "Golden Sparkle", type: "aura",
    price: 2000, rarity: "epic", grantOnly: false, sourcePlace: null,
    appearance: {
      motion: "twinkle", count: 16, rate: 12, colors: ["#f7c948","#ffffff"], size: [0.14,0.14],
      lifetime: 0.6, radius: 1.4, speed: 0, height: 1.2, bob: 0, wobble: 0, sub: null,
    },
  },
  {
    id: "aura_void", name: "Void Wisps", type: "aura",
    price: 3500, rarity: "epic", grantOnly: false, sourcePlace: null,
    appearance: {
      motion: "orbit", count: 5, rate: 0, colors: ["#6b3fa0"], size: [0.35,0.35],
      lifetime: 0, radius: 1.5, speed: 140, height: 2.5, bob: 0.6, wobble: 0, sub: null,
    },
  },
  {
    id: "aura_storm", name: "Thunder Charge", type: "aura",
    price: 5000, rarity: "legendary", grantOnly: false, sourcePlace: null,
    appearance: {
      motion: "pulse", count: 10, rate: 0, colors: ["#9ad2ff"], size: [0.12,0.12],
      lifetime: 1.2, radius: 1.3, speed: 3, height: 0.3, bob: 0, wobble: 0,
      sub: {"motion":"orbit","count":6,"speed":240,"height":2.5,"radius":1.3,"size":[0.12,0.12],"bob":0},
    },
  },

  // ---- trails (§3.7) — what you leave behind as you move -----------------------------
  {
    id: "trail_bubble", name: "Bubble Trail", type: "trail",
    price: 300, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: {
      style: "particles", colors: ["#35a3e0"], width: 0, fade: 1, rate: 6, emberRate: 0,
    },
  },
  {
    id: "trail_neon", name: "Neon Streak", type: "trail",
    price: 450, rarity: "uncommon", grantOnly: false, sourcePlace: null,
    appearance: {
      style: "ribbon", colors: ["#35e0e0"], width: 0.6, fade: 0.5, rate: 0, emberRate: 0,
    },
  },
  {
    id: "trail_fire", name: "Fire Trail", type: "trail",
    price: 700, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: {
      style: "ribbon", colors: ["#ff8c1a"], width: 0.7, fade: 0.5, rate: 0, emberRate: 4,
    },
  },
  {
    id: "trail_shadow", name: "Shadow Trail", type: "trail",
    price: 900, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: {
      style: "ribbon", colors: ["#1b1b1b"], width: 1, fade: 0.8, rate: 0, emberRate: 0,
    },
  },
  {
    id: "trail_rainbow", name: "Rainbow Trail", type: "trail",
    price: 1000, rarity: "rare", grantOnly: false, sourcePlace: null,
    appearance: {
      style: "ribbon", colors: ["rainbow"], width: 0.8, fade: 0.7, rate: 0, emberRate: 0,
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
