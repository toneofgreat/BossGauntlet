// src/platform/services/account.js — who you are. Spec 14 §5.1–§5.3 owns this file.
//
// Holds the session token, asks the server about it on boot, and hands the rest of the
// platform a plain answer to "am I signed in, and as whom".
//
// The rule this file exists to keep: SIGNING IN IS OPTIONAL. With no server configured
// there is no account system at all and nothing here makes a request. With one
// configured you may still dismiss the dialog and play as a guest. A guest loses exactly
// two things — publishing, and being counted as a visit — and never any progress, which
// lives in localStorage and is never sent anywhere (ARCHITECTURE.md §8).

const SESSION_KEY = "oofcubes.v1.session";

// The server is the same host as the relay, over http(s) rather than ws(s). Deriving it
// rather than asking for a second URL means one thing to configure, and it cannot drift.
export function httpBaseFrom(relayUrl) {
  if (!relayUrl) return null;
  if (/^wss:\/\//i.test(relayUrl)) return relayUrl.replace(/^wss:\/\//i, "https://");
  if (/^ws:\/\//i.test(relayUrl)) return relayUrl.replace(/^ws:\/\//i, "http://");
  return null;
}

export function createAccount(deps = {}) {
  const d = {
    getRelayUrl: () => null,
    // BOUND, deliberately. A bare `fetch` reference works in Node but throws
    // "Illegal invocation" in a browser, because window.fetch needs its receiver — which
    // is exactly the kind of bug a Node-only test suite cannot see, and did not: 39
    // account checks passed green while this was broken in every browser.
    fetchImpl: typeof fetch === "undefined" ? null : fetch.bind(globalThis),
    storage: typeof localStorage === "undefined" ? null : localStorage,
    onChange: () => {},
    ...deps,
  };

  let session = null;   // { token, id, username, expires }
  let checked = false;  // has the stored token been SETTLED (signed in, or refused)
  let restoring = null; // the in-flight restore, so concurrent callers share one
  let lastError = null;
  const listeners = [];

  function emit() {
    for (const fn of [...listeners]) {
      try { fn(current()); } catch (err) { console.error("[account] listener threw", err); }
    }
    d.onChange(current());
  }

  function readStored() {
    if (!d.storage) return null;
    try {
      const raw = d.storage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.token ? parsed : null;
    } catch { return null; }
  }

  function writeStored(next) {
    if (!d.storage) return;
    try {
      if (next) d.storage.setItem(SESSION_KEY, JSON.stringify(next));
      else d.storage.removeItem(SESSION_KEY);
    } catch { /* private mode: you simply sign in again next time */ }
  }

  function base() { return httpBaseFrom(d.getRelayUrl()); }

  async function call(path, body, method) {
    const root = base();
    if (!root) throw new Error("No server configured");
    if (!d.fetchImpl) throw new Error("No fetch in this environment");
    const res = await d.fetchImpl(root + path, {
      method: method || "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch { json = null; }
    if (!res.ok) {
      const err = new Error((json && json.error) || `Server said ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return json;
  }

  function adopt(result) {
    session = {
      token: result.token, id: result.id, username: result.username, expires: result.expires,
    };
    writeStored(session);
    emit();
    return session;
  }

  function current() {
    return session
      ? { signedIn: true, id: session.id, username: session.username, expires: session.expires }
      : { signedIn: false, id: null, username: null, expires: null };
  }

  return {
    // --- state ---
    signedIn: () => !!session,
    username: () => (session ? session.username : null),
    id: () => (session ? session.id : null),
    token: () => (session ? session.token : null),
    expires: () => (session ? session.expires : null),
    available: () => !!base(),
    // "we have asked the server about the stored token" — the sign-in prompt waits for
    // this so it never flashes up in front of somebody who is already signed in.
    resolved: () => checked,

    // --- lifecycle ---
    // Called at boot, and safe to call again. It never throws, because a dead server
    // must not stop the game from starting.
    //
    // `checked` is set on SUCCESS or on an explicit 401 — never merely because it was
    // attempted. The first version latched it up front, so one transient failure at boot
    // (a server still starting, a slow first request) left the player signed out with a
    // perfectly good token sitting in storage and no way back except reloading the page.
    // Now a later call retries.
    async restore() {
      if (checked) return current();
      const stored = readStored();
      if (!stored || !base()) { checked = true; emit(); return current(); }
      if (restoring) return restoring; // concurrent callers share one round trip
      restoring = (async () => {
        try {
          const who = await call("/api/session", { token: stored.token });
          session = { token: stored.token, id: who.id, username: who.username, expires: who.expires };
          writeStored(session);
          checked = true;
          lastError = null;
        } catch (err) {
          // 401 is the ordinary monthly expiry, not a fault: drop the token, mark it
          // settled, and let the dialog ask for the password again. Anything else
          // (server down, offline, still booting) leaves BOTH the token and `checked`
          // alone, so the next call tries again.
          lastError = (err && err.message) || String(err);
          if (err && err.status === 401) {
            session = null;
            writeStored(null);
            checked = true;
          }
        } finally {
          restoring = null;
        }
        emit();
        return current();
      })();
      return restoring;
    },

    // Why the last restore did not sign you in, for diagnosis. Null when it worked.
    lastError: () => lastError,

    async register(username, password) { return adopt(await call("/api/register", { username, password })); },
    async login(username, password) { return adopt(await call("/api/login", { username, password })); },

    async logout() {
      const token = session && session.token;
      session = null;
      writeStored(null);
      emit();
      // Server-side too, so the token is dead even if someone copied it out of storage.
      if (token && base()) { try { await call("/api/logout", { token }); } catch { /* it expires anyway */ } }
    },

    // Forget the session locally without telling the server — what a 401 from any other
    // call means: this token is already gone.
    forget() {
      if (!session) return;
      session = null;
      writeStored(null);
      emit();
    },

    onChange(fn) {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i > -1) listeners.splice(i, 1);
      };
    },

    // Shared with services/games.js so both speak to the same host with the same rules.
    call,
    base,
  };
}
