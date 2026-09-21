/* ==========================================================================
 * RAGE TRIALS - Trial 4: TRUST ISSUES
 * --------------------------------------------------------------------------
 * An overgrown temple where half the masonry is a painting of masonry.
 * The teaching order is strict, and the first lie is free:
 *
 *   I.   THE FREE LESSON   x0-15   two stones over SOLID GROUND, one is fake
 *   II.  THE FIVE SISTERS  x16-35  a row of five, two fake, a catch under each
 *   III. TRUST THE BROKEN  x36-46  the only stone that holds is the cracked one
 *   IV.  NO FLOOR          x47-56  crumble + fake over a genuine abyss
 *   V.   THE FALSE VAULT   x57-72  a ceiling of fakes, three springs, one window
 *   VI.  ONE HONEST STONE  x74-79  a fake bridge with the truth in the middle
 *   VII. FOLLOW THE GOLD   x79-85  three choices, the gold marks the real one
 *
 * Geometry obeys CONTRACT.md section 4 everywhere:
 *   - every rise is 2 tiles (never the 3-tile limit) except the vault springs,
 *     which throw you 7.5 tiles through the fake ceiling;
 *   - the widest gap is 3 tiles (comfortable), never the 4-tile hard limit;
 *   - the two fakes in section II sit directly above wide REAL ledges, so a
 *     player who trusts them lands exactly where a player who read them walks.
 *     The lesson lands; the run does not. Same trick in IV and VII.
 *   - the only 4-tall wall in the level is the terrace at x13-15, which is
 *     deliberately unclimbable so the tutorial pair cannot be skipped.
 *   - a full jump lifts the HEAD 4.05 tiles, so nothing solid is ever placed
 *     3 or 4 rows above a takeoff surface inside the finale tower: the real
 *     ledges alternate sides and never stack, so no climb can bonk itself out.
 *   - the vault (V) is sealed by a wall at x73: you cannot walk off its floor
 *     into the abyss, the only exit is up through the lie in the ceiling.
 *
 * 86 x 16 tiles. FIVE checkpoints (x14, x34, x45, x59, x72). DESIGN.md's
 * level-4 paragraph says "two", but its global rule for levels 4-7 is one per
 * ~20 tiles and this level runs 86 tiles because it has seven lessons to
 * teach; five puts one in front of every section that can actually kill.
 * ========================================================================== */
