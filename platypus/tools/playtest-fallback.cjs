// playtest-fallback.cjs - PLATYPUS boards end to end on the REAL relay through ../platyfy-online.js (the fallback
// online.js uses while relay.platyfy.com answers 404 for /api/platypus/*). Two separate browser contexts (two
// "players", nothing shared): A picks a name and finishes a run; B, on a fresh profile, sees A's name and time on
// the board and cannot take A's name. The served platyfy-online.js gets a throwaway key prefix, so nothing touches
// the real boards, and every record made is deleted at the end.  node tools/playtest-fallback.cjs
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));
const SITE = path.join(__dirname, "..", "..");   // the repo root, laid out like platyfy.com
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const PREFIX = "pfo-e2e" + Math.floor(Math.random() * 1e5) + ":";
const TOKEN = "e38904a80e48e8e4604a1da3db1003c258c1beb130bb149decf1bbef104393a5", RELAY = "https://relay.platyfy.com";
const NAME = "Test Otter " + Math.floor(Math.random() * 90 + 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const fails = []; const check = (ok, what) => { log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) fails.push(what); };

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(SITE, p);
      if (!file.startsWith(SITE)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("nf"); return; }
        let body = buf;
        // a level that ends on one E (as in playtest-online.cjs)
        if (p === "/platypus/src/levels/level12.js") body = 'import { createPlaceholderLevel } from "./placeholder.js";\nexport const meta = { n: 12, title: "THE VOLCANO" };\nexport function createLevel(ctx) { return createPlaceholderLevel(ctx, { n: 12, title: "THE VOLCANO" }); }\n';
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(body);
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}
async function cleanup() {
  const l = await (await fetch(RELAY + "/api/games?limit=100&q=" + encodeURIComponent(PREFIX) + "&token=" + TOKEN)).json();
  const mine = l.games.filter((g) => g.name.startsWith(PREFIX) && g.authorId === "1d7249");
  for (const g of mine) await fetch(RELAY + "/api/games/" + g.id, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: TOKEN }) });
  const left = (await (await fetch(RELAY + "/api/games?limit=100&q=" + encodeURIComponent(PREFIX) + "&token=" + TOKEN)).json()).total;
  return { deleted: mine.map((g) => g.name), left };
}

(async () => {
  const srv = await serve();
  const URL0 = "http://127.0.0.1:" + srv.address().port + "/platypus/";
  const browser = await puppeteer.launch({ headless: "new", args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
  const wd = setTimeout(async () => { log("WATCHDOG"); try { await browser.close(); } catch (_) {} process.exit(2); }, 240000);
  const ctxs = [];
  async function player(tag) {
    const ctx = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
    ctxs.push(ctx);
    const page = await ctx.newPage();
    await page.evaluateOnNewDocument((p) => { window.__PLATYFY_ONLINE_TEST = { prefix: p }; }, PREFIX);  // throwaway keys
    await page.setViewport({ width: 1280, height: 800 });
    page._errors = [];
    page.on("pageerror", (e) => page._errors.push(tag + " pageerror: " + (e.message || e)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) page._errors.push(tag + " " + m.text()); });
    await page.goto(URL0, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.querySelector(".lvl[disabled]"), { timeout: 30000 });
    await page.evaluate(() => window.__platy.progress.unlock(13));
    return page;
  }
  const until = async (page, fn, ms, what) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn)) return true; await sleep(150); } log("  (timed out: " + what + ")"); return false; };
  const type = async (page, sel, text) => { await page.$eval(sel, (e) => { e.value = ""; e.focus(); }); await page.type(sel, text, { delay: 8 }); await sleep(80); };
  const fmt = (x) => { const m = Math.floor(x / 60000), sec = Math.floor((x % 60000) / 1000), cs = Math.floor((x % 1000) / 10); return m + ":" + String(sec).padStart(2, "0") + "." + String(cs).padStart(2, "0"); };
  try {
    log("A: " + NAME + ", key prefix " + PREFIX);
    const A = await player("A");
    check(await until(A, () => window.__platy.state().online.enabled, 15000, "A online"), "A: boards are ONLINE (the relay 404s /api/platypus, the fallback answers)");
    await A.click("#nameBtn"); await sleep(250);
    const sub = await A.$eval("#nameSub", (e) => e.textContent);
    check(/leaderboards/.test(sub), "A: the name dialog says it is for the leaderboards (" + sub + ")");
    await type(A, "#nameIn", NAME);
    await A.click("#nameSave");
    await until(A, () => !document.getElementById("nameDlg").classList.contains("on"), 15000, "A claimed");
    const s = await A.evaluate(() => window.__platy.state().online);
    check(s.claimed && s.name === NAME, "A: name claimed " + JSON.stringify(s));
    await A.evaluate(() => window.__platy.startLevel(12));
    await until(A, () => { const s = window.__platy.state(); return s.mode === "level" && s.step === "play"; }, 25000, "A play");
    await sleep(2200);
    await A.keyboard.press("KeyE");
    await until(A, () => document.getElementById("victory").classList.contains("on"), 10000, "A end card");
    await until(A, () => /in the world/.test(document.getElementById("vicRun").textContent), 20000, "A rank");
    const card = await A.$eval("#vicRun", (e) => e.textContent.replace(/\s+/g, " "));
    const run = await A.evaluate(() => window.__platy.state().run.result);
    check(/#1 in the world/.test(card), "A: the end card shows the world rank (" + card + ")");
    await A.screenshot({ path: path.join(SHOTS, "fallback-A-card.png") });
    const ms = run.ms;

    const B = await player("B");
    check(await until(B, () => window.__platy.state().online.enabled, 15000, "B online"), "B (fresh profile): boards online");
    await B.click("#trophyBtn"); await sleep(300);
    await B.click("#boards .btab:nth-child(12)");
    await until(B, () => !!document.querySelector("#boards .btable tbody tr:not(.sk)"), 20000, "B table");
    const rows = await B.$$eval("#boards .btable tbody tr:not(.sk)", (t) => t.map((r) => r.textContent.replace(/\s+/g, " ").trim()));
    check(rows.length === 1 && rows[0].includes(NAME) && rows[0].includes(fmt(ms)) && !rows[0].includes("(you)"), "B sees A's name and time on the Level 12 board: " + JSON.stringify(rows) + " (A ran " + fmt(ms) + ")");
    await B.screenshot({ path: path.join(SHOTS, "fallback-B-board.png") });
    await B.keyboard.press("Escape"); await sleep(200);
    await B.click("#nameBtn"); await sleep(250);
    await type(B, "#nameIn", NAME.toUpperCase());
    await B.click("#nameSave");
    await until(B, () => /already has/.test(document.getElementById("nameHint").textContent), 15000, "B taken");
    check(/already has that name/.test(await B.$eval("#nameHint", (e) => e.textContent)), "B cannot take A's name (any capitals)");
    check(A._errors.length + B._errors.length === 0, "no console errors " + JSON.stringify(A._errors.concat(B._errors).slice(0, 4)));
  } catch (e) { fails.push("CRASH " + (e.stack || e)); log("CRASH", e); }
  clearTimeout(wd);
  for (const c of ctxs) { try { await c.close(); } catch (_) {} }
  try { await browser.close(); } catch (_) {}
  srv.close();
  const c = await cleanup().catch((e) => ({ err: String(e) }));
  log("cleanup: " + JSON.stringify(c));
  log(fails.length ? "FAILED " + fails.length + ":\n  - " + fails.join("\n  - ") : "ALL PASSED");
  process.exit(fails.length ? 1 : 0);
})();
