// playtest-online.cjs - the ONLINE + ENGINE side of LEVELS3.md Part A, in a real (headless) browser.
//   node tools/playtest-online.cjs            everything
//   node tools/playtest-online.cjs --only=offline|names|timer|migrate|online|hard
// Covers: 13 circles and their layouts; the name rules (60 bad / 60 good + more) and JS/SQL fold parity; the name
// dialog offline; the run timer (start, pause on blur, PB, practice runs); old saves loading; the boards offline
// ("coming soon", no fetch at all); then online against a MOCKED Supabase (page.setRequestInterception): claim,
// taken, rude from the server, rename keeps the old name reserved, start_run / submit_time with rank, implausible,
// the boards (rows, "you", pinned row, error + retry, the coins board's HARD badge); and Level 4 hard mode
// (unlock after 5 wins, the NORMAL / HARD choice, 8 fixed scattered buttons, the faster lane, a bot-played show).
// One headless browser, foreground; it closes the browser and the server when it ends (and on a watchdog).
// Screenshots: tools/shots/online-NN-name.png
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { pathToFileURL } = require("url");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const ROOT = path.join(__dirname, "..");
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json" };
const arg = (k) => { const a = process.argv.find((x) => x.startsWith("--" + k + "=")); return a ? a.split("=")[1] : null; };
const ONLY = arg("only");
const want = (k) => !ONLY || ONLY.split(",").includes(k);
// --head=src/audio.js,src/music.js serves those files from git HEAD (when another builder's copy is mid-edit)
const HEAD = (arg("head") || "").split(",").filter(Boolean).map((f) => ["/" + f, require("child_process").execSync("git show HEAD:platypus/" + f, { cwd: ROOT, maxBuffer: 64 << 20 }).toString()]);
const MOCK = "https://mock-platy.supabase.co";

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(ROOT, p);
      if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("nf"); return; }
        res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
        res.end(buf);
      });
    });
    srv.listen(0, "127.0.0.1", () => resolve(srv));
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------- name suites
const BAD = ["xXfUcKXx", "sh1t", "a s s", "n1gg", "FUCK", "f u c k", "f.u.c.k", "f_u-c_k", "fuuuuck", "Phuck", "b1tch", "BiTcH",
  "a55hole", "assh0le", "dickhead", "d1ck", "c0ck", "cocksucker", "pussy99", "pu55y", "n1gga", "nigger", "f4gg0t", "faggot",
  "r3tard", "retarded", "kys", "KYS now", "k y s", "killyourself", "Hitler88", "h1tl3r", "nazi", "N4Z1", "porn", "p0rn", "s3x",
  "sexy_pip", "whore", "slut", "5lut", "twat", "cunt", "Admin", "adm1n", "Moderator", "roblox", "Platyfy", "official", "puta",
  "mierda", "merde", "scheisse", "cazzo", "kurwa", "blyat", "orospu", "putangina", "chutiya", "bhenchod", "fotze", "pendejo",
  "caralho", "r4pe", "b00bs", "dildo", "ashole", "asssshole", "biiiitch", "ShItHeAd", "FuCk_YoU", "p e n i s", "w h o r e"];
const GOOD = ["Bass Player", "Classy Pip", "Cassie", "Grass_Kid", "Dickens", "Peacock7", "Scunthorpe", "Hancock", "Cocktail Pip",
  "Glass Otter", "Assist King", "Passion Fruit", "Shitake Chef", "Sussex Sam", "Cockatoo", "Brave Otter42", "Pip", "Platypus Pro",
  "Mr Splash", "Speedy_Gonzo", "Kid99", "Ella", "Maya-2", "Grape Juice", "Raccoon", "Analyst", "Japan Fan", "Spicy Taco", "Homer",
  "Cucumber", "Document", "Skyscraper", "Titanic", "Stitch", "Massive", "Embassy", "Compass", "Hassan", "Nick3", "Lucky7", "Sam5",
  "Jake", "Spike", "Bob", "Coke Zero", "Nicky", "Rick Ross", "Max42", "Lily", "Ava", "Noah", "Olivia", "Emma_123", "Liam", "Oscar",
  "Ruby", "Leo", "Zoe", "Muffin Man", "Biscuit", "Phoebe", "Georgia", "Picasso", "Shoebox"];
const REASONS = [["ab", "short"], ["   a   ", "short"], ["abcdefghijklmnopq", "long"], ["Pip!", "chars"], ["Pípa", "chars"], ["12345", "letters"],
  ["a1234", "letters"], ["  Classy   Pip  ", "ok:Classy Pip"]];

// a JavaScript port of the SQL platy_fold (supabase/schema.sql), written independently of names.js
function sqlFold(t, leet) {
  const translate = (s, from, to) => { let o = ""; for (const ch of s) { const i = Array.from(from).indexOf(ch); o += i < 0 ? ch : Array.from(to)[i] || ""; } return o; };
  let s = t.toLowerCase();
  if (leet) s = translate(s, "0123456789@$!|+€£¥", "oizeasgtbgasiltely").split("ph").join("f").split("vv").join("w").split("ck").join("k").split("q").join("k");
  return s.replace(/[^a-z]/g, "");
}

