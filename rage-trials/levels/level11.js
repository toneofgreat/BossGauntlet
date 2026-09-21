/* =========================================================================
 * RAGE TRIALS - LEVEL 11: ONE MORE
 * -------------------------------------------------------------------------
 * There was not supposed to be an eleventh. Trial 10 was called THE LAST
 * TRIAL and it meant it. This one is the longest, the hardest, and the only
 * one that asks you to be lucky as well as good - bounded luck, every time,
 * by the four techniques in docs/research-troll.md SS4.3: the odds are
 * painted on the object, the third or fifth attempt is guaranteed, every
 * gamble has a harder deterministic bypass, and losing costs TIME.
 *
 * Grid: 335 x 20 - forty per cent longer than SIX CROWNS. Walking surface is
 * row 14 (slab rows 14-19); anything punched through it is the void.
 *
 *   cols      section              what it asks of you
 *   -------   ------------------   -----------------------------------------
 *     0- 27   I.   THE APOLOGY     nothing. Then everything, without warning.
 *    28- 62   II.  THE DICE        five gates, one of three platforms missing
 *                                  at each, reshuffled every attempt. 2/3 is
 *                                  painted on them. Third fall reveals the
 *                                  seams. A spring skips all five for anyone
 *                                  who can cross the laser catwalk instead.
 *    63-104   III. THE METRONOME   beat blocks on one shared clock that starts
 *                                  when you arrive, then thwomps and lasers.
 *   105-140   IV.  THE BARRELS     a launcher chain over the void, ending on
 *                                  one that sweeps.
 *   141-178   V.   THE INVERSION   a ceiling walk, then six sunken tiles where
 *                                  left is right. You fall into that one, so
 *                                  you can never teeter on its edge.
 *   179-218   VI.  THE MARKET      earn 600 on a three-rung obby lap, gamble
 *                                  some of it on a crate with its odds
 *                                  printed on the lid, and buy the wall open.
 *   219-254   VII. THE CHASE       a wall of blades, a crumbling floor, and no
 *                                  reason to ever stop moving.
 *   255-296   VIII.THE NEEDLE      six two-tile perches over nothing.
 *   297-320   IX.  THE WHEEL       four reels, two matching opens the gate,
 *                                  spin five always pays. Or climb over it.
 *   321-334   X.   THE DOOR        real. No tricks. It has run out of them.
 * ========================================================================= */
