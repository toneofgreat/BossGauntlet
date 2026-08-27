// src/platform/studio/store.js — every Oof Studio creation's life on disk: the index,
// per-creation CRUD, place.json projection, and the share-code export/import pair.
// Spec 11 §3.1-§3.3 and §5.7.
//
// PERSISTENCE RULE (§5.7): no Studio file touches browser storage directly. All of it goes
// through the spec-07 saves service, and share codes ride the SAME generic container
// account codes use — encodeSaveCode("studio", packed) / decodeSaveCode — so there is
// exactly one code format in the platform, not two.

import * as saves from "../services/saves.js";
import * as economy from "../services/economy.js";
import { validatePlaceData } from "../../engine/place.js";
import { packPlace, unpackPlace } from "./pack.js";

// ---- tuning constants, spec 11 §6 (the single source for these numbers) -----------
const MAX_STUDIO_PARTS = 500; // hard part cap per creation
const MAX_CREATIONS = 20; // creations per device
const MAX_DOC_BYTES = 262144; // serialized StudioDoc cap
const MAX_CODE_CHARS = 36000; // share-code length cap
const PUBLISH_AWARD = 200; // Oofbux, spec 01 BALANCE values restated by §6
const MAX_PUBLISH_GRANTS = 5;

// New-creation world, §6's "baseplate" / "default spawn" rows.
const BASEPLATE = Object.freeze({
  shape: "box", size: [64, 1, 64], position: [0, -0.5, 0],
  color: "#75b843", material: "grass",
});
const DEFAULT_SPAWN = [0, 0.5, 0];
const DEFAULT_KILL_Y = -50;
const DEFAULT_NAME = "Untitled Place";
const NAME_MAX = 24;

const ID_RE = /^[a-z0-9]{8}$/;
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

// The creation index lives in the `studio` save domain (ARCHITECTURE §8,
// oofcubes.v1.studio). saves.js has since grown setDomain() — the seeding counterpart
// to getDomain, and the only way a seedless domain enters its cache — so the index is
// now written to its own domain, as ARCHITECTURE §8 always said it would be.
//
// Before that existed it had to travel as a `place.studio-index` envelope: a slug
// outside validate.js's key allowlist that then rode inside account save codes as a
// fake Place. That envelope is still READ (below) so an index written by an older
// build is picked up, migrated by the first write, and then deleted — but only after
// the new key has actually landed, so a failed write can never lose the index.
// Neither path ever names a storage key: saves.js owns key construction (rule 12:C3).
const INDEX_DOMAIN = "studio";
const LEGACY_INDEX_SLUG = "studio-index";

let indexCache = null; // the live index object; written back by writeIndex()
let legacyEnvelope = false; // the index came from the pre-setDomain envelope

function freshIndex() {
  return { schemaVersion: 1, creations: [], publishGrants: [] };
}

function docSaves(id) {
  return saves.placeSaves("studio-" + id);
}

function readIndexRaw() {
  const obj = saves.getDomain(INDEX_DOMAIN);
  if (obj) return obj;
  const legacy = saves.placeSaves(LEGACY_INDEX_SLUG).load();
  if (legacy) legacyEnvelope = true;
  return legacy;
}

function writeIndex(index) {
  index.schemaVersion = 1;
  // setDomain stores BY REFERENCE and marks the domain dirty itself, so the live index
  // object stays the one the cache holds and the debounced flush picks it up.
  saves.setDomain(INDEX_DOMAIN, index);
  if (legacyEnvelope) {
    // Retire the old envelope only once its replacement is on disk: flush() reports
    // whether the write landed, and a quota failure must leave the old copy intact.
    if (saves.flush(INDEX_DOMAIN)) {
      legacyEnvelope = false;
      saves.placeSaves(LEGACY_INDEX_SLUG).clear();
    }
  }
}

