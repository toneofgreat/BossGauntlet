/* MAGIC controls gate: hold the actual keys and check you go where they say.
 *   node magic/tools/controls.js
 * W must move you away from the camera, S towards it, D to screen-right, A to
 * screen-left; on a broom, A/D must strafe the right way and W/S must be the
 * throttle. This is the check the playthrough harness can never do, because
 * that one teleports instead of pressing keys.
 *
 * The keys are pressed for real (so IN sees browser events), but the world is
 * stepped by hand: headless SwiftShader runs at about three frames a second and
 * a wall-clock probe catches zero of them.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/krist/Desktop/BossGauntlet/node_modules/puppeteer');

const ROOT = 'C:/Users/krist/Desktop/BossGauntlet';
const PORT = Number(process.env.MG_PORT || 8146);
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };
const ARGS = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-webgl',
  '--ignore-gpu-blocklist', '--mute-audio'];

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rs) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (e, d) => {
        if (e) { rs.writeHead(404); rs.end(''); return; }
        rs.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        rs.end(d);
      });
    });
    s.listen(PORT, () => res(s));
  });
}

(async () => {
  const server = await serve();
  const browser = await puppeteer.launch({ headless: 'new', args: ARGS });
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message || e).split('\n')[0]));
  await page.setViewport({ width: 1000, height: 640 });
  await page.goto(`http://localhost:${PORT}/magic/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.bringToFront();
  await page.waitForFunction(() => window.__magic, { timeout: 30000, polling: 150 });

  let bad = 0;

  /* park the player in the open, camera yaw zero (looking down -Z) */
  const setup = (idx) => page.evaluate((i) => {
    const M = window.__magic;
    M.save().spells = ['bolt', 'light'];
    M.go(i);
    M.skipTalk();
    M.step(8);
    const p = M.player();
    p.frozen = false;
    M.tp(0, p.mode === 'fly' ? 16 : 0, 0);
    p.vel.set(0, 0, 0);
    p.flySpeed = 10;
    M.faceAt(0, p.mode === 'fly' ? 16 : 1.4, -100);
    M.step(2);
    return p.mode;
  }, idx);

  /* hold a key, step the world by hand, report the move in camera axes */
  const probe = async (key, frames) => {
    await page.keyboard.down(key);
    await new Promise((r) => setTimeout(r, 30));
    const r = await page.evaluate((n) => {
      const M = window.__magic, c = M.cam(), p = M.player();
      c.updateMatrixWorld();
      const e = c.matrixWorld.elements;
      const right = [e[0], e[2]], fwd = [-e[8], -e[10]];
      const a = [p.pos.x, p.pos.z], s0 = p.flySpeed;
      M.step(n);
      const d = [p.pos.x - a[0], p.pos.z - a[1]];
      const m = Math.hypot(d[0], d[1]) || 1e-9;
      const nd = [d[0] / m, d[1] / m];
      const rm = Math.hypot(right[0], right[1]) || 1, fm = Math.hypot(fwd[0], fwd[1]) || 1;
      return {
        moved: m,
        fwd: nd[0] * fwd[0] / fm + nd[1] * fwd[1] / fm,
        right: nd[0] * right[0] / rm + nd[1] * right[1] / rm,
        dSpeed: p.flySpeed - s0,
        mode: p.mode
      };
    }, frames);
    await page.keyboard.up(key);
    await new Promise((r) => setTimeout(r, 20));
    return r;
  };

  const check = (ok, label, says, r, extra) => {
    if (!ok) bad++;
    console.log((ok ? '  ok   ' : '  FAIL ') + label.padEnd(11) + says.padEnd(34) +
      ' moved ' + r.moved.toFixed(2) + 'm  fwd=' + r.fwd.toFixed(2) + ' right=' + r.right.toFixed(2) +
      (extra || ''));
  };

  /* -------- on foot: chapter 17 is the wood, and the clearing is flat ----- */
  for (const w of [
    { key: 'w', says: 'W goes forward (away from cam)', ok: (r) => r.moved > 0.8 && r.fwd > 0.9 },
    { key: 's', says: 'S goes back (towards the cam)', ok: (r) => r.moved > 0.8 && r.fwd < -0.9 },
    { key: 'd', says: 'D goes right', ok: (r) => r.moved > 0.8 && r.right > 0.9 },
    { key: 'a', says: 'A goes left', ok: (r) => r.moved > 0.8 && r.right < -0.9 }
  ]) {
    await setup(16);
    const r = await probe(w.key, 30);
    check(w.ok(r), 'on foot', w.says, r);
  }

  /* -------- on a broom: it always flies forward, so judge the strafe and
              the throttle, not the raw heading ---------------------------- */
  for (const w of [
    { key: 'd', says: 'D strafes right', ok: (r) => r.right > 0.12 },
    { key: 'a', says: 'A strafes left', ok: (r) => r.right < -0.12 },
    { key: 'w', says: 'W is more throttle', ok: (r) => r.dSpeed > 0.5, show: true },
    { key: 's', says: 'S is less throttle', ok: (r) => r.dSpeed < -0.5, show: true }
  ]) {
    await setup(6);
    const r = await probe(w.key, 30);
    check(w.ok(r), 'on a broom', w.says, r, w.show ? '  dSpeed=' + r.dSpeed.toFixed(2) : '');
  }

  console.log(errs.length ? '\npage errors: ' + errs.length + '\n' + errs.slice(0, 5).join('\n') : '\npage errors: 0');
  console.log(bad ? 'CONTROLS: ' + bad + ' direction(s) WRONG' : 'CONTROLS: every key goes the way it says');
  await browser.close();
  server.close();
  process.exit(bad || errs.length ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(2); });
