/* =========================================================================
 * RAGE TRIALS - LEVEL 9: TRUST NOTHING
 * -------------------------------------------------------------------------
 * The ultimate troll level. A pastel world with smiling clouds and a rainbow
 * that would very much like you to fall in a hole.
 *
 * Built from docs/research-troll.md SS1-2. THIRTY-SIX numbered trolls from
 * that catalogue, each used EXACTLY ONCE, escalating mild -> evil. The rules
 * that keep it funny, straight out of SS2, are obeyed to the letter:
 *   - instant respawn (engine: 0.55 s) and a checkpoint every ~12 tiles,
 *   - no RNG deaths: every troll is deterministic and learnable in one life,
 *   - every soft-lock resolves into a death (SS2.8) - see THE SHORTCUT,
 *   - the trap checkpoint costs 3 tiles, never a run (SS29 telegraph rule),
 *   - the death counter is a trophy: it earns you a title in the HUD (SS2.2).
 *
 * Grid: 196 x 16. Walking surface is row 11; the slab is rows 11-15, so a
 * hole punched through it is a real void death. Ceilings and ledges live on
 * rows 4-8.
 *
 *   cols     zone                troll numbers (docs/research-troll.md SS1)
 *   ------   -----------------   ---------------------------------------
 *     0- 23  THE NICE PART       6 shy block, 1 fake floor, 2 honest crumble,
 *                                3 hole opens ahead, 9 wall pops out, + the
 *                                sign that lies (the level's opening promise)
 *    24- 48  POINTY THINGS       4 pop-out spikes, 5 spike block, 7 coin bait,
 *                                8 exploding coin, 10 spring into spikes
 *    49- 72  THE MIDDLE          11 kaizo block, 12 lying arrow, 13 dropped
 *                                enemy, 14 deadly scenery, 15 poison mushroom
 *    73-103  SPICY               16 platform that rides you back, 17 ice,
 *                                19 peeking saw, 20 falling ceiling,
 *                                21 the fruit that falls UP
 *   104-125  UPSIDE DOWN         23 reversed controls, 24 gravity flip,
 *                                25 teleporting wall, 27 spawn blocking
 *   126-155  THE REPEAT          28 twice twice, 29 trap checkpoint,
 *                                31 evil save point, 30 the CP1 gag
 *   156-195  THE FINALE          26 trick doors, 37 cascading trap,
 *                                36 the soft-lock that kills you, the SAFE
 *                                ZONE, 33 fake goal, 35 the exit is behind
 *                                you, 22 THE MOON, 34 the goal that runs
 *                                away - three times, and then gives up.
 *                                32 (useless collectibles) runs level-wide.
 *
 * Everything this file mutates in the tilemap is recorded in `dirty` and put
 * back on death, so a retry is always the level you first walked into. The
 * only permanent change is the door wall in the finale, which is progress.
 * ========================================================================= */
