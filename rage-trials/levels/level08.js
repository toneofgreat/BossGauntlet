/* =========================================================================
 * RAGE TRIALS - LEVEL 8: THE ULTIMATE OBBY TYCOON
 * -------------------------------------------------------------------------
 * The only level in the game you have to BUY. You start on a bare plot with
 * a three-hop lap and no money. Run the lap, touch the payout plate, come
 * home, feed a button - and the world physically grows eastward, one
 * purchase at a time, until you can afford the door.
 *
 * Grid: 146 x 16. The walkable ground line is row 13 (rows 13-15 baseplate);
 * every chasm between the plazas is lava at rows 13-14.
 *
 *   cols   0- 29  THE PLOT         lap circuit, cash plinth, 3 buy pads
 *         30- 41  THE BRIDGE       painted by `bridge`     (50)
 *         42- 47  PLAZA 2          checkpoint + payout + `belt` pad
 *         48- 61  CONVEYOR WING    painted by `belt`       (120)
 *         62- 67  PLAZA 3          checkpoint + payout + `dj` pad
 *         68- 85  THE LEAP         authored, needs DOUBLE JUMP (250)
 *         86- 91  PLAZA 4          checkpoint + payout + `spin` pad
 *         92-105  SPINNER GAUNTLET painted by `spin`       (400)
 *        106-113  PLAZA 5          checkpoint + payout + `dash`, `tower` pads
 *        114-131  THE TOWER        painted by `tower` (1000), DASH wall at 130
 *        132-145  THE SUMMIT       checkpoint, payout, PRESTIGE, `gate` (2000)
 *
 * Price ladder (docs/research-troll.md 3.4, compressed to DESIGN.md's
 * numbers): 25 / 50 / 120 / 150 / 250 / 400 / 700 / 1000 / 2000 - about
 * 1.6x a step, no wait longer than the genre's 90-second ceiling.
 * Cash survives death on purpose. Dying costs you walking, never money.
 * ========================================================================= */
