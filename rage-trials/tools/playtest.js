// RAGE TRIALS headless playtest harness.
//   node rage-trials/tools/playtest.js            -> boot check + every level that has a route
//   node rage-trials/tools/playtest.js 6          -> just level 6
//   node rage-trials/tools/playtest.js tetris     -> the Tetris finale only
// Run from the repo root (C:\Users\krist\Desktop\BossGauntlet).
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/krist/Desktop/BossGauntlet/node_modules/puppeteer');

const ROOT = 'C:/Users/krist/Desktop/BossGauntlet';
const PORT = Number(process.env.RT_PORT || 8099);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

function serve() {
  return new Promise(res => {
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

const ARGS = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'];

async function main() {
  const which = process.argv[2] || 'all';
  const server = await serve();
  const browser = await puppeteer.launch({ headless: 'new', args: ARGS });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 520, deviceScaleFactor: 1 });
  const consoleErrors = [], pageErrors = [], failedReqs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', e => pageErrors.push(String(e.message || e)));
  page.on('requestfailed', r => failedReqs.push(r.url() + ' ' + (r.failure() || {}).errorText));

  const results = [];
  const levels = which === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : (which === 'tetris' ? [] : [Number(which)]);

  // ---- boot check -------------------------------------------------------
  await page.goto(`http://localhost:${PORT}/rage-trials/index.html?unlock`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => window.RT && window.__dbg, { timeout: 15000 }).catch(() => {});
  const boot = await page.evaluate(() => ({
    rt: !!window.RT, dbg: !!window.__dbg,
    levels: window.RT ? Object.keys(window.RT.LEVELS || {}).length : 0,
    themes: window.RT ? Object.keys(window.RT.THEMES || {}).length : 0,
    entities: window.RT ? Object.keys(window.RT.ENTITIES || window.RT.entityDefs || {}).length : 0,
    audio: !!(window.RT && window.RT.Audio), tetris: !!(window.RT && window.RT.Tetris), tycoon: !!(window.RT && window.RT.Tycoon),
    errors: (window.__dbg && window.__dbg.errors) ? window.__dbg.errors.slice(0, 8) : [],
  }));
  console.log('BOOT', JSON.stringify(boot));
  if (pageErrors.length) console.log('PAGE ERRORS', pageErrors.slice(0, 8));

  // ---- per-level routes -------------------------------------------------
  for (const n of levels) {
    const routeFile = path.join(ROOT, 'rage-trials/docs/routes', 'level' + String(n).padStart(2, '0') + '.json');
    let route = null;
    try { route = JSON.parse(fs.readFileSync(routeFile, 'utf8')); } catch (e) { }
    const before = pageErrors.length;
    const r = await page.evaluate(async (n, route) => {
      const d = window.__dbg;
      const out = { level: n, loaded: false, won: false, deaths: 0, steps: 0, x: 0, y: 0, err: null, stuck: false };
      try {
        d.level(n);
        out.loaded = true;
        d.hold({ left: false, right: false, jump: false, action: false });
        if (!route) { d.step(120); const s = d.state(); out.x = s.x; out.y = s.y; out.deaths = s.deaths; return out; }
        for (const seg of route) {
          if (seg.seed) { if (d.seed) d.seed(seg.seed); else if (window.RT.seed) window.RT.seed(seg.seed); continue; }
          if (seg.cash) { d.giveCash(seg.cash); continue; }
          if (seg.tp) { d.tp(seg.tp[0], seg.tp[1]); continue; }
          if (seg.tap) { d.tap(seg.tap); d.step(seg.steps || 1); out.steps += seg.steps || 1; continue; }
          if (seg.hold) d.hold(seg.hold);
          const st = seg.steps || 1;
          d.step(st); out.steps += st;
          if (d.state().won) break;
        }
        const s = d.state();
        out.won = !!s.won; out.deaths = s.deaths; out.x = Math.round(s.x); out.y = Math.round(s.y);
      } catch (e) { out.err = String(e && e.message || e); }
      return out;
    }, n, route).catch(e => ({ level: n, err: 'evaluate failed: ' + e.message }));
    if (n === 10 && !r.won) {
      r.finale = await page.evaluate(async () => {
        const RT = window.RT, d = window.__dbg, o = { arcade: false, cleared: 0, won: false, err: null };
        try {
          o.arcade = !!(RT.Tetris && RT.Tetris.active);
          if (!o.arcade) return o;
          RT.Tetris.setLines(9);                 /* nine of ten lines already down */
          RT.Tetris.debugFill(['##########']);   /* the tenth is one lock away */
          for (let i = 0; i < 6 && !d.state().won; i++) { d.tetrisInput('harddrop'); d.step(60); }
          const ts = d.tetrisState();
          o.cleared = ts ? ts.lines : -1;
          o.won = !!d.state().won;
        } catch (e) { o.err = String(e && e.message || e); }
        return o;
      }).catch(e => ({ err: 'finale eval failed: ' + e.message }));
      if (r.finale && r.finale.won) r.won = true;
      console.log('L10 FINALE', JSON.stringify(r.finale));
    }
    r.newPageErrors = pageErrors.slice(before);
    r.hasRoute = !!route;
    results.push(r);
    console.log('L' + n, JSON.stringify(r));
  }

  // ---- tetris -----------------------------------------------------------
  if (which === 'all' || which === 'tetris') {
    const t = await page.evaluate(async () => {
      const d = window.__dbg, out = { started: false, level: 0, gravity: null, lines: 0, over: false, err: null };
      try {
        d.tetris(28);
        const s0 = d.tetrisState();
        out.started = !!s0; out.level = s0 && s0.level;
        // drop 8 pieces with hard drop, confirm the board fills and nothing throws
        for (let i = 0; i < 8; i++) { d.tetrisInput('harddrop'); d.step(30); }
        const s = d.tetrisState();
        out.lines = s.lines; out.over = !!s.over; out.cells = s.board ? s.board.flat().filter(Boolean).length : -1;
      } catch (e) { out.err = String(e && e.message || e); }
      return out;
    }).catch(e => ({ err: 'evaluate failed: ' + e.message }));
    console.log('TETRIS', JSON.stringify(t));
    results.push({ tetris: t });
  }

  console.log('CONSOLE ERRORS', consoleErrors.length, consoleErrors.slice(0, 6));
  console.log('PAGE ERRORS', pageErrors.length, pageErrors.slice(0, 6));
  console.log('FAILED REQUESTS', failedReqs.length, failedReqs.slice(0, 6));
  const dbgErrors = await page.evaluate(() => (window.__dbg && window.__dbg.errors) || []).catch(() => []);
  console.log('DBG ERRORS', dbgErrors.length, dbgErrors.slice(0, 10));

  await browser.close();
  server.close();

  const failed = results.filter(r => r.level && (!r.loaded || r.err || (r.hasRoute && !r.won)));
  console.log('\nSUMMARY: ' + (results.length - failed.length) + ' ok, ' + failed.length + ' FAILED',
    failed.map(f => 'L' + f.level + (f.err ? ' err=' + f.err : (f.hasRoute ? ' did-not-win@' + f.x + ',' + f.y : ' no-route'))).join(' | '));
  process.exit((failed.length || (process.env.RT_STRICT === '0' ? 0 : pageErrors.length)) ? 1 : 0);
}
main().catch(e => { console.error('HARNESS CRASH', e); process.exit(2); });
