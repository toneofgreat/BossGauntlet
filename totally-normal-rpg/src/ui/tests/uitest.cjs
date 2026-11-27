// uitest.cjs - headless test of the UI alone through harness.html (one browser, inside the machine-wide lock).
//   node src/ui/tests/uitest.cjs        -> screenshots in src/ui/tests/shots, exit 1 on any failed assert
const path = require("path"), fs = require("fs"), http = require("http");
const ROOT = path.resolve(__dirname, "../../../..");        // BossGauntlet
const lock = require(path.join(ROOT, "totally-normal-rpg/tools/browserlock.cjs"));
const puppeteer = require(path.join(ROOT, "node_modules/puppeteer"));
const SHOTS = path.join(__dirname, "shots");
const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json", ".png": "image/png" };

function serve() {
  return new Promise((res) => {
    const srv = http.createServer((req, rsp) => {
      const u = decodeURIComponent(req.url.split("?")[0]);
      const f = path.join(ROOT, u);
      if (!f.startsWith(ROOT)) { rsp.writeHead(403); rsp.end(); return; }
      fs.readFile(f, (err, data) => {
        if (err) { rsp.writeHead(404); rsp.end("nf"); return; }
        rsp.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
        rsp.end(data);
      });
    });
    srv.listen(0, "127.0.0.1", () => res({ url: "http://127.0.0.1:" + srv.address().port, close: () => srv.close() }));
  });
}

const results = [];
function check(name, ok, info) { results.push({ name, ok: !!ok, info: info || "" }); console.log((ok ? "PASS " : "FAIL ") + name + (info && !ok ? "  " + info : "")); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const OVERFLOW = () => {
  const W = innerWidth, bad = [];
  for (const e of document.querySelectorAll("#ui *")) {
    if (e.closest(".tn-letter,.tn-marker,.tn-dmg,.tn-hide") || e.tagName === "CANVAS") continue;
    let p = e, hidden = false;
    while (p && p.id !== "ui") { const s = getComputedStyle(p); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) { hidden = true; break; } p = p.parentElement; }
    if (hidden) continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > W + 1 || r.left < -1) bad.push((e.className || e.tagName) + "[" + Math.round(r.left) + "," + Math.round(r.right) + "] " + (e.textContent || "").slice(0, 30));
  }
  return { sw: document.documentElement.scrollWidth, bad: bad.slice(0, 8) };
};

