// playtest.cjs - full browser playtest (INTEGRATE). Serves the BossGauntlet folder (so the game runs at the
// /adventure-cube/ subpath like GitHub Pages, and ../../platyfy-online.js resolves), drives the real UI + the
// window.__cube seam, saves screenshots to tools/shots/pt-*.png.
//   node tools/playtest.cjs            everything (desktop 1280x720 + phone 390x844)
//   node tools/playtest.cjs --quick    menus + area1 only + phone
//   node tools/playtest.cjs --offline  no network writes (skips leaderboard + publish checks)
// Online writes go to the REAL relay under a throwaway key prefix (window.__PLATYFY_ONLINE_TEST) and every record
// made is deleted at the end. Area runs replay the AI rater's winning routes from tools/routes/<id>.json
// (made by `node tools/rate-areas.mjs`). Holds tools/browserlock.cjs: one headless browser on the machine at a time.
const http = require("http");
const fs = require("fs");
const path = require("path");
const lock = require("./browserlock.cjs");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));

const GAME = path.join(__dirname, "..");
const SITE = path.join(GAME, "..");
const SHOTS = path.join(__dirname, "shots");
const ROUTES = path.join(__dirname, "routes");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const QUICK = process.argv.includes("--quick"), OFFLINE = process.argv.includes("--offline");
const PREFIX = "pfo-pt" + Math.floor(Math.random() * 1e5) + ":";
const RELAY = "https://relay.platyfy.com";
const TOKEN = (fs.readFileSync(path.join(SITE, "platyfy-online.js"), "utf8").match(/STORE_TOKEN = "([0-9a-f]+)"/) || [])[1];

