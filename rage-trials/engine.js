/*!
 * RAGE TRIALS - engine.js
 * ---------------------------------------------------------------------------
 * The core: fixed-step loop, input, player physics, tiles + chunked offscreen
 * caching, swept AABB collision, camera, 15 procedural themes with parallax,
 * particles, HUD / banner / toast / speech, entities, level flow, save,
 * menus, pause, settings, canvas modes (Tetris), DOM overlay and window.__dbg.
 *
 * Plain browser JavaScript. No modules, no frameworks, no external assets,
 * no fetch. engine.js is the only file that creates window.RT.
 * ---------------------------------------------------------------------------
 */
(function (window, document) {
'use strict';

/* ==========================================================================
 *  0. NAMESPACE + CONSTANTS
 * ========================================================================== */

var RT = {};
window.RT = RT;

var TILE = 32;
var DT = 1 / 60;
var CHUNK = 16;                     // tiles per cached chunk (16x16 => 512px)
var MAX_STEPS = 5;                  // simulation steps per rendered frame
var MAX_PARTICLES = 600;
var LEVEL_COUNT = 12;
var SAVE_KEY = 'rageTrialsSave';
var TILES_ON_SHORT_AXIS = 11;       // zoom rule
var VIEW_SHORT_PX = TILES_ON_SHORT_AXIS * TILE;   // 352

RT.TILE = TILE;
RT.dt = DT;
RT.CHUNK = CHUNK;
RT.LEVEL_COUNT = LEVEL_COUNT;
RT.MAX_PARTICLES = MAX_PARTICLES;
RT.version = '1.0.0';

RT.frame = 0;
RT.time = 0;
RT.manual = false;
RT.paused = false;
RT.deaths = 0;
RT.coins = 0;
RT.level = null;
RT.levelIndex = 0;
RT.LEVELS = {};
RT.onOff = true;
RT.groups = {};
RT.keys = {};
RT.god = false;
RT.noclip = false;

/** Player physics table - exactly section 4 of the contract. */
var PHYS = RT.PHYS = {
  W: 20,                      // hitbox width
  H: 28,                      // hitbox height
  RUN: 210,                   // max run speed px/s
  ACC_GROUND: 210 / 0.10,     // 2100  (max in 0.10s)
  DEC_GROUND: 210 / 0.07,     // 3000  (stop in 0.07s)
  ACC_AIR: 210 / 0.18,        // 1166.67 (max in 0.18s)
  JUMP: -560,
  GRAV_UP: 1550,
  GRAV_DOWN: 2200,
  APEX_V: 45,                 // |vy| under this while rising -> hang
  APEX_MUL: 0.55,
  CUT: 0.45,                  // jump release while rising
  TERM: 900,
  COYOTE: 6,                  // frames
  BUFFER: 8,                  // frames
  CORNER: 6,                  // px head nudge
  HAZARD_INSET: 3,
  SPIKE_INSET: 6,
  SPRING: -900,
  DASH_SPEED: 430,
  DASH_TIME: 0.15,
  DASH_COOLDOWN: 0.35,
  STOMP_BOUNCE: -350
};

/* ==========================================================================
 *  1. SMALL UTILITIES
 * ========================================================================== */

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
function approach(v, target, delta) {
  if (v < target) return Math.min(v + delta, target);
  if (v > target) return Math.max(v - delta, target);
  return target;
}
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }

function formatTime(s, cs) {
  if (!isFinite(s) || s < 0) s = 0;
  var m = Math.floor(s / 60);
  var sec = Math.floor(s % 60);
  if (!cs) return m + ':' + pad2(sec);
  var hund = Math.floor((s * 100) % 100);
  return m + ':' + pad2(sec) + '.' + pad2(hund);
}

RT.clamp = clamp;
RT.lerp = lerp;
RT.sign = sign;
RT.approach = approach;
RT.rectsOverlap = rectsOverlap;
RT.overlaps = rectsOverlap;
RT.formatTime = formatTime;

/* --- colours --------------------------------------------------------------
 * Themes use '#rgb' / '#rrggbb' / '#rrggbbaa' / 'rgb()' / 'rgba()' strings.
 */
var colorCache = {};
function parseColor(c) {
  if (typeof c !== 'string') return [255, 255, 255, 1];
  var hit = colorCache[c];
  if (hit) return hit;
  var out = [255, 255, 255, 1];
  if (c.charAt(0) === '#') {
    var s = c.slice(1);
    if (s.length === 3 || s.length === 4) {
      out = [parseInt(s[0] + s[0], 16), parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16),
             s.length === 4 ? parseInt(s[3] + s[3], 16) / 255 : 1];
    } else if (s.length === 6 || s.length === 8) {
      out = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16),
             s.length === 8 ? parseInt(s.slice(6, 8), 16) / 255 : 1];
    }
  } else {
    var m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) {
      var p = m[1].split(',');
      out = [parseFloat(p[0]) || 0, parseFloat(p[1]) || 0, parseFloat(p[2]) || 0,
             p.length > 3 ? parseFloat(p[3]) : 1];
    }
  }
  if (out[0] !== out[0]) out = [255, 255, 255, 1];
  colorCache[c] = out;
  return out;
}
function rgba(c, a) {
  var p = parseColor(c);
  var al = (a === undefined ? p[3] : a * p[3]);
  return 'rgba(' + (p[0] | 0) + ',' + (p[1] | 0) + ',' + (p[2] | 0) + ',' + (Math.round(al * 1000) / 1000) + ')';
}
function mixColor(c1, c2, t) {
  var a = parseColor(c1), b = parseColor(c2);
  return 'rgb(' + ((a[0] + (b[0] - a[0]) * t) | 0) + ',' +
                  ((a[1] + (b[1] - a[1]) * t) | 0) + ',' +
                  ((a[2] + (b[2] - a[2]) * t) | 0) + ')';
}
/** amt > 0 lightens toward white, amt < 0 darkens toward black. */
function shade(c, amt) {
  var p = parseColor(c);
  var target = amt < 0 ? 0 : 255;
  var t = Math.abs(amt);
  return 'rgb(' + ((p[0] + (target - p[0]) * t) | 0) + ',' +
                  ((p[1] + (target - p[1]) * t) | 0) + ',' +
                  ((p[2] + (target - p[2]) * t) | 0) + ')';
}
RT.rgba = rgba;
RT.mixColor = mixColor;
RT.shade = shade;

/* --- seeded random -------------------------------------------------------- */
function makeRng(seed) {
  var s = (seed >>> 0) || 0x9e3779b9;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    var t = s;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
var gameRng = makeRng(12345);
var artRng = makeRng(0xA17);            // art only - never affects gameplay
RT.random = function () { return gameRng(); };
RT.seed = function (n) { gameRng = makeRng(n | 0); return RT; };
/** integer in [a,b] using the gameplay stream */
RT.randInt = function (a, b) { return a + Math.floor(gameRng() * (b - a + 1)); };
RT.pick = function (arr) { return arr[Math.floor(gameRng() * arr.length) % arr.length]; };

/* ==========================================================================
 *  2. ERRORS  (hooks must never kill the loop)
 * ========================================================================== */

var errors = [];
function logError(where, err) {
  var rec = {
    where: where,
    message: (err && err.message) ? String(err.message) : String(err),
    stack: (err && err.stack) ? String(err.stack).split('\n').slice(0, 5).join(' | ') : '',
    frame: RT.frame,
    level: RT.levelIndex
  };
  errors.push(rec);
  if (errors.length > 300) errors.shift();
  try { console.error('[RT] ' + where + ': ' + rec.message, err); } catch (e) { /* no console */ }
}
/** Call fn(a,b,c) and swallow+record anything it throws. */
function safe(where, fn, a, b, c) {
  if (typeof fn !== 'function') return undefined;
  try { return fn(a, b, c); } catch (e) { logError(where, e); return undefined; }
}
RT.logError = logError;
RT.safe = safe;

/* ==========================================================================
 *  3. EVENT BUS
 * ========================================================================== */

var listeners = {};
RT.on = function (evt, fn) {
  if (typeof fn !== 'function') return function () {};
  (listeners[evt] || (listeners[evt] = [])).push(fn);
  return function off() {
    var a = listeners[evt]; if (!a) return;
    var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
  };
};
RT.off = function (evt, fn) {
  var a = listeners[evt]; if (!a) return;
  var i = a.indexOf(fn); if (i >= 0) a.splice(i, 1);
};
RT.emit = function (evt, a, b, c) {
  var arr = listeners[evt];
  if (!arr) return;
  for (var i = 0; i < arr.length; i++) safe('on(' + evt + ')', arr[i], a, b, c);
};

/* ==========================================================================
 *  4. AUDIO GUARDS  (a missing sfx name must never throw)
 * ========================================================================== */

function sfx(name) {
  var A = RT.Audio;
  if (A && typeof A.sfx === 'function') {
    try { A.sfx(name); } catch (e) { logError('Audio.sfx(' + name + ')', e); }
  }
}
function playMusic(name) {
  var A = RT.Audio;
  if (!name) return;
  if (A && typeof A.music === 'function') {
    try { A.music(name); } catch (e) { logError('Audio.music(' + name + ')', e); }
  }
}
function stopMusic() {
  var A = RT.Audio;
  if (A && typeof A.stopMusic === 'function') {
    try { A.stopMusic(); } catch (e) { logError('Audio.stopMusic', e); }
  }
}
function unlockAudio() {
  var A = RT.Audio;
  if (A && typeof A.unlock === 'function') {
    try { A.unlock(); } catch (e) { logError('Audio.unlock', e); }
  }
}
function audioEnabled(b) {
  var A = RT.Audio;
  if (A && typeof A.setEnabled === 'function') {
    try { A.setEnabled(!!b); } catch (e) { logError('Audio.setEnabled', e); }
  }
}
RT.sfx = sfx;   // convenience for levels; RT.Audio.sfx remains the contract API

/* ==========================================================================
 *  5. SAVE
 * ========================================================================== */

function defaultSave() {
  return {
    v: 1,
    unlocked: 1,
    best: {},
    totalDeaths: 0,
    totalTime: 0,
    settings: { sound: true, pads: true, lefty: false }
  };
}

var save = defaultSave();
RT.save = save;

function loadSave() {
  var raw = null;
  try { raw = window.localStorage.getItem(SAVE_KEY); } catch (e) { raw = null; }
  var s = defaultSave();
  if (raw) {
    var parsed = null;
    try { parsed = JSON.parse(raw); } catch (e) { parsed = null; }
    if (parsed && typeof parsed === 'object') {
      s.unlocked = clamp(parsed.unlocked | 0, 1, LEVEL_COUNT);
      s.totalDeaths = Math.max(0, parsed.totalDeaths | 0);
      s.totalTime = Math.max(0, +parsed.totalTime || 0);
      if (parsed.best && typeof parsed.best === 'object') {
        for (var k in parsed.best) {
          if (!Object.prototype.hasOwnProperty.call(parsed.best, k)) continue;
          var b = parsed.best[k];
          if (b && typeof b === 'object') {
            s.best[k] = { time: +b.time || 0, deaths: b.deaths | 0, coins: b.coins | 0 };
          }
        }
      }
      if (parsed.settings && typeof parsed.settings === 'object') {
        s.settings.sound = parsed.settings.sound !== false;
        s.settings.pads = parsed.settings.pads !== false;
        s.settings.lefty = !!parsed.settings.lefty;
      }
    }
  }
  // copy onto the live object so references stay valid
  save.v = 1;
  save.unlocked = s.unlocked;
  save.best = s.best;
  save.totalDeaths = s.totalDeaths;
  save.totalTime = s.totalTime;
  save.settings = s.settings;
  return save;
}

function saveNow() {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1,
      unlocked: save.unlocked,
      best: save.best,
      totalDeaths: save.totalDeaths,
      totalTime: save.totalTime,
      settings: save.settings
    }));
  } catch (e) { /* private mode / full quota - never fatal */ }
  return save;
}
RT.saveNow = saveNow;

function unlockAll() {
  save.unlocked = LEVEL_COUNT;
  saveNow();
  buildLevelGrid();
  return save.unlocked;
}
RT.unlockAll = unlockAll;

/* ==========================================================================
 *  6. DOM
 * ========================================================================== */

function $(id) { return document.getElementById(id); }
var D = {};                            // cached DOM refs, filled in boot()

function grabDom() {
  var ids = ['game', 'hud', 'hudLevel', 'hudNum', 'hudName', 'hudExtra', 'hudCoinChip', 'hudCoins',
             'hudDeathChip', 'hudDeaths', 'hudTimeChip', 'hudTime', 'btnPause',
             'banner', 'toast', 'pads', 'padMove', 'padAct', 'padLeft', 'padRight', 'padJump', 'padAction',
             'menu', 'btnPlay', 'btnLevels', 'btnHow', 'menuStats',
             'levelSelect', 'levelGrid', 'selStats', 'btnBackMenu',
             'pause', 'btnResume', 'btnRestart', 'btnPauseLevels', 'btnPauseMenu',
             'tgSound', 'tgPads', 'tgLefty',
             'results', 'resRank', 'resTitle', 'resSub', 'resTime', 'resDeaths', 'resCoins', 'resBest',
             'btnNext', 'btnRetry', 'btnResLevels',
             'theEnd', 'endRating', 'endStats', 'endSub', 'btnEndLevels', 'btnEndMenu',
             'overlay', 'overlayBody', 'overlayClose', 'scan'];
  for (var i = 0; i < ids.length; i++) D[ids[i]] = $(ids[i]);
}

function show(el, on) { if (el) el.hidden = !on; }
function setText(el, t) { if (el && el.textContent !== t) el.textContent = t; }

/* ==========================================================================
 *  7. CANVAS / VIEW / CAMERA BASICS
 * ========================================================================== */

var canvas = null, ctx = null;
var dpr = 1, cssW = 320, cssH = 480, zoom = 1, scale = 1;

RT.view = { w: VIEW_SHORT_PX, h: VIEW_SHORT_PX };
RT.dpr = 1;

var cam = RT.cam = {
  x: 0, y: 0, zoom: 1,
  shake: function (power, dur) { addShake(power, dur); }
};
var camTargetX = 0, camTargetY = 0, camInit = false;
var shakePower = 0, shakeTime = 0, shakeDur = 0, shakeX = 0, shakeY = 0;

function addShake(power, dur) {
  power = +power || 0;
  dur = dur === undefined ? 0.25 : (+dur || 0);
  if (power > shakePower || shakeTime <= 0) { shakePower = Math.max(shakePower, power); }
  shakeDur = Math.max(shakeDur, dur);
  shakeTime = Math.max(shakeTime, dur);
}

function resize() {
  if (!canvas) return;
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cssW = Math.max(1, window.innerWidth || document.documentElement.clientWidth || 320);
  cssH = Math.max(1, window.innerHeight || document.documentElement.clientHeight || 480);
  var pw = Math.max(1, Math.round(cssW * dpr));
  var ph = Math.max(1, Math.round(cssH * dpr));
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  zoom = Math.min(cssW, cssH) / VIEW_SHORT_PX;
  scale = zoom * dpr;
  RT.view.w = canvas.width / scale;
  RT.view.h = canvas.height / scale;
  RT.dpr = dpr; RT.cssW = cssW; RT.cssH = cssH; RT.scale = scale;
  cam.zoom = zoom;

  var cs = clamp(Math.round(scale * 2) / 2, 1, 1.5);
  if (cs !== chunkScale) { chunkScale = cs; clearChunks(); }
  invalidateBackdropCache();
}

/** screen (CSS px) -> world px */
RT.screenToWorld = function (sx, sy) {
  return { x: cam.x + (sx - cssW / 2) / zoom, y: cam.y + (sy - cssH / 2) / zoom };
};
/** world px -> screen (CSS px) */
RT.worldToScreen = function (wx, wy) {
  return { x: (wx - cam.x) * zoom + cssW / 2, y: (wy - cam.y) * zoom + cssH / 2 };
};

/** Set the canvas transform so drawing happens in world pixels. */
function worldTransform(g) {
  g.setTransform(scale, 0, 0, scale,
    Math.round(canvas.width / 2 - (cam.x + shakeX) * scale),
    Math.round(canvas.height / 2 - (cam.y + shakeY) * scale));
}
/** Set the canvas transform so drawing happens in CSS pixels. */
function screenTransform(g) { g.setTransform(dpr, 0, 0, dpr, 0, 0); }

/* ==========================================================================
 *  8. INPUT
 * ========================================================================== */

var keyDown = {};                                   // logical keyboard state
var padDown = { left: false, right: false, jump: false, action: false };
var dbgHold = { left: false, right: false, jump: false, action: false };
var dbgTap = {};                                    // name -> steps remaining

var input = RT.input = {
  left: false, right: false, up: false, down: false,
  jump: false, jumpPressed: false, jumpReleased: false,
  action: false, actionPressed: false, actionReleased: false,
  anyPressed: false,
  pointer: { x: 0, y: 0, wx: 0, wy: 0, down: false, justDown: false, justUp: false, id: -1 }
};
var prevRaw = { left: false, right: false, jump: false, action: false };
var pointerJustDown = false, pointerJustUp = false;

var KEYMAP = {
  'ArrowLeft': 'left', 'KeyA': 'left',
  'ArrowRight': 'right', 'KeyD': 'right',
  'ArrowUp': 'jump', 'KeyW': 'jump', 'Space': 'jump', 'KeyZ': 'jump', 'KeyK': 'jump',
  'ArrowDown': 'down', 'KeyS': 'down',
  'KeyE': 'action', 'KeyX': 'action', 'KeyJ': 'action', 'Enter': 'action',
  'KeyR': 'retry',
  'Escape': 'pause', 'KeyP': 'pause'
};
// legacy keyCode fallback for browsers with no event.code
var KEYCODES = {
  37: 'left', 65: 'left', 39: 'right', 68: 'right',
  38: 'jump', 87: 'jump', 32: 'jump', 90: 'jump', 75: 'jump',
  40: 'down', 83: 'down',
  69: 'action', 88: 'action', 74: 'action', 13: 'action',
  82: 'retry', 27: 'pause', 80: 'pause'
};

function logicalKey(e) {
  if (e.code && KEYMAP[e.code]) return KEYMAP[e.code];
  if (e.keyCode && KEYCODES[e.keyCode]) return KEYCODES[e.keyCode];
  return null;
}

function tapActive(name) {
  var v = dbgTap[name] | 0;
  if (v > 0) { dbgTap[name] = v - 1; return true; }
  return false;
}

/** Sample every input source once per fixed step and compute the edges. */
function pollInput() {
  var tl = tapActive('left'), tr = tapActive('right'), tj = tapActive('jump'), ta = tapActive('action');
  var l = !!(keyDown.left || padDown.left || dbgHold.left || tl);
  var r = !!(keyDown.right || padDown.right || dbgHold.right || tr);
  var j = !!(keyDown.jump || padDown.jump || dbgHold.jump || tj);
  var a = !!(keyDown.action || padDown.action || dbgHold.action || ta);

  input.left = l;
  input.right = r;
  input.up = !!keyDown.jump;
  input.down = !!keyDown.down;
  input.jump = j;
  input.jumpPressed = j && !prevRaw.jump;
  input.jumpReleased = !j && prevRaw.jump;
  input.action = a;
  input.actionPressed = a && !prevRaw.action;
  input.actionReleased = !a && prevRaw.action;
  input.anyPressed = input.jumpPressed || input.actionPressed ||
                     (l && !prevRaw.left) || (r && !prevRaw.right);

  prevRaw.left = l; prevRaw.right = r; prevRaw.jump = j; prevRaw.action = a;

  var p = input.pointer;
  p.justDown = pointerJustDown;
  p.justUp = pointerJustUp;
  pointerJustDown = false;
  pointerJustUp = false;
  var w = RT.screenToWorld(p.x, p.y);
  p.wx = w.x; p.wy = w.y;
}

function clearInputHeld() {
  keyDown = {};
  padDown.left = padDown.right = padDown.jump = padDown.action = false;
  var pads = [D.padLeft, D.padRight, D.padJump, D.padAction];
  for (var i = 0; i < pads.length; i++) if (pads[i]) pads[i].classList.remove('down');
  activePointers = {};
}

var touchSeen = false;
function markTouch() {
  if (touchSeen) return;
  touchSeen = true;
  document.body.classList.add('touch');
  applyPadVisibility();
}

var activePointers = {};    // pointerId -> pad key
var PAD_KEYS = { padLeft: 'left', padRight: 'right', padJump: 'jump', padAction: 'action' };

function padElFor(key) {
  if (key === 'left') return D.padLeft;
  if (key === 'right') return D.padRight;
  if (key === 'jump') return D.padJump;
  if (key === 'action') return D.padAction;
  return null;
}

function refreshPadState() {
  var next = { left: false, right: false, jump: false, action: false };
  for (var id in activePointers) {
    if (!Object.prototype.hasOwnProperty.call(activePointers, id)) continue;
    var k = activePointers[id];
    if (k) next[k] = true;
  }
  var keys = ['left', 'right', 'jump', 'action'];
  for (var i = 0; i < keys.length; i++) {
    var k2 = keys[i];
    if (padDown[k2] !== next[k2]) {
      padDown[k2] = next[k2];
      var el = padElFor(k2);
      if (el) { if (next[k2]) el.classList.add('down'); else el.classList.remove('down'); }
    }
  }
}

function padKeyAt(x, y) {
  var el = null;
  try { el = document.elementFromPoint(x, y); } catch (e) { el = null; }
  while (el && el !== document.body) {
    if (el.id && PAD_KEYS[el.id]) return PAD_KEYS[el.id];
    el = el.parentNode;
  }
  return null;
}

function bindInput() {
  /* ---- keyboard ---- */
  window.addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    unlockAudio();
    var k = logicalKey(e);
    if (activeMode && typeof activeMode.onKey === 'function') {
      safe('mode.onKey', activeMode.onKey, e);
    }
    if (!k) return;
    if (e.repeat) { e.preventDefault(); return; }
    if (k === 'pause') { e.preventDefault(); onPausePressed(); return; }
    if (k === 'retry') {
      e.preventDefault();
      if (gameState === 'play' && !player.dead) { killPlayer('retry'); }
      return;
    }
    keyDown[k] = true;
    e.preventDefault();
  }, false);

  window.addEventListener('keyup', function (e) {
    var k = logicalKey(e);
    if (!k) return;
    keyDown[k] = false;
    e.preventDefault();
  }, false);

  window.addEventListener('blur', function () { clearInputHeld(); }, false);
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearInputHeld(); lastStamp = 0; }
  }, false);

  /* ---- touch pads: per-pointerId tracking, sliding between pads works ---- */
  var padRoot = D.pads;
  if (padRoot) {
    padRoot.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') markTouch();
      unlockAudio();
      var k = padKeyAt(e.clientX, e.clientY);
      if (!k) return;
      activePointers[e.pointerId] = k;
      refreshPadState();
      e.preventDefault();
      e.stopPropagation();
    }, { passive: false });

    padRoot.addEventListener('pointermove', function (e) {
      if (!(e.pointerId in activePointers)) return;
      var k = padKeyAt(e.clientX, e.clientY);
      activePointers[e.pointerId] = k;
      refreshPadState();
      e.preventDefault();
    }, { passive: false });

    var release = function (e) {
      if (!(e.pointerId in activePointers)) return;
      delete activePointers[e.pointerId];
      refreshPadState();
      e.preventDefault();
    };
    padRoot.addEventListener('pointerup', release, { passive: false });
    padRoot.addEventListener('pointercancel', release, { passive: false });
    padRoot.addEventListener('lostpointercapture', release, { passive: false });
    padRoot.addEventListener('contextmenu', function (e) { e.preventDefault(); }, false);
  }

  /* ---- canvas pointer (world taps, arcade cabinets, tetris touch) ---- */
  if (canvas) {
    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'touch' || e.pointerType === 'pen') markTouch();
      unlockAudio();
      var p = input.pointer;
      p.x = e.clientX; p.y = e.clientY; p.down = true; p.id = e.pointerId;
      pointerJustDown = true;
      var w = RT.screenToWorld(p.x, p.y); p.wx = w.x; p.wy = w.y;
      if (activeMode && typeof activeMode.onPointer === 'function') {
        safe('mode.onPointer', activeMode.onPointer, 'down', p);
      }
      e.preventDefault();
    }, { passive: false });

    canvas.addEventListener('pointermove', function (e) {
      var p = input.pointer;
      if (p.down && p.id !== e.pointerId) return;
      p.x = e.clientX; p.y = e.clientY;
      var w = RT.screenToWorld(p.x, p.y); p.wx = w.x; p.wy = w.y;
      if (activeMode && typeof activeMode.onPointer === 'function') {
        safe('mode.onPointer', activeMode.onPointer, 'move', p);
      }
    }, { passive: true });

    var up = function (e) {
      var p = input.pointer;
      if (p.id !== e.pointerId && p.id !== -1) return;
      p.down = false; p.id = -1;
      pointerJustUp = true;
      if (activeMode && typeof activeMode.onPointer === 'function') {
        safe('mode.onPointer', activeMode.onPointer, 'up', p);
      }
    };
    canvas.addEventListener('pointerup', up, { passive: true });
    canvas.addEventListener('pointercancel', up, { passive: true });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); }, false);
  }

  /* ---- global: block scroll gestures, double-tap zoom and gesture zoom ---- */
  document.addEventListener('touchstart', function (e) {
    markTouch();
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  document.addEventListener('touchmove', function (e) {
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); }, false);
  document.addEventListener('dblclick', function (e) { e.preventDefault(); }, false);
  window.addEventListener('pointerdown', function () { unlockAudio(); }, true);

  /* ---- resize ---- */
  window.addEventListener('resize', resize, false);
  window.addEventListener('orientationchange', function () {
    resize();
    window.setTimeout(resize, 220);
    window.setTimeout(resize, 600);
  }, false);
  if (window.visualViewport && window.visualViewport.addEventListener) {
    window.visualViewport.addEventListener('resize', resize);
  }
}

/* ==========================================================================
 *  9. THEMES  (contract section 7)
 *
 *  theme = {
 *    sky:      [[stop, color], ...]            vertical gradient, stop 0..1
 *    parallax: [{kind, color, color2, y, speed, scale, alpha}]
 *                 y     = screen fraction where the layer's BOTTOM sits
 *                 speed = parallax factor (0 fixed .. 1 locked to camera)
 *                 scale = layer height as a fraction of the screen
 *    ambient:  'dust'|'embers'|'snow'|'fireflies'|'ash'|'bubbles'|'none'
 *    fog:      {color, alpha}
 *    tile:     {top, side, dark, rim, accent}
 *    spike:    {base, tip}
 *    vignette: 0..1
 *  }
 * ========================================================================== */

