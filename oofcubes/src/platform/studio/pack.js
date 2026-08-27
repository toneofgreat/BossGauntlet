// src/platform/studio/pack.js — the PackedPlace compression format that lives inside
// an Oof Studio share code. Spec 11 §3.4.
//
// PURE MODULE: imports nothing (no THREE, no DOM, no services) so tools/validate.js
// can `import()` it in Node and round-trip the committed fixtures (spec 11 §8 S4).
// That purity is also why the four ordered vocabularies below are transcribed here
// instead of imported from src/engine/place.js — importing an engine module would
// drag three.js's dependency chain into a Node-side static check. The transcription
// is spec 04 §3.1/§3.2 table order and validate S3 is what keeps it honest.
//
// Why pack at all: base64(JSON(place)) of a 500-part world is ~90 K characters, which
// is not something a child can paste into a message. Tokenising the schema — arrays
// instead of objects, a colour palette instead of repeated hex strings, integers
// instead of floats — gets the same world to ~24 K (§3.4's size math).

const PACK_VERSION = 1; // element 0 of every packed array

// Spec 04 §3.1 enum order. The INDEX is the wire format, so rows may only ever be
// appended to these four lists — reordering silently reinterprets old codes.
const SHAPES = ["box", "wedge", "cylinder", "sphere"];
const MATERIALS = ["plastic", "neon", "metal", "grass", "lava", "ice", "glass", "wood"];
const MUSIC_IDS = ["plaza", "ascent", "pump", "cashflow"]; // spec 02 TRACKS ids
const BEHAVIOR_TYPES = [
  "kill", "checkpoint", "bounce", "speed", "conveyor", "spinner",
  "movingPlatform", "button", "door", "collectible", "teleport", "touchEvent",
];

// Quantisation (§3.4 "Quantization contract"): positions/sizes to 0.05 studs,
// rotations to 1°, transparency to 0.05. The editor already keeps every value on
// these quanta (§5.4, §5.6), so in practice the round trip is exact.
const COORD_Q = 20; // 1 / 0.05
const TRANSPARENCY_Q = 20; // 1 / 0.05

const HEX_RE = /^#[0-9a-f]{6}$/;

// The unpacked meta block. Part ids and the creation id are NOT packed (§3.4), and
// meta.slug is derived from the creation id — which the importing device has not
// generated yet at unpack time. A fixed, schema-valid placeholder is used; store.js's
// importCode immediately rebuilds the real `studio-<newid>` slug when it hands the
// world to a fresh StudioDoc. SPEC GAP: §3.4 packs no slug/icon/description but §5.7
// step 3 validates the unpacked object against spec 04, which requires all three.
const IMPORT_SLUG = "studio-import";
const PLACE_ICON = "🧱";
const PLACE_DESCRIPTION = "Built in Oof Studio";

function packErr(message) {
  return new Error("E_PACK: " + message);
}

function unpackErr(message) {
  return new Error("E_UNPACK: " + message);
}

// JS rounds -0.4 to -0, and -0 survives JSON.stringify as "0" but fails an
// Object.is-based deep-equal against 0. Every quantised value goes through here so a
// round trip can be compared with any deep-equal implementation.
function noNegZero(n) {
  return n === 0 ? 0 : n;
}

function quantize(value, factor, what) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw packErr(what + " must be a finite number, got " + JSON.stringify(value));
  }
  return noNegZero(Math.round(value * factor));
}

function dequantize(value, factor, what) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw unpackErr(what + " must be a finite number, got " + JSON.stringify(value));
  }
  return noNegZero(value / factor);
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function requireVec3(value, what, errFor) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw errFor(what + " must be a [x,y,z] array");
  }
  return value;
}

// ===================================================================================
// ===== packPlace(placeData) -> packedArray — spec 11 §3.4 ==========================
// ===================================================================================

