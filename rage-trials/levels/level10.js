/* =========================================================================
 * RAGE TRIALS - LEVEL 10: THE LAST TRIAL
 * -------------------------------------------------------------------------
 * The finale. Four movements and then an arcade cabinet.
 *
 *   I.   LUCK     cols   0- 55   chance doors, a 50/50 bridge, a slot gate
 *                                and one rigged door, all BOUNDED by the four
 *                                techniques in docs/research-troll.md SS4.3:
 *                                  (a) the odds are painted on the object,
 *                                  (b) pity - the 4th attempt is always safe
 *                                      and the object turns gold to say so,
 *                                  (c) every gate has a skill bypass that is
 *                                      harder to execute (crumbling ledges),
 *                                  (d) losing costs TIME, never progress -
 *                                      a checkpoint sits on every lip.
 *   II.  TYCOON   cols  56-115   RT.Tycoon, funded by an obby lap. THE
 *                                CIRCUIT climbs six rungs east-to-west over
 *                                the lava to a PAYOUT PLATE; each lap pays
 *                                1.6x the last, capped at 900. The dropper is
 *                                a trickle, not a plan. Ladder: 100 / 300 /
 *                                500 / 900 / 1500, and a lava line that climbs
 *                                over the floor every 11 s while you run it.
 *   III. TROLLS   cols 116-195   beat blocks over the void with one liar in
 *        + SKILL                 them, a thwomp corridor with pop-out spikes,
 *                                a crumble staircase, a laser maze with six
 *                                reversed tiles, a four-gap precision run,
 *                                and a fake goal at the end of it.
 *   IV.  ARCADE   cols 196-219   one screen higher. An actual cabinet.
 *                                RT.Tetris.start({level:28, linesToWin:10}).
 *                                Ten lines on NES level 28 wins the game.
 *
 * Grid: 220 x 20. Movements I-II walk on row 13 (slab rows 13-19);
 * movement III is a thin row-8 catwalk over the void; movement IV is a
 * row-3 gantry above it. Topping out in Tetris restarts TETRIS, never the
 * level - the cabinet is the checkpoint.
 * ========================================================================= */
