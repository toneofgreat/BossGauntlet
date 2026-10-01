/* MAGIC folk gate: is there somebody to talk to in every chapter, can you get
 * near enough, and does everybody actually say their piece?
 *   node magic/tools/folkcheck.js
 *
 * For every chapter it walks the player up to each person in turn, checks the
 * TALK prompt names them, hears them out, and asks again to check the second
 * batch of lines. One chapter is also done with a real E keypress, because the
 * stepper cannot prove the key is wired.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/krist/Desktop/BossGauntlet/node_modules/puppeteer');

const ROOT = 'C:/Users/krist/Desktop/BossGauntlet';
const PORT = Number(process.env.MG_PORT || 8148);
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
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await page.setViewport({ width: 1000, height: 640 });
  await page.goto(`http://localhost:${PORT}/magic/index.html`, { waitUntil: 'networkidle0', timeout: 60000 });
  await page.bringToFront();
  await page.waitForFunction(() => window.__magic, { timeout: 30000, polling: 150 });

  const chs = await page.evaluate(() => window.__magic.chapters());
  let bad = 0, totalPeople = 0, totalLines = 0;

  for (let i = 0; i < chs.length; i++) {
    const before = errs.length;
    const r = await page.evaluate(async (idx) => {
      const M = window.__magic;
      M.save().spells = ['bolt', 'light', 'lift', 'shield', 'fire', 'freeze', 'mend', 'change', 'blast', 'bind', 'song', 'track', 'guard'];
      M.go(idx);
      M.skipTalk();
      M.step(6);
      const folk = M.folk();
      const out = { people: folk.length, names: folk.map((f) => f.name), spoke: 0, second: 0, unreachable: [], lines: 0, far: [] };
      for (let j = 0; j < folk.length; j++) {
        out.lines += folk[j].lines + folk[j].more;
        M.goTo(j);
        M.step(3);
        if (M.nearFolk() !== folk[j].name) { out.unreachable.push(folk[j].name); continue; }
        if (M.talk()) {
          out.spoke++;
          let n = 0;
          while (M.say() && n < 40) { M.advance(); n++; }
          M.step(2);
          if (M.talk()) { out.second++; M.skipTalk(); }     // and they have more to say
        }
      }
      // how far each of them ended up from where the player starts
      const w = M.world();
      out.far = M.folk().map((f) => Math.round(Math.hypot(f.at[0] - w.spawn.x, f.at[2] - w.spawn.z)));
      return out;
    }, i).catch((e) => ({ err: String(e.message || e) }));

    const newErrs = errs.slice(before);
    const ok = !r.err && r.people >= 2 && r.unreachable.length === 0 && r.spoke === r.people &&
      r.second === r.people && newErrs.length === 0;
    if (!ok) bad++;
    totalPeople += r.people || 0;
    totalLines += r.lines || 0;
    console.log(
      (ok ? '  ok   ' : '  FAIL ') + String(i + 1).padStart(2) + '. ' + chs[i].title.padEnd(26) +
      (r.err ? ' ERR ' + r.err.slice(0, 80)
        : ' ' + String(r.people).padStart(2) + ' people  ' + String(r.lines).padStart(3) + ' lines  ' +
          'at ' + (r.far || []).join('/') + 'm' +
          (r.unreachable.length ? '  UNREACHABLE: ' + r.unreachable.join(', ') : '') +
          (r.spoke !== r.people ? '  SILENT: ' + (r.people - r.spoke) : '')) +
      (newErrs.length ? '  << ' + newErrs[0].slice(0, 90) : '')
    );
  }

  /* the E key, for real, in chapter one */
  const keyOk = await (async () => {
    await page.evaluate(() => {
      const M = window.__magic;
      M.go(0); M.skipTalk(); M.step(6); M.goTo(0); M.step(3);
    });
    await new Promise((r) => setTimeout(r, 700));          // let a frame or two happen
    const named = await page.evaluate(() => window.__magic.nearFolk());
    await page.keyboard.press('e');
    await new Promise((r) => setTimeout(r, 900));
    const talking = await page.evaluate(() => window.__magic.say());
    console.log((talking ? '  ok   ' : '  FAIL ') + 'E key opens a conversation with ' + named);
    return talking;
  })();
  if (!keyOk) bad++;

  console.log('\n' + totalPeople + ' people, ' + totalLines + ' lines of them');
  console.log(errs.length ? 'page errors: ' + errs.length + '\n' + errs.slice(0, 6).join('\n') : 'page errors: 0');
  console.log(bad ? 'FOLKCHECK: ' + bad + ' chapter(s) have nobody worth meeting' : 'FOLKCHECK: everybody can be met and heard');
  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(2); });