(function () {
  var RT = window.RT;
  if (!RT) return;

  var T = 32;
  var W = 196, H = 16;
  var GROUND = 11;                 /* top solid row of the main slab */

  /* deterministic scenery hash - background art must never flicker */
  function h1(i) { var s = Math.sin(i * 12.9898 + 4.1414) * 43758.5453; return s - Math.floor(s); }

  /* ------------------------------------------------------------- helpers */
  function P() { return RT.player; }
  function pcx() { var p = P(); return p.x + p.w / 2; }
  function pcy() { var p = P(); return p.y + p.h / 2; }
  function ptx() { return pcx() / T; }
  function alive() { var p = P(); return p && !p.dead; }
  function pbox(inset) {
    var p = P(), i = inset === undefined ? 3 : inset;
    return { x: p.x + i, y: p.y + i, w: p.w - i * 2, h: p.h - i * 2 };
  }
  function hitP(x, y, w, h, inset) {
    return alive() && RT.overlaps(pbox(inset), { x: x, y: y, w: w, h: h });
  }
  function near(x, y, r) {
    if (!alive()) return false;
    var dx = pcx() - x, dy = pcy() - y;
    return dx * dx + dy * dy < r * r;
  }
  function sfx(n) { if (RT.sfx) RT.sfx(n); }
  function boom(x, y, cols, n, sp, o) {
    o = o || {};
    RT.particles.burst(x, y, {
      n: n || 18, colors: cols || ['#ffffff'], speed: sp || 200,
      life: o.life || 0.6, size: o.size || 3, gravity: o.gravity === undefined ? 380 : o.gravity,
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
  /* a pair of cartoon eyes + a mouth, the level's one visual language */
  function face(g, cx, cy, r, mood, t) {
    var blink = (Math.sin(t * 1.7 + cx * 0.01) > 0.985) ? 0.15 : 1;
    circ(g, cx - r * 0.55, cy - r * 0.12, r * 0.22, 'rgba(40,24,52,0.92)');
    circ(g, cx + r * 0.55, cy - r * 0.12, r * 0.22, 'rgba(40,24,52,0.92)');
    if (blink < 1) {
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.fillRect(cx - r * 0.8, cy - r * 0.2, r * 1.6, r * 0.16);
    }
    g.strokeStyle = 'rgba(40,24,52,0.92)';
    g.lineWidth = Math.max(1.4, r * 0.13);
    g.lineCap = 'round';
    g.beginPath();
    if (mood === 'evil') {
      g.moveTo(cx - r * 0.5, cy + r * 0.5);
      g.quadraticCurveTo(cx, cy + r * 0.05, cx + r * 0.5, cy + r * 0.5);
    } else {
      g.moveTo(cx - r * 0.42, cy + r * 0.3);
      g.quadraticCurveTo(cx, cy + r * 0.72, cx + r * 0.42, cy + r * 0.3);
    }
    g.stroke();
  }

  /* ==================================================================== */
  /* CUSTOM ENTITIES                                                      */
  /* All prefixed l9 so they can never collide with the entities.js       */
  /* library. Parked entities sit at y = PARK, which is the only reliable */
  /* way to switch a solid off (a zero-size rect is still a point, and a  */
  /* point inside the player's box still overlaps).                       */
  /* ==================================================================== */
  var PARK = -1e6;

  function def(name, spec) {
    RT.defineEntity(name, {
      layer: spec.layer || 'main',
      solid: spec.solid || false,
      shadow: !!spec.shadow,
      init: function (e, d) {
        d = d || e.spawnDef || {};
        e.at = 0;
        e.seed = h1(e.id * 3.3 + 1.1);
        if (spec.init) { try { spec.init(e, d); } catch (err) { log(name + '.init', err); } }
        e.home = { x: e.x, y: e.y, w: e.w, h: e.h };
      },
      update: function (e, dt) {
        e.at += dt;
        if (!spec.update) return;
        try { spec.update(e, dt); } catch (err) { log(name + '.update', err); }
      },
      draw: function (e, g) {
        if (!spec.draw) return;
        g.save();
        try { spec.draw(e, g); } catch (err) { log(name + '.draw', err); }
        g.restore();
      },
      onPlayerTouch: spec.touch ? function (e, p, side) {
        try { spec.touch(e, p, side); } catch (err) { log(name + '.touch', err); }
      } : undefined,
      onReset: function (e) {
        if (e.home) { e.x = e.home.x; e.y = e.home.y; e.w = e.home.w; e.h = e.home.h; }
        e.at = 0;
        if (spec.reset) { try { spec.reset(e); } catch (err) { log(name + '.reset', err); } }
      }
    });
  }
  function log(where, err) {
    try {
      (window.__entityErrors || (window.__entityErrors = [])).push(where + ': ' + (err && err.message || err));
      if (RT.logError) RT.logError(where, err);
    } catch (e) { }
  }

  /* --- 6. the coin block that runs away ---------------------------------- */
  def('l9shy', {
    init: function (e) { e.fled = 0; e.wob = 0; },
    update: function (e, dt) {
      if (!e.fled && near(e.x + e.w / 2, e.y + e.h / 2, T * 3.2)) {
        e.fled = 1;
        sfx('troll');
        RT.speech(e.x + e.w / 2, e.y - 8, 'nope', 1.2);
      }
      if (e.fled) {
        e.y -= 78 * dt;
        e.wob += dt;
        if (e.y < -T * 6) e.y = -T * 6;
      }
    },
    draw: function (e, g) {
      var x = e.x + Math.sin(e.wob * 7) * 3, y = e.y, w = e.w, hh = e.h;
      rr(g, x, y, w, hh, 5, '#ffd23f');
      rr(g, x + 2, y + 2, w - 4, hh * 0.34, 3, '#ffe894');
      g.strokeStyle = 'rgba(120,70,10,0.5)'; g.lineWidth = 1.5;
      RT.roundRect(g, x + 1, y + 1, w - 2, hh - 2, 4); g.stroke();
      RT.drawText(g, '?', x + w / 2, y + hh * 0.55, {
        size: 17, color: '#7a4a08', stroke: 'rgba(255,255,255,0.7)', strokeWidth: 3
      });
      if (e.fled) face(g, x + w / 2, y + hh * 0.72, w * 0.32, 'evil', e.at);
    }
  });

  /* --- 9. the wall that pops out mid-run --------------------------------- */
  def('l9wall', {
    solid: true,
    init: function (e, d) {
      e.w = T; e.h = T * 2;
      e.rest = { x: e.x, y: e.y };
      e.y = PARK;
      e.out = 0;
      e.tripX = (d.trip === undefined ? (e.rest.x / T) - 4 : d.trip) * T;
    },
    update: function (e, dt) {
      if (!e.out && alive() && pcx() > e.tripX) {
        e.out = 1;
        e.y = e.rest.y;
        sfx('thwomp');
        RT.cam.shake(5, 0.2);
        boom(e.rest.x + T / 2, e.rest.y + e.h, ['#ffd23f', '#ffffff'], 14, 190, { gravity: 500 });
        RT.speech(e.rest.x + T / 2, e.rest.y - 10, 'BONK', 1.1);
      }
      if (e.out && e.out < 1.0001) e.out = Math.min(1.0001, e.out + dt * 7);
    },
    reset: function (e) { e.out = 0; e.y = PARK; },
    draw: function (e, g) {
      if (!e.out) return;
      var x = e.rest.x, y = e.rest.y, hh = e.h * Math.min(1, e.out);
      rr(g, x, y + (e.h - hh), T, hh, 4, '#c47ae0');
      rr(g, x + 3, y + (e.h - hh) + 3, T - 6, Math.max(2, hh - 6), 3, '#e5a8f5');
      face(g, x + T / 2, y + e.h - 18, 9, 'evil', e.at);
    }
  });

  /* --- 5. the block that sprouts spikes when you hit it ------------------ */
  def('l9block', {
    solid: true,
    init: function (e, d) { e.payload = d.payload || 'coin'; e.hit = 0; e.pop = 0; },
    update: function (e, dt) {
      if (e.pop > 0 && e.pop < 1) e.pop = Math.min(1, e.pop + dt * 9);
      if (e.hit === 2 && e.pop > 0.45 && hitP(e.x + 5, e.y - 16, e.w - 10, 17, 2)) RT.killPlayer('spike');
    },
    touch: function (e, p, side) {
      if (side !== 'bottom' || e.hit) return;
      e.hit = e.payload === 'spike' ? 2 : 1;
      if (e.payload === 'spike') {
        e.pop = 0.001;
        sfx('spike'); sfx('troll');
        RT.cam.shake(6, 0.25);
        RT.hitstop(3);
      } else {
        sfx('coin');
        RT.collectCoin(e.x + e.w / 2, e.y - 10, 1);
        boom(e.x + e.w / 2, e.y - 4, ['#ffd23f', '#fff6c4'], 10, 150, { gravity: 300 });
      }
    },
    reset: function (e) { e.hit = 0; e.pop = 0; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h;
      if (e.hit === 2 && e.pop > 0) {
        var len = 16 * e.pop;
        for (var i = 0; i < 3; i++) {
          var sx = x + 5 + i * ((w - 10) / 3);
          poly(g, [sx, y, sx + (w - 10) / 3, y, sx + (w - 10) / 6, y - len], '#ff5aa0');
          poly(g, [sx + 2, y, sx + (w - 10) / 3 - 2, y, sx + (w - 10) / 6, y - len * 0.7], '#ffe2f2');
        }
      }
      var dip = e.hit ? 2 : 0;
      rr(g, x, y + dip, w, hh - dip, 5, e.hit ? '#a57b45' : '#ffd23f');
      rr(g, x + 2, y + 2 + dip, w - 4, (hh - dip) * 0.32, 3, e.hit ? '#c19a62' : '#ffe894');
      g.strokeStyle = 'rgba(120,70,10,0.5)'; g.lineWidth = 1.5;
      RT.roundRect(g, x + 1, y + 1 + dip, w - 2, hh - 2 - dip, 4); g.stroke();
      RT.drawText(g, e.hit ? '-' : '?', x + w / 2, y + hh * 0.55 + dip, {
        size: 17, color: '#7a4a08', stroke: 'rgba(255,255,255,0.7)', strokeWidth: 3
      });
    }
  });

  /* --- 8. the coin that explodes ----------------------------------------- */
  def('l9boom', {
    init: function (e) { e.w = T * 0.7; e.h = T * 0.7; e.fuse = 0; e.gone = 0; },
    update: function (e, dt) {
      if (e.gone) return;
      if (!e.fuse && hitP(e.x, e.y, e.w, e.h, 1)) {
        e.fuse = 0.55;
        sfx('coin'); sfx('tick');
        RT.speech(e.x + e.w / 2, e.y - 12, 'thank you', 0.9);
      }
      if (e.fuse > 0) {
        e.fuse -= dt;
        if (e.fuse <= 0) {
          e.gone = 1;
          sfx('death'); sfx('troll');
          RT.flash('#fff0c0', 0.16);
          RT.cam.shake(9, 0.4);
          boom(e.x + e.w / 2, e.y + e.h / 2, ['#ffd23f', '#ff7a3a', '#ffffff', '#ff3ea5'], 40, 320, { life: 0.8, size: 4 });
          RT.particles.ring(e.x + e.w / 2, e.y + e.h / 2, '#ffd23f', 6, 96, 0.45);
          if (near(e.x + e.w / 2, e.y + e.h / 2, T * 2.1)) RT.killPlayer('boom');
        }
      }
    },
    reset: function (e) { e.fuse = 0; e.gone = 0; },
    draw: function (e, g) {
      if (e.gone) return;
      var cx = e.x + e.w / 2, cy = e.y + e.h / 2;
      var sq = e.fuse > 0 ? 1 + Math.sin(e.fuse * 46) * 0.18 : 1;
      var rx = Math.abs(Math.cos(e.at * 3.2)) * e.w * 0.42 + 1.5;
      g.save(); g.translate(cx, cy); g.scale(sq, sq);
      if (e.fuse > 0 && Math.sin(e.fuse * 46) > 0) {
        g.shadowBlur = 0;
        circ(g, 0, 0, e.w * 0.52, 'rgba(255,120,60,0.55)');
      }
      g.beginPath();
      if (g.ellipse) g.ellipse(0, 0, rx, e.h * 0.44, 0, 0, 6.2832); else g.arc(0, 0, rx, 0, 6.2832);
      g.fillStyle = '#ffd23f'; g.fill();
      g.strokeStyle = 'rgba(150,95,10,0.6)'; g.lineWidth = 1.4; g.stroke();
      if (rx > 4) RT.drawText(g, '$', 0, 1, { size: 11, color: '#a6700c' });
      g.restore();
    }
  });

  /* --- 13. the enemy dropped directly on your head ----------------------- */
  def('l9drop', {
    init: function (e, d) {
      e.w = T * 1.6; e.h = T * 1.6;
      e.rest = { x: e.x, y: e.y };
      e.tripX = (d.trip === undefined ? (e.x / T) - 5 : d.trip) * T;
      e.phase = 'wait'; e.shadow = 0; e.vy = 0; e.land = 0;
    },
    update: function (e, dt) {
      if (e.phase === 'wait') {
        if (alive() && pcx() > e.tripX) { e.phase = 'aim'; e.shadow = 0; e.x = pcx() - e.w / 2; }
        return;
      }
      if (e.phase === 'aim') {
        e.shadow += dt;
        e.x += (pcx() - e.w / 2 - e.x) * Math.min(1, dt * 3);
        if (e.shadow > 0.42) { e.phase = 'fall'; e.y = RT.cam.y - RT.view.h / 2 - e.h; e.vy = 0; sfx('charge'); }
        return;
      }
      if (e.phase === 'fall') {
        e.vy = Math.min(1100, e.vy + 2600 * dt);
        e.y += e.vy * dt;
        if (hitP(e.x + 5, e.y + 5, e.w - 10, e.h - 10, 3)) {
          var p = P();
          if (p.vy > 60 && p.y + p.h < e.y + e.h * 0.6) { e.phase = 'squish'; e.land = 0.5; RT.bounce(-380); sfx('stomp'); }
          else RT.killPlayer('crush');
          return;
        }
        if (RT.rectHitsSolid({ x: e.x + 4, y: e.y + e.h, w: e.w - 8, h: 4 })) {
          e.phase = 'squish'; e.land = 0.7;
          sfx('thwomp'); RT.cam.shake(6, 0.3); RT.hitstop(2);
          boom(e.x + e.w / 2, e.y + e.h, ['#ffffff', '#d7b8ee'], 16, 220, { gravity: 700 });
        }
        return;
      }
      if (e.phase === 'squish') {
        e.land -= dt;
        if (hitP(e.x + 6, e.y + 6, e.w - 12, e.h - 12, 3) && e.land > 0.15) RT.killPlayer('crush');
        if (e.land <= 0) e.phase = 'gone';
      }
    },
    reset: function (e) { e.phase = 'wait'; e.x = e.rest.x; e.y = e.rest.y; e.vy = 0; e.shadow = 0; },
    draw: function (e, g) {
      if (e.phase === 'wait' || e.phase === 'gone') return;
      if (e.phase === 'aim') {
        /* the 12-frame shadow that turns a cheap shot into a dodge */
        var gy = groundUnder(e.x + e.w / 2);
        var k = Math.min(1, e.shadow / 0.42);
        g.globalAlpha = 0.18 + k * 0.4;
        g.fillStyle = '#2a1636';
        g.beginPath();
        if (g.ellipse) g.ellipse(e.x + e.w / 2, gy - 2, e.w * (0.3 + k * 0.28), e.w * 0.16, 0, 0, 6.2832);
        else g.arc(e.x + e.w / 2, gy - 2, e.w * 0.3, 0, 6.2832);
        g.fill();
        g.globalAlpha = 1;
        return;
      }
      var sy = e.phase === 'squish' ? 0.55 : 1, sx = e.phase === 'squish' ? 1.35 : 1;
      var cx = e.x + e.w / 2, cy = e.y + e.h - (e.h * sy) / 2;
      g.save(); g.translate(cx, cy); g.scale(sx, sy);
      circ(g, 0, 0, e.w * 0.48, '#8a5bd6');
      circ(g, 0, -e.h * 0.06, e.w * 0.40, '#b184ef');
      face(g, 0, e.h * 0.02, e.w * 0.26, 'evil', e.at);
      g.restore();
    }
  });
  function groundUnder(px) {
    var tx = Math.floor(px / T);
    for (var ty = Math.floor(pcy() / T); ty < H; ty++) if (RT.getTile(tx, ty) === '#') return ty * T;
    return H * T;
  }

  /* --- 14. deadly background scenery (the cloud that smiles) ------------- */
  def('l9cloud', {
    layer: 'back',
    init: function (e, d) {
      e.w = T * 3; e.h = T * 1.6;
      e.rest = { x: e.x, y: e.y };
      e.armed = 0; e.drift = 0; e.chase = 0;
      e.range = (d.range === undefined ? 6 : d.range) * T;
    },
    update: function (e, dt) {
      e.drift += dt;
      if (!e.armed && near(e.x + e.w / 2, e.y + e.h / 2, e.range)) {
        e.armed = 1;
        sfx('troll');
        RT.speech(e.x + e.w / 2, e.y - 10, 'hello', 1.3);
      }
      if (e.armed !== 1) {
        /* not armed, or bored: drift home and be scenery again */
        e.x += (e.rest.x + Math.sin(e.drift * 0.4) * 14 - e.x) * Math.min(1, dt * 1.6);
        e.y += (e.rest.y - e.y) * Math.min(1, dt * 1.6);
        return;
      }
      /* one drift, one death - then it has had its fun (research SS14) */
      e.chase += dt;
      if (e.chase > 1.8 || pcx() > e.rest.x + T * 9) {
        e.armed = 2;
        RT.speech(e.x + e.w / 2, e.y - 10, 'bye then', 1.2);
        return;
      }
      /* it drifts at you, slowly, which is the whole telegraph */
      var tx = pcx() - e.w / 2, ty = pcy() - e.h / 2;
      e.x += (tx - e.x) * Math.min(1, dt * 0.9);
      e.y += (ty - e.y) * Math.min(1, dt * 0.9);
      if (hitP(e.x + 10, e.y + 8, e.w - 20, e.h - 16, 3)) RT.killPlayer('cloud');
    },
    reset: function (e) { e.armed = 0; e.chase = 0; e.x = e.rest.x; e.y = e.rest.y; e.drift = 0; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h;
      var col = e.armed === 1 ? '#ffd9ec' : '#ffffff';
      g.globalAlpha = e.armed === 1 ? 0.98 : 0.9;
      circ(g, x + w * 0.26, y + hh * 0.62, hh * 0.42, col);
      circ(g, x + w * 0.5, y + hh * 0.46, hh * 0.56, col);
      circ(g, x + w * 0.74, y + hh * 0.62, hh * 0.40, col);
      g.fillStyle = col;
      g.fillRect(x + w * 0.2, y + hh * 0.55, w * 0.6, hh * 0.42);
      g.globalAlpha = 1;
      face(g, x + w * 0.5, y + hh * 0.52, hh * 0.3, e.armed === 1 ? 'evil' : 'nice', e.at);
      if (e.armed === 1) {
        g.fillStyle = 'rgba(255,90,160,0.5)';
        for (var i = 0; i < 3; i++) {
          var fx = x + w * (0.3 + i * 0.2);
          poly(g, [fx - 3, y + hh * 0.92, fx + 3, y + hh * 0.92, fx, y + hh * 0.92 + 7 + Math.sin(e.at * 9 + i) * 3], 'rgba(255,90,160,0.55)');
        }
      }
    }
  });

  /* --- 16. the platform that takes you the wrong way --------------------- */
  def('l9ride', {
    solid: true,
    init: function (e, d) {
      e.w = T * 3; e.h = T * 0.75;
      e.rest = { x: e.x, y: e.y };
      e.mode = 'idle'; e.rides = 0; e.hold = 0;
      e.leftX = (d.leftX === undefined ? 74 : d.leftX) * T;
      e.rightX = (d.rightX === undefined ? 80 : d.rightX) * T;
    },
    update: function (e, dt) {
      var p = P(), on = alive() && p.onGround && p.rideEnt === e;
      if (e.mode === 'idle') {
        if (on) {
          e.rides++;
          e.mode = e.rides === 1 ? 'back' : 'fwd';
          sfx('crumble');
          if (e.rides === 1) {
            RT.speech(e.x + e.w / 2, e.y - 14, 'this way!', 1.2);
            RT.toast('it is a very helpful platform', 1.6);
          } else {
            RT.speech(e.x + e.w / 2, e.y - 14, 'fine.', 1.1);
          }
        }
        /* drift home so a retry always finds it where it was */
        e.x += (e.rest.x - e.x) * Math.min(1, dt * 2.4);
        return;
      }
      var tgt = e.mode === 'back' ? e.leftX : e.rightX;
      var d2 = tgt - e.x;
      var step = 108 * dt * (d2 < 0 ? -1 : 1);
      if (Math.abs(step) > Math.abs(d2)) { e.x = tgt; e.hold += dt; } else e.x += step;
      if (e.hold > 0.7) { e.hold = 0; e.mode = 'idle'; }
    },
    reset: function (e) { e.mode = 'idle'; e.x = e.rest.x; e.hold = 0; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h;
      rr(g, x, y, w, hh, 4, '#59c6ff');
      rr(g, x + 2, y + 2, w - 4, hh * 0.4, 3, '#a8e6ff');
      g.fillStyle = 'rgba(20,60,90,0.35)';
      g.fillRect(x + 2, y + hh - 3, w - 4, 3);
      face(g, x + w / 2, y + hh * 0.48, 7, e.mode === 'back' ? 'evil' : 'nice', e.at);
    }
  });

  /* --- 19. the saw that hides, travels, and peeks ------------------------
   * Fixed spots on a fixed cycle. Research SS2.4: memorisation is only a skill
   * if the thing you memorise never changes. The gag survives; the RNG does not. */
  def('l9saw', {
    init: function (e, d) {
      e.w = T * 1.5; e.h = T * 1.5;
      e.rest = { x: e.x, y: e.y };
      e.spots = (d.spots || [97, 100]).slice();
      e.floorY = (d.floor === undefined ? GROUND : d.floor) * T;
      e.i = 0; e.spin = 0; e.timer = 0;
      e.phase = 'wait';
      e.x = e.spots[0] * T - e.w / 2;
      e.y = e.floorY + T * 1.1;
    },
    update: function (e, dt) {
      e.spin += dt * 13;
      var deep = e.floorY + T * 1.1, up = e.floorY - e.h * 0.62;
      if (e.phase === 'wait') {
        if (alive() && pcx() > (e.spots[0] - 4) * T) { e.phase = 'hidden'; e.timer = 0.55; sfx('tick'); }
        return;
      }
      e.timer -= dt;
      if (e.phase === 'hidden') {
        e.x = e.spots[e.i] * T - e.w / 2;
        e.y = deep;
        if (e.timer <= 0) { e.phase = 'out'; e.timer = 0.95; sfx('charge'); }
        return;
      }
      if (e.phase === 'out') {
        e.y += (up - e.y) * Math.min(1, dt * 11);
        if (e.y < e.floorY - 6) hurtIfTouching(e);
        if (e.timer <= 0) { e.phase = 'dive'; e.timer = 0.75; }
        return;
      }
      if (e.phase === 'dive') {
        e.y += (deep - e.y) * Math.min(1, dt * 9);
        if (e.y < e.floorY - 6) hurtIfTouching(e);
        if (e.timer <= 0) {
          e.i = (e.i + 1) % e.spots.length;
          e.phase = 'hidden'; e.timer = 0.55;
        }
        return;
      }
    },
    reset: function (e) {
      e.phase = 'wait'; e.i = 0; e.timer = 0;
      e.x = e.spots[0] * T - e.w / 2; e.y = e.floorY + T * 1.1;
    },
    draw: function (e, g) {
      if (e.phase === 'wait') return;
      var cx = e.x + e.w / 2, cy = e.y + e.h / 2, r = e.w / 2, i;
      /* the rumble that says which hole it is coming out of */
      if (e.phase === 'hidden') {
        g.globalAlpha = 0.5 + Math.sin(e.at * 26) * 0.2;
        g.fillStyle = '#ff5aa0';
        for (i = 0; i < 3; i++) g.fillRect(cx - 12 + i * 9, e.floorY - 3, 5, 3);
        g.globalAlpha = 1;
        return;
      }
      g.save();
      g.translate(cx, cy); g.rotate(e.spin);
      g.fillStyle = '#e6eaf2';
      g.beginPath();
      for (i = 0; i < 12; i++) {
        var a2 = (i / 12) * 6.2832, b2 = ((i + 0.5) / 12) * 6.2832;
        g.lineTo(Math.cos(a2) * r, Math.sin(a2) * r);
        g.lineTo(Math.cos(b2) * r * 0.74, Math.sin(b2) * r * 0.74);
      }
      g.closePath(); g.fill();
      circ(g, 0, 0, r * 0.4, '#ff5aa0');
      circ(g, 0, 0, r * 0.18, '#ffe2f2');
      g.restore();
      face(g, cx, cy + r * 0.1, r * 0.4, 'evil', e.at);
    }
  });
  function hurtIfTouching(e) {
    if (hitP(e.x + 5, e.y + 5, e.w - 10, e.h - 10, 3)) RT.killPlayer('saw');
  }

  /* --- 21. the fruit that falls UP --------------------------------------- */
  def('l9fruit', {
    init: function (e, d) {
      e.w = T * 0.8; e.h = T * 0.8;
      e.rest = { x: e.x, y: e.y };
      e.tripX = (d.trip === undefined ? (e.x / T) - 3 : d.trip) * T;
      e.phase = 'wait'; e.vy = 0; e.wob = 0;
    },
    update: function (e, dt) {
      if (e.phase === 'wait') {
        if (alive() && pcx() > e.tripX) { e.phase = 'wobble'; e.wob = 0; }
        return;
      }
      if (e.phase === 'wobble') {
        e.wob += dt;
        if (e.wob > 0.28) { e.phase = 'up'; e.vy = -520; sfx('spring'); }
        return;
      }
      e.vy += (e.phase === 'up' ? 900 : 2000) * dt;
      e.y += e.vy * dt;
      if (e.phase === 'up' && e.vy >= 0) e.phase = 'down';
      if (e.phase === 'up' && RT.rectHitsSolid({ x: e.x + 3, y: e.y - 3, w: e.w - 6, h: 4 })) {
        e.vy = 120; e.phase = 'down';
        sfx('bonk'); RT.cam.shake(3, 0.12);
        boom(e.x + e.w / 2, e.y, ['#ffffff', '#ff5aa0'], 8, 130, { gravity: 300 });
      }
      if (hitP(e.x + 3, e.y + 3, e.w - 6, e.h - 6, 3)) RT.killPlayer('fruit');
      if (e.y > (H + 3) * T) e.phase = 'gone';
    },
    reset: function (e) { e.phase = 'wait'; e.x = e.rest.x; e.y = e.rest.y; e.vy = 0; },
    draw: function (e, g) {
      if (e.phase === 'gone') return;
      var wob = e.phase === 'wobble' ? Math.sin(e.at * 44) * 3 : 0;
      var cx = e.x + e.w / 2 + wob, cy = e.y + e.h / 2;
      circ(g, cx - e.w * 0.2, cy + e.h * 0.1, e.w * 0.32, '#ff3b5c');
      circ(g, cx + e.w * 0.22, cy + e.h * 0.14, e.w * 0.3, '#e42748');
      circ(g, cx - e.w * 0.28, cy + 0, e.w * 0.1, 'rgba(255,255,255,0.7)');
      g.strokeStyle = '#4a8f3c'; g.lineWidth = 2; g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx - e.w * 0.2, cy - e.h * 0.2);
      g.quadraticCurveTo(cx, cy - e.h * 0.75, cx + e.w * 0.3, cy - e.h * 0.5);
      g.stroke();
      if (e.phase === 'up') {
        g.globalAlpha = 0.45; g.fillStyle = '#ffd6e2';
        g.fillRect(cx - 2, cy + e.h * 0.4, 4, 16);
        g.globalAlpha = 1;
      }
    }
  });

  /* --- 22. THE MOON ------------------------------------------------------ */
  /* Grows in the background for 195 tiles, drops once, and then - the joke -
   * it is the staircase to the real exit. */
  def('l9moon', {
    solid: true,
    init: function (e, d) {
      e.w = T * 5; e.h = T * 3;
      e.rest = { x: e.x, y: e.y };
      e.y = PARK;
      e.phase = 'sky'; e.vy = 0; e.tripX = (d.trip === undefined ? 178 : d.trip) * T;
    },
    update: function (e, dt) {
      if (e.phase === 'sky') {
        if (alive() && pcx() > e.tripX) {
          e.phase = 'fall';
          e.y = RT.cam.y - RT.view.h / 2 - e.h - T * 2;
          e.vy = 0;
          sfx('charge');
          RT.banner(['THE MOON', 'it has been getting closer for nine minutes'], 2.2);
        }
        return;
      }
      if (e.phase === 'fall') {
        e.vy = Math.min(1250, e.vy + 1900 * dt);
        e.y += e.vy * dt;
        if (e.y >= e.rest.y) {
          e.y = e.rest.y; e.phase = 'landed';
          sfx('thwomp'); sfx('death');
          RT.cam.shake(16, 0.8);
          RT.hitstop(5);
          RT.flash('#fff3d0', 0.2);
          boom(e.x + e.w / 2, e.y + e.h, ['#ffffff', '#e7e2f0', '#c9bede'], 46, 400, { life: 1.1, size: 5, spreadX: e.w });
          RT.particles.ring(e.x + e.w / 2, e.y + e.h, '#ffffff', 10, 190, 0.6);
          RT.toast('it missed. climb it.', 2.4);
        }
        if (hitP(e.x + 6, e.y + 6, e.w - 12, e.h - 12, 3)) RT.killPlayer('moon');
      }
    },
    reset: function (e) {
      /* once it has fallen it STAYS fallen - it is the way up */
      if (e.phase === 'landed') { e.y = e.rest.y; return; }
      e.phase = 'sky'; e.y = PARK; e.vy = 0;
    },
    draw: function (e, g) {
      if (e.phase === 'sky') return;
      var cx = e.x + e.w / 2, cy = e.y + e.h * 0.62, r = e.w * 0.5;
      circ(g, cx, cy, r, '#efe8f7');
      circ(g, cx - r * 0.2, cy - r * 0.18, r * 0.86, '#fbf7ff');
      for (var i = 0; i < 9; i++) {
        var a = h1(i * 4.7) * 6.2832, d = h1(i * 2.1) * r * 0.72;
        circ(g, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 3 + h1(i) * 7, 'rgba(180,165,205,0.55)');
      }
      face(g, cx, cy - r * 0.05, r * 0.42, e.phase === 'landed' ? 'nice' : 'evil', e.at);
      /* it is a solid: show the player exactly where the top is */
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(e.x + 6, e.y, e.w - 12, 2);
    }
  });

  /* --- 29 + 31. the checkpoint that is a lie, and the one that shoots ---- */
  def('l9flag', {
    init: function (e) { e.w = T; e.h = T * 2; e.state = 'up'; e.fall = 0; },
    update: function (e, dt) {
      if (e.state === 'up') {
        if (hitP(e.x - 4, e.y, e.w + 8, e.h, 2)) {
          e.state = 'falling';
          sfx('checkpoint');
          RT.particles.ring(e.x + e.w / 2, e.y + e.h * 0.4, '#8dff9a', 6, 60, 0.4);
        }
        return;
      }
      if (e.state === 'falling') {
        e.fall += dt;
        if (e.fall > 0.35 && !e.said) {
          e.said = 1;
          sfx('troll'); sfx('fake');
          RT.toast('that was not a checkpoint', 1.8);
          RT.speech(e.x + e.w / 2, e.y - 6, 'haha', 1.2);
          RT.cam.shake(3, 0.18);
          boom(e.x + e.w / 2, e.y + e.h, ['#8dff9a', '#ffffff'], 12, 140, { gravity: 500 });
        }
        if (e.fall > 2) e.state = 'down';
      }
    },
    reset: function (e) { e.state = 'up'; e.fall = 0; e.said = 0; },
    draw: function (e, g) {
      var lean = e.state === 'up' ? 0 : Math.min(1.35, (e.fall || 0) * 2.2);
      g.save();
      g.translate(e.x + e.w / 2, e.y + e.h);
      g.rotate(lean);
      g.fillStyle = '#c9d2de';
      g.fillRect(-2.5, -e.h, 5, e.h);
      var flap = Math.sin(e.at * 4) * 3;
      poly(g, [2.5, -e.h + 2, 2.5 + 20, -e.h + 9 + flap, 2.5, -e.h + 17], e.state === 'up' ? '#8dff9a' : '#ff8db0');
      circ(g, 0, -e.h - 2, 3.4, '#ffffff');
      if (e.state !== 'up') face(g, 11, -e.h + 9, 5, 'evil', e.at);
      g.restore();
    }
  });

  /* --- 26. the three doors ----------------------------------------------- */
  def('l9door', {
    init: function (e, d) {
      e.w = T; e.h = T * 2;
      e.real = !!d.real;
      e.label = d.label || '?';
      e.used = 0; e.open = 0;
    },
    update: function (e, dt) {
      if (e.open > 0) e.open = Math.min(1, e.open + dt * 4);
      if (e.used || !hitP(e.x + 2, e.y + 2, e.w - 4, e.h - 4, 2)) return;
      e.used = 1; e.open = 0.001;
      if (e.real) {
        sfx('door'); sfx('win');
        RT.toast('the door was real. suspicious.', 1.8);
        RT.flash('#bfffd0', 0.14);
        boom(e.x + e.w / 2, e.y + e.h / 2, ['#8dff9a', '#ffffff'], 22, 200);
        L.doorOpen = 1;
        for (var ty = 7; ty <= 10; ty++) RT.setTile(166, ty, '.');
        RT.emit('l9door', e.label);
      } else if (L.doorOpen) {
        sfx('door');
        RT.speech(e.x + e.w / 2, e.y - 8, 'too late', 0.9);
      } else {
        sfx('troll'); sfx('bonk');
        RT.cam.shake(5, 0.24);
        RT.speech(e.x + e.w / 2, e.y - 8, 'wrong', 1.0);
        var p = P();
        p.x = Math.max(T, p.x - T * 4.2);
        p.vx = 0; p.vy = 0;
        boom(p.x + p.w / 2, p.y + p.h / 2, ['#ff8db0', '#ffffff'], 16, 170);
      }
    },
    reset: function (e) { e.used = 0; e.open = 0; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h;
      rr(g, x - 3, y - 4, w + 6, hh + 5, 5, '#6b4b86');
      var swing = e.open > 0 ? (1 - e.open) : 1;
      g.save();
      g.translate(x + 1, y);
      g.scale(Math.max(0.06, swing), 1);
      rr(g, 0, 0, w - 2, hh - 1, 4, e.used ? (e.real ? '#8dff9a' : '#ff8db0') : '#e0b25f');
      rr(g, 2, 2, w - 6, (hh - 1) * 0.42, 3, 'rgba(255,255,255,0.28)');
      g.restore();
      circ(g, x + w - 8, y + hh * 0.55, 3, '#ffe9a8');
      RT.drawText(g, e.label, x + w / 2, y - 10, {
        size: 12, color: '#fff6d8', stroke: 'rgba(60,30,70,0.8)', strokeWidth: 3
      });
    }
  });

  /* --- 34. the goal that runs away - three times ------------------------- */
  def('l9goal', {
    init: function (e, d) {
      e.w = T * 1.5; e.h = T * 2;
      e.stops = (d.stops || [188, 184, 180, 176]).slice();
      e.at_ = 0; e.hops = 0; e.given = 0; e.cool = 0; e.hop = 0;
      e.x = e.stops[0] * T;
    },
    update: function (e, dt) {
      if (e.cool > 0) e.cool -= dt;
      if (e.hop > 0) e.hop = Math.max(0, e.hop - dt * 3);
      if (!hitP(e.x + 4, e.y + 2, e.w - 8, e.h - 4, 3) || e.cool > 0) return;
      if (e.given) {
        RT.winLevel();
        return;
      }
      e.hops++;
      e.cool = 0.5; e.hop = 1;
      if (e.hops < e.stops.length) {
        e.x = e.stops[e.hops] * T;
        sfx('troll'); sfx('portal');
        RT.cam.shake(4, 0.2);
        boom(e.x + e.w / 2, e.y + e.h / 2, ['#ffd23f', '#ffffff'], 18, 190);
        RT.speech(e.x + e.w / 2, e.y - 10, ['nope', 'no', 'almost'][Math.min(2, e.hops - 1)], 1.1);
      }
      if (e.hops >= e.stops.length - 1 && !e.given) {
        e.given = 1;
        sfx('checkpoint');
        RT.toast('ok. you earned it.', 3.2);
        RT.flash('#ffffff', 0.18);
        RT.particles.ring(e.x + e.w / 2, e.y + e.h / 2, '#ffe9a8', 8, 150, 0.7);
      }
    },
    reset: function (e) { e.hops = 0; e.given = 0; e.cool = 0; e.x = e.stops[0] * T; },
    draw: function (e, g) {
      var x = e.x, y = e.y, w = e.w, hh = e.h;
      var beat = Math.sin(e.at * 2) * (e.given ? 1 : 0.4);
      g.save();
      g.globalAlpha = 0.18 + 0.12 * beat + (e.given ? 0.18 : 0);
      var lg = g.createLinearGradient(0, y - hh * 1.6, 0, y + hh);
      lg.addColorStop(0, 'rgba(255,240,170,0)');
      lg.addColorStop(1, 'rgba(255,240,170,0.8)');
      g.fillStyle = lg;
      poly(g, [x + w * 0.5 - w * 0.8, y - hh * 1.5, x + w * 0.5 + w * 0.8, y - hh * 1.5, x + w - 2, y + hh, x + 2, y + hh], lg);
      g.restore();
      var lean = e.hop > 0 ? Math.sin(e.hop * 9) * 0.12 : 0;
      g.save();
      g.translate(x + w / 2, y + hh);
      g.rotate(lean);
      rr(g, -w / 2 - 3, -hh - 5, w + 6, hh + 6, 5, e.given ? '#6ecf87' : '#7a6a58');
      rr(g, -w / 2 + 2, -hh, w - 4, hh - 1, 4, '#b2793f');
      rr(g, -w / 2 + 4, -hh + 2, w - 8, (hh - 1) * 0.34, 3, 'rgba(255,255,255,0.22)');
      circ(g, w / 2 - 10, -hh * 0.45, 3.2, '#ffe9a8');
      RT.drawText(g, 'EXIT', 0, -hh * 0.78, {
        size: 10, color: e.given ? '#eaffef' : '#fff3c4', stroke: 'rgba(50,28,10,0.75)', strokeWidth: 3
      });
      if (!e.given) face(g, 0, -hh * 0.38, w * 0.26, 'evil', e.at);
      g.restore();
      if (e.given) {
        RT.drawText(g, 'GO ON THEN', x + w / 2, y - 24 + Math.sin(e.at * 3) * 2, {
          size: 11, color: '#eaffef', stroke: 'rgba(30,60,40,0.8)', strokeWidth: 3, alpha: 0.9
        });
      }
    }
  });

  /* --- 32. the collectibles that do not matter --------------------------- */
  def('l9pink', {
    init: function (e, d) {
      e.w = T * 0.72; e.h = T * 0.72;
      e.key = 'p' + Math.round((d.x || 0) * 10);
      e.got = pinkTaken[e.key] ? 1 : 0;
    },
    update: function (e) {
      if (e.got) return;
      if (!hitP(e.x, e.y, e.w, e.h, 1)) return;
      e.got = 1;
      pinkTaken[e.key] = 1;
      pinkGot++;
      sfx('coin');
      boom(e.x + e.w / 2, e.y + e.h / 2, ['#ff8fd0', '#ffffff'], 12, 150, { gravity: 240 });
      RT.hud.set('pink', pinkGot + ' / ?');
    },
    reset: function (e) { if (!e.got) return; },
    draw: function (e, g) {
      if (e.got) return;
      var cx = e.x + e.w / 2, cy = e.y + e.h / 2 + Math.sin(e.at * 2.6) * 2;
      var r = Math.abs(Math.cos(e.at * 2.8)) * e.w * 0.44 + 2;
      g.beginPath();
      if (g.ellipse) g.ellipse(cx, cy, r, e.h * 0.46, 0, 0, 6.2832); else g.arc(cx, cy, r, 0, 6.2832);
      g.fillStyle = '#ff8fd0'; g.fill();
      g.strokeStyle = 'rgba(150,40,100,0.55)'; g.lineWidth = 1.4; g.stroke();
      if (r > 4) RT.drawText(g, '?', cx, cy + 1, { size: 11, color: '#8d2c63' });
    }
  });

  /* ==================================================================== */
  /* LEVEL STATE                                                          */
  /* ==================================================================== */
  var dirty = {};            /* tiles this level changed, restored on death */
  var S = {};                /* per-life flags */
  var L = {};                /* per-level flags */
  var pinkGot = 0;
  var pinkTaken = {};
  var pinkTotal = 10;
  var prevVx = 0;
  var cascadeEnts = [];

  function carve(tx, ty, ch) {
    var k = tx + '|' + ty;
    if (!(k in dirty)) dirty[k] = RT.getTile(tx, ty);
    RT.setTile(tx, ty, ch);
  }
  function restoreTiles() {
    for (var k in dirty) {
      if (!Object.prototype.hasOwnProperty.call(dirty, k)) continue;
      var p = k.split('|');
      RT.setTile(+p[0], +p[1], dirty[k]);
    }
    dirty = {};
  }

  var BADGES = [
    [0, 'UNBOTHERED'], [3, 'SUSPICIOUS'], [8, 'LEARNING'], [15, 'COMMITTED'],
    [25, 'DETERMINED'], [40, 'FURIOUS'], [60, 'LEGEND'], [90, 'UNKILLABLE']
  ];
  function badge() {
    var b = BADGES[0];
    for (var i = 0; i < BADGES.length; i++) if (RT.deaths >= BADGES[i][0]) b = BADGES[i];
    return b[1];
  }
  function refreshHud() {
    RT.hud.set('badge', badge());
    RT.hud.set('pink', pinkGot + ' / ?');
  }

  /* the cascading trap: the room at 167-172 rearranges itself around the way
   * you dodged it last time. Three layers, then it gives up (SS37). */
  function armCascade() {
    for (var i = 0; i < cascadeEnts.length; i++) if (cascadeEnts[i]) RT.remove(cascadeEnts[i]);
    cascadeEnts.length = 0;
    var n = Math.min(3, L.roomDeaths || 0);
    if (n === 0) {
      cascadeEnts.push(RT.spawn({ type: 'trapspike', x: 169, y: GROUND, dir: 'up', trigger: 'near', near: 1.5, delay: 0.3, retract: 1.4 }));
    } else if (n === 1) {
      cascadeEnts.push(RT.spawn({ type: 'trapspike', x: 170, y: GROUND, dir: 'up', trigger: 'near', near: 1.8, delay: 0.25, retract: 1.4 }));
      cascadeEnts.push(RT.spawn({ type: 'trapspike', x: 171, y: GROUND, dir: 'up', trigger: 'near', near: 1.8, delay: 0.45, retract: 1.4 }));
    } else if (n === 2) {
      cascadeEnts.push(RT.spawn({ type: 'trapspike', x: 168, y: GROUND, dir: 'up', trigger: 'near', near: 1.6, delay: 0.3, retract: 1.4 }));
      cascadeEnts.push(RT.spawn({ type: 'fallingceiling', x: 170, y: 8, w: 3, h: 1.5, triggerW: 3 }));
    }
    if (n >= 3 && !L.gaveUp) {
      L.gaveUp = 1;
      RT.toast('fine. this room is yours.', 2.4);
    }
  }

  /* ==================================================================== */
  /* THE LEVEL                                                            */
  /* ==================================================================== */

  /* the finale drifts into a sicklier pastel - the world running out of nice */
  var LATE = {
    sky: [[0, '#f7c2e8'], [0.36, '#cdd8ff'], [0.72, '#ffe6c0'], [1, '#c8f2d6']],
    parallax: [
      { kind: 'nebula', color: '#d98fe0', color2: '#8fb6ff', y: 1, speed: 0.03, scale: 1, alpha: 0.42 },
      { kind: 'clouds', color: '#fff4fb', y: 0.5, speed: 0.07, scale: 0.5, alpha: 1, face: true },
      { kind: 'ruins', color: '#b58fd6', color2: '#8e6ab5', y: 0.96, speed: 0.24, scale: 0.36 },
      { kind: 'hills', color: '#7fd9a0', color2: '#59b781', y: 1.1, speed: 0.54, scale: 0.24 }
    ],
    ambient: 'fireflies',
    fog: { color: '#f3d4ff', alpha: 0.16 },
    tile: { top: '#ffb0d8', side: '#a874d0', dark: '#6b4189', rim: '#fff0fa', accent: '#ffd23f' },
    spike: { base: '#ffe2f2', tip: '#ff3e8f' },
    vignette: 0.24
  };

  RT.registerLevel(9, {
    name: 'TRUST NOTHING',
    subtitle: 'The ultimate troll level',
    theme: 'troll',
    themeZones: [{ x0: 156, x1: 400, theme: LATE }],
    music: 'mischief',

    tiles: [
      '....................................................................................................................................................................................................',
      '....................................................................................................................................................................................................',
      '....................................................................................................................................................................................................',
      '....................................................................................................................................................................................................',
      '............................................#####...................................................####............................................................................................',
      '............................................#####...................................................####............................................................................................',
      '.............................................vvv.........................................................................######.......................................#################.............',
      '.......................................................I............................................................#...M.............................................#.............................',
      '.......................................ooo..........................................................................#...M.............................................#.............................',
      '......................................o...o...o.....................................................................#...M...............................---...........#.............................',
      '..P....................C...................C....C.......................C..............................C............#..!M......C....................C......CC.........#......C......X...............',
      '##############KKK######################...####S#######..##..###############.....###########...##^^###########..###########....#########..###KKK################################.####################',
      '#########..###...##..##################.o.############..##..###############.....###########...###############..###########....#########..###...###############################...###################',
      '#######################################.o.############..##^^###############.....###########...###############..###########....#########..###...###############################...###################',
      '#######################################...############..###################.....###########...###############..###########....#########..###...#####################################################',
      '#######################################...############..###################.....###########...###############..###########....#########..###...#####################################################',
    ],

    intro: [
      'TRIAL 9 - TRUST NOTHING',
      'Everything here is friendly. Nothing here is honest.',
      'Die as often as you like. It is the tutorial.'
    ],

    entities: [
      /* ============================ Z1  THE NICE PART ==================== */
      { type: 'sign', x: 4, y: 10, w: 9, range: 2.6,
        text: 'WELCOME! Nothing in this trial is a trap. You have our word. Signed, the trial.' },
      { type: 'l9shy', x: 7, y: 7 },
      { type: 'text', x: 8, y: 5.6, w: 5, text: 'free coin', size: 0.44, color: '#7a4a86', alpha: 0.6, rot: -6 },
      { type: 'sign', x: 12, y: 10, w: 9, range: 2.4,
        text: 'These next three bricks crumble. That one is honest. Remember how honest feels.' },
      { type: 'text', x: 18, y: 6.4, w: 6, text: 'keep running!', size: 0.5, color: '#7a4a86', alpha: 0.55 },
      { type: 'l9wall', x: 22, y: 9, trip: 18 },
      { type: 'deco', kind: 'flag', x: 23.4, y: 9 },
      { type: 'l9pink', x: 10.2, y: 8.4 },

      /* ============================ Z2  POINTY THINGS ==================== */
      { type: 'sign', x: 25, y: 10, w: 9, range: 2.4,
        text: 'Pointy things ahead. They are under the floor. That is where we keep them.' },
      { type: 'trapspike', x: 27, y: 11, dir: 'up', trigger: 'near', near: 1.6, delay: 0.4, retract: 1.3 },
      { type: 'fallingceiling', x: 33, y: 4, w: 3, h: 1.5, triggerW: 3 },
      { type: 'l9block', x: 30, y: 7, payload: 'coin' },
      { type: 'l9block', x: 32, y: 7, payload: 'coin' },
      { type: 'l9block', x: 34, y: 7, payload: 'coin' },
      { type: 'l9block', x: 36, y: 7, payload: 'spike' },
      { type: 'text', x: 30, y: 5.4, w: 8, text: 'hit them all!', size: 0.5, color: '#7a4a86', alpha: 0.6 },
      { type: 'text', x: 39.4, y: 12.4, w: 4, text: 'free', size: 0.4, color: '#ffe9a8', alpha: 0.75 },
      { type: 'l9boom', x: 44.15, y: 8.15 },
      { type: 'sign', x: 45, y: 10, w: 10, range: 2.2,
        text: 'Springs are for going up. Look up before you go up.' },
      { type: 'l9pink', x: 33.14, y: 9.4 },

      /* ============================ Z3  THE MIDDLE ======================= */
      { type: 'sign', x: 50, y: 10, w: 9, range: 2.4,
        text: 'A gap. A simple gap. Nothing is above it. Jump with your whole heart.' },
      { type: 'text', x: 56.4, y: 7.3, w: 5, text: 'THIS WAY', size: 0.46, color: '#ff5aa0', alpha: 0.8 },
      { type: 'l9drop', x: 62, y: 5, trip: 59.5 },
      { type: 'l9cloud', x: 65, y: 4.6, range: 5.5 },
      { type: 'sign', x: 64, y: 10, w: 10, range: 2.2,
        text: 'One of the two mushrooms ahead is good for you. Look at their faces.' },
      { type: 'mushroom', x: 67, y: 10, poison: true },
      { type: 'mushroom', x: 69, y: 10 },
      { type: 'l9pink', x: 60.14, y: 9.4 },

      /* ============================ Z4  SPICY ============================ */
      { type: 'sign', x: 73.4, y: 10, w: 10, range: 2.4,
        text: 'The blue platform is on your side. It said so itself.' },
      { type: 'l9ride', x: 76, y: 9, leftX: 73.2, rightX: 80.1 },
      { type: 'sign', x: 81, y: 10, w: 9, range: 2.2,
        text: 'ICE. It is drawn as ice because hiding friction would be cheating.' },
      { type: 'l9saw', x: 98, y: 12, spots: [98, 101] },
      { type: 'l9fruit', x: 102.2, y: 10.2, trip: 99.5 },
      { type: 'text', x: 99, y: 6.6, w: 6, text: 'fruit falls down', size: 0.44, color: '#7a4a86', alpha: 0.6 },
      { type: 'l9pink', x: 88.14, y: 9.4 },

      /* ============================ Z5  UPSIDE DOWN ====================== */
      { type: 'sign', x: 105, y: 10, w: 10, range: 2.6,
        text: "DO NOT PANIC. For the next eight tiles, left is right. Walk calmly. There is a hole." },
      { type: 'text', x: 106, y: 6.6, w: 8, text: 'REVERSED', size: 0.8, color: '#ff5aa0', alpha: 0.5, wave: 1.8 },
      { type: 'portal', x: 115, y: 7, w: 1, h: 4, to: [117.4, 10], color: '#c47ae0', keepMomentum: true },
      { type: 'sign', x: 117.6, y: 10, w: 10, range: 2.2,
        text: 'The switch opens the wall. The switch also does one other thing.' },
      { type: 'sign', x: 121.2, y: 10, w: 11, range: 2.4,
        text: 'UP IS DOWN for the next five tiles. You cannot jump up here. Just walk.' },
      { type: 'l9pink', x: 112.14, y: 9.4 },
      { type: 'l9pink', x: 123.14, y: 7.3 },

      /* ============================ Z6  THE REPEAT ======================= */
      { type: 'sign', x: 128, y: 10, w: 10, range: 2.6,
        text: 'You have been here before. Almost exactly here.' },
      { type: 'deco', kind: 'flag', x: 126.4, y: 9 },
      { type: 'text', x: 130, y: 6.2, w: 8, text: 'THE NICE PART', size: 0.7, color: '#7a4a86', alpha: 0.32 },
      { type: 'text', x: 133.4, y: 7.2, w: 6, text: '(2)', size: 0.5, color: '#7a4a86', alpha: 0.5 },
      { type: 'l9flag', x: 145, y: 9 },
      { type: 'sign', x: 150.4, y: 10, w: 10, range: 2.2,
        text: 'CP1! The oldest trick there is. Relax - you keep your checkpoint. Go up.' },
      { type: 'conveyor', x: 150, y: 11, w: 5, speed: -4 },
      { type: 'text', x: 151, y: 7.2, w: 5, text: 'BYE', size: 0.9, color: '#ff5aa0', alpha: 0.6, wave: 2 },
      { type: 'l9pink', x: 141.14, y: 9.4 },

      /* ============================ Z7  THE FINALE ======================= */
      { type: 'sign', x: 157, y: 10, w: 10, range: 2.4,
        text: 'Three doors. One is real. It is the same one every time - that is the kindness.' },
      { type: 'l9door', x: 158, y: 9, label: 'A' },
      { type: 'l9door', x: 161, y: 9, label: 'B', real: true },
      { type: 'l9door', x: 164, y: 9, label: 'C' },
      { type: 'text', x: 167, y: 7.2, w: 8, text: 'it learns', size: 0.5, color: '#7a4a86', alpha: 0.5 },
      { type: 'deco', kind: 'pipe', x: 175, y: 10 },
      { type: 'text', x: 173.4, y: 8.4, w: 6, text: 'SHORTCUT', size: 0.5, color: '#ffd23f', alpha: 0.8 },
      { type: 'text', x: 177.4, y: 9.2, w: 6, text: 'SAFE ZONE', size: 0.6, color: '#8dff9a', alpha: 0.85 },
      { type: 'sign', x: 178, y: 10, w: 10, range: 2.2,
        text: 'SAFE ZONE. Certified. Audited. Entirely safe apart from one square of it.' },
      { type: 'sign', x: 184, y: 10, w: 11, range: 2.6,
        text: 'The exit is above you and behind you. That is not a trick. It is just rude.' },
      { type: 'l9moon', x: 183, y: 8, trip: 176 },
      { type: 'fakegoal', x: 192, y: 9, back: 6 },
      { type: 'text', x: 190.6, y: 7.4, w: 5, text: 'THE EXIT', size: 0.6, color: '#ffe9a8', alpha: 0.85 },
      { type: 'sign', x: 189, y: 10, w: 11, range: 2.4,
        text: 'The exit is this way. Definitely. Why would a sign lie to you twice.' },
      { type: 'deco', kind: 'grave', x: 193, y: 10 },

      { type: 'sign', x: 178.4, y: 4, w: 10, range: 2.4,
        text: 'Keep going left. The one that runs away is the real one.' },
      { type: 'l9goal', x: 177, y: 4, stops: [177, 174, 171, 168] },
      { type: 'l9pink', x: 168.14, y: 9.4 },
      { type: 'l9pink', x: 186.14, y: 9.4 },
      { type: 'l9pink', x: 175.14, y: 4.6 }
    ],

    /* ------------------------------------------------------------ load */
    onLoad: function (RT) {
      dirty = {};
      S = {};
      L = { roomDeaths: 0, pink: 0 };
      pinkGot = 0;
      pinkTaken = {};
      prevVx = 0;
      cascadeEnts.length = 0;
      RT.onOff = true;
      armCascade();
      refreshHud();
      RT.toast('every trap here is learnable. none of them are fair.', 3.2);
    },

    onDeath: function (RT, cause) {
      restoreTiles();
      S = {};
      prevVx = 0;
      if (ptx() > 166 && ptx() < 174) { L.roomDeaths = (L.roomDeaths || 0) + 1; }
      armCascade();
      refreshHud();
      var lines = {
        void: ['the floor was a suggestion.', 'gravity: still undefeated.', 'that hole was new.'],
        spike: ['pointy.', 'they were under there the whole time.', 'spikes: 1. you: later.'],
        boom: ['that coin was a bomb. the other forty are fine. probably.'],
        cloud: ['killed by scenery. genuinely.'],
        crush: ['it came from above. they always do.'],
        moon: ['flattened by the moon. put that on the badge.'],
        fruit: ['the fruit fell up. we did warn you with a wobble.'],
        saw: ['it went under the floor and came back ahead of you.'],
        poison: ['one of them had a skull on it.']
      };
      var pool = lines[cause] || ['learn it. it never changes.', 'that one only works once.', 'again.'];
      RT.toast(pool[RT.deaths % pool.length], 2);
    },

    onCheckpoint: function (RT, cp) {
      refreshHud();
      /* 31 - the evil save point. It registers FIRST, then it shoots at you. */
      if (cp && cp.tx === 148 && !L.evilShot) {
        L.evilShot = 1;
        RT.toast('checkpoint saved. now hold still.', 1.6);
        RT.spawn({ type: 'ball', x: 153, y: 9.42, w: 0.5, h: 0.5, vx: -260, vy: 0, kind: 'energy', life: 3 });
        sfx('charge');
      } else if (cp && cp.tx === 23) {
        RT.toast('a real checkpoint. they do exist.', 1.6);
      }
    },

    /* ------------------------------------------------------------ update */
    onUpdate: function (RT, dt) {
      var p = RT.player;
      refreshHud();
      if (p.dead) { prevVx = 0; return; }
      var tx = ptx();
      var onGround = p.onGround;

      /* --- 1. the fake floor (cols 9-10) - the founding troll ----------- */
      if (!S.fake && onGround && tx > 8.6 && tx < 10.9 && p.y + p.h <= GROUND * T + 2) {
        S.fake = 1;
        carve(9, GROUND, '.'); carve(10, GROUND, '.');
        sfx('crumble'); sfx('troll');
        RT.cam.shake(3, 0.16);
        boom(9.9 * T, GROUND * T, ['#ffb0d8', '#ffffff', '#a874d0'], 20, 160, { gravity: 700 });
        RT.speech(pcx(), p.y - 8, 'oh', 1.0);
      }

      /* --- 3. the hole that opens in front of you (cols 19-20) ---------- */
      if (!S.hole && tx > 17.2 && tx < 19.1) {
        S.hole = 1;
        carve(19, GROUND, '.'); carve(20, GROUND, '.');
        sfx('crumble');
        RT.cam.shake(4, 0.18);
        boom(19.9 * T, GROUND * T, ['#ffb0d8', '#ffffff'], 22, 200, { gravity: 700 });
      }

      /* --- 17. ice (cols 82-90): momentum you can see, per SS17 --------- */
      if (onGround && tx > 81.8 && tx < 91.2) {
        if (!S.ice) { S.ice = 1; sfx('tick'); RT.toast('slippery', 1.2); }
        /* keep 92% of last step's speed: decel becomes a suggestion */
        if (Math.abs(prevVx) > Math.abs(p.vx)) p.vx = prevVx * 0.985 + p.vx * 0.015;
      }
      prevVx = p.vx;

      /* --- 23. reversed controls (cols 105-113) ------------------------- */
      var rev = tx > 104.6 && tx < 113.6;
      p.controlsReversed = rev;
      if (rev && !S.rev) { S.rev = 1; sfx('troll'); RT.flash('#ffd6f0', 0.14); }
      if (!rev && S.rev === 1 && tx > 113.6) { S.rev = 2; RT.toast('controls restored. you are welcome.', 1.4); }

      /* --- 24. gravity flip: the ceiling walk over the 4-wide pit ------- */
      var flip = tx > 121.2 && tx < 126.2;
      if (flip !== !!S.flipOn) {
        S.flipOn = flip ? 1 : 0;
        p.gravityFlip = flip;
        sfx(flip ? 'portal' : 'powerup');
        RT.flash(flip ? '#c47ae0' : '#ffffff', 0.12);
        RT.cam.shake(4, 0.2);
        if (flip) RT.toast('up is down. you cannot jump. walk.', 1.8);
      } else {
        p.gravityFlip = flip;
      }

      /* --- 27. spawn blocking: the switch opened the wall AND did this -- */
      if (!RT.onOff && !S.spawned) {
        S.spawned = 1;
        S.saw = RT.spawn({ type: 'saw', x: 123.6, y: 7.4, r: 0.7, path: [[123.6, 7.4], [123.6, 10.2]], speed: 2.8 });
        sfx('troll');
        RT.toast('you opened the wall. you also opened that.', 2);
      }

      /* --- 28. twice twice: the tell is a single line of text ----------- */
      if (!S.twice && tx > 132 && tx < 134) {
        S.twice = 1;
        sfx('fake');
        RT.toast('the same corner. three tiles are different.', 2.4);
      }

      /* --- 30. the CP1 gag (cols 150-155) ------------------------------- */
      if (!S.cp1 && tx > 150 && tx < 155) {
        S.cp1 = 1;
        sfx('troll');
        RT.banner(['CP1', 'just kidding, you keep everything'], 2);
      }

      /* --- 36. the soft-lock that resolves into a death (cols 174-176) -- */
      if (!S.jail && p.y > (GROUND + 0.4) * T && tx > 173.6 && tx < 176.6) {
        S.jail = 1;
        carve(175, GROUND, 'I');
        sfx('door'); sfx('troll');
        RT.toast('SHORTCUT CLOSED', 1.4);
        S.jailT = 0;
      }
      if (S.jail === 1) {
        S.jailT += dt;
        if (S.jailT > 0.35) RT.cam.shake(2 + S.jailT * 3, 0.2);
        if (S.jailT > 1.5) { sfx('thwomp'); RT.killPlayer('crush'); }
      }

      /* --- 37. the cascade survives the respawn that rebuilt the world -- */
      if (cascadeEnts.length && RT.entities.indexOf(cascadeEnts[0]) < 0) armCascade();

      /* --- the moon must be waiting when you come back for it ----------- */
      if (!S.moonBack && tx > 174) {
        S.moonBack = 1;
        var m = RT.findOne('l9moon');
        if (m && m.phase === 'sky') { m.tripX = 0; }
      }

      /* --- 32. the reveal --------------------------------------------- */
      if (!L.pinkTold && tx > 190) {
        L.pinkTold = 1;
        RT.toast('you found ' + pinkGot + ' of ' + pinkTotal + '. none of them did anything.', 3.4);
        RT.hud.set('pink', pinkGot + ' / ' + pinkTotal + ' (useless)');
      }
    },

    /* ------------------------------------------------------------ events */
    onWin: function (RT) {
      RT.hud.clear('pink');
      RT.hud.clear('badge');
      RT.particles.burst(RT.player.x + 10, RT.player.y + 14, {
        n: 48, colors: ['#ff3ea5', '#ffd23f', '#3df0ff', '#5bff9b', '#ffffff'],
        speed: 300, life: 1.2, size: 4, gravity: 300
      });
      RT.cam.shake(6, 0.4);
    },

    /* ------------------------------------------------------------- draw */
    onDraw: function (RT, g, layer) {
      var t = RT.time || 0;
      var camx = RT.cam.x, vw = RT.view.w;
      var x0 = camx - vw / 2 - 64, x1 = camx + vw / 2 + 64;

      if (layer === 'back') {
        drawRainbow(g, camx, t);
        drawSkyMoon(g, camx, t);
        drawBunting(g, x0, x1, t);
        return;
      }

      /* ---- front ---- */
      drawIce(g, x0, x1, t);
      drawZoneStripes(g, x0, x1, t);
      drawFloorPaint(g, x0, x1);
      drawSparkles(g, x0, x1, t);
    }
  });

  /* ==================================================================== */
  /* LEVEL ART                                                            */
  /* ==================================================================== */

  function drawRainbow(g, camx, t) {
    var cx = camx * 0.5 + 340, cy = 360;
    var cols = ['#ff7ab8', '#ffb15e', '#ffe873', '#8ff09a', '#7fc8ff', '#c39bff'];
    g.save();
    g.globalAlpha = 0.30;
    g.lineWidth = 13;
    for (var i = 0; i < cols.length; i++) {
      g.strokeStyle = cols[i];
      g.beginPath();
      g.arc(cx, cy, 200 + i * 13, Math.PI * 1.06, Math.PI * 1.94);
      g.stroke();
    }
    g.restore();
  }

  /* 22 - the gag object grows across the whole level before it ever falls */
  function drawSkyMoon(g, camx, t) {
    var k = Math.max(0, Math.min(1, (camx / T) / 178));
    var m = RT.findOne('l9moon');
    if (m && m.phase !== 'sky') return;
    var r = 16 + k * k * 120;
    var x = camx * 0.86 + 420 - k * 60, y = 96 - k * 26;
    g.save();
    g.globalAlpha = 0.24 + k * 0.62;
    circ(g, x, y, r, '#f3edfb');
    circ(g, x - r * 0.18, y - r * 0.16, r * 0.86, '#fdfaff');
    for (var i = 0; i < 7; i++) {
      var a = h1(i * 4.7) * 6.2832, d = h1(i * 2.1) * r * 0.7;
      circ(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, r * 0.08 + h1(i) * r * 0.1, 'rgba(178,160,205,0.5)');
    }
    if (k > 0.45) face(g, x, y, r * 0.42, k > 0.8 ? 'evil' : 'nice', t);
    g.restore();
  }

  function drawBunting(g, x0, x1, t) {
    var y = 62;
    g.save();
    g.globalAlpha = 0.5;
    g.strokeStyle = '#ffffff'; g.lineWidth = 1.6;
    var span = 46;
    var sx = Math.floor(x0 / span) * span;
    g.beginPath();
    for (var x = sx; x < x1 + span; x += span) {
      g.moveTo(x, y + Math.sin(x * 0.01) * 10);
      g.quadraticCurveTo(x + span / 2, y + 20 + Math.sin(x * 0.01) * 10, x + span, y + Math.sin((x + span) * 0.01) * 10);
    }
    g.stroke();
    var cols = ['#ff9ad4', '#ffe873', '#9ad4ff', '#a8f0b6'];
    var i = 0;
    for (var fx = sx; fx < x1 + span; fx += span / 2) {
      var fy = y + 12 + Math.sin(fx * 0.01) * 10;
      poly(g, [fx - 6, fy, fx + 6, fy, fx, fy + 15 + Math.sin(t * 2 + i) * 2], cols[(i++) % 4]);
    }
    g.restore();
  }

  /* 17 - friction you can SEE */
  function drawIce(g, x0, x1, t) {
    if (x1 < 81 * T || x0 > 92 * T) return;
    var y = GROUND * T;
    g.save();
    g.globalAlpha = 0.72;
    var lg = g.createLinearGradient(0, y, 0, y + 20);
    lg.addColorStop(0, 'rgba(226,248,255,0.95)');
    lg.addColorStop(1, 'rgba(160,215,245,0)');
    g.fillStyle = lg;
    g.fillRect(82 * T, y, 9 * T, 20);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(82 * T, y, 9 * T, 3);
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2;
    for (var i = 0; i < 16; i++) {
      var sx = 82 * T + h1(i * 1.7) * 9 * T;
      g.beginPath();
      g.moveTo(sx, y + 4);
      g.lineTo(sx + 6 + h1(i) * 10, y + 4 + h1(i * 3) * 9);
      g.stroke();
    }
    g.globalAlpha = 0.35 + Math.sin(t * 2) * 0.08;
    g.fillStyle = '#ffffff';
    g.fillRect(82 * T, y - 2, 9 * T, 2);
    g.restore();
  }

  /* the reversed and flipped corridors are striped, always, per SS23/SS24 */
  function drawZoneStripes(g, x0, x1, t) {
    stripe(g, 105, 113.6, '#ff5aa0', t, x0, x1, 'REVERSED');
    stripe(g, 120, 125.4, '#c47ae0', t, x0, x1, 'GRAVITY');
  }
  function stripe(g, a, b, col, t, x0, x1, label) {
    if (x1 < a * T || x0 > b * T) return;
    g.save();
    g.globalAlpha = 0.16;
    g.fillStyle = col;
    var w = (b - a) * T;
    for (var i = 0; i < 40; i++) {
      var sx = a * T + ((i * 26 + t * 22) % w);
      poly(g, [sx, 0, sx + 12, 0, sx + 12 - 24, H * T, sx - 24, H * T], col);
    }
    g.restore();
    g.save();
    g.globalAlpha = 0.5;
    g.strokeStyle = col; g.lineWidth = 3;
    g.beginPath(); g.moveTo(a * T, 0); g.lineTo(a * T, H * T); g.stroke();
    g.beginPath(); g.moveTo(b * T, 0); g.lineTo(b * T, H * T); g.stroke();
    g.restore();
    if (RT.player && !RT.player.dead) {
      var px = pcx() / T;
      if (px > a && px < b) {
        RT.drawText(g, label, (a + b) / 2 * T, 2.2 * T + Math.sin(t * 4) * 3, {
          size: 22, color: col, stroke: 'rgba(255,255,255,0.85)', strokeWidth: 5, alpha: 0.85
        });
      }
    }
  }

  /* paint on the floor: the SAFE ZONE, and the arrow that lies */
  function drawFloorPaint(g, x0, x1) {
    var y = GROUND * T;
    if (x1 > 176 * T && x0 < 183 * T) {
      g.save();
      g.globalAlpha = 0.5;
      g.fillStyle = '#8dff9a';
      g.fillRect(177 * T, y + 2, 6 * T, 5);
      g.strokeStyle = '#8dff9a'; g.lineWidth = 3;
      g.strokeRect(177 * T, y - 3.2 * T, 6 * T, 3.2 * T);
      g.restore();
    }
    if (x1 > 56 * T && x0 < 61 * T) {
      g.save();
      g.globalAlpha = 0.65;
      g.fillStyle = '#ff5aa0';
      var ax = 58.5 * T, ay = y - 2.4 * T;
      g.fillRect(ax - 5, ay, 10, 34);
      poly(g, [ax - 16, ay + 32, ax + 16, ay + 32, ax, ay + 54], '#ff5aa0');
      g.restore();
    }
  }

  function drawSparkles(g, x0, x1, t) {
    g.save();
    for (var i = 0; i < 22; i++) {
      var sx = h1(i * 3.1) * W * T;
      if (sx < x0 || sx > x1) continue;
      var sy = 40 + h1(i * 7.7) * (H * T - 120);
      var k = 0.35 + 0.35 * Math.sin(t * 2.4 + i * 1.3);
      if (k < 0.1) continue;
      g.globalAlpha = k;
      g.fillStyle = i % 3 === 0 ? '#ffe873' : '#ffffff';
      var s = 2 + h1(i * 5) * 2.5;
      g.fillRect(sx - s, sy, s * 2, 1.4);
      g.fillRect(sx - 0.7, sy - s, 1.4, s * 2);
    }
    g.restore();
  }
})();
