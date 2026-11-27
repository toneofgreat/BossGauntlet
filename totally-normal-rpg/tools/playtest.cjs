// playtest.cjs - end-to-end harness (CONTRACT 14). One headless browser, inside the machine-wide lock.
//   node totally-normal-rpg/tools/playtest.cjs              full run: title, name entry, a real rat kill, every zone /
//                                                           boss / sequence, all six endings, reduce-flashing, mobile
//   node totally-normal-rpg/tools/playtest.cjs --perf [--q 0|1|2]   fps / draw calls / triangles in every zone (1280x720)
//   node totally-normal-rpg/tools/playtest.cjs --swiftshader  force software GL (default: the machine's GPU via ANGLE)
// Screenshots: tools/shots/NN-name.jpg. Exit code 1 on any failed assert, page error or console error.
const path = require("path");
const fs = require("fs");
const lock = require("./browserlock.cjs");
const puppeteer = require("../../node_modules/puppeteer");
const { start } = require("./serve.cjs");

const args = process.argv.slice(2);
const PERF = args.includes("--perf");
const ENDINGS_ONLY = args.includes("--endings");   // dev: jump straight to the choice phase with hooks, run the endings
const OUT = path.join(__dirname, "shots");
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^\d\d-.*\.(png|jpg)$/.test(f) || /^perf-/.test(f)) { try { fs.unlinkSync(path.join(OUT, f)); } catch (e) { /* */ } }
// NOTE: --use-gl=swiftshader loses the WebGL context after a few seconds on this machine; the hardware GPU is both
// faster and the real perf target (UHD 620), so it is the default.
const LAUNCH = ["--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling",
  "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"]
  .concat(args.includes("--swiftshader") ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : []);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];            // { n, name, ok, ms, notes[] }
const consoleErrs = [];
const warnings = [];
const perf = [];
let T0 = Date.now();
let skipSteps = false;

async function openPage(browser, url, mobile) {
  const page = await browser.newPage();
  if (mobile) await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  else await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "warning" || m.type() === "warn") { if (warnings.length < 60 && !/GPU stall|GL Driver Message/.test(t)) warnings.push(t.slice(0, 220)); return; }
    if (m.type() !== "error") return;
    if (/Failed to load resource|ERR_UNSAFE_PORT|ERR_CONNECTION|127\.0\.0\.1:9|favicon/.test(t)) return;   // offline relay + favicon
    consoleErrs.push(((Date.now() - T0) / 1000).toFixed(1) + "s " + t.slice(0, 300));
  });
  page.on("pageerror", (e) => consoleErrs.push("pageerror: " + (e && e.message)));
  await page.evaluateOnNewDocument(() => {
    window.__PLATYFY_ONLINE_TEST = { prefix: "pfo-test-tnrpg:", relay: "https://127.0.0.1:9" };
    try { localStorage.clear(); } catch (e) { /* */ }
  });
  await page.goto(url + "/totally-normal-rpg/", { waitUntil: "load", timeout: 120000 });
  await page.waitForFunction(() => window.__tnrpg && window.__tnrpg.ready, { timeout: 150000, polling: 250 });
  return page;
}

