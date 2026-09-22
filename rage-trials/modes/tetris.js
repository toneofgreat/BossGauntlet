// =============================================================================
// RAGE TRIALS - modes/tetris.js
// RT.Tetris : an authentic NES Tetris (Nintendo, 1989) as the finale of level 10.
//
// Contract: CONTRACT.md section 10.  Loaded after engine.js, attaches to window.RT.
// Plain browser JS, no modules, no assets, no fetch.  Runs on the engine's fixed
// 60 Hz step (update(dt) is called with dt = 1/60) and draws itself in screen space
// through RT.setMode({update, draw, onKey}).
//
// ---------------------------------------------------------------------------
// The NES facts this implements (researched; the numbers are the real ones)
// ---------------------------------------------------------------------------
// * Playfield 10 wide x 20 tall.  No vanish zone on screen; a spawning piece may
//   momentarily sit one or two rows above the field while rotating (rows < 0 are
//   never stored - locking there is a top out).
// * Gravity, in FRAMES PER CELL (NTSC, 60.0988 Hz - we use the engine's 60 Hz):
//       lvl  0: 48   1: 43   2: 38   3: 33   4: 28   5: 23   6: 18   7: 13
//       lvl  8:  8   9:  6   10-12: 5   13-15: 4   16-18: 3   19-28: 2   29+: 1
//   Level 2 (our finale) is therefore 38 frames per cell - about 1.6 cells a second.
// * NES rotation: pure rotation about the piece's own centre cell.  NO wall kicks,
//   NO SRS, NO floor kicks.  If the rotated cells collide, the rotation is refused.
//   S, Z and I have only TWO states (they toggle); O has one; T, J, L have four.
// * NES spawn: 3-wide pieces spawn across columns 3-5, I across 3-6, O on 4-5, and
//   the "flat" pieces spawn upside down compared with modern guideline games:
//       T = XXX / .X.     J = XXX / ..X     L = XXX / X..
//       S = .XX / XX.     Z = XX. / .XX     O = XX / XX     I = XXXX
// * NES randomizer: roll an 8 sided die; if it comes up 7, or repeats the previous
//   piece, roll a 7 sided die once and take that.  (One re-roll, that is all - this
//   is why NES gives you long droughts and short floods.)
// * ARE (entry delay) after a lock: 10 frames for a piece that lands at the bottom
//   of the well, +2 frames per four rows higher, up to 18 frames at the top.
// * Line clear: the NES sweeps the row out from the middle, two columns every four
//   frames -> 5 steps x 4 = 20 frames, then the rows above shift down.
// * Scoring: 40 / 100 / 300 / 1200 times (level + 1), plus one point per cell of
//   soft drop (push down), banked when the piece locks.
// * Level: +1 every 10 lines.  Our finale starts at 2 and ends the moment 10 lines
//   are cleared, so 3 only ever appears on the very last clear.
// * Colours: the NES has ONE palette per level, level mod 10, and draws pieces with
//   only three tile styles - white (T, O, I), colour 1 (S, Z) and colour 2 (J, L).
//   2 mod 10 = 2, the magenta/orange palette (#D800CC and #E45C10), the same one
//   the NES shows at levels 2, 12 and 22.
// * No hold, no ghost piece, no 7-bag, no lock delay, no IRS.  Soft drop only.
//   Our two deliberate concessions (CONTRACT 10): a hard drop, and DAS at
//   10 frames initial / 2 frames repeat instead of the NES 16/6.
// =============================================================================

