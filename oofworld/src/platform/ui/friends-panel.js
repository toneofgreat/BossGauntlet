// src/platform/ui/friends-panel.js — the Friends button. Spec 15 §5.3 owns this.
//
// A grid of your friends, each shown as their character with their name underneath, and
// Join / Invite under that. It scrolls, so a hundred friends works the same as three.
//
// Two honesty rules, both from ARCHITECTURE.md §9:
//   - `online` and `place` come from the server every time the panel opens. A cached
//     "online" would send Join to a Place they left.
//   - Join is DISABLED for an offline friend, and says why, rather than being offered and
//     then failing.
//
// Incoming requests live at the top, because a request waiting on you is the thing you
// most need to see, and answering it is two buttons.

import { el, button } from "./kit.js";
import { avatarThumb } from "./avatar-thumb.js";

// The room key the front page joins (spec 06 §5.7): a friend whose presence says "hub"
// is on OofWorld's front page, which is not a game anybody can join them in.
export const FRONT_ROOM = "hub";
const STUDIO_ROOM_RE = /^studio-([A-Za-z0-9]{1,32})$/;

// friendWhereabouts(friend, lookup) -> { online, label, canJoin, reason, target }
//
// The one place that turns a friend's server-reported `{ online, place }` into words and
// a Join decision, shared by the Friends panel and the front page so both say the same
// true thing. `lookup`:
//   placeName(slug)   -> the name of a visible built-in Place, or null if this build has
//                        no such (visible) Place
//   publishedName(id) -> the name of a PUBLIC published game this client has listed,
//                        null when the list is loaded and it is not in it, or undefined
//                        when no list was loaded (so nothing can be said either way)
// `target` is { kind: "place", slug, name } or { kind: "published", id, name } when Join
// can go somewhere, else null — and `reason` then says why not.
export function friendWhereabouts(friend, lookup = {}) {
  const f = friend || {};
  const placeName = typeof lookup.placeName === "function" ? lookup.placeName : () => null;
  const publishedName = typeof lookup.publishedName === "function" ? lookup.publishedName : () => undefined;
  const who = f.username || "They";
  if (!f.online) {
    return { online: false, label: "Offline", canJoin: false, reason: `${who} is offline right now.`, target: null };
  }
  const place = typeof f.place === "string" ? f.place : null;
  if (!place) {
    return { online: true, label: "Online", canJoin: false, reason: `${who} is online but not in a game.`, target: null };
  }
  if (place === FRONT_ROOM) {
    return {
      online: true, label: "On the front page", canJoin: false,
      reason: `${who} is browsing the front page, not playing a game.`, target: null,
    };
  }
  const builtIn = placeName(place);
  if (builtIn) {
    return {
      online: true, label: `Playing ${builtIn}`, canJoin: true, reason: "",
      target: { kind: "place", slug: place, name: builtIn },
    };
  }
  const m = STUDIO_ROOM_RE.exec(place);
  if (m) {
    const name = publishedName(m[1]);
    if (name) {
      return {
        online: true, label: `Playing ${name}`, canJoin: true, reason: "",
        target: { kind: "published", id: m[1], name },
      };
    }
    if (name === null) {
      return {
        online: true, label: "Playing a published game", canJoin: false,
        reason: "That game is friends-only or private, so it is not open to join from here.", target: null,
      };
    }
    // No list to check against: offer it, and let the server say no if it is not open.
    return {
      online: true, label: "Playing a published game", canJoin: true, reason: "",
      target: { kind: "published", id: m[1], name: "a published game" },
    };
  }
  return {
    online: true, label: "In a place this version doesn't know", canJoin: false,
    reason: "They are somewhere this version of OofWorld cannot open.", target: null,
  };
}