(function () {
  var RT = window.RT;
  if (!RT) return;

  var T = 32;
  var W = 220, H = 20;
  var GROUND = 13;          /* movements I and II */
  var CATWALK = 8;          /* movement III */

  function h1(i) { var s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s); }

  /* ------------------------------------------------------------- helpers */
  function P() { return RT.player; }
  function pcx() { var p = P(); return p.x + p.w / 2; }
  function pcy() { var p = P(); return p.y + p.h / 2; }
  function ptx() { return pcx() / T; }
  function alive() { var p = P(); return p && !p.dead; }
  function pbox(i) { var p = P(); i = i === undefined ? 3 : i; return { x: p.x + i, y: p.y + i, w: p.w - i * 2, h: p.h - i * 2 }; }
  function hitP(x, y, w, h, i) { return alive() && RT.overlaps(pbox(i), { x: x, y: y, w: w, h: h }); }
  function sfx(n) { if (RT.sfx) RT.sfx(n); }
  function boom(x, y, cols, n, sp, o) {
    o = o || {};
    RT.particles.burst(x, y, {
      n: n || 18, colors: cols || ['#ffffff'], speed: sp || 200, life: o.life || 0.6,
      size: o.size || 3, gravity: o.gravity === undefined ? 380 : o.gravity,
      spreadX: o.spreadX || 0, spreadY: o.spreadY || 0
    });
  }
  function rr(g, x, y, w, h, r, fill) { RT.roundRect(g, x, y, w, h, r); g.fillStyle = fill; g.fill(); }
  function circ(g, x, y, r, fill) { g.beginPath(); g.arc(x, y, r, 0, 6.2832); g.fillStyle = fill; g.fill(); }
  function poly(g, pts, fill) {
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (var i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath(); g.fillStyle = fill; g.fill();
  }
  function log(where, err) {
    try { (window.__entityErrors || (window.__entityErrors = [])).push(where + ': ' + (err && err.message || err)); } catch (e) { }
  }
  function def(name, spec) {
    RT.defineEntity(name, {
      layer: spec.layer || 'main',
      solid: spec.solid || false,
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
      onReset: function (e) {
        if (e.home) { e.x = e.home.x; e.y = e.home.y; e.w = e.home.w; e.h = e.home.h; }
        e.at = 0;
        if (spec.reset) { try { spec.reset(e); } catch (x) { log(name + '.reset', x); } }
      }
    });
  }
  var PARK = -1e6;
  /* test-only diagnostic, never read by the game */
  function expose() { try { window.__L10 = L; } catch (e) { } }

  /* ==================================================================== */
  /* LEVEL STATE                                                          */
  /* ==================================================================== */
  var L = {};               /* survives death, reset on load */
  var S = {};               /* per life */
  var luckRng = 1;          /* our own generator: never disturbs RT.random() */
  function lrand() { luckRng = (luckRng * 1664525 + 1013904223) % 4294967296; return luckRng / 4294967296; }

  function resetState() {
    L = {
      doorTries: 0, doorOpen: 0, doorPick: 0,
      bridgeFalls: 0, bridgeSeed: 1,
      spins: 0, gateOpen: 0,
      rigTries: 0, rigOpen: 0,
      tycoonOn: 0, lastDeaths: 0,
      laps: 0, plateArmed: 1, lapBest: 0, lapT: 0,
      arcadeTries: 0, movement: 1
    };
    S = {};
    luckRng = 20260921;
  }

  /* the 50/50 bridge re-rolls per attempt, but the roll is a SEED, so a life
   * is deterministic from the moment it starts (research SS2.4). */
  var BRIDGE_PATTERNS = [
    [0, 1, 0, 1], [1, 0, 1, 0], [0, 0, 1, 1], [1, 1, 0, 0], [1, 0, 0, 1], [0, 1, 1, 0]
  ];
  function rollBridge() {
    L.bridgePick = BRIDGE_PATTERNS[(L.bridgeFalls || 0) % BRIDGE_PATTERNS.length];
  }

  /* ==================================================================== */
  /* MOVEMENT I - the luck furniture                                      */
  /* ==================================================================== */

  /* --- chance door: odds painted on, pity on the 4th, bounce costs 2 s -- */
  def('lXdoor', {
    init: function (e, d) {
      e.w = T; e.h = T * 2;
      e.idx = d.idx || 0;
      e.odds = d.odds || 50;
      e.cool = 0; e.flash = 0; e.open = 0;
    },
    update: function (e, dt) {
      if (e.cool > 0) e.cool -= dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.open > 0 && e.open < 1) e.open = Math.min(1, e.open + dt * 5);
      if (L.doorOpen || e.cool > 0) return;
      if (!hitP(e.x + 2, e.y + 2, e.w - 4, e.h - 4, 2)) return;

      /* which door is the good one this attempt - weighted by the painted
       * odds, and FORCED to the golden one once pity has kicked in */
      if (L.doorTries === 0 || L.doorPickFor !== L.doorTries) {
        L.doorPickFor = L.doorTries;
        if (L.doorTries >= 3) L.doorPick = 0;         /* hard pity: door A */
        else {
          var r = lrand() * 100;
          L.doorPick = r < 50 ? 0 : (r < 75 ? 1 : 2);
        }
      }
      if (e.idx === L.doorPick) {
        L.doorOpen = 1; e.open = 0.001;
        for (var ty = 9; ty <= 12; ty++) RT.setTile(18, ty, '.');
        sfx('door'); sfx('win');
        RT.flash('#bfffd0', 0.14);
        RT.toast('the wall is open. that took ' + (L.doorTries + 1) + ' ' +
          (L.doorTries ? 'attempts' : 'attempt') + '.', 2.2);
        boom(e.x + e.w / 2, e.y + e.h / 2, ['#8dff9a', '#ffffff'], 26, 220);
      } else {
        L.doorTries++;
        e.cool = 1.2; e.flash = 0.5;
        sfx('bonk'); sfx('troll');
        RT.cam.shake(4, 0.2);
        var p = P();
        p.x = Math.max(T, p.x - T * 3.4); p.vx = 0; p.vy = 0;
        RT.speech(e.x + e.w / 2, e.y - 8, 'no', 0.9);
        if (L.doorTries === 3) RT.toast('three misses. the next one is guaranteed - look for the gold.', 2.6);
        else RT.toast('unlucky. two seconds, not two minutes.', 1.5);
      }
    },
    reset: function (e) { e.cool = 0; e.flash = 0; if (!L.doorOpen) e.open = 0; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h;
      var pity = (L.doorTries >= 3 && e.idx === 0);
      rr(g, x - 3, y - 4, w + 6, hh + 5, 5, pity ? '#a9852b' : '#4a3a5c');
      var sw = e.open > 0 ? Math.max(0.06, 1 - e.open) : 1;
      g.save();
      g.translate(x + 1, y);
      g.scale(sw, 1);
      rr(g, 0, 0, w - 2, hh - 1, 4, pity ? '#ffd23f' : (e.flash > 0 ? '#ff6b8b' : '#c8b6e2'));
      rr(g, 2, 2, w - 6, (hh - 1) * 0.4, 3, 'rgba(255,255,255,0.28)');
      g.restore();
      circ(g, x + w - 8, y + hh * 0.56, 3, '#ffe9a8');
      RT.drawText(g, e.odds + '%', x + w / 2, y - 12, {
        size: 12, color: pity ? '#fff0b0' : '#ffffff', stroke: 'rgba(30,10,40,0.85)', strokeWidth: 3
      });
      if (pity) {
        RT.drawText(g, 'OWED', x + w / 2, y - 26 + Math.sin(e.at * 5) * 2, {
          size: 9, color: '#ffd23f', stroke: 'rgba(30,10,40,0.85)', strokeWidth: 3
        });
      }
    }
  });

  /* --- 50/50 bridge pad: one of each pair is real ----------------------- */
  def('lXpad', {
    solid: true,
    init: function (e, d) {
      e.dw = T * 1.9; e.dh = T * 0.6;
      e.w = e.dw; e.h = e.dh;
      e.station = d.station || 0;
      e.upper = !!d.upper;
      e.rest = { x: e.x, y: e.y };
      e.real = true; e.shown = 0;
      applyPad(e);
    },
    update: function (e, dt) {
      if (e.shown > 0) e.shown = Math.max(0, e.shown - dt * 2);
      if (e.real) return;
      /* a fake pad is not solid; it is parked, and it says so the moment
       * you are standing where it used to be */
      if (hitP(e.rest.x, e.rest.y - 4, e.dw, e.dh + 10, 2) && !e.told) {
        e.told = 1;
        sfx('fake');
        boom(e.rest.x + e.w / 2, e.rest.y, ['#ff6b8b', '#ffffff'], 14, 150, { gravity: 300 });
      }
    },
    reset: function (e) { e.told = 0; applyPad(e); },
    draw: function (e, g) {
      var x = e.rest.x, y = e.rest.y, w = e.dw, hh = e.dh;
      var seam = L.bridgeFalls >= 2;   /* pity: after two falls the real ones seam */
      g.globalAlpha = e.real ? 1 : (e.told ? 0.18 : 1);
      rr(g, x, y, w, hh, 4, '#6f5fa8');
      rr(g, x + 2, y + 2, w - 4, hh * 0.44, 3, '#a596d8');
      g.globalAlpha = 1;
      if (seam && e.real && !e.told) {
        g.fillStyle = 'rgba(180,255,190,0.85)';
        g.fillRect(x + 3, y + hh - 3, w - 6, 2);
      }
      RT.drawText(g, '1/2', x + w / 2, y - 9, {
        size: 9, color: '#e8ddff', stroke: 'rgba(25,10,40,0.8)', strokeWidth: 3, alpha: 0.9
      });
    }
  });
  function applyPad(e) {
    var pick = (L.bridgePick || [])[e.station] ? true : false;
    e.real = (pick === e.upper);
    e.x = e.rest.x; e.y = e.rest.y;
    e.w = e.real ? e.dw : 0;
    e.h = e.real ? e.dh : 0;
  }
  function reseatBridge() {
    var pads = RT.find('lXpad');
    for (var i = 0; i < pads.length; i++) { pads[i].told = 0; applyPad(pads[i]); }
  }

  /* --- the slot gate: three reels, a payout table, a guaranteed 4th spin */
  def('lXslot', {
    init: function (e) {
      e.w = T * 2; e.h = T * 2;
      e.reels = [0, 1, 2];
      e.spin = 0; e.hold = 0;
    },
    update: function (e, dt) {
      if (L.gateOpen) return;
      if (e.spin > 0) {
        e.spin -= dt;
        if (e.spin > 0) {
          for (var i = 0; i < 3; i++) if (e.spin > 0.35 * i) e.reels[i] = Math.floor(e.at * (17 + i * 5)) % 4;
          return;
        }
        /* land it */
        var win = (L.spins >= 3);                 /* hard pity: spin 4 always pays */
        if (!win) win = lrand() < 0.34;
        if (win) { e.reels = [1, 1, 1]; openGate(e); }
        else {
          e.reels = [Math.floor(lrand() * 4), Math.floor(lrand() * 4), Math.floor(lrand() * 4)];
          if (e.reels[0] === e.reels[1] && e.reels[1] === e.reels[2]) e.reels[2] = (e.reels[2] + 1) % 4;
          L.spins++;
          sfx('bonk');
          RT.toast(L.spins >= 3 ? 'no match. the next spin is guaranteed.' : 'no match. spin again - it is free.', 1.8);
        }
        return;
      }
      if (!hitP(e.x - 8, e.y, e.w + 16, e.h + 8, 2)) { e.hold = 0; return; }
      e.hold += dt;
      if ((RT.input && RT.input.actionPressed) || e.hold > 0.5) {
        e.spin = 1.3;
        e.hold = -0.5;
        sfx('charge');
        if (RT.consumeAction) RT.consumeAction();
      }
    },
    reset: function (e) { e.spin = 0; e.hold = 0; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h, i;
      rr(g, x, y, w, hh, 6, L.gateOpen ? '#3f7a52' : '#5b3a6e');
      rr(g, x + 3, y + 3, w - 6, hh * 0.42, 4, '#1b1226');
      var syms = ['7', '$', 'X', '?'];
      var cols = ['#ffd23f', '#8dff9a', '#ff6b8b', '#9ad4ff'];
      for (i = 0; i < 3; i++) {
        var rx = x + 6 + i * ((w - 12) / 3);
        rr(g, rx, y + 6, (w - 12) / 3 - 3, hh * 0.36, 3, '#0d0814');
        RT.drawText(g, syms[e.reels[i] % 4], rx + ((w - 12) / 3 - 3) / 2, y + 6 + hh * 0.18, {
          size: 15, color: cols[e.reels[i] % 4]
        });
      }
      RT.drawText(g, L.gateOpen ? 'PAID' : (L.spins >= 3 ? 'NEXT SPIN PAYS' : '3 OF A KIND OPENS'),
        x + w / 2, y + hh * 0.62, { size: 8, color: '#ffe9a8', stroke: 'rgba(20,8,30,0.8)', strokeWidth: 3 });
      RT.drawText(g, '34%', x + w / 2, y - 10, {
        size: 11, color: '#ffffff', stroke: 'rgba(20,8,30,0.85)', strokeWidth: 3
      });
      /* the lever */
      var la = e.spin > 0 ? 0.9 : 0.15;
      g.save();
      g.translate(x + w + 2, y + hh * 0.35);
      g.rotate(la);
      g.fillStyle = '#c8c8d4'; g.fillRect(-2, 0, 4, 20);
      circ(g, 0, 22, 5, '#ff4d4d');
      g.restore();
    }
  });
  function openGate(e) {
    L.gateOpen = 1;
    for (var ty = 9; ty <= 12; ty++) RT.setTile(44, ty, '.');
    sfx('win'); sfx('cash');
    RT.flash('#ffe9a8', 0.16);
    RT.cam.shake(5, 0.3);
    boom(e.x + e.w / 2, e.y + e.h / 2, ['#ffd23f', '#ffffff', '#8dff9a'], 40, 280, { life: 0.9, size: 4 });
    RT.toast('THREE SEVENS. The gate is open.', 2.2);
  }

  /* --- the rigged 99% door: lies once, then keeps its word forever ------ */
  def('lXrig', {
    solid: true,
    init: function (e) { e.w = T; e.h = T * 4; e.rest = { x: e.x, y: e.y }; e.open = 0; e.cool = 0; },
    update: function (e, dt) {
      if (e.cool > 0) e.cool -= dt;
      if (L.rigOpen) { e.x = PARK; e.y = PARK; return; }
      e.x = e.rest.x; e.y = e.rest.y;
      if (e.cool > 0) return;
      if (!hitP(e.x - 6, e.y, e.w + 12, e.h, 2)) return;
      e.cool = 1.0;
      L.rigTries++;
      if (L.rigTries >= 2) {
        L.rigOpen = 1;
        sfx('door'); sfx('win');
        RT.toast('there it is. it will never lie to you again.', 2.4);
        boom(e.rest.x + e.w / 2, e.rest.y + e.h / 2, ['#ffd23f', '#ffffff'], 30, 240, { spreadY: e.h });
      } else {
        sfx('troll'); sfx('fake');
        RT.cam.shake(6, 0.3);
        RT.flash('#ff9ab8', 0.12);
        RT.toast('99%. That was the 1%. It will work next time.', 2.4);
        RT.speech(e.rest.x + T / 2, e.rest.y - 8, '1%', 1.2);
      }
    },
    reset: function (e) { e.cool = 0; },
    draw: function (e, g) {
      if (L.rigOpen) return;
      var x = e.rest.x, y = e.rest.y, w = e.w, hh = e.h;
      rr(g, x - 3, y - 3, w + 6, hh + 4, 5, '#4a3a5c');
      rr(g, x, y, w, hh, 4, '#d4b45c');
      rr(g, x + 2, y + 2, w - 4, hh * 0.25, 3, 'rgba(255,255,255,0.25)');
      circ(g, x + w - 8, y + hh * 0.52, 3, '#ffe9a8');
      RT.drawText(g, '99%', x + w / 2, y - 12, {
        size: 13, color: '#ffe9a8', stroke: 'rgba(30,10,40,0.85)', strokeWidth: 3
      });
    }
  });

  /* ==================================================================== */
  /* MOVEMENT II - the arena that attacks while you shop                  */
  /* ==================================================================== */
  def('lXlava', {
    layer: 'front',
    init: function (e, d) {
      e.x0 = (d.x0 === undefined ? 58 : d.x0) * T;
      e.x1 = (d.x1 === undefined ? 79 : d.x1) * T;
      e.low = (d.low === undefined ? 14.2 : d.low) * T;
      e.high = (d.high === undefined ? 12.4 : d.high) * T;
      e.period = d.period === undefined ? 11 : d.period;
      e.up = d.up === undefined ? 3.6 : d.up;
      e.w = 1; e.h = 1; e.x = e.x0; e.y = e.low;
      e.surf = e.low;
    },
    update: function (e, dt) {
      var t = e.at % e.period;
      var k;
      if (t < e.period - e.up - 1.4) k = 0;
      else if (t < e.period - e.up) k = (t - (e.period - e.up - 1.4)) / 1.4;
      else if (t < e.period - 0.9) k = 1;
      else k = 1 - (t - (e.period - 0.9)) / 0.9;
      k = Math.max(0, Math.min(1, k));
      e.surf = e.low + (e.high - e.low) * k;
      e.k = k;
      if (k > 0.05 && alive()) {
        var p = P();
        if (p.x + p.w > e.x0 && p.x < e.x1 && p.y + p.h > e.surf + 3) RT.killPlayer('lava');
      }
      if (k > 0.1 && RT.frame % 7 === 0) {
        var ex = e.x0 + Math.random() * (e.x1 - e.x0);
        RT.particles.burst(ex, e.surf, {
          n: 1, colors: ['#ff7a24', '#ffd23f'], speed: 60, life: 0.7, size: 3, gravity: -40
        });
      }
    },
    reset: function (e) { e.at = 0; },
    draw: function (e, g) {
      if (!(e.k > 0.02)) return;
      var y = e.surf, w = e.x1 - e.x0;
      g.save();
      var lg = g.createLinearGradient(0, y, 0, y + 90);
      lg.addColorStop(0, 'rgba(255,196,80,0.95)');
      lg.addColorStop(0.35, 'rgba(255,110,30,0.92)');
      lg.addColorStop(1, 'rgba(140,20,10,0.9)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(e.x0, y + 4);
      for (var x = e.x0; x <= e.x1; x += 8) g.lineTo(x, y + Math.sin(x * 0.07 + e.at * 3.4) * 3);
      g.lineTo(e.x1, y + 120); g.lineTo(e.x0, y + 120);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,240,180,0.85)';
      g.fillRect(e.x0, y - 1, w, 2);
      g.restore();
    }
  });

  /* --- THE ELEVATOR: waits at the bottom, rises when ridden ------------ */
  def('lXlift', {
    solid: true,
    init: function (e, d) {
      e.w = T * (d.w === undefined ? 3 : d.w); e.h = T * 0.6;
      e.bottom = (d.bottom === undefined ? 12 : d.bottom) * T;
      e.top = (d.top === undefined ? 8 : d.top) * T;
      e.y = e.bottom; e.rest = { x: e.x, y: e.bottom };
      e.phase = 'down'; e.hold = 0;
    },
    update: function (e, dt) {
      var p = P(), on = alive() && p.onGround && p.rideEnt === e;
      if (e.phase === 'down') {
        e.y = e.bottom;
        if (on) { e.phase = 'up'; sfx('powerup'); RT.toast('going up', 1.4); }
        return;
      }
      if (e.phase === 'up') {
        e.y = Math.max(e.top, e.y - 96 * dt);
        if (e.y <= e.top) { e.phase = 'held'; e.hold = 4.5; }
        return;
      }
      if (e.phase === 'held') {
        e.y = e.top;
        e.hold -= dt;
        if (e.hold <= 0 && !on) e.phase = 'back';
        return;
      }
      e.y = Math.min(e.bottom, e.y + 96 * dt);
      if (e.y >= e.bottom) e.phase = 'down';
    },
    reset: function (e) { e.phase = 'down'; e.y = e.bottom; e.hold = 0; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h;
      rr(g, x, y, w, hh, 4, '#ffd23f');
      rr(g, x + 2, y + 2, w - 4, hh * 0.4, 3, '#fff0b0');
      g.fillStyle = 'rgba(90,60,10,0.4)';
      g.fillRect(x + 2, y + hh - 3, w - 4, 3);
      RT.drawText(g, 'UP', x + w / 2, y + hh * 0.45, { size: 9, color: 'rgba(60,40,5,0.65)' });
      /* the shaft it runs in */
      g.globalAlpha = 0.16;
      g.fillStyle = '#ffd23f';
      g.fillRect(x + 4, e.top, w - 8, e.bottom - e.top + hh);
      g.globalAlpha = 1;
    }
  });

  /* ==================================================================== */
  /* MOVEMENT III - the beat block that is a liar                         */
  /* ==================================================================== */
  def('lXbeat', {
    solid: true,
    init: function (e, d) {
      e.dw = T * (d.w === undefined ? 2 : d.w); e.dh = T * 0.6;
      e.w = e.dw; e.h = e.dh;
      e.rest = { x: e.x, y: e.y };
      e.grp = (d.group || 'A').toUpperCase();
      e.period = d.period === undefined ? 1.9 : d.period;
      e.fake = !!d.fake;
      e.on = false;
      e.bt = 0; e.armed = false;
      e.wake = (d.wake === undefined ? (e.x / T) - 5 : d.wake) * T;
    },
    update: function (e, dt) {
      if (!e.armed) {
        if (!alive() || pcx() < e.wake) { e.w = e.dw; e.h = e.dh; e.on = true; return; }
        e.armed = true; e.bt = 0;
      }
      e.bt += dt;
      var ph = (e.bt % e.period) / e.period;
      var on = (e.grp === 'A') ? (ph < 0.58) : (ph >= 0.42);
      e.on = on;
      e.warn = (e.grp === 'A') ? (ph > 0.5 && ph < 0.58) : (ph > 0.92 || ph < 0.05);
      var solidNow = on && !e.fake;
      e.x = e.rest.x; e.y = e.rest.y;
      e.w = solidNow ? e.dw : 0;
      e.h = solidNow ? e.dh : 0;
      if (e.fake && on && !e.told && hitP(e.rest.x, e.rest.y - 6, e.w, e.h + 12, 2)) {
        e.told = 1; sfx('fake'); sfx('troll');
      }
    },
    reset: function (e) { e.at = 0; e.bt = 0; e.armed = false; e.told = 0; e.w = e.dw; e.h = e.dh; },
    draw: function (e, g) {
      var x = e.rest.x, y = e.rest.y, w = e.dw, hh = e.dh;
      var lit = e.on;
      g.globalAlpha = lit ? 1 : 0.22;
      rr(g, x, y, w, hh, 4, e.grp === 'A' ? '#3df0ff' : '#ff3ea5');
      rr(g, x + 2, y + 2, w - 4, hh * 0.42, 3, 'rgba(255,255,255,0.4)');
      g.globalAlpha = 1;
      if (e.warn) {
        g.globalAlpha = 0.6 + Math.sin(e.at * 40) * 0.3;
        g.strokeStyle = '#ffffff'; g.lineWidth = 2;
        RT.roundRect(g, x - 1, y - 1, w + 2, hh + 2, 5); g.stroke();
        g.globalAlpha = 1;
      }
      RT.drawText(g, e.grp, x + w / 2, y + hh / 2, {
        size: 10, color: 'rgba(0,0,0,0.5)'
      });
    }
  });

  /* ==================================================================== */
  /* MOVEMENT IV - the cabinet                                            */
  /* ==================================================================== */
  def('lXarcade', {
    init: function (e) { e.w = T * 2; e.h = T * 3; e.glow = 0; e.cool = 0; },
    update: function (e, dt) {
      if (e.cool > 0) e.cool -= dt;
      var near = hitP(e.x - T, e.y, e.w + T * 2, e.h + T, 2);
      e.glow += ((near ? 1 : 0) - e.glow) * Math.min(1, dt * 6);
      if (!near || e.cool > 0) return;
      if (!RT.Tetris || !RT.Tetris.start) return;
      if (RT.getMode && RT.getMode()) return;
      var go = (RT.input && RT.input.actionPressed) || e.dwell > 0.8;
      e.dwell = near ? (e.dwell || 0) + dt : 0;
      if (!go) return;
      e.cool = 1.2; e.dwell = 0;
      startTetris();
    },
    reset: function (e) { e.cool = 0; e.dwell = 0; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h;
      /* cabinet body */
      rr(g, x, y, w, hh, 5, '#2a2340');
      rr(g, x + 2, y + 2, w - 4, hh - 4, 4, '#3b3159');
      /* screen */
      var sx = x + 6, sy = y + 8, sw = w - 12, sh = hh * 0.42;
      rr(g, sx, sy, sw, sh, 3, '#07060d');
      g.save();
      g.globalAlpha = 0.55 + e.glow * 0.4;
      for (var i = 0; i < 7; i++) {
        var bx = sx + 3 + (i % 4) * (sw - 8) / 4;
        var by = sy + 4 + ((i * 7 + Math.floor(e.at * 2)) % 5) * (sh - 10) / 5;
        g.fillStyle = ['#3df0ff', '#ffd23f', '#ff3ea5', '#5bff9b'][i % 4];
        g.fillRect(bx, by, (sw - 8) / 4 - 2, (sh - 10) / 5 - 2);
      }
      g.restore();
      /* marquee */
      rr(g, x + 3, y + 2, w - 6, 9, 2, '#ffd23f');
      RT.drawText(g, 'TETRIS', x + w / 2, y + 6.5, { size: 7, color: '#2a2340' });
      /* controls */
      rr(g, sx, y + hh * 0.58, sw, hh * 0.16, 3, '#1c1730');
      circ(g, sx + 9, y + hh * 0.66, 4, '#ff4d4d');
      circ(g, sx + 21, y + hh * 0.66, 4, '#3df0ff');
      /* coin slot glow */
      g.globalAlpha = 0.25 + e.glow * 0.6 + Math.sin(e.at * 3) * 0.08;
      circ(g, x + w / 2, y + hh * 0.86, 10, '#ffd23f');
      g.globalAlpha = 1;
      if (e.glow > 0.2) {
        RT.drawText(g, RT.isTouch && RT.isTouch() ? 'TAP ACTION' : 'PRESS E', x + w / 2, y - 14, {
          size: 11, color: '#ffe9a8', stroke: 'rgba(20,10,30,0.9)', strokeWidth: 3, alpha: e.glow
        });
        RT.drawText(g, 'LEVEL 28  -  10 LINES', x + w / 2, y - 28, {
          size: 9, color: '#9ad4ff', stroke: 'rgba(20,10,30,0.9)', strokeWidth: 3, alpha: e.glow
        });
      }
    }
  });

  var TAUNTS = [
    'Level 28. Two frames per cell. Again.',
    'The blocks are not the problem. The blocks are never the problem.',
    'You have beaten nine trials to get shouted at by a 1989 arcade machine.',
    'Ten lines. That is all anyone is asking.',
    'It does not get faster. That is the good news.'
  ];

  function startTetris() {
    L.arcadeTries++;
    sfx('powerup');
    RT.Tetris.start({
      level: 28,
      linesToWin: 10,
      onWin: function () {
        RT.clearMode && RT.clearMode();
        RT.flash('#ffffff', 0.3);
        RT.winLevel();
      },
      onLose: function () {
        RT.toast(TAUNTS[(L.arcadeTries - 1) % TAUNTS.length], 3);
      },
      onQuit: function () {
        RT.toast('the cabinet is still there. it is not going anywhere.', 2.2);
      }
    });
  }

  /* ==================================================================== */
  /* THE TYCOON LADDER (movement II)                                      */
  /* ==================================================================== */
  function run(y, x0, x1, ch) { var a = [], x; for (x = x0; x <= x1; x++) a.push([x, y, ch || '#']); return a; }
  function cat() { var o = [], i, j; for (i = 0; i < arguments.length; i++) for (j = 0; j < arguments[i].length; j++) o.push(arguments[i][j]); return o; }

  var BRIDGE_TILES = cat(run(13, 80, 95));
  

  var ITEMS = [
    { id: 'drop', name: 'THE DROPPER', price: 100, kind: 'dropper', cps: 6,
      x: 59, y: 11, w: 3, h: 1, mx: 57, my: 12, icon: 'dropper', color: '#4ade80',
      desc: 'Six a second. It will not get you there. It stops you starving while you run.' },

    { id: 'shield', name: 'THE SHIELD', price: 300, kind: 'cosmetic', flag: 'shield',
      requires: 'drop', showLocked: true, x: 64, y: 11, w: 3, h: 1, color: '#67e8f9',
      desc: 'One free hit, renewed every life. You will spend it in four seconds.',
      onBuy: function (RT) { RT.player.shield = true; } },

    { id: 'dj', name: 'DOUBLE JUMP', price: 500, kind: 'ability', ability: 'doubleJump',
      requires: 'shield', showLocked: true, x: 69, y: 11, w: 3, h: 1, color: '#3df0ff',
      desc: 'Movement three has a four-tile gap with your name on it.' },

    { id: 'bridge', name: 'THE BRIDGE', price: 900, kind: 'platform', tiles: BRIDGE_TILES,
      requires: 'dj', showLocked: true, x: 74, y: 11, w: 3, h: 1, color: '#fbbf24',
      desc: 'Sixteen tiles of deck over sixteen tiles of lava. You are paying for the absence of a jump.' },

    { id: 'lift', name: 'THE ELEVATOR', price: 1500, kind: 'cosmetic', flag: 'lift',
      requires: 'bridge', showLocked: true, x: 98, y: 12, w: 4, h: 1, icon: 'gate', color: '#ffd23f',
      desc: 'A gold plate that goes up. Out of the arena, into the worst part of the game.' }
  ];

  function ensureLift() {
    if (!L.tycoonOn || !RT.Tycoon || !RT.Tycoon.has || !RT.Tycoon.has('lift')) return;
    var l = RT.find('lXlift'), i;
    for (i = 0; i < l.length; i++) if (l[i].x < 150 * T) return;   /* the arcade has one too */
    RT.spawn({ type: 'lXlift', x: 108.5, y: 12, w: 3, bottom: 12, top: 8 });
  }

  /* THE CIRCUIT --------------------------------------------------------
   * The arena pays for laps, not for waiting. A lap is: up the six rungs
   * east-to-west over the lava, stand on the PAYOUT PLATE at the top, drop
   * back down to the pillars. Each lap pays 1.6x the last, capped, so the
   * first one is a tutorial and the fifth one is real money. */
  var PLATE = { x0: 57, x1: 61, y0: 2, y1: 4 };
  function lapPay(n) { return Math.min(900, Math.round(150 * Math.pow(1.6, n))); }

  function circuit(dt) {
    if (!L.tycoonOn) return;
    var p = P();
    var onPlate = p.x + p.w > PLATE.x0 * T && p.x < PLATE.x1 * T &&
                  p.y + p.h > PLATE.y0 * T && p.y < PLATE.y1 * T;
    var home = p.y + p.h > 11.6 * T && pcx() > 56 * T && pcx() < 80 * T;

    if (L.plateArmed && onPlate) {
      var pay = lapPay(L.laps);
      L.laps++;
      L.plateArmed = 0;
      if (RT.Tycoon && RT.Tycoon.add) RT.Tycoon.add(pay);
      sfx('cash'); sfx('checkpoint');
      RT.flash('#ffe9a8', 0.12);
      RT.cam.shake(3, 0.2);
      boom(pcx(), pcy(), ['#ffd23f', '#fff6c4', '#ffffff'], 26, 220, { life: 0.8 });
      RT.particles.text ? RT.particles.text(pcx(), pcy() - 14, '+' + pay, '#ffd23f', 1.1)
                        : RT.toast('+' + pay, 1.2);
      RT.toast('LAP ' + L.laps + '  -  +' + pay + '.  Next lap pays ' + lapPay(L.laps) + '.', 2.2);
      L.lapT = 0;
    } else if (!L.plateArmed && home) {
      L.plateArmed = 1;
      sfx('tick');
    }
    if (L.plateArmed && !onPlate) L.lapT += dt;
    RT.hud.set('lap', 'LAP ' + (L.laps + 1) + '  +' + lapPay(L.laps));
  }

  function startTycoon() {
    if (L.tycoonOn || !RT.Tycoon || !RT.Tycoon.start) return;
    L.tycoonOn = 1;
    RT.Tycoon.start({
      cash: 0, hudKey: 'cash', coinValue: 7, buyHold: 0.3,
      cashpad: { x: 56.5, y: 12 },
      items: ITEMS,
      onBuy: function (item) {
        RT.banner([item.name, 'BOUGHT'], 1.4);
        if (item.id === 'lift') RT.toast('the elevator is up at 105. movement three is at the top of it.', 3);
      }
    });
    RT.toast('THE CIRCUIT pays for the ladder. The lava does not wait for you.', 3);
  }

  /* ==================================================================== */
  /* THEMES                                                               */
  /* ==================================================================== */
  var ARENA = {
    sky: [[0, '#140a12'], [0.3, '#3a1230'], [0.62, '#7a2a52'], [0.85, '#c9643a'], [1, '#ffb45c']],
    parallax: [
      { kind: 'nebula', color: '#6b1436', color2: '#1a0610', y: 1, speed: 0.03, scale: 1, alpha: 0.5 },
      { kind: 'city', color: '#1a1018', color2: '#2a1a24', y: 0.84, speed: 0.11, scale: 0.4 },
      { kind: 'factory', color: '#241820', color2: '#150d14', y: 1.0, speed: 0.26, scale: 0.42 },
      { kind: 'pipes', color: '#2e1f2a', color2: '#170f16', y: 1.1, speed: 0.5, scale: 0.26 }
    ],
    ambient: 'embers',
    fog: { color: '#ff8a4c', alpha: 0.12 },
    tile: { top: '#5ad1a0', side: '#2f6f5e', dark: '#1a3f36', rim: '#b7ffe4', accent: '#ffd23f' },
    spike: { base: '#ffd9c0', tip: '#ff5a2a' },
    vignette: 0.28
  };

  var GANTRY = {
    sky: [[0, '#05040a'], [0.35, '#160b22'], [0.7, '#3a1444'], [1, '#7a2a52']],
    parallax: [
      { kind: 'stars', color: '#ffffff', y: 0.4, speed: 0.02, scale: 1, alpha: 0.8 },
      { kind: 'nebula', color: '#5a1a6e', color2: '#0d0616', y: 1, speed: 0.04, scale: 1, alpha: 0.55 },
      { kind: 'castle', color: '#150c1c', color2: '#0a0612', y: 0.92, speed: 0.16, scale: 0.44 },
      { kind: 'factory', color: '#1c1226', color2: '#0e0818', y: 1.06, speed: 0.4, scale: 0.3 }
    ],
    ambient: 'ash',
    fog: { color: '#2a1030', alpha: 0.2 },
    tile: { top: '#8f7bd6', side: '#4a3a7a', dark: '#271e46', rim: '#ded0ff', accent: '#3df0ff' },
    spike: { base: '#e8e2ff', tip: '#ff3ea5' },
    vignette: 0.34
  };

  /* ==================================================================== */
  RT.registerLevel(10, {
    name: 'THE LAST TRIAL',
    subtitle: 'Luck, money, trolls, and a 1989 arcade machine',
    theme: 'apocalypse',
    themeZones: [
      { x0: 56, x1: 115, theme: ARENA },
      { x0: 116, x1: 400, theme: GANTRY }
    ],
    music: 'apocalypse',

    tiles: [
      '............................................................................................................................................................................................................................',
      '............................................................................................................................................................................................................................',
      '..........................................................................................................................................................................................................C.................',
      '......................................................................................................................................................................................................######################',
      '.........................................................####.........................................................................................................................................######################',
      '..............................................................###...........................................................................................................................................................',
      '..............KKK.KKK.............................................###.......................................................................................................................................................',
      '......................................................................KKK...............................................C.....................................C.............................................................',
      '............K.............................................................###...................................##########......#################KKKKKKKKKK#########............##...##....#########........................',
      '..................#.......................K.#K...............................###................................##########......#################..........##################...##...##....#########........................',
      '..........K.......#.........................#.......................................................................................................................#########...............................................',
      '..................#......................K..#.................................###...........................................................................................................................................',
      '..P...............#..C............C.........#.......C...C..###..###..###..###...............................C...............................................................................................................',
      '#######################..........###############################################LLLLLLLLLLLLLLLL####################........................................................................................................',
      '#######################..........###############################################LLLLLLLLLLLLLLLL####################........................................................................................................',
      '#######################..........###################################################################################........................................................................................................',
      '#######################..........###################################################################################........................................................................................................',
      '#######################..........###################################################################################........................................................................................................',
      '#######################..........###################################################################################........................................................................................................',
      '#######################..........###################################################################################........................................................................................................',
    ],   /* filled below by TILES */

    intro: [
      'TRIAL 10 - THE LAST TRIAL',
      'Four movements. Luck, money, trolls, and then Tetris.',
      'Everything that can be learned, can be beaten.'
    ],

    entities: [
      /* ===================== MOVEMENT I - LUCK ========================= */
      { type: 'text', x: 1, y: 6.4, w: 10, text: 'I. LUCK', size: 1.3, color: '#ffffff', alpha: 0.26 },
      { type: 'sign', x: 5, y: 12, w: 11, range: 2.6,
        text: 'Three doors. The odds are written on them, they are honest, and the fourth try is free.' },
      { type: 'lXdoor', x: 11, y: 11, idx: 0, odds: 50 },
      { type: 'lXdoor', x: 13, y: 11, idx: 1, odds: 25 },
      { type: 'lXdoor', x: 15, y: 11, idx: 2, odds: 25 },
      { type: 'text', x: 12.4, y: 4.2, w: 8, text: 'or climb over it', size: 0.44, color: '#ffd23f', alpha: 0.7 },
      { type: 'deco', kind: 'skull', x: 8.3, y: 12.2 },

      { type: 'sign', x: 20, y: 12, w: 11, range: 2.4,
        text: 'Every pair has one real pad. Falling costs you four seconds and nothing else.' },
      { type: 'lXpad', x: 24, y: 10, station: 0, upper: true },
      { type: 'lXpad', x: 24, y: 12, station: 0, upper: false },
      { type: 'lXpad', x: 26.5, y: 10, station: 1, upper: true },
      { type: 'lXpad', x: 26.5, y: 12, station: 1, upper: false },
      { type: 'lXpad', x: 29, y: 10, station: 2, upper: true },
      { type: 'lXpad', x: 29, y: 12, station: 2, upper: false },
      { type: 'lXpad', x: 31.5, y: 10, station: 3, upper: true },
      { type: 'lXpad', x: 31.5, y: 12, station: 3, upper: false },
      { type: 'text', x: 24, y: 7.4, w: 8, text: 'THE HALF BRIDGE', size: 0.6, color: '#c8b6e2', alpha: 0.6 },

      { type: 'sign', x: 36, y: 12, w: 11, range: 2.4,
        text: 'Three of a kind opens the gate. 34%. Spin four pays out no matter what.' },
      { type: 'lXslot', x: 39, y: 11 },
      { type: 'text', x: 41, y: 7.2, w: 7, text: 'or two crumbles', size: 0.42, color: '#ffd23f', alpha: 0.7 },

      { type: 'sign', x: 47, y: 12, w: 11, range: 2.4,
        text: 'This one is a 99% door. We are contractually obliged to say nothing else.' },
      { type: 'lXrig', x: 50, y: 9 },

      /* ===================== MOVEMENT II - TYCOON ====================== */
      { type: 'text', x: 57, y: 6.4, w: 10, text: 'II. MONEY', size: 1.3, color: '#ffffff', alpha: 0.24 },
      { type: 'sign', x: 58, y: 12, w: 11, range: 2.6,
        text: 'Earn 1500 and buy the elevator. The lava comes up every eleven seconds. Stand on a pillar.' },
      { type: 'sign', x: 77, y: 12, w: 11, range: 2.6,
        text: 'THE CIRCUIT. Six rungs up to the plate at the top, then drop and do it again. Each lap pays more than the last.' },
      { type: 'text', x: 77.4, y: 12.2, w: 5, text: 'START', size: 0.42, color: '#ffd23f', alpha: 0.8 },
      { type: 'text', x: 69.6, y: 6.1, w: 6, text: 'it crumbles', size: 0.36, color: '#ff9a6a', alpha: 0.75 },
      { type: 'text', x: 57, y: 1.4, w: 8, text: 'PAYOUT PLATE', size: 0.5, color: '#ffd23f', alpha: 0.85 },
      { type: 'deco', kind: 'lamp', x: 61, y: 3.2 },
      { type: 'lXlava', x: 58, y: 14, x0: 57, x1: 76.9, low: 15.4, high: 12.0, period: 11, up: 3.6 },

      { type: 'cannon', x: 69, y: 5, dir: 'down', every: 2.9, speed: 5, phase: 1.7, kind: 'fire', life: 0.6 },
      { type: 'cannon', x: 65, y: 3, dir: 'down', every: 2.4, speed: 5, phase: 0.6, kind: 'fire', life: 0.6 },
      { type: 'cannon', x: 61, y: 2, dir: 'down', every: 3.4, speed: 5, phase: 2.2, kind: 'fire', life: 0.6 },
      
      { type: 'cannon', x: 73, y: 6, dir: 'down', every: 3.1, speed: 5, phase: 0.9, kind: 'fire', life: 0.6 },
      { type: 'deco', kind: 'girder', x: 64, y: 10.2 },
      { type: 'deco', kind: 'torch', x: 80.4, y: 11.4 },
      { type: 'deco', kind: 'torch', x: 95.2, y: 11.4 },

      { type: 'coin', x: 64.3, y: 10 }, { type: 'coin', x: 65.1, y: 10 },
      { type: 'coin', x: 69.3, y: 10 }, { type: 'coin', x: 70.1, y: 10 },
      { type: 'coin', x: 74.3, y: 10 }, { type: 'coin', x: 75.1, y: 10 },
      { type: 'coin', x: 59.4, y: 11.6 }, { type: 'coin', x: 60.2, y: 11.6 },
      { type: 'coin', x: 62.4, y: 11.6 }, { type: 'coin', x: 63.2, y: 11.6 },
      { type: 'coin', x: 69.4, y: 11.6 }, { type: 'coin', x: 70.2, y: 11.6 },
      { type: 'coin', x: 73.4, y: 11.6 }, { type: 'coin', x: 74.2, y: 11.6 },
      { type: 'coin', x: 97.4, y: 11.6 }, { type: 'coin', x: 98.2, y: 11.6 },
      { type: 'coin', x: 99.4, y: 11.6 }, { type: 'coin', x: 100.2, y: 11.6 },

      { type: 'sign', x: 97, y: 12, w: 11, range: 2.4,
        text: 'The far plaza. Same money, fewer opinions about it.' },

      { type: 'text', x: 105, y: 6, w: 8, text: 'THE ELEVATOR', size: 0.6, color: '#ffd23f', alpha: 0.5 },

      /* ===================== MOVEMENT III - TROLLS + SKILL ============= */
      { type: 'text', x: 113.4, y: 5.2, w: 10, text: 'III. THE GANTRY', size: 1.0, color: '#ffffff', alpha: 0.26 },
      { type: 'sign', x: 116, y: 7, w: 11, range: 2.6,
        text: 'Blue and pink take turns. One of these blocks has never once been solid.' },
      { type: 'lXbeat', x: 122, y: 8, w: 3, group: 'A', period: 2.6, wake: 117 },
      { type: 'lXbeat', x: 125, y: 8, w: 3, group: 'B', period: 2.6, wake: 117 },
      { type: 'lXbeat', x: 125, y: 10, w: 3, group: 'A', period: 2.6, fake: true, wake: 117 },
      { type: 'sign', x: 131, y: 7, w: 11, range: 2.4,
        text: 'Thwomps above, spikes below. The floor is the part that surprises people.' },
      { type: 'thwomp', x: 135, y: 4, h: 2, triggerW: 3, drop: 950, rest: 0.55, shake: 0.6 },
      { type: 'thwomp', x: 139.5, y: 4, h: 2, triggerW: 3, drop: 950, rest: 0.55, shake: 0.6 },
      { type: 'trapspike', x: 143.5, y: 8, dir: 'up', trigger: 'near', near: 1.6, delay: 0.4, retract: 1.2 },
      { type: 'trapspike', x: 137, y: 8, dir: 'up', trigger: 'near', near: 1.5, delay: 0.35, retract: 1.2 },
      { type: 'trapspike', x: 141.5, y: 8, dir: 'up', trigger: 'near', near: 1.5, delay: 0.5, retract: 1.2 },

      { type: 'text', x: 146, y: 5.4, w: 9, text: 'six seconds of floor', size: 0.44, color: '#ded0ff', alpha: 0.6 },

      { type: 'sign', x: 158, y: 7, w: 11, range: 2.4,
        text: 'LASERS. And for six tiles in the middle of them, left is right.' },
      { type: 'laser', x: 161, y: 4, h: 4, on: 0.7, off: 2.4, phase: 1.2, dir: 'v' },
      { type: 'laser', x: 167, y: 5, h: 4, on: 0.7, off: 2.4, phase: 0.5, dir: 'v' },
      { type: 'laser', x: 170, y: 5, h: 4, on: 0.7, off: 2.4, phase: 1.7, dir: 'v' },

      { type: 'text', x: 174, y: 5.4, w: 9, text: 'THE PRECISION RUN', size: 0.55, color: '#ff3ea5', alpha: 0.7 },
      { type: 'sign', x: 188, y: 7, w: 11, range: 2.4,
        text: 'There is a door at the end of this ledge. There is also a lift. Only one of them works.' },
      { type: 'fakegoal', x: 192.5, y: 6, back: 5 },
      { type: 'lXlift', x: 196, y: 7, w: 2, bottom: 7, top: 3 },

      /* ===================== MOVEMENT IV - THE ARCADE ================== */
      { type: 'text', x: 199, y: 1, w: 10, text: 'IV. THE ARCADE', size: 0.9, color: '#ffffff', alpha: 0.3 },
      { type: 'sign', x: 205, y: 2, w: 11, range: 2.6,
        text: 'NES Tetris, level 28. Ten lines. Top out and you restart the machine, never the trial.' },
      { type: 'deco', kind: 'lamp', x: 201.4, y: 1.4 },
      { type: 'deco', kind: 'lamp', x: 214.4, y: 1.4 },
      { type: 'lXarcade', x: 210, y: 0 }
    ],

    /* ------------------------------------------------------------ hooks */
    onLoad: function (RT) {
      resetState();
      rollBridge();
      expose();
      reseatBridge();
      RT.hud.set('movement', 'I - LUCK');
      RT.toast('four movements. the last one is a video game inside a video game.', 3.4);
    },

    onDeath: function (RT, cause) {
      S = {};
      RT.player.controlsReversed = false;
      if (ptx() > 22 && ptx() < 34) {
        L.bridgeFalls++;
        rollBridge();
        if (L.bridgeFalls === 2) RT.toast('two falls. the real pads have a green seam now.', 2.4);
      }
      var lines = {
        lava: ['the lava is on a timer. so are you.', 'eleven seconds. count them.'],
        void: ['the gantry has no floor. that is the entire idea.', 'down is not a route.'],
        spike: ['the floor did that, not the thwomp.'],
        laser: ['the lasers are on a rhythm. the reversed bit is not.'],
        ball: ['the cannons do not stop while you shop.']
      };
      var pool = lines[cause] || ['again. it has not changed.', 'you know this one now.'];
      RT.toast(pool[RT.deaths % pool.length], 2);
    },

    onCheckpoint: function (RT, cp) {
      if (!cp) return;
      if (cp.tx === 56) { startTycoon(); RT.hud.set('movement', 'II - MONEY'); }
      else if (cp.tx === 120) { RT.hud.set('movement', 'III - THE GANTRY'); RT.banner(['III. THE GANTRY', 'no floor, no mercy, one liar'], 2.2); }
      else if (cp.tx === 202) { RT.hud.set('movement', 'IV - THE ARCADE'); }
    },

    onUpdate: function (RT, dt) {
      var p = RT.player;
      if (p.dead) return;
      var tx = ptx();

      /* the tycoon arms itself the moment you enter movement II, checkpoint
       * or no checkpoint - a route must never be able to walk past it */
      if (!L.tycoonOn && tx > 56.5) startTycoon();
      if (tx > 96) ensureLift();
      if (tx > 56 && tx < 96) circuit(dt);

      /* a bought SHIELD is renewed once per life, never mid-life */
      if (RT.deaths !== L.lastDeaths) {
        L.lastDeaths = RT.deaths;
        if (L.tycoonOn && RT.Tycoon && RT.Tycoon.has && RT.Tycoon.has('shield')) p.shield = true;
      }

      /* movement III: six reversed tiles in the middle of the laser maze */
      if (!S.revLatch && tx > 164.3 && tx < 171.6) S.revLatch = 1;
      if (S.revLatch && (tx > 171.7 || tx < 163.9)) S.revLatch = 0;
      var rev = !!S.revLatch;
      p.controlsReversed = rev;
      if (rev && !S.rev) { S.rev = 1; sfx('troll'); RT.flash('#ffb0e0', 0.12); RT.toast('reversed. six tiles. breathe.', 1.6); }

      /* HUD movement label, for players who came in on a checkpoint */
      if (tx > 196 && L.movement !== 4) { L.movement = 4; RT.hud.set('movement', 'IV - THE ARCADE'); }
      else if (tx > 116 && tx < 196 && L.movement !== 3) { L.movement = 3; RT.hud.set('movement', 'III - THE GANTRY'); }
      else if (tx > 56 && tx < 116 && L.movement !== 2) { L.movement = 2; RT.hud.set('movement', 'II - MONEY'); }

      /* the cash HUD is the tycoon's; ours is the movement chip */
      if (!S.armed && tx > 190) { S.armed = 1; RT.toast('the lift is at 196. the door is a decoy.', 2.6); }
    },

    onWin: function (RT) {
      RT.hud.clear('movement');
      RT.hud.clear('lap');
      if (RT.Tycoon && RT.Tycoon.stop) RT.Tycoon.stop();
      RT.particles.burst(RT.player.x + 10, RT.player.y + 14, {
        n: 60, colors: ['#3df0ff', '#ff3ea5', '#ffd23f', '#5bff9b', '#ffffff'],
        speed: 340, life: 1.4, size: 5, gravity: 260
      });
      RT.cam.shake(8, 0.6);
    },

    /* ------------------------------------------------------------- draw */
    onDraw: function (RT, g, layer) {
      var t = RT.time || 0;
      var camx = RT.cam.x, vw = RT.view.w;
      var x0 = camx - vw / 2 - 64, x1 = camx + vw / 2 + 64;
      if (layer === 'back') {
        drawStormSky(g, camx, t);
        drawDebris(g, x0, x1, t);
        return;
      }
      drawPayoutPlate(g, x0, x1, t);
      drawMovementBanners(g, x0, x1, t);
      drawReversedStripe(g, x0, x1, t);
      drawVoidHaze(g, x0, x1, t);
    }
  });

  /* ==================================================================== */
  /* ART                                                                  */
  /* ==================================================================== */
  function drawStormSky(g, camx, t) {
    /* lightning over movement I and II, stars over III and IV */
    if (camx / T > 116) return;
    var strike = (Math.sin(t * 0.37) > 0.985) || (Math.sin(t * 0.91 + 2) > 0.99);
    if (!strike) return;
    g.save();
    g.globalAlpha = 0.28;
    g.fillStyle = '#ffd9b0';
    g.fillRect(camx - 600, 0, 1200, 600);
    g.strokeStyle = 'rgba(255,240,210,0.9)';
    g.lineWidth = 2.4;
    var lx = camx + (h1(Math.floor(t * 3)) - 0.5) * 500, ly = 0;
    g.beginPath();
    g.moveTo(lx, ly);
    for (var i = 0; i < 7; i++) {
      lx += (h1(i + Math.floor(t * 3)) - 0.5) * 42;
      ly += 30;
      g.lineTo(lx, ly);
    }
    g.stroke();
    g.restore();
  }

  function drawDebris(g, x0, x1, t) {
    g.save();
    for (var i = 0; i < 16; i++) {
      var span = W * T;
      var dx = ((t * (9 + i * 2.4) + i * 613) % span);
      if (dx < x0 - 40 || dx > x1 + 40) continue;
      var dy = 30 + h1(i * 3.7) * 260 + Math.sin(t * 0.6 + i) * 18;
      g.globalAlpha = 0.16 + h1(i) * 0.14;
      g.fillStyle = i % 3 === 0 ? '#ffb45c' : '#6b4a5c';
      g.save();
      g.translate(dx, dy);
      g.rotate(t * (0.3 + h1(i) * 0.5) + i);
      var s = 4 + h1(i * 5) * 12;
      g.fillRect(-s / 2, -s / 4, s, s / 2);
      g.restore();
    }
    g.restore();
  }

  /* the plate: gold and humming while it owes you, dark once it has paid */
  function drawPayoutPlate(g, x0, x1, t) {
    if (x1 < 55 * T || x0 > 63 * T) return;
    var px = PLATE.x0 * T, pw = (PLATE.x1 - PLATE.x0) * T, py = PLATE.y1 * T;
    var live = !!L.plateArmed;
    g.save();
    g.globalAlpha = live ? 0.30 + 0.14 * Math.sin(t * 4) : 0.08;
    g.fillStyle = '#ffd23f';
    g.fillRect(px, py - 44, pw, 44);
    g.restore();
    g.fillStyle = live ? '#ffd23f' : '#6b5a2a';
    g.fillRect(px, py - 4, pw, 4);
    if (live) {
      g.fillStyle = 'rgba(255,246,196,0.9)';
      for (var i = 0; i < 4; i++) {
        var bx = px + 6 + i * (pw - 12) / 4;
        var bh = 5 + Math.abs(Math.sin(t * 3 + i)) * 9;
        g.fillRect(bx, py - 6 - bh, 4, bh);
      }
      RT.drawText(g, '+' + lapPay(L.laps || 0), px + pw / 2, py - 56 + Math.sin(t * 3) * 2, {
        size: 13, color: '#ffe9a8', stroke: 'rgba(40,20,0,0.85)', strokeWidth: 3
      });
    }
  }

  function drawMovementBanners(g, x0, x1, t) {
    var marks = [[0, 'I'], [56, 'II'], [116, 'III'], [196, 'IV']];
    for (var i = 0; i < marks.length; i++) {
      var mx = marks[i][0] * T;
      if (mx < x0 - 40 || mx > x1 + 40) continue;
      g.save();
      g.globalAlpha = 0.16;
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, H * T); g.stroke();
      g.restore();
      RT.drawText(g, marks[i][1], mx + 14, 40 + Math.sin(t * 1.4 + i) * 2, {
        size: 26, color: 'rgba(255,210,63,0.22)', align: 'left'
      });
    }
  }

  function drawReversedStripe(g, x0, x1, t) {
    var a = 164 * T, b = 172 * T;
    if (x1 < a || x0 > b) return;
    g.save();
    g.globalAlpha = 0.16;
    for (var i = 0; i < 24; i++) {
      var sx = a + ((i * 24 + t * 20) % (b - a));
      poly(g, [sx, 0, sx + 11, 0, sx + 11 - 22, H * T, sx - 22, H * T], '#ff3ea5');
    }
    g.restore();
    if (RT.player && !RT.player.dead) {
      var px = pcx() / T;
      if (px > 164 && px < 172) {
        RT.drawText(g, 'REVERSED', (a + b) / 2, 2.4 * T + Math.sin(t * 4) * 3, {
          size: 20, color: '#ff3ea5', stroke: 'rgba(255,255,255,0.85)', strokeWidth: 5, alpha: 0.85
        });
      }
    }
  }

  /* the gantry is a catwalk over nothing; say so with light */
  function drawVoidHaze(g, x0, x1, t) {
    if (x1 < 116 * T) return;
    g.save();
    var y = (CATWALK + 2) * T;
    var lg = g.createLinearGradient(0, y, 0, y + 300);
    lg.addColorStop(0, 'rgba(10,6,18,0)');
    lg.addColorStop(1, 'rgba(10,6,18,0.85)');
    g.fillStyle = lg;
    g.fillRect(Math.max(x0, 116 * T), y, x1 - Math.max(x0, 116 * T), 320);
    g.restore();
  }
})();
