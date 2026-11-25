// builder/browse.js - COMMUNITY LEVELS screen. BUILDER owns (CONTRACT.md section 10).
// Browse published levels (sort newest / most played / difficulty, filter by difficulty, search), level cards with
// name, author, AI difficulty badge, theme picture / minimap, best time; a details sheet with the top-10 best-time
// leaderboard (names), play, and edit/delete for your own levels; a "My levels" tab with local drafts that work
// fully offline. Params: { open?: level id to show details for, tab?: "community" | "mine" }.
import { songInfo } from "../audio/songs/index.js";
import {
  ensureCss, esc, el, toast, fmtMs, timeAgo, badge, scaleBar, diffInfo, loadDrafts, draftLevel, drawMinimap, drawTheme,
  makeThumbCanvas, THEME_NAMES, reasonText,
} from "./common.js";

const BOARDS_KEY = "adventurecube.boards.v1";   // { id: { best, name, n, at } } summary of each level's board
const PLAYS_KEY = "adventurecube.plays.v1";     // { id: local play count }
const PREF_KEY = "adventurecube.browse.v1";     // { sort, diff, tab }
const DIFF_FILTERS = [
  { id: "all", name: "All", test: () => true }, { id: "easy", name: "1-3 Easy", test: (d) => d <= 3 },
  { id: "mid", name: "4-6 Hard", test: (d) => d >= 4 && d <= 6 }, { id: "hard", name: "7-9 Expert", test: (d) => d >= 7 && d <= 9 },
  { id: "imp", name: "10 Impossible", test: (d) => d >= 10 },
];
const SORTS = [{ id: "new", name: "Newest" }, { id: "played", name: "Most played" }, { id: "easy", name: "Easiest first" }, { id: "hard", name: "Hardest first" }];
const ICO = (p) => `<svg class="acb-ico" viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
const I_BACK = ICO('<path d="M15 5l-7 7 7 7"/>'), I_X = ICO('<path d="M6 6l12 12M18 6L6 18"/>'), I_PLAY = ICO('<path d="M7 4l13 8-13 8z"/>');
const I_REF = ICO('<path d="M20 11a8 8 0 10-2.3 5.7"/><path d="M20 4v7h-7"/>'), I_BUILD = ICO('<path d="M4 20h16M6 16l9-9 3 3-9 9H6z"/>');
const I_TROPHY = ICO('<path d="M8 4h8v5a4 4 0 01-8 0zM8 6H4a3 3 0 003 4M16 6h4a3 3 0 01-3 4M12 13v4M8 20h8"/>');

export function createBrowseScreen(app) {
  let root = null, levels = [], status = { ok: true }, loading = false, alive = 0;
  let sort = "new", diff = "all", tab = "community", query = "";
  const levelCache = new Map();      // id -> { level, meta, mine }
  let boards = {}, plays = {};
  let obs = null, queue = [], inflight = 0;
  const queued = new Set();

  const $ = (s) => root && root.querySelector(s);
  const savePrefs = () => app.storage.set(PREF_KEY, { sort, diff, tab });

  // ---- board summaries (best time, how many players) fetched lazily with low concurrency
  function want(id, prio) {
    if (queued.has(id)) return;
    const b = boards[id]; if (b && Date.now() - b.at < 60000 && !prio) return;
    queued.add(id); if (prio) queue.unshift(id); else queue.push(id);
    pump();
  }
  function pump() {
    const my = alive;
    while (inflight < 3 && queue.length) {
      const id = queue.shift(); inflight++;
      app.online.getTop(id, 50).then((r) => {
        if (my !== alive) return;
        inflight--; queued.delete(id);
        if (r.ok || (r.rows && r.rows.length)) {
          const top = r.rows[0];
          boards[id] = { best: top ? top.ms : 0, name: top ? top.name : "", n: r.rows.length, at: Date.now(), me: r.me ? r.me.ms : 0 };
          app.storage.set(BOARDS_KEY, boards);
          updateCard(id);
          if (sort === "played") resortSoon();
        }
        pump();
      });
    }
  }
  let resortT = 0;
  function resortSoon() { clearTimeout(resortT); resortT = setTimeout(() => { if (root && tab === "community") renderList(); }, 600); }
  const playsOf = (id) => (boards[id] ? boards[id].n : 0) * 4 + (plays[id] || 0);

  // ---- data
  async function load(force) {
    if (loading) return;
    loading = true; const my = alive;
    renderStatus();
    const r = await app.online.listLevels();
    loading = false;
    if (my !== alive || !root) return;
    levels = r.levels || []; status = r;
    renderStatus(); renderList();
    if (force) for (const l of levels) want(l.id);
  }
  async function getLevel(id) {
    if (levelCache.has(id)) return levelCache.get(id);
    const r = await app.online.getLevel(id);
    if (r.ok) levelCache.set(id, r);
    return r;
  }

  // ---- rendering
  function build() {
    root = el(`<div class="acbr-panel">
      <div class="acbr-head">
        <button class="acb-ib" data-a="back" title="Back">${I_BACK}</button>
        <h2>Community levels</h2><span class="acb-sp"></span>
        <button class="acb-ib" data-a="refresh" title="Refresh">${I_REF}</button>
        <button class="acb-btn primary" data-a="build">${I_BUILD}<span>Build</span></button>
      </div>
      <div class="acbr-tabs"><button data-tab="community">Community</button><button data-tab="mine">My levels</button></div>
      <div class="acbr-controls">
        <input class="acbr-q" type="search" placeholder="Search name or author" maxlength="40" aria-label="Search">
        <select class="acbr-sort" aria-label="Sort">${SORTS.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select>
        <div class="acbr-chips">${DIFF_FILTERS.map((f) => `<button data-diff="${f.id}">${f.id === "all" ? "" : `<i style="background:${diffInfo(f.id === "easy" ? 2 : f.id === "mid" ? 5 : f.id === "hard" ? 8 : 10).bg}"></i>`}${f.name}</button>`).join("")}</div>
      </div>
      <div class="acbr-status"></div>
      <div class="acbr-grid"></div>
    </div>`, "overlay acbr-root");
    root.addEventListener("click", onClick);
    root.querySelector(".acbr-q").addEventListener("input", (e) => { query = e.target.value.trim().toLowerCase(); renderList(); });
    root.querySelector(".acbr-sort").addEventListener("change", (e) => { sort = e.target.value; savePrefs(); if (sort === "played") for (const l of levels) want(l.id); renderList(); });
    app.ui.appendChild(root);
    root.querySelector(".acbr-sort").value = sort;
    obs = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((ents) => {
      for (const e of ents) if (e.isIntersecting) { const id = e.target.dataset.id; if (id) { want(id); prefetchThumb(id); } obs.unobserve(e.target); }
    }, { root: root.querySelector(".acbr-grid"), rootMargin: "120px" }) : null;
  }
  function renderTabs() {
    for (const b of root.querySelectorAll("[data-tab]")) b.classList.toggle("on", b.dataset.tab === tab);
    for (const b of root.querySelectorAll("[data-diff]")) b.classList.toggle("on", b.dataset.diff === diff);
    root.querySelector(".acbr-controls").classList.toggle("mine", tab === "mine");
  }
  function renderStatus() {
    const box = $(".acbr-status"); if (!box) return;
    if (tab === "mine") { box.innerHTML = ""; box.className = "acbr-status"; return; }
    if (loading && !levels.length) { box.className = "acbr-status"; box.innerHTML = `<span class="acb-spin"></span> Loading levels...`; return; }
    if (!status.ok) {
      const off = status.reason === "offline" || status.reason === "network";
      box.className = "acbr-status off";
      box.innerHTML = `<b>${off ? "Community server offline" : "Couldn't load levels"}</b> ${off ? (levels.length ? `Showing ${levels.length} level${levels.length > 1 ? "s" : ""} saved from your last visit.` : "You can still build levels and play your drafts in My levels.") : esc(reasonText(status))}
        <button class="acb-btn" data-a="refresh">Retry</button>`;
      return;
    }
    box.className = "acbr-status"; box.innerHTML = "";
  }
  function filtered() {
    const f = DIFF_FILTERS.find((x) => x.id === diff) || DIFF_FILTERS[0];
    let L = levels.filter((l) => f.test(l.difficulty) && (!query || l.name.toLowerCase().includes(query) || l.author.toLowerCase().includes(query)));
    if (sort === "new") L.sort((a, b) => (b.t || 0) - (a.t || 0));
    else if (sort === "played") L.sort((a, b) => playsOf(b.id) - playsOf(a.id) || (b.t || 0) - (a.t || 0));
    else if (sort === "easy") L.sort((a, b) => a.difficulty - b.difficulty || (b.t || 0) - (a.t || 0));
    else L.sort((a, b) => b.difficulty - a.difficulty || (b.t || 0) - (a.t || 0));
    return L;
  }
  function renderList() {
    if (!root) return;
    renderTabs(); renderStatus();
    const grid = $(".acbr-grid"); grid.innerHTML = "";
    if (obs) obs.disconnect();
    if (tab === "mine") return renderMine(grid);
    const L = filtered();
    if (!L.length) {
      grid.appendChild(el(levels.length ? `<p>No levels match.</p><button class="acb-btn" data-a="clearf">Clear filters</button>`
        : status.ok ? `<p><b>No community levels yet.</b></p><p class="acb-muted">Be the first: build a level, beat it, and publish it!</p><button class="acb-btn primary" data-a="build">${I_BUILD}<span>Build a level</span></button>`
        : `<p class="acb-muted">Nothing to show offline.</p><button class="acb-btn" data-a="mine">Play my drafts</button>`, "acbr-empty"));
      return;
    }
    for (const l of L) grid.appendChild(card(l));
  }
  function card(l) {
    const si = songInfo(l.music), b = boards[l.id];
    const c = el(`<div class="acbr-thumb"></div><div class="acbr-info">
        <div class="acbr-t"><b>${esc(l.name)}</b>${badge(l.difficulty)}</div>
        <small>by ${esc(l.author || "someone")}${l.mine ? ` <span class="acb-tag">you</span>` : ""}</small>
        <small class="acbr-meta">${esc(THEME_NAMES[l.theme] || l.theme)} · ${esc(si ? si.title : l.music)} · ${timeAgo(l.u || l.t)}</small>
        <small class="acbr-best">${bestText(b)}</small></div>`, "acbr-card");
    c.dataset.id = l.id; c.tabIndex = 0; c.setAttribute("role", "button"); c.setAttribute("aria-label", l.name + ", difficulty " + l.difficulty);
    c.querySelector(".acbr-thumb").appendChild(thumbFor(l));
    if (obs) obs.observe(c); else want(l.id);
    return c;
  }
  function bestText(b) {
    if (!b) return `${I_TROPHY}<span class="acb-muted">...</span>`;
    if (!b.best) return `${I_TROPHY}<span class="acb-muted">No times yet - be first!</span>`;
    return `${I_TROPHY}<b>${fmtMs(b.best)}</b> <span>${esc(b.name)}</span>${b.n > 1 ? ` <span class="acb-muted">· ${b.n} players</span>` : ""}`;
  }
  function thumbFor(l) {
    const c = levelCache.get(l.id);
    return makeThumbCanvas(160, 74, (ctx, w, h) => c ? drawMinimap(ctx, c.level, 0, 0, w, h) : drawTheme(ctx, l.theme, 0, 0, w, h));
  }
  let thumbInflight = 0; const thumbQ = [];
  function prefetchThumb(id) {
    if (levelCache.has(id)) return;
    thumbQ.push(id); pumpThumbs();
  }
  function pumpThumbs() {
    const my = alive;
    while (thumbInflight < 2 && thumbQ.length) {
      const id = thumbQ.shift(); if (levelCache.has(id)) continue;
      thumbInflight++;
      getLevel(id).then((r) => {
        if (my !== alive) return; thumbInflight--;
        if (r.ok) { const cd = root && root.querySelector(`.acbr-card[data-id="${id}"] .acbr-thumb`); const l = levels.find((x) => x.id === id); if (cd && l) { cd.innerHTML = ""; cd.appendChild(thumbFor(l)); } }
        pumpThumbs();
      });
    }
  }
  function updateCard(id) {
    const c = root && root.querySelector(`.acbr-card[data-id="${id}"] .acbr-best`); if (c) c.innerHTML = bestText(boards[id]);
    const d = root && root.querySelector(`.acbr-det[data-id="${id}"]`); if (d) fillBoard(d, id);
  }
  function renderMine(grid) {
    const drafts = loadDrafts(app.storage).list;
    const pub = levels.filter((l) => l.mine);
    grid.appendChild(el(`<h3>Drafts on this device <small class="acb-muted">play them any time, even offline</small></h3>`, "acbr-sec"));
    if (!drafts.length) grid.appendChild(el(`<p class="acb-muted">No drafts yet.</p><button class="acb-btn primary" data-a="build">${I_BUILD}<span>Build a level</span></button>`, "acbr-empty small"));
    for (const d of drafts) {
      const lv = draftLevel(d); if (!lv) continue;
      const si = songInfo(lv.music);
      const c = el(`<div class="acbr-thumb"></div><div class="acbr-info"><div class="acbr-t"><b>${esc(d.name || lv.name)}</b>${d.rating ? badge(d.rating.difficulty) : `<span class="acb-badge unrated" title="Not rated yet">?</span>`}</div>
        <small>${lv.w}x${lv.h} · ${esc(THEME_NAMES[lv.theme])} · ${esc(si ? si.title : "")}</small><small class="acbr-meta">${timeAgo(d.t)}${d.publishedId ? " · published" : ""}${d.clearMs ? " · your clear " + fmtMs(d.clearMs) : ""}</small>
        <div class="acbr-btns"><button class="acb-btn" data-playdraft="${d.id}">${I_PLAY}<span>Play</span></button><button class="acb-btn" data-editdraft="${d.id}">Edit</button></div></div>`, "acbr-card static");
      c.querySelector(".acbr-thumb").appendChild(makeThumbCanvas(160, 74, (ctx, w, h) => drawMinimap(ctx, lv, 0, 0, w, h)));
      grid.appendChild(c);
    }
    grid.appendChild(el(`<h3>Published by me</h3>`, "acbr-sec"));
    if (!pub.length) grid.appendChild(el(`<p class="acb-muted">${status.ok ? "Nothing published yet." : "Can't check while the server is offline."}</p>`, "acbr-empty small"));
    for (const l of pub) grid.appendChild(card(l));
  }

  // ---- level details sheet
  async function openDetails(id) {
    closeDetails();
    const meta = levels.find((l) => l.id === id);
    const d = el(`<div class="acb-dialog acbr-det" data-id="${esc(id)}" role="dialog"><div class="acb-dh"><h2>${esc(meta ? meta.name : "Level")}</h2><button class="acb-ib" data-a="close" title="Close">${I_X}</button></div>
      <div class="acbr-dbody"><div class="acbr-mapwrap"><div class="acbr-map"></div></div><div class="acbr-dinfo"><p class="acb-muted">Loading level...</p></div></div>
      <h3>${I_TROPHY} Best times</h3><div class="acbr-board"><span class="acb-spin"></span></div>
      <div class="acb-row end acbr-dbtns"></div></div>`, "acb-modal");
    d.addEventListener("pointerdown", (e) => { if (e.target === d) closeDetails(); });
    d.addEventListener("click", onClick);
    root.appendChild(d);
    const sheet = d.querySelector(".acbr-det");
    const mapBox = d.querySelector(".acbr-map");
    if (meta) mapBox.appendChild(makeThumbCanvas(560, 150, (c, w, h) => drawTheme(c, meta.theme, 0, 0, w, h)));
    want(id, true);
    fillBoard(sheet, id);
    const r = await getLevel(id);
    if (!d.isConnected) return;
    const info = d.querySelector(".acbr-dinfo");
    if (!r.ok) {
      info.innerHTML = `<p><b>Couldn't load this level.</b></p><p class="acb-muted">${esc(reasonText(r))}</p>`;
      d.querySelector(".acbr-dbtns").innerHTML = `<button class="acb-btn" data-a="close">Close</button><button class="acb-btn" data-open="${esc(id)}">Retry</button>`;
      return;
    }
    const L = r.level, m = Object.assign({}, r.meta, meta || {}), si = songInfo(L.music);
    d.querySelector("h2").textContent = L.name;
    mapBox.innerHTML = ""; mapBox.appendChild(makeThumbCanvas(560, 150, (c, w, h) => drawMinimap(c, L, 0, 0, w, h)));
    info.innerHTML = `<div class="acbr-drow">${badge(m.difficulty, { big: true })}<div><p>by <b>${esc(L.author || "someone")}</b>${r.mine ? ` <span class="acb-tag">you</span>` : ""}</p>
      <p class="acb-muted small">${esc(THEME_NAMES[L.theme] || L.theme)} · ${esc(si ? si.title : L.music)} · ${L.w}x${L.h} · ${L.checkpoints.length} checkpoint${L.checkpoints.length === 1 ? "" : "s"}${m.u || m.t ? " · " + timeAgo(m.u || m.t) : ""}</p></div></div>
      ${scaleBar(m.difficulty)}`;
    d.querySelector(".acbr-dbtns").innerHTML = (r.mine ? `<button class="acb-btn danger" data-del="${esc(id)}">Delete</button><button class="acb-btn" data-edit="${esc(id)}">Edit</button>` : "") +
      `<button class="acb-btn primary" data-play="${esc(id)}">${I_PLAY}<span>Play</span></button>`;
    const pb = d.querySelector("[data-play]"); if (pb) pb.focus({ preventScroll: true });
  }
  async function fillBoard(sheet, id) {
    const box = sheet.querySelector(".acbr-board"); if (!box) return;
    const r = await app.online.getTop(id, 10);
    if (!box.isConnected) return;
    if (!r.ok && !(r.rows && r.rows.length)) { box.innerHTML = `<p class="acb-muted">Leaderboard offline.</p>`; return; }
    if (!r.rows.length) { box.innerHTML = `<p class="acb-muted">No times yet. Beat it to claim the top spot!</p>`; return; }
    box.innerHTML = `<ol class="acbr-top">${r.rows.map((x) => `<li class="${x.me ? "me" : ""} r${x.rank}"><span class="rk">${x.rank}</span><span class="nm">${esc(x.name)}${x.me ? " (you)" : ""}</span><span class="tm">${fmtMs(x.ms)}</span></li>`).join("")}</ol>` +
      (r.me && !r.rows.some((x) => x.me) ? `<p class="acb-muted small">Your best: #${r.me.rank} · ${fmtMs(r.me.ms)}</p>` : "") + (r.stale ? `<p class="acb-muted small">(saved copy - offline)</p>` : "");
  }
  function closeDetails() { const d = root && root.querySelector(".acb-modal"); if (d) d.remove(); }

  async function play(id) {
    const r = await getLevel(id);
    if (!r.ok) { toast(root, reasonText(r), "err"); return; }
    plays[id] = (plays[id] || 0) + 1; app.storage.set(PLAYS_KEY, plays);
    delete boards[id]; // refresh its best time when we come back
    app.playLevel(r.level, { key: id, onExit: () => app.show("browse", { open: id }) });
  }

  async function onClick(e) {
    const b = e.target.closest("button,[data-id].acbr-card"); if (!b || b.disabled) return;
    app.audio.unlock();
    if (b.classList.contains("acbr-card")) { if (!b.classList.contains("static")) { app.audio.sfx("click"); openDetails(b.dataset.id); } return; }
    app.audio.sfx("click");
    const a = b.dataset.a;
    if (a === "back") return app.show("title");
    if (a === "build") return app.show("builder", {});
    if (a === "refresh") { levelCache.clear(); boards = {}; return load(true); }
    if (a === "close") return closeDetails();
    if (a === "clearf") { diff = "all"; query = ""; $(".acbr-q").value = ""; savePrefs(); return renderList(); }
    if (a === "mine") { tab = "mine"; savePrefs(); return renderList(); }
    if (b.dataset.tab) { tab = b.dataset.tab; savePrefs(); return renderList(); }
    if (b.dataset.diff) { diff = b.dataset.diff; savePrefs(); return renderList(); }
    if (b.dataset.open) return openDetails(b.dataset.open);
    if (b.dataset.play) { b.disabled = true; return play(b.dataset.play); }
    if (b.dataset.edit) {
      const r = await getLevel(b.dataset.edit);
      if (r.ok) app.show("builder", { level: r.level, publishedId: b.dataset.edit, meta: r.meta }); else toast(root, reasonText(r), "err");
      return;
    }
    if (b.dataset.del) {
      const l = levels.find((x) => x.id === b.dataset.del);
      if (!confirm(`Delete "${l ? l.name : "this level"}" from the community? Its leaderboard is deleted too. Your local draft stays.`)) return;
      b.disabled = true;
      const r = await app.online.deleteLevel(b.dataset.del);
      if (!r.ok) { b.disabled = false; toast(root, reasonText(r), "err"); return; }
      toast(root, "Level deleted"); closeDetails(); levelCache.delete(b.dataset.del); levels = levels.filter((x) => x.id !== b.dataset.del); renderList();
      return;
    }
    if (b.dataset.playdraft) {
      const d = loadDrafts(app.storage).list.find((x) => x.id === b.dataset.playdraft); const lv = d && draftLevel(d);
      if (lv) app.playLevel(lv, { key: null, onExit: () => app.show("browse", { tab: "mine" }) });
      return;
    }
    if (b.dataset.editdraft) return app.show("builder", { draftId: b.dataset.editdraft });
  }
  function onKey(e) {
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) { if (e.code === "Escape") e.target.blur(); return; }
    if (e.code === "Escape") { if (root.querySelector(".acb-modal")) closeDetails(); else app.show("title"); }
    if ((e.code === "Enter" || e.code === "Space") && e.target.classList && e.target.classList.contains("acbr-card")) { e.preventDefault(); e.target.click(); }
  }

  return {
    enter(p = {}) {
      ensureCss(); alive++;
      const pr = app.storage.get(PREF_KEY, {}) || {};
      sort = SORTS.some((s) => s.id === pr.sort) ? pr.sort : "new";
      diff = DIFF_FILTERS.some((s) => s.id === pr.diff) ? pr.diff : "all";
      tab = p.tab === "mine" || p.tab === "community" ? p.tab : pr.tab === "mine" ? "mine" : "community";
      boards = app.storage.get(BOARDS_KEY, {}) || {}; plays = app.storage.get(PLAYS_KEY, {}) || {};
      queue = []; queued.clear(); inflight = 0; thumbQ.length = 0; thumbInflight = 0;
      build(); renderList();
      window.addEventListener("keydown", onKey);
      load(false).then(() => { if (p.open && root) openDetails(p.open); });
      if (p.open && !levels.length) { /* opened once the list arrives */ }
    },
    exit() {
      alive++;
      window.removeEventListener("keydown", onKey);
      if (obs) obs.disconnect(); obs = null;
      clearTimeout(resortT);
      if (root) root.remove(); root = null;
    },
    frame(dt, now) { app.drawBackdrop(dt, now); },
  };
}
