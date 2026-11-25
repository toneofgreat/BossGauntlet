// tools/online-live-test.mjs - src/online.js against the REAL relay under a throwaway key prefix; cleans up after.
//   node tools/online-live-test.mjs
const PREFIX = "pfo-act" + Math.floor(Math.random() * 1e5) + ":";
globalThis.__PLATYFY_ONLINE_TEST = { prefix: PREFIX };
const O = await import("../src/online.js");
const { emptyLevel } = await import("../src/sim/level.js");
const TOKEN = "e38904a80e48e8e4604a1da3db1003c258c1beb130bb149decf1bbef104393a5", RELAY = "https://relay.platyfy.com";
const fails = []; const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };
try {
  check((await O.ping()).ok, "relay reachable");
  let r = await O.claimName("Cube Fan");
  check(r.ok && (await O.getName()) === "Cube Fan", "claimName " + JSON.stringify(r));
  const lv = emptyLevel({ w: 120, h: 20, name: "Mossy Steps" });
  r = await O.publishLevel(lv, { name: "Mossy Steps", author: "Cube Fan", difficulty: 3, music: "campfire", theme: "forest" });
  check(r.ok && /^[a-z0-9]{8}$/.test(r.id), "publishLevel " + JSON.stringify(r));
  const id = r.id;
  r = await O.publishLevel(lv, { difficulty: 0 }); check(!r.ok && r.reason === "invalid", "difficulty is required (1..10)");
  r = await O.publishLevel({ ...lv, w: 9999 }, { difficulty: 3 }); check(!r.ok && r.reason === "invalid", "invalid level refused " + JSON.stringify(r.errors));
  r = await O.publishLevel(emptyLevel({ w: 400, h: 48 }), { name: "fuck this", difficulty: 2 }); check(!r.ok && r.reason === "rude", "rude level name refused");
  { const bad = emptyLevel({ w: 60, h: 16 }); bad.entities.push({ t: "sign", x: 5, y: 12, text: "you are a fucking idiot" });
    r = await O.publishLevel(bad, { name: "Nice Sign", difficulty: 2 }); check(!r.ok && r.reason === "rude", "rude sign text refused " + JSON.stringify(r)); }
  let L = await O.listLevels();
  const it = L.levels.find((x) => x.id === id);
  check(L.ok && it && it.name === "Mossy Steps" && it.author === "Cube Fan" && it.difficulty === 3 && it.music === "campfire" && it.mine && it.w === 120, "listLevels " + JSON.stringify(it));
  let g = await O.getLevel(id);
  check(g.ok && g.level.w === 120 && g.level.tiles.length === 20 && g.level.music === "campfire" && g.meta.difficulty === 3, "getLevel round-trips the level");
  r = await O.publishLevel({ ...lv, name: "Mossy Steps II" }, { id, difficulty: 4, music: "aurora" });
  check(r.ok && r.id === id && r.updated, "republish updates in place");
  g = await O.getLevel(id); check(g.ok && g.level.name === "Mossy Steps II" && g.level.music === "aurora" && g.meta.difficulty === 4, "update visible");
  // plausibility: a run must have been started (startRun) long enough ago (>= 1/5 of the time, wall clock) and the
  // time must not beat half the AI's route. The wall clock is faked forward here instead of waiting.
  r = await O.submitTime(id, 45678); check(!r.ok && r.reason === "implausible", "a time with no started run is refused " + JSON.stringify(r));
  O.startRun(id); O.startRun("area1");
  const realNow = Date.now, t0 = realNow();
  Date.now = () => t0 + 10 * 60 * 1000;
  try {
    r = await O.submitTime(id, 45678); check(r.ok && r.rank === 1, "submitTime community " + JSON.stringify(r));
    r = await O.submitTime("area1", 123456); check(r.ok && r.rank === 1, "submitTime area1 " + JSON.stringify(r));
    r = await O.submitTime("area1", 5000); check(!r.ok && r.reason === "implausible", "area1 in 5 s (AI route ~57 s) refused " + JSON.stringify(r));
  } finally { Date.now = realNow; }
  O.startRun("area1");
  r = await O.submitTime("area1", 123456); check(!r.ok && r.reason === "implausible", "a 2-minute time 0 s after the run started is refused");
  r = await O.submitTime("area1", 100); check(!r.ok && r.reason === "invalid", "implausible time refused");
  let t = await O.getTop(id); check(t.ok && t.rows.length === 1 && t.rows[0].name === "Cube Fan" && t.rows[0].ms === 45678 && t.rows[0].me && t.me.rank === 1, "getTop " + JSON.stringify(t));
  t = await O.getTop("nope!"); check(!t.ok && t.reason === "invalid", "bad level id");
  r = await O.deleteLevel(id); check(r.ok, "deleteLevel");
  L = await O.listLevels(); check(L.ok && !L.levels.some((x) => x.id === id), "deleted level gone");
} catch (e) { fails.push("CRASH " + e.stack); console.log(e); }
const list = async () => (await (await fetch(RELAY + "/api/games?limit=100&q=" + encodeURIComponent(PREFIX) + "&token=" + TOKEN)).json()).games.filter((g) => g.name.startsWith(PREFIX) && g.authorId === "1d7249");
const recs = await list();
for (const g of recs) await fetch(RELAY + "/api/games/" + g.id, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: TOKEN }) });
console.log("cleanup: deleted " + recs.map((g) => g.name).join(", ") + "; left " + (await list()).length);
console.log(fails.length ? "FAILED " + fails.length : "ALL PASSED");
process.exit(fails.length ? 1 : 0);
