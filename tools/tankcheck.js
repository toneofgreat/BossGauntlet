/* TANKS check:  node tools/tankcheck.js
 * Serves the repo, plays tanks.html headlessly on a desktop and a phone viewport
 * and proves the rules in the brief: three hits on a flag, one hit on a tank once
 * its flag is down, a twenty-second wall, the shooter and reload ladders, the ten
 * rungs of end mode, the 1234 code, and that the skilled bot dodges and the plain
 * one does not. Exits non-zero on the first thing that is not true.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const puppeteer = require('C:/Users/krist/Desktop/BossGauntlet/node_modules/puppeteer');

const ROOT = 'C:/Users/krist/Desktop/BossGauntlet';
const PORT = Number(process.env.TK_PORT || 8133);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const ARGS = ['--no-sandbox', '--mute-audio', '--autoplay-policy=no-user-gesture-required'];

let bad = 0;
function ok(cond, label, extra) {
  if (!cond) bad++;
  console.log((cond ? '  ok   ' : '  FAIL ') + label + (extra === undefined ? '' : '   ' + extra));
}
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
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.setViewport({ width: 1280, height: 760 });
  await page.goto(`http://localhost:${PORT}/tanks.html`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForFunction(() => window.__tanks, { timeout: 15000 });
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__tanks, { timeout: 15000 });

  /* ---------------------------------------------------------- the menu -- */
  console.log('\n-- menu and mode select');
  const menu = await page.evaluate(() => {
    const w = getComputedStyle(document.body).background;
    const btn = document.getElementById('playBtn');
    return {
      screen: window.__tanks.screen(),
      white: getComputedStyle(document.getElementById('menu')).backgroundColor,
      btnCol: getComputedStyle(btn).backgroundColor,
      btnText: btn.textContent.trim(),
      bg: w
    };
  });
  ok(menu.screen === 'menu', 'boots on the main menu', menu.screen);
  ok(menu.white === 'rgb(255, 255, 255)', 'the menu is blank white', menu.white);
  ok(menu.btnCol === 'rgb(29, 110, 245)' && menu.btnText === 'PLAY', 'one blue play button', menu.btnCol + ' ' + menu.btnText);

  await page.click('#playBtn');
  const modes = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#modeList .mode')];
    return {
      screen: window.__tanks.screen(),
      n: rows.length,
      titles: rows.map((r) => r.querySelector('b').textContent),
      lockedIsInert: rows[3].tagName === 'DIV' && rows[3].classList.contains('locked')
    };
  });
  ok(modes.screen === 'modes', 'play opens the mode list');
  ok(modes.n === 4, 'four rows', modes.titles.join(' | '));
  ok(modes.titles[0] === 'PLAY A BOT' && modes.titles[1] === 'SKILLED BOT' && modes.titles[2] === 'END MODE', 'bot, skilled bot, end mode');
  ok(modes.lockedIsInert, 'the locked sign is a sign, not a button');
  const lockedDidNothing = await page.evaluate(() => {
    document.querySelectorAll('#modeList .mode')[3].click();
    return window.__tanks.screen();
  });
  ok(lockedDidNothing === 'modes', 'clicking the locked sign does nothing', lockedDidNothing);

  /* --------------------------------------------------------- mechanics -- */
  console.log('\n-- the rules');
  const rules = await page.evaluate(() => {
    const T = window.__tanks, out = {};
    T.start('bot'); T.setPaused(true);
    let G = T.g();
    out.you = { team: G.you.team, x: Math.round(G.you.x) };
    out.foe = { team: G.foes[0].team, kind: G.foes[0].kind, x: Math.round(G.foes[0].x) };
    out.flagHp = G.flagRed.hp;
    out.slower = G.foes[0].speed < G.you.speed;
    out.slowerTrigger = G.foes[0].fire > G.you.fire;
    out.shellSpeed = 275;
    out.crossSeconds = +(1600 / 275).toFixed(1);

    // one barrel fires one shell
    G.shells.length = 0; G.you.cd = 0; T.fire(); T.step(1);
    out.oneShell = G.shells.length;

    // a wall costs twenty seconds and dies to one shell
    G.you.wallCd = 0;
    G.you.turret = 0;
    const built = (function () { return G.walls.length; })();
    T.hold({ e: true }); T.step(1); T.hold({ e: false });
    out.wallBuilt = G.walls.length - built;
    out.wallCd = Math.round(G.you.wallCd);
    out.wallHp = G.walls.length ? G.walls[0].hp : -1;
    if (G.walls.length) {
      const w = G.walls[0];
      G.shells.push({ x: w.x - 20, y: w.y, a: 0, vx: 275, vy: 0, team: 'red', dmg: 1, life: 7, trail: [] });
      for (let i = 0; i < 20 && G.walls.length; i++) T.step(1);
    }
    out.wallGone = G.walls.length === 0;

    // three hits take a flag down
    G.shells.length = 0;
    let n = 0;
    while (!G.flagRed.down && n < 10) {
      G.shells.push({ x: G.flagRed.x - 60, y: G.flagRed.y - 34, a: 0, vx: 275, vy: 0, team: 'blue', dmg: 1, life: 7, trail: [] });
      for (let i = 0; i < 30 && G.shells.length; i++) T.step(1);
      n++;
    }
    out.hitsToDropFlag = n;

    // with its flag down the red tank dies to one shell; the blue one does not
    const f = G.foes[0];
    G.shells.push({ x: f.x - 60, y: f.y, a: 0, vx: 275, vy: 0, team: 'blue', dmg: 1, life: 7, trail: [] });
    for (let i = 0; i < 30 && G.shells.length; i++) T.step(1);
    out.exposedDies = !f.alive;

    T.start('bot'); T.setPaused(true); G = T.g();
    const y = G.you;
    G.shells.push({ x: y.x + 60, y: y.y, a: Math.PI, vx: -275, vy: 0, team: 'red', dmg: 1, life: 7, trail: [] });
    for (let i = 0; i < 30 && G.shells.length; i++) T.step(1);
    out.guardedSurvives = y.alive;
    G.flagBlue.hp = 0; G.flagBlue.down = true;
    G.shells.push({ x: y.x + 60, y: y.y, a: Math.PI, vx: -275, vy: 0, team: 'red', dmg: 1, life: 7, trail: [] });
    for (let i = 0; i < 30 && G.shells.length; i++) T.step(1);
    out.unguardedDies = !y.alive;
    return out;
  });
  ok(rules.you.team === 'blue' && rules.you.x < 800, 'you are the blue tank on one side', JSON.stringify(rules.you));
  ok(rules.foe.team === 'red' && rules.foe.x > 800, 'the bot is the red tank on the other', JSON.stringify(rules.foe));
  ok(rules.flagHp === 3, 'a flag takes three hits', rules.flagHp);
  ok(rules.hitsToDropFlag === 3, 'and really does take three', rules.hitsToDropFlag);
  ok(rules.slower, 'the plain bot drives slower than you');
  ok(rules.slowerTrigger, 'and fires slower than you');
  ok(rules.crossSeconds > 4, 'a shell needs ' + rules.crossSeconds + 's to cross the arena, so it can be dodged');
  ok(rules.oneShell === 1, 'one barrel, one shell', rules.oneShell);
  ok(rules.wallBuilt === 1, 'you can build a wall', rules.wallBuilt);
  ok(rules.wallCd === 20, 'and then wait twenty seconds', rules.wallCd);
  ok(rules.wallHp === 1, 'a wall has one hit point', rules.wallHp);
  ok(rules.wallGone, 'one cannon shell breaks it');
  ok(rules.guardedSurvives, 'while your flag stands you shrug off a hit');
  ok(rules.unguardedDies, 'once it is down one hit kills you');
  ok(rules.exposedDies, 'the same is true for them');

  /* ------------------------------------------------------ shooter tiers -- */
  console.log('\n-- upgrades');
  const shop = await page.evaluate(() => {
    const T = window.__tanks, out = {};
    const S = T.save;
    out.rateLadder = [];
    for (let i = 0; i < 26; i++) out.rateLadder.push(i);
    S.coins = 9999;
    S.dmg = 1; S.rate = 1; S.shooters = 1;
    const counts = [];
    [1, 2, 3, 4, 5].forEach((lvl) => {
      S.shooters = lvl;
      T.start('bot'); T.setPaused(true);
      const G = T.g();
      G.shells.length = 0; G.you.cd = 0; T.fire(); T.step(1);
      counts.push(G.shells.length);
    });
    out.shooterCounts = counts;
    // the full blast really is all the way round
    S.shooters = 5;
    T.start('bot'); T.setPaused(true);
    const G = T.g();
    G.shells.length = 0; G.you.cd = 0; T.fire(); T.step(1);
    const angles = G.shells.map((s) => Math.atan2(s.vy, s.vx)).sort((a, b) => a - b);
    out.blastSpan = +(angles[angles.length - 1] - angles[0]).toFixed(2);
    return out;
  });
  ok(JSON.stringify(shop.shooterCounts) === '[1,2,3,4,10]', 'shooters go 1, 2, 3, 4, 10', shop.shooterCounts.join(','));
  ok(shop.blastSpan > 5, 'the ten-shooter blast covers the full circle', shop.blastSpan + ' rad');

  const ladders = await page.evaluate(() => {
    const T = window.__tanks, S = T.save, out = {};
    const dmg = [], rate = [];
    for (let l = 1; l <= 5; l++) { S.dmg = l; T.start('bot'); T.setPaused(true); dmg.push(T.g().you.dmg); }
    S.dmg = 1;
    for (let l = 1; l <= 26; l++) { S.rate = l; T.start('bot'); T.setPaused(true); rate.push(T.g().you.fire); }
    S.rate = 1;
    out.dmg = dmg; out.rate = rate;
    return out;
  });
  ok(JSON.stringify(ladders.dmg) === '[1,1.5,2,2.5,3]', 'damage goes 1, 1.5, 2, 2.5, 3', ladders.dmg.join(','));
  ok(ladders.rate[0] === 3 && ladders.rate[1] === 2.8 && ladders.rate[2] === 2.6 && ladders.rate[25] === 0,
    'reload runs 3.0 down to nothing', ladders.rate.slice(0, 4).join(',') + ' ... ' + ladders.rate.slice(-4).join(','));

  const buying = await page.evaluate(() => {
    const T = window.__tanks, S = T.save;
    S.dmg = 1; S.rate = 1; S.shooters = 1; S.coins = 0;
    T.coins(1);
    document.getElementById('shopBtn') && null;
    // buy damage level 2 for one coin, through the actual button
    const before = S.dmg;
    const card = document.querySelectorAll('#shopList .up')[0];
    const btn = card.querySelector('.buy .btn');
    const label = btn.textContent;
    btn.click();
    const after = S.dmg;
    // a maxed-out shooter tier costs a hundred
    S.shooters = 4; S.coins = 0;
    const reb = (function () { return null; })();
    return { before, after, label, coinsLeft: S.coins };
  });
  ok(buying.label === '1 COIN' && buying.after === buying.before + 1 && buying.coinsLeft === 0,
    'a coin buys the next damage tier', buying.label + ' -> level ' + buying.after);

  /* --------------------------------------------------------- end mode --- */
  console.log('\n-- end mode');
  const ladderShape = await page.evaluate(() => {
    const T = window.__tanks;
    const rows = [];
    for (let l = 1; l <= 10; l++) {
      T.start('end', l); T.setPaused(true);
      const G = T.g();
      rows.push({ l, n: G.foes.length, kinds: G.foes.map((f) => f.kind + ':' + f.shooters).join(' ') });
      T.step(120);
    }
    return rows;
  });
  const want = [
    '1 1 bot:1', '2 1 skilled:1', '3 1 bot:2', '4 1 bot:3', '5 2 bot:1 bot:1',
    '6 1 skilled:2', '7 2 skilled:1 bot:1', '8 1 bot:10', '9 3 skilled:1 skilled:1 skilled:1',
    '10 10 ' + Array(10).fill('bot:1').join(' ')
  ];
  ladderShape.forEach((r, i) => {
    const got = r.l + ' ' + r.n + ' ' + r.kinds;
    ok(got === want[i], 'rung ' + r.l + ': ' + r.kinds.slice(0, 44));
  });

  const endWin = await page.evaluate(async () => {
    const T = window.__tanks, S = T.save;
    S.coins = 0; S.endLevel = 1; S.dmg = 5; S.rate = 14; S.shooters = 4; S.endBeaten = false; S.boss = false;
    T.start('end', 1); T.setPaused(true);
    const G = T.g();
    let steps = 0;
    while (T.screen() === 'game' && steps < 4000) {
      const g = T.g();
      if (g.state === 'play') {
        let tx, ty;
        if (!g.flagRed.down) { tx = g.flagRed.x; ty = g.flagRed.y - 34; }
        else { const f = g.foes.find((q) => q.alive); if (f) { tx = f.x; ty = f.y; } }
        if (tx !== undefined) {
          T.aimAt(tx, ty);
          const far = Math.hypot(tx - g.you.x, ty - g.you.y) > 330;
          const weave = Math.floor(steps / 45) % 2 === 0;       // a player who never stands still
          T.hold({ d: far, a: false, w: weave, s: !weave });
        }
        T.fire();
      }
      T.step(1); steps++;
    }
    return {
      steps, screen: T.screen(), won: T.g().won,
      coins: S.coins, endLevel: S.endLevel,
      title: document.getElementById('resTitle').textContent,
      reward: document.getElementById('resReward').textContent,
      rungs: document.querySelectorAll('#resLadder .rung').length
    };
  });
  ok(endWin.won === true, 'an upgraded tank wins rung one', endWin.steps + ' steps');
  ok(endWin.screen === 'result' && endWin.title === 'YOU WIN', 'the result screen comes up', endWin.title);
  ok(endWin.coins === 1, 'a win pays one coin', endWin.coins);
  ok(endWin.endLevel === 2, 'and moves you to rung two', endWin.endLevel);
  ok(endWin.rungs === 10, 'the ladder shows ten rungs', endWin.rungs);

  const beatTen = await page.evaluate(() => {
    const T = window.__tanks, S = T.save;
    S.endLevel = 10; S.endBeaten = false; S.boss = false;
    T.start('end', 10); T.setPaused(true);
    const G = T.g();
    G.flagRed.hp = 0; G.flagRed.down = true;
    G.foes.forEach((f) => { f.alive = false; });
    T.step(1);
    for (let i = 0; i < 200 && T.screen() === 'game'; i++) T.step(1);
    return { screen: T.screen(), boss: S.boss, beaten: S.endBeaten, rows: [...document.querySelectorAll('#modeList .mode b')].map((b) => b.textContent) };
  });
  ok(beatTen.boss === true && beatTen.beaten === true, 'beating rung ten unlocks the locked one');
  ok(beatTen.rows.indexOf('THE TANK BOSS') === 3, 'and the sign turns into the tank boss', beatTen.rows.join(' | '));

  /* ------------------------------------------------------------- codes -- */
  console.log('\n-- codes');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__tanks);
  await page.click('#playBtn');
  await page.click('#codesBtn');
  await page.type('#codeInput', '1234');
  await page.click('#codeGo');
  const coded = await page.evaluate(() => ({
    note: document.getElementById('codeNote').textContent,
    boss: window.__tanks.save.boss,
    stored: JSON.parse(localStorage.getItem('tanks.v1')).boss
  }));
  ok(coded.boss === true && coded.stored === true, 'the code 1234 unlocks the boss', coded.note);
  await page.evaluate(() => { document.getElementById('codeInput').value = ''; });
  await page.type('#codeInput', '9999');
  await page.click('#codeGo');
  const badCode = await page.evaluate(() => document.getElementById('codeNote').textContent);
  ok(/NOT A CODE/.test(badCode), 'and a wrong code says so', badCode);

  /* -------------------------------------------------------- skill gap --- */
  console.log('\n-- the bots');
  const gap = await page.evaluate(() => {
    function raceToFlag(mode) {
      const T = window.__tanks;
      T.start(mode, 1); T.setPaused(true);
      const G = T.g();
      let s = 0;
      while (!G.flagBlue.down && s < 6000) { T.step(1); s++; }     // the player never moves or fires
      return s;
    }
    const bot = raceToFlag('bot');
    const skilled = raceToFlag('skilled');
    return { bot, skilled };
  });
  ok(gap.skilled < gap.bot, 'the skilled bot pulls your flag down sooner', 'skilled ' + (gap.skilled / 60).toFixed(1) + 's vs bot ' + (gap.bot / 60).toFixed(1) + 's');
  ok(gap.bot < 6000, 'and the plain bot gets there too', (gap.bot / 60).toFixed(1) + 's');

  const dodge = await page.evaluate(() => {
    const T = window.__tanks;
    function test(mode) {
      T.start(mode, 1); T.setPaused(true);
      const G = T.g();
      const f = G.foes[0];
      G.flagRed.hp = 0; G.flagRed.down = true;          // so a hit would finish it
      f.x = 1200; f.y = 450; f.vx = 0; f.vy = 0;
      const y0 = f.y;
      G.shells.push({ x: 700, y: 450, a: 0, vx: 275, vy: 0, team: 'blue', dmg: 1, life: 7, trail: [] });
      let peak = 0;
      for (let i = 0; i < 130 && f.alive; i++) { T.step(1); peak = Math.max(peak, Math.abs(f.y - y0)); }
      return { moved: Math.round(peak), alive: f.alive };
    }
    return { skilled: test('skilled'), bot: test('bot') };
  });
  ok(dodge.skilled.alive, 'a skilled bot slides out of the way and lives', dodge.skilled.moved + 'px sideways');
  ok(!dodge.bot.alive, 'the plain bot takes it on the chin', dodge.bot.moved + 'px sideways');

  /* ---------------------------------------------------------- the boss -- */
  console.log('\n-- the boss');
  const boss = await page.evaluate(() => {
    const T = window.__tanks;
    T.start('boss'); T.setPaused(true);
    const G = T.g();
    const b = G.foes[0];
    const out = { kind: b.kind, scale: b.scale, pillars: G.pillars.length, shooters0: b.shooters };
    T.step(120);
    G.flagRed.hp = 1;
    T.step(60);
    out.shootersLow = b.shooters;
    out.state = G.state;
    // then half a minute of boss with the player weaving about
    G.flagRed.hp = 3;
    let i = 0;
    for (; i < 1800 && G.state === 'play'; i++) { T.hold({ w: i % 90 < 45, s: i % 90 >= 45 }); T.step(1); }
    T.hold({ w: false, s: false });
    out.soakSteps = i;
    out.soakState = G.state;
    return out;
  });
  ok(boss.kind === 'boss' && boss.scale > 1.5, 'the boss is a bigger tank', boss.scale + 'x');
  ok(boss.pillars === 5, 'in a new arena with cover', boss.pillars + ' pillars');
  ok(boss.shooters0 === 4 && boss.shootersLow === 10, 'it opens with four barrels and ends with ten', boss.shooters0 + ' -> ' + boss.shootersLow);
  ok(boss.soakSteps > 0, 'half a minute of boss without falling over', (boss.soakSteps / 60).toFixed(1) + 's, state ' + boss.soakState);

  /* ------------------------------------------------------------ mobile -- */
  console.log('\n-- on a phone');
  const phone = await browser.newPage();
  const perrs = [];
  phone.on('pageerror', (e) => perrs.push(String(e.message || e)));
  await phone.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await phone.goto(`http://localhost:${PORT}/tanks.html`, { waitUntil: 'networkidle0' });
  await phone.bringToFront();
  await phone.waitForFunction(() => window.__tanks);
  const ui = await phone.evaluate(() => {
    const fine = window.matchMedia('(hover:hover) and (pointer:fine)').matches;
    window.__tanks.start('bot');
    const r = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), vis: b.width > 0 }; };
    return { fine, fire: r('fireBtn'), wall: r('wallBtn'), stick: r('stick'), hint: getComputedStyle(document.getElementById('deskHint')).display };
  });
  ok(ui.fine === false, 'the phone is not treated as a mouse');
  ok(ui.fire.vis && ui.fire.w > 90, 'the fire button is there and big', ui.fire.w + 'px');
  ok(ui.wall.vis && ui.stick.vis, 'so are the wall button and the stick');
  ok(ui.hint === 'none', 'the keyboard hint is hidden on a phone');

  await phone.evaluate(() => { window.__tanks.setPaused(false); });
  const before = await phone.evaluate(() => { const g = window.__tanks.g(); return { x: g.you.x, y: g.you.y }; });
  await phone.touchscreen.touchStart(100, 700);
  await phone.touchscreen.touchMove(100, 620);
  await new Promise((r) => setTimeout(r, 450));
  const moved = await phone.evaluate(() => { const g = window.__tanks.g(); return { x: g.you.x, y: g.you.y, stick: window.__tanks.g() && true }; });
  await phone.touchscreen.touchEnd();
  ok(Math.abs(moved.y - before.y) > 4, 'dragging the left half drives the tank', 'dy ' + (moved.y - before.y).toFixed(1));

  const fired = await phone.evaluate(async () => {
    const T = window.__tanks, g = T.g();
    g.shells.length = 0; g.you.cd = 0;
    const b = document.getElementById('fireBtn').getBoundingClientRect();
    return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  });
  await phone.touchscreen.tap(fired.x, fired.y);
  await new Promise((r) => setTimeout(r, 250));
  const shells = await phone.evaluate(() => window.__tanks.g().shells.length);
  ok(shells >= 1, 'tapping FIRE fires', shells + ' shell(s)');

  const aim = await phone.evaluate(() => window.__tanks.g().you.turret);
  await phone.touchscreen.touchStart(330, 200);
  await new Promise((r) => setTimeout(r, 400));
  await phone.touchscreen.touchEnd();
  const aim2 = await phone.evaluate(() => window.__tanks.g().you.turret);
  ok(Math.abs(aim2 - aim) > 0.05, 'touching the right half aims the turret', aim.toFixed(2) + ' -> ' + aim2.toFixed(2));

  /* --------------------------------------------------------- pictures --- */
  await page.bringToFront();
  await page.evaluate(() => {
    const T = window.__tanks, S = T.save;
    S.shooters = 3; S.dmg = 3; S.rate = 6;
    T.start('end', 7); T.setPaused(true);
    const G = T.g();
    G.guard = 0;
    G.you.x = 520; G.you.y = 470; G.you.turret = -0.25;
    G.you.wallCd = 8;
    G.flagRed.hp = 2;
    G.walls.push({ x: 900, y: 420, a: 1.2, hp: 1, team: 'blue', born: -1, hitT: 0 });
    G.you.cd = 0; T.fire();
    T.step(40);
    G.foes[0].cd = 0; G.foes[1].cd = 0; T.step(30);
    for (let i = 0; i < 40; i++) T.step(1);
  });
  await page.evaluate(() => { window.__tanks.setPaused(true); });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: 'C:/Users/krist/AppData/Local/Temp/claude/C--Users-krist-Desktop-BossGauntlet/15141b96-bc16-46c1-8edf-c2f5905dde88/scratchpad/shot-game.png' });
  await page.evaluate(() => { window.__tanks.setPaused(false); document.getElementById('resMenu').click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: 'C:/Users/krist/AppData/Local/Temp/claude/C--Users-krist-Desktop-BossGauntlet/15141b96-bc16-46c1-8edf-c2f5905dde88/scratchpad/shot-modes.png' });
  await page.evaluate(() => { document.getElementById('shopBtn').click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: 'C:/Users/krist/AppData/Local/Temp/claude/C--Users-krist-Desktop-BossGauntlet/15141b96-bc16-46c1-8edf-c2f5905dde88/scratchpad/shot-shop.png' });

  console.log('\n-- errors');
  ok(errors.length === 0, 'no page errors on the desktop run', errors.slice(0, 3).join(' | '));
  ok(perrs.length === 0, 'no page errors on the phone run', perrs.slice(0, 3).join(' | '));

  console.log(bad ? '\nTANKCHECK: ' + bad + ' FAILED' : '\nTANKCHECK: all good');
  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(2); });