export function mountFriendsPanel(body, deps = {}) {
  const { friends, account, onJoin, toast } = deps;
  const lookup = deps.lookup || {};

  const status = el("div", null, "");
  status.setAttribute("style", "font-size:var(--oof-size-sm);color:var(--oof-text-dim);margin-bottom:8px");

  const requests = el("div", null);
  requests.setAttribute("style", "display:flex;flex-direction:column;gap:6px;margin-bottom:10px");

  const grid = el("div", null);
  // A fixed-width grid rather than flex, so rows line up and the scroll is predictable
  // past twenty friends.
  grid.setAttribute("style",
    "display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:10px;"
    + "max-height:52vh;overflow-y:auto;padding-right:4px");

  body.append(status, requests, grid);

  function empty(text) {
    grid.replaceChildren();
    const e = el("div", null, text);
    e.setAttribute("style", "grid-column:1/-1;padding:18px 6px;color:var(--oof-text-dim);text-align:center");
    grid.appendChild(e);
  }

  function requestRow(r) {
    const row = el("div", null);
    row.setAttribute("style",
      "display:flex;align-items:center;gap:8px;padding:8px 10px;"
      + "border-radius:var(--oof-radius-md);background:var(--oof-bg-2)");
    const who = el("div", null, `${r.username} wants to be friends`);
    who.setAttribute("style", "flex:1;min-width:0");
    const yes = button({ label: "Yes", variant: "primary", onClick: () => answer(r, true) });
    const no = button({ label: "No", variant: "secondary", onClick: () => answer(r, false) });
    row.append(who, yes, no);
    return row;
  }

  async function answer(r, accept) {
    try {
      await friends.answer(r.id, accept);
      if (toast) toast(accept ? `You and ${r.username} are now friends` : `Said no to ${r.username}`);
      load();
    } catch (err) {
      if (toast) toast((err && err.message) || "Could not answer that");
    }
  }

  function tile(f) {
    const t = el("div", null);
    t.setAttribute("style",
      "display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px;"
      + "border-radius:var(--oof-radius-md);background:var(--oof-bg-2)");
    t.appendChild(avatarThumb(f.avatar, 64));

    const nm = el("div", null, f.username);
    nm.setAttribute("style",
      "font-weight:700;font-size:var(--oof-size-sm);max-width:100%;overflow:hidden;"
      + "text-overflow:ellipsis;white-space:nowrap");
    t.appendChild(nm);

    const info = friendWhereabouts(f, lookup);
    const where = el("div", null, info.label);
    where.title = info.reason || info.label;
    where.setAttribute("style",
      `font-size:var(--oof-size-sm);color:${f.online ? "var(--oof-good,#3ddc84)" : "var(--oof-text-dim)"}`);
    t.appendChild(where);

    const row = el("div", null);
    row.setAttribute("style", "display:flex;gap:4px;margin-top:2px");

    const join = button({
      label: "Join",
      variant: "primary",
      onClick: () => {
        if (!info.canJoin) { if (toast) toast(info.reason); return; }
        if (typeof onJoin === "function") onJoin(f, info.target);
      },
    });
    // Offered but disabled, with the reason on the tile above it: hiding the button
    // would leave people wondering where it went.
    if (!info.canJoin) {
      join.disabled = true;
      join.title = info.reason;
    }

    const invite = button({
      label: "Invite",
      variant: "secondary",
      onClick: () => {
        if (!f.online) { if (toast) toast(`${f.username} is not online`); return; }
        friends.invite(f.id);
        if (toast) toast(`Invited ${f.username}`);
      },
    });
    if (!f.online) invite.disabled = true;

    row.append(join, invite);
    t.appendChild(row);
    return t;
  }

  async function load() {
    requests.replaceChildren();
    if (!friends || !friends.available()) {
      status.textContent = "";
      empty(account && account.available()
        ? "Sign in to have friends."
        : "No server is set up, so there are no friends to show.");
      return;
    }
    status.textContent = "Loading…";
    try {
      const out = await friends.list();
      for (const r of out.incoming) requests.appendChild(requestRow(r));
      grid.replaceChildren();
      if (!out.friends.length) {
        status.textContent = out.incoming.length ? "" : "";
        empty("No friends yet. Open the player list and send somebody a request.");
        return;
      }
      const online = out.friends.filter((f) => f.online).length;
      status.textContent = `${out.friends.length} friend${out.friends.length === 1 ? "" : "s"}`
        + `, ${online} online`;
      // Online first — they are the ones you can actually do anything with.
      const sorted = out.friends.slice().sort((a, b) =>
        (b.online ? 1 : 0) - (a.online ? 1 : 0) || a.username.localeCompare(b.username));
      for (const f of sorted) grid.appendChild(tile(f));
    } catch (err) {
      status.textContent = "";
      empty((err && err.message) || "Could not reach the server.");
    }
  }

  load();
  return { refresh: load, dispose() {} };
}