var THEMES = RT.THEMES = {

  meadow: {
    sky: [[0, '#4aa8ff'], [0.45, '#8fd4ff'], [1, '#dff4ff']],
    parallax: [
      { kind: 'clouds',    color: '#ffffff', y: 0.52, speed: 0.06, scale: 0.42, alpha: 0.85 },
      { kind: 'mountains', color: '#7fb8d8', y: 0.80, speed: 0.14, scale: 0.34 },
      { kind: 'hills',     color: '#4f9a52', color2: '#3d7d43', y: 0.96, speed: 0.30, scale: 0.30 },
      { kind: 'hills',     color: '#3c7a3f', color2: '#2f6334', y: 1.06, speed: 0.52, scale: 0.26 }
    ],
    ambient: 'dust',
    fog: { color: '#bfe6ff', alpha: 0.10 },
    tile: { top: '#5fd14e', side: '#8a5a37', dark: '#553a21', rim: '#a9f78c', accent: '#6b452a' },
    spike: { base: '#c9d4dd', tip: '#ffffff' },
    vignette: 0.24
  },

  sunset: {
    sky: [[0, '#241a53'], [0.34, '#7a3a7e'], [0.62, '#e0664f'], [0.84, '#ffa95c'], [1, '#ffd79a']],
    parallax: [
      { kind: 'clouds',    color: '#ff9fb8', y: 0.50, speed: 0.05, scale: 0.40, alpha: 0.7 },
      { kind: 'mountains', color: '#6b3f74', y: 0.82, speed: 0.13, scale: 0.36 },
      { kind: 'hills',     color: '#4a2a52', color2: '#3a1f42', y: 0.99, speed: 0.30, scale: 0.28 },
      { kind: 'hills',     color: '#2d1730', color2: '#1f0f22', y: 1.08, speed: 0.52, scale: 0.24 }
    ],
    ambient: 'fireflies',
    fog: { color: '#ff9f6a', alpha: 0.14 },
    tile: { top: '#c86a3a', side: '#6b3a2e', dark: '#3d201a', rim: '#ffb682', accent: '#8a4a30' },
    spike: { base: '#d8c0b0', tip: '#fff0e0' },
    vignette: 0.32
  },

  void: {
    sky: [[0, '#02030a'], [0.5, '#070b1c'], [1, '#0d1430']],
    parallax: [
      { kind: 'stars',  color: '#ffffff', y: 1, speed: 0.02, scale: 1 },
      { kind: 'nebula', color: '#3a2a7a', color2: '#12406b', y: 1, speed: 0.06, scale: 1, alpha: 0.55 },
      { kind: 'mountains', color: '#141a33', y: 1.04, speed: 0.20, scale: 0.30 }
    ],
    ambient: 'fireflies',
    fog: { color: '#0b1130', alpha: 0.22 },
    tile: { top: '#5a6ea8', side: '#2b3352', dark: '#151a2e', rim: '#93b0ff', accent: '#3c4874' },
    spike: { base: '#7e8cc4', tip: '#dfe8ff' },
    vignette: 0.48
  },

  ruins: {
    sky: [[0, '#2a3a30'], [0.4, '#4e6349'], [0.75, '#8aa06d'], [1, '#c3cf94']],
    parallax: [
      { kind: 'clouds', color: '#c9d9b0', y: 0.46, speed: 0.05, scale: 0.36, alpha: 0.5 },
      { kind: 'mountains', color: '#3e5142', y: 0.80, speed: 0.13, scale: 0.34 },
      { kind: 'ruins',  color: '#6a7358', color2: '#505842', y: 1.00, speed: 0.28, scale: 0.40 },
      { kind: 'ruins',  color: '#454c38', color2: '#333a2a', y: 1.10, speed: 0.50, scale: 0.32 }
    ],
    ambient: 'dust',
    fog: { color: '#88a86a', alpha: 0.18 },
    tile: { top: '#8d9c72', side: '#5c6450', dark: '#333a2c', rim: '#c6daa6', accent: '#6f7a5c' },
    spike: { base: '#9aa88a', tip: '#e2eccd' },
    vignette: 0.36
  },

  volcano: {
    sky: [[0, '#1a0506'], [0.35, '#4a0f0c'], [0.68, '#9a2a10'], [1, '#e8641c']],
    parallax: [
      { kind: 'nebula',  color: '#7a1408', color2: '#3a0604', y: 1, speed: 0.04, scale: 1, alpha: 0.45 },
      { kind: 'volcano', color: '#3a1410', color2: '#ff6a1e', y: 0.98, speed: 0.12, scale: 0.52 },
      { kind: 'mountains', color: '#2a0d0a', y: 1.04, speed: 0.30, scale: 0.30 },
      { kind: 'hills',   color: '#1c0706', color2: '#120403', y: 1.12, speed: 0.54, scale: 0.22 }
    ],
    ambient: 'embers',
    fog: { color: '#ff5a18', alpha: 0.16 },
    tile: { top: '#6b2a20', side: '#3d1a14', dark: '#1f0c09', rim: '#ff8e52', accent: '#8c3a22' },
    spike: { base: '#553030', tip: '#ffb070' },
    vignette: 0.44
  },

  factory: {
    sky: [[0, '#171c24'], [0.5, '#2c3540'], [1, '#55636f']],
    parallax: [
      { kind: 'clouds',  color: '#6a7784', y: 0.48, speed: 0.05, scale: 0.34, alpha: 0.45 },
      { kind: 'factory', color: '#2b323b', color2: '#c2952e', y: 0.96, speed: 0.16, scale: 0.48 },
      { kind: 'pipes',   color: '#3a424c', color2: '#5b6672', y: 1.08, speed: 0.36, scale: 0.42 },
      { kind: 'pipes',   color: '#242a31', color2: '#3e464f', y: 1.16, speed: 0.58, scale: 0.34 }
    ],
    ambient: 'ash',
    fog: { color: '#7c8a97', alpha: 0.14 },
    tile: { top: '#9aa3ad', side: '#4a525c', dark: '#262b32', rim: '#dce7f2', accent: '#b8912e' },
    spike: { base: '#6a737d', tip: '#e8f0f8' },
    vignette: 0.34
  },

  tycoon: {
    sky: [[0, '#2f8ef0'], [0.42, '#69bdff'], [1, '#cdeeff']],
    parallax: [
      { kind: 'clouds', color: '#ffffff', y: 0.50, speed: 0.06, scale: 0.44, alpha: 0.95 },
      { kind: 'city',   color: '#8fc0e8', color2: '#bde0f8', y: 0.86, speed: 0.16, scale: 0.34 },
      { kind: 'hills',  color: '#55c25e', color2: '#43a34c', y: 1.00, speed: 0.32, scale: 0.26 },
      { kind: 'hills',  color: '#3f9b48', color2: '#31803a', y: 1.10, speed: 0.55, scale: 0.22 }
    ],
    ambient: 'none',
    fog: { color: '#cdeeff', alpha: 0.08 },
    tile: { top: '#4fd06a', side: '#c9c9c9', dark: '#8d8d8d', rim: '#eaffea', accent: '#f2c33a' },
    spike: { base: '#c0c6cc', tip: '#ffffff' },
    vignette: 0.16
  },

  troll: {
    sky: [[0, '#ffd1ef'], [0.4, '#c9e6ff'], [0.75, '#fff4c4'], [1, '#d8ffe4']],
    parallax: [
      { kind: 'nebula', color: '#ff9ad4', color2: '#9ad4ff', y: 1, speed: 0.03, scale: 1, alpha: 0.35 },
      { kind: 'clouds', color: '#ffffff', y: 0.54, speed: 0.07, scale: 0.46, alpha: 1, face: true },
      { kind: 'hills',  color: '#8de89a', color2: '#6ed07d', y: 1.00, speed: 0.30, scale: 0.28 },
      { kind: 'hills',  color: '#66cf7c', color2: '#4fb266', y: 1.10, speed: 0.54, scale: 0.24 }
    ],
    ambient: 'fireflies',
    fog: { color: '#ffd9f2', alpha: 0.12 },
    tile: { top: '#ff9ecb', side: '#b87ad6', dark: '#7a4c96', rim: '#ffe6f6', accent: '#ffe05a' },
    spike: { base: '#ffe2f2', tip: '#ff5aa0' },
    vignette: 0.18
  },

  apocalypse: {
    sky: [[0, '#0b0508'], [0.28, '#370d12'], [0.58, '#8c2410'], [0.82, '#d9581a'], [1, '#f5a63c']],
    parallax: [
      { kind: 'nebula',  color: '#8c1c08', color2: '#2a0508', y: 1, speed: 0.03, scale: 1, alpha: 0.5 },
      { kind: 'city',    color: '#1c1216', color2: '#2a1c20', y: 0.84, speed: 0.11, scale: 0.40 },
      { kind: 'ruins',   color: '#2a1a18', color2: '#1c1010', y: 1.00, speed: 0.26, scale: 0.42 },
      { kind: 'volcano', color: '#180a0a', color2: '#ff7a24', y: 1.06, speed: 0.40, scale: 0.34 },
      { kind: 'hills',   color: '#120808', color2: '#0a0404', y: 1.14, speed: 0.60, scale: 0.20 }
    ],
    ambient: 'ash',
    fog: { color: '#ff6a24', alpha: 0.18 },
    tile: { top: '#5a4438', side: '#33251f', dark: '#19110e', rim: '#ffa066', accent: '#6e2a1a' },
    spike: { base: '#4a3a34', tip: '#ffb884' },
    vignette: 0.46
  },

  /* --- homage palettes (original art, classic colour identities) --------- */
  smb1: {
    sky: [[0, '#5c94fc'], [1, '#5c94fc']],
    parallax: [
      { kind: 'clouds', color: '#ffffff', y: 0.44, speed: 0.06, scale: 0.30, alpha: 1, blocky: true },
      { kind: 'hills',  color: '#00a844', color2: '#008030', y: 1.00, speed: 0.30, scale: 0.24, blocky: true },
      { kind: 'hills',  color: '#008030', color2: '#006020', y: 1.08, speed: 0.55, scale: 0.18, blocky: true }
    ],
    ambient: 'none',
    fog: { color: '#5c94fc', alpha: 0.05 },
    tile: { top: '#e08030', side: '#c84c0c', dark: '#7a2800', rim: '#ffb878', accent: '#000000' },
    spike: { base: '#bcbcbc', tip: '#fcfcfc' },
    vignette: 0.12
  },

  smw: {
    sky: [[0, '#1c7cf0'], [0.55, '#68b8f8'], [1, '#b8e4ff']],
    parallax: [
      { kind: 'clouds',    color: '#ffffff', y: 0.48, speed: 0.06, scale: 0.40, alpha: 0.95 },
      { kind: 'mountains', color: '#5cb0e8', y: 0.82, speed: 0.14, scale: 0.32 },
      { kind: 'hills',     color: '#38a038', color2: '#2a8030', y: 1.00, speed: 0.32, scale: 0.30 },
      { kind: 'hills',     color: '#2a8030', color2: '#1e6424', y: 1.10, speed: 0.56, scale: 0.24 }
    ],
    ambient: 'dust',
    fog: { color: '#b8e4ff', alpha: 0.08 },
    tile: { top: '#79d94f', side: '#c8a05a', dark: '#8a6634', rim: '#bdf894', accent: '#e8c888' },
    spike: { base: '#c8c8d0', tip: '#ffffff' },
    vignette: 0.18
  },

  smb3: {
    sky: [[0, '#0a1a6a'], [0.42, '#2a5ae0'], [1, '#7ab0ff']],
    parallax: [
      { kind: 'stars',     color: '#ffffff', y: 1, speed: 0.02, scale: 1, alpha: 0.5 },
      { kind: 'clouds',    color: '#e8f0ff', y: 0.44, speed: 0.06, scale: 0.34, alpha: 0.7 },
      { kind: 'castle',    color: '#2a2a58', color2: '#4a4a88', y: 0.92, speed: 0.15, scale: 0.40 },
      { kind: 'hills',     color: '#2a4a90', color2: '#1e3670', y: 1.06, speed: 0.36, scale: 0.24 }
    ],
    ambient: 'none',
    fog: { color: '#3a6ad0', alpha: 0.12 },
    tile: { top: '#f8e8b0', side: '#d8a850', dark: '#9a6c28', rim: '#fffbe0', accent: '#b88030' },
    spike: { base: '#a8a8c0', tip: '#f0f0ff' },
    vignette: 0.22
  },

  galaxy: {
    sky: [[0, '#05030f'], [0.45, '#170a33'], [1, '#2e1055']],
    parallax: [
      { kind: 'stars',  color: '#ffffff', y: 1, speed: 0.02, scale: 1 },
      { kind: 'nebula', color: '#7a2ad0', color2: '#2a6adf', y: 1, speed: 0.05, scale: 1, alpha: 0.6 },
      { kind: 'mountains', color: '#241040', y: 1.02, speed: 0.22, scale: 0.28 },
      { kind: 'hills',  color: '#170a2a', color2: '#0f0620', y: 1.12, speed: 0.48, scale: 0.20 }
    ],
    ambient: 'snow',
    fog: { color: '#3a1a6a', alpha: 0.20 },
    tile: { top: '#a86ef0', side: '#4a2a78', dark: '#27143f', rim: '#e4baff', accent: '#7a4ac0' },
    spike: { base: '#6a4ab0', tip: '#e8d0ff' },
    vignette: 0.42
  },

  sm3dw: {
    sky: [[0, '#04081e'], [0.42, '#0d1c50'], [1, '#1b3f8f']],
    parallax: [
      { kind: 'stars', color: '#ffffff', y: 1, speed: 0.02, scale: 1, alpha: 0.8 },
      { kind: 'city',  color: '#0d1636', color2: '#3df0ff', y: 0.86, speed: 0.14, scale: 0.38, neon: true },
      { kind: 'city',  color: '#08102a', color2: '#ff4fa0', y: 1.00, speed: 0.32, scale: 0.30, neon: true },
      { kind: 'pipes', color: '#0a1230', color2: '#2a5ad0', y: 1.12, speed: 0.54, scale: 0.26 }
    ],
    ambient: 'fireflies',
    fog: { color: '#1b3f8f', alpha: 0.18 },
    tile: { top: '#3ad0ff', side: '#1d3a6e', dark: '#0d1c3a', rim: '#bdf4ff', accent: '#ff4fa0' },
    spike: { base: '#2a4a80', tip: '#9ff0ff' },
    vignette: 0.40
  },

  odyssey: {
    sky: [[0, '#0a0620'], [0.4, '#22103f'], [0.8, '#4a1f63'], [1, '#6b2f74']],
    parallax: [
      { kind: 'stars',  color: '#fff0ff', y: 1, speed: 0.02, scale: 1 },
      { kind: 'nebula', color: '#6a2a9a', color2: '#2a2a7a', y: 1, speed: 0.05, scale: 1, alpha: 0.5 },
      { kind: 'castle', color: '#2a1c44', color2: '#4a3670', y: 0.90, speed: 0.14, scale: 0.42 },
      { kind: 'ruins',  color: '#23183a', color2: '#170f28', y: 1.04, speed: 0.30, scale: 0.34 },
      { kind: 'hills',  color: '#150d26', color2: '#0d0718', y: 1.14, speed: 0.55, scale: 0.20 }
    ],
    ambient: 'fireflies',
    fog: { color: '#4a2a7a', alpha: 0.20 },
    tile: { top: '#8a7ad8', side: '#3a3060', dark: '#1d1834', rim: '#d4c6ff', accent: '#5a4a96' },
    spike: { base: '#5a4a90', tip: '#ded0ff' },
    vignette: 0.40
  }
};

var DEFAULT_THEME = THEMES.meadow;

/** Accept a theme name or an inline theme object; always return a usable theme. */
function resolveTheme(t) {
  var base;
  if (!t) return DEFAULT_THEME;
  if (typeof t === 'string') {
    base = THEMES[t];
    if (!base) { return DEFAULT_THEME; }
    return base;
  }
  if (typeof t === 'object') {
    if (t.__ready) return t;
    // fill any missing field from the default so custom themes cannot crash us
    var o = {
      __ready: true,
      sky: t.sky || DEFAULT_THEME.sky,
      parallax: t.parallax || [],
      ambient: t.ambient || 'none',
      fog: t.fog || { color: '#000000', alpha: 0 },
      tile: t.tile || DEFAULT_THEME.tile,
      spike: t.spike || DEFAULT_THEME.spike,
      vignette: (t.vignette === undefined ? 0.3 : t.vignette)
    };
    var keys = ['top', 'side', 'dark', 'rim', 'accent'];
    for (var i = 0; i < keys.length; i++) {
      if (!o.tile[keys[i]]) o.tile[keys[i]] = DEFAULT_THEME.tile[keys[i]];
    }
    if (!o.spike.base) o.spike.base = DEFAULT_THEME.spike.base;
    if (!o.spike.tip) o.spike.tip = DEFAULT_THEME.spike.tip;
    return o;
  }
  return DEFAULT_THEME;
}
RT.resolveTheme = resolveTheme;

/* ==========================================================================
 * 10. THEME ART CACHES  (built once per theme, never per frame)
 * ========================================================================== */

var LW = 512, LH = 256;               // logical parallax layer canvas size

function makeCanvas(w, h) {
  var c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

/** Cached speckle noise used to texture solid tiles. */
function themeNoise(theme) {
  if (theme._noise) return theme._noise;
  var n = makeCanvas(TILE * 2, TILE * 2);
  var ng = n.getContext('2d');
  var rnd = makeRng(1337);
  ng.clearRect(0, 0, n.width, n.height);
  var i, x, y, s;
  for (i = 0; i < 420; i++) {
    x = rnd() * n.width; y = rnd() * n.height; s = 1 + rnd() * 2.2;
    ng.fillStyle = rnd() < 0.5
      ? 'rgba(255,255,255,' + (0.03 + rnd() * 0.07).toFixed(3) + ')'
      : 'rgba(0,0,0,' + (0.04 + rnd() * 0.10).toFixed(3) + ')';
    ng.fillRect(x | 0, y | 0, s, s);
  }
  for (i = 0; i < 26; i++) {
    x = rnd() * n.width; y = rnd() * n.height;
    ng.fillStyle = 'rgba(0,0,0,0.08)';
    ng.beginPath();
    ng.arc(x, y, 2 + rnd() * 4, 0, Math.PI * 2);
    ng.fill();
  }
  theme._noise = n;
  return n;
}

/** Cached sky gradient canvas, 1px wide, rebuilt when the screen height changes. */
function themeSky(theme, h) {
  if (theme._sky && theme._skyH === h) return theme._sky;
  var c = makeCanvas(1, Math.max(2, h));
  var cg = c.getContext('2d');
  var grad = cg.createLinearGradient(0, 0, 0, c.height);
  var stops = theme.sky && theme.sky.length ? theme.sky : [[0, '#101020'], [1, '#202040']];
  for (var i = 0; i < stops.length; i++) {
    var st = clamp(+stops[i][0] || 0, 0, 1);
    grad.addColorStop(st, stops[i][1] || '#000');
  }
  cg.fillStyle = grad;
  cg.fillRect(0, 0, c.width, c.height);
  theme._sky = c;
  theme._skyH = h;
  return c;
}

/* --- parallax layer painters ---------------------------------------------- */
/* Each painter draws into a LW x LH canvas whose BOTTOM edge is the anchor.
 * Every painter wraps elements across the seam so the strip tiles seamlessly. */

function wrapDraw(fn, x, halfW) {
  fn(x);
  if (x - halfW < 0) fn(x + LW);
  if (x + halfW > LW) fn(x - LW);
}

function paintMountains(g, layer, rnd) {
  var col = layer.color || '#556';
  var peaks = 7;
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-4, LH);
  var step = LW / peaks;
  var firstH = LH * (0.45 + rnd() * 0.45);
  var hs = [];
  for (var i = 0; i < peaks; i++) hs.push(i === 0 ? firstH : LH * (0.35 + rnd() * 0.55));
  for (var k = 0; k <= peaks; k++) {
    var px = k * step;
    var h = hs[k % peaks];
    g.lineTo(px - step * 0.5, LH - h * 0.28);
    g.lineTo(px, LH - h);
  }
  g.lineTo(LW + 4, LH - firstH * 0.3);
  g.lineTo(LW + 4, LH);
  g.closePath();
  g.fill();
  // snow caps + lit faces
  g.fillStyle = rgba(shade(col, 0.4), 0.85);
  for (var j = 0; j <= peaks; j++) {
    var cx = j * step, ch = hs[j % peaks];
    g.beginPath();
    g.moveTo(cx, LH - ch);
    g.lineTo(cx + ch * 0.13, LH - ch * 0.80);
    g.lineTo(cx - ch * 0.13, LH - ch * 0.80);
    g.closePath();
    g.fill();
  }
  g.fillStyle = rgba('#000000', 0.16);
  for (var m = 0; m <= peaks; m++) {
    var mx = m * step, mh = hs[m % peaks];
    g.beginPath();
    g.moveTo(mx, LH - mh);
    g.lineTo(mx + step * 0.5, LH - mh * 0.28);
    g.lineTo(mx + step * 0.5, LH);
    g.lineTo(mx, LH);
    g.closePath();
    g.fill();
  }
}

function paintHills(g, layer, rnd) {
  var c1 = layer.color || '#4a4', c2 = layer.color2 || shade(layer.color || '#4a4', -0.25);
  var n = 6;
  for (var i = 0; i < n; i++) {
    var x = (i + 0.5) * (LW / n) + (rnd() - 0.5) * 30;
    var r = LH * (0.45 + rnd() * 0.5);
    var yb = LH + LH * 0.16;
    var col = i % 2 ? c2 : c1;
    wrapDraw(function (xx) {
      g.fillStyle = col;
      g.beginPath();
      if (layer.blocky) {
        // stepped, NES-style hill
        var steps = 4, sw = r * 0.5, sh = r / steps;
        g.moveTo(xx - r, yb);
        for (var s = 0; s < steps; s++) {
          g.lineTo(xx - r + s * (r - sw) / steps, yb - s * sh);
          g.lineTo(xx - r + (s + 1) * (r - sw) / steps, yb - s * sh);
          g.lineTo(xx - r + (s + 1) * (r - sw) / steps, yb - (s + 1) * sh);
        }
        g.lineTo(xx + r - sw, yb - r);
        g.lineTo(xx + r, yb);
      } else {
        g.moveTo(xx - r, yb);
        g.bezierCurveTo(xx - r * 0.5, yb - r * 1.25, xx + r * 0.5, yb - r * 1.25, xx + r, yb);
      }
      g.closePath();
      g.fill();
      g.fillStyle = rgba('#ffffff', 0.10);
      g.beginPath();
      g.ellipse ? g.ellipse(xx - r * 0.25, yb - r * 0.62, r * 0.32, r * 0.16, -0.5, 0, Math.PI * 2)
                : g.arc(xx - r * 0.25, yb - r * 0.62, r * 0.22, 0, Math.PI * 2);
      g.fill();
    }, x, r + 4);
  }
  // grass fringe along the bottom
  g.fillStyle = rgba(shade(c1, 0.25), 0.5);
  g.fillRect(0, LH - 3, LW, 3);
}

function paintClouds(g, layer, rnd) {
  var col = layer.color || '#fff';
  var n = 7;
  for (var i = 0; i < n; i++) {
    var x = (i + 0.5) * (LW / n) + (rnd() - 0.5) * 40;
    var y = LH * (0.14 + rnd() * 0.62);
    var r = LH * (0.10 + rnd() * 0.12);
    var puffs = 3 + Math.floor(rnd() * 3);
    var seedA = rnd(), seedB = rnd();
    // fixed puff geometry so shadow, body and highlight line up exactly
    var geo = [];
    var lr0 = makeRng(Math.floor(seedA * 1e6) ^ 0x51);
    for (var q = 0; q < puffs; q++) {
      geo.push({
        ox: (q - (puffs - 1) / 2) * r * 0.95,
        oy: (lr0() - 0.5) * r * 0.35,
        pr: r * (0.66 + lr0() * 0.5)
      });
    }
    wrapDraw(function (xx) {
      var p, gp;
      function puffPath(dx, dy, scale) {
        g.beginPath();
        for (p = 0; p < geo.length; p++) {
          gp = geo[p];
          var px = xx + gp.ox + dx, py = y + gp.oy + dy, pr = gp.pr * scale;
          if (layer.blocky) { g.rect(px - pr, py - pr * 0.6, pr * 2, pr * 1.2); }
          else {
            g.moveTo(px + pr, py);          // disjoint sub-path: no connecting streaks
            g.arc(px, py, pr, 0, Math.PI * 2);
          }
        }
      }
      // soft underside: the same silhouette nudged down, so nothing squares off
      g.fillStyle = rgba('#000000', 0.075);
      puffPath(0, r * 0.22, 0.97);
      g.fill();
      g.fillStyle = col;
      puffPath(0, 0, 1);
      g.fill();
      g.fillStyle = rgba('#ffffff', 0.5);
      puffPath(0, -r * 0.14, 0.72);
      g.fill();
      if (layer.face) {
        // the troll world's smiling clouds
        g.fillStyle = '#2a2a3a';
        g.beginPath();
        g.arc(xx - r * 0.34, y - r * 0.1, r * 0.09, 0, Math.PI * 2);
        g.arc(xx + r * 0.34, y - r * 0.1, r * 0.09, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#2a2a3a';
        g.lineWidth = Math.max(1.4, r * 0.07);
        g.beginPath();
        g.arc(xx, y + r * 0.02, r * 0.36, 0.28 * Math.PI, 0.72 * Math.PI);
        g.stroke();
        g.fillStyle = rgba('#ff8ab0', 0.5 + seedB * 0.2);
        g.beginPath();
        g.arc(xx - r * 0.62, y + r * 0.16, r * 0.14, 0, Math.PI * 2);
        g.arc(xx + r * 0.62, y + r * 0.16, r * 0.14, 0, Math.PI * 2);
        g.fill();
      }
    }, x, r * (puffs + 1));
  }
}

function paintCity(g, layer, rnd) {
  var col = layer.color || '#223', lit = layer.color2 || '#8cf';
  var x = 0;
  while (x < LW + 60) {
    var w = 26 + rnd() * 54;
    var h = LH * (0.30 + rnd() * 0.66);
    var bx = x, by = LH - h;
    (function (bx, by, w, h, seed) {
      var lr = makeRng(seed);
      var draw = function (xx) {
        g.fillStyle = col;
        g.fillRect(xx, by, w, h + 6);
        g.fillStyle = rgba('#ffffff', 0.06);
        g.fillRect(xx, by, Math.min(5, w * 0.2), h);
        g.fillStyle = rgba(shade(col, 0.3), 0.6);
        g.fillRect(xx, by, w, 2);
        // windows
        var cols = Math.max(1, Math.floor(w / 9));
        var rows = Math.max(1, Math.floor(h / 13));
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < cols; c++) {
            if (lr() < (layer.neon ? 0.5 : 0.36)) {
              g.fillStyle = rgba(lit, layer.neon ? (0.45 + lr() * 0.55) : (0.25 + lr() * 0.45));
              g.fillRect(xx + 3 + c * 9, by + 5 + r * 13, 4, 6);
            }
          }
        }
        if (layer.neon && lr() < 0.55) {
          g.fillStyle = rgba(lit, 0.8);
          g.fillRect(xx + 1, by - 2, w - 2, 2);
          g.fillRect(xx + w * 0.42, by - 14, 2, 14);
          g.beginPath();
          g.arc(xx + w * 0.42 + 1, by - 15, 2.4, 0, Math.PI * 2);
          g.fill();
        }
      };
      wrapDraw(draw, bx, w + 20);
    })(bx, by, w, h, Math.floor(rnd() * 1e6) | 1);
    x += w + 5 + rnd() * 12;
  }
}

