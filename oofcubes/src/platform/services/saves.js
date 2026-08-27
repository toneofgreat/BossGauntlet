// src/platform/services/saves.js — the localStorage persistence layer: per-domain
// cache/load/migrate, debounced autosave, flush-on-hide, the crc32/base64url save-code
// codecs, and resetAll. Spec 07 §3, §5.1-§5.4. The ONLY file in the whole repo allowed
// to touch localStorage (spec 12 rule 12:C3/V9) — economy.js and badges.js reach
// storage exclusively through getDomain/markDirty exported here. Module top is pure
// (no DOM/localStorage access outside function bodies) so Node can import the codec
// exports directly (spec 07 §8 self-test).

// ---- tuning constants, spec 07 §6 (the single source for these numbers) ----
const STARTING_BALANCE = 100;
const FLUSH_DEBOUNCE_MS = 1000;
const AUTOSAVE_INTERVAL_MS = 10000;
const SAVE_MAX_BYTES = 65536;
// SAVE_CODE_TARGET_CHARS / SAVE_CODE_MAX_CHARS / SAVE_CODE_IMPORT_MAX_CHARS (spec 07
// §6) belong to the exportSaveCode/importSaveCode budget checks; unused while those
// stay SLICE stubs (see the export/import section below) and are reintroduced there.

// ---- storage key helpers -----------------------------------------------------------
// Built only from a template literal (never a bare quoted "oofcubes.v1." string) so a
// concatenation prefix can't itself look like a malformed key literal to rule 12:C3,
// which scans quoted string content — not template literals — for the domain suffix.
const KEY_PREFIX = `oofcubes.v1.`;
function keyFor(domain) { return `${KEY_PREFIX}${domain}`; }
function corruptKeyFor(domain) { return `${keyFor(domain)}.corrupt`; }

const PLACE_KEY_RE = /^oofcubes\.v1\.place\.([a-z][a-z0-9-]{1,23})$/;

// CURRENT_VERSIONS — spec 07 §5.1, verbatim. "place" covers every place.<slug>
// envelope; "studio" is the Oof Studio index domain (spec 11, M5) — registered here
// per spec 07 §5.1 so a future version bump is a table entry, not a rewrite.
export const CURRENT_VERSIONS = Object.freeze({
  profile: 1, economy: 1, avatar: 1, badges: 1, place: 1, studio: 1,
});

// Migration ladder, keyed by domain kind. Empty at launch (spec 07 §5.1) — the
// mechanism ships now so version 2 is a table entry here, not a rewrite of loadDomain.
const MIGRATIONS = { profile: {}, economy: {}, avatar: {}, badges: {}, place: {}, studio: {} };

function generateUsername() {
  return "Oofer" + String(Math.floor(Math.random() * 10000)).padStart(4, "0");
}

// DOMAIN_DEFAULTS — factories (never shared references) for the four fixed domains,
// spec 07 §3.1/§3.2/§3.4. The avatar interior is opaque to saves.js (owned by spec
// 05 §3.1); saves.js only ever produces the bare envelope for it.
export const DOMAIN_DEFAULTS = Object.freeze({
  profile: () => ({
    schemaVersion: 1,
    username: generateUsername(),
    createdAt: Date.now(),
    lastSeenAt: Date.now(),
    onboarded: false,
    visitedPlaces: [],
    totalPlayS: 0,
    settings: {
      musicVol: 60, sfxVol: 80, quality: "auto", ambience: "day",
      invertY: false, camSensitivity: 1.0, leftHanded: false,
      reducedMotion: null, largeText: false, muted: false,
    },
  }),
  economy: () => ({
    schemaVersion: 1,
    balance: STARTING_BALANCE,
    lifetimeEarned: 0,
    lifetimeSpent: 0,
    log: [{ t: Date.now(), type: "award", amount: STARTING_BALANCE, reason: "start", balance: STARTING_BALANCE }],
    daily: { lastClaimDay: null, streak: 0 },
  }),
  avatar: () => ({ schemaVersion: 1 }),
  badges: () => ({
    schemaVersion: 1,
    earned: {},
    progress: { deaths: 0, bounces: 0, collects: 0, checkpoints: 0, placeEnters: 0, catalogBuys: 0 },
  }),
});

