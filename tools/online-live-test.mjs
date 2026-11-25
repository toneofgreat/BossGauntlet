// tools/online-live-test.mjs - platyfy-online.js against the REAL relay, under a throwaway key prefix
//   node tools/online-live-test.mjs            (cleans up every record it made)
import { createPlatyfyOnline } from "../platyfy-online.js";
const PREFIX = "pfo-t" + Math.floor(Math.random() * 1e4) + ":";
const mk = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const A = createPlatyfyOnline({ prefix: PREFIX, storage: mk() });
const B = createPlatyfyOnline({ prefix: PREFIX, storage: mk() });
const C = createPlatyfyOnline({ prefix: PREFIX, storage: mk() });
const fails = []; const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };
try {
  check((await A.ping()).ok, "relay reachable");
  let r = await A.claimName("Tester Otter");
  check(r.ok && A.isClaimed(), "A claims 'Tester Otter' " + JSON.stringify(r));
  r = await B.claimName("tester otter");
  check(!r.ok && r.reason === "taken", "B cannot take it (case-insensitive) " + JSON.stringify(r));
  r = await B.claimName("Shell Fish");
  check(!r.ok && r.reason === "rude" || r.ok, "names filter runs: " + JSON.stringify(r));
  r = await B.claimName("Brave Duck"); check(r.ok, "B claims 'Brave Duck'");
  r = await C.claimName("fuck"); check(!r.ok && r.reason === "rude", "rude name refused");
  r = await A.submitScore("t-l1", 61234, { lowerIsBetter: true }); check(r.ok && r.rank === 1, "A submits 61.234s -> rank 1 " + JSON.stringify(r));
  r = await B.submitScore("t-l1", 59000, { lowerIsBetter: true }); check(r.ok && r.rank === 1, "B 59.0s -> rank 1 " + JSON.stringify(r));
  r = await A.submitScore("t-l1", 70000, { lowerIsBetter: true }); check(r.ok && !r.improved && r.best === 61234 && r.rank === 2, "A's worse time keeps the best " + JSON.stringify(r));
  let t = await C.getTop("t-l1", 10, { lowerIsBetter: true });
  check(t.ok && t.rows.length === 2 && t.rows[0].name === "Brave Duck" && t.rows[1].name === "Tester Otter" && t.rows[1].value === 61234, "C reads both names in order " + JSON.stringify(t.rows));
  // race: 3 players submit at the same moment to a fresh board
  await C.claimName("Calm Heron");
  const rs = await Promise.all([A.submitScore("t-race", 5, {}), B.submitScore("t-race", 9, {}), C.submitScore("t-race", 7, {})]);
  check(rs.every((x) => x.ok), "3 simultaneous first writes all ok " + JSON.stringify(rs));
  t = await A.getTop("t-race", 10);
  check(t.ok && t.rows.map((x) => x.value).join() === "9,7,5", "race: no write lost, higher-is-better order " + JSON.stringify(t.rows.map((x) => [x.name, x.value])));
  const recs = await A._raw.search(PREFIX + "b:t-race");
  check(recs.ok && recs.list.length === 1, "race: duplicates merged into one record (" + (recs.list || []).length + ")");
  // collections
  const lvl = { v: 1, w: 200, tiles: Array.from({ length: 2000 }, (_, i) => i % 7) };
  r = await A.putItem("ttlv", lvl, { name: "Mossy Run", author: "Tester Otter", difficulty: 4, music: 2 });
  check(r.ok && /^[a-z0-9]{8}$/.test(r.id), "A publishes a level " + JSON.stringify(r));
  const id = r.id;
  r = await B.putItem("ttlv", { v: 1 }, { name: "Duck Pond", difficulty: 9 }); check(r.ok, "B publishes a level");
  let L = await C.listItems("ttlv");
  check(L.ok && L.items.length === 2 && L.items.some((x) => x.id === id && x.name === "Mossy Run" && x.difficulty === 4), "C lists both levels with meta " + JSON.stringify(L.items));
  let g = await C.getItem("ttlv", id);
  check(g.ok && g.item.data.tiles.length === 2000 && g.item.meta.name === "Mossy Run", "C downloads A's level intact");
  r = await B.putItem("ttlv", { hacked: 1 }, {}, { id }); check(!r.ok && r.reason === "notyours", "B cannot overwrite A's level " + JSON.stringify(r));
  r = await A.putItem("ttlv", { ...lvl, w: 201 }, { name: "Mossy Run 2", difficulty: 5 }, { id }); check(r.ok && r.id === id && r.updated, "A updates in place");
  g = await C.getItem("ttlv", id); check(g.ok && g.item.data.w === 201, "update visible");
  r = await A.putItem("ttlv", { big: "x".repeat(31000) }, {}); check(!r.ok && r.reason === "big", "a 31 KB level is refused client side");
  r = await A.putItem("ttlv", {}, { name: "shit level" }); check(!r.ok && r.reason === "rude", "rude level name refused");
  r = await A.submitScore("ttlv:" + id, 12345, { lowerIsBetter: true }); check(r.ok, "per-level best time");
  r = await A.patchMeta("ttlv", id, { rated: 6 }); check(r.ok, "owner patches meta");
  r = await B.patchMeta("ttlv", id, { rated: 1 }); check(!r.ok && r.reason === "notyours", "non-owner cannot patch");
  r = await A.deleteItem("ttlv", id); check(r.ok, "owner deletes");
  L = await C.listItems("ttlv"); check(L.ok && L.items.length === 1, "deleted level gone from list");
  // offline behaviour
  const D = createPlatyfyOnline({ prefix: PREFIX, storage: mk(), relay: "https://127.0.0.1:9" });
  const t0 = Date.now();
  const [d1, d2, d3] = await Promise.all([D.getTop("t-l1"), D.claimName("Lonely Owl"), D.listItems("ttlv")]);
  check(!d1.ok && d1.reason === "network" && !d2.ok && !d3.ok && Date.now() - t0 < 25000, "unreachable relay: everything resolves with reason network in " + (Date.now() - t0) + " ms");
  check(D.getName() === "Lonely Owl", "offline name kept locally");
  const q = await D.submitScore("t-l1", 1000, { lowerIsBetter: true }); check(!q.ok && q.queued, "offline score is queued");
} catch (e) { fails.push("CRASH " + e.stack); console.log(e); }
// clean up every record under the test prefix
const all = await A._raw.search(PREFIX);  // exact-name filter would drop them; list by prefix instead
const r = await fetch("https://relay.platyfy.com/api/games?limit=100&q=" + encodeURIComponent(PREFIX) + "&token=e38904a80e48e8e4604a1da3db1003c258c1beb130bb149decf1bbef104393a5");
const games = (await r.json()).games.filter((g) => g.name.startsWith(PREFIX) && g.authorId === "1d7249");
for (const g of games) await fetch("https://relay.platyfy.com/api/games/" + g.id, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: "e38904a80e48e8e4604a1da3db1003c258c1beb130bb149decf1bbef104393a5" }) });
const left = (await (await fetch("https://relay.platyfy.com/api/games?limit=100&q=" + encodeURIComponent(PREFIX) + "&token=e38904a80e48e8e4604a1da3db1003c258c1beb130bb149decf1bbef104393a5")).json()).total;
console.log("cleanup: deleted " + games.length + " test records, " + left + " left");
console.log(fails.length ? "FAILED " + fails.length : "ALL PASSED");
process.exit(fails.length ? 1 : 0);