function paintRuins(g, layer, rnd) {
  var col = layer.color || '#666', col2 = layer.color2 || shade(layer.color || '#666', -0.3);
  var x = 8;
  while (x < LW + 40) {
    var kind = rnd();
    var h = LH * (0.32 + rnd() * 0.6);
    var w = 14 + rnd() * 16;
    (function (bx, w, h, kind, seed) {
      var lr = makeRng(seed);
      wrapDraw(function (xx) {
        if (kind < 0.45) {
          // broken column with fluting and a snapped top
          g.fillStyle = col;
          g.fillRect(xx, LH - h, w, h + 6);
          g.fillStyle = col2;
          for (var f = 0; f < 3; f++) g.fillRect(xx + 2 + f * (w / 3), LH - h, 1.6, h);
          g.fillStyle = shade(col, 0.18);
          g.fillRect(xx - 3, LH - h - 5, w + 6, 6);
          // snapped, uneven cap
          g.fillStyle = rgba('#000000', 0.25);
          g.beginPath();
          g.moveTo(xx - 3, LH - h - 5);
          g.lineTo(xx + w * (0.3 + lr() * 0.4), LH - h - 5 - 4 * lr());
          g.lineTo(xx + w + 3, LH - h - 5);
          g.closePath();
          g.fill();
        } else if (kind < 0.75) {
          // arch
          g.fillStyle = col;
          g.beginPath();
          g.moveTo(xx, LH + 6);
          g.lineTo(xx, LH - h);
          g.lineTo(xx + w * 2.4, LH - h);
          g.lineTo(xx + w * 2.4, LH + 6);
          g.lineTo(xx + w * 1.75, LH + 6);
          g.lineTo(xx + w * 1.75, LH - h * 0.55);
          g.arc(xx + w * 1.2, LH - h * 0.55, w * 0.55, 0, Math.PI, true);
          g.lineTo(xx + w * 0.65, LH + 6);
          g.closePath();
          g.fill();
          g.fillStyle = rgba(shade(col, 0.3), 0.4);
          g.fillRect(xx, LH - h, w * 2.4, 3);
        } else {
          // crumbling wall
          g.fillStyle = col2;
          var bricks = Math.floor(h / 11);
          for (var b = 0; b < bricks; b++) {
            var ww = w * 2 * (1 - b / (bricks * 1.3)) * (0.7 + lr() * 0.5);
            g.fillRect(xx, LH - (b + 1) * 11, Math.max(6, ww), 10);
          }
        }
      }, bx, w * 3);
    })(x, w, h, kind, Math.floor(rnd() * 1e6) | 1);
    x += w * (1.6 + rnd() * 1.8) + 10;
  }
}

function paintVolcano(g, layer, rnd) {
  var rock = layer.color || '#301', lava = layer.color2 || '#f60';
  var cx = LW * 0.5, w = LW * 0.62, h = LH * 0.92;
  g.fillStyle = rock;
  g.beginPath();
  g.moveTo(cx - w, LH + 8);
  g.lineTo(cx - w * 0.16, LH - h);
  g.lineTo(cx + w * 0.16, LH - h);
  g.lineTo(cx + w, LH + 8);
  g.closePath();
  g.fill();
  // secondary cones at the seam so the strip tiles
  g.fillStyle = shade(rock, -0.2);
  var draw2 = function (px, pw, ph) {
    g.beginPath();
    g.moveTo(px - pw, LH + 8);
    g.lineTo(px, LH - ph);
    g.lineTo(px + pw, LH + 8);
    g.closePath();
    g.fill();
  };
  draw2(0, LW * 0.24, LH * 0.5);
  draw2(LW, LW * 0.24, LH * 0.5);
  // crater glow + lava flows
  var grad = g.createLinearGradient(0, LH - h, 0, LH - h * 0.2);
  grad.addColorStop(0, rgba(lava, 0.95));
  grad.addColorStop(1, rgba(lava, 0));
  g.fillStyle = grad;
  g.fillRect(cx - w * 0.2, LH - h - 10, w * 0.4, h * 0.85);
  g.fillStyle = rgba(lava, 0.9);
  g.beginPath();
  g.moveTo(cx - w * 0.16, LH - h);
  g.lineTo(cx + w * 0.16, LH - h);
  g.lineTo(cx + w * 0.1, LH - h + 5);
  g.lineTo(cx - w * 0.1, LH - h + 5);
  g.closePath();
  g.fill();
  for (var i = 0; i < 4; i++) {
    var sx = cx + (rnd() - 0.5) * w * 0.26;
    g.strokeStyle = rgba(lava, 0.55 + rnd() * 0.35);
    g.lineWidth = 1.5 + rnd() * 2.5;
    g.beginPath();
    g.moveTo(sx, LH - h + 4);
    var yy = LH - h + 4, xx2 = sx;
    while (yy < LH) {
      yy += 12 + rnd() * 16;
      xx2 += (rnd() - 0.5) * 26;
      g.lineTo(xx2, yy);
    }
    g.stroke();
  }
  g.fillStyle = rgba('#000000', 0.22);
  g.beginPath();
  g.moveTo(cx, LH - h);
  g.lineTo(cx + w, LH + 8);
  g.lineTo(cx, LH + 8);
  g.closePath();
  g.fill();
}

function paintStars(g, layer, rnd) {
  var col = layer.color || '#fff';
  for (var i = 0; i < 260; i++) {
    var x = rnd() * LW, y = rnd() * LH;
    var r = rnd();
    var a = 0.18 + r * 0.82;
    var s = r > 0.93 ? 2.2 : (r > 0.7 ? 1.5 : 1);
    g.fillStyle = rgba(col, a);
    g.fillRect(x | 0, y | 0, s, s);
    if (r > 0.965) {
      g.fillStyle = rgba(col, a * 0.5);
      g.fillRect((x | 0) - 2, y | 0, 5, 0.8);
      g.fillRect(x | 0, (y | 0) - 2, 0.8, 5);
    }
  }
  // a couple of distant galaxies
  for (var k = 0; k < 3; k++) {
    var gx = rnd() * LW, gy = rnd() * LH * 0.8;
    var gr = 8 + rnd() * 18;
    var grad = g.createRadialGradient(gx, gy, 0, gx, gy, gr);
    grad.addColorStop(0, rgba(col, 0.28));
    grad.addColorStop(1, rgba(col, 0));
    g.fillStyle = grad;
    g.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
  }
}

function paintNebula(g, layer, rnd) {
  var c1 = layer.color || '#639', c2 = layer.color2 || '#36c';
  for (var i = 0; i < 9; i++) {
    var x = rnd() * LW, y = rnd() * LH;
    var r = LH * (0.24 + rnd() * 0.5);
    var col = i % 2 ? c2 : c1;
    wrapDraw(function (xx) {
      var grad = g.createRadialGradient(xx, y, 0, xx, y, r);
      grad.addColorStop(0, rgba(col, 0.5));
      grad.addColorStop(0.55, rgba(col, 0.2));
      grad.addColorStop(1, rgba(col, 0));
      g.fillStyle = grad;
      g.fillRect(xx - r, y - r, r * 2, r * 2);
    }, x, r);
  }
}

function paintPipes(g, layer, rnd) {
  var col = layer.color || '#345', hi = layer.color2 || '#567';
  var x = 6;
  while (x < LW + 30) {
    var w = 12 + rnd() * 22;
    var h = LH * (0.3 + rnd() * 0.68);
    (function (bx, w, h, seed) {
      var lr = makeRng(seed);
      wrapDraw(function (xx) {
        var grad = g.createLinearGradient(xx, 0, xx + w, 0);
        grad.addColorStop(0, shade(col, -0.25));
        grad.addColorStop(0.35, hi);
        grad.addColorStop(1, shade(col, -0.35));
        g.fillStyle = grad;
        g.fillRect(xx, LH - h, w, h + 6);
        // flanges
        g.fillStyle = shade(hi, 0.12);
        var flanges = Math.max(1, Math.floor(h / 40));
        for (var f = 0; f <= flanges; f++) {
          var fy = LH - h + f * (h / Math.max(1, flanges));
          g.fillRect(xx - 3, fy, w + 6, 6);
          g.fillStyle = rgba('#000000', 0.2);
          g.fillRect(xx - 3, fy + 5, w + 6, 1.5);
          g.fillStyle = shade(hi, 0.12);
        }
        // a valve wheel
        if (lr() < 0.4) {
          var vy = LH - h * (0.3 + lr() * 0.5);
          g.strokeStyle = shade(hi, 0.25);
          g.lineWidth = 2;
          g.beginPath();
          g.arc(xx + w / 2, vy, w * 0.42, 0, Math.PI * 2);
          g.stroke();
          g.beginPath();
          g.moveTo(xx + w / 2 - w * 0.42, vy);
          g.lineTo(xx + w / 2 + w * 0.42, vy);
          g.moveTo(xx + w / 2, vy - w * 0.42);
          g.lineTo(xx + w / 2, vy + w * 0.42);
          g.stroke();
        }
      }, bx, w + 12);
    })(x, w, h, Math.floor(rnd() * 1e6) | 1);
    x += w + 10 + rnd() * 26;
  }
}

function paintFactory(g, layer, rnd) {
  var col = layer.color || '#333', brass = layer.color2 || '#c92';
  // back wall
  g.fillStyle = shade(col, -0.15);
  g.fillRect(0, LH * 0.5, LW, LH * 0.5 + 6);
  var x = 0;
  while (x < LW + 50) {
    var kind = rnd();
    var w = 22 + rnd() * 44;
    var h = LH * (0.28 + rnd() * 0.6);
    (function (bx, w, h, kind, seed) {
      var lr = makeRng(seed);
      wrapDraw(function (xx) {
        if (kind < 0.34) {
          // chimney
          g.fillStyle = col;
          g.fillRect(xx, LH - h, w * 0.6, h + 6);
          g.fillStyle = brass;
          for (var b = 0; b < 3; b++) g.fillRect(xx, LH - h + 8 + b * 16, w * 0.6, 3);
          g.fillStyle = rgba('#ffffff', 0.10);
          g.beginPath();
          g.arc(xx + w * 0.3, LH - h - 12, 12 + lr() * 8, 0, Math.PI * 2);
          g.fill();
        } else if (kind < 0.62) {
          // tank
          g.fillStyle = col;
          RTroundRectPath(g, xx, LH - h, w, h + 6, Math.min(w, h) * 0.22);
          g.fill();
          g.fillStyle = rgba('#ffffff', 0.08);
          g.fillRect(xx + 4, LH - h + 4, w * 0.22, h - 8);
          g.fillStyle = brass;
          g.fillRect(xx + w * 0.2, LH - h * 0.45, w * 0.6, 4);
          g.beginPath();
          g.arc(xx + w * 0.5, LH - h * 0.72, w * 0.16, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = rgba('#000000', 0.4);
          g.beginPath();
          g.arc(xx + w * 0.5, LH - h * 0.72, w * 0.09, 0, Math.PI * 2);
          g.fill();
        } else {
          // gear tower
          g.fillStyle = col;
          g.fillRect(xx, LH - h, w, h + 6);
          var gr = Math.min(w, h) * 0.34;
          var gx = xx + w / 2, gy = LH - h * 0.6;
          g.fillStyle = brass;
          g.beginPath();
          for (var t = 0; t < 12; t++) {
            var a0 = (t / 12) * Math.PI * 2;
            var rr = (t % 2 === 0) ? gr : gr * 0.78;
            var fx = gx + Math.cos(a0) * rr, fy = gy + Math.sin(a0) * rr;
            if (t === 0) g.moveTo(fx, fy); else g.lineTo(fx, fy);
          }
          g.closePath();
          g.fill();
          g.fillStyle = shade(col, -0.3);
          g.beginPath();
          g.arc(gx, gy, gr * 0.3, 0, Math.PI * 2);
          g.fill();
          // girder truss
          g.strokeStyle = rgba(brass, 0.5);
          g.lineWidth = 2;
          g.beginPath();
          for (var s = 0; s < 4; s++) {
            g.moveTo(xx + s * (w / 4), LH - h * 0.18);
            g.lineTo(xx + (s + 1) * (w / 4), LH);
            g.moveTo(xx + (s + 1) * (w / 4), LH - h * 0.18);
            g.lineTo(xx + s * (w / 4), LH);
          }
          g.stroke();
        }
      }, bx, w + 30);
    })(x, w, h, kind, Math.floor(rnd() * 1e6) | 1);
    x += w + 8 + rnd() * 22;
  }
}

function paintCastle(g, layer, rnd) {
  var col = layer.color || '#334', hi = layer.color2 || '#556';
  var x = 0;
  while (x < LW + 60) {
    var w = 34 + rnd() * 46;
    var h = LH * (0.34 + rnd() * 0.6);
    (function (bx, w, h, seed) {
      var lr = makeRng(seed);
      wrapDraw(function (xx) {
        g.fillStyle = col;
        g.fillRect(xx, LH - h, w, h + 6);
        g.fillStyle = hi;
        g.fillRect(xx, LH - h, w, 4);
        // crenellations
        var merlons = Math.max(2, Math.floor(w / 12));
        for (var m = 0; m < merlons; m++) {
          if (m % 2 === 0) {
            g.fillStyle = col;
            g.fillRect(xx + m * (w / merlons), LH - h - 9, w / merlons, 10);
            g.fillStyle = hi;
            g.fillRect(xx + m * (w / merlons), LH - h - 9, w / merlons, 3);
          }
        }
        // windows
        var rows = Math.max(1, Math.floor(h / 30));
        for (var r = 0; r < rows; r++) {
          for (var c = 0; c < 2; c++) {
            if (lr() < 0.7) {
              var wx = xx + w * (0.28 + c * 0.42) - 3;
              var wy = LH - h + 16 + r * 30;
              g.fillStyle = rgba('#ffd27a', 0.55 + lr() * 0.4);
              g.beginPath();
              g.moveTo(wx, wy + 10);
              g.lineTo(wx, wy + 4);
              g.arc(wx + 3, wy + 4, 3, Math.PI, 0);
              g.lineTo(wx + 6, wy + 10);
              g.closePath();
              g.fill();
            }
          }
        }
        // spire
        if (lr() < 0.55) {
          g.fillStyle = shade(col, 0.16);
          g.beginPath();
          g.moveTo(xx + w * 0.5, LH - h - 34);
          g.lineTo(xx + w * 0.5 + 12, LH - h - 9);
          g.lineTo(xx + w * 0.5 - 12, LH - h - 9);
          g.closePath();
          g.fill();
          g.fillStyle = rgba('#ff6a9a', 0.85);
          g.fillRect(xx + w * 0.5, LH - h - 38, 12, 6);
          g.fillStyle = shade(col, 0.3);
          g.fillRect(xx + w * 0.5 - 1, LH - h - 40, 2, 32);
        }
      }, bx, w + 40);
    })(x, w, h, Math.floor(rnd() * 1e6) | 1);
    x += w + 6 + rnd() * 26;
  }
}

var PAINTERS = {
  mountains: paintMountains, hills: paintHills, city: paintCity, ruins: paintRuins,
  volcano: paintVolcano, clouds: paintClouds, stars: paintStars, nebula: paintNebula,
  pipes: paintPipes, factory: paintFactory, castle: paintCastle
};

/** Build (once) the offscreen strip for one parallax layer. */
function layerCanvas(theme, idx) {
  theme._layers = theme._layers || [];
  if (theme._layers[idx]) return theme._layers[idx];
  var layer = theme.parallax[idx];
  var c = makeCanvas(LW, LH);
  var cg = c.getContext('2d');
  var painter = PAINTERS[layer.kind];
  if (painter) {
    var rnd = makeRng(0x1000 + idx * 7919 + (layer.kind ? layer.kind.length * 131 : 0));
    safe('parallax:' + layer.kind, function () { painter(cg, layer, rnd); });
  } else {
    // unknown kind: a soft band so the level still looks intentional
    cg.fillStyle = rgba(layer.color || '#345', 0.8);
    cg.fillRect(0, LH * 0.55, LW, LH * 0.45);
  }
  theme._layers[idx] = c;
  return c;
}

function invalidateBackdropCache() {
  for (var k in THEMES) {
    if (Object.prototype.hasOwnProperty.call(THEMES, k)) {
      THEMES[k]._sky = null; THEMES[k]._skyH = -1;
    }
  }
  if (RT.level && RT.level.__themeObjs) {
    for (var i = 0; i < RT.level.__themeObjs.length; i++) {
      RT.level.__themeObjs[i]._sky = null;
      RT.level.__themeObjs[i]._skyH = -1;
    }
  }
}

/* ==========================================================================
 * 11. BACKGROUND RENDERER  (sky, parallax, ambient, fog, vignette)
 * ========================================================================== */

var AMBIENT_N = 76;
var ambient = [];
(function seedAmbient() {
  for (var i = 0; i < AMBIENT_N; i++) {
    ambient.push({
      bx: artRng(), by: artRng(),
      r: 0.4 + artRng() * 0.6,
      p: 0.12 + artRng() * 0.7,
      vx: (artRng() - 0.5) * 2,
      vy: artRng(),
      ph: artRng() * Math.PI * 2
    });
  }
})();

var bgAnchorY = 0;
var vigGrad = null, vigW = -1, vigH = -1, vigAmt = -1;
/* layers that stand on the ground: their base colour continues to the bottom
 * of the screen so the strip's own bottom edge is never visible as a line */
var GROUND_KINDS = {
  mountains: 1, hills: 1, city: 1, ruins: 1, volcano: 1, factory: 1, pipes: 1, castle: 1
};

/** Animation clock tied to the fixed step so __dbg.step animates the world. */
function animT() { return RT.frame * DT; }

function drawSky(g, theme, alpha) {
  var img = themeSky(theme, Math.max(2, Math.round(cssH)));
  g.globalAlpha = alpha;
  g.drawImage(img, 0, 0, 1, img.height, 0, 0, cssW, cssH);
  g.globalAlpha = 1;
}

function drawParallax(g, theme, alpha) {
  var layers = theme.parallax || [];
  for (var i = 0; i < layers.length; i++) {
    var layer = layers[i];
    var img = layerCanvas(theme, i);
    if (!img) continue;
    var sc = layer.scale === undefined ? 0.4 : layer.scale;
    var hpx = Math.max(16, cssH * sc);
    var wpx = hpx * (LW / LH);
    if (wpx < 32) wpx = 32;
    var ay = layer.y === undefined ? 1 : layer.y;
    var speed = layer.speed === undefined ? 0.2 : layer.speed;
    var ox = -cam.x * speed;
    var oy = -(cam.y - bgAnchorY) * speed * 0.35;
    var top = cssH * ay - hpx + oy;
    var firstK = Math.floor((-ox) / wpx) - 1;
    var count = Math.min(14, Math.ceil(cssW / wpx) + 3);
    g.globalAlpha = alpha * (layer.alpha === undefined ? 1 : layer.alpha);
    // fractional placement with a half-pixel overlap: rounding here would give
    // every repeat a different sub-pixel phase and show as vertical seams
    for (var k = 0; k < count; k++) {
      g.drawImage(img, ox + (firstK + k) * wpx - 0.25, top, wpx + 0.5, hpx + 0.5);
    }
    // ground layers continue below their strip so their base edge never shows
    if (GROUND_KINDS[layer.kind]) {
      var footY = top + hpx - 0.5;
      if (footY < cssH) {
        g.fillStyle = layer.color || '#000000';
        g.fillRect(0, footY, cssW, cssH - footY + 1);
      }
    }
    g.globalAlpha = 1;
  }
}

function drawFog(g, theme, alpha) {
  var fog = theme.fog;
  if (!fog || !fog.alpha) return;
  var grad = g.createLinearGradient(0, cssH * 0.18, 0, cssH);
  grad.addColorStop(0, rgba(fog.color || '#000', 0));
  grad.addColorStop(1, rgba(fog.color || '#000', fog.alpha * alpha));
  g.fillStyle = grad;
  g.fillRect(0, 0, cssW, cssH);
}

function drawAmbient(g, theme, alpha) {
  var kind = theme.ambient || 'none';
  if (kind === 'none' || alpha <= 0.02) return;
  var t = animT();
  var W = cssW + 60, H = cssH + 60;
  var i, a, x, y, r, m;

  if (kind === 'dust') {
    for (i = 0; i < 52; i++) {
      m = ambient[i];
      x = ((m.bx * W + t * (6 + m.vx * 7) - cam.x * m.p * 0.35) % W + W) % W - 30;
      y = ((m.by * H + Math.sin(t * 0.5 + m.ph) * 16 - cam.y * m.p * 0.3) % H + H) % H - 30;
      r = 0.9 + m.r * 1.7;
      g.fillStyle = 'rgba(255,252,225,' + (0.10 + m.r * 0.22) * alpha + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'embers') {
    for (i = 0; i < 58; i++) {
      m = ambient[i];
      x = ((m.bx * W + Math.sin(t * 0.8 + m.ph) * 22 - cam.x * m.p * 0.3) % W + W) % W - 30;
      y = ((m.by * H - t * (24 + m.vy * 42) - cam.y * m.p * 0.3) % H + H) % H - 30;
      r = 0.8 + m.r * 1.9;
      a = (0.28 + 0.5 * Math.abs(Math.sin(t * 3 + m.ph))) * alpha;
      g.fillStyle = 'rgba(255,' + (110 + ((m.r * 90) | 0)) + ',40,' + a.toFixed(3) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,220,150,' + (a * 0.5).toFixed(3) + ')';
      g.fillRect(x - 0.5, y - 0.5, 1, 1);
    }
  } else if (kind === 'snow') {
    for (i = 0; i < 66; i++) {
      m = ambient[i];
      x = ((m.bx * W + Math.sin(t * 0.7 + m.ph) * 26 - cam.x * m.p * 0.25) % W + W) % W - 30;
      y = ((m.by * H + t * (18 + m.vy * 34) - cam.y * m.p * 0.25) % H + H) % H - 30;
      r = 0.9 + m.r * 2;
      g.fillStyle = 'rgba(232,240,255,' + ((0.24 + m.r * 0.5) * alpha).toFixed(3) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'fireflies') {
    for (i = 0; i < 34; i++) {
      m = ambient[i];
      x = ((m.bx * W + Math.sin(t * (0.3 + m.p) + m.ph) * 44 - cam.x * m.p * 0.4) % W + W) % W - 30;
      y = ((m.by * H + Math.cos(t * (0.25 + m.p * 0.7) + m.ph * 1.7) * 34 - cam.y * m.p * 0.4) % H + H) % H - 30;
      a = Math.max(0, Math.sin(t * 2.1 + m.ph * 3)) * alpha;
      r = 1.2 + m.r * 1.6;
      g.fillStyle = 'rgba(190,255,150,' + (a * 0.85).toFixed(3) + ')';
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(120,255,110,' + (a * 0.16).toFixed(3) + ')';
      g.beginPath(); g.arc(x, y, r * 3.6, 0, Math.PI * 2); g.fill();
    }
  } else if (kind === 'ash') {
    for (i = 0; i < 62; i++) {
      m = ambient[i];
      x = ((m.bx * W + t * (10 + m.vx * 12) - cam.x * m.p * 0.3) % W + W) % W - 30;
      y = ((m.by * H + t * (12 + m.vy * 26) - cam.y * m.p * 0.3) % H + H) % H - 30;
      r = 1 + m.r * 2.4;
      a = (0.14 + m.r * 0.3) * alpha;
      g.fillStyle = 'rgba(70,64,60,' + a.toFixed(3) + ')';
      g.save();
      g.translate(x, y);
      g.rotate(t * (0.6 + m.r) + m.ph);
      g.fillRect(-r, -r * 0.45, r * 2, r * 0.9);
      g.restore();
    }
  } else if (kind === 'bubbles') {
    for (i = 0; i < 44; i++) {
      m = ambient[i];
      x = ((m.bx * W + Math.sin(t * 1.1 + m.ph) * 14 - cam.x * m.p * 0.3) % W + W) % W - 30;
      y = ((m.by * H - t * (20 + m.vy * 34) - cam.y * m.p * 0.3) % H + H) % H - 30;
      r = 1.6 + m.r * 4.2;
      g.strokeStyle = 'rgba(200,240,255,' + ((0.16 + m.r * 0.3) * alpha).toFixed(3) + ')';
      g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,' + (0.2 * alpha).toFixed(3) + ')';
      g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.26, 0, Math.PI * 2); g.fill();
    }
  }
}

function drawVignette(g, amt) {
  if (amt <= 0.01) return;
  if (!vigGrad || vigW !== cssW || vigH !== cssH || vigAmt !== amt) {
    var r = Math.sqrt(cssW * cssW + cssH * cssH) * 0.58;
    var grd = g.createRadialGradient(cssW / 2, cssH / 2, r * 0.32, cssW / 2, cssH / 2, r);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.62, 'rgba(0,0,0,' + (amt * 0.28).toFixed(3) + ')');
    grd.addColorStop(1, 'rgba(0,0,0,' + amt.toFixed(3) + ')');
    vigGrad = grd; vigW = cssW; vigH = cssH; vigAmt = amt;
  }
  g.fillStyle = vigGrad;
  g.fillRect(0, 0, cssW, cssH);
}

/* Background crossfade state. bgA is what you see, bgB fades in over it while
 * a themeZone transition is running. The TILE palette (curTheme) swaps at the
 * halfway point so a chunk rebuild happens once, hidden inside the fade. */
var bgA = DEFAULT_THEME, bgB = null, bgBlend = 0;

/** Full backdrop for the active (possibly crossfading) theme. */
function drawBackdrop(g) {
  var A = bgA || curTheme || DEFAULT_THEME;
  var B = (bgB && bgB !== A) ? bgB : null;
  var t = B ? clamp(bgBlend, 0, 1) : 0;
  drawSky(g, A, 1);
  drawParallax(g, A, 1);
  if (B) { drawSky(g, B, t); drawParallax(g, B, t); }
  drawFog(g, A, 1 - t);
  if (B) drawFog(g, B, t);
  drawAmbient(g, A, 1 - t);
  if (B) drawAmbient(g, B, t);
}

/* ==========================================================================
 * 12. MENU SCENE  (the canvas is always live behind the DOM menus)
 * ========================================================================== */

var menuTheme = null;
var menuCubes = [];
var menuClock = 0, menuLastStamp = 0;

function initMenuScene() {
  menuTheme = resolveTheme('galaxy');
  menuCubes.length = 0;
  for (var i = 0; i < 26; i++) {
    menuCubes.push({
      x: artRng(), y: artRng(),
      s: 10 + artRng() * 40,
      rot: artRng() * Math.PI * 2,
      spin: (artRng() - 0.5) * 0.6,
      vy: 6 + artRng() * 22,
      hue: artRng(),
      d: 0.3 + artRng() * 0.7
    });
  }
}