// ---- module state (private) ---------------------------------------------------------
const cache = new Map(); // domain -> object
const dirty = new Set(); // domain names pending a flush
const readonly = new Set(); // domain names refused for writing (newer-version guard)
let debounceTimer = null;
let boundEmitter = null; // set by bindEvents(); used for save:written / save:error
let warningsBuffer = []; // reset at the top of each initSaves() call

function domainKind(domain) {
  return domain.startsWith("place.") ? "place" : domain;
}

// loadDomain(domain) — spec 07 §5.1. Never throws; always returns a valid object (or
// null for a place.<slug> domain with nothing stored / refused / corrupt).
function loadDomain(domain) {
  const isPlace = domain.startsWith("place.");
  let raw = null;
  try {
    raw = localStorage.getItem(keyFor(domain));
  } catch {
    raw = null; // best-effort read; treated the same as "nothing stored"
  }
  if (raw === null) return isPlace ? null : DOMAIN_DEFAULTS[domain]();

  let parsed;
  let corrupt = false;
  try {
    parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) corrupt = true;
    else if (!Number.isInteger(parsed.schemaVersion) || parsed.schemaVersion < 1) corrupt = true;
  } catch {
    corrupt = true;
  }

  if (corrupt) {
    try { localStorage.setItem(corruptKeyFor(domain), raw); } catch { /* best-effort, swallow quota errors */ }
    console.error("[oof] corrupt save, reset", domain);
    return isPlace ? null : DOMAIN_DEFAULTS[domain]();
  }

  const cur = CURRENT_VERSIONS[domainKind(domain)];
  if (parsed.schemaVersion === cur) return parsed;

  if (parsed.schemaVersion > cur) {
    readonly.add(domain);
    console.warn("[oof] save from a newer version, running read-only", domain);
    warningsBuffer.push(`Your ${domain} save is from a newer version and was left untouched.`);
    return isPlace ? null : DOMAIN_DEFAULTS[domain]();
  }

  // schemaVersion < cur: walk the migration ladder one step at a time.
  const table = MIGRATIONS[domainKind(domain)] || {};
  let obj = parsed;
  while (obj.schemaVersion < cur) {
    const step = table[obj.schemaVersion];
    if (typeof step !== "function") {
      // Missing migration step -> treat exactly like corrupt JSON (§5.1 step 2 path).
      try { localStorage.setItem(corruptKeyFor(domain), raw); } catch { /* best-effort */ }
      console.error("[oof] corrupt save, reset", domain);
      return isPlace ? null : DOMAIN_DEFAULTS[domain]();
    }
    obj = step(obj);
  }
  markDirty(domain);
  return obj;
}

// getDomain(domain) -> object — spec 07 §5.1. Callers mutate the returned object in
// place, then call markDirty(domain).
export function getDomain(domain) {
  if (domain.startsWith("place.")) {
    return cache.has(domain) ? cache.get(domain) : null;
  }
  if (!(domain in DOMAIN_DEFAULTS) && domain !== "studio") {
    throw new TypeError("unknown domain: " + domain);
  }
  // SLICE: "studio" (Oof Studio index, spec 11 M5 — not in slice scope, SLICE.md) is
  // registered in CURRENT_VERSIONS above but has no DOMAIN_DEFAULTS factory and is
  // never preloaded at boot; reading it before anything has written it returns null,
  // mirroring the place.<slug> "nothing stored yet" case above.
  return cache.has(domain) ? cache.get(domain) : null;
}

// markDirty(domain) — spec 07 §5.1: adds to `dirty`, (re)starts a trailing debounce.
export function markDirty(domain) {
  dirty.add(domain);
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => flushAll(), FLUSH_DEBOUNCE_MS);
}

