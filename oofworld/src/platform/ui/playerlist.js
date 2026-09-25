// src/platform/ui/playerlist.js — who is here, as GUI. Spec 15 §5.1 owns this.
//
// Deliberately NOT the weight-lifting sim's TOP LIFTERS board: that one is a canvas
// texture on a slab standing in the gym, which you have to walk to and look at. This is a
// panel over the game that lists the people in your room, and it works the same in every
// Place.
//
// Clicking a name opens that person's card — their character and, if they are signed in
// and not already a friend, a button to ask to be friends. A guest (or you) has no card
// action, because there is nobody to send a request to.

import { el, button } from "./kit.js";
import { avatarThumb } from "./avatar-thumb.js";

const REFRESH_MS = 1200;

export function mountPlayerList(body, deps = {}) {
  const { net, account, friends, toast } = deps;
  let timer = null;
  let openId = null; // the player whose card is showing
  let friendIds = new Set();

  const count = el("div", null, "");
  count.setAttribute("style", "font-size:var(--oof-size-sm);color:var(--oof-text-dim);margin-bottom:6px");

  const list = el("div", null);
  list.setAttribute("style", "display:flex;flex-direction:column;gap:4px;max-height:46vh;overflow-y:auto");

  const card = el("div", null);
  card.setAttribute("style", "margin-top:10px");

  body.append(count, list, card);

  // Who is here, from the same roster that draws the avatars — you included, because a
  // list of "who is in this room" that omitted you would read as a bug.
  function people() {
    const self = net && typeof net.self === "function" ? net.self() : { id: null, name: null };
    const roster = net && typeof net.roster === "function" ? net.roster() : [];
    const me = {
      id: self.id,
      accountId: account && account.signedIn() ? account.id() : null,
      name: (account && account.username()) || self.name || "You",
      isSelf: true,
      avatar: deps.myAvatar ? deps.myAvatar() : null,
    };
    return [me, ...roster.map((p) => ({
      id: p.id, accountId: p.accountId || null, name: p.name || "player",
      isSelf: false, avatar: p.avatar || null,
    }))];
  }

  function row(p) {
    const r = el("button", null);
    r.type = "button";
    r.setAttribute("style",
      "display:flex;align-items:center;gap:8px;padding:7px 10px;width:100%;text-align:left;"
      + "border:0;border-radius:var(--oof-radius-md);background:var(--oof-bg-2);"
      + "color:var(--oof-text);font:inherit;cursor:pointer");
    const dot = el("span", null, p.isSelf ? "●" : "○");
    dot.setAttribute("style", "color:var(--oof-accent,#f7c948)");
    const name = el("span", null, p.name + (p.isSelf ? " (you)" : ""));
    name.setAttribute("style", "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap");
    r.append(dot, name);
    if (friendIds.has(p.accountId)) {
      const f = el("span", null, "friend");
      f.setAttribute("style", "font-size:var(--oof-size-sm);color:var(--oof-text-dim)");
      r.appendChild(f);
    }
    r.addEventListener("click", () => { openId = openId === p.id ? null : p.id; render(); });
    return r;
  }

  function showCard(p) {
    card.replaceChildren();
    const wrap = el("div", null);
    wrap.setAttribute("style",
      "display:flex;gap:12px;align-items:center;padding:12px;border-radius:var(--oof-radius-md);"
      + "background:var(--oof-bg-2)");
    wrap.appendChild(avatarThumb(p.avatar, 84));

    const right = el("div", null);
    right.setAttribute("style", "flex:1;min-width:0;display:flex;flex-direction:column;gap:6px");
    const nm = el("div", null, p.name);
    nm.setAttribute("style", "font-weight:800");
    right.appendChild(nm);

    if (p.isSelf) {
      right.appendChild(note("This is you."));
    } else if (!p.accountId) {
      // Nothing to send a request TO: a friendship is between accounts, and this player
      // has not signed in.
      right.appendChild(note("Not signed in, so they cannot be added as a friend."));
    } else if (friendIds.has(p.accountId)) {
      right.appendChild(note("Already your friend."));
    } else if (!friends || !friends.available()) {
      right.appendChild(note("Sign in to send a friend request."));
    } else {
      const add = button({
        label: "Send friend request",
        variant: "primary",
        onClick: async () => {
          add.disabled = true;
          add.textContent = "Sending…";
          try {
            const out = await friends.request({ id: p.accountId });
            if (out && out.accepted) { if (toast) toast(`You and ${p.name} are now friends`); }
            else if (out && out.already) { if (toast) toast("Already asked"); }
            else if (toast) toast(`Asked ${p.name} to be friends`);
            await refreshFriends();
            render();
          } catch (err) {
            if (toast) toast((err && err.message) || "Could not send that");
            add.disabled = false;
            add.textContent = "Send friend request";
          }
        },
      });
      right.appendChild(add);
    }
    wrap.appendChild(right);
    card.appendChild(wrap);
  }

  function note(text) {
    const n = el("div", null, text);
    n.setAttribute("style", "font-size:var(--oof-size-sm);color:var(--oof-text-dim)");
    return n;
  }

  function render() {
    const all = people();
    // §9: the true number, including "just you".
    count.textContent = all.length === 1
      ? "You are the only one here."
      : `${all.length} people here`;
    list.replaceChildren();
    for (const p of all) list.appendChild(row(p));
    const open = all.find((p) => p.id === openId);
    if (open) showCard(open);
    else card.replaceChildren();
  }

  async function refreshFriends() {
    if (!friends || !friends.available()) { friendIds = new Set(); return; }
    try {
      const out = await friends.list();
      friendIds = new Set(out.friends.map((f) => f.id));
    } catch { /* a list we cannot fetch simply shows nobody as a friend */ }
  }

  refreshFriends().then(render);
  timer = setInterval(render, REFRESH_MS);

  return {
    refresh: render,
    dispose() { if (timer) clearInterval(timer); timer = null; },
  };
}