function drawMenuScene(g) {
  var now = (window.performance && window.performance.now) ? window.performance.now() : Date.now();
  if (!menuLastStamp) menuLastStamp = now;
  var d = Math.min(0.06, (now - menuLastStamp) / 1000);
  menuLastStamp = now;
  menuClock += d;

  if (!menuTheme) initMenuScene();
  var savedCamX = cam.x, savedCamY = cam.y, savedAnchor = bgAnchorY;
  cam.x = menuClock * 26;
  cam.y = Math.sin(menuClock * 0.22) * 30;
  bgAnchorY = 0;
  var savedFrame = RT.frame;
  RT.frame = Math.floor(menuClock * 60);

  screenTransform(g);
  drawSky(g, menuTheme, 1);
  drawParallax(g, menuTheme, 1);
  drawAmbient(g, menuTheme, 1);

  // drifting neon cubes
  var COLORS = ['#3df0ff', '#ff3ea5', '#ffd23f', '#5bff9b', '#a86ef0'];
  for (var i = 0; i < menuCubes.length; i++) {
    var c = menuCubes[i];
    var x = (c.x * (cssW + 120) + Math.sin(menuClock * 0.3 * c.d + i) * 40) % (cssW + 120) - 60;
    var y = ((c.y * (cssH + 120) - menuClock * c.vy) % (cssH + 120) + (cssH + 120)) % (cssH + 120) - 60;
    var col = COLORS[i % COLORS.length];
    var s = c.s * (0.5 + c.d * 0.8);
    g.save();
    g.translate(x, y);
    g.rotate(c.rot + menuClock * c.spin);
    g.globalAlpha = 0.14 + c.d * 0.26;
    g.fillStyle = col;
    RTroundRectPath(g, -s / 2, -s / 2, s, s, s * 0.22);
    g.fill();
    g.globalAlpha = 0.5 + c.d * 0.4;
    g.strokeStyle = col;
    g.lineWidth = 1.6;
    RTroundRectPath(g, -s / 2, -s / 2, s, s, s * 0.22);
    g.stroke();
    g.globalAlpha = 1;
    g.restore();
  }

  // a horizon grid, arcade style
  g.save();
  g.globalAlpha = 0.22;
  g.strokeStyle = '#3df0ff';
  g.lineWidth = 1;
  var hy = cssH * 0.74;
  g.beginPath();
  for (var k = -14; k <= 14; k++) {
    g.moveTo(cssW / 2 + k * 30, hy);
    g.lineTo(cssW / 2 + k * 260, cssH + 40);
  }
  for (var r = 0; r < 12; r++) {
    var ry = hy + Math.pow(r / 11, 2.4) * (cssH - hy + 40) + ((menuClock * 20) % 14);
    g.moveTo(0, ry);
    g.lineTo(cssW, ry);
  }
  g.stroke();
  g.restore();

  drawFog(g, menuTheme, 1);
  drawVignette(g, 0.45);

  cam.x = savedCamX; cam.y = savedCamY; bgAnchorY = savedAnchor;
  RT.frame = savedFrame;
}

/* ==========================================================================
 * 13. TILES  (storage, legend, dynamic state, chunk cache, rendering)
 * ========================================================================== */

var tiles = [];            // live grid, array of char arrays
var baseTiles = [];        // authored grid (setTile writes through to this)
var tilesW = 0, tilesH = 0;
var tileDyn = {};          // 'tx|ty' -> dynamic state
var activeDyn = [];        // dyn objects that need per-step updates
var coinTaken = {};        // 'tx|ty' -> true (coins stay collected for the run)
var onOffCooldown = 0;
var curTheme = DEFAULT_THEME;        // the palette the TILES are drawn with

var LEGEND = {
  '.': 1, ' ': 1, '#': 1, '-': 1, '^': 1, 'v': 1, '<': 1, '>': 1,
  'F': 1, 'K': 1, 'S': 1, 'C': 1, 'G': 1, 'P': 1, 'o': 1, 'L': 1,
  'X': 1, 'I': 1, 'M': 1, 'N': 1, '!': 1, 'B': 1, '~': 1
};

function getTile(tx, ty) {
  tx = tx | 0; ty = ty | 0;
  if (tx < 0 || tx >= tilesW) return '#';       // level edges are solid
  if (ty < 0 || ty >= tilesH) return '.';       // open sky, open void
  var row = tiles[ty];
  return row ? (row[tx] || '.') : '.';
}
RT.getTile = getTile;

function dynAt(tx, ty, create) {
  var k = tx + '|' + ty;
  var d = tileDyn[k];
  if (!d && create) {
    d = { tx: tx, ty: ty, state: 0, t: 0, broken: false, revealed: false, gone: false, press: 0 };
    tileDyn[k] = d;
    activeDyn.push(d);
  }
  return d;
}

/** Does this tile block movement right now? (one-way platforms excluded) */
function tileSolidAt(tx, ty) {
  var ch = getTile(tx, ty);
  if (ch === '#' || ch === 'X' || ch === 'I' || ch === 'S') return true;
  if (ch === 'B') { var b = tileDyn[tx + '|' + ty]; return !(b && b.broken); }
  if (ch === 'K') { var k = tileDyn[tx + '|' + ty]; return !(k && k.gone); }
  if (ch === 'M') return !!RT.onOff;
  if (ch === 'N') return !RT.onOff;
  return false;
}
function tileOneWayAt(tx, ty) { return getTile(tx, ty) === '-'; }

/** Blocky for bevel purposes - keeps neighbouring blocks visually continuous. */
function blockLike(tx, ty) {
  if (tx < 0 || tx >= tilesW) return true;
  if (ty < 0 || ty >= tilesH) return false;
  var ch = getTile(tx, ty);
  return ch === '#' || ch === 'X' || ch === 'F' || ch === 'K' || ch === 'B' ||
         ch === 'M' || ch === 'N';
}

RT.solidAtPx = function (x, y) {
  return tileSolidAt(Math.floor(x / TILE), Math.floor(y / TILE));
};
RT.rectHitsSolid = function (r) {
  if (!r) return false;
  var x0 = Math.floor(r.x / TILE), x1 = Math.floor((r.x + r.w - 0.001) / TILE);
  var y0 = Math.floor(r.y / TILE), y1 = Math.floor((r.y + r.h - 0.001) / TILE);
  for (var ty = y0; ty <= y1; ty++) {
    for (var tx = x0; tx <= x1; tx++) {
      if (tileSolidAt(tx, ty)) return true;
    }
  }
  return false;
};

RT.setTile = function (tx, ty, ch) {
  tx = tx | 0; ty = ty | 0;
  if (tx < 0 || ty < 0 || tx >= tilesW || ty >= tilesH) return false;
  if (typeof ch !== 'string' || !ch.length) ch = '.';
  ch = ch.charAt(0);
  if (tiles[ty][tx] === ch) return true;
  tiles[ty][tx] = ch;
  baseTiles[ty][tx] = ch;
  var k = tx + '|' + ty;
  if (tileDyn[k]) {
    var i = activeDyn.indexOf(tileDyn[k]);
    if (i >= 0) activeDyn.splice(i, 1);
    delete tileDyn[k];
  }
  delete coinTaken[k];
  invalidateTile(tx, ty);
  return true;
};

RT.toggleOnOff = function () {
  RT.onOff = !RT.onOff;
  sfx('switch');
  RT.emit('onoff', RT.onOff);
  addShake(2.2, 0.1);
  flash(RT.onOff ? '#3df0ff' : '#ff9a3a', 0.09);
  return RT.onOff;
};

/* --- chunk cache ---------------------------------------------------------- */
var chunks = {};
var chunkLRU = [];
var chunkScale = 1;
var MAX_CHUNKS = 20;

function clearChunks() { chunks = {}; chunkLRU.length = 0; }

function dropChunk(key) {
  if (!chunks[key]) return;
  delete chunks[key];
  var i = chunkLRU.indexOf(key);
  if (i >= 0) chunkLRU.splice(i, 1);
}

/** A tile changed: drop its chunk and any neighbour whose bevels depend on it. */
function invalidateTile(tx, ty) {
  var offs = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
  for (var i = 0; i < offs.length; i++) {
    var cx = Math.floor((tx + offs[i][0]) / CHUNK);
    var cy = Math.floor((ty + offs[i][1]) / CHUNK);
    dropChunk(cx + '|' + cy);
  }
}
RT.invalidateTile = invalidateTile;

/* Chunks carry a one-tile bleed of their neighbours' art. The blit then samples
 * half a pixel outside the chunk on every side, so scaled chunk edges meet with
 * no hairline seam. */
var BLEED = TILE;

function buildChunk(cx, cy) {
  var cs = chunkScale;
  var size = CHUNK * TILE;
  var c = makeCanvas((size + BLEED * 2) * cs, (size + BLEED * 2) * cs);
  var cg = c.getContext('2d');
  cg.scale(cs, cs);
  cg.translate(-cx * size + BLEED, -cy * size + BLEED);
  var x0 = cx * CHUNK, y0 = cy * CHUNK;
  var T = curTheme;
  for (var ty = y0 - 1; ty < y0 + CHUNK + 1; ty++) {
    if (ty < 0 || ty >= tilesH) continue;
    for (var tx = x0 - 1; tx < x0 + CHUNK + 1; tx++) {
      if (tx < 0 || tx >= tilesW) continue;
      drawStaticTile(cg, tiles[ty][tx], tx, ty, T);
    }
  }
  return { c: c, cs: cs };
}

function getChunk(cx, cy) {
  var key = cx + '|' + cy;
  var ch = chunks[key];
  if (!ch || ch.cs !== chunkScale) {
    ch = buildChunk(cx, cy);
    chunks[key] = ch;
    chunkLRU.push(key);
    while (chunkLRU.length > MAX_CHUNKS) {
      var old = chunkLRU.shift();
      if (old === key) { chunkLRU.push(old); break; }
      delete chunks[old];
    }
  } else {
    var i = chunkLRU.indexOf(key);
    if (i >= 0 && i !== chunkLRU.length - 1) {
      chunkLRU.splice(i, 1);
      chunkLRU.push(key);
    }
  }
  return ch;
}

/* --- static tile painting (into chunks) ---------------------------------- */

function drawBlockBody(g, x, y, tx, ty, T, opt) {
  opt = opt || {};
  var side = opt.side || T.tile.side;
  var top = opt.top || T.tile.top;
  var dark = opt.dark || T.tile.dark;
  var rim = opt.rim || T.tile.rim;
  var up = opt.up !== undefined ? opt.up : blockLike(tx, ty - 1);
  var dn = opt.dn !== undefined ? opt.dn : blockLike(tx, ty + 1);
  var lf = opt.lf !== undefined ? opt.lf : blockLike(tx - 1, ty);
  var rt = opt.rt !== undefined ? opt.rt : blockLike(tx + 1, ty);

  g.fillStyle = side;
  g.fillRect(x, y, TILE, TILE);

  if (!opt.noNoise) {
    g.globalAlpha = 0.6;
    var nz = themeNoise(T);
    g.drawImage(nz, (Math.abs(tx) % 2) * TILE, (Math.abs(ty) % 2) * TILE, TILE, TILE, x, y, TILE, TILE);
    g.globalAlpha = 1;
  }

  if (!up) {
    g.fillStyle = top;
    g.fillRect(x, y, TILE, opt.capH || 8);
    if (!opt.noRim) {
      g.fillStyle = rim;
      g.fillRect(x, y, TILE, 2);
      g.fillStyle = rgba(rim, 0.35);
      g.fillRect(x, y + 2, TILE, 1);
    } else {
      g.fillStyle = rgba('#000000', 0.22);
      g.fillRect(x, y, TILE, 3);
    }
  } else {
    g.fillStyle = rgba('#000000', 0.16);
    g.fillRect(x, y, TILE, 2);
  }
  if (!dn) {
    g.fillStyle = dark;
    g.fillRect(x, y + TILE - 5, TILE, 5);
    g.fillStyle = rgba('#000000', 0.22);
    g.fillRect(x, y + TILE - 2, TILE, 2);
  }
  if (!lf) {
    g.fillStyle = rgba(rim, opt.noRim ? 0.06 : 0.18);
    g.fillRect(x, y, 2, TILE);
    g.fillStyle = rgba('#000000', 0.10);
    g.fillRect(x + 2, y, 1, TILE);
  }
  if (!rt) {
    g.fillStyle = rgba(dark, 0.85);
    g.fillRect(x + TILE - 3, y, 3, TILE);
  }
  if (!opt.noStuds) {
    g.fillStyle = rgba(T.tile.accent, 0.35);
    g.fillRect(x + 6, y + 14, 3, 3);
    g.fillRect(x + TILE - 10, y + 21, 3, 3);
    g.fillStyle = rgba('#ffffff', 0.07);
    g.fillRect(x + 6, y + 14, 3, 1);
  }
}