function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(SITE, p);
      if (!file.startsWith(SITE)) { res.writeHead(403); res.end(); return; }
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
async function cleanupOnline() {
  if (!TOKEN) return "no token";
  const q = RELAY + "/api/games?limit=100&q=" + encodeURIComponent(PREFIX) + "&token=" + TOKEN;
  const games = ((await (await fetch(q)).json()).games || []).filter((g) => g.name.startsWith(PREFIX) && g.authorId === "1d7249");
  for (const g of games) await fetch(RELAY + "/api/games/" + g.id, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: TOKEN }) });
  const left = (await (await fetch(q)).json()).total;
  return `deleted ${games.length} test records, ${left} left`;
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  await lock.acquire("adventure-cube playtest (integrate)");
  const keep = setInterval(() => { try { const t = new Date(); fs.utimesSync(path.join(__dirname, ".browser.lock"), t, t); } catch (e) { /* */ } }, 20000);
  const srv = await serve();
  const url = "http://127.0.0.1:" + srv.address().port + "/adventure-cube/";
  let browser;
  const errors = [], report = [], perf = [];
  let fails = 0;
  const ok = (c, m) => { report.push((c ? "ok   " : "FAIL ") + m); if (!c) fails++; console.log((c ? "ok   " : "FAIL ") + m); };
  const info = (m) => { report.push("info " + m); console.log("info " + m); };
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
      defaultViewport: { width: 1280, height: 720 },
    });
    const page = (await browser.pages())[0] || await browser.newPage();
    await page.evaluateOnNewDocument((prefix, offline) => { window.__PLATYFY_ONLINE_TEST = { prefix }; if (offline) window.__PLATYFY_ONLINE_TEST.relay = "https://127.0.0.1:9"; }, PREFIX, OFFLINE);
    page.on("pageerror", (e) => errors.push("pageerror: " + (e.stack || e.message || e)));
    page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push("console: " + m.text()); });
    page.on("response", (r) => { if (r.status() >= 400 && !/favicon/.test(r.url()) && !/relay\.platyfy\.com\/api\/games\//.test(r.url())) errors.push("http " + r.status() + ": " + r.url()); });
    page.on("dialog", (d) => d.accept());
    const shot = async (name) => { await page.screenshot({ path: path.join(SHOTS, "pt-" + name + ".png") }); };
    const st = () => page.evaluate(() => window.__cube && window.__cube.state());
    const waitFor = async (pred, ms, label) => {
      const t0 = Date.now();
      for (;;) { const s = await st().catch(() => null); if (s && pred(s)) return s; if (Date.now() - t0 > ms) throw new Error("timeout: " + label + " " + JSON.stringify(s)); await sleep(100); }
    };
    const waitSel = (sel, ms = 8000) => page.waitForSelector(sel, { timeout: ms, visible: true });
    const fpsSample = async (label, ms = 4000) => {
      const r = await page.evaluate((ms) => new Promise((res) => {
        const gaps = []; let last = performance.now(); const t0 = last;
        const f = (t) => { gaps.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else { gaps.shift(); gaps.sort((a, b) => a - b); res({ fps: gaps.length / (gaps.reduce((a, b) => a + b, 0) / 1000), p95: gaps[Math.floor(gaps.length * 0.95)], max: gaps[gaps.length - 1], slow: gaps.filter((g) => g > 20).length, n: gaps.length }); } };
        requestAnimationFrame(f);
      }), ms);
      perf.push([label, r]);
      info(`fps ${label}: ${r.fps.toFixed(1)} (p95 ${r.p95.toFixed(1)} ms, max ${r.max.toFixed(1)} ms, ${r.slow}/${r.n} frames > 20 ms)`);
      return r;
    };
    const route = (id) => JSON.parse(fs.readFileSync(path.join(ROUTES, id + ".json"), "utf8")).inputs;

    // ------------------------------------------------------------------ title
    await page.goto(url, { waitUntil: "networkidle0" });
    await waitFor((s) => s.screen === "title", 8000, "title");
    await sleep(1500);
    await shot("01-title");
    ok(await page.$eval("#back", (a) => a.getAttribute("href")) === "../", "back-to-platyfy link");
    ok(await page.evaluate(() => window.__cube.app.renderer.level && window.__cube.app.renderer.level.name) === "Sunlit Forest", "title shows the living Area 1 world (attract mode)");
    const ax0 = await page.evaluate(() => window.__cube.app.renderer.level && 1);
    void ax0;
    await fpsSample("title (attract)", 3000);

    // settings
    await page.click(".title-screen button[data-a=settings]");
    await waitSel(".settings-panel");
    await page.$eval(".settings-panel input[data-k=music]", (e) => { e.value = 40; e.dispatchEvent(new Event("input", { bubbles: true })); });
    await shot("02-settings");
    await page.click(".settings-panel button[data-a=close]");
    const sv = await page.evaluate(() => JSON.parse(localStorage.getItem("adventurecube.settings.v1")));
    ok(sv && Math.abs(sv.music - 0.4) < 1e-6, "settings: music volume saved (" + (sv && sv.music) + ")");
    const vol = await page.evaluate(() => window.__cube.app.audio.getVolume());
    ok(Math.abs(vol.music - 0.4) < 1e-6, "settings: music volume applied to the engine");

    // ------------------------------------------------------------------ area select + locks
    await page.click(".title-screen button[data-a=play]");
    await waitFor((s) => s.screen === "areas", 3000, "areas");
    await waitSel(".area[data-id=area1] canvas");
    await sleep(500); await shot("03-areas-locked");
    const locks = await page.$$eval(".area", (els) => els.map((e) => e.classList.contains("locked")));
    ok(JSON.stringify(locks) === "[false,true,true]", "fresh save: area 2 and 3 locked " + JSON.stringify(locks));
    ok(!!(await page.$(".bonus-card:not(.locked) [data-b=start]")), "fresh save: the bonus level card is free (Start)");
    const badges = await page.$$eval(".area .acb-badge b", (els) => els.map((e) => +e.textContent));
    ok(badges.length === 3 && badges[0] <= 3 && badges[1] >= 4 && badges[1] <= 6 && badges[2] >= 8 && badges[2] <= 9, "AI difficulty badges shown " + JSON.stringify(badges));
    await page.click(".area[data-id=area2]"); await sleep(300);
    ok((await st()).screen === "areas", "clicking a locked area does nothing");

    // ------------------------------------------------------------------ area 1: real input, pause, then the AI route
    await page.click(".area[data-id=area1]");
    await waitFor((s) => s.screen === "play" && s.frame > 5, 6000, "play area1");
    ok(!!(await page.$(".banner")), "area intro banner shown");
    // the engine sets currentSong once the song has loaded + prewarmed (async): give it a moment
    await page.waitForFunction(() => window.__cube.app.audio.currentSong === "area1", { timeout: 4000 }).catch(() => {});
    ok(await page.evaluate(() => window.__cube.app.audio.currentSong) === "area1", "area 1 plays its song (area1)");
    const x0 = (await st()).x;
    await page.keyboard.down("ArrowRight"); await sleep(700);
    await page.keyboard.down("Space"); await sleep(200); await shot("04-area1-jump"); await page.keyboard.up("Space");
    await page.keyboard.up("ArrowRight");
    ok((await st()).x > x0 + 100, "keyboard moves the cube");
    await page.keyboard.press("Escape"); await waitSel(".pause-panel");
    const pf = (await st()).frame; await sleep(400);
    ok((await st()).frame === pf, "Esc pauses the sim");
    await shot("05-pause");
    await page.click(".pause-panel button[data-a=resume]"); await sleep(300);
    ok((await st()).frame > pf, "resume continues");
    await page.keyboard.press("KeyR"); await sleep(100);
    ok((await st()).frame < 30, "R restarts");

    const areaRun = async (id, n) => {
      const inp = route(id);
      await page.evaluate((id, inp) => window.__cube.app.areas.play(id, { replay: Uint8Array.from(inp), speed: 1 }), id, inp);
      await waitFor((s) => s.screen === "play" && s.frame > 30, 8000, "replay " + id);
      await page.waitForFunction((id) => window.__cube.app.audio.currentSong === id, { timeout: 4000 }, id).catch(() => {});
      ok(await page.evaluate(() => window.__cube.app.audio.currentSong) === id, `area ${n} plays its own song (${id})`);
      await fpsSample(id + " (real time)", 5000);
      await shot(`06-${id}-run`);
      await page.evaluate(() => window.__cube.app.screens.play.setSpeed(4));
      const tm = setInterval(() => {}, 1000);
      // checkpoint shots along the way
      let cpShot = 0;
      const t0 = Date.now();
      for (;;) {
        const s = await st();
        if (s.won) break;
        if (s.cp >= 0 && s.cp >= cpShot && cpShot < 3) { cpShot = s.cp + 1; await page.evaluate(() => window.__cube.app.screens.play.setSpeed(1)); await sleep(500); await shot(`07-${id}-cp${s.cp}`); await page.evaluate(() => window.__cube.app.screens.play.setSpeed(4)); }
        if (Date.now() - t0 > 120000) throw new Error("replay " + id + " timed out " + JSON.stringify(s));
        await sleep(250);
      }
      clearInterval(tm);
      const s = await st();
      ok(s.won && s.deaths === 0 && s.winFrame === inp.length, `${id}: the AI's route plays start-to-finish in the browser (won at frame ${s.winFrame}/${inp.length}, ${s.deaths} deaths)`);
      await waitSel(".results");
      return s;
    };

    await areaRun("area1", 1);
    if (!OFFLINE) {
      await waitSel(".results .name-form input", 10000);
      ok(true, "results ask for a leaderboard name (first time)");
      await page.type(".results .name-form input", "fuckface");
      await page.click(".results .name-form button[type=submit]");
      await page.waitForFunction(() => { const m = document.querySelector(".nf-msg"); return m && /not allowed|taken/.test(m.textContent); }, { timeout: 15000 });
      ok(true, "a rude name is refused");
      const myName = "Cube Tester " + Math.floor(Math.random() * 90 + 10);
      await page.$eval(".results .name-form input", (e) => { e.value = ""; });
      await page.type(".results .name-form input", myName);
      await page.click(".results .name-form button[type=submit]");
      await page.waitForSelector(".results .lb li.me", { timeout: 25000 });
      const row = await page.$eval(".results .lb li.me", (e) => e.textContent);
      ok(row.includes(myName), "area1 leaderboard shows my name + time: " + row.replace(/\s+/g, " "));
    } else {
      await page.waitForFunction(() => /offline/i.test(document.querySelector(".results .board").textContent) || document.querySelector(".results .name-form"), { timeout: 15000 });
      ok(true, "offline: results show an offline leaderboard state");
    }
    await shot("08-area1-results");
    ok(await page.evaluate(() => !!window.__cube.app.progress.get().done.area1), "area1 marked complete in saved progress");
    await page.click(".results button[data-a=exit]");
    await waitFor((s) => s.screen === "areas", 3000, "areas after area1");
    await sleep(600);
    const locks2 = await page.$$eval(".area", (els) => els.map((e) => e.classList.contains("locked")));
    ok(JSON.stringify(locks2) === "[false,false,true]", "beating area 1 unlocks area 2 " + JSON.stringify(locks2));
    await shot("09-areas-unlocked");

    if (!QUICK) {
      await areaRun("area2", 2);
      if (!OFFLINE) { await page.waitForSelector(".results .lb li.me", { timeout: 25000 }); ok(true, "area2 time posted automatically (name remembered) and shown"); }
      await shot("10-area2-results");
      // "Next: Area 3" button
      await page.click(".results button[data-a=next]");
      await waitFor((s) => s.screen === "play" && s.level === "Storm Peaks" && s.frame > 10, 8000, "next -> area3");
      ok(true, "results 'Next: Area 3' starts area 3");
      await areaRun("area3", 3);
      if (!OFFLINE) await page.waitForSelector(".results .lb li.me", { timeout: 25000 });
      await shot("11-area3-results");
      const pr = await page.evaluate(() => window.__cube.app.progress.get());
      ok(pr.done.area1 && pr.done.area2 && pr.done.area3, "all three areas complete, best times saved " + JSON.stringify(pr.best));
      ok(!!(await page.$(".results .res-unlock")) && /bonus/i.test(await page.$eval(".results button[data-a=next]", (e) => e.textContent)), "area 3 results announce the bonus level + offer it");
      await page.click(".results button[data-a=exit]");
      await waitFor((s) => s.screen === "areas", 3000, "areas at the end");
      ok(!!(await page.$(".bonus-card:not(.locked) [data-b=start]")), "clearing area 3 unlocks the bonus level card (Start)");
      await sleep(600); await shot("11b-areas-bonus-unlocked");
    }

    // ------------------------------------------------------------------ builder: create -> test -> rate -> publish
    await page.evaluate(() => window.__cube.show("builder", {}));
    await waitFor((s) => s.screen === "builder", 4000, "builder");
    await sleep(800);
    await fpsSample("builder", 2500);
    const cnt = () => page.evaluate(() => window.__cube.app.screens.builder.level.tiles.join("").split("#").length);
    const before = await cnt();
    await page.evaluate(() => { const d = window.__cube.app.screens.builder.debug; d.setBrush("t#"); d.setTool("paint"); });
    await page.mouse.click(640, 330); await sleep(300);
    const after = await cnt();
    ok(after !== before, `builder paints a tile with the mouse (# count ${before} -> ${after})`);
    if (after !== before) { await page.evaluate(() => window.__cube.app.screens.builder.debug.doUndo()); }
    await shot("12-builder");
    // test play: win by walking to the goal from just before it
    await page.evaluate(() => window.__cube.app.screens.builder.debug.testPlay(false));
    await waitFor((s) => s.screen === "play" && s.frame > 5, 6000, "builder test play");
    const goal = await page.evaluate(() => window.__cube.sim.level.goal);
    await page.evaluate((g) => { window.__cube.teleport(g.x - 3, g.y); window.__cube.setInput(2); }, goal);
    await waitFor((s) => s.won, 8000, "test play win");
    await page.evaluate(() => window.__cube.setInput(null));
    await waitSel(".results");
    await page.click(".results button[data-a=exit]");
    await waitFor((s) => s.screen === "builder", 4000, "back to builder");
    ok(true, "test play -> win -> back to the editor");
    await sleep(500);
    let pubId = null;
    if (!OFFLINE) {
      await page.evaluate(() => window.__cube.app.screens.builder.debug.publish());
      await waitSel(".acb-pubd .acb-prog, .acb-pubd .acb-pa", 8000);
      await shot("13-rating");
      await waitSel(".acb-pubd .acb-pa", 60000);
      const verdict = await page.$eval(".acb-pubd .acb-badge b", (e) => +e.textContent);
      ok(verdict >= 1 && verdict <= 10, "AI rated the builder level: " + verdict);
      const pa = await page.$eval(".acb-pubd .acb-pa", (e) => e.value);
      if (!pa) await page.type(".acb-pubd .acb-pa", "Cube Tester 77");
      await page.$eval(".acb-pubd .acb-pn", (e) => { e.value = "Playtest Meadow"; });
      await shot("14-publish-form");
      await page.click(".acb-pubd [data-p=go]");
      await waitSel(".acb-done code", 30000);
      pubId = await page.$eval(".acb-done code", (e) => e.textContent.trim());
      ok(/^[a-z0-9]{8}$/.test(pubId), "published, id " + pubId);
      await shot("15-published");
      // browse -> details -> play -> leaderboard
      await page.click(".acb-done ~ .acb-row [data-p=browse], [data-p=browse]");
      await waitFor((s) => s.screen === "browse", 4000, "browse");
      await waitSel(`[data-play="${pubId}"]`, 20000);
      await sleep(400); await shot("16-browse-details");
      ok(true, "community browser shows the new level");
      await page.click(`[data-play="${pubId}"]`);
      await waitFor((s) => s.screen === "play" && s.frame > 5 && s.level === "Playtest Meadow", 10000, "play community level");
      ok(await page.evaluate((m) => window.__cube.app.audio.currentSong === window.__cube.sim.level.music, null), "community level plays its chosen song");
      const g2 = await page.evaluate(() => window.__cube.sim.level.goal);
      await page.evaluate((g) => { window.__cube.teleport(g.x - 3, g.y); window.__cube.setInput(2); }, g2);
      await waitFor((s) => s.won, 8000, "community win");
      await page.evaluate(() => window.__cube.setInput(null));
      // a teleported win is far faster than the AI's route: the plausibility floor refuses it, the board still shows
      await page.waitForFunction(() => { const b = document.querySelector(".results .board"); return b && /faster than this level allows/.test(b.textContent) && b.querySelector("h3"); }, { timeout: 25000 });
      ok(true, "community level: an impossible (teleported) time is refused and the leaderboard still shows");
      const fl = await page.evaluate((id) => window.__cube.app.online.minTimeMs(id), pubId);
      ok(fl > 2000, "community level floor comes from the AI's run: " + fl + " ms");
      await shot("17-community-results");
      await page.click(".results button[data-a=exit]");
      await waitFor((s) => s.screen === "browse", 4000, "back to browse");
      // deep link
      await page.goto(url + "?level=" + pubId, { waitUntil: "networkidle0" });
      await waitFor((s) => s.screen === "play" && s.level === "Playtest Meadow", 15000, "deep link");
      ok(true, "?level=<id> deep link plays the community level");
      const del = await page.evaluate((id) => window.__cube.app.online.deleteLevel(id), pubId);
      ok(del.ok, "deleted the test level");
    }
    await page.goto(url, { waitUntil: "networkidle0" });
    await waitFor((s) => s.screen === "title", 8000, "title again");

    // ------------------------------------------------------------------ phone 390x844
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(url, { waitUntil: "networkidle0" });
    await waitFor((s) => s.screen === "title", 8000, "phone title");
    await sleep(1200); await shot("20-phone-title");
    const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth && !Array.from(document.querySelectorAll("#ui *")).some((e) => { const r = e.getBoundingClientRect(); return r.width && (r.right > window.innerWidth + 1 || r.left < -1); }));
    ok(await noScroll(), "phone title: nothing wider than the screen");
    await page.tap(".title-screen button[data-a=play]");
    await waitFor((s) => s.screen === "areas", 3000, "phone areas");
    await sleep(600); await shot("21-phone-areas");
    ok(await noScroll(), "phone areas: nothing wider than the screen");
    await page.tap(".area[data-id=area1]");
    await waitFor((s) => s.screen === "play" && s.frame > 10, 6000, "phone play");
    const vis = await page.$eval(".touch-controls", (e) => getComputedStyle(e).display);
    ok(vis === "flex", "touch controls visible on phone");
    const center = (sel) => page.$eval(sel, (b) => { const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const right = await center(".tc-left button:nth-child(2)"), jump = await center(".tc-right button");
    const p0 = await st();
    await page.touchscreen.touchStart(right.x, right.y); await sleep(700); await page.touchscreen.touchEnd();
    const p1 = await st();
    ok(p1.x > p0.x + 40, `touch right button moves the cube (${Math.round(p0.x)} -> ${Math.round(p1.x)})`);
    await sleep(300);
    const y0 = (await st()).y;
    await page.touchscreen.touchStart(jump.x, jump.y); await sleep(160);
    const y1 = (await st()).y; await page.touchscreen.touchEnd();
    ok(y1 < y0 - 10, `touch jump button jumps (y ${Math.round(y0)} -> ${Math.round(y1)})`);
    await sleep(600);
    await shot("22-phone-play");
    ok(await noScroll(), "phone play: nothing wider than the screen");
    await fpsSample("phone area1 (390x844 dpr2)", 4000);
    await page.tap(".hud .pause"); await waitSel(".pause-panel");
    await shot("23-phone-pause");
    ok(true, "phone pause button opens the pause menu");
  } catch (e) {
    fails++; report.push("FAIL exception: " + e.message); console.log("FAIL exception: " + e.stack);
  } finally {
    clearInterval(keep);
    if (browser) await browser.close();
    srv.close();
    lock.release();
  }
  if (!OFFLINE) { try { info("online cleanup: " + await cleanupOnline()); } catch (e) { info("online cleanup failed: " + e.message); } }
  console.log("\n==== SUMMARY");
  for (const r of report) console.log(r);
  for (const e of errors) console.log("ERR", e);
  console.log(`screenshots: ${SHOTS}\\pt-*.png`);
  console.log(fails || errors.length ? `PLAYTEST FAILED (${fails} failed checks, ${errors.length} errors)` : "PLAYTEST OK");
  process.exit(fails || errors.length ? 1 : 0);
})();
