/* screenshots of MAGIC, for looking at */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/krist/Desktop/BossGauntlet/node_modules/puppeteer');
const ROOT = 'C:/Users/krist/Desktop/BossGauntlet';
const OUT = process.env.MG_OUT || 'C:/Users/krist/AppData/Local/Temp/claude/C--Users-krist-Desktop-BossGauntlet/15141b96-bc16-46c1-8edf-c2f5905dde88/scratchpad/';
const PORT = 8141;
const ARGS = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-webgl',
  '--ignore-gpu-blocklist', '--mute-audio'];
const MIME = { '.html': 'text/html', '.js': 'text/javascript' };

/* which chapters to shoot, and how to pose the camera for each */
const SHOTS = process.env.MG_SHOTS ? JSON.parse(process.env.MG_SHOTS) : [
  { i: 0, name: 'wandshop', tp: [0, 0, 4], look: [0, 1.4, -9], steps: 60 },
  { i: 1, name: 'charms', tp: [0, 0, 7], look: [0, 1.4, -9], steps: 60 },
  { i: 3, name: 'potions', tp: [0, 0, 4], look: [0, 1.2, -8], steps: 60 },
  { i: 6, name: 'flying', tp: [0, 14, 20], look: [0, 10, -20], steps: 90 },
  { i: 7, name: 'quidditch', tp: [0, 16, 30], look: [0, 12, -40], steps: 90 },
  { i: 9, name: 'darklord', tp: [0, 0, 6], look: [0, 2, -11], steps: 90 },
  { i: 13, name: 'snake', tp: [0, 0, 20], look: [0, 3, -20], steps: 120 },
  { i: 16, name: 'forest', tp: [0, 0, 0], look: [14, 2, -18], steps: 60 },
  { i: 20, name: 'shack', tp: [-3, 0, 5], look: [3, 1.5, -2], steps: 60 },
  { i: 22, name: 'cold', tp: [0, 0, 8], look: [0, 2.4, -14], steps: 60 },
  { i: 23, name: 'aunt', tp: [0, 0, 3.6], look: [0, 1.5, -2.2], steps: 60 }
];

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
  page.on('pageerror', (e) => console.log('ERR', String(e.message).slice(0, 140)));
  await page.setViewport({ width: 1400, height: 800, deviceScaleFactor: 1.5 });
  await page.goto(`http://localhost:${PORT}/magic/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.bringToFront();
  await page.waitForFunction(() => window.__magic, { timeout: 30000, polling: 150 });
  await page.evaluate(() => {
    const M = window.__magic;
    M.save().spells = ['bolt', 'light', 'lift', 'shield', 'fire', 'freeze', 'mend', 'change', 'blast', 'bind', 'song', 'track', 'guard'];
    M.save().made = true;
  });

  // the title
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: OUT + 'mg-title.png' });

  // the mirror
  await page.evaluate(() => { window.__magic.setLook({ skin: 4, hair: 1, hairCol: 4, eyes: 2, wear: 0, name: 'THOMAS' }); window.__magic.mirror(); });
  await new Promise((r) => setTimeout(r, 1400));
  await page.screenshot({ path: OUT + 'mg-mirror.png' });

  for (const s of SHOTS) {
    if (s.screen) {                       // a menu, not a chapter
      await page.evaluate((sh) => {
        const M = window.__magic;
        if (sh.screen === 'board') { M.save().done = sh.done || []; M.board(); }
      }, s);
      await new Promise((r) => setTimeout(r, 900));
      await page.screenshot({ path: OUT + 'mg-' + s.name + '.png' });
      console.log('shot', s.name);
      continue;
    }
    await page.evaluate((sh) => {
      const M = window.__magic;
      M.go(sh.i);
      M.skipTalk();
      if (sh.light) { M.pickSpell('light'); M.castFwd(); }   // as a player would, in the dark
      M.step(sh.steps || 60);
      if (sh.tp) M.tp(sh.tp[0], sh.tp[1], sh.tp[2]);
      if (sh.look) M.faceAt(sh.look[0], sh.look[1], sh.look[2]);
      M.step(45);
    }, s);
    await new Promise((r) => setTimeout(r, 700));
    await page.screenshot({ path: OUT + 'mg-' + s.name + '.png' });
    console.log('shot', s.name);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