function drawSpikeTile(g, ch, x, y, T) {
  var base = T.spike.base, tip = T.spike.tip;
  var spikes = 3;
  var step = TILE / spikes;
  g.save();
  g.translate(x + TILE / 2, y + TILE / 2);
  if (ch === 'v') g.rotate(Math.PI);
  else if (ch === '<') g.rotate(-Math.PI / 2);
  else if (ch === '>') g.rotate(Math.PI / 2);
  g.translate(-TILE / 2, -TILE / 2);

  // dark base plate
  g.fillStyle = rgba(shade(base, -0.55), 0.95);
  g.fillRect(0, TILE - 7, TILE, 7);
  g.fillStyle = rgba('#000000', 0.3);
  g.fillRect(0, TILE - 2, TILE, 2);

  for (var i = 0; i < spikes; i++) {
    var cx = (i + 0.5) * step;
    var grad = g.createLinearGradient(0, TILE - 6, 0, 1);
    grad.addColorStop(0, shade(base, -0.25));
    grad.addColorStop(0.65, base);
    grad.addColorStop(1, tip);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(cx - step * 0.46, TILE - 5);
    g.lineTo(cx, 1);
    g.lineTo(cx + step * 0.46, TILE - 5);
    g.closePath();
    g.fill();
    g.fillStyle = rgba('#ffffff', 0.4);
    g.beginPath();
    g.moveTo(cx - step * 0.12, TILE - 6);
    g.lineTo(cx, 2);
    g.lineTo(cx + step * 0.05, TILE - 6);
    g.closePath();
    g.fill();
    g.fillStyle = rgba('#000000', 0.28);
    g.beginPath();
    g.moveTo(cx + step * 0.12, TILE - 5);
    g.lineTo(cx, 3);
    g.lineTo(cx + step * 0.46, TILE - 5);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function drawOneWay(g, x, y, tx, ty, T) {
  var lf = getTile(tx - 1, ty) === '-';
  var rt = getTile(tx + 1, ty) === '-';
  var h = 10;
  g.fillStyle = T.tile.side;
  g.fillRect(x, y, TILE, h);
  g.fillStyle = T.tile.top;
  g.fillRect(x, y, TILE, 4);
  g.fillStyle = T.tile.rim;
  g.fillRect(x, y, TILE, 2);
  g.fillStyle = rgba(T.tile.dark, 0.9);
  g.fillRect(x, y + h - 3, TILE, 3);
  g.fillStyle = rgba('#000000', 0.22);
  g.fillRect(x, y + h, TILE, 2);
  if (!lf) { g.fillStyle = rgba(T.tile.dark, 0.9); g.fillRect(x, y, 2, h); }
  if (!rt) { g.fillStyle = rgba(T.tile.dark, 0.9); g.fillRect(x + TILE - 2, y, 2, h); }
  // bolts + support brackets
  g.fillStyle = rgba(T.tile.accent, 0.6);
  g.fillRect(x + 5, y + 5, 3, 3);
  g.fillRect(x + TILE - 8, y + 5, 3, 3);
  g.fillStyle = rgba(T.tile.dark, 0.45);
  g.fillRect(x + TILE / 2 - 1, y + h, 2, 5);
}

function drawKillBlock(g, x, y, tx, ty, T) {
  drawBlockBody(g, x, y, tx, ty, T, {
    side: '#15070f', top: '#2a0c18', dark: '#000000', rim: '#ff2a4a',
    noStuds: true, capH: 5
  });
  // jagged void cracks, seeded by position so they never shimmer
  var rnd = makeRng((tx * 73856093) ^ (ty * 19349663));
  g.strokeStyle = 'rgba(255,42,74,0.75)';
  g.lineWidth = 1.4;
  g.beginPath();
  for (var i = 0; i < 3; i++) {
    var sx = x + 4 + rnd() * (TILE - 8);
    var sy = y + 4;
    g.moveTo(sx, sy);
    for (var s = 0; s < 3; s++) {
      sx += (rnd() - 0.5) * 12;
      sy += (TILE - 8) / 3;
      g.lineTo(sx, sy);
    }
  }
  g.stroke();
  g.fillStyle = 'rgba(255,42,74,0.14)';
  g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
}

function drawStaticTile(g, ch, tx, ty, T) {
  var x = tx * TILE, y = ty * TILE;
  switch (ch) {
    case '#': drawBlockBody(g, x, y, tx, ty, T); break;
    case '-': drawOneWay(g, x, y, tx, ty, T); break;
    case 'X': drawKillBlock(g, x, y, tx, ty, T); break;
    case '^': case 'v': case '<': case '>': drawSpikeTile(g, ch, x, y, T); break;
    case 'F':
      // FAKE: same silhouette, darker top, no rim highlight - the subtle tell
      drawBlockBody(g, x, y, tx, ty, T, {
        top: shade(T.tile.top, -0.30), noRim: true, noStuds: true
      });
      break;
    case 'P':
      g.fillStyle = rgba(T.tile.rim, 0.16);
      g.fillRect(x + 4, y + TILE - 5, TILE - 8, 3);
      break;
    default: break;
  }
}

/* --- dynamic tiles (animated / stateful) --------------------------------- */

function visibleTileRange(margin) {
  margin = margin || 1;
  var vw = RT.view.w, vh = RT.view.h;
  return {
    x0: Math.max(0, Math.floor((cam.x - vw / 2) / TILE) - margin),
    x1: Math.min(tilesW - 1, Math.ceil((cam.x + vw / 2) / TILE) + margin),
    y0: Math.max(0, Math.floor((cam.y - vh / 2) / TILE) - margin),
    y1: Math.min(tilesH - 1, Math.ceil((cam.y + vh / 2) / TILE) + margin)
  };
}

function drawTileLayerStatic(g) {
  var vw = RT.view.w, vh = RT.view.h;
  var cs = CHUNK * TILE;
  var cx0 = Math.floor((cam.x - vw / 2) / cs);
  var cx1 = Math.floor((cam.x + vw / 2) / cs);
  var cy0 = Math.floor((cam.y - vh / 2) / cs);
  var cy1 = Math.floor((cam.y + vh / 2) / cs);
  var maxCx = Math.floor((tilesW - 1) / CHUNK), maxCy = Math.floor((tilesH - 1) / CHUNK);
  if (cx0 < 0) cx0 = 0; if (cy0 < 0) cy0 = 0;
  if (cx1 > maxCx) cx1 = maxCx; if (cy1 > maxCy) cy1 = maxCy;
  for (var cy = cy0; cy <= cy1; cy++) {
    for (var cx = cx0; cx <= cx1; cx++) {
      var ck = getChunk(cx, cy);
      if (!ck) continue;
      var s = ck.cs;
      var sx = (BLEED - 0.5) * s, sw = (cs + 1) * s;
      g.drawImage(ck.c, sx, sx, sw, sw, cx * cs - 0.5, cy * cs - 0.5, cs + 1, cs + 1);
    }
  }
  drawOutOfBounds(g);
}

/** Darken the empty space below the level floor so the world edge reads as depth. */
function drawOutOfBounds(g) {
  var by = tilesH * TILE;
  var bottom = cam.y + RT.view.h / 2 + 8;
  if (bottom <= by) return;
  var x0 = cam.x - RT.view.w / 2 - 8, w = RT.view.w + 16;
  var grad = g.createLinearGradient(0, by, 0, by + TILE * 5);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.5)');
  g.fillStyle = grad;
  g.fillRect(x0, by, w, bottom - by);
}

function drawLava(g, x, y, tx, ty, t) {
  var surface = getTile(tx, ty - 1) !== 'L';
  var grad = g.createLinearGradient(0, y, 0, y + TILE);
  grad.addColorStop(0, '#ffdd55');
  grad.addColorStop(0.28, '#ff8a1e');
  grad.addColorStop(1, '#a01c06');
  g.fillStyle = grad;
  g.fillRect(x, y, TILE, TILE);
  // bubbling hot spots
  var rnd = makeRng((tx * 92837111) ^ (ty * 689287499));
  for (var i = 0; i < 3; i++) {
    var bx = x + 4 + rnd() * (TILE - 8);
    var ph = rnd() * 6.283;
    var by = y + TILE - ((t * (18 + rnd() * 20) + ph * 9) % TILE);
    var br = 1.2 + rnd() * 2.2;
    g.fillStyle = 'rgba(255,240,170,0.6)';
    g.beginPath(); g.arc(bx, by, br, 0, Math.PI * 2); g.fill();
  }
  if (surface) {
    var bob = Math.sin(t * 2.2 + tx * 0.7) * 2.2;
    g.fillStyle = '#ffe98a';
    g.beginPath();
    g.moveTo(x, y + 4 + bob);
    for (var k = 0; k <= 4; k++) {
      var px = x + k * (TILE / 4);
      g.lineTo(px, y + 3 + Math.sin(t * 2.6 + (tx * 4 + k) * 0.8) * 2.6);
    }
    g.lineTo(x + TILE, y + 6 + bob);
    g.lineTo(x + TILE, y);
    g.lineTo(x, y);
    g.closePath();
    g.fill();
    g.fillStyle = 'rgba(255,255,220,0.55)';
    g.fillRect(x, y + 1 + bob * 0.5, TILE, 1.6);
  }
}

function drawWater(g, x, y, tx, ty, t) {
  var surface = getTile(tx, ty - 1) !== '~';
  g.fillStyle = 'rgba(48,140,220,0.34)';
  g.fillRect(x, y, TILE, TILE);
  g.fillStyle = 'rgba(120,220,255,0.12)';
  g.fillRect(x, y, TILE, TILE);
  if (surface) {
    g.fillStyle = 'rgba(190,245,255,0.6)';
    for (var k = 0; k < TILE; k += 2) {
      var h = 2 + Math.sin(t * 2.4 + (x + k) * 0.13) * 1.8;
      g.fillRect(x + k, y + 3 - h * 0.5, 2, 2);
    }
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(x, y + 5, TILE, 1);
  }
}

function drawCoinShape(g, cx, cy, r, t, phase) {
  var spin = Math.abs(Math.cos(t * 2.6 + phase));
  var w = Math.max(1.6, r * spin);
  g.fillStyle = '#c98a10';
  g.beginPath(); g.ellipse ? g.ellipse(cx, cy, w, r, 0, 0, Math.PI * 2) : g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffd23f';
  g.beginPath(); g.ellipse ? g.ellipse(cx, cy, w * 0.78, r * 0.82, 0, 0, Math.PI * 2) : g.arc(cx, cy, r * 0.8, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath(); g.ellipse ? g.ellipse(cx - w * 0.28, cy - r * 0.26, w * 0.22, r * 0.3, 0, 0, Math.PI * 2) : g.arc(cx - r * 0.3, cy - r * 0.3, r * 0.2, 0, Math.PI * 2); g.fill();
  if (spin > 0.86) {
    g.fillStyle = 'rgba(255,255,220,0.8)';
    g.fillRect(cx - 1, cy - r - 4, 2, 3);
    g.fillRect(cx - 1, cy + r + 1, 2, 3);
    g.fillRect(cx - r - 4, cy - 1, 3, 2);
    g.fillRect(cx + r + 1, cy - 1, 3, 2);
  }
}

function drawCheckpointTile(g, x, y, tx, ty, t, active) {
  var poleX = x + 7;
  g.fillStyle = '#6a7280';
  g.fillRect(poleX, y - TILE + 2, 3, TILE * 2 - 4);
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.fillRect(poleX, y - TILE + 2, 1, TILE * 2 - 4);
  g.fillStyle = '#3a4050';
  g.fillRect(poleX - 4, y + TILE - 6, 11, 5);
  var col = active ? '#5bff9b' : '#ff5b8a';
  var col2 = active ? '#1fbf6a' : '#c22a58';
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(poleX + 3, y - TILE + 5);
  for (var i = 0; i <= 6; i++) {
    var fx = poleX + 3 + i * 3.2;
    var fy = y - TILE + 5 + Math.sin(t * 5 + i * 0.85) * 1.9;
    g.lineTo(fx, fy);
  }
  for (var j = 6; j >= 0; j--) {
    var bx = poleX + 3 + j * 3.2;
    var by = y - TILE + 18 + Math.sin(t * 5 + j * 0.85 + 0.4) * 1.9;
    g.lineTo(bx, by);
  }
  g.closePath();
  g.fill();
  g.fillStyle = rgba(col2, 0.55);
  g.beginPath();
  g.moveTo(poleX + 3, y - TILE + 12);
  g.lineTo(poleX + 22, y - TILE + 11);
  g.lineTo(poleX + 22, y - TILE + 18);
  g.lineTo(poleX + 3, y - TILE + 18);
  g.closePath();
  g.fill();
  if (active) {
    var pr = 8 + Math.sin(t * 3) * 3;
    g.fillStyle = 'rgba(91,255,155,0.12)';
    g.beginPath(); g.arc(poleX + 2, y + TILE / 2, pr, 0, Math.PI * 2); g.fill();
  }
}

function drawGoalTile(g, x, y, tx, ty, t) {
  var isTop = getTile(tx, ty - 1) !== 'G';
  var isBottom = getTile(tx, ty + 1) !== 'G';
  // light beam
  var grad = g.createLinearGradient(0, y - TILE * 3, 0, y + TILE);
  grad.addColorStop(0, 'rgba(255,240,150,0)');
  grad.addColorStop(1, 'rgba(255,240,150,' + (0.18 + Math.sin(t * 2) * 0.05).toFixed(3) + ')');
  g.fillStyle = grad;
  g.fillRect(x - 5, y - TILE * 3, TILE + 10, TILE + 4);
  // frame
  g.fillStyle = '#2a2038';
  g.fillRect(x + 1, y, TILE - 2, TILE);
  g.fillStyle = '#4a3a62';
  g.fillRect(x + 3, y, TILE - 6, TILE);
  var pulse = 0.55 + Math.sin(t * 3.2) * 0.22;
  var dg = g.createLinearGradient(x, y, x + TILE, y + TILE);
  dg.addColorStop(0, rgba('#8affd6', pulse));
  dg.addColorStop(0.5, rgba('#3df0ff', pulse));
  dg.addColorStop(1, rgba('#b06aff', pulse));
  g.fillStyle = dg;
  g.fillRect(x + 5, y + (isTop ? 4 : 0), TILE - 10, TILE - (isTop ? 4 : 0) - (isBottom ? 3 : 0));
  // swirling portal rings
  for (var i = 0; i < 3; i++) {
    var rr = ((t * 22 + i * 9) % 16) + 2;
    g.strokeStyle = 'rgba(255,255,255,' + (0.4 * (1 - rr / 18)).toFixed(3) + ')';
    g.lineWidth = 1.4;
    g.beginPath();
    g.arc(x + TILE / 2, y + TILE / 2, rr, 0, Math.PI * 2);
    g.stroke();
  }
  if (isTop) {
    g.fillStyle = '#ffd23f';
    g.fillRect(x - 1, y - 4, TILE + 2, 5);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(x - 1, y - 4, TILE + 2, 1.6);
  }
  if (isBottom) {
    g.fillStyle = '#1a1424';
    g.fillRect(x, y + TILE - 3, TILE, 3);
  }
}

function drawSpringTile(g, x, y, t, press) {
  var squash = press;                       // 0 = extended, 1 = fully compressed
  var topY = y + 8 + squash * 12;
  g.fillStyle = '#3a4250';
  g.fillRect(x + 3, y + TILE - 5, TILE - 6, 5);
  var coils = 3;
  for (var i = 0; i < coils; i++) {
    var cy = y + TILE - 7 - i * ((y + TILE - 7 - topY) / coils);
    g.fillStyle = i % 2 ? '#98a2b0' : '#c0c8d4';
    g.fillRect(x + 6, cy - 2.5, TILE - 12, 3);
  }
  g.fillStyle = '#ff6a3a';
  RTroundRectPath(g, x + 2, topY - 6, TILE - 4, 7, 3);
  g.fill();
  g.fillStyle = '#ffb08a';
  g.fillRect(x + 4, topY - 6, TILE - 8, 2);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(x + 2, topY - 1, TILE - 4, 2);
}

function drawOnOffTile(g, x, y, tx, ty, T, solid, isM, t) {
  var col = isM ? '#3df0ff' : '#ff9a3a';
  if (solid) {
    drawBlockBody(g, x, y, tx, ty, T, {
      side: mixColor(T.tile.side, col, 0.32),
      top: mixColor(T.tile.top, col, 0.5),
      rim: col, noStuds: true
    });
    g.fillStyle = rgba(col, 0.9);
    if (isM) g.fillRect(x + 12, y + 12, 8, 8);
    else { g.beginPath(); g.arc(x + TILE / 2, y + TILE / 2, 4.4, 0, Math.PI * 2); g.fill(); }
  } else {
    g.strokeStyle = rgba(col, 0.42);
    g.lineWidth = 1.4;
    g.setLineDash([4, 3]);
    g.strokeRect(x + 2, y + 2, TILE - 4, TILE - 4);
    g.setLineDash([]);
    g.fillStyle = rgba(col, 0.10);
    g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
    g.fillStyle = rgba(col, 0.32);
    if (isM) g.fillRect(x + 13, y + 13, 6, 6);
    else { g.beginPath(); g.arc(x + TILE / 2, y + TILE / 2, 3.2, 0, Math.PI * 2); g.fill(); }
  }
}

function drawSwitchTile(g, x, y, t, cool) {
  var on = !!RT.onOff;
  g.fillStyle = '#2a2f3a';
  RTroundRectPath(g, x + 4, y + 10, TILE - 8, TILE - 12, 4);
  g.fill();
  g.fillStyle = '#151922';
  g.fillRect(x + 6, y + 12, TILE - 12, TILE - 16);
  var col = on ? '#3df0ff' : '#ff9a3a';
  var lever = on ? -1 : 1;
  g.strokeStyle = '#c8d2e0';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(x + TILE / 2, y + TILE - 6);
  g.lineTo(x + TILE / 2 + lever * 7, y + 10);
  g.stroke();
  g.fillStyle = col;
  g.beginPath();
  g.arc(x + TILE / 2 + lever * 7, y + 9, 4.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = rgba(col, 0.25 + (cool > 0 ? 0 : 0.2 + Math.sin(t * 5) * 0.12));
  g.beginPath();
  g.arc(x + TILE / 2 + lever * 7, y + 9, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = rgba(col, 0.8);
  g.fillRect(x + 7, y + TILE - 5, TILE - 14, 2);
}

function drawBreakableTile(g, x, y, tx, ty, T) {
  drawBlockBody(g, x, y, tx, ty, T, {
    side: mixColor(T.tile.side, T.tile.accent, 0.4),
    top: mixColor(T.tile.top, T.tile.accent, 0.3),
    noStuds: true
  });
  g.strokeStyle = rgba('#000000', 0.35);
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x + 6, y + 6); g.lineTo(x + 14, y + 15); g.lineTo(x + 9, y + 24);
  g.moveTo(x + 22, y + 5); g.lineTo(x + 18, y + 16); g.lineTo(x + 26, y + 26);
  g.stroke();
  g.fillStyle = rgba('#ffffff', 0.12);
  g.fillRect(x + 3, y + 3, TILE - 6, 1.4);
}

function drawCrumbleTile(g, x, y, tx, ty, T, d, t) {
  var shake = 0, alpha = 1;
  if (d) {
    if (d.state === 1) shake = Math.sin(t * 60) * 1.8 * (1 - d.t / 0.35);
    if (d.state === 2) return;              // gone
  }
  g.save();
  g.translate(shake, 0);
  drawBlockBody(g, x, y, tx, ty, T, {
    side: mixColor(T.tile.side, '#8a6a3a', 0.45),
    top: mixColor(T.tile.top, '#c0a070', 0.45),
    rim: '#e8d0a0', noStuds: true, capH: 6
  });
  g.strokeStyle = 'rgba(40,24,10,0.5)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y + 12); g.lineTo(x + TILE, y + 13);
  g.moveTo(x, y + 22); g.lineTo(x + TILE, y + 21);
  g.moveTo(x + 11, y + 8); g.lineTo(x + 12, y + TILE);
  g.stroke();
  if (d && d.state === 1) {
    g.fillStyle = 'rgba(255,90,60,' + (0.12 + Math.sin(t * 40) * 0.12).toFixed(3) + ')';
    g.fillRect(x, y, TILE, TILE);
  }
  g.restore();
}

function drawFakeFlicker(g, x, y, t, tx, ty) {
  // faint 2.5 s flicker: the honest tell for an honest game
  var ph = (t + tx * 0.31 + ty * 0.17) % 2.5;
  if (ph > 0.22) return;
  var a = Math.sin((ph / 0.22) * Math.PI) * 0.16;
  g.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
  g.fillRect(x, y, TILE, TILE);
}

function drawInvisibleTile(g, x, y, tx, ty, T, revealed, t) {
  if (!revealed) return;
  drawBlockBody(g, x, y, tx, ty, T, {
    side: rgba(T.tile.side, 0.5), top: rgba(T.tile.top, 0.55),
    rim: rgba(T.tile.rim, 0.6), noStuds: true, noNoise: true
  });
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 1;
  g.setLineDash([3, 3]);
  g.strokeRect(x + 1.5, y + 1.5, TILE - 3, TILE - 3);
  g.setLineDash([]);
  g.fillStyle = 'rgba(255,255,255,0.10)';
  g.fillRect(x + 2, y + 2, TILE - 4, TILE - 4);
}

function drawSpikeGleam(g, ch, x, y, t, tx) {
  var ph = (t * 0.6 + tx * 0.23) % 3;
  if (ph > 0.5) return;
  var k = ph / 0.5;
  var a = Math.sin(k * Math.PI) * 0.5;
  g.save();
  g.globalAlpha = a;
  g.fillStyle = '#ffffff';
  var gx = x + k * TILE;
  if (ch === '^') { g.fillRect(gx - 1, y + 2, 2.2, 8); }
  else if (ch === 'v') { g.fillRect(gx - 1, y + TILE - 10, 2.2, 8); }
  else if (ch === '<') { g.fillRect(x + 2, y + k * TILE - 1, 8, 2.2); }
  else { g.fillRect(x + TILE - 10, y + k * TILE - 1, 8, 2.2); }
  g.restore();
}

/** One pass over the visible tiles for everything animated or stateful. */
function drawTileLayerDynamic(g) {
  var r = visibleTileRange(1);
  var t = animT();
  var T = curTheme;
  var cpx = checkpoint ? checkpoint.tx : -999, cpy = checkpoint ? checkpoint.ty : -999;
  for (var ty = r.y0; ty <= r.y1; ty++) {
    var row = tiles[ty];
    if (!row) continue;
    for (var tx = r.x0; tx <= r.x1; tx++) {
      var ch = row[tx];
      if (!ch || ch === '.' || ch === ' ' || ch === '#' || ch === '-' || ch === 'X' || ch === 'P') continue;
      var x = tx * TILE, y = ty * TILE;
      var d = tileDyn[tx + '|' + ty];
      switch (ch) {
        case 'L': drawLava(g, x, y, tx, ty, t); break;
        case '~': drawWater(g, x, y, tx, ty, t); break;
        case 'o':
          if (!coinTaken[tx + '|' + ty]) {
            drawCoinShape(g, x + TILE / 2, y + TILE / 2 + Math.sin(t * 2.4 + tx * 0.6) * 2, 8, t, tx * 0.7 + ty * 0.4);
          }
          break;
        case 'C': drawCheckpointTile(g, x, y, tx, ty, t, tx === cpx && ty === cpy); break;
        case 'G': drawGoalTile(g, x, y, tx, ty, t); break;
        case 'S': drawSpringTile(g, x, y, t, d ? d.press : 0); break;
        case 'M': drawOnOffTile(g, x, y, tx, ty, T, !!RT.onOff, true, t); break;
        case 'N': drawOnOffTile(g, x, y, tx, ty, T, !RT.onOff, false, t); break;
        case '!': drawSwitchTile(g, x, y, t, onOffCooldown); break;
        case 'B': if (!(d && d.broken)) drawBreakableTile(g, x, y, tx, ty, T); break;
        case 'K': drawCrumbleTile(g, x, y, tx, ty, T, d, t); break;
        case 'I': drawInvisibleTile(g, x, y, tx, ty, T, !!(d && d.revealed), t); break;
        case 'F': drawFakeFlicker(g, x, y, t, tx, ty); break;
        case '^': case 'v': case '<': case '>': drawSpikeGleam(g, ch, x, y, t, tx); break;
        default: break;
      }
    }
  }
}

/** Per-step tile logic: crumble timers, spring release, switch cooldown. */
function updateTiles(dt) {
  if (onOffCooldown > 0) onOffCooldown -= dt;
  for (var i = activeDyn.length - 1; i >= 0; i--) {
    var d = activeDyn[i];
    var ch = getTile(d.tx, d.ty);
    if (d.press > 0) d.press = Math.max(0, d.press - dt * 6);
    if (ch === 'K') {
      if (d.state === 1) {
        d.t += dt;
        if (d.t >= 0.35) {
          d.state = 2; d.t = 0; d.gone = true;
          sfx('crumble');
          burst(d.tx * TILE + TILE / 2, d.ty * TILE + TILE / 2, {
            n: 12, color: '#c0a070', speed: 90, spread: Math.PI * 2, life: 0.7, size: 3, gravity: 900
          });
        }
      } else if (d.state === 2) {
        d.t += dt;
        if (d.t >= 2.5) { d.state = 0; d.t = 0; d.gone = false; }
      }
    }
    if (d.state === 0 && !d.broken && !d.revealed && d.press <= 0 && ch !== 'K') {
      activeDyn.splice(i, 1);
      delete tileDyn[d.tx + '|' + d.ty];
    }
  }
}

function resetTileDynamics() {
  tileDyn = {};
  activeDyn.length = 0;
  onOffCooldown = 0;
}

/* ==========================================================================
 * 14. DRAW HELPERS
 * ========================================================================== */

function RTroundRectPath(g, x, y, w, h, r) {
  if (w < 0) { x += w; w = -w; }
  if (h < 0) { y += h; h = -h; }
  r = Math.max(0, Math.min(r === undefined ? 4 : r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.arcTo(x + w, y, x + w, y + r, r);
  g.lineTo(x + w, y + h - r);
  g.arcTo(x + w, y + h, x + w - r, y + h, r);
  g.lineTo(x + r, y + h);
  g.arcTo(x, y + h, x, y + h - r, r);
  g.lineTo(x, y + r);
  g.arcTo(x, y, x + r, y, r);
  g.closePath();
}
RT.roundRect = function (g, x, y, w, h, r) { RTroundRectPath(g, x, y, w, h, r); };

var FONT_STACK = '"Trebuchet MS","Segoe UI",Roboto,system-ui,-apple-system,sans-serif';

/**
 * RT.drawText(g, text, x, y, {size, color, align, baseline, weight, font,
 *                             stroke, strokeWidth, alpha, shadow, shadowColor})
 */
function drawTextImpl(g, text, x, y, o) {
  o = o || {};
  var size = o.size || 14;
  g.save();
  g.font = (o.weight || '900') + ' ' + size + 'px ' + (o.font || FONT_STACK);
  g.textAlign = o.align || 'center';
  g.textBaseline = o.baseline || 'middle';
  if (o.alpha !== undefined) g.globalAlpha = o.alpha;
  var str = String(text);
  if (o.shadow) {
    g.fillStyle = o.shadowColor || 'rgba(0,0,0,0.55)';
    g.fillText(str, x + (o.shadow === true ? 2 : o.shadow), y + (o.shadow === true ? 2 : o.shadow));
  }
  if (o.stroke) {
    g.lineJoin = 'round';
    g.lineWidth = o.strokeWidth || Math.max(2, size * 0.2);
    g.strokeStyle = o.stroke;
    g.strokeText(str, x, y);
  }
  g.fillStyle = o.color || '#ffffff';
  g.fillText(str, x, y);
  g.restore();
}
RT.drawText = drawTextImpl;

/* ==========================================================================
 * 15. PARTICLES  (hard cap 600, no shadowBlur anywhere)
 * ========================================================================== */

var parts = [];
var partHead = 0;
var fxRng = makeRng(0xBEEF);

function newParticle() {
  var p;
  if (parts.length < MAX_PARTICLES) {
    p = {
      on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 3, col: '#fff',
      grav: 0, drag: 0, kind: 'rect', rot: 0, vrot: 0, a0: 1, shrink: 1, glow: 0, text: null
    };
    parts.push(p);
    return p;
  }
  // pool is full: steal the particle with the least life left
  var best = null, bestLife = Infinity;
  for (var i = 0; i < parts.length; i++) {
    var q = parts[i];
    if (!q.on) return q;
    if (q.life < bestLife) { bestLife = q.life; best = q; }
  }
  return best || parts[0];
}

function burst(x, y, o) {
  o = o || {};
  var n = Math.max(0, Math.min(o.n === undefined ? 10 : o.n, 90));
  var speed = o.speed === undefined ? 120 : o.speed;
  var spread = o.spread === undefined ? Math.PI * 2 : o.spread;
  var angle = o.angle === undefined ? -Math.PI / 2 : o.angle;
  var life = o.life === undefined ? 0.6 : o.life;
  var size = o.size === undefined ? 3 : o.size;
  var colors = o.colors || (o.color ? [o.color] : ['#ffffff']);
  for (var i = 0; i < n; i++) {
    var p = newParticle();
    var a = angle + (fxRng() - 0.5) * spread;
    var sp = speed * (0.35 + fxRng() * 0.85);
    p.on = true;
    p.x = x + (o.spreadX ? (fxRng() - 0.5) * o.spreadX : 0);
    p.y = y + (o.spreadY ? (fxRng() - 0.5) * o.spreadY : 0);
    p.vx = Math.cos(a) * sp + (o.vx || 0);
    p.vy = Math.sin(a) * sp + (o.vy || 0);
    p.max = p.life = life * (0.6 + fxRng() * 0.75);
    p.size = size * (0.6 + fxRng() * 0.9);
    p.col = colors[(fxRng() * colors.length) | 0];
    p.grav = o.gravity === undefined ? 420 : o.gravity;
    p.drag = o.drag === undefined ? 0.6 : o.drag;
    p.kind = o.kind || 'rect';
    p.rot = fxRng() * 6.283;
    p.vrot = (fxRng() - 0.5) * 14;
    p.a0 = o.alpha === undefined ? 1 : o.alpha;
    p.shrink = o.shrink === undefined ? 1 : o.shrink;
    p.glow = o.glow ? 1 : 0;
    p.text = null;
  }
}

function ring(x, y, color, r0, r1, life) {
  var p = newParticle();
  p.on = true; p.x = x; p.y = y; p.vx = 0; p.vy = 0;
  p.max = p.life = life || 0.4;
  p.size = r0 || 6; p.col = color || '#fff';
  p.grav = 0; p.drag = 0; p.kind = 'ring';
  p.rot = r1 || 48; p.vrot = 0; p.a0 = 1; p.shrink = 1; p.glow = 0; p.text = null;
}

function floatText(x, y, text, color, life) {
  var p = newParticle();
  p.on = true; p.x = x; p.y = y; p.vx = 0; p.vy = -48;
  p.max = p.life = life || 0.9;
  p.size = 13; p.col = color || '#fff';
  p.grav = 60; p.drag = 0.9; p.kind = 'text';
  p.rot = 0; p.vrot = 0; p.a0 = 1; p.shrink = 1; p.glow = 0; p.text = String(text);
}

var PARTICLE_KINDS = {
  dust:   { n: 6,  color: '#e8e0d0', speed: 70,  life: 0.35, size: 3,   gravity: 120, angle: -Math.PI / 2, spread: 2.2 },
  land:   { n: 9,  color: '#ffffff', speed: 130, life: 0.32, size: 3.4, gravity: 260, angle: -Math.PI / 2, spread: 2.6, alpha: 0.75 },
  jump:   { n: 7,  color: '#cfe8ff', speed: 110, life: 0.3,  size: 3,   gravity: 300, angle: Math.PI / 2, spread: 1.6, alpha: 0.7 },
  turn:   { n: 5,  color: '#ffffff', speed: 90,  life: 0.28, size: 2.6, gravity: 200, angle: -Math.PI / 2, spread: 1.4, alpha: 0.6 },
  coin:   { n: 12, colors: ['#ffd23f', '#fff3b0', '#ffae2b'], speed: 150, life: 0.5, size: 3, gravity: 500, kind: 'circle' },
  cash:   { n: 10, colors: ['#5bff9b', '#c0ffd8'], speed: 140, life: 0.55, size: 3, gravity: 480, kind: 'rect' },
  death:  { n: 42, colors: ['#ff4b6e', '#ff9a3a', '#ffffff', '#ff2a4a'], speed: 300, life: 0.85, size: 4, gravity: 700 },
  spark:  { n: 10, colors: ['#ffffff', '#ffe9a0'], speed: 220, life: 0.32, size: 2.4, gravity: 200, kind: 'spark' },
  smoke:  { n: 8,  colors: ['#7a7a82', '#54545c'], speed: 50, life: 0.9, size: 6, gravity: -40, drag: 1.4, alpha: 0.4, kind: 'circle' },
  fire:   { n: 10, colors: ['#ffca3a', '#ff7a1e', '#ff3a1e'], speed: 120, life: 0.5, size: 4, gravity: -120, kind: 'circle' },
  shard:  { n: 14, colors: ['#c8d2e0', '#8f9aad'], speed: 200, life: 0.7, size: 4, gravity: 900, kind: 'shard' },
  splash: { n: 12, colors: ['#8fdcff', '#ffffff'], speed: 170, life: 0.5, size: 3, gravity: 620, kind: 'circle' },
  star:   { n: 12, colors: ['#ffd23f', '#3df0ff', '#ff3ea5'], speed: 200, life: 0.8, size: 4, gravity: 260, kind: 'spark' },
  heal:   { n: 10, colors: ['#5bff9b', '#ffffff'], speed: 110, life: 0.7, size: 3, gravity: -160, kind: 'circle' },
  build:  { n: 10, colors: ['#3df0ff', '#ffffff'], speed: 120, life: 0.5, size: 3, gravity: 200 },
  troll:  { n: 16, colors: ['#ff3ea5', '#ffd23f', '#3df0ff', '#5bff9b'], speed: 240, life: 0.9, size: 4, gravity: 480 }
};

RT.particles = {
  burst: burst,
  ring: ring,
  text: floatText,
  emit: function (x, y, kind) {
    var k = PARTICLE_KINDS[kind];
    if (!k) { burst(x, y, { n: 6, color: '#ffffff', speed: 100, life: 0.4 }); return; }
    burst(x, y, k);
  },
  clear: function () { for (var i = 0; i < parts.length; i++) parts[i].on = false; },
  count: function () { var c = 0; for (var i = 0; i < parts.length; i++) if (parts[i].on) c++; return c; }
};

function updateParticles(dt) {
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p.on) continue;
    p.life -= dt;
    if (p.life <= 0) { p.on = false; continue; }
    p.vy += p.grav * dt;
    if (p.drag) {
      var f = Math.max(0, 1 - p.drag * dt);
      p.vx *= f; p.vy *= f;
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vrot * dt;
  }
}

function drawParticles(g) {
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p.on) continue;
    var k = p.life / p.max;
    var a = clamp(k * p.a0, 0, 1);
    var s = p.size * (p.shrink ? (0.3 + k * 0.7) : 1);
    g.globalAlpha = a;
    if (p.kind === 'ring') {
      var rr = lerp(p.size, p.rot, 1 - k);
      g.strokeStyle = p.col;
      g.lineWidth = Math.max(1, 4 * k);
      g.beginPath();
      g.arc(p.x, p.y, rr, 0, Math.PI * 2);
      g.stroke();
    } else if (p.kind === 'circle') {
      g.fillStyle = p.col;
      g.beginPath();
      g.arc(p.x, p.y, Math.max(0.4, s), 0, Math.PI * 2);
      g.fill();
    } else if (p.kind === 'spark') {
      g.strokeStyle = p.col;
      g.lineWidth = Math.max(1, s * 0.6);
      g.beginPath();
      g.moveTo(p.x, p.y);
      g.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
      g.stroke();
    } else if (p.kind === 'shard') {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.col;
      g.beginPath();
      g.moveTo(-s, s * 0.6);
      g.lineTo(0, -s);
      g.lineTo(s, s * 0.7);
      g.closePath();
      g.fill();
      g.restore();
    } else if (p.kind === 'text') {
      drawTextImpl(g, p.text, p.x, p.y, { size: p.size, color: p.col, stroke: 'rgba(0,0,0,0.65)', strokeWidth: 3, alpha: a });
    } else {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.fillStyle = p.col;
      g.fillRect(-s / 2, -s / 2, s, s);
      g.restore();
    }
  }
  g.globalAlpha = 1;
}

/* ==========================================================================
 * 16. SCREEN FX  (flash, hitstop, slowmo, shake)
 * ========================================================================== */

var flashColor = '#ffffff', flashT = 0, flashDur = 0;
var hitstop = 0;
var slowmoFactor = 1, slowmoT = 0;

function flash(color, dur) {
  flashColor = color || '#ffffff';
  flashDur = dur || 0.12;
  flashT = flashDur;
}
RT.flash = flash;
RT.hitstop = function (frames) { hitstop = Math.max(hitstop, Math.max(0, frames | 0)); };
RT.slowmo = function (factor, dur) {
  slowmoFactor = clamp(+factor || 1, 0.05, 1);
  slowmoT = Math.max(0, +dur || 0);
};

function updateFx(dt) {
  if (flashT > 0) flashT -= dt;
  if (slowmoT > 0) { slowmoT -= dt; if (slowmoT <= 0) slowmoFactor = 1; }
  if (shakeTime > 0) {
    shakeTime -= dt;
    var k = shakeDur > 0 ? clamp(shakeTime / shakeDur, 0, 1) : 0;
    var amp = shakePower * k * k;
    shakeX = (fxRng() - 0.5) * 2 * amp;
    shakeY = (fxRng() - 0.5) * 2 * amp;
    if (shakeTime <= 0) { shakeX = shakeY = 0; shakePower = 0; shakeDur = 0; }
  } else { shakeX = shakeY = 0; }
}

function drawFlash(g) {
  if (flashT <= 0) return;
  var a = clamp(flashT / Math.max(0.0001, flashDur), 0, 1);
  g.fillStyle = rgba(flashColor, a * 0.7);
  g.fillRect(0, 0, cssW, cssH);
}

/* ==========================================================================
 * 17. CAMERA
 * ========================================================================== */

var camLockY = false;

function levelPixelW() { return tilesW * TILE; }
function levelPixelH() { return tilesH * TILE; }

function snapCamera() {
  var t = cameraTarget();
  cam.x = t.x; cam.y = t.y;
  clampCamera();
  camInit = true;
}

function cameraTarget() {
  var p = player;
  var look = p.facing * 2 * TILE * (Math.abs(p.vx) > 40 ? 1 : 0.45);
  var tx = p.x + p.w / 2 + look;
  var ty = p.y + p.h / 2;
  if (camLockY) ty = clamp(levelPixelH() / 2, RT.view.h / 2, Math.max(RT.view.h / 2, levelPixelH() - RT.view.h / 2));
  return { x: tx, y: ty };
}

function clampCamera() {
  var lw = levelPixelW(), lh = levelPixelH();
  var hw = RT.view.w / 2, hh = RT.view.h / 2;
  if (lw <= RT.view.w) cam.x = lw / 2;
  else cam.x = clamp(cam.x, hw, lw - hw);
  if (lh <= RT.view.h) cam.y = lh / 2;
  else cam.y = clamp(cam.y, hh, lh - hh);
}

function updateCamera(dt) {
  var t = cameraTarget();
  if (!camInit) { cam.x = t.x; cam.y = t.y; camInit = true; }

  // horizontal: smooth damping toward the look-ahead point
  var kx = 1 - Math.pow(0.0009, dt);
  cam.x += (t.x - cam.x) * kx;

  // vertical: dead-zone band, faster when falling fast
  if (camLockY) {
    cam.y += (t.y - cam.y) * (1 - Math.pow(0.002, dt));
  } else {
    var band = RT.view.h * 0.13;
    var dy = t.y - cam.y;
    var want = 0;
    if (dy > band) want = dy - band;
    else if (dy < -band) want = dy + band;
    var ky = 1 - Math.pow(player.onGround ? 0.004 : 0.0009, dt);
    cam.y += want * ky;
    if (player.onGround && Math.abs(dy) < band * 1.6) {
      cam.y += (t.y - cam.y) * (1 - Math.pow(0.35, dt));
    }
  }
  clampCamera();
}

/* ==========================================================================
 * 18. HUD / BANNER / TOAST / SPEECH
 * ========================================================================== */

var hudExtras = {};
var bannerTimer = 0, bannerFading = false;
var toastTimer = 0, toastFading = false;
var speeches = [];

RT.hud = {
  set: function (k, text) {
    if (!D.hudExtra || k == null) return;
    var key = String(k);
    var el = hudExtras[key];
    if (!el) {
      el = document.createElement('div');
      el.className = 'hud-chip cash';
      el.setAttribute('data-k', key);
      var lbl = document.createElement('span');
      lbl.className = 'lbl';
      lbl.textContent = key.toUpperCase();
      var val = document.createElement('span');
      val.className = 'val';
      el.appendChild(lbl);
      el.appendChild(val);
      D.hudExtra.appendChild(el);
      hudExtras[key] = el;
    }
    var v = el.lastChild;
    var s = String(text);
    if (v.textContent !== s) v.textContent = s;
  },
  clear: function (k) {
    if (k === undefined) {
      for (var key in hudExtras) {
        if (Object.prototype.hasOwnProperty.call(hudExtras, key)) {
          if (hudExtras[key] && hudExtras[key].parentNode) hudExtras[key].parentNode.removeChild(hudExtras[key]);
        }
      }
      hudExtras = {};
      return;
    }
    var el = hudExtras[String(k)];
    if (el && el.parentNode) el.parentNode.removeChild(el);
    delete hudExtras[String(k)];
  }
};

function updateHud() {
  if (!D.hud) return;
  var showHud = (gameState === 'play' || gameState === 'pause') && !activeMode;
  show(D.hud, showHud);
  if (!showHud) return;
  var lv = RT.level;
  setText(D.hudNum, pad2(RT.levelIndex));
  setText(D.hudName, lv && lv.name ? lv.name : 'TRIAL');
  setText(D.hudDeaths, String(RT.deaths));
  setText(D.hudTime, formatTime(RT.time, false));
  var useCoins = levelHasCoins;
  show(D.hudCoinChip, useCoins);
  if (useCoins) setText(D.hudCoins, String(RT.coins));
  if (D.hudDeathChip) {
    if (RT.deaths >= 20) D.hudDeathChip.classList.add('warn');
    else D.hudDeathChip.classList.remove('warn');
  }
}

RT.banner = function (lines, dur) {
  if (!D.banner) return;
  var arr = (lines instanceof Array) ? lines : [String(lines)];
  while (D.banner.firstChild) D.banner.removeChild(D.banner.firstChild);
  for (var i = 0; i < arr.length; i++) {
    var d = document.createElement('div');
    d.className = 'bline' + (i > 0 ? ' sub2' : '');
    d.textContent = String(arr[i]);
    D.banner.appendChild(d);
  }
  D.banner.classList.remove('out');
  D.banner.hidden = false;
  bannerTimer = dur === undefined ? 2.6 : dur;
  bannerFading = false;
};

RT.toast = function (text, dur) {
  if (!D.toast) return;
  D.toast.textContent = String(text);
  D.toast.classList.remove('out');
  D.toast.hidden = false;
  toastTimer = dur === undefined ? 1.8 : dur;
  toastFading = false;
};

RT.speech = function (x, y, text, dur) {
  speeches.push({ x: x, y: y, text: String(text), t: 0, dur: dur === undefined ? 2.4 : dur });
  if (speeches.length > 8) speeches.shift();
};

function updateOverlaysTimers(dt) {
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0.3 && !bannerFading && D.banner) { D.banner.classList.add('out'); bannerFading = true; }
    if (bannerTimer <= 0 && D.banner) { D.banner.hidden = true; D.banner.classList.remove('out'); }
  }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0.26 && !toastFading && D.toast) { D.toast.classList.add('out'); toastFading = true; }
    if (toastTimer <= 0 && D.toast) { D.toast.hidden = true; D.toast.classList.remove('out'); }
  }
  for (var i = speeches.length - 1; i >= 0; i--) {
    speeches[i].t += dt;
    if (speeches[i].t >= speeches[i].dur) speeches.splice(i, 1);
  }
}

