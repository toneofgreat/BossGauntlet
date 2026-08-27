// src/platform/services/net.js — the multiplayer relay client. Spec 13 §4.1/§5 owns it.
//
// The ONLY module in the codebase that opens a socket (ARCHITECTURE.md §2). Everything
// it does is presence: who else is in this Place, where are they, what public blob have
// they published. It cannot grant anything, and nothing it receives is allowed to reach
// economy, saves or badges — a remote player is drawn and listed, never trusted.
//
// The single most important property, and the reason almost every method below starts
// with a guard: THIS SERVICE IS INERT WITH NO RELAY CONFIGURED, which is the default for
// a fresh install and for the published build. `online()` is false, `roster()` is empty,
// `count()` is 1, `publish()` does nothing, and no socket is ever opened. A Place must
// never branch on multiplayer existing — it draws whatever roster() returns, and offline
// that is nobody.

import { randomUsername } from "./names.js";

// §6 tuning.
const SEND_HZ = 12;
const MOVE_EPS = 0.05;
const YAW_EPS = 0.01;
const INTERP_S = 0.12;
const STALE_S = 15;
const RETRY_MIN_S = 1;
const RETRY_MAX_S = 30;

const SEND_INTERVAL_S = 1 / SEND_HZ;

// §5.1: only a real websocket URL, and never ws:// from an https: page — that fails as
// mixed content with a console message the player will never see, so refuse it here
// where we can say why.
export function resolveRelayUrl(search, saved, protocol) {
  let url = null;
  try {
    const q = new URLSearchParams(search || "");
    url = q.get("relay") || null;
  } catch { url = null; }
  if (!url) url = saved || null;
  if (!url) return { url: null, reason: "no relay configured" };
  if (!/^wss?:\/\//i.test(url)) return { url: null, reason: `not a ws:// or wss:// URL: ${url}` };
  if (protocol === "https:" && /^ws:\/\//i.test(url)) {
    return { url: null, reason: "an https: page cannot open a ws:// relay — use wss://" };
  }
  return { url, reason: null };
}

// deps: { getSearch, getProtocol, getSavedUrl, getName, getAvatar, onStatus, WebSocketImpl }
export function createNet(deps = {}) {
  const d = {
    getSearch: () => (typeof location === "undefined" ? "" : location.search),
    getProtocol: () => (typeof location === "undefined" ? "http:" : location.protocol),
    getSavedUrl: () => null,
    getName: () => null,
    getAvatar: () => null,
    onStatus: () => {},
    WebSocketImpl: typeof WebSocket === "undefined" ? null : WebSocket,
    ...deps,
  };

  const listeners = new Map();
  const peers = new Map(); // id -> remote player record (§3.1)

  let ws = null;
  let url = null;
  let place = null;
  let selfId = null;
  let name = d.getName() || null;
  let publishedState = null;
  let publishedJson = "null";
  let lastSent = { pos: null, yaw: 0, anim: "idle" };
  let sendAccum = 0;
  let simTime = 0;
  let retryS = RETRY_MIN_S;
  let retryTimer = null;
  let disposed = false;
  let status = "offline";

  function emit(evt, payload) {
    const fns = listeners.get(evt);
    if (!fns) return;
    for (const fn of [...fns]) {
      try { fn(payload); } catch (err) { console.error("[net] listener threw", err); }
    }
  }

  function setStatus(next, detail) {
    if (status === next) return;
    status = next;
    emit("status", { status: next, detail: detail || null });
    d.onStatus(next, detail || null);
  }

  function send(obj) {
    if (!ws || ws.readyState !== 1) return false;
    try { ws.send(JSON.stringify(obj)); return true; } catch { return false; }
  }

  function connect() {
    if (disposed || !place) return;
    const resolved = resolveRelayUrl(d.getSearch(), d.getSavedUrl(), d.getProtocol());
    url = resolved.url;
    if (!url) { setStatus("offline", resolved.reason); return; }
    if (!d.WebSocketImpl) { setStatus("offline", "no WebSocket in this environment"); return; }
    setStatus("connecting");
    let sock;
    try { sock = new d.WebSocketImpl(url); } catch (err) {
      setStatus("error", err && err.message);
      scheduleRetry();
      return;
    }
    ws = sock;

    sock.addEventListener("open", () => {
      if (ws !== sock) return;
      retryS = RETRY_MIN_S;
      if (!name) name = randomUsername(new Set());
      send({ t: "join", place, name, avatar: d.getAvatar(), state: publishedState });
    });

    sock.addEventListener("message", (e) => {
      if (ws !== sock) return;
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      handle(m);
    });

    sock.addEventListener("close", () => {
      if (ws !== sock) return;
      ws = null;
      selfId = null;
      // Everyone we knew about is only known through this socket. Dropping them is the
      // honest thing: they may still be playing, but we no longer have any idea.
      const had = peers.size;
      peers.clear();
      if (had) emit("bye", { id: null, all: true });
      setStatus("offline", "disconnected");
      scheduleRetry();
    });

    sock.addEventListener("error", () => {
      // 'close' always follows; retrying here as well would double the backoff.
      if (ws === sock) setStatus("error");
    });
  }

  function scheduleRetry() {
    if (disposed || !place || retryTimer) return;
    const delay = retryS;
    retryS = Math.min(RETRY_MAX_S, retryS * 2);
    retryTimer = setTimeout(() => { retryTimer = null; connect(); }, delay * 1000);
  }

  function handle(m) {
    switch (m.t) {
      case "welcome": {
        selfId = m.id;
        peers.clear();
        for (const r of m.peers || []) addPeer(r);
        setStatus("online");
        emit("welcome", { id: selfId, room: m.room, count: peers.size + 1 });
        return;
      }
      case "peer":
        if (m.record && m.record.id !== selfId) addPeer(m.record);
        return;
      case "move": {
        const p = peers.get(m.id);
        if (!p) return;
        // Keep the previous sample: §5.4 interpolates between it and this one rather
        // than extrapolating, so a dropped packet makes a remote avatar late instead of
        // sending it through a wall.
        p.prev = { pos: p.pos, yaw: p.yaw, at: p.at };
        p.pos = m.pos;
        p.yaw = m.yaw;
        p.anim = m.anim;
        p.at = simTime;
        return;
      }
      case "state": {
        const p = peers.get(m.id);
        if (p) { p.state = m.state; p.at = simTime; }
        return;
      }
      case "bye": {
        if (peers.delete(m.id)) emit("bye", { id: m.id });
        return;
      }
      case "full":
        setStatus("full", `this Place is full (${m.cap} players)`);
        return;
      case "ping":
        send({ t: "pong" });
        return;
      default:
        // Unknown message types are ignored, not errors: a newer relay may say more
        // than this client understands, and presence should degrade, not break.
    }
  }

  function addPeer(r) {
    const rec = {
      id: r.id,
      name: r.name || "",
      avatar: r.avatar || null,
      place: r.place || place,
      pos: Array.isArray(r.pos) ? r.pos : null,
      yaw: Number.isFinite(r.yaw) ? r.yaw : 0,
      anim: r.anim || "idle",
      state: r.state === undefined ? null : r.state,
      at: simTime,
      prev: null,
    };
    peers.set(rec.id, rec);
    emit("peer", rec);
  }

  // Called by the shell every sim step. Owns the send throttle and stale eviction; the
  // renderer reads `roster()` and interpolates with `interpolated()`.
  function update(dt, pos, yaw, anim) {
    simTime += dt;
    if (!ws || ws.readyState !== 1 || !selfId) return;

    for (const [id, p] of peers) {
      if (simTime - p.at > STALE_S) { peers.delete(id); emit("bye", { id }); }
    }

    sendAccum += dt;
    if (sendAccum < SEND_INTERVAL_S) return;
    sendAccum = 0;
    if (!Array.isArray(pos)) return;
    const moved = !lastSent.pos
      || Math.abs(pos[0] - lastSent.pos[0]) > MOVE_EPS
      || Math.abs(pos[1] - lastSent.pos[1]) > MOVE_EPS
      || Math.abs(pos[2] - lastSent.pos[2]) > MOVE_EPS
      || Math.abs(yaw - lastSent.yaw) > YAW_EPS
      || anim !== lastSent.anim;
    if (!moved) return; // §5.3: standing still costs nothing
    lastSent = { pos: [pos[0], pos[1], pos[2]], yaw, anim };
    send({ t: "move", pos: lastSent.pos, yaw, anim });
  }

  // Where to draw a remote player right now: INTERP_S behind their last sample, walked
  // from the one before it.
  function interpolated(p) {
    if (!p.pos) return null;
    if (!p.prev || !p.prev.pos) return { pos: p.pos, yaw: p.yaw };
    const span = p.at - p.prev.at;
    if (!(span > 0)) return { pos: p.pos, yaw: p.yaw };
    const t = Math.max(0, Math.min(1, (simTime - p.at) / Math.max(INTERP_S, span)));
    const a = p.prev.pos;
    const b = p.pos;
    // Shortest-arc yaw so a remote turning past pi does not spin the long way round.
    let dy = p.yaw - p.prev.yaw;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    return {
      pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
      yaw: p.prev.yaw + dy * t,
    };
  }

  return {
    // --- lifecycle, called by the shell ---
    join(slug) {
      place = slug;
      retryS = RETRY_MIN_S;
      connect();
    },
    leave() {
      place = null;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const sock = ws;
      ws = null;
      selfId = null;
      peers.clear();
      if (sock) { try { sock.close(); } catch { /* already closing */ } }
      setStatus("offline");
    },
    dispose() {
      disposed = true;
      this.leave();
      listeners.clear();
    },
    update,
    interpolated,

    // --- the §4.1 facade a Place sees ---
    online: () => status === "online",
    configured: () => !!resolveRelayUrl(d.getSearch(), d.getSavedUrl(), d.getProtocol()).url,
    status: () => status,
    self: () => ({ id: selfId, name }),
    roster: () => [...peers.values()],
    count: () => peers.size + 1, // §9: the TRUE number, including you, 1 when alone
    publish(stateObj) {
      const json = JSON.stringify(stateObj === undefined ? null : stateObj);
      if (json === publishedJson) return; // §5.3: only on change
      publishedJson = json;
      publishedState = stateObj === undefined ? null : stateObj;
      send({ t: "state", state: publishedState });
    },
    setName(next) {
      name = typeof next === "string" && next.trim() ? next.trim().slice(0, 24) : name;
      send({ t: "name", name });
    },
    on(evt, fn) {
      if (!listeners.has(evt)) listeners.set(evt, []);
      listeners.get(evt).push(fn);
      return () => {
        const arr = listeners.get(evt);
        if (!arr) return;
        const i = arr.indexOf(fn);
        if (i > -1) arr.splice(i, 1);
      };
    },
  };
}
