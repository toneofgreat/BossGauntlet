// src/platform/services/friends.js — friends, requests and invites. Spec 15 owns this.
//
// The list, the requests and the presence all live on the server; this fetches them. The
// invites ride the game socket instead of HTTP, because an invite is a push to somebody
// who is playing right now and HTTP has no way to reach them.
//
// Nothing here is cached optimistically. A friends list that showed somebody as online
// because they were a minute ago would send you to Join a Place they have left, so every
// answer comes from the server and `online`/`place` are whatever it says — including
// "offline", which is the common case.

export function createFriends(deps = {}) {
  const d = { account: null, net: null, ...deps };
  const listeners = { invite: [], change: [] };

  const account = () => d.account;
  const available = () => !!(account() && account().available() && account().signedIn());

  function emit(evt, payload) {
    for (const fn of [...(listeners[evt] || [])]) {
      try { fn(payload); } catch (err) { console.error("[friends] listener threw", err); }
    }
  }

  async function call(path, body) {
    const acc = account();
    if (!acc || !acc.available()) throw new Error("No server configured");
    if (!acc.signedIn()) throw new Error("Sign in first");
    return acc.call(path, { token: acc.token(), ...body });
  }

  // Wired once by the shell: an invite arrives on the socket, not over HTTP.
  function bind(net) {
    d.net = net;
    if (!net || typeof net.on !== "function") return () => {};
    return net.on("invite", (m) => emit("invite", m));
  }

  return {
    available,
    bind,

    async list() {
      const out = await call("/api/friends", {});
      return { friends: out.friends || [], incoming: out.incoming || [] };
    },

    async request(target) {
      const body = typeof target === "string" ? { username: target } : { id: target.id };
      const out = await call("/api/friends/request", body);
      emit("change");
      return out;
    },

    // `accept` false is a real answer, not a cancel: the request is dropped and they do
    // not become friends (spec 15 §5.2).
    async answer(id, accept) {
      const out = await call("/api/friends/answer", { id, accept: !!accept });
      emit("change");
      return out;
    },

    async remove(id) {
      const out = await call("/api/friends/remove", { id });
      emit("change");
      return out;
    },

    // Fire and forget over the socket. The server refuses invites to non-friends and
    // rate-limits them, so there is nothing to validate here that would not be a lie.
    invite(accountId) {
      if (!d.net || typeof d.net.send !== "function") return false;
      return d.net.send({ t: "invite", to: accountId });
    },

    on(evt, fn) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(fn);
      return () => {
        const i = listeners[evt].indexOf(fn);
        if (i > -1) listeners[evt].splice(i, 1);
      };
    },
  };
}
