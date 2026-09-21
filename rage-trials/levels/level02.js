/* ==========================================================================
 * RAGE TRIALS - LEVEL 2: DOUBLE TROUBLE
 * "The same meadow, later in the day. The spikes have learned to pair up."
 *
 * Teaching beats (DESIGN.md L2):
 *   1. a double spike on flat ground             (run first, jump second)
 *   2. a double spike with a safe pocket         (gap 1 - you may land inside)
 *   3. a pillar hop between two double spikes    (land on it, jump again)
 *   4. a spiked pit crossed on a one-way plank
 *   5. CHECKPOINT - the afternoon turns to gold
 *   6. a staircase of spike pairs (up, up)
 *   7. three consecutive pairs at increasing spacing (down, down, down)
 *   8. a spring that clears a 5-wide spike field, into the goal
 *
 * Everything here obeys CONTRACT.md s4: no gap over 4 tiles, no wall over
 * 3 tiles, every hazard on screen before it matters. The chalk arcs drawn in
 * the front layer are integrated from the REAL jump physics, so they never
 * promise a jump the player cannot make.
 * ========================================================================== */
(function () {
  var RT = window.RT;
  if (!RT || typeof RT.registerLevel !== 'function') return;

  var T = 32;
  var GROUND_Y = 12 * T;                // the main surface, in px

  /* ---- tiny helpers (kept local; the engine owns the real ones) -------- */
  function cl01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hx(h) {
    return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)];
  }
  function mix(a, b, t) {
    var A = hx(a), B = hx(b);
    return 'rgb(' + ((A[0] + (B[0] - A[0]) * t) | 0) + ',' +
                    ((A[1] + (B[1] - A[1]) * t) | 0) + ',' +
                    ((A[2] + (B[2] - A[2]) * t) | 0) + ')';
  }
  function rgba(c, a) {
    var A = hx(c);
    return 'rgba(' + A[0] + ',' + A[1] + ',' + A[2] + ',' + a + ')';
  }
  /* deterministic per-index noise - no RNG state, same picture every frame */
  function nz(i, s) {
    var v = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453;
    return v - Math.floor(v);
  }

  /* ======================================================================
   * THEMES - this level's own two hours of the day.
   * Deliberately NOT the stock meadow/sunset: their far parallax layer is a
   * row of triangular mountains, and in a level whose entire subject is
   * triangular spikes that silhouette lies to the player. Everything on the
   * horizon here is round, so the only triangles on screen are the ones that
   * kill you.
   * ==================================================================== */
  var AFTERNOON = {
    sky: [[0, '#3f9bff'], [0.42, '#8fd0ff'], [0.78, '#d2eaff'], [1, '#ffeccd']],
    parallax: [
      { kind: 'clouds', color: '#fffaf0', y: 0.46, speed: 0.05, scale: 0.34, alpha: 0.75 },
      { kind: 'hills', color: '#9dc9d6', color2: '#7fb2c6', y: 0.84, speed: 0.13, scale: 0.30 },
      { kind: 'hills', color: '#6aa85c', color2: '#55904e', y: 0.99, speed: 0.30, scale: 0.30 },
      { kind: 'hills', color: '#4a8a48', color2: '#3a7340', y: 1.08, speed: 0.52, scale: 0.26 }
    ],
    ambient: 'dust',
    fog: { color: '#d8ecff', alpha: 0.10 },
    tile: { top: '#6ed85a', side: '#9a6533', dark: '#5b3d22', rim: '#b9ff9c', accent: '#7a4f2e' },
    spike: { base: '#b9c6d2', tip: '#ffffff' },
    vignette: 0.24
  };
  var GOLDEN = {
    sky: [[0, '#2b2a63'], [0.30, '#7e4a7e'], [0.58, '#e0714f'], [0.82, '#ffad63'], [1, '#ffe3ad']],
    parallax: [
      { kind: 'clouds', color: '#ffb3a0', y: 0.44, speed: 0.05, scale: 0.32, alpha: 0.7 },
      { kind: 'hills', color: '#8a5680', color2: '#6d3f6c', y: 0.86, speed: 0.13, scale: 0.30 },
      { kind: 'hills', color: '#57305a', color2: '#43254b', y: 1.00, speed: 0.30, scale: 0.28 },
      { kind: 'hills', color: '#321c37', color2: '#241329', y: 1.09, speed: 0.52, scale: 0.24 }
    ],
    ambient: 'fireflies',
    fog: { color: '#ff9f6a', alpha: 0.12 },
    tile: { top: '#a8964a', side: '#6e3c2c', dark: '#3d2019', rim: '#ffd79a', accent: '#8a4f30' },
    spike: { base: '#e7dacd', tip: '#fff6ea' },
    vignette: 0.30
  };

  /* A theme object handed to themeZones MUST be resolved once, here: the
   * engine's themeForTileX() calls resolveTheme() every frame, and an
   * unresolved object comes back as a brand new object each time, so the
   * cross-fade restarts forever and the zone never actually arrives.
   * resolveTheme() returns its argument untouched once __ready is set. */
  function ready(t) {
    if (typeof RT.resolveTheme === 'function') return RT.resolveTheme(t);
    t.__ready = true;
    return t;
  }
  AFTERNOON = ready(AFTERNOON);
  GOLDEN = ready(GOLDEN);

  /* ---- how far through the day we are (0 meadow noon .. 1 sunset) ------ */
  function dusk() {
    var p = RT.player ? (RT.player.x / T) : 0;
    return cl01((p - 20) / 18);          // swings across the checkpoint at col 31
  }

  /* ---- parallax: where does world X draw for a layer of depth s? ------- */
  function pX(wx, s, cam) { return cam.x + (wx - cam.x) * s; }
  function pY(wy, s, cam) { return cam.y + (wy - cam.y) * s; }

  /* ======================================================================
   * CHALK JUMP ARCS - the signature of this level.
   * Each entry is [takeoffX, takeoffFeetY, landX, landFeetY] in px. The arc
   * is integrated with the contract's own numbers (-560 launch, 1550 rising,
   * 2200 falling) and the horizontal speed is solved for - and capped at the
   * real run speed of 210 px/s - so a drawn arc is always a real jump.
   * ==================================================================== */
  var ARCS = [
    [4 * T, GROUND_Y, 7 * T + 16, GROUND_Y],        // pair 1
    [9 * T, GROUND_Y, 12 * T + 16, GROUND_Y],       // pair 2
    [15 * T, GROUND_Y, 16 * T + 16, 10 * T],        // up onto the pillar
    [18 * T, 10 * T, 20 * T + 16, GROUND_Y],        // off the pillar
    [23 * T, GROUND_Y, 25 * T + 16, 10 * T],        // up onto the plank
    [27 * T, 10 * T, 28 * T + 16, GROUND_Y],        // off the plank
    [34 * T, GROUND_Y, 37 * T, 11 * T],             // pair A, one step up
    [39 * T, 11 * T, 42 * T, 10 * T],               // pair B, one step up
    [44 * T, 10 * T, 47 * T, 11 * T],               // pair C, one step down
    [50 * T, 11 * T, 54 * T, GROUND_Y],             // pair D
    [56 * T, GROUND_Y, 57 * T + 16, GROUND_Y],      // pair E, into the pocket
    [59 * T, GROUND_Y, 61 * T, GROUND_Y],           // out of the pocket
    [62 * T, GROUND_Y, 62 * T + 16, 11 * T]         // up onto the spring
  ];
  var JUMP_V = 560, G_UP = 1550, G_DN = 2200, RUN = 210;
  var T_APEX = JUMP_V / G_UP;                                    // 0.361 s
  var H_APEX = JUMP_V * T_APEX - 0.5 * G_UP * T_APEX * T_APEX;   // 101.2 px

  function arcY(y0, t) {
    if (t < T_APEX) return y0 - JUMP_V * t + 0.5 * G_UP * t * t;
    var d = t - T_APEX;
    return y0 - H_APEX + 0.5 * G_DN * d * d;
  }
  function arcTime(y0, y1) {
    var apex = y0 - H_APEX;
    if (y1 <= apex) {                                 // lands while still rising
      var a = 0.5 * G_UP, b = -JUMP_V, c = y0 - y1;
      var disc = b * b - 4 * a * c;
      if (disc < 0) return T_APEX;
      return (-b - Math.sqrt(disc)) / (2 * a);
    }
    return T_APEX + Math.sqrt(2 * (y1 - apex) / G_DN);
  }

  function drawArc(g, a, alpha, col) {
    var t = arcTime(a[1], a[3]);
    if (!(t > 0.05)) return;
    var vx = (a[2] - a[0]) / t;
    if (vx > RUN) vx = RUN;
    var n = 15, i, x, y, r;
    for (i = 1; i <= n; i++) {
      var tt = t * (i / n);
      x = a[0] + vx * tt;
      y = arcY(a[1], tt) - 14;                        // drawn at chest height
      r = 2.6 - 1.1 * Math.abs(i / n - 0.5) * 2;
      var al = alpha * (0.4 + 0.6 * Math.sin(Math.PI * (i / n)));
      /* dark core first: a white dot alone vanishes against a bright sky */
      g.globalAlpha = al * 0.55;
      g.fillStyle = 'rgba(30,26,48,1)';
      g.beginPath();
      g.arc(x + 0.8, y + 1.1, r + 0.9, 0, 6.2832);
      g.fill();
      g.globalAlpha = al;
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, r, 0, 6.2832);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  /* ======================================================================
   * BACKGROUND ART (layer 'back'): a sinking sun, a flock, two windmills on
   * a fence line, and grass growing out of the ground line.
   * ==================================================================== */
  function drawSun(g, cam, view, d) {
    var sx = cam.x + (0.72 - 0.5) * view.w;
    var sy = cam.y + (lerp(0.20, 0.44, d) - 0.5) * view.h;
    var r = lerp(30, 52, d);
    var core = mix('#fff8d6', '#ff7b3a', d);
    var grd = g.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 3.6);
    grd.addColorStop(0, rgba(d > 0.5 ? '#ff9a4e' : '#ffe9a8', lerp(0.22, 0.42, d)));
    grd.addColorStop(1, 'rgba(255,180,90,0)');
    g.fillStyle = grd;
    g.beginPath(); g.arc(sx, sy, r * 3.6, 0, 6.2832); g.fill();
    g.fillStyle = core;
    g.beginPath(); g.arc(sx, sy, r, 0, 6.2832); g.fill();
    /* banded sunset disc - this level's own look */
    if (d > 0.15) {
      g.save();
      g.beginPath(); g.arc(sx, sy, r, 0, 6.2832); g.clip();
      g.fillStyle = 'rgba(120,40,70,' + (0.10 + 0.22 * d) + ')';
      for (var i = 0; i < 5; i++) {
        var by = sy - r + r * 0.42 * i + r * 0.30;
        g.fillRect(sx - r, by, r * 2, r * 0.13);
      }
      g.restore();
    }
    g.strokeStyle = 'rgba(255,255,255,' + (0.10 + 0.14 * d) + ')';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(sx, sy, r + 1, 0, 6.2832); g.stroke();
  }

  function drawFlock(g, cam, view, d) {
    var s = 0.25;
    var t = RT.time || 0;
    var hx0 = 620 + t * 13;
    var hy0 = 150 + Math.sin(t * 0.25) * 16;
    var col = 'rgba(' + (d > 0.5 ? '60,34,58' : '52,74,96') + ',' + (0.30 + 0.25 * d) + ')';
    g.strokeStyle = col; g.lineWidth = 1.6; g.lineCap = 'round';
    for (var i = 0; i < 7; i++) {
      var row = i < 4 ? i : (i - 3);
      var side = i < 4 ? -1 : 1;
      var bx = pX(hx0 + row * 17, s, cam) + side * row * 13;
      var by = pY(hy0 + row * 9, s, cam);
      var f = Math.sin(t * 5 + i * 1.1) * 2.4;
      g.beginPath();
      g.moveTo(bx - 5, by + f);
      g.quadraticCurveTo(bx - 2, by - 2 - f, bx, by);
      g.quadraticCurveTo(bx + 2, by - 2 - f, bx + 5, by + f);
      g.stroke();
    }
  }

  function windmill(g, x, y, scale, col, dark, t) {
    g.save();
    g.translate(x, y);
    g.scale(scale, scale);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(-9, 0); g.lineTo(-5, -34); g.lineTo(5, -34); g.lineTo(9, 0);
    g.closePath(); g.fill();
    g.fillStyle = dark;
    g.fillRect(-7, -12, 14, 3);
    g.beginPath();
    g.moveTo(-7, -34); g.lineTo(0, -43); g.lineTo(7, -34);
    g.closePath(); g.fill();
    g.translate(0, -37);
    g.rotate(t * 0.55);
    g.fillStyle = col;
    for (var i = 0; i < 4; i++) {
      g.save();
      g.rotate(i * Math.PI / 2);
      g.beginPath();
      g.moveTo(0, -2); g.lineTo(26, -5); g.lineTo(27, 3); g.lineTo(0, 2);
      g.closePath(); g.fill();
      g.restore();
    }
    g.fillStyle = dark;
    g.beginPath(); g.arc(0, 0, 2.6, 0, 6.2832); g.fill();
    g.restore();
  }

  function drawHorizon(g, cam, view, d) {
    var s = 0.45;
    var col = mix('#4e7f52', '#5a2f55', d);
    var dark = mix('#33603a', '#38173a', d);
    var hy = pY(GROUND_Y - 26, s, cam);
    var step = 96 * s;
    var base = pX(0, s, cam);
    var i0 = Math.floor((cam.x - view.w / 2 - base) / step) - 1;
    var i1 = Math.ceil((cam.x + view.w / 2 - base) / step) + 1;
    g.globalAlpha = 0.9;
    g.fillStyle = col;
    g.fillRect(cam.x - view.w / 2, hy - 10, view.w, 2.5);
    g.fillRect(cam.x - view.w / 2, hy - 4, view.w, 2.5);
    for (var i = i0; i <= i1; i++) {
      var x = base + i * step;
      g.fillRect(x - 1.5, hy - 15, 3, 16);
      if (((i % 5) + 5) % 5 === 0) {                 /* haystack */
        g.beginPath();
        g.moveTo(x - 13, hy + 1);
        g.quadraticCurveTo(x, hy - 22, x + 13, hy + 1);
        g.closePath();
        g.fillStyle = dark; g.fill(); g.fillStyle = col;
      }
    }
    var t = RT.time || 0;
    windmill(g, pX(520, s, cam), hy + 1, 1.0, col, dark, t);
    windmill(g, pX(1880, s, cam), hy + 1, 0.72, col, dark, -t * 0.8);
    g.globalAlpha = 1;
  }

  function drawTufts(g, cam, view, d) {
    var x0 = Math.floor((cam.x - view.w / 2) / 16) * 16;
    var x1 = cam.x + view.w / 2 + 16;
    var t = RT.time || 0;
    var green = mix('#6ed85a', '#b09a48', d);
    var deep = mix('#2f7d3a', '#4a2f3e', d);
    g.lineCap = 'round';
    for (var x = x0; x < x1; x += 16) {
      var tx = Math.floor(x / T);
      if (RT.getTile(tx, 12) !== '#') continue;        /* no grass over the pit */
      var n = nz(tx, x % T);
      var blades = 2 + ((n * 3) | 0);
      for (var b = 0; b < blades; b++) {
        var bx = x + b * 4 + n * 5;
        var hgt = 7 + nz(bx, 3) * 11;
        var sway = Math.sin(t * 1.4 + bx * 0.06) * (2.2 + hgt * 0.06);
        g.strokeStyle = (b % 2) ? deep : green;
        g.lineWidth = 1.6;
        g.beginPath();
        g.moveTo(bx, GROUND_Y + 2);
        g.quadraticCurveTo(bx + sway * 0.4, GROUND_Y - hgt * 0.6, bx + sway, GROUND_Y - hgt);
        g.stroke();
      }
    }
  }

  /* ======================================================================
   * FOREGROUND ATMOSPHERE (layer 'front')
   * ==================================================================== */
  function drawMotes(g, cam, view, d) {
    var t = RT.time || 0;
    var col = d > 0.4 ? '255,226,170' : '255,255,236';
    for (var i = 0; i < 44; i++) {
      var sp = 7 + nz(i, 1) * 16;
      var mx = cam.x - view.w / 2 + ((nz(i, 2) * view.w + t * sp) % view.w);
      var my = cam.y - view.h / 2 + ((nz(i, 3) * view.h + Math.sin(t * 0.5 + i) * 26 + view.h) % view.h);
      var r = 1.0 + nz(i, 4) * 2.0;
      var a = 0.10 + nz(i, 5) * 0.30;
      g.fillStyle = 'rgba(' + col + ',' + a + ')';
      g.beginPath(); g.arc(mx, my, r, 0, 6.2832); g.fill();
      if (nz(i, 6) > 0.82) {                           /* a dandelion seed */
        g.strokeStyle = 'rgba(' + col + ',' + (a * 0.8) + ')';
        g.lineWidth = 0.8;
        for (var k = 0; k < 4; k++) {
          var ang = k * 1.5708 + t * 0.6 + i;
          g.beginPath();
          g.moveTo(mx, my);
          g.lineTo(mx + Math.cos(ang) * (r + 3.5), my + Math.sin(ang) * (r + 3.5));
          g.stroke();
        }
      }
    }
  }

  function drawShafts(g, cam, view, d) {
    if (d < 0.12) return;
    var t = RT.time || 0;
    g.save();
    g.translate(cam.x + view.w * 0.30, cam.y - view.h * 0.5);
    g.rotate(0.42);
    for (var i = 0; i < 4; i++) {
      var w = 26 + i * 15;
      var x = -180 + i * 130 + Math.sin(t * 0.13 + i) * 12;
      g.fillStyle = 'rgba(255,196,128,' + (0.030 + 0.045 * d) + ')';
      g.fillRect(x, -40, w, view.h * 2.1);
    }
    g.restore();
  }

  /* ====================================================================== */

  RT.registerLevel(2, {
    name: 'DOUBLE TROUBLE',
    subtitle: 'They come in pairs',
    theme: AFTERNOON,
    themeZones: [{ x0: 30, x1: 999, theme: GOLDEN }],
    music: 'meadow',

    tiles: [
      '..........................................................................',
      '.................................................................o........',
      '...................................................................o......',
      '................................................................o.........',
      '..........................................................................',
      '...............................................................o....o.....',
      '..........................................................................',
      '..........................................................................',
      '..........................................................................',
      '.....o....o.....o........o.........................o......................',
      '................##......---............^^###^^............................',
      '.P..^^...^.^...^##^............C..^^##############^.^...^oo^..#^^^^^..G...',
      '#######################.....##############################################',
      '#######################^^^^^##############################################',
      '##########################################################################'
    ],

    entities: [
      /* ---- the spring that clears the 5-wide field --------------------- */
      { type: 'spring', x: 62, y: 10, dir: 'up' },

      /* ---- signs, with opinions ---------------------------------------- */
      { type: 'sign', x: 3, y: 11, range: 3,
        text: 'Two spikes now. One jump. You do the maths.' },
      { type: 'sign', x: 13, y: 11, range: 2.6,
        text: 'That block in the middle is a step, not a decoration.' },
      { type: 'sign', x: 21, y: 11, range: 2.6,
        text: 'The plank holds. The pit does not.' },
      { type: 'sign', x: 42, y: 9, range: 3,
        text: 'Up was the easy half. Sorry about the view.' },
      { type: 'sign', x: 60, y: 11, range: 3,
        text: 'Five spikes. Everyone who tried to JUMP them is buried here.' },

      /* ---- sky writing -------------------------------------------------- */
      { type: 'text', x: 3, y: 3.2, w: 9, h: 2, text: 'DOUBLE TROUBLE',
        size: 1.55, color: 'rgba(255,255,255,0.22)', outline: false, shadow: false },
      { type: 'text', x: 7, y: 5.1, w: 4, h: 1.2, text: 'x2',
        size: 1.0, color: 'rgba(255,255,255,0.16)', outline: false, shadow: false, rot: -8 },
      { type: 'text', x: 27, y: 6.4, w: 9, h: 1.2, text: 'half way, twice the trouble',
        size: 0.6, color: 'rgba(255,255,255,0.20)', outline: false, shadow: false },
      { type: 'text', x: 44, y: 5.0, w: 6, h: 1.4, text: 'down we go',
        size: 0.75, color: 'rgba(255,236,200,0.20)', outline: false, shadow: false, rot: 7 },
      { type: 'text', x: 56.5, y: 4.4, w: 7, h: 1.6, text: 'WHEEEE',
        size: 1.1, color: 'rgba(255,224,170,0.26)', outline: false, shadow: false, wave: 2.4, rot: -6 },

      /* ---- meadow dressing (layer 'back', so it can never hide a spike) - */
      { type: 'deco', kind: 'tree', x: 0, y: 9, w: 2.6, h: 3 },
      { type: 'deco', kind: 'tree', x: 7.3, y: 9.3, w: 2.1, h: 2.7, flip: true },
      { type: 'deco', kind: 'tree', x: 19.6, y: 9.1, w: 2.3, h: 2.9 },
      { type: 'deco', kind: 'bush', x: 2.4, y: 11.15, w: 1.3, h: 0.85 },
      { type: 'deco', kind: 'bush', x: 12.4, y: 11.15, w: 1.2, h: 0.85, flip: true },
      { type: 'deco', kind: 'bush', x: 29.3, y: 11.15, w: 1.4, h: 0.85 },
      { type: 'deco', kind: 'rock', x: 6.5, y: 11.3, w: 1, h: 0.7 },
      { type: 'deco', kind: 'rock', x: 22.2, y: 11.4, w: 0.8, h: 0.6, flip: true },
      { type: 'deco', kind: 'flag', x: 31.6, y: 9.2, w: 1, h: 2.8 },
      { type: 'deco', kind: 'cloud', x: 5, y: 1.6, w: 3.4, h: 1.5, alpha: 0.85 },
      { type: 'deco', kind: 'cloud', x: 14, y: 3.1, w: 2.6, h: 1.2, alpha: 0.6 },
      { type: 'deco', kind: 'cloud', x: 24, y: 1.2, w: 3.0, h: 1.3, alpha: 0.7 },
      { type: 'deco', kind: 'cloud', x: 46, y: 2.4, w: 3.6, h: 1.5, alpha: 0.6 },
      { type: 'deco', kind: 'cloud', x: 66, y: 1.8, w: 3.0, h: 1.3, alpha: 0.5 },

      /* ---- dusk dressing ------------------------------------------------ */
      { type: 'deco', kind: 'lamp', x: 33.3, y: 9.5, w: 1, h: 2.5 },
      { type: 'deco', kind: 'lamp', x: 53.3, y: 9.5, w: 1, h: 2.5 },
      { type: 'deco', kind: 'lamp', x: 69.3, y: 9.5, w: 1, h: 2.5 },
      { type: 'deco', kind: 'tree', x: 54.6, y: 9.2, w: 2.2, h: 2.8, flip: true },
      { type: 'deco', kind: 'bush', x: 47.4, y: 10.15, w: 1.3, h: 0.85 },
      { type: 'deco', kind: 'bush', x: 71.2, y: 11.15, w: 1.4, h: 0.85 },
      { type: 'deco', kind: 'torch', x: 41.2, y: 9.1, w: 0.8, h: 1.9 },

      /* the graveyard INSIDE the spike field - drawn behind the spikes */
      { type: 'deco', kind: 'grave', x: 63.3, y: 10.55, w: 0.9, h: 1.2, alpha: 0.95 },
      { type: 'deco', kind: 'grave', x: 65.1, y: 10.6, w: 0.8, h: 1.1, alpha: 0.9, flip: true },
      { type: 'deco', kind: 'grave', x: 66.4, y: 10.5, w: 0.9, h: 1.25, alpha: 0.95 },
      { type: 'deco', kind: 'flag', x: 72.2, y: 9.3, w: 1, h: 2.7 }
    ],

    intro: ['They come in PAIRS now.', 'Run first. Jump second.'],

    onLoad: function (RT) {
      RT.hud.set('pairs', '0/8');
    },

    onUpdate: function (RT) {
      /* a cleared-pairs counter in the HUD: feedback only, no gameplay */
      var px = RT.player.x / 32, n = 0, i;
      var GATES = [6, 12, 19, 36, 41, 46, 53, 60];   // one per spike pair
      for (i = 0; i < GATES.length; i++) if (px > GATES[i]) n++;
      RT.hud.set('pairs', n + '/8');
    },

    onCheckpoint: function (RT) {
      RT.toast('HALF WAY - the gaps get wider', 1.8);
      RT.flash('rgba(255,180,90,0.35)', 0.25);
    },

    onDeath: function (RT, cause) {
      if (cause !== 'spikes') return;
      var d = RT.deaths;
      if (d === 3) RT.toast('Tip: you are allowed to land BETWEEN them.', 2.2);
      else if (d === 8) RT.toast('Slow down before the little pillar.', 2.2);
      else if (d === 15) RT.toast('The spring does the last one for you.', 2.4);
    },

    onDraw: function (RT, g, layer) {
      var cam = RT.cam, view = RT.view;
      if (!cam || !view || !view.w) return;
      var d = dusk();

      if (layer === 'back') {
        drawSun(g, cam, view, d);
        drawFlock(g, cam, view, d);
        drawHorizon(g, cam, view, d);
        drawTufts(g, cam, view, d);
        return;
      }

      /* front: chalk arcs over the pairs, then the air itself */
      var pcx = RT.player.x + RT.player.w * 0.5;
      var col = d > 0.45 ? '#ffe7bb' : '#ffffff';
      for (var i = 0; i < ARCS.length; i++) {
        var a = ARCS[i];
        var mid = (a[0] + a[2]) * 0.5;
        var near = cl01((7 * T - Math.abs(pcx - mid)) / (3 * T));
        if (near <= 0.01) continue;
        drawArc(g, a, 0.8 * near, col);
      }
      drawMotes(g, cam, view, d);
      drawShafts(g, cam, view, d);
    }
  });
})();
