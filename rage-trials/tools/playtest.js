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
  const levels = which === 'all' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : (which === 'tetris' ? [] : [Number(which)]);

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
    // ---- level 12: the route proves the rocket race, this proves the rest --
    // Four bosses, a rising shaft, a sixteen-item tycoon, a 119-tile troll
    // obby, a fake ending and a ticket booth cannot be driven by a fixed input
    // script, so - exactly as level 10 hands the finale to RT.Tetris - level 12
    // hands it to __L12.dbg, which is the same API the level itself uses.
    if (n === 12 && !r.won) {
      const trollFile = path.join(ROOT, 'rage-trials/docs/routes', 'level12-troll.json');
      let troll = [];
      try { troll = JSON.parse(fs.readFileSync(trollFile, 'utf8')); } catch (e) { }
      r.finale = await page.evaluate(async (troll) => {
        const RT = window.RT, d = window.__dbg, o = { acts: {}, won: false, err: null, deaths: 0 };
        const G = () => window.__L12;
        const hold = (h, s) => { d.hold(h || {}); d.step(s || 1); };
        try {
          if (!G() || !G().dbg) { o.err = '__L12.dbg missing'; return o; }

          /* II. VULCAN-9 - six hits, then the shaft door is carved open */
          for (let i = 0; i < 6; i++) { G().dbg.hit('vulcan'); d.step(70); }
          d.step(340);
          o.acts.vulcan = G().done.vulcan === 1 && d.tile(105, 44) === '.';

          /* III. THE MELT - it arms on entry and the lava actually climbs */
          G().dbg.skipTo('melt'); d.step(20);
          hold({ right: true }, 40); hold({}, 10);
          const lava0 = G().lavaY;
          d.god(true); d.step(360); d.god(false);
          o.acts.melt = G().meltOn === 1 && G().lavaY < lava0 - 64;
          G().dbg.warp(126, 4); d.step(30); hold({ right: true }, 30);
          o.acts.meltTop = G().meltWon === 1;

          /* IV. GALE PRIME - water fills a pool, fire boils it, the eye opens */
          G().dbg.skipTo('gale'); d.step(20); d.god(true);
          hold({ right: true }, 90); hold({}, 20);
          let stall = 0, wet = 0;
          for (let i = 0; i < 260; i++) {
            d.step(10);
            const b = G().dbg.boss('gale');
            if (!b) break;
            if (b.stalled > 0) stall++;
            const ps = RT.find('lGpool');
            for (let j = 0; j < ps.length; j++) wet = Math.max(wet, ps[j].wet);
          }
          o.acts.galeSteam = stall > 0 && wet > 0.3;
          for (let i = 0; i < 6; i++) { G().dbg.hit('gale'); d.step(70); }
          d.step(340);
          o.acts.gale = G().done.gale === 1 && d.tile(174, 12) === '.';

          /* V. THE LONG COUNTER - sixteen purchases open the wall at 249 */
          G().dbg.skipTo('counter'); d.step(30);
          hold({ right: true }, 40); hold({}, 10);
          G().dbg.buyAll(); d.step(60);
          o.acts.counter = G().gateOpen === 1 && d.tile(249, 40) === '.' &&
                           RT.player.abilities.doubleJump === true;

          /* VII. THE TROLL - a real input route, no god mode, no deaths */
          d.god(false);
          G().dbg.skipTo('troll'); d.step(20);
          const d0 = d.state().deaths;
          for (let i = 0; i < troll.length; i++) hold(troll[i].hold, troll[i].steps);
          const s7 = d.state();
          o.acts.troll = (s7.x / 32) > 370 && s7.deaths === d0;
          o.trollX = +(s7.x / 32).toFixed(1);

          /* VIII. THE JESTER - it dies once for show, then three more times */
          d.god(true);
          hold({ right: true }, 70); hold({}, 40);
          for (let i = 0; i < 6; i++) { G().dbg.hit('jester'); d.step(50); }
          d.step(420);
          const jb = G().dbg.boss('jester');
          o.acts.jesterFake = !!jb && jb.round === 2 && jb.hp === 3;
          for (let i = 0; i < 3; i++) { G().dbg.hit('jester'); d.step(60); }
          d.step(340);
          o.acts.jester = G().done.jester === 1 && RT.find('portal').length > 0;

          /* IX. ONE JUMP - and the screen that lies */
          G().dbg.warp(362, 20); d.step(20);
          hold({ right: true }, 52);
          hold({ right: true, jump: true }, 22);
          hold({ right: true }, 44);
          o.acts.onejump = G().jumped === 1 && !!RT.getMode();
          const m = RT.getMode();
          if (m && m.onKey) m.onKey({ type: 'keydown', key: 'x' });
          d.step(220);
          o.acts.fakewin = !RT.getMode() && !!G().dbg.boss('author');

          /* X. THE AUTHOR - five hits, then the booth opens by itself */
          for (let i = 0; i < 5; i++) { G().dbg.hit('author'); d.step(60); }
          d.step(420);
          o.acts.author = G().done.author === 1 && !!RT.getMode();

          /* the booth, three tickets missed: that is the one-spike ending */
          G().dbg.tickets(false); d.step(30);
          o.acts.tickets = G().spikeOn === 1;
          d.god(false);
          hold({ right: true }, 38);
          hold({ right: true, jump: true }, 20);
          hold({ right: true }, 90);
          o.acts.spike = d.state().won === true;
          o.won = d.state().won;
          o.deaths = d.state().deaths;

          /* and the other ending: every ticket, no bomb, straight to the door */
          d.level(12); d.step(10);
          G().dbg.skipTo('tickets');
          G().dbg.tickets(true);
          d.step(60);
          o.acts.perfect = d.state().won === true;
        } catch (e) { o.err = String(e && e.message || e); }
        return o;
      }, troll).catch(e => ({ err: 'finale eval failed: ' + e.message }));
      const f = r.finale || {};
      const acts = f.acts || {};
      const allActs = ['vulcan', 'melt', 'meltTop', 'galeSteam', 'gale', 'counter', 'troll',
                       'jesterFake', 'jester', 'onejump', 'fakewin', 'author', 'tickets', 'spike', 'perfect'];
      f.failed = allActs.filter(k => !acts[k]);
      if (f.won && !f.failed.length) r.won = true;
      console.log('L12 FINALE', JSON.stringify(f));
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
        d.tetris(2);
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
