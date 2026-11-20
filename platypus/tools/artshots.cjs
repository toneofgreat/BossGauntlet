// Art-direction contact sheets: deterministic frame stepping + free camera.
//   node tools/artshots.cjs [platy] [walk] [jump] [cushion] [actors] [zap] [ui] [phone]   (no args = all)
const http = require("http"), fs = require("fs"), path = require("path");
const puppeteer = require(path.join(__dirname, "..", "..", "node_modules", "puppeteer"));
const ROOT = path.join(__dirname, ".."), SHOTS = path.join(__dirname, "shots");
const MIME = { ".html": "text/html", ".js": "text/javascript" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const want = process.argv.slice(2);
const on = (n) => want.length === 0 || want.includes(n);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const srv = http.createServer((req, res) => { let p = req.url.split("?")[0]; if (p.endsWith("/")) p += "index.html";
    fs.readFile(path.join(ROOT, p), (e, b) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { "Content-Type": MIME[path.extname(p)] || "application/octet-stream", "Cache-Control": "no-store" }); res.end(b); }); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + srv.address().port + "/index.html";
  const browser = await puppeteer.launch({ headless: true, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio"], defaultViewport: { width: 1280, height: 720 } });
  const errs = [];
  let page;
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const raw = [];
  const shot = async (n, clip) => { const f = path.join(SHOTS, "a-" + n + ".png"); await page.screenshot(clip ? { path: f, clip } : { path: f }); return f; };
  async function sheet(name, files, cols, w, h) {
    const p2 = await browser.newPage();
    const rows = Math.ceil(files.length / cols);
    await p2.setViewport({ width: cols * w, height: rows * h });
    const html = "<body style='margin:0;background:#222;display:grid;grid-template-columns:repeat(" + cols + "," + w + "px)'>" +
      files.map((f) => "<img style='width:" + w + "px;height:" + h + "px;display:block;outline:1px solid #555' src='data:image/png;base64," + fs.readFileSync(f).toString("base64") + "'>").join("") + "</body>";
    await p2.setContent(html);
    await p2.screenshot({ path: path.join(SHOTS, "S-" + name + ".png") });
    await p2.close();
    for (const f of files) fs.unlinkSync(f);
    console.log("sheet " + name);
  }
  async function open(vp, touch) {
    page = await browser.newPage();
    if (vp) await page.setViewport(vp);
    page.on("pageerror", (e) => errs.push(String(e.stack || e)));
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.text()); });
    await page.evaluateOnNewDocument(() => {
      const real = window.requestAnimationFrame.bind(window);
      let manual = false, q = [], vt = 0;
      window.requestAnimationFrame = (cb) => { if (manual) { q.push(cb); return 0; } return real((t) => { vt = t; cb(t); }); };
      window.__freeze = () => { manual = true; };
      window.__thaw = () => { manual = false; const c = q; q = []; for (const f of c) real(f); };
      window.__step = (ms, n) => { for (let i = 0; i < (n || 1); i++) { vt += ms; const c = q; q = []; for (const f of c) f(vt); } };
      // free camera relative to the player (right, up, forward offsets), rendered immediately
      window.__cam = (rx, uy, fz, ty, tf, fov) => {
        const P = window.__platy, p = P.player, c = P.camera;
        const s = Math.sin(p.yaw), co = Math.cos(p.yaw);
        // player's left is +X local; "right" offset rx is to the animal's right
        c.position.set(p.x - rx * co + fz * s, p.y + uy, p.z + rx * s + fz * co);
        if (fov) { c.fov = fov; c.updateProjectionMatrix(); }
        c.lookAt(p.x + (tf || 0) * s, p.y + (ty === undefined ? 0.13 : ty), p.z + (tf || 0) * co);
        P.renderer.render(P.scene, c);
      };
      window.__camW = (x, y, z, tx, ty, tz, fov) => {
        const P = window.__platy, c = P.camera;
        c.position.set(x, y, z); if (fov) { c.fov = fov; c.updateProjectionMatrix(); }
        c.lookAt(tx, ty, tz); P.renderer.render(P.scene, c);
      };
    });
    await page.goto(url);
    await page.waitForFunction(() => window.__platy && !document.getElementById("levelBtn").disabled, { timeout: 60000 });
  }
  async function enter() {
    await page.click("#levelBtn");
    await page.waitForFunction(() => window.__platy.state().step === "greet", { timeout: 20000 });
    await ev(() => { document.getElementById("white").style.display = "none"; });
    await page.addStyleTag({ content: "#hud,#back,#hurt{display:none!important}" });
    await sleep(300);
  }
  const freeze = async () => { await ev(() => window.__freeze()); await sleep(80); };
  const thaw = () => ev(() => window.__thaw());
  const step = (ms, n) => ev((a, b) => window.__step(a, b), ms, n || 1);
  const cam = (...a) => ev((a) => window.__cam(...a), a);
  const grab = async (n) => { await sleep(40); return shot(n); };

  try {
    if (on("ui")) {
      await open();
      const f = [];
      f.push(await shot("ui-start"));
      await page.hover("#levelBtn"); await sleep(400); f.push(await shot("ui-start-hover"));
      await page.click("#levelBtn");
      await sleep(700); f.push(await shot("ui-black"));
      await sleep(1300); f.push(await shot("ui-tut"));
      await sleep(2100); f.push(await shot("ui-white"));
      await page.waitForFunction(() => window.__platy.state().step === "greet", { timeout: 20000 });
      await sleep(2500); f.push(await shot("ui-greet"));
      await ev(() => window.__platy.skipTo("fight")); await sleep(2500); f.push(await shot("ui-fight"));
      await ev(() => window.__platy.win());
      await page.waitForFunction(() => document.getElementById("victory").classList.contains("on"), { timeout: 15000 });
      await sleep(1600); f.push(await shot("ui-victory"));
      await sheet("ui", f, 2, 960, 540);
      await page.close();
    }
    if (on("phone")) {
      await open({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      const f = [];
      f.push(await shot("ph-start"));
      await page.tap("#levelBtn");
      await sleep(2000); f.push(await shot("ph-tut"));
      await page.waitForFunction(() => window.__platy.state().step === "greet", { timeout: 20000 });
      await sleep(2500); f.push(await shot("ph-greet"));
      await ev(() => window.__platy.skipTo("move")); await sleep(1500); f.push(await shot("ph-move"));
      await ev(() => window.__platy.skipTo("zap")); await sleep(3000); f.push(await shot("ph-zap"));
      await ev(() => window.__platy.skipTo("fight")); await sleep(3000); f.push(await shot("ph-fight"));
      await ev(() => window.__platy.win());
      await page.waitForFunction(() => document.getElementById("victory").classList.contains("on"), { timeout: 15000 });
      await sleep(1600); f.push(await shot("ph-victory"));
      // landscape
      await page.setViewport({ width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await sleep(800); f.push(await shot("ph-land-victory"));
      await sheet("phone", f.slice(0, 7), 4, 390, 844);
      await sheet("phone-land", f.slice(7), 1, 844, 390);
      await page.close();
    }
    if (on("platy") || on("walk") || on("jump") || on("cushion")) {
      await open(); await enter();
      await ev(() => window.__platy.skipTo("move")); await sleep(600);
      await ev(() => { const P = window.__platy; P.tp(-6.0, -5.8, 2.6); });
      await sleep(900);
      if (on("platy")) {
        await freeze(); await step(16, 2);
        const f = [];
        await cam(1.25, 0.16, 0.0, 0.13, 0, 40); f.push(await grab("p-side"));
        await cam(0, 0.2, 1.3, 0.12, 0, 40); f.push(await grab("p-front"));
        await cam(0.001, 1.6, 0.0, 0.1, 0, 40); f.push(await grab("p-top"));
        await cam(0.8, 0.5, 0.95, 0.12, 0, 40); f.push(await grab("p-34"));
        await cam(-0.75, 0.38, -0.9, 0.12, 0, 40); f.push(await grab("p-34back"));
        await cam(0.42, 0.14, 0.72, 0.12, 0.3, 40); f.push(await grab("p-face"));
        await sheet("platy", f, 2, 800, 450);
        await ev(() => { window.dispatchEvent(new Event('resize')); });
        await thaw();
      }
      if (on("walk")) {
        await ev(() => { window.__platy.cam.yaw = 2.6; window.__platy.cam.manualT = 1e9; });
        await ev(() => window.__platy.tp(-6.77, -4.99, 2.6)); await sleep(300);
        await page.keyboard.down("KeyW"); await sleep(420);
        await freeze();
        const a = [], b = [];
        for (let i = 0; i < 8; i++) {
          await step(1000 / 120, 3);
          await cam(1.15, 0.14, 0.0, 0.12, 0, 40); a.push(await grab("w-s" + i));
          await cam(0.001, 1.5, 0.0, 0.1, 0, 40); b.push(await grab("w-t" + i));
        }
        await sheet("walk-side", a, 2, 800, 450);
        await sheet("walk-top", b, 4, 480, 270);
        // slow walk (touch stick half) : simulate by holding and releasing? use front 3/4 at speed
        const c = [];
        for (let i = 0; i < 4; i++) { await step(1000 / 120, 6); await cam(0.7, 0.35, 1.0, 0.12, 0, 40); c.push(await grab("w-q" + i)); }
        await sheet("walk-34", c, 2, 800, 450);
        await page.keyboard.up("KeyW");
        await ev(() => { window.dispatchEvent(new Event('resize')); });
        await thaw(); await sleep(700);
      }
      if (on("jump")) {
        await ev(() => window.__platy.tp(-6.1, -6.1, 2.6)); await sleep(500);
        await freeze(); await step(16, 2);
        await page.keyboard.press("Space");
        const f = [];
        const marks = [0.03, 0.12, 0.25, 0.4, 0.58, 0.7, 0.76, 0.9];
        let t = 0;
        for (let i = 0; i < marks.length; i++) {
          while (t < marks[i] - 1e-6) { await step(1000 / 120, 1); t += 1 / 120; }
          await ev(() => { const P = window.__platy, p = P.player, c = P.camera; const s = Math.sin(p.yaw), co = Math.cos(p.yaw);
            const gy = P.cushions.heightAt(p.x, p.z);
            c.fov = 40; c.updateProjectionMatrix();
            c.position.set(p.x - 2.9 * co, gy + 0.95, p.z + 2.9 * s); c.lookAt(p.x, gy + 0.55, p.z); P.renderer.render(P.scene, c); });
          f.push(await grab("j" + i));
        }
        await sheet("jump", f, 2, 800, 450);
        await ev(() => { window.dispatchEvent(new Event('resize')); });
        await thaw(); await sleep(600);
      }
      if (on("cushion")) {
        await ev(() => { const P = window.__platy; P.tp(-6.1, -6.1, 2.6); });
        await sleep(500);
        await freeze(); await step(16, 2);
        const f = [];
        await ev(() => window.__camW(-3.5, 1.5, -8.7, -6.1, 0.2, -6.1, 45)); f.push(await grab("c-near"));
        await ev(() => window.__camW(-4.9, 0.55, -7.8, -3.1, 0.3, -4.6, 45)); f.push(await grab("c-low"));
        await ev(() => window.__camW(-6.1, 2.2, -12, -6.1, 0.3, 2, 52)); f.push(await grab("c-far"));
        await ev(() => window.__camW(-5.5, 6, -6.7, -5.5, 0, -6.69, 52)); f.push(await grab("c-top"));
        // pressed: jump and land
        await page.keyboard.press("Space");
        await step(1000 / 120, 88);
        await ev(() => window.__camW(-3.9, 0.8, -8.3, -6.1, 0.25, -6.1, 40)); f.push(await grab("c-press1"));
        await step(1000 / 120, 8);
        await ev(() => window.__camW(-3.9, 0.8, -8.3, -6.1, 0.25, -6.1, 40)); f.push(await grab("c-press2"));
        await sheet("cushion", f, 2, 800, 450);
        await ev(() => { window.dispatchEvent(new Event('resize')); });
        await thaw();
      }
      await page.close();
    }
    if (on("actors") || on("zap")) {
      await open(); await enter();
      const f = [];
      if (on("actors")) {
        await ev(() => { const p = window.__platy, w = p.state().wizard; p.tp(w.x + 0.2, w.z - 2.6, 0); });
        await sleep(1500); await freeze(); await step(16, 2);
        await ev(() => { const p = window.__platy, w = p.wizard.group.position; const y = Math.atan2(p.player.x - w.x, p.player.z - w.z); window.__camW(w.x + Math.sin(y) * 3.3 + 0.5, w.y + 1.3, w.z + Math.cos(y) * 3.3, w.x, w.y + 1.0, w.z, 40); });
        f.push(await grab("wiz"));
        await ev(() => { const p = window.__platy, w = p.wizard.group.position; const y = Math.atan2(p.player.x - w.x, p.player.z - w.z); window.__camW(w.x + Math.sin(y) * 1.2 + 0.3, w.y + 1.6, w.z + Math.cos(y) * 1.2, w.x, w.y + 1.5, w.z, 40); });
        f.push(await grab("wiz-face"));
        await thaw();
        await ev(() => window.__platy.skipTo("sting")); await sleep(1800);
        await freeze(); await step(16, 2);
        await ev(() => { const p = window.__platy, d = p.state().dummies[0]; const y = p.cushions.heightAt(d.x, d.z); window.__camW(d.x - 1.5, y + 1.0, d.z - 2.0, d.x, y + 0.65, d.z, 40); });
        f.push(await grab("dummy"));
        await thaw();
      }
      if (on("zap")) {
        await ev(() => window.__platy.skipTo("zap")); await sleep(3200);
        await ev(() => { const p = window.__platy, w = p.state().water; p.tp(w.x - w.length / 2 + 1.5, w.z, Math.PI / 2); p.look(Math.PI / 2 + 0.9, 0.34, 3.0); });
        await sleep(1200);
        const z = [];
        z.push(await shot("z0"));
        await freeze(); await step(16, 1);
        await page.keyboard.press("KeyK");
        const marks = [0.3, 0.46, 0.56, 0.66, 0.8];
        let t = 0;
        for (let i = 0; i < marks.length; i++) {
          while (t < marks[i] - 1e-6) { await step(1000 / 120, 1); t += 1 / 120; }
          z.push(await grab("z" + (i + 1)));
        }
        await sheet("zap", z, 2, 800, 450);
        await thaw(); await sleep(1500);
      }
      if (on("actors")) {
        await ev(() => window.__platy.skipTo("fight")); await sleep(2200);
        await freeze(); await step(16, 2);
        await ev(() => { const p = window.__platy, h = p.human.group.position, y = p.human.group.rotation.y; window.__camW(h.x + Math.sin(y) * 3.4 + 0.8, h.y + 1.2, h.z + Math.cos(y) * 3.4, h.x, h.y + 0.9, h.z, 40); });
        f.push(await grab("human"));
        await ev(() => { const p = window.__platy, h = p.human.group.position, y = p.human.group.rotation.y; window.__camW(h.x + Math.sin(y) * 1.3 + 0.4, h.y + 1.6, h.z + Math.cos(y) * 1.3, h.x, h.y + 1.5, h.z, 40); });
        f.push(await grab("human-face"));
        await step(1000 / 60, 50);
        await ev(() => { const p = window.__platy, h = p.human.group.position, y = p.human.group.rotation.y; window.__camW(h.x + Math.cos(y) * 3.6, h.y + 1.1, h.z - Math.sin(y) * 3.6, h.x, h.y + 0.9, h.z, 40); });
        f.push(await grab("human-side"));
        await sheet("actors", f, 2, 800, 450);
        await thaw();
      }
      await page.close();
    }
  } catch (e) { console.log("FAIL " + (e.stack || e)); try { await shot("fail"); } catch (_) {} }
  await browser.close(); srv.close();
  console.log("errors", errs.length, errs.slice(0, 10).join("\n"));
})();
