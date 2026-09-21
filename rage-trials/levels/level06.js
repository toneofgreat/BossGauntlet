/* =============================================================================
 * RAGE TRIALS - LEVEL 6 : SIX CROWNS
 * -----------------------------------------------------------------------------
 * Six homage sections, in the order docs/research-mario.md ranks them, fused
 * into one 230-tile stage. Every name here is ours; the levels they salute are
 * named only in this comment.
 *
 *   I.   THE GALE          cols   0- 37   springs + wind + the looping pipe
 *   II.  THE IRON DECK     cols  38- 77   airship: flame jets, artillery, lava
 *   III. THE THIN AIR      cols  78-115   a balloon over a world with no floor
 *   IV.  ONE TOUCH         cols 116-151   flip-floor, electric maze, the duel
 *   V.   THE CROWN ROAD    cols 152-191   everything on the beat, over the void
 *   VI.  THE DARKER SIDE   cols 192-229   the endurance climb to the summit
 *
 * Built against CONTRACT.md s4 physics: a jump clears 3 tiles, a full-run gap
 * tops out at 4, a spring throws you 8. Nothing here asks for more.
 * ===========================================================================*/
(function () {
  var RT = window.RT;
  if (!RT || typeof RT.registerLevel !== 'function') return;

  /* ---- section table: one row per crown --------------------------------- */
  var SECTIONS = [
    { x0:   0, x1:  38, n: 'I',   title: 'THE GALE',        music: 'mario1',     tint: '#5c94fc' },
    { x0:  38, x1:  78, n: 'II',  title: 'THE IRON DECK',   music: 'mario3',     tint: '#ffb45c' },
    { x0:  78, x1: 116, n: 'III', title: 'THE THIN AIR',    music: 'mario2',     tint: '#9fe0ff' },
    { x0: 116, x1: 152, n: 'IV',  title: 'ONE TOUCH',       music: 'void',       tint: '#00ffe0' },
    { x0: 152, x1: 192, n: 'V',   title: 'THE CROWN ROAD',  music: 'factory',    tint: '#ff4fa0' },
    { x0: 192, x1: 230, n: 'VI',  title: 'THE DARKER SIDE', music: 'apocalypse', tint: '#ff8a3c' }
  ];
  var BANNERS = [
    ['CROWN I - THE GALE', 'the spring jumps. you only steer.'],
    ['CROWN II - THE IRON DECK', 'the deck is on fire and moving.'],
    ['CROWN III - THE THIN AIR', 'there is no floor. there never was.'],
    ['CROWN IV - ONE TOUCH', 'one touch and you start this crown again.'],
    ['CROWN V - THE CROWN ROAD', 'listen. everything here is on the beat.'],
    ['CROWN VI - THE DARKER SIDE', 'no more crowns. only the climb.']
  ];

  function sectionAt(tx) {
    for (var i = SECTIONS.length - 1; i >= 0; i--) if (tx >= SECTIONS[i].x0) return i;
    return 0;
  }

  /* ---- small procedural art helpers ------------------------------------- */
  function crown(g, cx, cy, s, fill, rim) {
    g.save();
    g.translate(cx, cy);
    g.scale(s, s);
    g.beginPath();
    g.moveTo(-10, 6); g.lineTo(-12, -6); g.lineTo(-6, -1); g.lineTo(0, -9);
    g.lineTo(6, -1); g.lineTo(12, -6); g.lineTo(10, 6);
    g.closePath();
    g.fillStyle = fill; g.fill();
    g.strokeStyle = rim || 'rgba(0,0,0,0.45)'; g.lineWidth = 1.4; g.stroke();
    g.beginPath(); g.moveTo(-10, 7.5); g.lineTo(10, 7.5);
    g.strokeStyle = fill; g.lineWidth = 2.4; g.stroke();
    g.restore();
  }
  function hazy(g, x, y, w, h, col, a) {
    g.save(); g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, w, h); g.restore();
  }
  /* stable pseudo-noise so the backdrops never shimmer between frames */
  function nz(i) { var s = Math.sin(i * 12.9898) * 43758.5453; return s - Math.floor(s); }

  RT.registerLevel(6, {
    name: 'SIX CROWNS',
    subtitle: 'Six of the hardest, welded into one',
    theme: 'smb1',
    music: 'mario1',
    themeZones: [
      { x0:   0, x1:  38, theme: 'smb1'    },
      { x0:  38, x1:  78, theme: 'smb3'    },
      { x0:  78, x1: 116, theme: 'smw'     },
      { x0: 116, x1: 152, theme: 'galaxy'  },
      { x0: 152, x1: 192, theme: 'sm3dw'   },
      { x0: 192, x1: 230, theme: 'odyssey' }
    ],
    intro: [
      'SIX CROWNS.',
      'Six legendary stages, welded end to end.',
      'Take one crown at a time.'
    ],

    /* 230 x 16. Section boundaries at 38 / 78 / 116 / 152 / 192. */
    tiles: [
      '........................................................................................................#.............................................................................................................................',  // 00
      '........................................................................................................#.............................................................................................................................',  // 01
      '........................................................................................................#.............................................................................................................................',  // 02
      '..........oo........oo........oo........................................................................#......................................................................................................................ooC..G.',  // 03
      '.........o.........o.........o..........................................................................#.....................................................................................................................########',  // 04
      '............o.........o.........o.......................................................................#.....................................................................................................................########',  // 05
      '..........................................................................................o..o........................................................................................................................................',  // 06
      '........o.........o.........o....o......................................................o.......o.....o..o........................................................................................................o.o..o..o...........',  // 07
      '.............o.........o..............................................................o..#.........o.......o......................................................................................................----....##..........',  // 08
      '.........................................................................................#....#.........#....o..................................................................................................o.....................',  // 09
      '....o.......................................oo.......o..........o..o..o.............o#...#....#.........#......o.................................o..................................o.o........................----...................',  // 10
      '..P.......................SS........C...oo......o........o.o..............o.oC.......#...#.#..#.....#...#.........C......!..o.o..!.o.o...o.o.o......oooC.......o....o....o.....o...........o..C.......o..o............................',  // 11
      '######S......###S......#####.....###########..######...#######..........###########..#...#.#..#..#..#...#.......###########NNNNN##MMMMM#########...###########...##...##...##.....########..########..........###.....................',  // 12
      '#######......####......#####.....###########..######...#######LLLLLLLLLL###########..#...#.#..#..#..#...#.......###########.....##.....#########...#########.................................#######..........###.....................',  // 13
      '#######......####......#####.....###########LL######LLL######.LLLLLLLLLL###########..#...#.#..#..#..#...#.......###########.....##.....#########...#########.................................###....LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL',  // 14
      '#######......####......#####.....###########LL######LLL######.LLLLLLLLLL###########..#...#.#..#..#..#...#.......###########.....##.....#########...#########.................................###....LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL',  // 15    ],
    ],

    entities: [
      /* ===================== I. THE GALE  (0-37) ======================== */
      { type: 'wind', x: 0, y: 2, w: 38, h: 12, fx: 240, gust: 5.4, color: '#ffffff' },
      { type: 'sign', x: 1, y: 11, w: 7,
        text: 'I. THE GALE. The spring does the jumping - you only steer. The wind lies about how far.' },
      { type: 'text', x: 0, y: 7, w: 8, h: 2, text: 'I', size: 1.6, color: '#fff3c4', alpha: 0.16, outline: false, shadow: false },
      { type: 'deco', x: 4, y: 10, kind: 'flag' },
      { type: 'deco', x: 34, y: 10, kind: 'flag' },
      { type: 'deco', x: 14, y: 11, kind: 'bush' },
      { type: 'deco', x: 35, y: 11, kind: 'bush' },
      /* the Lost Levels joke: a mushroom that is not on your side */
      { type: 'mushroom', x: 19, y: 9, poison: true },
      { type: 'flyer', x: 18, y: 11, path: [[18, 11], [22, 11]], speed: 1.6, color: '#cfe4ff' },
      /* two fire bars guarding the third pit */
      { type: 'saw', x: 29, y: 11.4, path: [[29, 11.4], [29, 13.6]], speed: 2.2, r: 0.8 },
      { type: 'saw', x: 31, y: 13.6, path: [[31, 13.6], [31, 11.4]], speed: 2.2, r: 0.8 },
      /* the wrong pipe: falling the last pit is a tax, not a death */
      { type: 'portal', x: 28, y: 14, w: 5, h: 2, to: [24, 11], color: '#3ad84c' },
      { type: 'deco', x: 30, y: 15, kind: 'pipe' },
      { type: 'sign', x: 24, y: 11, w: 8,
        text: 'Miss the last spring and the pipe puts you back here. It always has.' },

      /* ===================== II. THE IRON DECK  (38-77) ================= */
      { type: 'sign', x: 39, y: 11, w: 7,
        text: 'II. THE IRON DECK. Keep a deck under you. The deck does not care whether you do.' },
      { type: 'text', x: 40, y: 7, w: 8, h: 2, text: 'II', size: 1.6, color: '#ffd9a0', alpha: 0.16, outline: false, shadow: false },
      { type: 'deco', x: 41, y: 11, kind: 'girder' },
      { type: 'deco', x: 59, y: 11, kind: 'girder' },
      { type: 'deco', x: 76, y: 11, kind: 'pipe' },
      { type: 'trapspike', x: 41, y: 11, dir: 'up', trigger: 'near', near: 1.2, delay: 0.45, retract: 1.2 },
      { type: 'laser', x: 49, y: 8, h: 4, on: 1.0, off: 1.6, phase: 0.3, color: '#ff9a3c' },
      /* the mortar over the second gap: jump between the drops */
      { type: 'cannon', x: 53, y: 7, dir: 'down', every: 2.4, speed: 250, kind: 'rock' },
      { type: 'thwomp', x: 57, y: 8, w: 2, h: 2, triggerW: 3, drop: 3 },
      { type: 'cannon', x: 59, y: 7, dir: 'down', every: 2.6, speed: 250, kind: 'rock' },
      /* the platform train across the lava sea */
      { type: 'mover', x: 62, y: 12, w: 3, h: 1, path: [[62, 12], [69, 12]], speed: 2.6, pause: 0.6 },
      { type: 'lavaball', x: 65, y: 14, every: 2.4, power: 820 },
      { type: 'lavaball', x: 69, y: 14, every: 2.4, power: 820, phase: 1.2 },
      { type: 'laser', x: 73, y: 8, h: 4, on: 0.9, off: 1.5, phase: 0.0, color: '#ff9a3c' },
      { type: 'laser', x: 75, y: 8, h: 4, on: 0.9, off: 1.5, phase: 1.2, color: '#ff9a3c' },

      /* ===================== III. THE THIN AIR  (78-115) ================ */
      { type: 'sign', x: 79, y: 11, w: 7,
        text: 'III. THE THIN AIR. There is no floor. The balloon is the floor. JUMP flaps it.' },
      { type: 'text', x: 80, y: 7, w: 8, h: 2, text: 'III', size: 1.6, color: '#d8f0ff', alpha: 0.16, outline: false, shadow: false },
      /* the thin air above is too thin to float in - a visible downdraft
         band, so nobody can fly over the squeeze */
      { type: 'wind', x: 83, y: 0, w: 29, h: 5, fy: 2600, color: '#bfe9ff' },
      { type: 'balloon', x: 82, y: 11, dur: 8, color: '#ff8fd0' },
      { type: 'balloon', x: 99, y: 8, dur: 8, color: '#ff8fd0' },
      /* lotus fountains on the pipe caps */
      { type: 'cannon', x: 91, y: 10, dir: 'up', every: 2.0, speed: 200, kind: 'fire' },
      { type: 'cannon', x: 94, y: 8, dir: 'up', every: 2.0, phase: 1.0, speed: 200, kind: 'fire' },
      { type: 'walker', x: 100, y: 10, speed: 1.0, color: '#3ad84c' },
      { type: 'walker', x: 97, y: 11, speed: 1.0, color: '#3ad84c' },
      { type: 'flyer', x: 96, y: 11, path: [[96, 11], [102, 11]], speed: 1.8, color: '#7ad8a0' },
      { type: 'flyer', x: 107, y: 5, path: [[107, 5], [111, 5]], speed: 2.2, color: '#7ad8a0' },
      { type: 'deco', x: 86, y: 3, kind: 'cloud' },
      { type: 'deco', x: 98, y: 2, kind: 'cloud' },
      { type: 'deco', x: 109, y: 3, kind: 'cloud' },
      { type: 'deco', x: 113, y: 11, kind: 'pipe' },

      /* ===================== IV. ONE TOUCH  (116-151) =================== */
      { type: 'sign', x: 117, y: 11, w: 8,
        text: 'IV. ONE TOUCH. One touch and this crown starts again. The shield is the only one you get.' },
      { type: 'text', x: 118, y: 7, w: 8, h: 2, text: 'IV', size: 1.6, color: '#bce8ff', alpha: 0.16, outline: false, shadow: false },
      { type: 'mushroom', x: 118, y: 11 },
      { type: 'text', x: 121, y: 9, w: 6, h: 1, text: 'OFF opens the floor', size: 0.44, color: '#f8d820', alpha: 0.9 },
      /* the electric maze: three fences, one travelling gap */
      { type: 'laser', x: 136, y: 8, h: 4, on: 0.8, off: 1.9, phase: 0.0, color: '#00ffe0' },
      { type: 'laser', x: 138, y: 8, h: 4, on: 0.8, off: 1.9, phase: 0.9, color: '#00ffe0' },
      { type: 'laser', x: 140, y: 8, h: 4, on: 0.8, off: 1.9, phase: 1.8, color: '#00ffe0' },
      /* a space mine waiting in the gap for anyone who jumps short */
      { type: 'flyer', x: 145, y: 13, amp: 1.2, freq: 0.6, color: '#ff5c8a' },
      /* the duel: two lobbers you have to walk between */
      { type: 'cannon', x: 148, y: 8, dir: 'down', every: 2.4, speed: 250, kind: 'energy' },
      { type: 'cannon', x: 150, y: 8, dir: 'down', every: 2.4, phase: 1.2, speed: 250, kind: 'energy' },
      { type: 'deco', x: 133, y: 9, kind: 'crystal' },
      { type: 'deco', x: 144, y: 9, kind: 'crystal' },

      /* ===================== V. THE CROWN ROAD  (152-191) =============== */
      { type: 'sign', x: 153, y: 11, w: 8,
        text: 'V. THE CROWN ROAD. Four bars of nothing, then everything moves on the beat. Count it.' },
      { type: 'text', x: 154, y: 7, w: 8, h: 2, text: 'V', size: 1.6, color: '#ff4fa0', alpha: 0.16, outline: false, shadow: false },
      { type: 'beatblock', x: 158, y: 12, w: 3, h: 1, group: 'A', period: 1.2 },
      { type: 'beatblock', x: 163, y: 12, w: 3, h: 1, group: 'B', period: 1.2 },
      { type: 'beatblock', x: 168, y: 12, w: 3, h: 1, group: 'A', period: 1.2 },
      { type: 'conveyor', x: 173, y: 12, w: 5, speed: -1.5 },
      { type: 'saw', x: 175, y: 9, path: [[175, 9], [175, 11.3]], speed: 2.0, r: 0.75 },
      { type: 'saw', x: 181, y: 6, path: [[181, 6], [181, 11.3]], speed: 2.4, r: 0.75 },
      { type: 'trapspike', x: 183, y: 11, dir: 'up', trigger: 'near', near: 1.6, delay: 0.45, retract: 1.4 },
      { type: 'text', x: 184, y: 9, w: 5, h: 1, text: 'DOUBLE TIME', size: 0.5, color: '#7cf0c8', alpha: 0.9 },
      { type: 'beatblock', x: 186, y: 12, w: 2, h: 1, group: 'A', period: 0.6 },

      /* ===================== VI. THE DARKER SIDE  (192-229) ============= */
      { type: 'sign', x: 193, y: 11, w: 8,
        text: 'VI. THE DARKER SIDE. Five trials, one breath, no flag until the summit. Go.' },
      { type: 'text', x: 194, y: 7, w: 8, h: 2, text: 'VI', size: 1.6, color: '#d4c6ff', alpha: 0.16, outline: false, shadow: false },
      /* trial 1 - the lava rush */
      { type: 'mover', x: 196, y: 12, w: 4, h: 1, path: [[196, 12], [203, 12]], speed: 2.0, pause: 1.0 },
      { type: 'lavaball', x: 198, y: 14, every: 2.0, phase: 1.7, power: 820 },
      { type: 'lavaball', x: 201, y: 14, every: 2.0, power: 820, phase: 1.0 },
      /* trial 2 - no cappy: the ledges bite if you stand on them */
      { type: 'trapspike', x: 208, y: 9, dir: 'up', trigger: 'near', near: 1.5, delay: 0.7, retract: 1.1 },
      { type: 'trapspike', x: 210, y: 7, dir: 'up', trigger: 'near', near: 1.5, delay: 0.7, retract: 1.1 },
      /* trial 3 - the sinking poles */
      { type: 'faller', x: 212, y: 8, w: 2, delay: 0.45 },
      { type: 'faller', x: 215, y: 8, w: 2, delay: 0.45 },
      /* trial 4 - the barrel drop */
      { type: 'cannon', x: 214, y: 5, dir: 'down', every: 2.8, speed: 220, kind: 'rock' },
      { type: 'deco', x: 218, y: 7, kind: 'girder' },
      /* trial 5 - the lift to the summit */
      { type: 'mover', x: 220, y: 8, w: 2, h: 1, path: [[220, 8], [220, 4]], speed: 2.2, pause: 3.2 },
      { type: 'deco', x: 222, y: 3, kind: 'torch' },
      { type: 'deco', x: 227, y: 3, kind: 'torch' },
      { type: 'text', x: 222, y: 1, w: 8, h: 1, text: 'THANK YOU', size: 1.0, color: '#e8f4ff', wave: 2.5 },
      { type: 'text', x: 222, y: 2, w: 8, h: 1, text: 'SIX CROWNS', size: 0.5, color: '#ffd27a', alpha: 0.9 }
    ],

    /* ---------------------------------------------------------------- */
    onLoad: function (RT) {
      this._sec = -1;
      this._seen = [];
      try { RT.seed(60606); } catch (e) {}
      try { RT.hud.set('crowns', '0/6'); } catch (e) {}
    },

    onUpdate: function (RT, dt) {
      var p = RT.player;
      if (!p) return;
      var i = sectionAt((p.x + p.w / 2) / 32);
      if (i !== this._sec) {
        this._sec = i;
        try { RT.Audio.music(SECTIONS[i].music); } catch (e) {}
        if (!this._seen[i]) {
          this._seen[i] = 1;
          try { RT.banner(BANNERS[i], 2.2); } catch (e) {}
        }
      }
    },

    onCheckpoint: function (RT, cp) {
      var i = sectionAt(cp ? cp.tx : 0);
      var got = Math.min(6, i + 1);
      try { RT.hud.set('crowns', got + '/6'); } catch (e) {}
      try { RT.toast('CROWN ' + SECTIONS[Math.min(5, i)].n + ' TAKEN', 1.6); } catch (e) {}
      try { RT.flash('rgba(255,214,122,0.35)', 0.25); } catch (e) {}
    },

    onWin: function (RT) {
      try { RT.hud.set('crowns', '6/6'); } catch (e) {}
      try { RT.banner(['ALL SIX CROWNS', 'thank you'], 2.6); } catch (e) {}
    },

    /* ---------------------------------------------------------------- *
     * Bespoke backdrop + atmosphere. Everything is clipped to the camera
     * window and built from sines and rectangles - no shadowBlur, no
     * per-frame allocation beyond a few numbers.
     * ---------------------------------------------------------------- */
    onDraw: function (RT, g, layer) {
      var cam = RT.cam, view = RT.view, p = RT.player;
      if (!cam || !view || !p) return;
      var L = cam.x - view.w / 2 - 48, R = cam.x + view.w / 2 + 48;
      var T = cam.y - view.h / 2 - 48, B = cam.y + view.h / 2 + 48;
      var t = RT.time || 0, i, x, y;
      function vis(c0, c1) { return c1 * 32 > L && c0 * 32 < R; }

      if (layer === 'back') {
        /* -- I. THE GALE : a far castle and long gale streaks ------------ */
        if (vis(0, 38)) {
          g.save();
          g.globalAlpha = 0.30;
          g.fillStyle = '#2f6f24';
          for (i = 0; i < 7; i++) {
            x = i * 176 + 40; y = 384;
            g.beginPath(); g.moveTo(x - 70, y); g.lineTo(x, y - 54 - (i % 3) * 16); g.lineTo(x + 70, y);
            g.closePath(); g.fill();
          }
          g.globalAlpha = 0.5; g.fillStyle = '#7a2800';
          g.fillRect(1010, 250, 120, 134);
          for (i = 0; i < 4; i++) g.fillRect(1010 + i * 34, 232, 20, 24);
          g.fillStyle = '#20100a'; g.fillRect(1054, 320, 30, 64);
          g.restore();
          g.save();
          g.globalAlpha = 0.16; g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.lineCap = 'round';
          for (i = 0; i < 26; i++) {
            var gx = ((i * 137 + t * 210) % 1300) - 40;
            var gy = 60 + nz(i) * 300;
            g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx + 34 + nz(i + 9) * 26, gy); g.stroke();
          }
          g.restore();
        }
        /* -- II. THE IRON DECK : hulls and chains ------------------------ */
        if (vis(38, 78)) {
          g.save();
          for (i = 0; i < 5; i++) {
            var hx = 1230 + i * 250 + Math.sin(t * 0.35 + i) * 14;
            var hy = 110 + (i % 3) * 70 + Math.sin(t * 0.6 + i * 1.7) * 5;
            g.globalAlpha = 0.34; g.fillStyle = '#5c4830';
            RT.roundRect(g, hx, hy, 150, 34, 14); g.fill();
            g.fillStyle = '#8c7050';
            RT.roundRect(g, hx + 6, hy + 3, 138, 12, 6); g.fill();
            g.globalAlpha = 0.45; g.fillStyle = '#c8b090';
            for (var rv = 0; rv < 7; rv++) g.fillRect(hx + 14 + rv * 19, hy + 22, 3, 3);
            g.globalAlpha = 0.22; g.strokeStyle = '#2c2010'; g.lineWidth = 1.6;
            g.beginPath(); g.moveTo(hx + 30, hy + 34); g.lineTo(hx + 22, hy + 96); g.stroke();
            g.beginPath(); g.moveTo(hx + 116, hy + 34); g.lineTo(hx + 126, hy + 96); g.stroke();
          }
          g.restore();
        }
        /* -- III. THE THIN AIR : giant pastel pipes and puffs ------------ */
        if (vis(78, 116)) {
          g.save();
          for (i = 0; i < 6; i++) {
            var px = 2520 + i * 190;
            var ph = 120 + (i % 3) * 90;
            g.globalAlpha = 0.20; g.fillStyle = '#007000';
            g.fillRect(px, 512 - ph, 54, ph);
            g.fillStyle = '#00b800';
            g.fillRect(px - 8, 512 - ph, 70, 20);
            g.globalAlpha = 0.30; g.fillStyle = '#58f858';
            g.fillRect(px - 8, 512 - ph, 70, 4);
          }
          g.globalAlpha = 0.5; g.fillStyle = '#ffffff';
          for (i = 0; i < 9; i++) {
            var cxp = 2500 + i * 150 + Math.sin(t * 0.12 + i) * 10;
            var cyp = 60 + nz(i + 3) * 190;
            g.beginPath();
            g.arc(cxp, cyp, 22, 0, 6.2832);
            g.arc(cxp + 22, cyp + 5, 17, 0, 6.2832);
            g.arc(cxp - 20, cyp + 6, 15, 0, 6.2832);
            g.fill();
          }
          g.restore();
        }
        /* -- IV. ONE TOUCH : a cold galaxy ring -------------------------- */
        if (vis(116, 152)) {
          g.save();
          var gcx = 4290, gcy = 200;
          for (i = 0; i < 5; i++) {
            g.globalAlpha = 0.10 + i * 0.03;
            g.strokeStyle = i % 2 ? '#00ffe0' : '#7a4ac0';
            g.lineWidth = 2;
            g.beginPath();
            if (g.ellipse) {
              g.ellipse(gcx, gcy, 120 + i * 44, 34 + i * 13, Math.sin(t * 0.08 + i) * 0.12, 0, 6.2832);
            } else {
              g.arc(gcx, gcy, 120 + i * 44, 0, 6.2832);
            }
            g.stroke();
          }
          g.globalAlpha = 0.6; g.fillStyle = '#ffe45c';
          for (i = 0; i < 40; i++) {
            var sx = 3720 + nz(i) * 1160, sy = 40 + nz(i + 40) * 380;
            var ss = 1 + nz(i + 80) * 1.6 + Math.sin(t * 3 + i) * 0.4;
            g.fillRect(sx, sy, ss, ss);
          }
          g.restore();
        }
        /* -- V. THE CROWN ROAD : neon grid and a crown on the horizon ---- */
        if (vis(152, 192)) {
          g.save();
          g.globalAlpha = 0.22; g.strokeStyle = '#3df0ff'; g.lineWidth = 1.4;
          for (i = 0; i < 22; i++) {
            x = 4864 + i * 64;
            g.beginPath(); g.moveTo(x, 512); g.lineTo(5490 + (x - 5490) * 0.28, 300); g.stroke();
          }
          for (i = 0; i < 6; i++) {
            y = 512 - i * i * 12 - 20;
            g.globalAlpha = 0.18 - i * 0.02;
            g.beginPath(); g.moveTo(4864, y); g.lineTo(6144, y); g.stroke();
          }
          var beat = 0.5 + 0.5 * Math.sin(t * Math.PI / 0.6);
          g.globalAlpha = 0.30 + beat * 0.35;
          crown(g, 5490, 210, 4.4 + beat * 0.5, '#ff4fa0', 'rgba(255,255,255,0.5)');
          g.restore();
        }
        /* -- VI. THE DARKER SIDE : the moon and the rising glow ---------- */
        if (vis(192, 230)) {
          g.save();
          g.globalAlpha = 0.85; g.fillStyle = '#e8e0f4';
          g.beginPath(); g.arc(7050, 150, 78, 0, 6.2832); g.fill();
          g.globalAlpha = 0.20; g.fillStyle = '#8a7ad8';
          var craters = [[-30, -20, 16], [18, 8, 21], [-6, 34, 11], [40, -30, 9]];
          for (i = 0; i < craters.length; i++) {
            g.beginPath(); g.arc(7050 + craters[i][0], 150 + craters[i][1], craters[i][2], 0, 6.2832); g.fill();
          }
          g.globalAlpha = 0.14; g.fillStyle = '#ffd27a';
          g.beginPath(); g.arc(7050, 150, 118 + Math.sin(t * 0.9) * 5, 0, 6.2832); g.fill();
          g.globalAlpha = 1;
          var lg = g.createLinearGradient(0, 512, 0, 300);
          lg.addColorStop(0, 'rgba(255,106,0,0.55)');
          lg.addColorStop(1, 'rgba(255,106,0,0)');
          g.fillStyle = lg;
          g.fillRect(6272, 300, 1088, 212);
          g.restore();
        }
      } else {
        /* ---------------- front: atmosphere only --------------------- */
        var sec = sectionAt((p.x + p.w / 2) / 32);
        if (sec === 0) {
          g.save(); g.globalAlpha = 0.13; g.strokeStyle = '#ffffff'; g.lineWidth = 1.6;
          for (i = 0; i < 14; i++) {
            var wx = L + ((i * 97 + t * 330) % (view.w + 120));
            var wy = T + nz(i + 5) * view.h;
            g.beginPath(); g.moveTo(wx, wy); g.lineTo(wx + 40, wy - 3); g.stroke();
          }
          g.restore();
        } else if (sec === 1 || sec === 5) {
          g.save();
          for (i = 0; i < 12; i++) {
            var sx2 = L + ((i * 113 + t * 40) % (view.w + 80));
            var sy2 = 470 - ((t * 70 + i * 60) % 210);
            g.globalAlpha = 0.14 * (1 - (470 - sy2) / 210);
            g.fillStyle = sec === 1 ? '#ffb457' : '#ff8a3c';
            g.beginPath(); g.arc(sx2, sy2, 7 + nz(i) * 9, 0, 6.2832); g.fill();
          }
          g.restore();
        } else if (sec === 3) {
          hazy(g, L, T, view.w + 96, 4, '#00ffe0', 0.10 + 0.05 * Math.sin(t * 6));
          hazy(g, L, B - 6, view.w + 96, 4, '#00ffe0', 0.10 + 0.05 * Math.sin(t * 6 + 2));
        } else if (sec === 4) {
          var pulse = (t % 0.6) / 0.6;
          g.save(); g.globalAlpha = 0.10 * (1 - pulse);
          g.fillStyle = '#ff4fa0'; g.fillRect(L, T, view.w + 96, view.h + 96);
          g.restore();
        }
        /* the six crowns, one glyph per section, lit as you take them */
        for (i = 0; i < 6; i++) {
          var cx2 = SECTIONS[i].x0 * 32 + 64;
          if (cx2 < L - 80 || cx2 > R + 80) continue;
          g.save();
          g.globalAlpha = (i < sec) ? 1 : (i === sec ? 0.65 : 0.25);
          crown(g, cx2, 128, 1.5, SECTIONS[i].tint, 'rgba(0,0,0,0.4)');
          g.restore();
        }
      }
    }
  });
})();