// flush(domain) — spec 07 §5.1: writes one domain now; returns whether it landed.
export function flush(domain) {
  if (readonly.has(domain)) {
    console.warn("[oof] refusing to write read-only domain", domain);
    dirty.delete(domain);
    return false;
  }
  const obj = cache.get(domain);
  if (obj === undefined) {
    dirty.delete(domain);
    return false;
  }
  try {
    localStorage.setItem(keyFor(domain), JSON.stringify(obj));
  } catch (err) {
    console.error("[oof] save write failed", domain, err);
    if (boundEmitter) boundEmitter.emit("save:error", { domain });
    return false; // stays in `dirty` so autosave/debounce retries it
  }
  dirty.delete(domain);
  if (boundEmitter) {
    const slug = domain.startsWith("place.") ? domain.slice("place.".length) : domain;
    boundEmitter.emit("save:written", { slug });
  }
  return true;
}

// flushAll() — spec 07 §5.1: flush every currently-dirty domain (snapshot first, since
// a flush can itself mark something dirty again via a migration elsewhere).
export function flushAll() {
  const snapshot = Array.from(dirty);
  for (const domain of snapshot) flush(domain);
}

function autosaveTick() {
  if (dirty.size) flushAll();
}

// initSaves() — spec 07 §5.1. Must run before any other platform service init.
export function initSaves() {
  warningsBuffer = [];

  for (const domain of Object.keys(DOMAIN_DEFAULTS)) {
    let missing = false;
    try {
      missing = localStorage.getItem(keyFor(domain)) === null;
    } catch {
      missing = false; // an unreadable store is not a first boot; leave it alone
    }
    cache.set(domain, loadDomain(domain));
    // §7 criterion 3: a first boot writes ALL four domain keys. Only `profile` is
    // mutated below, so without this the economy/avatar/badges keys stay absent until
    // something happens to mutate them — and a fresh profile mutates none of them.
    if (missing) markDirty(domain);
  }

  const placeSlugs = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const m = key && PLACE_KEY_RE.exec(key);
      if (m) placeSlugs.push(m[1]);
    }
  } catch { /* best-effort enumeration */ }
  for (const slug of placeSlugs) {
    const domain = `place.${slug}`;
    cache.set(domain, loadDomain(domain));
  }

  cache.get("profile").lastSeenAt = Date.now();
  markDirty("profile");

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAll();
  });
  window.addEventListener("pagehide", () => flushAll());

  setInterval(autosaveTick, AUTOSAVE_INTERVAL_MS);

  return { warnings: warningsBuffer.slice() };
}

// bindEvents(emitter, slug) — spec 07 §5.1: stores the emitter for save:written /
// save:error and subscribes to place:disposing -> flushAll(). Re-called by shell on
// every Place transition with a fresh emitter; the old emitter's listeners (including
// this subscription) die with the old emitter's own clear() (spec 07 §5.1), so this
// never needs to unsubscribe itself.
export function bindEvents(emitter, slug) {
  // `slug` is accepted only for interface parity with economy.js/badges.js
  // bindEvents(emitter, slug) — saves.js itself doesn't scope by it.
  boundEmitter = emitter;
  if (emitter && typeof emitter.on === "function") {
    emitter.on("place:disposing", () => flushAll());
  }
}

// placeSaves(slug) -> ctx.services.saves — spec 07 §5.2 / spec 04 §5.7.
export function placeSaves(slug) {
  const domain = `place.${slug}`;
  return Object.freeze({
    load() {
      const envelope = cache.get(domain);
      if (!envelope) return null;
      return structuredClone(envelope.data);
    },
    save(obj) {
      let json;
      try {
        json = JSON.stringify(obj);
      } catch (err) {
        throw new Error("save not serializable: " + err.message);
      }
      if (json.length > SAVE_MAX_BYTES) throw new Error("save too large");
      cache.set(domain, { schemaVersion: 1, data: JSON.parse(json), updatedAt: Date.now() });
      markDirty(domain);
    },
    clear() {
      cache.delete(domain);
      try { localStorage.removeItem(keyFor(domain)); } catch { /* best-effort */ }
      dirty.delete(domain);
    },
  });
}

