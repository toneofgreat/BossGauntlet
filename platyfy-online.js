// platyfy-online.js - shared names, leaderboards and level storage for every platyfy.com game. No sign-up, no keys.
//
// WHERE THE DATA LIVES
//   The OofWorld relay (https://relay.platyfy.com, the owner's own Cloudflare worker + Durable Object) already
//   answers its "published games" API: POST /api/games {token, name, code, visibility, gameId?} creates or updates
//   a record of up to 200 KB, GET /api/games?q=&token= finds records by name, GET /api/games/<id>?token= reads one,
//   DELETE /api/games/<id> {token} removes one. All with CORS "*". A record published as "private" is invisible to
//   everybody except its author (it never shows in OofWorld's Games list and a GET without the token is a 404).
//   So: one shared data account ("pf_datastore", id STORE_ID) owns every record, and this file uses its session
//   token to treat private records as a keyed JSON store. The record's name is the key ("pfo:b:<board>", ...).
//   That needs no redeploy (wrangler login is expired) and no account from the owner.
//
// LIMITS (be a good neighbour: every OofWorld account and game lives in the same Durable Object value)
//   board <= 50 rows, one per player; name docs ~60 B; level <= 30000 bytes of JSON; collection index <= 60 items,
//   <= 8 per owner (over that the owner's own oldest falls off; over 60 the oldest item of the owner holding the most
//   items falls off; a dropped item's record + its "<coll>:<id>" board are deleted). Total stays well under 2 MB.
//   There is no compare-and-swap, so every write is read-merge-write, then read back and verified, with retries;
//   two creators racing on one key are merged into the oldest record and the duplicate is deleted.
//   The token is public (it ships in this file), so anything here is trust-the-client: values are validated and
//   clamped on the way in AND on the way out, and nothing personal is ever sent - names are typed by the player
//   (filtered by platypus/src/names.js) and a player is a random 12-hex id kept in localStorage.
//
// API - every function resolves, never rejects or throws; failures are { ok: false, reason }.
//   reason: "network" (could not reach / timed out), "invalid", "rude", "taken", "noname", "big", "notyours", "missing"
//   getName() -> string ("" when none)          getId() -> this device's public player id
//   isClaimed() -> true when the current name is reserved for this device online
//   setName(raw) -> { ok, name } | { ok:false, reason }      local only
//   claimName(raw) -> { ok, name } | { ok:false, reason }    reserves it everywhere (case-insensitive), keeps old ones
//   submitScore(board, value, { lowerIsBetter, name, extra, min, max }) -> { ok, rank, best, improved, queued? }
//   getTop(board, n = 10, { lowerIsBetter }) -> { ok, rows:[{ rank, name, value, me, extra, t }], me?, stale? }
//   listItems(coll) -> { ok, items:[{ id, o, t, u, mine, ...meta }], stale? }
//   getItem(coll, id) -> { ok, item:{ id, o, t, u, mine, meta, data } }
//   putItem(coll, data, meta?, { id }) -> { ok, id, updated }   (id given + yours: update in place)
//   patchMeta(coll, id, patch) -> { ok }       deleteItem(coll, id) -> { ok }      ping() -> { ok }
// createPlatyfyOnline(cfg) makes an isolated instance (tests: { prefix: "pfo-test:", storage, fetch, relay });
// the named exports are a default instance.
import { checkName, cleanName, isRude } from "./platypus/src/names.js";

const RELAY = "https://relay.platyfy.com";
const STORE_ID = "1d7249";
const STORE_TOKEN = "e38904a80e48e8e4604a1da3db1003c258c1beb130bb149decf1bbef104393a5";

