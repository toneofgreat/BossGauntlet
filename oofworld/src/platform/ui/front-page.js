// src/platform/ui/front-page.js — the FRONT PAGE: what a player sees the moment OofWorld
// has loaded, and where every Place returns to. Spec 06 §5.7 (amended 2026-11-12, which
// retired the 3D Hub Place) owns this file.
//
// It is plain, scrollable HTML over the (idle) stage, top to bottom:
//   1. a slim header — the wordmark, your name and the platform doors the Hub used to
//      hold as buildings (Catalog, Badges, the published-games browser, Settings, sign-in)
//   2. ★ FAVORITES — the games you starred, at the very top
//   3. 🤝 FRIENDS — who is online and where; tap one for Join
//   4. 🎮 ALL GAMES — every game on OofWorld, MOST popular first by TRUE unique visits
//   5. 🧍 CUSTOMIZE YOUR CHARACTER — the avatar editor, mounted inline, hair included
//
// Honesty (ARCHITECTURE §9): every number on this page is the server's. With no server, or
// a server too old to count built-in Places, it SAYS so and shows the default order — a
// visit count or a player count is never invented, estimated or padded.
//
// This module never imports a service: the shell hands it everything in `deps`, so it
// stays a view and the shell stays the one place that knows how to travel.

import { el, button } from "./kit.js";
import { gameThumb } from "./game-thumb.js";
import { avatarThumb } from "./avatar-thumb.js";
import { friendWhereabouts } from "./friends-panel.js";

const REFRESH_MS = 30000;       // popularity + friends re-fetch while the page is up
const FETCH_TIMEOUT_MS = 8000;  // a slow server must not leave "Loading…" up forever
const STYLE_ID = "oof-front-style";
const THUMB_W = 132;
const THUMB_H = 92;

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("The server took too long to answer.")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// The new services (placeVisits / rooms) may answer `{ visits: {...} }` or the bare map;
// both are accepted, and anything else is "no data" rather than a guess.
function countMap(out, field) {
  const m = out && typeof out === "object" && out[field] && typeof out[field] === "object" ? out[field] : out;
  if (!m || typeof m !== "object" || Array.isArray(m)) return null;
  const clean = {};
  for (const [k, v] of Object.entries(m)) {
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0) clean[k] = Math.floor(n);
  }
  return clean;
}

