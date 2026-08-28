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

export function mountFriendsPanel(body, deps = {}) {
  const { friends, account, onJoin, toast } = deps;

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

    const where = el("div", null, f.online ? (f.place || "online") : "offline");
    where.setAttribute("style",
      `font-size:var(--oof-size-sm);color:${f.online ? "var(--oof-good,#3ddc84)" : "var(--oof-text-dim)"}`);
    t.appendChild(where);

    const row = el("div", null);
    row.setAttribute("style", "display:flex;gap:4px;margin-top:2px");

    const join = button({
      label: "Join",
      variant: "primary",
      onClick: () => {
        if (!f.online || !f.place) { if (toast) toast(`${f.username} is not in a game right now`); return; }
        if (typeof onJoin === "function") onJoin(f);
      },
    });
    // Offered but disabled, with the reason on the tile above it: hiding the button
    // would leave people wondering where it went.
    if (!f.online || !f.place) join.disabled = true;

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
