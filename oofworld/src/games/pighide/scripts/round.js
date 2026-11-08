// src/games/pighide/scripts/round.js - PIG HIDE's round state machine and its peer protocol.
// Spec 27 §4 (identity, freshness, phases, starting, the roster, edges, the wire, hits,
// scoring, spectating, peer hiding, solo honesty), adapted from showdown's self-sovereign
// model (spec 25 §4-§5).
//
// What this module owns, and nothing else does:
// - the round fields of S (§2.0 "identity / platform", "peers", "round", and S.blind);
// - the ONE net.publish call site (§4.6) and every net.setPeerHidden / clearPeerHidden call
//   (§4.10);
// - the four teleport edges of §4.5 plus the spectate moves of §4.9;
// - accepting incoming hits (§4.7) and scoring the round for THIS client (§4.8).
//
// What it deliberately does not do: build parts, draw looks, run abilities or weapons, or
// touch the DOM. Those modules hear about every edge through `hooks`, which fire
// synchronously inside the edge that caused them.
//
// Nothing here invents a player (ARCHITECTURE §9, spec 27 §13). Offline or alone the phase
// stays "lobby" forever and START stays disabled with an honest hint. The clone is a prop:
// it is only ever seen as the owner's `cn` field and a hit on it carries the OWNER's id.
//
// House rules: sim time only (ctx.time and dt), no banned timer identifiers, every number
// read from TUNE or city.js.

import * as C from "./config.js";
import * as city from "./city.js";

const { TUNE, STATE_V } = C;

const PH_LOBBY = "lobby";
const PH_HIDE = "hide";
const PH_SEEK = "seek";
const PH_RESULT = "result";
const PHASE_ORDER = { lobby: 0, hide: 1, seek: 2, result: 3 };

// A conductor publishes `t` rounded to a whole second, so half a second of disagreement IS
// the rounding and is never slewed away (the showdown lesson: chasing it stretches phases).
const CLOCK_DEADBAND_S = 0.5;

function isPhase(p) {
  return p === PH_LOBBY || p === PH_HIDE || p === PH_SEEK || p === PH_RESULT;
}

function inRound(p) {
  return p === PH_HIDE || p === PH_SEEK || p === PH_RESULT;
}

function idOrNull(v) {
  return typeof v === "string" && v.length > 0 && v.length <= TUNE.WIRE_MAX_ID ? v : null;
}

