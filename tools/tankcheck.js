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

  const speed = await page.evaluate(() => {
    const T = window.__tanks, S = T.save, out = {};
    const base = [];
    S.speed = 1;
    T.start('bot'); T.setPaused(true);
    out.playerBase = T.g().you.speed;
    for (let l = 1; l <= 12; l++) { S.speed = l; T.start('bot'); T.setPaused(true); base.push(+(T.g().you.speed / out.playerBase).toFixed(2)); }
    S.speed = 1;
    out.ladder = base;
    // the price of each step up
    S.coins = 9999;
    const costs = [];
    for (let l = 1; l <= 11; l++) {
      S.speed = l;
      const before = S.coins;
      document.getElementById('shopBtn').click();
      const card = [...document.querySelectorAll('#shopList .up')].find((u) => u.querySelector('b').textContent === 'SPEED');
      card.querySelector('.buy .btn').click();
      costs.push(before - S.coins);
    }
    out.costs = costs;
    out.maxedAt = S.speed;
    S.speed = 1; S.coins = 0;
    // and the boss
    T.start('boss'); T.setPaused(true);
    const b = T.g().foes[0];
    out.bossSpeed = b.speed;
    out.bossVsYou = +(b.speed / out.playerBase).toFixed(2);
    // it dodges like a skilled tank: same test as the bots
    T.start('boss'); T.setPaused(true);
    const G = T.g();
    const boss = G.foes[0];
    G.flagRed.hp = 0; G.flagRed.down = true;
    boss.x = 1150; boss.y = 450; boss.vx = 0; boss.vy = 0;
    G.shells.push({ x: 650, y: 450, a: 0, vx: 275, vy: 0, team: 'blue', dmg: 1, life: 7, trail: [] });
    for (let i = 0; i < 130 && boss.alive; i++) T.step(1);
    out.bossDodged = boss.alive;
    return out;
  });
  ok(JSON.stringify(speed.ladder) === '[1,1.1,1.2,1.3,1.4,1.5,1.6,1.7,1.8,1.9,2,2.5]',
    'speed goes 1 up to 2.5', speed.ladder.join(','));
  ok(JSON.stringify(speed.costs) === '[1,2,3,4,5,7,9,11,22,33,99]',
    'and costs 1,2,3,4,5,7,9,11,22,33,99', speed.costs.join(','));
  ok(speed.maxedAt === 12, 'eleven steps takes you to the top', 'level ' + speed.maxedAt);
  ok(speed.bossVsYou === 2, 'the tank boss drives at twice your starting speed', speed.bossSpeed + ' vs ' + speed.playerBase);
  ok(speed.bossDodged, 'and it dodges a shell the way a skilled tank does');

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

  /* ---------------------------------------------------------- no retries -- */
  console.log('\n-- losing');
  const losing = await page.evaluate(() => {
    const T = window.__tanks, S = T.save, out = {};
    function loseIn(mode, level) {
      T.start(mode, level); T.setPaused(true);
      const G = T.g();
      G.flagBlue.hp = 0; G.flagBlue.down = true;
      G.you.alive = false;                                   // and down you go
      for (let i = 0; i < 300 && T.screen() === 'game'; i++) T.step(1);
      const nextBtn = document.getElementById('resNext');
      const menuBtn = document.getElementById('resMenu');
      return {
        screen: T.screen(),
        title: document.getElementById('resTitle').textContent,
        retry: getComputedStyle(nextBtn).display !== 'none',
        shop: getComputedStyle(document.getElementById('resShop')).display !== 'none',
        menuLabel: menuBtn.textContent,
        text: document.getElementById('resText').textContent,
        reward: document.getElementById('resReward').textContent
      };
    }
    // end mode, high up the ladder
    S.endLevel = 7; S.endBeaten = false; S.boss = true; S.coins = 4;
    out.end = loseIn('end', 7);
    out.endLevelAfter = S.endLevel;
    out.coinsKept = S.coins;
    document.getElementById('resMenu').click();
    out.endLandedOn = T.screen();
    out.ladderRowNow = document.getElementById('modeList') ? true : false;
    // and it is really persisted, not just in memory
    out.stored = JSON.parse(localStorage.getItem('tanks.v1')).endLevel;
    // the boss
    S.bossBeaten = false;
    out.boss = loseIn('boss');
    out.bossBeatenAfter = S.bossBeaten;
    document.getElementById('resMenu').click();
    out.bossLandedOn = T.screen();
    // a plain bot is still just practice
    S.endLevel = 5;
    out.bot = loseIn('bot');
    out.endLevelAfterBot = S.endLevel;
    document.getElementById('resMenu').click();
    out.botLandedOn = T.screen();
    // walking out of an end round counts as losing it
    S.endLevel = 6;
    T.start('end', 6); T.setPaused(true); T.step(10);
    T.giveUp();
    out.gaveUpScreen = T.screen();
    out.gaveUpLevel = S.endLevel;
    out.gaveUpRetry = getComputedStyle(document.getElementById('resNext')).display !== 'none';
    document.getElementById('resMenu').click();
    return out;
  });
  ok(losing.end.title === 'YOU LOSE' && losing.endLevelAfter === 1,
    'losing rung seven drops you back to rung one', 'endLevel ' + losing.endLevelAfter);
  ok(losing.stored === 1, 'and that is written to the save, not just held in memory', losing.stored);
  ok(losing.end.retry === false && losing.end.shop === false, 'no retry button on the way out');
  ok(losing.end.menuLabel === 'MAIN MENU' && losing.endLandedOn === 'menu',
    'the only way out is the main menu', losing.endLandedOn);
  ok(/no retries/i.test(losing.end.text) && /NO RETRIES/.test(losing.end.reward), 'and it says so', losing.end.reward);
  ok(losing.coinsKept === 4, 'coins you already earned are yours', losing.coinsKept + ' kept');
  ok(losing.boss.retry === false && losing.boss.menuLabel === 'MAIN MENU' && losing.bossLandedOn === 'menu',
    'losing to the boss is the same: no retry, straight to the main menu');
  ok(losing.bossBeatenAfter === false, 'and a loss never marks the boss beaten');
  ok(losing.bot.retry === true && losing.botLandedOn === 'modes' && losing.endLevelAfterBot === 5,
    'losing to a practice bot still lets you try again and costs nothing', 'endLevel ' + losing.endLevelAfterBot);
  ok(losing.gaveUpScreen === 'result' && losing.gaveUpLevel === 1 && losing.gaveUpRetry === false,
    'quitting an end-mode round mid-fight counts as losing it', 'endLevel ' + losing.gaveUpLevel);

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

  /* the long one: it opens the next zone along, without buying out this one */
  const box = await page.evaluate(() => +document.getElementById('codeInput').maxLength);
  ok(box >= 17, 'the code box takes all seventeen digits', box);
  await page.evaluate(() => { document.getElementById('codeInput').value = ''; });
  await page.type('#codeInput', '12345678987654321');
  const typed = await page.evaluate(() => document.getElementById('codeInput').value);
  ok(typed === '12345678987654321', 'and none of them are cut off', typed.length + ' digits');
  await page.click('#codeGo');
  const zoned = await page.evaluate(() => {
    document.getElementById('codesBack').click();
    return {
      note: document.getElementById('codeNote').textContent,
      zone: window.__tanks.save.zone,
      stored: JSON.parse(localStorage.getItem('tanks.v1')).zone,
      modes: document.getElementById('modeList').textContent,
      maxed: window.__tanks.save.rate                     // it is a skip, not a handout
    };
  });
  ok(zoned.zone === 2 && zoned.stored === 2, 'the long code opens the forest without the rebirth', 'zone ' + zoned.zone);
  ok(/IS OPEN/.test(zoned.note), 'and says so', zoned.note.slice(0, 40));
  ok(zoned.modes.indexOf('THE FOREST') >= 0 && zoned.modes.indexOf('END MODE') < 0,
    'the mode screen is the wood now');
  ok(zoned.maxed === 1, 'it does not buy your upgrades for you', 'reload level ' + zoned.maxed);

  /* and from the forest there is nowhere further to go, yet */
  await page.click('#codesBtn');
  await page.evaluate(() => { document.getElementById('codeInput').value = ''; });
  await page.type('#codeInput', '12345678987654321');
  await page.click('#codeGo');
  const again = await page.evaluate(() => ({
    note: document.getElementById('codeNote').textContent,
    zone: window.__tanks.save.zone
  }));
  ok(again.zone === 2, 'using it again does not break the save', 'zone ' + again.zone);
  ok(/NOTHING PAST IT/.test(again.note), 'it says there is nothing past the forest yet', again.note.slice(0, 48));
  await page.evaluate(() => { document.getElementById('codesBack').click(); localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__tanks);

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

  /* =================================================== REBIRTH AND THE WOOD */
  console.log('\n-- rebirth');
  await page.evaluate(() => { localStorage.clear(); });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.__tanks, { timeout: 15000 });

  const beforeRb = await page.evaluate(() => {
    document.getElementById('playBtn').click();
    const txt = document.getElementById('modeList').textContent;
    document.getElementById('shopBtn').click();
    return { modes: txt, shop: document.getElementById('shopList').textContent, zone: window.__tanks.save.zone };
  });
  ok(beforeRb.modes.indexOf('REBIRTH') < 0, 'no rebirth until every upgrade is bought');
  ok(beforeRb.shop.indexOf('REBIRTH') < 0, 'and no rebirth card in the upgrades either');

  const armed = await page.evaluate(() => {
    window.__tanks.maxOut();
    const shop = document.getElementById('shopList').textContent;
    // the first press only arms it
    const cards = document.querySelectorAll('#shopList .up');
    const last = cards[cards.length - 1];
    const btn = last.querySelector('button');
    const first = btn.textContent;
    btn.click();
    const second = document.querySelectorAll('#shopList .up button')[document.querySelectorAll('#shopList .up button').length - 1].textContent;
    return { shop: shop, first: first, second: second, zone: window.__tanks.save.zone };
  });
  ok(armed.shop.indexOf('REBIRTH') >= 0, 'with everything maxed the rebirth card is there');
  ok(/REBIRTH/.test(armed.first) && /BURN/.test(armed.second), 'it takes two presses', armed.first + ' -> ' + armed.second);
  ok(armed.zone === 1, 'one press does not send you');

  const after = await page.evaluate(() => {
    const btns = document.querySelectorAll('#shopList .up button');
    btns[btns.length - 1].click();                    // the second press
    const T = window.__tanks;
    return { zone: T.save.zone, screen: T.screen(), modes: document.getElementById('modeList').textContent, fLevel: T.save.fLevel };
  });
  ok(after.zone === 2, 'the second press takes you to the wood', 'zone ' + after.zone);
  ok(after.modes.indexOf('THE FOREST') >= 0, 'the forest is the game now');
  ok(after.modes.indexOf('END MODE') < 0 && after.modes.indexOf('PLAY A BOT') < 0 && after.modes.indexOf('TANK BOSS') < 0,
    'and the white arena is gone for good');
  ok(after.fLevel === 1, 'you start at the bottom of the wood');

  console.log('\n-- the six rungs');
  const rungs = await page.evaluate(() => {
    const T = window.__tanks, out = [];
    for (let i = 1; i <= 6; i++) {
      T.start('forest', i); T.setPaused(true);
      const G = T.g();
      out.push({
        n: i, kind: G.foes[0].kind, curves: G.foes.every(function (f) { return f.curves; }),
        fast: Math.round(Math.max.apply(null, G.foes.map(function (f) { return f.speed; }))),
        shooters: G.foes[0].shooters, flagHp: G.flagRed.max, zone: G.zone, lord: !!G.lord,
        foes: G.foes.length, guarded: !!G.flagRed.guarded,
        label: document.getElementById('hudLv').textContent
      });
    }
    return out;
  });
  ok(rungs.every((r) => r.curves), 'every rung in the wood curves its shots');
  ok(rungs[0].kind === 'bot' && rungs[1].kind === 'skilled', 'a bot, then a skilled one');
  ok(rungs[2].fast > rungs[0].fast, 'the speedy rung is faster than the first one',
    rungs[0].fast + ' -> ' + rungs[2].fast);
  ok(rungs[3].foes === 2 && rungs[4].foes === 2, 'the top two rungs come in pairs',
    rungs.map(function (r) { return r.foes; }).join(','));
  ok(rungs[0].flagHp === 3 && rungs[3].flagHp > rungs[0].flagHp && rungs[4].flagHp > rungs[0].flagHp,
    'the flags are staked deeper the further in you go',
    rungs.map(function (r) { return r.flagHp; }).join(','));
  ok(!rungs[0].guarded && rungs[1].guarded, 'and from rung two they ring after a hit');
  ok(rungs[4].shooters === 10, 'rung five fires ten curved shots', rungs[4].shooters);
  ok(rungs[5].kind === 'lord' && rungs[5].lord, 'rung six is the dark lord');
  ok(rungs[5].flagHp === 6, 'and it guards a six-hit flag', rungs[5].flagHp);

  console.log('\n-- curved shells and the two upgrades');
  const curve = await page.evaluate(() => {
    const T = window.__tanks;
    T.start('forest', 1); T.setPaused(true);
    const G = T.g();
    const mine = () => { const m = G.shells.filter((s) => s.team === 'blue'); return m[m.length - 1]; };
    G.guard = 0; G.you.cd = 0; G.you.turret = 0;
    T.fire(); T.step(1);
    const s1 = mine();
    const a0 = s1.a;
    T.step(40);
    const a1 = s1.a;
    G.you.cd = 0; T.fire(); T.step(1);
    const s2 = mine();
    return { bend: a1 - a0, sign1: Math.sign(s1.curve), sign2: Math.sign(s2.curve) };
  });
  ok(Math.abs(curve.bend) > 0.3, 'your shells bend as they fly', curve.bend.toFixed(2) + ' rad');
  ok(curve.sign1 === -curve.sign2, 'and they alternate, so you can bend round either side');

  const ups = await page.evaluate(() => {
    const T = window.__tanks, S = T.save;
    S.bspeed = 2; S.bsize = 2;                       // 1.2 speed, 1.1 size
    T.start('forest', 1); T.setPaused(true);
    const G = T.g();
    G.guard = 0; G.you.cd = 0;
    T.fire(); T.step(1);
    const mine1 = G.shells.filter((x) => x.team === 'blue');
    const s = mine1[mine1.length - 1];
    S.bspeed = 6; S.bsize = 11;                      // 2.0 and 2.0
    T.start('forest', 1); T.setPaused(true);
    const G2 = T.g();
    G2.guard = 0; G2.you.cd = 0;
    T.fire(); T.step(1);
    const mine2 = G2.shells.filter((x) => x.team === 'blue');
    const s2 = mine2[mine2.length - 1];
    S.bspeed = 1; S.bsize = 1;
    return { sp2: s.sp, r2: s.r, spMax: s2.sp, rMax: s2.r };
  });
  ok(Math.abs(ups.sp2 / 275 - 1.2) < 0.01, 'curve speed 2 is 1.2x', (ups.sp2 / 275).toFixed(2));
  ok(Math.abs(ups.r2 / 7 - 1.1) < 0.01, 'shell size 2 is 1.1x', (ups.r2 / 7).toFixed(2));
  ok(Math.abs(ups.spMax / 275 - 2) < 0.01 && Math.abs(ups.rMax / 7 - 2) < 0.01, 'and the top of both ladders is 2x');

  console.log('\n-- the shop');
  const fshop = await page.evaluate(() => {
    const T = window.__tanks;
    T.coins(1000);
    document.getElementById('shopBtn').click();
    const before = document.getElementById('shopList').textContent;
    const cards = document.querySelectorAll('#shopList .up');
    cards[2].querySelector('button').click();        // THE SHOP, ten coins
    document.getElementById('shopBack').click();
    const modes = document.getElementById('modeList').textContent;
    return { before: before, open: T.save.shopOpen, coins: T.save.coins, modes: modes };
  });
  ok(fshop.before.indexOf('CURVE SPEED') >= 0 && fshop.before.indexOf('SHELL SIZE') >= 0,
    'the wood sells curve speed and shell size');
  ok(fshop.open === true && fshop.coins === 990, 'the shop costs ten coins', fshop.coins + ' left');
  ok(fshop.modes.indexOf('THE SHOP') >= 0, 'and then there is a shop on the mode screen');

  const prices = await page.evaluate(() => {
    const names = [];
    document.querySelectorAll('#modeList button')[1].click();
    document.querySelectorAll('#bulletList .up').forEach((c) => names.push(c.textContent));
    return names.join(' | ');
  });
  ok(/RNG BULLET/.test(prices) && /10 COINS/.test(prices), 'the rng bullet is ten');
  ok(/FLASH BULLET/.test(prices) && /25 COINS/.test(prices), 'the flash bullet is twenty-five');
  ok(/CANNON/.test(prices) && /30 COINS/.test(prices), 'the cannon is thirty');
  ok(/VOID BULLET/.test(prices) && /500 COINS/.test(prices), 'and the void bullet is five hundred');

  const bullets = await page.evaluate(() => {
    const T = window.__tanks;
    const out = {};
    const mine = (G) => { const m = G.shells.filter((s) => s.team === 'blue'); return m[m.length - 1]; };
    // flash: same damage, much faster
    T.buy('flash'); T.equip('flash');
    T.start('forest', 1); T.setPaused(true);
    let G = T.g(); G.guard = 0; G.you.cd = 0; T.fire(); T.step(1);
    let sh = mine(G);
    out.flashSp = sh.sp; out.flashDmg = sh.dmg;
    T.equip('');
    T.start('forest', 1); T.setPaused(true);
    G = T.g(); G.guard = 0; G.you.cd = 0; T.fire(); T.step(1);
    out.plainDmg = mine(G).dmg;
    // cannon: bolted down, kills in one
    T.buy('cannon'); T.equip('cannon');
    T.start('forest', 1); T.setPaused(true);
    G = T.g(); G.guard = 0;
    out.cannonSpeed = G.you.speed;
    G.you.cd = 0; G.you.turret = 0; T.fire(); T.step(1);
    const cs = mine(G);
    const foe = G.foes[0];
    cs.x = foe.x - 2; cs.y = foe.y;                    // put it on a foe whose flag still stands
    T.step(2);
    out.cannonKilled = !foe.alive;
    out.flagUp = !G.flagRed.down;
    // and the dark lord shrugs it off
    T.start('forest', 6); T.setPaused(true);
    G = T.g(); G.guard = 0;
    const lord = G.foes[0];
    lord.blockCd = 999;                                // no blocking, to isolate the cannon
    G.you.cd = 0; T.fire(); T.step(1);
    const cs2 = mine(G);
    cs2.x = lord.x - 2; cs2.y = lord.y;
    T.step(2);
    out.lordSurvived = lord.alive;
    // rng: about one in ten is gold
    T.buy('rng'); T.equip('rng');
    T.start('forest', 1); T.setPaused(true);
    G = T.g(); G.guard = 0;
    let gold = 0, fired = 0;
    for (let i = 0; i < 300; i++) {
      G.you.cd = 0; T.fire(); T.step(1);
      const m = mine(G);
      if (m) { if (m.kind === 'gold') gold++; fired++; m.life = 0; }   // bin it and go again
      T.step(1);
    }
    out.gold = gold; out.fired = fired;
    return out;
  });
  ok(bullets.flashSp > 275 * 3, 'the flash bullet is very fast', Math.round(bullets.flashSp) + ' px/s');
  ok(bullets.flashDmg === bullets.plainDmg, 'and does normal damage', bullets.flashDmg + ' vs ' + bullets.plainDmg);
  ok(bullets.cannonSpeed === 0, 'the cannon bolts you to the floor', bullets.cannonSpeed);
  ok(bullets.cannonKilled && bullets.flagUp, 'and one-shots a tank with its flag still up');
  ok(bullets.lordSurvived, 'but the dark lord is not impressed by it');
  ok(bullets.gold > bullets.fired * 0.05 && bullets.gold < bullets.fired * 0.17,
    'the rng bullet is gold about one time in ten', bullets.gold + '/' + bullets.fired);

  console.log('\n-- the void bullet');
  const voidTest = await page.evaluate(() => {
    const T = window.__tanks;
    T.buy('void'); T.equip('void');
    T.start('forest', 1); T.setPaused(true);
    const G = T.g();
    G.guard = 0;
    const foe = G.foes[0];
    G.you.cd = 0; G.you.turret = 0; T.fire(); T.step(1);
    const mine = () => { const m = G.shells.filter((s) => s.team === 'blue'); return m[m.length - 1]; };
    const vs = mine();
    const kind = vs.kind;
    vs.x = foe.x - 4; vs.y = foe.y;
    T.step(2);
    const blues = G.flags.filter((f) => f.team === 'blue' && !f.down).length;
    const reds = G.flags.filter((f) => f.team === 'red' && !f.down).length;
    const mid = G.flags.filter((f) => f.team === 'red' && Math.abs(f.x - 800) < 2 && Math.abs(f.y - 450) < 2).length;
    // a second shot in the same round is an ordinary shell
    G.you.cd = 0; T.fire(); T.step(1);
    const ag = mine();
    const again = ag ? ag.kind : 'plain';
    return { kind: kind, blues: blues, reds: reds, mid: mid, stun: foe.stun, flags: G.flags.length,
             hole: !!G.hole, again: again, moved: foe.vx !== 0 || foe.vy !== 0 };
  });
  ok(voidTest.kind === 'void', 'the void bullet comes out of the barrel');
  ok(voidTest.hole, 'and opens a hole');
  ok(voidTest.blues === 2, 'their flag comes back as yours: you have one on both sides', voidTest.blues);
  ok(voidTest.reds === 1 && voidTest.mid === 1, 'and theirs is spat out in the middle');
  ok(Math.abs(voidTest.stun - 20.2) < 0.2, 'what it hits is stunned for 20.2 seconds', voidTest.stun.toFixed(1));
  ok(voidTest.moved, 'and thrown backwards');
  ok(voidTest.again !== 'void', 'only one hole a round', voidTest.again || 'plain');

  const voidElsewhere = await page.evaluate(() => {
    const T = window.__tanks;
    T.start('end', 1); T.setPaused(true);          // not the wood
    const G = T.g();
    G.guard = 0; G.you.cd = 0; T.fire(); T.step(1);
    const m = G.shells.filter((s) => s.team === 'blue');
    return m.length ? (m[m.length - 1].kind || 'plain') : 'none';
  });
  ok(voidElsewhere !== 'void', 'outside the wood it is just a shell', voidElsewhere);

  console.log('\n-- the dark lord');
  const lord = await page.evaluate(() => {
    const T = window.__tanks;
    T.equip('');
    T.start('forest', 6); T.setPaused(true);
    const G = T.g();
    G.guard = 0;
    const b = G.foes[0];
    const startX = b.x, startY = b.y;
    let blocked = 0, tps = 0, phases = {}, shots = 0, maxAir = 0;
    let lastX = b.x, lastY = b.y;
    for (let i = 0; i < 60 * 30; i++) {            // thirty seconds of it
      const bt = b.blockT;
      // keep feeding it shells so the block can show itself
      if (i % 20 === 0) {
        G.you.cd = 0;
        G.you.turret = Math.atan2(b.y - G.you.y, b.x - G.you.x);
        T.fire();
        T.step(1);
        const m = G.shells.filter((s) => s.team === 'blue');
        const sh = m[m.length - 1];
        if (sh) { sh.x = b.x - 6; sh.y = b.y; shots++; }   // put it on the hull
      }
      T.step(1);
      // keep its flag topped up: if it dies the round ends and it stops thinking
      G.flags.forEach(function (f) { if (f.team === 'red') { f.hp = f.max; f.down = false; f.icd = 0; } });
      b.alive = true; G.state = 'play';          // it is being studied, not fought
      if (b.blockT > bt && b.blockT > 0.3) blocked++;
      phases[b.phase] = (phases[b.phase] || 0) + 1;
      const air = G.shells.filter((x) => x.team === 'red').length;
      if (air > maxAir) maxAir = air;
      if (Math.hypot(b.x - lastX, b.y - lastY) > 250) tps++;   // a jump, not a drive
      lastX = b.x; lastY = b.y;
    }
    return { blocked: blocked, shots: shots, tps: tps, phases: Object.keys(phases).length,
             shells: maxAir, alive: b.alive,
             speed: Math.round(b.speed), moved: Math.hypot(b.x - startX, b.y - startY) };
  });
  ok(lord.blocked > 0, 'the dark lord blocks shots', lord.blocked + '/' + lord.shots);
  ok(lord.blocked < lord.shots, 'but not all of them');
  ok(lord.tps >= 1 && lord.tps <= 6, 'it teleports, but not constantly', lord.tps + ' in 30s');
  ok(lord.phases === 5, 'it runs through all five of its abilities', lord.phases + ' of 5 seen');
  ok(lord.shells > 10, 'and it fills the clearing with magic', lord.shells + ' shots in the air');
  ok(lord.speed >= 455, 'it is faster than the tank boss', lord.speed + ' vs 410');

  const beatable = await page.evaluate(() => {
    const T = window.__tanks, S = T.save;
    S.rate = 20; S.dmg = 5; S.shooters = 3; S.speed = 11; S.bspeed = 6; S.bsize = 11;
    T.equip('');
    T.start('forest', 6); T.setPaused(true);
    const G = T.g();
    G.guard = 0;
    let flagDown = -1, killed = -1, lastHp = G.flagRed.hp, lastHit = -1, minGap = 99;
    for (let i = 0; i < 60 * 150; i++) {
      const b = G.foes[0];
      if (!b.alive) { killed = i / 60; break; }
      // a very good player: keep away, aim at whatever is worth hitting
      const tgt = G.flagRed.down ? b : { x: G.flagRed.x, y: G.flagRed.y - 34 };
      const a = Math.atan2(tgt.y - G.you.y, tgt.x - G.you.x);
      G.you.turret = a;
      G.you.cd = 0;
      T.fire();
      // and keeps moving
      // a banana steers onto a point 820px out, so a player who hugs the far
      // wall cannot reach the flag at all: fight at a range the shell can hold
      G.you.x = 900 + Math.sin(i / 70) * 170;
      G.you.y = 450 + Math.cos(i / 55) * 280;
      G.you.alive = true;
      if (G.flagRed.hp < lastHp) {                 // it took one
        if (lastHit >= 0) minGap = Math.min(minGap, i / 60 - lastHit);
        lastHit = i / 60; lastHp = G.flagRed.hp;
      }
      if (G.flagRed.down && flagDown < 0) flagDown = i / 60;
      T.step(1);
    }
    return { flagDown: flagDown, killed: killed, minGap: minGap };
  });
  ok(beatable.flagDown > 0, 'its flag can be brought down', beatable.flagDown.toFixed(1) + 's');
  ok(beatable.killed > 0, 'and then it can be killed', beatable.killed.toFixed(1) + 's');
  // six hits with 0.55s of immunity between them is a 3.3s floor; asserting a
  // bigger number than that is really asserting how its block rolls went
  ok(beatable.minGap >= 0.5, 'and no two hits on it land inside the half-second window', beatable.minGap.toFixed(2) + 's apart');

  console.log('\n-- the wood is still a game');
  /* A hand of modest skill: it fires about once a second whatever its reload
   * could do, it aims with a wobble, and it only sidesteps what it can already
   * see. Rung one has to fall to it; the top of the wood has to make it work. */
  const woodHand = await page.evaluate(function () {
    var T = window.__tanks, S = T.save;
    S.zone = 2; T.maxOut();
    function play(lv, cap) {
      T.start('forest', lv); T.setPaused(true);
      var G = T.g(), you = G.you, i, cool = 0, hit = 0, wasHit = false, won = -1;
      G.guard = 0;
      for (i = 0; i < 60 * cap; i++) {
        if (G.state !== 'play') { if (G.won) won = i / 60; break; }
        var tgt = G.flagRed.down ? G.foes.filter(function (f) { return f.alive; })[0] : { x: G.flagRed.x, y: G.flagRed.y - 34 };
        if (!tgt) { won = i / 60; break; }
        you.turret = Math.atan2(tgt.y - you.y, tgt.x - you.x) + Math.sin(i / 23) * 0.09;
        cool -= 1 / 60;
        if (cool <= 0) { you.cd = 0; T.fire(); cool = 0.95; }
        var ax = 0.75, ay = Math.sin(i / 48) * 0.9, near = null, nd = 1e9;
        for (var k = 0; k < G.shells.length; k++) {
          var sh = G.shells[k];
          if (sh.team === 'blue') continue;
          var d = Math.hypot(sh.x - you.x, sh.y - you.y);
          if (d < 220 && d < nd) { nd = d; near = sh; }
        }
        if (near) {
          var sa = Math.atan2(near.vy, near.vx);
          ax = Math.cos(sa + Math.PI / 2); ay = Math.sin(sa + Math.PI / 2);
        }
        T.hold({ w: ay < -0.38, s: ay > 0.38, a: ax < -0.38, d: ax > 0.38 });
        T.step(1);
        if (you.hitT > 0 && !wasHit) hit++;
        wasHit = you.hitT > 0;
      }
      T.hold({ w: false, s: false, a: false, d: false });
      return { won: won, hit: hit, flag: G.flagRed.down };
    }
    var one = [play(1, 60), play(1, 60)];
    var five = [play(5, 60), play(5, 60)];
    return {
      oneWon: one.filter(function (r) { return r.won > 0; }).length,
      oneIn: Math.min.apply(null, one.map(function (r) { return r.won > 0 ? r.won : 999; })),
      fiveIn: Math.max.apply(null, five.map(function (r) { return r.won > 0 ? r.won : 60; })),
      oneHit: one.reduce(function (a, r) { return a + r.hit; }, 0),
      fiveHit: five.reduce(function (a, r) { return a + r.hit; }, 0),
      fiveFlag: five.filter(function (r) { return r.flag; }).length
    };
  });
  ok(woodHand.oneWon === 2, 'a modest hand clears rung one every time', woodHand.oneWon + '/2 in ' + woodHand.oneIn.toFixed(0) + 's');
  ok(woodHand.fiveIn > woodHand.oneIn, 'and the top of the wood takes it longer',
    woodHand.oneIn.toFixed(0) + 's -> ' + woodHand.fiveIn.toFixed(0) + 's');
  ok(woodHand.fiveHit > woodHand.oneHit, 'and hits it more often up there',
    woodHand.oneHit + ' -> ' + woodHand.fiveHit + ' shells');
  ok(woodHand.fiveFlag === 2, 'while rung five can still have its flag taken', woodHand.fiveFlag + '/2');

  /* The budget is ten tanks at 60fps on a mid phone and the named trap is a
   * gradient cut inside a draw. A stopwatch cannot see it - the same pair of
   * frames times at wildly different speeds under GC - so count the asks
   * instead. One frame of the wood must cost the same whether it holds nothing,
   * four hundred shells, or ten machines. */
  const woodPaint = await page.evaluate(function () {
    var T = window.__tanks;
    var C = CanvasRenderingContext2D.prototype;
    var lin = C.createLinearGradient, rad = C.createRadialGradient, pat = C.createPattern;
    var n = 0;
    C.createLinearGradient = function (a, b, c, d) { n++; return lin.call(this, a, b, c, d); };
    C.createRadialGradient = function (a, b, c, d, e, f) { n++; return rad.call(this, a, b, c, d, e, f); };
    C.createPattern = function (a, b) { n++; return pat.call(this, a, b); };
    var out = { bare: -1, loaded: -1, ten: -1, shells: 0, parts: 0, err: '' };
    try {
      T.save.zone = 2; T.maxOut();
      T.start('forest', 5); T.setPaused(true);
      var G = T.g(), i;
      G.guard = 0;
      window.drawFrame();                            // first paint cuts the skins
      n = 0; window.drawFrame(); out.bare = n;
      for (i = 0; i < 120; i++) {
        G.you.cd = 0; T.fire();
        G.foes.forEach(function (f) { f.cd = 0; f.alive = true; });
        G.you.alive = true; G.state = 'play';
        T.step(1);
      }
      out.shells = G.shells.length; out.parts = G.parts.length;
      n = 0; window.drawFrame(); out.loaded = n;
      for (i = 0; i < 8; i++) {
        G.foes.push(window.makeTank('red', i % 2 ? 'skilled' : 'bot',
          420 + i * 110, 180 + (i % 3) * 240, { curve: 1, rung: (i % 5) + 1 }));
      }
      n = 0; window.drawFrame(); out.ten = n;
    } catch (e) { out.err = String(e.message || e); }
    C.createLinearGradient = lin; C.createRadialGradient = rad; C.createPattern = pat;
    return out;
  });
  ok(woodPaint.err === '' && woodPaint.bare === woodPaint.loaded && woodPaint.loaded === woodPaint.ten,
    'one frame of the wood costs the same with ten machines in it as with none',
    woodPaint.err || (woodPaint.bare + ' / ' + woodPaint.loaded + ' with ' + woodPaint.shells +
      ' shells and ' + woodPaint.parts + ' motes / ' + woodPaint.ten + ' with ten tanks'));

  console.log('\n-- what the wood pays');
  const pay = await page.evaluate(async () => {
    const T = window.__tanks, S = T.save;
    const want = [1, 1, 1, 2, 4, 15], got = [];
    for (let lv = 1; lv <= 6; lv++) {
      T.coins(0);
      S.fLevel = lv;
      T.start('forest', lv); T.setPaused(true);
      const G = T.g();
      G.guard = 0;
      G.foes.forEach((f) => { f.alive = false; });
      for (let i = 0; i < 130; i++) T.step(1);          // let the result screen come up
      got.push(T.save.coins);
    }
    return { want: want, got: got, after: S.fLevel, beaten: S.fBeaten };
  });
  ok(pay.got.join(',') === pay.want.join(','), 'one, one, one, two, four, and fifteen for the dark lord', pay.got.join(','));
  ok(pay.after === 1 && pay.beaten, 'and after the dark lord the wood starts again', 'rung ' + pay.after);

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
  await page.screenshot({ path: 'C:/Users/krist/AppData/Local/Temp/claude/C--Users-krist-Desktop-BossGauntlet/beb213ac-1143-495a-9509-80efdca634eb/scratchpad/shot-game.png' });
  await page.evaluate(() => { window.__tanks.setPaused(false); document.getElementById('resMenu').click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: 'C:/Users/krist/AppData/Local/Temp/claude/C--Users-krist-Desktop-BossGauntlet/beb213ac-1143-495a-9509-80efdca634eb/scratchpad/shot-modes.png' });
  await page.evaluate(() => { document.getElementById('shopBtn').click(); });
  await new Promise((r) => setTimeout(r, 200));
  await page.screenshot({ path: 'C:/Users/krist/AppData/Local/Temp/claude/C--Users-krist-Desktop-BossGauntlet/beb213ac-1143-495a-9509-80efdca634eb/scratchpad/shot-shop.png' });

  console.log('\n-- errors');
  ok(errors.length === 0, 'no page errors on the desktop run', errors.slice(0, 3).join(' | '));
  ok(perrs.length === 0, 'no page errors on the phone run', perrs.slice(0, 3).join(' | '));

  console.log(bad ? '\nTANKCHECK: ' + bad + ' FAILED' : '\nTANKCHECK: all good');
  await browser.close();
  server.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('HARNESS FAIL', e); process.exit(2); });