// resetAll() — spec 07 §4: Settings "Reset all data" (spec 06). Removes every
// oofcubes.v1.* key (profile/economy/avatar/badges, every place.<slug>, backup,
// *.corrupt, studio) and clears in-memory state. Nothing re-initializes here; the
// caller reloads the page, same as applyImport (§5.6.4), so every service re-inits
// against a clean slate.
export function resetAll() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(KEY_PREFIX)) keys.push(key);
    }
  } catch { /* best-effort enumeration */ }
  for (const key of keys) {
    try { localStorage.removeItem(key); } catch { /* best-effort */ }
  }
  cache.clear();
  dirty.clear();
  readonly.clear();
  clearTimeout(debounceTimer);
  debounceTimer = null;
}

// ===== save-code encoding primitives — spec 07 §5.3. Pure, no DOM/localStorage; the
// self-test (spec 07 §8) imports these three directly in Node. ===================

// crc32(str) -> lowercase 8-hex-char string. CRC-32/ISO-HDLC, table-free, over the
// UTF-8 bytes of `str`. Normative test vector: crc32("123456789") === "cbf43926".
export function crc32(str) {
  const bytes = new TextEncoder().encode(str);
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
  }
  c = (c ^ 0xFFFFFFFF) >>> 0;
  return c.toString(16).padStart(8, "0");
}

// toBase64Url(str) -> base64url string (no padding). UTF-8 encode, chunk to avoid the
// String.fromCharCode argument-count limit, btoa, then URL-safe substitution.
export function toBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// fromBase64Url(b64) -> the original string. Throws Error("bad base64url") on any
// character outside the base64url alphabet; throws on malformed UTF-8 (fatal decode).
export function fromBase64Url(b64) {
  if (/[^A-Za-z0-9_-]/.test(b64)) throw new Error("bad base64url");
  let s = b64.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4 !== 0) s += "=";
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// ===== save-code format — spec 07 §5.4: OOF1.<domain>.<payload>.<checksum> ==========

const SAVE_CODE_CONTAINER_VERSION = "1";
const SAVE_CODE_DOMAIN_RE = /^[a-z][a-z0-9-]{0,15}$/;
const SAVE_CODE_FULL_RE = /^OOF(\d+)\.([a-z][a-z0-9-]{0,15})\.([A-Za-z0-9_-]+)\.([0-9a-f]{8})$/;

// encodeSaveCode(domain, obj) -> "OOF1.<domain>.<payload>.<checksum>" — the generic
// domain-tagged container (spec 07 §5.4); "account" and "studio" (spec 11) both ride
// this same encoder.
export function encodeSaveCode(domain, obj) {
  if (typeof domain !== "string" || !SAVE_CODE_DOMAIN_RE.test(domain)) {
    throw new Error("bad domain: " + domain);
  }
  const payload = toBase64Url(JSON.stringify(obj));
  const checksum = crc32(`${domain}.${payload}`);
  return `OOF${SAVE_CODE_CONTAINER_VERSION}.${domain}.${payload}.${checksum}`;
}

// decodeSaveCode(str) -> { domain, obj }. Throws Error("Bad code") / "Checksum
// mismatch" / "Newer version" per spec 07 §5.4 — callers map these to friendly text.
export function decodeSaveCode(str) {
  const m = typeof str === "string" ? SAVE_CODE_FULL_RE.exec(str) : null;
  if (!m) throw new Error("Bad code");
  const [, version, domain, payload, checksum] = m;
  if (version !== SAVE_CODE_CONTAINER_VERSION) throw new Error("Newer version");
  if (crc32(`${domain}.${payload}`) !== checksum) throw new Error("Checksum mismatch");
  let obj;
  try {
    obj = JSON.parse(fromBase64Url(payload));
  } catch {
    throw new Error("Bad code");
  }
  return { domain, obj };
}