export function packPlace(placeData) {
  if (!isPlainObject(placeData)) throw packErr("place data must be an object");
  if (!Array.isArray(placeData.parts) || placeData.parts.length === 0) {
    throw packErr("place data needs a non-empty parts array");
  }
  const meta = isPlainObject(placeData.meta) ? placeData.meta : {};
  const name = typeof meta.name === "string" && meta.name.length > 0
    ? meta.name.slice(0, 24) // element 1 is capped at 24 chars (§3.4)
    : "Untitled Place";

  // Part id -> row index, built BEFORE any row so a teleport can point forwards as
  // well as backwards (§3.4: ids are not packed, references become row indices).
  const rowOfId = new Map();
  placeData.parts.forEach((part, i) => {
    if (!isPlainObject(part)) throw packErr("parts[" + i + "] must be an object");
    if (typeof part.id === "string") rowOfId.set(part.id, i);
  });

  // First-use-order colour palette (element 7). Repeating "#f5cd30" 200 times costs
  // 1800 characters; an index into a palette costs 3.
  const colors = [];
  const colorIndex = new Map();
  const colorIdxFor = (hex, i) => {
    if (typeof hex !== "string" || !HEX_RE.test(hex)) {
      throw packErr("parts[" + i + "].color must match #rrggbb (lowercase), got " + JSON.stringify(hex));
    }
    if (!colorIndex.has(hex)) {
      colorIndex.set(hex, colors.length);
      colors.push(hex.slice(1)); // stored without the leading hash
    }
    return colorIndex.get(hex);
  };

  const rows = placeData.parts.map((part, i) => packPart(part, i, colorIdxFor, rowOfId));

  const spawn = requireVec3(placeData.spawn, "spawn", packErr)
    .map((n, i) => quantize(n, COORD_Q, "spawn[" + i + "]"));
  const yaw = quantize(placeData.spawnYaw === undefined ? 0 : placeData.spawnYaw, 1, "spawnYaw");
  const killY = placeData.killY === undefined ? -50 : placeData.killY;
  if (typeof killY !== "number" || !Number.isFinite(killY)) throw packErr("killY must be a finite number");

  let musicIdx = -1;
  if (placeData.music !== undefined && placeData.music !== null) {
    musicIdx = MUSIC_IDS.indexOf(placeData.music);
    if (musicIdx === -1) throw packErr("unknown music track " + JSON.stringify(placeData.music));
  }

  // Lighting travels verbatim (element 6). It is at most ~200 characters and it is the
  // one block a future spec-04 revision is most likely to grow a field in — packing it
  // by position would make old codes unreadable the moment that happens.
  const lighting = placeData.lighting === undefined || placeData.lighting === null
    ? 0
    : JSON.parse(JSON.stringify(placeData.lighting));

  return [PACK_VERSION, name, spawn, yaw, killY, musicIdx, lighting, colors, rows];
}