function plural(n, one, many) {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#oof-front{position:fixed;inset:0;z-index:90;overflow-y:auto;overflow-x:hidden;
  -webkit-overflow-scrolling:touch;overscroll-behavior:contain;
  background:radial-gradient(1200px 600px at 50% -200px,#1f3a5a 0%,rgba(23,25,28,0) 70%),var(--oof-bg);
  color:var(--oof-text);font-family:var(--oof-font-stack);
  padding:calc(64px + env(safe-area-inset-top)) 0 calc(40px + env(safe-area-inset-bottom))}
#oof-front[hidden]{display:none}
.oof-front-topfade{position:fixed;left:0;right:0;top:0;height:calc(64px + env(safe-area-inset-top));
  z-index:1;pointer-events:none;
  background:linear-gradient(180deg,rgba(23,25,28,.96) 0%,rgba(23,25,28,.9) 70%,rgba(23,25,28,0) 100%)}
#oof-front canvas{touch-action:pan-y;width:auto;height:auto;flex:none}
.oof-front-inner{max-width:880px;margin:0 auto;padding:0 16px;box-sizing:border-box}
.oof-front-hero{display:flex;flex-direction:column;gap:10px;padding:8px 0 4px}
.oof-front-mark{font-size:34px;font-weight:var(--oof-weight-display);letter-spacing:-1px;line-height:1}
.oof-front-mark span{color:var(--oof-primary)}
.oof-front-hello{color:var(--oof-text-dim);font-size:var(--oof-size-md)}
.oof-front-chips{display:flex;gap:8px;flex-wrap:wrap}
.oof-front-chip{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;
  border-radius:999px;border:1px solid var(--oof-stroke);background:var(--oof-surface);
  color:var(--oof-text);font:inherit;font-size:var(--oof-size-sm);font-weight:600;cursor:pointer}
.oof-front-chip:hover{filter:brightness(1.15)}
.oof-front-section{margin-top:26px}
.oof-front-h{display:flex;align-items:baseline;gap:10px;margin:0 0 10px;font-size:20px;
  font-weight:var(--oof-weight-display)}
.oof-front-h small{font-size:var(--oof-size-sm);font-weight:400;color:var(--oof-text-dim)}
.oof-front-note{font-size:var(--oof-size-sm);color:var(--oof-text-dim);margin:-2px 0 10px}
.oof-front-empty{padding:16px;border-radius:var(--oof-radius-md);border:1px dashed var(--oof-stroke);
  color:var(--oof-text-dim);text-align:center;font-size:var(--oof-size-sm);
  display:flex;flex-direction:column;align-items:center;gap:10px}
.oof-front-list{display:flex;flex-direction:column;gap:10px}
.oof-gcard{display:flex;gap:12px;align-items:stretch;padding:10px;border-radius:var(--oof-radius-lg);
  background:linear-gradient(180deg,var(--oof-surface),#202327);border:1px solid var(--oof-stroke);
  box-shadow:0 6px 18px rgba(0,0,0,.25);transition:transform 120ms ease,border-color 120ms ease}
.oof-gcard:hover{border-color:#566070;transform:translateY(-1px)}
.oof-gcard-thumb{position:relative;flex:none;border-radius:var(--oof-radius-md);overflow:hidden;
  width:${THUMB_W}px;height:${THUMB_H}px;background:var(--oof-surface2)}
.oof-gcard-rank{position:absolute;left:6px;top:6px;padding:2px 7px;border-radius:999px;
  background:rgba(0,0,0,.6);font-size:12px;font-weight:800}
.oof-gcard-mid{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.oof-gcard-name{font-weight:800;font-size:17px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.oof-gcard-by{font-size:12px;color:var(--oof-text-dim)}
.oof-gcard-desc{font-size:var(--oof-size-sm);color:var(--oof-text-dim);overflow:hidden;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.oof-gcard-stats{display:flex;gap:10px;flex-wrap:wrap;font-size:12px;color:var(--oof-text);margin-top:auto}
.oof-gcard-stats span{opacity:.9}
.oof-gcard-side{flex:none;display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end;gap:8px}
.oof-star{width:40px;height:40px;border-radius:50%;border:1px solid var(--oof-stroke);
  background:var(--oof-surface2);color:var(--oof-text-dim);font-size:20px;cursor:pointer;line-height:1}
.oof-star.is-on{color:#ffd23f;border-color:#ffd23f;background:rgba(255,210,63,.12)}
.oof-play{min-width:84px;height:40px;border-radius:12px;border:0;cursor:pointer;font:inherit;
  font-weight:800;font-size:15px;color:#fff;background:linear-gradient(180deg,#22b0ff,#0084d1);
  box-shadow:0 3px 0 #005f99}
.oof-play:active{transform:translateY(2px);box-shadow:0 1px 0 #005f99}
.oof-play[disabled]{opacity:.45;cursor:default}
.oof-front-search{width:100%;box-sizing:border-box;padding:10px 12px;margin-bottom:10px;
  border-radius:var(--oof-radius-md);border:1px solid var(--oof-stroke);background:var(--oof-surface);
  color:var(--oof-text);font:inherit}
.oof-friend{border-radius:var(--oof-radius-md);background:var(--oof-surface);border:1px solid var(--oof-stroke)}
.oof-friend-row{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border:0;
  background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:52px}
.oof-friend-name{font-weight:700}
.oof-friend-where{font-size:12px;color:var(--oof-text-dim)}
.oof-dot{width:10px;height:10px;border-radius:50%;flex:none;background:#6b7280}
.oof-dot.is-on{background:var(--oof-success);box-shadow:0 0 8px var(--oof-success)}
.oof-friend-more{padding:0 12px 12px 12px;display:flex;flex-direction:column;gap:8px;font-size:var(--oof-size-sm)}
.oof-friend-btns{display:flex;gap:8px;flex-wrap:wrap}
/* No fixed height and no overflow here: the inline customizer flows with the page (its
   preview and tab row are position:sticky against #oof-front), so a clipping box would
   both hide every tile past the first rows and stop the sticky parts from sticking. */
.oof-front-editor{position:relative;border-radius:var(--oof-radius-lg);
  border:1px solid var(--oof-stroke);background:#0c0e14}
.oof-front-fallback{display:flex;align-items:center;gap:16px;padding:16px;flex-wrap:wrap;
  border-radius:var(--oof-radius-lg);border:1px solid var(--oof-stroke);background:var(--oof-surface)}
.oof-front-foot{margin-top:28px;text-align:center;font-size:12px;color:var(--oof-text-dim)}
@media (max-width:520px){
  .oof-gcard{padding:8px;gap:10px}
  .oof-gcard-thumb{width:96px;height:72px}
  .oof-gcard-name{font-size:15px}
  .oof-gcard-desc{-webkit-line-clamp:2;font-size:12px}
  .oof-play{min-width:64px}
}
.oof-reduced-motion .oof-gcard{transition:none}
.oof-reduced-motion .oof-gcard:hover{transform:none}
`;
  document.head.appendChild(style);
}

// createFrontPage(deps) -> { el, show, hide, isShown, refresh, debug }
//
// deps (all supplied by shell.js):
//   places()                -> visible built-in Place rows { slug, name, icon, portalColor, description }
//   externals()             -> [{ key, name, icon, color, description, open() }] — games that live
//                              outside OofWorld (Brick Legend), counted under `key`
//   games, account, friends -> the spec 14/15 services (any may be unavailable offline)
//   avatar                  -> the avatar service (getState/onChange) for the fallback thumb
//   badges                  -> { all() } for the Badges list
//   favorites               -> { get() -> [{ key, name, icon }], set(list) } (saves-backed)
//   playPlace(slug)         -> record the visit and enter a built-in Place
//   playPublished(game)     -> enter a published Oof Studio game ({ id, name })
//   joinFriend(friend, target)
//   openCatalog(tab), openSettings(), openGamesBrowser(), openFriendsPanel(), openSignIn(),
//   openPanel(opts)         -> the shell's panel (for the Badges list)
//   mountEditor(container)  -> a handle with dispose()/close(), or null when the avatar
//                              editor cannot mount inline (then a fallback card is shown)
//   toast(text)
export function createFrontPage(deps = {}) {
  injectStyle();
  const toast = (msg) => { if (typeof deps.toast === "function") deps.toast(msg); };

  const root = el("div", "oof-front");
  root.id = "oof-front";
  root.setAttribute("data-oof", "front-page");
  root.setAttribute("role", "main");
  root.setAttribute("aria-label", "OofWorld front page");
  root.hidden = true;
  // The HUD floats over this page; cards scrolling under its icons would make both
  // unreadable, so the page keeps a solid band behind the HUD's strip.
  const topFade = el("div", "oof-front-topfade");
  topFade.setAttribute("aria-hidden", "true");
  const inner = el("div", "oof-front-inner");
  root.append(topFade, inner);

  // ---- header ---------------------------------------------------------------------
  const hero = el("div", "oof-front-hero");
  const mark = el("div", "oof-front-mark");
  mark.append(el("span", null, "Oof"), document.createTextNode("World"));
  const hello = el("div", "oof-front-hello", "");
  const chips = el("div", "oof-front-chips");
  hero.append(mark, hello, chips);

  function chip(label, onClick, aria) {
    const b = el("button", "oof-front-chip", label);
    b.type = "button";
    b.setAttribute("aria-label", aria || label);
    b.addEventListener("click", onClick);
    return b;
  }

  // ---- sections -------------------------------------------------------------------
  function section(id, title) {
    const s = el("section", "oof-front-section");
    s.id = id;
    const h = el("h2", "oof-front-h");
    const t = el("span", null, title);
    const small = el("small", null, "");
    h.append(t, small);
    s.appendChild(h);
    return { el: s, small };
  }

  const favSec = section("oof-front-favorites", "★ Favorites");
  const favList = el("div", "oof-front-list");
  favSec.el.appendChild(favList);

  const friendSec = section("oof-front-friends", "🤝 Friends");
  const friendBody = el("div", "oof-front-list");
  friendSec.el.appendChild(friendBody);

  const gamesSec = section("oof-front-games", "🎮 All games");
  const gamesNote = el("div", "oof-front-note", "");
  gamesNote.setAttribute("data-oof", "popularity-note");
  const search = el("input", "oof-front-search");
  search.type = "search";
  search.placeholder = "Filter games by name…";
  search.setAttribute("aria-label", "Filter games");
  // The engine and the chat hotkey listen on the document; a text box eats its own keys.
  for (const evt of ["keydown", "keyup", "keypress"]) search.addEventListener(evt, (e) => e.stopPropagation());
  const gamesList = el("div", "oof-front-list");
  const gamesMore = el("div", "oof-front-note", "");
  gamesSec.el.append(gamesNote, search, gamesList, gamesMore);

  const avatarSec = section("oof-front-avatar", "🧍 Customize your character");
  const avatarNote = el("div", "oof-front-note",
    "Hats, faces, colours, gear — and cool hair. Everything you wear goes with you into every game.");
  const editorHost = el("div", null);
  avatarSec.el.append(avatarNote, editorHost);

  const foot = el("div", "oof-front-foot",
    "Everything here is real: every visit and player count comes from the server, and nobody is invented.");

  inner.append(hero, favSec.el, friendSec.el, gamesSec.el, avatarSec.el, foot);
  document.body.appendChild(root);

  // ---- state ----------------------------------------------------------------------
  let shown = false;
  let refreshTimer = null;
  let seq = 0;
  const pop = {
    status: "idle",     // idle | offline | loading | ok | partial | error
    placeVisits: null,  // { slug: n } — built-ins + externals
    rooms: null,        // { slug|studio-<id>: n } live room sizes
    published: null,    // [game] from games.list("", "visits")
    publishedTotal: 0,
    message: "",
  };
  const fr = { status: "idle", list: [], incoming: [], message: "" };
  const expanded = new Set();
  let query = "";
  let editorHandle = null;
  let editorObserver = null;
  let fallbackOff = null;

  // ---- favorites (saves-backed, through deps) -------------------------------------
  function favorites() {
    try {
      const list = deps.favorites && deps.favorites.get ? deps.favorites.get() : [];
      return Array.isArray(list) ? list.filter((f) => f && typeof f.key === "string") : [];
    } catch {
      return [];
    }
  }
  function isFavorite(key) {
    return favorites().some((f) => f.key === key);
  }
  function toggleFavorite(entry) {
    const list = favorites();
    const i = list.findIndex((f) => f.key === entry.key);
    if (i >= 0) list.splice(i, 1);
    else list.unshift({ key: entry.key, name: entry.name, icon: entry.icon, by: entry.author || null });
    try {
      if (deps.favorites && deps.favorites.set) deps.favorites.set(list);
    } catch (err) {
      toast("Could not save your favorites.");
      console.warn("[oof] favorites not saved", err);
    }
    renderGames();
    renderFavorites();
  }

  // ---- the catalogue of entries ---------------------------------------------------
  function builtInRows() {
    try { return (deps.places ? deps.places() : []) || []; } catch { return []; }
  }
  function externalRows() {
    try { return (deps.externals ? deps.externals() : []) || []; } catch { return []; }
  }

  function allEntries() {
    const out = [];
    let order = 0;
    for (const p of builtInRows()) {
      out.push({
        key: p.slug, kind: "place", slug: p.slug, name: p.name, icon: p.icon,
        color: p.portalColor || null, description: p.description || "",
        author: "OofWorld", roomKey: p.slug, countKey: p.slug, order: order++,
      });
    }
    for (const x of externalRows()) {
      out.push({
        key: x.key, kind: "external", name: x.name, icon: x.icon, color: x.color || null,
        description: x.description || "", author: x.author || "platyfy", roomKey: null,
        countKey: x.key, order: order++, open: x.open,
      });
    }
    for (const g of pop.published || []) {
      out.push({
        key: "studio-" + g.id, kind: "published", game: g, name: g.name, icon: "🎮",
        color: null, description: "Made in Oof Studio.", author: g.authorName || "someone",
        roomKey: "studio-" + g.id, countKey: null, order: order++,
        publishedVisits: Number.isFinite(Number(g.visits)) ? Number(g.visits) : null,
        visibility: g.visibility || "everyone",
      });
    }
    for (const e of out) {
      e.visits = e.kind === "published"
        ? e.publishedVisits
        : pop.placeVisits && Object.hasOwn(pop.placeVisits, e.countKey) ? pop.placeVisits[e.countKey] : null;
      // A built-in Place's room is always reported (a true 0 included), so a missing key
      // means a server that does not count this Place: no number, rather than a made-up 0.
      // A published game's room is reported only while somebody is in it, so for those
      // absence IS the true 0.
      e.live = !pop.rooms || !e.roomKey ? null
        : Object.hasOwn(pop.rooms, e.roomKey) ? pop.rooms[e.roomKey]
        : e.kind === "published" ? 0 : null;
    }
    return out;
  }

  // MOST popular first by true unique visits, live players as the tiebreak, then the
  // default order. Without built-in counts the two kinds of number are not comparable,
  // so built-ins keep their default order and published games follow, by their own
  // (server-ranked) visits.
  function ranked(entries) {
    const byDefault = (a, b) => a.order - b.order;
    if (pop.placeVisits) {
      return entries.slice().sort((a, b) =>
        (b.visits || 0) - (a.visits || 0)
        || (b.live === null ? -1 : b.live) - (a.live === null ? -1 : a.live)
        || byDefault(a, b));
    }
    return entries.slice().sort(byDefault);
  }

  function matches(e) {
    if (!query) return true;
    const q = query.toLowerCase();
    return [e.name, e.author, e.description].some((s) => String(s || "").toLowerCase().includes(q));
  }

  // ---- open ---------------------------------------------------------------------
  function openEntry(e) {
    if (e.kind === "place" && typeof deps.playPlace === "function") deps.playPlace(e.slug);
    else if (e.kind === "published" && typeof deps.playPublished === "function") deps.playPublished(e.game);
    else if (e.kind === "external" && typeof e.open === "function") e.open();
  }

  // ---- card -----------------------------------------------------------------------
  function card(e, rank) {
    const c = el("article", "oof-gcard");
    c.setAttribute("data-key", e.key);
    const thumb = el("div", "oof-gcard-thumb");
    const narrow = typeof window !== "undefined" && window.innerWidth <= 520;
    const canvas = gameThumb({
      key: e.key, icon: e.icon, color: e.color,
      width: narrow ? 96 : THUMB_W, height: narrow ? 72 : THUMB_H,
    });
    canvas.className = "oof-thumb";
    thumb.appendChild(canvas);
    if (rank) thumb.appendChild(el("div", "oof-gcard-rank", "#" + rank));

    const mid = el("div", "oof-gcard-mid");
    mid.appendChild(el("div", "oof-gcard-name", `${e.icon || ""} ${e.name}`.trim()));
    let by = `by ${e.author}`;
    if (e.kind === "external") by += " · opens in a new tab";
    if (e.visibility === "friends") by += " · 🤝 friends only";
    mid.appendChild(el("div", "oof-gcard-by", by));
    if (e.description) mid.appendChild(el("div", "oof-gcard-desc", e.description));
    const stats = el("div", "oof-gcard-stats");
    if (e.visits !== null && e.visits !== undefined) {
      stats.appendChild(el("span", null, "👣 " + plural(e.visits, "visit", "visits")));
    }
    if (e.live !== null && e.live !== undefined) {
      stats.appendChild(el("span", null, (e.live > 0 ? "🟢 " : "⚪ ") + `${e.live.toLocaleString("en-US")} playing now`));
    }
    if (stats.childNodes.length) mid.appendChild(stats);

    const side = el("div", "oof-gcard-side");
    const fav = isFavorite(e.key);
    const star = el("button", "oof-star" + (fav ? " is-on" : ""), fav ? "★" : "☆");
    star.type = "button";
    star.setAttribute("aria-pressed", fav ? "true" : "false");
    star.setAttribute("aria-label", (fav ? "Remove " : "Add ") + e.name + (fav ? " from favorites" : " to favorites"));
    star.setAttribute("data-oof", "star");
    star.addEventListener("click", (ev) => { ev.stopPropagation(); toggleFavorite(e); });
    const play = el("button", "oof-play", e.kind === "external" ? "OPEN" : "PLAY");
    play.type = "button";
    play.setAttribute("aria-label", "Play " + e.name);
    play.setAttribute("data-oof", "play");
    play.addEventListener("click", (ev) => { ev.stopPropagation(); openEntry(e); });
    side.append(star, play);

    c.append(thumb, mid, side);
    return c;
  }

  // A favorite whose game is not in the current list (a published game outside the
  // top 100, or one listed while the server was reachable) still gets a card, built
  // from what was saved when it was starred — with no numbers, since none are known.
  function savedCard(f) {
    const m = /^studio-(.+)$/.exec(f.key);
    const e = {
      key: f.key, kind: m ? "published" : "missing", name: f.name || "A saved game",
      icon: f.icon || "🎮", color: null, author: f.by || "someone",
      description: m ? "Made in Oof Studio." : "This game is not on OofWorld any more.",
      visits: null, live: null, game: m ? { id: m[1], name: f.name } : null,
    };
    const c = card(e, 0);
    if (e.kind === "missing") {
      const play = c.querySelector(".oof-play");
      if (play) { play.disabled = true; play.title = "Not available"; }
    }
    return c;
  }

  function emptyBox(text, actions = []) {
    const box = el("div", "oof-front-empty");
    box.appendChild(el("div", null, text));
    if (actions.length) {
      const row = el("div", "oof-friend-btns");
      for (const a of actions) row.appendChild(a);
      box.appendChild(row);
    }
    return box;
  }

  // ---- renderers ------------------------------------------------------------------
  function renderHeader() {
    const acc = deps.account;
    let who = "";
    try { who = acc && acc.signedIn() ? acc.username() : ""; } catch { who = ""; }
    hello.textContent = who ? `Hi, ${who}! Pick a game, or keep scrolling.` : "Pick a game, or keep scrolling.";
    chips.replaceChildren();
    chips.appendChild(chip("🛍️ Catalog", () => deps.openCatalog && deps.openCatalog("avatar"), "Open the Catalog"));
    let badgeLabel = "🏅 Badges";
    try {
      const all = deps.badges && deps.badges.all ? deps.badges.all() : [];
      const earned = all.filter((b) => b.earned).length;
      if (all.length) badgeLabel = `🏅 Badges ${earned}/${all.length}`;
    } catch { /* badges are a nicety here */ }
    chips.appendChild(chip(badgeLabel, openBadges, "Badges"));
    chips.appendChild(chip("🔎 Search published games", () => deps.openGamesBrowser && deps.openGamesBrowser()));
    chips.appendChild(chip("⚙️ Settings", () => deps.openSettings && deps.openSettings(), "Settings"));
    try {
      if (acc && acc.available() && !acc.signedIn()) {
        chips.appendChild(chip("🔑 Sign in", () => deps.openSignIn && deps.openSignIn()));
      }
    } catch { /* no account service, no chip */ }
  }

  function openBadges() {
    if (typeof deps.openPanel !== "function") return;
    const panel = deps.openPanel({ title: "Badges" });
    if (!panel || !panel.bodyEl) return;
    let all = [];
    try { all = deps.badges && deps.badges.all ? deps.badges.all() : []; } catch { all = []; }
    const earned = all.filter((b) => b.earned).length;
    const head = el("div", "oof-front-note", `You have ${earned} of ${all.length} Badges.`);
    const grid = el("div", null);
    grid.setAttribute("style", "display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px");
    for (const b of all) {
      const secret = (b.secret || b.hidden) && !b.earned;
      const t = el("div", null);
      t.setAttribute("style",
        "padding:10px;border-radius:var(--oof-radius-md);background:var(--oof-surface2);"
        + "display:flex;flex-direction:column;gap:4px;" + (b.earned ? "" : "opacity:.55;"));
      t.appendChild(el("div", null, `${secret ? "❔" : b.icon || "🏅"} ${secret ? "Secret badge" : b.name}`));
      const d = el("div", null, secret ? "Keep playing to find out." : b.description || "");
      d.setAttribute("style", "font-size:12px;color:var(--oof-text-dim)");
      t.appendChild(d);
      if (b.earned) {
        const when = el("div", null, "✅ Earned");
        when.setAttribute("style", "font-size:12px;color:var(--oof-success)");
        t.appendChild(when);
      }
      grid.appendChild(t);
    }
    panel.bodyEl.append(head, grid);
  }

  function renderFavorites() {
    const favs = favorites();
    favSec.small.textContent = favs.length ? String(favs.length) : "";
    favList.replaceChildren();
    if (!favs.length) {
      favList.appendChild(emptyBox("Tap ☆ on any game below and it stays up here, at the very top."));
      return;
    }
    const byKey = new Map(allEntries().map((e) => [e.key, e]));
    for (const f of favs) {
      const e = byKey.get(f.key);
      favList.appendChild(e ? card(e, 0) : savedCard(f));
    }
  }

  function popularityNote() {
    switch (pop.status) {
      case "offline": return "Popularity unavailable offline — showing default order.";
      case "loading": return "Loading popularity…";
      case "error": return `Popularity unavailable right now (${pop.message}) — showing default order.`;
      case "partial":
        return "Visit counts for OofWorld's own games are unavailable on this server — showing default order."
          + (pop.rooms ? "" : " Live player counts unavailable.");
      case "ok":
        return "Most popular first, by unique visits (one person = one visit), then by who is playing right now."
          + (pop.rooms ? "" : " Live player counts unavailable.");
      default: return "";
    }
  }

  function renderGames() {
    gamesNote.textContent = popularityNote();
    const entries = ranked(allEntries()).filter(matches);
    gamesSec.small.textContent = String(entries.length);
    gamesList.replaceChildren();
    if (!entries.length) {
      gamesList.appendChild(emptyBox(`Nothing matches “${query}”.`));
    }
    entries.forEach((e, i) => gamesList.appendChild(card(e, query ? 0 : i + 1)));
    if (pop.published && pop.publishedTotal > pop.published.length) {
      gamesMore.textContent = `Showing the top ${pop.published.length} of ${pop.publishedTotal} published games — `
        + "use 🔎 Search published games for the rest.";
    } else if (pop.status === "offline") {
      gamesMore.textContent = "Published Oof Studio games appear here when a server is set up (Settings → MULTIPLAYER).";
    } else {
      gamesMore.textContent = "";
    }
  }

  function publishedNameLookup(id) {
    if (!pop.published) return undefined;
    const g = pop.published.find((x) => x.id === id);
    return g && (g.visibility || "everyone") === "everyone" ? g.name : null;
  }
  function placeNameLookup(slug) {
    const row = builtInRows().find((p) => p.slug === slug);
    return row ? row.name : null;
  }

  function renderFriends() {
    friendBody.replaceChildren();
    const acc = deps.account;
    const settingsBtn = button({ label: "Settings", variant: "secondary", onClick: () => deps.openSettings && deps.openSettings() });
    let available = false;
    let signedIn = false;
    try { available = !!(acc && acc.available()); signedIn = !!(acc && acc.signedIn()); } catch { /* treat as offline */ }
    if (!available) {
      friendSec.small.textContent = "";
      friendBody.appendChild(emptyBox(
        "Friends need the OofWorld server, and none is set up here. Add one in Settings → MULTIPLAYER.",
        [settingsBtn]));
      return;
    }
    if (!signedIn) {
      friendSec.small.textContent = "";
      friendBody.appendChild(emptyBox("Sign in to see your friends, where they are, and join them.",
        [button({ label: "Sign in", variant: "primary", onClick: () => deps.openSignIn && deps.openSignIn() })]));
      return;
    }
    if (fr.status === "loading" && !fr.list.length) {
      friendBody.appendChild(emptyBox("Loading your friends…"));
      return;
    }
    if (fr.status === "error") {
      friendSec.small.textContent = "";
      friendBody.appendChild(emptyBox(`Could not load your friends: ${fr.message}`,
        [button({ label: "Try again", variant: "secondary", onClick: () => loadFriends() })]));
      return;
    }
    const online = fr.list.filter((f) => f.online).length;
    friendSec.small.textContent = fr.list.length ? `${online} of ${fr.list.length} online` : "";
    const manage = button({ label: "Manage friends", variant: "secondary", onClick: () => deps.openFriendsPanel && deps.openFriendsPanel() });
    if (fr.incoming.length) {
      const req = button({
        label: `📬 ${plural(fr.incoming.length, "friend request", "friend requests")} waiting`,
        variant: "primary",
        onClick: () => deps.openFriendsPanel && deps.openFriendsPanel(),
      });
      friendBody.appendChild(req);
    }
    if (!fr.list.length) {
      friendBody.appendChild(emptyBox("No friends yet. Open 👥 Players in any game to send somebody a request.", [manage]));
      return;
    }
    const lookup = { placeName: placeNameLookup, publishedName: publishedNameLookup };
    const sorted = fr.list.slice().sort((a, b) =>
      (b.online ? 1 : 0) - (a.online ? 1 : 0) || String(a.username).localeCompare(String(b.username)));
    for (const f of sorted) friendBody.appendChild(friendRow(f, lookup));
    const tail = el("div", "oof-friend-btns");
    tail.appendChild(manage);
    friendBody.appendChild(tail);
  }

  function friendRow(f, lookup) {
    const info = friendWhereabouts(f, lookup);
    const box = el("div", "oof-friend");
    box.setAttribute("data-friend", String(f.id));
    const row = el("button", "oof-friend-row");
    row.type = "button";
    const open = expanded.has(f.id);
    row.setAttribute("aria-expanded", open ? "true" : "false");
    const dot = el("span", "oof-dot" + (info.online ? " is-on" : ""));
    dot.setAttribute("aria-hidden", "true");
    const pic = avatarThumb(f.avatar || null, 36);
    pic.className = "oof-thumb";
    const text = el("div", null);
    text.setAttribute("style", "flex:1;min-width:0");
    text.append(el("div", "oof-friend-name", f.username), el("div", "oof-friend-where", info.label));
    const caret = el("span", null, open ? "▾" : "▸");
    caret.setAttribute("aria-hidden", "true");
    row.append(dot, pic, text, caret);
    row.addEventListener("click", () => {
      if (expanded.has(f.id)) expanded.delete(f.id); else expanded.add(f.id);
      renderFriends();
    });
    box.appendChild(row);

    if (open) {
      const more = el("div", "oof-friend-more");
      more.appendChild(el("div", null, info.online ? `🟢 Online — ${info.label}.` : "⚫ Offline."));
      if (!info.canJoin) more.appendChild(el("div", "oof-friend-where", info.reason));
      const btns = el("div", "oof-friend-btns");
      const join = button({
        label: info.target ? `Join in ${info.target.name}` : "Join",
        variant: "primary",
        onClick: () => {
          if (!info.canJoin) { toast(info.reason); return; }
          if (typeof deps.joinFriend === "function") deps.joinFriend(f, info.target);
        },
      });
      join.setAttribute("data-oof", "join");
      if (!info.canJoin) { join.disabled = true; join.title = info.reason; }
      btns.appendChild(join);
      if (info.online && deps.friends && typeof deps.friends.invite === "function") {
        btns.appendChild(button({
          label: "Invite",
          variant: "secondary",
          onClick: () => { deps.friends.invite(f.id); toast(`Invited ${f.username}`); },
        }));
      }
      more.appendChild(btns);
      box.appendChild(more);
    }
    return box;
  }

  // ---- loaders --------------------------------------------------------------------
  async function loadPopularity() {
    const games = deps.games;
    const mine = ++seq;
    let available = false;
    try { available = !!(games && games.available()); } catch { available = false; }
    if (!available) {
      // Nothing to fetch, so nothing can have changed: re-rendering every refresh tick
      // would only rebuild the cards under the player's finger.
      if (pop.status === "offline") return;
      Object.assign(pop, { status: "offline", placeVisits: null, rooms: null, published: null, publishedTotal: 0 });
      renderGames();
      renderFavorites();
      return;
    }
    if (pop.status === "idle" || pop.status === "offline") {
      pop.status = "loading";
      renderGames();
    }
    const want = (fn) => (typeof fn === "function" ? withTimeout(Promise.resolve().then(fn), FETCH_TIMEOUT_MS) : Promise.reject(new Error("unsupported")));
    const [visits, rooms, list] = await Promise.allSettled([
      want(typeof games.placeVisits === "function" ? () => games.placeVisits() : null),
      want(typeof games.rooms === "function" ? () => games.rooms() : null),
      want(() => games.list("", "visits")),
    ]);
    if (mine !== seq) return;
    pop.placeVisits = visits.status === "fulfilled" ? countMap(visits.value, "visits") : null;
    pop.rooms = rooms.status === "fulfilled" ? countMap(rooms.value, "rooms") : null;
    if (list.status === "fulfilled") {
      pop.published = Array.isArray(list.value && list.value.games) ? list.value.games : [];
      pop.publishedTotal = Number(list.value && list.value.total) || pop.published.length;
    } else {
      pop.published = null;
      pop.publishedTotal = 0;
    }
    if (pop.placeVisits) pop.status = "ok";
    else if (list.status === "fulfilled") pop.status = "partial";
    else {
      pop.status = "error";
      pop.message = (list.reason && list.reason.message) || "could not reach the server";
    }
    renderGames();
    renderFavorites();
    renderFriends(); // published names feed the friends' "playing X" labels
  }

  async function loadFriends() {
    const acc = deps.account;
    let ready = false;
    try { ready = !!(deps.friends && deps.friends.available() && acc && acc.signedIn()); } catch { ready = false; }
    if (!ready) { fr.status = "idle"; renderFriends(); return; }
    if (!fr.list.length) { fr.status = "loading"; renderFriends(); }
    try {
      const out = await withTimeout(deps.friends.list(), FETCH_TIMEOUT_MS);
      fr.list = Array.isArray(out.friends) ? out.friends : [];
      fr.incoming = Array.isArray(out.incoming) ? out.incoming : [];
      fr.status = "ok";
    } catch (err) {
      fr.status = "error";
      fr.message = (err && err.message) || "could not reach the server";
    }
    renderFriends();
  }

  // ---- the inline avatar editor ---------------------------------------------------
  function mountEditorNow() {
    if (editorHandle || !shown) return;
    const box = el("div", "oof-front-editor");
    box.id = "oof-front-editor";
    editorHost.replaceChildren(box);
    let handle = null;
    try { handle = typeof deps.mountEditor === "function" ? deps.mountEditor(box) : null; } catch (err) {
      console.warn("[oof] inline avatar editor failed to mount", err);
      handle = null;
    }
    if (handle) {
      editorHandle = handle;
      return;
    }
    renderEditorFallback();
  }

  // The full-screen editor is always there; this card is how to reach it when the
  // inline one cannot mount (no second WebGL context, or an editor without mounting).
  function renderEditorFallback() {
    editorHandle = { fallback: true, dispose() {} };
    const box = el("div", "oof-front-fallback");
    const pic = el("div", null);
    const paint = () => {
      let st = null;
      try { st = deps.avatar && deps.avatar.getState ? deps.avatar.getState() : null; } catch { st = null; }
      const thumb = avatarThumb(st, 96);
      thumb.className = "oof-thumb";
      pic.replaceChildren(thumb);
    };
    paint();
    if (fallbackOff) fallbackOff();
    fallbackOff = deps.avatar && typeof deps.avatar.onChange === "function" ? deps.avatar.onChange(paint) : null;
    const text = el("div", null);
    text.setAttribute("style", "flex:1;min-width:200px;display:flex;flex-direction:column;gap:10px");
    text.appendChild(el("div", null, "Open the character editor to try things on before you buy."));
    const row = el("div", "oof-friend-btns");
    row.append(
      button({ label: "🧍 Customize", variant: "primary", onClick: () => deps.openCatalog && deps.openCatalog("avatar") }),
      button({ label: "💇 Cool hair", variant: "secondary", onClick: () => deps.openCatalog && deps.openCatalog("hair") }),
    );
    text.appendChild(row);
    box.append(pic, text);
    editorHost.replaceChildren(box);
  }

  function disposeEditor() {
    if (editorObserver) { editorObserver.disconnect(); editorObserver = null; }
    if (fallbackOff) { try { fallbackOff(); } catch { /* already off */ } fallbackOff = null; }
    if (editorHandle) {
      const h = editorHandle;
      editorHandle = null;
      try {
        if (typeof h.dispose === "function") h.dispose();
        else if (typeof h.close === "function") h.close();
      } catch (err) {
        console.warn("[oof] avatar editor dispose threw", err);
      }
    }
    editorHost.replaceChildren();
  }

  // Mounted only when scrolled near: the editor's live preview is a second WebGL
  // context, which a phone should not pay for unless the player actually goes there.
  function armEditor() {
    if (editorHandle) return;
    editorHost.replaceChildren(el("div", "oof-front-empty", "Scroll here to open the character editor…"));
    if (typeof IntersectionObserver !== "function") { mountEditorNow(); return; }
    editorObserver = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        if (editorObserver) { editorObserver.disconnect(); editorObserver = null; }
        mountEditorNow();
      }
    }, { root, rootMargin: "200px 0px" });
    editorObserver.observe(editorHost);
  }

  // ---- lifecycle ------------------------------------------------------------------
  function refresh() {
    renderHeader();
    renderFavorites();
    renderGames();
    renderFriends();
    loadPopularity();
    loadFriends();
  }

  function onVisibility() {
    if (shown && document.visibilityState === "visible") refresh();
  }

  search.addEventListener("input", () => {
    query = search.value.trim();
    renderGames();
  });

  function show() {
    if (shown) { refresh(); return; }
    shown = true;
    root.hidden = false;
    root.scrollTop = 0;
    refresh();
    armEditor();
    clearInterval(refreshTimer);
    refreshTimer = setInterval(() => {
      if (document.visibilityState === "visible") { loadPopularity(); loadFriends(); }
    }, REFRESH_MS);
    document.addEventListener("visibilitychange", onVisibility);
  }

  function hide() {
    if (!shown) return;
    shown = false;
    root.hidden = true;
    clearInterval(refreshTimer);
    refreshTimer = null;
    seq++; // any fetch in flight lands on a hidden page and is dropped
    document.removeEventListener("visibilitychange", onVisibility);
    disposeEditor();
  }

  return {
    el: root,
    show,
    hide,
    refresh,
    isShown: () => shown,
    scrollToCustomize() { avatarSec.el.scrollIntoView({ block: "start" }); },
    // For tools/smoke.js (through the shell's debug handle) — read-only facts.
    debug: () => ({
      shown,
      popularity: pop.status,
      note: gamesNote.textContent,
      order: ranked(allEntries()).map((e) => e.key),
      favorites: favorites().map((f) => f.key),
      friends: fr.status,
      editor: editorHandle ? (editorHandle.fallback ? "fallback" : "inline") : "none",
      sections: [...inner.querySelectorAll("section")].map((s) => s.id),
    }),
  };
}
