/* =========================================================================
 * RAGE TRIALS - LEVEL 12: THE GAUNTLET
 * -------------------------------------------------------------------------
 * Eleven trials were a difficulty curve. This one is a boss rush with a
 * platformer bolted to it, and it lies to you twice.
 *
 * Grid: 400 x 56 - the contract maximum in both directions. The level is
 * built in BANDS rather than one long corridor, because four arenas, a
 * vertical tower, a tycoon and a hundred-and-nineteen-tile troll obby do
 * not fit in a single row of tiles. Bands are linked by rockets, a chute,
 * a portal and two lies.
 *
 *   act  cols        rows     what it is
 *   ---  ----------  -------  ------------------------------------------
 *    I   0 -  72     34-55    THE LAUNCH. A rocket race over the void with
 *                             a flame front behind you and VULCAN-9 in
 *                             front, taunting. Three sleds, no floor.
 *   II   74 - 104    28-46    VULCAN-9. Missile rain, flame sweeps, homing
 *                             drones, shrapnel arcs, and a ram that opens
 *                             its core. Six hits, three phases.
 *  III  106 - 134     4-47    THE MELT. A vertical shaft with lava rising
 *                             under you and platforms that do not last.
 *   IV  136 - 176     2-14    GALE PRIME. A tornado with fire AND water.
 *                             You cannot hit it until you make steam.
 *    V  178 - 250    30-55    THE LONG COUNTER. Sixteen purchases. The
 *                             first costs 1. The last costs 15,000.
 *   VI  252          44       THE LAST CHECKPOINT. There are no more.
 *  VII  254 - 372    24-50    THE TROLL. A hundred and nineteen tiles of
 *                             things that are not what they are.
 * VIII  374 - 398    30-44    THE JESTER. Dies twice. Only one counts.
 *   IX  360 - 398    16-24    ONE JUMP. It runs away. It is lying.
 *    X  254 - 320     2-17    THE AUTHOR, after the fake ending, plus the
 *                             ticket booth and the one spike at 330-366.
 *
 * Everything after VI respawns at VI. That is the whole design.
 * ========================================================================= */
