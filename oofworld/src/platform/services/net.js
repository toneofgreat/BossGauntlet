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
// Remote players stay drawn for as long as they are CONNECTED. The relay is the authority
// on that: it sends `bye` when their socket closes or stops answering its ping (<= ~70 s),
// and a closed socket of OUR OWN clears everybody. STALE_S is only a last resort for a
// peer the relay never said goodbye to, and it is measured in WALL-CLOCK seconds of total
// silence, not sim time, so it neither fires while our own tab is backgrounded nor for
// somebody merely standing still: every live client sends a KEEPALIVE_S heartbeat (a
// repeat of its last `move`) even when idle and even from a hidden tab.
//
// Amended 2026-11-07. This was 15 s of SIM time with no heartbeat, which was the
// "players turn invisible" bug: §5.3 makes a still player send nothing, so anybody who
// stood still (or switched tabs: rAF stops, so update() stops) for 15 s was evicted from
// every other roster, and because a `move` from an unknown id was ignored they never came
// back until they left and re-joined.
const STALE_S = 120;
const KEEPALIVE_S = 8;
// A remote that stood still for a long time and then moves would otherwise be walked from
// its old sample to its new one over the whole idle gap; cap the span the lerp uses.
const INTERP_SPAN_MAX_S = 0.5;
const RETRY_MIN_S = 1;
const RETRY_MAX_S = 30;

const SEND_INTERVAL_S = 1 / SEND_HZ;

// §5.1 step 3 / ARCHITECTURE §9.2 (amended 2026-09-03): the published build is served
// from platyfy.com, and there — and only there — an unconfigured page uses the official
// relay. A dev checkout, a LAN copy and every test run on some other host and get no
// default, so they open no socket unless asked to.
export const OFFICIAL_RELAY = "wss://relay.platyfy.com";
export function isOfficialHost(hostname) {
  const h = (hostname || "").toLowerCase();
  return h === "platyfy.com" || h.endsWith(".platyfy.com");
}

