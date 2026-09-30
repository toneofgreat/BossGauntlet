/* MAGIC playthrough: drive every chapter to its win condition, headlessly.
 *   node magic/tools/playthrough.js          (all of them)
 *   node magic/tools/playthrough.js 13 14    (just those, 1-based)
 *
 * The bot knows the intended solution for each chapter and does it. If a
 * chapter cannot be finished, it is unwinnable for a person too.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/krist/Desktop/BossGauntlet/node_modules/puppeteer');

const ROOT = 'C:/Users/krist/Desktop/BossGauntlet';
const PORT = Number(process.env.MG_PORT || 8143);
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
  const only = process.argv.slice(2).map(Number).filter((n) => n > 0);
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
  let bad = 0;

  for (let i = 0; i < chs.length; i++) {
    if (only.length && only.indexOf(i + 1) < 0) continue;
    const before = errs.length;
    const out = await page.evaluate(async (idx) => {
      const M = window.__magic, T = M.THREE;
      const S = M.save();
      S.spells = ['bolt', 'light', 'lift', 'shield', 'fire', 'freeze', 'mend', 'change', 'blast', 'bind', 'song', 'track', 'guard'];
      S.done = []; S.made = true;
      M.go(idx);
      M.skipTalk();
      const log = [];
      const ctx = () => M.ctx();
      const near = (p, d) => {           // stand off it, towards the middle of the room
        const inx = -p.x, inz = -p.z;
        const m = Math.hypot(inx, inz) || 1;
        M.tp(p.x + (inx / m) * (d || 3), Math.max(p.y - 0.4, 0), p.z + (inz / m) * (d || 3));
        M.faceAt(p.x, p.y, p.z);
      };
      const live = () => { const c = ctx(); return c ? c.targets.filter((t) => !t.dead && !t.hit && t.obj) : []; };
      const posOf = (t) => t.obj.getWorldPosition(new T.Vector3());
      const ALL = ['bolt', 'lift', 'light', 'shield', 'fire', 'freeze', 'mend', 'change', 'blast', 'bind', 'song', 'track', 'guard'];

      const myId = M.chapters()[idx].id;
      const finished = () => M.save().done.indexOf(myId) >= 0;
      let acted = 0;
      for (let step = 0; step < 240 && M.state() === 'play' && !finished(); step++) {
        if (step % 12 === 11) await new Promise((r) => setTimeout(r, 0));   // let the page breathe
        if (M.say()) M.skipTalk();
        const mo = M.mode();
        if (!ctx()) break;          // the chapter tore itself down: it is over
        let did = false;

        // 1. the flying chapters: go to the next thing
        if (mo && mo.nextPos && mo.nextPos()) {
          const p = mo.nextPos();
          M.tp(p.x, p.y, p.z);
          M.step(3);
          did = true;
        }
        if (!did && mo && mo.snitch) {
          const p = mo.snitch.position;
          M.tp(p.x, p.y, p.z);
          M.step(3);
          did = true;
        }
        // 2. sequences know their own next step
        if (!did && mo && mo.solveNext) {
          const a = mo.solveNext();
          if (a && a.wait) {
            // a player would put a shield up while waiting for the opening
            if (M.pickSpell('shield')) { M.castFwd(); }
            M.pickSpell('bolt');
            M.step(20);
            did = true;
          }
          else if (a && a.goto) { M.tp(a.goto.x, Math.max(0, a.goto.y - 0.5), a.goto.z); M.step(8); did = true; }
          else if (a && a.pos) {
            near(a.pos, a.dist || 3);
            M.step(2);
            if (M.pickSpell('shield')) { M.castFwd(); M.step(3); }   // as a player would
            // aim at where it is NOW, not where it was when we walked over
            const fresh = (mo.solveNext && mo.solveNext()) || a;
            const aim = (fresh && fresh.pos) ? fresh.pos : a.pos;
            M.faceAt(aim.x, aim.y, aim.z);
            M.pickSpell(a.spell || 'bolt');
            M.castAt(aim.x, aim.y, aim.z);
            M.step(22);
            did = true;
            acted++;
          }
        }
        // 3. anything with a hit box: stand near it and try spells until it reacts
        if (!did) {
          const ts = live();
          if (ts.length) {
            const t = ts[0];
            const p = posOf(t);
            near(p, (t.r || 1) + 2.2);
            M.step(4);
            for (const sp of ALL) {
              if (!M.pickSpell(sp)) continue;
              M.castAt(p.x, p.y, p.z);
              M.step(11);
              acted++;
              if (M.state() !== 'play' || finished()) break;
              if (t.dead || t.hit) break;
              // a boss only opens sometimes: keep hammering the same one
            }
            did = true;
          }
        }
        // 4. nothing to shoot: walk to the middle (some chapters end on a spot)
        if (!did) {
          M.tp(0, 1, 0);
          M.step(20);
        }
        M.step(6);
      }
      return {
        state: M.state(),
        done: M.save().done.slice(),
        spells: M.save().spells.length,
        acted,
        hp: M.hearts()
      };
    }, i).catch((e) => ({ err: String(e.message || e) }));

    const newErrs = errs.slice(before);
    const finished = !out.err && out.done && out.done.indexOf(chs[i].id) >= 0;
    if (!finished || newErrs.length) bad++;
    console.log(
      (finished && !newErrs.length ? '  WON  ' : '  ---  ') +
      String(i + 1).padStart(2) + '. ' + chs[i].title.padEnd(26) +
      (out.err ? ' ERR ' + out.err.slice(0, 80)
        : ' ' + String(out.acted).padStart(4) + ' casts  state=' + out.state + '  hp=' + out.hp) +
      (newErrs.length ? '  << ' + newErrs[0].slice(0, 100) : '')
    );
  }
  console.log(errs.length ? '\npage errors: ' + errs.length + '\n' + errs.slice(0, 6).join('\n') : '\npage errors: 0');
  console.log(bad ? 'PLAYTHROUGH: ' + bad + ' chapters did not finish' : 'PLAYTHROUGH: every chapter can be won');
  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(2); });