// getIndex() — read once, repair once, keep the live object. §3.2's invariants are
// repaired on read: an entry whose doc has vanished is dropped with a warn. The other
// half of §3.2's repair ("docs with no index entry are re-indexed") is NOT reachable:
// the saves API exposes no way to enumerate stored place domains, so an orphan doc is
// invisible to us. Reported as a gap with this task.
function getIndex() {
  if (indexCache) return indexCache;
  const raw = readIndexRaw();
  const index = raw && typeof raw === "object" ? raw : freshIndex();
  if (!Array.isArray(index.creations)) index.creations = [];
  if (!Array.isArray(index.publishGrants)) index.publishGrants = [];

  let repaired = false;
  index.creations = index.creations.filter((entry) => {
    if (!entry || !ID_RE.test(String(entry.id))) { repaired = true; return false; }
    if (docSaves(entry.id).load() === null) {
      console.warn("[oof] Oof Studio index entry with no saved Place, dropped", entry.id);
      repaired = true;
      return false;
    }
    return true;
  });
  // Each id may hold a publish grant once, and never more than five in total (§3.2).
  const grants = [];
  for (const grantId of index.publishGrants) {
    if (!ID_RE.test(String(grantId))) continue;
    if (grants.includes(grantId)) continue;
    if (grants.length >= MAX_PUBLISH_GRANTS) break;
    grants.push(grantId);
  }
  index.publishGrants = grants;

  indexCache = index;
  if (repaired) writeIndex(index);
  return index;
}

function upsertIndexEntry(doc) {
  const index = getIndex();
  const entry = {
    id: doc.id,
    name: doc.name,
    partCount: doc.world.parts.length,
    updatedAt: doc.updatedAt,
  };
  const at = index.creations.findIndex((c) => c.id === doc.id);
  if (at === -1) index.creations.push(entry);
  else index.creations[at] = entry;
  // "ordered most-recently-updated first" (§3.2) is maintained here, so listCreations
  // and any future reader see the same order the file has.
  index.creations.sort((a, b) => b.updatedAt - a.updatedAt);
  writeIndex(index);
}

function generateId(index) {
  const taken = new Set(index.creations.map((c) => c.id));
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = randomId();
    if (!taken.has(id)) return id;
  }
  // 36^8 ids and 20 creations: twenty collisions in a row is not a thing that happens,
  // but returning a duplicate id would silently overwrite somebody's Place.
  throw new Error("E_SAVE: could not generate a free creation id");
}

function randomId() {
  const bytes = new Uint8Array(8);
  const c = globalThis.crypto;
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 8; i++) bytes[i] = Math.floor(Math.random() * 256);
  let out = "";
  for (let i = 0; i < 8; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

function clampName(name) {
  const text = typeof name === "string" ? name.trim() : "";
  return text.length === 0 ? DEFAULT_NAME : text.slice(0, NAME_MAX);
}

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value));
}

// ===================================================================================
// ===== creation CRUD — spec 11 §5.7 ================================================
// ===================================================================================

// listCreations() -> [{id, name, partCount, updatedAt}] — a copy, newest first.
export function listCreations() {
  return getIndex().creations.map((c) => ({ ...c })).sort((a, b) => b.updatedAt - a.updatedAt);
}

// createCreation() -> doc | { error: "limit" }. The doc it writes is §3.1's example
// verbatim, modulo the id and the two timestamps.
export function createCreation() {
  const index = getIndex();
  if (index.creations.length >= MAX_CREATIONS) return { error: "limit" };
  const id = generateId(index);
  const now = Date.now();
  const doc = {
    schemaVersion: 1,
    id,
    name: DEFAULT_NAME,
    createdAt: now,
    updatedAt: now,
    world: {
      spawn: DEFAULT_SPAWN.slice(),
      spawnYaw: 0,
      killY: DEFAULT_KILL_Y,
      lighting: null,
      music: null,
      parts: [{
        id: "s1",
        shape: BASEPLATE.shape,
        size: BASEPLATE.size.slice(),
        position: BASEPLATE.position.slice(),
        rotation: [0, 0, 0],
        color: BASEPLATE.color,
        material: BASEPLATE.material,
        transparency: 0,
        anchored: true,
        canCollide: true,
        behaviors: [],
      }],
    },
    editor: { camPos: [20, 18, 20], camYaw: -135, camPitch: -30, grid: 1, nextPartNum: 2 },
  };
  saveCreation(doc);
  return doc;
}