// ---------------------------------------------------------------------------------------------- mock Supabase
function createMock(names) {
  const M = {
    players: new Map(),   // id -> { id, hash, name, renamedAt }
    byHash: new Map(),
    namesEver: new Map(), // lname -> player id
    runs: new Map(),      // id -> { player, level, hard, at, used }
    times: new Map(),     // level -> Map(player -> ms)
    coins: new Map(),     // player -> { coins, hard }
    calls: [],
    serverRude: new Set(["pipsterbad"]), // names the client accepts but this server refuses
    minMs: 0, rankOffset: 36, fail: {}, delay: 0, slowRename: false,
  };
  const uuid = () => crypto.randomUUID();
  const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");
  const clean = (n) => String(n || "").trim().replace(/\s+/g, " ");
  const player = (tok, create) => {
    if (!/^[0-9a-f]{64}$/.test(tok || "")) return null;
    const h = hash(tok);
    let p = M.byHash.get(h);
    if (!p && create) { p = { id: uuid(), hash: h, name: null }; M.byHash.set(h, p); M.players.set(p.id, p); }
    return p || null;
  };
  const nameOk = (nm) => {
    const c = names.checkName(nm);
    if (!c.ok) return c.reason === "rude" ? "rude" : "invalid";
    if (M.serverRude.has(nm.toLowerCase().replace(/[^a-z]/g, ""))) return "rude";
    return null;
  };
  function rename(b) {
    const p = player(b.p_token, false);
    if (!p) return { ok: false, reason: "invalid" };
    const nm = clean(b.p_name), why = nameOk(nm);
    if (why) return { ok: false, reason: why };
    const ln = nm.toLowerCase();
    if (M.namesEver.get(ln) === p.id) { p.name = nm; return { ok: true, id: p.id, name: nm }; }
    if (M.namesEver.has(ln)) return { ok: false, reason: "taken" };
    M.namesEver.set(ln, p.id); p.name = nm;
    return { ok: true, id: p.id, name: nm };
  }
  const rpc = {
    claim_name(b) {
      if (!/^[0-9a-f]{64}$/.test(b.p_token || "")) return { ok: false, reason: "invalid" };
      const nm = clean(b.p_name), why = nameOk(nm);
      if (why) return { ok: false, reason: why };
      const p = player(b.p_token, true);
      if (p.name) return rename(b);
      const ln = nm.toLowerCase();
      if (M.namesEver.get(ln) === p.id) { p.name = nm; return { ok: true, id: p.id, name: nm }; }
      if (M.namesEver.has(ln)) return { ok: false, reason: "taken", id: p.id };
      M.namesEver.set(ln, p.id); p.name = nm;
      return { ok: true, id: p.id, name: nm };
    },
    rename_player: rename,
    start_run(b) {
      const p = player(b.p_token, true);
      if (!p || !(b.p_level >= 1 && b.p_level <= 13)) return { ok: false, reason: "invalid" };
      const id = uuid();
      M.runs.set(id, { player: p.id, level: b.p_level, hard: b.p_level === 4 && !!b.p_hard, at: Date.now(), used: false });
      return { ok: true, run: id };
    },
    submit_time(b) {
      const p = player(b.p_token, false);
      if (!p) return { ok: false, reason: "invalid" };
      if (!p.name) return { ok: false, reason: "noname" };
      const r = M.runs.get(b.p_run);
      if (!r || r.used || r.player !== p.id || r.level === 4) return { ok: false, reason: "invalid" };
      if (!(b.p_ms >= M.minMs) || b.p_ms > Date.now() - r.at + 2000) return { ok: false, reason: "implausible" };
      r.used = true;
      if (!M.times.has(r.level)) M.times.set(r.level, new Map());
      const t = M.times.get(r.level), old = t.get(p.id);
      if (!old || old > b.p_ms) t.set(p.id, b.p_ms);
      const best = t.get(p.id);
      let rk = 1; for (const v of t.values()) if (v < best) rk++;
      return { ok: true, best, rank: rk + M.rankOffset };
    },
    submit_coins(b) {
      const p = player(b.p_token, false);
      if (!p) return { ok: false, reason: "invalid" };
      if (!p.name) return { ok: false, reason: "noname" };
      const r = M.runs.get(b.p_run);
      if (!r || r.used || r.player !== p.id || r.level !== 4) return { ok: false, reason: "invalid" };
      if (b.p_coins > (r.hard ? 3300 : 700)) return { ok: false, reason: "implausible" };
      r.used = true;
      const old = M.coins.get(p.id);
      if (!old || old.coins < b.p_coins) M.coins.set(p.id, { coins: b.p_coins, hard: r.hard });
      const cur = M.coins.get(p.id);
      let rk = 1; for (const v of M.coins.values()) if (v.coins > cur.coins) rk++;
      return { ok: true, best: cur.coins, rank: rk };
    },
    my_rank(b) {
      const p = player(b.p_token, false);
      if (!p) return { ok: false };
      if (b.p_level === 4) { const c = M.coins.get(p.id); if (!c) return { ok: true }; let rk = 1; for (const v of M.coins.values()) if (v.coins > c.coins) rk++; return { ok: true, rank: rk + (M.meRankOffset || 0), coins: c.coins, hard: c.hard }; }
      const t = M.times.get(b.p_level), v = t && t.get(p.id);
      if (!v) return { ok: true };
      let rk = 1; for (const x of t.values()) if (x < v) rk++;
      return { ok: true, rank: rk + M.rankOffset, ms: v };
    },
  };
  M.fakeTimes = (level) => {
    const rows = [];
    for (let i = 0; i < 12; i++) rows.push({ level, rank: i + 1, name: ["Zippy Comet", "Golden Tide", "Swift Otter", "Bouncy Pip", "Misty Lemur", "Rapid Gecko", "Tiny Robin", "Bold Badger", "Cheery Panda", "Snowy Koala", "Lucky Puffin", "Jolly Acorn"][i], ms: 420000 + i * 3170 });
    const t = M.times.get(level);
    if (t && M.includeMe) for (const [pid, ms] of t) rows.push({ level, rank: 13, name: M.players.get(pid).name, ms });
    return rows;
  };
  M.fakeCoins = () => {
    const rows = [{ rank: 1, name: "Golden Tide", coins: 2310, hard: true }, { rank: 2, name: "Zippy Comet", coins: 1920, hard: true }, { rank: 3, name: "Swift Otter", coins: 611, hard: false }, { rank: 4, name: "Misty Lemur", coins: 540, hard: false }];
    for (const [pid, c] of M.coins) rows.push({ rank: 5, name: M.players.get(pid).name, coins: c.coins, hard: c.hard });
    return rows;
  };
  M.handle = (method, url, body) => {
    const u = new URL(url);
    M.calls.push(method + " " + u.pathname + u.search);
    if (u.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = u.pathname.slice(13);
      if (M.fail[fn]) return { status: M.fail[fn], body: { message: "boom" } };
      if (!rpc[fn]) return { status: 404, body: { message: "no fn" } };
      return { status: 200, body: rpc[fn](body ? JSON.parse(body) : {}) };
    }
    if (u.pathname === "/rest/v1/top_times") {
      if (M.fail.top_times) return { status: M.fail.top_times, body: { message: "boom" } };
      const lv = +(u.searchParams.get("level") || "").replace("eq.", "");
      return { status: 200, body: M.empty ? [] : M.fakeTimes(lv).map(({ rank, name, ms }) => ({ rank, name, ms })) };
    }
    if (u.pathname === "/rest/v1/top_coins") {
      if (M.fail.top_coins) return { status: M.fail.top_coins, body: { message: "boom" } };
      return { status: 200, body: M.fakeCoins() };
    }
    return { status: 404, body: { message: "nf" } };
  };
  return M;
}

