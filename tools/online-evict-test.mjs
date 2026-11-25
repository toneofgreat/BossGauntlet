// tools/online-evict-test.mjs - platyfy-online.js collection eviction against an IN-MEMORY fake relay (no network).
//   node tools/online-evict-test.mjs
// One device flooding a collection may only push out its OWN levels (<= PER_OWNER each), never everyone else's.
import { createPlatyfyOnline, LIMITS } from "../platyfy-online.js";

const recs = new Map(); let nextId = 1, clock = 1;
const json = (status, data) => ({ ok: status < 400, status, text: async () => JSON.stringify(data) });
async function fakeFetch(url, opt = {}) {
  const u = new URL(url), m = opt.method || "GET";
  if (u.pathname === "/api/games" && m === "GET") {
    const q = u.searchParams.get("q") || "";
    return json(200, { games: [...recs.values()].filter((g) => g.name.includes(q)).map(({ code, ...g }) => g) });
  }
  if (u.pathname === "/api/games" && m === "POST") {
    const b = JSON.parse(opt.body); const id = b.gameId || "g" + nextId++;
    const old = recs.get(id);
    recs.set(id, { id, name: b.name, code: b.code, authorId: "1d7249", visibility: "private", published: old ? old.published : clock++, updated: clock++ });
    return json(200, { id });
  }
  const mm = u.pathname.match(/^\/api\/games\/(.+)$/);
  if (mm && m === "GET") { const g = recs.get(decodeURIComponent(mm[1])); return g ? json(200, { game: g }) : json(404, {}); }
  if (mm && m === "DELETE") { recs.delete(decodeURIComponent(mm[1])); return json(200, {}); }
  return json(404, {});
}
const mk = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const inst = () => createPlatyfyOnline({ prefix: "pfo-ev:", storage: mk(), fetch: fakeFetch, relay: "https://fake.test" });
let fails = 0;
const check = (c, m) => { console.log((c ? "ok   " : "FAIL ") + m); if (!c) fails++; };

const others = [inst(), inst(), inst()];
const otherIds = [];
for (const o of others) for (let i = 0; i < 3; i++) { const r = await o.putItem("evlv", { v: i }, { name: "Other level " + i }); otherIds.push(r.id); }
check(otherIds.every(Boolean), "3 players publish 3 levels each");
const flood = inst();
const mine = [];
for (let i = 0; i < 70; i++) { const r = await flood.putItem("evlv", { v: i }, { name: "Flood " + i }); if (r.ok) mine.push(r.id); }
check(mine.length === 70, "the flooder's 70 publishes all succeed");
const li = await others[0].listItems("evlv");
const ids = new Set(li.items.map((x) => x.id));
check(otherIds.every((id) => ids.has(id)), "every other player's level is still listed (" + otherIds.filter((id) => ids.has(id)).length + "/9)");
check(li.items.filter((x) => !otherIds.includes(x.id)).length === LIMITS.PER_OWNER, "the flooder keeps only its newest " + LIMITS.PER_OWNER);
const g = await others[1].getItem("evlv", otherIds[0]);
check(g.ok && g.item.data.v === 0, "other players' records are intact");
const gone = await others[1].getItem("evlv", mine[0]);
check(!gone.ok && gone.reason === "missing", "the flooder's oldest record was deleted");
console.log(fails ? `EVICT TEST FAILED (${fails})` : "EVICT TEST OK");
process.exit(fails ? 1 : 0);
