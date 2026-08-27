// src/platform/studio/behaviors-schema.js — the behavior-form registry Oof Studio
// generates its property-panel forms from. Spec 11 §3.5, transcribed field-by-field
// from spec 04 §3.2 (the canonical param set — spec 11 assumption A1).
//
// PURE MODULE: imports nothing, touches no DOM, so tools/validate.js can `import()`
// it in Node and diff its keys against spec 04's BEHAVIOR_TYPES (spec 11 §8 S3).
// Anything that needs THREE, the DOM or a service belongs in proppanel.js instead.
//
// Param `type` vocabulary is a CLOSED set (spec 11 §3.5): int, number, bool, enum,
// string, vec3, partId, waypoints. proppanel.js §5.6.3 renders one control per type;
// adding a ninth type here without a control there renders nothing, so the two tables
// move together or not at all.

export const BEHAVIOR_PARAM_SCHEMAS = Object.freeze({
  kill: { label: "Kill", icon: "💀", params: [] },

  checkpoint: {
    label: "Checkpoint", icon: "🚩",
    params: [
      { key: "order", type: "int", min: 0, max: 999, required: true, default: 0,
        help: "Checkpoints fire in order" },
    ],
  },

  bounce: {
    label: "Bounce", icon: "🦘",
    params: [
      { key: "power", type: "number", min: 1, max: 200, default: 50 },
    ],
  },

  speed: {
    label: "Speed Pad", icon: "💨",
    params: [
      { key: "walkSpeed", type: "number", min: 1, max: 100, default: 30 },
      { key: "duration", type: "number", min: 0.1, max: 120, default: 5 },
    ],
  },

  conveyor: {
    label: "Conveyor", icon: "➡️",
    params: [
      { key: "direction", type: "vec3", default: [1, 0, 0] },
      { key: "speed", type: "number", min: 0.1, max: 64, default: 8 },
    ],
  },

  spinner: {
    label: "Spinner", icon: "🌀",
    params: [
      { key: "axis", type: "enum", options: ["x", "y", "z"], default: "y" },
      { key: "speed", type: "number", min: -720, max: 720, default: 90 },
    ],
  },

  movingPlatform: {
    label: "Moving Platform", icon: "🛗",
    params: [
      { key: "waypoints", type: "waypoints", min: 2, max: 16, required: true },
      { key: "speed", type: "number", min: 0.1, max: 64, default: 6 },
      { key: "pauseS", type: "number", min: 0, max: 30, default: 1 },
      { key: "mode", type: "enum", options: ["pingpong", "cycle"], default: "pingpong" },
    ],
  },

  button: {
    label: "Button", icon: "🔘",
    params: [
      { key: "channel", type: "string", pattern: "^[A-Za-z0-9_-]{1,32}$", required: true },
      { key: "once", type: "bool", default: false },
      { key: "cooldownS", type: "number", min: 0, max: 600, default: 1 },
    ],
  },

  door: {
    label: "Door", icon: "🚪",
    params: [
      { key: "channel", type: "string", pattern: "^[A-Za-z0-9_-]{1,32}$", required: true },
      { key: "mode", type: "enum", options: ["open", "toggle"], default: "open" },
      { key: "openS", type: "number", min: 0.1, max: 600, default: 4 },
    ],
  },

  collectible: {
    label: "Collectible", icon: "🪙",
    params: [
      { key: "kind", type: "enum", options: ["oofbux", "event"], default: "oofbux" },
      { key: "value", type: "int", min: 1, max: 10000, default: 1 },
      { key: "respawnS", type: "number", min: 0, max: 3600, default: 30 },
      // Rendered only while kind === "event" (spec 11 §5.6.3): spec 04 rejects an
      // `event` field on any other kind, so a hidden-but-present value would be a
      // validation error the builder cannot see or fix.
      { key: "event", type: "string", pattern: "^[A-Za-z0-9_-]{1,32}$",
        requiredIf: { key: "kind", equals: "event" } },
    ],
  },

  teleport: {
    label: "Teleport", icon: "🌀",
    params: [
      { key: "target", type: "partId", required: true },
      { key: "cooldownS", type: "number", min: 0, max: 600, default: 1 },
    ],
  },

  // `advanced` sorts this last in the add-behavior menu with an honest note: a Place
  // built in Oof Studio has no scripts, so nothing is listening for the event it
  // fires (spec 11 §3.5, §10 "no user scripting in v1").
  touchEvent: {
    label: "Touch Event", icon: "⚡", advanced: true,
    params: [
      { key: "event", type: "string", pattern: "^[A-Za-z0-9_-]{1,32}$", required: true },
      { key: "once", type: "bool", default: false },
      { key: "cooldownS", type: "number", min: 0, max: 600, default: 0.25 },
    ],
  },
});
