/* =========================================================================
 * RAGE TRIALS - LEVEL 5: BLIND FAITH
 * -------------------------------------------------------------------------
 * The ruins of level 4 fall into the caldera. Everything you learned there
 * ("F is a lie, stay off it") is still true - right up to the one room where
 * the lie is the only floor that saves you.
 *
 * Grid: 103 x 14. Floor line is row 11, lava sea rows 12-13.
 * Checkpoints: x=26 (after the coin bridge), x=54 (after the low road),
 *              x=76 (after the drop of faith).
 * ========================================================================= */
(function () {
  var RT = window.RT;
  if (!RT) return;

  var T = 32;
  var LAVA_Y = 12 * T;          // top of the lava sea
  var seen = {};                // one-shot story beats, reset every load

  /* --- tiny deterministic hash so the background art never flickers ----- */
  function h1(i) { var s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s); }

  /* --- parallax helper: world x of a layer drawn at depth `par` --------- */
  function parX(cx, wx, par) { return cx * (1 - par) + wx * par; }

  /* --- one broken temple column ---------------------------------------- */
  function column(g, x, baseY, hgt, w, body, line, ember) {
    g.fillStyle = body;
    g.fillRect(x - w / 2, baseY - hgt, w, hgt);
    /* snapped-off top */
    g.beginPath();
    g.moveTo(x - w / 2, baseY - hgt);
    g.lineTo(x - w * 0.18, baseY - hgt - 9);
    g.lineTo(x + w * 0.06, baseY - hgt - 2);
    g.lineTo(x + w / 2, baseY - hgt - 11);
    g.lineTo(x + w / 2, baseY - hgt + 7);
    g.lineTo(x - w / 2, baseY - hgt + 7);
    g.closePath();
    g.fill();
    /* drum joints */
    g.fillStyle = line;
    for (var i = 1; i * 21 < hgt; i++) g.fillRect(x - w / 2, baseY - i * 21, w, 1.5);
    /* the caldera lights one edge of everything */
    g.fillStyle = ember;
    g.fillRect(x + w / 2 - 2.5, baseY - hgt + 7, 2.5, hgt - 7);
  }

  /* --- the watcher: a temple face carved into the far wall -------------- */
  function watcher(g, x, y, s, t) {
    var pulse = 0.55 + 0.45 * Math.sin(t * 1.6);
    g.save();
    g.translate(x, y);
    g.scale(s, s);
    /* slab */
    g.fillStyle = 'rgba(38,14,11,0.75)';
    g.beginPath();
    g.moveTo(-120, -96); g.lineTo(120, -104); g.lineTo(134, 96);
    g.lineTo(-108, 104); g.closePath(); g.fill();
    /* brow */
    g.fillStyle = 'rgba(20,7,6,0.85)';
    g.fillRect(-96, -46, 192, 16);
    /* eyes */
    g.globalAlpha = 0.28 + 0.34 * pulse;
    g.fillStyle = '#ff8a2e';
    g.beginPath(); g.moveTo(-74, -18); g.lineTo(-22, -26); g.lineTo(-26, 4); g.lineTo(-70, 8); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(74, -20); g.lineTo(22, -26); g.lineTo(26, 4); g.lineTo(70, 6); g.closePath(); g.fill();
    g.globalAlpha = 1;
    /* mouth: a long grin of teeth, i.e. the spike beds below */
    g.fillStyle = 'rgba(16,5,4,0.8)';
    g.fillRect(-78, 42, 156, 26);
    g.fillStyle = 'rgba(255,140,60,0.22)';
    for (var i = 0; i < 9; i++) g.fillRect(-72 + i * 17, 42, 7, 26);
    g.restore();
  }

  /* --- carved glyph: an arrow telling you to stay down ------------------ */
  function glyphDown(g, x, y, a) {
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = '#ffb066';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y - 14); g.lineTo(x, y + 12);
    g.moveTo(x - 10, y + 2); g.lineTo(x, y + 14); g.lineTo(x + 10, y + 2);
    g.stroke();
    g.restore();
  }

  RT.registerLevel(5, {
    name: 'BLIND FAITH',
    subtitle: 'Fake and real platforms and spikes',
    theme: 'ruins',
    themeZones: [{ x0: 22, x1: 400, theme: 'volcano' }],
    music: 'volcano',

    /* --- 103 x 14 --------------------------------------------------------
     *   cols   0-13  ruins ledge          14-24 the coin bridge (fakes)
     *         25-27  CHECKPOINT 1         28-40 stepping stones over spikes
     *         41-52  THE LOW ROAD         53-55 CHECKPOINT 2
     *         56-64  crumbles over lava   65-74 THE DROP OF FAITH
     *         75-77  CHECKPOINT 3         78-90 thwomp gauntlet
     *         91-97  the last crumbles    98-102 goal
     * ------------------------------------------------------------------- */
    tiles: [
      '.......................................................................................................',
      '.......................................................................................................',
      '.......................................................................................................',
      '.......................................................................................................',
      '.......................................................................................................',
      '.......................................................................................................',
      '...............................................o..o....................................................',
      '................................oo..ooo........v..v....................................................',
      '............................................###F##F##..................................................',
      '.........ooo.................###.F##.FF##..............................................................',
      '..P.......#...oo.oo..oooo.C.#..............o...o....o.C.o..o..o....^........C..o...o...o..oo..o..o..G..',
      '################F##FF########^^^^^^^^^^^^####^###^######KK.KK.KK##.#.FFFF##################KK.KK.K#####',
      '##############LLLLLLLLLLLLLL############################LLLLLLLLLLL#....######LLLLLLLLLLLLLLLLLLLL#####',
      '##############LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL########LLLLLLLLLLLLLLLLLLLLLLL#####'
    ],

    intro: [
      'The ruins fall into the caldera.',
      'Half of what holds you is a rumour.',
      'One of the lies is the only way through.'
    ],

    entities: [
      /* ---------- the ruins, still standing, for now ------------------- */
      { type: 'sign', x: 4, y: 10, text: 'BLIND FAITH. Down there, half the temple is a rumour.' },
      { type: 'deco', kind: 'grave', x: 6.2, y: 10 },
      { type: 'deco', kind: 'skull', x: 7.5, y: 10 },
      { type: 'deco', kind: 'torch', x: 8.8, y: 10 },
      { type: 'text', x: 1.5, y: 4, w: 9, text: 'THE RUINS END HERE', size: 0.78, color: '#ffd7a2', alpha: 0.34, rot: -4 },
      { type: 'sign', x: 13, y: 10, text: 'Gold only rests on real stone. Walk the gold.' },
      { type: 'lavaball', x: 19, y: 12, every: 3.4, phase: 0 },

      /* ---------- checkpoint 1 / the stepping stones ------------------- */
      { type: 'deco', kind: 'torch', x: 25.2, y: 10 },
      { type: 'sign', x: 27.4, y: 10, text: 'Three of the stones up there are ghosts. The coins float over the gaps, not over the ghosts.' },
      { type: 'deco', kind: 'skull', x: 32.5, y: 10 },
      { type: 'deco', kind: 'skull', x: 37.4, y: 10 },
      { type: 'text', x: 30, y: 6, w: 8, text: 'MIND THE GHOSTS', size: 0.6, color: '#ffb07a', alpha: 0.3, rot: 3 },

      /* ---------- the low road ----------------------------------------- */
      { type: 'sign', x: 41.3, y: 10, text: 'KEEP YOUR HEAD DOWN. The roof lets liars through, and there are teeth above it.' },
      { type: 'deco', kind: 'torch', x: 42.6, y: 10 },
      { type: 'deco', kind: 'torch', x: 51.5, y: 10 },

      /* ---------- checkpoint 2 / the crumbles -------------------------- */
      { type: 'deco', kind: 'torch', x: 53.2, y: 10 },
      { type: 'sign', x: 55.4, y: 10, text: 'Cracked stone. Standing still is a decision.' },
      { type: 'lavaball', x: 58, y: 12, every: 4.2, phase: 0 },

      /* ---------- the drop of faith ------------------------------------ */
      { type: 'sign', x: 64.1, y: 10, text: 'Nothing over there will hold you. Jump anyway. That is the whole trial.' },
      { type: 'lavaball', x: 66, y: 12, every: 4.4, phase: 2.6 },
      { type: 'text', x: 69.6, y: 12.3, w: 4, text: 'TOLD YOU', size: 0.5, color: '#ffd27a', alpha: 0.45, rot: -6 },
      { type: 'deco', kind: 'skull', x: 70.6, y: 12 },

      /* ---------- checkpoint 3 / the thwomps --------------------------- */
      { type: 'deco', kind: 'torch', x: 75.2, y: 10 },
      { type: 'sign', x: 77.4, y: 10, text: 'They only fall for people who come close. So come close, then do not be there.' },
      { type: 'thwomp', x: 80, y: 5, w: 2, h: 2, drop: 8, triggerW: 2, shake: 0.4, rest: 1.1, riseSpeed: 2.4 },
      { type: 'thwomp', x: 84, y: 5, w: 2, h: 2, drop: 8, triggerW: 2, shake: 0.4, rest: 1.1, riseSpeed: 2.4 },
      { type: 'thwomp', x: 88, y: 5, w: 2, h: 2, drop: 8, triggerW: 2, shake: 0.4, rest: 1.1, riseSpeed: 2.4 },

      /* ---------- the last crumbles / the door ------------------------- */
      { type: 'sign', x: 90.4, y: 10, text: 'Last stones. They are already falling.' },
      { type: 'deco', kind: 'torch', x: 98.4, y: 10 },
      { type: 'deco', kind: 'flag', x: 99.3, y: 10 },
      { type: 'deco', kind: 'torch', x: 101.5, y: 10 },
      { type: 'text', x: 97, y: 7, w: 6, text: 'FAITH', size: 0.9, color: '#ffe3b0', alpha: 0.4 }
    ],

    onLoad: function () {
      seen = {};
    },

    onUpdate: function (RT) {
      var p = RT.player;
      if (!p || p.dead) return;
      var tx = (p.x + p.w / 2) / T;

      if (!seen.drop && !p.onGround && tx > 66.4 && tx < 69.5) {
        seen.drop = 1;
        RT.speech(p.x + 10, p.y - 14, 'there is no floor...', 1.5);
      }
      if (!seen.tunnel && p.y > 12.2 * T && tx > 67.5 && tx < 74) {
        seen.tunnel = 1;
        RT.toast('FAITH REWARDED', 1.6);
        RT.Audio.sfx('powerup');
        RT.particles.burst(p.x + p.w / 2, p.y + p.h, {
          n: 22, colors: ['#ffd27a', '#ffffff', '#ff9a3c'], speed: 180, life: 0.7, size: 3, gravity: 320
        });
      }
      if (!seen.thwomp && tx > 78 && tx < 80) {
        seen.thwomp = 1;
        RT.toast('DO NOT STAND UNDER THEM', 1.4);
      }
    },

    onDeath: function (RT, cause) {
      seen.drop = 0;
      if (cause === 'lava') RT.toast('the caldera keeps what it catches', 1.3);
      else if (cause === 'spikes') RT.toast('that one was real. and sharp.', 1.3);
      else if (cause === 'thwomp') RT.toast('too close, too slow', 1.3);
    },

    onWin: function (RT) {
      RT.flash('#ffd27a', 0.35);
      RT.cam.shake(5, 0.4);
    },

    /* ---------------------------------------------------------------------
     * Bespoke art. `g` is already in world space.
     * back  = the dead colonnade, the magma horizon and the watching face.
     * front = heat shimmer off the lava, rising sparks, falling ash.
     * ------------------------------------------------------------------- */
    onDraw: function (RT, g, layer) {
      var vw = RT.view.w, vh = RT.view.h;
      var cx = RT.cam.x, cy = RT.cam.y;
      var x0 = cx - vw / 2, x1 = cx + vw / 2;
      var y0 = cy - vh / 2, y1 = cy + vh / 2;
      var t = RT.time, i, n, px2, a;

      if (layer === 'back') {
        /* --- the caldera burning below the whole level ------------------ */
        var gr = g.createLinearGradient(0, LAVA_Y - 260, 0, LAVA_Y + 48);
        gr.addColorStop(0, 'rgba(255,90,20,0)');
        gr.addColorStop(0.62, 'rgba(255,104,28,0.13)');
        gr.addColorStop(1, 'rgba(255,186,96,0.34)');
        g.fillStyle = gr;
        g.fillRect(x0 - 48, LAVA_Y - 260, vw + 96, 308);

        /* --- far colonnade, deep parallax ------------------------------- */
        var par = 0.30, sp = 118;
        var i0 = Math.floor((((x0 - 160) - cx * (1 - par)) / par) / sp);
        var i1 = Math.ceil((((x1 + 160) - cx * (1 - par)) / par) / sp);
        if (i1 - i0 > 40) i1 = i0 + 40;
        for (i = i0; i <= i1; i++) {
          px2 = parX(cx, i * sp, par);
          column(g, px2, LAVA_Y - 6, 84 + h1(i) * 74, 17 + h1(i + 9) * 7,
            'rgba(44,17,13,0.85)', 'rgba(22,8,6,0.55)', 'rgba(255,122,44,0.18)');
        }

        /* --- the watcher, carved into the wall behind the drop ---------- */
        px2 = parX(cx, 70 * T, 0.52);
        if (px2 > x0 - 240 && px2 < x1 + 240) watcher(g, px2, cy - 34, 0.92, t);

        /* --- near colonnade, toppling ----------------------------------- */
        par = 0.58; sp = 86;
        i0 = Math.floor((((x0 - 120) - cx * (1 - par)) / par) / sp);
        i1 = Math.ceil((((x1 + 120) - cx * (1 - par)) / par) / sp);
        if (i1 - i0 > 40) i1 = i0 + 40;
        for (i = i0; i <= i1; i++) {
          if (h1(i + 31) < 0.42) continue;
          px2 = parX(cx, i * sp, par);
          g.save();
          g.translate(px2, LAVA_Y + 4);
          g.rotate((h1(i + 77) - 0.5) * 0.24);
          column(g, 0, 0, 58 + h1(i + 3) * 58, 14 + h1(i + 5) * 6,
            'rgba(26,9,7,0.92)', 'rgba(10,3,3,0.6)', 'rgba(255,146,58,0.30)');
          g.restore();
        }

        /* --- carved "stay down" glyphs along the low road --------------- */
        for (i = 0; i < 4; i++) {
          px2 = (43 + i * 3) * T + 16;
          if (px2 > x0 - 40 && px2 < x1 + 40) {
            glyphDown(g, px2, 9.55 * T, 0.14 + 0.07 * Math.sin(t * 2 + i));
          }
        }
        return;
      }

      /* ------------------------------ front ---------------------------- */

      /* heat shimmer coming off the lava sea */
      g.globalAlpha = 1;
      for (i = 0; i < 5; i++) {
        a = 0.055 + 0.03 * Math.sin(t * 1.7 + i * 1.3);
        g.fillStyle = 'rgba(255,146,60,' + a.toFixed(3) + ')';
        var yy = LAVA_Y - 16 - i * 17 + Math.sin(t * 0.9 + i) * 5;
        g.beginPath();
        g.moveTo(x0 - 40, yy + 9);
        for (n = 0; n <= 10; n++) {
          var xx = x0 - 40 + (vw + 80) * (n / 10);
          g.lineTo(xx, yy + Math.sin(t * 2.1 + n * 0.8 + i) * 4.5);
        }
        g.lineTo(x1 + 40, yy + 11);
        g.closePath();
        g.fill();
      }

      /* sparks rising out of the sea */
      for (i = 0; i < 34; i++) {
        var life = ((t * (0.22 + h1(i) * 0.2) + h1(i + 40)) % 1);
        var sx = (h1(i + 11) * 103) * T + Math.sin(t * 1.4 + i) * 11;
        if (sx < x0 - 30 || sx > x1 + 30) continue;
        var sy = LAVA_Y + 10 - life * 250;
        if (sy < y0 - 20 || sy > y1 + 20) continue;
        a = (1 - life) * 0.75;
        g.fillStyle = 'rgba(255,' + Math.round(150 + 90 * (1 - life)) + ',80,' + a.toFixed(3) + ')';
        g.fillRect(sx, sy, 2.2, 2.2 + (1 - life) * 2);
      }

      /* ash falling through the whole caldera */
      for (i = 0; i < 26; i++) {
        var fl = ((t * (0.07 + h1(i + 60) * 0.06) + h1(i + 5)) % 1);
        var ax = (h1(i + 21) * 103) * T + Math.sin(t * 0.6 + i * 2) * 26;
        if (ax < x0 - 30 || ax > x1 + 30) continue;
        var ay = fl * (14 * T);
        if (ay < y0 - 20 || ay > y1 + 20) continue;
        g.fillStyle = 'rgba(232,214,200,' + (0.10 + h1(i + 90) * 0.14).toFixed(3) + ')';
        g.fillRect(ax, ay, 2, 2);
      }

      /* a low, hot haze pressed against the bottom of the screen */
      var gf = g.createLinearGradient(0, y1 - 64, 0, y1 + 2);
      gf.addColorStop(0, 'rgba(120,20,6,0)');
      gf.addColorStop(1, 'rgba(150,30,8,0.20)');
      g.fillStyle = gf;
      g.fillRect(x0 - 8, y1 - 64, vw + 16, 66);
    }
  });
})();
