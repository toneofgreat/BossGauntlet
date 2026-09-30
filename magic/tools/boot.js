/* quick boot check for MAGIC: does it load, and does every chapter build? */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/krist/Desktop/BossGauntlet/node_modules/puppeteer');

const ROOT = 'C:/Users/krist/Desktop/BossGauntlet';
const PORT = Number(process.env.MG_PORT || 8140);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const ARGS = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-webgl',
  '--ignore-gpu-blocklist', '--mute-audio'];

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
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.message || e).split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 200)); });
  await page.setViewport({ width: 1280, height: 760 });
  await page.goto(`http://localhost:${PORT}/magic/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.bringToFront();
  try {
    await page.waitForFunction(() => window.__magic, { timeout: 30000, polling: 150 });
  } catch (e) {
    const html = await page.evaluate(() => document.getElementById('loading').innerHTML);
    console.log('DID NOT BOOT:\n', html.slice(0, 2000));
    console.log('errors:', errs.slice(0, 6));
    await browser.close(); server.close(); process.exit(1);
  }
  console.log('booted. state =', await page.evaluate(() => window.__magic.state()));
  const chs = await page.evaluate(() => window.__magic.chapters());
  console.log('chapters:', chs.length);

  let bad = 0;
  for (let i = 0; i < chs.length; i++) {
    const before = errs.length;
    const r = await page.evaluate(async (idx) => {
      const M = window.__magic;
      // a real player at this point in the year would know everything so far
      M.save().spells = ['bolt','light','lift','shield','fire','freeze','mend','change','blast','bind','song','track','guard'];
      const t0 = performance.now();
      M.go(idx);
      M.skipTalk();
      M.step(120);
      const p = M.player();
      const w = M.world();
      let tri = 0, objs = 0;
      w.group.traverse((o) => { objs++; if (o.geometry && o.geometry.index) tri += o.geometry.index.count / 3; else if (o.geometry && o.geometry.attributes.position) tri += o.geometry.attributes.position.count / 3; });
      return {
        ms: Math.round(performance.now() - t0),
        objs, tri: Math.round(tri),
        spells: M.spells().length,
        pos: [Math.round(p.pos.x), Math.round(p.pos.y), Math.round(p.pos.z)],
        colliders: w.colliders.length,
        state: M.state(),
        hp: p.hp
      };
    }, i).catch((e) => ({ err: String(e.message || e) }));
    const newErrs = errs.slice(before);
    const ok = !r.err && newErrs.length === 0 && r.state === 'play';
    if (!ok) bad++;
    console.log(
      (ok ? '  ok   ' : '  FAIL ') +
      String(i + 1).padStart(2) + '. ' + chs[i].title.padEnd(26) +
      (r.err ? ' ERR ' + r.err.slice(0, 90) :
        ' ' + String(r.ms).padStart(5) + 'ms  ' + String(r.objs).padStart(5) + ' objs  ' +
        String(r.tri).padStart(7) + ' tris  ' + String(r.colliders).padStart(3) + ' boxes  ' +
        r.spells + ' spells  @' + r.pos.join(',')) +
      (newErrs.length ? '  << ' + newErrs[0].slice(0, 110) : '')
    );
  }
  console.log(errs.length ? '\ntotal page errors: ' + errs.length : '\npage errors: 0');
  if (errs.length) console.log(errs.slice(0, 8).join('\n'));
  console.log(bad ? 'BOOTCHECK: ' + bad + ' chapters FAILED' : 'BOOTCHECK: all chapters build');
  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(2); });