(function () {
  var RT = window.RT;
  if (!RT) return;

  var T = 32;
  var W = 335, H = 20;
  var GROUND = 14;

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

  /* ==================================================================== */
  /* STATE                                                                */
  /* ==================================================================== */
  var L = {};        /* per level */
  var S = {};        /* per life */
  var rngN = 1;
  function lrand() { rngN = (rngN * 1664525 + 1013904223) % 4294967296; return rngN / 4294967296; }
  function expose() { try { window.__L11 = L; } catch (e) { } }

  /* II. Which of the three platforms is MISSING at each of the five gates.
   * A fixed table indexed by how many times you have fallen, so an attempt is
   * deterministic the moment it starts (research SS2.4) and a player still
   * cannot read it. 0 = the high one, 1 = the middle, 2 = the low one. */
  var DICE = [
    [1, 0, 2, 1, 0],
    [2, 1, 0, 2, 1],
    [0, 2, 1, 0, 2],
    [1, 2, 0, 1, 2],
    [2, 0, 1, 2, 0]
  ];
  function diceRow() { return DICE[(L.diceFalls || 0) % DICE.length]; }

  function resetState() {
    L = {
      diceFalls: 0, beatWoke: 0,
      laps: 0, plateArmed: 1, marketOn: 0, wallOpen: 0,
      crateSpins: 0, crateTotal: 0,
      spins: 0, wheelOpen: 0,
      chaseOn: 0, lastDeaths: 0, section: 0
    };
    S = {};
    rngN = 20261111;
    expose();
  }

  /* ==================================================================== */
  /* II. THE DICE                                                         */
  /* ==================================================================== */
  def('lEgate', {
    solid: true,
    init: function (e, d) {
      e.dw = T * 2; e.dh = T * 0.6;
      e.w = e.dw; e.h = e.dh;
      e.gate = d.gate || 0;      /* 0..4 */
      e.slot = d.slot || 0;      /* 0 high, 1 middle, 2 low */
      e.rest = { x: e.x, y: e.y };
      applyGate(e);
    },
    update: function (e, dt) {
      if (e.real) return;
      if (!e.told && hitP(e.rest.x, e.rest.y - 5, e.dw, e.dh + 12, 2)) {
        e.told = 1;
        sfx('fake');
        boom(e.rest.x + e.dw / 2, e.rest.y, ['#ff6b8b', '#ffffff'], 14, 150, { gravity: 300 });
      }
    },
    reset: function (e) { e.told = 0; applyGate(e); },
    draw: function (e, g) {
      var x = e.rest.x, y = e.rest.y, w = e.dw, hh = e.dh;
      var seam = (L.diceFalls || 0) >= 2;          /* pity: the seams show */
      g.globalAlpha = e.real ? 1 : (e.told ? 0.16 : 1);
      rr(g, x, y, w, hh, 4, '#8f7bd6');
      rr(g, x + 2, y + 2, w - 4, hh * 0.44, 3, '#c6b7ff');
      g.globalAlpha = 1;
      if (seam) {
        g.fillStyle = e.real ? 'rgba(160,255,180,0.9)' : 'rgba(255,120,150,0.85)';
        g.fillRect(x + 3, y + hh - 3, w - 6, 2);
      }
      if (e.slot === 1) {
        RT.drawText(g, '2/3', x + w / 2, y - 9, {
          size: 9, color: '#ded0ff', stroke: 'rgba(20,10,35,0.85)', strokeWidth: 3, alpha: 0.9
        });
      }
    }
  });
  function applyGate(e) {
    var miss = diceRow()[e.gate];
    e.real = (e.slot !== miss);
    e.x = e.rest.x; e.y = e.rest.y;
    e.w = e.real ? e.dw : 0;
    e.h = e.real ? e.dh : 0;
  }
  function reseatGates() {
    var a = RT.find('lEgate');
    for (var i = 0; i < a.length; i++) { a[i].told = 0; applyGate(a[i]); }
  }

  /* ==================================================================== */
  /* III. THE METRONOME                                                   */
  /* ==================================================================== */
  def('lEbeat', {
    solid: true,
    init: function (e, d) {
      e.dw = T * (d.w === undefined ? 3 : d.w); e.dh = T * 0.6;
      e.w = e.dw; e.h = e.dh;
      e.rest = { x: e.x, y: e.y };
      e.grp = (d.group || 'A').toUpperCase();
      e.period = d.period === undefined ? 2.4 : d.period;
      e.wake = (d.wake === undefined ? (e.x / T) - 5 : d.wake) * T;
      e.ph0 = d.phase === undefined ? 0 : d.phase;
      e.bt = 0; e.armed = false; e.on = true;
    },
    update: function (e, dt) {
      if (!e.armed) {
        if (!alive() || pcx() < e.wake) { e.w = e.dw; e.h = e.dh; e.on = true; return; }
        e.armed = true; e.bt = 0;
      }
      e.bt += dt;
      var ph = (((e.bt / e.period) + e.ph0) % 1 + 1) % 1;
      /* the groups overlap for a sixth of the beat: the handover is a window */
      var on = (e.grp === 'A') ? (ph < 0.72) : (ph >= 0.28);
      e.on = on;
      e.warn = (e.grp === 'A') ? (ph > 0.62 && ph < 0.72) : (ph > 0.9 || ph < 0.05);
      e.x = e.rest.x; e.y = e.rest.y;
      e.w = on ? e.dw : 0;
      e.h = on ? e.dh : 0;
    },
    reset: function (e) { e.bt = 0; e.armed = false; e.w = e.dw; e.h = e.dh; },
    draw: function (e, g) {
      var x = e.rest.x, y = e.rest.y, w = e.dw, hh = e.dh;
      g.globalAlpha = e.on ? 1 : 0.2;
      rr(g, x, y, w, hh, 4, e.grp === 'A' ? '#3df0ff' : '#ff3ea5');
      rr(g, x + 2, y + 2, w - 4, hh * 0.42, 3, 'rgba(255,255,255,0.4)');
      g.globalAlpha = 1;
      if (e.warn) {
        g.globalAlpha = 0.6 + Math.sin(e.at * 40) * 0.3;
        g.strokeStyle = '#ffffff'; g.lineWidth = 2;
        RT.roundRect(g, x - 1, y - 1, w + 2, hh + 2, 5); g.stroke();
        g.globalAlpha = 1;
      }
      RT.drawText(g, e.grp, x + w / 2, y + hh / 2, { size: 10, color: 'rgba(0,0,0,0.5)' });
    }
  });

  /* ==================================================================== */
  /* VI. THE MARKET - the crate, with its odds printed on the lid         */
  /* ==================================================================== */
  var CRATE = [
    { pay: 40, w: 50, col: '#9aa4b8', name: 'SCRAP' },
    { pay: 160, w: 35, col: '#7fd8ff', name: 'DECENT' },
    { pay: 420, w: 15, col: '#ffd23f', name: 'THE GOOD ONE' }
  ];
  def('lEcrate', {
    init: function (e) {
      e.w = T * 1.4; e.h = T * 1.2;
      e.cool = 0; e.pop = 0; e.lastIdx = -1; e.shown = '';
    },
    update: function (e, dt) {
      if (e.cool > 0) e.cool -= dt;
      if (e.pop > 0) e.pop -= dt;
      if (!L.marketOn || e.cool > 0) return;
      if (!hitP(e.x - 4, e.y - 4, e.w + 8, e.h + 8, 2)) return;
      e.cool = 1.6; e.pop = 0.8;
      /* never two SCRAP in a row: the pity rule, stated on the sign */
      var r = lrand() * 100, idx = 0, acc = 0, i;
      for (i = 0; i < CRATE.length; i++) { acc += CRATE[i].w; if (r < acc) { idx = i; break; } }
      if (idx === 0 && e.lastIdx === 0) idx = 1;
      e.lastIdx = idx;
      var c = CRATE[idx];
      L.crateSpins++;
      L.crateTotal += c.pay;
      e.shown = c.name + ' +' + c.pay;
      if (RT.Tycoon && RT.Tycoon.add) RT.Tycoon.add(c.pay);
      sfx(idx === 2 ? 'powerup' : 'coin');
      boom(e.x + e.w / 2, e.y, [c.col, '#ffffff'], idx === 2 ? 34 : 16, 220, { life: 0.8 });
      RT.toast(c.name + '  +' + c.pay, 1.6);
    },
    reset: function (e) { e.cool = 0; e.pop = 0; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h;
      var lift = e.pop > 0 ? Math.sin((0.8 - e.pop) * 10) * 3 : 0;
      rr(g, x, y + 4 - lift, w, hh - 4, 4, '#6b543a');
      rr(g, x + 2, y + 6 - lift, w - 4, hh - 8, 3, '#8d6f4c');
      rr(g, x - 2, y - lift, w + 4, 8, 3, '#b08a5c');
      g.strokeStyle = 'rgba(40,24,10,0.5)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(x + w / 2, y + 6 - lift); g.lineTo(x + w / 2, y + hh - 4); g.stroke();
      RT.drawText(g, '?', x + w / 2, y + hh * 0.62 - lift, {
        size: 14, color: '#ffe9a8', stroke: 'rgba(40,24,10,0.8)', strokeWidth: 3
      });
      if (e.pop > 0 && e.shown) {
        RT.drawText(g, e.shown, x + w / 2, y - 16 - (0.8 - e.pop) * 14, {
          size: 11, color: '#ffe9a8', stroke: 'rgba(30,16,6,0.9)', strokeWidth: 3,
          alpha: Math.min(1, e.pop / 0.4)
        });
      }
    }
  });

  /* ==================================================================== */
  /* VII. THE CHASE - a wall of blades, at a fixed speed, forever          */
  /* ==================================================================== */
  def('lEchase', {
    init: function (e, d) {
      e.w = T * 2.2; e.h = T * 7;
      e.rest = { x: e.x, y: e.y };
      e.wake = (d.wake === undefined ? 220 : d.wake) * T;
      e.stop = (d.stop === undefined ? 256 : d.stop) * T;
      e.spd = (d.speed === undefined ? 4.6 : d.speed) * T;   /* slower than a run */
      e.going = 0; e.spin = 0;
    },
    update: function (e, dt) {
      e.spin += dt * 11;
      if (!e.going) {
        if (!alive() || pcx() < e.wake) return;
        e.going = 1;
        sfx('charge');
        RT.banner(['THE CHASE', 'it does not get tired'], 1.8);
        return;
      }
      if (e.x < e.stop) e.x += e.spd * dt;
      if (hitP(e.x + 6, e.y + 6, e.w - 12, e.h - 12, 3)) RT.killPlayer('saw');
    },
    reset: function (e) { e.going = 0; e.x = e.rest.x; },
    draw: function (e, g) {
      if (!e.going && e.x <= e.rest.x) {
        g.globalAlpha = 0.25;
      }
      var x = e.x, y = e.y, w = e.w, hh = e.h, i;
      /* the grinder: a column of blades on a shared spindle */
      g.fillStyle = 'rgba(30,14,20,0.85)';
      g.fillRect(x + w / 2 - 3, y, 6, hh);
      for (i = 0; i < 6; i++) {
        var cy = y + 14 + i * (hh - 28) / 5, r = w * 0.44;
        g.save();
        g.translate(x + w / 2, cy);
        g.rotate(e.spin * (i % 2 ? -1 : 1));
        g.fillStyle = '#e6eaf2';
        g.beginPath();
        for (var k = 0; k < 10; k++) {
          var a = (k / 10) * 6.2832, b = ((k + 0.5) / 10) * 6.2832;
          g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          g.lineTo(Math.cos(b) * r * 0.7, Math.sin(b) * r * 0.7);
        }
        g.closePath(); g.fill();
        circ(g, 0, 0, r * 0.32, '#ff3ea5');
        g.restore();
      }
      g.globalAlpha = 1;
    }
  });

  /* ==================================================================== */
  /* IX. THE WHEEL - four reels, two matching opens it, spin five pays     */
  /* ==================================================================== */
  def('lEwheel', {
    init: function (e) {
      e.w = T * 2.4; e.h = T * 2.2;
      e.reels = [0, 1, 2, 3];
      e.spin = 0; e.hold = 0;
    },
    update: function (e, dt) {
      if (L.wheelOpen) return;
      if (e.spin > 0) {
        e.spin -= dt;
        if (e.spin > 0) {
          for (var i = 0; i < 4; i++) if (e.spin > 0.3 * i) e.reels[i] = Math.floor(e.at * (19 + i * 6)) % 5;
          return;
        }
        var win = (L.spins >= 4) || lrand() < 0.42;
        if (win) {
          e.reels = [2, 2, (Math.floor(lrand() * 5)) % 5, 2];
          openWheel(e);
        } else {
          var seen = {}, dup = false;
          for (var k = 0; k < 4; k++) {
            e.reels[k] = Math.floor(lrand() * 5) % 5;
            if (seen[e.reels[k]]) dup = true;
            seen[e.reels[k]] = 1;
          }
          if (dup) e.reels = [0, 1, 3, 4];
          L.spins++;
          sfx('bonk');
          RT.toast(L.spins >= 4 ? 'no pair. the next spin is guaranteed.'
                                : 'no pair. spin again - it costs nothing but time.', 1.8);
        }
        return;
      }
      if (!hitP(e.x - 8, e.y, e.w + 16, e.h + 10, 2)) { e.hold = 0; return; }
      e.hold += dt;
      if ((RT.input && RT.input.actionPressed) || e.hold > 0.5) {
        e.spin = 1.5; e.hold = -0.6;
        sfx('charge');
        if (RT.consumeAction) RT.consumeAction();
      }
    },
    reset: function (e) { e.spin = 0; e.hold = 0; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h, i;
      rr(g, x, y, w, hh, 6, L.wheelOpen ? '#2f6f4a' : '#463055');
      rr(g, x + 3, y + 3, w - 6, hh * 0.46, 4, '#140c1d');
      var syms = ['7', '$', '*', 'X', '?'];
      var cols = ['#ffd23f', '#8dff9a', '#ff9ad4', '#ff6b6b', '#9ad4ff'];
      for (i = 0; i < 4; i++) {
        var rx = x + 5 + i * ((w - 10) / 4);
        rr(g, rx, y + 6, (w - 10) / 4 - 3, hh * 0.38, 3, '#090512');
        RT.drawText(g, syms[e.reels[i] % 5], rx + ((w - 10) / 4 - 3) / 2, y + 6 + hh * 0.19, {
          size: 13, color: cols[e.reels[i] % 5]
        });
      }
      RT.drawText(g, L.wheelOpen ? 'OPEN' : (L.spins >= 4 ? 'NEXT SPIN PAYS' : 'ANY TWO MATCHING'),
        x + w / 2, y + hh * 0.66, { size: 8, color: '#ffe9a8', stroke: 'rgba(15,8,25,0.85)', strokeWidth: 3 });
      RT.drawText(g, '42%', x + w / 2, y - 10, {
        size: 11, color: '#ffffff', stroke: 'rgba(15,8,25,0.9)', strokeWidth: 3
      });
      var la = e.spin > 0 ? 0.95 : 0.18;
      g.save();
      g.translate(x + w + 2, y + hh * 0.34);
      g.rotate(la);
      g.fillStyle = '#c8c8d4'; g.fillRect(-2, 0, 4, 20);
      circ(g, 0, 22, 5, '#ff4d4d');
      g.restore();
    }
  });
  function openWheel(e) {
    L.wheelOpen = 1;
    for (var ty = 10; ty <= 13; ty++) RT.setTile(309, ty, '.');
    sfx('win'); sfx('cash');
    RT.flash('#ffe9a8', 0.16);
    RT.cam.shake(5, 0.3);
    boom(e.x + e.w / 2, e.y + e.h / 2, ['#ffd23f', '#ffffff', '#8dff9a'], 40, 280, { life: 0.9, size: 4 });
    RT.toast('A PAIR. The gate is open.', 2.2);
  }

  /* ==================================================================== */
  /* VI. THE MARKET - tycoon ladder + the obby lap that funds it          */
  /* ==================================================================== */
  function run(y, x0, x1, ch) { var a = [], x; for (x = x0; x <= x1; x++) a.push([x, y, ch || '#']); return a; }

  var MARKET_ITEMS = [
    { id: 'grip', name: 'THE GRIP', price: 150, kind: 'ability', ability: 'doubleJump',
      x: 184, y: 13, w: 3, h: 1, color: '#3df0ff',
      desc: 'A second jump. The needle does not require it. You will want it.' },
    { id: 'lamp', name: 'THE LAMP', price: 250, kind: 'cosmetic', flag: 'lamp',
      requires: 'grip', showLocked: true, x: 189, y: 13, w: 3, h: 1, color: '#ffd23f',
      desc: 'Lights the chase. Buying it is optional. Regretting it is not.' },
    { id: 'wall', name: 'THE WALL', price: 600, kind: 'platform', tiles: run(10, 214, 214, '.').concat(run(11, 214, 214, '.'), run(12, 214, 214, '.'), run(13, 214, 214, '.')),
      requires: 'lamp', showLocked: true, x: 194, y: 13, w: 3, h: 1, icon: 'gate', color: '#8dff9a',
      desc: 'Opens the only way east. Yes, you are buying a hole.' }
  ];

  var PLATE = { x0: 212, x1: 216, y0: 6, y1: 8 };
  function lapPay(n) { return Math.min(420, Math.round(90 * Math.pow(1.7, n))); }

  function startMarket() {
    if (L.marketOn || !RT.Tycoon || !RT.Tycoon.start) return;
    L.marketOn = 1;
    RT.Tycoon.start({
      cash: 0, hudKey: 'cash', coinValue: 5, buyHold: 0.3,
      cashpad: { x: 181, y: 13 },
      items: MARKET_ITEMS,
      onBuy: function (item) {
        RT.banner([item.name, 'BOUGHT'], 1.3);
        if (item.id === 'wall') L.wallOpen = 1;
      }
    });
    RT.toast('THE MARKET. Run the lap, gamble the change, buy the wall.', 3);
  }

  function marketLap(dt) {
    if (!L.marketOn) return;
    var p = P();
    var onPlate = p.x + p.w > PLATE.x0 * T && p.x < PLATE.x1 * T &&
                  p.y + p.h > PLATE.y0 * T && p.y < PLATE.y1 * T;
    var home = p.y + p.h > 13.6 * T && pcx() > 179 * T && pcx() < 214 * T;
    if (L.plateArmed && onPlate) {
      var pay = lapPay(L.laps);
      L.laps++; L.plateArmed = 0;
      if (RT.Tycoon && RT.Tycoon.add) RT.Tycoon.add(pay);
      sfx('cash'); sfx('checkpoint');
      RT.flash('#ffe9a8', 0.12);
      boom(pcx(), pcy(), ['#ffd23f', '#fff6c4'], 24, 220, { life: 0.8 });
      RT.toast('LAP ' + L.laps + '  +' + pay + '.  Next pays ' + lapPay(L.laps) + '.', 2);
    } else if (!L.plateArmed && home) {
      L.plateArmed = 1;
      sfx('tick');
    }
    RT.hud.set('lap', 'LAP ' + (L.laps + 1) + '  +' + lapPay(L.laps));
  }

  /* ==================================================================== */
  /* THEMES                                                               */
  /* ==================================================================== */
  var OVERTIME = {
    sky: [[0, '#10121c'], [0.3, '#242238'], [0.62, '#4a3a52'], [0.85, '#8a6a58'], [1, '#d9a86a']],
    parallax: [
      { kind: 'stars', color: '#ffffff', y: 0.36, speed: 0.02, scale: 1, alpha: 0.5 },
      { kind: 'mountains', color: '#1d1b2c', color2: '#2b2740', y: 0.82, speed: 0.12, scale: 0.38 },
      { kind: 'ruins', color: '#2a2338', color2: '#171325', y: 1.0, speed: 0.26, scale: 0.4 },
      { kind: 'hills', color: '#241f33', color2: '#15111f', y: 1.12, speed: 0.55, scale: 0.22 }
    ],
    ambient: 'dust',
    fog: { color: '#6a5a78', alpha: 0.14 },
    tile: { top: '#b9a77e', side: '#6d5f48', dark: '#3f382b', rim: '#f2e6c6', accent: '#ffd23f' },
    spike: { base: '#e8e0cc', tip: '#ff8a5c' },
    vignette: 0.26
  };

  var DEEPCUT = {
    sky: [[0, '#05060f'], [0.4, '#0d1226'], [0.75, '#1b2647'], [1, '#2f3f6b']],
    parallax: [
      { kind: 'stars', color: '#ffffff', y: 0.4, speed: 0.015, scale: 1, alpha: 0.85 },
      { kind: 'nebula', color: '#2a4d8f', color2: '#080b18', y: 1, speed: 0.03, scale: 1, alpha: 0.45 },
      { kind: 'city', color: '#0c1122', color2: '#131a33', y: 0.9, speed: 0.14, scale: 0.42 }
    ],
    ambient: 'snow',
    fog: { color: '#16203d', alpha: 0.2 },
    tile: { top: '#8fb6e8', side: '#3f5480', dark: '#1e2a44', rim: '#e0efff', accent: '#3df0ff' },
    spike: { base: '#dbe9ff', tip: '#ff6b8b' },
    vignette: 0.32
  };

  var LASTLIGHT = {
    sky: [[0, '#1a0b18'], [0.32, '#4a1330'], [0.66, '#9c3a35'], [0.88, '#e0853f'], [1, '#ffd79a']],
    parallax: [
      { kind: 'nebula', color: '#7d2340', color2: '#220a18', y: 1, speed: 0.03, scale: 1, alpha: 0.45 },
      { kind: 'castle', color: '#2a1020', color2: '#170812', y: 0.9, speed: 0.16, scale: 0.46 },
      { kind: 'hills', color: '#33131f', color2: '#1d0a12', y: 1.1, speed: 0.5, scale: 0.24 }
    ],
    ambient: 'embers',
    fog: { color: '#ffb07a', alpha: 0.12 },
    tile: { top: '#ffcf8a', side: '#9a6340', dark: '#4e2f22', rim: '#fff1d6', accent: '#ff7a3a' },
    spike: { base: '#ffe6c8', tip: '#ff4d3a' },
    vignette: 0.24
  };

  /* ==================================================================== */
  RT.registerLevel(11, {
    name: 'ONE MORE',
    subtitle: 'There was not supposed to be an eleventh',
    theme: 'meadow',
    themeZones: [
      { x0: 12, x1: 104, theme: OVERTIME },
      { x0: 105, x1: 218, theme: DEEPCUT },
      { x0: 219, x1: 296, theme: OVERTIME },
      { x0: 297, x1: 400, theme: LASTLIGHT }
    ],
    music: 'apocalypse',

    tiles: [
      '...............................................................................................................................................................................................................................................................................................................................................',
      '...............................................................................................................................................................................................................................................................................................................................................',
      '...............................................................................................................................................................................................................................................................................................................................................',
      '...............................................................................................................................................................................................................................................................................................................................................',
      '...............................................................................................................................................................................................................................................................................................................................................',
      '...............................................................................................................................................................................................................................................................................................................................................',
      '...............................................................................................................................................................................................................................................................................................................................................',
      '..............................-------...-------...---------....................................................................................................................................................................................................................................................................................',
      '.................................................................................................................................................#############......................................................####..............................................................................................###......................',
      '.................................................................................................................................................................................................................###...........................................................................................................................',
      '.............................................................................................................................................................................................................KKK......#............................................................................................KK#.........................',
      '..............................S..........................................................................................................................................................................###..........#..............................................................................................#.........................',
      '........................................................................##...##...##...##............................................................................................................###..............#.........................................................................................KK...#.........................',
      '..P........................C..............................C....C.........................C...............C..................................CC...............................C.....C..................................#....C...................................C.....##..##..##..##..##..##..##..........C...........#...........C.........G...',
      '###################KKKKK#######..........................##############..................######################........................#############........####.............#######################################################KKKKKK######KKKKKKK############.............................###############################################',
      '##############..###.....#######..........................##############..................######################........................#############........####.........###########################################################......######.......############.............................###############################################',
      '###############################..........................##############..................######################........................#############........########################################################################......######.......############.............................###############################################',
      '###############################..........................##############..................######################........................#############........########################################################################......######.......############.............................###############################################',
      '###############################..........................##############..................######################........................#############........########################################################################......######.......############.............................###############################################',
      '###############################..........................##############..................######################........................#############........########################################################################......######.......############.............................###############################################',
    ],

    intro: [
      'TRIAL 11 - ONE MORE',
      'The tenth one was called THE LAST TRIAL. It was wrong.',
      'Longest. Hardest. And this time you have to be lucky too.'
    ],

    entities: [
      /* ===================== I. THE APOLOGY ========================== */
      { type: 'text', x: 1, y: 9.4, w: 10, text: 'I. THE APOLOGY', size: 0.62, color: '#ffffff', alpha: 0.3 },
      { type: 'sign', x: 4, y: 13, w: 12, range: 2.8,
        text: 'There was not supposed to be an eleventh trial. We are as surprised as you are. Sorry about the next three hundred tiles.' },
      { type: 'deco', kind: 'tree', x: 0.2, y: 11.5, w: 2.4, h: 2.5 },
      { type: 'deco', kind: 'bush', x: 6.4, y: 13.1 },
      { type: 'trapspike', x: 10, y: 14, dir: 'up', trigger: 'near', near: 1.5, delay: 0.4, retract: 1.2 },
      { type: 'trapspike', x: 12, y: 14, dir: 'up', trigger: 'near', near: 1.5, delay: 0.55, retract: 1.2 },
      { type: 'sign', x: 17, y: 13, w: 11, range: 2.4,
        text: 'That was the friendly part. It lasted seventeen tiles. Trial one lasted forty-four.' },
      { type: 'text', x: 18.4, y: 12.2, w: 6, text: 'it crumbles', size: 0.38, color: '#ffd23f', alpha: 0.75 },

      /* ===================== II. THE DICE ============================ */
      { type: 'text', x: 28, y: 9.4, w: 10, text: 'II. THE DICE', size: 0.62, color: '#ded0ff', alpha: 0.4 },
      { type: 'sign', x: 28, y: 13, w: 12, range: 2.8,
        text: 'Five gates. Three platforms at each and one of them is not there. Two in three, painted on. Fall twice and the seams show you which.' },
      { type: 'sign', x: 30.4, y: 13, w: 12, range: 2.2,
        text: 'Or take the spring. The high road has no gambling on it at all, only lasers and three-tile holes.' },
      { type: 'lEgate', x: 33, y: 10, gate: 0, slot: 0 },
      { type: 'lEgate', x: 33, y: 12, gate: 0, slot: 1 },
      { type: 'lEgate', x: 33, y: 14, gate: 0, slot: 2 },
      { type: 'lEgate', x: 38, y: 10, gate: 1, slot: 0 },
      { type: 'lEgate', x: 38, y: 12, gate: 1, slot: 1 },
      { type: 'lEgate', x: 38, y: 14, gate: 1, slot: 2 },
      { type: 'lEgate', x: 43, y: 10, gate: 2, slot: 0 },
      { type: 'lEgate', x: 43, y: 12, gate: 2, slot: 1 },
      { type: 'lEgate', x: 43, y: 14, gate: 2, slot: 2 },
      { type: 'lEgate', x: 48, y: 10, gate: 3, slot: 0 },
      { type: 'lEgate', x: 48, y: 12, gate: 3, slot: 1 },
      { type: 'lEgate', x: 48, y: 14, gate: 3, slot: 2 },
      { type: 'lEgate', x: 53, y: 10, gate: 4, slot: 0 },
      { type: 'lEgate', x: 53, y: 12, gate: 4, slot: 1 },
      { type: 'lEgate', x: 53, y: 14, gate: 4, slot: 2 },
      { type: 'text', x: 42, y: 5.2, w: 10, text: 'THE HIGH ROAD', size: 0.5, color: '#9ad4ff', alpha: 0.75 },
      { type: 'laser', x: 34, y: 3, h: 4, on: 0.8, off: 2, phase: 0, dir: 'v' },
      { type: 'laser', x: 44, y: 3, h: 4, on: 0.8, off: 2, phase: 0.9, dir: 'v' },
      { type: 'laser', x: 54, y: 3, h: 4, on: 0.8, off: 2, phase: 1.8, dir: 'v' },

      /* ===================== III. THE METRONOME ====================== */
      { type: 'text', x: 63, y: 9.4, w: 12, text: 'III. THE METRONOME', size: 0.62, color: '#3df0ff', alpha: 0.4 },
      { type: 'sign', x: 64.4, y: 13, w: 12, range: 2.6,
        text: 'Blue and pink take turns on one clock, and the clock starts when you arrive. Do not stop between here and the far side.' },
      { type: 'lEbeat', x: 74, y: 12, w: 3, group: 'A', period: 2.2, wake: 71, phase: 0.873 },
      { type: 'lEbeat', x: 79, y: 12, w: 3, group: 'A', period: 2.2, wake: 71, phase: 0.527 },
      { type: 'lEbeat', x: 84, y: 12, w: 3, group: 'A', period: 2.2, wake: 71, phase: 0.182 },
      { type: 'sign', x: 90, y: 13, w: 11, range: 2.4,
        text: 'Thwomps above, spikes below, a laser at the end. All of them keep time. You are the only improviser here.' },
      { type: 'thwomp', x: 93, y: 9, h: 2, triggerW: 3, drop: 950, rest: 0.55, shake: 0.6 },
      { type: 'thwomp', x: 99, y: 9, h: 2, triggerW: 3, drop: 950, rest: 0.55, shake: 0.6 },
      { type: 'trapspike', x: 96, y: 14, dir: 'up', trigger: 'near', near: 1.5, delay: 0.4, retract: 1.2 },
      { type: 'laser', x: 102, y: 9, h: 5, on: 0.7, off: 2.2, phase: 0.5, dir: 'v' },

      /* ===================== IV. THE BARRELS ========================= */
      { type: 'text', x: 105, y: 9.4, w: 10, text: 'IV. THE BARRELS', size: 0.62, color: '#ffd23f', alpha: 0.4 },
      { type: 'sign', x: 106, y: 13, w: 12, range: 2.6,
        text: 'Four barrels over nothing. Three are bolted down. The fourth one sweeps, and you fire that one yourself.' },
      { type: 'launcher', x: 108, y: 13, angle: 68, power: 820, color: '#ffb03a' },
      { type: 'launcher', x: 115, y: 11, w: 3, h: 2, angle: 70, power: 820, color: '#ff8a5a' },
      { type: 'launcher', x: 122, y: 10, w: 3, h: 2, angle: 72, power: 820, color: '#ff8a5a' },
      { type: 'launcher', x: 129, y: 9, w: 3, h: 2, angle: 74, rotate: [46, 84], rotateSpeed: 20, power: 900, color: '#ffd23f' },
      { type: 'text', x: 130, y: 6.4, w: 8, text: 'fire HIGH', size: 0.44, color: '#ffe9a8', alpha: 0.8 },

      /* ===================== V. THE INVERSION ======================== */
      { type: 'text', x: 141, y: 9.4, w: 12, text: 'V. THE INVERSION', size: 0.62, color: '#c47ae0', alpha: 0.4 },
      { type: 'sign', x: 142.4, y: 13, w: 12, range: 2.6,
        text: 'For twelve tiles up is down and you cannot jump. Walk the ceiling. The hole underneath is the only reason to.' },
      { type: 'sign', x: 158.4, y: 13, w: 12, range: 2.6,
        text: 'Then the floor drops away and left becomes right. You fall into that bit, so you can never stand on its edge arguing with it.' },

      /* ===================== VI. THE MARKET ========================== */
      { type: 'text', x: 179, y: 9.4, w: 10, text: 'VI. THE MARKET', size: 0.62, color: '#8dff9a', alpha: 0.4 },
      { type: 'sign', x: 180.4, y: 13, w: 12, range: 2.6,
        text: 'Six hundred opens the wall. The lap pays for it, the crate speeds it up, and the crate has never given SCRAP twice in a row.' },
      { type: 'lEcrate', x: 199, y: 12.8 },
      { type: 'text', x: 197.6, y: 11.2, w: 8, text: '50 / 35 / 15', size: 0.36, color: '#ffe9a8', alpha: 0.85 },
      { type: 'text', x: 205, y: 7.4, w: 8, text: 'THE LAP', size: 0.5, color: '#ffd23f', alpha: 0.7 },
      { type: 'deco', kind: 'lamp', x: 216, y: 7.2 },

      /* ===================== VII. THE CHASE ========================== */
      { type: 'text', x: 219, y: 9.4, w: 10, text: 'VII. THE CHASE', size: 0.62, color: '#ff6b8b', alpha: 0.4 },
      { type: 'sign', x: 220.4, y: 13, w: 12, range: 2.6,
        text: 'It starts when you pass this sign and it never stops. Two of the floors ahead of you are not floors for long.' },
      { type: 'lEchase', x: 215, y: 8, wake: 224, stop: 251, speed: 4.6 },
      { type: 'trapspike', x: 237, y: 14, dir: 'up', trigger: 'near', near: 1.4, delay: 0.3, retract: 1.1 },
      { type: 'trapspike', x: 249, y: 14, dir: 'up', trigger: 'near', near: 1.4, delay: 0.3, retract: 1.1 },

      /* ===================== VIII. THE NEEDLE ======================== */
      { type: 'text', x: 255, y: 9.4, w: 12, text: 'VIII. THE NEEDLE', size: 0.62, color: '#9ad4ff', alpha: 0.4 },
      { type: 'sign', x: 256.2, y: 13, w: 12, range: 2.6,
        text: 'Seven perches, two tiles each, three tiles apart, over nothing at all. No trick in this one. Just the jump, seven times.' },
      { type: 'trapspike', x: 269, y: 13, dir: 'up', trigger: 'near', near: 1.2, delay: 0.45, retract: 1 },
      { type: 'trapspike', x: 281, y: 13, dir: 'up', trigger: 'near', near: 1.2, delay: 0.45, retract: 1 },

      /* ===================== IX. THE WHEEL =========================== */
      { type: 'text', x: 297, y: 9.4, w: 10, text: 'IX. THE WHEEL', size: 0.62, color: '#ffd23f', alpha: 0.45 },
      { type: 'sign', x: 298.4, y: 13, w: 12, range: 2.6,
        text: 'Any two reels matching opens the gate. Forty-two per cent a spin, spins are free, and the fifth one always pays.' },
      { type: 'lEwheel', x: 303, y: 11.8 },
      { type: 'text', x: 305.4, y: 8.4, w: 9, text: 'or climb it', size: 0.4, color: '#ffe9a8', alpha: 0.75 },

      /* ===================== X. THE DOOR ============================= */
      { type: 'text', x: 321, y: 9.4, w: 10, text: 'X. THE DOOR', size: 0.62, color: '#ffffff', alpha: 0.4 },
      { type: 'sign', x: 323, y: 13, w: 12, range: 2.8,
        text: 'This one is real. No fakes, no reels, no second door behind it. You have run out of trials and we have run out of tricks.' },
      { type: 'deco', kind: 'flag', x: 327.4, y: 12 },
      { type: 'deco', kind: 'lamp', x: 329.4, y: 12.2 },
      { type: 'text', x: 324, y: 7.4, w: 10, text: 'ELEVEN', size: 1.2, color: '#ffe9a8', alpha: 0.3, wave: 2 }
    ],

    onLoad: function (RT) {
      resetState();
      reseatGates();
      RT.hud.set('sec', 'I - THE APOLOGY');
      RT.toast('every gamble in here prints its own odds. none of them lie.', 3.4);
    },

    onDeath: function (RT, cause) {
      S = {};
      RT.player.controlsReversed = false;
      RT.player.gravityFlip = false;
      var tx = ptx();
      if (tx > 28 && tx < 62) {
        L.diceFalls++;
        reseatGates();
        if (L.diceFalls === 2) RT.toast('two falls. the seams show now - green is real.', 2.4);
      }
      var lines = {
        void: ['there is no floor there. there never was.', 'down remains undefeated.'],
        spike: ['the floor did that.'],
        saw: ['it does not get tired. that is the whole design.'],
        laser: ['the lasers keep time. you did not.'],
        crush: ['from above, again.'],
        fake: ['that one was the two in three.']
      };
      var pool = lines[cause] || ['again. it is the same every time, which is the point.'];
      RT.toast(pool[RT.deaths % pool.length], 2);
    },

    onCheckpoint: function (RT, cp) {
      if (!cp) return;
      if (cp.tx === 179) startMarket();
    },

    onUpdate: function (RT, dt) {
      var p = RT.player;
      if (p.dead) return;
      var tx = ptx();

      /* the market arms itself on entry, checkpoint or no checkpoint */
      if (!L.marketOn && tx > 179.5) startMarket();
      if (tx > 179 && tx < 218) marketLap(dt);
      else RT.hud.clear('lap');

      /* a bought double jump survives death for free; the lamp is cosmetic */
      if (RT.deaths !== L.lastDeaths) {
        L.lastDeaths = RT.deaths;
        S = {};
      }

      /* I. the fake floor, and the first lesson that this is not trial one */
      if (!S.fake && p.onGround && tx > 13.6 && tx < 15.9 && p.y + p.h <= GROUND * T + 2) {
        S.fake = 1;
        carve(14, GROUND, '.'); carve(15, GROUND, '.');
        sfx('crumble'); sfx('troll');
        RT.cam.shake(3, 0.16);
        boom(14.9 * T, GROUND * T, ['#b9a77e', '#ffffff'], 20, 160, { gravity: 700 });
      }

      /* V. the ceiling walk, latched so the entry line cannot be teetered on */
      var flip = tx > 145.4 && tx < 157.6;
      if (flip !== !!S.flipOn) {
        S.flipOn = flip ? 1 : 0;
        sfx(flip ? 'portal' : 'powerup');
        RT.flash(flip ? '#c47ae0' : '#ffffff', 0.12);
        RT.cam.shake(4, 0.2);
        if (flip) RT.toast('up is down. you cannot jump up here. walk.', 1.8);
      }
      p.gravityFlip = flip;

      /* V. six sunken tiles where left is right */
      var inTrench = (p.y + p.h > 15.2 * T) && tx > 159.2 && tx < 173.4;
      p.controlsReversed = inTrench;
      if (inTrench && !S.revSaid) { S.revSaid = 1; sfx('troll'); RT.flash('#ffb0e0', 0.12); RT.toast('left is right down here. it is only twelve tiles.', 1.8); }

      /* section chip */
      var sec = tx < 28 ? 'I - THE APOLOGY' : tx < 63 ? 'II - THE DICE' :
                tx < 105 ? 'III - THE METRONOME' : tx < 141 ? 'IV - THE BARRELS' :
                tx < 179 ? 'V - THE INVERSION' : tx < 219 ? 'VI - THE MARKET' :
                tx < 255 ? 'VII - THE CHASE' : tx < 297 ? 'VIII - THE NEEDLE' :
                tx < 321 ? 'IX - THE WHEEL' : 'X - THE DOOR';
      if (sec !== L.section) { L.section = sec; RT.hud.set('sec', sec); }
    },

    onWin: function (RT) {
      RT.hud.clear('sec');
      RT.hud.clear('lap');
      if (RT.Tycoon && RT.Tycoon.stop) RT.Tycoon.stop();
      RT.particles.burst(RT.player.x + 10, RT.player.y + 14, {
        n: 70, colors: ['#3df0ff', '#ff3ea5', '#ffd23f', '#5bff9b', '#ffffff'],
        speed: 360, life: 1.6, size: 5, gravity: 240
      });
      RT.cam.shake(9, 0.7);
    },

    onDraw: function (RT, g, layer) {
      var t = RT.time || 0;
      var camx = RT.cam.x, vw = RT.view.w;
      var x0 = camx - vw / 2 - 64, x1 = camx + vw / 2 + 64;
      if (layer === 'back') { drawSectionMarks(g, x0, x1, t); return; }
      drawPlate(g, x0, x1, t);
      drawStripes(g, x0, x1, t);
      drawVoidHaze(g, x0, x1);
    }
  });

  /* ==================================================================== */
  /* TILE BOOKKEEPING + ART                                               */
  /* ==================================================================== */
  var dirty = {};
  function carve(tx, ty, ch) {
    var k = tx + '|' + ty;
    if (!(k in dirty)) dirty[k] = RT.getTile(tx, ty);
    RT.setTile(tx, ty, ch);
  }

  var MARKS = [[0, 'I'], [28, 'II'], [63, 'III'], [105, 'IV'], [141, 'V'],
               [179, 'VI'], [219, 'VII'], [255, 'VIII'], [297, 'IX'], [321, 'X']];
  function drawSectionMarks(g, x0, x1, t) {
    for (var i = 0; i < MARKS.length; i++) {
      var mx = MARKS[i][0] * T;
      if (mx < x0 - 40 || mx > x1 + 40) continue;
      g.save();
      g.globalAlpha = 0.14;
      g.strokeStyle = '#ffd23f'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(mx, 0); g.lineTo(mx, H * T); g.stroke();
      g.restore();
      RT.drawText(g, MARKS[i][1], mx + 14, 42 + Math.sin(t * 1.3 + i) * 2, {
        size: 24, color: 'rgba(255,210,63,0.2)', align: 'left'
      });
    }
  }

  function drawPlate(g, x0, x1, t) {
    if (x1 < 210 * T || x0 > 218 * T) return;
    var px = PLATE.x0 * T, pw = (PLATE.x1 - PLATE.x0) * T, py = PLATE.y1 * T;
    var live = !!L.plateArmed;
    g.save();
    g.globalAlpha = live ? 0.28 + 0.13 * Math.sin(t * 4) : 0.07;
    g.fillStyle = '#ffd23f';
    g.fillRect(px, py - 40, pw, 40);
    g.restore();
    g.fillStyle = live ? '#ffd23f' : '#6b5a2a';
    g.fillRect(px, py - 4, pw, 4);
    if (live) {
      RT.drawText(g, '+' + lapPay(L.laps || 0), px + pw / 2, py - 50 + Math.sin(t * 3) * 2, {
        size: 12, color: '#ffe9a8', stroke: 'rgba(40,20,0,0.85)', strokeWidth: 3
      });
    }
  }

  function drawStripes(g, x0, x1, t) {
    stripe(g, 145.4, 157.6, '#c47ae0', t, x0, x1, 'GRAVITY');
    stripe(g, 160, 172, '#ff3ea5', t, x0, x1, 'REVERSED');
  }
  function stripe(g, a, b, col, t, x0, x1, label) {
    if (x1 < a * T || x0 > b * T) return;
    g.save();
    g.globalAlpha = 0.14;
    for (var i = 0; i < 30; i++) {
      var sx = a * T + ((i * 23 + t * 20) % ((b - a) * T));
      poly(g, [sx, 0, sx + 10, 0, sx + 10 - 20, H * T, sx - 20, H * T], col);
    }
    g.restore();
    if (RT.player && !RT.player.dead) {
      var px = pcx() / T;
      if (px > a && px < b) {
        RT.drawText(g, label, (a + b) / 2 * T, 2.4 * T + Math.sin(t * 4) * 3, {
          size: 20, color: col, stroke: 'rgba(255,255,255,0.85)', strokeWidth: 5, alpha: 0.85
        });
      }
    }
  }

  function drawVoidHaze(g, x0, x1) {
    var spans = [[31, 56], [71, 88], [111, 134], [259, 287]];
    g.save();
    for (var i = 0; i < spans.length; i++) {
      var a = spans[i][0] * T, b = spans[i][1] * T;
      if (x1 < a || x0 > b) continue;
      var y = (GROUND + 1) * T;
      var lg = g.createLinearGradient(0, y - 40, 0, y + 240);
      lg.addColorStop(0, 'rgba(8,6,16,0)');
      lg.addColorStop(1, 'rgba(8,6,16,0.9)');
      g.fillStyle = lg;
      g.fillRect(Math.max(x0, a), y - 40, Math.min(x1, b) - Math.max(x0, a), 280);
    }
    g.restore();
  }
})();
