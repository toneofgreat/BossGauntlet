// src/platform/services/games.js — the published-game catalogue. Spec 14 §5.6–§5.8.
//
// Thin on purpose: the ranking, the top-100 cut and the visit arithmetic all live on the
// server, because they are the same for everybody and a client cannot be trusted with
// them. This file fetches, and reports failures in words a person can read rather than
// throwing raw status codes at the UI.

export function createGames(deps = {}) {
  const d = { account: null, ...deps };

  const account = () => d.account;
  const available = () => !!(account() && account().available());

  async function call(path, body, method) {
    if (!available()) throw new Error("No server configured");
    return account().call(path, body, method);
  }

  return {
    available,

    // The top `GAMES_TOP` by visits when `q` is empty; name matches otherwise. Either
    // way the server decides the order — see spec 14 §4.
    async list(q) {
      const query = q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const out = await call(`/api/games${query}`, undefined, "GET");
      return { games: out.games || [], total: out.total || 0 };
    },

    async get(id) {
      const out = await call(`/api/games/${encodeURIComponent(id)}`, undefined, "GET");
      return out.game;
    },

    // Publishing needs an account, because a game has an author. The caller is expected
    // to have said so in the UI already; this is the backstop.
    async publish({ name, code, gameId }) {
      const acc = account();
      if (!acc || !acc.signedIn()) throw new Error("Sign in to publish");
      return call("/api/games", { token: acc.token(), name, code, gameId });
    },

    // Recorded once per account per game, server-side. A guest still gets to play — the
    // call succeeds and comes back `counted: false`, because there is nobody to count
    // (spec 14 §5.7), and that is not an error to surface.
    async visit(id) {
      const acc = account();
      try {
        return await call(`/api/games/${encodeURIComponent(id)}/visit`, {
          token: acc && acc.signedIn() ? acc.token() : null,
        });
      } catch {
        // A visit that could not be recorded must never stop the game from opening.
        return { visits: null, counted: false };
      }
    },

    async remove(id) {
      const acc = account();
      if (!acc || !acc.signedIn()) throw new Error("Sign in first");
      return call(`/api/games/${encodeURIComponent(id)}`, { token: acc.token() }, "DELETE");
    },
  };
}