// getCreation(id) -> doc | null. A doc from a future schemaVersion is refused rather
// than half-read; the migration ladder slots in right here when version 2 exists.
export function getCreation(id) {
  if (!ID_RE.test(String(id))) return null;
  let doc = null;
  try {
    doc = docSaves(id).load();
  } catch (err) {
    console.warn("[oof] could not read Oof Studio Place", id, err);
    return null;
  }
  if (!doc || typeof doc !== "object") return null;
  if (doc.schemaVersion !== 1) {
    console.warn("[oof] Oof Studio Place has schemaVersion", doc.schemaVersion, "- skipped", id);
    return null;
  }
  if (!doc.world || !Array.isArray(doc.world.parts)) return null;
  repairDoc(doc);
  return doc;
}

// repairDoc(doc) — fill in any §3.1 field a stored doc is missing. openStudio reads
// doc.editor.camPos and doc.world.spawn straight out of the doc before anything has
// checked them; a doc that lost either (an interrupted write, a doc from another build)
// used to throw a TypeError halfway through the open, which is the one failure that
// strands a half-built editor. Repairing here is cheaper and safer than refusing to open
// a Place whose PARTS are all still there.
const GRID_OPTIONS = [1, 0.5, 0.25];

function repairDoc(doc) {
  const world = doc.world;
  if (!Array.isArray(world.spawn) || world.spawn.length !== 3
      || !world.spawn.every((n) => typeof n === "number" && Number.isFinite(n))) {
    world.spawn = DEFAULT_SPAWN.slice();
  }
  if (typeof world.spawnYaw !== "number" || !Number.isFinite(world.spawnYaw)) world.spawnYaw = 0;
  if (typeof world.killY !== "number" || !Number.isFinite(world.killY)) world.killY = DEFAULT_KILL_Y;
  if (world.lighting === undefined) world.lighting = null;
  if (world.music === undefined) world.music = null;

  const editor = doc.editor && typeof doc.editor === "object" ? doc.editor : (doc.editor = {});
  if (!Array.isArray(editor.camPos) || editor.camPos.length !== 3
      || !editor.camPos.every((n) => typeof n === "number" && Number.isFinite(n))) {
    editor.camPos = [20, 18, 20];
  }
  if (typeof editor.camYaw !== "number" || !Number.isFinite(editor.camYaw)) editor.camYaw = -135;
  if (typeof editor.camPitch !== "number" || !Number.isFinite(editor.camPitch)) editor.camPitch = -30;
  if (!GRID_OPTIONS.includes(editor.grid)) editor.grid = 1;

  // nextPartNum must clear every id already in the world: handing out an "sN" that is
  // already taken produces a duplicate part id, which validatePlaceData rejects — the
  // Place would become untestable and unshareable with no way to see why.
  let highest = 0;
  for (const part of world.parts) {
    const m = part && typeof part.id === "string" ? /^s(\d+)$/.exec(part.id) : null;
    if (m) highest = Math.max(highest, Number(m[1]));
  }
  if (!Number.isInteger(editor.nextPartNum) || editor.nextPartNum <= highest) {
    editor.nextPartNum = highest + 1;
  }
  return doc;
}

// saveCreation(doc) — cheap invariants only (the expensive spec-04 validation runs at
// export/playtest, §5.7/§5.8, where the builder can act on the message).
export function saveCreation(doc) {
  if (!doc || !ID_RE.test(String(doc.id))) throw new Error("E_SAVE: bad creation id");
  if (!doc.world || !Array.isArray(doc.world.parts)) throw new Error("E_SAVE: creation has no parts array");
  if (doc.world.parts.length > MAX_STUDIO_PARTS) {
    throw new Error("E_SAVE: over the " + MAX_STUDIO_PARTS + "-part limit");
  }
  doc.name = clampName(doc.name);
  doc.schemaVersion = 1;
  doc.updatedAt = Date.now();

  const bytes = JSON.stringify(doc).length;
  if (bytes > MAX_DOC_BYTES) throw new Error("E_SAVE: this Place is too big to save");
  try {
    docSaves(doc.id).save(doc);
  } catch (err) {
    // The saves layer has a smaller per-Place ceiling than §6's MAX_DOC_BYTES (spec 07
    // SAVE_MAX_BYTES); its refusal is turned into the same E_SAVE the caller already
    // handles instead of escaping as a raw engine error. Conflict reported with this task.
    throw new Error("E_SAVE: " + (err && err.message ? err.message : String(err)));
  }
  upsertIndexEntry(doc);
}