async function run(page, base, mobile) {
  const tag = mobile ? "m" : "d";
  const shot = (n) => page.screenshot({ path: path.join(SHOTS, tag + "-" + n + ".png") });
  const overflow = async (n) => { const o = await page.evaluate(OVERFLOW); check(tag + " fits viewport: " + n, o.sw <= (mobile ? 390 : 1280) && !o.bad.length, o.bad.join(" | ") + " sw=" + o.sw); };
  const ev = (fn) => page.evaluate(fn);
  await page.goto(base + "/totally-normal-rpg/src/ui/tests/harness.html", { waitUntil: "load" });
  await page.waitForFunction("window.__hReady === true", { timeout: 15000 });
  await sleep(4500);
  await shot("01-title");
  check(tag + " title visible", await ev(() => getComputedStyle(document.querySelector(".tn-title")).display !== "none" && /Totally a Normal/.test(document.querySelector(".tn-name").textContent)));
  check(tag + " photosensitivity note", await ev(() => /jump scares and bright flashes/.test(document.querySelector(".tn-photo").textContent)));
  await overflow("title");
  if (!mobile) {
    await ev(() => document.querySelector(".tn-photo .tn-link").click());
    check("d reduceFlashing toggles on", await ev(() => window.__h.ctx.state.settings.reduceFlashing === true && /ON/.test(document.querySelector(".tn-photo .tn-link").textContent)));
    await ev(() => document.querySelector(".tn-photo .tn-link").click());
    await page.click(".tn-menu-col .tn-btn.tn-primary:not(.tn-hide)");
    await sleep(600);
    check("d name entry shown", await ev(() => !document.querySelector(".tn-entry").classList.contains("tn-hide") && window.__h.ctx.state.ui.screen === "name"));
    await page.type("#tn-name-in", "fuck"); await page.keyboard.press("Enter"); await sleep(100);
    check("d rude name rejected", await ev(() => /too bad/.test(document.querySelector(".tn-err").textContent)));
    await shot("02-name-error");
    await ev(() => { document.querySelector("#tn-name-in").value = ""; });
    await page.type("#tn-name-in", "ab"); await page.keyboard.press("Enter"); await sleep(100);
    check("d short name rejected", await ev(() => /3 to 24/.test(document.querySelector(".tn-err").textContent)));
    await ev(() => { document.querySelector("#tn-name-in").value = ""; });
    await page.type("#tn-name-in", "  Sir   Tester  "); await page.keyboard.press("Enter");
    await page.waitForFunction("window.__h.ctx.state.ui.screen === 'game'", { timeout: 9000 });
    check("d name saved + ui:play", await ev(() => window.__h.ctx.state.profile.name === "Sir Tester" && document.querySelector(".tn-who .n").textContent === "Sir Tester" && window.__h.log.includes("ui:play:true") && window.__h.log.includes("nametag:Sir Tester")), await ev(() => window.__h.ctx.state.profile.name + "/" + document.querySelector(".tn-who .n").textContent));
    await sleep(1200); await shot("02b-bloom");
    await sleep(3300);
  } else {
    const ok = await ev(() => window.__tnrpg.play("Tester"));
    check("m debug play()", ok);
    await sleep(800);
  }
  check(tag + " hud visible", await ev(() => !document.querySelector(".tn-hud").classList.contains("off")));
  await ev(() => {
    const { ctx } = window.__h, ui = ctx.ui;
    ui.setObjective("Cross the bridge", { x: 0, y: 2.2, z: 60 });
    ctx.combat.give("smelly_sword"); ctx.combat.give("cheese_armor");
    ctx.combat.addLevels(1234567);
    ctx.bus.emit("enemy:hit", { id: "e1", kind: "rat", dmg: 42, crit: false });
    ctx.bus.emit("enemy:hit", { id: "e1", kind: "rat", dmg: 63, crit: true });
    ctx.bus.emit("enemy:killed", { id: "e1", kind: "rat", levels: 2, pos: { x: 1.5, y: 0, z: 12 } });
    ctx.story.secret("goldenRat");
    ctx.bus.emit("boss:start", { id: "rk", kind: "ratKing", name: "The Rat King", maxHp: 520 });
    ctx.bus.emit("boss:hp", { id: "rk", hp: 300, maxHp: 520, phase: 2 });
    ctx.state.player.hp = 40; ctx.state.player.maxHp = 170;
    ctx.bus.emit("player:hurt", { amount: 12, hp: 40, maxHp: 170 });
    ctx.bus.emit("interact:focus", { id: "bram", label: "Talk to Old Bram" });
    ui.lives(3);
  });
  await sleep(1000);
  await shot("03-hud");
  check(tag + " level formatted", await ev(() => document.querySelector(".tn-lvl span").textContent === "1,234,567"), await ev(() => document.querySelector(".tn-lvl span").textContent));
  check(tag + " marker shown", await ev(() => !document.querySelector(".tn-marker").classList.contains("tn-hide")));
  check(tag + " secret toast", await ev(() => /SECRET FOUND/.test(document.querySelector(".tn-toasts").textContent)));
  check(tag + " boss bar", await ev(() => !document.querySelector(".tn-boss").classList.contains("off")));
  if (mobile) check("m interact label sent to touch", await ev(() => window.__h.log.includes("interact:Talk to Old Bram")));
  else check("d prompt", await ev(() => !document.querySelector(".tn-prompt").classList.contains("off") && /Old Bram/.test(document.querySelector(".tn-prompt").textContent)));
  await overflow("hud");
  await ev(() => window.__h.ctx.ui.setObjective("Go back", { x: -30, y: 0, z: -40 }));
  await sleep(300);
  check(tag + " marker edge-clamped", await ev(() => { const m = document.querySelector(".tn-marker"); const r = m.querySelector(".d").getBoundingClientRect(); return m.classList.contains("edge") && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
  await shot("03b-marker-edge");
  await ev(() => { window.__dlgRes = null; window.__h.ctx.ui.dialogue({ speaker: "Fydor", lines: ["You will never beat me. Many have tried. All of them are farmers now.", "Well?"], choices: ["Fight", "Not yet"], voice: { kind: "blip", pitch: 0.6 } }).then((r) => { window.__dlgRes = r; }); });
  await sleep(500);
  await shot("04-dialogue");
  await overflow("dialogue");
  check(tag + " dialogue sets modal", await ev(() => window.__h.ctx.state.ui.modal === true && window.__h.ctx.state.ui.screen === "dialogue"));
  if (mobile) {
    await page.tap(".tn-dlg"); await sleep(100); await page.tap(".tn-dlg"); await sleep(1500); await page.tap(".tn-dlg"); await sleep(300);
    await shot("05-choices");
    await overflow("choices");
    await page.tap(".tn-choices button:nth-child(2)");
  } else {
    await page.keyboard.press("Space"); await sleep(100); await page.keyboard.press("Space"); await sleep(1500);
    await shot("05-choices");
    await page.keyboard.press("2");
  }
  await sleep(300);
  check(tag + " dialogue choice resolved", await ev(() => window.__dlgRes === 1 && window.__h.ctx.state.ui.modal === false), "res=" + (await ev(() => window.__dlgRes)));
  await ev(() => { const c = window.__h.ctx.combat; c.give("iron_sword"); c.give("kings_crown"); c.give("toms_bell"); c.give("girls_ribbon"); c.give("bad_iron_sword"); window.__h.ctx.ui.openMenu("inventory"); });
  await sleep(400);
  check(tag + " menu pauses", await ev(() => window.__h.ctx.state.rt.paused === true && window.__h.ctx.state.ui.screen === "menu"));
  await shot("06-inventory"); await overflow("inventory");
  await ev(() => window.__h.ctx.ui.closeMenu());
  await sleep(300);
  await ev(() => window.__h.ctx.ui.openMenu("shop"));
  await sleep(400); await shot("07-shop"); await overflow("shop");
  check(tag + " shop claim button", await ev(() => [...document.querySelectorAll(".tn-row .tn-btn")].some((b) => b.textContent === "Claim")));
  await ev(() => [...document.querySelectorAll(".tn-row .tn-btn")].find((b) => b.textContent === "Claim").click());
  await sleep(200);
  check(tag + " claimed", await ev(() => /CLAIMED/.test(document.querySelector(".tn-pbody").textContent)));
  await ev(() => [...document.querySelectorAll(".tn-tabs button")].find((b) => b.textContent === "Secrets").click());
  await sleep(200); await shot("08-secrets"); await overflow("secrets");
  await ev(() => [...document.querySelectorAll(".tn-tabs button")].find((b) => b.textContent === "Settings").click());
  await sleep(200); await shot("09-settings"); await overflow("settings");
  await ev(() => [...document.querySelectorAll(".tn-tabs button")].find((b) => b.textContent === "Menu").click());
  await sleep(200); await shot("10-pause"); await overflow("pause");
  if (!mobile) await page.keyboard.press("Escape"); else await ev(() => window.__h.ctx.ui.closeMenu());
  await sleep(400);
  check(tag + " menu close unpauses", await ev(() => window.__h.ctx.state.rt.paused === false && window.__h.ctx.state.ui.screen === "game"));
  await ev(() => { window.__cRes = null; window.__h.ctx.ui.confirm("Stay?", ["Stay", "Let go"]).then((r) => { window.__cRes = r; }); });
  await sleep(400); await shot("11-confirm"); await overflow("confirm");
  await ev(() => document.querySelectorAll(".tn-confirm .tn-btn")[1].click());
  await sleep(100);
  check(tag + " confirm second = 1", await ev(() => window.__cRes === 1));
  await ev(() => { const ui = window.__h.ctx.ui; ui.banner("AREA 2 UNLOCKED", "The village gate is open"); ui.subtitle("i love you, you love me...", 3); ui.toast("Villager Morph can be claimed at the Village Exchange", { kind: "good" }); });
  await sleep(700); await shot("12-banner"); await overflow("banner");
  await ev(() => { window.__jDone = false; window.__h.ctx.ui.jumpscare("creature").then(() => { window.__jDone = true; }); });
  await sleep(250); await shot("13-jumpscare");
  await page.waitForFunction("window.__jDone === true", { timeout: 3000 });
  await ev(() => { window.__h.ctx.state.settings.reduceFlashing = true; window.__jDone = false; window.__h.ctx.ui.jumpscare("girl").then(() => { window.__jDone = true; }); });
  await sleep(300); await shot("14-jumpscare-reduced");
  await page.waitForFunction("window.__jDone === true", { timeout: 3000 });
  check(tag + " jumpscares resolve", true);
  await ev(() => { window.__h.ctx.state.settings.reduceFlashing = false; });
  await ev(() => { window.__dDone = false; window.__h.ctx.ui.deathScreen({}).then(() => { window.__dDone = true; }); });
  await sleep(1300); await shot("15-death"); await overflow("death");
  await page.waitForFunction("window.__dDone === true", { timeout: 4000 });
  check(tag + " death screen resolves", true);
  await ev(() => { window.__eRes = null; window.__h.ctx.state.profile.endings = { winners: 1, world: 1 }; window.__h.ctx.ui.ending("winners", { buttons: ["winner", "remember", "startOver", "title"] }).then((b) => { window.__eRes = b; }); });
  await sleep(3800); await shot("16-ending-winners"); await overflow("ending");
  check(tag + " ending card + leaderboard hidden", await ev(() => window.__h.ctx.state.ui.screen === "ending" && document.querySelector(".tn-lb").classList.contains("off")));
  await ev(() => document.querySelector(".tn-ending .tn-btn.win").click());
  await sleep(200);
  check(tag + " winner button", await ev(() => window.__eRes === "winner"));
  await sleep(900);
  await ev(() => { window.__eRes = null; window.__h.ctx.ui.ending("world", { buttons: ["remember", "startOver", "title"] }).then((b) => { window.__eRes = b; }); });
  await sleep(3600); await shot("17-ending-world"); await overflow("ending world");
  await ev(() => document.querySelectorAll(".tn-ending .tn-btn")[0].click());
  await sleep(1000);
  check(tag + " remember button", await ev(() => window.__eRes === "remember"));
  await ev(() => { window.__h.ctx.ui.fakeScreen("youWin", 1.6); window.__h.ctx.ui.glitch(1.5, 0.8); });
  await sleep(500); await shot("18-fake-win");
  await sleep(1400);
  await ev(() => window.__h.ctx.ui.fakeScreen("connectionLost", 1));
  await sleep(300); await shot("19-fake-lost"); await sleep(900);
  await ev(() => { window.__rDone = false; window.__h.ctx.ui.showRedTitle(1).then(() => { window.__rDone = true; }); });
  await sleep(700); await shot("20-red-title");
  await page.waitForFunction("window.__rDone === true", { timeout: 3000 });
  await ev(() => window.__h.ctx.bus.emit("game:start", { newGame: true, cycle: 1 }));
  await page.waitForFunction("window.__h.ctx.state.ui.screen === 'game' && getComputedStyle(document.querySelector('.tn-title')).display === 'none'", { timeout: 6000 });
  check(tag + " red title leaves on game:start", true);
  await ev(() => window.__h.ctx.ui.showTitle());
  await sleep(1200); await shot("21-title-continue"); await overflow("title continue");
  check(tag + " continue shown + paused", await ev(() => !document.querySelector(".tn-menu-col .tn-btn.tn-primary:nth-child(2)").classList.contains("tn-hide") && window.__h.ctx.state.rt.paused === true));
  await ev(() => document.querySelector(".tn-lbpill").click());
  await sleep(1500); await shot("22-leaderboard"); await overflow("leaderboard");
  check(tag + " leaderboard panel", await ev(() => !document.querySelector(".tn-lbpanel").classList.contains("tn-hide")));
  await ev(() => document.querySelector(".tn-lbpill").click());
  // settings over the title
  await ev(() => [...document.querySelectorAll(".tn-menu-col .tn-btn")].find((b) => b.textContent === "Settings").click());
  await sleep(400); await shot("23-title-settings"); await overflow("title settings");
  check(tag + " settings over title", await ev(() => document.querySelector(".tn-scrim").style.zIndex === "74"));
  await ev(() => window.__h.ctx.ui.closeMenu());
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = await serve();
  await lock.acquire("tnrpg-ui-test");
  let browser;
  const errors = [];
  try {
    browser = await puppeteer.launch({ headless: "new", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
    for (const mobile of [false, true]) {
      const page = await browser.newPage();
      await page.evaluateOnNewDocument(() => { window.__PLATYFY_ONLINE_TEST = { prefix: "pfo-test-tnrpg:", relay: "https://127.0.0.1:9" }; });
      page.on("pageerror", (e) => errors.push((mobile ? "m " : "d ") + e.message));
      page.on("console", (m) => { if (m.type() === "error") errors.push((mobile ? "m " : "d ") + m.text()); });
      if (mobile) await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148" });
      else await page.setViewport({ width: 1280, height: 720 });
      try { await run(page, srv.url, mobile); } catch (e) { check((mobile ? "m" : "d") + " run threw", false, e.message); }
      try { lock.touch && lock.touch(); } catch (e) { /* */ }
      await page.close();
    }
  } finally {
    if (browser) await browser.close();
    lock.release();
    srv.close();
  }
  const real = errors.filter((e) => !/127\.0\.0\.1:9|ERR_CONNECTION|Failed to load resource|net::/.test(e));
  check("no page errors", !real.length, real.slice(0, 5).join(" | "));
  const failed = results.filter((r) => !r.ok);
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " passed");
  process.exit(failed.length ? 1 : 0);
})();
