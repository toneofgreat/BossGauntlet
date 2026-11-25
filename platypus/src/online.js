// online.js - names and leaderboards on the OofWorld relay (Cloudflare worker, /api/platypus/*). LEVELS3.md A4.
// Every promise resolves (never rejects, never throws); every failure is { ok: false, reason }. With an empty
// online-config.js nothing is ever fetched and every call resolves { ok: false, offline: true, reason: "offline" }.
// With a config the game stays OFFLINE until one probe (GET /api/platypus/top?level=1) answers. A 404 (a server
// without the platypus endpoints, e.g. not deployed yet) keeps it offline for the session, exactly as if the
// config were empty; any later 404 switches it off the same way.
//
// FALLBACK (online-config.js PLATY_FALLBACK): when the relay answers that 404 (the live worker is an old deploy and
// cannot be redeployed), the game loads ../../platyfy-online.js instead - real shared boards and unique names kept as
// private records on the same relay's published-games API (see that file). Same UI, same name rules, same results;
// the run's time is checked against the wall clock since startRun on this device instead of on a server.
// Without PLATY_FALLBACK (the tests' mocked config) a 404 still means exactly offline.
//
// Identity: a 32-byte random token (hex) in localStorage["platypus.online.v1"] = { token, id, name }. The server keeps
// only sha256(token). The token travels only inside POST bodies, never in a URL.
import * as CFG from "./online-config.js";
import { checkName, cleanName } from "./names.js";

const ID_KEY = "platypus.online.v1";
const NAME_KEY = "platypus.name.v1";
const QUEUE_KEY = "platypus.online.queue.v1";
const QUEUE_MAX = 20;
const TIMEOUT = 8000, RETRY_AFTER = 1500;
const PLATY_API = CFG.PLATY_API || "";
const FALLBACK = typeof CFG.PLATY_FALLBACK === "string" ? CFG.PLATY_FALLBACK : "";
const RUN_MAX_MS = 6 * 3600 * 1000, COINS_MAX = 1000000;
const fbBoard = (level) => (level === 4 ? "platypus-coins" : "platypus-l" + (level | 0));

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

