// leaderboard.js - the SECRETS leaderboard corner (DESIGN 13): a pill "Secrets 7/26" that expands to the top 10 and your
// rank. Board "tnrpg-secrets" through ../../../platyfy-online.js (imported lazily so a missing/blocked file never breaks
// the UI). Offline-safe: cached rows (stale) or "offline". Also owns the background name claim (CONTRACT 9.3).
import { el, clear } from "./dom.js";
import { onlineNameFor, onlineRetryName, SPECIAL_ONLINE } from "./names.js";

export const BOARD = "tnrpg-secrets";
const TOP_N = 10, TOTAL_FALLBACK = 26;
const LS_OPEN = "tnrpg.ui.lbOpen", LS_SUB = "tnrpg.ui.lbSubmitted", LS_CLAIM = "tnrpg.ui.claimed";

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }

export function createLeaderboard(ctx, root) {
  let online = null, loading = null;
  function lib() {
    if (online) return Promise.resolve(online);
    if (!loading) loading = import("../../../platyfy-online.js").then((m) => (online = m)).catch((e) => { console.warn("[ui] online", e); loading = null; return null; });
    return loading;
  }

  const node = el("div.tn-lb");
  const pill = el("button.tn-lbpill", { attrs: { type: "button", "aria-expanded": "false", "aria-label": "Secrets leaderboard" } });
  const pillTxt = el("span", { text: "Secrets " }), pillNum = el("span.st", { text: "0/26" }), caret = el("span", { text: "▾" });
  pill.appendChild(pillTxt); pill.appendChild(pillNum); pill.appendChild(caret);
  const panel = el("div.tn-lbpanel.tn-hide");
  const head = el("h4", null, ["MOST SECRETS"]);
  const status = el("span");
  head.appendChild(status);
  const list = el("div");
  const mine = el("div.tn-lbmine");
  panel.appendChild(head); panel.appendChild(list); panel.appendChild(mine);
  node.appendChild(pill); node.appendChild(panel);
  root.appendChild(node);

  let open = lsGet(LS_OPEN) === "1";
  // your own row shows the name as you typed it (the shared board stores a <= 16 char filtered version,
  // e.g. "MyGrannie" for the allowed special name)
  const myName = (fallback) => (ctx.state.profile && ctx.state.profile.name) || fallback;
  let rows = [], me = null, state = "idle", lastFetch = 0, timer = 0, hidden = false;

  function counts() {
    let count = 0, total = TOTAL_FALLBACK;
    try {
      const s = ctx.story;
      if (s && s.secretCount) { const c = s.secretCount(); count = c.count | 0; total = c.total | 0 || TOTAL_FALLBACK; }
      else count = Object.keys(ctx.state.profile.secrets || {}).length;
    } catch (e) { /* */ }
    return { count, total };
  }

  function render() {
    const c = counts();
    pillNum.textContent = c.count + "/" + c.total;
    pill.setAttribute("aria-expanded", open ? "true" : "false");
    caret.textContent = open ? "▴" : "▾";
    panel.classList.toggle("tn-hide", !open);
    if (!open) return;
    status.textContent = state === "loading" && !rows.length ? "loading" : state === "offline" ? (rows.length ? "offline (cached)" : "offline") : "";
    clear(list);
    if (!rows.length) {
      list.appendChild(el("div.tn-lbmsg", { text: state === "loading" ? "Loading..." : state === "offline" ? "Can't reach the board right now." : "No one yet. Be the first." }));
    }
    let meShown = false;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (r.me) meShown = true;
      list.appendChild(el("div.tn-lbrow" + (r.me ? ".me" : ""), null, [
        el("span.r", { text: String(r.rank) }), el("span.nm", { text: r.me ? myName(r.name) : r.name, attrs: { title: r.me ? myName(r.name) : r.name } }), el("span.v", { text: String(r.value) })
      ]));
    }
    if (me && !meShown) {
      list.appendChild(el("div.tn-lbrow.gap", { text: "⋯" }));
      list.appendChild(el("div.tn-lbrow.me", null, [
        el("span.r", { text: String(me.rank) }), el("span.nm", { text: myName(ctx.state.profile.onlineName || "you") }), el("span.v", { text: String(me.value) })
      ]));
    }
    clear(mine);
    mine.appendChild(el("span", { text: c.count + " / " + c.total + " secrets" }));
    mine.appendChild(el("span", { text: me ? "rank #" + me.rank : "unranked" }));
  }

  async function refresh(force) {
    if (!force && Date.now() - lastFetch < 5000) { render(); return; }
    lastFetch = Date.now();
    state = "loading"; render();
    const m = await lib();
    if (!m) { state = "offline"; render(); return; }
    try {
      const r = await m.getTop(BOARD, TOP_N);
      rows = Array.isArray(r.rows) ? r.rows.slice(0, TOP_N) : [];
      me = r.me || null;
      state = r.ok ? "ok" : "offline";
    } catch (e) { state = "offline"; }
    render();
  }

  function schedule() {
    clearInterval(timer);
    if (open && !hidden) timer = setInterval(() => { if (open && !hidden && document.visibilityState !== "hidden") refresh(true); }, 60000);
  }

  function setOpen(v) {
    open = !!v; lsSet(LS_OPEN, open ? "1" : "0");
    render();
    if (open) refresh(false);
    schedule();
  }
  pill.addEventListener("click", (e) => { e.stopPropagation(); try { ctx.audio && ctx.audio.sfx && ctx.audio.sfx("ui_click"); } catch (er) { /* */ } setOpen(!open); });

  // ---- online name claim (background, never blocks)
  let claiming = null;
  function claim() {
    const prof = ctx.state.profile;
    if (!prof.name) return Promise.resolve(null);
    if (!prof.onlineName) prof.onlineName = onlineNameFor(prof.name);
    if (lsGet(LS_CLAIM) === prof.onlineName) return Promise.resolve(prof.onlineName);
    if (claiming) return claiming;
    claiming = (async () => {
      const m = await lib();
      if (!m || !m.claimName) return null;
      let cand = prof.onlineName, base = cand;
      for (let i = 0; i < 4; i++) {
        let r;
        try { r = await m.claimName(cand); } catch (e) { r = { ok: false, reason: "network" }; }
        if (r && r.ok) {
          prof.onlineName = r.name || cand;
          lsSet(LS_CLAIM, prof.onlineName);
          try { ctx.save && ctx.save.write && ctx.save.write(); } catch (e) { /* */ }
          return prof.onlineName;
        }
        const reason = r && r.reason;
        if (reason === "network") return null;              // try again next time
        if (reason === "taken" && i < 3) { cand = onlineRetryName(base); continue; }
        if ((reason === "rude" || reason === "invalid") && cand !== SPECIAL_ONLINE) { cand = base = SPECIAL_ONLINE; continue; }
        break;
      }
      prof.onlineName = cand;
      return null;
    })().finally(() => { claiming = null; });
    return claiming;
  }

  async function submit() {
    const prof = ctx.state.profile;
    if (!prof.name) return;
    const c = counts();
    const prev = parseInt(lsGet(LS_SUB) || "-1", 10);
    if (c.count <= prev && lsGet(LS_SUB + ".n") === prof.onlineName) return;
    await claim();
    const m = await lib();
    if (!m || !m.submitScore) return;
    try {
      const r = await m.submitScore(BOARD, c.count, { name: prof.onlineName || onlineNameFor(prof.name), min: 0, max: c.total || TOTAL_FALLBACK });
      if (r && (r.ok || r.queued)) { lsSet(LS_SUB, String(c.count)); lsSet(LS_SUB + ".n", prof.onlineName); }
    } catch (e) { /* offline: the lib queues */ }
    lastFetch = 0;
    if (open) refresh(true);
  }

  function setHidden(v) {
    v = !!v;
    if (v === hidden) return;
    hidden = v;
    node.classList.toggle("off", hidden);
    schedule();
  }

  render();
  if (open) refresh(true);
  schedule();

  return {
    node, refresh: () => refresh(true), render, submit, claim, setHidden, setOpen,
    get open() { return open; }
  };
}