function drawSpeech(g) {
  for (var i = 0; i < speeches.length; i++) {
    var s = speeches[i];
    var k = s.t / s.dur;
    var pop = k < 0.12 ? (k / 0.12) : 1;
    var a = k > 0.86 ? (1 - (k - 0.86) / 0.14) : 1;
    if (a <= 0) continue;
    g.save();
    g.globalAlpha = a;
    g.font = '900 11px ' + FONT_STACK;
    var lines = String(s.text).split('\n');
    var wMax = 0;
    for (var j = 0; j < lines.length; j++) wMax = Math.max(wMax, g.measureText(lines[j]).width);
    var bw = wMax + 16, bh = lines.length * 14 + 12;
    var bx = s.x - bw / 2, by = s.y - bh - 14 - (1 - pop) * 8;
    g.translate(s.x, s.y);
    g.scale(pop, pop);
    g.translate(-s.x, -s.y);
    g.fillStyle = 'rgba(12,16,32,0.92)';
    RTroundRectPath(g, bx, by, bw, bh, 7);
    g.fill();
    g.strokeStyle = 'rgba(61,240,255,0.7)';
    g.lineWidth = 1.5;
    RTroundRectPath(g, bx, by, bw, bh, 7);
    g.stroke();
    g.fillStyle = 'rgba(12,16,32,0.92)';
    g.beginPath();
    g.moveTo(s.x - 6, by + bh - 1);
    g.lineTo(s.x, by + bh + 8);
    g.lineTo(s.x + 6, by + bh - 1);
    g.closePath();
    g.fill();
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#eaf2ff';
    for (var m = 0; m < lines.length; m++) {
      g.fillText(lines[m], s.x, by + 12 + m * 14);
    }
    g.restore();
  }
  g.globalAlpha = 1;
}

/* ==========================================================================
 * 19. ENTITIES
 * ========================================================================== */

var entityDefs = {};
RT.ENTITIES = entityDefs;
RT.entityDefs = entityDefs;

var entities = [];
RT.entities = entities;
var entityId = 1;
var solidEntities = [];
var levelDescriptors = [];

RT.t2p = function (v) { return v * TILE; };
RT.p2t = function (v) { return v / TILE; };

RT.defineEntity = function (type, def) {
  if (!type || typeof type !== 'string') return null;
  def = def || {};
  if (!def.layer) def.layer = 'main';
  entityDefs[type] = def;
  return def;
};

function makeEntity(desc) {
  var type = desc && desc.type;
  var def = entityDefs[type];
  var e = {
    type: type || 'unknown',
    x: 0, y: 0, w: TILE, h: TILE,
    vx: 0, vy: 0,
    dx: 0, dy: 0,
    def: def || null,
    id: entityId++,
    dead: false,
    persistent: false,
    state: 0,
    t: 0,
    layer: (def && def.layer) || 'main',
    solid: (def && def.solid) || false,
    spawnDef: desc
  };
  // copy every authored field (minus the ones we own) onto the instance
  for (var k in desc) {
    if (!Object.prototype.hasOwnProperty.call(desc, k)) continue;
    if (k === 'type' || k === 'x' || k === 'y' || k === 'w' || k === 'h' || k === 'px') continue;
    e[k] = desc[k];
  }
  var inPixels = !!desc.px;
  var mul = inPixels ? 1 : TILE;
  e.x = (desc.x === undefined ? 0 : +desc.x) * mul;
  e.y = (desc.y === undefined ? 0 : +desc.y) * mul;
  e.w = (desc.w === undefined ? 1 : +desc.w) * mul;
  e.h = (desc.h === undefined ? 1 : +desc.h) * mul;
  if (!(e.w > 0)) e.w = TILE;
  if (!(e.h > 0)) e.h = TILE;
  e.x0 = e.x; e.y0 = e.y;
  e.px_ = e.x; e.py_ = e.y;
  return e;
}

RT.spawn = function (desc) {
  if (!desc) return null;
  if (typeof desc === 'string') desc = { type: desc };
  var e = makeEntity(desc);
  if (!e.def) {
    logError('spawn', new Error('unknown entity type "' + e.type + '"'));
  }
  entities.push(e);
  if (e.def) safe('entity.init:' + e.type, e.def.init, e, desc);
  rebuildSolidList();
  return e;
};

RT.remove = function (e) {
  if (!e) return;
  var i = entities.indexOf(e);
  if (i < 0) { e.dead = true; return; }
  if (e.def) safe('entity.onRemove:' + e.type, e.def.onRemove, e);
  e.dead = true;
  entities.splice(i, 1);
  rebuildSolidList();
};

RT.find = function (type) {
  var out = [];
  for (var i = 0; i < entities.length; i++) {
    if (!type || entities[i].type === type) out.push(entities[i]);
  }
  return out;
};
RT.findOne = function (type) {
  for (var i = 0; i < entities.length; i++) if (entities[i].type === type) return entities[i];
  return null;
};

function rebuildSolidList() {
  solidEntities.length = 0;
  for (var i = 0; i < entities.length; i++) {
    if (entities[i].solid && !entities[i].dead) solidEntities.push(entities[i]);
  }
}

function clearEntities() {
  for (var i = entities.length - 1; i >= 0; i--) {
    if (entities[i].def) safe('entity.onRemove:' + entities[i].type, entities[i].def.onRemove, entities[i]);
  }
  entities.length = 0;
  solidEntities.length = 0;
}

function spawnLevelEntities() {
  for (var i = 0; i < levelDescriptors.length; i++) {
    var e = RT.spawn(levelDescriptors[i]);
    if (e) e._descIdx = i;
  }
}

/** Respawn reset: everything one-shot comes back unless e.persistent. */
function resetEntities() {
  var alive = {};
  var i, e;
  for (i = entities.length - 1; i >= 0; i--) {
    e = entities[i];
    if (e.persistent) {
      if (e._descIdx !== undefined) alive[e._descIdx] = true;
      continue;
    }
    if (e.def) safe('entity.onRemove:' + e.type, e.def.onRemove, e);
    entities.splice(i, 1);
  }
  for (i = 0; i < levelDescriptors.length; i++) {
    if (alive[i]) continue;
    var ne = RT.spawn(levelDescriptors[i]);
    if (ne) ne._descIdx = i;
  }
  for (i = 0; i < entities.length; i++) {
    e = entities[i];
    if (e.persistent && e.def) safe('entity.onReset:' + e.type, e.def.onReset, e);
  }
  rebuildSolidList();
}

function updateEntities(dt) {
  var i, e;
  for (i = 0; i < entities.length; i++) {
    e = entities[i];
    e.px_ = e.x; e.py_ = e.y;
  }
  // iterate a snapshot: an update hook may spawn or remove entities
  var list = entities.slice();
  for (i = 0; i < list.length; i++) {
    e = list[i];
    if (e.dead) continue;
    e.t += dt;
    if (e.def) safe('entity.update:' + e.type, e.def.update, e, dt);
  }
  for (i = entities.length - 1; i >= 0; i--) {
    e = entities[i];
    e.dx = e.x - e.px_;
    e.dy = e.y - e.py_;
    if (e.dead) {
      if (e.def) safe('entity.onRemove:' + e.type, e.def.onRemove, e);
      entities.splice(i, 1);
    }
  }
  rebuildSolidList();
}

function entitiesPlayerDeath() {
  for (var i = 0; i < entities.length; i++) {
    if (entities[i].def) safe('entity.onPlayerDeath:' + entities[i].type, entities[i].def.onPlayerDeath, entities[i]);
  }
}

/** Contact callbacks once per step, with the side of the ENTITY that was hit. */
function entityTouches() {
  if (player.dead) return;
  var pb = { x: player.x, y: player.y, w: player.w, h: player.h };
  var list = entities.slice();       // a touch hook may remove entities
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (e.dead || !e.def || typeof e.def.onPlayerTouch !== 'function') continue;
    pb.x = player.x; pb.y = player.y;
    if (!rectsOverlap(pb, e)) continue;
    var side = contactSide(pb, e);
    safe('entity.onPlayerTouch:' + e.type, e.def.onPlayerTouch, e, player, side);
    if (player.dead) return;
  }
}

function contactSide(pb, e) {
  var pcx = pb.x + pb.w / 2, pcy = pb.y + pb.h / 2;
  var ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
  var dxo = (pb.w + e.w) / 2 - Math.abs(pcx - ecx);
  var dyo = (pb.h + e.h) / 2 - Math.abs(pcy - ecy);
  if (pb.x >= e.x && pb.x + pb.w <= e.x + e.w && pb.y >= e.y && pb.y + pb.h <= e.y + e.h) return 'overlap';
  if (dyo < dxo) return pcy < ecy ? 'top' : 'bottom';
  return pcx < ecx ? 'left' : 'right';
}

function drawEntityLayer(g, layer) {
  for (var i = 0; i < entities.length; i++) {
    var e = entities[i];
    if (e.dead) continue;
    if ((e.layer || 'main') !== layer) continue;
    if (e.x + e.w < cam.x - RT.view.w / 2 - 96) continue;
    if (e.x > cam.x + RT.view.w / 2 + 96) continue;
    if (e.y + e.h < cam.y - RT.view.h / 2 - 160) continue;
    if (e.y > cam.y + RT.view.h / 2 + 160) continue;
    if (e.def && e.def.shadow) groundShadow(g, e.x + e.w / 2, e.y + e.h, e.w * 0.6);
    if (e.def && typeof e.def.draw === 'function') {
      g.save();
      safe('entity.draw:' + e.type, e.def.draw, e, g);
      g.restore();
    } else if (!e.def) {
      // a level referenced a type nobody defined: draw a visible placeholder
      g.fillStyle = 'rgba(255,62,165,0.35)';
      g.fillRect(e.x, e.y, e.w, e.h);
      g.strokeStyle = '#ff3ea5';
      g.lineWidth = 1.5;
      g.strokeRect(e.x + 0.75, e.y + 0.75, e.w - 1.5, e.h - 1.5);
    }
  }
}

/** Soft elliptical shadow cast down onto the nearest surface. */
function groundShadow(g, cx, bottomY, w) {
  var ty = Math.floor(bottomY / TILE);
  var tx = Math.floor(cx / TILE);
  var gy = -1;
  for (var i = 0; i < 6; i++) {
    if (tileSolidAt(tx, ty + i) || tileOneWayAt(tx, ty + i)) { gy = (ty + i) * TILE; break; }
  }
  if (gy < 0) return;
  var dist = clamp((gy - bottomY) / (5 * TILE), 0, 1);
  var a = 0.30 * (1 - dist);
  if (a <= 0.02) return;
  var rw = (w / 2) * (1 + dist * 0.6);
  g.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')';
  g.beginPath();
  if (g.ellipse) g.ellipse(cx, gy + 2, rw, rw * 0.32, 0, 0, Math.PI * 2);
  else g.arc(cx, gy + 2, rw * 0.5, 0, Math.PI * 2);
  g.fill();
}
RT.groundShadow = groundShadow;

/* --- solid-entity collision helpers used by the player sweep ------------- */

function solidEntityAt(rect, ignoreOneWay, fromY, movingDown) {
  for (var i = 0; i < solidEntities.length; i++) {
    var e = solidEntities[i];
    if (!rectsOverlap(rect, e)) continue;
    if (e.solid === 'oneway') {
      if (ignoreOneWay) continue;
      if (!movingDown) continue;
      if (fromY > e.y + 6) continue;
    }
    return e;
  }
  return null;
}

/* ==========================================================================
 * 20. PLAYER  (contract section 4, to the number)
 * ========================================================================== */

var player = RT.player = {
  x: 0, y: 0, w: PHYS.W, h: PHYS.H,
  vx: 0, vy: 0,
  onGround: false,
  facing: 1,
  dead: false,
  jumpsLeft: 0,
  abilities: { doubleJump: false, dash: false },
  controlsReversed: false,
  gravityFlip: false,
  shield: false,
  rideEnt: null
};

var coyote = 0, jumpBuffer = 0, jumpCutDone = true, jumping = false;
var deathTimer = 0, shimmer = 0, deathCause = '';
var squash = 1, stretch = 1, animPhase = 0;
var dashTime = 0, dashCool = 0, dashDir = 1;
var spawnPoint = { x: 0, y: 0 };
var checkpoint = null;
var lastGroundVy = 0;
var actionLocked = false;

RT.consumeAction = function () { actionLocked = true; };

RT.setCheckpoint = function (px, py) {
  checkpoint = {
    x: px, y: py,
    tx: Math.floor(px / TILE), ty: Math.floor(py / TILE)
  };
  return checkpoint;
};
RT.getCheckpoint = function () { return checkpoint; };

function playerBox() { return { x: player.x, y: player.y, w: player.w, h: player.h }; }

function boxHitsSolidTiles(b) {
  var x0 = Math.floor(b.x / TILE), x1 = Math.floor((b.x + b.w - 0.001) / TILE);
  var y0 = Math.floor(b.y / TILE), y1 = Math.floor((b.y + b.h - 0.001) / TILE);
  for (var ty = y0; ty <= y1; ty++) {
    for (var tx = x0; tx <= x1; tx++) if (tileSolidAt(tx, ty)) return true;
  }
  return false;
}

function overlapAnyEntity() {
  var pb = playerBox();
  for (var i = 0; i < entities.length; i++) {
    if (entities[i].dead) continue;
    if (rectsOverlap(pb, entities[i])) return true;
  }
  return false;
}

/* --- bonk reactions ------------------------------------------------------- */
function revealInvisible(tx, ty) {
  var d = dynAt(tx, ty, true);
  if (d.revealed) return;
  d.revealed = true;
  sfx('bonk');
  addShake(2.4, 0.12);
  burst(tx * TILE + TILE / 2, ty * TILE + TILE - 2, {
    n: 8, color: '#ffffff', speed: 110, life: 0.35, size: 3, gravity: 500, angle: Math.PI / 2, spread: 1.6
  });
}

function breakBlock(tx, ty, cause) {
  var d = dynAt(tx, ty, true);
  if (d.broken) return false;
  d.broken = true;
  sfx('bonk');
  addShake(3.2, 0.16);
  var T = curTheme;
  burst(tx * TILE + TILE / 2, ty * TILE + TILE / 2, {
    n: 14, colors: [T.tile.side, T.tile.top, T.tile.accent], speed: 190, life: 0.7,
    size: 4, gravity: 900, kind: 'shard'
  });
  RT.emit('break', tx, ty, cause);
  return true;
}
RT.breakBlock = breakBlock;

/* --- axis movement -------------------------------------------------------- */

function moveX(d) {
  var p = player;
  if (d === 0) return;
  p.x += d;
  var y0 = Math.floor(p.y / TILE), y1 = Math.floor((p.y + p.h - 0.001) / TILE);
  var ty, tx;
  if (d > 0) {
    tx = Math.floor((p.x + p.w - 0.001) / TILE);
    for (ty = y0; ty <= y1; ty++) {
      if (tileSolidAt(tx, ty)) {
        if (dashTime > 0 && getTile(tx, ty) === 'B') { breakBlock(tx, ty, 'dash'); continue; }
        p.x = tx * TILE - p.w;
        if (p.vx > 0) p.vx = 0;
        if (dashTime > 0) endDash(true);
        break;
      }
    }
  } else {
    tx = Math.floor(p.x / TILE);
    for (ty = y0; ty <= y1; ty++) {
      if (tileSolidAt(tx, ty)) {
        if (dashTime > 0 && getTile(tx, ty) === 'B') { breakBlock(tx, ty, 'dash'); continue; }
        p.x = (tx + 1) * TILE;
        if (p.vx < 0) p.vx = 0;
        if (dashTime > 0) endDash(true);
        break;
      }
    }
  }
  // solid entities
  for (var i = 0; i < solidEntities.length; i++) {
    var e = solidEntities[i];
    if (e.solid === 'oneway') continue;
    var pb = playerBox();
    if (!rectsOverlap(pb, e)) continue;
    if (d > 0) { p.x = e.x - p.w; if (p.vx > 0) p.vx = 0; }
    else { p.x = e.x + e.w; if (p.vx < 0) p.vx = 0; }
    if (dashTime > 0) endDash(true);
  }
}

function headBlocked(atX, atY) {
  var b = { x: atX, y: atY, w: player.w, h: player.h };
  if (boxHitsSolidTiles(b)) return true;
  for (var i = 0; i < solidEntities.length; i++) {
    if (solidEntities[i].solid === 'oneway') continue;
    if (rectsOverlap(b, solidEntities[i])) return true;
  }
  return false;
}

function moveY(d) {
  var p = player;
  if (d === 0) return;
  var prevBottom = p.y + p.h;
  p.y += d;
  var x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 0.001) / TILE);
  var tx, ty, landed = false, landTy = -1;

  if (d > 0) {
    ty = Math.floor((p.y + p.h - 0.001) / TILE);
    for (tx = x0; tx <= x1; tx++) {
      var solid = tileSolidAt(tx, ty);
      var oneway = !solid && tileOneWayAt(tx, ty) && prevBottom <= ty * TILE + 1.5;
      if (solid || oneway) {
        p.y = ty * TILE - p.h;
        landed = true; landTy = ty;
        break;
      }
    }
    if (!landed) {
      for (var i = 0; i < solidEntities.length; i++) {
        var e = solidEntities[i];
        var pb = playerBox();
        if (!rectsOverlap(pb, e)) continue;
        if (e.solid === 'oneway' && prevBottom > e.y + 6) continue;
        p.y = e.y - p.h;
        landed = true;
        p.rideEnt = e;
        break;
      }
    }
    if (landed) {
      onLand(landTy, x0, x1);
    }
  } else {
    ty = Math.floor(p.y / TILE);
    var blocked = false;
    for (tx = x0; tx <= x1; tx++) {
      if (tileSolidAt(tx, ty)) { blocked = true; break; }
    }
    if (blocked) {
      // corner correction: nudge sideways up to 6 px to slip past a corner
      var freed = false;
      for (var n = 1; n <= PHYS.CORNER && !freed; n++) {
        for (var s = -1; s <= 1 && !freed; s += 2) {
          if (!headBlocked(p.x + s * n, p.y)) { p.x += s * n; freed = true; }
        }
      }
      if (!freed) {
        p.y = (ty + 1) * TILE;
        if (p.vy < 0) p.vy = 0;
        jumpCutDone = true;
        bonkCeiling(x0, x1, ty);
      }
    }
    {
      for (var k = 0; k < solidEntities.length; k++) {
        var e2 = solidEntities[k];
        if (e2.solid === 'oneway') continue;
        if (!rectsOverlap(playerBox(), e2)) continue;
        p.y = e2.y + e2.h;
        if (p.vy < 0) p.vy = 0;
      }
    }
  }
}

function bonkCeiling(x0, x1, ty) {
  sfx('bonk');
  var any = false;
  for (var tx = x0; tx <= x1; tx++) {
    var ch = getTile(tx, ty);
    if (ch === 'I') { revealInvisible(tx, ty); any = true; }
    else if (ch === 'B') { breakBlock(tx, ty, 'head'); any = true; }
  }
  if (!any) {
    addShake(1.6, 0.08);
    burst(player.x + player.w / 2, player.y, {
      n: 4, color: '#ffffff', speed: 70, life: 0.22, size: 2, gravity: 400, angle: -Math.PI / 2, spread: 2.4, alpha: 0.6
    });
  }
  squash = 1.16; stretch = 0.86;
}

function onLand(landTy, x0, x1) {
  var p = player;
  var wasAir = !p.onGround;
  var impact = lastGroundVy;
  p.onGround = true;
  p.rideEnt = p.rideEnt || null;
  if (p.vy > 0) p.vy = 0;
  jumping = false;
  p.jumpsLeft = p.abilities.doubleJump ? 1 : 0;
  dashCool = 0;

  // spring tiles launch on contact
  if (landTy >= 0) {
    for (var tx = x0; tx <= x1; tx++) {
      if (getTile(tx, landTy) === 'S') {
        var d = dynAt(tx, landTy, true);
        d.press = 1;
        p.vy = PHYS.SPRING;
        p.onGround = false;
        jumping = true;
        jumpCutDone = true;
        sfx('spring');
        addShake(4, 0.16);
        burst(tx * TILE + TILE / 2, landTy * TILE + 4, {
          n: 12, colors: ['#ffffff', '#ff8a5a'], speed: 180, life: 0.4, size: 3,
          gravity: 300, angle: -Math.PI / 2, spread: 1.8
        });
        return;
      }
      // standing on a crumble tile arms it
      if (getTile(tx, landTy) === 'K') {
        var dk = dynAt(tx, landTy, true);
        if (dk.state === 0) { dk.state = 1; dk.t = 0; sfx('tick'); }
      }
    }
  }

  if (wasAir && impact > 240) {
    var n = clamp(Math.round(impact / 120), 3, 12);
    burst(p.x + p.w / 2, p.y + p.h, {
      n: n, color: '#ffffff', speed: 100 + impact * 0.1, life: 0.3, size: 3,
      gravity: 220, angle: -Math.PI / 2, spread: 2.8, alpha: 0.65
    });
    squash = 1 + clamp(impact / 2600, 0, 0.28);
    stretch = 1 - clamp(impact / 3200, 0, 0.2);
    sfx('land');
    if (impact > 700) addShake(2.2, 0.1);
  }
}

function endDash(hitWall) {
  if (dashTime <= 0) return;
  dashTime = 0;
  dashCool = PHYS.DASH_COOLDOWN;
  var p = player;
  p.vx = clamp(p.vx, -PHYS.RUN * 1.15, PHYS.RUN * 1.15);
  if (hitWall) {
    burst(p.x + p.w / 2, p.y + p.h / 2, {
      n: 8, color: '#3df0ff', speed: 150, life: 0.3, size: 3, gravity: 200
    });
  }
}

function doJump(vy, kind) {
  var p = player;
  var gdir = p.gravityFlip ? -1 : 1;
  p.vy = vy * gdir;
  p.onGround = false;
  jumping = true;
  jumpCutDone = false;
  coyote = 0;
  jumpBuffer = 0;
  squash = 0.82; stretch = 1.2;
  burst(p.x + p.w / 2, p.y + (gdir > 0 ? p.h : 0), {
    n: kind === 'double' ? 10 : 6, color: kind === 'double' ? '#3df0ff' : '#dbe8ff',
    speed: 110, life: 0.3, size: 3, gravity: 260 * gdir,
    angle: gdir > 0 ? Math.PI / 2 : -Math.PI / 2, spread: 2.2, alpha: 0.75
  });
  sfx(kind === 'double' ? 'doublejump' : 'jump');
  RT.emit('jump', kind || 'ground');
}
RT.playerJump = function (power) { doJump(power === undefined ? PHYS.JUMP : power, 'scripted'); };

/** Bounce used by stomps and springs. */
RT.bounce = function (vy) {
  var p = player;
  p.vy = (vy === undefined ? PHYS.STOMP_BOUNCE : vy) * (p.gravityFlip ? -1 : 1);
  p.onGround = false;
  jumping = true;
  jumpCutDone = true;
  squash = 0.86; stretch = 1.16;
};

