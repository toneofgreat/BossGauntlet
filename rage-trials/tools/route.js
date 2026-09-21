/* RAGE TRIALS route debugger.
 *   node rage-trials/tools/route.js 9                -> run docs/routes/level09.json, trace it
 *   node rage-trials/tools/route.js 9 --quiet        -> only the tail + verdict
 *   node rage-trials/tools/route.js 9 --probe 40     -> hold right for 40 s, report where it stops
 *
 * Prints the state after EVERY segment (tile x, tile y, onGround, deaths) so a
 * route can be fixed at the exact segment that goes wrong instead of guessed at.
 * Run from the repo root.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/krist/Desktop/BossGauntlet/node_modules/puppeteer');

const ROOT = 'C:/Users/krist/Desktop/BossGauntlet';
const PORT = Number(process.env.RT_PORT || 8107);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const ARGS = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--mute-audio'];

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

async function main() {
  const n = Number(process.argv[2] || 1);
  const quiet = process.argv.includes('--quiet');
  const probeAt = process.argv.indexOf('--probe');
  const probe = probeAt >= 0 ? Number(process.argv[probeAt + 1] || 30) : 0;
  const routeFile = path.join(ROOT, 'rage-trials/docs/routes', 'level' + String(n).padStart(2, '0') + '.json');

  let route = [];
  if (!probe) {
    try { route = JSON.parse(fs.readFileSync(routeFile, 'utf8')); }
    catch (e) { console.log('no route file at ' + routeFile); }
  } else {
    route = [{ hold: { right: true }, steps: Math.round(probe * 60) }];
  }

  const server = await serve();
  const browser = await puppeteer.launch({ headless: 'new', args: ARGS });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 520, deviceScaleFactor: 1 });
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push(String(e.message || e)));

  await page.goto(`http://localhost:${PORT}/rage-trials/index.html?unlock`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => window.RT && window.__dbg, { timeout: 15000 });

  const out = await page.evaluate(async (n, route, probe) => {
    const d = window.__dbg, RT = window.RT;
    const T = 32;
    const trace = [];
    const deathLog = [];
    d.level(n);
    RT.on('death', function (cause) {
      deathLog.push(cause + '@' + (RT.player.x / T).toFixed(1) + ',' + (RT.player.y / T).toFixed(1));
    });
    d.hold({ left: false, right: false, jump: false, action: false });
    let total = 0, won = false, err = null;
    const snap = () => {
      const s = d.state();
      return {
        tx: +(s.x / T).toFixed(2), ty: +(s.y / T).toFixed(2),
        vx: Math.round(s.vx), vy: Math.round(s.vy),
        g: !!s.onGround, dead: !!s.dead, deaths: s.deaths, won: !!s.won
      };
    };
    try {
      for (let i = 0; i < route.length; i++) {
        const seg = route[i];
        if (seg.seed) { if (d.seed) d.seed(seg.seed); continue; }
        if (seg.cash) { d.giveCash(seg.cash); continue; }
        if (seg.tp) { d.tp(seg.tp[0], seg.tp[1]); trace.push({ i, act: 'tp', ...snap() }); continue; }
        let act;
        if (seg.tap) { d.tap(seg.tap, seg.press || 1); act = 'tap:' + seg.tap; }
        else if (seg.hold) { d.hold(seg.hold); act = Object.keys(seg.hold).filter(k => seg.hold[k]).join('+') || 'idle'; }
        else act = 'step';
        const st = seg.steps || 1;
        d.step(st); total += st;
        trace.push({ i, act, st, ...snap() });
        if (d.state().won) { won = true; break; }
      }
    } catch (e) { err = String(e && e.message || e); }
    const ty = (RT.Tycoon && RT.Tycoon.state) ? RT.Tycoon.state() : null;
    const tyc = ty && ty.active ? { cash: ty.cash, bought: ty.bought, income: ty.income } : null;
    const mode = (RT.getMode && RT.getMode()) ? 'mode' : null;
    return { trace, total, won, err, tyc, mode, deathLog, keys: JSON.stringify(RT.keys||{}), groups: JSON.stringify(RT.groups||{}), onOff: !!RT.onOff, tetris: !!(RT.Tetris && RT.Tetris.active), entErrors: (window.__entityErrors || []).slice(0, 8), dbgErrors: (d.errors || []).slice(0, 8) };
  }, n, route, probe);

  let last = null, stuckFrom = null;
  for (const t of out.trace) {
    const stalled = last && Math.abs(t.tx - last.tx) < 0.05 && !t.dead;
    if (!quiet) {
      console.log(
        String(t.i).padStart(3) + ' ' + String(t.act).padEnd(16) +
        ' x=' + String(t.tx).padStart(7) + ' y=' + String(t.ty).padStart(6) +
        ' vx=' + String(t.vx).padStart(5) + ' vy=' + String(t.vy).padStart(5) +
        (t.g ? ' GND' : '    ') + (t.dead ? ' DEAD' : '    ') +
        ' d=' + t.deaths + (stalled ? '   <-- no progress' : ''));
    }
    if (stalled && stuckFrom === null) stuckFrom = t.i;
    if (!stalled) stuckFrom = null;
    last = t;
  }
  console.log('---');
  console.log('steps=' + out.total + ' won=' + out.won + ' err=' + out.err +
    ' finalX=' + (last ? last.tx : '-') + ' deaths=' + (last ? last.deaths : '-'));
  if (out.deathLog && out.deathLog.length) console.log('DEATHS', out.deathLog.join('  '));
  if (out.keys && out.keys !== '{}') console.log('KEYS', out.keys);
  if (out.groups && out.groups !== '{}') console.log('GROUPS', out.groups, 'onOff=' + out.onOff);
  if (out.tyc) console.log('TYCOON', JSON.stringify(out.tyc));
  if (out.tetris) console.log('TETRIS ACTIVE');
  if (out.entErrors.length) console.log('ENTITY ERRORS', out.entErrors);
  if (out.dbgErrors.length) console.log('DBG ERRORS', out.dbgErrors);
  if (pageErrors.length) console.log('PAGE ERRORS', pageErrors.slice(0, 5));

  await browser.close();
  server.close();
  process.exit(out.won ? 0 : 1);
}
main().catch(e => { console.error('CRASH', e); process.exit(2); });
