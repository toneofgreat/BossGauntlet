/* ==========================================================================
 * RAGE TRIALS - Trial 1: FIRST STEPS
 * --------------------------------------------------------------------------
 * The friendly one. A sunny meadow that teaches, in order:
 *   walk -> a 2 tile ditch -> one spike -> a spike pair with an island between
 *   -> a one tile step up -> three spikes cleared with a running jump -> goal.
 * Nothing in this level can kill except the pointy bits, and the ditch has a
 * floor, so a mistake costs a second, never a run.
 *
 * Geometry (44 x 11 tiles, surface rows 8 / 7 / 6):
 *   x0-8   flat start        x9-10  ditch (2 wide, 2 deep, a stream at the bottom)
 *   x16    one spike         x21/26 spike pair, 4 wide island at 22-25
 *   x30    step up to row 7  x35-37 three spikes, run-up from 30
 *   x40    step up to row 6  x42    the goal on the sunlit summit
 *
 * Spacing rule this level obeys: a full running jump carries ~4.5 tiles, so
 * the island between the paired spikes is 4 wide - whatever the player does
 * with the jump button, the landing is safe. The only jump with a real window
 * is the three-spike finale, and the checkpoint sits at the top of its run-up.
 * ========================================================================== */
(function () {
  var RT = window.RT;
  if (!RT) return;
  var T = 32;

  /* deterministic scenery noise - never touches RT.random(), so seeded
   * gameplay elsewhere in the game is unaffected. */
  function h(n) { var x = Math.sin(n * 12.9898 + 4.137) * 43758.5453; return x - Math.floor(x); }

  /* the last few tiles tip into a warmer, sun-drenched palette */
  var SUMMIT = {
    sky: [[0, '#5cb4ff'], [0.42, '#a9e3ff'], [1, '#ffeec2']],
    parallax: [
      { kind: 'clouds',    color: '#fffdf2', y: 0.50, speed: 0.06, scale: 0.44, alpha: 0.9 },
      { kind: 'mountains', color: '#93c7de', y: 0.80, speed: 0.14, scale: 0.34 },
      { kind: 'hills',     color: '#6fbb54', color2: '#4e9a45', y: 0.96, speed: 0.30, scale: 0.30 },
      { kind: 'hills',     color: '#4d9a43', color2: '#3b7d38', y: 1.06, speed: 0.52, scale: 0.26 }
    ],
    ambient: 'dust',
    fog: { color: '#ffe9b8', alpha: 0.12 },
    tile: { top: '#7ee05c', side: '#9a6a3d', dark: '#5f4325', rim: '#dcffb2', accent: '#7a5232' },
    spike: { base: '#d6e0e8', tip: '#ffffff' },
    vignette: 0.20
  };

  /* ---------------------------------------------------------------- state */
  var W = 44, H = 11;
  var surf = [];        // per column: y of the top ground tile (-1 = none/spike)
  var said = {};        // one-shot chatter

  function buildSurface() {
    surf.length = 0;
    for (var tx = 0; tx < W; tx++) {
      var top = -1;
      for (var ty = 0; ty < H; ty++) {
        var ch = RT.getTile(tx, ty);
        if (ch === '#') { top = ty; break; }
        if (ch === '^' || ch === 'v' || ch === '<' || ch === '>') { top = -1; break; }
      }
      surf.push(top);
    }
  }

  /* ------------------------------------------------------------ BACK ART */

  function drawSun(g, camx, t) {
    var x = camx * 0.94 + 90, y = 54;
    var pulse = 1 + Math.sin(t * 0.8) * 0.03;
    var glow = g.createRadialGradient(x, y, 6, x, y, 132 * pulse);
    glow.addColorStop(0, 'rgba(255,248,205,0.95)');
    glow.addColorStop(0.28, 'rgba(255,236,150,0.42)');
    glow.addColorStop(1, 'rgba(255,225,130,0)');
    g.fillStyle = glow;
    g.fillRect(x - 140, y - 140, 280, 280);
    /* slow rays */
    g.save();
    g.translate(x, y);
    g.rotate(t * 0.055);
    g.globalAlpha = 0.20;
    g.fillStyle = '#fff6c8';
    for (var i = 0; i < 12; i++) {
      g.rotate(Math.PI / 6);
      g.beginPath();
      g.moveTo(0, -16);
      g.lineTo(96 + Math.sin(t * 1.3 + i) * 9, -4);
      g.lineTo(96 + Math.sin(t * 1.3 + i) * 9, 4);
      g.lineTo(0, 16);
      g.closePath();
      g.fill();
    }
    g.restore();
    g.fillStyle = '#fffbe3';
    g.beginPath(); g.arc(x, y, 26 * pulse, 0, 6.2832); g.fill();
  }

  /* a distant windmill + fence line just above the horizon */
  function drawFarm(g, camx, t) {
    var x = camx * 0.58 + 430, base = 214;
    g.save();
    g.globalAlpha = 0.34;
    g.fillStyle = '#2f6b45';
    /* mill body */
    g.beginPath();
    g.moveTo(x - 13, base); g.lineTo(x - 7, base - 46);
    g.lineTo(x + 7, base - 46); g.lineTo(x + 13, base);
    g.closePath(); g.fill();
    /* roof */
    g.beginPath();
    g.moveTo(x - 10, base - 44); g.lineTo(x, base - 58); g.lineTo(x + 10, base - 44);
    g.closePath(); g.fill();
    /* sails */
    g.save();
    g.translate(x, base - 48);
    g.rotate(t * 0.42);
    for (var i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -2); g.lineTo(30, -6); g.lineTo(30, 6); g.lineTo(0, 2);
      g.closePath(); g.fill();
    }
    g.restore();
    /* fence posts marching off to the right */
    for (var k = 0; k < 16; k++) {
      var fx = x + 44 + k * 26;
      g.fillRect(fx, base - 12, 3, 12);
      g.fillRect(fx - 1, base - 9, 25, 2);
    }
    g.restore();
  }

  function drawBirds(g, camx, t) {
    g.save();
    g.strokeStyle = 'rgba(40,70,95,0.42)';
    g.lineWidth = 1.6;
    for (var i = 0; i < 5; i++) {
      var span = W * T + 420;
      var bx = ((t * (16 + i * 3) + i * 317) % span) - 210 + camx * 0.82;
      var by = 40 + i * 13 + Math.sin(t * 0.7 + i) * 6;
      var flap = Math.sin(t * 5.2 + i * 1.7) * 3.2;
      g.beginPath();
      g.moveTo(bx - 6, by + flap); g.lineTo(bx, by); g.lineTo(bx + 6, by + flap);
      g.stroke();
    }
    g.restore();
  }

  /* a band of wildflowers along the parallax hill line */
  function drawFlowerBand(g, camx, x0, x1) {
    var base = 232;
    g.save();
    g.globalAlpha = 0.30;
    var shift = camx * 0.16;
    var sx = Math.floor((x0 + shift) / 14) * 14;
    for (var x = sx; x < x1 + shift + 14; x += 14) {
      var n = h(x * 0.37);
      var px = x - shift, py = base - n * 7;
      g.fillStyle = n > 0.66 ? '#fff3a8' : (n > 0.33 ? '#ffd0e4' : '#ffffff');
      g.fillRect(px, py, 2.4, 2.4);
      g.fillStyle = '#3f8a46';
      g.fillRect(px + 0.8, py + 2, 1, 5);
    }
    g.restore();
  }

  /* ----------------------------------------------------------- FRONT ART */

  /* grass tufts and flowers growing out of every ground surface */
  function drawGrass(g, x0, x1, t) {
    var tx0 = Math.max(0, (x0 / T) | 0), tx1 = Math.min(W - 1, (x1 / T) | 0);
    g.save();
    g.lineWidth = 1.5;
    for (var tx = tx0; tx <= tx1; tx++) {
      var ty = surf[tx];
      if (ty === undefined || ty < 0) continue;
      var gy = ty * T;
      for (var k = 0; k < 3; k++) {
        var n = h(tx * 3.1 + k * 7.7);
        if (n < 0.34) continue;
        var gx = tx * T + 4 + n * 24;
        var hh = 5 + n * 7;
        var sway = Math.sin(t * 1.7 + tx * 0.9 + k) * 1.9;
        g.strokeStyle = (k === 1) ? 'rgba(60,150,60,0.75)' : 'rgba(120,224,104,0.75)';
        g.beginPath();
        g.moveTo(gx, gy + 1);
        g.quadraticCurveTo(gx + sway * 0.5, gy - hh * 0.6, gx + sway, gy - hh);
        g.stroke();
        if (n > 0.86) {           /* the odd flower head */
          g.fillStyle = (h(tx + k) > 0.5) ? '#fff0a0' : '#ffc2dc';
          g.beginPath(); g.arc(gx + sway, gy - hh - 1, 2.1, 0, 6.2832); g.fill();
          g.fillStyle = '#ffae3a';
          g.fillRect(gx + sway - 0.5, gy - hh - 1.5, 1, 1);
        }
      }
    }
    g.restore();
  }

  function drawButterflies(g, x0, x1, t) {
    var cols = ['#ffd45e', '#ff8fbe', '#9bf0ff', '#fff2a8'];
    g.save();
    for (var i = 0; i < 9; i++) {
      var home = 120 + h(i * 2.3) * (W * T - 260);
      var bx = home + Math.sin(t * (0.44 + h(i) * 0.3) + i * 2.1) * 52;
      if (bx < x0 - 30 || bx > x1 + 30) continue;
      var by = 118 + h(i * 5.9) * 108 + Math.sin(t * 1.9 + i) * 13;
      var flap = Math.abs(Math.sin(t * 9 + i * 1.3));
      g.save();
      g.translate(bx, by);
      g.globalAlpha = 0.92;
      g.fillStyle = cols[i % 4];
      g.beginPath(); g.ellipse(-2.6, 0, 1 + flap * 3.2, 3.4, -0.3, 0, 6.2832); g.fill();
      g.beginPath(); g.ellipse(2.6, 0, 1 + flap * 3.2, 3.4, 0.3, 0, 6.2832); g.fill();
      g.fillStyle = 'rgba(60,40,20,0.75)';
      g.fillRect(-0.7, -2.4, 1.4, 5);
      g.restore();
    }
    g.restore();
  }

  /* warm light pouring over the summit, plus a few soft out-of-focus pollen
   * motes drifting very close to the camera */
  function drawLight(g, camx, x0, x1, t) {
    var hx = 40 * T;
    if (x1 > hx - 260) {
      var lg = g.createLinearGradient(hx - 40, 96, hx + 180, 300);
      lg.addColorStop(0, 'rgba(255,240,180,0)');
      lg.addColorStop(1, 'rgba(255,232,150,0.22)');
      g.fillStyle = lg;
      g.fillRect(hx - 60, 60, 300, 300);
    }
    g.save();
    for (var i = 0; i < 6; i++) {
      var px = (t * (7 + i * 2) + i * 211) % (W * T);
      var py = 60 + ((i * 47 + t * 9) % 240);
      if (px < x0 - 20 || px > x1 + 20) continue;
      g.globalAlpha = 0.10 + h(i) * 0.08;
      g.fillStyle = '#fffbe0';
      g.beginPath(); g.arc(px, py, 5 + h(i * 3) * 6, 0, 6.2832); g.fill();
    }
    g.restore();
  }

  /* ========================================================== THE LEVEL */
  RT.registerLevel(1, {
    name: 'FIRST STEPS',
    subtitle: 'Jump over some simple spikes',
    theme: 'meadow',
    themeZones: [{ x0: 38, x1: 99, theme: SUMMIT }],
    music: 'meadow',

    /* The coins trace the real arc of a full running jump: apex 4 tiles over
     * the surface, shoulders 1 and 2 tiles lower. Follow the coins, live.
     *
     *        0         1         2         3         4
     *        01234567890123456789012345678901234567890123   */
    tiles: [
      '............................................',
      '............................................',
      '............................................',
      '....................................o.......',
      '..........o.....o....o....o........o.o......',
      '.........o.o...o.o..o.o..o.o......o...o...G.',
      '................................C.......####',
      '..P...o.................o.....#####^^^######',
      '#########..#####^####^####^#################',
      '#########~~#################################',
      '############################################'
    ],

    entities: [
      /* ---- the teaching signs -------------------------------------- */
      { type: 'sign', x: 5,  y: 7, text: 'controls', range: 2.6 },
      { type: 'sign', x: 13, y: 7, text: 'Spikes. Pointy. Jump them. That is the entire syllabus.', range: 2.4 },
      { type: 'sign', x: 19, y: 7, text: 'Two of them now, with a whole meadow to land in between. Take your time.', range: 2.4 },
      { type: 'sign', x: 30.5, y: 6, text: 'Three in a row. Keep running and it is the very same jump - the coins show you the arc.', range: 2.6 },
      { type: 'sign', x: 39, y: 6, text: 'That is the whole trial. The other nine are not like this one.', range: 2.4 },

      /* ---- world-space lettering ----------------------------------- */
      { type: 'text', x: 0.5,  y: 1.2, w: 9, h: 1.4, text: 'FIRST STEPS', size: 1.15, color: '#ffffff', alpha: 0.30, wave: 2.2 },
      { type: 'text', x: 7.6,  y: 6.5, w: 4, h: 1,   text: 'hop', size: 0.6, color: '#2c6b3a', alpha: 0.75, rot: -9 },
      { type: 'text', x: 22,   y: 2.7, w: 5, h: 1,   text: 'land in the middle', size: 0.42, color: '#2c6b3a', alpha: 0.6 },
      { type: 'text', x: 32.4, y: 2.1, w: 5, h: 1,   text: 'RUN', size: 0.95, color: '#ffffff', alpha: 0.42, wave: 1.6, rot: -4 },
      { type: 'text', x: 38.4, y: 1.4, w: 6, h: 1,   text: 'THE SUMMIT', size: 0.6, color: '#fff3c0', alpha: 0.55 },

      /* ---- scenery -------------------------------------------------- */
      { type: 'deco', kind: 'tree',  x: 0.1,  y: 5.5,  w: 2.4, h: 2.5 },
      { type: 'deco', kind: 'bush',  x: 3.4,  y: 7.1,  w: 1.2, h: 0.9 },
      { type: 'deco', kind: 'rock',  x: 7.3,  y: 7.25, w: 0.9, h: 0.75 },
      { type: 'deco', kind: 'bush',  x: 11.4, y: 7.15, w: 1,   h: 0.85 },
      { type: 'deco', kind: 'tree',  x: 12.4, y: 5.3,  w: 2.6, h: 2.7, scale: 1.05 },
      { type: 'deco', kind: 'rock',  x: 18.4, y: 7.3,  w: 0.7, h: 0.7 },
      { type: 'deco', kind: 'bush',  x: 23.3, y: 7.1,  w: 1.1, h: 0.9 },
      { type: 'deco', kind: 'tree',  x: 27.3, y: 5.4,  w: 2.2, h: 2.6, flip: true },
      { type: 'deco', kind: 'bush',  x: 33.5, y: 6.15, w: 1.1, h: 0.85 },
      { type: 'deco', kind: 'rock',  x: 38.3, y: 6.35, w: 0.8, h: 0.65 },
      { type: 'deco', kind: 'flag',  x: 40.3, y: 4,    w: 1,   h: 2 },
      { type: 'deco', kind: 'tree',  x: 41.8, y: 3.6,  w: 2,   h: 2.4 },
      { type: 'deco', kind: 'cloud', x: 4,    y: 0.8,  w: 3.4, h: 1.3, alpha: 0.85 },
      { type: 'deco', kind: 'cloud', x: 17.5, y: 1.4,  w: 3,   h: 1.1, alpha: 0.7 },
      { type: 'deco', kind: 'cloud', x: 29,   y: 0.6,  w: 3.8, h: 1.4, alpha: 0.8 },
      { type: 'deco', kind: 'cloud', x: 40,   y: 1.9,  w: 2.6, h: 1,   alpha: 0.6 }
    ],

    intro: ['TRIAL 1 - FIRST STEPS', 'Walk right. Jump the pointy bits.', 'This is the nice one.'],

    onLoad: function (RT) {
      buildSurface();
      said = {};
      /* the first sign reads the controls you are actually holding */
      var touch = false;
      try {
        touch = (document.body && document.body.classList.contains('touch')) ||
                (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      } catch (e) { touch = false; }
      var signs = RT.find('sign');
      for (var i = 0; i < signs.length; i++) {
        if (signs[i].text !== 'controls') continue;
        signs[i].text = touch
          ? 'LEFT and RIGHT walk. The big round button JUMPS - hold it longer to jump higher.'
          : 'A / D or the arrows walk. SPACE jumps - hold it longer to jump higher. R retries.';
      }
    },

    onUpdate: function (RT) {
      var p = RT.player;
      if (p.dead) return;
      var tx = (p.x + p.w / 2) / T;
      if (!said.ditch && tx > 11.4) {
        said.ditch = 1;
        RT.speech(p.x + p.w / 2, p.y - 6, 'cleared it', 1.1);
      }
      if (!said.pair && tx > 27.6) {
        said.pair = 1;
        RT.speech(p.x + p.w / 2, p.y - 6, 'still alive', 1.1);
      }
      if (!said.three && tx > 38.6) {
        said.three = 1;
        RT.speech(p.x + p.w / 2, p.y - 6, 'look at you go', 1.3);
      }
    },

    onCheckpoint: function (RT) {
      RT.toast('halfway. the hard part is three spikes wide.', 1.8);
    },

    onDeath: function (RT, cause) {
      var lines = [
        'the spikes are pointy. that is the lesson.',
        'no harm done - the flag is still up there.',
        'jump a little earlier.',
        'hold the jump button longer for more height.'
      ];
      if (cause === 'spikes') RT.toast(lines[RT.deaths % lines.length], 1.7);
    },

    onWin: function (RT) {
      RT.particles.burst(RT.player.x + 10, RT.player.y + 14, {
        n: 34, colors: ['#fff3a8', '#ffd45e', '#ffffff', '#9bf0ff'],
        speed: 210, life: 0.9, size: 3, gravity: 240
      });
      RT.cam.shake(3, 0.25);
    },

    onDraw: function (RT, g, layer) {
      var t = RT.time || 0;
      var camx = RT.cam.x, vw = RT.view.w;
      var x0 = camx - vw / 2 - 48, x1 = camx + vw / 2 + 48;
      if (layer === 'back') {
        drawSun(g, camx, t);
        drawBirds(g, camx, t);
        drawFarm(g, camx, t);
        drawFlowerBand(g, camx, x0, x1);
      } else {
        drawGrass(g, x0, x1, t);
        drawButterflies(g, x0, x1, t);
        drawLight(g, camx, x0, x1, t);
      }
    }
  });
})();