(function () {
  'use strict';

  var RT = window.RT;
  if (!RT) { return; }

  // ------------------------------------------------------------------ board --
  var COLS = 10, ROWS = 20;

  // ---------------------------------------------------------------- gravity --
  // Frames per cell, indexed by level; 29+ clamps to 1.
  var GRAVITY = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3, 2,
                 2, 2, 2, 2, 2, 2, 2, 2, 2, 1];
  function gravityFrames(lvl) {
    if (lvl < 0) lvl = 0;
    return lvl >= GRAVITY.length ? 1 : GRAVITY[lvl];
  }

  // ------------------------------------------------------------------ timing --
  var DAS_INITIAL = 10;     // frames before the first auto-shift (concession)
  var DAS_REPEAT  = 2;      // frames between auto-shifts (concession)
  var SOFT_FRAMES = 2;      // frames per cell while soft dropping (NES pushdown)
  var CLEAR_STEP  = 4;      // frames per column-pair of the clear sweep
  var CLEAR_STEPS = 5;      // 5 pairs -> 20 frames total
  var ARE_MIN     = 10;     // entry delay, bottom of the well
  var SPAWN_ROW   = 0;      // the centre row of a freshly spawned piece

  // ------------------------------------------------------------------ pieces --
  // Cells are [dy, dx] offsets from the piece's rotation centre.  Rotation is a
  // plain 90 degree turn of these offsets - exactly what the NES orientation
  // table encodes - so there is nothing to kick against.
  var PIECES = {
    T: { id: 1, style: 'white', spawnX: 4, states: [
      [[0,-1],[0,0],[0,1],[1,0]],
      [[-1,0],[0,0],[1,0],[0,-1]],
      [[0,-1],[0,0],[0,1],[-1,0]],
      [[-1,0],[0,0],[1,0],[0,1]]
    ]},
    J: { id: 2, style: 'c2', spawnX: 4, states: [
      [[0,-1],[0,0],[0,1],[1,1]],
      [[-1,0],[0,0],[1,0],[1,-1]],
      [[0,1],[0,0],[0,-1],[-1,-1]],
      [[1,0],[0,0],[-1,0],[-1,1]]
    ]},
    Z: { id: 3, style: 'c1', spawnX: 4, states: [
      [[0,-1],[0,0],[1,0],[1,1]],
      [[-1,0],[0,0],[0,-1],[1,-1]]
    ]},
    O: { id: 4, style: 'white', spawnX: 4, states: [
      [[0,0],[0,1],[1,0],[1,1]]
    ]},
    S: { id: 5, style: 'c1', spawnX: 4, states: [
      [[0,0],[0,1],[1,-1],[1,0]],
      [[-1,-1],[0,-1],[0,0],[1,0]]
    ]},
    L: { id: 6, style: 'c2', spawnX: 4, states: [
      [[0,-1],[0,0],[0,1],[1,-1]],
      [[-1,0],[0,0],[1,0],[-1,-1]],
      [[0,-1],[0,0],[0,1],[-1,1]],
      [[-1,0],[0,0],[1,0],[1,1]]
    ]},
    I: { id: 7, style: 'white', spawnX: 4, states: [
      [[0,-1],[0,0],[0,1],[0,2]],
      [[0,0],[1,0],[2,0],[-1,0]]
    ]}
  };
  var ORDER = ['T', 'J', 'Z', 'O', 'S', 'L', 'I'];   // NES randomizer order
  var BY_ID = {};
  (function () { for (var i = 0; i < ORDER.length; i++) BY_ID[PIECES[ORDER[i]].id] = ORDER[i]; })();

  // ---------------------------------------------------------------- palettes --
  // level mod 10 -> [colour 1 (S,Z), colour 2 (J,L)].  White pieces (T,O,I) are
  // always #FCFCFC.  These are the NES master-palette entries the ROM selects.
  var PALETTES = [
    ['#0058F8', '#3CBCFC'],  // 0  blue / cyan
    ['#00A800', '#B8F818'],  // 1  green / lime
    ['#D800CC', '#E45C10'],  // 2  magenta / orange <- level 2, our finale
    ['#0058F8', '#58D854'],  // 3  blue / green
    ['#E40058', '#58F898'],  // 4  red / mint
    ['#58F898', '#6888FC'],  // 5  mint / periwinkle
    ['#F83800', '#7C7C7C'],  // 6  red / grey
    ['#6844FC', '#A80020'],  // 7  violet / crimson
    ['#0058F8', '#F83800'],  // 8  blue / red   <- level 18 / 28
    ['#F83800', '#FC9838']   // 9  red / orange <- level 19 / 29, the kill screen
  ];
  var WHITE = '#FCFCFC';

  function paletteFor(lvl) {
    var p = PALETTES[((lvl % 10) + 10) % 10];
    return { c1: p[0], c2: p[1], white: WHITE };
  }
  function pieceColor(name, pal) {
    var st = PIECES[name].style;
    return st === 'white' ? pal.white : (st === 'c1' ? pal.c1 : pal.c2);
  }

  // ------------------------------------------------------------------- audio --
  function sfx(n) { try { if (RT.Audio && RT.Audio.sfx) RT.Audio.sfx(n); } catch (e) {} }
  function music(n) { try { if (RT.Audio && RT.Audio.music) RT.Audio.music(n); } catch (e) {} }

  // -------------------------------------------------------------------- maths --
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  // A tiny xorshift, so a headless test can replay the same sequence of pieces.
  var rngState = 0x2f6e2b1 >>> 0;
  function rnd() {
    var x = rngState;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;  x >>>= 0;
    rngState = x;
    return x / 4294967296;
  }
  function seedRng(n) {
    n = (n >>> 0) || 1;
    rngState = (n ^ 0x9e3779b9) >>> 0;
    if (!rngState) rngState = 0x1f123bb5;
    for (var i = 0; i < 8; i++) rnd();
  }

  // =========================================================================== //
  //  STATE                                                                      //
  // =========================================================================== //
  // phase: 'ready' | 'falling' | 'clearing' | 'are' | 'over' | 'won'
  var S = null;

  function blankBoard() {
    var b = [], y, x, row;
    for (y = 0; y < ROWS; y++) { row = []; for (x = 0; x < COLS; x++) row.push(0); b.push(row); }
    return b;
  }

  function newState(opts) {
    var startLevel = Math.max(0, Math.round(opts.level == null ? 2 : opts.level));
    return {
      opts: opts,
      board: blankBoard(),
      startLevel: startLevel,
      level: startLevel,
      lines: 0,
      linesToWin: Math.max(1, Math.round(opts.linesToWin == null ? 10 : opts.linesToWin)),
      score: 0,
      pieces: 0,                 // pieces placed
      stats: { T: 0, J: 0, Z: 0, O: 0, S: 0, L: 0, I: 0 },
      burns: 0,                  // non-tetris clears, for the results line
      tetrises: 0,
      phase: 'ready',
      frame: 0,                  // frames since the run started
      phaseFrame: 0,             // frames in the current phase
      piece: null,               // {name, x, y, rot}
      next: null,                // next piece name
      prev: null,                // previous roll, for the NES randomizer
      gravity: 0,                // frames accumulated toward the next gravity cell
      dropDelay: gravityFrames(startLevel),
      softCells: 0,              // pushdown points banked for this piece
      softTimer: 0,
      are: 0,                    // frames of entry delay remaining
      dropTrail: null,           // ghost trail left by a hard drop
      clearRows: [],             // rows being swept out
      clearStep: 0,
      over: false,
      won: false,
      paused: false,
      curtain: 0,                // rows of the top-out curtain drawn so far
      curtainTimer: 0,
      flash: 0,                  // white flash strength 0..1
      shake: 0,
      celebrate: 0,              // tetris celebration frames
      lastClear: 0,
      lastScore: 0,
      scorePop: 0,
      levelPop: 0,
      queue: [],                 // one-shot inputs from RT.Tetris.input()
      held: { left: false, right: false, down: false },
      dasDir: 0,
      dasTimer: 0,
      endCalled: false,
      endFrame: 0,
      taunt: '',
      runs: 0,
      started: Date.now()
    };
  }

  // ------------------------------------------------------------- board access --
  function cellsOf(name, rot, px, py) {
    var def = PIECES[name];
    var n = def.states.length;
    var st = def.states[((rot % n) + n) % n];
    var out = [];
    for (var i = 0; i < st.length; i++) out.push([py + st[i][0], px + st[i][1]]);
    return out;
  }

  // Legal if inside the columns, above the floor, not deeper than two rows into
  // the ceiling (the NES lets a piece rotate while its top pokes out of frame),
  // and not on top of a locked block.
  function fits(name, rot, px, py) {
    var c = cellsOf(name, rot, px, py), i, y, x;
    for (i = 0; i < c.length; i++) {
      y = c[i][0]; x = c[i][1];
      if (x < 0 || x >= COLS) return false;
      if (y >= ROWS || y < -2) return false;
      if (y >= 0 && S.board[y][x]) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- randomizer --
  // NES: roll 0..7; on a 7, or on a repeat of the previous piece, roll 0..6 once.
  function rollPiece() {
    var i = Math.floor(rnd() * 8);
    if (i > 6 || ORDER[i] === S.prev) i = Math.floor(rnd() * 7);
    if (i > 6) i = 6;
    return ORDER[i];
  }

  // ------------------------------------------------------------------ spawning --
  function spawnPiece() {
    var name = S.next || rollPiece();
    S.prev = name;
    S.next = rollPiece();
    S.piece = { name: name, x: PIECES[name].spawnX, y: SPAWN_ROW, rot: 0 };
    S.stats[name]++;
    S.pieces++;
    S.gravity = 0;
    S.softCells = 0;
    S.softTimer = 0;
    S.dropDelay = gravityFrames(S.level);
    S.phase = 'falling';
    S.phaseFrame = 0;
    if (!fits(name, 0, S.piece.x, S.piece.y)) topOut();   // nowhere to spawn: dead
  }

  // ------------------------------------------------------------------ movement --
  function tryMove(dx, dy) {
    var p = S.piece;
    if (!p) return false;
    if (fits(p.name, p.rot, p.x + dx, p.y + dy)) { p.x += dx; p.y += dy; return true; }
    return false;
  }

  function tryRotate(dir) {
    var p = S.piece;
    if (!p) return false;
    var n = PIECES[p.name].states.length;
    if (n === 1) { sfx('tetrisRotate'); return true; }      // O turns in place
    var rot = ((p.rot + dir) % n + n) % n;
    if (fits(p.name, rot, p.x, p.y)) { p.rot = rot; sfx('tetrisRotate'); return true; }
    return false;                                           // NES: no wall kicks
  }

  // ------------------------------------------------------------------- locking --
  function lockPiece(hard) {
    var p = S.piece;
    if (!p) return;
    var c = cellsOf(p.name, p.rot, p.x, p.y), i, y, x;
    var id = PIECES[p.name].id;
    var lowest = 0, above = false;
    for (i = 0; i < c.length; i++) {
      y = c[i][0]; x = c[i][1];
      if (y < 0) { above = true; continue; }
      if (y > lowest) lowest = y;
      S.board[y][x] = id;
    }
    S.piece = null;
    S.score += S.softCells;                 // pushdown points bank on lock
    if (S.softCells) S.scorePop = 14;
    S.softCells = 0;
    sfx('tetrisLock');
    S.shake = Math.max(S.shake, hard ? 5 : 2);
    if (above) { topOut(); return; }        // part of it locked in the ceiling

    var full = [];
    for (y = 0; y < ROWS; y++) {
      var complete = true;
      for (x = 0; x < COLS; x++) { if (!S.board[y][x]) { complete = false; break; } }
      if (complete) full.push(y);
    }
    if (full.length) {
      S.clearRows = full;
      S.lastClear = full.length;
      S.clearStep = 0;
      S.phase = 'clearing';
      S.phaseFrame = 0;
      S.flash = full.length >= 4 ? 0.62 : 0.34;
      if (full.length >= 4) {
        sfx('tetrisTetris'); S.celebrate = 110; S.shake = 9; S.tetrises++;
      } else { sfx('tetrisClear'); S.burns++; }
    } else {
      startAre(lowest);
    }
  }

  // ARE: 10 frames at the floor, +2 every four rows higher, up to 18 at the top.
  function startAre(lowestRow) {
    var extra = Math.floor((19 - clamp(lowestRow, 0, 19)) / 4) * 2;
    S.are = clamp(ARE_MIN + extra, ARE_MIN, 18);
    S.phase = 'are';
    S.phaseFrame = 0;
  }

  // -------------------------------------------------------------------- scoring --
  var CLEAR_SCORE = [0, 40, 100, 300, 1200];

  function applyClear() {
    var rows = S.clearRows.slice().sort(function (a, b) { return a - b; });
    var i, y, x, yy;
    for (i = 0; i < rows.length; i++) {
      y = rows[i];
      for (yy = y; yy > 0; yy--) {
        for (x = 0; x < COLS; x++) S.board[yy][x] = S.board[yy - 1][x];
      }
      for (x = 0; x < COLS; x++) S.board[0][x] = 0;
    }
    var n = rows.length;
    var gained = CLEAR_SCORE[clamp(n, 0, 4)] * (S.level + 1);
    S.score += gained;
    S.lastScore = gained;
    S.scorePop = 26;
    S.lines += n;
    S.lastClear = n;
    S.clearRows = [];

    if (S.lines >= S.linesToWin) { winRun(); return; }

    // Level up every ten lines, counted from the level the run started on.
    var want = S.startLevel + Math.floor(S.lines / 10);
    if (want > S.level) {
      S.level = want;
      S.dropDelay = gravityFrames(S.level);
      S.levelPop = 70;
      sfx('tetrisLevel');
      S.flash = Math.max(S.flash, 0.45);
    }
    startAre(rows[rows.length - 1]);
  }

  // --------------------------------------------------------------- run endings --
  var TAUNTS = [
    'THE MACHINE WINS AGAIN.',
    'TEN LINES. THAT IS ALL.',
    'LEVEL 2 DOES NOT CARE.',
    'YOU STACKED. IT STACKED HIGHER.',
    'THE I PIECE IS NOT COMING.',
    'BLAME THE RANDOMIZER.',
    'SO CLOSE. NO, REALLY.',
    'ONE MORE. ONE MORE.'
  ];

  function topOut() {
    if (S.over || S.won) return;
    S.over = true;
    S.piece = null;
    S.phase = 'over';
    S.phaseFrame = 0;
    S.curtain = 0;
    S.curtainTimer = 0;
    S.shake = 12;
    S.taunt = TAUNTS[Math.floor(rnd() * TAUNTS.length)];
    sfx('tetrisOver');
    try { if (RT.Audio && RT.Audio.stopMusic) RT.Audio.stopMusic(); } catch (e) {}
  }

  function winRun() {
    if (S.won) return;
    S.won = true;
    S.piece = null;
    S.phase = 'won';
    S.phaseFrame = 0;
    S.flash = 1;
    S.shake = 10;
    S.celebrate = 240;
    sfx('tetrisTetris');
    sfx('win');
  }

  // =========================================================================== //
  //  INPUT                                                                      //
  // =========================================================================== //
  // Everything funnels through press()/release() so the keyboard, the on-screen
  // buttons, board gestures and RT.Tetris.input() all behave identically.

  var lastUpdate = 0;
  function driven() { return active && (Date.now() - lastUpdate) < 400; }

  function canAct() { return !!(S && !S.over && !S.won && !S.paused); }

  function doLeft()  { if (S.piece && tryMove(-1, 0)) sfx('tetrisMove'); }
  function doRight() { if (S.piece && tryMove(1, 0))  sfx('tetrisMove'); }

  function doSoft() {
    if (!S.piece) return;
    if (tryMove(0, 1)) { S.softCells++; S.gravity = 0; }
    else lockPiece(false);
  }

  function doHardDrop() {
    if (!S.piece) return;
    var cells = 0;
    while (tryMove(0, 1)) cells++;
    S.softCells += cells;                  // our hard drop pays like a soft drop
    S.dropTrail = { x: S.piece.x, name: S.piece.name, rot: S.piece.rot, y: S.piece.y, from: S.piece.y - cells, t: 10 };
    sfx('tetrisMove');
    lockPiece(true);
  }

  // One-shot action, used by taps, key presses and RT.Tetris.input().
  function act(name) {
    if (!S || !canAct()) return;
    if (name === 'left') doLeft();
    else if (name === 'right') doRight();
    else if (name === 'down') doSoft();
    else if (name === 'rotA') tryRotate(1);
    else if (name === 'rotB') tryRotate(-1);
    else if (name === 'harddrop') doHardDrop();
  }

  function press(name) {
    if (!S) return;
    if (S.paused) { onPause(false); return; }      // any button lifts the pause
    if (S.over || S.won) {
      // The end cards take the same buttons: any drop/rotate retries or finishes.
      if (name === 'harddrop' || name === 'rotA' || name === 'rotB') endAction();
      return;
    }
    if (name === 'left' || name === 'right') {
      var dir = name === 'left' ? -1 : 1;
      S.held[name] = true;
      S.dasDir = dir;
      S.dasTimer = DAS_INITIAL;
      if (S.piece) act(name);
      return;
    }
    if (name === 'down') { S.held.down = true; S.softTimer = 0; if (S.piece) doSoft(); return; }
    act(name);
  }

  function release(name) {
    if (!S) return;
    if (name === 'left' || name === 'right') {
      S.held[name] = false;
      if (S.held.left && !S.held.right) { S.dasDir = -1; S.dasTimer = DAS_INITIAL; }
      else if (S.held.right && !S.held.left) { S.dasDir = 1; S.dasTimer = DAS_INITIAL; }
      else if (!S.held.left && !S.held.right) { S.dasDir = 0; S.dasTimer = 0; }
      return;
    }
    if (name === 'down') { S.held.down = false; S.softTimer = 0; }
  }

  function releaseAll() {
    if (!S) return;
    S.held.left = S.held.right = S.held.down = false;
    S.dasDir = 0; S.dasTimer = 0;
    for (var k in pointers) { if (pointers.hasOwnProperty(k)) delete pointers[k]; }
  }

  // engine.js routes Esc / P / the pause button here while a mode is active.
  function onPause(forceState) {
    if (!S || S.over || S.won) return false;
    S.paused = (forceState === undefined) ? !S.paused : !!forceState;
    if (S.paused) {
      S.held.left = S.held.right = S.held.down = false;
      S.dasDir = 0; S.dasTimer = 0;
      S.queue.length = 0;
    }
    sfx('ui');
    return S.paused;
  }

  // What the big button on an end card does.
  function endAction() {
    if (!S) return;
    if (S.over) { restart(); return; }
    if (S.won) { finish(); return; }
  }

  // ------------------------------------------------------------------ keyboard --
  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowDown: 'down', KeyS: 'down',
    ArrowUp: 'rotA', KeyX: 'rotA', KeyW: 'rotA', KeyK: 'rotA',
    KeyZ: 'rotB', KeyJ: 'rotB', ControlLeft: 'rotB',
    Space: 'harddrop'
  };
  function keyName(e) {
    var c = e.code;
    if (!c) {                                   // very old browsers: fall back
      var k = e.key;
      if (k === 'ArrowLeft') c = 'ArrowLeft'; else if (k === 'ArrowRight') c = 'ArrowRight';
      else if (k === 'ArrowDown') c = 'ArrowDown'; else if (k === 'ArrowUp') c = 'ArrowUp';
      else if (k === ' ') c = 'Space'; else if (k) c = 'Key' + String(k).toUpperCase();
    }
    return c;
  }

  function eat(e) {
    e.__rtTetris = true;
    if (e.preventDefault) e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    try { if (RT.Audio && RT.Audio.unlock) RT.Audio.unlock(); } catch (err) {}
  }

  function handleKey(e, down) {
    if (!S || !driven()) return;
    if (e.__rtTetris) return;                   // the engine may also route this
    var code = keyName(e);
    var name = KEYMAP[code];
    if (code === 'KeyR' || code === 'Enter' || code === 'NumpadEnter') {
      eat(e);
      if (!down || e.repeat) return;
      if (S.over || S.won) endAction(); else restart();
      return;
    }
    if (code === 'KeyQ') {
      eat(e);
      if (down && !e.repeat) quit();
      return;
    }
    if (!name) return;
    eat(e);
    if (down) { if (e.repeat) return; press(name); } else release(name);
  }

  function onKeyDown(e) { handleKey(e, true); }
  function onKeyUp(e) { handleKey(e, false); }

  // ------------------------------------------------------------------- pointers --
  var pointers = {};        // pointerId -> {btn, board, x, y, sx, sy, t, moved, accX, accY}
  var canvasEl = null;

  function canvasPoint(ev) {
    if (!canvasEl || !L) return null;
    var r = canvasEl.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return {
      x: (ev.clientX - r.left) / r.width * L.w,
      y: (ev.clientY - r.top) / r.height * L.h
    };
  }

  function hitButton(px, py) {
    if (!L) return null;
    for (var i = 0; i < L.buttons.length; i++) {
      var b = L.buttons[i];
      if (b.round) {
        var cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = b.w / 2 + 8;
        var dx = px - cx, dy = py - cy;
        if (dx * dx + dy * dy <= r * r) return b;
      } else if (px >= b.x - 4 && px <= b.x + b.w + 4 && py >= b.y - 4 && py <= b.y + b.h + 4) {
        return b;
      }
    }
    return null;
  }

  function onPointerDown(ev) {
    if (!S || !driven()) return;
    layoutIfNeeded();
    var p = canvasPoint(ev);
    if (!p) return;
    if (ev.preventDefault) ev.preventDefault();
    try { if (canvasEl.setPointerCapture && ev.pointerId != null) canvasEl.setPointerCapture(ev.pointerId); } catch (e) {}

    // End cards first: the whole card is one big target.
    if (S.over || S.won) {
      var eb = hitButton(p.x, p.y);
      if (eb && eb.id === 'quit') { sfx('ui'); quit(); return; }
      sfx('ui');
      endAction();
      return;
    }
    var b = hitButton(p.x, p.y);
    if (b) {
      pointers[ev.pointerId] = { btn: b.id, t: 0 };
      b.litT = 8;
      if (b.id === 'quit') { sfx('ui'); quit(); return; }
      if (b.id === 'pause') { onPause(); return; }
      press(b.id);
      return;
    }
    if (S.paused) { onPause(false); return; }
    if (p.x >= L.inner.x && p.x <= L.inner.x + L.inner.w &&
        p.y >= L.inner.y && p.y <= L.inner.y + L.inner.h) {
      var t = { board: true, sx: p.x, sy: p.y, x: p.x, y: p.y, t: 0, moved: false, accX: 0, accY: 0, holdDir: null };
      pointers[ev.pointerId] = t;
      if (canAct()) {
        var rel = (p.x - L.well.x) / L.well.w;
        if (rel < 0.34) { t.holdDir = 'left'; press('left'); }
        else if (rel > 0.66) { t.holdDir = 'right'; press('right'); }
      }
    }
  }

  function onPointerMove(ev) {
    var t = pointers[ev.pointerId];
    if (!t || !S || !driven()) return;
    var p = canvasPoint(ev);
    if (!p) return;
    if (ev.preventDefault) ev.preventDefault();

    if (t.btn) {
      var b = null;
      for (var i = 0; i < L.buttons.length; i++) if (L.buttons[i].id === t.btn) b = L.buttons[i];
      if (b) {
        var inside = hitButton(p.x, p.y) === b;
        if (!inside) { release(t.btn); delete pointers[ev.pointerId]; }
        else b.litT = 8;
      }
      return;
    }
    if (!t.board || !canAct()) return;

    t.accX += p.x - t.x;
    t.accY += p.y - t.y;
    t.x = p.x; t.y = p.y;
    if (t.holdDir && (Math.abs(p.x - t.sx) > L.cell * 0.9 || Math.abs(p.y - t.sy) > L.cell * 0.9)) {
      release(t.holdDir); t.holdDir = null; t.moved = true; t.accX = 0; t.accY = 0;
    }
    if (t.holdDir) return;                      // still holding a direction: let DAS run
    var cw = L.cell, guard = 0;
    while (Math.abs(t.accX) >= cw && guard++ < 12) {
      if (t.accX > 0) { act('right'); t.accX -= cw; } else { act('left'); t.accX += cw; }
      t.moved = true;
    }
    guard = 0;
    while (t.accY >= cw && guard++ < 24) { act('down'); t.accY -= cw; t.moved = true; }
    if (t.accY < -cw) t.accY = -cw;
  }

  function onPointerUp(ev) {
    var t = pointers[ev.pointerId];
    if (!t) return;
    delete pointers[ev.pointerId];
    if (!S || !driven()) return;
    if (ev.preventDefault) ev.preventDefault();
    if (t.btn) { release(t.btn); return; }
    if (t.holdDir) { release(t.holdDir); t.holdDir = null; return; }
    if (!t.board || !canAct()) return;

    var p = canvasPoint(ev) || { x: t.x, y: t.y };
    var dx = p.x - t.sx, dy = p.y - t.sy, cw = L.cell;
    if (!t.moved && t.t < 22) { act('rotA'); return; }   // a tap in the middle rotates
    // A flick is judged on speed, not distance: a slow drag down is a soft drop
    // (already applied, cell by cell, in onPointerMove) and must not slam.
    var vy = dy / Math.max(1, t.t);
    if (t.t <= 14 && dy < -cw * 1.1 && -vy > cw * 0.45 && Math.abs(dx) < cw * 2) { act('rotA'); return; }
    if (t.t <= 14 && dy > cw * 2.2 && vy > cw * 0.8 && Math.abs(dx) < cw * 2) { act('harddrop'); }
  }

  function onPointerCancel(ev) {
    var t = pointers[ev.pointerId];
    if (!t) return;
    delete pointers[ev.pointerId];
    if (t.btn) release(t.btn);
    if (t.holdDir) release(t.holdDir);
  }

  function onBlur() { releaseAll(); }

  function bindInput() {
    canvasEl = document.getElementById('game') || document.querySelector('canvas');
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    if (canvasEl) {
      canvasEl.addEventListener('pointerdown', onPointerDown, { passive: false });
      canvasEl.addEventListener('pointermove', onPointerMove, { passive: false });
      canvasEl.addEventListener('pointerup', onPointerUp, { passive: false });
      canvasEl.addEventListener('pointercancel', onPointerCancel, { passive: false });
      canvasEl.addEventListener('pointerleave', onPointerCancel, { passive: false });
    }
  }

  function unbindInput() {
    window.removeEventListener('keydown', onKeyDown, true);
    window.removeEventListener('keyup', onKeyUp, true);
    window.removeEventListener('blur', onBlur);
    if (canvasEl) {
      canvasEl.removeEventListener('pointerdown', onPointerDown);
      canvasEl.removeEventListener('pointermove', onPointerMove);
      canvasEl.removeEventListener('pointerup', onPointerUp);
      canvasEl.removeEventListener('pointercancel', onPointerCancel);
      canvasEl.removeEventListener('pointerleave', onPointerCancel);
    }
  }

  // =========================================================================== //
  //  UPDATE - one call is exactly one 60 Hz frame                               //
  // =========================================================================== //
  function update(dt) {
    if (!S) return;
    lastUpdate = Date.now();
    if (S.paused) { S.frame++; return; }
    S.frame++;
    S.phaseFrame++;

    // decay the visual timers
    if (S.flash > 0) S.flash = Math.max(0, S.flash - 0.07);
    if (S.shake > 0) S.shake = Math.max(0, S.shake - 0.6);
    if (S.celebrate > 0) S.celebrate--;
    if (S.scorePop > 0) S.scorePop--;
    if (S.levelPop > 0) S.levelPop--;
    if (S.dropTrail) { S.dropTrail.t--; if (S.dropTrail.t <= 0) S.dropTrail = null; }
    for (var i = 0; i < BUTTONS.length; i++) {
      if (BUTTONS[i].litT > 0) BUTTONS[i].litT--;
    }
    for (var pid in pointers) { if (pointers.hasOwnProperty(pid)) pointers[pid].t++; }
    stepParticles();

    // ---- phase machine ----
    if (S.phase === 'ready') {
      if (S.phaseFrame >= 26) spawnPiece();
    } else if (S.phase === 'clearing') {
      // NES sweep: two columns every four frames, five steps, then the rows drop.
      if ((S.phaseFrame - 1) % CLEAR_STEP === 0) {
        S.clearStep++;
        if (S.clearStep <= CLEAR_STEPS) sparkleClear();
        if (S.clearStep > CLEAR_STEPS) applyClear();
      }
    } else if (S.phase === 'are') {
      if (S.phaseFrame >= S.are) spawnPiece();
    } else if (S.phase === 'over') {
      // the curtain crawls down the well, then the card appears
      S.curtainTimer++;
      if (S.curtain < ROWS && S.curtainTimer % 3 === 0) {
        S.curtain++;
        if (S.curtain % 4 === 0) sfx('tetrisLock');
      }
      if (S.curtain >= ROWS && !S.endCalled) {
        S.endCalled = true;
        S.endFrame = S.frame;
        callback('onLose');
      }
    } else if (S.phase === 'won') {
      if (S.phaseFrame === 1) { try { if (RT.Audio && RT.Audio.stopMusic) RT.Audio.stopMusic(); } catch (e) {} }
      if (S.phaseFrame > 150 && !S.endCalled) {
        S.endCalled = true;
        S.endFrame = S.frame;
        callback('onWin');
      }
    }

    // ---- queued one-shot inputs (tests, and taps that landed mid-ARE) ----
    if (S.queue.length && S.piece && canAct()) {
      var guard = 0;
      while (S.queue.length && S.piece && guard++ < 8) act(S.queue.shift());
    } else if (S.queue.length > 24) {
      S.queue.length = 0;
    }

    if (S.phase !== 'falling' || !S.piece) return;

    // ---- DAS ----
    if (S.dasDir !== 0 && (S.held.left || S.held.right)) {
      S.dasTimer--;
      if (S.dasTimer <= 0) {
        S.dasTimer = DAS_REPEAT;
        if (S.dasDir < 0) doLeft(); else doRight();
      }
    }

    // ---- gravity / soft drop ----
    var interval = S.held.down ? Math.min(SOFT_FRAMES, S.dropDelay) : S.dropDelay;
    S.gravity++;
    if (S.gravity >= interval) {
      S.gravity = 0;
      if (tryMove(0, 1)) {
        if (S.held.down) S.softCells++;
      } else {
        lockPiece(false);
      }
    }
  }

  // =========================================================================== //
  //  LAYOUT                                                                     //
  // =========================================================================== //
  var L = null;                 // last computed layout
  var lastW = 960, lastH = 540;
  var BUTTONS = [];             // persistent so a lit button keeps its glow

  function touchLikely() {
    try {
      if (document.body && document.body.classList.contains('touch')) return true;
      if ('ontouchstart' in window) return true;
      if (navigator.maxTouchPoints > 0 && lastW < 1100) return true;
    } catch (e) {}
    return lastW < 820;
  }

  function button(id, x, y, w, h, round, label, sub) {
    var b = null;
    for (var i = 0; i < BUTTONS.length; i++) if (BUTTONS[i].id === id) b = BUTTONS[i];
    if (!b) { b = { id: id, litT: 0 }; BUTTONS.push(b); }
    b.x = x; b.y = y; b.w = w; b.h = h; b.round = !!round; b.label = label; b.sub = sub || '';
    b.used = true;
    return b;
  }

  // Three layouts, all built from the same cell size:
  //   portrait phone  - cabinet fills the width, a two row pad underneath
  //   landscape phone - thumbs at the sides, the cabinet gets the whole height
  //   desktop         - cabinet centred, one slim row of buttons plus key hints
  function layout(w, h) {
    lastW = w; lastH = h;
    var i;
    for (i = 0; i < BUTTONS.length; i++) BUTTONS[i].used = false;

    var pads = touchLikely();
    var portrait = (w / h) < 1.3;
    var sidePads = pads && !portrait;
    var margin = clamp(Math.min(w, h) * 0.022, 6, 22);
    var bez = clamp(Math.min(w, h) * 0.022, 7, 20);
    var padH = sidePads ? 0 : (pads ? clamp(h * 0.27, 104, 188) : clamp(h * 0.12, 58, 84));
    var padW = sidePads ? clamp(w * 0.155, 96, 200) : 0;
    var gap = clamp(w * 0.016, 6, 16);

    var scrX = margin + padW, scrY = margin;
    var scrW = w - margin * 2 - padW * 2, scrH = h - margin * 2 - padH;
    var inX = scrX + bez, inY = scrY + bez;
    var inW = scrW - bez * 2, inH = scrH - bez * 2;

    var cell, wellX, wellY, headerH, panel, statsPanel = null;

    if (portrait) {
      cell = Math.max(6, Math.floor(Math.min(inH / 24.2, inW / 11.4)));
      var wellW = cell * COLS, wellH = cell * ROWS;
      headerH = Math.min(cell * 3.6, inH - wellH - cell * 0.6);
      wellX = Math.round(inX + (inW - wellW) / 2);
      wellY = Math.round(inY + headerH + (inH - headerH - wellH) / 2);
      panel = { x: inX + cell * 0.3, y: inY + cell * 0.25, w: inW - cell * 0.6, h: headerH - cell * 0.4, portrait: true };
    } else {
      cell = Math.max(6, Math.floor(Math.min(inH / 21.4, inW / 21.5)));
      var wW = cell * COLS, wH = cell * ROWS;
      var sideW = cell * 5.3;
      var statW = cell * 4.4;
      var showStats = (statW + wW + sideW + cell * 1.6) <= inW;
      var totalW = showStats ? (statW + wW + sideW + cell * 1.6) : (wW + sideW + cell * 0.9);

      // shrink wrap the cabinet around the content so a wide window does not
      // leave the CRT stranded in a sea of bezel
      var needW = totalW + cell * 1.2 + bez * 2;
      if (needW < scrW) {
        scrX = Math.round((w - needW) / 2); scrW = Math.round(needW);
        inX = scrX + bez; inW = scrW - bez * 2;
      }

      var startX = inX + Math.max(0, (inW - totalW) / 2);
      wellY = Math.round(inY + (inH - wH) / 2 + cell * 0.4);
      if (showStats) {
        statsPanel = { x: Math.round(startX), y: wellY + cell * 2, w: Math.round(statW), h: Math.round(wH - cell * 3) };
        wellX = Math.round(startX + statW + cell * 0.8);
      } else {
        wellX = Math.round(startX);
      }
      panel = { x: Math.round(wellX + wW + cell * 0.8), y: wellY, w: Math.round(sideW), h: Math.round(wH), portrait: false };
    }

    var well = { x: wellX, y: wellY, w: cell * COLS, h: cell * ROWS };
    var qs = clamp(Math.min(w, h) * 0.055, 32, 46);

    // ---- controls --------------------------------------------------------
    if (sidePads) {
      // landscape phone: a cluster under each thumb, screen keeps the height
      var colL = (margin + padW) / 2, colR = w - (margin + padW) / 2;
      var sq = clamp(Math.min(padW * 0.44, h * 0.21), 40, 96);
      var rowY = h - margin - (sq * 1.72 + gap) - 4;
      button('left',  colL - gap / 2 - sq, rowY, sq, sq, false, 'left');
      button('right', colL + gap / 2, rowY, sq, sq, false, 'right');
      button('down',  colL - sq / 2, rowY + sq + gap, sq, sq * 0.72, false, 'down');
      button('rotB', colR - gap / 2 - sq, rowY, sq, sq, true, 'B');
      button('rotA', colR + gap / 2, rowY, sq, sq, true, 'A');
      button('harddrop', colR - sq - gap / 2, rowY + sq + gap, sq * 2 + gap, sq * 0.72, false, 'DROP');
      button('quit', inX + inW - qs - 4, inY + 4, qs, qs, false, 'X');
      button('pause', inX + inW - qs * 2 - 12, inY + 4, qs, qs, false, 'P');
    } else {
      var padY = h - padH;
      var lx = clamp(w * 0.03, 8, 40);
      var twoRow = padH >= 124;                  // portrait phones get a DROP bar row
      var hintH = pads ? 0 : 20;                 // keyboard hint line on desktop
      var rowH = twoRow ? padH * 0.56 : (padH - hintH);
      var rowY2 = twoRow ? padY + padH * 0.44 : padY;
      var rowCY = rowY2 + rowH / 2;

      var sq2 = clamp(Math.min(rowH * 0.82, (w * 0.5 - gap * 2) / 3), 40, 104);
      button('left',  lx, rowCY - sq2 / 2, sq2, sq2, false, 'left');
      button('down',  lx + sq2 + gap, rowCY - sq2 / 2, sq2, sq2, false, 'down');
      button('right', lx + (sq2 + gap) * 2, rowCY - sq2 / 2, sq2, sq2, false, 'right');

      var rBtn = Math.max(40, Math.min(rowH * 0.86, sq2 * 1.02,
                 (w - (lx + (sq2 + gap) * 3) - gap * 3) / 2));
      var rx = w - lx - rBtn;
      button('rotA', rx, rowCY - rBtn / 2 - rBtn * 0.05, rBtn, rBtn, true, 'A');
      button('rotB', rx - rBtn - gap, rowCY - rBtn / 2 + rBtn * 0.05, rBtn, rBtn, true, 'B');

      if (twoRow) {
        var dH = Math.min(padH * 0.34, 62);
        var dW = Math.min(w - lx * 2 - qs * 1.6, Math.max(180, w * 0.52));
        var dX = (w - dW) / 2 - qs * 0.3;
        var dY = padY + padH * 0.06;
        button('harddrop', dX, dY, dW, dH, false, 'DROP');
        button('quit', w - lx - qs, dY + (dH - qs) / 2, qs, qs, false, 'X');
        button('pause', lx, dY + (dH - qs) / 2, qs, qs, false, 'P');
      } else {
        var dLeft = lx + (sq2 + gap) * 3 + gap;
        var dRight = rx - rBtn - gap * 2;
        var dW2 = dRight - dLeft;
        var dH2 = Math.min(sq2 * 0.8, rowH * 0.6);
        if (dW2 >= 72) button('harddrop', dLeft, rowCY - dH2 / 2, dW2, dH2, false, 'DROP');
        else button('harddrop', lx, padY + 2, w - lx * 2, Math.max(28, padH * 0.26), false, 'DROP');
        button('quit', inX + inW - qs - 4, inY + 4, qs, qs, false, 'X');
        button('pause', inX + inW - qs * 2 - 12, inY + 4, qs, qs, false, 'P');
      }
    }

    var keep = [];
    for (i = 0; i < BUTTONS.length; i++) if (BUTTONS[i].used) keep.push(BUTTONS[i]);
    BUTTONS = keep;

    L = {
      w: w, h: h, cell: cell, portrait: portrait, pads: pads, sidePads: sidePads,
      screen: { x: scrX, y: scrY, w: scrW, h: scrH },
      inner: { x: inX, y: inY, w: inW, h: inH },
      bez: bez, well: well, panel: panel, stats: statsPanel,
      padY: sidePads ? h : (h - padH), padH: padH, padW: padW, buttons: BUTTONS
    };
    return L;
  }

  function layoutIfNeeded() { if (!L) layout(lastW, lastH); }

  // =========================================================================== //
  //  PARTICLES (mode-local; the engine's belong to the platformer)              //
  // =========================================================================== //
  var parts = [];
  function spark(x, y, vx, vy, life, color, size, grav) {
    if (parts.length > 340) return;
    parts.push({ x: x, y: y, vx: vx, vy: vy, t: life, life: life, c: color, s: size, g: grav == null ? 0.22 : grav });
  }
  function stepParticles() {
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.vx *= 0.99; p.t--;
      if (p.t <= 0) parts.splice(i, 1);
    }
  }
  function drawParticles(g) {
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i], a = p.t / p.life;
      g.globalAlpha = a;
      g.fillStyle = p.c;
      g.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    g.globalAlpha = 1;
  }
  // Sparks thrown out of the row(s) being swept, at the two columns leaving now.
  function sparkleClear() {
    layoutIfNeeded();
    if (!S || !S.clearRows.length) return;
    var pal = paletteFor(S.level);
    var step = S.clearStep - 1;
    var cl = 4 - step, cr = 5 + step;
    var cell = L.cell;
    for (var i = 0; i < S.clearRows.length; i++) {
      var ry = S.clearRows[i];
      var py = L.well.y + ry * cell + cell / 2;
      var cols = [cl, cr];
      for (var k = 0; k < 2; k++) {
        var px = L.well.x + cols[k] * cell + cell / 2;
        for (var n = 0; n < 4; n++) {
          spark(px, py, (Math.random() - 0.5) * 3.2, (Math.random() - 0.9) * 2.6,
                16 + Math.random() * 14, n % 2 ? WHITE : (k ? pal.c2 : pal.c1),
                Math.max(2, cell * 0.16), 0.16);
        }
      }
    }
  }
  function celebrationBurst() {
    layoutIfNeeded();
    var pal = paletteFor(S.level), cell = L.cell;
    for (var i = 0; i < 26; i++) {
      var px = L.well.x + Math.random() * L.well.w;
      spark(px, L.well.y + L.well.h, (Math.random() - 0.5) * 4, -3 - Math.random() * 5,
            34 + Math.random() * 26, [pal.c1, pal.c2, WHITE, '#FFD23F'][i % 4],
            Math.max(2, cell * 0.2), 0.14);
    }
  }

  // =========================================================================== //
  //  LOW LEVEL DRAWING                                                          //
  // =========================================================================== //
  var MONO = 'ui-monospace,"SF Mono",Menlo,Consolas,"Courier New",monospace';
  var UIF = '"Trebuchet MS","Segoe UI",Roboto,system-ui,sans-serif';

  function text(g, str, x, y, o) {
    o = o || {};
    var size = o.size || 14;
    g.font = (o.weight || 900) + ' ' + size + 'px ' + (o.mono ? MONO : UIF);
    g.textAlign = o.align || 'left';
    g.textBaseline = o.baseline || 'alphabetic';
    if (o.track) {
      // manual letter spacing (canvas letterSpacing is not everywhere yet)
      var chars = String(str).split(''), i, wsum = 0;
      for (i = 0; i < chars.length; i++) wsum += g.measureText(chars[i]).width + o.track;
      wsum -= o.track;
      var cx = o.align === 'center' ? x - wsum / 2 : (o.align === 'right' ? x - wsum : x);
      g.textAlign = 'left';
      for (i = 0; i < chars.length; i++) {
        if (o.shadow) { g.fillStyle = o.shadow; g.fillText(chars[i], cx + 2, y + 2); }
        g.fillStyle = o.color || '#fff';
        g.fillText(chars[i], cx, y);
        cx += g.measureText(chars[i]).width + o.track;
      }
      return wsum;
    }
    if (o.shadow) { g.fillStyle = o.shadow; g.fillText(String(str), x + (o.sx || 2), y + (o.sy || 2)); }
    g.fillStyle = o.color || '#fff';
    g.fillText(String(str), x, y);
    return g.measureText(String(str)).width;
  }

  // shrink a font size until the string fits the given width
  function fitSize(g, str, maxW, size, mono) {
    g.font = '900 ' + size + 'px ' + (mono ? MONO : UIF);
    var w = g.measureText(String(str)).width;
    return w > maxW && w > 0 ? Math.max(7, size * (maxW / w)) : size;
  }

  function pad(n, len) {
    var s = String(Math.max(0, Math.floor(n)));
    while (s.length < len) s = '0' + s;
    return s;
  }

  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
    g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
    g.closePath();
  }

  function shade(hex, f) {
    var v = hex.replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    var r = parseInt(v.substr(0, 2), 16), gg = parseInt(v.substr(2, 2), 16), b = parseInt(v.substr(4, 2), 16);
    if (f >= 0) { r = r + (255 - r) * f; gg = gg + (255 - gg) * f; b = b + (255 - b) * f; }
    else { r = r * (1 + f); gg = gg * (1 + f); b = b * (1 + f); }
    return 'rgb(' + Math.round(clamp(r, 0, 255)) + ',' + Math.round(clamp(gg, 0, 255)) + ',' + Math.round(clamp(b, 0, 255)) + ')';
  }

  // One NES block.  Three tile styles, drawn on an 8 unit grid like the ROM art.
  function drawBlock(g, x, y, size, color, style, alpha) {
    var u = size / 8;
    if (alpha != null && alpha < 1) g.globalAlpha = alpha;
    if (style === 'white') {
      g.fillStyle = '#0b0b12';
      g.fillRect(x, y, size, size);
      g.fillStyle = WHITE;
      g.fillRect(x + u, y + u, size - u * 2, size - u * 2);
      g.fillStyle = 'rgba(0,0,0,.82)';
      g.fillRect(x + u * 2.2, y + u * 2.2, size - u * 4.4, size - u * 4.4);
      g.fillStyle = WHITE;
      g.fillRect(x + u * 3.2, y + u * 3.2, size - u * 6.4, size - u * 6.4);
      g.fillStyle = 'rgba(255,255,255,.55)';
      g.fillRect(x + u, y + u, size - u * 2, u * 0.9);
    } else {
      g.fillStyle = '#07070d';
      g.fillRect(x, y, size, size);
      g.fillStyle = color;
      g.fillRect(x + u, y + u, size - u * 2, size - u * 2);
      // NES corner highlight
      g.fillStyle = WHITE;
      g.fillRect(x + u, y + u, u * 2, u * 2);
      // bevel: bright top/left, dark bottom/right
      g.fillStyle = shade(color, 0.42);
      g.fillRect(x + u * 3, y + u, size - u * 4, u * 0.9);
      g.fillRect(x + u, y + u * 3, u * 0.9, size - u * 4);
      g.fillStyle = shade(color, -0.42);
      g.fillRect(x + u, y + size - u * 2, size - u * 2, u);
      g.fillStyle = shade(color, -0.3);
      g.fillRect(x + size - u * 2, y + u, u, size - u * 2);
    }
    if (alpha != null && alpha < 1) g.globalAlpha = 1;
  }

  function drawPieceAt(g, name, rot, px, py, size, pal, alpha) {
    var def = PIECES[name];
    var n = def.states.length;
    var st = def.states[((rot % n) + n) % n];
    var color = pieceColor(name, pal);
    for (var i = 0; i < st.length; i++) {
      drawBlock(g, px + st[i][1] * size, py + st[i][0] * size, size, color, def.style, alpha);
    }
  }

  // =========================================================================== //
  //  DRAW                                                                       //
  // =========================================================================== //
  function draw(g, w, h) {
    if (!S) return;
    if (!L || L.w !== w || L.h !== h || (S.frame % 30 === 0)) layout(w, h);
    var pal = paletteFor(S.level);

    drawRoom(g, w, h);
    drawCabinet(g, pal);

    // everything on the glass shakes together
    g.save();
    var sh = S.shake;
    if (sh > 0.2) {
      g.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
    }
    g.save();
    rr(g, L.inner.x, L.inner.y, L.inner.w, L.inner.h, L.bez * 0.7);
    g.clip();
    drawScreenBg(g, pal);
    drawWell(g, pal);
    drawPanels(g, pal);
    drawParticles(g);
    drawFlash(g, pal);
    drawCelebration(g, pal);
    drawCards(g, pal);
    drawGlass(g);
    g.restore();
    g.restore();

    drawPad(g, pal);
  }

  // --------------------------------------------------------------- the room --
  function drawRoom(g, w, h) {
    var grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#05060d');
    grd.addColorStop(0.55, '#080b18');
    grd.addColorStop(1, '#03040a');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);

    // glow of the screen spilling into the room
    var cx = L.inner.x + L.inner.w / 2, cy = L.inner.y + L.inner.h / 2;
    var r = Math.max(L.inner.w, L.inner.h) * 0.95;
    var gl = g.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
    var pal = paletteFor(S.level);
    gl.addColorStop(0, hexA(pal.c1, 0.17));
    gl.addColorStop(0.5, hexA(pal.c2, 0.05));
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gl;
    g.fillRect(0, 0, w, h);
  }

  // ------------------------------------------------------------ the cabinet --
  function drawCabinet(g, pal) {
    var s = L.screen, b = L.bez;
    // outer plastic
    var grd = g.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
    grd.addColorStop(0, '#2b3350');
    grd.addColorStop(0.06, '#1b2138');
    grd.addColorStop(0.9, '#111424');
    grd.addColorStop(1, '#0a0d1a');
    rr(g, s.x - b * 0.5, s.y - b * 0.5, s.w + b, s.h + b, b * 1.3);
    g.fillStyle = grd;
    g.fill();
    // rim light
    g.lineWidth = Math.max(1, b * 0.16);
    g.strokeStyle = 'rgba(160,200,255,.20)';
    g.stroke();

    // inner bezel lip
    rr(g, L.inner.x - b * 0.42, L.inner.y - b * 0.42, L.inner.w + b * 0.84, L.inner.h + b * 0.84, b * 0.8);
    g.strokeStyle = 'rgba(0,0,0,.75)';
    g.lineWidth = Math.max(2, b * 0.5);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.07)';
    g.lineWidth = 1;
    g.stroke();

    // four screws
    var sc = Math.max(2.5, b * 0.28);
    var pts = [[s.x + b * 0.7, s.y + b * 0.7], [s.x + s.w - b * 0.7, s.y + b * 0.7],
               [s.x + b * 0.7, s.y + s.h - b * 0.7], [s.x + s.w - b * 0.7, s.y + s.h - b * 0.7]];
    for (var i = 0; i < 4; i++) {
      g.beginPath();
      g.arc(pts[i][0], pts[i][1], sc, 0, Math.PI * 2);
      g.fillStyle = '#0b0e18';
      g.fill();
      g.strokeStyle = 'rgba(180,205,255,.22)';
      g.lineWidth = 1;
      g.stroke();
      g.beginPath();
      g.moveTo(pts[i][0] - sc * 0.6, pts[i][1] - sc * 0.2);
      g.lineTo(pts[i][0] + sc * 0.6, pts[i][1] + sc * 0.2);
      g.stroke();
    }

    // power LED + brand plate along the bottom bezel
    var ly = s.y + s.h - b * 0.5, lx = s.x + b * 1.9;
    var puls = 0.55 + 0.45 * Math.sin(S.frame * 0.06);
    g.beginPath();
    g.arc(lx, ly, Math.max(2, b * 0.2), 0, Math.PI * 2);
    g.fillStyle = S.over ? 'rgba(255,60,60,' + (0.5 + puls * 0.5) + ')' : 'rgba(90,255,150,' + (0.45 + puls * 0.4) + ')';
    g.fill();
    if (b > 9) {
      text(g, 'RAGE-TRIS', lx + b * 0.9, ly + b * 0.22, {
        size: Math.max(8, b * 0.62), color: 'rgba(180,205,255,.5)', track: 1.5
      });
      text(g, 'MODEL 28', s.x + s.w - b * 1.6, ly + b * 0.22, {
        size: Math.max(7, b * 0.5), color: 'rgba(130,155,205,.35)', align: 'right', track: 1.2
      });
    }
  }

  // ------------------------------------------------------------- the screen --
  function drawScreenBg(g, pal) {
    var i = L.inner;
    var grd = g.createLinearGradient(i.x, i.y, i.x + i.w * 0.3, i.y + i.h);
    grd.addColorStop(0, '#05070f');
    grd.addColorStop(1, '#020307');
    g.fillStyle = grd;
    g.fillRect(i.x, i.y, i.w, i.h);

    // faint starfield-ish CRT phosphor noise, cheap and static per frame count
    g.globalAlpha = 0.06;
    g.fillStyle = pal.c1;
    var n = 26, seed = Math.floor(S.frame / 8);
    for (var k = 0; k < n; k++) {
      var a = ((k * 73 + seed * 17) % 997) / 997, b2 = ((k * 191 + seed * 31) % 991) / 991;
      g.fillRect(i.x + a * i.w, i.y + b2 * i.h, 2, 2);
    }
    g.globalAlpha = 1;
  }

  // --------------------------------------------------------------- the well --
  function drawWell(g, pal) {
    var W = L.well, cell = L.cell, x, y;

    // recessed background
    var grd = g.createLinearGradient(W.x, W.y, W.x, W.y + W.h);
    grd.addColorStop(0, '#080a16');
    grd.addColorStop(1, '#04050d');
    g.fillStyle = grd;
    g.fillRect(W.x, W.y, W.w, W.h);

    // subtle grid
    g.strokeStyle = 'rgba(120,160,255,.055)';
    g.lineWidth = 1;
    g.beginPath();
    for (x = 1; x < COLS; x++) { g.moveTo(Math.round(W.x + x * cell) + 0.5, W.y); g.lineTo(Math.round(W.x + x * cell) + 0.5, W.y + W.h); }
    for (y = 1; y < ROWS; y++) { g.moveTo(W.x, Math.round(W.y + y * cell) + 0.5); g.lineTo(W.x + W.w, Math.round(W.y + y * cell) + 0.5); }
    g.stroke();

    // locked blocks (skip the columns the sweep has already taken)
    var sweeping = S.phase === 'clearing';
    var step = S.clearStep;
    for (y = 0; y < ROWS; y++) {
      var inClear = sweeping && S.clearRows.indexOf(y) >= 0;
      for (x = 0; x < COLS; x++) {
        var v = S.board[y][x];
        if (!v) continue;
        if (inClear && Math.abs(x - 4.5) < step) continue;
        var name = BY_ID[v];
        drawBlock(g, W.x + x * cell, W.y + y * cell, cell, pieceColor(name, pal), PIECES[name].style);
      }
      if (inClear) {
        // white hot bar behind what is left of the row
        g.globalAlpha = 0.35 + 0.25 * Math.sin(S.frame * 0.9);
        g.fillStyle = WHITE;
        var halfW = (step / 5) * (W.w / 2);
        g.fillRect(W.x + W.w / 2 - halfW, W.y + y * cell, halfW * 2, cell);
        g.globalAlpha = 1;
      }
    }

    // hard drop trail
    if (S.dropTrail) {
      var t = S.dropTrail, a = t.t / 10;
      g.globalAlpha = a * 0.35;
      var def = PIECES[t.name], n = def.states.length;
      var st = def.states[((t.rot % n) + n) % n];
      for (var i2 = 0; i2 < st.length; i2++) {
        var cx2 = W.x + (t.x + st[i2][1]) * cell;
        var y0 = W.y + (t.from + st[i2][0]) * cell;
        var y1 = W.y + (t.y + st[i2][0]) * cell;
        var gg = g.createLinearGradient(0, y0, 0, y1);
        gg.addColorStop(0, 'rgba(255,255,255,0)');
        gg.addColorStop(1, pieceColor(t.name, pal));
        g.fillStyle = gg;
        g.fillRect(cx2 + cell * 0.22, y0, cell * 0.56, Math.max(0, y1 - y0));
      }
      g.globalAlpha = 1;
    }

    // the falling piece
    if (S.piece) {
      var p = S.piece;
      var cells = cellsOf(p.name, p.rot, p.x, p.y);
      var col = pieceColor(p.name, pal);
      for (var i = 0; i < cells.length; i++) {
        var cy = cells[i][0], cx = cells[i][1];
        if (cy < 0) continue;
        drawBlock(g, W.x + cx * cell, W.y + cy * cell, cell, col, PIECES[p.name].style);
      }
    }

    // the top-out curtain: the NES fills the well from the top down
    if (S.phase === 'over' && S.curtain > 0) {
      for (y = 0; y < S.curtain && y < ROWS; y++) {
        for (x = 0; x < COLS; x++) {
          var id2 = 1 + ((x * 3 + y * 5 + (x * y) % 3) % 7);
          var nm = BY_ID[id2];
          drawBlock(g, W.x + x * cell, W.y + y * cell, cell, pieceColor(nm, pal), PIECES[nm].style);
        }
      }
    }

    // well frame: double line, NES style
    g.strokeStyle = 'rgba(200,225,255,.85)';
    g.lineWidth = Math.max(2, cell * 0.1);
    g.strokeRect(Math.round(W.x) - g.lineWidth / 2, Math.round(W.y) - g.lineWidth / 2,
                 Math.round(W.w) + g.lineWidth, Math.round(W.h) + g.lineWidth);
    g.strokeStyle = 'rgba(80,120,220,.5)';
    g.lineWidth = 1;
    g.strokeRect(Math.round(W.x) - Math.max(3, cell * 0.2), Math.round(W.y) - Math.max(3, cell * 0.2),
                 Math.round(W.w) + Math.max(6, cell * 0.4), Math.round(W.h) + Math.max(6, cell * 0.4));

    // danger line: the NES has no such thing, but a finale deserves one
    if (!S.over && !S.won) {
      var top = topHeight();
      if (top >= 14) {
        g.globalAlpha = 0.25 + 0.2 * Math.sin(S.frame * 0.25);
        g.fillStyle = '#ff3b3b';
        g.fillRect(W.x, W.y, W.w, Math.max(2, cell * 0.14));
        g.globalAlpha = 1;
      }
    }
  }

  function topHeight() {
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) if (S.board[y][x]) return ROWS - y;
    }
    return 0;
  }

  // ------------------------------------------------------------- the panels --
  function boxFrame(g, x, y, w, h, title, pal) {
    g.fillStyle = 'rgba(4,6,14,.82)';
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(200,225,255,.78)';
    g.lineWidth = Math.max(1.5, L.cell * 0.07);
    g.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w), Math.round(h));
    if (title) {
      var fs = Math.max(8, Math.min(L.cell * 0.52, h * 0.3));
      g.fillStyle = 'rgba(4,6,14,.95)';
      var tw = fs * (title.length * 0.78 + 1.2);
      g.fillRect(x + fs * 0.6, y - fs * 0.62, tw, fs * 1.24);
      text(g, title, x + fs * 1.1, y + fs * 0.3, { size: fs, color: 'rgba(190,220,255,.92)', track: fs * 0.14, mono: true });
    }
  }

  function readout(g, x, y, w, label, value, color, big) {
    var cell = L.cell;
    var ls = Math.max(8, cell * 0.46);
    var vs = Math.max(11, cell * (big ? 0.82 : 0.68));
    text(g, label, x, y + ls, { size: ls, color: 'rgba(150,180,235,.85)', track: ls * 0.18, mono: true });
    vs = fitSize(g, value, w, vs, true);
    text(g, value, x + w, y + ls + vs * 1.15, {
      size: vs, color: color || '#fff', align: 'right', mono: true,
      shadow: 'rgba(0,0,0,.85)', sx: 2, sy: 2
    });
    return ls + vs * 1.3;
  }

  function drawNextBox(g, x, y, w, h, pal) {
    boxFrame(g, x, y, w, h, 'NEXT', pal);
    if (!S.next) return;
    var def = PIECES[S.next];
    var st = def.states[0];
    var minX = 9, maxX = -9, minY = 9, maxY = -9, i;
    for (i = 0; i < st.length; i++) {
      if (st[i][1] < minX) minX = st[i][1];
      if (st[i][1] > maxX) maxX = st[i][1];
      if (st[i][0] < minY) minY = st[i][0];
      if (st[i][0] > maxY) maxY = st[i][0];
    }
    var bw = maxX - minX + 1, bh = maxY - minY + 1;
    var sz = Math.min((w * 0.62) / Math.max(bw, 3), (h * 0.58) / Math.max(bh, 2));
    var ox = x + (w - bw * sz) / 2 - minX * sz;
    var oy = y + (h - bh * sz) / 2 - minY * sz + h * 0.04;
    drawPieceAt(g, S.next, 0, ox, oy, sz, pal);
  }

  function drawStatsPanel(g, r, pal) {
    boxFrame(g, r.x, r.y, r.w, r.h, 'STATISTICS', pal);
    var rowH = r.h / 7.6;
    var sz = Math.min(rowH * 0.32, r.w * 0.095);
    for (var i = 0; i < ORDER.length; i++) {
      var name = ORDER[i];
      var yy = r.y + rowH * (i + 0.85);
      drawPieceAt(g, name, 0, r.x + r.w * 0.1 + sz, yy - sz * 0.5, sz, pal);
      text(g, pad(S.stats[name], 3), r.x + r.w - 6, yy + sz * 0.7, {
        size: Math.max(9, Math.min(rowH * 0.44, r.w * 0.26)), color: '#ff5b5b', align: 'right', mono: true
      });
    }
  }

  function drawPanels(g, pal) {
    var cell = L.cell, p = L.panel;
    var goal = S.linesToWin;
    var linesTxt = pad(Math.min(S.lines, goal), 3) + '/' + pad(goal, 3);

    if (p.portrait) {
      // header band above the well: three chips on the left, NEXT on the right
      var nbW = Math.min(p.w * 0.29, cell * 4.0), nbH = Math.min(p.h * 0.92, cell * 3.0);
      var nbX = p.x + p.w - nbW, nbY = p.y + (p.h - nbH) / 2;
      drawNextBox(g, nbX, nbY, nbW, nbH, pal);

      var chipsW = p.w - nbW - cell * 0.5;
      var cw3 = chipsW / 3;
      var ls = Math.max(8, cell * 0.4);
      var vs = Math.max(12, Math.min(cell * 0.76, p.h * 0.42));
      var ty = p.y + (p.h - (ls + vs * 1.25)) / 2;
      var chips = [
        ['LEVEL', pad(S.level, 2), S.levelPop > 0 && (S.frame % 8 < 4) ? '#ffd23f' : '#fff'],
        ['LINES', linesTxt, S.lines >= goal ? '#5bff9b' : '#fff'],
        ['SCORE', pad(S.score, 6), S.scorePop > 0 ? '#ffd23f' : '#fff']
      ];
      for (var ci = 0; ci < 3; ci++) {
        var cxx = p.x + cw3 * ci;
        text(g, chips[ci][0], cxx, ty + ls, {
          size: ls, color: 'rgba(150,180,235,.85)', track: ls * 0.16, mono: true
        });
        var vsz = fitSize(g, chips[ci][1], cw3 - cell * 0.4, ci === 2 ? vs * 0.8 : vs, true);
        text(g, chips[ci][1], cxx, ty + ls + vs * 1.15, {
          size: vsz, color: chips[ci][2], mono: true, shadow: 'rgba(0,0,0,.85)', sx: 2, sy: 2
        });
      }
    } else {
      // right column: LINES / NEXT / LEVEL / SCORE, NES arrangement
      var x = p.x, w = p.w, y = p.y;
      var lineH = readout(g, x, y, w, 'LINES', linesTxt, S.lines >= goal ? '#5bff9b' : '#fff', true);
      y += lineH + cell * 0.5;
      var nbH2 = cell * 4.2;
      drawNextBox(g, x, y, w, nbH2, pal);
      y += nbH2 + cell * 0.9;
      y += readout(g, x, y, w, 'SCORE', pad(S.score, 6), S.scorePop > 0 ? '#ffd23f' : '#fff', true) + cell * 0.4;
      y += readout(g, x, y, w, 'LEVEL', pad(S.level, 2),
                   S.levelPop > 0 && (S.frame % 8 < 4) ? '#ffd23f' : '#fff', true) + cell * 0.4;
      y += readout(g, x, y, w, 'PIECES', pad(S.pieces, 3), 'rgba(200,225,255,.9)');
      text(g, '2 FRAMES / CELL', x, p.y + p.h - cell * 0.2, {
        size: Math.max(8, cell * 0.4), color: 'rgba(150,180,235,.55)', mono: true, track: cell * 0.04
      });
      if (L.stats) drawStatsPanel(g, L.stats, pal);
    }
  }

  // --------------------------------------------------------------- effects ---
  function drawFlash(g, pal) {
    if (S.flash <= 0) return;
    var i = L.inner;
    g.globalAlpha = Math.min(0.55, S.flash * (S.lastClear === 4 ? 0.8 : 0.55));
    g.fillStyle = S.lastClear === 4 ? (S.frame % 6 < 3 ? WHITE : pal.c2) : WHITE;
    g.fillRect(i.x, i.y, i.w, i.h);
    g.globalAlpha = 1;
  }

  function drawCelebration(g, pal) {
    if (S.celebrate <= 0 || S.won) return;
    if (S.celebrate % 7 === 0) celebrationBurst();
    var W = L.well;
    var t = S.celebrate;
    var scale = 1 + 0.12 * Math.sin(t * 0.4);
    var size = Math.max(18, L.cell * 1.5) * scale;
    var y = W.y + W.h * 0.42;
    var colors = [pal.c1, pal.c2, WHITE, '#FFD23F'];
    var c = colors[Math.floor(S.frame / 4) % 4];
    g.save();
    g.globalAlpha = Math.min(1, t / 26);
    text(g, 'TETRIS!', W.x + W.w / 2, y, {
      size: size, color: c, align: 'center', track: size * 0.08,
      shadow: 'rgba(0,0,0,.9)', sx: 3, sy: 4
    });
    text(g, '+' + S.lastScore, W.x + W.w / 2, y + size * 0.86, {
      size: size * 0.46, color: '#fff', align: 'center', track: size * 0.04, mono: true,
      shadow: 'rgba(0,0,0,.9)', sx: 2, sy: 2
    });
    g.restore();
  }

  // CRT glass: scanlines, a soft vignette and one diagonal reflection.
  function drawGlass(g) {
    var i = L.inner;
    var step = Math.max(2, Math.round(L.cell * 0.22));
    g.fillStyle = 'rgba(0,0,0,.20)';
    for (var y = i.y; y < i.y + i.h; y += step) g.fillRect(i.x, y, i.w, Math.max(1, step * 0.42));

    // rolling bright band
    var bandY = i.y + ((S.frame * 0.9) % (i.h + 160)) - 80;
    var bg = g.createLinearGradient(0, bandY, 0, bandY + 80);
    bg.addColorStop(0, 'rgba(255,255,255,0)');
    bg.addColorStop(0.5, 'rgba(180,220,255,.035)');
    bg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = bg;
    g.fillRect(i.x, bandY, i.w, 80);

    // corner vignette
    var cx = i.x + i.w / 2, cy = i.y + i.h / 2;
    var r = Math.max(i.w, i.h) * 0.75;
    var vg = g.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.6)');
    g.fillStyle = vg;
    g.fillRect(i.x, i.y, i.w, i.h);

    // glass reflection
    g.globalAlpha = 0.05;
    g.fillStyle = '#cfe6ff';
    g.beginPath();
    g.moveTo(i.x, i.y);
    g.lineTo(i.x + i.w * 0.42, i.y);
    g.lineTo(i.x, i.y + i.h * 0.58);
    g.closePath();
    g.fill();
    g.globalAlpha = 1;
  }

  // ----------------------------------------------------------------- cards ---
  function card(g, lines, pal, accent) {
    var i = L.inner;
    var cw = Math.min(i.w * 0.86, Math.max(260, L.cell * 13));
    var lh = Math.max(16, L.cell * 0.95);
    var ch = lh * (lines.length + 1.2);
    var cx = clamp(L.well.x + L.well.w / 2, i.x + cw / 2 + 4, i.x + i.w - cw / 2 - 4);
    var cy = L.well.y + L.well.h * 0.44;
    cy = clamp(cy, i.y + ch / 2 + 4, i.y + i.h - ch / 2 - 4);
    var x = cx - cw / 2, y = cy - ch / 2;

    g.fillStyle = 'rgba(2,4,10,.88)';
    rr(g, x, y, cw, ch, Math.max(8, L.cell * 0.4));
    g.fill();
    g.strokeStyle = accent || 'rgba(200,225,255,.8)';
    g.lineWidth = Math.max(2, L.cell * 0.09);
    g.stroke();

    var yy = y + lh * 1.05;
    for (var k = 0; k < lines.length; k++) {
      var ln = lines[k];
      var size = lh * (ln.big ? 1.05 : (ln.small ? 0.46 : 0.6));
      text(g, ln.t, cx, yy, {
        size: size, color: ln.c || '#fff', align: 'center', mono: !!ln.mono,
        track: size * 0.09, shadow: 'rgba(0,0,0,.9)', sx: 2, sy: 3
      });
      yy += lh * (ln.big ? 1.15 : (ln.small ? 0.72 : 0.9));
    }
    return { x: x, y: y, w: cw, h: ch };
  }

  function drawCards(g, pal) {
    // intro splash
    if (S.phase === 'ready' || (S.frame < 70 && S.pieces <= 1 && S.lines === 0 &&
        S.celebrate === 0 && S.phase !== 'clearing' && !S.over && !S.won)) {
      var a = S.frame < 40 ? 1 : Math.max(0, 1 - (S.frame - 40) / 30);
      g.globalAlpha = a;
      card(g, [
        { t: 'LEVEL ' + S.startLevel, big: true, c: pal.c2, mono: true },
        { t: gravityFrames(S.startLevel) + ' FRAMES PER CELL', small: true, c: 'rgba(200,225,255,.85)', mono: true },
        { t: 'CLEAR ' + S.linesToWin + ' LINES', c: '#fff' },
        { t: 'NO HOLD. NO GHOST. NO MERCY.', small: true, c: 'rgba(150,180,235,.8)' }
      ], pal, 'rgba(255,62,165,.8)');
      g.globalAlpha = 1;
      return;
    }
    if (S.paused) {
      g.fillStyle = 'rgba(2,3,8,.66)';
      g.fillRect(L.inner.x, L.inner.y, L.inner.w, L.inner.h);
      card(g, [
        { t: 'PAUSED', big: true, c: '#3df0ff' },
        { t: 'LINES ' + pad(S.lines, 3) + '   SCORE ' + pad(S.score, 6), small: true, c: '#fff', mono: true },
        { t: (S.frame % 40 < 26 ? 'TAP ANYWHERE TO RESUME' : ' '), small: true, c: '#ffd23f' },
        { t: L.pads ? '✕ LEAVES THE ARCADE' : 'R RESTART   ·   Q EXIT', small: true, c: 'rgba(150,180,235,.75)' }
      ], pal, 'rgba(61,240,255,.8)');
      return;
    }
    if (S.over && S.curtain >= ROWS) {
      var dim = Math.min(0.72, (S.curtainTimer - ROWS * 3) / 40);
      g.fillStyle = 'rgba(2,3,8,' + Math.max(0, dim) + ')';
      g.fillRect(L.inner.x, L.inner.y, L.inner.w, L.inner.h);
      card(g, [
        { t: 'TOP OUT', big: true, c: '#ff5b5b' },
        { t: S.taunt, small: true, c: 'rgba(255,190,190,.9)' },
        { t: 'ATTEMPT ' + pad(S.runs + 1, 2), small: true, c: 'rgba(160,185,235,.75)', mono: true },
        { t: 'LINES ' + pad(S.lines, 3) + '   SCORE ' + pad(S.score, 6), small: true, c: '#fff', mono: true },
        { t: (S.frame % 40 < 26 ? 'TAP OR PRESS SPACE TO RETRY' : ' '), small: true, c: '#ffd23f' }
      ], pal, 'rgba(255,91,91,.85)');
      return;
    }
    if (S.won) {
      if (S.phaseFrame % 6 === 0) celebrationBurst();
      var W = L.well;
      g.fillStyle = 'rgba(2,3,8,' + Math.min(0.6, S.phaseFrame / 80) + ')';
      g.fillRect(L.inner.x, L.inner.y, L.inner.w, L.inner.h);
      card(g, [
        { t: 'YOU WIN', big: true, c: (S.frame % 8 < 4) ? '#5bff9b' : '#fff' },
        { t: S.linesToWin + ' LINES AT LEVEL ' + S.startLevel, small: true, c: 'rgba(200,225,255,.9)', mono: true },
        { t: 'SCORE ' + pad(S.score, 6), c: '#ffd23f', mono: true },
        { t: 'TETRISES ' + S.tetrises + '   PIECES ' + S.pieces, small: true, c: 'rgba(180,210,255,.85)', mono: true },
        { t: (S.endCalled && S.frame % 40 < 26 ? 'TAP TO CONTINUE' : ' '), small: true, c: '#fff' }
      ], pal, 'rgba(91,255,155,.85)');
    }
  }

  // ------------------------------------------------------------- the pad -----
  function glyph(g, id, cx, cy, s, color) {
    g.fillStyle = color;
    g.beginPath();
    if (id === 'left') { g.moveTo(cx + s * 0.34, cy - s * 0.46); g.lineTo(cx - s * 0.36, cy); g.lineTo(cx + s * 0.34, cy + s * 0.46); }
    else if (id === 'right') { g.moveTo(cx - s * 0.34, cy - s * 0.46); g.lineTo(cx + s * 0.36, cy); g.lineTo(cx - s * 0.34, cy + s * 0.46); }
    else if (id === 'down') { g.moveTo(cx - s * 0.46, cy - s * 0.34); g.lineTo(cx + s * 0.46, cy - s * 0.34); g.lineTo(cx, cy + s * 0.36); }
    else { g.closePath(); return; }
    g.closePath();
    g.fill();
  }

  function drawPad(g, pal) {
    var i, b;
    // pad plate
    if (L.sidePads) {
      var lw = L.screen.x, rw = L.w - (L.screen.x + L.screen.w);
      var gl = g.createLinearGradient(0, 0, lw, 0);
      gl.addColorStop(0, 'rgba(8,11,24,.92)');
      gl.addColorStop(1, 'rgba(10,14,30,0)');
      g.fillStyle = gl; g.fillRect(0, 0, lw, L.h);
      var gr = g.createLinearGradient(L.w, 0, L.w - rw, 0);
      gr.addColorStop(0, 'rgba(8,11,24,.92)');
      gr.addColorStop(1, 'rgba(10,14,30,0)');
      g.fillStyle = gr; g.fillRect(L.w - rw, 0, rw, L.h);
    } else {
      var y0 = L.padY - 6;
      var grd = g.createLinearGradient(0, y0, 0, L.h);
      grd.addColorStop(0, 'rgba(14,19,38,.0)');
      grd.addColorStop(0.25, 'rgba(12,17,34,.72)');
      grd.addColorStop(1, 'rgba(6,8,18,.92)');
      g.fillStyle = grd;
      g.fillRect(0, y0, L.w, L.h - y0);
    }

    for (i = 0; i < L.buttons.length; i++) {
      b = L.buttons[i];
      if (b.id === 'quit' || b.id === 'pause') continue;
      var held = (b.id === 'left' && S.held.left) || (b.id === 'right' && S.held.right) ||
                 (b.id === 'down' && S.held.down) || b.litT > 0;
      drawButton(g, b, held, pal);
    }
    // the quit button lives on the bezel, drawn last so it stays on top
    for (i = 0; i < L.buttons.length; i++) {
      b = L.buttons[i];
      if (b.id !== 'quit' && b.id !== 'pause') continue;
      g.globalAlpha = 0.85;
      drawButton(g, b, b.litT > 0, pal);
      g.globalAlpha = 1;
    }

    // ROT captions, aligned under whichever rotate button sits lower
    var ra = null, rb = null;
    for (i = 0; i < L.buttons.length; i++) {
      if (L.buttons[i].id === 'rotA') ra = L.buttons[i];
      if (L.buttons[i].id === 'rotB') rb = L.buttons[i];
    }
    if (ra && rb) {
      var capY = Math.max(ra.y + ra.h, rb.y + rb.h) + ra.h * 0.18;
      var capS = Math.max(8, ra.h * 0.2);
      if (capY <= L.h - (L.pads ? 2 : 20)) {
        text(g, 'ROT', ra.x + ra.w / 2, capY, { size: capS, color: 'rgba(150,180,235,.6)', align: 'center', track: 1 });
        text(g, 'ROT', rb.x + rb.w / 2, capY, { size: capS, color: 'rgba(150,180,235,.6)', align: 'center', track: 1 });
      }
    }

    if (!L.pads) {
      text(g, 'ARROWS MOVE  ·  Z / X ROTATE  ·  DOWN SOFT DROP  ·  SPACE HARD DROP  ·  R RETRY  ·  Q EXIT',
        L.w / 2, L.h - 8, { size: Math.max(9, L.h * 0.018), color: 'rgba(140,170,225,.55)', align: 'center', track: 0.8 });
    }
  }

  function drawButton(g, b, held, pal) {
    var x = b.x, y = b.y, w = b.w, h = b.h;
    var press = held ? 3 : 0;
    y += press;
    var accent = (b.id === 'rotA') ? '#ff3ea5' : (b.id === 'rotB') ? '#3df0ff' :
                 (b.id === 'harddrop') ? '#ffd23f' : '#8fb6ff';

    g.save();
    if (b.round) {
      g.beginPath();
      g.arc(x + w / 2, y + h / 2, w / 2, 0, Math.PI * 2);
    } else {
      rr(g, x, y, w, h, Math.min(w, h) * (b.id === 'quit' ? 0.28 : 0.3));
    }
    // body
    var grd = g.createLinearGradient(0, y, 0, y + h);
    if (held) {
      grd.addColorStop(0, 'rgba(255,255,255,.28)');
      grd.addColorStop(1, 'rgba(40,60,120,.75)');
    } else {
      grd.addColorStop(0, 'rgba(30,42,82,.80)');
      grd.addColorStop(1, 'rgba(10,14,32,.80)');
    }
    g.fillStyle = grd;
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = held ? 'rgba(255,255,255,.85)' : hexA(accent, 0.45);
    g.stroke();
    g.restore();

    var cx = x + w / 2, cy = y + h / 2;
    var col = held ? '#ffffff' : accent;
    if (b.id === 'left' || b.id === 'right' || b.id === 'down') {
      glyph(g, b.id, cx, cy, Math.min(w, h) * 0.52, col);
    } else if (b.id === 'rotA' || b.id === 'rotB') {
      text(g, b.label, cx, cy + h * 0.16, { size: h * 0.46, color: col, align: 'center' });
    } else if (b.id === 'harddrop') {
      text(g, 'DROP', cx, cy + h * 0.16, { size: Math.min(h * 0.44, w * 0.26), color: col, align: 'center', track: 1.6 });
    } else if (b.id === 'quit') {
      text(g, '✕', cx, cy + h * 0.16, { size: h * 0.46, color: col, align: 'center' });
    } else if (b.id === 'pause') {
      if (S && S.paused) {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(cx - h * 0.13, cy - h * 0.18);
        g.lineTo(cx + h * 0.19, cy);
        g.lineTo(cx - h * 0.13, cy + h * 0.18);
        g.closePath();
        g.fill();
      } else {
        g.fillStyle = col;
        g.fillRect(cx - h * 0.17, cy - h * 0.18, h * 0.12, h * 0.36);
        g.fillRect(cx + h * 0.05, cy - h * 0.18, h * 0.12, h * 0.36);
      }
    }
  }

  function hexA(hex, a) {
    var v = hex.replace('#', '');
    if (v.length === 3) v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
    return 'rgba(' + parseInt(v.substr(0, 2), 16) + ',' + parseInt(v.substr(2, 2), 16) + ',' +
           parseInt(v.substr(4, 2), 16) + ',' + a + ')';
  }

  // =========================================================================== //
  //  MODE PLUMBING + PUBLIC API                                                 //
  // =========================================================================== //
  var active = false;
  var domSaved = null;

  // The mode owns the whole screen: the platformer HUD, the touch pads and any
  // DOM screen that happens to be up (only __dbg.tetris() from the menu does
  // that - in real play the arcade cabinet starts us from gameState 'play').
  // engine.js hides the HUD and pads for an active mode anyway; this is belt
  // and braces for any order of operations.
  function hideChrome() {
    domSaved = [];
    var i, el;
    var ids = ['hud', 'pads'];
    for (i = 0; i < ids.length; i++) {
      el = document.getElementById(ids[i]);
      if (!el) continue;
      domSaved.push({ el: el, hidden: el.hasAttribute('hidden'), screen: false });
      el.setAttribute('hidden', '');
    }
    var screens = document.querySelectorAll ? document.querySelectorAll('.screen') : [];
    for (i = 0; i < screens.length; i++) {
      if (screens[i].hasAttribute('hidden')) continue;
      domSaved.push({ el: screens[i], hidden: false, screen: true });
      screens[i].setAttribute('hidden', '');
    }
  }

  function restoreChrome() {
    if (!domSaved) return;
    // if the engine put a different screen up while we ran, leave its work alone
    var otherScreen = false, screens = document.querySelectorAll ? document.querySelectorAll('.screen') : [], i;
    for (i = 0; i < screens.length; i++) if (!screens[i].hasAttribute('hidden')) otherScreen = true;
    for (i = 0; i < domSaved.length; i++) {
      var d = domSaved[i];
      if (d.screen && otherScreen) continue;
      if (d.hidden) d.el.setAttribute('hidden', '');
      else d.el.removeAttribute('hidden');
    }
    domSaved = null;
  }

  function statsOut() {
    return {
      lines: S.lines, level: S.level, startLevel: S.startLevel, score: S.score,
      pieces: S.pieces, tetrises: S.tetrises, burns: S.burns,
      won: S.won, over: S.over, seconds: Math.round((Date.now() - S.started) / 1000)
    };
  }

  function callback(name) {
    if (!S || !S.opts) return;
    var fn = S.opts[name];
    if (typeof fn !== 'function') return;
    try { fn(statsOut()); } catch (e) {
      if (window.__dbg && window.__dbg.errors) window.__dbg.errors.push('Tetris ' + name + ': ' + e.message);
    }
  }

  var mode = {
    update: function (dt) { update(dt); },
    draw: function (g, w, h) { draw(g, w, h); },
    onKey: function (e) { handleKey(e, e && e.type === 'keydown'); },
    onPause: function () { return onPause(); }
  };

  function start(opts) {
    opts = opts || {};
    seedRng(opts.seed != null ? opts.seed : ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0));
    S = newState(opts);
    S.next = rollPiece();
    parts.length = 0;
    L = null;
    if (!active) { hideChrome(); bindInput(); }
    active = true;
    lastUpdate = Date.now();
    RT.Tetris.active = true;
    music('korobeiniki');
    try { if (RT.setMode) RT.setMode(mode); } catch (e) {}
    return RT.Tetris;
  }

  function restart() {
    if (!S) return;
    var opts = S.opts;
    var keep = S.runs + 1;
    start(opts);
    S.runs = keep;
    sfx('ui');
  }

  function stop() {
    if (!active) return;
    active = false;
    RT.Tetris.active = false;
    releaseAll();
    unbindInput();
    restoreChrome();
    try { if (RT.clearMode) RT.clearMode(); } catch (e) {}
  }

  function quit() {
    if (!S) { stop(); return; }
    var fn = S.opts && S.opts.onQuit;
    stop();
    if (typeof fn === 'function') { try { fn(statsOut()); } catch (e) {} }
  }

  function finish() {
    if (!S) { stop(); return; }
    if (!S.endCalled) { S.endCalled = true; callback('onWin'); }
    stop();
  }

  function stateOut() {
    if (!S) return null;
    var b = [], y;
    for (y = 0; y < ROWS; y++) b.push(S.board[y].slice());
    var piece = null;
    if (S.piece) {
      piece = {
        type: S.piece.name, name: S.piece.name, x: S.piece.x, y: S.piece.y, rot: S.piece.rot,
        cells: cellsOf(S.piece.name, S.piece.rot, S.piece.x, S.piece.y)
      };
    }
    return {
      board: b, piece: piece, next: S.next,
      lines: S.lines, level: S.level, score: S.score,
      over: S.over, won: S.won, paused: !!S.paused,
      phase: S.phase, linesToWin: S.linesToWin, pieces: S.pieces,
      gravity: gravityFrames(S.level), are: S.are, tetrises: S.tetrises,
      active: active, held: { left: S.held.left, right: S.held.right, down: S.held.down }
    };
  }

  var ALIASES = {
    left: 'left', right: 'right', down: 'down', soft: 'down', softdrop: 'down',
    rotA: 'rotA', rota: 'rotA', rotate: 'rotA', cw: 'rotA', up: 'rotA',
    rotB: 'rotB', rotb: 'rotB', ccw: 'rotB',
    harddrop: 'harddrop', hard: 'harddrop', drop: 'harddrop'
  };

  function input(name) {
    if (!S) return false;
    var n = ALIASES[name] || ALIASES[String(name).toLowerCase()];
    if (!n) return false;
    if (S.over || S.won) { endAction(); return true; }
    S.queue.push(n);
    if (S.queue.length > 24) S.queue.shift();
    return true;
  }

  // Test helper: replace the board.  Accepts a row count, an array of 10 char
  // strings ('.' or ' ' = empty, anything else = a block) or an array of arrays.
  // Rows are bottom aligned: the LAST entry becomes the bottom row.
  function debugFill(rows) {
    if (!S) return null;
    S.board = blankBoard();
    var y, x;
    if (typeof rows === 'number') {
      var n = clamp(Math.floor(rows), 0, ROWS);
      for (y = ROWS - n; y < ROWS; y++) {
        for (x = 0; x < COLS - 1; x++) S.board[y][x] = 1 + ((x + y) % 7);
      }
      return stateOut();
    }
    if (!rows || !rows.length) return stateOut();
    var start = Math.max(0, ROWS - rows.length);
    for (y = 0; y < rows.length && (start + y) < ROWS; y++) {
      var row = rows[y];
      for (x = 0; x < COLS; x++) {
        var v = (typeof row === 'string') ? row.charAt(x) : row[x];
        var filled = !(v === undefined || v === null || v === 0 || v === '' || v === '.' || v === ' ' || v === '0');
        S.board[start + y][x] = filled ? (typeof v === 'number' ? clamp(v, 1, 7) : (1 + ((x + y) % 7))) : 0;
      }
    }
    return stateOut();
  }

  function setLines(n) {
    if (!S) return 0;
    S.lines = Math.max(0, Math.floor(n) || 0);
    var want = S.startLevel + Math.floor(S.lines / 10);
    if (want > S.level) { S.level = want; S.dropDelay = gravityFrames(S.level); }
    return S.lines;
  }

  // Read only view of the on screen geometry: where the well and the buttons
  // are right now.  Handy for headless tests that want to tap a real button.
  function layoutOut() {
    layoutIfNeeded();
    var out = { w: L.w, h: L.h, cell: L.cell, portrait: L.portrait, pads: L.pads,
                sidePads: L.sidePads, well: { x: L.well.x, y: L.well.y, w: L.well.w, h: L.well.h },
                buttons: [] };
    for (var i = 0; i < L.buttons.length; i++) {
      var b = L.buttons[i];
      out.buttons.push({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, round: b.round });
    }
    return out;
  }

  RT.Tetris = {
    start: start,
    layout: layoutOut,
    stop: stop,
    restart: restart,
    quit: quit,
    pause: onPause,
    state: stateOut,
    input: input,
    press: press,
    release: release,
    debugFill: debugFill,
    setLines: setLines,
    seed: seedRng,
    gravityFrames: gravityFrames,
    palette: paletteFor,
    active: false,
    update: update,
    draw: draw,
    mode: mode,
    COLS: COLS,
    ROWS: ROWS
  };
})();