(function () {
  var RT = window.RT;
  if (!RT || !RT.registerLevel) return;

  var T = 32;

  /* Deterministic scenery noise. NEVER RT.random() - that is the gameplay RNG
   * and a level must not disturb a seeded run. */
  function n1(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* broken columns: [tileX, floorTileY, tileHeight, style] */
  var COLUMNS = [
    [1.1, 13, 5.2, 0], [4.4, 13, 3.4, 1], [8.3, 13, 6.1, 0], [11.4, 13, 2.6, 1],
    [17.6, 14, 8.0, 0], [24.3, 14, 5.4, 1], [31.7, 14, 9.2, 0], [38.4, 14, 6.6, 1],
    [43.9, 14, 4.1, 0],
    [57.6, 13, 4.4, 1], [60.4, 13, 4.3, 0], [63.6, 13, 4.2, 1],
    [68.5, 13, 4.3, 0], [71.4, 13, 4.4, 1]
  ];

  /* dust shafts: [tileX, topTileY, botTileY, tileWidth, alpha] */
  var SHAFTS = [
    [5.0, 0, 13, 2.4, 0.14], [19.0, 0, 13, 3.2, 0.11], [33.5, 0, 13, 2.6, 0.12],
    [49.0, 0, 16, 3.0, 0.10], [65.5, 3, 13, 2.8, 0.15], [82.0, 0, 9, 3.4, 0.16]
  ];

  /* the two stretches with no floor at all: [tileX0, tileX1) */
  var ABYSS = [[46, 57], [74, 86]];

  /* hanging vines: [tileX, tileY, lengthPx, phase] */
  var VINES = [
    [13.2, 13, 52, 0.0], [15.8, 9, 74, 1.2], [21.2, 12, 58, 2.1], [25.6, 12, 46, 0.6],
    [29.3, 12, 66, 3.0], [33.7, 12, 40, 1.7], [44.2, 10, 84, 2.4], [46.7, 10, 62, 0.4],
    [51.1, 12, 70, 1.1], [55.7, 12, 54, 2.8], [61.2, 10, 48, 0.9], [69.6, 10, 76, 2.2],
    [76.4, 10, 58, 1.5], [84.4, 9, 66, 0.2], [78.6, 7, 70, 2.6]
  ];

  /* foreground fronds: [tileX, tileY, scale, seed] */
  var FRONDS = [
    [2.4, 12.6, 1.00, 0], [10.9, 12.6, 0.85, 1], [20.5, 13.0, 1.15, 2],
    [36.8, 13.0, 0.90, 3], [58.3, 12.8, 1.05, 4], [70.8, 12.8, 0.95, 5],
    [78.2, 7.0, 0.80, 6]
  ];

  /* ---------------------------------------------------------------------
   * Three moods: green daylight on the approach, a torchlit vault in the
   * middle, and the sun breaking over the tower at the end.
   * ------------------------------------------------------------------- */
  var SANCTUM = {
    sky: [[0, '#08110c'], [0.42, '#15231a'], [0.78, '#27381f'], [1, '#41512f']],
    parallax: [
      { kind: 'ruins', color: '#2c3627', color2: '#1d2519', y: 0.96, speed: 0.18, scale: 0.44 },
      { kind: 'ruins', color: '#191f14', color2: '#11160e', y: 1.10, speed: 0.44, scale: 0.30 }
    ],
    ambient: 'fireflies',
    fog: { color: '#2f6a2c', alpha: 0.26 },
    tile: { top: '#7b8a62', side: '#4c5442', dark: '#242a1d', rim: '#b8ce96', accent: '#5e6a4c' },
    spike: { base: '#8b9a7c', tip: '#dbe6c6' },
    vignette: 0.54
  };

  var DAWNBREAK = {
    sky: [[0, '#3a5a46'], [0.38, '#88a56c'], [0.70, '#d9d08d'], [1, '#f8ecb6']],
    parallax: [
      { kind: 'clouds', color: '#f4e9c2', y: 0.38, speed: 0.045, scale: 0.44, alpha: 0.6 },
      { kind: 'mountains', color: '#48604a', y: 0.82, speed: 0.14, scale: 0.32 },
      { kind: 'ruins', color: '#7d8761', color2: '#5d6647', y: 1.02, speed: 0.30, scale: 0.42 }
    ],
    ambient: 'dust',
    fog: { color: '#eadfa2', alpha: 0.13 },
    tile: { top: '#a9b584', side: '#6f775d', dark: '#3b4130', rim: '#ecf7c7', accent: '#838d67' },
    spike: { base: '#9aa88a', tip: '#e2eccd' },
    vignette: 0.30
  };

  /* ---------------------------------------------------------------------
   * Art helpers. No shadowBlur, no allocation beyond the gradients of the
   * handful of items actually on screen.
   * ------------------------------------------------------------------- */
  function column(g, px, baseY, hPx, style, t) {
    var w = style ? 19 : 25;
    var x = px - w / 2;
    var topY = baseY - hPx;
    var f, d;
    g.fillStyle = style ? 'rgba(52,62,44,0.78)' : 'rgba(62,73,52,0.80)';
    g.fillRect(x, topY, w, hPx);
    g.fillStyle = 'rgba(24,30,20,0.32)';
    for (f = 1; f < 4; f++) g.fillRect(x + (w / 4) * f - 1, topY, 2, hPx);
    g.fillStyle = 'rgba(178,200,140,0.20)';
    g.fillRect(x + 1.5, topY, 2.5, hPx);
    g.fillStyle = 'rgba(20,26,16,0.26)';
    for (d = topY + 26; d < baseY - 4; d += 26) g.fillRect(x - 1, d, w + 2, 2);
    /* the broken crown */
    g.fillStyle = style ? 'rgba(66,78,56,0.80)' : 'rgba(76,89,64,0.82)';
    g.beginPath();
    g.moveTo(x - 3, topY + 8);
    g.lineTo(x + w * 0.22, topY + (style ? 1 : 6));
    g.lineTo(x + w * 0.52, topY + (style ? 9 : 0));
    g.lineTo(x + w * 0.80, topY + (style ? 3 : 7));
    g.lineTo(x + w + 3, topY + 10);
    g.lineTo(x + w + 3, topY + 15);
    g.lineTo(x - 3, topY + 15);
    g.closePath();
    g.fill();
    /* moss climbing the base, and a slow breath of lichen light */
    var m = 22 + n1(px) * 10;
    g.fillStyle = 'rgba(64,112,52,0.30)';
    g.fillRect(x - 2, baseY - m, w + 4, m);
    g.fillStyle = 'rgba(150,200,110,' + (0.05 + 0.03 * Math.sin(t * 0.7 + px * 0.05)).toFixed(4) + ')';
    g.fillRect(x, topY + 14, w, hPx - 14);
  }

  function shaft(g, px, topY, botY, wPx, alpha, t) {
    var sway = Math.sin(t * 0.35 + px * 0.02) * 9;
    var grad = g.createLinearGradient(0, topY, 0, botY);
    grad.addColorStop(0, 'rgba(226,246,168,' + alpha + ')');
    grad.addColorStop(0.55, 'rgba(198,232,140,' + alpha * 0.45 + ')');
    grad.addColorStop(1, 'rgba(160,200,110,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(px - wPx * 0.22 + sway, topY);
    g.lineTo(px + wPx * 0.22 + sway, topY);
    g.lineTo(px + wPx * 0.72, botY);
    g.lineTo(px - wPx * 0.72, botY);
    g.closePath();
    g.fill();
  }

  function vine(g, px, py, len, phase, t, front) {
    var seg = 9, i, x = px, y = py, f, lx, ly, s;
    g.strokeStyle = front ? 'rgba(26,48,22,0.85)' : 'rgba(46,86,40,0.62)';
    g.lineWidth = front ? 3 : 2.2;
    g.beginPath();
    g.moveTo(x, y);
    for (i = 1; i <= seg; i++) {
      f = i / seg;
      y = py + len * f;
      x = px + Math.sin(t * 0.8 + phase + f * 2.4) * (5 + len * 0.05) * f;
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = front ? 'rgba(34,64,28,0.9)' : 'rgba(58,104,46,0.55)';
    for (i = 2; i <= seg; i += 2) {
      f = i / seg;
      lx = px + Math.sin(t * 0.8 + phase + f * 2.4) * (5 + len * 0.05) * f;
      ly = py + len * f;
      s = front ? 5 : 3.6;
      g.beginPath();
      g.ellipse(lx + (i % 4 === 0 ? s : -s), ly, s * 1.25, s * 0.62, (i % 4 === 0 ? -0.5 : 0.5), 0, Math.PI * 2);
      g.fill();
    }
  }

  function frond(g, px, py, scale, seed, t) {
    var b, a, L;
    g.save();
    g.translate(px, py);
    g.rotate(Math.sin(t * 0.55 + seed) * 0.10);
    g.scale(scale, scale);
    g.fillStyle = 'rgba(15,32,14,0.88)';
    for (b = 0; b < 5; b++) {
      a = -1.95 + b * 0.42 + n1(seed * 7 + b) * 0.1;
      L = 62 + n1(seed * 3 + b) * 40;
      g.save();
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(L * 0.55, -13, L, -2);
      g.quadraticCurveTo(L * 0.55, 8, 0, 7);
      g.closePath();
      g.fill();
      g.restore();
    }
    g.restore();
  }

  /* one-time mutterings, fired by how far right the player has ever been */
  var LINES = [
    [9, -2, 'free of charge'],
    [24, -2, 'two of the five'],
    [40, -2, 'cracks are honest'],
    [50, -3, 'no floor'],
    [66, -2, 'look up'],
    [76, -2, 'the middle'],
    [82, -2, 'follow the gold']
  ];

  /* Level hooks are invoked by engine.js as bare calls (RT.safe -> fn(a,b,c)),
   * so `this` is not the level object. Run state lives here instead. */
  var run = { said: 0, quip: 0, maxTx: 0 };

  var DEATH_QUIPS = [
    'It looked so solid.',
    'The temple disagrees.',
    'Darker top. No highlight. Next time.',
    'A painting of stone is still just paint.',
    'That one was a rumour.',
    'Cracked holds. Pretty does not.'
  ];

  RT.registerLevel(4, {
    name: 'TRUST ISSUES',
    subtitle: 'Fake and real platforms',
    theme: 'ruins',
    music: 'ruins',

    themeZones: [
      { x0: 56.5, x1: 73.5, theme: SANCTUM },
      { x0: 73.5, x1: 999, theme: DAWNBREAK }
    ],

    intro: [
      'HALF OF THIS TEMPLE IS A PAINTING OF A TEMPLE.',
      'A fake stone has a darker top and no bright rim. The first one is free.'
    ],

    /*        0         1         2         3         4         5         6         7         8
     *        0123456789012345678901234567890123456789012345678901234567890123456789012345678901234 5 */
    tiles: [
      '......................................................................................',
      '......................................................................................',
      '......................................................................................',
      '......................................................................................',
      '......................................................................................',
      '.............................................................................FF.......',
      '...............................................................................Go.....',
      '..............................................................................####.FF.',
      '..............C....o.......o......Co....o....C..........................C...........o.',
      '.............###..##..FF..##..FF..##.FFKKKFF###.KK..FF.......###FFFFF####.FF##FF....##',
      '..........o..###.......o.......o....................o....................#.......o....',
      '.......FF.##.###.....#####...#####.................###KK.................#.....#####..',
      '..P..........###...........................................C.....o.o.....#............',
      '################^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^...........#####S###S###S###............',
      '##############################################...........#################............',
      '##############################################...........#################............'
    ],

    entities: [
      /* --- the signs do the talking ---------------------------------- */
      { type: 'sign', x: 5, y: 12, text: 'TWO STONES AHEAD. One of them remembers how to hold. Falling here is free.' },
      { type: 'sign', x: 13, y: 8, text: 'Five sisters. Two are paintings of sisters. Gold never rests on a painting.' },
      { type: 'sign', x: 33, y: 10, text: 'The cracked one is the only honest stone left. Do not stop to admire it.' },
      { type: 'sign', x: 46, y: 8, text: "Mind the floor. There isn't one." },
      { type: 'sign', x: 58, y: 12, text: 'THE VAULT. Three springs, one window. A bruised head is free; a missed landing is not.' },
      { type: 'sign', x: 71, y: 8, text: 'One stone in that bridge is honest, and it is not at either end.' },
      { type: 'sign', x: 79, y: 10, text: 'Gold only ever rests on stone that is real. Follow it home.' },

      /* --- chapter plates -------------------------------------------- */
      { type: 'text', x: 6, y: 6, text: 'I. THE FREE LESSON', size: 0.56, color: '#e9f2c6', alpha: 0.66 },
      { type: 'text', x: 26, y: 5, text: 'II. THE FIVE SISTERS', size: 0.56, color: '#e9f2c6', alpha: 0.66 },
      { type: 'text', x: 40, y: 5, text: 'III. TRUST THE BROKEN', size: 0.56, color: '#f2e2b0', alpha: 0.70 },
      { type: 'text', x: 52, y: 6, text: 'IV. NO FLOOR', size: 0.56, color: '#f2c9a6', alpha: 0.70 },
      { type: 'text', x: 66, y: 5, text: 'V. THE FALSE VAULT', size: 0.56, color: '#bfe8a8', alpha: 0.74, wave: 1.2 },
      { type: 'text', x: 74, y: 6, text: 'VI. ONE HONEST STONE', size: 0.56, color: '#f6efc0', alpha: 0.72 },
      { type: 'text', x: 81, y: 3, text: 'VII. FOLLOW THE GOLD', size: 0.58, color: '#ffe9a8', alpha: 0.80, wave: 1.6 },

      /* --- decoration ------------------------------------------------- */
      { type: 'deco', kind: 'torch', x: 0, y: 12 },
      { type: 'deco', kind: 'torch', x: 9, y: 12 },
      { type: 'deco', kind: 'torch', x: 15, y: 8 },
      { type: 'deco', kind: 'torch', x: 57, y: 12 },
      { type: 'deco', kind: 'torch', x: 60, y: 12 },
      { type: 'deco', kind: 'torch', x: 69, y: 12 },
      { type: 'deco', kind: 'torch', x: 72, y: 12 },
      { type: 'deco', kind: 'bush', x: 3, y: 12 },
      { type: 'deco', kind: 'bush', x: 7, y: 12 },
      { type: 'deco', kind: 'bush', x: 12, y: 12 },
      { type: 'deco', kind: 'rock', x: 1, y: 12 },
      { type: 'deco', kind: 'rock', x: 11, y: 12, flip: true },
      { type: 'deco', kind: 'rock', x: 44, y: 8, scale: 0.7 },
      { type: 'deco', kind: 'skull', x: 21, y: 12 },
      { type: 'deco', kind: 'skull', x: 28, y: 12, flip: true },
      { type: 'deco', kind: 'skull', x: 38, y: 12 },
      { type: 'deco', kind: 'skull', x: 43, y: 12, flip: true },
      { type: 'deco', kind: 'crystal', x: 63, y: 12 },
      { type: 'deco', kind: 'crystal', x: 68, y: 12, flip: true },
      { type: 'deco', kind: 'flag', x: 82, y: 10 },
      { type: 'deco', kind: 'cloud', x: 24, y: 1, alpha: 0.5 },
      { type: 'deco', kind: 'cloud', x: 50, y: 0, alpha: 0.4 },
      { type: 'deco', kind: 'cloud', x: 78, y: 0, alpha: 0.55 }
    ],

    /* ------------------------------------------------------------------- */
    onLoad: function (RT) {
      run.said = 0;
      run.quip = 0;
      run.maxTx = 0;
      if (RT.hud && RT.hud.set) RT.hud.set('trust', 'TRUST: nothing');
    },

    onUpdate: function (RT, dt) {
      var p = RT.player;
      if (!p || p.dead) return;
      var tx = (p.x + p.w / 2) / T;
      if (tx > run.maxTx) run.maxTx = tx;
      while (run.said < LINES.length && run.maxTx >= LINES[run.said][0]) {
        var L = LINES[run.said];
        if (RT.speech) RT.speech(p.x + p.w / 2, p.y + L[1] * T, L[2], 1.6);
        run.said++;
      }
    },

    onCheckpoint: function (RT, cp) {
      var names = ['the terrace', 'the fifth sister', 'the cracked sister', 'the vault floor', 'the vault roof'];
      var tx = cp ? cp.tx : 0;
      var i = tx > 70 ? 4 : (tx > 55 ? 3 : (tx > 40 ? 2 : (tx > 30 ? 1 : 0)));
      if (RT.hud && RT.hud.set) RT.hud.set('trust', 'TRUST: ' + names[i]);
    },

    onDeath: function (RT, cause) {
      if (RT.toast) RT.toast(DEATH_QUIPS[run.quip % DEATH_QUIPS.length], 1.5);
      run.quip++;
    },

    onWin: function (RT) {
      if (RT.banner) RT.banner(['YOU LEARNED TO LOOK', 'trust issues: earned'], 2.2);
      if (RT.hud && RT.hud.clear) RT.hud.clear('trust');
    },

    /* ------------------------------------------------------------------- *
     * Bespoke art: 'back' paints the ruin behind the tiles, 'front' paints
     * the jungle that has grown over the front of it.
     * ------------------------------------------------------------------- */
    onDraw: function (RT, g, layer) {
      var cam = RT.cam, view = RT.view;
      if (!cam || !view) return;
      var t = RT.frame / 60;
      var vx0 = cam.x - view.w / 2 - 80, vx1 = cam.x + view.w / 2 + 80;
      var i, k, grad;

      if (layer === 'back') {
        /* --- the two bottomless stretches ---------------------------- */
        for (i = 0; i < ABYSS.length; i++) {
          var ax = ABYSS[i][0] * T, aw = (ABYSS[i][1] - ABYSS[i][0]) * T;
          if (ax > vx1 || ax + aw < vx0) continue;
          grad = g.createLinearGradient(0, 11.4 * T, 0, 19 * T);
          grad.addColorStop(0, 'rgba(10,18,12,0)');
          grad.addColorStop(0.35, 'rgba(7,13,9,0.72)');
          grad.addColorStop(1, 'rgba(2,4,3,0.98)');
          g.fillStyle = grad;
          g.fillRect(ax - 6, 11.4 * T, aw + 12, 8 * T);
          g.fillStyle = 'rgba(150,180,120,0.16)';
          for (k = 0; k < 14; k++) {
            var fx = ax + n1(i * 31 + k) * aw;
            var fy = 12 * T + ((n1(i * 17 + k) * 700 + t * (40 + n1(k) * 90)) % (7 * T));
            g.fillRect(fx, fy, 1.6, 6 + n1(k * 5) * 10);
          }
        }

        /* --- the ruined colonnade ------------------------------------ */
        for (i = 0; i < COLUMNS.length; i++) {
          var c = COLUMNS[i], cx = c[0] * T;
          if (cx < vx0 - 40 || cx > vx1 + 40) continue;
          column(g, cx, c[1] * T, c[2] * T, c[3], t);
        }

        /* --- the ghost of the great facade behind the final tower ----- */
        if (vx1 > 74 * T && vx0 < 86 * T) {
          g.fillStyle = 'rgba(96,110,78,0.30)';
          g.beginPath();
          g.moveTo(74.5 * T, 10.4 * T);
          g.lineTo(80.0 * T, -1.2 * T);
          g.lineTo(85.8 * T, 10.4 * T);
          g.closePath();
          g.fill();
          g.fillStyle = 'rgba(70,82,58,0.30)';
          for (i = 0; i < 5; i++) g.fillRect((75.6 + i * 2.1) * T, 4.2 * T, 12, 6.2 * T);
        }

        /* --- vines behind the stone ---------------------------------- */
        for (i = 0; i < VINES.length; i++) {
          var v = VINES[i], vxp = v[0] * T;
          if (vxp < vx0 || vxp > vx1) continue;
          vine(g, vxp, v[1] * T, v[2], v[3], t, false);
        }

        /* --- shafts of green daylight -------------------------------- */
        for (i = 0; i < SHAFTS.length; i++) {
          var s = SHAFTS[i], sx = s[0] * T;
          if (sx < vx0 - 80 || sx > vx1 + 80) continue;
          shaft(g, sx, s[1] * T, s[2] * T, s[3] * T, s[4], t);
        }
        return;
      }

      /* ---------------- front ---------------------------------------- */
      grad = g.createLinearGradient(0, 11.2 * T, 0, 15.4 * T);
      grad.addColorStop(0, 'rgba(84,150,72,0)');
      grad.addColorStop(0.6, 'rgba(78,140,68,0.16)');
      grad.addColorStop(1, 'rgba(56,104,50,0.30)');
      g.fillStyle = grad;
      g.fillRect(vx0, 11.2 * T, vx1 - vx0, 4.2 * T);

      for (i = 0; i < FRONDS.length; i++) {
        var f2 = FRONDS[i], fx2 = f2[0] * T;
        if (fx2 < vx0 - 120 || fx2 > vx1 + 120) continue;
        frond(g, fx2, f2[1] * T, f2[2], f2[3], t);
      }

      /* two heavy vine curtains that FRAME the vault window rather than
       * hide it - the fake ceiling must still be readable */
      if (vx1 > 62 * T && vx0 < 70 * T) {
        vine(g, 63.0 * T, 8.6 * T, 96, 0.7, t, true);
        vine(g, 69.2 * T, 8.6 * T, 88, 2.3, t, true);
      }
    }
  });
})();