// cfg (tests / tools only): { url }
export function createOnline(cfg) {
  const URL0 = ((cfg && cfg.url) || PLATY_API || "").replace(/\/+$/, "");
  const configured = !!(URL0 && typeof fetch === "function");
  // "unknown" until the probe answers; "yes" = the server has the endpoints; "no" = it answered 404;
  // "fb" = it answered 404 and the platyfy-online.js fallback answers instead
  let live = "unknown", probeP = null, fb = null;
  const fallback = cfg && "fallback" in cfg ? cfg.fallback || "" : FALLBACK;
  const isOn = () => configured && (live === "yes" || (live === "fb" && !!fb));
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
  // -> { ok: true, data } | { ok: false, reason: "offline" (404) | "network" | "http", status }
  async function req(method, path, body) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let ctl = null, timer = 0;
      try {
        ctl = typeof AbortController === "function" ? new AbortController() : null;
        if (ctl) timer = setTimeout(() => ctl.abort(), TIMEOUT);
        const r = await fetch(URL0 + path, {
          method,
          headers: body === undefined ? { Accept: "application/json" } : { "Content-Type": "application/json", Accept: "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: ctl ? ctl.signal : undefined,
          cache: "no-store",
        });
        clearTimeout(timer);
        if (r.status === 404) { live = "no"; quiet(method, path, "404: no platypus endpoints here; offline"); return { ok: false, reason: "offline", status: 404 }; }
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
  // POST /api/platypus/<fn> -> the server's { ok: true, ... } | { ok: false, reason }
  async function rpc(fn, args) {
    const r = await req("POST", "/api/platypus/" + fn, args);
    if (!r.ok) return { ok: false, reason: r.reason };
    const d = r.data;
    if (!d || typeof d !== "object") return { ok: false, reason: "network" };
    return d;
  }
  // one GET: does this server have the platypus endpoints? (never rejects)
  function probe() {
    if (!configured || live !== "unknown") return Promise.resolve();
    if (probeP) return probeP;
    probeP = (async () => {
      try {
        const r = await req("GET", "/api/platypus/top?level=1");
        if (r.ok && r.data && r.data.ok === true && Array.isArray(r.data.rows)) live = "yes";
        if (live === "no" && fallback) {
          const m = await import(new URL(fallback, import.meta.url).href);
          const p = await m.ping();
          if (p && p.ok) { fb = m; live = "fb"; quiet("relay has no platypus endpoints: using platyfy-online.js"); }
        }
      } catch (e) { quiet("probe", e); }
      probeP = null;
    })();
    return probeP;
  }

  // ---- the queue of submissions that could not reach the server ----
  function queue() { const q = lsGet(QUEUE_KEY); return Array.isArray(q) ? q : []; }
  function enqueue(item) { const q = queue(); q.push(item); while (q.length > QUEUE_MAX) q.shift(); lsSet(QUEUE_KEY, q); }
  async function flush() {
    if (live === "fb") { if (fb) await fb.flush(); return; }
    const q = queue();
    if (!q.length) return;
    lsSet(QUEUE_KEY, []);
    const keep = [];
    for (const it of q) {
      const r = it.kind === "coins"
        ? await rpc("coins", { token: token(), run: it.run, coins: it.coins })
        : await rpc("time", { token: token(), run: it.run, ms: it.ms });
      if (!r.ok && (r.reason === "network" || r.reason === "offline")) keep.push(it);
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
  // the fallback's claim, in the relay's answer shape
  async function fbName(name) {
    const r = await fb.claimName(name);
    if (r && r.ok) return { ok: true, id: fb.getId(), name: r.name };
    return { ok: false, reason: (r && r.reason) || "network" };
  }
  // one endpoint claims a first name and renames (the server knows which this token needs)
  async function sendName(raw) {
    const c = checkName(raw);
    if (!c.ok) return { ok: false, reason: c.reason === "rude" ? "rude" : "invalid" };
    if (!isOn()) { setLocalName(c.name); return { ok: false, offline: true, reason: "offline", name: c.name }; }
    const r = live === "fb" ? await fbName(c.name) : await rpc("name", { token: token(), name: c.name });
    if (!r.ok && r.reason === "offline") { setLocalName(c.name); return { ok: false, offline: true, reason: "offline", name: c.name }; }
    if (!r.ok && r.reason === "network") { setLocalName(c.name); return { ok: false, reason: "network", name: c.name }; }
    return applyNameResult(r, c.name);
  }

  // level 4 = the coins board. One POST: the top 100 and (when this device has a name) the caller's own row.
  async function board(level) {
    if (!isOn()) return { ok: false, offline: true, reason: "offline", rows: [] };
    if (live === "fb") {
      try {
        const coins = level === 4;
        const d = await fb.getTop(fbBoard(level), 50, { lowerIsBetter: !coins });
        if (!d.ok || !Array.isArray(d.rows)) return { ok: false, reason: d.reason || "network", rows: [] };
        const rows = d.rows.map((r) => (coins
          ? { rank: r.rank | 0, name: String(r.name || ""), coins: r.value | 0, hard: !!(r.extra && r.extra.h) }
          : { rank: r.rank | 0, name: String(r.name || ""), ms: r.value | 0 }));
        const out = { ok: true, rows };
        if (d.me && d.me.rank) out.me = coins ? { rank: d.me.rank | 0, coins: d.me.value | 0, hard: !!(d.me.extra && d.me.extra.h) } : { rank: d.me.rank | 0, ms: d.me.value | 0 };
        return out;
      } catch (e) { return { ok: false, reason: "network", rows: [] }; }
    }
    try {
      const d = await rpc("top", ident.id || ident.name ? { token: token(), level } : { level });
      if (!d.ok || !Array.isArray(d.rows)) return { ok: false, reason: d.reason || "network", rows: [] };
      const coins = level === 4;
      const rows = d.rows.map((r) => (coins
        ? { rank: r.rank | 0, name: String(r.name || ""), coins: r.coins | 0, hard: !!r.hard }
        : { rank: r.rank | 0, name: String(r.name || ""), ms: r.ms | 0 }));
      const out = { ok: true, rows };
      if (d.me && d.me.rank) out.me = coins ? { rank: d.me.rank | 0, coins: d.me.coins | 0, hard: !!d.me.hard } : { rank: d.me.rank | 0, ms: d.me.ms | 0 };
      return out;
    } catch (e) { return { ok: false, reason: "network", rows: [] }; }
  }

  // the fallback's submission: plausibility on this device (the clock ran no longer than the wall did), then the board
  async function fbSubmit(level, run, value, hard) {
    const coins = level === 4;
    const wall = Date.now() - run.t0 + 3000;
    if (coins ? value > COINS_MAX : (value < 1000 || value > RUN_MAX_MS || value > wall)) { delete runs[level]; return { ok: false, reason: "implausible" }; }
    if (!api.claimed) return { ok: false, reason: "noname" };
    const r = await fb.submitScore(fbBoard(level), value, coins
      ? { lowerIsBetter: false, name: localName, min: 0, max: COINS_MAX, extra: { h: hard ? 1 : 0 } }
      : { lowerIsBetter: true, name: localName, min: 1000, max: RUN_MAX_MS });
    if (r.ok) { delete runs[level]; return { ok: true, rank: r.rank | 0, best: r.best | 0 }; }
    if (r.reason === "taken") { needsName = "taken"; return { ok: false, reason: "noname" }; }
    delete runs[level];
    return { ok: false, reason: r.reason || "network", queued: !!r.queued };
  }

  const api = {
    // false until the server has answered the probe (and for good after a 404): the game is then exactly offline
    get enabled() { return isOn(); },
    get name() { return localName; },
    get id() { return ident.id; },
    // true when the server has confirmed the current name
    get claimed() { return !!ident.name && ident.name === localName; },
    // "taken": the name saved on this device belongs to someone else now (the dialog asks for a new one)
    get needsName() { return needsName; },
    // probes the server, then loads / creates the identity, claims a name saved while offline, retries queued
    // submissions. Never rejects.
    ready() {
      if (!configured) return Promise.resolve();
      if (readyP) return readyP;
      readyP = (async () => {
        try {
          await probe();
          if (isOn()) {
            token();
            if (localName && ident.name !== localName) {
              const r = live === "fb" ? await fbName(localName) : await rpc("name", { token: ident.token, name: localName });
              const a = applyNameResult(r, localName);
              if (!a.ok && a.reason === "taken") needsName = "taken";
            }
            if (isOn()) await flush();
          }
        } catch (e) { quiet("ready", e); }
        readyP = null;
      })();
      return readyP;
    },
    claimName(name) { return sendName(name).catch(() => ({ ok: false, reason: "network" })); },
    rename(name) { return sendName(name).catch(() => ({ ok: false, reason: "network" })); },
    // saves a name on this device only (offline mode)
    setLocalName(name) { const c = checkName(name); if (c.ok) setLocalName(c.name); return c; },
    async startRun(level, hard) {
      delete runs[level];
      if (!isOn()) return OFF;
      if (live === "fb") { runs[level] = { id: "fb" + Date.now(), hard: !!hard, t0: Date.now() }; return { ok: true, runId: runs[level].id }; }
      try {
        const r = await rpc("run", { token: token(), level: level | 0, hard: !!hard });
        if (r.ok && r.run) { runs[level] = { id: String(r.run), hard: !!hard }; return { ok: true, runId: runs[level].id }; }
        return { ok: false, reason: r.reason || "invalid" };
      } catch (e) { return { ok: false, reason: "network" }; }
    },
    hasRun(level) { return !!runs[level]; },
    async submitTime(level, ms) {
      if (!isOn()) return OFF;
      try {
        const run = runs[level];
        if (!run) return { ok: false, reason: "norun" };
        if (live === "fb") return await fbSubmit(level, run, Math.round(ms));
        const r = await rpc("time", { token: token(), run: run.id, ms: Math.round(ms) });
        if (r.ok) { delete runs[level]; return { ok: true, rank: r.rank | 0, best: r.best | 0 }; }
        if (r.reason === "network") { enqueue({ kind: "time", level, run: run.id, ms: Math.round(ms) }); delete runs[level]; return { ok: false, reason: "network", queued: true }; }
        if (r.reason !== "noname") delete runs[level];
        return { ok: false, reason: r.reason || "invalid" };
      } catch (e) { return { ok: false, reason: "network" }; }
    },
    async submitCoins(coins, hard) {
      if (!isOn()) return OFF;
      try {
        const run = runs[4];
        if (!run) return { ok: false, reason: "norun" };
        if (live === "fb") return await fbSubmit(4, run, Math.max(0, Math.floor(coins)), !!hard);
        const r = await rpc("coins", { token: token(), run: run.id, coins: Math.max(0, Math.floor(coins)) });
        if (r.ok) { delete runs[4]; return { ok: true, rank: r.rank | 0, best: r.best | 0 }; }
        if (r.reason === "network") { enqueue({ kind: "coins", run: run.id, coins: Math.floor(coins), hard: !!hard }); delete runs[4]; return { ok: false, reason: "network", queued: true }; }
        if (r.reason !== "noname") delete runs[4];
        return { ok: false, reason: r.reason || "invalid" };
      } catch (e) { return { ok: false, reason: "network" }; }
    },
    topTimes(level) { return board(level | 0); },
    topCoins() { return board(4); },
  };
  return api;
}
