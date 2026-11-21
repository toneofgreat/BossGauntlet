// HUD + picking smoke test: node tools/hudtest.cjs  -> tools/shots/hud-*.png
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));
const ROOT = path.join(__dirname, ".."), SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".png": "image/png" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await new Promise((resolve) => {
    const s = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
      fs.readFile(path.join(ROOT, p), (err, buf) => { if (err) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(buf); });
    });
    s.listen(0, "127.0.0.1", () => resolve(s));
  });
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--window-size=1280,720", "--mute-audio"], defaultViewport: { width: 1280, height: 720 } });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") console.log("console: " + m.text()); });
  try {
    await page.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load" });
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
    await page.evaluate(() => { window.__platy.unlockAll(); return window.__platy.startLevel(3); });
    await sleep(6500);
    const out = await page.evaluate(() => {
      const p = window.__platy, ui = p.ui, ctx = p.ctx, T = ctx.THREE;
      ui.setCoins(12); ui.addCoins(5);
      ui.setFriendship(0.3, "Friendship"); ui.setFriendship(0.62);
      ui.setExcitement(0.85, "Crowd");
      ui.setQuests([{ id: "a", text: "Follow your friend over the rocks", done: true }, { id: "b", text: "Find 3 hidden fish  1 / 3", current: true }, { id: "c", text: "Play ball" }], "Today");
      ui.setQuest("c", { text: "Play ball together" });
      ui.setAction("Eat");
      ui.setTricks([{ label: "Spin" }, { label: "Backflip" }, { label: "Tail stand", enabled: false }, { label: "Roll" }]);
      ui.setTrickState(1, { want: true });
      ui.setCombo(4, "combo");
      ui.call("BACKFLIP!", "+12 coins", "perfect");
      ui.setAbilities({ slap: true, hold: true });
      ui.beat.show(true); ui.beat.spawn(0, 1.2); ui.beat.spawn(2, 2.0); ui.beat.spawn(3, 3.0);
      ui.floatText("+5", 500, 400); ui.floatText("♥", 700, 380, "heart");
      ui.setObjective("Do a trick while visitors watch", "keys 1-4");
      // picking
      const box = new T.Mesh(new T.BoxGeometry(0.6, 0.6, 0.6), new T.MeshStandardMaterial({ color: 0xff4488 }));
      box.position.set(1.2, 0.3, 1.5); ctx.world.group.add(box);
      window.__clicked = 0; window.__hover = 0;
      ctx.pick.add(box, { onClick() { window.__clicked++; }, onHover(on) { window.__hover += on ? 1 : 0; } });
      const o = ctx.project(box, { x: 0, y: 0, visible: false });
      return o;
    });
    console.log("box on screen", JSON.stringify(out));
    await sleep(500);
    await page.screenshot({ path: path.join(SHOTS, "hud-all.png") });
    await page.mouse.move(out.x, out.y); await sleep(200);
    const cur = await page.evaluate(() => document.body.classList.contains("pickhover"));
    await page.mouse.click(out.x, out.y); await sleep(200);
    console.log("hover", cur, "clicked", await page.evaluate(() => window.__clicked), "hoverCount", await page.evaluate(() => window.__hover));
    await page.mouse.move(100, 300); await sleep(200);
    console.log("hover off", await page.evaluate(() => !document.body.classList.contains("pickhover")));
    // slow motion + banner + letterbox + caption
    await page.evaluate(() => { const p = window.__platy; p.ctx.setTimeScale(0.2, 0.3); p.ui.banner("YOU ARE FRIENDS", "Your friend is called Pip", 3); p.cinema.letterbox(true); p.cinema.caption("There is still hope. The platypus will survive.", 3, { who: "Wizard Wobble" }); });
    await page.keyboard.down("KeyW"); await sleep(1200);
    console.log("timeScale", await page.evaluate(() => window.__platy.state().timeScale), "speed", await page.evaluate(() => window.__platy.player.speed));
    await page.screenshot({ path: path.join(SHOTS, "hud-banner.png") });
    await page.keyboard.up("KeyW");
    await page.evaluate(() => { document.body.classList.add("touch"); });
    await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 1 });
    await page.evaluate(() => { const p = window.__platy; p.ctx.setTimeScale(1, 0); p.cinema.letterbox(false); p.ui.setAction(null); p.ui.setAction("Eat"); p.ui.call("NICE!", "", "good"); });
    await sleep(900);
    await page.screenshot({ path: path.join(SHOTS, "hud-touch.png") });
    await page.evaluate(() => window.__platy.quit());
    await sleep(1500);
    console.log("after quit", await page.evaluate(() => { const s = window.__platy.state(); return s.mode + " running=" + s.running + " hudOn=" + document.getElementById("hud").classList.contains("on") + " quests=" + document.getElementById("quests").classList.contains("on"); }));
  } catch (e) { console.log("FAILED " + e.stack); }
  await browser.close(); srv.close();
})();
