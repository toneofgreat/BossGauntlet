// online.js - names and leaderboards over Supabase's plain REST API (PostgREST; no SDK). LEVELS3.md A4.
// Every promise resolves (never rejects, never throws); every failure is { ok: false, reason }. With an empty
// online-config.js nothing is ever fetched and every call resolves { ok: false, offline: true, reason: "offline" }.
//
// Identity: a 32-byte random token (hex) in localStorage["platypus.online.v1"] = { token, id, name }. The server keeps
// only sha256(token). The token travels only inside POST bodies, never in a URL.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./online-config.js";
import { checkName, cleanName } from "./names.js";

const ID_KEY = "platypus.online.v1";
const NAME_KEY = "platypus.name.v1";
const QUEUE_KEY = "platypus.online.queue.v1";
const QUEUE_MAX = 20;
const TIMEOUT = 8000, RETRY_AFTER = 1500;

function lsGet(k) { try { const v = window.localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function lsSet(k, v) { try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
const quiet = (...a) => { try { console.debug("[online]", ...a); } catch (e) { /* ignore */ } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function newToken() {
  const b = new Uint8Array(32);
  try { crypto.getRandomValues(b); } catch (e) { for (let i = 0; i < 32; i++) b[i] = (Math.random() * 256) | 0; }
  let s = "";
  for (let i = 0; i < 32; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
  return s;
}

// cfg (tests / tools only): { url, key }
export function createOnline(cfg) {
  const URL0 = ((cfg && cfg.url) || SUPABASE_URL || "").replace(/\/+$/, "");
  const KEY = (cfg && cfg.key) || SUPABASE_ANON_KEY || "";
  const enabled = !!(URL0 && KEY && typeof fetch === "function");
  const OFF = Object.freeze({ ok: false, offline: true, reason: "offline" });

  const me = lsGet(ID_KEY) || {};
  const ident = { token: typeof me.token === "string" && /^[0-9a-f]{64}$/.test(me.token) ? me.token : "", id: me.id || "", name: me.name || "" };
  let localName = "";
  { const n = lsGet(NAME_KEY); if (typeof n === "string" && checkName(n).ok) localName = cleanName(n); }
  if (!localName && ident.name) localName = ident.name;
  const runs = Object.create(null);  // level -> { id, hard }
  let readyP = null;
  let needsName = "";                 // "taken" when the stored name turned out to be someone else's

  function saveIdent() { lsSet(ID_KEY, { token: ident.token, id: ident.id, name: ident.name }); }
  function token() { if (!ident.token) { ident.token = newToken(); saveIdent(); } return ident.token; }
  function setLocalName(n) { localName = n || ""; lsSet(NAME_KEY, localName); }

  // ---- transport ----
  // -> { ok: true, data } | { ok: false, reason: "network" | "http", status }
  async function req(method, path, body) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let ctl = null, timer = 0;
      try {
        ctl = typeof AbortController === "function" ? new AbortController() : null;
        if (ctl) timer = setTimeout(() => ctl.abort(), TIMEOUT);
        const r = await fetch(URL0 + path, {
          method,
          headers: { apikey: KEY, Authorization: "Bearer " + KEY, "Content-Type": "application/json", Accept: "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctl ? ctl.signal : undefined,
          cache: "no-store",
        });
        clearTimeout(timer);
        if (r.status >= 400 && r.status < 500) { quiet(method, path, r.status); return { ok: false, reason: "http", status: r.status }; }
        if (!r.ok) throw new Error("status " + r.status);
        const txt = await r.text();
        let data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        return { ok: true, data };
      } catch (e) {
        clearTimeout(timer);
        quiet(method, path, (e && e.message) || e);
        if (attempt === 0) await sleep(RETRY_AFTER);
      }
    }
    return { ok: false, reason: "network" };
  }
  async function rpc(fn, args) {
    const r = await req("POST", "/rest/v1/rpc/" + fn, args);
    if (!r.ok) return { ok: false, reason: r.reason };
    const d = r.data;
    if (!d || typeof d !== "object") return { ok: false, reason: "network" };
    return d;
  }

  // ---- the queue of submissions that could not reach the server ----
  function queue() { const q = lsGet(QUEUE_KEY); return Array.isArray(q) ? q : []; }
  function enqueue(item) { const q = queue(); q.push(item); while (q.length > QUEUE_MAX) q.shift(); lsSet(QUEUE_KEY, q); }
  async function flush() {
    const q = queue();
    if (!q.length) return;
    lsSet(QUEUE_KEY, []);
    const keep = [];
    for (const it of q) {
      const r = it.kind === "coins"
        ? await rpc("submit_coins", { p_token: token(), p_run: it.run, p_coins: it.coins })
        : await rpc("submit_time", { p_token: token(), p_run: it.run, p_ms: it.ms });
      if (!r.ok && r.reason === "network") keep.push(it);
    }
    if (keep.length) { const q2 = queue().concat(keep); lsSet(QUEUE_KEY, q2.slice(-QUEUE_MAX)); }
  }

  function applyNameResult(r, name) {
    if (r && r.ok) {
      if (r.id) ident.id = String(r.id);
      ident.name = r.name || name;
      saveIdent();
      setLocalName(ident.name);
      needsName = "";
      return { ok: true, name: ident.name };
    }
    const reason = r && (r.reason === "taken" || r.reason === "rude" || r.reason === "network" || r.reason === "slow") ? r.reason : "invalid";
    if (r && r.id && !ident.id) { ident.id = String(r.id); saveIdent(); }
    return { ok: false, reason };
  }
  async function sendName(fn, raw) {
    const c = checkName(raw);
    if (!c.ok) return { ok: false, reason: c.reason === "rude" ? "rude" : "invalid" };
    if (!enabled) { setLocalName(c.name); return { ok: false, offline: true, reason: "offline", name: c.name }; }
    const r = await rpc(fn, { p_token: token(), p_name: c.name });
    if (!r.ok && r.reason === "network") { setLocalName(c.name); return { ok: false, reason: "network", name: c.name }; }
    return applyNameResult(r, c.name);
  }

  const api = {
    enabled,
    get name() { return localName; },
    get id() { return ident.id; },
    // true when the server has confirmed the current name
    get claimed() { return !!ident.name && ident.name === localName; },
    // "taken": the name saved on this device belongs to someone else now (the dialog asks for a new one)
    get needsName() { return needsName; },
    // loads / creates the identity, claims a name saved while offline, retries queued submissions. Never rejects.
    ready() {
      if (!enabled) return Promise.resolve();
      if (readyP) return readyP;
      readyP = (async () => {
        try {
          token();
          if (localName && ident.name !== localName) {
            const r = await rpc(ident.name ? "rename_player" : "claim_name", { p_token: ident.token, p_name: localName });
            const a = applyNameResult(r, localName);
            if (!a.ok && a.reason === "taken") needsName = "taken";
          }
          await flush();
        } catch (e) { quiet("ready", e); }
        readyP = null;
      })();
      return readyP;
    },
    claimName(name) { return sendName(ident.name ? "rename_player" : "claim_name", name).catch(() => ({ ok: false, reason: "network" })); },
    rename(name) { return sendName(ident.name ? "rename_player" : "claim_name", name).catch(() => ({ ok: false, reason: "network" })); },
    // saves a name on this device only (offline mode)
    setLocalName(name) { const c = checkName(name); if (c.ok) setLocalName(c.name); return c; },
    async startRun(level, hard) {
      delete runs[level];
      if (!enabled) return OFF;
      try {
        const r = await rpc("start_run", { p_token: token(), p_level: level | 0, p_hard: !!hard });
        if (r.ok && r.run) { runs[level] = { id: String(r.run), hard: !!hard }; return { ok: true, runId: runs[level].id }; }
        return { ok: false, reason: r.reason || "invalid" };
      } catch (e) { return { ok: false, reason: "network" }; }
    },
    hasRun(level) { return !!runs[level]; },
    async submitTime(level, ms) {
      if (!enabled) return OFF;
      try {
        const run = runs[level];
        if (!run) return { ok: false, reason: "norun" };
        const r = await rpc("submit_time", { p_token: token(), p_run: run.id, p_ms: Math.round(ms) });
        if (r.ok) { delete runs[level]; return { ok: true, rank: r.rank | 0, best: r.best | 0 }; }
        if (r.reason === "network") { enqueue({ kind: "time", level, run: run.id, ms: Math.round(ms) }); delete runs[level]; return { ok: false, reason: "network", queued: true }; }
        if (r.reason !== "noname") delete runs[level];
        return { ok: false, reason: r.reason || "invalid" };
      } catch (e) { return { ok: false, reason: "network" }; }
    },
    async submitCoins(coins, hard) {
      if (!enabled) return OFF;
      try {
        const run = runs[4];
        if (!run) return { ok: false, reason: "norun" };
        const r = await rpc("submit_coins", { p_token: token(), p_run: run.id, p_coins: Math.max(0, Math.floor(coins)) });
        if (r.ok) { delete runs[4]; return { ok: true, rank: r.rank | 0, best: r.best | 0 }; }
        if (r.reason === "network") { enqueue({ kind: "coins", run: run.id, coins: Math.floor(coins), hard: !!hard }); delete runs[4]; return { ok: false, reason: "network", queued: true }; }
        if (r.reason !== "noname") delete runs[4];
        return { ok: false, reason: r.reason || "invalid" };
      } catch (e) { return { ok: false, reason: "network" }; }
    },
    async topTimes(level) {
      if (!enabled) return { ok: false, offline: true, reason: "offline", rows: [] };
      try {
        level |= 0;
        const [b, m] = await Promise.all([
          req("GET", "/rest/v1/top_times?select=rank,name,ms&level=eq." + level + "&order=rank.asc&limit=100"),
          ident.id || ident.name ? rpc("my_rank", { p_token: token(), p_level: level }) : Promise.resolve(null),
        ]);
        if (!b.ok || !Array.isArray(b.data)) return { ok: false, reason: b.reason || "network", rows: [] };
        const rows = b.data.map((r) => ({ rank: r.rank | 0, name: String(r.name || ""), ms: r.ms | 0 }));
        const out = { ok: true, rows };
        if (m && m.ok && m.rank) out.me = { rank: m.rank | 0, ms: m.ms | 0 };
        return out;
      } catch (e) { return { ok: false, reason: "network", rows: [] }; }
    },
    async topCoins() {
      if (!enabled) return { ok: false, offline: true, reason: "offline", rows: [] };
      try {
        const [b, m] = await Promise.all([
          req("GET", "/rest/v1/top_coins?select=rank,name,coins,hard&order=rank.asc&limit=100"),
          ident.id || ident.name ? rpc("my_rank", { p_token: token(), p_level: 4 }) : Promise.resolve(null),
        ]);
        if (!b.ok || !Array.isArray(b.data)) return { ok: false, reason: b.reason || "network", rows: [] };
        const rows = b.data.map((r) => ({ rank: r.rank | 0, name: String(r.name || ""), coins: r.coins | 0, hard: !!r.hard }));
        const out = { ok: true, rows };
        if (m && m.ok && m.rank) out.me = { rank: m.rank | 0, coins: m.coins | 0, hard: !!m.hard };
        return out;
      } catch (e) { return { ok: false, reason: "network", rows: [] }; }
    },
  };
  return api;
}
