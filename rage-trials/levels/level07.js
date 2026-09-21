/* ==========================================================================
 * RAGE TRIALS - Trial 7: BRAIN AND BARREL
 * --------------------------------------------------------------------------
 * A brass-and-steel factory that throws you at things, then asks you to think
 * about why. Eight rooms, in strict teaching order:
 *
 *   I.    THE INTAKE      x0-11    one fixed barrel, one unclimbable wall
 *   II.   THE BARREL LINE x12-40   three barrels over the melt, two laser fences
 *   III.  THE SWEEP       x41-47   a rotating barrel; a miss is a climb, not a death
 *   IV.   THE POWER ROOM  x48-62   ON/OFF: M/N blocks, two switches, two flips
 *   V.    THE ORDER       x63-77   four levers stamped I-IV, pressed right to left
 *   VI.   THE SHELF       x78-89   a key you cannot climb to, only be thrown at
 *   VII.  THE FOREMAN     x90-110  three levers, one rule, exactly one answer
 *   VIII. THE JUGGLER     x111-121 three barrels over a spike pit into the door
 *
 * PHYSICS (CONTRACT.md section 4, plus the engine amendment: apex 102 px =
 * 3.18 tiles, full-run gap 4.48 tiles, spring 7.8 tiles):
 *   - No jump in this level asks for more than 2 tiles of height or a 2-tile
 *     gap. Every wall that must not be climbed (x12, the power-room lip, the
 *     shelf pillar, both puzzle doors) is 4 tiles or more, so the barrel and
 *     the puzzle are the only ways through.
 *   - EVERY launcher here is aimed at 72 degrees or steeper, so the horizontal
 *     launch speed is at most 219 px/s - just over the 210 px/s run speed.
 *     That matters: engine.js accelerates vx toward +-210 whenever a direction
 *     is held, so a flat, fast shot would be quietly shortened by a player
 *     holding RIGHT out of habit. Steep shots are honest - holding right moves
 *     the landing by about a tile, and every catcher barrel in the chain is
 *     3 tiles wide to swallow exactly that.
 *   - The dotted preview entities.js draws is integrated from the same
 *     constants, so what a barrel promises is what the barrel does.
 *
 * FAIRNESS (docs/research-troll.md section 5):
 *   - No hidden timer on any aiming device. You may sit in a barrel forever;
 *     the laser fences and the sweep keep their own visible rhythm while you
 *     watch them (section 5.1: Nintendo removed the rotatable-barrel timer -
 *     take the hint).
 *   - Every puzzle answers a wrong input with a buzz and a re-arm, never a
 *     death (section 5.5): the power room is sealed, the foreman's chasm has a
 *     spring in the bottom that throws you back out, and a missed sweep costs
 *     a 3-tile climb.
 *   - Counting puzzles get a HUD readout, and the order is stamped over the
 *     levers themselves, so nobody is ever hard-stuck.
 *   - The only lethal rooms are II (the melt) and VIII (the spike pit), and
 *     each has a checkpoint immediately in front of it.
 *
 * 122 x 18 tiles. Four checkpoints (x14, x36, x78, x108). DESIGN.md's Level 7
 * line says "two"; its global rule for levels 4-7 says one per ~20 tiles, and
 * on a 122-tile level with four puzzles the global rule wins - nobody should
 * have to re-solve a puzzle because they fell in a spike pit 70 tiles later.
 * ========================================================================== */