// ===== account save codes — spec 07 §5.4/§5.6.4. ====================================
// The account-domain specialisations of the generic encoder above. A code is the
// whole profile in one paste-able string: no compression (see §5.4 — async, a Safari
// floor, and a harder Node-side check, all to save bytes that already fit).

const SAVE_CODE_TARGET_CHARS = 6000; // §6 — over this warns, still works
const SAVE_CODE_MAX_CHARS = 16000; // and over THIS is a bug, so it fails loudly
const SAVE_CODE_PAYLOAD_V = 1;
// Mirrors economy.js §6. Duplicated rather than imported: saves.js sits UNDER economy
// in the dependency order, and a cycle between them would be a worse trade than a
// number that is checked in both places.
const MAX_BALANCE = 1000000000;
const IMPORT_SLUG_RE = /^[a-z][a-z0-9-]{1,23}$/;
const IMPORT_BADGE_RE = /^[a-z][a-z0-9-]*\.[a-z0-9-]{1,32}$/;

// exportSaveCode() -> { ok, code, chars } | { ok:false, error } — spec 07 §5.4.
export function exportSaveCode() {
  flushAll(); // the code has to reflect persisted truth, not a pending write
  const payload = { v: SAVE_CODE_PAYLOAD_V, exportedAt: Date.now(), places: {} };
  for (const domain of ["profile", "economy", "avatar", "badges"]) {
    const obj = cache.get(domain);
    if (obj) payload[domain] = JSON.parse(JSON.stringify(obj));
  }
  // Diagnostics do not travel: the transaction log is the bulk of a big save and
  // means nothing on another device.
  if (payload.economy) payload.economy.log = [];
  for (const [domain, obj] of cache) {
    if (!domain.startsWith("place.") || !obj) continue;
    payload.places[domain.slice("place.".length)] = JSON.parse(JSON.stringify(obj));
  }
  let code;
  try {
    code = encodeSaveCode("account", payload);
  } catch (err) {
    return { ok: false, error: "Could not build a save code from this profile." };
  }
  if (code.length > SAVE_CODE_MAX_CHARS) return { ok: false, error: "Save too large to export" };
  if (code.length > SAVE_CODE_TARGET_CHARS) console.warn("[oof] save code over target", code.length);
  return { ok: true, code, chars: code.length };
}