function packPart(part, i, colorIdxFor, rowOfId) {
  const shapeIdx = SHAPES.indexOf(part.shape === undefined ? "box" : part.shape);
  if (shapeIdx === -1) throw packErr("parts[" + i + "].shape " + JSON.stringify(part.shape) + " is not a known shape");
  const matIdx = MATERIALS.indexOf(part.material === undefined ? "plastic" : part.material);
  if (matIdx === -1) throw packErr("parts[" + i + "].material " + JSON.stringify(part.material) + " is not known");

  const size = requireVec3(part.size, "parts[" + i + "].size", packErr);
  const position = requireVec3(part.position, "parts[" + i + "].position", packErr);
  const rotation = part.rotation === undefined
    ? [0, 0, 0]
    : requireVec3(part.rotation, "parts[" + i + "].rotation", packErr);

  const t = part.transparency === undefined ? 0 : part.transparency;
  const t20 = quantize(t, TRANSPARENCY_Q, "parts[" + i + "].transparency");
  if (t20 < 0 || t20 > TRANSPARENCY_Q) throw packErr("parts[" + i + "].transparency must be 0..1");

  // bit0 = canCollide. bit1 is reserved for `anchored`, which Studio v1 never varies
  // (§5.5: every Studio part is anchored) — reserving the bit now means the day
  // unanchored parts ship, old codes still read correctly.
  const flags = part.canCollide === false ? 0 : 1;

  const row = [
    shapeIdx,
    quantize(size[0], COORD_Q, "parts[" + i + "].size[0]"),
    quantize(size[1], COORD_Q, "parts[" + i + "].size[1]"),
    quantize(size[2], COORD_Q, "parts[" + i + "].size[2]"),
    quantize(position[0], COORD_Q, "parts[" + i + "].position[0]"),
    quantize(position[1], COORD_Q, "parts[" + i + "].position[1]"),
    quantize(position[2], COORD_Q, "parts[" + i + "].position[2]"),
    quantize(rotation[0], 1, "parts[" + i + "].rotation[0]"),
    quantize(rotation[1], 1, "parts[" + i + "].rotation[1]"),
    quantize(rotation[2], 1, "parts[" + i + "].rotation[2]"),
    colorIdxFor(part.color === undefined ? "#a3a2a5" : part.color, i),
    matIdx,
    t20,
    flags,
  ];

  const behaviors = Array.isArray(part.behaviors) ? part.behaviors : [];
  if (behaviors.length > 0) row.push(behaviors.map((b) => packBehavior(b, i, rowOfId)));
  return row;
}

function packBehavior(behavior, i, rowOfId) {
  if (!isPlainObject(behavior) || typeof behavior.type !== "string") {
    throw packErr("parts[" + i + "] has a behavior with no type");
  }
  const typeIdx = BEHAVIOR_TYPES.indexOf(behavior.type);
  if (typeIdx === -1) throw packErr("unknown behavior type " + JSON.stringify(behavior.type) + " on parts[" + i + "]");

  const params = {};
  for (const [key, value] of Object.entries(behavior)) {
    if (key === "type") continue; // the index already carries it
    params[key] = value;
  }
  if (behavior.type === "teleport" && params.target !== undefined) {
    // §3.4: the target part id becomes its 0-based row index, because unpackPlace
    // regenerates ids as s1..sN and the original strings would dangle.
    if (!rowOfId.has(params.target)) {
      throw new Error("E_REF: teleport target " + JSON.stringify(params.target)
        + " on parts[" + i + "] does not match any part");
    }
    params.target = rowOfId.get(params.target);
  }
  return [typeIdx, params];
}

// ===================================================================================
// ===== unpackPlace(packedArray) -> placeData — spec 11 §3.4 ========================
// ===================================================================================

export function unpackPlace(packed) {
  if (!Array.isArray(packed) || packed.length !== 9) {
    throw unpackErr("expected a 9-element packed array");
  }
  const [version, name, spawn, yaw, killY, musicIdx, lighting, colors, rows] = packed;
  if (version !== PACK_VERSION) throw unpackErr("pack version " + JSON.stringify(version) + " is not supported");
  if (typeof name !== "string" || name.length === 0) throw unpackErr("name must be a non-empty string");
  if (!Array.isArray(colors)) throw unpackErr("colors must be an array");
  if (!Array.isArray(rows) || rows.length === 0) throw unpackErr("expected at least one part row");

  const palette = colors.map((hex, i) => {
    const full = "#" + String(hex).toLowerCase();
    if (!HEX_RE.test(full)) throw unpackErr("colors[" + i + "] is not an rrggbb hex string");
    return full;
  });

  const parts = rows.map((row, i) => unpackPart(row, i, palette, rows.length));

  const placeData = {
    meta: {
      slug: IMPORT_SLUG,
      name: name.slice(0, 40), // spec 04 meta.name is 1..40
      icon: PLACE_ICON,
      description: PLACE_DESCRIPTION,
    },
    spawn: requireVec3(spawn, "spawn", unpackErr).map((n, i) => dequantize(n, COORD_Q, "spawn[" + i + "]")),
    spawnYaw: dequantize(yaw, 1, "spawnYaw"),
    killY: dequantize(killY, 1, "killY"),
    parts,
  };
  if (lighting !== 0 && lighting !== null && lighting !== undefined) {
    if (!isPlainObject(lighting)) throw unpackErr("lighting must be 0 or an object");
    placeData.lighting = JSON.parse(JSON.stringify(lighting));
  }
  if (musicIdx !== -1 && musicIdx !== undefined && musicIdx !== null) {
    if (!MUSIC_IDS[musicIdx]) throw unpackErr("music index " + musicIdx + " is out of range");
    placeData.music = MUSIC_IDS[musicIdx];
  }
  return placeData;
}