// deleteCreation(id) — the publishGrants entry is deliberately KEPT (§5.7). Since
// importCode always mints a NEW id (§5.7 step 5), a re-imported Place can never match
// an old grant entry by id; what keeping the entry actually protects is the FIVE-grant
// cap, which delete-and-reimport would otherwise reset over and over. Reported as an
// ambiguity in §7 criterion 7 resolved this way.
export function deleteCreation(id) {
  const index = getIndex();
  try {
    docSaves(id).clear();
  } catch (err) {
    console.warn("[oof] could not clear Oof Studio Place", id, err);
  }
  index.creations = index.creations.filter((c) => c.id !== id);
  writeIndex(index);
}

// duplicateCreation(id) -> newId | null
export function duplicateCreation(id) {
  const source = getCreation(id);
  if (!source) return null;
  const index = getIndex();
  if (index.creations.length >= MAX_CREATIONS) return null;
  const copy = deepCopy(source);
  copy.id = generateId(index);
  copy.name = clampName(source.name + " copy");
  copy.createdAt = Date.now();
  saveCreation(copy);
  return copy.id;
}

// ===================================================================================
// ===== toPlaceData / export / import — spec 11 §3.3, §5.7 ==========================
// ===================================================================================

// toPlaceData(doc) -> a complete spec-04 place.json object (§3.3). This is what
// playtest loads and what the share code carries, so a Studio Place is never a
// special case anywhere in the engine — it is just place.json-shaped data.
export function toPlaceData(doc) {
  const world = doc.world;
  const data = {
    meta: {
      slug: "studio-" + doc.id,
      name: clampName(doc.name).slice(0, 40),
      icon: "🧱",
      description: "Built in Oof Studio",
    },
    spawn: world.spawn.slice(),
    spawnYaw: world.spawnYaw === undefined ? 0 : world.spawnYaw,
    killY: world.killY === undefined ? DEFAULT_KILL_Y : world.killY,
    parts: deepCopy(world.parts),
  };
  if (world.lighting) data.lighting = deepCopy(world.lighting);
  if (world.music) data.music = world.music;
  return data;
}

// friendly(error, placeData) — a spec-04 validation error a child can act on. The
// schema paths are "parts[12].behaviors[0].channel"; the part INDEX means nothing to
// someone looking at a world, so it is swapped for the part id they can select.
function friendly(error, placeData) {
  const message = error && error.message ? error.message : String(error);
  const path = error && error.path ? error.path : "";
  const m = /^parts\[(\d+)\]/.exec(path);
  if (m) {
    const part = placeData.parts[Number(m[1])];
    const id = part && part.id ? part.id : "?";
    const rest = path.slice(m[0].length).replace(/^\./, "");
    return "Part " + id + (rest ? " (" + rest + ")" : "") + ": " + message;
  }
  return (path ? path + ": " : "") + message;
}

// validateForPlay(doc) -> { ok, placeData, messages } — the single gate both export
// (§5.7) and playtest (§5.8 step 1) run through, so they can never disagree about
// whether a Place is playable.
export function validateForPlay(doc) {
  const placeData = toPlaceData(doc);
  const result = validatePlaceData(placeData);
  if (result.ok) return { ok: true, placeData, messages: [] };
  return { ok: false, placeData, messages: result.errors.map((e) => friendly(e, placeData)) };
}

