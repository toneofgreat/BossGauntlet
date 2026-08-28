// src/platform/ui/games-panel.js — the Games browser. Spec 14 §5.6 owns this.
//
// Search by name, or scroll the top 100 by visits. The ordering and the cut are the
// SERVER's (spec 14 §4) — this file never re-sorts, because the ranking has to be the
// same for everybody and a client that reordered would be showing a private truth.
//
// Every empty state says what is actually true rather than showing a blank list: no
// server, nothing published yet, or nothing matching that search are three different
// situations and a player deserves to know which one they are in.

import { el, button } from "./kit.js";

const SEARCH_DEBOUNCE_MS = 220;

export function mountGamesPanel(body, deps = {}) {
  const { games, account, onPlay, toast } = deps;
  let timer = null;
  let lastQuery = "";
  let seq = 0; // guards against a slow early search landing after a fast later one

  const search = el("input", "oof-input");
  search.type = "search";
  search.placeholder = "Search games…";
  search.setAttribute("aria-label", "Search games");
  search.setAttribute("style",
    "width:100%;padding:9px 10px;border-radius:var(--oof-radius-md);"
    + "border:1px solid var(--oof-line);background:var(--oof-bg-2);color:var(--oof-text);font:inherit");
  // Chat and the engine both listen for keys; a search box must eat its own.
  for (const evt of ["keydown", "keyup", "keypress"]) {
    search.addEventListener(evt, (e) => e.stopPropagation());
  }

  const caption = el("div", null, "");
  caption.setAttribute("style", "font-size:var(--oof-size-sm);color:var(--oof-text-dim);margin:8px 0 4px");

  const list = el("div", "oof-games-list");
  list.setAttribute("style", "display:flex;flex-direction:column;gap:6px;max-height:52vh;overflow-y:auto");

  body.append(search, caption, list);

  function empty(text) {
    list.replaceChildren();
    const e = el("div", null, text);
    e.setAttribute("style", "padding:18px 6px;color:var(--oof-text-dim);text-align:center");
    list.appendChild(e);
  }

  function row(game, rank) {
    const r = el("div", "oof-game-row");
    r.setAttribute("style",
      "display:flex;align-items:center;gap:10px;padding:8px 10px;"
      + "border-radius:var(--oof-radius-md);background:var(--oof-bg-2)");

    const place = el("div", null, `#${rank}`);
    place.setAttribute("style",
      "min-width:34px;font-weight:800;color:var(--oof-text-dim);font-variant-numeric:tabular-nums");

    const mid = el("div", null);
    mid.setAttribute("style", "flex:1;min-width:0");
    const name = el("div", null, game.name);
    name.setAttribute("style", "font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap");
    // The count is the size of a set of accounts (spec 14 §5.7) — say "visit", singular
    // at 1, and never round or embellish it.
    const by = el("div", null,
      `by ${game.authorName} · ${game.visits} ${game.visits === 1 ? "visit" : "visits"}`);
    by.setAttribute("style", "font-size:var(--oof-size-sm);color:var(--oof-text-dim)");
    mid.append(name, by);

    const play = button({
      label: "Play",
      variant: "primary",
      onClick: () => { if (typeof onPlay === "function") onPlay(game); },
    });

    r.append(place, mid, play);
    return r;
  }

  async function load(q) {
    const mine = ++seq;
    if (!games || !games.available()) {
      caption.textContent = "";
      empty("No server is set up, so there are no published games to show.\n"
        + "Add one in Settings → MULTIPLAYER.");
      return;
    }
    caption.textContent = q ? `Searching for “${q}”…` : "Loading the top games…";
    try {
      const out = await games.list(q);
      if (mine !== seq) return; // a later search already answered
      list.replaceChildren();
      if (!out.games.length) {
        caption.textContent = "";
        empty(q ? `Nothing matches “${q}”.` : "Nobody has published a game yet. Be first!");
        return;
      }
      caption.textContent = q
        ? `${out.games.length} of ${out.total} match “${q}”`
        : `Top ${out.games.length} by visits${out.total > out.games.length ? ` (of ${out.total})` : ""}`;
      out.games.forEach((g, i) => list.appendChild(row(g, i + 1)));
    } catch (err) {
      if (mine !== seq) return;
      caption.textContent = "";
      empty(err && err.message ? err.message : "Could not reach the server.");
    }
  }

  search.addEventListener("input", () => {
    const q = search.value.trim();
    if (q === lastQuery) return;
    lastQuery = q;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => load(q), SEARCH_DEBOUNCE_MS);
  });

  if (account && !account.signedIn() && games && games.available()) {
    const note = el("div", null,
      "You are playing as a guest, so your visits are not counted and you cannot publish.");
    note.setAttribute("style",
      "margin-top:10px;font-size:var(--oof-size-sm);color:var(--oof-text-dim)");
    body.appendChild(note);
  }

  load("");
  return { refresh: () => load(lastQuery), dispose() { if (timer) clearTimeout(timer); } };
}