function updatePlayer(dt) {
  var p = player;

  if (p.dead) {
    deathTimer -= dt;
    if (deathTimer <= 0) respawn();
    return;
  }
  if (shimmer > 0) shimmer -= dt;

  var gdir = p.gravityFlip ? -1 : 1;
  var il = input.left, ir = input.right;
  if (p.controlsReversed) { var tmp = il; il = ir; ir = tmp; }

  /* ---- noclip (debug) ---- */
  if (RT.noclip) {
    var sp = 300;
    p.vx = (ir ? sp : 0) - (il ? sp : 0);
    p.vy = (input.jump ? -sp : 0) + (input.down ? sp : 0);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.vx) p.facing = sign(p.vx);
    p.onGround = false;
    return;
  }

  /* ---- dash ---- */
  if (dashCool > 0) dashCool -= dt;
  if (dashTime > 0) {
    dashTime -= dt;
    p.vx = dashDir * PHYS.DASH_SPEED;
    p.vy = 0;
    if (dashTime <= 0) endDash(false);
    if ((RT.frame % 2) === 0) {
      burst(p.x + p.w / 2, p.y + p.h / 2, {
        n: 2, color: '#3df0ff', speed: 30, life: 0.28, size: 3.4, gravity: 0, drag: 2, alpha: 0.5, kind: 'circle'
      });
    }
  } else if (p.abilities.dash && input.actionPressed && dashCool <= 0 && !actionLocked && !overlapAnyEntity()) {
    dashDir = p.facing || 1;
    dashTime = PHYS.DASH_TIME;
    p.vx = dashDir * PHYS.DASH_SPEED;
    p.vy = 0;
    sfx('launch');
    addShake(2.6, 0.1);
    RT.emit('dash');
  }

  /* ---- horizontal ---- */
  if (dashTime <= 0) {
    var target = 0;
    if (il && !ir) target = -PHYS.RUN;
    else if (ir && !il) target = PHYS.RUN;
    var acc;
    if (p.onGround) {
      if (target === 0) acc = PHYS.DEC_GROUND;
      else if (sign(p.vx) !== 0 && sign(target) !== sign(p.vx)) acc = PHYS.DEC_GROUND;
      else acc = PHYS.ACC_GROUND;
    } else {
      acc = target === 0 ? 0 : PHYS.ACC_AIR;
    }
    if (acc > 0) p.vx = approach(p.vx, target, acc * dt);
    if (target !== 0) {
      var nf = sign(target);
      if (nf !== p.facing && p.onGround && Math.abs(p.vx) > 90) {
        burst(p.x + p.w / 2, p.y + p.h, {
          n: 5, color: '#ffffff', speed: 90, life: 0.26, size: 2.6, gravity: 200,
          angle: -Math.PI / 2, spread: 1.6, alpha: 0.55
        });
      }
      p.facing = nf;
    }
  }

  /* ---- jump: buffer, coyote, double jump, cut ---- */
  if (input.jumpPressed) jumpBuffer = PHYS.BUFFER;
  else if (jumpBuffer > 0) jumpBuffer--;

  if (p.onGround) coyote = PHYS.COYOTE;
  else if (coyote > 0) coyote--;

  if (jumpBuffer > 0 && dashTime <= 0) {
    if (coyote > 0) {
      doJump(PHYS.JUMP, 'ground');
      p.jumpsLeft = p.abilities.doubleJump ? 1 : 0;
    } else if (p.abilities.doubleJump && p.jumpsLeft > 0) {
      p.jumpsLeft--;
      doJump(PHYS.JUMP * 0.94, 'double');
      ring(p.x + p.w / 2, p.y + p.h / 2, '#3df0ff', 6, 30, 0.34);
    }
  }
  if (input.jumpReleased && !jumpCutDone && (p.vy * gdir) < 0) {
    p.vy *= PHYS.CUT;
    jumpCutDone = true;
  }

  /* ---- gravity ----------------------------------------------------------
   * Leapfrog: half a gravity kick before the move, half after. Plain Euler
   * loses v*dt/2 of arc height per jump, which would leave the contract's
   * "a jump clears 3 tiles" true by one pixel. This integrates the parabola
   * exactly, so a 3-tile wall is genuinely climbable and 4 is genuinely not.
   */
  var gravHalf = 0;
  if (dashTime <= 0) {
    var rising = (p.vy * gdir) < 0;
    var grav = rising ? PHYS.GRAV_UP : PHYS.GRAV_DOWN;
    if (rising && Math.abs(p.vy) < PHYS.APEX_V) grav *= PHYS.APEX_MUL;
    gravHalf = grav * gdir * dt * 0.5;
    p.vy += gravHalf;
    if (p.vy * gdir > PHYS.TERM) p.vy = PHYS.TERM * gdir;
  }

  /* ---- integrate with sub-stepped swept resolution ---- */
  var dx = p.vx * dt, dy = p.vy * dt;
  var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 8));
  var stepDt = dt / steps;
  p.onGround = false;
  p.rideEnt = null;
  lastGroundVy = Math.abs(p.vy);
  for (var i = 0; i < steps; i++) {
    // velocity is re-read every sub-step so springs and bonks take effect at once
    moveX(p.vx * stepDt);
    moveY(p.vy * stepDt);
  }

  // second half of the gravity kick
  if (gravHalf) {
    p.vy += gravHalf;
    if (p.vy * gdir > PHYS.TERM) p.vy = PHYS.TERM * gdir;
  }

  /* ---- ground probe (keeps onGround stable while walking) ---- */
  if (!p.onGround) {
    var probe = { x: p.x, y: p.y + (gdir > 0 ? 1 : -1), w: p.w, h: p.h };
    if (gdir > 0) {
      var ty2 = Math.floor((probe.y + p.h - 0.001) / TILE);
      var x0 = Math.floor(p.x / TILE), x1 = Math.floor((p.x + p.w - 0.001) / TILE);
      for (var tx2 = x0; tx2 <= x1; tx2++) {
        if (tileSolidAt(tx2, ty2) && Math.abs((p.y + p.h) - ty2 * TILE) <= 1.5) { p.onGround = true; break; }
      }
      if (!p.onGround) {
        for (var s2 = 0; s2 < solidEntities.length; s2++) {
          var se = solidEntities[s2];
          if (rectsOverlap(probe, se) && Math.abs((p.y + p.h) - se.y) <= 2.5) {
            p.onGround = true; p.rideEnt = se; break;
          }
        }
      }
    }
  }
  /* ---- animation state ---- */
  animPhase += Math.abs(p.vx) * dt * 0.05;
  squash = lerp(squash, 1, 1 - Math.pow(0.0005, dt));
  stretch = lerp(stretch, 1, 1 - Math.pow(0.0005, dt));
  if (p.onGround && Math.abs(p.vx) > 120 && (RT.frame % 9) === 0) {
    burst(p.x + p.w / 2 - p.facing * 5, p.y + p.h - 1, {
      n: 1, color: '#ffffff', speed: 40, life: 0.24, size: 2.4, gravity: 120,
      angle: -Math.PI / 2, spread: 1.2, alpha: 0.4
    });
    sfx('step');
  }
}

/* --- carrying by solid entities ------------------------------------------ */
function carryPlayer() {
  var p = player;
  if (p.dead) return;
  var e = p.rideEnt;
  if (e && !e.dead) {
    p.x += e.dx;
    p.y += e.dy;
  }
  // moving solids that ran into the player push it out
  for (var i = 0; i < solidEntities.length; i++) {
    var s = solidEntities[i];
    if (s.solid === 'oneway') continue;
    var pb = playerBox();
    if (!rectsOverlap(pb, s)) continue;
    var pcx = pb.x + pb.w / 2, pcy = pb.y + pb.h / 2;
    var scx = s.x + s.w / 2, scy = s.y + s.h / 2;
    var ox = (pb.w + s.w) / 2 - Math.abs(pcx - scx);
    var oy = (pb.h + s.h) / 2 - Math.abs(pcy - scy);
    var beforeX = p.x, beforeY = p.y;
    if (oy <= ox) {
      p.y += (pcy < scy) ? -oy : oy;
      if (boxHitsSolidTiles(playerBox())) { p.y = beforeY; p.x += (pcx < scx) ? -ox : ox; }
      else if (pcy < scy) { p.vy = Math.min(p.vy, 0); p.onGround = true; p.rideEnt = s; }
    } else {
      p.x += (pcx < scx) ? -ox : ox;
      if (boxHitsSolidTiles(playerBox())) { p.x = beforeX; p.y += (pcy < scy) ? -oy : oy; }
    }
    if (boxHitsSolidTiles(playerBox())) { p.x = beforeX; p.y = beforeY; }
  }
}

/* ==========================================================================
 * 21. HAZARDS, PICKUPS, GOAL
 * ========================================================================== */

function spikeRect(ch, tx, ty) {
  var i = PHYS.SPIKE_INSET;
  var x = tx * TILE, y = ty * TILE;
  if (ch === '^') return { x: x + i, y: y, w: TILE - i * 2, h: TILE - i };
  if (ch === 'v') return { x: x + i, y: y + i, w: TILE - i * 2, h: TILE - i };
  if (ch === '<') return { x: x, y: y + i, w: TILE - i, h: TILE - i * 2 };
  return { x: x + i, y: y + i, w: TILE - i, h: TILE - i * 2 };
}

function hazardCheck() {
  var p = player;
  if (p.dead) return;
  if (p.y > tilesH * TILE + 64) { killPlayer('void'); return; }
  if (RT.god) return;
  var i = PHYS.HAZARD_INSET;
  // hb: the forgiving box used for hazards you fall INTO (spikes, lava)
  var hb = { x: p.x + i, y: p.y + i, w: p.w - i * 2, h: p.h - i * 2 };
  // eb: a 1 px contact skin, so a SOLID hazard (X) also kills when you land on it
  var eb = { x: p.x - 1, y: p.y - 1, w: p.w + 2, h: p.h + 2 };
  var x0 = Math.floor(eb.x / TILE), x1 = Math.floor((eb.x + eb.w - 0.001) / TILE);
  var y0 = Math.floor(eb.y / TILE), y1 = Math.floor((eb.y + eb.h - 0.001) / TILE);
  for (var ty = y0; ty <= y1; ty++) {
    for (var tx = x0; tx <= x1; tx++) {
      var ch = getTile(tx, ty);
      if (ch !== 'L' && ch !== 'X' && ch !== '^' && ch !== 'v' && ch !== '<' && ch !== '>') continue;
      var tileRect = { x: tx * TILE, y: ty * TILE, w: TILE, h: TILE };
      if (ch === 'X') {
        if (rectsOverlap(eb, tileRect)) { killPlayer('void block'); return; }
      } else if (ch === 'L') {
        if (rectsOverlap(hb, tileRect)) { killPlayer('lava'); return; }
      } else if (rectsOverlap(hb, spikeRect(ch, tx, ty))) {
        killPlayer('spikes');
        return;
      }
    }
  }
}

function pickupCheck() {
  var p = player;
  if (p.dead) return;
  var pb = playerBox();
  var x0 = Math.floor(pb.x / TILE), x1 = Math.floor((pb.x + pb.w - 0.001) / TILE);
  var y0 = Math.floor(pb.y / TILE), y1 = Math.floor((pb.y + pb.h - 0.001) / TILE);
  for (var ty = y0; ty <= y1; ty++) {
    for (var tx = x0; tx <= x1; tx++) {
      var ch = getTile(tx, ty);
      var key = tx + '|' + ty;
      if (ch === 'o') {
        if (coinTaken[key]) continue;
        var cr = { x: tx * TILE + 8, y: ty * TILE + 8, w: TILE - 16, h: TILE - 16 };
        if (!rectsOverlap(pb, cr)) continue;
        coinTaken[key] = true;
        collectCoin(tx * TILE + TILE / 2, ty * TILE + TILE / 2, 1);
      } else if (ch === 'C') {
        if (checkpoint && checkpoint.tx === tx && checkpoint.ty === ty) continue;
        var already = checkpoint && checkpoint.tx === tx && checkpoint.ty === ty;
        if (already) continue;
        RT.setCheckpoint(tx * TILE + TILE / 2 - PHYS.W / 2, ty * TILE + TILE - PHYS.H);
        sfx('checkpoint');
        RT.toast('CHECKPOINT', 1.2);
        burst(tx * TILE + TILE / 2, ty * TILE, {
          n: 16, colors: ['#5bff9b', '#ffffff'], speed: 160, life: 0.6, size: 3, gravity: 200
        });
        ring(tx * TILE + TILE / 2, ty * TILE + TILE / 2, '#5bff9b', 6, 44, 0.5);
        if (RT.level) safe('level.onCheckpoint', RT.level.onCheckpoint, RT, checkpoint);
        RT.emit('checkpoint', checkpoint);
      } else if (ch === '!') {
        if (onOffCooldown > 0) continue;
        onOffCooldown = 0.4;
        RT.toggleOnOff();
        burst(tx * TILE + TILE / 2, ty * TILE + TILE / 2, {
          n: 10, color: RT.onOff ? '#3df0ff' : '#ff9a3a', speed: 140, life: 0.4, size: 3, gravity: 260
        });
      } else if (ch === 'G') {
        var gr = { x: tx * TILE + 4, y: ty * TILE + 4, w: TILE - 8, h: TILE - 8 };
        if (rectsOverlap(pb, gr)) { winLevel(); return; }
      }
    }
  }
}

function collectCoin(x, y, value) {
  value = value || 1;
  RT.coins += value;
  levelHasCoins = true;
  sfx('coin');
  RT.particles.emit(x, y, 'coin');
  floatText(x, y - 10, '+' + value, '#ffd23f', 0.7);
  if (RT.Tycoon && typeof RT.Tycoon.add === 'function' && RT.Tycoon.active) {
    try { RT.Tycoon.add(value); } catch (e) { logError('Tycoon.add', e); }
  }
  RT.emit('coin', value, x, y);
}
RT.collectCoin = collectCoin;

/* ==========================================================================
 * 22. DEATH & RESPAWN
 * ========================================================================== */

var DEATH_COLORS = {
  spikes: ['#ff4b6e', '#ffffff', '#ff9a3a'],
  lava: ['#ff9a3a', '#ffd23f', '#ff4b1e'],
  void: ['#8a6aff', '#3df0ff', '#ffffff'],
  'void block': ['#ff2a4a', '#8a0a2a', '#ffffff'],
  enemy: ['#ff4b6e', '#ffd23f', '#ffffff']
};

function killPlayer(cause) {
  var p = player;
  if (p.dead) return;
  if (p.shield) {
    p.shield = false;
    sfx('hurt');
    flash('#ffffff', 0.12);
    addShake(4, 0.2);
    RT.hitstop(3);
    ring(p.x + p.w / 2, p.y + p.h / 2, '#ffffff', 8, 52, 0.4);
    RT.toast('SHIELD BROKEN', 1.2);
    return;
  }
  p.dead = true;
  p.vx = 0; p.vy = 0;
  deathCause = cause || 'death';
  deathTimer = 0.55;
  dashTime = 0;
  RT.deaths++;
  save.totalDeaths++;
  if (RT.deaths % 10 === 0) saveNow();

  var colors = DEATH_COLORS[deathCause] || DEATH_COLORS.enemy;
  burst(p.x + p.w / 2, p.y + p.h / 2, {
    n: 44, colors: colors, speed: 320, life: 0.9, size: 4.2, gravity: 700
  });
  burst(p.x + p.w / 2, p.y + p.h / 2, {
    n: 12, colors: ['#ffffff'], speed: 420, life: 0.35, size: 2.6, gravity: 0, kind: 'spark', drag: 2
  });
  ring(p.x + p.w / 2, p.y + p.h / 2, '#ffffff', 6, 78, 0.42);
  addShake(9, 0.32);
  RT.hitstop(4);
  flash(deathCause === 'lava' ? '#ff6a1e' : '#ff2a4a', 0.16);
  sfx(deathCause === 'spikes' ? 'spike' : 'death');

  entitiesPlayerDeath();
  if (RT.level) safe('level.onDeath', RT.level.onDeath, RT, deathCause);
  RT.emit('death', deathCause);
}
RT.killPlayer = killPlayer;

function respawn() {
  var p = player;
  var at = checkpoint || spawnPoint;
  p.x = at.x; p.y = at.y;
  p.vx = 0; p.vy = 0;
  p.dead = false;
  p.onGround = false;
  p.rideEnt = null;
  p.controlsReversed = false;
  p.gravityFlip = false;
  p.facing = 1;
  p.jumpsLeft = p.abilities.doubleJump ? 1 : 0;
  coyote = 0; jumpBuffer = 0; jumpCutDone = true; jumping = false;
  dashTime = 0; dashCool = 0;
  deathTimer = 0;
  shimmer = 0.25;
  squash = 1; stretch = 1;
  resetTileDynamics();
  resetEntities();
  snapCamera();
  burst(p.x + p.w / 2, p.y + p.h / 2, {
    n: 14, colors: ['#3df0ff', '#ffffff'], speed: 150, life: 0.45, size: 3, gravity: 0, drag: 2
  });
  ring(p.x + p.w / 2, p.y + p.h / 2, '#3df0ff', 30, 4, 0.3);
  RT.emit('respawn');
}
RT.respawn = respawn;

/* ==========================================================================
 * 23. PLAYER RENDERING
 * ========================================================================== */