// §5.1: only a real websocket URL, and never ws:// from an https: page — that fails as
// mixed content with a console message the player will never see, so refuse it here
// where we can say why.
export function resolveRelayUrl(search, saved, protocol, hostname) {
  let url = null;
  try {
    const q = new URLSearchParams(search || "");
    url = q.get("relay") || null;
  } catch { url = null; }
  if (!url) url = saved || null;
  if (!url && isOfficialHost(hostname)) url = OFFICIAL_RELAY;
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
    getHostname: () => (typeof location === "undefined" ? "" : location.hostname),
    getName: () => null,
    getAvatar: () => null,
    getToken: () => null, // spec 14: a session token makes the room know who you are
    onStatus: () => {},
    now: () => Date.now(), // wall clock, for STALE_S / KEEPALIVE_S (injectable for tests)
    getDocument: () => (typeof document === "undefined" ? null : document),
    WebSocketImpl: typeof WebSocket === "undefined" ? null : WebSocket,
    ...deps,
  };

  const listeners = new Map();
  const peers = new Map(); // id -> remote player record (§3.1)
  // Peers dropped by the STALE_S last resort, kept so that the moment they say anything
  // again they come straight back with their real name and avatar. The relay still thinks
  // they are here (it sent no `bye`), so restoring them invents nobody (ARCHITECTURE §9).
  const dormant = new Map();
  // Place-owned INTENTIONAL hiding (a dead/spectating player, an invisibility ability, a
  // pig disguised as a prop). Purely local and per-Place: cleared on every join/leave.
  const hiddenPeers = new Set();

  let ws = null;
  let url = null;
  let place = null;
  let selfId = null;
  let name = d.getName() || null;
  let publishedState = null;
  let publishedJson = "null";
  let lastSent = { pos: null, yaw: 0, anim: "idle" };
  let lastSentMs = 0;
  let latest = null; // the last { pos, yaw, anim } the shell handed update(), for keepalives
  let keepaliveTimer = null;
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

  function sendMove(pos, yaw, anim) {
    lastSent = { pos: [pos[0], pos[1], pos[2]], yaw, anim };
    lastSentMs = d.now();
    send({ t: "move", pos: lastSent.pos, yaw, anim });
  }

  // The heartbeat. Runs off a timer AND off the relay's own ping, because a background tab
  // gets no rAF (so no update()) and its timers are throttled, but socket messages are
  // still delivered to it, so answering a ping is the one thing a hidden tab always does.
  // `force` sends even if a heartbeat went out recently (the tab just hid: publish where we
  // actually stopped, which the 12 Hz throttle may not have sent yet).
  function keepalive(force) {
    if (!ws || ws.readyState !== 1 || !selfId || !latest) return;
    const changed = !lastSent.pos
      || latest.pos[0] !== lastSent.pos[0] || latest.pos[1] !== lastSent.pos[1]
      || latest.pos[2] !== lastSent.pos[2] || latest.yaw !== lastSent.yaw
      || latest.anim !== lastSent.anim;
    if (!force && !changed && d.now() - lastSentMs < KEEPALIVE_S * 1000) return;
    sendMove(latest.pos, latest.yaw, latest.anim);
  }

  function startKeepalive() {
    if (keepaliveTimer || typeof setInterval !== "function") return;
    keepaliveTimer = setInterval(() => keepalive(false), (KEEPALIVE_S / 2) * 1000);
    if (keepaliveTimer && typeof keepaliveTimer.unref === "function") keepaliveTimer.unref();
  }
  function stopKeepalive() {
    if (keepaliveTimer) { clearInterval(keepaliveTimer); keepaliveTimer = null; }
  }

  // Hiding: say exactly where we stopped. Showing again: same, so nobody waits a step.
  const doc = d.getDocument();
  const onVisibility = () => keepalive(true);
  if (doc && typeof doc.addEventListener === "function") doc.addEventListener("visibilitychange", onVisibility);

  function connect() {
    if (disposed || !place) return;
    const resolved = resolveRelayUrl(d.getSearch(), d.getSavedUrl(), d.getProtocol(), d.getHostname());
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
      // The token is optional (spec 14 §5.3 — guests play). When there is one the
      // server takes the display name off the ACCOUNT rather than this message, so a
      // name in chat cannot be somebody else's.
      send({ t: "join", place, name, avatar: d.getAvatar(), state: publishedState, token: d.getToken() });
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
      stopKeepalive();
      // Everyone we knew about is only known through this socket. Dropping them is the
      // honest thing: they may still be playing, but we no longer have any idea. This is
      // the "unless you are offline" case: the only time a live player vanishes.
      const had = peers.size;
      peers.clear();
      dormant.clear();
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
        dormant.clear();
        for (const r of m.peers || []) addPeer(r);
        // A fresh room (new Place, or a reconnect) knows nothing about where we are: the
        // relay's record starts with pos null, and a peer with no position is not drawn.
        // Forget what we sent on the OLD socket/room so the next update() (or the
        // keepalive, if our tab is hidden right now) publishes our position at once,
        // instead of leaving a player who is standing still invisible to the whole room.
        lastSent = { pos: null, yaw: 0, anim: "idle" };
        lastSentMs = 0;
        startKeepalive();
        keepalive(true);
        setStatus("online");
        // `build` rides along: spec 18 puts the room's existing parts in the welcome so
        // somebody arriving late sees the same world as everybody already there.
        emit("welcome", { id: selfId, room: m.room, count: peers.size + 1, build: m.build || [] });
        return;
      }
      case "peer":
        if (m.record && m.record.id !== selfId) { dormant.delete(m.record.id); addPeer(m.record); }
        return;
      case "move": {
        const p = peers.get(m.id) || revive(m.id);
        if (!p) return;
        p.heardMs = d.now();
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
        const p = peers.get(m.id) || revive(m.id);
        if (p) { p.state = m.state; p.at = simTime; p.heardMs = d.now(); }
        return;
      }
      case "bye": {
        // The relay saying they left (socket closed / stopped answering its ping): the one
        // authoritative way a connected player stops being drawn.
        dormant.delete(m.id);
        hiddenPeers.delete(m.id);
        if (peers.delete(m.id)) emit("bye", { id: m.id });
        return;
      }
      case "build":
        // Straight through to services/build.js, which owns what the parts look like.
        emit("build", m);
        return;
      case "buildFull":
        emit("buildFull", { cap: m.cap });
        return;
      case "invite":
        // Straight out to whoever is listening. The server has already checked that this
        // came from a friend and rate limited it (spec 15 §5.4); net.js does not second
        // guess that, it just delivers.
        emit("invite", { from: m.from, name: m.name, place: m.place });
        return;
      case "inviteSent":
        emit("inviteSent", { to: m.to, delivered: m.delivered });
        return;
      case "chat":
        // Straight through to whoever is listening; net.js keeps NO history, because
        // the server keeps none either (spec 14 §2).
        emit("chat", { id: m.id, name: m.name, text: m.text });
        return;
      case "full":
        setStatus("full", `this Place is full (${m.cap} players)`);
        return;
      case "ping":
        send({ t: "pong" });
        // Not throttled in a background tab (a socket event, not a timer), so this is the
        // heartbeat of last resort for a hidden tab.
        keepalive(false);
        return;
      default:
        // Unknown message types are ignored, not errors: a newer relay may say more
        // than this client understands, and presence should degrade, not break.
    }
  }

  function addPeer(r) {
    const rec = {
      id: r.id,
      // The ACCOUNT id, distinct from the connection id: friendships are between
      // accounts (spec 15 §2), so a player list that dropped this could show somebody
      // and then have no way to send them a request.
      accountId: r.accountId || null,
      name: r.name || "",
      avatar: r.avatar || null,
      place: r.place || place,
      pos: Array.isArray(r.pos) ? r.pos : null,
      yaw: Number.isFinite(r.yaw) ? r.yaw : 0,
      anim: r.anim || "idle",
      state: r.state === undefined ? null : r.state,
      at: simTime,
      heardMs: d.now(),
      prev: null,
    };
    peers.set(rec.id, rec);
    emit("peer", rec);
  }

  function revive(id) {
    const rec = dormant.get(id);
    if (!rec) return null;
    dormant.delete(id);
    rec.heardMs = d.now();
    peers.set(id, rec);
    emit("peer", rec);
    return rec;
  }

  // Called by the shell every sim step. Owns the send throttle and stale eviction; the
  // renderer reads `roster()` and interpolates with `interpolated()`.
  function update(dt, pos, yaw, anim) {
    simTime += dt;
    if (Array.isArray(pos)) latest = { pos: [pos[0], pos[1], pos[2]], yaw, anim };
    if (!ws || ws.readyState !== 1 || !selfId) return;

    // Last resort only (see STALE_S): total wall-clock silence from a peer the relay never
    // said `bye` for. Live peers heartbeat every KEEPALIVE_S, so this never fires for
    // somebody who is merely idle or tabbed out.
    const nowMs = d.now();
    for (const [id, p] of peers) {
      if (nowMs - p.heardMs > STALE_S * 1000) {
        peers.delete(id);
        dormant.set(id, p);
        emit("bye", { id });
      }
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
    if (!moved) {
      // §5.3: standing still costs nothing, except one heartbeat every KEEPALIVE_S so the
      // room knows we are still here.
      if (nowMs - lastSentMs >= KEEPALIVE_S * 1000) sendMove(pos, yaw, anim);
      return;
    }
    sendMove(pos, yaw, anim);
  }

  // Where to draw a remote player right now: INTERP_S behind their last sample, walked
  // from the one before it.
  function interpolated(p) {
    if (!p.pos) return null;
    if (!p.prev || !p.prev.pos) return { pos: p.pos, yaw: p.yaw };
    const span = p.at - p.prev.at;
    if (!(span > 0)) return { pos: p.pos, yaw: p.yaw };
    const t = Math.max(0, Math.min(1, (simTime - p.at) / Math.max(INTERP_S, Math.min(span, INTERP_SPAN_MAX_S))));
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
      hiddenPeers.clear();
      latest = null; // the last Place's position must not be heartbeated into this room
      // Nor its published state: connect() hands publishedState to the relay inside the
      // join, and the relay caches it as ours for this room. The shell joins BEFORE the
      // new Place's init, so this never discards anything the new Place published; a
      // same-Place re-join (sign-in) just re-sends on the Place's next publish.
      publishedState = null;
      publishedJson = "null";
      connect();
    },
    leave() {
      place = null;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const sock = ws;
      ws = null;
      selfId = null;
      stopKeepalive();
      peers.clear();
      dormant.clear();
      hiddenPeers.clear();
      if (sock) { try { sock.close(); } catch { /* already closing */ } }
      setStatus("offline");
    },
    dispose() {
      disposed = true;
      this.leave();
      if (doc && typeof doc.removeEventListener === "function") doc.removeEventListener("visibilitychange", onVisibility);
      listeners.clear();
    },
    update,
    interpolated,

    // --- the §4.1 facade a Place sees ---
    online: () => status === "online",
    configured: () => !!resolveRelayUrl(d.getSearch(), d.getSavedUrl(), d.getProtocol(), d.getHostname()).url,
    status: () => status,
    self: () => ({ id: selfId, name }),
    roster: () => [...peers.values()],
    // Place-level INTENTIONAL hiding of a remote player's rig in YOUR view (a dead or
    // spectating fighter, an invisibility ability, a pig disguised as a prop). The peer
    // stays in roster()/count() because they are still a real, connected player; only
    // their avatar and name tag are not drawn. Cleared on every Place change and when that
    // peer leaves, so a Place can never leave somebody invisible anywhere else.
    setPeerHidden(id, hidden) {
      if (typeof id !== "string" || !id) return;
      if (hidden) hiddenPeers.add(id); else hiddenPeers.delete(id);
    },
    isPeerHidden: (id) => hiddenPeers.has(id),
    clearPeerHidden() { hiddenPeers.clear(); },
    // Wall-clock seconds since anything was last heard from this peer (Infinity if not in
    // the roster), for Places that keep their own staleness rule (showdown §5.3).
    silentFor(id) {
      const p = peers.get(id);
      return p ? Math.max(0, (d.now() - p.heardMs) / 1000) : Infinity;
    },
    count: () => peers.size + 1, // §9: the TRUE number, including you, 1 when alone
    // Outbound for message types the Place or the UI owns rather than net.js — chat
    // today. Silently does nothing offline, like everything else here.
    send(obj) { return send(obj); },
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