function intIn(v, lo, hi) {
  const n = Number(v);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function bit(v) {
  return v === 1 || v === true ? 1 : 0;
}

function roundTo(v, step) {
  return Math.round(v / step) * step;
}

function fix(v, step) {
  // Rounded and trimmed so the JSON stays short ("12.3", not "12.300000000000001").
  return Number(roundTo(v, step).toFixed(step < 0.1 ? 2 : 1));
}

// The place's footprint, padded, for every coordinate a peer sends (§4.6 sanitizing).
function placeBox() {
  const pb = city.PLACE_BOUNDS || city.BOUNDS || null;
  const b = city.BOUNDS || null;
  const pad = TUNE.WIRE_BOUNDS_PAD;
  if (!pb) return null;
  return {
    minX: pb.minX - pad, maxX: pb.maxX + pad,
    minZ: pb.minZ - pad, maxZ: pb.maxZ + pad,
    minY: (b && Number.isFinite(b.minY) ? b.minY : -pad) - pad,
    maxY: (b && Number.isFinite(b.maxY) ? b.maxY : pad) + pad,
  };
}
const BOX = placeBox();

function vec3(v) {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const x = Number(v[0]), y = Number(v[1]), z = Number(v[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  if (BOX && (x < BOX.minX || x > BOX.maxX || z < BOX.minZ || z > BOX.maxZ
    || y < BOX.minY || y > BOX.maxY)) return null;
  return [x, y, z];
}

function dir3(v) {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = [];
  for (const c of v) {
    const n = Number(c);
    if (!Number.isFinite(n)) return null;
    out.push(Math.max(-1, Math.min(1, n)));
  }
  return out;
}

function seqOf(v) {
  return intIn(v, 0, TUNE.WIRE_MAX_SEQ);
}

// §4.6: total. Whatever a peer sends, the result is a plain object or null; nothing throws.
export function sanitize(raw) {
  if (!raw || typeof raw !== "object" || raw.v !== STATE_V) return null;
  try {
    const ph = isPhase(raw.ph) ? raw.ph : PH_LOBBY;
    const out = {
      v: STATE_V,
      k: intIn(raw.k, 0, TUNE.HEARTBEAT_MOD),
      ph,
      t: intIn(raw.t, 0, TUNE.ROUND_S),
      rn: intIn(raw.rn, 0, TUNE.WIRE_MAX_SEQ),
      ro: null,
      rs: raw.rs === "time" || raw.rs === "hunter" || raw.rs === "none" ? raw.rs : null,
      st: bit(raw.st),
      hc: intIn(raw.hc, 0, TUNE.WIRE_MAX_SEQ),
      rl: raw.rl === "pig" || raw.rl === "hunter" ? raw.rl : null,
      cl: typeof raw.cl === "string" && raw.cl.length <= 32 ? raw.cl : null,
      sk: typeof raw.sk === "string" && raw.sk.length <= 32 ? raw.sk : null,
      hp: intIn(raw.hp, 0, TUNE.WIRE_MAX_HP),
      hm: intIn(raw.hm, 0, TUNE.WIRE_MAX_HP),
      cg: bit(raw.cg),
      cb: idOrNull(raw.cb),
      sp: bit(raw.sp),
      iv: bit(raw.iv),
      bl: bit(raw.bl),
      pl: intIn(raw.pl, 0, 3),
      th: seqOf(raw.th),
      fl: seqOf(raw.fl),
      cn: null,
      bm: null,
      rk: null,
      ex: null,
      hits: null,
      pw: intIn(raw.pw, 0, TUNE.WIN_MAX),
      hw: intIn(raw.hw, 0, TUNE.WIN_MAX),
    };
    if (raw.ro && typeof raw.ro === "object") {
      const hu = idOrNull(raw.ro.hu);
      const ps = Array.isArray(raw.ro.ps)
        ? raw.ro.ps.slice(0, TUNE.MAX_PIGS).map(idOrNull).filter((x) => x && x !== hu) : [];
      if (hu) out.ro = { hu, ps };
    }
    if (raw.cn && typeof raw.cn === "object") {
      const p = vec3(raw.cn.p);
      const y = Number(raw.cn.y);
      if (p) out.cn = { p, y: Number.isFinite(y) ? y : 0, a: bit(raw.cn.a) };
    }
    if (Array.isArray(raw.bm)) {
      const bm = [];
      for (const b of raw.bm.slice(0, TUNE.WIRE_MAX_BOMBS)) {
        if (!b || typeof b !== "object") continue;
        const p = vec3(b.p);
        if (!p) continue;
        bm.push({ i: seqOf(b.i), p, f: intIn(b.f, 0, TUNE.BOMB_FUSE_S) });
      }
      out.bm = bm.length ? bm : null;
    }
    if (raw.rk && typeof raw.rk === "object") {
      const p = vec3(raw.rk.p);
      const d = dir3(raw.rk.d);
      if (p && d) out.rk = { s: seqOf(raw.rk.s), p, d };
    }
    if (raw.ex && typeof raw.ex === "object") {
      const p = vec3(raw.ex.p);
      const r = Number(raw.ex.r);
      if (p && Number.isFinite(r)) out.ex = { s: seqOf(raw.ex.s), p, r: Math.max(0, Math.min(TUNE.BOMB_RADIUS, r)) };
    }
    if (Array.isArray(raw.hits)) {
      const hits = [];
      for (const h of raw.hits.slice(0, TUNE.WIRE_MAX_HITS)) {
        if (!h || typeof h !== "object") continue;
        const to = idOrNull(h.to);
        const s = seqOf(h.s);
        if (!to || s < 1) continue;
        hits.push({
          s, to,
          d: intIn(h.d, 0, TUNE.WIRE_MAX_HP),
          w: typeof h.w === "string" && h.w.length <= 16 ? h.w : "",
          c: bit(h.c),
        });
      }
      out.hits = hits.length ? hits : null;
    }
    return out;
  } catch {
    return null;
  }
}

// =====================================================================================
// createRound(ctx, S, hooks) -> Round   (spec 27 §2.3)
// =====================================================================================

export function createRound(ctx, S, hooks) {
  const H = hooks || {};
  const net = ctx.services.net;
  const player = ctx.player;
  const ui = ctx.services.ui;

  function call(name, ...args) {
    const fn = H[name];
    if (typeof fn !== "function") return;
    try {
      fn(...args);
    } catch (err) {
      console.error("[oof] pighide round hook error", name, err);
    }
  }

  function netFn(name) {
    return net && typeof net[name] === "function" ? net[name].bind(net) : null;
  }

  // ---- private state (all in this closure; a second create starts clean) ---------------
  const R = {
    booted: false,
    disposed: false,
    adopted: false,
    driftFor: 0,
    wasInRound: false,      // took part (pig or hunter) in the current rn: gets the lobby return
    forfeited: false,       // our relay id changed mid-round; we sit out the rest of it
    hc: 0,                  // rounds as hunter this session (published, §4.4)
    hcSeen: new Map(),      // id -> rounds we SAW them hunt (room-side count, §4.4)
    hcRn: -1,               // the rn whose hunter hcSeen last counted
    hiddenAt: -1,           // wall-clock seconds the page was hidden at (stall forfeit, §4.8)
    awayFor: 0,             // how long the page was last hidden, consumed by stallCheck
    settleAt: -1,           // when the seek clock first hit 0 this rn (settle window, §4.8)
    stAt: -1e9,             // when we armed st:1
    lastChange: new Map(),  // id -> ctx.time the peer's state last changed
    lastRef: new Map(),     // id -> the last state object reference we saw
    lastJson: new Map(),    // id -> its JSON
    lastSan: new Map(),     // id -> sanitized blob
    lastFreshAt: new Map(), // id -> last ctx.time the peer was fresh
    seqBase: new Map(),     // id -> { th, fl, rk, ex } seq high-waters for fired events
    hitHw: new Map(),       // attacker id -> highest accepted hit seq (reset at every hide edge)
    hiddenSet: new Map(),   // id -> what we last passed to setPeerHidden
    caughtSet: new Set(),   // pig ids seen cg:1 for this rn (sticky)
    allCaughtSeen: false,   // hunter latch: this client saw every pig caught this rn (§4.8)
    sweepCaught: 0,
    scoredRn: -1,           // scoring latch, once per rn
    hitSeq: 0,              // our outgoing hit seq (monotonic for the session)
    wireHits: null,         // hits riding the blob right now (one-shot window)
    wireHitsAt: -1e9,
    ownTh: S.pig ? S.pig.th : 0,
    lastPub: null,          // the last blob we passed to net.publish
    lastPubKey: "",
    lastPubAt: -1e9,
    forceNext: true,
    skipTarget: null,
    spectateBase: null,
  };

  // ---- identity (§4.1) ------------------------------------------------------------------
  function readSelf() {
    try {
      const self = net && typeof net.self === "function" ? net.self() : null;
      const id = self && idOrNull(self.id);
      const name = self && typeof self.name === "string" && self.name ? self.name : "You";
      return { id, name };
    } catch {
      return { id: null, name: "You" };
    }
  }

  function refreshIdentity() {
    const me = readSelf();
    const next = me.id || "local";
    S.selfName = me.name;
    try { S.online = !!(net && typeof net.online === "function" && net.online()); } catch { S.online = false; }
    if (next === S.selfId) return;
    const was = S.selfId;
    S.selfId = next;
    R.forceNext = true;
    // Mid-round, the rest of the room's frozen roster still names our OLD id, so nobody
    // could catch us or be caught by us any more. Honest answer: sit the rest of this round
    // out and come back for the next one (the lobby return still happens).
    if (S.role && inRound(S.phase) && was !== "local") {
      R.forfeited = true;
      S.role = null;
      S.rank = -1;
      S.toastQ.push({ text: "Reconnected - you'll join the next round", icon: "📶", variant: "info" });
    } else if (S.role && inRound(S.phase) && S.roster) {
      // "local" -> a real id while in a round can only happen with no roster peers; rename
      // so our own lookups keep working.
      if (S.roster.hu === was) S.roster.hu = next;
      const i = S.roster.ps.indexOf(was);
      if (i >= 0) S.roster.ps[i] = next;
    }
  }

  // ---- peers (§4.1) ---------------------------------------------------------------------
  function selfAccount() {
    try {
      const acc = ctx.services.account;
      const id = acc && typeof acc.id === "function" ? acc.id() : null;
      return id != null && id !== "" ? String(id) : null;
    } catch {
      return null;
    }
  }

  function readPeers() {
    const now = S.now;
    const myAcct = selfAccount();
    let list = [];
    try { list = net && typeof net.roster === "function" ? net.roster() : []; } catch { list = []; }
    if (!Array.isArray(list)) list = [];
    const silentFor = netFn("silentFor");
    const seen = new Set();
    const peers = new Map();
    const fresh = [];
    for (const p of list) {
      if (!p || !idOrNull(p.id) || p.id === S.selfId) continue;
      const id = p.id;
      seen.add(id);
      if (p.state !== R.lastRef.get(id)) {
        R.lastRef.set(id, p.state);
        let json = "";
        try { json = JSON.stringify(p.state === undefined ? null : p.state); } catch { json = ""; }
        if (json !== R.lastJson.get(id)) {
          R.lastJson.set(id, json);
          R.lastChange.set(id, now);
          R.lastSan.set(id, sanitize(p.state));
        }
      }
      if (!R.lastChange.has(id)) R.lastChange.set(id, now);
      const st = R.lastSan.get(id) || null;
      let silentS = 0;
      if (silentFor) {
        try { silentS = Number(silentFor(id)); } catch { silentS = 0; }
        if (!Number.isFinite(silentS)) silentS = Infinity;
      }
      // Another tab of OUR account is not a second player (it would let one person farm
      // rounds against themselves): it is drawn, but never fresh, counted or rostered.
      const sameAcct = !!myAcct && p.accountId != null && String(p.accountId) === myAcct;
      const isFresh = !sameAcct && !!st && st.v === STATE_V
        && now - R.lastChange.get(id) <= TUNE.PEER_STALE_S
        && (!silentFor || silentS <= TUNE.PEER_SILENT_S);
      if (isFresh) R.lastFreshAt.set(id, now);
      const pos = Array.isArray(p.pos) && p.pos.length === 3 ? p.pos : null;
      if (!pos) continue;   // §4.1: a PeerView for every roster peer WITH a pos
      const view = {
        id, name: typeof p.name === "string" ? p.name : "", pos,
        yaw: Number.isFinite(p.yaw) ? p.yaw : 0,
        fresh: isFresh, silentS, st, sameAcct,
      };
      peers.set(id, view);
      if (isFresh) fresh.push(id);
    }
    // Forget peers that left the roster. R.hiddenSet is NOT pruned here: applyHiding un-hides
    // a vanished peer explicitly (net also clears it on bye), so nobody is left hidden.
    for (const map of [R.lastChange, R.lastRef, R.lastJson, R.lastSan, R.seqBase, R.hcSeen]) {
      for (const id of [...map.keys()]) if (!seen.has(id)) map.delete(id);
    }
    // lastFreshAt must outlive a short vanish of a rostered player (the absence windows of
    // §4.8 read it), so only ids outside the current roster are forgotten.
    const ro = S.roster;
    for (const id of [...R.lastFreshAt.keys()]) {
      if (seen.has(id)) continue;
      if (ro && (ro.hu === id || ro.ps.indexOf(id) >= 0)) continue;
      R.lastFreshAt.delete(id);
    }
    fresh.sort();
    S.peers = peers;
    S.fresh = fresh;
    S.participants = 1 + fresh.length;
  }

  function freshView(id) {
    const v = S.peers.get(id);
    return v && v.fresh ? v : null;
  }

  // ---- publishing (§4.6) ------------------------------------------------------------------
  function sideClass() {
    if (S.role === "pig") return ["pig", S.pig.classId, S.pig.skinId];
    if (S.role === "hunter") return ["hunter", S.hunter.classId, S.hunter.skinId];
    return S.practice === "hunter"
      ? ["hunter", S.hunter.classId, S.hunter.skinId]
      : ["pig", S.pig.classId, S.pig.skinId];
  }

  function wireVec(p, step) {
    if (!Array.isArray(p) || p.length !== 3) return null;
    const out = [];
    for (const c of p) {
      const n = Number(c);
      if (!Number.isFinite(n)) return null;
      out.push(fix(n, step));
    }
    return out;
  }

  function buildBlob() {
    const side = sideClass();
    const pigRole = S.role === "pig";
    const pig = S.pig || {};
    const hun = S.hunter || {};
    let cn = null;
    if (pig.cn && typeof pig.cn === "object") {
      const p = wireVec(pig.cn.p, TUNE.POS_ROUND);
      if (p) cn = { p, y: fix(Number(pig.cn.y) || 0, TUNE.YAW_ROUND), a: bit(pig.cn.a) };
    }
    let bm = null;
    if (Array.isArray(hun.bm) && hun.bm.length) {
      bm = [];
      for (const b of hun.bm.slice(0, TUNE.WIRE_MAX_BOMBS)) {
        const p = b && wireVec(b.p, TUNE.POS_ROUND);
        if (p) bm.push({ i: seqOf(b.i), p, f: Math.ceil(Math.max(0, Number(b.f) || 0)) });
      }
      if (!bm.length) bm = null;
    }
    let rk = null;
    if (hun.rk && typeof hun.rk === "object") {
      const p = wireVec(hun.rk.p, TUNE.POS_ROUND);
      const d = wireVec(hun.rk.d, TUNE.YAW_ROUND);
      if (p && d) rk = { s: seqOf(hun.rk.s), p, d };
    }
    let ex = null;
    if (hun.ex && typeof hun.ex === "object") {
      const p = wireVec(hun.ex.p, TUNE.POS_ROUND);
      if (p) ex = { s: seqOf(hun.ex.s), p, r: fix(Number(hun.ex.r) || 0, TUNE.POS_ROUND) };
    }
    return {
      v: STATE_V,
      k: Math.floor(S.now) % TUNE.HEARTBEAT_MOD,
      ph: S.phase,
      t: Math.max(0, Math.round(S.clock)),
      rn: S.rn,
      ro: S.roster && inRound(S.phase) ? { hu: S.roster.hu, ps: S.roster.ps.slice() } : null,
      rs: S.phase === PH_RESULT && S.result ? S.result.reason : null,
      st: S.startPending && S.phase === PH_LOBBY ? 1 : 0,
      hc: R.hc,
      rl: S.role,
      cl: side[1],
      sk: side[2],
      hp: pigRole ? Math.max(0, Math.round(S.hp)) : 0,
      hm: pigRole ? Math.max(0, Math.round(S.hpMax)) : 0,
      cg: pigRole && S.caught ? 1 : 0,
      cb: pigRole && S.caught ? S.caughtBy : null,
      sp: S.spectating ? 1 : 0,
      iv: bit(pig.iv),
      bl: bit(pig.bl),
      pl: intIn(pig.pl, 0, 3),
      th: seqOf(pig.th),
      fl: seqOf(hun.fl),
      cn,
      bm,
      rk,
      ex,
      hits: R.wireHits ? R.wireHits.map((h) => ({ s: h.s, to: h.to, d: h.d, w: h.w, c: h.c })) : null,
      pw: intIn(S.save && S.save.pigWins, 0, TUNE.WIN_MAX),
      hw: intIn(S.save && S.save.hunterWins, 0, TUNE.WIN_MAX),
    };
  }

  // The fields whose change forces a publish past the throttle (§4.6 "Forced on").
  function forceKey(b) {
    return [
      b.ph, b.rn, b.st, b.rl, b.cg, b.sp, b.iv, b.bl, b.pl, b.th, b.fl,
      b.rk ? b.rk.s : -1, b.ex ? b.ex.s : -1,
      b.cn ? `${b.cn.p.join(",")}|${b.cn.y}|${b.cn.a}` : "-",
      b.hits ? b.hits.map((h) => h.s).join(",") : "-",
      b.ro ? b.ro.hu : "-", b.rs || "-",
    ].join(";");
  }

  function publish(force) {
    if (R.disposed || !R.booted) return;
    const pub = netFn("publish");
    if (!pub) return;
    const blob = buildBlob();
    const key = forceKey(blob);
    const now = S.now;
    const forced = force === true || R.forceNext || key !== R.lastPubKey
      || now - R.lastPubAt >= TUNE.KEEPALIVE_S;
    if (!forced && now - R.lastPubAt < TUNE.PUBLISH_MIN_S) return;
    try {
      pub(blob);
    } catch (err) {
      console.error("[oof] pighide publish failed", err);
      return;
    }
    R.lastPub = blob;
    R.lastPubKey = key;
    R.lastPubAt = now;
    R.forceNext = false;
  }

  // §4.7: drain the hunter's outHits into the wire. Only a seeking hunter's hits are real,
  // and only to a fresh pig in the frozen roster: practice never publishes hits.
  function drainHits() {
    const q = Array.isArray(S.outHits) ? S.outHits.splice(0, S.outHits.length) : [];
    const live = S.phase === PH_SEEK && S.role === "hunter" && !!S.roster;
    if (q.length && live) {
      const add = [];
      for (const h of q) {
        if (!h || typeof h !== "object") continue;
        const to = idOrNull(h.to);
        if (!to || to === S.selfId || S.roster.ps.indexOf(to) < 0 || !freshView(to)) continue;
        const d = intIn(h.d, 1, TUNE.WIRE_MAX_HP);
        R.hitSeq += 1;
        add.push({ s: R.hitSeq, to, d, w: typeof h.w === "string" ? h.w.slice(0, 16) : "", c: bit(h.c), at: S.now });
      }
      if (add.length) {
        const merged = (R.wireHits || []).concat(add);
        R.wireHits = merged.slice(Math.max(0, merged.length - TUNE.WIRE_MAX_HITS));
        R.wireHitsAt = S.now;
        R.forceNext = true;
        return;
      }
    }
    // Hits stay on the wire for HIT_HOLD_S (a victim on a slow frame, or one whose hit and
    // the next blob arrived in the same frame, still sees them; it dedupes by seq), then
    // age out. Outside seek they are dropped at once.
    if (R.wireHits) {
      const keep = live ? R.wireHits.filter((h) => S.now - h.at < TUNE.HIT_HOLD_S) : [];
      if (keep.length !== R.wireHits.length) {
        R.wireHits = keep.length ? keep : null;
        R.forceNext = true;
      }
    }
  }

  // ---- teleports and movement (§4.5) -------------------------------------------------------
  function pt(p) {
    return Array.isArray(p) && p.length === 3 && p.every(Number.isFinite) ? p : null;
  }

  function moveTo(p) {
    const q = pt(p);
    if (!q) return;
    try { player.teleport([q[0], q[1], q[2]]); } catch (err) { console.error("[oof] pighide teleport", err); }
  }

  function checkpoint(p) {
    const q = pt(p);
    if (!q) return;
    try { player.setCheckpoint([q[0], q[1], q[2]]); } catch { /* checkpoint is best-effort */ }
  }

  function setMove(walk, jump) {
    try { player.setWalkSpeed(walk); } catch { /* clamped by the platform anyway */ }
    try { player.setJumpPower(jump); } catch { /* same */ }
  }

  function spawnPoint() {
    if (pt(city.SPAWN)) return city.SPAWN;
    if (Array.isArray(city.LOBBY_RETURN) && pt(city.LOBBY_RETURN[0])) return city.LOBBY_RETURN[0];
    return null;
  }

  function pigDrop(rank) {
    const drops = Array.isArray(city.PIG_DROPS) ? city.PIG_DROPS : [];
    if (!drops.length) return null;
    return drops[((Math.max(0, rank) * 5) % drops.length + drops.length) % drops.length];
  }

  function lobbyReturn(rank) {
    const pts = Array.isArray(city.LOBBY_RETURN) ? city.LOBBY_RETURN : [];
    if (!pts.length) return spawnPoint();
    return pts[Math.max(0, rank) % pts.length];
  }

  // ---- spectating (§4.9) ---------------------------------------------------------------
  function stopSpectate(teleportBack) {
    if (!S.spectating) return;
    S.spectating = false;
    R.forceNext = true;
    setMove(TUNE.WALK_DEFAULT, TUNE.JUMP_DEFAULT);
    try { ctx.engine.camera.reset(); } catch { /* camera optional in tests */ }
    if (teleportBack) moveTo(city.PIG_PEN);
  }

  function spectateTick() {
    if (!S.spectating || !S.roster) return;
    const hv = S.peers.get(S.roster.hu);
    if (!hv || !hv.pos) return;
    let p = [hv.pos[0], hv.pos[1] + TUNE.SPECTATE_UP, hv.pos[2]];
    if (typeof city.clampToCity === "function") {
      try { p = city.clampToCity(p) || p; } catch { /* keep the raw point */ }
    } else if (city.BOUNDS) {
      const b = city.BOUNDS;
      p = [Math.max(b.minX, Math.min(b.maxX, p[0])), Math.max(b.minY, Math.min(b.maxY, p[1])),
        Math.max(b.minZ, Math.min(b.maxZ, p[2]))];
    }
    moveTo(p);
  }

  // ---- phase edges (§4.5) ------------------------------------------------------------------
  function resetRoundLocals() {
    R.hitHw.clear();
    R.caughtSet.clear();
    R.allCaughtSeen = false;
    R.sweepCaught = 0;
    R.forfeited = false;
    S.caught = false;
    S.caughtBy = null;
    S.result = null;
  }

  // Enter the round `rn` (whose roster is `ro`) at phase `ph`, from the lobby. `fromLobby`
  // false means we arrived mid-round (a joiner adopting): we sit it out whatever ro says.
  function enterRound(ph, clock, rn, ro, fromLobby) {
    stopSpectate(false);
    resetRoundLocals();
    S.rn = rn;
    S.roster = ro ? { hu: ro.hu, ps: ro.ps.slice() } : null;
    S.startPending = false;
    S.pigsTotal = S.roster ? S.roster.ps.length : 0;
    // Everybody in the roster counts as present right now, so §4.8's absence windows start
    // at the edge rather than at "never seen".
    if (S.roster) {
      for (const id of [S.roster.hu, ...S.roster.ps]) if (id !== S.selfId) R.lastFreshAt.set(id, S.now);
    }
    let role = null;
    let rank = -1;
    if (fromLobby && S.roster) {
      if (S.roster.hu === S.selfId) { role = "hunter"; rank = 0; }
      else if (S.roster.ps.indexOf(S.selfId) >= 0) { role = "pig"; rank = S.roster.ps.indexOf(S.selfId); }
    }
    S.role = role;
    S.rank = rank;
    R.wasInRound = role !== null;
    R.settleAt = -1;
    if (S.roster && R.hcRn !== rn) {
      R.hcRn = rn;
      if (S.roster.hu !== S.selfId) R.hcSeen.set(S.roster.hu, (R.hcSeen.get(S.roster.hu) || 0) + 1);
    }
    S.phase = PH_HIDE;
    S.clock = ph === PH_HIDE ? Math.max(0, Math.min(clock, TUNE.HIDE_S)) : TUNE.HIDE_S;
    R.driftFor = 0;
    R.forceNext = true;

    if (role === "hunter") {
      R.hc += 1;
      S.hp = 0;
      S.hpMax = 0;
      moveTo(city.HUNTER_CAGE);
      setMove(0, 0);
      checkpoint(city.HUNTER_CAGE);
      C.noteRoundPlayed(S.save);
      call("onRoleStart", "hunter", 0);
    } else if (role === "pig") {
      const hp = C.pigHp(S.pig.classId);
      S.hp = hp;
      S.hpMax = hp;
      const drop = pigDrop(rank);
      moveTo(drop);
      checkpoint(drop);
      C.noteRoundPlayed(S.save);
      call("onRoleStart", "pig", rank);
    }

    if (ph === PH_SEEK) toSeek(clock);
    else if (ph === PH_RESULT) {
      toSeek(0);
      toResult(null, clock);
    }
  }

  function toSeek(clock) {
    S.phase = PH_SEEK;
    S.clock = Number.isFinite(clock) ? Math.max(0, Math.min(clock, TUNE.SEEK_S)) : TUNE.SEEK_S;
    R.driftFor = 0;
    R.forceNext = true;
    if (S.role === "hunter") {
      moveTo(city.HUNTER_RELEASE);
      setMove(C.hunterWalk(S.hunter.classId), TUNE.JUMP_DEFAULT);
      checkpoint(city.HUNTER_RELEASE);
    }
    if (S.role) call("onSeek");
  }

  // `reason` null means "read the conductor's rs" (a follower), else our own decision.
  function toResult(reason, clock) {
    const rs = reason === "time" || reason === "hunter" || reason === "none" ? reason : "none";
    S.phase = PH_RESULT;
    S.clock = Number.isFinite(clock) ? Math.max(0, Math.min(clock, TUNE.RESULT_S)) : TUNE.RESULT_S;
    R.driftFor = 0;
    R.forceNext = true;
    stopSpectate(true);
    if (S.role === "hunter" || S.role === "pig") setMove(TUNE.WALK_DEFAULT, TUNE.JUMP_DEFAULT);
    S.result = { reason: rs, rn: S.rn, scored: R.scoredRn === S.rn, iWon: false };
    score();
    call("onRoundEnd", S.result);
  }

  function toLobby() {
    const returning = R.wasInRound || R.forfeited;
    const rank = S.rank;
    stopSpectate(false);
    S.phase = PH_LOBBY;
    S.clock = 0;
    R.driftFor = 0;
    R.forceNext = true;
    S.roster = null;
    S.role = null;
    S.rank = -1;
    S.caught = false;
    S.caughtBy = null;
    S.pigsLeft = 0;
    S.pigsTotal = 0;
    S.startPending = false;
    S.blind = 0;
    R.wasInRound = false;
    R.forfeited = false;
    const hp = C.pigHp(S.pig.classId);
    S.hp = hp;
    S.hpMax = hp;
    clearHidden();
    if (returning) {
      moveTo(lobbyReturn(rank));
      checkpoint(spawnPoint());
      setMove(TUNE.WALK_DEFAULT, TUNE.JUMP_DEFAULT);
    }
    call("onLobby");
  }

  // ---- scoring (§4.8), each client for ITSELF, latched once per rn ------------------------
  function award(amount, reason) {
    try { ctx.services.economy.award(amount, reason); } catch (err) { console.error("[oof] pighide award", err); }
  }

  function badge(id) {
    try { return ctx.services.badges.award(id); } catch { return false; }
  }

  function sfx(name, opts) {
    try { ctx.engine.audio.playSfx(name, opts); } catch { /* audio optional */ }
  }

  // Another tab of the same browser shares this save. Take the higher of every lifetime
  // count (and the union of owned skins) from disk before adding a win, so a tab with a
  // stale copy can never roll the total back.
  function mergeDiskSave() {
    let disk = null;
    try { disk = C.migrateSave(ctx.services.saves.load()); } catch { disk = null; }
    if (!disk || !S.save) return;
    const sv = S.save;
    for (const k of ["pigWins", "hunterWins", "catches", "pigsSurvived", "rounds"]) {
      if ((disk[k] | 0) > (sv[k] | 0)) sv[k] = disk[k];
    }
    for (const k of ["ownedPigSkins", "ownedHunterSkins"]) {
      if (!Array.isArray(sv[k]) || !Array.isArray(disk[k])) continue;
      for (const id of disk[k]) if (!sv[k].includes(id)) sv[k].push(id);
    }
    if (disk.radarClaimed && !sv.radarClaimed) sv.radarClaimed = true;
  }

  function score() {
    const res = S.result;
    if (!res || R.scoredRn === S.rn) {
      if (res) res.scored = true;
      return;
    }
    // A hunter whose own view has not yet seen the last pig's cg:1 (the conductor's result
    // can overtake it on the wire) stays unlatched; update() re-checks through result.
    if (S.role === "hunter" && !R.forfeited && res.reason === "hunter" && !R.allCaughtSeen) return;
    R.scoredRn = S.rn;
    res.scored = true;
    const winning = (S.role === "pig" && !S.caught && !R.forfeited && res.reason === "time")
      || (S.role === "hunter" && !R.forfeited && res.reason === "hunter" && R.allCaughtSeen);
    if (winning) mergeDiskSave();
    if (S.role === "pig" && !S.caught && !R.forfeited && res.reason === "time") {
      const { pigWins } = C.applyPigWin(S.save);
      award(C.REWARDS.pigWin, C.REWARDS.reasonPig);
      for (const id of C.pigWinBadges(pigWins)) badge(id);
      if (S.hp <= TUNE.CLOSE_CALL_HP) badge("close-call");
      res.iWon = true;
      S.toastQ.push({ text: "🐷 You survived! +1 Pig Win", icon: "🐷", variant: "success" });
      sfx("win");
    } else if (S.role === "hunter" && !R.forfeited && res.reason === "hunter" && R.allCaughtSeen) {
      const caught = R.sweepCaught;
      const { hunterWins } = C.applyHunterWin(S.save, caught);
      award(C.REWARDS.hunterWin, C.REWARDS.reasonHunter);
      for (const id of C.hunterWinBadges(hunterWins)) badge(id);
      if (caught >= TUNE.CLEAN_SWEEP_N) badge("clean-sweep");
      res.iWon = true;
      S.toastQ.push({ text: "🎯 Every pig caught! +1 Hunter Win", icon: "🎯", variant: "success" });
      sfx("fanfare");
    } else if (S.role === "pig" && S.caught) {
      S.toastQ.push({ text: "Good hiding! Next round you'll get them.", icon: "🐷", variant: "info" });
    }
  }

  // ---- the round's live facts (§4.8) ----------------------------------------------------------
  function roundFacts() {
    const ro = S.roster;
    if (!ro) return { remaining: [], uncaught: 0, allCaught: false, hunterGone: true };
    const now = S.now;
    const gone = (id) => {
      if (id === S.selfId) return R.forfeited;
      if (!S.peers.has(id) && !R.lastFreshAt.has(id)) return true;
      const at = R.lastFreshAt.get(id);
      return !Number.isFinite(at) || now - at > TUNE.PIG_ABSENT_S;
    };
    for (const id of ro.ps) {
      if (id === S.selfId) { if (S.caught) R.caughtSet.add(id); continue; }
      const v = freshView(id);
      if (v && v.st && v.st.cg === 1 && v.st.rn === S.rn) R.caughtSet.add(id);
    }
    // A pig that sat the round out (its sim stalled, or it reconnected) publishes this rn
    // with no role: it is out of the round for everybody, never blocking the hunter.
    const satOut = (id) => {
      const v = freshView(id);
      return !!(v && v.st && v.st.rn === S.rn && inRound(v.st.ph) && v.st.rl !== "pig");
    };
    const remaining = ro.ps.filter((id) => !gone(id) && !satOut(id));
    const uncaught = remaining.filter((id) => !R.caughtSet.has(id)).length;
    const allCaught = remaining.length > 0 && uncaught === 0;
    let hunterGone = false;
    if (ro.hu !== S.selfId) {
      const at = R.lastFreshAt.get(ro.hu);
      hunterGone = !Number.isFinite(at) || now - at > TUNE.HUNTER_ABSENT_S;
    }
    return { remaining, uncaught, allCaught, hunterGone };
  }

  // ---- incoming hits (§4.7) ------------------------------------------------------------------
  function readIncoming() {
    if ((S.phase !== PH_SEEK && S.phase !== PH_HIDE) || S.role !== "pig" || S.caught || !S.roster) return;
    const v = freshView(S.roster.hu);
    if (!v || !v.st || !v.st.hits || v.st.ph !== PH_SEEK || v.st.rn !== S.rn) return;
    let hw = R.hitHw.get(v.id) || 0;
    for (const h of v.st.hits) {
      if (h.to !== S.selfId || h.s <= hw) continue;
      hw = h.s;
      if (h.c === 1) {
        if (S.pig.cn && S.pig.cn.a === 1) {
          call("onCloneHit", v.id);
          badge("decoy-duty");
          S.toastQ.push({ text: "Your clone was caught!", icon: "🧪", variant: "warn" });
        }
        continue;
      }
      if (S.caught) continue;
      const d = Math.max(1, Math.min(TUNE.WIRE_MAX_HP, h.d));
      S.hp = Math.max(0, S.hp - d);
      S.hurt = TUNE.BLIND_FADE_S;
      sfx("pop");
      if (S.hp <= 0) {
        S.caught = true;
        S.caughtBy = v.id;
        R.caughtSet.add(S.selfId);
        R.forceNext = true;
        moveTo(city.PIG_PEN);
        checkpoint(city.PIG_PEN);
        sfx("oof");
        S.toastQ.push({ text: "Oof! You were caught. Wait in the Pig Pen", icon: "🐷", variant: "warn" });
        call("onCaught", v.id);
      }
    }
    R.hitHw.set(v.id, hw);
  }

  // ---- seq-carried events (§4.6) ---------------------------------------------------------------
  function selfPos() {
    try { return player.position(); } catch { return null; }
  }

  function seqEvents() {
    // Our own thump shakes us too.
    const th = seqOf(S.pig && S.pig.th);
    if (th > R.ownTh) {
      R.ownTh = th;
      R.forceNext = true;
      call("onThump", S.selfId);
    } else if (th < R.ownTh) R.ownTh = th;

    const me = selfPos();
    for (const v of S.peers.values()) {
      if (!v.st) continue;
      const st = v.st;
      const cur = { th: st.th, fl: st.fl, rk: st.rk ? st.rk.s : 0, ex: st.ex ? st.ex.s : 0 };
      const base = R.seqBase.get(v.id);
      R.seqBase.set(v.id, cur);
      if (!base) continue;   // first sight: baseline only, never replay an old event
      if (cur.th > base.th) {
        let near = true;
        if (S.phase === PH_LOBBY && me && v.pos) {
          const dx = v.pos[0] - me[0], dz = v.pos[2] - me[2], dy = v.pos[1] - me[1];
          near = dx * dx + dy * dy + dz * dz <= TUNE.THUMP_LOBBY_R * TUNE.THUMP_LOBBY_R;
        }
        if (near) call("onThump", v.id);
      }
      if (cur.fl > base.fl && S.roster && v.id === S.roster.hu && st.rn === S.rn
        && S.role === "pig" && !S.caught && (S.phase === PH_HIDE || S.phase === PH_SEEK)) {
        S.blind = TUNE.FLASH_S;
        call("onFlash", v.id);
      }
      if (cur.rk > base.rk && st.rk) call("onRemoteFx", v.id, "rk", st.rk);
      if (cur.ex > base.ex && st.ex) call("onRemoteFx", v.id, "ex", st.ex);
    }
  }

  // ---- peer hiding (§4.10) ----------------------------------------------------------------------
  function hiddenApi() {
    return net && typeof net.setPeerHidden === "function";
  }

  function clearHidden() {
    R.hiddenSet.clear();
    if (net && typeof net.clearPeerHidden === "function") {
      try { net.clearPeerHidden(); } catch { /* best-effort */ }
    }
  }

  function applyHiding() {
    if (!hiddenApi()) return;
    const live = S.phase === PH_HIDE || S.phase === PH_SEEK;
    for (const v of S.peers.values()) {
      const st = v.st;
      // Only the Creeper ability hides a connected player (the user's rule: people never
      // vanish unless they are offline). Spectators stay drawn.
      const hidden = !!(v.fresh && st && st.rn === S.rn && st.iv === 1 && live);
      const prev = R.hiddenSet.get(v.id);
      if (prev === hidden || (prev === undefined && !hidden)) {
        if (prev === undefined) R.hiddenSet.set(v.id, hidden);
        continue;
      }
      R.hiddenSet.set(v.id, hidden);
      try { net.setPeerHidden(v.id, hidden); } catch { /* best-effort */ }
    }
    // A hidden peer whose PeerView vanished (lost its pos) is un-hidden, never left hidden.
    for (const [id, was] of [...R.hiddenSet]) {
      if (S.peers.has(id)) continue;
      R.hiddenSet.delete(id);
      if (was) { try { net.setPeerHidden(id, false); } catch { /* best-effort */ } }
    }
  }

  // ---- the conductor (§4.2) ------------------------------------------------------------------------
  function lifeKey(rn, ph) {
    return rn * 4 + (ph === PH_LOBBY ? 4 : PHASE_ORDER[ph] || 0);
  }

  function pickConductor() {
    // Lowest id among self (once adopted) and fresh peers whose state changed within
    // CONDUCTOR_STALE_S. A peer behind our round index is skipped: it is a joiner that will
    // adopt us, and following it would drag a live round back into the lobby.
    // A peer behind us in the round's lifecycle (lobby@rn comes after result@rn) is skipped
    // too: a client back from a frozen tab still conducting a finished round must not
    // drag the room's lobby back into it.
    const mine = lifeKey(S.rn, S.phase);
    let best = R.adopted ? S.selfId : null;
    for (const id of S.fresh) {
      const v = S.peers.get(id);
      if (!v || !v.st) continue;
      if (S.now - (R.lastChange.get(id) || -1e9) > TUNE.CONDUCTOR_STALE_S) continue;
      if (v.st.rn < S.rn) continue;
      if (lifeKey(v.st.rn, v.st.ph) < mine) continue;
      if (best === null || id < best) best = id;
    }
    return best || S.selfId;
  }

  // A fresh peer in a round we have never seen (higher rn) pulls us into it, sitting out.
  function adoptNewerRound() {
    // A rostered player already back in the lobby at our rn (or later) proves round rn is
    // over: we missed its end (a frozen tab). Close it with no award, never conduct it on.
    if (inRound(S.phase) && S.roster) {
      const ro = S.roster;
      const over = S.fresh.some((id) => {
        const v = S.peers.get(id);
        return !!(v && v.st && v.st.ph === PH_LOBBY && v.st.rn >= S.rn
          && (id === ro.hu || ro.ps.indexOf(id) >= 0));
      });
      if (over) {
        if (S.phase !== PH_RESULT) {
          R.forfeited = true;
          toResult("none", 0);
        }
        toLobby();
        return false;
      }
    }
    let pick = null;
    let lobbyRn = S.rn;
    for (const id of S.fresh) {
      const v = S.peers.get(id);
      if (!v || !v.st) continue;
      if (v.st.ph === PH_LOBBY) { if (v.st.rn > lobbyRn) lobbyRn = v.st.rn; continue; }
      if (!inRound(v.st.ph) || !v.st.ro) continue;
      if (v.st.rn <= S.rn) continue;
      if (!pick || v.st.rn > pick.st.rn || (v.st.rn === pick.st.rn && id < pick.id)) pick = v;
    }
    if (!pick) {
      // Two lobbies with different round counters would each think it conducts (a peer
      // behind our rn is skipped by pickConductor). In the lobby the counter carries no
      // round, so everyone simply takes the room's highest one and the lowest id conducts.
      if (S.phase === PH_LOBBY && lobbyRn > S.rn) { S.rn = lobbyRn; R.forceNext = true; }
      return false;
    }
    const wasLobby = S.phase === PH_LOBBY;
    if (!wasLobby) {
      // We are in an older round the room has moved past: close it with no award.
      if (S.phase !== PH_RESULT) toResult("none", 0);
      toLobby();
    }
    // A conductor's start that names us is a normal start (we were waiting in the lobby and
    // it counted us). Anything else - a boot into a live room, or a round we were not in the
    // lobby for - is sat out (§4.2 adoption), whatever its roster says.
    const fromLobby = wasLobby && R.adopted && pick.st.ph !== PH_RESULT;
    enterRound(pick.st.ph, pick.st.t, pick.st.rn, pick.st.ro, fromLobby);
    R.adopted = true;
    return true;
  }

  function followConductor(dt, v) {
    const st = v.st;
    if (st.rn !== S.rn) return;   // a newer rn is adoptNewerRound's; an older one is ignored
    const ph = st.ph;
    const order = PHASE_ORDER[ph];
    const mine = PHASE_ORDER[S.phase];
    if (ph !== S.phase) {
      if (ph === PH_LOBBY) {
        if (S.phase !== PH_RESULT) toResult("none", 0);
        toLobby();
        return;
      }
      if (order < mine) return;   // the conductor is behind us in the same round: wait
      if (S.phase === PH_HIDE && ph === PH_SEEK) { toSeek(st.t); return; }
      if (ph === PH_RESULT) {
        if (S.phase === PH_HIDE) toSeek(0);
        toResult(st.rs, st.t);
        return;
      }
      return;
    }
    if (S.phase === PH_LOBBY) return;
    // Same phase: slew the clock; snap on drift held too long.
    const err = st.t - S.clock;
    if (Math.abs(err) <= TUNE.CLOCK_TOLERANCE_S) {
      R.driftFor = 0;
      const excess = err > CLOCK_DEADBAND_S ? err - CLOCK_DEADBAND_S
        : err < -CLOCK_DEADBAND_S ? err + CLOCK_DEADBAND_S : 0;
      if (excess !== 0) S.clock = Math.max(0, S.clock + excess * Math.min(1, dt));
      return;
    }
    R.driftFor += dt;
    if (R.driftFor >= TUNE.RESYNC_AFTER_S) {
      S.clock = Math.max(0, st.t);
      R.driftFor = 0;
    }
  }

  // ---- the conductor's own transitions --------------------------------------------------------
  function conduct(facts) {
    if (S.phase === PH_LOBBY) {
      if (!S.canStart) return;
      let wants = S.startPending;
      for (const id of S.fresh) {
        const v = S.peers.get(id);
        if (v && v.st && v.st.st === 1 && v.st.ph === PH_LOBBY) wants = true;
      }
      if (!wants) return;
      const ids = [S.selfId];
      const hc = { [S.selfId]: R.hc };
      const fresh = [];
      let rnMax = S.rn;
      for (const id of S.fresh) {
        const v = S.peers.get(id);
        if (!v || !v.st || v.st.ph !== PH_LOBBY) continue;
        ids.push(id);
        // The room's own count wins over a self-reported one (a reload resets that).
        hc[id] = Math.max(v.st.hc, R.hcSeen.get(id) || 0);
        if (!R.hcSeen.has(id) && v.st.hc === 0) fresh.push(id);
        if (v.st.rn > rnMax) rnMax = v.st.rn;
      }
      if (ids.length < TUNE.MIN_PLAYERS) return;
      // Newcomers (never seen hunt, claiming 0) start at the veterans' lowest count, so
      // arriving or reloading never jumps the hunter queue.
      const vets = ids.filter((id) => !fresh.includes(id)).map((id) => hc[id]);
      if (vets.length) {
        const floor = Math.min(...vets);
        for (const id of fresh) hc[id] = Math.max(hc[id], floor);
      }
      ids.sort();
      const rn = rnMax + 1;
      const hu = C.pickHunter(ids, hc, rn);
      if (!hu) return;
      const ps = ids.filter((id) => id !== hu).slice(0, TUNE.MAX_PIGS);
      enterRound(PH_HIDE, TUNE.HIDE_S, rn, { hu, ps }, true);
      return;
    }
    if (S.phase === PH_HIDE) {
      if (facts.hunterGone || facts.remaining.length === 0) { toResult("none"); return; }
      if (S.clock <= 0) toSeek(TUNE.SEEK_S);
      return;
    }
    if (S.phase === PH_SEEK) {
      if (facts.allCaught) { toResult("hunter"); return; }
      if (facts.hunterGone || facts.remaining.length === 0) { toResult("none"); return; }
      if (S.clock <= 0) {
        // Settle: a last catch may still be in flight when the clock runs out.
        if (R.settleAt < 0) R.settleAt = S.now;
        if (S.now - R.settleAt >= TUNE.RESULT_SETTLE_S) toResult(facts.uncaught > 0 ? "time" : "none");
      }
      return;
    }
    if (S.phase === PH_RESULT && S.clock <= 0) toLobby();
  }

  // ---- the lobby's honest start line (§4.3) ------------------------------------------------------
  function startLine() {
    S.canStart = S.phase === PH_LOBBY && S.participants >= TUNE.MIN_PLAYERS;
    if (S.startPending && (S.phase !== PH_LOBBY || S.now - R.stAt > TUNE.START_HOLD_S || !S.canStart)) {
      S.startPending = false;
      R.forceNext = true;
    }
    if (S.phase !== PH_LOBBY) {
      S.startHint = S.role ? "" : "Round in progress - you'll join the next one";
    } else if (S.startPending) {
      S.startHint = "Starting…";
    } else if (S.canStart) {
      S.startHint = `Press START - ${S.participants} players here`;
    } else {
      const need = Math.max(1, TUNE.MIN_PLAYERS - S.participants);
      S.startHint = need === 1 ? "Waiting for players — need 1 more" : `Waiting for players — need ${need} more`;
    }
  }

  // A pig whose own sim stopped (a background tab, a switched-away phone) was stale to the
  // room and so could not be caught meanwhile. It sits the rest of the round out: it no
  // longer counts, can't win it, and never blocks the hunter (§4.8).
  // The page being hidden is the signal (a background tab or a switched-away app stops the
  // sim): a debugger or test harness that merely pauses the loop is not "away".
  function wallS() {
    try { return performance.now() / 1000; } catch { return 0; }
  }
  function onVisibility() {
    if (R.disposed || typeof document === "undefined") return;
    if (document.visibilityState === "hidden") {
      R.hiddenAt = wallS();
    } else if (R.hiddenAt >= 0) {
      R.awayFor = Math.max(R.awayFor, wallS() - R.hiddenAt);
      R.hiddenAt = -1;
    }
  }
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", onVisibility);
  }

  function stallCheck() {
    const gap = R.awayFor;
    R.awayFor = 0;
    if (gap <= TUNE.STALL_FORFEIT_S) return;
    if (S.role !== "pig" || S.caught || R.forfeited) return;
    if (S.phase !== PH_HIDE && S.phase !== PH_SEEK) return;
    R.forfeited = true;
    S.role = null;
    S.rank = -1;
    R.forceNext = true;
    S.toastQ.push({ text: "You were away - you'll join the next round", icon: "💤", variant: "info" });
  }

  // ---- the tick -------------------------------------------------------------------------------------
  function update(dt) {
    if (R.disposed) return;
    const step = Number.isFinite(dt) && dt > 0 ? dt : 0;
    S.now = ctx.time;
    refreshIdentity();
    stallCheck();
    readPeers();

    if (!R.booted) {
      // Boot: look at the room before declaring a phase (spec 25 bootTick). Usually nobody
      // is here yet (the welcome lands after init), which is the lobby.
      R.booted = true;
      if (!adoptNewerRound()) R.adopted = true;
    } else {
      adoptNewerRound();
    }

    const cid = pickConductor();
    S.conductorId = cid;
    const iConduct = cid === S.selfId;

    if (S.phase !== PH_LOBBY) S.clock = Math.max(0, S.clock - step);
    if (R.skipTarget) {
      if (S.phase === R.skipTarget || S.phase === PH_LOBBY) R.skipTarget = null;
      else S.clock = 0;
    }

    readIncoming();
    seqEvents();

    const facts = inRound(S.phase) ? roundFacts() : null;
    if (facts) {
      S.pigsLeft = facts.uncaught;
      S.pigsTotal = S.roster ? S.roster.ps.length : 0;
      const inPlay = S.phase === PH_SEEK
        || (S.phase === PH_RESULT && S.result && S.result.reason === "hunter" && R.scoredRn !== S.rn);
      if (S.role === "hunter" && inPlay && facts.allCaught && !R.allCaughtSeen) {
        R.allCaughtSeen = true;
        R.sweepCaught = facts.remaining.length;
        if (S.phase === PH_RESULT) score();   // the late latch (see score())
      }
    }

    startLine();
    if (iConduct) {
      conduct(facts || { remaining: [], uncaught: 0, allCaught: false, hunterGone: false });
    } else {
      const v = S.peers.get(cid);
      if (v && v.st) followConductor(step, v);
    }
    startLine();

    spectateTick();
    drainHits();
    applyHiding();

    if (S.blind > 0) S.blind = Math.max(0, S.blind - step);
    if (S.hurt > 0) S.hurt = Math.max(0, S.hurt - step);
  }

  // ---- public API ---------------------------------------------------------------------------------
  function requestStart() {
    startLine();
    if (!S.canStart) return false;
    S.startPending = true;
    R.stAt = S.now;
    R.forceNext = true;
    startLine();
    publish(true);
    return true;
  }

  function toggleSpectate() {
    if (S.role !== "pig" || !S.caught || !(S.phase === PH_HIDE || S.phase === PH_SEEK)) return false;
    if (S.spectating) {
      stopSpectate(true);
      return true;
    }
    S.spectating = true;
    R.forceNext = true;
    setMove(0, 0);
    try {
      ctx.engine.camera.setDistance(TUNE.SPECTATE_DIST);
      ctx.engine.camera.setPitch(TUNE.SPECTATE_PITCH);
    } catch { /* camera optional in tests */ }
    spectateTick();
    return true;
  }

  function debugAdvance(s) {
    const n = Number(s);
    if (!Number.isFinite(n) || n <= 0) return;
    if (S.phase !== PH_LOBBY) S.clock = Math.max(0, S.clock - n);
    S.blind = Math.max(0, S.blind - n);
  }

  function debugSkipTo(phase) {
    if (S.phase === PH_LOBBY) return;
    S.clock = 0;
    R.skipTarget = isPhase(phase) && phase !== S.phase ? phase : null;
  }

  function dispose() {
    if (R.disposed) return;
    stopSpectate(false);
    clearHidden();
    if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
      document.removeEventListener("visibilitychange", onVisibility);
    }
    R.disposed = true;
    R.lastChange.clear();
    R.lastRef.clear();
    R.lastJson.clear();
    R.lastSan.clear();
    R.lastFreshAt.clear();
    R.seqBase.clear();
    R.hitHw.clear();
    R.caughtSet.clear();
    R.wireHits = null;
  }

  return {
    update,
    publish,
    requestStart,
    toggleSpectate,
    forcePublish() { R.forceNext = true; },
    debugAdvance,
    debugSkipTo,
    dispose,
    // Read-only peeks for the integrator's debugState and smoke (never written by others).
    lastBlob: () => R.lastPub,
    hunterCount: () => R.hc,
  };
}