function drawPlayer(g) {
  var p = player;
  if (p.dead) return;
  if (shimmer > 0 && (Math.floor(shimmer * 30) % 2) === 0) return;

  var cx = p.x + p.w / 2;
  var cy = p.y + p.h / 2;
  var sq = squash, st = stretch;
  if (!p.onGround && dashTime <= 0) {
    var v = clamp(p.vy / 700, -1, 1);
    st = lerp(st, 1 + Math.abs(v) * 0.16, 0.6);
    sq = lerp(sq, 1 - Math.abs(v) * 0.12, 0.6);
  }

  groundShadow(g, cx, p.y + p.h, p.w);

  // dash after-image
  if (dashTime > 0) {
    g.globalAlpha = 0.28;
    for (var i = 1; i <= 3; i++) {
      g.fillStyle = '#3df0ff';
      RTroundRectPath(g, p.x - dashDir * i * 8, p.y + 2, p.w, p.h - 2, 6);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  g.save();
  g.translate(cx, p.y + p.h);
  g.scale(sq, st);
  g.translate(-cx, -(p.y + p.h));
  if (p.gravityFlip) {
    g.translate(cx, cy);
    g.scale(1, -1);
    g.translate(-cx, -cy);
  }

  var bodyTop = p.y + 9;
  var bodyH = p.h - 9;

  // legs
  var legPhase = p.onGround ? Math.sin(animPhase * 1.5) : 0.4;
  var legSpread = p.onGround ? legPhase * 4 : 3;
  g.fillStyle = '#1b2440';
  g.fillRect(cx - 7, p.y + p.h - 7 + (p.onGround ? Math.max(0, legSpread) * 0.2 : 0), 5, 7);
  g.fillRect(cx + 2, p.y + p.h - 7 - (p.onGround ? Math.max(0, legSpread) * 0.2 : 0), 5, 7);

  // body
  var grad = g.createLinearGradient(0, bodyTop, 0, p.y + p.h);
  grad.addColorStop(0, '#5ef0ff');
  grad.addColorStop(0.55, '#2ec6f0');
  grad.addColorStop(1, '#1b7fc0');
  g.fillStyle = grad;
  RTroundRectPath(g, p.x + 1, bodyTop, p.w - 2, bodyH - 2, 5);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  RTroundRectPath(g, p.x + 3, bodyTop + 2, p.w - 10, 4, 2);
  g.fill();

  // scarf, blown by motion
  var sw = clamp(Math.abs(p.vx) / PHYS.RUN, 0, 1);
  g.fillStyle = '#ff3ea5';
  g.beginPath();
  g.moveTo(cx - p.facing * 2, bodyTop + 1);
  g.lineTo(cx - p.facing * (6 + sw * 14), bodyTop + 3 + sw * 3);
  g.lineTo(cx - p.facing * (5 + sw * 12), bodyTop + 8 + sw * 2);
  g.lineTo(cx - p.facing * 1, bodyTop + 6);
  g.closePath();
  g.fill();

  // head
  var hr = 7.5;
  var hy = p.y + 7.5;
  g.fillStyle = '#ffe3c2';
  g.beginPath();
  g.arc(cx, hy, hr, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2a1a3a';
  g.beginPath();
  g.arc(cx, hy - 1.5, hr, Math.PI, Math.PI * 2);
  g.fill();
  g.fillRect(cx - hr, hy - 2.5, hr * 2, 2.2);
  // eyes
  g.fillStyle = '#12182c';
  var ex = cx + p.facing * 2.2;
  var blink = (Math.floor(animT() * 1.7) % 7 === 0) && ((animT() * 1.7) % 1 < 0.12);
  if (blink) {
    g.fillRect(ex - 3.4, hy + 1.4, 2.6, 1);
    g.fillRect(ex + 0.6, hy + 1.4, 2.6, 1);
  } else {
    g.fillRect(ex - 3.4, hy + 0.4, 2.2, 2.8);
    g.fillRect(ex + 0.8, hy + 0.4, 2.2, 2.8);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.fillRect(ex - 3.2, hy + 0.6, 0.9, 1);
    g.fillRect(ex + 1, hy + 0.6, 0.9, 1);
  }

  g.restore();

  // shield aura
  if (p.shield) {
    var a = 0.28 + Math.sin(animT() * 6) * 0.12;
    g.strokeStyle = 'rgba(91,255,155,' + a.toFixed(3) + ')';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, p.w * 1.05, 0, Math.PI * 2);
    g.stroke();
  }
  // respawn shimmer ring
  if (shimmer > 0) {
    g.strokeStyle = 'rgba(61,240,255,' + (shimmer / 0.25 * 0.7).toFixed(3) + ')';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(cx, cy, 14 + (1 - shimmer / 0.25) * 16, 0, Math.PI * 2);
    g.stroke();
  }
}

/* ==========================================================================
 * 24. LEVELS
 * ========================================================================== */

var gameState = 'boot';        // boot | menu | select | play | pause | results | end
var levelHasCoins = false;
var levelWon = false;
var baseTheme = DEFAULT_THEME;
var activeMode = null;
var overlayOpen = false, overlayOnClose = null;
var introQueue = [], introTimer = 0;

RT.registerLevel = function (n, def) {
  n = n | 0;
  if (!def || typeof def !== 'object') return null;
  if (n < 1 || n > 99) { logError('registerLevel', new Error('level index out of range: ' + n)); return null; }
  def.index = n;
  if (!def.tiles || !def.tiles.length) {
    logError('registerLevel', new Error('level ' + n + ' has no tiles'));
    return null;
  }
  RT.LEVELS[n] = def;
  return def;
};

function placeholderLevel(n) {
  var rows = [];
  var W = 30, H = 11;
  for (var y = 0; y < H; y++) {
    var s = '';
    for (var x = 0; x < W; x++) {
      if (y === H - 1) s += '#';
      else if (y === H - 2 && x === 2) s += 'P';
      else if (y === H - 2 && x === W - 4) s += 'G';
      else s += '.';
    }
    rows.push(s);
  }
  return {
    index: n,
    name: 'TRIAL ' + pad2(n),
    subtitle: 'not installed yet',
    theme: 'void',
    music: 'void',
    tiles: rows,
    entities: [],
    intro: ['THIS TRIAL IS NOT INSTALLED', 'walk right to continue'],
    placeholder: true
  };
}

function buildTiles(def) {
  var rows = def.tiles || [];
  var w = 0, i;
  for (i = 0; i < rows.length; i++) w = Math.max(w, String(rows[i]).length);
  tilesH = rows.length;
  tilesW = Math.max(1, w);
  tiles = []; baseTiles = [];
  for (var y = 0; y < tilesH; y++) {
    var s = String(rows[y] === undefined ? '' : rows[y]);
    var a = new Array(tilesW), b = new Array(tilesW);
    for (var x = 0; x < tilesW; x++) {
      var ch = s.charAt(x);
      if (!ch || ch === ' ') ch = '.';
      a[x] = ch; b[x] = ch;
    }
    tiles.push(a); baseTiles.push(b);
  }
}

function scanTiles(def) {
  spawnPoint = { x: TILE, y: TILE };
  var found = false;
  var hooked = [];
  for (var y = 0; y < tilesH; y++) {
    for (var x = 0; x < tilesW; x++) {
      var ch = tiles[y][x];
      if (ch === 'P') {
        if (!found) {
          spawnPoint = { x: x * TILE + (TILE - PHYS.W) / 2, y: y * TILE + TILE - PHYS.H };
          found = true;
        }
        continue;
      }
      if (ch === 'o') levelHasCoins = true;
      if (LEGEND[ch]) continue;
      // digits and unknown letters belong to the level's tileHook
      var d = safe('level.tileHook', def.tileHook, ch, x, y);
      tiles[y][x] = '.';
      baseTiles[y][x] = '.';
      if (!d) continue;
      var list = (d instanceof Array) ? d : [d];
      for (var k = 0; k < list.length; k++) {
        var desc = list[k];
        if (!desc || typeof desc !== 'object') continue;
        if (desc.x === undefined) desc.x = x;
        if (desc.y === undefined) desc.y = y;
        hooked.push(desc);
      }
    }
  }
  if (!found) {
    // no P: drop the player on the first open column from the left
    for (var tx = 1; tx < tilesW; tx++) {
      for (var ty = 1; ty < tilesH; ty++) {
        if (tileSolidAt(tx, ty) && !tileSolidAt(tx, ty - 1) && !tileSolidAt(tx, ty - 2)) {
          spawnPoint = { x: tx * TILE + 6, y: (ty - 1) * TILE + TILE - PHYS.H };
          tx = tilesW; break;
        }
      }
    }
  }
  return hooked;
}

function themeForTileX(txf) {
  var zs = RT.level && RT.level.themeZones;
  if (zs && zs.length) {
    for (var i = 0; i < zs.length; i++) {
      var z = zs[i];
      var x0 = z.x0 === undefined ? -1e9 : z.x0;
      var x1 = z.x1 === undefined ? 1e9 : z.x1;
      if (txf >= x0 && txf < x1) return resolveTheme(z.theme);
    }
  }
  return baseTheme;
}

function updateThemeZones(dt) {
  var want = themeForTileX((player.x + player.w / 2) / TILE);
  if (want !== bgA && want !== bgB) {
    bgB = want;
    bgBlend = 0;
  }
  if (bgB && bgB !== bgA) {
    bgBlend += dt / 0.7;
    if (bgBlend >= 0.5 && curTheme !== bgB) {
      curTheme = bgB;
      clearChunks();
    }
    if (bgBlend >= 1) {
      bgA = bgB; bgB = null; bgBlend = 0;
    }
  }
}

function stopActiveModes() {
  if (RT.Tetris && typeof RT.Tetris.stop === 'function') { try { RT.Tetris.stop(); } catch (e) {} }
  if (RT.Tycoon && typeof RT.Tycoon.stop === 'function') { try { RT.Tycoon.stop(); } catch (e) {} }
  activeMode = null;
}

function startLevel(n) {
  n = clamp(n | 0, 1, 99);
  var def = RT.LEVELS[n];
  if (!def) def = placeholderLevel(n);

  stopActiveModes();
  RT.overlay.hide();

  RT.levelIndex = n;
  RT.level = def;
  RT.frame = 0;
  RT.time = 0;
  RT.deaths = 0;
  RT.coins = 0;
  RT.onOff = true;
  RT.groups = {};
  RT.keys = {};
  levelWon = false;
  levelHasCoins = false;
  checkpoint = null;
  camInit = false;
  camLockY = !!def.cameraLockY;
  coinTaken = {};
  resetTileDynamics();
  RT.particles.clear();
  speeches.length = 0;
  RT.hud.clear();
  flashT = 0; shakeTime = 0; shakeX = shakeY = 0; hitstop = 0;
  slowmoFactor = 1; slowmoT = 0;

  player.abilities = { doubleJump: false, dash: false };
  player.controlsReversed = false;
  player.gravityFlip = false;
  player.shield = false;
  player.dead = false;
  player.vx = player.vy = 0;
  player.facing = 1;
  player.rideEnt = null;
  dashTime = 0; dashCool = 0; shimmer = 0; deathTimer = 0;

  buildTiles(def);
  var hooked = scanTiles(def);

  baseTheme = resolveTheme(def.theme);
  curTheme = themeForTileX(spawnPoint.x / TILE);
  bgA = curTheme; bgB = null; bgBlend = 0;
  def.__themeObjs = [];
  if (typeof def.theme === 'object') def.__themeObjs.push(baseTheme);
  if (def.themeZones) {
    for (var z = 0; z < def.themeZones.length; z++) {
      if (typeof def.themeZones[z].theme === 'object') def.__themeObjs.push(resolveTheme(def.themeZones[z].theme));
    }
  }
  clearChunks();
  bgAnchorY = tilesH * TILE * 0.5;

  clearEntities();
  levelDescriptors = [];
  var list = def.entities || [];
  for (var i = 0; i < list.length; i++) levelDescriptors.push(list[i]);
  for (var j = 0; j < hooked.length; j++) levelDescriptors.push(hooked[j]);
  for (var q = 0; q < levelDescriptors.length; q++) {
    if (levelDescriptors[q] && levelDescriptors[q].type === 'coin') levelHasCoins = true;
  }
  spawnLevelEntities();

  player.x = spawnPoint.x;
  player.y = spawnPoint.y;
  player.jumpsLeft = 0;
  snapCamera();

  setScreen('play');
  clearInputHeld();
  lastStamp = 0;
  accumulator = 0;

  safe('level.onLoad', def.onLoad, RT);

  playMusic(def.music);

  var title = [def.name || ('TRIAL ' + pad2(n))];
  if (def.subtitle) title.push(def.subtitle);
  RT.banner(title, 2.6);
  introQueue = (def.intro && def.intro.length) ? def.intro.slice(0) : [];
  introTimer = 2.9;

  RT.emit('levelstart', n, def);
  buildLevelGrid();
  return def;
}
RT.startLevel = startLevel;
RT.restartLevel = function () { startLevel(RT.levelIndex || 1); };

function updateIntro(dt) {
  if (!introQueue.length) return;
  introTimer -= dt;
  if (introTimer <= 0) {
    var line = introQueue.shift();
    RT.banner([line], 2.4);
    introTimer = 2.7;
  }
}

/* ==========================================================================
 * 25. WIN / RESULTS / THE END
 * ========================================================================== */

function gradeFor(deaths, time) {
  if (deaths === 0) return 'S';
  if (deaths <= 2) return 'A';
  if (deaths <= 7) return 'B';
  if (deaths <= 18) return 'C';
  return 'D';
}

var GRADE_LINE = {
  S: 'FLAWLESS. NOBODY DOES THAT.',
  A: 'ALMOST CLEAN. ALMOST.',
  B: 'YOU EARNED THAT ONE.',
  C: 'IT COST YOU, BUT YOU WON.',
  D: 'RAGE ACCEPTED. TRIAL CLEARED.'
};

function winLevel() {
  if (levelWon || gameState !== 'play') return;
  levelWon = true;
  var n = RT.levelIndex;

  sfx('win');
  stopMusic();
  flash('#ffffff', 0.25);
  addShake(5, 0.3);
  for (var i = 0; i < 4; i++) {
    burst(player.x + player.w / 2, player.y + player.h / 2, {
      n: 18, colors: ['#3df0ff', '#ff3ea5', '#ffd23f', '#5bff9b', '#ffffff'],
      speed: 260 + i * 60, life: 1.2, size: 4, gravity: 420, spreadX: 20, spreadY: 20
    });
  }
  ring(player.x + player.w / 2, player.y + player.h / 2, '#ffffff', 8, 120, 0.6);

  var best = save.best[n];
  var isBestTime = !best || RT.time < best.time;
  var isBestDeaths = !best || RT.deaths < best.deaths;
  save.best[n] = {
    time: best ? Math.min(best.time, RT.time) : RT.time,
    deaths: best ? Math.min(best.deaths, RT.deaths) : RT.deaths,
    coins: Math.max(best ? (best.coins || 0) : 0, RT.coins)
  };
  save.totalTime += RT.time;
  if (n + 1 > save.unlocked) save.unlocked = Math.min(LEVEL_COUNT, n + 1);
  saveNow();

  var grade = gradeFor(RT.deaths, RT.time);
  if (D.resRank) {
    D.resRank.textContent = grade;
    D.resRank.className = 'rank r-' + grade;
  }
  setText(D.resTitle, n >= LEVEL_COUNT ? 'FINAL TRIAL CLEAR' : 'TRIAL CLEAR');
  setText(D.resSub, (RT.level && RT.level.name ? RT.level.name + ' - ' : '') + (GRADE_LINE[grade] || ''));
  setText(D.resTime, formatTime(RT.time, true));
  setText(D.resDeaths, String(RT.deaths));
  setText(D.resCoins, String(RT.coins));
  var bestBits = [];
  if (isBestTime) bestBits.push('NEW BEST TIME');
  if (isBestDeaths) bestBits.push('NEW BEST DEATHS');
  setText(D.resBest, bestBits.length ? bestBits.join('  -  ') : ('BEST ' + formatTime(save.best[n].time, true) + '  /  ' + save.best[n].deaths + ' DEATHS'));
  if (D.btnNext) D.btnNext.textContent = (n >= LEVEL_COUNT) ? 'THE END' : 'NEXT TRIAL';

  setScreen('results');
  safe('level.onWin', RT.level && RT.level.onWin, RT);
  RT.emit('win', n);
  buildLevelGrid();
}
RT.winLevel = winLevel;

var RAGE_RATINGS = [
  [0, 'UNSHAKEABLE', 'You did not even flinch. We are concerned.'],
  [10, 'COOL HEADED', 'Barely a sigh. Respect.'],
  [40, 'MILDLY FURIOUS', 'A healthy amount of shouting.'],
  [100, 'CONTROLLER SHAKER', 'That was not the game. That was you.'],
  [250, 'KEYBOARD ENDANGERER', 'Ten trials. One survivor. Several casualties.'],
  [600, 'LEGENDARY RAGE', 'You should be very proud and slightly worried.']
];

function showTheEnd() {
  stopActiveModes();
  var d = save.totalDeaths;
  var pick = RAGE_RATINGS[0];
  for (var i = 0; i < RAGE_RATINGS.length; i++) if (d >= RAGE_RATINGS[i][0]) pick = RAGE_RATINGS[i];
  setText(D.endRating, pick[1]);
  setText(D.endSub, pick[2]);
  if (D.endStats) {
    while (D.endStats.firstChild) D.endStats.removeChild(D.endStats.firstChild);
    var cleared = 0, bestSum = 0;
    for (var n = 1; n <= LEVEL_COUNT; n++) {
      if (save.best[n]) { cleared++; bestSum += save.best[n].time; }
    }
    var stats = [
      ['TRIALS', cleared + '/' + LEVEL_COUNT],
      ['DEATHS', String(save.totalDeaths)],
      ['BEST SUM', formatTime(bestSum, false)]
    ];
    for (var s = 0; s < stats.length; s++) {
      var box = document.createElement('div');
      box.className = 'stat';
      var lab = document.createElement('span');
      lab.textContent = stats[s][0];
      var val = document.createElement('b');
      val.textContent = stats[s][1];
      box.appendChild(lab); box.appendChild(val);
      D.endStats.appendChild(box);
    }
  }
  setScreen('end');
  playMusic('menu');
  RT.emit('theend');
}
RT.showTheEnd = showTheEnd;

/* ==========================================================================
 * 26. SCREENS, MENUS, PAUSE, SETTINGS
 * ========================================================================== */

function coarsePointer() {
  try {
    return !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  } catch (e) { return false; }
}

function applyPadVisibility() {
  var wantPads = save.settings.pads && (touchSeen || coarsePointer()) &&
                 gameState === 'play' && !activeMode && !overlayOpen;
  show(D.pads, wantPads);
  if (!wantPads) {
    padDown.left = padDown.right = padDown.jump = padDown.action = false;
    activePointers = {};
  }
  if (save.settings.lefty) document.body.classList.add('lefty');
  else document.body.classList.remove('lefty');
}

function setScreen(name) {
  gameState = name;
  show(D.menu, name === 'menu');
  show(D.levelSelect, name === 'select');
  show(D.pause, name === 'pause');
  show(D.results, name === 'results');
  show(D.theEnd, name === 'end');
  applyPadVisibility();
  updateHud();
}

function goMenu() {
  stopActiveModes();
  RT.overlay.hide();
  setScreen('menu');
  RT.level = null;
  playMusic('menu');
  updateMenuStats();
}

function goSelect() {
  stopActiveModes();
  RT.overlay.hide();
  buildLevelGrid();
  setScreen('select');
  if (!RT.level) playMusic('menu');
}

function updateMenuStats() {
  var cleared = 0;
  for (var n = 1; n <= LEVEL_COUNT; n++) if (save.best[n]) cleared++;
  setText(D.menuStats, cleared + ' / ' + LEVEL_COUNT + ' CLEARED  -  ' + save.totalDeaths + ' TOTAL DEATHS');
  setText(D.selStats, 'UNLOCKED ' + Math.min(save.unlocked, LEVEL_COUNT) + ' / ' + LEVEL_COUNT +
                      '  -  ' + cleared + ' CLEARED  -  ' + save.totalDeaths + ' DEATHS');
}

function buildLevelGrid() {
  if (!D.levelGrid) return;
  while (D.levelGrid.firstChild) D.levelGrid.removeChild(D.levelGrid.firstChild);
  for (var n = 1; n <= LEVEL_COUNT; n++) {
    (function (n) {
      var def = RT.LEVELS[n];
      var unlocked = n <= save.unlocked;
      var best = save.best[n];
      var card = document.createElement('button');
      card.className = 'lvcard' + (best ? ' done' : '') + (unlocked ? '' : ' locked') + (n >= 9 ? ' boss' : '');
      card.type = 'button';

      var num = document.createElement('div');
      num.className = 'n';
      num.textContent = pad2(n);
      card.appendChild(num);

      var nm = document.createElement('div');
      nm.className = 'nm';
      nm.textContent = unlocked ? (def && def.name ? def.name : 'TRIAL ' + pad2(n)) : 'LOCKED';
      card.appendChild(nm);

      if (unlocked && def && def.subtitle) {
        var tag = document.createElement('div');
        tag.className = 'tagline';
        tag.textContent = def.subtitle;
        card.appendChild(tag);
      }

      var st = document.createElement('div');
      st.className = 'st';
      st.textContent = best ? (formatTime(best.time, false) + '  x' + best.deaths) : (unlocked ? 'NOT CLEARED' : '');
      card.appendChild(st);

      if (!unlocked) {
        var lock = document.createElement('div');
        lock.className = 'lock';
        lock.textContent = '■';
        card.appendChild(lock);
      }

      card.addEventListener('click', function () {
        unlockAudio();
        sfx('ui');
        if (n > save.unlocked) { RT.toast('CLEAR TRIAL ' + pad2(save.unlocked) + ' FIRST', 1.5); return; }
        startLevel(n);
      }, false);
      D.levelGrid.appendChild(card);
    })(n);
  }
  updateMenuStats();
}

function onPausePressed() {
  if (activeMode) {
    if (typeof activeMode.onPause === 'function') safe('mode.onPause', activeMode.onPause);
    return;
  }
  if (gameState === 'play') pauseGame();
  else if (gameState === 'pause') resumeGame();
  else if (gameState === 'select') goMenu();
}

function pauseGame() {
  if (gameState !== 'play') return;
  clearInputHeld();
  saveNow();
  refreshToggles();
  setScreen('pause');
  sfx('ui');
}
RT.pause = pauseGame;

function resumeGame() {
  if (gameState !== 'pause') return;
  setScreen('play');
  lastStamp = 0;
  accumulator = 0;
  sfx('ui');
}
RT.resume = resumeGame;

function refreshToggles() {
  setToggle(D.tgSound, save.settings.sound);
  setToggle(D.tgPads, save.settings.pads);
  setToggle(D.tgLefty, save.settings.lefty);
}
function setToggle(el, on) {
  if (!el) return;
  if (on) el.classList.add('on'); else el.classList.remove('on');
  var b = el.querySelector ? el.querySelector('b') : null;
  if (b) b.textContent = on ? 'ON' : 'OFF';
  el.setAttribute('aria-pressed', on ? 'true' : 'false');
}

/* ==========================================================================
 * 27. DOM OVERLAY (shops, dialogs, how-to-play)
 * ========================================================================== */

RT.overlay = {
  body: null,
  show: function (html, opts) {
    if (!D.overlay || !D.overlayBody) return null;
    D.overlayBody.innerHTML = String(html === undefined ? '' : html);
    D.overlay.hidden = false;
    overlayOpen = true;
    overlayOnClose = (opts && opts.onClose) || null;
    RT.overlay.body = D.overlayBody;
    applyPadVisibility();
    clearInputHeld();
    // any [data-close] element closes the overlay
    var closers = D.overlayBody.querySelectorAll ? D.overlayBody.querySelectorAll('[data-close]') : [];
    for (var i = 0; i < closers.length; i++) {
      closers[i].addEventListener('click', function () { RT.overlay.hide(); }, false);
    }
    sfx('ui');
    return D.overlayBody;
  },
  hide: function () {
    if (!D.overlay) return;
    if (!overlayOpen) { D.overlay.hidden = true; return; }
    D.overlay.hidden = true;
    overlayOpen = false;
    var cb = overlayOnClose;
    overlayOnClose = null;
    applyPadVisibility();
    lastStamp = 0;
    if (cb) safe('overlay.onClose', cb);
  },
  isOpen: function () { return overlayOpen; }
};

var HOW_TO_HTML =
  '<h3>THE TRIALS</h3>' +
  '<p>Ten trials. Each one is beatable. Most of them do not want to be. ' +
  'Die as often as you like - you respawn instantly at the last checkpoint.</p>' +
  '<h3>TOUCH</h3>' +
  '<p>Left and right pads move. The big pad jumps. The star pad is <b>ACTION</b> - ' +
  'it fires flinging machines, buys tycoon upgrades and dashes once you own a dash.</p>' +
  '<h3>KEYBOARD</h3>' +
  '<p><kbd>A</kbd><kbd>D</kbd> or arrows move. <kbd>SPACE</kbd> / <kbd>W</kbd> / <kbd>Z</kbd> jump. ' +
  '<kbd>E</kbd> / <kbd>X</kbd> / <kbd>ENTER</kbd> action. <kbd>R</kbd> retry. <kbd>ESC</kbd> pause.</p>' +
  '<h3>THE RULES OF THE HOUSE</h3>' +
  '<ul>' +
  '<li>A jump clears three blocks of height. Four is a lie.</li>' +
  '<li>Hold jump longer to go higher - tap it for a hop.</li>' +
  '<li>You keep a little coyote time off a ledge, and a jump pressed early still fires.</li>' +
  '<li>Blocks with a dull top and no shine are <b>fake</b>. Look before you leap.</li>' +
  '<li>Cracked planks crumble. Spikes point at what they kill.</li>' +
  '</ul>' +
  '<div style="margin-top:14px"><button class="btn primary" data-close>GOT IT</button></div>';

/* ==========================================================================
 * 28. CANVAS MODES  (Tetris takes the whole screen)
 * ========================================================================== */

RT.setMode = function (mode) {
  activeMode = mode || null;
  clearInputHeld();
  applyPadVisibility();
  updateHud();
  lastStamp = 0;
  accumulator = 0;
  RT.emit('mode', activeMode);
  return activeMode;
};
RT.clearMode = function () {
  activeMode = null;
  clearInputHeld();
  applyPadVisibility();
  updateHud();
  lastStamp = 0;
  accumulator = 0;
  RT.emit('mode', null);
};
RT.getMode = function () { return activeMode; };

/* ==========================================================================
 * 29. THE LOOP
 * ========================================================================== */

var accumulator = 0, lastStamp = 0, rafId = 0, booted = false;

function fixedStep() {
  pollInput();

  if (activeMode) {
    RT.frame++;
    safe('mode.update', activeMode.update, DT);
    updateParticles(DT);
    updateFx(DT);
    updateOverlaysTimers(DT);
    return;
  }

  if (gameState !== 'play' || overlayOpen) {
    updateParticles(DT);
    updateFx(DT);
    updateOverlaysTimers(DT);
    return;
  }

  if (hitstop > 0) {
    hitstop--;
    updateFx(DT);
    updateOverlaysTimers(DT);
    return;
  }

  RT.frame++;
  RT.time += DT;
  actionLocked = false;

  updateTiles(DT);
  updateEntities(DT);
  carryPlayer();
  updatePlayer(DT);
  if (!player.dead) {
    entityTouches();
    hazardCheck();
    if (!player.dead) pickupCheck();
  }
  updateThemeZones(DT);
  updateCamera(DT);
  updateParticles(DT);
  updateFx(DT);
  updateOverlaysTimers(DT);
  updateIntro(DT);
  safe('level.onUpdate', RT.level && RT.level.onUpdate, RT, DT);
}

function drawWorld(g) {
  screenTransform(g);
  drawBackdrop(g);

  worldTransform(g);
  drawEntityLayer(g, 'back');
  if (RT.level && RT.level.onDraw) {
    g.save(); safe('level.onDraw(back)', RT.level.onDraw, RT, g, 'back'); g.restore();
  }
  drawTileLayerStatic(g);
  drawTileLayerDynamic(g);
  drawEntityLayer(g, 'main');
  drawPlayer(g);
  drawParticles(g);
  drawEntityLayer(g, 'front');
  drawSpeech(g);
  if (RT.level && RT.level.onDraw) {
    g.save(); safe('level.onDraw(front)', RT.level.onDraw, RT, g, 'front'); g.restore();
  }

  screenTransform(g);
  var vig = curTheme && curTheme.vignette !== undefined ? curTheme.vignette : 0.3;
  drawVignette(g, vig);
}

function render() {
  if (!ctx || !canvas) return;
  var g = ctx;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = '#05060d';
  g.fillRect(0, 0, canvas.width, canvas.height);

  if (activeMode) {
    screenTransform(g);
    if (typeof activeMode.draw === 'function') {
      g.save();
      safe('mode.draw', activeMode.draw, g, cssW, cssH);
      g.restore();
    }
  } else if (gameState === 'play' || gameState === 'pause' || gameState === 'results') {
    drawWorld(g);
  } else {
    drawMenuScene(g);
  }

  screenTransform(g);
  drawFlash(g);
  updateHud();
}
RT.render = render;

function frameLoop(ts) {
  rafId = window.requestAnimationFrame(frameLoop);
  var now = ts || ((window.performance && window.performance.now) ? window.performance.now() : Date.now());
  if (!lastStamp) lastStamp = now;
  var delta = (now - lastStamp) / 1000;
  lastStamp = now;
  if (!(delta >= 0)) delta = 0;
  if (delta > 0.25) delta = 0.25;

  if (!RT.manual) {
    accumulator += delta * slowmoFactor;
    var steps = 0;
    while (accumulator >= DT && steps < MAX_STEPS) {
      fixedStep();
      accumulator -= DT;
      steps++;
    }
    if (accumulator > DT * MAX_STEPS) accumulator = 0;
  }
  render();
}

/* ==========================================================================
 * 30. UI WIRING
 * ========================================================================== */

function tap(el, fn) {
  if (!el) return;
  el.addEventListener('click', function (e) {
    e.preventDefault();
    unlockAudio();
    safe('ui', fn);
  }, false);
}

function bindUI() {
  tap(D.btnPlay, function () { sfx('ui'); startLevel(clamp(save.unlocked, 1, LEVEL_COUNT)); });
  tap(D.btnLevels, function () { sfx('ui'); goSelect(); });
  tap(D.btnHow, function () { sfx('ui'); RT.overlay.show(HOW_TO_HTML); });
  tap(D.btnBackMenu, function () { sfx('ui'); goMenu(); });

  tap(D.btnPause, function () { onPausePressed(); });
  tap(D.btnResume, function () { resumeGame(); });
  tap(D.btnRestart, function () { sfx('ui'); startLevel(RT.levelIndex || 1); });
  tap(D.btnPauseLevels, function () { sfx('ui'); goSelect(); });
  tap(D.btnPauseMenu, function () { sfx('ui'); goMenu(); });

  tap(D.tgSound, function () {
    save.settings.sound = !save.settings.sound;
    audioEnabled(save.settings.sound);
    saveNow(); refreshToggles();
    if (save.settings.sound) sfx('ui');
  });
  tap(D.tgPads, function () {
    save.settings.pads = !save.settings.pads;
    saveNow(); refreshToggles(); applyPadVisibility(); sfx('ui');
  });
  tap(D.tgLefty, function () {
    save.settings.lefty = !save.settings.lefty;
    saveNow(); refreshToggles(); applyPadVisibility(); sfx('ui');
  });

  tap(D.btnNext, function () {
    sfx('ui');
    var n = RT.levelIndex;
    if (n >= LEVEL_COUNT) showTheEnd();
    else startLevel(n + 1);
  });
  tap(D.btnRetry, function () { sfx('ui'); startLevel(RT.levelIndex || 1); });
  tap(D.btnResLevels, function () { sfx('ui'); goSelect(); });
  tap(D.btnEndLevels, function () { sfx('ui'); goSelect(); });
  tap(D.btnEndMenu, function () { sfx('ui'); goMenu(); });

  tap(D.overlayClose, function () { RT.overlay.hide(); });
  if (D.overlay) {
    D.overlay.addEventListener('click', function (e) {
      if (e.target === D.overlay) RT.overlay.hide();
    }, false);
  }
}

/* ==========================================================================
 * 31. window.__dbg   (always present - the headless tests depend on it)
 * ========================================================================== */

function tycoonCash() {
  if (RT.Tycoon && typeof RT.Tycoon.cash === 'number') return RT.Tycoon.cash;
  if (RT.Tycoon && typeof RT.Tycoon.getCash === 'function') {
    try { return RT.Tycoon.getCash(); } catch (e) { return 0; }
  }
  return 0;
}

var __dbg = {
  errors: errors,

  level: function (n) {
    startLevel(n === undefined ? (RT.levelIndex || 1) : n);
    return __dbg.state();
  },

  state: function () {
    return {
      level: RT.levelIndex,
      x: player.x, y: player.y,
      vx: player.vx, vy: player.vy,
      onGround: !!player.onGround,
      dead: !!player.dead,
      deaths: RT.deaths,
      time: RT.time,
      frame: RT.frame,
      checkpoint: checkpoint ? { x: checkpoint.x, y: checkpoint.y, tx: checkpoint.tx, ty: checkpoint.ty } : null,
      won: !!levelWon,
      mode: activeMode ? (activeMode.name || 'mode') : null,
      coins: RT.coins,
      cash: tycoonCash(),
      state: gameState,
      tx: Math.floor((player.x + player.w / 2) / TILE),
      ty: Math.floor((player.y + player.h / 2) / TILE)
    };
  },

  /** Teleport so the player stands inside tile (tx, ty). */
  tp: function (tx, ty) {
    player.x = tx * TILE + (TILE - player.w) / 2;
    player.y = ty * TILE + (TILE - player.h);
    player.vx = 0; player.vy = 0;
    player.dead = false;
    deathTimer = 0;
    snapCamera();
    return __dbg.state();
  },

  hold: function (o) {
    o = o || {};
    dbgHold.left = !!o.left;
    dbgHold.right = !!o.right;
    dbgHold.jump = !!o.jump;
    dbgHold.action = !!o.action;
    return dbgHold;
  },

  /**
   * Press an input. Held for `steps` fixed steps (default 1, per the route
   * format). Note that a 1-step jump is a real 1-frame tap and therefore gets
   * jump-cut to a ~0.8 tile hop - a route that needs the full 3-tile jump must
   * either hold jump (`{"hold":{"jump":true},"steps":20}`) or pass a count
   * here, e.g. __dbg.tap('jump', 20).
   */
  tap: function (name, steps) {
    if (!name) return;
    if (name === 'pause') { onPausePressed(); return; }
    if (name === 'retry') { if (gameState === 'play' && !player.dead) killPlayer('retry'); return; }
    var n = steps === undefined ? 1 : Math.max(1, steps | 0);
    dbgTap[name] = (dbgTap[name] | 0) + n;
  },

  /** n synchronous fixed steps. No rAF involvement at all. */
  step: function (n) {
    RT.manual = true;
    n = n === undefined ? 1 : (n | 0);
    if (n < 0) n = 0;
    if (n > 200000) n = 200000;
    for (var i = 0; i < n; i++) fixedStep();
    render();
    return __dbg.state();
  },

  resume: function () {
    RT.manual = false;
    lastStamp = 0;
    accumulator = 0;
    return false;
  },

  win: function () { winLevel(); return __dbg.state(); },
  kill: function () { killPlayer('debug'); return __dbg.state(); },
  god: function (b) { RT.god = (b === undefined) ? true : !!b; return RT.god; },
  noclip: function (b) { RT.noclip = (b === undefined) ? true : !!b; return RT.noclip; },

  entities: function () {
    var out = [];
    for (var i = 0; i < entities.length; i++) {
      var e = entities[i];
      out.push({
        id: e.id, type: e.type, x: e.x, y: e.y, w: e.w, h: e.h,
        vx: e.vx, vy: e.vy, dead: !!e.dead, state: e.state,
        solid: e.solid, layer: e.layer, persistent: !!e.persistent
      });
    }
    return out;
  },

  tile: function (tx, ty) { return getTile(tx, ty); },
  setTile: function (tx, ty, ch) { return RT.setTile(tx, ty, ch); },

  giveCash: function (n) {
    n = +n || 0;
    if (RT.Tycoon && typeof RT.Tycoon.add === 'function') {
      try { RT.Tycoon.add(n); return tycoonCash(); } catch (e) { logError('Tycoon.add', e); }
    }
    RT.coins += n;
    return RT.coins;
  },

  tetris: function (level) {
    if (!RT.Tetris || typeof RT.Tetris.start !== 'function') return null;
    try {
      RT.Tetris.start({ level: level === undefined ? 2 : level, linesToWin: 10 });
    } catch (e) { logError('Tetris.start', e); return null; }
    return __dbg.tetrisState();
  },

  tetrisState: function () {
    if (!RT.Tetris) return null;
    try {
      if (typeof RT.Tetris.state === 'function') return RT.Tetris.state();
      if (typeof RT.Tetris.getState === 'function') return RT.Tetris.getState();
      if (RT.Tetris.state) return RT.Tetris.state;
    } catch (e) { logError('Tetris.state', e); }
    return null;
  },

  tetrisInput: function (name) {
    if (!RT.Tetris) return false;
    try {
      if (typeof RT.Tetris.input === 'function') { RT.Tetris.input(name); return true; }
      if (typeof RT.Tetris.press === 'function') { RT.Tetris.press(name); return true; }
      if (typeof RT.Tetris.debugInput === 'function') { RT.Tetris.debugInput(name); return true; }
    } catch (e) { logError('Tetris.input(' + name + ')', e); }
    return false;
  },

  unlockAll: function () { return unlockAll(); },

  /* --- extras that cost nothing and make debugging sane ----------------- */
  theme: function () { return { tiles: curTheme, bgA: bgA && bgA.ambient, blend: bgBlend }; },
  particles: function () { return RT.particles.count(); },
  chunks: function () { return chunkLRU.length; },
  save: function () { return save; },
  menu: function () { goMenu(); return gameState; },
  select: function () { goSelect(); return gameState; },
  clearErrors: function () { errors.length = 0; return 0; }
};
window.__dbg = __dbg;
RT.dbg = __dbg;

/* ==========================================================================
 * 32. BOOT
 * ========================================================================== */

function parseQuery() {
  var q = {};
  var s = '';
  try { s = window.location.search || ''; } catch (e) { s = ''; }
  if (s.charAt(0) === '?') s = s.slice(1);
  if (!s) return q;
  var parts = s.split('&');
  for (var i = 0; i < parts.length; i++) {
    if (!parts[i]) continue;
    var kv = parts[i].split('=');
    var k = decodeURIComponent(kv[0]);
    q[k] = kv.length > 1 ? decodeURIComponent(kv[1]) : '';
  }
  return q;
}

RT.boot = function () {
  if (booted) return RT;
  booted = true;

  grabDom();
  canvas = D.game;
  if (!canvas) { logError('boot', new Error('#game canvas missing')); return RT; }
  try { ctx = canvas.getContext('2d', { alpha: false }); } catch (e) { ctx = null; }
  if (!ctx) ctx = canvas.getContext('2d');
  if (!ctx) { logError('boot', new Error('2d context unavailable')); return RT; }

  loadSave();
  audioEnabled(save.settings.sound);

  bindInput();
  bindUI();
  resize();
  initMenuScene();
  refreshToggles();
  buildLevelGrid();

  var q = parseQuery();
  if (q.unlock !== undefined || q.unlockall !== undefined) {
    save.unlocked = LEVEL_COUNT;
    saveNow();
    buildLevelGrid();
  }
  if (q.noscan !== undefined) document.body.classList.add('noscan');
  if (q.god !== undefined) RT.god = true;

  setScreen('menu');
  updateMenuStats();

  if (q.level !== undefined && q.level !== '') {
    var n = parseInt(q.level, 10);
    if (isFinite(n) && n >= 1) startLevel(n);
    else goMenu();
  } else {
    goMenu();
  }

  rafId = window.requestAnimationFrame(frameLoop);
  RT.emit('boot');
  return RT;
};

/* exports used by other files that follow the contract ------------------- */
RT.getEntities = function () { return entities; };
RT.getTiles = function () { return tiles; };
RT.levelSize = function () { return { w: tilesW, h: tilesH, pw: tilesW * TILE, ph: tilesH * TILE }; };
RT.getState = function () { return gameState; };
RT.getTheme = function () { return curTheme; };
RT.isTouch = function () { return touchSeen || coarsePointer(); };

})(window, document);
