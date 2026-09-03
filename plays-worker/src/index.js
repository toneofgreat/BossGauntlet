// platyfy-plays — permanent global play counts for the platyfy.com card grid.
//
// One Durable Object holds every counter. Keys are the slugged form of a card's href
// (same slugging as index.html: non-alphanumerics to dashes, lowercased, max 64 chars).
//
//   GET  /counts      -> { "<key>": <plays>, ... }   every counter at once
//   POST /hit/<key>   -> { "value": <plays> }         one more play (sendBeacon-friendly)
//   POST /seed        -> { seeded: n }                one-time import; refused once any
//                                                     counter exists, so it can never
//                                                     overwrite real history
//
// CORS is wide open on purpose: the counts are public by definition (the grid shows
// them to everyone), and a play is worth nothing — inflating one buys a higher spot on
// a free games page. Guarding it further would cost more than the number is worth.

const KEY_RE = /^[a-z0-9-]{1,64}$/;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const id = env.PLAYS.idFromName("plays");
    return env.PLAYS.get(id).fetch(request);
  },
};

export class Plays {
  constructor(ctx) {
    this.ctx = ctx;
    // Per-IP throttle, in memory only: enough to stop a runaway loop, deliberately not
    // enough to stop a determined person (see the CORS note above for why that is fine).
    this.recent = new Map(); // ip -> { windowStart, hits }
  }

  throttled(ip) {
    const now = Date.now();
    const r = this.recent.get(ip);
    if (!r || now - r.windowStart > 60_000) {
      this.recent.set(ip, { windowStart: now, hits: 1 });
      if (this.recent.size > 5000) this.recent.clear(); // bound the map, crudely
      return false;
    }
    r.hits++;
    return r.hits > 60;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "GET" && path === "/counts") {
      const all = await this.ctx.storage.list({ prefix: "c:" });
      const out = {};
      for (const [k, v] of all) out[k.slice(2)] = v;
      return json(out);
    }

    if (request.method === "POST" && path.startsWith("/hit/")) {
      const key = path.slice(5);
      if (!KEY_RE.test(key)) return json({ error: "bad key" }, 400);
      const ip = request.headers.get("CF-Connecting-IP") || "?";
      const current = (await this.ctx.storage.get("c:" + key)) || 0;
      if (this.throttled(ip)) return json({ value: current }); // count it as seen, not as played
      await this.ctx.storage.put("c:" + key, current + 1);
      return json({ value: current + 1 });
    }

    if (request.method === "POST" && path === "/seed") {
      const existing = await this.ctx.storage.list({ prefix: "c:", limit: 1 });
      if (existing.size > 0) return json({ error: "already seeded" }, 409);
      let body;
      try { body = await request.json(); } catch { return json({ error: "bad json" }, 400); }
      let n = 0;
      for (const [key, value] of Object.entries(body)) {
        if (!KEY_RE.test(key) || !Number.isInteger(value) || value < 0) continue;
        await this.ctx.storage.put("c:" + key, value);
        n++;
      }
      return json({ seeded: n });
    }

    return json({ error: "no such endpoint" }, 404);
  }
}