export const LIMITS = Object.freeze({
  BOARD_ROWS: 50, ITEM_BYTES: 30000, INDEX_ITEMS: 60, PER_OWNER: 8, META_BYTES: 700, QUEUE: 30, KEY: /^[a-z0-9][a-z0-9:_-]{0,31}$/,
  COLL: /^[a-z0-9][a-z0-9_-]{0,11}$/, ID: /^[a-z0-9]{8}$/,
});
const TIMEOUT = 8000, RETRY_AFTER = 1200, WRITE_TRIES = 4, TOP_TTL = 4000;
const ID_KEY = "platyfy.online.v1", IDS_KEY = "platyfy.online.ids.v1", CACHE_KEY = "platyfy.online.cache.v1", QUEUE_KEY = "platyfy.online.queue.v1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = (...a) => { try { console.debug("[platyfy-online]", ...a); } catch (e) { /* ignore */ } };
function rndHex(n) {
  const b = new Uint8Array(Math.ceil(n / 2));
  try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < b.length; i++) b[i] = (Math.random() * 256) | 0; }
  let s = ""; for (const x of b) s += (x < 16 ? "0" : "") + x.toString(16);
  return s.slice(0, n);
}
function rndId() { const h = rndHex(16); let s = ""; for (let i = 0; i < 8; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789"[parseInt(h.slice(i * 2, i * 2 + 2), 16) % 36]; return s; }
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; }
function defaultStorage() { try { if (typeof localStorage !== "undefined" && localStorage) { localStorage.getItem("x"); return localStorage; } } catch (e) { /* blocked */ } return memStorage(); }
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, max) : "");

// a meta object from anywhere (the caller, or the store) -> a small flat object of short strings / numbers / booleans
function cleanMeta(m) {
  const out = {};
  if (!m || typeof m !== "object") return out;
  let n = 0;
  for (const k of Object.keys(m)) {
    if (n >= 16 || !/^[a-zA-Z][a-zA-Z0-9_]{0,15}$/.test(k) || k === "id" || k === "o" || k === "t" || k === "u" || k === "mine") continue;
    const v = m[k];
    if (typeof v === "string") out[k] = str(v, 60);
    else if (finite(v)) out[k] = Math.round(v * 1000) / 1000;
    else if (typeof v === "boolean") out[k] = v;
    else continue;
    n++;
  }
  while (JSON.stringify(out).length > LIMITS.META_BYTES) { const ks = Object.keys(out); delete out[ks[ks.length - 1]]; }
  return out;
}
function cleanRow(r) {
  if (!r || typeof r !== "object" || !finite(r.v) || typeof r.o !== "string" || !/^[0-9a-f]{12}$/.test(r.o)) return null;
  const c = checkName(r.n);
  if (!c.ok) return null;  // the store is writable by anyone with the public token: re-filter what comes back
  const row = { n: c.name, o: r.o, v: r.v, t: finite(r.t) ? r.t : 0 };
  if (r.x && typeof r.x === "object") row.x = cleanMeta(r.x);
  return row;
}
const better = (a, b, low) => (low ? a < b : a > b);
function sortRows(rows, low) { return rows.sort((a, b) => (low ? a.v - b.v : b.v - a.v) || a.t - b.t || (a.o < b.o ? -1 : 1)); }
// boards: one row per player, the best value, capped
function mergeBoards(docs, low) {
  const by = new Map();
  for (const d of docs) for (const r0 of (d && Array.isArray(d.rows) ? d.rows : [])) {
    const r = cleanRow(r0); if (!r) continue;
    const had = by.get(r.o);
    if (!had || better(r.v, had.v, low) || (r.v === had.v && r.t > had.t)) by.set(r.o, r);
  }
  return sortRows([...by.values()], low).slice(0, LIMITS.BOARD_ROWS);
}
function cleanIndexItem(it) {
  if (!it || typeof it !== "object" || typeof it.id !== "string" || !LIMITS.ID.test(it.id) || typeof it.o !== "string" || !/^[0-9a-f]{12}$/.test(it.o)) return null;
  // stored packed as { id, o, t, u, m:{meta} }; handed around flat as { id, o, t, u, ...meta }
  return { ...cleanMeta(it.m && typeof it.m === "object" ? it.m : it), id: it.id, o: it.o, t: finite(it.t) ? it.t : 0, u: finite(it.u) ? it.u : 0 };
}
function mergeIndexes(docs) {
  const by = new Map();
  for (const d of docs) for (const it0 of (d && Array.isArray(d.items) ? d.items : [])) {
    const it = cleanIndexItem(it0); if (!it) continue;
    const had = by.get(it.id);
    if (!had || it.u > had.u) by.set(it.id, it);
  }
  return [...by.values()].sort((a, b) => b.t - a.t);
}
const packIndexItem = (it) => { const { id, o, t, u, mine, ...m } = it; return { id, o, t, u, m: cleanMeta(m) }; };

