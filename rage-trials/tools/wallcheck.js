/* RAGE TRIALS back-wall check.
 *   node rage-trials/tools/wallcheck.js
 *
 * For every trial: the wall exists behind the spawn, walking back into it STOPS
 * you, and leaning on it skips the trial. Also proves a normal run forwards never
 * trips it. Run from the repo root.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/krist/Desktop/BossGauntlet/node_modules/puppeteer');

const ROOT = 'C:/Users/krist/Desktop/BossGauntlet';
const PORT = Number(process.env.RT_PORT || 8111);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const ARGS = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'];

function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rs) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      fs.readFile(p, (e, d) => {
        if (e) { rs.writeHead(404); rs.end('nope'); return; }
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
  await page.setViewport({ width: 900, height: 520 });
  const pageErrors = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
  await page.goto(`http://localhost:${PORT}/rage-trials/index.html?unlock`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => window.RT && window.__dbg, { timeout: 15000 });

  const rows = await page.evaluate(async () => {
    const d = window.__dbg, RT = window.RT, T = 32;
    const out = [];
    for (let n = 1; n <= 12; n++) {
      d.level(n);
      d.hold({ left: false, right: false, jump: false, action: false });
      d.step(10);
      const w = RT.backWall && RT.backWall();
      const spawnX = RT.player.x;
      const exists = !!w;
      const behind = exists ? +((spawnX - (w.x + w.w)) / T).toFixed(2) : null;

      // 1. walking back into it must STOP you, not pass you
      d.hold({ left: true });
      d.step(30);                       // half a second of walking back
      const s1 = d.state();
      const stoppedAt = exists ? +((s1.x - (w.x + w.w)) / T).toFixed(2) : null;
      const blocked = exists && Math.abs(s1.x - (w.x + w.w)) < 1.5 && !s1.won;

      // 2. keep leaning and it lets you through, and that skips the trial
      d.step(60);                       // past BACKWALL_PHASE_S at 60 fps
      const s2 = d.state();

      out.push({ n, exists, behindTiles: behind, blocked, stoppedAt, skipped: !!s2.won, deaths: s2.deaths });
    }

    // 3. a forward run must never trip it
    d.level(1);
    d.hold({ left: false, right: true });
    d.step(240);
    const fwd = d.state();
    out.push({ n: 'forward-run-L1', skipped: !!fwd.won, tx: +(fwd.x / 32).toFixed(1), deaths: fwd.deaths });
    return out;
  });

  let bad = 0;
  for (const r of rows) {
    if (r.n === 'forward-run-L1') {
      const ok = r.skipped === false;
      if (!ok) bad++;
      console.log(`forward run L1: reached x=${r.tx} skipped=${r.skipped} ${ok ? 'OK' : 'BAD - a normal run tripped the wall'}`);
      continue;
    }
    const ok = r.exists && r.blocked && r.skipped;
    if (!ok) bad++;
    console.log(`L${String(r.n).padStart(2)}: wall ${r.exists ? 'yes' : 'NO '} ${String(r.behindTiles).padStart(5)} tiles behind spawn | blocked ${r.blocked ? 'yes' : 'NO '} | leaning skipped it ${r.skipped ? 'yes' : 'NO '} ${ok ? '' : '  <-- FAIL'}`);
  }
  console.log(pageErrors.length ? 'PAGE ERRORS: ' + pageErrors.slice(0, 4).join(' | ') : 'page errors: 0');
  console.log(bad ? `WALLCHECK: ${bad} FAILED` : 'WALLCHECK: all good');
  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
