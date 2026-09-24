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
        const RT = window.RT, d = window.__dbg, T = 32;
        const o = { acts: {}, won: false, err: null, deaths: 0, fights: {} };
        const G = () => window.__L12;
        const dlog = []; RT.on('death', c => dlog.push(c + '@' + (RT.player.x/32).toFixed(1) + ',' + (RT.player.y/32).toFixed(1)));
        const hold = (h, s) => { d.hold(h || {}); d.step(s || 1); };
        const P = () => RT.player;
        const pcx = () => P().x + P().w / 2;
        const pcy = () => P().y + P().h / 2;

        /* ------------------------------------------------------------------
         * THE AUTOPLAYER. The bosses cannot be driven by a fixed input script
         * - they move - so the gate is a small bot that plays them with the
         * same four buttons a person has. If it can win, the fight is winnable.
         * ---------------------------------------------------------------- */
        function fight(who, maxSeconds, arena) {
          const boss = () => G().dbg.boss(who);
          let jumpFor = 0, jumpCool = 0, hits = 0, lastHp = null;
          const L0 = arena[0] * T, R0 = arena[1] * T;
          const N = Math.round(maxSeconds * 60);
          for (let f = 0; f < N; f++) {
            const bo = boss();
            if (!bo || bo.gone) break;
            if (lastHp === null) lastHp = bo.hp;
            let left = false, right = false, jump = false;
            const X = pcx(), Y = pcy(), onG = P().onGround;
            if (!P().dead) {
              const open = bo.open && (who !== 'gale' || bo.stalled > 0);
              if (open) {
                const dx = bo.core.x - X;
                if (Math.abs(dx) > 10) { right = dx > 0; left = dx < 0; }
                if (onG && Math.abs(dx) < 130 && jumpCool <= 0) { jumpFor = 26; jumpCool = 16; }
              } else {
                let dodge = 0, danger = 0;
                const marks = RT.find('lGmark');
                for (let i = 0; i < marks.length; i++) {
                  const m = marks[i];
                  if (m.fired) continue;
                  const mx = m.x + m.w / 2;
                  if (Math.abs(mx - X) < T * 2.2) { danger = 1; dodge += (X < mx ? -1 : 1); }
                }
                const shots = RT.find('lGshot');
                for (let i = 0; i < shots.length; i++) {
                  const sh = shots[i], sx = sh.x + sh.w / 2, sy = sh.y + sh.h / 2;
                  if (Math.abs(sx - X) < T * 1.8 && Math.abs(sy - Y) < T * 2) { danger = 1; dodge += (sx > X ? -1 : 1); }
                }
                const jets = RT.find('lGjet');
                for (let i = 0; i < jets.length; i++) {
                  const jt = jets[i], lethalIn = Math.max(0, jt.warm - jt.at);
                  if (Math.abs(jt.y - (Y - 8)) < T * 1.6 && onG && jumpCool <= 0 && lethalIn < 0.25) { jumpFor = 26; jumpCool = 18; }
                }
                const flames = RT.find('lGflame');
                for (let i = 0; i < flames.length; i++) {
                  const fl = flames[i], fx = fl.x + fl.w / 2;
                  if (fl.kind === 'sweep') {
                    const closing = (fl.vx || 0) * (X - fx) > 0;
                    if (closing && Math.abs(fx - X) < T * 2.6 && onG && jumpCool <= 0) { jumpFor = 26; jumpCool = 14; }
                  } else if (Math.abs(fx - X) < T * 2.4) { danger = 1; dodge += (fx > X ? -1 : 1); }
                }
                const drones = RT.find('lGdrone');
                for (let i = 0; i < drones.length; i++) {
                  const dr = drones[i];
                  const ddx = (dr.x + dr.w / 2) - X, ddy = (dr.y + dr.h / 2) - Y;
                  if (Math.abs(ddx) > T * 3 || Math.abs(ddy) > T * 3) continue;
                  danger = 1;
                  if (onG && jumpCool <= 0 && ddy > 10 && Math.abs(ddx) < 44) { jumpFor = 26; jumpCool = 16; }
                  else dodge += (ddx > 0 ? -1.5 : 1.5);
                }
                const clones = RT.find('lGclone');
                for (let i = 0; i < clones.length; i++) {
                  const cx = clones[i].x + clones[i].w / 2;
                  if (Math.abs(cx - X) < T * 2) { danger = 1; dodge += (cx > X ? -1 : 1); }
                }
                if (who === 'gale') {
                  const fdx = bo.hx - X;
                  if (Math.abs(fdx) < T * 3) { danger = 1; dodge += (fdx > 0 ? -1 : 1); }
                } else {
                  const bdx = (bo.x + bo.w / 2) - X;
                  if (Math.abs(bdx) < T * 2 && Math.abs((bo.y + bo.h / 2) - Y) < T * 3) { danger = 1; dodge += (bdx > 0 ? -1 : 1); }
                }
                if (who === 'author' && bo.st === 'count' && bo.pad) {
                  /* climb the written pad, then jump on the fourth beat */
                  const padX = bo.pad.rest.x + bo.pad.dw / 2, pdx = padX - X;
                  danger = 0;
                  if (Math.abs(pdx) > 12) { right = pdx > 0; left = pdx < 0; }
                  if (onG && P().y + P().h > bo.pad.rest.y + 8 && jumpCool <= 0 && Math.abs(pdx) < 60) { jumpFor = 26; jumpCool = 14; }
                  if (bo.beats >= 4 && onG && jumpCool <= 0) { jumpFor = 26; jumpCool = 14; }
                } else if (danger) { right = dodge > 0; left = dodge < 0; }
                else {
                  let want = (L0 + R0) / 2;
                  if (who === 'gale') {
                    const pools = RT.find('lGpool');
                    let best = null, bd = 1e9;
                    for (let i = 0; i < pools.length; i++) {
                      const pl = pools[i], cx = pl.x + pl.w / 2;
                      const score = Math.abs(cx - X) - pl.wet * 200;
                      if (score < bd) { bd = score; best = cx; }
                    }
                    if (best !== null) want = best;
                  }
                  if (Math.abs(X - want) > T * 1.2) { right = X < want; left = X > want; }
                }
                if (X < L0 + T * 2) { right = true; left = false; }
                if (X > R0 - T * 2) { left = true; right = false; }
              }
            }
            if (jumpFor > 0) { jump = true; jumpFor--; }
            if (jumpCool > 0) jumpCool--;
            d.hold({ left: left, right: right, jump: jump });
            d.step(1);
            const b2 = boss();
            if (b2) { if (b2.hp < lastHp) hits++; lastHp = b2.hp; }
          }
          d.hold({});
          d.step(360);
          return { hits: hits, done: !!G().done[who], deaths: d.state().deaths };
        }

        try {
          if (!G() || !G().dbg) { o.err = '__L12.dbg missing'; return o; }

          /* II. VULCAN-9 - played, not poked */
          RT.setCheckpoint(78 * T, 45 * T);
          o.fights.vulcan = fight('vulcan', 150, [75, 103]);
          o.acts.vulcan = o.fights.vulcan.done && d.tile(105, 44) === '.';

          /* III. THE MELT - it arms on entry and the lava actually climbs */
          G().dbg.skipTo('melt'); d.step(20);
          hold({ right: true }, 40); hold({}, 10);
          const lava0 = G().lavaY;
          d.god(true); d.step(360); d.god(false);
          o.acts.melt = G().meltOn === 1 && G().lavaY < lava0 - 64;
          G().dbg.warp(126, 4); d.step(30); hold({ right: true }, 30);
          o.acts.meltTop = G().meltWon === 1;

          /* IV. GALE PRIME - water fills a pool, fire boils it, the eye opens */
          G().dbg.skipTo('gale'); d.step(20);
          hold({ right: true }, 120); hold({}, 20);
          RT.setCheckpoint(139 * T, 11 * T);
          o.fights.gale = fight('gale', 150, [135, 177]);
          o.acts.galeSteam = o.fights.gale.hits > 0;
          o.acts.gale = o.fights.gale.done && d.tile(174, 12) === '.';

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

          /* VIII. THE JESTER - the bot must reach its hat, then the two deaths
             are driven to the end so the resurrection chain is proven too */
          G().dbg.skipTo('jester'); d.step(20);
          hold({ right: true }, 90); hold({}, 20);
          RT.setCheckpoint(376 * T, 43 * T);
          o.fights.jester = fight('jester', 90, [374, 398]);
          o.acts.jesterReachable = o.fights.jester.hits >= 2;
          /* the door it shuts behind you must open again when you die to it,
             or dying to THE JESTER ends the run instead of costing a lap */
          RT.setCheckpoint(252 * T, 43 * T);      /* the real one, as a player has */
          G().dbg.warp(370, 43); d.step(20);
          hold({ right: true }, 130); hold({}, 20);
          const sealedNow = d.tile(373, 43) === '#';
          d.kill(); d.step(150);
          o.acts.doorReopens = sealedNow && d.tile(373, 43) === '.' &&
                               Math.abs(d.state().x / 32 - 252) < 3;
          d.god(true);
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

          /* X. THE AUTHOR - played, four beats and a third of a second */
          d.god(false);
          RT.setCheckpoint(256 * T, 16 * T);
          o.fights.author = fight('author', 150, [254, 321]);
          o.acts.author = o.fights.author.done && !!RT.getMode();

          /* the booth, three tickets missed: that is the one-spike ending */
          G().dbg.tickets(false); d.step(30);
          o.acts.tickets = G().spikeOn === 1;
          d.god(false);
          /* walk up to the spike, then one full jump - no frame counting */
          for (let i = 0; i < 400; i++) {
            if (d.state().x / 32 >= 338.2) break;
            d.hold({ right: true }); d.step(1);
          }
          hold({ right: true, jump: true }, 26);
          hold({ right: true }, 100);
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
        o.dlog = dlog.slice(-8);
        return o;
      }, troll).catch(e => ({ err: 'finale eval failed: ' + e.message }));
      const f = r.finale || {};
      const acts = f.acts || {};
      const allActs = ['vulcan', 'melt', 'meltTop', 'galeSteam', 'gale', 'counter', 'troll',
                       'jesterReachable', 'doorReopens', 'jesterFake', 'jester', 'onejump', 'fakewin', 'author',
                       'tickets', 'spike', 'perfect'];
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