(async () => {
  const srv = await start();
  await lock.acquire(PERF ? "tnrpg-perf" : "tnrpg-playtest");
  let browser;
  let fatal = null;
  let page;
  try {
    browser = await puppeteer.launch({ headless: "new", args: LAUNCH });
    T0 = Date.now();
    page = await openPage(browser, srv.url, false);
    console.log("ready in " + ((Date.now() - T0) / 1000).toFixed(1) + " s  GPU: " + await page.evaluate(() => {
      try { const gl = window.__tnrpg.ctx.renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : "?"; } catch (e) { return "?"; }
    }));
    lock.touch();
    const ev = (fn, ...a) => page.evaluate(fn, ...a);
    // G("a;; b;; c"): run each statement against g = window.__tnrpg in order, return the last value
    const G = (expr) => page.evaluate("(async () => { const g = window.__tnrpg; try { let r; " +
      expr.split(/;;\s*/).filter(Boolean).map((s) => "r = await (" + s + ");").join(" ") + " return r; } catch (e) { return 'ERR ' + e.message; } })()");
    const S = () => ev(() => window.__tnrpg.state());
    const waitFor = async (expr, ms = 10000, each) => {
      const t = Date.now();
      while (Date.now() - t < ms) { if (await G(expr) === true) return true; if (each) await G(each); await sleep(300); lock.touch(); }
      return false;
    };
    const SKIP = "g.skipTimers()";
    const settle = (ms = 30000, extra = "") => waitFor("!g.events || !g.events.active", ms, SKIP + (extra ? ";; " + extra : ""));
    const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + ".jpg"), type: "jpeg", quality: 72 }); };
    const key = async (k, ms = 90) => { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); };
    const clickText = (sel, text) => ev((sel, text) => {
      const b = Array.from(document.querySelectorAll(sel)).find((x) => x.offsetParent !== null && x.textContent.trim().toLowerCase().indexOf(text.toLowerCase()) >= 0);
      if (!b) return false; b.click(); return true;
    }, sel, text);
    const owned = async (id) => !!((await S()).run.owned || {})[id];
    const endingUp = (ms = 25000) => waitFor("g.state().ui.screen === 'ending' && !!document.querySelector('.tn-ending.on')", ms, SKIP);
    const remember = async () => {
      await waitFor("!!Array.from(document.querySelectorAll('.tn-ending .bs button')).find((b) => b.offsetParent !== null && !b.disabled)", 8000);
      await sleep(600);
      const ok = await clickText(".tn-ending .bs button", "remember");
      const back = await waitFor("g.state().ui.screen === 'game' && g.state().run.phase === 'choice' && !g.state().rt.cinematic", 20000);
      await sleep(700);
      return ok && back;
    };
    // frames counted with requestAnimationFrame over `ms` + renderer stats
    const measure = (ms) => ev((ms) => new Promise((res) => {
      let n = 0; const t0 = performance.now(); let worst = 0, last = t0;
      const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else {
        const s = window.__tnrpg.frameStats(); const q = window.__tnrpg.ctx.engine.quality.level;
        res({ fps: +(n * 1000 / (t - t0)).toFixed(1), worstMs: Math.round(worst), calls: s.calls, tris: s.tris, q });
      } };
      requestAnimationFrame(f);
    }), ms);

    const perfZones = async (label) => {
      const zones = await ev(() => Object.keys(window.__tnrpg.ctx.world.zones));
      for (const z of zones) {
        if (z === "collapse") continue;
        await G("g.teleport('" + z + "')");
        await sleep(1800);
        const m = await measure(2500);
        m.zone = z;
        perf.push(m);
        console.log("  fps " + label + " " + z.padEnd(13) + " " + String(m.fps).padStart(5) + " fps  worst " + String(m.worstMs).padStart(4) + " ms  q" + m.q + "  calls " + m.calls + "  tris " + m.tris);
        if (PERF) await shot("perf-" + z);
        lock.touch();
      }
    };

    if (PERF) {
      await G("g.play('Tester')"); await G("g.godMode(true)");
      const qi = args.indexOf("--q"); const ql = qi >= 0 ? +args[qi + 1] : null;
      await G(ql == null ? "g.quality('auto')" : "g.quality(" + ql + ")");
      await perfZones(ql == null ? "auto" : "q" + ql);
      skipSteps = true;
    }

    // ---------------------------------------------------------------------------------------------------- steps
    let N = 0;
    if (PERF) skipSteps = true;
    const step = async (name, fn) => {
      if (skipSteps) return;
      N++;
      const n = N;
      if (ENDINGS_ONLY && !/^(title|name|end-|reduceFlashing)/.test(name)) {
        if (name === "hollow2") { await G("g.godMode(true)"); await G("g.setCycle(1)"); await sleep(2500); await G("g.phase('choice')"); await G("g.ctx.save.snapshotChoice()"); await G("g.ctx.events.enterChoice()"); await sleep(1500); }
        return;
      }
      const r = { n, name, ok: true, ms: 0, notes: [] };
      const t = Date.now();
      const errBefore = consoleErrs.length;
      const assert = (cond, what) => { if (!cond) { r.ok = false; r.notes.push("FAIL " + what); } };
      try { await fn(assert, r.notes); }
      catch (e) { r.ok = false; r.notes.push("THREW " + (e && e.message || e)); }
      try { await shot(String(n).padStart(2, "0") + "-" + name); } catch (e) { r.notes.push("no screenshot: " + e.message); }
      try {
        const ge = await ev(() => (window.__tnrpg.errors || []).splice(0));
        if (ge && ge.length) { r.ok = false; r.notes.push("__tnrpg.errors: " + ge.slice(0, 3).join(" | ")); }
      } catch (e) { /* page may be navigating */ }
      if (consoleErrs.length > errBefore) { r.ok = false; r.notes.push("console: " + consoleErrs.slice(errBefore, errBefore + 2).join(" | ")); }
      r.ms = Date.now() - t;
      results.push(r);
      console.log((r.ok ? "ok  " : "FAIL") + " " + String(n).padStart(2) + " " + name + " (" + (r.ms / 1000).toFixed(1) + " s)" + (r.notes.length ? "  " + r.notes.join("; ") : ""));
      lock.touch();
    };

    // 1 title: particles drift, first gesture starts the title music
    await step("title", async (assert, notes) => {
      await sleep(2500);
      const px = () => ev(() => {
        const c = document.querySelector(".tn-title canvas"); if (!c || !c.width) return null;
        const t = document.createElement("canvas"); t.width = 160; t.height = 90; const x = t.getContext("2d");
        x.drawImage(c, 0, 0, 160, 90); const d = x.getImageData(0, 0, 160, 90).data; let lit = 0, sig = 0;
        for (let i = 0; i < d.length; i += 4) { const v = d[i] + d[i + 1] + d[i + 2]; if (v > 90) { lit++; sig = (sig * 31 + i) % 1000003; } }
        return { lit, sig };
      });
      const a = await px(); await sleep(500); const b = await px();
      assert(a && a.lit > 20, "title particles drawn (" + (a && a.lit) + " lit px)");
      assert(a && b && a.sig !== b.sig, "title particles move");
      assert(await ev(() => !!document.querySelector(".tn-photo") && /flash/i.test(document.querySelector(".tn-photo").textContent)), "photosensitivity note");
      await page.mouse.click(120, 300);
      assert(await waitFor("!!(g.ctx.audio && g.ctx.audio.unlocked && g.ctx.audio.current === 'title')", 5000), "title music playing after first click");
      notes.push("particles " + a.lit + " px, music " + await G("g.ctx.audio.current"));
    });

    // 2 name entry: a rude name is refused, the two special names pass
    await step("name", async (assert, notes) => {
      assert(await clickText(".tn-title button", "play"), "Play button");
      assert(await waitFor("!!document.querySelector('#tn-name-in') && document.querySelector('#tn-name-in').offsetParent !== null", 5000), "name entry open");
      const typeName = async (s) => {
        await ev(() => { const i = document.querySelector("#tn-name-in"); i.value = ""; i.focus(); });
        await page.type("#tn-name-in", s, { delay: 8 });
        await page.keyboard.press("Enter");
        await sleep(350);
      };
      await typeName("shithead");
      const err = await ev(() => document.querySelector(".tn-err").textContent);
      assert(err.length > 0 && (await S()).ui.screen === "name", "rude name rejected (" + err + ")");
      notes.push("rude -> \"" + err + "\"");
      const v = await ev(async () => {
        const m = await import("./src/ui/names.js");
        const r = (s) => { const x = m.validateName(s); return x.ok ? "ok" + (x.special ? "*" : "") : x.reason; };
        return { idiot: r("idiot"), IDIOT: r("IDIOT"), granny: r("mygranniesamotherfucker"), fuck: r("fuck"), idiotfuck: r("idiotfuck"), online: m.onlineNameFor("mygranniesamotherfucker") };
      });
      assert(v.idiot === "ok" && v.IDIOT === "ok", "idiot allowed");
      assert(v.granny === "ok*", "mygranniesamotherfucker allowed (special)");
      assert(v.fuck !== "ok" && v.idiotfuck !== "ok", "fuck / idiotfuck rejected");
      assert(v.online === "MyGrannie", "special online name MyGrannie");
      await typeName("mygranniesamotherfucker");
      assert(await waitFor("g.state().rt.playing === true && g.state().ui.screen === 'game'", 15000), "playing after name");
      const s = await S();
      assert(s.profile.name === "mygranniesamotherfucker", "profile.name");
      assert(s.profile.onlineName === "MyGrannie", "onlineName MyGrannie (" + s.profile.onlineName + ")");
      assert(await G("!g.ctx.engine.touch.visible && getComputedStyle(document.querySelector('#touch')).display === 'none'"), "no touch buttons on desktop");
      notes.push("zone " + s.world.zone + ", phase " + s.run.phase);
    });

    // 3 walk from the lobby to the rat field and punch a rat to death with real keys
    await step("real-rat", async (assert, notes) => {
      await sleep(1500);
      const t0 = Date.now();
      let held = new Set();
      const setKeys = async (want) => {
        for (const k of held) if (!want.has(k)) await page.keyboard.up(k);
        for (const k of want) if (!held.has(k)) await page.keyboard.down(k);
        held = want;
      };
      let killed = false, punches = 0, minD = 1e9, lastAttack = 0;
      const start = await S();
      while (Date.now() - t0 < 90000) {
        const info = await ev(() => {
          const c = window.__tnrpg.ctx, p = c.engine.player.position;
          let best = null, bd = 1e9;
          for (const e of c.combat.enemies) {
            if (!e.alive || e.kind !== "rat") continue;
            const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
            if (d < bd) { bd = d; best = e; }
          }
          const tgt = best && bd < 60 ? best.pos : { x: 0, z: 96 };
          return { px: p.x, pz: p.z, dx: tgt.x - p.x, dz: tgt.z - p.z, d: best ? bd : -1, cy: c.engine.camera3p.yaw, kills: c.state.run.kills.rat | 0, ui: c.state.ui.screen, hp: c.state.player.hp };
        });
        if (info.kills > (start.run.kills.rat | 0)) { killed = true; break; }
        if (info.ui === "dialogue") { await key("Escape"); }
        const dl = Math.hypot(info.dx, info.dz) || 1;
        const fx = Math.sin(info.cy), fz = Math.cos(info.cy), rx = -Math.cos(info.cy), rz = Math.sin(info.cy);
        const f = (info.dx * fx + info.dz * fz) / dl, r = (info.dx * rx + info.dz * rz) / dl;
        const want = new Set();
        const near = info.d >= 0 && info.d < 1.7;
        if (info.d >= 0) minD = Math.min(minD, info.d);
        if (!near || f < 0.7) {
          if (f > 0.38) want.add("KeyW"); else if (f < -0.38) want.add("KeyS");
          if (r > 0.38) want.add("KeyD"); else if (r < -0.38) want.add("KeyA");
          if (!near && info.d > 8 || info.d < 0) want.add("ShiftLeft");
        }
        await setKeys(want);
        if (info.d >= 0 && info.d < 2.2 && Date.now() - lastAttack > 420) { await key("KeyF", 60); punches++; lastAttack = Date.now(); }
        await sleep(110);
        lock.touch();
      }
      await setKeys(new Set());
      await sleep(1200);
      const s = await S();
      notes.push("walked + " + punches + " punches in " + ((Date.now() - t0) / 1000).toFixed(0) + " s, closest " + minD.toFixed(1) + " m");
      assert(killed, "killed a rat with real input");
      assert(s.run.level >= 1, "level >= 1 (" + s.run.level + ")");
      assert(s.run.owned.smelly_sword && s.run.equip.sword === "smelly_sword", "Smelly Sword owned + equipped (" + s.run.equip.sword + ")");
      await G("g.godMode(true)");
    });

    // 4 frame rate in every zone (cycle 0, quality auto)
    await step("fps-zones", async () => { await G("g.quality(1)"); await perfZones("q1"); await G("g.quality('auto')"); await G("g.teleport('lobby')"); await sleep(1000); });

    // natural secrets: standing spots, the basement, the sign, the crown milestone
    await step("secrets-tour", async (assert, notes) => {
      const before = Object.keys((await S()).profile.secrets);
      for (const [p, ms] of [["underBridge", 1800], ["waterfallCave", 2000], ["portrait", 2200], ["cactusFlower", 2000], ["totem", 6500]]) {
        await G("g.teleport('" + p + "')"); await sleep(ms); lock.touch();
      }
      // stand 1.1 m in front of a thing, face it, press E, click through whatever it says
      const useAt = async (posExpr, times = 1) => {
        await ev((posExpr) => {
          const g = window.__tnrpg, p = (0, eval)("(g) => " + posExpr)(g), pl = g.ctx.engine.player.position;
          let dx = pl.x - p.x, dz = pl.z - p.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
          g.teleportTo(p.x + dx * 1.1, (p.y || 0) + 0.4, p.z + dz * 1.1);
          g.ctx.engine.player.yaw = Math.atan2(-dx, -dz);
        }, posExpr);
        await sleep(500);
        for (let k = 0; k < times; k++) {
          await key("KeyE"); await sleep(900);
          for (let i = 0; i < 8 && /dialogue/.test((await S()).ui.screen); i++) { await page.mouse.click(640, 640); await sleep(350); }
          await sleep(300);
        }
      };
      // the basement for real: the rug over the trapdoor in the lobby house
      await G("g.teleport('lobby')"); await sleep(600);
      await useAt("({ x: g.ctx.world.prop('trapdoor').getWorldPosition(new g.ctx.THREE.Vector3()).x, y: 0.35, z: g.ctx.world.prop('trapdoor').getWorldPosition(new g.ctx.THREE.Vector3()).z })");
      notes.push("basement y " + (await G("g.ctx.engine.player.position.y.toFixed(2)")));
      await G("g.teleport('lobby')"); await sleep(600);
      // read the sign five times
      await useAt("g.ctx.world.npc('sign').pos", 5);
      notes.push("sign reads " + (await S()).profile.signReads);
      await G("g.setLevel(1000000)"); await sleep(800);
      await G("g.teleport('lobby')"); await sleep(800);
      const got = Object.keys((await S()).profile.secrets).filter((k) => before.indexOf(k) < 0);
      notes.push("new: " + got.join(","));
      const have = (await S()).profile.secrets;
      for (const id of ["underBridge", "waterfall", "basement", "portrait", "cactusFlower", "totem", "crown", "normalSign"]) assert(have[id], "secret " + id);
      await G("g.setLevel(1)");
    });

    await step("bridge", async (assert) => { await G("g.teleport('bridge')"); await sleep(1500); const z = (await S()).world.zone; assert(z === "bridge", "zone bridge (" + z + ")"); });
    await step("ratKing", async (assert) => {
      await G("g.teleport('ratKing')"); await sleep(800);
      await G("g.defeat('ratKing')");
      assert(await waitFor("!!g.state().run.owned.cheese_sword", 15000), "owned cheese_sword");
    });
    await step("village", async (assert) => {
      await G("g.setLevel(50)"); await G("g.teleport('village')"); await sleep(2000);
      await G("g.kill('villager')"); await sleep(1200);
      assert(((await S()).run.kills.villager | 0) >= 1, "killed a villager");
    });
    await step("guards", async (assert) => {
      await G("g.setLevel(600)"); await G("g.teleport('guardPost')"); await sleep(800); await G("g.defeat('guards')");
      assert(await waitFor("!!g.state().run.owned.iron_sword", 15000), "owned iron_sword");
    });
    await step("castle", async (assert) => {
      await G("g.setLevel(50000)"); await G("g.teleport('castle')"); await sleep(2000);
      for (let i = 0; i < 8 && !(await owned("gold_sword")); i++) { await G("g.kill('royalGuard')"); await sleep(1200); }
      assert(await owned("gold_sword"), "owned gold_sword");
    });
    await step("cat-rookie", async (assert) => {
      await G("g.secret('kittens')");
      await G("g.defeat('cat')"); await sleep(800);
      await G("g.defeat('rookie')"); await sleep(800);
      const s = await S();
      assert(s.profile.secrets.catBoss, "secret catBoss");
      assert(s.profile.secrets.rookieBoss, "secret rookieBoss");
    });
    await step("king", async (assert) => {
      await G("g.setLevel(100000)"); await G("g.teleport('kingDark')"); await sleep(1500);
      await G("g.defeat('king')");
      assert(await waitFor("!!g.state().run.owned.kings_staff", 20000), "owned kings_staff");
      assert(await waitFor("g.state().run.phase === 'postKing'", 20000), "phase postKing");
    });
    const seq = async (id, ms) => { await settle(15000); await G("g.trigger('" + id + "')"); await sleep(ms); };
    await step("desert", async (assert) => {
      await seq("desert", 2500); assert((await S()).world.zone === "desert", "in desert (" + (await S()).world.zone + ")");
    });
    await step("forest", async (assert) => { await seq("forest", 3000); assert((await S()).world.region === "forest" || (await S()).world.zone === "forest", "in forest"); });
    await step("forestHouse", async (assert) => { await seq("forestHouse", 3500); assert((await S()).world.zone === "forestHouse", "in forestHouse (" + (await S()).world.zone + ")"); });
    await step("forestNight", async (assert) => {
      await seq("forestNight", 1500);
      assert(await waitFor("g.events.active === 'chase'", 30000, SKIP), "jumpscare -> chase (" + await G("g.events.active") + ")");
    });
    await step("chase", async (assert) => {
      await sleep(2500);
      assert((await S()).run.phase === "chase", "phase chase");
    });
    await step("collapse", async (assert) => {
      await G("g.trigger('collapse')");
      assert(await waitFor("g.events && g.events.active === 'collapse'", 15000), "collapse running");
      // the course builds lazily over frames; checkpoints work once it is active
      assert(await waitFor("g.collapseCheckpoint(0) === true", 30000), "collapse course active");
      for (let i = 0; i < 3; i++) {
        const ok = await G("g.collapseCheckpoint(" + (i * 2) + ")");
        await sleep(1800); await shot(String(N).padStart(2, "0") + "-collapse-" + (i + 1));
        if (i === 0) assert(ok === true, "collapse checkpoint (" + ok + ")");
        lock.touch();
      }
    });
    await step("throne", async (assert) => {
      await G("g.winBoss()");   // collapse -> reach the end -> throne
      assert(await waitFor("g.events.active === 'throne' || g.state().run.cycle === 1", 30000, SKIP), "throne started");
      await sleep(1500); await shot(String(N).padStart(2, "0") + "-throne-fight");
      assert(await waitFor("g.state().run.cycle === 1", 60000, "g.skipTimers();; g.winBoss()"), "cycle 1");
      assert(await waitFor("!!g.state().profile.secrets.ngplus", 10000), "secret ngplus");
      assert(await waitFor("g.state().ui.screen === 'game'", 20000), "back in game");
    });
    await step("cycle1-area1", async (assert) => { await G("g.teleport('ratField')"); await sleep(2500); assert((await S()).run.phase === "ng", "phase ng"); });
    await step("cycle1-king", async (assert) => {
      await G("g.setLevel(200000)"); await G("g.teleport('kingDark')"); await sleep(1000);
      await G("g.defeat('king')");
      assert(await waitFor("g.state().run.phase === 'ngPostKing'", 20000, SKIP), "phase ngPostKing (" + (await S()).run.phase + ")");
      await settle(20000);
    });
    await step("hollowDesert", async (assert) => { await seq("hollowDesert", 3000); assert((await S()).world.zone === "hollowDesert", "in hollowDesert (" + (await S()).world.zone + ")"); });
    await step("girl", async (assert) => {
      await seq("girl", 1500);
      assert(await waitFor("g.ctx.state.run.phase === 'girl' || g.ctx.state.run.phase === 'hollow2'", 20000, SKIP), "phase girl");
      await sleep(1000);
    });
    await step("hollow2", async (assert) => {
      await settle(30000);
      if (await G("g.state().run.phase") !== "choice") { await G("g.trigger('hollow2')"); await sleep(2500); await shot(String(N).padStart(2, "0") + "-hollow2-fight"); }
      assert(await waitFor("g.state().run.phase === 'choice'", 60000, "g.skipTimers();; g.winBoss()"), "phase choice (" + await G("g.state().run.phase") + ")");
      assert(await waitFor("!!g.state().choiceSnapshot", 10000), "choiceSnapshot saved");
      assert(await waitFor("g.state().ui.screen === 'game' && (!g.events.active || g.events.active === 'choice') && !g.state().rt.cinematic", 30000, SKIP), "back in game at the sword (" + await G("g.events.active") + ")");
    });
    await step("end-monster", async (assert) => {
      await G("g.ctx.events.enterChoice()"); await sleep(1500);
      await key("KeyE"); await sleep(900);
      let yes = await clickText(".tn-confirm .bs button, .tn-dlg button", "take");
      if (!yes) yes = await ev(() => { const bs = Array.from(document.querySelectorAll(".tn-confirm button")).filter((b) => b.offsetParent); if (bs.length < 2) return false; bs[0].click(); return true; });
      if (!yes) { assert(await G("g.ending('monster')") === true, "monster card up (hook)"); }
      assert(await endingUp(45000), "monster card up");
      assert(((await S()).profile.endings.monster | 0) >= 1, "monster ending counted");
      assert(await remember(), "remember -> choice");
    });
    await step("end-world", async (assert) => {
      await G("g.teleport('voidLeap')"); await sleep(1500);
      const focus = await G("(() => { const p = g.ctx.engine.player.position; return [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1), g.state().run.phase]; })()");
      await key("KeyE"); await sleep(1200);
      const yes = await clickText(".tn-confirm button", "let go");
      assert(yes, "confirm 'Let go' clicked (focus " + JSON.stringify(focus) + ")");
      assert(await endingUp(45000), "world card up");
      assert(((await S()).profile.endings.world | 0) >= 1, "world ending counted");
      assert(await remember(), "remember -> choice");
    });
    await step("end-warrior", async (assert) => {
      for (const id of ["shovel", "cheese_sword", "wooden_sword", "iron_sword", "gold_sword", "kings_staff", "girls_ribbon"]) await G("g.give('" + id + "')");
      for (let i = 0; i < 6; i++) {
        await G("g.teleport('grave" + i + "')"); await sleep(800);
        await key("KeyE"); await sleep(1000);
        await clickText(".tn-confirm button", "bury");
        await sleep(600); lock.touch();
      }
      const b = (await S()).run.buried || {};
      assert(Object.keys(b).filter((k) => b[k]).length === 6, "6 graves buried (" + Object.keys(b).join(",") + ")");
      assert(await endingUp(45000), "warrior card up");
      assert(await remember(), "remember -> choice");
    });
    const finalUp = "g.events && (g.events.active === 'final' || g.events.active === 'rematch') && !!(g.events.fight && g.events.fight.core && g.events.fight.core.started)";
    await step("end-idiot", async (assert) => {
      await G("g.idle()");
      assert(await waitFor(finalUp, 30000, SKIP), "final fight started");
      await sleep(1500); await shot(String(N).padStart(2, "0") + "-final-fight");
      await G("g.loseBoss()");
      assert(await endingUp(45000), "idiot card up");
      assert(((await S()).profile.endings.idiot | 0) >= 1, "idiot ending counted");
      assert(await remember(), "remember -> choice");
    });
    await step("end-winners", async (assert) => {
      await G("g.idle()");
      assert(await waitFor(finalUp, 30000, SKIP), "final fight started");
      await G("g.winBoss()");
      assert(await endingUp(45000), "winners card up");
      assert(((await S()).profile.endings.winners | 0) >= 1, "winners ending counted");
    });
    await step("end-sigma", async (assert) => {
      await waitFor("!!Array.from(document.querySelectorAll('.tn-ending .bs button')).find((b) => b.offsetParent !== null && !b.disabled)", 8000);
      await sleep(600);
      assert(await clickText(".tn-ending .bs button", "winner"), "Winner (rematch) clicked");
      assert(await waitFor(finalUp, 30000, SKIP), "rematch started (" + JSON.stringify(await G("[g.events.active, g.state().run.phase, g.state().ui.screen]")) + ")");
      assert((await S()).player.lives === 1, "rematch has 1 life");
      await G("g.winBoss()");
      assert(await waitFor("(g.state().profile.endings.sigma | 0) >= 1", 60000, SKIP), "sigma ending counted");
      assert(await endingUp(30000), "sigma card up");
      const s = await S();
      for (const e of ["monster", "world", "warrior", "idiot", "winners", "sigma"]) assert(s.profile.secrets["end_" + e], "secret end_" + e);
    });
    await step("reduceFlashing", async (assert) => {
      await remember();
      await G("g.ctx.ui.setSetting ? g.ctx.ui.setSetting('reduceFlashing', true) : (g.ctx.state.settings.reduceFlashing = true)");
      assert((await S()).settings.reduceFlashing === true, "reduceFlashing on");
      ev(() => { try { window.__tnrpg.ctx.ui.jumpscare("creature", { dur: 0.9 }); window.__tnrpg.ctx.engine.postfx.flash({}); } catch (e) { console.warn(e); } });
      await sleep(300);
      const strobe = await ev(() => { const j = document.querySelector(".tn-jump"); return j ? getComputedStyle(j).animationName : "none"; });
      assert(!/strobe|flash/i.test(strobe), "no strobe animation (" + strobe + ")");
      await sleep(900);
    });
    await step("secrets", async (assert, notes) => {
      const secs = await G("g.secrets().filter((s) => s.found).length");
      notes.push(secs + "/26 secrets");
      assert(secs >= 20, "secrets >= 20 (" + secs + ")");
    });
    await step("mobile", async (assert) => {
      const desk = page;
      page = await openPage(browser, srv.url, true);
      await desk.close();
      await sleep(2000); await shot(String(N).padStart(2, "0") + "-mobile-title");
      const fits = () => ev(() => {
        const W = 390, bad = [];
        if (document.documentElement.scrollWidth > W) bad.push("scrollWidth " + document.documentElement.scrollWidth);
        for (const e of document.querySelectorAll("#ui *, #touch *")) {
          if (e.offsetParent === null && getComputedStyle(e).position !== "fixed") continue;
          const r = e.getBoundingClientRect();
          if (r.width > 0 && r.height > 0 && (r.right > W + 1 || r.left < -1)) bad.push((e.className || e.tagName) + " " + Math.round(r.left) + ".." + Math.round(r.right));
          if (bad.length > 4) break;
        }
        return bad;
      });
      let bad = await fits(); assert(!bad.length, "title fits 390 px: " + bad.join(", "));
      await page.touchscreen.tap(195, 300);
      await sleep(300);
      await clickText(".tn-title button", "play");
      await waitFor("!!document.querySelector('#tn-name-in') && document.querySelector('#tn-name-in').offsetParent !== null", 5000);
      await page.type("#tn-name-in", "idiot", { delay: 10 });
      await shot(String(N).padStart(2, "0") + "-mobile-name");
      await clickText(".tn-entry button", "begin");
      assert(await waitFor("g.state().rt.playing === true", 15000), "playing as idiot");
      assert((await S()).profile.name === "idiot", "name idiot accepted");
      await sleep(3500); await shot(String(N).padStart(2, "0") + "-mobile-hud");
      bad = await fits(); assert(!bad.length, "HUD fits 390 px: " + bad.join(", "));
      assert(await ev(() => { const t = document.querySelector("#touch"); return !!t && t.children.length > 0 && getComputedStyle(t).display !== "none"; }), "touch controls shown");
      ev(() => { try { window.__tnrpg.ctx.ui.dialogue({ speaker: "Bram the Extremely Long-Named Villager", lines: ["This is a deliberately long line of dialogue to check that the box wraps and fits on a narrow phone screen without spilling."], choices: ["Yes, absolutely", "No thank you, not today"] }); } catch (e) { /* */ } });
      await sleep(3500); await shot(String(N).padStart(2, "0") + "-mobile-dialogue");
      bad = await fits(); assert(!bad.length, "dialogue fits 390 px: " + bad.join(", "));
    });
  } catch (e) {
    fatal = e;
    console.log("ERROR " + (e && e.stack || e));
  } finally {
    if (browser) await browser.close().catch(() => {});
    lock.release();
    await srv.close();
  }
  const fails = results.filter((r) => !r.ok).length + (fatal ? 1 : 0) + (PERF ? consoleErrs.length : 0);
  if (!PERF) {
    console.log("\n #  step                 ok    time   notes");
    for (const r of results) console.log(String(r.n).padStart(2) + "  " + r.name.padEnd(20) + " " + (r.ok ? "ok  " : "FAIL") + " " + (r.ms / 1000).toFixed(1).padStart(6) + "s  " + r.notes.join("; ").slice(0, 200));
  }
  if (perf.length) {
    console.log("\nzone           fps   worst  q  calls    tris");
    for (const m of perf) console.log(m.zone.padEnd(13) + String(m.fps).padStart(6) + String(m.worstMs).padStart(6) + "ms " + m.q + String(m.calls).padStart(7) + String(m.tris).padStart(9));
  }
  if (consoleErrs.length) console.log("\nconsole errors:\n  " + consoleErrs.slice(0, 20).join("\n  "));
  if (warnings.length) console.log("\nwarnings (" + warnings.length + "):\n  " + [...new Set(warnings)].slice(0, 15).join("\n  "));
  console.log("total " + ((Date.now() - T0) / 1000).toFixed(0) + " s, " + results.length + " steps, " + fails + " failed, " + consoleErrs.length + " console errors");
  process.exit(fails ? 1 : 0);
})();