(function () {
  var RT = window.RT;
  if (!RT) return;

  var T = 32;
  var COIN_CASH = 3;          /* a coin is worth 3 here, not 1 */
  var PHASES = 7;

  /* deterministic hash - the background art must never flicker */
  function h1(i) { var s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s); }
  function parX(cx, wx, par) { return cx * (1 - par) + wx * par; }

  /* ---------------------------------------------------------------- tiles */
  function run(y, x0, x1, ch) {
    var a = [], x;
    for (x = x0; x <= x1; x++) a.push([x, y, ch || '#']);
    return a;
  }
  function cat() {
    var out = [], i, j;
    for (i = 0; i < arguments.length; i++) for (j = 0; j < arguments[i].length; j++) out.push(arguments[i][j]);
    return out;
  }

  /* what each purchase paints into the world (tile coords) */
  var TILES = {
    bridge: cat(run(12, 30, 32), run(12, 35, 37), run(12, 40, 41)),
    belt:   cat(run(12, 48, 49), run(12, 53, 53), run(12, 56, 57), run(12, 61, 61)),
    spin:   cat(run(12, 92, 101)),
    tower:  cat(run(11, 114, 115), run(9, 117, 118), run(7, 120, 121, 'K'),
                run(5, 123, 124), [[124, 4, 'C']],
                run(3, 126, 131), run(0, 126, 131),
                [[130, 1, '#'], [130, 2, 'B']]),
    /* the door is authored and sealed behind a floor-to-ceiling shutter at
     * col 143; buying THE GATE dissolves the shutter. */
    gate:   [[143, 0, '.'], [143, 1, '.'], [143, 2, '.']]
  };

  /* entities that come with a section. ensureEnts() puts them back after a
   * death, because a respawn wipes every non-persistent runtime entity. */
  var SECTION_ENTS = {
    belt: [
      { type: 'conveyor', x: 50, y: 12, w: 3, speed: -3 },
      { type: 'conveyor', x: 58, y: 12, w: 3, speed: 3 }
    ],
    spin: [
      { type: 'saw', x: 94.25, y: 6, r: 0.75, path: [[94.25, 6], [94.25, 9.5]], speed: 2.6 },
      { type: 'saw', x: 98.25, y: 10.8, r: 0.75, path: [[98.25, 9.5], [98.25, 6]], speed: 2.6 },
      { type: 'mover', x: 102, y: 12, w: 2, h: 1, path: [[102, 12], [104, 12]], speed: 2.2, pal: 'gold' }
    ]
  };

  /* ------------------------------------------------------------ the ladder */
  var ITEMS = [
    { id: 'drop1', name: 'DROPPER I', price: 25, kind: 'dropper', cps: 3,
      x: 7, y: 12, w: 2, h: 1, mx: 7, my: 12, icon: 'dropper', color: '#4ade80',
      desc: 'Plastic money. Falls forever. Never asks for a raise.' },

    { id: 'bridge', name: 'THE PLASTIC BRIDGE', price: 50, kind: 'platform', cps: 2,
      requires: 'drop1', showLocked: true, x: 15, y: 12, w: 2, h: 1, color: '#67e8f9',
      tiles: TILES.bridge, desc: 'Eight bricks over the lava. A bargain at any price.' },

    { id: 'drop2', name: 'DROPPER II', price: 150, kind: 'dropper', cps: 8,
      requires: 'drop1', showLocked: true, x: 11, y: 12, w: 2, h: 1, mx: 11, my: 12,
      icon: 'dropper', color: '#34d399', desc: 'The same idea, louder.' },

    { id: 'belt', name: 'THE CONVEYOR WING', price: 120, kind: 'platform', cps: 5,
      requires: 'bridge', showLocked: true, x: 46, y: 12, w: 2, h: 1, color: '#fbbf24',
      tiles: TILES.belt, desc: 'Two belts. Exactly one of them is on your side.' },

    { id: 'dj', name: 'DOUBLE JUMP COIL', price: 250, kind: 'ability', ability: 'doubleJump',
      requires: 'belt', showLocked: true, x: 66, y: 12, w: 2, h: 1, color: '#3df0ff',
      desc: 'The gap east of here is five tiles. You are not.' },

    { id: 'spin', name: 'THE SPINNER GAUNTLET', price: 400, kind: 'platform', cps: 14,
      requires: 'dj', showLocked: true, x: 90, y: 12, w: 2, h: 1, color: '#f87171',
      tiles: TILES.spin, desc: 'Two blades, one gold ferry, a lot of income.' },

    { id: 'dash', name: 'DASH SPRINGS', price: 700, kind: 'ability', ability: 'dash',
      requires: 'spin', showLocked: true, x: 109, y: 12, w: 2, h: 1, color: '#c084fc',
      desc: 'Smashes plastic. There is a wall at the top with your name on it.' },

    { id: 'tower', name: 'THE TOWER', price: 1000, kind: 'platform', cps: 25,
      requires: 'dash', showLocked: true, x: 112, y: 12, w: 2, h: 1, color: '#a3e635',
      tiles: TILES.tower, desc: 'Nine storeys of rented air. The view is free.' },

    { id: 'gate', name: 'THE GATE', price: 2000, kind: 'platform', cps: 0,
      requires: 'tower', showLocked: true, x: 141, y: 2, w: 2, h: 1, icon: 'gate', color: '#ffd23f',
      tiles: TILES.gate, desc: 'Opens the shutter. You are buying the exit. Sit with that.' }
  ];

  /* Payout plates. Stand on one and the lap pays out; they all re-arm the
   * moment you are home on the plot. That is what makes this a LAP. */
  var PLATES = [
    { id: 'lap', x0: 25, x1: 27, y0: 8, y1: 10, base: 10, label: 'LAP PAYOUT' },
    { id: 'p2', x0: 43, x1: 44, y0: 10, y1: 12, base: 25, label: 'BRIDGE PAYOUT' },
    { id: 'p3', x0: 63, x1: 64, y0: 10, y1: 12, base: 60, label: 'WING PAYOUT' },
    { id: 'p4', x0: 87, x1: 88, y0: 10, y1: 12, base: 120, label: 'LEAP PAYOUT' },
    { id: 'p5', x0: 107, x1: 108, y0: 10, y1: 12, base: 260, label: 'GAUNTLET PAYOUT' },
    { id: 'p6', x0: 134, x1: 135, y0: 0, y1: 2, base: 500, label: 'SUMMIT PAYOUT' }
  ];

  /* the sky you only get to see once you have paid your way above the plot */
  var SKY_HIGH = {
    sky: [[0, '#16225e'], [0.34, '#4a6ad2'], [0.68, '#ff9f5e'], [1, '#ffe6b0']],
    parallax: [
      { kind: 'stars', color: '#ffffff', y: 0.30, speed: 0.02, scale: 0.7, alpha: 0.55 },
      { kind: 'clouds', color: '#ffd2a6', y: 0.52, speed: 0.06, scale: 0.55, alpha: 0.9 },
      { kind: 'city', color: '#4d5c9c', color2: '#8496da', y: 0.94, speed: 0.15, scale: 0.42 },
      { kind: 'clouds', color: '#ffffff', y: 1.06, speed: 0.34, scale: 0.34, alpha: 0.8 }
    ],
    ambient: 'dust',
    fog: { color: '#ffd2a6', alpha: 0.10 },
    tile: { top: '#ffd24a', side: '#e4e8ec', dark: '#97a0aa', rim: '#fff8de', accent: '#ff7ad9' },
    spike: { base: '#c0c6cc', tip: '#ffffff' },
    vignette: 0.20
  };

  /* lava spans, so the front-layer heat sits only where the lava is */
  var LAVA = [[30, 41], [48, 61], [68, 85], [92, 105], [114, 145]];

  /* ---------------------------------------------------------------- state */
  var S = null;
  function fresh() {
    return { plate: {}, coins: 0, seen: {}, ents: {}, ensureT: 0, phase: 1, lapCount: 0 };
  }

  function tyc() { return (RT.Tycoon && RT.Tycoon.active) ? RT.Tycoon : null; }
  function owned(id) { var t = tyc(); return !!(t && t.has(id)); }
  function ownedCount() {
    var n = 0, i;
    for (i = 0; i < ITEMS.length; i++) if (owned(ITEMS[i].id)) n++;
    return n;
  }
  function phaseNow() {
    if (owned('tower')) return 7;
    if (owned('dash') || owned('spin')) return 6;
    if (owned('dj')) return 5;
    if (owned('belt') || owned('drop2')) return 4;
    if (owned('bridge')) return 3;
    if (owned('drop1')) return 2;
    return 1;
  }

  function clone(d) {
    var o = {}, k, i;
    for (k in d) if (Object.prototype.hasOwnProperty.call(d, k)) o[k] = d[k];
    if (d.path) { o.path = []; for (i = 0; i < d.path.length; i++) o.path.push([d.path[i][0], d.path[i][1]]); }
    return o;
  }
  function entsAlive(list) {
    if (!list || !list.length) return false;
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      if (!e || e.dead) return false;
      if (RT.entities.indexOf(e) < 0) return false;
    }
    return true;
  }
  /* a death removes every non-persistent runtime entity, so the belts and the
   * blades have to be put back - fresh, at their home positions. */
  function ensureEnts() {
    var id, defs, out, i, e;
    for (id in SECTION_ENTS) {
      if (!Object.prototype.hasOwnProperty.call(SECTION_ENTS, id)) continue;
      if (!owned(id)) continue;
      if (entsAlive(S.ents[id])) continue;
      defs = SECTION_ENTS[id]; out = [];
      for (i = 0; i < defs.length; i++) {
        e = RT.spawn(clone(defs[i]));
        if (e) out.push(e);
      }
      S.ents[id] = out;
    }
  }

  function payout(pl) {
    var t = tyc();
    if (!t) return;
    var n = Math.round(pl.base * (1 + 0.22 * ownedCount()));
    t.add(n);
    RT.toast(pl.label + '   +$' + n, 1.5);
    RT.Audio.sfx('cash');
    var p = RT.player;
    RT.particles.burst(p.x + p.w / 2, p.y + p.h / 2, {
      n: 18, colors: ['#ffd23f', '#fff4c4', '#ffffff'], speed: 190, life: 0.7, size: 3, gravity: 480
    });
    if (RT.particles.ring) RT.particles.ring(p.x + p.w / 2, p.y + p.h / 2, '#ffd23f', 6, 46, 0.45);
    RT.cam.shake(2.4, 0.14);
    if (pl.id === 'lap') {
      S.lapCount++;
      if (S.lapCount === 3) RT.speech(p.x + 8, p.y - 14, 'this is the whole game', 1.8);
    }
  }

  function onPurchase(item) {
    ensureEnts();
    S.phase = phaseNow();
    RT.hud.set('phase', S.phase + ' / ' + PHASES);
    RT.flash('rgba(255,236,170,0.40)', 0.20);
    if (item.id === 'dj') RT.banner(['DOUBLE JUMP', 'the east gap is yours now'], 1.7);
    else if (item.id === 'dash') RT.banner(['DASH', 'plastic walls are a suggestion'], 1.7);
    else if (item.id === 'tower') RT.banner(['THE TOWER', 'nine storeys, one wall, one door'], 1.9);
    else if (item.id === 'gate') {
      RT.banner(['THE GATE IS YOURS', 'walk east and leave'], 2.2);
      RT.Audio.sfx('door');
    }
  }

  /* ------------------------------------------------------------------ art */
  function stud(g, x, y, r, top, side) {
    g.fillStyle = side; g.beginPath(); g.ellipse(x, y + r * 0.42, r, r * 0.52, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = top; g.beginPath(); g.ellipse(x, y, r, r * 0.52, 0, 0, Math.PI * 2); g.fill();
  }
  /* a far-off plastic tower block: rounded corners, studs on the roof */
  function plasticTower(g, x, baseY, w, h, c1, c2) {
    var i;
    g.fillStyle = c1;
    g.beginPath();
    if (g.roundRect) g.roundRect(x - w / 2, baseY - h, w, h, 4);
    else g.rect(x - w / 2, baseY - h, w, h);
    g.fill();
    g.fillStyle = c2;
    g.fillRect(x - w / 2, baseY - h, w * 0.34, h);
    var n = Math.max(1, Math.round(w / 13));
    for (i = 0; i < n; i++) stud(g, x - w / 2 + (i + 0.5) * (w / n), baseY - h - 2, (w / n) * 0.30, c1, c2);
    g.fillStyle = 'rgba(255,255,255,0.13)';
    for (i = 1; i * 16 < h; i++) g.fillRect(x - w / 2 + 3, baseY - i * 16, w - 6, 5);
  }
  /* dashed hologram of a section you have not paid for yet */
  function hologram(g, list, t, x0, x1, col) {
    var i, tt, bx, by, a;
    g.lineWidth = 1.5;
    for (i = 0; i < list.length; i++) {
      tt = list[i];
      bx = tt[0] * T; by = tt[1] * T;
      if (bx < x0 - 64 || bx > x1 + 64) continue;
      a = 0.13 + 0.10 * (0.5 + 0.5 * Math.sin(t * 1.7 + i * 0.5));
      g.globalAlpha = a;
      g.fillStyle = col;
      g.fillRect(bx + 3, by + 3, T - 6, T - 6);
      g.globalAlpha = a + 0.22;
      g.strokeStyle = col;
      g.beginPath();
      g.rect(bx + 2.5, by + 2.5, T - 5, T - 5);
      g.stroke();
    }
    g.globalAlpha = 1;
  }

  /* ===================================================================== */
  RT.registerLevel(8, {
    name: 'THE ULTIMATE OBBY TYCOON',
    subtitle: 'Buy the level you are standing in',
    theme: 'tycoon',
    themeZones: [{ x0: 113.5, x1: 400, theme: SKY_HIGH }],
    music: 'tycoon',

    tiles: [
      '...............................................................................................................................................###',
      '........................................................................................................................................o...o..#.#',
      '....................................................................................................................................C..........#G#',
      '....................................................................................................................................##############',
      '....................................................................................................................................##############',
      '....................................................................................................................................##############',
      '..................................................................................................................................................',
      '..................................................................................................................................................',
      '..........................................................................o.....oo................................................................',
      '.......................o.o.o.............................................o.o......o...............................................................',
      '....................o...####..........................oo................o...###....o..............................................................',
      '.....................##..........oo...oo..........ooo.....ooo.......................##......o...o...o.............................................',
      '....P.............##......................C...................C.....###...............C...................C.......................................',
      '##############################LLLLLLLLLLLL######LLLLLLLLLLLLLL######LLLLLLLLLLLLLLLLLL######LLLLLLLLLLLLLL########................................',
      '##############################LLLLLLLLLLLL######LLLLLLLLLLLLLL######LLLLLLLLLLLLLLLLLL######LLLLLLLLLLLLLL########LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL',
      '##################################################################################################################################################'
    ],

    intro: [
      'Welcome to your plot. It is a rectangle.',
      'Run the lap, touch the payout plate, come home, feed a button.',
      'Everything east of the fence is a hologram until you pay for it.'
    ],

    entities: [
      /* ------------------------------- THE PLOT ------------------------- */
      { type: 'deco', kind: 'tree', x: 0.2, y: 10.5 },
      { type: 'deco', kind: 'bush', x: 2.4, y: 12 },
      { type: 'sign', x: 5.1, y: 12, w: 9,
        text: 'YOUR PLOT. Run the lap for cash, then feed a button. The world grows east.' },
      { type: 'deco', kind: 'lamp', x: 16.4, y: 10.5 },
      { type: 'sign', x: 17.4, y: 12, w: 9,
        text: 'THE LAP: three hops, stand on the gold PAYOUT PLATE, drop off the end, do it again.' },
      { type: 'deco', kind: 'bush', x: 20.2, y: 12 },
      { type: 'deco', kind: 'flag', x: 27.5, y: 9 },
      { type: 'text', x: 1, y: 5.4, w: 10, text: 'PLOT 8', size: 1.5, color: '#ffffff', alpha: 0.34, rot: -3 },
      { type: 'text', x: 6, y: 7.2, w: 10, text: 'starter obby - free!', size: 0.5, color: '#ffe9a8', alpha: 0.55, rot: -2 },
      { type: 'sign', x: 28.2, y: 12, w: 8,
        text: 'The lava is not a hologram. The lava is extremely real.' },
      { type: 'deco', kind: 'pipe', x: 29.3, y: 12 },

      /* ------------------------------- PLAZA 2 -------------------------- */
      { type: 'deco', kind: 'girder', x: 42.6, y: 12 },
      { type: 'sign', x: 45.2, y: 12, w: 9,
        text: 'You paid fifty dollars for eight bricks and a view of the lava. LOOK AT THEM.' },
      { type: 'text', x: 31, y: 7.6, w: 10, text: 'PHASE 2', size: 1.05, color: '#ffffff', alpha: 0.20, rot: -2 },

      /* ------------------------------- PLAZA 3 -------------------------- */
      { type: 'deco', kind: 'girder', x: 62.6, y: 12 },
      { type: 'sign', x: 65.1, y: 12, w: 9,
        text: 'DOUBLE JUMP COIL, 250. Yes, you buy the ability to use the thing you bought.' },
      { type: 'text', x: 49, y: 7.6, w: 10, text: 'PHASE 3', size: 1.05, color: '#ffffff', alpha: 0.20, rot: 2 },
      { type: 'text', x: 71, y: 6.4, w: 10, text: 'PHASE 4', size: 1.05, color: '#ffffff', alpha: 0.20, rot: -2 },

      /* ------------------------------- PLAZA 4 -------------------------- */
      { type: 'deco', kind: 'girder', x: 86.6, y: 12 },
      { type: 'sign', x: 89.1, y: 12, w: 9,
        text: 'SPINNERS, 400. You are paying four hundred dollars to have a worse time. This is the genre.' },
      { type: 'text', x: 93, y: 7.2, w: 10, text: 'PHASE 5', size: 1.05, color: '#ffffff', alpha: 0.20, rot: 2 },

      /* ------------------------------- PLAZA 5 -------------------------- */
      { type: 'deco', kind: 'girder', x: 106.6, y: 12 },
      { type: 'deco', kind: 'lamp', x: 111.2, y: 10.5 },
      { type: 'sign', x: 108.2, y: 12, w: 9,
        text: 'DASH SPRINGS smash plastic - there is a wall near the top of THE TOWER with your name on it.' },
      { type: 'text', x: 115, y: 8.2, w: 10, text: 'PHASE 6', size: 1.05, color: '#ffffff', alpha: 0.22, rot: -3 },

      /* ------------------------------- THE SUMMIT ----------------------- */
      { type: 'deco', kind: 'flag', x: 132.4, y: 2 },
      { type: 'deco', kind: 'crystal', x: 133.4, y: 2 },
      { type: 'deco', kind: 'crystal', x: 139.6, y: 2 },
      { type: 'deco', kind: 'lamp', x: 143.2, y: 0.5 },
      { type: 'sign', x: 135.6, y: 2, w: 9,
        text: 'THE GATE, 2000. Or take PRESTIGE for 2.5x income and do the whole plot again. Your call.' },
      { type: 'deco', kind: 'cloud', x: 120, y: 6.5, alpha: 0.75 },
      { type: 'deco', kind: 'cloud', x: 128.5, y: 8.2, alpha: 0.6 },
      { type: 'deco', kind: 'cloud', x: 138.5, y: 7.4, alpha: 0.7 }
    ],

    /* ------------------------------------------------------------------- */
    onLoad: function (RT) {
      S = fresh();
      if (!RT.Tycoon) return;
      RT.Tycoon.start({
        cash: 0,
        hudKey: 'cash',
        coinValue: COIN_CASH,
        buyHold: 0.30,
        items: ITEMS,
        cashpad: { x: 1, y: 12, label: 'THE PLOT' },
        rebirth: { x: 137, y: 2, cost: 2500, mult: 2.5, label: 'PRESTIGE' },
        onBuy: function (item) { onPurchase(item); }
      });
      RT.hud.set('phase', '1 / ' + PHASES);
    },

    onUpdate: function (RT, dt) {
      if (!S) return;
      var p = RT.player, i, pl;

      /* RT.Tycoon glues an invisible FX root onto the player every step, and
       * engine.js refuses to dash while the player overlaps ANY entity. Zero
       * its box: it draws from world coordinates, never from w/h, and it
       * rides the player, so culling can still never reach it. */
      var root = RT.findOne('tycoonroot');
      if (root && (root.w || root.h)) { root.w = 0; root.h = 0; }

      /* a coin is worth COIN_CASH here; engine.js already banked 1 of it */
      var c = RT.coins | 0;
      if (c > S.coins && tyc()) tyc().add((c - S.coins) * (COIN_CASH - 1));
      S.coins = c;

      S.ensureT += dt;
      if (S.ensureT >= 0.25) { S.ensureT = 0; ensureEnts(); }

      if (p.dead) return;
      var tx = (p.x + p.w / 2) / T, ty = (p.y + p.h / 2) / T;

      /* home on the plot: every payout plate re-arms. That is the lap. */
      if (tx < 18 && ty > 10.6) {
        for (i = 0; i < PLATES.length; i++) S.plate[PLATES[i].id] = 0;
      }
      for (i = 0; i < PLATES.length; i++) {
        pl = PLATES[i];
        if (S.plate[pl.id]) continue;
        if (tx < pl.x0 || tx > pl.x1 + 1 || ty < pl.y0 || ty > pl.y1 + 1) continue;
        S.plate[pl.id] = 1;
        payout(pl);
      }

      /* one-shot lines, because a grind needs a voice */
      if (!S.seen.fence && tx > 28.4 && !owned('bridge')) {
        S.seen.fence = 1;
        RT.speech(p.x + 8, p.y - 14, 'nothing there yet', 1.6);
      }
      if (!S.seen.leap && tx > 70.4 && tx < 76 && !p.abilities.doubleJump) {
        S.seen.leap = 1;
        RT.toast('FIVE TILES. BUY THE COIL.', 1.6);
      }
      if (!S.seen.wall && tx > 128.6 && tx < 130.4) {
        S.seen.wall = 1;
        RT.toast('DASH THROUGH IT', 1.4);
      }
      if (!S.seen.rich && tyc() && tyc().cash >= 2000 && !owned('gate')) {
        S.seen.rich = 1;
        RT.toast('YOU CAN AFFORD THE DOOR', 1.8);
      }
    },

    onDeath: function (RT, cause) {
      if (!S) return;
      S.seen.fence = 0;
      if (cause === 'lava') RT.toast('the plot keeps your body. you keep your money.', 1.4);
      else if (cause === 'saw') RT.toast('you paid four hundred dollars for that blade', 1.4);
      else RT.toast('cash is safe. dignity is not.', 1.3);
    },

    onCheckpoint: function (RT) {
      RT.toast('PLOT SECURED', 1.1);
    },

    onWin: function (RT) {
      RT.flash('#fff3c4', 0.35);
      RT.cam.shake(6, 0.45);
      RT.hud.clear('phase');
    },

    /* ---------------------------------------------------------------------
     * back  = the plastic skyline, the plot's graph paper, and blue
     *         holograms of every section you have not bought yet.
     * front = the payout plates, lava heat, drifting studs, a warm haze.
     * ------------------------------------------------------------------- */
    onDraw: function (RT, g, layer) {
      var vw = RT.view.w, vh = RT.view.h;
      var cx = RT.cam.x, cy = RT.cam.y;
      var x0 = cx - vw / 2, x1 = cx + vw / 2;
      var y0 = cy - vh / 2, y1 = cy + vh / 2;
      var t = RT.time, i, j, px, a, it, pl;

      if (layer === 'back') {
        /* --- the sun, low and generous -------------------------------- */
        px = parX(cx, 24 * T, 0.06);
        var sy = cy * 0.10 + 58;
        var gr = g.createRadialGradient(px, sy, 8, px, sy, 190);
        gr.addColorStop(0, 'rgba(255,248,205,0.50)');
        gr.addColorStop(0.45, 'rgba(255,226,140,0.15)');
        gr.addColorStop(1, 'rgba(255,220,130,0)');
        g.fillStyle = gr;
        g.fillRect(px - 200, sy - 200, 400, 400);

        /* --- far plastic city ----------------------------------------- */
        var par = 0.26, sp = 104;
        var i0 = Math.floor((((x0 - 200) - cx * (1 - par)) / par) / sp);
        var i1 = Math.ceil((((x1 + 200) - cx * (1 - par)) / par) / sp);
        if (i1 - i0 > 42) i1 = i0 + 42;
        for (i = i0; i <= i1; i++) {
          px = parX(cx, i * sp, par);
          var pal = h1(i + 12);
          plasticTower(g, px, 13.05 * T, 30 + h1(i + 3) * 26, 70 + h1(i) * 130,
            pal < 0.33 ? '#d94f4f' : (pal < 0.66 ? '#4f8fd9' : '#e8d24a'),
            pal < 0.33 ? '#a83a3a' : (pal < 0.66 ? '#3a6ca8' : '#b39f2f'));
        }
        /* --- a nearer row, greener ------------------------------------ */
        par = 0.52; sp = 78;
        i0 = Math.floor((((x0 - 140) - cx * (1 - par)) / par) / sp);
        i1 = Math.ceil((((x1 + 140) - cx * (1 - par)) / par) / sp);
        if (i1 - i0 > 42) i1 = i0 + 42;
        for (i = i0; i <= i1; i++) {
          if (h1(i + 41) < 0.45) continue;
          px = parX(cx, i * sp, par);
          plasticTower(g, px, 13.2 * T, 24 + h1(i + 7) * 18, 44 + h1(i + 9) * 74, '#7ad17f', '#54a35c');
        }

        /* --- the plot's graph paper ----------------------------------- */
        g.globalAlpha = 0.055;
        g.strokeStyle = '#ffffff';
        g.lineWidth = 1;
        for (px = Math.floor(x0 / (T * 2)) * (T * 2); px < x1 + T * 2; px += T * 2) {
          g.beginPath(); g.moveTo(px, y0 - 8); g.lineTo(px, y1 + 8); g.stroke();
        }
        for (j = Math.floor(y0 / (T * 2)) * (T * 2); j < y1 + T * 2; j += T * 2) {
          g.beginPath(); g.moveTo(x0 - 8, j); g.lineTo(x1 + 8, j); g.stroke();
        }
        g.globalAlpha = 1;

        /* --- the fence at the edge of the free plot -------------------- */
        if (x0 < 31 * T && x1 > 29 * T) {
          g.globalAlpha = 0.45 + 0.2 * Math.sin(t * 2.2);
          g.strokeStyle = '#67e8f9';
          g.lineWidth = 2;
          if (g.setLineDash) g.setLineDash([7, 7]);
          g.beginPath(); g.moveTo(29.9 * T, 4 * T); g.lineTo(29.9 * T, 13 * T); g.stroke();
          if (g.setLineDash) g.setLineDash([]);
          g.globalAlpha = 1;
          RT.drawText(g, 'PLOT BOUNDARY', 29.9 * T, 3.5 * T,
            { size: 9, color: '#bff4ff', align: 'center', alpha: 0.7 });
        }

        /* --- holograms of everything still unbought -------------------- */
        for (i = 0; i < ITEMS.length; i++) {
          it = ITEMS[i];
          if (!it.tiles || it.id === 'gate' || owned(it.id)) continue;
          hologram(g, it.tiles, t, x0, x1, it.color || '#67e8f9');
        }
        /* the gate's "tiles" are removals, so the shutter gets its own art:
         * hazard stripes on the roller door, and the price above it. */
        if (!owned('gate') && x1 > 140 * T && x0 < 146 * T) {
          g.save();
          g.beginPath(); g.rect(143 * T + 2, 2, T - 4, 3 * T - 4); g.clip();
          g.globalAlpha = 0.30 + 0.16 * Math.sin(t * 2.6);
          g.fillStyle = '#ffd23f';
          g.fillRect(143 * T, 0, T, 3 * T);
          g.globalAlpha = 0.5;
          g.strokeStyle = '#2b2205';
          g.lineWidth = 6;
          for (j = -3; j < 5; j++) {
            g.beginPath();
            g.moveTo(143 * T - 8, j * 16 + ((t * 6) % 16));
            g.lineTo(144 * T + 8, j * 16 + 24 + ((t * 6) % 16));
            g.stroke();
          }
          g.restore();
          RT.drawText(g, '$2000', 143.5 * T, -0.35 * T,
            { size: 11, color: '#fff4c4', align: 'center', stroke: 'rgba(0,0,0,0.6)', strokeWidth: 3 });
        }
        return;
      }

      /* ------------------------------ front ----------------------------- */

      /* payout plates: gold on the floor, humming while they are armed */
      for (i = 0; i < PLATES.length; i++) {
        pl = PLATES[i];
        var bx = pl.x0 * T, bw = (pl.x1 - pl.x0 + 1) * T;
        if (bx + bw < x0 - 32 || bx > x1 + 32) continue;
        var by = (pl.y1 + 1) * T;
        var armed = !(S && S.plate[pl.id]);
        a = armed ? (0.55 + 0.25 * Math.sin(t * 3.4 + i)) : 0.16;
        g.globalAlpha = a;
        g.fillStyle = '#ffd23f';
        g.fillRect(bx + 2, by - 5, bw - 4, 4);
        g.globalAlpha = a * 0.45;
        g.fillStyle = '#fff4c4';
        g.fillRect(bx + 2, by - 5, bw - 4, 1.6);
        if (armed) {
          g.globalAlpha = 0.16 + 0.10 * Math.sin(t * 3.4 + i);
          var pg = g.createLinearGradient(0, by - 44, 0, by - 4);
          pg.addColorStop(0, 'rgba(255,210,63,0)');
          pg.addColorStop(1, 'rgba(255,210,63,0.9)');
          g.fillStyle = pg;
          g.fillRect(bx + 3, by - 44, bw - 6, 40);
        }
        g.globalAlpha = 1;
        RT.drawText(g, '$' + pl.base, bx + bw / 2, by - 13,
          { size: 9, color: armed ? '#fff4c4' : '#8a8f99', align: 'center', alpha: armed ? 0.95 : 0.4 });
      }

      /* lava heat, only over the lava */
      for (i = 0; i < LAVA.length; i++) {
        var lx = LAVA[i][0] * T, lw = (LAVA[i][1] - LAVA[i][0] + 1) * T;
        if (lx + lw < x0 - 32 || lx > x1 + 32) continue;
        var ly = (i === 4 ? 14 : 13) * T;
        for (j = 0; j < 3; j++) {
          a = 0.055 + 0.028 * Math.sin(t * 1.9 + j * 1.2 + i);
          g.fillStyle = 'rgba(255,150,60,' + a.toFixed(3) + ')';
          g.fillRect(Math.max(lx, x0 - 20), ly - 12 - j * 13 + Math.sin(t * 1.1 + j) * 3,
            Math.min(lw, vw + 40), 11);
        }
      }

      /* drifting studs, the confetti of a tycoon */
      for (i = 0; i < 28; i++) {
        var life = ((t * (0.05 + h1(i) * 0.05) + h1(i + 33)) % 1);
        var sx = x0 + ((h1(i + 5) * 1.4 + life * 0.25) % 1) * (vw + 60) - 30;
        var syy = y0 + ((h1(i + 77) + life) % 1) * (vh + 40) - 20;
        g.globalAlpha = 0.10 + 0.16 * Math.sin(life * Math.PI);
        stud(g, sx, syy, 3 + h1(i + 91) * 2.5, '#ffffff', '#cfe4f5');
      }
      g.globalAlpha = 1;

      /* a warm haze along the bottom of the screen */
      var hz = g.createLinearGradient(0, y1 - 58, 0, y1 + 2);
      hz.addColorStop(0, 'rgba(255,214,150,0)');
      hz.addColorStop(1, 'rgba(255,206,130,0.16)');
      g.fillStyle = hz;
      g.fillRect(x0 - 8, y1 - 58, vw + 16, 60);
    }
  });
})();