(function () {
  var RT = window.RT;
  if (!RT) return;

  var T = 32;
  var W = 400, H = 56;

  /* ---------------------------------------------------------------- maths */
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function h1(i) { var s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s); }
  function approach(v, to, d) { return v < to ? Math.min(to, v + d) : Math.max(to, v - d); }

  /* --------------------------------------------------------------- player */
  function P() { return RT.player; }
  function pcx() { var p = P(); return p.x + p.w / 2; }
  function pcy() { var p = P(); return p.y + p.h / 2; }
  function ptx() { return pcx() / T; }
  function pty() { return pcy() / T; }
  function alive() { var p = P(); return p && !p.dead; }
  function pbox(i) { var p = P(); i = i === undefined ? 3 : i; return { x: p.x + i, y: p.y + i, w: p.w - i * 2, h: p.h - i * 2 }; }
  function hitP(x, y, w, h, i) { return alive() && RT.overlaps(pbox(i), { x: x, y: y, w: w, h: h }); }
  /* every hazard in this file goes through here, so __dbg.god(true) works on
   * the bosses too - the harness needs to watch a whole fight without dying */
  function kill(cause) { if (RT.god) return; if (alive()) RT.killPlayer(cause || 'boss'); }

  /* ------------------------------------------------------------------ fx */
  function sfx(n) { if (RT.sfx) RT.sfx(n); }
  function boom(x, y, cols, n, sp, o) {
    o = o || {};
    RT.particles.burst(x, y, {
      n: n || 18, colors: cols || ['#ffffff'], speed: sp || 200, life: o.life || 0.6,
      size: o.size || 3, gravity: o.gravity === undefined ? 380 : o.gravity,
      drag: o.drag || 0, spreadX: o.spreadX || 0, spreadY: o.spreadY || 0
    });
  }
  function ringFx(x, y, col, r, w2, life) {
    if (RT.particles.ring) RT.particles.ring(x, y, col, r || 30, w2 || 4, life || 0.3);
  }
  function float(x, y, text, col, life) {
    if (RT.particles.text) RT.particles.text(x, y, text, col || '#fff', life || 1);
  }

  /* -------------------------------------------------------------- drawing */
  function rr(g, x, y, w, h, r, fill) { RT.roundRect(g, x, y, w, h, r); g.fillStyle = fill; g.fill(); }
  function circ(g, x, y, r, fill) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fillStyle = fill; g.fill(); }
  function circS(g, x, y, r, col, lw) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.strokeStyle = col; g.lineWidth = lw || 2; g.stroke(); }
  function poly(g, pts, fill) {
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath(); g.fillStyle = fill; g.fill();
  }
  function line(g, x0, y0, x1, y1, col, w2) {
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1);
    g.strokeStyle = col; g.lineWidth = w2 || 2; g.stroke();
  }
  function txt(g, s, x, y, size, col, o) {
    o = o || {};
    RT.drawText(g, s, x, y, {
      size: size, color: col, align: o.align, alpha: o.alpha,
      stroke: o.stroke === undefined ? 'rgba(6,4,12,0.85)' : o.stroke,
      strokeWidth: o.strokeWidth === undefined ? Math.max(2, size * 0.24) : o.strokeWidth
    });
  }
  function log(where, err) {
    try { (window.__entityErrors || (window.__entityErrors = [])).push(where + ': ' + (err && err.message || err)); } catch (e) { }
  }

  /* Entity definition wrapper: every callback guarded, home rect restored on
   * respawn, e.at is the entity's own clock. Same shape level 11 uses. */
  function def(name, spec) {
    RT.defineEntity(name, {
      layer: spec.layer || 'main',
      solid: spec.solid || false,
      shadow: !!spec.shadow,
      init: function (e, d) {
        d = d || e.spawnDef || {};
        e.at = 0; e.seed = h1(e.id * 3.3 + 1.1);
        if (spec.init) { try { spec.init(e, d); } catch (x) { log(name + '.init', x); } }
        e.home = { x: e.x, y: e.y, w: e.w, h: e.h };
      },
      update: function (e, dt) {
        e.at += dt;
        if (!spec.update) return;
        try { spec.update(e, dt); } catch (x) { log(name + '.update', x); }
      },
      draw: function (e, g) {
        if (!spec.draw) return;
        g.save();
        try { spec.draw(e, g); } catch (x) { log(name + '.draw', x); }
        g.restore();
      },
      onPlayerTouch: spec.touch ? function (e, p, side) {
        try { spec.touch(e, p, side); } catch (x) { log(name + '.touch', x); }
      } : undefined,
      onPlayerDeath: spec.died ? function (e) {
        try { spec.died(e); } catch (x) { log(name + '.died', x); }
      } : undefined,
      onReset: function (e) {
        if (e.home && !spec.keepPlace) { e.x = e.home.x; e.y = e.home.y; e.w = e.home.w; e.h = e.home.h; }
        e.at = 0;
        if (spec.reset) { try { spec.reset(e); } catch (x) { log(name + '.reset', x); } }
      }
    });
  }
  var PARK = -1e6;

  /* ==================================================================== */
  /* GEOMETRY - every number the acts share lives here                    */
  /* ==================================================================== */
  var A1 = { x0: 0, x1: 72, pad: 46 };
  var A2 = { x0: 74, x1: 104, floor: 46, top: 28 };
  var A3 = { x0: 106, x1: 134, bot: 47, top: 5 };
  var A4 = { x0: 136, x1: 176, floor: 12, top: 2 };
  var A5 = { x0: 178, x1: 250, floor: 44, plate: 31 };
  var CPT = { x: 252, y: 44 };
  var A7 = { x0: 254, x1: 372, floor: 44 };
  var A8 = { x0: 374, x1: 398, floor: 44 };
  var A9 = { x0: 360, x1: 398, row: 22 };
  var AX = { x0: 254, x1: 320, floor: 17, top: 2 };
  var AS = { x0: 330, x1: 366, row: 14 };

  /* ==================================================================== */
  /* THE GRID - painted, not typed. 22,400 tiles is too many to type out. */
  /* ==================================================================== */
  var grid = [];
  (function () {
    for (var y = 0; y < H; y++) { var r = []; for (var x = 0; x < W; x++) r.push('.'); grid.push(r); }
  })();

  function set(x, y, ch) { if (x >= 0 && x < W && y >= 0 && y < H) grid[y][x] = ch; }
  function row(y, x0, x1, ch) { for (var x = x0; x <= x1; x++) set(x, y, ch || '#'); }
  function col_(x, y0, y1, ch) { for (var y = y0; y <= y1; y++) set(x, y, ch || '#'); }
  function box(x0, y0, x1, y1, ch) { for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) set(x, y, ch || '#'); }
  /* a walkable slab: surface row y, filled down `depth` rows so it reads solid */
  function slab(x0, x1, y, depth) { box(x0, y, x1, y + (depth === undefined ? 4 : depth), '#'); }

  /* ---------------------------------------------------- I. THE LAUNCH --- */
  slab(0, 14, A1.pad, 9);
  col_(1, 36, A1.pad - 1, '#');                  /* the gantry mast         */
  row(43, 2, 5, '-'); row(40, 2, 5, '-'); row(37, 2, 5, '-');
  set(3, A1.pad - 1, 'P');                       /* the only spawn          */
  set(6, A1.pad - 1, 'C');                       /* pad checkpoint          */
  row(A1.pad - 1, 9, 12, 'o');
  slab(66, 73, 44, 11);                          /* the far ledge           */
  row(43, 68, 71, 'o');

  /* ----------------------------------------------------- II. VULCAN-9 --- */
  slab(A2.x0, 105, A2.floor, 9);
  col_(105, 32, 45, '#');                        /* sealed until VULCAN-9 dies */
  set(76, A2.floor - 1, 'C');
  row(A2.floor - 4, 79, 83, '-');
  row(A2.floor - 4, 96, 100, '-');
  row(A2.floor - 7, 86, 92, '-');
  row(A2.floor - 10, 80, 84, '-');
  row(A2.floor - 10, 95, 99, '-');

  /* ----------------------------------------------------- III. THE MELT -- */
  col_(A3.x0, 4, 43, '#');                       /* shaft walls, doorway 44-46 */
  col_(A3.x1, 4, A3.bot, '#');
  row(A3.bot, A3.x0, A3.x1, '#');
  box(A3.x0, A3.bot + 1, A3.x1, H - 1, '#');
  var MELT = [
    [112, 117, 44, 0], [107, 111, 41, 0], [113, 118, 38, 1], [108, 112, 35, 0],
    [114, 119, 32, 0], [108, 113, 29, 1], [115, 120, 26, 0], [109, 114, 23, 0],
    [116, 121, 20, 1], [110, 115, 17, 0], [117, 122, 14, 0], [111, 116, 11, 1],
    [118, 123, 8, 0]
  ];
  (function () {
    for (var i = 0; i < MELT.length; i++) {
      var m = MELT[i];
      row(m[2], m[0], m[1], m[3] ? 'K' : '#');   /* the marked ones crumble  */
    }
  })();
  set(120, 43, 'S'); set(112, 28, 'S'); set(121, 19, 'S');   /* three springs */
  row(5, 124, 138, '#');                         /* top ledge into the tunnel */
  row(4, 126, 130, 'o');

  /* --------------------------------------------------- IV. GALE PRIME --- */
  slab(134, 177, A4.floor, 2);
  col_(134, 6, A4.floor - 1, '#');
  col_(177, A4.top, A4.floor - 1, '#');
  set(137, A4.floor - 1, 'C');
  row(A4.floor - 4, 143, 147, '-');
  row(A4.floor - 4, 165, 169, '-');
  row(A4.floor - 7, 151, 155, '-');
  row(A4.floor - 7, 158, 162, '-');

  /* ------------------------------------------- V. THE LONG COUNTER ------ */
  slab(170, 252, A5.floor, 11);
  set(180, A5.floor - 1, 'C');
  var RUNGS = [[186, 189, 41], [191, 194, 38], [196, 199, 35], [201, 204, 33], [206, 209, 31]];
  (function () { for (var i = 0; i < RUNGS.length; i++) row(RUNGS[i][2], RUNGS[i][0], RUNGS[i][1], '#'); })();
  var PLATE = { x0: 212, x1: 216, y: 30 };
  row(PLATE.y, PLATE.x0, PLATE.x1, '#');
  row(A5.floor - 1, 228, 246, 'o');
  col_(249, 34, 43, '#'); col_(250, 34, 43, '#');   /* THE GATE - bought open */

  /* --------------------------------------- VI. THE LAST CHECKPOINT ------ */
  set(CPT.x, CPT.y - 1, 'C');

  /* ------------------------------------------------- VII. THE TROLL ----- */
  /* Station by station. Every gap, fake, pit and invisible line below is a
   * separate trick, and each one is used exactly once. */
  var F7 = A7.floor;
  slab(253, 321, F7, 11);                        /* one long floor, then cut */
  slab(326, 333, F7, 11);
  slab(338, 349, F7, 11);
  slab(352, 358, F7, 11);
  slab(364, 372, F7, 11);

  /* S1 253-262 the welcome: two tiles of floor are not floor */
  set(258, F7, 'F'); set(259, F7, 'F');
  box(258, F7 + 1, 259, F7 + 3, '.');
  row(F7 + 4, 258, 259, '^');

  /* S2 263-271 the pit that is not a pit: five invisible tiles over a void */
  box(266, F7, 270, F7 + 8, '.');
  row(F7, 266, 270, 'I');

  /* S3 272-283 the staircase of lies: three real steps, two fakes */
  set(273, F7 - 1, '#'); set(275, F7 - 2, 'F'); set(277, F7 - 3, '#');
  set(279, F7 - 4, 'F'); set(281, F7 - 5, '#');
  set(282, F7 - 6, 'o');

  /* S4 284-295 the wrong way up: a spring under a ceiling of spikes */
  set(287, F7 - 1, 'S');
  row(F7 - 6, 286, 288, 'v');
  row(F7 - 7, 286, 288, '#');
  set(287, F7 - 8, 'o');

  /* S5 296-313 the trench: you FALL into it, so you cannot argue on its lip */
  box(304, F7, 311, F7 + 1, '.');
  row(F7 + 2, 304, 311, '#');

  /* S7 322-325 the gap the platform leaves */
  box(322, F7, 325, H - 1, '.');

  /* S9 334-337 the gap the blocks leave when you jump */
  box(334, F7, 337, H - 1, '.');

  /* S10 338-349 the pedestal with the wrong door on it */
  row(F7 - 5, 341, 345, '#');

  /* S11 350-351 an honest two-tile gap */
  box(350, F7, 351, H - 1, '.');

  /* S13 359-363 five tiles of nothing, with one crumbling step in the middle */
  box(359, F7, 363, H - 1, '.');
  row(F7 - 3, 360, 362, 'K');

  row(F7 - 1, 366, 370, 'o');

  /* ------------------------------------------------ VIII. THE JESTER ---- */
  slab(373, 399, A8.floor, 11);
  col_(373, 32, 41, '#');                        /* the doorway seals itself */
  row(A8.floor - 4, 377, 381, '-');
  row(A8.floor - 4, 391, 395, '-');
  row(A8.floor - 8, 384, 389, '-');

  /* --------------------------------------------------- IX. ONE JUMP ----- */
  slab(358, 368, A9.row, 2);
  slab(372, 386, A9.row, 2);
  row(A9.row - 1, 380, 383, 'o');

  /* -------------------------------------------------- X. THE AUTHOR ----- */
  slab(AX.x0 - 1, AX.x1 + 1, AX.floor, 2);
  col_(AX.x0 - 1, AX.top, AX.floor - 1, '#');
  col_(AX.x1 + 1, AX.top, AX.floor - 1, '#');
  row(AX.floor - 5, 262, 266, '-');
  row(AX.floor - 5, 308, 312, '-');
  row(AX.floor - 9, 280, 294, '-');

  /* ------------------------------------------------- THE ONE SPIKE ------ */
  slab(AS.x0, AS.x1, AS.row, 2);                           /* one honest floor */
  set(340, AS.row - 1, '^');                               /* and one spike    */
  set(350, AS.row - 1, 'G');                               /* the real door   */
  row(AS.row - 1, 344, 348, 'o');

  var TILES = [];
  (function () { for (var y = 0; y < H; y++) TILES.push(grid[y].join('')); })();

  /* ==================================================================== */
  /* STATE                                                                */
  /* ==================================================================== */
  var L = {};                 /* survives death, dies with the level        */
  var S = {};                 /* one life                                   */
  var rngN = 1;
  function lrand() { rngN = (rngN * 1664525 + 1013904223) % 4294967296; return rngN / 4294967296; }
  function expose() { try { if (typeof DBG !== 'undefined' && DBG) L.dbg = DBG; window.__L12 = L; } catch (e) { } }

  function resetState() {
    L = {
      done: {},               /* vulcan / gale / jester / author / tickets   */
      act: '',
      raceOn: 0, raceWon: 0, sledIdx: 0,
      meltOn: 0, lavaY: 0, meltWon: 0,
      steam: 0, galeHits: 0,
      laps: 0, plateArmed: 1, tycoonOn: 0, gateOpen: 0,
      trollEntered: 0, trollTricks: {},
      jesterFake: 0,
      jumped: 0, fakeWinShown: 0, authorOn: 0,
      ticketRun: 0, ticketPerfect: 0, spikeOn: 0,
      deathsAt: 0, lastDeaths: 0
    };
    S = {};
    rngN = 20261212;
    expose();
  }
  resetState();

  /* ==================================================================== */
  /* THE BOSS FRAMEWORK                                                   */
  /* -------------------------------------------------------------------- */
  /* Every boss in here is the same machine: a phase list, a pattern queue */
  /* per phase, a telegraph before every attack, and a CORE that opens for */
  /* a fixed window after a specific attack. You do damage exactly one way */
  /* - land on the open core from above. Nothing else in this game hurts   */
  /* anything, so nothing else hurts a boss either.                        */
  /* ==================================================================== */
  function bossInit(e, cfg) {
    e.key = cfg.key;
    e.bossName = cfg.name;
    e.sub = cfg.sub;
    e.col = cfg.col;
    e.col2 = cfg.col2;
    e.maxHp = cfg.hp;
    e.hp = cfg.hp;
    e.perPhase = cfg.perPhase || 2;
    e.phase = 1;
    e.phases = Math.ceil(cfg.hp / (cfg.perPhase || 2));
    e.st = 'sleep'; e.stT = 0;
    e.open = 0; e.openT = 0; e.invuln = 0; e.flash = 0;
    e.awake = 0; e.gone = 0; e.dying = 0;
    e.queue = []; e.qi = 0;
    e.core = { x: e.x, y: e.y, r: 20 };
    e.wake = (cfg.wake === undefined ? e.x / T - 8 : cfg.wake) * T;
    e.onDead = cfg.onDead;
    e.lines = cfg.lines || [];
    e.hitLines = cfg.hitLines || [];
    if (L.done[e.key]) { e.gone = 1; e.awake = 0; }
  }

  function bossState(e, st) { e.st = st; e.stT = 0; }

  function bossWake(e) {
    if (e.awake || e.gone) return;
    e.awake = 1;
    bossState(e, 'intro');
    RT.banner([e.bossName, e.sub], 2.2);
    RT.cam.shake(8, 0.8);
    RT.flash(e.col, 0.18);
    sfx('thwomp'); sfx('charge');
    if (RT.Audio && RT.Audio.music) RT.Audio.music('apocalypse');
  }

  /* the one hit in the game: fall onto an open core */
  function coreStomp(e) {
    if (!e.open || e.invuln > 0 || e.dying || !alive()) return false;
    var p = P();
    if (p.vy <= 40) return false;                       /* must be falling   */
    var c = e.core;
    var box = { x: c.x - c.r, y: c.y - c.r, w: c.r * 2, h: c.r * 2 };
    if (!RT.overlaps({ x: p.x + 4, y: p.y + p.h - 10, w: p.w - 8, h: 14 }, box)) return false;
    bossHit(e, 1);
    return true;
  }

  function bossHit(e, n) {
    if (e.invuln > 0 || e.dying || e.gone) return;
    e.hp = Math.max(0, e.hp - (n || 1));
    e.invuln = 1.0;
    e.open = 0;
    e.flash = 0.6;
    RT.hitstop(5);
    RT.slowmo && RT.slowmo(0.25, 0.12);
    RT.cam.shake(9, 0.4);
    RT.flash('#ffffff', 0.09);
    sfx('stomp'); sfx('hurt');
    boom(e.core.x, e.core.y, ['#ffffff', e.col, '#ffd23f'], 40, 340, { life: 0.9, size: 4 });
    ringFx(e.core.x, e.core.y, '#ffffff', 26, 5, 0.34);
    float(e.core.x, e.core.y - 26, e.hp + ' LEFT', '#ffd23f', 1.1);
    if (RT.bounce) RT.bounce(-500); else P().vy = -500;
    if (e.hitLines.length) {
      var ln = e.hitLines[(e.maxHp - e.hp - 1 + e.hitLines.length) % e.hitLines.length];
      if (ln) RT.speech(e.x + e.w / 2, e.y - 10, ln, 1.9);
    }
    if (e.hp <= 0) { bossDie(e); return; }
    var want = Math.min(e.phases, Math.floor((e.maxHp - e.hp) / e.perPhase) + 1);
    if (want > e.phase) {
      e.phase = want;
      e.queue = []; e.qi = 0;
      bossState(e, 'phase');
      RT.banner(['PHASE ' + e.phase, e.lines[e.phase - 1] || 'it is not done'], 1.6);
      RT.flash(e.col2 || e.col, 0.2);
      RT.cam.shake(10, 0.7);
      sfx('charge');
    } else {
      bossState(e, 'recover');
    }
  }

  function bossDie(e) {
    e.dying = 1; e.open = 0; e.hp = 0;
    bossState(e, 'dying');
    RT.hitstop(9);
    RT.slowmo && RT.slowmo(0.2, 0.5);
    RT.cam.shake(14, 1.4);
    RT.flash('#ffffff', 0.3);
    sfx('win');
    clearShots();
  }

  function bossDeathTick(e, dt) {
    /* four seconds of coming apart, then the level moves on */
    if (e.stT < 2.6) {
      if (Math.random() < 0.6) {
        boom(e.x + Math.random() * e.w, e.y + Math.random() * e.h,
             ['#ffffff', e.col, '#ffd23f', '#ff6b3a'], 10, 260, { life: 1.1, size: 4 });
      }
      if (e.stT % 0.4 < dt) { RT.cam.shake(5, 0.2); sfx('bonk'); }
      return false;
    }
    if (!e.doneCalled) {
      e.doneCalled = 1;
      L.done[e.key] = 1;
      expose();
      boom(e.x + e.w / 2, e.y + e.h / 2, ['#ffffff', e.col, '#ffd23f'], 90, 460, { life: 1.8, size: 6 });
      ringFx(e.x + e.w / 2, e.y + e.h / 2, '#ffffff', 90, 8, 0.8);
      RT.cam.shake(16, 1);
      RT.flash('#ffffff', 0.35);
      if (e.onDead) { try { e.onDead(e); } catch (x) { log('boss.onDead', x); } }
    }
    if (e.stT > 3.4) { e.gone = 1; RT.remove(e); }
    return true;
  }

  /* pattern queue: a phase gives a list of attack names, shuffled once,
   * and the boss walks it. Deterministic within a life, varied between. */
  function nextPattern(e, list) {
    if (e.qi >= e.queue.length) {
      e.queue = list.slice();
      /* rotate rather than shuffle: never the same opener twice in a row  */
      var k = Math.floor(lrand() * e.queue.length);
      e.queue = e.queue.slice(k).concat(e.queue.slice(0, k));
      e.qi = 0;
    }
    return e.queue[e.qi++];
  }

  /* ---------------------------------------------------- the health bar - */
  function drawBossBar(g, e) {
    var vw = RT.view.w, vh = RT.view.h;
    var cx = RT.cam.x, cy = RT.cam.y;
    var w = Math.min(vw * 0.78, 460), x = cx - w / 2, y = cy - vh / 2 + 54;
    var hAll = 16;
    g.save();
    g.globalAlpha = 0.92;
    rr(g, x - 6, y - 14, w + 12, hAll + 30, 7, 'rgba(8,6,16,0.72)');
    g.globalAlpha = 1;
    txt(g, e.bossName, x + w / 2, y - 5, 13, '#ffffff');
    /* one pip per hit, the current phase lit */
    var n = e.maxHp, pw = (w - (n - 1) * 4) / n, i;
    for (i = 0; i < n; i++) {
      var px = x + i * (pw + 4);
      var full = i < e.hp;
      var ph = Math.floor(i / e.perPhase) + 1;
      rr(g, px, y + 6, pw, hAll, 4, full ? (ph === e.phase ? e.col : shadeOf(e.col, -0.25)) : 'rgba(255,255,255,0.09)');
      if (full && ph === e.phase) {
        g.globalAlpha = 0.5 + Math.sin(e.at * 6 + i) * 0.2;
        rr(g, px + 2, y + 8, pw - 4, hAll * 0.36, 3, '#ffffff');
        g.globalAlpha = 1;
      }
    }
    if (e.open) {
      g.globalAlpha = 0.65 + Math.sin(e.at * 22) * 0.35;
      txt(g, 'CORE OPEN', x + w / 2, y + hAll + 16, 11, '#ffd23f');
      g.globalAlpha = 1;
    } else if (e.shield) {
      txt(g, 'SHIELDED', x + w / 2, y + hAll + 16, 11, '#9ad4ff');
    }
    g.restore();
  }
  function shadeOf(c, amt) { return (RT.shade ? RT.shade(c, amt) : c); }

  /* ==================================================================== */
  /* SHARED WEAPONRY - every boss shoots out of the same armoury          */
  /* ==================================================================== */
  function clearShots() {
    var kinds = ['lGshot', 'lGmark', 'lGflame', 'lGdrone'], i, j, a;
    for (i = 0; i < kinds.length; i++) {
      a = RT.find(kinds[i]);
      for (j = 0; j < a.length; j++) RT.remove(a[j]);
    }
  }

  /* a projectile. px coordinates, kills on touch, dies on solid or timeout */
  function shot(x, y, vx, vy, o) {
    o = o || {};
    return RT.spawn({
      px: true, type: 'lGshot', x: x - 7, y: y - 7, w: 14, h: 14,
      vx: vx, vy: vy, grav: o.grav || 0, kind: o.kind || 'shard',
      life: o.life || 6, col: o.col || '#ff8a3a', col2: o.col2 || '#ffd23f',
      home: o.home || 0, r: o.r || 7, spin: o.spin || 0, wob: o.wob || 0
    });
  }

  def('lGshot', {
    layer: 'main',
    init: function (e, d) {
      e.vx = d.vx || 0; e.vy = d.vy || 0;
      e.grav = d.grav || 0; e.kind = d.kind || 'shard';
      e.life = d.life || 6; e.col = d.col; e.col2 = d.col2;
      e.home = d.home || 0; e.r = d.r || 7; e.spin = d.spin || 0; e.wob = d.wob || 0;
      e.rot = 0;
    },
    update: function (e, dt) {
      if (e.home > 0 && alive()) {
        var dx = pcx() - (e.x + e.w / 2), dy = pcy() - (e.y + e.h / 2);
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        e.vx = approach(e.vx, dx / d * 190, e.home * dt);
        e.vy = approach(e.vy, dy / d * 190, e.home * dt);
      }
      e.vy += e.grav * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.rot += (e.spin || (e.vx > 0 ? 6 : -6)) * dt;
      e.life -= dt;
      if (e.wob) e.y += Math.sin(e.at * 9 + e.seed * 6) * e.wob * dt;
      if (e.life <= 0) { RT.remove(e); return; }
      if (e.y > (H + 2) * T || e.x < -2 * T || e.x > (W + 2) * T) { RT.remove(e); return; }
      if (RT.solidAtPx && RT.solidAtPx(e.x + e.w / 2, e.y + e.h / 2)) {
        boom(e.x + e.w / 2, e.y + e.h / 2, [e.col, e.col2, '#ffffff'], 12, 160, { life: 0.5 });
        sfx('bonk');
        RT.remove(e);
        return;
      }
      if (hitP(e.x + 2, e.y + 2, e.w - 4, e.h - 4, 4)) kill('shot');
    },
    draw: function (e, g) {
      var cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.r;
      g.translate(cx, cy);
      if (e.kind === 'missile') {
        g.rotate(Math.atan2(e.vy, e.vx));
        poly(g, [r * 1.7, 0, -r, -r * 0.8, -r * 0.6, 0, -r, r * 0.8], e.col);
        poly(g, [-r * 0.6, -r * 0.7, -r * 1.5, -r * 1.3, -r * 1.2, 0, -r * 1.5, r * 1.3, -r * 0.6, r * 0.7], e.col2);
        circ(g, r * 0.7, 0, r * 0.32, '#ffffff');
        for (var i = 0; i < 3; i++) {
          g.globalAlpha = 0.5 - i * 0.14;
          circ(g, -r * (1.6 + i * 0.9), Math.sin(e.at * 30 + i) * 2, r * (0.7 - i * 0.16), i ? '#ff8a3a' : '#ffe9a8');
        }
        g.globalAlpha = 1;
      } else if (e.kind === 'ember' || e.kind === 'drop') {
        var stretch = e.kind === 'drop' ? 1.9 : 1;
        g.globalAlpha = 0.9;
        g.scale(1, stretch);
        circ(g, 0, 0, r, e.col);
        circ(g, -r * 0.25, -r * 0.25, r * 0.5, e.col2);
        g.globalAlpha = 1;
      } else if (e.kind === 'confetti') {
        g.rotate(e.rot);
        rr(g, -r, -r * 0.55, r * 2, r * 1.1, 2, e.col);
        rr(g, -r * 0.5, -r * 0.3, r, r * 0.6, 1, e.col2);
      } else if (e.kind === 'note') {
        g.rotate(Math.sin(e.at * 5) * 0.3);
        circ(g, 0, 0, r, e.col);
        circS(g, 0, 0, r + 3, e.col2, 2);
        txt(g, '?', 0, 1, r * 1.7, '#ffffff', { stroke: 'rgba(0,0,0,0.6)' });
      } else {
        g.rotate(e.rot);
        poly(g, [0, -r * 1.3, r, 0, 0, r * 1.3, -r, 0], e.col);
        poly(g, [0, -r * 0.6, r * 0.5, 0, 0, r * 0.6, -r * 0.5, 0], e.col2);
      }
    }
  });

  /* a telegraph on the ground: a marker, a countdown, then something lands */
  def('lGmark', {
    layer: 'back',
    init: function (e, d) {
      e.delay = d.delay === undefined ? 1.1 : d.delay;
      e.kind = d.kind || 'missile';
      e.col = d.col || '#ff5b5b';
      e.fired = 0;
      e.from = (d.from === undefined ? 6 : d.from) * T;
      e.w = T * (d.w === undefined ? 1.6 : d.w);
      e.h = T * 0.3;
    },
    update: function (e, dt) {
      if (e.fired) { if (e.at > e.delay + 0.9) RT.remove(e); return; }
      if (e.at < e.delay) return;
      e.fired = 1;
      var cx = e.x + e.w / 2;
      if (e.kind === 'missile') {
        shot(cx, e.y - e.from, 0, 340, { kind: 'missile', col: '#d8d8e8', col2: '#ff5b5b', grav: 620, life: 4 });
        sfx('launch');
      } else if (e.kind === 'spout') {
        RT.spawn({ px: true, type: 'lGflame', x: e.x, y: e.y - T * 5.2, w: e.w, h: T * 5.4, life: 1.15, kind: 'spout' });
        sfx('laser');
      } else if (e.kind === 'spike') {
        RT.spawn({ px: true, type: 'lGflame', x: e.x, y: e.y - T * 1.6, w: e.w, h: T * 1.7, life: 0.9, kind: 'spike' });
        sfx('spike');
      } else if (e.kind === 'bolt') {
        RT.spawn({
          px: true, type: 'lGflame', x: e.x + e.w * 0.2, y: 0, w: e.w * 0.6, h: e.y,
          life: 0.42, kind: 'bolt', col: '#9ad4ff', col2: '#ffffff', warmup: 0, grow: 0
        });
        sfx('laser'); sfx('thwomp');
        RT.cam.shake(5, 0.3);
        RT.flash('rgba(200,230,255,0.35)', 0.1);
      }
      ringFx(cx, e.y, e.col, 24, 3, 0.3);
    },
    draw: function (e, g) {
      var k = clamp(e.at / e.delay, 0, 1);
      var cx = e.x + e.w / 2;
      g.globalAlpha = e.fired ? 0.15 : 0.35 + 0.45 * k;
      g.fillStyle = e.col;
      g.fillRect(e.x, e.y - 2, e.w, 4);
      /* the shrinking bracket: the universal "something lands here" tell   */
      var s = lerp(e.w * 1.5, e.w * 0.55, k);
      g.strokeStyle = e.col; g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx - s / 2, e.y - 14); g.lineTo(cx - s / 2, e.y - 2); g.lineTo(cx - s / 2 + 8, e.y - 2);
      g.moveTo(cx + s / 2, e.y - 14); g.lineTo(cx + s / 2, e.y - 2); g.lineTo(cx + s / 2 - 8, e.y - 2);
      g.stroke();
      if (!e.fired) {
        g.globalAlpha = 0.25 + 0.3 * Math.sin(e.at * 26);
        g.fillStyle = e.col;
        g.fillRect(e.x, e.y - e.from, e.w, e.from);
      }
      g.globalAlpha = 1;
    }
  });

  /* a lethal volume: flame sweeps, fire spouts, steam jets, pop-up spikes */
  def('lGflame', {
    layer: 'main',
    init: function (e, d) {
      e.life = d.life || 1.2;
      e.kind = d.kind || 'spout';
      e.vx = d.vx || 0;
      e.col = d.col || '#ff7a3a';
      e.col2 = d.col2 || '#ffd23f';
      e.grow = d.grow === undefined ? 0.18 : d.grow;
      e.warmup = d.warmup === undefined ? 0.16 : d.warmup;
    },
    update: function (e, dt) {
      e.x += e.vx * dt;
      e.life -= dt;
      if (e.life <= 0) { RT.remove(e); return; }
      if (e.at < e.warmup) return;                  /* a frame of warning    */
      var ins = e.kind === 'spike' ? 5 : 7;
      if (hitP(e.x + ins, e.y + ins, e.w - ins * 2, e.h - ins * 2, 4)) kill(e.kind === 'spike' ? 'spike' : e.kind === 'bolt' ? 'laser' : 'fire');
      if (Math.random() < 0.5) {
        RT.particles.burst(e.x + Math.random() * e.w, e.y + e.h * (0.2 + Math.random() * 0.8), {
          n: 1, colors: [e.col, e.col2, '#ffffff'], speed: 60, life: 0.5, size: 3, gravity: -160
        });
      }
    },
    draw: function (e, g) {
      var k = clamp(e.at / 0.18, 0, 1);
      var w = e.w * (e.grow ? lerp(0.5, 1, k) : 1);
      var x = e.x + (e.w - w) / 2;
      if (e.kind === 'spike') {
        for (var i = 0; i < Math.max(1, Math.round(w / T)); i++) {
          var sx = x + i * T;
          poly(g, [sx + 2, e.y + e.h, sx + T / 2, e.y + e.h * (1 - k), sx + T - 2, e.y + e.h], '#dfe7ff');
          poly(g, [sx + T * 0.34, e.y + e.h, sx + T / 2, e.y + e.h * (1 - k) + 6, sx + T * 0.66, e.y + e.h], '#ff6b6b');
        }
        return;
      }
      if (e.kind === 'bolt') {
        /* lightning: one jagged spine, a fat glow behind it, forked ends */
        var segs = 16, px0 = x + w / 2, py0 = e.y, i3, nx3, ny3, jitter;
        g.globalAlpha = 0.3 * clamp(e.life / 0.42, 0, 1);
        g.strokeStyle = e.col; g.lineWidth = w * 0.9;
        g.beginPath(); g.moveTo(px0, py0);
        for (i3 = 1; i3 <= segs; i3++) {
          ny3 = e.y + (e.h * i3 / segs);
          jitter = (h1(i3 * 3.1 + e.seed * 40) - 0.5) * w * 1.6;
          g.lineTo(px0 + jitter, ny3);
        }
        g.stroke();
        g.globalAlpha = clamp(e.life / 0.3, 0, 1);
        g.strokeStyle = e.col2; g.lineWidth = 4;
        g.beginPath(); g.moveTo(px0, py0);
        for (i3 = 1; i3 <= segs; i3++) {
          ny3 = e.y + (e.h * i3 / segs);
          jitter = (h1(i3 * 3.1 + e.seed * 40) - 0.5) * w * 1.6;
          nx3 = px0 + jitter;
          g.lineTo(nx3, ny3);
          if (i3 % 5 === 0) {
            g.moveTo(nx3, ny3);
            g.lineTo(nx3 + (jitter > 0 ? 22 : -22), ny3 + 18);
            g.moveTo(nx3, ny3);
          }
        }
        g.stroke();
        g.globalAlpha = 1;
        return;
      }
      var lg = g.createLinearGradient(0, e.y, 0, e.y + e.h);
      lg.addColorStop(0, 'rgba(255,255,255,0.0)');
      lg.addColorStop(0.18, e.col2);
      lg.addColorStop(0.6, e.col);
      lg.addColorStop(1, 'rgba(255,60,20,0.15)');
      g.globalAlpha = 0.9 * clamp(e.life / 0.4, 0, 1);
      g.fillStyle = lg;
      /* a flame is not a rectangle: wobble both edges */
      g.beginPath();
      var steps = 8, i2, yy, off;
      g.moveTo(x, e.y + e.h);
      for (i2 = 0; i2 <= steps; i2++) {
        yy = e.y + e.h - (e.h * i2 / steps);
        off = Math.sin(e.at * 14 + i2 * 1.3 + e.seed * 9) * (w * 0.09);
        g.lineTo(x + off, yy);
      }
      for (i2 = steps; i2 >= 0; i2--) {
        yy = e.y + e.h - (e.h * i2 / steps);
        off = Math.sin(e.at * 13 + i2 * 1.1 + 2 + e.seed * 5) * (w * 0.09);
        g.lineTo(x + w + off, yy);
      }
      g.closePath();
      g.fill();
      g.globalAlpha = 1;
    }
  });

  /* a homing drone: stomp it for height, touch it anywhere else and die */
  def('lGdrone', {
    layer: 'main',
    shadow: true,
    init: function (e, d) {
      e.w = T * 1.1; e.h = T * 0.9;
      e.vx = 0; e.vy = 0;
      e.speed = d.speed || 150;
      e.life = d.life || 14;
      e.col = d.col || '#ff5b5b';
      e.hpD = 1;
      e.arm = 0.5;
    },
    update: function (e, dt) {
      e.life -= dt;
      if (e.life <= 0) { pop(e); return; }
      if (alive()) {
        var dx = pcx() - (e.x + e.w / 2), dy = (pcy() - 6) - (e.y + e.h / 2);
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        e.vx = approach(e.vx, dx / d * e.speed, 260 * dt);
        e.vy = approach(e.vy, dy / d * e.speed, 260 * dt);
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt + Math.sin(e.at * 6 + e.seed * 6) * 12 * dt;
      e.arm -= dt;
      if (e.arm > 0 || !alive()) return;
      var p = P();
      var top = { x: e.x + 3, y: e.y - 4, w: e.w - 6, h: 12 };
      if (p.vy > 60 && RT.overlaps({ x: p.x + 3, y: p.y + p.h - 8, w: p.w - 6, h: 12 }, top)) {
        sfx('stomp'); RT.hitstop(3); RT.cam.shake(4, 0.2);
        if (RT.bounce) RT.bounce(-520); else p.vy = -520;
        pop(e);
        return;
      }
      if (hitP(e.x + 4, e.y + 4, e.w - 8, e.h - 8, 4)) kill('drone');
    },
    draw: function (e, g) {
      var cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      var bob = Math.sin(e.at * 8 + e.seed * 6) * 2;
      g.translate(cx, cy + bob);
      /* rotor */
      g.globalAlpha = 0.5;
      var rw = e.w * (0.8 + 0.5 * Math.abs(Math.sin(e.at * 40)));
      rr(g, -rw / 2, -e.h * 0.62, rw, 3, 2, '#dfe7ff');
      g.globalAlpha = 1;
      rr(g, -e.w / 2, -e.h * 0.42, e.w, e.h * 0.8, 6, '#2b2f45');
      rr(g, -e.w / 2 + 3, -e.h * 0.36, e.w - 6, e.h * 0.3, 4, '#4a5170');
      /* the eye tracks you */
      var ex = 0, ey = 0;
      if (alive()) {
        var ddx = pcx() - cx, ddy = pcy() - cy, dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        ex = ddx / dd * 3; ey = ddy / dd * 2;
      }
      circ(g, 0, 0, 6, '#120a14');
      circ(g, ex, ey, 3.4, e.col);
      g.globalAlpha = 0.35 + 0.3 * Math.sin(e.at * 14);
      circS(g, 0, 0, 9, e.col, 2);
      g.globalAlpha = 1;
    }
  });
  function pop(e) {
    boom(e.x + e.w / 2, e.y + e.h / 2, ['#ffffff', e.col, '#ffd23f'], 20, 240, { life: 0.7 });
    sfx('pop');
    RT.remove(e);
  }

  /* ==================================================================== */
  /* I. THE LAUNCH - three sleds, two hoops, a flame front and a rival    */
  /* ==================================================================== */
  function onTopOf(e) {
    var p = P();
    if (!alive()) return false;
    return p.x + p.w > e.x + 2 && p.x < e.x + e.w - 2 &&
           p.y + p.h > e.y - 14 && p.y + p.h < e.y + 16;
  }

  /* A rail, not a raft. Once a sled is lit, walking cannot take you off the
   * front or the back of it - only jumping can. Everybody holds right in a
   * race, and nobody should die of it. */
  function rail(e) {
    var p = P();
    if (!alive()) return;
    if (p.x + p.w < e.x - 4 || p.x > e.x + e.dw + 4) return;
    if (p.y + p.h < e.y - 18 || p.y + p.h > e.y + 22) return;
    if (p.x < e.x + 2) { p.x = e.x + 2; if (p.vx < 0) p.vx = 0; }
    if (p.x + p.w > e.x + e.dw - 2) { p.x = e.x + e.dw - 2 - p.w; if (p.vx > 0) p.vx = 0; }
  }

  def('lGsled', {
    solid: true,
    init: function (e, d) {
      e.idx = d.idx || 1;
      e.dw = T * (d.w === undefined ? 3.5 : d.w);
      e.dh = T * 0.75;
      e.w = e.dw; e.h = e.dh;
      e.rest = { x: e.x, y: e.y };
      e.to = (d.to === undefined ? e.x / T + 10 : d.to) * T;
      e.speed = (d.speed === undefined ? 7.4 : d.speed) * T;
      e.st = 'park'; e.t = 0; e.v = 0; e.bob = 0;
      e.last = d.last ? 1 : 0;
    },
    update: function (e, dt) {
      e.bob = Math.sin(e.at * 3.4 + e.idx) * 2.5;
      if (e.st === 'park') {
        e.y = e.rest.y + e.bob;
        if (onTopOf(e)) {
          e.st = 'lit'; e.t = 0;
          sfx('charge'); sfx('powerup');
          RT.cam.shake(3, 0.3);
          if (e.idx === 1) startRace();
          float(e.x + e.dw / 2, e.y - 26, 'HOLD ON', '#ffd23f', 1.2);
        }
        return;
      }
      if (e.st === 'lit') {
        e.t += dt;
        e.y = e.rest.y + Math.sin(e.at * 26) * 1.6;
        rail(e);
        if (e.t < 0.62) {
          if (Math.random() < 0.8) {
            RT.particles.burst(e.x + 6 + Math.random() * (e.dw - 12), e.y + e.dh + 4, {
              n: 1, colors: ['#ffd23f', '#ff8a3a', '#ffffff'], speed: 120, life: 0.35, size: 3, gravity: 120
            });
          }
          return;
        }
        e.st = 'fly'; e.t = 0; e.v = T * 2.4;
        sfx('launch');
        RT.cam.shake(7, 0.5);
        ringFx(e.x + e.dw / 2, e.y + e.dh, '#ffd23f', 40, 6, 0.4);
        return;
      }
      if (e.st === 'fly') {
        e.v = Math.min(e.speed, e.v + T * 11 * dt);
        var nx = Math.min(e.to, e.x + e.v * dt);
        e.x = nx;
        e.y = e.rest.y + e.bob * 0.6;
        rail(e);
        if (Math.random() < 0.9) {
          RT.particles.burst(e.x - 2 + Math.random() * 6, e.y + e.dh * 0.6 + Math.random() * 8, {
            n: 1, colors: ['#ffd23f', '#ff7a3a', '#ffffff', '#9ad4ff'], speed: 90, life: 0.42, size: 3, gravity: -40
          });
        }
        if (e.x >= e.to - 0.5) {
          e.x = e.to;
          e.st = 'spent'; e.t = 0;
          sfx('tick');
        }
        return;
      }
      if (e.st === 'spent') {
        e.t += dt;
        e.y = e.rest.y + Math.sin(e.at * 9) * 3;
        if (e.t > (e.last ? 2.6 : 1.5)) {
          e.st = 'burn'; e.t = 0;
          e.w = 0; e.h = 0;                       /* collapse, never move it */
          sfx('death'); sfx('bonk');
          RT.cam.shake(6, 0.4);
          boom(e.x + e.dw / 2, e.y + e.dh / 2, ['#ffd23f', '#ff5b3a', '#ffffff', '#6a6a7a'], 34, 300, { life: 1.1, size: 4 });
        }
        return;
      }
      e.t += dt;
      if (e.t > 3) RT.remove(e);
    },
    reset: function (e) { e.st = 'park'; e.t = 0; e.v = 0; e.x = e.rest.x; e.y = e.rest.y; e.w = e.dw; e.h = e.dh; },
    draw: function (e, g) {
      if (e.st === 'burn') {
        var k = clamp(1 - e.t / 3, 0, 1);
        g.globalAlpha = k * 0.6;
        circ(g, e.x + e.dw / 2, e.y + e.dh / 2, 26 * (1 - k) + 8, 'rgba(255,140,60,0.5)');
        g.globalAlpha = 1;
        return;
      }
      var x = e.x, y = e.y, w = e.dw, hh = e.dh;
      var lit = e.st === 'lit' || e.st === 'fly';
      /* exhaust first, behind the hull */
      if (lit) {
        var pw = e.st === 'fly' ? 34 + Math.sin(e.at * 40) * 10 : 16 + Math.sin(e.at * 50) * 7;
        var gr = g.createLinearGradient(x - pw, 0, x + 4, 0);
        gr.addColorStop(0, 'rgba(255,255,255,0)');
        gr.addColorStop(0.35, 'rgba(255,138,58,0.75)');
        gr.addColorStop(1, '#ffe9a8');
        poly(g, [x + 4, y + hh * 0.18, x + 4, y + hh * 0.86, x - pw, y + hh * 0.52], '#ff8a3a');
        g.fillStyle = gr;
        poly(g, [x + 4, y + hh * 0.3, x + 4, y + hh * 0.74, x - pw * 0.6, y + hh * 0.52], '#ffe9a8');
      }
      /* hull */
      rr(g, x, y, w, hh, 7, '#cfd6e8');
      rr(g, x, y, w, hh * 0.46, 6, '#eef3ff');
      rr(g, x + w * 0.62, y + hh * 0.1, w * 0.34, hh * 0.8, 5, '#9aa6c4');
      /* nose cone */
      poly(g, [x + w, y + hh * 0.06, x + w + 16, y + hh * 0.5, x + w, y + hh * 0.94], '#ff5b5b');
      /* fins */
      poly(g, [x + 6, y + hh, x + 20, y + hh, x + 8, y + hh + 11], '#8f9ab8');
      poly(g, [x + w - 22, y + hh, x + w - 8, y + hh, x + w - 6, y + hh + 11], '#8f9ab8');
      /* canopy + stripe + number */
      rr(g, x + w * 0.2, y + 3, w * 0.3, hh * 0.42, 4, '#3df0ff');
      g.globalAlpha = 0.5;
      rr(g, x + w * 0.22, y + 4, w * 0.13, hh * 0.3, 3, '#ffffff');
      g.globalAlpha = 1;
      g.fillStyle = '#ff5b5b';
      g.fillRect(x + 4, y + hh * 0.56, w - 8, 3);
      txt(g, 'S-' + e.idx, x + w * 0.55, y + hh * 0.74, 9, '#3a4260', { stroke: 'rgba(255,255,255,0.6)', strokeWidth: 2 });
      /* running lights */
      var blink = (Math.floor(e.at * 6) % 2) === 0;
      circ(g, x + 5, y + hh * 0.24, 2.4, blink ? '#8dff9a' : '#2a4a2e');
      circ(g, x + w - 6, y + hh * 0.24, 2.4, blink ? '#ff5b5b' : '#4a2a2e');
      if (e.st === 'park') {
        g.globalAlpha = 0.5 + 0.35 * Math.sin(e.at * 5);
        txt(g, 'STAND HERE', x + w / 2, y - 18, 10, '#ffe9a8');
        g.globalAlpha = 1;
      }
      if (e.st === 'lit') {
        var n = 3 - Math.floor(e.t / 0.21);
        if (n >= 1) txt(g, String(n), x + w / 2, y - 22, 20, '#ffd23f');
      }
    }
  });

  /* a burning hoop the sled flies through. The gap is the whole point:
   * ride it out and you are fine, jump inside it and you are not. */
  def('lGring', {
    layer: 'main',
    init: function (e, d) {
      e.r = T * (d.r === undefined ? 2.3 : d.r);
      e.cx = e.x + T / 2; e.cy = e.y + T / 2;
      e.thick = 11;
      e.spin = d.spin === undefined ? 1.1 : d.spin;
      e.w = 0; e.h = 0;
    },
    update: function (e) {
      if (!alive()) return;
      /* the hoop's plane is perpendicular to the sled: you cross it at its
       * x, and the only thing that matters is whether you are inside the
       * opening when you do. Riding through is safe. Jumping is not. */
      var dx = pcx() - e.cx, dy = pcy() - e.cy;
      if (Math.abs(dx) < 15 && Math.abs(dy) > e.r - e.thick - 8) kill('fire');
    },
    draw: function (e, g) {
      var i, a, x, y;
      g.globalAlpha = 0.22;
      circS(g, e.cx, e.cy, e.r, '#ff7a3a', e.thick * 2.6);
      g.globalAlpha = 1;
      circS(g, e.cx, e.cy, e.r, '#ff5b2a', e.thick);
      circS(g, e.cx, e.cy, e.r, '#ffd23f', e.thick * 0.45);
      /* tongues of flame licking around the hoop */
      for (i = 0; i < 26; i++) {
        a = (i / 26) * 6.2832 + e.at * e.spin;
        var f = 6 + Math.sin(e.at * 9 + i * 1.7) * 6;
        x = e.cx + Math.cos(a) * (e.r + e.thick * 0.5);
        y = e.cy + Math.sin(a) * (e.r + e.thick * 0.5);
        circ(g, x + Math.cos(a) * f * 0.4, y + Math.sin(a) * f * 0.4, 3 + f * 0.22, i % 3 ? '#ff8a3a' : '#ffe9a8');
      }
      g.globalAlpha = 0.5 + 0.2 * Math.sin(e.at * 4);
      circS(g, e.cx, e.cy, e.r - e.thick, '#ffe9a8', 1.5);
      g.globalAlpha = 1;
      txt(g, 'DO NOT JUMP', e.cx, e.cy - e.r - 20, 10, '#ffd23f', { alpha: 0.85 });
    }
  });

  /* the flame front: it starts when you light the first sled and it does
   * not stop until the ledge. It is slower than the sleds. Only sitting
   * still can lose to it. */
  def('lGfront', {
    layer: 'main',
    init: function (e, d) {
      e.from = e.x;
      e.stop = (d.stop === undefined ? 66 : d.stop) * T;
      e.speed = (d.speed === undefined ? 2.7 : d.speed) * T;
      e.on = 0; e.w = 0; e.h = 0;
      e.lead = 0;
    },
    update: function (e, dt) {
      if (!L.raceOn || L.raceWon) { e.x = e.from; e.lead = 0; return; }
      e.on = 1;
      e.x = Math.min(e.stop, e.x + e.speed * dt);
      e.lead = e.x;
      if (!alive()) return;
      if (pcx() < e.x + 10 && pcy() > 30 * T) kill('fire');
      if (Math.random() < 0.9) {
        RT.particles.burst(e.x - 20 + Math.random() * 40, (34 + Math.random() * 22) * T, {
          n: 1, colors: ['#ff7a3a', '#ffd23f', '#ff3a2a'], speed: 110, life: 0.8, size: 4, gravity: -180
        });
      }
    },
    reset: function (e) { e.x = e.from; e.on = 0; },
    draw: function (e, g) {
      if (!e.on) return;
      var x = e.x, i;
      var y0 = 30 * T, y1 = 56 * T;
      var lg = g.createLinearGradient(x - 320, 0, x + 26, 0);
      lg.addColorStop(0, 'rgba(255,60,20,0)');
      lg.addColorStop(0.55, 'rgba(255,90,30,0.45)');
      lg.addColorStop(0.88, 'rgba(255,170,60,0.85)');
      lg.addColorStop(1, '#fff3c4');
      g.fillStyle = lg;
      g.fillRect(x - 320, y0, 346, y1 - y0);
      /* the licking edge */
      g.beginPath();
      g.moveTo(x, y0);
      for (i = 0; i <= 22; i++) {
        var yy = y0 + (y1 - y0) * (i / 22);
        g.lineTo(x + Math.sin(e.at * 8 + i * 0.9) * 13 + 8, yy);
      }
      g.lineTo(x - 40, y1); g.lineTo(x - 40, y0);
      g.closePath();
      g.fillStyle = 'rgba(255,220,140,0.55)';
      g.fill();
      txt(g, 'GO', x - 60, 34 * T, 22, '#ffe9a8', { alpha: 0.5 + 0.3 * Math.sin(e.at * 8) });
    }
  });

  /* VULCAN-9 in the distance, winning the race it is about to lose */
  def('lGrival', {
    layer: 'back',
    init: function (e) {
      e.w = 0; e.h = 0;
      e.rx = 6 * T; e.ry = 36 * T;
      e.said = 0; e.phase = 0;
    },
    update: function (e, dt) {
      if (!L.raceOn) { e.rx = 6 * T; e.said = 0; e.phase = 0; return; }
      e.rx += (9.5 * T) * dt;
      e.ry = (36 + Math.sin(e.at * 1.6) * 2.4) * T;
      if (e.rx > 78 * T) { e.rx = -8 * T; e.phase++; }
      var taunts = [
        'VULCAN-9: you brought LEGS to a rocket race',
        'VULCAN-9: the arena is at seventy four. i will wait.',
        'VULCAN-9: nobody has ever made it to seventy four.'
      ];
      if (e.said !== e.phase + 1 && e.rx > 20 * T && e.rx < 30 * T && e.phase < 3) {
        e.said = e.phase + 1;
        RT.speech(e.rx, e.ry - 30, taunts[e.phase % 3], 2.6);
        sfx('troll');
      }
      if (Math.random() < 0.7) {
        RT.particles.burst(e.rx - 30, e.ry + 6 + Math.random() * 6, {
          n: 1, colors: ['#ff8a3a', '#ffd23f', '#6a6a7a'], speed: 70, life: 1.2, size: 3, gravity: -30
        });
      }
    },
    draw: function (e, g) {
      if (!L.raceOn) return;
      var x = e.rx, y = e.ry;
      g.globalAlpha = 0.85;
      poly(g, [x - 54, y - 12, x + 26, y - 16, x + 44, y, x + 26, y + 16, x - 54, y + 12], '#3a4056');
      poly(g, [x + 26, y - 16, x + 44, y, x + 26, y + 16], '#ff5b5b');
      g.globalAlpha = 1;
      rr(g, x - 40, y - 7, 44, 6, 3, '#6d7690');
      circ(g, x + 10, y - 2, 5, '#ffd23f');
      circ(g, x + 10, y - 2, 2.4, '#ffffff');
      poly(g, [x - 54, y - 12, x - 74, y - 3, x - 74, y + 3, x - 54, y + 12], '#ffb03a');
      g.globalAlpha = 0.6;
      poly(g, [x - 70, y - 5, x - 120 - Math.sin(e.at * 30) * 16, y, x - 70, y + 5], '#ffe9a8');
      g.globalAlpha = 1;
      txt(g, 'VULCAN-9', x - 6, y - 28, 10, '#ff8a8a', { alpha: 0.8 });
    }
  });

  function startRace() {
    if (L.raceOn) return;
    L.raceOn = 1;
    RT.banner(['THE LAUNCH', 'three sleds. do not stop.'], 1.8);
    RT.toast('the flame front is slower than the sleds. that is the only promise here.', 3.2);
    if (RT.Audio && RT.Audio.music) RT.Audio.music('volcano');
  }

  /* ==================================================================== */
  /* II. VULCAN-9                                                         */
  /* -------------------------------------------------------------------- */
  /* A rocket that learned to hover. Missile rain you read off the floor,  */
  /* a flame sweep you answer with the tiers, drones you stomp for height, */
  /* a shrapnel fan with one gap in it, and a ram that ends with its back  */
  /* open against a wall. The ram is the only way in. Everything else is   */
  /* there to stop you being on the tier when it happens.                  */
  /* ==================================================================== */
  var V = { L: (A2.x0 + 1) * T, R: (A2.x1 - 1) * T, FLOOR: A2.floor * T };

  def('lGvulcan', {
    layer: 'main',
    init: function (e, d) {
      e.w = T * 5.4; e.h = T * 3.2;
      bossInit(e, {
        key: 'vulcan', name: 'VULCAN-9', sub: 'it did win the race',
        col: '#ff5b5b', col2: '#ffd23f', hp: 6, perPhase: 2, wake: A2.x0 + 2,
        lines: ['thrusters nominal', 'countermeasures live', 'everything at once'],
        hitLines: ['RECALIBRATING', 'that was luck', 'i have five more', 'ARMOUR AT SIXTY', 'you are ON MY BACK', 'no'],
        onDead: function () {
          carve(105, 44, '.'); carve(105, 45, '.');
          RT.toast('the shaft is open. it goes up.', 3);
          RT.banner(['VULCAN-9 DOWN', 'one of four'], 2);
        }
      });
      e.hx = (A2.x0 + 15) * T; e.hy = (A2.top + 6) * T;
      e.vx = 0; e.vy = 0;
      e.face = -1;
      e.wall = 0;
      e.shots = 0;
      e.tilt = 0;
    },
    update: function (e, dt) {
      if (e.gone) return;
      e.stT += dt;
      if (e.invuln > 0) e.invuln -= dt;
      if (e.flash > 0) e.flash -= dt;

      if (e.st === 'sleep') {
        if (alive() && pcx() > e.wake && pcx() < (A2.x1 + 2) * T &&
            pty() > A2.top && pty() < A2.floor + 3) bossWake(e);
        e.hy = (A2.floor - 7) * T + Math.sin(e.at * 1.6) * 10;
        place(e);
        return;
      }
      if (e.dying) { bossDeathTick(e, dt); place(e); return; }

      switch (e.st) {
        case 'intro': introT(e, dt); break;
        case 'idle': idleT(e, dt); break;
        case 'phase': phaseT(e, dt); break;
        case 'recover': recoverT(e, dt); break;
        case 'missiles': missilesT(e, dt); break;
        case 'sweep': sweepT(e, dt); break;
        case 'drones': dronesT(e, dt); break;
        case 'shrapnel': shrapnelT(e, dt); break;
        case 'ramwind': ramWindT(e, dt); break;
        case 'ram': ramT(e, dt); break;
        case 'stun': stunT(e, dt); break;
      }
      place(e);
      /* the hull kills while it is flying, and does nothing while stunned */
      if (e.st !== 'stun' && !e.dying && hitP(e.x + 10, e.y + 8, e.w - 20, e.h - 12, 4)) kill('hull');
      coreStomp(e);
    },
    draw: function (e, g) { drawVulcan(e, g); },
    reset: function (e) { e.hp = e.maxHp; }
  });

  function place(e) {
    e.x = e.hx - e.w / 2;
    e.y = e.hy - e.h / 2;
    e.core.x = e.hx + e.face * 6;
    e.core.y = e.hy - e.h * 0.42;
    e.core.r = 20;
  }
  function hover(e, dt, tx, ty, sp) {
    sp = sp || 150;
    var dx = tx - e.hx, dy = ty - e.hy;
    e.vx = approach(e.vx, clamp(dx * 2.2, -sp, sp), 420 * dt);
    e.vy = approach(e.vy, clamp(dy * 2.4, -sp, sp), 420 * dt);
    e.hx = clamp(e.hx + e.vx * dt, V.L + e.w / 2, V.R - e.w / 2);
    e.hy += e.vy * dt;
    if (alive()) e.face = pcx() < e.hx ? -1 : 1;
    e.tilt = lerp(e.tilt, clamp(e.vx / 420, -0.3, 0.3), 0.12);
  }

  function introT(e, dt) {
    hover(e, dt, (A2.x0 + 15) * T, (A2.floor - 7.5) * T, 240);
    if (e.stT > 1.9) {
      bossState(e, 'idle');
      RT.speech(e.hx, e.hy - 40, 'you are standing in my landing zone', 2.4);
    }
  }
  function idleT(e, dt) {
    var px = alive() ? pcx() : e.hx;
    hover(e, dt, clamp(px, V.L + 120, V.R - 120), (A2.floor - 7.2) * T + Math.sin(e.at * 1.7) * 14, 170);
    var wait = e.phase === 1 ? 0.95 : e.phase === 2 ? 0.7 : 0.5;
    if (e.stT < wait) return;
    var list = e.phase === 1 ? ['missiles', 'sweep', 'ram']
             : e.phase === 2 ? ['missiles', 'drones', 'ram', 'sweep', 'ram']
             : ['shrapnel', 'sweep', 'ram', 'drones', 'missiles', 'ram'];
    var nx = nextPattern(e, list);
    e.shots = 0;
    bossState(e, nx === 'ram' ? 'ramwind' : nx);
    if (nx === 'sweep') startSweep(e);
  }
  function phaseT(e, dt) {
    hover(e, dt, e.hx, (A2.floor - 8) * T, 90);
    if (e.stT % 0.18 < dt) {
      boom(e.hx + (Math.random() - 0.5) * e.w, e.hy + (Math.random() - 0.5) * e.h,
           ['#ffffff', '#ff5b5b'], 6, 200, { life: 0.5 });
    }
    if (e.stT > 1.5) bossState(e, 'idle');
  }
  function recoverT(e, dt) {
    hover(e, dt, e.hx, (A2.floor - 7) * T, 120);
    if (e.stT > 0.7) bossState(e, 'idle');
  }

  /* ---------------------------------------------------------- missiles - */
  function missilesT(e, dt) {
    var px = alive() ? pcx() : e.hx;
    hover(e, dt, clamp(px + e.face * -60, V.L + 120, V.R - 120), (A2.floor - 8.2) * T, 150);
    var waves = e.phase === 1 ? 2 : 3;
    var gap = e.phase === 3 ? 0.62 : 0.78;
    if (e.shots < waves && e.stT > e.shots * gap) {
      e.shots++;
      var n = e.phase === 1 ? 3 : e.phase === 2 ? 4 : 5;
      var i, mx;
      sfx('charge');
      for (i = 0; i < n; i++) {
        /* one always lands on your head, the rest spread across the floor */
mx = i === 0 && alive() ? clamp(pcx(), V.L + 40, V.R - 40) : (V.L + 40 + lrand() * (V.R - V.L - 80));
        RT.spawn({
          px: true, type: 'lGmark', x: mx - T * 0.8, y: V.FLOOR, w: T * 1.6,
          delay: e.phase === 3 ? 0.82 : 1.05, kind: 'missile', from: 9, col: '#ff5b5b'
        });
      }
    }
    if (e.stT > waves * gap + 1.5) bossState(e, 'recover');
  }

  /* ------------------------------------------------------------- sweep - */
  function startSweep(e) {
    e.sweepDir = alive() && pcx() > (V.L + V.R) / 2 ? -1 : 1;
    e.sweepFired = 0;
    sfx('charge');
    RT.toast('GET OFF THE FLOOR', 1.1);
  }
  function sweepT(e, dt) {
    var edge = e.sweepDir > 0 ? V.L + 60 : V.R - 60;
    hover(e, dt, edge, (A2.floor - 6.5) * T, 260);
    if (!e.sweepFired && e.stT > 0.9) {
      e.sweepFired = 1;
      sfx('laser');
      RT.cam.shake(5, 0.4);
      RT.spawn({
        px: true, type: 'lGflame',
        x: e.sweepDir > 0 ? V.L - T * 2 : V.R, y: V.FLOOR - T * 1.7,
        w: T * 2, h: T * 1.75, life: 4.4, kind: 'sweep',
        vx: e.sweepDir * T * 8.5, warmup: 0
      });
      if (e.phase >= 2) {
        RT.spawn({
          px: true, type: 'lGflame',
          x: e.sweepDir > 0 ? V.L - T * 7 : V.R + T * 5, y: V.FLOOR - T * 1.7,
          w: T * 2, h: T * 1.75, life: 4.6, kind: 'sweep',
          vx: e.sweepDir * T * 8.5, warmup: 0
        });
      }
    }
    if (e.stT > 2.4) bossState(e, 'recover');
  }

  /* ------------------------------------------------------------ drones - */
  function dronesT(e, dt) {
    hover(e, dt, e.hx, (A2.floor - 8) * T, 130);
    if (!e.shots && e.stT > 0.5) {
      e.shots = 1;
      var n = e.phase === 3 ? 3 : 2, i;
      sfx('pop');
      for (i = 0; i < n; i++) {
        RT.spawn({
          px: true, type: 'lGdrone', x: e.hx + (i - (n - 1) / 2) * 50, y: e.hy + 10,
          speed: 120 + e.phase * 22, life: 13
        });
      }
      RT.speech(e.hx, e.hy - 40, 'stomp them. i will wait.', 1.8);
    }
    if (e.stT > 1.6) bossState(e, 'recover');
  }

  /* ---------------------------------------------------------- shrapnel - */
  function shrapnelT(e, dt) {
    hover(e, dt, e.hx, (A2.floor - 7) * T, 90);
    if (!e.shots && e.stT > 0.75) {
      e.shots = 1;
      /* a full fan with a deliberate gap: stand in the gap */
      var gapA = alive() ? Math.atan2(pcy() - e.hy, pcx() - e.hx) : 1.57;
      var i, a;
      sfx('laser');
      RT.cam.shake(4, 0.3);
      for (i = 0; i < 16; i++) {
        a = (i / 16) * 6.2832;
        if (Math.abs(Math.atan2(Math.sin(a - gapA), Math.cos(a - gapA))) < 0.42) continue;
        shot(e.hx, e.hy, Math.cos(a) * 205, Math.sin(a) * 205,
             { kind: 'shard', col: '#ff8a3a', col2: '#ffe9a8', life: 3.4, r: 7 });
      }
    }
    if (e.stT > 1.7) bossState(e, 'recover');
  }

  /* --------------------------------------------------------------- ram - */
  function ramWindT(e, dt) {
    var py = alive() ? clamp(pcy() - 6, (A2.top + 2) * T, V.FLOOR - T * 1.2) : e.hy;
    hover(e, dt, e.hx - e.face * 40, py, 220);
    if (e.stT % 0.1 < dt) {
      RT.particles.burst(e.hx - e.face * e.w * 0.5, e.hy, {
        n: 2, colors: ['#ff5b5b', '#ffd23f'], speed: 90, life: 0.4, size: 3, gravity: 0
      });
    }
    if (e.stT > (e.phase === 3 ? 0.78 : 1.05)) {
      bossState(e, 'ram');
      e.ramDir = e.face;
      e.ramV = 0;
      sfx('launch');
      RT.cam.shake(6, 0.3);
    }
  }
  function ramT(e, dt) {
    e.ramV = Math.min(T * (13 + e.phase * 1.6), e.ramV + T * 40 * dt);
    e.hx += e.ramDir * e.ramV * dt;
    if (Math.random() < 0.9) {
      RT.particles.burst(e.hx - e.ramDir * e.w * 0.5, e.hy + (Math.random() - 0.5) * e.h, {
        n: 1, colors: ['#ffd23f', '#ff7a3a', '#ffffff'], speed: 80, life: 0.5, size: 3, gravity: 0
      });
    }
    var hitL = e.hx - e.w / 2 <= V.L, hitR = e.hx + e.w / 2 >= V.R;
    if (hitL || hitR) {
      e.hx = hitL ? V.L + e.w / 2 : V.R - e.w / 2;
      e.wall = hitL ? -1 : 1;
      bossState(e, 'stun');
      e.open = 1;
      e.openT = e.phase === 1 ? 2.8 : e.phase === 2 ? 2.2 : 1.7;
      sfx('thwomp'); sfx('bonk');
      RT.cam.shake(13, 0.8);
      RT.hitstop(6);
      RT.flash('#ffd23f', 0.14);
      boom(e.hx + e.wall * e.w * 0.4, e.hy, ['#ffffff', '#ffd23f', '#9aa6c4'], 40, 320, { life: 1 });
      /* debris rains off the wall - cosmetic, harmless */
      for (var i = 0; i < 6; i++) {
        RT.particles.burst(e.hx + e.wall * e.w * 0.45, e.hy + (i - 3) * 12, {
          n: 3, colors: ['#9aa6c4', '#6d7690'], speed: 160, life: 1.2, size: 3, gravity: 600
        });
      }
    }
  }
  function stunT(e, dt) {
    /* it slides down the wall and lies there with its back open */
    e.hy = approach(e.hy, V.FLOOR - T * 3.4, 240 * dt);
    e.hx = approach(e.hx, e.wall < 0 ? V.L + e.w / 2 + 10 : V.R - e.w / 2 - 10, 60 * dt);
    e.openT -= dt;
    e.core.r = 26;
    if (e.stT % 0.22 < dt) {
      RT.particles.burst(e.core.x, e.core.y, {
        n: 3, colors: ['#ffd23f', '#ffffff'], speed: 70, life: 0.6, size: 3, gravity: -120
      });
    }
    if (e.openT <= 0) {
      e.open = 0;
      bossState(e, 'recover');
      sfx('charge');
      RT.speech(e.hx, e.hy - 40, e.hp > 0 ? 'up again' : '', 1.2);
    }
  }

  /* -------------------------------------------------------------- paint - */
  function drawVulcan(e, g) {
    if (e.gone) return;
    var x = e.hx, y = e.hy, w = e.w, h = e.h;
    var dying = e.dying ? clamp(1 - e.stT / 3.4, 0, 1) : 1;
    g.translate(x, y);
    g.rotate(e.tilt + (e.st === 'stun' ? (e.wall < 0 ? -0.22 : 0.22) : 0));
    g.globalAlpha = dying;
    /* thruster plume under the hull */
    if (e.st !== 'stun') {
      var pl = 18 + Math.sin(e.at * 36) * 7;
      g.globalAlpha = 0.85 * dying;
      poly(g, [-w * 0.28, h * 0.42, -w * 0.1, h * 0.42, -w * 0.19, h * 0.42 + pl], '#ffd23f');
      poly(g, [w * 0.1, h * 0.42, w * 0.28, h * 0.42, w * 0.19, h * 0.42 + pl], '#ffd23f');
      g.globalAlpha = dying;
    }
    /* hull: a fat rocket lying on its side */
    rr(g, -w / 2, -h / 2, w, h, 16, '#39405c');
    rr(g, -w / 2 + 6, -h / 2 + 5, w - 12, h * 0.34, 12, '#525b80');
    rr(g, -w / 2 + 10, -h / 2 + 7, w * 0.36, h * 0.2, 8, '#7d88b4');
    /* nose, pointing at you */
    poly(g, [e.face * w * 0.5, -h * 0.34, e.face * (w * 0.5 + 26), 0, e.face * w * 0.5, h * 0.34], '#ff5b5b');
    poly(g, [e.face * w * 0.5, -h * 0.16, e.face * (w * 0.5 + 16), 0, e.face * w * 0.5, h * 0.16], '#ffd23f');
    /* the eye */
    circ(g, e.face * w * 0.28, -h * 0.06, 11, '#120a14');
    var blink = e.st === 'stun' ? 0.25 : 1;
    circ(g, e.face * w * 0.28 + e.face * 2, -h * 0.06, 6.5 * blink, e.flash > 0 ? '#ffffff' : '#ff5b5b');
    circ(g, e.face * w * 0.28 + e.face * 3, -h * 0.09, 2.2 * blink, '#ffffff');
    /* missile racks */
    var i;
    for (i = 0; i < 4; i++) {
      rr(g, -w * 0.34 + i * (w * 0.17), h * 0.16, w * 0.12, h * 0.2, 3, '#2a3048');
      circ(g, -w * 0.34 + i * (w * 0.17) + w * 0.06, h * 0.26, 3, i % 2 ? '#ff5b5b' : '#ffd23f');
    }
    /* fins */
    poly(g, [-w * 0.5, -h * 0.3, -w * 0.72, -h * 0.66, -w * 0.46, -h * 0.02], '#2f354e');
    poly(g, [-w * 0.5, h * 0.3, -w * 0.72, h * 0.66, -w * 0.46, h * 0.02], '#2f354e');
    /* THE CORE, on its back */
    var cx = e.core.x - x, cy = e.core.y - y;
    if (e.open) {
      g.globalAlpha = 0.35 + 0.3 * Math.sin(e.at * 12);
      circ(g, cx, cy, 30, '#ffd23f');
      g.globalAlpha = dying;
      circ(g, cx, cy, 19, '#ffe9a8');
      circ(g, cx, cy, 13, '#ffffff');
      circS(g, cx, cy, 25, '#ffd23f', 3);
      txt(g, 'LAND HERE', cx, cy - 34, 10, '#ffd23f');
    } else {
      rr(g, cx - 18, cy - 9, 36, 18, 6, '#2a3048');
      g.globalAlpha = 0.6 * dying;
      rr(g, cx - 14, cy - 5, 28, 5, 3, e.invuln > 0 ? '#ff5b5b' : '#6d7690');
      g.globalAlpha = dying;
    }
    if (e.flash > 0) {
      g.globalAlpha = e.flash * 0.7;
      rr(g, -w / 2, -h / 2, w, h, 16, '#ffffff');
      g.globalAlpha = dying;
    }
    g.globalAlpha = 1;
  }

  /* ==================================================================== */
  /* III. THE MELT - the shaft, and the thing coming up it                */
  /* ==================================================================== */
  def('lGlava', {
    layer: 'main',
    init: function (e) {
      e.w = 0; e.h = 0;
      e.top = (A3.bot + 1) * T;      /* the surface, in world px          */
      e.rise = 0;
      e.armed = 0;
      e.grace = 3.2;
      L.lavaY = e.top;
    },
    update: function (e, dt) {
      if (!e.armed) {
        if (!alive()) return;
        if (ptx() > A3.x0 + 1 && ptx() < A3.x1 && pty() > 38) {
          e.armed = 1;
          startMelt();
        }
        return;
      }
      if (L.meltWon) {
        e.top = Math.min((A3.bot + 2) * T, e.top + 260 * dt);
        L.lavaY = e.top;
        return;
      }
      if (e.grace > 0) { e.grace -= dt; }
      else {
        var sp = (0.52 + (L.meltDeaths || 0) * -0.03) * T;   /* mercy on repeat */
        e.top -= Math.max(0.34 * T, sp) * dt;
      }
      L.lavaY = e.top;
      if (alive() && ptx() > A3.x0 && ptx() < A3.x1 + 1 && pcy() + 6 > e.top) kill('lava');
      /* bubbles and spitting */
      if (Math.random() < 0.7) {
        var bx = (A3.x0 + 1 + Math.random() * (A3.x1 - A3.x0 - 1)) * T;
        RT.particles.burst(bx, e.top + 6, {
          n: 1, colors: ['#ffb03a', '#ff5b2a', '#ffe9a8'], speed: 120, life: 1, size: 3, gravity: 420
        });
      }
      if (Math.random() < 0.03) {
        sfx('crumble');
        RT.cam.shake(2, 0.2);
      }
    },
    reset: function (e) { e.top = (A3.bot + 1) * T; e.armed = 0; e.grace = 3.2; L.lavaY = e.top; },
    draw: function (e, g) {
      var x0 = (A3.x0 + 1) * T, x1 = A3.x1 * T, y = e.top;
      var lg = g.createLinearGradient(0, y - 40, 0, y + 200);
      lg.addColorStop(0, 'rgba(255,220,120,0.0)');
      lg.addColorStop(0.12, '#ffb03a');
      lg.addColorStop(0.4, '#ff5b1a');
      lg.addColorStop(1, '#7a1006');
      g.fillStyle = lg;
      g.fillRect(x0, y, x1 - x0, (H * T) - y);
      /* the surface, with a wave and a bright rim */
      g.beginPath();
      g.moveTo(x0, y + 8);
      for (var i = 0; i <= 28; i++) {
        var xx = x0 + (x1 - x0) * (i / 28);
        g.lineTo(xx, y + Math.sin(e.at * 2.4 + i * 0.7) * 4 + Math.sin(e.at * 5 + i * 1.9) * 2);
      }
      g.lineTo(x1, y + 26); g.lineTo(x0, y + 26);
      g.closePath();
      g.fillStyle = '#ffd77a';
      g.fill();
      g.globalAlpha = 0.28 + 0.1 * Math.sin(e.at * 3);
      g.fillStyle = '#ffe9a8';
      g.fillRect(x0, y - 70, x1 - x0, 70);
      g.globalAlpha = 1;
      if (!L.meltWon && e.armed) {
        txt(g, 'IT IS RISING', (x0 + x1) / 2, y + 40, 13, '#ffe9a8', { alpha: 0.5 });
      }
    }
  });

  /* wall vents: they breathe fire across the shaft on a clock */
  def('lGvent', {
    layer: 'main',
    init: function (e, d) {
      e.dir = d.dir === 'left' ? -1 : 1;
      e.every = d.every === undefined ? 3.1 : d.every;
      e.on = d.on === undefined ? 1.1 : d.on;
      e.phase = d.phase || 0;
      e.reach = (d.reach === undefined ? 5 : d.reach) * T;
      e.w = T; e.h = T;
      e.live = 0;
    },
    update: function (e, dt) {
      var ph = ((e.at + e.phase) % e.every) / e.every;
      var onFrac = e.on / e.every;
      e.warn = ph > (1 - onFrac - 0.22) && ph < (1 - onFrac);
      e.live = ph > (1 - onFrac);
      if (!e.live) return;
      var x = e.dir > 0 ? e.x + T : e.x - e.reach;
      if (hitP(x, e.y + 6, e.reach, T - 12, 4)) kill('fire');
      if (Math.random() < 0.8) {
        RT.particles.burst(x + Math.random() * e.reach, e.y + T / 2, {
          n: 1, colors: ['#ff7a3a', '#ffd23f'], speed: 90, life: 0.4, size: 3, gravity: -90
        });
      }
    },
    draw: function (e, g) {
      var mouthX = e.dir > 0 ? e.x + T - 6 : e.x + 6;
      rr(g, e.x + (e.dir > 0 ? T - 10 : 0), e.y + 4, 10, T - 8, 3, '#4a3428');
      circ(g, mouthX, e.y + T / 2, 5, e.live ? '#ffe9a8' : (e.warn ? '#ff7a3a' : '#2a1a14'));
      if (e.warn) {
        g.globalAlpha = 0.4 + 0.4 * Math.sin(e.at * 30);
        circ(g, mouthX, e.y + T / 2, 9, '#ff7a3a');
        g.globalAlpha = 1;
      }
      if (!e.live) return;
      var x = e.dir > 0 ? e.x + T : e.x - e.reach;
      var lg = g.createLinearGradient(e.dir > 0 ? x : x + e.reach, 0, e.dir > 0 ? x + e.reach : x, 0);
      lg.addColorStop(0, '#ffe9a8');
      lg.addColorStop(0.5, 'rgba(255,122,58,0.85)');
      lg.addColorStop(1, 'rgba(255,60,20,0.05)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(e.dir > 0 ? x : x + e.reach, e.y + 8);
      g.lineTo(e.dir > 0 ? x + e.reach : x, e.y + T / 2 - 7 - Math.sin(e.at * 22) * 3);
      g.lineTo(e.dir > 0 ? x + e.reach : x, e.y + T / 2 + 7 + Math.sin(e.at * 19) * 3);
      g.lineTo(e.dir > 0 ? x : x + e.reach, e.y + T - 8);
      g.closePath();
      g.fill();
    }
  });

  function startMelt() {
    if (L.meltOn) return;
    L.meltOn = 1;
    RT.banner(['III. THE MELT', 'up is the only direction that works'], 2);
    RT.toast('three seconds of grace, then it comes up at half a tile a second.', 3.2);
    if (RT.Audio && RT.Audio.music) RT.Audio.music('volcano');
  }

  /* ==================================================================== */
  /* IV. GALE PRIME - fire AND water, and the steam you make out of them  */
  /* -------------------------------------------------------------------- */
  /* The funnel is untouchable. It alternates FIRE and WATER; in WATER it  */
  /* leaves pools on the arena floor, in FIRE it boils anything it crosses */
  /* - and boiling a pool STALLS it, drops the eye to jumping height and   */
  /* opens it. The funnel chases your x. So the whole fight is: get it to  */
  /* stand in the puddle it made, while it is on fire, without being in    */
  /* the puddle yourself.                                                  */
  /* ==================================================================== */
  var G4 = { L: (A4.x0 - 1) * T, R: (A4.x1 + 1) * T, FLOOR: A4.floor * T };

  def('lGpool', {
    layer: 'back',
    init: function (e, d) {
      e.w = T * 3; e.h = T * 0.4;
      e.wet = 0;
      e.boiled = 0;
      e.idx = d.idx || 0;
    },
    update: function (e, dt) {
      if (e.wet > 0) e.wet = Math.max(0, e.wet - dt * 0.055);
      e.boiled = Math.max(0, e.boiled - dt);
    },
    reset: function (e) { e.wet = 0; e.boiled = 0; },
    draw: function (e, g) {
      if (e.wet <= 0.02) {
        g.globalAlpha = 0.22;
        g.strokeStyle = '#3df0ff'; g.lineWidth = 2;
        g.setLineDash([5, 6]);
        g.strokeRect(e.x + 2, e.y + 6, e.w - 4, 6);
        g.setLineDash([]);
        g.globalAlpha = 1;
        return;
      }
      var k = clamp(e.wet, 0, 1);
      g.globalAlpha = 0.35 + 0.45 * k;
      rr(g, e.x, e.y + 4, e.w, 10 * k + 4, 4, '#2a7ad8');
      rr(g, e.x + 3, e.y + 5, e.w - 6, 4, 2, '#8fd8ff');
      g.globalAlpha = 1;
      for (var i = 0; i < 3; i++) {
        var wx = e.x + 8 + ((e.at * 20 + i * 34) % (e.w - 16));
        g.globalAlpha = 0.5 * k;
        circ(g, wx, e.y + 8, 2, '#dff6ff');
        g.globalAlpha = 1;
      }
      if (e.boiled > 0) {
        g.globalAlpha = clamp(e.boiled, 0, 1) * 0.8;
        for (var j = 0; j < 8; j++) {
          circ(g, e.x + 6 + j * (e.w - 12) / 7, e.y - 6 - ((e.at * 60 + j * 20) % 40), 5 + j % 3, '#ffffff');
        }
        g.globalAlpha = 1;
      }
    }
  });

  def('lGjet', {
    layer: 'main',
    init: function (e, d) {
      e.dir = d.dir === 'left' ? -1 : 1;
      e.len = (d.len === undefined ? 8 : d.len) * T;
      e.life = d.life === undefined ? 1.5 : d.life;
      e.warm = 0.45;
      e.w = 0; e.h = 0;
      e.thick = T * 0.9;
    },
    update: function (e, dt) {
      e.life -= dt;
      if (e.life <= 0) { RT.remove(e); return; }
      if (e.at < e.warm) return;
      var x = e.dir > 0 ? e.x : e.x - e.len;
      if (hitP(x, e.y, e.len, e.thick, 4)) kill('water');
      if (Math.random() < 0.8) {
        RT.particles.burst(x + Math.random() * e.len, e.y + e.thick / 2, {
          n: 1, colors: ['#8fd8ff', '#3df0ff', '#ffffff'], speed: 120, life: 0.5, size: 3, gravity: 200
        });
      }
    },
    draw: function (e, g) {
      var x = e.dir > 0 ? e.x : e.x - e.len;
      if (e.at < e.warm) {
        g.globalAlpha = 0.25 + 0.4 * Math.sin(e.at * 40);
        g.fillStyle = '#3df0ff';
        g.fillRect(x, e.y + e.thick * 0.4, e.len, 3);
        g.globalAlpha = 1;
        return;
      }
      var lg = g.createLinearGradient(x, 0, x + e.len, 0);
      lg.addColorStop(0, e.dir > 0 ? '#ffffff' : 'rgba(61,240,255,0.1)');
      lg.addColorStop(0.5, '#3df0ff');
      lg.addColorStop(1, e.dir > 0 ? 'rgba(61,240,255,0.1)' : '#ffffff');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(x, e.y + 2);
      for (var i = 0; i <= 12; i++) {
        g.lineTo(x + e.len * (i / 12), e.y + 2 + Math.sin(e.at * 20 + i) * 3);
      }
      for (var j = 12; j >= 0; j--) {
        g.lineTo(x + e.len * (j / 12), e.y + e.thick - 2 + Math.sin(e.at * 18 + j + 1) * 3);
      }
      g.closePath();
      g.fill();
    }
  });

  def('lGgale', {
    layer: 'main',
    init: function (e, d) {
      e.w = T * 3.4; e.h = T * 9;
      bossInit(e, {
        key: 'gale', name: 'GALE PRIME', sub: 'fire and water, in that order',
        col: '#3df0ff', col2: '#ff8a3a', hp: 6, perPhase: 2, wake: A4.x0 + 4,
        lines: ['both, now', 'and the sky', 'all of it, faster'],
        hitLines: ['THE STEAM. of course.', 'i am made of two things', 'stop using my own water',
                   'i will keep the water', 'YOU ARE IN THE EYE', 'no more'],
        onDead: function () {
          var x, y;
          for (x = 172; x <= 176; x++) for (y = A4.floor; y <= A4.floor + 2; y++) carve(x, y, '.');
          RT.toast('the floor gave out at 172. that is the way down.', 3.4);
          RT.banner(['GALE PRIME DOWN', 'two of four'], 2);
        }
      });
      e.hx = (A4.x0 + 20) * T;
      e.el = 'water';
      e.elT = 0;
      e.stalled = 0;
      e.eyeY = (A4.floor - 5.0) * T;
      e.atk = 0;
      e.orbit = 0;
      e.rain = 0;
    },
    update: function (e, dt) {
      if (e.gone) return;
      e.stT += dt;
      if (e.invuln > 0) e.invuln -= dt;
      if (e.flash > 0) e.flash -= dt;
      placeGale(e);

      if (e.st === 'sleep') {
        if (alive() && pcx() > e.wake && pcx() < (A4.x1 + 2) * T && pty() < A4.floor + 2) bossWake(e);
        return;
      }
      if (e.dying) { bossDeathTick(e, dt); return; }
      if (e.st === 'intro') {
        if (e.stT > 1.8) {
          bossState(e, 'fight');
          RT.speech(e.hx, e.eyeY - 40, 'i am weather. you are a person.', 2.6);
          RT.toast('it cannot be hit. boil one of its own puddles with it standing in it.', 4.2);
        }
        return;
      }
      if (e.st === 'phase') {
        if (e.stT > 1.4) bossState(e, 'fight');
        return;
      }

      /* ---- element clock ------------------------------------------- */
      var period = e.phase === 1 ? 7.4 : e.phase === 2 ? 5.8 : 4.6;
      e.elT += dt;
      if (!e.stalled && e.elT > period) {
        e.elT = 0;
        e.el = e.el === 'fire' ? 'water' : 'fire';
        sfx(e.el === 'fire' ? 'charge' : 'portal');
        RT.flash(e.el === 'fire' ? 'rgba(255,138,58,0.5)' : 'rgba(61,240,255,0.45)', 0.14);
        ringFx(e.hx, e.eyeY, e.el === 'fire' ? '#ff8a3a' : '#3df0ff', 60, 6, 0.5);
        float(e.hx, e.eyeY - 40, e.el === 'fire' ? 'FIRE' : 'WATER', e.el === 'fire' ? '#ff8a3a' : '#3df0ff', 1.2);
      }

      /* ---- the stall: the only window in the fight ------------------ */
      if (e.stalled > 0) {
        e.stalled -= dt;
        e.eyeY = approach(e.eyeY, (A4.floor - 2.4) * T, 180 * dt);
        if (e.stalled <= 0) {
          e.open = 0;
          e.el = 'water'; e.elT = 0;
          sfx('portal');
        }
        steamFx(e);
        coreStomp(e);
        return;
      }

      /* ---- drift toward the player, the whole reason luring works --- */
      var want = alive() ? clamp(pcx(), G4.L + T * 2.4, G4.R - T * 2.4) : e.hx;
      var sp = (e.phase === 1 ? 1.9 : e.phase === 2 ? 2.4 : 3.0) * T;
      e.hx = approach(e.hx, want, sp * dt);
      e.eyeY = approach(e.eyeY, (A4.floor - 5.0) * T + Math.sin(e.at * 1.3) * 16, 120 * dt);

      /* ---- the pull ------------------------------------------------- */
      if (alive() && pty() < A4.floor + 3 && ptx() > A4.x0 - 3) {
        var p = P();
        var dx = e.hx - pcx();
        var dist = Math.abs(dx);
        if (dist > 10 && dist < T * 16) {
          var force = (e.phase === 1 ? 62 : e.phase === 2 ? 86 : 108) * (1 - dist / (T * 16));
          p.vx += (dx > 0 ? 1 : -1) * force * dt * 3.2;
        }
      }

      /* ---- boiling: fire funnel standing in its own puddle ---------- */
      if (e.el === 'fire') {
        var pools = RT.find('lGpool'), i, pl;
        for (i = 0; i < pools.length; i++) {
          pl = pools[i];
          if (pl.wet > 0.3 && e.hx > pl.x - 12 && e.hx < pl.x + pl.w + 12) {
            pl.wet = 0; pl.boiled = 2;
            e.stalled = e.phase === 1 ? 2.9 : e.phase === 2 ? 2.3 : 1.85;
            e.open = 1;
            sfx('portal'); sfx('laser');
            RT.cam.shake(8, 0.6);
            RT.flash('#ffffff', 0.16);
            RT.banner(['STEAM', 'the eye is down'], 1.2);
            ringFx(e.hx, G4.FLOOR - 20, '#ffffff', 70, 8, 0.6);
            break;
          }
        }
      }

      /* ---- the funnel kills ----------------------------------------- */
      if (hitP(e.hx - e.w * 0.36, e.eyeY - T, e.w * 0.72, (G4.FLOOR - e.eyeY) + T, 4)) kill('wind');

      /* ---- attacks --------------------------------------------------- */
      e.atk -= dt;
      if (e.atk <= 0) {
        e.atk = (e.phase === 1 ? 2.1 : e.phase === 2 ? 1.6 : 1.25);
        galeAttack(e);
      }
      /* ---- constant weather ----------------------------------------- */
      /* the water phase LEAVES WATER WHERE IT STANDS, and it stands where
       * you stand. That is the lever: you choose which puddle it fills. */
      if (e.el === 'water') {
        var ps = RT.find('lGpool'), pi;
        for (pi = 0; pi < ps.length; pi++) {
          if (Math.abs((ps[pi].x + ps[pi].w / 2) - e.hx) < T * 4) {
            ps[pi].wet = Math.min(1, ps[pi].wet + dt * 0.62);
          }
        }
      }
      e.rain -= dt;
      if (e.rain <= 0) {
        e.rain = e.el === 'water' ? 0.1 : 0.26;
        var rx = G4.L + lrand() * (G4.R - G4.L);
        if (e.el === 'water') {
          shot(rx, (A4.top - 1) * T, 0, 210, { kind: 'drop', col: '#3df0ff', col2: '#dff6ff', grav: 380, life: 5, r: 5 });
          var pool = poolNear(rx);
          if (pool && Math.abs((pool.x + pool.w / 2) - e.hx) < T * 5) pool.wet = Math.min(1, pool.wet + 0.05);
        } else if (e.phase >= 2) {
          shot(rx, (A4.top - 1) * T, 0, 190, { kind: 'ember', col: '#ff8a3a', col2: '#ffe9a8', grav: 300, life: 5, r: 5 });
        }
      }
      /* ---- the eyewall, phase three --------------------------------- */
      if (e.phase >= 3) {
        e.orbit += dt * 2.3;
        var j, a2, ox, oy;
        for (j = 0; j < 4; j++) {
          a2 = e.orbit + j * 1.5708;
          ox = e.hx + Math.cos(a2) * 96;
          oy = e.eyeY + Math.sin(a2) * 52;
          if (hitP(ox - 12, oy - 12, 24, 24, 4)) kill('wind');
        }
      }
      coreStomp(e);
    },
    draw: function (e, g) { drawGale(e, g); },
    reset: function (e) { e.hp = e.maxHp; }
  });

  function placeGale(e) {
    e.x = e.hx - e.w / 2;
    e.y = e.eyeY - T;
    e.core.x = e.hx;
    e.core.y = e.eyeY;
    e.core.r = e.stalled > 0 ? 26 : 16;
  }
  function poolNear(x) {
    var a = RT.find('lGpool'), i, best = null, bd = 1e9, d;
    for (i = 0; i < a.length; i++) {
      d = Math.abs((a[i].x + a[i].w / 2) - x);
      if (d < bd) { bd = d; best = a[i]; }
    }
    return bd < T * 2.5 ? best : null;
  }
  function steamFx(e) {
    if (Math.random() < 0.9) {
      RT.particles.burst(e.hx + (Math.random() - 0.5) * T * 3, G4.FLOOR - Math.random() * T * 4, {
        n: 1, colors: ['#ffffff', '#dff6ff', '#cfd6e8'], speed: 60, life: 1.1, size: 5, gravity: -140
      });
    }
  }

  function galeAttack(e) {
    var px = alive() ? pcx() : e.hx;
    if (e.el === 'fire') {
      /* spouts under you, plus one where you are about to be */
      var n = e.phase === 3 ? 3 : 2, i, sx;
      for (i = 0; i < n; i++) {
        sx = i === 0 ? px : px + (lrand() - 0.5) * T * 9;
        sx = clamp(sx, G4.L + T, G4.R - T * 2);
        RT.spawn({
          px: true, type: 'lGmark', x: sx - T * 0.8, y: G4.FLOOR, w: T * 1.6,
          delay: e.phase === 3 ? 0.62 : 0.85, kind: 'spout', from: 0, col: '#ff8a3a'
        });
      }
      sfx('charge');
    } else {
      /* water jets from both walls at player height, and a wave at the floor */
      var y = alive() ? clamp(pcy() - 14, (A4.top + 1) * T, G4.FLOOR - T) : G4.FLOOR - T * 2;
      RT.spawn({ px: true, type: 'lGjet', x: G4.L + 6, y: y, w: 0, h: 0, dir: 'right', len: 9, life: 1.6 });
      if (e.phase >= 2) {
        RT.spawn({ px: true, type: 'lGjet', x: G4.R - 6, y: y - T * 2.2, w: 0, h: 0, dir: 'left', len: 9, life: 1.6 });
      }
      sfx('laser');
    }
    if (e.phase >= 2 && lrand() < 0.5) {
      /* lightning: a column from the ceiling, marked for most of a second */
      var bx = clamp(px + (lrand() - 0.5) * T * 6, G4.L + T, G4.R - T * 2);
      RT.spawn({
        px: true, type: 'lGmark', x: bx - T * 0.9, y: G4.FLOOR, w: T * 1.8,
        delay: 0.8, kind: 'bolt', from: 10, col: '#9ad4ff'
      });
    }
  }

  function drawGale(e, g) {
    if (e.gone) return;
    var fire = e.el === 'fire';
    var c1 = fire ? '#ff8a3a' : '#3df0ff';
    var c2 = fire ? '#ffe9a8' : '#dff6ff';
    var top = e.eyeY - T * 1.2, bot = G4.FLOOR;
    var dying = e.dying ? clamp(1 - e.stT / 3.4, 0, 1) : 1;
    g.globalAlpha = dying;
    /* the funnel: stacked ellipses, wide at the top, narrow at the floor */
    var i, k, yy, wid, sway;
    for (i = 0; i <= 20; i++) {
      k = i / 20;
      yy = lerp(top, bot, k);
      wid = lerp(e.w * 0.62, e.w * 0.16, k) * (1 + Math.sin(e.at * 6 + k * 7) * 0.08);
      sway = Math.sin(e.at * 3 + k * 5) * (10 * (1 - k));
      g.globalAlpha = (0.16 + 0.5 * (1 - k)) * dying * (e.stalled > 0 ? 0.45 : 1);
      g.beginPath();
      g.ellipse(e.hx + sway, yy, wid, wid * 0.3, 0, 0, 6.2832);
      g.fillStyle = i % 3 === 0 ? c2 : c1;
      g.fill();
    }
    g.globalAlpha = dying;
    /* debris caught in the spin */
    for (i = 0; i < 9; i++) {
      var a = e.at * (fire ? 7 : 5) + i * 0.7;
      k = ((i / 9) + (e.at * 0.25 % 1)) % 1;
      yy = lerp(top, bot, k);
      wid = lerp(e.w * 0.62, e.w * 0.16, k);
      g.globalAlpha = 0.65 * dying;
      circ(g, e.hx + Math.cos(a) * wid, yy, 3.2, i % 2 ? c2 : '#ffffff');
    }
    g.globalAlpha = dying;
    /* the eye */
    var open = e.open && e.stalled > 0;
    if (open) {
      g.globalAlpha = (0.3 + 0.3 * Math.sin(e.at * 14)) * dying;
      circ(g, e.hx, e.eyeY, 40, '#ffffff');
      g.globalAlpha = dying;
      circ(g, e.hx, e.eyeY, 22, '#dff6ff');
      circ(g, e.hx, e.eyeY, 13, '#ffffff');
      circS(g, e.hx, e.eyeY, 30, '#ffd23f', 3);
      txt(g, 'THE EYE', e.hx, e.eyeY - 44, 11, '#ffd23f');
    } else {
      circ(g, e.hx, e.eyeY, 17, 'rgba(10,8,20,0.85)');
      circ(g, e.hx, e.eyeY, 9, e.flash > 0 ? '#ffffff' : c1);
      circ(g, e.hx + 3, e.eyeY - 2, 3.4, '#ffffff');
      g.globalAlpha = 0.4 * dying;
      circS(g, e.hx, e.eyeY, 22 + Math.sin(e.at * 5) * 3, c1, 2);
      g.globalAlpha = dying;
    }
    /* the eyewall */
    if (e.phase >= 3 && !e.dying) {
      for (i = 0; i < 4; i++) {
        var a2 = e.orbit + i * 1.5708;
        var ox = e.hx + Math.cos(a2) * 96, oy = e.eyeY + Math.sin(a2) * 52;
        poly(g, [ox - 11, oy, ox, oy - 10, ox + 11, oy, ox, oy + 10], '#6d7690');
        circ(g, ox, oy, 4, c1);
      }
    }
    /* element badge under the funnel, so the rule is always legible */
    txt(g, fire ? 'FIRE' : 'WATER', e.hx, bot + 16, 11, c1, { alpha: 0.75 * dying });
    g.globalAlpha = 1;
  }

  /* ==================================================================== */
  /* V. THE LONG COUNTER                                                  */
  /* -------------------------------------------------------------------- */
  /* Sixteen things to buy. The first one costs ONE. Then 2, 3, 5, 8, 12,  */
  /* 20, 30, 45, 70, 110, 180, 300, 900, 4,000 and finally THE GATE at     */
  /* 15,000, which is the only one that actually opens anything. The first */
  /* nine are pocket change to teach you the loop; the last three are the  */
  /* reason this act is called long.                                       */
  /* ==================================================================== */
  var LADDER_TILES = [[183, 43, '#'], [184, 41, '-'], [185, 39, '-'], [186, 37, '-']];
  var RAIL_TILES = [[217, 30, '-'], [218, 30, '-'], [219, 30, '-'], [220, 30, '-'], [221, 30, '-']];

  var SHOP = [
    { id: 'b1', name: 'ONE BRICK', price: 1, kind: 'cosmetic', flag: 'b1',
      x: 182, y: 42, w: 3, h: 1, color: '#c98f5a', icon: 'gate',
      desc: 'It costs one. It does nothing. It is here so the next one is not the first.' },
    { id: 'b2', name: 'ANOTHER BRICK', price: 2, kind: 'cosmetic', flag: 'b2', requires: 'b1',
      x: 186, y: 42, w: 3, h: 1, color: '#c98f5a',
      desc: 'Two. You are doing extremely well.' },
    { id: 'stool', name: 'THE STOOL', price: 3, kind: 'platform', tiles: [[183, 43, '#']], requires: 'b2',
      x: 190, y: 42, w: 3, h: 1, color: '#d8b06a',
      desc: 'One tile of wood. The first purchase in this game that you can stand on.' },
    { id: 'tin', name: 'THE TIN', price: 5, kind: 'dropper', cps: 1, requires: 'stool',
      x: 194, y: 42, w: 3, h: 1, mx: 193, my: 43, color: '#9ad4ff',
      desc: 'One a second. At this rate the gate is four hours away.' },
    { id: 'tin2', name: 'THE OTHER TIN', price: 8, kind: 'dropper', cps: 2, requires: 'tin',
      x: 198, y: 42, w: 3, h: 1, mx: 197, my: 43, color: '#9ad4ff',
      desc: 'Two a second. Two hours.' },
    { id: 'bucket', name: 'THE BUCKET', price: 12, kind: 'dropper', cps: 3, requires: 'tin2',
      x: 202, y: 42, w: 3, h: 1, mx: 201, my: 43, color: '#8dff9a',
      desc: 'Three. The trend is your friend.' },
    { id: 'lamp', name: 'THE LAMP', price: 20, kind: 'cosmetic', flag: 'lamp', requires: 'bucket',
      x: 206, y: 42, w: 3, h: 1, color: '#ffd23f',
      desc: 'Light. Purely so you can see how long the counter is.' },
    { id: 'rail', name: 'THE RAILING', price: 30, kind: 'platform', tiles: RAIL_TILES, requires: 'lamp',
      x: 210, y: 42, w: 3, h: 1, color: '#cfd6e8',
      desc: 'Five planks off the payout plate, so the lap stops ending in a fall.' },
    { id: 'pump', name: 'THE PUMP', price: 45, kind: 'dropper', cps: 6, requires: 'rail',
      x: 214, y: 42, w: 3, h: 1, mx: 213, my: 43, color: '#8dff9a',
      desc: 'Six a second. Now we are merely slow.' },
    { id: 'ladder', name: 'THE LADDER', price: 70, kind: 'platform', tiles: LADDER_TILES, requires: 'pump',
      x: 218, y: 42, w: 3, h: 1, color: '#d8b06a',
      desc: 'Four rungs onto the circuit. The lap gets about three seconds shorter.' },
    { id: 'shield', name: 'THE SHIELD', price: 110, kind: 'cosmetic', flag: 'shield', requires: 'ladder',
      x: 222, y: 42, w: 3, h: 1, color: '#67e8f9',
      desc: 'One free hit, renewed every life. It does not work on anything after the checkpoint.',
      onBuy: function (RT) { RT.player.shield = true; } },
    { id: 'belt', name: 'THE BELT', price: 180, kind: 'dropper', cps: 12, requires: 'shield',
      x: 226, y: 42, w: 3, h: 1, mx: 225, my: 43, color: '#8dff9a',
      desc: 'Twelve a second. The gate is now merely far away.' },
    { id: 'dj', name: 'DOUBLE JUMP', price: 300, kind: 'ability', ability: 'doubleJump', requires: 'belt',
      x: 230, y: 42, w: 3, h: 1, color: '#3df0ff',
      desc: 'It survives your death. Everything after the checkpoint assumes you own it.' },
    { id: 'furnace', name: 'THE FURNACE', price: 900, kind: 'dropper', cps: 30, requires: 'dj',
      x: 234, y: 42, w: 3, h: 1, mx: 233, my: 43, color: '#ff8a3a',
      desc: 'Thirty a second and a chimney. This is the one that makes the last two possible.' },
    { id: 'sign', name: 'THE SIGNATURE', price: 4000, kind: 'cosmetic', flag: 'sign', requires: 'furnace',
      x: 238, y: 42, w: 3, h: 1, color: '#ffe9a8',
      desc: 'Four thousand for your name on a plaque. There is no mechanical benefit. Buy it anyway.' },
    { id: 'gate', name: 'THE GATE', price: 15000, kind: 'cosmetic', flag: 'gate', requires: 'sign',
      x: 244, y: 42, w: 4, h: 1, color: '#ffd23f', icon: 'gate',
      desc: 'Fifteen thousand. It opens the wall at 249, and what is behind the wall is the reason this level has a reputation.',
      onBuy: function (RT) { openGate(); } }
  ];

  function openGate() {
    if (L.gateOpen) return;
    L.gateOpen = 1;
    var x, y;
    for (x = 249; x <= 250; x++) for (y = 34; y <= 43; y++) carve(x, y, '.');
    sfx('door'); sfx('win');
    RT.cam.shake(9, 0.9);
    RT.flash('#ffd23f', 0.2);
    RT.banner(['THE GATE IS OPEN', 'you paid for this'], 2.2);
    boom(249.5 * T, 39 * T, ['#ffd23f', '#ffe9a8', '#ffffff'], 60, 320, { life: 1.4, size: 5, spreadY: 160 });
  }

  function lapPay(n) { return Math.min(1400, Math.round(90 * Math.pow(1.72, n))); }

  function startCounter() {
    if (L.tycoonOn || !RT.Tycoon || !RT.Tycoon.start) return;
    L.tycoonOn = 1;
    RT.Tycoon.start({
      cash: 0, hudKey: 'cash', coinValue: 3, buyHold: 0.25,
      cashpad: { x: 179, y: 42, label: 'THE COUNTER' },
      items: SHOP,
      onBuy: function (item) {
        RT.banner([item.name, item.price >= 900 ? 'BOUGHT. finally.' : 'BOUGHT'], 1.3);
        if (item.id === 'dj') RT.toast('double jump. it survives death - the only thing in here that does.', 3);
        if (item.id === 'furnace') RT.toast('thirty a second. go and run laps while it works.', 3);
      }
    });
    RT.banner(['V. THE LONG COUNTER', 'sixteen things. the last one costs 15,000'], 2.4);
    RT.toast('THE CIRCUIT pays per lap and each lap pays more. the droppers pay while you run it.', 4);
    if (RT.Audio && RT.Audio.music) RT.Audio.music('tycoon');
  }

  function counterTick(dt) {
    if (!L.tycoonOn) return;
    var p = P();
    var onPlate = p.x + p.w > PLATE.x0 * T && p.x < (PLATE.x1 + 1) * T &&
                  p.y + p.h > (PLATE.y - 0.6) * T && p.y + p.h < (PLATE.y + 1.2) * T;
    var home = pcy() > (A5.floor - 1.4) * T && ptx() > 176 && ptx() < 248;
    if (L.plateArmed && onPlate) {
      var pay = lapPay(L.laps);
      L.laps++; L.plateArmed = 0;
      if (RT.Tycoon && RT.Tycoon.add) RT.Tycoon.add(pay);
      sfx('cash'); sfx('checkpoint');
      RT.flash('#ffe9a8', 0.12);
      RT.cam.shake(3, 0.2);
      boom(pcx(), pcy(), ['#ffd23f', '#fff6c4', '#ffffff'], 28, 240, { life: 0.9 });
      float(pcx(), pcy() - 16, '+' + pay, '#ffd23f', 1.2);
      RT.toast('LAP ' + L.laps + '  +' + pay + '.  next lap pays ' + lapPay(L.laps) + '.', 2);
    } else if (!L.plateArmed && home) {
      L.plateArmed = 1;
      sfx('tick');
    }
    RT.hud.set('lap', 'LAP ' + (L.laps + 1) + '  +' + lapPay(L.laps));
  }

  /* the plate, drawn big and gold so the loop is never in doubt */
  function drawPlate(g, t) {
    var px = PLATE.x0 * T, pw = (PLATE.x1 - PLATE.x0 + 1) * T, py = PLATE.y * T;
    var live = !!L.plateArmed;
    g.save();
    g.globalAlpha = live ? 0.3 + 0.14 * Math.sin(t * 4) : 0.07;
    g.fillStyle = '#ffd23f';
    g.fillRect(px, py - 46, pw, 46);
    g.restore();
    g.fillStyle = live ? '#ffd23f' : '#6b5a2a';
    g.fillRect(px, py - 4, pw, 4);
    txt(g, live ? 'PAYOUT  +' + lapPay(L.laps) : 'RUN THE LAP AGAIN', px + pw / 2,
        py - 56 + Math.sin(t * 3) * 3, 12, live ? '#ffe9a8' : '#8a7a4a');
  }

  /* ==================================================================== */
  /* VI. THE LAST CHECKPOINT                                              */
  /* ==================================================================== */
  def('lGshrine', {
    layer: 'back',
    init: function (e) { e.w = T * 4; e.h = T * 5; e.seen = 0; },
    update: function (e, dt) {
      if (!e.seen && alive() && Math.abs(pcx() - (e.x + e.w / 2)) < T * 4) {
        e.seen = 1;
        RT.banner(['THE LAST CHECKPOINT', 'there are no more. none. not one.'], 3);
        RT.toast('everything past this flag sends you back to this flag.', 4);
        sfx('checkpoint');
      }
    },
    reset: function (e) { e.seen = 1; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, h = e.h, t = e.at;
      /* an arch of light over the flag */
      g.globalAlpha = 0.14 + 0.05 * Math.sin(t * 2);
      g.fillStyle = '#8dff9a';
      g.beginPath();
      g.ellipse(x + w / 2, y + h, w * 0.9, h * 0.95, 0, Math.PI, 0);
      g.fill();
      g.globalAlpha = 1;
      rr(g, x - 4, y + h - 8, w + 8, 10, 4, '#2a3a2e');
      rr(g, x + 2, y + h - 22, 8, 16, 3, '#4a5a4e');
      rr(g, x + w - 10, y + h - 22, 8, 16, 3, '#4a5a4e');
      var i;
      for (i = 0; i < 3; i++) {
        g.globalAlpha = 0.5 - i * 0.12;
        circS(g, x + w / 2, y + h - 4, 30 + i * 22 + Math.sin(t * 1.6 + i) * 6, '#8dff9a', 2);
      }
      g.globalAlpha = 1;
      txt(g, 'LAST CHECKPOINT', x + w / 2, y + h - 70, 13, '#8dff9a', { alpha: 0.85 });
      txt(g, 'everything after this is one attempt', x + w / 2, y + h - 52, 9, '#dff6e4', { alpha: 0.7 });
    }
  });

  /* ==================================================================== */
  /* VII. THE TROLL - the five tricks that needed their own code          */
  /* -------------------------------------------------------------------- */
  /* The other twenty-six are built out of the library: fake tiles, hidden */
  /* spikes, invisible blocks, crumbling stairs, a key you do not need, a  */
  /* fake goal, beat blocks, saws, lasers, a ceiling and a conveyor that   */
  /* does exactly what a conveyor does, which is the trick.                */
  /* ==================================================================== */

  /* a coin that is not a coin. The tell: a real coin spins, this one does */
  def('lGmimic', {
    layer: 'main',
    init: function (e) { e.w = T * 0.8; e.h = T * 0.8; e.x += T * 0.1; e.bitten = 0; },
    update: function (e) {
      if (e.bitten) return;
      if (hitP(e.x + 3, e.y + 3, e.w - 6, e.h - 6, 4)) {
        e.bitten = 1;
        sfx('troll'); sfx('spike');
        boom(e.x + e.w / 2, e.y + e.h / 2, ['#ff3ea5', '#ffd23f', '#ffffff'], 26, 260);
        kill('troll');
      }
    },
    reset: function (e) { e.bitten = 0; },
    draw: function (e, g) {
      var cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      /* drawn as a coin that has forgotten to rotate */
      circ(g, cx, cy, e.w * 0.46, '#ffd23f');
      circ(g, cx, cy, e.w * 0.34, '#ffe9a8');
      g.globalAlpha = 0.5;
      circ(g, cx - 2, cy - 2, e.w * 0.16, '#ffffff');
      g.globalAlpha = 1;
      if (Math.sin(e.at * 1.2) > 0.985) {
        /* it blinks. once. you will not be looking. */
        circ(g, cx - 3, cy - 1, 1.6, '#120a14');
        circ(g, cx + 3, cy - 1, 1.6, '#120a14');
      }
    }
  });

  /* a checkpoint that is delighted to see you */
  def('lGfakecp', {
    layer: 'main',
    init: function (e) { e.w = T; e.h = T * 2; e.laughed = 0; },
    update: function (e, dt) {
      if (e.laughed > 0) { e.laughed -= dt; return; }
      if (hitP(e.x - 6, e.y, e.w + 12, e.h, 4)) {
        e.laughed = 2.4;
        sfx('troll'); sfx('fake');
        RT.cam.shake(3, 0.25);
        RT.toast('that flag is a picture of a flag.', 2.2);
        boom(e.x + e.w / 2, e.y + 10, ['#ff3ea5', '#ffffff'], 18, 180);
      }
    },
    reset: function (e) { e.laughed = 0; },
    draw: function (e, g) {
      var x = e.x + e.w / 2, y = e.y;
      rr(g, x - 2, y, 4, e.h, 2, '#cfd6e8');
      var wave = Math.sin(e.at * 3) * 3;
      var laughing = e.laughed > 0;
      poly(g, [x + 2, y + 4, x + 26 + wave, y + 12, x + 2, y + 20],
           laughing ? '#ff3ea5' : '#8dff9a');
      if (laughing) {
        txt(g, 'HA', x + 16, y - 10 - (2.4 - e.laughed) * 16, 14, '#ff3ea5',
            { alpha: clamp(e.laughed / 2.4, 0, 1) });
      }
    }
  });

  /* a platform that leaves. `real:false` means only the PICTURE leaves. */
  def('lGrunaway', {
    solid: true,
    init: function (e, d) {
      e.dw = T * (d.w === undefined ? 4 : d.w);
      e.dh = T * 0.75;
      e.w = e.dw; e.h = e.dh;
      e.rest = { x: e.x, y: e.y };
      e.slide = (d.slide === undefined ? 2.5 : d.slide) * T;
      e.near = (d.near === undefined ? 4.5 : d.near) * T;
      e.real = d.real === undefined ? true : !!d.real;
      e.vis = 0; e.go = 0; e.said = 0;
    },
    update: function (e, dt) {
      var trig = alive() && Math.abs(pcx() - (e.rest.x + e.dw / 2)) < e.near;
      if (trig && !e.go) {
        e.go = 1;
        sfx('troll');
        if (!e.said) { e.said = 1; float(e.rest.x + e.dw / 2, e.rest.y - 24, 'NOPE', '#ff3ea5', 1.2); }
      }
      if (e.go) e.vis = Math.min(e.slide, e.vis + T * 5 * dt);
      else e.vis = Math.max(0, e.vis - T * 3 * dt);
      if (e.real) { e.x = e.rest.x + e.vis; e.y = e.rest.y; }
    },
    reset: function (e) { e.go = 0; e.vis = 0; e.x = e.rest.x; e.y = e.rest.y; },
    draw: function (e, g) {
      var x = e.rest.x + e.vis, y = e.rest.y, w = e.dw, hh = e.dh;
      rr(g, x, y, w, hh, 5, '#7b5ad6');
      rr(g, x + 2, y + 2, w - 4, hh * 0.42, 4, '#bda6ff');
      /* legs, because a thing that runs away should have them */
      var st = Math.sin(e.at * 14) * (e.go ? 5 : 0);
      rr(g, x + 8, y + hh, 5, 9 + st, 2, '#5b3fae');
      rr(g, x + w - 13, y + hh, 5, 9 - st, 2, '#5b3fae');
      if (!e.real && e.vis > 4) {
        g.globalAlpha = 0.22;
        rr(g, e.rest.x, y, w, hh, 5, '#ffffff');
        g.globalAlpha = 1;
      }
    }
  });

  /* solid until the moment you are in the air, then not */
  def('lGghost', {
    solid: true,
    init: function (e, d) {
      e.dw = T * (d.w === undefined ? 3 : d.w);
      e.dh = T * 0.75;
      e.w = e.dw; e.h = e.dh;
      e.rest = { x: e.x, y: e.y };
      e.off = 0; e.armed = 0;
    },
    update: function (e, dt) {
      if (e.off > 0) {
        e.off -= dt;
        e.w = 0; e.h = 0;
        if (e.off <= 0) { e.w = e.dw; e.h = e.dh; }
        return;
      }
      var p = P();
      var over = alive() && p.x + p.w > e.rest.x && p.x < e.rest.x + e.dw &&
                 Math.abs((p.y + p.h) - e.rest.y) < 18;
      if (over && p.onGround) e.armed = 1;
      if (e.armed && alive() && !p.onGround && p.vy < -30) {
        e.armed = 0; e.off = 1.25;
        sfx('fake'); sfx('troll');
        boom(e.rest.x + e.dw / 2, e.rest.y, ['#9ad4ff', '#ffffff'], 16, 150, { gravity: 200 });
      }
      e.x = e.rest.x; e.y = e.rest.y;
    },
    reset: function (e) { e.off = 0; e.armed = 0; e.w = e.dw; e.h = e.dh; },
    draw: function (e, g) {
      var x = e.rest.x, y = e.rest.y, w = e.dw, hh = e.dh;
      var gone = e.off > 0;
      g.globalAlpha = gone ? 0.16 : 1;
      rr(g, x, y, w, hh, 4, '#4a6fa8');
      rr(g, x + 2, y + 2, w - 4, hh * 0.4, 3, '#9ad4ff');
      g.globalAlpha = 1;
      if (gone) {
        g.globalAlpha = 0.5;
        g.strokeStyle = '#9ad4ff'; g.lineWidth = 1.5;
        g.setLineDash([4, 5]);
        g.strokeRect(x, y, w, hh);
        g.setLineDash([]);
        g.globalAlpha = 1;
      }
    }
  });

  /* a puff of air that arrives exactly at the top of your jump */
  def('lGnudge', {
    layer: 'back',
    init: function (e, d) {
      e.w = T * (d.w === undefined ? 4 : d.w);
      e.h = T * (d.h === undefined ? 5 : d.h);
      e.fx = (d.fx === undefined ? -220 : d.fx);
      e.puff = 0;
    },
    update: function (e, dt) {
      if (!alive()) return;
      var p = P();
      if (p.onGround) return;
      if (!RT.overlaps(pbox(2), { x: e.x, y: e.y, w: e.w, h: e.h })) return;
      if (Math.abs(p.vy) > 240) return;              /* only at the apex     */
      p.vx += e.fx * dt * 2.6;
      e.puff = 0.3;
      if (Math.random() < 0.4) sfx('tick');
    },
    draw: function (e, g) {
      var i, k, x;
      g.globalAlpha = e.puff > 0 ? 0.5 : 0.16;
      for (i = 0; i < 5; i++) {
        k = ((e.at * 0.9 + i * 0.2) % 1);
        x = e.fx < 0 ? e.x + e.w * (1 - k) : e.x + e.w * k;
        rr(g, x - 14, e.y + 10 + i * (e.h - 20) / 4, 28, 3, 2, '#dff6ff');
      }
      g.globalAlpha = 1;
    }
  });

  /* ==================================================================== */
  /* IX. ONE JUMP - the jump, and the lie under it                        */
  /* ==================================================================== */
  def('lGonejump', {
    layer: 'front',
    init: function (e) { e.w = 0; e.h = 0; e.said = 0; e.landed = 0; },
    update: function (e, dt) {
      if (!alive()) return;
      var tx = ptx(), ty = pty();
      if (!e.said && tx > A9.x0 + 2 && ty < A9.row + 3) {
        e.said = 1;
        RT.banner(['ONE JUMP', 'that is all that is left'], 2.4);
        RT.toast('it is three tiles. you have cleared three tiles about four hundred times tonight.', 3.4);
      }
      if (!e.landed && tx > 372.4 && ty > A9.row - 4 && ty < A9.row + 2 && P().onGround) {
        e.landed = 1;
        L.jumped = 1;
        sfx('win');
        RT.cam.shake(6, 0.6);
        boom(pcx(), pcy(), ['#8dff9a', '#ffffff', '#ffd23f'], 50, 320, { life: 1.3 });
        fakeWin();
      }
    },
    reset: function (e) { e.said = 0; e.landed = 0; },
    draw: function (e, g) {
      if (!L.done.jester) return;
      var y = (A9.row - 4) * T;
      txt(g, 'DANGER', 371 * T, y - 40, 26, '#ff3ea5', { alpha: 0.5 + 0.2 * Math.sin(e.at * 3) });
      txt(g, '99.97% OF PLAYERS DIE HERE', 371 * T, y - 14, 12, '#ffd23f', { alpha: 0.8 });
      txt(g, '(this statistic is invented)', 371 * T, y + 2, 8, '#dfe7ff', { alpha: 0.4 });
    }
  });

  /* ==================================================================== */
  /* VIII. THE JESTER                                                     */
  /* -------------------------------------------------------------------- */
  /* The troll boss. It reverses you, it deletes the floor, it copies      */
  /* itself three times, it puts up a shield you have to switch off, and   */
  /* when you finally empty the bar it dies - completely, with a death     */
  /* animation and a YOU WIN - and then it gets back up with three more.   */
  /* Dying here costs you the whole troll obby, because there is no        */
  /* checkpoint after 252. That is not an oversight.                       */
  /* ==================================================================== */
  var J8 = { L: (A8.x0) * T, R: (A8.x1 + 1) * T, FLOOR: A8.floor * T };

  def('lGpad', {
    layer: 'main',
    init: function (e) { e.w = T * 2; e.h = T * 0.5; e.hitT = 0; e.life = 9; },
    update: function (e, dt) {
      e.life -= dt;
      if (e.life <= 0) { RT.remove(e); return; }
      if (e.hitT > 0) { e.hitT -= dt; return; }
      if (hitP(e.x, e.y - 8, e.w, e.h + 12, 4)) {
        e.hitT = 1;
        sfx('switch'); sfx('powerup');
        RT.cam.shake(5, 0.3);
        ringFx(e.x + e.w / 2, e.y, '#8dff9a', 40, 5, 0.4);
        var j = RT.findOne ? RT.findOne('lGjester') : RT.find('lGjester')[0];
        if (j) { j.shield = 0; j.open = 1; j.openT = 2.3; j.st = 'dropped'; j.stT = 0; }
        RT.remove(e);
      }
    },
    draw: function (e, g) {
      var x = e.x, y = e.y;
      g.globalAlpha = 0.3 + 0.25 * Math.sin(e.at * 9);
      rr(g, x - 4, y - 22, e.w + 8, 26, 6, '#8dff9a');
      g.globalAlpha = 1;
      rr(g, x, y, e.w, e.h, 4, '#2a3a2e');
      rr(g, x + 3, y + 2, e.w - 6, e.h - 6, 3, '#8dff9a');
      txt(g, 'STAND ON IT', x + e.w / 2, y - 30, 10, '#8dff9a');
    }
  });

  def('lGclone', {
    layer: 'main',
    init: function (e, d) {
      e.w = T * 1.8; e.h = T * 2.2;
      e.life = d.life === undefined ? 5 : d.life;
      e.hx = e.x + e.w / 2; e.hy = e.y + e.h / 2;
      e.ph = d.phase || 0;
      e.popped = 0;
    },
    update: function (e, dt) {
      e.life -= dt;
      if (e.life <= 0 || e.popped) { RT.remove(e); return; }
      e.hx += Math.sin(e.at * 1.7 + e.ph * 2) * 60 * dt;
      e.hy = J8.FLOOR - T * 3.2 + Math.sin(e.at * 3 + e.ph) * T * 0.9;
      e.hx = clamp(e.hx, J8.L + T, J8.R - T * 2);
      e.x = e.hx - e.w / 2; e.y = e.hy - e.h / 2;
      var p = P();
      if (!alive()) return;
      var gem = { x: e.hx - 14, y: e.y - 4, w: 28, h: 18 };
      if (p.vy > 40 && RT.overlaps({ x: p.x + 4, y: p.y + p.h - 10, w: p.w - 8, h: 14 }, gem)) {
        e.popped = 1;
        sfx('troll'); sfx('fake');
        RT.cam.shake(5, 0.35);
        if (RT.bounce) RT.bounce(-430);
        boom(e.hx, e.hy, ['#ff3ea5', '#ffd23f', '#ffffff'], 26, 280);
        /* the punishment for guessing: four shards and reversed controls */
        var i, a;
        for (i = 0; i < 4; i++) {
          a = -2.6 + i * 0.62;
          shot(e.hx, e.hy, Math.cos(a) * 190, Math.sin(a) * 190,
               { kind: 'confetti', col: '#ff3ea5', col2: '#ffd23f', grav: 420, life: 2.6 });
        }
        S.revT = Math.max(S.revT || 0, 2.6);
        RT.toast('wrong one.', 1.4);
        return;
      }
      if (hitP(e.x + 6, e.y + 14, e.w - 12, e.h - 18, 4)) kill('troll');
    },
    draw: function (e, g) { drawJesterBody(e, g, true); }
  });

  def('lGjester', {
    layer: 'main',
    init: function (e) {
      e.w = T * 1.9; e.h = T * 2.4;
      bossInit(e, {
        key: 'jester', name: 'THE JESTER', sub: 'it has read your inputs',
        col: '#ff3ea5', col2: '#ffd23f', hp: 6, perPhase: 2, wake: A8.x0 + 1,
        lines: ['copies', 'and the floor', 'and the shield'],
        hitLines: ['ow. genuinely.', 'lucky', 'that was the real one?', 'stop', 'i am the FUNNY one', 'NO'],
        onDead: function (b) { jesterFinish(b); }
      });
      e.hx = (A8.x0 + 12) * T;
      e.hy = J8.FLOOR - T * 3;
      e.shield = 0;
      e.round = 1;
      e.hop = 0; e.hopV = 0;
      e.laughs = 0;
    },
    update: function (e, dt) {
      if (e.gone) return;
      e.stT += dt;
      if (e.invuln > 0) e.invuln -= dt;
      if (e.flash > 0) e.flash -= dt;
      placeJester(e);

      if (e.st === 'sleep') {
        if (alive() && pcx() > e.wake && pty() > A8.floor - 12) {
          bossWake(e);
          sealJester();
        }
        return;
      }
      /* the first time the bar empties it does not die, it ACTS */
      if (e.dying && e.round === 1) {
        e.dying = 0;
        e.fakeBannered = 0; e.resurrected = 0;
        bossState(e, 'fakedeath');
        clearShots();
      }
      if (e.st === 'fakedeath') { fakeDeathT(e, dt); return; }
      if (e.dying) { bossDeathTick(e, dt); return; }

      /* hop, always: it never stands still */
      e.hop += dt;
      var hopPeriod = e.round === 2 ? 0.62 : 0.8;
      var k = (e.hop % hopPeriod) / hopPeriod;
      e.hy = J8.FLOOR - T * 1.9 - Math.sin(k * Math.PI) * T * 1.9;

      switch (e.st) {
        case 'intro':
          if (e.stT > 1.8) {
            bossState(e, 'idle');
            RT.speech(e.hx, e.hy - 46, 'there is no checkpoint behind you. i checked.', 3);
          }
          break;
        case 'idle': jIdle(e, dt); break;
        case 'phase':
          if (e.stT > 1.3) bossState(e, 'idle');
          break;
        case 'recover':
          jDrift(e, dt, 90);
          if (e.stT > (e.round === 2 ? 0.45 : 0.7)) bossState(e, 'idle');
          break;
        case 'laugh': jLaugh(e, dt); break;
        case 'clones': jClones(e, dt); break;
        case 'reverse': jReverse(e, dt); break;
        case 'fakefloor': jFakeFloor(e, dt); break;
        case 'bombs': jBombs(e, dt); break;
        case 'shield': jShield(e, dt); break;
        case 'dropped': jDropped(e, dt); break;
      }
      placeJester(e);
      if (!e.open && hitP(e.x + 6, e.y + 16, e.w - 12, e.h - 20, 4)) kill('troll');
      if (e.open && !coreStomp(e)) {
        if (hitP(e.x + 6, e.y + 26, e.w - 12, e.h - 30, 4)) kill('troll');
      }
    },
    draw: function (e, g) {
      if (e.gone) return;
      drawJesterBody(e, g, false);
      if (e.shield) {
        g.globalAlpha = 0.25 + 0.12 * Math.sin(e.at * 8);
        circ(g, e.hx, e.hy, 52, '#9ad4ff');
        g.globalAlpha = 0.8;
        circS(g, e.hx, e.hy, 52, '#9ad4ff', 3);
        g.globalAlpha = 1;
      }
    },
    reset: function (e) { e.hp = e.maxHp; }
  });

  function placeJester(e) {
    e.x = e.hx - e.w / 2;
    e.y = e.hy - e.h / 2;
    e.core.x = e.hx;
    e.core.y = e.y + 4;
    e.core.r = 19;
  }
  function jDrift(e, dt, sp) {
    var want = alive() ? clamp(pcx(), J8.L + T * 2, J8.R - T * 2) : e.hx;
    e.hx = approach(e.hx, want, (sp || 110) * dt);
  }
  function jTeleport(e) {
    boom(e.hx, e.hy, ['#ff3ea5', '#ffd23f', '#ffffff'], 24, 240);
    sfx('portal');
    var tries = 0, nx;
    do { nx = J8.L + T * 2 + lrand() * (J8.R - J8.L - T * 4); tries++; }
    while (alive() && Math.abs(nx - pcx()) < T * 4 && tries < 8);
    e.hx = nx;
    boom(e.hx, e.hy, ['#ff3ea5', '#ffffff'], 18, 200);
  }

  function jIdle(e, dt) {
    jDrift(e, dt, 100);
    var wait = e.round === 2 ? 0.35 : 0.6;
    if (e.stT < wait) return;
    var list = e.round === 2 ? ['shield', 'clones', 'reverse', 'bombs', 'laugh', 'fakefloor']
      : e.phase === 1 ? ['laugh', 'bombs', 'clones']
      : e.phase === 2 ? ['reverse', 'laugh', 'fakefloor', 'clones', 'bombs']
      : ['shield', 'clones', 'bombs', 'laugh', 'reverse', 'fakefloor'];
    bossState(e, nextPattern(e, list));
    e.shots = 0;
  }

  /* the honest window: it laughs, and while it laughs you can land on it */
  function jLaugh(e, dt) {
    if (!e.shots) {
      e.shots = 1;
      e.open = 1;
      e.openT = e.round === 2 ? 1.35 : e.phase === 3 ? 1.5 : 1.9;
      sfx('troll');
      RT.speech(e.hx, e.hy - 46, ['HAHAHA', 'HEE HEE', 'HA. HA. HA.'][Math.floor(lrand() * 3)], 1.2);
    }
    e.openT -= dt;
    jDrift(e, dt, 40);
    if (e.openT <= 0) { e.open = 0; bossState(e, 'recover'); }
  }

  function jClones(e, dt) {
    if (!e.shots) {
      e.shots = 1;
      e.open = 1;
      e.openT = e.round === 2 ? 4.2 : 5;
      jTeleport(e);
      var n = e.phase >= 3 || e.round === 2 ? 3 : 2, i;
      for (i = 0; i < n; i++) {
        RT.spawn({
          px: true, type: 'lGclone',
          x: J8.L + T * 2 + lrand() * (J8.R - J8.L - T * 5), y: J8.FLOOR - T * 4,
          life: e.openT, phase: i * 1.3
        });
      }
      RT.toast('one of these is the one with the shadow.', 2.4);
    }
    e.openT -= dt;
    e.hx += Math.sin(e.at * 1.9) * 70 * dt;
    e.hx = clamp(e.hx, J8.L + T, J8.R - T * 2);
    if (e.openT <= 0) { e.open = 0; bossState(e, 'recover'); }
  }

  function jReverse(e, dt) {
    if (!e.shots) {
      e.shots = 1;
      S.revT = e.round === 2 ? 5 : 4;
      sfx('troll'); sfx('portal');
      RT.flash('rgba(255,62,165,0.35)', 0.16);
      RT.toast('left is right for four seconds. the bombs do not care.', 2.2);
    }
    jDrift(e, dt, 120);
    if (e.stT > 0.7 && !e.shots2) {
      e.shots2 = 1;
      lob(e, 2);
    }
    if (e.stT > 2) { e.shots2 = 0; bossState(e, 'recover'); }
  }

  function jFakeFloor(e, dt) {
    if (!e.shots) {
      e.shots = 1;
      var tx = alive() ? Math.round(ptx()) : 386;
      var i, list = [];
      for (i = -2; i <= 1; i++) {
        var x = clamp(tx + i, A8.x0, A8.x1);
        list.push([x, A8.floor, RT.getTile(x, A8.floor)]);
        carve(x, A8.floor, '.');
      }
      L.fakeFloor = { tiles: list, t: e.round === 2 ? 4 : 3.2 };
      sfx('crumble'); sfx('troll');
      RT.cam.shake(4, 0.3);
      RT.toast('the floor is a suggestion.', 1.8);
      lob(e, 2);
    }
    jDrift(e, dt, 90);
    if (e.stT > 1.6) bossState(e, 'recover');
  }

  function jBombs(e, dt) {
    var n = e.round === 2 ? 4 : e.phase >= 2 ? 3 : 2;
    var gap = 0.42;
    if (e.shots < n && e.stT > e.shots * gap) {
      e.shots++;
      lob(e, 1);
    }
    jDrift(e, dt, 130);
    if (e.stT > n * gap + 0.6) bossState(e, 'recover');
  }
  function lob(e, n) {
    var i, px = alive() ? pcx() : e.hx;
    for (i = 0; i < n; i++) {
      var dx = (px + (lrand() - 0.5) * T * 4) - e.hx;
      shot(e.hx, e.hy - 10, clamp(dx * 0.9, -300, 300), -300 - lrand() * 90,
           { kind: 'confetti', col: '#ff3ea5', col2: '#3df0ff', grav: 620, life: 4, r: 9 });
    }
    sfx('pop');
  }

  function jShield(e, dt) {
    if (!e.shots) {
      e.shots = 1;
      e.shield = 1;
      e.invuln = 99;
      jTeleport(e);
      var left = lrand() < 0.5;
      RT.spawn({
        px: true, type: 'lGpad',
        x: left ? J8.L + T * 1.5 : J8.R - T * 3.5, y: J8.FLOOR - T * 0.5, w: 0, h: 0
      });
      sfx('charge');
      RT.toast('the pad drops the shield. it is at the end you are not at.', 2.6);
    }
    jDrift(e, dt, 60);
    if (e.stT > 1 && e.shots === 1) { e.shots = 2; lob(e, 2); }
    if (e.stT > 9.5) {                 /* it gives up on its own eventually */
      e.shield = 0; e.invuln = 0;
      bossState(e, 'recover');
    }
  }
  function jDropped(e, dt) {
    e.invuln = 0;
    e.openT -= dt;
    jDrift(e, dt, 40);
    if (e.openT <= 0) { e.open = 0; bossState(e, 'recover'); }
  }

  /* ------------------------------------------------------- the two deaths */
  function jesterFinish(b) {
    /* called by bossDeathTick the FIRST time the bar empties */
    if (b.round === 1) return;         /* handled in fakeDeathT instead      */
    L.done.jester = 1;
    openJesterExit(b);
  }
  function openJesterExit(b) {
    RT.banner(['THE JESTER IS DOWN', 'three of four'], 2.2);
    RT.spawn({
      type: 'portal', x: A8.x1 - 2, y: A8.floor - 2, w: 1.4, h: 2,
      to: [A9.x0 + 2, A9.row - 2], color: '#ff3ea5'
    });
    RT.toast('a door up to the last jump. it is one jump. it is four tiles.', 3.6);
  }

  function fakeDeathT(e, dt) {
    /* a complete, sincere, entirely fraudulent death */
    if (e.stT < 2.2) {
      if (Math.random() < 0.5) {
        boom(e.hx + (Math.random() - 0.5) * 40, e.hy + (Math.random() - 0.5) * 40,
             ['#ff3ea5', '#ffd23f', '#ffffff'], 8, 200, { life: 0.9 });
      }
      e.hy = approach(e.hy, J8.FLOOR - T * 0.9, 60 * dt);
      return;
    }
    if (!e.fakeBannered) {
      e.fakeBannered = 1;
      RT.banner(['YOU WIN', 'the jester is dead'], 2.4);
      sfx('win');
      RT.flash('#ffffff', 0.3);
      boom(e.hx, e.hy, ['#8dff9a', '#ffffff', '#ffd23f'], 60, 340, { life: 1.6 });
    }
    if (e.stT > 4.6 && !e.resurrected) {
      e.resurrected = 1;
      e.round = 2;
      e.maxHp = 3; e.hp = 3; e.perPhase = 3; e.phases = 1; e.phase = 1;
      e.queue = []; e.qi = 0;
      e.invuln = 1;
      bossState(e, 'idle');
      sfx('troll'); sfx('death');
      RT.banner(['JUST KIDDING', 'three more'], 2.4);
      RT.flash('#ff3ea5', 0.3);
      RT.cam.shake(12, 1);
      RT.speech(e.hx, e.hy - 50, 'you actually stopped moving. i saw you stop moving.', 3.4);
      boom(e.hx, e.hy, ['#ff3ea5', '#ffd23f'], 50, 320, { life: 1.3 });
    }
  }

  function sealJester() {
    var y;
    for (y = 38; y <= 43; y++) carve(A8.x0 - 1, y, '#');
    sfx('door');
    RT.cam.shake(5, 0.4);
  }

  /* ----------------------------------------------------------- the paint */
  function drawJesterBody(e, g, isClone) {
    var x = e.hx, y = e.hy, t = e.at;
    var col = isClone ? '#ff3ea5' : '#ff3ea5';
    var dying = e.dying ? clamp(1 - e.stT / 3.4, 0, 1) : 1;
    g.save();
    g.globalAlpha = dying;
    /* THE TELL: the real one has a shadow. the copies do not. */
    if (!isClone && RT.groundShadow) RT.groundShadow(g, x, J8.FLOOR, 34);
    /* body */
    var lean = Math.sin(t * 6) * 0.08;
    g.translate(x, y);
    g.rotate(lean);
    poly(g, [-20, 24, 20, 24, 13, -6, -13, -6], col);
    poly(g, [-13, -6, 13, -6, 10, 6, -10, 6], '#3df0ff');
    /* ruff */
    var i;
    for (i = 0; i < 5; i++) {
      circ(g, -16 + i * 8, -8, 6, i % 2 ? '#ffd23f' : '#ffffff');
    }
    /* head */
    circ(g, 0, -22, 13, '#ffe9d6');
    circ(g, -5, -24, 2.6, '#120a14');
    circ(g, 5, -24, 2.6, '#120a14');
    g.strokeStyle = '#c04a6a'; g.lineWidth = 2;
    g.beginPath();
    g.arc(0, -19, 6, 0.2, Math.PI - 0.2);
    g.stroke();
    /* three-pointed hat with bells - the middle bell is the core */
    var hp = [[-18, -30], [0, -40], [18, -30]];
    poly(g, [-14, -30, 0, -52, 14, -30], col);
    poly(g, [-22, -26, -6, -44, -2, -28], '#3df0ff');
    poly(g, [22, -26, 6, -44, 2, -28], '#ffd23f');
    for (i = 0; i < hp.length; i++) {
      circ(g, hp[i][0], hp[i][1] - 4, 4, '#ffd23f');
    }
    var open = e.open && !isClone;
    if (open || isClone) {
      g.globalAlpha = (0.35 + 0.3 * Math.sin(t * 14)) * dying;
      circ(g, 0, -52, 22, '#ffd23f');
      g.globalAlpha = dying;
      circ(g, 0, -52, 11, '#ffffff');
      circS(g, 0, -52, 17, '#ffd23f', 3);
    } else {
      circ(g, 0, -52, 7, '#8a2a52');
    }
    if (e.flash > 0) {
      g.globalAlpha = e.flash * 0.8;
      poly(g, [-20, 24, 20, 24, 13, -6, -13, -6], '#ffffff');
      g.globalAlpha = dying;
    }
    g.restore();
  }

  /* ==================================================================== */
  /* X-a. THE FAKE ENDING                                                 */
  /* -------------------------------------------------------------------- */
  /* A full, sincere victory screen with a button on it. Pressing the      */
  /* button is the last mistake this game asks you to make.                */
  /* ==================================================================== */
  function fakeWin() {
    if (L.fakeWinShown) return;
    L.fakeWinShown = 1;
    if (RT.Audio && RT.Audio.music) RT.Audio.music('meadow');
    var st = { t: 0, kidding: 0, out: 0, btn: null, conf: [], glitch: 0 };
    var i;
    for (i = 0; i < 90; i++) {
      st.conf.push({
        x: Math.random(), y: Math.random() * -1, v: 0.18 + Math.random() * 0.3,
        r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 6,
        c: ['#ff3ea5', '#3df0ff', '#ffd23f', '#8dff9a', '#ffffff'][i % 5],
        w: 5 + Math.random() * 7
      });
    }
    function press() {
      if (st.kidding) return;
      st.kidding = 1; st.t = 0;
      sfx('troll'); sfx('death');
      RT.cam.shake(10, 0.8);
    }
    RT.setMode({
      update: function (dt) {
        st.t += dt;
        for (var j = 0; j < st.conf.length; j++) {
          var c = st.conf[j];
          c.y += c.v * dt * (st.kidding ? 0.2 : 1);
          c.r += c.vr * dt;
          if (c.y > 1.1) { c.y = -0.1; c.x = Math.random(); }
        }
        if (st.kidding) {
          st.glitch = clamp(st.t * 2.2, 0, 1);
          if (st.t > 2.6 && !st.out) {
            st.out = 1;
            RT.clearMode();
            startAuthor();
          }
        }
      },
      onKey: function (ev) {
        if (!ev || ev.type !== 'keydown') return;
        press();
      },
      onPointer: function (type, p) {
        if (type !== 'down' || !st.btn) return;
        if (p.x >= st.btn.x && p.x <= st.btn.x + st.btn.w &&
            p.y >= st.btn.y && p.y <= st.btn.y + st.btn.h) press();
        else press();
      },
      draw: function (g, w, h) {
        var cx = w / 2, t = st.t;
        /* sky */
        var lg = g.createLinearGradient(0, 0, 0, h);
        if (st.kidding) {
          lg.addColorStop(0, '#12060f'); lg.addColorStop(0.6, '#2a0a1e'); lg.addColorStop(1, '#4a0f2a');
        } else {
          lg.addColorStop(0, '#0b1a3a'); lg.addColorStop(0.45, '#2a4a8a'); lg.addColorStop(1, '#ffd9a0');
        }
        g.fillStyle = lg;
        g.fillRect(0, 0, w, h);
        /* confetti */
        var j, c;
        for (j = 0; j < st.conf.length; j++) {
          c = st.conf[j];
          g.save();
          g.translate(c.x * w, c.y * h);
          g.rotate(c.r);
          g.globalAlpha = st.kidding ? 0.25 : 0.9;
          g.fillStyle = st.kidding ? '#6a4a5a' : c.c;
          g.fillRect(-c.w / 2, -c.w / 4, c.w, c.w / 2);
          g.restore();
        }
        g.globalAlpha = 1;
        /* trophy */
        var ty = h * 0.3;
        if (!st.kidding) {
          var bob = Math.sin(t * 2) * 5;
          g.save();
          g.translate(cx, ty + bob);
          g.globalAlpha = 0.25 + 0.1 * Math.sin(t * 3);
          circ(g, 0, 0, 72, '#ffd23f');
          g.globalAlpha = 1;
          poly(g, [-30, -34, 30, -34, 20, 16, -20, 16], '#ffd23f');
          poly(g, [-22, -28, 22, -28, 15, 8, -15, 8], '#ffe9a8');
          rr(g, -8, 16, 16, 16, 3, '#ffd23f');
          rr(g, -26, 32, 52, 10, 4, '#c9962a');
          circS(g, -40, -22, 14, '#ffd23f', 6);
          circS(g, 40, -22, 14, '#ffd23f', 6);
          g.restore();
        } else {
          g.save();
          g.translate(cx, ty + 10);
          g.rotate(0.5 + st.glitch);
          g.globalAlpha = 0.7;
          poly(g, [-30, -34, 30, -34, 20, 16, -20, 16], '#6a5a2a');
          g.restore();
          g.globalAlpha = 1;
        }
        /* words */
        var title = st.kidding ? 'JUST KIDDING' : 'YOU WIN';
        var tsz = Math.min(w * 0.13, 74);
        if (st.kidding && st.glitch > 0) {
          g.save();
          g.globalAlpha = 0.5;
          txt(g, title, cx + Math.sin(t * 40) * 6, h * 0.55, tsz, '#3df0ff');
          txt(g, title, cx - Math.sin(t * 37) * 6, h * 0.55, tsz, '#ff3ea5');
          g.restore();
        }
        txt(g, title, cx, h * 0.55, tsz, st.kidding ? '#ffffff' : '#ffe9a8');
        txt(g, st.kidding ? 'there is one more. there was always one more.'
                          : 'TWELVE TRIALS  -  ' + (RT.deaths || 0) + ' DEATHS IN THIS ONE',
            cx, h * 0.55 + tsz * 0.62, Math.min(w * 0.032, 17), st.kidding ? '#ff9ad4' : '#dff6ff');
        /* the button */
        if (!st.kidding) {
          var bw = Math.min(w * 0.42, 260), bh = Math.min(h * 0.12, 64);
          var bx = cx - bw / 2, by = h * 0.74;
          st.btn = { x: bx, y: by, w: bw, h: bh };
          var pulse = 0.5 + 0.5 * Math.sin(t * 4);
          g.globalAlpha = 0.3 + pulse * 0.25;
          rr(g, bx - 8, by - 8, bw + 16, bh + 16, 16, '#8dff9a');
          g.globalAlpha = 1;
          rr(g, bx, by, bw, bh, 12, '#8dff9a');
          rr(g, bx + 4, by + 4, bw - 8, bh * 0.4, 9, '#c8ffd4');
          txt(g, 'yay!', cx, by + bh * 0.54, Math.min(bh * 0.52, 30), '#0a2a12', { stroke: 'rgba(255,255,255,0.5)', strokeWidth: 2 });
          txt(g, RT.isTouch && RT.isTouch() ? 'TAP IT' : 'CLICK IT  -  or press anything',
              cx, by + bh + 22, Math.min(w * 0.026, 13), '#dff6ff', { alpha: 0.75 });
        } else {
          st.btn = null;
        }
        /* scanline sweep on the turn */
        if (st.kidding) {
          g.globalAlpha = 0.12;
          for (var s = 0; s < h; s += 4) {
            g.fillStyle = s % 8 === 0 ? '#ff3ea5' : '#000000';
            g.fillRect(0, s + (t * 120 % 8), w, 2);
          }
          g.globalAlpha = 1;
        }
      }
    });
  }

  function startAuthor() {
    var p = P();
    p.x = (AX.x0 + 3) * T; p.y = (AX.floor - 2) * T;
    p.vx = 0; p.vy = 0;
    p.dead = false;
    RT.cam.x = p.x; RT.cam.y = p.y;
    L.authorOn = 1;
    if (!L.done.author) {
      RT.spawn({ type: 'lGauthor', x: AX.x0 + 30, y: AX.top + 4, w: 3, h: 3 });
    }
    if (RT.Audio && RT.Audio.music) RT.Audio.music('void');
    RT.flash('#ffffff', 0.4);
    RT.banner(['X. THE AUTHOR', 'it wrote the other eleven'], 2.6);
  }

  /* ==================================================================== */
  /* X-b. THE AUTHOR                                                      */
  /* -------------------------------------------------------------------- */
  /* Five hits. Every one of them is the same shape: it WRITES a pad, it   */
  /* counts you in on four beats, and the core is open for a third of a    */
  /* second at the top of the jump you take on the fourth. Miss it and you */
  /* eat a paragraph. The window shrinks every time.                       */
  /* ==================================================================== */
  var AU = { L: AX.x0 * T, R: (AX.x1 + 1) * T, FLOOR: AX.floor * T };

  def('lGwrit', {
    solid: true,
    init: function (e, d) {
      e.dw = T * (d.w === undefined ? 3 : d.w);
      e.dh = T * 0.7;
      e.w = 0; e.h = 0;
      e.rest = { x: e.x, y: e.y };
      e.life = d.life === undefined ? 5 : d.life;
      e.ink = 0;
      e.word = d.word || 'stand';
    },
    update: function (e, dt) {
      e.ink = Math.min(1, e.ink + dt * 3.4);
      e.life -= dt;
      if (e.ink > 0.55) { e.w = e.dw; e.h = e.dh; }
      e.x = e.rest.x; e.y = e.rest.y;
      if (e.life <= 0) {
        e.w = 0; e.h = 0;
        if (e.life < -0.6) RT.remove(e);
      }
    },
    draw: function (e, g) {
      var x = e.rest.x, y = e.rest.y, w = e.dw * clamp(e.ink, 0, 1), hh = e.dh;
      var fade = e.life < 0.6 ? clamp(e.life / 0.6, 0, 1) : 1;
      g.globalAlpha = fade;
      rr(g, x, y, w, hh, 3, '#1a1626');
      rr(g, x, y, w, hh * 0.45, 3, '#3a3450');
      g.globalAlpha = 0.8 * fade;
      txt(g, e.word, x + e.dw / 2, y - 10, 10, '#cfd6e8', { alpha: 0.7 * fade });
      g.globalAlpha = 1;
    }
  });

  def('lGauthor', {
    layer: 'main',
    init: function (e) {
      e.w = T * 3; e.h = T * 3;
      bossInit(e, {
        key: 'author', name: 'THE AUTHOR', sub: 'it wrote all of this',
        col: '#dfe7ff', col2: '#ff3ea5', hp: 5, perPhase: 1, wake: AX.x0,
        lines: ['a second draft', 'a third', 'a fourth', 'the last one'],
        hitLines: ['that was written down', 'you read the beat',
                   'i shortened the window', 'this is the last draft', ''],
        onDead: function () { authorDone(); }
      });
      e.hx = (AX.x0 + 30) * T;
      e.hy = (AX.floor - 7) * T;
      e.beat = 0; e.beats = 0; e.pad = null;
      e.windowT = 0;
      e.awake = 1;
      bossState(e, 'intro');
      RT.cam.shake(8, 0.8);
    },
    update: function (e, dt) {
      if (e.gone) return;
      e.stT += dt;
      if (e.invuln > 0) e.invuln -= dt;
      if (e.flash > 0) e.flash -= dt;
      e.x = e.hx - e.w / 2; e.y = e.hy - e.h / 2;
      e.core.x = e.hx; e.core.y = e.hy + T * 0.9;
      e.core.r = e.open ? 24 : 15;

      if (e.dying) { bossDeathTick(e, dt); return; }

      switch (e.st) {
        case 'intro':
          e.hy = approach(e.hy, (AX.floor - 7) * T, 120 * dt);
          if (e.stT > 2) {
            bossState(e, 'attack');
            RT.speech(e.hx, e.hy - 50, 'you were not supposed to get here. i will fix it.', 3);
          }
          break;
        case 'attack': auAttack(e, dt); break;
        case 'count': auCount(e, dt); break;
        case 'window': auWindow(e, dt); break;
        case 'phase':
          if (e.stT > 1.2) bossState(e, 'attack');
          break;
        case 'recover':
          drift(e, dt);
          if (e.stT > 0.8) bossState(e, 'attack');
          break;
      }
      /* the pen itself is lethal, the pages are not */
      if (!e.open && hitP(e.hx - 22, e.hy - 22, 44, 44, 4)) kill('ink');
      coreStomp(e);
    },
    draw: function (e, g) { drawAuthor(e, g); },
    reset: function (e) { e.hp = e.maxHp; }
  });

  function drift(e, dt) {
    var want = alive() ? clamp(pcx(), AU.L + T * 4, AU.R - T * 4) : e.hx;
    e.hx = approach(e.hx, want, 140 * dt);
    e.hy = approach(e.hy, (AX.floor - 7) * T + Math.sin(e.at * 1.6) * 14, 100 * dt);
  }

  function auAttack(e, dt) {
    drift(e, dt);
    if (!e.shots) {
      e.shots = 1;
      var pick = nextPattern(e, ['grid', 'rain', 'flip', 'type']);
      e.atkKind = pick;
      var px = alive() ? pcx() : e.hx, i, a;
      sfx('charge');
      if (pick === 'grid') {
        RT.toast('THE GRID', 1);
        for (i = 0; i < 3; i++) {
          RT.spawn({
            px: true, type: 'lGflame', kind: 'sweep',
            x: i % 2 ? AU.R : AU.L - T * 2, y: AU.FLOOR - T * (2.2 + i * 2.6),
            w: T * 2, h: T * 1.1, life: 3.4, vx: (i % 2 ? -1 : 1) * T * 7.2,
            col: '#9ad4ff', col2: '#ffffff', warmup: 0.2
          });
        }
      } else if (pick === 'rain') {
        RT.toast('THE RAIN - one column is dry', 1.2);
        var safe = Math.floor(lrand() * 9);
        for (i = 0; i < 9; i++) {
          if (i === safe) continue;
          RT.spawn({
            px: true, type: 'lGmark',
            x: AU.L + T * 2 + i * ((AU.R - AU.L - T * 4) / 9), y: AU.FLOOR,
            w: T * 1.6, delay: 1, kind: 'missile', from: 12, col: '#dfe7ff'
          });
        }
      } else if (pick === 'flip') {
        S.flipT = 3.2;
        sfx('portal');
        RT.flash('rgba(200,210,255,0.35)', 0.18);
        RT.toast('UP IS A DECISION', 1.4);
        for (i = 0; i < 5; i++) {
          shot(AU.L + T * 3 + i * T * 5, AU.FLOOR - T * 6, 0, -150,
               { kind: 'note', col: '#ff3ea5', col2: '#dfe7ff', grav: 0, life: 3.4, r: 9 });
        }
      } else {
        RT.toast('THE TYPEWRITER', 1);
        for (i = 0; i < 7; i++) {
          a = AU.L + T * 2 + lrand() * (AU.R - AU.L - T * 4);
          shot(a, (AX.top - 1) * T, 0, 120 + lrand() * 90,
               { kind: 'note', col: '#dfe7ff', col2: '#ff3ea5', grav: 260, life: 5, r: 8 });
        }
      }
    }
    if (e.stT > (e.phase >= 4 ? 2.4 : 3)) {
      e.shots = 0;
      bossState(e, 'count');
    }
  }

  /* four beats, then a third of a second */
  function auCount(e, dt) {
    if (!e.shots) {
      e.shots = 1;
      e.beats = 0; e.beat = 0;
      /* it writes you a pad, always three tiles, always reachable */
      var px = alive() ? clamp(pcx(), AU.L + T * 4, AU.R - T * 6) : e.hx;
      var padX = Math.round(px / T) * T;
      e.padX = clamp(padX, AU.L + T * 3, AU.R - T * 6);
      e.pad = RT.spawn({
        px: true, type: 'lGwrit', x: e.padX, y: AU.FLOOR - T * 3.2,
        w: 3, h: 1, life: 6.5, word: 'jump on four'
      });
      e.hx = e.padX + T * 1.5;
      e.hy = AU.FLOOR - T * 7.1;                  /* core sits 3.2 above pad */
      sfx('tick');
    }
    e.hx = approach(e.hx, e.padX + T * 1.5, 220 * dt);
    e.hy = approach(e.hy, AU.FLOOR - T * 7.1, 200 * dt);
    var period = e.phase >= 4 ? 0.46 : 0.56;
    e.beat += dt;
    if (e.beat >= period) {
      e.beat -= period;
      e.beats++;
      sfx(e.beats >= 4 ? 'checkpoint' : 'tick');
      ringFx(e.core.x, e.core.y, e.beats >= 4 ? '#ffd23f' : '#dfe7ff', 30 + e.beats * 6, 3, 0.25);
      if (e.beats >= 4) {
        bossState(e, 'window');
        e.open = 1;
        e.windowT = [0.62, 0.55, 0.48, 0.4, 0.34][clamp(e.phase - 1, 0, 4)];
        sfx('powerup');
      }
    }
  }

  function auWindow(e, dt) {
    e.windowT -= dt;
    if (e.windowT <= 0) {
      e.open = 0;
      bossState(e, 'recover');
      sfx('fake');
      RT.speech(e.hx, e.hy - 40, 'too slow. i will write it again.', 1.6);
      if (e.pad) { e.pad.life = Math.min(e.pad.life, 0.4); e.pad = null; }
    }
  }

  function authorDone() {
    L.done.author = 1;
    RT.banner(['THE AUTHOR IS DOWN', 'four of four'], 2.4);
    RT.toast('one thing left. it is a booth. it sells tickets.', 3.2);
    L.ticketPending = 1;
  }

  function drawAuthor(e, g) {
    if (e.gone) return;
    var x = e.hx, y = e.hy, t = e.at;
    var dying = e.dying ? clamp(1 - e.stT / 3.4, 0, 1) : 1;
    g.globalAlpha = dying;
    /* floating pages */
    var i, a, px, py;
    for (i = 0; i < 7; i++) {
      a = t * 0.8 + i * 0.9;
      px = x + Math.cos(a) * (70 + i * 7);
      py = y + Math.sin(a * 1.3) * (34 + i * 3);
      g.save();
      g.translate(px, py);
      g.rotate(Math.sin(a * 2) * 0.5);
      g.globalAlpha = 0.5 * dying;
      rr(g, -9, -12, 18, 24, 2, '#dfe7ff');
      g.globalAlpha = 0.28 * dying;
      g.fillStyle = '#6a7290';
      for (var l = 0; l < 4; l++) g.fillRect(-6, -8 + l * 5, 12, 1.4);
      g.restore();
    }
    g.globalAlpha = dying;
    /* the hand: a nib, an inkwell shadow, a wrist of ink */
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(t * 1.4) * 0.12 - 0.5);
    poly(g, [0, 44, -13, -6, 0, -22, 13, -6], '#2a2740');
    poly(g, [0, 44, -5, 4, 0, -4, 5, 4], '#dfe7ff');
    poly(g, [-13, -6, 0, -22, 13, -6, 0, -2], '#4a4670');
    circ(g, 0, -26, 8, '#ff3ea5');
    g.restore();
    /* the core: the ink drop at the nib */
    if (e.open) {
      g.globalAlpha = (0.35 + 0.35 * Math.sin(t * 26)) * dying;
      circ(g, e.core.x, e.core.y, 40, '#ffd23f');
      g.globalAlpha = dying;
      circ(g, e.core.x, e.core.y, 20, '#ffe9a8');
      circ(g, e.core.x, e.core.y, 11, '#ffffff');
      circS(g, e.core.x, e.core.y, 28, '#ffd23f', 3);
      txt(g, 'NOW', e.core.x, e.core.y - 40, 13, '#ffd23f');
    } else {
      circ(g, e.core.x, e.core.y, 9, e.flash > 0 ? '#ffffff' : '#ff3ea5');
      g.globalAlpha = 0.4 * dying;
      circS(g, e.core.x, e.core.y, 16 + Math.sin(t * 5) * 2, '#ff3ea5', 2);
      g.globalAlpha = dying;
    }
    /* the count-in, drawn as four bars */
    if (e.st === 'count') {
      for (i = 0; i < 4; i++) {
        var bx = e.core.x - 34 + i * 22;
        rr(g, bx, e.core.y + 44, 16, 6, 3, i < e.beats ? '#ffd23f' : 'rgba(255,255,255,0.18)');
      }
      txt(g, 'JUMP ON FOUR', e.core.x, e.core.y + 66, 11, '#ffd23f', { alpha: 0.9 });
    }
    g.globalAlpha = 1;
  }

  /* ==================================================================== */
  /* X-c. THE TICKET BOOTH                                                */
  /* -------------------------------------------------------------------- */
  /* One thousand points. The tickets fall fast and they are worth         */
  /* different amounts. At the end a bomb comes down: click it and the     */
  /* whole of trial 12 starts again from the launch pad. Click every       */
  /* single ticket and skip the bomb and you have won outright. Miss even  */
  /* one ticket and there is a formality waiting for you.                  */
  /* ==================================================================== */
  var TICKET_VALUES = [25, 25, 50, 50, 50, 75, 75, 75, 100, 100, 25, 50, 75, 100,
                       150, 25, 50, 75, 100, 150, 25, 50, 75, 100, 150, 200];

  function startTickets() {
    if (L.ticketRun) return;
    L.ticketRun = 1;
    L.ticketPending = 0;
    if (RT.Audio && RT.Audio.music) RT.Audio.music('tycoon');
    var st = {
      t: 0, score: 0, spawned: 0, missed: 0, taken: 0,
      list: [], bomb: null, phase: 'run', gap: 0.62, next: 0.7,
      endT: 0, attempts: (L.ticketTries || 0) + 1, pops: []
    };
    L.ticketTries = st.attempts;
    L.booth = st;                 /* exposed for tests, like window.__L10 */

    function hit(px, py, w, h) {
      var i, k;
      for (i = st.list.length - 1; i >= 0; i--) {
        k = st.list[i];
        if (k.taken) continue;
        var kx = k.x * w, ky = k.y * h;
        if (px > kx - k.w / 2 - 10 && px < kx + k.w / 2 + 10 &&
            py > ky - k.h / 2 - 10 && py < ky + k.h / 2 + 10) {
          k.taken = 1;
          st.taken++;
          st.score += k.val;
          sfx('coin'); sfx('cash');
          st.pops.push({ x: kx, y: ky, v: k.val, t: 0 });
          return true;
        }
      }
      if (st.bomb && !st.bomb.gone) {
        var bx = st.bomb.x * w, by = st.bomb.y * h;
        if (Math.hypot ? Math.hypot(px - bx, py - by) < st.bomb.r + 14
                       : Math.sqrt((px - bx) * (px - bx) + (py - by) * (py - by)) < st.bomb.r + 14) {
          st.bomb.hit = 1;
          st.phase = 'boom';
          st.endT = 0;
          sfx('death'); sfx('troll');
          RT.cam.shake(14, 1);
          return true;
        }
      }
      return false;
    }

    RT.setMode({
      update: function (dt) {
        st.t += dt;
        var i, k;
        for (i = 0; i < st.pops.length; i++) st.pops[i].t += dt;
        while (st.pops.length && st.pops[0].t > 1) st.pops.shift();

        if (st.phase === 'boom') {
          st.endT += dt;
          if (st.endT > 1.8) {
            RT.clearMode();
            sfx('death');
            RT.restartLevel();
          }
          return;
        }

        /* fall */
        for (i = 0; i < st.list.length; i++) {
          k = st.list[i];
          if (k.taken) continue;
          k.y += k.vy * dt;
          k.x += Math.sin(st.t * k.wob + k.ph) * 0.035 * dt;
          if (k.y > 1.12) { k.taken = 2; st.missed++; sfx('bonk'); }
        }
        if (st.bomb && !st.bomb.gone && !st.bomb.hit) {
          st.bomb.y += st.bomb.vy * dt;
          if (st.bomb.y > 1.15) st.bomb.gone = 1;
        }

        if (st.phase === 'run') {
          st.next -= dt;
          if (st.next <= 0 && st.spawned < TICKET_VALUES.length) {
            st.next = st.gap;
            st.gap = Math.max(0.24, st.gap - 0.014);
            var val = TICKET_VALUES[st.spawned];
            st.list.push({
              x: 0.1 + Math.random() * 0.8, y: -0.08, val: val,
              vy: 0.46 + Math.random() * 0.2 + st.spawned * 0.012,
              w: 74, h: 42, ph: Math.random() * 6.28, wob: 2 + Math.random() * 3, taken: 0
            });
            st.spawned++;
          }
          var live = 0;
          for (i = 0; i < st.list.length; i++) if (!st.list[i].taken) live++;
          if (st.spawned >= TICKET_VALUES.length && live === 0) {
            st.phase = 'bomb';
            st.bomb = { x: 0.5, y: -0.12, vy: 0.2, r: 44, hit: 0, gone: 0 };
            sfx('charge');
            RT.cam.shake(6, 0.6);
          }
        } else if (st.phase === 'bomb') {
          if (st.bomb.gone) {
            st.phase = 'done';
            st.endT = 0;
          }
        } else if (st.phase === 'done') {
          st.endT += dt;
          if (st.endT > 1.6) {
            RT.clearMode();
            endTickets(st.score, st.missed);
          }
        }
      },
      onPointer: function (type, p) {
        if (type !== 'down') return;
        hit(p.x, p.y, modeW, modeH);
      },
      onKey: function () { },
      draw: function (g, w, h) {
        modeW = w; modeH = h;
        var i, k;
        /* the booth */
        var lg = g.createLinearGradient(0, 0, 0, h);
        lg.addColorStop(0, '#120a20');
        lg.addColorStop(0.5, '#25123a');
        lg.addColorStop(1, '#3a1030');
        g.fillStyle = lg;
        g.fillRect(0, 0, w, h);
        /* awning stripes */
        var sw = w / 12;
        for (i = 0; i < 13; i++) {
          g.fillStyle = i % 2 ? '#ff3ea5' : '#ffe9a8';
          g.beginPath();
          g.moveTo(i * sw, 0); g.lineTo((i + 1) * sw, 0);
          g.lineTo((i + 1) * sw - sw * 0.2, h * 0.075); g.lineTo(i * sw + sw * 0.2, h * 0.075);
          g.closePath(); g.fill();
        }
        /* bulbs */
        for (i = 0; i <= 12; i++) {
          var on = (Math.floor(st.t * 4) + i) % 3 !== 0;
          circ(g, i * sw, h * 0.083, 5, on ? '#ffe9a8' : '#6a5a3a');
        }
        /* light shafts */
        g.globalAlpha = 0.07;
        for (i = 0; i < 5; i++) {
          poly(g, [w * (0.1 + i * 0.2), h * 0.08, w * (0.02 + i * 0.2), h, w * (0.26 + i * 0.2), h], '#ffe9a8');
        }
        g.globalAlpha = 1;

        /* tickets */
        for (i = 0; i < st.list.length; i++) {
          k = st.list[i];
          if (k.taken) continue;
          var kx = k.x * w, ky = k.y * h;
          g.save();
          g.translate(kx, ky);
          g.rotate(Math.sin(st.t * k.wob + k.ph) * 0.25);
          g.globalAlpha = 0.35;
          rr(g, -k.w / 2 + 3, -k.h / 2 + 4, k.w, k.h, 6, '#000000');
          g.globalAlpha = 1;
          var col = k.val >= 150 ? '#ff3ea5' : k.val >= 100 ? '#ffd23f' : k.val >= 75 ? '#8dff9a' : '#9ad4ff';
          rr(g, -k.w / 2, -k.h / 2, k.w, k.h, 6, col);
          rr(g, -k.w / 2 + 4, -k.h / 2 + 4, k.w - 8, k.h - 8, 4, 'rgba(255,255,255,0.22)');
          /* the perforated edge */
          for (var d = 0; d < 5; d++) circ(g, -k.w / 2, -k.h / 2 + 8 + d * 7, 3, '#25123a');
          txt(g, String(k.val), 4, 1, 20, '#1a0a1a', { stroke: 'rgba(255,255,255,0.55)', strokeWidth: 3 });
          g.restore();
        }
        /* the pops */
        for (i = 0; i < st.pops.length; i++) {
          var pp = st.pops[i];
          g.globalAlpha = clamp(1 - pp.t, 0, 1);
          txt(g, '+' + pp.v, pp.x, pp.y - pp.t * 40, 22, '#ffe9a8');
          g.globalAlpha = 1;
        }
        /* the bomb */
        if (st.bomb && !st.bomb.gone) {
          var bx = st.bomb.x * w, by = st.bomb.y * h, r = st.bomb.r;
          g.save();
          g.translate(bx, by);
          g.rotate(Math.sin(st.t * 3) * 0.2);
          circ(g, 0, 0, r, '#14121c');
          circ(g, -r * 0.3, -r * 0.3, r * 0.3, '#3a3850');
          rr(g, -8, -r - 10, 16, 14, 4, '#6a5a3a');
          /* fuse */
          g.strokeStyle = '#c9a06a'; g.lineWidth = 4;
          g.beginPath();
          g.moveTo(0, -r - 8);
          g.quadraticCurveTo(18, -r - 26, 6, -r - 40);
          g.stroke();
          var fx = 6 + Math.sin(st.t * 30) * 4, fy = -r - 42;
          circ(g, fx, fy, 7 + Math.sin(st.t * 40) * 3, '#ffd23f');
          circ(g, fx, fy, 3.5, '#ffffff');
          g.restore();
          txt(g, 'DO NOT CLICK THE BOMB', bx, by + r + 26, Math.min(w * 0.035, 18), '#ff5b5b',
              { alpha: 0.7 + 0.3 * Math.sin(st.t * 9) });
          txt(g, 'it restarts trial twelve. all of it.', bx, by + r + 48, Math.min(w * 0.026, 13), '#ffb0b0', { alpha: 0.8 });
        }
        /* the counter */
        var pad = Math.min(w * 0.06, 34);
        var barW = w - pad * 2, barH = 20, barY = h - pad - barH;
        rr(g, pad, barY, barW, barH, 10, 'rgba(0,0,0,0.5)');
        var k2 = clamp(st.score / 1000, 0, 1);
        rr(g, pad + 2, barY + 2, (barW - 4) * k2, barH - 4, 8, k2 >= 1 ? '#8dff9a' : '#ffd23f');
        txt(g, st.score + ' / 1000', w / 2, barY + barH / 2, 14, '#1a1020',
            { stroke: 'rgba(255,255,255,0.5)', strokeWidth: 3 });
        txt(g, 'TICKETS ' + st.taken + '/' + TICKET_VALUES.length +
               (st.missed ? '   MISSED ' + st.missed : '   PERFECT SO FAR'),
            w / 2, barY - 16, Math.min(w * 0.03, 15), st.missed ? '#ff9ad4' : '#8dff9a');
        txt(g, 'THE TICKET BOOTH', w / 2, h * 0.14, Math.min(w * 0.055, 30), '#ffe9a8');
        txt(g, 'click every ticket. one thousand points. do not click the bomb.',
            w / 2, h * 0.19, Math.min(w * 0.026, 14), '#dff6ff', { alpha: 0.8 });
        if (st.phase === 'boom') {
          g.globalAlpha = clamp(st.endT * 1.6, 0, 1);
          g.fillStyle = '#ff3ea5';
          g.fillRect(0, 0, w, h);
          g.globalAlpha = 1;
          txt(g, 'YOU CLICKED THE BOMB', w / 2, h * 0.45, Math.min(w * 0.08, 46), '#ffffff');
          txt(g, 'trial twelve, from the launch pad', w / 2, h * 0.53, Math.min(w * 0.03, 16), '#ffe9a8');
        }
        if (st.phase === 'done') {
          txt(g, st.score >= 1000 ? (st.missed === 0 ? 'PERFECT RUN' : 'ONE THOUSAND') : 'NOT ENOUGH',
              w / 2, h * 0.45, Math.min(w * 0.07, 42), st.score >= 1000 ? '#8dff9a' : '#ff9ad4');
        }
      }
    });
    RT.toast('attempt ' + st.attempts + '. the bomb comes at the end. it always comes.', 3);
  }
  var modeW = 800, modeH = 600;

  function endTickets(score, missed) {
    if (score < 1000) {
      L.ticketRun = 0;
      RT.banner(['NOT ENOUGH', 'the booth does not close'], 2);
      RT.toast('under a thousand. the tickets come again.', 2.6);
      L.ticketPending = 1;
      return;
    }
    L.done.tickets = 1;
    if (missed === 0) {
      L.ticketPerfect = 1;
      RT.banner(['EVERY TICKET', 'you actually did that'], 2.6);
      sfx('win');
      RT.flash('#ffffff', 0.4);
      var p = P();
      p.x = 352 * T; p.y = (AS.row - 2) * T; p.vx = 0; p.vy = 0;
      RT.cam.x = p.x; RT.cam.y = p.y;
      RT.winLevel();
      return;
    }
    /* the formality */
    L.spikeOn = 1;
    var p2 = P();
    p2.x = 332 * T; p2.y = (AS.row - 2) * T; p2.vx = 0; p2.vy = 0;
    p2.dead = false;
    RT.cam.x = p2.x; RT.cam.y = p2.y;
    if (RT.Audio && RT.Audio.music) RT.Audio.music('apocalypse');
    RT.flash('#ffffff', 0.35);
    RT.banner(['ONE THOUSAND', 'you missed ' + missed + '. so: the last one.'], 3);
    RT.toast('THE FINAL TRIAL OF TRIAL TWELVE: one spike.', 4);
  }

  /* ==================================================================== */
  /* THE ONE SPIKE - dressed as the hardest thing in the game             */
  /* ==================================================================== */
  def('lGspikedrama', {
    layer: 'front',
    init: function (e) { e.w = 0; e.h = 0; e.said = 0; },
    update: function (e, dt) {
      if (!L.spikeOn || !alive()) return;
      if (!e.said && ptx() > 334) {
        e.said = 1;
        sfx('charge');
        RT.cam.shake(6, 0.8);
      }
    },
    draw: function (e, g) {
      if (!L.spikeOn) return;
      var t = e.at, y = (AS.row - 1) * T;
      /* stage lighting on one (1) spike */
      g.globalAlpha = 0.12 + 0.05 * Math.sin(t * 2);
      poly(g, [340.5 * T, y - 300, 336 * T, y + 20, 345 * T, y + 20], '#ff3ea5');
      g.globalAlpha = 1;
      txt(g, 'FINAL BOSS', 340.5 * T, y - 150, 30, '#ff3ea5', { alpha: 0.85 });
      txt(g, 'ONE (1) SPIKE', 340.5 * T, y - 118, 20, '#ffd23f', { alpha: 0.9 });
      txt(g, 'difficulty: extreme', 340.5 * T, y - 96, 11, '#dfe7ff', { alpha: 0.6 });
      txt(g, 'estimated attempts: 400', 340.5 * T, y - 82, 11, '#dfe7ff', { alpha: 0.45 });
      txt(g, 'actual difficulty: it is one spike', 340.5 * T, y - 62, 9, '#8dff9a', { alpha: 0.4 });
      /* a small crowd of skulls, watching */
      var i;
      for (i = 0; i < 7; i++) {
        var sx = (333 + i * 1.2) * T, sy = y + 34 + Math.sin(t * 2 + i) * 2;
        g.globalAlpha = 0.35;
        circ(g, sx, sy, 6, '#dfe7ff');
        circ(g, sx - 2, sy - 1, 1.6, '#120a14');
        circ(g, sx + 2, sy - 1, 1.6, '#120a14');
        g.globalAlpha = 1;
      }
      txt(g, 'THE DOOR', 350 * T, (AS.row - 3) * T, 12, '#8dff9a', { alpha: 0.8 });
    }
  });

  /* ==================================================================== */
  /* TILE BOOKKEEPING                                                     */
  /* ==================================================================== */
  function carve(tx, ty, ch) { RT.setTile(tx, ty, ch); }

  /* ==================================================================== */
  /* THEMES - one per act, all hand-mixed                                 */
  /* ==================================================================== */
  var SPACEPORT = {
    __ready: true,   /* resolveTheme returns a fresh object otherwise, and the
                      * zone blend never settles - see the amendment */
    sky: [[0, '#070b1c'], [0.28, '#132146'], [0.58, '#3b3a72'], [0.82, '#a8577a'], [1, '#ffb27a']],
    parallax: [
      { kind: 'stars', color: '#ffffff', y: 0.34, speed: 0.015, scale: 1, alpha: 0.75 },
      { kind: 'mountains', color: '#131a34', color2: '#1d2749', y: 0.84, speed: 0.1, scale: 0.4 },
      { kind: 'city', color: '#0e1730', color2: '#18203f', y: 0.95, speed: 0.2, scale: 0.44 },
      { kind: 'factory', color: '#1a2140', color2: '#0d1226', y: 1.06, speed: 0.44, scale: 0.3 }
    ],
    ambient: 'dust',
    fog: { color: '#6a7cae', alpha: 0.13 },
    tile: { top: '#9fb0d8', side: '#4a5680', dark: '#232a44', rim: '#e6efff', accent: '#ffd23f' },
    spike: { base: '#dfe7ff', tip: '#ff6b5b' },
    vignette: 0.26
  };
  var WARHEAD = {
    __ready: true,   /* resolveTheme returns a fresh object otherwise, and the
                      * zone blend never settles - see the amendment */
    sky: [[0, '#170610'], [0.3, '#3d0c1c'], [0.62, '#7d2418'], [0.86, '#c95a1e'], [1, '#ffb45c']],
    parallax: [
      { kind: 'nebula', color: '#7a1a20', color2: '#1a0608', y: 1, speed: 0.03, scale: 1, alpha: 0.5 },
      { kind: 'factory', color: '#2a1414', color2: '#170b0c', y: 0.92, speed: 0.16, scale: 0.46 },
      { kind: 'pipes', color: '#33191a', color2: '#1c0d0e', y: 1.08, speed: 0.46, scale: 0.28 }
    ],
    ambient: 'embers',
    fog: { color: '#ff8a5a', alpha: 0.12 },
    tile: { top: '#c8a184', side: '#6d4a3c', dark: '#3a2420', rim: '#ffe6d0', accent: '#ff5b5b' },
    spike: { base: '#ffe0c8', tip: '#ff3a2a' },
    vignette: 0.3
  };
  var MAGMA = {
    __ready: true,   /* resolveTheme returns a fresh object otherwise, and the
                      * zone blend never settles - see the amendment */
    sky: [[0, '#0a0507'], [0.4, '#1c0a08'], [0.75, '#3d1006'], [1, '#7a1e06']],
    parallax: [
      { kind: 'volcano', color: '#2a0f0a', color2: '#150605', y: 1, speed: 0.08, scale: 0.6 },
      { kind: 'ruins', color: '#241110', color2: '#120708', y: 0.94, speed: 0.22, scale: 0.4 }
    ],
    ambient: 'embers',
    fog: { color: '#ff6a2a', alpha: 0.16 },
    tile: { top: '#8a5a48', side: '#4a2a22', dark: '#25120f', rim: '#ffd0a8', accent: '#ff7a3a' },
    spike: { base: '#ffd7bc', tip: '#ff3a1a' },
    vignette: 0.36
  };
  var TEMPEST = {
    __ready: true,   /* resolveTheme returns a fresh object otherwise, and the
                      * zone blend never settles - see the amendment */
    sky: [[0, '#050a18'], [0.35, '#0e1c3a'], [0.7, '#22406e'], [1, '#4d6f9e']],
    parallax: [
      { kind: 'clouds', color: '#1b2c4c', color2: '#0d1628', y: 0.5, speed: 0.06, scale: 0.9, alpha: 0.8 },
      { kind: 'mountains', color: '#101c33', color2: '#16263f', y: 0.9, speed: 0.14, scale: 0.4 },
      { kind: 'clouds', color: '#2a3f66', color2: '#16243d', y: 1.1, speed: 0.5, scale: 0.6, alpha: 0.5 }
    ],
    ambient: 'snow',
    fog: { color: '#31507e', alpha: 0.2 },
    tile: { top: '#9ab6d8', side: '#42597e', dark: '#202f46', rim: '#e4f1ff', accent: '#3df0ff' },
    spike: { base: '#dff6ff', tip: '#ff6b8b' },
    vignette: 0.3
  };
  var BAZAAR = {
    __ready: true,   /* resolveTheme returns a fresh object otherwise, and the
                      * zone blend never settles - see the amendment */
    sky: [[0, '#140f24'], [0.32, '#2c1b3c'], [0.66, '#6a3450'], [0.88, '#c2703f'], [1, '#ffcf8a']],
    parallax: [
      { kind: 'stars', color: '#ffffff', y: 0.3, speed: 0.012, scale: 1, alpha: 0.4 },
      { kind: 'city', color: '#1c1330', color2: '#271a40', y: 0.88, speed: 0.15, scale: 0.46 },
      { kind: 'ruins', color: '#2a1c3a', color2: '#170f26', y: 1.04, speed: 0.36, scale: 0.34 }
    ],
    ambient: 'fireflies',
    fog: { color: '#c08a6a', alpha: 0.1 },
    tile: { top: '#d8b06a', side: '#7a5a34', dark: '#3d2c1c', rim: '#fff0cc', accent: '#ffd23f' },
    spike: { base: '#ffe9c8', tip: '#ff8a3a' },
    vignette: 0.24
  };
  var CIRCUS = {
    __ready: true,   /* resolveTheme returns a fresh object otherwise, and the
                      * zone blend never settles - see the amendment */
    sky: [[0, '#0c0416'], [0.34, '#22083a'], [0.68, '#4a0f4e'], [1, '#7a1650']],
    parallax: [
      { kind: 'nebula', color: '#6a1060', color2: '#160420', y: 1, speed: 0.03, scale: 1, alpha: 0.5 },
      { kind: 'castle', color: '#250a32', color2: '#140420', y: 0.9, speed: 0.17, scale: 0.5 },
      { kind: 'hills', color: '#2e0c3a', color2: '#180424', y: 1.12, speed: 0.5, scale: 0.24 }
    ],
    ambient: 'ash',
    fog: { color: '#ff3ea5', alpha: 0.09 },
    tile: { top: '#a184c8', side: '#503868', dark: '#28183a', rim: '#f0e0ff', accent: '#ff3ea5' },
    spike: { base: '#f4e6ff', tip: '#ff3ea5' },
    vignette: 0.32
  };

  /* ==================================================================== */
  /* THE LEVEL                                                            */
  /* ==================================================================== */
  RT.registerLevel(12, {
    name: 'THE GAUNTLET',
    subtitle: 'Four bosses, one checkpoint, two lies',
    theme: SPACEPORT,
    themeZones: [
      { x0: 0, x1: 72, theme: SPACEPORT },
      { x0: 73, x1: 105, theme: WARHEAD },
      { x0: 106, x1: 135, theme: MAGMA },
      { x0: 136, x1: 177, theme: TEMPEST },
      { x0: 178, x1: 252, theme: BAZAAR },
      { x0: 253, x1: 400, theme: CIRCUS }
    ],
    music: 'volcano',
    tiles: TILES,

    intro: [
      'TRIAL 12 - THE GAUNTLET',
      'Four bosses. One checkpoint. Two lies.',
      'Trial 11 was the longest. This one is the last.'
    ],

    entities: [
      /* ===================== I. THE LAUNCH =========================== */
      { type: 'text', x: 2, y: 38, w: 10, text: 'I. THE LAUNCH', size: 0.62, color: '#ffe9a8', alpha: 0.35 },
      { type: 'sign', x: 4, y: 45, w: 12, range: 2.8,
        text: 'Three sleds over a hole in the world. Stand on one and it lights itself. The fire behind you is slower than they are - that is the entire promise.' },
      { type: 'deco', kind: 'girder', x: 0.3, y: 44 },
      { type: 'deco', kind: 'lamp', x: 8.4, y: 44.2 },
      { type: 'deco', kind: 'pipe', x: 10.6, y: 44 },
      { type: 'sign', x: 10, y: 45, w: 11, range: 2.2,
        text: 'Hoops do not want you jumping. Debris does. Read which one you are in.' },
      { type: 'lGsled', x: 15, y: 46, idx: 1, to: 28.5, speed: 7.2 },
      { type: 'lGsled', x: 33.5, y: 44, idx: 2, to: 45, speed: 8 },
      { type: 'lGsled', x: 50, y: 42.5, idx: 3, to: 63.5, speed: 8.6, last: true },
      { type: 'lGring', x: 20, y: 45 },
      { type: 'lGring', x: 25, y: 45 },
      { type: 'lGfront', x: 8, y: 34, stop: 66, speed: 2.7 },
      { type: 'lGrival', x: 6, y: 36 },
      { type: 'deco', kind: 'flag', x: 70, y: 42 },

      /* ===================== II. VULCAN-9 ============================ */
      { type: 'text', x: 75, y: 31, w: 10, text: 'II. VULCAN-9', size: 0.62, color: '#ff8a8a', alpha: 0.4 },
      { type: 'sign', x: 77, y: 45, w: 12, range: 2.6,
        text: 'It only opens when it hits a wall, and it only hits a wall when it charges you. Stand where the wall is.' },
      { type: 'lGvulcan', x: 89, y: 34 },
      { type: 'deco', kind: 'skull', x: 82, y: 45.2 },
      { type: 'deco', kind: 'girder', x: 101, y: 45 },

      /* ===================== III. THE MELT =========================== */
      { type: 'text', x: 108, y: 42, w: 10, text: 'III. THE MELT', size: 0.56, color: '#ffb03a', alpha: 0.4 },
      { type: 'sign', x: 108, y: 46, w: 12, range: 2.6,
        text: 'Thirteen ledges, four of them crumble, three springs, and the floor is following you up.' },
      { type: 'lGlava', x: 107, y: 48 },
      { type: 'lGvent', x: 106, y: 39, dir: 'right', every: 3.2, on: 1.1, phase: 0, reach: 5 },
      { type: 'lGvent', x: 134, y: 30, dir: 'left', every: 3.4, on: 1.2, phase: 1.3, reach: 5 },
      { type: 'lGvent', x: 106, y: 21, dir: 'right', every: 3, on: 1, phase: 0.7, reach: 5 },
      { type: 'lGvent', x: 134, y: 12, dir: 'left', every: 3.3, on: 1.1, phase: 2, reach: 5 },
      { type: 'deco', kind: 'crystal', x: 124, y: 43 },
      { type: 'deco', kind: 'torch', x: 107, y: 34 },
      { type: 'deco', kind: 'torch', x: 133, y: 25 },

      /* ===================== IV. GALE PRIME ========================== */
      { type: 'text', x: 138, y: 4, w: 12, text: 'IV. GALE PRIME', size: 0.62, color: '#9ad4ff', alpha: 0.4 },
      { type: 'sign', x: 139, y: 11, w: 12, range: 2.8,
        text: 'It is fire, then water, then fire. Water leaves puddles. Fire boils them. Boiling one WITH IT STANDING IN IT is the only thing that ever opens the eye.' },
      { type: 'lGgale', x: 156, y: 6 },
      { type: 'lGpool', x: 142, y: 11.6, idx: 0 },
      { type: 'lGpool', x: 148, y: 11.6, idx: 1 },
      { type: 'lGpool', x: 155, y: 11.6, idx: 2 },
      { type: 'lGpool', x: 162, y: 11.6, idx: 3 },
      { type: 'lGpool', x: 170, y: 11.6, idx: 4 },
      { type: 'text', x: 171, y: 10, w: 6, text: 'the floor is thin at 172', size: 0.32, color: '#dff6ff', alpha: 0.5 },

      /* ===================== V. THE LONG COUNTER ===================== */
      { type: 'text', x: 180, y: 38, w: 12, text: 'V. THE LONG COUNTER', size: 0.6, color: '#ffd23f', alpha: 0.4 },
      { type: 'sign', x: 182, y: 43, w: 12, range: 2.6,
        text: 'Sixteen purchases. One costs 1. The last costs fifteen thousand. The lap pays more every time you finish it.' },
      { type: 'sign', x: 210, y: 43, w: 12, range: 2.4,
        text: 'The plate at the top of the rungs is the lap. Touch it, come home, touch it again.' },
      { type: 'deco', kind: 'lamp', x: 176, y: 42.2 },
      { type: 'deco', kind: 'lamp', x: 232, y: 42.2 },
      { type: 'deco', kind: 'flag', x: 247, y: 42 },
      { type: 'text', x: 244, y: 36, w: 8, text: 'THE GATE', size: 0.6, color: '#ffd23f', alpha: 0.55 },

      /* ===================== VI. THE LAST CHECKPOINT ================= */
      { type: 'lGshrine', x: 250, y: 39 },

      /* ===================== VII. THE TROLL ========================== */
      { type: 'text', x: 254, y: 40, w: 10, text: 'VII. THE TROLL', size: 0.6, color: '#ff3ea5', alpha: 0.45 },
      { type: 'sign', x: 254, y: 43, w: 12, range: 2.8,
        text: 'A hundred and nineteen tiles. Twenty-six tricks, each used exactly once, none of them repeated later. Nothing here is random and nothing here is fair.' },
      { type: 'sign', x: 261, y: 43, w: 11, range: 2.2,
        text: 'The floor is fine. Somebody checked the floor.' },
      { type: 'sign', x: 264, y: 43, w: 11, range: 2.4,
        text: 'FIVE TILE GAP AHEAD. You cannot jump five. Everybody knows you cannot jump five.' },
      { type: 'text', x: 266, y: 42.4, w: 6, text: '5 TILES', size: 0.46, color: '#ffd23f', alpha: 0.7 },
      { type: 'sign', x: 272, y: 43, w: 11, range: 2.4,
        text: 'Five steps up. Two of them are pictures of steps. The coin at the top is real, which is worse.' },
      { type: 'sign', x: 285, y: 43, w: 11, range: 2.4,
        text: 'A spring. A coin above the spring. There is no catch.' },
      { type: 'fallingceiling', x: 293, y: 38, w: 4, h: 1, triggerW: 14 },
      { type: 'trapspike', x: 299, y: 43, dir: 'up', trigger: 'near', near: 1.4, delay: 0.32, retract: 1.1 },
      { type: 'sign', x: 299, y: 43, w: 12, range: 2.6,
        text: 'You FALL into the next part, so you can never stand on its edge arguing with it. While you are down there, left is right.' },
      { type: 'trapspike', x: 307, y: 46, dir: 'up', trigger: 'near', near: 1.3, delay: 0.42, retract: 1.2 },
      { type: 'trapspike', x: 310, y: 46, dir: 'up', trigger: 'near', near: 1.3, delay: 0.3, retract: 1.2 },
      { type: 'lGfakecp', x: 316, y: 42 },
      { type: 'lGmimic', x: 318, y: 43 },
      { type: 'coin', x: 319.5, y: 43 },
      { type: 'sign', x: 314, y: 43, w: 11, range: 2.2,
        text: 'One of these two coins blinks. Coins do not blink.' },
      { type: 'sign', x: 319, y: 43, w: 11, range: 2.2,
        text: 'It leaves when you get close. So do not get close - jump from further back than feels sane.' },
      { type: 'lGrunaway', x: 322.5, y: 43.2, w: 3, slide: 2.6, real: true },
      { type: 'thwomp', x: 329, y: 39, h: 2, triggerW: 3, drop: 950, rest: 0.55, shake: 0.6 },
      { type: 'trapspike', x: 332, y: 43, dir: 'up', trigger: 'near', near: 1.3, delay: 0.28, retract: 1 },
      { type: 'sign', x: 326, y: 43, w: 11, range: 2.2,
        text: 'Thwomp, then two blocks that hold your weight exactly as long as you do not leave them.' },
      { type: 'lGghost', x: 334, y: 43.2, w: 2 },
      { type: 'lGghost', x: 336, y: 43.2, w: 2 },
      { type: 'fakegoal', x: 343, y: 38, back: 6 },
      { type: 'sign', x: 339, y: 43, w: 11, range: 2.4,
        text: 'A door. On a pedestal. At the end of a troll level. Obviously.' },
      { type: 'trapspike', x: 347, y: 43, dir: 'up', trigger: 'near', near: 1.3, delay: 0.3, retract: 1 },
      { type: 'laser', x: 355, y: 38, h: 6, on: 0.55, off: 2.6, phase: 0, dir: 'v' },
      { type: 'lGnudge', x: 352, y: 39, w: 6, h: 5, fx: -260 },
      { type: 'sign', x: 352, y: 43, w: 11, range: 2.2,
        text: 'Two lasers and a draught. The draught only blows at the top of a jump.' },
      { type: 'sign', x: 364, y: 43, w: 11, range: 2.4,
        text: 'The last five tiles push back. The door is further than it looks, and then there is a door.' },
      { type: 'conveyor', x: 366, y: 44, w: 5, speed: -3.4 },

      /* ===================== VIII. THE JESTER ======================== */
      { type: 'text', x: 376, y: 34, w: 10, text: 'VIII. THE JESTER', size: 0.6, color: '#ff3ea5', alpha: 0.45 },
      { type: 'lGjester', x: 386, y: 38 },

      /* ===================== IX + X ================================== */
      { type: 'lGonejump', x: 360, y: 20 },
      { type: 'lGrunaway', x: 373, y: 22, w: 4, slide: 2.6, real: false },
      { type: 'text', x: 361, y: 19, w: 8, text: 'IX. ONE JUMP', size: 0.5, color: '#ffe9a8', alpha: 0.4 },
      { type: 'lGspikedrama', x: 340, y: 12 }
    ],

    /* ------------------------------------------------------------ load */
    onLoad: function (RT) {
      resetState();
      RT.hud.set('act', 'I - THE LAUNCH');
      RT.toast('twelve. four bosses, one checkpoint, and a screen near the end that lies to you.', 4);
    },

    /* ----------------------------------------------------------- death */
    onDeath: function (RT, cause) {
      S = {};
      RT.player.controlsReversed = false;
      RT.player.gravityFlip = false;
      restoreFakeFloor();
      var tx = ptx(), ty = pty();
      if (tx > A3.x0 && tx < A3.x1 && ty > 2) L.meltDeaths = (L.meltDeaths || 0) + 1;
      if (L.raceOn && !L.raceWon) L.raceOn = 0;
      var pool;
      if (tx > A7.x0 || L.spikeOn || L.authorOn) {
        pool = ['back to the flag at 252. all of it. again.',
                'the only checkpoint in the second half is behind you and it stays there.',
                'that is the design. it was always the design.'];
      } else if (tx > A5.x0) {
        pool = ['the counter keeps your money. it keeps nothing else.'];
      } else if (tx > A4.x0) {
        pool = ['weather.', 'it was in its water phase. you were in its water.'];
      } else if (tx > A3.x0) {
        pool = ['it is still rising.', 'four of those ledges crumble. you found one.'];
      } else if (tx > A2.x0) {
        pool = ['it opens when it hits the wall. only then.'];
      } else {
        pool = ['the sleds wait. the fire does not.'];
      }
      RT.toast(pool[RT.deaths % pool.length], 2.2);
    },

    onCheckpoint: function (RT, cp) {
      if (!cp) return;
      if (cp.tx === CPT.x) {
        sfx('checkpoint');
      }
    },

    /* ---------------------------------------------------------- update */
    onUpdate: function (RT, dt) {
      var p = RT.player;
      expose();
      if (RT.deaths !== L.lastDeaths) { L.lastDeaths = RT.deaths; S = {}; }
      if (p.dead) return;
      var tx = ptx(), ty = pty();

      /* ---- act chip ------------------------------------------------ */
      var act = actName(tx, ty);
      if (act !== L.act) { L.act = act; RT.hud.set('act', act); }

      /* ---- I: the race ends on the far ledge ----------------------- */
      if (L.raceOn && !L.raceWon && tx > 66) {
        L.raceWon = 1;
        RT.banner(['THE LEDGE', 'VULCAN-9 is waiting at 74'], 2);
        sfx('win');
      }

      /* ---- III: the top of the shaft ------------------------------- */
      if (L.meltOn && !L.meltWon && tx > A3.x0 && tx < A3.x1 + 6 && ty < 7) {
        L.meltWon = 1;
        sfx('win');
        RT.banner(['THE TOP', 'it drains. you climbed it.'], 2);
      }

      /* ---- V: the counter ------------------------------------------ */
      if (!L.tycoonOn && tx > 172 && tx < 252 && ty > 38) startCounter();
      if (L.tycoonOn && tx > 172 && tx < 252 && ty > 26) counterTick(dt);
      else RT.hud.clear('lap');

      /* ---- VII: the trench where left is right --------------------- */
      /* latched, because an un-latched reversal oscillates on its own edge:
       * jumping out of the trench lifts you above the depth line mid-jump and
       * the controls would flip back while you were still over the hole. */
      if (!S.trench && tx > 304 && tx < 311.8 && (p.y + p.h > (A7.floor + 1) * T)) S.trench = 1;
      if (S.trench && (tx > 312.4 || tx < 303 || (p.onGround && p.y + p.h < (A7.floor + 0.7) * T))) S.trench = 0;
      var inTrench = !!S.trench;
      if (inTrench && !S.trenchSaid) {
        S.trenchSaid = 1;
        sfx('troll');
        RT.flash('rgba(255,62,165,0.3)', 0.12);
        RT.toast('left is right in here. eight tiles.', 2);
      }
      /* ---- reversed control sources, combined ---------------------- */
      if (S.revT > 0) S.revT -= dt;
      p.controlsReversed = inTrench || (S.revT > 0);
      /* ---- gravity, courtesy of THE AUTHOR ------------------------- */
      if (S.flipT > 0) { S.flipT -= dt; p.gravityFlip = true; }
      else p.gravityFlip = false;

      /* ---- the jester's deleted floor ------------------------------ */
      if (L.fakeFloor) {
        L.fakeFloor.t -= dt;
        if (L.fakeFloor.t <= 0) restoreFakeFloor();
      }

      /* ---- VIII: keep the exit portal alive across deaths ---------- */
      if (L.done.jester && tx > A8.x0 - 4 && !L.jumped) ensureJesterPortal();

      /* ---- X: the booth opens a moment after the author falls ------ */
      if (L.ticketPending) {
        L.ticketT = (L.ticketT || 0) + dt;
        if (L.ticketT > 1.6) { L.ticketT = 0; startTickets(); }
      }

      /* ---- the void under the high bands --------------------------- */
      if (ty > A9.row + 6 && ty < 30 && tx > 322 && tx < 399 && !L.done.jester) {
        /* nothing: the troll floor is down there, this is just a fall  */
      }
    },

    onWin: function (RT) {
      RT.hud.clear('act');
      RT.hud.clear('lap');
      if (RT.Tycoon && RT.Tycoon.stop) RT.Tycoon.stop();
      RT.particles.burst(RT.player.x + 10, RT.player.y + 14, {
        n: 90, colors: ['#3df0ff', '#ff3ea5', '#ffd23f', '#8dff9a', '#ffffff'],
        speed: 420, life: 2, size: 6, gravity: 220
      });
      RT.cam.shake(12, 1.2);
      RT.flash('#ffffff', 0.4);
    },

    /* ------------------------------------------------------------ art */
    onDraw: function (RT, g, layer) {
      var t = RT.time || 0;
      var camx = RT.cam.x, camy = RT.cam.y, vw = RT.view.w, vh = RT.view.h;
      var x0 = camx - vw / 2 - 64, x1 = camx + vw / 2 + 64;
      var y0 = camy - vh / 2 - 64, y1 = camy + vh / 2 + 64;
      if (layer === 'back') {
        drawActMarks(g, x0, x1, t);
        drawLaunchBack(g, x0, x1, y0, y1, t);
        drawShaftBack(g, x0, x1, y0, y1, t);
        drawStormBack(g, x0, x1, y0, y1, t);
        drawMarketBack(g, x0, x1, t);
        drawPaperBack(g, x0, x1, y0, y1, t);
        return;
      }
      if (L.tycoonOn && x1 > PLATE.x0 * T - 200 && x0 < (PLATE.x1 + 1) * T + 200) drawPlate(g, t);
      drawVoidHaze(g, x0, x1);
      var b = activeBoss();
      if (b) drawBossBar(g, b);
    }
  });

  /* ==================================================================== */
  /* HELPERS THE LEVEL BODY USES                                          */
  /* ==================================================================== */
  function actName(tx, ty) {
    if (L.spikeOn && ty < 20) return 'THE ONE SPIKE';
    if (ty < 20 && tx > AX.x0 - 2 && tx < AX.x1 + 2) return 'X - THE AUTHOR';
    if (ty < 30 && tx > A9.x0 - 2) return 'IX - ONE JUMP';
    if (tx < 73) return 'I - THE LAUNCH';
    if (tx < 106) return 'II - VULCAN-9';
    if (tx < 136) return 'III - THE MELT';
    if (tx < 178) return 'IV - GALE PRIME';
    if (tx < 253) return 'V - THE LONG COUNTER';
    if (tx < 373) return 'VII - THE TROLL';
    return 'VIII - THE JESTER';
  }

  function activeBoss() {
    var names = ['lGvulcan', 'lGgale', 'lGjester', 'lGauthor'], i, a, j;
    for (i = 0; i < names.length; i++) {
      a = RT.find(names[i]);
      for (j = 0; j < a.length; j++) {
        if (a[j].awake && !a[j].gone && a[j].st !== 'sleep' &&
            Math.abs((a[j].x + a[j].w / 2) - RT.cam.x) < RT.view.w) return a[j];
      }
    }
    return null;
  }

  function restoreFakeFloor() {
    if (!L.fakeFloor) return;
    var ts = L.fakeFloor.tiles, i;
    for (i = 0; i < ts.length; i++) carve(ts[i][0], ts[i][1], ts[i][2] || '#');
    L.fakeFloor = null;
  }

  function ensureJesterPortal() {
    var a = RT.find('portal'), i;
    for (i = 0; i < a.length; i++) if (a[i].x > (A8.x0 - 2) * T) return;
    RT.spawn({
      type: 'portal', x: A8.x1 - 2, y: A8.floor - 2, w: 1.4, h: 2,
      to: [A9.x0 + 2, A9.row - 2], color: '#ff3ea5'
    });
  }

  /* ---------------------------------------------------------------- art */
  var MARKS = [[0, 'I'], [74, 'II'], [106, 'III'], [136, 'IV'], [178, 'V'],
               [252, 'VI'], [254, 'VII'], [374, 'VIII']];
  function drawActMarks(g, x0, x1, t) {
    var i, mx;
    for (i = 0; i < MARKS.length; i++) {
      mx = MARKS[i][0] * T;
      if (mx < x0 - 40 || mx > x1 + 40) continue;
      g.save();
      g.globalAlpha = 0.12;
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, H * T); g.stroke();
      g.restore();
      RT.drawText(g, MARKS[i][1], mx + 16, 42 * T + Math.sin(t * 1.3 + i) * 3, {
        size: 26, color: 'rgba(255,210,63,0.18)', align: 'left'
      });
    }
  }

  function drawLaunchBack(g, x0, x1, y0, y1, t) {
    if (x0 > 74 * T) return;
    /* the launch tower, floodlights and a countdown board */
    var i;
    g.save();
    g.globalAlpha = 0.5;
    for (i = 0; i < 6; i++) {
      var lx = (2 + i * 2.4) * T;
      if (lx < x0 - 60 || lx > x1 + 60) continue;
      var on = L.raceOn ? ((Math.floor(t * 5) + i) % 2 === 0) : ((Math.floor(t * 1.2) + i) % 4 === 0);
      circ(g, lx, 34.4 * T, 5, on ? '#ffd23f' : '#3a3a4a');
      if (on) {
        g.globalAlpha = 0.12;
        poly(g, [lx, 34.4 * T, lx - 40, 46 * T, lx + 40, 46 * T], '#ffe9a8');
        g.globalAlpha = 0.5;
      }
    }
    g.restore();
    /* a distant launch tower silhouette */
    if (x0 < 20 * T) {
      g.save();
      g.globalAlpha = 0.35;
      rr(g, 1.2 * T, 33 * T, 10, 13 * T, 2, '#0f1730');
      for (i = 0; i < 6; i++) rr(g, 1.2 * T - 8, (34.5 + i * 2) * T, 26, 3, 1, '#0f1730');
      g.restore();
    }
    /* the hole in the world: a haze over the void between 15 and 66 */
    var a = Math.max(x0, 15 * T), b = Math.min(x1, 66 * T);
    if (b > a) {
      var lg = g.createLinearGradient(0, 42 * T, 0, 56 * T);
      lg.addColorStop(0, 'rgba(10,6,20,0)');
      lg.addColorStop(1, 'rgba(10,6,20,0.92)');
      g.fillStyle = lg;
      g.fillRect(a, 42 * T, b - a, 14 * T);
    }
  }

  function drawShaftBack(g, x0, x1, y0, y1, t) {
    if (x1 < A3.x0 * T || x0 > (A3.x1 + 1) * T) return;
    /* the glow of the lava climbing the walls */
    var top = L.lavaY || (A3.bot + 1) * T;
    var a = A3.x0 * T, b = (A3.x1 + 1) * T;
    var lg = g.createLinearGradient(0, top - 420, 0, top);
    lg.addColorStop(0, 'rgba(255,90,20,0)');
    lg.addColorStop(1, 'rgba(255,120,40,0.22)');
    g.fillStyle = lg;
    g.fillRect(a, top - 420, b - a, 420);
    /* strata on the rock */
    g.save();
    g.globalAlpha = 0.14;
    var i;
    for (i = 0; i < 26; i++) {
      var yy = (4 + i * 1.7) * T;
      if (yy < y0 - 40 || yy > y1 + 40) continue;
      g.fillStyle = i % 2 ? '#3a1a12' : '#25100c';
      g.fillRect(a, yy, b - a, 7 + (i % 3) * 3);
    }
    g.restore();
  }

  function drawStormBack(g, x0, x1, y0, y1, t) {
    if (x1 < (A4.x0 - 3) * T || x0 > (A4.x1 + 3) * T) return;
    /* rain, and a lightning flash on a slow clock */
    var i, rx, ry;
    g.save();
    g.globalAlpha = 0.16;
    g.strokeStyle = '#9ad4ff';
    g.lineWidth = 1.4;
    for (i = 0; i < 70; i++) {
      rx = (A4.x0 - 2) * T + ((i * 137 + t * 520) % ((A4.x1 - A4.x0 + 5) * T));
      ry = ((i * 71 + t * 900) % (14 * T));
      g.beginPath();
      g.moveTo(rx, ry);
      g.lineTo(rx - 4, ry + 16);
      g.stroke();
    }
    var flash = Math.sin(t * 0.7) > 0.985 ? 1 : 0;
    if (flash) {
      g.globalAlpha = 0.16;
      g.fillStyle = '#dff6ff';
      g.fillRect((A4.x0 - 3) * T, 0, (A4.x1 - A4.x0 + 7) * T, 16 * T);
    }
    g.restore();
  }

  function drawMarketBack(g, x0, x1, t) {
    if (x1 < 170 * T || x0 > 253 * T) return;
    /* bunting across the counter, and the gate glow */
    var i, bx, by;
    g.save();
    for (i = 0; i < 40; i++) {
      bx = (172 + i * 2) * T;
      if (bx < x0 - 40 || bx > x1 + 40) continue;
      by = 36 * T + Math.sin(i * 0.6) * 10;
      g.globalAlpha = 0.5;
      g.strokeStyle = '#6a4a3a'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 2 * T, 36 * T + Math.sin((i + 1) * 0.6) * 10); g.stroke();
      poly(g, [bx, by, bx + 12, by, bx + 6, by + 16],
           ['#ff3ea5', '#ffd23f', '#8dff9a', '#3df0ff'][i % 4]);
    }
    g.restore();
    if (!L.gateOpen && x1 > 246 * T) {
      g.save();
      g.globalAlpha = 0.2 + 0.08 * Math.sin(t * 3);
      g.fillStyle = '#ffd23f';
      g.fillRect(248.6 * T, 34 * T, 2.8 * T, 10 * T);
      g.restore();
    }
  }

  function drawPaperBack(g, x0, x1, y0, y1, t) {
    if (!L.authorOn && !L.spikeOn) return;
    if (y0 > 20 * T) return;
    /* the author's band: ruled paper, faintly */
    var a = Math.max(x0, (AX.x0 - 2) * T), b = Math.min(x1, (AS.x1 + 2) * T);
    if (b <= a) return;
    g.save();
    g.globalAlpha = 0.82;
    g.fillStyle = '#0b0a12';
    g.fillRect(a, 0, b - a, 20 * T);
    g.globalAlpha = 0.1;
    g.strokeStyle = '#9ad4ff'; g.lineWidth = 1;
    var i;
    for (i = 1; i < 20; i++) {
      g.beginPath(); g.moveTo(a, i * T); g.lineTo(b, i * T); g.stroke();
    }
    g.globalAlpha = 0.16;
    g.strokeStyle = '#ff3ea5'; g.lineWidth = 2;
    g.beginPath(); g.moveTo((AX.x0 + 1) * T, 0); g.lineTo((AX.x0 + 1) * T, 20 * T); g.stroke();
    g.restore();
  }

  function drawVoidHaze(g, x0, x1) {
    var spans = [[15, 66], [322, 326], [334, 338], [350, 352], [359, 364]];
    var i, a, b, y, lg;
    g.save();
    for (i = 0; i < spans.length; i++) {
      a = spans[i][0] * T; b = spans[i][1] * T;
      if (x1 < a || x0 > b) continue;
      y = (i === 0 ? 47 : A7.floor + 1) * T;
      lg = g.createLinearGradient(0, y - 40, 0, y + 260);
      lg.addColorStop(0, 'rgba(8,6,16,0)');
      lg.addColorStop(1, 'rgba(8,6,16,0.9)');
      g.fillStyle = lg;
      g.fillRect(Math.max(x0, a), y - 40, Math.min(x1, b) - Math.max(x0, a), 300);
    }
    g.restore();
  }

  /* ==================================================================== */
  /* TEST HOOKS - tools/playtest.js drives the bosses and the booth        */
  /* through these, exactly as it drives Tetris through RT.Tetris.         */
  /* ==================================================================== */
  var DBG = {
    state: function () {
      return {
        act: L.act, done: L.done, raceOn: L.raceOn, meltOn: L.meltOn,
        gate: L.gateOpen, laps: L.laps, cash: (RT.Tycoon && RT.Tycoon.cash) || 0,
        jumped: L.jumped, fakeWin: L.fakeWinShown, tickets: L.ticketRun,
        perfect: L.ticketPerfect, spike: L.spikeOn
      };
    },
    boss: function (key) {
      var map = { vulcan: 'lGvulcan', gale: 'lGgale', jester: 'lGjester', author: 'lGauthor' };
      var a = RT.find(map[key] || key);
      return a.length ? a[0] : null;
    },
    hit: function (key, n) {
      var b = L.dbg.boss(key);
      if (!b) return false;
      b.awake = 1;
      if (b.st === 'sleep') bossWake(b);
      b.invuln = 0;
      bossHit(b, n || 1);
      return b.hp;
    },
    killBoss: function (key) {
      var b = L.dbg.boss(key);
      if (!b) return false;
      b.awake = 1;
      b.invuln = 0;
      if (key === 'jester' && b.round === 1) { b.hp = 1; bossHit(b, 1); b.round = 2; b.maxHp = 3; b.hp = 3; b.perPhase = 3; b.phases = 1; b.phase = 1; bossState(b, 'idle'); }
      b.hp = 1;
      b.invuln = 0;
      bossHit(b, 1);
      return true;
    },
    cash: function (n) { if (RT.Tycoon && RT.Tycoon.add) RT.Tycoon.add(n || 20000); },
    buyAll: function () {
      if (!RT.Tycoon || !RT.Tycoon.buy) return false;
      L.dbg.cash(60000);
      for (var i = 0; i < SHOP.length; i++) RT.Tycoon.buy(SHOP[i].id, { force: true });
      openGate();
      return true;
    },
    tickets: function (perfect) {
      if (RT.getMode && RT.getMode()) RT.clearMode();
      L.ticketRun = 0; L.ticketPending = 0;
      endTickets(1000, perfect ? 0 : 3);
      return true;
    },
    warp: function (tx, ty) {
      var p = P();
      p.x = tx * T; p.y = ty * T; p.vx = 0; p.vy = 0; p.dead = false;
      RT.cam.x = p.x; RT.cam.y = p.y;
      return true;
    },
    skipTo: function (what) {
      var d = L.done;
      if (what === 'melt') { d.vulcan = 1; carve(105, 44, '.'); carve(105, 45, '.'); L.dbg.warp(108, 45); }
      else if (what === 'gale') { d.vulcan = 1; d.melt = 1; L.meltWon = 1; L.dbg.warp(138, 11); }
      else if (what === 'counter') {
        d.vulcan = 1; d.gale = 1;
        for (var x = 172; x <= 176; x++) for (var y = A4.floor; y <= A4.floor + 2; y++) carve(x, y, '.');
        L.dbg.warp(182, 43);
      } else if (what === 'troll') { d.vulcan = 1; d.gale = 1; openGate(); L.dbg.warp(253, 43); }
      else if (what === 'jester') { d.vulcan = 1; d.gale = 1; openGate(); L.dbg.warp(374, 43); }
      else if (what === 'onejump') { d.jester = 1; L.dbg.warp(A9.x0 + 2, A9.row - 2); }
      else if (what === 'author') { d.jester = 1; L.jumped = 1; L.fakeWinShown = 1; startAuthor(); }
      else if (what === 'tickets') { d.jester = 1; d.author = 1; L.jumped = 1; L.fakeWinShown = 1; startTickets(); }
      else if (what === 'spike') { d.jester = 1; d.author = 1; d.tickets = 1; L.spikeOn = 1; L.dbg.warp(332, AS.row - 2); }
      else return false;
      expose();
      return true;
    }
  };
  expose();
})();