// exportCode(id) -> { code, granted } | { error, ... } — spec 11 §5.7's six steps.
export function exportCode(id) {
  const doc = getCreation(id);
  if (!doc) return { error: "missing" };

  const check = validateForPlay(doc);
  if (!check.ok) return { error: "invalid", messages: check.messages };

  let code;
  try {
    code = saves.encodeSaveCode("studio", packPlace(check.placeData));
  } catch (err) {
    return { error: "badpack", message: err && err.message ? err.message : String(err) };
  }
  if (code.length > MAX_CODE_CHARS) return { error: "toobig", length: code.length };

  // Step 5 — the publish grant. "Published" in v1 means "exported at least once", and
  // it pays once per creation, five creations at most (§5.7, spec 01 BALANCE).
  const index = getIndex();
  let granted = false;
  if (!index.publishGrants.includes(id) && index.publishGrants.length < MAX_PUBLISH_GRANTS) {
    try {
      economy.award(PUBLISH_AWARD, "studio:publish");
      granted = true;
    } catch (err) {
      console.warn("[oof] publish grant failed", err);
    }
    if (granted) {
      index.publishGrants.push(id);
      writeIndex(index);
    }
  }
  return { code, granted };
}

// importCode(str) -> { id, name } | { error, ... } — spec 11 §5.7's five steps.
// Every failure is a returned tag, never a throw: the paste box has to be able to say
// what went wrong without the shelf wrapping every call in try/catch.
export function importCode(str) {
  const text = String(str == null ? "" : str).trim();
  if (!text) return { error: "badcode", message: "Paste a share code first." };
  // SPEC AMENDMENT (§5.7 importCode step 1, amended in this change): the numbered steps
  // only listed the decode, while §3.4 says "Import enforces both limits too" — and the
  // part cap alone does not cover this. MAX_CODE_CHARS is what export refuses at, so a
  // longer string cannot have come from this platform; it is also the guard that keeps a
  // megabyte of pasted junk out of base64-decoding and JSON.parse before anything has
  // looked at it. Checked against the code's own length, first, for that reason.
  if (text.length > MAX_CODE_CHARS) return { error: "codetoobig", length: text.length };

  let decoded;
  try {
    decoded = saves.decodeSaveCode(text);
  } catch (err) {
    return { error: "badcode", message: err && err.message ? err.message : String(err) };
  }
  if (decoded.domain !== "studio") return { error: "wrongdomain" };

  let placeData;
  try {
    placeData = unpackPlace(decoded.obj);
  } catch (err) {
    return { error: "badpack", message: err && err.message ? err.message : String(err) };
  }
  if (placeData.parts.length > MAX_STUDIO_PARTS) return { error: "toobig" };

  const index = getIndex();
  if (index.creations.length >= MAX_CREATIONS) return { error: "limit" };

  const id = generateId(index);
  const now = Date.now();
  // The imported world gets a slug of its own here; unpackPlace could not know the id
  // this device would hand it, so it validated under a placeholder (pack.js).
  const doc = {
    schemaVersion: 1,
    id,
    name: clampName(placeData.meta.name),
    createdAt: now,
    updatedAt: now,
    world: {
      spawn: placeData.spawn.slice(),
      spawnYaw: placeData.spawnYaw === undefined ? 0 : placeData.spawnYaw,
      killY: placeData.killY === undefined ? DEFAULT_KILL_Y : placeData.killY,
      lighting: placeData.lighting ? deepCopy(placeData.lighting) : null,
      music: placeData.music || null,
      parts: deepCopy(placeData.parts),
    },
    editor: {
      camPos: [20, 18, 20], camYaw: -135, camPitch: -30,
      grid: 1,
      nextPartNum: placeData.parts.length + 1,
    },
  };

  // Validation runs on the FINAL doc, not on the placeholder-slugged unpack, so the
  // message a builder sees names the Place they are actually importing.
  const check = validateForPlay(doc);
  if (!check.ok) return { error: "invalid", messages: check.messages };

  try {
    saveCreation(doc);
  } catch (err) {
    return { error: "badcode", message: err && err.message ? err.message : String(err) };
  }
  return { id, name: doc.name };
}

// The numbers §6 pins, re-exported for the UI that has to show them ("Part limit
// reached (500)", "412 / 500", "Limit 20 — delete one first"): one definition, no
// second copy of a limit drifting away from the one that is enforced.
export const STUDIO_LIMITS = Object.freeze({
  maxParts: MAX_STUDIO_PARTS,
  maxCreations: MAX_CREATIONS,
  maxCodeChars: MAX_CODE_CHARS,
  maxDocBytes: MAX_DOC_BYTES,
  publishAward: PUBLISH_AWARD,
  nameMax: NAME_MAX,
});