// ---------------------------------------------------------------------------------------------- main
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const f of fs.readdirSync(SHOTS)) if (f.startsWith("online-")) fs.unlinkSync(path.join(SHOTS, f));
  const names = await import(pathToFileURL(path.join(ROOT, "src", "names.js")).href);
  const srv = await serve();
  const BASE = "http://127.0.0.1:" + srv.address().port;
  const URL0 = BASE + "/index.html";
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
    defaultViewport: { width: 1280, height: 720 },
  });
  let page = null;
  const LIMIT = +(arg("limit") || 540) * 1000;
  const wd = setTimeout(async () => { console.log("WATCHDOG: closing"); try { await browser.close(); } catch (_) {} srv.close(); process.exit(2); }, LIMIT);
  const T0 = Date.now();
  const log = (m) => console.log("[" + ((Date.now() - T0) / 1000).toFixed(0).padStart(3) + "s] " + m);
  const fails = [];
  const check = (ok, what) => { if (ok) log("  ok   " + what); else { fails.push(what); log("  FAIL " + what); } };
  let shotN = 0;
  const shot = async (name) => { shotN++; const f = path.join(SHOTS, "online-" + String(shotN).padStart(2, "0") + "-" + name + ".png"); await page.screenshot({ path: f }); return f; };

  let errors = [], external = [], allowedErr = [];
  let mock = null, onlineCfg = false;
  async function newPage(o) {
    if (page) { try { await page.close(); } catch (_) {} try { await page._ctxB.close(); } catch (_) {} }
    const ctxB = browser.createBrowserContext ? await browser.createBrowserContext() : await browser.createIncognitoBrowserContext();
    page = await ctxB.newPage();
    page._ctxB = ctxB;
    if (o && o.viewport) await page.setViewport(o.viewport);
    errors = []; external = [];
    page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
    page.on("console", (m) => {
      if (m.type() !== "error" && m.type() !== "warning") return;
      const t = m.text();
      if (allowedErr.some((a) => t.includes(a))) return;
      errors.push(m.type() + ": " + t);
    });
    await page.setRequestInterception(true);
    page.on("request", async (req) => {
      const u = req.url();
      try {
        if (u.startsWith(BASE)) {
          if (onlineCfg && u.includes("/src/online-config.js")) {
            return req.respond({ status: 200, contentType: "text/javascript", headers: { "Cache-Control": "no-store" },
              body: 'export const SUPABASE_URL = "' + MOCK + '";\nexport const SUPABASE_ANON_KEY = "test-anon-key";\n' });
          }
          // level 12 is real now: the timer / board checks still need a level that ends on one E, so serve the placeholder
          if (u.split("?")[0].endsWith("/src/levels/level12.js")) {
            return req.respond({ status: 200, contentType: "text/javascript", headers: { "Cache-Control": "no-store" },
              body: 'import { createPlaceholderLevel } from "./placeholder.js";\nexport const meta = { n: 12, title: "THE VOLCANO" };\nexport function createLevel(ctx) { return createPlaceholderLevel(ctx, { n: 12, title: "THE VOLCANO" }); }\n' });
          }
          for (const [p, body] of HEAD) if (u.split("?")[0].endsWith(p)) return req.respond({ status: 200, contentType: "text/javascript", body });
          return req.continue();
        }
        if (u.startsWith(MOCK) && mock) {
          const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "apikey, authorization, content-type, accept", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
          if (req.method() === "OPTIONS") return req.respond({ status: 204, headers: cors, body: "" });
          if (mock.delay) await sleep(mock.delay);
          const h = req.headers();
          if (h.apikey !== "test-anon-key" || h.authorization !== "Bearer test-anon-key") return req.respond({ status: 401, headers: cors, contentType: "application/json", body: "{}" });
          if (/[0-9a-f]{64}/.test(u)) mock.tokenInUrl = true;
          const r = mock.handle(req.method(), u, req.postData());
          return req.respond({ status: r.status, headers: cors, contentType: "application/json", body: JSON.stringify(r.body) });
        }
        external.push(u);
        return req.abort();
      } catch (e) { try { req.continue(); } catch (_) {} }
    });
    if (o && o.storage) {
      await page.evaluateOnNewDocument((st) => { if (!sessionStorage.getItem("__seeded")) { sessionStorage.setItem("__seeded", "1"); localStorage.clear(); for (const k in st) localStorage.setItem(k, st[k]); } }, o.storage);
    }
    await page.goto(URL0, { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.querySelector(".lvl[disabled]"), { timeout: 30000 });
    await sleep(400);
    if (o && o.unlock) await page.evaluate(() => window.__platy.progress.unlock(13));
    return page;
  }
  const S = () => page.evaluate(() => { const s = window.__platy.state(); return { mode: s.mode, levelN: s.levelN, run: s.run, online: s.online, progress: s.progress, cinema: s.cinema, levelOpts: s.levelOpts, step: s.step }; });
  const until = async (fn, ms, what) => { const t = Date.now(); while (Date.now() - t < ms) { if (await page.evaluate(fn)) return true; await sleep(100); } log("  (timed out waiting: " + what + ")"); return false; };
  const toMenu = async () => { await until(() => window.__platy.state().mode === "menu" && !document.getElementById("black").classList.contains("on"), 15000, "menu"); await sleep(500); };
  const type = async (sel, text) => { await page.$eval(sel, (e) => { e.value = ""; e.focus(); }); await page.type(sel, text, { delay: 8 }); await sleep(80); };
  const hint = () => page.$eval("#nameHint", (e) => e.textContent);
  // play the placeholder level (12) to the end with real input: title card, then E
  const playPlaceholder = async (n, beforeWin) => {
    await page.evaluate((n) => window.__platy.startLevel(n), n);
    await until(() => { const s = window.__platy.state(); return s.mode === "level" && s.step === "play"; }, 20000, "placeholder play");
    if (beforeWin) await beforeWin();
    await page.keyboard.press("KeyE");
    await until(() => document.getElementById("victory").classList.contains("on"), 8000, "end card");
    await sleep(1800);
    lastCard = await page.$eval("#vicRun", (e) => e.textContent);
    await page.click("#again");
    await toMenu();
    return lastCard;
  };
  let lastCard = "";

  try {
    // ======================================================================================== OFFLINE
    if (want("offline") || want("names") || want("timer") || want("migrate")) {
      onlineCfg = false; mock = null;
      await newPage();
    }
    if (want("offline")) {
      log("OFFLINE: circles, layouts, boards");
      const circles = await page.$$eval(".lvl", (b) => b.map((x) => ({ n: +x.dataset.n, cls: x.className, r: x.getBoundingClientRect() })));
      check(circles.length === 13, "13 circles (" + circles.length + ")");
      const c12 = await page.$eval("#lvl12", (e) => getComputedStyle(e).getPropertyValue("--glow").trim());
      check(/255, ?106, ?26/.test(c12), "circle 12 is lava orange (" + c12 + ")");
      const c13 = await page.$eval("#lvl13", (e) => getComputedStyle(e).getPropertyValue("--glow").trim());
      check(/139, ?77, ?255/.test(c13), "circle 13 is deep purple (" + c13 + ")");
      const rows = async () => page.$$eval(".lvl", (b) => { const ys = []; for (const x of b) { const y = Math.round(x.getBoundingClientRect().top); if (!ys.some((v) => Math.abs(v - y) < 8)) ys.push(y); } return ys.length; });
      const rowCounts = async () => page.$$eval(".lvl", (b) => { const m = []; for (const x of b) { const y = Math.round(x.getBoundingClientRect().top); let r = m.find((v) => Math.abs(v.y - y) < 8); if (!r) m.push(r = { y, n: 0 }); r.n++; } return m.map((v) => v.n).join("+"); });
      const wmin = async () => page.$$eval(".lvl", (b) => Math.min(...b.map((x) => x.getBoundingClientRect().width)));
      const overlapButtons = async () => page.evaluate(() => {
        const rs = Array.from(document.querySelectorAll(".lvl")).map((x) => x.getBoundingClientRect());
        const hit = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
        const bad = [];
        for (const id of ["nameBtn", "trophyBtn"]) { const r = document.getElementById(id).getBoundingClientRect(); if (r.width < 48 || r.height < 48) bad.push(id + " small"); for (const c of rs) if (hit(r, c)) bad.push(id + " covers a circle"); }
        if (document.documentElement.scrollWidth > window.innerWidth + 1) bad.push("horizontal scroll");
        return bad;
      });
      check((await rowCounts()) === "13" && (await wmin()) >= 56, "1280x720: one row of 13 (" + (await rowCounts()) + ", min " + (await wmin()).toFixed(0) + " px)");
      check((await overlapButtons()).length === 0, "NAME / TROPHY are 48px+ and cover no circle at 1280 " + JSON.stringify(await overlapButtons()));
      await shot("menu-1280");
      for (const [w, h, wantRows, nm] of [[1024, 768, "7+6", "tablet"], [844, 390, "7+6", "phone-landscape"], [390, 844, "5+4+4", "phone-portrait"], [1600, 900, "13", "wide"]]) {
        await page.setViewport({ width: w, height: h });
        await sleep(250);
        const rc = await rowCounts();
        check(rc === wantRows, w + "x" + h + ": rows " + rc + " (want " + wantRows + ")");
        const ob = await overlapButtons();
        check(ob.length === 0, w + "x" + h + ": buttons clear " + JSON.stringify(ob));
        await shot("menu-" + nm);
      }
      await page.setViewport({ width: 1280, height: 720 });
      await sleep(200);
      // boards offline
      await page.click("#trophyBtn");
      await sleep(300);
      const offTxt = await page.$eval("#boards .bbody", (e) => e.textContent);
      check(/coming soon/i.test(offTxt), "offline boards say coming soon");
      const tabs = await page.$$eval("#boards .btab", (t) => t.map((x) => x.textContent));
      check(tabs.length === 13 && tabs[3].includes("4"), "13 tabs, coins tab 4 (" + tabs.join(" ") + ")");
      await page.keyboard.press("ArrowRight"); await sleep(100); await page.keyboard.press("ArrowRight"); await sleep(150);
      const cur = await page.$eval("#boards .btab.on", (e) => e.textContent);
      check(cur === "3", "arrow keys move between tabs (" + cur + ")");
      await shot("boards-offline");
      await page.keyboard.press("Escape"); await sleep(200);
      check(!(await page.$eval("#boards", (e) => e.classList.contains("on"))), "Esc closes the boards");
    }
    if (want("names")) {
      log("NAMES: rules in the browser, fold parity, the dialog offline");
      const res = await page.evaluate(async (BAD, GOOD, REASONS) => {
        const N = await import("./src/names.js");
        const badOk = BAD.filter((n) => N.checkName(n).ok);
        const goodBad = GOOD.filter((n) => !N.checkName(n).ok).map((n) => n + ":" + N.checkName(n).reason);
        const reasons = REASONS.map(([n, r]) => { const c = N.checkName(n); const got = c.ok ? "ok:" + c.name : c.reason; return got === r ? null : n + " -> " + got + " (want " + r + ")"; }).filter(Boolean);
        const rnd = []; for (let i = 0; i < 200; i++) { const s = N.randomName(); if (!N.checkName(s).ok || s.length > 16) rnd.push(s); }
        const wl = N.wordLists();
        const strs = []; let seed = 7;
        const R = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
        const AL = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@$!|+€£¥ _-.phvvckq";
        for (let i = 0; i < 200; i++) { let s = ""; const L = 3 + ((R() * 14) | 0); for (let j = 0; j < L; j++) s += AL[(R() * AL.length) | 0]; strs.push(s); }
        const folds = strs.map((s) => [s, N.fold(s, false), N.fold(s, true)]);
        return { badOk, goodBad, reasons, rnd, banned: wl.bannedStems, allowed: wl.allowedWords, folds };
      }, BAD, GOOD, REASONS);
      check(BAD.length >= 60 && res.badOk.length === 0, BAD.length + " bad names all rejected " + JSON.stringify(res.badOk));
      check(GOOD.length >= 60 && res.goodBad.length === 0, GOOD.length + " good names all accepted " + JSON.stringify(res.goodBad));
      check(res.reasons.length === 0, "short / long / chars / letters / clean-up reasons " + JSON.stringify(res.reasons));
      check(res.rnd.length === 0, "200 dice names are all valid " + JSON.stringify(res.rnd.slice(0, 3)));
      check(res.banned >= 400 && res.allowed >= 40, "word lists: " + res.banned + " banned stems, " + res.allowed + " allowed words");
      const par = res.folds.filter(([s, a, b]) => sqlFold(s, false) !== a || sqlFold(s, true) !== b);
      check(par.length === 0, "200 strings fold the same in JS and in the SQL port " + JSON.stringify(par.slice(0, 2)));
      // node copy of names.js agrees with the browser (same module, both runtimes)
      check(BAD.every((n) => !names.checkName(n).ok) && GOOD.every((n) => names.checkName(n).ok), "names.js gives the same answers in node");
      // schema.sql carries exactly the names.js lists
      const sql = fs.readFileSync(path.join(ROOT, "supabase", "schema.sql"), "utf8");
      const wl = names.wordLists();
      const ins = (tbl) => { const m = sql.match(new RegExp("insert into public\\." + tbl + " \\(word\\) values([\\s\\S]*?)on conflict")); return m ? (m[1].match(/'([^']*)'/g) || []).map((x) => x.slice(1, -1)) : []; };
      const sb = ins("banned_words"), sa = ins("allowed_words");
      check(sb.length === wl.banned.length && sb.every((w, i) => w === wl.banned[i]) && sa.length === wl.allowed.length && sa.every((w, i) => w === wl.allowed[i]),
        "schema.sql word lists equal names.js (" + sb.length + " / " + sa.length + "; run tools/gen-wordlists.cjs if not)");
      const tr = sql.match(/translate\(lower\(t\), '([^']*)', '([^']*)'\)/);
      check(tr && tr[1] === "0123456789@$!|+€£¥" && tr[2] === "oizeasgtbgasiltely", "schema.sql leet map is the JS map");
      // the dialog, offline
      await page.click("#nameBtn"); await sleep(250);
      check(await page.$eval("#nameDlg", (e) => e.classList.contains("on")), "NAME opens the dialog");
      await type("#nameIn", "f u c k");
      check(/kinder/.test(await hint()) && await page.$eval("#nameSave", (b) => b.disabled), "'f u c k' -> kind hint, SAVE disabled");
      await type("#nameIn", "Pip!");
      check(/Only letters/.test(await hint()), "'Pip!' -> chars hint");
      await type("#nameIn", "ab");
      check(/3 to 16/.test(await hint()), "'ab' -> length hint");
      // game keys do not fire while typing: state must stay on the menu, and WASD typed into the field
      await type("#nameIn", "wasd");
      check((await page.$eval("#nameIn", (e) => e.value)) === "wasd", "typing WASD goes into the field");
      await page.click("#nameDice"); await sleep(100);
      const dice = await page.$eval("#nameIn", (e) => e.value);
      check(names.checkName(dice).ok, "the dice suggests a valid name (" + dice + ")");
      await shot("name-dialog");
      await type("#nameIn", "Classy Pip");
      await page.click("#nameSave"); await sleep(300);
      const nb = await page.$eval("#nameBtn .nm", (e) => e.textContent);
      const ls = await page.evaluate(() => localStorage.getItem("platypus.name.v1"));
      check(nb === "Classy Pip" && ls === '"Classy Pip"', "offline SAVE stores the name locally and shows it (" + nb + ", " + ls + ")");
      check(external.length === 0, "offline: not one request left the page (" + external.slice(0, 3).join(", ") + ")");
    }
    if (want("timer")) {
      log("TIMER: start, pause, PB, practice");
      await page.evaluate(() => window.__platy.unlockAll());
      await page.evaluate(() => window.__platy.startLevel(12));
      await until(() => window.__platy.state().step === "play", 20000, "L12 play");
      let s = await S();
      check(s.run.running && s.run.level === 12 && !s.run.assisted, "the run starts with the level (" + JSON.stringify({ r: s.run.running, l: s.run.level }) + ")");
      check(s.run.ms < 2500, "the clock restarted when the title card finished (" + s.run.ms + " ms)");
      const clockOn = await page.$eval("#runClock", (e) => e.classList.contains("on") && getComputedStyle(e).display !== "none");
      check(clockOn, "the HUD shows the clock");
      await sleep(1200);
      const a = (await S()).run.ms;
      const txt = await page.$eval("#runClock .t", (e) => e.textContent);
      check(/^\d+:\d\d\.\d\d$/.test(txt), "clock format m:ss.cc (" + txt + ")");
      await page.evaluate(() => window.dispatchEvent(new Event("blur")));
      await sleep(800);
      const b = (await S()).run;
      await sleep(600);
      const c = (await S()).run;
      check(b.paused && Math.abs(c.ms - b.ms) < 5, "blur pauses the clock (" + b.ms + " -> " + c.ms + ")");
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await sleep(500);
      const d = (await S()).run;
      check(!d.paused && d.ms > c.ms + 300, "focus resumes it (" + d.ms + ")");
      await shot("timer-hud");
      await page.keyboard.press("KeyE");
      await until(() => document.getElementById("victory").classList.contains("on"), 8000, "end card");
      await sleep(1800);
      await shot("end-card");
      const vic = await page.$eval("#vicRun", (e) => e.textContent);
      await page.click("#again");
      await toMenu();
      s = await S();
      const best = await page.evaluate(() => window.__platy.progress.best(12));
      check(s.run.stopped && s.run.result && s.run.result.pb && best > 0 && Math.abs(best - s.run.result.ms) < 2, "win stops the clock and saves a PB (" + best + " ms)");
      const card = { t: vic };
      check(/TIME \d+:\d\d\.\d\d/.test(card.t) && /NEW BEST/.test(card.t) && !/in the world/.test(card.t), "the main screen shows TIME + NEW BEST (" + card.t.replace(/\s+/g, " ").slice(0, 60) + ")");
      await shot("run-card");
      // a slower run is not a PB; a run that used the seam is practice
      await playPlaceholder(12, async () => { await sleep(2500); });
      const r2 = (await S()).run.result;
      check(r2 && !r2.pb && !r2.practice && (await page.evaluate(() => window.__platy.progress.best(12))) === best, "a slower run keeps the old PB");
      await playPlaceholder(12, async () => { await page.evaluate(() => window.__platy.tp(1, 1)); });
      const r3 = (await S()).run.result;
      const t3 = lastCard;
      check(r3 && r3.practice && !r3.pb && /practice/.test(t3), "a run that used the debug seam says (practice - not saved)");
      // PB shown on the next run's HUD
      await page.evaluate(() => window.__platy.startLevel(12));
      await until(() => window.__platy.state().step === "play", 20000, "L12 play");
      const pbTxt = await page.$eval("#runClock .pb", (e) => e.textContent);
      check(/^PB \d+:\d\d\.\d\d$/.test(pbTxt), "the HUD shows the PB under the clock (" + pbTxt + ")");
      // leaving without winning discards the run
      await page.evaluate(() => window.__platy.quit());
      await toMenu();
      const rq = (await S()).run;
      check(!rq.running && !rq.stopped && !rq.result, "quitting discards the run");
      // level 4 hides the clock (it shows coins)
      await page.evaluate(() => window.__platy.startLevel(4));
      await until(() => window.__platy.state().mode === "level", 20000, "L4");
      await sleep(800);
      check(!(await page.$eval("#runClock", (e) => e.classList.contains("on"))), "Level 4 hides the clock");
      await page.evaluate(() => window.__platy.quit());
      await toMenu();
      check(errors.length === 0, "no console errors offline " + JSON.stringify(errors.slice(0, 3)));
      check(external.length === 0, "offline: still no requests out");
    }
    if (want("migrate")) {
      log("MIGRATION: 5- and 11-level saves");
      const five = JSON.stringify({ unlocked: 5, beaten: [true, true, true, true, false] });
      await newPage({ storage: { "platypus.progress.v1": five } });
      let p = await page.evaluate(() => { const P = window.__platy.progress; return { u: P.unlocked, b: P.beaten.slice(), best: [P.best(1), P.best(13)], w: P.l4wins, hard: P.l4hardUnlocked }; });
      check(p.u === 5 && p.b.length === 13 && p.b[3] && !p.b[4] && !p.b[12] && p.best[0] === 0 && p.w === 1 && !p.hard, "5-level save loads (unlocked 5, 13 entries, Level 4 counts as 1 win) " + JSON.stringify(p));
      const eleven = JSON.stringify({ unlocked: 11, beaten: [true, true, true, true, true, true, true, true, true, true, true] });
      await newPage({ storage: { "platypus.progress.v1": eleven } });
      p = await page.evaluate(() => { const P = window.__platy.progress; return { u: P.unlocked, b12: P.beaten[11], lock12: document.getElementById("lvl12").classList.contains("locked"), lock13: document.getElementById("lvl13").classList.contains("locked") }; });
      check(p.u === 12 && !p.b12 && !p.lock12 && p.lock13, "11-level save (all beaten) opens 12 locally, 13 stays locked " + JSON.stringify(p));
      const src = fs.readFileSync(path.join(ROOT, "src", "progress.js"), "utf8");
      check(/const LIVE_RELEASED = 11;/.test(src) && /LEVEL_COUNT = 13/.test(src), "progress.js: LEVEL_COUNT 13, LIVE_RELEASED still 11");
      check(errors.length === 0, "no console errors " + JSON.stringify(errors.slice(0, 3)));
    }

    // ======================================================================================== ONLINE (mocked)
    if (want("online")) {
      log("ONLINE: mocked Supabase");
      const OPEN = JSON.stringify({ unlocked: 13, beaten: [] });
      mock = createMock(names);
      onlineCfg = true;
      // someone else already owns "TakenName"
      mock.handle("POST", MOCK + "/rest/v1/rpc/claim_name", JSON.stringify({ p_token: "a".repeat(64), p_name: "TakenName" }));
      await newPage({ unlock: true });
      let s = await S();
      check(s.online.enabled && !s.online.claimed, "online.enabled with a config, no name yet");
      check(!mock.calls.some((c) => c.includes("claim") && !c.includes("rpc/claim_name")), "nothing claimed at boot without a name");
      await page.click("#nameBtn"); await sleep(250);
      await type("#nameIn", "TakenName");
      await page.click("#nameSave");
      await until(() => /already has/.test(document.getElementById("nameHint").textContent), 5000, "taken");
      check(/already has that name/.test(await hint()), "a taken name -> 'Someone already has that name'");
      await type("#nameIn", "takenname");
      await page.click("#nameSave");
      await until(() => /already has/.test(document.getElementById("nameHint").textContent), 5000, "taken lower");
      check(/already has/.test(await hint()), "uniqueness ignores capitals");
      await type("#nameIn", "Pipster Bad");
      await page.click("#nameSave");
      await until(() => /kinder/.test(document.getElementById("nameHint").textContent), 5000, "server rude");
      check(/kinder/.test(await hint()), "a name the SERVER refuses as rude -> the kind message");
      await shot("name-taken");
      await type("#nameIn", "Speedy Pip");
      await page.click("#nameSave");
      await until(() => !document.getElementById("nameDlg").classList.contains("on"), 5000, "claimed");
      s = await S();
      check(s.online.claimed && s.online.name === "Speedy Pip" && s.online.id, "claim works (" + s.online.name + ", id " + (s.online.id || "").slice(0, 8) + ")");
      const ident = await page.evaluate(() => JSON.parse(localStorage.getItem("platypus.online.v1")));
      check(/^[0-9a-f]{64}$/.test(ident.token) && ident.name === "Speedy Pip", "identity: a 64-hex token is kept on this device");
      check(!mock.tokenInUrl, "the token never appears in a URL");
      // rename: the old name stays reserved
      await page.click("#nameBtn"); await sleep(200);
      await type("#nameIn", "Speedy Pip Two");
      await page.click("#nameSave");
      await until(() => !document.getElementById("nameDlg").classList.contains("on"), 5000, "renamed");
      check((await S()).online.name === "Speedy Pip Two", "rename works");
      const other = mock.handle("POST", MOCK + "/rest/v1/rpc/claim_name", JSON.stringify({ p_token: "b".repeat(64), p_name: "Speedy Pip" })).body;
      check(other.ok === false && other.reason === "taken", "after a rename, the old name is still reserved for everyone else");
      // score: implausible first (server says no; no rank, no error), then a good one with a rank
      mock.minMs = 10 * 60 * 1000;
      await playPlaceholder(12);
      await until(() => { const r = window.__platy.state().run.result; return r && r.rank !== undefined; }, 6000, "rank settle");
      let rr = (await S()).run.result;
      let card = lastCard;
      check(mock.calls.some((c) => c.includes("start_run")) && mock.calls.some((c) => c.includes("submit_time")), "start_run at the start, submit_time at the win");
      check(rr && rr.rank === 0 && !/in the world/.test(card), "an implausible time is refused quietly (no rank, no error)");
      mock.minMs = 0;
      await playPlaceholder(12);
      await until(() => /in the world/.test(document.getElementById("runCard").textContent), 6000, "rank");
      card = await page.$eval("#runCard", (e) => e.textContent) + lastCard;
      rr = (await S()).run.result;
      check(/#37 in the world/.test(card) && rr.rank === 37, "a good time shows '#37 in the world' (" + card.replace(/\s+/g, " ").slice(0, 80) + ")");
      await shot("run-card-online");
      // boards: rows + pinned me (outside the shown rows)
      await page.click("#runCard .lnk"); await sleep(300);
      await until(() => document.querySelector("#boards .btable tbody tr:not(.sk)"), 6000, "board rows");
      let bd = await page.evaluate(() => ({ tab: document.querySelector("#boards .btab.on").textContent, rows: document.querySelectorAll("#boards .btable tbody tr").length, pin: !!document.querySelector("#boards tr.pin"), me: document.querySelector("#boards tr.me") ? document.querySelector("#boards tr.me").textContent : "", g1: !!document.querySelector("#boards .rk.g1"), foot: document.querySelector("#boards .bfoot .mine").textContent }));
      check(bd.tab === "12" && bd.rows === 13 && bd.pin && /#?37|37/.test(bd.me) && bd.g1, "See leaderboard opens tab 12: 12 rows + pinned 'You' row #37, gold disc " + JSON.stringify(bd));
      check(/Your best: \d+:\d\d\.\d\d/.test(bd.foot), "the footer shows the local best (" + bd.foot + ")");
      await shot("boards-online");
      // the player inside the top rows is highlighted, not pinned
      mock.includeMe = true; mock.rankOffset = 0;
      await page.evaluate(() => window.__platy.ui.invalidateBoards());
      await page.click("#boards .btab:nth-child(11)"); await sleep(150);
      await page.click("#boards .btab:nth-child(12)");
      await until(() => document.querySelector("#boards .btable tbody tr:not(.sk)"), 6000, "rows2");
      bd = await page.evaluate(() => ({ pin: !!document.querySelector("#boards tr.pin"), me: document.querySelector("#boards tr.me") ? document.querySelector("#boards tr.me").textContent : "" }));
      check(!bd.pin && /Speedy Pip Two \(you\)/.test(bd.me), "own row highlighted inside the table " + JSON.stringify(bd));
      // empty board
      mock.empty = true;
      await page.click("#boards .btab:nth-child(7)");
      await until(() => /be the first/i.test(document.querySelector("#boards .bbody").textContent), 6000, "empty");
      check(/No times yet/.test(await page.$eval("#boards .bbody", (e) => e.textContent)), "an empty board says 'No times yet - be the first!'");
      mock.empty = false;
      // network error -> retry
      allowedErr.push("Failed to load resource");
      mock.fail.top_times = 500;
      await page.click("#boards .btab:nth-child(9)");
      await until(() => /Couldn/.test(document.querySelector("#boards .bbody").textContent), 9000, "error");
      check(/Couldn.t load/.test(await page.$eval("#boards .bbody", (e) => e.textContent)) && !!(await page.$("#boards .retry")), "a server error shows 'Couldn't load - try again' and a retry button");
      await shot("boards-error");
      delete mock.fail.top_times;
      await page.click("#boards .retry");
      await until(() => document.querySelector("#boards .btable tbody tr:not(.sk)"), 9000, "retry rows");
      check(!!(await page.$("#boards .btable tbody tr")), "retry loads the board");
      // coins board with HARD badges
      await page.click("#boards .btab:nth-child(4)");
      await until(() => document.querySelector("#boards .hardb"), 6000, "coins");
      const cb = await page.evaluate(() => ({ title: document.querySelector("#boards .btitle").textContent, hard: document.querySelectorAll("#boards .hardb").length, hdr: document.querySelector("#boards th.r").textContent }));
      check(/most coins/.test(cb.title) && cb.hard >= 2 && cb.hdr === "COINS", "the coins board: COINS column, HARD badges " + JSON.stringify(cb));
      await shot("boards-coins");
      await page.keyboard.press("Escape"); await sleep(150);
      // a name saved while offline is claimed when the game goes online; a taken one asks for a new name
      mock.handle("POST", MOCK + "/rest/v1/rpc/claim_name", JSON.stringify({ p_token: "c".repeat(64), p_name: "Offline Otter" }));
      await newPage({ unlock: true, storage: { "platypus.name.v1": '"Offline Otter"' } });
      await until(() => document.getElementById("nameDlg").classList.contains("on"), 6000, "taken dialog");
      check(/taken now/.test(await hint()), "a locally saved name that is taken online asks for a new one ('That name is taken now')");
      await page.keyboard.press("Escape");
      mock.calls.length = 0;
      await newPage({ unlock: true, storage: { "platypus.name.v1": '"Lone Wombat"' } });
      await until(() => window.__platy.state().online.claimed, 6000, "auto claim");
      check((await S()).online.claimed, "a locally saved free name is claimed automatically when online");
      // no name yet at the first submission: the dialog opens on the main screen, then the time is sent
      await newPage({ unlock: true });
      await playPlaceholder(12);
      await until(() => document.getElementById("nameDlg").classList.contains("on"), 6000, "name before submit");
      check(await page.$eval("#nameDlg", (e) => e.classList.contains("on")) && /leaderboard/.test(await hint()), "no name at the first submission: the name dialog opens first");
      await type("#nameIn", "Late Lemur");
      await page.click("#nameSave");
      await until(() => /in the world/.test(document.getElementById("runCard").textContent), 8000, "late rank");
      check(/in the world/.test(await page.$eval("#runCard", (e) => e.textContent)), "after picking the name the time is submitted and ranked");
      // network down at the submit: queued, sent on the next ready()
      mock.fail.submit_time = 503;
      await playPlaceholder(12);
      await until(() => { const r = window.__platy.state().run.result; return r && r.rank !== undefined; }, 12000, "queued");
      const q = await page.evaluate(() => JSON.parse(localStorage.getItem("platypus.online.queue.v1") || "[]"));
      check(q.length === 1 && q[0].kind === "time", "a submit during a network failure is queued (" + q.length + ")");
      delete mock.fail.submit_time;
      await page.evaluate(() => window.__platy.online.ready());
      await sleep(500);
      const q2 = await page.evaluate(() => JSON.parse(localStorage.getItem("platypus.online.queue.v1") || "[]"));
      check(q2.length === 0, "the queue is sent on the next ready()");
      const bad = errors.filter((e) => !/Failed to load resource/.test(e));
      check(bad.length === 0, "no console errors online " + JSON.stringify(bad.slice(0, 3)));
      allowedErr = [];
    }

    // ======================================================================================== LEVEL 4 HARD MODE
    if (want("hard")) {
      log("HARD MODE: unlock, choice, layout, a bot show");
      mock = createMock(names);
      onlineCfg = true;
      await newPage({ storage: { "platypus.progress.v1": JSON.stringify({ unlocked: 5, beaten: [true, true, true, true, false], l4wins: 4 }), "platypus.name.v1": '"Show Pip"' } });
      await until(() => window.__platy.state().online.claimed, 6000, "claimed");
      check(!(await page.evaluate(() => window.__platy.progress.l4hardUnlocked)), "4 wins: hard mode still locked");
      check(!(await page.$eval("#lvl4", (e) => e.classList.contains("hardOn"))), "no flame badge yet");
      // win #5 (normal): the in-page bot plays act 1, then the seam finishes the show
      await page.evaluate(() => window.__platy.startLevel(4));
      await until(() => window.__platy.state().mode === "level", 20000, "L4");
      await page.evaluate(() => window.__platy.skipTo("act1"));
      await sleep(300);
      const normal = await page.evaluate(() => { const s = window.__platy.state(); return { bpm: s.bpm, lead: s.leadSec, notes: s.notes, charts: s.charts, hard: s.hard }; });
      check(!normal.hard && Math.abs(normal.bpm - 112) < 0.01 && normal.notes === 78, "normal mode unchanged: 112 bpm, 78 notes " + JSON.stringify(normal));
      const vis4 = await page.$$eval("#tricks .trk.on", (b) => b.length);
      check(vis4 === 4 && !(await page.$eval("#tricks", (e) => e.classList.contains("scatter"))), "normal mode: 4 buttons, normal layout");
      await page.evaluate(() => window.__platy.win());
      await toMenu();
      let p = await page.evaluate(() => ({ w: window.__platy.progress.l4wins, un: window.__platy.progress.l4hardUnlocked }));
      const card = await page.$eval("#runCard", (e) => e.textContent);
      check(p.w === 5 && p.un, "the 5th win unlocks hard mode " + JSON.stringify(p));
      check(/HARD MODE UNLOCKED/.test(card) && /COINS/.test(card), "the card says HARD MODE UNLOCKED (" + card.replace(/\s+/g, " ").slice(0, 70) + ")");
      check(await page.$eval("#lvl4", (e) => e.classList.contains("hardOn")), "circle 4 has the flame badge");
      await shot("hard-unlocked");
      // the choice: click circle 4 -> NORMAL / HARD; Esc closes; 2 starts hard
      await page.click("#lvl4"); await sleep(400);
      check(await page.$eval("#l4pick", (e) => e.classList.contains("on")), "circle 4 asks NORMAL or HARD");
      await shot("hard-choice");
      await page.keyboard.press("Escape"); await sleep(200);
      check(!(await page.$eval("#l4pick", (e) => e.classList.contains("on"))) && (await S()).mode === "menu", "Esc closes the choice");
      await page.click("#lvl4"); await sleep(300);
      await page.keyboard.press("Digit2");
      await until(() => window.__platy.state().mode === "level", 20000, "hard start");
      let s = await S();
      check(s.levelOpts.hard && s.run.hard, "key 2 starts HARD (levelOpts.hard, run.hard)");
      await until(() => !window.__platy.state().cinema.playing, 12000, "title");
      await page.evaluate(() => window.__platy.skipTo("act1"));
      await sleep(400);
      const hs = await page.evaluate(() => { const s = window.__platy.state(); return { bpm: s.bpm, lead: s.leadSec, notes: s.notes, charts: s.charts, hard: s.hard, sbpm: window.__platy.audio.showMusic.bpm }; });
      check(hs.hard && Math.abs(hs.bpm - 140) < 0.01 && Math.abs(hs.lead - 0.8) < 0.01, "hard: 140 bpm (1.25x), 0.8 s lead " + JSON.stringify(hs));
      check(hs.charts[0] >= 24 * 1.6 && hs.charts[1] >= 30 * 1.6 && hs.charts[2] >= 24 * 1.6, "hard charts carry >= 1.6x the notes (" + hs.charts.join("/") + " vs 24/30/24)");
      // 8 buttons, scattered, fixed, clear of the lane / coins / centre
      const lay = async () => page.evaluate(() => {
        const b = Array.from(document.querySelectorAll("#tricks .trk.on")).map((x) => ({ left: x.offsetLeft, top: x.offsetTop, right: x.offsetLeft + x.offsetWidth, bottom: x.offsetTop + x.offsetHeight }));
        const lane = document.getElementById("beat").getBoundingClientRect(), coin = document.getElementById("coins").getBoundingClientRect();
        const hit = (a, c) => a.left < c.right && a.right > c.left && a.top < c.bottom && a.bottom > c.top;
        const vw = innerWidth, vh = innerHeight, mid = { left: vw * 0.35, right: vw * 0.65, top: vh * 0.35, bottom: vh * 0.65 };
        const over = b.filter((r) => hit(r, lane) || hit(r, coin) || hit(r, mid) || r.left < 0 || r.right > vw || r.top < 0 || r.bottom > vh).length;
        let pair = 0; for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) if (hit(b[i], b[j])) pair++;
        return { n: b.length, scatter: document.getElementById("tricks").classList.contains("scatter"), over, pair, pos: b.map((r) => Math.round(r.left) + "," + Math.round(r.top)).join(" "), keys: Array.from(document.querySelectorAll("#tricks .trk.on .k")).map((k) => k.textContent).join("") };
      });
      const L1 = await lay();
      check(L1.n === 8 && L1.scatter && L1.keys === "12345678", "8 buttons, keys 1-8, scattered " + JSON.stringify({ n: L1.n, k: L1.keys }));
      check(L1.over === 0 && L1.pair === 0, "buttons clear of the lane, coins, the centre 30%, the screen edge and each other " + JSON.stringify(L1));
      // in-page bot: press each pending note's key on time
      await page.evaluate(() => {
        const D = window.__platy, L4 = D.ctx.debug.level4;
        const st = { presses: 0, lastI: -1, lastAct: -1, on: true };
        window.__bot = st;
        const codes = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8"];
        (function loop() {
          if (!st.on) return;
          requestAnimationFrame(loop);
          const p = L4.pending();
          if (!p) return;
          if (p.d <= 0.012 && !(p.act === st.lastAct && p.i === st.lastI)) {
            st.lastAct = p.act; st.lastI = p.i; st.presses++;
            const code = codes[p.lane];
            window.dispatchEvent(new KeyboardEvent("keydown", { code, key: code.slice(5), bubbles: true }));
            setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code, key: code.slice(5), bubbles: true })), 30);
          }
        })();
      });
      await sleep(9000);
      const L2 = await lay();
      check(L2.pos === L1.pos, "the buttons never move during the show");
      await shot("hard-show");
      const mid = await page.evaluate(() => { const s = window.__platy.state(); return { hits: s.hits, perf: s.perfects, miss: s.misses, coins: s.coins, hitCoins: s.hitCoins, combo: s.combo }; });
      check(mid.hits >= 10 && mid.hitCoins > 0 && mid.coins >= mid.hitCoins, "the bot hits notes and every hit pays coins " + JSON.stringify(mid));
      // play through acts 1-3
      await until(() => { const s = window.__platy.state(); return s.step === "finale" || s.step === "bows" || s.step === "home"; }, 150000, "acts done");
      const end = await page.evaluate(() => { const s = window.__platy.state(); return { step: s.step, hits: s.hits, perf: s.perfects, miss: s.misses, coins: s.coins, hitCoins: s.hitCoins, notes: s.notes, presses: window.__bot.presses, bestCombo: s.bestCombo }; });
      log("  hard acts: " + JSON.stringify(end));
      check(end.hits >= end.notes * 0.9, "the bot cleared the hard acts (" + end.hits + " / " + end.notes + " hits, " + end.perf + " perfect)");
      // finish the show for real (finale roll, leap, bows) and measure the coins of an (almost) perfect hard show
      await until(() => { const s = window.__platy.state(); return s.step === "home" || s.bowPhase >= 3; }, 60000, "bows");
      await sleep(1500);
      const fin = await page.evaluate(() => { const s = window.__platy.state(); return { step: s.step, coins: s.coins, bonus: s.bonus, stars: s.stars }; });
      log("  hard show coins: " + JSON.stringify(fin));
      check(fin.coins > 800 && fin.coins <= 3300, "a near-perfect hard show pays " + fin.coins + " coins (<= the 3300 cap in coin_rules)");
      await page.evaluate(() => { window.__bot.on = false; });
      await page.evaluate(() => window.__platy.win());
      await toMenu();
      const hr = (await S()).run.result;
      p = await page.evaluate(() => ({ hw: window.__platy.progress.l4hardWins, hb: window.__platy.progress.l4bestHardCoins }));
      check(hr && hr.l4 && hr.hard && p.hw === 1 && p.hb === 0, "the hard win counts (hard wins " + p.hw + "); the seam made it practice, so no best was saved");
      check(mock.calls.some((c) => c.includes("start_run")), "the hard run was started on the server");
      check(errors.filter((e) => !/Failed to load resource/.test(e)).length === 0, "no console errors in hard mode " + JSON.stringify(errors.slice(0, 3)));
      // a quick normal act with the bot: normal mode still plays as before
      await page.click("#lvl4"); await sleep(300);
      await page.keyboard.press("Digit1");
      await until(() => window.__platy.state().mode === "level", 20000, "normal start");
      await until(() => !window.__platy.state().cinema.playing, 12000, "title");
      await page.evaluate(() => window.__platy.skipTo("act1"));
      await sleep(300);
      const n2 = await page.evaluate(() => { const s = window.__platy.state(); return { hard: s.hard, bpm: s.bpm, n: document.querySelectorAll("#tricks .trk.on").length, sc: document.getElementById("tricks").classList.contains("scatter") }; });
      check(!n2.hard && Math.abs(n2.bpm - 112) < 0.01 && n2.n === 4 && !n2.sc, "key 1 starts NORMAL again (112 bpm, 4 buttons in a row)");
      await page.evaluate(() => { window.__bot.on = true; window.__bot.lastI = -1; });
      await page.evaluate(() => {
        const D = window.__platy, L4 = D.ctx.debug.level4, st = window.__bot;
        const codes = ["Digit1", "Digit2", "Digit3", "Digit4"];
        (function loop() { if (!st.on) return; requestAnimationFrame(loop); const p = L4.pending(); if (!p) return;
          if (p.d <= 0.012 && !(p.act === st.lastAct && p.i === st.lastI)) { st.lastAct = p.act; st.lastI = p.i; const code = codes[p.lane];
            window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true })); setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true })), 30); } })();
      });
      await sleep(8000);
      const n3 = await page.evaluate(() => { const s = window.__platy.state(); return { hits: s.hits, coins: s.coins, hitCoins: s.hitCoins, miss: s.misses }; });
      check(n3.hits >= 3 && n3.hitCoins === 0, "normal: hits register and pay no per-hit coins (as before) " + JSON.stringify(n3));
      await page.evaluate(() => { window.__bot.on = false; window.__platy.quit(); });
      await toMenu();
      // phone portrait: the 8 buttons still fit
      await newPage({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true }, storage: { "platypus.progress.v1": JSON.stringify({ unlocked: 5, beaten: [true, true, true, true, false], l4wins: 5 }) } });
      await page.evaluate(() => window.__platy.startLevel(4, { hard: true }));
      await until(() => window.__platy.state().mode === "level", 20000, "phone hard");
      await until(() => !window.__platy.state().cinema.playing, 12000, "title");
      await page.evaluate(() => window.__platy.skipTo("act1"));
      await sleep(900);
      const LP = await lay();
      check(LP.n === 8 && LP.over === 0 && LP.pair === 0, "phone portrait: 8 buttons clear of the lane and each other " + JSON.stringify(LP));
      await shot("hard-phone");
      await page.evaluate(() => window.__platy.quit());
      await toMenu();
    }
  } catch (e) {
    fails.push("CRASH " + (e.stack || e));
    log("CRASH " + (e.stack || e));
    try { await shot("crash"); } catch (_) {}
  }
  clearTimeout(wd);
  try { await browser.close(); } catch (_) {}
  srv.close();
  log(fails.length ? "FAILED " + fails.length + ":\n  - " + fails.join("\n  - ") : "ALL PASSED");
  process.exit(fails.length ? 1 : 0);
})();