(function () {
  var RT = window.RT;
  if (!RT || !RT.registerLevel) return;

  var T = 32;

  /* Deterministic scenery noise. NEVER RT.random() - that is the gameplay RNG
   * and a level must not disturb a seeded run. */
  function n1(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  /* ---------------------------------------------------------------- state */
  var ORDER = ['T', 'S', 'R', 'Q'];              /* press order: I, II, III, IV */
  var LABEL = { Q: 'IV', R: 'III', S: 'II', T: 'I' };
  var S = { step: 0, prev: {}, opened: false, quip: 0, said: 0, maxTx: 0, hud: '' };

  /* ---------------------------------------------------------------- themes */
  var MELT = {
    sky: [[0, '#140a08'], [0.45, '#2a1410'], [0.78, '#5a2314'], [1, '#93401a']],
    parallax: [
      { kind: 'factory', color: '#241512', color2: '#c2621e', y: 0.94, speed: 0.16, scale: 0.50 },
      { kind: 'pipes', color: '#3a231c', color2: '#6b3a24', y: 1.08, speed: 0.38, scale: 0.42 },
      { kind: 'pipes', color: '#1d100d', color2: '#33201a', y: 1.18, speed: 0.60, scale: 0.32 }
    ],
    ambient: 'embers',
    fog: { color: '#b4501e', alpha: 0.20 },
    tile: { top: '#9d7a5c', side: '#5a3c2c', dark: '#2a1a14', rim: '#ffd9a8', accent: '#e07a26' },
    spike: { base: '#7a5a46', tip: '#ffe2bc' },
    vignette: 0.42
  };

  var BRAIN = {
    sky: [[0, '#0b1420'], [0.5, '#16283a'], [1, '#2f5570']],
    parallax: [
      { kind: 'pipes', color: '#1b2e3c', color2: '#2f4a60', y: 0.92, speed: 0.14, scale: 0.46 },
      { kind: 'factory', color: '#16222f', color2: '#3ad0e0', y: 1.04, speed: 0.34, scale: 0.44 },
      { kind: 'pipes', color: '#101a24', color2: '#22394a', y: 1.16, speed: 0.58, scale: 0.34 }
    ],
    ambient: 'dust',
    fog: { color: '#3fa7c8', alpha: 0.16 },
    tile: { top: '#8fa3b4', side: '#3f4e5c', dark: '#1d262f', rim: '#cdf3ff', accent: '#39c6e2' },
    spike: { base: '#5f6e7c', tip: '#e6f7ff' },
    vignette: 0.38
  };

  var FORGE = {
    sky: [[0, '#1a0c06'], [0.4, '#40160c'], [0.72, '#8a3510'], [1, '#d97a1e']],
    parallax: [
      { kind: 'factory', color: '#2b140c', color2: '#ffb03a', y: 0.92, speed: 0.15, scale: 0.54 },
      { kind: 'pipes', color: '#3d1e12', color2: '#7a3c1c', y: 1.10, speed: 0.40, scale: 0.40 }
    ],
    ambient: 'embers',
    fog: { color: '#ff8b32', alpha: 0.22 },
    tile: { top: '#b08a62', side: '#66422c', dark: '#301c12', rim: '#ffe4b0', accent: '#ff9a3a' },
    spike: { base: '#8a5a3a', tip: '#fff0d0' },
    vignette: 0.46
  };

  /* ------------------------------------------------------------ art helpers */
  function gear(g, cx, cy, r, teeth, rot, face, edge) {
    var i, a, ri = r * 0.80, rt = r;
    g.save();
    g.translate(cx, cy);
    g.rotate(rot);
    g.beginPath();
    for (i = 0; i < teeth; i++) {
      a = (i / teeth) * Math.PI * 2;
      var a1 = a + Math.PI / teeth * 0.42, a2 = a + Math.PI / teeth * 1.58;
      g.lineTo(Math.cos(a) * rt, Math.sin(a) * rt);
      g.lineTo(Math.cos(a1) * rt, Math.sin(a1) * rt);
      g.lineTo(Math.cos(a1) * ri, Math.sin(a1) * ri);
      g.lineTo(Math.cos(a2) * ri, Math.sin(a2) * ri);
    }
    g.closePath();
    g.fillStyle = face;
    g.fill();
    g.strokeStyle = edge; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(0, 0, r * 0.26, 0, Math.PI * 2); g.fillStyle = edge; g.fill();
    g.strokeStyle = edge; g.lineWidth = r * 0.10;
    for (i = 0; i < 4; i++) {
      a = (i / 4) * Math.PI * 2;
      g.beginPath();
      g.moveTo(Math.cos(a) * r * 0.22, Math.sin(a) * r * 0.22);
      g.lineTo(Math.cos(a) * r * 0.74, Math.sin(a) * r * 0.74);
      g.stroke();
    }
    g.restore();
  }

  function pipeRun(g, x0, x1, y, th, col, hi) {
    g.fillStyle = col;
    g.fillRect(x0, y, x1 - x0, th);
    g.fillStyle = hi;
    g.fillRect(x0, y + 1.5, x1 - x0, th * 0.22);
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(x0, y + th * 0.72, x1 - x0, th * 0.28);
    for (var x = x0 + 24; x < x1 - 8; x += 74) {
      g.fillStyle = col;
      g.fillRect(x - 3, y - 3, 8, th + 6);
      g.fillStyle = 'rgba(255,255,255,0.14)';
      g.fillRect(x - 3, y - 3, 8, 2);
    }
  }

  function gauge(g, cx, cy, r, t, seed) {
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = 'rgba(18,24,30,0.85)'; g.fill();
    g.strokeStyle = 'rgba(190,150,70,0.65)'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.74, Math.PI * 0.82, Math.PI * 2.18);
    g.strokeStyle = 'rgba(120,150,170,0.45)'; g.lineWidth = 1.4; g.stroke();
    var a = Math.PI * 0.86 + (0.5 + 0.5 * Math.sin(t * (0.7 + n1(seed) * 1.6) + seed)) * Math.PI * 1.28;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(a) * r * 0.70, cy + Math.sin(a) * r * 0.70);
    g.strokeStyle = '#ff8a4a'; g.lineWidth = 2; g.stroke();
    g.beginPath(); g.arc(cx, cy, r * 0.14, 0, Math.PI * 2);
    g.fillStyle = '#c9d6e2'; g.fill();
  }

  function steam(g, cx, cy, t, seed, up, col) {
    var i, k, ph, x, y, rr;
    for (i = 0; i < 5; i++) {
      ph = (t * (0.32 + n1(seed + i) * 0.22) + n1(seed * 3 + i)) % 1;
      k = 1 - ph;
      x = cx + Math.sin(ph * 5.2 + seed + i) * (10 + ph * 16);
      y = cy - up * ph;
      rr = 4 + ph * 20;
      g.globalAlpha = k * k * 0.30;
      g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2);
      g.fillStyle = col; g.fill();
    }
    g.globalAlpha = 1;
  }

  /* [tileX, tileY, radiusPx, teeth, radiansPerSecond] */
  var GEARS = [
    [16.5, 5.0, 74, 14, 0.30], [30.0, 6.2, 116, 18, -0.17], [44.0, 2.4, 58, 12, 0.44],
    [55.0, 5.6, 96, 16, -0.24], [70.5, 7.4, 130, 20, 0.15], [84.0, 2.6, 62, 12, -0.40],
    [98.5, 6.0, 88, 15, 0.22], [116.0, 5.4, 108, 17, -0.20]
  ];
  /* [tileX0, tileX1, tileY, thicknessPx] */
  var PIPES = [
    [0, 13, 3.2, 14], [12, 27, 1.4, 10], [30, 48, 0.8, 16], [48, 63, 0.4, 12],
    [63, 80, 3.4, 14], [78, 92, 1.2, 10], [92, 111, 2.6, 16], [108, 122, 0.6, 12]
  ];
  /* [tileX, tileY, radiusPx] */
  var GAUGES = [
    [6.5, 12.4, 11], [18.5, 9.3, 9], [37.5, 9.4, 10], [49.6, 3.4, 9], [61.2, 3.4, 9],
    [65.8, 6.6, 10], [76.2, 6.6, 10], [82.5, 9.3, 9], [95.5, 9.4, 11], [113.0, 9.3, 9]
  ];
  /* [tileX, tileY, plumeHeightPx, seed] */
  var VENTS = [
    [9.5, 14.8, 120, 1], [33.6, 15.4, 150, 2], [45.5, 13.8, 110, 3], [58.5, 8.8, 90, 4],
    [67.5, 10.8, 100, 5], [80.5, 10.8, 100, 6], [96.5, 10.8, 90, 7], [110.5, 10.8, 130, 8]
  ];

  /* one-shot mutterings, fired by how far right the player has ever been */
  var LINES = [
    [7, -2, 'walk in. press ACTION.'],
    [19, -2, 'the dots do not lie'],
    [38, -2, 'fire high'],
    [49, -3, 'one switch, whole factory'],
    [64, -2, 'read the stamps'],
    [80, -2, 'you cannot climb that'],
    [91, -2, 'exactly two'],
    [110, -2, 'hands off the controls']
  ];

  var DEATH_QUIPS = [
    'The melt does not care how clever you are.',
    'A barrel will wait. A laser will not.',
    'Fired early. Filed under scrap.',
    'The machine caught nothing that time.',
    'Steel: 1. You: several.',
    'Aim, then fire. That order.'
  ];

  RT.registerLevel(7, {
    name: 'BRAIN AND BARREL',
    subtitle: 'The flinging machine and four arguments',
    theme: 'factory',
    music: 'factory',

    themeZones: [
      { x0: 20.0, x1: 42.0, theme: MELT },
      { x0: 47.0, x1: 80.0, theme: BRAIN },
      { x0: 104.0, x1: 999, theme: FORGE }
    ],

    intro: [
      'THE MACHINE DOES THE MOVING. YOU DO THE THINKING.',
      'Barrels fling. Levers argue. Nothing in here is a leap of faith.'
    ],

    /*        0         1         2         3         4         5         6         7         8         9         10        11
     *        01234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345678901 */
    tiles: [
      '.........................................................................................#................................',
      '......................#....#.............................................................#................................',
      '................................................###############..........................#................................',
      '..............................................................#..........................#................................',
      '.....................o....o......o.........too.......M.....N..#......................t.o.#................................',
      '..........................................-------....M.....N..################......######................................',
      '.....................................................M.....N..#.....................######................................',
      '................................................#....M.....N..............................................................',
      '................................................#.t!oM...!oNpo..............................................###...........',
      '...........o....................................######NNN######..............................##...........................',
      '..........o..lC..g....#....#.......gC...t.......######...######.l..o..o...o..gC.p.r........p......t.........C...........Gt',
      '............#########.............#######.......####################################################........####.......###',
      '............#########.............#######.......####################################################........####^^^^^^^###',
      '............#########.............#######r....p.####################################################........##############',
      '.rP..l.p....#########.............##################################################################S...r...##############',
      '#####################.............########################################################################################',
      '#####################LLLLLLLLLLLLL########################################################################################',
      '#####################LLLLLLLLLLLLL########################################################################################'
    ],

    /* lower-case letters in the map are scenery */
    tileHook: function (ch, tx, ty) {
      if (ch === 'r') return { type: 'deco', kind: 'rock', x: tx, y: ty };
      if (ch === 'p') return { type: 'deco', kind: 'pipe', x: tx, y: ty };
      if (ch === 't') return { type: 'deco', kind: 'torch', x: tx, y: ty };
      if (ch === 'g') return { type: 'deco', kind: 'girder', x: tx, y: ty };
      if (ch === 'l') return { type: 'deco', kind: 'lamp', x: tx - 0.5, y: ty - 1.5 };
      return null;
    },

    entities: [
      /* ---- I. THE INTAKE ------------------------------------------- */
      { type: 'launcher', x: 8, y: 13.5, angle: 72, power: 680, color: '#ffb03a' },
      { type: 'sign', x: 4, y: 14, range: 3, text: 'THE INTAKE. Walk into the barrel, press ACTION. The dotted line is a promise, not a suggestion.' },
      { type: 'text', x: 3, y: 11.6, text: 'I. THE INTAKE', size: 0.52, color: '#ffd9a0', alpha: 0.7 },
      { type: 'text', x: 8.7, y: 12.2, text: 'ACTION = FIRE', size: 0.36, color: '#ffe9c0', alpha: 0.55 },

      /* ---- II. THE BARREL LINE ------------------------------------- */
      { type: 'text', x: 16, y: 7.4, text: 'II. THE BARREL LINE', size: 0.52, color: '#ffc98a', alpha: 0.72 },
      { type: 'sign', x: 16, y: 10, range: 3, text: 'Each barrel catches you in mid-air. Sit in one all day if you like - the fences keep time, the barrel does not.' },
      { type: 'launcher', x: 19, y: 9.5, angle: 78, power: 760, color: '#ffb03a' },
      { type: 'laser', x: 22, y: 2, w: 1, h: 8, dir: 'down', on: 1.0, off: 2.0, phase: 0.0 },
      { type: 'launcher', x: 23.4, y: 9.5, w: 3, h: 2, angle: 78, power: 760, color: '#ff8a5a' },
      { type: 'laser', x: 27, y: 2, w: 1, h: 8, dir: 'down', on: 1.0, off: 2.0, phase: 1.5 },
      { type: 'launcher', x: 28.9, y: 9.5, w: 3, h: 2, angle: 78, power: 760, color: '#ff8a5a' },
      { type: 'text', x: 26, y: 12.6, text: 'THE MELT', size: 0.46, color: '#ffb066', alpha: 0.5, wave: 1.1 },

      /* ---- III. THE SWEEP ------------------------------------------ */
      { type: 'text', x: 37, y: 7.4, text: 'III. THE SWEEP', size: 0.52, color: '#ffc98a', alpha: 0.72 },
      { type: 'sign', x: 37, y: 10, range: 3, text: 'One barrel, one shelf, one angle. Fire HIGH. Miss and you climb back up - nobody dies of embarrassment.' },
      { type: 'launcher', x: 39, y: 9.5, angle: 78, rotate: [34, 80], rotateSpeed: 22, power: 800, color: '#ffd23f' },
      { type: 'text', x: 44.5, y: 7.6, text: 'THE SHELF', size: 0.42, color: '#ffe0a8', alpha: 0.6 },

      /* ---- IV. THE POWER ROOM -------------------------------------- */
      { type: 'text', x: 55, y: 3.4, text: 'IV. THE POWER ROOM', size: 0.52, color: '#bfeaff', alpha: 0.75 },
      { type: 'sign', x: 49, y: 8, range: 3, text: 'POWER ON: the blue blocks hold. POWER OFF: the amber blocks hold. One switch. The WHOLE factory - not just this room.' },
      { type: 'sign', x: 56, y: 8, range: 2.4, text: 'The bridge under your feet only exists while the power is OFF. Think about that before you reach for the next switch.' },

      /* ---- V. THE ORDER -------------------------------------------- */
      { type: 'text', x: 70, y: 6.4, text: 'V. THE ORDER', size: 0.52, color: '#bfeaff', alpha: 0.75 },
      { type: 'sign', x: 64, y: 10, range: 3, text: 'THE ORDER: I, then II, then III, then IV. The numbers are stamped over the levers. Stand on one out of turn and the room re-arms.' },
      { type: 'switch', x: 65, y: 10, group: 'Q' },
      { type: 'switch', x: 68, y: 10, group: 'R' },
      { type: 'switch', x: 71, y: 10, group: 'S' },
      { type: 'switch', x: 74, y: 10, group: 'T' },
      { type: 'text', x: 65, y: 8.7, text: 'IV', size: 0.55, color: '#ffd23f', alpha: 0.95 },
      { type: 'text', x: 68, y: 8.7, text: 'III', size: 0.55, color: '#ffd23f', alpha: 0.95 },
      { type: 'text', x: 71, y: 8.7, text: 'II', size: 0.55, color: '#ffd23f', alpha: 0.95 },
      { type: 'text', x: 74, y: 8.7, text: 'I', size: 0.55, color: '#ffd23f', alpha: 0.95 },
      { type: 'sign', x: 75, y: 10, range: 2.4, text: 'Yes. That means running past all four and coming back. Jump the ones that are not your turn.' },
      { type: 'door', x: 76, y: 7, h: 4, group: 'U' },

      /* ---- VI. THE SHELF ------------------------------------------- */
      { type: 'text', x: 82, y: 7.4, text: 'VI. THE SHELF', size: 0.52, color: '#ffc98a', alpha: 0.72 },
      { type: 'sign', x: 77, y: 10, range: 3, text: 'The brass key is on the shelf. You cannot climb to it. You can be THROWN at it and steer.' },
      { type: 'launcher', x: 78.4, y: 9.5, w: 2, h: 2, angle: 90, power: 880, color: '#ffd23f' },
      { type: 'key', x: 86, y: 4, key: 'brass' },
      { type: 'door', x: 89, y: 7, h: 4, key: 'brass' },

      /* ---- VII. THE FOREMAN ---------------------------------------- */
      { type: 'text', x: 94, y: 5.4, text: "VII. THE FOREMAN'S RULE", size: 0.52, color: '#bfeaff', alpha: 0.75 },
      { type: 'sign', x: 90, y: 10, range: 3, text: 'FOREMAN: exactly TWO levers up. BRASS is one of them. BRASS and IRON never hold together. IRON seals my corridor.' },
      { type: 'switch', x: 92, y: 10, group: 'A' },
      { type: 'switch', x: 95, y: 10, group: 'B' },
      { type: 'switch', x: 93, y: 8, group: 'C' },
      { type: 'text', x: 92, y: 8.7, text: 'BRASS', size: 0.34, color: '#ffce6a', alpha: 0.95 },
      { type: 'text', x: 95, y: 8.7, text: 'COPPER', size: 0.34, color: '#ff9a6a', alpha: 0.95 },
      { type: 'text', x: 93.3, y: 6.7, text: 'IRON', size: 0.34, color: '#9fd6ff', alpha: 0.95 },
      { type: 'sign', x: 97.4, y: 10, range: 2.2, text: 'IRON is up on the step. Do not go up there. We are not going to say it a third time.' },
      { type: 'toggleblock', x: 101, y: 10, w: 3, group: 'A' },
      { type: 'toggleblock', x: 105, y: 10, w: 3, group: 'B' },
      { type: 'toggleblock', x: 109, y: 9, w: 1, h: 2, group: 'C' },
      { type: 'text', x: 103.5, y: 12.4, text: 'REJECT CHUTE', size: 0.36, color: '#ffb066', alpha: 0.5 },

      /* ---- VIII. THE JUGGLER --------------------------------------- */
      { type: 'text', x: 115, y: 7.4, text: 'VIII. THE JUGGLER', size: 0.52, color: '#ffc07a', alpha: 0.8 },
      { type: 'sign', x: 110, y: 10, range: 2.6, text: 'THE JUGGLER. Three barrels, one door, no steering. Let go of everything and press ACTION.' },
      { type: 'launcher', x: 111, y: 9.5, angle: 82, power: 700, color: '#ffd23f' },
      { type: 'launcher', x: 113.6, y: 9.5, w: 2, h: 2, angle: 82, power: 700, color: '#ff8a5a' },
      { type: 'launcher', x: 116.5, y: 9.5, w: 2, h: 2, angle: 82, power: 700, color: '#ff8a5a' },
      { type: 'deco', kind: 'flag', x: 119, y: 10 },

      /* ---- scenery the tile map cannot carry ------------------------ */
      { type: 'deco', kind: 'crystal', x: 30, y: 10, scale: 0.8, alpha: 0.8 },
      { type: 'deco', kind: 'girder', x: 22, y: 9 },
      { type: 'deco', kind: 'girder', x: 27, y: 9 },
      { type: 'deco', kind: 'cloud', x: 12, y: 1, alpha: 0.35 },
      { type: 'deco', kind: 'cloud', x: 44, y: 0.6, alpha: 0.3 },
      { type: 'deco', kind: 'cloud', x: 104, y: 1.2, alpha: 0.3 }
    ],

    /* ==================================================================== */
    onLoad: function (RT) {
      S.step = 0; S.prev = {}; S.opened = false; S.quip = 0; S.said = 0; S.maxTx = 0; S.hud = '';
      RT.onOff = true;
      RT.groups.U = false;
      if (RT.hud && RT.hud.set) RT.hud.set('brain', 'FACTORY: ONLINE');
    },

    onUpdate: function (RT, dt) {
      var p = RT.player;
      if (!p) return;
      var pcx = p.x + p.w / 2;
      var tx = pcx / T;
      var i, gr, on, fired = null, wrong = false, e;

      /* --- one toggle per visit, for every lever in the level ---------
       * Engine-side a switch re-fires every 0.4 s while you touch it, which
       * would make a lever you are standing on flap like a fish. Locking it
       * until the player physically walks away is what a lever actually does,
       * and it is what makes both lever puzzles readable. */
      var sws = RT.find('switch');
      for (i = 0; i < sws.length; i++) {
        e = sws[i];
        if (e._armLock) {
          if (p.dead || Math.abs(pcx - (e.x + e.w / 2)) > 46) { e._armLock = false; e.cool = 0; }
          else e.cool = 9;
        } else if (e.cool > 0) { e._armLock = true; e.cool = 9; }
      }

      /* --- V. THE ORDER: rising edges, in order, or the room re-arms --- */
      for (i = 0; i < ORDER.length; i++) {
        gr = ORDER[i];
        on = !!RT.groups[gr];
        if (on && !S.prev[gr]) {
          if (gr === ORDER[S.step]) fired = gr; else wrong = true;
        }
      }
      if (wrong) {
        for (i = 0; i < ORDER.length; i++) RT.groups[ORDER[i]] = false;
        S.step = 0;
        if (RT.Audio) RT.Audio.sfx('bonk');
        RT.toast('WRONG LEVER - THE ROOM RE-ARMS', 1.3);
        RT.cam.shake(4, 0.22);
        RT.flash('#ff6a3a', 0.10);
      } else if (fired) {
        S.step++;
        if (RT.Audio) RT.Audio.sfx('tick');
        RT.speech(pcx, p.y - 28, LABEL[fired] + ' OK', 1.0);
      }
      for (i = 0; i < ORDER.length; i++) S.prev[ORDER[i]] = !!RT.groups[ORDER[i]];

      if (S.step >= ORDER.length && !S.opened) {
        S.opened = true;
        RT.groups.U = true;
        RT.toast('THE ORDER HOLDS', 1.6);
        RT.flash('#3df0ff', 0.12);
        RT.cam.shake(3, 0.25);
      }

      /* --- HUD: one readout per room, never two at once ---------------- */
      var line = 'FACTORY: ONLINE';
      if (tx > 46 && tx < 63.5) line = RT.onOff ? 'POWER: ON (blue holds)' : 'POWER: OFF (amber holds)';
      else if (tx >= 63.5 && tx < 78) line = 'ORDER ' + Math.min(S.step, 4) + ' / 4' + (S.opened ? '  -  OPEN' : '');
      else if (tx >= 88 && tx < 111) {
        line = 'BRASS ' + (RT.groups.A ? 'UP' : 'down') +
               '  COPPER ' + (RT.groups.B ? 'UP' : 'down') +
               '  IRON ' + (RT.groups.C ? 'UP' : 'down');
      } else if (tx >= 12 && tx < 41) line = 'THE MELT: do not be early';
      if (line !== S.hud) { S.hud = line; RT.hud.set('brain', line); }

      /* --- one-shot mutterings ---------------------------------------- */
      if (tx > S.maxTx) S.maxTx = tx;
      while (S.said < LINES.length && S.maxTx >= LINES[S.said][0]) {
        if (!p.dead) RT.speech(pcx, p.y + LINES[S.said][1] * T, LINES[S.said][2], 1.6);
        S.said++;
      }
    },

    onCheckpoint: function (RT, cp) {
      var names = { 14: 'the intake', 36: 'the far bank', 78: 'the shelf', 108: 'the juggler' };
      RT.toast('LOGGED: ' + (names[cp && cp.tx] || 'the line'), 1.1);
    },

    onDeath: function (RT, cause) {
      /* Respawns are deterministic: the power always comes back ON, and the
       * order re-arms with its levers (switch.onReset clears their groups). */
      RT.onOff = true;
      S.step = 0; S.prev = {};
      RT.toast(DEATH_QUIPS[S.quip % DEATH_QUIPS.length], 1.5);
      S.quip++;
    },

    onWin: function (RT) {
      RT.banner(['THE MACHINE APPROVES', 'brain and barrel: cleared'], 2.4);
      if (RT.hud && RT.hud.clear) RT.hud.clear('brain');
    },

    /* ==================================================================== *
     * Bespoke art. 'back' is the works behind the plating - gears, pipe runs,
     * gauges, the glow of the melt. 'front' is the steam that gets in your
     * way but never hides a hazard.
     * ==================================================================== */
    onDraw: function (RT, g, layer) {
      var cam = RT.cam, view = RT.view;
      if (!cam || !view) return;
      var t = RT.frame / 60;
      var vx0 = cam.x - view.w / 2 - 140, vx1 = cam.x + view.w / 2 + 140;
      var i, c, grad;

      if (layer === 'back') {
        /* --- plating behind the two thinking rooms ------------------- */
        if (vx1 > 47 * T && vx0 < 79 * T) {
          g.fillStyle = 'rgba(22,34,46,0.55)';
          g.fillRect(47 * T, 0, 32 * T, 12 * T);
          g.strokeStyle = 'rgba(120,180,210,0.10)';
          g.lineWidth = 1;
          for (i = 47; i < 79; i += 2) {
            g.beginPath(); g.moveTo(i * T, 0); g.lineTo(i * T, 12 * T); g.stroke();
          }
        }

        /* --- the works ---------------------------------------------- */
        for (i = 0; i < GEARS.length; i++) {
          c = GEARS[i];
          if (c[0] * T < vx0 - c[2] || c[0] * T > vx1 + c[2]) continue;
          gear(g, c[0] * T, c[1] * T, c[2], c[3], t * c[4], 'rgba(44,52,62,0.72)', 'rgba(16,20,26,0.85)');
          gear(g, c[0] * T, c[1] * T, c[2] * 0.42, 8, -t * c[4] * 2.1, 'rgba(120,92,40,0.55)', 'rgba(40,30,12,0.70)');
        }

        for (i = 0; i < PIPES.length; i++) {
          c = PIPES[i];
          if (c[1] * T < vx0 || c[0] * T > vx1) continue;
          pipeRun(g, c[0] * T, c[1] * T, c[2] * T, c[3], 'rgba(58,66,76,0.85)', 'rgba(190,210,230,0.22)');
        }

        for (i = 0; i < GAUGES.length; i++) {
          c = GAUGES[i];
          if (c[0] * T < vx0 || c[0] * T > vx1) continue;
          gauge(g, c[0] * T, c[1] * T, c[2], t, i * 7 + 3);
        }

        /* --- the melt: heat above the lava --------------------------- */
        if (vx1 > 20 * T && vx0 < 34 * T) {
          grad = g.createLinearGradient(0, 16 * T, 0, 9 * T);
          grad.addColorStop(0, 'rgba(255,140,40,0.55)');
          grad.addColorStop(0.45, 'rgba(255,90,20,0.20)');
          grad.addColorStop(1, 'rgba(255,60,10,0)');
          g.fillStyle = grad;
          g.fillRect(21 * T, 9 * T, 13 * T, 7 * T);
          for (i = 0; i < 26; i++) {
            var ex = (21 + n1(i * 3.1) * 13) * T;
            var ey = 16 * T - ((n1(i * 5.7) * 600 + t * (30 + n1(i) * 70)) % (7.4 * T));
            g.globalAlpha = 0.22 + n1(i * 2.3) * 0.3;
            g.fillStyle = '#ffb857';
            g.fillRect(ex, ey, 2, 2 + n1(i * 9) * 4);
          }
          g.globalAlpha = 1;
        }

        /* --- the spike pit, lit from below --------------------------- */
        if (vx1 > 111 * T && vx0 < 120 * T) {
          grad = g.createLinearGradient(0, 13 * T, 0, 8 * T);
          grad.addColorStop(0, 'rgba(255,120,40,0.40)');
          grad.addColorStop(1, 'rgba(255,90,20,0)');
          g.fillStyle = grad;
          g.fillRect(112 * T, 8 * T, 7 * T, 5 * T);
        }
        return;
      }

      /* ---------------- front ---------------------------------------- */
      for (i = 0; i < VENTS.length; i++) {
        c = VENTS[i];
        if (c[0] * T < vx0 || c[0] * T > vx1) continue;
        steam(g, c[0] * T, c[1] * T, t, c[3] * 11 + 1, c[2], '#cfe0ec');
      }

      /* the melt breathes on the camera */
      if (vx1 > 20 * T && vx0 < 34 * T) {
        g.globalAlpha = 0.10 + 0.04 * Math.sin(t * 1.7);
        g.fillStyle = '#ff7a2a';
        g.fillRect(20 * T, 0, 14 * T, 18 * T);
        g.globalAlpha = 1;
      }

      /* hazard hatching along the spike-pit lip */
      if (vx1 > 110 * T && vx0 < 120 * T) {
        g.save();
        g.globalAlpha = 0.55;
        for (i = 0; i < 28; i++) {
          g.fillStyle = (i % 2) ? '#ffd23f' : '#20242c';
          g.fillRect(112 * T + i * 8, 11.72 * T, 8, 5);
        }
        g.restore();
      }

      /* a foreground pipe crossing the intake, for depth */
      if (vx0 < 14 * T) {
        g.fillStyle = 'rgba(30,36,44,0.92)';
        g.fillRect(-40, 16.2 * T, 14 * T + 40, 26);
        g.fillStyle = 'rgba(200,215,230,0.10)';
        g.fillRect(-40, 16.2 * T + 3, 14 * T + 40, 5);
      }
    }
  });
})();