export function createPlatyfyOnline(cfg = {}) {
  const BASE = String(cfg.relay || RELAY).replace(/\/+$/, "");
  const TOKEN = cfg.token || STORE_TOKEN, OWNER = cfg.storeId || STORE_ID;
  const P = cfg.prefix || "pfo:";
  const store = cfg.storage || defaultStorage();
  const doFetch = cfg.fetch || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
  const lsGet = (k) => { try { const v = store.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  const lsSet = (k, v) => { try { store.setItem(k, JSON.stringify(v)); } catch (e) { /* full or blocked */ } };
  const NS = P === "pfo:" ? "" : ":" + P;  // test instances keep their own identity and caches

  // ---- identity: a random public id + the name the player typed. Nothing else, ever.
  const me = lsGet(ID_KEY + NS) || {};
  const ident = { o: typeof me.o === "string" && /^[0-9a-f]{12}$/.test(me.o) ? me.o : rndHex(12), name: "", claimed: "" };
  { const c = checkName(me.name); if (c.ok) ident.name = c.name; const d = checkName(me.claimed); if (d.ok) ident.claimed = d.name; }
  const saveIdent = () => lsSet(ID_KEY + NS, { o: ident.o, name: ident.name, claimed: ident.claimed });
  saveIdent();

  // ---- transport
  // -> { ok, status, data } ; network failures and 5xx retry once
  async function req(method, path, body) {
    if (!doFetch) return { ok: false, status: 0 };
    for (let attempt = 0; attempt < 2; attempt++) {
      let timer = 0;
      try {
        const ctl = typeof AbortController === "function" ? new AbortController() : null;
        if (ctl) timer = setTimeout(() => ctl.abort(), TIMEOUT);
        const r = await doFetch(BASE + path, {
          method, cache: "no-store", signal: ctl ? ctl.signal : undefined,
          headers: body === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        clearTimeout(timer);
        let data = null;
        try { const t = await r.text(); data = t ? JSON.parse(t) : null; } catch (e) { data = null; }
        if (r.status >= 500 && attempt === 0) { await sleep(RETRY_AFTER); continue; }
        return { ok: r.ok, status: r.status, data };
      } catch (e) {
        clearTimeout(timer);
        quiet(method, path.split("?")[0], (e && e.message) || e);
        if (attempt === 0) await sleep(RETRY_AFTER);
      }
    }
    return { ok: false, status: 0 };
  }
  const NET = { ok: false, reason: "network" };

  // ---- the record layer: key -> JSON, on private relay records named by the key
  const ids = Object.assign(Object.create(null), lsGet(IDS_KEY + NS) || {});
  const rememberId = (key, id) => {
    if (id) ids[key] = id; else delete ids[key];
    const ks = Object.keys(ids); if (ks.length > 300) for (const k of ks.slice(0, ks.length - 300)) delete ids[k];
    lsSet(IDS_KEY + NS, ids);
  };
  // all records with exactly this key, oldest first -> { ok, list:[{id, published}] }
  async function search(key) {
    const r = await req("GET", "/api/games?limit=100&q=" + encodeURIComponent(key) + "&token=" + TOKEN);
    if (!r.ok || !r.data || !Array.isArray(r.data.games)) return NET;
    const list = r.data.games.filter((g) => g && g.name === key && g.authorId === OWNER && g.visibility === "private")
      .map((g) => ({ id: String(g.id), published: +g.published || 0 }))
      .sort((a, b) => a.published - b.published || (a.id < b.id ? -1 : 1));
    return { ok: true, list };
  }
  // -> { ok, data } | { ok:false, reason:"missing" } | NET
  async function fetchRec(id, key) {
    const r = await req("GET", "/api/games/" + encodeURIComponent(id) + "?token=" + TOKEN);
    if (r.status === 404) return { ok: false, reason: "missing" };
    if (!r.ok || !r.data || !r.data.game) return NET;
    const g = r.data.game;
    if (g.name !== key || g.authorId !== OWNER) return { ok: false, reason: "missing" };
    let data = null;
    try { data = JSON.parse(g.code); } catch (e) { data = null; }
    return { ok: true, data, updated: +g.updated || 0 };
  }
  // -> { ok, id, data, dups:[{id, data}] }   (id null = no record yet)
  async function readKey(key, { fresh } = {}) {
    if (!fresh && ids[key]) {
      const f = await fetchRec(ids[key], key);
      if (f.ok) return { ok: true, id: ids[key], data: f.data, dups: [] };
      if (f.reason !== "missing") return NET;
      rememberId(key, null);
    }
    const s = await search(key);
    if (!s.ok) return NET;
    if (!s.list.length) return { ok: true, id: null, data: null, dups: [] };
    const recs = [];
    for (const it of s.list.slice(0, 6)) {
      const f = await fetchRec(it.id, key);
      if (f.ok) recs.push({ id: it.id, data: f.data });
      else if (f.reason !== "missing") return NET;
    }
    if (!recs.length) return { ok: true, id: null, data: null, dups: [] };
    rememberId(key, recs[0].id);
    return { ok: true, id: recs[0].id, data: recs[0].data, dups: recs.slice(1) };
  }
  async function putRec(key, data, id) {
    const code = JSON.stringify(data);
    const r = await req("POST", "/api/games", { token: TOKEN, name: key, code, visibility: "private", ...(id ? { gameId: id } : {}) });
    if (!r.ok || !r.data || !r.data.id) return r.status === 413 ? { ok: false, reason: "big" } : NET;
    return { ok: true, id: String(r.data.id) };
  }
  async function delRec(id) {
    const r = await req("DELETE", "/api/games/" + encodeURIComponent(id), { token: TOKEN });
    return { ok: r.ok || r.status === 404 };
  }
  async function deleteKey(key) {
    const s = await search(key);
    if (!s.ok) return NET;
    for (const it of s.list) await delRec(it.id);
    rememberId(key, null);
    return { ok: true };
  }
  // read-merge-write-verify. merge(primary, dups[]) -> current value; mutate(current) -> next value, or
  // undefined (nothing to write) or { abort: result }; verify(stored) -> true when our change survived.
  const chains = Object.create(null);
  function writeKey(key, { merge, mutate, verify, maxBytes }) {
    const prev = chains[key] || Promise.resolve();
    const run = prev.then(async () => {
      for (let attempt = 0; attempt < WRITE_TRIES; attempt++) {
        if (attempt) await sleep(250 + Math.random() * 600 * attempt);
        const cur = await readKey(key, { fresh: attempt > 0 });
        if (!cur.ok) return NET;
        const base = merge ? merge(cur.data, cur.dups.map((d) => d.data)) : cur.data;
        const next = mutate(base, cur);
        if (next && next.abort) return next.abort;
        if (next === undefined) {
          if (!cur.dups.length) return { ok: true, value: base, unchanged: true };
        }
        const value = next === undefined ? base : next;
        if (JSON.stringify(value).length > (maxBytes || 60000)) return { ok: false, reason: "big" };
        const put = await putRec(key, value, cur.id);
        if (!put.ok) { if (put.reason === "big") return put; if (cur.id) rememberId(key, null); continue; }
        rememberId(key, cur.id || put.id);
        if (!cur.id) {
          // we created it: did someone else create the same key at the same moment?
          const s = await search(key);
          if (s.ok && s.list.length > 1 && s.list[0].id !== put.id) { rememberId(key, null); continue; } // merge into theirs
        }
        for (const d of cur.dups) await delRec(d.id);  // their content is in ours now
        const back = await fetchRec(cur.id || put.id, key);
        if (back.ok && (!verify || verify(back.data))) return { ok: true, value: back.data, id: cur.id || put.id };
        if (!back.ok && back.reason !== "missing") return NET;
      }
      return NET;
    });
    chains[key] = run.catch(() => {});
    return run;
  }

  // ---- offline caches
  const cache = Object.assign(Object.create(null), lsGet(CACHE_KEY + NS) || {});
  function cachePut(k, v) {
    cache[k] = { at: Date.now(), v };
    const ks = Object.keys(cache).sort((a, b) => cache[a].at - cache[b].at);
    while (ks.length > 40) delete cache[ks.shift()];
    let s = JSON.stringify(cache);
    while (s.length > 400000 && Object.keys(cache).length) { delete cache[Object.keys(cache).sort((a, b) => cache[a].at - cache[b].at)[0]]; s = JSON.stringify(cache); }
    lsSet(CACHE_KEY + NS, cache);
  }
  const cacheGet = (k) => (cache[k] ? cache[k].v : null);
  const topMem = Object.create(null);  // board -> { at, rows } for a few seconds, so a menu does not hammer the relay

  // ---- names
  const nameKey = (name) => P + "n:" + name.toLowerCase();
  function getName() { return ident.name; }
  function setName(raw) {
    const c = checkName(raw);
    if (!c.ok) return { ok: false, reason: c.reason === "rude" ? "rude" : "invalid" };
    ident.name = c.name; saveIdent();
    return { ok: true, name: c.name };
  }
  async function claimName(raw) {
    const c = checkName(raw);
    if (!c.ok) return { ok: false, reason: c.reason === "rude" ? "rude" : "invalid" };
    const key = nameKey(c.name);
    const w = await writeKey(key, {
      // the OLDEST record of a name wins; a racing duplicate is not merged
      merge: (d) => d,
      mutate: (d) => {
        if (d && typeof d.o === "string" && d.o !== ident.o) return { abort: { ok: false, reason: "taken" } };
        if (d && d.o === ident.o && d.n === c.name) return undefined;
        return { v: 1, o: ident.o, n: c.name, t: Date.now() };
      },
      verify: (d) => !!d && d.o === ident.o,
    });
    if (!w.ok) {
      if (w.reason !== "taken") { ident.name = c.name; saveIdent(); }  // keep it locally; claim again later
      return w.reason === "taken" ? { ok: false, reason: "taken" } : { ok: false, reason: w.reason || "network", name: c.name };
    }
    ident.name = c.name; ident.claimed = c.name; saveIdent();
    return { ok: true, name: c.name };
  }
  const isClaimed = () => !!ident.name && ident.claimed === ident.name;
  // the current name, claimed now if it is not yet -> { ok, name } | { ok:false, reason }
  async function ensureName(raw) {
    if (raw !== undefined && raw !== null && raw !== "") {
      const c = checkName(raw);
      if (!c.ok) return { ok: false, reason: c.reason === "rude" ? "rude" : "invalid" };
      if (c.name === ident.claimed) { if (ident.name !== c.name) { ident.name = c.name; saveIdent(); } return { ok: true, name: c.name }; }
      return claimName(c.name);
    }
    if (!ident.name) return { ok: false, reason: "noname" };
    if (isClaimed()) return { ok: true, name: ident.name };
    return claimName(ident.name);
  }

  // ---- boards
  const boardKey = (b) => P + "b:" + b;
  const okBoard = (b) => typeof b === "string" && LIMITS.KEY.test(b);
  function queue() { const q = lsGet(QUEUE_KEY + NS); return Array.isArray(q) ? q : []; }
  function enqueue(it) { const q = queue().filter((x) => !(x.board === it.board && x.low === it.low && !better(it.value, x.value, it.low))); q.push(it); lsSet(QUEUE_KEY + NS, q.slice(-LIMITS.QUEUE)); }
  let flushing = null;
  function flush() {
    if (flushing) return flushing;
    const q = queue();
    if (!q.length) return Promise.resolve();
    flushing = (async () => {
      lsSet(QUEUE_KEY + NS, []);
      for (const it of q) {
        const r = await submitNow(it.board, it.value, { lowerIsBetter: it.low, extra: it.extra });
        if (!r.ok && r.reason === "network") enqueue(it);
      }
      flushing = null;
    })().catch(() => { flushing = null; });
    return flushing;
  }
  async function submitNow(board, value, o) {
    const low = !!o.lowerIsBetter, extra = o.extra ? cleanMeta(o.extra) : null;
    const name = ident.name;
    let improved = false;
    const w = await writeKey(boardKey(board), {
      merge: (d, dups) => ({ v: 1, low, rows: mergeBoards([d].concat(dups), low) }),
      mutate: (d) => {
        const mine = d.rows.find((r) => r.o === ident.o);
        if (mine && !better(value, mine.v, low)) {
          if (mine.n === name) return undefined;
          mine.n = name;  // a rename shows on the board
          return d;
        }
        improved = true;
        const row = { n: name, o: ident.o, v: value, t: Date.now() };
        if (extra && Object.keys(extra).length) row.x = extra;
        d.rows = sortRows(d.rows.filter((r) => r.o !== ident.o).concat([row]), low).slice(0, LIMITS.BOARD_ROWS);
        return d;
      },
      verify: (d) => {
        const rows = d && Array.isArray(d.rows) ? d.rows : [];
        const mine = rows.find((r) => r.o === ident.o);
        if (mine) return !better(value, mine.v, low);
        // not on the board: fine only when the board is full of better values
        return rows.length >= LIMITS.BOARD_ROWS && !better(value, rows[rows.length - 1].v, low);
      },
      maxBytes: 20000,
    });
    if (!w.ok) return w;
    const rows = mergeBoards([w.value], low);
    const i = rows.findIndex((r) => r.o === ident.o);
    delete topMem[board];
    return { ok: true, rank: i >= 0 ? i + 1 : 0, best: i >= 0 ? rows[i].v : value, improved };
  }
  async function submitScore(board, value, opts = {}) {
    try {
      if (!okBoard(board) || !finite(value)) return { ok: false, reason: "invalid" };
      const lo = finite(opts.min) ? opts.min : -1e12, hi = finite(opts.max) ? opts.max : 1e12;
      if (value < lo || value > hi) return { ok: false, reason: "invalid" };
      const v = opts.float ? Math.round(value * 1000) / 1000 : Math.round(value);
      const n = await ensureName(opts.name);
      if (!n.ok) {
        if (n.reason === "network" && ident.name) { enqueue({ board, value: v, low: !!opts.lowerIsBetter, extra: opts.extra || null }); return { ok: false, reason: "network", queued: true }; }
        return n;
      }
      const r = await submitNow(board, v, opts);
      if (!r.ok && r.reason === "network") { enqueue({ board, value: v, low: !!opts.lowerIsBetter, extra: opts.extra || null }); return { ok: false, reason: "network", queued: true }; }
      if (r.ok) flush();
      return r;
    } catch (e) { quiet("submitScore", e); return NET; }
  }
  function shapeTop(rawRows, n, low) {
    const rows = mergeBoards([{ rows: rawRows }], low);
    const out = rows.slice(0, n).map((r, i) => ({ rank: i + 1, name: r.n, value: r.v, me: r.o === ident.o, extra: r.x || null, t: r.t }));
    const i = rows.findIndex((r) => r.o === ident.o);
    return { rows: out, me: i >= 0 ? { rank: i + 1, value: rows[i].v, extra: rows[i].x || null } : null };
  }
  async function getTop(board, n = 10, opts = {}) {
    try {
      if (!okBoard(board)) return { ok: false, reason: "invalid", rows: [] };
      n = Math.max(1, Math.min(LIMITS.BOARD_ROWS, n | 0 || 10));
      const m = topMem[board];
      let rows = null, low = !!opts.lowerIsBetter;
      if (m && Date.now() - m.at < TOP_TTL) { rows = m.rows; low = m.low; }
      else {
        const r = await readKey(boardKey(board));
        if (!r.ok) {
          const c = cacheGet("b:" + board);
          return c ? { ok: false, reason: "network", stale: true, ...shapeTop(c.rows, n, c.low) } : { ok: false, reason: "network", rows: [] };
        }
        const docs = [r.data].concat(r.dups.map((d) => d.data));
        if (r.data && typeof r.data.low === "boolean" && opts.lowerIsBetter === undefined) low = r.data.low;
        rows = mergeBoards(docs, low);
        topMem[board] = { at: Date.now(), rows, low };
        cachePut("b:" + board, { rows, low });
        flush();
      }
      return { ok: true, ...shapeTop(rows, n, low) };
    } catch (e) { quiet("getTop", e); return { ok: false, reason: "network", rows: [] }; }
  }

  // ---- collections (shared user levels)
  const indexKey = (coll) => P + "c:" + coll;
  const itemKey = (coll, id) => P + "i:" + coll + ":" + id;
  const shapeItem = (it) => ({ ...it, mine: it.o === ident.o });
  async function listItems(coll) {
    try {
      if (typeof coll !== "string" || !LIMITS.COLL.test(coll)) return { ok: false, reason: "invalid", items: [] };
      const r = await readKey(indexKey(coll));
      if (!r.ok) { const c = cacheGet("c:" + coll); return { ok: false, reason: "network", stale: !!c, items: (c || []).map(shapeItem) }; }
      const items = mergeIndexes([r.data].concat(r.dups.map((d) => d.data)));
      cachePut("c:" + coll, items);
      return { ok: true, items: items.map(shapeItem) };
    } catch (e) { quiet("listItems", e); return { ok: false, reason: "network", items: [] }; }
  }
  async function getItem(coll, id) {
    try {
      if (typeof coll !== "string" || !LIMITS.COLL.test(coll) || typeof id !== "string" || !LIMITS.ID.test(id)) return { ok: false, reason: "invalid" };
      const r = await readKey(itemKey(coll, id));
      if (!r.ok) { const c = cacheGet("i:" + coll + ":" + id); return c ? { ok: true, stale: true, item: shapeItem(c) } : NET; }
      const d = r.data;
      if (!d || typeof d !== "object" || d.id !== id || !("data" in d)) return { ok: false, reason: "missing" };
      const item = { id, o: typeof d.o === "string" ? d.o : "", t: finite(d.t) ? d.t : 0, u: finite(d.u) ? d.u : 0, meta: cleanMeta(d.m), data: d.data };
      if (JSON.stringify(item).length < 40000) cachePut("i:" + coll + ":" + id, item);
      return { ok: true, item: shapeItem(item) };
    } catch (e) { quiet("getItem", e); return NET; }
  }
  async function putItem(coll, data, meta = {}, opts = {}) {
    try {
      if (typeof coll !== "string" || !LIMITS.COLL.test(coll)) return { ok: false, reason: "invalid" };
      let json;
      try { json = JSON.stringify(data); } catch (e) { return { ok: false, reason: "invalid" }; }
      if (json === undefined) return { ok: false, reason: "invalid" };
      if (json.length > LIMITS.ITEM_BYTES) return { ok: false, reason: "big" };
      const m = cleanMeta(meta);
      for (const k of Object.keys(m)) if ((k === "name" || k === "title" || k === "desc") && typeof m[k] === "string" && m[k] && isRude(m[k])) return { ok: false, reason: "rude" };
      if (typeof m.author === "string" && m.author) { const a = checkName(m.author); if (!a.ok) delete m.author; }
      const now = Date.now();
      // an update must be ours: the index says who owns an id
      let id = typeof opts.id === "string" && LIMITS.ID.test(opts.id) ? opts.id : "";
      let created = now;
      if (id) {
        const li = await listItems(coll);
        if (!li.ok) return NET;
        const had = li.items.find((x) => x.id === id);
        if (had && had.o !== ident.o) return { ok: false, reason: "notyours" };
        if (had) created = had.t; else id = "";
      }
      const updated = !!id;
      if (!id) id = rndId();
      const doc = { v: 1, id, o: ident.o, t: created, u: now, m, data };
      const w1 = await writeKey(itemKey(coll, id), {
        mutate: (d) => (d && d.o && d.o !== ident.o ? { abort: { ok: false, reason: "notyours" } } : doc),
        verify: (d) => !!d && d.o === ident.o && d.u === now,
        maxBytes: LIMITS.ITEM_BYTES + 2000,
      });
      if (!w1.ok) return w1;
      let evicted = [];
      const w2 = await writeKey(indexKey(coll), {
        merge: (d, dups) => ({ v: 1, items: mergeIndexes([d].concat(dups)) }),
        mutate: (d) => {
          const items = d.items.filter((x) => x.id !== id);
          items.unshift({ id, o: ident.o, t: created, u: now, ...m });
          items.sort((a, b) => b.t - a.t);
          // eviction never lets one device wipe everyone else: first each owner keeps at most PER_OWNER items (their
          // own oldest go), then, if the index is still over INDEX_ITEMS, the oldest item of whoever holds the MOST
          // items goes (so a flood only ever pushes out the flooder's own levels first).
          evicted = [];
          const count = new Map();
          for (const x of items) count.set(x.o, (count.get(x.o) || 0) + 1);
          const drop = (x) => { evicted.push(x); count.set(x.o, count.get(x.o) - 1); };
          for (let i = items.length - 1; i >= 0; i--) if (count.get(items[i].o) > LIMITS.PER_OWNER && items[i].id !== id) { drop(items[i]); items.splice(i, 1); }
          while (items.length > LIMITS.INDEX_ITEMS) {
            let bi = -1, bc = 0;
            for (let i = items.length - 1; i >= 0; i--) { const c = count.get(items[i].o); if (items[i].id !== id && c > bc) { bc = c; bi = i; } }
            if (bi < 0) break;
            drop(items[bi]); items.splice(bi, 1);
          }
          return { v: 1, items: items.map(packIndexItem) };
        },
        verify: (d) => !!d && Array.isArray(d.items) && d.items.some((x) => x && x.id === id && x.u === now),
        maxBytes: 80000,
      });
      if (!w2.ok) return w2;
      for (const ev of evicted) { await deleteKey(itemKey(coll, ev.id)); await deleteKey(boardKey(coll + ":" + ev.id)); }
      cachePut("i:" + coll + ":" + id, { id, o: ident.o, t: created, u: now, meta: m, data });
      return { ok: true, id, updated };
    } catch (e) { quiet("putItem", e); return NET; }
  }
  async function patchMeta(coll, id, patch) {
    try {
      if (typeof coll !== "string" || !LIMITS.COLL.test(coll) || typeof id !== "string" || !LIMITS.ID.test(id)) return { ok: false, reason: "invalid" };
      const p = cleanMeta(patch);
      let stamp = 0;
      const w = await writeKey(indexKey(coll), {
        merge: (d, dups) => ({ v: 1, items: mergeIndexes([d].concat(dups)) }),
        mutate: (d) => {
          const it = d.items.find((x) => x.id === id);
          if (!it) return { abort: { ok: false, reason: "missing" } };
          if (it.o !== ident.o) return { abort: { ok: false, reason: "notyours" } };
          Object.assign(it, p); stamp = it.u = Math.max(Date.now(), it.u + 1);
          return { v: 1, items: d.items.map(packIndexItem) };
        },
        verify: (d) => !!d && Array.isArray(d.items) && d.items.some((x) => x && x.id === id && x.u === stamp),
        maxBytes: 80000,
      });
      return w.ok ? { ok: true } : w;
    } catch (e) { return NET; }
  }
  async function deleteItem(coll, id) {
    try {
      if (typeof coll !== "string" || !LIMITS.COLL.test(coll) || typeof id !== "string" || !LIMITS.ID.test(id)) return { ok: false, reason: "invalid" };
      const w = await writeKey(indexKey(coll), {
        merge: (d, dups) => ({ v: 1, items: mergeIndexes([d].concat(dups)) }),
        mutate: (d) => {
          const it = d.items.find((x) => x.id === id);
          if (!it) return undefined;
          if (it.o !== ident.o) return { abort: { ok: false, reason: "notyours" } };
          return { v: 1, items: d.items.filter((x) => x.id !== id).map(packIndexItem) };
        },
        verify: (d) => !!d && Array.isArray(d.items) && !d.items.some((x) => x && x.id === id),
      });
      if (!w.ok) return w;
      await deleteKey(itemKey(coll, id)); await deleteKey(boardKey(coll + ":" + id));
      return { ok: true };
    } catch (e) { return NET; }
  }
  async function ping() {
    try { const r = await req("GET", "/api/games?limit=1&q=" + encodeURIComponent(P + "ping") + "&token=" + TOKEN); return r.ok && r.data && Array.isArray(r.data.games) ? { ok: true } : NET; }
    catch (e) { return NET; }
  }

  return {
    getName, setName, claimName, isClaimed, getId: () => ident.o, ensureName: (n) => ensureName(n).catch(() => NET),
    submitScore, getTop, listItems, getItem, putItem, patchMeta, deleteItem, ping, flush: () => flush(),
    // tests / admin tools only (node): raw keyed access and cleanup of a test prefix
    _raw: { readKey, writeKey, deleteKey, search, prefix: P },
  };
}

// tests only: globalThis.__PLATYFY_ONLINE_TEST = { prefix: "pfo-test...:" } before the first import isolates every key
const def = createPlatyfyOnline((typeof globalThis !== "undefined" && globalThis.__PLATYFY_ONLINE_TEST) || {});
export const getName = def.getName, setName = def.setName, claimName = def.claimName, isClaimed = def.isClaimed, getId = def.getId;
export const ensureName = def.ensureName, submitScore = def.submitScore, getTop = def.getTop, flush = def.flush;
export const listItems = def.listItems, getItem = def.getItem, putItem = def.putItem, patchMeta = def.patchMeta, deleteItem = def.deleteItem, ping = def.ping;
export default def;
export { cleanName };