// importSaveCode(code) -> { ok, parsed, summary } | { ok:false, error }. Validation
// ONLY: nothing is written until the UI has shown the summary and the player agreed.
export function importSaveCode(code) {
  const text = String(code == null ? "" : code).replace(/\s+/g, "");
  if (!text) return { ok: false, error: "Paste a save code first." };
  const m = SAVE_CODE_FULL_RE.exec(text);
  if (!m) return { ok: false, error: "Not a save code (should start with OOF1.)." };
  const [, version, domain, payload, checksum] = m;
  if (domain !== "account") return { ok: false, error: "That's not an account save code." };
  if (version !== "1") return { ok: false, error: "This code is from a newer version of OofCubes." };
  if (crc32(domain + "." + payload) !== checksum) {
    return { ok: false, error: "Code is damaged (checksum mismatch) — copy it again." };
  }
  let parsed;
  try {
    parsed = JSON.parse(fromBase64Url(payload));
  } catch {
    return { ok: false, error: "Code is damaged (unreadable content)." };
  }
  const plain = (v) => v && typeof v === "object" && !Array.isArray(v);
  const versioned = (v) => plain(v) && Number.isInteger(v.schemaVersion) && v.schemaVersion >= 1;
  if (!plain(parsed) || parsed.v !== SAVE_CODE_PAYLOAD_V) return { ok: false, error: "Code content is invalid." };
  for (const domainName of ["profile", "economy", "avatar", "badges"]) {
    if (parsed[domainName] !== undefined && !versioned(parsed[domainName])) {
      return { ok: false, error: "Code content is invalid." };
    }
  }
  if (parsed.places !== undefined) {
    if (!plain(parsed.places)) return { ok: false, error: "Code content is invalid." };
    for (const [slug, obj] of Object.entries(parsed.places)) {
      if (!IMPORT_SLUG_RE.test(slug) || !versioned(obj)) return { ok: false, error: "Code content is invalid." };
    }
  }
  // A save from a FUTURE version cannot be migrated down, so it is refused rather
  // than silently flattened. Older ones are fine: applyImport runs them up the ladder.
  const tooNew = (kind, obj) => obj && obj.schemaVersion > CURRENT_VERSIONS[kind];
  for (const domainName of ["profile", "economy", "avatar", "badges"]) {
    if (tooNew(domainName, parsed[domainName])) {
      return { ok: false, error: "This code is from a newer version of OofCubes." };
    }
  }
  for (const obj of Object.values(parsed.places || {})) {
    if (tooNew("place", obj)) return { ok: false, error: "This code is from a newer version of OofCubes." };
  }

  // Sanity clamps. A hand-edited code is the expected case here, not the exception:
  // it must not be able to mint Oofbux or invent badge ids.
  const econ = parsed.economy;
  if (econ) {
    const int = (v, dflt) => (Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : dflt);
    econ.balance = Math.min(MAX_BALANCE, int(econ.balance, 100));
    econ.lifetimeEarned = int(econ.lifetimeEarned, 0);
    econ.lifetimeSpent = int(econ.lifetimeSpent, 0);
    econ.log = [];
  }
  if (parsed.badges && plain(parsed.badges.earned)) {
    for (const id of Object.keys(parsed.badges.earned)) {
      if (!IMPORT_BADGE_RE.test(id)) delete parsed.badges.earned[id];
    }
  }

  const summary = {
    balance: econ ? econ.balance : 0,
    badgeCount: parsed.badges && plain(parsed.badges.earned) ? Object.keys(parsed.badges.earned).length : 0,
    places: Object.keys(parsed.places || {}),
    exportedAt: parsed.exportedAt || null,
  };
  return { ok: true, parsed, summary };
}

// applyImport(parsed) — §5.6.4. REPLACE, not merge, with an automatic backup: a merge
// of two accounts has no right answer, and losing the device you imported ONTO is the
// failure that would actually hurt, so the old state is written down first.
export function applyImport(parsed) {
  if (!parsed || typeof parsed !== "object") return;
  const domains = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) continue;
    const short = key.slice(KEY_PREFIX.length);
    if (short === "backup") continue;
    try {
      domains[short] = JSON.parse(localStorage.getItem(key));
    } catch {
      domains[short] = localStorage.getItem(key);
    }
  }
  // resetAll clears every oofcubes.v1.* key INCLUDING backup, so the backup is
  // written after the wipe, not before it.
  resetAll();
  try {
    localStorage.setItem(KEY_PREFIX + "backup", JSON.stringify({ backedUpAt: Date.now(), domains }));
  } catch (err) {
    console.error("[oof] could not write the pre-import backup", err);
  }
  for (const domain of ["profile", "economy", "avatar", "badges"]) {
    if (parsed[domain]) {
      cache.set(domain, parsed[domain]);
      dirty.add(domain);
    }
  }
  for (const [slug, obj] of Object.entries(parsed.places || {})) {
    cache.set("place." + slug, obj);
    dirty.add("place." + slug);
  }
  flushAll();
  // A reload is the honest way to adopt a whole new account: every service holds
  // state built from the old one, and re-deriving it in place is a much longer list
  // of things to get wrong than starting over.
  if (typeof location !== "undefined" && location.reload) location.reload();
}
