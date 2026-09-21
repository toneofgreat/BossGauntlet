/* ==========================================================================
 * RAGE TRIALS - levels/level03.js
 *   TRIAL III - "THE VOID"
 *   Easy jumps over nothing at all.
 *
 * Design (docs/DESIGN.md, Level 3): black sky, drifting stars and nebulas,
 * floating stone islands lit from below, fireflies. There is no floor - the
 * empty space underneath IS the difficulty. Every jump is easy (2-3 tile
 * gaps, one 4-tile stretch that lands a tile lower) and everything is
 * telegraphed: coins trace each arc, the movers draw their own path ghosts,
 * and a faint "star chart" line joins every landing in the trial.
 *
 * Beats: 2-tile gaps -> 3-tile gaps -> checkpoint -> horizontal mover ->
 *        two fallers -> the 4-tile stretch (coin arc at the apex) ->
 *        the slow vertical lift -> the island chain and the goal.
 *
 * Contract compliance: engine.js owns window.RT; this file only reads it.
 * All 14 rows are 90 chars, exactly one 'P', one 'G', one 'C'.
 * ========================================================================== */
(function () {
'use strict';

var RT = window.RT;
if (!RT || typeof RT.registerLevel !== 'function') {
  if (window.console && window.console.error) {
    window.console.error('[rage-trials] level03.js: engine.js must load first.');
  }
  return;
}

var T = 32;

/* ==========================================================================
 * THEMES - three flavours of nothing, blended by themeZones
 * ========================================================================== */

/* Nothing in this level has a horizon: no theme here gets a ground layer,
 * because the whole joke is that there is no ground. Depth comes from two
 * nebula sheets at different speeds plus the drifting islands in onDraw. */

/* x 0..20 - THE RIM: you can still almost see where you came from. */
var RIM = {
  sky: [[0, '#04050f'], [0.42, '#0c1030'], [0.78, '#181a46'], [1, '#2a2156']],
  parallax: [
    { kind: 'stars',  color: '#ffffff', y: 1, speed: 0.02, scale: 1 },
    { kind: 'nebula', color: '#4a2f8f', color2: '#1d5f8a', y: 1, speed: 0.05, scale: 1, alpha: 0.50 },
    { kind: 'nebula', color: '#2a3a86', color2: '#123a5e', y: 1, speed: 0.11, scale: 1, alpha: 0.30 }
  ],
  ambient: 'fireflies',
  fog: { color: '#171a44', alpha: 0.16 },
  tile: { top: '#6b7fbe', side: '#333c61', dark: '#191e36', rim: '#a8c0ff', accent: '#46527f' },
  spike: { base: '#7e8cc4', tip: '#dfe8ff' },
  vignette: 0.42
};

/* x 20..66 - THE DEEP: the built-in void, with its ground layer taken out. */
var DEEP = {
  sky: [[0, '#02030a'], [0.5, '#070b1c'], [1, '#0d1430']],
  parallax: [
    { kind: 'stars',  color: '#ffffff', y: 1, speed: 0.02, scale: 1 },
    { kind: 'nebula', color: '#3a2a7a', color2: '#12406b', y: 1, speed: 0.06, scale: 1, alpha: 0.55 },
    { kind: 'nebula', color: '#1b2a5c', color2: '#0d2440', y: 1, speed: 0.13, scale: 1, alpha: 0.28 }
  ],
  ambient: 'fireflies',
  fog: { color: '#0b1130', alpha: 0.22 },
  tile: { top: '#5a6ea8', side: '#2b3352', dark: '#151a2e', rim: '#93b0ff', accent: '#3c4874' },
  spike: { base: '#7e8cc4', tip: '#dfe8ff' },
  vignette: 0.48
};

/* x 64..90 - THE CORE: the void has a middle, and it is lit. */
var CORE = {
  sky: [[0, '#0a0320'], [0.38, '#1e0f42'], [0.72, '#3a1866'], [1, '#5a2a84']],
  parallax: [
    { kind: 'stars',  color: '#fff0ff', y: 1, speed: 0.02, scale: 1 },
    { kind: 'nebula', color: '#7b3ad6', color2: '#2a7fd0', y: 1, speed: 0.06, scale: 1, alpha: 0.70 },
    { kind: 'nebula', color: '#42179a', color2: '#7a2ad0', y: 1, speed: 0.14, scale: 1, alpha: 0.34 }
  ],
  ambient: 'fireflies',
  fog: { color: '#4a1f7a', alpha: 0.20 },
  tile: { top: '#9a7fe0', side: '#4a3580', dark: '#251a45', rim: '#dccaff', accent: '#6a4fae' },
  spike: { base: '#9a8cd4', tip: '#f0e8ff' },
  vignette: 0.40
};

/* ==========================================================================
 * THE MAP - 92 x 14.  Row 0 is the top; rows 12-13 are open void.
 *
 *   I1  x1-5    row10  spawn, the sign, the first two-tile hops
 *   I2  x8-11   row10
 *   I3  x14-17  row10
 *   I4  x21-24  row9   (a step up; three-tile gaps start here)
 *   I5  x28-32  row9   THE CHECKPOINT - the last solid thing before the movers
 *   ferry mover      x35..41 row9   (2-tile hop on, 2-tile hop off)
 *   I6  x44-47  row9
 *   fallers          x50-52 and x55-57, row9   (3 wide: landings stay easy)
 *   I7  x60-63  row9   the run-up for the four-tile stretch
 *   I8  x68-72  row10  (a tile lower, so the long jump is fair)
 *   lift mover       x75-77, row10 <-> row4
 *   I9a x80-83  row4
 *   I9b x86-90  row4   the goal at x88
 * ========================================================================== */

var TILES = [
'............................................................................................',
'............................................................................................',
'............................................................................................',
'.................................................................................oo.....G...',
'................................................................................####..#####.',
'..................................................................o.............####..#####.',
'............................................................................................',
'...................o......o.......o.......o......o....o...o.....o..o........................',
'......oo....oo................C...........................................o.................',
'..P..................####...#####...........####............####............................',
'.#####..####..####...####...#####...........####............####....#####...................',
'.#####..####..####...####...........................................#####...................',
'............................................................................................',
'............................................................................................'
];

var W = TILES[0].length, H = TILES.length;

/* ==========================================================================
 * THE STAR CHART - every landing in the trial, in order, drawn as a faint
 * dotted constellation so the route is readable before it is attempted.
 * (tile x = centre of the landing, tile y = its top surface)
 * ========================================================================== */
var CHART = [
  [3, 10], [9.5, 10], [15.5, 10], [22.5, 9], [30, 9],
  [36.5, 9], [40.5, 9], [45.5, 9], [51.5, 9], [56.5, 9],
  [61.5, 9], [70, 10], [76.5, 10], [76.5, 4], [81.5, 4], [88, 4]
];

/* ==========================================================================
 * Level-local state (onDraw is invoked as a bare function - never use `this`)
 * ========================================================================== */

var underRuns = [];        /* bottom edges of every island, for the underglow */
var said = { mover: 0, big: 0, lift: 0 };
var taunt = 0;

var TAUNTS = [
  'the void says thanks',
  'gravity remains undefeated',
  'you fell with real commitment',
  'that rock was RIGHT THERE',
  'the void is not even trying',
  'down is not a route'
];

/* deterministic 0..1 noise - never touches RT.random(), which gameplay owns */
function hash(n) {
  var s = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/* always-positive modulo, so a drifting mote never wraps off the top */
function wrap(v, span) {
  if (!(span > 0)) return 0;
  var m = v % span;
  return m < 0 ? m + span : m;
}

/* every horizontal run of solid tiles whose underside is open sky */
function scanUndersides() {
  underRuns = [];
  for (var y = 0; y < H; y++) {
    var run = null;
    for (var x = 0; x <= W; x++) {
      var solid = (x < W) && TILES[y].charAt(x) === '#';
      var open = solid && (y + 1 >= H || TILES[y + 1].charAt(x) !== '#');
      if (open) {
        if (!run) run = { x0: x, x1: x, y: y };
        else run.x1 = x;
      } else if (run) {
        underRuns.push(run);
        run = null;
      }
    }
    if (run) underRuns.push(run);
  }
}

/* ==========================================================================
 * BACKGROUND ART (layer 'back' - behind the tiles, drawn in world space)
 * ========================================================================== */

function parX(worldX, k, camX) { return worldX * k + camX * (1 - k); }

function drawPlanet(g, camX, camY, t) {
  /* THE ANCHOR - a dead ringed world the islands hang around. */
  var k = 0.07;
  var cx = parX(1180, k, camX);
  var cy = 70 * k + camY * (1 - k) - 96;
  var r = 132;
  var gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.35, r * 0.12, cx, cy, r);
  gr.addColorStop(0, 'rgba(92,74,158,0.55)');
  gr.addColorStop(0.55, 'rgba(48,36,96,0.42)');
  gr.addColorStop(1, 'rgba(14,10,34,0.30)');
  g.fillStyle = gr;
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  /* night side */
  g.fillStyle = 'rgba(6,6,18,0.32)';
  g.beginPath(); g.arc(cx + r * 0.30, cy + r * 0.10, r * 0.98, 0, Math.PI * 2); g.fill();
  /* rings */
  g.save();
  g.translate(cx, cy);
  g.rotate(-0.30 + Math.sin(t * 0.05) * 0.012);
  g.scale(1, 0.21);
  var ringCol = ['rgba(150,180,255,0.22)', 'rgba(120,90,210,0.18)', 'rgba(90,200,230,0.13)'];
  var ringW = [10, 5, 16];
  for (var i = 0; i < 3; i++) {
    g.strokeStyle = ringCol[i];
    g.lineWidth = ringW[i];
    g.beginPath(); g.arc(0, 0, r * (1.42 + i * 0.22), 0, Math.PI * 2); g.stroke();
  }
  g.restore();
}

function drawFarIslands(g, camX, camY, vx0, vx1) {
  /* the other trials, drifting well out of reach */
  var k = 0.34;
  for (var i = 0; i < 16; i++) {
    var wx = 60 + i * 190 + hash(i * 3.1) * 90;
    var px = parX(wx, k, camX);
    if (px < vx0 - 220 || px > vx1 + 220) continue;
    var wy = 40 + hash(i * 7.7) * 360;
    var py = wy * k + camY * (1 - k) - 40 + Math.sin(RT.time * 0.22 + i) * 5;
    var w = 46 + hash(i * 1.3) * 90;
    var h = 14 + hash(i * 5.9) * 12;
    g.fillStyle = 'rgba(16,20,44,0.85)';
    g.beginPath();
    g.moveTo(px - w / 2, py);
    g.lineTo(px + w / 2, py);
    g.lineTo(px + w * 0.28, py + h);
    g.lineTo(px - w * 0.10, py + h * 1.7);
    g.lineTo(px - w * 0.34, py + h * 0.8);
    g.closePath();
    g.fill();
    /* lit from below, like everything else here */
    g.strokeStyle = 'rgba(120,170,255,0.20)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(px - w * 0.36, py + h * 0.5);
    g.lineTo(px + w * 0.30, py + h * 0.92);
    g.stroke();
    g.fillStyle = 'rgba(150,190,255,0.16)';
    g.fillRect(px - w / 2, py - 2, w, 2);
  }
}

function drawAbyss(g, vx0, vx1, t) {
  /* the glow you are falling towards. It breathes. */
  var top = (H - 2.4) * T, bot = H * T + 190;
  var pulse = 0.16 + Math.sin(t * 0.7) * 0.04;
  var gr = g.createLinearGradient(0, top, 0, bot);
  gr.addColorStop(0, 'rgba(60,40,150,0)');
  gr.addColorStop(0.45, 'rgba(78,46,172,' + pulse.toFixed(3) + ')');
  gr.addColorStop(1, 'rgba(180,120,255,' + (pulse * 2.1).toFixed(3) + ')');
  g.fillStyle = gr;
  g.fillRect(vx0 - 60, top, (vx1 - vx0) + 120, bot - top);
  /* embers rising out of the deep */
  var span = (vx1 - vx0) + 200;
  g.fillStyle = 'rgba(190,160,255,0.30)';
  for (var i = 0; i < 26; i++) {
    var mx = vx0 - 100 + ((hash(i * 2.7) * span + t * (8 + hash(i) * 14)) % span);
    var life = (t * (0.10 + hash(i * 4.4) * 0.09) + hash(i * 9.1)) % 1;
    var my = H * T + 60 - life * (T * 4.6);
    g.globalAlpha = 0.34 * (1 - life);
    g.fillRect(mx, my, 2, 2 + hash(i * 6.2) * 3);
  }
  g.globalAlpha = 1;
}

function drawUnderglow(g, vx0, vx1, t) {
  /* every island is lit from below - no shadowBlur anywhere (contract 12) */
  for (var i = 0; i < underRuns.length; i++) {
    var r = underRuns[i];
    var x0 = r.x0 * T, x1 = (r.x1 + 1) * T, by = (r.y + 1) * T;
    if (x1 < vx0 - 120 || x0 > vx1 + 120) continue;
    var cx = (x0 + x1) / 2, w = x1 - x0;
    var rad = Math.max(80, w * 1.05);
    var a = 0.44 + Math.sin(t * 0.9 + i * 1.7) * 0.07;
    var gr = g.createRadialGradient(cx, by + 3, 4, cx, by + 3, rad);
    gr.addColorStop(0, 'rgba(165,215,255,' + a.toFixed(3) + ')');
    gr.addColorStop(0.28, 'rgba(110,160,255,' + (a * 0.62).toFixed(3) + ')');
    gr.addColorStop(0.62, 'rgba(78,104,224,' + (a * 0.26).toFixed(3) + ')');
    gr.addColorStop(1, 'rgba(60,70,180,0)');
    g.fillStyle = gr;
    g.beginPath();
    if (g.ellipse) g.ellipse(cx, by + 3, rad, rad * 0.88, 0, 0, Math.PI * 2);
    else g.arc(cx, by + 3, rad, 0, Math.PI * 2);
    g.fill();
    /* stone roots hanging into nothing, lit along one edge */
    var n = Math.max(1, Math.round(w / 34));
    for (var k = 0; k < n; k++) {
      var rx = x0 + (k + 0.5) * (w / n) + (hash(i * 3 + k) - 0.5) * 10;
      var rh = 10 + hash(i * 7 + k * 2.3) * 26;
      var tipx = rx + (hash(i + k) - 0.5) * 7;
      g.fillStyle = 'rgba(22,28,54,0.92)';
      g.beginPath();
      g.moveTo(rx - 6, by - 2);
      g.lineTo(rx + 6, by - 2);
      g.lineTo(tipx, by + rh);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(150,195,255,0.28)';
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(rx + 5, by - 1);
      g.lineTo(tipx, by + rh);
      g.stroke();
    }
    /* bright underside rim, drawn last so the roots hang off it */
    g.fillStyle = 'rgba(190,225,255,' + (0.62 + Math.sin(t * 1.4 + i) * 0.10).toFixed(3) + ')';
    g.fillRect(x0 + 1, by - 2, w - 2, 3);
    g.fillStyle = 'rgba(120,175,255,0.34)';
    g.fillRect(x0 + 3, by + 1, w - 6, 2);
  }
}

function drawChart(g, t) {
  /* the whole trial, written in the stars */
  var i, px, py;
  g.save();
  g.globalAlpha = 0.20 + Math.sin(t * 0.8) * 0.04;
  g.strokeStyle = '#9fc4ff';
  g.lineWidth = 1.4;
  if (g.setLineDash) g.setLineDash([3, 9]);
  g.beginPath();
  for (i = 0; i < CHART.length; i++) {
    px = CHART[i][0] * T; py = CHART[i][1] * T - 14;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke();
  if (g.setLineDash) g.setLineDash([]);
  g.restore();
  for (i = 0; i < CHART.length; i++) {
    px = CHART[i][0] * T; py = CHART[i][1] * T - 14;
    var tw = 0.5 + 0.5 * Math.sin(t * 1.6 + i * 0.9);
    g.globalAlpha = 0.16 + tw * 0.26;
    g.fillStyle = '#dbe8ff';
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI / 4);
    var s = 2.2 + tw * 1.6;
    g.fillRect(-s / 2, -s / 2, s, s);
    g.restore();
  }
  g.globalAlpha = 1;
}

function drawShootingStars(g, camX, camY, t) {
  var k = 0.16;
  for (var i = 0; i < 3; i++) {
    var period = 8.5 + i * 3.7;
    var ph = ((t + i * 5.1) % period) / period;
    if (ph > 0.13) continue;
    var f = ph / 0.13;
    var sx = parX(200 + i * 900 + hash(i * 11.3) * 400, k, camX) + f * 420;
    var sy = (30 + hash(i * 4.2) * 150) * k + camY * (1 - k) - 120 + f * 150;
    g.globalAlpha = Math.sin(f * Math.PI) * 0.75;
    g.strokeStyle = '#eaf2ff';
    g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx - 54, sy - 19); g.stroke();
    g.lineWidth = 0.9;
    g.strokeStyle = 'rgba(160,200,255,0.75)';
    g.beginPath(); g.moveTo(sx - 40, sy - 14); g.lineTo(sx - 112, sy - 40); g.stroke();
  }
  g.globalAlpha = 1;
}

/* ==========================================================================
 * FOREGROUND ATMOSPHERE (layer 'front')
 * ========================================================================== */

function drawMotes(g, camX, camY, vx0, vx1, vy0, vy1, t) {
  /* void spores drifting between the player and the camera */
  var k = 1.42;
  var spanX = (vx1 - vx0) + 240, spanY = (vy1 - vy0) + 240;
  for (var i = 0; i < 44; i++) {
    var mx = vx0 - 120 + wrap(hash(i * 1.77) * spanX + t * (6 + hash(i) * 16), spanX);
    var my = vy0 - 120 + wrap(hash(i * 3.31) * spanY + Math.sin(t * 0.4 + i) * 22 + t * 3, spanY);
    mx = parX(mx, k, camX);
    my = my * k + camY * (1 - k);
    var s = 1.2 + hash(i * 5.5) * 2.6;
    g.globalAlpha = 0.08 + hash(i * 8.8) * 0.20;
    g.fillStyle = (i % 3 === 0) ? '#cfe3ff' : (i % 3 === 1 ? '#b79cff' : '#7fe6ff');
    g.beginPath(); g.arc(mx, my, s, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
}

function drawDepthHaze(g, vx0, vx1) {
  /* a cold haze under every platform in the level - it sells the drop */
  var top = 11.7 * T, bot = H * T;
  var gr = g.createLinearGradient(0, top, 0, bot);
  gr.addColorStop(0, 'rgba(10,8,34,0)');
  gr.addColorStop(1, 'rgba(10,8,34,0.42)');
  g.fillStyle = gr;
  g.fillRect(vx0 - 40, top, (vx1 - vx0) + 80, bot - top);
}

/* ==========================================================================
 * THE LEVEL
 * ========================================================================== */

RT.registerLevel(3, {
  name: 'THE VOID',
  subtitle: 'Easy jumps over nothing at all',
  theme: 'void',
  music: 'void',

  themeZones: [
    { x0: -1, x1: 20,  theme: RIM },
    { x0: 20, x1: 66,  theme: DEEP },
    { x0: 66, x1: 999, theme: CORE }
  ],

  tiles: TILES,

  intro: [
    'There is no floor.',
    'The rocks are enough.'
  ],

  entities: [
    /* ---- the ferry (beat 3) ------------------------------------------ */
    { type: 'mover', x: 35, y: 9, w: 3, h: 1,
      path: [[35, 9], [39, 9]], speed: 2, pause: 0.6, pal: 'ice' },

    /* ---- two rocks with commitment issues (beat 4) -------------------- */
    { type: 'faller', x: 50, y: 9, w: 3, h: 1, delay: 0.7, respawn: 2.5, pal: 'stone' },
    { type: 'faller', x: 55, y: 9, w: 3, h: 1, delay: 0.7, respawn: 2.5, pal: 'stone' },

    /* ---- the slow lift to the core (beat 6) --------------------------- */
    { type: 'mover', x: 75, y: 10, w: 3, h: 1,
      path: [[75, 10], [75, 4]], speed: 2, pause: 1.2, pal: 'ice' },

    /* ---- signs -------------------------------------------------------- */
    { type: 'sign', x: 4,  y: 9, text: 'No floor. No net. Just some very confident rocks. Go.' },
    { type: 'sign', x: 16, y: 9, text: 'The gaps get wider. You do not. Take a run-up.' },
    { type: 'sign', x: 32, y: 8, text: 'Flag planted. The void has agreed to forget everything before this.' },
    { type: 'sign', x: 45, y: 8, text: 'The next two rocks have commitment issues. Do not stand about.' },
    { type: 'sign', x: 61, y: 8, text: 'The big one. Full speed, follow the coins, land lower. Do not think.' },
    { type: 'sign', x: 69, y: 9, text: 'The lift is free. Patience is the fare.' },
    { type: 'sign', x: 86, y: 3, text: 'You crossed nothing sixteen times. On purpose. Well done.' },

    /* ---- world-space text --------------------------------------------- */
    { type: 'text', x: 4,  y: 1.6,  w: 10, h: 2,   text: 'THE VOID', size: 1.55,
      color: '#9fb6ff', alpha: 0.30, wave: 2.2 },
    { type: 'text', x: 24, y: 12.3, w: 12, h: 1,   text: 'nothing down there', size: 0.62,
      color: '#6a79c0', alpha: 0.50, rot: -3 },
    { type: 'text', x: 49, y: 12.6, w: 12, h: 1,   text: 'still nothing', size: 0.55,
      color: '#6a79c0', alpha: 0.42, rot: 2 },
    { type: 'text', x: 62, y: 2.4,  w: 10, h: 1,   text: 'FULL SPEED', size: 0.85,
      color: '#ffd27a', alpha: 0.55, wave: 1.2 },
    { type: 'text', x: 72, y: 7.2,  w: 8,  h: 1,   text: 'wait for it', size: 0.6,
      color: '#c9b4ff', alpha: 0.50 },
    { type: 'text', x: 80, y: 9.4,  w: 12, h: 1.4, text: 'THE CORE', size: 1.1,
      color: '#dccaff', alpha: 0.34, wave: 1.6 },

    /* ---- deco ---------------------------------------------------------- */
    { type: 'deco', kind: 'crystal', x: 1,    y: 9, scale: 0.90 },
    { type: 'deco', kind: 'rock',    x: 5,    y: 9, scale: 0.80 },
    { type: 'deco', kind: 'crystal', x: 9,    y: 9, scale: 0.70 },
    { type: 'deco', kind: 'skull',   x: 11,   y: 9, scale: 0.80 },
    { type: 'deco', kind: 'crystal', x: 14,   y: 9, scale: 1.00 },
    { type: 'deco', kind: 'rock',    x: 17,   y: 9, scale: 0.70 },
    { type: 'deco', kind: 'crystal', x: 21,   y: 8, scale: 1.15 },
    { type: 'deco', kind: 'rock',    x: 24,   y: 8, scale: 0.70 },
    { type: 'deco', kind: 'lamp',    x: 28.4, y: 7, w: 1.2, h: 2 },
    { type: 'deco', kind: 'crystal', x: 31,   y: 8, scale: 0.75 },
    { type: 'deco', kind: 'crystal', x: 44,   y: 8, scale: 0.90 },
    { type: 'deco', kind: 'rock',    x: 47,   y: 8, scale: 0.70 },
    { type: 'deco', kind: 'crystal', x: 60,   y: 8, scale: 1.00 },
    { type: 'deco', kind: 'rock',    x: 63,   y: 8, scale: 0.65 },
    { type: 'deco', kind: 'rock',    x: 68,   y: 9, scale: 0.80 },
    { type: 'deco', kind: 'crystal', x: 72,   y: 9, scale: 1.20 },
    { type: 'deco', kind: 'crystal', x: 80,   y: 3, scale: 1.30 },
    { type: 'deco', kind: 'lamp',    x: 83,   y: 2, w: 1.2, h: 2 },
    { type: 'deco', kind: 'crystal', x: 90,   y: 3, scale: 1.10 }
  ],

  /* ------------------------------------------------------------------ */
  onLoad: function (RT) {
    scanUndersides();
    said.mover = said.big = said.lift = 0;
  },

  onUpdate: function (RT, dt) {
    var p = RT.player;
    if (!p || p.dead) return;
    var tx = (p.x + p.w / 2) / 32;
    if (!said.mover && tx > 32.6) { said.mover = 1; RT.toast('the rock comes to you', 1.5); }
    if (!said.big && tx > 60.5) { said.big = 1; RT.toast('RUN', 1.1); }
    if (!said.lift && tx > 68.5) { said.lift = 1; RT.toast('wait for the lift', 1.6); }
  },

  onDeath: function (RT, cause) {
    if (!cause || cause === 'void') {
      RT.toast(TAUNTS[taunt % TAUNTS.length], 1.6);
      taunt++;
    }
  },

  onCheckpoint: function (RT, cp) {
    RT.flash('#5bff9b', 0.12);
  },

  onWin: function (RT) {
    RT.flash('#d8c6ff', 0.25);
    if (RT.cam && RT.cam.shake) RT.cam.shake(5, 0.35);
  },

  onDraw: function (RT, g, layer) {
    var cam = RT.cam, view = RT.view;
    if (!cam || !view) return;
    var t = RT.time || 0;
    var vx0 = cam.x - view.w / 2, vx1 = cam.x + view.w / 2;
    var vy0 = cam.y - view.h / 2, vy1 = cam.y + view.h / 2;

    if (layer === 'back') {
      drawPlanet(g, cam.x, cam.y, t);
      drawFarIslands(g, cam.x, cam.y, vx0, vx1);
      drawShootingStars(g, cam.x, cam.y, t);
      drawAbyss(g, vx0, vx1, t);
      drawChart(g, t);
      drawUnderglow(g, vx0, vx1, t);
      return;
    }

    drawDepthHaze(g, vx0, vx1);
    drawMotes(g, cam.x, cam.y, vx0, vx1, vy0, vy1, t);
  }
});

})();