function unpackPart(row, i, palette, rowCount) {
  if (!Array.isArray(row) || (row.length !== 14 && row.length !== 15)) {
    throw unpackErr("part row " + i + " must have 14 or 15 elements");
  }
  const shape = SHAPES[row[0]];
  if (!shape) throw unpackErr("part row " + i + " has unknown shape index " + row[0]);
  const material = MATERIALS[row[11]];
  if (!material) throw unpackErr("part row " + i + " has unknown material index " + row[11]);
  const color = palette[row[10]];
  if (!color) throw unpackErr("part row " + i + " points at colour index " + row[10] + ", not in the palette");

  const part = {
    id: "s" + (i + 1), // §3.4: ids are regenerated in row order
    shape,
    size: [
      dequantize(row[1], COORD_Q, "part " + i + " size[0]"),
      dequantize(row[2], COORD_Q, "part " + i + " size[1]"),
      dequantize(row[3], COORD_Q, "part " + i + " size[2]"),
    ],
    position: [
      dequantize(row[4], COORD_Q, "part " + i + " position[0]"),
      dequantize(row[5], COORD_Q, "part " + i + " position[1]"),
      dequantize(row[6], COORD_Q, "part " + i + " position[2]"),
    ],
    rotation: [
      dequantize(row[7], 1, "part " + i + " rotation[0]"),
      dequantize(row[8], 1, "part " + i + " rotation[1]"),
      dequantize(row[9], 1, "part " + i + " rotation[2]"),
    ],
    color,
    material,
    transparency: dequantize(row[12], TRANSPARENCY_Q, "part " + i + " transparency"),
    anchored: true, // §5.5: every Studio part is anchored; flags bit1 is reserved
    canCollide: (row[13] & 1) === 1,
    behaviors: [],
  };

  if (row.length === 15) {
    if (!Array.isArray(row[14])) throw unpackErr("part row " + i + " behaviors must be an array");
    part.behaviors = row[14].map((entry) => unpackBehavior(entry, i, rowCount));
  }
  return part;
}

function unpackBehavior(entry, i, rowCount) {
  if (!Array.isArray(entry) || entry.length !== 2) {
    throw unpackErr("part row " + i + " has a malformed behavior entry");
  }
  const type = BEHAVIOR_TYPES[entry[0]];
  if (!type) throw unpackErr("part row " + i + " has unknown behavior index " + entry[0]);
  if (!isPlainObject(entry[1])) throw unpackErr("part row " + i + " behavior has no params object");

  const behavior = { type };
  for (const [key, value] of Object.entries(entry[1])) behavior[key] = JSON.parse(JSON.stringify(value));
  if (type === "teleport" && behavior.target !== undefined) {
    const targetRow = behavior.target;
    if (!Number.isInteger(targetRow) || targetRow < 0 || targetRow >= rowCount) {
      throw unpackErr("teleport on part row " + i + " points at row " + targetRow + ", which does not exist");
    }
    behavior.target = "s" + (targetRow + 1);
  }
  return behavior;
}
