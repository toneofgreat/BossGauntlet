// WORLD screenshots: node src/world/dev/shoot.cjs [filter] [--cols] [--w=1280 --h=720]
// (--use-gl=swiftshader loses the WebGL context within ~2 s on this machine: hardware GPU by default, --swiftshader = ANGLE swiftshader)
// Own static server (rooted at BossGauntlet) + one puppeteer browser inside the shared machine-wide browserlock.
const http = require("http"), fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, "../../../..");
const LOCAL_LOCK = path.join(ROOT, "totally-normal-rpg/tools/browserlock.cjs");
const lock = require(fs.existsSync(LOCAL_LOCK) ? LOCAL_LOCK : path.join(ROOT, "adventure-cube/tools/browserlock.cjs"));
const puppeteer = require(path.join(ROOT, "node_modules/puppeteer"));
const OUT = path.join(__dirname, "shots");
const args = process.argv.slice(2);
const filter = args.find((a) => !a.startsWith("--"));
const cols = args.includes("--cols");
const W = +((args.find((a) => a.startsWith("--w=")) || "--w=1280").slice(4)), H = +((args.find((a) => a.startsWith("--h=")) || "--h=720").slice(4));
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".png": "image/png" };
const SHOTS = [
  ["lobby", [14, 7, 20], [0, 2.5, 0]],
  ["lobbyBack", [-12, 6, -18], [0, 2.5, -2]],
  ["lobbyInterior", [-3.5, 1.9, 3], [3, 1.0, -3]],
  ["basement", [4.2, -1.6, -1.2], [1, -2.6, -6]],
  ["graves", [26, 4, 8], [32, 0, -6]],
  ["voidEdge", [-26, 4, 6], [-38, 0, -4]],
  ["bridge", [14, 5, 44], [0, 1.5, 60]],
  ["underBridge", [4, 0.6, 56], [-1.6, 0, 60]],
  ["waterfall", [-48, 5, 52], [-66, 4, 60]],
  ["cave", [-70, 2.4, 60], [-90, 1.5, 60]],
  ["ratField", [30, 9, 80], [0, 0, 105]],
  ["ratKing", [0, 12, 120], [0, 0, 150]],
  ["gate2", [10, 5, 160], [0, 3, 178]],
  ["village", [30, 16, 205], [0, 0, 240]],
  ["villageSquare", [10, 3, 228], [-4, 1.5, 245]],
  ["houseInterior", null, null, { house: 0 }],
  ["barn", [-60, 6, 250], [-80, 3, 236]],
  ["barnInside", [-74, 2.5, 236], [-86, 3, 236]],
  ["guardPost", [14, 6, 285], [0, 2, 302]],
  ["watchtower", [4, 14, 296], [11, 10, 306]],
  ["gate3", [10, 6, 314], [0, 4, 332]],
  ["castleRoad", [6, 12, 345], [0, 16, 395]],
  ["castle", [24, 34, 400], [0, 20, 450]],
  ["courtyard", [10, 21, 418], [0, 22, 450]],
  ["greatHall", [8, 21.5, 456], [0, 20, 474]],
  ["portrait", [-25, 20.4, 465], [-38, 20.5, 465]],
  ["throne", [3, 23, 486], [0, 22, 505]],
  ["kingDark", [2012, 6, 18], [2000, 0, 0]],
  ["desert", [-10, 6, -1680], [10, 2, -1730]],
  ["cactusFlower", [100, 6, -1940], [95, 5, -1950]],
  ["forest", [-1745, 3, 2], [-1800, 2, 0]],
  ["totem", [-1900, 2.8, 20], [-1900, 2.5, 32]],
  ["forestHouse", [-2140, 4, 6], [-2160, 2, 0]],
  ["forestHouseIn", [-2157, 2.2, 1.5], [-2163, 1.4, -2]],
  ["hollowDesert", [20, 8, -4040], [0, 1, -4100]],
  ["hollowRing", [0, 30, -4060], [0, 2, -4150], { ring: true }],
  ["finalArena", [40, 30, 8090], [0, 2, 8000]],
  ["village_ng", [30, 16, 205], [0, 0, 240], { cycle: 1 }],
  ["lobby_ng", [14, 7, 20], [0, 2.5, 0], { cycle: 1 }],
  ["ratField_ng", [30, 9, 80], [0, 0, 105], { cycle: 1 }],
];
const NEED_POINTS = "spawn bridgeFar ratField ratKingGate gate2 villageSquare exchange guardPost gate3 courtyard kingPortal throneDoor throneSeat lobbyBack graveShovel grave0 grave1 grave2 grave3 grave4 grave5 voidLeap well towerLetter portrait basement underBridge waterfallCave kitten0 kitten1 kitten2 barnDoor rookieShack cactusFlower totem desertArrive forestArrive forestHouseDoorOut forestHouseDoorFront desertExitNg forestHouseInside hollowArrive girl hollowFar hollowArena homePortal finalArrive finalBoss kingArrive kingSpot forestBackPortal desertBackPortal";
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rsp) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(p).pipe(rsp);
    });
    s.listen(0, "127.0.0.1", () => res({ url: "http://127.0.0.1:" + s.address().port, close: () => s.close() }));
  });
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await serve();
  await lock.acquire("tnrpg-world-shoot");
  let browser;
  try {
    browser = await puppeteer.launch({ headless: "new", dumpio: args.includes("--dumpio"), args: args.includes("--swiftshader") ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });
    const logs = [];
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warn" || m.type() === "warning") logs.push(m.type() + ": " + m.text()); });
    page.on("requestfailed", (r) => logs.push("reqfail " + r.url()));
    page.on("response", (r) => { if (r.status() >= 400) logs.push("HTTP " + r.status() + " " + r.url()); });
    page.on("pageerror", (e) => logs.push("pageerror: " + e.message));
    await page.goto(srv.url + "/totally-normal-rpg/src/world/dev/harness.html" + (cols ? "?cols=1" : ""), { waitUntil: "load" });
    await page.waitForFunction("window.__ready === true || (window.__errs && window.__errs.length > 0)", { timeout: 200000 });
    const errs0 = await page.evaluate(() => window.__errs);
    if (errs0.length && !(await page.evaluate(() => window.__ready))) { console.log("BOOT ERRORS", errs0, logs); return; }
    console.log("stats", JSON.stringify(await page.evaluate(() => window.__stats())), JSON.stringify(await page.evaluate(() => window.__marks)));
    const api = await page.evaluate((need) => {
      const w = window.__tnrpg.ctx.world;
      const miss = need.split(" ").filter((n) => !w.point(n));
      const props = "lobbyRockingChair throne throneCrack barnBell wellBucket lobbyRug trapdoor kitten0 kitten1 kitten2 cactusFlower totem shovel voidFence portrait letter glassRing".split(" ").filter((n) => !w.prop(n));
      const npcs = "bram nessa tobin ilsa pell odo wren fydorIdle mylesIdle sign".split(" ").filter((n) => !w.npc(n));
      const sp = "rat ratKing villager fydor myles royalGuard king cat rookie shadowRat".split(" ").map((k) => k + ":" + w.spawns(k).length).join(" ");
      return { missPoints: miss, missProps: props, missNpcs: npcs, graves: w.graves.length, missGates: ["area2", "area3"].filter((g) => !w.gate(g)), spawns: sp };
    }, NEED_POINTS);
    console.log("api", JSON.stringify(api));
    const matsArg = args.find((a) => a.startsWith("--mats="));
    if (matsArg) console.log(JSON.stringify(await page.evaluate((nm) => { let g = null; window.__tnrpg.ctx.world.root.traverse((o) => { if (o.name === nm) g = o; }); const out = []; if (g) g.traverse((o) => { if (o.isMesh) out.push((o.isInstancedMesh ? "I:" : "") + (o.material.name || o.material.type) + "/" + (o.material.map ? "map" : "-") + (o.material.transparent ? "/T" : "")); }); return out; }, matsArg.slice(7))));
    if (args.includes("--func")) {
      const r = await page.evaluate(async () => {
        const ctx = window.__tnrpg.ctx, w = ctx.world, pl = ctx.engine.player, bus = ctx.bus, out = {};
        const ev = []; for (const n of ["gate:open", "portal:denied", "portal:enter", "zone:enter", "interact:focus", "interact:use"]) bus.on(n, (p) => ev.push(n + ":" + JSON.stringify(p)));
        window.__stepN(2);
        // gates
        bus.emit("unlock", { id: "area2" }); window.__stepN(60, 0.05);
        out.gate2 = w.gate("area2").isOpen; out.gate3closed = !w.gate("area3").isOpen;
        // gate3 approach (denied)
        await w.goto("gate3", { pos: { x: 0, y: 0, z: 330 }, fade: false }); window.__stepN(8, 0.05);
        // king portal denied then allowed
        const kp = w.point("kingPortal");
        await w.goto("castle", { pos: { x: kp.x, y: kp.y, z: kp.z - 4 }, fade: false }); window.__stepN(50, 0.05);
        pl.position.set(kp.x, kp.y, kp.z); window.__stepN(4, 0.05);
        out.afterDenied = w.current;
        window.__open = true; window.__stepN(50, 0.05); pl.position.set(kp.x, kp.y + 0.1, kp.z); window.__stepN(4, 0.05);
        await new Promise((r) => setTimeout(r, 50)); window.__stepN(4, 0.05);
        out.afterAllowed = w.current;
        // desert wrap
        await w.goto("desert", { fade: false }); window.__stepN(4, 0.05);
        pl.position.set(0, 0, -2000 - 336); pl.velocity.set(0, 0, -5); window.__stepN(1, 0.05);
        out.wrapZ = Math.round(pl.position.z);
        // trapdoor via interact
        await w.goto("lobby", { pos: { x: 2, y: 0.4, z: -0.6 }, yaw: Math.PI, fade: false }); pl.yaw = Math.PI; window.__stepN(10, 0.05);
        bus.emit("input:interact", {}); window.__stepN(4, 0.05); bus.emit("input:interact", {}); window.__stepN(4, 0.05);
        out.trapOpen = w.prop("trapdoor").userData.isOpen();
        // run reset + cycle 1
        ctx.state.run.cycle = 1; bus.emit("run:reset", { cycle: 1 }); out.trapAfterReset = w.prop("trapdoor").userData.isOpen();
        out.events = ev.slice(0, 30);
        return out;
      });
      console.log("func", JSON.stringify(r, null, 1));
    }
    for (const [name, cam, look, o] of SHOTS) {
      if (filter && !name.includes(filter)) continue;
      const info = await page.evaluate(async (cam, look, o) => {
        o = o || {};
        const w = window.__tnrpg.ctx.world;
        if (o.house != null) {
          const { villageHouse } = await import("../zones.js");
          const hs = villageHouse(o.house);
          const fx = Math.sin(hs.yaw), fz = Math.cos(hs.yaw);
          cam = [hs.x + fx * 2.2 - fz * 1.5, 1.75, hs.z + fz * 2.2 + fx * 1.5];
          look = [hs.x - fx * 2.5 + fz * 1.0, 1.0, hs.z - fz * 2.5 - fx * 1.0];
        }
        if (o.ring) w.prop("glassRing").userData.setRaised(1, 0);
        return window.__shot({ cam, look, cycle: o.cycle != null ? o.cycle : 0, player: look });
      }, cam, look, o || null);
      await page.screenshot({ path: path.join(OUT, name + ".png") });
      console.log(name.padEnd(16), JSON.stringify(info));
      const pk = args.find((a) => a.startsWith("--pick="));
      if (pk) { const [px, py] = pk.slice(7).split(",").map(Number); console.log("pick", JSON.stringify(await page.evaluate((a, b) => window.__pick(a, b), px, py))); }
      if (args.includes("--bd")) console.log(JSON.stringify(await page.evaluate(() => window.__breakdown())));
      if (lock.touch) lock.touch();
    }
    const errs = await page.evaluate(() => window.__errs);
    if (errs.length) console.log("ERRORS", errs);
    if (logs.length) console.log("LOGS\n" + [...new Set(logs)].slice(0, 40).join("\n"));
  } finally {
    if (browser) await browser.close();
    lock.release();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
